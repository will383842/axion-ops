/**
 * core/vault/coffre.ts — LE COFFRE.
 *
 * Il tient un état parmi trois (§ 23), un trousseau (§ 12), et rien d'autre. Il
 * ne connaît ni Prisma, ni l'environnement, ni le journal : `DepotDeSecrets`,
 * `SourceDeCle` et `JournalDuCoffre` sont trois ports.
 *
 * ═══ LE SCEAU ═══
 *
 * « Coffre absent » et « coffre vide » ne sont pas la même chose, et le § 23 en
 * tire deux comportements opposés — l'un refuse le démarrage, l'autre est le
 * cas nominal d'une base neuve. Il faut donc un TÉMOIN DE PRÉSENCE, qui dise
 * « ce coffre existe, et voici la clé qui l'ouvre ».
 *
 * Ce témoin est une ligne d'`ops_secret` comme les autres : nom réservé,
 * version 1, contenant un clair connu. La reconnaître, c'est prouver qu'on
 * détient la clé — pas la promettre. C'est ce qui permet à `deverrouiller()` de
 * REFUSER une mauvaise clé sur-le-champ, au lieu de passer `ouvert` et de
 * découvrir l'erreur au premier vrai secret lu, c'est-à-dire au pire moment.
 *
 * Le sceau n'a pas de table à lui parce que `prisma/schema.prisma` est posé par
 * la Fondation et que ce module n'y touche pas. La contrepartie est un nom
 * réservé, que `ecrire()` refuse — sans quoi un secret nommé comme le sceau
 * l'écraserait, et le coffre entier deviendrait « absent » au redémarrage
 * suivant.
 */

import {
  chiffrer,
  dechiffrer,
  effacerOctets,
  egalesEnTempsConstant,
  motifNomInvalide,
  motifVersionInvalide,
} from "./chiffrement.js";
import type { EnveloppeChiffree } from "./chiffrement.js";
import type { DepotDeSecrets, EnregistrementSecret } from "./depot.js";
import { ErreurDeCoffre } from "./erreurs.js";
import type { RefusDeCoffre } from "./erreurs.js";
import { CODE_COFFRE_VERROUILLE, ETAPE_COFFRE } from "./erreurs.js";
import { appliquerGeste } from "./etat.js";
import type { EtatCoffre, GesteCoffre } from "./etat.js";
import { JOURNAL_MUET } from "./evenements.js";
import type { JournalDuCoffre, NomEvenementDuCoffre } from "./evenements.js";
import {
  clonerTrousseau,
  cleDuTrousseau,
  effacerTrousseau,
  keyIdsDuTrousseau,
} from "./source-de-cle.js";
import type { CleDeCoffre, SourceDeCle, Trousseau } from "./source-de-cle.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le sceau
// ═════════════════════════════════════════════════════════════════════════════

/** Nom RÉSERVÉ. `ecrire()` le refuse ; voir l'en-tête du fichier. */
export const NOM_DU_SCEAU = "__sceau__";

/** Le sceau n'a qu'une version : il n'a pas d'histoire, il a une présence. */
export const VERSION_DU_SCEAU = 1;

/**
 * LE NOM DU SECRET QUI PORTE LA CLÉ HMAC DE L'`argHash` (§ 12, règle 2).
 *
 * Il est déclaré ICI, une seule fois, parce que c'est le coffre qui répond à
 * « sous quel nom, en quelle version ». `core/limits` déclare le port
 * `CoffreArgHash` et ne connaît pas ce nom ; s'il le connaissait aussi, deux
 * endroits décideraient de la même chose et le jour d'une rotation l'un des
 * deux serait oublié.
 */
export const NOM_CLE_ARG_HASH = "argHash.hmac";

/** La version courante de la clé `argHash`. Une rotation l'incrémente. */
export const VERSION_CLE_ARG_HASH = 1;

/**
 * LE NOM DU SECRET QUI PORTE LA CLÉ DE SCELLEMENT DU JOURNAL (ADR 0002).
 *
 * Déclaré ICI, une seule fois, pour la même raison que celui de l'`argHash` :
 * c'est le coffre qui répond à « sous quel nom, en quelle version ».
 *
 * ⚠️ CETTE CLÉ-CI NE SE TOURNE PAS COMME LES AUTRES. Une rotation rend
 *    INVÉRIFIABLE tout le journal scellé avec l'ancienne — ce n'est pas un
 *    défaut, c'est la propriété recherchée : si l'ancienne clé suffisait encore
 *    à valider les anciennes lignes, il suffirait de la garder pour recalculer
 *    la chaîne. L'ancienne clé se SÉQUESTRE donc hors ligne tant que le journal
 *    qu'elle a scellé est conservé (§ 31 : douze mois archivés), et `ops_audit`
 *    ne porte AUJOURD'HUI aucune colonne de version de clé. Voir ADR 0002,
 *    « ce qui reste ouvert ».
 */
export const NOM_CLE_SCEAU_JOURNAL = "journal.sceau";

/** La version courante de la clé de scellement. Voir la réserve ci-dessus. */
export const VERSION_CLE_SCEAU_JOURNAL = 1;

/** Clair connu. Il n'est pas secret — c'est le déchiffrer qui prouve quelque
 *  chose, pas le connaître. */
const CLAIR_DU_SCEAU = Buffer.from("axion-ops/vault/sceau/v1", "utf8");

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que le coffre montre de lui-même
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'écran Santé du § 22 : « Coffre (3 états), jetons rafraîchissables,
 * adaptateurs joignables, dernier battement, bootstrapCount Zoho ».
 *
 * ⚠️ `vaultLocked` est DÉRIVÉ, jamais stocké. Le § 23 exige que le healthcheck
 *    le rende ; il ne doit pas pour autant devenir une seconde source de vérité
 *    qui pourrait, elle, se désynchroniser de l'état.
 */
export interface SanteDuCoffre {
  readonly etat: EtatCoffre;
  readonly vaultLocked: boolean;
  /** `null` tant que le coffre n'est pas ouvert. */
  readonly keyIdPrincipal: string | null;
  /** Les `keyId` que le trousseau sait ouvrir. Vide si verrouillé. */
  readonly keyIdsConnus: readonly string[];
  /** Nom de la source, pour que l'écran dise D'OÙ viendrait la clé. */
  readonly sourceDeCle: string;
  /** Le socle se rouvrirait-il seul au prochain démarrage ? (décision W-4) */
  readonly ouvreAuDemarrage: boolean;
}

/** § 27 — le compteur d'amorçage, et le mur qu'il annonce. */
export interface CompteurDAmorcage {
  readonly nom: string;
  readonly version: number;
  readonly compte: number;
  /** `null` = aucun plafond configuré. Le CDC n'en chiffre aucun — voir écarts. */
  readonly plafond: number | null;
  /** `null` quand il n'y a pas de plafond. */
  readonly reste: number | null;
}

export interface ResultatDeRotation {
  readonly keyId: string;
  /** Nombre de lignes réécrites. Une garde l'annonce ; zéro serait suspect. */
  readonly lignes: number;
}

export interface OptionsDuCoffre {
  readonly depot: DepotDeSecrets;
  readonly source: SourceDeCle;
  readonly journal?: JournalDuCoffre;
  /** § 27. `null` ou absent = pas de plafond. */
  readonly plafondBootstrap?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le coffre
// ═════════════════════════════════════════════════════════════════════════════

export class Coffre {
  private etatCourant: EtatCoffre;
  private trousseau: Trousseau | null;

  private readonly depot: DepotDeSecrets;
  private readonly source: SourceDeCle;
  private readonly journal: JournalDuCoffre;
  private readonly plafondBootstrap: number | null;

  private constructor(options: OptionsDuCoffre, etat: EtatCoffre, trousseau: Trousseau | null) {
    this.depot = options.depot;
    this.source = options.source;
    this.journal = options.journal ?? JOURNAL_MUET;
    this.plafondBootstrap = options.plafondBootstrap ?? null;
    this.etatCourant = etat;
    this.trousseau = trousseau;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Démarrage
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Constate l'état du coffre au démarrage. NE LÈVE PAS sur un coffre absent :
   * constater et décider sont deux gestes différents, et c'est
   * `decisionDeDemarrage()` qui décide (§ 23). Un constructeur qui lèverait
   * rendrait le cas « absent » intestable autrement que par un `expect.throws`,
   * et le § 32 en fait un critère de recette à part entière.
   */
  public static async ouvrir(options: OptionsDuCoffre): Promise<Coffre> {
    const sceau = await options.depot.lire(NOM_DU_SCEAU, VERSION_DU_SCEAU);
    if (sceau === null) {
      return new Coffre(options, "absent", null);
    }

    const coffre = new Coffre(options, "verrouillé", null);
    await coffre.tenterDOuvrirLeSceau(sceau);
    return coffre;
  }

  /**
   * Redemande une clé à la source et retente. C'est ce qu'appelle la route de
   * déverrouillage de la console (§ 22, écran 5), APRÈS que la source manuelle
   * a reçu `poser()`.
   */
  public async deverrouiller(): Promise<EtatCoffre> {
    this.exigerGeste("déverrouiller");

    const sceau = await this.depot.lire(NOM_DU_SCEAU, VERSION_DU_SCEAU);
    if (sceau === null) {
      // Le sceau a disparu entre le démarrage et maintenant : la base a été
      // remplacée sous le processus. On ne « répare » pas en provisionnant —
      // cela poserait un sceau neuf sur des lignes qu'aucune clé n'ouvre.
      this.etatCourant = "absent";
      this.publier(
        "coffre-illisible",
        "Le sceau du coffre a disparu de la base depuis le démarrage.",
      );
      throw new ErreurDeCoffre(
        "coffre_absent",
        "Le sceau du coffre n'est plus en base. Ne pas provisionner par-dessus : " +
          "restaurer la base depuis la sauvegarde, puis redémarrer.",
      );
    }

    await this.tenterDOuvrirLeSceau(sceau);
    return this.etatCourant;
  }

  /** Le geste de l'arrêt d'urgence (§ 25). Idempotent, et sans `await`. */
  public verrouiller(): EtatCoffre {
    this.exigerGeste("verrouiller");

    if (this.trousseau !== null) {
      effacerTrousseau(this.trousseau);
      this.trousseau = null;
    }
    this.etatCourant = "verrouillé";
    this.publier("verrouillé", "Coffre refermé ; le matériau de clé a été écrasé en mémoire.");
    return this.etatCourant;
  }

  /**
   * Crée le coffre : pose le sceau. Une fois par vie de base.
   * C'est le geste que nomme le message de refus de démarrage.
   */
  public async provisionner(): Promise<EtatCoffre> {
    this.exigerGeste("provisionner");

    const trousseau = await this.source.fournir();
    if (trousseau === null) {
      throw new ErreurDeCoffre(
        "cle_absente",
        `La source de clé « ${this.source.nom} » n'a fourni aucune clé : impossible de ` +
          `créer le coffre. Poser la clé, puis relancer — et la SÉQUESTRER hors machine ` +
          `AVANT de la poser (§ 25).`,
      );
    }

    const copie = clonerTrousseau(trousseau);
    const enveloppe = chiffrer({
      keyId: copie.principale.keyId,
      cle: copie.principale.octets,
      nom: NOM_DU_SCEAU,
      version: VERSION_DU_SCEAU,
      clair: CLAIR_DU_SCEAU,
    });

    await this.depot.ecrire(this.versLigne(NOM_DU_SCEAU, VERSION_DU_SCEAU, enveloppe, null, 0));

    this.trousseau = copie;
    this.etatCourant = "ouvert";
    this.publier("provisionné", `Sceau posé sous la clé « ${copie.principale.keyId} ».`);
    return this.etatCourant;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  État
  // ───────────────────────────────────────────────────────────────────────────

  /** L'état courant. TROIS VALEURS — jamais un booléen. */
  public etat(): EtatCoffre {
    return this.etatCourant;
  }

  public sante(): SanteDuCoffre {
    return {
      etat: this.etatCourant,
      // Dérivé, et fail-closed : tout ce qui n'est pas `ouvert` est verrouillé
      // du point de vue d'un appelant.
      vaultLocked: this.etatCourant !== "ouvert",
      keyIdPrincipal: this.trousseau?.principale.keyId ?? null,
      keyIdsConnus: this.trousseau === null ? [] : keyIdsDuTrousseau(this.trousseau),
      sourceDeCle: this.source.nom,
      ouvreAuDemarrage: this.source.ouvreAuDemarrage,
    };
  }

  /**
   * § 23 — « tout appel d'outil est refusé » quand le coffre n'est pas ouvert.
   *
   * Rend `null` quand l'appel peut continuer, un refus sinon. C'est la forme
   * qui oblige l'appelant à traiter le cas : un booléen `peutAppeler()` se
   * néglige d'un `!`, un objet de refus se journalise.
   */
  public refusDAppelDOutil(): RefusDeCoffre | null {
    if (this.etatCourant === "ouvert") {
      return null;
    }

    const message =
      this.etatCourant === "absent"
        ? "Le coffre est absent : aucun outil ne peut être appelé. Le socle n'aurait " +
          "pas dû démarrer dans cet état."
        : "Le coffre est verrouillé : aucun outil ne peut être appelé. Déverrouiller " +
          "depuis la console (écran Déverrouillage), pas depuis un terminal.";

    // `etape` porte le numéro que `ops_audit.stepDenied` inscrit — DÉRIVÉ
    // d'`APPEL_STEPS` par `core/vault/erreurs.ts`, jamais un littéral. Sans
    // lui, la colonne restait nulle et le refus était indiscernable d'une
    // exception (ADR 0005).
    return { code: CODE_COFFRE_VERROUILLE, etape: ETAPE_COFFRE, etat: this.etatCourant, message };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Lire et écrire des secrets
  // ───────────────────────────────────────────────────────────────────────────

  /** Le secret `(nom, version)`, ou sa version la plus haute si `version` est omise. */
  /**
   * LE PONT VERS `core/limits` — implémente le port `CoffreArgHash`.
   *
   * § 12, règle 2 : « `argHash` est un HMAC, pas un SHA nu », clé issue du
   * coffre. `core/limits` DÉCLARE ce port et code contre lui ; jusqu'au lot 1,
   * personne ne le fournissait, et les seules implémentations existantes
   * étaient trois doubles recopiés dans des fichiers d'essai. Tant que le pont
   * n'existait pas, l'`argHash` du socle n'avait aucune clé réelle, et
   * personne ne savait qui décidait du NOM du secret ni de sa version.
   *
   * ⚠️ REND `null`, NE LÈVE PAS, quand le secret n'est pas encore configuré :
   *    c'est le contrat du port, et c'est au CALCUL — `creerCalculArgHash` —
   *    de décider que l'absence est fatale. Il le fait déjà, bruyamment. En
   *    revanche un coffre FERMÉ lève : ne pas pouvoir lire et n'avoir rien à
   *    lire sont deux situations différentes, et les confondre servirait un
   *    `argHash` sans clé le jour où le coffre est verrouillé.
   */
  public async lireCleArgHash(): Promise<string | null> {
    this.exigerOuvert();
    const ligne = await this.depot.lire(NOM_CLE_ARG_HASH, VERSION_CLE_ARG_HASH);
    if (ligne === null) {
      return null;
    }
    const clair = await this.lire(NOM_CLE_ARG_HASH, VERSION_CLE_ARG_HASH);
    return clair.toString("utf8");
  }

  /**
   * LE PONT VERS `core/sceau` — implémente le port `CoffreSceauJournal`.
   *
   * ADR 0002 : `ops_audit.selfHash` est un HMAC, pas un SHA nu. Sans clé,
   * quiconque obtient l'écriture en base peut retirer une tranche PUIS
   * recalculer toute la chaîne, et `verifierChaine` rend alors « valide » sur
   * un journal amputé.
   *
   * ⚠️ REND `null`, NE LÈVE PAS, quand le secret n'est pas encore configuré :
   *    c'est le contrat du port, et c'est à `creerScelleurJournal` de décider
   *    que l'absence est fatale — ce qu'il fait, bruyamment. En revanche un
   *    coffre FERMÉ lève : ne pas pouvoir lire et n'avoir rien à lire sont deux
   *    situations différentes, et les confondre servirait un journal scellé
   *    avec rien le jour où le coffre est verrouillé.
   */
  public async lireCleSceauJournal(): Promise<string | null> {
    this.exigerOuvert();
    const ligne = await this.depot.lire(NOM_CLE_SCEAU_JOURNAL, VERSION_CLE_SCEAU_JOURNAL);
    if (ligne === null) {
      return null;
    }
    const clair = await this.lire(NOM_CLE_SCEAU_JOURNAL, VERSION_CLE_SCEAU_JOURNAL);
    return clair.toString("utf8");
  }

  public async lire(nom: string, version?: number): Promise<Buffer> {
    this.exigerOuvert();
    this.refuserLeNomReserve(nom, "lu");

    const ligne =
      version === undefined
        ? await this.depot.lireDerniereVersion(nom)
        : await this.depot.lire(nom, version);

    if (ligne === null) {
      throw new ErreurDeCoffre(
        "secret_introuvable",
        version === undefined
          ? `Aucun secret « ${nom} » dans le coffre.`
          : `Aucun secret « ${nom} » en version ${String(version)}.`,
        version === undefined ? { nom } : { nom, version },
      );
    }

    return this.dechiffrerLigne(ligne);
  }

  /**
   * Écrit — ou remplace — le secret `(nom, version)`.
   *
   * Le § 12 justifie l'unicité `(name, version)` par le § 27 : « garder l'ancien
   * refresh token valide pendant la propagation — un `name` unique
   * l'interdirait ». Écrire une v2 ne détruit donc PAS la v1.
   */
  public async ecrire(nom: string, version: number, clair: Uint8Array): Promise<void> {
    this.exigerOuvert();
    this.refuserLeNomReserve(nom, "écrit");

    const motifNom = motifNomInvalide(nom);
    if (motifNom !== null) {
      throw new ErreurDeCoffre("nom_invalide", `Nom de secret refusé : ${motifNom}.`, { nom });
    }
    const motifVersion = motifVersionInvalide(version);
    if (motifVersion !== null) {
      throw new ErreurDeCoffre("version_invalide", `Version refusée : ${motifVersion}.`, {
        nom,
        version,
      });
    }

    const trousseau = this.exigerTrousseau();
    const enveloppe = chiffrer({
      keyId: trousseau.principale.keyId,
      cle: trousseau.principale.octets,
      nom,
      version,
      clair,
    });

    await this.depot.ecrire(this.versLigne(nom, version, enveloppe, null, 0));
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  § 27 — le compteur d'amorçage
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Lisible MÊME COFFRE VERROUILLÉ, et c'est voulu : l'écran Santé du § 22 est
   * « servi SANS le coffre » (§ 21), et il affiche `bootstrapCount`. Un
   * compteur qu'on ne peut lire que quand tout va bien ne sert à rien le jour
   * où ça va mal.
   *
   * Le compteur est une MÉTADONNÉE de la ligne, pas son contenu : le lire ne
   * déchiffre rien.
   */
  public async lireAmorcage(nom: string, version: number): Promise<CompteurDAmorcage> {
    const ligne = await this.depot.lire(nom, version);
    if (ligne === null) {
      throw new ErreurDeCoffre(
        "secret_introuvable",
        `Aucun secret « ${nom} » en version ${String(version)} : rien à compter.`,
        { nom, version },
      );
    }
    return this.versCompteur(nom, version, ligne.bootstrapCount);
  }

  /**
   * Compte un amorçage de plus. § 27 : « ops_secret.bootstrapCount est affiché
   * à l'écran Santé — un plafond qu'on ne compte pas est un mur qu'on découvre
   * en le percutant. »
   *
   * L'incrément exige le coffre OUVERT : un amorçage écrit un secret, et un
   * compteur qui monterait sans qu'un secret bouge mentirait dans le sens le
   * plus dangereux — il ferait croire qu'il reste moins de tentatives.
   */
  public async compterUnAmorcage(nom: string, version: number): Promise<CompteurDAmorcage> {
    this.exigerOuvert();

    // ⚠️ LE PLAFOND NE SE CONTRÔLE PAS AVANT D'ÉCRIRE. Lire le compteur, le
    //    comparer, puis incrémenter laisserait un `await` entre le contrôle et
    //    l'écriture : N amorçages concurrents liraient la même valeur, la
    //    passeraient tous, et incrémenteraient tous. Le § 27 rappelle que la
    //    régénération du jeton Zoho est PLAFONNÉE — chaque amorçage en trop
    //    est irrécupérable. La condition voyage donc DANS l'écriture, comme
    //    `insererSiAbsente` et `consommer` ailleurs dans le socle.
    const plafond = this.plafondBootstrap;

    if (plafond === null) {
      const sansPlafond = await this.depot.incrementerBootstrapCount(nom, version);
      const etat = this.versCompteur(nom, version, sansPlafond);
      this.publier(
        "amorçage-compté",
        `« ${nom} » v${String(version)} : ${String(sansPlafond)} amorçage(s).`,
      );
      return etat;
    }

    const souscrit = await this.depot.incrementerBootstrapCountSousPlafond(nom, version, plafond);
    if (souscrit === null) {
      // Le refus est prononcé PAR l'écriture. La relecture ne sert qu'à
      // nommer le nombre dans le message : elle ne décide de rien.
      const atteint = await this.lireAmorcage(nom, version);
      this.publier(
        "plafond-d-amorçage-atteint",
        `« ${nom} » v${String(version)} : ${String(atteint.compte)} amorçages, plafond ${String(plafond)}.`,
      );
      throw new ErreurDeCoffre(
        "plafond_bootstrap",
        `Le secret « ${nom} » version ${String(version)} a déjà servi à ` +
          `${String(atteint.compte)} amorçages, pour un plafond de ${String(plafond)}. ` +
          `Ne pas relancer l'amorçage : lire l'écran Santé et traiter la cause.`,
        { nom, version },
      );
    }

    const compte = souscrit;
    const apres = this.versCompteur(nom, version, compte);
    this.publier(
      "amorçage-compté",
      `« ${nom} » v${String(version)} : ${String(compte)} amorçage(s)` +
        (apres.reste === null ? "." : `, il en reste ${String(apres.reste)}.`),
    );
    return apres;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Rotation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Réécrit TOUTES les lignes sous une clé neuve, sceau compris.
   *
   * § 12 : « Sans `keyId`, la rotation est un tout-ou-rien qu'une interruption
   * rend irrattrapable. » Le point de ce code est donc l'ORDRE des opérations :
   * la nouvelle clé entre au trousseau et l'ancienne y RESTE, AVANT la première
   * écriture. Une panne au milieu laisse alors une base à deux `keyId` — et un
   * coffre qui lit les deux.
   *
   * Ce que ce module ne peut pas garantir seul : que l'ancienne clé soit
   * toujours au trousseau APRÈS un redémarrage. Cela dépend de la source
   * (`OPS_VAULT_KEYS_ANCIENNES`, ou une seconde clé posée à la console). Le
   * message de `rotation-interrompue` le rappelle, parce que c'est le moment où
   * on l'oublie.
   */
  public async tournerCle(nouvelle: CleDeCoffre): Promise<ResultatDeRotation> {
    this.exigerOuvert();
    const ancien = this.exigerTrousseau();

    if (nouvelle.keyId === ancien.principale.keyId) {
      throw new ErreurDeCoffre(
        "cle_invalide",
        `La clé « ${nouvelle.keyId} » est déjà la clé principale : une rotation vers ` +
          `elle-même laisserait croire que la clé a changé.`,
        { keyId: nouvelle.keyId },
      );
    }

    // LE SCEAU EST RÉÉCRIT EN PREMIER, et ce n'est pas un détail d'ordre.
    //
    // Si une panne survient au milieu, la question qui décide de la suite est :
    // « au prochain démarrage, avec la NOUVELLE clé seule, le coffre s'ouvre-t-il ? »
    //
    //  · sceau en premier → oui. Le socle démarre `ouvert`, lit les lignes déjà
    //    tournées, et refuse les autres avec `keyid_inconnu`, message qui NOMME
    //    la clé à reposer. L'incident se diagnostique en lisant l'erreur.
    //  · sceau en dernier → non. Le socle démarre `verrouillé` avec « coffre
    //    illisible », sans distinguer une rotation interrompue d'une clé perdue.
    //
    // Aucun des deux ordres ne change ce qui est RÉCUPÉRABLE : les lignes
    // restées sous l'ancienne clé exigent l'ancienne clé dans les deux cas.
    // Seul le diagnostic change — donc le temps qu'il faudra pour comprendre.
    const toutes = await this.depot.lister();
    const lignes = [
      ...toutes.filter((ligne) => ligne.name === NOM_DU_SCEAU),
      ...toutes.filter((ligne) => ligne.name !== NOM_DU_SCEAU),
    ];
    this.publier(
      "rotation-commencée",
      `${String(lignes.length)} ligne(s) à réécrire de « ${ancien.principale.keyId} » ` +
        `vers « ${nouvelle.keyId} ».`,
    );

    // L'ancienne principale DESCEND dans les anciennes ; elle n'est pas jetée.
    this.trousseau = {
      principale: { keyId: nouvelle.keyId, octets: Uint8Array.from(nouvelle.octets) },
      anciennes: [ancien.principale, ...ancien.anciennes],
    };

    let reecrites = 0;
    try {
      for (const ligne of lignes) {
        const clair = this.dechiffrerLigne(ligne);
        const enveloppe = chiffrer({
          keyId: nouvelle.keyId,
          cle: this.exigerTrousseau().principale.octets,
          nom: ligne.name,
          version: ligne.version,
          clair,
        });
        effacerOctets(clair);
        await this.depot.ecrire(
          this.versLigne(ligne.name, ligne.version, enveloppe, new Date(), ligne.bootstrapCount),
        );
        reecrites += 1;
      }
    } catch (cause) {
      this.publier(
        "rotation-interrompue",
        `${String(reecrites)} ligne(s) sur ${String(lignes.length)} réécrites. La base porte ` +
          `maintenant DEUX keyId : « ${ancien.principale.keyId} » et « ${nouvelle.keyId} ». ` +
          `GARDER LES DEUX CLÉS au trousseau — au redémarrage aussi — puis relancer la rotation.`,
      );
      throw cause;
    }

    this.publier(
      "rotation-terminée",
      `${String(reecrites)} ligne(s) réécrites sous « ${nouvelle.keyId} ».`,
    );
    return { keyId: nouvelle.keyId, lignes: reecrites };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Rouages
  // ───────────────────────────────────────────────────────────────────────────

  /** Présente le trousseau au sceau. Met à jour l'état, et lui seul. */
  private async tenterDOuvrirLeSceau(sceau: EnregistrementSecret): Promise<void> {
    const trousseau = await this.source.fournir();
    if (trousseau === null) {
      // Pas de clé : état NORMAL (§ 16, « mode déverrouillage au démarrage »).
      // Aucun événement — une alerte à chaque démarrage serait une alerte qu'on
      // apprend à ignorer.
      this.etatCourant = "verrouillé";
      this.trousseau = null;
      return;
    }

    const copie = clonerTrousseau(trousseau);
    const cle = cleDuTrousseau(copie, sceau.keyId);

    if (cle === undefined) {
      effacerTrousseau(copie);
      this.etatCourant = "verrouillé";
      this.trousseau = null;
      this.publier(
        "coffre-illisible",
        `Le sceau est chiffré sous « ${sceau.keyId} », que le trousseau ne porte pas ` +
          `(il porte : ${keyIdsDuTrousseau(copie).join(", ")}). Une rotation interrompue ? ` +
          `Reposer l'ancienne clé en clé ancienne.`,
      );
      return;
    }

    try {
      const clair = dechiffrer({
        cle: cle.octets,
        nom: NOM_DU_SCEAU,
        version: VERSION_DU_SCEAU,
        enveloppe: this.versEnveloppe(sceau),
      });
      if (!egalesEnTempsConstant(clair, CLAIR_DU_SCEAU)) {
        throw new ErreurDeCoffre(
          "dechiffrement_impossible",
          "Le sceau s'est déchiffré mais ne porte pas le contenu attendu.",
          { keyId: sceau.keyId },
        );
      }
    } catch {
      effacerTrousseau(copie);
      this.etatCourant = "verrouillé";
      this.trousseau = null;
      this.publier(
        "coffre-illisible",
        `La clé « ${sceau.keyId} » présentée n'ouvre pas le sceau. Le coffre reste ` +
          `verrouillé ; le socle démarre quand même (§ 23).`,
      );
      return;
    }

    this.trousseau = copie;
    this.etatCourant = "ouvert";
    this.publier("déverrouillé", `Sceau ouvert avec la clé « ${sceau.keyId} ».`);
  }

  private dechiffrerLigne(ligne: EnregistrementSecret): Buffer {
    const trousseau = this.exigerTrousseau();
    const cle = cleDuTrousseau(trousseau, ligne.keyId);

    if (cle === undefined) {
      throw new ErreurDeCoffre(
        "keyid_inconnu",
        `Le secret « ${ligne.name} » version ${String(ligne.version)} est chiffré sous la clé ` +
          `« ${ligne.keyId} », absente du trousseau (présentes : ` +
          `${keyIdsDuTrousseau(trousseau).join(", ")}). Reposer cette clé en clé ANCIENNE : ` +
          `c'est le cas d'une rotation interrompue, et il est rattrapable.`,
        { nom: ligne.name, version: ligne.version, keyId: ligne.keyId },
      );
    }

    return dechiffrer({
      cle: cle.octets,
      nom: ligne.name,
      version: ligne.version,
      enveloppe: this.versEnveloppe(ligne),
    });
  }

  private versEnveloppe(ligne: EnregistrementSecret): EnveloppeChiffree {
    return { keyId: ligne.keyId, iv: ligne.iv, ciphertext: ligne.ciphertext, tag: ligne.tag };
  }

  private versLigne(
    name: string,
    version: number,
    enveloppe: EnveloppeChiffree,
    rotatedAt: Date | null,
    bootstrapCount: number,
  ): EnregistrementSecret {
    return {
      name,
      version,
      keyId: enveloppe.keyId,
      ciphertext: enveloppe.ciphertext,
      iv: enveloppe.iv,
      tag: enveloppe.tag,
      rotatedAt,
      bootstrapCount,
    };
  }

  private versCompteur(nom: string, version: number, compte: number): CompteurDAmorcage {
    const plafond = this.plafondBootstrap;
    return {
      nom,
      version,
      compte,
      plafond,
      reste: plafond === null ? null : Math.max(0, plafond - compte),
    };
  }

  private exigerGeste(geste: GesteCoffre): void {
    const resultat = appliquerGeste(this.etatCourant, geste);
    if (!resultat.permise) {
      this.publier("geste-refusé", resultat.motif);
      throw new ErreurDeCoffre("transition_interdite", resultat.motif);
    }
  }

  private exigerOuvert(): void {
    if (this.etatCourant !== "ouvert") {
      const refus = this.refusDAppelDOutil();
      throw new ErreurDeCoffre(
        this.etatCourant === "absent" ? "coffre_absent" : "coffre_verrouille",
        refus?.message ?? "Le coffre n'est pas ouvert.",
      );
    }
  }

  private exigerTrousseau(): Trousseau {
    if (this.trousseau === null) {
      // Ne devrait pas arriver : `ouvert` et « trousseau posé » vont ensemble.
      // Le vérifier quand même — l'invariant qu'on n'écrit pas est celui qui
      // casse.
      throw new ErreurDeCoffre(
        "coffre_verrouille",
        "Coffre déclaré ouvert sans trousseau : incohérence interne, refus fail-closed.",
      );
    }
    return this.trousseau;
  }

  private refuserLeNomReserve(nom: string, verbe: string): void {
    if (nom === NOM_DU_SCEAU) {
      throw new ErreurDeCoffre(
        "nom_reserve",
        `« ${NOM_DU_SCEAU} » est le sceau du coffre et ne peut pas être ${verbe} comme un ` +
          `secret : l'écraser rendrait le coffre « absent » au redémarrage suivant.`,
        { nom },
      );
    }
  }

  private publier(nom: NomEvenementDuCoffre, detail: string): void {
    this.journal.evenement({ nom, etat: this.etatCourant, detail, horodatage: new Date() });
  }
}
