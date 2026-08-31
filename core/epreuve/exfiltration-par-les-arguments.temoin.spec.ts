/**
 * TÉMOINS ADVERSAIRES — § 18, ligne « Moi-même, conduit par un contenu lu ».
 *
 * ═══ L'ATTAQUE, TELLE QUE LE § 18 L'ÉCRIT ═══
 *
 * « La donnée lue ressort dans l'argument d'un outil de lecture — champ en
 * texte libre. » Ce qui l'arrête, selon le § 18 : « marquage de provenance par
 * session · refus ou confirmation d'un argument libre vers un autre domaine
 * (étape 11) ».
 *
 * Ce fichier ESSAIE DE PASSER. Il ne relit pas l'étape 11 : il lui soumet des
 * appels fabriqués pour la contourner, et il MESURE lesquels passent.
 *
 * ═══ LES DEUX MOITIÉS DE LA GARDE, ET LAQUELLE CÈDE ═══
 *
 * L'étape 11 décide sur DEUX entrées, et une seule est solide :
 *
 *  · la PROVENANCE — quels domaines ont marqué la session. Elle ne compare
 *    aucun texte, donc reformuler, traduire, découper ou encoder ne la bouge
 *    pas d'un pouce. La garde 1 le mesure, et c'est un CLIQUET : les cinq
 *    variantes du § 20 échouent toutes, identiquement.
 *
 *  · le booléen `porteUnArgumentLibre`, DÉRIVÉ DU SCHÉMA par
 *    `analyserArgumentsDuSchema()`. C'est là que l'attaque réussit. Le socle ne
 *    demande pas « cet appel transporte-t-il du texte ? » mais « le schéma
 *    NOMME-T-IL un champ que je reconnais comme du texte libre ? ». Quatre
 *    formes de schéma parfaitement ordinaires transportent du texte que cette
 *    reconnaissance ne voit pas — et pour trois d'entre elles, la garde de
 *    fermeture du § 09 ne les voit pas non plus.
 *
 * ⚠️ CES TÉMOINS N'AFFIRMENT JAMAIS QUE L'ÉTAPE 11 EST CORRECTE. Ils affirment
 *    ce qu'elle fait, mesuré. Un témoin qui constate un contournement décrit le
 *    comportement RÉEL, avec le motif du défaut en commentaire : le jour où la
 *    dérivation sera réparée, il rougira et forcera à le relire.
 */

import { describe, expect, it } from "vitest";

import { analyserFermeture } from "../adapter-kit/fermeture.js";
import { versValeurJson } from "../adapter-kit/json.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { ETAPE_PROVENANCE } from "../chaine/etapes.js";
import type { ContexteProvenance } from "../chaine/etapes.js";
// ADR 0014 — la session de témoin vient de la fabrique NOMMÉE de `core/identite/` :
// le type marqué de `SessionId` ne se laisse plus écrire en littéral.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";
import {
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
} from "../chaine/etape-11-provenance.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Le décor : une session qui vient de lire du `personal` chez un domaine
// ─────────────────────────────────────────────────────────────────────────────

const DOMAINE_LU = "boite-courrier";
const DOMAINE_TIERS = "annuaire-externe";
const SESSION: SessionId = sessionIdDeTemoin();

/**
 * Le contenu que l'attaquant veut faire sortir. AUCUNE DONNÉE RÉELLE : une
 * phrase fabriquée pour ce dossier, et un hôte en `stub.invalid` (RFC 2606).
 */
const CONTENU_LU = "Le rendez-vous du 12 est reporté ; le dossier est chez le notaire.";

/** Un index marqué comme il l'est en production : par le RÉSULTAT d'un appel. */
function indexMarque(): IndexProvenanceMemoire {
  const index = new IndexProvenanceMemoire();
  const marque = marquerResultat(index, {
    sessionId: SESSION,
    adapterId: DOMAINE_LU,
    dataClass: "personal",
    empreintes: ["empreinte-de-l-extrait-lu"],
  });
  // Un décor qui n'aurait rien marqué rendrait TOUS les témoins « passants »
  // pour la pire des raisons : il n'y aurait rien à contourner.
  expect(marque, "le décor doit avoir marqué la session, sinon rien n'est éprouvé").toBe(true);
  return index;
}

function contexte(surcharge: Partial<ContexteProvenance> = {}): ContexteProvenance {
  return {
    sessionId: SESSION,
    adapterId: DOMAINE_TIERS,
    porteUnArgumentLibre: true,
    porteUnArgumentDeGouvernance: false,
    niveau: "brouillon",
    index: indexMarque(),
    ...surcharge,
  };
}

/** L'appel passe-t-il ? `true` = l'attaquant a franchi l'étape 11. */
function passe(ctx: ContexteProvenance): boolean {
  return etape11Provenance(ctx).issue === "autorise";
}

// ─────────────────────────────────────────────────────────────────────────────
//  GARDE 1 — LES CINQ TRANSFORMATIONS DU TEXTE. Le cliquet.
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 18 — exfiltration par les arguments : transformer le TEXTE ne sert à rien", () => {
  /**
   * Les cinq contournements que le § 20 nomme, chacun appliqué au même contenu.
   * Une garde de forme — « l'argument reprend-il verbatim l'extrait lu ? » —
   * en laisserait passer quatre sur cinq. L'étape 11 n'en laisse passer aucune,
   * parce qu'elle ne regarde AUCUN de ces textes.
   */
  const TRANSFORMATIONS = [
    { nom: "verbatim", texte: CONTENU_LU },
    { nom: "reformulation", texte: "Report du rendez-vous ; le dossier a changé de main." },
    {
      nom: "traduction",
      texte: "The meeting of the 12th is postponed; the file is at the notary.",
    },
    { nom: "découpage en morceaux", texte: CONTENU_LU.slice(0, 20) },
    { nom: "encodage", texte: Buffer.from(CONTENU_LU, "utf8").toString("base64") },
  ] as const;

  it("refuse les cinq variantes, et ANNONCE combien de textes elle a ignorés", () => {
    const passants: string[] = [];
    const contourneraientUneGardeDeForme: string[] = [];

    for (const variante of TRANSFORMATIONS) {
      // Le texte est fabriqué, puis DÉLIBÉRÉMENT NON TRANSMIS à l'étape : rien
      // dans `ContexteProvenance` ne porte de texte. C'est le point du § 20.
      if (variante.texte !== CONTENU_LU) contourneraientUneGardeDeForme.push(variante.nom);
      if (passe(contexte())) passants.push(variante.nom);
    }

    console.log(
      `[garde transformations] ${String(TRANSFORMATIONS.length)} variante(s) soumise(s) · ` +
        `${String(passants.length)} passée(s) · ` +
        `${String(contourneraientUneGardeDeForme.length)} auraient contourné une garde de forme`,
    );

    expect(
      TRANSFORMATIONS.length,
      "plancher-témoin : au moins cinq variantes",
    ).toBeGreaterThanOrEqual(5);
    expect(passants).toEqual([]);
    // La mesure qui donne son sens au vert ci-dessus : quatre de ces cinq
    // variantes SERAIENT passées si le socle avait gardé la règle « verbatim ».
    expect(contourneraientUneGardeDeForme.length).toBe(TRANSFORMATIONS.length - 1);
  });

  it("refuse identiquement quel que soit le texte — le verdict ne dépend d'aucune chaîne", () => {
    const messages = new Set<string>();
    for (const _ of TRANSFORMATIONS) {
      const verdict = etape11Provenance(contexte());
      expect(verdict.issue).toBe("refuse");
      if (verdict.issue === "refuse") messages.add(verdict.message);
    }
    console.log(`[garde stabilité du refus] ${String(messages.size)} message(s) distinct(s)`);
    expect(messages.size).toBe(1);
    // Et le message ne cite JAMAIS le contenu lu : il nomme le domaine.
    const [message] = [...messages];
    expect(message).toContain(DOMAINE_LU);
    expect(message).not.toContain(CONTENU_LU);
  });

  it("refuse aussi le passage par un argument de gouvernance, à TOUT niveau", () => {
    const niveaux = ["brouillon", "confirmé", "libre"] as const;
    const passants: string[] = [];
    for (const niveau of niveaux) {
      const ctx = contexte({
        niveau,
        porteUnArgumentDeGouvernance: true,
        // Pire cas pour la garde : MÊME domaine, donc la branche « autre
        // domaine » ne joue pas. Le § 20 dit « JAMAIS », sans cette clause.
        adapterId: DOMAINE_LU,
        porteUnArgumentLibre: false,
      });
      if (passe(ctx)) passants.push(niveau);
    }
    console.log(
      `[garde gouvernance] ${String(niveaux.length)} niveau(x) mesuré(s) · ` +
        `${String(passants.length)} passant(s)`,
    );
    expect(passants).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GARDE 2 — LE VRAI TROU : DES SCHÉMAS QUI PORTENT DU TEXTE SANS LE DIRE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un témoin de schéma : ce qu'un adaptateur déclare, et ce que l'attaquant y
 * loge. `libreAttendu` dit ce que la dérivation DEVRAIT conclure ; `libreMesure`
 * est rempli à l'exécution.
 */
interface TemoinSchema {
  readonly nom: string;
  /** Le schéma d'entrée, tel qu'un générateur ordinaire le produit. */
  readonly schema: Record<string, unknown>;
  readonly idFields: readonly string[];
  /** Ce que l'attaquant loge dans le champ. Jamais transmis : il documente. */
  readonly charge: string;
  /** Pourquoi ce champ transporte VRAIMENT du texte libre. */
  readonly motif: string;
}

/** Enrobe une propriété dans un schéma d'objet FERMÉ, comme le § 09 l'exige. */
function schemaFerme(proprietes: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", properties: proprietes, additionalProperties: false };
}

const TEMOINS_SCHEMA: readonly TemoinSchema[] = [
  {
    // ── CONTRÔLE POSITIF ─────────────────────────────────────────────────
    nom: "chaîne nue — la forme que la garde reconnaît",
    schema: schemaFerme({ requete: { type: "string" } }),
    idFields: [],
    charge: CONTENU_LU,
    motif: "une chaîne sans enum, const, format ni pattern : le cas nominal.",
  },
  {
    nom: "tableau de chaînes",
    schema: schemaFerme({ etiquettes: { type: "array", items: { type: "string" } } }),
    idFields: [],
    charge: CONTENU_LU,
    motif: "un contenu se loge aussi bien dans `tags[]` que dans `query`.",
  },
  {
    // ── ATTAQUE A ────────────────────────────────────────────────────────
    nom: 'carte libre — `{ type: "object", additionalProperties: { type: "string" } }`',
    schema: schemaFerme({
      filtres: { type: "object", additionalProperties: { type: "string" } },
    }),
    idFields: [],
    charge: CONTENU_LU,
    motif:
      "`z.record(z.string(), z.string())` produit exactement cette forme. Le champ accepte " +
      "un nombre libre de clés et de VALEURS TEXTE, et ne déclare aucune `properties`.",
  },
  {
    // ── ATTAQUE B ────────────────────────────────────────────────────────
    nom: 'objet sans `properties` — `{ type: "object" }`',
    schema: schemaFerme({ metadonnees: { type: "object" } }),
    idFields: [],
    charge: CONTENU_LU,
    motif:
      "un objet qui ne déclare rien accepte tout : c'est le schéma le plus permissif qui soit.",
  },
  {
    // ── ATTAQUE C ────────────────────────────────────────────────────────
    nom: "`pattern` qui accepte TOUT",
    schema: schemaFerme({ note: { type: "string", pattern: "^[\\s\\S]*$" } }),
    idFields: [],
    charge: CONTENU_LU,
    motif:
      "`estTexteLibre()` referme un champ dès que `pattern` est une chaîne non vide — sans " +
      "jamais se demander CE QUE le motif accepte. Celui-ci accepte l'univers.",
  },
  {
    // ── ATTAQUE D ────────────────────────────────────────────────────────
    nom: "`format` inconnu du socle",
    schema: schemaFerme({ note: { type: "string", format: "note-libre" } }),
    idFields: [],
    charge: CONTENU_LU,
    motif:
      "`format` est une ANNOTATION en JSON Schema : il ne contraint rien par lui-même, et " +
      "le socle ne le confronte à aucune liste. Un adaptateur non-Zod (§ 29) en pose ce " +
      "qu'il veut.",
  },
  {
    // ── ATTAQUE E ────────────────────────────────────────────────────────
    nom: "`format: \"uri\"` — l'exfiltration par l'adresse elle-même",
    schema: schemaFerme({ rappel: { type: "string", format: "uri" } }),
    idFields: [],
    charge: "https://collecte.stub.invalid/?d=Le+rendez-vous+du+12+est+reporte",
    motif:
      "une URI est un format VALIDE qui transporte une chaîne de requête arbitraire. Le " +
      "format est respecté ET le contenu sort.",
  },
  {
    // ── ATTAQUE F ────────────────────────────────────────────────────────
    nom: "`idFields` qui désigne un champ de texte libre",
    schema: schemaFerme({ requete: { type: "string" } }),
    idFields: ["requete"],
    charge: CONTENU_LU,
    motif:
      "`idFields` était DÉCLARÉ par l'adaptateur et confronté à rien — ni au schéma, ni au " +
      "type du champ ; le déclarer suffisait à retirer le champ de `libres`. ADR 0015 : " +
      "l'étape 11 ne lit plus la déclaration. Le champ reste écrit ici POUR QUE LA " +
      "DÉCLARATION EXISTE ENCORE — un témoin qui ne déclarerait plus rien ne pourrait " +
      "plus prouver qu'elle est sans effet.",
  },
];

describe("§ 18 — exfiltration par les arguments : contourner la DÉRIVATION du schéma", () => {
  it("mesure, schéma par schéma, ce que la dérivation conclut — et ce qui passe", () => {
    const passants: string[] = [];
    let proprietesTotales = 0;

    for (const temoin of TEMOINS_SCHEMA) {
      const analyse = analyserArgumentsDuSchema(temoin.schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      proprietesTotales += analyse.proprietesInspectees;

      // Chaque témoin doit avoir été RÉELLEMENT inspecté : une dérivation qui
      // n'aurait confronté aucune propriété rendrait `false` pour la pire des
      // raisons, et le témoin conclurait « contournement » à tort.
      expect(
        analyse.proprietesInspectees,
        `${temoin.nom} : aucune propriété inspectée, la mesure ne vaudrait rien`,
      ).toBeGreaterThanOrEqual(1);
      expect(analyse.schemaIllisible).toBe(false);
      expect(analyse.profondeurDepassee).toBe(false);

      const franchi = passe(contexte({ porteUnArgumentLibre: analyse.porteUnArgumentLibre }));
      if (franchi) passants.push(temoin.nom);
    }

    console.log(
      `[garde dérivation du schéma] ${String(TEMOINS_SCHEMA.length)} schéma(s) témoin(s) · ` +
        `${String(proprietesTotales)} propriété(s) inspectée(s) · ` +
        `${String(passants.length)} contournement(s) : ${passants.join(" | ")}`,
    );

    expect(TEMOINS_SCHEMA.length, "plancher-témoin").toBeGreaterThanOrEqual(8);

    // ⚠️ CINQ DES SIX CONTOURNEMENTS ÉTAIENT DÉJÀ FERMÉS. `estTexteLibre()` ne
    //    traite plus `pattern`, `format` ni `{type:"object"}` comme des
    //    fermetures : un `format` ne referme qu'au vu d'une liste fermée de
    //    formats réellement contraignants (`uri` en est exclu nommément), un
    //    `pattern` ne referme que s'il REJETTE des témoins de prose fabriqués, et
    //    un conteneur d'objet ouvert est LIBRE.
    //
    // ✅ **LE SIXIÈME EST FERMÉ AU LOT 1d — ADR 0015.** `idFields` était DÉCLARÉ
    //    par l'adaptateur et confronté à rien — ni au schéma, ni au type du
    //    champ —, et l'étape 11 en retirait chaque champ nommé de la liste des
    //    arguments libres. L'arbitrage a été rendu : ce qui referme un champ est
    //    le SCHÉMA, et lui seul. Le paramètre a disparu de la signature.
    //
    //    ⚠️ CE QUE ÇA COÛTE EST ÉCRIT, ET CE N'EST PAS NUL : un `messageId`
    //       légitime déclaré `{"type":"string"}` sans motif redevient un argument
    //       libre, donc une confirmation là où l'adaptateur n'en attendait pas —
    //       dans une session DÉJÀ marquée par une lecture `personal` seulement.
    //       Le remède est une ligne de Zod chez l'adaptateur (`.uuid()`, un
    //       `pattern` ancré), et l'admission le lui ANNONCE sans le refuser
    //       (`idFieldsSansEffet`, `core/registry/enregistrer.ts`).
    //
    // ⚠️ **CE TÉMOIN N'EST PAS DEVENU DÉCORATIF.** Le schéma F déclare toujours
    //    `idFields: ["requete"]` — la déclaration existe encore, elle est
    //    simplement sans effet. Le jour où une exonération reviendrait, ce compte
    //    remonterait à 1 et ce test rougirait, exactement comme avant.
    expect(passants).toEqual([]);
  });

  it("les deux premiers témoins PROUVENT que la garde sait mordre", () => {
    // Sans ce cliquet, « six contournements sur huit » pourrait vouloir dire
    // « la dérivation ne fonctionne pas du tout ».
    for (const temoin of TEMOINS_SCHEMA.slice(0, 2)) {
      const analyse = analyserArgumentsDuSchema(temoin.schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      expect(analyse.porteUnArgumentLibre, temoin.nom).toBe(true);
      expect(passe(contexte({ porteUnArgumentLibre: true })), temoin.nom).toBe(false);
    }
    console.log("[cliquet dérivation] 2 forme(s) reconnue(s) et refusée(s)");
  });

  it("la garde de FERMETURE du § 09 rattrape désormais les conteneurs ouverts", () => {
    /**
     * ⚠️ CE TEST EST LE PLUS IMPORTANT DU FICHIER, ET IL L'EST TOUJOURS. Deux
     *    gardes séparées peuvent se rattraper l'une l'autre : si le registre
     *    refuse l'admission d'un `{ type: "object" }` sans `properties`, le trou
     *    de l'étape 11 n'est pas atteignable. Il l'ÉTAIT.
     *
     *    `declareDesProprietes()` (`core/adapter-kit/fermeture.ts`) n'exigeait la
     *    fermeture que des sous-schémas déclarant une clé `properties`. Un objet
     *    qui n'en déclarait aucune n'avait rien à fermer À SES YEUX — et il
     *    acceptait pourtant n'importe quelle clé. La fonction s'appelle
     *    désormais `doitEtreFerme()` et compte TOUT schéma d'objet.
     *
     * ⚠️ CE QUI RESTE, ET POURQUOI CE N'EST PAS ZÉRO. `format: "uri"` porte du
     *    texte libre ET reste parfaitement fermé au sens du § 09 : c'est une
     *    chaîne, dans un objet fermé. Les deux gardes ne se recouvrent donc pas,
     *    et c'est normal — la fermeture parle de la FORME du document, l'étape 11
     *    de ce qu'un champ peut TRANSPORTER. C'est l'étape 11 qui le tient, seule,
     *    et le témoin ci-dessus le mesure.
     */
    const admis: string[] = [];
    const candidats = TEMOINS_SCHEMA.filter(
      (t) => t.nom.includes("object") || t.nom.includes("uri"),
    );

    for (const temoin of candidats) {
      const verdict = analyserFermeture(versValeurJson(temoin.schema, "$.schéma témoin"));
      expect(
        verdict.sousSchemasInspectes,
        `${temoin.nom} : zéro sous-schéma inspecté`,
      ).toBeGreaterThanOrEqual(2);
      if (verdict.ferme) admis.push(temoin.nom);
    }

    console.log(
      `[garde fermeture ↔ étape 11] ${String(candidats.length)} schéma(s) confronté(s) · ` +
        `${String(admis.length)} déclaré(s) FERMÉ(s) par le § 09 tout en portant du texte libre`,
    );

    expect(candidats.length).toBeGreaterThanOrEqual(3);
    // ⚖️ L'ANGLE MORT PARTAGÉ EST FERMÉ : les deux conteneurs d'objet ouverts
    //    sont désormais refusés par le § 09. Reste `format: "uri"`, fermé au sens
    //    du § 09 et libre au sens du § 20 — les deux gardes ne mesurent pas la
    //    même chose, et une seule suffit pour lui.
    expect(admis).toEqual(["`format: \"uri\"` — l'exfiltration par l'adresse elle-même"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GARDE 3 — LE PASSAGE PAR UN ARGUMENT DE GOUVERNANCE, PAR SON NOM
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 18 — exfiltration par les arguments : renommer l'argument de gouvernance", () => {
  /**
   * Le § 20 nomme cinq familles : « niveau de politique, TTL, bascule d'outil,
   * destinataire d'un envoi, créneau posé ». `FAMILLES_GOUVERNANCE` les
   * reconnaît PAR LE NOM du champ. L'en-tête du module prévient déjà qu'un champ
   * nommé `cible` ou `param3` y échappe — ce témoin mesure une question plus
   * gênante : **des graphies parfaitement ordinaires y échappent-elles ?**
   */
  const NOMS_DE_GOUVERNANCE = [
    // Destinataire d'un envoi
    { nom: "to", famille: "destinataire d'un envoi" },
    { nom: "recipients", famille: "destinataire d'un envoi" },
    { nom: "destinataire", famille: "destinataire d'un envoi" },
    { nom: "mailTo", famille: "destinataire d'un envoi" },
    { nom: "emailTo", famille: "destinataire d'un envoi" },
    { nom: "adresseDeReponse", famille: "destinataire d'un envoi" },
    { nom: "envoyerA", famille: "destinataire d'un envoi" },
    // TTL
    { nom: "ttl", famille: "TTL" },
    { nom: "expiresAt", famille: "TTL" },
    { nom: "validUntil", famille: "TTL" },
    { nom: "maxAge", famille: "TTL" },
    // Créneau posé
    { nom: "slot", famille: "créneau posé" },
    { nom: "slotStart", famille: "créneau posé" },
    { nom: "startAt", famille: "créneau posé" },
    { nom: "dateDebut", famille: "créneau posé" },
    { nom: "scheduledFor", famille: "créneau posé" },
    // Niveau de politique / bascule d'outil
    { nom: "policyLevel", famille: "niveau de politique" },
    { nom: "enabled", famille: "bascule d'outil" },
    { nom: "profil", famille: "bascule d'outil" },
    { nom: "toolset", famille: "bascule d'outil" },
  ] as const;

  it("mesure combien de graphies ordinaires échappent aux cinq familles", () => {
    const retenus: string[] = [];
    const echappes: string[] = [];

    for (const cas of NOMS_DE_GOUVERNANCE) {
      if (familleDeGouvernance(cas.nom) === null) echappes.push(cas.nom);
      else retenus.push(cas.nom);
    }

    console.log(
      `[garde noms de gouvernance] ${String(NOMS_DE_GOUVERNANCE.length)} nom(s) confronté(s) · ` +
        `${String(retenus.length)} retenu(s) · ${String(echappes.length)} échappé(s) : ` +
        echappes.join(", "),
    );

    expect(NOMS_DE_GOUVERNANCE.length, "plancher-témoin").toBeGreaterThanOrEqual(20);
    // Le cliquet : la garde MORD sur les graphies canoniques.
    expect(retenus).toContain("to");
    expect(retenus).toContain("ttl");
    expect(retenus).toContain("slot");
    expect(retenus).toContain("policyLevel");

    // 🔴 DÉFAUT CONSTATÉ. Un destinataire nommé `emailTo` ou `envoyerA`, une
    //    échéance nommée `validUntil` ou `maxAge`, un créneau nommé `dateDebut`
    //    ou `scheduledFor` traversent la branche 1 de l'étape 11 — celle dont
    //    le § 20 dit « JAMAIS », et que le module décrit comme « la seule
    //    qu'aucune confirmation ne rattrape ».
    expect(echappes).toEqual([
      "emailTo",
      "adresseDeReponse",
      "envoyerA",
      "validUntil",
      "maxAge",
      "dateDebut",
      "scheduledFor",
      "profil",
      "toolset",
    ]);
  });

  it("un destinataire nommé `emailTo` traverse l'étape 11 sur une session marquée", () => {
    const schema = schemaFerme({
      emailTo: { type: "string", format: "email" },
      corps: { type: "string" },
    });
    const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);

    console.log(
      `[témoin emailTo] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `gouvernance détectée : ${String(analyse.porteUnArgumentDeGouvernance)}`,
    );

    // 🔴 La branche « JAMAIS » ne se déclenche pas : le nom n'est pas reconnu.
    expect(analyse.porteUnArgumentDeGouvernance).toBe(false);

    // Ce qui l'arrête tout de même ICI, c'est `corps` — un champ libre vers un
    // AUTRE domaine. La garde tient donc par sa branche 4, pas par la bonne.
    const verdict = etape11Provenance(
      contexte({
        porteUnArgumentLibre: analyse.porteUnArgumentLibre,
        porteUnArgumentDeGouvernance: analyse.porteUnArgumentDeGouvernance,
      }),
    );
    expect(verdict.issue).toBe("refuse");
    expect(verdict.etape).toBe(ETAPE_PROVENANCE.numero);

    // ⚠️ ET VOICI CE QUE ÇA COÛTE : chez le MÊME domaine que celui qui a marqué
    //    la session — le cas `reply` que la branche 2 laisse volontairement
    //    vivre —, plus rien ne l'arrête. Un destinataire dicté par le courrier
    //    qu'on vient de lire part, alors que le § 20 l'interdit « toujours ».
    const memeDomaine = etape11Provenance(
      contexte({
        adapterId: DOMAINE_LU,
        porteUnArgumentLibre: analyse.porteUnArgumentLibre,
        porteUnArgumentDeGouvernance: analyse.porteUnArgumentDeGouvernance,
      }),
    );
    expect(memeDomaine.issue).toBe("autorise");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  GARDE 4 — CHANGER DE SESSION. Le contournement le plus court.
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 18 — exfiltration par les arguments : changer de `sessionId` entre les deux appels", () => {
  /**
   * 🔴 LE CONTOURNEMENT LE PLUS COURT DE TOUT LE SOCLE, ET IL NE DEMANDE AUCUN
   *    SCHÉMA PARTICULIER.
   *
   * Toute la garde du § 20 s'ancre à UNE clé : `identite.sessionId`. Le § 11
   * place son établissement dans les étapes 1 à 4, « HTTP seul », donc HORS de
   * l'orchestrateur ; en stdio, `identiteStdio()` la reçoit en paramètre. Le
   * `principal` y est IMPOSÉ — le commentaire dit pourquoi, mot pour mot : « un
   * poste local qui choisirait son principal pourrait se faire passer pour un
   * jeton HTTP ». Le `sessionId`, lui, est un paramètre ordinaire.
   *
   * Aucune ligne du socle ne contraint sa forme, ne l'authentifie, ni ne le lie
   * au jeton. Ce témoin ne prouve pas qu'un transport le laissera choisir — il
   * n'y a pas encore de transport. Il mesure ce que ça COÛTERAIT : l'attaquant
   * lit chez un domaine sous une session, puis appelle sous une autre, et la
   * garde d'exfiltration ne voit plus rien à confronter.
   */
  it("lire sous une session puis appeler sous une autre annule entièrement l'étape 11", () => {
    // ⚠️ **CE QUE CE TÉMOIN MESURE A CHANGÉ DE NATURE — ADR 0014, LOT 1d.** Les
    //    deux sessions ci-dessous sont désormais des `SessionId`, frappées par la
    //    fabrique NOMMÉE des témoins. Un test PEUT encore en frapper deux : c'est
    //    le propre de `core/identite/fixtures.ts`, et le retirer rendrait ce
    //    fichier incapable de décrire l'attaque.
    //
    //    Ce qui est fermé n'est donc pas mesuré ici, et il faut l'écrire : c'est
    //    qu'AUCUN CHEMIN CONTRÔLÉ PAR L'APPELANT ne produit plus une `SessionId`
    //    — ni `input` (contrôle 7 du § 09), ni `AppelEntrant`, ni un paramètre de
    //    transport. La preuve est un GRAPHE D'IMPORTS, pas un verdict : gardes G2
    //    et G3 de `core/chaine/identite.spec.ts`.
    //
    //    Ce témoin-ci garde son rôle propre, et il est intact : il montre que
    //    l'index ne rattrape RIEN de lui-même. Le jour où quelqu'un rouvrirait le
    //    choix de la session côté transport, l'attaque redeviendrait celle-ci,
    //    mot pour mot.
    const sessionDeLecture: SessionId = sessionIdDeTemoin();
    const sessionSuivante: SessionId = sessionIdDeTemoin();

    const index = new IndexProvenanceMemoire();
    marquerResultat(index, {
      sessionId: sessionDeLecture,
      adapterId: DOMAINE_LU,
      dataClass: "personal",
      empreintes: ["empreinte-de-l-extrait-lu"],
    });

    const memeSession: ContexteProvenance = {
      sessionId: sessionDeLecture,
      adapterId: DOMAINE_TIERS,
      porteUnArgumentLibre: true,
      porteUnArgumentDeGouvernance: true,
      niveau: "brouillon",
      index,
    };
    const sessionRenouvelee: ContexteProvenance = { ...memeSession, sessionId: sessionSuivante };

    // L'index reste PEUPLÉ : ce n'est pas une marque perdue, c'est une marque
    // qu'on ne cherche plus au bon endroit. Sans ce compte, un verdict
    // « autorise » serait indiscernable d'un index vide.
    const etat = index.etat();
    console.log(
      `[garde renouvellement de session] ${String(etat.sessions)} session(s) marquée(s) · ` +
        `${String(etat.extraits)} extrait(s) indexé(s) · ` +
        `indéterminé : ${String(etat.indetermine)} · ` +
        `verdict même session : ${etape11Provenance(memeSession).issue} · ` +
        `verdict session renouvelée : ${etape11Provenance(sessionRenouvelee).issue}`,
    );

    expect(etat.sessions).toBe(1);
    expect(etat.extraits).toBe(1);
    expect(etat.indetermine).toBe(false);

    // Le cliquet : sous la BONNE session, même la branche « JAMAIS » mord.
    expect(etape11Provenance(memeSession).issue).toBe("refuse");
    // 🔴 Sous une session renouvelée, plus rien — l'index ne rattrape rien de
    //    lui-même, et c'est ce que ce fichier mesure. Ce qui a changé au lot 1d
    //    est que l'appelant n'a plus AUCUN moyen d'en frapper une seconde ; voir
    //    la garde G1 de `core/chaine/identite.spec.ts`, qui porte cette preuve-là.
    expect(etape11Provenance(sessionRenouvelee).issue).toBe("autorise");
  });
});
