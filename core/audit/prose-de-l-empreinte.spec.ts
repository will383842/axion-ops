import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { CHAMPS_COUVERTS } from "./canonique.js";

/**
 * GARDE — LA PROSE QUI COMPTE LES CHAMPS DE L'EMPREINTE CHAÎNÉE DOIT COMPTER
 * JUSTE.
 *
 * ═══ LE DÉFAUT QUE CETTE GARDE FERME ═══
 *
 * Trois documents — `CHANGELOG.md`, `docs/ETAT.md` et l'ADR 0002 — écrivaient
 * que l'empreinte chaînée couvre **seize** champs. Elle en couvrait dix-sept
 * depuis que l'ADR 0017 y a fait entrer `externalEffect`. Les trois phrases
 * étaient VRAIES le jour où elles ont été écrites, et fausses le lendemain.
 *
 * Ce qui rend ce genre d'écart durable n'est pas la faute : c'est que **rien ne
 * pouvait rougir**. `CHAMPS_COUVERTS` est confronté au schéma Prisma par
 * `derivation.spec.ts`, à sa forme canonique par `canonique.spec.ts` — et à la
 * prose par personne. Un chiffre écrit dans un document ne se contredit tout
 * seul dans aucune CI.
 *
 * Cette garde confronte donc les DEUX : elle relit les documents du dépôt, y
 * cherche les phrases qui annoncent un nombre de champs COUVERTS, et exige que
 * chacune dise `CHAMPS_COUVERTS.length`. Le jour où un dix-huitième champ
 * entrera dans l'empreinte, les trois phrases rougiront le jour même.
 *
 * ═══ CE QU'ELLE MESURE, ET CE QU'ELLE NE MESURE PAS — LA BORNE, ÉCRITE ═══
 *
 * ⚠️ ELLE NE TROUVE QUE LES FORMES QU'ELLE A NOMMÉES. Le motif reconnaît les
 *    chiffres et les noms de nombres français de zéro à vingt, en gras Markdown
 *    ou non, suivis du mot « champs », et n'en retient une occurrence que si
 *    « empreinte chaînée » ou `CHAMPS_COUVERTS` figure à moins de 140
 *    caractères. Une phrase qui dirait « la ligne scelle une quinzaine de
 *    colonnes » lui échapperait, et une garde qui prétendrait le contraire
 *    transformerait son périmètre d'observation en garantie.
 *
 * ⚠️ C'EST POURQUOI ELLE ANNONCE COMBIEN DE PHRASES ELLE A TROUVÉES, ET PORTE
 *    UN PLANCHER. Zéro phrase trouvée est le seul résultat qui la rendrait
 *    verte sans rien mesurer — c'est aussi ce qui arriverait si quelqu'un
 *    reformulait les trois phrases sans corriger leur chiffre. Le plancher
 *    refuse ce vert-là.
 *
 * ⚠️ ELLE NE RELIT PAS `node_modules` NI `.git`, et elle annonce le nombre de
 *    documents parcourus : une garde qui ne lirait plus aucun fichier serait
 *    verte pour la pire des raisons.
 */

const RACINE = fileURLToPath(new URL("../..", import.meta.url));

/** Les dossiers qu'aucune garde de ce dépôt n'a à parcourir. */
const DOSSIERS_IGNORES = new Set([".git", "node_modules", "dist", "coverage"]);

/**
 * Les noms de nombres français, DÉRIVÉS d'une seule liste ordonnée : l'index
 * EST la valeur. Écrire deux tables — nom → valeur et valeur → nom — en ferait
 * deux dérivations d'un même fait, et elles finiraient par se contredire.
 */
const NOMS_DE_NOMBRES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
  "vingt",
] as const;

/**
 * Le motif des phrases surveillées.
 *
 * ⚠️ « un » et « une » sont EXCLUS du motif, et c'est mesuré et non supposé :
 *    « un champ » est un article, pas un compte, et le dépôt en porte une
 *    dizaine autour du mot « couvert ». Les inclure aurait fait rougir la garde
 *    sur des phrases parfaitement justes — une garde qui crie faux est une
 *    garde qu'on désarme.
 */
const NOMBRES_DU_MOTIF = NOMS_DE_NOMBRES.filter((nom) => nom !== "un");

const PHRASE_COMPTANT_DES_CHAMPS = new RegExp(
  `\\*{0,2}\\b(${NOMBRES_DU_MOTIF.join("|")}|\\d{1,3})\\*{0,2}\\s+champs\\b`,
  "gi",
);

/** Ce qui doit se trouver PRÈS du nombre pour qu'il parle de l'empreinte. */
const ANCRE_DE_CONTEXTE = /empreinte cha[iî]n[ée]e|CHAMPS_COUVERTS/i;

/** La fenêtre de contexte, en caractères, de part et d'autre du nombre. */
const FENETRE = 140;

/** Une phrase trouvée : où elle est, ce qu'elle écrit, ce qu'elle vaut. */
interface PhraseComptee {
  readonly document: string;
  readonly ligne: number;
  readonly ecrit: string;
  /** La valeur numérique, ou `null` si le mot n'est pas dans la table. */
  readonly valeur: number | null;
}

/** Tous les `.md` du dépôt, `node_modules` et `.git` exclus. */
function documentsDuDepot(dossier: string, trouves: string[] = []): readonly string[] {
  for (const entree of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(entree)) continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      documentsDuDepot(chemin, trouves);
      continue;
    }
    if (entree.endsWith(".md")) trouves.push(chemin);
  }
  return trouves;
}

/** La valeur d'un nombre écrit en chiffres ou en toutes lettres. */
function valeurDe(ecrit: string): number | null {
  const nu = ecrit.replaceAll("*", "").trim().toLowerCase();
  if (/^\d{1,3}$/.test(nu)) return Number(nu);
  const rang = NOMS_DE_NOMBRES.indexOf(nu as (typeof NOMS_DE_NOMBRES)[number]);
  return rang === -1 ? null : rang;
}

/**
 * Relit UN document et rend les phrases qui comptent des champs couverts.
 *
 * @param document - le nom rendu dans le rapport, jamais un chemin absolu.
 * @param contenu - le texte. INJECTABLE : une garde doit pouvoir fabriquer un
 *   document faux pour prouver que la confrontation rougit.
 */
export function phrasesComptantDesChamps(
  document: string,
  contenu: string,
): readonly PhraseComptee[] {
  const trouvees: PhraseComptee[] = [];
  for (const occurrence of contenu.matchAll(PHRASE_COMPTANT_DES_CHAMPS)) {
    const debut = occurrence.index;
    const contexte = contenu.slice(
      Math.max(0, debut - FENETRE),
      debut + occurrence[0].length + FENETRE,
    );
    if (!ANCRE_DE_CONTEXTE.test(contexte)) continue;
    const ecrit = occurrence[1] ?? "";
    trouvees.push({
      document,
      ligne: contenu.slice(0, debut).split("\n").length,
      ecrit,
      valeur: valeurDe(ecrit),
    });
  }
  return trouvees;
}

describe("core/audit — la prose qui compte les champs de l'empreinte compte juste", () => {
  it("rougit sur un document fabriqué qui annonce un compte périmé", () => {
    // LE TÉMOIN D'ABORD. Sans lui, le vert du cas réel ne dirait pas si la
    // confrontation fonctionne ou si le motif ne trouve simplement rien.
    const faux =
      "L'empreinte chaînée couvre désormais **seize** champs, et le reste tient.\n" +
      "Une seconde phrase, en chiffres : `CHAMPS_COUVERTS` en porte 3 champs.\n";
    const phrases = phrasesComptantDesChamps("document-témoin.md", faux);
    const fausses = phrases.filter((phrase) => phrase.valeur !== CHAMPS_COUVERTS.length);

    console.info(
      `[garde prose · témoin] ${String(phrases.length)} phrase(s) fabriquée(s) trouvée(s) · ` +
        `${String(fausses.length)} en désaccord avec CHAMPS_COUVERTS (${String(
          CHAMPS_COUVERTS.length,
        )}) : ${fausses.map((p) => p.ecrit).join(", ")}`,
    );

    // Deux formes, une en lettres et une en chiffres : le motif doit voir les
    // deux, sans quoi la garde réelle ne verrait que la moitié du dépôt.
    expect(phrases).toHaveLength(2);
    expect(fausses).toHaveLength(2);
  });

  it("SAIT DIRE OUI — une phrase juste ne fait pas rougir", () => {
    // Le contre-témoin. Une garde qui refuserait TOUTE phrase serait verte
    // ci-dessus pour la pire des raisons.
    const juste = `L'empreinte chaînée couvre ${
      NOMS_DE_NOMBRES[CHAMPS_COUVERTS.length] ?? String(CHAMPS_COUVERTS.length)
    } champs.`;
    const phrases = phrasesComptantDesChamps("document-témoin.md", juste);
    const fausses = phrases.filter((phrase) => phrase.valeur !== CHAMPS_COUVERTS.length);

    console.info(
      `[garde prose · contre-témoin] ${String(phrases.length)} phrase(s) trouvée(s) · ` +
        `${String(fausses.length)} en désaccord`,
    );

    expect(phrases).toHaveLength(1);
    expect(fausses).toEqual([]);
  });

  it("ignore « un champ », qui est un article et non un compte", () => {
    // Mesuré, pas supposé : le dépôt porte une dizaine de « un champ » autour du
    // mot « couvert », et une garde qui crie faux est une garde qu'on désarme.
    const article = "Un champ de plus dans `CHAMPS_COUVERTS` change l'empreinte chaînée.";
    const phrases = phrasesComptantDesChamps("document-témoin.md", article);

    console.info(
      `[garde prose · article] ${String(phrases.length)} phrase(s) retenue(s) sur un texte qui ` +
        `porte « Un champ » à moins de ${String(FENETRE)} caractères de l'ancre`,
    );

    expect(phrases).toEqual([]);
  });

  it("confronte les documents RÉELS du dépôt à `CHAMPS_COUVERTS`, et annonce ses comptes", () => {
    const documents = documentsDuDepot(RACINE);
    const phrases: PhraseComptee[] = [];
    for (const chemin of documents) {
      phrases.push(
        ...phrasesComptantDesChamps(
          relative(RACINE, chemin).split(sep).join("/"),
          readFileSync(chemin, "utf8"),
        ),
      );
    }
    const fausses = phrases.filter((phrase) => phrase.valeur !== CHAMPS_COUVERTS.length);

    console.info(
      `[garde prose] ${String(documents.length)} document(s) Markdown relu(s) · ` +
        `${String(phrases.length)} phrase(s) comptant des champs couverts · ` +
        `${String(CHAMPS_COUVERTS.length)} champs dans CHAMPS_COUVERTS · ` +
        `${String(fausses.length)} en désaccord` +
        (fausses.length === 0
          ? ""
          : `\n${fausses
              .map(
                (phrase) =>
                  `        · ${phrase.document}:${String(phrase.ligne)} écrit « ${phrase.ecrit} »`,
              )
              .join("\n")}`),
    );

    // ⚠️ LES DEUX PLANCHERS-TÉMOINS, ET ILS NE DISENT PAS LA MÊME CHOSE.
    //    Le premier refuse une garde qui ne lirait plus aucun document ; le
    //    second refuse une garde qui les lirait tous et n'y trouverait plus
    //    aucune phrase — ce qui arriverait si les trois étaient reformulées
    //    SANS que leur chiffre soit corrigé, c'est-à-dire le cas exact que
    //    cette garde existe pour attraper.
    expect(documents.length).toBeGreaterThanOrEqual(10);
    expect(phrases.length).toBeGreaterThanOrEqual(3);
    expect(fausses).toEqual([]);
  });
});
