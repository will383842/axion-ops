/**
 * `core/chaine/etape-06-outil.ts` — ÉTAPE 6 DU § 11 : l'outil existe-t-il, et
 * est-il activé ?
 *
 * ═══ LA RÈGLE QUI COMMANDE TOUT LE FICHIER ═══
 *
 * § 21, portée des interrupteurs : « `ops_tool.enabled` côté socle FAIT FOI.
 * Aucune console d'adaptateur côté Axion-IA — elle fabriquerait un état de
 * vérité double. » Et § 14, correction 3 : « `ops_tool.enabled` bascule en
 * console SANS redéploiement : la valeur mesurée en CI n'est jamais celle qui
 * est servie. »
 *
 * Trois conséquences, tenues ici :
 *
 *  1. l'étape relit le catalogue À CHAQUE APPEL, par le port
 *     `CatalogueOutils` — aucun cache de processus, aucune mémoïsation. Un
 *     cache servirait l'ancienne valeur jusqu'au prochain redémarrage,
 *     c'est-à-dire qu'une désactivation d'urgence en console ne désactiverait
 *     rien ;
 *  2. elle ne lit JAMAIS une déclaration d'adaptateur pour décider. La
 *     déclaration reçue n'entre ici que comme OBJET DE CONFRONTATION, jamais
 *     comme source ;
 *  3. le numéro d'étape et le code de refus sont DÉRIVÉS d'`APPEL_STEPS` via
 *     `ETAPE_CATALOGUE` — aucun `6` ni `"tool_disabled"` écrit à la main.
 *
 * ═══ LA RÈGLE D'ÉPINGLAGE DU § 20, ET POURQUOI ELLE VIT ICI ═══
 *
 * § 20, mot pour mot : « `ops_tool` porte `effect` et `dataClass`. TOUT ÉCART
 * ENTRE LA VALEUR ÉPINGLÉE ET LA VALEUR REÇUE DÉSACTIVE L'OUTIL ET ALERTE, au
 * lieu de mettre à jour en silence. Un `effect` basculé de `send` à `read` n'est
 * ni un champ ajouté ni un champ disparu : sans cette règle IL N'APPARAÎT NULLE
 * PART. »
 *
 * Le registre (`core/registry/enregistrer.ts`) attrape déjà cette dérive À
 * L'ENREGISTREMENT, et par un autre moyen : l'empreinte SHA du manifeste
 * complet, confrontée à `adapters.lock.json`. Cette garde-là ne couvre QUE le
 * chemin « un humain relit et ré-épingle ». Elle ne voit rien d'un adaptateur
 * déjà enregistré qui se remet à annoncer autre chose entre deux
 * enregistrements — poignée de main, rafraîchissement de `lastSeenAt`,
 * redéploiement de l'adaptateur sans passage par le verrou. C'est ce
 * chemin-là, et lui seul, que cette étape ferme. Les deux ne se remplacent pas.
 *
 * ⚠️ L'ORDRE DES DEUX CONTRÔLES N'EST PAS LIBRE : L'ÉPINGLAGE PASSE AVANT
 *    `enabled`. Un outil déjà désactivé dont l'`effect` vient de basculer est
 *    précisément le cas que le § 20 décrit : refuser d'abord sur `enabled`
 *    rendrait un `tool_disabled` parfaitement exact, et la divergence
 *    n'apparaîtrait NULLE PART. On confronte donc toujours, puis on refuse.
 *    L'écriture de désactivation est idempotente ; alerter deux fois vaut mieux
 *    que ne pas alerter une fois.
 *
 * ⚠️ CE QUE CETTE ÉTAPE NE PROUVE PAS. Elle ne confronte que ce qu'on lui
 *    REMET : si `DeclarationsRecues.relire()` rend `null`, il n'y a rien à
 *    confronter, `champsCompares` vaut 0 et la garde d'épinglage est INERTE
 *    pour cet appel. C'est pour cette raison que `VerdictEpinglage` porte
 *    `comparaisonImpossible` et un COMPTE, et non un booléen « conforme » :
 *    « aucun écart » et « rien n'a été comparé » sont deux faits différents, et
 *    une garde qui les confond est verte pour la pire des raisons.
 *
 * ═══ CE QUE CE FICHIER N'ÉCRIT PAS ═══
 *
 * Aucun SQL, aucun Prisma, aucun réseau. La désactivation et l'alerte sont des
 * PORTS, pour la même raison que `core/audit` n'a pas de store : une garde qui
 * ne peut pas fabriquer la panne ne prouve rien.
 */

import type { DataClass, Effect } from "../types.js";
import { ETAPE_CATALOGUE, autorise, refuse } from "./etapes.js";
import type {
  CatalogueEtabli,
  ContexteCatalogue,
  EtapeCatalogue,
  OutilDuCatalogue,
  VerdictEtape,
} from "./etapes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI EST ÉPINGLÉ — dérivé d'un type, jamais d'une liste écrite deux fois
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA DÉCLARATION REÇUE D'UN ADAPTATEUR pour un outil, réduite aux seuls champs
 * que le § 20 épingle.
 *
 * ⚠️ ELLE NE PORTE RIEN D'AUTRE, ET C'EST DÉLIBÉRÉ. Y ajouter `enabled`,
 *    `profiles` ou `maxBytes` ouvrirait le chemin exact que le § 21 ferme : un
 *    adaptateur qui se prononce sur ce que le socle sert. Le socle confronte ce
 *    que l'adaptateur ANNONCE ; il ne s'en sert jamais pour décider.
 */
export interface DeclarationOutilRecue {
  /** § 20 — épinglé dans `ops_tool.effect`. */
  readonly effect: Effect;
  /** § 20 — épinglé dans `ops_tool.dataClass`. */
  readonly dataClass: DataClass;
}

/** Un champ épinglé, DÉRIVÉ de la forme de la déclaration reçue. */
export type ChampEpingle = keyof DeclarationOutilRecue;

/**
 * La table des champs épinglés — écrite comme un type MAPPÉ, pas comme un
 * tableau.
 *
 * ⚠️ C'EST CE QUI REND LA LISTE TOTALE DANS LES DEUX SENS. Un tableau littéral
 *    `["effect", "dataClass"]` accepterait sans broncher qu'un troisième champ
 *    entre dans `DeclarationOutilRecue` sans jamais être confronté : la
 *    confrontation continuerait de mesurer deux champs, verte, et le § 20
 *    cesserait d'être tenu sur le troisième — en silence. Ici le compilateur
 *    exige une entrée par clé, et une seule.
 */
const TABLE_CHAMPS_EPINGLES: { readonly [K in ChampEpingle]: K } = {
  effect: "effect",
  dataClass: "dataClass",
};

/**
 * LES CHAMPS QUE LE § 20 ÉPINGLE, dérivés de la table ci-dessus.
 *
 * L'ordre est celui de la déclaration : il est stable, donc les messages de
 * refus le sont aussi.
 */
export const CHAMPS_EPINGLES: readonly ChampEpingle[] = Object.values(TABLE_CHAMPS_EPINGLES);

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT D'ÉPINGLAGE — un compte, jamais un booléen
// ═════════════════════════════════════════════════════════════════════════════

/** Un champ dont la valeur reçue diverge de la valeur épinglée. */
export interface EcartDEpinglage {
  readonly champ: ChampEpingle;
  /** Ce que `ops_tool` porte — la valeur QUI FAIT FOI. */
  readonly epingle: string;
  /** Ce que l'adaptateur vient d'annoncer. Elle ne sera JAMAIS appliquée. */
  readonly recu: string;
}

/**
 * Ce que la confrontation rend.
 *
 * ⚠️ `champsCompares` N'EST PAS DÉCORATIF. Une confrontation qui rend « aucun
 *    écart » sur zéro champ comparé est indiscernable d'une confrontation
 *    saine. C'est le compte, pas la couleur, qui le dit — même motif que le
 *    `champsMasques` du port `Masquage` (§ 19 bis) et que le plancher-témoin du
 *    budget (§ 14).
 */
export interface VerdictEpinglage {
  /** Combien de champs ont été effectivement confrontés. */
  readonly champsCompares: number;
  /** Vrai quand AUCUNE déclaration n'a été reçue : il n'y avait rien à comparer. */
  readonly comparaisonImpossible: boolean;
  readonly ecarts: readonly EcartDEpinglage[];
}

/**
 * CONFRONTE la déclaration reçue à la valeur épinglée, champ par champ.
 *
 * Fonction PURE, sans port ni date : c'est elle que les gardes exercent
 * directement, et c'est d'elle que l'étape tire sa décision.
 *
 * @param epingle ce que `ops_tool` porte — la source de vérité (§ 21).
 * @param recue   ce que l'adaptateur annonce, ou `null` si rien n'a été reçu.
 */
export function confronterEpinglage(
  epingle: Pick<OutilDuCatalogue, ChampEpingle>,
  recue: DeclarationOutilRecue | null,
): VerdictEpinglage {
  if (recue === null) {
    // Rien reçu n'est PAS « conforme ». Le dire ainsi, et non par un tableau
    // d'écarts vide, est la seule façon qu'un appelant ait de distinguer une
    // confrontation saine d'une confrontation qui n'a pas eu lieu.
    return { champsCompares: 0, comparaisonImpossible: true, ecarts: [] };
  }

  const ecarts: EcartDEpinglage[] = [];
  let champsCompares = 0;

  for (const champ of CHAMPS_EPINGLES) {
    champsCompares += 1;
    const valeurEpinglee: string = epingle[champ];
    const valeurRecue: string = recue[champ];
    if (valeurEpinglee !== valeurRecue) {
      ecarts.push({ champ, epingle: valeurEpinglee, recu: valeurRecue });
    }
  }

  return { champsCompares, comparaisonImpossible: false, ecarts };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES PORTS — ce que l'étape 6 exige de l'extérieur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA LECTURE DE LA DÉCLARATION REÇUE.
 *
 * D'où vient-elle ? Du dernier document que l'adaptateur a servi au socle :
 * manifeste rendu à la poignée de main, réponse de santé, rafraîchissement de
 * `ops_adapter.lastSeenAt`. Ce port ne dit pas lequel — c'est son
 * implémentation qui le sait.
 *
 * ⚠️ IL REND `null` PLUTÔT QU'UNE VALEUR DE REPLI. Une valeur de repli — par
 *    exemple « on suppose qu'il annonce ce qui est épinglé » — rendrait la
 *    confrontation TOUJOURS conforme, et la règle du § 20 deviendrait une garde
 *    qui ne peut pas rougir. `null` est visible ; un repli ne l'est pas.
 */
export interface DeclarationsRecues {
  relire(nomComplet: string): Promise<DeclarationOutilRecue | null>;
}

/** Ce qui est demandé à l'interrupteur quand un écart d'épinglage est constaté. */
export interface DemandeDesactivation {
  readonly nomComplet: string;
  /** Ce qui est écrit dans la ligne de désactivation, pour la console. */
  readonly motif: string;
  readonly constateA: Date;
}

/**
 * L'INTERRUPTEUR DU CATALOGUE — l'écriture de `ops_tool.enabled = false`.
 *
 * 🔴 CONTRAT — l'écriture doit être IDEMPOTENTE : désactiver un outil déjà
 *    désactivé réussit. L'étape confronte l'épinglage AVANT de regarder
 *    `enabled` (voir l'en-tête), donc elle appellera ce port sur des outils
 *    déjà éteints, et un port qui lèverait dans ce cas transformerait une
 *    alerte en incident.
 *
 * @returns `true` quand l'outil est désormais désactivé en base. `false` quand
 *          l'écriture n'a pas pu se faire : l'appel est refusé QUAND MÊME, et
 *          l'alerte porte ce `false` pour que l'exploitant sache que l'outil
 *          est resté actif.
 */
export interface InterrupteurOutil {
  desactiver(demande: DemandeDesactivation): Promise<boolean>;
}

/**
 * L'ALERTE D'ÉCART D'ÉPINGLAGE (§ 20, émise sur le canal du § 24).
 *
 * ⚠️ ÉCART DU CDC, SIGNALÉ ET NON BOUCHÉ : la table des alertes du § 24 énumère
 *    huit événements, et AUCUN n'est l'écart d'épinglage — alors que le § 20
 *    prescrit nommément d'alerter. Le niveau retenu ici est `critique`, par
 *    voisinage avec « vérification de chaîne du journal en échec » : les deux
 *    disent qu'une valeur qui fait foi ne correspond plus à ce qu'on reçoit.
 *    C'est une DÉCISION de ce module, pas une lecture du § 24 ; elle est écrite
 *    dans le type pour qu'elle se relise, et rapportée en écart.
 *
 * ⚠️ ELLE NE PORTE NI SECRET, NI DONNÉE PERSONNELLE, NI CONTENU LU. `effect` et
 *    `dataClass` sont des étiquettes de l'outil, pas de la donnée (§ 15,
 *    première règle).
 */
export interface AlerteEpinglage {
  readonly genre: "écart-épinglage";
  /** § 24 — voir la réserve ci-dessus. */
  readonly niveau: "critique";
  readonly nomComplet: string;
  readonly adapterId: string;
  /** § 12 — sans elle, « la version qui a servi » n'est journalisée nulle part. */
  readonly adapterVersion: string;
  readonly ecarts: readonly EcartDEpinglage[];
  /** Le COMPTE de champs confrontés. Une alerte sans compte ne se relit pas. */
  readonly champsCompares: number;
  /** Faux quand l'interrupteur n'a pas pu écrire : l'outil est RESTÉ ACTIF. */
  readonly outilDesactive: boolean;
  readonly constateA: Date;
}

/**
 * LE CANAL D'ALERTE — bot et salon PROPRES au socle (§ 24).
 *
 * @returns `true` quand l'alerte est PARTIE. `false` quand le canal n'a pas pu
 *          émettre — auquel cas `secours` est appelé.
 */
export interface CanalDAlerte {
  alerter(alerte: AlerteEpinglage): Promise<boolean>;
}

/** Pourquoi l'alerte n'a pas atteint son canal. */
export const CAUSES_INCIDENT = ["canal-refuse", "canal-en-erreur"] as const;

export type CauseIncident = (typeof CAUSES_INCIDENT)[number];

/** Ce que `secours` reçoit quand l'alerte du § 20 n'a pas pu être émise. */
export interface IncidentEpinglage {
  readonly alerte: AlerteEpinglage;
  readonly cause: CauseIncident;
  /** De quoi diagnostiquer. JAMAIS rendu à l'appelant (§ 15, `internal`). */
  readonly detail: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DÉPENDANCES DE L'ÉTAPE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ AUCUN DE CES CHAMPS N'A DE DÉFAUT, ET AUCUN N'EST OPTIONNEL — même motif
 *    que `DependancesOrchestrateur` : un défaut serait une garde qu'on peut
 *    oublier de brancher, et la chaîne tournerait verte en sautant la règle
 *    d'épinglage du § 20.
 */
export interface DependancesEtapeCatalogue {
  readonly declarations: DeclarationsRecues;
  readonly interrupteur: InterrupteurOutil;
  readonly alerte: CanalDAlerte;
  /**
   * LE DERNIER RECOURS, appelé quand l'alerte n'a PAS pu être émise.
   *
   * ⚠️ IL EST OBLIGATOIRE, ET C'EST TOUT SON INTÉRÊT. Sans lui, un canal
   *    d'alerte muet ferait disparaître exactement ce que le § 20 veut rendre
   *    visible : la désactivation aurait lieu, personne ne saurait pourquoi, et
   *    l'écran Outils montrerait un outil éteint sans cause. Le § 24 pose
   *    d'ailleurs la même exigence sur le récepteur de la veille : « ni sur le
   *    VPS, ni dans une application Coolify », écrit après une panne où « le
   *    processus qui aurait dû prévenir était lui-même coupé du réseau ».
   *
   * 🔴 CONTRAT — elle ne doit pas lever, et elle ne doit dépendre de rien de
   *    distant. Elle est appelée dans un `try` de toute façon : une consigne
   *    n'est pas une garde.
   */
  readonly secours: (incident: IncidentEpinglage) => void;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES MESSAGES DE REFUS — trois causes, trois messages
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 15, `tool_disabled` : le message « dit qu'il existe, et où l'activer ».
 * D'où TROIS messages distincts et non un seul : un outil inexistant ne
 * s'active nulle part, et un outil désactivé par la règle d'épinglage ne se
 * rallume pas d'un clic. Les confondre enverrait un exploitant chercher un
 * interrupteur qui n'existe pas, ou le rebasculer en boucle.
 */
function messageInconnu(nomComplet: string): string {
  return (
    `Aucun outil « ${nomComplet} » au catalogue du socle (\`ops_tool\`). ` +
    "Il n'existe pas, donc il ne s'active NULLE PART : aucun interrupteur de la console " +
    "ne le rétablira. " +
    "Vérifier le nom COMPLET tel que `tools/list` le sert — le préfixe est DÉRIVÉ de l'id " +
    "de l'adaptateur, jamais saisi (§ 09) — ou enregistrer l'adaptateur qui le porte."
  );
}

function messageDesactive(nomComplet: string): string {
  return (
    `L'outil « ${nomComplet} » EXISTE au catalogue, mais il est désactivé ` +
    "(`ops_tool.enabled` = faux). L'activer sur l'écran Outils de la console du socle : " +
    "c'est `ops_tool.enabled` CÔTÉ SOCLE qui fait foi (§ 21), aucune console d'adaptateur " +
    "ne le rétablit."
  );
}

function messageEcartEpinglage(
  nomComplet: string,
  verdict: VerdictEpinglage,
  desactive: boolean,
): string {
  const divergences = verdict.ecarts
    .map((ecart) => `${ecart.champ} épinglé « ${ecart.epingle} », reçu « ${ecart.recu} »`)
    .join(" ; ");

  return (
    `L'outil « ${nomComplet} » est REFUSÉ ET DÉSACTIVÉ par la règle d'épinglage du § 20 : ` +
    `${divergences}. ` +
    `${String(verdict.ecarts.length)} écart(s) sur ${String(verdict.champsCompares)} champ(s) ` +
    "confronté(s). Le socle refuse de mettre à jour en silence : c'est la valeur ÉPINGLÉE dans " +
    "`ops_tool` qui fait foi. " +
    (desactive
      ? ""
      : "⚠️ La désactivation N'A PAS PU ÊTRE ÉCRITE — l'outil est resté actif en base et " +
        "l'appel est refusé quand même. Le désactiver à la main sur l'écran Outils. ") +
    "Le rebasculer en console ne suffirait pas : la divergence reparaîtrait au prochain appel. " +
    "Faire relire le manifeste de l'adaptateur, le ré-épingler dans `adapters.lock.json`, " +
    "réenregistrer, puis réactiver."
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE
// ═════════════════════════════════════════════════════════════════════════════

/** Un appel de port qui ne peut pas faire échouer la chaîne. */
async function tenter(action: () => Promise<boolean>): Promise<{
  readonly accuse: boolean;
  /**
   * Vrai quand le port a LEVÉ, faux quand il a rendu `false`.
   *
   * ⚠️ C'est un CHAMP, pas une comparaison de message. Distinguer les deux
   *    causes en relisant le texte du `detail` ferait dépendre le classement
   *    d'un incident d'une chaîne de caractères qu'une reformulation casserait
   *    en silence.
   */
  readonly leve: boolean;
  readonly detail: string;
}> {
  try {
    const accuse = await action();
    return {
      accuse,
      leve: false,
      detail: accuse ? "accusé reçu" : "le port a rendu faux sans lever",
    };
  } catch (erreur: unknown) {
    // ⚠️ ON N'AVALE PAS L'EXCEPTION, ON LA DÉGRADE EN CONSTAT. Laisser lever
    //    ferait remonter une exception jusqu'à `avecJournal`, qui l'écrirait en
    //    `decision: "interrompu"` — et le refus d'étape 6 disparaîtrait du
    //    journal, `stepDenied` restant nul. La métrique du § 24 perdrait
    //    exactement les refus qu'on cherche à voir.
    const detail =
      erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : "valeur levée non-Error";
    return { accuse: false, leve: true, detail };
  }
}

/**
 * CRÉE L'ÉTAPE 6 — une fabrique, et non une fonction nue.
 *
 * ⚠️ POURQUOI UNE FABRIQUE. La signature `EtapeCatalogue` posée par
 *    `etapes.ts` ne prend QUE `ContexteCatalogue`, lequel ne porte ni la
 *    déclaration reçue, ni l'interrupteur, ni le canal d'alerte. L'élargir
 *    aurait obligé à toucher `etapes.ts`, que quatre autres constructeurs
 *    partagent. Les trois ports voyagent donc par la fermeture, et la fonction
 *    rendue a EXACTEMENT le type que `DependancesOrchestrateur.etapeCatalogue`
 *    attend. C'est le point d'entrée à inscrire dans `ETAPES_CHAINE`.
 */
export function creerEtapeCatalogue(dependances: DependancesEtapeCatalogue): EtapeCatalogue {
  return async function etapeCatalogue(
    contexte: ContexteCatalogue,
  ): Promise<VerdictEtape<CatalogueEtabli>> {
    // ── 1 · L'outil existe-t-il ? ─────────────────────────────────────────
    // Relecture À CHAQUE APPEL, sans cache (§ 14, correction 3).
    const outil = await contexte.catalogue.relire(contexte.nomComplet);
    if (outil === null) {
      return refuse(ETAPE_CATALOGUE, messageInconnu(contexte.nomComplet));
    }

    // ── 2 · L'épinglage du § 20 — AVANT `enabled`, voir l'en-tête ─────────
    const declaration = await dependances.declarations.relire(contexte.nomComplet);
    const epinglage = confronterEpinglage(outil, declaration);

    if (epinglage.ecarts.length > 0) {
      // L'ORDRE EST UN CONTRAT : on désactive, PUIS on alerte en portant
      // l'accusé de la désactivation. Alerter d'abord dirait « outil
      // désactivé » avant de le savoir ; et une désactivation muette laisserait
      // un outil éteint sans cause lisible sur l'écran Outils.
      const desactivation = await tenter(() =>
        dependances.interrupteur.desactiver({
          nomComplet: contexte.nomComplet,
          motif:
            `Écart d'épinglage (§ 20) sur ${String(epinglage.ecarts.length)} champ(s) : ` +
            epinglage.ecarts
              .map((ecart) => `${ecart.champ} ${ecart.epingle} → ${ecart.recu}`)
              .join(" ; "),
          constateA: contexte.maintenant,
        }),
      );

      const alerte: AlerteEpinglage = {
        genre: "écart-épinglage",
        niveau: "critique",
        nomComplet: contexte.nomComplet,
        adapterId: outil.adapterId,
        adapterVersion: outil.adapterVersion,
        ecarts: epinglage.ecarts,
        champsCompares: epinglage.champsCompares,
        outilDesactive: desactivation.accuse,
        constateA: contexte.maintenant,
      };

      const emission = await tenter(() => dependances.alerte.alerter(alerte));
      if (!emission.accuse) {
        // Le dernier recours. Il est lui-même enveloppé : un secours qui lève
        // rendrait muet le mécanisme fait pour n'être jamais muet.
        try {
          dependances.secours({
            alerte,
            cause: emission.leve ? "canal-en-erreur" : "canal-refuse",
            detail: emission.detail,
          });
        } catch {
          // Rien à faire de plus, et surtout pas lever : le refus d'étape 6
          // doit atteindre le journal avec son `stepDenied`.
        }
      }

      // ⚠️ LE REFUS EST PRONONCÉ QUOI QU'IL ARRIVE AUX DEUX PORTS. Une
      //    désactivation qui échoue ne rend pas l'appel légitime : c'est la
      //    divergence qui refuse, pas l'écriture.
      return refuse(
        ETAPE_CATALOGUE,
        messageEcartEpinglage(contexte.nomComplet, epinglage, desactivation.accuse),
      );
    }

    // ── 3 · L'outil est-il activé ? ───────────────────────────────────────
    if (!outil.enabled) {
      return refuse(ETAPE_CATALOGUE, messageDesactive(contexte.nomComplet));
    }

    // ── 4 · Retiré de la liste ≠ désactivé (§ 13.4) ───────────────────────
    // « Une version dépréciée SORT de `tools/list` dès la publication de v2 et
    // reste APPELABLE six mois. » Confondre les deux couperait six mois de
    // compatibilité d'un coup, en silence. On ne refuse pas : on le DIT.
    return autorise(ETAPE_CATALOGUE, {
      outil,
      deprecie: outil.retireDeLaListe,
    } satisfies CatalogueEtabli);
  };
}
