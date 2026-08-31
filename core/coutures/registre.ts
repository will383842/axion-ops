/**
 * `core/coutures/registre.ts` — **QUEL SYMBOLE PORTE QUELLE DÉCISION, ET EST-IL
 * BRANCHÉ ?**
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * L'épreuve du lot 1c a mesuré un mode de défaillance que rien ne surveillait :
 * **une décision écrite, testée, documentée — et non cousue au chemin de
 * production.** Quatre ADR sur cinq étaient dans cet état. Leurs fonctions
 * existaient, étaient exportées, étaient gardées, et **aucun module de
 * production ne les appelait**. Les tests passaient parce qu'ils éprouvaient la
 * FONCTION, jamais son BRANCHEMENT.
 *
 * Ce n'est pas quatre oublis, c'est UN défaut : rien, dans le dépôt, ne
 * confrontait la prose d'un ADR au graphe d'appels réel. Le pire des trois états
 * possibles s'ensuit — le trou est ouvert, ET la documentation donne
 * l'apparence d'un périmètre couvert.
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * C'est une **DONNÉE**, pas une garde. Il ne prouve rien tout seul : une entrée
 * qui nomme un symbole inexistant le satisferait. C'est
 * `core/coutures/registre.spec.ts` (constructeur ①) qui le CONFRONTE au dépôt —
 * au graphe d'imports, au corps des modules de production, et au dossier
 * `docs/adr/`.
 *
 * ⚠️ **IL N'IMPORTE RIEN, ET C'EST UNE CONTRAINTE.** C'est le motif de
 *    `core/chaine/modules.ts` : une table que tout le monde lit ne doit
 *    dépendre de personne, sans quoi l'ordre de chargement décide de sa valeur.
 *    Ce fichier est une FEUILLE de l'arbre de dépendances, et il doit le rester.
 *
 * ⚠️ **LA GARDE NE PORTE PAS SA LISTE — ELLE LA LIT ICI.** Une garde qui
 *    énumérerait elle-même les symboles à confronter serait une seconde source
 *    de vérité, et c'est la seconde qui ne suit jamais. Le registre est la
 *    donnée ; la garde est la dérivation.
 *
 * ⚠️ **UN ADR NEUF OBLIGE À COMPLÉTER CE FICHIER.** La garde dérive l'ensemble
 *    des ADR du CONTENU de `docs/adr/`, pas de ce registre : un ADR qui atterrit
 *    sans y être inscrit fait rougir, parce que le compte des ADR trouvés
 *    dépasse alors le compte des ADR couverts. C'est la seule façon connue
 *    d'empêcher qu'une décision entre dans le dépôt sans dire qui la porte.
 *
 * ═══ CE QUE LA MESURE « ZÉRO APPELANT » VEUT DIRE AUJOURD'HUI ═══
 *
 * 🔴 **LE SOCLE N'A PAS DE RACINE DE COMPOSITION.** Il n'existe ni serveur, ni
 *    `main.ts`, ni console : `core/transport/` est un lot à venir. Beaucoup de
 *    points d'entrée légitimes — `verifierChaine`, `creerScelleurJournal`,
 *    `dialecteDeFermeture` — ont donc **zéro appelant de production, et c'est
 *    normal**. Une garde qui exigerait un appelant pour tous serait rouge en
 *    permanence, pour une raison qui n'a rien à voir avec la règle gardée, et
 *    elle serait désactivée dans la semaine.
 *
 *    D'où l'état {@link EtatDeCouture} : ce registre ne dit pas « tout doit être
 *    cousu », il dit **ce que chaque décision est censée mesurer aujourd'hui**,
 *    et la garde vérifie la mesure DANS LES DEUX SENS. Un symbole déclaré
 *    `cousue` qui perd son dernier appelant fait rougir ; un symbole déclaré
 *    `à-coudre` qui en gagne un fait rougir aussi — parce que le jour où un
 *    constructeur coud sans mettre le registre à jour, la prose recommence à
 *    mentir.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE VOCABULAIRE DU REGISTRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * COMMENT UNE COUTURE SE MESURE DANS UN SOURCE.
 *
 * ⚠️ CE N'EST PAS UNE ÉTIQUETTE DÉCORATIVE : c'est le genre qui décide de la
 *    FORME que la garde cherche. Une forme par genre, quatre formes en tout,
 *    chacune avec son témoin fabriqué — jamais une expression écrite à la main
 *    par entrée, qui ferait porter sa liste à la garde.
 */
export const GENRES_DE_SYMBOLE = [
  /**
   * Une fonction exportée. Forme cherchée : le nom suivi d'une parenthèse
   * d'appel, **arguments de type éventuels compris**.
   *
   * 🔴 CETTE PRÉCISION EST UNE MESURE, PAS UNE PRÉCAUTION. Le motif naïf
   *    `nom\s*\(` déclare `avecJournal` NON COUSUE : `orchestrateur.ts` l'appelle
   *    `avecJournal<ChargeServie>(…)`, et l'argument de type s'intercale entre
   *    le nom et la parenthèse. Une garde écrite sans cette forme aurait annoncé
   *    un trou inexistant sur le module le plus central du socle — et le remède
   *    qu'on lui aurait cherché aurait été de la désactiver.
   */
  "fonction",
  /**
   * Une constante exportée, lue sans parenthèse. Forme cherchée : le nom seul,
   * hors des lignes d'`import`/`export … from` et hors commentaires.
   *
   * ⚠️ C'est le genre le plus FAIBLE des quatre — un nom seul se cite plus
   *    facilement qu'il ne s'appelle. Il est nommé comme tel pour que personne
   *    ne lise sa mesure comme celle d'un appel.
   */
  "constante",
  /**
   * Un type ou une interface exportés. Ils ne s'appellent pas : leur couture est
   * l'IMPORT. Un `import type { X }` dans un module de production EST la
   * couture — le type y contraint une signature, et c'est tout ce qu'un type
   * peut faire.
   */
  "type",
  /**
   * Le membre d'une interface — `IdentiteAppelante.sessionId`,
   * `SourceDeSession.relireDepuisLeSocle`. Forme cherchée : le nom du membre
   * précédé d'un point.
   *
   * ⚠️ La borne, écrite avec le genre : un membre au nom banal (`lire`, `at`)
   *    rendrait des appelants qui n'en sont pas. Le registre n'admet donc ce
   *    genre que sur un nom qui ne se confond avec aucun autre du dépôt, et la
   *    garde ANNONCE les fichiers trouvés — un compte anormalement haut se lit.
   */
  "membre",
] as const;

/** Le genre d'un symbole inscrit au registre. */
export type GenreDeSymbole = (typeof GENRES_DE_SYMBOLE)[number];

/**
 * CE QUE LA GARDE DOIT MESURER POUR CETTE ENTRÉE, AUJOURD'HUI.
 *
 * ⚠️ LES QUATRE ÉTATS SONT UNE TOTALITÉ, PAS UNE ÉCHELLE. Chacun dit une
 *    attente DIFFÉRENTE et FALSIFIABLE ; aucun ne veut dire « on verra plus
 *    tard ».
 */
export const ETATS_DE_COUTURE = [
  /**
   * Le symbole a **au moins un appelant de production**, et la garde l'exige.
   * Perdre le dernier fait rougir.
   */
  "cousue",
  /**
   * Le symbole existe (ou son module est nommé) et il a **exactement zéro
   * appelant de production**, ce qui est l'état ATTENDU aujourd'hui. La garde
   * exige zéro : en gagner un sans mettre le registre à jour fait rougir.
   *
   * ⚠️ C'EST L'ÉTAT QUI AURAIT ÉVITÉ LE DÉFAUT DU LOT 1c. Il ne cache pas la
   *    dette, il la CHIFFRE : l'ADR peut écrire « la décision est prise », le
   *    registre écrit « personne ne l'appelle », et les deux phrases cohabitent
   *    sans que la seconde puisse se perdre.
   */
  "à-coudre",
  /**
   * La décision produira du code, et **son symbole ne peut pas être nommé
   * honnêtement aujourd'hui** : le module n'existe pas et l'ADR ne le nomme pas.
   *
   * ⚠️ CET ÉTAT S'AUTO-PÉRIME, ET C'EST TOUT SON INTÉRÊT. L'entrée nomme le
   *    DOSSIER attendu ; la garde exige qu'il soit **absent du disque**. Le jour
   *    où il atterrit, elle rougit et force l'entrée à être complétée par un
   *    vrai symbole. Un état qui ne peut pas pourrir en silence.
   */
  "à-nommer",
  /**
   * La décision ne produit **aucun symbole dans ce dépôt** : elle porte sur un
   * autre dépôt, sur une table, sur un fichier de chaîne d'intégration, ou elle
   * n'est pas encore acceptée. Un motif écrit est OBLIGATOIRE — c'est ce qui
   * empêche cet état de devenir la voiture-balai du registre.
   */
  "hors-code",
] as const;

/** L'état d'une entrée du registre. */
export type EtatDeCouture = (typeof ETATS_DE_COUTURE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENTRÉE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que toute entrée porte, quel que soit son état. */
interface EntreeCommune {
  /** Le numéro de l'ADR, sur quatre chiffres — `"0016"`. Il DOIT désigner un fichier de `docs/adr/`. */
  readonly adr: string;
  /** La décision, en une phrase. C'est elle qu'on lit dans l'annonce de la garde. */
  readonly decision: string;
  /**
   * Pourquoi cette entrée est dans cet état-là. Obligatoire, y compris pour
   * `cousue` : un motif écrit est ce qui distingue une décision d'un constat.
   */
  readonly motif: string;
}

/** Une décision portée par un symbole du dépôt. */
export interface CoutureDeSymbole extends EntreeCommune {
  readonly etat: "cousue" | "à-coudre";
  /** Le nom EXACT du symbole, tel qu'il est exporté. */
  readonly symbole: string;
  readonly genre: GenreDeSymbole;
  /** Le module qui le DÉFINIT, chemin depuis la racine du dépôt. */
  readonly module: string;
  /**
   * La garde qui porte la mesure RÉELLE quand le compte d'appelants ne la porte
   * pas — un retrait de paramètre, par exemple, ne se mesure pas en appelants.
   * `null` quand le compte d'appelants EST la mesure.
   *
   * ⚠️ CETTE DÉLÉGATION EST BORNÉE ET COMPTÉE. La garde vérifie que le fichier
   *    nommé EXISTE et ANNONCE combien d'entrées délèguent : une échappatoire
   *    qu'on peut compter n'est pas une échappatoire, c'en est une qu'on
   *    surveille.
   */
  readonly mesureeAilleurs: string | null;
}

/** Une décision dont le symbole n'est pas nommable aujourd'hui. */
export interface CoutureANommer extends EntreeCommune {
  readonly etat: "à-nommer";
  /**
   * Le dossier attendu, avec sa barre oblique finale — `"core/auth/"`. La garde
   * exige qu'il soit ABSENT : sa venue périme l'entrée.
   */
  readonly dossierAttendu: string;
  /** Le lot qui le fera atterrir. Écrit pour que « plus tard » ait une date. */
  readonly lot: string;
}

/** Une décision qui ne produit aucun symbole ici. */
export interface CoutureHorsCode extends EntreeCommune {
  readonly etat: "hors-code";
}

/** Une entrée du registre. Union DISCRIMINÉE : l'état décide des champs exigés. */
export type EntreeDeCouture = CoutureDeSymbole | CoutureANommer | CoutureHorsCode;

// ═════════════════════════════════════════════════════════════════════════════
//  LE REGISTRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE REGISTRE DES COUTURES — une ligne par décision, plusieurs par ADR quand
 * l'ADR en porte plusieurs.
 *
 * ⚠️ **LES COMPTES CI-DESSOUS SONT MESURÉS, PAS RECOPIÉS**, et c'est
 *    `core/coutures/registre.spec.ts` qui les mesure : les modules de production
 *    sont ceux que `pnpm build` émet — critère DÉRIVÉ de l'`exclude` de
 *    `tsconfig.build.json` —, commentaires retirés, clauses `import … from` et
 *    `export … from` retirées, définisseur exclu. Le nombre d'appelants est écrit
 *    dans le motif de chaque entrée pour qu'une revue puisse le CONTREDIRE au
 *    lieu de le croire ; la garde le contredit à chaque exécution.
 *
 * ⚠️ **AUCUN DÉNOMINATEUR N'EST ÉCRIT ICI, DÉLIBÉRÉMENT.** Une version
 *    antérieure de cet en-tête annonçait « les 73 modules de production ». Le
 *    nombre était reproductible, mais la règle qui le produisait n'était écrite
 *    nulle part : deux gardes, l'une lisant le contrat et l'autre cette prose,
 *    n'obtenaient pas le même compte, et le premier module neuf le périmait. La
 *    garde ANNONCE son propre dénominateur à chaque exécution — c'est le seul
 *    endroit où il ne peut pas vieillir.
 */
export const REGISTRE_DES_COUTURES: readonly EntreeDeCouture[] = [
  // ── ADR 0001 ───────────────────────────────────────────────────────────────
  {
    adr: "0001",
    decision: "Le socle émet ses propres jetons ; les étapes 2 à 4 les relisent.",
    etat: "à-nommer",
    dossierAttendu: "core/auth/",
    lot: "lot 2 — l'émetteur et les routes `/auth/*`",
    motif:
      "L'ADR nomme un dossier et une table, aucune fonction. Inventer un nom ici " +
      "fabriquerait un registre faux — l'entrée se périmera d'elle-même le jour où " +
      "`core/auth/` atterrira.",
  },
  {
    adr: "0001",
    decision:
      "`ctx.requestId` est FRAPPÉ par le socle et `ctx.deadline` CALCULÉE par lui : " +
      "ni l'un ni l'autre n'est recopié d'une valeur reçue.",
    etat: "à-nommer",
    dossierAttendu: "core/transport/",
    lot: "lot 3 — le transport, étapes 1 à 4 (« HTTP seul »)",
    motif:
      "⚠️ RÈGLE POSÉE PAR L'ADR 0020, COUTURE DUE AU TRANSPORT — et c'est cette " +
      "entrée-ci qui empêche de l'y oublier. L'inventaire des canaux du `ctx` " +
      "(`STATUT_DES_CANAUX_DE_CONTEXTE`, `core/types.ts`) classe les deux champs " +
      "« à-fermer-au-transport » et porte leur motif ; la règle est écrite AVANT que " +
      "`core/transport/` existe, parce que c'est le seul moment où elle ne coûte " +
      "aucune migration. Aucun symbole n'est nommable aujourd'hui : les étapes 1 à 4 " +
      "n'ont pas de fichier, et inventer un nom fabriquerait un registre faux. " +
      "L'entrée se périme d'elle-même le jour où le dossier atterrit.",
  },

  // ── ADR 0002 ───────────────────────────────────────────────────────────────
  {
    adr: "0002",
    decision: "L'empreinte de chaque ligne est scellée et chaînée à la précédente.",
    etat: "cousue",
    symbole: "calculerSelfHash",
    genre: "fonction",
    module: "core/audit/canonique.ts",
    mesureeAilleurs: null,
    motif:
      "2 appelants de production mesurés : `core/audit/journal.ts` (écriture) et " +
      "`core/audit/verification.ts` (relecture). Les deux bouts de la chaîne passent " +
      "par la même fonction, ce qui est exactement ce que l'ADR exige.",
  },
  {
    adr: "0002",
    decision: "Les champs qui entrent dans l'empreinte sont une liste FERMÉE.",
    etat: "cousue",
    symbole: "CHAMPS_COUVERTS",
    genre: "constante",
    module: "core/audit/canonique.ts",
    mesureeAilleurs: null,
    motif:
      "1 lecteur de production mesuré : `core/audit/contenu.ts`, qui parcourt la liste " +
      "pour la garde de contenu du § 31. `core/audit/vocabulaire.ts` la CITE en " +
      "commentaire — une citation n'est pas une lecture, et la garde retire les " +
      "commentaires avant de compter.",
  },
  {
    adr: "0002",
    decision: "La vérification annonce combien de lignes elle a vérifiées.",
    etat: "à-coudre",
    symbole: "verifierChaine",
    genre: "fonction",
    module: "core/audit/verification.ts",
    mesureeAilleurs: null,
    motif:
      "0 appelant de production MESURÉ, et c'est attendu : son appelant est l'écran " +
      "Santé de la console (lot 5) et le healthcheck du § 23, dont aucun n'existe. " +
      "`core/audit/index.ts` la ré-exporte — un ré-export n'est pas un appelant.",
  },

  // ── ADR 0003 ───────────────────────────────────────────────────────────────
  {
    adr: "0003",
    decision: "Le registre exige un schéma d'entrée fermé, dans deux dialectes.",
    etat: "cousue",
    symbole: "analyserFermeture",
    genre: "fonction",
    module: "core/adapter-kit/fermeture.ts",
    mesureeAilleurs: null,
    motif:
      "2 appelants de production mesurés : `core/adapter-kit/manifest.ts` (côté " +
      "adaptateur) et `core/registry/enregistrer.ts` (côté admission). Les deux côtés " +
      "du contrat, ce que l'ADR appelle sa condition de tenue.",
  },
  {
    adr: "0003",
    decision:
      "Contrôle 7 — aucun champ d'autorisation ne provient du schéma d'entrée ; " +
      "la liste des noms interdits est DÉRIVÉE de `ToolContext`.",
    etat: "cousue",
    symbole: "chercherChampsDAutorisation",
    genre: "fonction",
    module: "core/adapter-kit/fermeture.ts",
    mesureeAilleurs: null,
    motif:
      "1 appelant de production mesuré : `core/registry/enregistrer.ts`. " +
      "⚠️ L'ADR 0020 rend cette entrée CRITIQUE : le retrait d'`idempotencyKey` de " +
      "`ToolContext` retirerait ce nom de la liste dérivée, en silence.",
  },

  // ── ADR 0004 ───────────────────────────────────────────────────────────────
  {
    adr: "0004",
    decision: "Le manifeste porte le sceau de l'énumération de profils.",
    etat: "cousue",
    symbole: "verifierFormeDuSceau",
    genre: "fonction",
    module: "core/adapter-kit/profils.ts",
    mesureeAilleurs: null,
    motif: "1 appelant de production mesuré : `core/adapter-kit/manifest.ts`.",
  },
  {
    adr: "0004",
    decision: "L'énumération de profils reçue est confrontée à celle du socle.",
    etat: "à-coudre",
    symbole: "verifierEnumerationProfils",
    genre: "fonction",
    module: "core/adapter-kit/profils.ts",
    mesureeAilleurs: null,
    motif:
      "🔴 0 appelant de production MESURÉ — LE JUMEAU OUBLIÉ. Sa voisine immédiate " +
      "`verifierFormeDuSceau`, écrite dans le même fichier et par la même décision, en " +
      "a un. Le sceau est donc confronté dans sa FORME et jamais dans son CONTENU : " +
      "un manifeste peut annoncer une énumération de profils que personne ne dément. " +
      "Écart signalé au rapport du lot 1d, à coudre par le constructeur du registre.",
  },

  // ── ADR 0005 ───────────────────────────────────────────────────────────────
  {
    adr: "0005",
    decision: "L'étape 0 refuse tout appel d'outil quand le coffre n'est pas ouvert.",
    etat: "cousue",
    symbole: "ETAPE_COFFRE",
    genre: "constante",
    module: "core/vault/erreurs.ts",
    mesureeAilleurs: null,
    motif:
      "1 lecteur de production mesuré : `core/vault/coffre.ts`. Le numéro est DÉRIVÉ " +
      "d'`APPEL_STEPS`, jamais écrit — c'est la moitié de la décision.",
  },
  {
    adr: "0005",
    decision: "`vault_locked` est un code d'erreur du § 15, hors tableau et assumé.",
    etat: "cousue",
    symbole: "CODE_COFFRE_VERROUILLE",
    genre: "constante",
    module: "core/vault/erreurs.ts",
    mesureeAilleurs: null,
    motif:
      "1 lecteur de production mesuré : `core/vault/coffre.ts`. `core/types.ts` le " +
      "cite en commentaire au titre de l'écart assumé ; la garde retire les " +
      "commentaires et ne le compte pas.",
  },

  // ── ADR 0010 à 0013 — décisions sans symbole ICI ───────────────────────────
  {
    adr: "0010",
    decision: "Le poste vocal est un démon pilote (voie B).",
    etat: "hors-code",
    motif:
      "Statut PROPOSÉE — elle attend l'accord de Will (décision W-7), et sa portée est " +
      "`voice/`, lot 8. Aucune conséquence sur `core/` : inscrire un symbole ici " +
      "reviendrait à décider à la place de Will.",
  },
  {
    adr: "0011",
    decision: "Les lectures sans session, agrégateur par agrégateur.",
    etat: "hors-code",
    motif:
      "Statut PROPOSÉE, et c'est un INVENTAIRE DE MESURE : aucune décision d'écriture, " +
      "donc aucun symbole à porter. Les travaux préalables vivent dans le dépôt voisin.",
  },
  {
    adr: "0012",
    decision: "La route `/api/mcp` dans Axion-IA, et les gardes qu'elle rencontre.",
    etat: "hors-code",
    motif:
      "Acceptée, mais sa portée est le DÉPÔT VOISIN `axionia` (lot 4a). Un symbole de " +
      "ce dépôt-ci ne peut pas la porter, et une garde d'ici ne peut pas la mesurer.",
  },
  {
    adr: "0013",
    decision: "Les données derrière les huit écrans de la console.",
    etat: "hors-code",
    motif:
      "Statut PROPOSÉE — elle appelle une décision de Will sur les huit manques du § 5. " +
      "Sa portée est le lot 5 ; les modules de `core/` qu'elle nommera sont déjà " +
      "inscrits ici sous leurs propres ADR.",
  },

  // ── ADR 0014 ───────────────────────────────────────────────────────────────
  {
    adr: "0014",
    decision: "Le `sessionId` est FRAPPÉ par le socle, jamais accepté du client.",
    etat: "cousue",
    symbole: "creerFabriqueSessionId",
    genre: "fonction",
    module: "core/identite/session.ts",
    mesureeAilleurs: "core/chaine/identite.spec.ts",
    motif:
      "1 appelant de production mesuré : `core/chaine/identite.ts`. La garantie ne " +
      "vient pas de ce compte mais de la garde G2 de `identite.spec.ts`, qui parcourt " +
      "le graphe d'imports et refuse tout frappeur LIVRÉ hors de sa liste. Le compte " +
      "d'appelants dit que la fabrique est branchée ; G2 dit qu'elle est SEULE.",
  },
  {
    adr: "0014",
    decision: "Le type marqué `SessionId` descend jusqu'aux interfaces où le § 20 s'ancre.",
    etat: "cousue",
    symbole: "SessionId",
    genre: "type",
    module: "core/identite/session.ts",
    mesureeAilleurs: null,
    motif:
      "COUSU AU LOT 1d, et c'est un import qui le prouve — un type ne s'appelle pas. " +
      "Sept modules de production le nomment : `core/types.ts` (ToolContext.sessionId), " +
      "`core/chaine/etapes.ts` (ContexteProvenance + les DEUX méthodes " +
      "d'IndexProvenance, que le fichier appelle « le verrou n° 1 du § 20 »), " +
      "`core/chaine/etape-11-provenance.ts` (l'implémentation et `marquerResultat`), " +
      "`core/audit/vocabulaire.ts` (ContenuLigne), `core/audit/journal.ts` " +
      "(EnteteAppel), `core/chaine/identite.ts` et `core/chaine/orchestrateur.ts`. " +
      "Avant le lot 1d, la fabrique existait, était gardée par G2 et G3 — et AUCUNE " +
      "des interfaces que l'étape 11 consomme ne portait le type : la décision était " +
      "écrite et non cousue, exactement le défaut que ce registre existe pour voir. " +
      "Le compte a été mesuré par la garde G6 de " +
      "`core/epreuve/lot1c-la-couture-manquante.temoin.spec.ts`, qui lit la source " +
      "d'`etapes.ts` et annonce « 0 sessionId: string · 3 sessionId: SessionId ».",
  },
  {
    adr: "0014",
    decision: "Une session se RELIT depuis le socle ; la relire ne la frappe pas.",
    etat: "à-coudre",
    symbole: "relireDepuisLeSocle",
    genre: "membre",
    module: "core/identite/session.ts",
    mesureeAilleurs: "core/chaine/identite.spec.ts",
    motif:
      "0 appelant LIVRÉ mesuré — et c'est le cliquet G2 de `identite.spec.ts` qui " +
      "l'annonce déjà en toutes lettres (« 0 appelant LIVRÉ de relireDepuisLeSocle »). " +
      "Son appelant est le transport HTTP (`core/transport/`, lot 3), qui n'existe pas.",
  },

  // ── ADR 0015 ───────────────────────────────────────────────────────────────
  {
    adr: "0015",
    decision: "`idFields` n'exonère plus rien : le schéma seul referme un champ.",
    etat: "cousue",
    symbole: "analyserArgumentsDuSchema",
    genre: "fonction",
    module: "core/chaine/etape-11-provenance.ts",
    mesureeAilleurs: "core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts",
    motif:
      "✅ COUSU AU LOT 1d. ⚠️ ET LE COMPTE D'APPELANTS N'EN DIT RIEN — c'est pour ça " +
      "que cette entrée délègue. La couture de cet ADR est un RETRAIT DE PARAMÈTRE : " +
      "le compte valait 1 (`core/chaine/orchestrateur.ts`) avant, il vaut 1 après, et " +
      "il aurait valu 1 aussi si personne n'avait rien fait. La mesure qui décide vit " +
      "dans le témoin A2 de `verrous-du-paragraphe-20.temoin.spec.ts`, qui annonce " +
      "`analyserArgumentsDuSchema.length` et exige 2 : un troisième paramètre " +
      "obligatoire, ou un paramètre FACULTATIF — qui ne compte pas dans `length` et " +
      "ferait tomber ce nombre à 1 —, rouvriraient le canal sans changer un verdict. " +
      "Le `if (identifiants.has(nom)) continue;` du corps a disparu avec lui, et " +
      "`orchestrateur.ts` ne passe plus `outil.idFields`.",
  },

  // ── ADR 0016 ───────────────────────────────────────────────────────────────
  {
    adr: "0016",
    decision:
      "Les champs de gouvernance sont DÉCLARÉS, et le cumul avec le filet au nom " +
      "ne peut que resserrer.",
    etat: "cousue",
    symbole: "cumulerChampsDeGouvernance",
    genre: "fonction",
    module: "core/adapter-kit/champs-declares.ts",
    mesureeAilleurs: "core/chaine/gouvernance-declaree.temoin.spec.ts",
    motif:
      "✅ COUSUE AU LOT 1d. 1 appelant de production mesuré : " +
      "`core/chaine/etape-11-provenance.ts`, qui construit sa liste `gouvernance` SUR " +
      "l'union rendue — la débrancher ne laisserait rien à parcourir. Le chemin complet : " +
      "`OutilDuCatalogue.governanceFields` (`core/chaine/etapes.ts`) → " +
      "`orchestrateur.ts` → `analyserArgumentsDuSchema()`. " +
      "⚠️ CE MOTIF NE SE LIT PAS SEUL : avant le lot 1d, l'entrée portait « 0 appelant », " +
      "et c'est LE cas qui a fait naître ce registre — la fonction était écrite, " +
      "exportée, gardée par 4 tests et NOMMÉE dans deux blocs de commentaires " +
      "(`adapter-kit/types.ts`, `registry/types.ts`), ce qui suffisait à faire croire " +
      "la couture faite à qui cherchait le nom au `grep`.",
  },

  // ── ADR 0017 ───────────────────────────────────────────────────────────────
  {
    adr: "0017",
    decision: "Le journal enveloppe l'appel : aucune terminaison ne sort sans sa ligne.",
    etat: "cousue",
    symbole: "avecJournal",
    genre: "fonction",
    module: "core/audit/journal.ts",
    mesureeAilleurs: null,
    motif:
      "1 appelant de production mesuré : `core/chaine/orchestrateur.ts`. " +
      "⚠️ IL NE SE VOIT QU'AVEC L'ARGUMENT DE TYPE : l'appel s'écrit " +
      "`avecJournal<ChargeServie>(…)`, et un motif `nom\\s*\\(` le manque. C'est le " +
      "témoin de la règle de forme du genre `fonction`, et il est réel.",
  },
  {
    adr: "0017",
    decision:
      "Ce qui compte comme effet extérieur est un `switch` exhaustif, dérivé " +
      "chez son propriétaire et jamais recopié.",
    etat: "cousue",
    symbole: "estEffetExterieur",
    genre: "fonction",
    module: "core/policy/effet.ts",
    mesureeAilleurs: null,
    motif:
      "3 appelants de production mesurés : `core/chaine/orchestrateur.ts` (le cliquet " +
      "de l'étape 14), `core/audit/cloture.ts` (la ligne de clôture de purge) et " +
      "`core/limits/idempotency.ts` (l'issue de réservation de l'ADR 0021, venue au lot " +
      "1d). Trois endroits, une seule totalité — et le troisième est arrivé sans que " +
      "personne ait à recopier le `switch`.",
  },

  // ── ADR 0018 ───────────────────────────────────────────────────────────────
  {
    adr: "0018",
    decision: "Le socle est mono-instance en v1 ; un ARBITRE PUR décide du démarrage.",
    etat: "cousue",
    symbole: "deciderDemarrageMonoInstance",
    genre: "fonction",
    module: "core/instance/verrou.ts",
    mesureeAilleurs: "core/instance/couture-adr-0018.temoin.spec.ts",
    motif:
      "✅ COUSUE AU LOT 1d. 1 appelant de production mesuré : `core/instance/demarrage.ts`, " +
      "où `demarrerLeSocleMonoInstance()` appelle l'arbitre sur le résultat d'`acquerir()` " +
      "et n'ouvre le service que si la décision l'autorise. Le débranchement est éprouvé " +
      "dans les DEUX sens par le témoin nommé ci-dessus : T1 fabrique la séquence " +
      "débranchée — le verrou mord, et DEUX socles démarrent quand même — pendant que la " +
      "même paire par `demarrerLeSocleMonoInstance` n'en autorise qu'UN. " +
      "⚠️ CETTE ENTRÉE A ÉTÉ FAUSSE PENDANT TOUT LE LOT 1d, ET C'EST LE MOTIF QUI COMPTE " +
      "LE PLUS ICI : elle annonçait « à-coudre » et « 🔴 la fonction n'existe pas encore » " +
      "alors que la fonction était définie et appelée dans le même arbre de travail. " +
      "C'est le second sens de rougissement — celui qu'on oublie d'écrire —, survenu dans " +
      "le lot même qui l'a nommé, et rien ne l'a vu parce que la garde G1 n'existait pas. " +
      "⚠️ BORNE ÉCRITE AVEC LA MESURE : la moitié POSTGRES de l'ADR 0018 n'est pas écrite " +
      "(`VerrouPostgres`, `core/transport/`), et aucun point d'entrée de conteneur " +
      "n'appelle `demarrerLeSocleMonoInstance` — la couture est prouvée à l'intérieur de " +
      "`core/instance/`, pas jusqu'au processus qui sert.",
  },
  {
    adr: "0018",
    decision:
      "Le statut que le healthcheck rend est DÉRIVÉ de l'état du verrou, par une " +
      "seule fonction — jamais recalculé à côté.",
    etat: "cousue",
    symbole: "statutHealthcheckPourVerrou",
    genre: "fonction",
    module: "core/instance/verrou.ts",
    mesureeAilleurs: null,
    motif:
      "2 appelants de production mesurés : `core/instance/demarrage.ts` " +
      "(`relireLaSanteMonoInstance`, qui relit le verrou à CHAQUE appel) et " +
      "`ops/mono-instance.ts` (contrôle 4, qui confronte le statut annoncé par un socle " +
      "observé à l'état qu'il déclare). ⚠️ LE SECOND EST ARRIVÉ À LA RECETTE DU LOT 1d, ET " +
      "IL FERME UNE SECONDE DÉRIVATION : `ops/` recalculait le même fait par un ternaire " +
      "sur les deux constantes. Les deux tables étaient identiques ce jour-là — deux " +
      "dérivations d'un même fait ne se contredisent jamais le jour où on les écrit, elles " +
      "se contredisent le jour où l'une des deux change, et celle qui ne suivra pas est " +
      "toujours le CONTRÔLE.",
  },
  {
    adr: "0018",
    decision:
      "Le healthcheck RELIT le verrou à chaque appel et passe à 503 dès qu'il " +
      "n'est plus tenu.",
    etat: "à-coudre",
    symbole: "relireLaSanteMonoInstance",
    genre: "fonction",
    module: "core/instance/demarrage.ts",
    mesureeAilleurs: "core/instance/demarrage.spec.ts",
    motif:
      "0 appelant de production MESURÉ, et c'est attendu : son appelant est la route " +
      "`/healthz`, qui vit dans `core/transport/` (lot 3) et n'existe pas. ⚠️ C'EST LA " +
      "MOITIÉ DE L'ADR 0018 QUE PERSONNE N'APPELLE ENCORE, et l'écrire ici est ce qui " +
      "empêche de l'oublier au moment où le transport atterrira : un socle déployé " +
      "aujourd'hui prendrait le verrou au démarrage et ne saurait jamais dire qu'il l'a " +
      "perdu. Le cas que l'ADR exclut nommément — un healthcheck qui répond depuis un " +
      "drapeau posé à l'acquisition plutôt que depuis une relecture — est éprouvé par le " +
      "témoin T3 de `core/instance/couture-adr-0018.temoin.spec.ts`.",
  },

  // ── ADR 0019 à 0022 — les décisions du lot 1d ──────────────────────────────
  {
    adr: "0019",
    decision:
      "Toute décision d'architecture nomme le symbole qui la porte, et une garde " +
      "confronte ce registre au graphe d'appels réel.",
    etat: "à-coudre",
    symbole: "REGISTRE_DES_COUTURES",
    genre: "constante",
    module: "core/coutures/registre.ts",
    mesureeAilleurs: "core/coutures/registre.spec.ts",
    motif:
      "0 appelant de production MESURÉ, et c'est ici l'état DÉFINITIF, non une dette : le " +
      "registre est une DONNÉE, dont le seul lecteur légitime est une garde. La mesure " +
      "réelle vit dans `core/coutures/registre.spec.ts`, ÉCRITE À LA RECETTE DU LOT 1d — " +
      "jusque-là, cette délégation pointait un fichier ABSENT, c'est-à-dire que l'ADR " +
      "écrite pour empêcher qu'une décision reste non cousue était elle-même non cousue.",
  },
  {
    adr: "0019",
    decision:
      "La confrontation registre ↔ graphe d'appels est une fonction PURE d'un " +
      "ensemble de fichiers injecté, éprouvée par des témoins fabriqués.",
    etat: "à-coudre",
    symbole: "verifierLesCoutures",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/coutures/couture.temoin.spec.ts",
    motif:
      "0 appelant de production MESURÉ, et c'est l'état DÉFINITIF : ses deux appelants " +
      "sont des gardes (`registre.spec.ts` pour le dépôt réel, `couture.temoin.spec.ts` " +
      "pour les jeux de fichiers fabriqués), et une garde n'est pas un module de " +
      "production. ⚠️ LA PURETÉ EST LA DÉCISION, PAS UN STYLE : une garde qui lirait le " +
      "disque depuis son propre corps ne serait éprouvable qu'en MUTILANT le dépôt — et " +
      "un débranchement par copie de fichier réel, sur un arbre où plusieurs " +
      "constructeurs écrivent, perd le travail du voisin en silence. C'est arrivé au lot " +
      "1d. La mesure qui décide est le compte de témoins fabriqués : 14, dont 8 exigent " +
      "un ROUGE.",
  },
  {
    adr: "0020",
    decision:
      "La clé d'idempotence n'atteint plus l'adaptateur, et sa forme est fermée " + "côté socle.",
    etat: "cousue",
    symbole: "empreinteDeCleDIdempotence",
    genre: "fonction",
    module: "core/limits/idempotency.ts",
    mesureeAilleurs: null,
    motif:
      "1 appelant de production mesuré, et ce n'est PAS celui que ce registre annonçait. " +
      "Il prédisait `core/limits/limites.ts` ; la couture a atterri dans " +
      "`core/chaine/orchestrateur.ts`, qui pose `ctx.idempotencyRef`. " +
      "⚠️ CE MOTIF A ANNONCÉ « 2 APPELANTS » JUSQU'À LA RECETTE DU LOT 1d, en comptant " +
      "`reserver()` — qui vit dans `core/limits/idempotency.ts`, c'est-à-dire dans le " +
      "module qui DÉFINIT la fonction. `core/coutures/contrat.ts` exclut nommément le " +
      "définisseur du compte, et dit pourquoi : sans cette exclusion, un module qui porte " +
      "une fonction se compte lui-même comme son propre appelant et la garde annonce " +
      "« 1 appelant » sur une fonction morte. L'usage interne à `reserver()` est réel — " +
      "l'empreinte, et jamais la clé, est ce qui entre dans `ops_idempotency.key` — mais " +
      "ce n'est pas un appelant. Le motif " +
      "du déplacement est la couture elle-même : `ConstruireContexteOutil` est une " +
      "dépendance INJECTÉE, et confier la règle à l'injecté l'aurait laissée cousue " +
      "nulle part — le type rend désormais un `ContexteSansEmpreinte`. ⚠️ Le retrait " +
      "d'`idempotencyKey` de `ToolContext` est accompagné de " +
      "`NOMS_RESERVES_HORS_CONTEXTE` (`core/types.ts`), sans quoi le contrôle 7 aurait " +
      "cessé de refuser ce nom dans un schéma d'entrée, EN SILENCE.",
  },
  {
    adr: "0020",
    decision:
      "Un nom RETIRÉ de `ToolContext` reste interdit dans un schéma d'entrée : " +
      "`ClesDAutorisation` gagne un TROISIÈME ensemble.",
    etat: "cousue",
    symbole: "NOMS_RESERVES_HORS_CONTEXTE",
    genre: "constante",
    module: "core/types.ts",
    mesureeAilleurs: null,
    motif:
      "1 appelant de production mesuré : `core/adapter-kit/autorisation.ts`, où " +
      "`clesDAutorisationDepuisSource` en fait la valeur par DÉFAUT de son troisième " +
      "paramètre et l'unit aux deux autres ensembles — d'où la garde remonte jusqu'à " +
      "`core/registry/enregistrer.ts` (contrôle 7). ⚠️ CETTE ENTRÉE EST LA CONTREPARTIE " +
      "OBLIGATOIRE DE LA PRÉCÉDENTE, et le mode de défaillance qu'elle ferme est le " +
      "plus coûteux qu'on connaisse : retirer une propriété du `ctx` la retirait de la " +
      "liste DÉRIVÉE du contrôle 7 sans qu'aucune garde ne change de couleur. Une garde " +
      "qui RÉTRÉCIT. Un plancher-témoin lève désormais si la liste est vidée.",
  },
  {
    adr: "0020",
    decision:
      "Chaque champ de `ToolContext` porte un RÉGIME de canal et son motif : " +
      "l'inventaire des canaux invisibles du § 20 est CLOS.",
    etat: "à-coudre",
    symbole: "STATUT_DES_CANAUX_DE_CONTEXTE",
    genre: "constante",
    module: "core/types.ts",
    mesureeAilleurs: "core/canaux-du-contexte.temoin.spec.ts",
    motif:
      "0 appelant de production MESURÉ, et c'est ici l'état DÉFINITIF, non une dette. " +
      "C'est une DONNÉE typée — même statut que ce registre-ci : son seul lecteur " +
      "légitime est une garde, jamais un module de production. ⚠️ ET SA TOTALITÉ NE " +
      "DÉPEND PAS D'UN APPELANT : le type est `Readonly<Record<keyof ToolContext, " +
      "StatutDeCanal>>`, si bien qu'ajouter un champ au `ctx` sans le classer est une " +
      "erreur de COMPILATION — ce qu'aucun appelant ne pourrait faire mieux. La garde " +
      "nommée ci-dessus y ajoute ce que `keyof` ne dit pas : le TYPE RÉEL de chaque " +
      "champ, relu dans le SOURCE, et le refus qu'un champ déclaré fermé par son type " +
      "porte en réalité une chaîne libre.",
  },
  {
    adr: "0021",
    decision:
      "L'issue d'idempotence se dérive du CLIQUET d'effet extérieur, jamais du " +
      "seul genre de la terminaison.",
    etat: "cousue",
    symbole: "issueDeReservation",
    genre: "fonction",
    module: "core/limits/idempotency.ts",
    mesureeAilleurs: null,
    motif:
      "1 appelant de production mesuré, et c'est celui que ce registre annonçait : le " +
      "`finally` de l'étape 14 dans `core/chaine/orchestrateur.ts`. Il lit le cliquet " +
      "par le TROISIÈME membre d'`AffineursDAppel` (`effetExterieurSurvenu`), celui que " +
      "l'ADR 0017 annonçait (« un troisième affineur — il y en aura »). Le ternaire " +
      '`issueDeLEffet === "done" ? "done" : "failed"` a disparu du point d\'usage. ' +
      "Couture éprouvée ROUGE puis VERTE : l'`it.fails` « une clé d'idempotence ne doit " +
      "JAMAIS faire partir deux envois » (`core/epreuve/journal-et-pannes-lot1c.spec.ts`) " +
      "est basculé en `it()` et mesure 1 envoi là où il en mesurait 2.",
  },
  {
    adr: "0022",
    decision:
      "MOITIÉ « FORME » — la ligne d'intention se reconnaît à un nom d'outil " +
      "réservé au socle, et porte une charge versionnée.",
    etat: "à-coudre",
    symbole: "estLigneDIntention",
    genre: "fonction",
    module: "core/audit/intention.ts",
    mesureeAilleurs: null,
    motif:
      "À écrire par le constructeur ④, sur le modèle exact d'`estLigneDeCloture`. Ses " +
      "appelants seront `core/audit/verification.ts` (le compteur) et " +
      "`core/registry/enregistrer.ts` (la réservation du nom). ⚠️ Tant que le " +
      "compteur n'existe pas, ARMER la ligne d'intention est interdit : une ligne " +
      "qu'on écrit sans savoir la compter est une ligne qu'on ne saura pas vérifier. " +
      "⚠️ CE SYMBOLE EST NOMMÉ D'AVANCE ET N'EXISTE PAS : `core/audit/intention.ts` " +
      "n'exporte que le TYPE `EstLigneDIntention`. L'état `à-coudre` n'exige que « zéro " +
      "appelant », condition qu'un symbole jamais écrit remplit gratuitement — la garde " +
      "G1 le compte donc à part, l'ANNONCE, et tient un cliquet nommé sur les symboles " +
      "annoncés d'avance pour qu'un second ne s'y ajoute pas en silence.",
  },
  {
    adr: "0022",
    decision:
      "MOITIÉ « COMPTEUR » — `RapportVerification` gagne trois comptes " +
      "d'intention, et `GENRES_ANOMALIE` un genre, dans le MÊME geste que la forme.",
    etat: "à-coudre",
    symbole: "ComptesDIntention",
    genre: "type",
    module: "core/audit/intention.ts",
    mesureeAilleurs: null,
    motif:
      "0 appelant de production mesuré : aucun module ne l'importe, `RapportVerification` " +
      "ne porte pas encore ces trois champs et `GENRES_ANOMALIE` pas encore le genre " +
      "`intention-close-sans-ouverture`. ⚠️ CETTE ENTRÉE EXISTE PARCE QUE L'ADR 0022 EST " +
      "UNE DÉCISION EN DEUX MOITIÉS, et que le registre n'en portait qu'une. Son " +
      "avertissement central est qu'armer la forme sans le compteur serait « le pire des " +
      "trois états » ; avec une entrée unique, un constructeur qui aurait posé la forme et " +
      "oublié le compteur aurait fait passer cette entrée de `à-coudre` à `cousue`, le " +
      "registre serait devenu VERT, et l'alarme promise — « une intention sans issue EST " +
      "l'alarme » — n'aurait eu personne pour la lever. Deux entrées : la seconde reste " +
      "rouge tant que le compteur n'atterrit pas.",
  },
];

/**
 * Les numéros d'ADR couverts par le registre, DÉRIVÉS — jamais réécrits.
 *
 * Sert à la garde de couverture : elle confronte cet ensemble aux fichiers
 * réellement présents dans `docs/adr/`, et rougit sur tout ADR qui n'y figure
 * pas. C'est le mécanisme qui rend un ADR neuf IMPOSSIBLE à écrire sans dire qui
 * porte sa décision.
 */
export const ADR_COUVERTS: readonly string[] = [
  ...new Set(REGISTRE_DES_COUTURES.map((entree) => entree.adr)),
].sort();
