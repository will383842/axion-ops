import { describe, expect, it } from "vitest";

import { URI_DE_REDIRECTION_LOCALE } from "./autorisation.js";
import {
  ErreurDeRappel,
  HOTES_DE_BOUCLE,
  PAGE_PORTE_CLOSE,
  PAGE_REFUS,
  PAGE_SUCCES,
  REFUS_DE_RAPPEL,
  deriverLEcoute,
  interpreterLeRappel,
} from "./rappel.js";

/**
 * **GARDES DE LA BOÎTE AUX LETTRES.**
 *
 * ⚠️ **AUCUN PORT N'EST OUVERT ICI, ET C'EST UNE BORNE, PAS UNE PROPRIÉTÉ.** La
 *    consigne du chantier est « aucun appel réseau dans les tests », et une
 *    liaison de boucle locale en est un au sens strict. Ce fichier éprouve donc
 *    la LOGIQUE — la dérivation de l'écoute, l'interprétation d'un rappel, la
 *    staticité des pages — et **ne mesure pas** trois propriétés du serveur : la
 *    liaison sur les seuls hôtes de boucle, l'usage unique, et l'échéance. Elles
 *    sont RELUES. La mesure qui les lèverait est nommée dans `DEPS.md`.
 */

const CHEMIN = "/auth/zoho/callback";
const ETAT = "etat-de-garde-0123456789";

describe("l'écoute est DÉRIVÉE de l'URI de redirection, jamais posée à côté", () => {
  it("tire le port, le chemin et les hôtes de l'URI, et refuse ce qui n'est pas la boucle", () => {
    const ecoute = deriverLEcoute(URI_DE_REDIRECTION_LOCALE);
    console.info(
      `[écoute] URI « ${URI_DE_REDIRECTION_LOCALE} » → port ${String(ecoute.port)} · ` +
        `chemin ${ecoute.chemin} · ${String(ecoute.hotes.length)} hôte(s) ` +
        `[${ecoute.hotes.join(", ")}]`,
    );
    expect(ecoute.port).toBe(8787);
    expect(ecoute.chemin).toBe(CHEMIN);
    expect(ecoute.hotes).toEqual([...HOTES_DE_BOUCLE]);

    // ⚠️ LA PROPRIÉTÉ QUI COMPTE : les deux boucles, pas une seule. « localhost »
    //    se résout d'abord en ::1 sur beaucoup de systèmes, et un serveur lié au
    //    seul 127.0.0.1 laisse le navigateur sur un « connexion refusée » APRÈS
    //    que Zoho a émis le code.
    expect(HOTES_DE_BOUCLE).toContain("127.0.0.1");
    expect(HOTES_DE_BOUCLE).toContain("::1");
    // Et aucune adresse d'écoute universelle ne peut s'y glisser.
    expect(HOTES_DE_BOUCLE as readonly string[]).not.toContain("0.0.0.0");
    expect(HOTES_DE_BOUCLE as readonly string[]).not.toContain("::");
  });

  it("SAIT rougir : quatre URI refusées, une acceptée en témoin de contraste", () => {
    const refusees = [
      "https://ops.stub.invalid/auth/zoho/callback",
      "http://192.0.2.10:8787/auth/zoho/callback",
      "pas-une-url",
      "http://localhost:0/auth/zoho/callback",
    ];
    let comptees = 0;
    for (const uri of refusees) {
      expect(() => deriverLEcoute(uri), `URI « ${uri} »`).toThrow(ErreurDeRappel);
      comptees += 1;
    }
    // TÉMOIN DE CONTRASTE : sans lui, un `deriverLEcoute` qui lèverait toujours
    // passerait ce test avec les honneurs.
    expect(deriverLEcoute("http://127.0.0.1:9999/x").port).toBe(9999);
    console.info(`[écoute] ${String(comptees)} URI refusée(s) · 1 acceptée (contraste).`);
    expect(comptees).toBe(refusees.length);
  });
});

describe("le `state` est vérifié AVANT le `code`, et c'est la décision", () => {
  it("accepte un rappel conforme", () => {
    const lecture = interpreterLeRappel(
      `${CHEMIN}?code=1000.code-invente&state=${ETAT}`,
      CHEMIN,
      ETAT,
    );
    expect(lecture.recu).toBe(true);
    if (lecture.recu) expect(lecture.code).toBe("1000.code-invente");
  });

  it("SAIT rougir : un `code` sans le bon `state` est écarté SANS être lu", () => {
    const forge = interpreterLeRappel(
      `${CHEMIN}?code=1000.code-d-une-autre-boite&state=etat-forge`,
      CHEMIN,
      ETAT,
    );
    expect(forge.recu).toBe(false);
    if (forge.recu) return;
    expect(forge.refus).toBe("etat-non-conforme");
    // ⚠️ LE CODE NE DOIT PAS RESSORTIR DANS L'EXPLICATION : une page tierce qui
    //    viserait la boucle locale ne doit pas voir son code recopié quelque part.
    expect(forge.explication).not.toContain("1000.code-d-une-autre-boite");
    console.info(`[rappel] code sans state conforme → « ${forge.refus} », code non recopié.`);
  });

  it("couvre les quatre refus déclarés, et la couverture est confrontée", () => {
    const temoins: readonly { readonly refus: string; readonly requete: string }[] = [
      { refus: "chemin-inconnu", requete: "/favicon.ico" },
      { refus: "erreur-annoncee-par-zoho", requete: `${CHEMIN}?error=access_denied` },
      { refus: "etat-non-conforme", requete: `${CHEMIN}?code=1000.c&state=faux` },
      { refus: "code-absent", requete: `${CHEMIN}?state=${ETAT}` },
    ];

    const vus = new Set<string>();
    for (const temoin of temoins) {
      const lecture = interpreterLeRappel(temoin.requete, CHEMIN, ETAT);
      expect(lecture.recu, `témoin « ${temoin.refus} »`).toBe(false);
      if (lecture.recu) continue;
      expect(lecture.refus).toBe(temoin.refus);
      expect(lecture.explication.length).toBeGreaterThan(40);
      vus.add(lecture.refus);
    }

    console.info(
      `[rappel] ${String(temoins.length)} témoin(s) · ${String(vus.size)} refus distinct(s) ` +
        `sur ${String(REFUS_DE_RAPPEL.length)} déclaré(s) [${[...vus].join(", ")}]`,
    );
    expect([...vus].sort()).toEqual([...REFUS_DE_RAPPEL].sort());
  });

  it("l'erreur annoncée par Zoho est lue AVANT le `state` — un refus n'en porte pas", () => {
    const lecture = interpreterLeRappel(`${CHEMIN}?error=access_denied`, CHEMIN, ETAT);
    expect(lecture.recu).toBe(false);
    if (lecture.recu) return;
    // « tu as refusé » est plus utile que « état non conforme ».
    expect(lecture.refus).toBe("erreur-annoncee-par-zoho");
    expect(lecture.explication).toContain("consentement");
  });

  it("un `state` conforme comparé à lui-même passe, un préfixe ne passe pas", () => {
    expect(interpreterLeRappel(`${CHEMIN}?code=c&state=${ETAT}`, CHEMIN, ETAT).recu).toBe(true);
    // La comparaison porte sur les OCTETS et sur la longueur : un préfixe est refusé.
    expect(
      interpreterLeRappel(`${CHEMIN}?code=c&state=${ETAT.slice(0, 5)}`, CHEMIN, ETAT).recu,
    ).toBe(false);
  });
});

describe("les pages rendues sont des constantes — rien de la requête n'y entre", () => {
  it("aucune des trois pages ne porte de marque d'interpolation", () => {
    const pages = { PAGE_SUCCES, PAGE_REFUS, PAGE_PORTE_CLOSE };
    let mesurees = 0;
    for (const [nom, page] of Object.entries(pages)) {
      // Un gabarit non substitué, un « + » de concaténation résiduel, ou une
      // valeur de requête recopiée laisseraient l'une de ces marques.
      expect(page, `page « ${nom} »`).not.toContain("${");
      expect(page, `page « ${nom} »`).not.toContain("code=");
      expect(page, `page « ${nom} »`).not.toContain("state=");
      expect(page.startsWith("<!doctype html>"), `page « ${nom} »`).toBe(true);
      mesurees += 1;
    }
    console.info(`[rappel] ${String(mesurees)} page(s) statique(s) mesurée(s).`);
    expect(mesurees).toBe(3);
  });
});
