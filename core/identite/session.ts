/**
 * `core/identite/session.ts` — LA SOUVERAINETÉ DU `sessionId` (§ 11, § 19, § 20).
 *
 * ⚠️ CE FICHIER EST LE SEUL À FRAPPER DES SESSIONS. Le lot 1c a posé ses
 *    déclarations ; le constructeur ① y a écrit les fabriques, DANS CE FICHIER
 *    et nulle part ailleurs. Voir **ADR 0014**.
 *
 *    Ce qui le tient n'est pas cette phrase : c'est la garde G2 de
 *    `core/chaine/identite.spec.ts`, qui lit le GRAPHE D'IMPORTS du dépôt,
 *    annonce combien de fichiers elle a parcourus et combien d'importateurs elle
 *    a trouvés, et refuse à tout module LIVRÉ hors de ce dossier d'en importer
 *    une VALEUR s'il ne figure pas dans {@link FRAPPEURS_DE_SESSION}.
 *
 * ═══ CE QUE CE FICHIER FERME, ET CE QUE ÇA COÛTAIT DE NE PAS LE FERMER ═══
 *
 * Toute la garde d'exfiltration du § 20 s'ancre sur UNE clé : `sessionId`. C'est
 * elle que `IndexProvenanceMemoire` marque quand un résultat `personal` ou
 * `sensitive` traverse le socle, et c'est elle que l'étape 11 interroge à
 * l'appel suivant.
 *
 * À la fin du lot 1b, rien ne la contraignait. Le `principal` d'`identiteStdio()`
 * est IMPOSÉ — son commentaire dit pourquoi : « un poste local qui choisirait
 * son principal pourrait se faire passer pour un jeton HTTP dans `ops_audit` ».
 * Le `sessionId`, juste à côté, était un paramètre ordinaire.
 *
 * L'épreuve adverse du lot 1b l'a MESURÉ, sur le pire cas — argument de
 * gouvernance, argument libre, autre domaine, c'est-à-dire la branche que le
 * § 20 dit inconditionnelle :
 *
 *     verdict même session      : refusé
 *     verdict session renouvelée : AUTORISÉ
 *
 * L'attaque tient en une phrase : **un appelant qui renouvelle son `sessionId`
 * entre la lecture et l'appel suivant annule l'étape 11 en entier.** L'index
 * reste peuplé, la marque reste vivante, elle est simplement cherchée au mauvais
 * endroit. Aucun compte ne bouge, aucune garde ne rougit : c'est le pire état
 * possible d'une protection.
 *
 * ═══ LA RÈGLE, EN UNE PHRASE ═══
 *
 * **Le `sessionId` est ÉTABLI PAR LE SOCLE et n'est JAMAIS accepté du client.**
 *
 * Il n'entre par aucun chemin que l'appelant contrôle :
 *
 *  · pas par `input` — le contrôle 7 du § 09 le refuse DÉJÀ, et par dérivation :
 *    `core/adapter-kit/autorisation.ts` lit les propriétés de `ToolContext` dans
 *    le SOURCE de `core/types.ts`, et `sessionId` en est une. Rien à ajouter
 *    là-bas ; c'est la seule moitié du verrou qui tenait déjà ;
 *  · pas par `AppelEntrant` — l'appel brut ne porte ni `effect`, ni `dataClass`,
 *    ni `policyLevel`, ni habilitation, et le `sessionId` rejoint cette liste
 *    pour le même motif : ce sont des décisions du socle, pas des valeurs de la
 *    charge utile ;
 *  · pas par un paramètre de transport — c'est ce que ce fichier ferme.
 *
 * ═══ D'OÙ IL VIENT, PAR TRANSPORT ═══
 *
 * · **HTTP** — de la ligne `ops_token` relue à l'ÉTAPE 4 (« `jti` non révoqué »),
 *   qui est déjà lue à cet instant : la session ne coûte aucune lecture de plus.
 *   La valeur est frappée par le serveur d'autorisation (§ 19.1) **à l'octroi**,
 *   et propagée à chaque jeton d'accès né de la même chaîne de rafraîchissement.
 *
 *   ⚠️ **ELLE N'EST PAS DÉRIVÉE DU `jti`, ET C'EST MESURÉ, PAS PRÉFÉRÉ.** Le
 *      § 19.1 donne au jeton d'accès **une heure** et au rafraîchissement 30 jours
 *      rotatifs : un `jti` change donc au moins toutes les heures. Le marquage de
 *      provenance, lui, vit `TTL_MARQUAGE_MS` = **quatre heures**. Une session
 *      dérivée du `jti` s'effacerait donc trois fois par TTL — et le
 *      rafraîchissement est une opération que le client MCP conduit tout seul,
 *      sans geste humain. Ce serait rendre au client, par la petite porte, le
 *      renouvellement de session que ce fichier lui retire. La session suit
 *      l'OCTROI, pas le jeton.
 *
 * · **stdio** — UNE par exécution du démon, frappée au démarrage du processus,
 *   exactement comme `PRINCIPAL_STDIO` est imposé. Elle n'est ni un
 *   paramètre, ni une variable d'environnement : un poste local qui choisirait
 *   sa session pourrait rejouer le renouvellement ci-dessus depuis sa propre
 *   ligne de commande.
 *
 * ═══ POURQUOI UN TYPE MARQUÉ, ET PAS UN CONTRÔLE AU RUNTIME ═══
 *
 * Le motif est celui de `core/profiles/` (§ 14) : « un profil inconnu devient
 * une ERREUR DE COMPILATION chez l'adaptateur ». Un contrôle au runtime arrive
 * trop tard — au moment où le transport est écrit, câblé et déployé. Ici, un
 * transport qui essaie de passer une chaîne venue du réseau ne compile pas.
 */

// L'UNIQUE import de VALEUR de ce fichier, et c'est voulu : ce module ne dépend
// d'aucun autre module du socle. Une session doit pouvoir être frappée avant que
// quoi que ce soit d'autre ne soit monté — c'est exactement le cas du démon
// stdio, qui frappe la sienne au démarrage du processus.
import { randomBytes } from "node:crypto";

// ═════════════════════════════════════════════════════════════════════════════
//  LE TYPE MARQUÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * La marque. `declare const` : elle n'existe qu'à la compilation, et le symbole
 * n'est PAS exporté — aucun autre module ne peut nommer la propriété, donc
 * aucun ne peut écrire un littéral d'objet assignable à {@link SessionId}.
 */
declare const MARQUE_SESSION_DE_PILOTAGE: unique symbol;

/**
 * UNE SESSION DE PILOTAGE (§ 11) — jamais une session d'authentification : le
 * socle n'en tient aucune, le jeton porte les droits.
 *
 * C'est une chaîne au runtime — elle voyage dans `ops_audit.sessionId`, une
 * colonne `String` — et un type INCONSTRUCTIBLE à la compilation hors des
 * fabriques ci-dessous.
 *
 * ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : `"…" as unknown as SessionId` reste
 *    écrivable, comme toute conversion forcée en TypeScript. Ce que le type
 *    garantit n'est pas l'impossibilité, c'est que **le chemin honnête ne passe
 *    plus par une chaîne** : plus aucun transport n'a de raison d'en écrire une,
 *    donc toute occurrence devient une anomalie visible. La garde qui la voit
 *    est décrite à l'ADR 0014, et elle dérive du graphe d'imports plutôt que
 *    d'un motif de texte — un `grep` ne prouve que l'absence de la forme écrite.
 */
export type SessionId = string & {
  readonly [MARQUE_SESSION_DE_PILOTAGE]: "session de pilotage (§ 11)";
};

// ═════════════════════════════════════════════════════════════════════════════
//  LA FORME
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Longueur en octets de l'aléa d'une session. 32 octets = 256 bits : le même
 * ordre de grandeur que les empreintes du journal, et hors de portée d'une
 * énumération. Une session devinable serait une marque de provenance qu'on peut
 * s'attribuer — donc, à l'inverse exact du défaut ci-dessus, une exfiltration
 * qu'on peut faire porter à quelqu'un d'autre.
 */
export const OCTETS_SESSION_ID = 32;

/**
 * La FORME admise : 64 caractères hexadécimaux minuscules.
 *
 * ⚠️ POURQUOI CETTE FORME-LÀ, ET PAS UN IDENTIFIANT LISIBLE. `core/audit/contenu.ts`
 *    refuse, à l'écriture, toute colonne du journal qui ressemble à du contenu
 *    (§ 31). Un `sessionId` lisible — « session de Will, 31 août » — serait
 *    refusé par cette garde, ou pire, l'affaiblirait si on l'assouplissait pour
 *    lui. Une forme d'empreinte ne dit rien de personne.
 *
 * ⚠️ ELLE EST ANCRÉE AUX DEUX BOUTS. Un motif non ancré ne contraint qu'une
 *    sous-chaîne — c'est exactement ce que `patternReferme()` refuse aux
 *    adaptateurs à l'étape 11, et le socle ne s'accorde pas ce qu'il leur refuse.
 */
export const FORME_SESSION_ID = /^[0-9a-f]{64}$/;

// ═════════════════════════════════════════════════════════════════════════════
//  L'ERREUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une valeur qui prétend être un `sessionId` et qui n'en est pas un.
 *
 * ⚠️ ELLE NE PORTE JAMAIS LA VALEUR FAUTIVE. Ce qui arrive ici vient, dans le
 *    cas HTTP, d'une colonne de base ; dans le cas d'un défaut de câblage, d'une
 *    charge utile. Les deux peuvent porter du contenu, et le § 15 interdit
 *    qu'une erreur le fasse fuir. Elle porte la LONGUEUR et rien d'autre : c'est
 *    ce qui distingue « la colonne est vide » de « la colonne porte autre chose ».
 */
export class ErreurSessionIdNonSouverain extends Error {
  /** Longueur de la valeur refusée. Jamais la valeur. */
  public readonly longueur: number;

  public constructor(origine: string, longueur: number) {
    super(
      `§ 20 — session de pilotage refusée : ${origine} a rendu une valeur de ` +
        `${String(longueur)} caractère(s) qui n'a pas la forme d'un identifiant de session. ` +
        "Le `sessionId` est établi par le socle et n'est jamais accepté d'un appelant.",
    );
    this.name = "ErreurSessionIdNonSouverain";
    this.longueur = longueur;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA FABRIQUE — LE SEUL CHEMIN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS SEULES FAÇONS D'OBTENIR UN {@link SessionId}.
 *
 * ⚠️ CETTE INTERFACE EST UN CONTRAT, PAS UN SERVICE À INJECTER PARTOUT. Elle est
 *    montée UNE FOIS à la racine de composition, et deux appelants seulement la
 *    reçoivent : le transport HTTP et le démon stdio. Un module qui la demande
 *    en dépendance demande le droit de frapper des sessions — c'est-à-dire de
 *    contourner le § 20 — et cela doit se voir dans sa signature.
 */
export interface FabriqueSessionId {
  /**
   * § 19.1 — FRAPPÉE À L'OCTROI, par le serveur d'autorisation. C'est la valeur
   * que `ops_token.sessionId` porte, et qui se propage à chaque jeton d'accès né
   * de la même chaîne de rafraîchissement.
   *
   * Un NOUVEL octroi — un nouveau consentement, donc un geste humain — ouvre une
   * nouvelle session. C'est le seul chemin de renouvellement, et il n'est pas
   * gratuit : c'est exactement ce qu'on veut.
   */
  pourUnOctroi(): SessionId;

  /**
   * Le transport stdio — UNE session par EXÉCUTION du démon.
   *
   * ⚠️ ELLE EST FRAPPÉE AU DÉMARRAGE, PAS À L'APPEL. Une session par appel
   *    rendrait l'index de provenance inutile : chaque appel arriverait sur une
   *    session propre, et l'étape 11 laisserait tout passer en restant verte.
   */
  pourCetteExecutionDuDemon(): SessionId;

  /**
   * RELECTURE d'une valeur déjà frappée — la ligne `ops_token` relue à l'étape 4.
   *
   * ⚠️ C'EST LA SEULE PORTE, ET ELLE EST ÉTROITE À DESSEIN. Une session doit bien
   *    pouvoir revenir d'une colonne de base : sans cette fonction, le transport
   *    HTTP devrait écrire une conversion forcée, et la garde de l'ADR 0014
   *    n'aurait plus rien à distinguer. Elle vérifie {@link FORME_SESSION_ID} et
   *    LÈVE {@link ErreurSessionIdNonSouverain} sinon — jamais de repli sur une
   *    session frappée à la volée, qui rendrait une base corrompue silencieuse.
   *
   * @param origine ce qui a fourni la valeur (`"ops_token.sessionId"`), pour que
   *        le message dise OÙ regarder. Jamais la valeur elle-même.
   */
  relireDepuisLeSocle(valeur: string, origine: string): SessionId;
}

/**
 * LES APPELANTS ADMIS DE {@link FabriqueSessionId.relireDepuisLeSocle}.
 *
 * ⚠️ POURQUOI UNE LISTE NOMMÉE, ET LE MÊME CLIQUET QUE LE CONTRÔLE 3 DU § 09.
 *    Le § 09 exige, pour les appels qui contournent la couche service, « une
 *    liste nommée des symboles autorisés, versionnée avec l'adaptateur, qui
 *    échoue quand une entrée ne correspond plus à aucun symbole exporté ». La
 *    relecture d'une session est de la même famille : c'est le seul endroit du
 *    socle où une chaîne devient une session, donc le seul endroit où le § 20
 *    peut être désarmé par erreur.
 *
 *    La garde qui lit cette liste est décrite à l'ADR 0014 : elle dérive des
 *    IMPORTS RÉELS, annonce le nombre de fichiers parcourus, et rougit aussi
 *    bien sur un appelant de trop que sur une entrée devenue morte.
 *
 * ⚠️ LES DEUX CHEMINS DE CETTE LISTE N'EXISTENT PAS ENCORE : `core/transport/`
 *    est le lot suivant. Une entrée qui ne désigne aucun fichier est donc
 *    ATTENDUE aujourd'hui et deviendra une anomalie le jour où le transport
 *    atterrit — c'est le sens du cliquet, et c'est écrit ici pour que personne
 *    ne « répare » la liste en la vidant.
 */
export const APPELANTS_DE_LA_RELECTURE = [
  "core/transport/http.ts",
  "core/transport/stdio.ts",
] as const;

/**
 * L'ÉTAPE DU § 11 QUI FOURNIT LA SESSION EN HTTP.
 *
 * Le numéro n'est pas décoratif : il dit que la session est connue AVANT
 * l'étape 5, donc avant que la moindre décision d'autorisation ne soit prise, et
 * qu'aucune étape ultérieure n'a à la reconstituer. Il est écrit ici plutôt que
 * dans une phrase, pour que la garde de l'ADR 0014 puisse le confronter à
 * `APPEL_STEPS` — la valeur est celle de l'étape « révocation » (`jti` non
 * révoqué), qui relit déjà `ops_token`.
 */
export const CLE_ETAPE_SOURCE_DE_SESSION = "revocation";

/**
 * LES MODULES QUI SHIPPENT ET QUI ONT LE DROIT DE **FRAPPER** UNE SESSION.
 *
 * ⚠️ CETTE LISTE N'EST PAS {@link APPELANTS_DE_LA_RELECTURE}, ET LES CONFONDRE
 *    SERAIT PERDRE LA MOITIÉ DE LA GARDE. Frapper et relire sont deux pouvoirs
 *    différents :
 *
 *     · **relire** ne crée rien — elle valide une valeur qui vient déjà du
 *       socle. C'est le geste du transport HTTP à l'étape 4 ;
 *     · **frapper** crée une session ex nihilo. C'est le geste du serveur
 *       d'autorisation à l'octroi, et celui du démon stdio à son démarrage.
 *
 *    Un module qui peut frapper peut S'OUVRIR UNE SESSION PROPRE à volonté,
 *    c'est-à-dire refaire exactement le défaut mesuré au lot 1b. La liste des
 *    frappeurs est donc PLUS COURTE que celle des relecteurs, jamais l'inverse.
 *
 * ⚠️ POURQUOI `core/chaine/identite.ts` EN FAIT PARTIE, ET PAS `orchestrateur.ts`.
 *    La session stdio est frappée UNE FOIS, au chargement du module, comme
 *    `PRINCIPAL_STDIO` est une constante. Il fallait donc un module qui n'ait
 *    aucune autre raison d'exister — pour que ce pouvoir se voie dans le graphe
 *    d'imports plutôt que de se perdre dans les 1 900 lignes de l'orchestrateur.
 *
 * ⚠️ LES SPECS N'Y FIGURENT PAS, ET N'ONT PAS À Y FIGURER. Le critère n'est pas
 *    « c'est un test », c'est « ce fichier est-il LIVRÉ ? ». La garde le DÉRIVE
 *    de l'`exclude` de `tsconfig.build.json` plutôt que de le supposer d'un
 *    suffixe : un fichier qui ne shippe pas ne peut ouvrir aucune session à
 *    personne, et le jour où la liste d'exclusion change, la garde change avec.
 *
 * ⚠️ MÊME CLIQUET QUE LA LISTE VOISINE : les deux chemins `core/transport/`
 *    n'existent pas encore (lot suivant). Une entrée qui ne désigne aucun
 *    fichier est ATTENDUE aujourd'hui — ne « répare » personne cette liste en la
 *    vidant.
 */
export const FRAPPEURS_DE_SESSION = [
  "core/chaine/identite.ts",
  "core/transport/http.ts",
  "core/transport/stdio.ts",
] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  L'IMPLÉMENTATION — LE SEUL ENDROIT DU SOCLE OÙ UNE CHAÎNE DEVIENT UNE SESSION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Frappe UNE session. 32 octets d'aléa cryptographique, rendus en hexadécimal
 * minuscule — donc exactement 64 caractères, la forme que
 * {@link FORME_SESSION_ID} exige.
 *
 * ⚠️ LA CONVERSION FORCÉE CI-DESSOUS EST LA SEULE DU MODULE PROPRIÉTAIRE, ET
 *    C'EST ELLE QUE TOUT LE RESTE DU FICHIER PROTÈGE. Elle est écrite une fois,
 *    ici, sur une valeur que ce module vient de produire lui-même — jamais sur
 *    une valeur reçue. La garde G3 de l'ADR 0014 refuse la même forme partout
 *    ailleurs dans `core/`.
 */
function frapperUneSession(): SessionId {
  return randomBytes(OCTETS_SESSION_ID).toString("hex") as SessionId;
}

/**
 * MONTE LA FABRIQUE. Appelée UNE FOIS à la racine de composition.
 *
 * ⚠️ CE QUE CETTE IMPLÉMENTATION NE DISTINGUE PAS, ET IL FAUT L'ÉCRIRE.
 *    `pourUnOctroi()` et `pourCetteExecutionDuDemon()` produisent les mêmes
 *    octets : rien, dans la valeur rendue, ne dit d'où elle vient. Ce qui les
 *    sépare est le RYTHME de leur appel — une fois par consentement humain d'un
 *    côté, une fois par processus de l'autre — et ce rythme est une propriété de
 *    l'APPELANT, pas de la fabrique.
 *
 *    Deux méthodes plutôt qu'une, donc, parce qu'un appel mal placé doit se voir
 *    dans le graphe d'imports et se lire dans une revue. Aucune garde ne peut le
 *    déduire de la valeur ; c'est {@link FRAPPEURS_DE_SESSION} qui porte cette
 *    partie-là, et elle la porte en surveillant QUI appelle, pas QUOI est rendu.
 */
export function creerFabriqueSessionId(): FabriqueSessionId {
  return {
    pourUnOctroi(): SessionId {
      return frapperUneSession();
    },

    pourCetteExecutionDuDemon(): SessionId {
      return frapperUneSession();
    },

    relireDepuisLeSocle(valeur: string, origine: string): SessionId {
      // Aucun repli, aucune session frappée à la volée : une colonne corrompue
      // doit s'entendre. La lever ici coûte un appel refusé ; la rattraper
      // coûterait une garde du § 20 qui cherche la marque au mauvais endroit,
      // et personne ne le verrait.
      if (!FORME_SESSION_ID.test(valeur)) {
        throw new ErreurSessionIdNonSouverain(origine, valeur.length);
      }
      return valeur as SessionId;
    },
  };
}
