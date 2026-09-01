/**
 * `adapters/zoho-mail/bootstrap/rappel.ts` — **LE SERVEUR QUI REÇOIT UN SEUL
 * CODE, PUIS S'ARRÊTE.**
 *
 * ═══ CE QU'IL EST, ET CE QU'IL N'EST PAS ═══
 *
 * Ce n'est pas un serveur : c'est **une boîte aux lettres à usage unique**, qui
 * vit le temps d'un clic. Elle n'écoute que la **boucle locale**, ne répond
 * qu'à **un seul chemin**, n'accepte qu'**une seule fois**, et meurt.
 *
 * ═══ LES QUATRE RÈGLES, CHACUNE AVEC SON MOTIF ═══
 *
 *  1. **BOUCLE LOCALE UNIQUEMENT.** Écouter sur `0.0.0.0` exposerait, le temps
 *     d'un amorçage, un point qui accepte un `code` OAuth à toute machine du
 *     réseau. La liste des hôtes est fermée et dérivée, jamais construite depuis
 *     l'URI.
 *  2. **LE `code` N'EST JAMAIS RÉÉCRIT DANS LA RÉPONSE.** La page rendue à Will
 *     est **statique**. Recopier un paramètre de requête dans du HTML est la
 *     forme la plus courante d'injection, et ici le paramètre en question est un
 *     jeton d'échange.
 *  3. **UN SEUL CODE.** Le premier rappel valide ferme la porte. Un second
 *     rappel — un rechargement de page, un préchargement du navigateur, un
 *     onglet resté ouvert — trouve porte close plutôt que de relancer un
 *     échange.
 *  4. **UNE ÉCHÉANCE.** Sans elle, un amorçage abandonné laisse un port ouvert
 *     et un processus vivant qui attend un clic qui ne viendra pas.
 *
 * ═══ LE PIÈGE QUI COÛTE UN QUART D'HEURE ═══
 *
 * ⚠️ **`localhost` N'EST PAS `127.0.0.1`.** L'URI déclarée à la console Zoho dit
 *    `localhost`, et Zoho la renvoie telle quelle au navigateur. Or sous Windows
 *    — et sous une bonne part des systèmes récents — `localhost` se résout
 *    **d'abord en `::1`**. Un serveur lié au seul `127.0.0.1` laisse alors le
 *    navigateur sur un « connexion refusée », **après** que Will a cliqué et
 *    **après** que Zoho a émis le code : le code est perdu, et il faut
 *    recommencer. D'où deux liaisons, `127.0.0.1` ET `::1`, et l'échec de l'une
 *    des deux qui n'est pas fatal — une machine sans IPv6 est légitime.
 *
 * ⚠️ **CE QUE LES GARDES DE CE DOSSIER MESURENT, ET CE QU'ELLES NE MESURENT
 *    PAS.** Elles éprouvent `interpreterLeRappel()` et les dérivations
 *    d'écoute — c'est-à-dire toute la logique. **Elles ne montent aucun
 *    serveur** : la consigne du chantier est « aucun appel réseau dans les
 *    tests », et une liaison de boucle locale en est un au sens strict. Les
 *    règles 1, 3 et 4 ci-dessus sont donc **relues, non mesurées**. La mesure
 *    qui les lèverait est nommée dans `DEPS.md`.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { egalesEnTempsConstant } from "../../../core/vault/index.js";

// ═════════════════════════════════════════════════════════════════════════════
//  OÙ ÉCOUTER — DÉRIVÉ DE L'URI, JAMAIS POSÉ À CÔTÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les hôtes de boucle locale sur lesquels la boîte aux lettres se pose.
 * **Fermée par construction** : rien de ce fichier ne peut y ajouter une adresse
 * routable.
 */
export const HOTES_DE_BOUCLE = ["127.0.0.1", "::1"] as const;

/** Les noms d'hôte qu'une URI de rappel LOCAL a le droit de porter. */
export const NOMS_DE_BOUCLE = ["localhost", "127.0.0.1", "[::1]", "::1"] as const;

/** Le port par défaut quand l'URI n'en porte pas, par schéma. */
const PORTS_PAR_SCHEMA: Readonly<Record<string, number>> = { "http:": 80, "https:": 443 };

/** Ce que l'URI de redirection dit du serveur à monter. */
export interface EcouteDerivee {
  readonly port: number;
  readonly chemin: string;
  readonly hotes: readonly string[];
}

export class ErreurDeRappel extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ErreurDeRappel";
  }
}

/**
 * **DÉRIVE LE PORT ET LE CHEMIN DE L'URI DE REDIRECTION.**
 *
 * ⚠️ Écrire `8787` une seconde fois quelque part serait la première divergence :
 *    le jour où l'URI change à la console Zoho, le navigateur irait sur un port
 *    et le programme écouterait sur l'autre, et le symptôme — « ça tourne dans
 *    le vide » — ne désignerait rien.
 */
export function deriverLEcoute(uriDeRedirection: string): EcouteDerivee {
  let uri: URL;
  try {
    uri = new URL(uriDeRedirection);
  } catch {
    throw new ErreurDeRappel(
      `L'URI de redirection « ${uriDeRedirection} » n'est pas une URL absolue.`,
    );
  }

  if (!(NOMS_DE_BOUCLE as readonly string[]).includes(uri.hostname)) {
    throw new ErreurDeRappel(
      `L'URI de redirection vise « ${uri.hostname} », qui n'est pas la boucle locale. ` +
        "Ce serveur ne se pose QUE sur la boucle locale : monter une écoute pour un autre " +
        "hôte exposerait un point acceptant un code OAuth au réseau, le temps d'un amorçage. " +
        "Pour amorcer depuis la production, c'est une décision d'exploitation — voir " +
        "`DEPS.md`, § « Du coffre local au coffre de production ».",
    );
  }

  const port = uri.port === "" ? (PORTS_PAR_SCHEMA[uri.protocol] ?? 0) : Number(uri.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ErreurDeRappel(
      `Le port dérivé de l'URI de redirection est inutilisable : ${uri.port || "(aucun)"}.`,
    );
  }

  return { port, chemin: uri.pathname, hotes: HOTES_DE_BOUCLE };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIRE LE RAPPEL — FONCTION PURE, DONC ÉPROUVABLE SANS SERVEUR
// ═════════════════════════════════════════════════════════════════════════════

/** Les façons dont un rappel est écarté, et elles sont NOMMÉES. */
export const REFUS_DE_RAPPEL = [
  /** Le chemin demandé n'est pas celui de l'URI déclarée. */
  "chemin-inconnu",
  /** Zoho a renvoyé une erreur au lieu d'un code — refus de consentement, le plus souvent. */
  "erreur-annoncee-par-zoho",
  /** Aucun `state`, ou un `state` qui ne correspond pas. Requête forgée ou périmée. */
  "etat-non-conforme",
  /** Le `state` est bon et le `code` manque : réponse tronquée. */
  "code-absent",
] as const;

export type RefusDeRappel = (typeof REFUS_DE_RAPPEL)[number];

export type LectureDuRappel =
  | { readonly recu: true; readonly code: string }
  | { readonly recu: false; readonly refus: RefusDeRappel; readonly explication: string };

/** Compare deux `state` en temps constant. La comparaison passe par les octets. */
function memeEtat(recu: string, attendu: string): boolean {
  return egalesEnTempsConstant(Buffer.from(recu, "utf8"), Buffer.from(attendu, "utf8"));
}

/**
 * **INTERPRÈTE UNE REQUÊTE DE RAPPEL.** Pure : ni serveur, ni horloge.
 *
 * ⚠️ **L'ORDRE DES CONTRÔLES EST LA DÉCISION, ET IL EST CONTRE-INTUITIF.** Le
 *    `state` est vérifié **AVANT** le `code`, et même avant d'être sûr qu'un
 *    code existe. L'ordre inverse ferait accepter, puis échanger, un `code`
 *    déposé par une page tierce ouverte dans le navigateur de Will — celle-ci
 *    n'a pas besoin de connaître le `state` pour viser
 *    `http://localhost:8787/…?code=…`. Le jeton déposé au coffre serait alors
 *    celui d'une AUTRE boîte, et rien dans le rapport ne le dirait.
 *
 * ⚠️ **L'ERREUR DE ZOHO EST LUE AVANT LE `state`**, parce qu'un refus de
 *    consentement ne porte pas toujours de `state` et que « tu as refusé » est
 *    un message plus utile que « état non conforme ».
 */
export function interpreterLeRappel(
  cheminEtRequete: string,
  cheminAttendu: string,
  etatAttendu: string,
): LectureDuRappel {
  // La base est arbitraire et jamais utilisée : elle n'existe que pour que
  // `URL` accepte un chemin relatif, seule forme qu'un serveur HTTP reçoit.
  const demande = new URL(cheminEtRequete, "http://rappel.invalid");

  if (demande.pathname !== cheminAttendu) {
    return {
      recu: false,
      refus: "chemin-inconnu",
      explication:
        `Chemin « ${demande.pathname} » — la boîte aux lettres n'écoute que ` +
        `« ${cheminAttendu} ». Rien n'est lu de cette requête.`,
    };
  }

  const erreur = demande.searchParams.get("error");
  if (erreur !== null && erreur !== "") {
    return {
      recu: false,
      refus: "erreur-annoncee-par-zoho",
      explication:
        `Zoho a répondu « ${erreur} » au lieu d'un code. La cause la plus fréquente est ` +
        "un consentement refusé à l'écran ; viennent ensuite une URI de redirection non " +
        "déclarée à la console, et un scope inconnu. Aucun jeton n'a été émis : " +
        "recommencer ne consomme rien.",
    };
  }

  const etat = demande.searchParams.get("state");
  if (etat === null || !memeEtat(etat, etatAttendu)) {
    return {
      recu: false,
      refus: "etat-non-conforme",
      explication:
        "Le paramètre « state » est absent ou ne correspond pas à celui de cette " +
        "exécution. Cette requête n'est pas la réponse à l'autorisation qui vient d'être " +
        "demandée : elle est écartée SANS être lue plus loin. Un onglet resté ouvert d'un " +
        "amorçage précédent produit exactement cela.",
    };
  }

  const code = demande.searchParams.get("code");
  if (code === null || code === "") {
    return {
      recu: false,
      refus: "code-absent",
      explication:
        "Le « state » est conforme et le « code » manque : la réponse de Zoho est " +
        "tronquée. Recommencer.",
    };
  }

  return { recu: true, code };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA PAGE RENDUE — STATIQUE, ET C'EST LA RÈGLE 2
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **AUCUNE INTERPOLATION. JAMAIS.** Ces trois pages sont des constantes.
 *    Rien de ce que porte la requête n'entre dans une réponse : ni le `code`,
 *    ni le `state`, ni le chemin. C'est ce qui rend impossible, par
 *    construction, de renvoyer un jeton d'échange dans du HTML.
 */
export const PAGE_SUCCES =
  '<!doctype html><html lang="fr"><meta charset="utf-8">' +
  "<title>Amorçage Zoho</title>" +
  '<body style="font:16px/1.6 system-ui;margin:4rem auto;max-width:34rem">' +
  "<h1>C'est fait.</h1><p>Le code a été reçu. Vous pouvez fermer cet onglet et revenir " +
  "au terminal : la suite s'y passe.</p></body></html>";

export const PAGE_REFUS =
  '<!doctype html><html lang="fr"><meta charset="utf-8">' +
  "<title>Amorçage Zoho</title>" +
  '<body style="font:16px/1.6 system-ui;margin:4rem auto;max-width:34rem">' +
  "<h1>Cette réponse a été écartée.</h1><p>Le terminal dit laquelle des quatre raisons " +
  "s'applique, et ce qu'il faut faire.</p></body></html>";

export const PAGE_PORTE_CLOSE =
  '<!doctype html><html lang="fr"><meta charset="utf-8">' +
  "<title>Amorçage Zoho</title>" +
  '<body style="font:16px/1.6 system-ui;margin:4rem auto;max-width:34rem">' +
  "<h1>La boîte aux lettres est fermée.</h1><p>Un code a déjà été reçu, ou l'échéance " +
  "est passée. Rien n'a été lu de cette requête.</p></body></html>";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ATTENTE — LE SEUL ENDROIT DE CE FICHIER QUI OUVRE UN PORT
// ═════════════════════════════════════════════════════════════════════════════

/** L'échéance par défaut : le temps d'ouvrir un navigateur et de choisir un compte. */
export const ECHEANCE_PAR_DEFAUT_MS = 5 * 60 * 1000;

export interface DemandeDAttente {
  readonly uriDeRedirection: string;
  readonly etat: string;
  readonly echeanceMs?: number;
  /** Où le serveur dit ce qu'il fait. Jamais `console`. */
  readonly ecrire: (ligne: string) => void;
}

/** Ce que l'attente rend. Un code, ou la raison de son absence. */
export type IssueDeLAttente =
  | { readonly recu: true; readonly code: string; readonly hotesLies: readonly string[] }
  | {
      readonly recu: false;
      readonly refus: RefusDeRappel | "echeance-depassee" | "aucune-liaison";
      readonly explication: string;
      readonly hotesLies: readonly string[];
    };

/**
 * **OUVRE LA BOÎTE AUX LETTRES, ATTEND UN CODE, LA REFERME.**
 *
 * ⚠️ **ELLE SE REFERME DANS TOUS LES CAS**, y compris sur une levée : un port
 *    laissé ouvert par un amorçage raté ferait échouer le suivant sur un
 *    `EADDRINUSE`, dont le message ne dit rien de la cause.
 */
export async function attendreLeCode(demande: DemandeDAttente): Promise<IssueDeLAttente> {
  const ecoute = deriverLEcoute(demande.uriDeRedirection);
  const echeanceMs = demande.echeanceMs ?? ECHEANCE_PAR_DEFAUT_MS;

  const serveurs: Server[] = [];
  const hotesLies: string[] = [];
  let porteOuverte = true;

  let resoudre: (issue: IssueDeLAttente) => void = () => undefined;
  const attendu = new Promise<IssueDeLAttente>((resolution) => {
    resoudre = resolution;
  });

  const fermerLaPorte = (issue: IssueDeLAttente): void => {
    if (!porteOuverte) return;
    porteOuverte = false;
    resoudre(issue);
  };

  const traiter = (requete: IncomingMessage, reponse: ServerResponse): void => {
    const repondre = (statut: number, page: string): void => {
      reponse.writeHead(statut, { "content-type": "text/html; charset=utf-8" });
      reponse.end(page);
    };

    if (!porteOuverte) {
      repondre(410, PAGE_PORTE_CLOSE);
      return;
    }

    const lecture = interpreterLeRappel(requete.url ?? "/", ecoute.chemin, demande.etat);
    if (lecture.recu) {
      repondre(200, PAGE_SUCCES);
      demande.ecrire("[rappel] code reçu · la boîte aux lettres se referme.");
      fermerLaPorte({ recu: true, code: lecture.code, hotesLies });
      return;
    }

    // ⚠️ UN CHEMIN INCONNU NE FERME PAS LA PORTE. Les navigateurs demandent
    //    `/favicon.ico` sans qu'on leur ait rien demandé : traiter cette requête
    //    comme une réponse ferait rater le vrai rappel, arrivé une seconde plus
    //    tard, et le diagnostic serait indéchiffrable.
    repondre(lecture.refus === "chemin-inconnu" ? 404 : 400, PAGE_REFUS);
    demande.ecrire(`[rappel] écarté (${lecture.refus}) — ${lecture.explication}`);
    if (lecture.refus === "chemin-inconnu") return;
    fermerLaPorte({
      recu: false,
      refus: lecture.refus,
      explication: lecture.explication,
      hotesLies,
    });
  };

  const lier = (hote: string): Promise<void> =>
    new Promise<void>((resolution) => {
      const serveur = createServer(traiter);
      serveurs.push(serveur);
      // Une liaison qui échoue n'est PAS fatale : une machine sans IPv6 est
      // légitime, et c'est l'ABSENCE DES DEUX qui est une panne.
      serveur.once("error", () => {
        resolution();
      });
      serveur.listen(ecoute.port, hote, () => {
        hotesLies.push(hote);
        resolution();
      });
    });

  const minuterie = setTimeout(() => {
    fermerLaPorte({
      recu: false,
      refus: "echeance-depassee",
      explication:
        `Aucun rappel en ${String(Math.round(echeanceMs / 1000))} s. Le lien n'a pas été ` +
        "ouvert, ou il l'a été dans un navigateur d'une AUTRE machine — auquel cas le code " +
        "est parti vers une boucle locale qui n'est pas celle-ci. Aucun jeton n'a été émis.",
      hotesLies,
    });
  }, echeanceMs);
  minuterie.unref();

  try {
    for (const hote of ecoute.hotes) await lier(hote);

    if (hotesLies.length === 0) {
      return {
        recu: false,
        refus: "aucune-liaison",
        explication:
          `Aucune liaison possible sur le port ${String(ecoute.port)} de la boucle locale. ` +
          "Le port est déjà pris — souvent par un amorçage précédent resté vivant.",
        hotesLies,
      };
    }

    demande.ecrire(
      `[rappel] écoute sur ${hotesLies.join(", ")} port ${String(ecoute.port)} · chemin ` +
        `${ecoute.chemin} · un seul code accepté · échéance ` +
        `${String(Math.round(echeanceMs / 1000))} s.`,
    );
    if (hotesLies.length < ecoute.hotes.length) {
      demande.ecrire(
        `[rappel] ⚠️ ${String(ecoute.hotes.length - hotesLies.length)} liaison(s) de boucle ` +
          "locale n'ont pas pu être posées. Si le navigateur affiche « connexion refusée », " +
          "c'est ici qu'il faut regarder : « localhost » se résout d'abord en ::1 sur " +
          "beaucoup de systèmes.",
      );
    }

    return await attendu;
  } finally {
    clearTimeout(minuterie);
    for (const serveur of serveurs) serveur.close();
  }
}
