/**
 * `adapters/zoho-mail/bootstrap/amorcage.ts` — **LE GESTE, EN ENTIER, ET LA
 * PART DE WILL RÉDUITE À UN CLIC.**
 *
 * ═══ CE QUE CE FICHIER SÉQUENCE, ET DANS CET ORDRE ═══
 *
 *  0. **Le mandat.** Sans lui, rien. Voir `mandat.ts` — c'est la garde qui rend
 *     un amorçage automatique impossible, et elle est le PREMIER contrôle.
 *  1. **La configuration**, lue et REFUSÉE en nommant les variables manquantes.
 *  2. **Le coffre doit être OUVERT.** Un coffre verrouillé ne peut ni compter ni
 *     déposer ; le dire tôt évite de faire cliquer Will pour rien.
 *  3. **Le constat**, sans rien écrire : l'ancre existe-t-elle, combien
 *     d'amorçages, quelle version de jeton. C'est ce qui produit
 *     l'AVERTISSEMENT du § 27 sur un coffre déjà pourvu.
 *  4. **LE COMPTE, AVANT TOUT LE RESTE.** Le plafond mord ici — c'est-à-dire
 *     **avant** que l'URL soit affichée, **avant** le clic, **avant** que Zoho
 *     émette quoi que ce soit. Un refus à cette étape ne consomme rien.
 *  5. **L'URL.** Affichée. **C'est la seule chose que Will fait : cliquer.**
 *  6. **Le rappel local**, un seul code, puis la porte se ferme.
 *  7. **L'échange**, le seul appel sortant de tout le dossier.
 *  8. **Le dépôt** au coffre, en version neuve.
 *  9. **Le rapport** : des noms, des états, des comptes, des empreintes.
 *     **Jamais une valeur.**
 *
 * ⚠️ **POURQUOI COMPTER AVANT DE FAIRE CLIQUER, ET NON APRÈS AVOIR REÇU LE
 *    JETON.** Compter après ferait du compteur un décompte de SUCCÈS, alors que
 *    ce que le plafond de Zoho limite, ce sont les jetons ÉMIS. Un amorçage qui
 *    échoue entre l'échange et le dépôt — le processus meurt, la base est
 *    injoignable — a pourtant fait émettre un jeton. Compter d'abord fait du
 *    compte un **majorant** du nombre de jetons vivants ; compter ensuite en
 *    ferait un minorant, et un compteur qui sous-estime un plafond est pire que
 *    pas de compteur.
 *
 * ⚠️ **AUCUN SECRET DANS LE RAPPORT.** Le `client_secret` n'apparaît nulle part.
 *    Le jeton n'apparaît que par son empreinte publique et sa longueur. L'URL
 *    d'autorisation porte le `client_id` — elle est écrite sur le terminal de
 *    Will, jamais dans un fichier de ce dépôt.
 */

import {
  REGION_DU_CLIENT,
  URI_DE_REDIRECTION_LOCALE,
  VARIABLE_CLIENT_ID,
  VARIABLE_CLIENT_SECRET,
  VARIABLE_REGION,
  VARIABLE_URI_DE_REDIRECTION,
  construireLUrlDAutorisation,
  fabriquerUnEtat,
  motifDUriInvalide,
  regionDepuisLaChaine,
  scopesRetenus,
} from "./autorisation.js";
import type { RegionZoho } from "./autorisation.js";
import {
  NOM_DE_L_ANCRE,
  VARIABLE_PLAFOND,
  avertissementDeSecondAmorcage,
  compterCetAmorcage,
  constaterLAmorcage,
  deposerLeJeton,
  ecartDeDerivationDuPlafond,
  plafondEnVigueur,
} from "./coffre-du-jeton.js";
import type { LecteurDeVersions } from "./coffre-du-jeton.js";
import { ErreurDEchange, decrireLesJetons } from "./jetons.js";
import type { EchangeurDeJetons } from "./jetons.js";
import { estUnMandatDelivre } from "./mandat.js";
import { attendreLeCode } from "./rappel.js";
import type { DemandeDAttente, IssueDeLAttente } from "./rappel.js";
import type { Coffre } from "../../../core/vault/index.js";
import { estErreurDeCoffre } from "../../../core/vault/erreurs.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI PEUT ARRÊTER UN AMORÇAGE — TOUT EST NOMMÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **UN CODE DE SORTIE À 1 NE DIT PAS LEQUEL DES HUIT.** Et ils appellent des
 *    gestes opposés : `plafond-atteint` INTERDIT de recommencer, tandis que
 *    `rappel-sans-code` est sans conséquence et se rejoue à volonté.
 */
export const REFUS_D_AMORCAGE = [
  /** Verrou du § 27 : le geste n'a pas été demandé par un humain, à la commande. */
  "mandat-absent",
  /** Une variable manque. Le refus les NOMME. */
  "configuration-incomplete",
  /** Le coffre n'est pas ouvert : ni compter ni déposer n'est possible. */
  "coffre-non-ouvert",
  /** Le plafond d'amorçages est atteint. RIEN n'a été demandé à Zoho. */
  "plafond-atteint",
  /** La boîte aux lettres locale n'a pas reçu de code utilisable. */
  "rappel-sans-code",
  /** Zoho a refusé l'échange, ou a rendu une réponse inutilisable. */
  "echange-refuse",
  /** Le jeton est arrivé et le coffre n'a pas voulu l'écrire. Le plus grave. */
  "depot-impossible",
] as const;

export type RefusDAmorcage = (typeof REFUS_D_AMORCAGE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROGRAMME REND
// ═════════════════════════════════════════════════════════════════════════════

export interface RapportDAmorcage {
  /** Jusqu'où le geste est allé. Des noms d'étapes, dans l'ordre franchi. */
  readonly etapesFranchies: readonly string[];
  /** Amorçages comptés APRÈS ce geste. `null` si le compte n'a pas eu lieu. */
  readonly compte: number | null;
  /**
   * **LE PLAFOND QUE LE COFFRE APPLIQUE.** `null` tant qu'aucune ancre n'existe
   * — il n'y a alors personne à qui le demander. Ce n'est PAS `plafondAttendu`,
   * et l'écart entre les deux est signalé dans les lignes du rapport.
   */
  readonly plafond: number | null;
  /** Ce que l'environnement annonce. Un TÉMOIN, jamais la décision. */
  readonly plafondAttendu: number;
  readonly originePlafond: string;
  /** Amorçages restants avant le mur, selon le COFFRE. `null` si inconnu. */
  readonly reste: number | null;
  /** La version sous laquelle le jeton a été déposé. `null` si rien n'a été déposé. */
  readonly versionDuJeton: number | null;
  /** Un jeton a-t-il été ÉMIS PAR ZOHO ? Distinct de « déposé au coffre ». */
  readonly jetonEmisParZoho: boolean;
  readonly repetition: boolean;
  readonly refus: RefusDAmorcage | null;
  readonly lignes: readonly string[];
}

/** Ce que l'amorçage touche du monde. Tout est remis, rien n'est lu en douce. */
export interface MondeDAmorcage {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly ecrire: (ligne: string) => void;
  readonly coffre: Coffre;
  readonly versions: LecteurDeVersions;
  readonly echangeur: EchangeurDeJetons;
  /** Injecté pour que les gardes n'ouvrent aucun port. Défaut : le vrai serveur. */
  readonly ouvrirLaBoiteAuxLettres?: (demande: DemandeDAttente) => Promise<IssueDeLAttente>;
  /** Injecté pour que les gardes puissent fixer le `state`. Défaut : de l'aléa. */
  readonly fabriquerUnEtat?: () => string;
  /**
   * `true` : le geste s'arrête APRÈS l'affichage de l'URL et AVANT toute
   * ouverture de port. Il répond à « ma configuration est-elle bonne ? » sans
   * rien consommer.
   */
  readonly repetition?: boolean;
}

/** La configuration lue, sans le secret — qui ne quitte pas la portée d'`amorcer`. */
interface ConfigurationLue {
  readonly region: RegionZoho;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly uriDeRedirection: string;
  readonly uriEstLocale: boolean;
  readonly manques: readonly string[];
  readonly remarques: readonly string[];
}

/**
 * Lit la configuration. **Elle ne lève pas** : elle rend la liste des manques,
 * pour que le refus les nomme TOUS d'un coup. Un refus qui n'annonce que le
 * premier manque fait relancer la commande autant de fois qu'il en reste.
 */
function lireLaConfiguration(env: Readonly<Record<string, string | undefined>>): ConfigurationLue {
  const manques: string[] = [];
  const remarques: string[] = [];

  const clientId = (env[VARIABLE_CLIENT_ID] ?? "").trim();
  if (clientId === "") manques.push(VARIABLE_CLIENT_ID);

  const clientSecret = (env[VARIABLE_CLIENT_SECRET] ?? "").trim();
  if (clientSecret === "") manques.push(VARIABLE_CLIENT_SECRET);

  const regionBrute = env[VARIABLE_REGION];
  let region = REGION_DU_CLIENT;
  if (regionBrute !== undefined && regionBrute.trim() !== "") {
    const lue = regionDepuisLaChaine(regionBrute.trim());
    if (lue === null) {
      manques.push(`${VARIABLE_REGION} (« ${regionBrute} » n'est pas une région Zoho connue)`);
    } else {
      region = lue;
      if (lue !== REGION_DU_CLIENT) {
        remarques.push(
          `⚠️ Région « ${lue} », alors que le § 27 pose l'UE. Un client OAuth créé dans une ` +
            "région n'est valide QUE dans celle-là, et le refus de Zoho parle d'un client " +
            "inconnu, jamais d'une région.",
        );
      }
    }
  }

  const uriPosee = (env[VARIABLE_URI_DE_REDIRECTION] ?? "").trim();
  const uriDeRedirection = uriPosee === "" ? URI_DE_REDIRECTION_LOCALE : uriPosee;
  const motif = motifDUriInvalide(uriDeRedirection);
  if (motif !== null) {
    manques.push(`${VARIABLE_URI_DE_REDIRECTION} (${motif})`);
  }
  const uriEstLocale = uriDeRedirection === URI_DE_REDIRECTION_LOCALE;
  if (uriPosee !== "" && !uriEstLocale) {
    remarques.push(
      `⚠️ L'URI de redirection posée n'est pas celle de la boucle locale. Le § 27 en déclare ` +
        "DEUX à la console Zoho, et l'autre est celle de la production : l'amorçage " +
        "depuis la production est l'une des deux options du transfert, et elle n'est PAS " +
        "tranchée (voir `DEPS.md`). Le serveur de rappel de ce dossier refusera de se " +
        "poser ailleurs que sur la boucle locale.",
    );
  }

  return { region, clientId, clientSecret, uriDeRedirection, uriEstLocale, manques, remarques };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE GESTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **AMORCE — OU REFUSE EN DISANT POURQUOI, ET CE QUE ÇA A COÛTÉ.**
 *
 * ⚠️ **`mandat` EST DÉLIBÉRÉMENT DE TYPE `unknown`.** Le typer
 *    `MandatDAmorcage` inviterait à croire que la compilation suffit ; elle ne
 *    suffit pas — `as` la contourne. Le contrôle qui décide est
 *    `estUnMandatDelivre()`, à l'exécution, contre le registre privé de
 *    `mandat.ts`. Le type `unknown` dit exactement cela au lecteur.
 */
export async function amorcer(mandat: unknown, monde: MondeDAmorcage): Promise<RapportDAmorcage> {
  const repetition = monde.repetition ?? false;
  const plafond = plafondEnVigueur(monde.env);
  const etapes: string[] = [];
  const lignes: string[] = [];

  const rendre = (
    refus: RefusDAmorcage | null,
    complements: readonly string[],
    etat: {
      compte?: number | null;
      /** Le plafond que le COFFRE applique, quand il est connu. */
      plafondApplique?: number | null;
      reste?: number | null;
      versionDuJeton?: number | null;
      jetonEmisParZoho?: boolean;
    } = {},
  ): RapportDAmorcage => {
    const compte = etat.compte ?? null;
    const applique = etat.plafondApplique ?? null;
    return {
      etapesFranchies: [...etapes],
      compte,
      plafond: applique,
      plafondAttendu: plafond.valeur,
      originePlafond: plafond.origine,
      reste:
        etat.reste ??
        (compte === null || applique === null ? null : Math.max(0, applique - compte)),
      versionDuJeton: etat.versionDuJeton ?? null,
      jetonEmisParZoho: etat.jetonEmisParZoho ?? false,
      repetition,
      refus,
      lignes: [...lignes, ...complements],
    };
  };

  // ── 0 · LE MANDAT, ET IL EST LE PREMIER CONTRÔLE ─────────────────────────
  if (!estUnMandatDelivre(mandat)) {
    return rendre("mandat-absent", [
      "REFUS : aucun mandat d'amorçage. Ce geste n'est JAMAIS un secours automatique — " +
        "voir l'en-tête de `mandat.ts`. Le mandat ne se délivre qu'à la commande, par un " +
        "humain, devant un terminal.",
      "Si vous lisez ce refus depuis le socle : le jeton manquant se DÉPOSE, il ne se " +
        "refabrique pas.",
    ]);
  }
  etapes.push("mandat");

  // ── 1 · LA CONFIGURATION ─────────────────────────────────────────────────
  const config = lireLaConfiguration(monde.env);
  lignes.push(...config.remarques);
  if (config.manques.length > 0) {
    return rendre("configuration-incomplete", [
      `REFUS : ${String(config.manques.length)} élément(s) de configuration manquant(s) ou ` +
        `invalide(s) : ${config.manques.join(" · ")}.`,
      "Ces valeurs viennent du client OAuth créé sur la console Zoho de la RÉGION du " +
        "compte, en type « Server-based ». Elles vivent dans un fichier `.env` non suivi — " +
        "ce dépôt est PUBLIC et n'en porte aucune.",
      `Le plafond d'amorçages se règle par ${VARIABLE_PLAFOND} ; il vaut actuellement ` +
        `${String(plafond.valeur)} (${plafond.origine}).`,
    ]);
  }
  etapes.push("configuration");
  if (plafond.anomalie !== null) lignes.push(`⚠️ ${plafond.anomalie}`);

  // ── 2 · LE COFFRE DOIT ÊTRE OUVERT ───────────────────────────────────────
  const sante = monde.coffre.sante();
  if (sante.etat !== "ouvert") {
    return rendre("coffre-non-ouvert", [
      `REFUS : le coffre est « ${sante.etat} ». Un amorçage compte puis dépose : les deux ` +
        "exigent un coffre ouvert.",
      sante.etat === "absent"
        ? "Le coffre n'existe pas encore : le provisionner d'abord, en séquestrant la clé " +
          "HORS MACHINE avant de la poser (§ 25)."
        : "Le coffre existe et attend sa clé : le déverrouiller depuis la console (écran " +
          "Déverrouillage), qui répond aussi depuis un téléphone.",
      "Rien n'a été demandé à Zoho. Ce refus ne consomme aucun amorçage.",
    ]);
  }
  etapes.push("coffre-ouvert");

  // ── 3 · LE CONSTAT, SANS RIEN ÉCRIRE ─────────────────────────────────────
  const etat = await constaterLAmorcage(monde.coffre, monde.versions);
  etapes.push("constat");
  lignes.push(
    `Coffre ouvert sous la clé « ${sante.keyIdPrincipal ?? "sans identifiant"} » · ancre ` +
      `« ${NOM_DE_L_ANCRE} » ${etat.ancrePosee ? "présente" : "ABSENTE (premier amorçage)"} · ` +
      `amorçages déjà comptés : ${String(etat.compte)} · plafond appliqué par le coffre : ` +
      `${etat.plafondDuCoffre === null ? "pas encore lisible" : String(etat.plafondDuCoffre)} · ` +
      `plafond annoncé par l'environnement : ${String(plafond.valeur)} (${plafond.origine}).`,
  );
  const ecart = ecartDeDerivationDuPlafond(etat, plafond);
  if (ecart !== null) lignes.push(ecart);
  const avertissement = avertissementDeSecondAmorcage(etat, plafond);
  if (avertissement !== null) lignes.push(...avertissement);

  // ── 4 · LE COMPTE — LE PLAFOND MORD ICI, AVANT TOUT LE RESTE ─────────────
  let compte: number;
  let plafondApplique: number | null;
  let reste: number | null;
  try {
    const compteur = await compterCetAmorcage(monde.coffre, etat);
    compte = compteur.compte;
    // ⚠️ LE PLAFOND ET LE RESTE VIENNENT DU COMPTEUR QUE LE COFFRE REND, jamais
    //    d'une soustraction refaite ici. Une seconde arithmétique divergerait le
    //    jour où le coffre changerait la sienne, et le rapport annoncerait une
    //    marge que rien n'applique.
    plafondApplique = compteur.plafond;
    reste = compteur.reste;
  } catch (erreur: unknown) {
    if (estErreurDeCoffre(erreur) && erreur.raison === "plafond_bootstrap") {
      return rendre(
        "plafond-atteint",
        [
          `REFUS : ${erreur.message}`,
          "⚠️ RIEN N'A ÉTÉ DEMANDÉ À ZOHO. Aucun jeton n'a été émis, aucun jeton existant " +
            "n'a été invalidé : ce refus est SANS conséquence, et c'est tout son intérêt — " +
            "il arrive avant le mur, pas dessus.",
          "Deux réponses, et une seule est bonne. (a) Le jeton en place fonctionne : ne pas " +
            "amorcer, TRANSFÉRER. (b) Le plafond posé est plus bas que celui de Zoho : le " +
            `corriger par ${VARIABLE_PLAFOND}, APRÈS l'avoir confronté à la documentation ` +
            "de Zoho — la valeur par défaut de ce dépôt est PRÉSUMÉE, pas mesurée.",
        ],
        { compte: etat.compte, plafondApplique: etat.plafondDuCoffre, reste: 0 },
      );
    }
    throw erreur;
  }
  etapes.push("compte");
  lignes.push(
    // ⚠️ CES TROIS NOMBRES VIENNENT DU COMPTEUR QUE LE COFFRE A RENDU. Aucun
    //    n'est recalculé ici : une seconde arithmétique annoncerait un jour une
    //    marge que rien n'applique.
    `Amorçage COMPTÉ : ${String(compte)} sur un plafond de ` +
      `${plafondApplique === null ? "aucun" : String(plafondApplique)} — celui que le COFFRE ` +
      `applique · il en reste ${reste === null ? "sans limite" : String(reste)}. ` +
      "Ce compte est un MAJORANT des jetons émis : il est posé avant l'échange, jamais " +
      "après.",
  );

  // ── 5 · L'URL — LA SEULE PART DE WILL ────────────────────────────────────
  const etatAntiRejeu = (monde.fabriquerUnEtat ?? fabriquerUnEtat)();
  const scopes = scopesRetenus();
  const url = construireLUrlDAutorisation({
    region: config.region,
    clientId: config.clientId,
    uriDeRedirection: config.uriDeRedirection,
    scopes,
    etat: etatAntiRejeu,
  });
  etapes.push("url");
  lignes.push(
    `${String(scopes.length)} scope(s) demandé(s), énumérés AVANT le consentement comme le ` +
      `§ 27 l'exige : ${scopes.join(" · ")}.`,
    "⚠️ CETTE LISTE NE POURRA PLUS ÊTRE ÉLARGIE SANS REJOUER L'AMORÇAGE, et les amorçages " +
      "sont plafonnés. Si un scope manque, arrêter MAINTENANT.",
    "",
    "▶ OUVRIR CE LIEN DANS LE NAVIGATEUR, ET ACCEPTER. C'est la seule chose à faire :",
    url,
    "",
  );

  if (repetition) {
    etapes.push("répétition");
    return rendre(
      null,
      [
        "RÉPÉTITION : le geste s'arrête ici. Aucun port n'a été ouvert, aucun échange n'a " +
          "eu lieu, aucun jeton n'a été émis.",
        "⚠️ L'AMORÇAGE A TOUT DE MÊME ÉTÉ COMPTÉ. C'est délibéré : le compte est un majorant, " +
          "et un mode qui ne compterait pas serait le chemin par lequel on contourne le " +
          "plafond. Relancer sans ce mode pour aller au bout.",
      ],
      { compte, plafondApplique, reste },
    );
  }

  // ── 6 · LE RAPPEL LOCAL ──────────────────────────────────────────────────
  const boite = monde.ouvrirLaBoiteAuxLettres ?? attendreLeCode;
  const issue = await boite({
    uriDeRedirection: config.uriDeRedirection,
    etat: etatAntiRejeu,
    ecrire: monde.ecrire,
  });
  if (!issue.recu) {
    return rendre(
      "rappel-sans-code",
      [
        `REFUS : aucun code utilisable (${issue.refus}). ${issue.explication}`,
        "Aucun échange n'a été tenté. Selon la cause, Zoho a pu émettre un CODE — il est à " +
          "usage unique, il expire en quelques minutes, et il ne devient un jeton que par " +
          "l'échange qui n'a pas eu lieu.",
        "⚠️ L'amorçage reste COMPTÉ. Le compte majore les jetons émis ; il ne se décrémente " +
          "pas, sans quoi il ne majorerait plus rien.",
      ],
      { compte, plafondApplique, reste },
    );
  }
  etapes.push("rappel");
  lignes.push(`Code reçu sur la boucle locale (${issue.hotesLies.join(", ")}).`);

  // ── 7 · L'ÉCHANGE — LE SEUL APPEL SORTANT ────────────────────────────────
  let jetons;
  try {
    jetons = await monde.echangeur.echanger({
      region: config.region,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      uriDeRedirection: config.uriDeRedirection,
      code: issue.code,
    });
  } catch (erreur: unknown) {
    const detail =
      erreur instanceof ErreurDEchange
        ? `${erreur.refus} — ${erreur.message}`
        : erreur instanceof Error
          ? erreur.message
          : String(erreur);
    return rendre(
      "echange-refuse",
      [
        `REFUS : ${detail}`,
        erreur instanceof ErreurDEchange && erreur.refus === "refresh-token-absent"
          ? "⚠️ UN JETON A ÉTÉ ÉMIS ET IL EST PERDU : Zoho a rendu un access_token sans " +
            "refresh_token. Corriger l'URL d'autorisation AVANT de relancer, sans quoi le " +
            "prochain amorçage produira exactement le même résultat en consommant le même " +
            "budget."
          : "Aucun jeton durable n'a été déposé.",
      ],
      {
        compte,
        plafondApplique,
        reste,
        jetonEmisParZoho:
          erreur instanceof ErreurDEchange && erreur.refus === "refresh-token-absent",
      },
    );
  }
  etapes.push("échange");
  lignes.push(
    `Échange réussi par la prise « ${monde.echangeur.nom} » · ${decrireLesJetons(jetons)}`,
  );

  // ── 8 · LE DÉPÔT ─────────────────────────────────────────────────────────
  let depot;
  try {
    depot = await deposerLeJeton(monde.coffre, monde.versions, jetons.refreshToken);
  } catch (erreur: unknown) {
    return rendre(
      "depot-impossible",
      [
        `REFUS : le jeton a été reçu et le coffre n'a pas voulu l'écrire. ` +
          `${erreur instanceof Error ? erreur.message : String(erreur)}`,
        "⚠️ C'EST LE PIRE DES CAS, ET IL DEMANDE UN GESTE. Un jeton de rafraîchissement " +
          "EXISTE chez Zoho, il compte dans leur plafond, et il n'est écrit nulle part : il " +
          "est irrécupérable. Réparer le coffre AVANT de relancer.",
      ],
      { compte, plafondApplique, reste, jetonEmisParZoho: true },
    );
  }
  etapes.push("dépôt");
  lignes.push(...depot.lignes);

  return rendre(
    null,
    [
      "⚠️ CE JETON EST DANS LE COFFRE OÙ CETTE COMMANDE A TOURNÉ. Si ce n'est pas celui de " +
        "la production, le geste n'est pas fini — et le § 27 rappelle que rejouer " +
        "l'amorçage depuis la production est interdit deux fois. Voir `DEPS.md`, § « Du " +
        "coffre local au coffre de production » : la voie N'EST PAS TRANCHÉE.",
    ],
    { compte, plafondApplique, reste, versionDuJeton: depot.version, jetonEmisParZoho: true },
  );
}
