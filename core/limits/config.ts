/**
 * axion-ops — les limites de DÉPART (§ 26) et la forme des compteurs.
 *
 * ── Pourquoi une configuration nommée, et pas des nombres dans la logique ──
 * Le § 17 renvoie le réglage FIN au lot 10. « On ne règle finement au lot 10
 * que ce qui a une valeur de départ » : ces quatre valeurs sont donc des
 * valeurs de DÉPART, destinées à bouger. Écrites en dur dans la fonction qui
 * décide, elles auraient été à retrouver dans le code au lot 10, une par une,
 * par un `grep` sur des entiers — la façon la plus sûre d'en oublier une.
 *
 * ── Ce qu'un compteur doit porter ─────────────────────────────────────────
 * § 12, `ops_quota` : « UN COMPTEUR SANS DÉNOMINATEUR NE PEUT NI REFUSER NI
 * ALERTER À 80 %. » `limit` et `warnAt` voyagent donc AVEC le compteur, dans
 * la ligne, et ne sont pas devinés à la lecture. C'est ce que ce fichier
 * calcule.
 */

import { EFFECTS, type Effect } from "../types.js";

/** Une heure, en millisecondes. */
export const UNE_HEURE_MS = 3_600_000;

/** Dix secondes, en millisecondes — la fenêtre de rafale du § 26. */
export const DIX_SECONDES_MS = 10_000;

/**
 * BORNE HAUTE de la durée de réservation d'idempotence (§ 12, `ops_idempotency`).
 *
 * POURQUOI UNE BORNE, ET POURQUOI ICI. `reserver` calcule
 * `expiresAt = maintenant + ttlMs`. Sans borne, un `ttlMs` non fini produit une
 * `Invalid Date`, dont le `getTime()` vaut `NaN` : la comparaison de péremption
 * `expiresAt <= maintenant` est alors TOUJOURS fausse, et le couple
 * `(tool, key)` ne se libère PLUS JAMAIS. La direction est fail-closed — la clé
 * reste verrouillée, elle ne sert jamais un résultat à tort — mais elle est
 * DÉFINITIVE et MUETTE, ce qui est la pire forme d'un défaut.
 *
 * 24 h aligne cette durée sur `TTL_DESSERRAGE_MAX_MS` du § 20 : c'est la plus
 * longue fenêtre pendant laquelle le socle accepte de se souvenir d'une
 * décision sans qu'un humain la reconduise. À confirmer par Will, en un seul
 * endroit — celui-ci.
 */
export const TTL_IDEMPOTENCE_MAX_MS = 24 * UNE_HEURE_MS;

/**
 * Le seuil d'alerte par défaut, en fraction du dénominateur. § 12 :
 * « ni refuser ni alerter à 80 % » — c'est de cette phrase que vient 0,8.
 */
export const RATIO_ALERTE = 0.8;

/**
 * Ce qui identifie le compteur, en plus de la fenêtre.
 *
 * · `principal` — un compteur pour tout ce que fait ce porteur de jeton,
 *   quel que soit l'outil. `ops_quota.tool` y vaut {@link TOUT_OUTIL}.
 * · `outil`     — un compteur par couple (outil, porteur).
 */
export type PorteeCompteur = "principal" | "outil";

/** À quels `effect` la limite s'applique. */
export type PortantSurEffets = "tous" | "lecture" | "ecriture";

/** Une limite de départ, telle que le § 26 la nomme. */
export interface LimiteDeDepart {
  /** Le libellé du § 26, pour que le refus puisse DIRE laquelle a mordu. */
  readonly libelle: string;
  /** Le dénominateur. */
  readonly limite: number;
  /** La largeur de la fenêtre de comptage. */
  readonly fenetreMs: number;
  readonly portee: PorteeCompteur;
  readonly effets: PortantSurEffets;
}

/**
 * LES QUATRE LIMITES DE DÉPART DU § 26.
 *
 * ⚠️ L'ORDRE DES CLÉS EST SIGNIFIANT : les compteurs sont éprouvés dans cet
 *    ordre, du plus court terme au plus long. Deux raisons :
 *     · le refus rendu est celui du PREMIER compteur qui mord, et c'est son
 *       `resetAt` qui remplit le `Retry-After` (§ 15, « dit quand réessayer »).
 *       Annoncer « réessayez dans 47 minutes » alors que la rafale se rouvre
 *       dans 3 secondes serait exact et inutilisable ;
 *     · moins de compteurs déjà incrémentés à compenser quand un refus tombe
 *       (voir `consommer`, quota.ts).
 */
export const LIMITES_DE_DEPART = {
  rafale: {
    libelle: "rafale (10 / 10 s)",
    limite: 10,
    fenetreMs: DIX_SECONDES_MS,
    portee: "principal",
    effets: "tous",
  },
  outilLecture: {
    libelle: "par outil de lecture (60 / h)",
    limite: 60,
    fenetreMs: UNE_HEURE_MS,
    portee: "outil",
    effets: "lecture",
  },
  outilEcriture: {
    libelle: "par outil d'écriture (20 / h)",
    limite: 20,
    fenetreMs: UNE_HEURE_MS,
    portee: "outil",
    effets: "ecriture",
  },
  jeton: {
    libelle: "par jeton (300 / h)",
    limite: 300,
    fenetreMs: UNE_HEURE_MS,
    portee: "principal",
    effets: "tous",
  },
} as const satisfies Readonly<Record<string, LimiteDeDepart>>;

/** La clé d'une limite, en union fermée, DÉRIVÉE de la configuration. */
export type CleLimite = keyof typeof LIMITES_DE_DEPART;

/** Les clés, dans l'ordre d'évaluation. Dérivées, jamais recopiées. */
export const CLES_LIMITES = Object.keys(LIMITES_DE_DEPART) as readonly CleLimite[];

/**
 * La valeur de `ops_quota.tool` pour un compteur de portée `principal`.
 * L'unicité de la table est `(window, tool, principal)` : il faut une valeur,
 * et il en faut une qui ne puisse jamais être un nom d'outil réel — les noms
 * d'outils sont préfixés par l'identifiant de leur adaptateur (§ 09).
 */
export const TOUT_OUTIL = "*";

/**
 * `read` est la seule lecture ; tout le reste écrit. DÉRIVÉ de l'énumération,
 * pas d'une liste : ajouter un `effect` au § 09 le range automatiquement du
 * côté ÉCRITURE, c'est-à-dire du côté le plus contraint. Une liste écrite à la
 * main l'aurait rangé du côté permissif — sans un mot.
 */
export function estLecture(effect: Effect): boolean {
  return effect === "read";
}

/** Les `effect` d'écriture, dérivés de `EFFECTS`. Utile aux gardes. */
export const EFFETS_ECRITURE: readonly Effect[] = EFFECTS.filter((e) => !estLecture(e));

/** Cette limite s'applique-t-elle à cet `effect` ? */
export function sApplique(limite: LimiteDeDepart, effect: Effect): boolean {
  switch (limite.effets) {
    case "tous":
      return true;
    case "lecture":
      return estLecture(effect);
    case "ecriture":
      return !estLecture(effect);
  }
}

/** Seuil d'alerte par défaut, en VALEUR ABSOLUE (c'est ce que stocke la table). */
export function warnAtParDefaut(limite: number): number {
  return Math.max(1, Math.floor(limite * RATIO_ALERTE));
}

/** Un dénominateur ou un seuil d'alerte qui ne peut pas faire son office. */
export class ErreurConfigurationQuota extends Error {
  constructor(motif: string) {
    super(
      `Configuration de quota inutilisable : ${motif}. ` +
        "Le socle refuse l'appel plutôt que de servir un compteur qui ne peut " +
        "ni refuser ni alerter — un plafond qu'on ne compte pas est un mur qu'on " +
        "découvre en le percutant.",
    );
    this.name = "ErreurConfigurationQuota";
  }
}

/**
 * Éprouve un couple (dénominateur, seuil d'alerte) AVANT de s'en servir.
 *
 * Pourquoi lever plutôt que rectifier : un `warnAt` supérieur à `limit`
 * n'alerte JAMAIS — le compteur refuse avant de l'atteindre. Rectifié en
 * silence, le défaut de saisie de la console ne se voit nulle part et l'écran
 * Quotas montre une alerte qui ne se déclenchera pas. Levé, il est visible.
 *
 * @throws {ErreurConfigurationQuota}
 */
export function validerDenominateur(limite: number, warnAt: number): void {
  if (!Number.isInteger(limite) || limite < 1) {
    throw new ErreurConfigurationQuota(`dénominateur « ${String(limite)} » non entier ou nul`);
  }
  if (!Number.isInteger(warnAt) || warnAt < 1) {
    throw new ErreurConfigurationQuota(`seuil d'alerte « ${String(warnAt)} » non entier ou nul`);
  }
  if (warnAt > limite) {
    throw new ErreurConfigurationQuota(
      `seuil d'alerte ${String(warnAt)} au-dessus du dénominateur ${String(limite)} — il n'alerterait jamais`,
    );
  }
}

/** Une fenêtre de comptage, sous la forme canonique qu'attend `ops_quota`. */
export interface Fenetre {
  /** `ops_quota.window` — ex. `rafale|2026-08-30T14:03:20.000Z`. */
  readonly window: string;
  /** Début de la fenêtre. */
  readonly debut: Date;
  /** `ops_quota.resetAt` — instant où le compteur repart de zéro. */
  readonly resetAt: Date;
}

/**
 * Fenêtre GLISSANTE PAR PALIERS (« tumbling window ») : l'instant est arrondi
 * au multiple inférieur de la largeur.
 *
 * ⚠️ Propriété connue et ASSUMÉE à ce lot : un appelant peut placer `limite`
 *    appels à la fin d'une fenêtre et `limite` au début de la suivante, soit
 *    2 × `limite` sur un intervalle court à cheval. Pour la rafale, cela
 *    autorise 20 appels en un peu plus de 10 s. Une fenêtre vraiment glissante
 *    exige de garder les horodatages des N derniers appels, donc une table de
 *    plus que le § 12 n'a pas ; c'est un réglage du lot 10. Voir README.
 *
 * La clé porte la clé de limite en préfixe : sans elle, le compteur `rafale`
 * et le compteur `jeton` d'un même principal partageraient la ligne dès que
 * leurs fenêtres coïncident, et l'unicité `(window, tool, principal)` de la
 * table ferait de deux plafonds un seul.
 */
export function fenetreCanonique(cle: CleLimite, fenetreMs: number, maintenant: Date): Fenetre {
  if (!Number.isInteger(fenetreMs) || fenetreMs < 1) {
    throw new ErreurConfigurationQuota(`largeur de fenêtre « ${String(fenetreMs)} » invalide`);
  }
  const t = maintenant.getTime();
  const debutMs = Math.floor(t / fenetreMs) * fenetreMs;
  const debut = new Date(debutMs);
  return {
    window: `${cle}|${debut.toISOString()}`,
    debut,
    resetAt: new Date(debutMs + fenetreMs),
  };
}

/** Un compteur à incrémenter, entièrement résolu : identité ET dénominateur. */
export interface PlanCompteur {
  readonly cle: CleLimite;
  readonly libelle: string;
  readonly window: string;
  readonly tool: string;
  readonly principal: string;
  readonly limit: number;
  readonly warnAt: number;
  readonly resetAt: Date;
}

/** Ce qu'il faut savoir pour résoudre les compteurs d'un appel. */
export interface DemandeResolution {
  readonly tool: string;
  readonly effect: Effect;
  readonly principal: string;
  /**
   * `ops_tool.limit` — dénominateur PROPRE à cet outil, réglé en console.
   * `null` = la limite de départ du § 26 s'applique.
   * N'affecte QUE les compteurs de portée `outil` : un outil ne peut pas
   * relever le plafond de 300/h du jeton, sinon la console desserrerait par
   * un champ ce que le § 20 fait passer par un second facteur.
   */
  readonly limiteOutil: number | null;
  /** `ops_tool.warnAt`. `null` = {@link warnAtParDefaut} du dénominateur retenu. */
  readonly warnAtOutil: number | null;
  readonly maintenant: Date;
}

/**
 * Les compteurs à incrémenter pour cet appel, DANS L'ORDRE D'ÉVALUATION.
 *
 * Rien n'y est écrit à la main : les compteurs sont dérivés de
 * `LIMITES_DE_DEPART` par `sApplique`. Ajouter une limite au § 26 la fait
 * apparaître ici sans qu'aucune liste ne soit à retoucher.
 *
 * @throws {ErreurConfigurationQuota} si un dénominateur de console est absurde.
 */
export function resoudreCompteurs(demande: DemandeResolution): readonly PlanCompteur[] {
  if (demande.tool.trim().length === 0) {
    throw new ErreurConfigurationQuota("appel sans nom d'outil");
  }
  if (demande.principal.trim().length === 0) {
    throw new ErreurConfigurationQuota("appel sans principal");
  }

  const plans: PlanCompteur[] = [];

  for (const cle of CLES_LIMITES) {
    const limite = LIMITES_DE_DEPART[cle];
    if (!sApplique(limite, demande.effect)) continue;

    const surOutil = limite.portee === "outil";
    const denominateur =
      surOutil && demande.limiteOutil !== null ? demande.limiteOutil : limite.limite;
    const seuil =
      surOutil && demande.warnAtOutil !== null
        ? demande.warnAtOutil
        : warnAtParDefaut(denominateur);

    validerDenominateur(denominateur, seuil);

    const fenetre = fenetreCanonique(cle, limite.fenetreMs, demande.maintenant);

    plans.push({
      cle,
      libelle: limite.libelle,
      window: fenetre.window,
      tool: surOutil ? demande.tool : TOUT_OUTIL,
      principal: demande.principal,
      limit: denominateur,
      warnAt: seuil,
      resetAt: fenetre.resetAt,
    });
  }

  return plans;
}
