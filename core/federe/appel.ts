/**
 * `core/federe/appel.ts` — L'APPEL D'UN ADAPTATEUR **FÉDÉRÉ**, EN JSON-RPC.
 *
 * Le port `AppelAdaptateur` (`core/chaine/orchestrateur.ts`) était nommé,
 * obligatoire, et sans implémentation : la composition le remplissait d'un
 * `Promise.reject(ErreurAdaptateurNonAdmis)`. Ce fichier est la première
 * implémentation réelle — celle du mode `fédéré`, où l'adaptateur vit chez son
 * produit et se joint par HTTP.
 *
 * ═══ CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS ═══
 *
 * ✅ Il émet `tools/call` et rend une {@link ChargeAdaptateur} vérifiée.
 * ❌ Il ne décide d'AUCUN droit : les quatorze étapes ont déjà tranché quand il
 *    est appelé. Il n'a ni scope, ni politique, ni quota à lire.
 * ❌ Il ne compacte rien : l'étape 14 le fait, sur la charge BRUTE qu'il rend.
 * ❌ Il n'avale aucune erreur réseau. `estAmontInjoignable()` reconnaît
 *    `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT` et leurs voisins **dans la chaîne
 *    `cause`** : envelopper l'erreur en la perdant transformerait un amont
 *    injoignable en `internal`, et le § 15 ne dirait plus quoi faire ensuite.
 *
 * ═══ 🔑 POURQUOI LE SOCLE DÉRIVE `recordIds`, AU LIEU DE LES RECEVOIR ═══
 *
 * `ChargeAdaptateur.recordIds` porte les identifiants pseudonymes du § 12. On
 * pourrait demander à l'adaptateur de les mettre dans sa réponse. **On ne le
 * fait pas**, pour la raison de l'ADR 0015 : *l'étiquetage se décide côté socle,
 * jamais sur déclaration*. Un adaptateur distant — public, dans le cas du CRM —
 * qui rendrait `recordIds: []` retirerait d'un mot ses identifiants de la purge
 * et du journal.
 *
 * Le socle possède déjà ce qu'il faut : `idFields`, épinglé dans le manifeste
 * par `manifestSha`. On lit donc les valeurs de CES champs-là dans les items
 * rendus. L'adaptateur ne peut ni en ajouter, ni en retirer.
 *
 * ⚠️ Conséquence, à connaître : un adaptateur qui renomme un champ sans
 *    régénérer son manifeste verra ses identifiants cesser d'être collectés,
 *    **en silence**. C'est la contrepartie de ne rien croire sur parole. Le
 *    compte est donc annoncé (`champsIdTrouves`) pour qu'un zéro se voie.
 */

import { CLES_META_DU_SOCLE, VERSION_JSON_RPC } from "../transport/http/enveloppe.js";
import { verifierChargeDeLAdaptateur } from "../chaine/etape-14-execution.js";
import type { ChargeAdaptateur } from "../chaine/etapes.js";
import type { ToolContext } from "../types.js";

/**
 * L'en-tête qui porte le secret partagé.
 *
 * ⚠️ **VALEUR DE CONTRAT, PARTAGÉE AVEC CHAQUE ADAPTATEUR FÉDÉRÉ.** Elle est
 *    lue dans l'adaptateur d'Axion-IA (`src/app/api/mcp/route.ts`,
 *    `ENTETE_DU_SECRET`) au 2026-09-02. La changer d'un côté sans l'autre rend
 *    un 401 que rien n'explique — d'où le nom écrit une seule fois, ici.
 */
export const ENTETE_SECRET_PARTAGE = "x-mcp-secret";

/** La méthode JSON-RPC d'appel d'outil (révision MCP 2025-06-18). */
export const METHODE_APPEL = "tools/call";

/**
 * Le délai au-delà duquel on considère l'adaptateur perdu.
 *
 * Il est DÉLIBÉRÉMENT plus court que le budget de bout en bout du § 26 : un
 * appel qui expire doit laisser au socle le temps d'écrire son journal et de
 * répondre, sinon c'est le socle qui paraît muet.
 */
export const DELAI_PAR_DEFAUT_MS = 10_000;

/** Ce qu'il faut savoir pour joindre un adaptateur — lu du verrou, pas deviné. */
export interface RaccordementFedere {
  /** `EntreeVerrou.endpoint`. Absent ⇒ l'adaptateur n'est pas fédéré. */
  readonly endpoint: string;
  /** La valeur du secret, DÉJÀ déchiffrée par le coffre. Jamais un `secretRef`. */
  readonly secret: string;
  /** Le nom COMPLET de l'outil, préfixe compris — `axionia.inbox.recent`. */
  readonly nomComplet: string;
  /** `idFields` de l'outil, tels que le manifeste épinglé les déclare. */
  readonly idFields: readonly string[];
  readonly delaiMs?: number;
}

/**
 * Ce que l'appel a mesuré. **Des NOMBRES, jamais un booléen** — sans quoi un
 * appel qui ne trouverait plus aucun identifiant resterait vert en silence.
 */
export interface VerdictAppel {
  readonly statutHttp: number;
  readonly itemsRecus: number;
  /** Combien de valeurs d'`idFields` ont été trouvées dans les items. */
  readonly champsIdTrouves: number;
  /** Combien de champs de la charge ont été confrontés à leur contrat. */
  readonly champsConfrontes: number;
}

export interface ResultatAppelFedere {
  readonly charge: ChargeAdaptateur;
  readonly verdict: VerdictAppel;
}

/**
 * L'adaptateur a répondu, mais pas ce qu'on peut servir.
 *
 * Distincte d'une erreur réseau **à dessein** : celle-ci ne doit PAS devenir un
 * `upstream_unavailable` (l'amont est joignable, il refuse), et elle ne doit pas
 * devenir un `internal` muet non plus. Elle porte le code que l'adaptateur a
 * nommé, quand il en a nommé un.
 */
export class ErreurAdaptateurDistant extends Error {
  public readonly statutHttp: number;
  /** Le code métier rendu par l'adaptateur (§ 15), ou `null`. */
  public readonly codeDistant: string | null;

  public constructor(message: string, statutHttp: number, codeDistant: string | null) {
    super(message);
    this.name = "ErreurAdaptateurDistant";
    this.statutHttp = statutHttp;
    this.codeDistant = codeDistant;
  }
}

function estObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function chaineOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.length > 0 ? valeur : null;
}

/**
 * Les identifiants pseudonymes, LUS dans les items sur la foi du manifeste.
 *
 * Ne descend qu'à la racine de chaque item : un `idFields` qui viserait un
 * champ imbriqué ne serait pas trouvé, et le compte le dira. Descendre en
 * profondeur reviendrait à deviner une forme que le manifeste ne décrit pas.
 */
export function extraireRecordIds(
  items: readonly unknown[],
  idFields: readonly string[],
): { readonly recordIds: readonly string[]; readonly champsIdTrouves: number } {
  const recordIds: string[] = [];
  let champsIdTrouves = 0;
  for (const item of items) {
    if (!estObjet(item)) continue;
    for (const champ of idFields) {
      const valeur = item[champ];
      if (typeof valeur === "string" && valeur.length > 0) {
        champsIdTrouves += 1;
        recordIds.push(valeur);
      } else if (typeof valeur === "number") {
        champsIdTrouves += 1;
        recordIds.push(String(valeur));
      }
    }
  }
  // Dédupliqué : deux items peuvent porter le même identifiant de source, et
  // la purge du § 31 compte des ENREGISTREMENTS, pas des occurrences.
  return { recordIds: [...new Set(recordIds)], champsIdTrouves };
}

/**
 * Lit la réponse d'un adaptateur et en tire une charge servable.
 *
 * ⚠️ TROIS FORMES DE RÉPONSE, ET ELLES NE SE CONFONDENT PAS :
 *
 *  · `error` au niveau JSON-RPC  → l'appel était mal formé ou l'outil inconnu.
 *    C'est un défaut du SOCLE ou du verrou, pas de l'adaptateur.
 *  · `result.isError: true`      → l'outil a refusé à l'exécution (source en
 *    panne, sortie trop large). L'adaptateur va bien, l'appel non.
 *  · `result.structuredContent`  → la charge, à laquelle on ne touche pas.
 */
export function lireReponseDeLAdaptateur(
  brut: unknown,
  statutHttp: number,
  idFields: readonly string[],
): ResultatAppelFedere {
  if (!estObjet(brut)) {
    throw new ErreurAdaptateurDistant(
      "réponse illisible : un objet JSON-RPC 2.0 était attendu.",
      statutHttp,
      null,
    );
  }
  if (brut["jsonrpc"] !== VERSION_JSON_RPC) {
    throw new ErreurAdaptateurDistant(
      `réponse hors protocole : « jsonrpc » vaut ${JSON.stringify(brut["jsonrpc"])}, ` +
        `attendu « ${VERSION_JSON_RPC} ».`,
      statutHttp,
      null,
    );
  }

  const erreur = brut["error"];
  if (estObjet(erreur)) {
    const donnees = erreur["data"];
    const code = estObjet(donnees) ? chaineOuNull(donnees["code"]) : null;
    throw new ErreurAdaptateurDistant(
      chaineOuNull(erreur["message"]) ?? "l'adaptateur a rendu une erreur sans message.",
      statutHttp,
      code,
    );
  }

  const resultat = brut["result"];
  if (!estObjet(resultat)) {
    throw new ErreurAdaptateurDistant(
      "réponse sans « result » ni « error » — ni succès ni refus.",
      statutHttp,
      null,
    );
  }

  const structure = resultat["structuredContent"];
  if (resultat["isError"] === true) {
    const code = estObjet(structure) ? chaineOuNull(structure["code"]) : null;
    const message = estObjet(structure) ? chaineOuNull(structure["message"]) : null;
    throw new ErreurAdaptateurDistant(
      message ?? "l'outil a échoué sans dire pourquoi.",
      statutHttp,
      code,
    );
  }

  if (!estObjet(structure)) {
    throw new ErreurAdaptateurDistant(
      "succès annoncé sans « structuredContent » : le socle ne sert pas du texte libre.",
      statutHttp,
      null,
    );
  }

  const items = Array.isArray(structure["items"]) ? (structure["items"] as readonly unknown[]) : [];
  const meta = estObjet(structure["meta"]) ? structure["meta"] : {};
  const { recordIds, champsIdTrouves } = extraireRecordIds(items, idFields);

  const charge: ChargeAdaptateur = {
    items,
    // Recopiés TELS QUELS : ce sont les deux étages de vérité du § 13.2, et le
    // socle n'a aucun moyen de les recalculer.
    failedSources: Array.isArray(meta["failedSources"])
      ? (meta["failedSources"] as readonly unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : [],
    sourceIncomplete: meta["sourceIncomplete"] === true,
    recordIds,
  };

  // La charge vient d'un processus qui n'est pas compilé avec le socle (§ 29) :
  // sa forme se vérifie, elle ne se suppose pas.
  const verdictCharge = verifierChargeDeLAdaptateur(charge);
  if (verdictCharge.anomalies.length > 0) {
    throw new ErreurAdaptateurDistant(
      `charge non conforme au contrat — ${String(verdictCharge.anomalies.length)} ` +
        `anomalie(s) sur ${String(verdictCharge.champsConfrontes)} champ(s) : ` +
        verdictCharge.anomalies.join(" · "),
      statutHttp,
      null,
    );
  }

  return {
    charge,
    verdict: {
      statutHttp,
      itemsRecus: items.length,
      champsIdTrouves,
      champsConfrontes: verdictCharge.champsConfrontes,
    },
  };
}

/** Le corps JSON-RPC d'un appel d'outil. Exporté pour être confronté en test. */
export function corpsDeLAppel(
  raccordement: RaccordementFedere,
  contexte: ToolContext<string>,
  entree: unknown,
): Readonly<Record<string, unknown>> {
  const meta: Record<string, unknown> = {
    "ops/requestId": contexte.requestId,
    "ops/principal": contexte.principal,
  };
  // ⚠️ L'EMPREINTE de la clé d'idempotence, jamais la clé (ADR 0020) : elle
  //    voyage vers un processus tiers, et l'appelant seul choisit le préimage.
  if (contexte.idempotencyRef !== null) {
    meta[CLES_META_DU_SOCLE.idempotence] = contexte.idempotencyRef;
  }
  return {
    jsonrpc: VERSION_JSON_RPC,
    id: contexte.requestId,
    method: METHODE_APPEL,
    params: { name: raccordement.nomComplet, arguments: entree, _meta: meta },
  };
}

/**
 * Appelle un adaptateur fédéré. **Ne rattrape aucune erreur réseau** : elles
 * remontent telles quelles pour qu'`estAmontInjoignable()` les reconnaisse.
 */
export async function appelerAdaptateurFedere(
  raccordement: RaccordementFedere,
  contexte: ToolContext<string>,
  entree: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultatAppelFedere> {
  const delai = raccordement.delaiMs ?? DELAI_PAR_DEFAUT_MS;

  const reponse = await fetchImpl(raccordement.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [ENTETE_SECRET_PARTAGE]: raccordement.secret,
    },
    body: JSON.stringify(corpsDeLAppel(raccordement, contexte, entree)),
    signal: AbortSignal.timeout(delai),
    // Une redirection sur un appel authentifié rejouerait le secret vers une
    // autre origine : on refuse de la suivre.
    redirect: "manual",
  });

  // 401 et 503 sont les deux refus que le contrôle 8 du harnais exige d'une
  // route d'adaptateur. On les NOMME plutôt que de les fondre dans « HTTP ».
  if (reponse.status === 401 || reponse.status === 503) {
    throw new ErreurAdaptateurDistant(
      reponse.status === 401
        ? "l'adaptateur refuse le secret partagé : vérifier `secretRef` et la variable côté produit."
        : "l'adaptateur ne sert rien : sa configuration est incomplète, ou il démarre.",
      reponse.status,
      null,
    );
  }
  if (reponse.status >= 300) {
    throw new ErreurAdaptateurDistant(
      `l'adaptateur a rendu HTTP ${String(reponse.status)}.`,
      reponse.status,
      null,
    );
  }

  let brut: unknown;
  try {
    brut = await reponse.json();
  } catch {
    throw new ErreurAdaptateurDistant(
      "corps illisible : du JSON était attendu.",
      reponse.status,
      null,
    );
  }
  return lireReponseDeLAdaptateur(brut, reponse.status, raccordement.idFields);
}
