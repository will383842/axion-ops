/**
 * axion-ops — `voice/commandes/tri.ts`
 *
 * LA RÈGLE DE TRI DU § 20, APPLIQUÉE AUX COMMANDES HORS MODÈLE.
 *
 * § 20, mot pour mot : « Règle de tri des commandes hors modèle : une commande
 * hors modèle n'est admise SANS FACTEUR que si elle RÉDUIT STRICTEMENT
 * l'ensemble des outils exposés. Changer de profil change la surface exposée —
 * donc facteur, TTL, ligne au journal. »
 *
 * ═══ CE FICHIER N'ÉCRIT PAS LA RÈGLE. IL LA POSE EN QUESTION. ═══
 *
 * La règle existe déjà, une fois, dans `core/profiles/budget.ts` :
 * `reduitStrictement()`. Et elle existe déjà, une fois, pour l'axe des niveaux :
 * `classerChangement()` de `core/policy/desserrage.ts`. Ce module n'en réécrit
 * aucune des deux — pas même le `gagnes.length === 0 && perdus.length > 0` qui
 * tiendrait sur une ligne. Deux dérivations d'un même fait finissent par se
 * contredire, et celle qui se tait est toujours celle qu'on croyait juste.
 *
 * ═══ LE POINT DÉLICAT : `reduitStrictement` PARLE DE PROFILS, PAS D'ENSEMBLES ═══
 *
 * Sa signature est `(depuis: ProfileName, vers: ProfileName, outils)`. Or deux
 * des cinq commandes — l'arrêt et le verrouillage — ne visent AUCUN profil :
 * après elles, plus rien n'est exposé. L'ensemble vide n'est pas un profil de
 * l'énumération fermée, et l'y ajouter serait ouvrir `core/profiles/` pour un
 * besoin de `voice/`.
 *
 * La sortie retenue est un PORTE-ENSEMBLES : deux profils de l'énumération —
 * lesquels, on s'en moque, ils sont DÉRIVÉS de `PROFILE_NAMES` — servent de
 * simples étiquettes, et un catalogue fabriqué leur rattache exactement les
 * outils voulus. `reduitStrictement` reçoit alors la question sous la seule
 * forme qu'elle sache lire, et c'est ELLE qui répond. La règle reste écrite une
 * fois.
 *
 * ⚠️ CE DÉTOUR A UN COÛT, ET IL EST GARDÉ. Il dépend de la sémantique
 *    d'`outilsServis()` — `enabled`, `retireDeLaListe`, `profiles.includes`. Si
 *    elle change, le porte-ensembles ment en silence. `tri.spec.ts` porte donc
 *    une garde de CONFRONTATION : sur un catalogue réel, le verdict obtenu par
 *    le porte-ensembles doit être IDENTIQUE, champ par champ, à celui obtenu en
 *    appelant `reduitStrictement` directement sur les deux profils. Sans elle,
 *    le détour serait une seconde implémentation déguisée.
 */

import {
  PROFILE_NAMES,
  outilsServis,
  reduitStrictement,
  type DefinitionOutil,
  type ProfileName,
} from "../../core/profiles/index.js";
import {
  SCOPE_DESSERRAGE,
  TTL_DESSERRAGE_MAX_MS,
  canalDelivreUneConfirmation,
  canauxDeConfirmation,
  classerChangement,
  type AnomalieLigne,
  type Canal,
  type GenreChangement,
  type LignePolitique,
} from "../../core/policy/index.js";
import type { OpsScope, PolicyLevel } from "../../core/types.js";
import { commande, peutElargir, type Commande, type NomCommande } from "./grammaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le canal du démon vocal — NOMMÉ ICI, DÉFINI AILLEURS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le canal par lequel une commande hors modèle arrive.
 *
 * `satisfies Canal` : si `core/policy/confirmation.ts` renommait ou retirait
 * « voix » de `CANAUX`, ce fichier CESSERAIT DE COMPILER. C'est la forme la plus
 * courte d'une garde de couture — elle ne peut pas rester verte par distraction.
 */
export const CANAL_VOIX = "voix" as const satisfies Canal;

/**
 * ⚠️ LE FAIT LE PLUS IMPORTANT DE CE MODULE, ET IL EST DÉRIVÉ, PAS ÉCRIT.
 *
 * `canalDelivreUneConfirmation("voix")` vaut FAUX — § 20 : « ni l'élicitation
 * MCP, ni une réponse produite par le démon vocal ne comptent comme confirmation
 * humaine ». Conséquence directe, et elle décide de la forme de tout le chemin
 * d'élargissement : **une commande vocale qui élargit ne peut JAMAIS être menée
 * à son terme par la voix.** Le démon peut la reconnaître, la journaliser et la
 * proposer ; il ne peut pas la satisfaire. Il la remet à un canal qui, lui,
 * délivre une confirmation.
 *
 * Écrire ici `false` en dur donnerait le même comportement aujourd'hui et
 * mentirait le jour où quelqu'un rouvrirait le canal vocal côté socle.
 */
export const LA_VOIX_CONFIRME = canalDelivreUneConfirmation(CANAL_VOIX);

/** Les canaux qui peuvent, eux, porter le desserrage. DÉRIVÉS de `CANAUX`. */
export const CANAUX_QUI_CONFIRMENT: readonly Canal[] = canauxDeConfirmation();

// ═════════════════════════════════════════════════════════════════════════════
//  Le porte-ensembles
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Deux profils de l'énumération, employés comme ÉTIQUETTES. Leur identité n'a
 * aucune importance — seul compte qu'ils soient deux et distincts. Dérivés, pour
 * qu'un renommage dans `core/profiles/` ne laisse pas ici deux littéraux morts.
 */
function porteurs(): { readonly avant: ProfileName; readonly apres: ProfileName } {
  const avant = PROFILE_NAMES[0];
  const apres = PROFILE_NAMES[1];
  if (avant === undefined || apres === undefined || avant === apres) {
    throw new Error(
      `voice/commandes/tri : l'énumération des profils porte ${String(PROFILE_NAMES.length)} ` +
        "entrée(s) distinctes ; le porte-ensembles en exige DEUX. La règle du § 20 ne peut " +
        "plus être posée à `reduitStrictement` — corriger core/profiles/profiles.ts.",
    );
  }
  return { avant, apres };
}

/** Une définition minimale, sans autre rôle que de porter un NOM dans un ensemble. */
function outilTemoin(nom: string, profils: readonly ProfileName[]): DefinitionOutil {
  return {
    name: nom,
    version: "0",
    description: "",
    inputSchema: {},
    outputSchema: {},
    profiles: profils,
    // Les deux seuls réglages qui comptent : `outilsServis` ne retient qu'un
    // outil activé et non retiré de la liste (§ 14, correction 3). Un témoin
    // désactivé ne serait servi NULLE PART, et les deux ensembles seraient vides.
    enabled: true,
    retireDeLaListe: false,
  };
}

/**
 * LA RÈGLE DU § 20, POSÉE SUR DEUX ENSEMBLES DE NOMS D'OUTILS.
 *
 * Ne décide rien : fabrique le catalogue qui traduit la question, et rend
 * VERBATIM ce que `reduitStrictement` répond.
 *
 * ⚠️ `outilsExamines` du verdict rendu compte les outils du CATALOGUE FABRIQUÉ,
 *    c'est-à-dire l'union des deux ensembles — pas le catalogue réel. `trier()`
 *    le remplace par le vrai compte : une garde qui annonce un nombre d'éléments
 *    mesurés doit annoncer le bon, sans quoi elle ment sur sa propre portée.
 */
export function verdictDeReduction(
  avant: ReadonlySet<string>,
  apres: ReadonlySet<string>,
): ReturnType<typeof reduitStrictement> {
  const etiquettes = porteurs();
  const noms = new Set<string>([...avant, ...apres]);

  const catalogue = [...noms].map((nom) => {
    const profils: ProfileName[] = [];
    if (avant.has(nom)) profils.push(etiquettes.avant);
    if (apres.has(nom)) profils.push(etiquettes.apres);
    return outilTemoin(nom, profils);
  });

  return reduitStrictement(etiquettes.avant, etiquettes.apres, catalogue);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le régime du NEUTRE — un écart du CDC, tranché ici et DIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ DEUX PHRASES DU CAHIER DES CHARGES NE PEUVENT PAS ÊTRE VRAIES ENSEMBLE,
 *    ET LE MODULE NE PEUT PAS LES DÉPARTAGER SEUL.
 *
 *  · § 20 : « n'est admise SANS FACTEUR QUE SI elle réduit STRICTEMENT
 *    l'ensemble des outils exposés ». C'est une condition NÉCESSAIRE. Et
 *    `reduitStrictement()` la tient au pied de la lettre : « un changement qui
 *    ne retire rien n'a rien réduit — il ne se dispense donc pas du facteur ».
 *
 *  · § 30 / § 32 : « "stop" coupe SANS PASSER PAR LE MODÈLE », et § 18 range
 *    « quelqu'un à portée de voix d'une machine déverrouillée » parmi les
 *    adversaires — ce qui suppose qu'un arrêt soit toujours disponible.
 *
 * LE CAS OÙ ELLES SE CONTREDISENT EST RÉEL, PAS THÉORIQUE : si le catalogue
 * servi est vide — au démarrage, pendant une panne de la base, tant que le
 * registre n'a rien chargé —, « stop » ne retire aucun outil, donc ne réduit
 * pas strictement, donc exigerait un second facteur TOTP. Un arrêt d'urgence qui
 * réclame un code à six chiffres n'est pas un arrêt d'urgence.
 *
 * DEUX RÉGIMES SONT DONC OFFERTS, ET LES DEUX VERDICTS SONT TOUJOURS RENDUS :
 *
 *  · `n-elargit-pas` (DÉFAUT) — le chemin sans facteur est ouvert à toute
 *    commande qui ne fait GAGNER aucun outil. Sûr au sens qui compte : aucune
 *    commande qui élargit ne passe jamais sans facteur. C'est ce que le § 30
 *    décrit, et c'est la lecture qui rend « stop » toujours disponible.
 *
 *  · `reduit-strictement` — la lettre du § 20, sans aménagement. À employer si
 *    Will tranche dans ce sens.
 *
 * Aucun des deux n'est déduit d'une supposition : `Tri` porte les deux
 * verdicts — `elargit` et `reduitStrictement` — et l'appelant peut appliquer
 * l'autre règle sans rien recalculer.
 */
export const REGIMES_DE_TRI = ["n-elargit-pas", "reduit-strictement"] as const;

export type RegimeDeTri = (typeof REGIMES_DE_TRI)[number];

/** Voir ci-dessus. Changer de régime, c'est changer CETTE ligne. */
export const REGIME_DE_TRI_PAR_DEFAUT: RegimeDeTri = "n-elargit-pas";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qu'on observe, et ce qu'on rend
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'état sur lequel le tri se prononce. Tout vient de l'appelant : ce module ne
 * lit ni base, ni fichier, ni horloge.
 */
export interface EtatObserve {
  /** Le profil en vigueur — `ops_runtime.activeProfile`, déjà validé. */
  readonly profilActif: ProfileName;
  /** Le catalogue tel que `tools/list` le sert. Vide ⇒ mesure aveugle. */
  readonly outils: readonly DefinitionOutil[];
  /** Les lignes de politique, pour l'axe des niveaux. */
  readonly lignesDePolitique: readonly LignePolitique[];
  /** L'horloge, injectée : `classerChangement` en a besoin pour l'expiration. */
  readonly maintenant: Date;
}

/** Ce que le chemin d'élargissement EXIGE. Tout y est dérivé de `core/policy`. */
export interface ExigencesDeDesserrage {
  /** § 19.2 — le jeton du connecteur ne le porte JAMAIS. */
  readonly scopeDeJeton: OpsScope;
  /** § 20, protection 2. */
  readonly secondFacteur: "TOTP";
  /** § 20, protection 3 — « toujours avec une durée ». */
  readonly ttlObligatoire: true;
  readonly ttlMaxMs: number;
  /** Les canaux qui délivrent une confirmation. DÉRIVÉS. */
  readonly canauxAdmis: readonly Canal[];
  /** Faux — voir {@link LA_VOIX_CONFIRME}. La voix ne conclut pas ce chemin. */
  readonly parLaVoix: boolean;
}

/**
 * LE VERDICT. Rien n'y est un booléen seul : chaque décision vient avec le
 * nombre qui l'a produite et la portée sur laquelle il a été compté (§ 15).
 */
export interface Tri {
  readonly commande: NomCommande;
  readonly axe: "outils" | "politique";
  readonly regime: RegimeDeTri;

  /** VRAI si au moins un outil est GAGNÉ. Lu chez l'autorité, jamais recalculé. */
  readonly elargit: boolean;
  /**
   * Le verdict STRICT du § 20, tel que l'autorité de l'axe le rend.
   *
   * · axe `outils`    — `reduitStrictement.reduitStrictement` verbatim ;
   * · axe `politique` — `classerChangement.genre === "resserrage"`. ⚠️ Sur cet
   *   axe l'autorité range l'ÉGALITÉ du côté du resserrage (« elle n'ouvre
   *   rien »), là où l'axe des outils range le neutre du côté du facteur. Les
   *   deux traitements sont conservés tels quels ; les unifier ici écrirait une
   *   troisième règle.
   */
  readonly reduitStrictement: boolean;

  /** Le chemin à suivre, sous le régime demandé. */
  readonly chemin: "sans-facteur" | "desserrage";

  /** Axe `outils` : les noms gagnés et perdus, rendus par l'autorité. */
  readonly gagnes: readonly string[];
  readonly perdus: readonly string[];
  readonly outilsAvant: number;
  readonly outilsApres: number;

  /** Axe `politique` : ce que `classerChangement` a lu et décidé. */
  readonly niveauAvant: PolicyLevel | null;
  readonly niveauDemande: PolicyLevel | null;
  readonly genreDeChangement: GenreChangement | null;
  /** Anomalies de lecture de la politique. Non vide ⇒ `niveauAvant` est le repli. */
  readonly anomalies: readonly AnomalieLigne[];

  /** Le compte RÉEL d'outils soumis à la mesure — jamais celui du porte-ensembles. */
  readonly outilsExamines: number;
  /** Le compte de lignes de politique lues. */
  readonly lignesExaminees: number;
  /**
   * La mesure a-t-elle porté sur ZÉRO élément de son axe ? Motif de
   * `mesureAveugle` du § 14 : une garde qui mesure zéro est verte pour la pire
   * des raisons — et il faut le DIRE pour l'admettre.
   *
   * ⚠️ Elle n'adoucit JAMAIS le verdict : une commande capable d'élargir sur un
   *    catalogue illisible part au desserrage.
   */
  readonly mesureAveugle: boolean;

  readonly desserrage: ExigencesDeDesserrage | null;
  /** Le message rendu à l'appelant. Il DIT les nombres (§ 15). */
  readonly message: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le tri
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le scope global du § 12 — la grammaire des scopes : `*` | `<adapterId>.*` |
 * `<adapterId>.<tool>`. Une commande vocale de politique porte sur TOUT :
 * « brouillon seul » ne vise aucun outil en particulier.
 *
 * ⚠️ ÉCART ASSUMÉ ET SIGNALÉ : c'est la seule constante de ce module qui soit
 *    RECOPIÉE plutôt que dérivée. `core/policy/demarrage.ts` porte
 *    `SCOPE_DEMARRAGE = "*"`, mais son nom dit « démarrage », pas « global » :
 *    l'importer ferait dire à ce fichier qu'une commande vocale est un
 *    démarrage du socle. La garde de `tri.spec.ts` confronte les deux valeurs
 *    et rougit si elles divergent.
 */
export const SCOPE_GLOBAL = "*";

function nomsServis(outils: readonly DefinitionOutil[], profil: ProfileName): ReadonlySet<string> {
  // `outilsServis` est l'autorité sur « ce qui est SERVI » : rattaché au profil,
  // activé en console, non retiré de `tools/list`. Les trois conditions vivent
  // là-bas, et une seule ici serait une de trop.
  return new Set(outilsServis(outils, profil).map((outil) => outil.name));
}

function exigences(): ExigencesDeDesserrage {
  return {
    scopeDeJeton: SCOPE_DESSERRAGE,
    secondFacteur: "TOTP",
    ttlObligatoire: true,
    ttlMaxMs: TTL_DESSERRAGE_MAX_MS,
    canauxAdmis: CANAUX_QUI_CONFIRMENT,
    parLaVoix: LA_VOIX_CONFIRME,
  };
}

/**
 * TRIE UNE COMMANDE HORS MODÈLE — § 20.
 *
 * Ne l'exécute pas, n'écrit rien, ne verrouille rien : rend ce qu'il faut faire,
 * avec les nombres qui l'ont décidé.
 */
export function trier(
  nom: NomCommande,
  etat: EtatObserve,
  regime: RegimeDeTri = REGIME_DE_TRI_PAR_DEFAUT,
): Tri {
  const entree: Commande = commande(nom);
  const effet = entree.effet;
  const lignesExaminees = etat.lignesDePolitique.length;
  const outilsExamines = etat.outils.length;

  if (effet.axe === "politique") {
    const classement = classerChangement(
      etat.lignesDePolitique,
      SCOPE_GLOBAL,
      effet.versNiveau,
      etat.maintenant,
    );
    // La surface d'outils NE BOUGE PAS sur cet axe : la dire identique de part
    // et d'autre est un fait ; écrire 0 laisserait croire qu'elle est vide.
    const servisMaintenant = nomsServis(etat.outils, etat.profilActif).size;

    const elargit = classement.genre === "desserrage";
    const reduit = classement.genre === "resserrage";
    // Aucune ligne lue : `plancherDuScope` rend alors le repli fail-closed. Le
    // dire, plutôt que laisser croire que le plancher a été observé.
    const aveugle = lignesExaminees === 0;
    const chemin = elargit ? "desserrage" : "sans-facteur";

    return {
      commande: nom,
      axe: "politique",
      regime,
      elargit,
      reduitStrictement: reduit,
      chemin,
      gagnes: [],
      perdus: [],
      outilsAvant: servisMaintenant,
      outilsApres: servisMaintenant,
      niveauAvant: classement.niveauAvant,
      niveauDemande: classement.niveauDemande,
      genreDeChangement: classement.genre,
      anomalies: classement.anomalies,
      outilsExamines,
      lignesExaminees,
      mesureAveugle: aveugle,
      desserrage: elargit ? exigences() : null,
      message:
        `Commande « ${nom} » (${entree.enonce}) — axe politique : ` +
        `« ${classement.niveauAvant} » → « ${classement.niveauDemande} », ` +
        `${classement.genre}, sur ${String(classement.mesures)} ligne(s) lue(s)` +
        (classement.anomalies.length > 0
          ? `, ${String(classement.anomalies.length)} anomalie(s) de lecture — le plancher affiché est le REPLI`
          : "") +
        (aveugle ? ". ⚠️ AUCUNE ligne de politique lue : mesure aveugle" : "") +
        `. Chemin : ${chemin}.`,
    };
  }

  // ─── Axe des outils ────────────────────────────────────────────────────────

  const avant = nomsServis(etat.outils, etat.profilActif);
  const apres =
    effet.versProfil === null
      ? // L'ENSEMBLE VIDE. Un tour coupé, un démon verrouillé : plus rien n'est
        // exposé. Ce n'est pas « pas de changement ».
        new Set<string>()
      : nomsServis(etat.outils, effet.versProfil);

  const verdict = verdictDeReduction(avant, apres);

  const elargit = verdict.gagnes.length > 0;
  const aveugle = outilsExamines === 0;
  const cheminOuvert = regime === "reduit-strictement" ? verdict.reduitStrictement : !elargit;
  const chemin = cheminOuvert ? "sans-facteur" : "desserrage";

  return {
    commande: nom,
    axe: "outils",
    regime,
    elargit,
    reduitStrictement: verdict.reduitStrictement,
    chemin,
    gagnes: verdict.gagnes,
    perdus: verdict.perdus,
    outilsAvant: verdict.avant,
    outilsApres: verdict.apres,
    niveauAvant: null,
    niveauDemande: null,
    genreDeChangement: null,
    anomalies: [],
    // Le compte RÉEL, pas celui du catalogue fabriqué par le porte-ensembles.
    outilsExamines,
    lignesExaminees,
    mesureAveugle: aveugle,
    desserrage: chemin === "desserrage" ? exigences() : null,
    message:
      `Commande « ${nom} » (${entree.enonce}) — axe outils : ` +
      `${String(verdict.avant)} outil(s) servis avant, ${String(verdict.apres)} après ` +
      `(${String(verdict.gagnes.length)} gagné(s), ${String(verdict.perdus.length)} perdu(s)), ` +
      `mesure faite sur ${String(outilsExamines)} définition(s) soumise(s)` +
      (aveugle
        ? ". ⚠️ AUCUNE définition soumise : mesure aveugle — le verdict ne prouve rien sur la surface réelle"
        : "") +
      `. Régime « ${regime} ». Chemin : ${chemin}` +
      (chemin === "desserrage"
        ? `. Elle ÉLARGIT : second facteur TOTP, TTL ≤ ${String(TTL_DESSERRAGE_MAX_MS)} ms, ` +
          `scope « ${SCOPE_DESSERRAGE} », et PAS PAR LA VOIX — canaux admis : ` +
          `${CANAUX_QUI_CONFIRMENT.join(", ")} (§ 20).`
        : "."),
  };
}

/**
 * Le tri de TOUTES les commandes de la grammaire, sous un même état.
 *
 * Sert la console (« que se passe-t-il si je dis ça, maintenant ? ») et les
 * gardes : une campagne qui ne trouve que les commandes qu'elle a nommées ne
 * trouve rien le jour où une sixième apparaît.
 */
export function trierToutes(
  noms: readonly NomCommande[],
  etat: EtatObserve,
  regime: RegimeDeTri = REGIME_DE_TRI_PAR_DEFAUT,
): {
  readonly tris: readonly Tri[];
  readonly commandesMesurees: number;
  readonly sansFacteur: number;
  readonly auDesserrage: number;
} {
  const tris = noms.map((nom) => trier(nom, etat, regime));
  return {
    tris,
    commandesMesurees: tris.length,
    sansFacteur: tris.filter((tri) => tri.chemin === "sans-facteur").length,
    auDesserrage: tris.filter((tri) => tri.chemin === "desserrage").length,
  };
}

/**
 * Confronte la classification STRUCTURELLE de `peutElargir()` au tri RÉEL.
 *
 * ⚠️ C'EST LA GARDE QUI EMPÊCHE `peutElargir` DE DEVENIR UNE LISTE. Elle est
 *    exportée — et pas confinée au fichier de test — pour qu'un démon puisse
 *    l'exécuter à son démarrage : une grammaire chargée depuis un autre dépôt
 *    (ADR 0010, § 6 : le démon est un SECOND PROGRAMME) n'a traversé aucune CI
 *    de ce dépôt-ci.
 *
 * @returns les commandes dont la classification structurelle est DÉMENTIE par
 *   le tri sous `etat` : elle annonçait « ne peut pas élargir » et un outil a
 *   été gagné. Un tableau vide est le seul résultat acceptable.
 */
export function commandesQuiDementent(
  noms: readonly NomCommande[],
  etat: EtatObserve,
): {
  readonly dementies: readonly NomCommande[];
  readonly commandesMesurees: number;
  readonly outilsExamines: number;
} {
  const dementies = noms.filter((nom) => {
    const tri = trier(nom, etat);
    return !peutElargir(commande(nom).effet) && tri.elargit;
  });
  return {
    dementies,
    commandesMesurees: noms.length,
    outilsExamines: etat.outils.length,
  };
}
