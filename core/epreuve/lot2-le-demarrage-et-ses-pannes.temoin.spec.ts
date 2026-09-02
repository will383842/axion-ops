/**
 * `core/epreuve/lot2-le-demarrage-et-ses-pannes.temoin.spec.ts` — **L'ÉPREUVE DU
 * DÉMARRAGE.**
 *
 * ═══ CE QUE CE FICHIER ATTAQUE ═══
 *
 * Le lot 2 pose la racine de composition (`ops/main.ts`, ADR 0023) et annonce
 * que « le socle démarre et répond ». `ops/main.spec.ts` le mesure sur le chemin
 * NOMINAL et sur cinq refus. Ce fichier-ci n'attaque ni l'un ni l'autre : il
 * attaque les CHEMINS DE PANNE que ces gardes ne parcourent pas, et il ne
 * retient qu'un seul critère — **une panne doit FERMER une porte, jamais en
 * ouvrir une.**
 *
 * ═══ L'IDIOME `it.fails`, REPRIS DE `chaine-chemins-de-panne.spec.ts` ═══
 *
 * Chaque défaut trouvé porte l'attente du cahier des charges sous `it.fails` :
 * le test est vert AUJOURD'HUI parce qu'il échoue, et il ROUGIRA le jour où le
 * socle se conformera — c'est-à-dire qu'il faudra le basculer en `it()`. Une
 * dette ainsi écrite se rappelle ; une dette écrite en prose s'oublie.
 *
 * ⚠️ **CONSÉQUENCE STRICTE, ET ELLE EST LA RAISON DES PLANCHERS.** Un `it.fails`
 *    est vert dès qu'UNE de ses assertions échoue — y compris pour une raison
 *    étrangère au défaut visé (une signature qui change, un import cassé). Chaque
 *    `it.fails` est donc précédé d'un `it()` ORDINAIRE qui MESURE l'état réel et
 *    ANNONCE ses comptes : sans lui, un `it.fails` vert ne distinguerait pas
 *    « le socle a ce défaut-ci » de « le test ne monte plus rien ».
 *
 * ⚠️ **AUCUN APPEL RÉSEAU, AUCUNE VALEUR RÉELLE.** Les URL de base utilisées ici
 *    portent des hôtes de TLD RÉSERVÉS (`.invalid` — RFC 2606, `.test` — RFC
 *    2606 également) : aucune ne résout, aucune ne désigne une infrastructure
 *    existante, et aucun port de connexion n'est ouvert. Les ports de session
 *    sont des DOUBLES.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REGLAGES_DAUTHENTIFICATION } from "../auth/configuration.js";
import { VARIABLE_DE_L_AUDIENCE } from "../auth/ressource.js";
import type { EtatIndexProvenance } from "../chaine/etape-11-provenance.js";
import { sansLiaisons, sansProse } from "../coutures/verifier.js";
import { MagasinDeVerrousEnMemoire, frapperInstance } from "../instance/index.js";
import { deciderDemarrageMonoInstance } from "../instance/verrou.js";
import type { LigneDuMagasin, RequeteDuVerrou, SessionDeVerrou } from "../instance/postgres.js";
import { HOTE_SANS_MAGASIN_PARTAGE, choisirImplementationDuVerrou } from "../instance/postgres.js";
import { DepotPolitiqueMemoire } from "../policy/index.js";
import type { EtatCoffre } from "../vault/index.js";
import type { DependancesDuSocle, Planificateur, SocleDemarre } from "../../ops/main.js";
import { SONDES_NON_POURVUES, demarrerLeSocle } from "../../ops/main.js";

const T0 = new Date("2026-08-31T09:00:00.000Z");

/**
 * **UNE URL DE MAGASIN « RÉEL », SANS AUCUN IDENTIFIANT D'INFRASTRUCTURE.**
 *
 * ⚠️ `.test` EST UN TLD RÉSERVÉ (RFC 2606) : il ne résout jamais, il ne désigne
 *    aucune machine, et le dépôt est PUBLIC (§ 29). Ce qui compte ici n'est pas
 *    que l'hôte existe — c'est qu'il ne soit PAS `stub.invalid`, puisque
 *    `choisirImplementationDuVerrou` ne reconnaît que celui-là comme factice.
 *    Toute autre URL lisible est, pour le socle, un MAGASIN PARTAGÉ RÉEL.
 */
const URL_DE_MAGASIN_REEL = "postgresql://socle:socle@magasin-partage.test:5432/base";

/** L'URL factice du dépôt, pour le contraste. */
const URL_FACTICE = `postgresql://stub:stub@${HOTE_SANS_MAGASIN_PARTAGE}:5432/stub`;

/** § 20 — un index de provenance figé, non vide, pour que le zéro se distingue. */
function provenanceTemoin(): EtatIndexProvenance {
  return {
    extraits: 7,
    sessions: 2,
    empreintesRefusees: 0,
    sessionsEvincees: 0,
    indetermine: false,
    plafondExtraits: 10_000,
    plafondSessions: 512,
    ttlMs: 4 * 60 * 60_000,
  };
}

/** Un planificateur FACTICE : il retient la tâche au lieu de la programmer. */
const PLANIFICATEUR_INERTE: Planificateur = () => () => {
  /* rien : aucune garde d'ici ne dépend d'un battement programmé */
};

/**
 * Les quatre réglages du § 19, renseignés sur `stub.invalid` — **DÉRIVÉS de
 * `REGLAGES_DAUTHENTIFICATION`, jamais recopiés.** Une liste recopiée resterait
 * verte le jour où le § 19 en gagnerait un cinquième, et l'étage 3 refuserait
 * alors dans TOUTES les épreuves de ce fichier, pour une raison qui n'est pas
 * celle qu'elles mesurent.
 */
function reglagesDAuthentificationFactices(): Readonly<Record<string, string | undefined>> {
  const env: Record<string, string> = {};
  for (const reglage of REGLAGES_DAUTHENTIFICATION) {
    env[reglage.nom] =
      reglage.nom === VARIABLE_DE_L_AUDIENCE
        ? "https://socle.stub.invalid/api/mcp"
        : "valeur-factice-non-secrete";
  }
  return env;
}

interface Reglages {
  readonly coffre?: EtatCoffre;
  readonly lireLeCoffre?: () => Promise<EtatCoffre>;
  readonly urlDeBase?: string;
  readonly magasin?: MagasinDeVerrousEnMemoire;
  readonly ouvrirLaSessionDeVerrou?: DependancesDuSocle["ouvrirLaSessionDeVerrou"];
  readonly sortieDErreur?: string[];
}

/**
 * Les dépendances d'un socle qui DEVRAIT démarrer : coffre ouvert,
 * authentification confrontée, un hôte admis, aucun adaptateur épinglé.
 *
 * ⚠️ **L'AUTHENTIFICATION EST FOURNIE ET NON NULLE, ET C'EST DÉLIBÉRÉ.** Ces
 *    épreuves-ci portent sur les étages 1, 2 et 7 ; un étage 3 qui refuserait
 *    ferait sortir le processus avant que le défaut visé puisse se produire, et
 *    tous les `it.fails` d'ici seraient verts pour la mauvaise raison.
 */
function dependances(reglages: Reglages = {}): DependancesDuSocle {
  const sortie = reglages.sortieDErreur ?? [];
  return {
    urlDeBase: reglages.urlDeBase ?? URL_FACTICE,
    ouvrirLaSessionDeVerrou: reglages.ouvrirLaSessionDeVerrou ?? null,
    magasinEnMemoire: reglages.magasin ?? new MagasinDeVerrousEnMemoire(),
    instance: frapperInstance(T0),
    lireLEtatDuCoffre:
      reglages.lireLeCoffre ??
      ((): Promise<EtatCoffre> => Promise.resolve(reglages.coffre ?? "ouvert")),
    // ⚠️ L'ÉTAGE 3 EST FRANCHI PAR LE DÉCIDEUR RÉEL du § 19, sur les quatre
    //    réglages renseignés en `stub.invalid`. Le port reste `null` : un
    //    verdict fabriqué ici cacherait un étage 3 devenu incapable de franchir,
    //    et les épreuves des étages 1, 2 et 7 seraient vertes pour cette
    //    raison-là.
    reglagesDAuthentification: reglagesDAuthentificationFactices(),
    controlerLAuthentification: null,
    depotPolitique: new DepotPolitiqueMemoire(),
    motifDuDemarrage: "épreuve du démarrage (adversaire)",
    lireLeLockDAdaptateurs: () => Promise.resolve({ present: false, brut: null }),
    manifestesAAdmettre: [],
    // Ce montage n'admet aucun manifeste : il n'a donc rien à poser.
    depotDuRegistre: null,
    transports: ["http", "stdio"],
    hotesAutorises: ["localhost:3000"],
    lireLaProvenance: provenanceTemoin,
    periodeDeVeilleMs: 30_000,
    planifier: PLANIFICATEUR_INERTE,
    sondes: SONDES_NON_POURVUES,
    horloge: () => T0,
    ecrireSurLaSortieDErreur: (ligne) => sortie.push(ligne),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LE VERROU AVEUGLE, PRIS SUR UNE URL DE MAGASIN RÉEL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UN DOUBLE DE SESSION DÉDIÉE, PARTAGÉ ENTRE DEUX SOCLES.**
 *
 * Il tient ce que `VerrouPostgres` attend d'un magasin : la prise rend `pris`, la
 * relecture rend `tenus`. Deux socles qui s'ouvrent une session sur le MÊME
 * double se voient — c'est exactement ce qu'un magasin partagé fait, et c'est ce
 * qui permet de mesurer sans base et sans réseau.
 */
class MagasinPostgresDouble {
  private tenuPar: string | null = null;
  private prochaineSession = 0;
  sessionsOuvertes = 0;

  /** Prend le verrou pour `identite`, ou dit qu'il est déjà pris. */
  private prendre(identite: string): boolean {
    if (this.tenuPar !== null) return false;
    this.tenuPar = identite;
    return true;
  }

  /** Combien de verrous de cette clé `identite` tient : 0 ou 1. */
  private tenus(identite: string): number {
    return this.tenuPar === identite ? 1 : 0;
  }

  private rendre(): void {
    this.tenuPar = null;
  }

  ouvrir(): Promise<SessionDeVerrou> {
    this.sessionsOuvertes += 1;
    this.prochaineSession += 1;
    const identite = `session-${String(this.prochaineSession)}`;
    const session: SessionDeVerrou = {
      applicationName: "axion-ops · verrou d'instance",
      ouverte: true,
      interroger: (requete: RequeteDuVerrou): Promise<readonly LigneDuMagasin[]> => {
        if (requete.texte.includes("pg_try_advisory_lock")) {
          return Promise.resolve([{ session: identite, pris: this.prendre(identite) }]);
        }
        if (requete.texte.includes("pg_locks")) {
          return Promise.resolve([{ session: identite, tenus: this.tenus(identite) }]);
        }
        this.rendre();
        return Promise.resolve([{ rendu: true }]);
      },
      fermer: (): Promise<void> => Promise.resolve(),
    };
    return Promise.resolve(session);
  }
}

describe("épreuve ① · un magasin RÉEL sans port de session retombe sur un verrou AVEUGLE", () => {
  /**
   * **LE PLANCHER — LE CHOIX EST BIEN CELUI D'UN MAGASIN RÉEL.**
   *
   * Sans ce contrôle, l'`it.fails` qui suit serait vert le jour où l'URL cesse
   * d'être lisible : le socle refuserait de démarrer, les deux socles ne
   * serviraient plus, et « ils servent tous les deux » serait faux pour une
   * raison qui n'a rien à voir avec le défaut visé.
   */
  it("PLANCHER — l'URL désigne un magasin PARTAGÉ, et le choix l'annonce non aveugle", () => {
    const reel = choisirImplementationDuVerrou(URL_DE_MAGASIN_REEL);
    const factice = choisirImplementationDuVerrou(URL_FACTICE);

    console.info(
      `[① · plancher] URL de magasin réel → implémentation « ${reel.implementation} », ` +
        `lisible : ${String(reel.urlLisible)}, ` +
        `aveugle aux autres processus : ${String(reel.aveugleAuxAutresProcessus)} · ` +
        `URL factice → « ${factice.implementation} », ` +
        `aveugle : ${String(factice.aveugleAuxAutresProcessus)}`,
    );

    expect(reel.implementation).toBe("postgres");
    expect(reel.urlLisible).toBe(true);
    expect(reel.aveugleAuxAutresProcessus).toBe(false);
    // Le contraste : c'est bien la magic string qui distingue les deux cas.
    expect(factice.implementation).toBe("mémoire");
    expect(factice.aveugleAuxAutresProcessus).toBe(true);
  });

  /**
   * **LE TÉMOIN QUI SAIT DIRE NON — avec le port de session, le second REFUSE.**
   *
   * Sans lui, « deux socles servent » ne distinguerait pas « la racine retombe
   * sur un verrou aveugle » de « ce fichier ne sait pas fabriquer un refus ».
   */
  it("TÉMOIN — le port de session CÂBLÉ fait refuser le second socle", async () => {
    const magasinPartage = new MagasinPostgresDouble();
    const ouvrir = (): Promise<SessionDeVerrou> => magasinPartage.ouvrir();

    const premier = await demarrerLeSocle(
      dependances({ urlDeBase: URL_DE_MAGASIN_REEL, ouvrirLaSessionDeVerrou: ouvrir }),
    );
    const second = await demarrerLeSocle(
      dependances({ urlDeBase: URL_DE_MAGASIN_REEL, ouvrirLaSessionDeVerrou: ouvrir }),
    );
    const servants = [premier, second].filter((socle) => socle.demarrage.sert);

    console.info(
      `[① · témoin] port de session CÂBLÉ · ` +
        `${String(magasinPartage.sessionsOuvertes)} session(s) dédiée(s) ouverte(s) · ` +
        `${String(servants.length)} socle(s) qui sert(vent) sur 2 · ` +
        `code de sortie du second : ${String(second.demarrage.codeDeSortie)}`,
    );

    expect(magasinPartage.sessionsOuvertes).toBe(2);
    expect(servants.length).toBe(1);
    expect(second.demarrage.sert).toBe(false);

    await premier.arreter();
    await second.arreter();
  });

  /**
   * **LA MESURE DU DÉFAUT — annoncée, et lisible même quand tout va bien.**
   *
   * Deux processus = deux tas JavaScript, donc DEUX `MagasinDeVerrousEnMemoire`
   * distincts. C'est ce que `core/instance/memoire.ts` écrit lui-même : « deux
   * conteneurs sur deux hôtes ne partagent aucun magasin ».
   */
  it("MESURE — deux socles, une URL de magasin RÉEL, aucun port de session", async () => {
    const premier = await demarrerLeSocle(
      dependances({ urlDeBase: URL_DE_MAGASIN_REEL, magasin: new MagasinDeVerrousEnMemoire() }),
    );
    const second = await demarrerLeSocle(
      dependances({ urlDeBase: URL_DE_MAGASIN_REEL, magasin: new MagasinDeVerrousEnMemoire() }),
    );
    const servants = [premier, second].filter((socle) => socle.demarrage.sert);

    console.info(
      `[① · mesure] URL « magasin-partage.test » (NON factice) · ` +
        `port de session : ABSENT · ` +
        `implémentation annoncée : « ${premier.choixDuVerrou.implementation} » · ` +
        `aveugle aux autres processus, ANNONCÉ : ` +
        `${String(premier.choixDuVerrou.aveugleAuxAutresProcessus)} · ` +
        `${String(servants.length)} SOCLE(S) QUI SERT(VENT) sur 2 · ` +
        `appels d'outils acceptés : ` +
        `${servants.map((s) => String(s.demarrage.appelsDOutilsAcceptes)).join(", ")}`,
    );

    // Ce que la racine ANNONCE, et qui est faux : elle dit « postgres », donc
    // « non aveugle », alors qu'elle a construit un `VerrouEnMemoire`.
    expect(premier.choixDuVerrou.implementation).toBe("postgres");
    expect(premier.choixDuVerrou.aveugleAuxAutresProcessus).toBe(false);
    // Et ce qu'elle FAIT : deux socles servent.
    expect(servants.length).toBe(2);

    await premier.arreter();
    await second.arreter();
  });

  /**
   * 🔴 **L'ATTENTE DE L'ADR 0018 ET DE L'ADR 0024, SOUS `it.fails`.**
   *
   * « Un verrou EXCLUSIF est pris AVANT de servir quoi que ce soit. » Et
   * `choisirImplementationDuVerrou` écrit noir sur blanc le défaut que son champ
   * `urlLisible` existe pour fermer : « le socle prendrait un verrou aveugle aux
   * autres processus **en production**, sans un mot ». La racine referme cette
   * porte-là et en ouvre une seconde, par un autre chemin : `ouvrirLaSessionDeVerrou`
   * vaut `null`, la condition de l'étage 1 bascule dans son `else`, et le socle
   * prend un `VerrouEnMemoire` — aveugle — sur une URL de magasin RÉEL, en
   * annonçant `aveugleAuxAutresProcessus: false`.
   *
   * Le refus attendu est le même que pour une URL illisible : le socle ne peut
   * désigner aucun magasin de verrous, donc il ne démarre pas.
   */
  it.fails(
    "🔴 un magasin RÉEL sans port de session doit REFUSER de démarrer, pas retomber en mémoire",
    async () => {
      const socle = await demarrerLeSocle(
        dependances({ urlDeBase: URL_DE_MAGASIN_REEL, ouvrirLaSessionDeVerrou: null }),
      );
      const autre = await demarrerLeSocle(
        dependances({ urlDeBase: URL_DE_MAGASIN_REEL, ouvrirLaSessionDeVerrou: null }),
      );

      // Un seul des deux, au plus, doit servir — et l'attente stricte est
      // qu'AUCUN ne serve : le magasin désigné n'a pas été atteint.
      expect(socle.demarrage.sert).toBe(false);
      expect(autre.demarrage.sert).toBe(false);

      await socle.arreter();
      await autre.arreter();
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LE VERROU PERDU PENDANT LE DÉMARRAGE
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve ② · un verrou PERDU pendant le démarrage laisse le socle SERVIR", () => {
  /**
   * Fabrique un socle dont le verrou est arraché ENTRE l'étage 1 et l'étage 7.
   * L'arrachage se produit pendant la lecture du coffre (étage 2), qui est le
   * premier point d'attente asynchrone après l'acquisition.
   *
   * ⚠️ CE N'EST PAS UN CAS D'ÉCOLE : c'est la forme que l'ADR 0018 nomme comme la
   *    plus probable — « personne ne démarre volontairement deux socles ; une
   *    connexion, elle, tombe toute seule ». Elle tombe aussi bien pendant les
   *    quelques secondes du démarrage qu'après.
   */
  async function socleDontLeVerrouTombeAuDemarrage(): Promise<{
    readonly socle: SocleDemarre;
    readonly arrache: boolean;
  }> {
    const magasin = new MagasinDeVerrousEnMemoire();
    let arrache = false;
    const socle = await demarrerLeSocle(
      dependances({
        magasin,
        lireLeCoffre: (): Promise<EtatCoffre> => {
          arrache = magasin.arracherLeVerrou();
          return Promise.resolve("ouvert");
        },
      }),
    );
    return { socle, arrache };
  }

  /**
   * **LE PLANCHER — L'ARBITRE PUR DIT « NE DÉMARRE PAS » SUR `perdu`.**
   *
   * Sans lui, l'`it.fails` ne distinguerait pas « la racine contredit l'arbitre »
   * de « l'arbitre a changé d'avis ».
   */
  it('PLANCHER — `deciderDemarrageMonoInstance("perdu")` refuse le démarrage', () => {
    const perdu = deciderDemarrageMonoInstance("perdu");
    const tenu = deciderDemarrageMonoInstance("tenu");

    console.info(
      `[② · plancher] arbitre PUR : « perdu » → démarre : ${String(perdu.demarre)}, ` +
        `statut healthcheck : ${String(perdu.statutHealthcheck)} · ` +
        `« tenu » → démarre : ${String(tenu.demarre)}`,
    );

    expect(perdu.demarre).toBe(false);
    expect(tenu.demarre).toBe(true);
  });

  it("MESURE — le socle SERT, et son healthcheck rend 503 sur un verrou perdu", async () => {
    const { socle, arrache } = await socleDontLeVerrouTombeAuDemarrage();
    const sante = await socle.healthcheck?.();

    console.info(
      `[② · mesure] verrou arraché pendant l'étage 2 : ${String(arrache)} · ` +
        `${String(socle.demarrage.etagesConfrontes)} étage(s) confronté(s) · ` +
        `${String(socle.demarrage.etagesFranchis)} franchi(s) · ` +
        `SERT : ${String(socle.demarrage.sert)} · ` +
        `code de sortie : ${String(socle.demarrage.codeDeSortie)} · ` +
        `${String(socle.demarrage.objetsDesactives.length)} objet(s) désactivé(s) · ` +
        `healthcheck : ${String(sante?.statut ?? 0)} ` +
        `(verrou « ${sante?.corps.verrou ?? "?"} ») · ` +
        `APPELS D'OUTILS ACCEPTÉS : ${String(sante?.corps.appelsDOutilsAcceptes ?? false)} · ` +
        `routes servies : [${(sante?.corps.routesServies ?? []).join(", ")}]`,
    );

    // Le témoin a bien mordu : sans cet arrachage, tout ce qui suit serait
    // mesuré sur un socle en parfaite santé.
    expect(arrache).toBe(true);
    // L'étage 7 a REFUSÉ — la mesure n'est pas prise sur un démarrage nominal.
    expect(socle.demarrage.etagesFranchis).toBe(6);
    expect(socle.demarrage.objetsDesactives.length).toBe(1);
    // Et pourtant le socle SERT, avec un healthcheck qui rougit.
    expect(socle.demarrage.sert).toBe(true);
    expect(sante?.statut).toBe(503);
    expect(sante?.corps.verrou).toBe("perdu");

    await socle.arreter();
  });

  /**
   * 🔴 **L'ATTENTE DE L'ADR 0018, SOUS `it.fails`.**
   *
   * L'étage 7 prononce un refus d'issue `objet-desactive` — la table de
   * `ops/demarrage/etages.ts` la lui attribue, parce que « la veille ne refuse
   * pas le démarrage, elle refuse le SILENCE ». Mais ce que l'étage 7 constate
   * ici n'est pas un silence de la veille : c'est un VERROU PERDU, et l'arbitre
   * de `core/instance/verrou.ts` a déjà tranché que cet état-là NE DÉMARRE PAS.
   *
   * Deux dérivations d'un même fait, qui se contredisent — et c'est la
   * permissive qui gagne : le socle sert, `appelsDOutilsAcceptes` vaut `true`, et
   * la garde d'exfiltration du § 20 s'applique peut-être déjà une fois sur deux.
   * Le 503 le SIGNALE ; il ne l'empêche pas.
   */
  it.fails(
    "🔴 un verrou perdu au démarrage doit FAIRE SORTIR le processus, pas l'amputer d'un battement",
    async () => {
      const { socle } = await socleDontLeVerrouTombeAuDemarrage();

      // L'attente de l'ADR 0018 : « LE SOCLE NE DÉMARRE PAS, et un socle déjà
      // démarré doit être REDÉMARRÉ ».
      expect(socle.demarrage.sert).toBe(false);
      expect(socle.healthcheck).toBeNull();

      await socle.arreter();
    },
  );

  /**
   * 🔴 **LA MOITIÉ QUI OUVRE UNE PORTE, ISOLÉE.**
   *
   * Même si l'on tenait le démarrage pour acceptable, un socle qui ne peut pas
   * affirmer qu'il est seul ne doit pas ACCEPTER d'appel d'outil. Le § 23 le dit
   * pour le coffre ; l'ADR 0018 le dit pour le verrou, et pour une raison plus
   * forte : « à deux instances, la garde du § 20 ne s'applique qu'à celle qui
   * sert l'appel, et aucun compte ne le dit ».
   */
  it.fails(
    "🔴 un socle dont le verrou n'est pas tenu ne doit accepter AUCUN appel d'outil",
    async () => {
      const { socle } = await socleDontLeVerrouTombeAuDemarrage();
      const sante = await socle.healthcheck?.();

      expect(sante?.corps.appelsDOutilsAcceptes).toBe(false);
      expect(sante?.corps.routesServies).not.toContain("outils");

      await socle.arreter();
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ CE QUI APPELLE LA RACINE, ET CE QUI MONTE LES TRANSPORTS
// ═════════════════════════════════════════════════════════════════════════════

/** La racine du dépôt, DÉRIVÉE de l'emplacement de ce fichier — jamais figée. */
const RACINE_DU_DEPOT = new URL("../../", import.meta.url);

/** Les dossiers de code parcourus. Dérivés des `include` de `vitest.config.ts`. */
const DOSSIERS_DE_CODE = ["core", "ops", "adapters", "console", "voice"] as const;

interface FichierDeProduction {
  readonly chemin: string;
  readonly source: string;
}

/**
 * Les fichiers de PRODUCTION : tout `.ts` des dossiers de code, sauf les
 * `.spec.ts` et les fixtures.
 *
 * ⚠️ **LES FIXTURES SONT ÉCARTÉES, ET C'EST LA BORNE DE CET INSTRUMENT.** Un
 *    `fixtures.ts` est importable par un test et par lui seul ; le compter
 *    comme appelant de production ferait dire « c'est cousu » à un montage qui
 *    ne tourne que sous `vitest`. C'est exactement le mode de défaillance que
 *    `core/coutures/verifier.ts` ferme, et cette liste est dérivée du même
 *    critère.
 */
function fichiersDeProduction(): readonly FichierDeProduction[] {
  const trouves: FichierDeProduction[] = [];
  const parcourir = (relatif: string): void => {
    const absolu = fileURLToPath(new URL(relatif, RACINE_DU_DEPOT));
    let entrees: readonly string[];
    try {
      entrees = readdirSync(absolu);
    } catch {
      return;
    }
    for (const entree of entrees) {
      const chemin = `${relatif}/${entree}`;
      const cible = fileURLToPath(new URL(chemin, RACINE_DU_DEPOT));
      if (statSync(cible).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!entree.endsWith(".ts")) continue;
      if (entree.endsWith(".spec.ts") || entree === "fixtures.ts") continue;
      // ⚠️ LA PROSE ET LES CLAUSES D'IMPORT SONT RETIRÉES, ET CE N'EST PAS UN
      //    RAFFINEMENT. Le défaut a été MESURÉ au lot 1c : deux modules
      //    nommaient `cumulerChampsDeGouvernance()` dans un bloc JSDoc,
      //    parenthèses comprises, et la couture passait pour faite. Ici,
      //    `ops/demarrage/etages.ts` écrit `demarrerLeSocle()` en prose pour
      //    dire qu'elle n'existe PAS — le compter ferait dire à cette garde
      //    l'exact contraire de ce qu'elle mesure. Les deux nettoyages sont
      //    IMPORTÉS de `core/coutures/verifier.ts`, jamais réécrits.
      trouves.push({ chemin, source: sansLiaisons(sansProse(readFileSync(cible, "utf8"))) });
    }
  };
  for (const dossier of DOSSIERS_DE_CODE) parcourir(dossier);
  return trouves;
}

/**
 * Le motif d'appel d'un symbole. **DÉRIVÉ dans son intention de `formeDAppel` de
 * `ops/demarrage.ts`**, et réécrit ici pour une raison mesurable : cette garde-ci
 * cherche dans PLUSIEURS fichiers et n'a pas besoin de position, là où l'autre
 * lit une seule racine et en a besoin.
 *
 * ⚠️ L'ARGUMENT DE TYPE EST ADMIS — un motif `nom\s*\(` déclarerait non appelé
 *    tout symbole écrit `f<T>(…)`.
 */
function formeDAppel(symbole: string): RegExp {
  return new RegExp(`\\b${symbole}\\s*(?:<[^;()]*?>)?\\s*\\(`);
}

/** Les fichiers de production qui APPELLENT `symbole`, hors sa propre définition. */
function appelantsDeProduction(
  fichiers: readonly FichierDeProduction[],
  symbole: string,
  moduleProprietaire: string,
): readonly string[] {
  const motif = formeDAppel(symbole);
  const definition = new RegExp(`(?:function|const|class)\\s+${symbole}\\b`);
  return fichiers
    .filter((fichier) => fichier.chemin !== moduleProprietaire)
    .filter((fichier) => !definition.test(fichier.source))
    .filter((fichier) => motif.test(fichier.source))
    .map((fichier) => fichier.chemin);
}

describe("épreuve ③ · la racine est écrite, et rien ne l'appelle", () => {
  /**
   * **LE PLANCHER — L'INSTRUMENT VOIT UN APPELANT QUAND IL Y EN A UN.**
   *
   * Le témoin est fabriqué à partir d'un symbole dont on SAIT qu'il est appelé
   * en production : `demarrerLeSocleMonoInstance`, que `ops/main.ts` appelle à
   * l'étage 1. Sans ce plancher, « zéro appelant » ne distinguerait pas une
   * dette d'un balayage qui ne lit rien.
   */
  it("PLANCHER — l'instrument compte les fichiers lus ET trouve un appelant connu", () => {
    const fichiers = fichiersDeProduction();
    const cousu = appelantsDeProduction(
      fichiers,
      "demarrerLeSocleMonoInstance",
      "core/instance/demarrage.ts",
    );
    const inexistant = appelantsDeProduction(fichiers, "symboleQuiNExistePas", "");

    console.info(
      `[③ · plancher] ${String(fichiers.length)} fichier(s) de production lu(s) · ` +
        `« demarrerLeSocleMonoInstance » → ${String(cousu.length)} appelant(s) ` +
        `[${cousu.join(", ")}] · ` +
        `témoin négatif « symboleQuiNExistePas » → ${String(inexistant.length)} appelant(s)`,
    );

    // Un zéro rendrait tout ce fichier muet.
    expect(fichiers.length).toBeGreaterThan(80);
    expect(cousu).toContain("ops/main.ts");
    // Et l'instrument sait dire NON : il ne trouve pas ce qui n'existe pas.
    expect(inexistant).toEqual([]);
  });

  it("MESURE — les quatre symboles du démarrage réel, et leurs appelants", () => {
    const fichiers = fichiersDeProduction();
    const mesures = [
      { symbole: "demarrerLeSocle", module: "ops/main.ts" },
      { symbole: "creerTransportHttp", module: "core/transport/http/transport.ts" },
      { symbole: "creerServeurHttp", module: "core/transport/http/serveur.ts" },
      { symbole: "creerServeurStdio", module: "core/transport/stdio/serveur.ts" },
    ].map((cible) => ({
      ...cible,
      appelants: appelantsDeProduction(fichiers, cible.symbole, cible.module),
    }));

    const manifeste: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL("package.json", RACINE_DU_DEPOT)), "utf8"),
    );
    const scripts = Object.keys(
      (manifeste as { scripts?: Readonly<Record<string, string>> }).scripts ?? {},
    );
    const aUnPointDEntree =
      "bin" in (manifeste as Readonly<Record<string, unknown>>) ||
      scripts.includes("start") ||
      scripts.includes("ops:start");

    console.info(
      `[③ · mesure] ${String(fichiers.length)} fichier(s) de production · ` +
        mesures
          .map(
            (m) =>
              `« ${m.symbole} » → ${String(m.appelants.length)} appelant(s) ` +
              `[${m.appelants.join(", ") || "aucun"}]`,
          )
          .join(" · ") +
        ` · ${String(scripts.length)} script(s) déclaré(s) [${scripts.join(", ")}] · ` +
        `point d'entrée de processus : ${String(aUnPointDEntree)}`,
    );

    // ⚠️ **CES QUATRE ZÉROS ONT DISPARU À LA RECETTE, ET LE SENS DE LA MESURE
    //    S'EST INVERSÉ.** Ils disaient ensemble : la racine est écrite, elle
    //    SÉQUENCE les sept étages, et AUCUN processus ne l'appelle. `ops/index.ts`
    //    appelle désormais la racine, `ops/service.ts` monte les transports, et
    //    `package.json` déclare un `bin`. L'assertion est retournée : chacun des
    //    quatre symboles doit avoir AU MOINS un appelant livré, et le compte est
    //    annoncé symbole par symbole plutôt que résumé.
    for (const mesure of mesures) {
      expect(mesure.appelants.length, `appelants de ${mesure.symbole}`).toBeGreaterThan(0);
    }
    expect(aUnPointDEntree).toBe(true);
  });

  /**
   * 🔴 **LE CRITÈRE DU LOT, SOUS `it.fails`.**
   *
   * « Le socle doit pouvoir DÉMARRER EN LOCAL avec des valeurs factices sur
   * `stub.invalid` — c'est le critère du lot. » Un module de bibliothèque qui
   * démarre sous `vitest` n'est pas un socle qui démarre : il manque le geste qui
   * lit l'environnement, construit les dépendances, appelle la racine, monte au
   * moins un transport et pose le code de sortie.
   */
  it("✅ un point d'entrée de processus APPELLE la racine de composition", () => {
    const fichiers = fichiersDeProduction();
    const appelants = appelantsDeProduction(fichiers, "demarrerLeSocle", "ops/main.ts");

    expect(appelants.length).toBeGreaterThan(0);
  });

  /**
   * 🔴 **L'ÉTAGE 6 CONFRONTE DES NOMS, PAS DES SERVEURS.**
   *
   * `ops/main.ts` reçoit `transports: readonly Transport[]` — c'est-à-dire la
   * liste des CLÉS `"http" | "stdio"`, jamais des objets montés. L'étage 6 est
   * donc franchi sur une liste de chaînes : il vérifie que chaque étape du § 11
   * a un exécutant DÉCLARÉ, et il resterait vert sur un socle qui n'ouvre aucune
   * socket et ne lit aucun flux. C'est le § 32, « le socle démarre ET RÉPOND »,
   * dont seule la première moitié est tenue.
   */
  it("✅ le montage MONTE des transports, il ne se contente plus de les nommer", () => {
    const fichiers = fichiersDeProduction();
    const montages = [
      ...appelantsDeProduction(fichiers, "creerServeurHttp", "core/transport/http/serveur.ts"),
      ...appelantsDeProduction(fichiers, "creerServeurStdio", "core/transport/stdio/serveur.ts"),
    ];

    expect(montages.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④ CE QUE `appelsDOutilsAcceptes` ATTEINT, ET CE QU'IL N'ATTEINT PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve ④ · « tout appel d'outil est refusé » n'a aucun exécutant", () => {
  /**
   * **LE PLANCHER — LE REFUS EXISTE, DANS LA CHAÎNE, ET IL A UN PORT.**
   *
   * `core/chaine/orchestrateur.ts` porte bien l'étape 0 : elle appelle
   * `dependances.coffre.refusDAppelDOutil()` AVANT tout. Le défaut n'est donc pas
   * qu'elle manque — c'est que la racine ne fournit JAMAIS ce port, et que
   * `DependancesDuSocle` n'a aucun champ pour le recevoir.
   */
  it("PLANCHER — l'étape 0 de la chaîne appelle bien un port de coffre", () => {
    const orchestrateur = sansLiaisons(
      sansProse(
        readFileSync(fileURLToPath(new URL("../chaine/orchestrateur.ts", import.meta.url)), "utf8"),
      ),
    );
    const racine = sansLiaisons(
      sansProse(readFileSync(fileURLToPath(new URL("../../ops/main.ts", import.meta.url)), "utf8")),
    );

    const appelsAuPort = [...orchestrateur.matchAll(/refusDAppelDOutil\s*\(/g)].length;
    // ⚠️ **LES DEUX BORNES DE MOT SONT LA GARDE, ET LEUR ABSENCE A ÉTÉ MESURÉE
    //    ICI MÊME.** Sans l'ancre de GAUCHE, `EtatDuCoffre\b` matche
    //    `lireLEtatDuCoffre` — le champ de rapport de la racine — et cette garde
    //    aurait déclaré le port CÂBLÉ alors qu'il ne l'est pas. Un motif qui
    //    n'est ancré que d'un côté classe sur un fragment.
    //
    // ⚠️ ET C'EST BIEN `EtatDuCoffre` — LE PORT DE LA CHAÎNE — et non
    //    `EtatCoffre`, l'énumération à trois valeurs de `core/vault/etat.ts`. La
    //    racine connaît la SECONDE (elle en dérive son rapport) et ignore le
    //    PREMIER (qui, lui, refuse les appels).
    const portDansLaRacine = [...racine.matchAll(/refusDAppelDOutil|\bEtatDuCoffre\b/g)].length;
    const enumerationDansLaRacine = [...racine.matchAll(/\bEtatCoffre\b/g)].length;

    console.info(
      `[④ · plancher] orchestrateur : ${String(orchestrateur.length)} octet(s), ` +
        `${String(appelsAuPort)} appel(s) à « refusDAppelDOutil » · ` +
        `racine : ${String(racine.length)} octet(s), ` +
        `${String(portDansLaRacine)} mention(s) du PORT « EtatDuCoffre » de la chaîne · ` +
        `${String(enumerationDansLaRacine)} mention(s) de l'ÉNUMÉRATION « EtatCoffre »`,
    );

    // Les deux sources ont bien été LUES.
    expect(orchestrateur.length).toBeGreaterThan(1_000);
    expect(racine.length).toBeGreaterThan(1_000);
    // L'étape 0 existe et mord.
    expect(appelsAuPort).toBeGreaterThanOrEqual(1);
    // La racine connaît bien l'énumération — le balayage n'est pas aveugle.
    expect(enumerationDansLaRacine).toBeGreaterThan(0);
    // Et elle ignore le PORT : elle produit un BOOLÉEN de rapport, pas un refus.
    expect(portDansLaRacine).toBe(0);
  });

  /**
   * 🔴 **L'ATTENTE DU § 23 ET DU § 32, SOUS `it.fails`.**
   *
   * « Avec un coffre verrouillé […] tout outil est refusé. » Aujourd'hui,
   * `appelsDOutilsAcceptes` est calculé par `ops/demarrage.ts`, republié par le
   * healthcheck, et lu par personne d'autre. C'est un CONSTAT publié, pas un
   * refus prononcé : rien, dans la composition, ne le relie à l'étape 0 de la
   * chaîne. Un socle démarré coffre verrouillé refuse les appels d'outils parce
   * qu'il n'a aucun transport monté — et non parce que le coffre est verrouillé.
   */
  /**
   * Les trois modules qui PRODUISENT ou REPUBLIENT le drapeau, et qui ne peuvent
   * donc pas compter comme ses consommateurs : `core/vault/demarrage.ts` le
   * calcule, `ops/demarrage.ts` le relaie, `ops/main.ts` l'affiche.
   */
  const PRODUCTEURS_DU_DRAPEAU: readonly string[] = [
    "core/vault/demarrage.ts",
    "ops/demarrage.ts",
    "ops/main.ts",
  ];

  it("MESURE — qui écrit le drapeau, et qui le lit", () => {
    const fichiers = fichiersDeProduction();
    const mentions = fichiers
      .filter((fichier) => /appelsDOutilsAcceptes/.test(fichier.source))
      .map((fichier) => fichier.chemin);
    const consommateurs = mentions.filter((chemin) => !PRODUCTEURS_DU_DRAPEAU.includes(chemin));

    console.info(
      `[④ · mesure] ${String(fichiers.length)} fichier(s) de production · ` +
        `${String(mentions.length)} mention(s) de « appelsDOutilsAcceptes » [${mentions.join(", ")}] · ` +
        `dont ${String(consommateurs.length)} CONSOMMATEUR(S) ` +
        `[${consommateurs.join(", ") || "aucun"}]`,
    );

    // Le balayage voit bien quelque chose : les trois producteurs sont là.
    expect(mentions.length).toBeGreaterThanOrEqual(PRODUCTEURS_DU_DRAPEAU.length);
    // ⚠️ **L'ATTENTE S'EST INVERSÉE À LA RECETTE.** Elle exigeait `[]` — c'est-à-
    //    dire qu'AUCUN module ne lise le drapeau — et c'était la mesure d'un
    //    défaut, pas une propriété à tenir. `ops/service.ts` le lit désormais et
    //    en fait un refus. Le compte reste ANNONCÉ ; ce qui est exigé est qu'il
    //    ne retombe pas à zéro.
    expect(consommateurs.length).toBeGreaterThan(0);
  });

  it("✅ le drapeau « appels d'outils » atteint un refus, et pas seulement un écran", () => {
    const fichiers = fichiersDeProduction();
    const consommateurs = fichiers
      .filter((fichier) => /appelsDOutilsAcceptes/.test(fichier.source))
      .map((fichier) => fichier.chemin)
      .filter((chemin) => !PRODUCTEURS_DU_DRAPEAU.includes(chemin));

    console.info(
      `[④ · consommateurs] ${String(consommateurs.length)} module(s) qui LISENT le drapeau ` +
        `sans le produire [${consommateurs.join(", ") || "aucun"}]`,
    );

    expect(consommateurs.length).toBeGreaterThan(0);
    expect(consommateurs).toContain("ops/service.ts");
  });
});
