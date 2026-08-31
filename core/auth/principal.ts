/**
 * `core/auth/principal.ts` — **LE `principal` EST BORNÉ À LA SOURCE, ET LA
 * SOURCE EST ICI.**
 *
 * ═══ LE DÉFAUT QUE CE FICHIER FERME PAR SA MOITIÉ « SOURCE » ═══
 *
 * Le lot 1d a mesuré qu'**une terminaison peut ne laisser aucune ligne**.
 * `verifierAucunContenu()` (§ 31) borne des colonnes dont la valeur ne vient pas
 * du socle ; deux ne l'étaient par rien — `tool`, qui vient d'`AppelEntrant`, et
 * `principal`, qui vient d'`IdentiteAppelante`. L'en-tête vivant les pose
 * verbatim, la garde du § 31 refuse la ligne, et l'écriture lève **hors** du
 * `try` de `journaliser` : **zéro ligne d'`ops_audit`**. Rien ne sort — la porte
 * est fermée — mais la TRACE est perdue, et l'invariant du § 11 tombe avec elle.
 *
 * ═══ CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS ═══
 *
 * L'ADR 0029 range le remède en deux moitiés, et ce fichier n'en porte qu'UNE :
 *
 *  · ✅ **la SOURCE** — le socle n'a que deux sources de `principal` : cet
 *    émetteur, et `PRINCIPAL_STDIO`, constante conforme par construction. Borner
 *    ici, c'est borner partout ce qui ENTRE ;
 *  · ⛔ **la BORNE dérivée de `FORMES` pour un principal rencontré malgré tout**
 *    (étape 4) et pour `tool` (étape 6) vit dans `core/audit/contenu.ts` et
 *    `core/transport/`. Elle a atterri pendant ce lot, par un autre constructeur
 *    — `bornesDIdentifiantDuJournal()` et `bornerIdentifiantDuJournal()` — et ce
 *    module en DÉRIVE désormais sa propre borne plutôt que d'en attendre une.
 *    Mais la mesure qui fait foi reste le témoin de perte de ligne (section N3
 *    de `core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts`) : **ce fichier ne
 *    le fait pas basculer, et ne doit pas prétendre le faire.**
 *
 * ═══ POURQUOI LA RÈGLE EST *LUE* ET JAMAIS RÉÉCRITE ═══
 *
 * ⚠️ `estIdentifiantDeJournal()` (`core/audit/contenu.ts`) EST la règle du § 31,
 *    réduite à son verdict — la garde d'écriture et ce module passent par le
 *    MÊME code. Une seconde expression régulière écrite ici serait la façon dont
 *    le troisième champ de la famille sera oublié : deux copies d'une règle de
 *    forme divergent au premier ajustement, et c'est la copie qui ne suit pas
 *    qui devient muette.
 *
 * ⚠️ **LA BORNE DE LONGUEUR EST *LUE* CHEZ `core/audit/contenu.ts`, PAS ÉCRITE
 *    ICI.** Écrire « 128 » serait exactement la seconde expression à la main que
 *    l'ADR 0029 interdit — c'est ainsi que le troisième champ de la famille
 *    serait oublié. `bornesDIdentifiantDuJournal()` est la fonction SŒUR de
 *    `bornesDeListeDuJournal()`, et elle a la propriété qui compte : **elle LÈVE
 *    si le genre de la colonne change**, au lieu de rendre une borne
 *    fantaisiste.
 *
 *    Elle reste néanmoins passée en PARAMÈTRE, avec elle-même pour défaut. Ce
 *    n'est pas de l'indirection gratuite : c'est ce qui permet à
 *    `core/auth/principal.spec.ts` de soumettre au module une borne MESURÉE
 *    indépendamment — par dichotomie sur `verifierAucunContenu()` — et de
 *    confronter les deux. Une fonction qui lirait sa borne depuis son corps ne
 *    serait éprouvable que contre elle-même.
 */

import { bornesDIdentifiantDuJournal, estIdentifiantDeJournal } from "../audit/contenu.js";
import type { ChampCouvert } from "../audit/canonique.js";
import type { PrincipalEmis } from "./contrat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT DE LA BORNE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE `core/auth/` ATTEND DE `core/audit/` — et qui existe désormais.
 *
 * ⚠️ **LA SIGNATURE EST CELLE DE `bornesDIdentifiantDuJournal`, MOT POUR MOT**,
 *    pour que la vraie fonction satisfasse ce type SANS ADAPTATEUR. Un type
 *    « proche » aurait exigé une lambda de conversion, c'est-à-dire un endroit
 *    de plus où une borne peut être réécrite en passant.
 *
 * ⚠️ **ELLE DOIT LEVER SI LE GENRE DE LA COLONNE CHANGE**, comme sa sœur
 *    `bornesDeListeDuJournal()` le fait déjà : un changement de genre chez
 *    `FORMES` doit rougir, pas rendre une borne fantaisiste. C'est la propriété
 *    qui compte, et c'est celle que la garde éprouve.
 */
export type BornesDIdentifiantDuJournal = (champ: ChampCouvert) => {
  readonly maxCar: number;
};

/**
 * LA BORNE PAR DÉFAUT — la vraie, celle de `core/audit/contenu.ts`.
 *
 * ⚠️ **C'EST UNE DÉRIVATION, ET ELLE A REMPLACÉ UNE PROMESSE.** Une première
 *    écriture de ce module n'avait que le port, parce que la fonction sœur de
 *    l'ADR 0029 n'existait pas encore. Elle a atterri pendant ce lot ; garder le
 *    port sans défaut aurait laissé la racine de composition libre d'y brancher
 *    autre chose — c'est-à-dire libre de rétablir le chiffre écrit à la main que
 *    l'ADR interdit.
 */
export const BORNES_DU_JOURNAL: BornesDIdentifiantDuJournal = bornesDIdentifiantDuJournal;

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les deux causes de refus, NOMMÉES SÉPARÉMENT. « Trop long » se répare en
 * raccourcissant, « mauvaise forme » se répare en changeant de valeur : un
 * verdict qui ne dirait que « refusé » enverrait chercher au mauvais endroit.
 */
export const CAUSES_DE_REFUS_DE_PRINCIPAL = ["longueur", "forme-du-journal"] as const;

export type CauseDeRefusDePrincipal = (typeof CAUSES_DE_REFUS_DE_PRINCIPAL)[number];

/** Ce que rend la confrontation d'un principal. **JAMAIS un booléen seul.** */
export interface VerdictDePrincipal {
  /** Combien de causes ont RÉELLEMENT été confrontées. Plancher : 2. */
  readonly causesConfrontees: number;
  /** La borne lue chez le port, ANNONCÉE — une borne qu'on ne voit pas ne se surveille pas. */
  readonly maxCar: number;
  /** La longueur de la valeur. **Jamais la valeur.** */
  readonly longueur: number;
  readonly violees: readonly CauseDeRefusDePrincipal[];
  readonly anomalies: readonly string[];
  readonly conforme: boolean;
}

/**
 * Le principal proposé ne peut pas entrer dans une ligne d'`ops_audit`.
 *
 * ⚠️ **ELLE NE PORTE JAMAIS LA VALEUR FAUTIVE.** Ce qui arrive ici vient d'une
 *    demande d'autorisation, donc de l'extérieur, et peut porter du contenu. Le
 *    § 15 interdit qu'une erreur le fasse fuir. Elle porte la LONGUEUR et la
 *    CAUSE : c'est ce qui distingue « le champ est vide » de « le champ porte une
 *    phrase », sans rien recopier.
 */
export class ErreurPrincipalRefuse extends Error {
  public readonly longueur: number;
  public readonly violees: readonly CauseDeRefusDePrincipal[];

  public constructor(verdict: VerdictDePrincipal) {
    super(
      "§ 31 — principal refusé À L'ÉMISSION : une valeur que le journal n'accepterait pas " +
        "ferait perdre la LIGNE de chaque appel qui la porte, et avec elle l'invariant du " +
        `§ 11. ${verdict.anomalies.join(" · ")} Corriger le principal de la demande ` +
        "d'autorisation, puis réémettre.",
    );
    this.name = "ErreurPrincipalRefuse";
    this.longueur = verdict.longueur;
    this.violees = verdict.violees;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFRONTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CONFRONTE UN PRINCIPAL À LA FORME DU JOURNAL, ET DIT CE QUI A MORDU.
 *
 * ⚠️ **LES DEUX CAUSES SONT SÉPARÉES PAR UNE SECONDE LECTURE DE LA MÊME RÈGLE,
 *    PAS PAR UNE RÈGLE DE PLUS.** `estIdentifiantDeJournal()` rend un booléen ;
 *    l'interroger une fois avec la borne RÉELLE et une fois avec une borne
 *    infinie sépare « trop long » de « mauvaise forme » **sans écrire une seule
 *    condition de forme ici**. Une expression régulière locale aurait donné le
 *    même message et une seconde vérité à tenir.
 */
export function verdictDUnPrincipal(
  valeur: string,
  bornes: BornesDIdentifiantDuJournal = BORNES_DU_JOURNAL,
): VerdictDePrincipal {
  const { maxCar } = bornes("principal");
  const violees: CauseDeRefusDePrincipal[] = [];
  const anomalies: string[] = [];

  // Cause 1 — la LONGUEUR. Mesurée en interrogeant la règle du journal avec la
  // borne réelle et sans borne : l'écart entre les deux réponses EST la cause.
  const sansBorne = estIdentifiantDeJournal(valeur, Number.MAX_SAFE_INTEGER);
  const avecBorne = estIdentifiantDeJournal(valeur, maxCar);
  if (sansBorne && !avecBorne) {
    violees.push("longueur");
    anomalies.push(
      `longueur ${String(valeur.length)}, au-delà de la borne ${String(maxCar)} de la colonne ` +
        "`ops_audit.principal` — un journal ne porte pas de texte libre.",
    );
  }

  // Cause 2 — la FORME. C'est le reste : espace, caractère de contrôle, « @ »,
  // ou trop de segments alphabétiques (la signature d'une phrase francisée).
  if (!sansBorne) {
    violees.push("forme-du-journal");
    anomalies.push(
      `valeur de ${String(valeur.length)} caractère(s) qui n'a pas la forme d'un identifiant ` +
        "de journal (§ 31) : ni espace, ni caractère de contrôle, ni « @ », et pas la forme " +
        "d'une phrase dont les espaces auraient été remplacés.",
    );
  }

  return {
    causesConfrontees: CAUSES_DE_REFUS_DE_PRINCIPAL.length,
    maxCar,
    longueur: valeur.length,
    violees,
    anomalies,
    conforme: violees.length === 0,
  };
}

/**
 * **LE SEUL CHEMIN VERS UN {@link PrincipalEmis} DE TOUT LE DÉPÔT.**
 *
 * ⚠️ **LA CONVERSION FORCÉE CI-DESSOUS EST LA SEULE DU MODULE PROPRIÉTAIRE, ET
 *    C'EST ELLE QUE TOUT LE RESTE DU FICHIER PROTÈGE.** Même motif, et même
 *    discipline, que `frapperUneSession()` dans `core/identite/session.ts` : elle
 *    est écrite UNE fois, ici, sur une valeur que cette fonction vient de
 *    confronter — jamais sur une valeur reçue telle quelle.
 *
 *    La marque de `PrincipalEmis` est un `unique symbol` NON exporté
 *    (`core/auth/contrat.ts`) : aucun module ne peut nommer la propriété, donc
 *    aucun ne peut écrire un littéral assignable. Ce qui reste écrivable est
 *    `"…" as unknown as PrincipalEmis`, comme toute conversion forcée en
 *    TypeScript — et c'est la garde de texte de
 *    `core/auth/emetteur.temoin.spec.ts` qui la compte, en disant qu'elle ne
 *    prouve que l'absence de la FORME ÉCRITE.
 *
 * @throws {ErreurPrincipalRefuse} sur toute valeur que le journal refuserait.
 */
export function admettreUnPrincipal(
  valeur: string,
  bornes: BornesDIdentifiantDuJournal = BORNES_DU_JOURNAL,
): PrincipalEmis {
  const verdict = verdictDUnPrincipal(valeur, bornes);
  if (!verdict.conforme) throw new ErreurPrincipalRefuse(verdict);
  return valeur as PrincipalEmis;
}
