/**
 * `ops/vault-init.ts` — **LE GESTE QUE LE SOCLE NOMMAIT SANS QU'IL EXISTE.**
 *
 * ═══ LE FAIT, MESURÉ ═══
 *
 * `core/vault/demarrage.ts` exporte `COMMANDE_DE_PROVISION = "pnpm
 * ops:vault:init"`. Le socle **refuse de démarrer** sur un coffre absent en
 * nommant cette commande, mot pour mot, dans son message de refus — c'est le
 * § 25 qui l'exige : « Le socle refuse de démarrer → Coffre absent. LE MESSAGE
 * NOMME LA COMMANDE. »
 *
 * Et `package.json` ne déclarait **aucun script de ce nom**. La commande tapée
 * rendait `command not found`. Le commentaire de `demarrage.ts` le disait
 * lui-même — « ⚠️ Ce script n'existe PAS encore » — et personne ne le lisait au
 * moment où il aurait servi : au milieu d'un incident.
 *
 * ⚠️ **UN MESSAGE QUI NOMME UN GESTE INTROUVABLE EST PIRE QU'UN MESSAGE
 *    VAGUE.** Un message vague fait chercher ; un message précis et faux fait
 *    chercher **au mauvais endroit**, avec confiance, pendant que le socle est
 *    à terre. C'est la raison d'être de ce fichier, et de la garde
 *    `verifierLesCommandesNommees` (`ops/gestes-nommes.ts`) qui confronte
 *    désormais CHAQUE commande nommée dans un message aux scripts réellement
 *    déclarés.
 *
 * ═══ CE QUE CE PROGRAMME FAIT, ET DANS CET ORDRE ═══
 *
 *  1. **Il constate l'état du coffre AVANT tout geste** et **refuse si le
 *     coffre existe déjà.** C'est le premier contrôle, avant même celui de la
 *     clé : un provisionnement par-dessus un coffre existant poserait un sceau
 *     neuf sur des lignes qu'aucune clé n'ouvre plus, et le remède serait une
 *     restauration. `Coffre.provisionner()` refuse déjà par sa table de
 *     transitions ; ce programme refuse **avant**, pour que le message parle du
 *     coffre et non d'un geste interdit.
 *  2. **Il vérifie qu'une clé est fournie**, et refuse en NOMMANT la variable
 *     si elle ne l'est pas.
 *  3. **Il pose le sceau.**
 *  4. **Il dit ce qu'il a fait** — la source, l'état avant, l'état après, le
 *     `keyId`. Des noms et des états, jamais une valeur.
 *
 * ⚠️ **IL NE GÉNÈRE PAS LA CLÉ, ET C'EST UNE DÉCISION, PAS UN MANQUE.** Le § 25
 *    exige que la clé soit **SÉQUESTRÉE hors machine AVANT** d'être posée — sur
 *    le modèle déjà en service, « seule la clé PUBLIQUE est sur le VPS, la clé
 *    privée reste HORS système ». Un outil qui la génère invite à sauter le
 *    séquestre : la clé naît dans le terminal, le coffre s'ouvre, tout marche —
 *    et la sauvegarde hors machine est indéchiffrable **le seul jour où elle
 *    sert**. Ce programme dit donc COMMENT en produire une, et refuse tant
 *    qu'elle n'est pas là. Une garde de `ops/vault-init.spec.ts` vérifie
 *    qu'aucune génération d'aléa n'entre jamais dans ce fichier.
 *
 * ⚠️ **AUCUNE VALEUR DE CLÉ NE SORT D'ICI.** Le rapport porte le `keyId` — un
 *    SHA-256 tronqué, qui ne s'inverse pas — et le NOM de la source. Jamais le
 *    matériau. Ce dépôt est PUBLIC, et la sortie d'un provisionnement se colle
 *    dans un ticket.
 *
 * Voir **ADR 0046**, § 23, § 25.
 */

import type { DepotDeSecrets, EtatCoffre, SourceDeCle } from "../core/vault/index.js";
import {
  Coffre,
  DepotEnMemoire,
  VARIABLES_DE_CLE,
  depuisEnvironnement,
  effacerTrousseau,
} from "../core/vault/index.js";
import { COMMANDE_DE_PROVISION } from "../core/vault/demarrage.js";
import type { ClientPrismaDuCoffre } from "../core/vault/depot.js";
import { DepotPrisma } from "../core/vault/depot.js";
import { estErreurDeCoffre } from "../core/vault/erreurs.js";
import { estLeProgrammeLance } from "./index.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROGRAMME PEUT REFUSER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS FAÇONS DONT UN PROVISIONNEMENT S'ARRÊTE, ET ELLES SONT NOMMÉES.
 *
 * ⚠️ **UN CODE DE SORTIE SEUL NE DIT PAS LEQUEL DES TROIS.** « 1 » se lit
 *    « ça n'a pas marché » ; `coffre-déjà-créé` se lit « surtout ne recommence
 *    pas ». Les deux situations appellent des gestes OPPOSÉS — l'une demande de
 *    poser une clé, l'autre INTERDIT de poser quoi que ce soit — et les
 *    confondre au milieu d'un incident coûte une base.
 */
export const REFUS_DE_PROVISION = [
  /** Le sceau existe déjà. On ne provisionne JAMAIS par-dessus. */
  "coffre-déjà-créé",
  /** Aucune clé n'a été présentée. Le programme n'en fabrique pas. */
  "clé-absente",
  /** La pose a été tentée et a échoué — dépôt injoignable, clé mal formée. */
  "sceau-non-posé",
] as const;

export type RefusDeProvision = (typeof REFUS_DE_PROVISION)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROGRAMME REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le rapport d'un provisionnement. **Des états et des noms, jamais une
 * couleur** — et jamais une valeur de clé.
 */
export interface RapportDeProvision {
  /** Le nom de la source de clé, tel que l'écran Santé l'affiche. */
  readonly source: string;
  /** Une clé a-t-elle été PRÉSENTÉE ? Distinct de « le sceau est posé ». */
  readonly cleFournie: boolean;
  /** L'état constaté AVANT tout geste. C'est lui qui décide du refus n° 1. */
  readonly etatAvant: EtatCoffre;
  /** L'état après. Égal à `etatAvant` quand le programme a refusé. */
  readonly etatApres: EtatCoffre;
  /** Le sceau a-t-il été écrit ? DÉRIVÉ du couple d'états, jamais déclaré. */
  readonly sceauPose: boolean;
  /** L'identifiant public de la clé — SHA-256 tronqué. `null` si rien n'est posé. */
  readonly keyId: string | null;
  /** Le geste a-t-il porté sur un dépôt JETABLE, en mémoire ? (voir plus bas) */
  readonly repetition: boolean;
  /** `null` quand le sceau est posé. */
  readonly refus: RefusDeProvision | null;
  /** Ce qu'il a fait, ou pourquoi il n'a rien fait. Des phrases, pour un humain. */
  readonly lignes: readonly string[];
}

/** Ce dont le provisionnement a besoin. Aucun `process`, aucune variable globale. */
export interface DemandeDeProvision {
  readonly depot: DepotDeSecrets;
  readonly source: SourceDeCle;
  /** `true` quand le dépôt est jetable : le rapport le DIT au lieu de le taire. */
  readonly repetition?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PROVISIONNEMENT — UNE FONCTION PURE DE SES PORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POSE LE SCEAU DU COFFRE, UNE FOIS PAR VIE DE BASE.
 *
 * ⚠️ **L'ORDRE DES DEUX CONTRÔLES EST LA DÉCISION.** L'état d'abord, la clé
 *    ensuite. L'inverse donnerait, sur un coffre déjà créé dont la clé a été
 *    oubliée, le message « pose une clé » — c'est-à-dire l'invitation exacte à
 *    provisionner par-dessus.
 */
export async function provisionnerLeCoffre(
  demande: DemandeDeProvision,
): Promise<RapportDeProvision> {
  const repetition = demande.repetition ?? false;
  const coffre = await Coffre.ouvrir({ depot: demande.depot, source: demande.source });
  const etatAvant = coffre.etat();
  const lignes: string[] = [
    `Source de clé : « ${demande.source.nom} ». État du coffre avant tout geste : ${etatAvant}.`,
  ];

  // ── 1 · NE JAMAIS ÉCRASER UN COFFRE ──────────────────────────────────────
  if (etatAvant !== "absent") {
    lignes.push(
      `REFUS : un sceau est DÉJÀ en base (état « ${etatAvant} »). Provisionner par-dessus ` +
        "poserait un sceau neuf sur des lignes qu'aucune clé n'ouvrirait plus, et le seul " +
        "remède serait une restauration. Ne pas recommencer.",
      etatAvant === "verrouillé"
        ? "Le coffre existe et attend sa clé : le déverrouiller depuis la console " +
            "(écran Déverrouillage), qui répond aussi depuis un téléphone — jamais depuis un " +
            "terminal, et jamais par ce programme."
        : "Le coffre est déjà ouvert : il n'y a rien à faire.",
    );
    return {
      source: demande.source.nom,
      cleFournie: etatAvant === "ouvert",
      etatAvant,
      etatApres: etatAvant,
      sceauPose: false,
      keyId: coffre.sante().keyIdPrincipal,
      repetition,
      refus: "coffre-déjà-créé",
      lignes,
    };
  }

  // ── 2 · UNE CLÉ DOIT ÊTRE FOURNIE, ET CE PROGRAMME N'EN FABRIQUE PAS ─────
  const presentation = await demande.source.fournir();
  const cleFournie = presentation !== null;
  if (presentation !== null) {
    // La clé est relue par le coffre lui-même juste après ; celle-ci n'a servi
    // qu'à répondre « oui ou non ». On l'écrase plutôt que de la laisser vivre.
    effacerTrousseau(presentation);
  }

  if (!cleFournie) {
    lignes.push(
      `REFUS : la source « ${demande.source.nom} » n'a présenté AUCUNE clé. ` +
        `Poser ${VARIABLES_DE_CLE.cle} (32 octets encodés en base64), puis relancer ` +
        `« ${COMMANDE_DE_PROVISION} ».`,
      "⚠️ SÉQUESTRER LA CLÉ HORS MACHINE AVANT DE LA POSER (§ 25). Ce programme n'en " +
        "génère aucune, et c'est délibéré : un outil qui la fabrique invite à sauter le " +
        "séquestre, et la sauvegarde hors machine devient indéchiffrable le seul jour où " +
        "elle sert. En produire une, hors de ce programme : openssl rand -base64 32",
    );
    return {
      source: demande.source.nom,
      cleFournie: false,
      etatAvant,
      etatApres: etatAvant,
      sceauPose: false,
      keyId: null,
      repetition,
      refus: "clé-absente",
      lignes,
    };
  }

  // ── 3 · POSER LE SCEAU ───────────────────────────────────────────────────
  let etatApres: EtatCoffre;
  try {
    etatApres = await coffre.provisionner();
  } catch (erreur: unknown) {
    const motif = estErreurDeCoffre(erreur)
      ? `${erreur.raison} — ${erreur.message}`
      : erreur instanceof Error
        ? erreur.message
        : String(erreur);
    lignes.push(
      `REFUS : la pose du sceau a échoué. ${motif}`,
      "Aucun sceau n'a été écrit : le coffre reste absent, et relancer après correction " +
        "est sans danger.",
    );
    return {
      source: demande.source.nom,
      cleFournie: true,
      etatAvant,
      etatApres: coffre.etat(),
      sceauPose: false,
      keyId: null,
      repetition,
      refus: "sceau-non-posé",
      lignes,
    };
  }

  // ── 4 · DIRE CE QU'IL A FAIT ─────────────────────────────────────────────
  const sante = coffre.sante();
  lignes.push(
    `Sceau POSÉ. État du coffre : ${etatAvant} → ${etatApres}. ` +
      `Clé « ${sante.keyIdPrincipal ?? "sans identifiant"} » (identifiant public, dérivé du ` +
      "matériau par SHA-256 tronqué — il ne dit rien de la clé).",
    sante.ouvreAuDemarrage
      ? "La source rouvre le coffre AU DÉMARRAGE : le socle démarrera nominal tant que la " +
          `variable ${VARIABLES_DE_CLE.cle} reste posée.`
      : "La source NE rouvre PAS le coffre au démarrage : chaque redémarrage le laissera " +
          "verrouillé, et le socle démarrera quand même (§ 23) — déverrouiller depuis la console.",
    "⚠️ VÉRIFIER MAINTENANT, PAS PLUS TARD : la clé est-elle séquestrée hors machine ? " +
      "Un coffre posé dont la clé n'existe qu'ici est une base perdue au premier incident.",
  );

  return {
    source: demande.source.nom,
    cleFournie: true,
    etatAvant,
    etatApres,
    // DÉRIVÉ du couple d'états, jamais déclaré : un booléen écrit à la main
    // serait vrai le jour où la pose échoue en silence.
    sceauPose: etatAvant === "absent" && etatApres === "ouvert",
    keyId: sante.keyIdPrincipal,
    repetition,
    refus: null,
    lignes,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉPÔT : CELUI DE LA BASE, OU UN DÉPÔT JETABLE POUR RÉPÉTER LE GESTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'argument qui fait tourner le geste **à blanc**, sur un dépôt en mémoire.
 *
 * ⚠️ **CE N'EST PAS UN CONFORT DE DÉVELOPPEMENT, C'EST LE SEUL MODE QUE CE
 *    DÉPÔT PEUT EXÉCUTER AUJOURD'HUI**, et il répond à la question qui coûte le
 *    plus cher : « ma clé est-elle bien formée ? ». Elle se pose AVANT de
 *    toucher la base, pas pendant l'incident. Le rapport porte `repetition:
 *    true` pour que personne ne lise « sceau posé » comme « sceau posé EN
 *    BASE ».
 */
export const ARGUMENT_DE_REPETITION = "--repetition";

/** Le nom du paquet du client Prisma. Chargé à la demande — voir plus bas. */
export const PAQUET_DU_CLIENT_PRISMA = "@prisma/client";

/** La variable qui porte l'adresse de la base. Un NOM, jamais une valeur. */
export const VARIABLE_DE_BASE = "DATABASE_URL";

/**
 * Ce que le programme écrit et lit du monde extérieur. Passé en paramètre pour
 * que la garde puisse le monter sans `process`, sans base et sans disque.
 */
export interface MondeDuProvisionnement {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly arguments: readonly string[];
  readonly ecrire: (ligne: string) => void;
  readonly ecrireErreur: (ligne: string) => void;
  /**
   * Ouvre le dépôt de la BASE. Rend `null` — et n'explose pas — quand aucun
   * chemin reproductible n'existe : le client n'est pas généré, ou la variable
   * d'adresse manque.
   */
  readonly ouvrirLeDepotDeLaBase: () => Promise<DepotDeSecrets | null>;
}

/**
 * LE PROGRAMME. Rend un code de sortie ; n'appelle jamais `process.exit`.
 *
 * ⚠️ **LE CODE DE SORTIE N'EST PAS LA SEULE CHOSE QUI SORT.** Chaque ligne du
 *    rapport est écrite, refus compris, et le refus est NOMMÉ. Un programme
 *    d'exploitation qui sortirait en 1 sans dire lequel des trois refus a
 *    mordu obligerait à relire son code au pire moment.
 */
export async function executerLeProvisionnement(monde: MondeDuProvisionnement): Promise<number> {
  const repetition = monde.arguments.includes(ARGUMENT_DE_REPETITION);
  const source = depuisEnvironnement(monde.env);

  let depot: DepotDeSecrets;
  if (repetition) {
    depot = new DepotEnMemoire();
    monde.ecrire(
      `[vault:init] RÉPÉTITION (${ARGUMENT_DE_REPETITION}) : le geste tourne sur un dépôt ` +
        "JETABLE, en mémoire. Aucune écriture en base, aucun sceau durable. Ce mode répond " +
        "à « ma clé est-elle bien formée ? » AVANT de toucher la base.",
    );
  } else {
    const deLaBase = await monde.ouvrirLeDepotDeLaBase();
    if (deLaBase === null) {
      monde.ecrireErreur(
        `[vault:init] REFUS : aucun chemin reproductible vers la base. Il faut, dans cet ` +
          `ordre : ${VARIABLE_DE_BASE} posée · « pnpm prisma:generate » (le client ` +
          `« ${PAQUET_DU_CLIENT_PRISMA} » n'est pas généré tant qu'on ne l'a pas lancé) · ` +
          "« pnpm db:deploy » (les dix tables du § 12, puis le journal en ajout seul). " +
          `Pour éprouver la clé sans base : « ${COMMANDE_DE_PROVISION} ` +
          `${ARGUMENT_DE_REPETITION} ».`,
      );
      return 1;
    }
    depot = deLaBase;
  }

  const rapport = await provisionnerLeCoffre({ depot, source, repetition });

  monde.ecrire(
    `[vault:init] source « ${rapport.source} » · clé fournie : ${String(rapport.cleFournie)} · ` +
      `état ${rapport.etatAvant} → ${rapport.etatApres} · sceau posé : ` +
      `${String(rapport.sceauPose)} · répétition : ${String(rapport.repetition)} · ` +
      `refus : ${rapport.refus ?? "aucun"}`,
  );
  for (const ligne of rapport.lignes) {
    if (rapport.refus === null) monde.ecrire(`[vault:init] ${ligne}`);
    else monde.ecrireErreur(`[vault:init] ${ligne}`);
  }

  return rapport.refus === null ? 0 : 1;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENTRÉE, ET ELLE EST LA SEULE CHOSE DE CE FICHIER QUI TOUCHE `process`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Charge le client Prisma **à la demande**, et rend `null` sur tout échec.
 *
 * ⚠️ **L'IMPORT EST DYNAMIQUE, ET CE N'EST PAS UN GOÛT.** `@prisma/client`
 *    ré-exporte `.prisma/client/default`, un module qui **n'existe pas tant que
 *    `prisma generate` n'a pas tourné**. Un `import` statique ferait donc
 *    échouer `pnpm typecheck` sur une machine propre — c'est-à-dire en
 *    intégration continue — pour une raison étrangère à ce fichier.
 *
 * ⚠️ **LE TYPE ATTENDU EST STRUCTUREL, PAS CELUI DE PRISMA.**
 *    `ClientPrismaDuCoffre` (`core/vault/depot.ts`) décrit le seul délégué que
 *    le coffre touche. Ce fichier ne dépend donc d'aucun type généré, et la
 *    garde peut monter le même chemin avec un faux client.
 */
async function chargerLeDepotPrisma(
  env: Readonly<Record<string, string | undefined>>,
): Promise<DepotDeSecrets | null> {
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

  const Constructeur = fabrique as new () => ClientPrismaDuCoffre;
  return new DepotPrisma(new Constructeur());
}

if (estLeProgrammeLance(import.meta.url, process.argv)) {
  executerLeProvisionnement({
    env: process.env,
    arguments: process.argv.slice(2),
    ecrire: (ligne) => {
      process.stdout.write(`${ligne}\n`);
    },
    ecrireErreur: (ligne) => {
      process.stderr.write(`${ligne}\n`);
    },
    ouvrirLeDepotDeLaBase: () => chargerLeDepotPrisma(process.env),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((erreur: unknown) => {
      process.exitCode = 1;
      process.stderr.write(
        `[vault:init] ${erreur instanceof Error ? erreur.message : String(erreur)}\n`,
      );
    });
}
