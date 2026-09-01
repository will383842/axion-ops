/**
 * `ops/racine-en-service.temoin.spec.ts` — **LA CHAÎNE EST-ELLE COMPOSÉE, OU
 * SEULEMENT COMPOSABLE ? ADR 0039, § 1.**
 *
 * ═══ LE MANQUE QUE CE FICHIER COMBLE, ET IL A ÉTÉ MESURÉ ═══
 *
 * L'ADR 0039 exige « UN APPEL DE BOUT EN BOUT, DEPUIS `ops/index.ts`, ET PAS
 * DEPUIS UN HARNAIS ». À la recette du lot 3, cette garde n'existait pas, et le
 * dépôt le disait par une mutation :
 *
 *  · `ops/index.ts:610`, `noyau: noyau.fabrique,` → `noyau: null,`
 *  · suite COMPLÈTE : `Test Files 132 passed (132)` ·
 *    `Tests 1489 passed | 31 expected fail (1520)` — **SURVIVANTE.**
 *
 * Ce que le dépôt éprouvait à la place : `ops/composition/noyau.spec.ts` monte
 * `composerLeNoyau` en isolation, et `ops/service.spec.ts` fournit son PROPRE
 * noyau à `PortsDuService`. Les deux mesurent que la chaîne est *composable*.
 * Aucun des deux ne traverse la ligne qui relie la fabrique au montage — et
 * `demarrerLeProcessus` n'avait, dans tout le dépôt, qu'un seul appelant :
 * l'amorce `estLeProgrammeLance` d'`ops/index.ts`, qu'aucun `.spec.ts` n'appelle.
 *
 * ═══ CE QUE CETTE GARDE FAIT, ET CE QU'ELLE NE FAIT PAS ═══
 *
 * Elle démarre le processus **par sa propre fonction de racine**, sur un
 * environnement FABRIQUÉ — coffre local provisionné en mémoire, flux d'entrée et
 * de sortie fabriqués, horloge et planificateur injectés. Elle ne construit
 * aucun noyau, n'appelle jamais `composerLeNoyau`, et ne remet aucun
 * `PortsDuService` : tout lui vient de la racine.
 *
 * ⚠️ **ELLE NE MESURE PAS LE JOURNAL, ET LE MOTIF EST STRUCTUREL.** Le
 *    `JournalMemoire` que la racine compose vit à l'intérieur de
 *    `demarrerLeProcessus` ; `ProcessusDemarre` ne l'expose pas. La garde lit
 *    donc ce que le socle a SERVI sur son fil — la seule chose qu'un client
 *    voit. La ligne d'`ops_audit` que l'ADR 0039 nommait reste à mesurer, et
 *    elle exigerait que la racine rende son journal : c'est une décision, pas
 *    un oubli, et elle n'est pas prise ici.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU, AUCUNE BASE.** L'URL de base porte
 *    `HOTE_SANS_MAGASIN_PARTAGE` (RFC 2606, importé — jamais réécrit), ce qui
 *    fait choisir à la racine le coffre en mémoire ; les valeurs de clés sont
 *    des chaînes de garnissage, écrites en toutes lettres comme telles.
 */

import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../core/types.js";
import { HOTE_SANS_MAGASIN_PARTAGE } from "../core/instance/postgres.js";
import { ARGUMENT_DE_PROVISION_LOCALE, demarrerLeProcessus } from "./index.js";
import type { DependancesDuProcessus, ProcessusDemarre } from "./index.js";
import type { Planificateur } from "./main.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR — fabriqué, en mémoire, sans un octet de réseau
// ═════════════════════════════════════════════════════════════════════════════

/** L'instant figé du décor. Une garde ne lit jamais l'horloge de la machine. */
const INSTANT = new Date("2026-01-01T00:00:00.000Z");

/**
 * Le planificateur INERTE : l'étage 7 arme sa veille, elle ne bat jamais.
 *
 * ⚠️ Un `setInterval` réel laisserait un minuteur vivant après le test, et
 *    vitest attendrait la fin du processus au lieu de la fin de la garde.
 */
const PLANIFICATEUR_INERTE: Planificateur = () => () => {
  /* rien à annuler : rien n'a été armé */
};

/**
 * De quoi ouvrir le coffre LOCAL et sceller le journal. **Ce ne sont pas des
 * secrets** : ce sont des chaînes de garnissage, longues comme la clé attendue,
 * et elles ne déverrouillent rien d'autre que le coffre en mémoire de ce test,
 * qui meurt avec lui.
 */
const GARNISSAGE = "valeur-factice-non-secrete-0000000000000000";

/** L'environnement COMPLET d'un socle qui doit servir. Aucune valeur réelle. */
const ENV_QUI_SERT: Readonly<Record<string, string>> = {
  DATABASE_URL: `postgresql://stub:stub@${HOTE_SANS_MAGASIN_PARTAGE}:5432/stub`,
  OPS_RESOURCE_INDICATOR: `https://socle.${HOTE_SANS_MAGASIN_PARTAGE}/api/mcp`,
  OPS_ALLOWED_HOSTS: "localhost:3000",
  OPS_CONSOLE_ISSUER: `https://socle.${HOTE_SANS_MAGASIN_PARTAGE}/auth`,
  OPS_CONSOLE_SESSION_KEY: GARNISSAGE,
  OPS_CONSOLE_TOTP_ISSUER: "axion-ops (garde de racine)",
  OPS_TOKEN_HASH_KEY: GARNISSAGE,
  OPS_VAULT_KEY: GARNISSAGE,
  OPS_ARGHASH_KEY: GARNISSAGE,
  OPS_JOURNAL_SEAL_KEY: GARNISSAGE,
  OPS_CURSOR_KEY: GARNISSAGE,
  // Une seule colonne : `http` exige un `VerificateurDeJeton` que ce dépôt ne
  // livre pas, et `monterLeService` le refuserait — la garde mesurerait alors
  // un empêchement ÉTRANGER à ce qu'elle éprouve.
  OPS_TRANSPORTS: "stdio",
  OPS_CALL_BUDGET_MS: "30000",
  OPS_MAX_BODY_BYTES: "1048576",
  OPS_HTTP_PORT: "3000",
  OPS_WATCH_PERIOD_MS: "30000",
  OPS_IDEMPOTENCY_TTL_MS: "60000",
};

/** Un flux d'entrée fabriqué : la garde POUSSE les lignes elle-même. */
class FluxDEntreeFabrique {
  #ecouteur: ((morceau: string) => void) | null = null;

  setEncoding(_codage: "utf8"): unknown {
    return this;
  }

  on(_evenement: "data", ecouteur: (morceau: string) => void): unknown {
    this.#ecouteur = ecouteur;
    return this;
  }

  /** Sert une ligne. **Lève si personne n'écoute** — un silence serait vert. */
  pousser(ligne: string): void {
    if (this.#ecouteur === null) {
      throw new Error(
        "garde mal fabriquée : aucun écouteur n'est branché sur le flux d'entrée. " +
          "Le transport stdio n'a donc PAS été monté, et pousser une ligne dans le vide " +
          "rendrait cette garde verte sans qu'un seul octet ait traversé la chaîne.",
      );
    }
    this.#ecouteur(`${ligne}\n`);
  }
}

/** Un flux de sortie fabriqué : il garde tout ce que le socle a écrit. */
class FluxDeSortieFabrique {
  public readonly ecrits: string[] = [];

  write(donnees: string): unknown {
    this.ecrits.push(donnees);
    return true;
  }

  /** Les réponses JSON-RPC, une par ligne non vide servie. */
  reponses(): readonly Record<string, unknown>[] {
    return this.ecrits
      .join("")
      .split("\n")
      .filter((ligne) => ligne.trim().length > 0)
      .map((ligne) => JSON.parse(ligne) as Record<string, unknown>);
  }
}

interface Decor {
  readonly processus: ProcessusDemarre;
  readonly entree: FluxDEntreeFabrique;
  readonly sortie: FluxDeSortieFabrique;
  readonly lignesDErreur: readonly string[];
}

/**
 * DÉMARRE LE PROCESSUS PAR SA RACINE. **Aucun noyau, aucun port, aucun
 * catalogue ne lui est remis** : c'est tout l'objet de cette garde.
 */
async function demarrer(
  env: Readonly<Record<string, string | undefined>> = ENV_QUI_SERT,
  args: readonly string[] = [ARGUMENT_DE_PROVISION_LOCALE],
): Promise<Decor> {
  const entree = new FluxDEntreeFabrique();
  const sortie = new FluxDeSortieFabrique();
  const lignesDErreur: string[] = [];
  const deps: DependancesDuProcessus = {
    env,
    arguments: args,
    flux: { entree, sortie },
    maintenant: () => INSTANT,
    ecrireSurLaSortieDErreur: (ligne) => lignesDErreur.push(ligne),
    planifier: PLANIFICATEUR_INERTE,
  };
  const processus = await demarrerLeProcessus(deps);
  return { processus, entree, sortie, lignesDErreur };
}

/** Le numéro d'étape que porte un code de refus, **DÉRIVÉ d'`APPEL_STEPS`**. */
function etapeQuiRefuse(code: string): number {
  const etape = APPEL_STEPS.find((candidate) => candidate.refus === code);
  if (etape === undefined) {
    throw new Error(
      `garde mal fabriquée : aucune étape d'\`APPEL_STEPS\` ne porte le refus « ${code} ». ` +
        "Le § 11 est la seule source du numéro ; l'écrire à la main ici ferait une seconde " +
        "écriture, et les deux finiraient par diverger.",
    );
  }
  return etape.numero;
}

/** Les deux méthodes que la garde sert. Le dénominateur qu'elle annonce. */
const REQUETES = [
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/call",' +
    '"params":{"name":"outil.absent.du.catalogue","arguments":{}}}',
] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA CHAÎNE EST COMPOSÉE : UN APPEL LA TRAVERSE DEPUIS LA RACINE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0039 · § 1 — la chaîne est COMPOSÉE à la racine, pas seulement composable", () => {
  it(`sert ${String(REQUETES.length)} requête(s) entrées par le fil de la RACINE — jamais d'un harnais`, async () => {
    const decor = await demarrer();
    try {
      // ── Assertions POSITIVES d'abord : l'instrument a-t-il vu quelque chose ?
      expect(decor.processus.codeDeSortie).toBe(0);
      expect(decor.processus.socle.demarrage.sert).toBe(true);
      expect(decor.processus.service.empechements).toEqual([]);
      expect(decor.processus.service.transportsMontes).toContain("stdio");

      for (const requete of REQUETES) decor.entree.pousser(requete);
      // Le transport traite chaque ligne sans attendre : une micro-tâche suffit
      // à laisser les promesses de la chaîne se résoudre.
      await Promise.resolve();
      await new Promise((resoudre) => setTimeout(resoudre, 0));

      const reponses = decor.sortie.reponses();
      console.warn(
        `[ADR 0039 · racine] ${String(REQUETES.length)} requête(s) poussée(s) · ` +
          `${String(reponses.length)} réponse(s) servie(s) · ` +
          `${String(decor.processus.service.transportsMontes.length)} transport(s) monté(s) ` +
          `[${decor.processus.service.transportsMontes.join(", ")}] · ` +
          `${String(decor.processus.service.empechements.length)} empêchement(s)`,
      );
      expect(reponses).toHaveLength(REQUETES.length);

      // ── `tools/list` : le catalogue de la racine est VIDE, et le zéro est une
      //    mesure — `ops/index.ts` ne soumet aucun manifeste.
      const liste = reponses[0]?.["result"] as { readonly tools?: readonly unknown[] };
      expect(liste.tools).toEqual([]);

      // ── `tools/call` : LUI traverse le noyau. C'est la seule des deux qui
      //    distingue « la chaîne est composée » de « le transport répond ».
      const appel = reponses[1]?.["result"] as {
        readonly isError?: boolean;
        readonly step?: number;
        readonly code?: string;
      };
      expect(appel.isError).toBe(true);
      expect(appel.code).toBe("tool_disabled");
      expect(appel.step).toBe(etapeQuiRefuse("tool_disabled"));
    } finally {
      await decor.processus.arreter();
    }
  });

  /**
   * LE TÉMOIN INVERSE. Sans lui, le test ci-dessus pourrait être vert parce que
   * le décor ne sait pas fabriquer un socle qui NE sert pas — et il ne
   * mesurerait alors rien du tout.
   */
  it("rougirait si la racine ne composait pas : sans coffre, RIEN n'est monté et le motif est NOMMÉ", async () => {
    const decor = await demarrer({ ...ENV_QUI_SERT }, []);
    try {
      // Aucun `--provisionner-le-coffre-local` : le coffre reste `absent`.
      expect(decor.processus.socle.demarrage.sert).toBe(false);
      expect(decor.processus.service.transportsMontes).toEqual([]);
      expect(decor.processus.service.empechements.length).toBeGreaterThan(0);
      expect(decor.processus.service.empechements.join(" ")).toContain(
        "la chaîne des quatorze étapes n'est pas composée",
      );
      // Et le fil ne porte RIEN : pousser une ligne lève, puisque aucun
      // transport n'écoute. C'est ce qui rend le test ① non vacuous.
      expect(() => {
        decor.entree.pousser(REQUETES[0]);
      }).toThrow(/aucun écouteur/u);
    } finally {
      await decor.processus.arreter();
    }
  });
});
