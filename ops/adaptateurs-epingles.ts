/**
 * `ops/adaptateurs-epingles.ts` — **CE QUE LE DISQUE PORTE, AVANT TOUTE
 * ADMISSION.**
 *
 * Deux documents vivent côte à côte dans ce dépôt, et l'admission a besoin des
 * deux :
 *
 *  · `core/registry/adapters.lock.json` — **le verrou**, ce qu'un humain a relu
 *    et épinglé. C'est lui qui porte `trustTier`, `maxDataClass`, `endpoint`,
 *    `secretRef` : le côté SOCLE de la frontière de confiance.
 *  · `adapters/<id>/manifeste.json` — **l'instantané épinglé** du manifeste
 *    publié par l'adaptateur, avec son `manifestSha`. C'est le côté ADAPTATEUR.
 *
 * Ce module ne fait que les LIRE et les apparier. Il ne valide rien : la
 * validation appartient à `lireVerrou()` et à `enregistrerAdaptateur()`, qui
 * savent la dire en anomalies et en refus nommés.
 *
 * ═══ CE QU'IL NE REFAIT PAS, ET C'EST DÉLIBÉRÉ ═══
 *
 * ⚠️ **LA COUVERTURE « DOSSIER ↔ VERROU » APPARTIENT À `ops/conformite-ci.ts`.**
 *    Ce harnais dérive déjà l'ensemble à couvrir de DEUX sources indépendantes —
 *    les dossiers réellement présents sous `adapters/` et les entrées du verrou —
 *    et il ÉCHOUE si elles ne parlent pas du même ensemble. En réécrire une
 *    seconde version ici ferait deux définitions de la même règle, et c'est la
 *    seconde qui ne suit jamais. Ce module signale donc ce que l'ADMISSION ne
 *    peut pas faire — une entrée de verrou dont l'instantané est absent ou
 *    illisible — et rien d'autre.
 *
 * ⚠️ **LE DISQUE EST INJECTÉ.** `SourceDesAdaptateurs` est un port : les gardes
 *    passent un disque FABRIQUÉ — un instantané tronqué, un verrou absent — sans
 *    mutiler le dépôt. Une fonction qui lirait le disque depuis son propre corps
 *    ne serait éprouvable qu'en cassant les fichiers réels.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { lireClesDAutorisation } from "../core/adapter-kit/index.js";
import { PROFILE_NAMES, SCEAU_PROFILS } from "../core/profiles/index.js";
import type { ManifesteAAdmettre } from "./main.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le port du disque
// ═════════════════════════════════════════════════════════════════════════════

export interface SourceDesAdaptateurs {
  /** Le verrou déjà analysé en JSON, ou `null` quand le fichier est ABSENT. */
  readonly lireLeVerrou: () => unknown;
  /** `true` quand le fichier de verrou existe — ABSENT n'est pas ILLISIBLE. */
  readonly verrouPresent: () => boolean;
  /**
   * L'instantané `adapters/<id>/manifeste.json` déjà analysé, ou `null` quand il
   * est absent ou illisible. Les deux cas se distinguent au message, pas ici.
   */
  readonly lireLInstantane: (id: string) => unknown;
}

/** Un adaptateur épinglé dont l'instantané a été trouvé. */
export interface AdaptateurEpingle {
  readonly id: string;
  /**
   * Le manifeste TEL QU'IL EST — non validé, non filtré. C'est sur cette valeur
   * que `enregistrerAdaptateur()` prendra l'empreinte : la nettoyer ici
   * changerait ce qui est mesuré.
   */
  readonly manifesteBrut: unknown;
  /** Le `manifestSha` que l'instantané ANNONCE. Le socle le recalcule. */
  readonly shaAnnonce: string | null;
  /**
   * La ligne d'`ops_secret` que le VERROU nomme, ou `null`.
   *
   * ⚠️ **ELLE NE SERT QU'À NOMMER**, jamais à autoriser : le raccordement lit
   *    `ops_adapter.secretRef`, écrit par une admission VALIDÉE. Ici, elle sert
   *    à dériver le nom de la variable qui sème le secret dans un coffre local.
   *    Confondre les deux ferait entrer une valeur du verrou brut dans le chemin
   *    d'authentification, sans être passée par `lireVerrou()`.
   */
  readonly secretRefAnnoncee: string | null;
}

/** Ce que la lecture rapporte. Des NOMBRES et des NOMS, jamais une couleur. */
export interface LectureDesAdaptateursEpingles {
  readonly verrouPresent: boolean;
  readonly verrouBrut: unknown;
  /** Les identifiants que le verrou épingle, dans l'ordre du fichier. */
  readonly epingles: readonly string[];
  /** Ceux dont l'instantané a été trouvé — les seuls admissibles. */
  readonly adaptateurs: readonly AdaptateurEpingle[];
  /**
   * Les entrées de verrou dont l'instantané manque. **Elles ne sont pas
   * admissibles**, et le dire est tout ce que ce module peut faire : sans le
   * manifeste, il n'y a rien à confronter à l'empreinte.
   */
  readonly sansInstantane: readonly string[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  La lecture
// ═════════════════════════════════════════════════════════════════════════════

/** Les entrées d'un verrou brut, SANS le valider — `lireVerrou()` en a la charge. */
function entreesDuVerrou(
  brut: unknown,
): readonly { readonly id: string; readonly secretRef: string | null }[] {
  if (brut === null || typeof brut !== "object") return [];
  const adapters = (brut as Record<string, unknown>)["adapters"];
  if (!Array.isArray(adapters)) return [];
  const entrees: { id: string; secretRef: string | null }[] = [];
  for (const brute of adapters) {
    if (brute === null || typeof brute !== "object") continue;
    const objet = brute as Record<string, unknown>;
    const id = objet["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    const secretRef = objet["secretRef"];
    entrees.push({ id, secretRef: typeof secretRef === "string" ? secretRef : null });
  }
  return entrees;
}

/** Sépare l'instantané en son manifeste et le SHA qu'il annonce. */
function ouvrirLInstantane(brut: unknown): {
  readonly manifesteBrut: unknown;
  readonly shaAnnonce: string | null;
} | null {
  if (brut === null || typeof brut !== "object") return null;
  const objet = brut as Record<string, unknown>;
  const manifeste = objet["manifeste"];
  if (manifeste === undefined) return null;
  const sha = objet["manifestSha"];
  return { manifesteBrut: manifeste, shaAnnonce: typeof sha === "string" ? sha : null };
}

export function lireLesAdaptateursEpingles(
  source: SourceDesAdaptateurs,
): LectureDesAdaptateursEpingles {
  const present = source.verrouPresent();
  const brut = present ? source.lireLeVerrou() : null;
  const entrees = entreesDuVerrou(brut);

  const adaptateurs: AdaptateurEpingle[] = [];
  const sansInstantane: string[] = [];
  for (const entree of entrees) {
    const ouvert = ouvrirLInstantane(source.lireLInstantane(entree.id));
    if (ouvert === null) {
      sansInstantane.push(entree.id);
      continue;
    }
    adaptateurs.push({ id: entree.id, ...ouvert, secretRefAnnoncee: entree.secretRef });
  }

  return {
    verrouPresent: present,
    verrouBrut: brut,
    epingles: entrees.map((entree) => entree.id),
    adaptateurs,
    sansInstantane,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  De la lecture aux manifestes à admettre
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'étage 5 attend, construit depuis la lecture.
 *
 * ⚠️ **LES TROIS AUTRES CHAMPS SONT INJECTÉS, PAS LUS ICI.** `profilsConnus`,
 *    `sceauProfils` et `clesDAutorisation` viennent du SOCLE, jamais du disque de
 *    l'adaptateur — c'est toute la frontière de confiance du § 09. Les faire
 *    passer en paramètres permet en outre à une garde de fabriquer une liste de
 *    clés TROP COURTE et de voir `enregistrerAdaptateur()` LEVER, ce qu'un appel
 *    direct à `lireClesDAutorisation()` rendrait impossible.
 */
export function manifestesAAdmettre(
  lecture: LectureDesAdaptateursEpingles,
  socle: {
    readonly profilsConnus: readonly string[];
    readonly sceauProfils: ManifesteAAdmettre["sceauProfils"];
    readonly clesDAutorisation: readonly string[];
  },
): readonly ManifesteAAdmettre[] {
  return lecture.adaptateurs.map((adaptateur) => ({
    manifesteBrut: adaptateur.manifesteBrut,
    profilsConnus: socle.profilsConnus,
    sceauProfils: socle.sceauProfils,
    clesDAutorisation: socle.clesDAutorisation,
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA SOURCE RÉELLE — la seule chose de ce fichier qui touche le disque
// ═════════════════════════════════════════════════════════════════════════════

/** Le verrou versionné dans le socle, dérivé d'`import.meta.url`. */
function cheminDuVerrou(): string {
  return fileURLToPath(new URL("../core/registry/adapters.lock.json", import.meta.url));
}

/** L'instantané épinglé d'un adaptateur. */
function cheminDeLInstantane(id: string): string {
  return fileURLToPath(new URL(`../adapters/${id}/manifeste.json`, import.meta.url));
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * La source qui lit le VRAI dépôt.
 *
 * ⚠️ **LES CHEMINS SONT DÉRIVÉS D'`import.meta.url`, JAMAIS CODÉS DEPUIS LA
 *    RACINE.** Une lecture au chemin figé devient muette au déménagement, et
 *    muette veut dire « aucun adaptateur épinglé » — c'est-à-dire un socle qui
 *    ne sert rien sans qu'aucune erreur ne paraisse.
 *
 * ⚠️ **`adapters/<id>/manifeste.json` EST UN `.json`, DONC PRÉSENT SOUS
 *    `dist/` ?** Non — `tsconfig.build.json` n'émet que du `.js` et du `.d.ts`.
 *    Sous `dist/ops/`, `../adapters/<id>/manifeste.json` n'existe pas. C'est
 *    pourquoi les gestes qui admettent tournent sous `tsx`, depuis les sources,
 *    et pourquoi la variante `:dist` de l'admission n'est PAS déclarée : un
 *    script qui ne peut pas trouver ses documents est un geste nommé et
 *    infaisable, ce que l'ADR 0046 interdit.
 */
export const SOURCE_DU_DEPOT: SourceDesAdaptateurs = {
  verrouPresent: () => existsSync(cheminDuVerrou()),
  lireLeVerrou: () => lireJson(cheminDuVerrou()),
  lireLInstantane: (id) => {
    const chemin = cheminDeLInstantane(id);
    if (!existsSync(chemin)) return null;
    return lireJson(chemin);
  },
};

/**
 * Les dossiers réellement présents sous `adapters/`.
 *
 * ⚠️ **IL NE SERT PAS À L'ADMISSION, IL SERT À L'ANNONCE.** Le harnais de
 *    conformité est ce qui FAIT ÉCHOUER quand les dossiers et le verrou
 *    divergent ; ici, on annonce seulement le dénominateur, pour qu'un rapport
 *    d'admission dise sur quoi il a porté.
 */
export function dossiersDAdaptateurs(): readonly string[] {
  const dossier = fileURLToPath(new URL("../adapters/", import.meta.url));
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((nom) => !nom.startsWith(".") && statSync(`${dossier}${nom}`).isDirectory())
    .sort();
}

/** Les trois valeurs du SOCLE, lues ici pour n'être écrites qu'une fois. */
export function contributionDuSocle(): {
  readonly profilsConnus: readonly string[];
  readonly sceauProfils: ManifesteAAdmettre["sceauProfils"];
  readonly clesDAutorisation: readonly string[];
} {
  return {
    profilsConnus: PROFILE_NAMES,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: [...lireClesDAutorisation().toutes],
  };
}
