/**
 * axion-ops — `core/profiles/profiles.ts`
 *
 * L'ÉNUMÉRATION FERMÉE DES PROFILS.
 *
 * ═══ CE QUE LE § 14 DIT DE CE FICHIER ═══
 *
 * « Fermer l'énumération des profils. `core/profiles/` porte une énumération
 *   typée et versionnée — `courrier`, `dev`, `admin`, `audit` — et `adapter-kit`
 *   type le champ `profiles` dessus, si bien qu'UN PROFIL INCONNU DEVIENT UNE
 *   ERREUR DE COMPILATION CHEZ L'ADAPTATEUR. C'est LA SEULE GARDE DU BUDGET QUI
 *   NE DÉPENDE D'AUCUN ADAPTATEUR POUR EXISTER. »
 *
 * D'où la forme de ce module : la fermeture est un fait de TYPE, obtenu au
 * `pnpm typecheck`, pas un contrôle au runtime. Un contrôle au runtime arriverait
 * trop tard — au moment où le manifeste d'un adaptateur écrit dans un autre
 * dépôt est déjà enregistré.
 *
 * ═══ UN PROFIL EST UNE PROPRIÉTÉ DE SÉCURITÉ ═══
 *
 * § 14, mécanisme 1 : « le socle n'expose jamais tous les adaptateurs à la fois.
 * On en change à la voix, PAR LE CHEMIN DU DESSERRAGE (§ 20) : changer de profil
 * change la surface exposée, donc c'est une opération de sécurité. »
 *
 * § 20, règle de tri des commandes hors modèle : une commande hors modèle n'est
 * admise SANS FACTEUR que si elle RÉDUIT STRICTEMENT l'ensemble des outils
 * exposés. « Passe en mode dev » élargit — donc facteur TOTP, TTL, ligne au
 * journal. La comparaison « réduit strictement » se calcule ici, sur les
 * ensembles servis : voir `reduitStrictement` dans `budget.ts`.
 *
 * ═══ CE FICHIER NE STOCKE RIEN ═══
 *
 * Le profil ACTIF vit dans `ops_runtime` (`principal`, `activeProfile`) — la
 * dixième table du § 12, née de ce constat : « l'étape 7 lisait un profil
 * courant qu'aucune table ne stockait ». La lecture et l'écriture de cette table
 * appartiennent à un autre module ; ce fichier ne fournit que le VOCABULAIRE et
 * la fonction de validation `estProfil` qu'il faut appliquer à ce qu'on en
 * relit.
 */

import { createHash } from "node:crypto";

import type { ToolContext as ToolContextGenerique } from "../types.js";
import { jsonCanonique } from "./canonique.js";

// ═════════════════════════════════════════════════════════════════════════════
//  La table des profils
// ═════════════════════════════════════════════════════════════════════════════

/** Une entrée de l'énumération. */
export interface Profil {
  /** L'identifiant, tel qu'il est prononcé, écrit dans un manifeste, et stocké
   *  dans `ops_runtime.activeProfile` et `ops_tool.profiles`. */
  readonly nom: string;
  /** Ce que le profil expose, en une phrase. Cette phrase est ce que l'écran
   *  Outils affiche et ce que le démon vocal lit à voix haute au changement. */
  readonly libelle: string;
  /** Version de l'énumération où ce profil est apparu. Un profil retiré ne
   *  disparaît pas de l'histoire : il disparaît de ce tableau, et la version de
   *  l'énumération change. */
  readonly depuis: string;
}

/**
 * VERSION DE L'ÉNUMÉRATION. Le § 14 exige une énumération « typée ET
 * VERSIONNÉE ».
 *
 * Elle change à chaque ajout, retrait ou renommage d'un profil — jamais pour une
 * retouche de `libelle`. Un adaptateur fédéré, qui vit dans un AUTRE DÉPÔT,
 * épingle cette version dans son manifeste : c'est le seul moyen de savoir qu'un
 * manifeste a été produit contre une énumération qui n'est plus celle du socle.
 */
export const PROFILES_VERSION = "1.0.0";

/**
 * LES QUATRE PROFILS. Ce tableau est LA source ; tout le reste du module en
 * dérive — le type, la liste des noms, le prédicat, l'empreinte.
 *
 * Les quatre noms viennent du § 02 (« un jeu d'outils actifs à la fois :
 * `courrier`, `dev`, `admin`, `audit` ») et du § 14, qui les répète.
 */
export const PROFILES = [
  {
    nom: "courrier",
    libelle: "Lire, trier et rédiger le courrier. Aucun outil de production.",
    depuis: "1.0.0",
  },
  {
    nom: "dev",
    libelle: "Le dépôt, les déploiements, l'observabilité. Élargit la surface exposée.",
    depuis: "1.0.0",
  },
  {
    nom: "admin",
    libelle: "La console : outils, politique, quotas, registre des adaptateurs.",
    depuis: "1.0.0",
  },
  {
    nom: "audit",
    libelle: "Lecture seule du journal chaîné et des mesures. Aucun effet extérieur.",
    depuis: "1.0.0",
  },
] as const satisfies readonly Profil[];

/**
 * LE TYPE FERMÉ. `adapter-kit` type le champ `profiles` dessus ; un profil
 * inconnu devient alors une ERREUR DE COMPILATION chez l'adaptateur qui l'écrit,
 * et non une erreur au runtime chez le socle qui le lit.
 */
export type ProfileName = (typeof PROFILES)[number]["nom"];

/**
 * Les noms seuls, DÉRIVÉS du tableau. Aucune liste écrite à la main : ajouter
 * une entrée à `PROFILES` la fait apparaître ici sans qu'on y touche.
 */
export const PROFILE_NAMES: readonly ProfileName[] = PROFILES.map((profil) => profil.nom);

const INDEX_PROFILS: ReadonlySet<string> = new Set<string>(PROFILE_NAMES);

// ═════════════════════════════════════════════════════════════════════════════
//  Le plafond du NOMBRE de profils
// ═════════════════════════════════════════════════════════════════════════════

/**
 * PLAFOND DU NOMBRE DE PROFILS.
 *
 * ⚠️ Le § 14 affiche « 4 · profils, énumération fermée » — c'est le nombre
 *    DÉCLARÉ aujourd'hui, pas un plafond. La commande de ce module donne, elle,
 *    un plafond de SIX. Les deux sont tenus ici sans en confondre aucun :
 *    `PLAFOND_PROFILS` est la borne haute admissible, et la garde de
 *    `profiles.spec.ts` porte EN PLUS un témoin sur le compte réel du CDC. Une
 *    cinquième entrée passerait le plafond mais ferait rougir le témoin — c'est
 *    exactement ce qu'on veut : un ajout de profil est une DÉCISION, pas un
 *    accident de fusion.
 *
 * Motif du plafond, au-delà du chiffre : chaque profil supplémentaire est une
 * surface de plus à raisonner au § 20, et un jeu de définitions de plus à tenir
 * sous les 8k tokens du § 14.
 */
export const PLAFOND_PROFILS = 6;

// ═════════════════════════════════════════════════════════════════════════════
//  Validation de ce qui vient d'AILLEURS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le type ferme la porte à la COMPILATION. Ce prédicat la ferme à ce qui entre
 * au RUNTIME sans passer par le compilateur : `ops_runtime.activeProfile` relu
 * en base, `ops_tool.profiles` (colonne `String[]`), un manifeste JSON reçu d'un
 * adaptateur fédéré, une commande vocale transcrite.
 */
export function estProfil(valeur: unknown): valeur is ProfileName {
  return typeof valeur === "string" && INDEX_PROFILS.has(valeur);
}

/**
 * Comme `estProfil`, mais lève. À employer là où l'appelant ne peut RIEN faire
 * d'un profil inconnu — la lecture d'`ops_runtime`, par exemple.
 *
 * Le message NOMME les profils connus : § 15, deuxième règle — une erreur dit
 * toujours ce qu'il faut faire ensuite. La liste du message est DÉRIVÉE, jamais
 * recopiée.
 */
export function exigerProfil(valeur: unknown, ou: string): ProfileName {
  if (!estProfil(valeur)) {
    throw new Error(
      `Profil inconnu en ${ou} : ${JSON.stringify(valeur)}. ` +
        `Les ${String(PROFILE_NAMES.length)} profils connus (énumération ${PROFILES_VERSION}) ` +
        `sont : ${PROFILE_NAMES.join(", ")}.`,
    );
  }
  return valeur;
}

/**
 * Filtre une liste de chaînes venue du dehors, en séparant ce qui est un profil
 * de ce qui ne l'est pas. Rend AUSSI les deux comptes : une fonction qui
 * jetterait les inconnus en silence transformerait un manifeste périmé en
 * adaptateur exposé à personne, sans un mot.
 */
export function trierProfils(valeurs: readonly unknown[]): {
  readonly connus: readonly ProfileName[];
  readonly inconnus: readonly unknown[];
  readonly mesures: number;
} {
  const connus: ProfileName[] = [];
  const inconnus: unknown[] = [];
  for (const valeur of valeurs) {
    if (estProfil(valeur)) {
      connus.push(valeur);
    } else {
      inconnus.push(valeur);
    }
  }
  return { connus, inconnus, mesures: valeurs.length };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Déclaration côté adaptateur — la fermeture à la COMPILATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le type du champ `profiles` de `defineAdapter()` (§ 09).
 *
 * NON VIDE, à dessein : un adaptateur qui ne se rattache à aucun profil n'est
 * servi dans aucun `tools/list`. Ce n'est pas une configuration, c'est du code
 * mort — et du code mort qui SE DÉPLOIE, s'enregistre au registre et n'apparaît
 * jamais. Le tuple non vide en fait un refus de compilation.
 */
export type ProfilsDeclares = readonly [ProfileName, ...ProfileName[]];

/**
 * À appeler par `adapter-kit` sur le champ `profiles`. Son seul travail est
 * d'être un point où le compilateur REFUSE.
 *
 * ```ts
 * profiles: declarerProfils(["dev", "admin"]),   // ✅
 * profiles: declarerProfils(["facturation"]),    // ❌ erreur de COMPILATION
 * profiles: declarerProfils([]),                 // ❌ erreur de COMPILATION
 * ```
 *
 * Le paramètre `const` conserve les littéraux : le type de retour porte les
 * profils EXACTS déclarés, ce dont le manifeste a besoin.
 */
export function declarerProfils<const T extends ProfilsDeclares>(profils: T): T {
  return profils;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le contexte d'outil, RESSERRÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `ctx` du § 09, avec `profile` resserré sur l'énumération fermée.
 *
 * La Fondation laisse `ToolContext<TProfile extends string = string>` OUVERT à
 * dessein : l'énumération lui appartient, à lui, pas à `core/types.ts`. C'est
 * ici qu'elle se referme, et c'est CETTE forme que les adaptateurs importent —
 * jamais la forme générique. Un `ctx.profile` comparé à `"facturation"` devient
 * alors une comparaison que le compilateur refuse.
 */
export type ToolContext = ToolContextGenerique<ProfileName>;

// ═════════════════════════════════════════════════════════════════════════════
//  Empreinte de l'énumération
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Empreinte SHA-256 du JSON canonique de l'énumération, version comprise.
 *
 * MOTIF : un adaptateur fédéré produit son manifeste DANS UN AUTRE DÉPÔT, contre
 * sa propre copie de ce module. Si les deux énumérations divergent — un profil
 * ajouté d'un côté et pas de l'autre — le manifeste reste syntaxiquement valide
 * et le registre l'accepte : la divergence ne se voit nulle part. L'empreinte la
 * rend visible d'un seul octet. Même motif que le `manifestSha` épinglé dans
 * `adapters.lock.json` (§ 09).
 *
 * Le paramètre existe pour que la garde puisse fabriquer un TÉMOIN altéré et
 * prouver que l'empreinte bouge. Une empreinte qu'on ne peut pas faire bouger
 * n'a jamais été vérifiée.
 */
export function empreinteProfils(
  profils: readonly Profil[] = PROFILES,
  version: string = PROFILES_VERSION,
): string {
  const canonique = jsonCanonique(
    {
      version,
      profils: profils.map((profil) => ({
        nom: profil.nom,
        depuis: profil.depuis,
        // `libelle` est HORS de l'empreinte : c'est de la prose d'écran, une
        // reformulation ne doit pas invalider les manifestes de tout le monde.
      })),
    },
    "$.profils",
  );
  return createHash("sha256").update(canonique, "utf8").digest("hex");
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le SCEAU — ce qu'un manifeste épingle de cette énumération
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE SCEAU DE L'ÉNUMÉRATION : sa version, et son empreinte.
 *
 * ⚠️ POURQUOI IL EXISTE, ET CE QU'IL RÉPARE (ADR 0004). Jusqu'au lot 1b,
 *    `PROFILES_VERSION` et `empreinteProfils()` étaient une garde QUI NE
 *    POUVAIT PAS ROUGIR : le commentaire d'`empreinteProfils` affirmait qu'« un
 *    adaptateur fédéré épingle cette version dans son manifeste », alors que le
 *    manifeste ne portait NI la version NI l'empreinte, et le verrou non plus.
 *    Une garde qui décrit un mécanisme absent est pire qu'une garde manquante :
 *    on la croit en service.
 *
 *    Le manifeste porte désormais les deux (`profilesVersion`, `profilesSha`),
 *    `analyserDefinition()` les remplit depuis ce sceau, et le registre les
 *    confronte au sceau du socle. C'est CE couple, et lui seul, qui voyage.
 *
 * ⚠️ CALCULÉ UNE FOIS, AU CHARGEMENT. `PROFILES` est figé (`as const`) : le
 *    recalculer à chaque appel ne changerait rien d'autre que le temps passé.
 */
export const SCEAU_PROFILS = {
  version: PROFILES_VERSION,
  empreinte: empreinteProfils(),
} as const;

export type SceauProfils = { readonly version: string; readonly empreinte: string };
