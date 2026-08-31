/**
 * `core/transport/stdio/serveur.ts` — **LE DÉMON stdio : IL LIT, IL APPELLE LE
 * NOYAU, IL ÉCRIT. IL NE DÉCIDE DE RIEN.**
 *
 * ═══ POURQUOI CE TRANSPORT EST CELUI QUI COMPTE ═══
 *
 * Le § 23 range stdio en environnement LOCAL et le § 30 en fait la parade au
 * null-route : c'est le transport qui SURVIT à la panne du VPS, et c'est lui qui
 * portera le poste vocal. Le § 11 lui retire les quatre étapes « HTTP seul » —
 * il n'a ni `Host`, ni jeton, ni audience, ni `jti` à révoquer — et lui laisse
 * les onze autres. Il n'en exécute AUCUNE : il les délègue toutes au noyau.
 *
 * ═══ CE QUE CE FICHIER FRAPPE, ET CE QU'IL REFUSE DE RECOPIER ═══
 *
 * Deux valeurs du `ctx` sont classées « à-fermer-au-transport » depuis le lot 1c
 * (`STATUT_DES_CANAUX_DE_CONTEXTE`, ADR 0020) et attendaient ce dossier :
 *
 *  · **`requestId` est FRAPPÉ ICI** — `randomUUID()`, jamais l'`id` de
 *    l'enveloppe JSON-RPC. Un identifiant de corrélation choisi par l'appelant
 *    lui permet de faire converger deux appels dans la même ligne, ou d'en faire
 *    diverger un seul ; c'est aussi une chaîne libre de plusieurs dizaines
 *    d'octets qui atteint l'adaptateur, c'est-à-dire le canal même que
 *    l'ADR 0020 vient de fermer sur `idempotencyKey` ;
 *  · **`deadline` est CALCULÉE ICI** — `maintenant()` plus un budget BORNÉ. Un
 *    horodatage reçu recopié serait une valeur de plusieurs dizaines de bits
 *    choisie par l'appelant, et elle décide de la durée pendant laquelle le socle
 *    travaille.
 *
 * ⚠️ **LES DEUX SONT REFUSÉES À LA PORTE, PAS SEULEMENT IGNORÉES.** Les
 *    paramètres de `tools/call` sont une liste FERMÉE
 *    (`CLES_DE_PARAMETRES_DE_TOOLS_CALL`) : `deadline`, `requestId`, `sessionId`,
 *    `principal`, `scopes`, `policyLevel` — et tout nom qui n'existe pas encore —
 *    font refuser l'enveloppe. Une fermeture ne vieillit pas ; une liste noire,
 *    si.
 *
 * ═══ CE QU'IL N'IMPORTE PAS, ET C'EST LA MOITIÉ DE SA PREUVE ═══
 *
 * Aucun module d'étape. Ni `core/limits`, ni `core/policy`, ni `core/profiles`,
 * ni `core/vault`, ni aucun des cinq `etape-NN-*.ts`. L'ensemble interdit est
 * DÉRIVÉ d'`EXECUTANTS_ETAPES` par `modulesInterditsAuTransport()`, et
 * `etapes-exercees.temoin.spec.ts` confronte le graphe d'imports de ce dossier à
 * cet ensemble avec un témoin fabriqué.
 *
 * ⚠️ **ET IL NE FILTRE PAS `tools/list`.** La liste servie est celle que le port
 *    lui rend, telle quelle : décider quels outils un principal voit est
 *    l'étape 7 (`core/profiles`), et un transport qui trierait la liste
 *    lui-même refarait cette étape à côté du noyau — avec, à terme, deux règles
 *    qui divergent en silence. Ce que le § 11 exige du transport est autre chose,
 *    et il le tient : **la liste est RELUE à chaque `tools/list`**, jamais
 *    mémorisée entre deux appels, et `lecturesDuCatalogue` le compte.
 */

import { randomUUID } from "node:crypto";

import type { AppelStep, Habilitations, OpsScope } from "../../types.js";
import { identiteStdio, verifierCouvertureDesEtapes } from "../../chaine/orchestrateur.js";
import type {
  AppelEntrant,
  IdentiteAppelante,
  ResultatAppel,
  Transport,
} from "../../chaine/orchestrateur.js";
import type { NoyauUnique, ValeursFrappeesParLeTransport } from "../contrat.js";

import { creerDecoupeur, serialiser } from "./cadrage.js";
import type { Cadre, MesuresDuCadrage } from "./cadrage.js";
import {
  CLES_DE_PARAMETRES_DE_TOOLS_CALL,
  CODES_ENVELOPPE,
  clesRefuseesDeToolsCall,
  lireEnveloppe,
  reponseDErreur,
  reponseDeSucces,
  resultatRefuse,
} from "./protocole.js";
import type { CodeEnveloppe, IdJsonRpc, RequeteLue } from "./protocole.js";
import {
  confronterLesEtapesExercees,
  etapesDUneTrace,
  verifierLaColonneDuTransport,
} from "./etapes-exercees.js";
import type { RapportDEtapesExercees } from "./etapes-exercees.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE CE TRANSPORT EST
// ═════════════════════════════════════════════════════════════════════════════

/** Le transport servi par ce module. Écrit UNE fois, lu partout ailleurs. */
export const TRANSPORT_STDIO: Transport = "stdio";

/**
 * LES ÉTAPES QUE CE TRANSPORT PREND EN CHARGE LUI-MÊME : **aucune.**
 *
 * ⚠️ **CE VIDE EST UNE DÉCLARATION, PAS UN OUBLI, ET IL EST CONFRONTÉ AU
 *    MONTAGE.** `verifierLaColonneDuTransport` le compare à
 *    `colonneDuTransport("stdio").etapesAmont`. Les deux valent le vide
 *    aujourd'hui ; le jour où l'un cesse de l'être — un contrôle ajouté ici, ou
 *    une étape que le § 11 rendrait « stdio seul » —, le montage rougit avant le
 *    premier appel.
 */
export const ETAPES_PRISES_EN_CHARGE_PAR_STDIO: readonly AppelStep[] = [];

/**
 * Le budget d'un appel, en millisecondes, et son PLAFOND.
 *
 * ⚠️ **UN RÉGLAGE SANS BORNE HAUTE FABRIQUE LA PANNE SUIVANTE.** Un budget
 *    configurable sans plafond permet d'immobiliser le socle pour une durée
 *    arbitraire — et le § 30 rappelle qu'une instance stdio n'a **pas de jeton à
 *    révoquer** : on ne la coupe pas d'un geste. Le plafond est donc écrit ici,
 *    et le réglage est ramené dedans plutôt que refusé, pour qu'une valeur
 *    malheureuse ne fasse pas échouer un démarrage local.
 */
export const BUDGET_PAR_DEFAUT_MS = 30_000;
export const BUDGET_MAX_MS = 120_000;

/**
 * Un outil, tel que `tools/list` le sert sur le fil.
 *
 * ⚠️ **CE N'EST PAS `OutilDuCatalogue`, ET C'EST DÉLIBÉRÉ.** L'outil du
 *    catalogue porte l'`effect`, la `dataClass`, les profils, la compaction — des
 *    valeurs de GOUVERNANCE que le § 20 épingle côté socle et que le fil n'a
 *    aucune raison de voir. Le transport ne connaît que la forme du fil ; qui la
 *    construit, et à partir de quoi, appartient à la racine de composition.
 */
export interface DescripteurOutilServi {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

/**
 * LE CATALOGUE, VU DU TRANSPORT.
 *
 * ⚠️ **LE NOM DE LA MÉTHODE PORTE LA RÈGLE DU § 11.** « la liste est relue à
 *    chaque `tools/list` » : `listerPourCetAppel` ne peut pas être lue comme une
 *    lecture mémorisable, là où un `lister()` l'aurait été. Le transport ne
 *    mémorise rien, et `MesuresDuServeurStdio.lecturesDuCatalogue` le prouve par
 *    un nombre plutôt que par cette phrase.
 */
export interface CatalogueServiEnStdio {
  listerPourCetAppel(identite: IdentiteAppelante): Promise<readonly DescripteurOutilServi[]>;
}

/**
 * TOUT CE QUE LE SERVEUR REÇOIT DE L'EXTÉRIEUR.
 *
 * ⚠️ **NI `requestId`, NI `deadline`, NI `sessionId` N'EN FONT PARTIE.** Les deux
 *    premiers sont frappés et calculés ICI (voir l'en-tête) ; la troisième vient
 *    de `SESSION_DE_CETTE_EXECUTION` via `identiteStdio()`, et le paramètre a
 *    disparu de sa signature à l'ADR 0014. Les offrir en port aurait rendu au
 *    câblage ce que le socle vient de retirer à l'appelant.
 */
export interface PortsDuServeurStdio {
  /** LE SEUL chemin par lequel un appel d'outil atteint le socle (ADR 0025). */
  readonly noyau: NoyauUnique;
  readonly catalogue: CatalogueServiEnStdio;
  /** § 19 bis — CALCULÉES par le socle. Le fil ne les porte jamais. */
  readonly habilitations: () => Habilitations;
  /**
   * § 19.2 — les scopes de cette instance. **Absent vaut
   * `SCOPES_PAR_DEFAUT_STDIO`**, c'est-à-dire le plus étroit que la table
   * permette : `identiteStdio()` applique ce défaut, et ce module ne le recopie
   * pas. Il vient de la configuration du poste, JAMAIS du fil.
   */
  readonly scopes?: readonly OpsScope[];
  /** Ramené sous {@link BUDGET_MAX_MS}. Absent vaut {@link BUDGET_PAR_DEFAUT_MS}. */
  readonly budgetMs?: number;
  /** L'instant de référence. Injecté pour que la chaîne soit déterministe. */
  readonly maintenant: () => Date;
  /** Écrit UNE ligne, délimiteur compris, sur la sortie standard. */
  readonly ecrire: (ligne: string) => void;
  /** Le plafond du cadrage. Absent vaut celui de `cadrage.ts`. */
  readonly caracteresMaxParLigne?: number;
}

/** Les comptes du serveur. Des NOMBRES, jamais une couleur. */
export interface MesuresDuServeurStdio {
  readonly cadrage: MesuresDuCadrage;
  /** Enveloppes refusées avant qu'aucun appel ne soit formé. */
  readonly enveloppesFautives: number;
  readonly notificationsRecues: number;
  readonly toolsListServis: number;
  /** ⚠️ Il DOIT valoir `toolsListServis` : la liste est relue à chaque appel. */
  readonly lecturesDuCatalogue: number;
  readonly appelsAuNoyau: number;
  readonly reponsesEcrites: number;
  /** Clés de `params` refusées par la fermeture. Comptées, jamais nommées au fil. */
  readonly parametresRefuses: number;
  /**
   * Les étapes du § 11 que les appels de ce processus ont réellement touchées.
   *
   * ⚠️ **CET ACCUMULATEUR EST BORNÉ PAR CONSTRUCTION** — c'est un ensemble sur
   *    une union fermée de quinze valeurs, et non un compteur par appel. Il ne
   *    peut donc pas croître avec le trafic. C'est ce qui permet de l'exposer en
   *    production (§ 24) sans en faire une fuite de mémoire.
   */
  readonly etapesExercees: readonly AppelStep[];
}

/** Le démon monté. Il a un état — le tampon, les comptes —, d'où l'objet. */
export interface ServeurStdio {
  /** Absorbe un morceau du flux d'entrée et sert ce qu'il termine. */
  absorber(morceau: string): Promise<void>;
  mesures(): MesuresDuServeurStdio;
  /**
   * La couverture des étapes, confrontée à la colonne du § 11.
   *
   * ⚠️ **ELLE EST RENDUE PAR LE SERVEUR, ET PAS SEULEMENT PAR UN TEST.** L'écran
   *    Santé (§ 22) et le § 24 ont besoin de savoir quelles gardes ont réellement
   *    mordu depuis le démarrage : une garde qu'aucun appel n'a jamais atteinte
   *    est une garde dont on ne sait rien. La confronter en test seulement
   *    l'aurait laissée invisible en service.
   */
  rapportDeCouverture(): RapportDEtapesExercees;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE MONTAGE
// ═════════════════════════════════════════════════════════════════════════════

/** Lève au montage : une étape applicable au transport n'a aucun exécutant. */
export class ErreurDeMontageStdio extends Error {
  constructor(readonly sansExecutant: readonly AppelStep[]) {
    super(
      `Le transport stdio ne peut pas être monté : ${String(sansExecutant.length)} étape(s) du ` +
        `§ 11 applicable(s) n'ont aucun exécutant (${sansExecutant.join(", ")}). Servir un ` +
        "appel dans cet état, c'est le faire traverser une chaîne plus courte d'une garde " +
        "sans que rien ne le dise.",
    );
    this.name = "ErreurDeMontageStdio";
  }
}

/**
 * Monte le démon stdio.
 *
 * ⚠️ **LES DEUX CONTRÔLES DE MONTAGE S'EXÉCUTENT AVANT TOUTE ABSORPTION, ET ILS
 *    LÈVENT.** C'est l'interdit n° 3 de l'ADR 0025 — « la couverture est
 *    vérifiée AU DÉMARRAGE, pas seulement en test ». Un serveur qui se monterait
 *    sur une chaîne trouée et refuserait au premier appel aurait déjà écrit une
 *    ligne d'`ops_audit` par appel reçu, sous l'apparence d'appels normaux.
 */
export function creerServeurStdio(ports: PortsDuServeurStdio): ServeurStdio {
  // ── Interdit n° 3 : la chaîne est-elle complète pour CE transport ? ────────
  const couverture = verifierCouvertureDesEtapes(TRANSPORT_STDIO);
  if (couverture.sansExecutant.length > 0) {
    throw new ErreurDeMontageStdio(couverture.sansExecutant);
  }
  // ── Et le transport ne prend en charge que ce que sa colonne lui donne ─────
  verifierLaColonneDuTransport(TRANSPORT_STDIO, ETAPES_PRISES_EN_CHARGE_PAR_STDIO);

  const decoupeur =
    ports.caracteresMaxParLigne === undefined
      ? creerDecoupeur()
      : creerDecoupeur(ports.caracteresMaxParLigne);

  const budgetMs = Math.min(
    BUDGET_MAX_MS,
    Math.max(1, Math.trunc(ports.budgetMs ?? BUDGET_PAR_DEFAUT_MS)),
  );

  const etapesExercees = new Set<AppelStep>();
  let enveloppesFautives = 0;
  let notificationsRecues = 0;
  let toolsListServis = 0;
  let lecturesDuCatalogue = 0;
  let appelsAuNoyau = 0;
  let reponsesEcrites = 0;
  let parametresRefuses = 0;

  const ecrireReponse = (reponse: unknown): void => {
    ports.ecrire(serialiser(reponse));
    reponsesEcrites += 1;
  };

  const refuserLEnveloppe = (id: IdJsonRpc | null, code: CodeEnveloppe, message: string): void => {
    enveloppesFautives += 1;
    // ⚠️ Une notification n'a pas d'`id` : lui répondre désynchroniserait le
    //    client, qui n'attend rien. Le refus est COMPTÉ, et c'est tout ce qu'on
    //    peut faire sans inventer une réponse à une question qui n'a pas été posée.
    if (id === null) return;
    ecrireReponse(reponseDErreur(id, code, message));
  };

  /**
   * LES DEUX VALEURS QUE LE TRANSPORT FRAPPE. Elles sont produites ICI, dans une
   * fonction qui ne reçoit RIEN de l'enveloppe : c'est la forme la plus courte
   * d'une preuve que rien de reçu n'y entre.
   */
  const frapper = (): ValeursFrappeesParLeTransport => {
    const instant = ports.maintenant();
    return {
      requestId: randomUUID(),
      deadline: new Date(instant.getTime() + budgetMs),
      budgetMs,
    };
  };

  const identitePourCetAppel = (): IdentiteAppelante => {
    const frappees = frapper();
    // ⚠️ `identiteStdio()` IMPOSE le `principal` et la session (ADR 0014) : ce
    //    module ne les nomme pas, et ne pourrait pas les fabriquer — la marque de
    //    `SessionId` est un `unique symbol` non exporté.
    return ports.scopes === undefined
      ? identiteStdio({
          requestId: frappees.requestId,
          deadline: frappees.deadline,
          habilitations: ports.habilitations(),
        })
      : identiteStdio({
          requestId: frappees.requestId,
          deadline: frappees.deadline,
          habilitations: ports.habilitations(),
          scopes: ports.scopes,
        });
  };

  const retenirLesEtapes = (resultat: ResultatAppel): void => {
    for (const etape of etapesDUneTrace(resultat.trace)) etapesExercees.add(etape);
  };

  /** `initialize` — la poignée de main. Aucune étape du § 11 ne s'y applique. */
  const servirInitialize = (requete: RequeteLue): void => {
    ecrireReponse(
      reponseDeSucces(requete.id, {
        // ⚠️ AUCUN NUMÉRO DE RÉVISION N'EST ÉCRIT ICI. Le § 11 le dit lui-même :
        //    « la révision courante de la spécification MCP doit être relue » et
        //    « ni ce document ni le cahier des charges ne font autorité sur un
        //    numéro de révision ». Le socle renvoie donc ce que le client a
        //    annoncé — la seule valeur dont on sache qu'elle est vraie pour lui —
        //    et la négociation reste à écrire quand la révision aura été relue.
        protocolVersion: requete.params["protocolVersion"] ?? null,
        // § 11 — UNE seule primitive en v1.
        capabilities: { tools: {} },
        serverInfo: { name: "axion-ops", transport: TRANSPORT_STDIO },
      }),
    );
  };

  const servirToolsList = async (requete: RequeteLue): Promise<void> => {
    toolsListServis += 1;
    const identite = identitePourCetAppel();
    // § 11 — RELUE. Aucune mémorisation entre deux appels : `lecturesDuCatalogue`
    // doit rester égal à `toolsListServis`, et une garde le mesure.
    lecturesDuCatalogue += 1;
    const outils = await ports.catalogue.listerPourCetAppel(identite);
    ecrireReponse(reponseDeSucces(requete.id, { tools: outils }));
  };

  const servirToolsCall = async (requete: RequeteLue): Promise<void> => {
    // ── La FERMETURE des paramètres, avant toute autre lecture ───────────────
    const verdict = clesRefuseesDeToolsCall(requete.params);
    if (verdict.refusees.length > 0) {
      parametresRefuses += verdict.refusees.length;
      refuserLEnveloppe(
        requete.id,
        CODES_ENVELOPPE.parametresInvalides,
        // ⚠️ Les noms refusés NE SONT PAS recopiés : un écho de chaîne libre
        //    rendrait au client, par le canal d'erreur, ce qu'il vient
        //    d'envoyer — et parmi ces clés peut se trouver un jeton de
        //    confirmation mal placé (§ 20). Ce qui sort est la liste de ce qui
        //    est ADMIS, qui ne vient pas de lui.
        `${String(verdict.refusees.length)} paramètre(s) non servi(s). Les seules clés ` +
          `admises par « tools/call » sont : ${CLES_DE_PARAMETRES_DE_TOOLS_CALL.join(", ")}.`,
      );
      return;
    }

    const nom = requete.params["name"];
    if (typeof nom !== "string" || nom.length === 0) {
      refuserLEnveloppe(
        requete.id,
        CODES_ENVELOPPE.parametresInvalides,
        "Le paramètre « name » est absent ou n'est pas une chaîne. Il porte le nom COMPLET " +
          "de l'outil, tel que « tools/list » le sert.",
      );
      return;
    }

    const idempotencyKey = requete.params["idempotencyKey"];
    const cursor = requete.params["cursor"];
    const confirmation = requete.params["confirmation"];
    for (const [cle, valeur] of [
      ["idempotencyKey", idempotencyKey],
      ["cursor", cursor],
      ["confirmation", confirmation],
    ] as const) {
      if (valeur !== undefined && typeof valeur !== "string") {
        refuserLEnveloppe(
          requete.id,
          CODES_ENVELOPPE.parametresInvalides,
          `Le paramètre « ${cle} » doit être une chaîne quand il est présent.`,
        );
        return;
      }
    }

    const appel: AppelEntrant = {
      nomComplet: nom,
      // ⚠️ La charge est remise BRUTE. Elle n'est validée qu'à l'étape 8, par le
      //    schéma de l'outil — et le transport n'a pas à la connaître.
      input: requete.params["arguments"] ?? {},
      idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : null,
      curseur: typeof cursor === "string" ? cursor : null,
      jetonDeConfirmation: typeof confirmation === "string" ? confirmation : null,
    };

    const identite = identitePourCetAppel();
    appelsAuNoyau += 1;

    let resultat: ResultatAppel;
    try {
      resultat = await ports.noyau(identite, appel);
    } catch {
      // ⚠️ AUCUNE TRACE DE PILE NE SORT (§ 15). Et l'`id` de corrélation rendu
      //    est celui de l'enveloppe, pas le `requestId` frappé : ce dernier vit
      //    dans le `ctx` et dans les journaux du socle, et le publier sur le fil
      //    rendrait à l'appelant une valeur qu'on vient de lui retirer.
      refuserLEnveloppe(
        requete.id,
        CODES_ENVELOPPE.interne,
        "Le socle n'a pas pu mener cet appel à son terme. Réessayer ; si l'erreur persiste, " +
          "consulter l'écran Santé de la console.",
      );
      return;
    }

    retenirLesEtapes(resultat);

    if (resultat.refus !== null) {
      // ⚠️ UN REFUS DE LA CHAÎNE EST UN RÉSULTAT, PAS UNE ERREUR DE PROTOCOLE.
      //    Voir l'en-tête de `protocole.ts` : le § 15 fait d'un refus une réponse
      //    NORMALE, et un code JSON-RPC négatif ferait réessayer le transport là
      //    où il faut corriger l'appel.
      ecrireReponse(
        reponseDeSucces(
          requete.id,
          resultatRefuse(resultat.refus.etape, resultat.refus.code, resultat.refus.message),
        ),
      );
      return;
    }

    if (resultat.terminaison.genre !== "succès") {
      // ⚠️ CHEMIN INATTEIGNABLE PAR CONTRAT, ET TRAITÉ QUAND MÊME. `ResultatAppel`
      //    pose `refus: null` sur un succès ; une terminaison de refus avec un
      //    `refus` nul serait une incohérence INTERNE au noyau. Le transport ne la
      //    répare pas — il refuserait alors sans savoir à quelle étape — et il ne
      //    la sert pas comme un succès, ce qui rendrait une charge vide sous
      //    l'apparence d'un appel servi.
      refuserLEnveloppe(
        requete.id,
        CODES_ENVELOPPE.interne,
        "Le socle a rendu une terminaison que ce transport ne sait pas servir. " +
          "Consulter l'écran Santé de la console.",
      );
      return;
    }

    const servie = resultat.terminaison.valeur;
    ecrireReponse(
      reponseDeSucces(requete.id, {
        isError: false,
        // Le genre distingue une exécution d'un REJEU (§ 11, étape 13) : loger un
        // rejeu comme une exécution ferait croire à un appel servi.
        genre: servie.genre,
        content:
          servie.genre === "exécuté"
            ? [{ type: "text", text: JSON.stringify(servie.execution.charge) }]
            : [],
        resultRef: servie.genre === "rejeu" ? servie.resultRef : null,
      }),
    );
  };

  const servir = async (cadre: Cadre): Promise<void> => {
    if (cadre.genre === "rebut") {
      // ⚠️ **RIEN N'EST INCRÉMENTÉ ICI, ET C'EST UNE DÉCISION.** Le cadrage compte
      //    déjà cette ligne, PAR CAUSE (`mesures().cadrage.rebuts`). La recompter
      //    en « enveloppe fautive » confondrait deux familles qui appellent des
      //    gestes opposés : un cadrage qui rejette est un client qui déborde ou qui
      //    sonde, une enveloppe fautive est un client qui parle mal JSON-RPC. Et
      //    on ne peut pas répondre : une ligne qu'on n'a pas su lire ne porte
      //    aucun `id` connu.
      return;
    }

    const enveloppe = lireEnveloppe(cadre.valeur);
    if (enveloppe.genre === "enveloppe-fautive") {
      refuserLEnveloppe(enveloppe.id, enveloppe.code, enveloppe.message);
      return;
    }
    if (enveloppe.genre === "notification") {
      notificationsRecues += 1;
      return;
    }

    switch (enveloppe.methode) {
      case "initialize":
        servirInitialize(enveloppe);
        return;
      case "notifications/initialized":
        // Servie comme requête, elle n'a rien à rendre — mais le client attend
        // une réponse puisqu'il a mis un `id`. On lui rend un succès vide plutôt
        // que de le laisser en attente.
        ecrireReponse(reponseDeSucces(enveloppe.id, {}));
        return;
      case "tools/list":
        await servirToolsList(enveloppe);
        return;
      case "tools/call":
        await servirToolsCall(enveloppe);
        return;
    }
  };

  return {
    async absorber(morceau: string): Promise<void> {
      // ⚠️ LES CADRES SONT SERVIS DANS L'ORDRE, ET SÉQUENTIELLEMENT. Les servir
      //    en parallèle rendrait l'ordre des réponses dépendant de la durée des
      //    appels — et surtout, l'étape 13 du § 11 (idempotence) se prononce sur
      //    un état partagé : deux appels concurrents porteurs de la même clé
      //    doivent se croiser DANS le dépôt, pas dans ce transport.
      for (const cadre of decoupeur.absorber(morceau)) {
        await servir(cadre);
      }
    },

    mesures(): MesuresDuServeurStdio {
      return {
        cadrage: decoupeur.mesures(),
        enveloppesFautives,
        notificationsRecues,
        toolsListServis,
        lecturesDuCatalogue,
        appelsAuNoyau,
        reponsesEcrites,
        parametresRefuses,
        etapesExercees: [...etapesExercees].sort((a, b) => a - b),
      };
    },

    rapportDeCouverture(): RapportDEtapesExercees {
      return confronterLesEtapesExercees(TRANSPORT_STDIO, etapesExercees, appelsAuNoyau);
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ATTACHE AUX FLUX STANDARD — la dernière ligne entre « écrit » et « branché »
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le flux d'entrée, décrit par ce dont ce module a besoin — et rien de plus.
 *
 * ⚠️ **STRUCTUREL, ET JAMAIS `NodeJS.ReadStream`.** Nommer le type de Node
 *    rendrait cette fonction inéprouvable sans un vrai `process.stdin` : la
 *    garde devrait alors détourner un flux du processus qui l'exécute, ce qui
 *    est exactement le genre de test qu'on désactive au premier ennui. Deux
 *    méthodes suffisent ; un double les porte en trois lignes.
 */
export interface FluxDEntreeStdio {
  setEncoding(codage: "utf8"): unknown;
  on(evenement: "data", ecouteur: (morceau: string) => void): unknown;
}

/** Le flux de sortie, décrit de la même façon. */
export interface FluxDeSortieStdio {
  write(donnees: string): unknown;
}

/** Ce que l'attache rend, pour que la racine de composition puisse la mesurer. */
export interface AttacheAuxFlux {
  /** Morceaux de flux reçus. Zéro veut dire que rien n'est jamais arrivé. */
  morceauxRecus(): number;
  /**
   * Les levées survenues pendant le service d'un morceau.
   *
   * ⚠️ **ELLES SONT COMPTÉES, JAMAIS AVALÉES EN SILENCE.** Un écouteur `data`
   *    est appelé par le moteur, hors de toute pile qui pourrait rattraper : une
   *    promesse rejetée y devient un rejet non géré, c'est-à-dire un processus
   *    qui meurt sans rien dire. Le compte est ce qui distingue « le socle n'a
   *    rien reçu » de « le socle meurt sur ce qu'il reçoit ».
   */
  levees(): number;
  /** La chaîne de service en cours. La racine l'attend avant de sortir. */
  aQuai(): Promise<void>;
}

/**
 * Branche un serveur monté sur des flux d'entrée et de sortie.
 *
 * ⚠️ **LA SÉRIALISATION EST LE POINT, ET ELLE N'EST PAS UN DÉTAIL
 *    D'IMPLÉMENTATION.** `absorber` est asynchrone et les événements `data`
 *    arrivent quand ils veulent : sans la chaîne de promesses ci-dessous, deux
 *    morceaux se serviraient en parallèle, l'ordre des réponses deviendrait
 *    fonction de la durée des appels, et — beaucoup plus grave — deux appels
 *    porteurs de la même clé d'idempotence se croiseraient DANS CE TRANSPORT au
 *    lieu de se croiser dans le dépôt, à l'étape 13. Ce serait déplacer une
 *    décision du § 11 hors du noyau, ce que l'ADR 0025 existe pour empêcher.
 *
 * ⚠️ **ELLE NE PREND PAS LE FLUX DE SORTIE, ET C'EST DÉLIBÉRÉ.** L'écriture est
 *    un PORT du MONTAGE (`ecrireSurLeFlux`), pas de l'abonnement : les deux se
 *    posent à des instants différents, et un troisième paramètre inutilisé aurait
 *    laissé croire que l'attache écrit. Elle ne fait que lire.
 *
 * ⚠️ **CETTE FONCTION N'OUVRE AUCUN FLUX ET N'EN FERME AUCUN.** Elle ne nomme ni
 *    `process`, ni `stdin`, ni `stdout` : c'est la racine de composition qui les
 *    lui remet. Un module de `core/` qui saisirait les flux du processus
 *    deviendrait impossible à monter deux fois, et impossible à éprouver sans
 *    mutiler l'exécutant.
 */
export function brancherSurLesFlux(
  serveur: ServeurStdio,
  entree: FluxDEntreeStdio,
): AttacheAuxFlux {
  entree.setEncoding("utf8");

  let morceaux = 0;
  let levees = 0;
  let chaine: Promise<void> = Promise.resolve();

  entree.on("data", (morceau: string) => {
    morceaux += 1;
    chaine = chaine.then(async () => {
      try {
        await serveur.absorber(morceau);
      } catch {
        // ⚠️ ON COMPTE, ET ON NE RELANCE PAS. Relancer ici transformerait une
        //    ligne fautive en rejet non géré, donc en mort du processus : le
        //    § 30 rappelle qu'une instance stdio se coupe par une procédure
        //    dédiée, pas par un client qui envoie ce qu'il veut. Et on n'écrit
        //    rien sur la sortie : on ne sait pas quel `id` était concerné, et
        //    une réponse sans `id` juste désynchroniserait le client.
        levees += 1;
      }
    });
  });

  return {
    morceauxRecus: () => morceaux,
    levees: () => levees,
    aQuai: () => chaine,
  };
}

/**
 * Le port `ecrire` d'un flux de sortie. À passer à `creerServeurStdio`.
 *
 * Séparé de {@link brancherSurLesFlux} parce que les deux se posent à des
 * instants différents : l'écriture est un PORT du montage, la lecture un
 * abonnement qui vient après. Les réunir aurait obligé à monter le serveur
 * depuis l'attache, donc à lui confier tous les autres ports.
 */
export function ecrireSurLeFlux(sortie: FluxDeSortieStdio): (ligne: string) => void {
  return (ligne: string): void => {
    sortie.write(ligne);
  };
}
