import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { EtatDuVerrou } from "../core/instance/verrou.js";
import {
  ETATS_DU_VERROU,
  FORME_INSTANCE_ID,
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
  statutHealthcheckPourVerrou,
} from "../core/instance/verrou.js";
import {
  BORNE_DOBSERVATION,
  LECTURES_MINIMALES,
  REPLIQUES_ADMISES,
  observerMonoInstance,
  verifierRepliques,
  type ObservationSante,
} from "./mono-instance.js";

/**
 * GARDES — UN SECOND SOCLE QUI SERT EN MÊME TEMPS EST DÉTECTABLE.
 *
 * ⚠️ CE QUE CES GARDES MESURENT, ET CE QU'ELLES NE MESURENT PAS. Elles éprouvent
 *    la DÉTECTION : sur une série de lectures fabriquées, un second processus
 *    est-il vu, et le verdict annonce-t-il combien de lectures, d'instances et
 *    de paires il a confrontées ? Elles ne prouvent pas — et l'observateur non
 *    plus — qu'un socle est seul : c'est la borne, et elle est éprouvée elle
 *    aussi, parce qu'un périmètre d'observation énoncé comme une garantie est
 *    précisément le défaut qu'on veut éviter.
 */

const ID_A = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const ID_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

/** Un instant déterministe. Aucune horloge système : une garde qui lit l'heure
 *  réelle échoue un jour de bascule, et personne ne saura pourquoi. */
function instant(millisecondes: number): Date {
  return new Date(Date.UTC(2026, 7, 31, 9, 0, 0) + millisecondes);
}

interface LectureTemoin {
  readonly id: string;
  readonly demarreeA: Date;
  readonly luA: Date;
  readonly verrou?: EtatDuVerrou;
  readonly statut?: number;
  readonly extraits?: number;
  readonly sessions?: number;
  readonly indetermine?: boolean;
}

/** Fabrique une lecture de healthcheck. Par défaut : verrou tenu, statut
 *  cohérent — pour qu'un témoin n'échoue que sur ce qu'il éprouve. */
function lecture(temoin: LectureTemoin): ObservationSante {
  const verrou = temoin.verrou ?? "tenu";
  return {
    luA: temoin.luA,
    sante: {
      instance: { instanceId: temoin.id, demarreeA: temoin.demarreeA },
      verrou,
      provenance: {
        extraits: temoin.extraits ?? 0,
        sessions: temoin.sessions ?? 0,
        indetermine: temoin.indetermine ?? false,
      },
      statut:
        temoin.statut ??
        (verrou === "tenu" ? STATUT_HEALTHCHECK_VERROU_TENU : STATUT_HEALTHCHECK_VERROU_ABSENT),
    },
  };
}

/** Écrit ce que la garde a mesuré. Une garde muette est verte pour la pire des
 *  raisons — on ne sait pas si elle a regardé quelque chose. */
function annoncer(etiquette: string, verdict: ReturnType<typeof observerMonoInstance>): void {
  console.info(
    `[garde mono-instance] ${etiquette} — ${String(verdict.observationsMesurees)} lecture(s) ` +
      `mesurée(s), ${String(verdict.instancesDistinctes)} instance(s) distincte(s), ` +
      `${String(verdict.pairesConfrontees)} paire(s) confrontée(s), ` +
      `${String(verdict.chevauchements.length)} chevauchement(s), ` +
      `${String(verdict.anomalies.length)} anomalie(s) — conclusion : « ${verdict.conclusion} »`,
  );
  for (const constat of verdict.constats) console.info(`[garde mono-instance]   ${constat}`);
}

describe("ops/mono-instance — un SECOND processus concurrent est détecté", () => {
  it("voit deux instances qui SERVENT EN MÊME TEMPS, et dit ce qu'elle a mesuré", () => {
    // Le motif qui ne trompe pas : A, puis B, puis A de nouveau. B a répondu
    // entre deux réponses de A — les deux tournaient donc ensemble, quel que
    // soit ce que chacune déclare.
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000), extraits: 4, sessions: 2 }),
      lecture({ id: ID_B, demarreeA: instant(500), luA: instant(2_000) }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(3_000), extraits: 7, sessions: 3 }),
    ]);

    annoncer("deux instances entrelacées", verdict);

    expect(verdict.observationsMesurees).toBe(3);
    expect(verdict.instancesDistinctes).toBe(2);
    expect(verdict.pairesConfrontees).toBe(1);
    expect(verdict.chevauchements).toHaveLength(1);
    expect(verdict.conclusion).toBe("seconde-instance-vue");
    // Le chevauchement EST une anomalie : il ne se contemple pas, il se répare.
    expect(verdict.anomalies.join(" ")).toContain("EN MÊME TEMPS");
  });

  it("distingue « deux socles tournent » de « le verrou en a accordé DEUX »", () => {
    // Deux incidents, deux gestes. Un second socle démarré par erreur se coupe ;
    // un verrou qui accorde deux fois ne se répare pas en redémarrant.
    const deuxTenus = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000), verrou: "tenu" }),
      lecture({ id: ID_B, demarreeA: instant(500), luA: instant(2_000), verrou: "tenu" }),
    ]);
    const unSeulTenu = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000), verrou: "tenu" }),
      lecture({ id: ID_B, demarreeA: instant(500), luA: instant(2_000), verrou: "perdu" }),
    ]);

    annoncer("deux détenteurs du verrou", deuxTenus);
    annoncer("un seul détenteur du verrou", unSeulTenu);

    // Les deux voient le chevauchement…
    expect(deuxTenus.chevauchements).toHaveLength(1);
    expect(unSeulTenu.chevauchements).toHaveLength(1);
    // … mais seul le premier accuse le VERROU.
    expect(deuxTenus.anomalies.join(" ")).toContain("accordé deux fois");
    expect(unSeulTenu.anomalies.join(" ")).not.toContain("accordé deux fois");
    expect(deuxTenus.anomalies.length).toBeGreaterThan(unSeulTenu.anomalies.length);
  });

  it("SAIT DIRE OUI — une seule instance sur quatre lectures ne fait rougir personne", () => {
    // Sans ce cas, un observateur qui crierait TOUJOURS serait vert ci-dessus.
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(2_000), extraits: 3, sessions: 1 }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(3_000), extraits: 5, sessions: 1 }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(4_000), extraits: 5, sessions: 1 }),
    ]);

    annoncer("une seule instance", verdict);

    expect(verdict.anomalies).toEqual([]);
    expect(verdict.instancesDistinctes).toBe(1);
    // Une seule instance : AUCUNE paire à confronter. Le compte le dit, plutôt
    // que de laisser croire qu'un chevauchement a été cherché.
    expect(verdict.pairesConfrontees).toBe(0);
    expect(verdict.conclusion).toBe("aucune-seconde-instance-vue");
  });

  it("N'APPELLE PAS « conforme » ce qu'elle n'a pas vu — la borne voyage avec le verdict", () => {
    // Le point le plus important du module. Un répartiteur peut servir toutes
    // les lectures depuis la même instance pendant qu'une seconde sert le
    // trafic : l'absence de chevauchement n'est PAS une preuve de solitude.
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(2_000) }),
    ]);

    console.info(`[garde borne] conclusion rendue : « ${verdict.conclusion} »`);

    // Le nom de la conclusion dit ce qui a été mesuré, pas ce qu'on aimerait
    // conclure. Aucune valeur ne s'appelle « conforme » ni « seule ».
    expect(verdict.conclusion).toBe("aucune-seconde-instance-vue");
    expect(verdict.borne).toBe(BORNE_DOBSERVATION);
    expect(verdict.borne).toContain("ne prouve jamais");
    expect(verdict.borne).toContain("§ 20 est à ROUVRIR AVANT");
  });

  it("ne prend PAS un redéploiement pour deux socles concurrents", () => {
    // Une succession — A s'arrête, B démarre APRÈS la dernière réponse de A —
    // n'est pas un chevauchement. Crier ici apprendrait à ignorer le cri, et un
    // rouge permanent finit toujours par être désactivé.
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(2_000) }),
      lecture({ id: ID_B, demarreeA: instant(3_000), luA: instant(4_000) }),
      lecture({ id: ID_B, demarreeA: instant(3_000), luA: instant(5_000) }),
    ]);

    annoncer("redéploiement (succession)", verdict);

    expect(verdict.instancesDistinctes).toBe(2);
    // La paire A / B A BIEN ÉTÉ CONFRONTÉE — c'est ce compte qui distingue
    // « aucun chevauchement » de « aucune comparaison faite ».
    expect(verdict.pairesConfrontees).toBe(1);
    expect(verdict.chevauchements).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
    expect(verdict.conclusion).toBe("aucune-seconde-instance-vue");
  });

  it("refuse de conclure sous le minimum de lectures — « rien mesuré » n'est pas un succès", () => {
    for (const [etiquette, observations] of [
      ["aucune lecture", [] as readonly ObservationSante[]],
      ["une seule lecture", [lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) })]],
    ] as const) {
      const verdict = observerMonoInstance(observations);
      annoncer(etiquette, verdict);

      expect(verdict.conclusion, etiquette).toBe("rien-mesuré");
      // Le constat l'écrit en toutes lettres : un collecteur en panne ressemble
      // en tout point à un socle sain.
      expect(verdict.constats.join(" "), etiquette).toContain("absence de mesure");
    }

    expect(LECTURES_MINIMALES).toBe(2);
  });
});

describe("ops/mono-instance — les lectures elles-mêmes sont mises en doute", () => {
  it("rougit sur un identifiant HORS FORME — un `pid` ou un hôte n'entre pas ici", () => {
    // La forme n'est pas cosmétique : 32 caractères hexadécimaux excluent
    // mécaniquement un nom d'hôte, une adresse ou un `pid` système — interdits
    // dans une sortie publique (§ 29).
    const verdict = observerMonoInstance([
      lecture({ id: "socle-1@hote-de-prod", demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: "socle-1@hote-de-prod", demarreeA: instant(0), luA: instant(2_000) }),
    ]);

    annoncer("identifiant hors forme", verdict);

    expect(FORME_INSTANCE_ID.test("socle-1@hote-de-prod")).toBe(false);
    expect(verdict.anomalies).toHaveLength(2);
    expect(verdict.anomalies[0]).toContain("32 caractères hexadécimaux");
  });

  it("rougit sur un socle qui se déclare démarré APRÈS avoir été lu", () => {
    // C'est exactement ce qu'il faudrait falsifier pour qu'aucun chevauchement
    // n'apparaisse jamais : une fenêtre de vie qui commence dans le futur ne
    // croise personne.
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(9_000), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(9_000), luA: instant(2_000) }),
    ]);

    annoncer("horodatage incohérent", verdict);

    expect(verdict.anomalies.join(" ")).toContain("démarré APRÈS");
  });

  it("rougit sur un identifiant RÉUTILISÉ — deux démarrages y deviendraient indiscernables", () => {
    const verdict = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(5_000), luA: instant(6_000) }),
    ]);

    annoncer("identifiant réutilisé", verdict);

    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("AUTRE date de démarrage");
    // La fenêtre garde la PREMIÈRE date : élargir sur une valeur qu'on vient de
    // déclarer fausse fabriquerait un chevauchement imaginaire.
    expect(verdict.fenetres[0]?.vivanteDepuis.getTime()).toBe(instant(0).getTime());
  });

  it("rougit sur un healthcheck qui rend 200 SANS tenir le verrou — le pire des cas", () => {
    // DÉRIVÉ de `STATUT_HEALTHCHECK_VERROU_*`, jamais recopié : le jour où le
    // socle change ces deux valeurs, cette garde suit sans être retouchée.
    const verdict = observerMonoInstance([
      lecture({
        id: ID_A,
        demarreeA: instant(0),
        luA: instant(1_000),
        verrou: "perdu",
        statut: STATUT_HEALTHCHECK_VERROU_TENU,
      }),
      lecture({
        id: ID_A,
        demarreeA: instant(0),
        luA: instant(2_000),
        verrou: "tenu",
        statut: STATUT_HEALTHCHECK_VERROU_ABSENT,
      }),
    ]);

    annoncer("statut incohérent dans les deux sens", verdict);

    expect(verdict.anomalies).toHaveLength(2);
    expect(verdict.anomalies[0]).toContain("un appel sur deux");
    expect(verdict.anomalies[1]).toContain("rouge permanent");
  });

  it("écrit le SIGNAL POSITIF du § 20 — le nombre d'extraits, même à zéro", () => {
    // « Signal positif, pour qu'une garde à zéro élément se voie. » Un index
    // vide et un index qu'on ne regarde pas rendent le même chiffre ; seul le
    // fait de l'ÉCRIRE les sépare.
    const vide = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000) }),
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(2_000) }),
    ]);
    const degrade = observerMonoInstance([
      lecture({ id: ID_A, demarreeA: instant(0), luA: instant(1_000), extraits: 9, sessions: 4 }),
      lecture({
        id: ID_A,
        demarreeA: instant(0),
        luA: instant(2_000),
        extraits: 9,
        sessions: 4,
        indetermine: true,
      }),
    ]);

    annoncer("index vide", vide);
    annoncer("index dégradé", degrade);

    expect(vide.constats.join(" ")).toContain("0 extrait(s)");
    expect(degrade.constats.join(" ")).toContain("9 extrait(s)");
    expect(degrade.constats.join(" ")).toContain("DÉGRADÉ");
    expect(degrade.fenetres[0]?.indexIndetermine).toBe(true);
  });
});

describe("ops/mono-instance — le réglage de déploiement", () => {
  it("rougit au-delà d'une réplique, et le message dit d'ouvrir le § 20 AVANT", () => {
    const verdict = verifierRepliques(2);

    console.info(
      `[garde répliques] ${String(verdict.repliquesDeclarees)} déclarée(s) pour ` +
        `${String(verdict.repliquesAdmises)} admise(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("À ROUVRIR AVANT");
  });

  it("SAIT DIRE OUI sur une réplique, et rougit à zéro comme sur une valeur illisible", () => {
    const cas: ReadonlyArray<readonly [string, number, number]> = [
      ["une réplique", REPLIQUES_ADMISES, 0],
      ["aucune réplique", 0, 1],
      ["valeur fractionnaire", 1.5, 1],
      ["valeur négative", -1, 1],
    ];

    let mesures = 0;
    for (const [nom, repliques, attendu] of cas) {
      const verdict = verifierRepliques(repliques);
      expect(verdict.anomalies.length, nom).toBe(attendu);
      mesures += 1;
    }

    console.info(`[garde répliques] ${String(mesures)} réglage(s) confronté(s) sur ${cas.length}`);
    expect(mesures).toBe(cas.length);
    expect(REPLIQUES_ADMISES).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE CONTRÔLE 4 N'A QU'UNE SEULE DÉRIVATION — mesuré, pas relu
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE.**
 *
 * Le contrôle 4 confronte le statut qu'un socle observé annonce à l'état de
 * verrou qu'il déclare. Jusqu'à la recette du lot 1d, il RECALCULAIT le statut
 * attendu par un ternaire sur les deux constantes, pendant que
 * `core/instance/verrou.ts` portait `statutHealthcheckPourVerrou()`, qui dit la
 * même chose. Les deux tables étaient identiques ce jour-là — elles le sont
 * toujours le jour où on les écrit. Elles cessent de l'être le jour où l'une des
 * deux change, et des deux, **c'est le CONTRÔLE qui ne suit pas** : personne ne
 * relit un observateur en ajoutant un état de verrou.
 *
 * ⚠️ **UNE GARDE DE COMPORTEMENT NE VOIT PAS CE DÉFAUT**, et c'est pour ça que
 *    celle-ci lit le SOURCE. Tant que les deux dérivations s'accordent, tous les
 *    tests de comportement de ce fichier restent verts quelle qu'en soit
 *    l'écriture — la garde qui les distingue est celle qui mesure le nombre de
 *    dérivations, pas leurs verdicts.
 */
describe("le contrôle 4 dérive le statut par la fonction du socle, et par elle seule", () => {
  const SOURCE = readFileSync(fileURLToPath(new URL("mono-instance.ts", import.meta.url)), "utf8");

  it("appelle `statutHealthcheckPourVerrou` et ne recalcule le statut nulle part", () => {
    // Le corps, commentaires retirés : un ternaire CITÉ dans une explication
    // n'est pas une seconde dérivation, et le compter en ferait une.
    const corps = SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .map((ligne) => ligne.replace(/^\s*\/\/.*$/, " "))
      .join("\n");
    const appels = corps.match(/statutHealthcheckPourVerrou\s*\(/g) ?? [];
    // La SECONDE dérivation, telle qu'elle était écrite : un ternaire dont les
    // deux branches sont les deux constantes de statut.
    const recalculs =
      corps.match(
        /\?[^;]*STATUT_HEALTHCHECK_VERROU_\w+[^;]*:[^;]*STATUT_HEALTHCHECK_VERROU_\w+/g,
      ) ?? [];

    console.info(
      `[garde dérivation unique] ${String(SOURCE.length)} octet(s) lus · ` +
        `${String(appels.length)} appel(s) à statutHealthcheckPourVerrou · ` +
        `${String(recalculs.length)} recalcul(s) du statut par ternaire`,
    );

    // Plancher : le source a bien été lu. À zéro octet, les deux comptes
    // seraient nuls et cette garde serait verte en ne regardant rien.
    expect(SOURCE.length).toBeGreaterThan(1000);
    expect(appels.length).toBeGreaterThanOrEqual(1);
    expect(recalculs).toEqual([]);
  });

  it("SAIT DIRE NON — sur un source FABRIQUÉ qui porte la seconde dérivation", () => {
    const fabrique = [
      "const statutAttendu =",
      '  sante.verrou === "tenu" ? STATUT_HEALTHCHECK_VERROU_TENU : STATUT_HEALTHCHECK_VERROU_ABSENT;',
    ].join("\n");
    const recalculs =
      fabrique.match(
        /\?[^;]*STATUT_HEALTHCHECK_VERROU_\w+[^;]*:[^;]*STATUT_HEALTHCHECK_VERROU_\w+/g,
      ) ?? [];

    console.info(
      `[garde dérivation unique · témoin] ${String(fabrique.length)} octet(s) fabriqué(s) · ` +
        `${String(recalculs.length)} recalcul(s) détecté(s)`,
    );

    // Sans ce témoin, « 0 recalcul » ne se distinguerait pas d'une expression
    // qui ne reconnaît plus rien — le vert le plus coûteux qui soit.
    expect(recalculs).toHaveLength(1);
  });

  it("les deux dérivations s'accordent AUJOURD'HUI sur tous les états du verrou", () => {
    // ⚠️ CETTE MESURE EST LA RAISON POUR LAQUELLE LE REMPLACEMENT NE CHANGE
    //    AUCUN COMPORTEMENT — et donc la raison pour laquelle aucune garde de
    //    comportement ne pouvait le voir. Elle est écrite pour que l'accord soit
    //    daté : le jour où un état s'ajoute à `ETATS_DU_VERROU`, la seconde
    //    dérivation aurait divergé, et ce compte l'aurait dit.
    const desaccords = ETATS_DU_VERROU.filter((etat) => {
      const parLeTernaire =
        etat === "tenu" ? STATUT_HEALTHCHECK_VERROU_TENU : STATUT_HEALTHCHECK_VERROU_ABSENT;
      return statutHealthcheckPourVerrou(etat) !== parLeTernaire;
    });

    console.info(
      `[garde dérivation unique · accord] ${String(ETATS_DU_VERROU.length)} état(s) du verrou ` +
        `confronté(s) · ${String(desaccords.length)} désaccord(s) : ` +
        `${desaccords.join(", ") || "aucun"}`,
    );

    expect(ETATS_DU_VERROU.length).toBeGreaterThanOrEqual(4);
    expect(desaccords).toEqual([]);
  });
});
