import { describe, expect, it } from "vitest";

import { APPEL_STEPS, EFFECTS, OPS_SCOPES, POLICY_LEVELS } from "../types.js";
import type { Effect, OpsScope } from "../types.js";
import { deciderEtape10, exigeConfirmationSystematique } from "../policy/index.js";
import type { CiblePublique } from "../policy/index.js";
import { ETAPE_SCOPES } from "./etapes.js";
import type {
  ContexteScopes,
  CorrespondanceScopes,
  ScopesEtablis,
  VerdictEtape,
} from "./etapes.js";
import {
  PORTE_PAR_LE_JETON_DAPPEL,
  SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL,
  SCOPE_EXIGE_PAR_EFFET,
  correspondanceCanonique,
  effetsCouvertsPar,
  etape05Scopes,
} from "./etape-05-scopes.js";

/**
 * Gardes de l'étape 5 — § 11 et § 19.2.
 *
 * Ce que ces gardes tiennent, dans l'ordre où elles sont écrites :
 *
 *  1. la matrice COMPLÈTE `effect` × `scope`, avec son compte annoncé et un
 *     témoin naïf qui montre ce qu'une implémentation faible laisserait passer ;
 *  2. la totalité des deux tables, vérifiée par le compilateur ET mesurée ici ;
 *  3. l'absence de hiérarchie entre scopes — la décision qui, non gardée,
 *     s'inverse toute seule à la première refonte ;
 *  4. le refus sec d'`ops:policy` sur un jeton d'appel, avec son témoin négatif ;
 *  5. `destructive` : `ops:send` ET confirmation à tous les niveaux, `libre`
 *     compris — éprouvé jusqu'à l'étape 10, pas seulement déclaré ;
 *  6. l'ancrage du verdict à `APPEL_STEPS` par un chemin INDÉPENDANT du module ;
 *  7. le fait qu'aucun message de refus ne récite les scopes du jeton ;
 *  8. le fail-closed sur une correspondance qui mentirait.
 *
 * Chaque garde (a) rougit sur un témoin fabriqué et (b) annonce combien
 * d'éléments elle a mesurés, sous un plancher-témoin.
 */

const OUTIL = "zoho.mail.send";
const CIBLE: CiblePublique = { tool: OUTIL, argHash: "hmac-fabrique-pour-la-garde" };

function contexte(
  scopes: readonly OpsScope[],
  effectEpingle: Effect,
  correspondance: CorrespondanceScopes = correspondanceCanonique,
): ContexteScopes {
  return { scopes, effectEpingle, outil: OUTIL, correspondance };
}

/** L'issue attendue, DÉRIVÉE des deux tables — jamais d'une liste recopiée. */
function attendu(scopes: readonly OpsScope[], effet: Effect): "autorise" | "refuse" {
  const porteUnInterdit = SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL.some((scope) =>
    scopes.includes(scope),
  );
  if (porteUnInterdit) return "refuse";
  return scopes.includes(SCOPE_EXIGE_PAR_EFFET[effet]) ? "autorise" : "refuse";
}

/** Les scopes portables par un jeton d'appel — DÉRIVÉS, jamais listés. */
const SCOPES_PORTABLES: readonly OpsScope[] = OPS_SCOPES.filter(
  (scope) => PORTE_PAR_LE_JETON_DAPPEL[scope],
);

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LA MATRICE COMPLÈTE `effect` × `scope`
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — la matrice effect × scope", () => {
  it("rougit sur un témoin naïf : « le jeton porte au moins un scope »", () => {
    // C'est la forme faible la plus tentante — celle qu'un appelant écrirait à
    // la main faute de module, et que le lot 1 a mesurée comme le vrai risque.
    // Sans ce témoin, on ne saurait pas si le vert de la matrice vient de la
    // règle ou de la facilité du cas d'épreuve.
    const naif = (scopes: readonly OpsScope[]): "autorise" | "refuse" =>
      scopes.length > 0 ? "autorise" : "refuse";

    let paires = 0;
    let ecarts = 0;
    for (const effet of EFFECTS) {
      for (const scope of OPS_SCOPES) {
        const reel = etape05Scopes(contexte([scope], effet)).issue;
        if (naif([scope]) !== reel) ecarts += 1;
        paires += 1;
      }
    }

    console.info(
      `[témoin naïf] ${String(paires)} paires mesurées, ` +
        `${String(ecarts)} que le témoin laisserait passer et que l'étape refuse`,
    );

    expect(paires).toBe(EFFECTS.length * OPS_SCOPES.length);
    // Plancher-témoin : zéro écart voudrait dire que l'étape ne refuse rien de
    // plus qu'un compteur de scopes — donc qu'elle ne garde rien.
    expect(ecarts).toBeGreaterThanOrEqual(EFFECTS.length * (OPS_SCOPES.length - 1));
  });

  it("balaie les 20 paires effect × scope, et annonce sa répartition", () => {
    let paires = 0;
    const comptes = new Map<string, number>();
    const anomalies: string[] = [];

    for (const effet of EFFECTS) {
      for (const scope of OPS_SCOPES) {
        const verdict = etape05Scopes(contexte([scope], effet));
        const espere = attendu([scope], effet);
        if (verdict.issue !== espere) {
          anomalies.push(`${effet} × ${scope} : ${verdict.issue} au lieu de ${espere}`);
        }
        comptes.set(verdict.issue, (comptes.get(verdict.issue) ?? 0) + 1);
        paires += 1;
      }
    }

    console.info(
      `[garde matrice] ${String(paires)} paires effect × scope mesurées — ` +
        [...comptes.entries()].map(([cle, n]) => `${cle}: ${String(n)}`).join(", "),
    );

    expect(paires).toBe(EFFECTS.length * OPS_SCOPES.length);
    expect(paires).toBe(20);
    expect(anomalies).toEqual([]);
    // Les deux issues sont représentées : une matrice qui verserait tout du même
    // côté serait verte en n'autorisant rien, ou en n'interdisant rien.
    expect(comptes.size).toBe(2);
    // Un scope, un effect autorisé au plus — sauf `ops:send`, qui en porte deux.
    expect(comptes.get("autorise")).toBe(EFFECTS.length);
  });

  it("refuse un jeton SANS AUCUN scope, pour les quatre effects", () => {
    let mesures = 0;
    for (const effet of EFFECTS) {
      const verdict = etape05Scopes(contexte([], effet));
      expect(verdict.issue, effet).toBe("refuse");
      mesures += 1;
    }
    console.info(`[garde jeton nu] ${String(mesures)} effects mesurés sur un jeton sans scope`);
    expect(mesures).toBe(EFFECTS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les deux tables sont TOTALES, et transcrivent le § 19.2
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — les tables du § 19.2", () => {
  it("couvre TOUS les effects et TOUS les scopes, sans clé en trop", () => {
    const clesEffets = Object.keys(SCOPE_EXIGE_PAR_EFFET);
    const clesScopes = Object.keys(PORTE_PAR_LE_JETON_DAPPEL);

    console.info(
      `[garde totalité] ${String(clesEffets.length)} effects classés sur ${String(EFFECTS.length)}, ` +
        `${String(clesScopes.length)} scopes classés sur ${String(OPS_SCOPES.length)}`,
    );

    // ⚠️ CETTE GARDE DOUBLE LE COMPILATEUR, ELLE NE LE REMPLACE PAS. L'annotation
    //    `Record<Effect, OpsScope>` fait déjà d'un effect non classé une ERREUR
    //    DE COMPILATION. Ce test mesure ce que `tsc` refuserait, pour que le
    //    compte apparaisse dans le rapport plutôt que dans le silence d'un build.
    expect([...clesEffets].sort()).toEqual([...EFFECTS].sort());
    expect([...clesScopes].sort()).toEqual([...OPS_SCOPES].sort());
    expect(clesEffets.length).toBe(EFFECTS.length);
    expect(clesScopes.length).toBe(OPS_SCOPES.length);
  });

  it("transcrit le tableau du § 19.2, ligne à ligne", () => {
    // La confrontation au document. Elle est écrite en toutes lettres PARCE QUE
    // c'est le seul endroit du socle où le CDC est recopié : ailleurs, tout
    // dérive. Le jour où le § 19.2 change, cette garde rougit — c'est son rôle.
    expect(SCOPE_EXIGE_PAR_EFFET.read).toBe("ops:read");
    expect(SCOPE_EXIGE_PAR_EFFET["write-draft"]).toBe("ops:draft");
    expect(SCOPE_EXIGE_PAR_EFFET.send).toBe("ops:send");
    // § 19.2, dernière ligne : « assujetti à `ops:send` ET à une confirmation
    // systématique ». La première moitié est ici, la seconde en garde 5.
    expect(SCOPE_EXIGE_PAR_EFFET.destructive).toBe("ops:send");
    // `ops:admin` (console) et `ops:policy` (desserrage) ne sont l'effect
    // d'aucun outil de la chaîne d'appel.
    const scopesExiges = new Set<OpsScope>(EFFECTS.map((effet) => SCOPE_EXIGE_PAR_EFFET[effet]));
    console.info(
      `[garde § 19.2] ${String(scopesExiges.size)} scopes exigibles sur ` +
        `${String(OPS_SCOPES.length)} — ${[...scopesExiges].join(", ")}`,
    );
    expect(scopesExiges.has("ops:admin")).toBe(false);
    expect(scopesExiges.has("ops:policy")).toBe(false);
    expect(scopesExiges.size).toBe(3);
  });

  it("n'exige jamais un scope qu'un jeton d'appel ne porte jamais", () => {
    // Cohérence des DEUX tables entre elles. Sans elle, une future ligne
    // `effect → ops:policy` rendrait un outil soit inatteignable, soit
    // franchissable par le seul jeton qui n'aurait jamais dû exister.
    const incoherentes = EFFECTS.filter(
      (effet) => !PORTE_PAR_LE_JETON_DAPPEL[SCOPE_EXIGE_PAR_EFFET[effet]],
    );
    console.info(
      `[garde cohérence tables] ${String(EFFECTS.length)} effects confrontés aux deux tables, ` +
        `${String(incoherentes.length)} incohérence(s)`,
    );
    expect(incoherentes).toEqual([]);
  });

  it("dérive `effetsCouvertsPar` de la table unique, sans seconde liste", () => {
    let total = 0;
    const detail: string[] = [];
    for (const scope of OPS_SCOPES) {
      const effets = effetsCouvertsPar(scope);
      total += effets.length;
      detail.push(`${scope}: ${effets.length === 0 ? "—" : effets.join("+")}`);
    }

    console.info(
      `[garde couverture] ${String(OPS_SCOPES.length)} scopes mesurés, ` +
        `${String(total)} affectations — ${detail.join(", ")}`,
    );

    // Chaque effect est couvert EXACTEMENT une fois : la somme des couvertures
    // vaut le nombre d'effects. Un effect couvert deux fois ferait passer un
    // appel par deux scopes différents selon le chemin de lecture.
    expect(total).toBe(EFFECTS.length);
    expect(effetsCouvertsPar("ops:send")).toEqual(["send", "destructive"]);
    expect(effetsCouvertsPar("ops:policy")).toEqual([]);
    expect(effetsCouvertsPar("ops:admin")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — AUCUNE HIÉRARCHIE ENTRE SCOPES
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — le § 19.2 ne déclare aucune hiérarchie", () => {
  it("rougit sur le témoin « qui peut le plus peut le moins »", () => {
    // Le témoin est la règle qu'on refuse d'écrire : `ops:send` impliquerait
    // `ops:draft` et `ops:read`. Elle paraît raisonnable et élargirait en
    // silence tout jeton d'envoi à la lecture de TOUT — alors que le § 27
    // rappelle que ce palier-ci est le seul qui sépare encore brouillon et
    // envoi chez Zoho.
    const hierarchique = (scopes: readonly OpsScope[], effet: Effect): "autorise" | "refuse" =>
      scopes.includes("ops:send") || scopes.includes(SCOPE_EXIGE_PAR_EFFET[effet])
        ? "autorise"
        : "refuse";

    let ecarts = 0;
    let mesures = 0;
    for (const effet of EFFECTS) {
      const jeton: readonly OpsScope[] = ["ops:send"];
      if (hierarchique(jeton, effet) !== etape05Scopes(contexte(jeton, effet)).issue) ecarts += 1;
      mesures += 1;
    }

    console.info(
      `[témoin hiérarchie] ${String(mesures)} effects mesurés sur un jeton « ops:send » seul, ` +
        `${String(ecarts)} que la hiérarchie laisserait passer et que l'étape refuse`,
    );

    // `read` et `write-draft` : deux écarts. `send` et `destructive` passent des
    // deux côtés — c'est bien un `ops:send`.
    expect(ecarts).toBe(2);
  });

  it("n'autorise chaque effect que par UN SEUL scope", () => {
    let mesures = 0;
    const anomalies: string[] = [];
    for (const effet of EFFECTS) {
      const autorisants = OPS_SCOPES.filter(
        (scope) => etape05Scopes(contexte([scope], effet)).issue === "autorise",
      );
      if (autorisants.length !== 1) {
        anomalies.push(`${effet} : ${String(autorisants.length)} scopes autorisants`);
      }
      mesures += 1;
    }

    console.info(
      `[garde non-hiérarchie] ${String(mesures)} effects mesurés, ` +
        `${String(anomalies.length)} avec plus (ou moins) d'un scope autorisant`,
    );

    expect(mesures).toBe(EFFECTS.length);
    expect(anomalies).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — `ops:policy` SUR UN JETON D'APPEL EST UN REFUS SEC (§ 19.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — « le jeton du connecteur ne le porte JAMAIS »", () => {
  it("dérive la liste des scopes interdits, au lieu de l'écrire", () => {
    console.info(
      `[garde interdits] ${String(OPS_SCOPES.length)} scopes classés, ` +
        `${String(SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL.length)} jamais portés par un jeton ` +
        `d'appel : ${SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL.join(", ")}`,
    );
    // Plancher-témoin : une liste vide rendrait toute la garde 4 vacueuse.
    expect(SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL).toEqual(["ops:policy"]);
    // `ops:admin` reste portable : le lui interdire couperait la console de la
    // chaîne d'appel, et le § 20 en sort déjà l'arrêt d'urgence.
    expect(PORTE_PAR_LE_JETON_DAPPEL["ops:admin"]).toBe(true);
  });

  it("refuse un jeton porteur d'`ops:policy` MÊME quand le scope exigé est là", () => {
    // LE CAS QUI COMPTE. Un jeton `["ops:read", "ops:policy"]` qui appelle un
    // outil `read` satisfait la suffisance : si le contrôle d'interdiction
    // venait après, ce jeton sur-privilégié travaillerait normalement, donc
    // invisiblement, jusqu'au jour où il desserrerait la politique.
    const verdict = etape05Scopes(contexte(["ops:read", "ops:policy"], "read"));

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue === "refuse") {
      console.info(
        `[garde ops:policy] refus à l'étape ${String(verdict.etape)} : ${verdict.message}`,
      );
      expect(verdict.etape).toBe(ETAPE_SCOPES.numero);
      // Le code est LU dans l'ancrage — `scope_insufficient` depuis la Recette
      // du lot 1c. On le confronte à l'ancrage plutôt qu'à une constante
      // écrite : ce qui doit être garanti est que ce refus-ci ne sort pas par
      // un chemin qui écrirait son code à la main.
      expect(verdict.code).toBe(ETAPE_SCOPES.code);
      expect(verdict.code).toBe("scope_insufficient");
      expect(verdict.message).toContain("ops:policy");
      // § 15, deuxième règle — dire ce qu'il faut faire ensuite.
      expect(verdict.message).toContain("route dédiée");
    }
  });

  it("témoin négatif : le MÊME appel sans `ops:policy` passe", () => {
    // Sans ce témoin, le rouge ci-dessus pourrait venir de n'importe quoi —
    // d'un outil mal nommé, d'un effect mal épinglé. Il prouve que le refus
    // vient bien du scope `ops:policy`, et de lui seul.
    const verdict = etape05Scopes(contexte(["ops:read"], "read"));
    expect(verdict.issue).toBe("autorise");
  });

  it("refuse `ops:policy` pour les QUATRE effects, quel que soit le reste du jeton", () => {
    let mesures = 0;
    for (const effet of EFFECTS) {
      for (const compagnon of SCOPES_PORTABLES) {
        const verdict = etape05Scopes(contexte([compagnon, "ops:policy"], effet));
        expect(verdict.issue, `${effet} × ${compagnon}`).toBe("refuse");
        mesures += 1;
      }
    }
    console.info(
      `[garde ops:policy — balayage] ${String(mesures)} jetons porteurs d'ops:policy mesurés`,
    );
    expect(mesures).toBe(EFFECTS.length * SCOPES_PORTABLES.length);
    expect(mesures).toBe(16);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — `destructive` : `ops:send` ET confirmation à TOUS LES NIVEAUX
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — la double règle de `destructive` (§ 19.2)", () => {
  it("exige `ops:send`, et l'établit pour l'étape 10", () => {
    const verdict: VerdictEtape<ScopesEtablis> = etape05Scopes(
      contexte(["ops:send"], "destructive"),
    );

    expect(verdict.issue).toBe("autorise");
    if (verdict.issue === "autorise") {
      expect(verdict.etabli.scopeExige).toBe("ops:send");
      expect(verdict.etabli.confirmationSystematique).toBe(true);
    }
    // Et il n'y a PAS de scope `destructive` : le § 19.2 en range un dans son
    // tableau, le § 09 énumère `ctx.scopes` sans lui. La forme retenue est celle
    // du § 09 — voir `core/types.ts`.
    expect(OPS_SCOPES).not.toContain("destructive");
  });

  it("lit la confirmation systématique dans `core/policy`, sans la redéduire", () => {
    // Témoin fabriqué : la valeur écrite en dur. Elle est juste trois fois sur
    // quatre — donc elle passerait tout test qui n'éprouverait que `read`,
    // `write-draft` ou `send`. C'est ce genre de faux vert qu'on ferme ici.
    const enDur = (): boolean => false;

    let mesures = 0;
    let ecartsAvecLeTemoin = 0;
    const desaccords: string[] = [];

    for (const effet of EFFECTS) {
      const verdict = etape05Scopes(contexte([SCOPE_EXIGE_PAR_EFFET[effet]], effet));
      expect(verdict.issue, effet).toBe("autorise");
      if (verdict.issue === "autorise") {
        const attenduPolicy = exigeConfirmationSystematique(effet);
        if (verdict.etabli.confirmationSystematique !== attenduPolicy) {
          desaccords.push(effet);
        }
        if (verdict.etabli.confirmationSystematique !== enDur()) ecartsAvecLeTemoin += 1;
      }
      mesures += 1;
    }

    console.info(
      `[garde confirmation systématique] ${String(mesures)} effects mesurés, ` +
        `${String(desaccords.length)} désaccord(s) avec core/policy, ` +
        `${String(ecartsAvecLeTemoin)} écart(s) avec le témoin écrit en dur`,
    );

    expect(mesures).toBe(EFFECTS.length);
    expect(desaccords).toEqual([]);
    // Plancher-témoin : le `false` en dur se trompe sur `destructive`, et sur
    // lui seul. Zéro écart voudrait dire que l'étape rend `false` partout.
    expect(ecartsAvecLeTemoin).toBe(1);
  });

  it("est refusé sans confirmation à TOUS les niveaux, `libre` compris", () => {
    // La règle du § 19.2 ne vaut que si les deux étages la tiennent ENSEMBLE :
    // l'étape 5 établit `confirmationSystematique`, l'étape 10 refuse. Éprouver
    // l'un sans l'autre laisserait la règle vraie sur le papier et fausse en
    // service.
    const cinq = etape05Scopes(contexte(["ops:send"], "destructive"));
    expect(cinq.issue).toBe("autorise");

    let niveaux = 0;
    const issues: string[] = [];
    for (const niveau of POLICY_LEVELS) {
      const dix = deciderEtape10({
        effet: "destructive",
        niveau,
        confirmation: "absente",
        cible: CIBLE,
      });
      expect(dix.decision, niveau).toBe("refuse");
      issues.push(`${niveau}: ${dix.decision === "refuse" ? dix.code : "autorise"}`);
      niveaux += 1;
    }

    console.info(
      `[garde destructive/tous niveaux] ${String(niveaux)} niveaux mesurés — ${issues.join(", ")}`,
    );

    expect(niveaux).toBe(POLICY_LEVELS.length);
    expect(niveaux).toBe(3);
    // Le cas qui a motivé la ligne du § 19.2 : `libre` ne dispense pas.
    const enLibre = deciderEtape10({
      effet: "destructive",
      niveau: "libre",
      confirmation: "absente",
      cible: CIBLE,
    });
    expect(enLibre.decision).toBe("refuse");
    if (enLibre.decision === "refuse") expect(enLibre.code).toBe("confirmation_required");

    // Témoin négatif : un `send` en `libre` passe, lui. Sans cela, le rouge
    // ci-dessus pourrait venir du niveau et non de l'effect.
    const sendEnLibre = deciderEtape10({
      effet: "send",
      niveau: "libre",
      confirmation: "absente",
      cible: CIBLE,
    });
    expect(sendEnLibre.decision).toBe("autorise");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — LE VERDICT EST ANCRÉ À `APPEL_STEPS`, PAR UN CHEMIN INDÉPENDANT
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — le numéro et le code sont DÉRIVÉS du § 11", () => {
  it("porte le numéro et le code que `APPEL_STEPS` associe à la clé « scopes »", () => {
    // La garde relit `APPEL_STEPS` elle-même plutôt que `ETAPE_SCOPES` : si le
    // module s'ancrait à une autre clé, `ETAPE_SCOPES` serait cohérent avec
    // lui-même et faux vis-à-vis du § 11.
    const officielle = APPEL_STEPS.find((etape) => etape.cle === "scopes");
    expect(officielle).toBeDefined();

    let verdicts = 0;
    const anomalies: string[] = [];
    for (const effet of EFFECTS) {
      for (const scope of OPS_SCOPES) {
        const verdict = etape05Scopes(contexte([scope], effet));
        if (verdict.etape !== officielle?.numero) {
          anomalies.push(`${effet} × ${scope} : étape ${String(verdict.etape)}`);
        }
        if (verdict.issue === "refuse" && verdict.code !== officielle?.refus) {
          anomalies.push(`${effet} × ${scope} : code ${String(verdict.code)}`);
        }
        verdicts += 1;
      }
    }

    console.info(
      `[garde ancrage étape 5] ${String(verdicts)} verdicts mesurés, ` +
        `numéro attendu ${String(officielle?.numero)}, code attendu ${String(officielle?.refus)}`,
    );

    expect(verdicts).toBe(EFFECTS.length * OPS_SCOPES.length);
    expect(anomalies).toEqual([]);
    expect(ETAPE_SCOPES.numero).toBe(officielle?.numero);
    // Le trou du § 15 a été NOMMÉ au lot 1c et BRANCHÉ par sa Recette : les 20
    // verdicts ci-dessus l'ont tous confronté à `APPEL_STEPS`, donc le module
    // ne l'écrit toujours pas lui-même — c'est la propriété gardée ici.
    expect(officielle?.refus).toBe("scope_insufficient");
    // Le 403 du § 11 n'a pas bougé : le code nomme la cause, il ne remplace pas
    // le statut. Un branchement qui aurait aussi déplacé le statut aurait changé
    // ce que le transport rend, sans qu'aucun § ne le demande.
    expect(officielle?.statutHttp).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 7 — UN REFUS NE RÉCITE JAMAIS LES SCOPES DU JETON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les scopes du jeton que ce message nomme. Annonce aussi combien de scopes ont
 * été cherchés : une recherche sur zéro scope ne trouverait rien, et serait
 * verte pour la pire des raisons.
 */
function scopesRecites(
  message: string,
  portes: readonly OpsScope[],
): { readonly cherches: number; readonly recites: readonly OpsScope[] } {
  const recites = portes.filter((scope) => message.includes(scope));
  return { cherches: portes.length, recites };
}

describe("core/chaine/etape-05-scopes — le refus ne dit pas ce que le jeton porte", () => {
  it("rougit sur un témoin fabriqué qui énumérerait les scopes du porteur", () => {
    // La formulation la plus tentante, et celle qui transforme la chaîne
    // d'appel en oracle d'énumération de privilèges : « vous portez X, il
    // faudrait Y ».
    const portes: readonly OpsScope[] = ["ops:admin", "ops:draft"];
    const fautif = `Le jeton porte ${portes.join(", ")} ; il faudrait ops:send.`;
    const verdict = scopesRecites(fautif, portes);

    console.info(
      `[témoin récitation] ${String(verdict.cherches)} scopes cherchés, ` +
        `${String(verdict.recites.length)} récités`,
    );

    expect(verdict.cherches).toBe(2);
    expect(verdict.recites.length).toBe(2);
  });

  it("nomme le scope MANQUANT, jamais ceux que le jeton porte", () => {
    let refus = 0;
    let cherches = 0;
    const fuites: string[] = [];

    // On balaie les seuls jetons PORTABLES : le refus d'`ops:policy` nomme
    // délibérément le scope fautif — c'est le défaut lui-même, pas une fuite —
    // et il fausserait la mesure s'il entrait ici.
    for (const effet of EFFECTS) {
      for (const scope of SCOPES_PORTABLES) {
        const verdict = etape05Scopes(contexte([scope], effet));
        if (verdict.issue !== "refuse") continue;
        const mesure = scopesRecites(verdict.message, [scope]);
        cherches += mesure.cherches;
        if (mesure.recites.length > 0) fuites.push(`${effet} × ${scope}`);
        // Ce qu'il DOIT dire : le scope à demander (§ 15, deuxième règle).
        expect(verdict.message, `${effet} × ${scope}`).toContain(SCOPE_EXIGE_PAR_EFFET[effet]);
        refus += 1;
      }
    }

    console.info(
      `[garde récitation] ${String(refus)} refus mesurés, ` +
        `${String(cherches)} scopes cherchés dans les messages, ${String(fuites.length)} fuite(s)`,
    );

    // Plancher-témoin : sans refus mesuré, l'absence de fuite ne prouve rien.
    expect(refus).toBe(12);
    expect(cherches).toBe(12);
    expect(fuites).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 8 — FAIL-CLOSED SUR UNE CORRESPONDANCE QUI MENTIRAIT
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine/etape-05-scopes — la correspondance est un PORT, et il peut mentir", () => {
  it("LIT la correspondance injectée au lieu de la figer dans son corps", () => {
    // Deux appels identiques à un port près. Si l'étape codait la table en dur,
    // les deux rendraient la même chose — et le port ne serait qu'un ornement.
    const versAdmin: CorrespondanceScopes = () => "ops:admin";

    const avec = etape05Scopes(contexte(["ops:admin"], "read", versAdmin));
    const sans = etape05Scopes(contexte(["ops:admin"], "read"));

    console.info(`[garde port] même jeton, deux correspondances : ${avec.issue} / ${sans.issue}`);

    expect(avec.issue).toBe("autorise");
    if (avec.issue === "autorise") expect(avec.etabli.scopeExige).toBe("ops:admin");
    expect(sans.issue).toBe("refuse");
  });

  it("refuse un scope exigé hors du § 19.2, au lieu de le deviner", () => {
    // `as unknown as` : la valeur n'est PAS un `OpsScope`, et c'est le point du
    // témoin — un port typé peut être franchi depuis du JavaScript non typé,
    // depuis une désérialisation, ou depuis un `as` d'un autre module.
    const inventee: CorrespondanceScopes = () => "ops:superuser" as unknown as OpsScope;
    const verdict = etape05Scopes(contexte(["ops:read", "ops:send"], "read", inventee));

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue === "refuse") {
      console.info(`[garde fail-closed — scope inconnu] ${verdict.message}`);
      expect(verdict.message).toContain("ops:superuser");
    }

    // Témoin négatif : le MÊME jeton, avec la correspondance canonique, passe.
    // Le rouge vient donc de la correspondance, pas du jeton.
    expect(etape05Scopes(contexte(["ops:read", "ops:send"], "read")).issue).toBe("autorise");
  });

  it("refuse un scope exigé qu'un jeton d'appel ne porte jamais", () => {
    // Le cas vicieux : une correspondance qui mapperait un effect sur
    // `ops:policy`. Combinée à un jeton qui le porterait, elle ferait franchir
    // l'étape 5 au seul jeton qui n'aurait jamais dû exister. Ici, deux
    // verrous : l'interdiction du jeton (garde 4) ET ce refus-ci.
    const versPolicy: CorrespondanceScopes = () => "ops:policy";
    const verdict = etape05Scopes(contexte(["ops:read"], "read", versPolicy));

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue === "refuse") {
      console.info(`[garde fail-closed — scope non portable] ${verdict.message}`);
      expect(verdict.message).toContain("ops:policy");
      expect(verdict.message).toContain("route dédiée du socle");
    }
  });
});
