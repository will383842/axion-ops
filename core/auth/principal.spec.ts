import { describe, expect, it } from "vitest";

import {
  CHAMPS_IDENTIFIANTS_DU_JOURNAL,
  bornesDIdentifiantDuJournal,
  verifierAucunContenu,
} from "../audit/contenu.js";
import { contenuTemoin } from "../audit/fixtures.js";
import { PRINCIPAL_STDIO } from "../chaine/orchestrateur.js";
import {
  BORNES_DU_JOURNAL,
  CAUSES_DE_REFUS_DE_PRINCIPAL,
  ErreurPrincipalRefuse,
  admettreUnPrincipal,
  verdictDUnPrincipal,
} from "./principal.js";
import type { BornesDIdentifiantDuJournal } from "./principal.js";

/**
 * GARDES DU `principal` BORNÉ À LA SOURCE — ADR 0029, point 1 ; § 31 ; § 11.
 *
 * ═══ LA MOITIÉ QUE CE FICHIER MESURE, ET CELLE QU'IL NE MESURE PAS ═══
 *
 * ✅ **LA SOURCE.** L'émetteur refuse d'émettre un jeton dont le principal ne
 *    passe pas la forme du journal. Borner là, c'est borner ce qui ENTRE : le
 *    socle n'a que deux sources de principal, celle-ci et `PRINCIPAL_STDIO`.
 *
 * ⛔ **PAS LA PERTE DE LIGNE.** Le témoin de perte de ligne du lot 1d (section N3
 *    de `core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts`, en `it.fails`)
 *    mesure ce qui arrive à un principal malformé rencontré MALGRÉ TOUT, à
 *    l'étape 4, et à un `nomComplet` malformé à l'étape 6. Ces deux moitiés
 *    vivent dans `core/audit/contenu.ts` et `core/chaine/`, hors de ce périmètre.
 *    **Ce fichier ne le fait pas basculer, et ne prétend pas le faire.**
 *
 * ═══ POURQUOI LA BORNE EST MESURÉE ICI PAR UNE *AUTRE* PORTE ═══
 *
 * `core/auth/principal.ts` a pour défaut `bornesDIdentifiantDuJournal()`, la
 * fonction sœur de l'ADR 0029, qui LIT `FORMES`. Éprouver ce module en lui
 * repassant cette même fonction le confronterait à lui-même : le test dirait
 * « la borne est celle que la borne dit ».
 *
 * La garde ci-dessous mesure donc la borne réelle par l'AUTRE porte publique de
 * `FORMES` — une dichotomie sur `verifierAucunContenu()`, c'est-à-dire sur la
 * garde d'écriture qui refuserait la ligne — et exige que les deux chemins
 * rendent le même chiffre. Le jour où `FORMES.principal.maxCar` change, les deux
 * changent ensemble ; le jour où l'un des deux cesse de lire `FORMES`, ils se
 * contredisent, et **se contredire est le signal**.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LA BORNE RÉELLE, MESURÉE CHEZ `core/audit/`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le `principal` le plus long que la garde du § 31 accepte, **MESURÉ** par
 * dichotomie sur `verifierAucunContenu()`.
 *
 * ⚠️ **C'EST UNE DÉRIVATION, PAS UNE DEVINETTE — ET C'EST LA SECONDE.**
 *    Interroger la garde d'écriture avec des longueurs croissantes rend
 *    EXACTEMENT ce que `FORMES` déclare, sans lire `FORMES` ni recopier son
 *    chiffre, et **sans passer par la fonction qu'on éprouve**. Une valeur écrite
 *    à la main serait verte le jour où la colonne change, et fausse à partir de
 *    ce jour-là ; une valeur empruntée à `bornesDIdentifiantDuJournal()` serait
 *    verte même si cette fonction cessait de lire `FORMES`.
 */
function borneMesureeDuPrincipal(): number {
  const accepte = (longueur: number): boolean => {
    const verdict = verifierAucunContenu(contenuTemoin(1, { principal: "a".repeat(longueur) }));
    return !verdict.anomalies.some((anomalie) => anomalie.startsWith("principal"));
  };

  if (!accepte(1)) {
    throw new Error(
      "core/auth/principal.spec : `verifierAucunContenu` refuse déjà un principal d'UN " +
        "caractère — la mesure ne mesure plus ce qu'elle croit, et son verdict ne vaut rien.",
    );
  }

  let bas = 1;
  let haut = 4096;
  if (accepte(haut)) {
    throw new Error(
      "core/auth/principal.spec : aucune borne trouvée sous 4096 caractères — la colonne " +
        "`principal` a cessé d'être bornée, ou la mesure interroge le mauvais champ.",
    );
  }
  while (haut - bas > 1) {
    const milieu = Math.floor((bas + haut) / 2);
    if (accepte(milieu)) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

const BORNE_MESUREE = borneMesureeDuPrincipal();

/**
 * Le port, alimenté par la borne MESURÉE — jamais par un chiffre écrit, et
 * jamais par la fonction qu'on veut éprouver.
 *
 * ⚠️ **C'EST TOUTE LA VALEUR DE L'INJECTION.** Le module a désormais
 *    `bornesDIdentifiantDuJournal()` pour défaut ; s'en servir aussi dans les
 *    tests confronterait la fonction à elle-même. Ici, la borne vient d'une
 *    dichotomie sur `verifierAucunContenu()` — l'autre porte publique de
 *    `FORMES` — et la garde ci-dessous exige que les DEUX chemins rendent le
 *    même chiffre.
 */
const BORNES: BornesDIdentifiantDuJournal = (champ) => {
  if (!CHAMPS_IDENTIFIANTS_DU_JOURNAL.includes(champ)) {
    throw new Error(`champ hors de la famille des identifiants : ${champ}`);
  }
  return { maxCar: BORNE_MESUREE };
};

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LA BORNE EST CELLE DU JOURNAL, PAS UNE AUTRE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0029 — la borne du principal est celle du journal, mesurée chez lui", () => {
  it("mesure la borne réelle chez `verifierAucunContenu`, et l'ANNONCE", () => {
    const juste = verifierAucunContenu(
      contenuTemoin(1, { principal: "a".repeat(BORNE_MESUREE) }),
    ).anomalies.filter((a) => a.startsWith("principal"));
    const unDeTrop = verifierAucunContenu(
      contenuTemoin(1, { principal: "a".repeat(BORNE_MESUREE + 1) }),
    ).anomalies.filter((a) => a.startsWith("principal"));

    console.info(
      `[G1 · borne] borne MESURÉE chez core/audit/contenu.ts : ${String(BORNE_MESUREE)} ` +
        `caractère(s) · à la borne : ${String(juste.length)} anomalie(s) · ` +
        `un de plus : ${String(unDeTrop.length)} anomalie(s)`,
    );

    // Plancher : la dichotomie a trouvé une borne UTILE, pas une valeur dégénérée.
    expect(BORNE_MESUREE).toBeGreaterThan(16);
    expect(juste).toEqual([]);
    expect(unDeTrop).toHaveLength(1);
  });

  it("le verdict rend la borne qu'on lui donne — il ne la devine pas", () => {
    const verdict = verdictDUnPrincipal("connecteur.mcp", BORNES);

    console.info(
      `[G1 · port] borne annoncée par le verdict : ${String(verdict.maxCar)} · ` +
        `borne mesurée : ${String(BORNE_MESUREE)} · ` +
        `${String(verdict.causesConfrontees)} cause(s) confrontée(s) sur ` +
        `${String(CAUSES_DE_REFUS_DE_PRINCIPAL.length)} déclarée(s)`,
    );

    expect(verdict.maxCar).toBe(BORNE_MESUREE);
    expect(verdict.causesConfrontees).toBe(CAUSES_DE_REFUS_DE_PRINCIPAL.length);
  });

  it("le DÉFAUT du module est la vraie fonction sœur, et les deux chemins concordent", () => {
    /**
     * ⚠️ **DEUX DÉRIVATIONS DU MÊME FAIT, ET C'EST VOULU.** La borne vient soit
     *    de `bornesDIdentifiantDuJournal()` — la fonction sœur de l'ADR 0029 —,
     *    soit de la dichotomie ci-dessus sur `verifierAucunContenu()`. Les deux
     *    lisent `FORMES` par des portes différentes. Deux dérivations d'un même
     *    fait finissent d'ordinaire par se contredire ; ici, **se contredire EST
     *    le signal**, et l'égalité ci-dessous est ce qui le rend audible.
     */
    const parLaSoeur = BORNES_DU_JOURNAL("principal").maxCar;
    const parDefaut = verdictDUnPrincipal("connecteur.mcp").maxCar;

    console.info(
      `[G1 · deux portes] borne par bornesDIdentifiantDuJournal : ${String(parLaSoeur)} · ` +
        `borne par défaut du module : ${String(parDefaut)} · ` +
        `borne par dichotomie sur verifierAucunContenu : ${String(BORNE_MESUREE)} · ` +
        `${String(CHAMPS_IDENTIFIANTS_DU_JOURNAL.length)} colonne(s) dans la famille ` +
        `[${CHAMPS_IDENTIFIANTS_DU_JOURNAL.join(", ")}]`,
    );

    expect(parLaSoeur).toBe(BORNE_MESUREE);
    expect(parDefaut).toBe(BORNE_MESUREE);
    // La famille est DÉRIVÉE du genre déclaré dans `FORMES`, jamais listée :
    // `principal` et `tool` en font partie, et c'est ce qui empêche qu'un
    // troisième champ de la même famille soit oublié.
    expect(CHAMPS_IDENTIFIANTS_DU_JOURNAL).toContain("principal");
    expect(CHAMPS_IDENTIFIANTS_DU_JOURNAL).toContain("tool");
  });

  it("la borne LÈVE si le genre de la colonne change — elle ne rend pas de valeur", () => {
    // ⚠️ C'EST LA PROPRIÉTÉ QUI COMPTE, ET ELLE EST ÉPROUVÉE SUR UNE COLONNE
    //    D'UN AUTRE GENRE : une borne qui rendrait un chiffre pour `argHash`
    //    (genre « empreinte ») donnerait une réponse plausible et fausse.
    let leve = false;
    try {
      bornesDIdentifiantDuJournal("argHash");
    } catch {
      leve = true;
    }

    console.info(
      `[G1 · genre] borne demandée sur « argHash » (empreinte) · levée : ${String(leve)}`,
    );
    expect(leve).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LES DEUX CAUSES MORDENT, ET SE DISTINGUENT
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0029 — l'émetteur refuse ce que le journal refuserait", () => {
  it("refuse cinq formes de principal, et NOMME la cause de chacune", () => {
    /**
     * ⚠️ **CES CINQ SONT EXACTEMENT CE QUI FAIT PERDRE LA LIGNE.** Elles ne sont
     *    pas des cas tordus : une adresse e-mail est ce qu'un émetteur écrirait
     *    naturellement comme principal, et une phrase francisée est ce qu'un
     *    humain saisit dans un champ « nom du client ».
     */
    const temoins: ReadonlyArray<readonly [string, string, string]> = [
      ["adresse e-mail", "will@axion-ops.invalid", "forme-du-journal"],
      ["espace", "connecteur de Will", "forme-du-journal"],
      ["saut de ligne", "connecteur\nmcp", "forme-du-journal"],
      ["phrase francisée", "le-connecteur-de-will-sur-le-poste-du-bureau", "forme-du-journal"],
      ["trop long", "a".repeat(BORNE_MESUREE + 1), "longueur"],
      ["vide", "", "forme-du-journal"],
    ];

    const passes: string[] = [];
    const causesVues = new Set<string>();
    for (const [nom, valeur, causeAttendue] of temoins) {
      const verdict = verdictDUnPrincipal(valeur, BORNES);
      if (verdict.conforme) {
        passes.push(nom);
        continue;
      }
      verdict.violees.forEach((cause) => causesVues.add(cause));
      expect(verdict.violees, nom).toContain(causeAttendue);

      // Le refus doit LEVER, et l'erreur ne doit JAMAIS porter la valeur.
      let leve = false;
      try {
        admettreUnPrincipal(valeur, BORNES);
      } catch (erreur) {
        leve = true;
        expect(erreur, nom).toBeInstanceOf(ErreurPrincipalRefuse);
        if (valeur.length > 0) expect((erreur as Error).message, nom).not.toContain(valeur);
        expect((erreur as ErreurPrincipalRefuse).longueur, nom).toBe(valeur.length);
      }
      expect(leve, nom).toBe(true);
    }

    console.info(
      `[G2 · refus] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(passes.length)} passé(s) au travers [${passes.join(", ") || "aucun"}] · ` +
        `${String(causesVues.size)} cause(s) distincte(s) sur ` +
        `${String(CAUSES_DE_REFUS_DE_PRINCIPAL.length)} : ${[...causesVues].join(", ")}`,
    );

    expect(passes).toEqual([]);
    // ⚠️ LES DEUX CAUSES SONT ATTEIGNABLES. Une cause déclarée qu'aucun chemin
    //    ne produit est un vocabulaire mort — « trop long » et « mauvaise forme »
    //    se réparent par des gestes différents.
    expect(causesVues.size).toBe(CAUSES_DE_REFUS_DE_PRINCIPAL.length);
  });

  it("SAIT DIRE OUI, et `PRINCIPAL_STDIO` — l'autre source du socle — passe", () => {
    // ⚠️ SANS CE TEST, LES SIX REFUS CI-DESSUS SERAIENT VERTS SUR UN REFUSEUR
    //    UNIVERSEL, et l'émetteur n'émettrait jamais rien.
    const admis = [
      "connecteur.mcp",
      "console.will",
      PRINCIPAL_STDIO,
      "a".repeat(BORNE_MESUREE),
      "client-42",
    ];

    const refuses = admis.filter((valeur) => !verdictDUnPrincipal(valeur, BORNES).conforme);

    console.info(
      `[G2 · capacité] ${String(admis.length)} principal(aux) légitimes éprouvé(s) · ` +
        `${String(refuses.length)} refusé(s) à tort [${refuses.join(", ") || "aucun"}] · ` +
        `PRINCIPAL_STDIO = « ${PRINCIPAL_STDIO} »`,
    );

    expect(refuses).toEqual([]);
    // L'autre source du socle passe la même règle. Si elle ne la passait pas, la
    // borne serait fausse, ou le stdio journaliserait déjà en perdant ses lignes.
    expect(verdictDUnPrincipal(PRINCIPAL_STDIO, BORNES).conforme).toBe(true);
  });

  it("ce que l'émetteur ADMET, le journal l'ACCEPTE — les deux règles sont la même", () => {
    /**
     * ⚠️ **C'EST LA GARDE DE FOND, ET ELLE FERME LA BOUCLE.** Elle ne demande pas
     *    « les deux règles se ressemblent-elles ? » mais « ce que l'émetteur
     *    laisse passer, le journal l'écrit-il ? ». Un désaccord ici serait
     *    exactement le défaut du lot 1d, déplacé d'un cran.
     */
    const echantillon = [
      "connecteur.mcp",
      "console.will",
      PRINCIPAL_STDIO,
      "client-42",
      "a".repeat(BORNE_MESUREE),
      "will@axion-ops.invalid",
      "connecteur de Will",
      "a".repeat(BORNE_MESUREE + 1),
      "le-connecteur-de-will-sur-le-poste-du-bureau",
      "",
    ];

    const desaccords: string[] = [];
    for (const valeur of echantillon) {
      const admisParLEmetteur = verdictDUnPrincipal(valeur, BORNES).conforme;
      const accepteParLeJournal = !verifierAucunContenu(
        contenuTemoin(1, { principal: valeur }),
      ).anomalies.some((anomalie) => anomalie.startsWith("principal"));
      if (admisParLEmetteur !== accepteParLeJournal) {
        desaccords.push(
          `longueur ${String(valeur.length)} : émetteur ${String(admisParLEmetteur)}, ` +
            `journal ${String(accepteParLeJournal)}`,
        );
      }
    }

    console.info(
      `[G2 · accord] ${String(echantillon.length)} valeur(s) confrontée(s) aux DEUX règles · ` +
        `${String(desaccords.length)} désaccord(s) [${desaccords.join(" | ") || "aucun"}]`,
    );

    // Plancher : l'échantillon porte des OUI et des NON — un échantillon
    // uniquement conforme rendrait « 0 désaccord » sans rien prouver.
    const conformes = echantillon.filter((v) => verdictDUnPrincipal(v, BORNES).conforme).length;
    expect(conformes).toBeGreaterThan(0);
    expect(conformes).toBeLessThan(echantillon.length);
    expect(desaccords).toEqual([]);
  });
});
