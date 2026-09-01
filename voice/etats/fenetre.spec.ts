import { describe, expect, it } from "vitest";

import {
  DELAI_INACTIVITE_NON_ARBITRE_MS,
  MOTIFS_ECHEANCE,
  MOTIF_FENETRE_VIVANTE,
  evaluerEcheance,
  fenetreDeverrouillee,
  instantDEcheance,
  verrouillageDu,
  type HorlogeVocale,
  type MotifEcheance,
} from "./fenetre.js";
import { ETATS_VOCAUX, fenetreOuverte } from "./vocabulaire.js";

/**
 * Gardes de la fenêtre déverrouillée — § 18 et § 30 : « le démon se verrouille
 * après inactivité et redemande un facteur ».
 *
 * TOUT LE TEMPS EST INJECTÉ. Aucun `Date.now()`, aucune pause : une garde qui
 * dort est une garde qu'on finit par retirer, et un verrouillage qu'on ne
 * mesure qu'à la seconde ne dit pas où il bascule.
 */

const T0 = 1_000_000;
const DELAI = 300_000;

function horloge(instant: number, derniereActivite = T0, delaiInactiviteMs = DELAI): HorlogeVocale {
  return { instant, derniereActivite, delaiInactiviteMs };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — les cinq verdicts sont tous atteignables
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/fenetre — les verdicts d'échéance", () => {
  it("atteint CHACUN des cinq motifs déclarés, et le dit", () => {
    // Le tableau de cas est confronté à `MOTIFS_ECHEANCE` : un sixième motif
    // ajouté sans cas ici fait rougir, au lieu de rester un verdict que rien
    // n'a jamais produit.
    const cas: ReadonlyArray<readonly [MotifEcheance, HorlogeVocale, boolean]> = [
      ["sous-le-délai", horloge(T0 + DELAI - 1), false],
      ["délai-écoulé", horloge(T0 + DELAI), true],
      ["délai-non-positif", horloge(T0 + 1, T0, 0), true],
      ["horloge-non-finie", horloge(Number.NaN), true],
      ["horloge-qui-recule", horloge(T0 - 1), true],
    ];

    const atteints = new Set<MotifEcheance>();
    for (const [attendu, h, echue] of cas) {
      const verdict = evaluerEcheance(h);
      expect(verdict.motif, attendu).toBe(attendu);
      expect(verdict.echue, attendu).toBe(echue);
      atteints.add(verdict.motif);
    }

    console.info(
      `[garde motifs d'échéance] ${String(cas.length)} cas mesurés — ` +
        `${String(atteints.size)} motifs atteints sur ${String(MOTIFS_ECHEANCE.length)} déclarés`,
    );

    expect(atteints.size).toBe(MOTIFS_ECHEANCE.length);
    expect([...atteints].sort()).toEqual([...MOTIFS_ECHEANCE].sort());
  });

  it("ne laisse la fenêtre vivante QUE sur le verdict de tête", () => {
    // Dérivé de l'ordre de `MOTIFS_ECHEANCE` : un seul verdict n'échoit pas.
    let vivants = 0;
    for (const motif of MOTIFS_ECHEANCE) {
      if (motif === MOTIF_FENETRE_VIVANTE) {
        vivants += 1;
      }
    }

    console.info(`[garde verdict vivant] ${String(MOTIFS_ECHEANCE.length)} motifs examinés`);

    expect(vivants).toBe(1);
    expect(MOTIF_FENETRE_VIVANTE).toBe(MOTIFS_ECHEANCE[0]);
    expect(evaluerEcheance(horloge(T0)).motif).toBe(MOTIF_FENETRE_VIVANTE);
  });

  it("rend `ecouleMs: null`, jamais zéro, quand l'horloge est inexploitable", () => {
    // Un zéro se lirait « on vient d'agir » — l'inverse exact de ce qui s'est
    // passé. C'est le motif du `null`.
    const inexploitables: readonly HorlogeVocale[] = [
      horloge(Number.NaN),
      horloge(Number.POSITIVE_INFINITY),
      horloge(T0 + 1, Number.NaN),
      horloge(T0 + 1, T0, Number.NaN),
      horloge(T0 + 1, T0, 0),
      horloge(T0 + 1, T0, -1),
      horloge(T0 - 1),
    ];

    let mesures = 0;
    for (const h of inexploitables) {
      const verdict = evaluerEcheance(h);
      expect(verdict.echue).toBe(true);
      expect(verdict.ecouleMs).toBeNull();
      expect(verdict.resteMs).toBe(0);
      mesures += 1;
    }

    console.info(`[garde horloges inexploitables] ${String(mesures)} horloges mesurées`);
    expect(mesures).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les deux replis qui ne vont pas de soi
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/fenetre — les replis fail-closed", () => {
  it("ferme la fenêtre sur un délai NON POSITIF, au lieu de la rendre éternelle", () => {
    // Le piège : lire « délai 0 » comme « pas d'expiration ». C'est le défaut
    // « délai plus long que son budget = jamais d'expiration », dans l'autre
    // sens — et il rend la fenêtre PERPÉTUELLE sur une configuration vide.
    let mesures = 0;
    for (const delai of [0, -1, -DELAI]) {
      const verdict = evaluerEcheance(horloge(T0, T0, delai));
      expect(verdict.echue, `délai ${String(delai)}`).toBe(true);
      expect(verdict.motif).toBe("délai-non-positif");
      mesures += 1;
    }

    console.info(`[garde délai non positif] ${String(mesures)} délais mesurés`);
    expect(mesures).toBe(3);
  });

  it("ferme la fenêtre quand l'HORLOGE RECULE — et le calcul naïf l'aurait ouverte", () => {
    // Le témoin est ici la mesure du calcul qu'on aurait écrit sans y penser.
    const h = horloge(T0 - 60_000);
    const naif = h.instant - h.derniereActivite;

    console.info(
      `[garde horloge qui recule] écart naïf mesuré = ${String(naif)} ms, ` +
        `soit « ${String(naif < h.delaiInactiviteMs)} » pour « sous le délai »`,
    );

    // Le calcul naïf rend un négatif, donc « largement sous le délai » : une
    // fenêtre rouverte par une horloge qu'on ne contrôle pas.
    expect(naif).toBeLessThan(0);
    expect(naif < h.delaiInactiviteMs).toBe(true);

    // Le calcul réel refuse.
    const verdict = evaluerEcheance(h);
    expect(verdict.echue).toBe(true);
    expect(verdict.motif).toBe("horloge-qui-recule");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LE VERROUILLAGE APRÈS INACTIVITÉ, SUR UN TEMPS INJECTÉ
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/fenetre — le verrouillage après inactivité", () => {
  it("bascule exactement au délai, mesuré à la milliseconde près", () => {
    // ⚠️ La résolution de la mesure est ANNONCÉE avec le résultat : un
    //    encadrement dont les deux bornes sont les seules valeurs mesurables
    //    n'encadre rien. Ici le pas est de 1 ms, et le délai vaut 300 000 ms :
    //    la bascule est localisée, pas déduite.
    const PAS_MS = 1;
    const ecarts = [0, 1, DELAI - 2, DELAI - 1, DELAI, DELAI + 1, DELAI * 2, DELAI * 10] as const;

    let mesures = 0;
    let derniereVivante = Number.NEGATIVE_INFINITY;
    let premiereEchue = Number.POSITIVE_INFINITY;

    for (const ecart of ecarts) {
      const echue = evaluerEcheance(horloge(T0 + ecart)).echue;
      if (echue) {
        premiereEchue = Math.min(premiereEchue, ecart);
      } else {
        derniereVivante = Math.max(derniereVivante, ecart);
      }
      mesures += 1;
    }

    console.info(
      `[garde bascule d'inactivité] ${String(mesures)} instants injectés, pas de ${String(PAS_MS)} ms — ` +
        `dernière fenêtre vivante à ${String(derniereVivante)} ms, ` +
        `première échéance à ${String(premiereEchue)} ms, délai = ${String(DELAI)} ms`,
    );

    expect(mesures).toBe(8);
    expect(derniereVivante).toBe(DELAI - 1);
    expect(premiereEchue).toBe(DELAI);
    expect(premiereEchue - derniereVivante).toBe(PAS_MS);
  });

  it("déclenche le verrouillage depuis CHAQUE état ouvert, et jamais depuis l'état fermé", () => {
    // Le geste `expirer-inactivité` doit être appliqué par la boucle du démon
    // exactement là où cette fonction dit oui. Un état fermé n'a rien à
    // refermer : une minuterie qui rebattrait sur lui remplirait le journal
    // d'un événement qui ne dit rien.
    const echue = horloge(T0 + DELAI);
    const vivante = horloge(T0 + DELAI - 1);

    let mesures = 0;
    let declenchements = 0;

    for (const etat of ETATS_VOCAUX) {
      const duSurEchue = verrouillageDu(etat, echue);
      const duSurVivante = verrouillageDu(etat, vivante);

      expect(duSurEchue, `${etat} / échue`).toBe(fenetreOuverte(etat));
      expect(duSurVivante, `${etat} / vivante`).toBe(false);

      if (duSurEchue) {
        declenchements += 1;
      }
      mesures += 2;
    }

    console.info(
      `[garde déclenchement] ${String(mesures)} couples (état × horloge) mesurés — ` +
        `${String(declenchements)} verrouillages dus`,
    );

    expect(mesures).toBe(ETATS_VOCAUX.length * 2);
    expect(mesures).toBe(14);
    expect(declenchements).toBe(6);
  });

  it("tient l'exclusion : jamais vivante ET échue, jamais ni l'une ni l'autre sur un état ouvert", () => {
    // C'est l'invariant qui rend les deux fonctions lisibles ensemble. Sur un
    // état ouvert, exactement une des deux répond vrai ; sur l'état fermé,
    // aucune — il n'y a plus de fenêtre du tout.
    const horloges = [horloge(T0), horloge(T0 + DELAI), horloge(T0 - 1), horloge(Number.NaN)];

    let mesures = 0;
    for (const etat of ETATS_VOCAUX) {
      for (const h of horloges) {
        const vivante = fenetreDeverrouillee(etat, h);
        const du = verrouillageDu(etat, h);

        expect(vivante && du, `${etat}`).toBe(false);
        expect(vivante || du, `${etat}`).toBe(fenetreOuverte(etat));
        mesures += 1;
      }
    }

    console.info(`[garde exclusion] ${String(mesures)} couples (état × horloge) mesurés`);
    expect(mesures).toBe(ETATS_VOCAUX.length * horloges.length);
    expect(mesures).toBe(28);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'affichage dérive du même calcul
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/fenetre — l'instant d'échéance", () => {
  it("rend l'instant d'échéance, et `null` quand il n'y a rien à afficher", () => {
    expect(instantDEcheance(horloge(T0))).toBe(T0 + DELAI);
    expect(instantDEcheance(horloge(T0, T0, 0))).toBeNull();
    expect(instantDEcheance(horloge(T0, Number.NaN))).toBeNull();
  });

  it("ne contredit jamais `evaluerEcheance` — un seul calcul, deux lecteurs", () => {
    // Motif de `niveauPourEcran` dans `core/policy` : deux calculs du même fait
    // finissent par se contredire, et c'est l'écran qui ment.
    let mesures = 0;
    let desaccords = 0;

    for (let ecart = 0; ecart <= DELAI * 2; ecart += DELAI / 4) {
      const h = horloge(T0 + ecart);
      const echeance = instantDEcheance(h);
      const echueSelonEcran = echeance !== null && h.instant >= echeance;

      if (echueSelonEcran !== evaluerEcheance(h).echue) {
        desaccords += 1;
      }
      mesures += 1;
    }

    console.info(
      `[garde écran] ${String(mesures)} instants mesurés — ${String(desaccords)} désaccords`,
    );

    expect(mesures).toBe(9);
    expect(desaccords).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — le délai n'est pas une décision
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/fenetre — le délai reste un paramètre", () => {
  it("porte un délai par défaut dont le NOM dit qu'il n'est pas arbitré", () => {
    // § 30 pose le verrouillage après inactivité ; il ne donne aucune durée, et
    // l'ADR 0010 non plus. Le nom de la constante porte l'écart, pour qu'aucune
    // lecture ultérieure ne prenne cinq minutes pour une décision de Will.
    expect(DELAI_INACTIVITE_NON_ARBITRE_MS).toBeGreaterThan(0);

    // Et la machine ne la lit jamais : le délai voyage dans l'horloge. Une
    // valeur différente change le verdict — c'est ce qui le prouve.
    const court = evaluerEcheance(horloge(T0 + 10, T0, 5));
    const long = evaluerEcheance(horloge(T0 + 10, T0, 5_000));

    console.info(
      `[garde délai paramétré] défaut non arbitré = ${String(DELAI_INACTIVITE_NON_ARBITRE_MS)} ms ; ` +
        `2 délais injectés mesurés (5 ms → ${court.motif}, 5 000 ms → ${long.motif})`,
    );

    expect(court.echue).toBe(true);
    expect(long.echue).toBe(false);
  });
});
