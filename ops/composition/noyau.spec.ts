/**
 * `ops/composition/noyau.spec.ts` — **LA CHAÎNE EST-ELLE VRAIMENT COMPOSÉE, ET
 * SAIT-ELLE ENCORE DIRE NON ?**
 *
 * ⚠️ **CE FICHIER NE MESURE PAS QUE DU VERT.** Chaque garde porte son TÉMOIN
 *    INVERSE : la composition qui refuse quand la clé de scellement manque, les
 *    quatre ports qui LÈVENT au lieu de rendre un succès, et la colonne du § 11
 *    qui doit DIFFÉRER d'un noyau à l'autre. Une garde qui ne montre que le
 *    chemin heureux est verte le jour où elle ne regarde plus rien.
 *
 * ⚠️ **AUCUN SECRET RÉEL.** Les clés ci-dessous sont des chaînes fabriquées pour
 *    ce fichier, assez longues pour franchir `LONGUEUR_MINIMALE_CLE`, et le
 *    dépôt est PUBLIC (§ 29).
 */

import { describe, expect, it } from "vitest";

import { JournalMemoire } from "../../core/audit/index.js";
import type { LigneAudit } from "../../core/audit/index.js";
import type { AppelEntrant, OutilDuCatalogue, ResultatAppel } from "../../core/chaine/index.js";
import { identiteStdio } from "../../core/chaine/index.js";
import { DepotIdempotenceEnMemoire, DepotQuotaEnMemoire } from "../../core/limits/index.js";
import { IndexProvenanceMemoire } from "../../core/chaine/etape-11-provenance.js";
import { DepotPolitiqueMemoire } from "../../core/policy/index.js";
import type { ProfileName } from "../../core/profiles/index.js";
import type { Transport } from "../../core/chaine/index.js";
// ⚠️ L'OUTIL DU HARNAIS stdio, EMPRUNTÉ PLUTÔT QUE RECOPIÉ. Un second outil
//    témoin écrit ici aurait divergé du premier au premier champ ajouté à
//    `OutilDuCatalogue`, et c'est la copie qui ne suit jamais.
import { OUTIL_BONJOUR } from "../../core/transport/stdio/fixtures.js";

import type { NoyauCompose, PortsDuNoyau } from "./noyau.js";
import { ErreurRaccordement } from "../../core/federe/raccordement.js";
import {
  CONFIRMATION_SANS_DEPOT,
  DECLARATIONS_SANS_ADAPTATEUR_ADMIS,
  ErreurAdaptateurNonAdmis,
  INTERRUPTEUR_SANS_ECRITURE,
  SANS_PONT_DE_CLE_DE_CURSEUR,
  composerLeNoyau,
} from "./noyau.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR — DES CLÉS FABRIQUÉES, ET UN COFFRE QUI N'EST QU'UN PORTE-CLÉS
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL — fabriquée pour ce fichier, et assez longue. */
const CLE_DE_SCEAU_DU_TEMOIN = "cle-de-sceau-du-temoin-de-composition-0123456789";
/** ⚠️ AUCUN SECRET RÉEL — fabriquée pour ce fichier, et assez longue. */
const CLE_ARGHASH_DU_TEMOIN = "cle-arghash-du-temoin-de-composition-0123456789";

const INSTANT_DU_TEMOIN = new Date("2026-09-01T09:00:00.000Z");

/** Les deux transports du § 11, DÉRIVÉS — jamais recopiés dans une garde. */
const COLONNES: readonly Transport[] = ["http", "stdio"];

interface DecorDeComposition {
  readonly ports: PortsDuNoyau;
  readonly journal: JournalMemoire;
  lignes(): readonly LigneAudit[];
  /** Les incidents d'alerte que le dernier recours a reçus. */
  readonly secours: string[];
}

/**
 * Monte les ports d'une composition RÉELLE.
 *
 * @param options.cleDuSceau `null` retire la clé de scellement — c'est le témoin
 *   inverse de la composition, et il ne se fabrique pas autrement.
 * @param options.outils l'inventaire épinglé. Vide par défaut, comme le socle.
 */
function decor(
  options: {
    readonly cleDuSceau?: string | null;
    readonly outils?: readonly OutilDuCatalogue[];
    /** § 14 — ce que `ops_runtime` répond. `null` fait DÉRIVER le repli. */
    readonly profil?: ProfileName | null;
    /** De quoi joindre un adaptateur distant. Absent : `null`, le refus. */
    readonly federe?: PortsDuNoyau["federe"];
    /** La clé du curseur (§ 13.1). Absente : le pont vide, qui refuse de signer. */
    readonly coffreDuCurseur?: PortsDuNoyau["coffreDuCurseur"];
  } = {},
): DecorDeComposition {
  const journal = new JournalMemoire();
  const secours: string[] = [];
  const outils = options.outils ?? [];
  const cleDuSceau = options.cleDuSceau === undefined ? CLE_DE_SCEAU_DU_TEMOIN : options.cleDuSceau;

  return {
    journal,
    secours,
    lignes: () => journal.toutes(),
    ports: {
      coffreDuSceau: { lireCleSceauJournal: () => Promise.resolve(cleDuSceau) },
      coffreDeLArgHash: { lireCleArgHash: () => Promise.resolve(CLE_ARGHASH_DU_TEMOIN) },
      coffreDuCurseur: options.coffreDuCurseur ?? SANS_PONT_DE_CLE_DE_CURSEUR,
      // Le témoin n'a personne à joindre, sauf quand il l'exige : c'est le
      // refus nommé qu'il éprouve par défaut.
      federe: options.federe ?? null,
      journalStore: journal,
      // § 23 — le coffre est OUVERT dans ce décor : l'étape 0 laisse passer, et
      // ce sont les étapes suivantes qui sont éprouvées.
      coffre: { refusDAppelDOutil: () => null },
      inventaire: () => Promise.resolve(outils),
      profilActif: (): Promise<ProfileName | null> => Promise.resolve(options.profil ?? null),
      depotPolitique: new DepotPolitiqueMemoire(),
      depotQuota: new DepotQuotaEnMemoire(),
      depotIdempotence: new DepotIdempotenceEnMemoire(),
      index: new IndexProvenanceMemoire({ maintenant: () => INSTANT_DU_TEMOIN }),
      ttlIdempotenceMs: 60_000,
      secoursDAlerte: (incident) => {
        secours.push(incident.cause);
      },
      maintenant: () => INSTANT_DU_TEMOIN,
    },
  };
}

/** Un appel entrant minimal, sur un nom d'outil que le catalogue ne porte pas. */
function appel(nomComplet: string): AppelEntrant {
  return {
    nomComplet,
    input: {},
    idempotencyKey: null,
    curseur: null,
    jetonDeConfirmation: null,
  };
}

function identiteDuTemoin(): ReturnType<typeof identiteStdio> {
  return identiteStdio({
    requestId: "req-temoin-composition",
    deadline: new Date(INSTANT_DU_TEMOIN.getTime() + 30_000),
    habilitations: { peutVoirAppels: false },
  });
}

async function composer(options: Parameters<typeof decor>[0] = {}): Promise<{
  readonly compose: NoyauCompose;
  readonly d: DecorDeComposition;
}> {
  const d = decor(options);
  return { compose: await composerLeNoyau(d.ports), d };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA CHAÎNE EST COMPOSÉE — ET LE COMPTE EST DÉRIVÉ, PAS ÉCRIT
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0039 · ① la chaîne des quatorze étapes est COMPOSÉE à la racine", () => {
  it("rend une fabrique, et ANNONCE combien de champs d'orchestrateur elle a remplis", async () => {
    const { compose } = await composer();

    console.info(
      `[① composition] fabrique : ${compose.fabrique === null ? "AUCUNE" : "posée"} · ` +
        `${String(compose.champsDeLOrchestrateur)} champ(s) de \`DependancesOrchestrateur\` ` +
        `composé(s) · empêchement : ${compose.empechement ?? "aucun"}`,
    );

    expect(compose.fabrique).not.toBeNull();
    expect(compose.empechement).toBeNull();
    // ⚠️ UN PLANCHER, PAS UNE ÉGALITÉ À UN LITTÉRAL. Le jour où l'orchestrateur
    //    gagne une dépendance, le compilateur l'exigera et ce compte MONTERA ;
    //    une égalité stricte ferait rougir une garde pour une raison qui n'a
    //    rien à voir avec la règle gardée. Ce qui doit être impossible est qu'il
    //    TOMBE : une composition amputée est une chaîne trouée.
    expect(compose.champsDeLOrchestrateur).toBeGreaterThanOrEqual(28);
  });

  it("traverse la chaîne RÉELLE : l'étape 6 refuse, et une ligne d'`ops_audit` l'atteste", async () => {
    const { compose, d } = await composer();
    expect(compose.fabrique).not.toBeNull();
    const noyau = compose.fabrique!("stdio");

    const resultat: ResultatAppel = await noyau(identiteDuTemoin(), appel("inexistant.outil"));

    console.info(
      `[① traversée] étape refusante : ${String(resultat.trace.etapeRefusante)} · ` +
        `code : ${String(resultat.refus?.code)} · ` +
        `${String(d.lignes().length)} ligne(s) d'\`ops_audit\` écrite(s) · ` +
        `selfHash de la ligne : ${String(d.lignes()[0]?.selfHash.length)} caractère(s)`,
    );

    // L'étape 6 du § 11 — l'outil n'existe pas au catalogue.
    expect(resultat.trace.etapeRefusante).toBe(6);
    expect(resultat.refus?.code).toBe("tool_disabled");

    // ⚠️ **L'INVARIANT DE SORTIE DU § 11.** C'est LUI qui distingue une chaîne
    //    composée d'une chaîne simulée : le journal est réel, scellé par la clé
    //    du décor, et il a écrit une ligne pour ce refus. Sans ligne, le socle
    //    servirait des appels qu'aucune ligne d'`ops_audit` n'atteste — la
    //    phrase exacte de la garde de `monterLeService`.
    expect(d.lignes()).toHaveLength(1);
    expect(d.lignes()[0]?.stepDenied).toBe(6);
    expect(d.lignes()[0]?.selfHash).toHaveLength(64);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② UN NOYAU PAR COLONNE — LE DÉFAUT QUE L'ADR 0039 FERME
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0039 · ② un noyau PAR COLONNE, et la colonne est celle demandée", () => {
  it("sert chaque transport avec SA colonne du § 11 — jamais celle du voisin", async () => {
    const { compose } = await composer();
    expect(compose.fabrique).not.toBeNull();
    const fabrique = compose.fabrique!;

    const vus: {
      readonly demandee: Transport;
      readonly servie: Transport;
      readonly amont: number;
    }[] = [];
    for (const colonne of COLONNES) {
      const resultat = await fabrique(colonne)(identiteDuTemoin(), appel("inexistant.outil"));
      vus.push({
        demandee: colonne,
        servie: resultat.trace.transport,
        amont: resultat.trace.etapesAmont.length,
      });
    }

    console.info(
      `[② colonnes] ${String(vus.length)} colonne(s) confrontée(s) · ` +
        vus
          .map(
            (vu) =>
              `demandée « ${vu.demandee} » → servie « ${vu.servie} » · ` +
              `${String(vu.amont)} étape(s) en amont`,
          )
          .join(" · ") +
        ` · ${String(compose.colonnesFrappees())} noyau(x) frappé(s)`,
    );

    // ⚠️ **LA GARDE EST L'ÉGALITÉ DEMANDÉE = SERVIE, PAS LE COMPTE DE NOYAUX.**
    //    Un montage qui frapperait deux noyaux et leur passerait la même colonne
    //    rendrait « 2 frappés » en restant faux. C'est la TRACE qui dit la
    //    colonne, parce que c'est elle que l'orchestrateur a réellement lue.
    for (const vu of vus) expect(vu.servie).toBe(vu.demandee);
    expect(compose.colonnesFrappees()).toBe(COLONNES.length);

    // ⚠️ **ET LES DEUX COLONNES NE SE VALENT PAS**, sans quoi l'égalité
    //    ci-dessus serait verte sur une fabrique qui ignore son paramètre. En
    //    HTTP, les quatre étapes « HTTP seul » sont établies EN AMONT ; en
    //    stdio elles n'existent pas. Le témoin est ce nombre-là.
    const amontHttp = vus.find((vu) => vu.demandee === "http")?.amont ?? -1;
    const amontStdio = vus.find((vu) => vu.demandee === "stdio")?.amont ?? -1;
    expect(amontHttp).toBeGreaterThan(amontStdio);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ LE TÉMOIN INVERSE — LA COMPOSITION SAIT REFUSER
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0002 · ③ sans clé de scellement, la chaîne N'EST PAS composée", () => {
  it("rend `fabrique: null` et un empêchement qui NOMME la clé — jamais une fabrique muette", async () => {
    const { compose } = await composer({ cleDuSceau: null });

    console.info(
      `[③ témoin inverse] fabrique : ${compose.fabrique === null ? "AUCUNE" : "POSÉE"} · ` +
        `${String(compose.champsDeLOrchestrateur)} champ(s) composé(s) · ` +
        `empêchement : ${compose.empechement ?? "AUCUN"}`,
    );

    expect(compose.fabrique).toBeNull();
    expect(compose.champsDeLOrchestrateur).toBe(0);
    expect(compose.empechement).not.toBeNull();
    expect(compose.empechement).toContain("ADR 0002");
    // Le § 15 exige que le message dise ce qu'il faut faire ensuite.
    expect(compose.empechement).toContain("scellement");
  });

  it("REFUSE AUSSI une clé trop courte — la longueur est une garde, pas une politesse", async () => {
    const { compose } = await composer({ cleDuSceau: "trop-courte" });

    console.info(
      `[③ clé courte] 11 caractère(s) présentés · ` +
        `fabrique : ${compose.fabrique === null ? "AUCUNE" : "POSÉE"}`,
    );

    expect(compose.fabrique).toBeNull();
    expect(compose.empechement).toContain("ADR 0002");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④ LES PORTS QUI EXIGENT UN ADAPTATEUR — REFUS NOMMÉ, JAMAIS COMPLAISANCE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0039 · ④ ce que la composition N'A PAS LE DROIT de fabriquer", () => {
  it("LÈVE par la chaîne RÉELLE quand un outil est servi sans exécutant — et la ligne est écrite", async () => {
    // ⚠️ **CE TÉMOIN ATTEINT LE PORT PAR LA CHAÎNE, PAS PAR SA SIGNATURE.** Un
    //    test qui rappellerait la fonction qu'il vient d'écrire ne prouverait
    //    rien : il faut qu'un appel TRAVERSE les étapes 0, 5, 6 et 7 et bute sur
    //    `reglages`. C'est pourquoi l'inventaire porte ici UN outil — l'outil du
    //    harnais stdio, qui n'a pas d'adaptateur derrière lui, exactement comme
    //    le socle le jour où un manifeste serait épinglé sans exécutant.
    // Le profil est DONNÉ ici — il vient d'`ops_runtime` (§ 14), et sans lui
    // l'étape 7 refuse avant l'étape 8 : le témoin ne mesurerait alors que le
    // refus de profil, pas l'absence d'exécutant.
    const { compose, d } = await composer({
      outils: [OUTIL_BONJOUR],
      profil: OUTIL_BONJOUR.profiles[0] ?? null,
    });
    expect(compose.fabrique).not.toBeNull();
    const noyau = compose.fabrique!("stdio");

    let leve: ErreurAdaptateurNonAdmis | null = null;
    let rendu: ResultatAppel | null = null;
    try {
      rendu = await noyau(identiteDuTemoin(), appel(OUTIL_BONJOUR.name));
    } catch (erreur: unknown) {
      if (erreur instanceof ErreurAdaptateurNonAdmis) leve = erreur;
      else throw erreur;
    }

    console.info(
      `[④ refus nommé] appel servi : ${rendu === null ? "AUCUN" : "UN — la complaisance a été acceptée"} · ` +
        `levée : ${leve === null ? "AUCUNE" : `${leve.port}/${leve.outil}`} · ` +
        `${String(d.lignes().length)} ligne(s) d'\`ops_audit\` · ` +
        `décision : ${String(d.lignes()[0]?.decision)}`,
    );

    // ⚠️ LA GARDE EST DOUBLE, ET LES DEUX MOITIÉS COMPTENT. Un port de
    //    complaisance rendrait un appel SERVI (`rendu !== null`) ; un port qui
    //    lève sans que le journal écrive romprait l'invariant de sortie du § 11.
    expect(rendu).toBeNull();
    expect(leve).not.toBeNull();
    expect(leve?.port).toBe("reglages");
    expect(leve?.outil).toBe(OUTIL_BONJOUR.name);
    expect(d.lignes()).toHaveLength(1);
    expect(d.lignes()[0]?.decision).toBe("interrompu");
  });

  it("avec un raccordement fédéré, AUCUN port ne manque plus : la chaîne va jusqu'au réseau", async () => {
    // ⚠️ **CE QUE CE TÉMOIN FIGE, ET POURQUOI IL EST ÉCRIT AINSI.**
    //
    //    Le 2026-09-02, `appelAdaptateur` a cessé d'être un `Promise.reject` :
    //    la composition sait désormais joindre un adaptateur distant quand on
    //    lui donne de quoi le faire. Mais servir un outil fédéré de bout en
    //    bout a demandé quatre autres ports. Trois sont branchés depuis
    //    (`validerEntree` par ajv, `empreinteFiltres`, `fabriqueMasquage`) ;
    //    reste `reglages`, dont les trois valeurs n'existent encore ni dans
    //    `ops_tool` ni dans le catalogue — une couture avec migration.
    //
    //    Ce test dit donc exactement où en est la chaîne : le port d'appel est
    //    branché, et ce qui bute est le PREMIER des quatre restants. Il ne
    //    prétend pas qu'un outil fédéré fonctionne — ce serait faux.
    //
    // 🔑 Il a rougi UTILEMENT le 2026-09-02 quand `reglages` a été branché — le
    //    dernier des cinq ports. Depuis, plus AUCUNE `ErreurAdaptateurNonAdmis`
    //    ne peut sortir de cette chaîne : elle traverse les quatorze étapes et
    //    bute sur le RACCORDEMENT (l'adaptateur témoin n'est pas dans le
    //    verrou), c'est-à-dire à la porte du réseau. C'est la mesure exacte de
    //    l'avancement, et elle se relit ici.
    const federe = {
      adaptateurs: { relire: () => Promise.resolve(null) },
      coffre: {
        lire: () => Promise.resolve(Buffer.from("jamais-atteint", "utf8")),
        refusDAppelDOutil: () => null,
      },
    };
    const { compose } = await composer({
      outils: [OUTIL_BONJOUR],
      profil: OUTIL_BONJOUR.profiles[0] ?? null,
      federe,
      // Sans clé de curseur, `empreinteFiltres` refuse de calculer — à raison —
      // et le témoin s'arrêterait AVANT la porte du réseau, en mesurant la
      // clé et non la chaîne. Une clé de garde, donc.
      coffreDuCurseur: {
        lireCleCurseur: () => Promise.resolve("cle-de-curseur-de-garde-sans-valeur-reelle-48!"),
      },
    });
    expect(compose.fabrique).not.toBeNull();
    const noyau = compose.fabrique!("stdio");

    let nonAdmis: ErreurAdaptateurNonAdmis | null = null;
    let raccordement: ErreurRaccordement | null = null;
    try {
      await noyau(identiteDuTemoin(), appel(OUTIL_BONJOUR.name));
    } catch (erreur: unknown) {
      if (erreur instanceof ErreurAdaptateurNonAdmis) nonAdmis = erreur;
      else if (erreur instanceof ErreurRaccordement) raccordement = erreur;
      else throw erreur;
    }

    console.info(
      `[④ bis · fédéré] port fédéré : fourni · port manquant : ${nonAdmis === null ? "AUCUN" : nonAdmis.port} · ` +
        `arrêt : ${raccordement === null ? "?" : `raccordement/${raccordement.motif}`} — la chaîne atteint la porte du réseau`,
    );

    expect(nonAdmis, "un port de composition manque encore").toBeNull();
    expect(raccordement, "la chaîne devait buter sur le RACCORDEMENT, pas avant").not.toBeNull();
    expect(raccordement?.motif).toBe("adaptateur_introuvable");
  });

  it("laisse `confronterEpinglage` MESURER l'absence : `null`, jamais une déclaration inventée", async () => {
    const declaration = await DECLARATIONS_SANS_ADAPTATEUR_ADMIS.relire("peu.importe");
    const desactive = await INTERRUPTEUR_SANS_ECRITURE.desactiver({
      nomComplet: "peu.importe",
      motif: "témoin",
      constateA: INSTANT_DU_TEMOIN,
    });
    const confirmation = await CONFIRMATION_SANS_DEPOT.verifierEtConsommer({
      presente: "jeton-fabrique-pour-ce-temoin",
      tool: "peu.importe",
      argHash: "0".repeat(64),
      principal: "stdio:local",
      maintenant: INSTANT_DU_TEMOIN,
    });
    const cleCurseur = await SANS_PONT_DE_CLE_DE_CURSEUR.lireCleCurseur();

    console.info(
      `[④ ports neutres] déclaration : ${declaration === null ? "null" : "INVENTÉE"} · ` +
        `désactivation écrite : ${String(desactive)} · confirmation : ${confirmation} · ` +
        `clé de curseur : ${cleCurseur === null ? "null" : "PRÉSENTE"}`,
    );

    // Une valeur de repli rendrait la confrontation d'épinglage TOUJOURS
    // conforme, et la règle du § 20 deviendrait une garde qui ne regarde rien.
    expect(declaration).toBeNull();
    // Rendre `true` ferait croire une désactivation écrite en base.
    expect(desactive).toBe(false);
    // Sans dépôt, aucun jeton n'a jamais été émis : `invalide` est la vérité.
    expect(confirmation).toBe("invalide");
    // Le coffre ne nomme aucun secret pour la clé des curseurs — écart mesuré.
    expect(cleCurseur).toBeNull();
  });
});
