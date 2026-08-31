/**
 * `core/transport/stdio/cadrage.ts` — **OÙ FINIT UN MESSAGE, ET CE QU'ON FAIT
 * DE CE QUI N'EN EST PAS UN.**
 *
 * ═══ POURQUOI LE CADRAGE EST UN MODULE À LUI SEUL ═══
 *
 * Le § 11 pose « JSON-RPC 2.0 » et donne au transport HTTP son enveloppe
 * (`POST /api/mcp`). En stdio, il n'y a **aucune enveloppe** : deux flux
 * d'octets, et rien qui dise où un message s'arrête. Ce fichier est cette
 * réponse-là, et **rien d'autre** — il ne connaît ni méthode JSON-RPC, ni étape
 * du § 11, ni outil. Il rend des valeurs, pas des décisions.
 *
 * Le séparer tient à une règle de l'ADR 0025 lue à l'envers : l'étape 1 du
 * transport HTTP s'exécute « AVANT l'analyse syntaxique du corps », parce qu'un
 * analyseur JSON est une surface d'attaque. Le transport stdio n'a **pas**
 * d'étape 1 — il ne reçoit aucun `Host` —, si bien que son analyseur est la
 * PREMIÈRE chose que l'octet entrant rencontre. Ce qui protège l'analyseur en
 * HTTP n'existe pas ici ; ce qui reste est le cadrage, et il doit donc être le
 * morceau le plus petit et le plus éprouvé du transport.
 *
 * ═══ LA FORME RETENUE, ET LES DEUX QU'ELLE ÉCARTE ═══
 *
 * **Un message JSON par ligne, terminé par `\n`.** C'est ce que le fil stdio de
 * MCP emploie, et les deux autres formes plausibles sont écartées nommément :
 *
 *  · **un en-tête `Content-Length` à la LSP** — il fait dépendre le cadrage
 *    d'un nombre écrit par l'appelant. Un `Content-Length` menteur désynchronise
 *    le flux, et la resynchronisation demande alors de deviner ; ici, le
 *    délimiteur est un caractère que l'appelant ne peut pas produire à
 *    l'intérieur d'un message, puisque `JSON.stringify` échappe tout saut de
 *    ligne. Le cadrage ne repose sur AUCUNE valeur choisie par l'appelant ;
 *  · **un flux JSON concaténé, analysé au fur et à mesure** — il n'a pas de
 *    point de reprise : un octet fautif emporte tout ce qui suit.
 *
 * ═══ ⚠️ LA BORNE EST EN CARACTÈRES, PAS EN OCTETS, ET C'EST ÉCRIT ═══
 *
 * {@link CARACTERES_MAX_PAR_LIGNE} borne le tampon en **unités de code UTF-16**,
 * parce que ce module reçoit des CHAÎNES déjà décodées : c'est ce qu'il tient en
 * mémoire, donc c'est ce qu'il doit borner. Le plafond en octets qui en découle
 * est jusqu'à **quatre fois** plus haut — un caractère hors du plan de base coûte
 * quatre octets en UTF-8. Lire cette borne comme « au plus un mébioctet » serait
 * se tromper d'un facteur quatre. Le décodage, lui, appartient à l'appelant :
 * c'est lui qui tient le flux, et c'est là que la borne en octets doit se poser
 * si on la veut — voir les écarts du lot.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LES BORNES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le plafond d'une ligne, en unités de code UTF-16.
 *
 * ⚠️ **UN TAMPON SANS PLAFOND EST UNE PANNE DE MÉMOIRE À UN SEUL CARACTÈRE
 *    PRÈS.** Un appelant qui n'envoie jamais de `\n` fait croître le tampon sans
 *    fin, et le processus meurt sans avoir servi un seul appel — donc sans
 *    qu'aucune ligne d'`ops_audit` ne dise pourquoi. C'est le mode de
 *    défaillance que ce nombre existe pour fermer.
 *
 * La valeur est celle du plus gros message plausible du § 13.3 avec une marge :
 * `maxBytes` d'un outil est de l'ordre du kibioctet, un `tools/list` complet de
 * quelques dizaines. Un mébicaractère laisse trois ordres de grandeur.
 */
export const CARACTERES_MAX_PAR_LIGNE = 1_048_576;

/**
 * Le délimiteur. Il n'est **pas** un réglage : `JSON.stringify` échappe tout
 * saut de ligne d'une chaîne, si bien qu'un message sérialisé n'en contient
 * jamais. C'est la propriété qui rend ce cadrage insensible au contenu.
 */
const DELIMITEUR = "\n";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE DÉCOUPEUR REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE FAÇONS DONT UNE LIGNE N'EST PAS UN MESSAGE. Union FERMÉE : un
 * `switch` exhaustif la couvre, et un cinquième cas ne peut pas se glisser sans
 * qu'un appelant cesse de compiler.
 *
 * ⚠️ **CHACUNE EST COMPTÉE SÉPARÉMENT, ET C'EST UNE DÉCISION.** Un compteur
 *    unique de « lignes rejetées » ne distingue pas un client mal écrit (du
 *    JSON illisible, en rafale) d'un client qui essaie la taille du tampon.
 *    Les deux appellent des gestes opposés — corriger un client, ou couper une
 *    instance (§ 30) — et un seul nombre les confondrait.
 */
export const CLES_DE_REBUT = [
  /** La ligne a dépassé {@link CARACTERES_MAX_PAR_LIGNE} avant son délimiteur. */
  "ligne-trop-longue",
  /** `JSON.parse` a levé. */
  "json-illisible",
  /**
   * La ligne porte un TABLEAU. Le lot JSON-RPC est refusé : la révision 2025-06-18
   * de MCP l'a retiré, et le § 11 ne sert qu'une primitive. Le refuser
   * explicitement vaut mieux que d'en servir le premier élément — servir la
   * moitié d'un lot est la façon la plus discrète de perdre un appel.
   */
  "lot-refuse",
  /** La ligne porte une valeur qui n'est pas un objet — `null`, un nombre, une chaîne. */
  "enveloppe-non-objet",
] as const;

/** Une des quatre façons dont une ligne n'est pas un message. */
export type CleDeRebut = (typeof CLES_DE_REBUT)[number];

/**
 * Une ligne écartée. Elle porte sa TAILLE, jamais son contenu.
 *
 * ⚠️ **AUCUN EXTRAIT NE SORT D'ICI, ET C'EST LE § 31.** Une ligne illisible est
 *    exactement ce qu'on a le plus envie de recopier dans un journal pour
 *    comprendre — et c'est exactement ce que le § 31 refuse : elle peut porter
 *    n'importe quoi, y compris un secret qu'un client a mal placé. La taille et
 *    la cause suffisent à diagnostiquer ; le contenu ne sert qu'à fuir.
 */
export interface Rebut {
  readonly genre: "rebut";
  readonly cle: CleDeRebut;
  /** Longueur de la ligne écartée, en unités de code UTF-16. */
  readonly caracteres: number;
}

/** Une ligne qui a livré un objet JSON. Son interprétation appartient ailleurs. */
export interface MessageRecu {
  readonly genre: "message";
  /**
   * L'objet analysé, sans prototype hérité de l'analyseur : `JSON.parse` rend un
   * objet ordinaire, et ce module ne le transforme pas. Ce qu'il en est d'une
   * clé `__proto__` est une question du consommateur, pas du cadrage.
   */
  readonly valeur: Record<string, unknown>;
  readonly caracteres: number;
}

/** Ce qu'une ligne produit : un message, ou la raison pour laquelle elle n'en est pas un. */
export type Cadre = MessageRecu | Rebut;

/**
 * LES COMPTES DU DÉCOUPEUR — des NOMBRES, jamais une couleur.
 *
 * Ils existent pour que « ce transport n'a rien reçu » et « ce transport reçoit
 * du rebut en rafale » cessent d'être le même silence.
 */
export interface MesuresDuCadrage {
  /** Lignes délimitées vues, rebuts compris. */
  readonly lignesVues: number;
  /** Messages livrés au consommateur. */
  readonly messagesLivres: number;
  /** Rebuts, par cause. La totalité est tenue par le compilateur. */
  readonly rebuts: Readonly<Record<CleDeRebut, number>>;
  /** Caractères en attente d'un délimiteur, à cet instant. */
  readonly caracteresEnAttente: number;
  /** Vrai quand le découpeur jette tout jusqu'au prochain délimiteur. */
  readonly enResynchronisation: boolean;
}

/** Le découpeur d'un flux. Il a un ÉTAT — le tampon —, d'où l'objet. */
export interface Decoupeur {
  /** Absorbe un morceau de flux et rend les cadres COMPLETS qu'il termine. */
  absorber(morceau: string): readonly Cadre[];
  mesures(): MesuresDuCadrage;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOUPEUR
// ═════════════════════════════════════════════════════════════════════════════

function rebutsAZero(): Record<CleDeRebut, number> {
  const compteurs = {} as Record<CleDeRebut, number>;
  for (const cle of CLES_DE_REBUT) compteurs[cle] = 0;
  return compteurs;
}

/**
 * Analyse UNE ligne déjà délimitée.
 *
 * Elle est séparée du tampon pour une raison de garde : le témoin peut
 * l'exercer sur les quatre causes sans jamais fabriquer de flux, et le tampon
 * peut être éprouvé sur la resynchronisation sans dépendre de l'analyseur.
 */
export function analyserUneLigne(ligne: string): Cadre {
  const caracteres = ligne.length;
  let valeur: unknown;
  try {
    valeur = JSON.parse(ligne);
  } catch {
    return { genre: "rebut", cle: "json-illisible", caracteres };
  }
  // L'ordre compte : un tableau EST un objet en JavaScript, et le confondre
  // avec une enveloppe ferait servir un lot par sa première clé.
  if (Array.isArray(valeur)) return { genre: "rebut", cle: "lot-refuse", caracteres };
  if (typeof valeur !== "object" || valeur === null) {
    return { genre: "rebut", cle: "enveloppe-non-objet", caracteres };
  }
  return { genre: "message", valeur: valeur as Record<string, unknown>, caracteres };
}

/**
 * Monte un découpeur.
 *
 * ⚠️ **LA RESYNCHRONISATION EST LE POINT DÉLICAT, ET ELLE EST EXPLICITE.**
 *    Quand une ligne dépasse le plafond, on ne peut pas se contenter de vider le
 *    tampon : la SUITE de cette ligne arriverait au morceau d'après et serait
 *    lue comme un début de message. Un attaquant obtiendrait ainsi de faire
 *    analyser un fragment qu'il aura choisi, à l'octet près, en préfixant sa
 *    charge d'un mébicaractère de bourrage. Le découpeur entre donc dans un état
 *    où il JETTE tout jusqu'au prochain délimiteur, et cet état est ANNONCÉ dans
 *    les mesures — un découpeur bloqué en resynchronisation qui ne livre plus
 *    rien doit se voir, plutôt que de ressembler à un client silencieux.
 *
 * @param caracteresMax facultatif au sens de la VALEUR : l'absence vaut
 *        {@link CARACTERES_MAX_PAR_LIGNE}. Le témoin s'en sert pour éprouver la
 *        borne sur quelques dizaines de caractères plutôt que sur un mébicaractère.
 */
export function creerDecoupeur(caracteresMax: number = CARACTERES_MAX_PAR_LIGNE): Decoupeur {
  let tampon = "";
  let enResynchronisation = false;
  let lignesVues = 0;
  let messagesLivres = 0;
  const rebuts = rebutsAZero();

  const compter = (cadre: Cadre): void => {
    lignesVues += 1;
    if (cadre.genre === "message") messagesLivres += 1;
    else rebuts[cadre.cle] += 1;
  };

  return {
    absorber(morceau: string): readonly Cadre[] {
      const cadres: Cadre[] = [];
      let reste = morceau;

      while (reste.length > 0) {
        const rang = reste.indexOf(DELIMITEUR);

        if (enResynchronisation) {
          // On jette jusqu'au prochain délimiteur, celui-ci compris.
          if (rang === -1) return cadres;
          reste = reste.slice(rang + 1);
          enResynchronisation = false;
          continue;
        }

        if (rang === -1) {
          tampon += reste;
          if (tampon.length > caracteresMax) {
            const trop: Cadre = {
              genre: "rebut",
              cle: "ligne-trop-longue",
              caracteres: tampon.length,
            };
            compter(trop);
            cadres.push(trop);
            tampon = "";
            enResynchronisation = true;
          }
          return cadres;
        }

        const ligne = tampon + reste.slice(0, rang);
        tampon = "";
        reste = reste.slice(rang + 1);

        if (ligne.length > caracteresMax) {
          const trop: Cadre = {
            genre: "rebut",
            cle: "ligne-trop-longue",
            caracteres: ligne.length,
          };
          compter(trop);
          cadres.push(trop);
          continue;
        }

        // Une ligne vide n'est ni un message ni une faute : c'est du remplissage
        // que tout flux de lignes produit (`\n\n`, fin de fichier). On ne la
        // compte pas comme vue — la compter gonflerait `lignesVues` d'un bruit
        // que personne n'a envoyé, et le plancher-témoin des gardes s'en
        // trouverait faux.
        const nue = ligne.endsWith("\r") ? ligne.slice(0, -1) : ligne;
        if (nue.trim().length === 0) continue;

        const cadre = analyserUneLigne(nue);
        compter(cadre);
        cadres.push(cadre);
      }

      return cadres;
    },

    mesures(): MesuresDuCadrage {
      return {
        lignesVues,
        messagesLivres,
        rebuts: { ...rebuts },
        caracteresEnAttente: tampon.length,
        enResynchronisation,
      };
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA SORTIE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Lève quand une valeur ne peut pas être écrite sur une ligne.
 *
 * ⚠️ **ELLE NE PORTE NI LA VALEUR NI SON EXTRAIT.** Le message d'une erreur du
 *    socle est lu par des yeux et par des journaux (§ 15, § 31) : y recopier ce
 *    qu'on n'a pas su sérialiser reviendrait à faire sortir par le canal
 *    d'erreur ce que le canal normal a refusé.
 */
export class ErreurDeSerialisationStdio extends Error {
  constructor(readonly motif: "cycle-ou-valeur-non-json" | "saut-de-ligne-dans-la-sortie") {
    super(
      `Le socle n'a pas pu écrire une réponse sur le fil stdio (${motif}). ` +
        "Aucune réponse n'a été émise pour cet identifiant ; le client doit considérer " +
        "l'appel comme sans réponse et non comme refusé.",
    );
    this.name = "ErreurDeSerialisationStdio";
  }
}

/**
 * Sérialise une valeur en UNE ligne, délimiteur compris.
 *
 * ⚠️ **LE CONTRÔLE DU SAUT DE LIGNE N'EST PAS DE LA PARANOÏA, C'EST LA PREUVE
 *    DU CADRAGE.** Tout ce fichier repose sur une propriété de `JSON.stringify` :
 *    un saut de ligne à l'intérieur d'une chaîne en ressort échappé. Si cette
 *    propriété tombait — un sérialiseur remplacé, une valeur porteuse d'un
 *    `toJSON` bavard —, le cadrage se briserait EN SILENCE : le lecteur d'en
 *    face verrait deux messages là où le socle en a écrit un, et le second
 *    serait du contenu choisi par un adaptateur. On le vérifie donc, une fois,
 *    à l'endroit unique par lequel toute sortie passe.
 */
export function serialiser(valeur: unknown): string {
  let texte: string;
  try {
    texte = JSON.stringify(valeur);
  } catch {
    throw new ErreurDeSerialisationStdio("cycle-ou-valeur-non-json");
  }
  // `JSON.stringify` rend `undefined` pour une fonction ou un `undefined` nu.
  if (typeof texte !== "string") throw new ErreurDeSerialisationStdio("cycle-ou-valeur-non-json");
  if (texte.includes("\n") || texte.includes("\r")) {
    throw new ErreurDeSerialisationStdio("saut-de-ligne-dans-la-sortie");
  }
  return texte + DELIMITEUR;
}
