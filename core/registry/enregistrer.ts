/**
 * L'ENREGISTREMENT d'un adaptateur — la seule porte du registre (§ 09, § 12).
 *
 * ═══ CE QUE CETTE FONCTION EST ═══
 *
 * Le point où un document venu d'un autre dépôt — souvent PUBLIC — devient une
 * ligne `ops_adapter` et des lignes `ops_tool`. Tout ce qui suit est écrit
 * depuis cette position : le manifeste n'est pas de confiance, le verrou l'est.
 *
 * ═══ LES QUATRE REFUS QUI COMPTENT ═══
 *
 *  1. **Empreinte divergente.** Le manifeste servi n'est pas celui qu'un humain
 *     a relu et épinglé dans `adapters.lock.json`. Un outil ajouté, un `effect`
 *     basculé de `send` à `read`, un `dataClass` élargi : tous changent
 *     l'empreinte, et aucun n'est visible autrement.
 *  2. **`mode === "fédéré"` avec des secrets.** Injecter un secret déchiffré
 *     vers un adaptateur distant le déverse en clair — et, dans le cas du CRM,
 *     vers un dépôt public.
 *  3. **Confiance auto-décernée.** `trustTier` et `maxDataClass` sont fixés
 *     CÔTÉ SOCLE ; un manifeste qui les porte est refusé, sur une liste
 *     DÉRIVÉE de la différence entre la forme du verrou et celle du manifeste.
 *  4. **`dataClass` au-dessus du plafond.** C'est « la seule garde de ce sujet
 *     qui puisse rougir sans inspection de sortie, et elle ne se rattrape pas
 *     plus tard sans migration du registre » (§ 29).
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 *
 * Aucune écriture. Elle rend des LIGNES prêtes à écrire. La persistance
 * appartient à un autre module, et un enregistrement qui écrirait au fil de ses
 * contrôles laisserait un registre à moitié rempli au premier refus.
 */

import { DATA_CLASSES, rangDataClass } from "../types.js";
import { octetsCanoniques } from "../adapter-kit/json.js";
// ⚠️ `requisDuSchema` EST IMPORTÉE, JAMAIS RÉÉCRITE — ADR 0036, décision 6.
//    C'est la fonction que le contrôle C13.3 du BUILD emploie déjà. Deux
//    définitions de « quels champs ce schéma exige-t-il » divergeraient au
//    premier dialecte ajouté, et le build accepterait alors ce que l'admission
//    refuse — ou l'inverse, ce qui est pire (ADR 0003).
import { nomComplet, prefixeDe, requisDuSchema } from "../adapter-kit/manifest.js";
import { analyserFermeture, chercherChampsDAutorisation } from "../adapter-kit/fermeture.js";
import {
  analyserChampsDeclares,
  motifGovernanceFieldIntrouvable,
  remedeIdFieldSansEffet,
} from "../adapter-kit/champs-declares.js";
import type { SceauProfils } from "../adapter-kit/profils.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import { OUTIL_CLOTURE } from "../audit/vocabulaire.js";
import { analyserScope } from "../policy/scope.js";
import { octetsDeLaDefinition, type DefinitionOutil, type ProfileName } from "../profiles/index.js";
import { clesReserveesAuSocle, empreinteDuManifesteRecu, entreePourId } from "./lock.js";
import { clesDePremierNiveau, lireManifesteRecu } from "./manifeste-recu.js";
import type {
  GardeAnnoncee,
  LigneOpsAdapter,
  LigneOpsTool,
  Refus,
  ResultatEnregistrement,
  VerrouAdaptateurs,
} from "./types.js";

/** Ce que l'enregistrement reçoit. */
export interface EntreeEnregistrement {
  /**
   * Le manifeste tel qu'il ARRIVE — non validé, non filtré. C'est sur cette
   * valeur que l'empreinte est prise.
   */
  readonly manifesteBrut: unknown;
  /** Le verrou versionné dans le socle, déjà lu par `lireVerrou()`. */
  readonly verrou: VerrouAdaptateurs;
  /** L'énumération FERMÉE de `core/profiles/`. Le registre ne la contient pas. */
  readonly profilsConnus: readonly string[];
  /**
   * LE SCEAU de cette énumération, DU CÔTÉ SOCLE (ADR 0004).
   *
   * C'est lui qui fait foi. Le manifeste porte le sien — celui contre lequel
   * il a été produit, dans un autre dépôt — et le registre confronte les deux.
   * Sans cette confrontation, `PROFILES_VERSION` et `empreinteProfils()`
   * étaient une garde qui ne pouvait pas rougir : elle n'était branchée nulle
   * part.
   */
  readonly sceauProfils: SceauProfils;
  /**
   * CONTRÔLE 7 DU § 09 — les noms qu'un schéma d'entrée n'a pas le droit de
   * porter, DÉRIVÉS de `ToolContext` et `Habilitations` par
   * `lireClesDAutorisation()` de `core/adapter-kit`.
   *
   * ⚠️ ILS SONT REÇUS, PAS LUS ICI. La dérivation lit `core/types.ts` SUR LE
   *    DISQUE ; la faire dans cette fonction la rendrait dépendante du système
   *    de fichiers, donc impossible à éprouver sur un double — alors que le
   *    registre est précisément l'endroit où toute garde doit pouvoir rougir
   *    sur un témoin fabriqué.
   *
   * ⚠️ UNE LISTE VIDE OU TROP COURTE FAIT LEVER. Ce n'est pas un refus du
   *    manifeste — le manifeste n'y est pour rien — c'est un défaut de
   *    l'APPELANT, et le laisser passer rendrait le contrôle 7 vacueux : il
   *    passerait sur n'importe quel schéma, et l'absence d'alerte se lirait
   *    comme une absence de problème.
   */
  readonly clesDAutorisation: readonly string[];
}

/**
 * Plancher-témoin de la liste du contrôle 7.
 *
 * `ToolContext` porte huit propriétés et `Habilitations` au moins une : cinq
 * est une borne basse confortable, qui n'attrape que la dérivation CASSÉE.
 * Elle reprend le plancher de `clesDAutorisationDepuisSource()` sans le
 * recopier de force : là-bas on garde la LECTURE, ici on garde l'APPELANT.
 */
export const PLANCHER_CLES_AUTORISATION = 5;

/** Levée quand l'appelant désarmerait une garde en la privant de sa matière. */
export class ErreurGardeAveugle extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ErreurGardeAveugle";
  }
}

function refus(motif: Refus["motif"], detail: string): Refus {
  return { motif, detail };
}

/**
 * Enregistre — ou refuse — un adaptateur.
 *
 * Rend TOUS les refus, pas le premier : un exploitant qui corrige un défaut à
 * la fois fait autant d'allers-retours qu'il y a de défauts, et chacun coûte un
 * cycle de build dans un autre dépôt.
 */
export function enregistrerAdaptateur(entree: EntreeEnregistrement): ResultatEnregistrement {
  // AVANT TOUT REFUS DE MANIFESTE : le registre refuse de travailler AVEUGLE.
  // Un appelant qui passerait une liste vide de clés d'autorisation ferait du
  // contrôle 7 une garde verte sur n'importe quoi. Ce n'est pas un refus
  // d'admission — le manifeste n'y est pour rien — c'est une levée.
  if (entree.clesDAutorisation.length < PLANCHER_CLES_AUTORISATION) {
    throw new ErreurGardeAveugle(
      `enregistrerAdaptateur : ${String(entree.clesDAutorisation.length)} clé(s) ` +
        `d'autorisation reçue(s) pour un plancher de ${String(PLANCHER_CLES_AUTORISATION)}. ` +
        "Le contrôle 7 du § 09 passerait alors sur n'importe quel schéma d'entrée, et " +
        "l'absence d'alerte se lirait comme une absence de problème. Les dériver avec " +
        "`lireClesDAutorisation()` de `core/adapter-kit`.",
    );
  }

  const refuses: Refus[] = [];

  // ───────────────────────────────────────────────────────────────────────────
  //  LES DEUX GARDES QUI ANNONCENT — ADR 0015 (G2) et ADR 0016 (G3)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ LES COMPTEURS SONT DÉCLARÉS ICI, ET `annonces()` EST APPELÉE À CHAQUE
  //    SORTIE — y compris aux quatre sorties anticipées. Un canal d'annonce
  //    rempli seulement sur le chemin nominal serait VIDE exactement quand
  //    l'exploitant en a le plus besoin, et un tableau vide se lit « rien à
  //    signaler » alors qu'il veut dire « la garde n'a pas tourné ». Le plancher
  //    du `Verdict` est ce qui distingue les deux, et il ne le fait que si le
  //    verdict est rendu.
  let idFieldsDeclares = 0;
  let idFieldsConfrontes = 0;
  let idFieldsFermes = 0;
  const idFieldsSansEffet: string[] = [];

  let gouvernanceDeclares = 0;
  let gouvernanceConfrontes = 0;
  let gouvernanceIntrouvables = 0;

  // § 13.3, ADR 0036 — combien de champs de rang 2 ont été DÉCLARÉS, combien
  // ont été CONFRONTÉS aux requis du schéma de sortie, combien s'y trouvaient.
  let rang2Declares = 0;
  let rang2Confrontes = 0;
  let rang2Obligatoires = 0;

  const annonces = (): readonly GardeAnnoncee[] => [
    {
      nom:
        `idFields sans effet (§ 20, ADR 0015) — ${String(idFieldsDeclares)} déclaré(s), ` +
        `${String(idFieldsConfrontes)} confronté(s) au schéma, ${String(idFieldsFermes)} ` +
        "fermé(s) par lui",
      // Le plancher vaut 1 : un manifeste dont AUCUN `idFields` n'a été
      // confronté rend cette garde muette, et c'est `anomaliesCompletes()` qui
      // doit le dire — jamais la couleur.
      verdict: { mesures: idFieldsConfrontes, plancher: 1, anomalies: idFieldsSansEffet },
    },
    {
      nom:
        `champs de gouvernance déclarés (§ 20, ADR 0016) — ${String(gouvernanceDeclares)} ` +
        `déclaré(s), ${String(gouvernanceConfrontes)} confronté(s) au schéma, ` +
        `${String(gouvernanceIntrouvables)} introuvable(s)`,
      // ⚠️ PLANCHER À ZÉRO, ET C'EST LA SEULE GARDE DE CE FICHIER QUI EN PORTE
      //    UN. Le champ est OBLIGATOIRE et sa valeur neutre PORTE UN NOM
      //    (`AUCUN_CHAMP_DE_GOUVERNANCE`) : « zéro déclaré » est donc une phrase
      //    ÉCRITE par l'auteur de l'outil, pas un silence — c'est tout l'objet de
      //    l'ADR 0016 sur ce point. Un plancher à 1 punirait ici la déclaration
      //    correcte de n'avoir rien à déclarer.
      //
      //    Ce qui garde ce cas n'est pas ce plancher : c'est le refus
      //    `champ_de_gouvernance_introuvable`, plus bas, et le schéma FERMÉ de
      //    `manifeste-recu.ts` qui exige le champ.
      verdict: { mesures: gouvernanceDeclares, plancher: 0, anomalies: [] },
    },
    {
      nom:
        `champs de rang 2 au schéma de sortie (§ 13.3, ADR 0036) — ` +
        `${String(rang2Declares)} déclaré(s), ${String(rang2Confrontes)} confronté(s) aux ` +
        `requis, ${String(rang2Obligatoires)} obligatoire(s)`,
      // ⚠️ PLANCHER À ZÉRO, POUR LA MÊME RAISON QUE LA GARDE DU DESSUS ET POUR
      //    UNE AUTRE. `compaction.tier2` peut légitimement être VIDE : un outil
      //    dont la sortie n'a pas de second palier n'a rien à déclarer, et la
      //    cascade du § 13.3 saute ce palier. Un plancher à 1 punirait ici
      //    l'outil correct de n'avoir rien à déclarer.
      //
      //    Ce qui garde le cas « la garde n'a rien vu » n'est donc pas ce
      //    plancher : c'est ce compte, ANNONCÉ, qui distingue « aucun champ de
      //    rang 2 déclaré » de « la boucle n'a pas tourné ». Le refus, lui, est
      //    prononcé plus bas, dans le contrôle 7 ter.
      //
      // ⚠️ LE COMPTE ANNONCÉ EST CELUI DES CHAMPS CONFRONTÉS, PAS DES CHAMPS
      //    DÉCLARÉS. Les deux sont égaux tant que la boucle traite chaque
      //    champ ; ils divergent à la première sortie anticipée qu'on y
      //    ajouterait, et c'est ce jour-là que l'annonce doit dire la vérité.
      verdict: { mesures: rang2Confrontes, plancher: 0, anomalies: [] },
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  //  0 · L'empreinte, prise sur le document BRUT, avant toute validation
  // ───────────────────────────────────────────────────────────────────────────
  let empreinteRecue: string | null = null;
  try {
    empreinteRecue = empreinteDuManifesteRecu(entree.manifesteBrut);
  } catch (erreur) {
    refuses.push(
      refus(
        "manifeste_malforme",
        `le document reçu n'est pas du JSON : ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  1 · La confiance auto-décernée — AVANT la validation de forme
  // ───────────────────────────────────────────────────────────────────────────
  //
  // L'ordre compte. Le schéma du manifeste est FERMÉ : il rejetterait
  // `trustTier` avec un message générique de clé inconnue. Or ce cas-là mérite
  // d'être nommé — c'est une tentative d'un dépôt de se décerner son propre
  // niveau de confiance, pas une faute de frappe.
  const reservees = clesReserveesAuSocle();
  const usurpees = clesDePremierNiveau(entree.manifesteBrut).filter((cle) =>
    reservees.includes(cle),
  );
  if (usurpees.length > 0) {
    refuses.push(
      refus(
        "confiance_auto_decernee",
        `le manifeste porte ${usurpees.join(", ")} — champ(s) que le socle fixe lui-même à ` +
          `l'enregistrement (réservés : ${reservees.join(", ")}). Un manifeste qui les ` +
          "déclare demande à choisir son propre niveau de confiance.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  2 · La forme
  // ───────────────────────────────────────────────────────────────────────────
  const lecture = lireManifesteRecu(entree.manifesteBrut);
  const manifeste: Manifeste | null = lecture.manifeste;
  if (manifeste === null) {
    refuses.push(refus("manifeste_malforme", lecture.verdict.anomalies.join(" · ")));
    return { admis: false, refus: refuses, outilsInspectes: 0, annonces: annonces() };
  }

  const outilsInspectes = manifeste.tools.length;

  // ───────────────────────────────────────────────────────────────────────────
  //  2 bis · L'ID DOIT ÊTRE NOMMABLE PAR UN SCOPE (§ 12, grammaire de `scope`)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // On ne teste pas « l'id contient-il un point ? » — ce serait retaper la
  // grammaire, et la faire diverger le jour où elle bouge. On DEMANDE à
  // `core/policy` si le scope d'adaptateur que cet id produirait est lisible.
  // La règle vit à un seul endroit ; ici on l'interroge.
  const scopeDeLAdaptateur = `${manifeste.id}.*`;
  const lisibilite = analyserScope(scopeDeLAdaptateur);
  if (!lisibilite.valide) {
    refuses.push(
      refus(
        "id_innommable_par_un_scope",
        `id « ${manifeste.id} » : aucune ligne d'\`ops_policy\` ne pourrait viser cet ` +
          `adaptateur — ${lisibilite.motif}. Conséquence : « zoho.mail.send » se lit comme ` +
          "l'outil « mail.send » de l'adaptateur « zoho », donc un id à points ferait porter " +
          "la politique d'un adaptateur sur un autre, en silence. Renommez l'adaptateur " +
          "(« zoho-mail ») ou portez le préfixe dans le NOM de l'outil (« mail.send »).",
      ),
    );
    return { admis: false, refus: refuses, outilsInspectes, annonces: annonces() };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  3 · L'épinglage
  // ───────────────────────────────────────────────────────────────────────────
  const epingle = entreePourId(entree.verrou, manifeste.id);
  if (epingle === undefined) {
    refuses.push(
      refus(
        "adaptateur_absent_du_verrou",
        `aucune entrée d'\`adapters.lock.json\` ne porte l'id « ${manifeste.id} ». Un ` +
          "adaptateur non épinglé n'a été relu par personne : le socle ne sait pas quelle " +
          "version il admettrait.",
      ),
    );
    return { admis: false, refus: refuses, outilsInspectes, annonces: annonces() };
  }

  if (empreinteRecue !== null && empreinteRecue !== epingle.manifestSha) {
    refuses.push(
      refus(
        "empreinte_divergente",
        `empreinte reçue ${empreinteRecue}, épinglée ${epingle.manifestSha}. Le manifeste ` +
          "servi n'est pas celui qui a été relu. Mettez le verrou à jour dans un commit du " +
          "socle après revue — jamais l'inverse.",
      ),
    );
  }

  if (manifeste.version !== epingle.version) {
    refuses.push(
      refus(
        "epinglage_incoherent",
        `version du manifeste « ${manifeste.version} », version épinglée ` +
          `« ${epingle.version} ».`,
      ),
    );
  }
  if (manifeste.mode !== epingle.mode) {
    refuses.push(
      refus(
        "epinglage_incoherent",
        `mode du manifeste « ${manifeste.mode} », mode épinglé « ${epingle.mode} ». Le mode ` +
          "commande l'injection des secrets : une divergence ici est une divergence de " +
          "frontière de processus.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  4 · L'ASSERTION DU § 09 — fédéré ⇒ aucun secret
  // ───────────────────────────────────────────────────────────────────────────
  if (manifeste.mode === "fédéré" && manifeste.secrets.length > 0) {
    refuses.push(
      refus(
        "secrets_en_mode_federe",
        `« ${manifeste.id} » est fédéré et déclare ${String(manifeste.secrets.length)} ` +
          `secret(s) (${manifeste.secrets.join(", ")}). Le socle n'émet JAMAIS un secret ` +
          "déchiffré hors de son processus : un adaptateur fédéré détient ses identifiants " +
          "par les moyens de son produit et déclare `secrets: []`.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  5 · Le raccordement, cohérent avec le mode
  // ───────────────────────────────────────────────────────────────────────────
  if (epingle.mode === "fédéré" && (epingle.endpoint === null || epingle.secretRef === null)) {
    refuses.push(
      refus(
        "raccordement_incoherent",
        `« ${manifeste.id} » est fédéré, mais le verrou ne donne ` +
          `${epingle.endpoint === null ? "aucun endpoint" : ""}` +
          `${epingle.endpoint === null && epingle.secretRef === null ? " ni " : ""}` +
          `${epingle.secretRef === null ? "aucun secretRef" : ""}.`,
      ),
    );
  }
  if (epingle.mode === "hébergé" && epingle.endpoint !== null) {
    refuses.push(
      refus(
        "raccordement_incoherent",
        `« ${manifeste.id} » est hébergé — il vit dans le processus du socle — et le verrou ` +
          "lui donne pourtant un endpoint.",
      ),
    );
  }
  if (!Number.isInteger(epingle.trustTier) || epingle.trustTier < 0) {
    refuses.push(
      refus(
        "confiance_invalide",
        `trustTier « ${String(epingle.trustTier)} » — attendu un entier positif ou nul.`,
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  5 bis · `bytes` est RECALCULÉ, jamais cru sur parole
  // ───────────────────────────────────────────────────────────────────────────
  //
  // `ops_tool.bytes` (§ 12) est l'unité du budget du § 14. Il arrive ANNONCÉ par
  // un document produit dans un autre dépôt — public à jamais dans le cas du
  // CRM — et il est intégralement DÉRIVABLE de ce même document : la taille en
  // octets UTF-8 de son JSON canonique, `bytes` exclu de son propre calcul.
  //
  // Le recopier tel quel laissait un manifeste déclarer `bytes: 0` sur une
  // définition de plusieurs centaines d'octets. L'épinglage par empreinte ne
  // rattrape rien ici : il certifie qu'un humain a relu CE document, pas qu'un
  // humain a recompté ses octets à la main.
  for (const outil of manifeste.tools) {
    const { bytes: annonces, ...sansBytes } = outil;
    const mesures = octetsCanoniques(sansBytes);
    if (mesures !== annonces) {
      refuses.push(
        refus(
          "bytes_incoherent",
          `« ${nomComplet(manifeste.id, outil.name)} » annonce ${String(annonces)} octets ` +
            `alors que sa définition en pèse ${String(mesures)} ` +
            `(${String(mesures - annonces)} d'écart). \`bytes\` est l'unité du budget du ` +
            "§ 14 : une valeur annoncée plus basse que la mesure ferait tenir sous le " +
            "plafond une liste servie qui le dépasse. Reconstruire le manifeste depuis " +
            "l'adaptateur plutôt que corriger le nombre à la main.",
        ),
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  6 · Le plafond de classe de données
  // ───────────────────────────────────────────────────────────────────────────
  const plafond = rangDataClass(epingle.maxDataClass);
  for (const outil of manifeste.tools) {
    if (rangDataClass(outil.dataClass) > plafond) {
      refuses.push(
        refus(
          "dataclass_au_dessus_du_plafond",
          `« ${nomComplet(manifeste.id, outil.name)} » déclare dataClass ` +
            `« ${outil.dataClass} » alors que son adaptateur plafonne à ` +
            `« ${epingle.maxDataClass} » (ordre : ${DATA_CLASSES.join(" < ")}). Le plafond ` +
            "est fixé côté socle ; c'est l'adaptateur qui doit redescendre, pas le plafond " +
            "qui doit monter.",
        ),
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  7 · Les profils, dans l'énumération fermée
  // ───────────────────────────────────────────────────────────────────────────
  const inconnus = manifeste.profiles.filter((profil) => !entree.profilsConnus.includes(profil));
  if (inconnus.length > 0) {
    refuses.push(
      refus(
        "profil_inconnu",
        `profil(s) ${inconnus.join(", ")} hors de l'énumération fermée ` +
          `(${entree.profilsConnus.join(", ")}). Chez un adaptateur TypeScript c'est une ` +
          "erreur de compilation ; ici c'est le même refus, pour les adaptateurs des autres " +
          "langages qui ne passent par aucun compilateur du socle.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  7 bis · LE SCEAU DE L'ÉNUMÉRATION DE PROFILS (ADR 0004)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Le contrôle 7 ci-dessus vérifie que chaque NOM de profil est connu. Ce
  // n'est pas la même chose : deux énumérations peuvent porter les mêmes noms
  // sans être la même — un profil retiré puis rendu, un `depuis` corrigé. Un
  // adaptateur fédéré produit son manifeste DANS UN AUTRE DÉPÔT, contre SA
  // copie de `core/profiles`, et jusqu'ici la divergence ne se voyait nulle
  // part : le manifeste restait valide, les noms restaient connus, le registre
  // admettait.
  //
  // ⚠️ LES DEUX CHAMPS SONT CONFRONTÉS, PAS UN SEUL. Une version identique avec
  //    une empreinte différente est le cas qu'on veut voir : quelqu'un a
  //    modifié l'énumération sans en changer la version. Ne confronter que la
  //    version laisserait passer exactement celui-là.
  if (manifeste.profilesVersion !== entree.sceauProfils.version) {
    refuses.push(
      refus(
        "enumeration_profils_divergente",
        "le manifeste a été produit contre l'énumération de profils " +
          `« ${manifeste.profilesVersion} », le socle porte ` +
          `« ${entree.sceauProfils.version} ». Reconstruire le manifeste dans le dépôt de ` +
          "l'adaptateur, contre la version courante — jamais corriger le champ à la main.",
      ),
    );
  } else if (manifeste.profilesSha !== entree.sceauProfils.empreinte) {
    refuses.push(
      refus(
        "enumeration_profils_divergente",
        `le manifeste annonce la version d'énumération « ${manifeste.profilesVersion} », ` +
          "la MÊME que celle du socle, mais une empreinte DIFFÉRENTE " +
          `(${manifeste.profilesSha} contre ${entree.sceauProfils.empreinte}). ` +
          "L'énumération a donc changé sans que sa version change : c'est exactement ce que " +
          "l'empreinte existe pour rendre visible. Incrémenter `PROFILES_VERSION` dans le " +
          "socle, puis reconstruire le manifeste.",
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  7 ter · LE SCHÉMA D'ENTRÉE EST FERMÉ, ET NE PORTE AUCUN DROIT (ADR 0003)
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Les deux règles du § 09 — « le schéma d'entrée est `.strict()` » et le
  // contrôle 7 — n'étaient tenues que du côté BUILD, donc seulement pour un
  // adaptateur TypeScript passant par le kit. Le registre est la SEULE barrière
  // statique pour un manifeste produit ailleurs : le CRM en PHP, dépôt public à
  // jamais (§ 29).
  //
  // Témoin mesuré au lot 1 : un manifeste déclarant `peutVoirAppels` dans son
  // `inputSchema`, sans `additionalProperties`, était ADMIS sans un mot.
  //
  // ⚠️ DEUX DIALECTES SONT ACCEPTÉS — `additionalProperties: false` ET
  //    `unevaluatedProperties: false`. C'est un contrat inter-langages, pas un
  //    choix de style : voir `core/adapter-kit/fermeture.ts` et l'ADR 0003.
  for (const outil of manifeste.tools) {
    const ou = nomComplet(manifeste.id, outil.name);

    const fermeture = analyserFermeture(outil.inputSchema);
    if (!fermeture.ferme) {
      refuses.push(
        refus(
          "schema_entree_ouvert",
          `« ${ou} » : schéma d'entrée non fermé — ${String(fermeture.sousSchemasInspectes)} ` +
            `sous-schéma(s) inspecté(s), ${String(fermeture.objetsAFermer)} à fermer, ` +
            `${String(fermeture.ouverts.length)} ouvert(s)` +
            (fermeture.ouverts.length > 0 ? ` (${fermeture.ouverts.join(", ")})` : "") +
            (fermeture.profondeurDepassee ? ", et la profondeur maximale a été dépassée" : "") +
            (fermeture.refsNonResolus.length > 0
              ? `, ${String(fermeture.refsNonResolus.length)} renvoi(s) non résolu(s)`
              : "") +
            ". Un champ d'autorisation glissé dans la charge utile y passerait en silence " +
            "(§ 09). Fermer chaque schéma d'objet par `additionalProperties: false` ou par " +
            "`unevaluatedProperties: false`.",
        ),
      );
    }

    const controle7 = chercherChampsDAutorisation(outil.inputSchema, entree.clesDAutorisation);
    if (controle7.trouves.length > 0) {
      refuses.push(
        refus(
          "champ_d_autorisation_au_schema",
          `« ${ou} » : le schéma d'entrée déclare ` +
            controle7.trouves.map((champ) => `« ${champ.nom} » (${champ.chemin})`).join(", ") +
            " — nom(s) réservé(s) au contexte d'autorisation, sur " +
            `${String(controle7.proprietesInspectees)} propriété(s) inspectée(s) et ` +
            `${String(controle7.clesInterdites)} nom(s) interdit(s). Une décision de droit ` +
            "atteint la couche service par `ctx`, et par lui seul (§ 09, contrôle 7) : " +
            "renommer le champ d'entrée.",
        ),
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  7 ter bis · LE RANG 2 EST OPTIONNEL AU SCHÉMA DE SORTIE (§ 13.3)
    // ─────────────────────────────────────────────────────────────────────────
    //
    // ADR 0036, décision 6. Troisième règle du § 09 / § 13.3 à être REDOUBLÉE
    // ici, et pour le même motif que les deux précédentes : le registre est la
    // SEULE barrière statique pour un manifeste produit ailleurs — le CRM en
    // PHP, dépôt public à jamais (§ 29). Le contrôle C13.3 du build ne voit que
    // les adaptateurs TypeScript passant par le kit, c'est-à-dire précisément
    // pas le mode FÉDÉRÉ que la règle vise.
    //
    // ⚠️ LA MÊME FONCTION QUE LE BUILD — `requisDuSchema()`, importée en tête
    //    de fichier comme `nomComplet` et `prefixeDe` le sont déjà. Aucune
    //    lecture de `required` n'est écrite ici.
    //
    // ⚠️ UN REFUS PAR CHAMP, PAS UN PAR OUTIL. Un exploitant qui corrige un
    //    champ à la fois paie un cycle de build dans un autre dépôt à chaque
    //    aller-retour : c'est la raison d'être de « rendre TOUS les refus »,
    //    appliquée à l'intérieur d'un outil.
    const requisDeLaSortie = requisDuSchema(outil.outputSchema);
    rang2Declares += outil.compaction.tier2.length;
    for (const champ of outil.compaction.tier2) {
      rang2Confrontes += 1;
      if (!requisDeLaSortie.includes(champ)) continue;
      rang2Obligatoires += 1;
      refuses.push(
        refus(
          "rang2_obligatoire_au_schema",
          `« ${ou} » : « ${champ} » est déclaré de rang 2 (compaction.tier2) et OBLIGATOIRE ` +
            `au schéma de sortie (${String(requisDeLaSortie.length)} champ(s) requis : ` +
            `${requisDeLaSortie.join(", ")}). Au deuxième palier de la cascade du § 13.3, le ` +
            "socle retire ce champ — et la charge compactée ne valide plus le schéma que " +
            "l'outil PUBLIE, celui-là même que le client a lu. Retirer le champ de " +
            "`required`, ou le retirer de `compaction.tier2` : l'une des deux déclarations " +
            "est de trop, et c'est à l'auteur de l'outil de dire laquelle.",
        ),
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  7 quater · LES DEUX DÉCLARATIONS DU § 09 (ADR 0015 et ADR 0016)
    // ─────────────────────────────────────────────────────────────────────────
    //
    // ⚠️ LA MÊME FONCTION QUE LE BUILD — `analyserChampsDeclares()`, appelée
    //    aussi par `analyserDefinition()` de `core/adapter-kit/manifest.ts`.
    //    L'écrire deux fois ferait deux définitions de « le schéma referme ce
    //    champ », et le build accepterait ce que l'admission refuse — ou
    //    l'inverse, ce qui est pire (ADR 0003).
    //
    // Les deux déclarations sont traitées de façon OPPOSÉE, et c'est la seule
    // chose à retenir de cette paire d'ADR :
    //
    //  · `governanceFields` RESSERRE → on le croit, donc un nom qui ne désigne
    //    rien est une ANOMALIE : son auteur le croit appliqué ;
    //  · `idFields` ne RETIRE plus rien → on l'ignore, donc un nom sans effet
    //    est seulement ANNONCÉ. On n'interdit pas ce qu'on ignore.
    const declares = analyserChampsDeclares(outil.inputSchema, {
      idFields: outil.idFields,
      governanceFields: outil.governanceFields,
    });

    // ── ADR 0016, garde G3 — REFUS ──────────────────────────────────────────
    gouvernanceDeclares += declares.governanceFieldsDeclares;
    gouvernanceConfrontes += declares.governanceFieldsConfrontes.length;
    gouvernanceIntrouvables += declares.governanceFieldsIntrouvables.length;

    if (declares.governanceFieldsEnDouble.length > 0) {
      refuses.push(
        refus(
          "champs_de_gouvernance_en_double",
          `« ${ou} » : governanceFields en double — ` +
            `${declares.governanceFieldsEnDouble.join(", ")}. Un nom répété ne surveille pas ` +
            "deux fois ; il indique une liste recopiée à la main, donc relue par personne.",
        ),
      );
    }
    for (const nom of declares.governanceFieldsIntrouvables) {
      refuses.push(
        refus(
          "champ_de_gouvernance_introuvable",
          `« ${ou} » : ` +
            motifGovernanceFieldIntrouvable(nom, declares.nomsDistincts, declares.nomsDuSchema),
        ),
      );
    }

    // ── ADR 0015, garde G2 — ANNONCE, jamais refus ──────────────────────────
    idFieldsDeclares += declares.idFieldsDeclares;
    idFieldsConfrontes += declares.idFieldsConfrontes.length;
    idFieldsFermes += declares.idFieldsFermes.length;

    for (const champ of declares.idFieldsSansEffet) {
      idFieldsSansEffet.push(
        `« ${ou} » : ${remedeIdFieldSansEffet(champ.nom)} ` +
          `Chemin(s) mesuré(s) : ${champ.chemins.join(", ")}.`,
      );
    }
    for (const nom of declares.idFieldsIntrouvables) {
      idFieldsSansEffet.push(
        `« ${ou} » : idFields déclare « ${nom} », qui n'est une propriété d'AUCUN ` +
          `sous-schéma d'entrée (${String(declares.nomsDistincts)} nom(s) distinct(s) ` +
          `confronté(s)${
            declares.nomsDuSchema.length > 0 ? ` : ${declares.nomsDuSchema.join(", ")}` : ""
          }). La déclaration ne nomme rien : le § 31 purgerait \`recordIds\` sur une liste ` +
          "qui ne correspond à aucun champ. Corriger le nom, ou retirer la déclaration.",
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  8 · Les préfixes, dérivés — et les noms complets, uniques
  // ───────────────────────────────────────────────────────────────────────────
  const prefixe = prefixeDe(manifeste.id);
  const vus = new Set<string>();
  for (const outil of manifeste.tools) {
    if (outil.name.startsWith(`${prefixe}.`)) {
      refuses.push(
        refus(
          "prefixe_non_derive",
          `« ${outil.name} » porte le préfixe « ${prefixe}. » écrit à la main. Le préfixe est ` +
            "dérivé de l'id de l'adaptateur ; deux sources pour un même préfixe divergent au " +
            "premier renommage.",
        ),
      );
    }
    const complet = nomComplet(manifeste.id, outil.name);
    if (vus.has(complet)) {
      refuses.push(
        refus(
          "outil_en_double",
          `deux outils portent le nom complet « ${complet} » : \`tools/list\` en publierait ` +
            "un et le second serait injoignable sans un mot.",
        ),
      );
    }
    // ⚠️ LE NOM EST CONFRONTÉ À LA CONSTANTE DU JOURNAL, PAS À UNE COPIE.
    //    `core/audit/cloture.ts` reconnaît une ligne de clôture de purge au
    //    SEUL nom d'outil. Une ligne d'appel ordinaire portant ce nom rendrait
    //    la vérification du journal ROUGE en permanence — fail-closed, mais
    //    c'est un déni de service sur la vérification, déclenchable par
    //    n'importe quel adaptateur. La constante est IMPORTÉE : la retaper
    //    ferait diverger les deux au premier renommage, et la garde
    //    deviendrait muette sans que rien ne le signale.
    if (complet === OUTIL_CLOTURE || outil.name === OUTIL_CLOTURE) {
      refuses.push(
        refus(
          "nom_reserve_au_socle",
          `« ${complet} » porte le nom que le socle réserve à ses lignes de clôture de purge ` +
            `(§ 31). Une ligne d'appel de ce nom rendrait la vérification du journal illisible ` +
            "en permanence. Renommer l'outil.",
        ),
      );
    }

    vus.add(complet);
  }

  if (refuses.length > 0) {
    return { admis: false, refus: refuses, outilsInspectes, annonces: annonces() };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Admis — les lignes à écrire
  // ───────────────────────────────────────────────────────────────────────────
  const adaptateur: LigneOpsAdapter = {
    id: manifeste.id,
    version: manifeste.version,
    mode: manifeste.mode,
    // Les cinq champs suivants viennent du VERROU, jamais du manifeste.
    authMode: epingle.authMode,
    secretRef: epingle.secretRef,
    endpoint: epingle.endpoint,
    manifestSha: epingle.manifestSha,
    trustTier: epingle.trustTier,
    maxDataClass: epingle.maxDataClass,
  };

  // § 12 : `ops_tool.profiles` reçoit les profils de l'ADAPTATEUR. Le socle
  // n'expose pas un outil hors des profils où son adaptateur est exposé.
  //
  // Le resserrement sur `ProfileName` est sûr ICI et nulle part ailleurs : le
  // contrôle « profil inconnu » ci-dessus a déjà confronté chaque valeur à
  // `profilsConnus`. C'est la seule assertion du fichier, et elle est adossée
  // à une mesure, pas à une confiance.
  const profils = manifeste.profiles as readonly ProfileName[];

  const outils: LigneOpsTool[] = manifeste.tools.map((outil) => {
    // ⚠️ `bytes` EST DÉRIVÉ PAR LA FONCTION DU BUDGET, PAS RECOPIÉ DU
    //    MANIFESTE. Le manifeste annonce le poids de son ENTRÉE COMPLÈTE — que
    //    le contrôle `bytes_incoherent` plus haut vérifie, et c'est son rôle.
    //    Le § 14, lui, compte CE QUI PART DANS LE CONTEXTE DU MODÈLE : la
    //    PROJECTION SERVIE. Recopier l'un dans l'autre faisait vivre deux
    //    nombres dans une seule colonne, la valeur écrite surestimant de
    //    ~38 % ce que l'écran Outils prétend afficher.
    //
    //    Une seule fonction, deux appelants : celle de `core/profiles`.
    const definition: DefinitionOutil = {
      name: nomComplet(manifeste.id, outil.name),
      version: outil.version,
      description: outil.description,
      inputSchema: outil.inputSchema,
      outputSchema: outil.outputSchema,
      profiles: profils,
      // Un outil fraîchement enregistré n'est PAS servi tant qu'un humain ne
      // l'a pas activé en console (§ 14, correction 3), et il n'est pas encore
      // déprécié. Ces deux valeurs sont des DÉFAUTS D'INSERTION ; la vérité
      // vit ensuite dans `ops_tool.enabled` et `ops_tool.retiredAt`.
      enabled: false,
      retireDeLaListe: false,
    };

    return {
      name: outil.name,
      nomComplet: definition.name,
      adapterId: manifeste.id,
      version: outil.version,
      description: outil.description,
      inputSchema: outil.inputSchema,
      outputSchema: outil.outputSchema,
      bytes: octetsDeLaDefinition(definition),
      effect: outil.effect,
      dataClass: outil.dataClass,
      // § 09 — recopié du manifeste, qui l'a déclaré sans défaut permissif.
      idempotency: outil.idempotency,
      // Réglés en console, jamais à l'admission : `null` = valeurs de départ du § 26.
      limit: null,
      warnAt: null,
      profiles: profils,
      // ⚠️ RECOPIÉ DU MANIFESTE, ET C'EST LÉGITIME — au contraire de `trustTier`
      //    (fixé côté socle) et de `bytes` (recalculé). Une déclaration qui ne
      //    peut que RESSERRER se croit sur parole : un dépôt tiers hostile n'a
      //    aucun intérêt à s'auto-restreindre, et s'il le fait il se punit
      //    lui-même. Elle a été confrontée au schéma juste au-dessus (garde G3),
      //    donc chaque nom écrit ici désigne bien une propriété d'entrée.
      governanceFields: [...outil.governanceFields],
      enabled: definition.enabled,
      retireDeLaListe: definition.retireDeLaListe,
    };
  });

  return { admis: true, adaptateur, outils, outilsInspectes, annonces: annonces() };
}
