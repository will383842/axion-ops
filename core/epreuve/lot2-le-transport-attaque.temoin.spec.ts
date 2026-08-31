/**
 * `core/epreuve/lot2-le-transport-attaque.temoin.spec.ts` — **LA SURFACE NEUVE,
 * ATTAQUÉE PAR SA COUTURE : LES DEUX TRANSPORTS SUR LA MÊME ENTRÉE.**
 *
 * ═══ CE QUE CE FICHIER FAIT, ET POURQUOI DANS CET ORDRE ═══
 *
 * L'ADR 0025 s'intitule « deux transports, un seul noyau ». Elle ferme le
 * contournement par trois interdits de CONSTRUCTION — pas d'identité fabriquée,
 * pas d'import d'étape, couverture vérifiée au démarrage — et ces trois-là
 * tiennent : ce fichier les a essayés et ne les a pas franchis (voir la famille
 * C, en `it()` ordinaire).
 *
 * Mais aucun des trois ne regarde **l'enveloppe**. Ils garantissent que les deux
 * transports appellent le MÊME noyau ; ils ne garantissent nulle part qu'ils lui
 * remettent le MÊME appel, ni qu'ils rendent la même chose de la même décision.
 * C'est la fente de ce lot, et c'est par là que ce fichier entre.
 *
 * La méthode est donc **différentielle** : une seule enveloppe JSON-RPC, écrite
 * une fois, poussée dans les DEUX transports montés sur un noyau ESPION
 * identique, et l'on confronte ce que chacun a remis au noyau et ce que chacun a
 * écrit sur le fil. Une divergence n'a pas besoin d'être interprétée : les deux
 * transports ne peuvent pas avoir raison ensemble.
 *
 * ═══ L'IDIOME, ET LA DISCIPLINE QU'IL IMPOSE ═══
 *
 * Chaque témoin marqué 🔴 porte l'assertion CORRECTE — celle de l'ADR ou du
 * cahier des charges — sous `it.fails`. Il est vert AUJOURD'HUI parce qu'elle
 * échoue, et il ROUGIRA le jour du correctif, forçant celui qui corrige à le
 * repasser en `it()`.
 *
 * ⚠️ CONSÉQUENCE STRICTE : un `it.fails` est vert dès qu'UNE de ses assertions
 *    échoue, POUR N'IMPORTE QUELLE RAISON — un import cassé compris. Le PLANCHER
 *    (`P0`) ouvre donc le fichier en `it()` ordinaire : sans lui, une régression
 *    d'import rendrait tous les `it.fails` verts et ce fichier annoncerait des
 *    défauts qu'il n'aurait pas mesurés.
 *
 * Chaque `it` ANNONCE COMBIEN D'ÉLÉMENTS IL A MESURÉS, et le compte est
 * incrémenté DANS la boucle ou lu sur le sujet — jamais rendu de confiance
 * depuis la longueur d'un tableau écrit à la main.
 *
 * ═══ DÉPÔT PUBLIC ═══
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU — pas même une écoute sur la boucle
 * locale : `TransportHttp.traiter()` rend une `ReponseHttp` sans socket, et
 * c'est ce qui rend cette épreuve possible sans ouvrir quoi que ce soit. Aucun
 * identifiant d'infrastructure, aucune donnée personnelle. Toutes les valeurs
 * viennent des fixtures du transport, sur `stub.invalid` (RFC 2606).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AppelEntrant, IdentiteAppelante, ResultatAppel } from "../chaine/orchestrateur.js";
import type { NoyauUnique } from "../transport/contrat.js";
import {
  AUDIENCE_DE_TEMOIN,
  HABILITATIONS_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PONT_DE_TEMOIN,
  PRINCIPAL_DE_TEMOIN,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  requeteDeTemoin,
  resultatDeRefus,
  resultatDeSucces,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "../transport/http/fixtures.js";
import { creerTransportHttp } from "../transport/http/transport.js";
import type { TraitementHttp, TransportHttp } from "../transport/http/transport.js";
import { LONGUEUR_MINIMALE_CONFRONTEE } from "../transport/http/reponse.js";
import { creerServeurStdio } from "../transport/stdio/serveur.js";
import type { CatalogueServiEnStdio, ServeurStdio } from "../transport/stdio/serveur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE HARNAIS DIFFÉRENTIEL
// ═════════════════════════════════════════════════════════════════════════════

/** L'instant de référence. Figé : la `deadline` doit être MESURABLE, pas devinée. */
const INSTANT = new Date("2026-09-01T09:00:00.000Z");

/** Le budget d'appel de l'épreuve. Aucune valeur réelle : un entier quelconque. */
const BUDGET_MS = 30_000;

/** Le nom d'outil de l'épreuve. Il ne désigne aucun adaptateur réel. */
const OUTIL = "epreuve.outil.lire";

/** Ce qu'un noyau espion a vu passer. */
interface AppelObserve {
  readonly identite: IdentiteAppelante;
  readonly appel: AppelEntrant;
}

interface NoyauEspion {
  readonly noyau: NoyauUnique;
  readonly observes: readonly AppelObserve[];
}

/**
 * UN NOYAU QUI ENREGISTRE CE QU'ON LUI REMET.
 *
 * ⚠️ **C'EST L'INSTRUMENT CENTRAL DE CE FICHIER.** La question posée n'est pas
 *    « la réponse est-elle correcte ? » mais « les deux transports remettent-ils
 *    LA MÊME CHOSE au noyau ? ». Un double qui n'enregistre pas ne peut rien
 *    dire de cette question-là.
 */
function noyauEspion(reponse: (appel: AppelEntrant) => ResultatAppel): NoyauEspion {
  const observes: AppelObserve[] = [];
  return {
    observes,
    noyau: (identite, appel): Promise<ResultatAppel> => {
      const entrant = appel as AppelEntrant;
      observes.push({ identite, appel: entrant });
      return Promise.resolve(reponse(entrant));
    },
  };
}

/** La réponse par défaut du noyau espion : un succès à charge fixe. */
const SUCCES_NEUTRE = (): ResultatAppel => resultatDeSucces({ servi: true });

/** Monte le transport HTTP sur un noyau donné, avec des jetons de démonstration. */
function transportHttpDEpreuve(noyau: NoyauUnique): TransportHttp {
  return creerTransportHttp(
    { hotesAdmis: [HOTE_DE_TEMOIN], audienceAttendue: AUDIENCE_DE_TEMOIN, budgetMs: BUDGET_MS },
    {
      verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      pontDIdentite: PONT_DE_TEMOIN,
      noyau,
      maintenant: () => INSTANT,
    },
  );
}

/** Un catalogue stdio vide : ce fichier n'éprouve pas `tools/list` pour lui-même. */
const CATALOGUE_VIDE: CatalogueServiEnStdio = {
  listerPourCetAppel: () => Promise.resolve([]),
};

/** Monte le démon stdio sur un noyau donné, et rend ce qu'il écrit. */
function serveurStdioDEpreuve(noyau: NoyauUnique): {
  readonly serveur: ServeurStdio;
  readonly sortie: string[];
} {
  const sortie: string[] = [];
  const serveur = creerServeurStdio({
    noyau,
    catalogue: CATALOGUE_VIDE,
    habilitations: () => HABILITATIONS_DE_TEMOIN,
    maintenant: () => INSTANT,
    ecrire: (ligne) => sortie.push(ligne),
    budgetMs: BUDGET_MS,
  });
  return { serveur, sortie };
}

/** Ce qu'une confrontation rend, pour chaque transport. */
interface Confrontation {
  readonly http: {
    readonly traitement: TraitementHttp;
    readonly observes: readonly AppelObserve[];
    readonly corps: Record<string, unknown>;
  };
  readonly stdio: {
    readonly observes: readonly AppelObserve[];
    readonly sortie: readonly string[];
    readonly reponses: readonly Record<string, unknown>[];
  };
}

/**
 * POUSSE **UNE SEULE** ENVELOPPE DANS LES DEUX TRANSPORTS.
 *
 * ⚠️ **L'ENVELOPPE EST ÉCRITE UNE FOIS, ET SÉRIALISÉE UNE FOIS.** Deux corps
 *    construits séparément — un « pour HTTP », un « pour stdio » — auraient fait
 *    mesurer une différence que l'épreuve aurait elle-même introduite. Ici, les
 *    octets sont littéralement les mêmes ; toute divergence appartient au socle.
 */
async function auxDeuxTransports(
  enveloppe: Readonly<Record<string, unknown>>,
  reponse: (appel: AppelEntrant) => ResultatAppel = SUCCES_NEUTRE,
): Promise<Confrontation> {
  const corps = JSON.stringify(enveloppe);

  const espionHttp = noyauEspion(reponse);
  const traitement = await transportHttpDEpreuve(espionHttp.noyau).traiter(
    requeteDeTemoin({ corps }),
  );

  const espionStdio = noyauEspion(reponse);
  const { serveur, sortie } = serveurStdioDEpreuve(espionStdio.noyau);
  await serveur.absorber(`${corps}\n`);

  return {
    http: {
      traitement,
      observes: espionHttp.observes,
      corps: JSON.parse(traitement.reponse.corps) as Record<string, unknown>,
    },
    stdio: {
      observes: espionStdio.observes,
      sortie,
      reponses: sortie.map((ligne) => JSON.parse(ligne.trimEnd()) as Record<string, unknown>),
    },
  };
}

/** Une enveloppe `tools/call` bien formée, dont on choisit les `params` et l'`id`. */
function enveloppe(
  params: Readonly<Record<string, unknown>>,
  id: unknown = "e-1",
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method: "tools/call", params };
}

/**
 * LA MÊME ENVELOPPE, **SANS CHAMP `id`**.
 *
 * ⚠️ ELLE A SA PROPRE FONCTION, ET C'EST NÉCESSAIRE. Passer `undefined` à
 *    {@link enveloppe} déclenche sa valeur PAR DÉFAUT : le témoin aurait alors
 *    mesuré une enveloppe parfaitement identifiée en croyant mesurer une
 *    notification, et il serait passé — vert pour rien.
 */
function enveloppeSansId(params: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { jsonrpc: "2.0", method: "tools/call", params };
}

// ═════════════════════════════════════════════════════════════════════════════
//  P0 — LE PLANCHER
// ═════════════════════════════════════════════════════════════════════════════

describe("P0 — le plancher : les deux transports sont montés et atteignent le noyau", () => {
  it("mène la MÊME enveloppe canonique au noyau, des deux côtés", async () => {
    const vu = await auxDeuxTransports(enveloppe({ name: OUTIL, arguments: {} }));

    let cotesMesures = 0;
    for (const observes of [vu.http.observes, vu.stdio.observes]) {
      cotesMesures += 1;
      expect(observes).toHaveLength(1);
      expect(observes[0]?.appel.nomComplet).toBe(OUTIL);
    }

    // Sans ce plancher, un import cassé rendrait TOUS les `it.fails` de ce
    // fichier verts, et il annoncerait des défauts qu'il n'aurait pas mesurés.
    expect(cotesMesures).toBe(2);
    console.log(
      `[P0] ${String(cotesMesures)} transport(s) monté(s) et atteint(s) · ` +
        `HTTP statut ${String(vu.http.traitement.reponse.statut)} · ` +
        `stdio ${String(vu.stdio.sortie.length)} réponse(s) écrite(s)`,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  A — LA DIVERGENCE DES DEUX ENVELOPPES : LE MÊME CORPS, DEUX APPELS
// ═════════════════════════════════════════════════════════════════════════════

describe("A — le même corps JSON-RPC ne produit pas le même appel", () => {
  /** Une clé d'idempotence de démonstration. Longue, pour être distinguable. */
  const CLE = "cle-d-idempotence-de-l-epreuve-0001";

  it("CAPACITÉ — l'instrument LIT bien la clé, dans le dialecte de chaque transport", async () => {
    // ⚠️ IL FAUT DEUX CORPS DISTINCTS, ET C'EST DÉJÀ LE CONSTAT. Il n'existe
    //    AUCUNE enveloppe que les deux transports lisent de la même façon : la
    //    forme que HTTP exige (`params._meta["ops/idempotencyKey"]`) est une clé
    //    étrangère que la fermeture de stdio REFUSE, et la forme que stdio exige
    //    (`params.idempotencyKey`) est silencieusement ignorée par HTTP. Ce
    //    témoin sert donc uniquement à prouver que l'instrument SAIT VOIR une
    //    clé quand elle est là — sans quoi les 🔴 qui suivent ne vaudraient rien.
    let lectures = 0;

    const espionHttp = noyauEspion(SUCCES_NEUTRE);
    await transportHttpDEpreuve(espionHttp.noyau).traiter(
      requeteDeTemoin({
        corps: JSON.stringify(
          enveloppe({
            name: OUTIL,
            arguments: {},
            _meta: { "ops/idempotencyKey": CLE },
          }),
        ),
      }),
    );
    lectures += 1;
    expect(espionHttp.observes[0]?.appel.idempotencyKey).toBe(CLE);

    const espionStdio = noyauEspion(SUCCES_NEUTRE);
    const { serveur } = serveurStdioDEpreuve(espionStdio.noyau);
    await serveur.absorber(
      `${JSON.stringify(enveloppe({ name: OUTIL, arguments: {}, idempotencyKey: CLE }))}
`,
    );
    lectures += 1;
    expect(espionStdio.observes[0]?.appel.idempotencyKey).toBe(CLE);

    expect(lectures).toBe(2);
    console.log(
      `[A, capacité] ${String(lectures)} dialecte(s) confronté(s) · ` +
        "chacun lit SA forme · aucun corps commun aux deux",
    );
  });

  it.fails(
    "🔴 A1 — la clé d'idempotence écrite comme stdio l'exige DISPARAÎT en HTTP, sans un mot",
    async () => {
      const vu = await auxDeuxTransports(
        enveloppe({ name: OUTIL, arguments: {}, idempotencyKey: CLE }),
      );

      const cleHttp = vu.http.observes[0]?.appel.idempotencyKey ?? null;
      const cleStdio = vu.stdio.observes[0]?.appel.idempotencyKey ?? null;

      console.log(
        `[A1] 1 corps · clé remise au noyau — HTTP : ${String(cleHttp)} · ` +
          `stdio : ${String(cleStdio)}`,
      );

      // L'ASSERTION CORRECTE : un seul noyau, donc un seul appel. Aujourd'hui
      // HTTP rend `null` — l'étape 13 ne protège RIEN, et rien ne le dit.
      expect(cleHttp).toBe(cleStdio);
    },
  );

  it.fails(
    "🔴 A2 — une clé inconnue au premier niveau de `params` : stdio REFUSE, HTTP l'ignore et sert",
    async () => {
      const vu = await auxDeuxTransports(
        enveloppe({ name: OUTIL, arguments: {}, sessionId: "valeur-glissee-par-l-appelant" }),
      );

      const appelsHttp = vu.http.observes.length;
      const appelsStdio = vu.stdio.observes.length;
      console.log(
        `[A2] 1 clé étrangère · appels au noyau — HTTP : ${String(appelsHttp)} · ` +
          `stdio : ${String(appelsStdio)}`,
      );

      // L'ASSERTION CORRECTE : « REFUSER, ET NON IGNORER » (ADR 0032, § 3). Les
      // deux transports doivent trancher pareil — refuser tous les deux, ou
      // servir tous les deux. Aujourd'hui : 1 contre 0.
      expect(appelsHttp).toBe(appelsStdio);
    },
  );

  it.fails(
    "🔴 A3 — la divergence est SYMÉTRIQUE : `_meta` passe en HTTP, refusé en stdio",
    async () => {
      const vu = await auxDeuxTransports(
        enveloppe({ name: OUTIL, arguments: {}, _meta: { "ops/cursor": "curseur-de-l-epreuve" } }),
      );
      console.log(
        `[A3] 1 corps · appels au noyau — HTTP : ${String(vu.http.observes.length)} · ` +
          `stdio : ${String(vu.stdio.observes.length)}`,
      );
      expect(vu.http.observes.length).toBe(vu.stdio.observes.length);
    },
  );

  it.fails("🔴 A4 — `arguments` absent : `undefined` en HTTP, `{}` en stdio", async () => {
    const vu = await auxDeuxTransports(enveloppe({ name: OUTIL }));

    const entreeHttp = vu.http.observes[0]?.appel.input;
    const entreeStdio = vu.stdio.observes[0]?.appel.input;
    console.log(
      `[A4] 1 corps · charge remise à l'étape 8 — HTTP : ${String(typeof entreeHttp)} · ` +
        `stdio : ${String(typeof entreeStdio)}`,
    );
    // L'étape 8 valide cette charge contre un schéma FERMÉ. `undefined` et `{}`
    // n'y sont pas la même valeur : le refus dépend du transport.
    expect(entreeHttp).toEqual(entreeStdio);
  });

  it.fails(
    "🔴 A5 — un `tools/call` SANS `id` : stdio n'appelle rien, HTTP exécute l'outil",
    async () => {
      const vu = await auxDeuxTransports(enveloppeSansId({ name: OUTIL, arguments: {} }));
      console.log(
        `[A5] 1 notification · appels au noyau — HTTP : ${String(vu.http.observes.length)} · ` +
          `stdio : ${String(vu.stdio.observes.length)} · ` +
          `réponses écrites — stdio : ${String(vu.stdio.sortie.length)}`,
      );
      // Un outil à effet extérieur PART en HTTP sur une enveloppe que stdio
      // refuse d'exécuter. C'est la même primitive, le même noyau.
      expect(vu.http.observes.length).toBe(vu.stdio.observes.length);
    },
  );

  it.fails(
    "🔴 A6 — un `id` non entier : stdio avale la requête EN SILENCE, sans réponse",
    async () => {
      const vu = await auxDeuxTransports(enveloppe({ name: OUTIL, arguments: {} }, 1.5));
      console.log(
        `[A6] 1 requête à « id » fractionnaire · appels au noyau — ` +
          `HTTP : ${String(vu.http.observes.length)} · stdio : ${String(vu.stdio.observes.length)} · ` +
          `réponses écrites — stdio : ${String(vu.stdio.sortie.length)}`,
      );
      // Une requête PORTAIT un `id` : le client attend une réponse. stdio la lit
      // comme une notification et n'écrit rien — le client reste en attente.
      expect(vu.stdio.sortie.length).toBe(1);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  B — LA FORME D'UN REFUS, ET CE QUE LA RÉPONSE PUBLIE
// ═════════════════════════════════════════════════════════════════════════════

describe("B — un refus de la chaîne, et ce que chaque transport en fait", () => {
  /** Le refus de démonstration : étape 10, code du § 15, message sans valeur reçue. */
  const REFUS = (): ResultatAppel =>
    resultatDeRefus(10, "policy_denied", "La politique refuse cet appel.");

  it("CAPACITÉ — l'instrument voit bien un refus des DEUX côtés", async () => {
    const vu = await auxDeuxTransports(enveloppe({ name: OUTIL, arguments: {} }), REFUS);
    let cotes = 0;
    for (const observes of [vu.http.observes, vu.stdio.observes]) {
      cotes += 1;
      expect(observes).toHaveLength(1);
    }
    expect(cotes).toBe(2);
    console.log(
      `[B, capacité] ${String(cotes)} refus servi(s) · ` +
        `HTTP clés de corps : ${Object.keys(vu.http.corps).join(", ")} · ` +
        `stdio clés de corps : ${Object.keys(vu.stdio.reponses[0] ?? {}).join(", ")}`,
    );
  });

  it.fails(
    "🔴 B1 — ADR 0032 : un refus de la chaîne est un RÉSULTAT ; HTTP en fait une erreur de protocole",
    async () => {
      const vu = await auxDeuxTransports(enveloppe({ name: OUTIL, arguments: {} }), REFUS);

      const stdioReponse = vu.stdio.reponses[0] ?? {};
      let formesConfrontees = 0;
      formesConfrontees += 1;
      const stdioPorteUnResultat = "result" in stdioReponse;
      formesConfrontees += 1;
      const httpPorteUnResultat = "result" in vu.http.corps;

      console.log(
        `[B1] ${String(formesConfrontees)} forme(s) confrontée(s) · ` +
          `stdio rend un « result » : ${String(stdioPorteUnResultat)} · ` +
          `HTTP rend un « result » : ${String(httpPorteUnResultat)} · ` +
          `HTTP rend un « error » : ${String("error" in vu.http.corps)}`,
      );

      // L'ASSERTION CORRECTE, ADR 0032 § 2 : « un `-32603` sur un refus
      // d'étape 10 […] rendrait un refus d'autorisation indiscernable d'une
      // enveloppe malformée pour quiconque lit le fil ». Ce que l'ADR refuse
      // pour stdio, HTTP le fait — sur un code `-32000`, même famille.
      expect(httpPorteUnResultat).toBe(stdioPorteUnResultat);
    },
  );

  it.fails(
    "🔴 B2 — HTTP publie sur le fil ce que stdio retire NOMMÉMENT : `requestId`, `seq`, étapes",
    async () => {
      const vu = await auxDeuxTransports(enveloppe({ name: OUTIL, arguments: {} }));

      const resultat = vu.http.corps["result"] as Record<string, unknown> | undefined;
      const meta = (resultat?.["_meta"] ?? {}) as Record<string, unknown>;
      let clesLues = 0;
      const publiees: string[] = [];
      for (const cle of Object.keys(meta)) {
        clesLues += 1;
        publiees.push(cle);
      }

      const stdioResultat = (vu.stdio.reponses[0]?.["result"] ?? {}) as Record<string, unknown>;
      const stdioMeta = Object.keys(stdioResultat).filter((cle) => cle.startsWith("ops/"));

      console.log(
        `[B2] ${String(clesLues)} clé(s) de service publiée(s) par HTTP : ${publiees.join(", ")} · ` +
          `par stdio : ${String(stdioMeta.length)}`,
      );

      // L'ASSERTION CORRECTE, écrite par stdio lui-même : « l'`id` de
      // corrélation rendu est celui de l'enveloppe, pas le `requestId` frappé :
      // ce dernier vit dans le `ctx` et dans les journaux du socle, et le
      // publier sur le fil rendrait à l'appelant une valeur qu'on vient de lui
      // retirer ». Et `ops/seq` est le rang du journal GLOBAL : il dit à un
      // appelant sans `peutVoirAppels` combien d'appels le socle a servis, tous
      // principaux confondus.
      expect(publiees).toEqual(stdioMeta);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  C — L'AMONT : CE QUI TIENT, MESURÉ PLUTÔT QUE SUPPOSÉ
// ═════════════════════════════════════════════════════════════════════════════

describe("C — les étapes 1 à 4, attaquées : elles tiennent, et voici le compte", () => {
  it("refuse quatre attaques d'amont SANS jamais lire le corps", async () => {
    const corps = JSON.stringify(enveloppe({ name: OUTIL, arguments: {} }));

    /** Chaque attaque est FABRIQUÉE ici, et nomme la seule chose qu'elle change. */
    const attaques: ReadonlyArray<{
      readonly nom: string;
      readonly monter: () => TransportHttp;
      readonly requete: () => ReturnType<typeof requeteDeTemoin>;
    }> = [
      {
        nom: "Host falsifié",
        monter: () => transportHttpDEpreuve(noyauEspion(SUCCES_NEUTRE).noyau),
        requete: () => requeteDeTemoin({ corps, hote: "hote-falsifie.stub.invalid" }),
      },
      {
        nom: "jeton refusé par l'émetteur",
        monter: () =>
          creerTransportHttp(
            {
              hotesAdmis: [HOTE_DE_TEMOIN],
              audienceAttendue: AUDIENCE_DE_TEMOIN,
              budgetMs: BUDGET_MS,
            },
            {
              verificateurDeJeton: verificateurDeTemoin(null),
              registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
              pontDIdentite: PONT_DE_TEMOIN,
              noyau: noyauEspion(SUCCES_NEUTRE).noyau,
              maintenant: () => INSTANT,
            },
          ),
        requete: () => requeteDeTemoin({ corps }),
      },
      {
        nom: "jeton d'une AUTRE audience",
        monter: () =>
          creerTransportHttp(
            {
              hotesAdmis: [HOTE_DE_TEMOIN],
              audienceAttendue: AUDIENCE_DE_TEMOIN,
              budgetMs: BUDGET_MS,
            },
            {
              verificateurDeJeton: verificateurDeTemoin(
                revendicationsDeTemoin({ audience: "https://autre.stub.invalid/api/mcp" }),
              ),
              registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
              pontDIdentite: PONT_DE_TEMOIN,
              noyau: noyauEspion(SUCCES_NEUTRE).noyau,
              maintenant: () => INSTANT,
            },
          ),
        requete: () => requeteDeTemoin({ corps }),
      },
      {
        nom: "jti révoqué ou inconnu",
        monter: () =>
          creerTransportHttp(
            {
              hotesAdmis: [HOTE_DE_TEMOIN],
              audienceAttendue: AUDIENCE_DE_TEMOIN,
              budgetMs: BUDGET_MS,
            },
            {
              verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
              registreDesJetons: registreDeTemoin(null),
              pontDIdentite: PONT_DE_TEMOIN,
              noyau: noyauEspion(SUCCES_NEUTRE).noyau,
              maintenant: () => INSTANT,
            },
          ),
        requete: () => requeteDeTemoin({ corps }),
      },
    ];

    let attaquesMesurees = 0;
    let lecturesDuCorps = 0;
    const statuts: number[] = [];
    for (const attaque of attaques) {
      attaquesMesurees += 1;
      const requete = attaque.requete();
      const traitement = await attaque.monter().traiter(requete);
      lecturesDuCorps += requete.lecturesDuCorps();
      statuts.push(traitement.reponse.statut);
      expect(traitement.trace.corpsLu).toBe(false);
      expect(traitement.trace.appelsAuNoyau).toBe(0);
    }

    expect(attaquesMesurees).toBe(4);
    expect(lecturesDuCorps).toBe(0);
    console.log(
      `[C1] ${String(attaquesMesurees)} attaque(s) d'amont · ` +
        `${String(lecturesDuCorps)} lecture(s) de corps · statuts : ${statuts.join(", ")}`,
    );
  });

  it("n'accepte aucune identité glissée par un en-tête ni par les paramètres", async () => {
    const espion = noyauEspion(SUCCES_NEUTRE);
    const corps = JSON.stringify(
      enveloppe({
        name: OUTIL,
        arguments: { principal: "faux.principal", sessionId: "fausse-session" },
        _meta: { "ops/principal": "faux.principal", "ops/sessionId": "fausse-session" },
      }),
    );
    const canaux: Readonly<Record<string, string>> = {
      "x-ops-principal": "faux.principal",
      "x-ops-session-id": "fausse-session-en-tete",
      "x-forwarded-host": "hote-falsifie.stub.invalid",
      "x-request-id": "correlation-choisie-par-l-appelant",
      "x-ops-scopes": "ops:admin",
    };

    await transportHttpDEpreuve(espion.noyau).traiter(
      requeteDeTemoin({ corps, entetesEnPlus: canaux }),
    );

    let canauxEssayes = 0;
    for (const _ of Object.keys(canaux)) canauxEssayes += 1;
    // Deux canaux de plus : le corps `arguments` et le `_meta`.
    canauxEssayes += 2;

    const identite = espion.observes[0]?.identite;
    expect(identite?.principal).toBe(PRINCIPAL_DE_TEMOIN);
    expect(identite?.requestId).not.toBe("correlation-choisie-par-l-appelant");
    expect(identite?.deadline.getTime()).toBe(INSTANT.getTime() + BUDGET_MS);
    expect(identite?.scopes).toEqual(["ops:read"]);

    console.log(
      `[C2] ${String(canauxEssayes)} canal/canaux d'injection essayé(s) · ` +
        `0 retenu(s) · principal servi : « ${String(identite?.principal)} »`,
    );
  });

  it("refuse cinq enveloppes fautives des DEUX côtés, sans jamais atteindre le noyau", async () => {
    const fautives: ReadonlyArray<readonly [string, string]> = [
      ["JSON tronqué", '{"jsonrpc":"2.0","id":1,"method":"tools/call"'],
      ["lot JSON-RPC", '[{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}}]'],
      ["version absente", '{"id":1,"method":"tools/call","params":{"name":"x"}}'],
      ["méthode inconnue", '{"jsonrpc":"2.0","id":1,"method":"outil/inventer","params":{}}'],
      ["params positionnels", '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":[1,2]}'],
    ];

    let formesMesurees = 0;
    let appelsAuNoyau = 0;
    for (const [, corps] of fautives) {
      formesMesurees += 1;

      const espionHttp = noyauEspion(SUCCES_NEUTRE);
      const traitement = await transportHttpDEpreuve(espionHttp.noyau).traiter(
        requeteDeTemoin({ corps }),
      );
      appelsAuNoyau += traitement.trace.appelsAuNoyau;

      const espionStdio = noyauEspion(SUCCES_NEUTRE);
      const { serveur } = serveurStdioDEpreuve(espionStdio.noyau);
      await serveur.absorber(`${corps}\n`);
      appelsAuNoyau += espionStdio.observes.length;
    }

    expect(formesMesurees).toBe(5);
    expect(appelsAuNoyau).toBe(0);
    console.log(
      `[C3] ${String(formesMesurees)} enveloppe(s) fautive(s) × 2 transports = ` +
        `${String(formesMesurees * 2)} confrontation(s) · ${String(appelsAuNoyau)} appel(s) au noyau`,
    );
  });

  it("sert DEUX requêtes concurrentes sans les confondre, et frappe deux `requestId` distincts", async () => {
    const espion = noyauEspion(SUCCES_NEUTRE);
    const transport = transportHttpDEpreuve(espion.noyau);
    const corps = JSON.stringify(
      enveloppe({
        name: OUTIL,
        arguments: {},
        _meta: { "ops/idempotencyKey": "cle-partagee-par-les-deux-appels" },
      }),
    );

    await Promise.all([
      transport.traiter(requeteDeTemoin({ corps })),
      transport.traiter(requeteDeTemoin({ corps })),
    ]);

    let appelsMesures = 0;
    const identifiants = new Set<string>();
    for (const observe of espion.observes) {
      appelsMesures += 1;
      identifiants.add(observe.identite.requestId);
    }

    expect(appelsMesures).toBe(2);
    // Les deux atteignent le noyau : l'étape 13 se prononce dans le DÉPÔT, pas
    // dans le transport — c'est bien ce que l'ADR 0025 exige.
    expect(identifiants.size).toBe(2);
    console.log(
      `[C4] ${String(appelsMesures)} appel(s) concurrent(s) · ` +
        `${String(identifiants.size)} requestId distinct(s) · clé d'idempotence partagée`,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  D — LE FILET ANTI-FUITE, RETOURNÉ CONTRE LE SOCLE (ADR 0033)
// ═════════════════════════════════════════════════════════════════════════════

describe("D — le filet anti-fuite : sa borne, et son retournement", () => {
  it("CAPACITÉ — le filet SAIT dire non : une valeur de la requête renvoyée est retenue", async () => {
    const secret = "valeur-de-requete-renvoyee-par-l-outil-0001";
    const espion = noyauEspion((appel) => resultatDeSucces(appel.input));
    const traitement = await transportHttpDEpreuve(espion.noyau).traiter(
      requeteDeTemoin({
        corps: JSON.stringify(enveloppe({ name: OUTIL, arguments: { echo: secret } })),
      }),
    );

    expect(traitement.trace.fuite.fuites.length).toBeGreaterThan(0);
    expect(traitement.reponse.corps).not.toContain(secret);
    console.log(
      `[D, capacité] ${String(traitement.trace.fuite.valeursConfrontees)} valeur(s) confrontée(s) · ` +
        `${String(traitement.trace.fuite.fuites.length)} retenue(s) · ` +
        `statut ${String(traitement.reponse.statut)}`,
    );
  });

  it.fails(
    "🔴 D1 — deux mots du PROTOCOLE, envoyés comme arguments, transforment tout appel en 500",
    async () => {
      // Les mots ne sont pas recopiés : ils sont DÉRIVÉS des en-têtes qu'une
      // réponse de contrôle porte réellement. Une liste écrite à la main aurait
      // mesuré l'état du jour où on l'a écrite.
      const controle = await transportHttpDEpreuve(noyauEspion(SUCCES_NEUTRE).noyau).traiter(
        requeteDeTemoin({ corps: JSON.stringify(enveloppe({ name: OUTIL, arguments: {} })) }),
      );
      const enTetes = Object.entries(controle.reponse.entetes)
        .map(([nom, valeur]) => `${nom}: ${valeur}`)
        .join("\n");
      const jetons = [...new Set(enTetes.match(/[A-Za-z0-9/._+-]+/g) ?? [])].filter(
        (mot) => mot.length >= LONGUEUR_MINIMALE_CONFRONTEE,
      );

      let motsEssayes = 0;
      let appelsRetournes = 0;
      for (const mot of jetons) {
        motsEssayes += 1;
        const traitement = await transportHttpDEpreuve(noyauEspion(SUCCES_NEUTRE).noyau).traiter(
          requeteDeTemoin({
            corps: JSON.stringify(enveloppe({ name: OUTIL, arguments: { q: mot } })),
          }),
        );
        if (traitement.reponse.statut === 500) appelsRetournes += 1;
      }

      console.log(
        `[D1] ${String(motsEssayes)} mot(s) du protocole dérivé(s) des en-têtes · ` +
          `${String(appelsRetournes)} appel(s) légitime(s) transformé(s) en 500`,
      );

      // L'ASSERTION CORRECTE : un argument qui se trouve coïncider avec un mot
      // du protocole n'est pas une fuite. Le filet doit confronter le CORPS de
      // la réponse, pas la ligne d'en-tête que le socle écrit lui-même.
      expect(appelsRetournes).toBe(0);
    },
  );

  it.fails(
    "🔴 D2 — au-delà de la 64ᵉ chaîne, le filet ne confronte plus rien, et ne le dit pas",
    async () => {
      // 64 chaînes de bourrage, puis la valeur à protéger. La borne
      // `MAX_ARGUMENTS_CONFRONTES` s'atteint sur le bourrage.
      const bourrage: Record<string, string> = {};
      let bourrageEcrit = 0;
      while (bourrageEcrit < 64) {
        bourrage[`bourrage${String(bourrageEcrit)}`] =
          `chaine-de-bourrage-sans-signification-${String(bourrageEcrit).padStart(4, "0")}`;
        bourrageEcrit += 1;
      }
      const aProteger = "valeur-a-ne-jamais-renvoyer-au-fil-0001";

      // ⚠️ L'ADAPTATEUR NE REND QUE LE DERNIER CHAMP, ET C'EST CE QUI ISOLE LA
      //    RÈGLE. Un adaptateur qui renverrait TOUTE la charge ferait retenir les
      //    64 chaînes de bourrage, la réponse tomberait en `internal`, et la
      //    valeur ne sortirait pas — pour une raison qui n'est pas celle qu'on
      //    mesure. Le témoin serait vert par accident.
      const espion = noyauEspion(() => resultatDeSucces({ extrait: aProteger }));
      const traitement = await transportHttpDEpreuve(espion.noyau).traiter(
        requeteDeTemoin({
          corps: JSON.stringify(enveloppe({ name: OUTIL, arguments: { ...bourrage, aProteger } })),
        }),
      );

      const fuite = traitement.trace.fuite;
      console.log(
        `[D2] ${String(bourrageEcrit + 1)} chaîne(s) envoyée(s) · ` +
          `${String(fuite.valeursConfrontees)} confrontée(s) · ` +
          `${String(fuite.valeursEcartees)} écartée(s) comme trop courtes · ` +
          `${String(fuite.fuites.length)} retenue(s) · ` +
          `la valeur ressort : ${String(traitement.reponse.corps.includes(aProteger))}`,
      );

      // L'ASSERTION CORRECTE, ADR 0033 : la valeur envoyée par l'appelant et
      // ressortie dans la réponse doit être RETENUE. Elle sort aujourd'hui, et
      // aucun compte ne dit que 65 chaînes ont été envoyées pour 66 confrontées
      // — les non collectées ne sont comptées nulle part.
      expect(traitement.reponse.corps).not.toContain(aProteger);
    },
  );

  it.fails("🔴 D3 — une valeur enfouie au-delà de la 8ᵉ profondeur échappe au filet", async () => {
    const aProteger = "valeur-enfouie-a-ne-jamais-renvoyer-0002";
    let profondeur = 0;
    let charge: unknown = aProteger;
    while (profondeur < 12) {
      charge = { n: charge };
      profondeur += 1;
    }

    const espion = noyauEspion((appel) => resultatDeSucces(appel.input));
    const traitement = await transportHttpDEpreuve(espion.noyau).traiter(
      requeteDeTemoin({
        corps: JSON.stringify(enveloppe({ name: OUTIL, arguments: { enfoui: charge } })),
      }),
    );

    console.log(
      `[D3] 1 valeur enfouie à la profondeur ${String(profondeur + 1)} · ` +
        `${String(traitement.trace.fuite.valeursConfrontees)} valeur(s) confrontée(s) · ` +
        `${String(traitement.trace.fuite.fuites.length)} retenue(s) · ` +
        `la valeur ressort : ${String(traitement.reponse.corps.includes(aProteger))}`,
    );

    expect(traitement.reponse.corps).not.toContain(aProteger);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  E — CE QUI NE MONTE PAS : LE SOCLE NE RÉPOND À PERSONNE
// ═════════════════════════════════════════════════════════════════════════════

/** Un fichier du dépôt, lu une fois. */
interface FichierLu {
  readonly chemin: string;
  readonly source: string;
}

/** La racine du dépôt, DÉRIVÉE de l'emplacement de ce fichier. */
const RACINE = fileURLToPath(new URL("../..", import.meta.url));

/**
 * LES MOTIFS D'EXCLUSION DU BUILD, **LUS** dans `tsconfig.build.json`.
 *
 * ⚠️ Ils ne sont pas recopiés : ce fichier de configuration porte lui-même
 *    l'avertissement « cet `exclude` n'est pas qu'un réglage de build : c'est le
 *    CRITÈRE dont on dérive “ce fichier est-il de PRODUCTION ?” ». Le relire est
 *    le seul moyen que ce critère ne se dédouble pas.
 */
function motifsHorsProduction(): readonly string[] {
  const brut = readFileSync(join(RACINE, "tsconfig.build.json"), "utf8");
  const sansCommentaires = brut
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("//"))
    .join("\n");
  const lu = JSON.parse(sansCommentaires) as { readonly exclude?: readonly string[] };
  return lu.exclude ?? [];
}

/** Les fichiers TypeScript de PRODUCTION du dépôt. */
function fichiersDeProduction(): readonly FichierLu[] {
  const motifs = motifsHorsProduction();
  const exclus = (chemin: string): boolean =>
    motifs.some((motif) => {
      const noyau = motif.replace(/^\*\*\//, "").replace(/^\*/, "");
      return chemin.includes(noyau.replace(/\//g, sep));
    });

  const lus: FichierLu[] = [];
  const descendre = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      if (entree === "node_modules" || entree === ".git" || entree === "dist") continue;
      const complet = join(dossier, entree);
      if (statSync(complet).isDirectory()) {
        descendre(complet);
        continue;
      }
      if (!entree.endsWith(".ts")) continue;
      const chemin = relative(RACINE, complet);
      if (exclus(chemin)) continue;
      lus.push({ chemin: chemin.split(sep).join("/"), source: readFileSync(complet, "utf8") });
    }
  };
  descendre(RACINE);
  return lus;
}

describe("E — la racine de composition ne monte AUCUN des deux transports", () => {
  /**
   * Les quatre symboles sans lesquels le socle n'écoute rien. Ils sont NOMMÉS
   * ici parce que ce sont eux qui, appelés, ouvrent une écoute ou branchent un
   * flux — aucune dérivation ne peut le dire à leur place.
   */
  const MONTAGES = [
    "creerTransportHttp",
    "creerServeurHttp",
    "creerServeurStdio",
    "brancherSurLesFlux",
  ] as const;

  /** Un symbole de contrôle, dont on SAIT qu'il a un appelant de production. */
  const TEMOIN_DE_CAPACITE = "verifierAucuneFuite";

  function appelantsHorsDuTransport(symbole: string, fichiers: readonly FichierLu[]): string[] {
    const motif = new RegExp(`\\b${symbole}\\s*\\(`);
    const appelants: string[] = [];
    for (const fichier of fichiers) {
      if (fichier.chemin.startsWith("core/transport/")) continue;
      if (motif.test(fichier.source)) appelants.push(fichier.chemin);
    }
    return appelants;
  }

  it("CAPACITÉ — le scanner SAIT trouver un appelant, et il annonce ce qu'il a lu", () => {
    const fichiers = fichiersDeProduction();
    // Le témoin de capacité est appelé DANS `core/transport/`, donc on ne
    // l'exclut pas : ce qu'on prouve ici est que le scanner sait dire « oui ».
    const motif = new RegExp(`\\b${TEMOIN_DE_CAPACITE}\\s*\\(`);
    let fichiersBalayes = 0;
    const trouves: string[] = [];
    for (const fichier of fichiers) {
      fichiersBalayes += 1;
      if (motif.test(fichier.source)) trouves.push(fichier.chemin);
    }
    expect(fichiersBalayes).toBeGreaterThan(50);
    expect(trouves.length).toBeGreaterThan(0);
    console.log(
      `[E, capacité] ${String(fichiersBalayes)} fichier(s) de production balayé(s) · ` +
        `témoin « ${TEMOIN_DE_CAPACITE} » : ${String(trouves.length)} appelant(s) — ` +
        `${trouves.join(", ")}`,
    );
  });

  it("✅ E1 — les quatre montages du lot 2 ont chacun un appelant de production : le socle écoute", () => {
    const fichiers = fichiersDeProduction();
    let symbolesMesures = 0;
    const sansAppelant: string[] = [];
    const comptes: string[] = [];
    for (const symbole of MONTAGES) {
      symbolesMesures += 1;
      const appelants = appelantsHorsDuTransport(symbole, fichiers);
      comptes.push(`${symbole} : ${String(appelants.length)}`);
      if (appelants.length === 0) sansAppelant.push(symbole);
    }

    console.log(
      `[E1] ${String(fichiers.length)} fichier(s) de production · ` +
        `${String(symbolesMesures)} montage(s) confronté(s) · ` +
        `${comptes.join(" · ")} · sans appelant : ${String(sansAppelant.length)}`,
    );

    // LE CRITÈRE ANNONCÉ DU LOT : « après lui, le socle DÉMARRE et RÉPOND ».
    // Il a été tenu à la recette : `ops/service.ts` monte les quatre, et
    // `ops/index.ts` l'appelle. Le compte reste ANNONCÉ symbole par symbole —
    // c'est lui qui dirait, le jour où un montage redeviendrait orphelin,
    // LEQUEL a été débranché.
    expect(sansAppelant).toEqual([]);
  });
});
