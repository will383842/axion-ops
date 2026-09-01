/**
 * `sonde-04-relecture.ts` — **L'UNIQUE CRITÈRE DE FIN DU LOT 6.**
 *
 * ═══ POURQUOI CELLE-CI EST DIFFÉRENTE DES TROIS AUTRES ═══
 *
 * Le § 35 l'écrit pour la mesure M2 : elle « tranche l'unique critère de fin du
 * lot 6 ». Le § 34 nomme le risque exact, à gravité « élevé » :
 * « `mode:"draft"` ne se combine pas aux pièces jointes ».
 *
 * ⚠️ **③ RÉUSSIE ET ② RÉUSSIE NE PRÉDISENT PAS ④.** C'est la raison d'être de
 *    cette sonde séparée. Les deux mécanismes existent chacun de leur côté chez
 *    Zoho ; rien ne garantit qu'ils commutent. Un adaptateur courrier dont
 *    l'usage principal est « prépare-moi une réponse à Délifrance avec le devis
 *    en pièce jointe » ne vaut rien si cette combinaison-là ne passe pas.
 *
 * ⚠️ **SI CETTE SONDE ÉCHOUE, LE § 27 EST À REPENSER ENTIÈREMENT** — et pas à
 *    rafistoler. Les issues sont écrites dans le relevé, pas laissées au
 *    lecteur.
 *
 * ═══ CE QUI FAIT PREUVE ICI ═══
 *
 * Trois conditions, et les trois sont nécessaires :
 *
 *  1. le POST combiné est **accepté** ;
 *  2. le corps relu **porte le marqueur** de cette exécution — sans quoi on
 *    pourrait relire un brouillon d'une exécution précédente ;
 *  3. les métadonnées de pièce jointe relues **portent le bon nom ET la bonne
 *    taille** — sans quoi la pièce « attachée » peut être une coquille vide.
 *
 * ⚠️ **LE CONTENU DE LA PIÈCE N'EST PAS TÉLÉCHARGÉ, ET C'EST UNE DÉCISION.** Le
 *    § 31 interdit le cache de contenu sur disque, et le § 27 signale déjà que
 *    `attachment_download` le contredit frontalement. La preuve se prend donc
 *    sur les métadonnées — nom, taille — et le relevé DIT que c'en est une
 *    borne : deux fichiers de même nom et de même taille resteraient
 *    indiscernables. Le marqueur unique du corps ferme cette borne pour le
 *    brouillon ; il ne la ferme pas pour la pièce.
 */

import {
  type AppelObserve,
  type Question,
  type Releve,
  type ValeurSecrete,
  appeler,
  champNombre,
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
  REGLAGES,
  tableau,
  urlDuCompte,
} from "./commun.js";

/** Le marqueur de cette exécution, présent dans l'objet ET dans le corps. */
function marqueur(): string {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

/** Cherche, dans une charge quelconque, un objet portant ce nom de pièce jointe. */
function pieceRelue(
  charge: unknown,
  nomAttendu: string,
): { readonly nom: string; readonly taille: number | null; readonly aLeTriplet: boolean } | null {
  const donnees = donneesDeLEnveloppe(charge);
  const entrees: readonly unknown[] = Array.isArray(donnees) ? tableau(donnees) : [donnees];
  for (const entree of entrees) {
    const nom = champTexte(entree, "attachmentName") ?? champTexte(entree, "fileName");
    if (nom === null || nom !== nomAttendu) continue;
    return {
      nom,
      taille: champNombre(entree, "attachmentSize") ?? champNombre(entree, "size"),
      aLeTriplet:
        champTexte(entree, "storeName") !== null && champTexte(entree, "attachmentPath") !== null,
    };
  }
  return null;
}

let jetonEnCours: ValeurSecrete | undefined;

export async function sonder(): Promise<Releve> {
  const acces = await obtenirJetonDAcces();
  jetonEnCours = acces.jeton;

  const relais = lireLeRelais();
  const accountId = exigerDuRelais(relais, "accountId", "la sonde ① (`sonde-01-abonnement.ts`)");
  const dossier = exigerDuRelais(
    relais,
    "folderIdBrouillons",
    "la sonde ② (`sonde-02-brouillon.ts`)",
  );
  const piece = exigerDuRelais(relais, "pieceJointe", "la sonde ③ (`sonde-03-piece-jointe.ts`)");
  const expediteur = exigerReglage(REGLAGES.expediteur);
  const destinataire = exigerReglage(REGLAGES.destinataire);

  if (!drapeau("je-possede-le-destinataire")) {
    throw new Error(
      "refus de partir sans `--je-possede-le-destinataire` : cette sonde poste elle aussi avec " +
        '`mode: "draft"`, et le mode de défaillance de ce paramètre est l\'ENVOI (voyez la ' +
        "sonde ②). Le drapeau atteste que l'adresse de destination est la vôtre.",
    );
  }

  const marque = marqueur();
  const objet = `[axion-ops M2] sonde ④ brouillon + pièce — ${marque}`;
  const corps =
    "Message d'épreuve de la mesure M2 du socle axion-ops — combinaison brouillon × pièce " +
    `jointe. Marqueur ${marque}. Aucune donnée personnelle, aucun contenu métier.`;

  const appels: AppelObserve[] = [];
  const questions: Question[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  //  Q1 · LE POST COMBINÉ — `mode: "draft"` ET UNE PIÈCE, DANS LE MÊME APPEL
  // ─────────────────────────────────────────────────────────────────────────
  const charge = {
    fromAddress: expediteur,
    toAddress: destinataire,
    subject: objet,
    content: corps,
    mailFormat: "plaintext",
    mode: "draft",
    // ⚠️ LE TRIPLET EST RECOPIÉ TEL QUEL, DEPUIS LE RELAIS. Il n'est ni
    //    reconstruit, ni normalisé : c'est exactement ce que l'adaptateur devra
    //    faire, et une transformation ici mesurerait autre chose.
    attachments: [
      {
        storeName: piece.storeName,
        attachmentPath: piece.attachmentPath,
        attachmentName: piece.attachmentName,
      },
    ],
  };

  const creation = await appeler(acces.jeton, "POST", urlDuCompte(relais, accountId, "/messages"), {
    corps: JSON.stringify(charge),
    contentType: "application/json",
  });
  appels.push(creation);

  const messageId =
    champTexte(donneesDeLEnveloppe(creation.charge), "messageId") ??
    champTexte(donneesDeLEnveloppe(creation.charge), "draftId");

  questions.push({
    question:
      '`POST /messages` accepte-t-il `mode: "draft"` ET `attachments` dans le MÊME appel ? ' +
      '(§ 34 : risque élevé, « `mode:"draft"` ne se combine pas aux pièces jointes »)',
    verdict: creation.code === 200 && messageId !== null ? "ÉTABLI" : "RÉFUTÉ",
    constat: `HTTP ${String(creation.code)} · identifiant rendu : ${messageId ?? "AUCUN"}.`,
    decide:
      creation.code === 200 && messageId !== null
        ? "l'appel combiné est accepté. Un `200` ne dit PAS que la pièce est attachée — Q2 et " +
          "Q3 le mesurent."
        : "⛔ LE RISQUE DU § 34 EST RÉALISÉ. Trois issues, et aucune n'est un rafistolage : " +
          "(a) téléverser la pièce puis la rattacher par un second appel, si un tel appel " +
          "existe — à mesurer ; (b) restreindre `draft_create` aux messages SANS pièce, ce qui " +
          "retire à l'adaptateur son usage principal ; (c) retenir « la voie plus courte » du " +
          "§ 27 et renoncer au lot 6.",
    appuis: [creation],
  });

  if (messageId === null) {
    return releve(questions, appels);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Q2 · LE CORPS RELU PORTE-T-IL LE MARQUEUR DE CETTE EXÉCUTION ?
  // ─────────────────────────────────────────────────────────────────────────
  const relecture = await essayerLesCandidats(acces.jeton, "GET", [
    urlDuCompte(relais, accountId, `/folders/${dossier}/messages/${messageId}/content`),
    urlDuCompte(relais, accountId, `/messages/${messageId}/content`),
  ]);
  appels.push(...relecture.tentatives);

  const texteRelu = relecture.retenu?.extrait ?? "";
  const marqueurPresent = texteRelu.includes(marque);

  questions.push({
    question: "Le brouillon se relit-il, et porte-t-il le marqueur de CETTE exécution ?",
    verdict: relecture.retenu === null ? "RÉFUTÉ" : marqueurPresent ? "ÉTABLI" : "INDÉCIS",
    constat:
      relecture.retenu === null
        ? `aucune des ${String(relecture.tentatives.length)} formes de relecture n'a rendu 200.`
        : `relu par ${relecture.retenu.url} · marqueur « ${marque} » ` +
          `${marqueurPresent ? "PRÉSENT" : "ABSENT"} dans le corps relu.` +
          (marqueurPresent
            ? ""
            : " ⚠️ Sans le marqueur, rien ne distingue ce brouillon d'un reliquat d'exécution " +
              "précédente, et la conclusion de Q3 porterait sur un autre message."),
    decide:
      relecture.retenu === null
        ? "`zoho.mail.read` n'a pas de forme d'appel sur un brouillon. Or le § 27 fait de la " +
          "relecture le mécanisme même de `send` (« relire-puis-envoyer ») : sans elle, le " +
          "garde-fou de remplacement n'existe pas non plus."
        : marqueurPresent
          ? "la relecture est fidèle sur le corps, et la forme d'URL qui a répondu est celle " +
            "que l'adaptateur devra employer."
          : "ne concluez rien sur Q3 : le message relu n'est peut-être pas celui qui vient " +
            "d'être créé.",
    appuis: relecture.tentatives,
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Q3 · LA PIÈCE EST-ELLE RÉELLEMENT ATTACHÉE ? — LE CRITÈRE DE FIN
  // ─────────────────────────────────────────────────────────────────────────
  const infos = await essayerLesCandidats(acces.jeton, "GET", [
    urlDuCompte(relais, accountId, `/folders/${dossier}/messages/${messageId}/attachmentinfo`),
    urlDuCompte(relais, accountId, `/messages/${messageId}/attachmentinfo`),
  ]);
  appels.push(...infos.tentatives);

  const relue = pieceRelue(infos.retenu?.charge, piece.attachmentName);
  const tailleConcorde = relue !== null && relue.taille !== null && relue.taille === piece.octets;

  questions.push({
    question:
      "La pièce jointe est-elle attachée au brouillon relu, sous le bon nom et la bonne taille ?",
    verdict: relue === null ? "RÉFUTÉ" : tailleConcorde ? "ÉTABLI" : "INDÉCIS",
    constat:
      infos.retenu === null
        ? `aucune des ${String(infos.tentatives.length)} formes n'a rendu les métadonnées de ` +
          "pièce jointe."
        : relue === null
          ? `réponse obtenue, mais AUCUNE pièce nommée « ${piece.attachmentName} » n'y figure. ` +
            "Le brouillon a été créé sans sa pièce."
          : `pièce « ${relue.nom} » présente · taille relue ` +
            `${relue.taille === null ? "non annoncée" : String(relue.taille)} contre ` +
            `${String(piece.octets)} téléversés · triplet re-postable dans la relecture : ` +
            `${relue.aLeTriplet ? "OUI" : "NON"}.`,
    decide: tailleConcorde
      ? "✅ **L'UNIQUE CRITÈRE DE FIN DU LOT 6 EST ATTEINT.** Le § 34 perd son risque élevé, " +
        "et le § 27 peut être écrit tel qu'il est. Reste la sonde ⑤ : elle décide si le " +
        "garde-fou « relire-puis-envoyer » est implémentable, ce que celle-ci ne dit pas." +
        (relue !== null && !relue.aLeTriplet
          ? " ⚠️ MAIS le triplet n'est PAS rendu par la relecture : voyez la sonde ⑤, Q5 — " +
            "`send` ne pourra pas reconstruire à l'identique le message relu."
          : "")
      : relue === null
        ? "⛔ LE CRITÈRE DE FIN N'EST PAS ATTEINT, et la cause est nommée : l'appel combiné " +
          "est accepté mais n'attache rien. C'est le pire des trois échecs possibles — il " +
          "est SILENCIEUX. Un adaptateur écrit sur ce comportement produirait des brouillons " +
          "sans pièce jointe, relus et envoyés par un humain qui croirait le devis attaché."
        : "la pièce est là, la taille ne correspond pas. Ne concluez pas avant d'avoir " +
          "regardé Q2 de la sonde ③ : un écart de taille déjà présent au téléversement " +
          "n'est pas un défaut de la combinaison.",
    appuis: infos.tentatives,
  });

  const chemin = ecrireLeRelais({ brouillonAvecPiece: messageId });
  process.stdout.write(`[relais] brouillon avec pièce posé dans ${chemin}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  //  LE NETTOYAGE — OPTIONNEL, ET IL N'EST PAS UNE MESURE
  // ─────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ **CE BLOC NE MESURE PAS `zoho.mail.delete`.** Il fait le ménage, et son
  //    échec n'est pas un verdict : le § 27 spécifie `delete` comme un `PUT` vers
  //    la corbeille avec « confirmation systématique », ce qui est une décision
  //    de politique, pas une forme d'URL. Ce qu'il tente est relevé, pour que
  //    l'opérateur sache ce qui reste à retirer à la main.
  if (drapeau("nettoyer")) {
    const aRetirer = [relais.brouillonSimple, messageId].filter(
      (id): id is string => id !== undefined,
    );
    for (const id of aRetirer) {
      const essai = await essayerLesCandidats(
        acces.jeton,
        "PUT",
        [
          urlDuCompte(relais, accountId, "/updatemessage"),
          urlDuCompte(relais, accountId, `/messages/${id}`),
        ],
        {
          corps: JSON.stringify({ mode: "moveToTrash", messageId: [id] }),
          contentType: "application/json",
        },
      );
      appels.push(...essai.tentatives);
      process.stdout.write(
        `[nettoyage] brouillon ${id} : ${essai.retenu === null ? "NON RETIRÉ — à supprimer à la main dans l'interface web" : "mis à la corbeille"}\n`,
      );
    }
  } else {
    process.stdout.write(
      "[nettoyage] non demandé. Les brouillons d'épreuve restent dans la boîte ; relancez " +
        "avec `--nettoyer`, ou supprimez-les à la main (objets préfixés « [axion-ops M2] »).\n",
    );
  }

  return releve(questions, appels);
}

function releve(questions: readonly Question[], appels: readonly AppelObserve[]): Releve {
  return {
    sonde: "④",
    titre: "relire le brouillon AVEC la pièce attachée — l'unique critère de fin du lot 6",
    date: new Date().toISOString(),
    questions,
    appelsFaits: appels.length,
    // Poster, relire le corps, relire les métadonnées de pièce. Deux appels
    // laisseraient la troisième condition non mesurée, et c'est celle qui
    // échoue en silence.
    plancherDAppels: 3,
  };
}

if (estLePointDEntree(import.meta.url)) {
  await lancer(sonder, () => jetonEnCours);
}
