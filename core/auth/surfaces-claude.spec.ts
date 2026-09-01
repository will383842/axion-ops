import { describe, expect, it } from "vitest";

import {
  CHEMINS_JOIGNABLES_PAR_ANTHROPIC,
  CHEMIN_QUI_PEUT_RESTER_DERRIERE_UN_PORTAIL,
  CODE_DE_REFUS_DE_RAFRAICHISSEMENT,
  DELAIS_MAXIMAUX_DE_CLAUDE_MS,
  METHODE_DE_DEFI_ANNONCEE,
  PLAGE_DE_SORTIE_ANTHROPIC,
  PORTEE_DE_RAFRAICHISSEMENT,
  RAPPELS_DECLARES_PAR_CLAUDE_CODE,
  TYPE_DE_CONTENU_DU_POINT_DE_JETON,
  URI_DE_RAPPEL_DES_SURFACES_HEBERGEES,
  VOIES_D_ENREGISTREMENT,
  motifDeRefusDUnRappelNatif,
  voieDEnregistrementRetenue,
} from "./surfaces-claude.js";

/**
 * ⚠️ CES VALEURS VIENNENT D'UN TIERS. Les affirmer par leur NOM, jamais par un
 *    compte : c'est la leçon du scope `ZohoMail.attachments.ALL`, qu'un plancher
 *    « au moins 3 » a laissé passer pendant tout un lot.
 */
describe("les valeurs exigées par Claude sont celles de sa documentation, au caractère près", () => {
  it("porte l'URI de rappel des surfaces hébergées, et une seule", () => {
    console.info(
      `[surfaces] rappel hébergé : ${URI_DE_RAPPEL_DES_SURFACES_HEBERGEES} · ` +
        `${String(RAPPELS_DECLARES_PAR_CLAUDE_CODE.length)} rappel(s) natif(s) · ` +
        `${String(CHEMINS_JOIGNABLES_PAR_ANTHROPIC.length)} chemin(s) à laisser joignable(s)`,
    );

    expect(URI_DE_RAPPEL_DES_SURFACES_HEBERGEES).toBe("https://claude.ai/api/mcp/auth_callback");
    expect([...RAPPELS_DECLARES_PAR_CLAUDE_CODE]).toEqual([
      "http://localhost/callback",
      "http://127.0.0.1/callback",
    ]);

    // Les deux rappels natifs sont DÉCLARÉS sans port — c'est ce qui oblige la
    // comparaison à l'ignorer.
    for (const rappel of RAPPELS_DECLARES_PAR_CLAUDE_CODE) {
      expect(new URL(rappel).port, `« ${rappel} » ne doit pas porter de port`).toBe("");
    }
  });

  it("annonce les quatre valeurs sans lesquelles la connexion échoue en silence", () => {
    expect(PORTEE_DE_RAFRAICHISSEMENT).toBe("offline_access");
    expect(METHODE_DE_DEFI_ANNONCEE).toBe("S256");
    expect(TYPE_DE_CONTENU_DU_POINT_DE_JETON).toBe("application/x-www-form-urlencoded");
    expect(CODE_DE_REFUS_DE_RAFRAICHISSEMENT).toBe("invalid_grant");
  });

  it("porte les délais de Claude, et le socle doit viser SOUS ces plafonds", () => {
    expect(DELAIS_MAXIMAUX_DE_CLAUDE_MS.decouverte).toBe(10_000);
    expect(DELAIS_MAXIMAUX_DE_CLAUDE_MS.enregistrement).toBe(10_000);
    expect(DELAIS_MAXIMAUX_DE_CLAUDE_MS.jeton).toBe(10_000);
    // Le rafraîchissement est le SEUL à 30 s. Les aligner tous les quatre ferait
    // disparaître la distinction que la documentation prend soin de faire.
    expect(DELAIS_MAXIMAUX_DE_CLAUDE_MS.rafraichissement).toBe(30_000);
    expect(DELAIS_MAXIMAUX_DE_CLAUDE_MS.rafraichissement).toBeGreaterThan(
      DELAIS_MAXIMAUX_DE_CLAUDE_MS.jeton,
    );
  });
});

describe("le port d'un rappel natif est ignoré — tout le reste est comparé strictement", () => {
  it("accepte un port éphémère quelconque, sur les deux hôtes de boucle locale", () => {
    const acceptes = [
      "http://localhost:3118/callback",
      "http://localhost:51234/callback",
      "http://localhost/callback",
      "http://127.0.0.1:3118/callback",
      "http://127.0.0.1/callback",
    ];
    console.info(`[rappel natif] ${String(acceptes.length)} forme(s) acceptée(s) éprouvée(s)`);
    for (const brut of acceptes) {
      expect(motifDeRefusDUnRappelNatif(brut), `« ${brut} » devrait être accepté`).toBe(null);
    }
  });

  it("REFUSE les sept témoins fabriqués, chacun pour un motif distinct", () => {
    // ⚠️ Chaque témoin ne diffère d'une forme valide que par UN caractère de
    //    sens. Une garde qui n'en refuserait qu'un serait verte à 86 %.
    const temoins: readonly [string, string][] = [
      // Le piège central : un sous-domaine d'un domaine tiers, qui COMMENCE par
      // « localhost ». Une comparaison sur la chaîne brute le laisserait passer.
      ["http://localhost.attaquant.test/callback", "hôte"],
      ["http://127.0.0.1.attaquant.test/callback", "hôte"],
      ["https://localhost:3118/callback", "schéma"],
      ["http://localhost:3118/autre", "chemin"],
      ["http://localhost:3118/callback?code=vole", "requête"],
      // ⚠️ PIÈGE MESURÉ, PAS SUPPOSÉ : `new URL("localhost:3118/callback")` NE
      //    LÈVE PAS. Le WHATWG lit « localhost: » comme un SCHÉMA — la garde
      //    l'a montré en rougissant sur une attente que j'avais écrite de
      //    travers. Ce témoin est donc refusé au motif du schéma, et il reste
      //    ici précisément parce qu'il ressemble à une adresse valide.
      ["localhost:3118/callback", "schéma"],
      ["/callback", "URL absolue"],
    ];

    const motifs = new Set<string>();
    for (const [brut, attendu] of temoins) {
      const motif = motifDeRefusDUnRappelNatif(brut);
      expect(motif, `« ${brut} » devait être REFUSÉ`).not.toBe(null);
      expect(motif, `le refus de « ${brut} » devait parler de ${attendu}`).toContain(attendu);
      motifs.add(motif!);
    }

    console.info(`[rappel natif] ${String(temoins.length)} témoin(s) refusé(s), tous distincts`);
    // Un refus qui rendrait toujours le même motif serait indiscernable d'un
    // `return false` — et ne dirait à personne LEQUEL des critères a manqué.
    // Les DEUX témoins de schéma rendent des motifs distincts — « https: » et
    // « localhost: » — parce que le motif NOMME le schéma reçu. C'est
    // exactement ce qu'on attend d'un refus qui parle.
    expect(motifs.size).toBe(temoins.length);

    // ⚠️ LE CONTRE-CONTRÔLE, SANS LEQUEL CETTE GARDE POURRAIT TOUT REFUSER.
    //    Sept refus ne prouvent rien si la fonction refuse aussi ce qu'elle
    //    doit accepter. On DÉRIVE les formes valides de RAPPELS_DECLARES_PAR_CLAUDE_CODE
    //    — la table elle-même — plutôt que de les recopier ici.
    for (const declare of RAPPELS_DECLARES_PAR_CLAUDE_CODE) {
      const avecPort = declare.replace("/callback", "").concat(":51234/callback");
      expect(
        motifDeRefusDUnRappelNatif(declare),
        `le rappel DÉCLARÉ « ${declare} » doit être accepté`,
      ).toBe(null);
      expect(
        motifDeRefusDUnRappelNatif(avecPort),
        `« ${avecPort} » — le même, avec un port éphémère — doit être accepté`,
      ).toBe(null);
    }
  });
});

describe("une seule voie d'enregistrement est retenue, et les écartées gardent leur motif", () => {
  it("retient les identifiants statiques, et nomme pourquoi les deux autres sont écartées", () => {
    const retenue = voieDEnregistrementRetenue();
    console.info(
      `[enregistrement] ${String(VOIES_D_ENREGISTREMENT.length)} voie(s) connue(s) · ` +
        `retenue : ${retenue.nom}`,
    );

    expect(retenue.nom).toBe("identifiants-statiques");
    expect(VOIES_D_ENREGISTREMENT.filter((v) => v.retenue)).toHaveLength(1);

    // Une voie écartée SANS motif est une voie qu'on réintroduira.
    for (const voie of VOIES_D_ENREGISTREMENT) {
      expect(voie.motif.length, `la voie « ${voie.nom} » doit porter un motif`).toBeGreaterThan(80);
    }
  });
});

describe("la politique d'accès se dérive des chemins, jamais recopiée à côté", () => {
  it("laisse joignables les quatre chemins d'Anthropic, et EXCLUT /auth/authorize", () => {
    const chemins = CHEMINS_JOIGNABLES_PAR_ANTHROPIC.map((c) => c.chemin);
    console.info(`[accès] plage ${PLAGE_DE_SORTIE_ANTHROPIC} · [${chemins.join(", ")}]`);

    expect(chemins).toEqual([
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/auth/token",
      "/api/mcp",
    ]);

    // ⚠️ LE PIÈGE QUE CETTE LIGNE FERME : la découverte de l'ÉMETTEUR part de la
    //    même plage que les appels MCP. Un portail posé devant elle casse la
    //    connexion pendant que /api/mcp répond — et le symptôme ne le désigne pas.
    expect(chemins).toContain("/.well-known/oauth-authorization-server");

    // Celui-là, et lui seul, peut vivre derrière un portail : c'est un
    // NAVIGATEUR qui s'y rend, pas Anthropic.
    expect(chemins).not.toContain(CHEMIN_QUI_PEUT_RESTER_DERRIERE_UN_PORTAIL);
    expect(CHEMIN_QUI_PEUT_RESTER_DERRIERE_UN_PORTAIL).toBe("/auth/authorize");

    expect(PLAGE_DE_SORTIE_ANTHROPIC).toBe("160.79.104.0/21");
    for (const c of CHEMINS_JOIGNABLES_PAR_ANTHROPIC) {
      expect(c.pourquoi.length, `« ${c.chemin} » doit dire pourquoi`).toBeGreaterThan(10);
    }
  });
});
