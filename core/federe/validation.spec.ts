import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { OutilDuCatalogue } from "../chaine/etapes.js";
import { creerValidateurFedere, ErreurSchemaIllisible } from "./validation.js";

/**
 * `core/federe/validation.spec.ts` — L'ÉTAPE 8 SUR UN MANIFESTE RÉEL.
 *
 * Ce fichier ne fabrique pas ses schémas : il lit le manifeste VERSIONNÉ
 * d'Axion-IA quand il est présent sur la machine, et confronte le validateur à
 * ses sept outils tels que le socle les épinglera. Si le fichier manque (CI du
 * socle seul), il retombe sur un schéma témoin de même forme — et le DIT.
 *
 * 🔑 Le témoin qui compte : un nom réservé au contexte (`peutVoirAppels`) glissé
 *    dans l'entrée doit être refusé sur CHAQUE outil. C'est le contrôle 7 du
 *    § 09, la raison d'être de ce port.
 */

const CHEMIN_MANIFESTE =
  "C:/Users/willi/Documents/Projets/Axion-IA/wt-mcp-lot4a/src/server/mcp/manifeste.json";

interface OutilDuManifeste {
  readonly name: string;
  readonly inputSchema: unknown;
}

const SCHEMA_TEMOIN = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    limite: { type: "integer", minimum: 1, maximum: 30 },
    canal: { type: "string", enum: ["appel", "message"] },
    jour: { type: "string", format: "date" },
  },
  additionalProperties: false,
};

/**
 * Un SECOND schéma témoin, distinct du premier ET de tout schéma du manifeste :
 * le test du cache a besoin d'un schéma qui n'a encore jamais été compilé.
 * ⚠️ Mesuré le 2026-09-02 (run 33624158133) : quand le manifeste est absent,
 *    l'outil de repli porte déjà `SCHEMA_TEMOIN` — réutiliser ce même schéma
 *    pour prouver « une compilation de plus » comptait 1 là où le test attendait
 *    2. Vert sur la machine qui a le manifeste, rouge en CI : le test mesurait
 *    sa propre installation.
 */
const SCHEMA_TEMOIN_BIS = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { page: { type: "integer", minimum: 1 } },
  additionalProperties: false,
};

/** `SOCLE_SANS_MANIFESTE=1` force le repli, pour mesurer les DEUX branches ici. */
function outilsSousTest(): { outils: OutilDuCatalogue[]; source: string } {
  if (process.env["SOCLE_SANS_MANIFESTE"] !== "1" && existsSync(CHEMIN_MANIFESTE)) {
    const brut = JSON.parse(readFileSync(CHEMIN_MANIFESTE, "utf8")) as {
      manifeste: { tools: OutilDuManifeste[] };
    };
    return {
      source: "manifeste réel d'Axion-IA",
      outils: brut.manifeste.tools.map((t) => outil(t.name, t.inputSchema)),
    };
  }
  return {
    source: "schéma témoin (manifeste absent de cette machine)",
    outils: [outil("temoin.lecture", SCHEMA_TEMOIN)],
  };
}

function outil(name: string, inputSchema: unknown): OutilDuCatalogue {
  return {
    adapterId: "axionia",
    adapterVersion: "1.0.0",
    idempotency: "n/a",
    limit: null,
    warnAt: null,
    name,
    inputSchema,
    effect: "read",
    dataClass: "personal",
    pagination: "page",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 20_480,
    idFields: [],
  } as unknown as OutilDuCatalogue;
}

/** Une entrée valide par outil du manifeste réel ; `{}` pour les autres. */
const ENTREE_VALIDE: Record<string, unknown> = {
  "inbox.recent": { limite: 5 },
  "agenda.jour": { jour: "2026-09-02" },
  "agenda.semaine": { depuis: "2026-09-02" },
  "rendezvous.list": { statut: "scheduled", page: 1 },
  "pilotage.alertes": { annee: 2026, mois: 9 },
  "qualiopi.conformite": { niveau: "important" },
  "deploiement.etat": {},
  "temoin.lecture": { limite: 5, canal: "appel", jour: "2026-09-02" },
};

describe("l'étape 8 sur les schémas ÉPINGLÉS", () => {
  const { outils, source } = outilsSousTest();
  const validateur = creerValidateurFedere();

  it("compile chaque schéma et accepte une entrée valide — et annonce sa source", () => {
    let acceptes = 0;
    for (const o of outils) {
      const v = validateur.valider(o, ENTREE_VALIDE[o.name] ?? {});
      expect(v.resultat.ok, `${o.name} : entrée valide refusée`).toBe(true);
      expect(v.erreursRelevees, o.name).toBe(0);
      acceptes += 1;
    }
    console.info(
      `[validation] source : ${source} · ${String(acceptes)} schéma(s) compilé(s), ${String(acceptes)} entrée(s) valide(s) acceptée(s)`,
    );
    expect(acceptes).toBe(outils.length);
    expect(outils.length).toBeGreaterThanOrEqual(1);
  });

  it("🔑 refuse un nom réservé au contexte glissé dans l'entrée, sur CHAQUE outil", () => {
    let refuses = 0;
    for (const o of outils) {
      const v = validateur.valider(o, {
        ...(ENTREE_VALIDE[o.name] as object),
        peutVoirAppels: true,
      });
      expect(v.resultat.ok, `${o.name} : un champ d'autorisation est PASSÉ`).toBe(false);
      if (!v.resultat.ok) {
        expect(v.resultat.champ).toBe("peutVoirAppels");
        expect(v.resultat.attendu).toMatch(/hors du schéma/);
      }
      refuses += 1;
    }
    console.info(
      `[validation] ${String(refuses)} champ(s) d'autorisation refusé(s) sur ${String(outils.length)}`,
    );
    expect(refuses).toBe(outils.length);
  });

  it("refuse une clé inconnue, en la NOMMANT, et compte les erreurs", () => {
    const o = outils[0]!;
    const v = validateur.valider(o, { ...(ENTREE_VALIDE[o.name] as object), zzz: 1, yyy: 2 });
    expect(v.resultat.ok).toBe(false);
    if (!v.resultat.ok) expect(["zzz", "yyy"]).toContain(v.resultat.champ);
    // `allErrors` : DEUX clés inconnues font DEUX erreurs, pas une.
    expect(v.erreursRelevees).toBe(2);
  });

  it("mémorise les compilations par EMPREINTE de schéma, pas par nom", () => {
    const avant = validateur.schemasCompiles();
    const o = outils[0]!;
    validateur.valider(o, {});
    validateur.valider(o, {});
    expect(validateur.schemasCompiles()).toBe(avant);
    // Même nom, AUTRE schéma : une compilation de plus — un cache par nom aurait
    // servi l'ancien schéma au nouveau. Le schéma doit être RÉELLEMENT autre :
    // on le vérifie, sinon ce test recompte une compilation déjà faite.
    expect(JSON.stringify(o.inputSchema)).not.toBe(JSON.stringify(SCHEMA_TEMOIN_BIS));
    validateur.valider(outil(o.name, SCHEMA_TEMOIN_BIS), { page: 1 });
    expect(validateur.schemasCompiles()).toBe(avant + 1);
    console.info(`[validation] ${String(validateur.schemasCompiles())} schéma(s) en cache`);
  });
});

describe("les refus qui doivent dire quoi corriger (§ 15)", () => {
  const validateur = creerValidateurFedere();
  const o = outil("temoin.lecture", SCHEMA_TEMOIN);

  it("type, borne, énumération, format — chacun nomme le champ et l'attendu", () => {
    const cas: readonly [string, unknown, string, RegExp][] = [
      ["type", { limite: "5" }, "limite", /integer/],
      ["borne", { limite: 99 }, "limite", /<= 30/],
      ["énumération", { canal: "fax" }, "canal", /appel, message/],
      ["format", { jour: "hier" }, "jour", /format date/],
    ];
    for (const [nom, entree, champ, attendu] of cas) {
      const v = validateur.valider(o, entree);
      expect(v.resultat.ok, nom).toBe(false);
      if (!v.resultat.ok) {
        expect(v.resultat.champ, nom).toBe(champ);
        expect(v.resultat.attendu, nom).toMatch(attendu);
      }
    }
    console.info(`[validation] ${String(cas.length)} refus traduits en (champ, attendu)`);
  });

  it("ne coerce JAMAIS : « 5 » n'est pas 5", () => {
    expect(validateur.valider(o, { limite: "5" }).resultat.ok).toBe(false);
  });
});

describe("un schéma incompilable est un défaut du MANIFESTE, pas de l'entrée", () => {
  it("lève ErreurSchemaIllisible, en nommant l'outil — jamais un invalid_input", () => {
    const validateur = creerValidateurFedere();
    // `strict: true` : un mot-clé inconnu est refusé à la compilation.
    const casse = outil("temoin.casse", { type: "object", motCleInvente: true });
    expect(() => validateur.valider(casse, {})).toThrow(ErreurSchemaIllisible);
    try {
      validateur.valider(casse, {});
    } catch (e) {
      expect((e as ErreurSchemaIllisible).nomComplet).toBe("axionia.temoin.casse");
      expect((e as Error).message).toMatch(/admission/);
    }
  });
});
