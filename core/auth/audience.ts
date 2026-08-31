/**
 * `core/auth/audience.ts` — **LA FORME DE L'AUDIENCE, CONFRONTÉE, ET LE VERDICT
 * DE L'ÉTAPE 3.**
 *
 * ═══ CE QUE CE FICHIER EST, ET POURQUOI IL N'EST PAS `ressource.ts` ═══
 *
 * `core/auth/ressource.ts` porte la DONNÉE de l'ADR 0026 — les cinq contraintes,
 * écrites séparément, et le mot de la comparaison. Il n'exporte aucune fonction,
 * et son en-tête dit pourquoi : « la validation appartient au constructeur de
 * l'étage 3 ». Ce fichier-ci est cette validation.
 *
 * Elle vit ici plutôt que dans `ops/demarrage/` pour une raison qui se mesure :
 * **l'émetteur en a besoin AUSSI**. `octroyer()` écrit `ops_token.audience`, et
 * une audience mal formée écrite en base est une colonne qui ne sera jamais
 * réécrite (ADR 0026, conséquences acceptées). Deux appelants, une dérivation :
 * l'étage 3 refuse le démarrage, l'émetteur refuse l'octroi, et les deux lisent
 * la MÊME table de contraintes.
 *
 * ═══ POURQUOI CINQ FONCTIONS ET PAS UNE EXPRESSION RÉGULIÈRE ═══
 *
 * L'ADR 0026 l'écrit : « une expression régulière unique aurait rendu conforme
 * ou non conforme sans dire laquelle des cinq a mordu, et l'étage 3 REFUSE LE
 * DÉMARRAGE ». Un message qui ne nomme pas la contrainte violée envoie chercher
 * au mauvais endroit (§ 25).
 *
 * ⚠️ **LA TOTALITÉ EST TENUE PAR LE COMPILATEUR, PAS PAR UNE LISTE.**
 *    {@link CONTROLES} est annoté `Readonly<Record<CleDeContrainteDAudience, …>>` :
 *    une SIXIÈME contrainte ajoutée à `CONTRAINTES_DE_L_AUDIENCE` **ne compile
 *    pas** tant qu'elle n'a pas son contrôle ici. C'est le motif de
 *    `SCOPE_EXIGE_PAR_EFFET` (`core/chaine/etape-05-scopes.ts`), appliqué à
 *    l'endroit où l'oubli serait muet.
 *
 * ⚠️ **L'ANALYSE EST LEXICALE, ET C'EST UNE DÉCISION.** Aucun `new URL()` n'est
 *    écrit ici. `URL` NORMALISE — il ajoute une barre finale à une origine nue,
 *    il abaisse la casse de l'hôte, il ré-encode le chemin — c'est-à-dire qu'il
 *    fait exactement ce que l'ADR 0026 interdit à l'étape 3 : rendre équivalentes
 *    deux chaînes distinctes. Une garde qui validerait la valeur NORMALISÉE
 *    accepterait une valeur que la comparaison exacte refusera ensuite, et le
 *    démarrage serait vert pour une audience qui ne vaut pour aucun jeton.
 */

import type { CleDeContrainteDAudience } from "./ressource.js";
import { CONTRAINTES_DE_L_AUDIENCE, VARIABLE_DE_L_AUDIENCE } from "./ressource.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA CONFRONTATION REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE VERDICT DE FORME. **Des nombres et des noms, jamais une couleur seule.**
 *
 * ⚠️ `contraintesConfrontees` N'EST PAS DÉCORATIF. Une confrontation qui en
 *    mesurerait zéro serait verte pour la pire des raisons — le mode de
 *    défaillance qu'`ops/secrets.ts` documente déjà. C'est ce compte que les
 *    tests lisent, et le plancher est `CONTRAINTES_DE_L_AUDIENCE.length`.
 */
export interface VerdictDeFormeDAudience {
  /** Combien des cinq contraintes ont RÉELLEMENT été évaluées. */
  readonly contraintesConfrontees: number;
  /** Les clés violées, dans l'ordre de la table. Jamais un booléen seul. */
  readonly violees: readonly CleDeContrainteDAudience[];
  /** Les messages, prêts pour la sortie d'erreur de l'étage 3 (§ 25). */
  readonly anomalies: readonly string[];
  /** DÉRIVÉ de {@link VerdictDeFormeDAudience.violees}, jamais posé à part. */
  readonly conforme: boolean;
}

/** Un contrôle : il rend `null` quand la contrainte est tenue, un motif sinon. */
type Controle = (valeur: string) => string | null;

// ═════════════════════════════════════════════════════════════════════════════
//  LES CINQ CONTRÔLES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les hôtes sur lesquels `http` reste admis (ADR 0026).
 *
 * ⚠️ **CETTE LISTE EST LA CONTREPARTIE D'UN CRITÈRE DE RECETTE, PAS UNE
 *    COMMODITÉ.** Le § 23 range le local en environnement à part entière, et le
 *    critère de ce lot est que le socle DÉMARRE EN LOCAL avec des valeurs
 *    factices. Exiger TLS partout rendrait la seule configuration démarrable
 *    impossible à écrire — et la première chose que ferait quelqu'un serait de
 *    désactiver la contrainte entière, pas de poser un certificat.
 *
 * ⚠️ ET ELLE EST FERMÉE : trois hôtes, aucun joker. `localhost.attaquant.test`
 *    n'est pas `localhost` — c'est pourquoi le contrôle compare l'hôte EXTRAIT,
 *    et non un préfixe de la chaîne.
 */
export const HOTES_DE_BOUCLAGE = ["localhost", "127.0.0.1", "[::1]"] as const;

/** L'autorité (`hôte[:port]`) d'une URL absolue, ou `null` si la forme échappe. */
export function autoriteDe(valeur: string): string | null {
  const separateur = valeur.indexOf("://");
  if (separateur < 0) return null;
  const apres = valeur.slice(separateur + 3);
  const fin = apres.search(/[/?#]/);
  const autorite = fin < 0 ? apres : apres.slice(0, fin);
  return autorite.length === 0 ? null : autorite;
}

/**
 * Le CHEMIN d'une URL absolue — ce qui suit l'autorité, coupé au premier `?` ou
 * `#`. Rend `""` quand il n'y en a pas.
 *
 * ⚠️ IL COUPE À LA REQUÊTE ET AU FRAGMENT DÉLIBÉRÉMENT. Sans cela, une valeur
 *    portant `?v=1` violerait DEUX contraintes — « aucune requête » et « aucune
 *    barre finale » si la requête finit par `/` —, et le témoin qui doit violer
 *    la première SEULE n'existerait pas. Un témoin qui viole deux règles ne
 *    prouve ni l'une ni l'autre.
 */
export function cheminDe(valeur: string): string {
  const separateur = valeur.indexOf("://");
  if (separateur < 0) return "";
  const apres = valeur.slice(separateur + 3);
  const debut = apres.search(/[/?#]/);
  if (debut < 0 || apres[debut] !== "/") return "";
  const reste = apres.slice(debut);
  const fin = reste.search(/[?#]/);
  return fin < 0 ? reste : reste.slice(0, fin);
}

/**
 * UN CONTRÔLE PAR CONTRAINTE, ET LA TOTALITÉ TENUE PAR LE COMPILATEUR.
 *
 * L'annotation `Readonly<Record<CleDeContrainteDAudience, Controle>>` est une
 * TOTALITÉ : une clé ajoutée à `CONTRAINTES_DE_L_AUDIENCE` sans contrôle ici ne
 * compile pas, et une clé écrite ici qui n'existe pas dans la table non plus.
 * C'est ce qui empêche une sixième contrainte d'être écrite en prose et de
 * n'être jamais évaluée.
 */
const CONTROLES: Readonly<Record<CleDeContrainteDAudience, Controle>> = {
  schéma: (valeur) => {
    if (valeur.startsWith("https://")) return null;
    if (!valeur.startsWith("http://")) {
      return "le schéma n'est ni `https` ni `http` — l'audience est une URL absolue de ressource";
    }
    const autorite = autoriteDe(valeur);
    if (autorite === null) return "schéma `http` sans hôte lisible";
    const hote = autorite.replace(/:\d+$/u, "");
    if ((HOTES_DE_BOUCLAGE as readonly string[]).includes(hote)) return null;
    return (
      "`http` n'est admis que sur une adresse de bouclage (" +
      HOTES_DE_BOUCLAGE.join(", ") +
      ") ; hors du poste de travail, l'audience exige `https`"
    );
  },
  "aucune requête": (valeur) =>
    valeur.includes("?")
      ? "l'audience porte une requête (`?`) : deux URL qui ne diffèrent que par l'ordre de " +
        "leurs paramètres sont la même ressource pour un humain et deux audiences pour une " +
        "comparaison exacte"
      : null,
  "aucun fragment": (valeur) =>
    valeur.includes("#")
      ? "l'audience porte un fragment (`#`) : un fragment n'est JAMAIS transmis au serveur, " +
        "donc cette audience ne serait jamais celle que la ressource peut confronter"
      : null,
  "aucune barre finale": (valeur) =>
    valeur.endsWith("/")
      ? "l'audience se termine par une barre : c'est la variante d'écriture qui produit deux " +
        "valeurs pour une seule intention, et la comparaison de l'étape 3 est EXACTE"
      : null,
  "chemin non vide": (valeur) => {
    const chemin = cheminDe(valeur);
    return chemin.length <= 1
      ? "l'audience n'a pas de chemin : réduite à l'origine, elle désignerait le socle entier — " +
          "console et émetteur compris — alors que le jeton du connecteur ne doit valoir que " +
          "pour la ressource MCP"
      : null;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFRONTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CONFRONTE UNE VALEUR AUX CINQ CONTRAINTES, ET DIT LAQUELLE A MORDU.
 *
 * ⚠️ **ELLE NE S'ARRÊTE PAS À LA PREMIÈRE.** Un arrêt anticipé ferait réparer
 *    une valeur en trois redémarrages là où un seul message suffit — et il
 *    rendrait `contraintesConfrontees` variable, donc inutilisable comme
 *    plancher : le compte deviendrait « combien de contrôles avant l'échec »
 *    au lieu de « combien de contrôles existent ».
 *
 * ⚠️ **AUCUN MESSAGE NE RECOPIE LA VALEUR.** Une audience n'est pas un secret,
 *    mais elle porte le domaine du socle, et le § 15 veut qu'une erreur dise
 *    quoi faire sans faire fuir ce qu'elle a lu. Les messages nomment la
 *    CONTRAINTE et la VARIABLE, jamais le contenu.
 */
export function verifierLaFormeDeLAudience(valeur: string): VerdictDeFormeDAudience {
  const violees: CleDeContrainteDAudience[] = [];
  const anomalies: string[] = [];
  let contraintesConfrontees = 0;

  // La boucle parcourt LA TABLE, jamais une liste écrite ici : une contrainte
  // retirée de `ressource.ts` cesse d'être évaluée, et le compte le dit.
  for (const contrainte of CONTRAINTES_DE_L_AUDIENCE) {
    contraintesConfrontees += 1;
    const motif = CONTROLES[contrainte.cle](valeur);
    if (motif === null) continue;
    violees.push(contrainte.cle);
    anomalies.push(
      `${VARIABLE_DE_L_AUDIENCE} — contrainte « ${contrainte.cle} » violée : ${motif}.`,
    );
  }

  return {
    contraintesConfrontees,
    violees,
    anomalies,
    conforme: violees.length === 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'ÉTAPE 3 FAIT DE CETTE VALEUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les causes de refus d'une audience présentée. Nommées SÉPARÉMENT parce que le
 * § 24 doit pouvoir les compter séparément : « aucune audience » est un client
 * mal configuré, « une autre audience » est un jeton qui vient d'ailleurs, et
 * les deux appellent des gestes opposés.
 */
export const CAUSES_DE_REFUS_DAUDIENCE = [
  "audience-absente",
  "audiences-multiples",
  "audience-etrangere",
] as const;

export type CauseDeRefusDAudience = (typeof CAUSES_DE_REFUS_DAUDIENCE)[number];

/** Le verdict de la comparaison de l'étape 3. */
export interface VerdictDAudiencePresentee {
  /** Combien d'indicateurs de ressource le jeton portait. */
  readonly indicateursRecus: number;
  readonly admise: boolean;
  /** `null` quand elle est admise. */
  readonly cause: CauseDeRefusDAudience | null;
  readonly motif: string;
}

/**
 * **LA COMPARAISON DE L'ÉTAPE 3 — ÉGALITÉ EXACTE, ET UN SEUL INDICATEUR.**
 *
 * ⚠️ **UN JETON SANS AUDIENCE EST REFUSÉ ; UN JETON À AUDIENCES MULTIPLES
 *    AUSSI.** La RFC 8707 permet plusieurs indicateurs ; le socle n'en admet
 *    qu'un en v1. Le motif est écrit à l'ADR 0026 : une audience multiple oblige
 *    l'étape 3 à décider « l'une suffit-elle ? », et la réponse permissive est
 *    celle qu'on écrit sans y penser. Ici, elle n'a pas d'endroit où s'écrire.
 *
 * ⚠️ **AUCUNE NORMALISATION, PAS MÊME LA CASSE DE L'HÔTE.** Chaque règle
 *    ajoutée pour être accommodant est une paire de valeurs distinctes rendues
 *    équivalentes, et l'étape 3 n'existe que pour dire qu'elles ne le sont pas.
 */
export function comparerLAudienceDuJeton(
  presentees: readonly string[],
  attendue: string,
): VerdictDAudiencePresentee {
  const indicateursRecus = presentees.length;

  if (indicateursRecus === 0) {
    return {
      indicateursRecus,
      admise: false,
      cause: "audience-absente",
      motif:
        "le jeton ne porte aucun indicateur de ressource (RFC 8707). Redemander un jeton en " +
        `précisant la ressource dans \`resource\` — la valeur attendue est celle de ${VARIABLE_DE_L_AUDIENCE}.`,
    };
  }

  if (indicateursRecus > 1) {
    return {
      indicateursRecus,
      admise: false,
      cause: "audiences-multiples",
      motif:
        `le jeton porte ${String(indicateursRecus)} indicateurs de ressource ; le socle n'en ` +
        "admet qu'UN en v1. Demander un jeton par ressource.",
    };
  }

  const presentee = presentees[0];
  if (presentee !== attendue) {
    return {
      indicateursRecus,
      admise: false,
      cause: "audience-etrangere",
      // ⚠️ NI L'UNE NI L'AUTRE DES DEUX VALEURS N'EST RECOPIÉE. Un message qui
      //    rendrait l'audience ATTENDUE dirait à un appelant non authentifié
      //    quelle valeur demander — c'est-à-dire lui donnerait la moitié du
      //    travail. Il nomme la variable ; c'est l'exploitant qui la lit.
      motif:
        "le jeton a été émis pour une AUTRE ressource : l'étape 3 compare par égalité exacte, " +
        `et la valeur attendue est celle de ${VARIABLE_DE_L_AUDIENCE}. Réémettre pour cette ` +
        "ressource — un jeton émis pour une autre ne vaut pas ici, et la comparaison ne " +
        "s'assouplit pas.",
    };
  }

  return {
    indicateursRecus,
    admise: true,
    cause: null,
    motif: "audience conforme.",
  };
}
