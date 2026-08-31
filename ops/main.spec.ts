import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  REGLAGES_DAUTHENTIFICATION,
  verifierLaConfigurationDAuthentification,
} from "../core/auth/configuration.js";
import { VARIABLE_DE_L_AUDIENCE } from "../core/auth/ressource.js";
import type { EtatIndexProvenance } from "../core/chaine/etape-11-provenance.js";
import { MagasinDeVerrousEnMemoire, frapperInstance } from "../core/instance/index.js";
import { HOTE_SANS_MAGASIN_PARTAGE } from "../core/instance/postgres.js";
import type { LignePolitique } from "../core/policy/index.js";
import { DepotPolitiqueMemoire, plancherDuScope } from "../core/policy/index.js";
import { VERSION_VERROU } from "../core/registry/index.js";
import type { EtatCoffre } from "../core/vault/index.js";
import { COMMANDE_DE_PROVISION } from "../core/vault/index.js";
import { ETAGES_DU_DEMARRAGE } from "./demarrage/etages.js";
import type { DependancesDuSocle, Planificateur, SocleDemarre } from "./main.js";
import { SONDES_NON_POURVUES, demarrerLeSocle, reglagesDepuisLEnvironnement } from "./main.js";

/**
 * **LE CRITÈRE DU LOT : LE SOCLE DÉMARRE, ET IL RÉPOND.**
 *
 * ═══ CE QUE CES GARDES MESURENT ═══
 *
 * Le § 32 pose le critère de recette du lot 1, mot pour mot :
 *
 *   « le socle refuse de démarrer sans authentification et sans coffre · avec un
 *     coffre verrouillé, le healthcheck rend 200 + vaultLocked, console et
 *     déverrouillage répondent, tout outil est refusé »
 *
 * Jusqu'ici, ces phrases étaient éprouvées sur des fonctions PURES
 * (`decisionDeDemarrage`, `deciderDemarrageMonoInstance`) que **rien
 * n'appelait**. Ce fichier monte un socle entier et regarde ce qu'il sert.
 *
 * ⚠️ **AUCUN APPEL RÉSEAU, AUCUNE VALEUR RÉELLE.** L'URL de base est sur
 *    `stub.invalid` — TLD réservé, RFC 2606, qui ne résout jamais. C'est
 *    exactement la configuration de `.env.example`, et c'est le critère : le
 *    socle doit DÉMARRER EN LOCAL avec des valeurs factices.
 *
 * ⚠️ **L'HORLOGE ET LE PLANIFICATEUR SONT INJECTÉS.** Une garde qui attendrait
 *    de vraies secondes serait lente, instable, et finirait désactivée.
 */

const T0 = new Date("2026-08-31T09:00:00.000Z");
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;

/**
 * **L'ENVIRONNEMENT FACTICE DU § 19 — DÉRIVÉ, JAMAIS RECOPIÉ.**
 *
 * Les quatre réglages exigés, tous sur `stub.invalid` (RFC 2606, qui ne résout
 * jamais). Un environnement recopié resterait vert le jour où le § 19 gagnerait
 * un cinquième réglage : la garde du critère mesurerait alors un socle qui ne
 * démarre plus.
 */
function environnementFactice(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const reglage of REGLAGES_DAUTHENTIFICATION) {
    env[reglage.nom] =
      reglage.nom === VARIABLE_DE_L_AUDIENCE
        ? "https://socle.stub.invalid/api/mcp"
        : "valeur-factice-non-secrete";
  }
  return env;
}

/**
 * **LE VERDICT ATTENDU D'UN ENVIRONNEMENT COMPLET — ÉCRIT, PUIS CONFRONTÉ.**
 *
 * ⚠️ **CE NOMBRE A ÉTÉ FAUX PENDANT TOUT UN LOT.** La fabrique de dépendances de
 *    ce fichier s'accordait `reglagesConfrontes: 5` alors que le décideur réel
 *    en confronte quatre — deux dérivations d'un même fait, dans le même lot, et
 *    c'était la fabriquée qui était verte, précisément parce qu'elle ne dérivait
 *    de rien. Le nombre est désormais PINGLÉ **et** confronté au réel par le
 *    témoin ⓪ ci-dessous : écrit, il se lit ; confronté, il ne peut plus mentir.
 */
const VERDICT_DUN_ENVIRONNEMENT_COMPLET = {
  reglagesConfrontes: 4,
  manquants: [],
  anomalies: [],
} as const;

/** § 20 — un index de provenance figé. Les trois comptes que la santé publie. */
function provenanceTemoin(): EtatIndexProvenance {
  return {
    extraits: 12,
    sessions: 3,
    empreintesRefusees: 0,
    sessionsEvincees: 0,
    indetermine: false,
    plafondExtraits: 10_000,
    plafondSessions: 512,
    ttlMs: 4 * HEURE,
  };
}

/** Un planificateur FACTICE : il retient la tâche au lieu de la programmer. */
class PlanificateurFactice {
  taches: (() => void)[] = [];
  periodes: number[] = [];
  annulations = 0;

  readonly planifier: Planificateur = (periodeMs, tache) => {
    this.periodes.push(periodeMs);
    this.taches.push(tache);
    return () => {
      this.annulations += 1;
    };
  };

  /** Un tour d'horloge : toutes les tâches battent une fois. */
  battre(): void {
    for (const tache of this.taches) tache();
  }
}

interface Reglages {
  readonly coffre?: EtatCoffre;
  readonly authentification?: DependancesDuSocle["controlerLAuthentification"];
  /** L'environnement du § 19 soumis à l'étage 3. Absent = l'env factice COMPLET. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly hotes?: readonly string[];
  readonly magasin?: MagasinDeVerrousEnMemoire;
  readonly depot?: DepotPolitiqueMemoire;
  readonly urlDeBase?: string;
  readonly lock?: { readonly present: boolean; readonly brut: unknown };
  readonly horloge?: () => Date;
  readonly planificateur?: PlanificateurFactice;
  readonly sortieDErreur?: string[];
}

/**
 * Les dépendances FACTICES du socle. Elles reprennent `.env.example` : base sur
 * `stub.invalid`, un hôte autorisé, aucun adaptateur épinglé.
 *
 * ⚠️ AUCUN CHAMP N'EST FACULTATIF DANS `DependancesDuSocle` — c'est le type qui
 *    empêche un câblage à moitié fait de passer. Les valeurs par défaut vivent
 *    donc ICI, dans une fabrique de témoins, jamais dans la racine.
 *
 * ⚠️ **L'ÉTAGE 3 EST ÉPROUVÉ SUR LE DÉCIDEUR RÉEL.** `controlerLAuthentification`
 *    vaut `null` par défaut : la racine appelle alors
 *    `verifierLaConfigurationDAuthentification` sur l'environnement factice
 *    ci-dessous. Le port ne sert plus qu'aux verdicts qu'un environnement ne
 *    sait pas produire — le contrôle AVEUGLE, qui confronte zéro réglage.
 */
function dependances(reglages: Reglages = {}): DependancesDuSocle {
  const environnement = reglagesDepuisLEnvironnement({
    DATABASE_URL:
      reglages.urlDeBase ?? `postgresql://stub:stub@${HOTE_SANS_MAGASIN_PARTAGE}:5432/stub`,
    OPS_ALLOWED_HOSTS: (reglages.hotes ?? ["localhost:3000"]).join(","),
    ...(reglages.env ?? environnementFactice()),
  });
  const sortie = reglages.sortieDErreur ?? [];

  return {
    urlDeBase: environnement.urlDeBase,
    ouvrirLaSessionDeVerrou: null,
    magasinEnMemoire: reglages.magasin ?? new MagasinDeVerrousEnMemoire(),
    instance: frapperInstance(reglages.horloge?.() ?? T0),
    lireLEtatDuCoffre: () => Promise.resolve(reglages.coffre ?? "verrouillé"),
    reglagesDAuthentification: environnement.reglagesDAuthentification,
    controlerLAuthentification: reglages.authentification ?? null,
    depotPolitique: reglages.depot ?? new DepotPolitiqueMemoire(),
    motifDuDemarrage: "démarrage du socle (garde)",
    lireLeLockDAdaptateurs: () => Promise.resolve(reglages.lock ?? { present: false, brut: null }),
    manifestesAAdmettre: [],
    transports: ["http", "stdio"],
    hotesAutorises: environnement.hotesAutorises,
    lireLaProvenance: provenanceTemoin,
    periodeDeVeilleMs: 30_000,
    planifier: (reglages.planificateur ?? new PlanificateurFactice()).planifier,
    sondes: SONDES_NON_POURVUES,
    horloge: reglages.horloge ?? (() => T0),
    ecrireSurLaSortieDErreur: (ligne) => sortie.push(ligne),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ⓪ LE DÉCOR NE S'ACCORDE PLUS SON PROPRE VERT
// ═════════════════════════════════════════════════════════════════════════════

describe("⓪ le verdict d'authentification de ce fichier est CONFRONTÉ au décideur réel", () => {
  /**
   * ⚠️ **CE TEST EXISTE PARCE QUE CE FICHIER A MENTI PENDANT TOUT UN LOT.** Sa
   *    fabrique de dépendances posait `reglagesConfrontes: 5` — un nombre qui ne
   *    dérivait de rien — et franchissait l'étage 3 en s'accordant elle-même le
   *    verdict que la racine ne savait pas obtenir. Le socle démarrait dans le
   *    test ; il ne démarrait nulle part ailleurs.
   */
  it("confronte le nombre écrit à la liste réelle du § 19, et l'env factice au décideur", () => {
    const reel = verifierLaConfigurationDAuthentification(environnementFactice());

    console.info(
      `[⓪ · verdict confronté] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) dans ` +
        `REGLAGES_DAUTHENTIFICATION [${REGLAGES_DAUTHENTIFICATION.map((r) => r.nom).join(", ")}] · ` +
        `verdict ÉCRIT dans ce fichier : ` +
        `${String(VERDICT_DUN_ENVIRONNEMENT_COMPLET.reglagesConfrontes)} confronté(s) · ` +
        `verdict RÉEL sur l'env factice : ${String(reel.reglagesConfrontes)} confronté(s), ` +
        `${String(reel.manquants.length)} manquant(s), ${String(reel.anomalies.length)} anomalie(s) · ` +
        `${String(reel.contraintesDAudienceConfrontees)} contrainte(s) d'audience confrontée(s)`,
    );

    // Le nombre écrit ne peut plus diverger de la liste réelle.
    expect(VERDICT_DUN_ENVIRONNEMENT_COMPLET.reglagesConfrontes).toBe(
      REGLAGES_DAUTHENTIFICATION.length,
    );
    expect(VERDICT_DUN_ENVIRONNEMENT_COMPLET.reglagesConfrontes).toBe(reel.reglagesConfrontes);
    // Et l'environnement factice de ce fichier fait bien FRANCHIR l'étage 3 :
    // sans cela, tous les autres tests mesureraient un refus déguisé.
    expect(reel.manquants).toEqual([...VERDICT_DUN_ENVIRONNEMENT_COMPLET.manquants]);
    expect(reel.anomalies).toEqual([...VERDICT_DUN_ENVIRONNEMENT_COMPLET.anomalies]);
    expect(reel.contraintesDAudienceConfrontees).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ① LE CRITÈRE — LE SOCLE DÉMARRE EN LOCAL, COFFRE VERROUILLÉ
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 32 · ① coffre VERROUILLÉ — le socle démarre amputé et le healthcheck rend 200", () => {
  it("sert la console et le déverrouillage, refuse tout outil, et annonce ses comptes", async () => {
    const sortie: string[] = [];
    const socle = await demarrerLeSocle(dependances({ sortieDErreur: sortie }));
    const sante = await socle.healthcheck?.();

    console.info(
      `[① · démarrage local] ${String(socle.demarrage.etagesConfrontes)} étage(s) confronté(s) · ` +
        `${String(socle.demarrage.etagesFranchis)} franchi(s) · ` +
        `sert : ${String(socle.demarrage.sert)} · ` +
        `implémentation du verrou : « ${socle.choixDuVerrou.implementation} » ` +
        `(aveugle aux autres processus : ` +
        `${String(socle.choixDuVerrou.aveugleAuxAutresProcessus)}) · ` +
        `${String(socle.demarrage.amputations.length)} amputation(s) · ` +
        `${String(sortie.length)} ligne(s) sur la sortie d'erreur · ` +
        `healthcheck : ${String(sante?.statut ?? 0)} · ` +
        `vaultLocked : ${String(sante?.corps.vaultLocked ?? false)} · ` +
        `routes servies : [${(sante?.corps.routesServies ?? []).join(", ")}] · ` +
        `appels d'outils : ${String(sante?.corps.appelsDOutilsAcceptes ?? true)} · ` +
        `extraits indexés : ${String(sante?.corps.provenance.extraits ?? -1)} · ` +
        `niveau de politique : ${sante?.corps.politique.niveau ?? "?"}`,
    );

    // ── LE SOCLE VIT ─────────────────────────────────────────────────────────
    expect(socle.demarrage.sert).toBe(true);
    expect(socle.demarrage.etagesConfrontes).toBe(7);
    expect(socle.demarrage.anomalies).toEqual([]);
    expect(socle.instance).not.toBeNull();
    expect(socle.healthcheck).not.toBeNull();

    // ── § 23 — 200 + `vaultLocked`, console et déverrouillage servis ─────────
    expect(sante?.statut).toBe(200);
    expect(sante?.corps.vaultLocked).toBe(true);
    expect(sante?.corps.coffre).toBe("verrouillé");
    expect(sante?.corps.routesServies).toContain("console");
    expect(sante?.corps.routesServies).toContain("déverrouillage");
    expect(sante?.corps.routesServies).toContain("healthcheck");
    // « tout appel d'outil est refusé »
    expect(sante?.corps.routesServies).not.toContain("outils");
    expect(sante?.corps.appelsDOutilsAcceptes).toBe(false);

    // ── § 20 — LE NOMBRE D'EXTRAITS INDEXÉS, SIGNAL POSITIF ──────────────────
    expect(sante?.corps.provenance.extraits).toBe(12);
    expect(sante?.corps.instanceId).toBe(socle.instance?.instanceId);

    // ── LE COFFRE VERROUILLÉ NE SE TAIT PAS ──────────────────────────────────
    expect(sortie.length).toBe(1);
    expect(sortie[0]).toContain("Déverrouiller depuis la console");

    // ── LE VERROU EST PRIS, MÊME EN LOCAL — et la BORNE est annoncée ─────────
    expect(socle.choixDuVerrou.implementation).toBe("mémoire");
    expect(socle.choixDuVerrou.aveugleAuxAutresProcessus).toBe(true);

    await socle.arreter();
  });

  it("le socle COFFRE OUVERT sert les quatre routes — le témoin de contraste", async () => {
    const socle = await demarrerLeSocle(dependances({ coffre: "ouvert" }));
    const sante = await socle.healthcheck?.();

    console.info(
      `[① · contraste] coffre ouvert → ${String(socle.demarrage.etagesFranchis)} étage(s) ` +
        `franchi(s) · statut ${String(sante?.statut ?? 0)} · ` +
        `${String(sante?.corps.routesServies.length ?? 0)} route(s) · ` +
        `appels d'outils : ${String(sante?.corps.appelsDOutilsAcceptes ?? false)}`,
    );

    // Sans ce contraste, le test précédent serait vert sur un socle qui
    // refuserait les outils DANS TOUS LES CAS.
    expect(socle.demarrage.etagesFranchis).toBe(7);
    expect(sante?.corps.routesServies).toContain("outils");
    expect(sante?.corps.appelsDOutilsAcceptes).toBe(true);
    expect(sante?.corps.vaultLocked).toBe(false);

    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LES DEUX REFUS DU § 32
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 32 · ② le socle REFUSE de démarrer sans coffre et sans authentification", () => {
  it("coffre ABSENT — le processus sort, le message NOMME la commande", async () => {
    const sortie: string[] = [];
    const socle = await demarrerLeSocle(dependances({ coffre: "absent", sortieDErreur: sortie }));

    console.info(
      `[② · coffre absent] sert : ${String(socle.demarrage.sert)} · ` +
        `code de sortie ${String(socle.demarrage.codeDeSortie)} ` +
        `(rang de l'étage « coffre » : ${String(ETAGES_DU_DEMARRAGE.coffre.rang)}) · ` +
        `${String(socle.demarrage.etagesConfrontes)} étage(s) atteint(s) · ` +
        `healthcheck : ${socle.healthcheck === null ? "AUCUN" : "servi"} · ` +
        `${String(sortie.length)} ligne(s) sur la sortie d'erreur`,
    );

    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.coffre.rang);
    // Un socle qui sort ne répond RIEN — pas même un healthcheck.
    expect(socle.healthcheck).toBeNull();
    expect(socle.instance).toBeNull();
    // § 25 — le message nomme la commande, et il va sur la sortie d'erreur.
    expect(sortie.join(" ")).toContain(COMMANDE_DE_PROVISION);
    // La séquence s'est arrêtée : les étages 3 à 7 n'ont jamais tourné.
    expect(socle.demarrage.etagesConfrontes).toBe(2);

    await socle.arreter();
  });

  it("AUCUNE authentification — le processus sort, sans mode dégradé (§ 19)", async () => {
    const sortie: string[] = [];
    // ⚠️ **L'ENVIRONNEMENT EST VIDE, ET LE PORT EST `null`** : la racine appelle
    //    donc le décideur RÉEL du § 19 sur un environnement où rien n'est
    //    renseigné. C'est le vrai chemin de production, pas un verdict fabriqué.
    const socle = await demarrerLeSocle(dependances({ env: {}, sortieDErreur: sortie }));
    const attendu = verifierLaConfigurationDAuthentification({});

    console.info(
      `[② · sans authentification] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) ` +
        `exigé(s) par le § 19 · ${String(attendu.manquants.length)} manquant(s) ` +
        `[${attendu.manquants.join(", ")}] · sert : ${String(socle.demarrage.sert)} · ` +
        `code ${String(socle.demarrage.codeDeSortie)} ` +
        `(rang de l'étage « authentification » : ` +
        `${String(ETAGES_DU_DEMARRAGE.authentification.rang)}) · ` +
        `${String(socle.demarrage.etagesConfrontes)} étage(s) atteint(s) · ` +
        `healthcheck : ${socle.healthcheck === null ? "AUCUN" : "servi"}`,
    );

    // Le décideur réel a bien mordu : quatre réglages manquants, pas zéro.
    expect(attendu.manquants.length).toBe(REGLAGES_DAUTHENTIFICATION.length);
    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.authentification.rang);
    expect(socle.healthcheck).toBeNull();
    expect(sortie.join(" ")).toContain("règle absolue");

    await socle.arreter();
  });

  it("SAIT DIRE NON — une audience PRÉSENTE mais mal formée refuse aussi", async () => {
    const sortie: string[] = [];
    const mauvaise = { ...environnementFactice(), [VARIABLE_DE_L_AUDIENCE]: "pas-une-url" };
    const socle = await demarrerLeSocle(dependances({ env: mauvaise, sortieDErreur: sortie }));
    const attendu = verifierLaConfigurationDAuthentification(mauvaise);

    console.info(
      `[② · audience mal formée] ${String(attendu.reglagesConfrontes)} réglage(s) confronté(s) · ` +
        `${String(attendu.manquants.length)} manquant(s) · ` +
        `${String(attendu.contraintesDAudienceConfrontees)} contrainte(s) d'audience ` +
        `confrontée(s) · ${String(attendu.anomalies.length)} anomalie(s) · ` +
        `sert : ${String(socle.demarrage.sert)} · code ${String(socle.demarrage.codeDeSortie)}`,
    );

    // La PRÉSENCE ne suffit pas : rien ne manque, et pourtant l'étage refuse.
    expect(attendu.manquants).toEqual([]);
    expect(attendu.contraintesDAudienceConfrontees).toBeGreaterThan(0);
    expect(attendu.anomalies.length).toBeGreaterThan(0);
    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.authentification.rang);

    await socle.arreter();
  });

  it("SAIT DIRE NON — ZÉRO réglage confronté est un REFUS, pas un succès", async () => {
    const socle = await demarrerLeSocle(
      dependances({
        // Le mode de défaillance classique : le nom de la variable change, la
        // liste se résout à zéro entrée, la boucle ne trouve aucun manquant à
        // signaler, et le contrôle reste vert en ne gardant RIEN.
        authentification: () => ({ reglagesConfrontes: 0, manquants: [], anomalies: [] }),
      }),
    );

    console.info(
      `[② · contrôle aveugle] 0 réglage confronté, 0 manquant, 0 anomalie → ` +
        `sert : ${String(socle.demarrage.sert)} · ` +
        `code ${String(socle.demarrage.codeDeSortie)}`,
    );

    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.authentification.rang);

    await socle.arreter();
  });

  it("SAIT DIRE NON — une liste blanche d'hôtes VIDE refuse de démarrer", async () => {
    const sortie: string[] = [];
    const socle = await demarrerLeSocle(dependances({ hotes: [], sortieDErreur: sortie }));

    console.info(
      `[② · liste blanche vide] ${String(socle.demarrage.etagesConfrontes)} étage(s) atteint(s) · ` +
        `sert : ${String(socle.demarrage.sert)} · ` +
        `code ${String(socle.demarrage.codeDeSortie)} ` +
        `(rang de « transports » : ${String(ETAGES_DU_DEMARRAGE.transports.rang)}) · ` +
        `${String(socle.demarrage.comptesParEtage["transports"]?.["hotesAutorises"] ?? -1)} hôte(s) ` +
        `confronté(s)`,
    );

    // ⚠️ UNE LISTE VIDE N'EST PAS « TOUT AUTORISER » : c'est un refus.
    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.transports.rang);
    expect(sortie.join(" ")).toContain("tout autoriser");

    await socle.arreter();
  });

  it("SAIT DIRE NON — un verrou d'adaptateurs ILLISIBLE refuse, un lock ABSENT non", async () => {
    const illisible = await demarrerLeSocle(
      dependances({
        lock: { present: true, brut: { lockVersion: 99, adapters: "n'importe quoi" } },
      }),
    );
    const vide = await demarrerLeSocle(
      dependances({ lock: { present: true, brut: { lockVersion: VERSION_VERROU, adapters: [] } } }),
    );

    console.info(
      `[② · registre] lock ILLISIBLE → sert : ${String(illisible.demarrage.sert)}, ` +
        `code ${String(illisible.demarrage.codeDeSortie)} · ` +
        `lock VIDE mais valide → sert : ${String(vide.demarrage.sert)}, ` +
        `${String(vide.adaptateursEpingles)} adaptateur(s) épinglé(s)`,
    );

    expect(illisible.demarrage.sert).toBe(false);
    expect(illisible.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.registre.rang);
    // ⚠️ LE CONTRASTE EST LA MOITIÉ QUI COMPTE : un verrou vide est LÉGITIME
    //    tant qu'aucun adaptateur n'est épinglé, et le faire échouer casserait
    //    l'amorçage. Le zéro se LIT, il ne se devine pas.
    expect(vide.demarrage.sert).toBe(true);
    expect(vide.adaptateursEpingles).toBe(0);

    await illisible.arreter();
    await vide.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ UN SECOND PROCESSUS EST REFUSÉ
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0018 · ③ un second socle ne démarre pas", () => {
  it("deux racines sur le même magasin : UNE SEULE sert", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const socles: SocleDemarre[] = [
      await demarrerLeSocle(dependances({ magasin })),
      await demarrerLeSocle(dependances({ magasin })),
    ];
    const servants = socles.filter((socle) => socle.demarrage.sert);

    console.info(
      `[③ · mono-instance] ${String(socles.length)} racine(s) démarrée(s) · ` +
        `${String(magasin.tentatives)} tentative(s) d'acquisition · ` +
        `${String(magasin.acquisitionsAccordees)} accordée(s) · ` +
        `${String(servants.length)} SOCLE(S) QUI SERT(ENT) · ` +
        `codes de sortie : ${socles.map((s) => String(s.demarrage.codeDeSortie)).join(", ")}`,
    );

    // Les trois comptes ne disent pas la même chose : le verrou a été TENTÉ, il
    // a MORDU, et la racine en a TENU COMPTE. C'est la troisième phrase qui est
    // la couture, et c'est la seule que le lot 1d ne pouvait pas prouver.
    expect(magasin.tentatives).toBe(2);
    expect(magasin.acquisitionsAccordees).toBe(1);
    expect(servants.length).toBe(1);
    expect(socles[1]?.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.verrou.rang);
    expect(socles[1]?.healthcheck).toBeNull();
    // Le socle refusé ne publie AUCUNE identité : sinon l'observateur de
    // `ops/mono-instance.ts` compterait une instance qui ne sert pas.
    expect(socles[1]?.instance).toBeNull();

    for (const socle of socles) await socle.arreter();
  });

  it("SAIT DIRE NON — une URL de base ILLISIBLE refuse, au lieu d'un verrou aveugle", async () => {
    const socle = await demarrerLeSocle(dependances({ urlDeBase: "ceci n'est pas une URL" }));

    console.info(
      `[③ · URL illisible] implémentation choisie : ` +
        `« ${socle.choixDuVerrou.implementation} » · URL lisible : ` +
        `${String(socle.choixDuVerrou.urlLisible)} · sert : ${String(socle.demarrage.sert)} · ` +
        `code ${String(socle.demarrage.codeDeSortie)}`,
    );

    // ⚠️ SANS CE REFUS, UNE URL MAL ORTHOGRAPHIÉE DONNERAIT UN VERROU EN
    //    MÉMOIRE EN PRODUCTION — aveugle aux autres processus, et silencieux.
    expect(socle.choixDuVerrou.urlLisible).toBe(false);
    expect(socle.demarrage.sert).toBe(false);
    expect(socle.demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.verrou.rang);

    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④ LE HEALTHCHECK RELIT LE VERROU À CHAQUE APPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0018 · ④ le healthcheck RELIT, il ne se souvient pas", () => {
  it("rend 503 dès que le verrou n'est plus tenu — le cas que le démarrage ne voit JAMAIS", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const socle = await demarrerLeSocle(dependances({ magasin }));

    const avant = await socle.healthcheck?.();
    // ⚠️ LE CAS RÉEL : « personne ne démarre volontairement deux socles ; une
    //    connexion, elle, tombe toute seule ». Le démarrage est passé depuis
    //    longtemps, et c'est MAINTENANT que le verrou s'en va.
    const arrache = magasin.arracherLeVerrou();
    const apres = await socle.healthcheck?.();

    console.info(
      `[④ · relecture] verrou arraché : ${String(arrache)} · ` +
        `${String(magasin.relectures)} relecture(s) du magasin · ` +
        `statut AVANT : ${String(avant?.statut ?? 0)} (verrou ${avant?.corps.verrou ?? "?"}) · ` +
        `statut APRÈS : ${String(apres?.statut ?? 0)} (verrou ${apres?.corps.verrou ?? "?"}) · ` +
        `vaultLocked inchangé : ${String(apres?.corps.vaultLocked ?? false)}`,
    );

    expect(arrache).toBe(true);
    expect(avant?.statut).toBe(200);
    expect(avant?.corps.verrou).toBe("tenu");
    // Un drapeau posé au démarrage répondrait « tenu » exactement ici.
    expect(apres?.statut).toBe(503);
    expect(apres?.corps.verrou).toBe("perdu");
    // ⚠️ ET LE COFFRE N'EST POUR RIEN DANS CE 503 : un coffre verrouillé rend
    //    200, un verrou perdu rend 503. Les deux ne disent pas la même chose au
    //    déploiement.
    expect(apres?.corps.vaultLocked).toBe(true);
    // La relecture a bien INTERROGÉ le magasin, deux fois — une par appel.
    expect(magasin.relectures).toBeGreaterThanOrEqual(2);

    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑤ LA POLITIQUE RETOMBE AU PLUS STRICT — § 20, PROTECTION 4
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 20 · ⑤ le redémarrage REFERME un desserrage en cours", () => {
  it("écrit la ligne `setBy: boot` et retombe en `brouillon`", async () => {
    // Un desserrage de douze heures était en cours quand le socle est tombé.
    const desserrage: LignePolitique = {
      id: "desserrage-en-cours",
      level: "libre",
      scope: "*",
      channel: "console",
      expiresAt: new Date(T0.getTime() + 12 * HEURE),
      supersededAt: null,
      setBy: "will",
      setAt: T0,
      reason: "desserrage borné de douze heures, posé par la route dédiée",
    };
    const depot = new DepotPolitiqueMemoire([desserrage]);
    const auRedemarrage = new Date(T0.getTime() + MINUTE);

    // TÉMOIN DE CONTRASTE — la LECTURE SEULE, sans procédure de démarrage.
    const sansBoot = plancherDuScope(await depot.lignes(), "*", auRedemarrage);

    const socle = await demarrerLeSocle(dependances({ depot, horloge: () => auRedemarrage }));
    const sante = await socle.healthcheck?.();
    const lignes = await depot.lignes();
    const boot = lignes.filter((ligne) => ligne.setBy === "boot");

    console.info(
      `[⑤ · protection 4] LECTURE SEULE → ${sansBoot.niveau} ` +
        `(${String(sansBoot.mesures)} ligne(s) examinée(s)) · ` +
        `APRÈS la racine → ${socle.politique?.niveauApres ?? "?"} ` +
        `(${String(socle.politique?.mesures ?? -1)} ligne(s) à l'entrée, ` +
        `${String(socle.politique?.recouvertes.length ?? -1)} recouverte(s)) · ` +
        `${String(boot.length)} ligne(s) « setBy: boot » écrite(s) · ` +
        `healthcheck → niveau ${sante?.corps.politique.niveau ?? "?"} ` +
        `(chargée : ${String(sante?.corps.politique.chargee ?? false)}, ` +
        `${String(sante?.corps.politique.lignesExaminees ?? -1)} ligne(s) relue(s))`,
    );

    // ⚠️ LE CONTRASTE EST LA GARDE. Sans procédure, le dernier niveau connu
    //    SURVIT — et c'est juste : `plancherDuScope` est une fonction pure.
    //    L'invariant du § 20 ne peut être tenu que par une PROCÉDURE, et cette
    //    procédure n'était appelée par personne avant cette racine.
    expect(sansBoot.niveau).toBe("libre");

    expect(socle.demarrage.sert).toBe(true);
    expect(socle.politique?.niveauAvant).toBe("libre");
    expect(socle.politique?.niveauApres).toBe("brouillon");
    expect(boot.length).toBe(1);
    expect(boot[0]?.level).toBe("brouillon");
    expect(boot[0]?.scope).toBe("*");
    // Le desserrage recouvert est NOMMÉ — sinon l'exploitant ne saura pas
    // pourquoi sa porte s'est refermée.
    expect(socle.politique?.recouvertes.map((l) => l.id)).toContain("desserrage-en-cours");
    // Et l'écran Santé le montre : le niveau est RELU, pas figé au démarrage.
    expect(sante?.corps.politique.niveau).toBe("brouillon");
    expect(sante?.corps.politique.chargee).toBe(true);
    expect(sante?.corps.politique.lignesExaminees).toBeGreaterThan(0);

    await socle.arreter();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑥ LA VEILLE BAT
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 24 · ⑥ la veille BAT — elle ne se tait pas en espérant qu'on le remarque", () => {
  it("publie un compte de battements qui MONTE, et se déclare muette au-delà du seuil", async () => {
    let maintenant = T0;
    const planificateur = new PlanificateurFactice();
    const socle = await demarrerLeSocle(dependances({ planificateur, horloge: () => maintenant }));

    const auDemarrage = (await socle.healthcheck?.())?.corps.veille;

    maintenant = new Date(T0.getTime() + 30_000);
    planificateur.battre();
    maintenant = new Date(T0.getTime() + 60_000);
    planificateur.battre();
    const apresDeuxTours = (await socle.healthcheck?.())?.corps.veille;

    // L'horloge avance BIEN au-delà du seuil, sans qu'aucun battement n'arrive.
    maintenant = new Date(T0.getTime() + 10 * MINUTE);
    const apresLeSilence = (await socle.healthcheck?.())?.corps.veille;

    console.info(
      `[⑥ · battement] ${String(planificateur.taches.length)} tâche(s) planifiée(s) à ` +
        `${planificateur.periodes.map(String).join(", ")} ms · ` +
        `au démarrage : ${String(auDemarrage?.battements ?? -1)} battement(s), ` +
        `silencieuse : ${String(auDemarrage?.silencieuse ?? true)} · ` +
        `après 2 tours : ${String(apresDeuxTours?.battements ?? -1)} battement(s) · ` +
        `seuil de silence : ${String(apresDeuxTours?.seuilDeSilenceMs ?? -1)} ms · ` +
        `après 10 min sans battement : ` +
        `silencieuse : ${String(apresLeSilence?.silencieuse ?? false)} ` +
        `(depuis ${String(apresLeSilence?.silencieuseDepuisMs ?? -1)} ms)`,
    );

    // Le premier battement a lieu à l'étage 7, pas au premier tour du
    // planificateur : un socle qui démarrerait sans battre serait muet jusqu'à
    // la première période.
    expect(auDemarrage?.battements).toBe(1);
    expect(auDemarrage?.silencieuse).toBe(false);
    // Le compte MONTE — c'est le signal POSITIF ; une absence d'alerte se lirait
    // « tout va bien », un compteur figé se voit.
    expect(apresDeuxTours?.battements).toBe(3);
    // Le seuil est DÉRIVÉ de la période, pas écrit à part.
    expect(planificateur.periodes).toEqual([30_000]);
    expect(apresDeuxTours?.seuilDeSilenceMs).toBe(75_000);
    // Et la veille SAIT dire qu'elle s'est tue.
    expect(apresLeSilence?.silencieuse).toBe(true);

    await socle.arreter();
    expect(planificateur.annulations).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑦ CE QUE LA RACINE N'ÉCRIT NULLE PART
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0023 · ⑦ aucun refus de démarrage n'entre dans `ops_audit`", () => {
  it("la racine n'importe RIEN de `core/audit/` — mesuré sur son source", () => {
    const source = readFileSync(fileURLToPath(new URL("./main.ts", import.meta.url)), "utf8");
    const imports = [...source.matchAll(/^\s*import[\s\S]*?from\s*"([^"]+)"/gm)].map(
      (trouve) => trouve[1] ?? "",
    );
    const versLAudit = imports.filter((chemin) => chemin.includes("/audit/"));
    const versLeSceau = imports.filter((chemin) => chemin.includes("/sceau/"));

    console.info(
      `[⑦ · portée] ${String(source.length)} octet(s) lus · ` +
        `${String(imports.length)} import(s) déclaré(s) · ` +
        `${String(versLAudit.length)} vers core/audit/ [${versLAudit.join(", ") || "aucun"}] · ` +
        `${String(versLeSceau.length)} vers core/sceau/ [${versLeSceau.join(", ") || "aucun"}]`,
    );

    // Plancher : les imports ont bien été LUS. Une expression cassée rendrait
    // zéro import, et « zéro vers core/audit » serait vrai pour rien.
    expect(imports.length).toBeGreaterThanOrEqual(10);
    // ⚠️ La chaîne du journal est scellée par une clé DU COFFRE (ADR 0002), et
    //    les sept étages tournent sous coffre potentiellement verrouillé. Une
    //    ligne non scellée fabriquerait un trou dans la chaîne — c'est-à-dire
    //    rendrait normal ce que l'ADR 0002 existe pour rendre détectable.
    expect(versLAudit).toEqual([]);
    expect(versLeSceau).toEqual([]);
  });
});
