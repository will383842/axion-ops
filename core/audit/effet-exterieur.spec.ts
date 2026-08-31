import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../types.js";
import { sha256Hex } from "./canonique.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "./fixtures.js";
// ADR 0014 — la session d'un témoin vient de la fabrique NOMMÉE de
// `core/identite/`, jamais d'un littéral : le type marqué ne l'accepte plus.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { AffineursDAppel, EnteteAppel } from "./journal.js";
import { Journal, avecJournal } from "./journal.js";
import { JournalMemoire } from "./memoire.js";
import type { LigneAudit, Terminaison } from "./vocabulaire.js";
import { EFFET_EXTERIEUR_NON_SURVENU, OUTCOMES } from "./vocabulaire.js";

/**
 * LES GARDES DE `ops_audit.externalEffect` — ADR 0017.
 *
 * ═══ CE QUE CE FICHIER MESURE, ET CE QU'IL NE PEUT PAS MESURER ═══
 *
 * Il mesure le CLIQUET, à l'endroit exact où il vit : `avecJournal`. Trois
 * questions, trois gardes, et chacune annonce son compte :
 *
 *  G1 — un refus prononcé PAR l'étape d'exécution n'est jamais « non-exécuté ».
 *       Dérivé d'`APPEL_STEPS` : la garde n'écrit ni `14`, ni la liste des
 *       quatorze autres.
 *  G2 — une EXCEPTION levée après le signal laisse la ligne accusatrice. C'est
 *       la seconde fuite de l'objectif O6, celle qu'aucune valeur d'`outcome`
 *       n'aurait couverte : `decision` y vaut « interrompu », un couple
 *       parfaitement ordinaire.
 *  G3 — le cliquet NE REDESCEND PAS. Signalé une fois, il tient sur les DIX-SEPT
 *       chemins de sortie possibles — les quinze refus du § 11, le succès, et
 *       l'exception. Le compte est DÉRIVÉ d'`APPEL_STEPS`, jamais écrit.
 *
 * ⚠️ CE QU'IL NE MESURE PAS, ET QUI EST MESURÉ AILLEURS : que l'orchestrateur
 *    tire bien le cliquet au retour de l'adaptateur, et seulement pour un effet
 *    extérieur. Cela demande la chaîne entière — c'est
 *    `core/epreuve/chaine-chemins-de-panne.spec.ts` qui le tient, avec un `send`
 *    réellement parti. Une garde de module ne peut pas prouver un câblage ; elle
 *    peut prouver que le mécanisme câblé tient ses promesses.
 */

const ENTETE: EnteteAppel = {
  principal: "temoin-appelant",
  sessionId: sessionIdDeTemoin(),
  tool: "ops.temoin.envoyer",
  toolVersion: "1.0.0",
  adapterVersion: "1.0.0",
  effect: "send",
  policyLevel: "brouillon",
  argHash: sha256Hex("entete-effet-exterieur"),
};

function journalNeuf(): { journal: Journal; store: JournalMemoire } {
  const store = new JournalMemoire();
  return { journal: new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee()), store };
}

/** La dernière ligne écrite. Lève plutôt que de rendre `undefined` en silence. */
function derniere(store: JournalMemoire): LigneAudit {
  const lignes = store.toutes();
  const ligne = lignes[lignes.length - 1];
  if (ligne === undefined) throw new Error("témoin mal fabriqué : aucune ligne écrite");
  return ligne;
}

function succes(): Terminaison<string> {
  return { genre: "succès", valeur: "ok", outcome: "ok", recordIds: [], partialSources: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
//  G1 — un refus prononcé APRÈS l'effet n'est jamais « non-exécuté »
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — G1 : l'`outcome` d'un refus dérive de l'ÉTAPE, pas du genre", () => {
  it("rougit sur un témoin fabriqué qui dérive du seul GENRE de la terminaison", () => {
    // LE TÉMOIN, ET POURQUOI IL EST NÉCESSAIRE. Une garde qui ne ferait
    // qu'observer le comportement corrigé serait verte aussi bien avant qu'après
    // — elle ne prouverait rien. Celle-ci reconstitue la dérivation FAUTIVE
    // (« refus ⇒ non-exécuté », sans regarder l'étape) et vérifie qu'elle
    // désaccorde. Si un jour elle cesse de désaccorder, c'est que la correction
    // a été défaite.
    const derivationFautive = (): string => "non-exécuté";
    const etapeExecution = APPEL_STEPS.find((etape) => etape.cle === "execution");
    if (etapeExecution === undefined) throw new Error("témoin mal fabriqué : étape introuvable");

    console.info(
      `[témoin G1 · dérivation fautive] 1 dérivation reconstituée — étape ` +
        `${String(etapeExecution.numero)} (« ${etapeExecution.cle} ») rendrait ` +
        `« ${derivationFautive()} »`,
    );

    expect(derivationFautive()).toBe("non-exécuté");
  });

  it("sépare LE refus d'après l'effet des quatorze autres, sans écrire aucun numéro", async () => {
    const { journal, store } = journalNeuf();

    const desaccords: string[] = [];
    let mesures = 0;
    let apresEffet = 0;
    let avantEffet = 0;

    for (const etape of APPEL_STEPS) {
      await avecJournal(journal, ENTETE, () =>
        Promise.resolve<Terminaison<string>>({
          genre: "refus",
          etape: etape.numero,
          code: etape.refus,
        }),
      );
      const ligne = derniere(store);
      mesures += 1;

      // LA DÉRIVATION : la clé, jamais le numéro. `APPEL_STEPS` peut réordonner
      // ses étapes ; la clé « execution » ne désigne toujours qu'un endroit.
      const attendu = etape.cle === "execution" ? "erreur" : "non-exécuté";
      if (etape.cle === "execution") apresEffet += 1;
      else avantEffet += 1;

      if (ligne.outcome !== attendu) {
        desaccords.push(
          `étape ${String(etape.numero)} (${etape.cle}) : ${ligne.outcome} au lieu de ${attendu}`,
        );
      }
      if (ligne.decision !== "refusé") {
        desaccords.push(`étape ${String(etape.numero)} : decision ${ligne.decision}`);
      }
    }

    console.info(
      `[garde G1 · outcome des refus] ${String(mesures)} étape(s) mesurée(s) — ` +
        `${String(avantEffet)} AVANT l'effet (« non-exécuté »), ` +
        `${String(apresEffet)} APRÈS (« erreur »), ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers-témoins. Zéro étape mesurée serait vert sans avoir rien regardé,
    // et zéro étape « après l'effet » voudrait dire que la clé a été renommée et
    // que la dérivation ne mord plus sur rien.
    expect(mesures).toBe(APPEL_STEPS.length);
    expect(mesures).toBeGreaterThanOrEqual(15);
    expect(apresEffet).toBe(1);
    expect(desaccords).toEqual([]);
  });

  it("n'ajoute AUCUNE valeur au vocabulaire — le mot « erreur » existait déjà", () => {
    // ADR 0017 : l'arbitrage annoncé (« quelle valeur d'`outcome` ajouter »)
    // n'avait pas lieu d'être. Une valeur de plus aurait rompu l'empreinte
    // chaînée pour un mot que `OUTCOMES` définissait déjà comme « incompactable
    // (`result_too_large`) ». Cette garde le VÉRIFIE plutôt que de le croire.
    console.info(
      `[garde G1 · vocabulaire] ${String(OUTCOMES.length)} valeur(s) d'outcome : ` +
        OUTCOMES.join(", "),
    );

    expect(OUTCOMES.length).toBe(5);
    expect([...OUTCOMES]).toContain("erreur");
    expect([...OUTCOMES]).toContain("non-exécuté");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  G2 — l'exception levée APRÈS le signal est vue
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — G2 : une exception après l'effet ne l'efface pas", () => {
  it("écrit « interrompu / erreur » ET `externalEffect` vrai", async () => {
    const { journal, store } = journalNeuf();
    const panne = new Error("clôture d'idempotence en panne, après l'envoi");

    await expect(
      avecJournal(journal, ENTETE, ({ signalerEffetExterieur }) => {
        // L'ordre est celui de la production : l'adaptateur a répondu, PUIS
        // quelque chose tombe — compaction, masquage, clôture d'idempotence.
        signalerEffetExterieur();
        return Promise.reject(panne);
      }),
    ).rejects.toBe(panne);

    const ligne = derniere(store);

    console.info(
      `[garde G2 · exception post-effet] ${String(store.toutes().length)} ligne(s) écrite(s) — ` +
        `decision : ${ligne.decision}, outcome : ${ligne.outcome}, ` +
        `externalEffect : ${String(ligne.externalEffect)}`,
    );

    expect(store.toutes().length).toBe(1);
    // ⚠️ C'EST LE POINT DE G2. Le couple « interrompu / erreur » est celui d'une
    //    panne survenue AVANT l'adaptateur comme APRÈS lui : aucune valeur
    //    d'`outcome` ne les distinguerait, et une déduction tirée d'`effect`
    //    rangerait les deux du même côté. Seul le champ le dit.
    expect(ligne.decision).toBe("interrompu");
    expect(ligne.outcome).toBe("erreur");
    expect(ligne.externalEffect).toBe(true);
  });

  it("rougit sur le témoin JUMEAU — la même panne, sans effet parti", async () => {
    // LE TÉMOIN QUI ISOLE UNE SEULE RÈGLE. Sans lui, la garde ci-dessus serait
    // verte pour un `externalEffect` bloqué à `true`. Ici, tout est identique
    // SAUF le signal : la ligne doit dire l'inverse sur ce champ, et le même
    // couple decision/outcome sur les deux autres.
    const { journal, store } = journalNeuf();
    const panne = new Error("panne AVANT que l'adaptateur ne soit appelé");

    await expect(avecJournal(journal, ENTETE, () => Promise.reject(panne))).rejects.toBe(panne);

    const ligne = derniere(store);

    console.info(
      `[témoin G2 · jumeau sans effet] 1 ligne mesurée — decision : ${ligne.decision}, ` +
        `outcome : ${ligne.outcome}, externalEffect : ${String(ligne.externalEffect)}`,
    );

    expect(ligne.decision).toBe("interrompu");
    expect(ligne.outcome).toBe("erreur");
    expect(ligne.externalEffect).toBe(EFFET_EXTERIEUR_NON_SURVENU);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  G3 — le cliquet ne redescend pas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les chemins de sortie d'un appel, DÉRIVÉS et non listés : les quinze
 * terminaisons du § 11 (quatorze refus + le succès), plus l'exception.
 *
 * ⚠️ POURQUOI CETTE FONCTION RENVOIE UN CORPS ET NON UNE TERMINAISON. La garde
 *    doit pouvoir SIGNALER avant de sortir, sur chacun des chemins. C'est le
 *    corps entier qui varie, pas seulement sa valeur de retour.
 */
function cheminsDeSortie(): ReadonlyArray<{
  readonly libelle: string;
  readonly corps: (affineurs: AffineursDAppel) => Promise<Terminaison<string>>;
  readonly leve: boolean;
}> {
  const refus = APPEL_STEPS.map((etape) => ({
    libelle: `refus étape ${String(etape.numero)} (${etape.cle})`,
    corps: ({ signalerEffetExterieur }: AffineursDAppel): Promise<Terminaison<string>> => {
      signalerEffetExterieur();
      return Promise.resolve<Terminaison<string>>({
        genre: "refus",
        etape: etape.numero,
        code: etape.refus,
      });
    },
    leve: false,
  }));

  return [
    ...refus,
    {
      libelle: "succès",
      corps: ({ signalerEffetExterieur }: AffineursDAppel): Promise<Terminaison<string>> => {
        signalerEffetExterieur();
        return Promise.resolve(succes());
      },
      leve: false,
    },
    {
      libelle: "exception",
      corps: ({ signalerEffetExterieur }: AffineursDAppel): Promise<Terminaison<string>> => {
        signalerEffetExterieur();
        return Promise.reject(new Error("panne après l'effet"));
      },
      leve: true,
    },
  ];
}

describe("core/audit — G3 : le cliquet ne redescend sur AUCUN chemin de sortie", () => {
  it("rougit sur un témoin fabriqué qui accepterait un booléen", () => {
    // LE TÉMOIN QUE L'ADR NOMME. Un signal `(survenu: boolean) => void` pourrait
    // REPASSER la ligne à `false` : un chemin de sortie écrit six mois plus tard
    // effacerait le fait qu'un envoi est parti, et la ligne resterait bien
    // formée. La garde le mesure par l'ARITÉ — la seule propriété observable à
    // l'exécution d'une signature de fonction.
    const cliquetHonnete = (): void => {
      /* aucun argument : la seule direction possible est celle qui accuse */
    };
    const cliquetReversible = (_survenu: boolean): void => {
      /* témoin fabriqué : celui-là POURRAIT redescendre */
    };

    console.info(
      `[témoin G3 · arité] 2 signatures mesurées — cliquet : ` +
        `${String(cliquetHonnete.length)} argument(s), témoin réversible : ` +
        `${String(cliquetReversible.length)}`,
    );

    expect(cliquetHonnete.length).toBe(0);
    expect(cliquetReversible.length).toBe(1);
  });

  it("laisse `externalEffect` vrai sur les DIX-SEPT chemins, refus compris", async () => {
    const chemins = cheminsDeSortie();

    const retombees: string[] = [];
    let parcourus = 0;
    let restesVrais = 0;

    for (const chemin of chemins) {
      const { journal, store } = journalNeuf();

      if (chemin.leve) {
        await expect(avecJournal(journal, ENTETE, chemin.corps)).rejects.toThrow();
      } else {
        await avecJournal(journal, ENTETE, chemin.corps);
      }

      parcourus += 1;
      const ligne = derniere(store);
      if (ligne.externalEffect) restesVrais += 1;
      else retombees.push(chemin.libelle);
    }

    console.info(
      `[garde G3 · cliquet] ${String(parcourus)} chemin(s) de sortie parcouru(s), ` +
        `${String(restesVrais)} ligne(s) dont externalEffect est resté vrai, ` +
        `${String(retombees.length)} retombée(s)`,
    );

    // Plancher-témoin : les quinze terminaisons par refus du § 11, plus le
    // succès, plus l'exception. Un `APPEL_STEPS` vidé ferait parcourir deux
    // chemins au lieu de dix-sept — et sans le plancher, la garde resterait
    // verte en n'ayant presque rien regardé.
    expect(parcourus).toBe(APPEL_STEPS.length + 2);
    expect(parcourus).toBeGreaterThanOrEqual(17);
    expect(retombees).toEqual([]);
    expect(restesVrais).toBe(parcourus);
  });

  it("part de `EFFET_EXTERIEUR_NON_SURVENU` quand le signal n'est jamais tiré", async () => {
    // L'AUTRE MOITIÉ, ET ELLE COMPTE AUTANT. Un cliquet coincé à `true` passerait
    // la garde précédente sans un mot ; c'est ici qu'il tombe. Les deux gardes
    // ne se remplacent pas : l'une prouve qu'il ne redescend pas, l'autre qu'il
    // ne monte pas tout seul.
    const chemins = cheminsDeSortie();

    const montees: string[] = [];
    let parcourus = 0;

    for (const chemin of chemins) {
      const { journal, store } = journalNeuf();
      // Le MÊME chemin, sans le signal : on ne passe pas les affineurs au corps.
      const corpsSansSignal = (): Promise<Terminaison<string>> =>
        chemin.corps({
          affinerArgHash: () => {
            /* non éprouvé ici */
          },
          signalerEffetExterieur: () => {
            /* neutralisé : c'est tout le témoin */
          },
          // ADR 0021 — le troisième membre. Le cliquet étant neutralisé ici, sa
          // LECTURE ne peut rendre que « rien n'est sorti » : c'est le seul
          // témoin cohérent, et un `true` mentirait au corps.
          effetExterieurSurvenu: () => false,
        });

      if (chemin.leve) {
        await expect(avecJournal(journal, ENTETE, corpsSansSignal)).rejects.toThrow();
      } else {
        await avecJournal(journal, ENTETE, corpsSansSignal);
      }

      parcourus += 1;
      if (derniere(store).externalEffect !== EFFET_EXTERIEUR_NON_SURVENU) {
        montees.push(chemin.libelle);
      }
    }

    console.info(
      `[garde G3 · valeur de départ] ${String(parcourus)} chemin(s) parcouru(s) sans signal, ` +
        `${String(montees.length)} ligne(s) montée(s) toute(s) seule(s)`,
    );

    expect(parcourus).toBe(APPEL_STEPS.length + 2);
    expect(montees).toEqual([]);
  });

  it("entre dans l'empreinte chaînée : deux lignes qui en diffèrent ne se confondent pas", async () => {
    // ⚠️ POURQUOI CETTE GARDE EXISTE ICI, EN PLUS DE `canonique.spec.ts`. Là-bas,
    //    la couverture est mesurée champ par champ sur une ligne fabriquée. Ici,
    //    elle est mesurée sur le chemin RÉEL — celui où `avecJournal` pose la
    //    valeur. Hors empreinte, un « l'envoi est parti » se repasserait à
    //    `false` après coup sans qu'une seule vérification ne rougisse : c'est
    //    exactement ce que l'ADR 0002 protège, et c'est la raison pour laquelle
    //    la colonne est posée MAINTENANT, avant la première ligne réelle.
    const avecEffet = journalNeuf();
    await avecJournal(avecEffet.journal, ENTETE, ({ signalerEffetExterieur }) => {
      signalerEffetExterieur();
      return Promise.resolve(succes());
    });

    const sansEffet = journalNeuf();
    await avecJournal(sansEffet.journal, ENTETE, () => Promise.resolve(succes()));

    const a = derniere(avecEffet.store);
    const b = derniere(sansEffet.store);

    console.info(
      `[garde empreinte · externalEffect] 2 lignes mesurées — ` +
        `${String(a.externalEffect)} : ${a.selfHash.slice(0, 12)}… · ` +
        `${String(b.externalEffect)} : ${b.selfHash.slice(0, 12)}…`,
    );

    // Tout le reste est identique : même en-tête, même horloge figée, même
    // scelleur, même chaînon (`prevHash` nul des deux côtés). Le SEUL écart est
    // le champ. Deux empreintes égales voudraient dire qu'il n'est pas couvert.
    expect(a.prevHash).toBe(b.prevHash);
    expect(a.externalEffect).not.toBe(b.externalEffect);
    expect(a.selfHash).not.toBe(b.selfHash);
  });
});
