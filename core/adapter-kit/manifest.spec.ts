import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { canoniser, octetsCanoniques } from "./json.js";
import type { ValeurJson } from "./json.js";
import { creerAdapterKit } from "./kit.js";
import {
  ErreurManifeste,
  analyserDefinition,
  empreinteDuManifeste,
  nomComplet,
  prefixeDe,
  texteDuManifeste,
} from "./manifest.js";
import { definirOutil } from "./types.js";
import type { DefinitionAdaptateur, DefinitionOutil } from "./types.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "./types.js";

/**
 * Gardes du MANIFESTE (§ 09).
 *
 * Motif repris de `core/types.spec.ts` : chaque garde est appliquée D'ABORD à
 * un témoin fabriqué défectueux — on prouve qu'elle rougit — PUIS à la vraie
 * donnée, et chacune annonce combien d'éléments elle a mesurés.
 */

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;

/**
 * Un SCEAU DE PROFILS témoin (ADR 0004).
 *
 * ⚠️ IL EST ÉCRIT ICI, ET C'EST DÉLIBÉRÉ. `core/adapter-kit` ne dépend PAS de
 *    `core/profiles` — c'est tout le sens de `profils.ts`, qui déclare le
 *    contrat sans le contenir. Importer `SCEAU_PROFILS` dans ces gardes
 *    créerait la dépendance que le module refuse, et l'empreinte réelle du
 *    socle n'apprendrait rien de plus : ce qui est éprouvé ici, c'est que le
 *    sceau REÇU voyage jusqu'au manifeste, pas sa valeur.
 */
const SCEAU_TEMOIN = { version: "1.0.0", empreinte: "a".repeat(64) } as const;

type Profil = (typeof PROFILS)[number];

/** Un outil conforme, paramétrable pour fabriquer un témoin défectueux. */
function outilTemoin(surcharges: Partial<DefinitionOutil<Profil>> = {}): DefinitionOutil<Profil> {
  const base = definirOutil<Profil, z.ZodObject, z.ZodObject>({
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents, tous canaux confondus.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    input: z.object({ limite: z.number().int() }).strict(),
    output: z
      .object({
        submissionId: z.string(),
        extrait: z.string(),
        objet: z.string(),
        // Champs de rang 2 : OPTIONNELS, comme l'exige le § 13.3.
        detailHref: z.string().optional(),
        canal: z.string().optional(),
      })
      .strict(),
    maxBytes: 32768,
    compaction: {
      free: ["extrait", "objet"],
      tier2: ["detailHref", "canal"],
      aggregateBy: "canal",
    },
    idFields: ["submissionId"],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
    fixtureMax: "fixtures/inbox-max.json",
    handler: () => ({ submissionId: "s1", extrait: "…", objet: "…" }),
  });
  return { ...base, ...surcharges };
}

function definitionTemoin(
  surcharges: Partial<DefinitionAdaptateur<Profil>> = {},
): DefinitionAdaptateur<Profil> {
  return {
    id: "axionia",
    version: "1.0.0",
    mode: "fédéré",
    profiles: ["dev", "admin"],
    secrets: [],
    tools: [outilTemoin()],
    ...surcharges,
  };
}

const kit = creerAdapterKit(PROFILS, SCEAU_TEMOIN);

// ═════════════════════════════════════════════════════════════════════════════
//  JSON canonique — la fondation de l'épinglage
// ═════════════════════════════════════════════════════════════════════════════

describe("JSON canonique", () => {
  it("rougit sur un témoin où l'ordre des clés change le texte de `JSON.stringify`", () => {
    // Le témoin prouve d'abord que le PROBLÈME existe : sans canonicalisation,
    // deux constructions du même objet donnent deux textes, donc deux SHA.
    const a = { b: 2, a: 1 } as const;
    const b = { a: 1, b: 2 } as const;

    console.info(
      `[garde canonique] ${String(Object.keys(a).length)} clé(s) mesurée(s) · ` +
        `JSON.stringify diffère = ${String(JSON.stringify(a) !== JSON.stringify(b))} · ` +
        `canoniser concorde = ${String(canoniser(a) === canoniser(b))}`,
    );
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(canoniser(a)).toBe(canoniser(b));
    expect(Object.keys(a)).toHaveLength(2);
  });

  it("lève sur un nombre non fini au lieu de l'écrire `null` en silence", () => {
    const nonFinis = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    let leves = 0;
    for (const valeur of nonFinis) {
      try {
        canoniser({ a: valeur });
      } catch {
        leves += 1;
      }
    }
    console.info(
      `[garde non fini] ${String(nonFinis.length)} valeur(s) mesurée(s) · ` +
        `${String(leves)} levée(s)`,
    );
    expect(leves).toBe(nonFinis.length);
    expect(() => canoniser({ a: Number.NaN })).toThrow(/non fini/);
    // Témoin du comportement qu'on refuse : `JSON.stringify` l'escamote.
    expect(JSON.stringify({ a: Number.NaN })).toBe('{"a":null}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Le manifeste se produit, et son SHA est STABLE
// ═════════════════════════════════════════════════════════════════════════════

describe("le manifeste et son empreinte", () => {
  it("se produit, et son SHA est identique entre deux exécutions", () => {
    const premier = kit.defineAdapter(definitionTemoin()).manifeste();
    const second = kit.defineAdapter(definitionTemoin()).manifeste();

    console.info(
      `[garde empreinte stable] 2 productions mesurées · ` +
        `${String(premier.tools.length)} outil(s) au manifeste · ` +
        `empreintes identiques = ` +
        `${String(empreinteDuManifeste(premier) === empreinteDuManifeste(second))}`,
    );
    expect(texteDuManifeste(premier)).toBe(texteDuManifeste(second));
    expect(empreinteDuManifeste(premier)).toBe(empreinteDuManifeste(second));
    expect(empreinteDuManifeste(premier)).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Compte mesuré : le manifeste porte bien des outils. Un manifeste vide
    // aurait lui aussi un SHA parfaitement stable.
    expect(premier.tools.length).toBeGreaterThanOrEqual(1);
  });

  it("change d'empreinte dès qu'un `effect` bascule — sinon l'épinglage ne garde rien", () => {
    // C'est LE cas que le § 20 décrit : « un effect basculé de send à read
    // n'est ni un champ ajouté ni un champ disparu — sans cette règle il
    // n'apparaît nulle part ».
    const lecture = kit.defineAdapter(definitionTemoin()).empreinte();
    const envoi = kit
      .defineAdapter(definitionTemoin({ tools: [outilTemoin({ effect: "send" })] }))
      .empreinte();

    console.info(
      `[garde épinglage] 2 empreinte(s) mesurée(s) sur un seul champ basculé · ` +
        `différentes = ${String(envoi !== lecture)}`,
    );
    expect(envoi).not.toBe(lecture);
  });

  it("ne porte AUCUN champ que le socle se réserve, ni le `handler`", () => {
    const manifeste = kit.defineAdapter(definitionTemoin()).manifeste();
    const cles = Object.keys(manifeste);

    // NEUF clés depuis l'ADR 0004 : le sceau de l'énumération de profils
    // (`profilesVersion`, `profilesSha`) entre dans le manifeste. Le compte est
    // écrit ici plutôt que dérivé À DESSEIN — c'est le seul endroit du dépôt où
    // un champ AJOUTÉ au manifeste fait rougir quelque chose, et un champ
    // ajouté au manifeste change TOUTES les empreintes épinglées.
    const interdits = ["trustTier", "maxDataClass", "endpoint", "authMode", "secretRef"];
    console.info(
      `[garde champs réservés] ${String(cles.length)} clé(s) au manifeste · ` +
        `${String(interdits.length)} nom(s) réservé(s) confronté(s) · ` +
        `${String(manifeste.tools.length)} outil(s) inspecté(s) pour « handler »`,
    );
    expect(cles).toHaveLength(9);
    expect(cles).toContain("profilesVersion");
    expect(cles).toContain("profilesSha");
    for (const interdit of ["trustTier", "maxDataClass", "endpoint", "authMode", "secretRef"]) {
      expect(cles).not.toContain(interdit);
    }
    for (const outil of manifeste.tools) {
      expect(Object.keys(outil)).not.toContain("handler");
    }
  });

  it("calcule `bytes` sans se compter lui-même", () => {
    const manifeste = kit.defineAdapter(definitionTemoin()).manifeste();
    const outil = manifeste.tools[0];
    expect(outil).toBeDefined();
    if (outil === undefined) return;

    const { bytes: _bytes, ...sansBytes } = outil;
    console.info(
      `[garde bytes] 1 outil mesuré · ${String(outil.bytes)} octet(s) sans le champ, ` +
        `${String(octetsCanoniques(outil as unknown as ValeurJson))} avec`,
    );
    expect(outil.bytes).toBe(octetsCanoniques(sansBytes as unknown as ValeurJson));
    // Le témoin de l'auto-référence : compter l'entrée AVEC son `bytes` donne
    // une autre valeur — c'est précisément ce qu'on a évité.
    expect(octetsCanoniques(outil as unknown as ValeurJson)).toBeGreaterThan(outil.bytes);
  });

  it("dérive le préfixe de l'id, et le nom complet du préfixe", () => {
    const cas: ReadonlyArray<readonly [string, string, string]> = [
      ["axionia", "inbox.recent", "axionia.inbox.recent"],
      ["zoho", "mail.send", "zoho.mail.send"],
    ];
    let mesures = 0;
    for (const [id, court, attendu] of cas) {
      expect(nomComplet(prefixeDe(id), court)).toBe(attendu);
      mesures += 1;
    }
    console.info(`[garde préfixe] ${String(mesures)} paire(s) mesurée(s)`);
    expect(mesures).toBe(2);
    expect(prefixeDe("axionia")).toBe("axionia");
    expect(nomComplet("axionia", "inbox.recent")).toBe("axionia.inbox.recent");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Les refus de construction — un par piège, sur témoin fabriqué
// ═════════════════════════════════════════════════════════════════════════════

describe("le manifeste refuse de se construire", () => {
  /**
   * ⚠️ ELLE ANNONCE SON COMPTE, ET C'EST LE POINT. Ces huit refus partageaient
   *    la même aide, et aucun n'annonçait rien : un vert y était indiscernable
   *    d'un vert obtenu sur zéro élément mesuré. `mesures` est le nombre
   *    d'outils que `analyserDefinition` a RÉELLEMENT confrontés — zéro
   *    signifierait que le refus vient d'ailleurs que de ce qu'on éprouve.
   */
  function anomaliesDe(definition: DefinitionAdaptateur<Profil>): readonly string[] {
    const { manifeste, verdict } = analyserDefinition(definition, PROFILS, SCEAU_TEMOIN);
    console.info(
      `[garde refus] ${String(verdict.mesures)} outil(s) mesuré(s) · ` +
        `${String(verdict.anomalies.length)} anomalie(s) levée(s)`,
    );
    expect(manifeste).toBeNull();
    expect(verdict.anomalies.length).toBeGreaterThan(0);
    return verdict.anomalies;
  }

  it("sur un `effect` absent — AUCUN défaut permissif n'est appliqué", () => {
    // Le témoin passe par `unknown` : un adaptateur d'un autre langage produit
    // sa définition sans compilateur TypeScript, et c'est ce cas-là qui compte.
    const sansEffect = { ...outilTemoin() } as Record<string, unknown>;
    delete sansEffect["effect"];

    const anomalies = anomaliesDe(
      definitionTemoin({ tools: [sansEffect as unknown as DefinitionOutil<Profil>] }),
    );

    expect(anomalies.some((a) => /effect/.test(a))).toBe(true);
    expect(anomalies.some((a) => /read/.test(a))).toBe(true);
  });

  it("sur un `dataClass` absent — le marquage de session du § 20 en dépend", () => {
    const sansClasse = { ...outilTemoin() } as Record<string, unknown>;
    delete sansClasse["dataClass"];

    const anomalies = anomaliesDe(
      definitionTemoin({ tools: [sansClasse as unknown as DefinitionOutil<Profil>] }),
    );

    expect(anomalies.some((a) => /dataClass/.test(a))).toBe(true);
  });

  it("sur un préfixe écrit à la main dans le nom d'un outil", () => {
    const anomalies = anomaliesDe(
      definitionTemoin({ tools: [outilTemoin({ name: "axionia.inbox.recent" })] }),
    );
    expect(anomalies.some((a) => /préfixe/.test(a))).toBe(true);
  });

  it("sur un schéma d'entrée OUVERT — un champ d'autorisation y passerait", () => {
    const anomalies = anomaliesDe(
      definitionTemoin({
        tools: [outilTemoin({ input: z.object({ limite: z.number() }) })],
      }),
    );
    expect(anomalies.some((a) => /OUVERT/.test(a))).toBe(true);
  });

  it("sur un champ de rang 2 OBLIGATOIRE au schéma de sortie (§ 13.3)", () => {
    const anomalies = anomaliesDe(
      definitionTemoin({
        tools: [
          outilTemoin({
            // `canal` redevient obligatoire : la charge compactée, dont le socle
            // l'aura retiré, ne validerait plus le schéma publié.
            output: z.object({ extrait: z.string(), canal: z.string() }).strict(),
          }),
        ],
      }),
    );
    expect(anomalies.some((a) => /rang 2/.test(a))).toBe(true);
  });

  it("sur un adaptateur FÉDÉRÉ qui déclare des secrets", () => {
    const anomalies = anomaliesDe(
      definitionTemoin({ mode: "fédéré", secrets: [{ name: "zoho.refresh" }] }),
    );
    expect(anomalies.some((a) => /fédéré/.test(a))).toBe(true);
  });

  it("sur un profil hors de l'énumération fermée", () => {
    const anomalies = anomaliesDe(
      definitionTemoin({ profiles: ["dev", "inconnu"] as unknown as readonly Profil[] }),
    );
    expect(anomalies.some((a) => /énumération fermée/.test(a))).toBe(true);
  });

  it("sur deux outils de même nom complet", () => {
    const anomalies = anomaliesDe(definitionTemoin({ tools: [outilTemoin(), outilTemoin()] }));
    expect(anomalies.some((a) => /double/.test(a))).toBe(true);
  });

  it("et `construireManifeste` LÈVE plutôt que de produire un document faux", () => {
    let leve = false;
    try {
      kit.defineAdapter(definitionTemoin({ tools: [] })).manifeste();
    } catch (erreur: unknown) {
      leve = erreur instanceof ErreurManifeste;
    }
    console.info(`[garde levée] 1 définition vide mesurée · levée = ${String(leve)}`);
    expect(() => kit.defineAdapter(definitionTemoin({ tools: [] })).manifeste()).toThrow(
      ErreurManifeste,
    );
  });

  it("le compte mesuré vaut le nombre d'outils, et le plancher interdit le zéro", () => {
    const { verdict } = analyserDefinition(definitionTemoin(), PROFILS, SCEAU_TEMOIN);
    console.info(
      `[garde plancher] ${String(verdict.mesures)} outil(s) mesuré(s) · ` +
        `plancher ${String(verdict.plancher)}`,
    );
    expect(verdict.mesures).toBe(1);
    expect(verdict.plancher).toBe(1);

    const vide = analyserDefinition(definitionTemoin({ tools: [] }), PROFILS, SCEAU_TEMOIN);
    expect(vide.verdict.mesures).toBe(0);
    expect(vide.verdict.anomalies.length).toBeGreaterThan(0);
  });
});

describe("le kit ferme l'énumération des profils", () => {
  it("refuse d'exister sans profils — sinon la garde du § 14 ne ferme rien", () => {
    console.info(`[garde profils] ${String(PROFILS.length)} profil(s) au kit réel, 0 au témoin`);
    expect(() => creerAdapterKit([], SCEAU_TEMOIN)).toThrow(/vide/);
  });

  it("expose l'énumération reçue, sans en garder de copie propre", () => {
    console.info(
      `[garde énumération] ${String(kit.profilsConnus.length)} profil(s) exposé(s) · ` +
        `même référence = ${String(kit.profilsConnus === PROFILS)}`,
    );
    expect(kit.profilsConnus).toBe(PROFILS);
  });
});
