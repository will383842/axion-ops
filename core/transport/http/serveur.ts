/**
 * `core/transport/http/serveur.ts` — **LA SOCKET, ET RIEN QUE LA SOCKET.**
 *
 * Tout ce qui décide vit dans `transport.ts`, qui ne connaît ni `node:http`, ni
 * `IncomingMessage`, ni `ServerResponse`. Ce fichier-ci ne fait que trois
 * choses : ouvrir une écoute, traduire une requête Node en {@link RequeteHttp},
 * et écrire une {@link ReponseHttp} sur le fil.
 *
 * ⚠️ **AUCUN APPEL SORTANT, ET L'ÉCOUTE EST BORNÉE À LA BOUCLE LOCALE PAR
 *    DÉFAUT.** `ADRESSE_DE_BOUCLE_LOCALE` est la valeur par défaut de l'adresse
 *    d'écoute : un socle qui écouterait `0.0.0.0` sans que personne l'ait décidé
 *    serait joignable depuis le réseau du VPS, et le § 28 veut que l'accès passe
 *    par une porte. L'exposer se demande explicitement.
 *
 * ═══ CE QUE CE FICHIER TIENT, ET QUI NE SE VOIT PAS DANS `transport.ts` ═══
 *
 * **LE CORPS N'EST PAS LU TANT QUE L'ÉTAPE 1 N'A PAS PARLÉ.** `transport.ts`
 * reçoit une fonction ; ici, cette fonction est celle qui s'abonne aux
 * évènements `data` du flux. Tant qu'elle n'est pas appelée, aucun octet de
 * corps n'entre en mémoire. Et quand le traitement se termine sans l'avoir
 * appelée, le flux est DRAINÉ (`resume()`) plutôt que laissé en suspens : un
 * flux jamais consommé retient la connexion, et le refus de l'étape 1 se
 * paierait en sockets bloquées.
 *
 * ⚠️ **LE CORPS EST BORNÉ, ET LA BORNE EST UN RÉGLAGE OBLIGATOIRE.** Un serveur
 *    qui accumule un corps sans plafond est une panne de mémoire à la demande.
 *    Le cahier des charges borne des TAILLES DE RÉSULTAT (§ 13.3) et non des
 *    tailles de requête : la valeur n'est donc pas dérivable, elle se décide, et
 *    ce module refuse de démarrer sans elle plutôt que d'en inventer une.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { RequeteHttp, TraceDeTraitement, TransportHttp } from "./transport.js";

/** L'adresse par défaut. Le § 28 veut une porte ; on ne l'ouvre pas tout seul. */
export const ADRESSE_DE_BOUCLE_LOCALE = "127.0.0.1";

/** Levée quand le corps dépasse le plafond. La connexion est refusée, pas tronquée. */
export class ErreurCorpsTropGrand extends Error {
  public readonly octetsMax: number;

  public constructor(octetsMax: number) {
    super(
      `Corps de requête au-delà de ${String(octetsMax)} octets : refusé sans être lu ` +
        "jusqu'au bout. Un corps tronqué en silence produirait une enveloppe JSON-RPC " +
        "invalide dont personne ne saurait dire si elle vient du client ou du socle.",
    );
    this.name = "ErreurCorpsTropGrand";
    this.octetsMax = octetsMax;
  }
}

/**
 * LE LECTEUR DE LA TRACE — **ADR 0037, § 5.**
 *
 * ⚠️ **CE PORT EXISTE PARCE QUE LA TRACE ÉTAIT JETÉE.** Ce fichier consommait
 *    `traitement.reponse` et laissait tomber `traitement.trace` : tous les
 *    comptes d'amont — étapes franchies, refus prononcés, refus consignés,
 *    `Retry-After` absent sur un 429 — mouraient à la socket. **Un compteur juste
 *    que personne ne lit vaut le compteur faux qu'il remplace** : la correction
 *    du § 1 de l'ADR n'aurait rien changé en service tant que rien ici ne lisait.
 *
 * ⚠️ **IL EST FACULTATIF AU TYPE, ET LA COMPOSITION DOIT LE FOURNIR.** Le serveur
 *    doit pouvoir être monté nu dans une garde ; ce qui ne peut pas rester
 *    facultatif est le CÂBLAGE de production, et c'est la garde de composition
 *    (`ops/`) qui l'exige — voir l'interface déclarée au rapport du lot 3.
 *
 * ⚠️ **IL NE PEUT PAS FAIRE ÉCHOUER UNE RÉPONSE.** Une observation qui lèverait
 *    ferait perdre au client une réponse déjà calculée : ce serait faire payer au
 *    service le prix de sa propre télémétrie. L'exception est donc avalée, et
 *    c'est le seul endroit du fichier où on avale quoi que ce soit.
 */
export type ObservateurDeTraitement = (trace: TraceDeTraitement) => void;

/** Les réglages d'écoute. Aucun défaut sur ce qui engage la mémoire ou l'exposition. */
export interface ReglagesServeurHttp {
  readonly port: number;
  /** Défaut : {@link ADRESSE_DE_BOUCLE_LOCALE}. */
  readonly adresse?: string;
  /** Plafond du corps, en octets. Obligatoire — voir l'en-tête de ce fichier. */
  readonly octetsMaxDuCorps: number;
  /** § 24 — où va ce que le traitement a MESURÉ. Voir {@link ObservateurDeTraitement}. */
  readonly observateur?: ObservateurDeTraitement;
}

/** Un serveur monté. Il ne tient aucun état applicatif. */
export interface ServeurHttp {
  readonly serveurNode: Server;
  ecouter(): Promise<{ readonly adresse: string; readonly port: number }>;
  fermer(): Promise<void>;
}

/**
 * ACCUMULE LE CORPS, SOUS PLAFOND.
 *
 * ⚠️ LE PLAFOND SE MESURE SUR LES OCTETS REÇUS, PAS SUR `Content-Length`. Un
 *    en-tête `Content-Length` est déclaratif : s'y fier reviendrait à laisser
 *    l'appelant décider de la quantité de mémoire qu'il consomme, ce qui est
 *    exactement la faute qu'un plafond existe pour empêcher.
 */
function lireLeCorpsBorne(requete: IncomingMessage, octetsMax: number): Promise<string> {
  return new Promise<string>((resoudre, rejeter) => {
    const morceaux: Buffer[] = [];
    let octets = 0;
    let depasse = false;
    requete.on("data", (morceau: Buffer) => {
      octets += morceau.length;
      if (octets > octetsMax) {
        // ⚠️ ON CESSE D'ACCUMULER, ON NE DÉTRUIT PAS LA REQUÊTE. Détruire le
        //    flux ferme la socket avant que la réponse soit écrite : le client
        //    reçoit une connexion coupée, c'est-à-dire un incident réseau, là où
        //    le socle veut lui dire ce qu'il faut faire ensuite (§ 15). Les
        //    octets qui continuent d'arriver sont désormais jetés — la mémoire
        //    reste bornée, ce qui est la propriété recherchée.
        if (!depasse) {
          depasse = true;
          morceaux.length = 0;
          rejeter(new ErreurCorpsTropGrand(octetsMax));
        }
        return;
      }
      morceaux.push(morceau);
    });
    requete.on("end", () => {
      resoudre(Buffer.concat(morceaux).toString("utf8"));
    });
    requete.on("error", (erreur: Error) => {
      rejeter(erreur);
    });
  });
}

/**
 * MONTE UN SERVEUR AUTOUR D'UN TRANSPORT.
 *
 * ⚠️ **LA QUERY ET LE FRAGMENT SONT RETIRÉS DU CHEMIN AVANT COMPARAISON.**
 *    `req.url` porte `/api/mcp?x=1` ; comparer la valeur brute au chemin de la
 *    ressource ferait rendre `404` à une requête parfaitement légitime, et le
 *    remède qu'on chercherait à cette fausse alerte serait une comparaison par
 *    PRÉFIXE — c'est-à-dire une route qui accepterait `/api/mcp-autre-chose`.
 */
export function creerServeurHttp(
  transport: TransportHttp,
  reglages: ReglagesServeurHttp,
): ServeurHttp {
  if (!Number.isInteger(reglages.octetsMaxDuCorps) || reglages.octetsMaxDuCorps <= 0) {
    throw new Error(
      "core/transport/http — `octetsMaxDuCorps` doit être un entier d'octets strictement " +
        "positif : un serveur sans plafond de corps est une panne de mémoire à la demande.",
    );
  }
  const adresse = reglages.adresse ?? ADRESSE_DE_BOUCLE_LOCALE;

  const serveurNode = createServer((requeteNode: IncomingMessage, reponseNode: ServerResponse) => {
    let corpsDemande = false;

    const brut = requeteNode.url ?? "/";
    const finDuChemin = ((): number => {
      const requete = brut.indexOf("?");
      const fragment = brut.indexOf("#");
      const bornes = [requete, fragment].filter((position) => position >= 0);
      return bornes.length === 0 ? brut.length : Math.min(...bornes);
    })();

    const requete: RequeteHttp = {
      methode: requeteNode.method ?? "",
      chemin: brut.slice(0, finDuChemin),
      entetes: requeteNode.headers as Readonly<Record<string, string | undefined>>,
      lireLeCorps: (): Promise<string> => {
        corpsDemande = true;
        return lireLeCorpsBorne(requeteNode, reglages.octetsMaxDuCorps);
      },
    };

    void transport
      .traiter(requete)
      .then((traitement) => {
        // ADR 0037, § 5 — LA TRACE VA À UN LECTEUR AVANT QUE LA RÉPONSE PARTE.
        // Elle était jetée ici, et avec elle tout ce que l'amont avait compté.
        if (reglages.observateur !== undefined) {
          try {
            reglages.observateur(traitement.trace);
          } catch {
            // Voir `ObservateurDeTraitement` : une observation ne fait pas perdre
            // une réponse déjà calculée.
          }
        }
        // ⚠️ DRAINER PLUTÔT QUE LAISSER EN SUSPENS. Le corps n'a pas été lu —
        //    c'est le comportement voulu d'un refus d'étape 1 — mais un flux non
        //    consommé retient la connexion jusqu'au délai du client.
        if (!corpsDemande) requeteNode.resume();
        reponseNode.writeHead(traitement.reponse.statut, { ...traitement.reponse.entetes });
        reponseNode.end(traitement.reponse.corps);
      })
      .catch(() => {
        // `traiter` ne lève pas : il rattrape tout et rend un `internal`. Ce
        // chemin ne reste que pour une panne du transport lui-même, et il ne
        // rend RIEN de la cause — § 15, « jamais une trace de pile ».
        if (!corpsDemande) requeteNode.resume();
        if (!reponseNode.headersSent) {
          reponseNode.writeHead(500, { "content-type": "application/json" });
        }
        reponseNode.end('{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"internal"}}');
      });
  });

  return {
    serveurNode,
    ecouter(): Promise<{ readonly adresse: string; readonly port: number }> {
      return new Promise((resoudre, rejeter) => {
        serveurNode.once("error", rejeter);
        serveurNode.listen(reglages.port, adresse, () => {
          const liee = serveurNode.address();
          if (liee === null || typeof liee === "string") {
            rejeter(new Error("core/transport/http — le serveur n'a pas rendu d'adresse liée."));
            return;
          }
          const info: AddressInfo = liee;
          resoudre({ adresse: info.address, port: info.port });
        });
      });
    },
    fermer(): Promise<void> {
      return new Promise((resoudre, rejeter) => {
        serveurNode.close((erreur) => {
          if (erreur !== undefined) rejeter(erreur);
          else resoudre();
        });
      });
    },
  };
}
