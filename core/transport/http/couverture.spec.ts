/**
 * `core/transport/http/couverture.spec.ts` — **INTERDIT DE CONSTRUCTION N° 3, ET
 * LA MOITIÉ QUE LES TROIS INTERDITS NE COUVRENT PAS.**
 *
 * Deux gardes vivent ici, et elles ne se recouvrent pas :
 *
 *  · la COUVERTURE — chaque étape « HTTP seul » du § 11 a-t-elle un exécutant
 *    nommé dans ce dossier ? Elle rougit dans les deux sens : une étape due sans
 *    exécutant, et un exécutant devenu orphelin ;
 *  · l'AMONT ÉTABLI — le transport dit-il vrai sur ce qu'il a fait ? C'est
 *    l'objet de l'ADR 0029 vu depuis l'ADR 0025 : « aucun [interdit] ne voit un
 *    transport qui appellerait bien le noyau mais lui MENTIRAIT ».
 */

import { describe, expect, it } from "vitest";

import { APPEL_STEPS, type AppelStep } from "../../types.js";
import { colonneDuTransport } from "../../chaine/orchestrateur.js";
import type { EtapesEtabliesEnAmont } from "../contrat.js";
import {
  EXECUTANTS_AMONT_HTTP,
  exigerLaCouvertureAmont,
  verifierLAmontEtabli,
  verifierLaCouvertureAmont,
} from "./couverture.js";

describe("ADR 0025, interdit n° 3 — la couverture amont est confrontée au démarrage", () => {
  it("couvre exactement les étapes « HTTP seul » du § 11, et ANNONCE ses comptes", () => {
    const couverture = verifierLaCouvertureAmont();
    const colonne = colonneDuTransport("http");

    console.info(
      `[couverture amont] ${String(couverture.etapesMesurees)} étape(s) du § 11 confrontée(s) · ` +
        `${String(couverture.etapesAmont.length)} due(s) au transport : ` +
        `[${couverture.etapesAmont.join(", ")}] · ` +
        `${String(Object.keys(EXECUTANTS_AMONT_HTTP).length)} exécutant(s) nommé(s) · ` +
        `${String(couverture.sansExecutant.length)} étape(s) sans exécutant · ` +
        `${String(couverture.executantsOrphelins.length)} exécutant(s) orphelin(s)`,
    );

    // Le compte est mesuré DANS la boucle : il vaut la totalité du § 11, pas le
    // nombre d'étapes amont. Un `APPEL_STEPS` vidé ferait tomber les deux.
    expect(couverture.etapesMesurees).toBe(APPEL_STEPS.length);
    expect(couverture.etapesAmont.length).toBeGreaterThanOrEqual(4);
    expect(couverture.sansExecutant).toEqual([]);
    expect(couverture.executantsOrphelins).toEqual([]);
    // La DÉRIVATION s'accorde avec celle de la colonne du transport, qui est
    // écrite ailleurs et par quelqu'un d'autre. Deux dérivations d'un même fait
    // finissent d'ordinaire par se contredire ; ici, se contredire EST le signal.
    expect([...couverture.etapesAmont]).toEqual([...colonne.etapesAmont]);
  });

  it("`exigerLaCouvertureAmont` NE LÈVE PAS aujourd'hui — et c'est ce qui rend le témoin lisible", () => {
    const couverture = exigerLaCouvertureAmont();
    console.info(
      `[couverture amont · exigence] la construction du transport passe · ` +
        `${String(couverture.etapesAmont.length)} étape(s) due(s) couverte(s)`,
    );
    expect(couverture.sansExecutant).toEqual([]);
  });
});

describe("ADR 0025 — ce que le transport DIT avoir établi, confronté à ce qu'il DEVAIT", () => {
  it("rougit sur des témoins fabriqués — quatre mensonges, quatre anomalies", () => {
    const dues = colonneDuTransport("http").etapesAmont;
    const conforme: EtapesEtabliesEnAmont = {
      transport: "http",
      etapesExecutees: dues,
      etapesDues: dues,
      refusEnAmont: null,
    };

    const inconnue = 99 as unknown as AppelStep;
    const temoins: ReadonlyArray<readonly [string, EtapesEtabliesEnAmont, number]> = [
      ["l'amont conforme — aucune anomalie", conforme, 0],
      [
        "une étape due SAUTÉE — le contournement recherché",
        { ...conforme, etapesExecutees: dues.slice(0, -1) },
        1,
      ],
      ["DEUX étapes sautées", { ...conforme, etapesExecutees: dues.slice(0, -2) }, 2],
      [
        "une étape exécutée que la colonne ne doit pas",
        { ...conforme, etapesExecutees: [...dues, inconnue] },
        1,
      ],
      [
        "les étapes exécutées DANS LE DÉSORDRE — l'audience avant le jeton",
        { ...conforme, etapesExecutees: [...dues].reverse() },
        1,
      ],
      [
        "un refus prononcé, et toutes les étapes annoncées franchies",
        { ...conforme, refusEnAmont: { etape: dues[0] ?? inconnue, code: "unauthenticated" } },
        1,
      ],
    ];

    const desaccords: string[] = [];
    let anomaliesTotales = 0;
    for (const [nom, etabli, attendues] of temoins) {
      const anomalies = verifierLAmontEtabli(etabli);
      anomaliesTotales += anomalies.length;
      if (anomalies.length !== attendues) {
        desaccords.push(
          `${nom} : ${String(anomalies.length)} anomalie(s) au lieu de ${String(attendues)} ` +
            `(${anomalies.join(" · ")})`,
        );
      }
    }

    console.info(
      `[amont établi · témoins] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(dues.length)} étape(s) due(s) au transport · ` +
        `${String(anomaliesTotales)} anomalie(s) au total · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(temoins.length).toBeGreaterThanOrEqual(6);
    expect(anomaliesTotales).toBeGreaterThanOrEqual(6);
    expect(desaccords).toEqual([]);
  });
});
