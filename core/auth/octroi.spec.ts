import { describe, expect, it } from "vitest";

import { TTL_MARQUAGE_MS } from "../chaine/etape-11-provenance.js";
import { APPEL_STEPS } from "../types.js";
import { FORME_SESSION_ID, creerFabriqueSessionId } from "../identite/session.js";
import {
  CAUSES_DE_REFUS_A_L_ETAPE_4,
  ErreurAudienceDeMontage,
  ErreurDOctroi,
  ErreurJetonDejaRevele,
  OCTETS_DUN_JETON,
  creerEmetteurDeJetons,
} from "./octroi.js";
import type { DependancesDeLEmetteur, EmetteurDeJetons, JetonEmis } from "./octroi.js";
import { creerDepotDeDemandesEnMemoire, creerDepotDeJetonsEnMemoire } from "./memoire.js";
import { GENRES_DE_JETON } from "./depot.js";
import type { DepotDeJetons, LigneOpsToken } from "./depot.js";
import { ErreurScopeNonEmissible } from "./scopes.js";
import { ErreurPrincipalRefuse } from "./principal.js";
import { defiAttendu } from "./pkce.js";
import {
  DUREE_DU_CODE_DAUTORISATION_MS,
  DUREE_DU_JETON_DACCES_MS,
  DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS,
  DUREES_DE_L_EMETTEUR,
} from "./durees.js";

/**
 * GARDES DE L'ÉMETTEUR — ADR 0027, ADR 0014, ADR 0026, § 19.1, § 19.2.
 *
 * ═══ LES CINQ MESURES EXIGÉES PAR LE LOT, ET OÙ ELLES SONT ═══
 *
 *  1. un jeton émis pour une AUTRE audience est refusé → « l'audience est
 *     reconfrontée à chaque appel » ;
 *  2. un jeton révoqué est refusé À L'ÉTAPE 4 → « les cinq causes de refus » ;
 *  3. un rafraîchissement CONSERVE le `sessionId`, un nouvel octroi en CHANGE
 *     → « la session suit l'octroi » ;
 *  4. `ops:policy` demandé par un connecteur est refusé → « refusé à l'octroi » ;
 *  5. l'empreinte stockée ne permet pas de retrouver le jeton → « le clair ne
 *     s'affiche qu'une fois ».
 *
 * ⚠️ **AUCUNE VALEUR RÉELLE N'ENTRE ICI.** L'audience est sur `stub.invalid`
 *    (RFC 2606, ne résout jamais), la clé du coffre est fabriquée et nommée comme
 *    telle, et aucun appel réseau n'est fait — la vraie fabrique de sessions est
 *    montée en mémoire.
 */

const AUDIENCE = "https://stub.invalid/api/mcp";
const AUTRE_AUDIENCE = "https://autre.stub.invalid/api/mcp";
const CLE_DE_TEMOIN = "cle-de-temoin-empreinte-de-jeton-axion-ops-jamais-en-production";
const VERIFICATEUR = "a".repeat(64);
const T0 = new Date("2026-08-31T09:00:00.000Z");

/** La borne, dérivée de la seule source disponible dans ce périmètre. */
const BORNES = (): { readonly maxCar: number } => ({ maxCar: 128 });

interface Banc {
  readonly emetteur: EmetteurDeJetons;
  readonly depot: DepotDeJetons;
  /** L'audience de CE banc — le témoin ne la suppose pas, il la lit. */
  readonly audience: string;
  avancerDe(ms: number): void;
  maintenant(): Date;
}

function banc(surcharge: Partial<DependancesDeLEmetteur> = {}): Banc {
  let instant = T0.getTime();
  const depot = surcharge.depot ?? creerDepotDeJetonsEnMemoire();
  const emetteur = creerEmetteurDeJetons({
    depot,
    demandes: creerDepotDeDemandesEnMemoire(),
    coffre: { lireCleEmpreinteDeJeton: () => Promise.resolve(CLE_DE_TEMOIN) },
    // ⚠️ LA VRAIE FABRIQUE, pas un double : le `sessionId` doit être une vraie
    //    session de pilotage, à la forme du § 31, sans quoi la mesure du point 3
    //    porterait sur une chaîne quelconque.
    sessions: creerFabriqueSessionId(),
    bornes: BORNES,
    audience: AUDIENCE,
    maintenant: () => new Date(instant),
    ...surcharge,
  });
  return {
    emetteur,
    depot,
    audience: surcharge.audience ?? AUDIENCE,
    avancerDe: (ms) => {
      instant += ms;
    },
    maintenant: () => new Date(instant),
  };
}

async function octroyer(
  b: Banc,
  options: { principal?: string; scopes?: readonly string[] } = {},
): Promise<{
  octroi: { grantId: string; sessionId: string };
  acces: JetonEmis;
  rafraichissement: JetonEmis;
}> {
  const preparee = await b.emetteur.preparerUneAutorisation({
    principal: options.principal ?? "connecteur.mcp",
    scopesDemandes: options.scopes ?? ["ops:read", "ops:draft"],
    // ⚠️ L'AUDIENCE DEMANDÉE EST CELLE DU BANC, jamais une constante : un témoin
    //    qui demanderait toujours la même ressource ne saurait pas fabriquer un
    //    jeton émis POUR UNE AUTRE — c'est-à-dire le cas que l'étape 3 existe
    //    pour refuser.
    indicateursDeRessource: [b.audience],
    defi: defiAttendu(VERIFICATEUR),
    methodeDeDefi: "S256",
  });
  const resultat = await b.emetteur.echangerLeCode(preparee.code, VERIFICATEUR);
  return {
    octroi: { grantId: resultat.octroi.grantId, sessionId: resultat.octroi.sessionId },
    acces: resultat.acces,
    rafraichissement: resultat.rafraichissement,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LA SESSION SUIT L'OCTROI (ADR 0014)
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0014 — la session est frappée à l'OCTROI, et propagée aux rafraîchissements", () => {
  it("un rafraîchissement CONSERVE le `sessionId` ; un nouvel octroi en CHANGE", async () => {
    const b = banc();
    const premier = await octroyer(b);

    // Trois rotations d'affilée : une session qui se perdrait au deuxième tour
    // passerait un test qui n'en ferait qu'un.
    let refresh = premier.rafraichissement.reveler();
    const sessionsVues: string[] = [premier.octroi.sessionId];
    const grantsVus: string[] = [premier.octroi.grantId];
    const jtisAcces: string[] = [premier.acces.jti];
    for (let tour = 0; tour < 3; tour += 1) {
      b.avancerDe(60_000);
      const suivant = await b.emetteur.rafraichir(refresh);
      sessionsVues.push(suivant.sessionIdColonne);
      grantsVus.push(suivant.grantId);
      jtisAcces.push(suivant.acces.jti);
      refresh = suivant.rafraichissement.reveler();
    }

    const second = await octroyer(b);

    console.info(
      `[ADR 0014 · G1] 1 octroi + 3 rafraîchissement(s) · ` +
        `${String(new Set(sessionsVues).size)} session(s) distincte(s) sur ` +
        `${String(sessionsVues.length)} observée(s) · ` +
        `${String(new Set(grantsVus).size)} grantId distinct(s) · ` +
        `${String(new Set(jtisAcces).size)} jti d'accès distinct(s) · ` +
        `second octroi : session différente = ` +
        `${String(second.octroi.sessionId !== premier.octroi.sessionId)}`,
    );

    // ⚠️ LA SESSION NE TOURNE PAS AVEC LE `jti`. C'est toute la décision : le
    //    `jti` change au moins toutes les heures, la session ne change qu'à un
    //    NOUVEL octroi, qui coûte un geste humain.
    expect(new Set(sessionsVues).size).toBe(1);
    expect(new Set(grantsVus).size).toBe(1);
    // Et le `jti`, lui, TOURNE — sans quoi la mesure ci-dessus serait verte sur
    // un émetteur qui ne fait rien tourner du tout.
    expect(new Set(jtisAcces).size).toBe(4);
    // Un NOUVEL octroi ouvre une session neuve, et un grant neuf.
    expect(second.octroi.sessionId).not.toBe(premier.octroi.sessionId);
    expect(second.octroi.grantId).not.toBe(premier.octroi.grantId);
  });

  it("la session écrite en base a la FORME du § 31 — pas une chaîne quelconque", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const ligne = await b.depot.parJti(premier.acces.jti);

    console.info(
      `[ADR 0014 · forme] sessionId de ${String(ligne?.sessionId.length ?? 0)} caractère(s) · ` +
        `conforme à FORME_SESSION_ID : ${String(FORME_SESSION_ID.test(ligne?.sessionId ?? ""))}`,
    );

    // Une session lisible serait refusée par la garde du § 31 à l'écriture du
    // journal — c'est-à-dire ferait perdre la ligne de chaque appel.
    expect(FORME_SESSION_ID.test(ligne?.sessionId ?? "")).toBe(true);
  });

  it("le jeton d'accès vit MOINS LONGTEMPS que la marque de provenance", () => {
    /**
     * ⚠️ **CETTE GARDE TIENT L'ARGUMENT DE L'ADR 0014, PAS UN RÉGLAGE.** Son
     *    raisonnement est : « une session dérivée du `jti` s'effacerait trois fois
     *    par TTL de marque ». Il ne vaut que tant que la durée d'accès reste
     *    INFÉRIEURE à `TTL_MARQUAGE_MS`. Allonger la première au-delà de la
     *    seconde ne casserait rien de visible et retirerait au § 20 son argument.
     */
    console.info(
      `[ADR 0014 · durées] ${String(DUREES_DE_L_EMETTEUR.length)} durée(s) déclarée(s) · ` +
        `accès ${String(DUREE_DU_JETON_DACCES_MS)} ms · ` +
        `TTL de marque ${String(TTL_MARQUAGE_MS)} ms · ` +
        `rapport ${String(TTL_MARQUAGE_MS / DUREE_DU_JETON_DACCES_MS)}`,
    );

    expect(DUREE_DU_JETON_DACCES_MS).toBeLessThan(TTL_MARQUAGE_MS);
    expect(DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS).toBeGreaterThan(DUREE_DU_JETON_DACCES_MS);
    expect(DUREE_DU_CODE_DAUTORISATION_MS).toBeLessThan(DUREE_DU_JETON_DACCES_MS);
    expect(DUREES_DE_L_EMETTEUR).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LE JETON EN CLAIR NE SORT QU'UNE FOIS
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 19.1 — le jeton en clair ne s'affiche QU'UNE SEULE FOIS", () => {
  it("la seconde révélation LÈVE — c'est un mécanisme, pas une promesse", async () => {
    const b = banc();
    const premier = await octroyer(b);

    const premiere = premier.acces.reveler();

    console.info(
      `[§ 19.1 · une fois] jeton de ${String(premiere.length)} caractère(s) révélé une fois · ` +
        `${String(OCTETS_DUN_JETON)} octets d'aléa demandés`,
    );

    expect(premiere.length).toBeGreaterThan(30);
    expect(() => premier.acces.reveler()).toThrow(ErreurJetonDejaRevele);
    // Le rafraîchissement est un objet distinct : révéler l'un ne consomme pas l'autre.
    expect(() => premier.rafraichissement.reveler()).not.toThrow();
  });

  it("AUCUN champ de la ligne écrite ne porte le jeton en clair", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const clair = premier.acces.reveler();
    const ligne = await b.depot.parJti(premier.acces.jti);

    const champsPorteurs: string[] = [];
    for (const [champ, valeur] of Object.entries(ligne ?? {})) {
      const texte = Array.isArray(valeur) ? valeur.join("|") : String(valeur);
      if (texte.includes(clair)) champsPorteurs.push(champ);
    }

    console.info(
      `[§ 19.1 · empreinte] ${String(Object.keys(ligne ?? {}).length)} champ(s) de la ligne ` +
        `balayé(s) · ${String(champsPorteurs.length)} porte(nt) le clair ` +
        `[${champsPorteurs.join(", ") || "aucun"}] · ` +
        `tokenHash de ${String(ligne?.tokenHash.length ?? 0)} caractère(s)`,
    );

    // Plancher : la ligne a RÉELLEMENT été balayée. Zéro champ rendrait
    // « aucun porteur » sans rien mesurer.
    expect(Object.keys(ligne ?? {}).length).toBeGreaterThanOrEqual(12);
    expect(champsPorteurs).toEqual([]);
    // ⚠️ L'EMPREINTE NE PERMET PAS DE RETROUVER LE JETON : elle est clée par le
    //    coffre, et une base extraite sans le secret ne rend rien.
    expect(ligne?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deux octrois ne produisent jamais le même jeton ni le même `jti`", async () => {
    const b = banc();
    const clairs = new Set<string>();
    const jtis = new Set<string>();
    const TIRAGES = 25;
    for (let rang = 0; rang < TIRAGES; rang += 1) {
      const octroi = await octroyer(b);
      clairs.add(octroi.acces.reveler());
      clairs.add(octroi.rafraichissement.reveler());
      jtis.add(octroi.acces.jti);
      jtis.add(octroi.rafraichissement.jti);
    }

    console.info(
      `[§ 19.1 · aléa] ${String(TIRAGES)} octroi(s) · ` +
        `${String(clairs.size)} jeton(s) distinct(s) sur ${String(TIRAGES * 2)} · ` +
        `${String(jtis.size)} jti distinct(s)`,
    );

    // ⚠️ L'INSTRUMENT SE PROUVE : un seul tirage rendrait « tous distincts ».
    expect(clairs.size).toBe(TIRAGES * 2);
    expect(jtis.size).toBe(TIRAGES * 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — L'ÉTAPE 4 : RÉVOCATION, EXPIRATION, AUDIENCE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11, étape 4 — les cinq causes de refus, et chacune par un témoin propre", () => {
  it("un jeton RÉVOQUÉ est refusé, et la cause le NOMME", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const clair = premier.acces.reveler();

    const avant = await b.emetteur.relirePourLEtape4(clair);
    const revoque = await b.emetteur.revoquer(clair, "access");
    const apres = await b.emetteur.relirePourLEtape4(clair);

    console.info(
      `[étape 4 · révocation] avant : admis ${String(avant.admis)} · ` +
        `révocation trouvée : ${String(revoque)} · ` +
        `après : admis ${String(apres.admis)}, cause « ${String(apres.cause)} », ` +
        `statut ${String(apres.statutHttp)}`,
    );

    // ⚠️ LE « AVANT » EST INDISPENSABLE : sans lui, « refusé après » serait vert
    //    sur un émetteur qui refuse tout, y compris ce qu'il vient d'émettre.
    expect(avant.admis).toBe(true);
    expect(revoque).toBe(true);
    expect(apres.admis).toBe(false);
    expect(apres.cause).toBe("jeton-révoqué");
  });

  it("les QUATRE causes sont atteignables, et le statut est DÉRIVÉ d'`APPEL_STEPS`", async () => {
    const b = banc();
    const causes = new Set<string>();

    // 1 · jeton inconnu
    causes.add(String((await b.emetteur.relirePourLEtape4("jamais-emis")).cause));

    // 2 · révoqué
    const pourRevocation = await octroyer(b);
    const clairRevoque = pourRevocation.acces.reveler();
    await b.emetteur.revoquer(clairRevoque, "access");
    causes.add(String((await b.emetteur.relirePourLEtape4(clairRevoque)).cause));

    // 3 · audience étrangère — la ligne a été écrite pour une AUTRE ressource.
    //     C'est le cas réel du domaine du socle qui change après l'émission.
    //     ⚠️ IL EST ÉPROUVÉ AVANT L'EXPIRATION, ET L'ORDRE EST LA MESURE : les
    //        deux bancs ont des horloges distinctes, et avancer celle-ci d'abord
    //        ferait sortir « jeton-expiré » là où l'on croit lire l'audience.
    const bAilleurs = banc({ depot: b.depot, audience: AUTRE_AUDIENCE });
    const pourAudience = await octroyer(bAilleurs);
    causes.add(String((await b.emetteur.relirePourLEtape4(pourAudience.acces.reveler())).cause));

    // 4 · expiré — en dernier, parce qu'il avance l'horloge du banc.
    const pourExpiration = await octroyer(b);
    const clairExpire = pourExpiration.acces.reveler();
    b.avancerDe(DUREE_DU_JETON_DACCES_MS + 1);
    causes.add(String((await b.emetteur.relirePourLEtape4(clairExpire)).cause));

    const statuts = new Set([(await b.emetteur.relirePourLEtape4("x")).statutHttp]);
    const attendu = APPEL_STEPS.find((etape) => etape.cle === "revocation")?.statutHttp;

    console.info(
      `[étape 4 · causes] ${String(causes.size)} cause(s) distincte(s) sur ` +
        `${String(CAUSES_DE_REFUS_A_L_ETAPE_4.length)} déclarée(s) : ${[...causes].join(", ")} · ` +
        `statut rendu ${[...statuts].join(", ")} · attendu par APPEL_STEPS ${String(attendu)}`,
    );

    // ⚠️ TOUTES DÉCLARÉES, TOUTES ATTEINTES. Une cause qu'aucun chemin ne produit
    //    est un compteur du § 24 qui ne se remplit jamais — c'est ce qui a fait
    //    RETIRER « mauvais-genre » de la table plutôt que de la garder « au cas où ».
    expect(causes.size).toBe(CAUSES_DE_REFUS_A_L_ETAPE_4.length);
    // ⚠️ LE STATUT VIENT DU § 11, PAS D'UN 401 ÉCRIT ICI.
    expect([...statuts]).toEqual([attendu]);
  });

  it("un REFRESH présenté à la ressource est simplement INCONNU — la séparation le veut", async () => {
    /**
     * ⚠️ **CE TÉMOIN EXISTE PARCE QU'UNE CAUSE A ÉTÉ RETIRÉE.** Une première
     *    écriture déclarait « mauvais-genre » et la croyait atteignable. Elle ne
     *    l'est pas : l'empreinte est séparée par genre, donc un refresh présenté
     *    ici ne produit pas l'empreinte sous laquelle il a été écrit et la lecture
     *    ne trouve RIEN. Le refus est juste ; c'est la cause qui était de trop.
     *    Sans ce témoin, personne ne saurait pourquoi la table n'en porte que
     *    quatre.
     */
    const b = banc();
    const premier = await octroyer(b);
    const verdict = await b.emetteur.relirePourLEtape4(premier.rafraichissement.reveler());

    console.info(
      `[étape 4 · genre] un refresh présenté à la ressource · admis ` +
        `${String(verdict.admis)} · cause « ${String(verdict.cause)} » · ` +
        `ligne trouvée : ${String(verdict.ligne !== null)}`,
    );

    expect(verdict.admis).toBe(false);
    expect(verdict.cause).toBe("jeton-inconnu");
    // La ligne EXISTE en base, mais pas sous cette empreinte-là.
    expect(verdict.ligne).toBeNull();
    expect(await b.depot.parJti(premier.rafraichissement.jti)).not.toBeNull();
  });

  it("un jeton émis pour une AUTRE audience est refusé — l'égalité est EXACTE", async () => {
    // Deux émetteurs, un seul dépôt : c'est exactement ce qui arrive quand le
    // domaine du socle change et que les jetons en circulation ne changent pas.
    const partage = creerDepotDeJetonsEnMemoire();
    const ici = banc({ depot: partage });
    const ailleurs = banc({ depot: partage, audience: AUTRE_AUDIENCE });

    const dIci = await octroyer(ici);
    const dAilleurs = await octroyer(ailleurs);

    const verdictLocal = await ici.emetteur.relirePourLEtape4(dIci.acces.reveler());
    const verdictEtranger = await ici.emetteur.relirePourLEtape4(dAilleurs.acces.reveler());

    console.info(
      `[étape 4 · audience] jeton local : admis ${String(verdictLocal.admis)} · ` +
        `jeton d'une autre ressource : admis ${String(verdictEtranger.admis)}, ` +
        `cause « ${String(verdictEtranger.cause)} »`,
    );

    expect(verdictLocal.admis).toBe(true);
    expect(verdictEtranger.admis).toBe(false);
    expect(verdictEtranger.cause).toBe("audience-étrangère");
    // ⚠️ ET LE MOTIF NE RECOPIE PAS L'AUDIENCE ATTENDUE : le dire à un appelant
    //    non authentifié serait lui donner la moitié du travail.
    expect(verdictEtranger.motif).not.toContain(AUDIENCE);
  });

  it("RFC 7009 sans `token_type_hint` — un refresh est révoqué, sans que le client le dise", async () => {
    /**
     * ⚠️ **LA SÉPARATION DE DOMAINE PAR GENRE REND CE CHEMIN NÉCESSAIRE, ET SON
     *    ABSENCE SERAIT MUETTE.** L'indice est OPTIONNEL dans la RFC 7009. Un
     *    point d'entrée qui supposerait `access` chercherait le refresh sous la
     *    mauvaise empreinte, ne trouverait rien, et répondrait `200` comme la RFC
     *    l'exige — **sans rien révoquer**. Le client croirait avoir rendu son
     *    jeton ; le jeton vivrait trente jours de plus, et aucun compte ne
     *    bougerait. C'est le pire état possible d'une révocation.
     */
    const b = banc();
    const premier = await octroyer(b);
    const refresh = premier.rafraichissement.reveler();

    // Le mauvais indice ne trouve RIEN — c'est la panne muette qu'on mesure.
    const parMauvaisIndice = await b.emetteur.revoquer(refresh, "access");
    // Sans indice, l'émetteur essaie tous les genres et RÉVOQUE.
    const sansIndice = await b.emetteur.revoquerSansIndice(refresh);
    const ligne = await b.depot.parJti(premier.rafraichissement.jti);

    console.info(
      `[RFC 7009] ${String(GENRES_DE_JETON.length)} genre(s) parcouru(s) · ` +
        `avec le MAUVAIS indice : ${String(parMauvaisIndice)} · ` +
        `sans indice : ${String(sansIndice)} ligne(s) révoquée(s) · ` +
        `refresh effectivement révoqué : ${String(ligne?.revokedAt !== null)}`,
    );

    // La panne muette EXISTE, et c'est ce qui justifie la seconde méthode.
    expect(parMauvaisIndice).toBe(false);
    expect(sansIndice).toBe(1);
    expect(ligne?.revokedAt).not.toBeNull();
  });

  it("un usage admis pose `lastUsedAt` — sans quoi « ce jeton sert-il ? » n'a pas de source", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const avant = await b.depot.parJti(premier.acces.jti);
    b.avancerDe(5_000);
    await b.emetteur.relirePourLEtape4(premier.acces.reveler());
    const apres = await b.depot.parJti(premier.acces.jti);

    console.info(
      `[étape 4 · lastUsedAt] avant : ${String(avant?.lastUsedAt)} · ` +
        `après : ${String(apres?.lastUsedAt?.toISOString())}`,
    );

    expect(avant?.lastUsedAt).toBeNull();
    expect(apres?.lastUsedAt).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G4 — LA ROTATION, ET LA DÉTECTION DE REJEU
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0027, point 3 — 30 jours ROTATIFS, et un rejeu révoque toute la chaîne", () => {
  it("chaque usage d'un refresh révoque l'ancien et en émet un neuf", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const ancien = premier.rafraichissement.jti;

    const suivant = await b.emetteur.rafraichir(premier.rafraichissement.reveler());
    const ligneAncienne = await b.depot.parJti(ancien);

    console.info(
      `[rotation] ancien refresh « ${ancien} » révoqué : ` +
        `${String(ligneAncienne?.revokedAt !== null)} · ` +
        `neuf « ${suivant.rafraichissement.jti} » · ` +
        `même grantId : ${String(suivant.grantId === premier.octroi.grantId)}`,
    );

    expect(ligneAncienne?.revokedAt).not.toBeNull();
    expect(suivant.ancienRafraichissementRevoque).toBe(ancien);
    expect(suivant.rafraichissement.jti).not.toBe(ancien);
  });

  it("un refresh DÉJÀ RÉVOQUÉ qui se représente révoque TOUTE la chaîne d'octroi", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const clairInitial = premier.rafraichissement.reveler();

    // Rotation normale : le client obtient un refresh neuf.
    const apresRotation = await b.emetteur.rafraichir(clairInitial);
    const vivantsAvant = (await b.depot.listerLaChaine(premier.octroi.grantId)).filter(
      (ligne) => ligne.revokedAt === null,
    );

    // ⚠️ LE REJEU. Un client qui rejoue et un attaquant intercalé sont
    //    INDISCERNABLES : la lecture sûre est la seconde.
    let cause = "";
    try {
      await b.emetteur.rafraichir(clairInitial);
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(ErreurDOctroi);
      cause = (erreur as ErreurDOctroi).causeDuRefus;
    }

    const chaine = await b.depot.listerLaChaine(premier.octroi.grantId);
    const vivantsApres = chaine.filter((ligne) => ligne.revokedAt === null);

    // Et le jeton d'accès né du rafraîchissement ne vaut plus rien.
    const verdict = await b.emetteur.relirePourLEtape4(apresRotation.acces.reveler());

    console.info(
      `[rejeu] ${String(chaine.length)} ligne(s) dans la chaîne · ` +
        `${String(vivantsAvant.length)} vivante(s) avant le rejeu · ` +
        `${String(vivantsApres.length)} après · cause « ${cause} » · ` +
        `l'accès né de la rotation est encore admis : ${String(verdict.admis)}`,
    );

    expect(cause).toBe("rejeu-détecté");
    // Plancher : la chaîne avait BIEN des jetons vivants à révoquer. Zéro
    // rendrait « tout révoqué » sans que rien n'ait été fait.
    expect(vivantsAvant.length).toBeGreaterThan(0);
    expect(vivantsApres).toEqual([]);
    expect(verdict.admis).toBe(false);
  });

  it("un refresh EXPIRÉ est refusé, et sa cause diffère de celle du rejeu", async () => {
    const b = banc();
    const premier = await octroyer(b);
    b.avancerDe(DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS + 1);

    let cause = "";
    try {
      await b.emetteur.rafraichir(premier.rafraichissement.reveler());
    } catch (erreur) {
      cause = (erreur as ErreurDOctroi).causeDuRefus;
    }

    console.info(`[rotation · expiration] cause « ${cause} »`);

    // ⚠️ « EXPIRÉ » ET « REJEU » NE SE CONFONDENT PAS : le premier est une durée
    //    normale, le second est peut-être une attaque. Un compteur unique les
    //    mélangerait, et le § 24 ne verrait rien venir.
    expect(cause).toBe("rafraîchissement-expiré");
  });

  it("un jeton d'ACCÈS présenté au rafraîchissement ne déclenche PAS la révocation de chaîne", async () => {
    /**
     * ⚠️ **C'EST CE QUE LA SÉPARATION DE DOMAINE PAR GENRE PROTÈGE.** Sans elle,
     *    l'empreinte d'un accès révoqué serait celle d'un refresh révoqué, et
     *    présenter un vieux jeton d'accès au rafraîchissement révoquerait toute la
     *    chaîne : la détection de rejeu se retournerait en déni de service, à la
     *    portée de quiconque a vu passer un jeton expiré.
     */
    const b = banc();
    const premier = await octroyer(b);
    const acces = premier.acces.reveler();

    let cause = "";
    try {
      await b.emetteur.rafraichir(acces);
    } catch (erreur) {
      cause = (erreur as ErreurDOctroi).causeDuRefus;
    }

    const chaine = await b.depot.listerLaChaine(premier.octroi.grantId);
    const vivants = chaine.filter((ligne) => ligne.revokedAt === null);

    console.info(
      `[genre] un accès présenté au rafraîchissement · cause « ${cause} » · ` +
        `${String(vivants.length)} jeton(s) encore vivant(s) sur ${String(chaine.length)}`,
    );

    expect(cause).toBe("rafraîchissement-inconnu");
    expect(vivants.length).toBe(chaine.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G5 — CE QUE L'ÉMETTEUR REFUSE D'ÉMETTRE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0027 — l'émetteur refuse À L'OCTROI ce que l'étape 5 refuserait trop tard", () => {
  it("`ops:policy` demandé par un connecteur : AUCUNE ligne n'est écrite", async () => {
    const b = banc();
    let leve = false;
    try {
      await b.emetteur.preparerUneAutorisation({
        principal: "connecteur.mcp",
        scopesDemandes: ["ops:read", "ops:policy"],
        indicateursDeRessource: [AUDIENCE],
        defi: defiAttendu(VERIFICATEUR),
        methodeDeDefi: "S256",
      });
    } catch (erreur) {
      leve = true;
      expect(erreur).toBeInstanceOf(ErreurScopeNonEmissible);
    }

    // ⚠️ LA MESURE QUI COMPTE N'EST PAS L'EXCEPTION, C'EST L'ABSENCE DE LIGNE.
    //    Un jeton portant `ops:policy` qu'aucun appel n'atteindrait resterait une
    //    capacité en circulation.
    const chaines = await b.depot.listerLaChaine("");
    console.info(
      `[§ 19.2 · octroi] refus levé : ${String(leve)} · ` +
        `${String(chaines.length)} ligne(s) écrite(s) pour un grantId vide`,
    );

    expect(leve).toBe(true);
    expect(chaines).toEqual([]);
  });

  it("un principal que le journal refuserait est refusé À L'ÉMISSION", async () => {
    const b = banc();
    const refuses = ["will@axion-ops.invalid", "connecteur de Will", "a".repeat(200)];
    const passes: string[] = [];

    for (const principal of refuses) {
      try {
        await b.emetteur.preparerUneAutorisation({
          principal,
          scopesDemandes: ["ops:read"],
          indicateursDeRessource: [AUDIENCE],
          defi: defiAttendu(VERIFICATEUR),
          methodeDeDefi: "S256",
        });
        passes.push(principal);
      } catch (erreur) {
        expect(erreur).toBeInstanceOf(ErreurPrincipalRefuse);
      }
    }

    console.info(
      `[ADR 0029 · à la source] ${String(refuses.length)} principal(aux) refusable(s) · ` +
        `${String(passes.length)} passé(s) au travers [${passes.length}]`,
    );

    expect(passes).toEqual([]);
  });

  it("un défi `plain` est refusé DÈS le consentement, pas à l'échange", async () => {
    const b = banc();
    let cause = "";
    try {
      await b.emetteur.preparerUneAutorisation({
        principal: "connecteur.mcp",
        scopesDemandes: ["ops:read"],
        indicateursDeRessource: [AUDIENCE],
        defi: VERIFICATEUR,
        methodeDeDefi: "plain",
      });
    } catch (erreur) {
      cause = (erreur as ErreurDOctroi).causeDuRefus;
    }

    console.info(`[PKCE · consentement] cause « ${cause} »`);

    // Accepter ici pour refuser plus loin ferait perdre à l'humain son
    // consentement pour une raison qu'il apprendrait trop tard.
    expect(cause).toBe("pkce-refusé");
  });

  it("un code d'autorisation est à usage UNIQUE, et il expire", async () => {
    const b = banc();
    const preparee = await b.emetteur.preparerUneAutorisation({
      principal: "connecteur.mcp",
      scopesDemandes: ["ops:read"],
      indicateursDeRessource: [AUDIENCE],
      defi: defiAttendu(VERIFICATEUR),
      methodeDeDefi: "S256",
    });

    await b.emetteur.echangerLeCode(preparee.code, VERIFICATEUR);
    let secondEssai = "";
    try {
      await b.emetteur.echangerLeCode(preparee.code, VERIFICATEUR);
    } catch (erreur) {
      secondEssai = (erreur as ErreurDOctroi).causeDuRefus;
    }

    // Et un vérificateur FAUX consomme quand même le code : sinon PKCE devient
    // une énumération sur un code qu'on peut réessayer.
    const autre = await b.emetteur.preparerUneAutorisation({
      principal: "connecteur.mcp",
      scopesDemandes: ["ops:read"],
      indicateursDeRessource: [AUDIENCE],
      defi: defiAttendu(VERIFICATEUR),
      methodeDeDefi: "S256",
    });
    let apresEchec = "";
    try {
      await b.emetteur.echangerLeCode(autre.code, "b".repeat(64));
    } catch {
      /* attendu : pkce-refusé */
    }
    try {
      await b.emetteur.echangerLeCode(autre.code, VERIFICATEUR);
    } catch (erreur) {
      apresEchec = (erreur as ErreurDOctroi).causeDuRefus;
    }

    console.info(
      `[code · usage unique] rejeu après succès : « ${secondEssai} » · ` +
        `rejeu après vérificateur faux : « ${apresEchec} »`,
    );

    expect(secondEssai).toBe("code-inconnu-ou-consommé");
    expect(apresEchec).toBe("code-inconnu-ou-consommé");
  });

  it("un code EXPIRÉ est refusé, avec sa propre cause", async () => {
    const b = banc();
    const preparee = await b.emetteur.preparerUneAutorisation({
      principal: "connecteur.mcp",
      scopesDemandes: ["ops:read"],
      indicateursDeRessource: [AUDIENCE],
      defi: defiAttendu(VERIFICATEUR),
      methodeDeDefi: "S256",
    });
    b.avancerDe(DUREE_DU_CODE_DAUTORISATION_MS + 1);

    let cause = "";
    try {
      await b.emetteur.echangerLeCode(preparee.code, VERIFICATEUR);
    } catch (erreur) {
      cause = (erreur as ErreurDOctroi).causeDuRefus;
    }

    console.info(`[code · expiration] cause « ${cause} »`);
    expect(cause).toBe("code-expiré");
  });

  it("une audience DEMANDÉE étrangère est refusée à l'octroi, pas seulement à l'étape 3", async () => {
    const b = banc();
    const refuses: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["aucune", []],
      ["deux", [AUDIENCE, AUTRE_AUDIENCE]],
      ["étrangère", [AUTRE_AUDIENCE]],
    ];

    const passes: string[] = [];
    for (const [nom, indicateurs] of refuses) {
      try {
        await b.emetteur.preparerUneAutorisation({
          principal: "connecteur.mcp",
          scopesDemandes: ["ops:read"],
          indicateursDeRessource: indicateurs,
          defi: defiAttendu(VERIFICATEUR),
          methodeDeDefi: "S256",
        });
        passes.push(nom);
      } catch (erreur) {
        expect((erreur as ErreurDOctroi).causeDuRefus, nom).toBe("audience-refusée");
      }
    }

    console.info(
      `[RFC 8707 · octroi] ${String(refuses.length)} demande(s) d'audience refusable(s) · ` +
        `${String(passes.length)} passée(s) [${passes.join(", ") || "aucune"}]`,
    );

    expect(passes).toEqual([]);
  });

  it("l'émetteur NE SE MONTE PAS sur une audience mal formée", () => {
    // ⚠️ UNE AUDIENCE MAL FORMÉE S'ÉCRIRAIT DANS `ops_token.audience`, QUI N'EST
    //    JAMAIS RÉÉCRITE : la corriger après coup effacerait la seule trace de ce
    //    pour quoi le jeton avait été émis.
    const malFormees = ["oui", "https://stub.invalid", "https://stub.invalid/api/mcp/"];
    const montees: string[] = [];

    for (const audience of malFormees) {
      try {
        banc({ audience });
        montees.push(audience);
      } catch (erreur) {
        expect(erreur).toBeInstanceOf(ErreurAudienceDeMontage);
      }
    }

    console.info(
      `[ADR 0026 · montage] ${String(malFormees.length)} audience(s) mal formée(s) · ` +
        `${String(montees.length)} montée(s) [${montees.join(", ") || "aucune"}]`,
    );

    expect(montees).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G6 — LE DÉPÔT TIENT SES INVARIANTS
// ═════════════════════════════════════════════════════════════════════════════

describe("le magasin tient ce que le port déclare — il n'est pas un double complaisant", () => {
  it("refuse un `jti` ou un `tokenHash` déjà présents, et ne réécrit pas une révocation", async () => {
    const depot = creerDepotDeJetonsEnMemoire();
    const ligne: LigneOpsToken = {
      jti: "jti-1",
      tokenHash: "a".repeat(64),
      principal: "connecteur.mcp",
      kind: "access",
      scopes: ["ops:read"],
      audience: AUDIENCE,
      grantId: "grant-1",
      sessionId: "0".repeat(64),
      issuedAt: T0,
      expiresAt: new Date(T0.getTime() + DUREE_DU_JETON_DACCES_MS),
      revokedAt: null,
      lastUsedAt: null,
    };
    await depot.inserer(ligne);

    const refus: string[] = [];
    await expect(depot.inserer(ligne)).rejects.toThrow();
    refus.push("jti");
    await expect(depot.inserer({ ...ligne, jti: "jti-2" })).rejects.toThrow();
    refus.push("tokenHash");

    const premier = new Date(T0.getTime() + 1_000);
    const second = new Date(T0.getTime() + 2_000);
    await depot.revoquer("jti-1", premier);
    await depot.revoquer("jti-1", second);
    const apres = await depot.parJti("jti-1");

    console.info(
      `[dépôt] ${String(refus.length)} unicité(s) tenue(s) [${refus.join(", ")}] · ` +
        `revokedAt conservé : ${String(apres?.revokedAt?.toISOString())} ` +
        `(première révocation ${premier.toISOString()})`,
    );

    // ⚠️ UNE RÉVOCATION NE SE RÉÉCRIT PAS : `revokedAt` dit QUAND la capacité a
    //    cessé, et l'écraser effacerait l'instant qui compte pour une revue.
    expect(apres?.revokedAt?.getTime()).toBe(premier.getTime());
  });

  it("rend des COPIES — muter ce qu'il rend ne contourne pas `revoquer()`", async () => {
    const b = banc();
    const premier = await octroyer(b);
    const lue = await b.depot.parJti(premier.acces.jti);
    if (lue !== null) {
      (lue as { revokedAt: Date | null }).revokedAt = new Date(0);
    }
    const relue = await b.depot.parJti(premier.acces.jti);

    console.info(
      `[dépôt · copies] mutation tentée sur la ligne rendue · ` +
        `revokedAt en magasin après mutation : ${String(relue?.revokedAt)}`,
    );

    // Une base ne rend jamais un objet mutable partagé ; le double ne doit pas
    // être plus permissif que ce qu'il double.
    expect(relue?.revokedAt).toBeNull();
  });
});
