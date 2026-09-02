import { describe, expect, it } from "vitest";

import type { CoffreCurseur } from "../chaine/etape-09-curseur.js";
import type { OutilDuCatalogue } from "../chaine/etapes.js";
import type { Habilitations } from "../types.js";
import {
  creerCalculFiltersHash,
  DOMAINE_FILTERS_HASH,
  ErreurCleFiltres,
  LONGUEUR_MINIMALE_CLE,
  messageFiltersHash,
} from "./filtres.js";
import { AUCUN_CHAMP_MASQUE, masquageDelegueALAdaptateur } from "./masquage.js";

/**
 * `core/federe/filtres.spec.ts` — L'EMPREINTE DES FILTRES, ET LE RIDEAU VIDE.
 *
 * Ce que ces deux ports doivent tenir tient en trois phrases :
 *
 *  · deux entrées ÉQUIVALENTES donnent la MÊME empreinte (sinon la page 2 est
 *    refusée pour une raison qui n'est pas un changement de filtre) ;
 *  · deux entrées DIFFÉRENTES en donnent des différentes (sinon l'étape 9 ne
 *    détecte plus le curseur rejoué, ce pour quoi elle existe) ;
 *  · le masquage du mode fédéré rend zéro, et ce zéro est NOMMÉ.
 */

const CLE = "une-cle-de-garde-de-quarante-huit-caracteres-ok!";

/**
 * ⚠️ **AUCUNE VALEUR PAR DÉFAUT ICI, ET C'EST UNE LEÇON PAYÉE.** Ce helper
 *    s'écrivait `(cle = CLE)`. Le témoin « clé indéfinie » appelait donc
 *    `coffre(undefined)`, JavaScript substituait la valeur par défaut, et le
 *    test mesurait le cas nominal en croyant mesurer un refus : il rendait une
 *    empreinte parfaitement valide là où il attendait une levée.
 *
 *    Un paramètre par défaut dans un helper de test transforme silencieusement
 *    l'absence en présence — exactement ce qu'un témoin d'absence doit pouvoir
 *    distinguer.
 */
function coffre(cle: string | null | undefined): CoffreCurseur {
  return { lireCleCurseur: () => Promise.resolve(cle) };
}

function outil(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return {
    adapterId: "axionia",
    adapterVersion: "1.0.0",
    idempotency: "n/a",
    limit: null,
    warnAt: null,
    name: "inbox.recent",
    effect: "read",
    dataClass: "personal",
    pagination: "keyset",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 20_480,
    idFields: ["id"],
    ...surcharge,
  } as OutilDuCatalogue;
}

describe("l'empreinte des filtres — stable, discriminante, et à clé", () => {
  it("rend la même empreinte pour deux entrées équivalentes écrites dans un autre ordre", async () => {
    const calcul = creerCalculFiltersHash(coffre(CLE));
    const a = await calcul.calculer(outil(), { statut: "new", canal: "message" });
    const b = await calcul.calculer(outil(), { canal: "message", statut: "new" });

    // 🔑 Sans la canonisation, la page 2 serait refusée parce que le client a
    //    sérialisé ses filtres dans un autre ordre — un refus qui n'a rien à
    //    voir avec un changement de filtre.
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    console.info(`[filtres] deux ordres → une seule empreinte · ${a.slice(0, 12)}…`);
  });

  it("rend des empreintes DIFFÉRENTES dès qu'un filtre change", async () => {
    const calcul = creerCalculFiltersHash(coffre(CLE));
    const vues = new Set<string>();
    const entrees: readonly unknown[] = [
      {},
      { statut: "new" },
      { statut: "replied" },
      { statut: "new", canal: "message" },
      { statut: "new", canal: "appel" },
      { limite: 25 },
      { limite: 26 },
    ];
    for (const entree of entrees) vues.add(await calcul.calculer(outil(), entree));

    console.info(
      `[filtres] ${String(entrees.length)} jeu(x) de filtres → ${String(vues.size)} empreinte(s) distincte(s)`,
    );
    // Une collision ici, c'est un curseur rejoué que l'étape 9 laisserait passer.
    expect(vues.size).toBe(entrees.length);
  });

  it("sépare les OUTILS : la même entrée sur deux outils ne donne pas la même empreinte", async () => {
    const calcul = creerCalculFiltersHash(coffre(CLE));
    const a = await calcul.calculer(outil(), { limite: 5 });
    const b = await calcul.calculer(outil({ name: "rendezvous.list" }), { limite: 5 });
    expect(a).not.toBe(b);
  });

  it("sépare les DOMAINES : le message porte le domaine, et le cadrage empêche les collisions", () => {
    const message = messageFiltersHash("axionia.inbox.recent", {}).toString("utf8");
    expect(message).toContain(DOMAINE_FILTERS_HASH);
    // ⚠️ Le cadrage par longueur : sans lui, ("ab","c") et ("a","bc") donneraient
    //    le même message. Le message porte donc « N: » devant chaque partie.
    expect(message).toMatch(/^\d+:/);
  });

  it("change d'empreinte quand la CLÉ change — c'est un HMAC, pas un condensat nu", async () => {
    const entree = { statut: "new" };
    const a = await creerCalculFiltersHash(coffre(CLE)).calculer(outil(), entree);
    const b = await creerCalculFiltersHash(
      coffre("une-AUTRE-cle-de-quarante-huit-caracteres-ok!!!"),
    ).calculer(outil(), entree);
    // 🔑 Un SHA nu de filtres se retrouve par force brute : l'espace des filtres
    //    plausibles est minuscule. On apprendrait ce que quelqu'un a cherché en
    //    lisant son curseur.
    expect(a).not.toBe(b);
  });

  it("REFUSE de calculer sans clé utilisable, plutôt que de rendre une empreinte faible", async () => {
    const cas: readonly [string, string | null | undefined][] = [
      ["absente", null],
      ["indéfinie", undefined],
      ["vide", ""],
      ["espaces", "   "],
      ["trop courte", "a".repeat(LONGUEUR_MINIMALE_CLE - 1)],
    ];
    let refuses = 0;
    for (const [nom, cle] of cas) {
      await expect(creerCalculFiltersHash(coffre(cle)).calculer(outil(), {}), nom).rejects.toThrow(
        ErreurCleFiltres,
      );
      refuses += 1;
    }
    console.info(`[filtres] ${String(refuses)} clé(s) inutilisable(s) refusée(s)`);
    expect(refuses).toBe(cas.length);
  });

  it("la clé est relue à CHAQUE appel — une rotation qui ne tourne pas n'en est pas une", async () => {
    let lectures = 0;
    const calcul = creerCalculFiltersHash({
      lireCleCurseur: () => {
        lectures += 1;
        return Promise.resolve(CLE);
      },
    });
    await calcul.calculer(outil(), {});
    await calcul.calculer(outil(), {});
    expect(lectures).toBe(2);
  });
});

describe("le masquage du mode fédéré — vide, et NOMMÉ", () => {
  const habilitations: Habilitations = { peutVoirAppels: false, roleConsole: null };

  it("rend la charge intacte et annonce zéro champ masqué", () => {
    const charge = { items: [{ id: "a1", contact: "quelqu un" }] };
    const resultat = masquageDelegueALAdaptateur(habilitations, outil()).appliquer(charge);

    expect(resultat.charge).toBe(charge);
    expect(resultat.champsMasques).toBe(AUCUN_CHAMP_MASQUE);
    expect(AUCUN_CHAMP_MASQUE).toBe(0);
    console.info("[masquage] rideau vide, délégué à l'adaptateur — 0 champ masqué, assumé");
  });

  it("ne dépend NI des habilitations NI de l'outil — ce qui est précisément le point", () => {
    const charge = { items: [{ id: "a1" }] };
    const a = masquageDelegueALAdaptateur(
      { peutVoirAppels: false, roleConsole: null },
      outil(),
    ).appliquer(charge);
    const b = masquageDelegueALAdaptateur(
      { peutVoirAppels: true, roleConsole: null },
      outil(),
    ).appliquer(charge);
    // 🔑 Un rideau qui varierait avec les habilitations laisserait croire qu'il
    //    garde quelque chose. Il n'en garde rien : c'est l'adaptateur qui masque,
    //    à la source, et l'écart est écrit dans `masquage.ts`.
    expect(a.champsMasques).toBe(b.champsMasques);
    expect(a.charge).toBe(b.charge);
  });
});
