/**
 * `sonde-03-piece-jointe.ts` — **UNE PIÈCE JOINTE SE TÉLÉVERSE-T-ELLE, ET SOUS
 * QUELLE FORME LA RÉFÉRENCE REVIENT-ELLE ?**
 *
 * ═══ CE QUE MESURE CETTE SONDE, ET CE QU'ELLE NE MESURE PAS ═══
 *
 * Elle mesure **le téléversement seul**. Elle ne joint rien à rien : c'est la
 * sonde ④ qui éprouve la combinaison, parce qu'un témoin doit isoler une seule
 * règle. Si ③ passe et ④ échoue, on saura que le défaut est dans la
 * combinaison — ce que le § 34 nomme précisément comme risque élevé.
 *
 * ═══ LA VRAIE QUESTION N'EST PAS « ÇA MARCHE » ═══
 *
 * ⚠️ **C'EST « SOUS QUELLE FORME LA RÉFÉRENCE REVIENT ».** Zoho ne rend pas un
 *    identifiant unique : il rend un **triplet** — `storeName`,
 *    `attachmentPath`, `attachmentName` — qu'il faut recopier tel quel dans le
 *    `POST /messages` suivant. Ce triplet est le seul lien entre le fichier
 *    téléversé et le brouillon, et c'est lui qui décide de la faisabilité du § 27 :
 *
 *  · s'il revient dans la **relecture** d'un brouillon, `send` peut reconstruire
 *    à l'identique ce que l'humain a relu — le « relire-puis-envoyer » tient ;
 *  · s'il **ne revient pas**, `send` devra re-téléverser la pièce, donc produire
 *    un message qui n'est **pas** celui qui a été relu, et le garde-fou du § 27
 *    ne couvre plus les pièces jointes. C'est la sonde ⑤, Q5, qui le tranche.
 *
 * ═══ LE FICHIER EST FABRIQUÉ, JAMAIS LU ═══
 *
 * ⚠️ **AUCUN FICHIER DU DISQUE N'EST TÉLÉVERSÉ.** Le contenu est construit en
 *    mémoire, porte un marqueur unique et **son empreinte est calculée avant
 *    l'envoi** — c'est ce qui permettra à ④ de prouver que la pièce relue est
 *    bien la même, et pas un fichier homonyme. Téléverser un fichier du dépôt
 *    aurait exporté du contenu vers un tiers pour mesurer une forme d'URL.
 *
 * ⚠️ **ET RIEN N'EST TÉLÉCHARGÉ.** Le § 27 signale que `attachment_download`
 *    « écrit sur le disque et contredit frontalement le § 31 ». Aucune sonde de
 *    ce dossier n'écrit une pièce jointe sur le disque ; ④ vérifie la présence
 *    et la taille par les métadonnées, jamais par le contenu.
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
  ecrireLeRelais,
  empreinteDuCorps,
  estLePointDEntree,
  exigerDuRelais,
  lancer,
  lireLeRelais,
  obtenirJetonDAcces,
  tableau,
  urlDuCompte,
} from "./commun.js";

/** Le nom du fichier d'épreuve. Reconnaissable dans une boîte, sans ambiguïté. */
export const NOM_DU_FICHIER = "axion-ops-m2-epreuve.txt";

/**
 * LE CONTENU FABRIQUÉ, ET IL EST UNIQUE PAR EXÉCUTION.
 *
 * ⚠️ **L'UNICITÉ EST CE QUI REND ④ CONCLUANTE.** Sans marqueur, une pièce jointe
 *    relue portant le bon nom et la bonne taille pourrait être celle d'une
 *    exécution précédente — et l'on conclurait « la combinaison marche » sur un
 *    reliquat. Avec marqueur, l'empreinte du contenu tranche.
 */
export function contenuFabrique(marqueur: string): string {
  return (
    "Fichier d'épreuve de la mesure M2 du socle axion-ops.\n" +
    `Marqueur unique : ${marqueur}\n` +
    "Aucune donnée personnelle, aucun secret, aucun contenu métier.\n" +
    "Il est destiné à être mis à la corbeille avec le brouillon qui le porte.\n"
  );
}

/** Le triplet que Zoho rend, tel qu'il devra être recopié dans le `POST /messages`. */
export interface ReferenceDePiece {
  readonly storeName: string;
  readonly attachmentPath: string;
  readonly attachmentName: string;
}

/**
 * LIT LE TRIPLET DANS LA RÉPONSE, QUELLE QUE SOIT SA PROFONDEUR.
 *
 * Zoho rend selon l'endpoint un objet ou un tableau à un élément. Les deux
 * formes sont acceptées, et le relevé dit laquelle est arrivée — c'est une
 * information dont l'adaptateur aura besoin, pas un détail d'analyse.
 */
export function lireLaReference(charge: unknown): ReferenceDePiece | null {
  const donnees = donneesDeLEnveloppe(charge);
  const candidats: readonly unknown[] = Array.isArray(donnees) ? tableau(donnees) : [donnees];
  for (const candidat of candidats) {
    const storeName = champTexte(candidat, "storeName");
    const attachmentPath = champTexte(candidat, "attachmentPath");
    const attachmentName = champTexte(candidat, "attachmentName");
    if (storeName !== null && attachmentPath !== null && attachmentName !== null) {
      return { storeName, attachmentPath, attachmentName };
    }
  }
  return null;
}

/** La taille que Zoho annonce, quand il l'annonce. */
function tailleAnnoncee(charge: unknown): number | null {
  const donnees = donneesDeLEnveloppe(charge);
  const candidats: readonly unknown[] = Array.isArray(donnees) ? tableau(donnees) : [donnees];
  for (const candidat of candidats) {
    const taille = champNombre(candidat, "attachmentSize") ?? champNombre(candidat, "size");
    if (taille !== null) return taille;
  }
  return null;
}

let jetonEnCours: ValeurSecrete | undefined;

export async function sonder(): Promise<Releve> {
  const acces = await obtenirJetonDAcces();
  jetonEnCours = acces.jeton;

  const relais = lireLeRelais();
  const accountId = exigerDuRelais(relais, "accountId", "la sonde ① (`sonde-01-abonnement.ts`)");

  const marqueur = new Date().toISOString().replace(/[:.]/gu, "-");
  const contenu = contenuFabrique(marqueur);
  const octets = Buffer.byteLength(contenu, "utf8");
  const empreinte = empreinteDuCorps(contenu);

  const appels: AppelObserve[] = [];
  const questions: Question[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  //  Q1 · LE TÉLÉVERSEMENT, PAR L'UNE DES DEUX FORMES DOCUMENTÉES
  // ─────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ DEUX FORMES, ESSAYÉES DANS L'ORDRE, ET LE RELEVÉ DIT LAQUELLE A RÉPONDU.
  //    La documentation de Zoho décrit un corps BRUT avec le nom du fichier en
  //    paramètre de requête, et un mode `multipart`. Choisir l'un des deux sur
  //    ma lecture referait le défaut du § 27 — un endpoint spécifié sans avoir
  //    été appelé. On s'arrête au premier succès : insister après un 200
  //    téléverserait un second fichier, donc un second effet.
  const base = urlDuCompte(relais, accountId, "/messages/attachments");

  const brut = await appeler(
    acces.jeton,
    "POST",
    `${base}?fileName=${encodeURIComponent(NOM_DU_FICHIER)}&isInline=false`,
    { corps: contenu, contentType: "application/octet-stream" },
  );
  appels.push(brut);

  let retenu: AppelObserve = brut;
  if (brut.code !== 200) {
    const formulaire = new FormData();
    formulaire.append("attach", new Blob([contenu], { type: "text/plain" }), NOM_DU_FICHIER);
    // ⚠️ PAS DE `contentType` ICI : `fetch` doit poser lui-même la frontière
    //    multipart. L'écrire à la main produit un corps que le serveur ne sait
    //    pas découper, et un 400 qu'on lirait comme « le multipart n'est pas
    //    accepté » — une conclusion fausse tirée d'une erreur de la sonde.
    const multipart = await appeler(acces.jeton, "POST", `${base}?uploadType=multipart`, {
      corps: formulaire,
    });
    appels.push(multipart);
    if (multipart.code === 200) retenu = multipart;
  }

  const reference = lireLaReference(retenu.charge);
  const taille = tailleAnnoncee(retenu.charge);

  questions.push({
    question: "Une pièce jointe se téléverse-t-elle, et par quelle forme d'appel ?",
    verdict: retenu.code === 200 && reference !== null ? "ÉTABLI" : "RÉFUTÉ",
    constat:
      `${String(appels.length)} forme(s) essayée(s) · retenue : ${retenu.url} → HTTP ` +
      `${String(retenu.code)} · ${String(octets)} octets envoyés, ` +
      `${taille === null ? "taille non annoncée" : `${String(taille)} annoncés`} · ` +
      (reference === null
        ? "AUCUN triplet `storeName` / `attachmentPath` / `attachmentName` dans la réponse."
        : `triplet complet reçu (attachmentName « ${reference.attachmentName} »).`),
    decide:
      retenu.code === 200 && reference !== null
        ? "`zoho.mail.attachment_*` a un endpoint et une forme d'appel. Reste la question qui " +
          "décide : ce triplet survit-il à la relecture d'un brouillon ? — sonde ⑤, Q5."
        : "le téléversement n'a pas de forme d'appel utilisable. Le § 27 laissait déjà " +
          "`attachment_*` « à arbitrer » ; ce relevé le tranche par la négative, et l'unique " +
          "critère de fin du lot 6 (sonde ④) devient inatteignable.",
    appuis: appels,
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Q2 · LA TAILLE ANNONCÉE CORRESPOND-ELLE À CE QU'ON A ENVOYÉ ?
  // ─────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ **CE N'EST PAS UN DÉTAIL.** Un ré-encodage silencieux — base64, saut de
  //    ligne réécrit — changerait le fichier, donc son empreinte, et ④ ne
  //    pourrait plus prouver que la pièce relue est la même. Mesurer la taille
  //    ici sépare « Zoho a bien reçu mes octets » de « ④ a échoué ».
  if (taille !== null) {
    questions.push({
      question: "Zoho annonce-t-il la taille exacte du fichier envoyé ?",
      verdict: taille === octets ? "ÉTABLI" : "INDÉCIS",
      constat:
        `${String(octets)} octets envoyés, ${String(taille)} annoncés ` +
        `(écart : ${String(taille - octets)}).`,
      decide:
        taille === octets
          ? "le fichier n'est pas transformé au téléversement. L'empreinte calculée avant " +
            "l'envoi reste comparable."
          : "un écart de taille signale une transformation. Ne concluez PAS un échec de ④ sur " +
            "l'empreinte du contenu tant que cet écart n'est pas expliqué — ce serait imputer " +
            "à la combinaison un défaut du téléversement.",
      appuis: [],
    });
  }

  if (reference !== null) {
    const chemin = ecrireLeRelais({
      pieceJointe: { ...reference, empreinteDuContenu: empreinte, octets },
    });
    process.stdout.write(`[relais] référence de la pièce jointe posée dans ${chemin}\n`);
    process.stdout.write(
      "[⚠️] Lancez la sonde ④ SANS TARDER : la zone de dépôt d'une pièce téléversée mais " +
        "jamais attachée a une durée de vie que Zoho ne documente pas. Un ④ lancé le " +
        "lendemain mesurerait une expiration, pas la combinaison.\n",
    );
  }

  return {
    sonde: "③",
    titre: "le téléversement d'une pièce jointe, et la forme de sa référence",
    date: new Date().toISOString(),
    questions,
    appelsFaits: appels.length,
    plancherDAppels: 1,
  };
}

if (estLePointDEntree(import.meta.url)) {
  await lancer(sonder, () => jetonEnCours);
}
