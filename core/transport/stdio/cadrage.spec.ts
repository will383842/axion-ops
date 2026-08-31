import { describe, expect, it } from "vitest";

import {
  CARACTERES_MAX_PAR_LIGNE,
  CLES_DE_REBUT,
  ErreurDeSerialisationStdio,
  analyserUneLigne,
  creerDecoupeur,
  serialiser,
} from "./cadrage.js";
import type { Cadre, CleDeRebut } from "./cadrage.js";

/**
 * GARDES DU CADRAGE stdio — **CE QUI TIENT LA PLACE DE L'ÉTAPE 1.**
 *
 * ═══ CE QUE CES GARDES MESURENT, ET POURQUOI ICI ═══
 *
 * L'ADR 0025 protège l'analyseur JSON du transport HTTP en faisant passer
 * l'étape 1 (anti DNS-rebinding) AVANT lui. Le transport stdio **n'a pas
 * d'étape 1** — il ne reçoit aucun `Host` —, si bien que son cadrage est la
 * première chose que l'octet entrant rencontre. Ce fichier est donc l'endroit
 * où l'on éprouve ce qui, en HTTP, serait protégé par autre chose.
 *
 * Chaque garde ANNONCE COMBIEN D'ÉLÉMENTS elle a mesurés, et chacune porte son
 * témoin fabriqué : une garde de cadrage qui ne verrait aucune ligne serait
 * verte sur un flux muet, et c'est exactement l'état d'un démon qu'on vient de
 * casser.
 */

/** Compte les rebuts d'une liste de cadres, par cause. */
function parCause(cadres: readonly Cadre[]): Record<string, number> {
  const compte: Record<string, number> = {};
  for (const cadre of cadres) {
    if (cadre.genre === "rebut") compte[cadre.cle] = (compte[cadre.cle] ?? 0) + 1;
  }
  return compte;
}

describe("cadrage stdio — un message par ligne, et rien ne traverse une ligne", () => {
  it("découpe un flux morcelé N'IMPORTE OÙ et rend les mêmes messages", () => {
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "bonjour.dire" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ];
    const flux = messages.map((message) => `${JSON.stringify(message)}\n`).join("");

    // ⚠️ ON MORCELLE À CHAQUE POSITION POSSIBLE. Un découpeur qui ne serait juste
    //    que sur des morceaux alignés sur les lignes serait vert sur tout test
    //    écrit gentiment — et faux sur un vrai flux, où la coupure tombe où elle
    //    veut. Le nombre de coupures éprouvées est ANNONCÉ.
    let coupuresEprouvees = 0;
    let messagesVus = 0;
    for (let coupure = 0; coupure <= flux.length; coupure += 1) {
      const decoupeur = creerDecoupeur();
      const recus = [
        ...decoupeur.absorber(flux.slice(0, coupure)),
        ...decoupeur.absorber(flux.slice(coupure)),
      ];
      coupuresEprouvees += 1;
      messagesVus += recus.length;
      expect(recus).toHaveLength(messages.length);
      expect(recus.map((cadre) => (cadre.genre === "message" ? cadre.valeur : null))).toEqual(
        messages,
      );
    }

    console.info(
      `[cadrage · morcellement] ${String(coupuresEprouvees)} coupure(s) éprouvée(s) sur un ` +
        `flux de ${String(flux.length)} caractère(s) · ${String(messagesVus)} message(s) ` +
        `rendu(s) au total · ${String(messages.length)} attendu(s) par coupure`,
    );

    // Plancher-témoin : un flux vidé ferait zéro coupure, et cette garde serait
    // verte sans rien mesurer.
    expect(coupuresEprouvees).toBeGreaterThanOrEqual(60);
    expect(messagesVus).toBe(coupuresEprouvees * messages.length);
  });

  it("connaît les QUATRE façons dont une ligne n'est pas un message, et les compte séparément", () => {
    // Un témoin par cause, fabriqué — et la totalité est DÉRIVÉE de
    // `CLES_DE_REBUT`, jamais recopiée : une cinquième cause ajoutée sans témoin
    // fait rougir la boucle de couverture ci-dessous.
    const temoins: Readonly<Record<CleDeRebut, string>> = {
      "ligne-trop-longue": `"${"a".repeat(400)}"`,
      "json-illisible": "{ceci n'est pas du json",
      "lot-refuse": '[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]',
      "enveloppe-non-objet": "42",
    };

    const decoupeur = creerDecoupeur(100);
    const cadres = decoupeur.absorber(
      CLES_DE_REBUT.map((cle) => `${temoins[cle]}\n`).join("") +
        '{"jsonrpc":"2.0","id":9,"method":"tools/list"}\n',
    );
    const mesures = decoupeur.mesures();

    console.info(
      `[cadrage · rebuts] ${String(CLES_DE_REBUT.length)} cause(s) déclarée(s), autant de ` +
        `témoin(s) fabriqué(s) · ${String(mesures.lignesVues)} ligne(s) vue(s) · ` +
        `${String(mesures.messagesLivres)} message(s) livré(s) · rebuts : ` +
        CLES_DE_REBUT.map((cle) => `${cle}=${String(mesures.rebuts[cle])}`).join(", "),
    );

    // La totalité : CHAQUE cause déclarée a été rencontrée exactement une fois.
    let causesEprouvees = 0;
    for (const cle of CLES_DE_REBUT) {
      causesEprouvees += 1;
      expect(mesures.rebuts[cle], `la cause « ${cle} » n'a pas été rencontrée`).toBe(1);
    }
    expect(causesEprouvees).toBe(CLES_DE_REBUT.length);
    expect(causesEprouvees).toBeGreaterThanOrEqual(4);

    // Et le message valide qui suit les quatre rebuts est SERVI : le découpeur
    // se remet, il ne meurt pas sur le premier octet fautif.
    expect(mesures.messagesLivres).toBe(1);
    expect(parCause(cadres)).toEqual({
      "ligne-trop-longue": 1,
      "json-illisible": 1,
      "lot-refuse": 1,
      "enveloppe-non-objet": 1,
    });
  });

  it("RESYNCHRONISE après une ligne trop longue : la suite n'est jamais lue comme un début", () => {
    // ⚠️ LE TÉMOIN EST L'ATTAQUE ELLE-MÊME. Un mébicaractère de bourrage, puis
    //    une charge choisie par l'attaquant. Sans resynchronisation, le tampon
    //    est vidé, la charge arrive « propre » au morceau suivant, et le socle
    //    analyse exactement ce qu'on a voulu lui faire analyser.
    const decoupeur = creerDecoupeur(50);
    const bourrage = "x".repeat(200);
    const chargeChoisie = '{"jsonrpc":"2.0","id":"attaquant","method":"tools/list"}';

    // Le bourrage et la charge sont sur LA MÊME ligne, séparés en deux morceaux.
    const premier = decoupeur.absorber(bourrage);
    const enCours = decoupeur.mesures();
    const second = decoupeur.absorber(`${chargeChoisie}\n`);
    const apres = decoupeur.mesures();

    // La ligne d'après, elle, est parfaitement servie : la resynchronisation
    // s'arrête au premier délimiteur, elle ne mange pas le flux entier.
    const suivante = decoupeur.absorber('{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n');

    console.info(
      `[cadrage · resynchronisation] plafond 50 · bourrage ${String(bourrage.length)} car. · ` +
        `charge choisie ${String(chargeChoisie.length)} car. · ` +
        `${String(premier.length + second.length)} cadre(s) rendu(s) pendant l'attaque ` +
        `(${String(apres.rebuts["ligne-trop-longue"])} rebut « ligne-trop-longue ») · ` +
        `resynchronisation active après le bourrage : ${String(enCours.enResynchronisation)} · ` +
        `${String(suivante.length)} message(s) servi(s) sur la ligne SUIVANTE`,
    );

    // Pendant l'attaque : un rebut, et AUCUN message.
    expect(premier).toHaveLength(1);
    expect(premier[0]?.genre).toBe("rebut");
    expect(enCours.enResynchronisation).toBe(true);
    expect(second, "la charge choisie ne doit produire AUCUN cadre").toEqual([]);
    expect(apres.messagesLivres).toBe(0);

    // Après : le flux est de nouveau servi.
    expect(suivante).toHaveLength(1);
    expect(suivante[0]?.genre).toBe("message");
    expect(decoupeur.mesures().messagesLivres).toBe(1);
  });

  it("TÉMOIN — sans resynchronisation, la charge choisie SERAIT analysée", () => {
    // La contre-épreuve : le même flux, découpé par un découpeur dont le
    // plafond n'est jamais atteint. La charge est alors analysée — c'est
    // exactement ce que le test précédent interdit, et c'est ce qui rend son
    // vert attribuable à la resynchronisation plutôt qu'au hasard.
    const decoupeur = creerDecoupeur(CARACTERES_MAX_PAR_LIGNE);
    const chargeChoisie = '{"jsonrpc":"2.0","id":"attaquant","method":"tools/list"}';
    const cadres = decoupeur.absorber(`${chargeChoisie}\n`);

    console.info(
      `[cadrage · contre-épreuve] plafond ${String(CARACTERES_MAX_PAR_LIGNE)} car. · ` +
        `${String(cadres.length)} cadre(s) · la MÊME charge est analysée quand la borne ` +
        "ne mord pas — la garde d'à côté mesure donc bien la borne",
    );

    expect(cadres).toHaveLength(1);
    expect(cadres[0]?.genre).toBe("message");
  });

  it("une ligne vide n'est ni un message ni une faute, et elle ne gonfle aucun compte", () => {
    const decoupeur = creerDecoupeur();
    const cadres = decoupeur.absorber(
      '\n\n   \n{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n\n',
    );
    const mesures = decoupeur.mesures();

    console.info(
      `[cadrage · lignes vides] 4 ligne(s) vide(s) ou blanches soumises · ` +
        `${String(mesures.lignesVues)} ligne(s) COMPTÉE(s) · ` +
        `${String(mesures.messagesLivres)} message(s) livré(s)`,
    );

    expect(cadres).toHaveLength(1);
    expect(mesures.lignesVues).toBe(1);
    expect(mesures.messagesLivres).toBe(1);
  });

  it("`\\r\\n` est toléré : un client Windows n'envoie pas un message illisible", () => {
    const decoupeur = creerDecoupeur();
    const cadres = decoupeur.absorber('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\r\n');

    console.info(
      `[cadrage · CRLF] 1 ligne soumise en \\r\\n · ${String(cadres.length)} cadre(s) · ` +
        `genre : ${cadres[0]?.genre ?? "aucun"}`,
    );

    expect(cadres).toHaveLength(1);
    expect(cadres[0]?.genre).toBe("message");
  });
});

describe("cadrage stdio — la sortie tient une ligne, et elle le PROUVE", () => {
  it("sérialise sur UNE ligne, et le nombre de délimiteurs est mesuré", () => {
    // Une charge qui PORTE des sauts de ligne : c'est le cas qui casserait le
    // cadrage si `JSON.stringify` ne les échappait pas.
    const charge = { texte: "première ligne\nseconde ligne\r\ntroisième" };
    const ligne = serialiser(charge);
    const delimiteurs = (ligne.match(/\n/g) ?? []).length;

    console.info(
      `[cadrage · sortie] ${String(ligne.length)} caractère(s) écrit(s) · ` +
        `${String(delimiteurs)} délimiteur(s) · ${String(2)} saut(s) de ligne présent(s) ` +
        "dans la charge d'origine",
    );

    expect(delimiteurs).toBe(1);
    expect(ligne.endsWith("\n")).toBe(true);
    expect(JSON.parse(ligne.trimEnd())).toEqual(charge);
  });

  it("TÉMOIN — une valeur non sérialisable LÈVE, et le message ne porte AUCUN extrait", () => {
    const cyclique: Record<string, unknown> = { nom: "secret-qui-ne-doit-pas-sortir" };
    cyclique["soi"] = cyclique;

    let leve = 0;
    let messageVu = "";
    try {
      serialiser(cyclique);
    } catch (erreur: unknown) {
      leve += 1;
      expect(erreur).toBeInstanceOf(ErreurDeSerialisationStdio);
      messageVu = erreur instanceof Error ? erreur.message : "";
    }

    console.info(
      `[cadrage · sortie non sérialisable] ${String(leve)} levée(s) mesurée(s) · ` +
        `${String(messageVu.length)} caractère(s) de message · ` +
        `extrait de la valeur présent : ${String(messageVu.includes("secret-qui"))}`,
    );

    expect(leve).toBe(1);
    // § 31 — le message d'erreur ne recopie RIEN de ce qu'il n'a pas su écrire.
    expect(messageVu).not.toContain("secret-qui");
  });

  it("la borne est en CARACTÈRES, et l'écart avec les octets est MESURÉ, pas seulement écrit", () => {
    // ⚠️ CE TEST NE PROUVE PAS QUE LA BORNE EST BONNE — il prouve qu'elle est
    //    CELLE QU'ON CROIT. Un caractère hors du plan de base coûte quatre octets
    //    en UTF-8 : lire `CARACTERES_MAX_PAR_LIGNE` comme un plafond d'octets se
    //    tromperait d'un facteur quatre, et c'est ce facteur qu'on mesure ici.
    const caractereLourd = "\u{1F5DD}"; // deux unités de code UTF-16, quatre octets UTF-8
    const ligne = caractereLourd.repeat(10);
    const octets = Buffer.byteLength(ligne, "utf8");

    console.info(
      `[cadrage · borne] ${String(ligne.length)} unité(s) de code UTF-16 pour ` +
        `${String(octets)} octet(s) UTF-8 — rapport ${String(octets / ligne.length)} · ` +
        `plafond déclaré : ${String(CARACTERES_MAX_PAR_LIGNE)} caractère(s), soit au pire ` +
        `${String(CARACTERES_MAX_PAR_LIGNE * 2)} octet(s)`,
    );

    expect(ligne.length).toBe(20);
    expect(octets).toBe(40);
    expect(octets).toBeGreaterThan(ligne.length);
  });
});

describe("cadrage stdio — l'analyse d'une ligne isolée", () => {
  it("rend un message pour un objet, et le NOMME pour chacune des trois autres formes", () => {
    const formes: readonly { readonly ligne: string; readonly attendu: string }[] = [
      { ligne: '{"a":1}', attendu: "message" },
      { ligne: "[1,2]", attendu: "lot-refuse" },
      { ligne: "null", attendu: "enveloppe-non-objet" },
      { ligne: "{oups", attendu: "json-illisible" },
    ];

    let mesurees = 0;
    for (const forme of formes) {
      const cadre = analyserUneLigne(forme.ligne);
      mesurees += 1;
      const observe = cadre.genre === "message" ? "message" : cadre.cle;
      expect(observe, `la ligne « ${forme.ligne} »`).toBe(forme.attendu);
    }

    console.info(
      `[cadrage · analyse] ${String(mesurees)} forme(s) confrontée(s) · ` +
        `${String(CLES_DE_REBUT.length)} cause(s) de rebut déclarée(s)`,
    );

    expect(mesurees).toBe(formes.length);
    expect(mesurees).toBeGreaterThanOrEqual(4);
  });
});
