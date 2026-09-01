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
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import {
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
} from "../chaine/etape-11-provenance.js";
import type { ContexteProvenance } from "../chaine/etapes.js";
// ADR 0014 — la session de témoin vient de la fabrique NOMMÉE de `core/identite/` :
// le type marqué de `SessionId` ne se laisse plus écrire en littéral.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";

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
const SESSION: SessionId = sessionIdDeTemoin();

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
 *
 * ⚠️ **`governanceFields` EST UN PARAMÈTRE, ET IL LE DEVAIT.** Avant la couture
 *    du lot 1d, ce harnais n'en avait aucun : le témoin de l'ADR 0016 ci-dessous
 *    s'appelait « un champ de gouvernance DÉCLARÉ… » et ne déclarait rien du
 *    tout. Il aurait échoué pour toujours, y compris une fois la couture faite —
 *    c'est-à-dire qu'il serait resté un `it.fails` VERT sur un défaut fermé, et
 *    la dette aurait cessé d'être lisible. Un harnais qui n'a pas le paramètre
 *    ne peut pas mesurer la règle.
 */
function verdictBoutEnBout(
  inputSchema: ValeurJson,
  /**
   * ⚠️ **CE PARAMÈTRE EST DÉSORMAIS INERTE, ET C'EST TOUT LE SUJET DE G1.**
   *    Il porte ce que le MANIFESTE déclare — c'est encore une donnée réelle
   *    (§ 12 : `idFields` nomme les champs porteurs d'identifiants pour la purge
   *    du § 31, et l'admission le lit). Il n'entre simplement plus dans la
   *    dérivation de l'étape 11, parce que `analyserArgumentsDuSchema()` ne
   *    l'accepte plus : ADR 0015.
   *
   *    Le GARDER ici plutôt que l'effacer est délibéré. G1 mesure « ce que la
   *    SEULE déclaration change au verdict » : il lui faut donc encore pouvoir
   *    DÉCLARER. Un harnais qui ne saurait plus le faire rendrait `[]` pour la
   *    pire des raisons — n'avoir rien déclaré — et la garde serait verte sans
   *    rien avoir éprouvé.
   */
  _idFieldsDuManifeste: readonly string[],
  governanceFields: readonly string[],
  surcharge: Partial<ContexteProvenance> = {},
): { readonly franchi: boolean; readonly proprietesInspectees: number } {
  const analyse = analyserArgumentsDuSchema(inputSchema, governanceFields);
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
      AUCUN_CHAMP_DE_GOUVERNANCE,
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

describe("G1 · ADR 0015 — la déclaration `idFields` n'éteint plus la garde du § 20", () => {
  it("mesure, champ par champ, ce que la SEULE déclaration change au VERDICT", () => {
    const eteints: string[] = [];
    let refusesSansDeclaration = 0;

    for (const champ of CHAMPS_LIBRES_ORDINAIRES) {
      const schema = schemaFerme({ [champ.nom]: champ.schema });
      const sans = verdictBoutEnBout(schema, [], AUCUN_CHAMP_DE_GOUVERNANCE);
      const avec = verdictBoutEnBout(schema, [champ.nom], AUCUN_CHAMP_DE_GOUVERNANCE);
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

    // ✅ **CE QUI EST MESURÉ DEPUIS LE LOT 1d : ZÉRO.** Ce test annonçait les six,
    //    et il disait pourquoi : `analyserArgumentsDuSchema()` portait un
    //    paramètre `idFields` et un `if (identifiants.has(nom)) continue;`. Les
    //    deux ont disparu — le paramètre de la SIGNATURE, pas seulement de
    //    l'appel — et le compte est tombé à zéro.
    //
    //    ⚠️ IL N'EST PAS DEVENU MUET POUR AUTANT, et c'est ce que le cliquet
    //       ci-dessus garantit : `refusesSansDeclaration` vaut toujours six. Les
    //       six champs sont donc bien soumis, bien refusés, et la déclaration ne
    //       retourne plus aucun de ces six verdicts. Le jour où l'exonération
    //       reviendrait — sous ce nom ou sous un autre — ce compte remonterait.
    expect(eteints).toEqual([]);
  });

  it("✅ ADR 0015 — une déclaration `idFields` ne change PLUS aucun verdict", () => {
    const retournes = CHAMPS_LIBRES_ORDINAIRES.filter((champ) => {
      const schema = schemaFerme({ [champ.nom]: champ.schema });
      return (
        !verdictBoutEnBout(schema, [], AUCUN_CHAMP_DE_GOUVERNANCE).franchi &&
        verdictBoutEnBout(schema, [champ.nom], AUCUN_CHAMP_DE_GOUVERNANCE).franchi
      );
    });
    expect(retournes.map((champ) => champ.nom)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 · ADR 0016 — LA DÉCLARATION EST ADMISE, CUMULÉE, ET LUE PAR L'ÉTAPE 11
//  (✅ cousue au lot 1d ; le filet AU NOM garde sa borne, chiffrée ci-dessous)
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

describe("G2 · ADR 0016 — `governanceFields` est admis, cumulé, et LU par l'étape 11", () => {
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

  /**
   * ⚠️ **LE CONTRASTE, ET IL EST LA MOITIÉ DE LA MESURE.** Ce test dit ce que la
   *    déclaration change en établissant d'abord ce qu'elle NE change PAS : sans
   *    elle, les neuf échappés franchissent toujours. C'est la borne de
   *    `FAMILLES_GOUVERNANCE`, inchangée par l'ADR 0016 — le filet n'a pas été
   *    élargi, il a été DOUBLÉ. Sans ce compte, le « zéro franchi » du test
   *    suivant se lirait comme « le filet s'est mis à les reconnaître ».
   */
  it("SANS la déclaration, l'étape 11 ne voit toujours rien — la borne du filet, chiffrée", () => {
    const surveilles: string[] = [];
    const franchis: string[] = [];

    for (const nom of ECHAPPES) {
      // Un champ de gouvernance REFERMÉ par son schéma : la branche 4 (« argument
      // libre ») ne peut donc pas jouer, et l'on isole la branche 1.
      //
      // ⚠️ `format: "uuid"` ET NON `"date-time"` — ADR 0035. Ce dernier a quitté
      //    `FORMATS_CONTRAIGNANTS` : sa forme canonique admet une fraction de
      //    seconde de longueur LIBRE, et `format` ne valide rien. Le garder ici
      //    aurait laissé le champ LIBRE, et ce témoin serait resté vert en
      //    n'isolant plus rien — une garde verte pour une mauvaise raison. Les
      //    quatre formats retenus sont bornés sous la borne de fermeture.
      const schema = schemaFerme({ [nom]: { type: "string", format: "uuid" } });
      const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      if (analyse.porteUnArgumentDeGouvernance) surveilles.push(nom);
      // Pire cas pour la garde : MÊME domaine. Le § 20 dit « JAMAIS », sans
      // clause « autre domaine » — donc un refus est attendu même ici.
      const { franchi } = verdictBoutEnBout(schema, [], AUCUN_CHAMP_DE_GOUVERNANCE, {
        adapterId: DOMAINE_LU,
      });
      if (franchi) franchis.push(nom);
    }

    console.log(
      `[G2 · étape 11 · SANS déclaration] ${String(ECHAPPES.length)} échappé(s) confronté(s) · ` +
        `${String(surveilles.length)} surveillé(s) par l'étape 11 · ` +
        `${String(franchis.length)} appel(s) FRANCHI(s) sur session marquée : ${franchis.join(", ")}`,
    );

    // Le filet AU NOM ne les reconnaît pas, et l'ADR 0016 ne le lui demandait pas.
    expect(surveilles, "aucun échappé n'est surveillé par le seul filet").toEqual([]);
    expect(franchis).toEqual([...ECHAPPES]);
  });

  /**
   * ✅ **COUSUE AU LOT 1d.** Ce test était un `it.fails` — et il aurait échoué
   * POUR TOUJOURS, y compris après la couture : son harnais n'avait aucun
   * paramètre `governanceFields`, donc il ne déclarait rien. Il serait resté vert
   * sur un défaut fermé, et la dette qu'il nommait aurait cessé d'être lisible.
   * Le harnais porte désormais le paramètre, et le test DÉCLARE ce que son titre
   * annonce.
   */
  it("✅ ADR 0016 — un champ de gouvernance DÉCLARÉ est refusé sur session marquée", () => {
    const franchis: string[] = [];
    const surveilles: string[] = [];
    let ajoutes = 0;
    let perdus = 0;

    for (const nom of ECHAPPES) {
      // ADR 0035 — même motif qu'au test précédent : `uuid` referme, l'ancien
      // `format` daté ne referme plus.
      const schema = schemaFerme({ [nom]: { type: "string", format: "uuid" } });
      const analyse = analyserArgumentsDuSchema(schema, [nom]);
      if (analyse.porteUnArgumentDeGouvernance) surveilles.push(nom);
      ajoutes += analyse.ajoutesParLaDeclaration.length;
      perdus += analyse.perdusParLeCumul.length;
      // Pire cas : MÊME domaine. Le § 20 dit « JAMAIS », sans clause « autre
      // domaine » — la branche 1 doit refuser là aussi.
      const { franchi } = verdictBoutEnBout(schema, [], [nom], { adapterId: DOMAINE_LU });
      if (franchi) franchis.push(nom);
    }

    console.log(
      `[G2 · étape 11 · AVEC déclaration] ${String(ECHAPPES.length)} échappé(s) DÉCLARÉ(s) · ` +
        `${String(surveilles.length)} surveillé(s) par l'étape 11 · ` +
        `${String(ajoutes)} ajouté(s) par la déclaration · ${String(perdus)} perdu(s) par le cumul · ` +
        `${String(franchis.length)} appel(s) FRANCHI(s) : ${franchis.join(", ") || "aucun"}`,
    );

    expect(surveilles, "chacun des échappés déclarés est surveillé").toEqual([...ECHAPPES]);
    expect(ajoutes, "chaque déclaration apporte exactement son nom").toBe(ECHAPPES.length);
    expect(perdus, "l'union n'a rien perdu — l'invariant de l'ADR 0016").toBe(0);
    expect(franchis, "ADR 0016 — la déclaration ferme les neuf échappés").toEqual([]);
  });
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

describe("G3 · la fonction d'union est APPELÉE — et par qui, nommément", () => {
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

    // ✅ CE QUI EST MESURÉ DEPUIS LE LOT 1d. L'ADR 0016, point 3, demandait que
    //    l'union entre dans `analyserArgumentsDuSchema()`. Elle y est.
    //
    // ⚠️ L'APPELANT EST NOMMÉ, PAS COMPTÉ. `toBeGreaterThan(0)` serait satisfait
    //    par n'importe quel module, y compris un appel décoratif ajouté ailleurs
    //    pour faire verdir la garde. Le seul endroit où cette union DÉCIDE
    //    quelque chose est la dérivation de l'étape 11 ; c'est celui-là qu'on
    //    exige, et un déplacement du code devra passer par cette ligne.
    expect(appelants).toEqual(["chaine/etape-11-provenance.ts"]);
  });

  /** ✅ COUSUE AU LOT 1d. C'était un `it.fails` : il rougissait, il est passé `it()`. */
  it("✅ ADR 0016 point 3 — l'union est appelée par `core/chaine`", () => {
    const appelants = modulesDeProduction().filter((chemin) => {
      const code = sansCommentaires(readFileSync(chemin, "utf8"));
      return (
        !/export function cumulerChampsDeGouvernance/.test(code) &&
        /cumulerChampsDeGouvernance\s*\(/.test(code)
      );
    });
    expect(appelants.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G4 · LA SECONDE ÉCRITURE A DISPARU — ET L'UNIQUE DÉFINITION EST APPELÉE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ CE QUE CETTE GARDE MESURAIT, ET POURQUOI ELLE A CHANGÉ D'OBJET ═══
 *
 * Elle confrontait DEUX écritures de « quels mots-clés de JSON Schema referment
 * l'ensemble des valeurs » — celle du kit et celle de l'étape 11 — en extrayant
 * leurs constantes de la source, parce qu'un corpus de formes ne trouve que ce
 * qu'il a NOMMÉ. Sa propre note disait la suite : *« elle disparaît le jour où
 * `estTexteLibre()` devient un appel à `estValeurLibre()` — c'est-à-dire quand il
 * n'y aura plus deux listes. »*
 *
 * Ce jour est arrivé. Mais **elle ne disparaît pas : elle se retourne.** Une
 * garde retirée parce que son défaut est fermé laisse la porte ouverte à sa
 * réouverture — et c'est exactement par là qu'une seconde source de vérité
 * revient : quelqu'un a besoin d'un cas particulier « juste pour cette étape »,
 * réécrit trois lignes en local, et le dépôt retrouve ses deux verdicts sans
 * qu'aucun test ne bouge.
 *
 * Ce qu'elle mesure désormais, en deux temps :
 *
 *  · **① la seconde écriture n'est plus là.** Aucune des six marques qu'une
 *    dérivation locale laisse — les deux constantes, les trois fonctions
 *    privées, la borne de profondeur en littéral nu — ne subsiste dans le source
 *    de l'étape 11 ;
 *  · **② l'unique définition est IMPORTÉE ET APPELÉE.** ① seule serait verte sur
 *    une étape 11 qui aurait tout supprimé sans rien brancher — c'est-à-dire sur
 *    la panne exacte que le lot 1c a nommée : une décision écrite, et non cousue.
 *
 * ⚠️ LES DEUX DÉTECTEURS SONT ÉPROUVÉS SUR DES SOURCES FABRIQUÉES avant d'être
 *    appliqués au vrai fichier. Un détecteur mort rend « aucune marque trouvée »
 *    sur n'importe quoi, et cette garde serait verte pour la pire des raisons.
 */

/** Le module qui portait la SECONDE écriture, dérivé de l'import de ce fichier. */
const ETAPE_11_SOURCE = fileURLToPath(new URL("../chaine/etape-11-provenance.ts", import.meta.url));

/**
 * LES MARQUES QU'UNE DÉRIVATION LOCALE LAISSE DANS UN SOURCE.
 *
 * ⚠️ ELLES SONT NOMMÉES D'APRÈS CE QUI A RÉELLEMENT ÉTÉ RETIRÉ, et la borne de
 *    profondeur en fait partie : côté kit elle est une constante NOMMÉE
 *    (`PROFONDEUR_VALEUR`), côté étape 11 c'était un chiffre nu (`niveau > 4`).
 *    Un chiffre nu est une seconde écriture qui ne se voit pas — deux bornes
 *    décalées d'un cran rendent le même verdict sur tout schéma peu profond, et
 *    c'est le corpus tout entier de l'ancien témoin qui était peu profond.
 */
const MARQUES_DE_SECONDE_ECRITURE: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: "const FORMATS_CONTRAIGNANTS", motif: /const\s+FORMATS_CONTRAIGNANTS/ },
  { nom: "const TEMOINS_DE_PROSE", motif: /const\s+TEMOINS_DE_PROSE/ },
  { nom: "function patternReferme", motif: /function\s+patternReferme/ },
  { nom: "function estConteneurOuvert", motif: /function\s+estConteneurOuvert/ },
  { nom: "function estTexteLibre", motif: /function\s+estTexteLibre/ },
  { nom: "borne de profondeur en littéral nu", motif: /niveau\s*>\s*\d/ },
];

/** Les marques de seconde écriture présentes dans un source, hors commentaires. */
function marquesDeSecondeEcriture(source: string): readonly string[] {
  const code = sansCommentaires(source);
  return MARQUES_DE_SECONDE_ECRITURE.filter(({ motif }) => motif.test(code)).map(({ nom }) => nom);
}

/**
 * Le nombre d'APPELS à `estValeurLibre` dans un source — jamais ses citations.
 *
 * ⚠️ LES TROIS FORMES DE NON-APPEL SONT CELLES QUE L'ADR 0019 A MESURÉES : une
 *    citation en commentaire, une clause `import … from`, une clause
 *    `export … from`. La parenthèse d'appel les écarte toutes les trois — un nom
 *    suivi d'une virgule ou d'une accolade n'en porte pas — et l'argument de type
 *    optionnel est la troisième règle de l'ADR 0019, celle qui déclarait
 *    `avecJournal` non cousue. Le témoin le PROUVE plutôt que ce commentaire ne
 *    l'affirme.
 */
function appelsAEstValeurLibre(source: string): number {
  return [...sansCommentaires(source).matchAll(/estValeurLibre\s*(?:<[^>]*>\s*)?\(/g)].length;
}

/** Les noms importés par l'étape 11 depuis le module qui porte l'unique définition. */
function importesDuKit(code: string): readonly string[] {
  const noms: string[] = [];
  for (const clause of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    if (!(clause[2] ?? "").endsWith("/champs-declares.js")) continue;
    for (const nom of (clause[1] ?? "").split(",")) {
      const propre = nom.trim();
      if (propre.length > 0) noms.push(propre);
    }
  }
  return noms;
}

describe("G4 · il n'existe plus qu'UNE écriture de « ce schéma referme la valeur »", () => {
  const source = readFileSync(ETAPE_11_SOURCE, "utf8");

  it("① le détecteur de seconde écriture SAIT en voir une — témoin fabriqué", () => {
    // ⚠️ SANS CE TÉMOIN, LA GARDE SUIVANTE EST VERTE SUR UN DÉTECTEUR MORT. Une
    //    faute de frappe dans un motif, un `sansCommentaires` qui mangerait le
    //    code au lieu des commentaires, et « aucune marque trouvée » ne voudrait
    //    plus rien dire.
    const fabrique = [
      'const FORMATS_CONTRAIGNANTS: ReadonlySet<string> = new Set(["date"]);',
      'const TEMOINS_DE_PROSE: readonly string[] = ["une phrase"];',
      "function patternReferme(motif: string): boolean { return motif.length > 0; }",
      "function estConteneurOuvert(schema: ObjetJson): boolean { return true; }",
      "function estTexteLibre(schema: ObjetJson, niveau = 0): boolean {",
      "  if (niveau > 4) return true;",
      "  return true;",
      "}",
    ].join("\n");

    const vues = marquesDeSecondeEcriture(fabrique);
    // Et la MÊME source, mise en commentaire de bout en bout, ne doit RIEN rendre :
    // c'est ce qui distingue « le code la porte » de « un JSDoc la nomme ».
    const enCommentaire = marquesDeSecondeEcriture(`/*\n${fabrique}\n*/`);

    console.log(
      `[G4 · témoin du détecteur] ${String(MARQUES_DE_SECONDE_ECRITURE.length)} marque(s) ` +
        `cherchée(s) · ${String(vues.length)} vue(s) dans la source fabriquée · ` +
        `${String(enCommentaire.length)} vue(s) quand la MÊME source est en commentaire`,
    );

    expect(vues, "le détecteur doit voir les six marques qu'il cherche").toEqual(
      MARQUES_DE_SECONDE_ECRITURE.map(({ nom }) => nom),
    );
    expect(enCommentaire, "une marque citée en commentaire n'est pas une écriture").toEqual([]);
  });

  it("① l'étape 11 ne porte AUCUNE des marques d'une seconde écriture", () => {
    const restantes = marquesDeSecondeEcriture(source);

    console.log(
      `[G4 · seconde écriture] ${String(MARQUES_DE_SECONDE_ECRITURE.length)} marque(s) ` +
        `cherchée(s) dans ${String(source.length)} caractère(s) de source · ` +
        `${String(restantes.length)} trouvée(s)` +
        (restantes.length > 0 ? ` : ${restantes.join(", ")}` : ""),
    );

    expect(
      restantes,
      "une seconde dérivation de « ce schéma referme la valeur » est réapparue dans " +
        "`core/chaine/etape-11-provenance.ts` — deux dérivations d'un même fait finissent " +
        "par se contredire, et l'admission dirait alors le contraire du § 20",
    ).toEqual([]);
  });

  it("② le compteur d'appels ÉCARTE les trois formes de non-appel — témoin fabriqué", () => {
    const citation = "// estValeurLibre(schema) serait le bon juge ici.";
    const importation = 'import { estValeurLibre } from "../adapter-kit/champs-declares.js";';
    const reexport = 'export { estValeurLibre } from "../adapter-kit/champs-declares.js";';
    const appel = "if (estValeurLibre(sous)) libres.push(nom);";
    const avecArgumentDeType = "if (estValeurLibre<ObjetJson>(sous)) libres.push(nom);";

    const mesures = {
      citation: appelsAEstValeurLibre(citation),
      importation: appelsAEstValeurLibre(importation),
      reexport: appelsAEstValeurLibre(reexport),
      appel: appelsAEstValeurLibre(appel),
      argumentDeType: appelsAEstValeurLibre(avecArgumentDeType),
      deuxAppels: appelsAEstValeurLibre(`${appel}\n${appel}`),
    };

    console.log(
      `[G4 · témoin du compteur] commentaire → ${String(mesures.citation)} · ` +
        `import → ${String(mesures.importation)} · ré-export → ${String(mesures.reexport)} · ` +
        `appel → ${String(mesures.appel)} · appel<T> → ${String(mesures.argumentDeType)} · ` +
        `deux appels → ${String(mesures.deuxAppels)}`,
    );

    expect(mesures.citation, "une citation en commentaire n'est pas un appel").toBe(0);
    expect(mesures.importation, "un import n'est pas un appel").toBe(0);
    expect(mesures.reexport, "un ré-export n'est pas un appel").toBe(0);
    expect(mesures.appel, "un appel est un appel").toBe(1);
    expect(mesures.argumentDeType, "règle ③ de l'ADR 0019 — `nom<T>(…)` est un appel").toBe(1);
    expect(mesures.deuxAppels, "le compteur compte, il ne devine pas").toBe(2);
  });

  it("② l'étape 11 IMPORTE l'unique définition, et l'APPELLE", () => {
    const code = sansCommentaires(source);
    const importes = importesDuKit(code);
    const appels = appelsAEstValeurLibre(source);

    console.log(
      `[G4 · couture] ${String(importes.length)} nom(s) importé(s) de ` +
        `\`champs-declares.js\` : ${importes.join(", ") || "aucun"} · ` +
        `${String(appels)} appel(s) à \`estValeurLibre\` dans le code de l'étape 11`,
    );

    expect(
      importes,
      "l'étape 11 doit IMPORTER `estValeurLibre` de la couche basse — la porter en local " +
        "serait la seconde source de vérité qu'on vient de retirer",
    ).toContain("estValeurLibre");
    expect(
      appels,
      "l'étape 11 importe `estValeurLibre` sans l'appeler : une définition unique qui " +
        "n'atteint pas le chemin de production est exactement la panne du lot 1c",
    ).toBeGreaterThanOrEqual(1);
  });

  it("② et le verdict SERVI par l'étape 11 suit bien la fonction du kit", () => {
    // ⚠️ LA COUTURE SE PROUVE AUSSI PAR LE COMPORTEMENT, PAS SEULEMENT PAR LE
    //    TEXTE DU SOURCE. Les deux formes sont DÉRIVÉES de la liste exportée :
    //    un `format` qu'elle porte referme, un `format` inventé ne referme rien.
    //    Si la branche était recâblée sur autre chose, ces deux-là cesseraient de
    //    se répondre.
    const parLEtape = (sous: ValeurJson): boolean =>
      analyserArgumentsDuSchema(
        { type: "object", properties: { champ: sous }, additionalProperties: false },
        AUCUN_CHAMP_DE_GOUVERNANCE,
      ).libres.some((champ) => champ.nom === "champ");

    // ⚠️ LE REPLI EST LA CHAÎNE VIDE, ET NON UN FORMAT RECOPIÉ. Une liste vidée
    //    rendrait alors « libre », donc ROUGIR, au lieu de faire passer la garde
    //    sur un nom écrit à la main ici — qui serait la troisième source de
    //    vérité que ce lot vient justement de retirer.
    const contraignant = [...FORMATS_CONTRAIGNANTS][0] ?? "";
    const libreSousUnFormatContraignant = parLEtape({ type: "string", format: contraignant });
    const libreSousUnFormatInvente = parLEtape({ type: "string", format: "texte-long" });

    console.log(
      `[G4 · verdict servi] format \`${String(contraignant)}\` (contraignant) → libre : ` +
        `${String(libreSousUnFormatContraignant)} · format inventé → libre : ` +
        `${String(libreSousUnFormatInvente)} · ` +
        `${String(FORMATS_CONTRAIGNANTS.size)} format(s) contraignant(s) dans l'unique liste · ` +
        `${String(TEMOINS_DE_PROSE.length)} témoin(s) de prose · ` +
        `borne de profondeur : ${String(PROFONDEUR_VALEUR)}`,
    );

    // Plancher : une liste vidée rendrait `contraignant` indéfini et les deux
    // mesures identiques — vertes en n'ayant rien confronté.
    expect(FORMATS_CONTRAIGNANTS.size, "plancher — l'unique liste n'est pas vide").toBeGreaterThan(
      0,
    );
    expect(libreSousUnFormatContraignant, "un format contraignant referme le champ").toBe(false);
    expect(libreSousUnFormatInvente, "un format inventé ne referme rien").toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G5 · CE QUE `idFields` NE DÉSARME PAS — LE CLIQUET À NE PAS PERDRE
// ═════════════════════════════════════════════════════════════════════════════

describe("G5 · `idFields` n'atteint PAS la branche 1 — et ce cliquet doit tenir", () => {
  /**
   * ⚠️ CE TEST EST UN CLIQUET, PAS UN CONSTAT — ET SON SUJET A CHANGÉ DE NATURE
   *    AU LOT 1d, SANS CHANGER D'ATTENTE.
   *
   * Il gardait un invariant D'ORDRE : dans `analyserArgumentsDuSchema()`,
   * `familleDeGouvernance(nom)` était évaluée AVANT le
   * `if (identifiants.has(nom)) continue;`, et l'emplacement de ces deux
   * instructions était la seule chose qui empêchait un dépôt tiers d'éteindre
   * AUSSI la branche que le § 20 déclare inconditionnelle — en déclarant son
   * destinataire comme un identifiant. Rien dans le code ne NOMMAIT cet ordre :
   * un `continue` remonté de trois lignes au cours d'une refonte l'aurait rompu
   * sans qu'aucune autre garde ne bouge.
   *
   * ✅ **L'ADR 0015 A SUPPRIMÉ LA SECONDE INSTRUCTION.** Il n'y a plus d'ordre à
   *    tenir, donc plus rien à casser par déplacement : la branche de gouvernance
   *    est désormais hors d'atteinte d'une déclaration PAR CONSTRUCTION.
   *
   *    Le test reste, et il n'est pas devenu décoratif : il MESURE cette absence
   *    d'atteinte, et il rougirait le jour où une exonération par déclaration
   *    reviendrait — sous ce nom ou sous un autre —, exactement comme il aurait
   *    rougi sur un `continue` déplacé.
   */
  it("un champ de gouvernance que le manifeste dit identifiant reste surveillé — et on ANNONCE combien", () => {
    const retenusParLeNom = NOMS_DE_GOUVERNANCE.filter((nom) => familleDeGouvernance(nom) !== null);
    const perdusParLaDeclaration: string[] = [];

    for (const nom of retenusParLeNom) {
      const schema = schemaFerme({ [nom]: { type: "string" } });
      // Le pire cas : l'adaptateur déclare son propre champ de gouvernance comme
      // un identifiant. Depuis l'ADR 0015, la dérivation n'a même plus de quoi
      // recevoir cette déclaration — et c'est bien ce que ce compte mesure.
      const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
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
 * ⚠️ CETTE GARDE MESURE OÙ LE TYPE EST ARRIVÉ, PAS S'IL EXISTE. Le type existait
 *    déjà au lot 1c : `core/identite/session.ts` le fabrique, et
 *    `DependancesOrchestrateur` le portait. La question qui décide de la sécurité
 *    est ailleurs — les interfaces que l'étape 11 consomme RÉELLEMENT l'ont-elles
 *    adopté ?
 *
 * ✅ **AU LOT 1d, OUI.** La première mesure de cette garde était le fait même que
 *    ce fichier compilait avec `const SESSION = "…"`, une chaîne nue passée à
 *    `ContexteProvenance` et à `marquerResultat()`. Ce n'est plus le cas : le
 *    littéral a été remplacé par `sessionIdDeTemoin()`, la fabrique NOMMÉE des
 *    témoins, parce que le type marqué refuse désormais la chaîne. La garde
 *    ci-dessous compte les deux formes dans la source plutôt que de le laisser à
 *    déduire — et son compte s'est inversé.
 */
const ETAPES_SOURCE = fileURLToPath(new URL("../chaine/etapes.ts", import.meta.url));

describe("G6 · ADR 0014 — le type marqué est descendu jusqu'à la garde qu'il devait tenir", () => {
  it("compte les `sessionId` du contrat des étapes, nus contre marqués", () => {
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

    // ✅ **CE QUI EST MESURÉ DEPUIS LE LOT 1d : LE COMPTE S'EST INVERSÉ.** Le
    //    contrat des étapes gardait la chaîne nue en TROIS points —
    //    `ContexteProvenance.sessionId` et les deux méthodes d'`IndexProvenance`,
    //    c'est-à-dire l'ancre du § 20 elle-même. Les trois portent le type marqué.
    //
    //    ⚠️ LE PLANCHER EST SUR LE TOTAL, PAS SUR `marques` : c'est lui qui
    //       distingue « tout est marqué » d'« on n'a rien su lire ».
    expect(nus, "plus aucun `sessionId: string` dans le contrat des étapes").toBe(0);
    expect(marques, "et les trois points d'ancrage portent le type marqué").toBe(3);
  });

  it("✅ ADR 0014 — le contrat des étapes porte `SessionId`", () => {
    const source = sansCommentaires(readFileSync(ETAPES_SOURCE, "utf8"));
    expect([...source.matchAll(/sessionId\s*:\s*string/g)].length).toBe(0);
  });
});
