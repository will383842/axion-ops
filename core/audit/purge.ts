/**
 * `core/audit/purge.ts` — LA PURGE ANCRÉE (§ 31).
 *
 * Une purge de journal chaîné n'est pas une suppression : c'est une suppression
 * SUIVIE D'UN AVEU. Le trou qu'elle laisse doit rester explicable, sans quoi il
 * devient impossible de distinguer « ces lignes ont été purgées le 3 mars » de
 * « quelqu'un a effacé le début de son intrusion ».
 *
 * ═══ CE MODULE NE SUPPRIME RIEN ═══
 *
 * Il PRÉPARE : il calcule la tranche, en tire la charge d'ancrage et fabrique le
 * contenu de la ligne de clôture. La suppression elle-même est une transaction
 * de la couche base de données, et l'ordre y est imposé — écrire la clôture, PUIS
 * supprimer, dans la MÊME transaction. Supprimer d'abord laisserait, entre les
 * deux, une fenêtre où le journal est troué et non ancré : si le processus meurt
 * là, le journal reste définitivement invérifiable.
 *
 * ═══ LA PURGE RETIRE UN PRÉFIXE, ET RIEN D'AUTRE ═══
 *
 * La rétention se compte en âge (§ 31 : 12 mois en ligne), et `seq` croît avec
 * le temps : la tranche à retirer est donc toujours un PRÉFIXE. Ce n'est pas une
 * simplification de confort, c'est ce qui rend l'ancrage tenable — un préfixe ne
 * laisse qu'UN saut, à la tête, et le vérificateur y arrive avec un chaînon
 * attendu de `null`. C'est pourquoi toute clôture de préfixe porte
 * `empreinteAvantSaut: null`.
 */

import type { ChargeCloture } from "./cloture.js";
import { construireCloture, decoderCharge, estLigneDeCloture } from "./cloture.js";
import type { ContenuLigne, LigneAudit } from "./vocabulaire.js";

/**
 * Durée de conservation en ligne, en mois (§ 31).
 *
 * ⚠️ C'est la PROPOSITION du cahier des charges, pas une décision : le § 31
 *    porte « 12 mois en ligne + 12 archivés (proposition — décision W-5) ». Tant
 *    que W-5 n'est pas tranchée, cette constante ne doit être câblée à aucune
 *    tâche planifiée. Écart signalé au rapport.
 */
export const RETENTION_EN_LIGNE_MOIS = 12;

/** Levée quand la tranche demandée ne peut pas être ancrée. */
export class ErreurPurge extends Error {
  constructor(message: string) {
    super(`§ 31 — purge refusée : ${message}`);
    this.name = "ErreurPurge";
  }
}

/**
 * La date en deçà de laquelle une ligne sort de la rétention en ligne.
 *
 * Le calcul se fait en UTC : un décalage de fuseau au moment d'un changement
 * d'heure décalerait la limite d'une heure et retirerait — ou garderait — des
 * lignes que la règle ne désigne pas.
 */
export function dateLimiteRetention(maintenant: Date, mois = RETENTION_EN_LIGNE_MOIS): Date {
  const limite = new Date(maintenant.getTime());
  const moisVise = limite.getUTCMonth() - mois;
  const jour = limite.getUTCDate();

  limite.setUTCMonth(moisVise);

  // ⚠️ `setUTCMonth` DÉBORDE quand le mois visé n'a pas ce quantième : un
  //    29 février recule sur un « 29 février » inexistant, que la date reporte
  //    au 1ᵉʳ mars. La limite avancerait alors d'un jour, et la purge — qui est
  //    IRRÉVERSIBLE — emporterait un jour de journal que la règle des douze mois
  //    désigne comme encore en ligne. On ramène au dernier jour du mois visé.
  if (limite.getUTCDate() !== jour) limite.setUTCDate(0);

  return limite;
}

/**
 * Le cumul déjà attesté à la TÊTE du journal.
 *
 * Une clôture est appendue à la POINTE : elle survit donc aux purges suivantes,
 * qui, elles, rongent la tête. Après deux purges, deux clôtures cohabitent —
 * l'ancienne n'ancre plus rien (`ancresInutilisees` du rapport la compte), mais
 * son décompte doit être repris par la nouvelle, faute de quoi le journal
 * oublierait combien de lignes ont disparu en tout.
 *
 * @returns le plus grand cumul attesté par une clôture de tête, ou 0.
 */
export function cumulAncrageTete(lignes: readonly LigneAudit[]): number {
  let cumul = 0;
  for (const ligne of lignes) {
    if (!estLigneDeCloture(ligne)) continue;
    const charge = decoderCharge(ligne.partialSources);
    if (charge === null || charge.empreinteAvantSaut !== null) continue;
    cumul = Math.max(cumul, charge.lignesRetireesCumulees);
  }
  return cumul;
}

/** Ce qu'il faut pour préparer une clôture. */
export interface DemandePurge {
  /**
   * La tranche à retirer : un PRÉFIXE du journal, ordonné par `seq` croissant.
   * Non vide.
   */
  readonly lignesARetirer: readonly LigneAudit[];
  /**
   * Le cumul déjà attesté par une purge antérieure — voir `cumulAncrageTete`.
   * `0` pour la première purge d'un journal.
   */
  readonly cumulAnterieur: number;
  /**
   * `selfHash` de la dernière ligne CONSERVÉE au moment de la purge (§ 31, mot
   * pour mot) : la pointe du journal juste avant que la clôture n'y soit
   * ajoutée.
   *
   * ⚠️ JAMAIS `null`. La clôture s'écrit AVANT la suppression (voir l'en-tête
   *    du module) : à cet instant le journal porte encore au moins la dernière
   *    ligne retirée, et c'est elle qui est la pointe. Un `null` produirait une
   *    clôture dont l'`empreinteDerniereConservee` ne vaut pas son propre
   *    `prevHash`, donc une anomalie `clôture-incohérente` à la relecture —
   *    autrement dit une purge qui casse le journal qu'elle prétend sceller.
   *    `preparerPurge` le refuse.
   */
  readonly empreinteDerniereConservee: string | null;
  /**
   * HMAC de la charge, obtenu de `core/limits` (port `ArgHasher`).
   * `core/audit` ne le calcule pas (§ 12, règle 2).
   */
  readonly argHash: string;
  /** L'horodatage de la clôture. */
  readonly at: Date;
}

/** Ce que rend la préparation. */
export interface PurgePreparee {
  readonly charge: ChargeCloture;
  /** Le contenu de la ligne de clôture, à écrire par `Journal.journaliser`. */
  readonly cloture: ContenuLigne;
  /** `seq` des lignes à supprimer, bornes incluses. */
  readonly seqDepuis: bigint;
  readonly seqJusqua: bigint;
}

/**
 * Prépare la clôture d'une purge de préfixe.
 *
 * @throws ErreurPurge si la tranche est vide, non ordonnée, ou si elle ne part
 *   pas de la tête réelle du journal. Un refus bruyant vaut mieux qu'une
 *   clôture qui ancrerait le mauvais trou : une ancre fausse est pire qu'aucune
 *   ancre, parce qu'elle rend le journal vert.
 */
export function preparerPurge(demande: DemandePurge): PurgePreparee {
  const { lignesARetirer, cumulAnterieur } = demande;

  const premiere = lignesARetirer[0];
  const derniere = lignesARetirer[lignesARetirer.length - 1];
  if (premiere === undefined || derniere === undefined) {
    throw new ErreurPurge("la tranche à retirer est vide");
  }

  for (const [index, ligne] of lignesARetirer.entries()) {
    const precedente = index > 0 ? lignesARetirer[index - 1] : undefined;
    if (precedente !== undefined && ligne.seq <= precedente.seq) {
      throw new ErreurPurge(
        `la tranche n'est pas ordonnée par seq croissant (${precedente.seq.toString()} ` +
          `puis ${ligne.seq.toString()})`,
      );
    }
    if (precedente !== undefined && ligne.prevHash !== precedente.selfHash) {
      throw new ErreurPurge(
        `la tranche n'est pas contiguë : le chaînon manque avant seq ${ligne.seq.toString()}`,
      );
    }
  }

  // La tranche doit partir de la TÊTE RÉELLE. Deux cas légitimes : le journal
  // n'a jamais été purgé (`prevHash === null`), ou il l'a déjà été et la tête
  // porte alors l'empreinte attestée par la clôture précédente.
  if (premiere.prevHash !== null && cumulAnterieur === 0) {
    throw new ErreurPurge(
      "la tranche ne part pas de la tête du journal, et aucune purge antérieure ne l'atteste — " +
        "retirer une tranche du milieu laisserait un saut que le vérificateur refuserait",
    );
  }

  if (cumulAnterieur < 0 || !Number.isSafeInteger(cumulAnterieur)) {
    throw new ErreurPurge("le cumul antérieur n'est pas un entier positif");
  }

  if (demande.empreinteDerniereConservee === null) {
    throw new ErreurPurge(
      "aucune empreinte de dernière ligne conservée : la clôture s'écrit AVANT la " +
        "suppression, la pointe existe donc toujours — un nul produirait une clôture " +
        "incohérente avec son propre chaînon, et le journal serait cassé par sa propre purge",
    );
  }

  const charge: ChargeCloture = {
    seqDepuis: premiere.seq,
    seqJusqua: derniere.seq,
    lignesRetirees: lignesARetirer.length,
    lignesRetireesCumulees: lignesARetirer.length + cumulAnterieur,
    // Un préfixe ne laisse qu'un saut, à la tête : le vérificateur y arrive avec
    // un chaînon attendu de `null`, et l'ancre doit le déclarer tel quel.
    empreinteAvantSaut: null,
    empreinteDerniereRetiree: derniere.selfHash,
    empreinteDerniereConservee: demande.empreinteDerniereConservee,
  };

  return {
    charge,
    cloture: construireCloture(charge, demande.argHash, demande.at),
    seqDepuis: premiere.seq,
    seqJusqua: derniere.seq,
  };
}
