/**
 * `core/chaine/modules.ts` — QUEL FICHIER EXÉCUTE QUELLE ÉTAPE DU § 11.
 *
 * ═══ POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST VIDE DE TOUT IMPORT ═══
 *
 * Deux tables répondaient à la même question — « quel module exécute l'étape
 * N ? » — et elles se contredisaient sur les CINQ étapes :
 *
 *  · `ETAPES_CHAINE` (`etapes.ts`) nommait `core/chaine/scopes.ts`,
 *    `catalogue.ts`, `curseur.ts`, `provenance.ts`, `execution.ts` — cinq
 *    fichiers qui N'ONT JAMAIS EXISTÉ ;
 *  · `EXECUTANTS_ETAPES` (`orchestrateur.ts`) nommait les cinq fichiers réels.
 *
 * Rien ne les confrontait. Le reste-à-faire du module annonçait donc « 5 étapes
 * encore sans implémentation » en renvoyant vers cinq chemins fantômes, alors
 * que les cinq étaient écrites et testées — un rapport d'avancement qui disait
 * l'inverse de son propre dossier, et qui aurait envoyé le constructeur suivant
 * écrire un fichier déjà écrit sous un autre nom.
 *
 * **DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE. ON N'EN GARDE
 * QU'UNE.** C'est celle-ci. `etapes.ts` et `orchestrateur.ts` la LISENT tous les
 * deux ; aucun des deux ne la recopie.
 *
 * ⚠️ CE FICHIER N'IMPORTE RIEN, ET C'EST UNE CONTRAINTE, PAS UN HASARD. Les cinq
 *    modules d'étape importent `etapes.ts` ; si `etapes.ts` devait importer une
 *    table vivant chez l'un d'eux, le cycle se refermerait et l'ordre de
 *    chargement déciderait de la valeur. Une feuille de l'arbre de dépendances
 *    ne peut pas être prise dans un cycle.
 *
 * ⚠️ CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS. C'est de la PROSE : des
 *    chaînes de caractères. Elle ne prouve rien par elle-même — une chaîne non
 *    vide qui ne désigne aucun fichier la satisferait. C'est pourquoi
 *    `verifierCouvertureDesEtapes()` et `etapes.spec.ts` la CONFRONTENT AU
 *    SYSTÈME DE FICHIERS : le seul juge disponible, la table étant de la prose,
 *    et de la prose ne contredit que de la prose.
 */

/**
 * Les cinq étapes du § 11 dont `core/chaine` porte l'implémentation, et le
 * fichier qui la porte. Les clés sont celles d'`APPEL_STEPS` — `etapes.ts` le
 * vérifie en ancrant chacune, et le compilateur le vérifie sur la clé.
 */
export const MODULES_ETAPES_CHAINE = {
  scopes: "core/chaine/etape-05-scopes.ts",
  "outil-active": "core/chaine/etape-06-outil.ts",
  curseur: "core/chaine/etape-09-curseur.ts",
  provenance: "core/chaine/etape-11-provenance.ts",
  execution: "core/chaine/etape-14-execution.ts",
} as const;

/** La clé d'une des cinq étapes portées par `core/chaine`. */
export type CleEtapeChaine = keyof typeof MODULES_ETAPES_CHAINE;

/**
 * Les cinq chemins, dérivés — jamais réécrits.
 *
 * Sert aux gardes qui confrontent la table au disque, pour qu'elles annoncent
 * COMBIEN de chemins elles ont mesurés plutôt qu'une couleur.
 */
export const CHEMINS_ETAPES_CHAINE: readonly string[] = Object.values(MODULES_ETAPES_CHAINE);
