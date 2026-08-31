/**
 * `core/instance/demarrage.ts` — **LA COUTURE.** Là où l'arbitre est APPELÉ.
 *
 * ═══ POURQUOI CE FICHIER EXISTE, ET C'EST TOUT LE SUJET DU LOT ═══
 *
 * L'épreuve du lot 1c a mesuré un mode de défaillance que rien ne surveillait :
 * **une décision écrite, testée, documentée — et non cousue au chemin de
 * production.** `deciderDemarrageMonoInstance` peut être pure, couverte sur ses
 * quatre états et parfaitement juste : tant qu'aucun module ne l'APPELLE, rien
 * dans le dépôt ne fait qu'un second socle refuse de démarrer. Écrire la
 * fonction n'est pas la moitié du travail ; c'est le quart.
 *
 * Ce module est le quart manquant. Il ne décide rien lui-même — il SÉQUENCE :
 *
 *  1. **au démarrage** — `acquerir()` puis {@link deciderDemarrageMonoInstance} ;
 *  2. **en continu** — `relire()` à CHAQUE lecture du healthcheck, puis
 *     {@link statutHealthcheckPourVerrou}.
 *
 * Ce sont les deux gardes de l'ADR 0018, dans l'ordre où elle les pose, et elle
 * insiste sur le fait qu'elles ne se remplacent pas : le démarrage seul ne voit
 * jamais un verrou PERDU EN COURS DE VIE — la forme la plus probable du défaut,
 * puisque « personne ne démarre volontairement deux socles ; une connexion, elle,
 * tombe toute seule ».
 *
 * ═══ CE QU'IL NE FAIT PAS ═══
 *
 * ⚠️ **IL N'OUVRE AUCUNE CONNEXION ET NE CONNAÎT AUCUN MAGASIN.** Le verrou lui
 *    est DONNÉ. `core/transport/` n'existe pas encore ; le jour où il existera,
 *    c'est lui qui construira le verrou consultatif Postgres et appellera ces
 *    deux fonctions — et non l'inverse.
 *
 * ⚠️ **IL NE DÉCIDE PAS UNE SECONDE FOIS.** Toute la table des quatre états vit
 *    dans `verrou.ts`. Une décision prise à deux endroits est une décision qui
 *    divergera : c'est le motif de `core/vault/demarrage.ts`, repris tel quel.
 */

import type { EtatIndexProvenance } from "../chaine/etape-11-provenance.js";
import type {
  DecisionDeDemarrageMonoInstance,
  InstanceDuSocle,
  ResultatAcquisition,
  SanteMonoInstance,
  VerrouDInstance,
} from "./verrou.js";
import { deciderDemarrageMonoInstance, statutHealthcheckPourVerrou } from "./verrou.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE REPLI FAIL-CLOSED
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'ON RETIENT QUAND LE PORT **LÈVE** AU LIEU DE RÉPONDRE.
 *
 * Le port l'interdit — « elle ne lève pas sur un magasin injoignable, elle rend
 * `indisponible` » — mais une interdiction écrite dans un commentaire n'est pas
 * une garantie d'exécution : un pilote Postgres qui casse sa connexion lève, et
 * le premier adaptateur venu peut oublier de l'attraper.
 *
 * ⚠️ **LE REPLI TOMBE DU CÔTÉ STRICT, ET IL TOMBE SUR `indisponible` PLUTÔT QUE
 *    SUR `refusé`.** Les deux refusent le démarrage, donc la sûreté est la même ;
 *    mais ils ne se réparent pas du même geste (§ 23, même motif qu'`absent` /
 *    `verrouillé`). Annoncer « une autre instance tient le verrou » quand on ne
 *    sait rien enverrait arrêter un socle qui n'existe pas, au lieu de réparer
 *    le magasin.
 */
export const REPLI_MAGASIN_INJOIGNABLE: ResultatAcquisition = {
  etat: "indisponible",
  instance: null,
  detenteur: null,
  message:
    "Le magasin de verrous a LEVÉ au lieu de répondre. Le port exige qu'il rende " +
    "« indisponible » plutôt que de lever ; l'écart est traité comme tel, du côté strict — le " +
    "socle ne sait pas s'il est seul, donc il n'affirme rien et ne démarre pas.",
};

// ═════════════════════════════════════════════════════════════════════════════
//  1 — AU DÉMARRAGE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que rend la séquence de démarrage. Des faits ET la décision, jamais un booléen seul. */
export interface DemarrageMonoInstance {
  /** Ce que le port a répondu — ou le repli, s'il a levé. */
  readonly resultat: ResultatAcquisition;
  /** Ce que l'arbitre PUR en a décidé. */
  readonly decision: DecisionDeDemarrageMonoInstance;
  /** L'instance qui sert, quand le socle démarre. `null` sur les trois refus. */
  readonly instance: InstanceDuSocle | null;
  /** Vrai si le port a levé — l'écart au contrat, COMPTÉ plutôt qu'avalé. */
  readonly portALeve: boolean;
}

/**
 * PREND LE VERROU, PUIS APPLIQUE L'ARBITRE.
 *
 * ⚠️ **L'ORDRE EST LA DÉCISION.** « Un verrou EXCLUSIF est pris AVANT de servir
 *    quoi que ce soit » : l'acquisition précède tout, et la valeur rendue par
 *    cette fonction est ce qui autorise — ou non — la suite du démarrage.
 *
 * ⚠️ `instance` VIENT DU RÉSULTAT D'ACQUISITION, jamais du verrou interrogé à
 *    part. Un socle qui publierait son identité alors qu'il n'a pas obtenu le
 *    verrou ferait apparaître, dans les lectures de `ops/mono-instance.ts`, une
 *    instance qui ne sert pas — et l'observateur compterait un chevauchement
 *    imaginaire.
 */
export async function demarrerLeSocleMonoInstance(
  verrou: VerrouDInstance,
): Promise<DemarrageMonoInstance> {
  let resultat: ResultatAcquisition;
  let portALeve = false;
  try {
    resultat = await verrou.acquerir();
  } catch {
    // Fail-closed. La cause n'est PAS relayée : elle peut porter une chaîne de
    // connexion, et ce dépôt est public (§ 29). Le message nomme le geste.
    resultat = REPLI_MAGASIN_INJOIGNABLE;
    portALeve = true;
  }

  const decision = deciderDemarrageMonoInstance(resultat.etat);
  return {
    resultat,
    decision,
    instance: decision.demarre ? resultat.instance : null,
    portALeve,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  2 — EN CONTINU
// ═════════════════════════════════════════════════════════════════════════════

/**
 * D'où viennent les comptes du § 20. Une FONCTION, pas une valeur : le
 * healthcheck relit l'index à chaque appel, comme il relit le verrou.
 */
export type LectureDeProvenance = () => EtatIndexProvenance;

/**
 * RELIT LE VERROU, ET REND LA SANTÉ MONO-INSTANCE (§ 22, écran Santé).
 *
 * ⚠️ **ELLE RELIT À CHAQUE APPEL, ELLE NE SE SOUVIENT PAS.** C'est la seule
 *    forme qui voit un verrou perdu en cours de vie. Un drapeau posé au
 *    démarrage répondrait « tenu » exactement dans le cas qu'il faut voir.
 *
 * ⚠️ **LE STATUT EST DÉRIVÉ, PAS RECOPIÉ** — {@link statutHealthcheckPourVerrou}.
 *    503 dès que le verrou n'est plus tenu, 200 sinon. Un coffre verrouillé rend
 *    200 (§ 23), un verrou perdu rend 503 : les deux états ne disent pas la même
 *    chose au déploiement, et faire rougir le premier apprendrait à ignorer le
 *    rouge.
 *
 * ⚠️ **LES TROIS COMPTES SONT DÉRIVÉS D'`EtatIndexProvenance`.** Un champ ajouté
 *    là-bas arrive ici le jour même par le `Pick<…>` de `SanteMonoInstance` — et
 *    `tsc` le dit. Les trois retenus sont ceux qui disent si la garde MORD : ce
 *    qu'elle tient, sur combien de sessions, et si elle a dû dégrader.
 *
 * @param instance l'identité obtenue au démarrage. Le healthcheck la republie
 *   telle quelle : c'est elle qui distingue « aucune session marquée » de « je
 *   regarde le mauvais index parce qu'une autre instance sert la moitié des
 *   appels ».
 */
export async function relireLaSanteMonoInstance(
  verrou: VerrouDInstance,
  instance: InstanceDuSocle,
  lireLaProvenance: LectureDeProvenance,
): Promise<SanteMonoInstance> {
  let etat;
  try {
    etat = await verrou.relire();
  } catch {
    // Fail-closed, et pour la même raison qu'au démarrage : un healthcheck qui
    // rendrait 200 parce que la relecture a levé est le pire des cas — la garde
    // du § 20 s'applique peut-être déjà une fois sur deux, et personne ne le
    // verra.
    etat = "indisponible" as const;
  }

  const provenance = lireLaProvenance();
  return {
    instance,
    verrou: etat,
    provenance: {
      extraits: provenance.extraits,
      sessions: provenance.sessions,
      indetermine: provenance.indetermine,
    },
    statut: statutHealthcheckPourVerrou(etat),
  };
}
