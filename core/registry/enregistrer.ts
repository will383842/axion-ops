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
import { nomComplet, prefixeDe } from "../adapter-kit/manifest.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import { OUTIL_CLOTURE } from "../audit/vocabulaire.js";
import { octetsDeLaDefinition, type DefinitionOutil, type ProfileName } from "../profiles/index.js";
import { clesReserveesAuSocle, empreinteDuManifesteRecu, entreePourId } from "./lock.js";
import { clesDePremierNiveau, lireManifesteRecu } from "./manifeste-recu.js";
import type {
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
  const refuses: Refus[] = [];

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
    return { admis: false, refus: refuses, outilsInspectes: 0 };
  }

  const outilsInspectes = manifeste.tools.length;

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
    return { admis: false, refus: refuses, outilsInspectes };
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
    return { admis: false, refus: refuses, outilsInspectes };
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
      profiles: profils,
      enabled: definition.enabled,
      retireDeLaListe: definition.retireDeLaListe,
    };
  });

  return { admis: true, adaptateur, outils, outilsInspectes };
}
