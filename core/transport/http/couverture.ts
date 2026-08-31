/**
 * `core/transport/http/couverture.ts` — **INTERDIT DE CONSTRUCTION N° 3 : LA
 * COUVERTURE EST VÉRIFIÉE AU DÉMARRAGE, PAS SEULEMENT EN TEST.**
 *
 * `verifierCouvertureDesEtapes(transport)` (`core/chaine/orchestrateur.ts`) dit
 * qu'une étape applicable a un exécutant NOMMÉ. Pour les quatre étapes « HTTP
 * seul », l'exécutant qu'elle nomme est une PHRASE — « transport HTTP — hors
 * orchestrateur (§ 11) » — et son propre commentaire le dit sans détour :
 * `executantsConfrontes` compte celles qui ont eu droit à mieux qu'une chaîne de
 * caractères, et les quatre du transport n'en sont pas.
 *
 * Ce module est le côté qui manquait. Il ne redit pas quelles étapes sont
 * « HTTP seul » — il les **DÉRIVE** d'`APPEL_STEPS.httpSeul`, comme
 * `colonneDuTransport` — et il confronte cette dérivation à une table
 * d'exécutants qui, elle, nomme des **symboles de ce dossier**.
 *
 * ⚠️ **POURQUOI CETTE CONFRONTATION EST APPELÉE À LA CONSTRUCTION DU TRANSPORT
 *    ET PAS SEULEMENT DANS UNE SPEC.** L'ADR 0025 l'exige : « une étape
 *    applicable sans exécutant fait REFUSER LE DÉMARRAGE plutôt que de laisser
 *    traverser une chaîne trouée ». Une garde qui ne vit que dans un `.spec.ts`
 *    ne tourne pas dans le conteneur ; le jour où le § 11 gagne une cinquième
 *    étape « HTTP seul », un socle déployé la sauterait en silence pendant que
 *    la CI, elle, aurait rougi — et c'est le socle déployé qui sert les appels.
 *
 * ⚠️ **CE QUE CETTE GARDE NE TIENT PAS, ÉCRIT AVEC ELLE.** Elle prouve qu'un
 *    symbole est NOMMÉ pour chaque étape amont, pas qu'il est APPELÉ à
 *    l'exécution. C'est `amont.spec.ts` qui mesure les appels réels, en comptant
 *    ce que chaque étape a confronté ; et c'est `imports.temoin.spec.ts` qui
 *    tient le graphe d'imports NÉGATIF. Trois gardes, trois propriétés, et
 *    aucune ne se lit à la place des autres.
 */

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep, AppelStepKey } from "../../types.js";
import type { EtapesEtabliesEnAmont } from "../contrat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA TABLE — un symbole de CE dossier par étape amont
// ═════════════════════════════════════════════════════════════════════════════

/**
 * QUI EXÉCUTE CHACUNE DES QUATRE ÉTAPES « HTTP SEUL ».
 *
 * ⚠️ **LES CLÉS NE SONT PAS ÉCRITES AU HASARD : ELLES SONT CELLES D'`APPEL_STEPS`,
 *    ET LE COMPILATEUR LE VÉRIFIE** (`satisfies Partial<Record<AppelStepKey, …>>`).
 *    Une clé mal orthographiée ne compile pas ; une clé qui cesserait d'exister
 *    au § 11 non plus. Ce que le compilateur ne peut PAS tenir, parce qu'il
 *    s'agit d'un sous-ensemble dérivé d'un booléen, c'est que la table couvre
 *    exactement les étapes `httpSeul` — d'où {@link verifierLaCouvertureAmont},
 *    qui le mesure au runtime, dans les deux sens.
 */
export const EXECUTANTS_AMONT_HTTP = {
  host: "core/transport/http/hote.ts — `verifierLHote` (étape 1, avant tout traitement)",
  jeton: "core/transport/http/jeton.ts — port `VerificateurDeJeton.verifier` (étape 2)",
  audience: "core/transport/http/audience.ts — `verifierLAudience` (étape 3, RFC 8707)",
  revocation:
    "core/transport/http/jeton.ts — port `RegistreDesJetons.relire`, " +
    "puis `verifierLaFormeDuPrincipal` (étape 4, ADR 0029)",
} as const satisfies Partial<Record<AppelStepKey, string>>;

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que la confrontation rend. Des NOMBRES et des listes, jamais un booléen. */
export interface CouvertureAmont {
  /** Combien d'étapes du § 11 ont été CONFRONTÉES. Mesuré dans la boucle. */
  readonly etapesMesurees: number;
  /** Combien sont « HTTP seul », donc dues au transport. DÉRIVÉ. */
  readonly etapesAmont: readonly AppelStep[];
  /** Celles qui n'ont aucun exécutant nommé dans ce dossier. */
  readonly sansExecutant: readonly AppelStep[];
  /**
   * Les clés de la table qui ne désignent AUCUNE étape amont. C'est le sens que
   * l'on oublie : une entrée devenue morte fait croire à une couverture plus
   * large que la vraie, et personne ne la voit disparaître.
   */
  readonly executantsOrphelins: readonly string[];
}

/** Levée quand la table et le § 11 ne s'accordent pas. Le transport ne se construit pas. */
export class ErreurCouvertureAmont extends Error {
  public readonly couverture: CouvertureAmont;

  public constructor(couverture: CouvertureAmont) {
    const sans = couverture.sansExecutant.map((etape) => String(etape)).join(", ");
    const orphelins = couverture.executantsOrphelins.join(", ");
    super(
      `§ 11 — le transport HTTP ne couvre pas les étapes qui lui sont dues : ` +
        `${String(couverture.etapesMesurees)} étape(s) confrontée(s), ` +
        `${String(couverture.etapesAmont.length)} due(s) au transport, ` +
        `sans exécutant : [${sans}], exécutant(s) orphelin(s) : [${orphelins}]. ` +
        "Une chaîne trouée ne doit pas servir un seul appel : le transport refuse de se construire.",
    );
    this.name = "ErreurCouvertureAmont";
    this.couverture = couverture;
  }
}

/**
 * CONFRONTE {@link EXECUTANTS_AMONT_HTTP} À `APPEL_STEPS.httpSeul`.
 *
 * Elle ne peut pas être verte pour rien : `etapesMesurees` est incrémenté DANS
 * la boucle, jamais rendu depuis `APPEL_STEPS.length`, et la boucle parcourt la
 * totalité — y compris les étapes communes, pour que le compte dise réellement
 * combien d'étapes ont été regardées.
 */
export function verifierLaCouvertureAmont(): CouvertureAmont {
  const table: Readonly<Record<string, string | undefined>> = EXECUTANTS_AMONT_HTTP;
  const etapesAmont: AppelStep[] = [];
  const sansExecutant: AppelStep[] = [];
  const clesAmont = new Set<string>();
  let etapesMesurees = 0;

  for (const etape of APPEL_STEPS) {
    etapesMesurees += 1;
    if (!etape.httpSeul) continue;
    etapesAmont.push(etape.numero);
    clesAmont.add(etape.cle);
    const executant = table[etape.cle];
    if (executant === undefined || executant.trim().length === 0) {
      sansExecutant.push(etape.numero);
    }
  }

  const executantsOrphelins = Object.keys(table).filter((cle) => !clesAmont.has(cle));

  return { etapesMesurees, etapesAmont, sansExecutant, executantsOrphelins };
}

/**
 * LA MÊME CONFRONTATION, EN VERSION QUI **REFUSE**. C'est celle que
 * `creerTransportHttp` appelle — donc celle qui tourne dans le conteneur.
 */
export function exigerLaCouvertureAmont(): CouvertureAmont {
  const couverture = verifierLaCouvertureAmont();
  if (couverture.sansExecutant.length > 0 || couverture.executantsOrphelins.length > 0) {
    throw new ErreurCouvertureAmont(couverture);
  }
  // Plancher : zéro étape amont voudrait dire que `httpSeul` a disparu du § 11.
  // La table serait alors intégralement orpheline, donc le contrôle ci-dessus a
  // déjà mordu — sauf si la table était vide elle aussi, cas où la couverture
  // serait « complète » en ne couvrant rien. C'est le vert qu'on refuse.
  if (couverture.etapesAmont.length === 0) {
    throw new ErreurCouvertureAmont(couverture);
  }
  return couverture;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE TRANSPORT DIT AVOIR ÉTABLI, CONFRONTÉ À CE QU'IL DEVAIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA MOITIÉ QUE LES TROIS INTERDITS DE L'ADR 0025 NE COUVRENT PAS.**
 *
 * L'ADR l'écrit noir sur blanc : « aucun [des trois interdits] ne voit un
 * transport qui appellerait bien le noyau mais lui MENTIRAIT sur ce que les
 * étapes 1 à 4 ont établi ». Et `core/transport/contrat.ts` pose la règle qui
 * manquait, sur {@link EtapesEtabliesEnAmont} : « l'écart entre les deux est une
 * ANOMALIE, jamais un défaut toléré ».
 *
 * Cette fonction est cette phrase, rendue exécutable. Elle est appelée par
 * `transport.ts` AVANT le noyau, et un écart y devient un `internal` — jamais un
 * appel servi sur une chaîne dont on ne sait plus quelles étapes ont eu lieu.
 *
 * ⚠️ **TROIS REPROCHES, ET LE TROISIÈME EST CELUI QU'ON OUBLIE.** Une étape due
 *    et non exécutée est le défaut évident. Une étape exécutée qui n'est pas due
 *    l'est moins : elle signifie que le transport a fait quelque chose que la
 *    colonne du § 11 ne lui attribue pas, c'est-à-dire qu'une des deux tables a
 *    bougé sans l'autre. Et l'ORDRE compte : les étapes 1 à 4 se conditionnent —
 *    l'audience se juge sur un jeton vérifié, la révocation sur un `jti` lu dans
 *    ce jeton — si bien qu'une exécution dans le désordre est un contournement,
 *    même quand l'ensemble est complet.
 */
export function verifierLAmontEtabli(etabli: EtapesEtabliesEnAmont): readonly string[] {
  const anomalies: string[] = [];
  const dues = [...etabli.etapesDues].sort((a, b) => a - b);
  const executees = [...etabli.etapesExecutees];

  const ensembleExecutees = new Set<AppelStep>(executees);
  for (const due of dues) {
    if (!ensembleExecutees.has(due)) {
      anomalies.push(
        `étape ${String(due)} due au transport « ${etabli.transport} » et non exécutée`,
      );
    }
  }
  const ensembleDues = new Set<AppelStep>(dues);
  for (const faite of executees) {
    if (!ensembleDues.has(faite)) {
      anomalies.push(`étape ${String(faite)} exécutée alors que la colonne ne la doit pas`);
    }
  }

  // L'ORDRE. On compare la suite exécutée à elle-même triée : une inversion se
  // voit sans qu'aucune liste attendue ne soit écrite à la main.
  const triees = [...executees].sort((a, b) => a - b);
  if (executees.some((etape, rang) => etape !== triees[rang])) {
    anomalies.push(
      `les étapes amont ont été exécutées dans le désordre : [${executees.join(", ")}]`,
    );
  }

  // Un refus en amont interdit de prétendre que la chaîne est complète.
  if (etabli.refusEnAmont !== null && executees.length === dues.length) {
    anomalies.push(
      `un refus a été prononcé à l'étape ${String(etabli.refusEnAmont.etape)} et toutes les ` +
        "étapes dues sont pourtant annoncées franchies",
    );
  }

  return anomalies;
}
