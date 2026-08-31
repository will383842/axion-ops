/**
 * `ops/workflow.ts` — LA CHAÎNE D'INTÉGRATION SE LIT COMME DU CODE.
 *
 * ═══ POURQUOI CE MODULE EXISTE ═══
 *
 * Un fichier de workflow est du TEXTE que personne ne relit après le jour où il
 * a été écrit. Trois gestes suffisent à le rendre décoratif, et les trois se
 * font « pour débloquer », en une ligne, sans rien casser :
 *
 *  1. `continue-on-error: true` — l'étape rougit et la chaîne reste verte ;
 *  2. `if: ${{ secrets.X != '' }}` — l'étape DISPARAÎT quand le secret manque,
 *     ce qui est le cas d'un nom mal orthographié, d'un secret révoqué, ou
 *     d'une exécution issue d'une fourche. La chaîne reste verte, et le
 *     contrôle n'a pas eu lieu ;
 *  3. `… || true`, `|| :`, `set +e` — le code de retour est écrasé DANS la
 *     commande, là où aucune lecture du YAML ne le voit.
 *
 * Le dépôt voisin en porte la mesure : « Ce paragraphe a affirmé jusqu'au
 * 2026-08-17 que Lighthouse CI et `size-limit` bloquaient les PR. C'est faux,
 * et l'a toujours été : les gates PR de budget portent tous
 * `continue-on-error: true` — aucune PR qui alourdit le bundle ne rougira. »
 * Une garde de revue avait raisonné sur cette fausse sécurité pendant des mois.
 *
 * ═══ CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ═══
 *
 * ⚠️ IL NE COMPREND PAS LE YAML. Il n'y a aucun analyseur YAML dans les
 *    dépendances de ce dépôt, et en ajouter un pour une garde de texte serait
 *    une dépendance de plus dans un socle qui décide de droits. Il reconnaît
 *    des FORMES, ligne à ligne, hors commentaires. La borne est donc réelle :
 *    une forme écrite autrement — un `continue-on-error` porté par une action
 *    composite, un code de retour écrasé dans un script appelé — lui échappe.
 *    Elle est écrite ici, dans la même phrase que la mesure, et le nombre de
 *    lignes examinées est RENDU pour qu'une lecture qui cesserait de mordre se
 *    voie.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ═════════════════════════════════════════════════════════════════════════════
//  Les formes interdites
// ═════════════════════════════════════════════════════════════════════════════

/** Une forme proscrite, son motif, et ce qu'elle produit quand elle passe. */
export interface FormeInterdite {
  readonly nom: string;
  readonly motif: RegExp;
  readonly consequence: string;
}

export const FORMES_INTERDITES: readonly FormeInterdite[] = [
  {
    nom: "continue-on-error",
    motif: /continue-on-error\s*:/i,
    consequence:
      "l'étape peut rougir sans que la chaîne rougisse — c'est une gate qui n'en est pas une",
  },
  {
    nom: "condition sur un secret",
    // Un `if:` — de niveau étape ou de niveau job — dont la condition mentionne
    // `secrets.`. C'est le saut conditionnel qu'`ops/secrets.ts` refuse.
    motif: /^\s*if\s*:.*\bsecrets\s*\./i,
    consequence:
      "l'étape DISPARAÎT quand le secret manque, au lieu d'échouer : la chaîne reste verte " +
      "et le contrôle n'a pas eu lieu",
  },
  {
    nom: "code de retour écrasé",
    // `|| true`, `|| :` et `set +e` : la panne est avalée DANS la commande.
    motif: /(\|\|\s*(true|:)\s*$)|(^|\s)set\s+\+e(\s|$)/,
    consequence:
      "le code de retour de la commande est écrasé : l'étape réussit quoi qu'il arrive, et " +
      "aucune lecture du YAML ne le montre",
  },
  {
    nom: "suppression de la sortie d'erreur",
    // `2>/dev/null` sur une commande de gate : le diagnostic disparaît, et une
    // panne devient indiscernable d'un succès silencieux.
    motif: /2>\s*\/dev\/null/,
    consequence:
      "la sortie d'erreur est jetée : une panne devient indiscernable d'un succès silencieux",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  La lecture
// ═════════════════════════════════════════════════════════════════════════════

/** Une occurrence trouvée. Le numéro de ligne est RENDU : on doit pouvoir y aller. */
export interface OccurrenceInterdite {
  readonly fichier: string;
  readonly ligne: number;
  readonly forme: string;
  readonly consequence: string;
  /** La ligne fautive, ÉLAGUÉE — jamais une valeur d'environnement complète. */
  readonly extrait: string;
}

/** Ce que rend l'analyse. JAMAIS un booléen. */
export interface VerdictWorkflow {
  /** Nombre de FICHIERS de workflow lus. */
  readonly fichiersLus: number;
  /** Nombre de LIGNES examinées, commentaires exclus. */
  readonly lignesExaminees: number;
  /** Nombre d'étapes reconnues (`- name:` ou `- uses:` ou `- run:`). */
  readonly etapesReconnues: number;
  readonly occurrences: readonly OccurrenceInterdite[];
}

/**
 * Une ligne est-elle un commentaire YAML ?
 *
 * ⚠️ SANS CETTE ÉTAPE, LA GARDE MORD SUR LA PROSE. Le workflow explique
 *    précisément pourquoi il ne porte aucun `continue-on-error` ; une lecture
 *    naïve prendrait l'explication pour l'instruction. C'est la même leçon que
 *    `core/audit/droits-sql.ts` a apprise sur le SQL et `derivation.spec.ts` sur
 *    `createHmac` : une garde qui confond ce qu'un fichier FAIT et ce qu'il DIT
 *    rougit pour la mauvaise raison, ce qui finit toujours par une exception
 *    écrite à la main — c'est-à-dire par un trou.
 *
 * La borne : un `#` à l'intérieur d'une chaîne YAML entre guillemets n'ouvre
 * pas un commentaire. On ne traite donc comme commentaire qu'une ligne dont le
 * PREMIER caractère non blanc est `#` — la seule forme qu'on puisse reconnaître
 * sans analyser le YAML.
 */
export function estCommentaire(ligne: string): boolean {
  return ligne.trimStart().startsWith("#");
}

/** Le début d'une étape, dans la syntaxe usuelle des workflows. */
const DEBUT_ETAPE = /^\s*-\s+(name|uses|run)\s*:/;

/** Analyse UNE source de workflow. Fonction PURE : un témoin peut la nourrir. */
export function analyserWorkflow(fichier: string, source: string): VerdictWorkflow {
  const occurrences: OccurrenceInterdite[] = [];
  let lignesExaminees = 0;
  let etapesReconnues = 0;

  const lignes = source.split(/\r?\n/);
  for (const [index, ligne] of lignes.entries()) {
    if (ligne.trim().length === 0 || estCommentaire(ligne)) continue;
    lignesExaminees += 1;
    if (DEBUT_ETAPE.test(ligne)) etapesReconnues += 1;

    for (const forme of FORMES_INTERDITES) {
      if (forme.motif.test(ligne)) {
        occurrences.push({
          fichier,
          ligne: index + 1,
          forme: forme.nom,
          consequence: forme.consequence,
          // Élagué : la sortie d'une chaîne d'intégration est publique.
          extrait: ligne.trim().slice(0, 120),
        });
      }
    }
  }

  return { fichiersLus: 1, lignesExaminees, etapesReconnues, occurrences };
}

/**
 * Le dossier des workflows, calculé depuis `import.meta.url` — jamais codé en
 * dur depuis la racine. Une garde au chemin figé devient muette au
 * déménagement, et c'est un défaut mesuré ailleurs dans ce dépôt.
 */
export function dossierDesWorkflows(): string {
  return fileURLToPath(new URL("../.github/workflows/", import.meta.url));
}

/** Les fichiers de workflow de ce dépôt, triés — l'ordre rend la garde lisible. */
export function fichiersDeWorkflow(): readonly string[] {
  const dossier = dossierDesWorkflows();
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((nom) => nom.endsWith(".yml") || nom.endsWith(".yaml"))
    .sort();
}

/** Analyse TOUS les workflows du dépôt et cumule les comptes. */
export function analyserLesWorkflows(): VerdictWorkflow {
  const dossier = dossierDesWorkflows();
  const fichiers = fichiersDeWorkflow();

  let lignesExaminees = 0;
  let etapesReconnues = 0;
  const occurrences: OccurrenceInterdite[] = [];

  for (const nom of fichiers) {
    const verdict = analyserWorkflow(nom, readFileSync(`${dossier}${nom}`, "utf8"));
    lignesExaminees += verdict.lignesExaminees;
    etapesReconnues += verdict.etapesReconnues;
    occurrences.push(...verdict.occurrences);
  }

  return { fichiersLus: fichiers.length, lignesExaminees, etapesReconnues, occurrences };
}
