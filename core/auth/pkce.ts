/**
 * `core/auth/pkce.ts` — **`S256` OBLIGATOIRE, `plain` REFUSÉ.**
 *
 * ═══ LA DÉCISION, ET POURQUOI ELLE NE COÛTE RIEN ICI ═══
 *
 * L'ADR 0027, point 2 : PKCE `S256` obligatoire, `plain` refusé, un
 * `code_challenge_method` absent refusé. **Il n'existe aucun client historique à
 * ménager : le socle n'a jamais émis de jeton.** La compatibilité ascendante
 * qu'on invoque d'ordinaire pour garder `plain` n'a, ici, pas d'objet — et le
 * dire est ce qui empêche de la réinventer plus tard.
 *
 * ═══ POURQUOI `plain` EST NOMMÉ PLUTÔT QU'OMIS ═══
 *
 * ⚠️ **UNE MÉTHODE ABSENTE DE LA LISTE DES ADMISES ET ABSENTE DE TOUT LE FICHIER
 *    EST UNE MÉTHODE QUE PERSONNE NE SAIT AVOIR ÉTÉ ÉCARTÉE.** `plain` est donc
 *    inscrit dans {@link METHODES_DE_DEFI_REFUSEES}, avec son motif : le défi y
 *    est le vérificateur lui-même, si bien qu'un intercepteur du code
 *    d'autorisation obtient le vérificateur avec lui, et PKCE ne protège plus
 *    rien. La garde mesure que les deux ensembles sont DISJOINTS et que
 *    `verifierLeDefi` refuse chacun des refusés — sans quoi la liste serait un
 *    commentaire.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** La seule méthode admise (RFC 7636, § 4.2). */
export const METHODES_DE_DEFI_ADMISES = ["S256"] as const;

export type MethodeDeDefi = (typeof METHODES_DE_DEFI_ADMISES)[number];

/**
 * Les méthodes NOMMÉMENT refusées, avec leur motif. Ce n'est pas la liste des
 * valeurs impossibles — c'est la liste de celles qu'un client réel enverra.
 */
export const METHODES_DE_DEFI_REFUSEES = [
  {
    methode: "plain",
    motif:
      "le défi EST le vérificateur : qui intercepte le code d'autorisation intercepte le " +
      "vérificateur avec lui, et PKCE cesse de protéger quoi que ce soit. Le socle n'a jamais " +
      "émis de jeton — il n'existe aucun client historique à ménager.",
  },
] as const;

/**
 * Bornes du `code_verifier` (RFC 7636, § 4.1) : 43 à 128 caractères de
 * l'alphabet non réservé.
 *
 * ⚠️ **LE PLANCHER N'EST PAS DÉCORATIF.** Un vérificateur court est devinable,
 *    et un vérificateur devinable rend le défi inutile : l'attaquant qui tient
 *    le code d'autorisation énumère le vérificateur et termine l'échange.
 */
export const LONGUEUR_MINIMALE_VERIFICATEUR = 43;
export const LONGUEUR_MAXIMALE_VERIFICATEUR = 128;

/** L'alphabet du § 4.1 de la RFC 7636. Ancré aux deux bouts. */
export const FORME_DU_VERIFICATEUR = /^[A-Za-z0-9\-._~]+$/;

/**
 * Le défi attendu pour ce vérificateur : `base64url(sha256(verificateur))`,
 * **sans remplissage** (RFC 7636, § 4.2).
 */
export function defiAttendu(verificateur: string): string {
  return createHash("sha256").update(verificateur, "ascii").digest("base64url");
}

/** Les causes de refus, nommées séparément pour être comptées séparément. */
export const CAUSES_DE_REFUS_PKCE = [
  "méthode-absente",
  "méthode-refusée",
  "vérificateur-hors-forme",
  "défi-non-concordant",
] as const;

export type CauseDeRefusPkce = (typeof CAUSES_DE_REFUS_PKCE)[number];

/** Le verdict d'un échange PKCE. **Des noms et des comptes.** */
export interface VerdictDePkce {
  /** Combien de contrôles ont RÉELLEMENT été évalués avant l'issue. */
  readonly controlesConfrontes: number;
  readonly admis: boolean;
  readonly cause: CauseDeRefusPkce | null;
  readonly motif: string;
}

/**
 * La méthode annoncée est-elle celle qu'on admet ?
 *
 * ⚠️ **UNE MÉTHODE ABSENTE EST REFUSÉE, JAMAIS SUPPOSÉE.** La RFC 6749 fait de
 *    l'absence un défaut à `plain` ; c'est le repli permissif qu'on écrit sans y
 *    penser, et il vaut ici exactement le refus de `plain`.
 */
export function methodeAdmise(methode: string | undefined): boolean {
  return methode !== undefined && (METHODES_DE_DEFI_ADMISES as readonly string[]).includes(methode);
}

/**
 * LE VERDICT SUR LA SEULE MÉTHODE — `null` quand elle est admise.
 *
 * ⚠️ **ELLE EST EXTRAITE PARCE QU'ELLE SE JUGE DEUX FOIS, À DEUX MOMENTS.**
 *    `/auth/authorize` la juge AVANT de rendre un code : accepter un défi `plain`
 *    au consentement pour le refuser à l'échange ferait perdre à un humain son
 *    consentement pour une raison qu'il n'apprendrait qu'après. `/auth/token` la
 *    rejuge, parce qu'un émetteur qui fait confiance à ce qu'il a stocké fait
 *    confiance à son propre magasin. **Deux appels, une seule règle** — et
 *    l'extraction est ce qui rend la seconde impossible à écrire autrement.
 */
export function verdictDeLaMethodeDeDefi(methode: string | undefined): VerdictDePkce | null {
  if (methode === undefined) {
    return {
      controlesConfrontes: 1,
      admis: false,
      cause: "méthode-absente",
      motif:
        "`code_challenge_method` absent. Le socle ne suppose AUCUN défaut : la RFC 6749 fait " +
        "de l'absence un défaut à `plain`, c'est-à-dire au repli que l'ADR 0027 refuse. " +
        `Envoyer \`code_challenge_method=${METHODES_DE_DEFI_ADMISES.join("|")}\`.`,
    };
  }

  if (!methodeAdmise(methode)) {
    const connue = METHODES_DE_DEFI_REFUSEES.find((refusee) => refusee.methode === methode);
    return {
      controlesConfrontes: 2,
      admis: false,
      cause: "méthode-refusée",
      motif:
        `méthode de défi refusée. ${connue?.motif ?? "elle n'est pas admise par le socle."} ` +
        `La seule admise est ${METHODES_DE_DEFI_ADMISES.join(", ")}.`,
    };
  }

  return null;
}

/**
 * CONFRONTE UN VÉRIFICATEUR AU DÉFI STOCKÉ À L'AUTORISATION.
 *
 * ⚠️ **LA COMPARAISON FINALE EST À TEMPS CONSTANT.** Un `===` fuit, par son
 *    temps de retour, le nombre de caractères de tête corrects — de quoi
 *    construire le défi caractère par caractère quand cette comparaison garde
 *    l'échange d'un code contre un jeton.
 *
 * ⚠️ **ELLE S'ARRÊTE À LA PREMIÈRE CAUSE, ET LE COMPTE LE DIT.** Contrairement à
 *    la forme de l'audience — où l'exploitant répare une configuration et mérite
 *    tous les motifs d'un coup —, ici l'appelant est un CLIENT : lui dire
 *    combien de contrôles il a franchis avant d'échouer lui donnerait un oracle.
 *    `controlesConfrontes` est donc le rang du contrôle qui a tranché, et le
 *    motif ne dit jamais laquelle des valeurs il avait juste.
 */
export function verifierLeDefi(
  verificateur: string,
  defi: string,
  methode: string | undefined,
): VerdictDePkce {
  const surLaMethode = verdictDeLaMethodeDeDefi(methode);
  if (surLaMethode !== null) return surLaMethode;

  if (
    verificateur.length < LONGUEUR_MINIMALE_VERIFICATEUR ||
    verificateur.length > LONGUEUR_MAXIMALE_VERIFICATEUR ||
    !FORME_DU_VERIFICATEUR.test(verificateur)
  ) {
    return {
      controlesConfrontes: 3,
      admis: false,
      cause: "vérificateur-hors-forme",
      // Jamais la valeur : un vérificateur est un secret à usage unique.
      motif:
        `\`code_verifier\` hors forme (${String(verificateur.length)} caractère(s)). ` +
        `RFC 7636 § 4.1 : de ${String(LONGUEUR_MINIMALE_VERIFICATEUR)} à ` +
        `${String(LONGUEUR_MAXIMALE_VERIFICATEUR)} caractères de l'alphabet non réservé.`,
    };
  }

  const attendu = Buffer.from(defiAttendu(verificateur), "utf8");
  const presente = Buffer.from(defi, "utf8");
  const concorde = attendu.byteLength === presente.byteLength && timingSafeEqual(attendu, presente);

  return concorde
    ? { controlesConfrontes: 4, admis: true, cause: null, motif: "défi concordant." }
    : {
        controlesConfrontes: 4,
        admis: false,
        cause: "défi-non-concordant",
        motif:
          "le `code_verifier` ne correspond pas au `code_challenge` de l'autorisation. " +
          "Recommencer à `/auth/authorize` — le code est consommé de toute façon.",
      };
}
