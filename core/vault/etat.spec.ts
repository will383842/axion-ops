import { describe, expect, it } from "vitest";

import {
  ETATS_COFFRE,
  GESTES_COFFRE,
  TRANSITIONS_COFFRE,
  appliquerGeste,
  gestesPermis,
} from "./etat.js";
import type { EtatCoffre, GesteCoffre, TransitionCoffre } from "./etat.js";

/**
 * Gardes de la machine à trois états (§ 23).
 *
 * La garde centrale de ce fichier est la COUVERTURE : les neuf paires
 * (état × geste) sont énumérées par PRODUIT CARTÉSIEN des deux énumérations,
 * jamais écrites à la main. Ajouter un état ou un geste élargit la mesure tout
 * seul — et fait rougir le plancher-témoin si personne ne met la table à jour.
 */

interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la table est bien formée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une table de transitions bien formée : pas deux lignes pour le même couple
 * (depuis, geste) — sinon `find` en choisirait une au hasard de l'ordre — et
 * aucune destination hors des états connus.
 */
function verifierTable(table: readonly TransitionCoffre[]): Verdict {
  const anomalies: string[] = [];
  const vus = new Set<string>();

  for (const transition of table) {
    const cle = `${transition.depuis}/${transition.geste}`;
    if (vus.has(cle)) {
      anomalies.push(`couple « ${cle} » en double`);
    }
    vus.add(cle);

    if (!ETATS_COFFRE.includes(transition.vers)) {
      anomalies.push(`destination inconnue « ${transition.vers} »`);
    }
    if (transition.motif.trim().length === 0) {
      anomalies.push(`transition « ${cle} » sans motif`);
    }
  }

  return { mesures: table.length, anomalies };
}

describe("core/vault/etat — la table des transitions", () => {
  it("rougit sur un témoin fabriqué portant deux fois le même couple", () => {
    const temoin: readonly TransitionCoffre[] = [
      { depuis: "verrouillé", geste: "déverrouiller", vers: "ouvert", motif: "a" },
      { depuis: "verrouillé", geste: "déverrouiller", vers: "verrouillé", motif: "b" },
    ];

    const verdict = verifierTable(temoin);
    expect(verdict.mesures).toBe(2);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué dont la destination n'est pas un état", () => {
    const temoin = [
      { depuis: "ouvert", geste: "verrouiller", vers: "fermé-à-clé", motif: "a" },
    ] as unknown as readonly TransitionCoffre[];

    expect(verifierTable(temoin).anomalies).not.toHaveLength(0);
  });

  it("compte quatre transitions, toutes bien formées", () => {
    const verdict = verifierTable(TRANSITIONS_COFFRE);

    console.info(`[garde table] ${String(verdict.mesures)} transitions mesurées`);

    expect(verdict.mesures).toBe(4);
    expect(verdict.anomalies).toEqual([]);
  });

  it("ne fait de « absent » la destination d'AUCUNE transition", () => {
    // Un coffre ne disparaît pas en cours de route. Si une transition y menait,
    // un socle démarré pourrait retomber dans l'état qui interdit le démarrage
    // — et plus rien ne dirait quoi faire.
    const destinations = TRANSITIONS_COFFRE.map((transition) => transition.vers);

    console.info(`[garde destinations] ${String(destinations.length)} destinations mesurées`);

    expect(destinations.length).toBe(TRANSITIONS_COFFRE.length);
    expect(destinations).not.toContain("absent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les neuf paires, par produit cartésien
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/etat — la couverture des paires (état × geste)", () => {
  it("mesure les neuf paires, et fait correspondre chacune à la table", () => {
    let paires = 0;
    let permises = 0;
    let refusees = 0;

    for (const etat of ETATS_COFFRE) {
      for (const geste of GESTES_COFFRE) {
        const attendue = TRANSITIONS_COFFRE.find(
          (transition) => transition.depuis === etat && transition.geste === geste,
        );
        const resultat = appliquerGeste(etat, geste);

        if (attendue === undefined) {
          expect(resultat.permise, `${etat} × ${geste}`).toBe(false);
          if (!resultat.permise) {
            // Un refus laisse l'état INCHANGÉ : c'est ce qui rend un geste
            // interdit inoffensif plutôt que corrupteur.
            expect(resultat.reste).toBe(etat);
            // Et il DIT lequel : « ce n'est pas permis » sans nommer quoi
            // n'apprend rien à qui lit une alerte à 2 h du matin.
            expect(resultat.motif).toContain(geste);
            expect(resultat.motif).toContain(etat);
          }
          refusees += 1;
        } else {
          expect(resultat.permise, `${etat} × ${geste}`).toBe(true);
          if (resultat.permise) {
            expect(resultat.vers).toBe(attendue.vers);
          }
          permises += 1;
        }
        paires += 1;
      }
    }

    console.info(
      `[garde couverture] ${String(paires)} paires mesurées — ` +
        `${String(permises)} permises, ${String(refusees)} refusées`,
    );

    expect(paires).toBe(ETATS_COFFRE.length * GESTES_COFFRE.length);
    expect(paires).toBe(9);
    expect(permises).toBe(TRANSITIONS_COFFRE.length);
    expect(refusees).toBe(5);
  });

  it("interdit nommément les trois pièges du § 23", () => {
    // Ces trois-là ne sont pas des cas parmi neuf : ce sont les trois erreurs
    // qu'on écrit sans y penser, et chacune a une conséquence nommée dans
    // `etat.ts`.
    const pieges: ReadonlyArray<readonly [EtatCoffre, GesteCoffre]> = [
      ["absent", "déverrouiller"],
      ["ouvert", "provisionner"],
      ["absent", "verrouiller"],
    ];

    let mesures = 0;
    for (const [etat, geste] of pieges) {
      expect(appliquerGeste(etat, geste).permise, `${etat} × ${geste}`).toBe(false);
      mesures += 1;
    }

    console.info(`[garde pièges] ${String(mesures)} pièges mesurés`);
    expect(mesures).toBe(3);
  });

  it("rend « verrouiller » IDEMPOTENT — l'arrêt d'urgence ne doit jamais échouer", () => {
    // § 25 : le bouton d'urgence. Un bouton qui rend une erreur parce que le
    // coffre était déjà fermé est un bouton qu'on hésite à presser.
    const resultat = appliquerGeste("verrouillé", "verrouiller");
    expect(resultat.permise).toBe(true);
    if (resultat.permise) {
      expect(resultat.vers).toBe("verrouillé");
    }
  });

  it("dérive `gestesPermis` de la table, pour chacun des trois états", () => {
    let mesures = 0;
    for (const etat of ETATS_COFFRE) {
      const attendus = TRANSITIONS_COFFRE.filter((t) => t.depuis === etat).map((t) => t.geste);
      expect(gestesPermis(etat), etat).toEqual(attendus);
      mesures += 1;
    }

    console.info(`[garde gestesPermis] ${String(mesures)} états mesurés`);
    expect(mesures).toBe(3);
    expect(gestesPermis("absent")).toEqual(["provisionner"]);
  });
});
