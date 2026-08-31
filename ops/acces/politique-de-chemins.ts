/**
 * `ops/acces/politique-de-chemins.ts` — **LA POLITIQUE D'ACCÈS, CHEMIN PAR CHEMIN.**
 *
 * ═══ LE DÉFAUT BLOQUANT N° 14, ET POURQUOI IL EST DANS LE DÉPÔT ═══
 *
 * Le § 16 le pose en toutes lettres : mis devant `/api/mcp`, Cloudflare Access
 * **n'ajoute pas une serrure, il empêche OAuth de commencer** — un client MCP
 * n'a pas de navigateur pour franchir une page de connexion, et la découverte
 * servie sous `/.well-known/` doit être joignable sans authentification par
 * construction.
 *
 * La pose réelle appartient à Will, dans une interface qui n'est pas ce dépôt.
 * Ce que le dépôt peut faire — et fait ici — est de porter la **forme attendue**
 * sous contrôle de version, pour qu'un écart entre le code servi et la porte
 * posée soit une différence LISIBLE plutôt qu'une supposition.
 *
 * ⚠️ **CE FICHIER NE PROUVE PAS QUE LA PORTE EST POSÉE, ET NE PEUT PAS LE
 *    PROUVER.** Il ne fait aucun appel réseau, il n'interroge aucune API. Une
 *    garde qui lirait ce fichier et se déclarerait satisfaite transformerait un
 *    périmètre d'observation en garantie. Ce qu'une garde peut tenir, et ce
 *    qu'elle doit tenir, est écrit plus bas.
 *
 * Voir **ADR 0028**.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LES TROIS RÉGIMES
// ═════════════════════════════════════════════════════════════════════════════

export const REGIMES_D_ACCES = [
  /**
   * **Bypass.** Access laisse passer sans page de connexion. Réservé à ce qui
   * doit être joignable par une machine sans navigateur ET qui ne porte aucune
   * capacité : la découverte, et elle seule.
   */
  "bypass",
  /**
   * **Derrière Access.** Une page de connexion, franchie par un humain avec un
   * navigateur. C'est la serrure du § 16 — et elle ne vaut que là où un humain
   * est de toute façon présent.
   */
  "access",
  /**
   * **Hors Access.** Aucune page de connexion : le chemin est protégé par OAuth
   * et le pare-feu. Ce n'est PAS « non protégé » — c'est « protégé par autre
   * chose », et le motif de chaque entrée dit par quoi.
   */
  "hors-access",
] as const;

export type RegimeDAcces = (typeof REGIMES_D_ACCES)[number];

/**
 * Jusqu'où une entrée porte. Deux valeurs, et aucune troisième : un motif plus
 * riche demanderait un analyseur, donc une seconde façon de comprendre un
 * chemin — et c'est la seconde qui diverge de la règle réellement posée.
 */
export const PORTEES_DE_CHEMIN = ["préfixe", "exact"] as const;

export type PorteeDeChemin = (typeof PORTEES_DE_CHEMIN)[number];

/** Une famille de chemins, et le régime qu'elle attend. */
export interface EntreeDePolitiqueDAcces {
  /**
   * Le chemin, ÉCRIT SANS JOKER.
   *
   * ⚠️ **LE JOKER N'EST PAS DANS LA DONNÉE, ET C'EST DÉLIBÉRÉ — POUR DEUX
   *    RAISONS, DONT UNE MESURÉE.**
   *
   *  1. La garde confronte des chemins RÉELLEMENT SERVIS à ces entrées. Un
   *     joker l'obligerait à interpréter une syntaxe de motif ; {@link couvre}
   *     dit la même chose sans analyseur, donc sans divergence possible entre
   *     ce que la garde comprend et ce qu'une règle Access applique.
   *  2. **Une barre oblique suivie d'une étoile, à l'intérieur d'une chaîne,
   *     ouvre un commentaire de bloc pour `sansProse` (`core/coutures/verifier.ts`)
   *     — la garde de couture de l'ADR 0019 devient alors AVEUGLE sur tout ce
   *     qui suit, jusqu'au prochain marqueur de fin de commentaire.** C'est un
   *     défaut de cette garde, pas une propriété de ce fichier ; il est nommé
   *     ici parce que c'est ici qu'on aurait rouvert le trou sans le savoir.
   *
   * La forme JOKER reste celle de la règle Access elle-même : elle est écrite
   * dans l'ADR 0028, où elle ne traverse aucun analyseur.
   */
  readonly chemin: string;
  /** `préfixe` — tout ce qui commence par `chemin`. `exact` — ce chemin seul. */
  readonly couvre: PorteeDeChemin;
  readonly regime: RegimeDAcces;
  /** Pourquoi ce régime-là. Obligatoire : sans motif, une entrée est un réglage. */
  readonly motif: string;
  /**
   * **CE QUI CASSE SI LE RÉGIME EST AUTRE.** Écrit pour chaque entrée, parce que
   * c'est la seule moitié qui se vérifie : un régime se justifie mal, une panne
   * se reconnaît.
   */
  readonly siOnSeTrompe: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA POLITIQUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **UN ÉCART ASSUMÉ AVEC LE § 16, ET IL EST SIGNALÉ PLUTÔT QUE RECOPIÉ.**
 *
 * Le § 16 écrit : « `/console/` et **les routes d'authentification** derrière
 * Access ». Appliqué tel quel, ce serait le défaut bloquant n° 14 **une seconde
 * fois, une porte plus loin** : `/auth/token` et `/auth/revoke` sont appelés par un programme,
 * sans navigateur, exactement comme `/api/mcp`. Les mettre derrière Access rend
 * l'échange du code contre un jeton impossible, et l'émetteur inutilisable.
 *
 * La coupure passe donc **à l'intérieur** des routes d'authentification, entre
 * ce qu'un humain atteint et ce qu'une machine atteint :
 *
 *  · `/auth/authorize` — un humain, un navigateur, une page de connexion. Access
 *    y ajoute une serrure et ne casse rien ;
 *  · `/auth/token`, `/auth/revoke` — une machine. Ils sont déjà liés à une
 *    interaction humaine PASSÉE par le `code` et le `code_verifier` de PKCE.
 *
 * Cet écart est une décision de l'ADR 0028, pas un oubli du § 16.
 */
export const POLITIQUE_DE_CHEMINS: readonly EntreeDePolitiqueDAcces[] = [
  {
    chemin: "/.well-known/",
    couvre: "préfixe",
    regime: "bypass",
    motif:
      "La découverte (RFC 8414, RFC 9728) doit être joignable sans authentification PAR " +
      "CONSTRUCTION : c'est elle qui dit au client où s'authentifier. Elle ne porte aucune " +
      "capacité — seulement des adresses et des algorithmes, tous publics par définition.",
    siOnSeTrompe:
      "Derrière Access, un client MCP ne peut même pas apprendre l'existence de l'émetteur : " +
      "il échoue AVANT d'avoir une page de connexion à franchir, et l'échec ne ressemble à " +
      "rien de reconnaissable.",
  },
  {
    chemin: "/console/",
    couvre: "préfixe",
    regime: "access",
    motif:
      "Huit écrans destinés à UN humain, depuis un téléphone (§ 21). Access y est la bonne " +
      "serrure : il y a toujours un navigateur, et l'arrêt d'urgence doit rester atteignable " +
      "même quand OAuth ne l'est plus.",
    siOnSeTrompe:
      "Hors Access, la console n'est plus protégée que par sa propre session — et le § 21 " +
      "range l'arrêt d'urgence DERRIÈRE ACCESS SEUL, sans `ops:admin` ni OAuth. Retirer " +
      "Access retirerait sa seule protection.",
  },
  {
    chemin: "/auth/authorize",
    couvre: "exact",
    regime: "access",
    motif:
      "C'est la page où un humain s'identifie. Un navigateur y est présent par construction, " +
      "donc Access ne casse rien — et il pose une seconde serrure devant l'endroit exact où " +
      "un consentement s'accorde.",
    siOnSeTrompe:
      "Hors Access, la page d'autorisation est atteignable par quiconque connaît l'adresse. " +
      "Elle reste protégée par la session de console, mais elle perd la couche qui filtre " +
      "AVANT que le socle n'exécute la moindre ligne.",
  },
  {
    chemin: "/auth/token",
    couvre: "exact",
    regime: "hors-access",
    motif:
      "Appelé par une MACHINE, sans navigateur. Protégé par PKCE — le `code_verifier` prouve " +
      "que l'appelant est celui qui a commencé l'échange — et par le pare-feu.",
    siOnSeTrompe:
      "Derrière Access, l'échange du code contre un jeton est IMPOSSIBLE : c'est le défaut " +
      "bloquant n° 14, une porte plus loin. L'émetteur devient inutilisable, et le symptôme " +
      "est une redirection vers une page de connexion que le client ne sait pas lire.",
  },
  {
    chemin: "/auth/revoke",
    couvre: "exact",
    regime: "hors-access",
    motif:
      "Même nature que `/auth/token` : une machine, un jeton présenté, aucun navigateur. Et " +
      "la révocation doit rester la plus facile des opérations — une serrure de plus devant " +
      "elle protège l'attaquant, pas le socle.",
    siOnSeTrompe:
      "Derrière Access, un client qui veut rendre son jeton ne le peut pas, et le jeton reste " +
      "valide jusqu'à son échéance.",
  },
  {
    chemin: "/api/mcp",
    couvre: "exact",
    regime: "hors-access",
    motif:
      "La ressource. Protégée par OAuth (étapes 2 à 4), par l'anti DNS-rebinding (étape 1) et " +
      "par le pare-feu. C'est le chemin que le § 16 nomme explicitement comme celui qu'Access " +
      "ne doit PAS garder.",
    siOnSeTrompe:
      "Derrière Access, aucun client MCP ne peut appeler le socle : OAuth ne commence jamais. " +
      "C'est le défaut bloquant n° 14 dans sa forme d'origine.",
  },
  {
    chemin: "/healthz",
    couvre: "exact",
    regime: "hors-access",
    motif:
      "Le healthcheck est lu par l'orchestrateur de conteneurs, qui n'a pas de navigateur et " +
      "ne porte aucune identité. Il ne rend qu'un statut et des COMPTES — jamais un contenu.",
    siOnSeTrompe:
      "Derrière Access, le healthcheck rend une page de connexion : le conteneur est déclaré " +
      "malsain en permanence, et le déploiement rougit pour une raison qui n'a rien à voir " +
      "avec la santé du socle.",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA GARDE DOIT TENIR — et ce qu'elle ne peut pas tenir
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA GARDE DÉRIVE DES CHEMINS SERVIS, PAS DE CETTE LISTE.**
 *
 * Une garde qui se contenterait de relire `POLITIQUE_DE_CHEMINS` serait verte le
 * jour où un chemin neuf est servi sans y être déclaré — c'est-à-dire le seul
 * jour où elle aurait quelque chose à dire. Le sens de lecture est donc l'autre :
 *
 *  1. **la source est l'ensemble des chemins que le socle SERT** — lu dans
 *     `core/transport/` et `core/auth/`, comme `verifierLeCablageDuDemarrage`
 *     lit ses appelants ;
 *  2. tout chemin servi qui n'est couvert par aucune entrée est une **anomalie** ;
 *  3. toute entrée qui ne couvre aucun chemin servi est une **anomalie** aussi —
 *     une règle Access posée devant rien est une règle qu'on croit active ;
 *  4. la garde **annonce les deux comptes** : chemins servis lus, entrées
 *     confrontées. Une garde qui lirait zéro chemin serait verte sans un mot.
 *
 * ⚠️ **ET LA BORNE, ÉCRITE AVEC LA MESURE.** Cette garde répond à « le dépôt
 *    est-il cohérent avec lui-même ? ». Elle ne répond PAS à « la porte est-elle
 *    posée chez Cloudflare ? », et aucune garde de ce dépôt ne le peut : il n'y
 *    a aucun appel réseau sortant ici. La vérification de la pose réelle est un
 *    geste de Will, et son résultat n'a pas d'endroit où vivre dans un dépôt
 *    public. Écrire « le risque est couvert par la garde » serait raisonner sur
 *    une fausse sécurité.
 */
export const PORTEE_DE_LA_GARDE_D_ACCES =
  "cohérence entre les chemins servis par le code et les régimes déclarés ici — " +
  "jamais la pose réelle de la porte";
