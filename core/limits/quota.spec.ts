import { describe, expect, it } from "vitest";

import { EFFECTS, type Effect } from "../types.js";
import {
  CLES_LIMITES,
  DIX_SECONDES_MS,
  ErreurConfigurationQuota,
  LIMITES_DE_DEPART,
  RATIO_ALERTE,
  TOUT_OUTIL,
  UNE_HEURE_MS,
  fenetreCanonique,
  resoudreCompteurs,
  sApplique,
  validerDenominateur,
  warnAtParDefaut,
  type CleLimite,
} from "./config.js";
import { DepotQuotaEnMemoire } from "./memoire.js";
import { consommer, type DepotQuota } from "./quota.js";

/**
 * Gardes de `core/limits/` — les quotas (§ 12 et § 26).
 *
 * Chaque garde rougit d'abord sur un témoin fabriqué, puis mesure la vraie
 * donnée, et annonce son compte d'éléments mesurés.
 */

const MAINTENANT = new Date("2026-08-30T14:03:25.000Z");

function demandeType(effect: Effect, depot: DepotQuota): Parameters<typeof consommer>[0] {
  return {
    depot,
    tool: "zoho.mail.search",
    effect,
    principal: "jeton-de-test",
    limiteOutil: null,
    warnAtOutil: null,
    maintenant: MAINTENANT,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — les limites de départ sont celles du § 26
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — les limites de départ du § 26", () => {
  it("porte les quatre valeurs du tableau, et rien d'autre", () => {
    // Plancher-témoin : le § 26 en nomme quatre. Une configuration vidée
    // rendrait toutes les gardes suivantes vertes sans rien mesurer.
    const attendues: ReadonlyArray<readonly [CleLimite, number, number]> = [
      ["rafale", 10, DIX_SECONDES_MS],
      ["outilLecture", 60, UNE_HEURE_MS],
      ["outilEcriture", 20, UNE_HEURE_MS],
      ["jeton", 300, UNE_HEURE_MS],
    ];

    let mesures = 0;
    for (const [cle, limite, fenetreMs] of attendues) {
      const configuree = LIMITES_DE_DEPART[cle];
      expect(configuree.limite, cle).toBe(limite);
      expect(configuree.fenetreMs, cle).toBe(fenetreMs);
      mesures += 1;
    }

    console.info(`[garde limites de départ] ${String(mesures)} limites mesurées`);
    expect(mesures).toBe(4);
    expect(CLES_LIMITES).toHaveLength(4);
  });

  it("évalue la rafale EN PREMIER — le Retry-After doit être utilisable", () => {
    // Si le quota horaire mordait d'abord, le message dirait « réessayez dans
    // 47 minutes » là où la rafale se rouvre dans 3 secondes : exact, et
    // inutilisable.
    expect(CLES_LIMITES[0]).toBe("rafale");
  });

  it("range CHAQUE effect du § 09 dans exactement un compteur d'outil", () => {
    // Dérivé de `EFFECTS`, pas d'une liste : ajouter un `effect` au § 09 le
    // fait mesurer ici, et l'absence de couverture rougit.
    let mesures = 0;
    for (const effect of EFFECTS) {
      const applicables = CLES_LIMITES.filter(
        (cle) =>
          LIMITES_DE_DEPART[cle].portee === "outil" && sApplique(LIMITES_DE_DEPART[cle], effect),
      );
      expect(applicables, effect).toHaveLength(1);
      mesures += 1;
    }

    console.info(`[garde couverture des effects] ${String(mesures)} effects mesurés`);
    expect(mesures).toBe(EFFECTS.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
  });

  it("range tout ce qui n'est pas `read` du côté ÉCRITURE — le plus contraint", () => {
    const lectures = EFFECTS.filter((e) => sApplique(LIMITES_DE_DEPART.outilLecture, e));
    const ecritures = EFFECTS.filter((e) => sApplique(LIMITES_DE_DEPART.outilEcriture, e));
    expect(lectures).toEqual(["read"]);
    expect(ecritures).toHaveLength(EFFECTS.length - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — un compteur sans dénominateur ne peut ni refuser ni alerter
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — le dénominateur et le seuil d'alerte", () => {
  it("rougit sur chacun des cinq témoins de configuration absurde", () => {
    const temoins: ReadonlyArray<readonly [string, number, number]> = [
      ["seuil au-dessus du dénominateur : n'alerte jamais", 60, 61],
      ["dénominateur nul : refuserait tout", 0, 1],
      ["dénominateur négatif", -1, 1],
      ["dénominateur fractionnaire", 1.5, 1],
      ["seuil nul", 60, 0],
    ];

    let mesures = 0;
    for (const [nom, limite, seuil] of temoins) {
      expect(() => {
        validerDenominateur(limite, seuil);
      }, nom).toThrow(ErreurConfigurationQuota);
      mesures += 1;
    }

    console.info(`[garde dénominateur] ${String(mesures)} témoins mesurés`);
    expect(mesures).toBe(5);
  });

  it("dérive le seuil d'alerte à 80 % du dénominateur — la valeur du § 12", () => {
    let mesures = 0;
    for (const cle of CLES_LIMITES) {
      const limite = LIMITES_DE_DEPART[cle].limite;
      const seuil = warnAtParDefaut(limite);
      expect(seuil, cle).toBe(Math.max(1, Math.floor(limite * RATIO_ALERTE)));
      expect(seuil, cle).toBeLessThanOrEqual(limite);
      expect(seuil, cle).toBeGreaterThanOrEqual(1);
      mesures += 1;
    }
    console.info(`[garde seuil d'alerte] ${String(mesures)} seuils mesurés`);
    expect(mesures).toBe(CLES_LIMITES.length);
  });

  it("laisse `ops_tool.limit` régler l'outil, JAMAIS le plafond du jeton", () => {
    // Sinon la console desserrerait par un champ de formulaire ce que le § 20
    // fait passer par un second facteur.
    const plans = resoudreCompteurs({
      tool: "zoho.mail.search",
      effect: "read",
      principal: "jeton-de-test",
      limiteOutil: 5,
      warnAtOutil: null,
      maintenant: MAINTENANT,
    });

    const surOutil = plans.filter((p) => p.tool !== TOUT_OUTIL);
    const surPrincipal = plans.filter((p) => p.tool === TOUT_OUTIL);

    console.info(
      `[garde surcharge de console] ${String(plans.length)} compteurs mesurés, ` +
        `${String(surOutil.length)} sur l'outil`,
    );

    expect(surOutil.every((p) => p.limit === 5)).toBe(true);
    expect(surPrincipal.map((p) => p.limit).sort((a, b) => a - b)).toEqual([10, 300]);
  });

  it("lève quand la console a saisi un seuil au-dessus du dénominateur", () => {
    expect(() =>
      resoudreCompteurs({
        tool: "zoho.mail.search",
        effect: "read",
        principal: "jeton-de-test",
        limiteOutil: 10,
        warnAtOutil: 99,
        maintenant: MAINTENANT,
      }),
    ).toThrow(ErreurConfigurationQuota);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — la fenêtre canonique
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — la fenêtre de comptage", () => {
  it("arrondit au palier inférieur et annonce son `resetAt`", () => {
    const fenetre = fenetreCanonique("rafale", DIX_SECONDES_MS, MAINTENANT);
    expect(fenetre.debut.toISOString()).toBe("2026-08-30T14:03:20.000Z");
    expect(fenetre.resetAt.toISOString()).toBe("2026-08-30T14:03:30.000Z");
    expect(fenetre.window).toBe("rafale|2026-08-30T14:03:20.000Z");
  });

  it("donne des fenêtres DISTINCTES à deux limites de même largeur", () => {
    // Sans le préfixe de clé, `jeton` et `outilLecture` — toutes deux horaires —
    // partageraient la ligne `(window, tool, principal)` quand `tool` coïncide,
    // et deux plafonds n'en feraient qu'un.
    const a = fenetreCanonique("jeton", UNE_HEURE_MS, MAINTENANT);
    const b = fenetreCanonique("outilLecture", UNE_HEURE_MS, MAINTENANT);
    expect(a.debut.getTime()).toBe(b.debut.getTime());
    expect(a.window).not.toBe(b.window);
  });

  it("rougit sur un témoin de largeur invalide", () => {
    expect(() => fenetreCanonique("rafale", 0, MAINTENANT)).toThrow(ErreurConfigurationQuota);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'étape 12 refuse, dit quand réessayer, et compense
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — étape 12, débit et quota", () => {
  it("accepte jusqu'au plafond mesuré, puis refuse — et ANNONCE la limite mesurée", async () => {
    const depot = new DepotQuotaEnMemoire();
    const plafondRafale = LIMITES_DE_DEPART.rafale.limite;

    let acceptes = 0;
    for (let i = 0; i < plafondRafale; i += 1) {
      const verdict = await consommer(demandeType("read", depot));
      expect(verdict.accepte, `appel ${String(i + 1)}`).toBe(true);
      acceptes += 1;
    }

    const refuse = await consommer(demandeType("read", depot));

    console.info(
      `[garde quota] limite mesurée : ${String(plafondRafale)} appels acceptés, ` +
        `le ${String(acceptes + 1)}ᵉ refusé`,
    );

    expect(acceptes).toBe(plafondRafale);
    expect(refuse.accepte).toBe(false);
    if (refuse.accepte) throw new Error("inatteignable");
    expect(refuse.code).toBe("rate_limited");
    expect(refuse.compteur.cle).toBe("rafale");
    // § 15 — « dit quand réessayer ».
    expect(refuse.retryAfterSecondes).toBeGreaterThanOrEqual(1);
    expect(refuse.retryAfterSecondes).toBeLessThanOrEqual(10);
  });

  it("REND les unités déjà prises quand un compteur suivant refuse", async () => {
    // Le compteur d'outil (20/h en écriture) mord avant la rafale ? Non : la
    // rafale est évaluée en premier. On construit donc l'inverse — on épuise le
    // compteur d'outil, puis on mesure que la rafale, incrémentée d'abord, est
    // bien rendue. Sans compensation, un appelant bloqué à l'étape 12 brûlerait
    // son quota de rafale à chaque tentative refusée.
    const depot = new DepotQuotaEnMemoire();
    const plafondOutil = LIMITES_DE_DEPART.outilEcriture.limite;

    // 20 écritures : le compteur d'outil est à son plafond. La rafale (10/10 s)
    // mordrait avant — on avance donc le temps entre les appels.
    for (let i = 0; i < plafondOutil; i += 1) {
      const instant = new Date(MAINTENANT.getTime() + i * DIX_SECONDES_MS);
      const verdict = await consommer({
        ...demandeType("send", depot),
        maintenant: instant,
      });
      expect(verdict.accepte, `écriture ${String(i + 1)}`).toBe(true);
    }

    const instantFinal = new Date(MAINTENANT.getTime() + plafondOutil * DIX_SECONDES_MS);
    const fenetreRafale = fenetreCanonique("rafale", DIX_SECONDES_MS, instantFinal);
    const cleRafale = {
      window: fenetreRafale.window,
      tool: TOUT_OUTIL,
      principal: "jeton-de-test",
    };

    const avant = depot.valeur(cleRafale);
    const refuse = await consommer({ ...demandeType("send", depot), maintenant: instantFinal });
    const apres = depot.valeur(cleRafale);

    console.info(
      `[garde compensation] compteur rafale avant : ${String(avant)}, après : ${String(apres)}`,
    );

    expect(refuse.accepte).toBe(false);
    if (refuse.accepte) throw new Error("inatteignable");
    expect(refuse.compteur.cle).toBe("outilEcriture");
    expect(refuse.compensations).toBeGreaterThanOrEqual(1);
    // L'unité prise par la rafale a été RENDUE : le compteur est revenu.
    expect(apres).toBe(avant);
  });

  it("rapporte l'anomalie quand la compensation échoue, et ne masque pas le 429", async () => {
    const depot = new DepotQuotaEnMemoire();
    const plafondOutil = LIMITES_DE_DEPART.outilEcriture.limite;
    for (let i = 0; i < plafondOutil; i += 1) {
      await consommer({
        ...demandeType("send", depot),
        maintenant: new Date(MAINTENANT.getTime() + i * DIX_SECONDES_MS),
      });
    }

    depot.compensationCassee = true;
    const refuse = await consommer({
      ...demandeType("send", depot),
      maintenant: new Date(MAINTENANT.getTime() + plafondOutil * DIX_SECONDES_MS),
    });

    expect(refuse.accepte).toBe(false);
    if (refuse.accepte) throw new Error("inatteignable");
    console.info(
      `[garde compensation] ${String(refuse.anomalies.length)} anomalie(s) rapportée(s)`,
    );
    expect(refuse.anomalies.length).toBeGreaterThanOrEqual(1);
    expect(refuse.code).toBe("rate_limited");
  });

  it("alerte au seuil, avant de refuser — le compteur porte son dénominateur", async () => {
    const depot = new DepotQuotaEnMemoire();
    const seuil = warnAtParDefaut(LIMITES_DE_DEPART.rafale.limite);

    let premiereAlerte = 0;
    for (let i = 1; i <= LIMITES_DE_DEPART.rafale.limite; i += 1) {
      const verdict = await consommer(demandeType("read", depot));
      if (!verdict.accepte) throw new Error("inatteignable");
      if (premiereAlerte === 0 && verdict.alertes.some((a) => a.cle === "rafale")) {
        premiereAlerte = i;
      }
    }

    console.info(
      `[garde alerte] seuil mesuré : ${String(seuil)} / ${String(LIMITES_DE_DEPART.rafale.limite)}, ` +
        `première alerte au ${String(premiereAlerte)}ᵉ appel`,
    );

    expect(premiereAlerte).toBe(seuil);
    expect(premiereAlerte).toBeLessThan(LIMITES_DE_DEPART.rafale.limite);
  });

  it("refuse un appel sans outil ou sans principal plutôt que de compter à vide", () => {
    expect(() =>
      resoudreCompteurs({
        tool: "",
        effect: "read",
        principal: "p",
        limiteOutil: null,
        warnAtOutil: null,
        maintenant: MAINTENANT,
      }),
    ).toThrow(ErreurConfigurationQuota);

    expect(() =>
      resoudreCompteurs({
        tool: "t",
        effect: "read",
        principal: "  ",
        limiteOutil: null,
        warnAtOutil: null,
        maintenant: MAINTENANT,
      }),
    ).toThrow(ErreurConfigurationQuota);
  });
});
