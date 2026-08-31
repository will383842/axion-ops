/**
 * `ops/temoin-ci.ts` — CETTE CHAÎNE SAIT-ELLE ROUGIR ?
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * Un dépôt dont la chaîne d'intégration n'a jamais rougi est une chaîne dont
 * personne ne sait si elle regarde. C'est le défaut le plus difficile à voir,
 * parce qu'il ne produit aucun symptôme : tout est vert, tout le temps, et la
 * conclusion qu'on en tire — « le code est sain » — est indistinguable de
 * « rien n'est mesuré ».
 *
 * Trois façons ordinaires d'arriver là, et les trois sont arrivées ailleurs :
 * une étape qui porte `continue-on-error`, une commande dont le code de retour
 * est écrasé (`|| true`), une étape conditionnée à un secret qui disparaît
 * quand le secret manque. `ops/workflow.ts` lit le YAML et refuse les trois.
 * Mais lire le YAML ne prouve pas que les OUTILS échouent : un `tsc` qui ne
 * regarde aucun fichier, un `vitest` dont le motif d'inclusion ne trouve plus
 * rien, un `eslint` dont la configuration ignore tout le dépôt rendent 0 sans
 * qu'aucune ligne de workflow soit fautive.
 *
 * ═══ CE QUE CE SCRIPT FAIT ═══
 *
 * Pour CHACUNE des quatre gates, il fabrique un défaut, lance LA COMMANDE
 * RÉELLE de la gate — celle du `package.json`, pas une approximation — et exige
 * un code de retour NON NUL. Puis il retire le défaut et exige que la même
 * commande redevienne verte.
 *
 * Les deux moitiés comptent, et pour des raisons différentes :
 *
 *  · sans la moitié ROUGE, on ne sait pas que la gate mord ;
 *  · sans la moitié VERTE, une gate cassée en permanence — un outil absent, une
 *    configuration illisible — passerait pour une gate qui mord. C'est le
 *    « rouge pour la mauvaise raison », et il se solde toujours par une
 *    désactivation.
 *
 * ⚠️ LES DÉFAUTS SONT ÉCRITS DANS LE DÉPÔT, PUIS RETIRÉS DANS UN `finally`.
 *    Ils vivent sous `ops/temoin-ci/`, dossier qui n'existe QUE pendant
 *    l'exécution de ce script — c'est ce qui permet aux gates de le voir sans
 *    qu'aucune exclusion de configuration n'ait à être écrite. Une exclusion
 *    serait pire : elle rendrait le dossier invisible aux gates, et le témoin
 *    mesurerait alors autre chose que ce que la chaîne mesure.
 *
 * ⚠️ IL N'APPELLE AUCUN RÉSEAU. Il n'exécute que les commandes du
 *    `package.json` de ce dépôt.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ═════════════════════════════════════════════════════════════════════════════
//  Le décor
// ═════════════════════════════════════════════════════════════════════════════

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const DOSSIER = fileURLToPath(new URL("../ops/temoin-ci/", import.meta.url));

/** Une gate : son nom, la commande RÉELLE, et le défaut qui doit la faire rougir. */
interface Gate {
  readonly nom: string;
  /** Les arguments passés à `pnpm`. C'est la commande du `package.json`. */
  readonly commande: readonly string[];
  /** Le nom du fichier fabriqué, sous `ops/temoin-ci/`. */
  readonly fichier: string;
  /** Le contenu défectueux. */
  readonly defaut: string;
  /** Ce que ce défaut prouve, quand la gate rougit dessus. */
  readonly prouve: string;
}

const GATES: readonly Gate[] = [
  {
    nom: "typecheck",
    commande: ["typecheck"],
    fichier: "types.temoin.ts",
    // Une chaîne affectée à un nombre. `strict` est actif : c'est une erreur.
    defaut: 'export const compte: number = "pas un nombre";\n',
    prouve: "le compilateur regarde bien les fichiers du dépôt, et il refuse",
  },
  {
    nom: "lint",
    commande: ["lint"],
    fichier: "style.temoin.ts",
    // `no-unused-vars` est en `error`, et le nom ne commence pas par `_`.
    defaut: "export function temoin(): void {\n  const inutilise = 1;\n  void 0;\n}\n",
    prouve: "eslint atteint bien les fichiers du dépôt, et ses règles sont en `error`",
  },
  {
    nom: "format:check",
    commande: ["format:check"],
    fichier: "format.temoin.ts",
    // Guillemets simples, point-virgule absent, indentation fausse.
    defaut: "export const mal   =    {a:1,\n b:2}\n",
    prouve: "prettier n'ignore pas silencieusement les fichiers qu'il devrait vérifier",
  },
  {
    nom: "test",
    commande: ["test"],
    fichier: "echec.temoin.spec.ts",
    defaut:
      'import { describe, expect, it } from "vitest";\n\n' +
      'describe("TÉMOIN DE CHAÎNE — cette garde DOIT échouer", () => {\n' +
      '  it("échoue délibérément : si elle passe, vitest ne lit pas ce dossier", () => {\n' +
      "    expect(1).toBe(2);\n" +
      "  });\n" +
      "});\n",
    prouve: "vitest trouve bien les gardes du dépôt, et un échec fait sortir en code non nul",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  L'exécution
// ═════════════════════════════════════════════════════════════════════════════

/** Lance une commande `pnpm` et rend son code de sortie. La sortie est jetée :
 *  on ne mesure ici que le CODE DE RETOUR, et les journaux d'un `tsc` en échec
 *  fabriqué n'apprendraient rien à personne. */
function lancer(arguments_: readonly string[]): Lancement {
  // ⚠️ `shell: true` SOUS WINDOWS SEULEMENT, ET C'EST OBLIGATOIRE : depuis
  //    Node 20, `spawn` refuse d'exécuter un `.cmd` sans shell, et `pnpm` n'est
  //    qu'un `.cmd` sur cette plateforme. Sans lui, AUCUNE commande ne démarre
  //    et les quatre gates rendent un code non nul — ce témoin les déclarerait
  //    toutes « cassées en permanence », ce qui est le rouge pour la mauvaise
  //    raison qu'il existe justement pour distinguer. Les arguments sont des
  //    littéraux écrits ci-dessus, jamais une valeur reçue.
  const resultat = spawnSync("pnpm", [...arguments_], {
    cwd: RACINE,
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  // La commande n'a pas pu être LANCÉE : ce n'est ni un succès ni un échec de
  // la gate, c'est l'absence de mesure. La confondre avec un code de retour
  // ferait dire au témoin que la gate mord, alors que rien n'a tourné.
  if (resultat.error !== undefined) {
    return { lance: false, code: 1, panne: resultat.error.message };
  }

  // `status: null` = processus tué par un signal. Le confondre avec 0 ferait
  // passer une gate INTERROMPUE pour une gate verte.
  return { lance: true, code: resultat.status ?? 1, panne: null };
}

/** Ce que rend un lancement : le code, ET si la commande a seulement démarré. */
interface Lancement {
  readonly lance: boolean;
  readonly code: number;
  readonly panne: string | null;
}

function ecrireDefaut(gate: Gate): void {
  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(`${DOSSIER}${gate.fichier}`, gate.defaut, "utf8");
}

function nettoyer(): void {
  rmSync(DOSSIER, { recursive: true, force: true });
}

function principale(): number {
  const anomalies: string[] = [];
  let gatesMesurees = 0;

  // Un reste d'exécution précédente fausserait la moitié VERTE.
  nettoyer();

  try {
    for (const gate of GATES) {
      gatesMesurees += 1;

      // ── Moitié ROUGE ──
      ecrireDefaut(gate);
      const avecDefaut = lancer(gate.commande);
      nettoyer();

      // ── Moitié VERTE ──
      const sansDefaut = lancer(gate.commande);

      const codeAvecDefaut = avecDefaut.code;
      const codeSansDefaut = sansDefaut.code;

      process.stdout.write(
        `[témoin CI] gate « ${gate.nom} » (pnpm ${gate.commande.join(" ")}) — ` +
          `avec défaut : code ${String(codeAvecDefaut)} · ` +
          `sans défaut : code ${String(codeSansDefaut)}\n`,
      );

      // ⚠️ UNE COMMANDE QUI N'A PAS DÉMARRÉ N'EST PAS UNE GATE QUI ÉCHOUE.
      //    Node refuse d'exécuter un `.cmd` sans shell depuis la version 20 :
      //    la gate rendait alors un code non nul sans avoir rien mesuré, et le
      //    témoin la déclarait « cassée en permanence ». C'est exactement le
      //    rouge pour la mauvaise raison qu'il existe pour distinguer — il doit
      //    donc savoir le nommer, pas le compter comme un échec de gate.
      for (const [moitie, lancement] of [
        ["avec défaut", avecDefaut],
        ["sans défaut", sansDefaut],
      ] as const) {
        if (!lancement.lance) {
          anomalies.push(
            `la gate « ${gate.nom} » n'a pas pu être LANCÉE (${moitie}) : ` +
              `${lancement.panne ?? "cause inconnue"}. Rien n'a été mesuré — ce n'est pas un ` +
              "échec de la gate, c'est l'absence de gate.",
          );
        }
      }

      if (codeAvecDefaut === 0) {
        anomalies.push(
          `la gate « ${gate.nom} » est restée VERTE sur un défaut fabriqué. Elle ne mesure pas ` +
            `ce qu'elle prétend mesurer : ${gate.prouve} — or ce n'est pas le cas.`,
        );
      }
      if (codeSansDefaut !== 0) {
        anomalies.push(
          `la gate « ${gate.nom} » est ROUGE sans défaut (code ${String(codeSansDefaut)}). ` +
            "Son rouge sur le défaut ne prouve donc rien : elle est cassée en permanence, et " +
            "un rouge permanent finit toujours par être désactivé.",
        );
      }
    }
  } finally {
    nettoyer();
  }

  process.stdout.write(
    `[témoin CI] ${String(gatesMesurees)} gate(s) éprouvée(s) sur ${String(GATES.length)} ` +
      `déclarée(s), ${String(anomalies.length)} anomalie(s)\n`,
  );

  // Plancher-témoin : une boucle qui n'aurait rien parcouru serait verte.
  if (gatesMesurees !== GATES.length || gatesMesurees === 0) {
    process.stderr.write(
      "[témoin CI] le témoin lui-même n'a rien mesuré : la boucle n'a pas parcouru les gates.\n",
    );
    return 1;
  }

  if (anomalies.length > 0) {
    for (const anomalie of anomalies) process.stderr.write(`[témoin CI] ${anomalie}\n`);
    return 1;
  }

  process.stdout.write(
    "[témoin CI] les quatre gates rougissent sur un défaut fabriqué et reverdissent sans lui.\n",
  );
  return 0;
}

process.exitCode = principale();
