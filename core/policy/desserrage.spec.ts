import { describe, expect, it } from "vitest";

import type { OpsScope } from "../types.js";
import { DepotPolitiqueMemoire } from "./depot.js";
import {
  classerChangement,
  desserrer,
  niveauPourEcran,
  resserrer,
  SCOPE_DESSERRAGE,
  TTL_DESSERRAGE_MAX_MS,
  type ContexteDesserrage,
  type DemandeChangement,
  type DependancesDesserrage,
} from "./desserrage.js";
import { ligneDeDemarrage } from "./ligne.js";
import { niveauApplique } from "./niveau.js";
import {
  codeTotp,
  decoderBase32,
  DepotPasTotpMemoire,
  pasTotp,
  SecondFacteurTotp,
  type FournisseurSecretTotp,
  type SecondFacteur,
} from "./second-facteur.js";
import type { ReferenceOutil } from "./scope.js";

/**
 * Gardes de l'asymétrie (§ 20, protection 1) : resserrer est toujours libre,
 * desserrer ne l'est jamais.
 */

const T0 = new Date("2026-08-30T12:00:00.000Z");
const OUTIL: ReferenceOutil = { adapterId: "zoho.mail", tool: "send" };
/** Vecteur d'essai PUBLIÉ de la RFC 6238. Aucun secret réel dans ce dépôt. */
const GRAINE_RFC6238 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const SCOPES_CONSOLE: readonly OpsScope[] = ["ops:admin", SCOPE_DESSERRAGE];

const secrets: FournisseurSecretTotp = { secretPour: () => Promise.resolve(GRAINE_RFC6238) };

function codeValide(maintenant: Date): string {
  const secret = decoderBase32(GRAINE_RFC6238);
  if (secret === null) throw new Error("graine de garde illisible");
  return codeTotp(secret, pasTotp(maintenant));
}

function facteur(): SecondFacteur {
  return new SecondFacteurTotp({ secrets, pas: new DepotPasTotpMemoire() });
}

/** Un socle qui vient de démarrer : une seule ligne, `boot`, `*`, `brouillon`. */
function socleAuDemarrage(): DepotPolitiqueMemoire {
  return new DepotPolitiqueMemoire([ligneDeDemarrage(T0, "démarrage du socle", "boot-1")]);
}

function demande(partiel: Partial<DemandeChangement> = {}): DemandeChangement {
  return {
    id: "ligne-1",
    level: "confirmé",
    scope: "*",
    channel: "console",
    expiresAt: new Date(T0.getTime() + 3_600_000),
    setBy: "will",
    reason: "garde de chantier",
    maintenant: T0,
    ...partiel,
  };
}

function contexte(maintenant = T0, partiel: Partial<ContexteDesserrage> = {}): ContexteDesserrage {
  return {
    principal: "will",
    scopes: SCOPES_CONSOLE,
    code: codeValide(maintenant),
    ...partiel,
  };
}

function deps(depot: DepotPolitiqueMemoire): DependancesDesserrage {
  return { depot, secondFacteur: facteur() };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LE TRI EST CALCULÉ, PAS DÉCLARÉ
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/desserrage — resserrage ou desserrage ?", () => {
  it("rougit sur un témoin qui croirait l'appelant sur parole", () => {
    // Témoin : un champ `genre` fourni par l'appelant. Un appelant qui se
    // trompe — ou qui ment — desserrerait par le chemin libre.
    const declare = "resserrage";
    const calcule = classerChangement(
      [ligneDeDemarrage(T0, "démarrage", "boot-1")],
      "*",
      "libre",
      T0,
    ).genre;

    expect(declare).toBe("resserrage");
    expect(calcule).toBe("desserrage");
  });

  it("classe les neuf transitions de niveau, plancher par plancher", () => {
    // Produit cartésien : pour chaque plancher en vigueur, chaque niveau
    // demandé. L'égalité est un resserrage — elle n'ouvre rien.
    const niveaux = ["brouillon", "confirmé", "libre"] as const;
    let mesures = 0;
    const comptes = { resserrage: 0, desserrage: 0 };

    for (const plancher of niveaux) {
      for (const demande_ of niveaux) {
        const lignes = [
          {
            id: "en-vigueur",
            level: plancher,
            scope: "*",
            channel: "console",
            expiresAt: plancher === "libre" ? new Date(T0.getTime() + 3_600_000) : null,
            supersededAt: null,
            setBy: "will",
            setAt: T0,
            reason: "plancher",
          },
        ];
        const genre = classerChangement(lignes, "*", demande_, T0).genre;
        const attendu =
          niveaux.indexOf(demande_) > niveaux.indexOf(plancher) ? "desserrage" : "resserrage";
        expect(genre, `${plancher} → ${demande_}`).toBe(attendu);
        comptes[genre] += 1;
        mesures += 1;
      }
    }

    console.info(
      `[garde tri] ${String(mesures)} transitions mesurées — ` +
        `${String(comptes.resserrage)} resserrages, ${String(comptes.desserrage)} desserrages`,
    );

    expect(mesures).toBe(9);
    expect(comptes.desserrage).toBe(3);
    expect(comptes.resserrage).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — RESSERRER EST TOUJOURS LIBRE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/desserrage — resserrer", () => {
  it("aboutit sans second facteur, sans scope de jeton, depuis n'importe quel canal", async () => {
    // On part d'un socle desserré, pour que le resserrage ait quelque chose à
    // resserrer.
    const depot = new DepotPolitiqueMemoire([
      {
        id: "desserre",
        level: "libre",
        scope: "*",
        channel: "console",
        expiresAt: new Date(T0.getTime() + 3_600_000),
        supersededAt: null,
        setBy: "will",
        setAt: T0,
        reason: "desserrage antérieur",
      },
    ]);

    const avant = niveauApplique(await depot.lignes(), OUTIL, T0).niveau;
    const resultat = await resserrer(
      // Canal `mcp` : « exécuté immédiatement d'où que ça vienne » (§ 20).
      demande({ id: "resserrage-1", level: "brouillon", channel: "mcp", expiresAt: null }),
      depot,
    );
    const apres = niveauApplique(await depot.lignes(), OUTIL, T0).niveau;

    console.info(
      `[garde resserrage] « ${avant} » → « ${apres} », sans second facteur, canal « mcp »`,
    );

    expect(resultat.applique).toBe(true);
    if (resultat.applique) {
      expect(resultat.genre).toBe("resserrage");
      expect(resultat.niveauApres).toBe("brouillon");
    }
    expect(avant).toBe("libre");
    expect(apres).toBe("brouillon");
  });

  it("refuse un ÉLARGISSEMENT déguisé en resserrage", async () => {
    const depot = socleAuDemarrage();
    const resultat = await resserrer(demande({ level: "libre" }), depot);

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) {
      console.info(`[garde resserrage/refus] motif : ${resultat.motif}`);
      expect(resultat.motif).toBe("pas-un-resserrage");
      expect(resultat.message).toContain("desserrer");
    }
  });

  it("refuse un resserrage qui lèverait une ligne, ou qui EXPIRERAIT", async () => {
    const depot = socleAuDemarrage();

    const leve = await resserrer(
      demande({ level: "brouillon", expiresAt: null, supersederIds: ["boot-1"] }),
      depot,
    );
    const expirant = await resserrer(demande({ level: "brouillon" }), depot);

    console.info(
      `[garde resserrage/bornes] 2 demandes mesurées — ` +
        `${leve.applique ? "?" : leve.motif}, ${expirant.applique ? "?" : expirant.motif}`,
    );

    expect(leve.applique).toBe(false);
    if (!leve.applique) expect(leve.motif).toBe("supersession-interdite");
    // Un resserrage qui expire est un desserrage à retardement, sans facteur.
    expect(expirant.applique).toBe(false);
    if (!expirant.applique) expect(expirant.motif).toBe("ttl-interdit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — DESSERRER N'EST JAMAIS LIBRE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/desserrage — desserrer", () => {
  it("ABOUTIT avec un second facteur valide, et porte un TTL NON NUL", async () => {
    const depot = socleAuDemarrage();
    const expiration = new Date(T0.getTime() + 3_600_000);

    const avant = niveauApplique(await depot.lignes(), OUTIL, T0);
    const resultat = await desserrer(
      demande({ id: "desserrage-1", level: "confirmé", scope: "*", expiresAt: expiration }),
      contexte(),
      deps(depot),
    );

    expect(resultat.applique).toBe(true);
    if (!resultat.applique) return;

    const apres = niveauApplique(await depot.lignes(), OUTIL, T0);
    const ttlMs = (resultat.ligne.expiresAt?.getTime() ?? 0) - T0.getTime();

    console.info(
      `[garde desserrage] ${String(avant.mesures)} → ${String(apres.mesures)} lignes mesurées — ` +
        `niveau « ${avant.niveau} » → « ${apres.niveau} », ` +
        `TTL ${String(ttlMs)} ms (${String(ttlMs / 60_000)} min), échéance ${resultat.ligne.expiresAt?.toISOString() ?? "—"}`,
    );

    expect(resultat.genre).toBe("desserrage");
    expect(resultat.niveauAvant).toBe("brouillon");
    expect(resultat.niveauApres).toBe("confirmé");
    expect(apres.niveau).toBe("confirmé");
    // LE TTL EST NON NUL, et il est affiché ci-dessus.
    expect(resultat.ligne.expiresAt).not.toBeNull();
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBe(3_600_000);

    // Et il expire pour de bon : le même dépôt, une seconde après l'échéance.
    const apresEcheance = niveauApplique(
      await depot.lignes(),
      OUTIL,
      new Date(expiration.getTime() + 1000),
    );
    expect(apresEcheance.niveau).toBe("brouillon");
  });

  it("ÉCHOUE sans second facteur — code vide, code faux, code rejoué", async () => {
    const cas: ReadonlyArray<readonly [string, string]> = [
      ["code vide", ""],
      ["code faux", "000000"],
      ["code d'un autre pas", codeValide(new Date(T0.getTime() + 10 * 60_000))],
    ];

    let refus = 0;
    for (const [libelle, code] of cas) {
      const depot = socleAuDemarrage();
      const resultat = await desserrer(
        demande({ level: "confirmé" }),
        contexte(T0, { code }),
        deps(depot),
      );

      expect(resultat.applique, libelle).toBe(false);
      if (!resultat.applique) {
        expect(resultat.motif).toBe("second-facteur-refuse");
      }
      // ET RIEN N'A ÉTÉ ÉCRIT : un refus qui laisserait la ligne serait un
      // desserrage réussi déguisé en échec.
      expect(niveauApplique(await depot.lignes(), OUTIL, T0).niveau, libelle).toBe("brouillon");
      refus += 1;
    }

    console.info(`[garde desserrage sans facteur] ${String(refus)} tentatives refusées`);
    expect(refus).toBe(3);
  });

  it("refuse un jeton qui ne porte pas `ops:policy` — celui du connecteur", async () => {
    const depot = socleAuDemarrage();
    const resultat = await desserrer(
      demande({ level: "confirmé" }),
      contexte(T0, { scopes: ["ops:read", "ops:draft", "ops:send", "ops:admin"] }),
      deps(depot),
    );

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) {
      console.info(`[garde scope de jeton] motif : ${resultat.motif}`);
      expect(resultat.motif).toBe("scope-jeton-manquant");
    }
  });

  it("refuse un desserrage arrivé par `mcp` ou par la voix — aucun outil MCP", async () => {
    let refus = 0;
    for (const canal of ["mcp", "voix", "stdio"] as const) {
      const depot = socleAuDemarrage();
      const resultat = await desserrer(
        demande({ level: "confirmé", channel: canal }),
        contexte(),
        deps(depot),
      );
      expect(resultat.applique, canal).toBe(false);
      if (!resultat.applique) expect(resultat.motif).toBe("canal-interdit");
      refus += 1;
    }

    console.info(`[garde canal de desserrage] ${String(refus)} canaux refusés`);
    expect(refus).toBe(3);
  });

  it("refuse un TTL absent, passé, ou au-delà de la borne haute", async () => {
    const cas: ReadonlyArray<readonly [string, Date | null]> = [
      ["ttl-manquant", null],
      ["ttl-passe", new Date(T0.getTime() - 1)],
      ["ttl-passe", T0],
      ["ttl-trop-long", new Date(T0.getTime() + TTL_DESSERRAGE_MAX_MS + 1)],
    ];

    let mesures = 0;
    for (const [motifAttendu, expiresAt] of cas) {
      const depot = socleAuDemarrage();
      const resultat = await desserrer(
        demande({ level: "confirmé", expiresAt }),
        contexte(),
        deps(depot),
      );
      expect(resultat.applique, motifAttendu).toBe(false);
      if (!resultat.applique) expect(resultat.motif).toBe(motifAttendu);
      mesures += 1;
    }

    console.info(
      `[garde TTL de desserrage] ${String(mesures)} durées refusées, borne haute ${String(TTL_DESSERRAGE_MAX_MS)} ms`,
    );
    expect(mesures).toBe(4);
  });

  it("refuse un desserrage SANS EFFET, et NOMME les lignes à lever", async () => {
    // Le piège du « plus strict gagne » : desserrer un outil pendant qu'un
    // plancher global tient. La ligne s'écrirait, l'écran la montrerait comme
    // courante, et rien ne changerait.
    const depot = socleAuDemarrage();
    const resultat = await desserrer(
      demande({ id: "etroit", level: "libre", scope: "zoho.mail.send" }),
      contexte(),
      deps(depot),
    );

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) {
      console.info(
        `[garde desserrage sans effet] motif : ${resultat.motif}, ` +
          `${String(resultat.bloquantes.length)} ligne(s) bloquante(s) : ` +
          resultat.bloquantes.map((l) => `${l.id} (${l.scope} → ${l.level})`).join(", "),
      );
      expect(resultat.motif).toBe("desserrage-sans-effet");
      expect(resultat.bloquantes.map((l) => l.id)).toEqual(["boot-1"]);
    }

    // Rien n'a été écrit.
    expect(niveauApplique(await depot.lignes(), OUTIL, T0).mesures).toBe(1);
  });

  it("aboutit quand les lignes bloquantes sont NOMMÉES — jamais levées d'office", async () => {
    const depot = socleAuDemarrage();
    const resultat = await desserrer(
      demande({
        id: "etroit",
        level: "libre",
        scope: "zoho.mail.send",
        supersederIds: ["boot-1"],
      }),
      contexte(),
      deps(depot),
    );

    expect(resultat.applique).toBe(true);
    if (!resultat.applique) return;

    const surCetOutil = niveauApplique(await depot.lignes(), OUTIL, T0);
    // Un AUTRE outil, non couvert : il retombe au repli fail-closed, pas au
    // niveau desserré. Lever le plancher global n'ouvre rien ailleurs.
    const ailleurs = niveauApplique(
      await depot.lignes(),
      { adapterId: "zoho.calendar", tool: "poser" },
      T0,
    );

    console.info(
      `[garde levée nommée] outil visé → « ${surCetOutil.niveau} », ` +
        `outil voisin → « ${ailleurs.niveau} » (${String(ailleurs.retenues.length)} ligne(s) couvrante(s))`,
    );

    expect(surCetOutil.niveau).toBe("libre");
    expect(ailleurs.niveau).toBe("brouillon");
    expect(ailleurs.retenues).toHaveLength(0);
  });

  it("refuse de lever une ligne qui ne domine pas le scope visé", async () => {
    const depot = new DepotPolitiqueMemoire([
      ligneDeDemarrage(T0, "démarrage", "boot-1"),
      {
        id: "voisine",
        level: "brouillon",
        scope: "zoho.calendar.poser",
        channel: "console",
        expiresAt: null,
        supersededAt: null,
        setBy: "will",
        setAt: T0,
        reason: "voisine",
      },
    ]);

    const resultat = await desserrer(
      demande({
        id: "etroit",
        level: "libre",
        scope: "zoho.mail.send",
        supersederIds: ["voisine"],
      }),
      contexte(),
      deps(depot),
    );

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) {
      console.info(`[garde levée abusive] motif : ${resultat.motif}`);
      expect(resultat.motif).toBe("supersession-interdite");
    }
  });

  it("refuse un resserrage passé par le chemin du desserrage", async () => {
    const depot = socleAuDemarrage();
    const resultat = await desserrer(demande({ level: "brouillon" }), contexte(), deps(depot));

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) {
      expect(resultat.motif).toBe("pas-un-desserrage");
      expect(resultat.message).toContain("resserrer");
    }
  });

  it("remplace d'office la ligne de MÊME scope, sans qu'on la nomme", async () => {
    const depot = socleAuDemarrage();
    const premier = await desserrer(
      demande({ id: "d1", level: "confirmé", scope: "*" }),
      contexte(),
      deps(depot),
    );
    expect(premier.applique).toBe(true);

    const lignes = await depot.lignes();
    const boot = lignes.find((l) => l.id === "boot-1");

    console.info(
      `[garde remplacement] ${String(lignes.length)} lignes en table, ` +
        `« boot-1 » remplacée : ${String(boot?.supersededAt !== null && boot?.supersededAt !== undefined)}`,
    );

    expect(lignes).toHaveLength(2);
    expect(boot?.supersededAt).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — L'ÉCRAN DÉRIVE DU MÊME CALCUL
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/desserrage — l'écran dérive du même calcul (§ 20)", () => {
  it("rend exactement ce que la chaîne d'appel rendrait, au même instant", async () => {
    const depot = socleAuDemarrage();
    await desserrer(demande({ id: "d1", level: "confirmé" }), contexte(), deps(depot));

    const instants = [T0, new Date(T0.getTime() + 3_599_999), new Date(T0.getTime() + 3_600_001)];
    let mesures = 0;
    const vus: string[] = [];

    for (const instant of instants) {
      const ecran = await niveauPourEcran(depot, OUTIL, instant);
      const chaine = niveauApplique(await depot.lignes(), OUTIL, instant);
      expect(ecran.niveau, instant.toISOString()).toBe(chaine.niveau);
      expect(ecran.raison).toBe(chaine.raison);
      vus.push(ecran.niveau);
      mesures += 1;
    }

    console.info(`[garde écran] ${String(mesures)} instants mesurés → ${vus.join(" → ")}`);

    expect(mesures).toBe(3);
    expect(vus).toEqual(["confirmé", "confirmé", "brouillon"]);
  });
});
