import { describe, expect, it } from "vitest";

import { POLITIQUE_DE_CHEMINS } from "../../ops/acces/politique-de-chemins.js";
import type { EntreeDePolitiqueDAcces } from "../../ops/acces/politique-de-chemins.js";
import { ROUTES_DU_SOCLE, ROUTES_SANS_COFFRE } from "../vault/demarrage.js";
import { METHODES_DE_DEFI_ADMISES } from "./pkce.js";
import { SCOPES_EMISSIBLES } from "./scopes.js";
import {
  CHEMINS_DE_L_EMETTEUR_SANS_COFFRE,
  CHEMINS_SERVIS_PAR_L_EMETTEUR,
  CHEMIN_AUTORISATION,
  CHEMIN_DECOUVERTE_DE_LA_RESSOURCE,
  CHEMIN_JETON,
  CHEMIN_REVOCATION,
  FAMILLES_DE_ROUTES_DE_L_EMETTEUR,
  metadonneesDeLEmetteur,
  metadonneesDeLaRessource,
} from "./routes.js";

/**
 * GARDES DES ROUTES DE L'ÉMETTEUR — ADR 0028, ADR 0027 (point 7), § 16, § 21.
 *
 * ═══ LE SENS DE LECTURE, ET POURQUOI IL N'EST PAS L'AUTRE ═══
 *
 * `ops/acces/politique-de-chemins.ts` l'écrit lui-même : « une garde qui se
 * contenterait de relire `POLITIQUE_DE_CHEMINS` serait verte le jour où un
 * chemin neuf est servi sans y être déclaré — c'est-à-dire le seul jour où elle
 * aurait quelque chose à dire ». La SOURCE est donc l'ensemble des chemins que le
 * code SERT, et ce fichier porte la moitié `core/auth/` de cette source.
 *
 * ⚠️ **CE QUE CETTE GARDE NE TIENT PAS, ÉCRIT AVEC LA MESURE.** Elle répond à
 *    « le dépôt est-il cohérent avec lui-même ? ». Elle ne répond PAS à « la
 *    porte est-elle posée chez Cloudflare ? », et aucune garde de ce dépôt ne le
 *    peut : il n'y a aucun appel réseau sortant, par règle. Lire un vert d'ici
 *    comme « le risque est couvert » serait raisonner sur une fausse sécurité.
 */

/** Une entrée de politique couvre-t-elle ce chemin ? Sans analyseur de joker. */
function couvre(entree: EntreeDePolitiqueDAcces, chemin: string): boolean {
  return entree.couvre === "exact" ? entree.chemin === chemin : chemin.startsWith(entree.chemin);
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — TOUT CHEMIN SERVI EST DÉCLARÉ, ET DANS LE BON RÉGIME
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0028 — les chemins servis par l'émetteur sont tous couverts", () => {
  it("aucun chemin servi n'échappe à `POLITIQUE_DE_CHEMINS`", () => {
    const nonCouverts = CHEMINS_SERVIS_PAR_L_EMETTEUR.filter(
      (chemin) => !POLITIQUE_DE_CHEMINS.some((entree) => couvre(entree, chemin)),
    );

    console.info(
      `[ADR 0028 · G1] ${String(CHEMINS_SERVIS_PAR_L_EMETTEUR.length)} chemin(s) servi(s) par ` +
        `core/auth/ [${CHEMINS_SERVIS_PAR_L_EMETTEUR.join(", ")}] · ` +
        `${String(POLITIQUE_DE_CHEMINS.length)} entrée(s) de politique lue(s) · ` +
        `${String(nonCouverts.length)} non couvert(s) [${nonCouverts.join(", ") || "aucun"}]`,
    );

    // Planchers : la garde a RÉELLEMENT lu les deux côtés. Zéro chemin servi ou
    // zéro entrée de politique rendrait « zéro non couvert » sans rien mesurer.
    expect(CHEMINS_SERVIS_PAR_L_EMETTEUR.length).toBeGreaterThanOrEqual(5);
    expect(POLITIQUE_DE_CHEMINS.length).toBeGreaterThanOrEqual(5);
    expect(nonCouverts).toEqual([]);
  });

  it("TÉMOIN — un chemin servi non déclaré est VU par la garde ci-dessus", () => {
    // ⚠️ SANS CE TÉMOIN, « 0 non couvert » ne se distingue pas de « la couverture
    //    accepte tout ». On fabrique le chemin qu'un lot futur ajouterait sans y
    //    penser — `/auth/introspect`, RFC 7662 — et on exige qu'il ressorte.
    const fabrique = "/auth/introspect";
    const couvert = POLITIQUE_DE_CHEMINS.some((entree) => couvre(entree, fabrique));

    console.info(
      `[ADR 0028 · témoin] chemin fabriqué « ${fabrique} » · couvert : ${String(couvert)}`,
    );

    expect(couvert).toBe(false);
  });

  it("la coupure passe À L'INTÉRIEUR de `/auth/` — humain derrière Access, machine hors", () => {
    /**
     * ⚠️ **C'EST L'ÉCART ASSUMÉ AVEC LE § 16, ET IL SE MESURE.** Le § 16 met
     *    « les routes d'authentification » derrière Access ; appliqué tel quel,
     *    ce serait le défaut bloquant n° 14 une porte plus loin. La garde
     *    confronte donc le champ `appelePar` de CHAQUE famille au régime déclaré
     *    dans la politique — deux fichiers, deux périmètres, une seule décision.
     */
    const regimeDe = (chemin: string): string | undefined =>
      POLITIQUE_DE_CHEMINS.find((entree) => couvre(entree, chemin))?.regime;

    const desaccords: string[] = [];
    let confrontes = 0;
    for (const famille of FAMILLES_DE_ROUTES_DE_L_EMETTEUR) {
      for (const chemin of famille.chemins) {
        confrontes += 1;
        const regime = regimeDe(chemin);
        // Un chemin appelé par une MACHINE ne peut pas être derrière Access :
        // aucun client MCP n'a de navigateur pour franchir une page de connexion.
        if (famille.appelePar === "machine" && regime === "access") {
          desaccords.push(`${chemin} : appelé par une machine et placé derrière Access`);
        }
        // Une famille qui n'exige AUCUNE authentification et qui serait derrière
        // Access serait la découverte rendue indécouvrable.
        if (!famille.exigeUneAuthentification && regime === "access") {
          desaccords.push(
            `${chemin} : n'exige aucune authentification et pourtant derrière Access`,
          );
        }
      }
    }

    console.info(
      `[ADR 0028 · coupure] ${String(FAMILLES_DE_ROUTES_DE_L_EMETTEUR.length)} famille(s) · ` +
        `${String(confrontes)} chemin(s) confronté(s) à leur régime · ` +
        `régimes : ${CHEMINS_SERVIS_PAR_L_EMETTEUR.map((c) => `${c}=${String(regimeDe(c))}`).join(", ")} · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(confrontes).toBe(CHEMINS_SERVIS_PAR_L_EMETTEUR.length);
    expect(desaccords).toEqual([]);
    // La découverte est en `bypass`, et c'est l'invariant qui ferme le défaut n° 14.
    expect(regimeDe(CHEMIN_DECOUVERTE_DE_LA_RESSOURCE)).toBe("bypass");
    expect(regimeDe(CHEMIN_AUTORISATION)).toBe("access");
    expect(regimeDe(CHEMIN_JETON)).toBe("hors-access");
    expect(regimeDe(CHEMIN_REVOCATION)).toBe("hors-access");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LE COFFRE, ET LE CLIQUET DE `ROUTES_SANS_COFFRE`
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0027, point 7 — chaque famille DÉCLARE si elle exige le coffre", () => {
  it("la déclaration est complète, et l'ensemble « sans coffre » en DÉRIVE", () => {
    const sansCoffre = new Set(CHEMINS_DE_L_EMETTEUR_SANS_COFFRE);
    const recalcule = FAMILLES_DE_ROUTES_DE_L_EMETTEUR.filter((f) => !f.exigeLeCoffre).flatMap(
      (f) => f.chemins,
    );

    console.info(
      `[ADR 0027 · coffre] ${String(FAMILLES_DE_ROUTES_DE_L_EMETTEUR.length)} famille(s) · ` +
        `${String(FAMILLES_DE_ROUTES_DE_L_EMETTEUR.filter((f) => f.exigeLeCoffre).length)} ` +
        `exige(nt) le coffre · ${String(sansCoffre.size)} chemin(s) répondent sous coffre ` +
        `verrouillé [${[...sansCoffre].join(", ")}]`,
    );

    expect([...sansCoffre]).toEqual(recalcule);
    // ⚠️ LA DÉCOUVERTE RÉPOND SOUS COFFRE VERROUILLÉ, `/auth/token` NON. C'est la
    //    conséquence assumée de l'ADR 0027 : `tokenHash` est clé par le coffre.
    expect(sansCoffre.has(CHEMIN_DECOUVERTE_DE_LA_RESSOURCE)).toBe(true);
    expect(sansCoffre.has(CHEMIN_JETON)).toBe(false);
    // Les deux familles existent : une déclaration où toutes répondraient pareil
    // ne prouverait pas que le champ décide de quoi que ce soit.
    expect(sansCoffre.size).toBeGreaterThan(0);
    expect(sansCoffre.size).toBeLessThan(CHEMINS_SERVIS_PAR_L_EMETTEUR.length);
  });

  it("CLIQUET — `ROUTES_SANS_COFFRE` se dérive encore PAR EXCEPTION, et c'est une dette", () => {
    /**
     * ⚠️ **CE TEST EST VERT AUJOURD'HUI ET DOIT ROUGIR DEMAIN.** L'ADR 0027,
     *    point 7, exige que `ROUTES_SANS_COFFRE` cesse de valoir « tout sauf
     *    `outils` » et se dérive d'une DÉCLARATION par famille. Le fichier qui
     *    porte cette dérivation est `core/vault/demarrage.ts` — hors de ce
     *    périmètre. La déclaration existe désormais du côté émetteur ; la
     *    dérivation, non.
     *
     *    Le cliquet mesure l'état RÉEL : quatre familles de routes du socle,
     *    aucune n'étant l'émission. Le jour où `ROUTES_DU_SOCLE` en gagne une, ce
     *    test rougit — et c'est ce qui force la dérivation à passer par la
     *    déclaration au lieu de rester une exception qui s'allonge.
     */
    const familles = [...ROUTES_DU_SOCLE];
    const derivéParException = ROUTES_DU_SOCLE.filter((route) => route !== "outils");
    const commeAujourdHui =
      derivéParException.length === ROUTES_SANS_COFFRE.length &&
      derivéParException.every((route, rang) => route === ROUTES_SANS_COFFRE[rang]);

    console.info(
      `[ADR 0027 · cliquet] ${String(familles.length)} famille(s) de routes au socle ` +
        `[${familles.join(", ")}] · ${String(ROUTES_SANS_COFFRE.length)} sans coffre · ` +
        `dérivation encore PAR EXCEPTION : ${String(commeAujourdHui)} · ` +
        `familles déclarées côté émetteur : ` +
        `${String(FAMILLES_DE_ROUTES_DE_L_EMETTEUR.length)}`,
    );

    // L'état mesuré le 2026-08-31, écrit pour être contredit :
    expect(familles).toHaveLength(4);
    expect(commeAujourdHui).toBe(true);
    // ⚠️ Et l'émission n'y figure PAS. Le jour où elle y entre, l'égalité
    //    ci-dessus tombe, et la dette se rappelle d'elle-même.
    expect(familles).not.toContain("émission");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — LES DEUX DOCUMENTS DE DÉCOUVERTE
// ═════════════════════════════════════════════════════════════════════════════

describe("RFC 8414 · RFC 9728 — la découverte annonce ce qui existe, et rien de plus", () => {
  const ORIGINE = {
    emetteur: "https://auth.stub.invalid",
    ressource: "https://stub.invalid/api/mcp",
  };

  it("les points d'entrée annoncés sont ceux que l'émetteur sert — dérivés, pas écrits", () => {
    const metadonnees = metadonneesDeLEmetteur(
      ORIGINE,
      [...METHODES_DE_DEFI_ADMISES],
      [...SCOPES_EMISSIBLES],
    );
    const annonces = [
      metadonnees.authorization_endpoint,
      metadonnees.token_endpoint,
      metadonnees.revocation_endpoint,
    ];
    const horsServis = annonces.filter(
      (url) => !CHEMINS_SERVIS_PAR_L_EMETTEUR.some((chemin) => url.endsWith(chemin)),
    );

    console.info(
      `[G3 · découverte] ${String(annonces.length)} point(s) d'entrée annoncé(s) · ` +
        `${String(horsServis.length)} qui ne correspond(ent) à aucun chemin servi · ` +
        `${String(metadonnees.scopes_supported.length)} scope(s) annoncé(s) : ` +
        `${metadonnees.scopes_supported.join(", ")}`,
    );

    // ⚠️ UN POINT D'ENTRÉE ANNONCÉ ET NON SERVI ENVOIE LE CLIENT SUR UNE ROUTE
    //    MORTE, et l'échec ne ressemble à rien de reconnaissable.
    expect(horsServis).toEqual([]);
  });

  it("`ops:policy` n'est JAMAIS annoncé — annoncer une capacité refusée serait mentir", () => {
    const metadonnees = metadonneesDeLEmetteur(
      ORIGINE,
      [...METHODES_DE_DEFI_ADMISES],
      [...SCOPES_EMISSIBLES],
    );

    console.info(
      `[G3 · scopes annoncés] ${String(metadonnees.scopes_supported.length)} annoncé(s) · ` +
        `${String(SCOPES_EMISSIBLES.length)} émissible(s) · ` +
        `« ops:policy » annoncé : ${String(metadonnees.scopes_supported.includes("ops:policy"))}`,
    );

    expect(metadonnees.scopes_supported).not.toContain("ops:policy");
    expect(metadonnees.code_challenge_methods_supported).toEqual([...METHODES_DE_DEFI_ADMISES]);
    expect(metadonnees.code_challenge_methods_supported).not.toContain("plain");
  });

  it("`iss` et `aud` sont DEUX valeurs — les confondre rendrait l'étape 3 tautologique", () => {
    const ressource = metadonneesDeLaRessource(ORIGINE);
    const emetteur = metadonneesDeLEmetteur(
      ORIGINE,
      [...METHODES_DE_DEFI_ADMISES],
      [...SCOPES_EMISSIBLES],
    );

    console.info(
      `[G3 · deux valeurs] resource ≠ issuer : ` +
        `${String(ressource.resource !== emetteur.issuer)} · ` +
        `${String(ressource.authorization_servers.length)} serveur(s) d'autorisation annoncé(s) · ` +
        `${String(ressource.bearer_methods_supported.length)} méthode(s) de présentation`,
    );

    expect(ressource.resource).not.toBe(emetteur.issuer);
    expect(ressource.authorization_servers).toEqual([ORIGINE.emetteur]);
    // ⚠️ UNE SEULE MÉTHODE. Le jeton en paramètre de requête entrerait dans les
    //    journaux d'accès de tout ce qui est sur le chemin.
    expect(ressource.bearer_methods_supported).toEqual(["header"]);
  });
});
