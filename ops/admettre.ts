/**
 * `ops/admettre.ts` — **LE GESTE QUI POSE L'ADMISSION EN BASE.**
 *
 * ═══ CE QUE CE PROGRAMME FAIT, ET DANS CET ORDRE ═══
 *
 *  1. **Il lit les deux documents** — le verrou versionné dans le socle, et
 *     l'instantané épinglé de chaque adaptateur qu'il épingle.
 *  2. **Il fait admettre par le REGISTRE RÉEL** (`enregistrerAdaptateur`), avec
 *     les profils, le sceau et les clés d'autorisation du SOCLE. Aucun contrôle
 *     n'est refait ici : les refaire en ferait une seconde version, et c'est la
 *     seconde qui ne suit jamais.
 *  3. **Il POSE ce que l'admission a produit**, par `DepotDuRegistre`.
 *  4. **Il dit ce qu'il a fait** — des noms et des nombres. Jamais un secret :
 *     `secretRef` est un NOM de ligne d'`ops_secret`, et c'est tout ce qui sort.
 *
 * ═══ POURQUOI CE GESTE EXISTE PLUTÔT QU'UN CÂBLAGE AU DÉMARRAGE ═══
 *
 * Le socle admet déjà ses adaptateurs à chaque démarrage (étage 5) — mais **en
 * mémoire**, dans un processus qui peut n'avoir aucune base. Ce programme est le
 * chemin par lequel une admission atteint Postgres, et il est SÉPARÉ pour trois
 * raisons :
 *
 *  · il exige une `DATABASE_URL` et **refuse en la nommant** quand elle manque,
 *    au lieu de démarrer à moitié ;
 *  · il rend un compte rendu qu'un exploitant lit **avant** de servir quoi que
 *    ce soit — combien d'outils insérés, combien d'orphelins, lesquels ;
 *  · il porte `--activer`, qui est **le geste de la console** (§ 14,
 *    correction 3) tant que la console n'existe pas. Un outil fraîchement admis
 *    n'est PAS servi : c'est le défaut d'insertion, et il est délibéré.
 *
 * ⚠️ **IL N'A PAS DE VARIANTE `:dist`, ET C'EST MOTIVÉ.**
 *    `tsconfig.build.json` n'émet que du `.js` et du `.d.ts` : sous `dist/ops/`,
 *    ni `../core/registry/adapters.lock.json` ni `../adapters/<id>/manifeste.json`
 *    n'existent. Déclarer un script qui ne peut pas trouver ses documents serait
 *    exactement le défaut de l'ADR 0046 — un geste nommé et infaisable.
 *
 * ⚠️ **IL N'APPELLE JAMAIS `process.exit`.** Il rend un code ; l'amorce le pose
 *    dans `process.exitCode`. Un `exit` au milieu d'une écriture couperait le
 *    processus avant que la sortie standard n'ait été vidée.
 */

import {
  DepotDuRegistrePrisma,
  enregistrerAdaptateur,
  lireVerrou,
  versEnregistrementOutil,
} from "../core/registry/index.js";
import type { ClientPrismaDuRegistre, DepotDuRegistre } from "../core/registry/index.js";
import { estLeProgrammeLance } from "./index.js";
import {
  SOURCE_DU_DEPOT,
  contributionDuSocle,
  dossiersDAdaptateurs,
  lireLesAdaptateursEpingles,
  manifestesAAdmettre,
} from "./adaptateurs-epingles.js";
import type { SourceDesAdaptateurs } from "./adaptateurs-epingles.js";

/** La variable qui décide si ce geste a une cible. Nommée dans chaque refus. */
export const VARIABLE_DE_BASE = "DATABASE_URL";

/** Le paquet du client Prisma, importé DYNAMIQUEMENT — voir `ops/vault-init.ts`. */
const PAQUET_DU_CLIENT_PRISMA = "@prisma/client";

/** Le drapeau qui pose `enabled` — le geste de la console, en attendant la console. */
export const DRAPEAU_ACTIVER = "--activer";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que le programme reçoit
// ═════════════════════════════════════════════════════════════════════════════

export interface DependancesDeLAdmission {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly arguments: readonly string[];
  readonly source: SourceDesAdaptateurs;
  /** Les dossiers présents sous `adapters/` — pour l'ANNONCE, pas pour la règle. */
  readonly dossiersPresents: () => readonly string[];
  readonly contributionDuSocle: () => {
    readonly profilsConnus: readonly string[];
    readonly sceauProfils: ReturnType<typeof contributionDuSocle>["sceauProfils"];
    readonly clesDAutorisation: readonly string[];
  };
  /** Le dépôt, ou `null` quand aucune base n'est joignable. */
  readonly ouvrirLeDepot: () => Promise<DepotDuRegistre | null>;
  readonly ecrire: (ligne: string) => void;
  readonly ecrireErreur: (ligne: string) => void;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le programme
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Exécute l'admission. Rend un code de sortie : `0` posé, `1` refusé.
 *
 * ⚠️ **UN REFUS D'ADMISSION N'EST PAS UNE PANNE DU PROGRAMME**, mais il rend `1`
 *    quand même : un exploitant qui enchaîne ce geste dans un script doit voir
 *    l'échec, et un adaptateur non admis veut dire un socle qui ne servira rien.
 */
export async function executerLAdmission(deps: DependancesDeLAdmission): Promise<number> {
  const dire = (ligne: string): void => {
    deps.ecrire(`[admettre] ${ligne}`);
  };
  const refuser = (ligne: string): number => {
    deps.ecrireErreur(`[admettre] REFUS — ${ligne}`);
    return 1;
  };

  const activer = deps.arguments.includes(DRAPEAU_ACTIVER);

  // ── LES DEUX DOCUMENTS ─────────────────────────────────────────────────────
  const lecture = lireLesAdaptateursEpingles(deps.source);
  const dossiers = deps.dossiersPresents();
  dire(
    `${String(dossiers.length)} dossier(s) sous adapters/ [${dossiers.join(", ") || "aucun"}] · ` +
      `verrou ${lecture.verrouPresent ? "présent" : "ABSENT"} · ` +
      `${String(lecture.epingles.length)} épinglé(s) [${lecture.epingles.join(", ") || "aucun"}] · ` +
      `${String(lecture.adaptateurs.length)} instantané(s) trouvé(s)`,
  );

  if (!lecture.verrouPresent) {
    return refuser(
      "`core/registry/adapters.lock.json` est ABSENT. Le socle ne peut dire d'AUCUN outil " +
        "qu'il est épinglé, et servir un catalogue non épinglé reviendrait à accepter une " +
        "mise à jour silencieuse (§ 20).",
    );
  }
  if (lecture.sansInstantane.length > 0) {
    return refuser(
      `${String(lecture.sansInstantane.length)} entrée(s) de verrou sans instantané lisible ` +
        `[${lecture.sansInstantane.join(", ")}] — attendu ` +
        "`adapters/<id>/manifeste.json` portant `{ manifestSha, manifeste }`. Sans le " +
        "manifeste, il n'y a rien à confronter à l'empreinte.",
    );
  }

  const verrou = lireVerrou(lecture.verrouBrut);
  if (verrou.verrou === null) {
    return refuser(
      `le verrou est illisible ou incohérent — ${String(verrou.verdict.anomalies.length)} ` +
        `anomalie(s) : ${verrou.verdict.anomalies.join(" | ")}`,
    );
  }
  if (lecture.adaptateurs.length === 0) {
    return refuser(
      "aucun adaptateur à admettre. Un geste qui ne pose rien et rend zéro se lirait comme " +
        "un geste réussi.",
    );
  }

  // ── LE REGISTRE RÉEL ───────────────────────────────────────────────────────
  const socle = deps.contributionDuSocle();
  const aAdmettre = manifestesAAdmettre(lecture, socle);
  const admis: {
    readonly id: string;
    readonly resultat: ReturnType<typeof enregistrerAdaptateur>;
  }[] = [];
  let refuses = 0;

  for (const [rang, manifeste] of aAdmettre.entries()) {
    const id = lecture.adaptateurs[rang]?.id ?? "?";
    const resultat = enregistrerAdaptateur({ ...manifeste, verrou: verrou.verrou });
    if (!resultat.admis) {
      refuses += 1;
      for (const refus of resultat.refus) {
        deps.ecrireErreur(`[admettre] « ${id} » refusé — ${refus.motif} : ${refus.detail}`);
      }
      continue;
    }
    // ⚠️ LES GARDES ANNONCÉES SORTENT MÊME QUAND TOUT PASSE (ADR 0015, G2) :
    //    un exploitant qui corrige au tour suivant paye un cycle de build dans
    //    un autre dépôt.
    for (const annonce of resultat.annonces) {
      dire(
        `« ${id} » · garde « ${annonce.nom} » : ${annonce.verdict.anomalies.join(" | ") || "rien à signaler"}`,
      );
    }
    admis.push({ id, resultat });
  }

  if (refuses > 0) {
    return refuser(
      `${String(refuses)} adaptateur(s) refusé(s) sur ${String(aAdmettre.length)} — rien n'a ` +
        "été écrit. L'admission est tout ou rien : un registre à moitié posé servirait un " +
        "catalogue que personne n'a relu.",
    );
  }

  // ── LA BASE ────────────────────────────────────────────────────────────────
  const url = deps.env[VARIABLE_DE_BASE];
  if (url === undefined || url.trim().length === 0) {
    return refuser(
      `\`${VARIABLE_DE_BASE}\` n'est pas fournie : ce geste écrit en base, il n'a pas de ` +
        "cible. Les adaptateurs sont pourtant ADMIS — le refus porte sur l'écriture, pas sur " +
        "le verrou.",
    );
  }

  const depot = await deps.ouvrirLeDepot();
  if (depot === null) {
    return refuser(
      `\`${VARIABLE_DE_BASE}\` est fournie mais le client Prisma n'a pas pu être chargé. ` +
        "Lancer `pnpm prisma:generate`, puis `pnpm db:deploy` si les tables n'existent pas.",
    );
  }

  let outilsPoses = 0;
  let outilsActives = 0;
  for (const { id, resultat } of admis) {
    if (!resultat.admis) continue;
    const ecriture = await depot.ecrireAdmission(
      resultat.adaptateur,
      resultat.outils.map(versEnregistrementOutil),
    );
    outilsPoses += ecriture.outilsInseres + ecriture.outilsMisAJour;
    dire(
      `« ${id} » posé · adaptateur ${ecriture.adaptateurDejaPresent ? "mis à jour" : "inséré"} · ` +
        `${String(ecriture.outilsInseres)} outil(s) inséré(s), ` +
        `${String(ecriture.outilsMisAJour)} mis à jour (réglages de console conservés) · ` +
        `${String(ecriture.outilsOrphelins.length)} orphelin(s) ` +
        `[${ecriture.outilsOrphelins.join(", ") || "aucun"}]`,
    );
    if (ecriture.outilsOrphelins.length > 0) {
      dire(
        "⚠️ un orphelin n'est ni supprimé ni désactivé (§ 13.4, § 20). Il a disparu du " +
          "manifeste : la décision se prend à la ré-épingle, avec la liste sous les yeux.",
      );
    }

    if (activer) {
      for (const outil of resultat.outils) {
        outilsActives += await depot.basculerActivation(outil.name, outil.version, true);
      }
    }
  }

  dire(
    `${String(admis.length)} adaptateur(s) admis · ${String(outilsPoses)} ligne(s) ops_tool ` +
      `posée(s) · ${String(outilsActives)} activée(s)`,
  );
  if (!activer) {
    dire(
      `aucune activation : un outil fraîchement admis n'est PAS servi (§ 14, correction 3). ` +
        `Relancer avec \`${DRAPEAU_ACTIVER}\` pour poser \`enabled\`.`,
    );
  }
  return 0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENTRÉE — la seule chose de ce fichier qui touche `process`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Charge le client Prisma **à la demande**, et rend `null` sur tout échec.
 * Même motif qu'`ops/vault-init.ts` : `@prisma/client` ré-exporte un module qui
 * n'existe pas tant que `prisma generate` n'a pas tourné, et un import statique
 * ferait échouer `pnpm typecheck` en intégration continue.
 */
async function chargerLeDepotPrisma(
  env: Readonly<Record<string, string | undefined>>,
): Promise<DepotDuRegistre | null> {
  if (env[VARIABLE_DE_BASE] === undefined || env[VARIABLE_DE_BASE] === "") return null;

  const specifieur: string = PAQUET_DU_CLIENT_PRISMA;
  let charge: unknown;
  try {
    charge = (await import(specifieur)) as unknown;
  } catch {
    return null;
  }
  if (typeof charge !== "object" || charge === null) return null;

  const fabrique = (charge as Record<string, unknown>)["PrismaClient"];
  if (typeof fabrique !== "function") return null;

  const Constructeur = fabrique as new () => ClientPrismaDuRegistre;
  return new DepotDuRegistrePrisma(new Constructeur());
}

if (estLeProgrammeLance(import.meta.url, process.argv)) {
  executerLAdmission({
    env: process.env,
    arguments: process.argv.slice(2),
    source: SOURCE_DU_DEPOT,
    dossiersPresents: dossiersDAdaptateurs,
    contributionDuSocle,
    ouvrirLeDepot: () => chargerLeDepotPrisma(process.env),
    ecrire: (ligne) => {
      process.stdout.write(`${ligne}\n`);
    },
    ecrireErreur: (ligne) => {
      process.stderr.write(`${ligne}\n`);
    },
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((erreur: unknown) => {
      process.exitCode = 1;
      process.stderr.write(
        `[admettre] ${erreur instanceof Error ? erreur.message : String(erreur)}\n`,
      );
    });
}
