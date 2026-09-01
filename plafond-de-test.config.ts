/**
 * `plafond-de-test.config.ts` — **LES DEUX NOMBRES DE L'ADR 0040, ET LE VERDICT
 * QUI LES EMPLOIE. AUCUNE DÉPENDANCE À VITEST.**
 *
 * ═══ POURQUOI CE FICHIER EST SÉPARÉ DE SON ARMEMENT ═══
 *
 * `marge-des-gardes.config.ts` pose les crochets `beforeEach`/`afterEach`, donc
 * il IMPORTE `vitest` — et appeler un crochet hors d'une suite LÈVE. Or
 * `vitest.config.ts` doit lire le plafond : s'il importait le fichier d'amorce,
 * il exécuterait cet armement au chargement de la CONFIGURATION, c'est-à-dire
 * hors de toute suite, et la configuration ne se chargerait plus du tout.
 *
 * Les deux nombres vivent donc ici, sans crochet ni import de vitest, et les
 * DEUX autres fichiers les lisent. **Une seule écriture, deux lecteurs**
 * (ADR 0040, § 4) — ce que l'ADR protège est tenu, par un fichier de plus.
 *
 * ⚠️ **CE FICHIER N'EST PAS UN MODULE DE PRODUCTION.** `tsconfig.build.json`
 *    exclut `*.config.ts` à la racine, et la garde des coutures dérive de ce
 *    même `exclude` son critère « est-ce livré ? ». C'est ce qui rend l'entrée
 *    de registre `hors-code` de l'ADR 0040 vraie plutôt que commode.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX NOMBRES — une seule écriture, deux lecteurs
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE PLAFOND DE DURÉE D'UN TEST, EN MILLISECONDES — **ADR 0040, § 1 et 2.**
 *
 * ═══ LE FAIT MESURÉ, ET IL A ÉTÉ REPRODUIT ═══
 *
 * `vitest.config.ts` ne posait NI `testTimeout` NI `hookTimeout` : les défauts
 * de vitest s'appliquaient — 5 000 ms par test, 10 000 ms par crochet. Or
 * plusieurs gardes balaient les sources sur disque et relisent les modules de
 * production à chaque assertion. Sur une exécution complète VERTE (HEAD
 * `68f1496`), cinq gardes du registre tenaient entre 3 433 et 3 895 ms :
 * **22 % de marge**.
 *
 * ⚠️ **CE N'EST PLUS UNE MARGE THÉORIQUE.** À l'atterrissage du lot 3, le
 *    registre des coutures passe de 74 à 88 entrées et `docs/adr/` de 30 à 36
 *    fichiers. Les mêmes gardes ont été mesurées à **5 719, 8 097, 8 236 et
 *    10 738 ms**, et QUATRE d'entre elles ont expiré — en annonçant
 *    `0 anomalie(s)` sur 79 symboles confrontés. **Le registre était juste ; les
 *    gardes ont expiré.**
 *
 * ═══ POURQUOI 30 000, ET PAS UN AUTRE NOMBRE ═══
 *
 * Ce qu'un plafond doit attraper : un test qui ne finira JAMAIS — une promesse
 * jamais résolue, une horloge figée qu'on n'avance pas, une file dont le jeton
 * n'est jamais rendu. Il n'est PAS là pour attraper un test lent. 30 000 ms,
 * c'est 7,7 fois le pire cas de l'arbre vert d'origine, 2,8 fois celui de
 * l'arbre du lot, et une demi-minute pour qu'un test bloqué échoue vite.
 */
export const PLAFOND_DE_TEST_MS = 30_000;

/**
 * LA PART DU PLAFOND QU'UN TEST NE DOIT PAS DÉPASSER — **ADR 0040, § 3.**
 *
 * ⚠️ **UN PLAFOND CONFORTABLE EST UN PLAFOND QU'ON CESSE DE REGARDER.** Le seuil
 *    d'alerte n'est donc pas le plafond : arriver à 99 % un jour de machine
 *    calme veut dire qu'on est déjà passé de l'autre côté un jour de machine
 *    chargée, et c'est trop tard pour l'apprendre. À 50 %, il reste un facteur
 *    deux pour la contention, et le signal arrive pendant qu'il est réparable.
 *
 * ⚠️ **CE QU'ON FAIT QUAND ELLE ROUGIT** : on rend la garde MOINS CHÈRE —
 *    mémoïser le balayage du dépôt, lire les fichiers une fois pour tous les
 *    tests d'un fichier. On ne remonte pas le plafond en silence : c'est le
 *    geste que ce contrôle existe pour rendre visible.
 */
export const PART_MAXIMALE_DU_PLAFOND = 0.5;

/** Le seuil d'alerte, DÉRIVÉ des deux nombres ci-dessus — jamais réécrit. */
export function seuilDAlerteMs(
  plafondMs: number = PLAFOND_DE_TEST_MS,
  part: number = PART_MAXIMALE_DU_PLAFOND,
): number {
  return plafondMs * part;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT — fonction PURE, éprouvée par des témoins FABRIQUÉS
// ═════════════════════════════════════════════════════════════════════════════

/** Une durée mesurée, et le test qui l'a prise. */
export interface DureeMesuree {
  readonly nom: string;
  readonly dureeMs: number;
}

/** Ce que le contrôle de marge rend. **Des nombres, jamais une couleur.** */
export interface VerdictDeMarge {
  /** Le dénominateur. Un ZÉRO ici rend le contrôle vacuous, et il le DIT. */
  readonly testsMesures: number;
  readonly plafondMs: number;
  readonly seuilMs: number;
  /** Les plus longs, du plus long au moins long. Au plus {@link PLUS_LONGS_ANNONCES}. */
  readonly plusLongs: readonly DureeMesuree[];
  /** `dureeMax / plafond`. `0` quand rien n'a été mesuré. */
  readonly marge: number;
  /** Les tests au-delà du seuil. Vide = aucune alerte. */
  readonly depassements: readonly DureeMesuree[];
}

/** Combien de durées un verdict nomme. Au-delà, un rapport devient illisible. */
export const PLUS_LONGS_ANNONCES = 3;

/**
 * JUGE UN JEU DE DURÉES. Ne lit ni horloge, ni disque, ni configuration : tout
 * lui est passé, c'est ce qui rend le témoin fabriqué possible.
 */
export function verdictDeMarge(
  mesures: readonly DureeMesuree[],
  plafondMs: number = PLAFOND_DE_TEST_MS,
  part: number = PART_MAXIMALE_DU_PLAFOND,
): VerdictDeMarge {
  const seuilMs = seuilDAlerteMs(plafondMs, part);
  const triees = [...mesures].sort((a, b) => b.dureeMs - a.dureeMs);
  const dureeMax = triees.length === 0 ? 0 : (triees[0]?.dureeMs ?? 0);
  return {
    testsMesures: mesures.length,
    plafondMs,
    seuilMs,
    plusLongs: triees.slice(0, PLUS_LONGS_ANNONCES),
    marge: plafondMs === 0 ? 0 : dureeMax / plafondMs,
    depassements: triees.filter((mesure) => mesure.dureeMs > seuilMs),
  };
}

/** La phrase qu'un verdict annonce. Elle porte le dénominateur EN PREMIER. */
export function annonceDeMarge(verdict: VerdictDeMarge, contexte: string): string {
  const plusLongs =
    verdict.plusLongs.length === 0
      ? "aucune durée"
      : verdict.plusLongs
          .map((mesure) => `« ${mesure.nom} » ${String(Math.round(mesure.dureeMs))} ms`)
          .join(" · ");
  return (
    `[marge · ${contexte}] ${String(verdict.testsMesures)} test(s) mesuré(s) · ` +
    `plafond ${String(verdict.plafondMs)} ms · alerte à ${String(Math.round(verdict.seuilMs))} ms · ` +
    `marge ${String(Math.round(verdict.marge * 100))} % · ` +
    `${String(verdict.depassements.length)} dépassement(s) · plus long(s) : ${plusLongs}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ALERTE — LA SEULE ÉCRITURE DU SEUIL QUI FASSE ROUGIR UN TEST
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE MESSAGE D'ALERTE D'UNE DURÉE, OU `null` SI ELLE TIENT DANS LA MARGE.
 *
 * ═══ LE DÉFAUT QUE CETTE FONCTION FERME, ET IL A ÉTÉ MESURÉ ═══
 *
 * Le seuil était écrit DEUX FOIS : ici, dans `verdictDeMarge().depassements` —
 * gardé par `core/audit/marge-des-gardes.spec.ts` —, et une seconde fois dans
 * l'`afterEach` de `marge-des-gardes.config.ts`, sous la forme
 * `if (dureeMs > seuilMs)`. **Celle des deux écritures qui faisait réellement
 * rougir les tests du dépôt était la NON gardée.** La mutation qui le prouve —
 * remplacer ce `seuilMs` par `PLAFOND_DE_TEST_MS`, ce qui rend l'alarme
 * structurellement morte puisque vitest tue le test AU plafond avant que
 * l'`afterEach` ne s'exécute — a survécu à la suite complète :
 * `Tests 1489 passed | 31 expected fail (1520)`, ZÉRO fichier rouge.
 *
 * ⚠️ **DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE.** L'armement
 *    n'écrit donc plus aucune comparaison : il appelle CECI, qui appelle
 *    {@link verdictDeMarge}. Une seule écriture du seuil, et c'est celle que la
 *    garde éprouve déjà sur témoins fabriqués.
 */
export function alerteDeDepassement(
  mesure: DureeMesuree,
  plafondMs: number = PLAFOND_DE_TEST_MS,
  part: number = PART_MAXIMALE_DU_PLAFOND,
): string | null {
  const verdict = verdictDeMarge([mesure], plafondMs, part);
  if (verdict.depassements.length === 0) return null;
  return (
    `ADR 0040 — « ${mesure.nom} » a pris ${String(Math.round(mesure.dureeMs))} ms, au-delà de ` +
    `${String(Math.round(verdict.seuilMs))} ms (${String(Math.round(part * 100))} % ` +
    `du plafond de ${String(verdict.plafondMs)} ms). Une marge trop mince fait rougir cette ` +
    "garde pour une raison ÉTRANGÈRE à la règle qu'elle garde, un jour de machine chargée. " +
    "Le remède est de rendre la garde MOINS CHÈRE — mémoïser le balayage du dépôt, lire les " +
    "sources une fois pour tous les tests du fichier —, jamais de remonter le plafond."
  );
}
