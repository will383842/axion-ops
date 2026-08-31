/**
 * `core/chaine/etape-09-curseur.ts` — ÉTAPE 9 DU § 11 : LE CURSEUR EST-IL
 * AUTHENTIQUE, ET PORTE-T-IL LES MÊMES FILTRES ?
 *
 * Implémente les deux formes déclarées par `etapes.ts` :
 *
 *  · `SignataireCurseur` — le port de signature (§ 13.1, § 25) ;
 *  · `EtapeCurseur`      — l'étape elle-même, ancrée à `ETAPE_CURSEUR`.
 *
 * ═══ LE DÉFAUT QUE CETTE ÉTAPE CORRIGE, EN UNE PHRASE ═══
 *
 * Le § 13.1 le dit mot pour mot : « le curseur signé, que la v5 employait SANS
 * MÉCANISME : HMAC sur `{ lastId, lastSortValue, filtersHash }`, clé propre
 * inscrite à la liste de rotation du § 25. Un curseur réutilisé avec d'autres
 * filtres est refusé (`cursor_invalid`) — sans quoi il rend une fenêtre
 * SILENCIEUSEMENT FAUSSE. »
 *
 * « Silencieusement » est le mot qui compte, et c'est lui qui fait de cette
 * étape une garde plutôt qu'un confort. Une page reprise avec d'autres filtres
 * ne casse pas : elle rend des lignes cohérentes en apparence, dans un ordre
 * plausible, et il n'existe AUCUN endroit — ni la réponse, ni `ops_audit`, ni
 * une métrique du § 24 — où quelqu'un pourrait s'en apercevoir. Le modèle
 * résume une fenêtre fausse, et l'humain lit le résumé.
 *
 * Deux moitiés, qui ne couvrent pas le même attaquant :
 *
 *  · la SIGNATURE couvre le curseur FORGÉ — un jeton fabriqué ailleurs, qui
 *    ouvrirait une fenêtre qu'aucun filtre ne borne ;
 *  · le `filtersHash` couvre le curseur AUTHENTIQUE mais REJOUÉ — celui que le
 *    socle a lui-même signé, ressorti sur un autre appel. C'est le cas le plus
 *    probable, et le seul des deux qu'un client de bonne foi produit tout seul.
 *
 * ═══ POURQUOI CE MODULE N'ÉCRIT AUCUN `createHmac` ═══
 *
 * Il RÉUTILISE `creerCalculArgHash` (`core/limits/arg-hash.ts`), avec une CLÉ
 * PROPRE et un DOMAINE PROPRE. Ce n'est pas une économie de lignes, c'est la
 * même règle que celle qui a fait naître `core/sceau/` : une seconde
 * implémentation d'HMAC dans le socle, c'est un second cadrage de message, une
 * seconde validation de clé, une seconde comparaison à temps constant — donc
 * trois occasions de plus qu'une des deux dérive de l'autre en silence.
 *
 * Ce que la réutilisation apporte, et qu'on n'a pas eu à réécrire :
 *
 *  · la CANONISATION de la charge (`core/limits/canonical.ts`) — sans elle,
 *    deux sérialisations du même curseur donneraient deux signatures, et un
 *    client qui ordonne ses clés autrement verrait son propre curseur refusé ;
 *  · le CADRAGE par longueur des morceaux du message — sans lui,
 *    `lastId = "a"` + `lastSortValue = "b:c"` et `lastId = "a:b"` +
 *    `lastSortValue = "c"` pourraient produire le même message ;
 *  · la comparaison À TEMPS CONSTANT de deux empreintes.
 *
 * ⚠️ LA CONSÉQUENCE, ÉCRITE PLUTÔT QUE TUE. Le message signé est
 *    `cadrer([DOMAINE_ARG_HASH, DOMAINE_CURSEUR, charge canonisée])` : la
 *    constante de cadrage de l'`argHash` entre donc dans le message d'un
 *    curseur. Si `DOMAINE_ARG_HASH` passait un jour en `v2`, TOUS LES CURSEURS
 *    EN VOL deviendraient invalides. Ce n'est pas une fenêtre fausse — c'est un
 *    `cursor_invalid` qui dit de repartir de la première page, exactement comme
 *    une rotation de clé. La borne est là, et elle est bruyante. Voir les
 *    écarts du lot.
 *
 * ═══ LA CLÉ : PROPRE, RELUE À CHAQUE APPEL, SANS AUCUN REPLI ═══
 *
 * · PROPRE, et pas celle de l'`argHash` (§ 13.1, et `etapes.ts` le répète) :
 *   l'`argHash` est écrit dans `ops_audit` à chaque appel et le § 31 le PURGE à
 *   échéance, tandis qu'un curseur signé CIRCULE CHEZ LE CLIENT. Une clé
 *   commune ferait qu'une rotation motivée par l'un casserait l'autre, et
 *   qu'une fuite de l'un donnerait l'autre.
 *
 * · RELUE À CHAQUE APPEL, comme celle de l'`argHash` et à l'inverse de celle du
 *   sceau du journal : le § 25 la range dans la liste de rotation, et un cache
 *   de processus servirait l'ancienne clé jusqu'au prochain redémarrage — une
 *   rotation qui ne tourne pas. La rotation invalide les curseurs en vol ; le
 *   client reçoit `cursor_invalid` et repart de la première page. C'est le
 *   comportement voulu, pas un dommage collatéral.
 *
 * · SANS REPLI. Une clé de secours connue permettrait de FORGER un curseur,
 *   donc d'ouvrir une fenêtre qu'aucun filtre ne borne. Signer comme vérifier
 *   LÈVENT quand la clé manque — y compris `verifier()`, qui ne rend PAS `null`
 *   dans ce cas : rendre `null` transformerait un défaut de configuration du
 *   socle en un `cursor_invalid` adressé au client, et l'exploitant chercherait
 *   un bug de pagination pendant qu'un secret manque.
 */

import { canoniser } from "../limits/canonical.js";
import { LONGUEUR_ARG_HASH, LONGUEUR_MINIMALE_CLE, creerCalculArgHash } from "../limits/index.js";
import type { Pagination } from "../adapter-kit/types.js";

import { ETAPE_CURSEUR, autorise, refuse } from "./etapes.js";
import type {
  ChargeCurseur,
  ContexteCurseur,
  CurseurEtabli,
  EtapeCurseur,
  SignataireCurseur,
  VerdictEtape,
} from "./etapes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES CONSTANTES — chacune à UN seul endroit
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sépare la signature d'un curseur de tout autre usage de clé du socle, ET
 * PORTE SA VERSION.
 *
 * Le jour où la charge signée change de forme — un quatrième champ, un autre
 * cadrage — cette version change avec elle. Les anciens curseurs deviennent
 * alors invalides PAR CONSTRUCTION, au lieu de se mélanger en silence aux
 * nouveaux : un curseur d'une ancienne forme accepté par une nouvelle lecture
 * est précisément la fenêtre fausse que cette étape existe pour empêcher.
 */
export const DOMAINE_CURSEUR = "axion-ops/curseur/v1";

/**
 * Le séparateur entre la charge encodée et sa signature.
 *
 * Un point : il n'appartient PAS à l'alphabet base64url, ce qui rend le
 * découpage non ambigu sans avoir à faire confiance au contenu de la charge.
 */
export const SEPARATEUR_JETON = ".";

/** Longueur de la signature d'un curseur — DÉRIVÉE, jamais réécrite. */
export const LONGUEUR_SIGNATURE_CURSEUR = LONGUEUR_ARG_HASH;

/**
 * Plafond de taille d'un jeton reçu, en caractères.
 *
 * ⚠️ CE N'EST PAS UN CONFORT. `verifier()` décode puis `JSON.parse` un jeton
 *    FOURNI PAR L'APPELANT, et il le fait AVANT toute vérification de
 *    signature — il le faut bien, puisque c'est le décodage qui produit ce
 *    qu'on vérifie. Sans plafond, un jeton de plusieurs mégaoctets ferait
 *    travailler l'analyseur JSON pour rien, à chaque appel, sans même une clé.
 *
 * La valeur : un curseur réel porte un identifiant, une valeur de tri et deux
 * empreintes hexadécimales de 64 caractères, soit ~300 caractères. 4 096 laisse
 * plus de dix fois la marge et reste hors de portée d'un abus. Elle vit ICI, à
 * un seul endroit, pour qu'un changement futur soit une ligne.
 */
export const TAILLE_MAX_JETON = 4096;

/**
 * Les champs de la charge signée (§ 13.1).
 *
 * Ils servent à UNE chose que le type ne fait pas : compter les clés d'un objet
 * décodé, pour refuser un champ clandestin qui aurait voyagé dans le jeton.
 */
export const CHAMPS_CHARGE = ["lastId", "lastSortValue", "filtersHash"] as const;

/**
 * VAUT `true` UNIQUEMENT SI `CHAMPS_CHARGE` COUVRE TOUS LES CHAMPS DE
 * `ChargeCurseur` — la vérification est faite par le compilateur, pas par un
 * test.
 *
 * Ajouter un champ à `ChargeCurseur` sans l'ajouter ici rend ce type `never`, et
 * `= true` cesse de compiler. Sans cette ligne, le compte de clés ci-dessus
 * refuserait tous les curseurs porteurs du nouveau champ — silencieusement, et
 * seulement en production.
 */
export const CHAMPS_CHARGE_COMPLETS: Exclude<
  keyof ChargeCurseur,
  (typeof CHAMPS_CHARGE)[number]
> extends never
  ? true
  : never = true;

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT DU COFFRE, ET SON ERREUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE LA SIGNATURE DES CURSEURS ATTEND DU COFFRE — interface DÉCLARÉE ICI,
 * implémentée par `core/vault/` (dossier d'un autre constructeur), sur le
 * modèle exact de `CoffreArgHash` et de `CoffreSceauJournal`.
 *
 * Elle rend `null` quand le secret n'existe pas : c'est à la signature, et non
 * au coffre, de décider que l'absence est fatale. Elle peut aussi rendre une
 * chaîne VIDE — une variable d'environnement déclarée sans valeur n'est pas
 * nullish —, d'où un contrôle de VÉRACITÉ et jamais de simple nullité.
 */
export interface CoffreCurseur {
  /** Rend la clé HMAC en clair, ou `null` si le secret n'est pas configuré. */
  lireCleCurseur(): Promise<string | null | undefined>;
}

/** La clé de signature des curseurs est absente, vide, ou trop courte. */
export class ErreurCleCurseur extends Error {
  public constructor(motif: string) {
    super(
      `Clé de signature des curseurs inutilisable (${motif}). ` +
        "Le socle refuse de signer comme de vérifier : une signature calculée avec une " +
        "clé de repli connue laisserait FORGER un curseur, donc lire une fenêtre " +
        "qu'aucun filtre ne borne. Renseigner le secret de signature des curseurs du " +
        "coffre (§ 25, liste de rotation).",
    );
    this.name = "ErreurCleCurseur";
  }
}

/**
 * L'empreinte des filtres courants manque à l'appel de l'étape.
 *
 * ⚠️ C'EST UNE LEVÉE, PAS UN REFUS, et la distinction est la garde elle-même.
 *    Un `filtersHashCourant` vide comparé à un `filtersHash` vide signé rendrait
 *    `égal` — la moitié « rejeu » de l'étape 9 laisserait alors passer TOUS les
 *    curseurs, en restant verte. Une garde qui ne peut plus mordre doit faire du
 *    bruit, pas rendre un verdict.
 */
export class ErreurFiltersHashAbsent extends Error {
  public constructor() {
    super(
      "Étape 9 appelée sans empreinte de filtres (`filtersHashCourant` vide). " +
        "La confrontation du § 13.1 n'aurait alors plus rien à confronter : tout curseur " +
        "serait accepté quels que soient les filtres, et la fenêtre rendue serait " +
        "silencieusement fausse. C'est un défaut de l'appelant, pas de l'appel.",
    );
    this.name = "ErreurFiltersHashAbsent";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE SIGNATAIRE — implémentation du port `SignataireCurseur`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Retire tout champ clandestin de la charge AVANT de la signer.
 *
 * Le typage structurel de TypeScript laisse passer, à l'exécution, un objet qui
 * porte plus que `ChargeCurseur`. Signer un tel objet ferait entrer ses extras
 * dans le message HMACé ; à la vérification, `lireCharge()` ne les rendrait pas,
 * et la signature recalculée ne correspondrait plus. Le curseur émis par le
 * socle serait refusé par le socle — un aller-retour cassé par une propriété
 * que personne n'a voulue.
 */
function normaliser(charge: ChargeCurseur): ChargeCurseur {
  // Littéral EXPLICITE, et non une copie par boucle : ajouter un champ à
  // `ChargeCurseur` fait échouer la compilation ICI, à l'endroit où il faut
  // décider s'il entre ou non dans le message signé.
  return {
    lastId: charge.lastId,
    lastSortValue: charge.lastSortValue,
    filtersHash: charge.filtersHash,
  };
}

/**
 * Relit une charge décodée, ou rend `null`.
 *
 * Le compte de clés est aussi important que le typage des trois : un jeton
 * porteur d'un quatrième champ a été fabriqué par autre chose que ce module, et
 * l'accepter en ignorant l'extra reviendrait à valider une charge qu'on n'a pas
 * entièrement lue.
 */
function lireCharge(valeur: unknown): ChargeCurseur | null {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return null;

  const brut = valeur as Record<string, unknown>;
  if (Object.keys(brut).length !== CHAMPS_CHARGE.length) return null;

  const lastId: unknown = brut["lastId"];
  const lastSortValue: unknown = brut["lastSortValue"];
  const filtersHash: unknown = brut["filtersHash"];

  if (typeof lastId !== "string") return null;
  if (typeof lastSortValue !== "string") return null;
  if (typeof filtersHash !== "string") return null;

  return { lastId, lastSortValue, filtersHash };
}

/**
 * Valide la clé du coffre, puis rend le calculateur d'empreintes qui la porte.
 *
 * ⚠️ LA VALIDATION EST FAITE ICI, ET LE CALCUL EST DÉLÉGUÉ. `creerCalculArgHash`
 *    valide déjà la clé, mais son erreur dit « Renseigner le secret argHash du
 *    coffre » — un message juste pour lui, et FAUX ici : il enverrait
 *    l'exploitant renseigner le mauvais secret. Le seuil, lui, n'est pas
 *    recopié : `LONGUEUR_MINIMALE_CLE` est importée, et vit donc toujours à un
 *    seul endroit.
 */
async function calculPourLaCle(coffre: CoffreCurseur): Promise<{
  calculer(charge: ChargeCurseur): Promise<string>;
  correspond(a: string, b: string): boolean;
}> {
  const brute = await coffre.lireCleCurseur();

  // Test de VÉRACITÉ, pas `??` : une variable déclarée mais VIDE n'est pas
  // nullish, et une clé vide produit un HMAC parfaitement stable — et public.
  const cle = typeof brute === "string" ? brute.trim() : "";
  if (cle.length === 0) throw new ErreurCleCurseur("absente ou vide");
  if (cle.length < LONGUEUR_MINIMALE_CLE) {
    throw new ErreurCleCurseur(
      `${String(cle.length)} caractères, minimum ${String(LONGUEUR_MINIMALE_CLE)}`,
    );
  }

  const calcul = creerCalculArgHash({
    lireCleArgHash: () => Promise.resolve(cle),
  });

  return {
    // `DOMAINE_CURSEUR` occupe le morceau « outil » du message cadré : la
    // séparation d'usage est donc STRUCTURELLE, en plus d'être portée par une
    // clé distincte. Un outil qui s'appellerait littéralement
    // « axion-ops/curseur/v1 » ne collisionnerait toujours pas : sa clé n'est
    // pas celle-ci.
    calculer: (charge: ChargeCurseur) => calcul.calculer(DOMAINE_CURSEUR, charge),
    correspond: (a: string, b: string) => calcul.correspond(a, b),
  };
}

/** Encode la charge canonisée en base64url — un jeton opaque, sans point. */
function encoder(canonique: string): string {
  return Buffer.from(canonique, "utf8").toString("base64url");
}

/**
 * Relie la signature des curseurs au coffre.
 *
 * @throws {ErreurCleCurseur} — à la signature comme à la vérification — si la
 *         clé manque, est vide, ou est trop courte.
 */
export function creerSignataireCurseur(coffre: CoffreCurseur): SignataireCurseur {
  return {
    async signer(charge: ChargeCurseur): Promise<string> {
      const normalisee = normaliser(charge);
      const calcul = await calculPourLaCle(coffre);
      const signature = await calcul.calculer(normalisee);
      return `${encoder(canoniser(normalisee))}${SEPARATEUR_JETON}${signature}`;
    },

    async verifier(jeton: string): Promise<ChargeCurseur | null> {
      // ⚠️ LA CLÉ D'ABORD, ET ELLE LÈVE. Un jeton mal formé rendu `null` AVANT
      //    d'avoir cherché la clé cacherait un secret manquant derrière un
      //    `cursor_invalid` : le socle dirait au client que son curseur est
      //    mauvais alors que c'est le socle qui n'est pas configuré.
      const calcul = await calculPourLaCle(coffre);

      // Toutes les branches ci-dessous rendent `null`, SANS JAMAIS DIRE
      // LAQUELLE : un jeton tronqué, un jeton mal encodé et une signature fausse
      // doivent être indiscernables, sans quoi la réponse devient un oracle qui
      // guide la forge.
      if (jeton.length === 0 || jeton.length > TAILLE_MAX_JETON) return null;

      const morceaux = jeton.split(SEPARATEUR_JETON);
      if (morceaux.length !== 2) return null;
      const [encodee, signature] = morceaux;
      if (encodee === undefined || signature === undefined) return null;
      if (encodee.length === 0 || signature.length !== LONGUEUR_SIGNATURE_CURSEUR) return null;

      let decodee: unknown;
      try {
        decodee = JSON.parse(Buffer.from(encodee, "base64url").toString("utf8"));
      } catch {
        // Base64 illisible ou JSON invalide. Rien à distinguer : `null`.
        return null;
      }

      const charge = lireCharge(decodee);
      if (charge === null) return null;

      // ⚠️ L'ENCODAGE DOIT ÊTRE CELUI QUE `signer()` AURAIT PRODUIT — MESURÉ,
      //    pas supposé. Le décodage base64 de Node est INDULGENT : il ignore un
      //    groupe de fin incomplet, si bien que `<charge>` et `<charge>A`
      //    décodent les mêmes octets. Sans ce contrôle, un même curseur admet
      //    une famille de jetons distincts qui vérifient tous — la signature
      //    couvre la charge, jamais son écriture. Rien de faux n'en sortait :
      //    la fenêtre restait la bonne. Mais un jeton « valide » que le socle
      //    n'a pas émis est exactement ce dont on ne veut pas discuter le jour
      //    où quelqu'un le retrouve dans un journal. Une seule écriture par
      //    curseur, et c'est la forme canonique.
      const canonique = canoniser(charge);
      if (encodee !== encoder(canonique)) return null;

      const attendue = await calcul.calculer(charge);
      // Comparaison À TEMPS CONSTANT : un `===` fuirait, par son temps de
      // retour, le nombre de caractères de tête devinés — de quoi construire une
      // signature valide caractère par caractère.
      if (!calcul.correspond(attendue, signature)) return null;

      return charge;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE — implémentation du type `EtapeCurseur`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce régime de pagination accepte-t-il qu'un curseur lui soit présenté ?
 *
 * ⚠️ `switch` EXHAUSTIF, ET NON UNE COMPARAISON À `"none"`. Un quatrième régime
 *    ajouté à `PAGINATIONS` doit faire échouer la compilation ici, et non tomber
 *    par défaut du côté permissif — « accepte un curseur » est le côté où une
 *    erreur ouvre une fenêtre.
 */
function regimeAccepteUnCurseur(pagination: Pagination): boolean {
  switch (pagination) {
    // Le § 13.1 range les agrégateurs en `page`, avec « page + filtersHash ».
    // La confrontation est la MÊME que pour `keyset` : signature, puis empreinte
    // des filtres. Ce que les champs SIGNIFIENT appartient à l'adaptateur ; ce
    // que l'étape garantit, c'est qu'ils n'ont pas changé de filtres en route.
    case "keyset":
    case "page":
      return true;
    case "none":
      // § 13.1 : `getAgendaFenetre` n'a « ni limit ni curseur ». Un outil qui
      // n'en produit aucun n'a rien à quoi confronter celui qu'on lui présente.
      return false;
    default: {
      const _exhaustif: never = pagination;
      return _exhaustif;
    }
  }
}

/** Le conseil du § 15, écrit une fois : « repartir de la première page ». */
const CONSEIL_PREMIERE_PAGE =
  "Il faut repartir de la première page, c'est-à-dire rappeler l'outil sans curseur.";

/**
 * ÉTAPE 9 — le curseur est-il authentique, et porte-t-il les MÊMES filtres ?
 *
 * Le numéro (9) et le code (`cursor_invalid`) sont LUS dans `ETAPE_CURSEUR`,
 * lui-même dérivé d'`APPEL_STEPS`. Aucun des deux n'est écrit dans ce fichier.
 *
 * ⚠️ CE QUE LES MESSAGES DE REFUS NE PORTENT JAMAIS : ni le jeton reçu, ni
 *    l'une des deux empreintes de filtres, ni la signature attendue. Le § 15
 *    demande de dire QUOI FAIRE ; renvoyer l'empreinte attendue en dirait
 *    surtout assez pour s'en approcher.
 *
 * ⚠️ UNE EXCEPTION DU SIGNATAIRE N'EST PAS RATTRAPÉE. Si la clé manque, l'étape
 *    LÈVE — elle ne rend pas `cursor_invalid`. Voir `ErreurCleCurseur`.
 */
export const etapeCurseur: EtapeCurseur = async (
  contexte: ContexteCurseur,
): Promise<VerdictEtape<CurseurEtabli>> => {
  // La garde de la garde : sans empreinte courante, la confrontation du § 13.1
  // n'a plus rien à confronter. Elle LÈVE, elle ne refuse pas.
  if (contexte.filtersHashCourant.trim().length === 0) {
    throw new ErreurFiltersHashAbsent();
  }

  const accepte = regimeAccepteUnCurseur(contexte.pagination);

  if (contexte.jetonRecu === null) {
    // Première page. Aucun jeton à confronter, aucune fenêtre à reprendre —
    // y compris en `pagination: "none"`, où c'est le seul appel possible.
    return autorise(ETAPE_CURSEUR, { charge: null, reprise: false });
  }

  if (!accepte) {
    return refuse(
      ETAPE_CURSEUR,
      "Cet outil ne pagine pas et ne produit donc aucun curseur : celui qui est " +
        "présenté ne peut être confronté à rien, et vient forcément d'ailleurs. " +
        "Rappeler l'outil sans curseur.",
    );
  }

  // ⚠️ UN JETON VIDE OU BLANC N'EST PAS UNE PREMIÈRE PAGE. Le traiter comme
  //    absent absorberait en silence un défaut d'appelant — et le § 11 veut un
  //    refus qui se compte au § 24, pas une absorption.
  if (contexte.jetonRecu.trim().length === 0) {
    return refuse(
      ETAPE_CURSEUR,
      `Curseur vide : ce n'est pas un jeton, et ce n'est pas non plus une première page. ${CONSEIL_PREMIERE_PAGE}`,
    );
  }

  const charge = await contexte.signataire.verifier(contexte.jetonRecu);

  if (charge === null) {
    return refuse(
      ETAPE_CURSEUR,
      `Curseur invalide : sa signature ne correspond pas. ${CONSEIL_PREMIERE_PAGE}`,
    );
  }

  if (charge.filtersHash !== contexte.filtersHashCourant) {
    // Comparaison directe, et c'est délibéré : ces deux empreintes ne sont pas
    // des secrets, et surtout l'une d'elles VIENT D'ÊTRE AUTHENTIFIÉE par la
    // signature juste au-dessus. Pour sonder ce `===`, il faudrait déjà savoir
    // signer — c'est-à-dire n'avoir plus rien à sonder.
    return refuse(
      ETAPE_CURSEUR,
      "Curseur invalide : LES FILTRES DE L'APPEL ONT CHANGÉ depuis la page qui a " +
        "produit ce curseur. Le reprendre tel quel rendrait une fenêtre fausse sans " +
        `que rien ne le signale. ${CONSEIL_PREMIERE_PAGE}`,
    );
  }

  return autorise(ETAPE_CURSEUR, { charge, reprise: true });
};
