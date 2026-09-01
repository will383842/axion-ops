/**
 * `sonde-02-brouillon.ts` — **`mode: "draft"` ENREGISTRE-T-IL, OU ENVOIE-T-IL ?**
 *
 * ═══ LA QUESTION, ET POURQUOI ELLE EST DANGEREUSE ═══
 *
 * Le § 27 pose la correction bloquante n° 10 mot pour mot : « l'enregistrement
 * d'un brouillon et l'envoi sont **le même POST /messages**, à un paramètre
 * `mode` près ». Toute la séparation entre `write-draft` et `send` — donc tout
 * le § 20 pour le courrier — tient à ce **seul paramètre**.
 *
 * ⚠️ **UN PARAMÈTRE MAL ORTHOGRAPHIÉ, MAL PLACÉ OU IGNORÉ N'ÉCHOUE PAS : IL
 *    ENVOIE.** C'est la propriété la plus désagréable de cette API, et c'est
 *    précisément pour cela qu'on la mesure au lieu de la lire. Le mode de
 *    défaillance n'est pas « le brouillon n'est pas créé », il est « le courrier
 *    part ».
 *
 * ⚠️ **D'OÙ LA CONTRAINTE SUR LE DESTINATAIRE.** `ZOHO_SONDE_TO` doit être une
 *    adresse que l'opérateur possède. Si `mode` est ignoré, la mesure aura causé
 *    un effet extérieur au sens du § 20 — « quelqu'un d'autre que moi peut-il
 *    s'en apercevoir ? » —, et la seule façon de garder la réponse à « non » est
 *    de s'écrire à soi-même.
 *
 * ═══ CE QUI FAIT PREUVE, ET CE QUI N'EN FAIT PAS ═══
 *
 * Un `HTTP 200` sur le POST **ne prouve rien** : il est le même dans les deux
 * cas. La preuve est **l'emplacement du message**, et elle se prend dans les
 * deux sens :
 *
 *  · le message est **relisible dans `Drafts`** — condition nécessaire ;
 *  · le message est **introuvable dans `Sent`** — condition qui manque à toute
 *    vérification naïve, et sans laquelle un `200` se lit comme un succès.
 *
 * Un contrôle qui ne regarderait que `Drafts` serait vert le jour où Zoho
 * enregistre ET envoie.
 *
 * ⚠️ **CETTE SONDE NE JOINT AUCUNE PIÈCE, ET C'EST LA RAISON DE SON EXISTENCE
 *    SÉPARÉE.** Un témoin doit isoler UNE règle. ② mesure `mode: "draft"` seul,
 *    ③ mesure le téléversement seul, ④ mesure leur COMBINAISON — qui est le
 *    risque nommé au § 34 (« `mode:"draft"` ne se combine pas aux pièces
 *    jointes »). Les mélanger rendrait un échec de ④ ininterprétable.
 */

import {
  REGLAGES,
  type AppelObserve,
  type Question,
  type Releve,
  type ValeurSecrete,
  appeler,
  champTexte,
  donneesDeLEnveloppe,
  drapeau,
  ecrireLeRelais,
  essayerLesCandidats,
  estLePointDEntree,
  exigerDuRelais,
  exigerReglage,
  lancer,
  lireLeRelais,
  obtenirJetonDAcces,
  tableau,
  urlDuCompte,
} from "./commun.js";

/**
 * LES NOMS SYSTÈME DES DEUX DOSSIERS QUI DÉCIDENT.
 *
 * ⚠️ **UNE BOÎTE PEUT LES SERVIR TRADUITS.** La sonde essaie l'anglais et le
 *    français, et si aucun ne correspond elle le DIT au lieu de choisir le
 *    premier dossier venu. `ZOHO_SONDE_FOLDER_DRAFTS` permet alors de passer
 *    l'identifiant à la main — un réglage, pas une devinette dans le code.
 */
const NOMS_BROUILLONS: readonly string[] = ["Drafts", "Brouillons"];
const NOMS_ENVOYES: readonly string[] = ["Sent", "Sent Items", "Envoyés", "Éléments envoyés"];

/** L'objet de l'essai. Reconnaissable, daté, sans donnée personnelle. */
export function objetDeLEssai(marqueur: string): string {
  return `[axion-ops M2] sonde ② brouillon simple — ${marqueur}`;
}

/** Le corps de l'essai. Aucune donnée personnelle, et un marqueur qui le rend identifiable. */
export function corpsDeLEssai(marqueur: string): string {
  return (
    `Message d'épreuve de la mesure M2 du socle axion-ops. Marqueur ${marqueur}. ` +
    "Il n'a aucun destinataire réel, aucun contenu métier, et il est destiné à être " +
    "mis à la corbeille par la sonde ④."
  );
}

/** Un marqueur unique par exécution — deux passages ne se confondent pas. */
export function marqueur(): string {
  return `${new Date().toISOString().replace(/[:.]/gu, "-")}`;
}

/** Cherche un dossier par ses noms possibles, et rend son identifiant. */
function dossierParNom(
  charge: unknown,
  noms: readonly string[],
): { readonly id: string; readonly nom: string } | null {
  for (const entree of tableau(donneesDeLEnveloppe(charge))) {
    const nom = champTexte(entree, "folderName") ?? champTexte(entree, "path");
    const id = champTexte(entree, "folderId");
    if (nom === null || id === null) continue;
    const nomPropre = nom.replace(/^\//u, "");
    if (noms.some((attendu) => attendu.toLowerCase() === nomPropre.toLowerCase())) {
      return { id, nom: nomPropre };
    }
  }
  return null;
}

let jetonEnCours: ValeurSecrete | undefined;

export async function sonder(): Promise<Releve> {
  const acces = await obtenirJetonDAcces();
  jetonEnCours = acces.jeton;

  const relais = lireLeRelais();
  const accountId = exigerDuRelais(relais, "accountId", "la sonde ① (`sonde-01-abonnement.ts`)");
  const expediteur = exigerReglage(REGLAGES.expediteur);
  const destinataire = exigerReglage(REGLAGES.destinataire);

  if (!drapeau("je-possede-le-destinataire")) {
    throw new Error(
      `refus de partir sans \`--je-possede-le-destinataire\`. Si Zoho ignorait \`mode\`, ` +
        `un courrier partirait vers \`${REGLAGES.destinataire}\`. Le § 20 appelle cela un ` +
        "effet extérieur, et une mesure n'a pas le droit d'en causer un sans que quelqu'un " +
        "l'ait écrit. Relancez avec le drapeau si l'adresse est la vôtre.",
    );
  }

  const appels: AppelObserve[] = [];
  const questions: Question[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  //  Q1 · LES DEUX DOSSIERS QUI DÉCIDENT
  // ─────────────────────────────────────────────────────────────────────────
  const dossiers = await appeler(acces.jeton, "GET", urlDuCompte(relais, accountId, "/folders"));
  appels.push(dossiers);

  const brouillons = dossierParNom(dossiers.charge, NOMS_BROUILLONS);
  const envoyes = dossierParNom(dossiers.charge, NOMS_ENVOYES);
  const nombreDeDossiers = tableau(donneesDeLEnveloppe(dossiers.charge)).length;

  questions.push({
    question:
      "Les dossiers `Drafts` et `Sent` sont-ils identifiables ? (§ 27, `ZohoMail.folders.READ`)",
    verdict: brouillons !== null && envoyes !== null ? "ÉTABLI" : "INDÉCIS",
    constat:
      `${String(nombreDeDossiers)} dossier(s) énumérés · brouillons : ` +
      `${brouillons === null ? "INTROUVABLE" : `« ${brouillons.nom} » (${brouillons.id})`} · ` +
      `envoyés : ${envoyes === null ? "INTROUVABLE" : `« ${envoyes.nom} » (${envoyes.id})`}. ` +
      "⚠️ Les noms des autres dossiers ne sont pas imprimés : un dossier peut porter un nom " +
      "de client, et ce relevé est destiné à un dépôt PUBLIC.",
    decide:
      brouillons !== null && envoyes !== null
        ? "la preuve d'emplacement est possible dans les DEUX sens. On continue."
        : "sans ces deux identifiants, un `200` sur le POST ne se distingue pas d'un envoi. " +
          "Posez `ZOHO_SONDE_FOLDER_DRAFTS` à la main, ou traduisez les noms attendus ici.",
    appuis: [dossiers],
  });

  if (brouillons === null) {
    return releve(questions, appels);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Q2 · LE POST AVEC `mode: "draft"`
  // ─────────────────────────────────────────────────────────────────────────
  const marque = marqueur();
  const charge = {
    fromAddress: expediteur,
    toAddress: destinataire,
    subject: objetDeLEssai(marque),
    content: corpsDeLEssai(marque),
    mailFormat: "plaintext",
    // ⚠️ LE PARAMÈTRE QUI PORTE TOUT LE § 20 POUR LE COURRIER.
    mode: "draft",
  };

  const creation = await appeler(acces.jeton, "POST", urlDuCompte(relais, accountId, "/messages"), {
    corps: JSON.stringify(charge),
    contentType: "application/json",
  });
  appels.push(creation);

  const donnees = donneesDeLEnveloppe(creation.charge);
  const messageId = champTexte(donnees, "messageId") ?? champTexte(donnees, "draftId");
  const folderIdRendu = champTexte(donnees, "folderId");

  questions.push({
    question: '`POST /messages` avec `mode: "draft"` est-il accepté ?',
    verdict: creation.code === 200 && messageId !== null ? "ÉTABLI" : "RÉFUTÉ",
    constat:
      `HTTP ${String(creation.code)} · identifiant rendu : ${messageId ?? "AUCUN"} · ` +
      `dossier annoncé dans la réponse : ${folderIdRendu ?? "non annoncé"}.` +
      (messageId === null
        ? " ⚠️ SANS IDENTIFIANT RENDU, LE § 27 EST INAPPLICABLE : `send` « n'accepte qu'un " +
          "`draftId` », et il n'y a rien à lui passer."
        : ""),
    decide:
      creation.code === 200 && messageId !== null
        ? "`draft_create` a une forme d'appel. La question du § 20 reste entière : le message " +
          "est-il ENREGISTRÉ, ou ENVOYÉ ? C'est Q3 qui répond, pas ce code 200."
        : "l'outil `zoho.mail.draft_create` du § 27 n'a pas d'endpoint. Le lot 6 s'arrête ici.",
    appuis: [creation],
  });

  if (messageId === null) {
    return releve(questions, appels);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Q3 · OÙ LE MESSAGE A-T-IL ATTERRI ? — LA SEULE PREUVE QUI COMPTE
  // ─────────────────────────────────────────────────────────────────────────
  const dansBrouillons = await essayerLesCandidats(acces.jeton, "GET", [
    urlDuCompte(relais, accountId, `/folders/${brouillons.id}/messages/${messageId}/content`),
    urlDuCompte(relais, accountId, `/messages/${messageId}/content`),
  ]);
  appels.push(...dansBrouillons.tentatives);

  // ⚠️ **LE SENS NÉGATIF, ET IL EST OBLIGATOIRE.** Un contrôle qui ne cherche
  //    que dans `Drafts` reste vert si Zoho a fait les deux. La question n'est
  //    pas « le brouillon existe-t-il ? » mais « le courrier est-il parti ? ».
  const dansEnvoyes =
    envoyes === null
      ? null
      : await appeler(
          acces.jeton,
          "GET",
          urlDuCompte(relais, accountId, `/folders/${envoyes.id}/messages/${messageId}/content`),
        );
  if (dansEnvoyes !== null) appels.push(dansEnvoyes);

  const lisibleEnBrouillon = dansBrouillons.retenu !== null;
  const absentDesEnvoyes = dansEnvoyes === null ? null : dansEnvoyes.code !== 200;

  questions.push({
    question:
      "Le message a-t-il été ENREGISTRÉ (dans `Drafts`) sans être ENVOYÉ (absent de `Sent`) ?",
    verdict:
      lisibleEnBrouillon && absentDesEnvoyes === true
        ? "ÉTABLI"
        : lisibleEnBrouillon && absentDesEnvoyes === false
          ? "RÉFUTÉ"
          : "INDÉCIS",
    constat:
      `relisible dans les brouillons : ${lisibleEnBrouillon ? "OUI" : "non"} · ` +
      `présent dans les envoyés : ${
        absentDesEnvoyes === null ? "NON VÉRIFIÉ" : absentDesEnvoyes ? "non" : "OUI"
      }.` +
      (absentDesEnvoyes === false
        ? " 🔥 `mode: \"draft\"` A ÉTÉ IGNORÉ OU N'EMPÊCHE PAS L'ENVOI. Un courrier est parti."
        : ""),
    decide:
      lisibleEnBrouillon && absentDesEnvoyes === true
        ? "l'enregistrement d'un brouillon est distinct de l'envoi. La séparation " +
          "`write-draft` / `send` du § 20 a une réalité côté Zoho, et le § 27 tient sur ce point."
        : absentDesEnvoyes === false
          ? "⛔ TOUT LE § 27 EST À REPRENDRE. La séparation entre `write-draft` et `send` " +
            "n'existe pas côté Zoho, et le § 27 écrit déjà que le scope ne la porte pas non " +
            "plus (`ZohoMail.messages.ALL` couvre les deux). Le « double contrôle » du § 19 " +
            "n'aurait alors AUCUN étage, ni de scope ni d'API — la politique seule ne suffit " +
            "pas à tenir une frontière que l'API ne connaît pas."
          : "l'emplacement n'a pas pu être établi. Ne concluez rien : c'est exactement l'état " +
            "où l'on suppose que ça marche.",
    appuis: [...dansBrouillons.tentatives, ...(dansEnvoyes === null ? [] : [dansEnvoyes])],
  });

  const chemin = ecrireLeRelais({
    folderIdBrouillons: brouillons.id,
    brouillonSimple: messageId,
  });
  process.stdout.write(
    `[relais] dossier des brouillons et identifiant du brouillon posés dans ${chemin}\n`,
  );

  return releve(questions, appels);
}

function releve(questions: readonly Question[], appels: readonly AppelObserve[]): Releve {
  return {
    sonde: "②",
    titre: '`mode: "draft"` enregistre-t-il sans envoyer ?',
    date: new Date().toISOString(),
    questions,
    appelsFaits: appels.length,
    // Le minimum pour conclure : lister les dossiers, poster, relire dans
    // `Drafts`, et chercher dans `Sent`. Trois appels ne suffisent pas — ils
    // laisseraient le sens négatif non mesuré.
    plancherDAppels: 4,
  };
}

if (estLePointDEntree(import.meta.url)) {
  await lancer(sonder, () => jetonEnCours);
}
