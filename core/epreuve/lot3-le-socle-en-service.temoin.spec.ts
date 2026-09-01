/**
 * `core/epreuve/lot3-le-socle-en-service.temoin.spec.ts` — **CE QUE LE SOCLE
 * LAISSE PASSER QUAND IL SERT VRAIMENT.**
 *
 * ═══ D'OÙ VIENNENT CES TÉMOINS ═══
 *
 * Ils ne viennent pas d'une relecture. Ils viennent d'un LANCEMENT : le socle a
 * été démarré par son point d'entrée réel — `node dist/ops/index.js`, réglages
 * complets, coffre provisionné —, on lui a parlé en JSON-RPC sur son propre
 * fil, et on a compté ce qu'il a répondu et ce qu'il a écrit dans `ops_audit`.
 * Trois faits en sont sortis, et aucune garde du dépôt ne les mesurait :
 *
 *  ① **`tools/list` ne traverse RIEN.** `servirToolsList`
 *    (`core/transport/stdio/serveur.ts:348-353`) relit le catalogue et écrit la
 *    réponse. Il n'appelle pas le noyau. Donc : pas d'étape 0 (le coffre), pas
 *    d'étape 5 (les scopes), pas d'étape 7 (le profil), et **pas une ligne
 *    d'`ops_audit`**. Mesuré au lancement : coffre VERROUILLÉ en cours de route,
 *    l'appel `tools/call` suivant est refusé à l'étape 0 — et le `tools/list`
 *    suivant sert encore le descripteur COMPLET de l'outil, schéma d'entrée
 *    compris. Le § 23 dit qu'un socle verrouillé ne sert pas d'outils ; il en
 *    publie encore la carte.
 *
 *  ② **Le compte des lignes d'`ops_audit` ne suit pas le compte des appels.**
 *    Six requêtes servies au lancement, six réponses écrites, **deux** lignes de
 *    journal. Les quatre autres — `initialize`, `tools/list`, une méthode
 *    inconnue, une enveloppe de `jsonrpc` fautif — sont des réponses, dont deux
 *    REFUS, qu'aucune ligne n'atteste.
 *
 *  ③ **Ce que le refus dit au fil et ce qu'il écrit au journal coïncident.**
 *    C'est le seul des trois qui tienne, et il tient bien : sur chaque cause de
 *    refus atteignable, le `step` de la réponse et le `stepDenied` de la ligne
 *    portent le même nombre. Ce témoin-là PASSE, et il est écrit pour rougir le
 *    jour où l'un des deux cesserait de dériver de l'autre.
 *
 * ═══ POURQUOI `it.fails` SUR ① ET ② ═══
 *
 * Même idiome que `chaine-chemins-de-panne.spec.ts` : un `it.fails` est VERT
 * tant que le défaut est là, et ROUGIT le jour où il est fermé — c'est-à-dire
 * qu'il oblige à venir le retirer, au lieu de laisser la dette s'oublier.
 *
 * ⚠️ **ET IL PORTE SON PIÈGE, QU'IL FAUT NEUTRALISER.** Un `it.fails` est vert
 *    dès qu'il échoue, POUR N'IMPORTE QUELLE RAISON — une faute de frappe dans
 *    un nom d'outil le rendrait vert sans rien mesurer. Chacun de ceux qui
 *    suivent commence donc par des assertions POSITIVES, qui établissent que
 *    l'instrument a vu quelque chose, et ne place qu'en DERNIÈRE ligne
 *    l'assertion de l'invariant réclamé.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU, AUCUNE DONNÉE PERSONNELLE.** Le décor est
 *    celui de `core/transport/stdio/fixtures.ts`, qui monte un noyau RÉEL —
 *    `orchestrerAppel`, les cinq étapes, le vrai journal chaîné.
 *
 * ═══ LA BORNE, ET ELLE EST LARGE ═══
 *
 * ⚠️ **RIEN DE TOUT CECI NE FUIT AUJOURD'HUI, ET LE MOTIF EST MESURABLE.**
 *    `adapters/` est vide, `ops/index.ts` soumet `manifestesAAdmettre: []` et
 *    passe `catalogueDesAdaptateursAdmis([])` : le catalogue SERVI en production
 *    est vide, et `tools/list` y rend `{"tools":[]}` — transcrit au lancement.
 *    Ces témoins mesurent des CHEMINS, pas une fuite en cours : ils disent ce
 *    que le socle fera le jour où un adaptateur sera épinglé, et c'est ce
 *    jour-là qu'il sera trop tard pour l'apprendre.
 *
 * ⚠️ **ILS NE DISENT RIEN DU TRANSPORT HTTP.** Ce dépôt ne livre AUCUNE
 *    implémentation de `VerificateurDeJeton` (mesuré : les trois seules
 *    occurrences hors gardes sont deux déclarations d'interface et le `null` de
 *    `ops/index.ts`), si bien que `monterLeService` refuse de monter « http » —
 *    exit 1 au lancement. Les quatre étapes « HTTP seul » du § 11 n'ont donc
 *    aucun chemin de production, et rien ici ne les éprouve.
 */

import { describe, expect, it } from "vitest";

import type { LigneAudit } from "../audit/index.js";
import {
  HABILITATIONS_DU_HARNAIS,
  OUTIL_BONJOUR,
  fabriquerServeurDuHarnais,
  ligneJsonRpc,
} from "../transport/stdio/fixtures.js";
import type { ServeurDuHarnais } from "../transport/stdio/fixtures.js";
import { CARACTERES_MAX_PAR_LIGNE } from "../transport/stdio/cadrage.js";

// ═════════════════════════════════════════════════════════════════════════════
//  DE QUOI LIRE CE QUE LE SOCLE A RÉPONDU, ET CE QU'IL A ÉCRIT
// ═════════════════════════════════════════════════════════════════════════════

/** Le corps `result` d'une réponse, tel que le fil le porte. */
interface CorpsServi {
  readonly isError?: boolean;
  readonly step?: number;
  readonly code?: string;
  readonly tools?: readonly { readonly name?: string; readonly nomComplet?: string }[];
}

function corpsDe(reponse: Record<string, unknown>): CorpsServi {
  return reponse["result"] ?? {};
}

/**
 * Sert une suite de lignes au serveur, dans l'ordre, et rend ce qui s'est passé.
 *
 * ⚠️ **SÉQUENTIEL, ET C'EST LA MÊME RAISON QUE DANS `absorber`.** Servir en
 *    parallèle rendrait l'ordre des lignes du journal dépendant de la durée des
 *    appels, et le compte « une ligne par appel » deviendrait illisible.
 */
async function servir(
  harnais: ServeurDuHarnais,
  lignes: readonly string[],
): Promise<{
  readonly reponses: readonly Record<string, unknown>[];
  readonly journal: readonly LigneAudit[];
}> {
  for (const ligne of lignes) await harnais.serveur.absorber(ligne);
  return { reponses: harnais.reponses(), journal: harnais.harnais.lignes() };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① `tools/list` NE TRAVERSE RIEN
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 23 · ce qu'un socle au coffre VERROUILLÉ publie encore", () => {
  /**
   * LE TÉMOIN DE POSITION, ET IL PASSE. Il établit d'abord que le verrou MORD
   * réellement sur le chemin `tools/call` — sans quoi le témoin suivant serait
   * vert parce que rien n'a été verrouillé, et non parce que la liste fuit.
   */
  it("refuse `tools/call` à l'étape 0 et l'écrit au journal — 1 appel, 1 ligne", async () => {
    const harnais = fabriquerServeurDuHarnais({ coffreFerme: true });
    const { reponses, journal } = await servir(harnais, [
      ligneJsonRpc(1, "tools/call", { name: OUTIL_BONJOUR.name, arguments: {} }),
    ]);

    const corps = corpsDe(reponses[0] ?? {});
    expect(reponses).toHaveLength(1);
    expect(corps.isError).toBe(true);
    expect(corps.step).toBe(0);
    expect(corps.code).toBe("vault_locked");
    // ⚠️ LE COMPTE, PAS LA COULEUR. Une ligne écrite, et elle porte l'étape.
    expect(journal).toHaveLength(1);
    expect(journal[0]?.stepDenied).toBe(0);
    expect(journal[0]?.decision).toBe("refusé");
  });

  /**
   * ⚠️ **CE TÉMOIN EST VERT PARCE QUE LE SOCLE A CE DÉFAUT.** Il rougira le jour
   *    où `tools/list` cessera de publier la carte des outils sous coffre
   *    verrouillé — et il faudra alors venir retirer le `.fails`.
   *
   * Les quatre premières assertions sont POSITIVES : elles établissent que le
   * coffre est bien fermé, que le refus de `tools/call` est bien prononcé, et
   * que le catalogue a bien été relu. Sans elles, un `it.fails` serait vert sur
   * une faute de frappe.
   */
  it.fails(
    "§ 23 — un coffre verrouillé ne devrait PUBLIER aucun outil : `tools/list` en sert encore",
    async () => {
      const harnais = fabriquerServeurDuHarnais({ coffreFerme: true });
      const { reponses, journal } = await servir(harnais, [
        ligneJsonRpc(1, "tools/call", { name: OUTIL_BONJOUR.name, arguments: {} }),
        ligneJsonRpc(2, "tools/list", {}),
      ]);

      // ── LES ASSERTIONS POSITIVES : L'INSTRUMENT A-T-IL VU QUELQUE CHOSE ? ──
      expect(reponses).toHaveLength(2);
      expect(corpsDe(reponses[0] ?? {}).code).toBe("vault_locked");
      expect(harnais.listagesDuCatalogue()).toBe(1);
      expect(journal).toHaveLength(1);

      // ── L'INVARIANT RÉCLAMÉ, ET LUI SEUL, EN DERNIÈRE LIGNE ────────────────
      const servis = corpsDe(reponses[1] ?? {}).tools ?? [];
      expect(
        servis.length,
        `§ 23 — le coffre est « verrouillé » et l'appel d'outil vient d'être refusé à ` +
          `l'étape 0, et pourtant \`tools/list\` sert ${String(servis.length)} descripteur(s) ` +
          "d'outil, schéma d'entrée compris. `servirToolsList` relit le catalogue et écrit : " +
          "il ne passe par aucune étape du § 11. La carte de la surface reste publique sur un " +
          "socle qui ne sert plus rien.",
      ).toBe(0);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LE COMPTE DES LIGNES D'`ops_audit` NE SUIT PAS LE COMPTE DES APPELS
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 · une ligne d'`ops_audit` par appel servi", () => {
  /**
   * LES SIX REQUÊTES SONT CELLES DU LANCEMENT RÉEL, dans le même ordre. Deux
   * d'entre elles sont des REFUS que le socle prononce sur le fil — méthode
   * inconnue, enveloppe de `jsonrpc` fautif — et le brief du lot demande
   * nommément si CHAQUE refus laisse une ligne. Réponse mesurée : non.
   */
  const LES_SIX_REQUETES: readonly string[] = [
    ligneJsonRpc(1, "initialize", { protocolVersion: "2025-06-18" }),
    ligneJsonRpc(2, "tools/list", {}),
    ligneJsonRpc(3, "tools/call", { name: OUTIL_BONJOUR.name, arguments: {} }),
    ligneJsonRpc(4, "methode/inconnue", {}),
    `${JSON.stringify({ jsonrpc: "1.0", id: 5, method: "tools/list", params: {} })}\n`,
    ligneJsonRpc(6, "tools/list", {}),
  ];

  it("mesure le compte des deux côtés, et l'ANNONCE — 6 requêtes servies", async () => {
    const harnais = fabriquerServeurDuHarnais();
    const { reponses, journal } = await servir(harnais, LES_SIX_REQUETES);

    // ⚠️ CE TÉMOIN NE JUGE PAS, IL COMPTE. C'est lui qui rendrait visible le
    //    jour où le serveur cesserait de répondre à une requête sur six : le
    //    témoin suivant, en `it.fails`, ne le distinguerait pas.
    expect(reponses).toHaveLength(LES_SIX_REQUETES.length);
    expect(harnais.harnais.resultats.length).toBe(1);
    expect(journal.length).toBe(1);
    expect(journal.every((ligne) => typeof ligne.selfHash === "string")).toBe(true);
  });

  /**
   * ⚠️ **VERT PARCE QUE LE DÉFAUT EST LÀ.** À retirer le jour où chaque appel
   *    servi — refus compris — laissera sa ligne.
   */
  it.fails(
    "§ 11 — chaque appel servi devrait laisser une ligne : 6 réponses écrites, 1 ligne",
    async () => {
      const harnais = fabriquerServeurDuHarnais();
      const { reponses, journal } = await servir(harnais, LES_SIX_REQUETES);

      // ── POSITIVES D'ABORD ──────────────────────────────────────────────────
      expect(reponses).toHaveLength(6);
      expect(journal.length).toBeGreaterThan(0);
      expect(journal[0]?.tool).toBe(OUTIL_BONJOUR.name);

      // ── L'INVARIANT ────────────────────────────────────────────────────────
      expect(
        journal.length,
        `§ 11 — le socle a écrit ${String(reponses.length)} réponse(s) sur le fil et ` +
          `${String(journal.length)} ligne(s) d'\`ops_audit\`. Les ${String(reponses.length - journal.length)} ` +
          "manquantes couvrent `initialize`, `tools/list` (trois fois), une méthode inconnue et " +
          "une enveloppe fautive — dont DEUX REFUS. Un refus qu'aucune ligne n'atteste ne se " +
          "relit nulle part : ni à l'écran Santé, ni dans les douze mois archivés du § 31.",
      ).toBe(reponses.length);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ LE NUMÉRO D'ÉTAPE : LE FIL ET LE JOURNAL DISENT-ILS LE MÊME ?
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA MATRICE DES CAUSES DE REFUS ATTEIGNABLES DEPUIS LE FIL.
 *
 * ⚠️ **ELLE EST ÉCRITE ICI, ET SON COMPTE EST ANNONCÉ — mais les NUMÉROS D'ÉTAPE
 *    n'y figurent pas.** Recopier « 0 », « 6 », « 7 » à côté de chaque cause
 *    ferait garder à ce fichier la table qu'il prétend éprouver : le jour où
 *    l'orchestrateur changerait un numéro, la garde rougirait sur SA propre
 *    recopie, pas sur la divergence. Ce qui est éprouvé ici est la COÏNCIDENCE
 *    des deux sources — le `step` que le fil publie et le `stepDenied` que le
 *    journal scelle —, quelle que soit sa valeur.
 */
const CAUSES_DE_REFUS = [
  {
    cause: "coffre verrouillé (§ 23)",
    harnais: (): ServeurDuHarnais => fabriquerServeurDuHarnais({ coffreFerme: true }),
    appel: { name: OUTIL_BONJOUR.name, arguments: {} },
  },
  {
    cause: "outil absent du catalogue (§ 09)",
    harnais: (): ServeurDuHarnais => fabriquerServeurDuHarnais(),
    appel: { name: "outil.qui.nexiste.pas", arguments: {} },
  },
  {
    cause: "outil hors du profil actif (§ 14)",
    harnais: (): ServeurDuHarnais =>
      fabriquerServeurDuHarnais({ outils: [OUTIL_BONJOUR], profilActif: "admin" }),
    appel: { name: OUTIL_BONJOUR.name, arguments: {} },
  },
] as const;

describe("§ 11 · le numéro de l'étape qui refuse, sur le fil et dans le journal", () => {
  it(`fait coïncider les deux sources sur ${String(CAUSES_DE_REFUS.length)} cause(s) de refus`, async () => {
    const releves: { cause: string; surLeFil: number; auJournal: number | null }[] = [];

    for (const entree of CAUSES_DE_REFUS) {
      const harnais = entree.harnais();
      const { reponses, journal } = await servir(harnais, [
        ligneJsonRpc(1, "tools/call", entree.appel),
      ]);
      const corps = corpsDe(reponses[0] ?? {});
      releves.push({
        cause: entree.cause,
        surLeFil: corps.step ?? -1,
        auJournal: journal[0]?.stepDenied ?? null,
      });
      // Le refus est bien PRONONCÉ, et il laisse bien UNE ligne : sans ces deux
      // assertions, la coïncidence pourrait se lire sur deux absences.
      expect(corps.isError, `« ${entree.cause} » n'a pas été refusé`).toBe(true);
      expect(journal, `« ${entree.cause} » n'a écrit aucune ligne`).toHaveLength(1);
    }

    const divergentes = releves.filter((releve) => releve.surLeFil !== releve.auJournal);
    expect(
      divergentes.length,
      `${String(releves.length)} cause(s) de refus mesurée(s) · ` +
        `${String(divergentes.length)} divergence(s) entre le \`step\` publié sur le fil et le ` +
        `\`stepDenied\` scellé au journal : ` +
        divergentes
          .map(
            (releve) =>
              `« ${releve.cause} » fil=${String(releve.surLeFil)} journal=${String(releve.auJournal)}`,
          )
          .join(" · "),
    ).toBe(0);
    // ⚠️ LE PLANCHER-TÉMOIN. Sans lui, une matrice vidée par accident rendrait
    //    ce témoin vert sans avoir mesuré une seule cause.
    expect(releves).toHaveLength(CAUSES_DE_REFUS.length);
    expect(new Set(releves.map((releve) => releve.surLeFil)).size).toBeGreaterThan(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④ LA LIGNE TROP LONGUE : LE SOCLE LA JETTE, ET NE LE DIT À PERSONNE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 30 · une ligne au-delà du plafond de cadrage", () => {
  /**
   * MESURÉ AU LANCEMENT RÉEL : une requête de 8 Mio sur le fil du processus n'a
   * produit AUCUNE réponse, AUCUNE ligne sur la sortie d'erreur, et le processus
   * est sorti avec le code 0. Ce témoin refait la mesure en mémoire et ANNONCE
   * le plafond dont il dérive sa charge, plutôt que d'écrire un nombre.
   */
  it(`jette la ligne sans répondre — plafond dérivé : ${String(CARACTERES_MAX_PAR_LIGNE)} caractères`, async () => {
    const harnais = fabriquerServeurDuHarnais();
    // La charge est DÉRIVÉE du plafond, jamais recopiée : un plafond qui change
    // fait suivre ce témoin au lieu de le rendre vide.
    const rembourrage = "A".repeat(CARACTERES_MAX_PAR_LIGNE + 1_000);
    const trop = `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: OUTIL_BONJOUR.name, arguments: { note: rembourrage } },
    })}\n`;
    expect(trop.length).toBeGreaterThan(CARACTERES_MAX_PAR_LIGNE);

    const { reponses, journal } = await servir(harnais, [trop]);

    expect(
      reponses.length,
      "une ligne au-delà du plafond n'a produit aucune réponse : l'appelant, lui, attend " +
        "toujours la sienne, et rien sur aucun canal ne lui dit que sa requête a été jetée.",
    ).toBe(0);
    expect(journal).toHaveLength(0);
    // Et la mesure qui le prouve du côté du serveur : le rebut est COMPTÉ par
    // sa cause, et il l'ANNONCE — à qui sait le lui demander.
    const cadrage = harnais.serveur.mesures().cadrage;
    expect(cadrage.rebuts["ligne-trop-longue"]).toBe(1);
    expect(cadrage.messagesLivres).toBe(0);

    // ── LE SOCLE SE REMET-IL ? La ligne SUIVANTE doit être servie ────────────
    await harnais.serveur.absorber(ligneJsonRpc(2, "tools/list", {}));
    expect(
      harnais.reponses().length,
      "après une ligne jetée, la ligne suivante doit repartir : sans quoi une seule requête " +
        "trop longue suffirait à faire taire le socle pour de bon.",
    ).toBe(1);
  });

  /**
   * ⚠️ **VERT PARCE QUE PERSONNE NE LIT LE COMPTE.** `MesuresDuServeurStdio` et
   *    `RapportDEtapesExercees` existent, et `core/coutures/registre.ts:1660`
   *    écrit que l'écran Santé (§ 22) et le § 24 doivent pouvoir les lire. Aucun
   *    module de production ne les appelle : `ops/service.ts` n'expose ni l'un
   *    ni l'autre sur `ServiceMonte`, et `ops/index.ts` n'en écrit rien sur la
   *    sortie d'erreur. Le socle SAIT qu'il a jeté une ligne, et il est le seul.
   */
  it.fails(
    "le socle devrait ANNONCER qu'il a jeté une ligne : `enveloppesFautives` reste privé",
    async () => {
      const harnais = fabriquerServeurDuHarnais();
      const rembourrage = "A".repeat(CARACTERES_MAX_PAR_LIGNE + 1_000);
      await harnais.serveur.absorber(
        `${JSON.stringify({ jsonrpc: "2.0", id: 1, x: rembourrage })}\n`,
      );

      // ── POSITIVES ──────────────────────────────────────────────────────────
      expect(harnais.serveur.mesures().cadrage.rebuts["ligne-trop-longue"]).toBe(1);
      expect(harnais.serveur.mesures().cadrage.messagesLivres).toBe(0);
      expect(harnais.harnais.lignes()).toHaveLength(0);

      // ── L'INVARIANT : quelque chose est-il SORTI du serveur ? ──────────────
      expect(
        harnais.sortie.length,
        "la ligne a été jetée et le serveur n'a rien écrit : ni réponse, ni trace. Le seul " +
          "témoin de l'incident est `mesures().cadrage`, qu'aucun module de production " +
          "n'appelle (`ops/service.ts` ne l'expose pas sur `ServiceMonte`). Un socle qui perd " +
          "des requêtes en silence est indiscernable d'un socle qui n'en reçoit pas.",
      ).toBeGreaterThan(0);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑤ LE CATALOGUE SERVI IGNORE QUI APPELLE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 14 · `tools/list` et le profil actif", () => {
  /**
   * ⚠️ **VERT PARCE QUE LE DÉFAUT EST LÀ.** `CatalogueServiEnStdio.listerPourCetAppel`
   *    REÇOIT l'identité de l'appelant — le nom de la méthode le dit —, et la
   *    seule implémentation de production, `catalogueDesAdaptateursAdmis`
   *    (`ops/index.ts`), la nomme `_identite` et rend la liste telle quelle. Un
   *    outil hors du profil actif est donc PUBLIÉ par `tools/list` et REFUSÉ par
   *    `tools/call` à l'étape 7 — mesuré au lancement, les deux réponses dans la
   *    même session. Le § 14, correction 3, énonce trois conditions dont
   *    « sorti de `tools/list` » : la troisième n'a aucun exécutant sur ce fil.
   */
  it.fails(
    "§ 14 — un outil hors du profil actif ne devrait pas être publié : `tools/list` le sert",
    async () => {
      const harnais = fabriquerServeurDuHarnais({
        outils: [OUTIL_BONJOUR],
        profilActif: "admin",
      });
      const { reponses } = await servir(harnais, [
        ligneJsonRpc(1, "tools/call", { name: OUTIL_BONJOUR.name, arguments: {} }),
        ligneJsonRpc(2, "tools/list", {}),
      ]);

      // ── POSITIVES : l'outil est bien REFUSÉ à l'appel ──────────────────────
      expect(reponses).toHaveLength(2);
      expect(corpsDe(reponses[0] ?? {}).isError).toBe(true);
      expect(corpsDe(reponses[0] ?? {}).code).toBe("tool_not_in_profile");
      expect(HABILITATIONS_DU_HARNAIS.peutVoirAppels).toBe(false);

      // ── L'INVARIANT : et pourtant il est PUBLIÉ ────────────────────────────
      const publies = corpsDe(reponses[1] ?? {}).tools ?? [];
      expect(
        publies.length,
        `l'appel de « ${OUTIL_BONJOUR.name} » vient d'être refusé à l'étape 7 pour cause de ` +
          `profil, et \`tools/list\` publie ${String(publies.length)} descripteur(s) dans la ` +
          "MÊME session. `listerPourCetAppel` reçoit l'identité et ne s'en sert pas.",
      ).toBe(0);
    },
  );
});
