import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FORMATS_CONTRAIGNANTS,
  PROFONDEUR_VALEUR,
  TEMOINS_DE_PROSE,
  analyserChampsDeclares,
  cumulerChampsDeGouvernance,
} from "../adapter-kit/champs-declares.js";
import type { ValeurJson } from "../adapter-kit/json.js";
import {
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
} from "../chaine/etape-11-provenance.js";
import type { ContexteProvenance } from "../chaine/etapes.js";

/**
 * TÉMOINS ADVERSAIRES DU LOT 1c — **LA COUTURE QUI N'A PAS ÉTÉ FAITE.**
 *
 * ═══ CE QUE CE FICHIER ÉPROUVE, ET POURQUOI IL EXISTE ═══
 *
 * Le lot 1c a été convoqué pour fermer les DEUX façons de désarmer
 * l'anti-exfiltration du § 20 que l'épreuve du lot 1b avait mesurées :
 *
 *  · **ADR 0015** — `idFields`, déclaré par un dépôt tiers, retire un champ de
 *    `libres` et éteint la branche 4 de l'étape 11 ;
 *  · **ADR 0016** — `FAMILLES_GOUVERNANCE` reconnaît les champs de gouvernance
 *    AU NOM, et neuf graphies ordinaires sur vingt lui échappent, sur la seule
 *    branche que le § 20 déclare inconditionnelle.
 *
 * Les deux ADR sont écrites, acceptées, et leurs gardes d'ADMISSION existent :
 * `analyserChampsDeclares()` est appelée par le build ET par le registre, et
 * `cumulerChampsDeGouvernance()` réalise l'union de l'ADR 0016.
 *
 * **Mais aucune des deux n'a été cousue à l'ÉTAPE 11**, c'est-à-dire au seul
 * endroit où un appel est réellement autorisé ou refusé. Les deux ADR le disent
 * elles-mêmes au futur — « le paramètre `idFields` DISPARAÎT », « ce que le
 * constructeur ③ doit écrire » — et les marqueurs `🔧` sont encore en place dans
 * `core/chaine/etape-11-provenance.ts` et `core/adapter-kit/champs-declares.ts`.
 *
 * ⚠️ **CE FICHIER NE RELIT PAS LES ADR : IL SOUMET DES APPELS À L'ÉTAPE 11 ET
 *    MESURE CE QU'ELLE EN FAIT.** C'est la différence entre « la décision est
 *    prise » et « la garde mord ». Une décision prise et non cousue laisse le
 *    dépôt dans le pire état des trois : le trou est ouvert, ET la documentation
 *    donne l'apparence d'un périmètre couvert.
 *
 * ═══ L'IDIOME `it.fails`, ET CE QU'IL PORTE ICI ═══
 *
 * Les gardes en `it()` mesurent le comportement RÉEL et ANNONCENT leurs comptes.
 * Les `it.fails` portent l'attente du CDC et des ADR : ils sont verts
 * AUJOURD'HUI parce qu'ils échouent, et ils ROUGIRONT le jour où la couture sera
 * faite — ce qui forcera à les relire au lieu de les laisser vieillir.
 *
 * ⚠️ Un `it.fails` est vert dès qu'il échoue, POUR N'IMPORTE QUELLE RAISON. Le
 *    plancher {@link describe} « la garde sait mordre » est donc obligatoire :
 *    sans lui, un import cassé rendrait tous les `it.fails` verts et ce fichier
 *    entier deviendrait muet.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR — une session qui vient de lire du `personal` chez un domaine
// ═════════════════════════════════════════════════════════════════════════════

const DOMAINE_LU = "boite-courrier";
const DOMAINE_TIERS = "annuaire-externe";
const SESSION = "session-de-l-adversaire-1c";

/** Un index marqué comme il l'est en production : par le RÉSULTAT d'un appel. */
function indexMarque(): IndexProvenanceMemoire {
  const index = new IndexProvenanceMemoire();
  const marque = marquerResultat(index, {
    sessionId: SESSION,
    adapterId: DOMAINE_LU,
    dataClass: "personal",
    empreintes: ["empreinte-de-l-extrait-lu"],
  });
  expect(marque, "le décor doit avoir marqué la session, sinon rien n'est éprouvé").toBe(true);
  return index;
}

function contexte(surcharge: Partial<ContexteProvenance> = {}): ContexteProvenance {
  return {
    sessionId: SESSION,
    adapterId: DOMAINE_TIERS,
    porteUnArgumentLibre: false,
    porteUnArgumentDeGouvernance: false,
    niveau: "brouillon",
    index: indexMarque(),
    ...surcharge,
  };
}

/** `true` = l'appel a FRANCHI l'étape 11. */
function passe(ctx: ContexteProvenance): boolean {
  return etape11Provenance(ctx).issue === "autorise";
}

/** Un schéma d'objet FERMÉ, comme le § 09 l'exige de tout schéma d'entrée. */
function schemaFerme(proprietes: Record<string, ValeurJson>): ValeurJson {
  return { type: "object", properties: proprietes, additionalProperties: false };
}

/**
 * SOUMET UN APPEL COMPLET : le schéma est dérivé par l'étape 11 elle-même, et
 * les deux booléens qu'elle en tire sont branchés sur sa propre décision —
 * exactement comme `orchestrerAppel()` le fait (`core/chaine/orchestrateur.ts`).
 *
 * ⚠️ MESURER `analyserArgumentsDuSchema()` SEULE NE SUFFIRAIT PAS. Un booléen
 *    faux n'est un trou que s'il change le VERDICT ; c'est le verdict qu'on
 *    mesure ici.
 */
function verdictBoutEnBout(
  inputSchema: ValeurJson,
  idFields: readonly string[],
  surcharge: Partial<ContexteProvenance> = {},
): { readonly franchi: boolean; readonly proprietesInspectees: number } {
  const analyse = analyserArgumentsDuSchema(inputSchema, idFields);
  // Un schéma qu'on n'aurait pas su lire rendrait « libre » pour la pire des
  // raisons, et le témoin conclurait à un contournement là où il n'y a qu'une
  // panne de lecture.
  expect(analyse.schemaIllisible, "le schéma témoin doit être lisible").toBe(false);
  expect(analyse.profondeurDepassee, "le schéma témoin ne doit pas saturer la borne").toBe(false);
  const franchi = passe(
    contexte({
      porteUnArgumentLibre: analyse.porteUnArgumentLibre,
      porteUnArgumentDeGouvernance: analyse.porteUnArgumentDeGouvernance,
      ...surcharge,
    }),
  );
  return { franchi, proprietesInspectees: analyse.proprietesInspectees };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PLANCHER — SANS LUI, TOUS LES `it.fails` DE CE FICHIER SERAIENT MUETS
// ═════════════════════════════════════════════════════════════════════════════

describe("PLANCHER — l'étape 11 sait mordre sur ce décor", () => {
  it("un champ de texte libre vers un AUTRE domaine, session marquée, est REFUSÉ", () => {
    const { franchi, proprietesInspectees } = verdictBoutEnBout(
      schemaFerme({ message: { type: "string" } }),
      [],
    );
    console.log(
      `[plancher étape 11] ${String(proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `franchi : ${String(franchi)}`,
    );
    expect(proprietesInspectees, "la dérivation doit avoir vu la propriété").toBe(1);
    expect(franchi, "sans ce refus, tout ce fichier serait vert pour rien").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G1 · ADR 0015 — `idFields` DÉSARME ENCORE L'ÉTAPE 11, BOUT EN BOUT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Des champs parfaitement ordinaires, tous en texte libre, tous plausibles dans
 * un outil réel. Aucun n'est fermé par son schéma : c'est le SEUL critère que
 * l'ADR 0015 veut voir subsister.
 */
const CHAMPS_LIBRES_ORDINAIRES: readonly { readonly nom: string; readonly schema: ValeurJson }[] = [
  { nom: "requete", schema: { type: "string" } },
  { nom: "note", schema: { type: "string", maxLength: 4000 } },
  { nom: "etiquettes", schema: { type: "array", items: { type: "string" } } },
  { nom: "metadonnees", schema: { type: "object" } },
  { nom: "filtres", schema: { type: "object", additionalProperties: { type: "string" } } },
  { nom: "rappel", schema: { type: "string", format: "uri" } },
];

describe("G1 · ADR 0015 — la déclaration `idFields` éteint encore la garde du § 20", () => {
  it("mesure, champ par champ, ce que la SEULE déclaration change au VERDICT", () => {
    const eteints: string[] = [];
    let refusesSansDeclaration = 0;

    for (const champ of CHAMPS_LIBRES_ORDINAIRES) {
      const schema = schemaFerme({ [champ.nom]: champ.schema });
      const sans = verdictBoutEnBout(schema, []);
      const avec = verdictBoutEnBout(schema, [champ.nom]);
      if (!sans.franchi) refusesSansDeclaration += 1;
      // Le trou n'est pas « le champ est libre » : c'est que DEUX MOTS DANS UN
      // MANIFESTE, et rien d'autre, retournent le verdict.
      if (!sans.franchi && avec.franchi) eteints.push(champ.nom);
    }

    console.log(
      `[G1 · idFields au runtime] ${String(CHAMPS_LIBRES_ORDINAIRES.length)} champ(s) libre(s) ` +
        `soumis · ${String(refusesSansDeclaration)} refusé(s) SANS déclaration · ` +
        `${String(eteints.length)} verdict(s) RETOURNÉ(s) par la seule déclaration : ` +
        `${eteints.join(", ")}`,
    );

    expect(
      CHAMPS_LIBRES_ORDINAIRES.length,
      "plancher-témoin : au moins six formes",
    ).toBeGreaterThanOrEqual(6);
    expect(
      refusesSansDeclaration,
      "cliquet : sans déclaration, les six sont refusés — sinon la mesure ne vaut rien",
    ).toBe(CHAMPS_LIBRES_ORDINAIRES.length);

    // 🔴 CE QUI EST MESURÉ AUJOURD'HUI : les six. `analyserArgumentsDuSchema()`
    //    porte toujours son paramètre `idFields`, et son corps toujours le
    //    `if (identifiants.has(nom)) continue;` que l'ADR 0015 dit retirer.
    //    Le jour où la couture sera faite, CE TEST ROUGIT — et c'est voulu.
    expect(eteints).toEqual(CHAMPS_LIBRES_ORDINAIRES.map((champ) => champ.nom));
  });

  it.fails(
    "ADR 0015 — une déclaration `idFields` ne changera PLUS aucun verdict (non cousu à ce jour)",
    () => {
      const retournes = CHAMPS_LIBRES_ORDINAIRES.filter((champ) => {
        const schema = schemaFerme({ [champ.nom]: champ.schema });
        return (
          !verdictBoutEnBout(schema, []).franchi && verdictBoutEnBout(schema, [champ.nom]).franchi
        );
      });
      expect(retournes.map((champ) => champ.nom)).toEqual([]);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 · ADR 0016 — LA DÉCLARATION EST ADMISE, PUIS PERDUE AVANT L'ÉTAPE 11
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Vingt noms de champs de gouvernance, en graphies ordinaires. Aucun n'est
 * classé ici : la partition entre « retenu par le nom » et « échappé » est
 * DÉRIVÉE de `familleDeGouvernance()` à l'exécution. Recopier les neuf noms de
 * l'ADR 0016 ferait de ce témoin une photographie, verte le jour où le filet
 * changerait.
 */
const NOMS_DE_GOUVERNANCE: readonly string[] = [
  "to",
  "recipients",
  "destinataire",
  "mailTo",
  "emailTo",
  "adresseDeReponse",
  "envoyerA",
  "ttl",
  "expiresAt",
  "validUntil",
  "maxAge",
  "slot",
  "slotStart",
  "startAt",
  "dateDebut",
  "scheduledFor",
  "policyLevel",
  "profil",
  "enabled",
  "toolset",
];

/** Les noms que le filet `FAMILLES_GOUVERNANCE` NE retient pas. DÉRIVÉ. */
const ECHAPPES: readonly string[] = NOMS_DE_GOUVERNANCE.filter(
  (nom) => familleDeGouvernance(nom) === null,
);

describe("G2 · ADR 0016 — `governanceFields` est admis, cumulé… et jamais lu par l'étape 11", () => {
  it("le filet laisse encore échapper des noms ordinaires, et ANNONCE combien", () => {
    console.log(
      `[G2 · filet] ${String(NOMS_DE_GOUVERNANCE.length)} nom(s) confronté(s) · ` +
        `${String(NOMS_DE_GOUVERNANCE.length - ECHAPPES.length)} retenu(s) par le nom · ` +
        `${String(ECHAPPES.length)} échappé(s) : ${ECHAPPES.join(", ")}`,
    );
    // Cliquet des DEUX côtés : un filet qui ne retiendrait rien, ou qui
    // retiendrait tout, rendrait la suite de ce describe inintéressante.
    expect(
      ECHAPPES.length,
      "au moins un nom doit échapper, sinon rien n'est à fermer",
    ).toBeGreaterThan(0);
    expect(
      ECHAPPES.length,
      "le filet doit encore retenir quelque chose, sinon il est mort",
    ).toBeLessThan(NOMS_DE_GOUVERNANCE.length);
  });

  it("l'ADMISSION accepte la déclaration des échappés — la moitié qui, elle, est cousue", () => {
    const schema = schemaFerme(
      Object.fromEntries(ECHAPPES.map((nom): [string, ValeurJson] => [nom, { type: "string" }])),
    );
    const verdict = analyserChampsDeclares(schema, {
      idFields: [],
      governanceFields: ECHAPPES,
    });

    console.log(
      `[G2 · admission] ${String(verdict.governanceFieldsDeclares)} déclaré(s) · ` +
        `${String(verdict.governanceFieldsConfrontes.length)} confronté(s) au schéma · ` +
        `${String(verdict.governanceFieldsIntrouvables.length)} introuvable(s) · ` +
        `${String(verdict.proprietesInspectees)} propriété(s) inspectée(s)`,
    );

    expect(verdict.governanceFieldsDeclares).toBe(ECHAPPES.length);
    expect(verdict.governanceFieldsConfrontes.length).toBe(ECHAPPES.length);
    expect(verdict.governanceFieldsIntrouvables).toEqual([]);
    // Et l'union de l'ADR 0016 sait bien les ajouter, sans rien perdre.
    const cumul = cumulerChampsDeGouvernance(
      NOMS_DE_GOUVERNANCE.filter((nom) => familleDeGouvernance(nom) !== null),
      ECHAPPES,
    );
    expect(cumul.perdus).toEqual([]);
    expect(cumul.union.length).toBe(NOMS_DE_GOUVERNANCE.length);
  });

  it("l'ÉTAPE 11 ne voit rien de cette déclaration — mesuré sur le VERDICT", () => {
    const surveilles: string[] = [];
    const franchis: string[] = [];

    for (const nom of ECHAPPES) {
      // Un champ de gouvernance REFERMÉ par son schéma : la branche 4 (« argument
      // libre ») ne peut donc pas jouer, et l'on isole la branche 1.
      const schema = schemaFerme({ [nom]: { type: "string", format: "date-time" } });
      const analyse = analyserArgumentsDuSchema(schema, []);
      if (analyse.porteUnArgumentDeGouvernance) surveilles.push(nom);
      // Pire cas pour la garde : MÊME domaine. Le § 20 dit « JAMAIS », sans
      // clause « autre domaine » — donc un refus est attendu même ici.
      const { franchi } = verdictBoutEnBout(schema, [], { adapterId: DOMAINE_LU });
      if (franchi) franchis.push(nom);
    }

    console.log(
      `[G2 · étape 11] ${String(ECHAPPES.length)} échappé(s) DÉCLARÉ(s) de gouvernance · ` +
        `${String(surveilles.length)} surveillé(s) par l'étape 11 · ` +
        `${String(franchis.length)} appel(s) FRANCHI(s) sur session marquée : ${franchis.join(", ")}`,
    );

    // 🔴 CE QUI EST MESURÉ AUJOURD'HUI. `analyserArgumentsDuSchema()` n'a aucun
    //    paramètre pour recevoir `governanceFields`, et `cumulerChampsDeGouvernance()`
    //    n'y est pas appelée : la déclaration est admise, journalisée, portée
    //    dans `ops_tool` — et perdue avant la seule décision qui compte.
    expect(surveilles, "aucun échappé déclaré n'est surveillé").toEqual([]);
    expect(franchis).toEqual([...ECHAPPES]);
  });

  it.fails(
    "ADR 0016 — un champ de gouvernance DÉCLARÉ sera refusé sur session marquée (non cousu)",
    () => {
      const franchis = ECHAPPES.filter(
        (nom) =>
          verdictBoutEnBout(schemaFerme({ [nom]: { type: "string", format: "date-time" } }), [], {
            adapterId: DOMAINE_LU,
          }).franchi,
      );
      expect(franchis).toEqual([]);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 · L'UNION DE L'ADR 0016 N'A AUCUN APPELANT DE PRODUCTION
// ═════════════════════════════════════════════════════════════════════════════

/** La racine `core/`, DÉRIVÉE de l'emplacement de ce fichier. */
const RACINE_CORE = fileURLToPath(new URL("../", import.meta.url));

/**
 * LA SOURCE PRIVÉE DE SES COMMENTAIRES.
 *
 * ⚠️ SANS CETTE ÉTAPE, CETTE GARDE SE SERAIT TROMPÉE DANS LE SENS LE PLUS
 *    DANGEREUX. Deux modules — `adapter-kit/types.ts` et `registry/types.ts` —
 *    NOMMENT `cumulerChampsDeGouvernance()` dans un bloc JSDoc, à côté de
 *    parenthèses. Un `grep` naïf les compte comme appelants et annonce « 2 »,
 *    c'est-à-dire « la couture est faite » : la garde aurait été verte parce
 *    qu'une PROSE cite la fonction. Un motif ne mesure que la FORME ÉCRITE, et
 *    une forme écrite dans un commentaire n'exécute rien.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Tous les modules de production de `core/` — jamais les tests, jamais un index. */
function modulesDeProduction(): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = `${dossier}${entree.name}`;
      if (entree.isDirectory()) {
        parcourir(`${chemin}/`);
        continue;
      }
      if (!entree.name.endsWith(".ts")) continue;
      if (entree.name.endsWith(".spec.ts")) continue;
      // `index.ts` ne fait que RÉ-EXPORTER : un ré-export n'est pas un appelant,
      // et le compter ferait passer une fonction morte pour une fonction cousue.
      if (entree.name === "index.ts") continue;
      trouves.push(chemin);
    }
  };
  parcourir(RACINE_CORE);
  return trouves;
}

describe("G3 · la fonction d'union existe, personne ne l'appelle", () => {
  it("compte les appelants de production de `cumulerChampsDeGouvernance`, et les NOMME", () => {
    const modules = modulesDeProduction();
    const definisseurs: string[] = [];
    const appelants: string[] = [];
    const citeeEnProse: string[] = [];

    for (const chemin of modules) {
      const brut = readFileSync(chemin, "utf8");
      const code = sansCommentaires(brut);
      const court = chemin.slice(RACINE_CORE.length);
      // La DÉFINITION, distinguée de l'APPEL : sans cette distinction, le module
      // qui porte la fonction se compterait lui-même comme son propre appelant,
      // et la garde annoncerait « 1 appelant » sur une fonction morte.
      if (/export function cumulerChampsDeGouvernance/.test(code)) {
        definisseurs.push(court);
        continue;
      }
      if (/cumulerChampsDeGouvernance\s*\(/.test(code)) appelants.push(court);
      else if (/cumulerChampsDeGouvernance/.test(brut)) citeeEnProse.push(court);
    }

    console.log(
      `[G3 · couture de l'union] ${String(modules.length)} module(s) de production scanné(s) · ` +
        `${String(definisseurs.length)} définisseur(s) : ${definisseurs.join(", ")} · ` +
        `${String(appelants.length)} appelant(s) : ${appelants.join(", ") || "aucun"} · ` +
        `${String(citeeEnProse.length)} citation(s) en COMMENTAIRE : ` +
        `${citeeEnProse.join(", ") || "aucune"}`,
    );

    // ⚠️ CE CLIQUET GARDE LA GARDE. Il doit rester des citations en prose tant
    //    que les deux `types.ts` annoncent la couture à venir : le jour où ce
    //    compte tombe à zéro sans que `appelants` monte, c'est que le retrait
    //    des commentaires a cessé de fonctionner — ou que la trace de la
    //    décision a disparu du code.
    expect(
      citeeEnProse.length,
      "la fonction doit rester CITÉE quelque part, sinon le filtre de commentaires ne prouve rien",
    ).toBeGreaterThanOrEqual(1);

    // Cliquet : un scan qui n'aurait lu aucun module rendrait « 0 appelant »
    // pour la pire des raisons — et cette garde annoncerait un trou inexistant.
    expect(modules.length, "le scan doit avoir lu des modules").toBeGreaterThan(30);
    expect(definisseurs.length, "la fonction doit exister quelque part").toBe(1);

    // 🔴 CE QUI EST MESURÉ AUJOURD'HUI : zéro. L'ADR 0016, point 3, demande que
    //    l'union entre dans `analyserArgumentsDuSchema()`. Elle n'y est pas.
    expect(appelants).toEqual([]);
  });

  it.fails(
    "ADR 0016 point 3 — l'union sera appelée par `core/chaine` (non cousue à ce jour)",
    () => {
      const appelants = modulesDeProduction().filter((chemin) => {
        const code = sansCommentaires(readFileSync(chemin, "utf8"));
        return (
          !/export function cumulerChampsDeGouvernance/.test(code) &&
          /cumulerChampsDeGouvernance\s*\(/.test(code)
        );
      });
      expect(appelants.length).toBeGreaterThanOrEqual(1);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  G4 · LES DEUX COPIES DES CONSTANTES, CONFRONTÉES PAR LEUR SOURCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POURQUOI CETTE GARDE LIT LE FICHIER SOURCE PLUTÔT QUE D'APPELER LES DEUX
 *    FONCTIONS.
 *
 * `champs-declares.temoin.spec.ts` confronte déjà `estValeurLibre()` et
 * `estTexteLibre()` sur un corpus de 24 formes écrites à la main. C'est utile, et
 * c'est BORNÉ à ce que ce corpus a NOMMÉ : le jour où quelqu'un ajoute `"email"`
 * ou `"hostname"` à l'un seulement des deux `FORMATS_CONTRAIGNANTS`, aucune forme
 * du corpus ne porte ce `format`, et les deux dérivations divergent EN SILENCE.
 *
 * Cette garde-ci ne devine pas les formes : elle EXTRAIT les deux listes de
 * leur source et les confronte élément par élément. Un ajout d'un seul côté la
 * fait rougir, quel que soit le mot ajouté.
 *
 * ⚠️ ELLE DOIT RESTER TANT QUE LA SECONDE SOURCE DE VÉRITÉ EXISTE, et elle
 *    disparaît le jour où `estTexteLibre()` devient un appel à
 *    `estValeurLibre()` — c'est-à-dire quand il n'y aura plus deux listes.
 */

/** Le module qui porte la SECONDE écriture, dérivé de l'import de ce fichier. */
const ETAPE_11_SOURCE = fileURLToPath(new URL("../chaine/etape-11-provenance.ts", import.meta.url));

/**
 * Les chaînes entre guillemets du littéral d'un `const NOM … = [ … ]`.
 *
 * ⚠️ L'OUVRANTE SE CHERCHE APRÈS LE `=`, ET C'EST UN DÉFAUT MESURÉ, PAS UNE
 *    PRÉCAUTION. `const TEMOINS_DE_PROSE: readonly string[] = [` porte un `[`
 *    DANS SON ANNOTATION DE TYPE, refermé aussitôt : partir du premier crochet
 *    venu extrait `readonly string[]`, c'est-à-dire une liste VIDE. La garde
 *    aurait alors comparé deux listes dont l'une ne dit rien — verte pour la
 *    pire des raisons. Le cliquet « l'extraction doit avoir trouvé » est ce qui
 *    l'a fait rougir.
 */
function extraireLitteral(source: string, nom: string): readonly string[] {
  const debut = source.indexOf(`const ${nom}`);
  if (debut < 0) return [];
  const egal = source.indexOf("=", debut);
  if (egal < 0) return [];
  const ouvrante = source.indexOf("[", egal);
  const fermante = source.indexOf("]", ouvrante);
  if (ouvrante < 0 || fermante < 0) return [];
  const corps = source.slice(ouvrante + 1, fermante);
  return [...corps.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? "");
}

describe("G4 · les deux écritures de « ce schéma referme la valeur » ne divergent pas", () => {
  const source = readFileSync(ETAPE_11_SOURCE, "utf8");

  it("confronte `FORMATS_CONTRAIGNANTS` des DEUX modules, et ANNONCE les deux comptes", () => {
    const chaine = extraireLitteral(source, "FORMATS_CONTRAIGNANTS");
    const kit = [...FORMATS_CONTRAIGNANTS];
    const seulementKit = kit.filter((f) => !chaine.includes(f));
    const seulementChaine = chaine.filter((f) => !kit.includes(f));

    console.log(
      `[G4 · formats] kit : ${String(kit.length)} · étape 11 : ${String(chaine.length)} · ` +
        `seulement kit : ${seulementKit.join(", ") || "aucun"} · ` +
        `seulement étape 11 : ${seulementChaine.join(", ") || "aucun"}`,
    );

    // Cliquet : une extraction muette rendrait deux listes « d'accord » parce
    // qu'aucune des deux ne dirait rien.
    expect(
      chaine.length,
      "l'extraction depuis la source doit avoir trouvé la liste",
    ).toBeGreaterThan(0);
    expect(kit.length, "la liste exportée ne doit pas être vide").toBeGreaterThan(0);
    expect(seulementKit).toEqual([]);
    expect(seulementChaine).toEqual([]);
  });

  it("confronte `TEMOINS_DE_PROSE` des DEUX modules — un témoin retiré affaiblit `pattern`", () => {
    const chaine = extraireLitteral(source, "TEMOINS_DE_PROSE");
    const kit = [...TEMOINS_DE_PROSE];

    console.log(
      `[G4 · témoins de prose] kit : ${String(kit.length)} · étape 11 : ${String(chaine.length)} · ` +
        `identiques : ${String(kit.length === chaine.length && kit.every((t, i) => t === chaine[i]))}`,
    );

    expect(chaine.length, "l'extraction doit avoir trouvé les témoins").toBeGreaterThanOrEqual(3);
    expect(kit.length).toBe(chaine.length);
    // ⚠️ L'ORDRE COMPTE AUTANT QUE LE CONTENU : `patternReferme()` exige que
    //    TOUS les témoins soient rejetés, donc retirer le seul témoin qu'un
    //    motif accepte suffit à transformer ce motif en « fermeture ».
    expect(kit).toEqual([...chaine]);
  });

  it("confronte la BORNE DE PROFONDEUR des deux écritures", () => {
    // Côté étape 11, la borne est un littéral nu dans le corps (`niveau > 4`) ;
    // côté kit, c'est une constante nommée. C'est déjà une asymétrie : la
    // garde la mesure plutôt que de la supposer suivie.
    const litteraux = [...source.matchAll(/niveau\s*>\s*(\d+)/g)].map((m) => Number(m[1]));
    console.log(
      `[G4 · profondeur] kit : ${String(PROFONDEUR_VALEUR)} · ` +
        `étape 11 : ${litteraux.length > 0 ? litteraux.join(", ") : "aucun littéral trouvé"}`,
    );
    expect(litteraux.length, "la borne doit être trouvée dans la source").toBeGreaterThanOrEqual(1);
    for (const borne of litteraux) expect(borne).toBe(PROFONDEUR_VALEUR);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G5 · CE QUE `idFields` NE DÉSARME PAS — LE CLIQUET À NE PAS PERDRE
// ═════════════════════════════════════════════════════════════════════════════

describe("G5 · `idFields` n'atteint PAS la branche 1 — et ce cliquet doit tenir", () => {
  /**
   * ⚠️ CE TEST EST UN CLIQUET, PAS UN CONSTAT. Dans
   * `analyserArgumentsDuSchema()`, `familleDeGouvernance(nom)` est évaluée AVANT
   * le `if (identifiants.has(nom)) continue;`. L'ordre de ces deux lignes est la
   * seule chose qui empêche un dépôt tiers d'éteindre AUSSI la branche que le
   * § 20 déclare inconditionnelle — en déclarant simplement son destinataire
   * comme un identifiant.
   *
   * Rien dans le code ne NOMME cet ordre : c'est un invariant qui tient par
   * l'emplacement de deux instructions. Un `continue` remonté de trois lignes au
   * cours d'une refonte le romprait sans qu'aucune autre garde ne bouge.
   */
  it("un champ de gouvernance déclaré `idFields` reste surveillé — et on ANNONCE combien", () => {
    const retenusParLeNom = NOMS_DE_GOUVERNANCE.filter((nom) => familleDeGouvernance(nom) !== null);
    const perdusParLaDeclaration: string[] = [];

    for (const nom of retenusParLeNom) {
      const schema = schemaFerme({ [nom]: { type: "string" } });
      // Le pire cas : l'adaptateur déclare son propre champ de gouvernance
      // comme un identifiant, ce qui est exactement l'exonération de l'ADR 0015.
      const analyse = analyserArgumentsDuSchema(schema, [nom]);
      if (!analyse.porteUnArgumentDeGouvernance) perdusParLaDeclaration.push(nom);
    }

    console.log(
      `[G5 · ordre des deux lignes] ${String(retenusParLeNom.length)} champ(s) de gouvernance ` +
        `déclaré(s) identifiant(s) · ` +
        `${String(retenusParLeNom.length - perdusParLaDeclaration.length)} encore surveillé(s) · ` +
        `${String(perdusParLaDeclaration.length)} perdu(s) : ` +
        `${perdusParLaDeclaration.join(", ") || "aucun"}`,
    );

    expect(
      retenusParLeNom.length,
      "cliquet : il faut des champs retenus, sinon rien n'est éprouvé",
    ).toBeGreaterThanOrEqual(10);
    expect(perdusParLaDeclaration).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G6 · ADR 0014 — JUSQU'OÙ LE TYPE MARQUÉ EST-IL RÉELLEMENT DESCENDU ?
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `core/chaine/etapes.ts` appelle le `sessionId` « **LE VERROU N° 1** » du § 20 :
 * toute la provenance s'y ancre, et un client qui choisit son propre identifiant
 * de session se débarrasse d'une marque en changeant de valeur, sans qu'aucun
 * compte ne bouge. L'ADR 0014 y répond par un type marqué, `SessionId`.
 *
 * ⚠️ CETTE GARDE MESURE OÙ LE TYPE EST ARRIVÉ, PAS S'IL EXISTE. Le type existe :
 *    `core/identite/session.ts` le fabrique, et `DependancesOrchestrateur` le
 *    porte déjà. La question qui décide de la sécurité est ailleurs — les
 *    interfaces que l'étape 11 consomme réellement l'ont-elles adopté ?
 *
 * Le fait même que ce fichier-ci compile avec `const SESSION = "…"`, une chaîne
 * nue passée à `ContexteProvenance` et à `marquerResultat()`, EST la mesure : un
 * type marqué refuserait ce littéral. La garde ci-dessous le rend lisible en
 * comptant les deux formes dans la source plutôt qu'en le laissant à déduire.
 */
const ETAPES_SOURCE = fileURLToPath(new URL("../chaine/etapes.ts", import.meta.url));

describe("G6 · ADR 0014 — le type marqué s'arrête avant la garde qu'il devait tenir", () => {
  it("compte les `sessionId` encore typés `string` dans le contrat des étapes", () => {
    const source = sansCommentaires(readFileSync(ETAPES_SOURCE, "utf8"));
    const nus = [...source.matchAll(/sessionId\s*:\s*string/g)].length;
    const marques = [...source.matchAll(/sessionId\s*:\s*SessionId/g)].length;

    console.log(
      `[G6 · portée du type marqué] core/chaine/etapes.ts — ` +
        `${String(nus)} occurrence(s) « sessionId: string » · ` +
        `${String(marques)} occurrence(s) « sessionId: SessionId »`,
    );

    // Cliquet : une source qu'on n'aurait pas su lire rendrait 0 et 0, et cette
    // garde annoncerait « tout est marqué » sur un fichier vide.
    expect(
      nus + marques,
      "la source doit porter au moins une déclaration de sessionId",
    ).toBeGreaterThanOrEqual(1);

    // 🔴 CE QUI EST MESURÉ AUJOURD'HUI : le contrat des étapes garde la chaîne
    //    nue. `ContexteProvenance.sessionId` et les deux méthodes d'
    //    `IndexProvenance` — c'est-à-dire l'ancre du § 20 elle-même — n'ont pas
    //    reçu le type que l'ADR 0014 a posé pour elles.
    expect(marques).toBe(0);
    expect(nus).toBeGreaterThanOrEqual(1);
  });

  it.fails("ADR 0014 — le contrat des étapes portera `SessionId` (non resserré à ce jour)", () => {
    const source = sansCommentaires(readFileSync(ETAPES_SOURCE, "utf8"));
    expect([...source.matchAll(/sessionId\s*:\s*string/g)].length).toBe(0);
  });
});
