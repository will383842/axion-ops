import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../types.js";
import { creerCalculArgHash, type CoffreArgHash } from "./arg-hash.js";
import { LIMITES_DE_DEPART, TOUT_OUTIL, fenetreCanonique } from "./config.js";
import type { DepotIdempotence } from "./idempotency.js";
import { DepotIdempotenceEnMemoire, DepotQuotaEnMemoire } from "./memoire.js";
import { ETAPES_LIMITES, appliquerLimites, type ResultatValidation } from "./limites.js";
import type { DepotQuota } from "./quota.js";

/**
 * Gardes de `core/limits/` — L'ORDRE des étapes 8, 12 et 13 (§ 11).
 *
 * « Le schéma avant le quota. Un appel malformé ne consomme rien. L'ordre
 *   inverse produit une boucle : le quota brûle, le 429 dit “quand réessayer”,
 *   le modèle attend et rejoue le même appel invalide. »
 */

const MAINTENANT = new Date("2026-08-30T14:03:25.000Z");
const TTL_MS = 24 * 3_600_000;
const PRINCIPAL = "jeton-de-test";
const OUTIL = "zoho.mail.send";

const coffre: CoffreArgHash = {
  lireCleArgHash(): Promise<string> {
    return Promise.resolve("cle-de-test-0123456789abcdef0123456789ab");
  },
};

interface Charge {
  readonly id: string;
}

/** Un validateur d'étape 8 qui accepte, façon schéma fermé. */
const validateurQuiAccepte = (input: unknown): ResultatValidation<Charge> => {
  const objet = input as Charge;
  return { ok: true, valeur: { id: objet.id } };
};

/** Un validateur d'étape 8 qui refuse, en nommant le champ (§ 15). */
const validateurQuiRefuse = (_input: unknown): ResultatValidation<Charge> => ({
  ok: false,
  champ: "id",
  attendu: "une chaîne non vide",
});

function parametres(
  depotQuota: DepotQuota,
  depotIdempotence: DepotIdempotence,
  validerEntree: (input: unknown) => ResultatValidation<Charge>,
  key: string | null = "cle-client-1",
): Parameters<typeof appliquerLimites<Charge>>[0] {
  return {
    tool: OUTIL,
    effect: "send",
    modeIdempotence: "key",
    principal: PRINCIPAL,
    idempotencyKey: key,
    input: { id: "42" },
    validerEntree,
    calcul: creerCalculArgHash(coffre),
    depotQuota,
    depotIdempotence,
    limiteOutil: null,
    warnAtOutil: null,
    ttlIdempotenceMs: TTL_MS,
    maintenant: MAINTENANT,
    // Ces gardes n'éprouvent que 8, 12 et 13. La couture est déclarée VIDE, et
    // c'est une décision écrite : le compilateur ne laisse plus l'oublier.
    entreSchemaEtQuota: () => null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'ordre est celui du § 11, et il est DÉRIVÉ du tableau des étapes
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — l'ordre des étapes", () => {
  it("place le schéma (8) avant le quota (12) avant l'idempotence (13)", () => {
    // Dérivé d'`APPEL_STEPS`, jamais recopié : réordonner le § 11 dans
    // `core/types.ts` fait rougir ceci.
    const numero = (cle: string): number => {
      const etape = APPEL_STEPS.find((e) => e.cle === cle);
      if (etape === undefined) throw new Error(`étape « ${cle} » introuvable`);
      return etape.numero;
    };

    const schema = numero("schema");
    const quota = numero("quota");
    const idempotence = numero("idempotence");

    console.info(
      `[garde ordre] 3 étapes mesurées : schéma ${String(schema)} < quota ${String(quota)} ` +
        `< idempotence ${String(idempotence)}`,
    );

    expect(schema).toBeLessThan(quota);
    expect(quota).toBeLessThan(idempotence);
    expect([...ETAPES_LIMITES]).toEqual([schema, quota, idempotence]);
  });

  it("n'inscrit dans `stepDenied` que des numéros d'étapes existantes", () => {
    const numeros = new Set(APPEL_STEPS.map((e) => e.numero));
    let mesures = 0;
    for (const etape of ETAPES_LIMITES) {
      expect(numeros.has(etape), String(etape)).toBe(true);
      mesures += 1;
    }
    console.info(`[garde stepDenied] ${String(mesures)} numéros mesurés`);
    expect(mesures).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LA règle : un `invalid_input` ne décompte AUCUN quota
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — un appel malformé ne consomme rien", () => {
  it("laisse TOUS les compteurs intacts, et affiche le compteur avant/après", async () => {
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    const fenetreRafale = fenetreCanonique(
      "rafale",
      LIMITES_DE_DEPART.rafale.fenetreMs,
      MAINTENANT,
    );
    const cleRafale = { window: fenetreRafale.window, tool: TOUT_OUTIL, principal: PRINCIPAL };

    const avantRafale = quota.valeur(cleRafale);
    const avantTotal = quota.totalConsomme;

    const verdict = await appliquerLimites(parametres(quota, idem, validateurQuiRefuse));

    const apresRafale = quota.valeur(cleRafale);
    const apresTotal = quota.totalConsomme;

    console.info(
      `[garde schéma avant quota] compteur rafale — avant : ${String(avantRafale)}, ` +
        `après : ${String(apresRafale)} · total toutes fenêtres — avant : ${String(avantTotal)}, ` +
        `après : ${String(apresTotal)}`,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("inatteignable");
    expect(verdict.etape).toBe(8);
    expect(verdict.code).toBe("invalid_input");
    expect(apresRafale).toBe(avantRafale);
    expect(apresTotal).toBe(avantTotal);
    expect(apresTotal).toBe(0);
    // Et rien n'a été réservé non plus : l'étape 13 n'a pas été atteinte.
    expect(idem.lignes.size).toBe(0);
  });

  it("consomme bel et bien le quota quand l'entrée est valide — la garde sait dire OUI", async () => {
    // Témoin inverse : sans lui, la garde précédente serait verte même si la
    // fonction ne comptait JAMAIS rien.
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    const verdict = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));

    console.info(
      `[garde témoin inverse] ${String(quota.totalConsomme)} unité(s) consommée(s) sur ` +
        `${String(quota.compteurs.size)} compteur(s)`,
    );

    expect(verdict.ok).toBe(true);
    // Trois compteurs pour un `send` : rafale, outil d'écriture, jeton.
    expect(quota.compteurs.size).toBe(3);
    expect(quota.totalConsomme).toBe(3);
  });

  it("nomme le champ fautif et la valeur attendue (§ 15)", async () => {
    const verdict = await appliquerLimites(
      parametres(new DepotQuotaEnMemoire(), new DepotIdempotenceEnMemoire(), validateurQuiRefuse),
    );
    if (verdict.ok) throw new Error("inatteignable");
    if (verdict.etape !== 8) throw new Error("inatteignable");
    expect(verdict.champ).toBe("id");
    expect(verdict.attendu).toBe("une chaîne non vide");
    expect(verdict.quotaConsomme).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — l'étape 13 dans la chaîne complète
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — la chaîne complète", () => {
  it("REND le quota quand l'étape 13 refuse pour clé réutilisée", async () => {
    // Décision du constructeur, signalée en écart : le motif du § 11 (« le
    // modèle attend et rejoue le même appel invalide ») vaut ici aussi.
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    // Premier appel : accepté, réservation posée, puis close.
    const premier = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    expect(premier.ok).toBe(true);
    const apresPremier = quota.totalConsomme;

    // Deuxième appel : MÊME clé, argument DIFFÉRENT.
    const autreCharge: Parameters<typeof appliquerLimites<Charge>>[0] = {
      ...parametres(quota, idem, validateurQuiAccepte),
      input: { id: "99" },
    };
    const second = await appliquerLimites(autreCharge);
    const apresSecond = quota.totalConsomme;

    console.info(
      `[garde rendu de quota] total après le 1er appel : ${String(apresPremier)}, ` +
        `après le refus du 2e : ${String(apresSecond)}`,
    );

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("inatteignable");
    expect(second.etape).toBe(13);
    expect(second.code).toBe("invalid_input");
    if (second.etape !== 13) throw new Error("inatteignable");
    expect(second.quotaRendu).toBe(true);
    expect(second.anomalies).toEqual([]);
    expect(apresSecond).toBe(apresPremier);
  });

  it("ne rend PAS le quota sur un `conflict` — l'appel était légitime", async () => {
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    // Un appel identique est déjà EN COURS sous la même clé.
    const premier = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    expect(premier.ok).toBe(true);
    const apresPremier = quota.totalConsomme;

    const second = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    const apresSecond = quota.totalConsomme;

    console.info(
      `[garde conflit] total après le 1er appel : ${String(apresPremier)}, ` +
        `après le conflit : ${String(apresSecond)}`,
    );

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("inatteignable");
    if (second.etape !== 13) throw new Error("inatteignable");
    expect(second.code).toBe("conflict");
    expect(second.quotaRendu).toBe(false);
    expect(apresSecond).toBeGreaterThan(apresPremier);
  });

  it("refuse en 429 avant d'atteindre l'idempotence quand la rafale mord", async () => {
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();
    const plafond = LIMITES_DE_DEPART.rafale.limite;

    // Des clés d'idempotence distinctes, pour n'éprouver QUE le quota.
    let acceptes = 0;
    for (let i = 0; i < plafond; i += 1) {
      const verdict = await appliquerLimites(
        parametres(quota, idem, validateurQuiAccepte, `cle-${String(i)}`),
      );
      if (verdict.ok) acceptes += 1;
    }

    const lignesAvant = idem.lignes.size;
    const refuse = await appliquerLimites(
      parametres(quota, idem, validateurQuiAccepte, "cle-de-trop"),
    );

    console.info(
      `[garde 429] ${String(acceptes)} appels acceptés, puis refus ; ` +
        `${String(idem.lignes.size)} réservation(s) posée(s), inchangé : ` +
        `${String(lignesAvant === idem.lignes.size)}`,
    );

    expect(refuse.ok).toBe(false);
    if (refuse.ok) throw new Error("inatteignable");
    expect(refuse.etape).toBe(12);
    if (refuse.etape !== 12) throw new Error("inatteignable");
    expect(refuse.code).toBe("rate_limited");
    expect(refuse.retryAfterSecondes).toBeGreaterThanOrEqual(1);
    // L'étape 13 n'a PAS été atteinte : aucune réservation de plus.
    expect(idem.lignes.size).toBe(lignesAvant);
  });

  it("sert le rejeu mémorisé sans réexécuter, une fois la réservation close", async () => {
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    const premier = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    if (!premier.ok) throw new Error("inatteignable");
    if (premier.etape !== 14) throw new Error("inatteignable");

    await idem.cloturer({
      tool: OUTIL,
      key: "cle-client-1",
      status: "done",
      resultRef: "ref-42",
      completedAt: MAINTENANT,
    });

    const second = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("inatteignable");
    if (second.etape !== 13) throw new Error("inatteignable");
    expect(second.rejeu).toBe(true);
    expect(second.resultRef).toBe("ref-42");
    // ⚠️ Le rejeu a TOUT DE MÊME consommé du quota : l'étape 12 précède la 13
    //    dans le § 11. Constat, pas défaut — signalé en écart.
    expect(quota.totalConsomme).toBe(6);
  });

  it("porte le même argHash pour le refus que pour le succès — le journal doit pouvoir l'écrire", async () => {
    const quota = new DepotQuotaEnMemoire();
    const idem = new DepotIdempotenceEnMemoire();

    const succes = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    if (!succes.ok) throw new Error("inatteignable");
    if (succes.etape !== 14) throw new Error("inatteignable");

    const conflit = await appliquerLimites(parametres(quota, idem, validateurQuiAccepte));
    if (conflit.ok) throw new Error("inatteignable");
    if (conflit.etape !== 13) throw new Error("inatteignable");

    expect(conflit.argHash).toBe(succes.argHash);
    expect(succes.argHash).toHaveLength(64);
  });
});
