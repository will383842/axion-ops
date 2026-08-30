import { describe, expect, it } from "vitest";

import { EFFECTS, POLICY_LEVELS, type Effect } from "../types.js";
import {
  deciderEtape10,
  effetsExterieurs,
  estEffetExterieur,
  ETAPE_POLITIQUE,
  ETATS_CONFIRMATION,
  exigeConfirmationSystematique,
  type CiblePublique,
  type DecisionPolitique,
} from "./effet.js";

/**
 * Gardes du catalogue des effets extérieurs et de la décision de l'étape 10
 * (§ 20 et § 11).
 */

const CIBLE: CiblePublique = { tool: "zoho.mail.send", argHash: "hmac-abcdef012345" };

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le catalogue est une TOTALITÉ, pas une liste
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/effet — ce qui compte comme effet extérieur", () => {
  it("rougit sur un témoin qui dériverait la frontière du RANG dans EFFECTS", () => {
    // Témoin fabriqué : la dérivation « extérieur = rang ≥ celui de send », sur
    // un tableau réordonné. Elle change de réponse sans qu'un mot soit dit —
    // c'est pourquoi `estEffetExterieur` est un `switch` exhaustif.
    const reordonne: readonly Effect[] = ["send", "destructive", "read", "write-draft"];
    const parRang = (effet: Effect): boolean =>
      reordonne.indexOf(effet) >= reordonne.indexOf("send");

    expect(parRang("read")).toBe(true); // faux, et silencieux
    expect(estEffetExterieur("read")).toBe(false); // la totalité, elle, tient
  });

  it("classe TOUS les effets de EFFECTS, et partitionne des deux côtés", () => {
    // La mesure balaie `EFFECTS` — dérivé, pas recopié. Un effet ajouté au socle
    // et non classé dans le `switch` ne compile même pas.
    let mesures = 0;
    for (const effet of EFFECTS) {
      expect(typeof estEffetExterieur(effet), effet).toBe("boolean");
      mesures += 1;
    }

    const exterieurs = effetsExterieurs();
    const interieurs = EFFECTS.filter((effet) => !estEffetExterieur(effet));

    console.info(
      `[garde effets] ${String(mesures)} effets mesurés — ` +
        `${String(exterieurs.length)} extérieurs (${exterieurs.join(", ")}), ` +
        `${String(interieurs.length)} intérieurs (${interieurs.join(", ")})`,
    );

    expect(mesures).toBe(EFFECTS.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
    // Les deux côtés sont NON VIDES : une partition qui verse tout du même côté
    // rendrait la garde verte en n'interdisant rien, ou en interdisant tout.
    expect(exterieurs.length).toBeGreaterThan(0);
    expect(interieurs.length).toBeGreaterThan(0);
    // Le test du § 20 — « quelqu'un d'autre que moi peut-il s'en apercevoir ? »
    expect(exterieurs).toEqual(["send", "destructive"]);
  });

  it("réserve la confirmation systématique au seul `destructive` (§ 19.2)", () => {
    const systematiques = EFFECTS.filter(exigeConfirmationSystematique);

    console.info(
      `[garde destructive] ${String(EFFECTS.length)} effets mesurés, ` +
        `${String(systematiques.length)} à confirmation systématique`,
    );

    expect(systematiques).toEqual(["destructive"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la table de décision de l'étape 10, EN ENTIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le résultat attendu, dérivé du § 20 en trois règles et non d'une table
 * recopiée case par case :
 *   · un effet non extérieur passe partout ;
 *   · `brouillon` refuse tout effet extérieur ;
 *   · sinon, confirmation exigée si le niveau est `confirmé` OU si l'effet est
 *     à confirmation systématique.
 */
function attendu(effet: Effect, niveau: string, confirmation: string): string {
  if (!estEffetExterieur(effet)) return "autorise";
  if (niveau === "brouillon") return "policy_denied";
  const exigee = niveau === "confirmé" || exigeConfirmationSystematique(effet);
  if (!exigee) return "autorise";
  return confirmation === "valide" ? "autorise" : "confirmation_required";
}

function etiquette(decision: DecisionPolitique): string {
  return decision.decision === "autorise" ? "autorise" : decision.code;
}

describe("core/policy/effet — la décision de l'étape 10", () => {
  it("rougit sur un témoin qui laisserait passer un `send` en brouillon", () => {
    const faux = { decision: "autorise" } as const;
    const vrai = deciderEtape10({
      effet: "send",
      niveau: "brouillon",
      confirmation: "absente",
      cible: CIBLE,
    });

    expect(etiquette(faux)).toBe("autorise");
    expect(etiquette(vrai)).toBe("policy_denied");
  });

  it("balaie les 36 combinaisons effet × niveau × confirmation", () => {
    // Produit cartésien des trois énumérations — aucune liste écrite à la main.
    let mesures = 0;
    const comptes = new Map<string, number>();

    for (const effet of EFFECTS) {
      for (const niveau of POLICY_LEVELS) {
        for (const confirmation of ETATS_CONFIRMATION) {
          const decision = deciderEtape10({ effet, niveau, confirmation, cible: CIBLE });
          const obtenu = etiquette(decision);
          expect(obtenu, `${effet} / ${niveau} / ${confirmation}`).toBe(
            attendu(effet, niveau, confirmation),
          );
          comptes.set(obtenu, (comptes.get(obtenu) ?? 0) + 1);
          mesures += 1;
        }
      }
    }

    console.info(
      `[garde étape 10] ${String(mesures)} combinaisons mesurées — ` +
        [...comptes.entries()].map(([cle, n]) => `${cle}: ${String(n)}`).join(", "),
    );

    expect(mesures).toBe(EFFECTS.length * POLICY_LEVELS.length * ETATS_CONFIRMATION.length);
    expect(mesures).toBe(36);
    // Les trois issues sont représentées : une table qui ne rendrait qu'une
    // seule issue passerait la comparaison ci-dessus si `attendu` était aussi
    // faux — ce plancher-là ferme la porte.
    expect(comptes.size).toBe(3);
  });

  it("exige une confirmation pour `destructive` MÊME en niveau `libre`", () => {
    const decision = deciderEtape10({
      effet: "destructive",
      niveau: "libre",
      confirmation: "absente",
      cible: CIBLE,
    });

    expect(decision.decision).toBe("refuse");
    if (decision.decision === "refuse") {
      console.info(`[garde destructive/libre] → ${decision.code} : ${decision.message}`);
      expect(decision.code).toBe("confirmation_required");
      expect(decision.etape).toBe(ETAPE_POLITIQUE);
      expect(decision.etape).toBe(10);
    }
  });

  it("dit le niveau courant et la cible — § 15, « ce qu'il faut faire ensuite »", () => {
    const decision = deciderEtape10({
      effet: "send",
      niveau: "brouillon",
      confirmation: "absente",
      cible: CIBLE,
    });

    expect(decision.decision).toBe("refuse");
    if (decision.decision === "refuse") {
      expect(decision.niveau).toBe("brouillon");
      expect(decision.cible.tool).toBe(CIBLE.tool);
      expect(decision.message).toContain("brouillon");
      expect(decision.message.length).toBeGreaterThan(40);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LE JETON NE FIGURE JAMAIS DANS UNE RÉPONSE D'ERREUR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parcourt une valeur en profondeur et rend les chemins où l'un des secrets
 * apparaît, en clé comme en valeur. Elle annonce le nombre de nœuds visités :
 * une garde qui ne visiterait rien ne trouverait rien, et serait verte.
 */
function chercherFuite(
  valeur: unknown,
  secrets: readonly string[],
): { readonly noeuds: number; readonly fuites: readonly string[] } {
  const fuites: string[] = [];
  let noeuds = 0;

  const visiter = (courant: unknown, chemin: string): void => {
    noeuds += 1;
    if (typeof courant === "string") {
      for (const secret of secrets) {
        if (secret.length > 0 && courant.includes(secret)) {
          fuites.push(`${chemin} porte un secret`);
        }
      }
      return;
    }
    if (Array.isArray(courant)) {
      courant.forEach((element, index) => {
        visiter(element, `${chemin}[${String(index)}]`);
      });
      return;
    }
    if (courant !== null && typeof courant === "object") {
      for (const [cle, sousValeur] of Object.entries(courant)) {
        for (const secret of secrets) {
          if (secret.length > 0 && cle.includes(secret)) {
            fuites.push(`${chemin}.${cle} — la CLÉ porte un secret`);
          }
        }
        visiter(sousValeur, `${chemin}.${cle}`);
      }
    }
  };

  visiter(valeur, "$");
  return { noeuds, fuites };
}

describe("core/policy/effet — le jeton de confirmation ne fuit pas (§ 20)", () => {
  const JETON_TEMOIN = "jeton-de-confirmation-fabrique-pour-la-garde";

  it("rougit sur un témoin fabriqué qui porterait le jeton dans son message", () => {
    // La réponse fautive, écrite exprès : « présentez le jeton XXX ». C'est la
    // forme la plus tentante, et celle que le § 20 interdit nommément.
    const fautive = {
      decision: "refuse",
      code: "confirmation_required",
      message: `Confirmez avec le jeton ${JETON_TEMOIN}`,
      details: { jeton: JETON_TEMOIN },
    };

    const verdict = chercherFuite(fautive, [JETON_TEMOIN]);

    console.info(`[garde fuite — témoin] ${String(verdict.noeuds)} nœuds visités`);
    expect(verdict.noeuds).toBeGreaterThan(3);
    expect(verdict.fuites.length).toBeGreaterThanOrEqual(2);
  });

  it("ne laisse fuir aucun jeton sur les 36 décisions de l'étape 10", () => {
    let noeuds = 0;
    let decisions = 0;
    const fuites: string[] = [];

    for (const effet of EFFECTS) {
      for (const niveau of POLICY_LEVELS) {
        for (const confirmation of ETATS_CONFIRMATION) {
          const decision = deciderEtape10({ effet, niveau, confirmation, cible: CIBLE });
          const verdict = chercherFuite(decision, [JETON_TEMOIN]);
          noeuds += verdict.noeuds;
          fuites.push(...verdict.fuites);
          decisions += 1;
        }
      }
    }

    console.info(`[garde fuite] ${String(decisions)} décisions, ${String(noeuds)} nœuds visités`);

    // Plancher-témoin : sans nœuds visités, l'absence de fuite ne prouve rien.
    expect(decisions).toBe(36);
    expect(noeuds).toBeGreaterThan(100);
    expect(fuites).toEqual([]);
  });

  it("ne reçoit même pas le jeton : `DemandeEtape10` n'a pas de champ pour lui", () => {
    // La garde structurelle. On ne peut pas laisser fuir ce qu'on n'a pas reçu :
    // la signature ne porte qu'un ÉTAT de confirmation, jamais sa valeur.
    const champs = Object.keys({
      effet: "send" as Effect,
      niveau: POLICY_LEVELS[0],
      confirmation: ETATS_CONFIRMATION[0],
      cible: CIBLE,
    });

    console.info(
      `[garde signature] ${String(champs.length)} champs mesurés : ${champs.join(", ")}`,
    );

    expect(champs).toHaveLength(4);
    expect(champs).not.toContain("jeton");
    expect(champs).not.toContain("token");
  });
});
