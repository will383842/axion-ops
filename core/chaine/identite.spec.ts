import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sansCommentaires, sansCommentairesNiChaines } from "../adapter-kit/autorisation.js";
import {
  APPELANTS_DE_LA_RELECTURE,
  ErreurSessionIdNonSouverain,
  FORME_SESSION_ID,
  FRAPPEURS_DE_SESSION,
  OCTETS_SESSION_ID,
  creerFabriqueSessionId,
} from "../identite/session.js";
import type { FabriqueSessionId, SessionId } from "../identite/session.js";
import { resumeDeSession } from "../identite/fixtures.js";
import type { Habilitations } from "../types.js";
import {
  IndexProvenanceMemoire,
  etape11Provenance,
  marquerResultat,
} from "./etape-11-provenance.js";
import { SESSION_DE_CETTE_EXECUTION, sessionDuJetonRelu } from "./identite.js";
import type { LigneOpsTokenRelue } from "./identite.js";
import { PRINCIPAL_STDIO, identiteHttp, identiteStdio } from "./orchestrateur.js";
import type { IdentiteAppelante } from "./orchestrateur.js";

/**
 * GARDES DE LA SOUVERAINETÉ DU `sessionId` — ADR 0014, § 11, § 19.1, § 20.
 *
 * ═══ LE DÉFAUT QUE CE FICHIER FERME, ET SA MESURE ═══
 *
 * Toute la garde d'exfiltration du § 20 s'ancre sur UNE clé : `sessionId`. À la
 * fin du lot 1b, rien ne la contraignait — le `principal` d'`identiteStdio()`
 * était imposé, le `sessionId` juste à côté était un paramètre ordinaire.
 * L'épreuve adverse l'a mesuré sur le pire cas, celui que le § 20 dit
 * inconditionnel :
 *
 *     verdict même session       : refusé
 *     verdict session renouvelée : AUTORISÉ
 *
 * Un appelant qui renouvelait son `sessionId` entre la lecture et l'appel
 * suivant annulait l'étape 11 en entier. L'index restait peuplé, la marque
 * restait vivante — elle était simplement cherchée au mauvais endroit. Aucun
 * compte ne bougeait, aucune garde ne rougissait.
 *
 * ═══ LES TROIS ÉTAGES DE CE FICHIER, ET CE QUE CHACUN VAUT ═══
 *
 *  · **le TYPE** (`pnpm typecheck`) — une chaîne venue du réseau ne compile plus
 *    en `SessionId`. C'est le seul étage qui arrive à l'heure : un contrôle au
 *    runtime se découvre quand le transport est écrit, câblé et déployé ;
 *  · **le GRAPHE D'IMPORTS** (G2) — qui, dans tout ce qui est LIVRÉ, peut frapper
 *    une session. C'est cet étage qui porte la garantie ;
 *  · **le MOTIF DE TEXTE** (G3) — les conversions forcées. ⚠️ **Il ne prouve que
 *    l'absence de la FORME ÉCRITE**, jamais l'absence du défaut. Il est écrit ici
 *    comme un filet, et sa couleur ne doit jamais être lue comme une preuve.
 *
 * ⚠️ RÈGLE DE CE FICHIER : chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A
 *    MESURÉS, et échoue sous son plancher-témoin. Une garde qui parcourt zéro
 *    fichier est verte pour la pire des raisons — c'est exactement le mode de
 *    panne d'une garde qui dérive d'un chemin, le jour où le chemin bouge.
 */

const INSTANT = new Date("2026-08-31T09:00:00.000Z");
const HABILITATIONS: Habilitations = { peutVoirAppels: false, roleConsole: null };

/** Le domaine chez qui la session lit du `personal`. */
const DOMAINE_LU = "courrier";
/** L'AUTRE domaine — celui vers lequel l'argument libre partirait. */
const DOMAINE_TIERS = "facturation";

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE 0 — LA FABRIQUE : forme, unicité, et refus de relecture
// ═════════════════════════════════════════════════════════════════════════════

describe("core/identite — la fabrique est le seul chemin vers une session", () => {
  it("frappe des sessions à la FORME du § 31 et jamais deux fois la même", () => {
    const fabrique = creerFabriqueSessionId();

    // ⚠️ L'INSTRUMENT SE PROUVE AVANT DE SERVIR. Un tirage de UNE session
    //    rendrait « toutes distinctes » pour la pire des raisons.
    const TIRAGES = 1_000;
    const vues = new Set<string>();
    let horsForme = 0;
    for (let rang = 0; rang < TIRAGES; rang += 1) {
      const session =
        rang % 2 === 0 ? fabrique.pourUnOctroi() : fabrique.pourCetteExecutionDuDemon();
      if (!FORME_SESSION_ID.test(session)) horsForme += 1;
      vues.add(session);
    }

    console.info(
      `[garde fabrique] ${String(TIRAGES)} session(s) frappée(s) · ` +
        `${String(vues.size)} distincte(s) · ${String(horsForme)} hors forme · ` +
        `${String(OCTETS_SESSION_ID)} octets d'aléa, soit ${String(OCTETS_SESSION_ID * 2)} caractères`,
    );

    expect(vues.size).toBe(TIRAGES);
    expect(horsForme).toBe(0);
    // La forme est DÉRIVÉE de la taille de l'aléa, pas écrite deux fois.
    expect([...vues][0]).toHaveLength(OCTETS_SESSION_ID * 2);
  });

  it("REFUSE de relire une valeur qui n'a pas la forme, et ne se replie sur rien", () => {
    const fabrique = creerFabriqueSessionId();

    // Cinq façons dont une colonne peut mentir. Aucune ne doit rendre une
    // session frappée à la volée : une base corrompue doit s'entendre.
    const temoins: ReadonlyArray<readonly [string, string]> = [
      ["colonne vide", ""],
      ["identifiant lisible", "session-de-will-31-aout"],
      ["hexadécimal trop court", "abcdef"],
      ["hexadécimal en majuscules", "A".repeat(64)],
      ["forme juste, mais avec un retour à la ligne — motif non ancré", `${"a".repeat(64)}\n`],
    ];

    const passesAuTravers: string[] = [];
    const longueursRapportees: number[] = [];
    for (const [nom, valeur] of temoins) {
      try {
        fabrique.relireDepuisLeSocle(valeur, "ops_token.sessionId");
        passesAuTravers.push(nom);
      } catch (erreur) {
        expect(erreur, nom).toBeInstanceOf(ErreurSessionIdNonSouverain);
        const refus = erreur as ErreurSessionIdNonSouverain;
        longueursRapportees.push(refus.longueur);
        // § 15 — l'erreur ne fait fuir AUCUN contenu : elle porte la longueur.
        if (valeur.length > 0) expect(refus.message).not.toContain(valeur);
      }
    }

    console.info(
      `[garde relecture] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(passesAuTravers.length)} passé(s) au travers · ` +
        `longueurs rapportées : ${longueursRapportees.join(", ")}`,
    );

    expect(passesAuTravers).toEqual([]);
    expect(longueursRapportees).toHaveLength(temoins.length);

    // ✅ ET ELLE SAIT DIRE OUI — sans quoi les cinq refus ci-dessus seraient
    //    verts pour une fabrique qui refuse tout, y compris ce qu'elle a frappé.
    const frappee = fabrique.pourUnOctroi();
    expect(fabrique.relireDepuisLeSocle(frappee, "ops_token.sessionId")).toBe(frappee);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE SERVEUR D'AUTORISATION TÉMOIN — § 19.1, et le rôle du transport HTTP
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE DOUBLE JOUE DEUX RÔLES QUI N'EXISTENT PAS ENCORE, ET C'EST DÉLIBÉRÉ.
 *
 *  · le SERVEUR D'AUTORISATION du § 19.1, qui frappe la session **à l'octroi**
 *    et l'écrit dans la colonne `ops_token.sessionId` — du TEXTE, comme en base ;
 *  · le TRANSPORT HTTP (`core/transport/http.ts`, lot suivant), qui relit cette
 *    colonne à l'étape 4 par `relireDepuisLeSocle()`.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Ce que ces tests mesurent est que la
 *    CHAÎNE tient *si* le serveur d'autorisation propage la colonne d'un jeton
 *    rafraîchi à l'autre. Que le vrai émetteur le fasse est une propriété du lot
 *    qui l'écrira — elle n'est pas mesurée ici, et aucune couleur de ce fichier
 *    ne doit être lue comme si elle l'était. Ce qui EST mesuré ici, et qui ne
 *    l'était pas avant, c'est que la chaîne d'appel ne laisse plus AUCUN autre
 *    chemin d'entrée à cette valeur.
 */
interface OctroiTemoin {
  /** La COLONNE `ops_token.sessionId`, telle qu'elle vit en base : du texte. */
  readonly colonneSessionId: string;
  /** Un jeton d'accès neuf, relu comme l'étape 4 le fera. Fait tourner le `jti`. */
  jetonDAcces(): LigneOpsTokenRelue;
  /** Combien de `jti` cet octroi a produits. Le compte, pas une impression. */
  jtiEmis(): number;
}

function serveurDAutorisationTemoin(fabrique: FabriqueSessionId): {
  octroyer(principal: string): OctroiTemoin;
  octroisFrappes(): number;
} {
  let octrois = 0;

  return {
    octroyer(principal: string): OctroiTemoin {
      octrois += 1;
      // § 19.1 — LA SESSION EST FRAPPÉE ICI, au consentement. Elle est ensuite
      // stockée comme une colonne texte : c'est le seul état qui persiste.
      const colonneSessionId: string = fabrique.pourUnOctroi();
      let jti = 0;

      return {
        colonneSessionId,
        jetonDAcces(): LigneOpsTokenRelue {
          jti += 1;
          return {
            // Il TOURNE — § 19.1, jeton d'accès d'une heure.
            jti: `jti-${String(octrois)}-${String(jti)}`,
            // Elle NE TOURNE PAS : c'est le geste du transport à l'étape 4.
            sessionId: fabrique.relireDepuisLeSocle(colonneSessionId, "ops_token.sessionId"),
            principal,
          };
        },
        jtiEmis(): number {
          return jti;
        },
      };
    },
    octroisFrappes(): number {
      return octrois;
    },
  };
}

function identiteDepuis(jeton: LigneOpsTokenRelue): IdentiteAppelante {
  return identiteHttp({
    jeton,
    scopes: ["ops:read", "ops:draft"],
    habilitations: HABILITATIONS,
    requestId: `req-${jeton.jti}`,
    deadline: new Date(INSTANT.getTime() + 30_000),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE 1a — LES DEUX DÉRIVATIONS : ce qui change, et ce qui ne change pas
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0014 — la session suit l'OCTROI, jamais le `jti`", () => {
  it("deux appels du MÊME jeton portent la MÊME session", () => {
    const serveur = serveurDAutorisationTemoin(creerFabriqueSessionId());
    const octroi = serveur.octroyer("principal-temoin");

    const jeton = octroi.jetonDAcces();
    const premier = identiteDepuis(jeton);
    const second = identiteDepuis(jeton);

    console.info(
      `[dérivation HTTP] 1 octroi · ${String(octroi.jtiEmis())} jti émis · ` +
        `2 appels confrontés · session ${resumeDeSession(premier.sessionId)} / ` +
        `${resumeDeSession(second.sessionId)}`,
    );

    expect(premier.sessionId).toBe(second.sessionId);
    expect(premier.sessionId).toBe(sessionDuJetonRelu(jeton));
    expect(premier.principal).toBe("principal-temoin");
  });

  it("un RAFRAÎCHISSEMENT côté client ne change RIEN — c'est toute la décision", () => {
    const serveur = serveurDAutorisationTemoin(creerFabriqueSessionId());
    const octroi = serveur.octroyer("principal-temoin");

    // Le client MCP rafraîchit tout seul, sans geste humain : § 19.1, jeton
    // d'accès d'une heure contre une marque de provenance de quatre heures.
    // Trois rafraîchissements = ce qu'un TTL de marque voit passer.
    const jetons = [octroi.jetonDAcces(), octroi.jetonDAcces(), octroi.jetonDAcces()];
    const identites = jetons.map(identiteDepuis);
    const sessions = new Set(identites.map((identite) => identite.sessionId));
    const jtis = new Set(jetons.map((jeton) => jeton.jti));

    console.info(
      `[dérivation HTTP] ${String(jtis.size)} jti DISTINCT(s) sur ${String(jetons.length)} ` +
        `jeton(s) du MÊME octroi · ${String(sessions.size)} session(s) distincte(s) — ` +
        `attendu : 1`,
    );

    // Le `jti` tourne…
    expect(jtis.size).toBe(jetons.length);
    // …et la session ne tourne pas. Une session dérivée du `jti` en aurait
    // rendu trois, donc se serait effacée trois fois par TTL de marque.
    expect(sessions.size).toBe(1);
  });

  it("deux OCTROIS distincts portent deux sessions distinctes", () => {
    const serveur = serveurDAutorisationTemoin(creerFabriqueSessionId());
    const premier = serveur.octroyer("principal-temoin");
    const second = serveur.octroyer("principal-temoin");

    const sessionA = identiteDepuis(premier.jetonDAcces()).sessionId;
    const sessionB = identiteDepuis(second.jetonDAcces()).sessionId;

    console.info(
      `[dérivation HTTP] ${String(serveur.octroisFrappes())} octroi(s) frappé(s) · ` +
        `sessions ${resumeDeSession(sessionA)} et ${resumeDeSession(sessionB)} — distinctes : ` +
        `${String(sessionA !== sessionB)}`,
    );

    expect(serveur.octroisFrappes()).toBe(2);
    expect(sessionA).not.toBe(sessionB);
    // Et le MÊME principal : ce n'est pas le principal qui distingue, c'est
    // l'octroi — donc un consentement humain de plus.
    expect(premier.colonneSessionId).not.toBe(second.colonneSessionId);
  });

  it("stdio : deux identités du MÊME démon portent la MÊME session, et elle n'est pas un paramètre", () => {
    const commun = {
      habilitations: HABILITATIONS,
      deadline: new Date(INSTANT.getTime() + 30_000),
    };
    const premiere = identiteStdio({ ...commun, requestId: "req-1" });
    const seconde = identiteStdio({ ...commun, requestId: "req-2" });

    console.info(
      `[dérivation stdio] 2 identité(s) frappée(s) dans le même processus · ` +
        `session ${resumeDeSession(SESSION_DE_CETTE_EXECUTION)} · ` +
        `principal réservé « ${premiere.principal} »`,
    );

    expect(premiere.sessionId).toBe(seconde.sessionId);
    expect(premiere.sessionId).toBe(SESSION_DE_CETTE_EXECUTION);
    // Elle a la forme du socle : ce n'est pas une chaîne écrite quelque part.
    expect(FORME_SESSION_ID.test(SESSION_DE_CETTE_EXECUTION)).toBe(true);
    // Et le principal reste imposé, comme il l'était déjà.
    expect(premiere.principal).toBe(PRINCIPAL_STDIO);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE 1b — LE VERROU DE COMPILATION (vérifié par `pnpm typecheck`)
// ═════════════════════════════════════════════════════════════════════════════

/** Une fonction qui EXIGE une session. C'est elle qui rend la marque mesurable. */
function exigeUneSession(session: SessionId): number {
  return session.length;
}

/**
 * La colonne `ops_token.sessionId` telle qu'elle sort d'une base : du TEXTE.
 * Elle a la bonne forme — et c'est le point : la forme n'a jamais été le verrou,
 * la PROVENANCE l'est.
 */
const COLONNE_BRUTE: string = "a".repeat(64);

describe("ADR 0014 — une session forgée depuis une chaîne ne compile pas", () => {
  it("pose TROIS assertions inversées, que `pnpm typecheck` seul vérifie", () => {
    // ═══ LA GARDE, DANS SA FORME EXACTE ═══
    //
    // Chaque `@ts-expect-error` ci-dessous est une assertion INVERSÉE : `tsc`
    // échoue si l'erreur attendue NE SE PRODUIT PLUS. Elles ne rougissent donc
    // pas sous `pnpm test`, qui transpile sans typer — elles vivent dans
    // `pnpm typecheck`, et c'est là qu'il faut les lire.
    //
    // ⚠️ LES TROIS NE DÉPENDENT QUE DE LA MARQUE, ET C'EST VÉRIFIÉ, PAS SUPPOSÉ.
    //    Mesuré en remplaçant `SessionId = string & { …marque… }` par
    //    `SessionId = string` dans `core/identite/session.ts` : `tsc` signale
    //    alors EXACTEMENT TROIS « Unused '@ts-expect-error' directive », une par
    //    ligne ci-dessous, et aucune autre erreur. Une quatrième directive qui
    //    resterait utilisée dirait qu'elle mesure autre chose que la marque —
    //    une propriété en trop, un paramètre disparu — et donnerait à cette
    //    garde une couleur qu'elle n'a pas gagnée.

    // @ts-expect-error — une chaîne de 64 hexadécimaux N'EST PAS une session
    const forgeeDepuisUnLitteral: SessionId = "0".repeat(64);

    const identiteForgee: IdentiteAppelante = {
      principal: "principal-temoin",
      // @ts-expect-error — un transport ne pose plus de chaîne dans cette identité
      sessionId: "0".repeat(64),
      scopes: ["ops:read"],
      habilitations: HABILITATIONS,
      requestId: "req-temoin",
      deadline: INSTANT,
    };

    // @ts-expect-error — la COLONNE brute n'est une session qu'après relecture
    const depuisLaColonne = exigeUneSession(COLONNE_BRUTE);

    // Au runtime, rien de tout cela n'échoue : c'est le COMPILATEUR qui est la
    // garde. On mesure quand même les trois témoins, pour qu'aucun ne disparaisse
    // en silence d'un fichier de test.
    const temoins = [forgeeDepuisUnLitteral, identiteForgee.sessionId, depuisLaColonne];
    console.info(
      `[garde compilation] ${String(temoins.length)} témoin(s) de non-compilation posé(s) — ` +
        "vérifiés par `pnpm typecheck`, jamais par `pnpm test`",
    );
    expect(temoins).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE G1 — LE RENOUVELLEMENT N'ANNULE PLUS RIEN (§ 20, rejeu du lot 1b)
// ═════════════════════════════════════════════════════════════════════════════

describe("G1 — § 20 : renouveler sa session n'annule plus l'étape 11", () => {
  /**
   * LE REJEU EXACT DE L'ÉPREUVE DU LOT 1b, MAIS PAR LE HAUT.
   *
   * L'épreuve d'origine posait deux `ContexteProvenance` à la main, avec deux
   * chaînes différentes. Ce rejeu-ci part de l'IDENTITÉ, c'est-à-dire du seul
   * endroit d'où une session peut désormais venir — et le geste de l'attaque, «
   * je change de session entre les deux appels », n'y a plus de forme.
   *
   * ⚠️ LE TÉMOIN **EST** LE DÉFAUT. Il est vert le jour où la seconde session ne
   *    peut plus être fabriquée par le chemin que l'attaquant contrôle.
   */
  it("branche « gouvernance » : quatre branches confrontées, une seule autorise", () => {
    const index = new IndexProvenanceMemoire({ maintenant: () => INSTANT });
    const serveur = serveurDAutorisationTemoin(creerFabriqueSessionId());
    const octroi = serveur.octroyer("principal-temoin");

    // ── 1 · la session LIT du `personal` chez un premier domaine ────────────
    const identiteDeLecture = identiteDepuis(octroi.jetonDAcces());
    const aMarque = marquerResultat(index, {
      sessionId: identiteDeLecture.sessionId,
      adapterId: DOMAINE_LU,
      dataClass: "personal",
      empreintes: ["empreinte-de-l-extrait-lu"],
    });

    // ⚠️ LE DÉMON stdio LIT SOUS SA PROPRE SESSION, ET IL FALLAIT LE MESURER.
    //    Un premier jet de ce témoin marquait la session HTTP puis appelait en
    //    stdio, et rendait « autorise » : évidemment, ce sont deux sessions
    //    différentes, et rien n'était éprouvé. Le geste de l'attaque n'est pas
    //    « changer de transport » — un poste local ne dispose pas du jeton HTTP —
    //    c'est « rouvrir une session DANS LE MÊME transport ». C'est donc sous la
    //    session du démon qu'il faut marquer pour l'éprouver.
    const identiteStdioDeLecture = identiteStdio({
      requestId: "req-stdio-lecture",
      deadline: new Date(INSTANT.getTime() + 30_000),
      habilitations: HABILITATIONS,
    });
    const aMarqueEnStdio = marquerResultat(index, {
      sessionId: identiteStdioDeLecture.sessionId,
      adapterId: DOMAINE_LU,
      dataClass: "personal",
      empreintes: ["empreinte-de-l-extrait-lu-en-stdio"],
    });

    /** Le pire cas du § 20 : argument libre ET de gouvernance, AUTRE domaine. */
    const appelVersUnAutreDomaine = (session: SessionId): string =>
      etape11Provenance({
        sessionId: session,
        adapterId: DOMAINE_TIERS,
        porteUnArgumentLibre: true,
        porteUnArgumentDeGouvernance: true,
        niveau: "brouillon",
        index,
      }).issue;

    // ── 2 · les quatre branches ────────────────────────────────────────────
    const memeJeton = appelVersUnAutreDomaine(identiteDeLecture.sessionId);

    // Le rafraîchissement : ce que le client MCP conduit TOUT SEUL. C'était le
    // contournement gratuit ; il ne l'est plus, parce qu'il ne change plus rien.
    const apresRafraichissement = appelVersUnAutreDomaine(
      identiteDepuis(octroi.jetonDAcces()).sessionId,
    );

    // stdio : une SECONDE identité du même démon. Le paramètre a disparu, donc
    // le poste local n'a plus aucune façon de repartir sur une session propre
    // sans redémarrer le processus — et redémarrer lui coûte tout ce qu'il a lu.
    const enStdio = appelVersUnAutreDomaine(
      identiteStdio({
        requestId: "req-stdio-appel",
        deadline: new Date(INSTANT.getTime() + 30_000),
        habilitations: HABILITATIONS,
      }).sessionId,
    );

    // ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : un NOUVEL OCTROI ouvre bien une
    //    nouvelle session, et il n'y a rien à corriger là — c'est ce que l'ADR
    //    0014 accepte explicitement. Il coûte un consentement humain, ce qui est
    //    le prix voulu, et c'est aussi ce qui prouve que l'instrument SAIT DIRE
    //    OUI : sans cette branche, les trois refus ci-dessus seraient verts pour
    //    une étape 11 qui refuserait tout.
    const apresUnNouvelOctroi = appelVersUnAutreDomaine(
      identiteDepuis(serveur.octroyer("principal-temoin").jetonDAcces()).sessionId,
    );

    const etat = index.etat();
    const branches = [
      ["même jeton", memeJeton],
      ["jeton rafraîchi (aucun geste humain)", apresRafraichissement],
      ["stdio, même démon", enStdio],
      ["NOUVEL octroi (geste humain)", apresUnNouvelOctroi],
    ] as const;

    console.info(
      `[G1] ${String(branches.length)} branche(s) confrontée(s) · ` +
        `${String(etat.sessions)} session(s) marquée(s) · ` +
        `${String(etat.extraits)} extrait(s) indexé(s) · indéterminé : ${String(etat.indetermine)}\n` +
        branches.map(([nom, issue]) => `        · ${nom} : ${issue}`).join("\n"),
    );

    // L'index est PEUPLÉ : sans ce compte, un verdict « autorise » serait
    // indiscernable d'un index vide, et la garde verte pour rien.
    expect(aMarque).toBe(true);
    expect(aMarqueEnStdio).toBe(true);
    expect(etat.sessions).toBe(2);
    expect(etat.extraits).toBe(2);
    expect(etat.indetermine).toBe(false);

    expect(memeJeton, "sous la session de lecture, la branche « JAMAIS » mord").toBe("refuse");
    expect(apresRafraichissement, "✅ ADR 0014 — le rafraîchissement ne blanchit plus").toBe(
      "refuse",
    );
    expect(enStdio, "stdio ne peut plus s'ouvrir une session propre dans le même démon").toBe(
      "refuse",
    );
    expect(apresUnNouvelOctroi, "borne acceptée : un nouvel octroi coûte un geste humain").toBe(
      "autorise",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'INSTRUMENT DES GARDES G2 ET G3 — parcours des sources
// ═════════════════════════════════════════════════════════════════════════════

/** La racine du dépôt, DÉRIVÉE de l'emplacement de ce fichier. */
const RACINE = new URL("../../", import.meta.url);

/**
 * LE DOSSIER PROPRIÉTAIRE — celui où frapper une session est le métier.
 *
 * ⚠️ CE CHEMIN N'EST PAS UNE RECOPIE MUETTE. L'import `../identite/session.js`
 *    en tête de ce fichier est résolu par le compilateur : un déménagement du
 *    dossier casse la COMPILATION avant que ce balayage ne devienne aveugle.
 *    C'est exactement ce qui manque à une garde au chemin codé en dur.
 */
const DOSSIER_IDENTITE = "core/identite/";

/** Le fragment qui sert de PRÉ-FILTRE textuel. Dérivé du dossier ci-dessus. */
const FRAGMENT_IDENTITE = DOSSIER_IDENTITE.slice(DOSSIER_IDENTITE.indexOf("/") + 1);

/** Un fichier source parcouru : son chemin relatif au dépôt, et son texte. */
interface FichierSource {
  readonly chemin: string;
  readonly source: string;
}

/**
 * CE FICHIER-CI PORTE LES MOTIFS QU'IL CHERCHE — il les écarte de ses propres
 * balayages, exactement comme `core/audit/derivation.spec.ts` le fait pour les
 * siens.
 *
 * ⚠️ ET C'EST UN TROU, ÉCRIT AVEC LA GARDE. Les conversions forcées et les
 *    imports que ce fichier porte dans ses témoins ne sont gardés par personne.
 *    C'est le prix d'un instrument qui doit pouvoir écrire ce qu'il refuse ; ce
 *    qui le rend supportable est qu'il ne SHIPPE PAS — `pnpm build` ne l'émet
 *    pas, donc rien de ce qu'il écrit n'ouvre de session à quiconque.
 *
 * Il est DÉRIVÉ de l'emplacement réel du fichier, jamais recopié : le jour où il
 * déménage, l'exclusion le suit.
 */
const CE_FICHIER = decodeURIComponent(import.meta.url.slice(RACINE.href.length));

/** Écarte le fichier qui porte les motifs, et ANNONCE qu'il l'a fait. */
function sansCeFichier(fichiers: readonly FichierSource[]): readonly FichierSource[] {
  return fichiers.filter((fichier) => fichier.chemin !== CE_FICHIER);
}

/** Lit un fichier JSON qui porte des commentaires (`tsconfig`), sans `jsonc`. */
function lireJsonc(relatif: string): unknown {
  const texte = readFileSync(fileURLToPath(new URL(relatif, RACINE)), "utf8");
  return JSON.parse(sansCommentaires(texte));
}

/**
 * LES RACINES DU PROGRAMME, DÉRIVÉES DE `tsconfig.json`.
 *
 * ⚠️ POURQUOI PAS `["core"]` ÉCRIT À LA MAIN. Le jour où `adapters/` ou
 *    `voice/` porteront du code, une liste recopiée les manquerait — et la garde
 *    resterait verte en ne les regardant pas. C'est le mode de panne décrit par
 *    « une garde au chemin codé en dur devient muette au déménagement ».
 */
function racinesDuProgramme(): readonly string[] {
  const config = lireJsonc("tsconfig.json") as { include?: readonly string[] };
  const include = config.include ?? [];
  const racines = include
    .filter((motif) => motif.endsWith("/**/*.ts"))
    .map((motif) => motif.slice(0, motif.indexOf("/")))
    .filter((racine) => {
      try {
        return statSync(fileURLToPath(new URL(racine, RACINE))).isDirectory();
      } catch {
        return false;
      }
    });
  return [...new Set(racines)];
}

/** Parcourt récursivement les racines du programme et rend tous les `.ts`. */
function fichiersDuProgramme(): readonly FichierSource[] {
  const trouves: FichierSource[] = [];

  const descendre = (relatif: string): void => {
    const entrees = readdirSync(fileURLToPath(new URL(`${relatif}/`, RACINE)), {
      withFileTypes: true,
    });
    for (const entree of entrees) {
      const chemin = `${relatif}/${entree.name}`;
      if (entree.isDirectory()) {
        descendre(chemin);
      } else if (entree.name.endsWith(".ts")) {
        trouves.push({
          chemin,
          source: readFileSync(fileURLToPath(new URL(chemin, RACINE)), "utf8"),
        });
      }
    }
  };

  for (const racine of racinesDuProgramme()) descendre(racine);
  return trouves;
}

/**
 * LE PARCOURS EST FAIT **UNE FOIS**, ET RETENU.
 *
 * ⚠️ CE N'EST PAS UN CONFORT. Les trois gardes de ce fichier balaient le même
 *    dépôt ; sans mémoïsation, la lecture et le retrait des commentaires se
 *    faisaient trois fois, et le premier jet mettait 82 s — au-delà du délai de
 *    5 s de Vitest, donc ROUGE. Une garde trop lente pour tourner est une garde
 *    qu'on finit par retirer.
 */
let programmeRetenu: readonly FichierSource[] | null = null;

function programme(): readonly FichierSource[] {
  programmeRetenu ??= fichiersDuProgramme();
  return programmeRetenu;
}

/**
 * LE SOURCE SANS COMMENTAIRES, RETENU LUI AUSSI — et calculé SEULEMENT si le
 * texte brut contient déjà le motif cherché.
 *
 * ⚠️ CE PRÉ-FILTRE NE PEUT PAS AFFAIBLIR LA GARDE, ET LE MOTIF EST À ÉCRIRE :
 *    retirer les commentaires ne fait que SOUSTRAIRE du texte. Un fichier dont le
 *    source brut ne contient pas une sous-chaîne ne la contiendra pas davantage
 *    une fois les commentaires retirés. Le pré-filtre écarte donc des fichiers
 *    dont on sait, sans les analyser, qu'ils n'ont rien à dire.
 */
/**
 * ⚠️ LA CLÉ EST L'OBJET, JAMAIS LE CHEMIN — ET C'EST UN DÉFAUT MESURÉ, PAS UNE
 *    PRÉCAUTION. Le premier jet mémoïsait par chemin : les témoins fabriqués de
 *    G3 portent des chemins RÉELS (`core/policy/depot.ts`) pour ressembler à ce
 *    qu'ils imitent, et recevaient donc le contenu du VRAI fichier, déjà retenu
 *    par le balayage du dépôt. Le témoin « conversion posée dans un fichier
 *    quelconque » rendait alors zéro anomalie : la garde était verte parce
 *    qu'elle ne regardait pas ce qu'on lui donnait.
 */
const SANS_COMMENTAIRES = new WeakMap<FichierSource, string>();

function nu(fichier: FichierSource): string {
  let stocke = SANS_COMMENTAIRES.get(fichier);
  if (stocke === undefined) {
    stocke = sansCommentaires(fichier.source);
    SANS_COMMENTAIRES.set(fichier, stocke);
  }
  return stocke;
}

/**
 * LES LITTÉRAUX DE CHAÎNE, BLANCHIS — **ET SEULEMENT POUR G3.**
 *
 * ⚠️ **POURQUOI CE SECOND NETTOYAGE N'EST PAS APPLIQUÉ À `nu()`.** G2 lit les
 *    clauses d'`import`, dont le spécificateur EST une chaîne : blanchir les
 *    chaînes dans `nu()` ferait rendre ZÉRO import au graphe, c'est-à-dire une
 *    garde verte parce qu'elle ne regarde plus rien. Les deux nettoyages ont
 *    donc deux clients, et un seul ajoute celui-ci.
 *
 * ⚠️ **CE QUE G3 A COÛTÉ SANS LUI.** Le motif de G3 est resté ROUGE sur
 *    `core/types.ts` parce qu'un champ `motif:` NOMME la conversion forcée en
 *    prose. Une garde de sûreté rouge pour une phrase s'apprend à ignorer, puis
 *    se désactive : c'est ainsi qu'on perd un filet. Le témoin fabriqué « la
 *    même forme dans une CHAÎNE » ci-dessous existe pour que ce trou ne se
 *    rouvre pas en silence.
 *
 * ⚠️ **LE BALAYAGE EST CELUI DE `core/adapter-kit`, JAMAIS UNE SECONDE
 *    ÉCRITURE.** Une expression régulière écrite ici aurait suffi à passer les
 *    témoins et aurait été FAUSSE sur le dépôt : mesuré, une expression
 *    ``/`…`/g`` apparie le backtick FERMANT d'un gabarit avec le backtick
 *    OUVRANT du suivant et efface le code entre les deux. Deux dérivations d'un
 *    même fait finissent par se contredire ; il n'y en a qu'une, et le témoin
 *    « une conversion dans la SUBSTITUTION d'un gabarit » ci-dessous prouve
 *    qu'elle ne cache pas de geste.
 */
const SANS_CHAINES = new WeakMap<FichierSource, string>();

function nuNiChaines(fichier: FichierSource): string {
  let stocke = SANS_CHAINES.get(fichier);
  if (stocke === undefined) {
    stocke = sansCommentairesNiChaines(fichier.source);
    SANS_CHAINES.set(fichier, stocke);
  }
  return stocke;
}

/**
 * UN FICHIER EST-IL **LIVRÉ** ? Dérivé de l'`exclude` de `tsconfig.build.json`.
 *
 * ⚠️ C'EST LE BON CRITÈRE, ET « C'EST UN TEST » NE L'EST PAS. Ce qui rend une
 *    fabrique de sessions dangereuse est qu'elle TOURNE EN PRODUCTION. Un
 *    fichier que `pnpm build` n'émet pas n'ouvre de session à personne. Le jour
 *    où la liste d'exclusion change, cette garde change avec — sans qu'on la
 *    retouche.
 */
function fabriquerTestDeLivraison(): {
  readonly estLivre: (chemin: string) => boolean;
  readonly motifs: number;
} {
  const config = lireJsonc("tsconfig.build.json") as { exclude?: readonly string[] };
  const motifs = config.exclude ?? [];

  // ⚠️ UNE SEULE PASSE, ET AUCUN JETON INTERMÉDIAIRE. Le premier jet traduisait
  //    « toute profondeur » en caractères de contrôle avant de les retraduire.
  //    ESLint le refuse (`no-control-regex`), et il a raison pour une seconde
  //    raison : un motif qui aurait porté ces caractères aurait été réécrit en
  //    silence. Une passe unique n'a pas cet angle mort.
  const enRegex = (motif: string): RegExp => {
    if (!motif.includes("*") && !motif.includes(".")) {
      // « node_modules », « dist » : un préfixe de dossier.
      return new RegExp(`^${motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`);
    }
    const corps = motif.replace(
      /(\*\*\/)|(\*\*)|(\*)|([.+^${}()|[\]\\])/g,
      (
        _entier: string,
        toutePronfondeurEtSlash: string | undefined,
        touteProfondeur: string | undefined,
        unSegment: string | undefined,
        aEchapper: string | undefined,
      ): string => {
        if (toutePronfondeurEtSlash !== undefined) return "(?:.*/)?";
        if (touteProfondeur !== undefined) return ".*";
        if (unSegment !== undefined) return "[^/]*";
        return `\\${aEchapper ?? ""}`;
      },
    );
    return new RegExp(`^${corps}$`);
  };

  const regexes = motifs.map(enRegex);
  return {
    motifs: motifs.length,
    // Une propriété-flèche, pas une méthode : elle est passée par référence aux
    // gardes, et `unbound-method` refuse à raison qu'on détache une méthode.
    estLivre: (chemin: string): boolean => !regexes.some((regex) => regex.test(chemin)),
  };
}

/** Un import trouvé dans un source : ce qu'il vise, et s'il ne prend que des types. */
interface ImportTrouve {
  readonly cible: string;
  readonly typeSeul: boolean;
}

/**
 * LES IMPORTS D'UN FICHIER, RÉSOLUS EN CHEMINS DU DÉPÔT.
 *
 * ⚠️ BORNE ÉCRITE AVEC LA MESURE : ce n'est pas un analyseur syntaxique. Il lit
 *    les formes `import … from "…"` et `export … from "…"` d'un source dont les
 *    commentaires ont été retirés, et ne résout que les spécificateurs RELATIFS
 *    — les seuls par lesquels un module du dépôt en atteint un autre ici. Un
 *    `await import()` calculé lui échapperait ; le dépôt n'en contient aucun, et
 *    la garde de conformité du § 09 refuse déjà l'import dynamique aux
 *    adaptateurs.
 *
 * ⚠️ LE TYPE-SEUL EST LISIBLE PARCE QUE `verbatimModuleSyntax` EST ACTIF, et
 *    parce qu'ESLint impose `consistent-type-imports`. Sans ces deux réglages,
 *    la distinction ci-dessous n'aurait aucun fondement — elle est dérivée de la
 *    configuration, pas d'une convention d'écriture.
 */
function importsDe(fichier: FichierSource): readonly ImportTrouve[] {
  // Pré-filtre sur le texte BRUT — voir `nu()`. Seuls les imports qui VISENT le
  // dossier propriétaire comptent ; les autres n'ont rien à dire à cette garde.
  if (!fichier.source.includes(FRAGMENT_IDENTITE)) return [];
  const source = nu(fichier);
  const dossier = new URL(`${fichier.chemin.slice(0, fichier.chemin.lastIndexOf("/"))}/`, RACINE);
  const trouves: ImportTrouve[] = [];

  // ⚠️ LA CLAUSE EST BORNÉE PAR `[^;]`, ET C'EST UNE CORRECTION MESURÉE. Le
  //    premier jet écrivait `[\s\S]*?`, qui autorise la clause à traverser tout
  //    le fichier : chacun des ~200 `export` d'un module de 90 ko relançait un
  //    balayage jusqu'à la fin du texte, et le parcours du dépôt passait de
  //    quelques centaines de millisecondes à 55 s — au-delà du délai de Vitest,
  //    donc ROUGE pour une raison qui n'avait rien à voir avec la règle gardée.
  //    Une clause d'import ne contient jamais de `;` : la borne est exacte, pas
  //    prudentielle.
  const motif = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s+from\s*["']([^"']+)["']/g;
  for (const capture of source.matchAll(motif)) {
    const clause = (capture[2] ?? "").trim();
    const specificateur = capture[3] ?? "";
    if (!specificateur.startsWith(".")) continue;

    const absolu = new URL(specificateur.replace(/\.js$/, ".ts"), dossier).href;
    const racine = RACINE.href;
    if (!absolu.startsWith(racine)) continue;

    const membres = clause.startsWith("{")
      ? clause
          .slice(1, clause.lastIndexOf("}"))
          .split(",")
          .map((membre) => membre.trim())
          .filter((membre) => membre.length > 0)
      : [];

    trouves.push({
      cible: decodeURIComponent(absolu.slice(racine.length)),
      typeSeul:
        /^type\b/.test(clause) ||
        (membres.length > 0 && membres.every((membre) => /^type\b/.test(membre))),
    });
  }

  return trouves;
}

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE G2 — UN SEUL MODULE LIVRÉ FRAPPE DES SESSIONS (graphe d'imports)
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que G2 rend : des NOMBRES et des noms, jamais un booléen. */
interface VerdictG2 {
  readonly fichiersParcourus: number;
  readonly importateurs: number;
  readonly importateursTypeSeul: number;
  readonly importateursDeValeur: number;
  readonly anomalies: readonly string[];
}

function verifierGrapheDeSessions(
  fichiers: readonly FichierSource[],
  estLivre: (chemin: string) => boolean,
): VerdictG2 {
  const frappeurs = new Set<string>(FRAPPEURS_DE_SESSION);
  const anomalies: string[] = [];
  let importateurs = 0;
  let typeSeul = 0;
  let valeur = 0;

  for (const fichier of fichiers) {
    if (fichier.chemin.startsWith(DOSSIER_IDENTITE)) continue;

    for (const trouve of importsDe(fichier)) {
      if (!trouve.cible.startsWith(DOSSIER_IDENTITE)) continue;
      importateurs += 1;

      if (trouve.typeSeul) {
        // Un type ne frappe rien : il ne survit pas à la compilation.
        typeSeul += 1;
        continue;
      }
      valeur += 1;

      if (!estLivre(fichier.chemin)) continue;

      if (trouve.cible === `${DOSSIER_IDENTITE}fixtures.ts`) {
        anomalies.push(`${fichier.chemin} : un fichier LIVRÉ importe la fabrique de témoins`);
        continue;
      }
      if (!frappeurs.has(fichier.chemin)) {
        anomalies.push(
          `${fichier.chemin} : importe une VALEUR de ${trouve.cible} sans figurer dans ` +
            "`FRAPPEURS_DE_SESSION`",
        );
      }
    }
  }

  return {
    fichiersParcourus: fichiers.length,
    importateurs,
    importateursTypeSeul: typeSeul,
    importateursDeValeur: valeur,
    anomalies,
  };
}

describe("G2 — un seul module LIVRÉ peut frapper une session", () => {
  it("rougit sur des témoins fabriqués : un module de plus, et un double qui shipperait", () => {
    const livraison = fabriquerTestDeLivraison();

    const temoins: ReadonlyArray<readonly [string, FichierSource, number]> = [
      [
        "un module livré qui monte la fabrique",
        {
          chemin: "core/transport/inconnu.ts",
          source: 'import { creerFabriqueSessionId } from "../identite/session.js";\n',
        },
        1,
      ],
      [
        "un module livré qui importe la fabrique de témoins",
        {
          chemin: "core/policy/depot.ts",
          source: 'import { sessionIdDeTemoin } from "../identite/fixtures.js";\n',
        },
        1,
      ],
      [
        "un module livré qui n'en prend QUE le type — admis",
        {
          chemin: "core/audit/ports.ts",
          source: 'import type { SessionId } from "../identite/session.js";\n',
        },
        0,
      ],
      [
        "une spec qui monte la fabrique — admise, elle ne shippe pas",
        {
          chemin: "core/policy/ttl.spec.ts",
          source: 'import { creerFabriqueSessionId } from "../identite/session.js";\n',
        },
        0,
      ],
      [
        "un frappeur NOMMÉ — admis",
        {
          chemin: FRAPPEURS_DE_SESSION[0],
          source: 'import { creerFabriqueSessionId } from "../identite/session.js";\n',
        },
        0,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, fichier, attendues] of temoins) {
      const verdict = verifierGrapheDeSessions([fichier], livraison.estLivre);
      if (verdict.anomalies.length !== attendues) {
        desaccords.push(
          `${nom} : ${String(verdict.anomalies.length)} au lieu de ${String(attendues)}`,
        );
      }
    }

    console.info(
      `[G2, témoins] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(livraison.motifs)} motif(s) d'exclusion lu(s) dans tsconfig.build.json · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Plancher : sans motif d'exclusion, TOUT serait « livré », les specs
    // deviendraient des anomalies, et la garde rougirait — fail-closed, mais
    // pour la mauvaise raison. On mesure donc que la lecture a rendu quelque chose.
    expect(livraison.motifs).toBeGreaterThanOrEqual(2);
    expect(desaccords).toEqual([]);
  });

  it("ne trouve, dans le dépôt, aucun frappeur hors de la liste", () => {
    const livraison = fabriquerTestDeLivraison();
    const tous = programme();
    const verdict = verifierGrapheDeSessions(sansCeFichier(tous), livraison.estLivre);

    console.info(
      `[G2] ${String(tous.length)} fichier(s) du programme trouvé(s), ` +
        `${String(verdict.fichiersParcourus)} balayé(s) — ce fichier-ci porte les motifs · ` +
        `${String(verdict.importateurs)} import(s) de core/identite/ trouvé(s) — ` +
        `${String(verdict.importateursTypeSeul)} de TYPE seul, ` +
        `${String(verdict.importateursDeValeur)} de VALEUR · ` +
        `${String(FRAPPEURS_DE_SESSION.length)} frappeur(s) nommé(s) · ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    // Planchers-témoins : un dossier déplacé ferait lire zéro fichier et zéro
    // import, et cette garde resterait verte sans un mot.
    expect(verdict.fichiersParcourus).toBeGreaterThanOrEqual(60);
    expect(verdict.importateurs).toBeGreaterThanOrEqual(3);
    expect(verdict.anomalies).toEqual([]);
  });

  it("tient le CLIQUET des deux listes : elles ne se vident pas, et elles ne se confondent pas", () => {
    // ⚠️ FRAPPER ≠ RELIRE. Confondre les deux listes serait perdre la moitié de
    //    la garde : relire ne crée rien, frapper crée une session ex nihilo.
    //    Les frappeurs sont donc au plus aussi nombreux que les relecteurs.
    const relecteurs = new Set<string>(APPELANTS_DE_LA_RELECTURE);
    const frappeurs = new Set<string>(FRAPPEURS_DE_SESSION);
    const frappeursQuiNeRelisentPas = [...frappeurs].filter((chemin) => !relecteurs.has(chemin));

    // Les appelants EFFECTIFS de la relecture, dans ce qui est LIVRÉ. Aujourd'hui
    // zéro : `core/transport/` est le lot suivant, et ce fichier-ci est une spec.
    const livraison = fabriquerTestDeLivraison();
    const appelantsLivres: string[] = [];
    const appelantsDeTest: string[] = [];
    for (const fichier of programme()) {
      if (fichier.chemin.startsWith(DOSSIER_IDENTITE)) continue;
      if (!fichier.source.includes("relireDepuisLeSocle(")) continue;
      if (!nu(fichier).includes("relireDepuisLeSocle(")) continue;
      (livraison.estLivre(fichier.chemin) ? appelantsLivres : appelantsDeTest).push(fichier.chemin);
    }

    // Combien d'entrées de chaque liste désignent un fichier qui EXISTE ? Deux
    // entrées de `core/transport/` n'existent pas encore — c'est ATTENDU, et
    // c'est écrit pour que personne ne « répare » la liste en la vidant.
    const existe = (chemin: string): boolean => {
      try {
        return statSync(fileURLToPath(new URL(chemin, RACINE))).isFile();
      } catch {
        return false;
      }
    };
    const frappeursExistants = [...frappeurs].filter(existe);
    const relecteursExistants = [...relecteurs].filter(existe);

    console.info(
      `[G2, cliquet] ${String(frappeurs.size)} frappeur(s) nommé(s) dont ` +
        `${String(frappeursExistants.length)} existant(s) · ` +
        `${String(relecteurs.size)} relecteur(s) nommé(s) dont ` +
        `${String(relecteursExistants.length)} existant(s) · ` +
        `${String(appelantsLivres.length)} appelant(s) LIVRÉ(s) de relireDepuisLeSocle · ` +
        `${String(appelantsDeTest.length)} dans des fichiers de test`,
    );

    // Aucune des deux listes ne se vide.
    expect(frappeurs.size).toBeGreaterThanOrEqual(1);
    expect(relecteurs.size).toBeGreaterThanOrEqual(1);
    // Les deux pouvoirs ne se confondent pas : au moins un frappeur n'est pas
    // un relecteur, sans quoi les deux listes seraient la même chose écrite deux
    // fois — et l'une des deux finirait par suivre l'autre sans qu'on le décide.
    expect(frappeursQuiNeRelisentPas.length).toBeGreaterThanOrEqual(1);
    // Et tout appelant LIVRÉ de la relecture est un relecteur NOMMÉ.
    expect(appelantsLivres.filter((chemin) => !relecteurs.has(chemin))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE G3 — AUCUNE CONVERSION FORCÉE VERS `SessionId` (le FILET)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **G3 NE PROUVE QUE L'ABSENCE DE LA FORME ÉCRITE.** Un `grep` ne fait jamais
 *    mieux : une conversion passée par un alias de type, par un `satisfies`
 *    détourné ou par un générique lui échappe entièrement. C'est G2 qui porte la
 *    garantie ; G3 est un filet, et il est écrit ici comme tel pour que personne
 *    ne lise sa couleur comme une preuve.
 */
const MOTIF_CONVERSION_FORCEE = /\bas\s+(?:unknown\s+as\s+)?SessionId\b/g;

interface VerdictG3 {
  readonly fichiersScannes: number;
  readonly occurrences: number;
  readonly proprietaires: readonly string[];
  readonly anomalies: readonly string[];
}

/**
 * LE MODULE PROPRIÉTAIRE EST **DÉRIVÉ**, PAS ÉCRIT. C'est le fichier qui déclare
 * le type : le jour où il déménage, la garde le suit, et le jour où deux
 * fichiers le déclarent, elle a deux propriétaires à montrer.
 */
function verifierConversionsForcees(fichiers: readonly FichierSource[]): VerdictG3 {
  // Pré-filtre sur le texte BRUT — voir `nu()` : le nettoyage ne fait que
  // SOUSTRAIRE, il ne peut donc pas faire apparaître un motif absent.
  const candidats = fichiers.filter((fichier) => fichier.source.includes("SessionId"));

  const proprietaires = candidats
    .filter((fichier) => /export\s+type\s+SessionId\b/.test(nu(fichier)))
    .map((fichier) => fichier.chemin);
  const admis = new Set(proprietaires);

  const anomalies: string[] = [];
  let occurrences = 0;

  for (const fichier of candidats) {
    const trouvees = [...nuNiChaines(fichier).matchAll(MOTIF_CONVERSION_FORCEE)];
    if (trouvees.length === 0) continue;
    occurrences += trouvees.length;
    if (admis.has(fichier.chemin)) continue;
    anomalies.push(`${fichier.chemin} : ${String(trouvees.length)} conversion(s) forcée(s)`);
  }

  return { fichiersScannes: fichiers.length, occurrences, proprietaires, anomalies };
}

describe("G3 — aucune conversion forcée vers `SessionId` hors du module propriétaire", () => {
  it("ne confond pas ce qu'un fichier FAIT et ce qu'il DIT, et rougit sur un témoin", () => {
    const proprietaire: FichierSource = {
      chemin: "core/identite/session.ts",
      source:
        'export type SessionId = string & { readonly m: "x" };\nconst s = brut as SessionId;\n',
    };

    const temoins: ReadonlyArray<readonly [string, FichierSource, number]> = [
      [
        "conversion posée dans un fichier quelconque",
        { chemin: "core/policy/depot.ts", source: "const s = recu as unknown as SessionId;\n" },
        1,
      ],
      [
        "conversion courte, sans `unknown`",
        { chemin: "core/limits/quota.ts", source: "const s = recu as SessionId;\n" },
        1,
      ],
      [
        "la même forme, mais en COMMENTAIRE — ce n'est pas ce que le fichier fait",
        {
          chemin: "core/audit/ports.ts",
          source: "// ne jamais écrire `x as unknown as SessionId` ici\nconst x = 1;\n",
        },
        0,
      ],
      [
        "un identifiant qui COMMENCE par SessionId — le motif est ancré à droite",
        { chemin: "core/audit/roles.ts", source: "const s = recu as SessionIdBrut;\n" },
        0,
      ],
      // ⚠️ **LE CINQUIÈME TÉMOIN, ET IL MANQUAIT.** G3 a passé un lot entière-
      //    ment ROUGE sur `core/types.ts` parce qu'un champ `motif:` NOMME la
      //    conversion forcée en prose. Le quatrième témoin couvrait le
      //    COMMENTAIRE ; aucun ne couvrait la CHAÎNE. Sans celui-ci, la
      //    correction serait invisible à la prochaine régression.
      [
        "la même forme dans une CHAÎNE — une PHRASE, pas un geste",
        {
          chemin: "core/types.ts",
          source: `const motif = "as unknown as ${"SessionId"} reste écrivable";\n`,
        },
        0,
      ],
      // ⚠️ **ET LA CONTRE-ÉPREUVE, DANS LE MÊME MOUVEMENT.** Blanchir les
      //    chaînes ne doit pas blanchir le CODE d'une substitution de gabarit :
      //    une conversion écrite là est un geste, et elle doit rester vue.
      [
        "une conversion dans la SUBSTITUTION d'un gabarit — c'est du code",
        {
          chemin: "core/registry/verrou.ts",
          source: "const s = `x${recu as unknown as SessionId}y`;\n",
        },
        1,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, fichier, attendues] of temoins) {
      const verdict = verifierConversionsForcees([proprietaire, fichier]);
      if (verdict.anomalies.length !== attendues) {
        desaccords.push(
          `${nom} : ${String(verdict.anomalies.length)} au lieu de ${String(attendues)}`,
        );
      }
    }

    // Et le propriétaire, lui, a bien le droit de la poser — sinon la garde
    // serait « verte » en refusant à la fabrique le geste qui la fait exister.
    const seul = verifierConversionsForcees([proprietaire]);

    console.info(
      `[G3, témoins] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(desaccords.length)} désaccord(s) · propriétaire admis : ` +
        `${String(seul.anomalies.length)} anomalie(s) pour ${String(seul.occurrences)} occurrence(s)`,
    );

    expect(desaccords).toEqual([]);
    expect(seul.anomalies).toEqual([]);
    expect(seul.occurrences).toBe(1);
  });

  it("ne trouve, dans le dépôt, aucune conversion hors du module propriétaire", () => {
    const tous = programme();
    const verdict = verifierConversionsForcees(sansCeFichier(tous));

    console.info(
      `[G3] ${String(tous.length)} fichier(s) trouvé(s), ` +
        `${String(verdict.fichiersScannes)} scanné(s) — ce fichier-ci porte les motifs · ` +
        `${String(verdict.occurrences)} occurrence(s) du motif · ` +
        `propriétaire(s) du type : ${verdict.proprietaires.join(", ")} · ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.fichiersScannes).toBeGreaterThanOrEqual(60);
    // UN seul propriétaire : deux déclarations du type rendraient la marque
    // structurellement compatible entre deux modules, donc contournable.
    expect(verdict.proprietaires).toEqual(["core/identite/session.ts"]);
    expect(verdict.anomalies).toEqual([]);
  });
});
