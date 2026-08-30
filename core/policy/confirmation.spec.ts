import { describe, expect, it } from "vitest";

import {
  CANAUX,
  canalDelivreUneConfirmation,
  canauxDeConfirmation,
  DepotJetonsConfirmationMemoire,
  emettreConfirmation,
  empreinteJeton,
  TTL_CONFIRMATION_MAX_MS,
  verifierEtConsommer,
  type DependancesConfirmation,
} from "./confirmation.js";

/**
 * Gardes du jeton de confirmation (§ 20, précision 1).
 *
 * Quatre propriétés à tenir : USAGE UNIQUE · COURTE DURÉE · LIÉ À L'`argHash`
 * DE L'APPEL EXACT · DÉLIVRÉ SUR UN CANAL HUMAIN.
 */

const T0 = new Date("2026-08-30T12:00:00.000Z");
/** Sel de garde, fabriqué ici. AUCUN SECRET RÉEL dans ce dépôt. */
const SEL_DE_GARDE = "sel-fabrique-pour-les-gardes-jamais-en-production";

function deps(): DependancesConfirmation {
  return { depot: new DepotJetonsConfirmationMemoire(), sel: SEL_DE_GARDE };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LE CANAL
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/confirmation — le canal humain", () => {
  it("rougit sur un témoin qui accepterait tous les canaux", () => {
    const temoin = (): boolean => true;
    expect(temoin()).toBe(true);
    expect(canalDelivreUneConfirmation("mcp")).toBe(false);
  });

  it("classe les cinq canaux, et n'en retient qu'un — la console", () => {
    let mesures = 0;
    for (const canal of CANAUX) {
      expect(typeof canalDelivreUneConfirmation(canal), canal).toBe("boolean");
      mesures += 1;
    }

    const retenus = canauxDeConfirmation();

    console.info(
      `[garde canaux] ${String(mesures)} canaux mesurés, ${String(retenus.length)} retenu(s) : ${retenus.join(", ")}`,
    );

    expect(mesures).toBe(CANAUX.length);
    expect(mesures).toBeGreaterThanOrEqual(5);
    expect(retenus).toEqual(["console"]);
    // § 20, nommément : la voie B du § 30 contournerait le niveau `confirmé` par
    // construction si le démon vocal pouvait confirmer.
    expect(canalDelivreUneConfirmation("voix")).toBe(false);
    expect(canalDelivreUneConfirmation("mcp")).toBe(false);
  });

  it("refuse d'émettre un jeton sur un canal non humain", async () => {
    let refus = 0;
    for (const canal of CANAUX.filter((c) => !canalDelivreUneConfirmation(c))) {
      const resultat = await emettreConfirmation(
        {
          tool: "zoho.mail.send",
          argHash: "hmac-1",
          principal: "will",
          canal,
          maintenant: T0,
        },
        deps(),
      );
      expect(resultat.emis, canal).toBe(false);
      refus += 1;
    }

    console.info(`[garde émission] ${String(refus)} canaux non humains refusés`);
    expect(refus).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LA COURTE DURÉE, ET SA BORNE HAUTE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/confirmation — courte durée", () => {
  it("refuse une durée nulle, négative, ou au-delà de la borne haute", async () => {
    const cas: ReadonlyArray<readonly [number, boolean]> = [
      [-1, false],
      [0, false],
      [1_000, true],
      [TTL_CONFIRMATION_MAX_MS, true],
      [TTL_CONFIRMATION_MAX_MS + 1, false],
      [365 * 24 * 3_600_000, false],
    ];

    let mesures = 0;
    for (const [ttlMs, attendu] of cas) {
      const resultat = await emettreConfirmation(
        {
          tool: "zoho.mail.send",
          argHash: "hmac-1",
          principal: "will",
          canal: "console",
          maintenant: T0,
          ttlMs,
        },
        deps(),
      );
      expect(resultat.emis, `${String(ttlMs)} ms`).toBe(attendu);
      mesures += 1;
    }

    console.info(
      `[garde durée] ${String(mesures)} durées mesurées, borne haute ${String(TTL_CONFIRMATION_MAX_MS)} ms`,
    );
    expect(mesures).toBe(cas.length);
  });

  it("refuse un jeton présenté APRÈS son expiration", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-1",
        principal: "will",
        canal: "console",
        maintenant: T0,
        ttlMs: 60_000,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const apres = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-1",
        principal: "will",
        maintenant: new Date(T0.getTime() + 60_001),
      },
      d,
    );

    expect(apres.valide).toBe(false);
    if (!apres.valide) {
      console.info(`[garde expiration] motif : ${apres.motif}`);
      expect(apres.motif).toBe("expire");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LIÉ À L'`argHash` DE L'APPEL EXACT
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/confirmation — la liaison à l'appel exact", () => {
  it("rougit sur un témoin qui ne vérifierait que l'existence du jeton", async () => {
    // Le témoin est le défaut que le § 20 corrige : « un second appel portant un
    // drapeau est indiscernable d'un premier ». Ici, le drapeau, c'est « le
    // jeton existe ».
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-DESTINATAIRE-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const temoinExistence = (await d.depot.lire(emission.jeton.jti)) !== null;

    const vrai = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-DESTINATAIRE-B",
        principal: "will",
        maintenant: T0,
      },
      d,
    );

    expect(temoinExistence).toBe(true); // le témoin dirait « valide »
    expect(vrai.valide).toBe(false); // la vraie règle refuse
  });

  it("refuse un jeton lié à un AUTRE argHash — et le laisse intact", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const refuse = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-B",
        principal: "will",
        maintenant: T0,
      },
      d,
    );

    expect(refuse.valide).toBe(false);
    if (!refuse.valide) {
      console.info(`[garde argHash] motif : ${refuse.motif}`);
      expect(refuse.motif).toBe("arghash-different");
    }

    // ET IL RESTE UTILISABLE POUR SON PROPRE APPEL. Consommer avant de vérifier
    // la liaison brûlerait un jeton légitime à un appel de distance : un déni de
    // service gratuit.
    const bon = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        maintenant: T0,
      },
      d,
    );
    expect(bon.valide).toBe(true);
  });

  it("refuse aussi un autre outil et un autre principal", async () => {
    const cas: ReadonlyArray<readonly [string, string, string, string]> = [
      ["outil-different", "zoho.calendar.poser", "hmac-A", "will"],
      ["principal-different", "zoho.mail.send", "hmac-A", "quelqu-un-dautre"],
    ];

    let mesures = 0;
    for (const [motifAttendu, tool, argHash, principal] of cas) {
      const d = deps();
      const emission = await emettreConfirmation(
        {
          tool: "zoho.mail.send",
          argHash: "hmac-A",
          principal: "will",
          canal: "console",
          maintenant: T0,
        },
        d,
      );
      if (!emission.emis) continue;

      const refuse = await verifierEtConsommer(
        { presente: emission.valeur, tool, argHash, principal, maintenant: T0 },
        d,
      );
      expect(refuse.valide, motifAttendu).toBe(false);
      if (!refuse.valide) {
        expect(refuse.motif).toBe(motifAttendu);
      }
      mesures += 1;
    }

    console.info(`[garde liaison] ${String(mesures)} liaisons mesurées`);
    expect(mesures).toBe(cas.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — USAGE UNIQUE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/confirmation — usage unique", () => {
  it("rougit sur un témoin qui vérifierait sans consommer", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    // Témoin : « le jeton existe et n'est pas expiré » — deux fois vrai.
    const temoin = async (): Promise<boolean> => {
      const stocke = await d.depot.lire(emission.jeton.jti);
      return stocke !== null && stocke.expireA.getTime() > T0.getTime();
    };

    expect(await temoin()).toBe(true);
    expect(await temoin()).toBe(true); // le témoin laisse passer le rejeu

    const premier = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        maintenant: T0,
      },
      d,
    );
    const second = await verifierEtConsommer(
      {
        presente: emission.valeur,
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        maintenant: T0,
      },
      d,
    );

    expect(premier.valide).toBe(true);
    expect(second.valide).toBe(false);
  });

  it("refuse le REJEU : un jeton consommé ne vaut plus rien", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const essais = [];
    for (let n = 0; n < 3; n += 1) {
      essais.push(
        await verifierEtConsommer(
          {
            presente: emission.valeur,
            tool: "zoho.mail.send",
            argHash: "hmac-A",
            principal: "will",
            maintenant: T0,
          },
          d,
        ),
      );
    }

    const acceptes = essais.filter((essai) => essai.valide).length;

    console.info(
      `[garde usage unique] ${String(essais.length)} présentations mesurées, ${String(acceptes)} acceptée(s) — ` +
        `dépôt : ${String(await d.depot.taille())} jeton(s)`,
    );

    expect(essais).toHaveLength(3);
    expect(acceptes).toBe(1);
    expect(essais[0]?.valide).toBe(true);
    for (const essai of essais.slice(1)) {
      expect(essai.valide).toBe(false);
      if (!essai.valide) expect(essai.motif).toBe("deja-consomme");
    }
  });

  it("n'accepte QU'UN SEUL gagnant sur dix présentations concurrentes", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const resultats = await Promise.all(
      Array.from({ length: 10 }, () =>
        verifierEtConsommer(
          {
            presente: emission.valeur,
            tool: "zoho.mail.send",
            argHash: "hmac-A",
            principal: "will",
            maintenant: T0,
          },
          d,
        ),
      ),
    );

    const acceptes = resultats.filter((r) => r.valide).length;
    console.info(
      `[garde concurrence] ${String(resultats.length)} présentations simultanées, ${String(acceptes)} acceptée(s)`,
    );

    expect(resultats).toHaveLength(10);
    expect(acceptes).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — L'EMPREINTE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/confirmation — l'empreinte conservée", () => {
  it("ne conserve JAMAIS la valeur en clair", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const stocke = await d.depot.lire(emission.jeton.jti);
    const serialise = JSON.stringify(stocke);
    const secret = emission.valeur.slice(emission.valeur.indexOf(".") + 1);

    console.info(
      `[garde empreinte] ${String(serialise.length)} caractères conservés, secret de ${String(secret.length)} caractères`,
    );

    expect(secret.length).toBeGreaterThan(20);
    expect(serialise).not.toContain(secret);
    expect(serialise).not.toContain(emission.valeur);
  });

  it("refuse tout net un sel vide — fail-loud, comme l'argHash du § 12", () => {
    expect(() => empreinteJeton("", "jti", "secret")).toThrow(/sel/iu);
    expect(empreinteJeton(SEL_DE_GARDE, "jti", "secret")).toHaveLength(64);
    // Un sel différent donne une empreinte différente : la clé compte vraiment.
    expect(empreinteJeton(SEL_DE_GARDE, "jti", "secret")).not.toBe(
      empreinteJeton(`${SEL_DE_GARDE}!`, "jti", "secret"),
    );
  });

  it("refuse un jeton dont le secret a été bricolé", async () => {
    const d = deps();
    const emission = await emettreConfirmation(
      {
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        canal: "console",
        maintenant: T0,
      },
      d,
    );
    expect(emission.emis).toBe(true);
    if (!emission.emis) return;

    const bricole = `${emission.jeton.jti}.${"A".repeat(43)}`;
    const refuse = await verifierEtConsommer(
      {
        presente: bricole,
        tool: "zoho.mail.send",
        argHash: "hmac-A",
        principal: "will",
        maintenant: T0,
      },
      d,
    );

    expect(refuse.valide).toBe(false);
    if (!refuse.valide) expect(refuse.motif).toBe("empreinte");
  });
});
