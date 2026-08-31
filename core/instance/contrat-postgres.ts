/**
 * `core/instance/contrat-postgres.ts` — **LA MOITIÉ MANQUANTE DE L'ADR 0018.**
 *
 * ═══ CE FICHIER NE CONTIENT AUCUNE IMPLÉMENTATION, ET C'EST DÉLIBÉRÉ ═══
 *
 * L'ADR 0018 demande deux implémentations du port : `VerrouPostgres`
 * (adaptation) **et** `VerrouEnMemoire` (double). Seul le double existe. Le lot
 * 1d l'a mesuré et l'a laissé ouvert en nommant sa cause : « le verrou
 * consultatif de session attend `core/transport/` ». Ce lot-ci lève l'attente.
 *
 * ⚠️ **AUCUNE VALEUR N'EST EXPORTÉE.** Le constructeur écrit
 *    `core/instance/postgres.ts` ; ce fichier dit à quoi son implémentation sera
 *    confrontée. Voir **ADR 0024**.
 *
 * ═══ LE DÉFAUT QUE CE CONTRAT EXISTE POUR RENDRE IMPOSSIBLE ═══
 *
 * Un verrou consultatif **de session** PostgreSQL est relâché quand la session
 * qui le tient se ferme. Un pool de connexions ferme et rouvre ses connexions
 * sans prévenir personne : un verrou pris sur une connexion empruntée au pool
 * est donc relâché **en silence**, à un moment que rien n'observe, et le socle
 * continue de croire qu'il l'a.
 *
 * C'est exactement la forme du défaut que `relireLaSanteMonoInstance` existe
 * pour voir — « personne ne démarre volontairement deux socles ; une connexion,
 * elle, tombe toute seule » — sauf qu'ici le socle se l'infligerait lui-même, à
 * chaque recyclage du pool.
 */

import type { EtatDuVerrou, InstanceDuSocle } from "./verrou.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONNEXION QUI TIENT LE VERROU
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UNE CONNEXION DÉDIÉE, HORS DU POOL, QUI NE FAIT QUE ÇA.**
 *
 * Trois propriétés, et chacune ferme une porte :
 *
 *  1. **elle n'est jamais rendue au pool** — sinon le verrou tombe au premier
 *     recyclage, sans erreur, sans journal, sans qu'aucun compte ne bouge ;
 *  2. **elle ne sert aucune requête applicative** — une requête lente ou une
 *     transaction abandonnée sur cette connexion-là suspendrait la relecture du
 *     verrou, et la santé mono-instance deviendrait indisponible pour une raison
 *     qui n'a rien à voir avec le verrou ;
 *  3. **elle porte un `application_name` reconnaissable** — c'est ce qui permet
 *     à un humain devant `pg_stat_activity` de distinguer « le socle tient son
 *     verrou » de « une connexion oubliée traîne ».
 *
 * ⚠️ **LA PERTE DE CETTE CONNEXION N'EST PAS UNE ERREUR À RATTRAPER, C'EST LA
 *    PERTE DU VERROU.** Une reconnexion automatique qui reprendrait le verrou
 *    sans le dire effacerait la fenêtre pendant laquelle deux socles ont pu
 *    servir — et cette fenêtre est précisément ce que le § 20 doit connaître,
 *    puisque l'index de provenance est local au processus.
 */
export interface ConnexionDeVerrou {
  /** Ce que la connexion annonce à `pg_stat_activity`. */
  readonly applicationName: string;
  /** Vraie tant que la connexion est la MÊME que celle qui a pris le verrou. */
  readonly memeSessionQuAlAcquisition: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CLÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA CLÉ EST DÉRIVÉE DE `DOMAINE_DU_VERROU`, JAMAIS ÉCRITE EN DUR.**
 *
 * L'ADR 0018 écarte nommément l'entier littéral : « elle serait recopiée dans
 * une migration et divergerait en silence ». La dérivation est donc la décision,
 * et elle a deux moitiés que l'ADR 0024 fixe :
 *
 *  · **quelle empreinte** — une empreinte du domaine, tronquée à la largeur
 *    qu'attend `pg_try_advisory_lock`. Le tronquage est une PERTE, et il est
 *    assumé : deux domaines distincts pourraient en théorie tomber sur la même
 *    clé. Le socle n'a qu'un domaine, donc la collision n'a personne avec qui
 *    entrer en conflit — et le jour où un second apparaîtra, cette phrase est
 *    l'endroit où on s'en souviendra ;
 *  · **quelle largeur** — la variante à un seul argument 64 bits, pas la
 *    variante à deux entiers 32 bits : deux entiers offrent deux fois plus de
 *    place pour une erreur de recopie, et aucun bénéfice ici.
 */
export interface CleDeVerrouDerivee {
  /** Le domaine dont la clé dérive. Il vit dans `verrou.ts`, pas ici. */
  readonly domaine: string;
  /** Combien de bits d'empreinte ont été RETENUS. Annoncé, jamais supposé. */
  readonly bitsRetenus: number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUAND LE VERROU POSTGRES S'APPLIQUE — ET QUAND LE DOUBLE SUFFIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE VERROU EST TOUJOURS PRIS. SEULE SON IMPLÉMENTATION DÉPEND DU MAGASIN.**
 *
 * La tentation à laquelle ce commentaire existe pour résister : « en local, on
 * n'a qu'un seul socle, le verrou ne sert à rien ». C'est faux — deux démons
 * stdio lancés depuis deux terminaux sont exactement deux socles, et le § 20 les
 * verrait une fois sur deux.
 *
 * Ce qui change en local n'est pas l'existence du verrou, c'est **ce qu'il
 * partage** : une base sur `stub.invalid` ne résout jamais (RFC 2606), donc
 * aucun magasin partagé n'existe, donc `VerrouEnMemoire` est la seule
 * implémentation dont la portée corresponde à la réalité. Le choix est
 * **dérivé de l'URL de base**, jamais d'un drapeau d'environnement : un drapeau
 * se met à `false` pour faire passer un test et ne revient jamais.
 *
 * ⚠️ **ET LA BORNE, ÉCRITE AVEC LA DÉCISION.** `VerrouEnMemoire` ne voit pas un
 *    second processus. En local, deux démons stdio démarreront donc tous les
 *    deux. Ce n'est pas couvert, c'est ASSUMÉ, et la phrase est ici pour qu'on
 *    ne lise pas « le verrou est pris » comme « deux socles sont impossibles ».
 */
export interface ChoixDImplementationDuVerrou {
  /** L'implémentation retenue, et ce qu'elle voit réellement. */
  readonly implementation: "postgres" | "mémoire";
  /** Ce qui l'a décidée. Une URL, jamais un drapeau. */
  readonly motif: string;
  /** Vrai quand l'implémentation retenue ne voit PAS les autres processus. */
  readonly aveugleAuxAutresProcessus: boolean;
}

/**
 * CE QUE LA RELECTURE DOIT RENDRE, ET PAR QUELLE CONNEXION.
 *
 * ⚠️ **ELLE INTERROGE LA MÊME CONNEXION QUE L'ACQUISITION.** Interroger
 *    `pg_locks` par une connexion du pool répondrait « le verrou est tenu » sans
 *    dire PAR QUI : un verrou tenu par une autre instance a exactement la même
 *    apparence. C'est la forme la plus coûteuse de faux vert, parce qu'elle est
 *    verte précisément dans le cas qu'on cherche.
 */
export interface RelectureDuVerrouPostgres {
  readonly etat: EtatDuVerrou;
  readonly instance: InstanceDuSocle | null;
  readonly connexion: ConnexionDeVerrou;
}
