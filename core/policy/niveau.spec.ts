import { describe, expect, it } from "vitest";

import { POLICY_LEVELS, type PolicyLevel } from "../types.js";
import { ligneDeDemarrage, SET_BY_DEMARRAGE, type LignePolitique } from "./ligne.js";
import { niveauApplique, NIVEAU_DE_REPLI, plancherDuScope } from "./niveau.js";
import type { ReferenceOutil } from "./scope.js";

/**
 * Gardes du calcul de niveau (§ 12, règle 1 ; § 20, protections 3 et 4).
 *
 * Chaque garde rougit d'abord sur un témoin fabriqué, puis mesure la vraie
 * règle, et ANNONCE son compte.
 */

const T0 = new Date("2026-08-30T12:00:00.000Z");
const OUTIL: ReferenceOutil = { adapterId: "zoho.mail", tool: "send" };

function ligne(
  partiel: Partial<LignePolitique> & { id: string; level: PolicyLevel },
): LignePolitique {
  return {
    scope: "*",
    channel: "console",
    expiresAt: null,
    supersededAt: null,
    setBy: "will",
    setAt: T0,
    reason: "garde",
    ...partiel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — DEUX SCOPES QUI SE RECOUVRENT : LE PLUS STRICT GAGNE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/niveau — deux scopes qui se recouvrent", () => {
  it("rougit sur un témoin fabriqué où le plus permissif l'emporterait", () => {
    // Le témoin est un calcul FAUX, écrit exprès : « le dernier posé gagne ».
    // S'il rendait le même résultat que le vrai calcul, la garde suivante ne
    // prouverait rien.
    const lignes = [
      ligne({ id: "large", level: "brouillon", scope: "*" }),
      ligne({
        id: "etroit",
        level: "libre",
        scope: "zoho.mail.send",
        expiresAt: new Date(T0.getTime() + 3_600_000),
      }),
    ];

    const dernierPose = lignes[lignes.length - 1]?.level;
    const vrai = niveauApplique(lignes, OUTIL, T0).niveau;

    expect(dernierPose).toBe("libre");
    expect(vrai).not.toBe(dernierPose);
  });

  it("retient le PLUS STRICT — un `libre` étroit ne bat pas un `brouillon` large", () => {
    const lignes = [
      // Le plancher global, tel que le démarrage l'écrit.
      ligne({ id: "large", level: "brouillon", scope: "*" }),
      // Un desserrage étroit, plus spécifique, non expiré.
      ligne({
        id: "etroit",
        level: "libre",
        scope: "zoho.mail.send",
        expiresAt: new Date(T0.getTime() + 3_600_000),
      }),
      // Un intermédiaire, pour que trois scopes se recouvrent d'un coup.
      ligne({
        id: "adaptateur",
        level: "confirmé",
        scope: "zoho.mail.*",
        expiresAt: new Date(T0.getTime() + 3_600_000),
      }),
    ];

    const resultat = niveauApplique(lignes, OUTIL, T0);

    console.info(
      `[garde plus-strict] ${String(resultat.mesures)} lignes mesurées, ` +
        `${String(resultat.enVigueur)} en vigueur, ${String(resultat.retenues.length)} couvrantes → ` +
        `niveau calculé : « ${resultat.niveau} » (raison : ${resultat.raison})`,
    );

    // Plancher-témoin : trois lignes couvrent cet outil. Zéro ligne retenue
    // rendrait « brouillon » — vert, et pour la pire des raisons.
    expect(resultat.mesures).toBe(3);
    expect(resultat.retenues).toHaveLength(3);
    expect(resultat.niveau).toBe("brouillon");
    expect(resultat.raison).toBe("lignes-couvrantes");
  });

  it("n'applique JAMAIS la règle du plus spécifique — sur les neuf paires de niveaux", () => {
    // Produit cartésien, pas une liste écrite à la main. Pour chaque paire, une
    // ligne large et une ligne étroite qui se recouvrent : le résultat doit
    // toujours être le plus strict des deux, jamais celui de la ligne étroite.
    let paires = 0;
    for (const niveauLarge of POLICY_LEVELS) {
      for (const niveauEtroit of POLICY_LEVELS) {
        const expiration = new Date(T0.getTime() + 3_600_000);
        const lignes = [
          ligne({
            id: "large",
            level: niveauLarge,
            scope: "*",
            ...(niveauLarge === "libre" ? { expiresAt: expiration } : {}),
          }),
          ligne({
            id: "etroit",
            level: niveauEtroit,
            scope: "zoho.mail.send",
            ...(niveauEtroit === "libre" ? { expiresAt: expiration } : {}),
          }),
        ];

        const attendu =
          POLICY_LEVELS.indexOf(niveauLarge) <= POLICY_LEVELS.indexOf(niveauEtroit)
            ? niveauLarge
            : niveauEtroit;

        expect(niveauApplique(lignes, OUTIL, T0).niveau, `${niveauLarge} ∧ ${niveauEtroit}`).toBe(
          attendu,
        );
        paires += 1;
      }
    }

    console.info(`[garde anti-spécificité] ${String(paires)} paires mesurées`);
    expect(paires).toBe(POLICY_LEVELS.length ** 2);
    expect(paires).toBeGreaterThanOrEqual(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LE TTL EST ÉVALUÉ PARESSEUSEMENT, À L'APPEL
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/niveau — le TTL s'évalue à l'appel (§ 20, protection 3)", () => {
  it("rougit sur un témoin qui lirait le champ brut au lieu de le comparer à l'heure", () => {
    // Témoin : « la ligne porte un expiresAt, donc elle est vivante ». C'est la
    // lecture du champ BRUT que le § 12 interdit. Le vrai calcul la contredit.
    const expiree = ligne({
      id: "expiree",
      level: "libre",
      scope: "*",
      expiresAt: new Date(T0.getTime() - 1),
    });

    const lectureBrute = expiree.expiresAt !== null;
    const vrai = niveauApplique([expiree], OUTIL, T0);

    expect(lectureBrute).toBe(true);
    expect(vrai.niveau).toBe("brouillon");
    expect(vrai.raison).toBe("aucune-ligne-couvrante");
  });

  it("bascule au repli à la SECONDE où la ligne expire, sans aucune tâche de fond", () => {
    const expiration = new Date(T0.getTime() + 60_000);
    const lignes = [ligne({ id: "desserrage", level: "libre", scope: "*", expiresAt: expiration })];

    const avant = niveauApplique(lignes, OUTIL, new Date(expiration.getTime() - 1));
    const pile = niveauApplique(lignes, OUTIL, expiration);
    const apres = niveauApplique(lignes, OUTIL, new Date(expiration.getTime() + 1));

    console.info(
      `[garde TTL] 3 instants mesurés sur ${String(lignes.length)} ligne : ` +
        `« ${avant.niveau} » → « ${pile.niveau} » → « ${apres.niveau} »`,
    );

    expect(avant.niveau).toBe("libre");
    // À l'instant PILE de l'expiration, la ligne n'est déjà plus en vigueur :
    // `expiresAt > maintenant`, strictement. Une comparaison large laisserait la
    // permission d'un tick de plus — et un tick suffit à un envoi.
    expect(pile.niveau).toBe(NIVEAU_DE_REPLI);
    expect(apres.niveau).toBe(NIVEAU_DE_REPLI);
  });

  it("ignore une ligne remplacée, quelle que soit sa date d'expiration", () => {
    const lignes = [
      ligne({
        id: "remplacee",
        level: "libre",
        scope: "*",
        expiresAt: new Date(T0.getTime() + 3_600_000),
        supersededAt: new Date(T0.getTime() - 1000),
      }),
    ];

    const resultat = niveauApplique(lignes, OUTIL, T0);

    console.info(
      `[garde supersededAt] ${String(resultat.mesures)} ligne mesurée, ` +
        `${String(resultat.enVigueur)} en vigueur → « ${resultat.niveau} »`,
    );

    expect(resultat.mesures).toBe(1);
    expect(resultat.enVigueur).toBe(0);
    expect(resultat.niveau).toBe(NIVEAU_DE_REPLI);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — FAIL-CLOSED
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/niveau — fail-closed (§ 20, protection 4)", () => {
  it("rend le niveau le plus strict quand AUCUNE ligne ne couvre l'outil", () => {
    const resultat = niveauApplique([], OUTIL, T0);

    console.info(
      `[garde fail-closed] ${String(resultat.mesures)} ligne mesurée → « ${resultat.niveau} » ` +
        `(raison : ${resultat.raison})`,
    );

    expect(resultat.niveau).toBe(POLICY_LEVELS[0]);
    expect(resultat.raison).toBe("aucune-ligne-couvrante");
  });

  it("NE JETTE PAS une ligne corrompue : il replie le calcul entier", () => {
    // Le piège : écarter la ligne illisible. Si elle portait `brouillon`,
    // l'écarter RETIRE un plancher — la corruption élargirait la surface.
    const lignes = [
      ligne({ id: "plancher", level: "brouillon", scope: "*" }),
      // Corrompue : un scope hors grammaire, et un `libre` sans durée.
      ligne({ id: "corrompue", level: "libre", scope: "zoho.*.send" }),
    ];

    const resultat = niveauApplique(lignes, OUTIL, T0);

    console.info(
      `[garde corruption] ${String(resultat.mesures)} lignes mesurées, ` +
        `${String(resultat.anomalies.length)} anomalies → « ${resultat.niveau} »`,
    );

    expect(resultat.niveau).toBe(NIVEAU_DE_REPLI);
    expect(resultat.raison).toBe("politique-illisible");
    expect(resultat.anomalies.length).toBeGreaterThanOrEqual(2);
    // Et le résultat NOMME la ligne fautive : « politique illisible » sans
    // coupable oblige à fouiller la table à la main.
    expect(resultat.anomalies.map((a) => a.id)).toContain("corrompue");
  });

  it("replie aussi quand une DATE est illisible — on ne classe pas ce qu'on ne lit pas", () => {
    const cassee = {
      ...ligne({ id: "date-cassee", level: "brouillon", scope: "*" }),
      expiresAt: new Date("pas une date"),
    };

    const resultat = niveauApplique([cassee], OUTIL, T0);

    expect(resultat.raison).toBe("politique-illisible");
    expect(resultat.niveau).toBe(NIVEAU_DE_REPLI);
  });

  it("laisse une ligne historique mal formée hors du calcul courant", () => {
    // Une ligne EXPIRÉE et sémantiquement fautive ne doit pas condamner la
    // politique pour toujours : elle n'est plus en vigueur, donc plus
    // interprétée. Ses dates, elles, restent lisibles — c'est ce qui permet de
    // la classer comme expirée.
    const lignes = [
      ligne({
        id: "vieille-faute",
        level: "libre",
        scope: "*",
        expiresAt: new Date(T0.getTime() - 10),
      }),
      ligne({
        id: "courante",
        level: "confirmé",
        scope: "*",
      }),
    ];

    const resultat = niveauApplique(lignes, OUTIL, T0);

    console.info(
      `[garde historique] ${String(resultat.mesures)} lignes mesurées, ` +
        `${String(resultat.enVigueur)} en vigueur → « ${resultat.niveau} »`,
    );

    expect(resultat.raison).toBe("lignes-couvrantes");
    expect(resultat.niveau).toBe("confirmé");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — LE REDÉMARRAGE
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/niveau — un redémarrage retombe en brouillon", () => {
  it("rougit sur un témoin qui reprendrait le DERNIER NIVEAU CONNU", () => {
    // Témoin : la reprise « intelligente ». C'est exactement ce que le § 20
    // interdit — « jamais le dernier niveau connu ».
    const avantCoupure = [
      ligne({
        id: "libre",
        level: "libre",
        scope: "*",
        expiresAt: new Date(T0.getTime() + 86_400_000),
      }),
    ];
    const dernierConnu = niveauApplique(avantCoupure, OUTIL, T0).niveau;

    const auDemarrage = ligneDeDemarrage(T0, "redémarrage du socle");

    expect(dernierConnu).toBe("libre");
    expect(auDemarrage.level).not.toBe(dernierConnu);
  });

  it('écrit une ligne `setBy: "boot"`, scope `*`, niveau le plus strict, sans expiration', () => {
    const auDemarrage = ligneDeDemarrage(T0, "redémarrage du socle");

    // Le redémarrage : la table est relue, la ligne de démarrage est posée
    // par-dessus l'ancienne, et le calcul repart de là.
    const apresRedemarrage = niveauApplique(
      [
        ligne({
          id: "libre-avant-coupure",
          level: "libre",
          scope: "*",
          expiresAt: new Date(T0.getTime() + 86_400_000),
          supersededAt: T0,
        }),
        auDemarrage,
      ],
      OUTIL,
      T0,
    );

    console.info(
      `[garde redémarrage] ${String(apresRedemarrage.mesures)} lignes mesurées → ` +
        `« ${apresRedemarrage.niveau} », posée par « ${auDemarrage.setBy} »`,
    );

    expect(auDemarrage.setBy).toBe(SET_BY_DEMARRAGE);
    expect(auDemarrage.setBy).toBe("boot");
    expect(auDemarrage.scope).toBe("*");
    expect(auDemarrage.expiresAt).toBeNull();
    expect(auDemarrage.level).toBe("brouillon");
    expect(apresRedemarrage.niveau).toBe("brouillon");
    expect(apresRedemarrage.retenues).toEqual([auDemarrage.id]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — le plancher d'un scope
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/niveau — le plancher d'un scope", () => {
  it("ne retient que les lignes qui DOMINENT le scope, pas celles qu'il domine", () => {
    const lignes = [
      ligne({ id: "global", level: "confirmé", scope: "*" }),
      ligne({ id: "adaptateur", level: "brouillon", scope: "zoho.mail.*" }),
      // Celle-ci est plus étroite que le scope visé : elle ne le domine pas.
      ligne({ id: "outil", level: "brouillon", scope: "zoho.mail.send" }),
    ];

    const plancher = plancherDuScope(lignes, "zoho.mail.*", T0);

    console.info(
      `[garde plancher] ${String(plancher.mesures)} lignes mesurées, ` +
        `${String(plancher.dominantes.length)} dominantes → « ${plancher.niveau} »`,
    );

    expect(plancher.dominantes.map((l) => l.id).sort()).toEqual(["adaptateur", "global"]);
    expect(plancher.niveau).toBe("brouillon");
  });

  it("rend le repli quand rien ne domine — jamais le niveau d'une ligne voisine", () => {
    const plancher = plancherDuScope(
      [
        ligne({
          id: "voisin",
          level: "libre",
          scope: "zoho.calendar.*",
          expiresAt: new Date(T0.getTime() + 1000),
        }),
      ],
      "zoho.mail.*",
      T0,
    );

    expect(plancher.dominantes).toHaveLength(0);
    expect(plancher.niveau).toBe(NIVEAU_DE_REPLI);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  LE PLANCHER ET LE NIVEAU APPLIQUÉ DÉRIVENT LE MÊME FAIT
  // ───────────────────────────────────────────────────────────────────────────

  it("ne surévalue JAMAIS le plancher sur une politique illisible — les deux calculs concordent", () => {
    // Chaque témoin est une SEULE corruption, en vigueur, portant le niveau le
    // plus permissif : c'est le cas où l'écart entre les deux calculs ouvre le
    // plus. Tant que `plancherDuScope` écartait ce qu'il ne savait pas lire, il
    // rendait « libre » là où `niveauApplique` repliait sur « brouillon » — et
    // `classerChangement`, qui trie sur CE plancher, faisait passer un
    // élargissement réel pour un resserrage, donc par le chemin LIBRE.
    const futur = new Date(T0.getTime() + 3_600_000);
    const temoins: ReadonlyArray<readonly [string, LignePolitique]> = [
      [
        "channel vide",
        ligne({ id: "c1", level: "libre", scope: "*", channel: "", expiresAt: futur }),
      ],
      ["libre sans durée", ligne({ id: "c2", level: "libre", scope: "*", expiresAt: null })],
      [
        "scope hors grammaire",
        ligne({ id: "c3", level: "libre", scope: "zoho.*.send", expiresAt: futur }),
      ],
      [
        "niveau inconnu",
        ligne({ id: "c4", level: "permissif" as PolicyLevel, scope: "*", expiresAt: futur }),
      ],
      [
        "date illisible",
        { ...ligne({ id: "c5", level: "libre", scope: "*" }), expiresAt: new Date("pas une date") },
      ],
    ];

    let mesures = 0;
    for (const [libelle, corrompue] of temoins) {
      const applique = niveauApplique([corrompue], OUTIL, T0);
      const plancher = plancherDuScope([corrompue], "*", T0);

      expect(applique.raison, libelle).toBe("politique-illisible");
      // LE POINT DE LA GARDE : le plancher replie AUSSI, et il DIT pourquoi.
      expect(plancher.niveau, libelle).toBe(NIVEAU_DE_REPLI);
      expect(plancher.anomalies.length, libelle).toBeGreaterThanOrEqual(1);
      expect(plancher.dominantes, libelle).toHaveLength(0);
      expect(plancher.niveau, libelle).toBe(applique.niveau);
      mesures += 1;
    }

    console.info(
      `[garde plancher fail-closed] ${String(mesures)} corruptions mesurées, ` +
        `plancher et niveau appliqué concordants sur toutes`,
    );
    expect(mesures).toBe(temoins.length);
    expect(mesures).toBeGreaterThanOrEqual(5);
  });

  it("laisse le plancher intact quand la politique est LISIBLE — la garde sait dire oui", () => {
    const lignes = [
      ligne({ id: "global", level: "libre", scope: "*", expiresAt: new Date(T0.getTime() + 1000) }),
    ];
    const plancher = plancherDuScope(lignes, "*", T0);

    console.info(
      `[garde plancher lisible] ${String(plancher.mesures)} ligne mesurée, ` +
        `${String(plancher.anomalies.length)} anomalie → « ${plancher.niveau} »`,
    );

    // Sans ce témoin positif, la garde précédente serait satisfaite par un
    // `plancherDuScope` qui replierait TOUJOURS — verte, et inutile.
    expect(plancher.anomalies).toHaveLength(0);
    expect(plancher.niveau).toBe("libre");
    expect(plancher.dominantes).toHaveLength(1);
  });
});
