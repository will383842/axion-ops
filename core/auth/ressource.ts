/**
 * `core/auth/ressource.ts` — **L'IDENTIFIANT DE RESSOURCE QUI SERT D'AUDIENCE.**
 *
 * ═══ LA DÉCISION QUE LE § 19.1 EXIGEAIT « AVANT LE LOT 1 » ═══
 *
 * > « L'identifiant de ressource qui sert d'audience se décide et s'écrit AVANT
 * >   le lot 1. **L'étape 3 de la chaîne n'a aucun sens sans lui.** »
 *
 * Il n'avait pas été décidé. `.env.example` en portait l'emplacement
 * (`OPS_RESOURCE_INDICATOR`) et une valeur factice sur `stub.invalid`, avec la
 * mention « À DÉCIDER ET ÉCRIRE AVANT LE LOT 1 ». Ce fichier est la décision.
 * Voir **ADR 0026**.
 *
 * ⚠️ **CE QUI EST DÉCIDÉ ICI EST UNE FORME, PAS UNE VALEUR.** Le dépôt est
 *    PUBLIC : aucune adresse réelle n'y entre. La valeur vit dans
 *    `OPS_RESOURCE_INDICATOR`, et ce module dit ce qu'elle doit être pour que
 *    l'étape 3 signifie quelque chose. Une forme versionnée et une valeur hors
 *    dépôt : c'est la même posture que pour les quatre clés du coffre.
 *
 * ⚠️ **AUCUNE FONCTION N'EST EXPORTÉE.** La validation appartient au
 *    constructeur de l'étage 3 ; ce module porte les données dont elle dérive.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LA FORME EXIGÉE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'AUDIENCE EST L'**URL ABSOLUE DE LA RESSOURCE MCP**, et rien d'autre :
 * l'origine du socle suivie du chemin qui sert `POST /api/mcp`.
 *
 * ⚠️ **ELLE N'EST PAS L'ÉMETTEUR, ET C'EST TOUT L'OBJET DE LA RFC 8707.** L'ADR
 *    0001 sert `/auth/*` sur un **domaine distinct** : `iss` (étape 2) désigne
 *    l'émetteur, `aud` (étape 3) désigne la ressource. Deux valeurs, deux
 *    variables, jamais la même. Les confondre rendrait l'étape 3 tautologique —
 *    tout jeton émis ici passerait, ce qui est exactement ce que l'indicateur de
 *    ressource existe pour empêcher.
 */
export const CHEMIN_DE_LA_RESSOURCE_MCP = "/api/mcp";

/**
 * LES CINQ CONTRAINTES DE FORME, ÉCRITES SÉPARÉMENT POUR ÊTRE COMPTÉES.
 *
 * ⚠️ **UNE SEULE EXPRESSION RÉGULIÈRE AURAIT ÉTÉ UNE GARDE MUETTE.** Elle aurait
 *    rendu « conforme » ou « non conforme » sans dire laquelle des cinq a mordu,
 *    et l'étage 3 refuse le démarrage : un message qui ne nomme pas la
 *    contrainte violée envoie chercher au mauvais endroit (§ 25). Les cinq sont
 *    donc séparées, et le verdict ANNONCE combien il en a confrontées.
 */
export const CONTRAINTES_DE_L_AUDIENCE = [
  {
    cle: "schéma",
    exige:
      "`https`, ou `http` UNIQUEMENT quand l'hôte est `localhost` ou une adresse de bouclage — " +
      "le § 23 range le local en environnement à part entière, et exiger TLS sur un poste de " +
      "travail rendrait la seule configuration démarrable impossible à écrire.",
  },
  {
    cle: "aucune requête",
    exige:
      "pas de `?` : deux URL qui ne diffèrent que par l'ordre de leurs paramètres désignent la " +
      "même ressource pour un humain et deux audiences différentes pour une comparaison exacte.",
  },
  {
    cle: "aucun fragment",
    exige:
      "pas de `#` : un fragment n'est jamais transmis au serveur, donc une audience qui en " +
      "porterait un ne serait jamais celle que la ressource peut confronter.",
  },
  {
    cle: "aucune barre finale",
    exige:
      "pas de `/` terminal : c'est la variante d'écriture qui produit deux valeurs pour une " +
      "seule intention, et la comparaison de l'étape 3 est EXACTE.",
  },
  {
    cle: "chemin non vide",
    exige:
      "un chemin, et de préférence " +
      CHEMIN_DE_LA_RESSOURCE_MCP +
      " : une audience réduite à l'origine désignerait le socle entier, y compris la console et " +
      "l'émetteur, alors que le jeton du connecteur ne doit valoir que pour la ressource MCP.",
  },
] as const;

/** La clé d'une contrainte de forme de l'audience. */
export type CleDeContrainteDAudience = (typeof CONTRAINTES_DE_L_AUDIENCE)[number]["cle"];

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'ÉTAPE 3 FAIT DE CETTE VALEUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA COMPARAISON DE L'ÉTAPE 3 EST UNE ÉGALITÉ EXACTE DE CHAÎNES.**
 *
 * Ni préfixe, ni normalisation d'URL, ni comparaison insensible à la casse de
 * l'hôte. Une normalisation est une surface d'égalité APPROCHÉE : chaque règle
 * qu'on y ajoute pour être accommodant est une paire de valeurs distinctes qui
 * deviennent équivalentes, et l'étape 3 n'existe que pour dire qu'elles ne le
 * sont pas.
 *
 * ⚠️ **UN JETON SANS AUDIENCE EST REFUSÉ, ET UN JETON À AUDIENCES MULTIPLES
 *    AUSSI.** La RFC 8707 permet plusieurs indicateurs ; le socle n'en admet
 *    qu'un en v1. Motif : une audience multiple oblige l'étape 3 à décider
 *    « l'une suffit-elle ? », et la réponse permissive est celle qu'on écrit
 *    sans y penser. Une v2 qui en voudra plusieurs le décidera explicitement.
 */
export const COMPARAISON_DE_L_AUDIENCE = "égalité-exacte" as const;

/** Le nom de la variable qui porte la valeur. Elle vit HORS du dépôt. */
export const VARIABLE_DE_L_AUDIENCE = "OPS_RESOURCE_INDICATOR";
