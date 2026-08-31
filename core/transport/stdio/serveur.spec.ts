import { describe, expect, it } from "vitest";

import { STATUT_DES_CANAUX_DE_CONTEXTE } from "../../types.js";
import { PRINCIPAL_STDIO, SCOPES_PAR_DEFAUT_STDIO } from "../../chaine/orchestrateur.js";
import type { IdentiteAppelante, ResultatAppel } from "../../chaine/orchestrateur.js";
import type { NoyauUnique } from "../contrat.js";

import { CLES_DE_PARAMETRES_DE_TOOLS_CALL, CODES_ENVELOPPE } from "./protocole.js";
import {
  BUDGET_MAX_MS,
  BUDGET_PAR_DEFAUT_MS,
  brancherSurLesFlux,
  creerServeurStdio,
  ecrireSurLeFlux,
} from "./serveur.js";
import type { FluxDEntreeStdio, FluxDeSortieStdio } from "./serveur.js";
import {
  HABILITATIONS_DU_HARNAIS,
  INSTANT_DU_HARNAIS,
  OUTIL_BONJOUR,
  fabriquerServeurDuHarnais,
  ligneJsonRpc,
} from "./fixtures.js";

/**
 * GARDES DU DÉMON stdio — **UN APPEL COMPLET, ET LES DEUX VALEURS QUE LE
 * TRANSPORT FRAPPE.**
 *
 * ═══ CE QUE CE FICHIER MESURE ═══
 *
 *  1. **Un appel de bout en bout** sur l'adaptateur « bonjour » : une ligne
 *     JSON-RPC entre par le flux, une réponse sort, et UNE ligne d'`ops_audit`
 *     l'atteste. Rien n'est simulé de ce qui décide — le noyau est
 *     `orchestrerAppel` en transport `stdio`.
 *  2. **`requestId` frappé et `deadline` calculée** — les deux valeurs classées
 *     « à-fermer-au-transport » depuis l'ADR 0020, et qui attendaient ce dossier.
 *     La garde ne lit pas une phrase : elle envoie deux appels portant le MÊME
 *     `id` JSON-RPC et mesure ce qui atteint le noyau.
 *  3. **La fermeture des paramètres** — `deadline`, `sessionId`, `principal`,
 *     `scopes` et tout nom qui n'existe pas encore sont REFUSÉS, pas ignorés.
 *  4. **`tools/list` relue à chaque appel** (§ 11) — mesuré par un compte de
 *     lectures, pas par une phrase.
 *
 * ⚠️ CHAQUE GARDE ANNONCE SON COMPTE. Une garde de transport qui n'aurait servi
 *    aucune ligne serait verte sur un serveur mort.
 */

/** Le délimiteur du cadrage, écrit une fois — un littéral échappé se relit mal. */
const DELIMITEUR_DE_LIGNE = String.fromCharCode(10);

/** L'identité que le noyau a reçue, capturée sans passer par l'orchestrateur. */
function noyauEspion(): {
  readonly noyau: NoyauUnique;
  readonly identites: IdentiteAppelante[];
  readonly appels: unknown[];
} {
  const identites: IdentiteAppelante[] = [];
  const appels: unknown[] = [];
  const noyau: NoyauUnique = (identite, appel) => {
    identites.push(identite);
    appels.push(appel);
    // ⚠️ CE NOYAU LÈVE PLUTÔT QUE DE RENDRE UN FAUX RÉSULTAT. Un espion qui
    //    rendrait une terminaison fabriquée ferait croire au transport qu'un
    //    appel a été journalisé, ce qui est précisément l'invariant qu'on ne veut
    //    jamais simuler. Le serveur traite la levée comme une panne interne, et
    //    c'est un comportement qu'on mesure ailleurs.
    return Promise.reject(new Error("espion : aucun résultat n'est fabriqué ici"));
  };
  return { noyau, identites, appels };
}

function monterEspion(): ReturnType<typeof noyauEspion> & {
  readonly serveur: ReturnType<typeof creerServeurStdio>;
  readonly sortie: string[];
} {
  const espion = noyauEspion();
  const sortie: string[] = [];
  const serveur = creerServeurStdio({
    noyau: espion.noyau,
    catalogue: {
      listerPourCetAppel: () => Promise.resolve([]),
    },
    habilitations: () => HABILITATIONS_DU_HARNAIS,
    maintenant: () => INSTANT_DU_HARNAIS,
    ecrire: (ligne) => sortie.push(ligne),
  });
  return { ...espion, serveur, sortie };
}

// ═════════════════════════════════════════════════════════════════════════════
//  1 · L'APPEL COMPLET
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — un appel « bonjour » traverse le fil stdio et laisse UNE ligne", () => {
  it("sert `initialize`, puis `tools/list`, puis `tools/call`, et journalise l'appel", async () => {
    const decor = fabriquerServeurDuHarnais();

    await decor.serveur.absorber(
      ligneJsonRpc(1, "initialize", { protocolVersion: "à-relire-au-lot-1" }) +
        ligneJsonRpc(2, "tools/list") +
        ligneJsonRpc(3, "tools/call", {
          name: OUTIL_BONJOUR.name,
          arguments: { ton: "chaleureux" },
        }),
    );

    const reponses = decor.reponses();
    const mesures = decor.serveur.mesures();
    const lignes = decor.harnais.lignes();

    console.info(
      `[stdio · bout en bout] ${String(mesures.cadrage.lignesVues)} ligne(s) reçue(s) · ` +
        `${String(mesures.reponsesEcrites)} réponse(s) écrite(s) · ` +
        `${String(mesures.toolsListServis)} « tools/list » servi(s) · ` +
        `${String(mesures.appelsAuNoyau)} appel(s) au noyau · ` +
        `${String(lignes.length)} ligne(s) d'ops_audit · ` +
        `étapes exercées : ${mesures.etapesExercees.join(", ")}`,
    );

    // Planchers-témoins : un serveur qui n'aurait rien lu serait vert sans eux.
    expect(mesures.cadrage.lignesVues).toBe(3);
    expect(mesures.reponsesEcrites).toBe(3);
    expect(reponses).toHaveLength(3);

    // ── `initialize` — une seule primitive (§ 11) ────────────────────────────
    const initialisation = reponses[0]?.["result"] as Record<string, unknown> | undefined;
    expect(initialisation?.["capabilities"]).toEqual({ tools: {} });

    // ── `tools/list` — la liste servie, sans filtrage par le transport ───────
    const liste = reponses[1]?.["result"] as { readonly tools?: readonly unknown[] } | undefined;
    expect(liste?.tools).toHaveLength(1);

    // ── `tools/call` — succès, et la ligne d'`ops_audit` l'atteste ───────────
    const appel = reponses[2]?.["result"] as Record<string, unknown> | undefined;
    expect(appel?.["isError"]).toBe(false);
    expect(appel?.["genre"]).toBe("exécuté");

    // L'INVARIANT DE SORTIE : exactement UNE ligne pour l'appel d'outil, et
    // AUCUNE pour `initialize` ni pour `tools/list` — ni l'un ni l'autre n'est
    // un appel d'outil, et leur en écrire une gonflerait la métrique du § 24.
    expect(lignes).toHaveLength(1);
    const ligne = lignes[0];
    expect(ligne?.decision).toBe("autorisé");
    expect(ligne?.stepDenied).toBeNull();
    expect(ligne?.tool).toBe(OUTIL_BONJOUR.name);
    // La colonne du § 11 pour stdio : le principal RÉSERVÉ, jamais un choix.
    expect(ligne?.principal).toBe(PRINCIPAL_STDIO);
  });

  it("§ 11 — la liste est RELUE à chaque `tools/list`, et le compte le prouve", async () => {
    const decor = fabriquerServeurDuHarnais();

    const appels = 4;
    for (let rang = 0; rang < appels; rang += 1) {
      await decor.serveur.absorber(ligneJsonRpc(rang + 1, "tools/list"));
    }

    const mesures = decor.serveur.mesures();

    console.info(
      `[stdio · tools/list relue] ${String(appels)} appel(s) soumis · ` +
        `${String(mesures.toolsListServis)} servi(s) · ` +
        `${String(mesures.lecturesDuCatalogue)} lecture(s) du catalogue par le transport · ` +
        `${String(decor.listagesDuCatalogue())} listage(s) réellement demandé(s) au port`,
    );

    // ⚠️ LES TROIS COMPTES DOIVENT ÊTRE ÉGAUX. Une mémoïsation entre deux appels
    //    ferait tomber les deux derniers à 1 en laissant le premier à 4 — et le
    //    § 11 tranche explicitement : « la liste est relue à chaque `tools/list` ».
    expect(mesures.toolsListServis).toBe(appels);
    expect(mesures.lecturesDuCatalogue).toBe(appels);
    expect(decor.listagesDuCatalogue()).toBe(appels);
    expect(appels).toBeGreaterThanOrEqual(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  2 · LES DEUX VALEURS QUE LE TRANSPORT FRAPPE — ADR 0001 / ADR 0020
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0020 — `requestId` est FRAPPÉ et `deadline` CALCULÉE, jamais recopiés", () => {
  it("deux appels portant le MÊME `id` JSON-RPC reçoivent deux `requestId` DIFFÉRENTS", async () => {
    const decor = monterEspion();
    const idChoisiParLAppelant = "identifiant-choisi-par-l-appelant";

    await decor.serveur.absorber(
      ligneJsonRpc(idChoisiParLAppelant, "tools/call", { name: "bonjour.dire" }) +
        ligneJsonRpc(idChoisiParLAppelant, "tools/call", { name: "bonjour.dire" }),
    );

    const [premiere, seconde] = decor.identites;

    console.info(
      `[stdio · requestId frappé] ${String(decor.identites.length)} identité(s) atteignant le ` +
        `noyau · id JSON-RPC soumis : « ${idChoisiParLAppelant} » (identique aux deux appels) · ` +
        `requestId reçus distincts : ${String(premiere?.requestId !== seconde?.requestId)} · ` +
        `longueur du premier : ${String(premiere?.requestId.length ?? 0)}`,
    );

    expect(decor.identites).toHaveLength(2);
    // Ni l'un ni l'autre n'est l'`id` de l'enveloppe.
    expect(premiere?.requestId).not.toBe(idChoisiParLAppelant);
    expect(seconde?.requestId).not.toBe(idChoisiParLAppelant);
    // Et ils diffèrent l'un de l'autre : un `requestId` recopié les aurait
    // rendus identiques, et deux appels auraient convergé dans la même ligne.
    expect(premiere?.requestId).not.toBe(seconde?.requestId);
  });

  it("la `deadline` vaut l'instant du socle PLUS un budget borné, et rien d'autre", async () => {
    const decor = monterEspion();
    await decor.serveur.absorber(ligneJsonRpc(1, "tools/call", { name: "bonjour.dire" }));

    const identite = decor.identites[0];
    const ecart = (identite?.deadline.getTime() ?? 0) - INSTANT_DU_HARNAIS.getTime();

    console.info(
      `[stdio · deadline calculée] ${String(decor.identites.length)} identité(s) mesurée(s) · ` +
        `écart à l'instant du socle : ${String(ecart)} ms · ` +
        `budget par défaut : ${String(BUDGET_PAR_DEFAUT_MS)} ms · ` +
        `plafond : ${String(BUDGET_MAX_MS)} ms`,
    );

    expect(decor.identites).toHaveLength(1);
    expect(ecart).toBe(BUDGET_PAR_DEFAUT_MS);
  });

  it("un budget déraisonnable est RAMENÉ sous le plafond — un réglage sans borne haute fabrique la panne suivante", () => {
    const sortie: string[] = [];
    const identites: IdentiteAppelante[] = [];
    const serveur = creerServeurStdio({
      noyau: (identite): Promise<ResultatAppel> => {
        identites.push(identite);
        return Promise.reject(new Error("espion"));
      },
      catalogue: { listerPourCetAppel: () => Promise.resolve([]) },
      habilitations: () => HABILITATIONS_DU_HARNAIS,
      maintenant: () => INSTANT_DU_HARNAIS,
      ecrire: (ligne) => sortie.push(ligne),
      budgetMs: BUDGET_MAX_MS * 1000,
    });

    return serveur.absorber(ligneJsonRpc(1, "tools/call", { name: "bonjour.dire" })).then(() => {
      const ecart = (identites[0]?.deadline.getTime() ?? 0) - INSTANT_DU_HARNAIS.getTime();
      console.info(
        `[stdio · budget borné] budget demandé : ${String(BUDGET_MAX_MS * 1000)} ms · ` +
          `écart appliqué : ${String(ecart)} ms · plafond : ${String(BUDGET_MAX_MS)} ms · ` +
          `${String(identites.length)} identité(s) mesurée(s)`,
      );
      expect(identites).toHaveLength(1);
      expect(ecart).toBe(BUDGET_MAX_MS);
    });
  });

  it("les scopes de stdio sont les PLUS ÉTROITS par défaut, et ne viennent jamais du fil", async () => {
    const decor = monterEspion();
    await decor.serveur.absorber(ligneJsonRpc(1, "tools/call", { name: "bonjour.dire" }));

    const identite = decor.identites[0];

    console.info(
      `[stdio · scopes] ${String(identite?.scopes.length ?? 0)} scope(s) reçu(s) par le noyau : ` +
        `${(identite?.scopes ?? []).join(", ")} · défaut dérivé du § 19.2 : ` +
        `${SCOPES_PAR_DEFAUT_STDIO.join(", ")} · principal : ${identite?.principal ?? "aucun"}`,
    );

    expect(identite?.scopes).toEqual(SCOPES_PAR_DEFAUT_STDIO);
    expect(identite?.principal).toBe(PRINCIPAL_STDIO);
    expect(SCOPES_PAR_DEFAUT_STDIO.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  3 · LA FERMETURE DES PARAMÈTRES
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0032 — les paramètres de `tools/call` sont une liste FERMÉE", () => {
  /**
   * ⚠️ **LES NOMS ÉPROUVÉS SONT DÉRIVÉS, PAS ÉCRITS.** Ils viennent des clés de
   *    `STATUT_DES_CANAUX_DE_CONTEXTE` — l'inventaire des canaux invisibles du
   *    § 20 —, qui est exactement l'ensemble des valeurs que LE SOCLE décide.
   *    Un champ ajouté au `ctx` demain entre donc dans cette épreuve sans qu'une
   *    ligne soit à retoucher, ce qu'une liste écrite ici n'aurait pas fait.
   *
   * ⚠️ ET LA CONSTANTE N'EST LUE QUE PAR CETTE GARDE. Le registre des coutures
   *    l'inscrit `à-coudre` en écrivant que « son seul lecteur légitime est une
   *    garde, jamais un module de production » : c'en est une.
   */
  const nomsDecidesParLeSocle = Object.keys(STATUT_DES_CANAUX_DE_CONTEXTE);

  it("refuse CHACUN des noms que le socle décide, et jamais en silence", async () => {
    let nomsEprouves = 0;
    let refuses = 0;
    const servisMalgreTout: string[] = [];

    for (const nom of nomsDecidesParLeSocle) {
      const decor = monterEspion();
      await decor.serveur.absorber(
        ligneJsonRpc(1, "tools/call", { name: "bonjour.dire", [nom]: "valeur-de-l-appelant" }),
      );
      nomsEprouves += 1;

      const reponse = JSON.parse(decor.sortie[0]?.trimEnd() ?? "{}") as Record<string, unknown>;
      const erreur = reponse["error"] as { readonly code?: number } | undefined;
      if (erreur?.code === CODES_ENVELOPPE.parametresInvalides) refuses += 1;
      // Le noyau ne doit JAMAIS avoir été atteint : un refus qui laisserait
      // passer l'appel serait un refus décoratif.
      if (decor.identites.length > 0) servisMalgreTout.push(nom);
    }

    console.info(
      `[stdio · fermeture des paramètres] ${String(nomsEprouves)} nom(s) DÉRIVÉ(s) de ` +
        `STATUT_DES_CANAUX_DE_CONTEXTE éprouvé(s) : ${nomsDecidesParLeSocle.join(", ")} · ` +
        `${String(refuses)} refusé(s) en « paramètres invalides » · ` +
        `${String(servisMalgreTout.length)} servi(s) malgré tout` +
        (servisMalgreTout.length === 0 ? "" : ` : ${servisMalgreTout.join(", ")}`),
    );

    // Plancher-témoin : `ToolContext` porte neuf champs aujourd'hui ; si la
    // lecture rendait zéro nom, cette garde serait verte sans rien éprouver.
    expect(nomsEprouves).toBeGreaterThanOrEqual(8);
    expect(refuses).toBe(nomsEprouves);
    expect(servisMalgreTout).toEqual([]);
  });

  it("TÉMOIN — les cinq clés ADMISES, elles, passent : la fermeture n'est pas un mur", async () => {
    const decor = monterEspion();
    await decor.serveur.absorber(
      ligneJsonRpc(1, "tools/call", {
        name: "bonjour.dire",
        arguments: { ton: "neutre" },
        idempotencyKey: "cle-du-harnais",
        cursor: "curseur-du-harnais",
        confirmation: "jeton-du-harnais",
      }),
    );

    console.info(
      `[stdio · témoin admis] ${String(CLES_DE_PARAMETRES_DE_TOOLS_CALL.length)} clé(s) ` +
        `admise(s) déclarée(s) : ${CLES_DE_PARAMETRES_DE_TOOLS_CALL.join(", ")} · ` +
        `toutes soumises ensemble · ${String(decor.identites.length)} appel(s) parvenu(s) ` +
        `au noyau · ${String(decor.serveur.mesures().parametresRefuses)} paramètre(s) refusé(s)`,
    );

    // ⚠️ SANS CE TÉMOIN, LA GARDE D'À CÔTÉ SERAIT SATISFAITE PAR UN TRANSPORT QUI
    //    REFUSE TOUT. C'est le contraste qui rend son vert attribuable à la
    //    fermeture plutôt qu'à un refus général.
    expect(decor.identites).toHaveLength(1);
    expect(decor.serveur.mesures().parametresRefuses).toBe(0);
    expect(CLES_DE_PARAMETRES_DE_TOOLS_CALL).toHaveLength(5);
  });

  it("§ 20 — le jeton de confirmation reçu ne ressort par AUCUN canal, refus compris", async () => {
    const jeton = "jeton-de-confirmation-du-harnais-0123456789";
    const decor = fabriquerServeurDuHarnais();

    // Deux passes : un appel bien formé porteur du jeton, et un appel dont un
    // paramètre est refusé — c'est le second qui est le vrai risque, parce qu'un
    // message d'erreur qui recopie ce qu'il a reçu rend le jeton par le canal
    // d'erreur, que le § 20 interdit nommément.
    await decor.serveur.absorber(
      ligneJsonRpc(1, "tools/call", { name: OUTIL_BONJOUR.name, confirmation: jeton }) +
        ligneJsonRpc(2, "tools/call", {
          name: OUTIL_BONJOUR.name,
          confirmation: jeton,
          deadline: "2099-01-01T00:00:00.000Z",
        }),
    );

    const toutCeQuiEstSorti = decor.sortie.join("");

    console.info(
      `[stdio · § 20] ${String(decor.sortie.length)} réponse(s) écrite(s), ` +
        `${String(toutCeQuiEstSorti.length)} caractère(s) au total · ` +
        `jeton présent dans la sortie : ${String(toutCeQuiEstSorti.includes(jeton))} · ` +
        `${String(decor.serveur.mesures().parametresRefuses)} paramètre(s) refusé(s)`,
    );

    expect(decor.sortie.length).toBeGreaterThanOrEqual(2);
    expect(toutCeQuiEstSorti).not.toContain(jeton);
    expect(decor.serveur.mesures().parametresRefuses).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  4 · L'ENVELOPPE FAUTIVE NE FORME AUCUN APPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0032 — une enveloppe fautive est une erreur de PROTOCOLE, et n'écrit aucune ligne", () => {
  it("refuse méthode inconnue, `jsonrpc` absent et `params` en tableau, sans jamais atteindre le noyau", async () => {
    const decor = fabriquerServeurDuHarnais();

    await decor.serveur.absorber(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/list" })}\n` +
        `${JSON.stringify({ id: 2, method: "tools/list" })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: [1, 2] })}\n`,
    );

    const reponses = decor.reponses();
    const mesures = decor.serveur.mesures();
    const codes = reponses.map(
      (reponse) => (reponse["error"] as { readonly code?: number } | undefined)?.code,
    );

    console.info(
      `[stdio · enveloppes fautives] 3 enveloppe(s) soumise(s) · ` +
        `${String(mesures.enveloppesFautives)} refusée(s) · codes rendus : ${codes.join(", ")} · ` +
        `${String(mesures.appelsAuNoyau)} appel(s) au noyau · ` +
        `${String(decor.harnais.lignes().length)} ligne(s) d'ops_audit`,
    );

    expect(mesures.enveloppesFautives).toBe(3);
    expect(codes).toEqual([
      CODES_ENVELOPPE.methodeInconnue,
      CODES_ENVELOPPE.requeteInvalide,
      CODES_ENVELOPPE.parametresInvalides,
    ]);
    // ⚠️ AUCUN APPEL N'A ÉTÉ FORMÉ, DONC AUCUNE LIGNE N'EST DUE. L'invariant de
    //    sortie du § 11 lie les terminaisons de LA CHAÎNE ; il n'y a pas eu de
    //    chaîne. C'est une asymétrie assumée avec le transport HTTP, où les
    //    étapes 1 à 4 ont un NUMÉRO à inscrire — voir les écarts du lot.
    expect(mesures.appelsAuNoyau).toBe(0);
    expect(decor.harnais.lignes()).toHaveLength(0);
  });

  it("le nom de la méthode inconnue N'EST PAS renvoyé — un écho de chaîne libre en serait un", async () => {
    const decor = fabriquerServeurDuHarnais();
    const nomInvente = "chaine-libre-choisie-par-l-appelant/xyz";

    await decor.serveur.absorber(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: nomInvente })}\n`,
    );

    const sortie = decor.sortie.join("");

    console.info(
      `[stdio · aucun écho] 1 méthode inventée soumise (${String(nomInvente.length)} car.) · ` +
        `${String(sortie.length)} caractère(s) écrits · ` +
        `nom recopié : ${String(sortie.includes(nomInvente))}`,
    );

    expect(sortie).not.toContain(nomInvente);
    expect(sortie.length).toBeGreaterThan(0);
  });

  it("une NOTIFICATION ne reçoit aucune réponse — lui en écrire une désynchroniserait le client", async () => {
    const decor = fabriquerServeurDuHarnais();

    await decor.serveur.absorber(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", method: "resources/list" })}\n`,
    );

    const mesures = decor.serveur.mesures();

    console.info(
      `[stdio · notifications] 2 notification(s) soumise(s) (1 servie, 1 de méthode inconnue) · ` +
        `${String(mesures.notificationsRecues)} reçue(s) · ` +
        `${String(mesures.reponsesEcrites)} réponse(s) écrite(s) · ` +
        `${String(mesures.enveloppesFautives)} enveloppe(s) fautive(s) comptée(s)`,
    );

    expect(mesures.notificationsRecues).toBe(1);
    expect(mesures.enveloppesFautives).toBe(1);
    expect(mesures.reponsesEcrites).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  5 · L'ATTACHE AUX FLUX STANDARD
// ═════════════════════════════════════════════════════════════════════════════

/** Un double de flux d'entrée. Trois lignes — c'est tout ce que le type exige. */
function fluxDouble(): FluxDEntreeStdio & {
  emettre(morceau: string): void;
  codage(): string | null;
} {
  let ecouteur: ((morceau: string) => void) | null = null;
  let codage: string | null = null;
  return {
    setEncoding(valeur: "utf8"): unknown {
      codage = valeur;
      return undefined;
    },
    on(_evenement: "data", suite: (morceau: string) => void): unknown {
      ecouteur = suite;
      return undefined;
    },
    emettre(morceau: string): void {
      ecouteur?.(morceau);
    },
    codage: () => codage,
  };
}

describe("ADR 0032 — l'attache aux flux : les morceaux sont servis DANS L'ORDRE", () => {
  it("sert un flux d'entrée morceau par morceau et écrit sur le flux de sortie", async () => {
    const entree = fluxDouble();
    const ecrites: string[] = [];
    const sortie: FluxDeSortieStdio = {
      write(donnees: string): unknown {
        ecrites.push(donnees);
        return true;
      },
    };

    const decor = fabriquerServeurDuHarnais();
    const serveurSurFlux = creerServeurStdio({
      noyau: decor.harnais.noyau,
      catalogue: { listerPourCetAppel: () => Promise.resolve([]) },
      habilitations: () => HABILITATIONS_DU_HARNAIS,
      maintenant: () => INSTANT_DU_HARNAIS,
      ecrire: ecrireSurLeFlux(sortie),
    });
    const attache = brancherSurLesFlux(serveurSurFlux, entree);

    // ⚠️ LE FLUX EST COUPÉ AU MILIEU D'UNE LIGNE, exprès : c'est le cas réel, et
    //    c'est celui qui casse un transport qui croirait recevoir des messages.
    const ligne = ligneJsonRpc(1, "tools/call", {
      name: OUTIL_BONJOUR.name,
      arguments: { ton: "neutre" },
    });
    const coupure = Math.floor(ligne.length / 2);
    entree.emettre(ligne.slice(0, coupure));
    entree.emettre(ligne.slice(coupure));
    await attache.aQuai();

    console.info(
      `[stdio · attache] codage posé : ${attache.morceauxRecus() > 0 ? entree.codage() : "aucun"} · ` +
        `${String(attache.morceauxRecus())} morceau(x) reçu(s) (une ligne coupée en deux) · ` +
        `${String(attache.levees())} levée(s) · ${String(ecrites.length)} écriture(s) sur le ` +
        `flux de sortie · ${String(decor.harnais.lignes().length)} ligne(s) d'ops_audit`,
    );

    expect(entree.codage()).toBe("utf8");
    expect(attache.morceauxRecus()).toBe(2);
    expect(attache.levees()).toBe(0);
    expect(ecrites).toHaveLength(1);
    expect(ecrites[0]?.endsWith(DELIMITEUR_DE_LIGNE)).toBe(true);
    expect(decor.harnais.lignes()).toHaveLength(1);
  });

  it("SÉRIALISE : trois lignes émises d'un coup ressortent dans l'ordre où elles sont entrées", async () => {
    const entree = fluxDouble();
    const ecrites: string[] = [];
    const sortie: FluxDeSortieStdio = {
      write(donnees: string): unknown {
        ecrites.push(donnees);
        return true;
      },
    };

    // Un noyau dont la durée DÉCROÎT avec le rang : servi en parallèle, le
    // dernier appel répondrait le premier. C'est le témoin de la sérialisation.
    let rang = 0;
    const retards = [30, 20, 10];
    const serveurSurFlux = creerServeurStdio({
      noyau: (identite): Promise<ResultatAppel> => {
        const attente = retards[rang] ?? 0;
        rang += 1;
        return new Promise((_, rejeter) => {
          setTimeout(() => {
            rejeter(new Error(`espion ${identite.requestId}`));
          }, attente);
        });
      },
      catalogue: { listerPourCetAppel: () => Promise.resolve([]) },
      habilitations: () => HABILITATIONS_DU_HARNAIS,
      maintenant: () => INSTANT_DU_HARNAIS,
      ecrire: ecrireSurLeFlux(sortie),
    });
    const attache = brancherSurLesFlux(serveurSurFlux, entree);

    for (const identifiant of [1, 2, 3]) {
      entree.emettre(ligneJsonRpc(identifiant, "tools/call", { name: OUTIL_BONJOUR.name }));
    }
    await attache.aQuai();

    const ordre = ecrites.map(
      (ligne) => (JSON.parse(ligne.trimEnd()) as { readonly id?: number }).id,
    );

    console.info(
      `[stdio · sérialisation] 3 ligne(s) émise(s) d'affilée · retards du noyau : ` +
        `${retards.join(", ")} ms (DÉCROISSANTS) · ${String(attache.morceauxRecus())} morceau(x) ` +
        `reçu(s) · ordre des réponses écrites : ${ordre.join(", ")}`,
    );

    // ⚠️ SANS SÉRIALISATION, L'ORDRE SERAIT 3, 2, 1 — les retards sont choisis
    //    pour cela. C'est le seul témoin qui distingue une chaîne de promesses
    //    d'un `void absorber(...)` lâché dans la nature.
    expect(attache.morceauxRecus()).toBe(3);
    expect(ordre).toEqual([1, 2, 3]);
  });

  it("une levée pendant le service est COMPTÉE, et ne tue pas l'attache", async () => {
    const entree = fluxDouble();
    const sortie: FluxDeSortieStdio = {
      write(): unknown {
        throw new Error("le flux de sortie refuse d'écrire");
      },
    };

    const decor = fabriquerServeurDuHarnais();
    const serveurSurFlux = creerServeurStdio({
      noyau: decor.harnais.noyau,
      catalogue: { listerPourCetAppel: () => Promise.resolve([]) },
      habilitations: () => HABILITATIONS_DU_HARNAIS,
      maintenant: () => INSTANT_DU_HARNAIS,
      ecrire: ecrireSurLeFlux(sortie),
    });
    const attache = brancherSurLesFlux(serveurSurFlux, entree);

    entree.emettre(ligneJsonRpc(1, "tools/list"));
    entree.emettre(ligneJsonRpc(2, "tools/list"));
    await attache.aQuai();

    console.info(
      `[stdio · levée] flux de sortie qui refuse TOUTE écriture · ` +
        `${String(attache.morceauxRecus())} morceau(x) reçu(s) · ` +
        `${String(attache.levees())} levée(s) COMPTÉE(s) · ` +
        "l'attache est toujours vivante après la première",
    );

    // ⚠️ LE POINT : la SECONDE ligne est encore servie. Une attache qui mourrait
    //    sur la première levée transformerait un client maladroit en coupure du
    //    socle — et le § 30 rappelle qu'une instance stdio se coupe par une
    //    procédure dédiée, jamais par ce que quelqu'un envoie.
    expect(attache.morceauxRecus()).toBe(2);
    expect(attache.levees()).toBe(2);
  });
});
