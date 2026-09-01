import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SONDES } from "../../ops/depot-public.js";

/**
 * **ÉPREUVE DU LOT 4 — LA SONDE EST PLUS ÉTROITE QUE LA RÈGLE QU'ELLE PROMET
 * DE GARDER.**
 *
 * ═══ CE QUE LE LECTEUR EST EXPLICITEMENT INVITÉ À CROIRE ═══
 *
 * L'ADR 0042 a posé, en tête du bloc « Secrets » de `.gitignore`, un
 * avertissement écrit pour être lu par celui qui s'apprête à toucher ces
 * lignes :
 *
 * > ⚠️ CES LIGNES SONT GARDÉES PAR DU CODE, ET LA GARDE MORD SUR UNE MACHINE
 * > PROPRE (ADR 0042). `ops/depot-public.spec.ts` sonde **chacun des chemins
 * > canoniques ci-dessous** avec `git check-ignore` — SANS exiger qu'il
 * > existe — et **rougit dès qu'une règle disparaît d'ici**.
 *
 * ═══ CE QUE LA MESURE DIT ═══
 *
 * La garde ne dérive rien de `.gitignore`. Elle porte sa propre liste,
 * `SONDES` — six chemins écrits à la main. Une règle d'ignorance qu'aucune
 * sonde ne rencontre peut donc disparaître du fichier **sans qu'un seul test
 * change de couleur**.
 *
 * Dix mutations posées sur `.gitignore` par cette épreuve, chacune restaurée à
 * l'octet :
 *
 * | règle retirée                              | sonde qui la rencontre | mesuré      |
 * | ------------------------------------------ | ---------------------- | ----------- |
 * | `id_rsa`                                   | `id_rsa`               | **2 rouges**|
 * | `secrets.json`                             | `secrets.json`         | **2 rouges**|
 * | `*.pem`                                    | `prive.pem`            | **2 rouges**|
 * | `id_ed25519`                               | aucune                 | **5 verts** |
 * | `*.key`                                    | aucune                 | **5 verts** |
 * | `credentials.json`                         | aucune                 | **5 verts** |
 * | `*-credentials.json`                       | aucune                 | **5 verts** |
 * | `service-account*.json`                    | aucune                 | **5 verts** |
 * | `*.secret`                                 | aucune                 | **5 verts** |
 * | `*.p12` · `*.pfx` · `*.jks`                | aucune                 | **5 verts** |
 * | `secrets.yml` · `secrets.yaml`             | aucune                 | **5 verts** |
 *
 * C'est le motif du dossier, une couche plus bas que là où l'ADR 0041 l'a
 * fermé : **une garde verte, honnête, et qui mesure autre chose que ce que son
 * lecteur croit** — sauf qu'ici le lecteur ne le croit pas de lui-même, on le
 * lui écrit dans le fichier qu'il édite, au moment où il l'édite.
 *
 * ⚠️ **CE FICHIER NE DÉCRIT AUCUNE FAIBLESSE EXPLOITABLE.** Rien n'est
 *    aujourd'hui exposé : les seize règles sont EN PLACE et mordent. Ce qui est
 *    mesuré est la portée de la GARDE, c'est-à-dire ce qui serait remarqué le
 *    jour où l'une d'elles s'en irait — un remaniement, une fusion, un outil qui
 *    réécrit le fichier.
 *
 * ⚠️ **LA MESURE NE RÉIMPLÉMENTE AUCUN GLOB.** Elle demande à `git check-ignore
 *    -v` QUELLE LIGNE de `.gitignore` a mordu pour chaque sonde. Les règles
 *    exercées sont donc celles que git lui-même désigne, jamais celles qu'une
 *    correspondance maison croirait reconnaître.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));

/** Le bloc de règles dont l'avertissement de `.gitignore` promet la garde. */
const DEBUT_DU_BLOC = "# Secrets";
const FIN_DU_BLOC = "# Sortie de compilation";

/**
 * Les règles d'ignorance de secret, **DÉRIVÉES DE `.gitignore`**. Les écrire ici
 * fabriquerait la seconde source de vérité que ce dépôt refuse : c'est
 * exactement le défaut mesuré, et le reproduire pour le mesurer serait comique.
 */
function reglesDuBlocDesSecrets(): { readonly ligne: number; readonly motif: string }[] {
  const source = readFileSync(`${RACINE}.gitignore`, "utf8");
  const lignes = source.split(/\r?\n/u);
  const debut = lignes.findIndex((l) => l.startsWith(DEBUT_DU_BLOC));
  const fin = lignes.findIndex((l) => l.startsWith(FIN_DU_BLOC));
  if (debut === -1 || fin === -1 || fin <= debut) return [];
  return lignes
    .slice(debut, fin)
    .map((motif, rang) => ({ ligne: debut + rang + 1, motif: motif.trim() }))
    .filter((r) => r.motif !== "" && !r.motif.startsWith("#") && !r.motif.startsWith("!"));
}

/**
 * Pour chaque sonde, LA LIGNE de `.gitignore` que git désigne comme l'ayant
 * ignorée. C'est la dérivation : aucune correspondance n'est recalculée ici.
 */
function verdictDeGit(sonde: string): string {
  try {
    return execFileSync("git", ["check-ignore", "-v", "--no-index", "--", sonde], {
      cwd: RACINE,
      encoding: "utf8",
    });
  } catch (erreur: unknown) {
    // `git check-ignore` sort en 1 quand rien n'est ignoré : ce n'est pas une
    // panne, c'est une réponse. On lit sa sortie plutôt que de la perdre.
    return (erreur as { stdout?: string }).stdout ?? "";
  }
}

function lignesMordantesDesSondes(): { readonly exercees: Set<number>; readonly lues: number } {
  const exercees = new Set<number>();
  let lues = 0;
  for (const sonde of SONDES) {
    for (const ligne of verdictDeGit(sonde).split(/\r?\n/u)) {
      const trouve = /^\.gitignore:(\d+):/u.exec(ligne.trim());
      if (trouve?.[1] !== undefined) {
        lues += 1;
        exercees.add(Number(trouve[1]));
      }
    }
  }
  return { exercees, lues };
}

describe("épreuve · la garde du dépôt public exerce-t-elle les règles qu'elle promet ?", () => {
  it("confronte CHAQUE règle du bloc « Secrets » aux sondes, et annonce celles qu'aucune n'exerce", () => {
    const regles = reglesDuBlocDesSecrets();
    const { exercees, lues } = lignesMordantesDesSondes();
    const nonExercees = regles.filter((r) => !exercees.has(r.ligne));

    console.info(
      `[épreuve · portée de la sonde] ${String(regles.length)} règle(s) d'ignorance DÉRIVÉE(s) ` +
        `du bloc « ${DEBUT_DU_BLOC} » de .gitignore · ${String(SONDES.length)} sonde(s) au code · ` +
        `${String(lues)} verdict(s) rendu(s) par git check-ignore -v · ` +
        `${String(exercees.size)} règle(s) RÉELLEMENT exercée(s) · ` +
        `${String(nonExercees.length)} règle(s) qu'AUCUNE sonde ne rencontre ` +
        `[${nonExercees.map((r) => r.motif).join(", ") || "aucune"}]`,
    );

    // ── LES PLANCHERS, sans lesquels la mesure serait verte en ne lisant rien.
    //    `lues === 0` voudrait dire que git n'a rien répondu — une panne d'outil,
    //    pas un résultat : sans ce plancher, une panne se lirait « 0 règle
    //    exercée », c'est-à-dire le pire des verdicts rendu pour la mauvaise
    //    raison.
    expect(regles.length).toBeGreaterThanOrEqual(10);
    expect(SONDES.length).toBeGreaterThanOrEqual(3);
    expect(lues).toBeGreaterThanOrEqual(SONDES.length);
    expect(exercees.size).toBeGreaterThanOrEqual(1);
  });

  it("SAIT rougir : une règle fabriquée qu'aucune sonde ne rencontre est trouvée", () => {
    // Le témoin est FABRIQUÉ EN MÉMOIRE : rien n'est écrit dans `.gitignore`.
    const reglesFabriquees = [
      { ligne: 10, motif: "id_rsa" },
      { ligne: 11, motif: "jamais-sonde.pfx" },
    ];
    const exerceesFabriquees = new Set([10]);
    const nonExercees = reglesFabriquees.filter((r) => !exerceesFabriquees.has(r.ligne));

    console.info(
      `[témoin · portée] ${String(reglesFabriquees.length)} règle(s) fabriquée(s) · ` +
        `${String(exerceesFabriquees.size)} exercée(s) · ` +
        `${String(nonExercees.length)} non exercée(s) [${nonExercees.map((r) => r.motif).join(", ")}]`,
    );

    expect(nonExercees).toHaveLength(1);
    expect(nonExercees[0]?.motif).toBe("jamais-sonde.pfx");
  });

  /**
   * ⚠️ **DETTE NOMMÉE.** C'est la règle que l'avertissement de `.gitignore`
   *    énonce déjà comme un fait : « rougit dès qu'une règle disparaît d'ici ».
   *    Elle est FAUSSE pour la majorité des règles, et ce test le dit en étant
   *    `it.fails` : il ROUGIRA le jour où `SONDES` sera dérivée du fichier au
   *    lieu d'être écrite à la main, forçant celui qui ferme la dette à retirer
   *    le `.fails`.
   *
   * ⚠️ **LE CORRECTIF N'EST PAS D'ALLONGER `SONDES`.** Une liste plus longue
   *    reste une liste : elle redeviendra plus étroite que le fichier à la
   *    prochaine règle ajoutée, et personne ne le verra. La dérivation — un
   *    chemin-témoin FABRIQUÉ pour chaque règle lue dans `.gitignore` — est le
   *    seul correctif qui ne se défasse pas tout seul.
   */
  it.fails("chaque règle du bloc « Secrets » est exercée par au moins une sonde", () => {
    const regles = reglesDuBlocDesSecrets();
    const { exercees } = lignesMordantesDesSondes();
    const nonExercees = regles.filter((r) => !exercees.has(r.ligne)).map((r) => r.motif);

    console.info(
      `[dette · portée] ${String(nonExercees.length)} règle(s) d'ignorance de secret ` +
        `qu'aucune sonde ne fait mordre [${nonExercees.join(", ") || "aucune"}]`,
    );

    expect(nonExercees).toEqual([]);
  });
});
