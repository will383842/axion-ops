/**
 * `core/federe/raccordement.ts` — DE L'OUTIL À SON ADRESSE, ET À SON SECRET.
 *
 * `appelerAdaptateurFedere()` (voir `./appel.ts`) a besoin de quatre choses :
 * une adresse, un secret déjà déchiffré, le nom complet de l'outil et ses
 * `idFields`. Aucune ne se devine : elles vivent dans le catalogue et dans la
 * ligne `ops_adapter` que le registre a écrite à l'admission.
 *
 * Ce fichier fait ce pont, **et rien d'autre**. Il ne connaît ni HTTP, ni
 * JSON-RPC : c'est ce qui le rend testable sans réseau, et ce qui permet à
 * l'appel de rester ignorant du coffre.
 *
 * ═══ CE QU'IL REFUSE, ET POURQUOI CHAQUE REFUS EXISTE ═══
 *
 * Le registre valide déjà ces cohérences **à l'admission** (`registry/lock.ts`,
 * motif `raccordement_incoherent`). On les revérifie ici, et ce n'est pas une
 * redondance : entre l'admission et l'appel, il y a une base de données, une
 * console qui bascule des interrupteurs, et le temps. Un raccordement lu, c'est
 * une donnée d'entrée, pas un acquis.
 *
 *  · mode `hébergé` → il n'y a rien à joindre ; appeler par HTTP un adaptateur
 *    en processus est un défaut de composition, pas une panne.
 *  · `endpoint` absent → on ne fabrique pas d'URL par défaut. Deviner l'adresse
 *    d'un adaptateur, c'est appeler quelqu'un d'autre.
 *  · `authMode` ≠ `secret-partage` → on ne choisit pas une authentification à la
 *    place de celle qui a été admise.
 *  · `secretRef` absent, ou coffre incapable de le rendre → **refus**, jamais un
 *    appel sans en-tête. Un appel sans secret rendrait 401 : on aurait dérangé
 *    un tiers pour apprendre ce que l'on savait déjà.
 */

import type { Coffre } from "../vault/coffre.js";
import type { RefusDeCoffre } from "../vault/erreurs.js";
import type { OutilDuCatalogue } from "../chaine/etapes.js";
import type { LigneOpsAdapter } from "../registry/types.js";
import type { RaccordementFedere } from "./appel.js";

/**
 * Le raccordement n'a pas pu être construit — et la raison est NOMMÉE.
 *
 * Distincte d'`ErreurAdaptateurDistant` : ici, rien n'a été appelé. Le défaut
 * est chez nous (registre, coffre, composition), pas en face.
 */
export class ErreurRaccordement extends Error {
  public readonly motif: MotifRaccordement;
  public readonly adapterId: string;

  public constructor(motif: MotifRaccordement, adapterId: string, detail: string) {
    super(`raccordement impossible pour « ${adapterId} » [${motif}] : ${detail}`);
    this.name = "ErreurRaccordement";
    this.motif = motif;
    this.adapterId = adapterId;
  }
}

export const MOTIFS_RACCORDEMENT = [
  "adaptateur_introuvable",
  "mode_non_federe",
  "endpoint_absent",
  "auth_non_supportee",
  "secret_ref_absent",
  "secret_illisible",
  "coffre_indisponible",
] as const;

export type MotifRaccordement = (typeof MOTIFS_RACCORDEMENT)[number];

/** Ce que le socle sait lire pour trouver un adaptateur. Un port, pas une base. */
export interface LectureDesAdaptateurs {
  /** La ligne `ops_adapter` d'un id, ou `null`. Ne lève pas : `null` est un cas. */
  readonly relire: (adapterId: string) => Promise<LigneOpsAdapter | null>;
}

/**
 * Ce que le coffre doit savoir faire, vu d'ici. **Volontairement plus étroit que
 * `Coffre`** : ce fichier n'a aucune raison de pouvoir écrire un secret, et un
 * port large finit toujours par être utilisé largement.
 */
export interface LectureDuCoffre {
  readonly lire: (nom: string) => Promise<Buffer>;
  /**
   * Le refus courant du coffre, ou `null` s'il sert.
   *
   * ⚠️ On garde le type du coffre TEL QUEL (`RefusDeCoffre`) plutôt qu'un
   *    `{ raison }` de confort : il porte `etat` (« absent » ou « verrouillé »,
   *    qui ne se réparent pas pareil), `etape` et `code`. Les aplatir ici
   *    perdrait ce que le § 15 demande de dire ensuite.
   */
  readonly refusDAppelDOutil: () => RefusDeCoffre | null;
}

/** `Coffre` satisfait le port étroit — la conversion est écrite une seule fois. */
export function coffreCommeLecture(coffre: Coffre): LectureDuCoffre {
  return {
    lire: (nom) => coffre.lire(nom),
    refusDAppelDOutil: () => coffre.refusDAppelDOutil(),
  };
}

/** Le nom complet servi par `tools/list` : préfixe DÉRIVÉ de l'id + nom local. */
export function nomCompletDeLOutil(outil: OutilDuCatalogue): string {
  return `${outil.adapterId}.${outil.name}`;
}

export interface OptionsRaccordement {
  readonly delaiMs?: number;
}

/**
 * Construit le raccordement d'un outil, ou refuse en NOMMANT pourquoi.
 *
 * ⚠️ Le secret est lu à CHAQUE appel, jamais mémorisé ici. Le coffre a trois
 *    états et peut être verrouillé entre deux appels ; un secret gardé en cache
 *    survivrait au verrouillage, et l'arrêt d'urgence du § 25 ne serait plus un
 *    arrêt.
 */
export async function construireRaccordement(
  outil: OutilDuCatalogue,
  adaptateurs: LectureDesAdaptateurs,
  coffre: LectureDuCoffre,
  options: OptionsRaccordement = {},
): Promise<RaccordementFedere> {
  const id = outil.adapterId;

  const ligne = await adaptateurs.relire(id);
  if (ligne === null) {
    throw new ErreurRaccordement(
      "adaptateur_introuvable",
      id,
      "aucune ligne `ops_adapter` : l'adaptateur n'a jamais été admis, ou il a été retiré.",
    );
  }
  if (ligne.mode !== "fédéré") {
    throw new ErreurRaccordement(
      "mode_non_federe",
      id,
      `mode « ${ligne.mode} » : un adaptateur en processus ne s'appelle pas par le réseau.`,
    );
  }
  if (ligne.endpoint === null || ligne.endpoint.length === 0) {
    throw new ErreurRaccordement(
      "endpoint_absent",
      id,
      "aucun `endpoint`. Le socle ne fabrique pas d'adresse par défaut : deviner " +
        "l'adresse d'un adaptateur, c'est appeler quelqu'un d'autre.",
    );
  }
  if (ligne.authMode !== "secret-partage") {
    throw new ErreurRaccordement(
      "auth_non_supportee",
      id,
      `authMode « ${ligne.authMode} » : seul « secret-partage » sait s'appeler par le réseau.`,
    );
  }
  if (ligne.secretRef === null || ligne.secretRef.length === 0) {
    throw new ErreurRaccordement(
      "secret_ref_absent",
      id,
      "aucun `secretRef`. Appeler sans en-tête rendrait 401 : on aurait dérangé un " +
        "tiers pour apprendre ce qu'on savait déjà.",
    );
  }

  // Le coffre d'abord : verrouillé, il refuse tout appel d'outil (§ 25), et le
  // dire ici évite un aller-retour réseau qui ne pouvait pas aboutir.
  const refus = coffre.refusDAppelDOutil();
  if (refus !== null) {
    throw new ErreurRaccordement(
      "coffre_indisponible",
      id,
      `coffre « ${refus.etat} » — ${refus.message}`,
    );
  }

  let secret: string;
  try {
    const clair = await coffre.lire(ligne.secretRef);
    secret = clair.toString("utf8");
  } catch (erreur) {
    // ⚠️ On ne recopie PAS le message du coffre : il peut nommer un chemin, une
    //    version, ou pire. Le nom de la référence suffit à corriger.
    const nom = erreur instanceof Error ? erreur.name : "erreur";
    throw new ErreurRaccordement(
      "secret_illisible",
      id,
      `le coffre n'a pas rendu « ${ligne.secretRef} » (${nom}).`,
    );
  }

  if (secret.length === 0) {
    throw new ErreurRaccordement(
      "secret_illisible",
      id,
      `« ${ligne.secretRef} » est VIDE. Un secret vide serait présenté tel quel et ` +
        "l'adaptateur rendrait 401 — autant refuser ici, où la cause est lisible.",
    );
  }

  return {
    endpoint: ligne.endpoint,
    secret,
    nomComplet: nomCompletDeLOutil(outil),
    idFields: outil.idFields,
    ...(options.delaiMs === undefined ? {} : { delaiMs: options.delaiMs }),
  };
}
