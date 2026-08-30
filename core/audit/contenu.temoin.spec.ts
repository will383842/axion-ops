/**
 * TÉMOINS ADVERSAIRES — `core/audit/contenu.ts`, la garde du § 31.
 *
 * « Jamais de corps ni d'extraits dans les journaux. »
 *
 * La garde ne cherche pas « du contenu » : elle exige une FORME. Son en-tête
 * l'écrit noir sur blanc — « une phrase, un extrait d'e-mail, un nom de
 * personne : tous portent des espaces, ou dépassent une longueur
 * d'identifiant ». Cette phrase est une MESURE, et les témoins ci-dessous en
 * cherchent la BORNE : que se passe-t-il quand le contenu ne porte ni espace ni
 * longueur excessive ?
 *
 * Les champs visés sont ceux qu'un ADAPTATEUR remplit, pas le socle :
 * `recordIds` et `partialSources` arrivent d'un `Succes` produit ailleurs — dans
 * le cas du CRM, d'un dépôt PUBLIC. Ce sont les deux seules colonnes du journal
 * dont la valeur ne soit pas fabriquée par le socle lui-même.
 */

import { describe, expect, it } from "vitest";

import { verifierAucunContenu } from "./contenu.js";
import { CHAMPS_COUVERTS } from "./canonique.js";
import { contenuTemoin } from "./fixtures.js";

describe("TÉMOIN — § 31 : la garde de contenu sait-elle rougir ?", () => {
  it("rougit sur une phrase avec espaces glissée dans `recordIds`, et ANNONCE son compte", () => {
    const verdict = verifierAucunContenu(
      contenuTemoin(1, { recordIds: ["Bonjour Jean, je confirme le rendez-vous de mardi 14 h."] }),
    );

    console.log(
      `[témoin § 31 · espaces] ${String(verdict.champsInspectes)} champ(s) et ` +
        `${String(verdict.valeursInspectees)} valeur(s) inspecté(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies.length).toBeGreaterThan(0);
    // Le compte est LU, jamais supposé : une garde qui inspecte zéro champ est
    // verte pour la pire des raisons.
    expect(verdict.champsInspectes).toBe(CHAMPS_COUVERTS.length);
    expect(verdict.champsInspectes).toBeGreaterThan(0);
  });

  it("rougit sur les espaces UNICODE, pas seulement l'espace ASCII — un témoin par forme", () => {
    // `\s` sous le drapeau `u` doit couvrir l'espace insécable et l'espace fine
    // insécable ; `\p{C}` doit couvrir l'espace de largeur nulle. Un extrait de
    // texte français typographié en porte, et il ne doit pas échapper.
    const formes: readonly { readonly nom: string; readonly valeur: string }[] = [
      { nom: "espace ASCII", valeur: "Le patient a dit" },
      { nom: "espace insécable U+00A0", valeur: "Le patient a dit" },
      { nom: "espace fine insécable U+202F", valeur: "14 h 30 chez Jean" },
      { nom: "largeur nulle U+200B", valeur: "Le​patient​a​dit" },
      { nom: "saut de ligne", valeur: "Bonjour\nJean" },
      { nom: "tabulation", valeur: "Bonjour\tJean" },
    ];

    let mordues = 0;
    for (const forme of formes) {
      const verdict = verifierAucunContenu(contenuTemoin(2, { recordIds: [forme.valeur] }));
      expect(verdict.anomalies.length, `« ${forme.nom} » doit mordre`).toBeGreaterThan(0);
      mordues += 1;
    }

    console.log(`[témoin § 31 · unicode] ${String(mordues)} forme(s) d'espacement éprouvée(s)`);
    expect(mordues).toBe(formes.length);
  });

  it("rougit sur une liste `recordIds` qui devient un EXPORT (au-delà de 512 entrées)", () => {
    const trop = Array.from({ length: 513 }, (_, rang) => `rec-${String(rang)}`);
    const verdict = verifierAucunContenu(contenuTemoin(3, { recordIds: trop }));

    console.log(
      `[témoin § 31 · volume] ${String(trop.length)} identifiant(s) soumis, ` +
        `${String(verdict.valeursInspectees)} valeur(s) inspectée(s)`,
    );

    expect(verdict.anomalies.join(" ")).toContain("513 éléments");
    // La garde inspecte CHAQUE élément, pas seulement le compte : le nombre de
    // valeurs inspectées doit croître avec la liste.
    expect(verdict.valeursInspectees).toBeGreaterThan(trop.length);
  });

  it("REFUSE une phrase dont les espaces sont remplacés par des tirets", () => {
    // LE DÉFAUT REFERMÉ AU LOT 1. La garde du § 31 est une garde de FORME, et
    // sa borne réelle était plus étroite que son énoncé : elle ne voyait un
    // extrait de contenu QUE s'il portait un espace, un caractère de contrôle,
    // ou dépassait la longueur maximale. Une phrase de 55 caractères sans
    // espace la traversait intacte — et `recordIds` est rempli par
    // l'ADAPTATEUR, pas par le socle : dans le cas du CRM, depuis un dépôt
    // PUBLIC.
    //
    // La règle ajoutée ne cherche pas « est-ce personnel ? » — aucune garde ne
    // sait répondre à ça. Elle demande : cette valeur a-t-elle la FORME d'un
    // identifiant ? Une phrase francisée tire une dizaine de segments purement
    // alphabétiques ; un identifiant composite en tire trois ou quatre.
    const phrase = "Bonjour-Jean-je-confirme-votre-rendez-vous-de-mardi-14h";
    const verdict = verifierAucunContenu(contenuTemoin(4, { recordIds: [phrase] }));

    console.log(
      `[témoin § 31 · tirets] 1 valeur de ${String(phrase.length)} caractères portant une ` +
        `phrase lisible, ${String(verdict.anomalies.length)} anomalie(s), ` +
        `${String(verdict.champsInspectes)} champ(s) inspecté(s)`,
    );

    expect(verdict.anomalies, "la phrase ne doit PAS entrer au journal").not.toHaveLength(0);
    expect(verdict.anomalies.join(" ")).toContain("recordIds");
  });

  it("REFUSE une adresse e-mail dans `recordIds`, que le § 12 règle 3 veut pseudonyme", () => {
    // Une adresse e-mail est une donnée personnelle directement identifiante,
    // et sa FORME est reconnaissable sans ambiguïté : elle porte un `@`,
    // qu'aucun identifiant pseudonyme n'a de raison légitime de porter. La
    // garde la refuse désormais sur la forme, comme elle refusait déjà
    // l'espace. Coût : nul.
    const verdict = verifierAucunContenu(
      contenuTemoin(5, { recordIds: ["jean.dupont@exemple.fr"] }),
    );

    console.log(
      `[témoin § 31 · e-mail] 1 adresse e-mail soumise dans recordIds, ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies, "l'adresse ne doit PAS entrer au journal").not.toHaveLength(0);
    expect(verdict.anomalies.join(" ")).toContain("@");
  });

  it("REFUSE une phrase sans espace dans `partialSources`", () => {
    // `partialSources` est plus permissif en LONGUEUR (256 caractères) parce
    // que l'encodage de clôture du § 31 y loge 88 caractères. La marge qui
    // reste n'était gardée que par l'absence d'espace ; elle l'est maintenant
    // aussi par la forme.
    const charge =
      "Le-client-refuse-de-payer-la-facture-2026-08-30-et-menace-de-saisir-le-tribunal";
    const verdict = verifierAucunContenu(contenuTemoin(6, { partialSources: [charge] }));

    console.log(
      `[témoin § 31 · partialSources] 1 valeur de ${String(charge.length)} caractères, ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies, "la phrase ne doit PAS entrer au journal").not.toHaveLength(0);
  });

  it("CONTRE-TÉMOIN — les identifiants LÉGITIMES passent encore", () => {
    // Sans ce contre-témoin, les trois gardes ci-dessus seraient
    // indistinguables d'une garde qui refuserait tout. On éprouve les formes
    // que le socle et ses adaptateurs produisent réellement.
    const legitimes = [
      "cl9x2k4p80000qzrmn831i7rn", // un cuid
      "550e8400-e29b-41d4-a716-446655440000", // un UUID
      "crm.contact.v2.fr.actif.42", // un identifiant composite bavard
      "msg_01HZX9K2QYBTR", // un identifiant de fournisseur
      "zoho.mail.recent", // un nom d'outil du § 28
    ];

    const verdict = verifierAucunContenu(contenuTemoin(9, { recordIds: legitimes }));

    console.log(
      `[témoin § 31 · contraste] ${String(legitimes.length)} identifiant(s) légitime(s) mesuré(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s) — attendu 0`,
    );

    expect(
      verdict.anomalies,
      "un identifiant légitime ne doit pas devenir un faux rouge",
    ).toHaveLength(0);
  });

  it("BORNE ÉCRITE — ce que cette garde ne prouve PAS", () => {
    // ⚠️ LE PÉRIMÈTRE D'OBSERVATION, ÉNONCÉ AVEC SA MESURE. Cette garde prouve
    //    l'absence de TEXTE LIBRE, pas l'absence de donnée personnelle. Un nom
    //    de personne en un seul mot, un numéro de téléphone, une URL courte la
    //    traversent — et c'est mesuré ici plutôt qu'affirmé nulle part.
    //
    //    Un renforcement réel ne passerait pas par un motif de plus : il
    //    passerait par les `idFields` que l'outil DÉCLARE dans son manifeste
    //    (§ 09), et qu'on confronterait à la valeur reçue. Voir `docs/ETAT.md`.
    const traversent = ["Dupont", "0612345678", "example.fr"];
    const verdict = verifierAucunContenu(contenuTemoin(10, { recordIds: traversent }));

    console.log(
      `[témoin § 31 · borne] ${String(traversent.length)} forme(s) NON couverte(s) mesurée(s) : ` +
        `${traversent.join(", ")} — ${String(verdict.anomalies.length)} anomalie(s). ` +
        "La garde prouve l'absence de TEXTE LIBRE, pas l'absence de donnée personnelle.",
    );

    expect(verdict.anomalies).toHaveLength(0);
  });

  it("une ligne dont TOUS les champs couverts sont mutilés produit autant d'anomalies", () => {
    // Contre-témoin du compte : la garde doit voir CHAQUE champ, pas s'arrêter
    // au premier. Sans quoi le compte annoncé serait vrai et la couverture
    // fausse.
    const verdict = verifierAucunContenu(
      contenuTemoin(7, {
        principal: "un principal avec des espaces",
        sessionId: "une session avec des espaces",
        tool: "un outil avec des espaces",
        toolVersion: "une version avec des espaces",
        adapterVersion: "une autre avec des espaces",
        argHash: "pas une empreinte",
      }),
    );

    console.log(
      `[témoin § 31 · couverture] ${String(verdict.champsInspectes)} champ(s) inspecté(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s) sur 6 champs mutilés`,
    );

    expect(verdict.anomalies).toHaveLength(6);
    expect(verdict.champsInspectes).toBe(CHAMPS_COUVERTS.length);
  });
});
