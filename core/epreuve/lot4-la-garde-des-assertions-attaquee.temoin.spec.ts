import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LONGUEUR_MINIMALE_CONFRONTEE, verifierAucuneFuite } from "../transport/anti-fuite.js";
import type { FichierSoumis } from "../coutures/contrat.js";
import type { AssertionDeCouture, EntreeDeCouture } from "../coutures/registre.js";
import { REGISTRE_DES_COUTURES } from "../coutures/registre.js";
import { corpsDuTestNomme, sansProse, verifierLesAssertions } from "../coutures/verifier.js";
import {
  RACINE_DU_DEPOT,
  fichiersLivresDuDepot,
  tousLesFichiersTs,
} from "./perimetre-de-production.js";

/**
 * **L'ÉPREUVE DU LOT 4 — « UNE GARDE PEUT ÊTRE VERTE, HONNÊTE, ET MESURER AUTRE
 * CHOSE QUE CE QUE SON LECTEUR CROIT. »**
 *
 * ═══ CE QUE CE FICHIER ATTAQUE, ET POURQUOI ═══
 *
 * Le lot 1d a bâti une garde de couture pour rendre impossible le défaut « une
 * décision écrite, testée, documentée, et jamais branchée ». Elle est verte, et
 * DEUX ADR « acceptées » lui sont passées sous le nez au lot suivant : l'état
 * `cousue` compte les APPELANTS D'UN SYMBOLE, jamais l'atterrissage d'une
 * DÉCISION. Le lot 4 répond par G4 (ADR 0041) — le champ `assertion`, et
 * `verifierLesAssertions` qui le confronte au disque.
 *
 * Ce fichier ne relit pas G4 : **il l'attaque**, et il pose la même question à
 * chacune des ADR du dossier.
 *
 * ═══ LES DEUX MOITIÉS ═══
 *
 *  · **§ ①** confronte CHAQUE ADR de `docs/adr/` au code LIVRÉ, une par une, et
 *    annonce ses comptes. La question n'est pas « le symbole a-t-il des
 *    appelants » — c'est exactement cette différence-là qui a laissé passer les
 *    ADR 0036 et 0037 —, c'est : **existe-t-il, dans le code de production,
 *    quelque chose qui n'existerait pas si cette décision n'avait pas été
 *    prise ?**
 *
 *  · **§ ②** remet à G4 des jeux de fichiers FABRIQUÉS et exige d'elle qu'elle
 *    dise NON. Elle sait le dire sur une assertion ABSENTE ; les trois `it.fails`
 *    qui suivent nomment trois façons de la satisfaire avec un test que rien ne
 *    fait échouer.
 *
 * ⚠️ **CHAQUE `it.fails` DE CE FICHIER EST UNE DETTE NOMMÉE, PAS UN TEST CASSÉ.**
 *    Il est VERT tant que le défaut est là, et il ROUGIT le jour où il est
 *    fermé — forçant le correcteur à retirer le `.fails`. Chacun a été écrit
 *    d'abord en `it()`, exécuté, trouvé ROUGE, et l'état est transcrit dans son
 *    commentaire. Un `it.fails` qu'on n'a pas vu rougir en `it()` ne prouve rien.
 *
 * ⚠️ **AUCUNE MODIFICATION DU SOCLE.** Ce fichier ne fait que lire et fabriquer.
 *    Il ne lit aucun secret, n'ouvre aucune connexion, ne sort pas de la machine.
 *
 * ⚠️ **CE FICHIER N'EST PAS LIVRÉ** — `core/epreuve/` est exclu par
 *    `tsconfig.build.json`, et c'est de cet `exclude` que le périmètre de
 *    production est DÉRIVÉ ci-dessous, jamais recopié.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE CORPUS — lu UNE fois, et son volume est annoncé par chaque test
// ═════════════════════════════════════════════════════════════════════════════

function lire(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, RACINE_DU_DEPOT)), "utf8");
}

/** Les modules que `pnpm build` émet, DÉRIVÉS de l'`exclude` du build. */
const MODULES_LIVRES: readonly FichierSoumis[] = fichiersLivresDuDepot().map((chemin) => ({
  chemin,
  source: lire(chemin),
}));

/** Le code livré, commentaires retirés. Une citation en prose n'est pas un témoin. */
const CODE_LIVRE_SANS_PROSE: ReadonlyMap<string, string> = new Map(
  MODULES_LIVRES.map((fichier) => [fichier.chemin, sansProse(fichier.source)]),
);

/** Tous les `.ts` du dépôt — gardes comprises. C'est ce que G4 reçoit. */
const PROGRAMME: readonly FichierSoumis[] = tousLesFichiersTs().map((chemin) => ({
  chemin,
  source: lire(chemin),
}));

const CORPUS_LIVRE = [...CODE_LIVRE_SANS_PROSE.values()].join("\n");

// ═════════════════════════════════════════════════════════════════════════════
//  § ① — LES ADR CONFRONTÉES UNE À UNE AU CODE LIVRÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE DÉCISION PROMET D'OBSERVABLE, EXTRAIT DE SA PROSE.
 *
 * ⚠️ **LA BORNE EST ÉCRITE AVEC LA MESURE, ET ELLE EST LARGE.** Ce que cette
 *    extraction voit, ce sont des NOMS : un identifiant entre accents graves, un
 *    chemin de fichier. Une décision qui ne promet qu'une RÈGLE — « le refus se
 *    prononce avant l'étape 8 », « la connexion n'est jamais rendue au pool » —
 *    n'a pas de nom à chercher, et cette mesure-ci ne peut pas la juger. Elle
 *    répond donc à une question PLUS FAIBLE que celle du lot : « reste-t-il, du
 *    vocabulaire de cette décision, quelque chose dans le code livré ? ». Zéro
 *    est un constat ; un nombre positif n'est PAS un quitus. Les décisions dont
 *    la promesse est une règle sont reprises à la main, et le § ① bis en porte
 *    une.
 */
interface PromesseDUneAdr {
  readonly numero: string;
  readonly statut: string;
  readonly octetsDeDecision: number;
  readonly identifiants: readonly string[];
  readonly chemins: readonly string[];
}

/** Les sections d'un ADR qui portent la DÉCISION, jamais celles qui la rejettent. */
const FIN_DE_LA_DECISION =
  /rejet|alternative|conséquences acceptées|reste ouvert|ce qu'on a écarté|reste hors/i;

function promesseDeLAdr(numero: string, source: string): PromesseDUneAdr {
  const statut = /^-\s+\*\*Statut\*\*\s*:\s*([^\n]+)/m.exec(source)?.[1]?.trim() ?? "illisible";

  let dedans = false;
  const bloc: string[] = [];
  for (const ligne of source.split("\n")) {
    if (/^##\s/.test(ligne)) {
      if (/d[ée]cision/i.test(ligne) && !FIN_DE_LA_DECISION.test(ligne)) dedans = true;
      else if (FIN_DE_LA_DECISION.test(ligne)) dedans = false;
    }
    if (dedans) bloc.push(ligne);
  }
  // Un ADR dont l'intitulé de section ne dit pas « décision » est confronté
  // ENTIER : mieux vaut une mesure trop large qu'un ADR silencieusement ignoré.
  const texte = bloc.length === 0 ? source : bloc.join("\n");

  const identifiants = new Set<string>();
  const chemins = new Set<string>();
  for (const trouve of texte.matchAll(/`([^`\n]{2,80})`/g)) {
    const jeton = (trouve[1] ?? "").replace(/^\(|\)$/g, "");
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(jeton) && jeton.length >= 4) identifiants.add(jeton);
    else if (/^[\w.@/-]+\.(ts|json|sql|prisma|md|yml)$/.test(jeton)) chemins.add(jeton);
  }

  return {
    numero,
    statut,
    octetsDeDecision: texte.length,
    identifiants: [...identifiants],
    chemins: [...chemins],
  };
}

/** Les ADR du dossier, DÉRIVÉES de son contenu — jamais du registre. */
function adrDuDossier(): readonly PromesseDUneAdr[] {
  const dossier = fileURLToPath(new URL("docs/adr/", RACINE_DU_DEPOT));
  return readdirSync(dossier)
    .filter((nom) => /^\d{4}-.*\.md$/.test(nom))
    .sort()
    .map((nom) => promesseDeLAdr(nom.slice(0, 4), lire(`docs/adr/${nom}`)));
}

describe("§ ① — les ADR confrontées au code LIVRÉ, une par une", () => {
  /**
   * **LA MESURE DU LOT : combien d'ADR, et combien sans le moindre témoin.**
   *
   * ⚠️ **UN TÉMOIN N'EST PAS UNE CITATION.** Le corpus est le code livré
   *    COMMENTAIRES RETIRÉS : c'est la mesure qui a fait naître le registre des
   *    coutures au lot 1c, où deux modules NOMMAIENT une fonction en JSDoc,
   *    parenthèses comprises, sans que personne ne l'appelle.
   */
  it("confronte CHAQUE ADR du dossier et NOMME celles dont rien ne témoigne", () => {
    const adr = adrDuDossier();

    let identifiantsConfrontes = 0;
    let identifiantsPresents = 0;
    let cheminsConfrontes = 0;
    let octetsDeDecisionLus = 0;
    const sansTemoin: string[] = [];
    const auPlusUnTemoin: string[] = [];

    for (const promesse of adr) {
      octetsDeDecisionLus += promesse.octetsDeDecision;
      const presents = promesse.identifiants.filter((nom) =>
        new RegExp(`\\b${nom}\\b`).test(CORPUS_LIVRE),
      );
      const cheminsPresents = promesse.chemins.filter((chemin) =>
        existsSync(fileURLToPath(new URL(chemin, RACINE_DU_DEPOT))),
      );
      identifiantsConfrontes += promesse.identifiants.length;
      identifiantsPresents += presents.length;
      cheminsConfrontes += promesse.chemins.length;

      const temoins = presents.length + cheminsPresents.length;
      if (temoins === 0) sansTemoin.push(`${promesse.numero} (${promesse.statut})`);
      else if (temoins <= 1) auPlusUnTemoin.push(`${promesse.numero}:${String(temoins)}`);
    }

    console.info(
      `[§ ① · la mesure] ${String(adr.length)} ADR confrontée(s) · ` +
        `${String(octetsDeDecisionLus)} caractère(s) de DÉCISION lus · ` +
        `${String(MODULES_LIVRES.length)} module(s) LIVRÉ(s) balayé(s) ` +
        `(${String(CORPUS_LIVRE.length)} caractère(s) de code, commentaires retirés) · ` +
        `${String(identifiantsConfrontes)} identifiant(s) de décision confronté(s), ` +
        `${String(identifiantsPresents)} présent(s) dans le code livré · ` +
        `${String(cheminsConfrontes)} chemin(s) nommé(s) par une décision · ` +
        `${String(sansTemoin.length)} ADR SANS AUCUN TÉMOIN [${sansTemoin.join(", ") || "aucune"}] · ` +
        `${String(auPlusUnTemoin.length)} à un seul témoin [${auPlusUnTemoin.join(", ") || "aucune"}]`,
    );

    // ── LES PLANCHERS, sans lesquels ce test serait vert en ne lisant rien ────
    expect(adr.length).toBeGreaterThanOrEqual(40);
    expect(octetsDeDecisionLus).toBeGreaterThanOrEqual(200_000);
    expect(MODULES_LIVRES.length).toBeGreaterThanOrEqual(100);
    expect(CORPUS_LIVRE.length).toBeGreaterThanOrEqual(200_000);
    expect(identifiantsConfrontes).toBeGreaterThanOrEqual(300);
    // ── LA RÈGLE ─────────────────────────────────────────────────────────────
    expect(sansTemoin).toEqual([]);
  });

  /**
   * 🔴 **§ ① bis — ADR 0044, § 4 : UNE PROPRIÉTÉ NOMMÉE, ET RIEN NE LA PORTE.**
   *
   * L'ADR 0044 fait remonter le filet anti-fuite d'un étage pour qu'il serve les
   * DEUX transports, et sa § 4 écrit ceci :
   *
   * > « Le compte de valeurs réellement confrontées est déjà annoncé par
   * > `VerdictDeFuite.valeursConfrontees`, et `reponseSansFuite` **refuse
   * > d'expédier une réponse dont le filet n'a confronté aucune valeur alors
   * > qu'on lui en a nommé**. Cette propriété doit survivre à la remontée :
   * > c'est elle qui empêche le filet d'être vert parce qu'il ne regarde rien. »
   *
   * Trois faits, mesurés ici :
   *
   *  1. **`reponseSansFuite` n'existe pas, et n'a jamais existé.** Le nom ne
   *     paraît dans tout le dépôt qu'à l'intérieur d'un bloc JSDoc — c'est-à-dire
   *     exactement le mode de défaillance du lot 1c, une fonction que la prose
   *     appelle et que personne n'a écrite. La propriété n'a donc pas « survécu à
   *     la remontée » : elle n'a jamais eu de porteur.
   *  2. **Le verdict du filet ne distingue pas « rien à redire » de « je n'ai
   *     rien regardé ».** Une valeur plus courte que
   *     `LONGUEUR_MINIMALE_CONFRONTEE` est écartée, et le verdict rend
   *     `fuites: []` avec `valeursConfrontees: 0` — mesuré ci-dessous, en
   *     exécutant la vraie fonction.
   *  3. **Aucun des deux transports ne lit ce compte pour refuser.** Le seul
   *     module livré qui le fasse est une sonde d'adaptateur — celle-là même que
   *     l'ADR ne nomme pas.
   *
   * ⚠️ **ÉTAT TRANSCRIT.** Écrit d'abord en `it()` : ROUGE —
   *    « AssertionError: expected 1 to be 4 », un seul module livré sur les
   *    quatre qui appellent le filet en dérive un refus, et ce n'est aucun des
   *    deux transports. Basculé en `it.fails` : VERT. Il rougira le jour où tout
   *    module qui expédie derrière le filet refusera une réponse que le filet
   *    n'a pas regardée.
   */
  it.fails(
    "🔴 un filet qui n'a confronté AUCUNE valeur nommée doit retenir la réponse, sur les DEUX fils",
    () => {
      // ── FAIT 1 · le symbole que l'ADR nomme ────────────────────────────────
      const definitions = PROGRAMME.filter((fichier) =>
        /\b(?:function|const|let|class|interface|type)\s+reponseSansFuite\b/.test(
          sansProse(fichier.source),
        ),
      );
      const citationsEnProse = PROGRAMME.filter((fichier) =>
        fichier.source.includes("reponseSansFuite"),
      );

      // ── FAIT 2 · le verdict, MESURÉ en exécutant la vraie fonction ─────────
      const tropCourte = "a".repeat(LONGUEUR_MINIMALE_CONFRONTEE - 1);
      const verdict = verifierAucuneFuite(
        { transport: "http", texte: `{"error":"refus","valeur":"${tropCourte}"}` },
        [{ nom: "jeton de confirmation", valeur: tropCourte }],
      );

      // ── FAIT 3 · qui appelle le filet, et qui refuse sur son compte ────────
      const appelants = [...CODE_LIVRE_SANS_PROSE.entries()].filter(([, code]) =>
        /\bverifierAucuneFuite\s*\(/.test(code),
      );
      const refusants = appelants.filter(([, code]) => /if\s*\([^)]*valeursConfrontees/.test(code));

      console.info(
        `[§ ① bis · 0044] « reponseSansFuite » : ${String(definitions.length)} définition(s) ` +
          `dans le dépôt, ${String(citationsEnProse.length)} fichier(s) le citent ` +
          `[${citationsEnProse.map((f) => f.chemin).join(", ") || "aucun"}] · ` +
          `verdict mesuré sur une valeur de ${String(tropCourte.length)} caractère(s) ` +
          `(seuil ${String(LONGUEUR_MINIMALE_CONFRONTEE)}) : ` +
          `${String(verdict.valeursConfrontees)} confrontée(s), ` +
          `${String(verdict.valeursEcartees)} écartée(s), ` +
          `${String(verdict.fuites.length)} fuite(s) · ` +
          `${String(appelants.length)} module(s) livré(s) appellent le filet ` +
          `[${appelants.map(([chemin]) => chemin).join(", ")}] · ` +
          `${String(refusants.length)} en dérive(nt) un REFUS ` +
          `[${refusants.map(([chemin]) => chemin).join(", ") || "aucun"}]`,
      );

      // ── LES PLANCHERS ────────────────────────────────────────────────────
      expect(PROGRAMME.length).toBeGreaterThanOrEqual(200);
      expect(appelants.length).toBeGreaterThanOrEqual(2);
      // Le verdict ne regarde rien, et se dit sans fuite. C'est mesuré, pas cru.
      expect(verdict.valeursConfrontees).toBe(0);
      expect(verdict.fuites).toEqual([]);
      // ── LA RÈGLE DE L'ADR 0044, § 4 ──────────────────────────────────────
      // Tout module qui expédie derrière le filet doit refuser d'expédier quand
      // le filet n'a rien confronté alors qu'on lui a nommé des valeurs.
      expect(refusants.length).toBe(appelants.length);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  § ② — G4 ATTAQUÉE SUR DES JEUX FABRIQUÉS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE ENTRÉE FABRIQUÉE. Seule l'assertion varie — tout le reste est neutre.
 *
 * ⚠️ L'ADR `9997` n'existe pas dans `docs/adr/`, et c'est voulu : ces entrées ne
 *    sont jamais remises au registre réel, seulement à la fonction PURE.
 */
function entreeFabriquee(assertion: AssertionDeCouture | null): EntreeDeCouture {
  return {
    adr: "9997",
    decision: "décision fabriquée par l'épreuve — aucune valeur documentaire",
    etat: "à-coudre",
    symbole: "faireLaChoseDeLEpreuve",
    genre: "fonction",
    module: "faux/definisseur-de-l-epreuve.ts",
    mesureeAilleurs: null,
    assertion,
    motif: "témoin fabriqué par l'épreuve du lot 4",
  };
}

/**
 * TROIS GARDES FABRIQUÉES, ET AUCUNE NE FAIT ÉCHOUER PERSONNE.
 *
 * ⚠️ **LES SOURCES SONT ÉCRITES EN LITTÉRAL**, ligne à ligne : c'est le décor
 *    que G4 doit savoir lire. Aucune n'est écrite sur le disque, aucune n'est
 *    exécutée par vitest — elles ne sont que du TEXTE remis à une fonction pure.
 */
const GARDE_TAUTOLOGIQUE: FichierSoumis = {
  chemin: "faux/garde-tautologique.spec.ts",
  source: [
    'import { describe, expect, it } from "vitest";',
    'describe("fabriqué", () => {',
    '  it("la ligne de refus est ecrite", () => {',
    '    console.info("[garde] journalDesRefus : 1 ligne ecrite");',
    "    expect(1).toBe(1);",
    "  });",
    "});",
    "",
  ].join("\n"),
};

const GARDE_SUSPENDUE: FichierSoumis = {
  chemin: "faux/garde-suspendue.spec.ts",
  source: [
    'import { describe, expect, it } from "vitest";',
    'describe.skip("suite suspendue", () => {',
    '  it("le port journalDesRefus porte la ligne", () => {',
    "    const ports = { journalDesRefus: [] };",
    "    expect(ports.journalDesRefus).toEqual([1]);",
    "  });",
    "});",
    "",
  ].join("\n"),
};

const GARDE_ECARTEE: FichierSoumis = {
  chemin: "faux/garde-ecartee.spec.ts",
  source: [
    'import { describe, expect, it } from "vitest";',
    'describe("écarté un par un", () => {',
    '  it.skip("le port journalDesRefus porte la ligne", () => {',
    "    const ports = { journalDesRefus: [] };",
    "    expect(ports.journalDesRefus).toEqual([1]);",
    "  });",
    "});",
    "",
  ].join("\n"),
};

describe("§ ② — G4, la garde des assertions, mise à l'épreuve", () => {
  /**
   * **LA MOITIÉ QUI TIENT, ET IL FAUT LA MESURER AUSSI.** Une épreuve qui ne
   * rapporterait que des trous ferait croire que la garde ne sert à rien. G4
   * sait dire NON sur les deux formes d'assertion menteuse — un fichier
   * introuvable, un test introuvable — et c'est reconstruit ici SANS relire les
   * témoins du constructeur : les entrées sont fabriquées à neuf.
   */
  it("sait dire NON : une assertion qui nomme un fichier ou un test INEXISTANT rougit", () => {
    const cas = [
      {
        nom: "① fichier absent",
        assertion: {
          fichier: "faux/inexistant.spec.ts",
          nom: "la ligne de refus est ecrite",
          nomme: ["journalDesRefus"],
        },
      },
      {
        nom: "② fichier présent, test absent",
        assertion: {
          fichier: GARDE_TAUTOLOGIQUE.chemin,
          nom: "un nom de test que personne n'a écrit",
          nomme: ["journalDesRefus"],
        },
      },
      {
        nom: "③ test présent, mais il ne NOMME pas la décision",
        assertion: {
          fichier: GARDE_TAUTOLOGIQUE.chemin,
          nom: "la ligne de refus est ecrite",
          nomme: ["delaiDeReprise"],
        },
      },
    ] as const;

    const comptes: string[] = [];
    for (const unCas of cas) {
      const rapport = verifierLesAssertions(
        [GARDE_TAUTOLOGIQUE],
        [entreeFabriquee(unCas.assertion)],
      );
      comptes.push(`${unCas.nom} → ${String(rapport.anomalies.length)} anomalie(s)`);
      expect(rapport.anomalies.length, unCas.nom).toBeGreaterThanOrEqual(1);
    }

    console.info(
      `[§ ② · G4 dit NON] ${String(cas.length)} cas fabriqué(s) · ${comptes.join(" · ")}`,
    );
    expect(cas.length).toBe(3);
  });

  /**
   * 🔴 **ATTAQUE 1 — UN TEST QUI N'ASSÈRE QU'UNE TAUTOLOGIE FERME UNE ENTRÉE.**
   *
   * G4 exige du corps qu'il porte « au moins un `expect(` » et qu'il NOMME ce
   * que la décision a changé. Les deux conditions se satisfaisent sans qu'aucune
   * décision ne soit gardée :
   *
   *  · `expect(1).toBe(1)` est un `expect(` et ne peut jamais échouer ;
   *  · le nom se cherche dans le corps BRUT, chaînes de caractères comprises —
   *    et c'est délibéré, un code de refus vit légitimement dans un littéral.
   *    Un `console.info("… journalDesRefus …")` suffit donc à le fournir.
   *
   * Le résultat est le registre menteur que l'ADR 0041 dit vouloir empêcher :
   * une entrée fermée par un test vert quoi qu'il arrive.
   *
   * ⚠️ **CE N'EST PAS UN REPROCHE DE FORME.** Le lot 3 a déjà mesuré ce défaut
   *    ailleurs sous un autre nom — « une garde verte parce qu'elle ne regarde
   *    rien ». G4 le referme pour le CAS ZÉRO `expect(`, et le laisse ouvert
   *    pour le cas « un `expect(` qui ne peut pas échouer ». La forme la plus
   *    proche d'un correctif : exiger que le corps confronte quelque chose du
   *    dépôt — un import, une lecture — plutôt que deux littéraux.
   *
   * ⚠️ **ÉTAT TRANSCRIT.** En `it()` : ROUGE — « expected 0 to be greater than
   *    or equal to 1 », zéro anomalie sur une assertion tautologique. En
   *    `it.fails` : VERT.
   */
  it("G4 rougit sur un test dont l'assertion ne peut pas échouer", () => {
    const assertion: AssertionDeCouture = {
      fichier: GARDE_TAUTOLOGIQUE.chemin,
      nom: "la ligne de refus est ecrite",
      nomme: ["journalDesRefus"],
    };
    const rapport = verifierLesAssertions([GARDE_TAUTOLOGIQUE], [entreeFabriquee(assertion)]);
    const verdict = rapport.verdicts[0];

    console.info(
      `[§ ② · attaque 1] test trouvé : ${String(verdict?.testTrouve ?? false)} · ` +
        `${String(verdict?.assertionsDansLeCorps ?? 0)} « expect( » compté(s) · ` +
        `${String(verdict?.nomsAttendus ?? 0)} nom(s) exigé(s), ` +
        `${String(verdict?.nomsAbsents.length ?? 0)} absent(s) · ` +
        `le nom n'est présent QUE dans un message journalisé · ` +
        `${String(rapport.anomalies.length)} anomalie(s) ` +
        `[${rapport.anomalies.join(" | ") || "aucune"}]`,
    );

    // Planchers : la garde a bien lu le fichier et trouvé le test.
    expect(verdict?.testTrouve).toBe(true);
    expect(verdict?.assertionsDansLeCorps).toBe(1);
    // LA RÈGLE : un test qui ne peut pas échouer ne ferme aucune décision.
    expect(rapport.anomalies.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * **CE QUE L'ATTAQUE 1 PÈSE SUR LE REGISTRE RÉEL — la mesure, pas la crainte.**
   *
   * L'attaque ci-dessus est fabriquée. Reste à savoir combien de poids le
   * critère `nomme` fait porter à des LITTÉRAUX sur le registre d'aujourd'hui :
   * un nom cherché dans le corps BRUT est satisfait aussi bien par
   * `expect(bloc).toContain("PLAFOND_OUTILS_PAR_PROFIL")` — où il est
   * load-bearing — que par un `console.info` — où il n'est que du décor. **Le
   * critère ne distingue pas les deux**, et ce test compte la part concernée.
   *
   * ⚠️ **CE N'EST PAS UN REPROCHE À CES ASSERTIONS-LÀ.** Plusieurs lisent une
   *    source sur le disque et y cherchent un nom : le littéral y EST la mesure.
   *    Ce qui est mesuré ici est la part du registre pour laquelle G4 ne peut
   *    pas, par construction, faire la différence.
   *
   * ⚠️ **LA RÈGLE TENUE ICI EST AUTRE, ET ELLE EST INDÉPENDANTE DE G4** : le
   *    corps de CHAQUE assertion réelle doit être isolable. Une seconde
   *    dérivation du même fait, écrite à part — si les deux divergent un jour,
   *    la divergence est le signal.
   */
  it("mesure la part des assertions RÉELLES dont les noms exigés ne vivent qu'en littéral", () => {
    const parChemin = new Map(PROGRAMME.map((fichier) => [fichier.chemin, fichier.source]));
    const avecAssertion = REGISTRE_DES_COUTURES.filter((entree) => entree.assertion !== null);

    let corpsIntrouvables = 0;
    let toutEnLitteral = 0;
    let nomsConfrontes = 0;
    let nomsEnLitteralSeul = 0;

    for (const entree of avecAssertion) {
      const assertion = entree.assertion;
      if (assertion === null) continue;
      const source = parChemin.get(assertion.fichier);
      const corps = source === undefined ? null : corpsDuTestNomme(source, assertion.nom);
      if (corps === null) {
        corpsIntrouvables += 1;
        continue;
      }
      const enLitteralSeul = assertion.nomme.filter(
        (nom) => corps.brut.includes(nom) && !corps.code.includes(nom),
      );
      nomsConfrontes += assertion.nomme.length;
      nomsEnLitteralSeul += enLitteralSeul.length;
      if (enLitteralSeul.length === assertion.nomme.length) toutEnLitteral += 1;
    }

    console.info(
      `[§ ② · le poids des littéraux] ${String(avecAssertion.length)} assertion(s) réelle(s) ` +
        `du registre · ${String(corpsIntrouvables)} corps introuvable(s) · ` +
        `${String(nomsConfrontes)} nom(s) exigé(s) au total, ` +
        `${String(nomsEnLitteralSeul)} présent(s) UNIQUEMENT dans un littéral · ` +
        `${String(toutEnLitteral)} assertion(s) dont TOUS les noms exigés ne vivent ` +
        "qu'en littéral — G4 ne peut pas y distinguer une mesure d'un message",
    );

    // Planchers : le registre a bien été parcouru, et les fichiers ouverts.
    expect(avecAssertion.length).toBeGreaterThanOrEqual(15);
    expect(nomsConfrontes).toBeGreaterThanOrEqual(30);
    // LA RÈGLE : aucun corps d'assertion réelle n'est illisible.
    expect(corpsIntrouvables).toBe(0);
  });

  /**
   * 🔴 **ATTAQUE 2 — UN TEST QUE VITEST N'EXÉCUTE JAMAIS FERME UNE ENTRÉE.**
   *
   * G4 cherche la déclaration `it("…")` dans le TEXTE du fichier. Elle la trouve
   * aussi bien à l'intérieur d'un `describe.skip(…)`, dont vitest ne lance
   * aucun test. L'entrée est alors gardée par un test qui n'a jamais tourné.
   *
   * ⚠️ **LA GARDE VOIT LE `it.skip` ET NE VOIT PAS LE `describe.skip`**, et
   *    c'est mesuré des deux côtés ci-dessous : la forme de déclaration
   *    n'accepte que `it`, `test` et `it.fails`, si bien qu'un test écarté un par
   *    un devient introuvable — donc une anomalie —, tandis que la MÊME
   *    suspension posée d'un cran au-dessus est invisible. Une garde qui mord
   *    sur une forme et pas sur son équivalent est une garde qu'on contourne
   *    sans le savoir.
   *
   * ⚠️ **LE DÉPÔT N'EN PORTE AUCUN AUJOURD'HUI**, et c'est compté ici : le trou
   *    est ouvert, il n'est pas emprunté. Sans ce compte, ce test ne
   *    distinguerait pas « la porte est ouverte » de « quelqu'un est passé ».
   *
   * ⚠️ **ÉTAT TRANSCRIT.** En `it()` : ROUGE — « expected 0 to be greater than
   *    or equal to 1 » sur le `describe.skip`. En `it.fails` : VERT.
   */
  it("G4 rougit sur un test enfermé dans un describe.skip", () => {
    const nomDuTest = "le port journalDesRefus porte la ligne";
    const suspendue = verifierLesAssertions(
      [GARDE_SUSPENDUE],
      [
        entreeFabriquee({
          fichier: GARDE_SUSPENDUE.chemin,
          nom: nomDuTest,
          nomme: ["journalDesRefus"],
        }),
      ],
    );
    const ecartee = verifierLesAssertions(
      [GARDE_ECARTEE],
      [
        entreeFabriquee({
          fichier: GARDE_ECARTEE.chemin,
          nom: nomDuTest,
          nomme: ["journalDesRefus"],
        }),
      ],
    );

    // Le dépôt RÉEL en porte-t-il ? Le trou ouvert n'est pas un trou emprunté.
    //
    // ⚠️ **CE FICHIER-CI EST RETIRÉ DU BALAYAGE, ET LE RETRAIT EST DÉRIVÉ**
    //    d'`import.meta.url` : les gardes fabriquées ci-dessus portent
    //    `describe.skip(` et `it.skip(` en LITTÉRAL, si bien que l'épreuve se
    //    compterait elle-même et annoncerait une suspension qui n'en est pas une.
    const MOI = new URL(import.meta.url).pathname.replace(/^.*\/(core\/epreuve\/)/, "$1");
    const suspensionsReelles = PROGRAMME.filter(
      (fichier) =>
        fichier.chemin !== MOI &&
        /\b(?:describe|it|test)\s*\.\s*(?:skip|todo|only)\s*\(/.test(sansProse(fichier.source)),
    );

    console.info(
      `[§ ② · attaque 2] describe.skip → ${String(suspendue.anomalies.length)} anomalie(s) ` +
        `(test trouvé : ${String(suspendue.verdicts[0]?.testTrouve ?? false)}) · ` +
        `it.skip → ${String(ecartee.anomalies.length)} anomalie(s) ` +
        `(test trouvé : ${String(ecartee.verdicts[0]?.testTrouve ?? false)}) · ` +
        `${String(PROGRAMME.length)} fichier(s) du dépôt balayé(s), ` +
        `${String(suspensionsReelles.length)} porte(nt) une suspension ` +
        `[${suspensionsReelles.map((f) => f.chemin).join(", ") || "aucun"}]`,
    );

    // Planchers : les deux jeux ont bien été lus, et la moitié qui mord mord.
    expect(PROGRAMME.length).toBeGreaterThanOrEqual(200);
    expect(ecartee.anomalies.length).toBeGreaterThanOrEqual(1);
    // LA RÈGLE : un test que le lanceur n'exécute pas ne ferme aucune décision.
    expect(suspendue.anomalies.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * 🔴 **ATTAQUE 3 — LE CLIQUET DES « SANS ASSERTION » EST UNE SOMME, ET UNE
   *    SOMME SE COMPENSE.**
   *
   * `core/coutures/registre.spec.ts` tient le cliquet de G4 sur un TOTAL :
   * « le nombre d'entrées sans assertion ne monte pas ». C'est la seule chose
   * qui oblige une décision neuve à être vue par un test — l'entrée elle-même
   * accepte `assertion: null` sans une anomalie.
   *
   * Or un total se tient à l'identique en faisant DEUX gestes dans le même lot :
   * inscrire une décision neuve que rien ne voit (+1), et poser une assertion
   * sur une entrée ancienne qui n'en avait pas (−1). Le cliquet est satisfait,
   * les anomalies restent à zéro, `cousuesNonAtterries` ne bouge pas — et le
   * défaut central du lot 4 vient de rentrer par la porte que le lot 4 a posée.
   *
   * ⚠️ **LA MUTATION EST DÉRIVÉE DU REGISTRE RÉEL, JAMAIS ÉCRITE À LA MAIN.**
   *    L'assertion recopiée est celle d'une entrée qui en porte déjà une : elle
   *    est donc valide par construction, et le second effet se lit dans
   *    l'annonce — **le MÊME test ferme alors DEUX décisions différentes**, ce
   *    que rien ne compte non plus.
   *
   * ⚠️ **CE QUE CE TEST NE DIT PAS.** Il ne prétend pas qu'un constructeur ait
   *    fait ce geste. Il mesure que le mécanisme ne s'y oppose pas — la seule
   *    chose qu'une garde ait à prouver.
   *
   * ═══ CE QUE LA RECETTE DU LOT 4 A CHANGÉ ICI, ET POURQUOI ═══
   *
   * ⚠️ **LE TOTAL RESTE COMPENSABLE, ET IL LE RESTERA : C'EST UNE SOUSTRACTION.**
   *    `sansAssertion` vaut `entrées − avecAssertion`. Aucun correctif ne peut
   *    le faire MONTER sous une compensation qui retire une entrée aveugle
   *    pendant qu'elle en ajoute une : la mesure n'est pas fausse, elle est
   *    INCAPABLE de porter la règle. La ligne d'annonce ci-dessous continue donc
   *    de rendre les deux totaux côte à côte — 88 avant, 88 après — pour que
   *    cette incapacité reste LUE au lieu d'être corrigée par oubli.
   *
   * ⚠️ **LA RÈGLE, ELLE, N'A PAS BOUGÉ D'UN MOT** : « une décision de plus que
   *    rien ne voit doit se voir QUELQUE PART », comme ce test l'écrivait déjà
   *    sur sa dernière ligne. Ce qui a changé est l'INSTRUMENT : G4 rend
   *    désormais `sansAssertionNommees`, l'IDENTITÉ des entrées aveugles et non
   *    plus seulement leur nombre. Une identité ne se compense pas — celle qui
   *    entre est nommée, même quand une autre sort. Le cliquet du dépôt est tenu
   *    sur cette liste dans `core/coutures/registre.spec.ts`.
   *
   * ⚠️ **ÉTAT TRANSCRIT, DEUX FOIS.** (1) Le défaut, mesuré avant tout
   *    correctif : en `it()`, ROUGE — « AssertionError: expected 88 to be
   *    greater than 88 », le compte identique avant et après. (2) Après le
   *    correctif, ce même test ré-visé sur l'identité : VERT, et la ligne
   *    d'annonce montre que le total, lui, est resté à 88 — la preuve que c'est
   *    bien l'instrument qui a changé, pas la mutation.
   */
  it("une décision neuve que RIEN ne voit se voit dans les IDENTITÉS sans assertion", () => {
    const avant = verifierLesAssertions(PROGRAMME, REGISTRE_DES_COUTURES);

    // ── LA COMPENSATION, DÉRIVÉE ────────────────────────────────────────────
    const donneuse = REGISTRE_DES_COUTURES.find((entree) => entree.assertion !== null);
    const receveuse = REGISTRE_DES_COUTURES.findIndex((entree) => entree.assertion === null);
    const assertionRecopiee = donneuse?.assertion ?? null;

    const registreMute: readonly EntreeDeCouture[] = [
      ...REGISTRE_DES_COUTURES.map((entree, rang) =>
        rang === receveuse ? { ...entree, assertion: assertionRecopiee } : entree,
      ),
      // La décision neuve que rien ne voit.
      entreeFabriquee(null),
    ];
    const apres = verifierLesAssertions(PROGRAMME, registreMute);

    const entrantes = apres.sansAssertionNommees.filter(
      (identite) => !avant.sansAssertionNommees.includes(identite),
    );
    const sortantes = avant.sansAssertionNommees.filter(
      (identite) => !apres.sansAssertionNommees.includes(identite),
    );

    console.info(
      `[§ ② · attaque 3] AVANT : ${String(avant.entreesConfrontees)} entrée(s), ` +
        `${String(avant.sansAssertion)} sans assertion, ` +
        `${String(avant.anomalies.length)} anomalie(s), ` +
        `${String(avant.cousuesNonAtterries.length)} cousue(s) non atterrie(s), ` +
        `${String(avant.assertionsPartagees.length)} assertion(s) partagée(s) · ` +
        `APRÈS (une décision aveugle en plus, une assertion recopiée sur une ancienne) : ` +
        `${String(apres.entreesConfrontees)} entrée(s), ` +
        `${String(apres.sansAssertion)} sans assertion, ` +
        `${String(apres.anomalies.length)} anomalie(s), ` +
        `${String(apres.cousuesNonAtterries.length)} cousue(s) non atterrie(s), ` +
        `${String(apres.assertionsPartagees.length)} assertion(s) partagée(s) · ` +
        `LE TOTAL N'A PAS BOUGÉ (${String(avant.sansAssertion)} → ` +
        `${String(apres.sansAssertion)}) et ne le pouvait pas · ` +
        `L'IDENTITÉ, ELLE, A BOUGÉ : ${String(entrantes.length)} entrante(s) ` +
        `[${entrantes.join(", ") || "aucune"}], ${String(sortantes.length)} sortante(s) ` +
        `[${sortantes.join(", ") || "aucune"}] · ` +
        `le test « ${assertionRecopiee?.nom ?? "?"} » ferme désormais 2 décisions distinctes`,
    );

    // Planchers : la mutation a bien eu lieu, sur le registre RÉEL.
    expect(assertionRecopiee).not.toBeNull();
    expect(receveuse).toBeGreaterThanOrEqual(0);
    expect(apres.entreesConfrontees).toBe(avant.entreesConfrontees + 1);
    expect(apres.anomalies).toEqual([]);
    // Le défaut d'origine, TOUJOURS VRAI et toujours mesuré : le total se compense.
    expect(apres.sansAssertion).toBe(avant.sansAssertion);
    // LA RÈGLE : une décision de plus que rien ne voit doit se voir quelque part.
    expect(entrantes.length).toBeGreaterThanOrEqual(1);
    /**
     * ⚠️ **LE SECOND EFFET, QUE RIEN NE COMPTAIT — et son compte n'est PAS sa
     *    longueur.** L'assertion recopiée est la première du registre, qui est
     *    déjà partagée par deux entrées : la recopier en fait TROIS usages d'une
     *    SEULE assertion partagée. Le nombre d'assertions partagées ne bouge donc
     *    pas, leur libellé si — « (2) » devient « (3) ». Attendre une longueur
     *    plus grande aurait été rouge pour la raison du voisin.
     */
    expect(apres.assertionsPartagees).not.toEqual(avant.assertionsPartagees);
  });
});
