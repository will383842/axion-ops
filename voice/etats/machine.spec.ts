import { describe, expect, it } from "vitest";

import { fenetreDeverrouillee, type HorlogeVocale } from "./fenetre.js";
import {
  MACHINE_VOCALE,
  MOTIFS_REFUS_VOCAL,
  TRANSITIONS_VOCALES,
  appliquerGesteVocal,
  avancer,
  decider,
  etatsSources,
  gestesInscrits,
  gestesPraticables,
  renouvelleLActivite,
  rouvreLaFenetre,
  type ContexteVocal,
  type MachineVocale,
  type MotifRefusVocal,
  type TransitionVocale,
} from "./machine.js";
import {
  ETATS_VOCAUX,
  GESTES_VOCAUX,
  NOMS_GESTES,
  PROVENANCES_FACTEUR,
  decrireGeste,
  exigeFenetreDeverrouillee,
  exigeSecondFacteur,
  facteurProbant,
  fenetreOuverte,
  type EffetSurLaSurface,
  type EtatVocal,
  type GesteVocal,
  type ProvenanceFacteur,
} from "./vocabulaire.js";

/**
 * Gardes de la machine à états du démon vocal — § 18, § 20, § 30, ADR 0010.
 *
 * Quatre exigences sont mesurées ici, et ce sont elles qui comptent :
 *
 *  1. le verrouillage après inactivité, sur un temps INJECTÉ ;
 *  2. hors fenêtre déverrouillée : aucun desserrage, aucun changement de
 *     profil — depuis CHAQUE état ;
 *  3. l'interruption : depuis `parle`, la parole coupe la synthèse ;
 *  4. « stop » aboutit depuis CHAQUE état, dans le contexte le plus hostile.
 *
 * Toutes les gardes annoncent combien d'éléments elles ont mesurés, et toutes
 * sont réfutables : `decider()` prend la machine en paramètre, ce qui permet de
 * lui présenter des machines MUTILÉES — une ligne retirée, un effet faussé — et
 * d'exiger qu'elles rougissent.
 */

const T0 = 1_000_000;
const DELAI = 300_000;

const HORLOGE_VIVANTE: HorlogeVocale = {
  instant: T0 + 1,
  derniereActivite: T0,
  delaiInactiviteMs: DELAI,
};

/**
 * ⚠️ L'horloge du trou réel : le délai est écoulé, mais la minuterie n'a pas
 *    encore battu — l'état est donc encore OUVERT. C'est là, et seulement là,
 *    qu'un desserrage passerait si la règle de fenêtre lisait l'état seul.
 */
const HORLOGE_ECHUE: HorlogeVocale = {
  instant: T0 + DELAI,
  derniereActivite: T0,
  delaiInactiviteMs: DELAI,
};

const NOMINAL: ContexteVocal = { horloge: HORLOGE_VIVANTE, facteur: "hors-bande" };

/** Le pire contexte : rien n'est présenté, et la fenêtre est morte. */
const HOSTILE: ContexteVocal = { horloge: HORLOGE_ECHUE, facteur: null };

interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Machines mutilées — les témoins
// ─────────────────────────────────────────────────────────────────────────────

function machineSansLigne(geste: GesteVocal, depuis: EtatVocal): MachineVocale {
  return {
    ...MACHINE_VOCALE,
    transitions: TRANSITIONS_VOCALES.filter(
      (transition) => !(transition.geste === geste && transition.depuis === depuis),
    ),
  };
}

function machineAvecEffetFausse(nom: GesteVocal, effet: EffetSurLaSurface): MachineVocale {
  return {
    ...MACHINE_VOCALE,
    gestes: GESTES_VOCAUX.map((geste) => (geste.nom === nom ? { ...geste, effet } : geste)),
  };
}

function machineAvecLigneAjoutee(ligne: TransitionVocale): MachineVocale {
  return { ...MACHINE_VOCALE, transitions: [...TRANSITIONS_VOCALES, ligne] };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la table est bien formée
// ─────────────────────────────────────────────────────────────────────────────

function verifierTable(table: readonly TransitionVocale[]): Verdict {
  const anomalies: string[] = [];
  const vus = new Set<string>();

  for (const transition of table) {
    const cle = `${transition.depuis}/${transition.geste}`;
    if (vus.has(cle)) {
      anomalies.push(`couple « ${cle} » en double`);
    }
    vus.add(cle);

    if (!ETATS_VOCAUX.includes(transition.depuis)) {
      anomalies.push(`départ inconnu « ${transition.depuis} »`);
    }
    if (!ETATS_VOCAUX.includes(transition.vers)) {
      anomalies.push(`destination inconnue « ${transition.vers} »`);
    }
    if (!NOMS_GESTES.includes(transition.geste)) {
      anomalies.push(`geste inconnu « ${transition.geste} »`);
    }
    if (transition.motif.trim().length === 0) {
      anomalies.push(`transition « ${cle} » sans motif`);
    }
  }

  return { mesures: table.length, anomalies };
}

describe("voice/etats/machine — la table des transitions", () => {
  it("rougit sur un témoin fabriqué portant deux fois le même couple", () => {
    const temoin: readonly TransitionVocale[] = [
      { depuis: "parle", geste: "interrompre", vers: "interrompu", motif: "a" },
      { depuis: "parle", geste: "interrompre", vers: "en-veille", motif: "b" },
    ];

    const verdict = verifierTable(temoin);
    expect(verdict.mesures).toBe(2);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué dont la destination n'est pas un état", () => {
    const temoin = [
      { depuis: "parle", geste: "interrompre", vers: "muet", motif: "a" },
    ] as unknown as readonly TransitionVocale[];

    expect(verifierTable(temoin).anomalies).not.toHaveLength(0);
  });

  it("compte cinquante-quatre transitions, toutes bien formées", () => {
    const verdict = verifierTable(TRANSITIONS_VOCALES);

    console.info(`[garde table] ${String(verdict.mesures)} transitions mesurées`);

    expect(verdict.mesures).toBe(54);
    expect(verdict.anomalies).toEqual([]);
  });

  it("ne laisse aucun état inaccessible ni aucun cul-de-sac", () => {
    // Un état inaccessible est du code mort qui se lit comme une règle ; un
    // cul-de-sac est un démon qu'il faut redémarrer pour en sortir.
    let mesures = 0;
    const inaccessibles: string[] = [];
    const impasses: string[] = [];

    for (const etat of ETATS_VOCAUX) {
      const entrantes = TRANSITIONS_VOCALES.filter(
        (transition) => transition.vers === etat && transition.depuis !== etat,
      );
      const sortantes = TRANSITIONS_VOCALES.filter(
        (transition) => transition.depuis === etat && transition.vers !== etat,
      );

      if (entrantes.length === 0) {
        inaccessibles.push(etat);
      }
      if (sortantes.length === 0) {
        impasses.push(etat);
      }
      mesures += 1;
    }

    console.info(
      `[garde graphe] ${String(mesures)} états mesurés — ` +
        `${String(inaccessibles.length)} inaccessibles, ${String(impasses.length)} culs-de-sac`,
    );

    expect(mesures).toBe(7);
    expect(inaccessibles).toEqual([]);
    expect(impasses).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LA COUVERTURE DES 105 PAIRES × 8 CONTEXTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le motif de refus ATTENDU, recalculé ici indépendamment de `decider()`, à
 * partir des mêmes règles mais écrites autrement. C'est ce qui rend la garde
 * réfutable : si la cascade de `machine.ts` change d'ordre ou de condition, les
 * deux calculs divergent.
 */
function refusAttendu(
  machine: MachineVocale,
  etat: EtatVocal,
  geste: GesteVocal,
  contexte: ContexteVocal,
): MotifRefusVocal | null {
  const description = machine.gestes.find((candidat) => candidat.nom === geste);
  const inscrite = machine.transitions.some(
    (transition) => transition.depuis === etat && transition.geste === geste,
  );

  const violes = new Set<MotifRefusVocal>();

  if (description === undefined || !inscrite) {
    violes.add("geste-hors-table");
  } else {
    if (exigeFenetreDeverrouillee(description) && !fenetreDeverrouillee(etat, contexte.horloge)) {
      violes.add("hors-fenêtre-déverrouillée");
    }
    if (exigeSecondFacteur(description)) {
      if (contexte.facteur === null) {
        violes.add("second-facteur-absent");
      } else if (!facteurProbant(contexte.facteur)) {
        violes.add("facteur-non-probant");
      }
    }
  }

  // Le PREMIER motif violé dans l'ordre annoncé — l'ordre est dérivé du
  // tableau, jamais réécrit ici.
  for (const motif of MOTIFS_REFUS_VOCAL) {
    if (violes.has(motif)) {
      return motif;
    }
  }
  return null;
}

describe("voice/etats/machine — la couverture des paires (état × geste)", () => {
  it("confronte les 105 paires à 8 contextes, et annonce le compte", () => {
    const facteurs: ReadonlyArray<ProvenanceFacteur | null> = [null, ...PROVENANCES_FACTEUR];
    const horloges: readonly HorlogeVocale[] = [HORLOGE_VIVANTE, HORLOGE_ECHUE];

    let paires = 0;
    let mesures = 0;
    let permises = 0;
    const parRefus = new Map<MotifRefusVocal, number>();

    for (const etat of ETATS_VOCAUX) {
      for (const geste of NOMS_GESTES) {
        paires += 1;
        for (const facteur of facteurs) {
          for (const horloge of horloges) {
            const contexte: ContexteVocal = { horloge, facteur };
            const attendu = refusAttendu(MACHINE_VOCALE, etat, geste, contexte);
            const decision = decider(MACHINE_VOCALE, etat, geste, contexte);

            if (attendu === null) {
              expect(decision.permise, `${etat} × ${geste}`).toBe(true);
              permises += 1;
            } else {
              expect(decision.permise, `${etat} × ${geste} → ${attendu}`).toBe(false);
              if (!decision.permise) {
                expect(decision.refus, `${etat} × ${geste}`).toBe(attendu);
                // Un refus laisse l'état INCHANGÉ, et il NOMME le geste et
                // l'état : « ce n'est pas permis » sans dire quoi n'apprend
                // rien à qui lit une alerte à 2 h du matin.
                expect(decision.reste).toBe(etat);
                expect(decision.motif).toContain(geste);
                expect(decision.motif).toContain(etat);
                parRefus.set(decision.refus, (parRefus.get(decision.refus) ?? 0) + 1);
              }
            }
            mesures += 1;
          }
        }
      }
    }

    const detail = MOTIFS_REFUS_VOCAL.map(
      (motif) => `${motif}=${String(parRefus.get(motif) ?? 0)}`,
    ).join(" · ");

    console.info(
      `[garde couverture] ${String(paires)} paires (état × geste) × ${String(facteurs.length * horloges.length)} contextes ` +
        `= ${String(mesures)} décisions mesurées — ${String(permises)} permises · ${detail}`,
    );

    expect(paires).toBe(ETATS_VOCAUX.length * NOMS_GESTES.length);
    expect(paires).toBe(105);
    expect(mesures).toBe(105 * 8);
    expect(mesures).toBe(840);

    // Les quatre motifs sont tous ATTEINTS : un motif déclaré que rien ne
    // produit est un motif qui ne garde rien.
    for (const motif of MOTIFS_REFUS_VOCAL) {
      expect(parRefus.get(motif) ?? 0, motif).toBeGreaterThan(0);
    }
  });

  it("permet exactement les 54 transitions de la table dans le contexte nominal", () => {
    let permises = 0;
    let paires = 0;

    for (const etat of ETATS_VOCAUX) {
      for (const geste of NOMS_GESTES) {
        const decision = appliquerGesteVocal(etat, geste, NOMINAL);
        const attendue = TRANSITIONS_VOCALES.find(
          (transition) => transition.depuis === etat && transition.geste === geste,
        );

        if (attendue !== undefined) {
          expect(decision.permise, `${etat} × ${geste}`).toBe(true);
          if (decision.permise) {
            expect(decision.vers).toBe(attendue.vers);
            expect(decision.motif).toBe(attendue.motif);
          }
          permises += 1;
        } else {
          expect(decision.permise, `${etat} × ${geste}`).toBe(false);
        }
        paires += 1;
      }
    }

    console.info(
      `[garde nominal] ${String(paires)} paires mesurées — ${String(permises)} permises, ` +
        `${String(paires - permises)} refusées`,
    );

    expect(paires).toBe(105);
    expect(permises).toBe(TRANSITIONS_VOCALES.length);
    expect(permises).toBe(54);
    expect(paires - permises).toBe(51);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — « STOP » ABOUTIT DEPUIS TOUS LES ÉTATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * § 30, exigence de fin du lot 8 : « stop coupe sans passer par le modèle ».
 * Un ordre d'arrêt qui dépend de l'état courant est un ordre d'arrêt qui rate
 * au pire moment.
 */
function verifierStopUniversel(machine: MachineVocale, contexte: ContexteVocal): Verdict {
  const anomalies: string[] = [];
  let mesures = 0;

  for (const etat of ETATS_VOCAUX) {
    const decision = decider(machine, etat, "stop", contexte);
    if (!decision.permise) {
      anomalies.push(`« stop » refusé depuis « ${etat} » — ${decision.refus}`);
    }
    mesures += 1;
  }

  return { mesures, anomalies };
}

describe("voice/etats/machine — « stop » aboutit depuis TOUS les états", () => {
  it("rougit sur une machine mutilée d'une seule ligne « stop »", () => {
    // Le témoin : la ligne `en-tour × stop` retirée. C'est exactement le pire
    // cas — l'arrêt demandé pendant que le modèle travaille.
    const mutilee = machineSansLigne("stop", "en-tour");
    const verdict = verifierStopUniversel(mutilee, HOSTILE);

    console.info(
      `[témoin stop mutilé] ${String(verdict.mesures)} états mesurés — ` +
        `${String(verdict.anomalies.length)} refus : ${verdict.anomalies.join(" · ")}`,
    );

    expect(verdict.mesures).toBe(7);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("en-tour");
  });

  it("aboutit depuis les sept états DANS LE CONTEXTE LE PLUS HOSTILE", () => {
    // Aucun facteur présenté, fenêtre morte : « stop » RÉDUIT, donc rien ne le
    // retient (§ 20, première protection).
    const verdict = verifierStopUniversel(MACHINE_VOCALE, HOSTILE);

    console.info(
      `[garde stop] ${String(verdict.mesures)} états mesurés, aucun facteur, fenêtre échue — ` +
        `${String(verdict.anomalies.length)} refus`,
    );

    expect(verdict.mesures).toBe(7);
    expect(verdict.anomalies).toEqual([]);
  });

  it("aboutit sous CHAQUE provenance de facteur, y compris aucune", () => {
    let mesures = 0;
    for (const facteur of [null, ...PROVENANCES_FACTEUR]) {
      for (const horloge of [HORLOGE_VIVANTE, HORLOGE_ECHUE]) {
        const verdict = verifierStopUniversel(MACHINE_VOCALE, { horloge, facteur });
        expect(verdict.anomalies, `facteur ${String(facteur)}`).toEqual([]);
        mesures += verdict.mesures;
      }
    }

    console.info(`[garde stop × contextes] ${String(mesures)} décisions mesurées`);
    expect(mesures).toBe(7 * 4 * 2);
    expect(mesures).toBe(56);
  });

  it("ramène au repos depuis un état ouvert, et reste fermé depuis l'état fermé", () => {
    let versLeRepos = 0;
    let idempotents = 0;

    for (const etat of ETATS_VOCAUX) {
      const decision = appliquerGesteVocal(etat, "stop", HOSTILE);
      expect(decision.permise, etat).toBe(true);
      if (decision.permise) {
        if (fenetreOuverte(etat)) {
          expect(decision.vers).toBe("en-veille");
          versLeRepos += 1;
        } else {
          // Idempotent : dire « stop » à un démon verrouillé ne rend jamais une
          // erreur — et ne le déverrouille pas non plus.
          expect(decision.vers).toBe(etat);
          idempotents += 1;
        }
      }
    }

    console.info(
      `[garde destinations de stop] ${String(versLeRepos + idempotents)} états mesurés — ` +
        `${String(versLeRepos)} vers le repos, ${String(idempotents)} idempotents`,
    );

    expect(versLeRepos).toBe(6);
    expect(idempotents).toBe(1);
  });

  it("distingue « stop », qui n'échoue jamais, de « annuler », qui le peut", () => {
    // C'est ce qui justifie deux gestes plutôt qu'un : il n'y a rien à annuler
    // au repos ni sous verrou, et un refus y est plus honnête qu'un succès qui
    // n'aurait rien fait.
    const refusDAnnuler = ETATS_VOCAUX.filter(
      (etat) => !appliquerGesteVocal(etat, "annuler", HOSTILE).permise,
    );

    console.info(
      `[garde stop ≠ annuler] ${String(ETATS_VOCAUX.length)} états mesurés — ` +
        `« annuler » refusé depuis ${String(refusDAnnuler.length)} : ${refusDAnnuler.join(", ")}`,
    );

    expect([...refusDAnnuler].sort()).toEqual(["en-veille", "verrouillé"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — HORS FENÊTRE DÉVERROUILLÉE : AUCUN DESSERRAGE, AUCUN PROFIL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * § 18, mot pour mot : « Verrouillage du démon après inactivité — aucun
 * desserrage ni changement de profil hors fenêtre déverrouillée. »
 *
 * La tentative est faite AVEC un facteur probant, exprès : c'est la seule façon
 * d'isoler la règle de fenêtre de la règle de facteur. Un test qui omettrait le
 * facteur serait vert pour la mauvaise raison.
 */
function verifierDesserrageHorsFenetre(machine: MachineVocale): Verdict {
  const anomalies: string[] = [];
  let mesures = 0;

  const contexte: ContexteVocal = { horloge: HORLOGE_ECHUE, facteur: "hors-bande" };

  for (const geste of ["desserrer", "changer-de-profil"] as const) {
    for (const etat of ETATS_VOCAUX) {
      const decision = decider(machine, etat, geste, contexte);
      if (decision.permise) {
        anomalies.push(`« ${geste} » ADMIS depuis « ${etat} » alors que la fenêtre est morte`);
      }
      mesures += 1;
    }
  }

  return { mesures, anomalies };
}

describe("voice/etats/machine — hors fenêtre déverrouillée", () => {
  it("rougit sur une machine où « desserrer » serait déclaré comme un resserrement", () => {
    // Le témoin fabriqué : l'effet du geste faussé. La table est intacte, le
    // facteur est probant — seule la déclaration a bougé, et six états
    // s'ouvrent.
    const mutilee = machineAvecEffetFausse("desserrer", "réduit");
    const verdict = verifierDesserrageHorsFenetre(mutilee);

    console.info(
      `[témoin desserrage faussé] ${String(verdict.mesures)} tentatives mesurées — ` +
        `${String(verdict.anomalies.length)} admissions indues`,
    );

    expect(verdict.mesures).toBe(14);
    expect(verdict.anomalies).toHaveLength(6);
  });

  it("rougit sur une machine où la table admettrait « desserrer » depuis « verrouillé »", () => {
    // L'autre moitié du § 18 : la barrière structurelle. Une seule ligne
    // ajoutée à la table ouvrirait la porte que la section ferme — et ici la
    // règle de fenêtre l'attrape quand même, ce qui est le point : deux
    // barrières indépendantes.
    const mutilee = machineAvecLigneAjoutee({
      depuis: "verrouillé",
      geste: "desserrer",
      vers: "verrouillé",
      motif: "témoin fabriqué",
    });

    const surFenetreVivante = decider(mutilee, "verrouillé", "desserrer", NOMINAL);
    expect(surFenetreVivante.permise).toBe(false);
    if (!surFenetreVivante.permise) {
      // La table ne refuse plus ; c'est la règle de fenêtre qui tient.
      expect(surFenetreVivante.refus).toBe("hors-fenêtre-déverrouillée");
    }

    // Et la garde structurelle, elle, voit la ligne.
    const elargissantsDepuisFerme = mutilee.transitions.filter(
      (transition) =>
        !fenetreOuverte(transition.depuis) &&
        exigeFenetreDeverrouillee(decrireGeste(transition.geste)),
    );

    console.info(
      `[témoin ligne ajoutée] ${String(mutilee.transitions.length)} transitions mesurées — ` +
        `${String(elargissantsDepuisFerme.length)} élargissante(s) depuis un état fermé`,
    );

    expect(elargissantsDepuisFerme).toHaveLength(1);
  });

  it("refuse desserrage ET changement de profil depuis CHACUN des sept états", () => {
    const verdict = verifierDesserrageHorsFenetre(MACHINE_VOCALE);

    // Et le motif du refus est mesuré, pas supposé : six états sont ouverts, où
    // c'est la règle de FENÊTRE qui refuse ; le septième est fermé, où c'est la
    // TABLE qui refuse. Les deux barrières se voient séparément.
    const parRefus = new Map<MotifRefusVocal, number>();
    const contexte: ContexteVocal = { horloge: HORLOGE_ECHUE, facteur: "hors-bande" };

    for (const geste of ["desserrer", "changer-de-profil"] as const) {
      for (const etat of ETATS_VOCAUX) {
        const decision = decider(MACHINE_VOCALE, etat, geste, contexte);
        if (!decision.permise) {
          parRefus.set(decision.refus, (parRefus.get(decision.refus) ?? 0) + 1);
        }
      }
    }

    console.info(
      `[garde hors-fenêtre] ${String(verdict.mesures)} tentatives mesurées ` +
        `(2 gestes × 7 états), facteur probant présenté — ` +
        `${String(parRefus.get("hors-fenêtre-déverrouillée") ?? 0)} refus de fenêtre, ` +
        `${String(parRefus.get("geste-hors-table") ?? 0)} refus de table`,
    );

    expect(verdict.mesures).toBe(14);
    expect(verdict.anomalies).toEqual([]);
    expect(parRefus.get("hors-fenêtre-déverrouillée")).toBe(12);
    expect(parRefus.get("geste-hors-table")).toBe(2);
  });

  it("admet le desserrage quand la fenêtre est VIVANTE — le versant positif", () => {
    // Une garde qui ne mesurerait que des refus serait verte sur une machine
    // qui refuse tout. Le § 32 le dit pour la politique : « le versant positif,
    // qui manquait ».
    let admis = 0;
    let mesures = 0;

    for (const geste of ["desserrer", "changer-de-profil"] as const) {
      for (const etat of ETATS_VOCAUX) {
        const decision = appliquerGesteVocal(etat, geste, NOMINAL);
        if (decision.permise) {
          // Le geste ne déplace pas la conversation : changer la politique
          // n'interrompt pas un tour en cours.
          expect(decision.vers, `${etat} × ${geste}`).toBe(etat);
          admis += 1;
        }
        mesures += 1;
      }
    }

    console.info(
      `[garde versant positif] ${String(mesures)} tentatives mesurées, fenêtre vivante — ` +
        `${String(admis)} admises`,
    );

    expect(mesures).toBe(14);
    expect(admis).toBe(12);
  });

  it("n'inscrit AUCUNE transition élargissante depuis un état à fenêtre fermée", () => {
    // La barrière structurelle, sur la table réelle. Dérivée : aucune liste de
    // gestes n'est écrite ici, c'est `exigeFenetreDeverrouillee` qui trie.
    let mesures = 0;
    const fautives: string[] = [];

    for (const transition of TRANSITIONS_VOCALES) {
      if (
        !fenetreOuverte(transition.depuis) &&
        exigeFenetreDeverrouillee(decrireGeste(transition.geste))
      ) {
        fautives.push(`${transition.depuis} × ${transition.geste}`);
      }
      mesures += 1;
    }

    console.info(
      `[garde barrière structurelle] ${String(mesures)} transitions mesurées — ` +
        `${String(fautives.length)} fautives`,
    );

    expect(mesures).toBe(54);
    expect(fautives).toEqual([]);
  });

  it("ne laisse QU'UNE transition rouvrir la fenêtre, et elle est hors bande", () => {
    // C'est ce qui exempte `déverrouiller` de la règle de fenêtre sans qu'aucun
    // nom de geste soit mis à part dans la logique.
    const rouvrantes = TRANSITIONS_VOCALES.filter(rouvreLaFenetre);

    console.info(
      `[garde réouverture] ${String(TRANSITIONS_VOCALES.length)} transitions mesurées — ` +
        `${String(rouvrantes.length)} rouvre(nt) la fenêtre`,
    );

    expect(rouvrantes).toHaveLength(1);
    const seule = rouvrantes[0];
    expect(seule).toBeDefined();
    if (seule !== undefined) {
      expect(decrireGeste(seule.geste).nature).toBe("hors-bande");
      expect(exigeFenetreDeverrouillee(decrireGeste(seule.geste))).toBe(false);
      expect(exigeSecondFacteur(decrireGeste(seule.geste))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — LE MICRO N'AUTHENTIFIE PERSONNE
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/machine — § 18 : le micro n'authentifie personne", () => {
  it("refuse tout élargissement dont le facteur vient de la VOIX ou du DÉMON", () => {
    // La fenêtre est VIVANTE : seul le facteur est en cause. C'est l'adversaire
    // du § 18 — « quelqu'un à portée de voix d'une machine déverrouillée » — et
    // celui du § 20 — le démon qui se confirmerait lui-même.
    let mesures = 0;
    let refus = 0;

    for (const facteur of ["voix", "démon"] as const) {
      const contexte: ContexteVocal = { horloge: HORLOGE_VIVANTE, facteur };
      for (const etat of ETATS_VOCAUX) {
        for (const geste of ["desserrer", "changer-de-profil", "déverrouiller"] as const) {
          const decision = appliquerGesteVocal(etat, geste, contexte);
          expect(decision.permise, `${etat} × ${geste} par « ${facteur} »`).toBe(false);
          if (!decision.permise) {
            refus += 1;
          }
          mesures += 1;
        }
      }
    }

    console.info(
      `[garde facteur non probant] ${String(mesures)} tentatives mesurées ` +
        `(2 provenances × 7 états × 3 gestes élargissants) — ${String(refus)} refusées`,
    );

    expect(mesures).toBe(42);
    expect(refus).toBe(42);
  });

  it("ne déverrouille que sur un facteur hors bande, et depuis le seul état fermé", () => {
    // Le versant positif du déverrouillage — sans lui, la garde précédente
    // serait verte sur une machine qui ne déverrouille jamais.
    const decision = appliquerGesteVocal("verrouillé", "déverrouiller", {
      horloge: HORLOGE_ECHUE,
      facteur: "hors-bande",
    });

    expect(decision.permise).toBe(true);
    if (decision.permise) {
      expect(decision.vers).toBe("en-veille");
    }

    // Sans facteur du tout : refusé, et le motif le dit.
    const sansFacteur = appliquerGesteVocal("verrouillé", "déverrouiller", HOSTILE);
    expect(sansFacteur.permise).toBe(false);
    if (!sansFacteur.permise) {
      expect(sansFacteur.refus).toBe("second-facteur-absent");
    }

    const sources = etatsSources("déverrouiller");
    console.info(`[garde déverrouillage] ${String(sources.length)} état(s) source(s) mesuré(s)`);
    expect(sources).toEqual(["verrouillé"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — L'INTERRUPTION
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/machine — § 30 : l'interruption", () => {
  it("coupe la synthèse depuis « parle », sans facteur et fenêtre morte", () => {
    // « Un assistant vocal qu'on ne peut pas interrompre est insupportable
    // après dix minutes. » L'interruption RÉDUIT : rien ne la retient.
    const decision = appliquerGesteVocal("parle", "interrompre", HOSTILE);

    expect(decision.permise).toBe(true);
    if (decision.permise) {
      expect(decision.vers).toBe("interrompu");
    }
  });

  it("coupe aussi le tour AVANT le premier mot, et annonce ses deux sources", () => {
    const sources = etatsSources("interrompre");

    console.info(
      `[garde interruption] ${String(sources.length)} états sources mesurés : ${sources.join(", ")}`,
    );

    expect([...sources].sort()).toEqual(["en-tour", "parle"]);
    for (const etat of sources) {
      expect(appliquerGesteVocal(etat, "interrompre", HOSTILE).permise, etat).toBe(true);
    }
  });

  it("n'admet pas d'interrompre ce qui ne parle pas, et le dit", () => {
    // Le versant négatif : `interrompre` n'est pas un second « stop ». Ce qui
    // vaut d'où que l'on parte, c'est « stop » — mesuré plus haut.
    const refuses = ETATS_VOCAUX.filter(
      (etat) => !appliquerGesteVocal(etat, "interrompre", NOMINAL).permise,
    );

    console.info(
      `[garde interruption hors tour] ${String(ETATS_VOCAUX.length)} états mesurés — ` +
        `${String(refuses.length)} refusés`,
    );

    expect(refuses).toHaveLength(5);
    expect(refuses).not.toContain("parle");
  });

  it("enchaîne interruption puis reprise de l'écoute — le tour de parole rendu", () => {
    // Le scénario complet du § 30 : réveil, capture, transcription, tour,
    // synthèse, interruption, reprise.
    const parcours: ReadonlyArray<readonly [EtatVocal, GesteVocal, EtatVocal]> = [
      ["verrouillé", "déverrouiller", "en-veille"],
      ["en-veille", "détecter-parole", "écoute"],
      ["écoute", "clore-la-capture", "transcrit"],
      ["transcrit", "router-vers-le-modèle", "en-tour"],
      ["en-tour", "répondre", "parle"],
      ["parle", "interrompre", "interrompu"],
      ["interrompu", "reprendre-l-écoute", "écoute"],
    ];

    let etat: EtatVocal = "verrouillé";
    let pas = 0;

    for (const [depuis, geste, attendu] of parcours) {
      expect(etat, `pas ${String(pas)}`).toBe(depuis);
      const decision = appliquerGesteVocal(etat, geste, NOMINAL);
      expect(decision.permise, `${depuis} × ${geste}`).toBe(true);
      if (decision.permise) {
        etat = decision.vers;
      }
      expect(etat).toBe(attendu);
      pas += 1;
    }

    console.info(`[garde parcours] ${String(pas)} pas de tour de parole mesurés`);
    expect(pas).toBe(7);
    expect(etat).toBe("écoute");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 7 — LE VERROUILLAGE APRÈS INACTIVITÉ, DEPUIS CHAQUE ÉTAT
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/machine — le verrouillage après inactivité", () => {
  it("referme depuis chacun des sept états, sur un temps INJECTÉ", () => {
    let mesures = 0;
    for (const etat of ETATS_VOCAUX) {
      const decision = appliquerGesteVocal(etat, "expirer-inactivité", HOSTILE);
      expect(decision.permise, etat).toBe(true);
      if (decision.permise) {
        expect(decision.vers).toBe("verrouillé");
      }
      mesures += 1;
    }

    console.info(
      `[garde expiration] ${String(mesures)} états mesurés — ` +
        `délai injecté ${String(HORLOGE_ECHUE.delaiInactiviteMs)} ms, ` +
        `écart injecté ${String(HORLOGE_ECHUE.instant - HORLOGE_ECHUE.derniereActivite)} ms`,
    );

    expect(mesures).toBe(7);
  });

  it("referme puis REDEMANDE un facteur — le cycle complet du § 30", () => {
    // Le scénario que la section décrit : le démon travaille, le délai
    // s'écoule, il se verrouille, et le geste qui élargissait ne passe plus.
    const apresExpiration = avancer("en-tour", "expirer-inactivité", {
      horloge: HORLOGE_ECHUE,
      facteur: null,
    });
    expect(apresExpiration.etat).toBe("verrouillé");

    // Fenêtre neuve, facteur probant : le desserrage ne passe TOUJOURS pas,
    // parce que l'état est fermé. Il faut d'abord déverrouiller.
    const desserrage = appliquerGesteVocal(apresExpiration.etat, "desserrer", NOMINAL);
    expect(desserrage.permise).toBe(false);

    const deverrouillage = appliquerGesteVocal(apresExpiration.etat, "déverrouiller", NOMINAL);
    expect(deverrouillage.permise).toBe(true);
    if (deverrouillage.permise) {
      const apres = appliquerGesteVocal(deverrouillage.vers, "desserrer", NOMINAL);
      expect(apres.permise).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 8 — l'avancement et l'horloge d'activité
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/machine — avancer", () => {
  it("ne renouvelle JAMAIS l'activité sur un geste refusé", () => {
    // Sans cette règle, celui qui répète « desserre » à un démon dont la
    // fenêtre vient de mourir tiendrait cette fenêtre ouverte par ses seules
    // tentatives ratées.
    let mesures = 0;
    let refus = 0;

    for (const etat of ETATS_VOCAUX) {
      for (const geste of NOMS_GESTES) {
        const contexte: ContexteVocal = { horloge: HORLOGE_ECHUE, facteur: null };
        const resultat = avancer(etat, geste, contexte);

        if (!resultat.decision.permise) {
          expect(resultat.etat, `${etat} × ${geste}`).toBe(etat);
          expect(resultat.derniereActivite).toBe(contexte.horloge.derniereActivite);
          refus += 1;
        }
        mesures += 1;
      }
    }

    console.info(
      `[garde activité sur refus] ${String(mesures)} paires mesurées — ` +
        `${String(refus)} refus, aucun renouvellement`,
    );

    expect(mesures).toBe(105);
    expect(refus).toBeGreaterThan(0);
  });

  it("dérive le renouvellement de la DESTINATION, jamais du nom du geste", () => {
    let mesures = 0;
    let renouvelantes = 0;

    for (const transition of TRANSITIONS_VOCALES) {
      expect(renouvelleLActivite(transition), `${transition.depuis} × ${transition.geste}`).toBe(
        fenetreOuverte(transition.vers),
      );
      if (renouvelleLActivite(transition)) {
        renouvelantes += 1;
      }
      mesures += 1;
    }

    console.info(
      `[garde renouvellement] ${String(mesures)} transitions mesurées — ` +
        `${String(renouvelantes)} renouvellent l'activité`,
    );

    expect(mesures).toBe(54);
    expect(renouvelantes).toBeGreaterThan(0);
    expect(renouvelantes).toBeLessThan(54);
  });

  it("ne laisse pas un « stop » adressé à un démon verrouillé tenir la fenêtre", () => {
    // Parler à un démon fermé ne doit pas recharger sa fenêtre : c'est
    // l'adversaire « quelqu'un à portée de voix » qui, sinon, maintiendrait la
    // session vivante à la voix seule.
    const contexte: ContexteVocal = { horloge: HORLOGE_ECHUE, facteur: null };
    const resultat = avancer("verrouillé", "stop", contexte);

    expect(resultat.decision.permise).toBe(true);
    expect(resultat.etat).toBe("verrouillé");
    expect(resultat.derniereActivite).toBe(contexte.horloge.derniereActivite);

    // Alors qu'un « stop » depuis un état ouvert, lui, renouvelle.
    const ouvert = avancer("parle", "stop", contexte);
    expect(ouvert.derniereActivite).toBe(contexte.horloge.instant);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 9 — ce que la console a le droit d'afficher
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/machine — les lectures dérivées", () => {
  it("ne promet jamais à l'écran un geste que la décision refuserait", () => {
    // Montrer « desserrer » comme disponible alors que la fenêtre est morte,
    // c'est promettre ce que le socle refusera.
    let mesures = 0;
    let promesses = 0;
    let tenues = 0;

    for (const etat of ETATS_VOCAUX) {
      for (const contexte of [NOMINAL, HOSTILE]) {
        const inscrits = gestesInscrits(etat);
        const praticables = gestesPraticables(etat, contexte);

        for (const geste of praticables) {
          expect(inscrits, `${etat} × ${geste}`).toContain(geste);
          expect(appliquerGesteVocal(etat, geste, contexte).permise).toBe(true);
          tenues += 1;
        }

        promesses += praticables.length;
        mesures += 1;
      }
    }

    console.info(
      `[garde écran] ${String(mesures)} couples (état × contexte) mesurés — ` +
        `${String(promesses)} gestes proposés, ${String(tenues)} tenus`,
    );

    expect(mesures).toBe(14);
    expect(promesses).toBe(tenues);
    expect(promesses).toBeGreaterThan(0);

    // Et le contexte hostile propose STRICTEMENT moins que le nominal : sinon
    // la fenêtre ne servirait à rien.
    const nominal = ETATS_VOCAUX.reduce(
      (total, etat) => total + gestesPraticables(etat, NOMINAL).length,
      0,
    );
    const hostile = ETATS_VOCAUX.reduce(
      (total, etat) => total + gestesPraticables(etat, HOSTILE).length,
      0,
    );

    console.info(
      `[garde écran — écart] ${String(nominal)} gestes praticables en contexte nominal, ` +
        `${String(hostile)} en contexte hostile`,
    );

    expect(hostile).toBeLessThan(nominal);
  });
});
