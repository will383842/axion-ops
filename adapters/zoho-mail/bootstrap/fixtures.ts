/**
 * `adapters/zoho-mail/bootstrap/fixtures.ts` — **LE DÉCOR DES GARDES.**
 *
 * ⚠️ **CE FICHIER N'EST PAS LIVRÉ.** `tsconfig.build.json` exclut
 *    `**\/fixtures.ts` ; il ne compte donc pas pour un module de production, et
 *    aucune garde du dépôt ne le lira comme tel.
 *
 * ⚠️ **AUCUN SECRET RÉEL, AUCUN RÉSEAU.** Les clés sont des octets constants,
 *    les jetons sont des chaînes inventées, et l'échangeur ne sort de rien : il
 *    rend ce qu'on lui a mis dedans, et il COMPTE ses appels — c'est ce compte
 *    qui prouve que le plafond refuse AVANT de parler à Zoho.
 */

import { Coffre, DepotEnMemoire, depuisDeverrouillageManuel } from "../../../core/vault/index.js";
import type { DepotDeSecrets } from "../../../core/vault/index.js";
import { lecteurDeVersions } from "./coffre-du-jeton.js";
import type { LecteurDeVersions } from "./coffre-du-jeton.js";
import type { DemandeDEchange, EchangeurDeJetons, JetonsZoho } from "./jetons.js";
import { demanderUnMandat, ARGUMENT_SENTINELLE } from "./mandat.js";
import type { MandatDAmorcage } from "./mandat.js";
import type { DemandeDAttente, IssueDeLAttente } from "./rappel.js";

/** Une clé de coffre JETABLE, encodée comme l'environnement l'attend. */
export const CLE_JETABLE_BASE64 = Buffer.alloc(32, 7).toString("base64");

/** Un mandat authentique — délivré par la seule porte, jamais forgé. */
export function mandatDeGarde(): MandatDAmorcage {
  const issue = demanderUnMandat({
    arguments: [ARGUMENT_SENTINELLE],
    entreeEstUnTerminal: true,
    estLeProgrammeLance: true,
    programme: "garde",
  });
  if (!issue.delivre) throw new Error(`décor cassé : mandat refusé (${issue.refus})`);
  return issue.mandat;
}

export interface CoffreDeGarde {
  readonly coffre: Coffre;
  readonly depot: DepotDeSecrets;
  readonly versions: LecteurDeVersions;
}

/** Un coffre OUVERT sur un dépôt en mémoire, avec le plafond demandé. */
export async function coffreOuvert(plafondBootstrap: number | null): Promise<CoffreDeGarde> {
  const depot = new DepotEnMemoire();
  const source = depuisDeverrouillageManuel();
  source.poser(CLE_JETABLE_BASE64);
  const coffre = await Coffre.ouvrir({ depot, source, plafondBootstrap });
  await coffre.provisionner();
  return { coffre, depot, versions: lecteurDeVersions(depot) };
}

/** Un coffre qui reste VERROUILLÉ : le sceau est posé, la clé est oubliée. */
export async function coffreVerrouille(): Promise<CoffreDeGarde> {
  const decor = await coffreOuvert(null);
  decor.coffre.verrouiller();
  return decor;
}

/** Des jetons plausibles. **Aucune de ces valeurs n'a jamais existé chez Zoho.** */
export const JETONS_INVENTES: JetonsZoho = {
  refreshToken: "1000.jeton-de-rafraichissement-invente-pour-la-garde.0000",
  accessToken: "1000.jeton-d-acces-invente-pour-la-garde.0000",
  dureeDeVieSecondes: 3600,
  domaineDApi: "https://mail.stub.invalid",
  typeDeJeton: "Bearer",
};

/** Un échangeur qui NE SORT DE RIEN, et qui compte ses appels. */
export interface EchangeurCompte extends EchangeurDeJetons {
  readonly appels: readonly DemandeDEchange[];
}

export function echangeurDeGarde(reponse: JetonsZoho | Error = JETONS_INVENTES): EchangeurCompte {
  const appels: DemandeDEchange[] = [];
  return {
    nom: "échangeur de garde (aucun réseau)",
    appels,
    echanger(demande: DemandeDEchange): Promise<JetonsZoho> {
      appels.push(demande);
      return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse);
    },
  };
}

/** Une boîte aux lettres qui n'ouvre AUCUN port et rend ce qu'on lui dit. */
export function boiteDeGarde(issue: IssueDeLAttente): {
  ouvrir: (demande: DemandeDAttente) => Promise<IssueDeLAttente>;
  etatsVus: string[];
} {
  const etatsVus: string[] = [];
  return {
    etatsVus,
    ouvrir(demande: DemandeDAttente): Promise<IssueDeLAttente> {
      etatsVus.push(demande.etat);
      return Promise.resolve(issue);
    },
  };
}

/** L'environnement minimal d'un amorçage. Aucune valeur réelle. */
export function envDeGarde(
  supplement: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return {
    ZOHO_CLIENT_ID: "1000.CLIENT-ID-DE-GARDE",
    ZOHO_CLIENT_SECRET: "secret-de-garde-sans-valeur",
    ...supplement,
  };
}
