/**
 * `ops/index.ts` — **LE POINT D'ENTRÉE DU PROCESSUS. LE SOCLE COMMENCE ICI.**
 *
 * ═══ LE MANQUE QUE CE FICHIER COMBLE ═══
 *
 * À la recette du lot 2, le dépôt ne portait AUCUN point d'entrée exécutable :
 * ni `bin` dans `package.json`, ni garde `import.meta.url` / `process.argv`, ni
 * shebang — alors que `ops/main.ts` titrait déjà une section « L'ENTRÉE DU
 * PROCESSUS » au-dessus de trois fabriques d'aide. « Le socle démarre » ne
 * désignait donc aucun geste possible : la seule façon de faire tourner la
 * racine était de l'appeler depuis une garde.
 *
 * ⚠️ **CE FICHIER LIT L'ENVIRONNEMENT ET LES ARGUMENTS ; TOUT LE RESTE LUI EST
 *    DONNÉ.** `demarrerLeProcessus` reçoit ses entrées-sorties en paramètres —
 *    l'environnement, l'horloge, les flux, le planificateur. Une garde peut donc
 *    le monter deux fois, sans `process`, sans socket, sans horloge réelle. Seul
 *    le bloc final, sous la garde d'entrée, touche `process`.
 *
 * ⚠️ **AUCUN RÉGLAGE N'A DE VALEUR PAR DÉFAUT.** Ni le budget d'appel, ni le
 *    plafond de corps, ni le port, ni la liste blanche d'hôtes. Le cahier des
 *    charges ne les fixe nulle part — le § 13 borne des TAILLES de résultat, le
 *    § 12 des DÉBITS —, et en inventer une reviendrait à décider, depuis le
 *    montage, combien de temps le socle travaille et combien de mémoire il
 *    accepte d'engager. Un réglage absent ou absurde REFUSE le démarrage.
 *
 * ⚠️ **AUCUN APPEL SORTANT, ET AUCUN SECRET N'EST JOURNALISÉ.** Les lignes
 *    écrites sur la sortie d'erreur nomment des VARIABLES et des GESTES, jamais
 *    une valeur.
 *
 * Voir **ADR 0023**, **ADR 0025**, **ADR 0034**.
 */

import { VARIABLE_DE_L_AUDIENCE } from "../core/auth/ressource.js";
import type { IdentiteAppelante, Transport } from "../core/chaine/orchestrateur.js";
import { TRANSPORTS } from "../core/chaine/orchestrateur.js";
import type { EtatIndexProvenance } from "../core/chaine/etape-11-provenance.js";
import { IndexProvenanceMemoire } from "../core/chaine/etape-11-provenance.js";
import type { OutilDuCatalogue } from "../core/chaine/index.js";
import { HOTE_SANS_MAGASIN_PARTAGE } from "../core/instance/postgres.js";
import { JournalMemoire } from "../core/audit/index.js";
import { DepotIdempotenceEnMemoire, DepotQuotaEnMemoire } from "../core/limits/index.js";
import { DepotPolitiqueMemoire } from "../core/policy/index.js";
import type { ProfileName } from "../core/profiles/index.js";
import type {
  CatalogueServiEnStdio,
  DescripteurOutilServi,
} from "../core/transport/stdio/index.js";
import type { PontDIdentite } from "../core/transport/http/index.js";
import type { EtatCoffre } from "../core/vault/index.js";
import {
  Coffre,
  DepotEnMemoire,
  NOM_CLE_ARG_HASH,
  NOM_CLE_SCEAU_JOURNAL,
  VERSION_CLE_ARG_HASH,
  VERSION_CLE_SCEAU_JOURNAL,
  depuisEnvironnement,
} from "../core/vault/index.js";
import type { NoyauCompose } from "./composition/index.js";
import {
  SANS_PONT_DE_CLE_DE_CURSEUR,
  TTL_IDEMPOTENCE_MAX_MS,
  composerLeNoyau,
} from "./composition/index.js";
import type { DependancesDuSocle, SocleDemarre } from "./main.js";
import {
  PLANIFICATEUR_PAR_INTERVALLE,
  SONDES_NON_POURVUES,
  demarrerLeSocle,
  frapperLInstanceDuProcessus,
  magasinLocal,
  reglagesDepuisLEnvironnement,
} from "./main.js";
import type { PortsDuService, ReglagesDuService, ServiceMonte } from "./service.js";
import { monterLeService } from "./service.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES VARIABLES QUE CE FICHIER LIT, ET ELLES SEULES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **GROUPÉES ICI POUR QUE `.env.example` ET LES GARDES EN DÉRIVENT.** Une
 *    liste recopiée dans le modèle de configuration diverge au premier ajout, et
 *    la divergence se découvre en essayant de démarrer.
 */
export const VARIABLES_DU_SERVICE = {
  /** Les colonnes du § 11 à monter. Séparées par des virgules. */
  transports: "OPS_TRANSPORTS",
  /** Le budget d'un appel, en millisecondes. C'est lui qui produit la `deadline`. */
  budgetMs: "OPS_CALL_BUDGET_MS",
  /** Le plafond du corps d'une requête HTTP, en octets. */
  octetsMaxDuCorps: "OPS_MAX_BODY_BYTES",
  /** Le port d'écoute HTTP. */
  portHttp: "OPS_HTTP_PORT",
  /** L'adresse d'écoute. Absente = boucle locale ; l'exposer se demande. */
  adresseHttp: "OPS_HTTP_ADDRESS",
  /** La période du battement de veille, en millisecondes. */
  periodeDeVeilleMs: "OPS_WATCH_PERIOD_MS",
  /**
   * § 09/§ 26 — la durée de vie d'une réservation d'idempotence.
   *
   * ⚠️ **ELLE N'A PAS DE DÉFAUT NON PLUS, ET LE CAHIER DES CHARGES N'EN DONNE
   *    AUCUN.** `core/limits/config.ts` pose une BORNE HAUTE
   *    (`TTL_IDEMPOTENCE_MAX_MS`, 24 h) et aucune valeur nominale. En inventer
   *    une reviendrait à décider, depuis le montage, combien de temps un `send`
   *    reste non rejouable — c'est-à-dire à quel moment un envoi peut repartir.
   */
  ttlIdempotenceMs: "OPS_IDEMPOTENCY_TTL_MS",
} as const;

/**
 * **LE GESTE DE PROVISION, ET IL EST EXPLICITE.**
 *
 * § 23 : un coffre `absent` refuse le démarrage, et le message NOMME la
 * commande. Provisionner est un geste humain, une fois par vie de base — le
 * faire tout seul au démarrage rendrait ce refus inatteignable, et personne ne
 * saurait jamais qu'une base a été remplacée sous le processus.
 *
 * ⚠️ **CET ARGUMENT NE VAUT QUE POUR LE MAGASIN LOCAL**, celui qui meurt avec le
 *    processus. Sur un magasin partagé réel, la provision passe par la commande
 *    d'exploitation, et {@link demarrerLeProcessus} refuse l'argument.
 */
export const ARGUMENT_DE_PROVISION_LOCALE = "--provisionner-le-coffre-local";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROCESSUS REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/** Les flux du démon stdio, décrits au plus étroit — voir `core/transport/stdio`. */
export interface FluxDuProcessus {
  readonly entree: {
    setEncoding(codage: "utf8"): unknown;
    on(evenement: "data", ecouteur: (morceau: string) => void): unknown;
  };
  readonly sortie: { write(donnees: string): unknown };
}

export interface DependancesDuProcessus {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly arguments: readonly string[];
  readonly flux: FluxDuProcessus;
  readonly maintenant: () => Date;
  readonly ecrireSurLaSortieDErreur: (ligne: string) => void;
  /** Injecté : une garde ne doit jamais attendre de vraies secondes. */
  readonly planifier: DependancesDuSocle["planifier"];
}

/** Ce que le processus rend. Il n'a plus qu'à sortir, ou à servir. */
export interface ProcessusDemarre {
  readonly socle: SocleDemarre;
  /**
   * TOUJOURS présent, **même quand rien n'est monté.** Un `null` se lirait
   * « le montage n'a pas eu lieu » et cacherait POURQUOI ; ici, un service qui
   * ne monte rien porte la liste de ses empêchements, et elle se lit.
   */
  readonly service: ServiceMonte;
  readonly codeDeSortie: number;
  /** Les lignes écrites sur la sortie d'erreur, dans l'ordre. Mesurables. */
  readonly lignes: readonly string[];
  arreter(): Promise<void>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES RÉGLAGES, LUS ET REFUSÉS
// ═════════════════════════════════════════════════════════════════════════════

/** Un réglage lu : sa valeur, ou le motif de son refus. Jamais les deux. */
interface LectureDeReglage {
  readonly valeur: number | null;
  readonly refus: string | null;
}

/**
 * Lit un entier strictement positif. **Absent est un refus, pas un défaut.**
 *
 * ⚠️ La borne haute existe parce qu'un « override sans borne haute fabrique la
 *    CVE suivante » : un budget d'appel d'un an ou un plafond de corps d'un
 *    gigaoctet sont des pannes qu'on demande, pas des réglages.
 */
function lireUnEntierBorne(
  env: Readonly<Record<string, string | undefined>>,
  nom: string,
  maximum: number,
): LectureDeReglage {
  const brut = env[nom];
  if (brut === undefined || brut.trim().length === 0) {
    return {
      valeur: null,
      refus:
        `Le réglage « ${nom} » est absent. Il n'a AUCUNE valeur par défaut : le cahier des ` +
        "charges ne le fixe nulle part, et en inventer une reviendrait à décider à la place " +
        "de l'exploitant. Le renseigner dans l'environnement du conteneur, puis redéployer.",
    };
  }
  const valeur = Number(brut.trim());
  if (!Number.isInteger(valeur) || valeur <= 0 || valeur > maximum) {
    return {
      valeur: null,
      refus:
        `Le réglage « ${nom} » n'est pas un entier compris entre 1 et ${String(maximum)}. ` +
        "Une valeur hors de ces bornes est une panne qu'on demande, pas un réglage.",
    };
  }
  return { valeur, refus: null };
}

/**
 * LES COLONNES DU § 11 À MONTER — **dérivées de `TRANSPORTS`, jamais recopiées.**
 *
 * ⚠️ Une liste vide est un refus de démarrer : un socle sans transport n'aurait
 *    aucun chemin par lequel servir un appel, et son healthcheck vert ne
 *    voudrait rien dire. C'est déjà la règle de l'étage 6 ; elle est appliquée
 *    ici sur la LECTURE, pour que le message nomme la variable.
 */
function lireLesTransports(brut: string | undefined): {
  readonly transports: readonly Transport[];
  readonly inconnus: readonly string[];
} {
  const noms = (brut ?? "")
    .split(",")
    .map((nom) => nom.trim())
    .filter((nom) => nom.length > 0);
  const transports: Transport[] = [];
  const inconnus: string[] = [];
  for (const nom of noms) {
    const connu = TRANSPORTS.find((candidat) => candidat === nom);
    if (connu === undefined) inconnus.push(nom);
    else if (!transports.includes(connu)) transports.push(connu);
  }
  return { transports, inconnus };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE COFFRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE MAGASIN DE SECRETS DU POSTE LOCAL, ET LUI SEUL.**
 *
 * ⚠️ `stub.invalid` EST LA CONVENTION DU DÉPÔT, PAS UNE INVENTION :
 *    `choisirImplementationDuVerrou` (ADR 0024) reconnaît déjà cet hôte comme
 *    « aucun magasin partagé ». Le coffre suit la même règle, dérivée du MÊME
 *    symbole — deux lectures d'un même fait finiraient par se contredire.
 *
 * ⚠️ **UN MAGASIN EN MÉMOIRE MEURT AVEC LE PROCESSUS**, et c'est ce qui le rend
 *    acceptable : il ne conserve rien, ne survit à rien, et ne peut donc pas
 *    devenir un coffre de production par inadvertance. Sur une URL de magasin
 *    RÉEL, ce fichier REFUSE plutôt que de deviner — le dépôt ne porte pas
 *    encore le câblage Prisma du coffre.
 */
function coffreLocalDemande(urlDeBase: string | undefined): boolean {
  return urlDeBase !== undefined && urlDeBase.includes(HOTE_SANS_MAGASIN_PARTAGE);
}

/**
 * **LES CLÉS HMAC QUE LE COFFRE LOCAL REÇOIT DE L'ENVIRONNEMENT, ET LEUR
 * UNIQUE LECTEUR.**
 *
 * ═══ LE MANQUE QUE CETTE TABLE COMBLE ═══
 *
 * `.env.example` déclare `OPS_ARGHASH_KEY` et `OPS_JOURNAL_SEAL_KEY` depuis le
 * lot 1, avec leur prose « FAIL-LOUD si elle manque » — et **aucun module du
 * dépôt ne les lisait**, mesuré au `grep` : zéro occurrence hors du modèle de
 * configuration. Symétriquement, `Coffre.lireCleArgHash` et
 * `Coffre.lireCleSceauJournal` lisent `ops_secret`, et **rien n'y écrit**. Les
 * deux bouts existaient ; le fil manquait.
 *
 * ⚠️ **CE SEMIS NE VAUT QUE POUR LE COFFRE LOCAL**, celui qui vit en mémoire et
 *    meurt avec le processus. Sur un magasin partagé, poser un secret est un
 *    geste d'exploitation — le faire tout seul au démarrage écraserait à chaque
 *    redéploiement une clé de scellement dont la rotation rend INVÉRIFIABLE tout
 *    le journal déjà scellé. {@link demarrerLeProcessus} ne l'appelle donc que
 *    sur le chemin `stub.invalid`.
 *
 * ⚠️ **LES NOMS ET LES VERSIONS SONT CEUX DU COFFRE, IMPORTÉS.** Les réécrire
 *    ici fabriquerait un second nom pour le même secret, et le coffre relirait
 *    éternellement une ligne que personne n'écrit — verte des deux côtés.
 */
export const CLES_HMAC_DU_COFFRE_LOCAL = [
  {
    variable: "OPS_JOURNAL_SEAL_KEY",
    nom: NOM_CLE_SCEAU_JOURNAL,
    version: VERSION_CLE_SCEAU_JOURNAL,
    pourquoi:
      "ADR 0002 — sans elle, la chaîne d'`ops_audit` n'est pas scellée et aucun appel " +
      "d'outil n'est servi",
  },
  {
    variable: "OPS_ARGHASH_KEY",
    nom: NOM_CLE_ARG_HASH,
    version: VERSION_CLE_ARG_HASH,
    pourquoi: "§ 12, règle 2 — `argHash` est un HMAC, jamais un SHA nu",
  },
] as const;

/**
 * Sème dans le coffre LOCAL les clés lues dans l'environnement, et rend combien
 * de secrets ont été RÉELLEMENT écrits.
 *
 * ⚠️ **UNE VARIABLE ABSENTE N'EST PAS SEMÉE, ET CE N'EST PAS UN ÉCHEC ICI.** Le
 *    refus appartient à qui a besoin de la clé : `creerScelleurJournal` lève
 *    bruyamment, `composerLeNoyau` en fait un empêchement nommé, et le montage
 *    ne monte aucun transport d'outils. Refuser ici ferait dire « clé absente »
 *    à un socle qui n'aurait pas encore essayé de s'en servir.
 *
 * ⚠️ **AUCUNE VALEUR N'EST JOURNALISÉE.** Le compte rendu ne porte que des NOMS
 *    de variables et un nombre — § 29, le dépôt est public.
 */
async function semerLesClesDuCoffreLocal(
  coffre: Coffre,
  env: Readonly<Record<string, string | undefined>>,
): Promise<{ readonly semees: readonly string[]; readonly absentes: readonly string[] }> {
  const semees: string[] = [];
  const absentes: string[] = [];
  for (const cle of CLES_HMAC_DU_COFFRE_LOCAL) {
    const brute = env[cle.variable];
    // Test de VÉRACITÉ, pas de nullité : une variable déclarée mais VIDE n'est
    // pas nullish, et une clé vide produit un HMAC parfaitement stable — public.
    if (brute === undefined || brute.trim().length === 0) {
      absentes.push(cle.variable);
      continue;
    }
    await coffre.ecrire(cle.nom, cle.version, Buffer.from(brute.trim(), "utf8"));
    semees.push(cle.variable);
  }
  return { semees, absentes };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES PORTS QUE CE PROCESSUS SAIT FOURNIR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE CATALOGUE EST DÉRIVÉ DES ADAPTATEURS ADMIS, PAS INVENTÉ.**
 *
 * L'étage 5 admet les manifestes que le verrou épingle ; ce processus n'en
 * soumet aucun, donc le catalogue est VIDE — et c'est un fait mesuré, pas un
 * bouchon. Le compte de lectures existe pour que « la liste est relue à chaque
 * `tools/list` » (§ 11) se voie par un nombre.
 *
 * ⚠️ **CE CATALOGUE NE FILTRE PAS PAR PROFIL, ET LA CONSÉQUENCE EST ÉCRITE.**
 *    L'étape 7 appartient à `core/profiles` ; un catalogue câblé sur
 *    l'inventaire COMPLET annoncerait des outils que l'étape 7 refuserait
 *    ensuite — un catalogue qui ment, et un modèle qui insiste. Tant qu'aucun
 *    adaptateur n'est épinglé, la question ne se pose pas : la liste est vide.
 *    Le jour où elle ne l'est plus, elle doit passer par `outilsServis()`.
 */
export function catalogueDesAdaptateursAdmis(admis: readonly DescripteurOutilServi[]): {
  readonly catalogue: CatalogueServiEnStdio;
  lectures(): number;
} {
  let lectures = 0;
  return {
    catalogue: {
      listerPourCetAppel(_identite: IdentiteAppelante): Promise<readonly DescripteurOutilServi[]> {
        lectures += 1;
        return Promise.resolve(admis);
      },
    },
    lectures: () => lectures,
  };
}

/**
 * § 19 bis — LE PONT D'IDENTITÉ, AU PLUS FAIBLE.
 *
 * ⚠️ **LE DÉFAUT EST `false`, ET C'EST LA DÉCISION W-6 DU § 19 bis.** En
 *    l'absence d'une source d'habilitations, un socle qui rendrait `true`
 *    laisserait voir les appels d'autrui à quiconque obtient un jeton. Le repli
 *    tombe du côté strict.
 */
export const PONT_AU_PLUS_FAIBLE: PontDIdentite = {
  habilitations: () => ({ peutVoirAppels: false }),
};

// ═════════════════════════════════════════════════════════════════════════════
//  LE PROCESSUS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LIT L'ENVIRONNEMENT, DÉMARRE LE SOCLE, MONTE LE SERVICE.**
 *
 * L'ordre suit celui de l'ADR 0023 : rien n'écoute avant que les sept étages
 * aient parlé. Un transport monté avant l'étage 1 aurait déjà servi des appels
 * quand le verrou aurait refusé.
 */
export async function demarrerLeProcessus(deps: DependancesDuProcessus): Promise<ProcessusDemarre> {
  const lignes: string[] = [];
  const dire = (ligne: string): void => {
    lignes.push(ligne);
    deps.ecrireSurLaSortieDErreur(ligne);
  };

  const environnement = reglagesDepuisLEnvironnement(deps.env);
  const audience = deps.env[VARIABLE_DE_L_AUDIENCE] ?? "";

  // ── LES RÉGLAGES DU SERVICE, LUS AVANT TOUT ─────────────────────────────────
  // ⚠️ AVANT le démarrage, et c'est délibéré : un socle qui prendrait le verrou
  //    d'instance puis refuserait sur un réglage absent laisserait derrière lui
  //    un verrou tenu par un processus mort.
  const budget = lireUnEntierBorne(deps.env, VARIABLES_DU_SERVICE.budgetMs, 600_000);
  const corps = lireUnEntierBorne(
    deps.env,
    VARIABLES_DU_SERVICE.octetsMaxDuCorps,
    64 * 1024 * 1024,
  );
  const port = lireUnEntierBorne(deps.env, VARIABLES_DU_SERVICE.portHttp, 65_535);
  const veille = lireUnEntierBorne(deps.env, VARIABLES_DU_SERVICE.periodeDeVeilleMs, 3_600_000);
  // ⚠️ LA BORNE HAUTE EST IMPORTÉE, JAMAIS RECOPIÉE. Recopier `24 * 3 600 000`
  //    ici resterait juste jusqu'au jour où `core/limits/config.ts` change — et
  //    ce jour-là le montage accepterait un TTL que `reserver()` refuse, sur un
  //    message qui parlerait d'autre chose.
  const ttlIdempotence = lireUnEntierBorne(
    deps.env,
    VARIABLES_DU_SERVICE.ttlIdempotenceMs,
    TTL_IDEMPOTENCE_MAX_MS,
  );
  const { transports, inconnus } = lireLesTransports(deps.env[VARIABLES_DU_SERVICE.transports]);

  const refusDeReglage = [budget.refus, corps.refus, veille.refus, ttlIdempotence.refus].filter(
    (refus): refus is string => refus !== null,
  );
  if (transports.length === 0) {
    refusDeReglage.push(
      `Le réglage « ${VARIABLES_DU_SERVICE.transports} » ne nomme aucun transport connu. ` +
        `Valeurs admises : ${TRANSPORTS.join(", ")}. Une liste vide est un refus de démarrer : ` +
        "un socle sans transport n'a aucun chemin par lequel servir un appel.",
    );
  }
  if (inconnus.length > 0) {
    refusDeReglage.push(
      `Le réglage « ${VARIABLES_DU_SERVICE.transports} » nomme ${String(inconnus.length)} ` +
        `transport(s) inconnu(s) [${inconnus.join(", ")}]. Valeurs admises : ${TRANSPORTS.join(", ")}.`,
    );
  }
  if (transports.includes("http") && port.refus !== null) refusDeReglage.push(port.refus);

  if (refusDeReglage.length > 0) {
    for (const refus of refusDeReglage) dire(`[démarrage · réglages] ${refus}`);
    dire(
      `[démarrage · réglages] ${String(refusDeReglage.length)} réglage(s) refusé(s) : le socle ` +
        "ne démarre pas. Aucun verrou n'a été pris, aucune socket n'a été ouverte.",
    );
    throw new ErreurDeReglageDuProcessus(refusDeReglage);
  }

  // ── LE COFFRE ───────────────────────────────────────────────────────────────
  const local = coffreLocalDemande(environnement.urlDeBase);
  const veutProvisionner = deps.arguments.includes(ARGUMENT_DE_PROVISION_LOCALE);
  if (veutProvisionner && !local) {
    dire(
      `[démarrage · coffre] L'argument « ${ARGUMENT_DE_PROVISION_LOCALE} » ne vaut que pour le ` +
        "magasin local, celui qui meurt avec le processus. Sur un magasin partagé, provisionner " +
        "est un geste d'exploitation, une fois par vie de base.",
    );
    throw new ErreurDeReglageDuProcessus([ARGUMENT_DE_PROVISION_LOCALE]);
  }

  const coffre = local
    ? await Coffre.ouvrir({
        depot: new DepotEnMemoire(),
        source: depuisEnvironnement(deps.env),
      })
    : null;

  if (coffre !== null && veutProvisionner && coffre.etat() === "absent") {
    // § 23 — le geste de provision, DEMANDÉ. Sur un magasin qui meurt avec le
    // processus, il ne laisse rien derrière lui.
    await coffre.provisionner();
    dire(
      "[démarrage · coffre] Coffre local PROVISIONNÉ pour ce processus. Il vit en mémoire et " +
        "disparaît à l'arrêt : aucun secret n'est écrit sur le disque.",
    );
    // ⚠️ **LE SEMIS SUIT LA PROVISION, ET LUI SEULE.** Un coffre déjà ouvert au
    //    démarrage porte ses propres secrets ; les écraser depuis
    //    l'environnement remplacerait une clé de scellement dont la rotation
    //    rend INVÉRIFIABLE tout le journal déjà scellé (§ 31, douze mois
    //    archivés). Ici le coffre vient de naître : il ne peut rien y avoir.
    const semis = await semerLesClesDuCoffreLocal(coffre, deps.env);
    dire(
      `[démarrage · coffre] ${String(semis.semees.length)} clé(s) HMAC semée(s) dans le coffre ` +
        `local sur ${String(CLES_HMAC_DU_COFFRE_LOCAL.length)} confrontée(s) ` +
        `[${semis.semees.join(", ") || "aucune"}]` +
        (semis.absentes.length === 0
          ? "."
          : ` · ${String(semis.absentes.length)} variable(s) absente(s) ou vide(s) ` +
            `[${semis.absentes.join(", ")}] : la chaîne des quatorze étapes ne se composera ` +
            "PAS, et le motif sera écrit ci-dessous."),
    );
  }

  const lireLEtatDuCoffre = (): Promise<EtatCoffre> => {
    if (coffre === null) {
      // ⚠️ FAIL-CLOSED SUR UN MAGASIN RÉEL NON CÂBLÉ. Le dépôt ne porte pas
      //    encore le câblage Prisma du coffre ; rendre « verrouillé » ferait
      //    démarrer un socle amputé sur une absence de code, et « ouvert »
      //    serait un mensonge. `absent` refuse, et le § 23 nomme le geste.
      return Promise.resolve("absent");
    }
    return Promise.resolve(coffre.etat());
  };

  // ── LE SOCLE ────────────────────────────────────────────────────────────────
  const index = new IndexProvenanceMemoire({ maintenant: deps.maintenant });
  // ⚠️ **UN SEUL DÉPÔT DE POLITIQUE POUR LE DÉMARRAGE ET POUR LA CHAÎNE.** Deux
  //    dépôts distincts feraient calculer le niveau de l'étape 10 sur des lignes
  //    où la ligne `setBy: "boot"` de l'étage 4 n'existerait pas — un socle qui
  //    aurait écrit sa ligne de démarrage et ne la verrait pas.
  const depotPolitique = new DepotPolitiqueMemoire();
  const dependancesDuSocle: DependancesDuSocle = {
    urlDeBase: environnement.urlDeBase,
    ouvrirLaSessionDeVerrou: null,
    magasinEnMemoire: magasinLocal(),
    instance: frapperLInstanceDuProcessus(deps.maintenant()),
    lireLEtatDuCoffre,
    reglagesDAuthentification: environnement.reglagesDAuthentification,
    controlerLAuthentification: null,
    depotPolitique,
    motifDuDemarrage: "démarrage du processus (ops/index.ts)",
    lireLeLockDAdaptateurs: () => Promise.resolve({ present: false, brut: null }),
    manifestesAAdmettre: [],
    transports,
    hotesAutorises: environnement.hotesAutorises,
    lireLaProvenance: (): EtatIndexProvenance => index.etat(),
    periodeDeVeilleMs: veille.valeur ?? 0,
    planifier: deps.planifier,
    sondes: SONDES_NON_POURVUES,
    horloge: deps.maintenant,
    ecrireSurLaSortieDErreur: dire,
  };

  const socle = await demarrerLeSocle(dependancesDuSocle);

  // ── LA CHAÎNE ───────────────────────────────────────────────────────────────
  //
  // ⚠️ **APRÈS LES SEPT ÉTAGES, ET C'EST LA MÊME RAISON QU'AILLEURS.** Composer
  //    avant l'étage 1 ferait lire la clé de scellement à un processus qui n'a
  //    pas encore pris le verrou d'instance — donc, derrière un répartiteur, à
  //    un second socle qui va sortir.
  //
  // ⚠️ **UN SOCLE QUI NE SERT PAS NE COMPOSE PAS.** Sous coffre `absent` ou
  //    `verrouillé`, `lireCleSceauJournal` LÈVE (`exigerOuvert`) : composer
  //    quand même transformerait le deuxième état du § 23 — le socle vit, sert
  //    la console, refuse les outils — en une panne de démarrage.
  //
  // ⚠️ **L'INVENTAIRE EST VIDE, ET LE ZÉRO EST UNE MESURE, PAS UN BOUCHON.**
  //    L'étage 5 admet les manifestes que le verrou épingle ; ce processus n'en
  //    soumet aucun (`manifestesAAdmettre: []`), donc aucun outil n'est servi et
  //    l'étape 6 refuse tout `tools/call`. C'est la seule liste, et le catalogue
  //    de la chaîne EN DÉRIVE — deux listes finiraient par se contredire.
  const outilsEpingles: readonly OutilDuCatalogue[] = [];
  const noyau: NoyauCompose =
    socle.demarrage.sert && socle.demarrage.appelsDOutilsAcceptes && coffre !== null
      ? await composerLeNoyau({
          coffreDuSceau: coffre,
          coffreDeLArgHash: coffre,
          coffreDuCurseur: SANS_PONT_DE_CLE_DE_CURSEUR,
          journalStore: new JournalMemoire(),
          coffre,
          // ⚠️ AUCUN ADAPTATEUR À JOINDRE, ET C'EST DÉCLARÉ. Le champ est
          //    obligatoire pour que chaque composition doive le DIRE : un
          //    optionnel absent se serait lu « on n'y a pas pensé ». Le jour où
          //    `outilsEpingles` cessera d'être vide, cette ligne devra fournir
          //    la lecture d'`ops_adapter` et le coffre — sinon l'étape 14
          //    refusera bruyamment, ce qui est le bon échec.
          federe: null,
          inventaire: () => Promise.resolve(outilsEpingles),
          // § 14 — `ops_runtime` n'est pas câblé : aucune ligne ne couvre ce
          // principal. `null` fait DÉRIVER le repli à l'orchestrateur
          // (`profilLeMoinsExposant` sur l'inventaire) ; élire un profil ici
          // reviendrait à choisir la surface servie depuis le montage.
          profilActif: (): Promise<ProfileName | null> => Promise.resolve(null),
          depotPolitique,
          depotQuota: new DepotQuotaEnMemoire(),
          depotIdempotence: new DepotIdempotenceEnMemoire(),
          index,
          ttlIdempotenceMs: ttlIdempotence.valeur ?? 0,
          secoursDAlerte: (incident) => {
            // § 24 — le dernier recours. Il ne porte ni secret ni contenu : le
            // nom complet de l'outil, la cause, et le compte d'écarts.
            dire(
              `[chaîne · § 20] ALERTE D'ÉPINGLAGE NON ÉMISE (${incident.cause}) pour ` +
                `« ${incident.alerte.nomComplet} » · ` +
                `${String(incident.alerte.ecarts.length)} écart(s) sur ` +
                `${String(incident.alerte.champsCompares)} champ(s) · outil désactivé : ` +
                `${String(incident.alerte.outilDesactive)}. Aucun canal du § 24 n'est câblé.`,
            );
          },
          maintenant: deps.maintenant,
        })
      : {
          fabrique: null,
          empechement:
            "le socle ne sert pas d'appels d'outils, ou son coffre n'est pas ouvert : la " +
            "chaîne n'a pas été composée. Le motif exact est celui que les sept étages ont " +
            "déjà écrit ci-dessus — il n'est pas récrit ici, une seconde rédaction finirait " +
            "par diverger de la première.",
          champsDeLOrchestrateur: 0,
          colonnesFrappees: (): number => 0,
        };
  dire(
    `[chaîne] ${String(noyau.champsDeLOrchestrateur)} champ(s) de ` +
      `\`DependancesOrchestrateur\` composé(s) · ${String(outilsEpingles.length)} outil(s) au ` +
      `catalogue · fabrique : ${noyau.fabrique === null ? "AUCUNE" : "posée"}`,
  );
  if (noyau.empechement !== null) dire(`[chaîne] ${noyau.empechement}`);

  // ── LE SERVICE ──────────────────────────────────────────────────────────────
  const catalogue = catalogueDesAdaptateursAdmis([]);
  const ports: PortsDuService = {
    // ⚠️ **LA FABRIQUE, OU `null` — ET LE `null` RESTE UNE MESURE.** Un noyau
    //    absent fait compter à `monterLeService` l'empêchement « la chaîne des
    //    quatorze étapes n'est pas composée », MOT POUR MOT : c'est la garde
    //    qui interdit qu'un transport serve des appels qu'aucune ligne
    //    d'`ops_audit` n'atteste. Elle n'a pas été assouplie ; elle est
    //    satisfaite quand la fabrique est là.
    noyau: noyau.fabrique,
    catalogue: catalogue.catalogue,
    habilitations: () => ({ peutVoirAppels: false }),
    verificateurDeJeton: null,
    registreDesJetons: null,
    pontDIdentite: PONT_AU_PLUS_FAIBLE,
    fluxDEntree: deps.flux.entree,
    fluxDeSortie: deps.flux.sortie,
    maintenant: deps.maintenant,
    // ⚠️ **LES DEUX PORTS DE L'ADR 0037 : LA FENTE EXISTE, ET CE PROCESSUS NE
    //    L'ARME PAS ENCORE. LE `null` EST ÉCRIT, MOTIVÉ, ET COMPTÉ.**
    //
    //    Le défaut que ce champ ferme n'était PAS « le port n'est pas armé » —
    //    c'était « le type n'offrait aucune fente pour l'armer », si bien que
    //    l'absence ne se voyait nulle part. Elle se voit maintenant :
    //    `monterLeService` rend `portsDAmontNonArmes`, et la ligne `[service]`
    //    ci-dessous la NOMME à chaque démarrage.
    //
    //    · `journalDesRefus` — le canal d'amont est DISTINCT d'`ops_audit`
    //      (ADR 0037 : y verser une ligne non scellée ferait un trou dans la
    //      chaîne de l'ADR 0002). Choisir ce canal depuis ce fichier
    //      reviendrait à décider, au montage, où va une trace de sécurité :
    //      c'est une décision de la racine, elle n'est pas tranchée, et
    //      l'inventer ici serait la recopier plutôt que la prendre.
    //    · `delaiDeReprise` — la seule source honnête du délai serait
    //      `RefusDetaille.retryAfterSecondes`, que `core/chaine/orchestrateur.ts`
    //      ne porte pas à ce jour. L'autre voie — relire le nombre dans le
    //      message français du refus — est exactement celle que l'ADR 0037
    //      interdit : un en-tête de protocole dérivé d'une phrase casse à la
    //      première reformulation, et il casse en silence.
    journalDesRefus: null,
    delaiDeReprise: null,
  };
  const adresseDemandee = deps.env[VARIABLES_DU_SERVICE.adresseHttp];
  const reglagesDuService: ReglagesDuService = {
    transports,
    hotesAdmis: environnement.hotesAutorises,
    audienceAttendue: audience,
    budgetMs: budget.valeur ?? 0,
    octetsMaxDuCorps: corps.valeur ?? 0,
    portHttp: port.valeur ?? 0,
    ...(adresseDemandee === undefined ? {} : { adresseHttp: adresseDemandee }),
  };

  const service = monterLeService(socle, ports, reglagesDuService);

  const sante = socle.healthcheck === null ? null : await socle.healthcheck();
  dire(
    `[démarrage] ${String(socle.demarrage.etagesConfrontes)} étage(s) confronté(s), ` +
      `${String(socle.demarrage.etagesFranchis)} franchi(s) · sert : ` +
      `${String(socle.demarrage.sert)} · coffre : « ${socle.demarrage.etatDuCoffre ?? "absent"} » · ` +
      `healthcheck : ${sante === null ? "AUCUN" : String(sante.statut)} · ` +
      `vaultLocked : ${sante === null ? "n/a" : String(sante.corps.vaultLocked)} · ` +
      `routes servies : [${(sante?.corps.routesServies ?? []).join(", ") || "aucune"}] · ` +
      `appels d'outils acceptés : ${String(sante?.corps.appelsDOutilsAcceptes ?? false)} · ` +
      `transports NOMMÉS : [${transports.join(", ")}] · ` +
      `transports MONTÉS : [${service.transportsMontes.join(", ") || "aucun"}] · ` +
      `colonnes FRAPPÉES : ${String(service.colonnesFrappees)} · ` +
      `ports d'amont NON ARMÉS : ` +
      `[${service.portsDAmontNonArmes.join(", ") || "aucun"}] · ` +
      `${String(service.empechements.length)} empêchement(s)`,
  );
  for (const empechement of service.empechements) dire(`[service] ${empechement}`);

  return {
    socle,
    service,
    codeDeSortie: socle.demarrage.codeDeSortie,
    lignes,
    arreter: async (): Promise<void> => {
      await service.arreter();
      await socle.arreter();
    },
  };
}

/** Levée quand un réglage manque ou n'a pas de sens. Le processus ne démarre pas. */
export class ErreurDeReglageDuProcessus extends Error {
  public readonly refus: readonly string[];

  public constructor(refus: readonly string[]) {
    super(
      `ops — ${String(refus.length)} réglage(s) refusé(s) : le socle ne démarre pas. ` +
        "Les motifs ont été écrits sur la sortie d'erreur.",
    );
    this.name = "ErreurDeReglageDuProcessus";
    this.refus = refus;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENTRÉE, ET ELLE EST LA SEULE CHOSE DE CE FICHIER QUI TOUCHE `process`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce module est-il le programme lancé, ou une bibliothèque importée ?
 *
 * ⚠️ **LA COMPARAISON PORTE SUR L'URL RÉSOLUE, PAS SUR LE CHEMIN.** Un
 *    `endsWith("index.js")` répondrait « oui » à n'importe quel module de même
 *    nom importé par un autre programme, et le socle démarrerait deux fois.
 */
export function estLeProgrammeLance(urlDuModule: string, argv: readonly string[]): boolean {
  const lance = argv[1];
  if (lance === undefined) return false;
  const resolu = new URL(`file://${lance.replace(/\\/gu, "/").replace(/^([A-Za-z]:)/u, "/$1")}`);
  return urlDuModule === resolu.href;
}

if (estLeProgrammeLance(import.meta.url, process.argv)) {
  demarrerLeProcessus({
    env: process.env,
    arguments: process.argv.slice(2),
    flux: { entree: process.stdin, sortie: process.stdout },
    maintenant: () => new Date(),
    ecrireSurLaSortieDErreur: (ligne) => {
      process.stderr.write(`${ligne}\n`);
    },
    planifier: PLANIFICATEUR_PAR_INTERVALLE,
  })
    .then(async (processus) => {
      process.exitCode = processus.codeDeSortie;
      if (!processus.socle.demarrage.sert) {
        await processus.arreter();
        return;
      }
      const adresse = await processus.service.ecouter();
      if (adresse !== null) {
        process.stderr.write(`[service] écoute sur ${adresse.adresse}:${String(adresse.port)}\n`);
      }
      // ⚠️ UN SOCLE QUI NE MONTE AUCUN TRANSPORT NE RESTE PAS EN VIE À NE RIEN
      //    FAIRE : il l'a dit sur la sortie d'erreur, et il sort. Un processus
      //    vivant qui n'écoute rien est indiscernable d'un socle en service.
      if (processus.service.transportsMontes.length === 0) {
        await processus.arreter();
      }
    })
    .catch((erreur: unknown) => {
      process.exitCode = 1;
      process.stderr.write(
        `[démarrage] ${erreur instanceof Error ? erreur.message : String(erreur)}\n`,
      );
    });
}
