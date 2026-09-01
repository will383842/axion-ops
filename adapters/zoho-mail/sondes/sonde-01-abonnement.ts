/**
 * `sonde-01-abonnement.ts` — **L'ABONNEMENT DONNE-T-IL ACCÈS À L'API REST ?**
 *
 * ═══ L'ENJEU, ET IL EST RÉEL ═══
 *
 * L'annexe A du cahier des charges porte DEUX lectures du plan Zoho :
 *
 *  · `axionia/src/lib/email/client.ts:24-26` — « plan payant Mail Lite », 16 août ;
 *  · `axionia/docs/runbooks/R28-dpa-renewal.md` — « Zoho Mail Free EU », 13 mai.
 *
 * ⚠️ **CE N'EST PAS UNE CONTRADICTION, C'EST UNE CHRONOLOGIE.** Le cahier des
 *    charges l'écrit lui-même, et en tire la seule conclusion qui tienne : cela
 *    « se tranche par M2, pas par la lecture ». Relire une troisième fois les
 *    deux fichiers ne produira jamais qu'une troisième lecture.
 *
 * ⚠️ **ET LA PLUS RÉCENTE DES DEUX N'EST PAS PLUS VRAIE POUR AUTANT.** L'annexe A
 *    dit de `client.ts:26` — la source du 16 août — que c'est « un commentaire,
 *    la catégorie de source que l'en-tête du même fichier accuse d'avoir menti
 *    deux fois ». Un commentaire écrit après un runbook n'est pas une mesure
 *    postérieure : c'est peut-être la recopie d'une croyance antérieure.
 *
 * ═══ CE QUE CETTE SONDE MESURE EN PLUS, ET POURQUOI ═══
 *
 * **L'HÔTE.** Le § 27 écrit `GET accounts.zoho.eu/api/accounts`. Chez Zoho,
 * `accounts.zoho.eu` sert l'autorisation et `mail.zoho.eu` sert l'API du
 * courrier. Le § 27 dit pourquoi cette colonne a été ajoutée : « son absence est
 * précisément ce qui a laissé passer le défaut de `send` ». Une colonne posée
 * pour empêcher un endpoint inexistant d'y figurer se **mesure**. Les deux
 * candidats sont donc interrogés, et les deux codes relevés.
 *
 * **LES IDENTITÉS D'EXPÉDITION.** Le § 27 fait de `zoho.mail.identities_list`
 * la source unique des `from` admissibles — « énumère au runtime, rien en dur,
 * tout `from` validé contre cette liste ». Cette réponse-ci EST cette liste. La
 * sonde la compte et dit combien sont **validées**, sans nommer aucune adresse.
 *
 * ⚠️ **AUCUNE ADRESSE NE PARAÎT EN CLAIR.** Un relevé finit collé dans un ADR
 *    d'un dépôt PUBLIC. `caviarderAdresse()` garde deux caractères et le
 *    domaine : assez pour distinguer deux alias quand on possède la boîte, rien
 *    pour qui ne la possède pas.
 */

import {
  candidatsPourLesComptes,
  regionEnVigueur,
  REGLAGES,
  type AppelObserve,
  type Question,
  type Releve,
  type ValeurSecrete,
  appeler,
  caviarderAdresse,
  champTexte,
  donneesDeLEnveloppe,
  ecrireLeRelais,
  estLePointDEntree,
  lancer,
  obtenirJetonDAcces,
  tableau,
} from "./commun.js";

/** Ce qu'on retient d'une identité d'expédition, sans son adresse. */
interface IdentiteObservee {
  readonly adresseCaviardee: string;
  readonly validee: boolean;
}

/**
 * LIT LES IDENTITÉS D'EXPÉDITION DU PREMIER COMPTE.
 *
 * ⚠️ **`sendMailDetails` EST UN NOM ATTENDU, PAS UN NOM CONNU.** La sonde le
 *    cherche, et si elle ne le trouve pas elle rend zéro identité — ce que le
 *    relevé affiche comme tel, avec la liste des clés RÉELLEMENT présentes.
 *    C'est la différence entre « il n'y a pas d'identité » et « je ne sais pas
 *    où Zoho les range », et les deux mènent à des décisions opposées.
 */
function identitesDuCompte(compte: unknown): readonly IdentiteObservee[] {
  if (compte === null || typeof compte !== "object") return [];
  const brut: unknown = (compte as Record<string, unknown>)["sendMailDetails"];
  return tableau(brut).map((entree) => {
    const adresse = champTexte(entree, "fromAddress") ?? champTexte(entree, "displayName");
    const validee =
      entree !== null &&
      typeof entree === "object" &&
      (entree as Record<string, unknown>)["validated"] === true;
    return {
      adresseCaviardee: adresse === null ? "«champ absent»" : caviarderAdresse(adresse),
      validee,
    };
  });
}

/** Les clés de premier niveau d'un objet — pour dire ce qu'on a VU, pas ce qu'on cherchait. */
function clesVues(valeur: unknown): readonly string[] {
  if (valeur === null || typeof valeur !== "object") return [];
  return Object.keys(valeur).sort();
}

let jetonEnCours: ValeurSecrete | undefined;

export async function sonder(): Promise<Releve> {
  const acces = await obtenirJetonDAcces();
  jetonEnCours = acces.jeton;

  const region = regionEnVigueur();
  const candidats = candidatsPourLesComptes(region);

  const appels: AppelObserve[] = [];
  for (const url of candidats) {
    appels.push(await appeler(acces.jeton, "GET", url));
  }

  const questions: Question[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  //  Q1 · QUEL HÔTE SERT L'API DU COURRIER ?
  // ─────────────────────────────────────────────────────────────────────────
  const repondants = appels.filter((appel) => appel.code === 200);
  const premierRepondant = repondants[0];

  questions.push({
    question:
      "Lequel des deux hôtes sert `GET /api/accounts` — `mail.zoho.eu` (documentation Zoho) " +
      "ou `accounts.zoho.eu` (§ 27, colonne « endpoint Zoho ») ?",
    verdict: repondants.length > 0 ? "ÉTABLI" : "RÉFUTÉ",
    constat:
      repondants.length === 0
        ? "aucun des deux hôtes n'a rendu 200. Ni l'un ni l'autre ne sert cette ressource " +
          "avec ce jeton."
        : `${String(repondants.length)} hôte(s) sur ${String(candidats.length)} ` +
          `ont rendu 200. Le premier est ${new URL(premierRepondant?.url ?? "https://x.invalid").origin}.`,
    decide:
      repondants.length === 0
        ? "on ne va pas plus loin : les sondes ② à ⑤ n'ont aucune racine d'API à interroger. " +
          "Reprendre le jeton et ses scopes AVANT de conclure quoi que ce soit sur le plan."
        : "la colonne « endpoint Zoho » du § 27 se corrige — ou se confirme — sur CE relevé, " +
          "et toutes les sondes suivantes partent de cet hôte-là.",
    appuis: appels,
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Q2 · L'ABONNEMENT DONNE-T-IL L'API REST ?
  // ─────────────────────────────────────────────────────────────────────────
  const refus = appels.filter((appel) => appel.code === 401 || appel.code === 403);
  const codesDErreur = [...new Set(appels.map((a) => a.erreurZoho).filter((e) => e !== null))];

  questions.push({
    question: "L'abonnement en cours donne-t-il accès à l'API REST du courrier ?",
    verdict: repondants.length > 0 ? "ÉTABLI" : refus.length > 0 ? "RÉFUTÉ" : "INDÉCIS",
    constat:
      repondants.length > 0
        ? "un 200 avec une charge exploitable : l'API REST répond à ce compte."
        : refus.length > 0
          ? `${String(refus.length)} refus d'autorisation. Codes internes relevés : ` +
            `${codesDErreur.length > 0 ? codesDErreur.join(", ") : "aucun"}. ` +
            "⚠️ UN 401/403 NE DIT PAS À LUI SEUL « PLAN INSUFFISANT » : il dit aussi bien " +
            "jeton expiré, scope manquant ou région erronée. C'est le `errorCode` ci-dessus " +
            "qui les sépare, et c'est ce relevé qui l'établit — il n'était pas connu d'avance."
          : "ni 200 ni refus d'autorisation : la réponse ne relève d'aucune des deux lectures.",
    decide:
      repondants.length > 0
        ? "la lecture « Zoho Mail Free EU » du 13 mai est périmée. Le lot 6 peut être planifié, " +
          "et le § 34 perd son risque « le plan Zoho ne donne pas l'API REST » sur ce point."
        : "le § 27 est à reprendre AVANT le lot 6. Deux issues seulement : passer le compte à " +
          "un plan qui ouvre l'API, ou renoncer à l'adaptateur courrier et retenir « la voie " +
          "plus courte » que le § 27 décrit — enrichir la notification de `contact@`, qui " +
          "résout le problème d'origine sans aucun serveur MCP.",
    appuis: repondants.length > 0 ? [] : appels,
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Q3 · LES IDENTITÉS D'EXPÉDITION — LA LISTE DU § 27
  // ─────────────────────────────────────────────────────────────────────────
  if (premierRepondant !== undefined) {
    const donnees = donneesDeLEnveloppe(premierRepondant.charge);
    const comptes = tableau(donnees);
    const compte = comptes[0];
    const accountId = champTexte(compte, "accountId");
    const identites = identitesDuCompte(compte);
    const validees = identites.filter((i) => i.validee);

    questions.push({
      question:
        "Le compte énumère-t-il ses identités d'expédition, et combien sont VALIDÉES ? " +
        "(§ 27 : « énumère au runtime, rien en dur, tout `from` validé contre cette liste »)",
      verdict: identites.length > 0 ? "ÉTABLI" : "INDÉCIS",
      constat:
        `${String(comptes.length)} compte(s) rendu(s) · accountId ` +
        `${accountId ?? "«absent»"} · ${String(identites.length)} identité(s), dont ` +
        `${String(validees.length)} validée(s) : ` +
        (identites.length === 0
          ? `aucune. Clés réellement présentes sur le compte : ${clesVues(compte).join(", ") || "aucune"}.`
          : identites
              .map((i) => `${i.adresseCaviardee}${i.validee ? " (validée)" : " (NON validée)"}`)
              .join(" · ")),
      decide:
        identites.length === 0
          ? "`zoho.mail.identities_list` n'a pas de source. Le § 27 exige que tout `from` soit " +
            "validé contre cette liste : sans elle, l'outil ne peut pas être écrit tel qu'il " +
            "est spécifié, et la sonde ⑤ ne saura pas quel expéditeur employer."
          : `l'expéditeur de l'essai (\`${REGLAGES.expediteur}\`) doit être l'une des ` +
            `${String(validees.length)} identité(s) validée(s). Un \`from\` hors liste est ` +
            "précisément ce que le § 27 fait refuser côté socle.",
      appuis: [],
    });

    if (accountId !== null) {
      const chemin = ecrireLeRelais({
        hoteQuiARepondu: new URL(premierRepondant.url).origin,
        accountId,
      });
      process.stdout.write(`[relais] hôte et accountId posés dans ${chemin}\n`);
    }
  }

  return {
    sonde: "①",
    titre: `l'abonnement donne-t-il accès à l'API REST, et sur quel hôte ? (région « ${region} »)`,
    date: new Date().toISOString(),
    questions,
    appelsFaits: appels.length,
    // Les DEUX candidats, toujours. Un seul appel voudrait dire qu'on a cru
    // savoir lequel des deux hôtes interroger — c'est ce qu'on refuse de faire.
    plancherDAppels: candidats.length,
  };
}

if (estLePointDEntree(import.meta.url)) {
  await lancer(sonder, () => jetonEnCours);
}
