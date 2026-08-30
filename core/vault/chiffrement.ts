/**
 * core/vault/chiffrement.ts — AES-GCM, AAD = `name‖version`.
 *
 * § 07, tableau des choix technologiques :
 *   « Chiffrement du coffre — AES-GCM, AAD = name‖version, clé hors dépôt. »
 *
 * POURQUOI UN AAD, ET POURQUOI CELUI-LÀ. Le mode GCM authentifie le
 * ciphertext ; l'AAD authentifie EN PLUS un contexte qui ne voyage pas dans le
 * chiffré. Ici ce contexte est l'identité de la ligne. Sans lui, une ligne
 * `ops_secret` déplacée d'un `name` à un autre — ou d'une version à une autre —
 * se déchiffrerait sans un mot : le secret de `zoho.refresh_token` v1
 * rejouerait sous v2, exactement le scénario que le § 27 interdit (« garder
 * l'ancien refresh token valide pendant la propagation » suppose de savoir
 * LEQUEL on lit).
 *
 * `keyId` n'entre PAS dans l'AAD : il voyage en clair sur la ligne, parce que
 * c'est lui qui permet de CHOISIR la clé avant de déchiffrer. Le mettre dans
 * l'AAD créerait une dépendance circulaire — il faudrait la bonne clé pour
 * savoir quelle clé prendre.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { ErreurDeCoffre } from "./erreurs.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le contrat cryptographique, en constantes nommées
// ═════════════════════════════════════════════════════════════════════════════

/** AES-256 en mode GCM. 256 bits, pas 128 : le coffre garde des jetons de
 *  rafraîchissement dont la durée de vie se compte en années. */
export const ALGORITHME = "aes-256-gcm" as const;

/** 32 octets. Une clé plus courte ferait échouer `createCipheriv` — ce contrôle
 *  la refuse PLUS TÔT, avec un message qui dit quoi faire. */
export const LONGUEUR_CLE = 32;

/** 12 octets : la taille recommandée pour GCM. Au-delà, l'IV est haché, ce qui
 *  réduit la marge avant collision. */
export const LONGUEUR_IV = 12;

/** 16 octets : le tag GCM plein. Un tag tronqué affaiblit l'authentification —
 *  et c'est l'authentification qui porte ici toute la valeur de l'AAD. */
export const LONGUEUR_TAG = 16;

/**
 * U+2016 DOUBLE VERTICAL LINE — le caractère « ‖ » que le CDC écrit lui-même
 * dans « AAD = name‖version ». Il n'est pas décoratif : c'est LE séparateur.
 *
 * Un séparateur impose une contrainte que le CDC n'écrit pas : si un `name`
 * pouvait le contenir, deux couples distincts pourraient produire le même AAD,
 * et l'authentification de contexte serait contournable en NOMMANT bien son
 * secret. `verifierNom` le refuse — voir `chiffrement.spec.ts`.
 */
export const SEPARATEUR_AAD = "‖";

// ═════════════════════════════════════════════════════════════════════════════
//  Contrôles de forme — pure, donc testables sur témoin
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un nom de secret est-il utilisable dans un AAD ? Rend `null` si oui, le motif
 * du refus sinon. Fonction PURE : la garde l'applique d'abord à un témoin
 * fabriqué, puis aux vrais noms.
 */
export function motifNomInvalide(nom: string): string | null {
  if (nom.length === 0) {
    return "un nom de secret vide ne distingue rien";
  }
  if (nom.trim() !== nom) {
    return "un nom bordé d'espaces se confond avec son voisin";
  }
  if (nom.includes(SEPARATEUR_AAD)) {
    return `un nom ne peut pas contenir le séparateur d'AAD « ${SEPARATEUR_AAD} » : deux couples (name, version) distincts produiraient le même AAD`;
  }
  return null;
}

/** Une version est-elle utilisable ? Rend `null` si oui, le motif sinon. */
export function motifVersionInvalide(version: number): string | null {
  if (!Number.isInteger(version)) {
    return "une version doit être un entier — `ops_secret.version` est un Int";
  }
  if (version < 1) {
    return "les versions commencent à 1 ; 0 et les négatifs ne désignent rien";
  }
  return null;
}

/**
 * L'AAD de la ligne `(name, version)`.
 *
 * ⚠️ Cette fonction VÉRIFIE avant de construire. Construire un AAD à partir
 * d'un nom douteux serait pire que de refuser : le chiffrement réussirait, et
 * l'ambiguïté ne se verrait qu'à la relecture d'un AUTRE secret.
 */
export function construireAad(nom: string, version: number): Buffer {
  const motifNom = motifNomInvalide(nom);
  if (motifNom !== null) {
    throw new ErreurDeCoffre("nom_invalide", `Nom de secret refusé : ${motifNom}.`, { nom });
  }

  const motifVersion = motifVersionInvalide(version);
  if (motifVersion !== null) {
    throw new ErreurDeCoffre(
      "version_invalide",
      `Version refusée pour le secret « ${nom} » : ${motifVersion}.`,
      { nom, version },
    );
  }

  return Buffer.from(`${nom}${SEPARATEUR_AAD}${String(version)}`, "utf8");
}

/**
 * La clé a-t-elle la bonne forme ? Rend `null` si oui, le motif sinon. Le motif
 * NOMME LA LONGUEUR ATTENDUE ET LA LONGUEUR REÇUE — deux nombres, jamais un
 * octet du matériau.
 */
export function motifCleInvalide(octets: Uint8Array): string | null {
  if (octets.length !== LONGUEUR_CLE) {
    return `une clé de coffre fait ${String(LONGUEUR_CLE)} octets (${String(octets.length)} reçus)`;
  }
  if (estMateriauDegenere(octets)) {
    return "une clé de coffre entièrement à zéro n'a aucune entropie : c'est la forme d'un `Buffer.alloc(32)` oublié, d'une variable d'environnement tronquée ou d'un gabarit non rempli";
  }
  return null;
}

/**
 * Le matériau est-il dégénéré au point d'être devinable ?
 *
 * ⚠️ BORNE ÉCRITE AVEC LA MESURE. Ce contrôle ne mesure PAS l'entropie : il
 * refuse UNE seule forme, les trente-deux octets à zéro. C'est la forme
 * canonique d'un `Buffer.alloc(32)` jamais rempli, d'une variable
 * d'environnement tronquée à vide, ou d'un gabarit de déploiement laissé tel
 * quel — et c'est la seule qui se refuse sans le moindre faux positif.
 *
 * Une clé tout à zéro provisionnerait le coffre, qui s'annoncerait ensuite
 * `état: "ouvert"`, `vaultLocked: false`, nominal ; et comme `empreinteDeCle`
 * DÉRIVE le `keyId` du matériau, ce `keyId` serait déterministe et
 * publiquement calculable. Le sceau serait alors déchiffrable par quiconque
 * essaie la clé évidente. C'est la doctrine que `core/policy/confirmation.ts`
 * applique déjà à son sel (« un HMAC sans secret n'en est pas un ») ; le
 * coffre l'applique désormais à sa clé.
 *
 * 🔴 CE QUI N'EST PAS COUVERT, et qui attend un arbitrage : les autres
 *    matériaux à entropie nulle — tous les octets identiques (0xFF…), une
 *    suite croissante, un texte de remplissage. Les refuser exigerait de
 *    trancher un seuil, et surtout de réécrire la convention de fixtures de
 *    tout `core/vault/**`, qui fabrique ses clés d'essai avec
 *    `Buffer.alloc(32, n)` — c'est-à-dire précisément des octets identiques.
 *    Voir `docs/ETAT.md`.
 */
function estMateriauDegenere(octets: Uint8Array): boolean {
  return octets.every((octet) => octet === 0);
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'enveloppe — exactement les colonnes de `ops_secret`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que le chiffrement produit, et ce que `ops_secret` stocke. Les noms de
 * champs sont ceux des colonnes : `keyId`, `ciphertext`, `iv`, `tag`. Les
 * renommer ici obligerait à une table de correspondance, c'est-à-dire à une
 * liste écrite à la main.
 */
export interface EnveloppeChiffree {
  readonly keyId: string;
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly tag: Uint8Array;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Chiffrer · déchiffrer
// ═════════════════════════════════════════════════════════════════════════════

export interface DemandeDeChiffrement {
  readonly keyId: string;
  readonly cle: Uint8Array;
  readonly nom: string;
  readonly version: number;
  readonly clair: Uint8Array;
}

/** Chiffre `clair` sous `cle`, en liant le résultat au couple `(nom, version)`. */
export function chiffrer(demande: DemandeDeChiffrement): EnveloppeChiffree {
  const motifCle = motifCleInvalide(demande.cle);
  if (motifCle !== null) {
    throw new ErreurDeCoffre("cle_invalide", `Clé de coffre refusée : ${motifCle}.`, {
      keyId: demande.keyId,
    });
  }

  const aad = construireAad(demande.nom, demande.version);
  const iv = randomBytes(LONGUEUR_IV);
  const chiffreur = createCipheriv(ALGORITHME, demande.cle, iv, {
    authTagLength: LONGUEUR_TAG,
  });
  chiffreur.setAAD(aad);

  const ciphertext = Buffer.concat([chiffreur.update(demande.clair), chiffreur.final()]);

  return { keyId: demande.keyId, iv, ciphertext, tag: chiffreur.getAuthTag() };
}

export interface DemandeDeDechiffrement {
  readonly cle: Uint8Array;
  readonly nom: string;
  readonly version: number;
  readonly enveloppe: EnveloppeChiffree;
}

/**
 * Déchiffre, ou LÈVE. Il n'y a pas de troisième issue, et surtout pas de
 * `null` : un `null` silencieux ferait passer un coffre illisible pour un
 * coffre vide, et le § 24 classe « coffre illisible » en CRITIQUE.
 *
 * Mauvaise clé, mauvais AAD et ciphertext altéré rendent la MÊME raison
 * (`dechiffrement_impossible`). Ce n'est pas une imprécision : GCM ne permet
 * pas de les distinguer, et prétendre le contraire donnerait à un attaquant un
 * oracle qui dit « la clé est bonne, c'est le contexte qui cloche ».
 */
export function dechiffrer(demande: DemandeDeDechiffrement): Buffer {
  const motifCle = motifCleInvalide(demande.cle);
  if (motifCle !== null) {
    throw new ErreurDeCoffre("cle_invalide", `Clé de coffre refusée : ${motifCle}.`, {
      keyId: demande.enveloppe.keyId,
    });
  }

  const aad = construireAad(demande.nom, demande.version);

  try {
    const dechiffreur = createDecipheriv(ALGORITHME, demande.cle, demande.enveloppe.iv, {
      authTagLength: LONGUEUR_TAG,
    });
    dechiffreur.setAAD(aad);
    dechiffreur.setAuthTag(demande.enveloppe.tag);
    return Buffer.concat([dechiffreur.update(demande.enveloppe.ciphertext), dechiffreur.final()]);
  } catch {
    // La cause d'origine est délibérément AVALÉE : le message de `node:crypto`
    // ne fuit rien d'utile à l'humain et pourrait, selon la version, citer des
    // longueurs de tampon. Le nôtre dit quoi faire ensuite.
    throw new ErreurDeCoffre(
      "dechiffrement_impossible",
      `Le secret « ${demande.nom} » version ${String(demande.version)} ne s'ouvre pas ` +
        `avec la clé « ${demande.enveloppe.keyId} » : clé, contexte ou ligne altérée. ` +
        `Vérifier que le trousseau porte bien cette clé, puis la sauvegarde hors machine.`,
      { nom: demande.nom, version: demande.version, keyId: demande.enveloppe.keyId },
    );
  }
}

/**
 * Comparaison à temps constant, pour le contenu du sceau. Les longueurs
 * différentes sont refusées AVANT `timingSafeEqual`, qui lève sur des tampons
 * de tailles différentes — le contrôle de longueur est donc obligatoire, pas
 * une optimisation.
 */
export function egalesEnTempsConstant(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Écrase un tampon de clé sur place. Ce n'est pas une garantie — Node peut
 * avoir copié le tampon ailleurs — mais c'est la seule chose que le processus
 * puisse faire, et son absence serait un choix par défaut, pas une décision.
 */
export function effacerOctets(octets: Uint8Array): void {
  octets.fill(0);
}
