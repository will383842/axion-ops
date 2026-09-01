/**
 * `adapters/zoho-mail/bootstrap/index.ts` — **LE PROGRAMME. LA SEULE PORTE.**
 *
 * ═══ CE FICHIER EST LE SEUL DU DOSSIER QUI TOUCHE `process` ═══
 *
 * Tout le reste est fait de fonctions pures et de ports. Ce fichier constate le
 * monde — les arguments, le terminal, l'environnement, la base — et remet ces
 * constats à `amorcer()`. C'est ce qui permet aux gardes de fabriquer chacun des
 * refus sans machine, sans base, sans port ouvert et sans réseau.
 *
 * ═══ LA PART DE WILL ═══
 *
 *   1. Poser `ZOHO_CLIENT_ID` et `ZOHO_CLIENT_SECRET` dans un `.env` non suivi.
 *   2. Lancer la commande déclarée dans `DEPS.md`.
 *   3. **Cliquer sur le lien affiché, et accepter.**
 *
 * Il n'y a pas de quatrième point. Le code revient tout seul sur la boucle
 * locale, l'échange se fait, le jeton entre au coffre.
 *
 * ⚠️ **CE PROGRAMME NE SE LANCE PAS TOUT SEUL, ET CE N'EST PAS UNE CONVENTION.**
 *    Voir `mandat.ts`. Les quatre constats de `IntentionConstatee` sont faits
 *    ICI, et nulle part ailleurs.
 *
 * ⚠️ **AUCUN SECRET N'EST ÉCRIT PAR CE PROGRAMME AILLEURS QUE DANS LE COFFRE.**
 *    Le rapport porte des noms, des états, des comptes et des empreintes. La
 *    seule valeur affichée est l'URL d'autorisation — qui porte le `client_id`,
 *    et qui doit être affichée pour que Will puisse cliquer.
 */

import { estLeProgrammeLance } from "../../../ops/index.js";
import type { ClientPrismaDuCoffre, DepotDeSecrets } from "../../../core/vault/index.js";
import {
  Coffre,
  DepotEnMemoire,
  DepotPrisma,
  VARIABLES_DE_CLE,
  depuisEnvironnement,
} from "../../../core/vault/index.js";
import { amorcer } from "./amorcage.js";
import type { RapportDAmorcage } from "./amorcage.js";
import { lecteurDeVersions, plafondEnVigueur } from "./coffre-du-jeton.js";
import { echangeurHttps } from "./jetons.js";
import type { EchangeurDeJetons, Emissaire } from "./jetons.js";
import { ARGUMENT_SENTINELLE, demanderUnMandat } from "./mandat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES ARGUMENTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le mode « à blanc » : la configuration est lue, l'URL est construite et
 * affichée, **et le geste s'arrête là**. Aucun port, aucun échange.
 *
 * ⚠️ Il porte le même nom que celui de `ops/vault-init.ts` par CONVENTION
 *    d'exploitation, pas par partage de décision : ce sont deux programmes
 *    distincts, et coudre l'un à l'autre pour une chaîne de caractères
 *    créerait une dépendance qu'aucune des deux ne veut.
 */
export const ARGUMENT_DE_REPETITION = "--repetition";

/** La variable qui porte l'adresse de la base. Un NOM, jamais une valeur. */
export const VARIABLE_DE_BASE = "DATABASE_URL";

/** Le nom du paquet du client Prisma. Chargé à la demande — voir plus bas. */
export const PAQUET_DU_CLIENT_PRISMA = "@prisma/client";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROGRAMME CONSTATE DU MONDE
// ═════════════════════════════════════════════════════════════════════════════

export interface MondeDuProcessus {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly arguments: readonly string[];
  /** `process.stdin.isTTY === true`. Verrou 2 du mandat. */
  readonly entreeEstUnTerminal: boolean;
  /** Ce module est-il LE programme lancé ? Verrou 3 du mandat. */
  readonly estLeProgrammeLance: boolean;
  readonly ecrire: (ligne: string) => void;
  readonly ecrireErreur: (ligne: string) => void;
  /** Ouvre le dépôt de la BASE, ou rend `null` sans exploser. */
  readonly ouvrirLeDepotDeLaBase: () => Promise<DepotDeSecrets | null>;
  /** La prise réseau de l'échange. Remise, pour qu'aucune garde n'en monte une. */
  readonly echangeur: EchangeurDeJetons;
}

/**
 * **LE PROGRAMME. Rend un code de sortie ; n'appelle jamais `process.exit`.**
 *
 * ⚠️ **CHAQUE LIGNE DU RAPPORT EST ÉCRITE, REFUS COMPRIS, ET LE REFUS EST
 *    NOMMÉ.** Les sept refus appellent des gestes différents, et deux d'entre
 *    eux appellent des gestes OPPOSÉS : `rappel-sans-code` se rejoue sans
 *    conséquence, `plafond-atteint` interdit de recommencer.
 */
export async function executerLAmorcage(monde: MondeDuProcessus): Promise<number> {
  const repetition = monde.arguments.includes(ARGUMENT_DE_REPETITION);

  // ── LE MANDAT, AVANT MÊME D'OUVRIR QUOI QUE CE SOIT ──────────────────────
  const issue = demanderUnMandat({
    arguments: monde.arguments,
    entreeEstUnTerminal: monde.entreeEstUnTerminal,
    estLeProgrammeLance: monde.estLeProgrammeLance,
    programme: "adapters/zoho-mail/bootstrap",
  });
  if (!issue.delivre) {
    monde.ecrireErreur(`[zoho:amorçage] refus : ${issue.refus}`);
    for (const ligne of issue.lignes) monde.ecrireErreur(`[zoho:amorçage] ${ligne}`);
    return 1;
  }

  // ── LE DÉPÔT ─────────────────────────────────────────────────────────────
  let depot: DepotDeSecrets;
  if (repetition) {
    depot = new DepotEnMemoire();
    monde.ecrire(
      `[zoho:amorçage] RÉPÉTITION (${ARGUMENT_DE_REPETITION}) : dépôt JETABLE en mémoire, ` +
        "aucun port ouvert, aucun échange. Ce mode répond à « ma configuration est-elle " +
        "bonne ? » AVANT de faire cliquer qui que ce soit.",
    );
  } else {
    const deLaBase = await monde.ouvrirLeDepotDeLaBase();
    if (deLaBase === null) {
      monde.ecrireErreur(
        `[zoho:amorçage] REFUS : aucun chemin reproductible vers la base. Il faut, dans cet ` +
          `ordre : ${VARIABLE_DE_BASE} posée · le client Prisma généré · les tables ` +
          `déployées. Pour éprouver la configuration sans base : ajouter ` +
          `${ARGUMENT_DE_REPETITION}.`,
      );
      return 1;
    }
    depot = deLaBase;
  }

  // ── LE COFFRE ────────────────────────────────────────────────────────────
  const plafond = plafondEnVigueur(monde.env);
  const source = depuisEnvironnement(monde.env);
  const coffre = await Coffre.ouvrir({ depot, source, plafondBootstrap: plafond.valeur });

  if (repetition && coffre.etat() === "absent") {
    // Un dépôt jetable n'a pas de sceau : le poser ici est sans conséquence, et
    // c'est la seule façon d'aller jusqu'à l'URL en mode à blanc.
    if (source.ouvreAuDemarrage) {
      await coffre.provisionner();
    } else {
      monde.ecrireErreur(
        `[zoho:amorçage] REFUS : le mode répétition monte un coffre jetable, et aucune clé ` +
          `n'est présentée. Poser ${VARIABLES_DE_CLE.cle} (32 octets encodés en base64) — ` +
          "une clé JETABLE suffit pour ce mode, puisque rien n'est conservé.",
      );
      return 1;
    }
  }

  // ── LE GESTE ─────────────────────────────────────────────────────────────
  let rapport: RapportDAmorcage;
  try {
    rapport = await amorcer(issue.mandat, {
      env: monde.env,
      ecrire: (ligne) => {
        monde.ecrire(`[zoho:amorçage] ${ligne}`);
      },
      coffre,
      versions: lecteurDeVersions(depot),
      echangeur: monde.echangeur,
      repetition,
    });
  } catch (erreur: unknown) {
    monde.ecrireErreur(
      `[zoho:amorçage] PANNE non prévue : ` +
        `${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
    monde.ecrireErreur(
      "[zoho:amorçage] ⚠️ Relire l'écran Santé AVANT de relancer : si l'amorçage a été " +
        "compté, un jeton a peut-être été émis chez Zoho.",
    );
    return 1;
  }

  const ecrire = rapport.refus === null ? monde.ecrire : monde.ecrireErreur;
  ecrire(
    `[zoho:amorçage] étapes : ${rapport.etapesFranchies.join(" → ") || "aucune"} · ` +
      `amorçages comptés : ${rapport.compte === null ? "non compté" : String(rapport.compte)} · ` +
      `plafond appliqué par le coffre : ` +
      `${rapport.plafond === null ? "non lisible" : String(rapport.plafond)} · ` +
      `annoncé par l'environnement : ${String(rapport.plafondAttendu)} ` +
      `(${rapport.originePlafond}) · ` +
      `reste : ${rapport.reste === null ? "inconnu" : String(rapport.reste)} · ` +
      `jeton émis par Zoho : ${String(rapport.jetonEmisParZoho)} · ` +
      `version déposée : ${rapport.versionDuJeton === null ? "aucune" : String(rapport.versionDuJeton)} · ` +
      `répétition : ${String(rapport.repetition)} · refus : ${rapport.refus ?? "aucun"}`,
  );
  for (const ligne of rapport.lignes) ecrire(ligne === "" ? "" : `[zoho:amorçage] ${ligne}`);

  return rapport.refus === null ? 0 : 1;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA BASE, CHARGÉE À LA DEMANDE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **L'IMPORT EST DYNAMIQUE, ET CE N'EST PAS UN GOÛT.** `@prisma/client`
 *    ré-exporte un module qui **n'existe pas tant que `prisma generate` n'a pas
 *    tourné**. Un import statique ferait échouer la vérification de types sur
 *    une machine propre — c'est-à-dire en intégration continue — pour une raison
 *    étrangère à ce fichier. C'est le même choix que `ops/vault-init.ts`, et
 *    pour le même motif.
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

/**
 * La prise réseau réelle. **Construite ici et nulle part ailleurs** : c'est ce
 * qui permet d'affirmer qu'aucune garde du dossier ne peut sortir de la machine.
 */
function emissaireDuProcessus(): Emissaire {
  return async (url, options) => {
    const reponse = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });
    return { status: reponse.status, text: () => reponse.text() };
  };
}

if (estLeProgrammeLance(import.meta.url, process.argv)) {
  executerLAmorcage({
    env: process.env,
    arguments: process.argv.slice(2),
    // ⚠️ `isTTY` vaut `undefined` — pas `false` — quand l'entrée n'est pas un
    //    terminal. La comparaison stricte est donc la seule lecture juste.
    entreeEstUnTerminal: process.stdin.isTTY === true,
    estLeProgrammeLance: true,
    ecrire: (ligne) => {
      process.stdout.write(`${ligne}\n`);
    },
    ecrireErreur: (ligne) => {
      process.stderr.write(`${ligne}\n`);
    },
    ouvrirLeDepotDeLaBase: () => chargerLeDepotPrisma(process.env),
    echangeur: echangeurHttps(emissaireDuProcessus()),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((erreur: unknown) => {
      process.exitCode = 1;
      process.stderr.write(
        `[zoho:amorçage] ${erreur instanceof Error ? erreur.message : String(erreur)}\n`,
      );
    });
}

// ⚠️ `ARGUMENT_SENTINELLE` est ré-exporté pour que le script de `package.json`
//    et la garde le lisent à la MÊME source. Une seconde écriture de cette
//    chaîne serait la première divergence.
export { ARGUMENT_SENTINELLE };
