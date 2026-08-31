import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep } from "../../types.js";
import { colonneDuTransport } from "../../chaine/orchestrateur.js";
import { SESSION_DE_CETTE_EXECUTION } from "../../chaine/identite.js";
import { empreinteDeCleDIdempotence } from "../../limits/index.js";

import {
  ErreurDeColonneDuTransport,
  confronterLesEtapesExercees,
  confronterLesImports,
  etapesDUneTrace,
  modulesInterditsAuTransport,
  resoudreDepuisLaRacine,
  verifierLaColonneDuTransport,
} from "./etapes-exercees.js";
import type { FichierDuTransport } from "./etapes-exercees.js";
import { TRANSPORT_STDIO } from "./serveur.js";
import {
  INSTANT_DU_HARNAIS,
  OUTIL_A_TEXTE_LIBRE,
  OUTIL_BONJOUR,
  OUTIL_ENVOI,
  fabriquerServeurDuHarnais,
  ligneJsonRpc,
} from "./fixtures.js";
import type { ReglagesDuHarnais } from "./fixtures.js";

/**
 * **LA GARDE DU LOT — UN TRANSPORT NE CONTOURNE AUCUNE ÉTAPE DU § 11.**
 *
 * ═══ CE QU'ELLE MESURE, EN TROIS TEMPS QUI NE SE RECOUVRENT PAS ═══
 *
 *  **A · LE GRAPHE D'IMPORTS.** Les fichiers LIVRÉS de `core/transport/stdio/`
 *  sont confrontés à un ensemble interdit **DÉRIVÉ d'`EXECUTANTS_ETAPES`**
 *  (ADR 0025, interdit n° 2). Témoin fabriqué : un transport auquel on ajoute un
 *  import de module d'étape doit produire exactement une infraction, qui le
 *  NOMME.
 *
 *  **B · LES ÉTAPES RÉELLEMENT EXERCÉES.** Onze appels RÉELS traversent le fil
 *  stdio — un par étape applicable —, et l'on confronte ce que la chaîne a
 *  franchi à ce que la colonne du § 11 attribue au transport. Témoins fabriqués
 *  dans les deux sens : une étape retirée fait rougir, une étape « HTTP seul »
 *  ajoutée fait rougir aussi.
 *
 *  **C · LE `stepDenied` DES LIGNES D'`ops_audit`.** La mesure la plus forte des
 *  trois, parce qu'elle ne lit ni un source ni une trace en mémoire mais **ce
 *  que le journal a réellement écrit**. Chaque étape applicable doit avoir
 *  REFUSÉ au moins une fois, et la ligne doit porter SON numéro.
 *
 * ⚠️ **POURQUOI B ET C NE SONT PAS LA MÊME MESURE, ET C'EST LE PIÈGE DE CE
 *    LOT.** Un SEUL appel réussi franchit les onze étapes applicables : la
 *    mesure B est donc verte au premier « bonjour », et un transport qui
 *    n'aurait jamais fait refuser personne la satisferait entièrement. Une garde
 *    de couverture qui s'arrêterait là serait verte pour la pire des raisons —
 *    elle mesurerait que la chaîne est PARCOURUE, jamais qu'elle DÉCIDE. C'est
 *    la mesure C qui exige que chaque étape ait mordu.
 */

const RACINE = new URL("../../../", import.meta.url);
const DOSSIER = "core/transport/stdio/";

// ═════════════════════════════════════════════════════════════════════════════
//  A · LE GRAPHE D'IMPORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les fichiers LIVRÉS de ce dossier.
 *
 * ⚠️ **LE CRITÈRE EST CELUI DU DÉPÔT, PAS UN SUFFIXE INVENTÉ ICI :** ce que
 *    `pnpm build` émet. `tsconfig.build.json` exclut `*.spec.ts` et tout
 *    `fixtures.ts` ; ce sont exactement les fichiers qui ne tournent pas en
 *    service, et donc les seuls dont un import de module d'étape serait sans
 *    conséquence. Les recopier ici aurait été une seconde source de vérité.
 */
function fichiersLivresDuTransport(): readonly FichierDuTransport[] {
  return readdirSync(fileURLToPath(new URL(DOSSIER, RACINE)))
    .filter((nom) => nom.endsWith(".ts"))
    .filter((nom) => !nom.endsWith(".spec.ts") && nom !== "fixtures.ts")
    .sort()
    .map((nom) => ({
      chemin: `${DOSSIER}${nom}`,
      source: readFileSync(fileURLToPath(new URL(`${DOSSIER}${nom}`, RACINE)), "utf8"),
    }));
}

describe("A · ADR 0025 — le transport stdio n'importe AUCUN module d'étape", () => {
  it("dérive l'ensemble interdit d'`EXECUTANTS_ETAPES`, et annonce ce qu'il a lu", () => {
    const interdit = modulesInterditsAuTransport();

    console.info(
      `[A · ensemble interdit] ${String(interdit.entreesLues)} entrée(s) d'EXECUTANTS_ETAPES ` +
        `lue(s) · ${String(interdit.entreesSansModule)} sans module nommé (les étapes « HTTP ` +
        `seul » du § 11) · ${String(interdit.modules.length)} module(s) interdit(s) dérivé(s) : ` +
        interdit.modules.join(", "),
    );

    // Planchers-témoins : un extracteur qui cesserait de mordre ferait tomber
    // le compte de modules à zéro, et la garde d'à côté serait verte sans rien
    // confronter.
    expect(interdit.entreesLues).toBe(APPEL_STEPS.length);
    expect(interdit.entreesSansModule).toBe(APPEL_STEPS.filter((etape) => etape.httpSeul).length);
    expect(interdit.modules.length).toBeGreaterThanOrEqual(8);
    // ⚠️ LE NOYAU N'EST PAS INTERDIT — c'est le chemin obligatoire du transport.
    expect(interdit.modules).not.toContain("core/chaine/orchestrateur.ts");
  });

  it("ne trouve AUCUNE infraction dans les fichiers livrés, et dit combien il en a lus", () => {
    const fichiers = fichiersLivresDuTransport();
    const interdit = modulesInterditsAuTransport();
    const rapport = confronterLesImports(fichiers, interdit.modules);

    console.info(
      `[A · graphe] ${String(rapport.fichiersLus)} fichier(s) LIVRÉ(s) balayé(s) : ` +
        `${fichiers.map((fichier) => fichier.chemin.slice(DOSSIER.length)).join(", ")} · ` +
        `${String(rapport.importsLus)} import(s) lu(s) dont ` +
        `${String(rapport.importsInternes)} interne(s) au dépôt · ` +
        `${String(rapport.modulesInterditsConfrontes)} module(s) interdit(s) confronté(s) · ` +
        `${String(rapport.infractions.length)} infraction(s)`,
    );

    // Planchers-témoins : un dossier déplacé ferait lire zéro fichier et zéro
    // import, et cette garde resterait verte sans un mot.
    expect(rapport.fichiersLus).toBeGreaterThanOrEqual(4);
    expect(rapport.importsInternes).toBeGreaterThanOrEqual(10);
    expect(rapport.modulesInterditsConfrontes).toBeGreaterThanOrEqual(8);
    expect(rapport.infractions).toEqual([]);
  });

  it("TÉMOIN — un transport qui importe un module d'étape produit UNE infraction qui le NOMME", () => {
    const interdit = modulesInterditsAuTransport();
    let mutilationsEprouvees = 0;
    let detectees = 0;
    const manquees: string[] = [];

    // ⚠️ UNE MUTILATION PAR MODULE INTERDIT, ET NON UNE SEULE. Un témoin unique
    //    ne prouverait la garde que sur le module choisi ; les huit autres
    //    pourraient cesser d'être confrontés sans qu'aucune couleur ne bouge.
    for (const module of interdit.modules) {
      const specificateurRelatif = `../../${module.slice("core/".length).replace(/\.ts$/, ".js")}`;
      const fabrique: FichierDuTransport = {
        chemin: `${DOSSIER}serveur.ts`,
        source:
          `import { quelqueChose } from "${specificateurRelatif}";\n` +
          "export const x = quelqueChose;\n",
      };
      mutilationsEprouvees += 1;
      const rapport = confronterLesImports([fabrique], interdit.modules);
      if (
        rapport.infractions.length === 1 &&
        rapport.infractions[0]?.includes(module.replace(/\.ts$/, ""))
      ) {
        detectees += 1;
      } else {
        manquees.push(module);
      }
    }

    console.info(
      `[A · témoin] ${String(mutilationsEprouvees)} mutilation(s) éprouvée(s) — une par module ` +
        `interdit · ${String(detectees)} détectée(s) · ${String(manquees.length)} manquée(s)` +
        (manquees.length === 0 ? "" : ` : ${manquees.join(", ")}`),
    );

    expect(mutilationsEprouvees).toBeGreaterThanOrEqual(8);
    expect(manquees).toEqual([]);
    expect(detectees).toBe(mutilationsEprouvees);
  });

  it("TÉMOIN — un import CITÉ EN COMMENTAIRE n'est pas un import, et un voisin homonyme non plus", () => {
    const interdit = modulesInterditsAuTransport();

    const enProse: FichierDuTransport = {
      chemin: `${DOSSIER}serveur.ts`,
      source:
        "/**\n * Ce module N'IMPORTE PAS `../../limits/index.js`, et le dit.\n */\n" +
        '// import { appliquerLimites } from "../../limits/index.js";\n' +
        'import { orchestrerAppel } from "../../chaine/orchestrateur.js";\n',
    };
    const homonyme: FichierDuTransport = {
      chemin: `${DOSSIER}serveur.ts`,
      source: 'import { x } from "../../limitsbis/index.js";\n',
    };

    const rapportProse = confronterLesImports([enProse], interdit.modules);
    const rapportHomonyme = confronterLesImports([homonyme], interdit.modules);

    console.info(
      `[A · faux positifs] prose : ${String(rapportProse.importsLus)} import(s) lu(s), ` +
        `${String(rapportProse.infractions.length)} infraction(s) · ` +
        `voisin homonyme « core/limitsbis » : ${String(rapportHomonyme.importsInternes)} ` +
        `import(s) interne(s), ${String(rapportHomonyme.infractions.length)} infraction(s)`,
    );

    // La citation en prose ne compte pas ; l'import réel du NOYAU non plus.
    expect(rapportProse.importsLus).toBe(1);
    expect(rapportProse.infractions).toEqual([]);
    // Et `core/limits` ne doit pas attraper `core/limitsbis` : la garde compare
    // des segments, pas des préfixes de texte.
    expect(rapportHomonyme.importsInternes).toBe(1);
    expect(rapportHomonyme.infractions).toEqual([]);
  });

  it("TÉMOIN — l'extension est NORMALISÉE : sans elle, la garde ne mordrait jamais", () => {
    // `nodenext` oblige à écrire `.js` pour atteindre un `.ts`. L'ensemble
    // interdit, lui, porte des `.ts`. Si la résolution ne normalisait pas
    // l'extension, AUCUNE infraction ne serait jamais trouvée — et le vert de la
    // garde précédente ne voudrait rien dire.
    const resolu = resoudreDepuisLaRacine(
      `${DOSSIER}serveur.ts`,
      "../../chaine/etape-14-execution.js",
    );

    console.info(
      `[A · normalisation] « ../../chaine/etape-14-execution.js » depuis ` +
        `« ${DOSSIER}serveur.ts » se résout en « ${resolu ?? "null"} » · ` +
        "l'ensemble interdit porte « core/chaine/etape-14-execution.ts »",
    );

    expect(resolu).toBe("core/chaine/etape-14-execution");
    // Un spécificateur de paquet n'est pas résolu : ce n'est pas un module du dépôt.
    expect(resoudreDepuisLaRacine(`${DOSSIER}serveur.ts`, "node:crypto")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B & C · LES ONZE APPELS RÉELS
// ═════════════════════════════════════════════════════════════════════════════

/** Un scénario de refus : ce qu'on règle, et l'étape qui DOIT refuser. */
interface ScenarioDeRefus {
  readonly cle: string;
  readonly attendue: AppelStep;
  readonly monter: () => ReturnType<typeof fabriquerServeurDuHarnais>;
  readonly params: Record<string, unknown>;
}

/** Une grosse charge, pour que l'étape 14 n'ait rien à compacter d'assez petit. */
const CHARGE_INCOMPACTABLE = {
  items: Array.from({ length: 60 }, (_, rang) => ({ id: `element-${String(rang)}` })),
  failedSources: [],
  sourceIncomplete: false,
  recordIds: [],
} as const;

function monter(
  reglages: ReglagesDuHarnais,
  options?: Parameters<typeof fabriquerServeurDuHarnais>[1],
): ReturnType<typeof fabriquerServeurDuHarnais> {
  return fabriquerServeurDuHarnais(reglages, options ?? {});
}

const SCENARIOS: readonly ScenarioDeRefus[] = [
  {
    cle: "coffre verrouillé (§ 23)",
    attendue: 0,
    monter: () => monter({ coffreFerme: true }),
    params: { name: OUTIL_BONJOUR.name },
  },
  {
    cle: "scope insuffisant pour l'`effect` épinglé (§ 19.2)",
    attendue: 5,
    // ⚠️ AUCUN SCOPE N'EST DÉCLARÉ : le défaut de stdio ne couvre AUCUN effet
    //    extérieur, et c'est précisément ce que `SCOPES_PAR_DEFAUT_STDIO` dérive.
    monter: () => monter({ outils: [OUTIL_ENVOI] }),
    params: { name: OUTIL_ENVOI.name },
  },
  {
    cle: "outil désactivé en console (§ 14)",
    attendue: 6,
    monter: () => monter({ outils: [{ ...OUTIL_BONJOUR, enabled: false }] }),
    params: { name: OUTIL_BONJOUR.name },
  },
  {
    cle: "outil absent du profil actif (§ 14)",
    attendue: 7,
    monter: () => monter({ outils: [{ ...OUTIL_BONJOUR, profiles: ["dev"] }] }),
    params: { name: OUTIL_BONJOUR.name },
  },
  {
    cle: "schéma d'entrée invalide — ne décompte aucun quota (§ 11)",
    attendue: 8,
    monter: () =>
      monter({ validation: { ok: false, champ: "ton", attendu: "« neutre » ou « chaleureux »" } }),
    params: { name: OUTIL_BONJOUR.name },
  },
  {
    cle: "curseur non authentique (§ 13.1)",
    attendue: 9,
    monter: () => monter({ outils: [{ ...OUTIL_BONJOUR, pagination: "keyset" }] }),
    params: { name: OUTIL_BONJOUR.name, cursor: "curseur-forge.0123456789abcdef" },
  },
  {
    cle: "politique : effet extérieur au niveau brouillon (§ 20)",
    attendue: 10,
    // Un poste local qui DOIT envoyer déclare ses scopes — c'est la seule façon
    // d'atteindre l'étape 10 sur un `send`, l'étape 5 refusant avant sinon.
    monter: () =>
      monter({ outils: [OUTIL_ENVOI] }, { scopes: ["ops:read", "ops:draft", "ops:send"] }),
    params: { name: OUTIL_ENVOI.name },
  },
  {
    cle: "provenance : argument libre après une lecture marquée ailleurs (§ 20)",
    attendue: 11,
    monter: () => {
      const decor = monter({ outils: [OUTIL_A_TEXTE_LIBRE] });
      // La session de CE processus a lu du `personal` chez un AUTRE domaine.
      decor.harnais.index.marquer(SESSION_DE_CETTE_EXECUTION, "ailleurs", ["empreinte-temoin"]);
      return decor;
    },
    params: { name: OUTIL_A_TEXTE_LIBRE.name, arguments: { note: "un texte libre" } },
  },
  {
    cle: "débit dépassé (§ 26)",
    attendue: 12,
    monter: () => {
      const decor = monter({});
      decor.harnais.quota.refuseTout = true;
      return decor;
    },
    params: { name: OUTIL_BONJOUR.name },
  },
  {
    cle: "clé d'idempotence réutilisée avec un autre `argHash` (§ 12)",
    attendue: 13,
    monter: () => {
      const decor = monter({
        reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      });
      decor.harnais.idempotence.poser({
        tool: OUTIL_BONJOUR.name,
        // ADR 0020 — `ops_idempotency.key` porte l'EMPREINTE, jamais la clé.
        key: empreinteDeCleDIdempotence("cle-du-temoin"),
        status: "in_flight",
        argHash: "f".repeat(64),
        resultRef: null,
        completedAt: null,
        expiresAt: new Date(INSTANT_DU_HARNAIS.getTime() + 60_000),
      });
      return decor;
    },
    params: { name: OUTIL_BONJOUR.name, idempotencyKey: "cle-du-temoin" },
  },
  {
    cle: "sortie incompactable (§ 13.3)",
    attendue: 14,
    monter: () =>
      monter({ outils: [{ ...OUTIL_BONJOUR, maxBytes: 16 }], charge: CHARGE_INCOMPACTABLE }),
    params: { name: OUTIL_BONJOUR.name },
  },
];

describe("C · § 11 — un refus À CHAQUE étape applicable, et la ligne porte SON numéro", () => {
  it("fait refuser les onze étapes par le FIL stdio, et lit le `stepDenied` du journal", async () => {
    const applicables = colonneDuTransport(TRANSPORT_STDIO).etapesApplicables;
    const refusRencontres: AppelStep[] = [];
    const desaccords: string[] = [];
    let scenariosJoues = 0;
    let lignesEcrites = 0;

    for (const scenario of SCENARIOS) {
      const decor = scenario.monter();
      await decor.serveur.absorber(ligneJsonRpc(1, "tools/call", scenario.params));
      scenariosJoues += 1;

      // ── L'INVARIANT DE SORTIE : exactement UNE ligne, et elle porte le numéro
      const lignes = decor.harnais.lignes();
      lignesEcrites += lignes.length;
      if (lignes.length !== 1) {
        desaccords.push(
          `${scenario.cle} : ${String(lignes.length)} ligne(s) d'ops_audit au lieu d'une`,
        );
        continue;
      }
      const ligne = lignes[0];
      if (ligne === undefined) continue;
      if (ligne.stepDenied !== scenario.attendue) {
        desaccords.push(
          `${scenario.cle} : stepDenied ${String(ligne.stepDenied)} au lieu de ` +
            String(scenario.attendue),
        );
        continue;
      }
      if (ligne.decision !== "refusé") {
        desaccords.push(`${scenario.cle} : decision « ${ligne.decision} » au lieu de « refusé »`);
        continue;
      }

      // ── ET LE FIL LE DIT AUSSI : `isError` et le rang, jamais un code de protocole
      const reponse = decor.reponses()[0];
      const resultat = reponse?.["result"] as
        { readonly isError?: boolean; readonly step?: number } | undefined;
      if (resultat?.isError !== true || resultat.step !== scenario.attendue) {
        desaccords.push(
          `${scenario.cle} : le fil rend isError=${String(resultat?.isError)} ` +
            `step=${String(resultat?.step)}`,
        );
        continue;
      }
      if (reponse?.["error"] !== undefined) {
        desaccords.push(`${scenario.cle} : un refus de la chaîne est sorti en ERREUR JSON-RPC`);
        continue;
      }

      refusRencontres.push(scenario.attendue);
    }

    const jamaisRefusees = applicables.filter((etape) => !refusRencontres.includes(etape));

    console.info(
      `[C · refus par étape] ${String(scenariosJoues)} scénario(s) joué(s) par le FIL stdio · ` +
        `${String(lignesEcrites)} ligne(s) d'ops_audit écrite(s) · ` +
        `${String(applicables.length)} étape(s) applicable(s) au transport « ${TRANSPORT_STDIO} » ` +
        `(${applicables.join(", ")}) · ${String(refusRencontres.length)} REFUS constaté(s) : ` +
        `${refusRencontres.join(", ")} · ${String(jamaisRefusees.length)} étape(s) qui n'ont ` +
        `jamais refusé${jamaisRefusees.length === 0 ? "" : ` : ${jamaisRefusees.join(", ")}`} · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers-témoins : une liste de scénarios vidée ferait zéro désaccord.
    expect(scenariosJoues).toBe(SCENARIOS.length);
    expect(scenariosJoues).toBeGreaterThanOrEqual(11);
    expect(lignesEcrites).toBe(scenariosJoues);
    expect(desaccords).toEqual([]);
    // ⚠️ LA MESURE QUI COMPTE : CHAQUE étape applicable a REFUSÉ au moins une
    //    fois. Un appel réussi les franchit toutes ; seul un refus prouve
    //    qu'elles décident.
    expect(jamaisRefusees).toEqual([]);
  });
});

describe("B · la couverture des étapes, confrontée à la colonne du § 11", () => {
  it("un serveur qui a servi des appels RÉELS couvre toute sa colonne, et l'annonce", async () => {
    const decor = fabriquerServeurDuHarnais();
    await decor.serveur.absorber(
      ligneJsonRpc(1, "tools/call", {
        name: OUTIL_BONJOUR.name,
        arguments: { ton: "neutre" },
      }),
    );

    const rapport = decor.serveur.rapportDeCouverture();
    const colonne = colonneDuTransport(TRANSPORT_STDIO);

    console.info(
      `[B · couverture] transport « ${rapport.transport} » · ` +
        `${String(rapport.appelsMesures)} appel(s) mesuré(s) · ` +
        `${String(rapport.applicables)} étape(s) applicable(s) · ` +
        `${String(rapport.exercees)} exercée(s) · ` +
        `${String(rapport.jamaisExercees.length)} jamais exercée(s) · ` +
        `${String(rapport.horsColonne.length)} hors colonne · ` +
        `${String(colonne.etapesNonApplicables.length)} étape(s) « HTTP seul » écartée(s) : ` +
        colonne.etapesNonApplicables.join(", "),
    );

    expect(rapport.appelsMesures).toBe(1);
    expect(rapport.applicables).toBe(colonne.etapesApplicables.length);
    expect(rapport.exercees).toBe(rapport.applicables);
    expect(rapport.anomalies).toEqual([]);
    // Les quatre étapes « HTTP seul » ne sont pas applicables ici, et le
    // transport n'en a exercé aucune.
    expect(colonne.etapesNonApplicables).toHaveLength(4);
  });

  it("TÉMOIN — une étape RETIRÉE fait rougir, une par une, et la garde la NOMME", () => {
    const applicables = colonneDuTransport(TRANSPORT_STDIO).etapesApplicables;
    let mutilationsEprouvees = 0;
    let detectees = 0;
    const manquees: AppelStep[] = [];

    for (const retiree of applicables) {
      const amputee = applicables.filter((etape) => etape !== retiree);
      const rapport = confronterLesEtapesExercees(TRANSPORT_STDIO, amputee, 1);
      mutilationsEprouvees += 1;
      const nomme = rapport.anomalies.some((ligne) =>
        ligne.startsWith(`étape ${String(retiree)} `),
      );
      if (rapport.jamaisExercees.length === 1 && nomme) detectees += 1;
      else manquees.push(retiree);
    }

    console.info(
      `[B · témoin, étape retirée] ${String(mutilationsEprouvees)} mutilation(s) éprouvée(s) — ` +
        `une par étape applicable · ${String(detectees)} détectée(s) · ` +
        `${String(manquees.length)} manquée(s)` +
        (manquees.length === 0 ? "" : ` : ${manquees.join(", ")}`),
    );

    expect(mutilationsEprouvees).toBeGreaterThanOrEqual(11);
    expect(manquees).toEqual([]);
  });

  it("TÉMOIN — une étape « HTTP seul » exercée en stdio fait rougir AUSSI, dans l'autre sens", () => {
    const applicables = colonneDuTransport(TRANSPORT_STDIO).etapesApplicables;
    const httpSeules = colonneDuTransport(TRANSPORT_STDIO).etapesNonApplicables;
    let mutilationsEprouvees = 0;
    let detectees = 0;

    for (const enTrop of httpSeules) {
      const rapport = confronterLesEtapesExercees(TRANSPORT_STDIO, [...applicables, enTrop], 1);
      mutilationsEprouvees += 1;
      if (
        rapport.horsColonne.length === 1 &&
        rapport.horsColonne[0] === enTrop &&
        rapport.anomalies.length === 1
      ) {
        detectees += 1;
      }
    }

    console.info(
      `[B · témoin, étape en trop] ${String(mutilationsEprouvees)} mutilation(s) éprouvée(s) — ` +
        `une par étape « HTTP seul » (${httpSeules.join(", ")}) · ` +
        `${String(detectees)} détectée(s) · ` +
        "⚠️ c'est le sens qu'on oublie : une garde rejouée hors de son lieu",
    );

    expect(mutilationsEprouvees).toBe(4);
    expect(detectees).toBe(mutilationsEprouvees);
  });

  it("TÉMOIN — un verdict rendu sur ZÉRO appel est une anomalie, même si la liste est complète", () => {
    const applicables = colonneDuTransport(TRANSPORT_STDIO).etapesApplicables;
    const surZero = confronterLesEtapesExercees(TRANSPORT_STDIO, applicables, 0);
    const surUn = confronterLesEtapesExercees(TRANSPORT_STDIO, applicables, 1);

    console.info(
      `[B · témoin, zéro appel] liste d'étapes IDENTIQUE et complète dans les deux cas · ` +
        `sur 0 appel : ${String(surZero.anomalies.length)} anomalie(s) · ` +
        `sur 1 appel : ${String(surUn.anomalies.length)} anomalie(s)`,
    );

    // ⚠️ SANS CE CONTRÔLE, UNE LISTE D'ÉTAPES FABRIQUÉE À LA MAIN SATISFERAIT LA
    //    GARDE SANS QU'UN SEUL APPEL AIT TRAVERSÉ LE SOCLE.
    expect(surZero.anomalies).toHaveLength(1);
    expect(surUn.anomalies).toEqual([]);
  });

  it("la projection d'une trace compte l'étape qui a REFUSÉ, pas seulement les franchies", () => {
    const vues = etapesDUneTrace({
      etapesFranchies: [0, 5],
      etapeRefusante: 6,
      etapesAmont: [],
    });

    console.info(
      `[B · projection] 2 étape(s) franchie(s), 1 refusante, 0 en amont · ` +
        `${String(vues.length)} étape(s) projetée(s) : ${vues.join(", ")}`,
    );

    expect(vues).toEqual([0, 5, 6]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  D · LE CONTRÔLE DE MONTAGE
// ═════════════════════════════════════════════════════════════════════════════

describe("D · ADR 0025 — la colonne est confrontée AU MONTAGE, pas seulement en test", () => {
  it("accepte la déclaration réelle du transport stdio — aucune étape prise en charge", () => {
    const amont = colonneDuTransport(TRANSPORT_STDIO).etapesAmont;
    let leve = 0;
    try {
      verifierLaColonneDuTransport(TRANSPORT_STDIO, []);
    } catch {
      leve += 1;
    }

    console.info(
      `[D · montage] colonne « ${TRANSPORT_STDIO} » : ${String(amont.length)} étape(s) en ` +
        `amont · déclaration du transport : 0 étape prise en charge · ${String(leve)} levée(s)`,
    );

    expect(amont).toEqual([]);
    expect(leve).toBe(0);
  });

  it("TÉMOIN — déclarer prendre en charge une étape « HTTP seul » fait LEVER au montage", () => {
    const httpSeules = colonneDuTransport(TRANSPORT_STDIO).etapesNonApplicables;
    let mutilationsEprouvees = 0;
    let detectees = 0;

    for (const etape of httpSeules) {
      mutilationsEprouvees += 1;
      try {
        verifierLaColonneDuTransport(TRANSPORT_STDIO, [etape]);
      } catch (erreur: unknown) {
        if (erreur instanceof ErreurDeColonneDuTransport && erreur.enTrop.includes(etape)) {
          detectees += 1;
        }
      }
    }

    console.info(
      `[D · témoin] ${String(mutilationsEprouvees)} déclaration(s) fautive(s) éprouvée(s) — ` +
        `une par étape « HTTP seul » · ${String(detectees)} refusée(s) au montage · ` +
        "⚠️ ce contrôle paraît tautologique aujourd'hui (les deux ensembles sont vides) : " +
        "ce témoin est ce qui prouve qu'il mordrait",
    );

    expect(mutilationsEprouvees).toBe(4);
    expect(detectees).toBe(mutilationsEprouvees);
  });
});
