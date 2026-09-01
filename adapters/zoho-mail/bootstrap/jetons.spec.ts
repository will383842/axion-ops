import { describe, expect, it } from "vitest";

import { REGION_DU_CLIENT, URI_DE_REDIRECTION_LOCALE, urlDesJetons } from "./autorisation.js";
import {
  ErreurDEchange,
  REFUS_D_ECHANGE,
  TYPE_DE_CONTENU,
  analyserLaReponseDeJetons,
  corpsDeLEchange,
  decrireLesJetons,
  echangeurHttps,
} from "./jetons.js";
import type { DemandeDEchange, Emissaire } from "./jetons.js";

/**
 * **GARDES DE L'ÉCHANGE.**
 *
 * ⚠️ **AUCUN RÉSEAU.** L'émissaire est une fonction fournie par le test. Ce qui
 *    est mesuré, c'est ce que la prise ENVOIE et ce qu'elle FAIT de la réponse —
 *    et le cas le plus important, « HTTP 200 avec un champ `error` », est
 *    impossible à provoquer contre le vrai Zoho sans brûler un code.
 */

const DEMANDE: DemandeDEchange = {
  region: REGION_DU_CLIENT,
  clientId: "1000.CLIENT-ID-DE-GARDE",
  clientSecret: "secret-de-garde-sans-valeur",
  uriDeRedirection: URI_DE_REDIRECTION_LOCALE,
  code: "1000.code-invente.0000",
};

const REPONSE_COMPLETE = {
  access_token: "1000.acces.0000",
  refresh_token: "1000.rafraichissement.0000",
  api_domain: "https://www.zohoapis.eu",
  token_type: "Bearer",
  expires_in: 3600,
};

describe("Zoho rend ses erreurs d'OAuth avec un HTTP 200 — le statut ne décide pas", () => {
  it("SAIT rougir : un 200 porteur d'un champ `error` est REFUSÉ, et le code est nommé", () => {
    let leve: unknown = null;
    try {
      analyserLaReponseDeJetons(200, { error: "invalid_code" });
    } catch (erreur: unknown) {
      leve = erreur;
    }

    expect(leve).toBeInstanceOf(ErreurDEchange);
    const refus = leve as ErreurDEchange;
    console.info(
      `[échange] statut 200 + error=invalid_code → refus « ${refus.refus} » · ` +
        `code Zoho conservé : ${refus.codeZoho ?? "aucun"}`,
    );
    expect(refus.refus).toBe("erreur-annoncee-par-zoho");
    expect(refus.codeZoho).toBe("invalid_code");
    // Le message NOMME les trois causes : sans elles, il faut chercher au hasard.
    expect(refus.message).toContain("usage unique");
    expect(refus.message).toContain("région");
  });

  it("TÉMOIN DE CONTRASTE : la même réponse SANS le champ `error` est acceptée", () => {
    const jetons = analyserLaReponseDeJetons(200, REPONSE_COMPLETE);
    expect(jetons.refreshToken).toBe(REPONSE_COMPLETE.refresh_token);
    console.info("[échange] témoin de contraste : 200 sans `error` → accepté.");
  });
});

describe("une réponse sans refresh_token est un succès apparent, et elle est refusée", () => {
  it("SAIT rougir, et le message nomme les DEUX paramètres qui en sont la cause", () => {
    let leve: unknown = null;
    try {
      analyserLaReponseDeJetons(200, { access_token: "1000.acces.0000", expires_in: 3600 });
    } catch (erreur: unknown) {
      leve = erreur;
    }
    expect(leve).toBeInstanceOf(ErreurDEchange);
    const refus = leve as ErreurDEchange;
    expect(refus.refus).toBe("refresh-token-absent");
    expect(refus.message).toContain("access_type=offline");
    expect(refus.message).toContain("prompt=consent");
    console.info(
      `[échange] 200 sans refresh_token → refus « ${refus.refus} », deux causes nommées.`,
    );
  });
});

describe("les quatre refus d'analyse sont couverts, et la couverture est confrontée", () => {
  it("fabrique un témoin par refus déclaré", () => {
    const temoins: readonly {
      readonly refus: string;
      readonly statut: number;
      readonly corps: unknown;
    }[] = [
      { refus: "reponse-illisible", statut: 200, corps: "<html>page d'erreur</html>" },
      { refus: "erreur-annoncee-par-zoho", statut: 200, corps: { error: "invalid_client" } },
      { refus: "statut-http-en-echec", statut: 500, corps: {} },
      { refus: "refresh-token-absent", statut: 200, corps: { access_token: "1000.a" } },
    ];

    const vus = new Set<string>();
    for (const temoin of temoins) {
      try {
        analyserLaReponseDeJetons(temoin.statut, temoin.corps);
        throw new Error(`témoin « ${temoin.refus} » : aucune levée`);
      } catch (erreur: unknown) {
        expect(erreur, `témoin « ${temoin.refus} »`).toBeInstanceOf(ErreurDEchange);
        const refus = (erreur as ErreurDEchange).refus;
        expect(refus).toBe(temoin.refus);
        vus.add(refus);
      }
    }

    console.info(
      `[échange] ${String(temoins.length)} témoin(s) fabriqué(s) · ${String(vus.size)} refus ` +
        `distinct(s) sur ${String(REFUS_D_ECHANGE.length)} déclaré(s) [${[...vus].join(", ")}]`,
    );
    expect([...vus].sort()).toEqual([...REFUS_D_ECHANGE].sort());
  });

  it("lit `expires_in` que Zoho l'annonce en nombre ou en chaîne", () => {
    expect(analyserLaReponseDeJetons(200, REPONSE_COMPLETE).dureeDeVieSecondes).toBe(3600);
    expect(
      analyserLaReponseDeJetons(200, { ...REPONSE_COMPLETE, expires_in: "3600" })
        .dureeDeVieSecondes,
    ).toBe(3600);
    expect(
      analyserLaReponseDeJetons(200, { ...REPONSE_COMPLETE, expires_in: undefined })
        .dureeDeVieSecondes,
    ).toBe(null);
  });
});

describe("le secret voyage dans le CORPS, jamais dans l'URL", () => {
  it("construit un formulaire complet, et l'URL appelée n'en porte aucun champ", async () => {
    const corps = corpsDeLEchange(DEMANDE);
    const attendus = ["grant_type", "client_id", "client_secret", "redirect_uri", "code"];
    console.info(
      `[échange] ${String([...corps.keys()].length)} champ(s) au corps ` +
        `[${[...corps.keys()].join(", ")}] · ${String(attendus.length)} attendu(s)`,
    );
    for (const champ of attendus) expect(corps.get(champ), `champ « ${champ} »`).not.toBe(null);
    expect(corps.get("grant_type")).toBe("authorization_code");

    let urlVue = "";
    let optionsVues: { method: string; headers: Record<string, string>; body: string } | null =
      null;
    const emissaire: Emissaire = (url, options) => {
      urlVue = url;
      optionsVues = options;
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve(JSON.stringify(REPONSE_COMPLETE)),
      });
    };

    const jetons = await echangeurHttps(emissaire).echanger(DEMANDE);
    expect(jetons.refreshToken).toBe(REPONSE_COMPLETE.refresh_token);

    expect(urlVue).toBe(urlDesJetons(REGION_DU_CLIENT));
    // ⚠️ LA PROPRIÉTÉ QUI COMPTE : aucun champ du formulaire n'est dans l'URL.
    //    Une URL entre dans les journaux d'accès de tout ce qu'elle traverse.
    expect(urlVue).not.toContain("client_secret");
    expect(urlVue).not.toContain(DEMANDE.clientSecret);
    expect(urlVue).not.toContain(DEMANDE.code);
    expect(urlVue).not.toContain("?");

    const options = optionsVues as unknown as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(options.method).toBe("POST");
    expect(options.headers["content-type"]).toBe(TYPE_DE_CONTENU);
    expect(options.body).toContain("grant_type=authorization_code");
  });

  it("un corps qui n'est pas du JSON est refusé SANS être reproduit", async () => {
    const emissaire: Emissaire = () =>
      Promise.resolve({
        status: 200,
        text: () => Promise.resolve("<html>1000.un-jeton-qui-traine</html>"),
      });
    await expect(echangeurHttps(emissaire).echanger(DEMANDE)).rejects.toThrow(ErreurDEchange);
    try {
      await echangeurHttps(emissaire).echanger(DEMANDE);
    } catch (erreur: unknown) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      console.info(`[échange] corps non-JSON → message de ${String(message.length)} caractère(s).`);
      expect(message).not.toContain("1000.un-jeton-qui-traine");
      expect(message).toContain("n'est pas reproduit");
    }
  });
});

describe("le rapport dit les jetons sans les dire", () => {
  it("porte des longueurs et des empreintes, jamais une valeur", () => {
    const jetons = analyserLaReponseDeJetons(200, REPONSE_COMPLETE);
    const description = decrireLesJetons(jetons);
    console.info(`[échange] description de ${String(description.length)} caractère(s).`);
    expect(description).not.toContain(jetons.refreshToken);
    expect(description).not.toContain(jetons.accessToken);
    expect(description).toContain("api_domain");
    expect(description).toContain("NON déposé");
  });
});
