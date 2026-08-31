import { describe, expect, it } from "vitest";

import { OPS_SCOPES } from "../types.js";
import {
  PORTE_PAR_LE_JETON_DAPPEL,
  SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL,
} from "../chaine/etape-05-scopes.js";
import { SCOPES_PAR_DEFAUT_STDIO } from "../chaine/orchestrateur.js";
import {
  ErreurScopeNonEmissible,
  SCOPES_EMISSIBLES,
  estEmissible,
  verdictDeScopesDemandes,
} from "./scopes.js";

/**
 * GARDES DES SCOPES ÉMISSIBLES — ADR 0027, point 6 ; § 19.2 ; § 20.
 *
 * ═══ CE QUI SE MESURE ICI, ET POURQUOI ═══
 *
 * La règle du § 19.2 — « le jeton du connecteur ne porte JAMAIS `ops:policy` » —
 * est facile à écrire et facile à perdre. Elle se perd de deux façons :
 *
 *  · **par une seconde liste.** Un `SCOPES_EMISSIBLES` écrit à la main
 *    divergerait de `PORTE_PAR_LE_JETON_DAPPEL` au premier scope ajouté, et la
 *    liste qui ne suit pas est celle qui accorde de trop ;
 *  · **par un trou entre les deux ensembles.** Un scope qui ne serait ni
 *    émissible ni explicitement refusé serait refusé SANS MOTIF ÉCRIT, et
 *    personne ne saurait dire si c'est voulu.
 *
 * Les deux se mesurent par la même propriété : les deux ensembles
 * **PARTITIONNENT** `OPS_SCOPES` — ni recouvrement, ni trou.
 */

describe("§ 19.2 — l'ensemble émissible est une DÉRIVATION, pas une liste", () => {
  it("partitionne `OPS_SCOPES` avec l'ensemble jamais porté — ni trou, ni recouvrement", () => {
    const emissibles = new Set<string>(SCOPES_EMISSIBLES);
    const jamais = new Set<string>(SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL);

    const recouvrement = [...emissibles].filter((scope) => jamais.has(scope));
    const orphelins = OPS_SCOPES.filter((scope) => !emissibles.has(scope) && !jamais.has(scope));

    console.info(
      `[§ 19.2 · partition] ${String(OPS_SCOPES.length)} scope(s) au socle · ` +
        `${String(emissibles.size)} émissible(s) [${[...emissibles].join(", ")}] · ` +
        `${String(jamais.size)} jamais porté(s) [${[...jamais].join(", ")}] · ` +
        `${String(recouvrement.length)} recouvrement(s) · ${String(orphelins.length)} orphelin(s)`,
    );

    expect(recouvrement).toEqual([]);
    expect(orphelins).toEqual([]);
    expect(emissibles.size + jamais.size).toBe(OPS_SCOPES.length);
    // Plancher : la dérivation n'est pas dégénérée. Un ensemble vide des deux
    // côtés satisferait « pas de recouvrement » sans rien garder.
    expect(emissibles.size).toBeGreaterThanOrEqual(3);
    expect(jamais.size).toBeGreaterThanOrEqual(1);
  });

  it("dit la MÊME chose que la table lue par l'étape 5 — scope par scope", () => {
    // ⚠️ CE N'EST PAS UNE REDONDANCE : c'est la mesure que `estEmissible` LIT la
    //    table plutôt que de la figer dans son corps. Un `switch` recopié
    //    passerait aujourd'hui et divergerait au premier scope ajouté.
    const desaccords = OPS_SCOPES.filter(
      (scope) => estEmissible(scope) !== PORTE_PAR_LE_JETON_DAPPEL[scope],
    );

    console.info(
      `[§ 19.2 · lecture] ${String(OPS_SCOPES.length)} scope(s) confronté(s) à ` +
        `PORTE_PAR_LE_JETON_DAPPEL · ${String(desaccords.length)} désaccord(s)`,
    );

    expect(desaccords).toEqual([]);
  });

  it("les scopes par défaut du stdio sont TOUS émissibles — même totalité, deux lecteurs", () => {
    /**
     * ⚠️ L'ADR 0027 l'écrit : « c'est la même totalité qui produit déjà
     *    `SCOPES_PAR_DEFAUT_STDIO` ». Si l'un des deux lecteurs cessait de lire la
     *    table, un scope pourrait être par défaut en stdio et refusé à l'octroi —
     *    deux transports, deux droits, sans qu'aucune décision ne le dise.
     */
    const horsEmissibles = SCOPES_PAR_DEFAUT_STDIO.filter((scope) => !estEmissible(scope));

    console.info(
      `[§ 19.2 · stdio] ${String(SCOPES_PAR_DEFAUT_STDIO.length)} scope(s) par défaut en stdio ` +
        `[${SCOPES_PAR_DEFAUT_STDIO.join(", ")}] · ` +
        `${String(horsEmissibles.length)} hors de l'ensemble émissible`,
    );

    expect(SCOPES_PAR_DEFAUT_STDIO.length).toBeGreaterThan(0);
    expect(horsEmissibles).toEqual([]);
  });
});

describe("ADR 0027 — l'émetteur refuse À L'OCTROI, et il ne réduit pas en silence", () => {
  it("refuse `ops:policy` demandé par un connecteur, et NOMME la règle", () => {
    const verdict = verdictDeScopesDemandes(["ops:read", "ops:policy"]);

    console.info(
      `[ADR 0027 · policy] ${String(verdict.scopesConfrontes)} scope(s) confronté(s) · ` +
        `${String(verdict.accordes.length)} accordé(s) [${verdict.accordes.join(", ")}] · ` +
        `${String(verdict.refuses.length)} refusé(s) ` +
        `[${verdict.refuses.map((r) => r.scope).join(", ")}] · ` +
        `${String(verdict.inconnus.length)} inconnu(s)`,
    );

    expect(verdict.scopesConfrontes).toBe(2);
    expect(verdict.refuses.map((refus) => refus.scope)).toEqual(["ops:policy"]);
    // Le motif nomme la règle ET la voie légitime : § 15, deuxième règle.
    expect(verdict.refuses[0]?.motif).toContain("§ 19.2");
    expect(verdict.refuses[0]?.motif).toContain("console");
  });

  it("un scope INCONNU est refusé aussi — un silence en ferait un droit perdu", () => {
    const verdict = verdictDeScopesDemandes(["ops:read", "ops:tout", "openid"]);

    console.info(
      `[ADR 0027 · inconnus] ${String(verdict.scopesConfrontes)} confronté(s) · ` +
        `${String(verdict.inconnus.length)} inconnu(s) [${verdict.inconnus.join(", ")}] · ` +
        `${String(verdict.accordes.length)} accordé(s)`,
    );

    expect(verdict.inconnus).toEqual(["ops:tout", "openid"]);
    // ⚠️ ILS NE SONT PAS DANS `accordes`. Un scope inconnu accordé serait un
    //    droit que personne ne sait interpréter, écrit dans `ops_token.scopes`.
    expect(verdict.accordes).toEqual(["ops:read"]);
  });

  it("l'erreur d'octroi porte les DEUX familles, et ne réduit jamais en silence", () => {
    const verdict = verdictDeScopesDemandes(["ops:policy", "ops:inconnu"]);
    const erreur = new ErreurScopeNonEmissible(verdict);

    console.info(
      `[ADR 0027 · erreur] ${String(erreur.refuses.length)} refusé(s) · ` +
        `${String(erreur.inconnus.length)} inconnu(s) · ` +
        `message de ${String(erreur.message.length)} caractère(s)`,
    );

    expect(erreur.refuses).toEqual(["ops:policy"]);
    expect(erreur.inconnus).toEqual(["ops:inconnu"]);
    // Le message dit explicitement que l'octroi n'est PAS réduit : c'est la
    // décision, et un lecteur pressé la chercherait là.
    expect(erreur.message).toContain("PAS");
    expect(erreur.message).toContain("réduit");
  });

  it("SAIT ACCORDER — sans quoi les refus ci-dessus seraient verts sur un refuseur", () => {
    const verdict = verdictDeScopesDemandes([...SCOPES_EMISSIBLES]);

    console.info(
      `[ADR 0027 · capacité] ${String(verdict.scopesConfrontes)} scope(s) émissible(s) ` +
        `demandé(s) · ${String(verdict.accordes.length)} accordé(s) · ` +
        `${String(verdict.refuses.length)} refusé(s) · ${String(verdict.inconnus.length)} inconnu(s)`,
    );

    expect(verdict.accordes).toEqual([...SCOPES_EMISSIBLES]);
    expect(verdict.refuses).toEqual([]);
    expect(verdict.inconnus).toEqual([]);
  });

  it("compte TOUS les scopes demandés, pas seulement ceux d'avant l'échec", () => {
    // ⚠️ UN COMPTE QUI DÉPEND DU RÉSULTAT NE PEUT PAS SERVIR DE PLANCHER. Si la
    //    boucle s'arrêtait à la première anomalie, `scopesConfrontes` vaudrait
    //    « combien avant l'échec » — un chiffre qui décroît quand le problème
    //    s'aggrave, donc inutilisable.
    const verdict = verdictDeScopesDemandes(["ops:policy", "ops:read", "ops:send", "ops:draft"]);

    console.info(
      `[ADR 0027 · compte] 4 demandé(s) · ${String(verdict.scopesConfrontes)} confronté(s) · ` +
        `refus en PREMIÈRE position`,
    );

    expect(verdict.scopesConfrontes).toBe(4);
    expect(verdict.accordes).toHaveLength(3);
  });
});
