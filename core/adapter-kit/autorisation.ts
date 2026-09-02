/**
 * Contrôle 7 du harnais — **aucun champ d'autorisation ne provient du schéma
 * d'entrée** (§ 09).
 *
 * ═══ LA RÈGLE ═══
 *
 * Une décision de droit atteint la couche service par UN SEUL chemin : `ctx`.
 * Un handler qui lit une habilitation dans `input` est un défaut. Le schéma
 * d'entrée est `.strict()` pour qu'un champ d'autorisation glissé dans la
 * charge utile soit un REFUS VISIBLE et non un silence.
 *
 * Et le § 20 y ajoute une clé nommément : la clé d'idempotence voyage dans
 * l'EN-TÊTE de l'appel, JAMAIS dans `input`.
 *
 * ═══ LA LISTE EST DÉRIVÉE, PAS ÉCRITE — ET ELLE A TROIS ENSEMBLES ═══
 *
 * Les noms interdits sont lus dans le SOURCE de `core/types.ts` : les
 * propriétés de `ToolContext` et celles de `Habilitations`. Une habilitation
 * nouvelle s'ajoute là-bas — « un drapeau nouveau s'ajoute ICI, jamais dans un
 * `input` », dit le fichier — et ce contrôle la refuse le jour même, sans
 * qu'aucune liste soit à retoucher.
 *
 * 🔴 **ET UN TROISIÈME ENSEMBLE, QUE LA DÉRIVATION SEULE NE POUVAIT PAS DONNER —
 *    ADR 0020.** `ToolContext.idempotencyKey` a été RETIRÉE au profit
 *    d'`idempotencyRef`, qui porte l'empreinte : la clé n'atteint plus
 *    l'adaptateur. Retirer la propriété retirait aussi le nom de la liste dérivée
 *    ci-dessus, **en silence** — le contrôle serait resté VERT, simplement plus
 *    étroit d'un nom, et la règle du § 20 (« jamais dans `input` ») aurait cessé
 *    d'être gardée sans qu'aucune couleur ne change. Une garde qui RÉTRÉCIT est
 *    le mode de défaillance le plus coûteux de ce dépôt.
 *
 *    D'où `NOMS_RESERVES_HORS_CONTEXTE` (`core/types.ts`) : les noms que le `ctx`
 *    a PORTÉS et ne porte plus. Ce tableau ne se vide pas, il s'allonge — un nom
 *    y ENTRE le jour où il quitte `ToolContext` —, et un plancher-témoin LÈVE
 *    plutôt que de rendre une liste plus courte.
 *
 * ⚠️ **La borne de cette garde, écrite avec sa mesure.** Elle refuse TOUTES les
 * propriétés de `ToolContext`, y compris `sessionId`, `requestId` et `deadline`
 * qui ne portent aucune autorisation. C'est délibérément plus large que la
 * règle : le remède à une collision légitime est de renommer le champ d'entrée
 * (`deadline` → `echeanceSouhaitee`), ce qui coûte une minute, tandis qu'une
 * liste restreinte devrait être écrite à la main — donc recopiée, donc
 * divergente au premier ajout. La garde est bruyante et dérivée plutôt que
 * juste et recopiée.
 *
 * ⚠️ **Ce qu'elle ne voit pas.** Elle compare des NOMS. Un champ d'entrée
 * nommé `peutTout` ou `bypass` ne ressemble à aucune propriété de `ToolContext`
 * et passe. Un `grep` ne prouve que l'absence de la forme écrite ; ce contrôle
 * ne prouve que l'absence des noms DÉRIVÉS.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Cet import de VALEUR n'est pas décoratif : il ancre `core/types.ts` au
// programme TypeScript. Si le fichier déménageait, la compilation romprait ICI,
// avant que la lecture de source ci-dessous ne devienne muette.
import { APPEL_STEPS, NOMS_RESERVES_HORS_CONTEXTE } from "../types.js";

/**
 * Retire commentaires de bloc et de ligne sans décaler les numéros de ligne.
 *
 * ⚠️ CE N'EST PLUS UN REMPLACEMENT PAR EXPRESSION RÉGULIÈRE, ET C'EST TOUT
 *    L'ENJEU. L'implémentation précédente blanchissait toute paire d'ouvrant et
 *    de fermant de commentaire de bloc trouvée dans le TEXTE, sans distinguer
 *    un commentaire d'une chaîne de caractères. Deux littéraux anodins — une
 *    chaîne contenant l'ouvrant, une autre contenant le fermant, ou même deux
 *    motifs de globbing ordinaires — suffisaient à effacer TOUT ce qui les
 *    séparait. Le contrôle 2 du § 09 (« aucun accès direct à `process.env` ni
 *    à un secret ») devenait alors AVEUGLE à un accès écrit en toutes lettres :
 *    la forme exacte que ses motifs cherchent, sans la moindre obfuscation.
 *
 *    Un faux ROUGE se corrige en une minute ; un faux VERT ne se voit pas.
 *
 * CE QUE FAIT LE BALAYAGE. Il avance caractère par caractère et reconnaît, en
 * plus des deux formes de commentaire, les quatre états où un `/` ne veut rien
 * dire : chaîne simple, chaîne double, gabarit, littéral d'expression
 * régulière. Les échappements et les substitutions d'un gabarit sont suivis.
 *
 * ⚠️ BORNE ÉCRITE AVEC LA MESURE. Ce n'est toujours pas un analyseur
 *    syntaxique. La distinction entre une DIVISION et un LITTÉRAL D'EXPRESSION
 *    RÉGULIÈRE repose sur le dernier caractère significatif — l'heuristique
 *    usuelle, juste sur tout code réel, mais heuristique. Le remède complet
 *    serait un AST, pas un motif de plus. C'est pourquoi le contrôle 2, lui,
 *    s'applique désormais AU SOURCE BRUT (voir `conformite.ts`) : la seule
 *    garde de SÉCURITÉ du lot ne dépend plus du tout de ce filtre.
 */
export function sansCommentaires(source: string): string {
  return balayerLeSource(source, false);
}

/**
 * LE MÊME BALAYAGE, MAIS LES LITTÉRAUX DE CHAÎNE SONT BLANCHIS EUX AUSSI.
 *
 * ═══ POURQUOI CETTE SECONDE SORTIE EXISTE ═══
 *
 * Certaines gardes cherchent un GESTE — « ce fichier appelle-t-il X ? », « ce
 * fichier convertit-il vers `SessionId` ? ». Un nom cité dans un message
 * d'erreur ou dans un champ `motif:` est une PHRASE, et la confondre avec un
 * geste rend la garde ROUGE sur de la prose. La garde G3 de l'ADR 0014 l'a payé
 * d'un lot entier de rouge : `core/types.ts` NOMMAIT la conversion forcée dans
 * le motif d'une entrée de registre. Une garde de sûreté rouge pour une
 * mauvaise raison s'apprend à ignorer, puis se désactive.
 *
 * ⚠️ **LES DEUX SORTIES ONT DEUX CLIENTS, ET IL NE FAUT PAS LES CONFONDRE.** Une
 *    garde qui lit des clauses d'`import` a besoin des chaînes : le
 *    spécificateur d'un import EST une chaîne. Lui donner cette sortie-ci lui
 *    ferait rendre ZÉRO import, c'est-à-dire une garde verte parce qu'elle ne
 *    regarde plus rien.
 *
 * ⚠️ **LES DÉLIMITEURS RESTENT, SEUL LE CONTENU EST BLANCHI**, et le CODE d'une
 *    substitution `${…}` de gabarit reste VISIBLE — c'est du code, et un geste
 *    écrit là doit rester vu. Les sauts de ligne sont conservés : les numéros de
 *    ligne tiennent.
 */
export function sansCommentairesNiChaines(source: string): string {
  return balayerLeSource(source, true);
}

function balayerLeSource(source: string, blanchirLesChaines: boolean): string {
  /** Le `/` qui suit ces caractères ouvre une expression régulière, pas une division. */
  const AVANT_UNE_REGEX = new Set([
    "(",
    ",",
    "=",
    ":",
    "[",
    "!",
    "&",
    "|",
    "?",
    "{",
    "}",
    ";",
    "+",
    "-",
    "*",
    "%",
    "~",
    "^",
    "<",
    ">",
  ]);

  const MOTS_CLES_AVANT_REGEX = [
    "return",
    "typeof",
    "case",
    "in",
    "of",
    "new",
    "delete",
    "void",
    "do",
    "else",
    "yield",
    "await",
  ];

  const APOSTROPHE = "'";
  const GUILLEMET = '"';
  const ACCENT = "`";
  const ANTISLASH = "\\";

  let sortie = "";
  let i = 0;
  let dernierSignificatif = "";
  /** Nombre de substitutions `${…}` ouvertes dans des gabarits. */
  let gabaritsSuspendus = 0;

  const estDebutDeRegex = (): boolean => {
    if (dernierSignificatif === "") return true;
    if (AVANT_UNE_REGEX.has(dernierSignificatif)) return true;
    const motPrecedent = /([A-Za-z_$][\w$]*)\s*$/.exec(sortie);
    const mot = motPrecedent?.[1];
    return mot !== undefined && MOTS_CLES_AVANT_REGEX.includes(mot);
  };

  /** Blanchit de `i` (inclus) à `fin` (exclu), en conservant les sauts de ligne. */
  const blanchir = (fin: number): void => {
    for (let j = i; j < fin; j += 1) {
      sortie += source[j] === "\n" ? "\n" : " ";
    }
    i = fin;
  };

  /**
   * Le CONTENU d'un littéral, écrit tel quel ou blanchi selon le client.
   *
   * ⚠️ Les sauts de ligne survivent dans les deux régimes : sans eux, les
   *    numéros de ligne d'un gabarit multiligne se décaleraient, et un message
   *    de garde désignerait la mauvaise ligne.
   */
  const emettreContenu = (texte: string): void => {
    sortie += blanchirLesChaines ? texte.replace(/[^\n]/gu, " ") : texte;
  };

  /** Avale une chaîne ou un gabarit à partir de son guillemet ouvrant. */
  const avalerChaine = (ouvrant: string): void => {
    sortie += ouvrant;
    i += 1;
    while (i < source.length) {
      const d = source[i];
      if (d === ANTISLASH) {
        emettreContenu(source.slice(i, i + 2));
        i += 2;
        continue;
      }
      if (ouvrant === ACCENT && d === "$" && source[i + 1] === "{") {
        // On SORT du gabarit : le code de la substitution doit être balayé
        // normalement, sinon un commentaire qui s'y trouverait survivrait.
        gabaritsSuspendus += 1;
        sortie += "${";
        i += 2;
        return;
      }
      if (d === ouvrant) {
        sortie += d;
        i += 1;
        return;
      }
      emettreContenu(d ?? "");
      i += 1;
      // Une chaîne simple ou double ne franchit pas la fin de ligne.
      if (ouvrant !== ACCENT && d === "\n") return;
    }
  };

  while (i < source.length) {
    const c = source[i];
    const suivant = source[i + 1];

    // ── Commentaire de ligne ────────────────────────────────────────────────
    if (c === "/" && suivant === "/") {
      let fin = i;
      while (fin < source.length && source[fin] !== "\n") fin += 1;
      blanchir(fin);
      continue;
    }

    // ── Commentaire de bloc ─────────────────────────────────────────────────
    if (c === "/" && suivant === "*") {
      let fin = i + 2;
      while (fin < source.length && !(source[fin] === "*" && source[fin + 1] === "/")) fin += 1;
      blanchir(Math.min(fin + 2, source.length));
      continue;
    }

    // ── Chaînes et gabarits ─────────────────────────────────────────────────
    if (c === APOSTROPHE || c === GUILLEMET || c === ACCENT) {
      avalerChaine(c);
      dernierSignificatif = c;
      continue;
    }

    // ── Retour DANS un gabarit à la fermeture de sa substitution ────────────
    if (c === "}" && gabaritsSuspendus > 0) {
      gabaritsSuspendus -= 1;
      sortie += c;
      i += 1;
      // La suite appartient au gabarit : on la ravale comme telle.
      while (i < source.length) {
        const d = source[i];
        if (d === ANTISLASH) {
          emettreContenu(source.slice(i, i + 2));
          i += 2;
          continue;
        }
        if (d === "$" && source[i + 1] === "{") {
          gabaritsSuspendus += 1;
          sortie += "${";
          i += 2;
          break;
        }
        if (d === ACCENT) {
          sortie += d;
          i += 1;
          break;
        }
        emettreContenu(d ?? "");
        i += 1;
      }
      dernierSignificatif = ACCENT;
      continue;
    }

    // ── Littéral d'expression régulière ─────────────────────────────────────
    if (c === "/" && estDebutDeRegex()) {
      sortie += c;
      i += 1;
      let dansUneClasse = false;
      while (i < source.length) {
        const d = source[i];
        sortie += d;
        i += 1;
        if (d === ANTISLASH) {
          if (i < source.length) {
            sortie += source[i];
            i += 1;
          }
          continue;
        }
        if (d === "[") dansUneClasse = true;
        else if (d === "]") dansUneClasse = false;
        else if (d === "/" && !dansUneClasse) break;
        // Une expression régulière ne franchit pas la fin de ligne : si on y
        // arrive, l'heuristique s'est trompée et on abandonne l'état.
        else if (d === "\n") break;
      }
      dernierSignificatif = "/";
      continue;
    }

    sortie += c ?? "";
    if (c !== undefined && !/\s/.test(c)) dernierSignificatif = c;
    i += 1;
  }

  return sortie;
}

/**
 * QUELLE PROPORTION DU SOURCE LE FILTRE A-T-IL EFFACÉE ?
 *
 * Un filtre qui blanchit une part invraisemblable d'un fichier n'a pas retiré
 * des commentaires : il a mangé du code. C'est le contrôle que le défaut
 * précédent réclamait — sans lui, l'effacement était SILENCIEUX, et une garde
 * de sécurité mesurait un fichier vide en se croyant verte.
 *
 * Rend une fraction entre 0 et 1, comptée sur les caractères NON blancs.
 */
export function proportionEffacee(source: string): number {
  let significatifs = 0;
  let effaces = 0;
  const propre = sansCommentaires(source);
  for (let i = 0; i < source.length; i += 1) {
    const brut = source[i];
    if (brut === undefined || brut === " " || brut === "\n" || brut === "\t" || brut === "\r") {
      continue;
    }
    significatifs += 1;
    if (propre[i] === " ") effaces += 1;
  }
  return significatifs === 0 ? 0 : effaces / significatifs;
}

/**
 * Les noms de propriétés d'une interface, lus dans un source TypeScript.
 *
 * Découpe par comptage d'accolades — une interface dont une propriété porterait
 * un type objet en ligne resterait correctement bornée.
 */
export function proprietesDInterface(source: string, nom: string): readonly string[] {
  const propre = sansCommentaires(source);
  const declaration = new RegExp(`\\binterface\\s+${nom}\\b[^{]*\\{`).exec(propre);
  if (declaration === null) return [];

  let profondeur = 0;
  let debut = -1;
  let fin = -1;
  for (let i = declaration.index; i < propre.length; i += 1) {
    const caractere = propre[i];
    if (caractere === "{") {
      if (profondeur === 0) debut = i + 1;
      profondeur += 1;
    } else if (caractere === "}") {
      profondeur -= 1;
      if (profondeur === 0) {
        fin = i;
        break;
      }
    }
  }
  if (debut === -1 || fin === -1) return [];

  const corps = propre.slice(debut, fin);
  const noms: string[] = [];
  for (const trouve of corps.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/gm)) {
    const nomPropriete = trouve[1];
    if (nomPropriete !== undefined && !noms.includes(nomPropriete)) noms.push(nomPropriete);
  }
  return noms;
}

/** Les noms qu'un schéma d'entrée n'a pas le droit de porter. */
export interface ClesDAutorisation {
  readonly toolContext: readonly string[];
  readonly habilitations: readonly string[];
  /**
   * TROISIÈME ENSEMBLE — **ADR 0020, et il est obligatoire.**
   *
   * Les noms que `ToolContext` a PORTÉS et ne porte plus. Sans lui, retirer une
   * propriété du `ctx` la retirerait de la liste dérivée EN SILENCE : le contrôle
   * resterait vert, simplement plus étroit d'un nom, et la règle « la clé
   * d'idempotence, jamais dans `input` » cesserait d'être gardée sans qu'aucune
   * couleur ne change.
   */
  readonly reservesHorsContexte: readonly string[];
  /** L'union des TROIS, triée — c'est elle que le contrôle 7 confronte au schéma. */
  readonly toutes: readonly string[];
  /** D'où elles ont été lues, pour que le rapport le dise. */
  readonly origine: string;
}

/** Planchers-témoins : sous ces comptes, la dérivation a échoué en silence. */
const PLANCHER_TOOL_CONTEXT = 5;
const PLANCHER_HABILITATIONS = 1;
/**
 * ADR 0020 — au moins un nom retiré du `ctx` doit rester interdit.
 *
 * Le jour où ce plancher tombe, c'est que quelqu'un a vidé
 * {@link NOMS_RESERVES_HORS_CONTEXTE} — et le contrôle 7 aurait recommencé à
 * accepter `idempotencyKey` dans un schéma d'entrée.
 */
const PLANCHER_RESERVES_HORS_CONTEXTE = 1;

/**
 * Dérive les clés interdites d'un source `core/types.ts`.
 *
 * @param reserves les noms retirés du `ctx`. **Paramètre présent POUR LE
 *        TÉMOIN** : le défaut est la vérité de production, et une garde ne se
 *        prouve qu'en la faisant rougir. Lui passer `[]` doit lever.
 *
 * @throws si la dérivation rend trop peu de clés. Une liste vide rendrait le
 *         contrôle 7 VACUEUX : il passerait sur n'importe quel schéma, et
 *         l'absence d'alerte se lirait comme une absence de problème.
 */
export function clesDAutorisationDepuisSource(
  source: string,
  origine: string,
  reserves: readonly string[] = NOMS_RESERVES_HORS_CONTEXTE,
): ClesDAutorisation {
  const toolContext = proprietesDInterface(source, "ToolContext");
  const habilitations = proprietesDInterface(source, "Habilitations");
  const reservesHorsContexte = [...reserves];

  if (reservesHorsContexte.length < PLANCHER_RESERVES_HORS_CONTEXTE) {
    throw new Error(
      `${origine} : ${String(reservesHorsContexte.length)} nom(s) réservé(s) hors contexte ` +
        `pour un plancher de ${String(PLANCHER_RESERVES_HORS_CONTEXTE)}. ` +
        "Un nom retiré de `ToolContext` sans être réservé cesse d'être refusé dans un " +
        "schéma d'entrée, et le contrôle 7 rétrécit SANS changer de couleur (ADR 0020).",
    );
  }

  if (toolContext.length < PLANCHER_TOOL_CONTEXT) {
    throw new Error(
      `${origine} : ${String(toolContext.length)} propriété(s) trouvée(s) dans ` +
        `\`ToolContext\` pour un plancher de ${String(PLANCHER_TOOL_CONTEXT)}. ` +
        "La dérivation a échoué — le contrôle 7 serait vacuous et vert.",
    );
  }
  if (habilitations.length < PLANCHER_HABILITATIONS) {
    throw new Error(
      `${origine} : ${String(habilitations.length)} propriété(s) trouvée(s) dans ` +
        `\`Habilitations\` pour un plancher de ${String(PLANCHER_HABILITATIONS)}.`,
    );
  }

  // ⚠️ L'UNION PREND LES TROIS ENSEMBLES — ADR 0020. Le troisième est
  //    délibérément PLUS LARGE que `ToolContext` : il porte des noms que le type
  //    ne porte plus. C'est cohérent avec la borne écrite en tête de ce fichier —
  //    la garde est « bruyante et dérivée plutôt que juste et recopiée » — et
  //    c'est ce qui empêche un retrait de rétrécir une garde en silence.
  const toutes = [...new Set([...toolContext, ...habilitations, ...reservesHorsContexte])].sort();
  return { toolContext, habilitations, reservesHorsContexte, toutes, origine };
}

/**
 * Lit `core/types.ts` et en dérive les clés interdites.
 *
 * Le chemin est calculé à partir de `import.meta.url`, jamais codé en dur
 * depuis la racine : une garde au chemin figé devient muette au déménagement.
 * Et l'import de `APPEL_STEPS` en tête de fichier fait rompre la COMPILATION
 * avant cela — ce test le vérifie.
 */
/**
 * LES DEUX FICHIERS OÙ LES DÉCLARATIONS PEUVENT VIVRE, DANS L'ORDRE.
 *
 * ⚠️ **LE SECOND N'EST PAS UN REPLI DE CONFORT : C'EST LE SEUL QUI EXISTE EN
 *    PRODUCTION.** `tsconfig.build.json` émet du `.js` et du `.d.ts` ; il ne
 *    COPIE aucun `.ts`. Sous `node dist/ops/index.js`, `../types.ts` n'existe
 *    donc pas, et cette fonction levait `ENOENT` — c'est-à-dire que le contrôle 7
 *    du § 09 était impossible à armer dans le seul environnement qui sert des
 *    appels. Le défaut n'avait jamais paru parce qu'aucun appelant de production
 *    ne l'invoquait encore.
 *
 * ⚠️ **LE `.d.ts` PORTE LES MÊMES DÉCLARATIONS, ÉMISES PAR LE COMPILATEUR DEPUIS
 *    LE MÊME FICHIER.** Ce n'est pas une seconde source de vérité : c'est la
 *    même, projetée. Les planchers (`PLANCHER_TOOL_CONTEXT`,
 *    `PLANCHER_HABILITATIONS`, `PLANCHER_RESERVES_HORS_CONTEXTE`) mordent
 *    identiquement sur les deux — une projection qui perdrait des noms fait
 *    LEVER, elle ne rétrécit pas la garde en silence.
 */
export const SOURCES_DES_CLES_DAUTORISATION = ["../types.ts", "../types.d.ts"] as const;

export function lireClesDAutorisation(): ClesDAutorisation {
  // Lu dans une variable élargie à `number` : comparer `APPEL_STEPS.length`
  // directement à 0 est une comparaison de types littéraux que TypeScript
  // refuse — ce qui est en soi la preuve que l'ancrage tient.
  const nombreEtapes: number = APPEL_STEPS.length;
  if (nombreEtapes === 0) {
    throw new Error("core/types.ts est joignable mais vide — la dérivation ne vaut rien.");
  }

  const essayes: string[] = [];
  for (const relatif of SOURCES_DES_CLES_DAUTORISATION) {
    const chemin = fileURLToPath(new URL(relatif, import.meta.url));
    essayes.push(chemin);
    let source: string;
    try {
      source = readFileSync(chemin, "utf8");
    } catch {
      continue;
    }
    return clesDAutorisationDepuisSource(source, chemin);
  }

  // ⚠️ ON LÈVE EN NOMMANT LES DEUX CHEMINS. Un contrôle 7 désarmé est
  //    exactement ce que `ErreurGardeAveugle` refuse plus loin : mieux vaut un
  //    refus qui dit où chercher qu'une admission sur une liste vide.
  throw new Error(
    `aucune source de déclarations trouvée pour le contrôle 7 — essayé : ${essayes.join(", ")}. ` +
      "`tsconfig.build.json` n'émet pas de `.ts` : sous `dist/`, c'est le `.d.ts` qui porte " +
      "les mêmes déclarations.",
  );
}
