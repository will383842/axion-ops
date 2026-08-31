/**
 * `core/audit/verification.ts` — LE VÉRIFICATEUR D'INTÉGRITÉ.
 *
 * Il rend LE NOMBRE DE LIGNES VÉRIFIÉES, jamais un booléen seul. Un `true`
 * n'apprend rien : il vaut la même chose sur un journal intact de cent mille
 * lignes et sur un journal qu'on vient de vider. Le compte, lui, distingue les
 * deux — et c'est ce compte, pas la couleur, que les gardes lisent.
 *
 * ═══ CE QU'IL DÉTECTE, ET QUE LE MODÈLE VOISIN NE DÉTECTE PAS ═══
 *
 * `axionia/src/lib/knowledge/audit-log.ts:122` fait
 * `let prev = entries[0]!.prevHash` : il adopte le chaînon de la première ligne
 * qu'on lui présente. Retirer les mille premières lignes du journal ne casse
 * donc rien — le vérificateur repart de la 1001ᵉ, dont le `prevHash` colle à sa
 * propre lecture, et déclare la chaîne valide. Une TRONCATURE DE TÊTE passe
 * pour valide EN SILENCE, alors que c'est exactement la façon la plus simple
 * d'effacer le début d'une intrusion.
 *
 * Ici l'état initial vaut `null` — la vraie valeur du chaînon d'une origine de
 * journal — et un journal dont la première ligne porte une empreinte est en
 * défaut, SAUF si une ligne de clôture atteste la tranche manquante (§ 31).
 *
 * ═══ CE QU'IL NE PRÉTEND PAS FAIRE ═══
 *
 * Une chaîne d'empreintes prouve qu'on n'a rien MODIFIÉ ni RETIRÉ sans le
 * dire. Elle ne prouve rien contre qui peut AJOUTER : un compte disposant du
 * `INSERT` peut toujours prolonger la chaîne. La parade n'est pas ici, elle est
 * dans le rôle base de données en écriture seule (`REVOKE UPDATE, DELETE`),
 * que le voisin note lui-même comme un chantier V2.
 */

import { calculerSelfHash, ErreurCanonique } from "./canonique.js";
import type { ChargeCloture } from "./cloture.js";
import { decoderCharge, estLigneDeCloture } from "./cloture.js";
import type { ScelleurJournal } from "./ports.js";
import type { LigneAudit } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le rapport
// ═════════════════════════════════════════════════════════════════════════════

/** Les genres d'anomalie. Union fermée : la console en dérive son affichage. */
export const GENRES_ANOMALIE = [
  /** L'empreinte recalculée ne vaut pas celle qui est stockée : la ligne a bougé. */
  "empreinte-recalculée",
  /** Deux lignes ne se suivent pas en `seq` : la lecture n'était pas ordonnée. */
  "ordre-non-croissant",
  /** Le journal commence sur une empreinte, sans clôture pour l'attester. */
  "tête-non-ancrée",
  /** Un chaînon manque au milieu, sans clôture pour l'attester. */
  "saut-non-ancré",
  /** Une ligne de clôture dont la charge ne se décode pas : elle n'ancre rien. */
  "clôture-illisible",
  /** Une clôture dont l'empreinte attestée contredit son propre chaînon. */
  "clôture-incohérente",
  /**
   * Une clôture qui borne le bon trou par ses EMPREINTES, mais dont les `seq`
   * ne peuvent pas être ceux du trou observé. Le § 31 lui fait porter « le
   * compte de lignes retirées » : sans cette confrontation, ce compte est une
   * déclaration que rien ne contredit jamais.
   */
  "clôture-hors-du-trou",
  /** Une ligne dont les champs ne se sérialisent pas : empreinte incalculable. */
  "ligne-non-sérialisable",
] as const;

export type GenreAnomalie = (typeof GENRES_ANOMALIE)[number];

export interface AnomalieChaine {
  readonly genre: GenreAnomalie;
  /** `seq` de la ligne fautive, `null` quand l'anomalie porte sur l'origine. */
  readonly seq: bigint | null;
  readonly detail: string;
}

/**
 * Ce que rend la vérification. JAMAIS un booléen seul.
 *
 * `lignesVerifiees === 0` sur un journal supposé peuplé est le pire des verts :
 * l'appelant DOIT confronter ce compte à un plancher-témoin. C'est ce que fait
 * `verification.spec.ts`, et c'est ce que le critère de fini du lot 1 exige
 * (« la vérification annonce combien de lignes elle a vérifiées »).
 */
export interface RapportVerification {
  readonly lignesVerifiees: number;
  readonly journalVide: boolean;
  /** Lignes de clôture rencontrées dans la tranche. */
  readonly clotures: number;
  /** Sauts rencontrés ET ancrés par une clôture. */
  readonly sautsAncres: number;
  /**
   * Total de lignes disparues que les clôtures utilisées attestent, cumul
   * compris. C'est le seul chiffre qui dise ce que le journal a perdu.
   */
  readonly lignesRetireesAncrees: number;
  /**
   * Clôtures dont l'ancre n'a servi à aucun saut. Ce n'est pas une anomalie en
   * soi — sur une tranche, l'ancre peut couvrir un saut hors tranche — mais sur
   * un journal lu en entier, un cumul non nul veut dire qu'une purge a déclaré
   * une tranche qui est pourtant toujours là.
   */
  readonly ancresInutilisees: number;
  /**
   * Ancres ADMISES qui ne viennent pas de la tranche lue (`ancresConnues`).
   *
   * BORNE ASSUMÉE, et c'est pour cela qu'on la compte : une clôture lue DANS la
   * tranche est chaînée dans la chaîne qu'elle atteste — on ne peut pas l'y
   * glisser après coup sans casser un chaînon. Une clôture reçue de l'extérieur
   * n'a pas ce lien : elle est ré-admise (empreinte recalculée, chaînon propre
   * confronté à sa charge), mais RIEN ne prouve localement qu'elle vient du même
   * journal. Un rapport valide portant un compte non nul est un vert ADOSSÉ, pas
   * un vert autoportant, et l'appelant doit pouvoir faire la différence.
   */
  readonly ancresHorsTranche: number;
  readonly premiereSeq: bigint | null;
  readonly derniereSeq: bigint | null;
  /** Empreinte de la dernière ligne : à passer en `prevHashAttendu` pour lire la suite. */
  readonly derniereEmpreinte: string | null;
  readonly valide: boolean;
  readonly anomalies: readonly AnomalieChaine[];
}

/** Options de vérification. Toutes ont un défaut STRICT. */
export interface OptionsVerification {
  /**
   * L'empreinte attendue AVANT la première ligne de la tranche.
   *
   * DÉFAUT : `null` — c'est-à-dire « cette tranche commence à l'origine du
   * journal ». C'est le défaut strict, et c'est lui qui fait rougir une
   * troncature de tête. Ne passer une empreinte que si l'on vérifie une tranche
   * dont on a DÉJÀ vérifié celle d'avant.
   */
  readonly prevHashAttendu: string | null;
  /**
   * Clôtures LUES DANS UNE AUTRE TRANCHE. Une clôture vit à la POINTE du
   * journal alors que le saut qu'elle ancre est à sa TÊTE : sur un journal lu
   * par tranches, l'ancre arrive donc après le trou qu'elle justifie.
   *
   * ⚠️ On reçoit ici la LIGNE, jamais une charge déjà décodée. Une charge
   *    décodée court-circuiterait les deux contrôles d'admission — l'empreinte
   *    de la clôture doit se recalculer, et son `empreinteDerniereConservee`
   *    doit valoir son propre `prevHash` (témoin « clôture recopiée »). Mesuré :
   *    avec une charge décodée, une troncature de tête SANS aucune clôture était
   *    déclarée valide. Une ancre qu'on croit sur parole n'ancre rien.
   */
  readonly ancresConnues: readonly LigneAudit[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  La vérification
// ═════════════════════════════════════════════════════════════════════════════

interface Ancre {
  readonly charge: ChargeCloture;
  readonly seq: bigint;
  consommee: boolean;
}

/**
 * Admet — ou refuse — une ligne de clôture comme ancre.
 *
 * Trois conditions, et pas une de moins : la ligne se dit clôture, son empreinte
 * se RECALCULE (une clôture réécrite n'ancre rien), et la charge se décode en
 * attestant exactement son propre chaînon. C'est la seule porte d'entrée des
 * ancres, dans la tranche comme hors d'elle.
 */
function admettreAncre(scelleur: ScelleurJournal, ligne: LigneAudit): Ancre | null {
  if (!estLigneDeCloture(ligne)) return null;

  let recalculee: string;
  try {
    recalculee = calculerSelfHash(scelleur, ligne.prevHash, ligne);
  } catch {
    // Une clôture dont les champs ne se sérialisent pas n'ancre rien : la passe 1
    // le signale déjà par `ligne-non-sérialisable`.
    return null;
  }
  if (!scelleur.correspond(recalculee, ligne.selfHash)) return null;

  const charge = decoderCharge(ligne.partialSources);
  if (charge === null) return null;
  if (charge.empreinteDerniereConservee !== ligne.prevHash) return null;

  return { charge, seq: ligne.seq, consommee: false };
}

/**
 * L'ancre peut-elle CADRER le trou observé ?
 *
 * Les empreintes disent QUOI manque ; les `seq` disent OÙ. Deux bornes, toutes
 * deux dérivées de ce que la tranche montre — aucune liste, aucun réglage :
 *  · la dernière ligne retirée précède la première survivante ;
 *  · la première ligne retirée suit la dernière ligne conservée avant le trou,
 *    quand la tranche en montre une (à la TÊTE, il n'y a rien avant : le § 12
 *    ne garantit pas que `seq` commence à 1).
 */
function ancreCadreLeTrou(
  charge: ChargeCloture,
  precedenteSeq: bigint | undefined,
  seqSuivante: bigint,
): boolean {
  if (charge.seqJusqua >= seqSuivante) return false;
  if (precedenteSeq !== undefined && charge.seqDepuis <= precedenteSeq) return false;
  return true;
}

/**
 * Vérifie une tranche de journal, ORDONNÉE PAR `seq` CROISSANT.
 *
 * Deux passes, et l'ordre des deux compte :
 *
 *  1. INTÉGRITÉ PROPRE de chaque ligne — l'empreinte est recalculée à partir du
 *     `prevHash` que la ligne PORTE. Chaque ligne se vérifie donc seule, sans
 *     rien devoir à ses voisines. C'est cette passe qui rend les clôtures
 *     dignes de foi AVANT qu'on ne s'en serve à la passe 2 : une clôture dont
 *     l'empreinte ne se recalcule pas n'ancre rien.
 *  2. CHAÎNONS — chaque `prevHash` doit valoir le `selfHash` de la ligne
 *     précédente. Tout écart est un SAUT, et un saut n'est accepté que si une
 *     clôture le borne des deux côtés.
 *
 * ⚠️ Cette fonction NE TRIE PAS. Trier défensivement masquerait le défaut qu'il
 *    faut voir — un store qui rend ses lignes ordonnées par `at` (§ 12 :
 *    « ordonner par `seq`, JAMAIS par `at` »). L'ordre non croissant est signalé.
 */
export function verifierChaine(
  scelleur: ScelleurJournal,
  lignes: readonly LigneAudit[],
  options?: Partial<OptionsVerification>,
): RapportVerification {
  const anomalies: AnomalieChaine[] = [];
  const ancres: Ancre[] = [];
  let ancresHorsTranche = 0;

  // Les clôtures d'une AUTRE tranche passent par la MÊME admission que celles
  // de la tranche courante : même recalcul d'empreinte, même confrontation du
  // `empreinteDerniereConservee` au `prevHash`. Une ancre admise sur parole
  // rendrait vert un journal tronqué sans la moindre clôture.
  for (const ligne of options?.ancresConnues ?? []) {
    const admise = admettreAncre(scelleur, ligne);
    if (admise !== null) {
      ancres.push(admise);
      ancresHorsTranche += 1;
    }
  }

  // ── Passe 1 : intégrité propre, ordre, et collecte des ancres ──────────────
  let clotures = 0;

  for (const [index, ligne] of lignes.entries()) {
    const precedente = index > 0 ? lignes[index - 1] : undefined;
    if (precedente !== undefined && ligne.seq <= precedente.seq) {
      anomalies.push({
        genre: "ordre-non-croissant",
        seq: ligne.seq,
        detail:
          `seq ${ligne.seq.toString()} ne suit pas ${precedente.seq.toString()} — ` +
          `la lecture n'était pas ordonnée par seq (§ 12)`,
      });
    }

    let attendue: string | null = null;
    try {
      attendue = calculerSelfHash(scelleur, ligne.prevHash, ligne);
    } catch (erreur: unknown) {
      const motif = erreur instanceof ErreurCanonique ? erreur.message : "erreur inconnue";
      anomalies.push({ genre: "ligne-non-sérialisable", seq: ligne.seq, detail: motif });
    }

    const ligneIntegre = attendue !== null && scelleur.correspond(attendue, ligne.selfHash);

    if (attendue !== null && !ligneIntegre) {
      anomalies.push({
        genre: "empreinte-recalculée",
        seq: ligne.seq,
        detail:
          "l'empreinte recalculée ne vaut pas celle qui est stockée : la ligne a été modifiée",
      });
    }

    if (estLigneDeCloture(ligne)) {
      clotures += 1;
      const charge = decoderCharge(ligne.partialSources);
      if (charge === null) {
        anomalies.push({
          genre: "clôture-illisible",
          seq: ligne.seq,
          detail: "charge de clôture illisible : elle n'ancre aucun saut (§ 31)",
        });
      } else if (charge.empreinteDerniereConservee !== ligne.prevHash) {
        anomalies.push({
          genre: "clôture-incohérente",
          seq: ligne.seq,
          detail:
            "l'empreinte de la dernière ligne conservée qu'atteste la clôture " +
            "ne vaut pas son propre chaînon : clôture recopiée d'une autre purge",
        });
      } else {
        // L'admission passe par la MÊME porte que les ancres d'une autre
        // tranche : un seul chemin, donc un seul jeu de conditions à tenir.
        const admise = admettreAncre(scelleur, ligne);
        if (admise !== null) ancres.push(admise);
      }
    }
  }

  // ── Passe 2 : les chaînons ────────────────────────────────────────────────
  let attenduAvant: string | null = options?.prevHashAttendu ?? null;
  let sautsAncres = 0;
  let lignesRetireesAncrees = 0;

  for (const [index, ligne] of lignes.entries()) {
    if (ligne.prevHash !== attenduAvant) {
      const precedenteSeq = index > 0 ? lignes[index - 1]?.seq : undefined;
      const ancre = ancres.find(
        (candidate) =>
          !candidate.consommee &&
          candidate.charge.empreinteAvantSaut === attenduAvant &&
          candidate.charge.empreinteDerniereRetiree === ligne.prevHash,
      );

      if (ancre !== undefined && !ancreCadreLeTrou(ancre.charge, precedenteSeq, ligne.seq)) {
        // Les empreintes bornent bien le trou, mais les `seq` attestés ne
        // peuvent pas être ceux du trou observé : le compte de lignes retirées
        // du § 31 porterait alors sur une autre tranche que celle qui manque.
        ancre.consommee = true;
        anomalies.push({
          genre: "clôture-hors-du-trou",
          seq: ligne.seq,
          detail:
            `la clôture atteste la tranche seq ${ancre.charge.seqDepuis.toString()}` +
            `..${ancre.charge.seqJusqua.toString()}, qui ne peut pas être le trou ` +
            `observé avant seq ${ligne.seq.toString()}`,
        });
      } else if (ancre === undefined) {
        anomalies.push({
          genre: index === 0 && attenduAvant === null ? "tête-non-ancrée" : "saut-non-ancré",
          seq: ligne.seq,
          detail:
            index === 0 && attenduAvant === null
              ? `le journal commence sur un chaînon non nul (${ligne.prevHash ?? "null"}) : ` +
                `il manque des lignes devant, et aucune clôture ne les atteste (§ 31)`
              : `chaînon rompu avant seq ${ligne.seq.toString()}, et aucune clôture ne l'ancre`,
        });
      } else {
        ancre.consommee = true;
        sautsAncres += 1;
        lignesRetireesAncrees += ancre.charge.lignesRetireesCumulees;
      }
    }
    attenduAvant = ligne.selfHash;
  }

  const premiere = lignes[0];
  const derniere = lignes[lignes.length - 1];

  return {
    lignesVerifiees: lignes.length,
    journalVide: lignes.length === 0,
    clotures,
    sautsAncres,
    lignesRetireesAncrees,
    ancresInutilisees: ancres.filter((ancre) => !ancre.consommee).length,
    ancresHorsTranche,
    premiereSeq: premiere?.seq ?? null,
    derniereSeq: derniere?.seq ?? null,
    derniereEmpreinte: derniere?.selfHash ?? null,
    valide: anomalies.length === 0,
    anomalies,
  };
}
