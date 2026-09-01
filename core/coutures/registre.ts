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

// ═════════════════════════════════════════════════════════════════════════════
//  L'ASSERTION — LE SECOND FAIT, ET C'EST LE FAIT NEUF (ADR 0041)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE NOM D'UN TEST QUI ÉCHOUE SI LA DÉCISION N'A PAS ATTERRI.**
 *
 * ═══ POURQUOI CE CHAMP EXISTE — LE DÉFAUT MESURÉ AU LOT 3 ═══
 *
 * L'état {@link EtatDeCouture} `cousue` mesure **le nombre d'APPELANTS DE
 * PRODUCTION d'un symbole**. Il ne mesure PAS que la DÉCISION a atterri, et les
 * deux se séparent exactement là où personne ne regarde : quand une décision
 * NEUVE porte sur un symbole DÉJÀ COUSU. Ajouter un champ à `PortsDuService`,
 * poser un refus dans le bloc de l'étape 7 — le symbole garde ses appelants,
 * l'entrée reste `cousue`, et la garde reste VERTE sur une décision qui
 * n'existe nulle part dans le code.
 *
 * C'est arrivé DEUX FOIS dans le même lot, sur deux ADR marqués « Statut :
 * acceptée » : l'ADR 0036 (décision 1, le plafond de 40 à l'étape 7) et
 * l'ADR 0037 (décisions 2 et 3, `journalDesRefus` et `delaiDeReprise` sur
 * `PortsDuService`). La garde des coutures n'a rien vu, **et elle avait raison
 * sur ce qu'elle mesure**. Une garde peut être verte, honnête, et mesurer autre
 * chose que ce que son lecteur croit.
 *
 * ═══ CE QUE CE CHAMP EST, ET CE QU'IL N'EST PAS ═══
 *
 * ⚠️ **CE N'EST PAS UNE CHAÎNE RECOPIÉE À LA MAIN.** Un nom de test écrit ici
 *    et nulle part ailleurs remplacerait une garde aveugle par un registre
 *    MENTEUR — pire, parce qu'il aurait l'air d'une mesure.
 *    `verifierLesAssertions` confronte donc CHAQUE champ au disque : le fichier
 *    doit exister, le test doit y être déclaré sous ce nom EXACT, son corps
 *    doit porter au moins un `expect(`, et il doit NOMMER ce que
 *    {@link AssertionDeCouture.nomme} annonce.
 *
 * ⚠️ **`null` EST UNE RÉPONSE, PAS UN OUBLI TOLÉRÉ.** Une entrée sans assertion
 *    n'est ni `cousue` ni `à-coudre` du point de vue de cette mesure-ci : elle
 *    est **SANS-ASSERTION**, et cet état se COMPTE. Le champ est OBLIGATOIRE
 *    précisément pour qu'on ne puisse pas inscrire une décision sans avoir
 *    répondu à la question, et un cliquet interdit au compte de monter.
 */
export interface AssertionDeCouture {
  /**
   * Le fichier de garde qui porte le test — chemin depuis la racine du dépôt.
   * Il DOIT se terminer par `.spec.ts` : une assertion portée par un module de
   * production ne serait pas une assertion, ce serait du code.
   */
  readonly fichier: string;
  /**
   * Le NOM EXACT du test, tel que `it("…")`, `it.fails("…")` ou `test("…")`
   * l'écrit — **entre guillemets doubles**, sans guillemet double à l'intérieur.
   *
   * ⚠️ LA BORNE, ÉCRITE AVEC LA RÈGLE : la garde cherche une forme LITTÉRALE.
   *    Un nom composé à l'exécution est introuvable, et la garde le dit par une
   *    anomalie plutôt que de rendre un vert.
   */
  readonly nom: string;
  /**
   * Les NOMS que le CORPS du test doit citer — le champ neuf, le code de refus,
   * la constante dont l'absence défait la décision.
   *
   * ⚠️ **C'EST CE CHAMP QUI EMPÊCHE DE POINTER N'IMPORTE QUEL TEST VERT.** Sans
   *    lui, une entrée pourrait nommer un test qui passe pour une raison
   *    étrangère à la décision, et le registre redeviendrait une prose. La liste
   *    ne peut pas être vide : la garde en fait une anomalie.
   */
  readonly nomme: readonly string[];
}

/** Ce que toute entrée porte, quel que soit son état. */
interface EntreeCommune {
  /** Le numéro de l'ADR, sur quatre chiffres — `"0016"`. Il DOIT désigner un fichier de `docs/adr/`. */
  readonly adr: string;
  /**
   * LE SECOND FAIT DU REGISTRE (ADR 0041) — voir {@link AssertionDeCouture}.
   *
   * `null` veut dire **SANS-ASSERTION** : aucun test connu ne rougit si cette
   * décision se défait. C'est une réponse honnête et comptée, jamais un défaut
   * de remplissage.
   */
  readonly assertion: AssertionDeCouture | null;
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
    etat: "cousue",
    symbole: "Octroi",
    genre: "type",
    module: "core/auth/contrat.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "1 importateur de production mesuré : `core/auth/octroi.ts`, qui rend un `Octroi` depuis " +
      "`echangerLeCode()`. ✅ DEUX PÉREMPTIONS SUCCESSIVES, ET ELLES ONT FONCTIONNÉ TOUTES LES " +
      "DEUX : l'entrée était en `à-nommer` tant que `core/auth/` n'existait pas, puis en " +
      "`à-coudre` tant que l'émetteur n'était pas écrit. C'est l'usage prévu de ces états — ils " +
      "ne cachaient pas la dette, ils l'ont fait échoir. ⚠️ CE QUE CE COMPTE NE MESURE PAS : le " +
      "type contraint la SORTIE du premier octroi, et lui seul. Un rafraîchissement ne rend " +
      "délibérément PAS un `Octroi` — `ResultatDeRafraichissement` porte la colonne " +
      "`sessionIdColonne` en texte, parce que retyper une session est le geste du transport " +
      "(`APPELANTS_DE_LA_RELECTURE`) et non celui de l'émetteur.",
  },
  {
    adr: "0001",
    decision:
      "`ctx.requestId` est FRAPPÉ par le socle et `ctx.deadline` CALCULÉE par lui : " +
      "ni l'un ni l'autre n'est recopié d'une valeur reçue.",
    etat: "cousue",
    symbole: "ValeursFrappeesParLeTransport",
    genre: "type",
    module: "core/transport/contrat.ts",
    mesureeAilleurs: "core/transport/stdio/serveur.spec.ts",
    assertion: null,
    motif:
      "1 importateur de production mesuré : `core/transport/stdio/serveur.ts`, où la fonction " +
      "`frapper()` rend ce type et ne reçoit RIEN de l'enveloppe — c'est la forme la plus " +
      "courte d'une preuve que rien de reçu n'y entre. ⚠️ RÈGLE POSÉE PAR L'ADR 0020, COUTURE " +
      "DUE AU TRANSPORT, ET ELLE VIENT D'ÊTRE FAITE : l'inventaire des canaux du `ctx` " +
      "(`core/types.ts`) classait les deux champs « à-fermer-au-transport » depuis le lot 1c, " +
      "et c'est cette entrée-ci qui a empêché de les y oublier. ⚠️ ET LE COMPTE " +
      "D'IMPORTATEURS N'EST PAS LA MESURE DE FOND : un transport peut parfaitement importer " +
      "ce type et recopier quand même l'`id` de l'enveloppe. Ce qui mesure est la garde " +
      "nommée en `mesureeAilleurs` — deux appels portant le MÊME `id` JSON-RPC doivent " +
      "recevoir deux `requestId` DIFFÉRENTS, et l'écart de la `deadline` à l'instant du socle " +
      "doit valoir exactement le budget. ⚠️ BORNE ÉCRITE : le transport HTTP ne l'importe pas " +
      "encore, et la règle y vaut mot pour mot.",
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
    motif: "1 appelant de production mesuré : `core/adapter-kit/manifest.ts`.",
  },
  {
    adr: "0004",
    decision: "L'énumération de profils reçue est confrontée à sa forme, aux deux entrées du kit.",
    etat: "cousue",
    symbole: "verifierEnumerationProfils",
    genre: "fonction",
    module: "core/adapter-kit/profils.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ 2 appelants de production mesurés : `core/adapter-kit/kit.ts` (LÈVE — c'est l'entrée " +
      "unique de l'énumération dans le kit) et `core/adapter-kit/manifest.ts` (REND UNE " +
      "ANOMALIE, à côté de son jumeau `verifierFormeDuSceau`, dont le contrat est de rendre " +
      "la LISTE et jamais la première). ⚠️ C'ÉTAIT LE JUMEAU OUBLIÉ, ET LE MOTIF DE SON OUBLI " +
      "MÉRITE DE RESTER ÉCRIT : sa voisine immédiate, née de la même décision dans le même " +
      "fichier, avait un appelant ; celle-ci n'en avait aucun, si bien que le sceau des " +
      "profils était confronté dans sa FORME et l'énumération qu'il scelle jamais dans la " +
      "sienne. ⚠️ ET LA COUTURE A SUPPRIMÉ UNE SECONDE ÉCRITURE : `creerAdapterKit` portait " +
      "sa propre comparaison `length === 0`, plus ÉTROITE — un profil au nom vide ou en " +
      "double traversait la construction en silence, et la garde du § 14 comptait ensuite un " +
      "profil de plus qu'il n'en existe. Une seule expression de la règle, désormais. " +
      "⚠️ BORNE : elle dit qu'une énumération est UTILISABLE, jamais qu'elle est la BONNE — " +
      "la confrontation au sceau du socle appartient au registre (`profilesVersion`, " +
      "`profilesSha`), et les confondre ferait croire qu'un manifeste admis a été construit " +
      "contre l'énumération courante.",
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
    motif:
      "Statut PROPOSÉE — elle attend l'accord de Will (décision W-7), et sa portée est " +
      "`voice/`, lot 8. Aucune conséquence sur `core/` : inscrire un symbole ici " +
      "reviendrait à décider à la place de Will.",
  },
  {
    adr: "0011",
    decision: "Les lectures sans session, agrégateur par agrégateur.",
    etat: "hors-code",
    assertion: null,
    motif:
      "Statut PROPOSÉE, et c'est un INVENTAIRE DE MESURE : aucune décision d'écriture, " +
      "donc aucun symbole à porter. Les travaux préalables vivent dans le dépôt voisin.",
  },
  {
    adr: "0012",
    decision: "La route `/api/mcp` dans Axion-IA, et les gardes qu'elle rencontre.",
    etat: "hors-code",
    assertion: null,
    motif:
      "Acceptée, mais sa portée est le DÉPÔT VOISIN `axionia` (lot 4a). Un symbole de " +
      "ce dépôt-ci ne peut pas la porter, et une garde d'ici ne peut pas la mesurer.",
  },
  {
    adr: "0013",
    decision: "Les données derrière les huit écrans de la console.",
    etat: "hors-code",
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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

  {
    adr: "0016",
    decision:
      "MOITIÉ « TABLE » — `ops_tool` porte enfin `governanceFields`, le dernier tronçon " +
      "d'une propagation qui existait partout ailleurs.",
    etat: "hors-code",
    assertion: null,
    motif:
      "⚠️ CETTE MOITIÉ NE PRODUIT AUCUN SYMBOLE DE CE DÉPÔT : elle porte sur `model " +
      "OpsTool` de `prisma/schema.prisma`. Elle est inscrite parce qu'elle est MESURÉE — " +
      "`core/adapter-kit/colonne-de-gouvernance.temoin.spec.ts` confronte les propriétés " +
      "d'`OutilDuCatalogue` aux colonnes du modèle, LUES toutes deux sur le disque. La " +
      "déclaration voyageait du manifeste jusqu'à l'étape 11 PAR LE TYPE ; au premier " +
      "catalogue réel elle serait arrivée VIDE, et le § 20 n'aurait plus surveillé que ce " +
      "que le filet au nom retient — sur la seule branche qu'aucune confirmation ne " +
      "rattrape. ⚠️ ET LA GARDE TIENT UN CLIQUET DATÉ SUR CE QUI MANQUE ENCORE : quatre " +
      "propriétés n'ont toujours aucune colonne (`pagination`, `compaction`, `maxBytes`, " +
      "`idFields`). Elles ne sont pas posées ici parce qu'une colonne sans LECTEUR est une " +
      "seconde source de vérité — motif pour lequel le lot 1d avait refusé de poser " +
      "`governanceFields` seule — et parce que deux d'entre elles demandent un arbitrage de " +
      "FORME. Une cinquième ne peut plus s'ajouter en silence.",
  },

  // ── ADR 0017 ──────────────────────────────────────────────────────────────────
  {
    adr: "0017",
    decision: "Le journal enveloppe l'appel : aucune terminaison ne sort sans sa ligne.",
    etat: "cousue",
    symbole: "avecJournal",
    genre: "fonction",
    module: "core/audit/journal.ts",
    mesureeAilleurs: null,
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
      "✅ LA BORNE DE CETTE ENTRÉE EST LEVÉE AU LOT 2, ET ELLE EST RÉÉCRITE ICI PLUTÔT " +
      "QUE RETIRÉE : elle disait « la moitié POSTGRES n'est pas écrite, et aucun point " +
      "d'entrée de conteneur n'appelle `demarrerLeSocleMonoInstance` — la couture est " +
      "prouvée à l'intérieur de `core/instance/`, pas jusqu'au processus qui sert ». " +
      "`core/instance/postgres.ts` existe (ADR 0024) et `ops/main.ts` appelle " +
      "`demarrerLeSocleMonoInstance` à l'étage 1, AVANT tout le reste. La couture va " +
      "désormais jusqu'au processus. ⚠️ IL RESTE UNE BORNE, ET ELLE N'EST PAS LA MÊME : " +
      "en local, l'URL de base est sur `stub.invalid`, donc l'implémentation retenue est " +
      "le DOUBLE EN MÉMOIRE, qui ne voit pas un second processus. `ChoixDuVerrou` porte " +
      "ce fait dans `aveugleAuxAutresProcessus`, pour que la borne voyage avec le choix.",
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
    assertion: null,
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
    etat: "cousue",
    symbole: "relireLaSanteMonoInstance",
    genre: "fonction",
    module: "core/instance/demarrage.ts",
    mesureeAilleurs: "core/instance/demarrage.spec.ts",
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 appelant de production mesuré : `ops/main.ts`, qui l'appelle à " +
      "DEUX endroits — au premier battement de la veille (étage 7) et, surtout, dans le " +
      "healthcheck construit par `construireLeHealthcheck`, à CHAQUE appel. ⚠️ CETTE ENTRÉE " +
      "ANNONÇAIT « 0 appelant, et c'est attendu : son appelant est la route `/healthz`, qui " +
      "vit dans `core/transport/` et n'existe pas ». La racine de composition a levé " +
      "l'attente sans attendre le transport : le healthcheck est une FONCTION, et le " +
      "transport ne fera que la publier. Le cas que l'ADR exclut nommément — un healthcheck " +
      "qui répond depuis un drapeau posé à l'acquisition plutôt que depuis une relecture — " +
      "est éprouvé deux fois : par le témoin T3 de " +
      "`core/instance/couture-adr-0018.temoin.spec.ts`, et désormais de bout en bout par " +
      "`ops/main.spec.ts` (④), où le verrou est ARRACHÉ après le démarrage et où le " +
      "healthcheck passe de 200 à 503 sans que rien d'autre ne bouge.",
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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
    assertion: null,
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

  // ── ADR 0023 ───────────────────────────────────────────────────────────────
  {
    adr: "0023",
    decision:
      "Le démarrage est une ÉCHELLE DE SEPT ÉTAGES déclarée comme une donnée ; " +
      "`ops/main.ts` la parcourt et ne redécide rien.",
    etat: "cousue",
    symbole: "EtageDeDemarrage",
    genre: "type",
    module: "ops/demarrage/etages.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 importateur de production mesuré : `ops/demarrage.ts`, où " +
      "l'arbitre `arbitrerLeDemarrage` et la garde `verifierLaCouvertureDesEtages` prennent " +
      "l'échelle en PARAMÈTRE typé par ce type — ce qui les rend éprouvables sur une échelle " +
      "fabriquée sans jamais mutiler la vraie. Les trois entrées annoncées comme filles " +
      "sont basculées du même mouvement : `relireLaSanteMonoInstance` et " +
      "`deciderDemarrageMonoInstance` ici même, `demarrerPolitique` par la bascule du " +
      "`it.todo` de `core/epreuve/politique-chemins-de-panne.spec.ts`.",
  },
  {
    adr: "0023",
    decision:
      "TROIS issues de refus, pas deux : sortir, amputer, désactiver. Le deuxième " +
      "état du coffre (§ 23) et l'épinglage (§ 20) n'ont pas d'autre endroit où se ranger.",
    etat: "cousue",
    symbole: "IssueDeRefus",
    genre: "type",
    module: "ops/demarrage/etages.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 importateur de production mesuré : `ops/demarrage.ts`, où " +
      "`RefusDEtage.issue` le porte et où `issueDuRefusDeCoffre` le RETOURNE. ⚠️ ET CETTE " +
      "ENTRÉE SÉPARÉE A SERVI EXACTEMENT À CE POUR QUOI ELLE A ÉTÉ ÉCRITE : en la cousant, " +
      "on a mesuré que l'échelle attribue `demarrage-ampute` à l'étage 2 alors que son " +
      "propre `refusQuand` porte sur un coffre ABSENT, cas où le § 23 exige que le " +
      "conteneur NE DÉMARRE PAS. L'issue est donc DÉRIVÉE du propriétaire de la décision " +
      "(`decisionDeDemarrage`), et l'écart est mesuré par `ops/demarrage.spec.ts` (B) au " +
      "lieu d'être écrit dans une prose. Voir l'écart signalé à l'architecte.",
  },
  {
    adr: "0023",
    decision:
      "L'arbitrage du démarrage est PUR : on lui donne ce que les sept étages ont " +
      "répondu, il rend ce que le socle sert. Le câblage n'a rien à recalculer.",
    etat: "cousue",
    symbole: "arbitrerLeDemarrage",
    genre: "fonction",
    module: "ops/demarrage.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/main.ts`, dans `conclure()` — la SEULE " +
      "fonction par laquelle toutes les sorties anticipées de la séquence passent. ⚠️ CE " +
      "QUE CETTE UNICITÉ FERME : une décision reprise dans une branche de sortie aurait " +
      "divergé de celle des autres, et c'est la branche la moins parcourue qui aurait " +
      "divergé — celle des refus, c'est-à-dire celle dont tout dépend. La pureté est ce " +
      "qui permet de couvrir les trois issues et les sept étages sans ouvrir une " +
      "connexion (`ops/demarrage.spec.ts`).",
  },
  {
    adr: "0023",
    decision:
      "`ops/main.ts` est CONFRONTÉ à l'échelle, jamais l'inverse : un étage déclaré " +
      "et sauté fait rougir, et l'ordre des appels est mesuré sur les positions.",
    etat: "à-coudre",
    symbole: "verifierLaCouvertureDesEtages",
    genre: "fonction",
    module: "ops/demarrage.ts",
    mesureeAilleurs: "ops/couverture-des-etages.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production mesuré, ET C'EST LA BONNE VALEUR : cette garde lit le " +
      "SOURCE de la racine, ce qu'un conteneur ne porte pas — il n'embarque que le " +
      "JavaScript émis. L'appeler au démarrage la ferait échouer en production pour une " +
      "raison étrangère à ce qu'elle garde. Même motif que `verifierLesCoutures` " +
      "(ADR 0019), et même remède : la mesure réelle est déléguée à la garde nommée " +
      "ci-dessus, qui annonce ses comptes (octets lus, étages confrontés, symboles " +
      "cherchés, appels trouvés) et porte cinq témoins fabriqués — dont un étage retiré, " +
      "un ordre inversé, une citation en prose et un import sans appel.",
  },

  // ── ADR 0024 ───────────────────────────────────────────────────────────────
  {
    adr: "0024",
    decision:
      "Le verrou consultatif de session tient sur une connexion DÉDIÉE hors du pool, " +
      "et la relecture interroge la MÊME connexion que l'acquisition.",
    etat: "cousue",
    symbole: "ConnexionDeVerrou",
    genre: "type",
    module: "core/instance/contrat-postgres.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 importateur de production mesuré : `core/instance/postgres.ts`, " +
      "où `VerrouPostgres.connexion()` le RETOURNE et où `memeSessionQuAlAcquisition` est " +
      "DÉRIVÉ de la dernière relecture — jamais d'un drapeau posé à l'acquisition, qui " +
      "répondrait « oui » exactement dans le cas où la connexion vient d'être recyclée. " +
      "⚠️ CE QUE CETTE ENTRÉE SURVEILLE N'EST PAS L'ABSENCE DU VERROU MAIS L'ENDROIT OÙ IL " +
      "VIT. Le défaut est éprouvé par un témoin fabriqué (`core/instance/postgres.spec.ts`, " +
      "T3) où le pool recycle la connexion : elle se dit TOUJOURS ouverte, le catalogue " +
      "répond TOUJOURS « la session courante tient ce verrou », et l'état rendu est " +
      "pourtant `perdu` — parce qu'une fenêtre a existé. ⚠️ ET LE TÉMOIN A ÉTÉ CORRIGÉ " +
      "APRÈS MESURE : dans sa première écriture, il restait VERT quand on neutralisait la " +
      "confrontation d'identité, parce que le compte de verrous tenus suffisait. Deux " +
      "règles, deux témoins.",
  },
  {
    adr: "0024",
    decision:
      "Le verrou de session est TOUJOURS pris ; seule son implémentation dépend du " +
      "magasin, choisie d'après l'URL de base et jamais d'après un drapeau.",
    etat: "cousue",
    symbole: "choisirImplementationDuVerrou",
    genre: "fonction",
    module: "core/instance/postgres.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/main.ts`, à l'étage 1, AVANT toute " +
      "construction de verrou. ⚠️ UN DRAPEAU SE MET À `false` POUR FAIRE PASSER UN TEST ET " +
      "NE REVIENT JAMAIS — d'où la dérivation depuis l'URL. Et un champ que l'ADR 0024 " +
      "n'avait pas prévu s'est révélé nécessaire à l'écriture : `urlLisible`. Sans lui, " +
      "une URL mal orthographiée tombe sur « mémoire » exactement comme une URL factice, " +
      "et le socle prend un verrou aveugle aux autres processus EN PRODUCTION, sans un " +
      "mot. La racine refuse de démarrer sur ce cas (`ops/main.spec.ts`, ③).",
  },
  {
    adr: "0024",
    decision:
      "L'adaptation Postgres tient le verrou sur une connexion DÉDIÉE hors du pool, " +
      "et la perte de cette connexion est la perte du verrou — jamais une reconnexion.",
    etat: "cousue",
    symbole: "VerrouPostgres",
    genre: "fonction",
    module: "core/instance/postgres.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/main.ts`, qui l'instancie à l'étage 1 quand " +
      "l'URL de base désigne un magasin réel. ⚠️ CE QUE LA GARDE NE PEUT PAS FAIRE, ÉCRIT " +
      "AVEC ELLE : le dépôt ne fait AUCUN appel réseau sortant, donc rien ici n'ouvre de " +
      "connexion Postgres. La session dédiée est un PORT, et c'est ce qui rend les trois " +
      "propriétés éprouvables sans base — hors du pool, même session à la relecture, " +
      "aucune reconnexion (`ouverturesDeSession` reste à 1 après la chute, mesuré). " +
      "⚠️ LA CLÉ EST DÉRIVÉE, ET UN TÉMOIN LE MESURE DANS LES DEUX SENS : trois domaines " +
      "donnent trois clés distinctes, et le module ne porte AUCUN entier de dix chiffres " +
      "ou plus — la forme que l'ADR 0018 écarte comme « recopiée dans une migration ».",
  },

  // ── ADR 0025 ───────────────────────────────────────────────────────────────
  {
    adr: "0025",
    decision:
      "Les deux transports passent par UN SEUL noyau ; le contournement n'est pas " +
      "interdit par une règle, il est rendu INCONSTRUCTIBLE.",
    etat: "cousue",
    symbole: "NoyauUnique",
    genre: "type",
    module: "core/transport/contrat.ts",
    mesureeAilleurs: "core/transport/http/imports.temoin.spec.ts",
    assertion: null,
    motif:
      "2 importateurs de production mesurés — `core/transport/http/transport.ts` et " +
      "`core/transport/stdio/serveur.ts` : les deux transports REÇOIVENT le noyau, aucun ne " +
      "l'appelle par un import. ⚠️ LE COMPTE D'IMPORTATEURS N'EST TOUJOURS PAS LA MESURE DE " +
      "FOND, et il faut continuer à le dire : ce que l'ADR 0025 tient est un graphe d'imports " +
      "NÉGATIF — un transport qui n'importe AUCUN module d'étape, l'ensemble interdit étant " +
      "DÉRIVÉ d'`EXECUTANTS_ETAPES`. Cette garde-là existe désormais, et c'est elle que " +
      "`mesureeAilleurs` désigne : elle annonce les fichiers balayés, les imports lus et la " +
      "taille de l'ensemble interdit, et un témoin fabriqué lui fait produire exactement une " +
      "anomalie nommant le module d'étape ajouté.",
  },
  {
    adr: "0025",
    decision:
      "L'étape 1 (anti DNS-rebinding) s'exécute AVANT l'analyse du corps, et une " +
      "liste blanche VIDE est un refus de démarrer — jamais un « tout autoriser ».",
    etat: "cousue",
    symbole: "VerdictDHote",
    genre: "type",
    module: "core/transport/contrat.ts",
    mesureeAilleurs: "core/transport/http/hote.spec.ts",
    assertion: null,
    motif:
      "1 importateur de production mesuré : `core/transport/http/hote.ts`. ⚠️ ENTRÉE SÉPARÉE " +
      "DE LA PRÉCÉDENTE, PARCE QUE LE MODE DE DÉFAILLANCE EST AUTRE : le noyau unique se perd " +
      "par un import de trop, l'étape 1 se perd par une liste VIDE. Une liste blanche qui se " +
      "résout à zéro entrée ne trouve aucun refus à prononcer et reste verte — c'est le motif " +
      "pour lequel `entreesConfrontees` est un champ du verdict et non un détail de " +
      "journalisation. ⚠️ ET LE COMPTE D'IMPORTATEURS NE MESURE PAS CELA : `listeBlancheDHotes` " +
      "LÈVE sur une liste vide, `creerTransportHttp` refuse de se monter dessus, et " +
      "`verifierLHote` ne peut pas rendre `autorise: true` avec zéro entrée confrontée. Les " +
      "trois sont éprouvés par la garde nommée en `mesureeAilleurs`, qui annonce ses comptes.",
  },
  {
    adr: "0025",
    decision:
      "Les quatre étapes « HTTP seul » s'exécutent DANS L'ORDRE, avant que le corps " +
      "de la requête soit lu — et chacune ANNONCE ce qu'elle a confronté.",
    etat: "cousue",
    symbole: "franchirLAmont",
    genre: "fonction",
    module: "core/transport/http/amont.ts",
    mesureeAilleurs: "core/transport/http/amont.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/http/transport.ts`. ⚠️ CE QUI TIENT " +
      "L'ORDRE N'EST PAS CETTE FONCTION MAIS SA SIGNATURE — elle ne reçoit AUCUN corps, donc " +
      "elle ne peut rien analyser avant l'étape 1, et `RequeteHttp.lireLeCorps` est une " +
      "FONCTION que le transport n'appelle qu'après les quatre. La garde compte ses " +
      "invocations : zéro sur un hôte refusé, zéro sur un jeton refusé. ⚠️ ET LE COMPTE " +
      "D'APPELANTS NE DIRAIT RIEN DE CE QUE CHAQUE ÉTAPE A REGARDÉ : `TraceAmont` porte quatre " +
      "compteurs — entrées d'hôte confrontées, comparaisons d'audience, lignes `ops_token` " +
      "confrontées, champs de journal inspectés — parce qu'une étape peut refuser ou accorder " +
      "en n'ayant rien mesuré, et c'est le seul défaut qui compte ici.",
  },
  {
    adr: "0025",
    decision:
      "INTERDIT DE CONSTRUCTION N° 3 — la couverture des étapes amont est confrontée " +
      "AU DÉMARRAGE du transport, pas seulement en test.",
    etat: "cousue",
    symbole: "exigerLaCouvertureAmont",
    genre: "fonction",
    module: "core/transport/http/couverture.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "1 appelant de production mesuré : `creerTransportHttp` l'appelle avant toute autre " +
      "chose, si bien qu'une étape « HTTP seul » sans exécutant fait LEVER la construction du " +
      "transport — donc dans le conteneur, pas seulement en CI. ⚠️ ELLE FERME UN TROU QUE " +
      "`verifierCouvertureDesEtapes` LAISSE EXPLICITEMENT OUVERT : pour les quatre étapes du " +
      "transport, cette dernière ne confronte qu'une PHRASE, et son propre `executantsConfrontes` " +
      "le dit. La table de ce module, elle, nomme des symboles de son dossier, et la " +
      "confrontation rougit dans les deux sens — une étape due sans exécutant, ET un exécutant " +
      "devenu orphelin.",
  },

  // ── ADR 0026 ───────────────────────────────────────────────────────────────
  {
    adr: "0026",
    decision:
      "L'audience est l'URL absolue de la ressource MCP ; cinq contraintes de forme, " +
      "comptées SÉPARÉMENT, et une comparaison par égalité EXACTE à l'étape 3.",
    etat: "cousue",
    symbole: "CleDeContrainteDAudience",
    genre: "type",
    module: "core/auth/ressource.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 importateur de production mesuré : `core/auth/audience.ts`, où le " +
      "type ANNOTE la table `CONTROLES` — `Readonly<Record<CleDeContrainteDAudience, …>>`. " +
      "⚠️ C'EST LE SEUL BRANCHEMENT QUI VAILLE POUR CE TYPE, ET IL FAUT DIRE POURQUOI : " +
      "l'annotation est une TOTALITÉ tenue par le compilateur. Une SIXIÈME contrainte ajoutée à " +
      "`CONTRAINTES_DE_L_AUDIENCE` sans son contrôle NE COMPILE PAS. Sans elle, la contrainte " +
      "neuve serait écrite en prose et jamais évaluée — c'est-à-dire exactement le défaut que " +
      "l'ADR 0026 nomme : « une garde qui ne prouverait pas les cinq laisserait quatre d'entre " +
      "elles mourir sans un mot ».",
  },
  {
    adr: "0026",
    decision:
      "La FORME de l'audience se confronte contrainte par contrainte, et le verdict " +
      "ANNONCE combien il en a confrontées.",
    etat: "cousue",
    symbole: "verifierLaFormeDeLAudience",
    genre: "fonction",
    module: "core/auth/audience.ts",
    mesureeAilleurs: "core/auth/audience.spec.ts",
    assertion: null,
    motif:
      "2 appelants de production mesurés : `core/auth/configuration.ts` (l'étage 3, sur la " +
      "valeur de configuration) et `core/auth/octroi.ts` (au MONTAGE de l'émetteur). ⚠️ LE " +
      "SECOND N'EST PAS UNE REDONDANCE : `ops_token.audience` n'est JAMAIS réécrite (ADR 0026, " +
      "conséquences acceptées), donc un émetteur monté sur une audience mal formée écrirait des " +
      "colonnes qu'on ne pourra plus corriger sans effacer la seule trace de ce POUR QUOI le " +
      "jeton avait été émis. ⚠️ ET LE COMPTE D'APPELANTS N'EST PAS LA MESURE DE FOND : c'est " +
      "`contraintesConfrontees` qui l'est, et la garde nommée ci-dessus porte UN TÉMOIN PAR " +
      "CONTRAINTE, chacun n'en violant qu'UNE — un témoin qui en violerait deux ne prouverait " +
      "ni l'une ni l'autre.",
  },
  {
    adr: "0026",
    decision:
      "L'étape 3 compare l'audience par ÉGALITÉ EXACTE ; une audience absente, " +
      "multiple ou non textuelle est refusée, et le verdict ANNONCE combien de comparaisons ont eu lieu.",
    etat: "cousue",
    symbole: "verifierLAudience",
    genre: "fonction",
    module: "core/transport/http/audience.ts",
    mesureeAilleurs: "core/transport/http/audience.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/http/amont.ts`, à l'étape 3. " +
      "⚠️ ENTRÉE DISTINCTE DE LA PRÉCÉDENTE, ET LA DISTINCTION EST CELLE QUE L'ADR 0026 POSE : " +
      "la FORME de l'audience se vérifie UNE FOIS, à l'étage 3 du démarrage, sur une valeur de " +
      "configuration ; la COMPARAISON se refait à chaque appel. Deux moments, deux symboles, " +
      "deux modes de défaillance — une forme non vérifiée fait démarrer un socle dont l'étape 3 " +
      "ne signifie rien, une comparaison approchée fait passer un jeton d'une autre ressource. " +
      "⚠️ LE COMPTE D'APPELANTS NE MESURE PAS LA SECONDE : `comparaisonsFaites` la mesure, et il " +
      "vaut ZÉRO sur les trois refus prononcés avant toute comparaison — ce qui est la bonne " +
      "valeur, et ce qui empêche de lire « autorisé » là où rien n'a été comparé.",
  },

  // ── ADR 0027 ───────────────────────────────────────────────────────────────
  {
    adr: "0027",
    decision:
      "L'émetteur refuse À L'OCTROI ce que l'étape 5 refuserait trop tard : " +
      "`ops:policy` n'est jamais porté par un jeton de connecteur.",
    etat: "cousue",
    symbole: "VerdictDeScopes",
    genre: "type",
    module: "core/auth/contrat.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 1 importateur de production mesuré : `core/auth/scopes.ts`, où " +
      "`VerdictDeScopesDemandes` l'ÉTEND. ⚠️ L'EXTENSION EST UNE DÉCISION, PAS UNE COMMODITÉ : " +
      "le contrat type `accordes` et `refuses` sur `OpsScope`, donc sur les cinq valeurs du " +
      "socle, alors qu'une demande arrive du RÉSEAU et peut nommer n'importe quoi. Ces " +
      "chaînes-là n'ont aucun endroit où se ranger dans le contrat ; les taire les rendrait " +
      "invisibles, et un scope mal orthographié donnerait à un client moins de droits qu'il ne " +
      "croit, en silence. `inconnus` les compte SANS élargir le type qui garde les cinq. " +
      "⚠️ LA DISTINCTION QUI PORTE LA DÉCISION RESTE ÉCRITE : l'étape 5 refuse un APPEL, " +
      "l'émetteur refuse que le jeton EXISTE.",
  },
  {
    adr: "0027",
    decision:
      "L'ensemble émissible se DÉRIVE de `PORTE_PAR_LE_JETON_DAPPEL` ; un octroi qui " +
      "demande `ops:policy` est REFUSÉ EN ENTIER, jamais réduit en silence.",
    etat: "cousue",
    symbole: "verdictDeScopesDemandes",
    genre: "fonction",
    module: "core/auth/scopes.ts",
    mesureeAilleurs: "core/auth/scopes.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/auth/octroi.ts`, dans `preparerUneAutorisation` " +
      "— c'est-à-dire AVANT qu'un code d'autorisation soit rendu, et non à l'échange. ⚠️ LE " +
      "REFUS EST TOTAL, ET C'EST UN ARBITRAGE : OAuth permet d'accorder MOINS que ce qui est " +
      "demandé, et c'est la réponse qu'on écrit sans y penser. Réduire en silence rendrait un " +
      "jeton « qui marche » à un client ayant demandé le desserrage de la politique, et le seul " +
      "endroit où l'écart se verrait serait un journal que personne ne lit avant l'incident. " +
      "⚠️ ET LA MESURE DE FOND N'EST PAS LE COMPTE D'APPELANTS : c'est que `SCOPES_EMISSIBLES` " +
      "et `SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL` PARTITIONNENT `OPS_SCOPES` — ni " +
      "recouvrement, ni trou. Un scope absent des deux serait refusé sans motif écrit, et " +
      "personne ne saurait dire si c'est voulu.",
  },
  {
    adr: "0027",
    decision:
      "`ops_token.tokenHash` est un HMAC-SHA-256 CLÉ PAR LE COFFRE, avec séparation " +
      "de domaine par genre — jamais un SHA « salé », dont le sel vit dans la même ligne.",
    etat: "cousue",
    symbole: "creerCalculEmpreinteDeJeton",
    genre: "fonction",
    module: "core/auth/empreinte.ts",
    mesureeAilleurs: "core/auth/empreinte.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/auth/octroi.ts`, au montage — l'émetteur reçoit " +
      "le COFFRE et construit le calcul, plutôt que de recevoir le calcul tout fait : une " +
      "racine de composition qui pourrait injecter un calculateur pourrait injecter un SHA nu. " +
      "⚠️ LA SÉPARATION PAR GENRE N'EST PAS DÉCORATIVE, ET SA MESURE EST DANS LA GARDE : sans " +
      "elle, l'empreinte d'un jeton d'accès révoqué serait celle d'un refresh révoqué, et " +
      "présenter un vieil accès au rafraîchissement révoquerait TOUTE la chaîne d'octroi — la " +
      "détection de rejeu se retournerait en déni de service, à la portée de quiconque a vu " +
      "passer un jeton expiré. Un témoin apparié le mesure. ⚠️ ET LE CADRAGE EST UNE COPIE " +
      "ASSUMÉE de `core/limits/arg-hash.ts`, qui n'exporte pas le sien : la garde CONFRONTE les " +
      "deux écritures sur des morceaux identiques et exige des octets identiques.",
  },
  {
    adr: "0027",
    decision:
      "L'émetteur écrit `ops_token` par un PORT, et le jeton en clair ne sort " +
      "qu'une fois — par un mécanisme, non par une promesse.",
    etat: "cousue",
    symbole: "DepotDeJetons",
    genre: "type",
    module: "core/auth/depot.ts",
    mesureeAilleurs: "core/auth/schema.spec.ts",
    assertion: null,
    motif:
      "2 importateurs de production mesurés : `core/auth/octroi.ts` et `core/auth/memoire.ts`. " +
      "⚠️ LA MESURE DE FOND EST AILLEURS, ET ELLE EST NOMMÉE : la garde déléguée CONFRONTE " +
      "`LigneOpsToken` à `model OpsToken` de `prisma/schema.prisma`, colonne par colonne, dans " +
      "les DEUX SENS. Une colonne sans lecteur est la seconde source de vérité que l'ADR 0027 " +
      "refuse ; un champ sans colonne est un émetteur qui écrit dans le vide. ⚠️ ET LES CHAMPS " +
      "SONT LUS SUR UNE VALEUR CONSTRUITE, JAMAIS DANS LE SOURCE : un type n'existe pas à " +
      "l'exécution, et une expression régulière sur le fichier aurait fait une TROISIÈME " +
      "dérivation à tenir en accord avec les deux autres.",
  },
  {
    adr: "0027",
    decision:
      "L'émetteur de jetons — PKCE `S256`, access 1 h, refresh 30 j rotatif, et le " +
      "rejeu d'un refresh révoqué qui révoque TOUTE la chaîne d'octroi.",
    etat: "à-coudre",
    symbole: "creerEmetteurDeJetons",
    genre: "fonction",
    module: "core/auth/octroi.ts",
    mesureeAilleurs: "core/auth/octroi.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production mesuré, ET C'EST LA VALEUR ATTENDUE AUJOURD'HUI : le montage " +
      "de l'émetteur appartient à la racine de composition, et `ops/main.ts` ne sert encore " +
      "aucune route `/auth/*` — l'étage 6 monte les transports. ⚠️ ÉCRIRE LA FONCTION N'EST " +
      "PAS LE TRAVAIL, LA BRANCHER L'EST : cette entrée reste `à-coudre` jusqu'à ce que la " +
      "racine l'appelle, et elle rougira le jour où un constructeur la câblera sans le dire. " +
      "⚠️ LA MESURE DE FOND EST DÉLÉGUÉE, et elle porte sur ce que l'émetteur REFUSE — " +
      "`ops:policy` à l'octroi, un principal que le journal refuserait, un défi `plain`, une " +
      "audience absente/multiple/étrangère, un code rejoué, un refresh rejoué — et sur ce " +
      "qu'il PROPAGE : la session suit l'OCTROI, pas le `jti`.",
  },
  {
    adr: "0027",
    decision:
      "§ 19, RÈGLE ABSOLUE — le socle ne démarre pas si l'authentification n'est pas " +
      "configurée : ni mode dégradé, ni bascule de contournement, et la FORME de l'audience " +
      "est confrontée en même temps que sa présence.",
    etat: "cousue",
    symbole: "verifierLaConfigurationDAuthentification",
    genre: "fonction",
    module: "core/auth/configuration.ts",
    mesureeAilleurs: "core/auth/configuration.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/main.ts`, à l'étage 3, sur les quatre réglages " +
      "que `reglagesDepuisLEnvironnement` extrait de l'environnement — liste DÉRIVÉE de " +
      "`REGLAGES_DAUTHENTIFICATION`, jamais recopiée. ⚠️ LA DETTE S'EST RAPPELÉE PAR TROIS " +
      "BOUTS À LA FOIS, ET C'EST CE QU'ON VOULAIT D'ELLE : cette entrée, le cliquet " +
      "`ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR` et `DECIDEURS_NON_APPELES_DIRECTEMENT` ont dû " +
      "être vidés du même geste, et la garde de couverture des étages rougissait tant que l'un " +
      "des trois restait. ⚠️ LE PORT `controlerLAuthentification` N'A PAS DISPARU, et son " +
      "défaut est `null` : un verdict qui confronte ZÉRO réglage doit rester FABRICABLE — " +
      "c'est le contrôle aveugle, et aucun environnement ne le produit. DÉBRANCHÉ, " +
      "`ops/main.spec.ts` › « AUCUNE authentification » rougit (un socle démarrerait sur un " +
      "environnement vide) et « une audience PRÉSENTE mais mal formée » rougit sur les deux " +
      "anomalies de forme que seul ce décideur voit.",
  },
  {
    adr: "0027",
    decision:
      "MOITIÉ « TABLE » — `ops_token` gagne `grantId` et `sessionId`, avec leur " +
      "migration ET leur lecteur dans le même geste.",
    etat: "hors-code",
    assertion: null,
    motif:
      "⚠️ CETTE MOITIÉ NE PRODUIT AUCUN SYMBOLE DE CE DÉPÔT : elle porte sur `model OpsToken` " +
      "de `prisma/schema.prisma`. ✅ LES DEUX COLONNES ONT ATTERRI AU LOT 2, AVEC LEUR LECTEUR " +
      "DANS LE MÊME GESTE — `grantId` et `sessionId` sont écrites par `core/auth/octroi.ts` et " +
      "relues par `DepotDeJetons` (`core/auth/depot.ts`). L'entrée reste `hors-code` parce que " +
      "sa décision porte sur une TABLE, mais elle n'est plus une dette : la garde " +
      "`core/auth/schema.spec.ts` confronte désormais colonne à champ dans les deux sens, si " +
      "bien qu'une colonne sans lecteur — la seconde source de vérité que le lot 1d a refusée " +
      "pour `governanceFields` — ne peut plus s'installer en silence. ⚠️ CE QUI RESTE OUVERT, " +
      "ET QUI N'EST PAS DE CE DÉPÔT : aucune migration n'a été lancée, aucune base ne tourne. " +
      "Le schéma dit ce que la table DEVRA être, jamais ce qu'elle EST.",
  },

  // ── ADR 0028 ───────────────────────────────────────────────────────────────
  {
    adr: "0028",
    decision:
      "La SOURCE de la garde d'accès est l'ensemble des chemins que le code SERT ; " +
      "`core/auth/` en déclare sa moitié, famille par famille, avec qui l'appelle.",
    etat: "à-coudre",
    symbole: "CHEMINS_SERVIS_PAR_L_EMETTEUR",
    genre: "constante",
    module: "core/auth/routes.ts",
    mesureeAilleurs: "core/auth/routes.spec.ts",
    assertion: null,
    motif:
      "0 lecteur de production mesuré, ET C'EST LA VALEUR ATTENDUE : cette constante existe " +
      "pour être lue par une GARDE, pas par un module — `ops/acces/politique-de-chemins.ts` " +
      "écrit que sa garde « dérive des chemins que le socle SERT, lus dans `core/transport/` et " +
      "`core/auth/` », et une garde ne shippe pas. ⚠️ LE SENS DE LECTURE EST LA DÉCISION : une " +
      "garde qui relirait `POLITIQUE_DE_CHEMINS` serait verte le jour où un chemin neuf est " +
      "servi sans y être déclaré — le seul jour où elle aurait quelque chose à dire. ⚠️ ET LA " +
      "BORNE, ÉCRITE AVEC LA MESURE : cette confrontation dit que le dépôt est cohérent avec " +
      "lui-même. Elle ne dit RIEN de la porte posée chez Cloudflare, et aucune garde de ce " +
      "dépôt ne le peut — il n'y a aucun appel réseau sortant, par règle.",
  },
  {
    adr: "0028",
    decision:
      "La politique d'accès chemin par chemin est une CONFIGURATION VERSIONNÉE du " +
      "dépôt ; la coupure passe à l'intérieur des routes d'authentification, entre l'humain et la machine.",
    etat: "à-coudre",
    symbole: "EntreeDePolitiqueDAcces",
    genre: "type",
    module: "ops/acces/politique-de-chemins.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif:
      "0 appelant de production mesuré : la garde de cohérence appartient au constructeur du " +
      "lot 2. ⚠️ ET LE COMPTE D'APPELANTS NE SERA JAMAIS LA MESURE DE FOND, il faut l'écrire " +
      "ici : cette configuration ne prouve PAS que la porte est posée chez Cloudflare, et " +
      "aucune garde de ce dépôt ne le peut — il n'y a aucun appel réseau sortant, par règle. " +
      "Ce qu'une garde peut tenir est la cohérence entre les chemins SERVIS par le code et les " +
      "régimes déclarés, en lisant les premiers comme source. Lire cette entrée comme « le " +
      "risque est couvert » serait raisonner sur une fausse sécurité.",
  },

  // ── ADR 0029 ───────────────────────────────────────────────────────────────
  {
    adr: "0029",
    decision:
      "Le `principal` est borné À LA SOURCE par l'émetteur ; un principal malformé " +
      "REFUSE l'appel (étape 4), là où un nom d'outil malformé est seulement BORNÉ (étape 6).",
    etat: "cousue",
    symbole: "PrincipalEmis",
    genre: "type",
    module: "core/auth/contrat.ts",
    mesureeAilleurs: "core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts",
    assertion: null,
    motif:
      "✅ COUSUE AU LOT 2. 2 importateurs de production mesurés : `core/auth/principal.ts` (qui " +
      "le FABRIQUE) et `core/auth/octroi.ts` (qui le REÇOIT). ⚠️ CETTE ENTRÉE PORTE LA MOITIÉ " +
      "« SOURCE » DU DÉFAUT BLOQUANT DU LOT 1d, ET ELLE NE PORTE QUE CELLE-LÀ : la moitié " +
      "« borne » a atterri du même lot, sous `bornerIdentifiantDuJournal`, avec sa propre " +
      "entrée. ⚠️ ET LE COMPTE D'IMPORTATEURS N'EST PAS LA MESURE DE FOND — un compte ne dit " +
      "rien d'une ligne perdue. La mesure déléguée est le témoin de perte de ligne du lot 1d, " +
      "qui SAIT rougir. ⚠️ CE QUE LE TYPE TIENT, ET CE QU'IL NE TIENT PAS : sa marque est un " +
      "`unique symbol` NON exporté, donc aucun littéral n'est assignable ; reste la conversion " +
      "forcée, qu'une garde de texte compte dans `core/auth/emetteur.temoin.spec.ts` en " +
      "écrivant qu'elle ne prouve que l'absence de la FORME ÉCRITE.",
  },
  {
    adr: "0029",
    decision:
      "L'émetteur REFUSE d'émettre un jeton dont le principal ne passerait pas la " +
      "forme du journal — borner à la source, c'est borner ce qui ENTRE.",
    etat: "cousue",
    symbole: "admettreUnPrincipal",
    genre: "fonction",
    module: "core/auth/principal.ts",
    mesureeAilleurs: "core/auth/principal.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/auth/octroi.ts`, deux fois — à la préparation " +
      "de l'autorisation ET à l'échange du code. ⚠️ LA SECONDE CONFRONTATION EST DÉLIBÉRÉE, " +
      "ALORS QU'UNE CONVERSION FORCÉE AURAIT SUFFI : elle aurait ouvert un SECOND site de " +
      "fabrication de `PrincipalEmis` hors du module propriétaire, c'est-à-dire retiré à la " +
      "garde de texte le seul motif qu'elle sache chercher. Le coût est une confrontation de " +
      "plus sur une chaîne courte ; le bénéfice est qu'il n'existe qu'UN chemin. ⚠️ ET LA " +
      "RÈGLE N'EST PAS RÉÉCRITE : `estIdentifiantDeJournal()` EST celle du § 31, et la borne " +
      "vient de `bornesDIdentifiantDuJournal()`. La garde mesure la MÊME borne par une AUTRE " +
      "porte — une dichotomie sur `verifierAucunContenu()` — et exige que les deux concordent.",
  },
  {
    adr: "0029",
    decision:
      "La borne de `principal` et de `tool` DÉRIVE de `FORMES` (§ 31) et n'est jamais " +
      "réécrite ; la FAMILLE des colonnes d'identifiant est ÉNUMÉRABLE, pour qu'un troisième " +
      "champ ne soit pas oublié comme `principal` l'a été.",
    etat: "à-coudre",
    symbole: "bornerIdentifiantDuJournal",
    genre: "fonction",
    module: "core/audit/contenu.ts",
    mesureeAilleurs: "core/audit/contenu.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production mesuré : ses deux appelants sont l'étape 4 " +
      "(`core/transport/http.ts`) et l'étape 6 (`core/chaine/etape-06-outil.ts`), qui " +
      "appartiennent à d'autres constructeurs du lot 2. ⚠️ C'EST LA MOITIÉ « BORNE » DU " +
      "DÉFAUT BLOQUANT DU LOT 1d, et l'entrée voisine porte la moitié « SOURCE » " +
      "(`PrincipalEmis`) : le lot 1d avait écrit que cette moitié-ci « n'a pas de symbole " +
      "aujourd'hui » — elle en a un. ⚠️ LA MESURE QUI FAIT FOI RESTE LE TÉMOIN DE PERTE " +
      "DE LIGNE (section N3 de `core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts`, en " +
      "`it.fails`) : un compte d'appelants ne dirait rien d'une ligne perdue, et cette " +
      "fonction ne referme rien tant que personne ne l'APPELLE — écrire la fonction n'est " +
      "pas le travail, la BRANCHER l'est. ⚠️ LA FAMILLE " +
      "(`CHAMPS_IDENTIFIANTS_DU_JOURNAL`) est dérivée du GENRE déclaré dans `FORMES` : cinq " +
      "colonnes aujourd'hui, et le témoin annonce ce cardinal à chaque exécution.",
  },
  {
    adr: "0029",
    decision:
      "MOITIÉ « ÉTAPE 4 » — un `principal` malformé REFUSE l'appel, et la borne n'est " +
      "pas réécrite : elle est demandée à la garde du § 31 qui refuserait la ligne.",
    etat: "cousue",
    symbole: "verifierLaFormeDuPrincipal",
    genre: "fonction",
    module: "core/transport/http/principal.ts",
    mesureeAilleurs: "core/transport/http/principal.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/http/amont.ts`, à l'étape 4 — là où " +
      "`ops_token` est relue, donc là où le principal est LU, donc là où il se juge. ⚠️ CETTE " +
      "ENTRÉE PORTE LA MOITIÉ « REFUS », L'ENTRÉE VOISINE PORTE LA MOITIÉ « SOURCE ». Les deux " +
      "sont nécessaires : borner à l'émission empêche d'écrire un principal fautif, refuser à " +
      "l'étape 4 empêche qu'un jeton émis avant la borne — ou par un émetteur qui l'aurait " +
      "perdue — fasse perdre une ligne d'`ops_audit`. ⚠️ ET LA BORNE N'EST PAS RECOPIÉE : la " +
      "sonde SOUMET une ligne témoin à `verifierAucunContenu()` elle-même, si bien qu'un " +
      "changement de `FORMES.principal` la suit sans qu'une ligne bouge. Un témoin de capacité " +
      "APPARIÉ, sur `PRINCIPAL_STDIO`, tourne à chaque appel : sans lui, « zéro anomalie » se " +
      "lirait « ce principal est bon » quand la lecture juste serait « cette sonde ne trouve " +
      "plus rien », et le verdict est fail-closed sur ce cas.",
  },

  // ── ADR 0030 ───────────────────────────────────────────────────────────────
  {
    adr: "0030",
    decision:
      "Une étape rend le code de sa CAUSE quand elle en connaît un ; l'ancrage " +
      "`APPEL_STEPS[n].refus` n'en est que le DÉFAUT. `stepDenied`, lui, vient toujours de l'ancrage.",
    etat: "hors-code",
    assertion: null,
    motif:
      "⚠️ AUCUN SYMBOLE NEUF : la décision se pose dans `refuser()` et dans le `case 13:` de " +
      "`core/chaine/orchestrateur.ts`, sur des symboles qui existent déjà et qui appartiennent " +
      "à d'autres entrées. L'inscrire quand même est délibéré : la question avait DÉJÀ été " +
      "tranchée une fois dans l'autre sens, et une décision rouverte sans trace est une " +
      "décision qui se refermera toute seule. ⚠️ LE FAUX CORRECTIF À REFUSER EST NOMMÉ DANS " +
      "L'ADR : remplacer un code unique par un autre code unique. La garde doit exiger AU " +
      "MOINS deux codes distincts ET que `conflict` reste celui des trois causes qui le " +
      "méritent.",
  },
  {
    adr: "0030",
    decision:
      "LE CAS LIMITE DE LA MÊME RÈGLE — les quatre étapes « HTTP seul » ont un " +
      "ancrage à `refus: null` ; le défaut étant VIDE, c'est l'étape qui nomme son code, et l'ancrage garde la priorité s'il en gagne un.",
    etat: "cousue",
    symbole: "codeDuRefusAmont",
    genre: "fonction",
    module: "core/transport/http/codes.ts",
    mesureeAilleurs: "core/transport/http/amont.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/http/amont.ts`, dans le `refuser()` local " +
      "de `franchirLAmont`. ⚠️ LE MODULE EST SÉPARÉ D'`amont.ts` POUR QUE LA COUTURE SOIT " +
      "MESURABLE : le registre ne compte jamais un définisseur comme son propre appelant, si bien " +
      "qu'écrite dans `amont.ts` cette fonction annonçait « 0 appelant » tout en décidant de " +
      "chaque code de refus amont — indistinguable d'une décision débranchée. ⚠️ ENTRÉE " +
      "SÉPARÉE DE LA PRÉCÉDENTE PARCE QUE LE SENS DE LA PRIORITÉ Y EST INVERSE, ET QUE C'EST " +
      "PRÉCISÉMENT CE QUI PEUT SE PERDRE : à l'étape 13, l'ADR 0030 fait rendre à l'étape un " +
      "code AUTRE que celui de l'ancrage ; ici l'ancrage n'en porte AUCUN, et la fonction " +
      "vérifie d'abord `APPEL_STEPS[n].refus` — si le § 11 finit par donner un code à ces " +
      "étapes, c'est LUI qui fait foi et la table locale meurt sans qu'une ligne bouge. " +
      "L'inverse — une table locale qui écraserait l'ancrage — serait le défaut du lot 1d " +
      "refait à l'envers. ⚠️ ÉCART PORTÉ PAR CETTE ENTRÉE : l'étape 1 rend `null`, parce que le " +
      "§ 15 n'énumère aucun code pour un `Host` refusé et que nommer un code hors tableau " +
      "appartient à `ops/codes-hors-tableau.ts`. La conséquence est écrite : un refus d'étape 1 " +
      "ne porte que le statut `403`, et un client qui trie sur le code ne le voit pas.",
  },

  // ── ADR 0033 ───────────────────────────────────────────────────────────────
  {
    adr: "0033",
    decision:
      "Chaque réponse HTTP est RELUE avant d'être expédiée, et confrontée aux valeurs " +
      "sensibles de la requête qui l'a produite ; une fuite REMPLACE la réponse par un `internal` nu.",
    etat: "cousue",
    symbole: "verifierAucuneFuite",
    genre: "fonction",
    // ⚠️ LE SYMBOLE A DÉMÉNAGÉ AU LOT 4 (ADR 0044). Ce champ ne décrit pas
    //    l'ADR 0033 : il dit où le DÉFINISSEUR se trouve aujourd'hui, pour que
    //    la garde ne le compte pas comme son propre appelant.
    module: "core/transport/anti-fuite.ts",
    mesureeAilleurs: "core/transport/http/transport.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/http/transport.ts`, sur le chemin de " +
      "scellement par lequel passe TOUTE réponse — succès compris. ⚠️ LE COMPTE D'APPELANTS NE " +
      "MESURE PAS LA DÉCISION, ET IL FAUT L'ÉCRIRE : un filet qui aurait confronté ZÉRO valeur " +
      "serait vert pour la pire des raisons. Ce qui fait foi est `VerdictDeFuite`, qui annonce " +
      "les valeurs confrontées ET celles écartées comme trop courtes — la borne est ainsi lue, " +
      "et non seulement écrite. ⚠️ LE NOM D'OUTIL EST EXCLU DE LA CONFRONTATION, DÉLIBÉRÉMENT : " +
      "le § 15 exige que `tool_disabled` « dise qu'il existe, et où l'activer ». Un témoin de " +
      "NON-régression le vérifie, sans quoi la garde dériverait vers le refus du comportement " +
      "prescrit — et le remède qu'on chercherait à cette fausse alerte serait de la désactiver.",
  },

  // ── ADR 0031 ───────────────────────────────────────────────────────────────
  {
    adr: "0031",
    decision:
      "L'inventaire des canaux que L'APPELANT choisit — `AppelEntrant` — est tenu par " +
      "le compilateur, comme celui du `ctx`.",
    etat: "à-coudre",
    symbole: "STATUT_DES_CANAUX_D_APPEL",
    genre: "constante",
    module: "core/types.ts",
    mesureeAilleurs: "core/canaux-du-contexte.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production MESURÉ, et c'est ici l'état DÉFINITIF, non une dette — " +
      "même lecture que `STATUT_DES_CANAUX_DE_CONTEXTE` sous l'ADR 0020 : c'est une DONNÉE " +
      "typée dont le seul lecteur légitime est une garde. ⚠️ SA TOTALITÉ NE DÉPEND " +
      "D'AUCUN APPELANT : `Readonly<Record<keyof AppelEntrant, StatutDeCanal>>` fait qu'un " +
      "champ ajouté à l'enveloppe d'appel sans être classé est une erreur de COMPILATION. " +
      "⚠️ L'ENTRÉE ÉTAIT `hors-code` À L'ARCHITECTURE, ET SON MOTIF DISAIT POURQUOI : " +
      "nommer un symbole avant de l'écrire est le défaut que le cliquet du lot 1d compte et " +
      "refuse. Le symbole est écrit, l'entrée le nomme. Mesuré : « 11 champs de SOURCE " +
      "confrontés · 11 classés par LEUR PROPRE inventaire · 0 par HOMONYMIE · 0 par RIEN ».",
  },
  {
    adr: "0031",
    decision:
      "L'inventaire des canaux de l'IDENTITÉ — `IdentiteAppelante` — fait cesser la " +
      "couverture par HOMONYMIE, et ses homonymes sont CONFRONTÉS plutôt que comptés.",
    etat: "à-coudre",
    symbole: "STATUT_DES_CANAUX_D_IDENTITE",
    genre: "constante",
    module: "core/types.ts",
    mesureeAilleurs: "core/canaux-du-contexte.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production MESURÉ, état DÉFINITIF — même lecture que ci-dessus. " +
      "⚠️ ENTRÉE SÉPARÉE DE SA JUMELLE, ET LE MODE DE DÉFAILLANCE EST AUTRE : les six " +
      "champs de ce type portaient les MÊMES NOMS que six champs du `ctx` et PARAISSAIENT " +
      "classés. Le jour où l'un des deux types en gagne un que l'autre n'a pas, la " +
      "coïncidence cesse et RIEN ne le dit — une garde qui rétrécit sans changer de " +
      "couleur. Avec une entrée unique, poser le seul record d'`AppelEntrant` aurait rendu " +
      "l'ADR `cousue` en laissant l'homonymie intacte.",
  },
  {
    adr: "0031",
    decision:
      "`StatutDeCanal` porte DEUX destinations : le régime vers l'adaptateur, et " +
      "`versLeJournal` vers `ops_audit` — où `verbatim` est une ANOMALIE, jamais un état toléré.",
    etat: "à-coudre",
    symbole: "VersLeJournal",
    genre: "type",
    module: "core/types.ts",
    mesureeAilleurs: "core/canaux-du-contexte.temoin.spec.ts",
    assertion: null,
    motif:
      "0 importateur de production MESURÉ, état DÉFINITIF : c'est la forme d'une donnée de " +
      "garde. ⚠️ TROISIÈME ENTRÉE, PARCE QU'UN QUATRIÈME RÉGIME AURAIT ÉTÉ LA MAUVAISE " +
      "RÉPONSE : un même champ peut être FERMÉ vers une destination et OUVERT vers l'autre " +
      "— `nomComplet` est confronté au catalogue côté adaptateur et VERBATIM côté journal. " +
      "⚠️ LE VARIANT `borné-par` PORTE UN CHAMP `borne` OBLIGATOIRE : une borne qu'on ne " +
      "peut pas nommer est une borne qu'on croit avoir, et le compilateur refuse ici de la " +
      "laisser implicite. ⚠️ LA GARDE TIENT UN CLIQUET DATÉ des `verbatim` — trois " +
      "aujourd'hui (`ToolContext.principal`, `AppelEntrant.nomComplet`, " +
      "`IdentiteAppelante.principal`), qui sont le défaut BLOQUANT du lot 1d : un quatrième " +
      "rougit, et le jour où l'un des trois se referme la garde rougit AUSSI, pour qu'on " +
      "revienne resserrer le cliquet.",
  },

  // ── ADR 0032 ───────────────────────────────────────────────────────────────
  {
    adr: "0032",
    decision:
      "Le fil stdio est cadré ligne par ligne, la borne du tampon RESYNCHRONISE, et " +
      "un lot JSON-RPC est refusé plutôt que servi à moitié.",
    etat: "cousue",
    symbole: "creerDecoupeur",
    genre: "fonction",
    module: "core/transport/stdio/cadrage.ts",
    mesureeAilleurs: "core/transport/stdio/cadrage.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/stdio/serveur.ts`, qui monte le " +
      "découpeur au montage du démon et lui remet chaque morceau de flux. ⚠️ LE COMPTE " +
      "D'APPELANTS NE MESURE PAS LA DÉCISION, et il faut l'écrire : ce que l'ADR 0032 tient " +
      "est la RESYNCHRONISATION après un dépassement — vider le tampon sans elle laisserait " +
      "la SUITE de la ligne trop longue être lue comme un début de message, c'est-à-dire " +
      "faire analyser au socle un fragment choisi à l'octet près. La garde nommée en " +
      "`mesureeAilleurs` porte cette mesure, avec son témoin (l'attaque elle-même) ET sa " +
      "contre-épreuve (le même flux sous un plafond qui ne mord pas, où la charge EST " +
      "analysée) — sans laquelle le vert ne serait pas attribuable à la borne.",
  },
  {
    adr: "0032",
    decision:
      "Un refus de la chaîne est un RÉSULTAT JSON-RPC portant le NUMÉRO de l'étape, " +
      "jamais une erreur de protocole.",
    etat: "cousue",
    symbole: "resultatRefuse",
    genre: "fonction",
    module: "core/transport/stdio/protocole.ts",
    mesureeAilleurs: "core/transport/stdio/etapes-exercees.temoin.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/stdio/serveur.ts`, sur la seule " +
      "branche `resultat.refus !== null`. ⚠️ CE QUI FAIT FOI EST LA MESURE APPARIÉE, PAS " +
      "L'APPELANT : la garde nommée fait refuser les ONZE étapes applicables au transport " +
      "par le FIL stdio, et exige pour chacune trois choses ensemble — une ligne d'`ops_audit` " +
      "portant SON `stepDenied`, un `result.isError` portant le même rang, et AUCUN champ " +
      "`error`. Un code JSON-RPC négatif ferait réessayer le TRANSPORT là où le § 15 veut " +
      "qu'on corrige l'APPEL. ⚠️ ÉCART PORTÉ PAR CETTE ENTRÉE : la frontière laisse une " +
      "enveloppe fautive SANS ligne d'`ops_audit` — aucun appel n'a été formé, et stdio n'a " +
      "aucune étape 1 à 4 dont inscrire le numéro. C'est une asymétrie assumée avec HTTP.",
  },
  {
    adr: "0032",
    decision:
      "Les paramètres de `tools/call` sont une liste FERMÉE : ce qui n'est pas nommé " +
      "est REFUSÉ, jamais ignoré — une fermeture ne vieillit pas, une liste noire si.",
    etat: "cousue",
    symbole: "CLES_DE_PARAMETRES_DE_TOOLS_CALL",
    genre: "constante",
    module: "core/transport/stdio/protocole.ts",
    mesureeAilleurs: "core/transport/stdio/serveur.spec.ts",
    assertion: null,
    motif:
      "1 lecteur de production mesuré : `core/transport/stdio/serveur.ts`, qui la nomme dans " +
      "le message de refus — la liste rendue au client est celle de ce qui est ADMIS, jamais " +
      "un écho de ce qu'il a envoyé (§ 20 : le jeton de confirmation voyage dans ces " +
      "paramètres). ⚠️ LA GARDE NOMMÉE ÉPROUVE DES NOMS DÉRIVÉS DES CLÉS DE " +
      "`STATUT_DES_CANAUX_DE_CONTEXTE`, et non une liste écrite : un champ ajouté au `ctx` " +
      "entre dans l'épreuve sans qu'une ligne soit à retoucher. ⚠️ ET LE TÉMOIN INVERSE EST " +
      "OBLIGATOIRE : les cinq clés admises soumises ensemble DOIVENT passer, sans quoi un " +
      "transport qui refuse tout satisferait la garde. ⚠️ BORNE : la fermeture porte sur le " +
      "PREMIER NIVEAU de `params` ; ce qui est caché sous `arguments` relève de l'étape 8 et " +
      "du contrôle 7 du § 09.",
  },
  {
    adr: "0032",
    decision:
      "Le transport ANNONCE les étapes du § 11 que ses appels ont réellement " +
      "touchées, et confronte ce compte à sa colonne — en service, pas seulement en test.",
    etat: "cousue",
    symbole: "confronterLesEtapesExercees",
    genre: "fonction",
    module: "core/transport/stdio/etapes-exercees.ts",
    mesureeAilleurs: "core/transport/stdio/etapes-exercees.temoin.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `core/transport/stdio/serveur.ts`, dans " +
      "`rapportDeCouverture()` — l'écran Santé (§ 22) et le § 24 doivent pouvoir dire quelles " +
      "gardes ont mordu depuis le démarrage, et une confrontation qui ne vivrait qu'en test " +
      "l'aurait laissé invisible en service. ⚠️ ET CETTE MESURE NE SUFFIT PAS SEULE, C'EST LE " +
      "PIÈGE DU LOT : un SEUL appel réussi franchit les onze étapes applicables, si bien que " +
      "la couverture est verte au premier « bonjour » et qu'un transport n'ayant jamais fait " +
      "refuser personne la satisferait. Elle mesure que la chaîne est PARCOURUE, jamais " +
      "qu'elle DÉCIDE. C'est l'entrée `resultatRefuse` qui porte l'autre moitié. ⚠️ Un verdict " +
      "rendu sur ZÉRO appel est une anomalie à part entière, sans quoi une liste d'étapes " +
      "fabriquée à la main satisferait la garde sans qu'un appel ait traversé le socle.",
  },
  {
    adr: "0032",
    decision:
      "L'attache aux flux standard SÉRIALISE les morceaux : deux appels porteurs de " +
      "la même clé d'idempotence se croisent dans le DÉPÔT (étape 13), jamais dans le transport.",
    etat: "cousue",
    symbole: "brancherSurLesFlux",
    genre: "fonction",
    module: "core/transport/stdio/serveur.ts",
    mesureeAilleurs: "core/transport/stdio/serveur.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/service.ts`, dans `monterLeService()`, qui reçoit " +
      "les flux de `ops/index.ts` et ne les nomme jamais lui-même. ⚠️ CETTE ENTRÉE A PORTÉ " +
      "« 0 appelant » PENDANT UN LOT ENTIER, et c'est ce zéro écrit qui a rendu la dette " +
      "trouvable à la recette : la fonction était écrite, éprouvée de bout en bout sur des " +
      "doubles, et DÉBRANCHÉE de tout flux réel. Trois autres montages étaient dans le même " +
      "état sans qu'AUCUNE entrée ne les compte — `creerServeurHttp`, `creerTransportHttp`, " +
      "`creerServeurStdio` — et c'est cette asymétrie, plus que le zéro, qui a coûté le lot. " +
      "⚠️ ET LE COMPTE D'APPELANTS NE MESURE PAS LA DÉCISION : ce que l'ADR 0032 tient est la " +
      "SÉRIALISATION. La garde la mesure par un témoin qui ne peut pas être satisfait par " +
      "hasard — un noyau dont les retards DÉCROISSENT (30, 20, 10 ms) : servi en parallèle, " +
      "l'ordre des réponses serait 3, 2, 1 ; il doit être 1, 2, 3.",
  },
  {
    adr: "0034",
    decision:
      "LE SOCLE A UN POINT D'ENTRÉE DE PROCESSUS, et c'est lui — et lui seul — qui " +
      "monte les transports. `ops/main.ts` SÉQUENCE les sept étages ; `ops/service.ts` MONTE ; " +
      "`ops/index.ts` lit l'environnement et relie les deux.",
    etat: "cousue",
    symbole: "monterLeService",
    genre: "fonction",
    module: "ops/service.ts",
    mesureeAilleurs: "ops/service.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production mesuré : `ops/index.ts`. C'est le geste qui ferme le manque " +
      "du lot 2 — « les deux transports sont écrits, et rien ne les monte ». DÉBRANCHÉ, " +
      "`ops/service.spec.ts` › « ouvre une socket sur la boucle locale et sert un `tools/call` " +
      "de bout en bout » rougit : la garde lie réellement `127.0.0.1`, envoie une requête et " +
      "lit un `result` — c'est la seule garde du dépôt qui mesure un OCTET QUI REVIENT.",
  },
  {
    adr: "0034",
    decision:
      "§ 23 — `appelsDOutilsAcceptes` DÉCIDE, il ne se contente plus d'être publié : " +
      "coffre verrouillé, aucun transport d'outils n'est monté.",
    etat: "cousue",
    symbole: "appelsDOutilsAcceptes",
    genre: "membre",
    module: "ops/demarrage.ts",
    mesureeAilleurs: "ops/service.spec.ts",
    assertion: null,
    motif:
      "2 appelants de production mesurés : `ops/main.ts` (le healthcheck le republie) et " +
      "`ops/service.ts` (le montage le LIT et refuse). ⚠️ AVANT CE LOT, IL AVAIT ZÉRO " +
      "CONSOMMATEUR : calculé par `core/vault/demarrage.ts`, relayé par `ops/demarrage.ts`, " +
      "republié par le healthcheck — et lu par PERSONNE. Le critère de recette du § 32 était " +
      "donc éprouvé sur des ÉTIQUETTES (« `routesServies` contient la chaîne `console` ») et " +
      "non sur un comportement : un périmètre d'observation transformé en garantie. " +
      "DÉBRANCHÉ, `ops/service.spec.ts` › « coffre VERROUILLÉ — le socle vit, le healthcheck " +
      "rend 200, et RIEN n'écoute » rougit sur `transportsMontes` et sur `serveurHttp`.",
  },

  // ── ADR 0035 ───────────────────────────────────────────────────────────────
  {
    adr: "0035",
    decision:
      "Un `pattern` ne referme un champ que si la LONGUEUR MAXIMALE du langage " +
      "qu'il accepte est finie et tient sous la borne de fermeture — dérivée du motif, " +
      "jamais éprouvée par trois témoins.",
    etat: "cousue",
    symbole: "BORNE_DE_FERMETURE",
    genre: "constante",
    module: "core/adapter-kit/capacite.ts",
    mesureeAilleurs: "core/adapter-kit/champs-declares.temoin.spec.ts",
    assertion: null,
    motif:
      "1 lecteur de production MESURÉ : `core/adapter-kit/champs-declares.ts`, qui l'IMPORTE " +
      "et la lit à DEUX endroits — la quatrième condition de `mesurerLaCapacite()` et " +
      "`maxLengthReferme()`. La dette écrite ici au moment de la pose est levée. " +
      "⚠️ LE COMPTE D'APPELANTS NE MESURE PAS LA DÉCISION, et il ne l'a jamais fait : ce " +
      "qui la mesure est le corpus nommé en `mesureeAilleurs`, qui porte désormais le " +
      "contournement EXACT trouvé par l'audit — `^[A-Za-z0-9 ,.'()-]{1,2000}$`, ancré aux " +
      "deux bouts, rejetant les TROIS témoins de prose, admettant 2 000 caractères. " +
      "MESURE TRANSCRITE, les deux états : avant le correctif `patternReferme` rendait " +
      "`true` sur ce motif et le test rougissait ; après, il rend `false` et une charge " +
      "ASCII de 206 caractères ne referme plus rien. ⚠️ ET L'ENCADREMENT DE LA VALEUR EST " +
      "UNE GARDE, PAS UN PARAGRAPHE : 45 (la plus longue forme d'`ipv6`, déjà réputée " +
      "fermante) ≤ 64 < 160 (`LONGUEUR_RACCOURCIE`, IMPORTÉE, dont le socle dit lui-même " +
      "qu'elle porte « une phrase entière ») — les quatre exemplaires de format sont " +
      "confrontés et ANNONCÉS.",
  },
  {
    adr: "0035",
    decision:
      "La mesure d'un motif rend des NOMBRES et une raison de non-borne, jamais un " +
      "booléen : une borne rendue sans avoir lu un seul nœud serait verte pour la pire des " +
      "raisons.",
    etat: "cousue",
    symbole: "MesureDeCapacite",
    genre: "type",
    module: "core/adapter-kit/capacite.ts",
    mesureeAilleurs: "core/adapter-kit/champs-declares.temoin.spec.ts",
    assertion: null,
    motif:
      "1 importateur de production MESURÉ : `core/adapter-kit/champs-declares.ts`, où " +
      "`mesurerLaCapacite` le REMPLIT et où `patternReferme` ne lit plus que son champ " +
      "`referme`. ⚠️ CE QUE CE TYPE FORCE, ET QUI EST TOUT SON OBJET : `noeudsLus` interdit " +
      "qu'une mesure vide rende une borne, et `raisonDeNonBorne` dit LAQUELLE des cinq " +
      "constructions non bornables a produit le `null`. Sans ces deux champs, la fonction " +
      "pourrait rendre « fermé » en n'ayant rien lu, exactement comme les trois témoins " +
      "rendaient « fermé » en n'ayant confronté que trois phrases. ⚠️ ET LES DEUX CHAMPS " +
      "SONT ÉPROUVÉS, PAS SEULEMENT DÉCLARÉS : la garde du sous-ensemble confronte " +
      "26 constructions, exige `noeudsLus > 0` sur chacune qui compile, et annonce " +
      "combien des cinq raisons un témoin produit — 4 sur 5, la cinquième " +
      "(`syntaxe-hors-sous-ensemble`) étant un filet qu'aucun motif COMPILABLE sous le " +
      "drapeau `u` n'atteint, ce que la garde FIGE au lieu de le supposer.",
  },
  {
    adr: "0035",
    decision:
      "Trois `format` sur sept — `time`, `date-time`, `duration` — admettent un texte " +
      "de longueur LIBRE : ils cessent de refermer à eux seuls, et un `maxLength` sous la " +
      "borne referme désormais.",
    etat: "à-coudre",
    symbole: "patternReferme",
    genre: "fonction",
    module: "core/adapter-kit/champs-declares.ts",
    mesureeAilleurs: "core/adapter-kit/champs-declares.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production MESURÉ, et le compte n'est PAS la mesure : son unique " +
      "appelant est `estValeurLibre`, dans le module qui le DÉFINIT, donc exclu du comptage " +
      "par construction. L'état reste donc `à-coudre` APRÈS l'implémentation, et ce n'est " +
      "pas une dette — c'est la borne du graphe d'appels, écrite avec sa mesure. " +
      "⚠️ CE QUI MESURE RÉELLEMENT CETTE ENTRÉE est le corpus nommé en `mesureeAilleurs` : " +
      "`FORMATS_CONTRAIGNANTS` est passée de 7 à 4 entrées, et la garde CONFRONTE la liste " +
      "des écartés en la DÉRIVANT de `FORMATS_ECARTES_PAR_CAPACITE` — un écarté remis en " +
      "service rougit. MESURE TRANSCRITE : avant, `{ type: string, format: duration }` " +
      "rendait `estValeurLibre = false` ; après, `true`. ⚠️ LE JUMEAU OUBLIÉ, MESURÉ " +
      "PENDANT LE LOT 3 : le défaut du `pattern` existait AUSSI sur `format`, et il y était " +
      "plus court à écrire — `format` est une ANNOTATION sans effet de validation, et trois " +
      "des sept valeurs retenues acceptent une fraction de seconde ou un nombre de chiffres " +
      "de longueur libre. ⚠️ C'EST UN RESSERRAGE, DONC IL EST LIBRE (§ 20, protection 1) : " +
      "il ne peut faire que de la surveillance en plus, et son coût est nul tant " +
      "qu'`adapters/` est vide.",
  },

  // ── ADR 0036 ───────────────────────────────────────────────────────────────
  {
    adr: "0036",
    decision:
      "§ 14 — le plafond de 40 outils SERVIS se refuse À L'ÉTAPE 7, dans le même " +
      "bloc qu'`estServi`, en LISANT l'étape et le code que le verdict porte déjà.",
    etat: "cousue",
    symbole: "mesurerBudgetProfil",
    genre: "fonction",
    module: "core/profiles/budget.ts",
    mesureeAilleurs: "core/profiles/budget.spec.ts",
    assertion: {
      fichier: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
      nom: "le bloc de l'étape 7 de l'orchestrateur lit PLAFOND_OUTILS_PAR_PROFIL",
      nomme: ["PLAFOND_OUTILS_PAR_PROFIL", "estServi(outil, profil)"],
    },
    motif:
      "✅ COUSUE AU LOT 4 — 1 appelant de production MESURÉ : `core/chaine/orchestrateur.ts`, " +
      "dans le bloc de l'étape 7, après `estServi` et avant `franchir`. L'entrée a passé un " +
      "lot entier en `à-coudre` avec 0 appelant, honnêtement. ⚠️ CE QUI A CHANGÉ, ET CE QUI " +
      "NE CHANGE PAS : l'étape et le code du refus sont LUS dans le verdict " +
      "(`etapeDeRefus`, `codeDeRefus`), jamais réécrits — `tool_not_in_profile` reste EXACT " +
      "pour l'appartenance et INEXACT pour le plafond, et c'est le MESSAGE qui distingue " +
      "les deux, puisque c'est lui que l'appelant lit (§ 15, écart assumé). ⚠️ LA MESURE " +
      "AVEUGLE REFUSE AUSSI : à l'étape 7, un inventaire vide contredit l'étape 6, et le " +
      "message NOMME la contradiction plutôt que le plafond — sinon le plafond se " +
      "mesurerait sur zéro outil et ne pourrait plus jamais mordre. ⚠️ LE SECOND PLAFOND du " +
      "§ 14 — les octets de définitions — vit dans le MÊME verdict et est désormais refusé " +
      "par le même geste ; il n'a toujours PAS été confronté séparément : personne n'a " +
      "construit un catalogue sous 40 outils et au-dessus du plafond d'octets.",
  },
  {
    adr: "0036",
    decision:
      "§ 13.3 — un champ de rang 2 OBLIGATOIRE au schéma de sortie est REFUSÉ à " +
      "l'admission, par la MÊME fonction que le build.",
    etat: "cousue",
    symbole: "requisDuSchema",
    genre: "fonction",
    module: "core/adapter-kit/manifest.ts",
    mesureeAilleurs: "core/registry/enregistrer.temoin.spec.ts",
    assertion: null,
    motif:
      "2 appelants de production mesurés : `core/adapter-kit/conformite.ts` (contrôle C13.3, " +
      "AU BUILD) et `core/registry/enregistrer.ts` (contrôle 7 ter bis, À L'ADMISSION, motif " +
      "`rang2_obligatoire_au_schema`). ⚠️ LE SECOND EST L'ATTERRISSAGE DU LOT 3, et c'est " +
      "lui qui referme le défaut : jusque-là les cinq occurrences du dépôt vivaient TOUTES " +
      "dans `core/adapter-kit/`, ZÉRO sous `core/registry/`, si bien que la règle n'était " +
      "tenue que du côté BUILD — alors qu'`enregistrer.ts` se déclare lui-même « la SEULE " +
      "barrière statique pour un manifeste produit ailleurs : le CRM en PHP, dépôt public à " +
      "jamais ». Le mode FÉDÉRÉ, celui que la règle vise, était le seul pour lequel elle ne " +
      "s'appliquait jamais. ⚠️ LE SECOND APPELANT N'EST PAS UNE RECOPIE : il importe " +
      "`requisDuSchema` du même module que le build, parce que deux définitions divergentes " +
      "sont le défaut de l'ADR 0003. ⚠️ RIEN NE RATTRAPE EN AVAL : `outputSchema` n'est " +
      "validé à aucun moment du runtime, et l'étape 14 l'écrit elle-même — « ici on retire, " +
      "on ne revalide pas » ; sa prose, qui disait la règle tenue « plus tôt et mieux » au " +
      "seul build, a été corrigée dans le même geste. ⚠️ MUTATION REJOUÉE : retirer l'appel " +
      "à `requisDuSchema` du contrôle 7 ter bis fait rougir " +
      "`core/registry/rang2-au-schema.temoin.spec.ts`.",
  },
  {
    adr: "0036",
    decision:
      "§ 09, contrôle 4 — le `fixtureMax` déclaré est apparié PAR SON CHEMIN à une " +
      "fixture réellement exécutée, ou l'anomalie est nommée.",
    etat: "à-coudre",
    symbole: "executerHarnais",
    genre: "fonction",
    module: "core/adapter-kit/conformite.ts",
    mesureeAilleurs: "core/adapter-kit/conformite.temoin.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production MESURÉ, ET CE ZÉRO EST LE RÉGIME NORMAL : le harnais tourne " +
      "dans la CI de l'ADAPTATEUR, et `adapters/` est vide. ⚠️ LE DÉFAUT QUE CETTE ENTRÉE " +
      "PORTAIT N'ÉTAIT PAS LE ZÉRO, ET IL EST FERMÉ AU LOT 3 : les six seules occurrences " +
      "de `fixtureMax` dans le dépôt étaient un titre de section, le libellé du contrôle, " +
      "deux lignes qui vérifient que la chaîne n'est pas VIDE, la déclaration de type et " +
      "une valeur de verrou — le corps du contrôle 4 appariait par `fixture.outil` et ne " +
      "lisait `fixtureMax` À AUCUN MOMENT, si bien qu'une charge d'un octet sous un chemin " +
      "quelconque le rendait vert avec son compte annoncé. Il APPARIE désormais par le " +
      "chemin déclaré, nomme l'anomalie avec les chemins réellement exécutés, et son " +
      "`detail` annonce combien de jeux maximaux ont été appariés. ⚠️ C'ÉTAIT LE JUMEAU " +
      "OUBLIÉ DU CONTRÔLE 3, dans le MÊME fichier, dont le libellé avait été réécrit pour " +
      "ne plus promettre plus que sa mesure ; ici la réponse est l'INVERSE et c'est " +
      "délibéré — le libellé du § 09 reste, parce que la mesure le rend de nouveau vrai. " +
      "⚠️ BORNE : `fixtureMax` n'entre pas dans le manifeste — c'est un chemin sur le disque " +
      "de l'adaptateur, et l'admission ne peut pas l'exécuter ; le contrôle 4 est et reste " +
      "un contrôle de BUILD. ⚠️ MUTATION REJOUÉE : remettre l'appariement par " +
      "`fixture.outil` seul fait rougir `core/adapter-kit/conformite.temoin.spec.ts`.",
  },

  // ── ADR 0037 ───────────────────────────────────────────────────────────────
  {
    adr: "0037",
    decision:
      "Le port de journal d'amont REND le nombre de lignes écrites, et " +
      "`refusConsignes` additionne cette valeur : un socle non armé annonce « 1 prononcé · " +
      "0 consigné ».",
    etat: "cousue",
    symbole: "JOURNAL_AMONT_NON_ARME",
    genre: "constante",
    module: "core/transport/http/amont.ts",
    mesureeAilleurs: "core/transport/http/amont.spec.ts",
    assertion: null,
    motif:
      "2 lecteurs de production mesurés, dont `core/transport/http/transport.ts`, qui y " +
      "retombe quand le montage ne fournit rien. ⚠️ LE COMPTEUR QUI DEVAIT DIRE L'ABSENCE " +
      "MENTAIT, et la prose du fichier promettait l'inverse mot pour mot : " +
      "`refusConsignes` s'incrémentait INCONDITIONNELLEMENT après l'`await`, et le port " +
      "non armé résout. Mesuré sur les CINQ refus d'amont : tous annonçaient « 1 prononcé " +
      "· 1 consigné » alors qu'aucune ligne n'était écrite. Neuf occurrences du champ dans " +
      "le dépôt, AUCUNE assertion dessus ; la garde d'amont compte les lignes d'un journal " +
      "de test ARMÉ, jamais le chemin non armé. ⚠️ ET LA SECONDE MOITIÉ N'EST PAS DANS " +
      "CETTE ENTRÉE : même corrigé, personne ne lirait ce compte en service tant que " +
      "`serveur.ts` consomme la réponse et JETTE la trace.",
  },
  {
    adr: "0037",
    decision:
      "Le genre servi et le `resultRef` du rejeu (étape 13) sont dérivés UNE FOIS, " +
      "par un `switch` exhaustif, et les deux transports ne font que les emballer.",
    etat: "cousue",
    symbole: "ValeursServiesAuClient",
    genre: "type",
    module: "core/transport/contrat.ts",
    mesureeAilleurs: "core/transport/valeurs-servies.spec.ts",
    assertion: null,
    motif:
      "3 importateurs de production mesurés — `core/transport/valeurs-servies.ts` (la " +
      "dérivation unique), `core/transport/http/transport.ts` et " +
      "`core/transport/stdio/serveur.ts` (les deux emballages). ⚠️ CE QUE LE ZÉRO A COÛTÉ, " +
      "MESURÉ AVANT LA COUTURE : le même noyau double " +
      'présenté aux deux transports rend `genre="rejeu"` et un `resultRef` en stdio, et ' +
      "RIEN en HTTP — genre absent, `resultRef` absent, `structuredContent` nul, " +
      "`isError` faux. Un client HTTP ne peut pas distinguer « ton appel a été REJOUÉ » de " +
      "« ton appel a été exécuté et n'a rien rendu », alors que le § 13 fait du " +
      "`resultRef` le SEUL pointeur vers le résultat d'origine. ⚠️ AUCUN des onze " +
      "`it.fails` de `core/epreuve/lot2-le-transport-attaque.temoin.spec.ts` ne porte sur " +
      "le rejeu : c'est le trou exact, et un corpus ne voit pas ce qu'il ne contient pas.",
  },
  {
    adr: "0037",
    decision:
      "`journalDesRefus` et `delaiDeReprise` entrent dans les ports du service : " +
      "tant que la fente n'existe pas, « non armé » n'est pas un réglage, c'est une " +
      "impossibilité.",
    etat: "cousue",
    symbole: "PortsDuService",
    genre: "type",
    module: "ops/service.ts",
    mesureeAilleurs: "ops/service.spec.ts",
    assertion: {
      fichier: "ops/service.spec.ts",
      nom:
        "un refus d'amont servi par un service RÉELLEMENT MONTÉ écrit une ligne, et " +
        "refusConsignes l'ADDITIONNE",
      nomme: ["journalDesRefus", "PortsDuService", "refusConsignes"],
    },
    motif:
      "1 importateur de production mesuré : `ops/index.ts`. ⚠️ MESURE QUI A FONDÉ LA " +
      "DÉCISION (lot 3) : `grep -rn 'journalDesRefus' ops` rendait ZÉRO, " +
      "`grep -rn 'delaiDeReprise' ops` rendait ZÉRO. Ce n'était pas un oubli de câblage — " +
      "le type n'offrait AUCUNE fente pour les poser. ✅ ATTERRIE AU LOT 4 : la fente " +
      "existe, `monterLeService` la transmet à `creerTransportHttp`, et l'assertion N'EST " +
      "PLUS UNE DETTE. ⚠️ LES DEUX ÉTATS, TRANSCRITS SUR UNE COPIE PROPRE DE `HEAD` — " +
      "ROUGE : « statut 401 sur le fil · 0 ligne(s) écrite(s) · ARMÉ : 1 prononcé · 0 " +
      "consigné », `expected +0 to be 1`. VERT : « 1 ligne écrite par le fil, 2 au total, " +
      "étapes [2, 2] · ARMÉ : 1 prononcé · 1 consigné · NON ARMÉ : 1 prononcé · 0 consigné " +
      "· PORT À 2 LIGNES : 2 consignés ». Le dernier compte tue la mutation " +
      "`refusConsignes += 1` : deux lignes écrites, deux lignes comptées. ⚠️ ET LA GARDE " +
      "PART DU MONTAGE, jamais de `creerTransportHttp` — une garde qui appellerait le " +
      "transport directement re-vérifierait ce qui marchait déjà, et laisserait passer " +
      "exactement ce défaut-ci.",
  },
  {
    adr: "0037",
    decision:
      "Le `delaiDeReprise` entre dans les ports du service : tant que la fente " +
      "n'existe pas, tout 429 servi par un service RÉELLEMENT MONTÉ sort sans " +
      "`Retry-After`, et « non armé » n'est pas un réglage, c'est une impossibilité.",
    etat: "cousue",
    symbole: "PortsDuService",
    genre: "type",
    module: "ops/service.ts",
    mesureeAilleurs: "ops/service.spec.ts",
    assertion: {
      fichier: "ops/service.spec.ts",
      nom:
        "un 429 servi par un service RÉELLEMENT MONTÉ porte Retry-After, et le non-armé " +
        "ne le porte pas",
      nomme: ["delaiDeReprise", "PortsDuService", "retry-after"],
    },
    motif:
      "⚠️ **UNE DÉCISION PAR ENTRÉE, ET C'EST CE DÉDOUBLEMENT QUI RÉPARE LE DÉFAUT.** " +
      "L'entrée précédente couvrait les décisions 2 ET 3 de l'ADR 0037 sous une seule " +
      "ligne : une seule assertion ne peut pas voir deux décisions, et celle des deux qui " +
      "n'était pas nommée aurait pu atterrir seule sans que rien ne le dise. ⚠️ MESURE " +
      "TRANSCRITE : 7 303 caractères lus dans `ops/service.ts`, interface `PortsDuService` " +
      "isolée à 533 caractères, `delaiDeReprise` absent. Le symbole ÉTAIT cousu — " +
      "`ops/index.ts` l'importe —, l'entrée était verte à bon droit, et la décision " +
      "n'existait nulle part : ajouter un champ à un type déjà importé ne change AUCUN " +
      "compte d'appelants. C'est le spécimen exact du défaut que l'ADR 0041 ferme. " +
      "✅ ATTERRIE AU LOT 4, LES DEUX ÉTATS TRANSCRITS SUR UNE COPIE PROPRE DE `HEAD` — " +
      "ROUGE : « statut 429 sur le fil · Retry-After AUCUN · 0 lecture(s) du port », " +
      "`expected null to be '37'`. VERT : « Retry-After « 37 » · 1 lecture du port, " +
      "étape [12] », et le TÉMOIN INVERSE au même montage, port non déclaré : « statut " +
      "429 · Retry-After AUCUN · écart compté : true ». Sans ce témoin, un transport qui " +
      "poserait l'en-tête EN DUR satisferait la garde. ⚠️ BORNE ÉCRITE AVEC LA DÉCISION : " +
      "la production laisse le port `null` — la seule source honnête du délai serait " +
      "`RefusDetaille.retryAfterSecondes`, que l'orchestrateur ne porte pas à ce jour, et " +
      "relire le nombre dans le message français est ce que l'ADR 0037 interdit. Le " +
      "`null` est ÉCRIT et COMPTÉ : `ServiceMonte.portsDAmontNonArmes` le NOMME, et " +
      "`ops/index.ts` l'annonce à chaque démarrage.",
  },

  // ── ADR 0038 ───────────────────────────────────────────────────────────────
  {
    adr: "0038",
    decision:
      "Le chemin LIBRE peut resserrer un niveau ou raccourcir une durée ; à niveau " +
      "ET échéance égaux il ne resserre rien, et ne réécrit donc pas l'attestation d'un " +
      "desserrage.",
    etat: "à-coudre",
    symbole: "resserrer",
    genre: "fonction",
    module: "core/policy/desserrage.ts",
    mesureeAilleurs: "core/policy/desserrage.spec.ts",
    assertion: null,
    motif:
      "0 appelant de production MESURÉ : `console/` est vide, et seuls les ré-exports de " +
      "`core/policy/index.ts` le citent. LE DÉFAUT ÉTAIT DONC LATENT — et il est sur le " +
      "chemin que `core/chaine/etape-05-scopes.ts` nomme déjà comme outil MCP futur " +
      "(`ops.policy.tighten`) ; il est FERMÉ au lot 3 par le refus `resserrage-sans-effet`, " +
      "prononcé à l'égalité de niveau ET d'échéance, et seulement quand il y a une ligne en " +
      "vigueur à cette portée exacte — sans quoi le refus parlerait d'une ligne qui " +
      "n'existe pas. ⚠️ SEUL DÉFAUT DE CE LOT QUI SOIT D'ABORD UN DÉFAUT DU " +
      "CAHIER DES CHARGES : le § 20 rend ce chemin « libre d'où que ça vienne » sans " +
      "distinguer RESSERRER de RÉÉCRIRE L'ATTESTATION. Mesuré : une ligne `libre` posée " +
      "depuis `console` avec TOTP et `ops:policy` était remplaçable par une ligne `libre` de " +
      "même portée et même échéance venue de `mcp` ; le niveau servi ne bouge pas, " +
      "l'ATTRIBUTION change. Le § 12, règle 2, dit que sans `channel` la protection second " +
      "facteur est INAUDITABLE — ici le canal survit, et il ment, ce qui est pire qu'une " +
      "colonne vide. ⚠️ LA COUPE EST À L'ÉGALITÉ D'ÉCHÉANCE, ET PAS AILLEURS : une " +
      "échéance antérieure raccourcit, donc resserre, donc reste libre — les DEUX témoins " +
      "inverses le mesurent, sans quoi une fonction qui refuserait tout satisferait la " +
      "garde. ⚠️ `remplaceesDoffice` N'EST PAS TOUCHÉE : filtrer la supersession par niveau " +
      "ou par canal fabriquerait des lignes orphelines toujours « en vigueur » que rien ne " +
      "remplacerait jamais. Le tri se fait AVANT l'écriture. ⚠️ MUTATION REJOUÉE : retirer " +
      "le refus `resserrage-sans-effet` fait rougir `core/policy/desserrage.spec.ts`.",
  },

  // ── ADR 0039 ───────────────────────────────────────────────────────────────
  {
    adr: "0039",
    decision:
      "La chaîne des quatorze étapes est COMPOSÉE à la racine, et le refus de " +
      "monter un transport sur un noyau absent devient vert parce que le noyau est là.",
    etat: "cousue",
    symbole: "orchestrerAppel",
    genre: "fonction",
    module: "core/chaine/orchestrateur.ts",
    mesureeAilleurs: "core/chaine/orchestrateur.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production MESURÉ : `ops/composition/noyau.ts`. LE ZÉRO EST LEVÉ, ET " +
      "C'ÉTAIT LA MESURE DU LOT 2 — « le socle DÉMARRE et ne SERT PAS depuis son propre " +
      "processus ». Il sert : lancement réel, réglages factices sur `stub.invalid`, " +
      "`node dist/ops/index.js --provisionner-le-coffre-local`, 7 étage(s) franchi(s), " +
      "28 champ(s) de `DependancesOrchestrateur` composé(s), transport stdio monté, " +
      "0 empêchement, `tools/list` servi PAR LE PROCESSUS LUI-MÊME, code de sortie 0. Et un " +
      "`tools/call` sur un outil inconnu est refusé à l'ÉTAPE 6, code `tool_disabled` : la " +
      "chaîne est TRAVERSÉE, pas simulée. ⚠️ LA GARDE DE `monterLeService` N'A PAS BOUGÉ " +
      "D'UN CARACTÈRE — elle est verte PARCE QUE LE NOYAU EST LÀ. Le témoin inverse la " +
      "rejoue sans clé de scellement (`ops/composition/noyau.spec.ts` ③, " +
      "`ops/service.spec.ts` « SAIT DIRE NON ») et elle refuse de nouveau. ⚠️ ET LA " +
      "COMPOSITION BUTE ENCORE SUR LE MANQUE MESURÉ : le coffre implémente DEUX ponts de " +
      "lecture de clé — `lireCleArgHash` et `lireCleSceauJournal` — et le port de clé des " +
      "curseurs n'en a toujours AUCUNE. `SANS_PONT_DE_CLE_DE_CURSEUR` le NOMME et rend " +
      "`null`, ce qui fait LEVER `creerSignataireCurseur` à la première pagination — " +
      "fail-loud, jamais une clé de repli connue. ⚠️ **CE MOTIF A DÉCRIT PENDANT UN LOT " +
      "ENTIER UN LANCEMENT À LA MAIN, ET AUCUNE GARDE NE LE REJOUAIT.** La recette l'a " +
      "mesuré par la mutation que l'ADR nomme lui-même : `ops/index.ts`, " +
      "`noyau: noyau.fabrique,` → `noyau: null,`, suite COMPLÈTE " +
      "`Tests 1489 passed | 31 expected fail (1520)` — SURVIVANTE. Ce qui existait " +
      "éprouvait `composerLeNoyau` en isolation et remettait un noyau fabriqué à " +
      "`PortsDuService` : la chaîne était COMPOSABLE, et la ligne qui la COMPOSE n'était " +
      "traversée par aucun test. `ops/racine-en-service.temoin.spec.ts` la traverse " +
      "désormais — `demarrerLeProcessus` sur un environnement fabriqué, coffre local en " +
      "mémoire, deux requêtes poussées sur le fil, `tools/call` refusé à l'étape DÉRIVÉE " +
      "d'`APPEL_STEPS` — et la même mutation MEURT : `Test Files 1 failed | 132 passed`.",
  },
  {
    adr: "0039",
    decision:
      "Un noyau PAR COLONNE : le montage appelle la fabrique une fois par " +
      "transport, sans quoi les appels HTTP seraient servis avec la colonne de stdio.",
    etat: "cousue",
    symbole: "FabriqueDeNoyau",
    genre: "type",
    module: "core/transport/contrat.ts",
    mesureeAilleurs: "ops/service.spec.ts",
    assertion: null,
    motif:
      "2 importateurs de production MESURÉS : `ops/service.ts` — dont `PortsDuService.noyau` " +
      "EST désormais une fabrique nullable, plus un noyau nullable — et " +
      "`ops/composition/noyau.ts`, qui la rend. Le montage l'appelle UNE FOIS PAR TRANSPORT " +
      "MONTÉ, et `ServiceMonte.colonnesFrappees` le COMPTE. Mesuré : deux transports " +
      "montés → colonnes demandées `[http, stdio]`, 2 noyaux frappés ; et sur la fabrique " +
      "RÉELLE, la trace rend « demandée http → servie http · 4 étapes en amont » contre " +
      "« demandée stdio → servie stdio · 0 étape en amont ». ⚠️ LA GARDE PORTE SUR " +
      "L'ÉGALITÉ DEMANDÉE = SERVIE, PAS SUR LE COMPTE : un montage qui frapperait deux " +
      "noyaux en leur passant la même colonne rendrait « 2 frappés » en restant faux, et " +
      "l'écart d'étapes amont (4 contre 0) est ce qui empêche l'égalité d'être verte sur " +
      "une fabrique qui ignorerait son paramètre. ⚠️ CE QUE CETTE FORME EMPÊCHE, ET QUE RIEN D'AUTRE " +
      "NE VERRAIT : c'est le champ `transport` de `DependancesOrchestrateur` qui fait lire " +
      "la colonne du § 11 — étapes applicables, étapes établies en amont, étapes hors " +
      "colonne. Un noyau unique composé en `stdio` et remis aux deux transports servirait " +
      "les appels HTTP en croyant que les quatre étapes « HTTP seul » n'existent pas, et " +
      "`verifierCouvertureDesEtapes` ne le verrait PAS : elle boucle à l'étage 6 sur les " +
      "NOMS de transports, jamais sur les noyaux montés. ⚠️ CE N'EST PAS UNE CONTRADICTION " +
      "AVEC L'ADR 0025 : les deux noyaux partagent tout ce qui décide et ne diffèrent que " +
      "par leur colonne — un seul CHEMIN, pas un seul objet.",
  },
  {
    adr: "0039",
    decision:
      "La composition vit dans son propre dossier : `ops/index.ts` RELIE, " +
      "`ops/main.ts` SÉQUENCE, `ops/service.ts` MONTE, `ops/composition/` COMPOSE.",
    // ⚠️ **CETTE ENTRÉE ÉTAIT « à-nommer » ET LE DOSSIER A ATTERRI.** La garde
    //    l'a dit le jour même, mot pour mot : « l'état « à-nommer » attend
    //    l'ABSENCE de ops/composition/, et le dossier a atterri — l'entrée doit
    //    nommer son symbole ». Le symbole est nommé, et l'entrée redevient
    //    falsifiable dans les deux sens.
    etat: "cousue",
    symbole: "composerLeNoyau",
    genre: "fonction",
    module: "ops/composition/noyau.ts",
    mesureeAilleurs: "ops/composition/noyau.spec.ts",
    assertion: null,
    motif:
      "1 appelant de production MESURÉ : `ops/index.ts`. ⚠️ POURQUOI UN DOSSIER À PART, ET " +
      "PAS `ops/index.ts` : la composition écrite dans le point d'entrée serait inéprouvable " +
      "sans lire `process.env`, et c'est exactement le motif qui a fait séparer " +
      "`ops/service.ts` de `ops/main.ts` à l'ADR 0034. Tenu : `composerLeNoyau` ne nomme ni " +
      "`process`, ni une variable d'environnement, ni une socket, et sa garde compose DEUX " +
      "noyaux dans le même test. ⚠️ CE QUE LA COMPOSITION N'A PAS LE DROIT DE FABRIQUER : " +
      "`validerEntree`, `appelAdaptateur` et `reglages` exigent un adaptateur, et aucun " +
      "n'est admis. Ils sont composés en REFUS NOMMÉ — `ErreurAdaptateurNonAdmis`, qui " +
      "porte le PORT et l'OUTIL —, jamais en fonctions de complaisance : une validation " +
      "qui rendrait toujours succès serait le « vert parce qu'il ne regarde rien » dans sa " +
      "forme la plus pure, et elle traverserait toutes les gardes du dépôt. ⚠️ ET LE TÉMOIN " +
      "ATTEINT CE REFUS PAR LA CHAÎNE, PAS PAR SA SIGNATURE : un outil est mis à " +
      "l'inventaire, l'appel traverse les étapes 0, 5, 6 et 7 et LÈVE sur `reglages` ; le " +
      "journal écrit quand même sa ligne, en `decision: interrompu` — l'invariant de sortie " +
      "du § 11 tient jusque sur le chemin d'exception.",
  },

  // ── ADR 0040 ───────────────────────────────────────────────────────────────
  {
    adr: "0040",
    etat: "hors-code",
    decision:
      "Le plafond de durée d'un test est POSÉ (30 000 ms, crochets compris) et sa " +
      "marge se SURVEILLE : alerte dès qu'un test dépasse la moitié du plafond.",
    assertion: null,
    motif:
      "AUCUN SYMBOLE LIVRÉ, et le motif est mesurable : la décision vit dans " +
      "`vitest.config.ts`, que `tsconfig.build.json` exclut par le motif `*.config.ts` — " +
      "la garde des coutures en dérive le MÊME critère, donc ce fichier n'est pas un " +
      "module de production. ⚠️ LE FAIT MESURÉ : le fichier ne posait NI `testTimeout` NI " +
      "`hookTimeout`, donc 5 000 ms par test et 10 000 ms par crochet. Sur une exécution " +
      "complète VERTE, cinq gardes du registre tenaient entre 3 433 et 3 895 ms — " +
      "**22 % de marge**. C'est ce qui a fait voir 17 puis 9 tests rouges à un observateur " +
      "pendant que la suite était verte pour un autre : les deux mesures sont vraies, et " +
      "c'est la signature d'une marge trop mince, pas d'un désaccord. ⚠️ **ET LA MARGE A " +
      "ÉTÉ FRANCHIE PAR CE LOT-CI, DANS LA MÊME SESSION.** Les quatorze entrées ajoutées " +
      "ci-dessus et les six ADR neufs ont porté ces mêmes gardes à 5 719, 8 097, 8 236 et " +
      "10 738 ms : 8 tests rouges dans 3 fichiers, tous en « Test timed out in 5000ms », " +
      "pendant qu'elles annonçaient « 79 symbole(s) confronté(s) · 0 anomalie(s) ». LE " +
      "REGISTRE ÉTAIT JUSTE, LES GARDES ONT EXPIRÉ — la panne exacte que l'ADR décrit, sur " +
      "un arbre où la règle gardée était tenue. ⚠️ ET LE PLAFOND A UNE SEULE ÉCRITURE, " +
      "DEUX LECTEURS : le contrôle de marge IMPORTE la valeur au lieu de la recopier, " +
      "sinon il mesurerait une marge par rapport à un plafond qui n'existe plus, en " +
      "restant vert. ⚠️ DETTE OUVERTE ET DATÉE : à 10 738 ms, le pire cas tient déjà 36 % " +
      "du plafond neuf ; la réponse au prochain dépassement est de MÉMOÏSER le balayage " +
      "du dépôt, jamais de remonter le plafond.",
  },
  {
    adr: "0040",
    etat: "hors-code",
    decision:
      "L'ARMEMENT n'écrit plus le seuil : le crochet qui fait rougir un test " +
      "DÉRIVE sa décision du même verdict que la fonction pure, et une garde le vérifie.",
    assertion: null,
    motif:
      "AUCUN SYMBOLE LIVRÉ : `plafond-de-test.config.ts` et `marge-des-gardes.config.ts` " +
      "sortent tous deux du périmètre livré par le motif `*.config.ts`, dont la garde des " +
      "coutures dérive son critère. ⚠️ LE FAIT MESURÉ PAR LA RECETTE : le seuil était " +
      "écrit DEUX fois — dans `verdictDeMarge().depassements`, gardé, et dans " +
      "l'`afterEach` d'amorce sous la forme `if (dureeMs > seuilMs)`, gardé par RIEN. " +
      "Celle des deux écritures qui faisait réellement rougir les tests du dépôt était la " +
      "non gardée. La mutation qui la neutralise — `> PLAFOND_DE_TEST_MS`, condition qui " +
      "ne peut plus jamais tirer puisque vitest tue le test AU plafond avant l'`afterEach` " +
      "— a survécu à la suite complète : `Tests 1489 passed | 31 expected fail (1520)`, " +
      "zéro fichier rouge. ⚠️ CE QUI A ÉTÉ FAIT : `alerteDeDepassement` porte la décision, " +
      "appelle `verdictDeMarge`, et l'amorce ne fait plus que la relayer. Trois témoins " +
      "l'éprouvent dans `core/audit/marge-des-gardes.spec.ts` — une durée fabriquée à " +
      "60 % du plafond lève, une à 49 % ne lève pas, et le TROISIÈME lit le fichier " +
      "d'amorce sur disque, retire sa prose, et exige 1 appel au verdict et 0 comparaison " +
      "propre de `dureeMs`. Sans ce troisième, l'amorce pourrait reprendre sa propre " +
      "comparaison demain sans que rien ne rougisse. ⚠️ DEUX MUTATIONS SUCCESSEURS REJOUÉES, " +
      "TOUTES DEUX TUÉES : la part portée à 1 dans `alerteDeDepassement` (2 tests rouges) " +
      "et l'appel remplacé par `null` dans l'amorce (1 test rouge, celui qui lit la source).",
  },
  {
    adr: "0040",
    etat: "cousue",
    decision:
      "La dérivation du graphe d'appels retire la prose et les liaisons UNE FOIS " +
      "PAR FICHIER, jamais une fois par couple (entrée × fichier) : c'est le remède que " +
      "l'ADR prescrit — rendre la garde moins chère —, et non remonter le plafond.",
    symbole: "sansProse",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/coutures/couture.temoin.spec.ts",
    assertion: null,
    motif:
      "⚠️ LE FAIT MESURÉ PAR LA RECETTE, ET C'EST LE CONSTAT N° 1 DU LOT : la suite " +
      "complète N'ÉTAIT PAS REPRODUCTIBLE. Cinq exécutions vertes, puis une rouge, sur un " +
      "arbre inchangé — `Test Files 2 failed | 131 passed`. La cause est nommée : " +
      "`sansProse` et `sansLiaisons` étaient appelées au cœur d'une double boucle de " +
      "89 entrées × 134 modules, soit près de 12 000 passages de quatre expressions " +
      "régulières globales sur des sources entières, pour un résultat qui ne dépend QUE du " +
      "fichier. Les gardes tenaient 4 641 ms sur machine calme et 15 663 ms sur machine " +
      "chargée — au-delà du seuil d'alerte de 15 000 ms —, si bien que l'alarme de " +
      "l'ADR 0040 tirait sur une garde JUSTE. ⚠️ LA CONTENTION ÉTAIT RÉELLE ET IDENTIFIÉE : " +
      "une seconde session travaillait sur un autre dépôt de la même machine, et les " +
      "durées de la suite passaient de 25 s à 67 s. ⚠️ APRÈS : les deux fonctions sont " +
      "PURES, leur résultat est calculé une fois par fichier, et le pire cas passe de " +
      "4 641 ms à 1 337 ms — marge 15 % → 4 %. Mesuré : TROIS suites concurrentes, plus " +
      "dur que la condition qui cassait, 133 fichiers verts chacune, ZÉRO alerte. " +
      "⚠️ CE N'EST PAS UN ASSOUPLISSEMENT, ET LA MUTATION LE DIT : basculer l'entrée " +
      "`orchestrerAppel` de `cousue` à `à-coudre` fait toujours rougir les TROIS gardes de " +
      "désaccord, dans les DEUX fichiers — en 4 à 37 ms au lieu de plusieurs secondes. Le " +
      "corpus confronté n'a pas changé d'un caractère ; seul le nombre de calculs a changé.",
  },
  // ── ADR 0041 ───────────────────────────────────────────────────────────────
  {
    adr: "0041",
    decision:
      "Chaque entrée du registre porte DEUX faits distincts, jamais confondus : " +
      "combien de modules de production appellent le symbole, et LE NOM D'UN TEST QUI " +
      "ÉCHOUE si la décision n'a pas atterri.",
    etat: "à-coudre",
    symbole: "verifierLesAssertions",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/coutures/couture.temoin.spec.ts",
    assertion: {
      fichier: "core/coutures/couture.temoin.spec.ts",
      nom: "compte les entrées SANS assertion et dérive les ADR qu'aucun test ne voit",
      nomme: ["verifierLesAssertions", "sans-assertion"],
    },
    motif:
      "0 appelant de production MESURÉ, et c'est l'état DÉFINITIF, non une dette : ses deux " +
      "appelants sont des gardes (`registre.spec.ts` pour le dépôt réel, " +
      "`couture.temoin.spec.ts` pour les jeux fabriqués), et une garde n'est pas un module de " +
      "production — même régime que `verifierLesCoutures`. ⚠️ **ET CETTE ENTRÉE EST L'AUTO- " +
      "INSCRIPTION QUE LE LOT 3 N'AVAIT PAS FAITE.** Son rapport écrivait, du mécanisme des " +
      "coutures, « ET JE SUIS LOGÉ À LA MÊME ENSEIGNE » : il mesurait tout le monde et rien de " +
      "lui-même. Un test de `registre.spec.ts` exige nommément qu'UNE entrée porte ce symbole " +
      "et qu'elle porte une assertion. ⚠️ LE FAIT MESURÉ À L'ÉCRITURE DE LA GARDE, SUR LE " +
      "REGISTRE INCHANGÉ : 90 entrées confrontées, 0 avec assertion, 36 ADR inscrits dont 36 " +
      "n'en portaient AUCUNE. C'est le chiffre qui manquait au projet, et il ne se lisait " +
      "nulle part parce que rien ne le calculait.",
  },
  {
    adr: "0041",
    decision:
      "Une assertion n'est pas une CHAÎNE recopiée : le fichier doit exister, le " +
      "test doit y être déclaré sous ce nom exact, son corps doit porter un `expect(` et " +
      "NOMMER ce que la décision a changé.",
    etat: "à-coudre",
    symbole: "AssertionDeCouture",
    genre: "type",
    module: "core/coutures/registre.ts",
    mesureeAilleurs: "core/coutures/couture.temoin.spec.ts",
    assertion: {
      fichier: "core/coutures/couture.temoin.spec.ts",
      nom: "rougit sur chacune des six façons dont une assertion peut être fausse",
      nomme: ["verifierLesAssertions", "CAS_D_ASSERTION", "cousuesNonAtterries"],
    },
    motif:
      "0 importateur de production MESURÉ, et c'est l'état attendu : le type décrit une DONNÉE " +
      "du registre, que seules des gardes lisent. ⚠️ LE DÉFAUT QUE CE TYPE FERME EST CELUI " +
      "QU'IL POURRAIT FABRIQUER : un nom de test écrit au registre et nulle part ailleurs " +
      "remplacerait une garde aveugle par un REGISTRE MENTEUR — pire, parce qu'il aurait " +
      "l'air d'une mesure. Dix cas fabriqués éprouvent la garde, un par façon d'être faux ; " +
      "le dixième est le seul qui compte vraiment : il exige que le corps isolé d'un test NE " +
      "FUIE PAS jusqu'au test voisin, faute de quoi une entrée serait fermée par un nom que " +
      "porte le test d'à côté.",
  },

  // ── ADR 0042 ───────────────────────────────────────────────────────────────
  {
    adr: "0042",
    decision:
      "Le `.env` reste où il est — un `.env` ignoré est la pratique normale — et " +
      "c'est la GARDE qui manquait : elle rougit si un porteur de secret devient suivi, " +
      "s'il est présent sans être ignoré, ou si une sonde cesse d'être ignorée.",
    etat: "à-coudre",
    symbole: "verifierLeDepotPublic",
    genre: "fonction",
    module: "ops/depot-public.ts",
    mesureeAilleurs: "ops/depot-public.spec.ts",
    assertion: {
      fichier: "ops/depot-public.spec.ts",
      nom: "rougit sur un secret SUIVI, sur un secret NON IGNORÉ, et sur une sonde découverte",
      nomme: ["verifierLeDepotPublic", "est SUIVI par git", "n'est plus ignoré par git"],
    },
    motif:
      "0 appelant de production MESURÉ, et c'est l'état DÉFINITIF : la garde EST le fichier " +
      "`.spec.ts`, que `pnpm test` exécute en intégration continue — même régime que " +
      "`verifierLesCoutures`. La brancher en plus dans `ops/verifier-secrets.ts` " +
      "dupliquerait le contrôle et coupleraient l'étape des secrets à la présence de git. " +
      "⚠️ LE CORRECTIF ÉVIDENT ÉTAIT LE MAUVAIS : déplacer le fichier l'emmène dans un " +
      "répertoire où plus aucune règle ne le couvre, et ne pose AUCUNE garde. On ne déplace " +
      "pas le risque, on le rend visible. ⚠️ CE QUE LA GARDE A TROUVÉ LE JOUR MÊME, ET QUI " +
      "N'ÉTAIT PAS LE RISQUE SIGNALÉ : sur 335 chemins confrontés et 6 sondes, TROIS " +
      "n'étaient pas ignorées — `secrets.json`, `id_rsa`, `prive.pem`. `.gitignore` couvrait " +
      "`.env` et `.env.*`, et rien d'autre. Les règles manquantes ont été posées ; le " +
      "verdict est passé de 3 anomalies à 0.",
  },
  {
    adr: "0042",
    decision:
      "Les SONDES se confrontent aux règles d'ignorance elles-mêmes, sans exiger " +
      "que le fichier existe : c'est le seul des trois sens qui morde sur une machine " +
      "propre, donc en intégration continue.",
    etat: "à-coudre",
    symbole: "SONDES",
    genre: "constante",
    module: "ops/depot-public.ts",
    mesureeAilleurs: "ops/depot-public.spec.ts",
    assertion: {
      fichier: "ops/depot-public.spec.ts",
      nom: "exige que chaque SONDE reste ignorée par git, qu'elle existe ou non",
      nomme: ["SONDES", "NON IGNORÉE"],
    },
    motif:
      "0 lecteur de production MESURÉ : la constante est une DONNÉE que seule la garde lit. " +
      "⚠️ LA MESURE QUI FONDE CETTE DÉCISION : un dépôt fraîchement cloné ne porte AUCUN " +
      "`.env`. Les deux autres sens de la garde — « suivi » et « présent non ignoré » — " +
      "n'ont alors RIEN à confronter, et la garde serait verte en ne regardant rien, " +
      "c'est-à-dire précisément là où elle est censée protéger. Les six sondes se " +
      "confrontent à `git check-ignore`, qui répond sur un chemin INEXISTANT : retirer la " +
      "ligne `.env` de `.gitignore` rougit immédiatement. ⚠️ ET LE CODE DE SORTIE EST LU, " +
      "JAMAIS ÉCRASÉ : `git check-ignore` sort en 1 quand aucun chemin n'est ignoré — un " +
      "succès pour nous, une erreur pour l'appelant. Un `|| true` ferait de « git absent » " +
      "un « rien d'ignoré », c'est-à-dire six anomalies illisibles, ou pire, zéro.",
  },

  // ── ADR 0043 ───────────────────────────────────────────────────────────────
  {
    adr: "0043",
    decision:
      "Le refus du plafond se prononce APRÈS `estServi` et AVANT " +
      "`franchir(ETAPE_PROFIL_CHAINE.numero)` — après, pour ne pas nommer la mauvaise " +
      "cause ; avant, pour que le journal ne mente pas sur le point d'arrêt.",
    etat: "cousue",
    symbole: "PLAFOND_OUTILS_PAR_PROFIL",
    genre: "constante",
    module: "core/profiles/budget.ts",
    mesureeAilleurs: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
    assertion: {
      fichier: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
      nom: "le bloc de l'étape 7 de l'orchestrateur lit PLAFOND_OUTILS_PAR_PROFIL",
      nomme: ["PLAFOND_OUTILS_PAR_PROFIL", "estServi(outil, profil)"],
    },
    motif:
      "✅ COUSUE AU LOT 4 — 1 lecteur de production MESURÉ : `core/chaine/orchestrateur.ts` " +
      "l'importe et le passe en option à `mesurerBudgetProfil`, pour que l'étape 7 NOMME la " +
      "règle qu'elle applique au lieu de la laisser implicite. Le nombre reste écrit à UN " +
      "seul endroit — `core/profiles/budget.ts` — donc ce n'est pas une recopie. ⚠️ MESURE " +
      "TRANSCRITE, AVANT : le bloc de l'étape 7 tenait 453 caractères et ne faisait que " +
      "`if (!estServi(outil, profil))`. APRÈS : 2 850 caractères, et il nomme " +
      "`PLAFOND_OUTILS_PAR_PROFIL`. ⚠️ LES DEUX BORNES SONT GARDÉES, et la seconde compte " +
      "autant : 41 outils servis → refus à l'étape 7 ; 40 → l'appel est SERVI. Sans le " +
      "témoin inverse, un refus posé sur `>= 0` serait vert. La garde est montée sur " +
      "l'orchestrateur RÉEL, jamais sur une réimplémentation — celle-ci a QUITTÉ " +
      "`core/__tests__/integration.spec.ts` du même geste (0 occurrence mesurée).",
  },
  {
    adr: "0043",
    etat: "hors-code",
    decision:
      "La réimplémentation du plafond dans `core/__tests__/integration.spec.ts` est " +
      "SUPPRIMÉE — et dans cet ordre : poser le refus d'abord, retirer le sosie ensuite.",
    assertion: {
      fichier: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
      nom: "la réimplémentation du plafond a QUITTÉ core/__tests__/integration.spec.ts",
      nomme: ["PLAFOND_OUTILS_PAR_PROFIL", "le SOSIE"],
    },
    motif:
      "AUCUN SYMBOLE LIVRÉ : la décision est un RETRAIT, dans un fichier `.spec.ts` que " +
      "`tsconfig.build.json` exclut — la garde des coutures en dérive le même critère, donc " +
      "aucun compte d'appelants ne pourrait la porter. ⚠️ ET C'EST EXACTEMENT LE CAS QUE " +
      "L'ADR 0041 EXISTE POUR COUVRIR : un retrait ne se mesure pas en appelants, il se " +
      "mesure par une assertion. Mesure transcrite : 2 occurrences de " +
      "`PLAFOND_OUTILS_PAR_PROFIL` subsistent dans `integration.spec.ts`, sous le " +
      "commentaire « le plafond se refuse ICI, pas seulement en CI ». Un test qui " +
      "réimplémente ce qu'il garde est vert quelle que soit la production. ⚠️ L'ORDRE DES " +
      "DEUX GESTES EST IMPOSÉ : retirer le sosie AVANT de poser le refus laisserait le " +
      "dépôt, pendant un temps, sans aucune épreuve du plafond ni en production ni en test.",
  },

  // ── ADR 0044 ───────────────────────────────────────────────────────────────
  {
    adr: "0044",
    decision:
      "Le filet anti-fuite du § 20 remonte de `core/transport/http/` à " +
      "`core/transport/`, prend la réponse SÉRIALISÉE de chaque transport, et les DEUX " +
      "fils l'appellent — y compris sur le chemin d'exception.",
    etat: "cousue",
    symbole: "verifierAucuneFuite",
    genre: "fonction",
    module: "core/transport/anti-fuite.ts",
    mesureeAilleurs: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
    assertion: {
      fichier: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
      nom: "verifierAucuneFuite vit sous core/transport/ et les DEUX transports l'appellent",
      nomme: ["verifierAucuneFuite", "core/transport/stdio/"],
    },
    motif:
      "ATTERRI AU LOT 4. Mesure d'AVANT, transcrite : 1 appelant de production, " +
      "`core/transport/http/transport.ts`, et 0 sous `core/transport/stdio/` sur 6 modules " +
      "balayés — UN transport sur DEUX. Mesure d'APRÈS : le définisseur est " +
      "`core/transport/anti-fuite.ts`, et 2 appelants de production le nomment — " +
      "`core/transport/http/transport.ts` et `core/transport/stdio/serveur.ts`. ⚠️ **CETTE " +
      "ENTRÉE EST LE SPÉCIMEN DU DÉFAUT QUE L'ADR 0041 FERME, ET IL FAUT LE GARDER ÉCRIT " +
      "APRÈS LA CORRECTION** : pendant tout un lot, le symbole était réellement cousu, " +
      "l'entrée verte à bon droit, et la décision nulle part. Un compte d'appelants ne " +
      "distingue pas « appelé par un transport » de « appelé par les deux ». C'est " +
      "l'assertion qui le dit. ⚠️ CE QU'ELLE MESURE, ET SA BORNE : elle lit des FORMES sur " +
      "le disque — fichier présent, appelant trouvé. Que le filet MORDE sur les deux fils " +
      "est mesuré ailleurs, par `core/transport/anti-fuite.spec.ts`, qui met la MÊME entrée " +
      "devant les deux transports. ⚠️ PREUVE TRANSCRITE DU CORRECTEUR : la garde d'équivalence " +
      "exécutée contre l'état d'AVANT rend `4 failed | 2 passed`, et les 4 échecs nomment " +
      "TOUS « → stdio » — 4 valeurs ressorties sur le fil stdio, 0 côté HTTP. Après la " +
      "remontée : 6 verts, 0 valeur ressortie, 8 sorties relues.",
  },

  // ── ADR 0044 · seconde décision ────────────────────────────────────────────
  {
    adr: "0044",
    decision:
      "Les valeurs sensibles d'un appel sont DÉRIVÉES UNE FOIS pour les deux fils — " +
      "les trois canaux de protocole du § 20 et les chaînes de l'`input` —, chaque transport " +
      "n'y AJOUTANT que ce qui lui est propre.",
    etat: "cousue",
    symbole: "valeursSensiblesDeLAppel",
    genre: "fonction",
    module: "core/transport/anti-fuite.ts",
    mesureeAilleurs: "core/transport/anti-fuite.spec.ts",
    assertion: {
      fichier: "core/transport/anti-fuite.spec.ts",
      nom: "la MÊME entrée sur les DEUX transports ne fait paraître ni jeton ni secret",
      nomme: ["valeursSensiblesDeLAppel", "surLesDeuxFils"],
    },
    motif:
      "2 appelants de production mesurés : `core/transport/http/transport.ts` et " +
      "`core/transport/stdio/serveur.ts`. ⚠️ **CETTE ENTRÉE EXISTE PARCE QUE LE SILENCE DES " +
      "DEUX FILS NE PROUVE RIEN SI CHACUN COMPOSE SA PROPRE LISTE.** Tant que la collecte " +
      "était écrite dans `transport.ts`, « la même entrée sur les deux transports » n'était " +
      "qu'une phrase : rien n'obligeait le fil stdio à confronter le jeton de confirmation, " +
      "et il ne le confrontait pas. C'est le défaut déjà payé par `valeurs-servies.ts` " +
      "(ADR 0037, § 4) — deux dérivations d'un même fait finissent par se contredire, et " +
      "c'est la seconde qui ne suit jamais. ⚠️ MESURE TRANSCRITE : 3 canaux de protocole " +
      "dérivés de la table (`NOMS_DES_CANAUX_SENSIBLES`), 4 entrées confrontées × 2 " +
      "transports = 8 sorties relues, 0 valeur ressortie. ⚠️ SA BORNE, ÉCRITE AVEC ELLE : le " +
      "filet compare des CHAÎNES. Une valeur qui sortirait tronquée, ré-encodée ou hachée " +
      "lui échappe — c'est un plancher de détection, jamais une preuve d'absence de fuite.",
  },

  // ── ADR 0045 ───────────────────────────────────────────────────────────────
  {
    adr: "0045",
    etat: "hors-code",
    decision:
      "La migration initiale entre au dépôt (`migrate dev --create-only`, relue), " +
      "et le script d'ajout-seul se chaîne APRÈS `prisma migrate deploy` — ordre écrit, " +
      "non convenu oralement.",
    assertion: {
      fichier: "core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts",
      nom: "prisma/migrations/ porte une migration initiale, et le SQL se chaîne après elle",
      nomme: ["prisma/migrations/", "schema.prisma"],
    },
    motif:
      "AUCUN SYMBOLE TYPESCRIPT LIVRÉ, et le motif est mesurable : la décision vit dans " +
      "`prisma/`, que le programme TypeScript ne balaie pas — aucun compte d'appelants ne " +
      "peut la porter. ⚠️ LE FAIT MESURÉ : 10 modèles déclarés au schéma, matérialisables " +
      "par **0 chemin reproductible**. `prisma/migrations/` n'existe pas. Conséquence en " +
      "chaîne, et c'est elle qui compte : `prisma/sql/0001-ops-audit-append-only.sql` se " +
      "déclare lui-même « s'applique APRÈS `prisma migrate deploy` » — il n'y a RIEN après " +
      "quoi s'appliquer. Le seul verrou qui rende une réécriture d'`ops_audit` visible " +
      "(ADR 0002) n'est appliqué par rien : un compte disposant d'UPDATE retire une tranche, " +
      "recalcule la chaîne, et `verifierChaine` rend `valide = true` sur un journal amputé. " +
      "⚠️ LA BORNE, ÉCRITE AVEC LA DÉCISION : cet ADR ne rend pas le socle déployable. Le " +
      "rôle de connexion, la sauvegarde et la restauration éprouvée vivent hors de ce dépôt " +
      "PUBLIC et n'y entreront jamais.",
  },
  // -- ADR 0046 ---------------------------------------------------------------
  {
    adr: "0046",
    decision:
      "Le provisionnement du coffre constate l'état AVANT de regarder la clé, et " +
      "REFUSE un coffre déjà créé : l'ordre des deux contrôles EST la décision.",
    etat: "à-coudre",
    symbole: "provisionnerLeCoffre",
    genre: "fonction",
    module: "ops/vault-init.ts",
    mesureeAilleurs: "ops/vault-init.spec.ts",
    assertion: {
      fichier: "ops/vault-init.spec.ts",
      nom: "refuse un coffre DÉJÀ CRÉÉ avant même de regarder la clé, et ne pose rien",
      nomme: ["provisionnerLeCoffre", "coffre-déjà-créé"],
    },
    motif:
      "0 appelant de production MESURÉ hors de son propre module : `executerLeProvisionnement` " +
      "l'appelle depuis le MÊME fichier, et le définisseur est exclu par construction. C'est " +
      "l'état attendu d'un programme d'exploitation — son unique appelant est le bloc " +
      "d'entrée, sous la garde `estLeProgrammeLance`. ⚠️ CE QU'AUCUN COMPTE D'APPELANTS NE " +
      "PORTERAIT : l'ORDRE des deux contrôles. L'inverser laisse la fonction, ses appelants " +
      "et sa signature intacts, et fabrique le pire message possible — sur un coffre déjà " +
      "créé dont la clé a été oubliée, « pose une clé », c'est-à-dire l'invitation exacte à " +
      "re-sceller des lignes qu'aucune clé n'ouvrirait plus. ⚠️ MUTATION TRANSCRITE : la " +
      "condition « l'état n'est pas absent » remplacée par « l'état est ouvert » → le test " +
      "rougit, « expected 'sceau-non-posé' to be 'coffre-déjà-créé' ». Restaurée : vert.",
  },
  {
    adr: "0046",
    decision:
      "Le message qui refuse le démarrage nomme une commande qui EXISTE : le " +
      "programme de provisionnement IMPORTE la constante au lieu de recopier son texte.",
    etat: "cousue",
    symbole: "COMMANDE_DE_PROVISION",
    genre: "constante",
    module: "core/vault/demarrage.ts",
    mesureeAilleurs: "ops/gestes-nommes.spec.ts",
    assertion: {
      fichier: "ops/gestes-nommes.spec.ts",
      nom: "confronte chaque commande pnpm nommée dans le code aux scripts déclarés",
      nomme: ["verifierLesCommandesNommees", "ops:vault:init"],
    },
    motif:
      "1 appelant de production mesuré, `ops/vault-init.ts`, et c'est le fait : le programme " +
      "qui EXÉCUTE le geste importe le nom du geste au lieu de le recopier. ⚠️ LE FAIT " +
      "MESURÉ AVANT : la constante valait « pnpm ops:vault:init », le socle refusait de " +
      "démarrer en la nommant mot pour mot (§ 25, « LE MESSAGE NOMME LA COMMANDE »), et " +
      "`package.json` ne déclarait AUCUN script de ce nom — la commande tapée rendait " +
      "« command not found ». Le fichier le disait dans un commentaire, au seul endroit que " +
      "personne ne lit au moment où il sert : au milieu d'un incident, socle à terre. " +
      "⚠️ ET UN COMPTE D'APPELANTS NE L'AURAIT JAMAIS DIT : la constante avait déjà un " +
      "lecteur, `decisionDeDemarrage`, dans son propre module. C'est l'EXISTENCE DU SCRIPT " +
      "qui manquait, pas un branchement, et seule une assertion pouvait la voir.",
  },
  {
    adr: "0046",
    decision:
      "Le geste se RÉPÈTE sur un dépôt jetable, et le rapport le DIT — pour que " +
      "« sceau posé » ne se lise jamais « sceau posé EN BASE ».",
    etat: "à-coudre",
    symbole: "ARGUMENT_DE_REPETITION",
    genre: "constante",
    module: "ops/vault-init.ts",
    mesureeAilleurs: "ops/vault-init.spec.ts",
    assertion: {
      fichier: "ops/vault-init.spec.ts",
      nom: "en RÉPÉTITION, éprouve la clé sur un dépôt jetable et le DIT",
      nomme: ["ARGUMENT_DE_REPETITION", "répétition : true"],
    },
    motif:
      "0 lecteur de production MESURÉ hors de son propre module, et c'est l'état attendu : " +
      "la constante est lue par `executerLeProvisionnement`, dans le même fichier. ⚠️ CE " +
      "MODE N'EST PAS UN CONFORT DE DÉVELOPPEMENT, ET LA MESURE LE DIT : c'est le SEUL des " +
      "deux modes que ce dépôt puisse exécuter aujourd'hui — aucune base n'y tourne — et il " +
      "répond AVANT l'incident à la question qui coûte le plus cher, « ma clé est-elle bien " +
      "formée ? ». ⚠️ LE DANGER QU'IL PORTE EST NOMMÉ AVEC LUI : un mode d'essai qui " +
      "annoncerait « sceau posé » sans dire qu'il a écrit dans le vide ferait croire à un " +
      "coffre provisionné. Le rapport porte donc le fait, et la ligne de synthèse l'écrit.",
  },
  {
    adr: "0046",
    etat: "hors-code",
    decision:
      "Le programme ne GÉNÈRE PAS la clé : le § 25 exige qu'elle soit séquestrée " +
      "hors machine AVANT d'être posée, et un outil qui la fabrique invite à sauter le " +
      "séquestre.",
    assertion: {
      fichier: "ops/vault-init.spec.ts",
      nom: "ne fabrique AUCUNE clé : aucune génération d'aléa n'entre dans ops/vault-init.ts",
      nomme: ["ops/vault-init.ts", "randomBytes", "openssl rand -base64 32"],
    },
    motif:
      "AUCUN SYMBOLE NE PEUT PORTER CETTE DÉCISION : c'est une ABSENCE, et aucune fonction " +
      "n'atteste qu'une autre n'existe pas. Aucun compte d'appelants ne la mesurerait, et " +
      "c'est exactement le cas que l'ADR 0041 existe pour couvrir. La garde lit donc le " +
      "SOURCE et confronte SIX formes de génération d'aléa — `randomBytes`, " +
      "`randomFillSync`, `generateKeySync`, `getRandomValues`, `randomUUID`, `Math.random`. " +
      "⚠️ ET ELLE EXIGE L'ISSUE, PAS SEULEMENT L'INTERDIT : le fichier doit DIRE où en " +
      "produire une, faute de quoi l'interdiction serait un mur nu qu'on contourne. " +
      "⚠️ MUTATION TRANSCRITE : la mention retirée → le test rougit, « expected … to " +
      "contain 'openssl rand -base64 32' ». Restaurée : vert. ⚠️ LA BORNE : cette garde " +
      "mesure des FORMES ÉCRITES. Une génération obtenue par un nom composé à l'exécution " +
      "lui échapperait ; le compte des formes cherchées est ANNONCÉ pour que cette borne se " +
      "lise au lieu de se deviner.",
  },
  {
    adr: "0046",
    decision:
      "Chaque commande `pnpm …` nommée dans un message du socle est CONFRONTÉE " +
      "aux scripts réellement déclarés, commentaires retirés, et la garde SAIT rougir.",
    etat: "à-coudre",
    symbole: "verifierLesCommandesNommees",
    genre: "fonction",
    module: "ops/gestes-nommes.ts",
    mesureeAilleurs: "ops/gestes-nommes.spec.ts",
    assertion: {
      fichier: "ops/gestes-nommes.spec.ts",
      nom: "SAIT rougir : une commande nommée sans script déclaré est une anomalie",
      nomme: ["verifierLesCommandesNommees", "introuvables"],
    },
    motif:
      "0 appelant de production MESURÉ, et c'est l'état DÉFINITIF, non une dette : la garde " +
      "EST le fichier `.spec.ts`, que `pnpm test` exécute en intégration continue — même " +
      "régime que `verifierLesCoutures` et `verifierLeDepotPublic`. ⚠️ ELLE LIT LE CODE, " +
      "PAS LA PROSE : `sansProse` retire les commentaires AVANT toute recherche, sans quoi " +
      "elle compterait la dizaine de blocs de documentation qui écrivent « pnpm build » ou " +
      "« pnpm typecheck » — ce qu'on cherche est ce qu'un UTILISATEUR verra. ⚠️ SA BORNE " +
      "EST ÉCRITE AVEC ELLE ET COMPTÉE : une commande composée à l'exécution ne peut pas " +
      "être confrontée sans faire tourner le programme ; il y en a DEUX, elles sortent sous " +
      "`commandesInterpolees`, jamais ignorées en silence. ⚠️ MESURE TRANSCRITE — AVANT : " +
      "141 modules balayés, 11 scripts déclarés, DEUX INTROUVABLES (`ops:vault:init`, " +
      "`db:deploy`). APRÈS : 14 scripts, 3 commandes confrontées, 0 introuvable.",
  },
  {
    adr: "0046",
    decision:
      "Les dix tables du § 12 sont matérialisables par un chemin reproductible, " +
      "et l'ORDRE du chaînage est ÉCRIT dans le script de déploiement — jamais convenu " +
      "oralement.",
    etat: "à-coudre",
    symbole: "verifierLaChaineDeMigration",
    genre: "fonction",
    module: "ops/gestes-nommes.ts",
    mesureeAilleurs: "ops/gestes-nommes.spec.ts",
    assertion: {
      fichier: "ops/gestes-nommes.spec.ts",
      nom: "exige les dix tables du schéma dans une migration, et l'ORDRE écrit du chaînage",
      nomme: ["verifierLaChaineDeMigration", "prisma migrate deploy"],
    },
    motif:
      "0 appelant de production MESURÉ, même régime que la garde précédente. ⚠️ ELLE FERME " +
      "LA MOITIÉ QUE L'ADR 0045 LAISSAIT OUVERTE : une migration PRÉSENTE ne dit pas que le " +
      "script d'ajout seul s'applique APRÈS elle. Appliqué en premier, il échouerait sur une " +
      "table qui n'existe pas encore ; jamais appliqué, le journal en ajout seul de " +
      "l'ADR 0002 n'est appliqué par rien. ⚠️ LES TABLES ATTENDUES SONT DÉRIVÉES DES `@@map` " +
      "DU SCHÉMA, jamais recopiées : écrire ici les dix noms du § 12 rendrait la garde verte " +
      "le jour où une onzième table entrerait au schéma sans migration. ⚠️ MESURE " +
      "TRANSCRITE — AVANT : 0 migration, moteur NON FIXÉ, 10 tables manquantes, ordre écrit " +
      "faux, 4 anomalies. APRÈS : 1 migration, moteur `postgresql`, 10 tables créées sur 10, " +
      "ordre écrit vrai, 0 anomalie. ⚠️ CE QU'ELLE NE PROUVE PAS : elle lit des FORMES, ne " +
      "se connecte à aucune base et ne joue aucune migration — la migration n'a PAS été " +
      "appliquée, aucune base ne tourne dans ce dépôt.",
  },

  // ── ADR 0036, décision 2 — l'inventaire devient du chemin NOMINAL ──────────
  {
    adr: "0036",
    decision:
      "§ 14, correction 3 — `EtatDePilotage.inventaire()` passe du chemin de PANNE au " +
      "chemin NOMINAL, et il est lu AU PLUS UNE FOIS par appel.",
    etat: "à-coudre",
    symbole: "memoiserLInventairePourCetAppel",
    genre: "fonction",
    module: "core/chaine/orchestrateur.ts",
    mesureeAilleurs: "core/__tests__/integration.spec.ts",
    assertion: {
      fichier: "core/__tests__/integration.spec.ts",
      nom: "REFUSE une mesure AVEUGLE, et le message nomme la CONTRADICTION",
      nomme: ["Contradiction interne au socle", "inventaire VIDE"],
    },
    motif:
      "⚠️ 0 APPELANT EXTERNE, ET C'EST STRUCTUREL, PAS UN OUBLI : le seul appelant possible " +
      "est son DÉFINISSEUR, `orchestrateur.ts`, et G1 ne compte jamais le définisseur — à " +
      "raison, sans quoi une fonction récursive et morte annoncerait un appelant. L'axe des " +
      "appelants ne peut donc rien dire de cette décision-ci ; c'est l'ASSERTION qui porte " +
      "la mesure, et c'est exactement la séparation des deux faits que l'ADR 0041 a posée. " +
      "⚠️ LA PROSE QUI DISAIT LE CONTRAIRE A ÉTÉ CORRIGÉE DU MÊME GESTE : le port était " +
      "documenté « elle n'est appelée QUE quand `profilActif` rend `null` : un chemin de " +
      "panne, pas le chemin normal ». Cette phrase est devenue fausse le jour où le plafond " +
      "du § 14 s'est refusé à l'étape 7, et une prose qui survit à sa règle est ce qui fait " +
      "supprimer la garde suivante. ⚠️ CE N'EST PAS UN CACHE : il meurt avec l'appel. Un " +
      "cache inter-appels servirait un `enabled` périmé après une bascule de console — " +
      "exactement la divergence que la correction 3 existe pour fermer.",
  },

  // ── ADR 0047 ───────────────────────────────────────────────────────────────
  {
    adr: "0047",
    decision:
      "§ 15 — une panne de JOIGNABILITÉ de l'adaptateur est refusée à l'étape 14 sous " +
      "`upstream_unavailable`, reconnue au CODE SYSTÈME et jamais au message.",
    etat: "à-coudre",
    symbole: "estAmontInjoignable",
    genre: "fonction",
    module: "core/chaine/orchestrateur.ts",
    mesureeAilleurs: "core/__tests__/integration.spec.ts",
    assertion: {
      fichier: "core/__tests__/integration.spec.ts",
      nom: "un adaptateur injoignable est REFUSÉ à l'étape 14, et le code est celui du § 15",
      nomme: ["CODE_AMONT_INJOIGNABLE", "ECONNREFUSED"],
    },
    motif:
      "⚠️ 0 APPELANT EXTERNE, ET C'EST STRUCTUREL : la fonction est définie et appelée dans " +
      "`orchestrateur.ts`, et G1 ne compte jamais le définisseur. La preuve vit dans " +
      "l'ASSERTION (ADR 0041), qui traverse le chemin COMPLET — une `Error` levée par " +
      "l'adaptateur jusqu'à la ligne d'`ops_audit`. ⚠️ CE QUE CETTE ENTRÉE FERME : " +
      "`upstream_unavailable` est l'un des TREIZE codes du tableau du § 15, et il n'avait " +
      "AUCUN site d'émission de production — mesuré sur 139 modules émis par le build, " +
      "modules de déclaration écartés. Toute panne d'un tiers sortait donc en " +
      '`decision: "interrompu"`, c\'est-à-dire rangée parmi les défauts DU SOCLE au § 24. ' +
      "⚠️ NI L'IDEMPOTENCE NI L'INTENTION NE CHANGENT : `issueDeReservation()` ne lit que " +
      "le cliquet de l'ADR 0017 et `terminaisonRendue`, tous deux inchangés. Un envoi PARTI " +
      "reste fermé en `done` — ce refus nomme la panne, il ne rouvre aucun rejeu.",
  },
  {
    adr: "0047",
    decision:
      "`enAttenteDeBranchement` est DÉRIVÉ des deux côtés, pour les QUINZE codes de " +
      "l'union, sous DEUX formes d'émission : le littéral et l'ancrage d'`APPEL_STEPS`.",
    etat: "à-coudre",
    symbole: "chercherLesSitesDEmission",
    genre: "fonction",
    module: "ops/codes-hors-tableau.ts",
    mesureeAilleurs: "ops/codes-hors-tableau.spec.ts",
    assertion: {
      fichier: "ops/codes-hors-tableau.spec.ts",
      nom: "compte les DEUX formes, et la forme ancrée en trouve que le littéral rate",
      nomme: ["chercherLesSitesDEmission", "sansProducteur"],
    },
    motif:
      "0 appelant de production MESURÉ : c'est une garde de cohérence entre le code et le " +
      "document, et la chaîne d'appel ne lit que `ERROR_CODES`. ⚠️ CE QU'ELLE REMPLACE : un " +
      "champ `enAttenteDeBranchement: boolean` ÉCRIT À LA MAIN sur les deux seuls écarts au " +
      "§ 15. Il ne pouvait donc rien dire des TREIZE codes DU tableau — et c'est là que " +
      "dormait `upstream_unavailable`. Un booléen recopié se relit comme une mesure alors " +
      "qu'il n'est qu'une affirmation. ⚠️ LA FORME ANCRÉE N'EST PAS UN CONFORT : mesuré, le " +
      "littéral seul laisse SIX codes sans producteur — `cursor_invalid`, " +
      "`provenance_denied`, `result_too_large`, `scope_insufficient`, `tool_disabled`, " +
      "`tool_not_in_profile` — que la chaîne prononce tous les jours en LISANT leur " +
      "ancrage. Un `grep` ne prouve que l'absence de la FORME ÉCRITE. ⚠️ LA BORNE, ÉCRITE " +
      "AVEC LA RÈGLE : elle mesure des FORMES sur le source, jamais une branche exécutée.",
  },
  // ═══════════════════════════════════════════════════════════════════════════
  //  ADR 0048 — LA GARDE DES ASSERTIONS ATTAQUÉE, ET LE CLIQUET D'IDENTITÉ
  //
  //  ⚠️ CES TROIS ENTRÉES FERMENT DES BRÈCHES DE G4 ELLE-MÊME. Une garde posée
  //     pour interdire qu'une décision soit fermée par un test qui ne rougit
  //     jamais pouvait être fermée exactement de cette façon-là. Leurs
  //     assertions sont les tests QUI ONT OUVERT les brèches, écrits par
  //     l'épreuve du lot 4 en `it.fails`, vus ROUGES en `it()`, puis retirés de
  //     la dette par la recette.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    adr: "0048",
    decision:
      "Un `expect(` dont l'argument ne confronte que des littéraux ne ferme aucune " +
      "décision : `expect(1).toBe(1)` compte pour un `expect(` et il est vert quoi " +
      "qu'il arrive. Un corps qui n'en porte AUCUN de falsifiable est une anomalie.",
    etat: "à-coudre",
    symbole: "argumentsDExpect",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts",
    assertion: {
      fichier: "core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts",
      nom: "G4 rougit sur un test dont l'assertion ne peut pas échouer",
      nomme: ["verifierLesAssertions", "anomalies"],
    },
    motif:
      "0 appelant de PRODUCTION mesuré, et c'est l'état définitif : son unique appelant est " +
      "`verifierLesAssertions`, qui est elle-même une garde. ⚠️ LE DÉFAUT FERMÉ EST CELUI DE " +
      "LA GARDE QUI LE FERME. G4 refusait déjà le cas ZÉRO — un corps sans `expect(` — et " +
      "laissait grand ouvert le cas voisin, qui a exactement la même conséquence et l'air " +
      "d'une mesure. ⚠️ LE SEUIL EST « AU MOINS UN », JAMAIS « TOUS » : un test légitime mêle " +
      "des planchers à des comparaisons de constantes, et exiger que chaque `expect(` soit " +
      "falsifiable rejetterait des gardes correctes — la garde rougirait alors pour la raison " +
      "du voisin. ⚠️ LA BORNE : l'argument est lu dans `corps.code`, chaînes BLANCHIES ; un " +
      '`expect("abc")` y devient `expect()`.',
  },
  {
    adr: "0048",
    decision:
      "Un test enfermé dans une suite SUSPENDUE — `describe.skip`, `.todo` ou " +
      "`.only` posé plus haut — ne ferme aucune décision : le lanceur ne l'exécute pas.",
    etat: "à-coudre",
    symbole: "suiteSuspendue",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts",
    assertion: {
      fichier: "core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts",
      nom: "G4 rougit sur un test enfermé dans un describe.skip",
      nomme: ["verifierLesAssertions", "anomalies"],
    },
    motif:
      "0 appelant de PRODUCTION mesuré, même régime que ses voisines de `verifier.ts`. " +
      "⚠️ UNE GARDE QUI MORD SUR UNE FORME ET PAS SUR SON ÉQUIVALENT SE CONTOURNE SANS QUE " +
      "PERSONNE L'AIT DÉCIDÉ : G4 mordait sur `it.skip` — par EFFET DE BORD, le test n'y " +
      "étant plus trouvé sous sa forme exacte — et pas sur la MÊME suspension posée d'un " +
      "cran au-dessus, où la déclaration reste intacte dans le texte. ⚠️ `.only` EST REFUSÉ " +
      "AVEC LES DEUX AUTRES, et il est pire : il n'éteint pas le test qu'il porte, il éteint " +
      "TOUS LES AUTRES du fichier. ⚠️ LA BORNE, MESURÉE : la garde lit la forme ÉCRITE. Un " +
      "fichier écarté par la configuration du lanceur lui échappe, et aucune garde du dépôt " +
      "n'interdit ces formes dans un `*.spec.ts` — 0 fichier sur 323 en porte une au " +
      "2026-09-01 : la porte est ouverte, elle n'est pas empruntée.",
  },
  {
    adr: "0048",
    decision:
      "Le cliquet des décisions sans assertion porte sur leur IDENTITÉ, jamais sur " +
      "leur somme : une somme se compense, une identité entrante se nomme.",
    etat: "à-coudre",
    symbole: "identiteDeLEntree",
    genre: "fonction",
    module: "core/coutures/verifier.ts",
    mesureeAilleurs: "core/coutures/registre.spec.ts",
    assertion: {
      fichier: "core/coutures/registre.spec.ts",
      nom: "tient le CLIQUET D'IDENTITÉ des décisions sans assertion, que le total ne peut pas porter",
      nomme: ["sansAssertionNommees", "assertionsPartagees"],
    },
    motif:
      "0 appelant de PRODUCTION mesuré ; `verifierLesAssertions` seule l'appelle. ⚠️ LE " +
      "DÉFAUT CENTRAL DU LOT RENTRAIT PAR LA PORTE QUE LE LOT AVAIT POSÉE : inscrire une " +
      "décision aveugle (+1) et poser une assertion sur une entrée ancienne (−1) laissait " +
      "`sansAssertion` à 88, les anomalies à zéro et `cousuesNonAtterries` immobile. " +
      "⚠️ AUCUN CORRECTIF NE POUVAIT SAUVER LE TOTAL, ET C'EST POURQUOI ON EN CHANGE : " +
      "`sansAssertion` vaut `entrées − avecAssertion`, une SOUSTRACTION, incapable de " +
      "distinguer un échange d'un ajout. Les deux mesures cohabitent — le total reste " +
      "annoncé, la liste porte la règle. ⚠️ LA LISTE FIGÉE DE 88 IDENTITÉS EST LE SEUL CAS " +
      "OÙ CE DÉPÔT ADMET QU'UNE GARDE PORTE SA LISTE : un cliquet n'est pas une règle, c'est " +
      "un ÉTAT DATÉ dont on interdit l'aggravation, et il est produit par la garde elle-même.",
  },
  {
    adr: "0049",
    decision:
      "La voie vocale A est retenue ; les valeurs que Claude exige pour se connecter sont " +
      "posées comme une TABLE confrontée à la documentation d'Anthropic, jamais déduites.",
    etat: "à-coudre",
    symbole: "motifDeRefusDUnRappelNatif",
    genre: "fonction",
    module: "core/auth/surfaces-claude.ts",
    mesureeAilleurs: null,
    assertion: {
      fichier: "core/auth/surfaces-claude.spec.ts",
      nom: "REFUSE les sept témoins fabriqués, chacun pour un motif distinct",
      nomme: ["motifDeRefusDUnRappelNatif", "RAPPELS_DECLARES_PAR_CLAUDE_CODE"],
    },
    motif:
      "⚠️ ENTRÉE PARTICULIÈRE, ET C'EST ASSUMÉ : ce module ne compte AUCUN importateur de " +
      "production. L'ADR 0049 POSE les valeurs, le lot suivant les CÂBLE. C'est exactement le " +
      "cas que l'axe « assertion » de l'ADR 0041 a créé — elle porte donc le nom d'un test qui " +
      "rougit si la décision dérive, plutôt qu'un appelant qui n'existe pas encore. Sept " +
      "témoins de rappel refusés, chacun pour un motif DISTINCT, dont " +
      "« http://localhost.attaquant.test/callback » — un sous-domaine tiers qu'une comparaison " +
      "sur la chaîne brute laisserait passer. Le port, lui, est IGNORÉ : Claude Code écoute " +
      "sur un port éphémère et déclare ses rappels sans port.",
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
