import { describe, expect, it } from "vitest";

import { COMMANDES, peutElargir, type Commande } from "./grammaire.js";
import {
  CHEVILLES,
  PLAFOND_CARACTERES_TRANSCRIPTION,
  formesDe,
  formesEnDouble,
  normaliser,
  reconnaitre,
  reconnaitreDans,
  regimeDe,
  retirerChevilles,
} from "./reconnaissance.js";

/**
 * GARDES DE LA RECONNAISSANCE.
 *
 * L'asymétrie du § 20, portée à la reconnaissance :
 *
 *  · tolérante sur ce qui NE PEUT PAS élargir — un « stop » manqué se redit ;
 *  · STRICTE sur ce qui le peut — un « passe en mode dev » entendu à tort n'a
 *    pas de retour en arrière avant l'expiration du TTL.
 *
 * ⚠️ LE TÉMOIN CENTRAL DE CE FICHIER ISOLE UNE SEULE RÈGLE. Une même grammaire
 *    fabriquée est jouée DEUX FOIS, avec un seul champ changé — l'effet. Les
 *    variantes, l'énoncé, les chevilles, la normalisation : tout le reste est
 *    identique. Si les variantes sont reconnues dans un cas et pas dans
 *    l'autre, c'est l'effet, et rien d'autre, qui a décidé.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/reconnaissance — normalisation", () => {
  it("replie casse, accents, apostrophes, traits d'union et ponctuation", () => {
    const paires: readonly (readonly [string, string])[] = [
      ["Stop", "stop"],
      ["ARRÊTE-TOI", "arrete toi"],
      ["arrête, toi !", "arrete toi"],
      ["  brouillon   seul  ", "brouillon seul"],
      ["s'il te plaît", "s il te plait"],
      ["passe en mode dév", "passe en mode dev"],
      ["…", ""],
    ];

    const ecarts = paires.filter(([brut, attendu]) => normaliser(brut) !== attendu);
    console.info(
      `[garde normalisation] ${String(paires.length)} paires mesurées, ` +
        `${String(ecarts.length)} écart(s)`,
    );
    expect(ecarts).toEqual([]);
  });

  it("les chevilles se retirent AUX BORDS, et le disent", () => {
    const allegee = retirerChevilles(normaliser("euh stop merci"));
    console.info(
      `[garde chevilles] « euh stop merci » → « ${allegee.forme} », ` +
        `${String(allegee.retirees.length)} cheville(s) retirée(s) sur ${String(CHEVILLES.length)} déclarées`,
    );
    expect(allegee.forme).toBe("stop");
    expect(allegee.retirees).toHaveLength(2);

    // AU MILIEU, jamais : « ne stoppe pas » n'est pas un ordre d'arrêt, et
    // aucune cheville ne l'en rapproche.
    expect(retirerChevilles(normaliser("ne stoppe pas")).forme).toBe("ne stoppe pas");
  });

  it("ne boucle pas et ne se vide pas sur une transcription pathologique", () => {
    const allegee = retirerChevilles(normaliser("euh euh euh euh euh"));
    console.info(`[garde chevilles/borne] reste « ${allegee.forme} »`);
    expect(allegee.forme.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — toute la grammaire est reconnue
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/reconnaissance — la grammaire entière", () => {
  it("reconnaît l'énoncé canonique des 5 commandes", () => {
    const resultats = COMMANDES.map((entree) => ({
      attendue: entree.nom,
      obtenue: reconnaitre(entree.enonce).commande,
    }));
    const ecarts = resultats.filter((ligne) => ligne.obtenue !== ligne.attendue);

    console.info(
      `[garde énoncés] ${String(resultats.length)} énoncés mesurés, ` +
        `${String(ecarts.length)} non reconnu(s)`,
    );
    expect(resultats).toHaveLength(5);
    expect(ecarts).toEqual([]);
  });

  it("reconnaît TOUTES les variantes déclarées, sous le régime tolérant", () => {
    const cas = COMMANDES.flatMap((entree) =>
      entree.variantes.map((variante) => ({ attendue: entree.nom, variante })),
    );
    const ecarts = cas.filter((ligne) => reconnaitre(ligne.variante).commande !== ligne.attendue);

    console.info(
      `[garde variantes] ${String(cas.length)} variantes mesurées, ` +
        `${String(ecarts.length)} non reconnue(s)`,
    );
    // Une grammaire sans aucune variante rendrait cette garde verte pour la
    // pire des raisons.
    expect(cas.length).toBeGreaterThanOrEqual(20);
    expect(ecarts).toEqual([]);
  });

  it("reconnaît les variantes prononcées AVEC des chevilles", () => {
    const cas = [
      { texte: "euh stoppe", attendue: "stop" },
      { texte: "arrête-toi s'il te plaît", attendue: "stop" },
      { texte: "ok annule merci", attendue: "annule" },
      { texte: "alors verrouille", attendue: "verrouille" },
      { texte: "bon, mode brouillon", attendue: "brouillon-seul" },
    ] as const;

    const ecarts = cas.filter((ligne) => reconnaitre(ligne.texte).commande !== ligne.attendue);
    console.info(
      `[garde chevilles/tolérant] ${String(cas.length)} phrases mesurées, ` +
        `${String(ecarts.length)} écart(s)`,
    );
    expect(ecarts).toEqual([]);
  });

  it("aucune forme n'est réclamée par deux commandes", () => {
    const verdict = formesEnDouble();
    console.info(
      `[garde collisions] ${String(verdict.formesExaminees)} formes examinées, ` +
        `${String(verdict.doublons.length)} doublon(s)`,
    );
    expect(verdict.formesExaminees).toBeGreaterThan(20);
    expect(verdict.doublons).toEqual([]);
  });

  it("TÉMOIN : une collision fabriquée EST détectée", () => {
    const temoin: readonly Commande[] = [
      {
        nom: "a",
        enonce: "stop",
        variantes: [],
        effet: { axe: "outils", versProfil: null },
        source: "témoin",
        depuis: "1.0.0",
      },
      {
        nom: "b",
        enonce: "arrete",
        variantes: ["stop"],
        effet: { axe: "outils", versProfil: null },
        source: "témoin",
        depuis: "1.0.0",
      },
    ];
    const verdict = formesEnDouble(temoin);
    console.info(
      `[garde collisions/témoin] ${String(verdict.formesExaminees)} formes, ` +
        `doublons : ${verdict.doublons.join(", ")}`,
    );
    expect(verdict.doublons).toEqual(["stop"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — L'ASYMÉTRIE : ce qui élargit n'est JAMAIS reconnu par approximation
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/reconnaissance — le régime STRICT", () => {
  it("le régime est DÉRIVÉ de l'effet : 1 stricte, 4 tolérantes sur 5 commandes", () => {
    const strictes = COMMANDES.filter((entree) => regimeDe(entree) === "stricte");
    const tolerantes = COMMANDES.filter((entree) => regimeDe(entree) === "tolerante");

    console.info(
      `[garde régimes] ${String(COMMANDES.length)} commandes : ` +
        `${String(strictes.length)} stricte(s) — ${strictes.map((c) => c.nom).join(", ")} · ` +
        `${String(tolerantes.length)} tolérante(s)`,
    );
    expect(strictes).toHaveLength(1);
    expect(tolerantes).toHaveLength(4);
    // Et le régime suit `peutElargir`, sans exception.
    for (const entree of COMMANDES) {
      expect(regimeDe(entree) === "stricte").toBe(peutElargir(entree.effet));
    }
    // Une commande stricte n'expose QU'UNE forme.
    for (const entree of strictes) expect(formesDe(entree)).toHaveLength(1);
  });

  it("reconnaît « passe en mode dev » sur des variations de FORME, pas de MOTS", () => {
    const positifs = [
      "passe en mode dev",
      "Passe en mode dev",
      "PASSE EN MODE DEV",
      "passe en mode dev !",
      "  passe   en   mode   dev  ",
      "passe en mode dév",
    ];
    const ecarts = positifs.filter((texte) => reconnaitre(texte).commande !== "mode-dev");
    console.info(
      `[garde strict/positifs] ${String(positifs.length)} formes mesurées, ` +
        `${String(ecarts.length)} non reconnue(s)`,
    );
    expect(ecarts).toEqual([]);
  });

  it("NE reconnaît JAMAIS « passe en mode dev » par approximation — 11 témoins fabriqués", () => {
    // ═══ LE TÉMOIN CENTRAL DU § 20, CÔTÉ RECONNAISSANCE ═══
    //
    // Chacun est une manière plausible de se tromper : un mot mangé, un mot en
    // trop, une cheville, un synonyme, un pluriel. Aucun ne doit ouvrir la
    // surface. Ce qui se passe alors est le repli SÛR : la phrase part au
    // modèle comme dictée libre, et rien n'est exécuté hors modèle.
    const temoins = [
      "passe en mode de",
      "pass en mode dev",
      "passe en mode developpeur",
      "passe en mode dev stp",
      "euh passe en mode dev",
      "passe en mode dev merci",
      "passe mode dev",
      "mode dev",
      "dev",
      "passe en mode dev et annule",
      // ⚠️ ÉCART SIGNALÉ, ET IL EST MESURÉ ICI. L'ADR 0010, § 4, relève la
      //    sortie SAPI en grammaire fermée sur CETTE phrase-là :
      //    `RECONNU : 'passe en mode developpement' | confiance 0.892`.
      //    Le § 30, lui, écrit « passe en mode dev ». Les deux énoncés ne sont
      //    pas le même, et l'énoncé retenu par la grammaire est celui du CDC.
      //    Conséquence : la phrase exacte de la mesure n'est PAS reconnue. À
      //    trancher avant de câbler la grammaire SAPI du lot 8.
      "passe en mode developpement",
    ];

    const reconnus = temoins.filter((texte) => reconnaitre(texte).commande !== null);

    console.info(
      `[garde strict/approximation] ${String(temoins.length)} témoins fabriqués, ` +
        `${String(reconnus.length)} reconnu(s) — 0 attendu`,
    );
    expect(temoins).toHaveLength(11);
    expect(reconnus).toEqual([]);
  });

  it("TÉMOIN ISOLANT UNE SEULE RÈGLE : mêmes variantes, seul l'effet change", () => {
    // ═══ LA GARDE QUI PROUVE QUE LA STRICTESSE EST STRUCTURELLE ═══
    //
    // Deux grammaires identiques à UN CHAMP PRÈS. Si les variantes étaient
    // consultées « sauf pour les commandes dangereuses » par un filtre écrit à
    // la main, ce test resterait vert en changeant ce filtre. Ici c'est l'effet,
    // et lui seul, qui fait basculer le régime.
    const quiElargit = [
      {
        nom: "temoin",
        enonce: "bascule",
        variantes: ["bascule maintenant", "bascule stp"],
        effet: { axe: "outils", versProfil: "dev" },
        source: "témoin",
        depuis: "1.0.0",
      },
    ] as const satisfies readonly Commande[];

    const quiNElargitPas = [
      {
        nom: "temoin",
        enonce: "bascule",
        variantes: ["bascule maintenant", "bascule stp"],
        // ⬅️ LE SEUL CHANGEMENT.
        effet: { axe: "outils", versProfil: null },
        source: "témoin",
        depuis: "1.0.0",
      },
    ] as const satisfies readonly Commande[];

    const varianteTestee = "bascule maintenant";
    const avecCheville = "euh bascule";

    const sousElargissement = {
      canonique: reconnaitreDans("bascule", quiElargit).commande,
      variante: reconnaitreDans(varianteTestee, quiElargit).commande,
      cheville: reconnaitreDans(avecCheville, quiElargit).commande,
      formes: formesDe(quiElargit[0]).length,
    };
    const sansElargissement = {
      canonique: reconnaitreDans("bascule", quiNElargitPas).commande,
      variante: reconnaitreDans(varianteTestee, quiNElargitPas).commande,
      cheville: reconnaitreDans(avecCheville, quiNElargitPas).commande,
      formes: formesDe(quiNElargitPas[0]).length,
    };

    console.info(
      `[garde asymétrie] effet « vers dev » → formes=${String(sousElargissement.formes)} ` +
        `variante=${String(sousElargissement.variante)} cheville=${String(sousElargissement.cheville)} · ` +
        `effet « ensemble vide » → formes=${String(sansElargissement.formes)} ` +
        `variante=${String(sansElargissement.variante)} cheville=${String(sansElargissement.cheville)}`,
    );

    // L'énoncé canonique passe dans les DEUX cas : la stricte n'est pas un refus
    // global, c'est un refus de tout ce qui n'est pas l'énoncé exact.
    expect(sousElargissement.canonique).toBe("temoin");
    expect(sansElargissement.canonique).toBe("temoin");

    // Sous élargissement : ni variante, ni cheville. Une seule forme lisible.
    expect(sousElargissement.formes).toBe(1);
    expect(sousElargissement.variante).toBeNull();
    expect(sousElargissement.cheville).toBeNull();

    // Sans élargissement, LES MÊMES ENTRÉES passent. Le témoin discrimine.
    expect(sansElargissement.formes).toBe(3);
    expect(sansElargissement.variante).toBe("temoin");
    expect(sansElargissement.cheville).toBe("temoin");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — les refus, et ce qu'ils disent
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/reconnaissance — ce qui n'est pas une commande", () => {
  it("aucune reconnaissance par SOUS-CHAÎNE : une phrase dictée n'est pas un ordre", () => {
    const dictees = [
      "ne stoppe pas maintenant",
      "il faut que tu me dises stop quand c'est fini",
      "prépare un brouillon seul pour l'OPCO", // contient « brouillon seul »
      "annule la réunion de jeudi dans l'agenda",
      "verrouille la porte",
    ];
    const reconnues = dictees.filter((texte) => reconnaitre(texte).commande !== null);

    console.info(
      `[garde sous-chaîne] ${String(dictees.length)} phrases dictées mesurées, ` +
        `${String(reconnues.length)} prise(s) pour une commande — 0 attendu`,
    );
    expect(reconnues).toEqual([]);
  });

  it("le refus DIT ce qui a été comparé, et combien", () => {
    const resultat = reconnaitre("ouvre le tableau des relances Qualiopi");
    console.info(`[garde refus] ${resultat.motif}`);
    expect(resultat.commande).toBeNull();
    expect(resultat.regime).toBeNull();
    expect(resultat.formesExaminees).toBeGreaterThan(20);
    expect(resultat.motif).toContain("dictée libre");
  });

  it("au-delà du plafond de caractères, plus rien n'est cherché", () => {
    const longue = `stop${" ".repeat(PLAFOND_CARACTERES_TRANSCRIPTION)}`;
    const resultat = reconnaitre(longue);
    console.info(`[garde plafond] ${String(longue.length)} caractères → ${resultat.motif}`);
    expect(resultat.commande).toBeNull();
    expect(resultat.formesExaminees).toBe(0);
    // ET la borne mord bien juste en dessous : « stop » seul reste reconnu.
    expect(reconnaitre("stop").commande).toBe("stop");
  });

  it("une transcription vide ne s'apparie à rien", () => {
    for (const vide of ["", "   ", "…", "!!!"]) {
      expect(reconnaitre(vide).commande).toBeNull();
    }
  });
});
