import { describe, expect, it } from "vitest";

import {
  TOUS_LES_OUTILS,
  VARIABLES_DU_SERVICE,
  catalogueDesAdaptateursAdmis,
  descripteursServis,
  lireLeProfilRegle,
  outilsAActiver,
  profilServi,
  variableDuSecretDAdaptateur,
} from "./index.js";
import { PROFILE_NAMES } from "../core/profiles/index.js";
import type { OutilDuCatalogue } from "../core/chaine/index.js";
import type { IdentiteAppelante } from "../core/chaine/orchestrateur.js";

/**
 * `ops/racine-branchee.spec.ts` — **CE QUE LA RACINE DÉCIDE ENTRE L'INVENTAIRE
 * ET LE FIL.**
 *
 * Le lot 5 branche `inventaire`, `federe` et le catalogue servi. Trois de ces
 * décisions ne se mesurent PAS en démarrant le processus, parce qu'un démarrage
 * complet exige un coffre, sept étages et un transport : ce fichier les éprouve
 * en fonctions pures, sur des inventaires fabriqués.
 *
 * ⚠️ **CE QUI EST MESURÉ AILLEURS EST DIT ICI**, pour qu'on ne le cherche pas
 *    deux fois : le démarrage entier vit dans `ops/main.spec.ts` et
 *    `ops/racine-en-service.temoin.spec.ts` ; la chaîne complète du manifeste
 *    épinglé au nom sur le fil vit dans `adapters/axionia/verrou.spec.ts`.
 */

function outil(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return {
    name: "axionia.inbox.recent",
    version: "1.0.0",
    description: "Les messages récents.",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object" },
    profiles: ["admin"],
    enabled: true,
    retireDeLaListe: false,
    adapterId: "axionia",
    adapterVersion: "1.0.0",
    effect: "read",
    dataClass: "personal",
    pagination: "page",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 20_480,
    idFields: ["id"],
    idempotency: "n/a",
    limit: null,
    warnAt: null,
    governanceFields: [],
    ...surcharge,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le profil : une seule règle, deux lecteurs
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0053 — le profil servi est réglé, sinon le MOINS EXPOSANT", () => {
  it("prend le réglage quand il existe, et le repli sinon", () => {
    const inventaire = [outil()];
    const regle = profilServi("admin", inventaire);
    const repli = profilServi(null, inventaire);

    console.info(`[profil] réglé → « ${regle} » · sans réglage → « ${repli} »`);
    expect(regle).toBe("admin");
    // ⚠️ LE REPLI EST FAIL-CLOSED : sur un inventaire tout `admin`, le profil le
    //    moins exposant en sert ZÉRO. C'est le comportement voulu.
    expect(repli).not.toBe("admin");
  });

  it("REFUSE une valeur hors de l'énumération, au lieu de retomber en silence", () => {
    const bon = lireLeProfilRegle("admin");
    const vide = lireLeProfilRegle("   ");
    const faute = lireLeProfilRegle("admln");

    console.info(
      `[profil · réglage] « admin » → ${String(bon.profil)} · vide → ${String(vide.profil)} · ` +
        `« admln » → refus : ${faute.refus === null ? "AUCUN" : "oui"}`,
    );

    expect(bon.profil).toBe("admin");
    expect(bon.refus).toBeNull();
    // Une variable absente ou vide n'est PAS une faute : elle dit « repli ».
    expect(vide.profil).toBeNull();
    expect(vide.refus).toBeNull();
    // ⚠️ Une faute de frappe qui retomberait sur le repli fabriquerait un socle
    //    qui ne sert rien sans que personne ne sache pourquoi.
    expect(faute.profil).toBeNull();
    expect(faute.refus).toContain("admln");
    expect(faute.refus).toContain(PROFILE_NAMES[0] ?? "");
  });

  it("🔑 `tools/list` et l'étape 7 lisent la MÊME règle — sinon le catalogue ment", () => {
    const inventaire = [outil()];
    // Ce que `tools/list` annoncerait…
    const annonce = descripteursServis(inventaire, "admin");
    // …et le profil que l'orchestrateur recevrait par `profilActif`.
    const accepte = profilServi("admin", inventaire);

    console.info(
      `[profil · cohérence] annoncé sous « ${annonce.profil} » : ` +
        `${String(annonce.descripteurs.length)} outil(s) · profil remis à l'étape 7 : ` +
        `« ${accepte} »`,
    );
    expect(annonce.profil).toBe(accepte);
    expect(annonce.descripteurs.map((d) => d.name)).toEqual(["axionia.inbox.recent"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  La projection du fil : les valeurs de gouvernance NE TRAVERSENT PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("la projection servie ne porte que trois champs", () => {
  it("ne laisse passer ni `effect`, ni `dataClass`, ni les profils", () => {
    const { descripteurs } = descripteursServis([outil()], "admin");
    const cles = Object.keys(descripteurs[0] ?? {}).sort();

    console.info(`[fil] champs servis : ${cles.join(", ")}`);
    expect(cles).toEqual(["description", "inputSchema", "name"]);
  });

  it("écarte un outil désactivé et un outil retiré de la liste", () => {
    const inventaire = [
      outil(),
      outil({ name: "axionia.agenda.jour", enabled: false }),
      outil({ name: "axionia.rendezvous.list", retireDeLaListe: true }),
    ];
    const { descripteurs } = descripteursServis(inventaire, "admin");

    console.info(
      `[fil] ${String(descripteurs.length)} servi(s) sur ${String(inventaire.length)} · ` +
        descripteurs.map((d) => d.name).join(", "),
    );
    expect(descripteurs.map((d) => d.name)).toEqual(["axionia.inbox.recent"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Le catalogue VIVANT — § 11, relu à chaque `tools/list`
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — le catalogue servi est RELU à chaque appel", () => {
  it("🔑 sert la NOUVELLE valeur après une désactivation, sans redémarrage", async () => {
    let actif = true;
    // ⚠️ ON NE DÉSTRUCTURE PAS `lectures` : c'est une MÉTHODE, et la séparer de
    //    son objet est ce que la règle `unbound-method` interdit à juste titre.
    const servi = catalogueDesAdaptateursAdmis(() =>
      Promise.resolve(descripteursServis(actif ? [outil()] : [], "admin").descripteurs),
    );

    const avant = await servi.catalogue.listerPourCetAppel({} as IdentiteAppelante);
    actif = false; // la console désactive — SANS redéploiement (§ 14, correction 3)
    const apres = await servi.catalogue.listerPourCetAppel({} as IdentiteAppelante);

    console.info(
      `[catalogue vivant] ${String(servi.lectures())} lecture(s) · avant : ` +
        `${String(avant.length)} outil(s) · après désactivation : ${String(apres.length)}`,
    );

    expect(servi.lectures()).toBe(2);
    expect(avant).toHaveLength(1);
    // ⚠️ UNE LISTE FIGÉE AURAIT RENDU 1 ICI, et la désactivation d'urgence
    //    n'aurait rien désactivé jusqu'au redémarrage suivant.
    expect(apres).toHaveLength(0);
  });

  it("accepte encore la forme FIGÉE, pour les montages qui n'ont rien à relire", async () => {
    const fige = catalogueDesAdaptateursAdmis([]);
    expect(await fige.catalogue.listerPourCetAppel({} as IdentiteAppelante)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'activation — le remplaçant provisoire de la console
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0053 — `OPS_ENABLED_TOOLS`, en attendant la console", () => {
  it("n'active RIEN quand la variable est absente ou vide", () => {
    const inventaire = [outil(), outil({ name: "axionia.agenda.jour" })];
    console.info(
      `[activation] absente → ${String(outilsAActiver(undefined, inventaire).length)} · ` +
        `vide → ${String(outilsAActiver("  ", inventaire).length)}`,
    );
    expect(outilsAActiver(undefined, inventaire)).toEqual([]);
    expect(outilsAActiver("", inventaire)).toEqual([]);
  });

  it(`« ${TOUS_LES_OUTILS} » les prend tous, une liste les prend par NOM COMPLET`, () => {
    const inventaire = [outil(), outil({ name: "axionia.agenda.jour" })];
    const tous = outilsAActiver(TOUS_LES_OUTILS, inventaire);
    const nommes = outilsAActiver(" axionia.agenda.jour , inconnu.absent ", inventaire);

    console.info(
      `[activation] « ${TOUS_LES_OUTILS} » → ${String(tous.length)} · ` +
        `liste nommée → ${String(nommes.length)} [${nommes.map((o) => o.name).join(", ")}]`,
    );

    expect(tous).toHaveLength(2);
    // ⚠️ UN NOM QUI NE DÉSIGNE RIEN N'ACTIVE RIEN, et le COMPTE le dit : c'est
    //    ce qui distingue « personne n'a demandé » de « la demande n'a désigné
    //    aucun outil », deux pannes qui se réparent différemment.
    expect(nommes.map((o) => o.name)).toEqual(["axionia.agenda.jour"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  La variable du secret partagé — DÉRIVÉE de la référence
// ═════════════════════════════════════════════════════════════════════════════

describe("le nom de la variable d'un secret partagé est DÉRIVÉ, jamais saisi", () => {
  it("transforme `axionia.mcp.shared` en `OPS_ADAPTER_SECRET_AXIONIA_MCP_SHARED`", () => {
    const derive = variableDuSecretDAdaptateur("axionia.mcp.shared");
    const autre = variableDuSecretDAdaptateur("zoho-mail.oauth");

    console.info(`[secret partagé] axionia.mcp.shared → ${derive} · zoho-mail.oauth → ${autre}`);
    expect(derive).toBe("OPS_ADAPTER_SECRET_AXIONIA_MCP_SHARED");
    expect(autre).toBe("OPS_ADAPTER_SECRET_ZOHO_MAIL_OAUTH");
    // Une table `secretRef → variable` écrite à la main diverge au premier
    // adaptateur ajouté, et la divergence se découvre en 401.
    expect(derive).not.toBe(autre);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Les variables déclarées existent dans le MODÈLE de configuration
// ═════════════════════════════════════════════════════════════════════════════

describe("les deux réglages neufs sont dans `.env.example`", () => {
  it("confronte `VARIABLES_DU_SERVICE` au modèle, et annonce son dénominateur", async () => {
    const { readFileSync } = await import("node:fs");
    const modele = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const noms = Object.values(VARIABLES_DU_SERVICE);
    const absentes = noms.filter((nom) => !modele.includes(nom));

    console.info(
      `[.env.example] ${String(noms.length)} variable(s) de service déclarée(s) · ` +
        `${String(absentes.length)} absente(s) du modèle [${absentes.join(", ") || "aucune"}]`,
    );

    expect(noms.length).toBeGreaterThan(0);
    expect(absentes).toEqual([]);
  });
});
