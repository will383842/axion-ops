/**
 * `core/instance/postgres.ts` — **LA MOITIÉ MANQUANTE DE L'ADR 0018, ÉCRITE.**
 *
 * `core/instance/contrat-postgres.ts` dit à quoi cette implémentation est
 * confrontée ; ce fichier-ci en est le corps. Voir **ADR 0024**.
 *
 * ═══ LE DÉFAUT QU'ELLE FERME, ET QU'AUCUN AUTRE ENDROIT NE PEUT FERMER ═══
 *
 * Un verrou consultatif **de session** PostgreSQL est relâché quand la session
 * qui le tient se ferme. Un pool ferme et rouvre ses connexions sans prévenir
 * personne : un verrou pris sur une connexion empruntée au pool est relâché **en
 * silence**, à un moment que rien n'observe, et le socle continue de croire
 * qu'il l'a. C'est exactement la forme du défaut que `relireLaSanteMonoInstance`
 * existe pour voir — sauf qu'ici le socle se l'infligerait lui-même, à chaque
 * recyclage.
 *
 * D'où les trois propriétés que ce module tient, et qu'aucune n'est cosmétique :
 *
 *  1. **une connexion DÉDIÉE, hors du pool**, qui ne sert aucune requête
 *     applicative et porte un `application_name` reconnaissable ;
 *  2. **la relecture interroge LA MÊME session que l'acquisition** — l'identité
 *     de backend est capturée à l'acquisition et RECONFRONTÉE à chaque
 *     relecture. Interroger par une connexion du pool répondrait « tenu » sans
 *     dire PAR QUI : un verrou tenu par une AUTRE instance a exactement la même
 *     apparence, et c'est la forme la plus coûteuse de faux vert — verte
 *     précisément dans le cas qu'on cherche ;
 *  3. **la perte de la connexion est la perte du verrou, pas une erreur à
 *     rattraper.** Aucune reconnexion automatique : elle effacerait la fenêtre
 *     pendant laquelle deux socles ont pu servir, et cette fenêtre est
 *     précisément ce que le § 20 doit connaître.
 *
 * ═══ CE QUE CE MODULE NE FAIT PAS ═══
 *
 * ⚠️ **IL N'OUVRE AUCUNE CONNEXION LUI-MÊME ET N'IMPORTE AUCUN PILOTE.** La
 *    session lui est DONNÉE par un port ({@link OuvertureDeSessionDediee}) que
 *    la racine de composition fournit. C'est ce qui permet d'éprouver les trois
 *    propriétés ci-dessus **sans base et sans réseau** — et une garde qu'on ne
 *    peut pas exécuter en intégration continue finit désactivée.
 *
 * ⚠️ **IL NE PORTE AUCUN IDENTIFIANT D'INFRASTRUCTURE.** Le dépôt est PUBLIC
 *    (§ 29) : ni hôte, ni base, ni utilisateur n'apparaissent dans un message.
 *    L'identité de backend capturée reste INTERNE — elle sert la comparaison,
 *    elle ne sort dans aucune valeur rendue.
 */

import { createHash } from "node:crypto";

import type {
  CleDeVerrouDerivee,
  ChoixDImplementationDuVerrou,
  ConnexionDeVerrou,
  RelectureDuVerrouPostgres,
} from "./contrat-postgres.js";
import type {
  EtatDuVerrou,
  InstanceDuSocle,
  ResultatAcquisition,
  VerrouDInstance,
} from "./verrou.js";
import { DOMAINE_DU_VERROU, frapperInstance } from "./verrou.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA CLÉ — DÉRIVÉE DU DOMAINE, JAMAIS ÉCRITE EN DUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA VARIANTE À UN SEUL ARGUMENT 64 BITS**, pas celle à deux entiers 32 bits.
 *
 * L'ADR 0024 tranche : « deux entiers offrent deux fois plus de place pour une
 * erreur de recopie, et aucun bénéfice ici ».
 */
export const BITS_RETENUS_DE_LA_CLE = 64;

/**
 * La clé effective, et ce qu'il faut pour la RELIRE dans le catalogue des
 * verrous.
 *
 * ⚠️ **LES DEUX MOITIÉS 32 BITS NE SONT PAS UNE SECONDE CLÉ.** PostgreSQL range
 *    un verrou consultatif 64 bits sous deux colonnes de 32 bits ; les relire
 *    exige donc de décomposer. La décomposition se fait ICI, à partir de la
 *    MÊME valeur qui a servi à prendre le verrou, et nulle part ailleurs : c'est
 *    ce qui empêche la « recopie divergente » que l'ADR 0018 écarte. Le jour où
 *    l'une des deux moitiés serait calculée à part, elles pourraient désigner un
 *    verrou que personne ne tient — et la relecture rendrait `perdu` sur un
 *    verrou bien tenu, ou pire, l'inverse.
 */
export interface CleDuVerrou {
  /** La valeur passée telle quelle à la prise du verrou, en 64 bits SIGNÉS. */
  readonly cle: bigint;
  /** Les 32 bits de poids fort, tels que le catalogue les range. */
  readonly moitieHaute: number;
  /** Les 32 bits de poids faible. */
  readonly moitieBasse: number;
  readonly derivation: CleDeVerrouDerivee;
}

/**
 * DÉRIVE LA CLÉ DU DOMAINE. Une empreinte, tronquée à la largeur du magasin.
 *
 * ⚠️ **LE TRONQUAGE EST UNE PERTE, ET ELLE EST ASSUMÉE.** Deux domaines
 *    distincts pourraient tomber sur la même clé. Le socle n'a qu'un domaine,
 *    donc la collision n'a personne avec qui entrer en conflit — et le jour où
 *    un second apparaîtra, cette phrase est l'endroit où on s'en souviendra.
 *
 * ⚠️ **AUCUN ENTIER LITTÉRAL N'EST ÉCRIT.** L'ADR 0018 l'écarte nommément :
 *    « elle serait recopiée dans une migration et divergerait en silence ».
 *    Changer {@link DOMAINE_DU_VERROU} change la clé, et un témoin le mesure.
 */
export function cleDuVerrouPostgres(domaine: string = DOMAINE_DU_VERROU): CleDuVerrou {
  const empreinte = createHash("sha256").update(domaine, "utf8").digest();
  const nonSignee = empreinte.readBigUInt64BE(0);
  return {
    cle: BigInt.asIntN(BITS_RETENUS_DE_LA_CLE, nonSignee),
    moitieHaute: Number(nonSignee >> 32n),
    moitieBasse: Number(nonSignee & 0xffff_ffffn),
    derivation: { domaine, bitsRetenus: BITS_RETENUS_DE_LA_CLE },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT DE LA CONNEXION DÉDIÉE
// ═════════════════════════════════════════════════════════════════════════════

/** Une ligne rendue par le magasin. Aucune forme n'est supposée. */
export type LigneDuMagasin = Readonly<Record<string, unknown>>;

/** Une interrogation paramétrée. Les paramètres ne sont JAMAIS interpolés. */
export interface RequeteDuVerrou {
  readonly texte: string;
  readonly parametres: readonly string[];
}

/**
 * **LA CONNEXION DÉDIÉE, TELLE QUE LE VERROU LA VOIT.**
 *
 * Trois propriétés, et chacune ferme une porte (`contrat-postgres.ts`) : elle
 * n'est jamais rendue au pool, elle ne sert aucune requête applicative, et elle
 * porte un `application_name` reconnaissable devant le catalogue des sessions.
 *
 * ⚠️ `ouverte` EST UN FAIT OBSERVÉ, PAS UN SOUVENIR. C'est lui qui distingue
 *    « la connexion est tombée, donc le verrou est perdu » de « le magasin n'a
 *    pas répondu, donc je ne sais pas » — deux états qui refusent tous les deux,
 *    mais qui ne se réparent pas du même geste (§ 23, même motif qu'`absent` /
 *    `verrouillé`).
 */
export interface SessionDeVerrou {
  readonly applicationName: string;
  readonly ouverte: boolean;
  interroger(requete: RequeteDuVerrou): Promise<readonly LigneDuMagasin[]>;
  fermer(): Promise<void>;
}

/** Ce que la racine de composition fournit : de quoi ouvrir UNE session dédiée. */
export type OuvertureDeSessionDediee = () => Promise<SessionDeVerrou>;

/**
 * Ce que la connexion annonce au catalogue des sessions.
 *
 * ⚠️ C'est ce qui permet à un humain de distinguer « le socle tient son verrou »
 *    de « une connexion oubliée traîne ». Il ne porte NI identifiant d'instance,
 *    NI nom d'hôte : le dépôt est public, et le rôle de la connexion suffit.
 */
export const APPLICATION_NAME_DU_VERROU = "axion-ops · verrou d'instance";

/**
 * LES DEUX REQUÊTES. Écrites ici, et nulle part ailleurs.
 *
 * ⚠️ **LA RELECTURE NE REPREND PAS LE VERROU.** Reprendre le verrou pour savoir
 *    si on le tient est le piège du verrou consultatif : une seconde prise par
 *    la MÊME session réussit toujours et incrémente un compteur qu'il faudrait
 *    ensuite décrémenter autant de fois. La relecture INTERROGE donc le
 *    catalogue, et confronte l'identité de backend.
 */
export const REQUETES_DU_VERROU = {
  /** Prend le verrou et rapporte QUI le tient — la session elle-même. */
  acquisition: "SELECT pg_backend_pid()::text AS session, pg_try_advisory_lock($1::bigint) AS pris",
  /**
   * Relit : la session courante, et combien de verrous consultatifs de CETTE
   * clé sont tenus PAR ELLE. Un verrou tenu par une autre session compte zéro.
   */
  relecture:
    "SELECT pg_backend_pid()::text AS session, " +
    "(SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objsubid = 1 " +
    "AND classid = $1::oid AND objid = $2::oid AND pid = pg_backend_pid()) AS tenus",
  /** Rend le verrou. Appelée à l'arrêt propre ; jamais nécessaire à la sûreté. */
  liberation: "SELECT pg_advisory_unlock($1::bigint) AS rendu",
} as const;

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERROU
// ═════════════════════════════════════════════════════════════════════════════

/** Ce dont {@link VerrouPostgres} a besoin, et rien de plus. */
export interface OptionsVerrouPostgres {
  readonly ouvrirLaSession: OuvertureDeSessionDediee;
  readonly instance?: InstanceDuSocle;
  readonly domaine?: string;
}

/**
 * L'identité de session telle que le magasin la rend, ou la chaîne vide.
 *
 * ⚠️ **UNE VALEUR D'UN AUTRE TYPE DEVIENT LA CHAÎNE VIDE, JAMAIS UNE
 *    STRINGIFICATION.** `String(unObjet)` rendrait « [object Object] » pour
 *    TOUTE valeur non scalaire : deux réponses malformées différentes se
 *    ressembleraient alors trait pour trait, et la confrontation d'identité les
 *    déclarerait ÉGALES — c'est-à-dire rendrait « tenu » sur un magasin qui ne
 *    répond plus rien de sensé. La chaîne vide, elle, ne peut être égale qu'à
 *    une autre chaîne vide, et l'acquisition n'en produit jamais.
 */
function identiteDeSession(valeur: unknown): string {
  return typeof valeur === "string" ? valeur : typeof valeur === "number" ? String(valeur) : "";
}

function nombreDe(valeur: unknown): number {
  if (typeof valeur === "number") return valeur;
  if (typeof valeur === "bigint") return Number(valeur);
  if (typeof valeur === "string") {
    const lu = Number(valeur);
    return Number.isFinite(lu) ? lu : 0;
  }
  return 0;
}

/**
 * **LE VERROU CONSULTATIF DE SESSION, SUR SA CONNEXION DÉDIÉE.**
 *
 * ⚠️ **AUCUNE MÉTHODE NE LÈVE.** Le port l'exige : « elle ne lève pas sur un
 *    magasin injoignable — elle rend `indisponible` ». Une exception y serait
 *    indiscernable d'un défaut de câblage, et c'est
 *    `deciderDemarrageMonoInstance` qui doit trancher ce que le socle en fait.
 *
 * ⚠️ **AUCUNE RECONNEXION.** `#sessionPerdue` est un aller simple. Une
 *    reconnexion qui reprendrait le verrou sans le dire effacerait la fenêtre
 *    pendant laquelle deux socles ont pu servir — et l'index de provenance du
 *    § 20, local au processus, aurait laissé passer la moitié des appels.
 *    `ouverturesDeSession` est PUBLIC pour qu'une garde le mesure au lieu de
 *    croire cette phrase.
 */
export class VerrouPostgres implements VerrouDInstance {
  readonly #ouvrirLaSession: OuvertureDeSessionDediee;
  readonly #instance: InstanceDuSocle;
  readonly #cle: CleDuVerrou;

  #session: SessionDeVerrou | null = null;
  #sessionDeLAcquisition: string | null = null;
  #sessionCourante: string | null = null;
  #sessionPerdue = false;
  #ouvertures = 0;
  #relectures = 0;

  constructor(options: OptionsVerrouPostgres) {
    this.#ouvrirLaSession = options.ouvrirLaSession;
    this.#instance = options.instance ?? frapperInstance();
    this.#cle = cleDuVerrouPostgres(options.domaine ?? DOMAINE_DU_VERROU);
  }

  /** L'identité de CE socle-ci. Le healthcheck la rend telle quelle. */
  get instance(): InstanceDuSocle {
    return this.#instance;
  }

  /** La clé DÉRIVÉE, annoncée pour qu'une garde la confronte au domaine. */
  get cle(): CleDuVerrou {
    return this.#cle;
  }

  /** Combien de sessions dédiées ont été OUVERTES. La bonne valeur est 0 ou 1. */
  get ouverturesDeSession(): number {
    return this.#ouvertures;
  }

  /** Combien de relectures ont interrogé le magasin. Un zéro rend le § 22 muet. */
  get relectures(): number {
    return this.#relectures;
  }

  /**
   * CE QUE LA CONNEXION DÉCLARE — et si c'est TOUJOURS celle de l'acquisition.
   *
   * ⚠️ `memeSessionQuAlAcquisition` EST DÉRIVÉ DE LA DERNIÈRE RELECTURE, pas
   *    d'un drapeau posé à l'acquisition. Un drapeau répondrait « oui »
   *    exactement dans le cas où la connexion vient d'être recyclée.
   */
  connexion(): ConnexionDeVerrou {
    return {
      applicationName: this.#session?.applicationName ?? APPLICATION_NAME_DU_VERROU,
      memeSessionQuAlAcquisition:
        this.#sessionDeLAcquisition !== null &&
        this.#sessionCourante === this.#sessionDeLAcquisition,
    };
  }

  async acquerir(): Promise<ResultatAcquisition> {
    if (this.#sessionPerdue) {
      return {
        etat: "perdu",
        instance: null,
        detenteur: null,
        message:
          "La connexion dédiée qui tenait le verrou est tombée. Le verrou est PERDU avec elle : " +
          "il n'est pas repris en silence. Redémarrer le socle.",
      };
    }

    let session: SessionDeVerrou;
    try {
      session = await this.#ouvrirLaSession();
      this.#ouvertures += 1;
      this.#session = session;
    } catch {
      // Fail-closed, et la cause n'est PAS relayée : elle peut porter une
      // chaîne de connexion, et ce dépôt est public (§ 29).
      return {
        etat: "indisponible",
        instance: null,
        detenteur: null,
        message:
          "Le magasin de verrous n'a pas ouvert la connexion dédiée. Le socle ne sait pas s'il " +
          "est seul, donc il n'affirme rien et ne démarre pas. Réparer le magasin.",
      };
    }

    try {
      const lignes = await session.interroger({
        texte: REQUETES_DU_VERROU.acquisition,
        parametres: [this.#cle.cle.toString()],
      });
      const ligne = lignes[0];
      const pris = ligne?.["pris"] === true;
      const identite = identiteDeSession(ligne?.["session"]);

      if (!pris) {
        return {
          etat: "refusé",
          instance: null,
          // ⚠️ MUET SUR LE DÉTENTEUR, ET C'EST LA VÉRITÉ DU MÉCANISME : un
          //    verrou consultatif ne nomme pas qui le tient. Inventer un
          //    identifiant serait pire que se taire.
          detenteur: null,
          message:
            "Verrou d'instance déjà tenu par une autre instance : ce socle ne peut pas servir. " +
            "Arrêter l'instance en place, ou ramener le déploiement à une seule réplique — " +
            "l'index de provenance du § 20 est local au processus.",
        };
      }

      this.#sessionDeLAcquisition = identite;
      this.#sessionCourante = identite;
      return {
        etat: "tenu",
        instance: this.#instance,
        detenteur: this.#instance,
        message:
          "Verrou d'instance acquis sur une connexion DÉDIÉE, hors du pool : ce socle est seul " +
          "à servir. La perte de cette connexion sera la perte du verrou.",
      };
    } catch {
      return {
        etat: "indisponible",
        instance: null,
        detenteur: null,
        message:
          "Le magasin de verrous n'a pas répondu à la prise du verrou. Le socle ne sait pas " +
          "s'il est seul, donc il n'affirme rien et ne démarre pas. Réparer le magasin.",
      };
    }
  }

  /**
   * RELIT — et rend, avec l'état, la connexion qui a répondu.
   *
   * ⚠️ **ELLE RELIT, ELLE NE SE SOUVIENT PAS.** Rendre un drapeau posé à
   *    l'acquisition ferait une garde verte pour la pire des raisons : elle
   *    répondrait « tenu » exactement dans le cas où le verrou vient d'être
   *    perdu.
   */
  async relireLeVerrou(): Promise<RelectureDuVerrouPostgres> {
    this.#relectures += 1;
    const session = this.#session;

    // ── LA CONNEXION EST TOMBÉE : LE VERROU EST PERDU, PAS INDISPONIBLE ─────
    // Un verrou de session n'existe pas sans sa session. Ce n'est pas une
    // ignorance, c'est un FAIT — et les deux se réparent différemment.
    if (session === null || !session.ouverte) {
      this.#sessionPerdue = session !== null;
      this.#sessionCourante = null;
      return {
        etat: session === null ? "indisponible" : "perdu",
        instance: null,
        connexion: this.connexion(),
      };
    }

    try {
      const lignes = await session.interroger({
        texte: REQUETES_DU_VERROU.relecture,
        parametres: [String(this.#cle.moitieHaute), String(this.#cle.moitieBasse)],
      });
      const ligne = lignes[0];
      this.#sessionCourante = identiteDeSession(ligne?.["session"]);
      const tenus = nombreDe(ligne?.["tenus"]);

      // ⚠️ LA CONFRONTATION D'IDENTITÉ EST LA MOITIÉ QUI COMPTE. Le catalogue
      //    ne compte que les verrous tenus par la session courante ; si cette
      //    session n'est PLUS celle de l'acquisition, le pool a recyclé la
      //    connexion — le verrou a été relâché en silence, puis peut-être repris
      //    par la nouvelle session. Répondre « tenu » là serait vert exactement
      //    dans le cas qu'on cherche.
      if (this.#sessionCourante !== this.#sessionDeLAcquisition) {
        this.#sessionPerdue = true;
        return { etat: "perdu", instance: null, connexion: this.connexion() };
      }

      if (tenus <= 0) {
        this.#sessionPerdue = true;
        return { etat: "perdu", instance: null, connexion: this.connexion() };
      }

      return { etat: "tenu", instance: this.#instance, connexion: this.connexion() };
    } catch {
      // Le magasin n'a pas répondu, mais la connexion se dit ouverte : on ne
      // sait pas. `indisponible`, jamais `perdu` — les deux refusent, mais
      // annoncer une perte enverrait redémarrer un socle qui va bien.
      return { etat: "indisponible", instance: null, connexion: this.connexion() };
    }
  }

  async relire(): Promise<EtatDuVerrou> {
    return (await this.relireLeVerrou()).etat;
  }

  async liberer(): Promise<void> {
    const session = this.#session;
    this.#session = null;
    this.#sessionCourante = null;
    if (session === null) return;
    try {
      if (session.ouverte) {
        await session.interroger({
          texte: REQUETES_DU_VERROU.liberation,
          parametres: [this.#cle.cle.toString()],
        });
      }
    } catch {
      // La libération n'est JAMAIS nécessaire à la sûreté : fermer la session
      // relâche le verrou de toute façon. Une levée ici ne doit pas empêcher
      // l'arrêt propre du reste du socle.
    }
    try {
      await session.fermer();
    } catch {
      // Idem.
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QUELLE IMPLÉMENTATION, ET POURQUOI
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'HÔTE QUI NE RÉSOUT JAMAIS — TLD réservé, RFC 2606.
 *
 * ⚠️ C'est la convention de valeur factice du dépôt : un code qui le voit doit
 *    court-circuiter, pas tenter la connexion.
 */
export const HOTE_SANS_MAGASIN_PARTAGE = "stub.invalid";

/**
 * Le choix, ET ce qui l'a décidé.
 *
 * ⚠️ `urlLisible` N'EST PAS UN DÉTAIL DE CONFORT. Une URL de base illisible
 *    tomberait sinon sur « mémoire » exactement comme une URL factice, et le
 *    socle prendrait un verrou aveugle aux autres processus **en production**,
 *    sans un mot. C'est la racine qui refuse de démarrer sur ce cas ; ce champ
 *    est ce qui le lui permet.
 */
export interface ChoixDuVerrou extends ChoixDImplementationDuVerrou {
  readonly urlLisible: boolean;
}

/**
 * **LE VERROU EST TOUJOURS PRIS. SEULE SON IMPLÉMENTATION DÉPEND DU MAGASIN.**
 *
 * La tentation à laquelle cette fonction résiste : « en local, on n'a qu'un seul
 * socle, le verrou ne sert à rien ». C'est faux — deux démons stdio lancés
 * depuis deux terminaux sont exactement deux socles, et le § 20 les verrait une
 * fois sur deux.
 *
 * ⚠️ **LE CHOIX EST DÉRIVÉ DE L'URL, JAMAIS D'UN DRAPEAU.** Un drapeau se met à
 *    `false` pour faire passer un test et ne revient jamais.
 *
 * ⚠️ **ET LA BORNE, ÉCRITE AVEC LA DÉCISION.** Le double en mémoire ne voit pas
 *    un second processus. En local, deux démons stdio démarreront donc tous les
 *    deux. Ce n'est pas couvert, c'est ASSUMÉ — `aveugleAuxAutresProcessus` le
 *    dit dans la valeur rendue, pour que la borne voyage avec le choix au lieu
 *    de rester dans ce commentaire.
 */
export function choisirImplementationDuVerrou(urlDeBase: string | undefined): ChoixDuVerrou {
  if (urlDeBase === undefined || urlDeBase.trim().length === 0) {
    return {
      implementation: "mémoire",
      motif:
        "aucune URL de base n'est configurée : il n'existe aucun magasin partagé où poser un " +
        "verrou consultatif.",
      aveugleAuxAutresProcessus: true,
      urlLisible: true,
    };
  }

  let hote: string;
  try {
    hote = new URL(urlDeBase).hostname;
  } catch {
    return {
      implementation: "mémoire",
      motif:
        "l'URL de base est ILLISIBLE. Le socle ne peut désigner aucun magasin de verrous, et " +
        "un verrou en mémoire ne verrait pas un second processus : le démarrage doit refuser.",
      aveugleAuxAutresProcessus: true,
      urlLisible: false,
    };
  }

  const factice =
    hote === HOTE_SANS_MAGASIN_PARTAGE || hote.endsWith(`.${HOTE_SANS_MAGASIN_PARTAGE}`);
  if (factice) {
    return {
      implementation: "mémoire",
      motif:
        `l'hôte de la base est « ${HOTE_SANS_MAGASIN_PARTAGE} » (TLD réservé, RFC 2606) : il ne ` +
        "résout jamais, donc aucun magasin partagé n'existe et seul le double en mémoire a une " +
        "portée qui corresponde à la réalité.",
      aveugleAuxAutresProcessus: true,
      urlLisible: true,
    };
  }

  return {
    implementation: "postgres",
    motif:
      "l'URL de base désigne un magasin réel : le verrou consultatif de session est pris sur " +
      "une connexion dédiée, hors du pool.",
    aveugleAuxAutresProcessus: false,
    urlLisible: true,
  };
}
