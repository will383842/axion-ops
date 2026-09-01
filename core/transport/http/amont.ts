/**
 * `core/transport/http/amont.ts` — **LES QUATRE ÉTAPES « HTTP SEUL », DANS
 * L'ORDRE, ET LE COMPTE DE CE QUE CHACUNE A CONFRONTÉ.**
 *
 * ═══ CE QUE CE FICHIER EST ═══
 *
 * Le propriétaire de l'ORDRE amont, comme `orchestrateur.ts` est celui de
 * l'ordre aval. Étapes 1, 2, 3, 4 — chacune pouvant refuser, chacune inscrivant
 * SON numéro dans le refus, et aucune ne pouvant être sautée sans que le compte
 * d'étapes franchies le dise.
 *
 * ⚠️ **IL N'ÉCRIT AUCUNE LIGNE DE JOURNAL, ET C'EST UN ÉCART MESURÉ, PAS UN
 *    OUBLI.** Le § 11 veut qu'une ligne d'`ops_audit` soit écrite pour TOUTE
 *    terminaison, refus d'étape 1 compris. Or le journal du socle est scellé par
 *    une clé du coffre (ADR 0002) et l'écriture passe par `avecJournal`, qui vit
 *    dans l'orchestrateur — que ces quatre étapes précèdent par construction.
 *    Ce module déclare donc le port {@link JournalDesRefusEnAmont}, l'appelle à
 *    l'instant exact, et livre {@link JOURNAL_AMONT_NON_ARME}, qui ne fait rien.
 *    C'est le motif de `PorteeDIntention` / `INTENTION_NON_ARMEE`
 *    (`orchestrateur.ts`) : un mécanisme DÉCLARÉ, appelé au bon instant, dont
 *    l'armement est UNE ligne chez l'appelant — et `amont.spec.ts` l'arme sur un
 *    double pour prouver que l'instant est atteint. Un port jamais exercé serait
 *    une garde qui ne peut pas échouer, donc pas une garde.
 *
 * ═══ L'ORDRE EST LA DÉCISION, ET IL SE MESURE ═══
 *
 * L'étape 1 précède **la lecture du corps**, et pas seulement son analyse
 * syntaxique. C'est pour cela que ce module ne reçoit aucun corps : il n'en a
 * pas besoin, et ne pas l'avoir est ce qui rend le contournement impossible
 * plutôt qu'interdit. Le corps est lu par `transport.ts`, APRÈS, et sous la
 * forme d'une fonction — une garde compte ses invocations.
 *
 * L'étape 2 précède elle aussi la lecture du corps : un appelant non authentifié
 * n'obtient jamais qu'on analyse ce qu'il envoie. Le § 11 range les étapes dans
 * cet ordre ; le respecter à la lettre coûte zéro et ferme une surface.
 */

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep, AppelStepKey, ErrorCode, OpsScope } from "../../types.js";
import type { LigneOpsTokenRelue } from "../../chaine/identite.js";
import { codeDuRefusAmont, type CleDEtapeAmont } from "./codes.js";
import { verifierLHote } from "./hote.js";
import { verifierLAudience } from "./audience.js";
import { porteurDeLAutorisation } from "./jeton.js";
import type { RegistreDesJetons, VerificateurDeJeton } from "./jeton.js";
import { verifierLaFormeDuPrincipal } from "./principal.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES ANCRAGES — les seuls numéros de ce fichier, tous LUS dans `APPEL_STEPS`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le numéro d'une étape, LU dans `APPEL_STEPS`. Lève au chargement du module si
 * la clé n'y est pas — la clé est d'un type FERMÉ, donc l'échec ne peut venir
 * que d'une incohérence interne au tableau, et il doit s'entendre plutôt que de
 * laisser un `undefined` décaler tous les numéros d'un rang.
 */
function numero(cle: AppelStepKey): AppelStep {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === cle);
  if (etape === undefined) {
    throw new Error(`§ 11 — aucune étape ne porte la clé « ${cle} » dans APPEL_STEPS`);
  }
  return etape.numero;
}

/** § 11, étape 1 — anti DNS-rebinding. */
export const ETAPE_HOTE = numero("host");
/** § 11, étape 2 — signature et `iss`. */
export const ETAPE_JETON = numero("jeton");
/** § 11, étape 3 — audience, RFC 8707. */
export const ETAPE_AUDIENCE = numero("audience");
/** § 11, étape 4 — `jti` non révoqué. */
export const ETAPE_REVOCATION = numero("revocation");

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉFI `WWW-Authenticate` — RFC 6750, § 3
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UN `401` DOIT PORTER, ET RIEN DE PLUS.
 *
 * ⚠️ **`error="invalid_token"` NE SE POSE QUE SI UNE TENTATIVE A EU LIEU.** La
 *    RFC 6750, § 3, est explicite : un client qui n'a présenté aucune
 *    information d'authentification reçoit un défi NU. Poser `invalid_token`
 *    sur une requête sans jeton reviendrait à dire à un client que son jeton —
 *    qu'il n'a pas — est mauvais, ce qui est le genre de message qui envoie
 *    chercher au mauvais endroit (§ 25).
 *
 * ⚠️ **AUCUNE VALEUR REÇUE N'ENTRE DANS UN DÉFI.** Ni le jeton, ni l'audience
 *    reçue, ni l'hôte. Le champ {@link DefiDAuthentification.motif} est tiré
 *    d'une table FERMÉE, écrite dans ce dépôt : un défi voyage en clair dans un
 *    en-tête, et le § 15 interdit qu'une erreur fasse fuir quoi que ce soit.
 */
export interface DefiDAuthentification {
  /** Une tentative d'authentification a-t-elle eu lieu ? Décide de `error=`. */
  readonly tentativeFaite: boolean;
  /** Un motif d'une table fermée, jamais une valeur reçue. `null` = défi nu. */
  readonly motif: MotifDeDefi | null;
}

/** Les motifs de défi, en union FERMÉE. Aucun ne cite une valeur reçue. */
export const MOTIFS_DE_DEFI = [
  "jeton absent",
  "jeton refusé",
  "audience refusée",
  "jeton révoqué ou inconnu",
  "principal non conforme",
] as const;

/** Un motif de défi. */
export type MotifDeDefi = (typeof MOTIFS_DE_DEFI)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT DU JOURNAL AMONT — déclaré, appelé, NON ARMÉ
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'une ligne de refus amont porterait. Aucune valeur reçue n'y figure. */
export interface RefusEnAmont {
  readonly etape: AppelStep;
  readonly code: ErrorCode | null;
  readonly motif: MotifDeDefi;
}

/**
 * **LE PORT QUI MANQUE POUR QUE L'INVARIANT DU § 11 TIENNE EN AMONT.**
 *
 * Il est déclaré ici, appelé à l'instant exact, et livré NON ARMÉ. Voir l'en-tête
 * de ce fichier : le journal du socle est scellé par une clé du coffre et
 * s'écrit dans l'orchestrateur, que ces quatre étapes précèdent par
 * construction. L'armer suppose de trancher où la clé de scellement est
 * disponible en amont du noyau — c'est une décision de la racine de composition
 * (ADR 0023), pas du transport.
 */
export interface JournalDesRefusEnAmont {
  /**
   * Consigne un refus d'amont et rend **LE NOMBRE DE LIGNES ÉCRITES** —
   * **ADR 0037, § 1.**
   *
   * ⚠️ **UN NOMBRE, ET NON UN BOOLÉEN, ET LE MOTIF EST MESURABLE.** Un port réel
   *    peut écrire une ligne, ou zéro — écriture refusée, journal injoignable.
   *    Un booléen dirait « ça s'est bien passé » ; un nombre dit COMBIEN, et
   *    c'est un compte qu'on peut confronter à `refusPrononces`. Ce dépôt
   *    n'accepte pas les couleurs à la place des nombres.
   */
  consigner(refus: RefusEnAmont): Promise<number>;
}

/**
 * L'IMPLÉMENTATION QUI NE FAIT RIEN, ET QUI LE DIT — **ELLE REND `0`.**
 *
 * ⚠️ ELLE N'EST PAS UN DÉFAUT SILENCIEUX : `TraceAmont.refusConsignes`
 *    ADDITIONNE ce que le port a écrit, si bien qu'un socle non armé annonce
 *    « 1 refus prononcé · 0 consigné » plutôt que de laisser croire que la ligne
 *    existe.
 *
 * 🔴 **CETTE PROMESSE A ÉTÉ FAUSSE, MOT POUR MOT, JUSQU'À L'ADR 0037.** La prose
 *    annonçait « 1 prononcé · 0 consigné » et le code faisait l'inverse :
 *    `refusConsignes += 1` s'exécutait INCONDITIONNELLEMENT après l'`await`, et
 *    ce port-ci résout. Mesuré sur les CINQ refus d'amont : tous annonçaient
 *    « 1 prononcé · 1 CONSIGNÉ » alors qu'aucune ligne n'était écrite — le
 *    compteur affirmait exactement la ligne qu'il existait pour démentir. Neuf
 *    occurrences du champ dans le dépôt, AUCUNE assertion dessus : la mutation
 *    `refusConsignes += 0` a survécu à la suite complète (lot 3, M1).
 */
export const JOURNAL_AMONT_NON_ARME: JournalDesRefusEnAmont = {
  consigner(): Promise<number> {
    return Promise.resolve(0);
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI ENTRE, CE QUI SORT
// ═════════════════════════════════════════════════════════════════════════════

/** Les deux en-têtes que les étapes 1 à 4 lisent, et les deux seuls. */
export interface EnTetesAmont {
  readonly hote: string | undefined;
  readonly autorisation: string | undefined;
}

/** Les réglages, établis une fois au démarrage (ADR 0023, étages 3 et 6). */
export interface ReglagesAmont {
  readonly hotesAdmis: readonly string[];
  /** `OPS_RESOURCE_INDICATOR`, dont l'étage 3 a vérifié les cinq contraintes. */
  readonly audienceAttendue: string;
}

/** Les ports des étapes 2 et 4, plus le journal amont. */
export interface DependancesAmont {
  readonly verificateurDeJeton: VerificateurDeJeton;
  readonly registreDesJetons: RegistreDesJetons;
  readonly journalDesRefus: JournalDesRefusEnAmont;
}

/**
 * CE QUE L'AMONT A MESURÉ. **Des nombres, pas une couleur.**
 *
 * ⚠️ CHAQUE COMPTE EXISTE PARCE QU'UNE ÉTAPE PEUT ÊTRE VERTE EN NE REGARDANT
 *    RIEN : une liste blanche vide ne confronte aucun hôte, une audience absente
 *    ne fait aucune comparaison, une table `ops_token` injoignable ne confronte
 *    aucune ligne. Le verdict de chacune est donc lu par son compte, jamais par
 *    son booléen.
 */
export interface TraceAmont {
  /** Les étapes que la colonne du transport doit au § 11. DÉRIVÉES. */
  readonly etapesDues: readonly AppelStep[];
  /** Les étapes RÉELLEMENT exécutées, dans l'ordre. Mesuré, pas supposé. */
  readonly etapesFranchies: readonly AppelStep[];
  readonly entreesDHoteConfrontees: number;
  readonly comparaisonsDAudience: number;
  readonly lignesOpsTokenConfrontees: number;
  readonly champsDeJournalInspectes: number;
  /** Combien de refus ont été PRONONCÉS, et combien ont été CONSIGNÉS. */
  readonly refusPrononces: number;
  readonly refusConsignes: number;
}

/** L'issue de l'amont. Union FERMÉE : il n'y a pas de troisième sortie. */
export type ResultatAmont =
  | {
      readonly genre: "refus";
      readonly etape: AppelStep;
      readonly code: ErrorCode | null;
      readonly motif: MotifDeDefi;
      readonly defi: DefiDAuthentification | null;
      readonly trace: TraceAmont;
    }
  | {
      readonly genre: "établi";
      readonly jeton: LigneOpsTokenRelue;
      readonly scopes: readonly OpsScope[];
      readonly trace: TraceAmont;
    };

/** Les étapes dues au transport HTTP, DÉRIVÉES d'`APPEL_STEPS.httpSeul`. */
export const ETAPES_DUES_AU_TRANSPORT: readonly AppelStep[] = APPEL_STEPS.filter(
  (etape) => etape.httpSeul,
).map((etape) => etape.numero);

// ═════════════════════════════════════════════════════════════════════════════
//  LES QUATRE ÉTAPES, DANS L'ORDRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * FRANCHIT LES ÉTAPES 1 À 4. Rien avant, rien après, rien entre.
 *
 * ⚠️ **AUCUN CORPS DE REQUÊTE N'ENTRE ICI, ET C'EST L'INTERDIT DE CONSTRUCTION.**
 *    Cette fonction ne peut pas analyser un corps avant l'étape 1 : elle n'en a
 *    pas. Le § 11 dit « avant tout traitement » ; une signature qui ne reçoit
 *    pas le corps le tient mieux qu'un commentaire qui le demande.
 */
export async function franchirLAmont(
  entetes: EnTetesAmont,
  reglages: ReglagesAmont,
  dependances: DependancesAmont,
): Promise<ResultatAmont> {
  const franchies: AppelStep[] = [];
  let entreesDHoteConfrontees = 0;
  let comparaisonsDAudience = 0;
  let lignesOpsTokenConfrontees = 0;
  let champsDeJournalInspectes = 0;
  let refusPrononces = 0;
  let refusConsignes = 0;

  const trace = (): TraceAmont => ({
    etapesDues: ETAPES_DUES_AU_TRANSPORT,
    etapesFranchies: [...franchies],
    entreesDHoteConfrontees,
    comparaisonsDAudience,
    lignesOpsTokenConfrontees,
    champsDeJournalInspectes,
    refusPrononces,
    refusConsignes,
  });

  const refuser = async (
    etape: AppelStep,
    cle: CleDEtapeAmont,
    motif: MotifDeDefi,
    defi: DefiDAuthentification | null,
  ): Promise<ResultatAmont> => {
    const code = codeDuRefusAmont(cle);
    refusPrononces += 1;
    // L'invariant du § 11, à l'instant exact où il se joue. **Le compte ADDITIONNE
    // ce que le port a ÉCRIT** (ADR 0037, § 1) : le port livré ne fait rien et
    // rend `0`, donc un socle non armé annonce « 1 prononcé · 0 consigné ».
    // Incrémenter de 1 après l'`await` — ce que ce fichier faisait — affirmait la
    // ligne que ce compteur existe pour démentir.
    const ecrites = await dependances.journalDesRefus.consigner({ etape, code, motif });
    // ⚠️ FAIL-CLOSED SUR LA VALEUR RENDUE. Un port écrit en JavaScript peut
    //    rendre `undefined`, `NaN` ou un négatif ; les compter ferait remonter
    //    un `NaN` dans une trace, c'est-à-dire un compte qu'aucune comparaison ne
    //    peut plus lire. Ce qui n'est pas un entier positif ne compte pour RIEN.
    refusConsignes += Number.isInteger(ecrites) && ecrites > 0 ? ecrites : 0;
    return { genre: "refus", etape, code, motif, defi, trace: trace() };
  };

  // ── ÉTAPE 1 — ANTI DNS-REBINDING, AVANT TOUT TRAITEMENT ──────────────────
  const hote = verifierLHote(entetes.hote, reglages.hotesAdmis);
  entreesDHoteConfrontees = hote.entreesConfrontees;
  if (!hote.autorise) {
    // Aucun défi : un `Host` refusé n'est pas un défaut d'authentification, et
    // un `WWW-Authenticate` sur un `403` inviterait à présenter un jeton pour
    // un refus qu'aucun jeton ne lève.
    return await refuser(ETAPE_HOTE, "host", "jeton absent", null);
  }
  franchies.push(ETAPE_HOTE);

  // ── ÉTAPE 2 — JETON VALIDE : SIGNATURE, `iss` ────────────────────────────
  const autorisation = porteurDeLAutorisation(entetes.autorisation);
  if (autorisation.porteur === null) {
    return await refuser(ETAPE_JETON, "jeton", "jeton absent", {
      tentativeFaite: autorisation.enTetePresent,
      motif: autorisation.enTetePresent ? "jeton refusé" : null,
    });
  }
  const revendications = await dependances.verificateurDeJeton.verifier(autorisation.porteur);
  if (revendications === null) {
    return await refuser(ETAPE_JETON, "jeton", "jeton refusé", {
      tentativeFaite: true,
      motif: "jeton refusé",
    });
  }
  franchies.push(ETAPE_JETON);

  // ── ÉTAPE 3 — AUDIENCE, RFC 8707, ÉGALITÉ EXACTE ─────────────────────────
  const audience = verifierLAudience(revendications.audience, reglages.audienceAttendue);
  comparaisonsDAudience = audience.comparaisonsFaites;
  if (!audience.autorise) {
    return await refuser(ETAPE_AUDIENCE, "audience", "audience refusée", {
      tentativeFaite: true,
      motif: "audience refusée",
    });
  }
  franchies.push(ETAPE_AUDIENCE);

  // ── ÉTAPE 4 — `jti` NON RÉVOQUÉ, PUIS LA FORME DU `principal` (ADR 0029) ──
  const ligne = await dependances.registreDesJetons.relire(revendications.jti);
  lignesOpsTokenConfrontees = ligne === null ? 0 : 1;
  if (ligne === null) {
    return await refuser(ETAPE_REVOCATION, "revocation", "jeton révoqué ou inconnu", {
      tentativeFaite: true,
      motif: "jeton révoqué ou inconnu",
    });
  }

  // ⚠️ LE REFUS EST PRONONCÉ ICI ET NULLE PART AILLEURS. C'est à l'étape 4 que
  //    `ops_token` est relue, donc là que le principal est LU, donc là qu'il se
  //    juge. Aucune étape neuve n'est créée : le refus porte le `401` que
  //    l'étape 4 porte déjà.
  const forme = verifierLaFormeDuPrincipal(ligne.principal, ETAPE_REVOCATION);
  champsDeJournalInspectes = forme.champsInspectes;
  if (!forme.admis) {
    return await refuser(ETAPE_REVOCATION, "revocation", "principal non conforme", {
      tentativeFaite: true,
      motif: "principal non conforme",
    });
  }
  franchies.push(ETAPE_REVOCATION);

  return { genre: "établi", jeton: ligne, scopes: revendications.scopes, trace: trace() };
}
