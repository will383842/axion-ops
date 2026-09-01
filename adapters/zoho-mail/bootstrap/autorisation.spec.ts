import { describe, expect, it } from "vitest";

import {
  ACCES_HORS_LIGNE,
  CONSENTEMENT_FORCE,
  ErreurDAutorisation,
  PARAMETRES_EXIGES,
  REGIONS_ZOHO,
  REGION_DU_CLIENT,
  SCOPES_DU_CDC,
  SEPARATEUR_DE_SCOPES,
  URI_DE_REDIRECTION_LOCALE,
  construireLUrlDAutorisation,
  empreintePublique,
  fabriquerUnEtat,
  hoteDesComptes,
  motifDUriInvalide,
  regionDepuisLaChaine,
  scopesRetenus,
  urlDAutorisation,
  urlDesJetons,
} from "./autorisation.js";

/**
 * **GARDES DE L'URL D'AUTORISATION.**
 *
 * ⚠️ **AUCUN RÉSEAU.** Tout ce fichier est de l'arithmétique de chaînes.
 *
 * ⚠️ **ELLES ANNONCENT DES NOMBRES, JAMAIS UNE COULEUR** : combien de scopes
 *    demandés, combien de paramètres confrontés, combien de refus fabriqués.
 */

const DEMANDE_TYPE = {
  region: REGION_DU_CLIENT,
  clientId: "1000.CLIENT-ID-DE-GARDE",
  uriDeRedirection: URI_DE_REDIRECTION_LOCALE,
  scopes: scopesRetenus(),
  etat: "etat-de-garde",
};

describe("l'URL d'autorisation porte ce sans quoi tout l'adaptateur s'écroule", () => {
  it("porte les scopes du § 27, access_type=offline, prompt=consent et la bonne URI", () => {
    const url = new URL(construireLUrlDAutorisation(DEMANDE_TYPE));
    const scopeRecu = url.searchParams.get("scope") ?? "";
    const scopes = scopeRecu.split(SEPARATEUR_DE_SCOPES);

    console.info(
      `[URL] ${String(SCOPES_DU_CDC.length)} scope(s) déclaré(s) au § 27 · ` +
        `${String(scopesRetenus().length)} retenu(s) · ` +
        `${String(scopes.length)} présent(s) dans l'URL [${scopes.join(", ")}] · ` +
        `${String(PARAMETRES_EXIGES.length)} paramètre(s) exigé(s) confronté(s) · ` +
        `hôte : ${url.host} · chemin : ${url.pathname}`,
    );

    // ── LE PLANCHER, sans lequel la garde serait verte en ne lisant rien ────
    expect(SCOPES_DU_CDC.length).toBeGreaterThanOrEqual(4);
    expect(scopesRetenus().length).toBeGreaterThanOrEqual(3);

    // Les scopes de l'URL sont EXACTEMENT ceux que la table retient. Dérivé des
    // deux côtés : une ligne retirée de la table fait rougir ici.
    expect(scopes).toEqual([...scopesRetenus()]);
    for (const scope of scopes) expect(scope.startsWith("ZohoMail.")).toBe(true);

    // Les deux paramètres sans lesquels il n'y a pas de refresh token.
    expect(url.searchParams.get(ACCES_HORS_LIGNE.cle)).toBe(ACCES_HORS_LIGNE.valeur);
    expect(url.searchParams.get(CONSENTEMENT_FORCE.cle)).toBe(CONSENTEMENT_FORCE.valeur);

    // Chaque paramètre exigé est PRÉSENT et non vide. La liste est la question.
    for (const nom of PARAMETRES_EXIGES) {
      expect(url.searchParams.get(nom), `paramètre « ${nom} »`).not.toBe(null);
      expect(url.searchParams.get(nom), `paramètre « ${nom} »`).not.toBe("");
    }

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(URI_DE_REDIRECTION_LOCALE);
    expect(url.origin).toBe(`https://${hoteDesComptes(REGION_DU_CLIENT)}`);
    expect(url.pathname).toBe("/oauth/v2/auth");
  });

  it("SAIT rougir : chacun des cinq refus de construction est fabriqué et mesuré", () => {
    const defauts: readonly { readonly nom: string; readonly demande: typeof DEMANDE_TYPE }[] = [
      { nom: "client_id vide", demande: { ...DEMANDE_TYPE, clientId: "   " } },
      { nom: "state vide", demande: { ...DEMANDE_TYPE, etat: "" } },
      { nom: "aucun scope", demande: { ...DEMANDE_TYPE, scopes: [] } },
      {
        nom: "un scope qui porte le séparateur",
        demande: { ...DEMANDE_TYPE, scopes: ["ZohoMail.a,ZohoMail.b"] },
      },
      {
        nom: "un scope demandé deux fois",
        demande: { ...DEMANDE_TYPE, scopes: ["ZohoMail.accounts.READ", "ZohoMail.accounts.READ"] },
      },
      {
        nom: "une URI qui n'est pas une URL",
        demande: { ...DEMANDE_TYPE, uriDeRedirection: "pas-une-url" },
      },
    ];

    let refuses = 0;
    for (const defaut of defauts) {
      expect(() => construireLUrlDAutorisation(defaut.demande), `défaut « ${defaut.nom} »`).toThrow(
        ErreurDAutorisation,
      );
      refuses += 1;
    }
    console.info(`[URL] ${String(refuses)} défaut(s) fabriqué(s), ${String(refuses)} refusé(s).`);
    expect(refuses).toBe(defauts.length);
  });

  it("le séparateur de scopes est la VIRGULE — une espace ferait refuser toute la demande", () => {
    expect(SEPARATEUR_DE_SCOPES).toBe(",");
    const url = new URL(construireLUrlDAutorisation(DEMANDE_TYPE));
    // ⚠️ On lit la valeur DÉCODÉE : `URLSearchParams` encode la virgule en
    //    « %2C » dans la chaîne, et lire la chaîne brute mesurerait l'encodage,
    //    pas le séparateur.
    expect(url.searchParams.get("scope")).not.toContain(" ");
    expect(url.searchParams.get("scope")).toContain(SEPARATEUR_DE_SCOPES);
  });
});

describe("la région décide de l'hôte, et un client n'est valide que dans la sienne", () => {
  it("dérive les deux endpoints de la région, et refuse une région inconnue", () => {
    console.info(
      `[région] ${String(REGIONS_ZOHO.length)} région(s) connue(s) [${REGIONS_ZOHO.join(", ")}] · ` +
        `région du client : ${REGION_DU_CLIENT}`,
    );
    expect(REGIONS_ZOHO.length).toBeGreaterThanOrEqual(2);
    expect(REGION_DU_CLIENT).toBe("eu");
    expect(urlDAutorisation("eu")).toBe("https://accounts.zoho.eu/oauth/v2/auth");
    expect(urlDesJetons("eu")).toBe("https://accounts.zoho.eu/oauth/v2/token");
    // Deux régions différentes ne peuvent pas rendre le même hôte.
    expect(hoteDesComptes("eu")).not.toBe(hoteDesComptes("com"));

    expect(regionDepuisLaChaine("eu")).toBe("eu");
    expect(regionDepuisLaChaine("europe")).toBe(null);
    expect(regionDepuisLaChaine(undefined)).toBe(null);
  });
});

describe("l'URI de redirection est comparée caractère par caractère par Zoho", () => {
  it("accepte la boucle locale et refuse ce que Zoho ne pourrait pas comparer", () => {
    const cas: readonly { readonly uri: string; readonly accepte: boolean }[] = [
      { uri: URI_DE_REDIRECTION_LOCALE, accepte: true },
      { uri: "https://ops.stub.invalid/auth/zoho/callback", accepte: true },
      { uri: "pas-une-url", accepte: false },
      { uri: "ftp://stub.invalid/callback", accepte: false },
      { uri: "http://localhost:8787/auth/zoho/callback#fragment", accepte: false },
      { uri: "http://localhost:8787/auth/zoho/callback?deja=1", accepte: false },
    ];
    let mesures = 0;
    for (const item of cas) {
      expect(motifDUriInvalide(item.uri) === null, `URI « ${item.uri} »`).toBe(item.accepte);
      mesures += 1;
    }
    console.info(
      `[URI] ${String(mesures)} URI confrontée(s), dont ${String(cas.filter((c) => !c.accepte).length)} refusée(s).`,
    );
    expect(mesures).toBe(cas.length);
  });
});

describe("dire une valeur sans la dire", () => {
  it("l'empreinte est stable, ne contient pas la valeur, et nomme le cas vide", () => {
    const valeur = "1000.un-jeton-invente";
    const empreinte = empreintePublique(valeur);
    console.info(
      `[empreinte] ${String(empreinte.length)} caractère(s) pour une valeur de ${String(valeur.length)}.`,
    );
    expect(empreintePublique(valeur)).toBe(empreinte);
    expect(empreintePublique(`${valeur}x`)).not.toBe(empreinte);
    expect(valeur).not.toContain(empreinte);
    expect(empreintePublique("")).toBe("vide");
  });

  it("deux états fabriqués coup sur coup ne sont pas égaux", () => {
    const a = fabriquerUnEtat();
    const b = fabriquerUnEtat();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});
