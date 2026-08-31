import { describe, expect, it } from "vitest";

import { APPEL_STEPS, ERROR_CODES } from "../types.js";
import { ETAPE_CATALOGUE } from "./etapes.js";
import type {
  CatalogueEtabli,
  CatalogueOutils,
  ContexteCatalogue,
  OutilDuCatalogue,
  VerdictEtape,
} from "./etapes.js";
import {
  CAUSES_INCIDENT,
  CHAMPS_EPINGLES,
  confronterEpinglage,
  creerEtapeCatalogue,
} from "./etape-06-outil.js";
import type {
  AlerteEpinglage,
  CanalDAlerte,
  ChampEpingle,
  DeclarationOutilRecue,
  DeclarationsRecues,
  DemandeDesactivation,
  IncidentEpinglage,
  InterrupteurOutil,
} from "./etape-06-outil.js";

/**
 * Gardes de l'ÉTAPE 6 — l'outil existe-t-il, et est-il activé ? (§ 11, § 14
 * correction 3, § 20 règle d'épinglage, § 21 portée des interrupteurs).
 *
 * Chaque garde (a) rougit d'abord sur un TÉMOIN FABRIQUÉ, avec un témoin
 * NÉGATIF qui prouve d'où vient le rouge, et (b) ANNONCE combien d'éléments
 * elle a mesurés, sous un plancher-témoin.
 *
 * ⚠️ LE PIÈGE QUE CES GARDES VISENT, ET QU'IL FAUT NOMMER. Le § 20 dit d'un
 *    `effect` basculé de `send` à `read` : « sans cette règle IL N'APPARAÎT
 *    NULLE PART ». Une garde de l'étape 6 qui se contenterait de vérifier
 *    « désactivé ⇒ refus » serait verte, exacte, et ne dirait rien de cette
 *    règle-là. C'est pourquoi la garde centrale ci-dessous fabrique la
 *    divergence CHAMP PAR CHAMP, sur une liste DÉRIVÉE de `CHAMPS_EPINGLES`.
 */

const MAINTENANT = new Date("2026-08-31T09:14:00.000Z");

// ─────────────────────────────────────────────────────────────────────────────
//  Les doubles en mémoire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un catalogue en mémoire. Il COMPTE ses lectures : c'est la seule façon de
 * prouver que l'étape relit à chaque appel plutôt que de mémoïser (§ 14,
 * correction 3 — « la valeur mesurée en CI n'est jamais celle qui est servie »).
 */
class CatalogueEnMemoire implements CatalogueOutils {
  readonly outils = new Map<string, OutilDuCatalogue>();
  readonly lectures: string[] = [];

  poser(outil: OutilDuCatalogue): this {
    this.outils.set(outil.name, outil);
    return this;
  }

  relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
    this.lectures.push(nomComplet);
    return Promise.resolve(this.outils.get(nomComplet) ?? null);
  }
}

class DeclarationsEnMemoire implements DeclarationsRecues {
  readonly declarations = new Map<string, DeclarationOutilRecue>();
  readonly lectures: string[] = [];

  poser(nomComplet: string, declaration: DeclarationOutilRecue): this {
    this.declarations.set(nomComplet, declaration);
    return this;
  }

  relire(nomComplet: string): Promise<DeclarationOutilRecue | null> {
    this.lectures.push(nomComplet);
    return Promise.resolve(this.declarations.get(nomComplet) ?? null);
  }
}

class InterrupteurEnMemoire implements InterrupteurOutil {
  readonly demandes: DemandeDesactivation[] = [];
  /** Le port rend `false` : l'écriture n'a pas eu lieu, sans exception. */
  refusePoliment = false;
  /** Le port LÈVE : la base est injoignable. */
  casse = false;

  desactiver(demande: DemandeDesactivation): Promise<boolean> {
    this.demandes.push(demande);
    if (this.casse) return Promise.reject(new Error("`ops_tool` injoignable (témoin)"));
    return Promise.resolve(!this.refusePoliment);
  }
}

class CanalEnMemoire implements CanalDAlerte {
  readonly alertes: AlerteEpinglage[] = [];
  refusePoliment = false;
  casse = false;

  alerter(alerte: AlerteEpinglage): Promise<boolean> {
    this.alertes.push(alerte);
    if (this.casse) return Promise.reject(new Error("canal d'alerte injoignable (témoin)"));
    return Promise.resolve(!this.refusePoliment);
  }
}

/** Le banc complet, avec le recueil des incidents de dernier recours. */
function banc(): {
  readonly catalogue: CatalogueEnMemoire;
  readonly declarations: DeclarationsEnMemoire;
  readonly interrupteur: InterrupteurEnMemoire;
  readonly canal: CanalEnMemoire;
  readonly incidents: IncidentEpinglage[];
  /** Fait lever le secours lui-même — le dernier recours du dernier recours. */
  readonly reglages: { secoursCasse: boolean };
  appeler(nomComplet: string): Promise<VerdictEtape<CatalogueEtabli>>;
} {
  const catalogue = new CatalogueEnMemoire();
  const declarations = new DeclarationsEnMemoire();
  const interrupteur = new InterrupteurEnMemoire();
  const canal = new CanalEnMemoire();
  const incidents: IncidentEpinglage[] = [];
  const reglages = { secoursCasse: false };

  const etape = creerEtapeCatalogue({
    declarations,
    interrupteur,
    alerte: canal,
    secours: (incident: IncidentEpinglage): void => {
      incidents.push(incident);
      if (reglages.secoursCasse) throw new Error("secours indisponible (témoin)");
    },
  });

  return {
    catalogue,
    declarations,
    interrupteur,
    canal,
    incidents,
    reglages,
    appeler(nomComplet: string): Promise<VerdictEtape<CatalogueEtabli>> {
      const contexte: ContexteCatalogue = { nomComplet, catalogue, maintenant: MAINTENANT };
      return etape(contexte);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Les fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** L'`effect` et le `dataClass` ÉPINGLÉS de l'outil de référence. */
const EPINGLE: DeclarationOutilRecue = { effect: "send", dataClass: "personal" };

/**
 * Une déclaration DIVERGENTE par champ épinglé.
 *
 * ⚠️ TYPE MAPPÉ, PAS OBJET LITTÉRAL. Le compilateur exige une entrée par champ
 *    de `ChampEpingle` : le jour où le § 20 en épingle un troisième, CE TEST NE
 *    COMPILE PLUS. Une liste écrite à la main aurait continué de mesurer deux
 *    champs, verte, en laissant le troisième sans confrontation.
 */
const DIVERGENTES: { readonly [K in ChampEpingle]: DeclarationOutilRecue } = {
  effect: { effect: "read", dataClass: "personal" },
  dataClass: { effect: "send", dataClass: "none" },
};

function outil(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return {
    name: "zoho-mail.inbox.recent",
    version: "1.0.0",
    description: "Les messages récents de la boîte de réception.",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: false },
    profiles: ["courrier"],
    enabled: true,
    retireDeLaListe: false,
    adapterId: "zoho-mail",
    adapterVersion: "1.4.2",
    effect: EPINGLE.effect,
    dataClass: EPINGLE.dataClass,
    pagination: "keyset",
    compaction: { free: ["preview"], tier2: ["headers"], aggregateBy: null },
    maxBytes: 32_768,
    idFields: ["messageId"],
    ...surcharge,
  };
}

/** L'étape 6 telle qu'`APPEL_STEPS` la définit — relue, jamais recopiée. */
const OFFICIELLE = APPEL_STEPS.find((etape) => etape.cle === "outil-active");

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le numéro et le code sont DÉRIVÉS du § 11
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 6 — son numéro et son code viennent d'`APPEL_STEPS`, jamais de la main", () => {
  it("rend un refus portant le numéro ET le code que le § 11 lui donne", async () => {
    const b = banc();
    const verdict = await b.appeler("zoho-mail.inconnu");

    expect(OFFICIELLE).toBeDefined();
    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");

    // Confrontation à la table du § 11, pas à une constante de ce fichier.
    expect(verdict.etape).toBe(OFFICIELLE?.numero);
    expect(verdict.code).toBe(OFFICIELLE?.refus);
    expect(verdict.code).toBe("tool_disabled");
    expect(ERROR_CODES).toContain(verdict.code);

    // Témoin : le numéro suit l'ancrage. S'il était écrit à la main, il ne
    // vaudrait pas forcément celui d'`ETAPE_CATALOGUE`.
    expect(verdict.etape).toBe(ETAPE_CATALOGUE.numero);

    console.info(
      `[garde ancrage étape 6] numéro ${String(verdict.etape)}, code « ${String(verdict.code)} », ` +
        `confrontés à ${String(APPEL_STEPS.length)} étapes du § 11`,
    );
    // Plancher-témoin : une table vidée rendrait cette garde vacueuse.
    expect(APPEL_STEPS.length).toBeGreaterThanOrEqual(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — trois causes de refus, trois messages qui ne se confondent pas
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 6 — inexistant, désactivé et divergent ne se disent pas de la même façon", () => {
  it("refuse un outil INCONNU, et ne l'envoie pas chercher un interrupteur", async () => {
    const b = banc();
    b.catalogue.poser(outil());
    b.declarations.poser("zoho-mail.inbox.recent", EPINGLE);

    const verdict = await b.appeler("zoho-mail.jamais-vu");

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
    expect(verdict.message).toMatch(/n'existe pas/);
    expect(verdict.message).toMatch(/zoho-mail\.jamais-vu/);
    // § 15 : « dit qu'il existe, et où l'activer ». Un outil inexistant ne
    // s'active nulle part — le message ne doit donc PAS renvoyer à l'écran.
    expect(verdict.message).not.toMatch(/écran Outils/);
    // Rien à désactiver, rien à alerter : il n'y a pas d'outil.
    expect(b.interrupteur.demandes).toHaveLength(0);
    expect(b.canal.alertes).toHaveLength(0);
  });

  it("refuse un outil DÉSACTIVÉ en disant où l'activer, et que le socle fait foi", async () => {
    const b = banc();
    b.catalogue.poser(outil({ enabled: false }));
    b.declarations.poser("zoho-mail.inbox.recent", EPINGLE);

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
    expect(verdict.message).toMatch(/EXISTE/);
    expect(verdict.message).toMatch(/écran Outils/);
    // § 21 — la portée des interrupteurs, dite dans le message.
    expect(verdict.message).toMatch(/fait foi/);
    // Aucune divergence : aucune alerte, aucune désactivation supplémentaire.
    expect(b.interrupteur.demandes).toHaveLength(0);
    expect(b.canal.alertes).toHaveLength(0);
  });

  it("laisse passer un outil sain, et RETIRÉ DE LA LISTE n'est pas DÉSACTIVÉ (§ 13.4)", async () => {
    const b = banc();
    b.catalogue.poser(outil({ retireDeLaListe: true }));
    b.declarations.poser("zoho-mail.inbox.recent", EPINGLE);

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    // Il ne s'affiche plus dans `tools/list` — il répond encore, six mois.
    // Confondre les deux couperait la compatibilité d'un coup, en silence.
    expect(verdict.issue).toBe("autorise");
    if (verdict.issue !== "autorise") throw new Error("verdict inattendu");
    expect(verdict.etabli.deprecie).toBe(true);
    expect(verdict.etabli.outil.name).toBe("zoho-mail.inbox.recent");
    // Témoin négatif : sans le retrait, `deprecie` est faux — la valeur suit
    // bien `retireDeLaListe` et n'est pas figée.
    const sain = banc();
    sain.catalogue.poser(outil());
    sain.declarations.poser("zoho-mail.inbox.recent", EPINGLE);
    const verdictSain = await sain.appeler("zoho-mail.inbox.recent");
    expect(verdictSain.issue).toBe("autorise");
    if (verdictSain.issue !== "autorise") throw new Error("verdict inattendu");
    expect(verdictSain.etabli.deprecie).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LA RÈGLE D'ÉPINGLAGE DU § 20, champ par champ
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 6 — § 20 : tout écart à l'épinglage DÉSACTIVE l'outil et ALERTE", () => {
  it("ne désactive ni n'alerte quand la déclaration reçue est CONFORME (témoin négatif)", async () => {
    const b = banc();
    b.catalogue.poser(outil());
    b.declarations.poser("zoho-mail.inbox.recent", EPINGLE);

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    // Le témoin négatif est ce qui donne son sens au rouge du test suivant :
    // sans lui, on ne saurait pas si la désactivation vient de la divergence ou
    // du simple fait d'appeler l'étape.
    expect(verdict.issue).toBe("autorise");
    expect(b.interrupteur.demandes).toHaveLength(0);
    expect(b.canal.alertes).toHaveLength(0);
    expect(b.incidents).toHaveLength(0);
  });

  it("désactive et alerte sur CHAQUE champ épinglé, et dit combien d'outils il a comparés", async () => {
    let outilsCompares = 0;
    let champsConfrontes = 0;
    const champsRougis: ChampEpingle[] = [];

    for (const champ of CHAMPS_EPINGLES) {
      const b = banc();
      b.catalogue.poser(outil());
      // La divergence porte sur UN SEUL champ à la fois : les voisins sont
      // neutralisés, sinon un test vert ne dirait pas lequel a mordu.
      b.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES[champ]);

      const verdict = await b.appeler("zoho-mail.inbox.recent");
      outilsCompares += 1;

      expect(verdict.issue, champ).toBe("refuse");
      if (verdict.issue !== "refuse") throw new Error("verdict inattendu");

      // 1 · L'OUTIL EST DÉSACTIVÉ — pas « mis à jour », pas « toléré ».
      expect(b.interrupteur.demandes, champ).toHaveLength(1);
      expect(b.interrupteur.demandes[0]?.nomComplet, champ).toBe("zoho-mail.inbox.recent");
      expect(b.interrupteur.demandes[0]?.motif, champ).toMatch(new RegExp(champ));
      expect(b.interrupteur.demandes[0]?.constateA, champ).toBe(MAINTENANT);

      // 2 · L'ALERTE PART, et elle porte le compte de champs confrontés.
      expect(b.canal.alertes, champ).toHaveLength(1);
      const alerte = b.canal.alertes[0];
      expect(alerte?.niveau, champ).toBe("critique");
      expect(alerte?.outilDesactive, champ).toBe(true);
      expect(alerte?.adapterId, champ).toBe("zoho-mail");
      expect(alerte?.adapterVersion, champ).toBe("1.4.2");
      expect(alerte?.champsCompares, champ).toBe(CHAMPS_EPINGLES.length);
      expect(
        alerte?.ecarts.map((e) => e.champ),
        champ,
      ).toEqual([champ]);
      champsConfrontes += alerte?.champsCompares ?? 0;
      champsRougis.push(champ);

      // 3 · Le message DIT la divergence et interdit le rebasculement seul.
      expect(verdict.message, champ).toMatch(new RegExp(champ));
      expect(verdict.message, champ).toMatch(/§ 20/);
      expect(verdict.message, champ).toMatch(/ne suffirait pas/);
      // Aucun incident : le canal a répondu.
      expect(b.incidents, champ).toHaveLength(0);
    }

    console.info(
      `[garde épinglage] ${String(outilsCompares)} outils comparés, ` +
        `${String(champsConfrontes)} confrontations de champ, ` +
        `champs rougis : ${champsRougis.join(", ")}`,
    );

    // Plancher-témoin : le § 20 épingle DEUX champs. Une boucle sur une liste
    // vide serait verte sans avoir rien éprouvé.
    expect(outilsCompares).toBe(CHAMPS_EPINGLES.length);
    expect(outilsCompares).toBeGreaterThanOrEqual(2);
    expect(champsRougis).toEqual([...CHAMPS_EPINGLES]);
  });

  it("ALERTE MÊME SI L'OUTIL EST DÉJÀ DÉSACTIVÉ — l'épinglage passe avant `enabled`", async () => {
    // C'est LE cas du § 20 : « un `effect` basculé de `send` à `read` n'est ni
    // un champ ajouté ni un champ disparu — sans cette règle il n'apparaît
    // NULLE PART ». Refuser d'abord sur `enabled` rendrait un `tool_disabled`
    // exact, et la divergence disparaîtrait.
    const b = banc();
    b.catalogue.poser(outil({ enabled: false }));
    b.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES.effect);

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
    expect(b.canal.alertes).toHaveLength(1);
    expect(b.canal.alertes[0]?.ecarts.map((e) => e.champ)).toEqual(["effect"]);
    // Le message est celui de la DIVERGENCE, pas celui du simple « désactivé ».
    expect(verdict.message).toMatch(/§ 20/);

    // Témoin négatif, même outil désactivé, déclaration conforme : aucune
    // alerte. Le rouge ci-dessus vient donc de l'écart, pas de `enabled`.
    const temoin = banc();
    temoin.catalogue.poser(outil({ enabled: false }));
    temoin.declarations.poser("zoho-mail.inbox.recent", EPINGLE);
    const verdictTemoin = await temoin.appeler("zoho-mail.inbox.recent");
    expect(verdictTemoin.issue).toBe("refuse");
    expect(temoin.canal.alertes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — quand les ports lâchent, le refus tient quand même
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 6 — une désactivation qui échoue ne rend pas l'appel légitime", () => {
  it("refuse quand même, et l'alerte DIT que l'outil est resté actif", async () => {
    let cas = 0;
    for (const casser of [false, true]) {
      const b = banc();
      b.catalogue.poser(outil());
      b.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES.effect);
      // Deux façons d'échouer, qui ne se ressemblent pas côté implémentation :
      // rendre `false`, et LEVER. Les deux doivent aboutir au même refus.
      b.interrupteur.refusePoliment = !casser;
      b.interrupteur.casse = casser;

      const verdict = await b.appeler("zoho-mail.inbox.recent");
      cas += 1;

      expect(verdict.issue, String(casser)).toBe("refuse");
      if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
      expect(verdict.code, String(casser)).toBe(ETAPE_CATALOGUE.code);
      // L'alerte porte l'échec : sinon l'exploitant croirait l'outil éteint.
      expect(b.canal.alertes[0]?.outilDesactive, String(casser)).toBe(false);
      expect(verdict.message, String(casser)).toMatch(/N'A PAS PU ÊTRE ÉCRITE/);
    }

    console.info(`[garde désactivation en panne] ${String(cas)} modes de panne mesurés`);
    expect(cas).toBe(2);
  });
});

describe("étape 6 — une alerte qui n'est pas partie ne disparaît pas en silence", () => {
  it("appelle le SECOURS, en distinguant un refus poli d'une levée", async () => {
    const causesVues: string[] = [];

    for (const casser of [false, true]) {
      const b = banc();
      b.catalogue.poser(outil());
      b.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES.dataClass);
      b.canal.refusePoliment = !casser;
      b.canal.casse = casser;

      const verdict = await b.appeler("zoho-mail.inbox.recent");

      expect(verdict.issue, String(casser)).toBe("refuse");
      expect(b.incidents, String(casser)).toHaveLength(1);
      const incident = b.incidents[0];
      expect(
        incident?.alerte.ecarts.map((e) => e.champ),
        String(casser),
      ).toEqual(["dataClass"]);
      expect(CAUSES_INCIDENT, String(casser)).toContain(incident?.cause);
      causesVues.push(incident?.cause ?? "aucune");
    }

    console.info(
      `[garde secours] ${String(causesVues.length)} pannes de canal mesurées : ` +
        causesVues.join(", "),
    );

    // Les deux pannes se distinguent : un canal qui refuse et un canal qui
    // lève ne se diagnostiquent pas pareil.
    expect(causesVues).toEqual(["canal-refuse", "canal-en-erreur"]);

    // Témoin négatif : canal sain ⇒ aucun incident. Le secours n'est pas
    // appelé à tout hasard.
    const sain = banc();
    sain.catalogue.poser(outil());
    sain.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES.dataClass);
    await sain.appeler("zoho-mail.inbox.recent");
    expect(sain.incidents).toHaveLength(0);
  });

  it("tient même si le SECOURS lui-même lève — le refus atteint le journal", async () => {
    // Le refus d'étape 6 doit parvenir à `avecJournal` avec son `stepDenied`.
    // Une exception ici l'écrirait en `decision: "interrompu"` et la métrique
    // du § 24 perdrait le refus.
    const b = banc();
    b.catalogue.poser(outil());
    b.declarations.poser("zoho-mail.inbox.recent", DIVERGENTES.effect);
    b.canal.casse = true;
    b.reglages.secoursCasse = true;

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
    expect(verdict.etape).toBe(ETAPE_CATALOGUE.numero);
    expect(b.incidents).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — la confrontation COMPTE, et sait qu'elle n'a rien comparé
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — « aucun écart » et « rien n'a été comparé » sont deux faits distincts", () => {
  it("compte les champs confrontés, et le compte suit `CHAMPS_EPINGLES`", () => {
    const conforme = confronterEpinglage(outil(), EPINGLE);
    const divergent = confronterEpinglage(outil(), DIVERGENTES.effect);
    const impossible = confronterEpinglage(outil(), null);

    console.info(
      `[garde comptage] ${String(CHAMPS_EPINGLES.length)} champs épinglés : ` +
        CHAMPS_EPINGLES.join(", ") +
        ` — conforme ${String(conforme.champsCompares)}, ` +
        `divergent ${String(divergent.champsCompares)}, ` +
        `sans déclaration ${String(impossible.champsCompares)}`,
    );

    // Plancher-témoin : le § 20 épingle DEUX champs. Une liste vidée ferait
    // rendre « aucun écart » à toutes les confrontations, sans une rougeur.
    expect(CHAMPS_EPINGLES.length).toBeGreaterThanOrEqual(2);
    expect(CHAMPS_EPINGLES).toEqual(["effect", "dataClass"]);

    expect(conforme.champsCompares).toBe(CHAMPS_EPINGLES.length);
    expect(conforme.ecarts).toEqual([]);
    expect(conforme.comparaisonImpossible).toBe(false);

    expect(divergent.ecarts).toHaveLength(1);
    expect(divergent.ecarts[0]?.epingle).toBe("send");
    expect(divergent.ecarts[0]?.recu).toBe("read");

    // ⚠️ LE CAS QUI COMPTE : zéro champ comparé, zéro écart. Sans
    //    `comparaisonImpossible` ni le compte, il serait indiscernable d'une
    //    confrontation saine — une garde verte parce qu'elle ne regarde rien.
    expect(impossible.champsCompares).toBe(0);
    expect(impossible.ecarts).toEqual([]);
    expect(impossible.comparaisonImpossible).toBe(true);
  });

  it("ne refuse PAS quand aucune déclaration n'a été reçue, et ne prétend pas avoir vu", async () => {
    // ⚠️ CE QUE CETTE GARDE NE PROUVE PAS, ET QUI EST LA BORNE DE L'ÉTAPE :
    //    sans déclaration reçue, la règle du § 20 est INERTE pour cet appel.
    //    L'étape ne fabrique pas de conformité — elle ne confronte rien, et
    //    `comparaisonImpossible` est ce qui permet de le compter ailleurs.
    const b = banc();
    b.catalogue.poser(outil());
    // Aucune déclaration posée : le port rendra `null`.

    const verdict = await b.appeler("zoho-mail.inbox.recent");

    expect(verdict.issue).toBe("autorise");
    expect(b.interrupteur.demandes).toHaveLength(0);
    expect(b.canal.alertes).toHaveLength(0);
    // Le port a bien été interrogé : l'inertie vient de la réponse, pas d'un
    // chemin qui sauterait la confrontation.
    expect(b.declarations.lectures).toEqual(["zoho-mail.inbox.recent"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — aucun cache : `ops_tool.enabled` bascule sans redéploiement
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 14, correction 3 — l'étape relit le catalogue À CHAQUE APPEL", () => {
  it("change de verdict quand `enabled` bascule entre deux appels", async () => {
    const b = banc();
    b.catalogue.poser(outil());
    b.declarations.poser("zoho-mail.inbox.recent", EPINGLE);

    const avant = await b.appeler("zoho-mail.inbox.recent");
    // La bascule de console, sans redéploiement.
    b.catalogue.poser(outil({ enabled: false }));
    const apres = await b.appeler("zoho-mail.inbox.recent");

    console.info(
      `[garde absence de cache] ${String(b.catalogue.lectures.length)} relectures mesurées`,
    );

    expect(avant.issue).toBe("autorise");
    expect(apres.issue).toBe("refuse");
    // Un cache de processus aurait servi l'ancienne valeur : une désactivation
    // d'urgence en console n'aurait rien désactivé.
    expect(b.catalogue.lectures).toEqual(["zoho-mail.inbox.recent", "zoho-mail.inbox.recent"]);
  });
});
