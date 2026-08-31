import { describe, expect, it } from "vitest";

import { sha256Hex } from "./canonique.js";
import type { ChargeCloture } from "./cloture.js";
import { construireCloture, decoderCharge, encoderCharge, estLigneDeCloture } from "./cloture.js";
import {
  SCELLEUR_TEMOIN,
  HorlogeFigee,
  construireJournal,
  empreinteEtrangere,
} from "./fixtures.js";
import { Journal } from "./journal.js";
import type { JournalMemoire } from "./memoire.js";
import { ErreurPurge, cumulAncrageTete, dateLimiteRetention, preparerPurge } from "./purge.js";
import { verifierChaine } from "./verification.js";
import type { LigneAudit } from "./vocabulaire.js";
import { SESSION_HORS_APPEL } from "./vocabulaire.js";

/**
 * Gardes de LA PURGE ANCRÉE (§ 31).
 *
 * Critère de fini du lot 10, mot pour mot : « la purge s'exécute, journalise
 * son passage, et la vérification d'intégrité reste verte APRÈS la purge — test
 * qui annonce combien de tranches il a vérifiées ».
 *
 * Et la règle qui la rend nécessaire : « le vérificateur n'accepte un saut que
 * s'il est ancré ». Les trois témoins ci-dessous fabriquent les trois façons de
 * rater un ancrage — pas de clôture, mauvaise borne, clôture recopiée — et
 * chacun doit rougir.
 */

const ARG_HASH = sha256Hex("purge-temoin");

/**
 * Exécute une purge de préfixe : prépare la clôture, l'écrit, PUIS supprime.
 * L'ordre n'est pas indifférent — supprimer d'abord laisserait, entre les deux,
 * une fenêtre où le journal est troué sans ancre.
 */
async function purger(
  store: JournalMemoire,
  nombreARetirer: number,
): Promise<{ retirees: number; charge: ChargeCloture }> {
  const toutes = store.toutes();
  const lignesARetirer = toutes.slice(0, nombreARetirer);
  const pointe = toutes[toutes.length - 1];
  if (pointe === undefined) throw new Error("témoin mal fabriqué : journal vide");

  const preparee = preparerPurge({
    lignesARetirer,
    cumulAnterieur: cumulAncrageTete(toutes),
    empreinteDerniereConservee: pointe.selfHash,
    argHash: ARG_HASH,
    at: new Date(Date.UTC(2026, 8, 1)),
  });

  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
  await journal.journaliser(preparee.cloture);
  const retirees = store.supprimerIntervalle(preparee.seqDepuis, preparee.seqJusqua);

  return { retirees, charge: preparee.charge };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — un saut ANCRÉ reste valide
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — un saut ancré par une clôture reste valide (§ 31)", () => {
  it("vérifie le journal purgé, et annonce lignes et tranches", async () => {
    const store = await construireJournal(12);
    const { retirees, charge } = await purger(store, 4);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[garde purge ancrée] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.sautsAncres)} saut(s) ancré(s), ` +
        `${String(rapport.lignesRetireesAncrees)} lignes retirées attestées`,
    );

    expect(retirees).toBe(4);
    expect(charge.lignesRetirees).toBe(4);
    // 12 lignes − 4 retirées + 1 clôture.
    expect(rapport.lignesVerifiees).toBe(9);
    expect(rapport.clotures).toBe(1);
    expect(rapport.sautsAncres).toBe(1);
    expect(rapport.lignesRetireesAncrees).toBe(4);
    expect(rapport.valide).toBe(true);
    expect(rapport.anomalies).toEqual([]);
  });

  it("cumule le décompte de deux purges successives", async () => {
    // La clôture s'appuie à la POINTE : elle survit à la purge suivante, qui,
    // elle, ronge la tête. Sans cumul, la seconde purge effacerait le décompte
    // de la première et le journal oublierait combien de lignes ont disparu.
    const store = await construireJournal(14);
    await purger(store, 4);
    const { charge } = await purger(store, 5);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[garde purge · cumul] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.lignesRetireesAncrees)} lignes retirées attestées, ` +
        `${String(rapport.ancresInutilisees)} ancre(s) inutilisée(s)`,
    );

    expect(charge.lignesRetireesCumulees).toBe(9);
    expect(rapport.valide).toBe(true);
    expect(rapport.sautsAncres).toBe(1);
    expect(rapport.lignesRetireesAncrees).toBe(9);
    // L'ancre de la première purge n'ancre plus rien : elle est comptée, pas
    // condamnée. C'est un signal, pas une anomalie.
    expect(rapport.ancresInutilisees).toBe(1);
  });

  it("hérite du décompte d'une clôture que la purge emporte elle-même", async () => {
    // Le cas en cascade : la deuxième purge est assez large pour retirer la
    // clôture de la première. Si son décompte n'était pas hérité AVANT la
    // suppression, le journal oublierait quatre lignes sans que rien ne rougisse
    // — un oubli silencieux étant précisément ce que l'ancrage doit empêcher.
    const store = await construireJournal(14);
    await purger(store, 4); // retire 4 lignes, pose la clôture C1 à la pointe

    // Le journal continue de vivre : C1 se retrouve AU MILIEU, donc à portée de
    // la purge suivante.
    await construireJournal(3, store);

    const avantSeconde = store.toutes();
    expect(avantSeconde.filter(estLigneDeCloture)).toHaveLength(1);

    // Le préfixe s'arrête juste après C1 : il l'emporte.
    const rangDeC1 = avantSeconde.findIndex(estLigneDeCloture);
    const { charge } = await purger(store, rangDeC1 + 1);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[garde purge · cascade] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.lignesRetireesAncrees)} lignes retirées attestées, ` +
        `${String(rapport.ancresInutilisees)} ancre(s) inutilisée(s)`,
    );

    // La seconde purge emporte dix lignes et la clôture C1 : onze au total.
    expect(charge.lignesRetirees).toBe(11);
    // Et elle hérite des quatre de la première : quinze lignes disparues en tout.
    expect(charge.lignesRetireesCumulees).toBe(15);
    expect(rapport.valide).toBe(true);
    expect(rapport.sautsAncres).toBe(1);
    expect(rapport.lignesRetireesAncrees).toBe(15);
    // L'ancienne clôture est partie : plus aucune ancre ne reste orpheline.
    expect(rapport.ancresInutilisees).toBe(0);
    expect(rapport.clotures).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les trois façons de rater un ancrage
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — un saut NON ancré ne passe pas", () => {
  it("témoin 1 : la même tranche retirée SANS clôture rougit", async () => {
    const store = await construireJournal(12);
    const toutes = store.toutes();
    const premiere = toutes[0];
    const quatrieme = toutes[3];
    if (premiere === undefined || quatrieme === undefined) throw new Error("témoin mal fabriqué");

    store.supprimerIntervalle(premiere.seq, quatrieme.seq);
    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[témoin sans clôture] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `valide = ${String(rapport.valide)}`,
    );

    expect(rapport.lignesVerifiees).toBe(8);
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("tête-non-ancrée");
  });

  it("témoin 2 : une clôture dont la borne droite n'est pas la bonne rougit", async () => {
    const store = await construireJournal(12);
    const toutes = store.toutes();
    const pointe = toutes[toutes.length - 1];
    const premiere = toutes[0];
    const quatrieme = toutes[3];
    if (pointe === undefined || premiere === undefined || quatrieme === undefined) {
      throw new Error("témoin mal fabriqué");
    }

    // Une ancre qui ne borne pas le vrai trou est PIRE que pas d'ancre : elle
    // prétendrait rendre le journal vert. Elle doit donc être inopérante.
    const chargeFaussee: ChargeCloture = {
      seqDepuis: premiere.seq,
      seqJusqua: quatrieme.seq,
      lignesRetirees: 4,
      lignesRetireesCumulees: 4,
      empreinteAvantSaut: null,
      empreinteDerniereRetiree: empreinteEtrangere("mauvaise-borne"),
      empreinteDerniereConservee: pointe.selfHash,
    };

    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    await journal.journaliser({
      at: new Date(Date.UTC(2026, 8, 1)),
      principal: "system",
      // ADR 0014 — un témoin de clôture porte la MÊME valeur réservée que
      // `construireCloture()` : une purge n'a pas de session de pilotage.
      sessionId: SESSION_HORS_APPEL,
      tool: "ops.audit.purge",
      toolVersion: "1",
      adapterVersion: "1",
      effect: "destructive",
      policyLevel: "brouillon",
      decision: "autorisé",
      stepDenied: null,
      argHash: ARG_HASH,
      argHashValidated: true,
      recordIds: [],
      partialSources: encoderCharge(chargeFaussee),
      durationMs: 0,
      outcome: "ok",
      // ADR 0017 — la MÊME valeur que `construireCloture` dérive : une purge
      // retire du journal, et cela se voit de l'extérieur. Un témoin qui
      // écrirait `false` ici fabriquerait une clôture que la production ne
      // produit pas, et la garde mesurerait un objet imaginaire.
      externalEffect: true,
    });
    store.supprimerIntervalle(premiere.seq, quatrieme.seq);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    console.info(
      `[témoin mauvaise borne] ${String(rapport.clotures)} clôture(s) lue(s), ` +
        `${String(rapport.sautsAncres)} saut(s) ancré(s)`,
    );

    expect(rapport.clotures).toBe(1);
    expect(rapport.sautsAncres).toBe(0);
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("tête-non-ancrée");
  });

  it("témoin 3 : une clôture recopiée d'une autre purge est signalée incohérente", async () => {
    // `empreinteDerniereConservee` est structurellement le `prevHash` de la
    // clôture. La répéter dans la charge lui donne un travail : les deux doivent
    // coïncider, et une clôture fabriquée ailleurs ne peut pas satisfaire les deux.
    const store = await construireJournal(8);
    const toutes = store.toutes();
    const premiere = toutes[0];
    const seconde = toutes[1];
    if (premiere === undefined || seconde === undefined) throw new Error("témoin mal fabriqué");

    const charge: ChargeCloture = {
      seqDepuis: premiere.seq,
      seqJusqua: seconde.seq,
      lignesRetirees: 2,
      lignesRetireesCumulees: 2,
      empreinteAvantSaut: null,
      empreinteDerniereRetiree: seconde.selfHash,
      // Recopiée d'ailleurs : ce n'est pas la pointe de CE journal.
      empreinteDerniereConservee: empreinteEtrangere("autre-purge"),
    };

    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    await journal.journaliser({
      at: new Date(Date.UTC(2026, 8, 1)),
      principal: "system",
      // ADR 0014 — un témoin de clôture porte la MÊME valeur réservée que
      // `construireCloture()` : une purge n'a pas de session de pilotage.
      sessionId: SESSION_HORS_APPEL,
      tool: "ops.audit.purge",
      toolVersion: "1",
      adapterVersion: "1",
      effect: "destructive",
      policyLevel: "brouillon",
      decision: "autorisé",
      stepDenied: null,
      argHash: ARG_HASH,
      argHashValidated: true,
      recordIds: [],
      partialSources: encoderCharge(charge),
      durationMs: 0,
      outcome: "ok",
      // ADR 0017 — la MÊME valeur que `construireCloture` dérive : une purge
      // retire du journal, et cela se voit de l'extérieur. Un témoin qui
      // écrirait `false` ici fabriquerait une clôture que la production ne
      // produit pas, et la garde mesurerait un objet imaginaire.
      externalEffect: true,
    });
    store.supprimerIntervalle(premiere.seq, seconde.seq);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    console.info(
      `[témoin clôture recopiée] genres : ${rapport.anomalies.map((a) => a.genre).join(", ")}`,
    );

    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("clôture-incohérente");
  });

  it("témoin 4 : une clôture dont la charge est illisible n'ancre rien", async () => {
    const store = await construireJournal(6);
    const toutes = store.toutes();
    const premiere = toutes[0];
    if (premiere === undefined) throw new Error("témoin mal fabriqué");

    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    await journal.journaliser({
      at: new Date(Date.UTC(2026, 8, 1)),
      principal: "system",
      // ADR 0014 — un témoin de clôture porte la MÊME valeur réservée que
      // `construireCloture()` : une purge n'a pas de session de pilotage.
      sessionId: SESSION_HORS_APPEL,
      tool: "ops.audit.purge",
      toolVersion: "1",
      adapterVersion: "1",
      effect: "destructive",
      policyLevel: "brouillon",
      decision: "autorisé",
      stepDenied: null,
      argHash: ARG_HASH,
      argHashValidated: true,
      recordIds: [],
      partialSources: ["cloture=9", "n-importe-quoi"],
      durationMs: 0,
      outcome: "ok",
      // ADR 0017 — la MÊME valeur que `construireCloture` dérive : une purge
      // retire du journal, et cela se voit de l'extérieur. Un témoin qui
      // écrirait `false` ici fabriquerait une clôture que la production ne
      // produit pas, et la garde mesurerait un objet imaginaire.
      externalEffect: true,
    });
    store.supprimerIntervalle(premiere.seq, premiere.seq);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    expect(rapport.clotures).toBe(1);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("clôture-illisible");
    expect(rapport.valide).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — l'encodage de la charge
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — l'encodage de la charge de clôture", () => {
  it("fait un aller-retour fidèle, et rougit sur cinq mutilations", () => {
    const charge: ChargeCloture = {
      seqDepuis: 1n,
      seqJusqua: 1200n,
      lignesRetirees: 1200,
      lignesRetireesCumulees: 1500,
      empreinteAvantSaut: null,
      empreinteDerniereRetiree: empreinteEtrangere("derniere-retiree"),
      empreinteDerniereConservee: empreinteEtrangere("derniere-conservee"),
    };

    const encodee = encoderCharge(charge);
    expect(decoderCharge(encodee)).toEqual(charge);

    // Aucun champ ne porte d'espace : la clôture obéit à sa propre règle du § 31.
    for (const entree of encodee) {
      expect(entree).not.toMatch(/\s/);
    }

    const mutilations: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["version inconnue", encodee.map((e) => e.replace("cloture=1", "cloture=42"))],
      ["borne droite absente", encodee.filter((e) => !e.startsWith("empreinteDerniereRetiree="))],
      [
        "borne droite nulle",
        encodee.map((e) => e.replace(/^empreinteDerniereRetiree=.*/, "empreinteDerniereRetiree=-")),
      ],
      ["compte nul", encodee.map((e) => e.replace(/^lignesRetirees=.*/, "lignesRetirees=0"))],
      [
        "cumul inférieur au compte",
        encodee.map((e) => e.replace(/^lignesRetireesCumulees=.*/, "lignesRetireesCumulees=1")),
      ],
    ];

    const laxistes: string[] = [];
    for (const [nom, mutilee] of mutilations) {
      if (decoderCharge(mutilee) !== null) laxistes.push(nom);
    }

    console.info(
      `[garde encodage] ${String(encodee.length)} champs encodés, ` +
        `${String(mutilations.length)} mutilations éprouvées`,
    );

    expect(encodee).toHaveLength(8);
    expect(laxistes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — la préparation refuse ce qu'elle ne peut pas ancrer
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — `preparerPurge` refuse bruyamment", () => {
  it("refuse une tranche vide, une tranche du milieu, et une tranche trouée", async () => {
    const store = await construireJournal(8);
    const toutes = store.toutes();
    const pointe = toutes[toutes.length - 1];
    if (pointe === undefined) throw new Error("témoin mal fabriqué");

    const commun = {
      cumulAnterieur: 0,
      empreinteDerniereConservee: pointe.selfHash,
      argHash: ARG_HASH,
      argHashValidated: true,
      at: new Date(Date.UTC(2026, 8, 1)),
    };

    const refus: ReadonlyArray<readonly [string, readonly LigneAudit[]]> = [
      ["tranche vide", []],
      ["tranche du milieu", toutes.slice(3, 6)],
      ["tranche trouée", [toutes[0], toutes[2]].filter((l): l is LigneAudit => l !== undefined)],
    ];

    const acceptes: string[] = [];
    for (const [nom, lignesARetirer] of refus) {
      try {
        preparerPurge({ ...commun, lignesARetirer });
        acceptes.push(nom);
      } catch (erreur: unknown) {
        expect(erreur).toBeInstanceOf(ErreurPurge);
      }
    }

    console.info(`[garde preparerPurge] ${String(refus.length)} tranches fautives éprouvées`);
    expect(refus).toHaveLength(3);
    expect(acceptes).toEqual([]);
  });

  it("reconnaît une ligne de clôture par son nom d'outil", async () => {
    const store = await construireJournal(5);
    await purger(store, 2);
    const clotures = store.toutes().filter(estLigneDeCloture);

    console.info(`[garde reconnaissance] ${String(clotures.length)} clôture(s) reconnue(s)`);
    expect(clotures).toHaveLength(1);
    expect(cumulAncrageTete(store.toutes())).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — la limite de rétention
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — la limite de rétention se calcule en UTC", () => {
  it("recule de douze mois sans dépendre du fuseau du processus", () => {
    const limite = dateLimiteRetention(new Date(Date.UTC(2026, 7, 30, 12, 0, 0)));
    expect(limite.toISOString()).toBe("2025-08-30T12:00:00.000Z");
  });

  it("ne DÉBORDE pas sur le mois suivant quand le quantième n'existe pas", () => {
    // MESURÉ AVANT CORRECTIF : un 29 février reculait sur un 29 février
    // inexistant, que la date reportait au 1ᵉʳ mars — la limite avançait d'un
    // jour, et la purge, IRRÉVERSIBLE, emportait un jour encore en ligne.
    const debordements: string[] = [];
    const cas: ReadonlyArray<readonly [string, Date, string]> = [
      ["29 février", new Date(Date.UTC(2028, 1, 29, 6, 0, 0)), "2027-02-28T06:00:00.000Z"],
      ["31 août", new Date(Date.UTC(2026, 7, 31, 6, 0, 0)), "2025-08-31T06:00:00.000Z"],
      ["1ᵉʳ mars", new Date(Date.UTC(2028, 2, 1, 6, 0, 0)), "2027-03-01T06:00:00.000Z"],
    ];

    for (const [nom, instant, attendu] of cas) {
      if (dateLimiteRetention(instant).toISOString() !== attendu) debordements.push(nom);
    }

    console.info(`[garde rétention] ${String(cas.length)} quantièmes éprouvés`);
    expect(cas).toHaveLength(3);
    expect(debordements).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
//  Garde 6 - les ancres d'une AUTRE tranche passent la meme porte
// -----------------------------------------------------------------------------

describe("core/audit — une ancre venue d'une autre tranche est ré-admise, jamais crue", () => {
  it("ancre bel et bien le trou quand on lui passe la LIGNE de clôture", async () => {
    // Le cas d'exploitation : douze mois de journal se vérifient par tranches,
    // et la clôture vit à la POINTE alors que le trou qu'elle justifie est à la
    // TÊTE. Sans ce chemin, tout journal purgé serait déclaré rouge dès qu'on
    // le lit autrement que d'un bloc.
    const store = await construireJournal(12);
    await purger(store, 4);

    const restant = store.toutes();
    const cloture = restant.find(estLigneDeCloture);
    if (cloture === undefined) throw new Error("témoin mal fabriqué : pas de clôture");

    const tete = restant.slice(0, 4);
    const rapport = verifierChaine(SCELLEUR_TEMOIN, tete, { ancresConnues: [cloture] });

    console.info(
      `[garde ancre hors tranche] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.sautsAncres)} saut(s) ancré(s)`,
    );

    expect(rapport.lignesVerifiees).toBe(4);
    expect(rapport.sautsAncres).toBe(1);
    expect(rapport.valide).toBe(true);
  });

  it("REFUSE une clôture forgée à la main : elle n'atteste pas son propre chaînon", async () => {
    // MESURÉ AVANT CORRECTIF : `ancresConnues` recevait une charge DÉJÀ DÉCODÉE,
    // donc crue sur parole — zéro contrôle. Quatre lignes retirées sans la
    // moindre clôture, plus une charge fabriquée à la main, et la vérification
    // rendait `valide = true` sur un journal tronqué. Une ancre qu'on croit sur
    // parole n'ancre rien.
    //
    // Depuis, une ancre hors tranche passe la MÊME porte que les autres : son
    // empreinte doit se recalculer, et son `empreinteDerniereConservee` doit
    // valoir son propre `prevHash`. Le témoin ci-dessous échoue sur la seconde
    // condition — c'est le cas « clôture recopiée d'ailleurs ».
    const store = await construireJournal(12);
    const toutes = store.toutes();
    const premiere = toutes[0];
    const quatrieme = toutes[3];
    if (premiere === undefined || quatrieme === undefined) {
      throw new Error("témoin mal fabriqué");
    }

    store.supprimerIntervalle(premiere.seq, quatrieme.seq);

    const autre = await construireJournal(3);
    const chargeForgee: ChargeCloture = {
      seqDepuis: premiere.seq,
      seqJusqua: quatrieme.seq,
      lignesRetirees: 4,
      lignesRetireesCumulees: 4,
      empreinteAvantSaut: null,
      empreinteDerniereRetiree: quatrieme.selfHash,
      // Recopiée d'ailleurs : ce n'est la pointe d'aucun des deux journaux.
      empreinteDerniereConservee: empreinteEtrangere("pointe-inventée"),
    };
    const journalEtranger = new Journal(SCELLEUR_TEMOIN, autre, new HorlogeFigee());
    await journalEtranger.journaliser(
      construireCloture(chargeForgee, ARG_HASH, new Date(Date.UTC(2026, 8, 1))),
    );
    const clotureForgee = autre.toutes().find(estLigneDeCloture);
    if (clotureForgee === undefined) throw new Error("témoin mal fabriqué");

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes(), {
      ancresConnues: [clotureForgee],
    });

    console.info(
      `[témoin ancre forgée] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.ancresHorsTranche)} ancre(s) hors tranche admise(s), ` +
        `valide = ${String(rapport.valide)}`,
    );

    expect(rapport.lignesVerifiees).toBe(8);
    expect(rapport.ancresHorsTranche).toBe(0);
    expect(rapport.sautsAncres).toBe(0);
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("tête-non-ancrée");
  });

  it("COMPTE les ancres hors tranche : une vérification adossée n'est pas autoportante", async () => {
    // BORNE ASSUMÉE, écrite ici pour qu'elle ne se découvre pas en production :
    // une clôture LUE DANS LA TRANCHE est chaînée dans la chaîne qu'elle
    // atteste — on ne peut pas l'y glisser après coup sans casser un chaînon.
    // Une clôture reçue par `ancresConnues` n'a PAS ce lien : rien ne prouve
    // localement qu'elle vient du même journal. Le rapport le DIT, plutôt que de
    // rendre un vert indistinguable d'un vert autoportant.
    const store = await construireJournal(12);
    await purger(store, 4);
    const cloture = store.toutes().find(estLigneDeCloture);
    if (cloture === undefined) throw new Error("témoin mal fabriqué");

    const adosse = verifierChaine(SCELLEUR_TEMOIN, store.toutes().slice(0, 4), {
      ancresConnues: [cloture],
    });
    const autoportant = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[garde ancres hors tranche] adossée : ${String(adosse.ancresHorsTranche)} · ` +
        `autoportante : ${String(autoportant.ancresHorsTranche)}`,
    );

    expect(adosse.valide).toBe(true);
    expect(adosse.ancresHorsTranche).toBe(1);
    expect(autoportant.valide).toBe(true);
    expect(autoportant.ancresHorsTranche).toBe(0);
  });
});

// -----------------------------------------------------------------------------
//  Garde 7 - le COMPTE de lignes retirees n'est plus une simple declaration
// -----------------------------------------------------------------------------

describe("core/audit — la charge ne peut pas mentir sur la tranche qu'elle atteste", () => {
  it("refuse un compte plus grand que la tranche déclarée ne peut en contenir", () => {
    // `seq` est un ordre total sans réinsertion : entre 10 et 12 il n'y a jamais
    // eu plus de trois lignes. Un compte de quatre est arithmétiquement faux.
    const bornes: ReadonlyArray<readonly [string, number, boolean]> = [
      ["compte exact", 3, true],
      ["compte inférieur", 2, true],
      ["compte impossible", 4, false],
    ];

    const desaccords: string[] = [];
    for (const [nom, lignesRetirees, admisAttendu] of bornes) {
      const encodee = encoderCharge({
        seqDepuis: 10n,
        seqJusqua: 12n,
        lignesRetirees,
        lignesRetireesCumulees: lignesRetirees,
        empreinteAvantSaut: null,
        empreinteDerniereRetiree: empreinteEtrangere("borne-droite"),
        empreinteDerniereConservee: empreinteEtrangere("pointe"),
      });
      const admis = decoderCharge(encodee) !== null;
      if (admis !== admisAttendu) desaccords.push(nom);
    }

    console.info(`[garde compte borné] ${String(bornes.length)} comptes éprouvés`);
    expect(bornes).toHaveLength(3);
    expect(desaccords).toEqual([]);
  });

  it("signale une clôture dont les `seq` ne peuvent pas être ceux du trou observé", async () => {
    // MESURÉ AVANT CORRECTIF : une clôture attestant « 1 ligne retirée entre
    // seq 900 et 999 » ancrait un trou réel de quatre lignes en seq 1..4, et le
    // rapport publiait `lignesRetireesAncrees = 1`. Les empreintes bornaient le
    // trou, les `seq` n'étaient confrontés à rien.
    const store = await construireJournal(12);
    const toutes = store.toutes();
    const premiere = toutes[0];
    const quatrieme = toutes[3];
    const pointe = toutes[toutes.length - 1];
    if (premiere === undefined || quatrieme === undefined || pointe === undefined) {
      throw new Error("témoin mal fabriqué");
    }

    const menteuse: ChargeCloture = {
      seqDepuis: 900n,
      seqJusqua: 999n,
      lignesRetirees: 1,
      lignesRetireesCumulees: 1,
      empreinteAvantSaut: null,
      empreinteDerniereRetiree: quatrieme.selfHash,
      empreinteDerniereConservee: pointe.selfHash,
    };

    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    await journal.journaliser(
      construireCloture(menteuse, ARG_HASH, new Date(Date.UTC(2026, 8, 1))),
    );
    store.supprimerIntervalle(premiere.seq, quatrieme.seq);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    console.info(
      `[garde seq attestés] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `genres : ${rapport.anomalies.map((a) => a.genre).join(", ")}`,
    );

    expect(rapport.valide).toBe(false);
    expect(rapport.sautsAncres).toBe(0);
    expect(rapport.lignesRetireesAncrees).toBe(0);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("clôture-hors-du-trou");
  });

  it("refuse de préparer une purge sans empreinte de dernière ligne conservée", async () => {
    // La clôture s'écrit AVANT la suppression : la pointe existe toujours. Un
    // `null` fabriquerait une clôture incohérente avec son propre chaînon,
    // c'est-à-dire une purge qui casse le journal qu'elle prétend sceller.
    const store = await construireJournal(6);
    const toutes = store.toutes();

    expect(() =>
      preparerPurge({
        lignesARetirer: toutes.slice(0, 2),
        cumulAnterieur: 0,
        empreinteDerniereConservee: null,
        argHash: ARG_HASH,
        at: new Date(Date.UTC(2026, 8, 1)),
      }),
    ).toThrow(ErreurPurge);
  });
});
