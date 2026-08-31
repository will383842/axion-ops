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

import {
  CHAMPS_IDENTIFIANTS_DU_JOURNAL,
  bornerIdentifiantDuJournal,
  bornesDIdentifiantDuJournal,
  bornesDeListeDuJournal,
  verifierAucunContenu,
} from "./contenu.js";
import { CHAMPS_COUVERTS } from "./canonique.js";
import { contenuTemoin } from "./fixtures.js";
import type { ContenuLigne } from "./vocabulaire.js";

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
    // ⚠️ **LA CONVERSION CI-DESSOUS EST LE SUJET DU TEST, PAS UN CONTOURNEMENT.**
    //    Depuis l'ADR 0014, `ContenuLigne.sessionId` est un type MARQUÉ : une
    //    chaîne d'humain n'y est plus assignable, et c'est justement ce que ce
    //    fichier doit pouvoir écrire — « ce que le kit fabrique, une garde peut
    //    le MUTILER ; une garde qui ne peut pas mutiler son sujet ne prouve
    //    rien ». La conversion porte sur la LIGNE ENTIÈRE et une seule fois, pas
    //    sur le champ : convertir vers `SessionId` aurait posé, dans un fichier
    //    quelconque, la forme exacte que la garde G3 de l'ADR 0014 traque.
    //
    // ⚠️ ET ELLE MESURE UNE BORNE RÉELLE : le type marqué ferme le chemin du
    //    CODE, il ne ferme pas la COLONNE. Une valeur venue d'une base corrompue
    //    ou d'une migration arrive sans passer par TypeScript — c'est pour ce
    //    cas-là que la garde de contenu du § 31 s'exécute À L'ÉCRITURE.
    const ligneMutilee = {
      ...contenuTemoin(7),
      principal: "un principal avec des espaces",
      sessionId: "une session avec des espaces",
      tool: "un outil avec des espaces",
      toolVersion: "une version avec des espaces",
      adapterVersion: "une autre avec des espaces",
      argHash: "pas une empreinte",
    } as unknown as ContenuLigne;
    const verdict = verifierAucunContenu(ligneMutilee);

    console.log(
      `[témoin § 31 · couverture] ${String(verdict.champsInspectes)} champ(s) inspecté(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s) sur 6 champs mutilés`,
    );

    expect(verdict.anomalies).toHaveLength(6);
    expect(verdict.champsInspectes).toBe(CHAMPS_COUVERTS.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  ADR 0029, POINT 4 — LA BORNE DES IDENTIFIANTS DÉRIVE DE `FORMES`
// ════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE CE BLOC GARDE, ET POURQUOI IL EST SÉPARÉ DU PRÉCÉDENT.
 *
 * Le défaut BLOQUANT du lot 1d n'était pas dans `verifierAucunContenu()` — elle
 * avait raison de refuser. Il était en AMONT : `tool` et `principal` étaient
 * posés VERBATIM, la ligne était refusée, et l'écriture levait hors du `try` de
 * `journaliser` — zéro ligne d'`ops_audit`.
 *
 * L'ADR 0029, point 4, exige que la borne appliquée en amont soit **dérivée** de
 * `FORMES` et jamais réécrite. Ces témoins gardent la dérivation elle-même :
 *
 *  · la FAMILLE est énumérable et son cardinal est ANNONCÉ — sans quoi le
 *    troisième champ serait oublié comme `principal` l'a été ;
 *  · un changement de genre fait LEVER, jamais rendre une borne fantaisiste ;
 *  · le REPLI est confronté à la garde qu'il prétend satisfaire ;
 *  · et la valeur BORNÉE s'écrit vraiment — c'est la seule moitié qui prouve que
 *    la ligne n'est plus perdue.
 */
describe("TÉMOIN — ADR 0029 : la borne des identifiants dérive, et sait lever", () => {
  it("ÉNUMÈRE la famille par dérivation du genre, et ANNONCE son cardinal", () => {
    const bornes = CHAMPS_IDENTIFIANTS_DU_JOURNAL.map(
      (champ) => [champ, bornesDIdentifiantDuJournal(champ).maxCar] as const,
    );

    console.log(
      `[témoin ADR 0029 · famille] ${String(CHAMPS_COUVERTS.length)} champ(s) couvert(s) · ` +
        `${String(CHAMPS_IDENTIFIANTS_DU_JOURNAL.length)} de genre IDENTIFIANT : ` +
        bornes.map(([champ, max]) => `${champ}\u2264${String(max)}`).join(", "),
    );

    // ⚠️ LES DEUX CHAMPS DU DÉFAUT BLOQUANT SONT DANS LA FAMILLE, ET C'EST
    //    L'ASSERTION QUI COMPTE : si l'un en sortait, l'amont cesserait de le
    //    borner SANS QU'AUCUNE AUTRE GARDE NE CHANGE DE COULEUR.
    expect(CHAMPS_IDENTIFIANTS_DU_JOURNAL, "`tool` est de la famille").toContain("tool");
    expect(CHAMPS_IDENTIFIANTS_DU_JOURNAL, "`principal` aussi").toContain("principal");
    // Plancher-témoin : une dérivation qui rendrait une liste vide serait verte
    // partout ailleurs. Cinq colonnes portent le genre `identifiant` aujourd'hui.
    expect(CHAMPS_IDENTIFIANTS_DU_JOURNAL.length, "plancher-témoin").toBeGreaterThanOrEqual(5);
    // ET la famille n'est pas TOUT : une dérivation qui rendrait tous les champs
    // couverts s'accorderait, elle aussi, pour une mauvaise raison.
    expect(
      CHAMPS_IDENTIFIANTS_DU_JOURNAL.length,
      "elle ne prend pas toutes les colonnes",
    ).toBeLessThan(CHAMPS_COUVERTS.length);
    expect(
      bornes.every(([, max]) => Number.isInteger(max) && max > 0),
      "aucune borne fantaisiste",
    ).toBe(true);
  });

  it("LÈVE quand on lui réclame la borne d'une colonne d'un AUTRE genre", () => {
    // ⚠️ LE TÉMOIN FABRIQUÉ, ET IL SE LIT DANS LES DEUX SENS : la même confusion
    //    est soumise à la fonction SŒUR, qui doit lever à l'inverse. Sans cette
    //    seconde moitié, « elle lève » ne se distinguerait pas de « elle lève
    //    toujours ».
    const confusions: string[] = [];
    let levees = 0;

    for (const [demande, champ] of [
      ["identifiant", "recordIds"],
      ["liste", "principal"],
    ] as const) {
      confusions.push(`${demande}(${champ})`);
      try {
        if (demande === "identifiant") bornesDIdentifiantDuJournal(champ);
        else bornesDeListeDuJournal(champ as unknown as "recordIds");
      } catch {
        levees += 1;
      }
    }

    console.log(
      `[témoin ADR 0029 · genre] ${String(confusions.length)} confusion(s) de genre ` +
        `soumise(s) : ${confusions.join(", ")} · ${String(levees)} levée(s)`,
    );

    expect(confusions.length, "plancher : deux confusions soumises").toBe(2);
    expect(levees, "un changement de genre lève, il ne rend pas une borne").toBe(2);
    // La contre-épreuve : sur son propre genre, chacune rend bien sa borne.
    expect(bornesDIdentifiantDuJournal("tool").maxCar).toBeGreaterThan(0);
    expect(bornesDeListeDuJournal("recordIds").maxElements).toBeGreaterThan(0);
  });

  it("BORNE ce que le § 31 refuserait, et la valeur bornée S'ÉCRIT", () => {
    const REPLI = "inconnu:hors-forme";
    const FAUTIVES = [
      "outil inconnu",
      "outil\ninconnu",
      "prin cipal",
      "un.nom.qui.est.en.fait.une.phrase.francaise.deguisee",
      "adresse@exemple.invalid",
      "x".repeat(500),
    ] as const;

    let soumises = 0;
    let borneesAuRepli = 0;
    for (const valeur of FAUTIVES) {
      soumises += 1;
      if (bornerIdentifiantDuJournal("tool", valeur, REPLI) === REPLI) borneesAuRepli += 1;
    }

    // La contre-épreuve : une valeur SAINE traverse sans être remplacée. Sans
    // elle, « tout est borné » ne se distinguerait pas de « tout est écrasé ».
    const saine = bornerIdentifiantDuJournal("tool", "axionia.inbox.recent", REPLI);

    let repliRefuse = false;
    try {
      bornerIdentifiantDuJournal("tool", "peu importe", "un repli avec des espaces");
    } catch {
      repliRefuse = true;
    }

    console.log(
      `[témoin ADR 0029 · borne] ${String(soumises)} forme(s) fautive(s) soumise(s) · ` +
        `${String(borneesAuRepli)} bornée(s) au repli · valeur saine conservée : ` +
        `${String(saine === "axionia.inbox.recent")} · repli malformé refusé : ` +
        `${String(repliRefuse)}`,
    );

    expect(soumises, "plancher : six formes fautives").toBe(6);
    expect(borneesAuRepli, "chacune est bornée").toBe(6);
    expect(saine, "une valeur saine n'est jamais remplacée").toBe("axionia.inbox.recent");
    expect(repliRefuse, "un repli qui ne passe pas le § 31 est REFUSÉ, pas écrit").toBe(true);

    // ⚠️ LA MOITIÉ QUI FAIT LE LIEN, ET SANS ELLE CE TÉMOIN NE PROUVERAIT RIEN :
    //    la valeur bornée doit passer la garde du § 31 ELLE-MÊME. Une borne dont
    //    le résultat serait encore refusé perdrait la ligne exactement comme
    //    avant, et tous les comptes ci-dessus resteraient verts.
    const ligne = {
      ...contenuTemoin(11),
      tool: bornerIdentifiantDuJournal("tool", FAUTIVES[0], REPLI),
      principal: bornerIdentifiantDuJournal("principal", FAUTIVES[2], REPLI),
    } as unknown as ContenuLigne;
    const verdict = verifierAucunContenu(ligne);

    console.log(
      `[témoin ADR 0029 · écriture] ${String(verdict.champsInspectes)} champ(s) inspecté(s) · ` +
        `${String(verdict.anomalies.length)} anomalie(s) après bornage`,
    );

    expect(verdict.anomalies, "la ligne bornée s'écrit").toEqual([]);
    expect(verdict.champsInspectes, "et la garde a bien tout inspecté").toBe(
      CHAMPS_COUVERTS.length,
    );
  });
});
