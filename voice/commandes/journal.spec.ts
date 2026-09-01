import { describe, expect, it } from "vitest";

import {
  CHAMPS_COUVERTS,
  DECISIONS,
  EFFET_EXTERIEUR_NON_SURVENU,
  OUTCOMES,
  SESSION_HORS_APPEL,
  VERSION_INCONNUE,
  type ContenuLigne,
} from "../../core/audit/index.js";
import { EFFECTS } from "../../core/types.js";
import { GRAMMAIRE_VERSION, NOMS_COMMANDES } from "./grammaire.js";
import {
  EFFET_DE_COMMANDE_HORS_MODELE,
  ISSUES_DE_COMMANDE,
  PREFIXE_OUTIL_VOIX,
  argumentsAEmpreindre,
  ligneDeCommande,
  nomAuJournal,
  projeterAuJournal,
  traduireIssue,
  type ChampsDuDemon,
  type EvenementCommandeHorsModele,
  type IssueDeCommande,
  type JournalDesCommandes,
} from "./journal.js";
import { reconnaitre } from "./reconnaissance.js";

/**
 * GARDES DU PORT DE JOURNAL — § 18.
 *
 * « Journalisation de chaque commande hors modèle AU MÊME TITRE qu'un appel
 *   d'outil. » Ce qu'il faut établir :
 *
 *  1. la ligne composée couvre EXACTEMENT les champs que `core/audit` chaîne —
 *     confrontée à `CHAMPS_COUVERTS`, jamais à une liste écrite ici ;
 *  2. chaque issue tombe dans le vocabulaire FERMÉ de `core/audit`, et une
 *     issue non classée LÈVE au lieu de tomber du bon côté ;
 *  3. AUCUN mot de la transcription n'atteint le journal.
 */

const CHAMPS_DU_DEMON: ChampsDuDemon = {
  at: new Date("2026-09-01T10:00:00.000Z"),
  principal: "will",
  sessionId: SESSION_HORS_APPEL,
  argHash: "a".repeat(64),
  durationMs: 119,
  policyLevel: "brouillon",
};

function evenement(issue: IssueDeCommande): EvenementCommandeHorsModele {
  return {
    commande: "stop",
    issue,
    tri: {
      axe: "outils",
      chemin: issue === "remise-au-desserrage" ? "desserrage" : "sans-facteur",
      elargit: issue === "remise-au-desserrage",
      reduitStrictement: issue !== "remise-au-desserrage",
      mesureAveugle: false,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la ligne couvre exactement ce que le chaînage couvre
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/journal — la ligne est une ligne d'`ops_audit`", () => {
  it("CONFRONTATION : les champs de la ligne composée sont exactement `CHAMPS_COUVERTS`", () => {
    // ⚠️ DÉRIVÉE, PAS RECOPIÉE. Si `core/audit` ajoute un champ à l'empreinte
    //    chaînée, cette garde rougit — et le `Omit`/`Pick` de `journal.ts` fait
    //    déjà échouer `tsc` en amont. Deux étages, et le second nomme le champ.
    const ligne = ligneDeCommande(evenement("exécutée"), CHAMPS_DU_DEMON);

    const presents = Object.keys(ligne).sort();
    const attendus = [...CHAMPS_COUVERTS].sort();
    const manquants = attendus.filter((champ) => !presents.includes(champ));
    const enTrop = presents.filter((champ) => !attendus.includes(champ as never));

    console.info(
      `[garde champs] ${String(presents.length)} champs composés, ` +
        `${String(attendus.length)} champs couverts par le chaînage · ` +
        `${String(manquants.length)} manquant(s), ${String(enTrop.length)} en trop`,
    );
    expect(attendus.length).toBeGreaterThan(10);
    expect(manquants).toEqual([]);
    expect(enTrop).toEqual([]);
  });

  it("la partition dérivés / démon est disjointe et complète", () => {
    const derives = Object.keys(projeterAuJournal(evenement("exécutée")));
    const duDemon = Object.keys(CHAMPS_DU_DEMON);
    const communs = derives.filter((champ) => duDemon.includes(champ));

    console.info(
      `[garde partition] ${String(derives.length)} champs dérivés + ` +
        `${String(duDemon.length)} champs du démon = ` +
        `${String(derives.length + duDemon.length)} · ${String(communs.length)} recouvrement(s)`,
    );
    expect(communs).toEqual([]);
    expect(derives.length + duDemon.length).toBe(CHAMPS_COUVERTS.length);
  });

  it("les valeurs dérivées sont celles du socle, pas des littéraux inventés", () => {
    const projete = projeterAuJournal(evenement("exécutée"));

    console.info(
      `[garde valeurs] tool=${projete.tool} · toolVersion=${projete.toolVersion} · ` +
        `adapterVersion=${projete.adapterVersion} · effect=${projete.effect} · ` +
        `externalEffect=${String(projete.externalEffect)}`,
    );

    expect(projete.tool).toBe("ops.voix.stop");
    // La version qui a servi est celle de la GRAMMAIRE (§ 13.4, transposé).
    expect(projete.toolVersion).toBe(GRAMMAIRE_VERSION);
    // Valeur réservée du socle, pas une chaîne vide.
    expect(projete.adapterVersion).toBe(VERSION_INCONNUE);
    expect(projete.externalEffect).toBe(EFFET_EXTERIEUR_NON_SURVENU);
    expect(projete.externalEffect).toBe(false);
    // Écart signalé : `read` est la moins fausse des quatre valeurs fermées.
    expect(EFFECTS).toContain(EFFET_DE_COMMANDE_HORS_MODELE);
    expect(projete.effect).toBe(EFFET_DE_COMMANDE_HORS_MODELE);
    // Une commande hors modèle ne traverse aucune des 14 étapes du § 11.
    expect(projete.stepDenied).toBeNull();
    expect(projete.argHashValidated).toBe(true);
    expect(projete.recordIds).toEqual([]);
  });

  it("le préfixe ISOLE les lignes du démon vocal, et les 5 noms sont distincts", () => {
    const noms = NOMS_COMMANDES.map(nomAuJournal);
    const horsPrefixe = noms.filter((nom) => !nom.startsWith(PREFIXE_OUTIL_VOIX));

    console.info(
      `[garde noms] ${String(noms.length)} noms d'outil dérivés sous « ${PREFIXE_OUTIL_VOIX} » : ` +
        `${noms.join(", ")} · ${String(horsPrefixe.length)} hors préfixe`,
    );
    expect(noms).toHaveLength(5);
    expect(horsPrefixe).toEqual([]);
    expect(new Set(noms).size).toBe(noms.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le vocabulaire fermé, et l'issue non classée
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/journal — la traduction des issues", () => {
  it("les 3 issues tombent dans le vocabulaire FERMÉ de `core/audit`", () => {
    const traductions = ISSUES_DE_COMMANDE.map((issue) => ({
      issue,
      ...traduireIssue(issue),
    }));

    console.info(
      `[garde issues] ${String(traductions.length)} issues traduites : ` +
        traductions.map((t) => `${t.issue}→${t.decision}/${t.outcome}`).join(" · "),
    );

    expect(traductions).toHaveLength(3);
    for (const traduction of traductions) {
      expect(DECISIONS).toContain(traduction.decision);
      expect(OUTCOMES).toContain(traduction.outcome);
    }
    // Les trois décisions sont DISTINCTES : confondre une remise au desserrage
    // avec une exécution ferait passer un refus pour un succès.
    expect(new Set(traductions.map((t) => t.decision)).size).toBe(3);
  });

  it("une remise au desserrage est un REFUS journalisé, pas un silence", () => {
    const projete = projeterAuJournal(evenement("remise-au-desserrage"));
    console.info(
      `[garde remise] decision=${projete.decision} · outcome=${projete.outcome} · tool=${projete.tool}`,
    );
    expect(projete.decision).toBe("refusé");
    expect(projete.outcome).toBe("non-exécuté");
  });

  it("TÉMOIN : une issue non classée LÈVE, elle ne tombe pas du bon côté", () => {
    const horsType = "abandonnée" as unknown as IssueDeCommande;
    expect(() => traduireIssue(horsType)).toThrow(/issue non traitée/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — AUCUN MOT DE LA TRANSCRIPTION N'ATTEINT LE JOURNAL
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/journal — la parole ne se journalise pas", () => {
  it("TÉMOIN : les mots prononcés hors grammaire ne se retrouvent nulle part", () => {
    // ⚠️ LE TÉMOIN EST FABRIQUÉ POUR FUIR. La transcription porte deux mots
    //    marqueurs qui n'existent dans AUCUNE forme de la grammaire. Si un
    //    champ transportait la parole — brute ou normalisée — ils sortiraient
    //    ici. Le § 31 refuse tout cache de contenu, et l'ADR 0010 tranche que
    //    « le poste vocal ne transmet jamais d'audio à quiconque » : en
    //    journaliser la transcription reviendrait à conserver par écrit ce
    //    qu'on a refusé de transmettre.
    const marqueurs = ["temoinfuite", "delifrance"];
    const transcription = `euh ${marqueurs[0] ?? ""} arrête-toi ${marqueurs[1] ?? ""} merci`;

    const vu = reconnaitre(transcription);
    // La phrase entière n'est PAS une commande — c'est de la dictée. On force
    // donc le cas le plus tendu : une commande bien reconnue, dont on compose
    // la ligne, à partir d'une transcription qui portait les marqueurs.
    expect(vu.commande).toBeNull();

    const vraiOrdre = reconnaitre(`euh arrête-toi merci`);
    expect(vraiOrdre.commande).toBe("stop");

    const args = argumentsAEmpreindre("stop", vraiOrdre.formeAppariee, vraiOrdre.regime);
    const ligne: ContenuLigne = ligneDeCommande(evenement("exécutée"), CHAMPS_DU_DEMON);

    const serialise = `${JSON.stringify(args)} ${JSON.stringify(ligne)}`;
    const fuites = [...marqueurs, "euh", "merci"].filter((mot) => serialise.includes(mot));

    console.info(
      `[garde fuite] ${String(marqueurs.length + 2)} mots surveillés dans ` +
        `${String(serialise.length)} caractères sérialisés · ${String(fuites.length)} fuite(s)`,
    );
    expect(fuites).toEqual([]);
  });

  it("TÉMOIN INVERSE : l'instrument SAIT voir une fuite", () => {
    // Sans cette ligne, la garde précédente serait verte même si `includes`
    // ne regardait rien.
    const serialiseAvecFuite = JSON.stringify({ ...CHAMPS_DU_DEMON, brut: "euh merci" });
    const fuites = ["euh", "merci"].filter((mot) => serialiseAvecFuite.includes(mot));
    console.info(
      `[garde fuite/témoin] ${String(fuites.length)} fuite(s) détectée(s) — 2 attendues`,
    );
    expect(fuites).toEqual(["euh", "merci"]);
  });

  it("les arguments empreints portent le SCEAU de la grammaire, pas la parole", () => {
    const args = argumentsAEmpreindre("mode-dev", "passe en mode dev", "stricte");
    console.info(
      `[garde arguments] commande=${args.commande} · régime=${String(args.regime)} · ` +
        `grammaire ${args.grammaire.version} / ${args.grammaire.empreinte.slice(0, 12)}…`,
    );
    expect(args.grammaire.version).toBe(GRAMMAIRE_VERSION);
    expect(args.grammaire.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(args.formeAppariee).toBe("passe en mode dev");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — le port est branchable sur un double
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/journal — le port", () => {
  it("un double implémente le port et reçoit la ligne complète", async () => {
    const recues: ContenuLigne[] = [];
    const journal: JournalDesCommandes = {
      journaliser(ligne) {
        recues.push(ligne);
        return Promise.resolve();
      },
    };

    for (const issue of ISSUES_DE_COMMANDE) {
      await journal.journaliser(ligneDeCommande(evenement(issue), CHAMPS_DU_DEMON));
    }

    console.info(
      `[garde port] ${String(recues.length)} lignes journalisées sur ` +
        `${String(ISSUES_DE_COMMANDE.length)} issues · décisions : ` +
        recues.map((l) => l.decision).join(", "),
    );
    expect(recues).toHaveLength(3);
    // ⚠️ L'EXIGENCE QU'AUCUN TYPE N'EXPRIME : la ligne est écrite MÊME quand la
    //    commande n'a pas été appliquée. Une implémentation qui ne journaliserait
    //    que les exécutions laisserait les tentatives d'élargissement à la voix
    //    sans aucune trace — exactement ce que le § 18 surveille.
    expect(recues.filter((l) => l.decision === "refusé")).toHaveLength(1);
  });
});
