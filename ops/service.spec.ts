/**
 * `ops/service.spec.ts` — **LE JALON DU LOT, ÉPROUVÉ SUR UN FIL RÉEL.**
 *
 * ═══ CE QUE CE FICHIER MESURE, ET POURQUOI IL OUVRE UNE SOCKET ═══
 *
 * Le lot 2 se donne pour jalon : « après lui, le socle DÉMARRE et RÉPOND ».
 * « Répondre » a un sens vérifiable, et un seul : un processus tient une socket
 * ou lit un flux, et rend une réponse. Toutes les autres gardes du dépôt
 * mesurent des fonctions ; celle-ci mesure un OCTET QUI REVIENT.
 *
 * ⚠️ **L'ÉCOUTE EST BORNÉE À `127.0.0.1`, ET AUCUN APPEL NE SORT.** Le port est
 *    obtenu en liant puis relâchant une socket éphémère : un port codé en dur
 *    ferait rougir la garde sur la machine de quelqu'un d'autre, et un rouge qui
 *    ne parle pas du code finit par être ignoré. Les valeurs de jeton, d'hôte et
 *    d'audience viennent des fabriques de témoins, toutes sur `stub.invalid`
 *    (RFC 2606, qui ne résout jamais).
 *
 * ⚠️ **LE NOYAU EST RÉEL.** `fabriquerHarnaisStdio` monte `orchestrerAppel` avec
 *    les cinq étapes de `core/chaine`, le vrai journal chaîné et le vrai index de
 *    provenance. Ce qui est doublé est ce qui STOCKE, jamais ce qui DÉCIDE.
 */

import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import type { EtatIndexProvenance } from "../core/chaine/etape-11-provenance.js";
import { MagasinDeVerrousEnMemoire, frapperInstance } from "../core/instance/index.js";
import { HOTE_SANS_MAGASIN_PARTAGE } from "../core/instance/postgres.js";
import { DepotPolitiqueMemoire } from "../core/policy/index.js";
import {
  AUDIENCE_DE_TEMOIN,
  PORTEUR_DE_TEMOIN,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "../core/transport/http/fixtures.js";
import { CHEMIN_MCP, METHODE_MCP } from "../core/transport/http/index.js";
import type {
  JournalDesRefusEnAmont,
  LectureDuDelaiDeReprise,
  RefusEnAmont,
  RequeteHttp,
} from "../core/transport/http/index.js";
import {
  HABILITATIONS_DU_HARNAIS,
  INSTANT_DU_HARNAIS,
  OUTIL_BONJOUR,
  fabriquerHarnaisStdio,
} from "../core/transport/stdio/fixtures.js";
import type { HarnaisStdio } from "../core/transport/stdio/fixtures.js";
import type { DescripteurOutilServi } from "../core/transport/stdio/index.js";
import type { EtatCoffre } from "../core/vault/index.js";
import { PONT_AU_PLUS_FAIBLE, catalogueDesAdaptateursAdmis } from "./index.js";
import type { DependancesDuSocle, Planificateur } from "./main.js";
import { SONDES_NON_POURVUES, demarrerLeSocle, reglagesDepuisLEnvironnement } from "./main.js";
import type { PortsDuService, ReglagesDuService } from "./service.js";
import { ErreurDeMontageDuService, monterLeService } from "./service.js";

const PLANIFICATEUR_INERTE: Planificateur = () => () => {
  /* rien : aucune garde d'ici ne dépend d'un battement programmé */
};

/** § 20 — un index figé, non vide, pour que le zéro se distingue d'une mesure. */
function provenanceTemoin(): EtatIndexProvenance {
  return {
    extraits: 3,
    sessions: 1,
    empreintesRefusees: 0,
    sessionsEvincees: 0,
    indetermine: false,
    plafondExtraits: 10_000,
    plafondSessions: 512,
    ttlMs: 4 * 60 * 60_000,
  };
}

/** L'environnement factice du § 19, COMPLET. Aucune valeur réelle. */
const ENV_FACTICE: Readonly<Record<string, string>> = {
  DATABASE_URL: `postgresql://stub:stub@${HOTE_SANS_MAGASIN_PARTAGE}:5432/stub`,
  OPS_RESOURCE_INDICATOR: AUDIENCE_DE_TEMOIN,
  OPS_CONSOLE_ISSUER: "https://socle.stub.invalid/auth",
  OPS_CONSOLE_SESSION_KEY: "valeur-factice-non-secrete",
  OPS_CONSOLE_TOTP_ISSUER: "axion-ops (garde)",
};

async function socleQuiSert(
  coffre: EtatCoffre,
  hotesAdmis: readonly string[],
): Promise<ReturnType<typeof demarrerLeSocle>> {
  const environnement = reglagesDepuisLEnvironnement({
    ...ENV_FACTICE,
    OPS_ALLOWED_HOSTS: hotesAdmis.join(","),
  });
  const deps: DependancesDuSocle = {
    urlDeBase: environnement.urlDeBase,
    ouvrirLaSessionDeVerrou: null,
    magasinEnMemoire: new MagasinDeVerrousEnMemoire(),
    instance: frapperInstance(INSTANT_DU_HARNAIS),
    lireLEtatDuCoffre: () => Promise.resolve(coffre),
    reglagesDAuthentification: environnement.reglagesDAuthentification,
    controlerLAuthentification: null,
    depotPolitique: new DepotPolitiqueMemoire(),
    motifDuDemarrage: "démarrage du socle (garde du service)",
    lireLeLockDAdaptateurs: () => Promise.resolve({ present: false, brut: null }),
    manifestesAAdmettre: [],
    // Ce montage n'admet aucun manifeste : il n'a donc rien à poser.
    depotDuRegistre: null,
    transports: ["http", "stdio"],
    hotesAutorises: environnement.hotesAutorises,
    lireLaProvenance: provenanceTemoin,
    periodeDeVeilleMs: 30_000,
    planifier: PLANIFICATEUR_INERTE,
    sondes: SONDES_NON_POURVUES,
    horloge: () => INSTANT_DU_HARNAIS,
    ecrireSurLaSortieDErreur: () => {
      /* la garde lit `demarrage`, pas la sortie d'erreur */
    },
  };
  return demarrerLeSocle(deps);
}

/** Un flux d'entrée fabriqué : la garde POUSSE les morceaux elle-même. */
class FluxDEntreeFabrique {
  #ecouteur: ((morceau: string) => void) | null = null;
  public codages: string[] = [];

  setEncoding(codage: "utf8"): unknown {
    this.codages.push(codage);
    return this;
  }

  on(_evenement: "data", ecouteur: (morceau: string) => void): unknown {
    this.#ecouteur = ecouteur;
    return this;
  }

  pousser(morceau: string): void {
    if (this.#ecouteur === null) throw new Error("garde mal fabriquée : aucun écouteur branché");
    this.#ecouteur(morceau);
  }
}

/** Un flux de sortie fabriqué : il RETIENT ce que le socle écrit. */
class FluxDeSortieFabrique {
  public readonly ecrites: string[] = [];

  write(donnees: string): unknown {
    this.ecrites.push(donnees);
    return true;
  }
}

/**
 * UN PORT LIBRE, OBTENU EN LIANT PUIS EN RELÂCHANT.
 *
 * ⚠️ Un port codé en dur ferait rougir cette garde sur la machine de quelqu'un
 *    d'autre, pour une raison qui n'a rien à voir avec le code gardé.
 */
function portLibre(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const sonde = createServer();
    sonde.once("error", rejeter);
    sonde.listen(0, "127.0.0.1", () => {
      const adresse = sonde.address();
      if (adresse === null || typeof adresse === "string") {
        rejeter(new Error("la sonde n'a pas rendu de port"));
        return;
      }
      const port = adresse.port;
      sonde.close(() => {
        resoudre(port);
      });
    });
  });
}

/** Les ports du service, montés sur un noyau RÉEL. */
function portsAvecNoyauReel(
  entree: FluxDEntreeFabrique,
  sortie: FluxDeSortieFabrique,
  outilsServis: readonly DescripteurOutilServi[],
): {
  readonly ports: PortsDuService;
  readonly lectures: () => number;
  /** Le harnais LUI-MÊME : `quota.refuseTout` est le levier de l'étape 12. */
  readonly harnais: HarnaisStdio;
} {
  const harnais = fabriquerHarnaisStdio();
  const catalogue = catalogueDesAdaptateursAdmis(outilsServis);
  return {
    ports: {
      // ADR 0039 — le montage réclame une FABRIQUE et l'appelle une fois par
      // colonne. Le harnais, lui, ne sait composer qu'un noyau `stdio` ; ce
      // décor rend donc le même objet pour les deux colonnes, et c'est un ÉCART
      // ASSUMÉ DU DÉCOR, pas du montage : ce qui est éprouvé ici est que les
      // transports montent et répondent. Que la fabrique soit appelée une fois
      // PAR colonne est éprouvé par `ops/composition/noyau.spec.ts`, sur la
      // fabrique RÉELLE, où la colonne est observable.
      noyau: () => harnais.noyau,
      catalogue: catalogue.catalogue,
      habilitations: () => HABILITATIONS_DU_HARNAIS,
      verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      pontDIdentite: PONT_AU_PLUS_FAIBLE,
      fluxDEntree: entree,
      fluxDeSortie: sortie,
      maintenant: () => INSTANT_DU_HARNAIS,
      // ADR 0037, décision 2 — LES DEUX FENTES. Le décor les laisse NON ARMÉES
      // par défaut : le § 32 ① et le § 23 ② mesurent le montage, pas l'amont.
      // Les gardes du § ③ les arment, et c'est là que la couture se voit.
      journalDesRefus: null,
      delaiDeReprise: null,
    },
    lectures: (): number => catalogue.lectures(),
    harnais,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LE JALON — LE SOCLE ÉCOUTE, ET IL RÉPOND
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 32 · ① le socle MONTE ses deux transports et répond sur le fil", () => {
  it("ouvre une socket sur la boucle locale et sert un `tools/call` de bout en bout", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    const service = monterLeService(socle, ports, {
      transports: ["http", "stdio"],
      hotesAdmis: [hote],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: 30_000,
      octetsMaxDuCorps: 1_048_576,
      portHttp: port,
      adresseHttp: "127.0.0.1",
    });

    const liee = await service.ecouter();

    const corps = JSON.stringify({
      jsonrpc: "2.0",
      id: "garde-1",
      method: "tools/call",
      params: { name: OUTIL_BONJOUR.name, arguments: { ton: "neutre" } },
    });
    const reponse = await fetch(`http://${hote}/api/mcp`, {
      method: "POST",
      headers: {
        host: hote,
        "content-type": "application/json",
        authorization: `Bearer ${PORTEUR_DE_TEMOIN}`,
      },
      body: corps,
    });
    const lu = (await reponse.json()) as Record<string, unknown>;

    console.info(
      `[① · le socle répond] transports NOMMÉS : [http, stdio] · ` +
        `transports MONTÉS : [${service.transportsMontes.join(", ")}] · ` +
        `sert les outils : ${String(service.sertLesOutils)} · ` +
        `${String(service.empechements.length)} empêchement(s) · ` +
        `écoute sur ${liee?.adresse ?? "?"}:${String(liee?.port ?? 0)} · ` +
        `statut HTTP : ${String(reponse.status)} · ` +
        `clés du corps : [${Object.keys(lu).join(", ")}] · ` +
        `${String(corps.length)} octet(s) envoyés`,
    );

    // ── LE JALON, MESURÉ ────────────────────────────────────────────────────
    expect(service.empechements).toEqual([]);
    expect(service.sertLesOutils).toBe(true);
    expect(service.transportsMontes).toEqual(["http", "stdio"]);
    expect(liee).not.toBeNull();
    expect(liee?.adresse).toBe("127.0.0.1");
    expect(reponse.status).toBe(200);
    // Un refus de la chaîne serait un `result` portant `isError` ; une enveloppe
    // fautive serait un `error`. Ici : ni l'un ni l'autre, l'appel a traversé.
    expect(Object.keys(lu)).toContain("result");
    expect(lu["error"]).toBeUndefined();

    await service.arreter();
    await socle.arreter();
  });

  it("lit le FIL stdio et rend un `tools/list` — la liste est RELUE à chaque appel", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const outil: DescripteurOutilServi = {
      name: OUTIL_BONJOUR.name,
      description: OUTIL_BONJOUR.description,
      inputSchema: OUTIL_BONJOUR.inputSchema,
    };
    const { ports, lectures } = portsAvecNoyauReel(entree, sortie, [outil]);

    const service = monterLeService(socle, ports, {
      transports: ["stdio"],
      hotesAdmis: [hote],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: 30_000,
      octetsMaxDuCorps: 1_048_576,
      portHttp: port,
    });

    const APPELS = 3;
    for (let rang = 0; rang < APPELS; rang += 1) {
      entree.pousser(`${JSON.stringify({ jsonrpc: "2.0", id: rang + 1, method: "tools/list" })}\n`);
    }
    await service.attacheStdio?.aQuai();

    const reponses = sortie.ecrites.map(
      (ligne) => JSON.parse(ligne.trimEnd()) as Record<string, unknown>,
    );
    const premiere = reponses[0]?.["result"] as { tools?: readonly unknown[] } | undefined;
    const mesures = service.serveurStdio?.mesures();

    console.info(
      `[① · le fil stdio] ${String(APPELS)} ligne(s) poussée(s) · ` +
        `${String(service.attacheStdio?.morceauxRecus() ?? 0)} morceau(x) reçu(s) · ` +
        `${String(service.attacheStdio?.levees() ?? -1)} levée(s) · ` +
        `${String(sortie.ecrites.length)} réponse(s) écrite(s) · ` +
        `${String(mesures?.toolsListServis ?? -1)} tools/list servi(s) · ` +
        `${String(mesures?.lecturesDuCatalogue ?? -1)} lecture(s) du catalogue par le transport · ` +
        `${String(lectures())} listage(s) réellement demandé(s) au port · ` +
        `${String(premiere?.tools?.length ?? -1)} outil(s) dans la première réponse · ` +
        `codage(s) posé(s) sur le flux d'entrée : [${entree.codages.join(", ")}]`,
    );

    // Le transport est BRANCHÉ : les morceaux arrivent, et rien ne lève.
    expect(service.transportsMontes).toEqual(["stdio"]);
    expect(service.attacheStdio?.morceauxRecus()).toBe(APPELS);
    expect(service.attacheStdio?.levees()).toBe(0);
    expect(entree.codages).toEqual(["utf8"]);

    // Et il RÉPOND : une réponse par ligne, portant la liste servie.
    expect(sortie.ecrites.length).toBe(APPELS);
    expect(premiere?.tools?.length).toBe(1);

    // § 11 — « la liste est relue à chaque `tools/list` » : trois comptes qui
    // doivent coïncider. Une mémoïsation les ferait diverger.
    expect(mesures?.toolsListServis).toBe(APPELS);
    expect(mesures?.lecturesDuCatalogue).toBe(APPELS);
    expect(lectures()).toBe(APPELS);

    await service.arreter();
    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LE MONTAGE SAIT DIRE NON
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 23 · ② le montage refuse — et il NOMME ce qui l'en empêche", () => {
  /**
   * ⚠️ **C'EST ICI QUE `appelsDOutilsAcceptes` CESSE D'ÊTRE UN CONSTAT PUBLIÉ.**
   *    Il était calculé par `core/vault/demarrage.ts`, relayé par
   *    `ops/demarrage.ts`, republié par le healthcheck — et lu par PERSONNE. Le
   *    § 32 était donc éprouvé sur des ÉTIQUETTES : « `routesServies` contient
   *    la chaîne `console` ». Ici il décide, et la mesure est un compte de
   *    transports montés.
   */
  it("coffre VERROUILLÉ — le socle vit, le healthcheck rend 200, et RIEN n'écoute", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("verrouillé", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    const service = monterLeService(socle, ports, {
      transports: ["http", "stdio"],
      hotesAdmis: [hote],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: 30_000,
      octetsMaxDuCorps: 1_048_576,
      portHttp: port,
    });
    const sante = await socle.healthcheck?.();

    console.info(
      `[② · coffre verrouillé] sert : ${String(socle.demarrage.sert)} · ` +
        `healthcheck : ${String(sante?.statut ?? 0)} · ` +
        `vaultLocked : ${String(sante?.corps.vaultLocked ?? false)} · ` +
        `routes servies : [${(sante?.corps.routesServies ?? []).join(", ")}] · ` +
        `appels d'outils acceptés : ${String(sante?.corps.appelsDOutilsAcceptes ?? true)} · ` +
        `transports montés : ${String(service.transportsMontes.length)} · ` +
        `${String(service.empechements.length)} empêchement(s) : ` +
        `[${service.empechements.join(" | ")}]`,
    );

    // § 23 — le socle VIT, amputé.
    expect(socle.demarrage.sert).toBe(true);
    expect(sante?.statut).toBe(200);
    expect(sante?.corps.vaultLocked).toBe(true);
    expect(sante?.corps.routesServies).toContain("console");
    expect(sante?.corps.routesServies).not.toContain("outils");

    // Et le refus est PRONONCÉ : rien n'écoute, rien ne lit le fil.
    expect(service.sertLesOutils).toBe(false);
    expect(service.transportsMontes).toEqual([]);
    expect(service.serveurHttp).toBeNull();
    expect(service.attacheStdio).toBeNull();
    expect(service.empechements.length).toBe(1);
    expect(service.empechements[0]).toContain("§ 23");
    expect(await service.ecouter()).toBeNull();

    await socle.arreter();
  });

  it("SAIT DIRE NON — un transport HTTP sans vérificateur de jeton LÈVE au montage", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    const monter = (surcharge: Partial<PortsDuService>): (() => void) => {
      return () => {
        monterLeService(
          socle,
          { ...ports, ...surcharge },
          {
            transports: ["http", "stdio"],
            hotesAdmis: [hote],
            audienceAttendue: AUDIENCE_DE_TEMOIN,
            budgetMs: 30_000,
            octetsMaxDuCorps: 1_048_576,
            portHttp: port,
          },
        );
      };
    };

    const mutilations: ReadonlyArray<readonly [string, Partial<PortsDuService>]> = [
      ["étape 2 sans exécutant", { verificateurDeJeton: null }],
      ["étape 4 sans exécutant", { registreDesJetons: null }],
      ["les deux", { verificateurDeJeton: null, registreDesJetons: null }],
      ["stdio sans flux d'entrée", { fluxDEntree: null }],
      ["stdio sans flux de sortie", { fluxDeSortie: null }],
    ];

    let levees = 0;
    const manquees: string[] = [];
    for (const [nom, surcharge] of mutilations) {
      try {
        monter(surcharge)();
        manquees.push(nom);
      } catch (erreur) {
        if (erreur instanceof ErreurDeMontageDuService) levees += 1;
        else manquees.push(`${nom} (levée d'un autre genre)`);
      }
    }

    // TÉMOIN INVERSE, OBLIGATOIRE : sans lui, un montage qui lèverait TOUJOURS
    // satisferait la garde. Les ports complets doivent passer.
    let complet = 0;
    monter({});
    complet += 1;

    console.info(
      `[② · montage mutilé] ${String(mutilations.length)} mutilation(s) fabriquée(s) · ` +
        `${String(levees)} refusée(s) au montage · ` +
        `${String(manquees.length)} manquée(s) [${manquees.join(", ") || "aucune"}] · ` +
        `témoin inverse : ${String(complet)} montage(s) complet(s) accepté(s)`,
    );

    expect(levees).toBe(mutilations.length);
    expect(manquees).toEqual([]);
    expect(complet).toBe(1);

    await socle.arreter();
  });

  it("SAIT DIRE NON — sans noyau, aucun transport n'est monté, et le motif est écrit", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    const service = monterLeService(
      socle,
      { ...ports, noyau: null },
      {
        transports: ["http", "stdio"],
        hotesAdmis: [hote],
        audienceAttendue: AUDIENCE_DE_TEMOIN,
        budgetMs: 30_000,
        octetsMaxDuCorps: 1_048_576,
        portHttp: port,
      },
    );

    console.info(
      `[② · chaîne non composée] transports montés : ` +
        `${String(service.transportsMontes.length)} · ` +
        `${String(service.empechements.length)} empêchement(s) : ` +
        `[${service.empechements.join(" | ")}]`,
    );

    expect(service.transportsMontes).toEqual([]);
    expect(service.empechements.length).toBe(1);
    expect(service.empechements[0]).toContain("quatorze étapes");
    // ⚠️ **ET AUCUNE COLONNE N'A ÉTÉ FRAPPÉE.** Sans ce compte, un montage qui
    //    appellerait la fabrique PUIS renoncerait laisserait la même trace : zéro
    //    transport monté. Ce n'est pas la même chose — la fabrique lit une clé de
    //    coffre —, et c'est le seul endroit d'où on peut le voir.
    expect(service.colonnesFrappees).toBe(0);

    await socle.arreter();
  });

  it("UN NOYAU PAR COLONNE — la fabrique est appelée autant de fois qu'il y a de transports montés", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    // ⚠️ **LA FABRIQUE EST OBSERVÉE, PAS SUPPOSÉE.** On enveloppe celle du décor
    //    pour relever LES COLONNES DEMANDÉES, dans l'ordre. Un montage qui
    //    frapperait un seul noyau et le remettrait aux deux transports rendrait
    //    ici une seule colonne — c'est le défaut exact que l'ADR 0039 ferme, et
    //    `verifierCouvertureDesEtapes` ne le verrait PAS : elle boucle sur les
    //    NOMS de transports, jamais sur les noyaux montés.
    const colonnesDemandees: string[] = [];
    const fabriqueObservee: NonNullable<PortsDuService["noyau"]> = (transport) => {
      colonnesDemandees.push(transport);
      return ports.noyau!(transport);
    };

    const service = monterLeService(
      socle,
      { ...ports, noyau: fabriqueObservee },
      {
        transports: ["http", "stdio"],
        hotesAdmis: [hote],
        audienceAttendue: AUDIENCE_DE_TEMOIN,
        budgetMs: 30_000,
        octetsMaxDuCorps: 1_048_576,
        portHttp: port,
      },
    );

    console.info(
      `[② · un noyau par colonne] transports montés : ` +
        `[${service.transportsMontes.join(", ")}] · colonnes demandées à la fabrique : ` +
        `[${colonnesDemandees.join(", ")}] · colonnes frappées : ` +
        `${String(service.colonnesFrappees)}`,
    );

    expect(service.transportsMontes).toEqual(["http", "stdio"]);
    expect(colonnesDemandees).toEqual(["http", "stdio"]);
    expect(service.colonnesFrappees).toBe(service.transportsMontes.length);

    // ⚠️ AUCUN `service.arreter()` ICI, ET C'EST DÉLIBÉRÉ : rien n'a ÉCOUTÉ. Ce
    //    témoin mesure le MONTAGE, pas l'écoute ; fermer un serveur qui n'a
    //    jamais ouvert de socket lève « Server is not running », et ferait
    //    rougir la garde pour une raison qui n'a rien à voir avec la règle.
    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ ADR 0037 — LES DEUX PORTS D'AMONT, DEPUIS UN SERVICE RÉELLEMENT MONTÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ POURQUOI CES DEUX GARDES PARTENT DE `monterLeService`, ET DE NULLE PART
 *     AILLEURS ═══
 *
 * `core/transport/http/amont.spec.ts` éprouve déjà le journal d'amont, et
 * `reponse.spec.ts` la valeur du `Retry-After` : les deux mécanismes MARCHAIENT.
 * Ce qui manquait n'était pas le mécanisme, c'était **la fente** — l'ADR 0037,
 * marquée « Statut : acceptée », posait deux ports que `PortsDuService`
 * n'offrait pas, si bien que la SEULE composition de production ne pouvait pas
 * les armer, même en le voulant.
 *
 * Une garde qui appellerait `creerTransportHttp` en lui passant les deux ports
 * à la main re-vérifierait donc ce qui marchait déjà, **et laisserait passer
 * exactement ce défaut-ci** : c'est ainsi qu'il a survécu à un lot entier, sous
 * une entrée de registre `cousue` verte à bon droit — `PortsDuService` A des
 * appelants de production, et la décision n'avait pas atterri.
 *
 * Ces gardes partent donc du MONTAGE, et la première va jusqu'à la socket.
 *
 * ⚠️ **L'ÉCOUTE RESTE BORNÉE À `127.0.0.1`, ET AUCUN APPEL NE SORT** — même
 *    règle qu'au § 32 ① ci-dessus.
 */

/** Le délai que le lecteur ARMÉ rend. Entier, jamais zéro (RFC 9110, § 10.2.3). */
const SECONDES_DE_REPRISE = 37;

/** Ce qu'un journal d'amont ARMÉ retient, et COMBIEN de lignes il dit avoir écrites. */
function journalQuiEcrit(lignesParRefus: number): {
  readonly port: JournalDesRefusEnAmont;
  readonly lignes: RefusEnAmont[];
} {
  const lignes: RefusEnAmont[] = [];
  return {
    port: {
      consigner(refus: RefusEnAmont): Promise<number> {
        lignes.push(refus);
        return Promise.resolve(lignesParRefus);
      },
    },
    lignes,
  };
}

/**
 * UNE REQUÊTE QUI SE FERA REFUSER À L'ÉTAPE 2 — aucune autorisation présentée.
 *
 * ⚠️ L'étape 1 passe (l'hôte est celui de la liste blanche), l'étape 2 refuse :
 *    c'est le refus d'amont le plus simple à obtenir sans toucher au `Host`,
 *    en-tête que la couche `fetch` ne laisse pas toujours choisir.
 */
function requeteSansJeton(hote: string): RequeteHttp {
  return {
    methode: METHODE_MCP,
    chemin: CHEMIN_MCP,
    entetes: { host: hote },
    lireLeCorps: () => Promise.resolve("{}"),
  };
}

/** Les réglages d'un service HTTP seul, sur un port déjà obtenu. */
function reglagesHttpSeul(hote: string, port: number): ReglagesDuService {
  return {
    transports: ["http"],
    hotesAdmis: [hote],
    audienceAttendue: AUDIENCE_DE_TEMOIN,
    budgetMs: 30_000,
    octetsMaxDuCorps: 1_048_576,
    portHttp: port,
    adresseHttp: "127.0.0.1",
  };
}

describe("§ 11 · ③ les deux ports de l'ADR 0037, armés DEPUIS LE MONTAGE", () => {
  it("un refus d'amont servi par un service RÉELLEMENT MONTÉ écrit une ligne, et refusConsignes l'ADDITIONNE", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports } = portsAvecNoyauReel(entree, sortie, []);

    // ── ① LE PORT ARMÉ, ET LE FIL RÉEL ──────────────────────────────────────
    const journal = journalQuiEcrit(1);
    const portsArmes: PortsDuService = { ...ports, journalDesRefus: journal.port };
    const service = monterLeService(socle, portsArmes, reglagesHttpSeul(hote, port));
    await service.ecouter();

    const reponse = await fetch(`http://${hote}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "garde-amont", method: "tools/list" }),
    });
    await reponse.text();
    const lignesApresLeFil = journal.lignes.length;

    // ── ② LE MÊME TRANSPORT MONTÉ, POUR LIRE LA TRACE ───────────────────────
    // La socket ne rend pas `TraceAmont` : `serveur.ts` écrit la réponse et jette
    // la trace (écart de l'ADR 0037, § 5, hors de ce lot). Le compte se lit donc
    // sur l'OBJET SORTI DU MONTAGE — c'est le même transport, la même couture.
    const arme = await service.transportHttp?.traiter(requeteSansJeton(hote));

    // ── ③ LE MÊME MONTAGE, PORT NON ARMÉ — LE TÉMOIN INVERSE ────────────────
    const nonArme = await monterLeService(
      socle,
      { ...ports, journalDesRefus: null },
      reglagesHttpSeul(hote, port),
    ).transportHttp?.traiter(requeteSansJeton(hote));

    // ── ④ UN PORT QUI ÉCRIT DEUX LIGNES — « ADDITIONNE », pas « incrémente » ─
    const journalDouble = journalQuiEcrit(2);
    const double = await monterLeService(
      socle,
      { ...ports, journalDesRefus: journalDouble.port },
      reglagesHttpSeul(hote, port),
    ).transportHttp?.traiter(requeteSansJeton(hote));

    console.info(
      `[③ · journalDesRefus] statut sur le fil : ${String(reponse.status)} · ` +
        `${String(lignesApresLeFil)} ligne(s) écrite(s) par le fil · ` +
        `${String(journal.lignes.length)} au total, étape(s) ` +
        `[${journal.lignes.map((ligne) => String(ligne.etape)).join(", ")}], motif(s) ` +
        `[${journal.lignes.map((ligne) => ligne.motif).join(", ")}] · ` +
        `ARMÉ : ${String(arme?.trace.amont?.refusPrononces ?? -1)} prononcé(s) · ` +
        `${String(arme?.trace.amont?.refusConsignes ?? -1)} consigné(s) · ` +
        `NON ARMÉ : ${String(nonArme?.trace.amont?.refusPrononces ?? -1)} prononcé(s) · ` +
        `${String(nonArme?.trace.amont?.refusConsignes ?? -1)} consigné(s) · ` +
        `PORT À 2 LIGNES : ${String(double?.trace.amont?.refusConsignes ?? -1)} consigné(s)`,
    );

    // Le fil a bien porté un refus d'amont, et le port l'a VU.
    expect(reponse.status).toBe(401);
    expect(lignesApresLeFil).toBe(1);
    expect(journal.lignes[0]?.etape).toBe(2);
    expect(journal.lignes[0]?.motif).toBe("jeton absent");

    // Le compte du transport monté ADDITIONNE ce que le port a écrit.
    expect(arme?.trace.amont?.refusPrononces).toBe(1);
    expect(arme?.trace.amont?.refusConsignes).toBe(1);
    expect(journal.lignes.length).toBe(2);

    // TÉMOIN INVERSE, OBLIGATOIRE : sans lui, un montage qui compterait « 1 »
    // quoi qu'il arrive satisferait la garde ci-dessus. Le socle NON ARMÉ doit
    // annoncer « 1 prononcé · 0 consigné », mot pour mot ce que la prose de
    // `JOURNAL_AMONT_NON_ARME` promet.
    expect(nonArme?.trace.amont?.refusPrononces).toBe(1);
    expect(nonArme?.trace.amont?.refusConsignes).toBe(0);

    // Et « ADDITIONNE » se distingue d'« incrémente » : deux lignes écrites,
    // deux lignes comptées. C'est la mutation `refusConsignes += 1` qui meurt ici.
    expect(double?.trace.amont?.refusConsignes).toBe(2);
    expect(journalDouble.lignes.length).toBe(1);

    // Le montage NOMME ce qu'il n'a pas armé — un zéro qui se lit.
    console.info(
      `[③ · journalDesRefus] ports d'amont NON ARMÉS au montage : ` +
        `[${service.portsDAmontNonArmes.join(", ") || "aucun"}]`,
    );
    expect(service.portsDAmontNonArmes).toEqual(["delaiDeReprise"]);

    await service.arreter();
    await socle.arreter();
  });

  it("un 429 servi par un service RÉELLEMENT MONTÉ porte Retry-After, et le non-armé ne le porte pas", async () => {
    const port = await portLibre();
    const hote = `127.0.0.1:${String(port)}`;
    const socle = await socleQuiSert("ouvert", [hote]);
    const entree = new FluxDEntreeFabrique();
    const sortie = new FluxDeSortieFabrique();
    const { ports, harnais } = portsAvecNoyauReel(entree, sortie, []);
    // Le levier de l'étape 12 : le dépôt de quota du harnais refuse tout.
    harnais.quota.refuseTout = true;

    const etapesLues: number[] = [];
    const delaiDeReprise: LectureDuDelaiDeReprise = (etape) => {
      etapesLues.push(etape);
      return SECONDES_DE_REPRISE;
    };
    const portsArmes: PortsDuService = { ...ports, delaiDeReprise };
    const service = monterLeService(socle, portsArmes, reglagesHttpSeul(hote, port));
    await service.ecouter();

    const appel = JSON.stringify({
      jsonrpc: "2.0",
      id: "garde-429",
      method: "tools/call",
      params: { name: OUTIL_BONJOUR.name, arguments: { ton: "neutre" } },
    });
    const reponse = await fetch(`http://${hote}/api/mcp`, {
      method: "POST",
      headers: {
        host: hote,
        "content-type": "application/json",
        authorization: `Bearer ${PORTEUR_DE_TEMOIN}`,
      },
      body: appel,
    });
    await reponse.text();

    // TÉMOIN INVERSE : le MÊME montage, la MÊME requête, le port NON DÉCLARÉ.
    const nu = portsAvecNoyauReel(entree, sortie, []);
    nu.harnais.quota.refuseTout = true;
    const nonArme = await monterLeService(
      socle,
      { ...nu.ports, delaiDeReprise: null },
      reglagesHttpSeul(hote, port),
    ).transportHttp?.traiter({
      methode: METHODE_MCP,
      chemin: CHEMIN_MCP,
      entetes: { host: hote, authorization: `Bearer ${PORTEUR_DE_TEMOIN}` },
      lireLeCorps: () => Promise.resolve(appel),
    });

    console.info(
      `[③ · delaiDeReprise] statut sur le fil : ${String(reponse.status)} · ` +
        `Retry-After servi : « ${reponse.headers.get("retry-after") ?? "AUCUN"} » · ` +
        `${String(etapesLues.length)} lecture(s) du port, étape(s) ` +
        `[${etapesLues.map((etape) => String(etape)).join(", ") || "aucune"}] · ` +
        `TÉMOIN NON ARMÉ : statut ${String(nonArme?.reponse.statut ?? -1)} · ` +
        `Retry-After « ${nonArme?.reponse.entetes["retry-after"] ?? "AUCUN"} » · ` +
        `écart compté : ${String(nonArme?.trace.retryAfterAbsentSur429 ?? false)}`,
    );

    // § 15 — le refus DIT quand réessayer, et il le dit depuis le port armé au
    // MONTAGE, jamais depuis une relecture du message français du refus.
    expect(reponse.status).toBe(429);
    expect(reponse.headers.get("retry-after")).toBe(String(SECONDES_DE_REPRISE));
    // Le port a été lu UNE fois, et sur l'étape du § 11 qui porte le 429.
    expect(etapesLues).toEqual([12]);

    // TÉMOIN INVERSE : sans lui, un transport qui poserait l'en-tête en dur
    // satisferait la garde ci-dessus. Non déclaré, l'en-tête est ABSENT, et
    // l'écart se COMPTE plutôt que de se taire.
    expect(nonArme?.reponse.statut).toBe(429);
    expect(nonArme?.reponse.entetes["retry-after"]).toBeUndefined();
    expect(nonArme?.trace.retryAfterAbsentSur429).toBe(true);

    // Le montage NOMME ce qu'il n'a pas armé.
    console.info(
      `[③ · delaiDeReprise] ports d'amont NON ARMÉS au montage : ` +
        `[${service.portsDAmontNonArmes.join(", ") || "aucun"}]`,
    );
    expect(service.portsDAmontNonArmes).toEqual(["journalDesRefus"]);

    await service.arreter();
    await socle.arreter();
  });
});
