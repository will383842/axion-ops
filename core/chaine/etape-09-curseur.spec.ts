import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../types.js";
import { creerCalculArgHash } from "../limits/index.js";

import {
  CHAMPS_CHARGE,
  CHAMPS_CHARGE_COMPLETS,
  DOMAINE_CURSEUR,
  ErreurCleCurseur,
  ErreurFiltersHashAbsent,
  LONGUEUR_SIGNATURE_CURSEUR,
  SEPARATEUR_JETON,
  TAILLE_MAX_JETON,
  creerSignataireCurseur,
  etapeCurseur,
  type CoffreCurseur,
} from "./etape-09-curseur.js";
import { ETAPE_CURSEUR } from "./etapes.js";
import type { ChargeCurseur, ContexteCurseur, SignataireCurseur } from "./etapes.js";

/**
 * Gardes de l'ÉTAPE 9 — le curseur (§ 11, § 13.1).
 *
 * Motif repris de `core/limits/arg-hash.spec.ts` : chaque garde est appliquée
 * d'ABORD à un témoin fabriqué défectueux — on prouve qu'elle rougit — PUIS à la
 * vraie donnée, et chacune ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

/** Des clés de test. Aucune valeur réelle : rien ici ne sort de la machine. */
const CLE_A = "cle-de-test-curseur-a-0123456789abcdef";
const CLE_B = "cle-de-test-curseur-b-0123456789abcdef";

/** Deux empreintes de filtres fabriquées. Elles ne désignent rien de réel. */
const FILTRES_UN = "f".repeat(64);
const FILTRES_DEUX = `${"f".repeat(63)}e`;

function coffreQuiRend(valeur: string | null | undefined): CoffreCurseur {
  return {
    lireCleCurseur(): Promise<string | null | undefined> {
      return Promise.resolve(valeur);
    },
  };
}

function charge(filtersHash: string): ChargeCurseur {
  return { lastId: "ligne-42", lastSortValue: "2026-08-31T00:00:00Z", filtersHash };
}

function contexte(partiel: Partial<ContexteCurseur> & { signataire: SignataireCurseur }) {
  return {
    pagination: "keyset",
    jetonRecu: null,
    filtersHashCourant: FILTRES_UN,
    ...partiel,
  } satisfies ContexteCurseur;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'aller-retour, et le fait que la signature dépende de la clé
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — le curseur signé fait l'aller-retour", () => {
  it("rend EXACTEMENT la charge signée, pour chacune des charges mesurées", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));

    // Les cas sont dérivés d'une liste, pas écrits un à un : les caractères
    // « pénibles » y figurent parce qu'un curseur porte une valeur de tri
    // arbitraire, et qu'un cadrage par séparateur seul s'y casserait.
    const cas: readonly ChargeCurseur[] = [
      charge(FILTRES_UN),
      { lastId: "", lastSortValue: "", filtersHash: FILTRES_UN },
      { lastId: "a.b.c", lastSortValue: "x.y", filtersHash: FILTRES_UN },
      { lastId: "é—\u0000/+=", lastSortValue: '{"faux":"json"}', filtersHash: FILTRES_UN },
    ];

    let mesures = 0;
    for (const attendue of cas) {
      const jeton = await signataire.signer(attendue);
      expect(jeton).toContain(SEPARATEUR_JETON);
      expect(jeton.split(SEPARATEUR_JETON)).toHaveLength(2);
      expect(jeton.split(SEPARATEUR_JETON)[1]).toHaveLength(LONGUEUR_SIGNATURE_CURSEUR);
      await expect(signataire.verifier(jeton)).resolves.toEqual(attendue);
      mesures += 1;
    }

    console.info(`[garde aller-retour] ${String(mesures)} charges signées puis relues`);
    expect(mesures).toBe(cas.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
  });

  it("ne vérifie PAS un jeton signé avec une autre clé — sinon la rotation du § 25 ne tournerait rien", async () => {
    const jeton = await creerSignataireCurseur(coffreQuiRend(CLE_A)).signer(charge(FILTRES_UN));
    await expect(creerSignataireCurseur(coffreQuiRend(CLE_B)).verifier(jeton)).resolves.toBeNull();
  });

  it("sépare son domaine de celui de l'argHash — MÊME CLÉ, empreintes différentes", async () => {
    // Le témoin est le pire cas concevable : la MÊME clé servirait aux deux
    // usages. Même là, le morceau de domaine cadré fait diverger les messages.
    // (Dans le socle les deux clés sont distinctes — c'est le § 13.1 — mais une
    // garde qui ne tiendrait QUE par cette distinction ne garderait rien : elle
    // serait verte sans jamais avoir mesuré le cadrage.)
    const contenu = charge(FILTRES_UN);
    const jeton = await creerSignataireCurseur(coffreQuiRend(CLE_A)).signer(contenu);
    const signatureCurseur = jeton.split(SEPARATEUR_JETON)[1];

    const argHash = creerCalculArgHash({ lireCleArgHash: () => Promise.resolve(CLE_A) });

    // Les outils sont ceux que le § 27 nomme : des noms d'outils RÉELS, pas une
    // valeur choisie pour faire passer la garde.
    const outils = ["zoho.mail.search", "zoho.mail.delete", "axionia.inbox.recent"] as const;

    let mesures = 0;
    for (const outil of outils) {
      expect(signatureCurseur, outil).not.toBe(await argHash.calculer(outil, contenu));
      mesures += 1;
    }

    console.info(
      `[garde domaine] domaine « ${DOMAINE_CURSEUR} », ` +
        `${String(mesures)} collisions cherchées à clé identique, 0 trouvée`,
    );
    expect(mesures).toBe(outils.length);
    expect(mesures).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LE TÉMOIN : un curseur authentique rejoué sous d'AUTRES filtres
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — la fenêtre silencieusement fausse (§ 13.1)", () => {
  it("rougit sur un témoin fabriqué : une étape qui ne vérifie QUE la signature", async () => {
    // Le témoin est ce que la v5 faisait — « un curseur signé sans mécanisme ».
    // Le jeton est AUTHENTIQUE : c'est le socle qui l'a émis. Seul l'appel a
    // changé de filtres. Une étape qui s'arrête à la signature laisse passer, et
    // rend une fenêtre fausse dont RIEN ne parle.
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(FILTRES_UN));

    const etapeNaive = async (ctx: ContexteCurseur): Promise<"laisse passer" | "refuse"> =>
      ctx.jetonRecu !== null && (await ctx.signataire.verifier(ctx.jetonRecu)) !== null
        ? "laisse passer"
        : "refuse";

    const rejeu = contexte({
      signataire,
      jetonRecu: jeton,
      filtersHashCourant: FILTRES_DEUX,
    });

    // Le témoin laisse passer : la garde a donc quelque chose à mordre.
    expect(await etapeNaive(rejeu)).toBe("laisse passer");

    // La vraie étape refuse le MÊME appel.
    const verdict = await etapeCurseur(rejeu);
    expect(verdict.issue).toBe("refuse");
  });

  it("refuse le rejeu, ET le message DIT que les filtres ont changé", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(FILTRES_UN));

    const verdict = await etapeCurseur(
      contexte({ signataire, jetonRecu: jeton, filtersHashCourant: FILTRES_DEUX }),
    );

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");

    // Le § 15 exige DEUX choses du message : la cause, et quoi faire ensuite.
    const exigences: ReadonlyArray<readonly [string, RegExp]> = [
      ["il nomme les filtres", /filtres/i],
      ["il dit qu'ils ont changé", /chang/i],
      ["il dit de repartir de la première page", /première page/i],
    ];

    let mesures = 0;
    for (const [nom, motif] of exigences) {
      expect(verdict.message, nom).toMatch(motif);
      mesures += 1;
    }

    // …et il ne porte AUCUNE des deux empreintes : le § 15 demande de dire quoi
    // faire, pas de donner de quoi s'approcher de la valeur attendue.
    expect(verdict.message).not.toContain(FILTRES_UN);
    expect(verdict.message).not.toContain(FILTRES_DEUX);
    expect(verdict.message).not.toContain(jeton);

    console.info(`[garde message filtres] ${String(mesures)} exigences du § 15 mesurées`);
    expect(mesures).toBe(3);
  });

  it("laisse passer le MÊME curseur quand les filtres n'ont pas bougé", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const attendue = charge(FILTRES_UN);
    const jeton = await signataire.signer(attendue);

    const verdict = await etapeCurseur(
      contexte({ signataire, jetonRecu: jeton, filtersHashCourant: FILTRES_UN }),
    );

    expect(verdict.issue).toBe("autorise");
    if (verdict.issue !== "autorise") throw new Error("verdict inattendu");
    expect(verdict.etabli.reprise).toBe(true);
    expect(verdict.etabli.charge).toEqual(attendue);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — toute falsification est refusée, et aucune n'est distinguable
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — un jeton falsifié ne vérifie pas", () => {
  it("refuse chacune des falsifications mesurées, sans jamais dire laquelle", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const authentique = await signataire.signer(charge(FILTRES_UN));
    const [charge64, signature] = authentique.split(SEPARATEUR_JETON);
    if (charge64 === undefined || signature === undefined) throw new Error("jeton mal formé");

    /** Ré-encode un objet quelconque comme charge d'un jeton. */
    const encoder = (valeur: unknown): string =>
      Buffer.from(JSON.stringify(valeur), "utf8").toString("base64url");

    const temoins: ReadonlyArray<readonly [string, string]> = [
      ["signature d'un caractère modifié", `${charge64}${SEPARATEUR_JETON}${"0".repeat(64)}`],
      ["signature tronquée", `${charge64}${SEPARATEUR_JETON}${signature.slice(0, 63)}`],
      ["signature rallongée", `${charge64}${SEPARATEUR_JETON}${signature}0`],
      // ⚠️ CE TÉMOIN-CI A ÉTÉ ACCEPTÉ À LA PREMIÈRE MESURE, et c'est ce qui a
      //    fait ajouter le contrôle de forme canonique dans `verifier()` : le
      //    décodage base64 de Node ignore un groupe de fin incomplet, donc
      //    `<charge>A` décode les mêmes octets que `<charge>`. La fenêtre rendue
      //    restait la bonne — mais le socle acceptait un jeton qu'il n'avait pas
      //    émis. Il est gardé ici pour que le contrôle ne puisse pas repartir.
      ["encodage non canonique de la charge", `${charge64}A${SEPARATEUR_JETON}${signature}`],
      ["séparateur absent", `${charge64}${signature}`],
      ["séparateur en trop", `${charge64}${SEPARATEUR_JETON}x${SEPARATEUR_JETON}${signature}`],
      ["charge vide", `${SEPARATEUR_JETON}${signature}`],
      ["jeton vide", ""],
      [
        "champ clandestin dans la charge",
        `${encoder({ ...charge(FILTRES_UN), admin: true })}${SEPARATEUR_JETON}${signature}`,
      ],
      [
        "champ manquant dans la charge",
        `${encoder({ lastId: "x", filtersHash: FILTRES_UN })}${SEPARATEUR_JETON}${signature}`,
      ],
      [
        "champ non textuel dans la charge",
        `${encoder({ lastId: 42, lastSortValue: "x", filtersHash: FILTRES_UN })}${SEPARATEUR_JETON}${signature}`,
      ],
      // Clés dans un AUTRE ORDRE : la signature, elle, correspond — elle porte
      // la forme canonique, qui ne dépend pas de l'ordre. Seul le contrôle de
      // forme canonique de `verifier()` sépare ce jeton de l'authentique.
      [
        "clés de la charge dans un autre ordre",
        `${encoder({
          lastSortValue: "2026-08-31T00:00:00Z",
          filtersHash: FILTRES_UN,
          lastId: "ligne-42",
        })}${SEPARATEUR_JETON}${signature}`,
      ],
      ["charge en tableau", `${encoder([1, 2, 3])}${SEPARATEUR_JETON}${signature}`],
      ["charge nulle", `${encoder(null)}${SEPARATEUR_JETON}${signature}`],
      ["charge illisible", `${"!".repeat(20)}${SEPARATEUR_JETON}${signature}`],
      [
        "jeton au-delà du plafond de taille",
        `${"A".repeat(TAILLE_MAX_JETON)}${SEPARATEUR_JETON}${signature}`,
      ],
    ];

    let mesures = 0;
    for (const [nom, jeton] of temoins) {
      // Le port ne dit JAMAIS laquelle des causes : toutes rendent `null`.
      await expect(signataire.verifier(jeton), nom).resolves.toBeNull();

      // …et l'étape rend le MÊME message pour toutes, sauf le jeton vide, que
      // le § 11 refuse pour ce qu'il est plutôt que de le lire comme absent.
      const verdict = await etapeCurseur(contexte({ signataire, jetonRecu: jeton }));
      expect(verdict.issue, nom).toBe("refuse");
      if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
      expect(verdict.message, nom).toMatch(/première page/i);
      mesures += 1;
    }

    console.info(`[garde falsification] ${String(mesures)} falsifications mesurées, 0 acceptée`);
    expect(mesures).toBe(temoins.length);
    expect(mesures).toBeGreaterThanOrEqual(16);
  });

  it("borne la taille du jeton AVANT de l'analyser", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const enorme = `${"A".repeat(TAILLE_MAX_JETON + 1)}${SEPARATEUR_JETON}${"0".repeat(64)}`;
    console.info(`[garde taille] plafond ${String(TAILLE_MAX_JETON)} caractères, 1 jeton mesuré`);
    await expect(signataire.verifier(enorme)).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — clé absente : échec BRUYANT, jamais un `cursor_invalid` silencieux
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — la clé de signature est obligatoire", () => {
  it("lève sur chacune des cinq formes d'absence, à la signature COMME à la vérification", async () => {
    // La chaîne VIDE est le cas réel : une variable déclarée sans valeur dans
    // l'hébergeur n'est pas nullish. Un `??` l'aurait laissée servir de clé.
    const temoins: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ["secret absent", null],
      ["secret indéfini", undefined],
      ["chaîne vide", ""],
      ["blancs seulement", "   "],
      ["clé trop courte pour en être une", "trop-courte"],
    ];

    let mesures = 0;
    for (const [nom, valeur] of temoins) {
      const signataire = creerSignataireCurseur(coffreQuiRend(valeur));
      await expect(signataire.signer(charge(FILTRES_UN)), `signer — ${nom}`).rejects.toBeInstanceOf(
        ErreurCleCurseur,
      );
      // ⚠️ LE POINT QUI COMPTE : `verifier` LÈVE aussi. Rendre `null` ferait
      //    apparaître un secret manquant comme un curseur invalide du client.
      await expect(signataire.verifier("peu-importe"), `verifier — ${nom}`).rejects.toBeInstanceOf(
        ErreurCleCurseur,
      );
      mesures += 2;
    }

    console.info(`[garde clé manquante] ${String(mesures)} appels mesurés, 0 sans clé abouti`);
    expect(mesures).toBe(temoins.length * 2);
  });

  it("n'expose AUCUNE clé de repli — sans coffre, aucun jeton ne sort", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(null));
    const obtenus: string[] = [];
    try {
      obtenus.push(await signataire.signer(charge(FILTRES_UN)));
    } catch (_erreur) {
      // Attendu : le module lève plutôt que de rendre un jeton.
    }
    console.info(`[garde repli] ${String(obtenus.length)} jeton(s) signé(s) sans coffre`);
    expect(obtenus).toEqual([]);
  });

  it("laisse remonter l'erreur de clé au lieu de la traduire en refus", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(null));
    await expect(
      etapeCurseur(contexte({ signataire, jetonRecu: "un.jeton" })),
    ).rejects.toBeInstanceOf(ErreurCleCurseur);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — les trois régimes du § 13.1
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — les trois régimes de pagination (§ 13.1)", () => {
  it("n'accepte AUCUN curseur en `pagination: \"none\"`, et l'accepte dans les deux autres", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(FILTRES_UN));

    const attendus = [
      ["keyset", "autorise"],
      ["page", "autorise"],
      ["none", "refuse"],
    ] as const;

    let mesures = 0;
    for (const [pagination, issue] of attendus) {
      const verdict = await etapeCurseur(contexte({ signataire, pagination, jetonRecu: jeton }));
      expect(verdict.issue, pagination).toBe(issue);
      mesures += 1;
    }

    console.info(`[garde régimes] ${String(mesures)} régimes mesurés`);
    // Le compte est DÉRIVÉ du type : un quatrième régime ajouté à `PAGINATIONS`
    // sans être décidé ici ferait échouer la compilation de l'étape.
    expect(mesures).toBe(attendus.length);
    expect(mesures).toBe(3);
  });

  it("ouvre la première page dans les trois régimes, curseur absent", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));

    let mesures = 0;
    for (const pagination of ["keyset", "page", "none"] as const) {
      const verdict = await etapeCurseur(contexte({ signataire, pagination, jetonRecu: null }));
      expect(verdict.issue, pagination).toBe("autorise");
      if (verdict.issue !== "autorise") throw new Error("verdict inattendu");
      expect(verdict.etabli.charge, pagination).toBeNull();
      expect(verdict.etabli.reprise, pagination).toBe(false);
      mesures += 1;
    }

    console.info(`[garde première page] ${String(mesures)} régimes mesurés sans curseur`);
    expect(mesures).toBe(3);
  });

  it("dit à un outil sans pagination de rappeler SANS curseur, pas de repaginer", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(FILTRES_UN));
    const verdict = await etapeCurseur(
      contexte({ signataire, pagination: "none", jetonRecu: jeton }),
    );

    expect(verdict.issue).toBe("refuse");
    if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
    expect(verdict.message).toMatch(/ne pagine pas/i);
    expect(verdict.message).toMatch(/sans curseur/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — la garde de la garde : sans empreinte courante, on LÈVE
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — une confrontation sans terme de comparaison ne se tait pas", () => {
  it("lève sur chaque forme d'empreinte courante vide, plutôt que de tout accepter", async () => {
    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(""));

    const temoins = ["", "   ", "\t\n"] as const;

    let mesures = 0;
    for (const vide of temoins) {
      // Le témoin de ce que l'absence de garde donnerait : le curseur porte un
      // `filtersHash` VIDE, l'appel aussi — un `===` les déclarerait égaux et
      // TOUS les curseurs passeraient.
      await expect(
        etapeCurseur(contexte({ signataire, jetonRecu: jeton, filtersHashCourant: vide })),
        JSON.stringify(vide),
      ).rejects.toBeInstanceOf(ErreurFiltersHashAbsent);
      mesures += 1;
    }

    console.info(`[garde empreinte absente] ${String(mesures)} formes de vide mesurées`);
    expect(mesures).toBe(temoins.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 7 — le numéro et le code sont DÉRIVÉS d'`APPEL_STEPS`
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 9 — son numéro et son code sont lus, jamais écrits", () => {
  it("porte le numéro et le code que le § 11 lui donne, pour chaque refus mesuré", async () => {
    const officielle = APPEL_STEPS.find((etape) => etape.cle === "curseur");
    expect(officielle, "APPEL_STEPS ne porte plus l'étape « curseur »").toBeDefined();
    if (officielle === undefined) throw new Error("ancrage introuvable");

    const signataire = creerSignataireCurseur(coffreQuiRend(CLE_A));
    const jeton = await signataire.signer(charge(FILTRES_UN));

    const refus: readonly ContexteCurseur[] = [
      contexte({ signataire, jetonRecu: `${"A".repeat(8)}${SEPARATEUR_JETON}${"0".repeat(64)}` }),
      contexte({ signataire, jetonRecu: jeton, filtersHashCourant: FILTRES_DEUX }),
      contexte({ signataire, jetonRecu: jeton, pagination: "none" }),
      contexte({ signataire, jetonRecu: "   " }),
    ];

    let mesures = 0;
    for (const ctx of refus) {
      const verdict = await etapeCurseur(ctx);
      expect(verdict.issue).toBe("refuse");
      if (verdict.issue !== "refuse") throw new Error("verdict inattendu");
      expect(verdict.etape).toBe(officielle.numero);
      expect(verdict.code).toBe(officielle.refus);
      mesures += 1;
    }

    // Et l'autorisation porte le même numéro.
    const passe = await etapeCurseur(contexte({ signataire, jetonRecu: jeton }));
    expect(passe.etape).toBe(officielle.numero);

    console.info(
      `[garde ancrage] étape ${String(officielle.numero)}, code « ${String(officielle.refus)} », ` +
        `${String(mesures)} refus mesurés`,
    );
    expect(mesures).toBe(4);
    expect(ETAPE_CURSEUR.numero).toBe(officielle.numero);
    expect(ETAPE_CURSEUR.code).toBe(officielle.refus);
  });

  it("couvre TOUS les champs de la charge du § 13.1 — vérifié à la compilation", () => {
    // `CHAMPS_CHARGE_COMPLETS` ne compile que si `CHAMPS_CHARGE` couvre
    // `ChargeCurseur` en entier. Ce test rend la garde VISIBLE au lecteur ; le
    // compilateur, lui, l'a déjà appliquée.
    console.info(`[garde champs] ${String(CHAMPS_CHARGE.length)} champs de charge déclarés`);
    expect(CHAMPS_CHARGE_COMPLETS).toBe(true);
    expect(CHAMPS_CHARGE.length).toBe(3);
  });
});
