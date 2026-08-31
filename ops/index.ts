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
import { HOTE_SANS_MAGASIN_PARTAGE } from "../core/instance/postgres.js";
import { DepotPolitiqueMemoire } from "../core/policy/index.js";
import type {
  CatalogueServiEnStdio,
  DescripteurOutilServi,
} from "../core/transport/stdio/index.js";
import type { PontDIdentite } from "../core/transport/http/index.js";
import type { EtatCoffre } from "../core/vault/index.js";
import { Coffre, DepotEnMemoire, depuisEnvironnement } from "../core/vault/index.js";
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
  const { transports, inconnus } = lireLesTransports(deps.env[VARIABLES_DU_SERVICE.transports]);

  const refusDeReglage = [budget.refus, corps.refus, veille.refus].filter(
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
  const dependancesDuSocle: DependancesDuSocle = {
    urlDeBase: environnement.urlDeBase,
    ouvrirLaSessionDeVerrou: null,
    magasinEnMemoire: magasinLocal(),
    instance: frapperLInstanceDuProcessus(deps.maintenant()),
    lireLEtatDuCoffre,
    reglagesDAuthentification: environnement.reglagesDAuthentification,
    controlerLAuthentification: null,
    depotPolitique: new DepotPolitiqueMemoire(),
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

  // ── LE SERVICE ──────────────────────────────────────────────────────────────
  const catalogue = catalogueDesAdaptateursAdmis([]);
  const ports: PortsDuService = {
    // ⚠️ **LA CHAÎNE N'EST PAS COMPOSÉE, ET LE ZÉRO EST UNE MESURE.** Les
    //    quatorze étapes exigent un journal SCELLÉ (ADR 0002), des dépôts de
    //    quota et d'idempotence, un catalogue épinglé — aucun n'est câblé dans
    //    ce dépôt. Remettre un noyau de fortune ferait servir des appels
    //    qu'aucune ligne d'`ops_audit` n'atteste : `monterLeService` compte
    //    l'empêchement et ne monte rien.
    noyau: null,
    catalogue: catalogue.catalogue,
    habilitations: () => ({ peutVoirAppels: false }),
    verificateurDeJeton: null,
    registreDesJetons: null,
    pontDIdentite: PONT_AU_PLUS_FAIBLE,
    fluxDEntree: deps.flux.entree,
    fluxDeSortie: deps.flux.sortie,
    maintenant: deps.maintenant,
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
