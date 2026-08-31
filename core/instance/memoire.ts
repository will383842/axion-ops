/**
 * `core/instance/memoire.ts` — LE DOUBLE EN MÉMOIRE DU VERROU D'INSTANCE.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * L'ADR 0018 retient un **verrou consultatif de session PostgreSQL**, et il écrit
 * pourquoi : il se libère tout seul quand la connexion tombe, donc un socle tué
 * par `SIGKILL` ne laisse pas un verrou orphelin qui empêcherait tout
 * redémarrage. Mais le même ADR pose la contrainte inverse, aussi nettement :
 *
 *   « ⚠️ Ce choix appartient à l'ADAPTATION, pas au port. `core/` ne connaît ni
 *     Prisma ni SQL : `VerrouDInstance` doit pouvoir être tenu par un double en
 *     mémoire, sans quoi la garde ne serait éprouvable qu'avec une base — et une
 *     garde qu'on ne peut pas exécuter en CI finit désactivée. »
 *
 * Ce fichier EST ce double. Il suit le motif des trois autres modules du socle,
 * qui posent tous le leur dans un fichier ORDINAIRE et non dans un `.spec.ts` :
 * `core/vault/depot.ts`, `core/policy/depot.ts`, `core/audit/memoire.ts`,
 * `core/limits/memoire.ts`. Un double vivant dans un test n'est importable que
 * par un autre test.
 *
 * ═══ CE QU'IL N'EST PAS ═══
 *
 * ⚠️ **CE N'EST PAS UNE IMPLÉMENTATION DE PRODUCTION, ET L'ÉCART N'EST PAS
 *    COSMÉTIQUE.** L'exclusivité est ici tenue par le fait que tout vit dans un
 *    seul tas JavaScript — c'est-à-dire par la propriété même que le verrou
 *    existe pour ne PAS supposer. Deux conteneurs sur deux hôtes ne partagent
 *    aucun {@link MagasinDeVerrousEnMemoire}. Ce double éprouve la DÉCISION et le
 *    CÂBLAGE ; il ne remplace pas le verrou consultatif.
 *
 * ⚠️ **IL NE PORTE AUCUNE DONNÉE, ET SÛREMENT PAS UN IDENTIFIANT
 *    D'INFRASTRUCTURE.** Ce qu'il retient d'une instance est ce que
 *    `InstanceDuSocle` retient : un identifiant opaque et une date. Ni `pid`, ni
 *    nom d'hôte, ni adresse — le dépôt est PUBLIC (§ 29).
 */

import type {
  EtatDuVerrou,
  InstanceDuSocle,
  ResultatAcquisition,
  VerrouDInstance,
} from "./verrou.js";
import { DOMAINE_DU_VERROU, frapperInstance } from "./verrou.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE MAGASIN PARTAGÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE DEUX SOCLES PARTAGENT — et rien d'autre.
 *
 * Deux {@link VerrouEnMemoire} branchés sur le MÊME magasin se voient ; branchés
 * sur deux magasins, ils ne se voient pas. C'est ce qui permet à une garde de
 * fabriquer les deux situations sans base : le second démarrage refusé d'un
 * côté, l'aveuglement de deux hôtes séparés de l'autre.
 *
 * ⚠️ LES COMPTES SONT PUBLICS ET SERVENT AUX GARDES. Une garde qui n'annoncerait
 *    que « le second démarrage est refusé » serait verte le jour où elle ne
 *    tente plus rien : `tentatives` distingue « refusé » de « pas essayé ».
 */
export class MagasinDeVerrousEnMemoire {
  /** domaine → détenteur courant. Aucune entrée = personne ne tient. */
  readonly #detenteurs = new Map<string, InstanceDuSocle>();
  #injoignable = false;
  #tentatives = 0;
  #accordees = 0;
  #relectures = 0;
  #liberations = 0;

  /** Combien d'acquisitions ont été TENTÉES. Un zéro rend toute garde vacuous. */
  get tentatives(): number {
    return this.#tentatives;
  }

  /** Combien ont été ACCORDÉES. À deux instances, la bonne valeur est 1. */
  get acquisitionsAccordees(): number {
    return this.#accordees;
  }

  /** Combien de fois le verrou a été RELU. Le healthcheck en fait une par appel. */
  get relectures(): number {
    return this.#relectures;
  }

  get liberations(): number {
    return this.#liberations;
  }

  /** Qui tient le domaine, ou `null`. Pour les gardes, sans passer par le port. */
  detenteur(domaine: string = DOMAINE_DU_VERROU): InstanceDuSocle | null {
    return this.#detenteurs.get(domaine) ?? null;
  }

  /**
   * Le magasin ne répond plus. C'est le quatrième état, et il est FABRICABLE :
   * sans cela `indisponible` serait déclaré et jamais éprouvé.
   */
  rendreInjoignable(): void {
    this.#injoignable = true;
  }

  /** Le magasin répond de nouveau. Le verrou, lui, n'est pas rendu pour autant. */
  retablir(): void {
    this.#injoignable = false;
  }

  get injoignable(): boolean {
    return this.#injoignable;
  }

  /**
   * ⚠️ RÉSERVÉ AUX GARDES ET AUX TÉMOINS. Retire le détenteur sans que personne
   *    n'ait appelé `liberer()` — c'est la seule façon de FABRIQUER l'état
   *    `perdu`, celui que l'ADR 0018 nomme comme le plus probable (« personne ne
   *    démarre volontairement deux socles ; une connexion, elle, tombe toute
   *    seule ») et que le contrôle de démarrage ne voit jamais.
   */
  arracherLeVerrou(domaine: string = DOMAINE_DU_VERROU): boolean {
    return this.#detenteurs.delete(domaine);
  }

  /** Prend le domaine pour `instance`, ou dit qui le tient déjà. */
  prendre(domaine: string, instance: InstanceDuSocle): InstanceDuSocle | null {
    this.#tentatives += 1;
    const detenteur = this.#detenteurs.get(domaine);
    if (detenteur !== undefined) return detenteur;
    this.#detenteurs.set(domaine, instance);
    this.#accordees += 1;
    return null;
  }

  /** Relit le détenteur courant. Compté, pour qu'un healthcheck muet se voie. */
  relire(domaine: string): InstanceDuSocle | null {
    this.#relectures += 1;
    return this.#detenteurs.get(domaine) ?? null;
  }

  /** Rend le domaine, si et seulement si `instance` le tient. */
  rendre(domaine: string, instance: InstanceDuSocle): boolean {
    if (this.#detenteurs.get(domaine)?.instanceId !== instance.instanceId) return false;
    this.#detenteurs.delete(domaine);
    this.#liberations += 1;
    return true;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERROU
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE LE MAGASIN SAIT DIRE DU DÉTENTEUR, ET CE QU'IL N'EN SAIT PAS.
 *
 * ⚠️ **UN VERROU CONSULTATIF POSTGRES NE NOMME PAS SON DÉTENTEUR.**
 *    `ResultatAcquisition.detenteur` le dit déjà : « elle peut être `null` même
 *    en `refusé` ». Ce double SAIT le nommer, ce qui en ferait un double PLUS
 *    capable que l'implémentation réelle — et une garde écrite contre lui
 *    exigerait un nom que la production ne pourra pas rendre.
 *
 *    D'où ce réglage, et son défaut À `false` : le double est **muet comme le
 *    verrou consultatif** sauf si une garde demande explicitement le contraire.
 *    Le message, lui, reste juste dans les deux cas — « une autre instance »,
 *    jamais un identifiant inventé.
 */
export interface OptionsVerrouEnMemoire {
  /** Le domaine à prendre. Défaut : {@link DOMAINE_DU_VERROU}. */
  readonly domaine?: string;
  /** Nommer le détenteur en cas de refus. Défaut `false` — comme Postgres. */
  readonly nommeLeDetenteur?: boolean;
}

/**
 * UN {@link VerrouDInstance} EN MÉMOIRE.
 *
 * ⚠️ **`relire()` NE SE SOUVIENT DE RIEN**, et c'est le point le plus facile à
 *    rater. L'ADR 0018 exclut explicitement « un verrou qui se souvient » :
 *    rendre un drapeau posé à l'acquisition ferait une garde VERTE exactement
 *    dans le cas où le verrou vient d'être perdu. Cette classe ne garde donc
 *    aucun booléen `#tenu` : elle relit le magasin, à chaque fois, et compare
 *    l'identifiant.
 *
 * ⚠️ **`relire()` NE REND JAMAIS `refusé`, ET C'EST UNE DÉRIVATION, PAS UN
 *    OUBLI.** `refusé` est un état de DÉMARRAGE — « une autre instance le tenait
 *    au moment du démarrage ». En cours de vie, tout ce qui n'est pas « c'est
 *    moi » est `perdu` : que le magasin soit vide ou qu'un autre l'ait repris,
 *    le geste qui répare est le même (redémarrer), et la garde du § 20 est
 *    douteuse dans les deux cas. Le repli tombe du côté strict.
 */
export class VerrouEnMemoire implements VerrouDInstance {
  readonly #magasin: MagasinDeVerrousEnMemoire;
  readonly #instance: InstanceDuSocle;
  readonly #domaine: string;
  readonly #nommeLeDetenteur: boolean;

  constructor(
    magasin: MagasinDeVerrousEnMemoire,
    instance: InstanceDuSocle = frapperInstance(),
    options: OptionsVerrouEnMemoire = {},
  ) {
    this.#magasin = magasin;
    this.#instance = instance;
    this.#domaine = options.domaine ?? DOMAINE_DU_VERROU;
    this.#nommeLeDetenteur = options.nommeLeDetenteur ?? false;
  }

  /** L'identité de CE socle-ci. Le healthcheck la rend telle quelle. */
  get instance(): InstanceDuSocle {
    return this.#instance;
  }

  /** Le domaine pris. La clé du magasin en DÉRIVE ; elle ne s'écrit pas en dur. */
  get domaine(): string {
    return this.#domaine;
  }

  /**
   * ⚠️ NE LÈVE PAS SUR UN MAGASIN INJOIGNABLE — elle rend `indisponible`. Le
   *    port l'exige : une exception y serait indiscernable d'un défaut de
   *    câblage, et c'est l'arbitre qui doit trancher ce que le socle en fait.
   */
  acquerir(): Promise<ResultatAcquisition> {
    if (this.#magasin.injoignable) {
      return Promise.resolve({
        etat: "indisponible",
        instance: null,
        detenteur: null,
        message:
          "Magasin de verrous injoignable : aucune acquisition n'a pu être tentée. Le socle " +
          "ne sait pas s'il est seul, donc il n'affirme rien.",
      });
    }

    const deja = this.#magasin.prendre(this.#domaine, this.#instance);
    if (deja === null) {
      return Promise.resolve({
        etat: "tenu",
        instance: this.#instance,
        detenteur: this.#instance,
        message: "Verrou d'instance acquis : ce socle est seul à servir.",
      });
    }

    return Promise.resolve({
      etat: "refusé",
      instance: null,
      // Muet par défaut, comme un verrou consultatif Postgres.
      detenteur: this.#nommeLeDetenteur ? deja : null,
      message:
        "Verrou d'instance déjà tenu par une autre instance : ce socle ne peut pas servir. " +
        "Arrêter l'instance en place, ou ramener le déploiement à une seule réplique.",
    });
  }

  relire(): Promise<EtatDuVerrou> {
    if (this.#magasin.injoignable) return Promise.resolve("indisponible");
    const detenteur = this.#magasin.relire(this.#domaine);
    return Promise.resolve(detenteur?.instanceId === this.#instance.instanceId ? "tenu" : "perdu");
  }

  liberer(): Promise<void> {
    this.#magasin.rendre(this.#domaine, this.#instance);
    return Promise.resolve();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE TÉMOIN — UN VERROU QUI ACCORDE DEUX FOIS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UN VERROU RÉENTRANT — CELUI QUI NE TIENT RIEN.**
 *
 * ⚠️ IL EXISTE POUR QUE LA GARDE PUISSE PROUVER QU'ELLE SAIT DIRE **NON**. C'est
 *    le témoin nommé par l'ADR 0018 en face de la garde G1 : « le témoin qui la
 *    fait rougir — un verrou réentrant (qui accorderait deux fois) : le compte
 *    de démarrages passe à 2 ». Une garde qui n'a jamais vu son propre échec est
 *    une garde dont personne ne sait si elle regarde quelque chose.
 *
 * ⚠️ IL N'EST **JAMAIS** UN REPLI ADMISSIBLE. Aucun module de production ne doit
 *    l'instancier : il accorde `tenu` à tout le monde, ce qui est exactement le
 *    défaut que l'ADR 0018 ferme. Son nom le dit, et c'est délibéré.
 */
export class VerrouReentrantTemoin implements VerrouDInstance {
  readonly #instance: InstanceDuSocle;
  #accords = 0;

  constructor(instance: InstanceDuSocle = frapperInstance()) {
    this.#instance = instance;
  }

  /** Combien de fois il a accordé le verrou. À deux socles, il rend 2. */
  get accords(): number {
    return this.#accords;
  }

  acquerir(): Promise<ResultatAcquisition> {
    this.#accords += 1;
    return Promise.resolve({
      etat: "tenu",
      instance: this.#instance,
      detenteur: this.#instance,
      message: "TÉMOIN — ce verrou accorde toujours. Il ne tient rien.",
    });
  }

  relire(): Promise<EtatDuVerrou> {
    return Promise.resolve("tenu");
  }

  liberer(): Promise<void> {
    return Promise.resolve();
  }
}
