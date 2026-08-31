/**
 * `core/transport/http/imports.temoin.spec.ts` — **INTERDIT DE CONSTRUCTION
 * N° 2 : LE TRANSPORT HTTP N'IMPORTE AUCUN MODULE D'ÉTAPE.**
 *
 * ═══ POURQUOI CETTE GARDE N'ÉCRIT PAS SA PROPRE DÉRIVATION ═══
 *
 * `core/transport/stdio/etapes-exercees.ts` porte déjà le CORPS de cette
 * mesure — `modulesInterditsAuTransport()`, qui dérive l'ensemble interdit
 * d'`EXECUTANTS_ETAPES`, et `confronterLesImports()`, qui est une fonction PURE
 * de ce qu'on lui donne.
 *
 * ⚠️ **EN ÉCRIRE UNE SECONDE SERAIT LE DÉFAUT, PAS LA PRUDENCE.** Deux
 *    dérivations d'un même fait finissent par se contredire, et c'est la seconde
 *    qui ne suit pas. Ici, le fait est le MÊME — « quels modules un transport
 *    n'a pas le droit d'importer » — et seul le SUJET change : ce dossier-ci au
 *    lieu de celui d'à côté. Une dérivation, deux sujets.
 *
 * ⚠️ **CE QUE CETTE GARDE NE VOIT PAS, ÉCRIT AVEC ELLE.** Elle porte sur les
 *    imports DIRECTS. `core/chaine/orchestrateur.ts` importe les cinq modules
 *    d'étape, et le transport l'atteint : c'est voulu, c'est le noyau. Elle ne
 *    voit pas non plus une étape RÉÉCRITE à la main dans le transport, sans
 *    import — c'est `couverture.spec.ts` et `amont.spec.ts` qui parlent alors,
 *    en mesurant ce que chaque étape a réellement confronté.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { confronterLesImports, modulesInterditsAuTransport } from "../stdio/etapes-exercees.js";
import type { FichierDuTransport } from "../stdio/etapes-exercees.js";

/** La racine du dépôt, DÉRIVÉE de l'emplacement de ce fichier. */
const RACINE = new URL("../../../", import.meta.url);
/** Le dossier gardé, écrit une fois. */
const DOSSIER = "core/transport/http";

/**
 * Les modules de PRODUCTION de ce dossier.
 *
 * ⚠️ LES SPECS ET LES FIXTURES SONT ÉCARTÉES, ET LE CRITÈRE EST CELUI DU DÉPÔT :
 *    `tsconfig.build.json` exclut `**\/*.spec.ts` et `**\/fixtures.ts`. Un
 *    fichier qui ne shippe pas ne peut contourner aucune étape en production —
 *    et c'est bien une fixture qui, du côté stdio, importe légitimement des
 *    modules d'étape pour fabriquer un noyau témoin.
 */
function modulesDeProduction(): readonly FichierDuTransport[] {
  const dossier = new URL(`${DOSSIER}/`, RACINE);
  return readdirSync(fileURLToPath(dossier))
    .filter((nom) => nom.endsWith(".ts"))
    .filter((nom) => !nom.endsWith(".spec.ts") && nom !== "fixtures.ts")
    .map((nom) => ({
      chemin: `${DOSSIER}/${nom}`,
      source: readFileSync(fileURLToPath(new URL(nom, dossier)), "utf8"),
    }));
}

describe("ADR 0025, interdit n° 2 — `core/transport/http/` n'importe aucun module d'étape", () => {
  it("ne trouve aucune infraction, et ANNONCE ce qu'elle a lu", () => {
    const interdits = modulesInterditsAuTransport();
    const fichiers = modulesDeProduction();
    const rapport = confronterLesImports(fichiers, interdits.modules);

    console.info(
      `[interdit n° 2 · http] ${String(rapport.fichiersLus)} module(s) de production balayé(s) ` +
        `dans ${DOSSIER}/ : ${fichiers.map((f) => f.chemin.split("/").pop() ?? "").join(", ")} · ` +
        `${String(rapport.importsLus)} import(s) lu(s), dont ` +
        `${String(rapport.importsInternes)} interne(s) au dépôt · ` +
        `${String(rapport.modulesInterditsConfrontes)} module(s) interdit(s) confronté(s), ` +
        `DÉRIVÉ(S) de ${String(interdits.entreesLues)} entrée(s) d'EXECUTANTS_ETAPES ` +
        `(${String(interdits.entreesSansModule)} sans module — les quatre étapes « HTTP seul ») · ` +
        `${String(rapport.infractions.length)} infraction(s)`,
    );

    // ── Les planchers. Chacun ferme un vert-pour-rien distinct ──────────────
    // Un dossier déplacé ferait lire zéro fichier ;
    expect(rapport.fichiersLus).toBeGreaterThanOrEqual(8);
    // un extracteur qui cesserait de mordre viderait l'ensemble interdit ;
    expect(rapport.modulesInterditsConfrontes).toBeGreaterThanOrEqual(5);
    // et un motif d'import cassé ferait tomber le compte d'imports à zéro.
    expect(rapport.importsInternes).toBeGreaterThanOrEqual(10);
    expect(rapport.infractions).toEqual([]);
  });

  it("TÉMOIN FABRIQUÉ — un import de module d'étape produit EXACTEMENT une infraction, et la NOMME", () => {
    const interdits = modulesInterditsAuTransport();

    const temoins: ReadonlyArray<readonly [string, FichierDuTransport, number]> = [
      [
        "un transport qui refait l'étape 5 à côté du noyau",
        {
          chemin: `${DOSSIER}/transport.ts`,
          source: 'import { PORTE_PAR_LE_JETON_DAPPEL } from "../../chaine/etape-05-scopes.js";\n',
        },
        1,
      ],
      [
        "un transport qui atteint l'étape 14 — l'effet extérieur",
        {
          chemin: `${DOSSIER}/transport.ts`,
          source: 'import { executer } from "../../chaine/etape-14-execution.js";\n',
        },
        1,
      ],
      [
        "un transport qui importe le dossier des limites — étapes 8, 12, 13",
        {
          chemin: `${DOSSIER}/transport.ts`,
          source: 'import { appliquerLimites } from "../../limits/index.js";\n',
        },
        1,
      ],
      [
        "le NOYAU — il DOIT être atteint : aucune infraction",
        {
          chemin: `${DOSSIER}/transport.ts`,
          source: 'import { identiteHttp } from "../../chaine/orchestrateur.js";\n',
        },
        0,
      ],
      [
        "un import de TYPE du contrat de transport — aucune infraction",
        {
          chemin: `${DOSSIER}/transport.ts`,
          source: 'import type { NoyauUnique } from "../contrat.js";\n',
        },
        0,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, fichier, attendues] of temoins) {
      const rapport = confronterLesImports([fichier], interdits.modules);
      if (rapport.infractions.length !== attendues) {
        desaccords.push(
          `${nom} : ${String(rapport.infractions.length)} infraction(s) au lieu de ` +
            `${String(attendues)}`,
        );
        continue;
      }
      // Une infraction qui ne nommerait pas le module ferait chercher au mauvais
      // endroit : le § 25 veut qu'un message dise OÙ regarder.
      if (attendues === 1 && !rapport.infractions.some((texte) => texte.includes("core/"))) {
        desaccords.push(`${nom} : l'infraction ne nomme aucun module`);
      }
    }

    console.info(
      `[interdit n° 2 · témoins] ${String(temoins.length)} témoin(s) fabriqué(s) · ` +
        `${String(interdits.modules.length)} module(s) interdit(s) : ` +
        `${interdits.modules.join(", ")} · ${String(desaccords.length)} désaccord(s)`,
    );

    expect(temoins.length).toBeGreaterThanOrEqual(5);
    expect(desaccords).toEqual([]);
  });
});
