/**
 * `sonde-05-envoi.ts` — **« RELIRE-PUIS-ENVOYER » EST-IL IMPLÉMENTABLE ?**
 *
 * ═══ CE QUE LE § 27 A DÉCIDÉ, ET CE QUI N'A PAS ÉTÉ MESURÉ ═══
 *
 * La v5 posait que `zoho.mail.send` « n'accepte qu'un `draftId` » — c'était
 * **tout le garde-fou d'envoi**. L'audit a constaté qu'**aucun endpoint Zoho
 * n'envoie un brouillon enregistré**, et le § 27 a remplacé le mécanisme :
 *
 * > `send` prend un `draftId`, **relit le brouillon chez Zoho**, **recompare son
 * > empreinte** à celle enregistrée à la création, et n'envoie que si elle
 * > correspond. Un brouillon modifié entre-temps est refusé.
 *
 * ⚠️ **LE REMPLACEMENT N'A PAS ÉTÉ MESURÉ NON PLUS.** Il repose sur une
 *    propriété que personne n'a vérifiée : *la relecture d'un brouillon chez
 *    Zoho rend un document stable et fidèle*. Si elle ne la vérifie pas, le
 *    garde-fou de remplacement échoue exactement comme celui qu'il remplace —
 *    et pour la même raison : une spécification écrite sans avoir appelé.
 *
 * ═══ LES CINQ QUESTIONS, ET POURQUOI CHACUNE EXISTE ═══
 *
 * **Q1 · Le § 27 a-t-il raison — aucun endpoint n'envoie un brouillon
 * enregistré ?** Le constat de l'audit est **une lecture de documentation**.
 * Cette question l'établit par l'appel : les formes plausibles sont toutes
 * tentées, et leurs refus sont le relevé.
 *
 * **Q2 · L'aller-retour est-il l'identité ?** `empreinte(posté)` contre
 * `empreinte(relu immédiatement)`. ⚠️ **C'est la question qui décide SUR QUOI
 * l'empreinte se prend.** Si Zoho réécrit le corps au passage — enveloppe HTML,
 * fins de ligne, encodage —, alors enregistrer l'empreinte de ce qu'on a POSTÉ
 * fait **refuser tous les envois**, y compris les légitimes. La conclusion
 * n'est pas « ça ne marche pas » : c'est « l'empreinte de référence doit être
 * celle de la PREMIÈRE RELECTURE, pas celle du corps posté ». Sans cette
 * mesure, l'adaptateur serait écrit sur le corps posté, et le défaut
 * n'apparaîtrait qu'en service.
 *
 * **Q3 · La relecture est-elle déterministe ?** Deux relectures du **même
 * brouillon non modifié** doivent rendre la même empreinte. Si un horodatage,
 * un identifiant de suivi ou un ordre de champs varie, l'empreinte varie sans
 * qu'on ait touché à rien, et « refuser un brouillon modifié » devient « refuser
 * tout brouillon ».
 *
 * **Q4 · LE TÉMOIN — l'empreinte change-t-elle quand le brouillon change ?**
 * ⚠️ **SANS CETTE QUESTION, LES TROIS AUTRES SONT VERTES POUR RIEN.** Une garde
 *    qui ne peut pas échouer n'existe pas. Q2 et Q3 mesurent la STABILITÉ ; une
 *    relecture qui rendrait toujours la même chose — un cache, un rendu
 *    normalisé, un corps vide — les satisferait TOUTES LES DEUX en ne détectant
 *    plus aucune modification. Q4 fabrique la modification et exige que
 *    l'empreinte bouge. C'est la seule des cinq qui prouve que le garde-fou
 *    GARDE quelque chose.
 *
 * **Q5 · Les pièces jointes sont-elles re-postables telles quelles ?**
 * « Relire-puis-envoyer » veut dire reconstruire le message à partir de ce
 * qu'on a relu. Si la relecture ne rend pas le triplet `storeName` /
 * `attachmentPath` / `attachmentName`, l'envoi devra re-téléverser la pièce —
 * et enverra donc un message qui n'est **pas** celui que l'humain a relu. Le
 * garde-fou du § 27 couvrirait alors le corps et pas les pièces, ce qu'il ne
 * dit nulle part.
 *
 * ═══ LES QUATRE PHASES, ET POURQUOI ELLES SONT SÉPARÉES ═══
 *
 *     --phase=reference   crée le brouillon, mesure Q2, Q3 et Q5
 *     --phase=stabilite   relit plus tard, sans rien modifier — Q3 dans le temps
 *     --phase=temoin      relit APRÈS une modification humaine — Q4
 *     --phase=envoi       tente Q1
 *
 * ⚠️ **Q4 EXIGE UN GESTE HUMAIN, ET CE N'EST PAS UNE FAIBLESSE DE LA SONDE.**
 *    Modifier le brouillon par l'API mesurerait la fidélité de l'API à
 *    elle-même. Le mode de défaillance que le § 27 vise est « quelqu'un a
 *    retouché le brouillon dans l'interface web entre la préparation et
 *    l'envoi ». Le témoin doit donc passer par l'interface web, et la sonde le
 *    demande explicitement.
 */

import {
  REGLAGES,
  type AppelObserve,
  type Question,
  type Releve,
  type ValeurSecrete,
  appeler,
  champTexte,
  comparerLesCorps,
  corpsDuMessage,
  donneesDeLEnveloppe,
  drapeau,
  ecrireLeRelais,
  empreinteDuCorps,
  essayerLesCandidats,
  estLePointDEntree,
  exigerDuRelais,
  exigerReglage,
  lancer,
  lireLeRelais,
  lireOption,
  obtenirJetonDAcces,
  tableau,
  urlDuCompte,
  type Relais,
} from "./commun.js";

/** Les quatre phases. Une phase inconnue est un refus, jamais un défaut silencieux. */
const PHASES = ["reference", "stabilite", "temoin", "envoi"] as const;
type Phase = (typeof PHASES)[number];

function phaseDemandee(): Phase {
  const brut = lireOption("phase") ?? "reference";
  const trouvee = PHASES.find((p) => p === brut);
  if (trouvee === undefined) {
    throw new Error(
      `phase « ${brut} » inconnue. Les quatre phases, dans l'ordre : ${PHASES.join(", ")}. ` +
        "Voyez `README.md`, § « La sonde ⑤, phase par phase ».",
    );
  }
  return trouvee;
}

/** Relit le corps d'un brouillon, par la forme d'URL qui répond. */
async function relire(
  jeton: ValeurSecrete,
  relais: Relais,
  accountId: string,
  dossier: string,
  messageId: string,
): Promise<{ readonly appels: readonly AppelObserve[]; readonly retenu: AppelObserve | null }> {
  const essai = await essayerLesCandidats(jeton, "GET", [
    urlDuCompte(relais, accountId, `/folders/${dossier}/messages/${messageId}/content`),
    urlDuCompte(relais, accountId, `/messages/${messageId}/content`),
  ]);
  return { appels: essai.tentatives, retenu: essai.retenu };
}

let jetonEnCours: ValeurSecrete | undefined;

export async function sonder(): Promise<Releve> {
  const phase = phaseDemandee();
  const acces = await obtenirJetonDAcces();
  jetonEnCours = acces.jeton;

  const relais = lireLeRelais();
  const accountId = exigerDuRelais(relais, "accountId", "la sonde ① (`sonde-01-abonnement.ts`)");
  const dossier = exigerDuRelais(
    relais,
    "folderIdBrouillons",
    "la sonde ② (`sonde-02-brouillon.ts`)",
  );

  const appels: AppelObserve[] = [];
  const questions: Question[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASE « reference » — Q2, Q3 et Q5
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === "reference") {
    const expediteur = exigerReglage(REGLAGES.expediteur);
    const destinataire = exigerReglage(REGLAGES.destinataire);
    if (!drapeau("je-possede-le-destinataire")) {
      throw new Error(
        "refus de partir sans `--je-possede-le-destinataire` : cette phase poste un brouillon, " +
          "et le mode de défaillance de `mode` est l'ENVOI (sonde ②).",
      );
    }

    const marque = new Date().toISOString().replace(/[:.]/gu, "-");
    // ⚠️ LE CORPS PORTE DÉLIBÉRÉMENT LES TROIS CARACTÈRES QUI SE RÉÉCRIVENT :
    //    un retour chariot, une espace en fin de ligne, et un caractère accentué
    //    hors ASCII. Si Zoho normalise, c'est ici qu'on le verra — un corps
    //    ASCII sur une seule ligne aurait rendu Q2 verte en ne mesurant rien.
    const corpsPoste =
      `Épreuve M2 · sonde ⑤ · marqueur ${marque}\r\n` +
      "Ligne avec une espace finale. \r\n" +
      "Ligne accentuée : à é î ô ù — et un tiret cadratin.\r\n";

    const creation = await appeler(
      acces.jeton,
      "POST",
      urlDuCompte(relais, accountId, "/messages"),
      {
        corps: JSON.stringify({
          fromAddress: expediteur,
          toAddress: destinataire,
          subject: `[axion-ops M2] sonde ⑤ empreinte — ${marque}`,
          content: corpsPoste,
          mailFormat: "plaintext",
          mode: "draft",
        }),
        contentType: "application/json",
      },
    );
    appels.push(creation);
    const messageId =
      champTexte(donneesDeLEnveloppe(creation.charge), "messageId") ??
      champTexte(donneesDeLEnveloppe(creation.charge), "draftId");

    if (messageId === null) {
      questions.push({
        question: "Le brouillon de référence a-t-il été créé ?",
        verdict: "RÉFUTÉ",
        constat: `HTTP ${String(creation.code)}, aucun identifiant rendu.`,
        decide: "aucune des cinq questions de cette sonde ne peut être posée. Reprenez la sonde ②.",
        appuis: [creation],
      });
      return releve(phase, questions, appels);
    }

    const premiere = await relire(acces.jeton, relais, accountId, dossier, messageId);
    appels.push(...premiere.appels);
    const seconde = await relire(acces.jeton, relais, accountId, dossier, messageId);
    appels.push(...seconde.appels);

    // ─── Q2 · l'aller-retour est-il l'identité ? ───────────────────────────
    if (premiere.retenu === null) {
      questions.push({
        question: "Le brouillon se relit-il ?",
        verdict: "RÉFUTÉ",
        constat: "aucune forme de relecture n'a rendu 200.",
        decide:
          "⛔ « RELIRE-PUIS-ENVOYER » N'A PAS DE PREMIER TEMPS. Le § 27 est à repenser : le " +
          "garde-fou de remplacement suppose une relecture qui n'existe pas.",
        appuis: premiere.appels,
      });
      return releve(phase, questions, appels);
    }

    const relu = corpsDuMessage(premiere.retenu);
    const aller = comparerLesCorps(corpsPoste, relu.texte);

    questions.push({
      question:
        "Q2 · L'aller-retour est-il l'identité — le corps relu est-il celui qui a été posté ?",
      verdict: aller.identiques
        ? "ÉTABLI"
        : aller.identiquesApresNormalisation
          ? "INDÉCIS"
          : "RÉFUTÉ",
      constat:
        `source du corps relu : ${relu.source} · ${String(aller.octetsA)} octets postés contre ` +
        `${String(aller.octetsB)} relus · identiques : ${aller.identiques ? "OUI" : "non"} · ` +
        `identiques après normalisation des fins de ligne : ` +
        `${aller.identiquesApresNormalisation ? "OUI" : "non"}` +
        (aller.premierEcart === null
          ? "."
          : ` · premier écart au caractère ${String(aller.premierEcart)} :\n` +
            `         posté  ⟨${aller.voisinageA}⟩\n         relu   ⟨${aller.voisinageB}⟩`),
      decide: aller.identiques
        ? "l'empreinte de référence PEUT être prise sur le corps posté, comme le § 27 l'écrit " +
          "(« enregistre l'empreinte du corps, que `send` recomparera »)."
        : aller.identiquesApresNormalisation
          ? "⚠️ LE § 27 EST À AMENDER, PAS À ABANDONNER. Zoho réécrit les fins de ligne. " +
            "Deux corrections possibles, et la seconde est la bonne : normaliser avant de " +
            "hacher AFFAIBLIT la garde (une modification limitée aux blancs cesserait d'être " +
            "vue) ; prendre l'empreinte de référence sur la PREMIÈRE RELECTURE, et non sur le " +
            "corps posté, ne l'affaiblit pas du tout. `draft_create` doit donc relire ce " +
            "qu'il vient d'écrire — un appel de plus, écrit dans le § 27."
          : "⛔ ZOHO TRANSFORME LE CORPS AU-DELÀ DES BLANCS. L'empreinte du corps posté est " +
            "inutilisable. Regardez le voisinage ci-dessus AVANT de conclure : une enveloppe " +
            "HTML ajoutée au rendu se corrige en prenant l'empreinte sur la première " +
            "relecture ; un horodatage inséré dans le corps rendrait Q3 rouge aussi, et là " +
            "aucune empreinte sur ce document ne peut servir — il faudrait chercher un autre " +
            "porteur (le message original RFC 822, à mesurer).",
      appuis: [...premiere.appels],
    });

    // ─── Q3 · la relecture est-elle déterministe ? ─────────────────────────
    if (seconde.retenu !== null) {
      const relu2 = corpsDuMessage(seconde.retenu);
      const stable = comparerLesCorps(relu.texte, relu2.texte);
      questions.push({
        question:
          "Q3 · Deux relectures consécutives du MÊME brouillon non modifié rendent-elles la " +
          "même empreinte ?",
        verdict: stable.identiques ? "ÉTABLI" : "RÉFUTÉ",
        constat:
          `empreinte 1 ${stable.empreinteA.slice(0, 16)}… · empreinte 2 ` +
          `${stable.empreinteB.slice(0, 16)}… · ` +
          (stable.identiques
            ? "identiques."
            : `DIFFÉRENTES, premier écart au caractère ${String(stable.premierEcart ?? -1)} :\n` +
              `         lecture 1 ⟨${stable.voisinageA}⟩\n         lecture 2 ⟨${stable.voisinageB}⟩`),
        decide: stable.identiques
          ? "la relecture est déterministe à l'échelle de la seconde. La phase `stabilite` " +
            "l'éprouve à l'échelle de l'heure — c'est là que se voient les horodatages."
          : "⛔ LE MÉCANISME DU § 27 EST INAPPLICABLE SUR CE DOCUMENT. Une empreinte qui bouge " +
            "sans qu'on ait rien touché refuse TOUS les envois, y compris légitimes. Le " +
            "correctif n'est pas de tolérer l'écart — ce serait rouvrir la porte que la garde " +
            "ferme — mais de hacher un sous-ensemble STABLE du document, ce qui exige de " +
            "savoir lequel, donc une mesure de plus.",
        appuis: seconde.appels,
      });
    }

    // ─── Q5 · les pièces jointes sont-elles re-postables ? ─────────────────
    const avecPiece = relais.brouillonAvecPiece;
    if (avecPiece === undefined) {
      questions.push({
        question: "Q5 · La relecture rend-elle une pièce jointe SOUS UNE FORME RE-POSTABLE ?",
        verdict: "INDÉCIS",
        constat: "le relais ne porte pas de brouillon avec pièce jointe.",
        decide:
          "lancez la sonde ④ avant celle-ci. Sans Q5, on ne saura pas si « relire-puis-" +
          "envoyer » couvre les pièces jointes ou seulement le corps — et le § 27 ne le dit " +
          "nulle part.",
        appuis: [],
      });
    } else {
      const infos = await essayerLesCandidats(acces.jeton, "GET", [
        urlDuCompte(relais, accountId, `/folders/${dossier}/messages/${avecPiece}/attachmentinfo`),
        urlDuCompte(relais, accountId, `/messages/${avecPiece}/attachmentinfo`),
      ]);
      appels.push(...infos.tentatives);
      const donnees = donneesDeLEnveloppe(infos.retenu?.charge);
      const entrees: readonly unknown[] = Array.isArray(donnees) ? tableau(donnees) : [donnees];
      const repostables = entrees.filter(
        (e) => champTexte(e, "storeName") !== null && champTexte(e, "attachmentPath") !== null,
      );

      questions.push({
        question:
          "Q5 · La relecture d'un brouillon rend-elle ses pièces jointes sous une forme " +
          "RE-POSTABLE (`storeName` + `attachmentPath`) ?",
        verdict: infos.retenu === null ? "INDÉCIS" : repostables.length > 0 ? "ÉTABLI" : "RÉFUTÉ",
        constat:
          infos.retenu === null
            ? "aucune forme de lecture des métadonnées n'a répondu."
            : `${String(entrees.length)} pièce(s) relue(s), dont ` +
              `${String(repostables.length)} portant le triplet complet.`,
        decide:
          repostables.length > 0
            ? "`send` peut reconstruire à l'identique le message que l'humain a relu, pièces " +
              "comprises. Le garde-fou du § 27 couvre alors tout le message."
            : "⚠️ LE GARDE-FOU NE COUVRE QUE LE CORPS. `send` devra re-téléverser la pièce, " +
              "donc envoyer un message qui n'est pas exactement celui qui a été relu. Ce " +
              "n'est pas rédhibitoire, mais **le § 27 doit l'écrire** : aujourd'hui il laisse " +
              "croire que « relire-puis-envoyer » couvre le message entier. À défaut, " +
              "restreindre `send` aux brouillons sans pièce jointe.",
        appuis: infos.tentatives,
      });
    }

    const chemin = ecrireLeRelais({
      brouillonDeLEmpreinte: messageId,
      empreinteDuCorpsPoste: empreinteDuCorps(corpsPoste),
      empreinteRelueAT0: empreinteDuCorps(relu.texte),
    });
    process.stdout.write(`[relais] empreintes de référence posées dans ${chemin}\n`);
    process.stdout.write(
      "\n[à faire maintenant, dans cet ordre]\n" +
        `  1. \`--phase=stabilite\` dans une heure, SANS toucher au brouillon « ${messageId} » ;\n` +
        "  2. ouvrez ce brouillon dans l'interface web, changez UN caractère, enregistrez ;\n" +
        "  3. `--phase=temoin` — l'empreinte DOIT avoir changé. Si elle n'a pas changé, le\n" +
        "     garde-fou du § 27 ne garde rien, et les questions Q2 et Q3 étaient vertes pour\n" +
        "     rien.\n\n",
    );
    return releve(phase, questions, appels);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASES « stabilite » ET « temoin » — Q3 dans le temps, puis Q4
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === "stabilite" || phase === "temoin") {
    const messageId = exigerDuRelais(
      relais,
      "brouillonDeLEmpreinte",
      "la sonde ⑤ en `--phase=reference`",
    );
    const referenceT0 = exigerDuRelais(
      relais,
      "empreinteRelueAT0",
      "la sonde ⑤ en `--phase=reference`",
    );

    const lecture = await relire(acces.jeton, relais, accountId, dossier, messageId);
    appels.push(...lecture.appels);

    if (lecture.retenu === null) {
      questions.push({
        question: "Le brouillon de référence se relit-il encore ?",
        verdict: "RÉFUTÉ",
        constat: "aucune forme de relecture n'a répondu.",
        decide: "reprenez `--phase=reference` : le brouillon a peut-être été supprimé.",
        appuis: lecture.appels,
      });
      return releve(phase, questions, appels);
    }

    const relu = corpsDuMessage(lecture.retenu);
    const maintenant = empreinteDuCorps(relu.texte);
    const inchangee = maintenant === referenceT0;

    if (phase === "stabilite") {
      questions.push({
        question:
          "Q3 (dans le temps) · L'empreinte d'un brouillon NON MODIFIÉ est-elle la même " +
          "qu'à sa création ?",
        verdict: inchangee ? "ÉTABLI" : "RÉFUTÉ",
        constat:
          `référence ${referenceT0.slice(0, 16)}… · maintenant ${maintenant.slice(0, 16)}… · ` +
          `${inchangee ? "identiques" : "DIFFÉRENTES sans qu'aucune modification ait eu lieu"}.`,
        decide: inchangee
          ? "l'empreinte survit au temps. C'est la condition que « recomparer avant d'envoyer » " +
            "exige, et elle est remplie."
          : "⛔ L'EMPREINTE DÉRIVE TOUTE SEULE. Un brouillon préparé le matin serait refusé " +
            "l'après-midi. Le § 27 est inapplicable en l'état sur ce document : il faut " +
            "identifier ce qui varie (regardez le voisinage rendu par `--phase=reference`) et " +
            "hacher un sous-ensemble stable — ce qui est une décision d'architecture, pas un " +
            "réglage.",
        appuis: lecture.appels,
      });
      return releve(phase, questions, appels);
    }

    // ─── Q4 · LE TÉMOIN ────────────────────────────────────────────────────
    questions.push({
      question:
        "Q4 · LE TÉMOIN — après une modification HUMAINE du brouillon dans l'interface web, " +
        "l'empreinte a-t-elle changé ?",
      verdict: inchangee ? "RÉFUTÉ" : "ÉTABLI",
      constat:
        `référence ${referenceT0.slice(0, 16)}… · après modification ` +
        `${maintenant.slice(0, 16)}… · ` +
        (inchangee
          ? "IDENTIQUES. Soit la modification n'a pas été enregistrée, soit la relecture ne " +
            "la voit pas."
          : "différentes, comme le § 27 l'exige."),
      decide: inchangee
        ? "⛔ **LE GARDE-FOU NE GARDE RIEN, ET LES QUESTIONS Q2 ET Q3 ÉTAIENT VERTES POUR " +
          "RIEN.** Une garde qui ne peut pas échouer n'existe pas : si l'empreinte ne bouge " +
          "pas quand le brouillon bouge, « recomparer son empreinte avant d'envoyer » " +
          "autorise tous les envois. AVANT de conclure, vérifiez la seule autre explication : " +
          "la modification a-t-elle bien été ENREGISTRÉE dans l'interface web ? Si oui, le " +
          "§ 27 est à repenser entièrement — c'est le deuxième mécanisme d'envoi qui tombe."
        : "✅ le garde-fou détecte ce qu'il prétend détecter. Combiné à Q2 et Q3, " +
          "« relire-puis-envoyer » est implémentable, et le § 27 tient sur son point le plus " +
          "fragile.",
      appuis: lecture.appels,
    });
    return releve(phase, questions, appels);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASE « envoi » — Q1
  // ═══════════════════════════════════════════════════════════════════════════
  const messageId = exigerDuRelais(
    relais,
    "brouillonDeLEmpreinte",
    "la sonde ⑤ en `--phase=reference`",
  );

  if (!drapeau("autoriser-un-envoi-vers-moi")) {
    throw new Error(
      "refus de partir sans `--autoriser-un-envoi-vers-moi`. Cette phase TENTE d'envoyer un " +
        "brouillon : la question posée est justement « l'une de ces formes envoie-t-elle ? », " +
        "et une réponse positive est un courrier parti. Le brouillon de référence est adressé " +
        `à \`${REGLAGES.destinataire}\` ; le drapeau atteste que cette adresse est la vôtre. ` +
        "Le § 20 appelle cela un effet extérieur, et une mesure ne s'en autorise pas seule.",
    );
  }

  // ⚠️ **LES FORMES SONT ÉNUMÉRÉES, ET LE RELEVÉ LES NOMME TOUTES.** Le constat
  //    de l'audit — « aucun endpoint Zoho n'envoie un brouillon enregistré » —
  //    est une absence. Une absence ne se prouve pas ; ce qui se prouve est
  //    « ces N formes-ci ont été appelées, et voici leurs refus ». Le relevé
  //    écrit donc le nombre de formes tentées : une conclusion tirée de deux
  //    formes ne vaut pas une conclusion tirée de cinq, et personne ne peut le
  //    savoir si le compte n'est pas écrit.
  const url = urlDuCompte(relais, accountId, "/messages");
  const formes: readonly { readonly nom: string; readonly corps: Record<string, unknown> }[] = [
    { nom: "mode:send + messageId", corps: { mode: "send", messageId } },
    { nom: "mode:send + draftId", corps: { mode: "send", draftId: messageId } },
    { nom: "mode:sendDraft + messageId", corps: { mode: "sendDraft", messageId } },
    { nom: "messageId seul, sans mode", corps: { messageId } },
  ];

  const tentatives: AppelObserve[] = [];
  for (const forme of formes) {
    const appel = await appeler(acces.jeton, "POST", url, {
      corps: JSON.stringify(forme.corps),
      contentType: "application/json",
    });
    tentatives.push(appel);
    appels.push(appel);
    // ⚠️ ON S'ARRÊTE AU PREMIER SUCCÈS. Continuer après un 200 enverrait le
    //    courrier une seconde fois — un effet extérieur de plus, pour aucune
    //    information de plus.
    if (appel.code === 200) break;
  }
  const reussite = tentatives.find((t) => t.code === 200) ?? null;

  questions.push({
    question:
      "Q1 · Le § 27 a-t-il raison — AUCUN endpoint Zoho n'envoie un brouillon déjà enregistré ?",
    verdict: reussite === null ? "ÉTABLI" : "RÉFUTÉ",
    constat:
      `${String(tentatives.length)} forme(s) tentée(s) sur ${String(formes.length)} énumérées : ` +
      tentatives
        .map((t, i) => `${formes[i]?.nom ?? "?"} → ${String(t.code)}/${t.erreurZoho ?? "—"}`)
        .join(" · ") +
      (reussite === null
        ? ". Aucune n'a abouti."
        : ". ⚠️ UNE A ABOUTI — un courrier est parti vers votre propre adresse."),
    decide:
      reussite === null
        ? "le constat de l'audit est confirmé PAR L'APPEL, et non plus par la lecture de la " +
          "documentation. La correction bloquante n° 10 du § 27 est fondée, et " +
          "« relire-puis-envoyer » reste le seul mécanisme disponible — sa faisabilité se lit " +
          "en Q2, Q3, Q4 et Q5. ⚠️ BORNE : ceci prouve que ces formes-CI ne fonctionnent pas, " +
          "pas qu'aucune n'existe."
        : "🔄 LE § 27 PEUT ÊTRE SIMPLIFIÉ, ET LA v5 AVAIT RAISON SUR CE POINT. Un endpoint " +
          "envoie bien un brouillon par son identifiant : `send` peut n'accepter qu'un " +
          "`draftId` sans jamais reconstruire le message, ce qui est un garde-fou plus fort " +
          "que « relire-puis-envoyer » — il n'y a plus de fenêtre entre la relecture et " +
          "l'envoi. Rouvrez la correction bloquante n° 10 avec CE relevé.",
    appuis: tentatives,
  });

  return releve(phase, questions, appels);
}

function releve(
  phase: Phase,
  questions: readonly Question[],
  appels: readonly AppelObserve[],
): Releve {
  return {
    sonde: `⑤ (phase « ${phase} »)`,
    titre: "« relire-puis-envoyer » du § 27 est-il implémentable ?",
    date: new Date().toISOString(),
    questions,
    appelsFaits: appels.length,
    // Une phase qui n'a fait aucun appel n'a rien mesuré. Le plancher est à 1
    // parce que les phases n'ont pas le même coût — et il n'est jamais à 0.
    plancherDAppels: 1,
  };
}

if (estLePointDEntree(import.meta.url)) {
  await lancer(sonder, () => jetonEnCours);
}
