/**
 * `ops/composition/noyau.ts` — **LA CHAÎNE DES QUATORZE ÉTAPES, COMPOSÉE.**
 *
 * ═══ LE MANQUE QUE CE FICHIER COMBLE ═══
 *
 * À la recette du lot 2, le socle **DÉMARRAIT et ne SERVAIT PAS** depuis son
 * propre processus. Le registre des coutures le comptait sans détour :
 * `orchestrerAppel` portait ZÉRO appelant de production sur les 130 modules émis
 * par le build, et `ops/index.ts` remettait `noyau: null` au montage. Le socle
 * le disait lui-même, et c'est ce qui rendait le manque MESURABLE plutôt que
 * supposé : `monterLeService` comptait l'empêchement « la chaîne des quatorze
 * étapes n'est pas composée ».
 *
 * ⚠️ **CETTE GARDE-LÀ N'A PAS BOUGÉ D'UN CARACTÈRE, ET C'EST LA PROPRIÉTÉ QUE CE
 *    FICHIER EXISTE POUR TENIR.** Elle devient verte **parce que le noyau est
 *    là**, jamais parce qu'on l'a assouplie — et `ops/service.spec.ts` lui
 *    retire le noyau pour vérifier qu'elle sait encore dire NON.
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * **Il compose. Il ne décide pas, et il ne lit rien.** Aucun `process`, aucune
 * variable d'environnement, aucune socket : tout lui est remis par
 * {@link PortsDuNoyau}. C'est le motif qui a fait séparer `ops/service.ts` de
 * `ops/main.ts` (ADR 0034), appliqué un cran plus bas — une composition écrite
 * dans le point d'entrée serait inéprouvable sans `process.env`.
 *
 * ⚠️ **CE QUE LA COMPOSITION N'A PAS LE DROIT DE FABRIQUER.** `reglages`,
 *    `validerEntree`, `appelAdaptateur` et `fabriqueMasquage` exigent un
 *    ADAPTATEUR, et aucun n'est admis dans ce dépôt. Ils sont composés en
 *    **REFUS NOMMÉ** — {@link ErreurAdaptateurNonAdmis} — jamais en fonctions de
 *    complaisance. Une validation qui rendrait toujours succès serait le « vert
 *    parce qu'il ne regarde rien » dans sa forme la plus pure, et elle
 *    traverserait toutes les gardes du dépôt.
 *
 * ⚠️ **CES QUATRE REFUS SONT INATTEIGNABLES TANT QUE LE CATALOGUE EST VIDE, ET
 *    CE N'EST PAS UNE EXCUSE, C'EST UNE MESURE.** L'orchestrateur relit le
 *    catalogue AVANT l'étape 5 ; sur `relire() === null` il passe la main à
 *    l'étape 6, qui refuse. `reglages` n'est appelé qu'après l'étape 7. Le jour
 *    où un adaptateur est épinglé, ces quatre-là lèvent bruyamment — ce qui est
 *    exactement ce qu'on veut d'un socle à qui il manque son exécutant.
 *
 * ⚠️ **UN NOYAU PAR COLONNE — ADR 0039.** Ce module rend une
 *    {@link FabriqueDeNoyau}, jamais un noyau. `DependancesOrchestrateur.transport`
 *    fait lire la colonne du § 11 : un noyau unique composé en `stdio` et remis
 *    aux DEUX transports servirait les appels HTTP en croyant que les quatre
 *    étapes « HTTP seul » n'existent pas — et `verifierCouvertureDesEtapes` ne
 *    le verrait pas, elle boucle sur les NOMS de transports.
 *
 * ⚠️ **TOUT CE QUI DÉCIDE EST PARTAGÉ.** Les deux noyaux rendus par la fabrique
 *    partagent le journal, les dépôts, l'index de provenance, la politique et
 *    les cinq étapes — un seul CHEMIN, pas un seul objet. C'est ce qui rend la
 *    fabrique compatible avec l'ADR 0025 au lieu de la contredire.
 *
 * Voir **ADR 0002**, **ADR 0025**, **ADR 0034**, **ADR 0039**.
 */

import type { ScelleurJournal } from "../../core/audit/index.js";
import { Journal } from "../../core/audit/index.js";
import type { JournalStore } from "../../core/audit/index.js";
import type {
  CatalogueOutils,
  ChargeAdaptateur,
  ExecutionEtablie,
  IndexProvenance,
  Masquage,
  OutilDuCatalogue,
  SignataireCurseur,
} from "../../core/chaine/index.js";
import {
  INTENTION_NON_ARMEE,
  correspondanceCanonique,
  creerEtapeCatalogue,
  creerSignataireCurseur,
  empreintesParDefaut,
  etape05Scopes,
  etape11Provenance,
  etapeCurseur,
  executerEtape14,
  orchestrerAppel,
} from "../../core/chaine/index.js";
import type {
  DeclarationOutilRecue,
  DeclarationsRecues,
  DemandeDesactivation,
  IncidentEpinglage,
  InterrupteurOutil,
  CanalDAlerte,
} from "../../core/chaine/etape-06-outil.js";
import type { CoffreCurseur } from "../../core/chaine/etape-09-curseur.js";
import type {
  DependancesOrchestrateur,
  EtatDePilotage,
  EtatDuCoffre,
  ReglagesDeLOutil,
  ResultatAppel,
  Transport,
  VerificationConfirmation,
} from "../../core/chaine/index.js";
import type { CoffreArgHash, DepotIdempotence, DepotQuota } from "../../core/limits/index.js";
import { creerCalculArgHash, type ResultatValidation } from "../../core/limits/index.js";
// ⚠️ IMPORT PROFOND ASSUMÉ, ET SIGNALÉ. `core/limits/index.ts` ré-exporte une
//    quinzaine de symboles de `config.ts` et pas celui-ci ; élargir le barillet
//    appartient à son propriétaire, pas à la racine de composition. La borne est
//    donc LUE chez elle, ce qui est de toute façon la seule écriture qui vaille.
import { TTL_IDEMPOTENCE_MAX_MS } from "../../core/limits/config.js";
import type { DepotPolitique, NiveauApplique, ReferenceOutil } from "../../core/policy/index.js";
import { niveauApplique } from "../../core/policy/index.js";
import type { ProfileName } from "../../core/profiles/index.js";
import type { CoffreSceauJournal } from "../../core/sceau/index.js";
import { ErreurCleSceauJournal, scelleurDepuisCoffre } from "../../core/sceau/index.js";
import type { FabriqueDeNoyau, NoyauUnique } from "../../core/transport/contrat.js";
import { appelerAdaptateurFedere } from "../../core/federe/appel.js";
import { construireRaccordement } from "../../core/federe/raccordement.js";
import { creerCalculFiltersHash } from "../../core/federe/filtres.js";
import { masquageDelegueALAdaptateur } from "../../core/federe/masquage.js";
import { creerValidateurFedere } from "../../core/federe/validation.js";
import type { LectureDesAdaptateurs, LectureDuCoffre } from "../../core/federe/raccordement.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE REFUS NOMMÉ — CE QUI EXIGE UN ADAPTATEUR, ET N'EN A AUCUN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LEVÉE PAR LES QUATRE PORTS QUI EXIGENT UN ADAPTATEUR.**
 *
 * ⚠️ **UNE LEVÉE, ET NON UN VERDICT.** Un `validerEntree` qui rendrait
 *    `{ ok: false }` serait indiscernable d'une entrée réellement invalide : le
 *    modèle recevrait « ton champ est mauvais » là où la vérité est « ce socle
 *    n'a pas d'exécutant pour cet outil ». Une garde qui ne peut plus mordre
 *    doit faire du BRUIT, pas rendre un verdict — c'est la règle qu'écrit déjà
 *    `ErreurFiltersHashAbsent` (`core/chaine/etape-09-curseur.ts`).
 */
export class ErreurAdaptateurNonAdmis extends Error {
  /** Le port qui a été appelé alors qu'il n'a aucun exécutant. */
  public readonly port: string;
  /** L'outil au nom duquel il a été appelé. */
  public readonly outil: string;

  public constructor(port: string, outil: string) {
    super(
      `ops/composition — « ${port} » a été appelé pour l'outil « ${outil} », et AUCUN ` +
        "adaptateur n'est admis dans ce socle : `adapters/` est vide et l'étage 5 n'a épinglé " +
        "aucun manifeste. Ce port exige un exécutant ; en fabriquer un qui rendrait toujours " +
        "succès traverserait toutes les gardes du dépôt. Enregistrer un adaptateur, " +
        "l'épingler dans `adapters.lock.json`, puis redémarrer.",
    );
    this.name = "ErreurAdaptateurNonAdmis";
    this.port = port;
    this.outil = outil;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES PORTS NEUTRES, ET CHACUN PORTE SON MOTIF
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 20 — **AUCUNE DÉCLARATION D'ADAPTATEUR N'EST REÇUE, ET LE DIRE EST LE
 * CONTRAT.**
 *
 * ⚠️ Rendre `null` n'est pas un repli : `confronterEpinglage` en tire
 *    `comparaisonImpossible: true` et `champsCompares: 0`, ce qui se LIT. Une
 *    valeur de repli — « on suppose qu'il annonce ce qui est épinglé » — rendrait
 *    la confrontation toujours conforme, et la règle d'épinglage du § 20
 *    deviendrait une garde qui ne regarde rien. `core/chaine/etape-06-outil.ts`
 *    l'écrit noir sur blanc au-dessus de ce port ; on l'applique.
 */
export const DECLARATIONS_SANS_ADAPTATEUR_ADMIS: DeclarationsRecues = {
  relire(): Promise<DeclarationOutilRecue | null> {
    return Promise.resolve(null);
  },
};

/**
 * § 20 — **L'INTERRUPTEUR N'A AUCUN ÉCRIVAIN, ET IL LE DIT PAR `false`.**
 *
 * `ops_tool.enabled` vit en base, et ce dépôt ne porte pas encore le câblage
 * Prisma du catalogue. Rendre `true` ferait croire une désactivation écrite : le
 * message de refus de l'étape 6 cesserait de porter « ⚠️ La désactivation N'A PAS
 * PU ÊTRE ÉCRITE », et l'exploitant ne saurait pas qu'un outil divergent est
 * resté actif en base.
 */
export const INTERRUPTEUR_SANS_ECRITURE: InterrupteurOutil = {
  desactiver(_demande: DemandeDesactivation): Promise<boolean> {
    return Promise.resolve(false);
  },
};

/**
 * § 24 — **LE CANAL D'ALERTE N'A AUCUN DESTINATAIRE, ET IL LE DIT PAR `false`.**
 *
 * Le refus d'accusé fait appeler `secours`, qui est le dernier recours de
 * l'étape 6. C'est exactement le comportement voulu : une alerte qu'aucun canal
 * ne prend doit atteindre la sortie d'erreur plutôt que disparaître.
 */
export const CANAL_DALERTE_SANS_DESTINATAIRE: CanalDAlerte = {
  alerter(): Promise<boolean> {
    return Promise.resolve(false);
  },
};

/**
 * § 20 — **AUCUN JETON DE CONFIRMATION NE PEUT ÊTRE VALIDE, ET C'EST UNE VÉRITÉ,
 * PAS UNE COMMODITÉ.**
 *
 * ⚠️ La distinction avec les quatre refus nommés ci-dessus est réelle et vaut
 *    d'être écrite. `verifierEtConsommer` du § 20 lit un DÉPÔT de jetons et un
 *    SEL issu du coffre ; sans dépôt, aucun jeton n'a jamais été émis, donc
 *    aucun jeton présenté ne peut correspondre à quoi que ce soit. `invalide`
 *    est la réponse EXACTE, pas un repli — et elle tombe du côté strict.
 *
 * ⚠️ **LE JOUR OÙ UN DÉPÔT EXISTE, CE PORT DOIT ÊTRE REMPLACÉ.** Le laisser
 *    ferait refuser des confirmations légitimes en silence, ce qui est l'autre
 *    façon de casser le § 20.
 */
export const CONFIRMATION_SANS_DEPOT: VerificationConfirmation = {
  verifierEtConsommer(): Promise<"valide" | "invalide"> {
    return Promise.resolve("invalide");
  },
};

/**
 * § 13.1 — **LE COFFRE NE NOMME AUCUN SECRET POUR LA CLÉ DES CURSEURS. ÉCART
 * MESURÉ, PAS BOUCHÉ.**
 *
 * `core/vault/coffre.ts` déclare DEUX ponts de lecture de clé —
 * `lireCleArgHash` et `lireCleSceauJournal` — et rien pour le curseur : ni nom
 * de secret, ni version. Le port `CoffreCurseur` n'a donc aucune implémentation
 * hors des fixtures, et l'ADR 0039 le porte déjà comme un manque.
 *
 * ⚠️ **RENDRE `null` EST FAIL-LOUD, PAS FAIL-OPEN.** `creerSignataireCurseur`
 *    LÈVE `ErreurCleCurseur` à la signature comme à la vérification : le socle
 *    refuse de signer et de vérifier plutôt que d'employer une clé de repli
 *    connue, qui laisserait FORGER un curseur. Aucun outil n'étant servi, aucune
 *    pagination n'atteint ce chemin aujourd'hui.
 */
export const SANS_PONT_DE_CLE_DE_CURSEUR: CoffreCurseur = {
  lireCleCurseur(): Promise<string | null> {
    return Promise.resolve(null);
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA COMPOSITION REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **TOUT CE QUE LA COMPOSITION REÇOIT, ET RIEN QU'ELLE NE FABRIQUE.**
 *
 * ⚠️ **AUCUN CHAMP N'EST FACULTATIF**, pour le motif de `DependancesDuSocle` et
 *    de `DependancesOrchestrateur` : une valeur par défaut se met en place une
 *    fois et ne se retire jamais, et ce serait ici une étape qu'on peut oublier
 *    de brancher.
 */
export interface PortsDuNoyau {
  /** ADR 0002 — la clé de scellement de la chaîne d'`ops_audit`. */
  readonly coffreDuSceau: CoffreSceauJournal;
  /** § 12, règle 2 — la clé HMAC de l'`argHash`. Relue à CHAQUE appel. */
  readonly coffreDeLArgHash: CoffreArgHash;
  /** § 13.1 — la clé HMAC des curseurs. Voir {@link SANS_PONT_DE_CLE_DE_CURSEUR}. */
  readonly coffreDuCurseur: CoffreCurseur;
  /** Où les lignes du journal sont écrites. La durabilité appartient au store. */
  readonly journalStore: JournalStore;
  /** § 23, étape 0 — l'état du coffre, RELU à chaque appel. */
  readonly coffre: EtatDuCoffre;
  /** L'inventaire des outils épinglés ET admis. Le catalogue en est DÉRIVÉ. */
  readonly inventaire: () => Promise<readonly OutilDuCatalogue[]>;
  /** § 14 — `ops_runtime.profile`. `null` quand aucune ligne ne couvre ce principal. */
  readonly profilActif: (principal: string) => Promise<ProfileName | null>;
  /** § 20 — les lignes de politique, relues à chaque appel (§ 12, règle 1). */
  readonly depotPolitique: DepotPolitique;
  readonly depotQuota: DepotQuota;
  readonly depotIdempotence: DepotIdempotence;
  /** § 20 — l'index de provenance, PARTAGÉ par les deux colonnes. */
  readonly index: IndexProvenance;
  /** § 09/§ 26 — la durée de vie d'une réservation d'idempotence, en ms. */
  readonly ttlIdempotenceMs: number;
  /** Le dernier recours de l'étape 6, quand l'alerte n'a pas pu être émise. */
  /**
   * De quoi APPELER un adaptateur fédéré — `null` quand aucun n'est admis.
   *
   * ⚠️ **OPTIONNEL, ET LE DÉFAUT EST LE REFUS.** Un socle sans adaptateur admis
   *    doit continuer à refuser bruyamment (`ErreurAdaptateurNonAdmis`) : c'est
   *    la garde qui empêche qu'un exécutant complaisant traverse tout le dépôt.
   *    Le fournir, c'est déclarer qu'on a de quoi joindre quelqu'un — pas qu'on
   *    l'a joint.
   */
  readonly federe: {
    readonly adaptateurs: LectureDesAdaptateurs;
    readonly coffre: LectureDuCoffre;
    /** Délai d'appel, en ms. Absent : celui de `core/federe/appel.ts`. */
    readonly delaiMs?: number;
  } | null;

  readonly secoursDAlerte: (incident: IncidentEpinglage) => void;
  readonly maintenant: () => Date;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA COMPOSITION REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE COMPOSITION A RÉELLEMENT FAIT. **Des objets et des nombres, jamais
 * une couleur.**
 */
export interface NoyauCompose {
  /**
   * La fabrique, ou `null` quand la composition a été EMPÊCHÉE.
   *
   * ⚠️ `null` ici produit, un cran plus haut, l'empêchement mot pour mot de
   *    `monterLeService` : « la chaîne des quatorze étapes n'est pas composée ».
   *    C'est la même phrase pour les deux causes — chaîne jamais composée et
   *    composition refusée — et c'est voulu : dans les deux cas aucun transport
   *    ne doit être monté. Le POURQUOI, lui, est dans {@link empechement}.
   */
  readonly fabrique: FabriqueDeNoyau | null;
  /** Ce qui a empêché de composer, nommé. `null` quand la fabrique est là. */
  readonly empechement: string | null;
  /**
   * COMBIEN DE CHAMPS DE `DependancesOrchestrateur` ONT ÉTÉ RÉELLEMENT REMPLIS.
   *
   * ⚠️ **DÉRIVÉ PAR `Object.keys` DU DÉPÔT COMPOSÉ, JAMAIS ÉCRIT À LA MAIN.** Un
   *    nombre recopié resterait juste jusqu'au jour où l'orchestrateur gagne une
   *    dépendance — et ce jour-là il annoncerait une chaîne complète sur une
   *    chaîne trouée. Le compilateur garantit la COMPLÉTUDE (aucun champ
   *    facultatif) ; ce compte rend la MESURE lisible sans compiler.
   */
  readonly champsDeLOrchestrateur: number;
  /** Combien de noyaux la fabrique a réellement frappés. Un par colonne montée. */
  colonnesFrappees(): number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA COMPOSITION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **COMPOSE LA CHAÎNE DES QUATORZE ÉTAPES, ET REND UNE FABRIQUE PAR COLONNE.**
 *
 * ⚠️ **ELLE EST ASYNCHRONE POUR UNE SEULE RAISON, ET ELLE EST BONNE.** Le
 *    scelleur du journal lit sa clé UNE FOIS, à la composition
 *    (`scelleurDepuisCoffre`) : `verifierChaine` parcourt des tranches de
 *    journal ligne à ligne, et un scellement asynchrone ferait de la
 *    vérification d'une archive de douze mois une chaîne de promesses par ligne.
 *    Les deux autres clés — `argHash`, curseur — sont relues à CHAQUE appel,
 *    parce que le § 25 les range dans la liste de rotation et qu'un cache de
 *    processus servirait l'ancienne clé jusqu'au prochain redémarrage.
 *
 * ⚠️ **UNE CLÉ DE SCELLEMENT ABSENTE EMPÊCHE, ELLE NE LÈVE PAS.** Un socle sans
 *    clé de journal doit continuer de servir la console, le healthcheck et le
 *    déverrouillage (§ 23) ; lever ici en ferait un socle mort. L'empêchement
 *    remonte, `monterLeService` ne monte aucun transport d'outils, et le motif
 *    est écrit sur la sortie d'erreur.
 */
export async function composerLeNoyau(ports: PortsDuNoyau): Promise<NoyauCompose> {
  let scelleur: ScelleurJournal;
  try {
    scelleur = await scelleurDepuisCoffre(ports.coffreDuSceau);
  } catch (erreur: unknown) {
    if (!(erreur instanceof ErreurCleSceauJournal)) throw erreur;
    return {
      fabrique: null,
      // ⚠️ LE POURQUOI N'EST PAS RÉÉCRIT ICI. `ErreurCleSceauJournal` porte déjà
      //    le motif et le geste (§ 15) ; le redire fabriquerait une SECONDE
      //    rédaction du même fait, et c'est toujours la seconde qui finit par
      //    diverger. Ce message ajoute la seule chose que l'erreur ne sait pas :
      //    la CONSÉQUENCE sur le montage.
      empechement:
        `ADR 0002 — la chaîne d'\`ops_audit\` ne peut pas être scellée. ${erreur.message} ` +
        "⚠️ Conséquence : le § 11 fait de la ligne d'audit un INVARIANT DE SORTIE, donc AUCUN " +
        "transport d'outils n'est monté tant qu'aucune ligne ne peut attester un appel.",
      champsDeLOrchestrateur: 0,
      colonnesFrappees: () => 0,
    };
  }

  const journal = new Journal(scelleur, ports.journalStore, {
    maintenant: ports.maintenant,
  });

  // ⚠️ **LE CATALOGUE EST DÉRIVÉ DE L'INVENTAIRE, JAMAIS ÉCRIT À CÔTÉ.** Deux
  //    lectures d'un même fait finissent par se contredire, et la contradiction
  //    serait ici « l'outil existe pour l'étape 7 et n'existe pas pour
  //    l'étape 6 ». L'orchestrateur mémoïse la relecture POUR CET APPEL ; la
  //    relire à chaque appel est la correction 3 du § 14, et elle est tenue.
  const catalogue: CatalogueOutils = {
    async relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
      const outils = await ports.inventaire();
      return outils.find((outil) => outil.name === nomComplet) ?? null;
    },
  };

  const pilotage: EtatDePilotage = {
    profilActif: (principal: string): Promise<ProfileName | null> => ports.profilActif(principal),
    inventaire: (): Promise<readonly OutilDuCatalogue[]> => ports.inventaire(),
  };

  const signataireCurseur: SignataireCurseur = creerSignataireCurseur(ports.coffreDuCurseur);

  /**
   * TOUT `DependancesOrchestrateur` SAUF `transport` — la seule chose qui
   * distingue une colonne de l'autre.
   */
  const partage: Omit<DependancesOrchestrateur, "transport"> = {
    journal,
    intention: INTENTION_NON_ARMEE,
    coffre: ports.coffre,
    catalogue,
    pilotage,
    politique: {
      async niveauPourOutil(reference: ReferenceOutil, maintenant: Date): Promise<NiveauApplique> {
        // § 12, règle 1 — CALCULÉ À L'APPEL, sur les lignes relues à l'appel.
        // Un niveau figé au démarrage afficherait `brouillon` pendant tout un
        // desserrage légitime.
        return niveauApplique(await ports.depotPolitique.lignes(), reference, maintenant);
      },
    },
    confirmation: CONFIRMATION_SANS_DEPOT,
    calculArgHash: creerCalculArgHash(ports.coffreDeLArgHash),
    index: ports.index,
    signataireCurseur,
    correspondanceScopes: correspondanceCanonique,
    depotQuota: ports.depotQuota,
    depotIdempotence: ports.depotIdempotence,

    // ── LES CINQ ÉTAPES DE `core/chaine`, PRISES AU BARILLET ────────────────
    etapeScopes: etape05Scopes,
    etapeCatalogue: creerEtapeCatalogue({
      declarations: DECLARATIONS_SANS_ADAPTATEUR_ADMIS,
      interrupteur: INTERRUPTEUR_SANS_ECRITURE,
      alerte: CANAL_DALERTE_SANS_DESTINATAIRE,
      secours: ports.secoursDAlerte,
    }),
    etapeCurseur,
    etapeProvenance: etape11Provenance,
    etapeExecution: executerEtape14,

    // ── LES QUATRE PORTS QUI EXIGENT UN ADAPTATEUR — REFUS NOMMÉ ────────────
    reglages(outil: OutilDuCatalogue): ReglagesDeLOutil {
      throw new ErreurAdaptateurNonAdmis("reglages", outil.name);
    },
    validerEntree(outil: OutilDuCatalogue, input: unknown): ResultatValidation<unknown> {
      // ÉTAPE 8 — l'entrée contre le JSON Schema ÉPINGLÉ du manifeste (ajv,
      // strict, sans coercition). Décision de Will du 2026-09-02 : une
      // bibliothèque éprouvée, pas un validateur maison qui laisserait passer.
      if (ports.federe === null) {
        throw new ErreurAdaptateurNonAdmis("validerEntree", outil.name);
      }
      return validateurFedere.valider(outil, input).resultat;
    },
    empreinteFiltres(outil: OutilDuCatalogue, valide: unknown): Promise<string> {
      // § 13.1 — HMAC à clé du curseur, domaine propre. Il ne dépend d'aucun
      // adaptateur : seuls le nom de l'outil et l'entrée VALIDÉE y entrent.
      if (ports.federe === null) {
        throw new ErreurAdaptateurNonAdmis("empreinteFiltres", outil.name);
      }
      return creerCalculFiltersHash(ports.coffreDuCurseur).calculer(outil, valide);
    },
    fabriqueMasquage(habilitations, outil: OutilDuCatalogue): Masquage {
      if (ports.federe === null) {
        throw new ErreurAdaptateurNonAdmis("fabriqueMasquage", outil.name);
      }
      // ⚠️ RIDEAU VIDE, ET ASSUMÉ. Le socle ne connaît aucun métier : il ne sait
      //    pas quels champs d'un produit tiers sont sensibles, et fabriquer une
      //    liste de noms plausibles produirait une garde qui rassure sans
      //    garder. C'est l'adaptateur qui masque, à la source. Lire
      //    `core/federe/masquage.ts` : l'écart y est écrit, pas caché.
      return masquageDelegueALAdaptateur(habilitations, outil);
    },
    construireContexteOutil(identite, _appel, profil, niveau) {
      // ⚠️ IL NE FABRIQUE RIEN — il RECOPIE ce que les étapes ont établi. C'est
      //    l'interdit n° 1 de l'ADR 0025 : une composition qui inventerait ici
      //    un principal, une audience ou une échéance déciderait à la place des
      //    étapes. `idempotencyRef` n'y figure pas (ADR 0020) : l'orchestrateur
      //    le pose lui-même, et le type l'interdit de toute façon.
      return {
        principal: identite.principal,
        sessionId: identite.sessionId,
        scopes: identite.scopes,
        policyLevel: niveau,
        profile: profil,
        requestId: identite.requestId,
        deadline: identite.deadline,
        habilitations: identite.habilitations,
      };
    },
    async appelAdaptateur(contexte, entree, outil): Promise<ChargeAdaptateur> {
      // ── AUCUN MOYEN DE JOINDRE QUI QUE CE SOIT ────────────────────────────
      //    Le refus reste le défaut, et il reste BRUYANT : un exécutant
      //    complaisant traverserait toutes les gardes du dépôt.
      if (ports.federe === null) {
        throw new ErreurAdaptateurNonAdmis("appelAdaptateur", outil.name);
      }

      // ⚠️ LE RACCORDEMENT EST CONSTRUIT À CHAQUE APPEL, JAMAIS MÉMORISÉ. Il lit
      //    le coffre, qui peut être verrouillé entre deux appels : un
      //    raccordement gardé en cache survivrait à l'arrêt d'urgence du § 25.
      const raccordement = await construireRaccordement(
        outil,
        ports.federe.adaptateurs,
        ports.federe.coffre,
        ports.federe.delaiMs === undefined ? {} : { delaiMs: ports.federe.delaiMs },
      );

      // ⚠️ AUCUN `try` ICI, ET C'EST DÉLIBÉRÉ. Une erreur réseau doit remonter
      //    telle quelle jusqu'à `estAmontInjoignable()`, qui la reconnaît dans
      //    sa chaîne `cause` et rend `upstream_unavailable`. L'envelopper la
      //    transformerait en `internal`, et le § 15 ne dirait plus « réessayer ».
      const { charge } = await appelerAdaptateurFedere(raccordement, contexte, entree);
      return charge;
    },
    empreintesDuResultat(execution: ExecutionEtablie): readonly string[] {
      return empreintesParDefaut(execution);
    },

    ttlIdempotenceMs: ports.ttlIdempotenceMs,
    maintenant: ports.maintenant,
  };

  let colonnes = 0;
  // Un validateur PAR NOYAU : ses compilations sont mémorisées par empreinte de
  // schéma et n'ont pas à survivre au noyau.
  const validateurFedere = creerValidateurFedere();

  const fabrique: FabriqueDeNoyau = (transport: Transport): NoyauUnique => {
    colonnes += 1;
    const dependances: DependancesOrchestrateur = { ...partage, transport };
    return async (identite, appel): Promise<ResultatAppel> =>
      // ⚠️ LE NOYAU REÇOIT `unknown` PAR CONTRAT (`NoyauUnique`) : le transport
      //    lui remet ce qu'il a lu, DÉJÀ analysé par son protocole, et c'est
      //    l'orchestrateur qui décide. La conversion est ici, à la racine de
      //    composition, et nulle part ailleurs.
      orchestrerAppel(identite, appel as Parameters<typeof orchestrerAppel>[1], dependances);
  };

  return {
    fabrique,
    empechement: null,
    // DÉRIVÉ du dépôt réellement composé : `partage` plus le `transport` que la
    // fabrique ajoute. Jamais un littéral.
    champsDeLOrchestrateur: Object.keys(partage).length + 1,
    colonnesFrappees: () => colonnes,
  };
}

/**
 * LA BORNE HAUTE DU TTL D'IDEMPOTENCE, RÉ-EXPORTÉE POUR QUE `ops/index.ts` LA
 * LISE AU LIEU DE LA RECOPIER.
 *
 * ⚠️ Un « override sans borne haute fabrique la CVE suivante » : une réservation
 *    d'un an rendrait un `send` non rejouable jusqu'au prochain siècle, et un
 *    échec transitoire deviendrait définitif. La borne vit chez son
 *    propriétaire (`core/limits/config.ts`) ; ici on la LIT.
 */
export { TTL_IDEMPOTENCE_MAX_MS };
