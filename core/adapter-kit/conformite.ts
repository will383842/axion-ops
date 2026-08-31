/**
 * LE HARNAIS DE CONFORMITÉ — les neuf contrôles du § 09.
 *
 * ═══ CE QUE LE HARNAIS EST, ET OÙ IL TOURNE ═══
 *
 * Il tourne dans la **CI de l'adaptateur**. Pour tout adaptateur d'un autre
 * langage — le CRM en PHP —, il devient un harnais EXTERNE, exécuté par le
 * socle contre l'endpoint. C'est pourquoi rien ici ne lit le disque de sa
 * propre initiative : les fichiers, les fixtures et la sonde HTTP sont
 * INJECTÉS. Un harnais qui irait chercher lui-même `src/**` supposerait un
 * dépôt TypeScript, et ne pourrait jamais s'exécuter contre le CRM.
 *
 * ═══ LE NEUVIÈME CONTRÔLE EST LE PLUS IMPORTANT ═══
 *
 * « La garde ANNONCE COMBIEN DE FICHIERS D'ADAPTATEUR ELLE A LUS, avec un
 * plancher-témoin. Sans ce compte, un adaptateur rangé ailleurs rend la garde
 * muette sans un mot. »
 *
 * Le principe est appliqué à TOUS les contrôles, pas seulement au neuvième :
 * chaque `ResultatControle` porte son nombre d'éléments mesurés et le plancher
 * sous lequel ce nombre est lui-même une anomalie. Un contrôle qui n'a rien
 * regardé ne peut donc pas être vert.
 *
 * Modèle : `axionia/tests/unit/ci/surface-server-actions.spec.ts:70-77`.
 */

import { DATA_CLASSES, EFFECTS } from "../types.js";
import { octetsCanoniques, versValeurJson } from "./json.js";
import type { ValeurJson } from "./json.js";
import {
  analyserDefinition,
  empreinteDuManifeste,
  nomComplet,
  prefixeDe,
  proprietesDuSchema,
  requisDuSchema,
  texteDuManifeste,
} from "./manifest.js";
import type { Manifeste } from "./manifest.js";
import type { DefinitionAdaptateur } from "./types.js";
// Le retrait des commentaires est IMPORTÉ, jamais réécrit : ce fichier en
// portait une seconde copie, mot pour mot identique à celle d'`autorisation.ts`.
// Deux copies d'un même filtre divergent au premier motif ajouté d'un seul
// côté, et la divergence est muette — le contrôle 2 cesserait alors de voir ce
// que le contrôle 7 voit encore, ou l'inverse.
import { proportionEffacee } from "./autorisation.js";

/**
 * Au-delà de cette part de caractères significatifs effacés, le filtre de
 * commentaires n'a pas retiré des commentaires : il a mangé du code.
 *
 * 70 % est délibérément haut — un fichier de ce dépôt est très commenté, et un
 * faux rouge sur ce contrôle-ci coûterait la confiance dans tout le harnais. Ce
 * qu'on cherche à voir, c'est l'effacement CATASTROPHIQUE (un fichier réduit à
 * néant par une paire de délimiteurs mal reconnue), pas un écart de style.
 */
const PROPORTION_EFFACEE_PLAUSIBLE = 0.7;
import type { ClesDAutorisation } from "./autorisation.js";
import type { SceauProfils } from "./profils.js";
import { anomaliesCompletes } from "./verdict.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que le harnais reçoit
// ═════════════════════════════════════════════════════════════════════════════

/** Un fichier source de l'adaptateur, lu par SON dépôt et transmis ici. */
export interface FichierAdaptateur {
  readonly chemin: string;
  readonly source: string;
}

/** Un jeu MAXIMAL, chargé par le dépôt de l'adaptateur (§ 09, contrôle 4). */
export interface FixtureExecutee {
  /** Nom LOCAL de l'outil, tel qu'il figure dans la définition. */
  readonly outil: string;
  /** D'où le jeu vient — repris tel quel dans le rapport. */
  readonly chemin: string;
  /** La charge de sortie maximale, telle que l'outil la produirait. */
  readonly charge: unknown;
}

/**
 * Sonde du contrôle 8 : appelle la route `/api/mcp` de l'adaptateur SANS le
 * secret partagé et rend le statut HTTP obtenu.
 *
 * Elle est injectée par la CI de l'adaptateur. Ce chantier n'émet aucun appel
 * réseau : les tests la remplacent par une fonction qui rend un statut.
 */
export type SondeRoute = () => number | Promise<number>;

export interface EntreeHarnais<TProfile extends string> {
  readonly definition: DefinitionAdaptateur<TProfile>;
  /** L'énumération fermée de `core/profiles/`, transmise par le kit. */
  readonly profilsConnus: readonly TProfile[];
  /**
   * Le SCEAU de cette énumération — version et empreinte (ADR 0004). Il entre
   * dans le manifeste, et le registre le confronte au sceau du socle.
   *
   * ⚠️ Il est REÇU, jamais recalculé ici : `core/adapter-kit` ne contient
   *    aucune liste de profils, et c'est `core/profiles` qui décide de ce que
   *    l'empreinte couvre.
   */
  readonly sceauProfils: SceauProfils;
  /** Tous les fichiers source de l'adaptateur. */
  readonly fichiers: readonly FichierAdaptateur[];
  /** Plancher-témoin du contrôle 9. Doit valoir au moins 1. */
  readonly plancherFichiers: number;
  /**
   * Contrôle 3 — la liste NOMMÉE des symboles de couche service autorisés,
   * versionnée avec l'adaptateur. Même cliquet que `CONSOMMATEURS_ASSUMES`.
   */
  readonly symbolesAutorises: readonly string[];
  /** Les symboles réellement exportés par la couche service, à la date du run. */
  readonly symbolesExportes: readonly string[];
  /** Plancher-témoin du contrôle 3. */
  readonly plancherSymboles: number;
  /** Un jeu maximal PAR OUTIL. Contrôle 4. */
  readonly fixtures: readonly FixtureExecutee[];
  /** Contrôle 7 — les noms interdits, DÉRIVÉS de `core/types.ts`. */
  readonly clesDAutorisation: ClesDAutorisation;
  /** Contrôle 8 — `null` accepté seulement en mode `hébergé` (aucune route). */
  readonly sonde: SondeRoute | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que le harnais rend
// ═════════════════════════════════════════════════════════════════════════════

export interface ResultatControle {
  /** Numéro du § 09, ou `0` pour un contrôle supplémentaire. */
  readonly numero: number;
  readonly cle: string;
  readonly libelle: string;
  /** Combien d'éléments CE contrôle a réellement regardés. */
  readonly mesures: number;
  /** Sous ce plancher, le compte est lui-même une anomalie. */
  readonly plancher: number;
  readonly anomalies: readonly string[];
  /** Une phrase lisible : ce qui a été mesuré, et sur quoi. */
  readonly detail: string;
}

export interface RapportHarnais {
  readonly adaptateur: string;
  readonly controles: readonly ResultatControle[];
  /** Contrôle 9, remonté au premier plan : le nombre de fichiers LUS. */
  readonly fichiersLus: number;
  readonly plancherFichiers: number;
  /** Toutes les anomalies, y compris celles des comptes insuffisants. */
  readonly anomalies: readonly string[];
  readonly conforme: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Contrôle 2 — les motifs, nommés
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les motifs du contrôle 2, NOMMÉS pour que le rapport dise lequel a mordu.
 *
 * ⚠️ **Borne à écrire avec la mesure** : un motif ne prouve que l'absence de la
 * FORME ÉCRITE. `globalThis["pro"+"cess"].env` échappe aux quatre. Le contrôle
 * répond à « le fichier écrit-il un accès direct à l'environnement », pas à
 * « le fichier peut-il lire un secret ».
 */
export const MOTIFS_ACCES_SECRET: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: "process.env", motif: /\bprocess\s*\.\s*env\b/ },
  { nom: "process[…]", motif: /\bprocess\s*\[/ },
  { nom: "import de dotenv", motif: /["']dotenv(?:\/[\w-]+)?["']/ },
  { nom: "lecture d'un fichier .env", motif: /["'][^"']*\.env(?:\.[\w-]+)?["']/ },
];

// ═════════════════════════════════════════════════════════════════════════════
//  Le harnais
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Exécute les neuf contrôles du § 09, plus le contrôle supplémentaire C13.3.
 *
 * Ne lève jamais : un harnais qui s'arrête à la première anomalie oblige à
 * autant d'allers-retours qu'il y a de défauts.
 */
export async function executerHarnais<TProfile extends string>(
  entree: EntreeHarnais<TProfile>,
): Promise<RapportHarnais> {
  const { definition } = entree;
  const controles: ResultatControle[] = [];

  // Le manifeste sert à plusieurs contrôles : on le construit une fois.
  const premiere = analyserDefinition(definition, entree.profilsConnus, entree.sceauProfils);
  const manifeste: Manifeste | null = premiere.manifeste;

  // ───────────────────────────────────────────────────────────────────────────
  //  1 · `effect` et `dataClass` déclarés, SANS valeur par défaut permissive
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    for (const outil of definition.tools) {
      if (!(EFFECTS as readonly string[]).includes(outil.effect)) {
        anomalies.push(
          `« ${outil.name} » : effect « ${String(outil.effect)} » absent ou inconnu. ` +
            "Aucun défaut n'est appliqué — un effect manquant qui vaudrait « read » " +
            "ferait passer un envoi pour une lecture, et le § 20 ne le verrait nulle part.",
        );
      }
      if (!(DATA_CLASSES as readonly string[]).includes(outil.dataClass)) {
        anomalies.push(
          `« ${outil.name} » : dataClass « ${String(outil.dataClass)} » absent ou inconnu. ` +
            "Un dataClass manquant valant « none » dispenserait du marquage de session " +
            "du § 20, étape 11.",
        );
      }
    }
    controles.push({
      numero: 1,
      cle: "effect-dataclass",
      libelle: "`effect` et `dataClass` déclarés, sans valeur par défaut permissive",
      mesures: definition.tools.length,
      plancher: 1,
      anomalies,
      detail: `${String(definition.tools.length)} outil(s) inspecté(s).`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  2 · Aucun accès DIRECT à `process.env` ni à un secret
  // ───────────────────────────────────────────────────────────────────────────
  {
    // ⚠️ LES MOTIFS S'APPLIQUENT AU SOURCE BRUT. Ce contrôle NE passe PLUS par
    //    `sansCommentaires()`, et c'est délibéré : c'est la seule garde de
    //    SÉCURITÉ du § 09, et elle ne doit dépendre d'aucun filtre préalable.
    //
    //    Le filtre précédent blanchissait toute paire d'ouvrant/fermant de
    //    commentaire de bloc trouvée dans le TEXTE : deux chaînes anodines
    //    encadrant un accès direct — ou même deux motifs de globbing — le
    //    rendaient INVISIBLE, sans la moindre obfuscation. Un `process.env`
    //    cité dans un commentaire produit désormais un faux ROUGE. C'est le
    //    sens qui va bien : un faux rouge se corrige en reformulant le
    //    commentaire, un faux vert ne se voit pas.
    const anomalies: string[] = [];
    let effacementMaximal = 0;
    for (const fichier of entree.fichiers) {
      effacementMaximal = Math.max(effacementMaximal, proportionEffacee(fichier.source));
      for (const { nom, motif } of MOTIFS_ACCES_SECRET) {
        if (motif.test(fichier.source)) {
          anomalies.push(
            `${fichier.chemin} : motif « ${nom} » (${motif.source}). Un adaptateur ne lit ` +
              "jamais `process.env` directement ; le helper de son propre produit reste permis. " +
              "Si le motif n'apparaît que dans un COMMENTAIRE, reformuler le commentaire : " +
              "cette garde lit le source brut, à dessein.",
          );
        }
      }
    }

    // LA GARDE DU FILTRE LUI-MÊME. Les autres contrôles, eux, blanchissent
    // encore les commentaires. Si le filtre se remettait à manger du code, il
    // le ferait en silence — sauf ici : au-delà de cette proportion, ce n'est
    // plus un commentaire qu'il retire.
    if (effacementMaximal > PROPORTION_EFFACEE_PLAUSIBLE) {
      anomalies.push(
        `Le filtre de commentaires a effacé jusqu'à ${String(Math.round(effacementMaximal * 100))} % ` +
          `des caractères significatifs d'un fichier, au-delà des ` +
          `${String(Math.round(PROPORTION_EFFACEE_PLAUSIBLE * 100))} % plausibles. ` +
          "Ce n'est plus un commentaire qu'il retire : les contrôles qui s'appuient sur lui " +
          "mesurent moins que ce qu'ils croient.",
      );
    }

    controles.push({
      numero: 2,
      cle: "acces-secret",
      libelle: "Aucun accès direct à `process.env` ni à un secret",
      mesures: entree.fichiers.length,
      plancher: Math.max(1, entree.plancherFichiers),
      anomalies,
      detail:
        `${String(entree.fichiers.length)} fichier(s) lu(s) EN BRUT, ` +
        `${String(MOTIFS_ACCES_SECRET.length)} motif(s) appliqué(s) : ` +
        `${MOTIFS_ACCES_SECRET.map((m) => m.nom).join(", ")} ; ` +
        `effacement maximal du filtre de commentaires ${String(Math.round(effacementMaximal * 100))} %.`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  3 · Le cliquet des symboles de couche service
  // ───────────────────────────────────────────────────────────────────────────
  {
    const exportes = new Set(entree.symbolesExportes);
    const orphelins = entree.symbolesAutorises.filter((symbole) => !exportes.has(symbole));
    const anomalies = orphelins.map(
      (symbole) =>
        `« ${symbole} » est autorisé mais ne correspond plus à aucun symbole exporté par la ` +
        "couche service. Une entrée périmée dans une liste d'exceptions ne protège plus rien : " +
        "elle donne l'apparence d'un périmètre maîtrisé.",
    );
    if (entree.plancherSymboles < 1) {
      // Même cliquet que le contrôle 9 quelques lignes plus bas, qui refuse déjà
      // un plancher-témoin posé à zéro. Sans cette borne, un appelant qui passe
      // `plancherSymboles: 0` avec une liste vide rendait ce contrôle
      // TOUJOURS SATISFAIT : zéro symbole confronté à zéro export, aucune
      // anomalie, et `0 >= 0`. Le cliquet ne cliquetait plus, en silence.
      anomalies.push(
        `plancher-témoin à ${String(entree.plancherSymboles)} — un plancher qui ne peut pas ` +
          "être franchi par le bas ne garde rien : le cliquet resterait vert sur une liste " +
          "de symboles autorisés VIDE. Posez-le sur la mesure du jour.",
      );
    }
    controles.push({
      numero: 3,
      cle: "cliquet-symboles",
      // ⚠️ LE LIBELLÉ DIT CE QUI EST MESURÉ, PAS CE QU'ON AURAIT VOULU MESURER.
      //    Il annonçait « Aucun appel qui contourne la couche service » ; ce
      //    contrôle ne regarde AUCUN appel. Sa seule mesure est la FRAÎCHEUR de
      //    la liste d'exceptions — `symbolesAutorises` moins `symbolesExportes`.
      //    Un libellé qui promet plus que sa mesure est exactement ce qui fait
      //    écrire en revue « le risque est couvert par la garde ».
      //
      // 🔴 LA MESURE MANQUANTE est notée dans `docs/ETAT.md` : la matière est
      //    là (`entree.fichiers`), il reste à confronter les symboles employés
      //    à ceux autorisés, en annonçant fichiers ET appels confrontés.
      libelle: "Le cliquet des symboles de couche service autorisés est à jour",
      mesures: entree.symbolesAutorises.length,
      plancher: entree.plancherSymboles,
      anomalies,
      detail:
        `${String(entree.symbolesAutorises.length)} symbole(s) autorisé(s) confronté(s) à ` +
        `${String(exportes.size)} symbole(s) exporté(s).`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  4 · Aucune sortie ne dépasse son `maxBytes` sur son `fixtureMax`
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    const parNom = new Map(definition.tools.map((outil) => [outil.name, outil]));
    const outilsCouverts = new Set<string>();

    for (const fixture of entree.fixtures) {
      const outil = parNom.get(fixture.outil);
      if (outil === undefined) {
        anomalies.push(
          `fixture ${fixture.chemin} : l'outil « ${fixture.outil} » n'existe pas dans la ` +
            "définition. Une fixture orpheline compte dans le total sans rien mesurer.",
        );
        continue;
      }
      outilsCouverts.add(outil.name);
      let octets: number;
      try {
        octets = octetsCanoniques(versValeurJson(fixture.charge, fixture.chemin));
      } catch (erreur) {
        anomalies.push(
          `fixture ${fixture.chemin} : non mesurable — ` +
            `${erreur instanceof Error ? erreur.message : String(erreur)}`,
        );
        continue;
      }
      if (octets > outil.maxBytes) {
        anomalies.push(
          `« ${outil.name} » : le jeu maximal ${fixture.chemin} pèse ${String(octets)} octets ` +
            `pour un maxBytes de ${String(outil.maxBytes)} ` +
            `(${String(Math.round((octets / outil.maxBytes) * 100))} %). ` +
            "La cascade de compaction du § 13.3 devrait donc s'appliquer à CHAQUE appel " +
            "nominal, ce qui n'est pas un plafond mais un régime permanent.",
        );
      }
    }

    const sansFixture = definition.tools
      .map((outil) => outil.name)
      .filter((nom) => !outilsCouverts.has(nom));
    if (sansFixture.length > 0) {
      anomalies.push(
        `outil(s) sans jeu maximal exécuté — ${sansFixture.join(", ")}. Le contrôle 4 les ` +
          "sauterait en silence, et son compte resterait vert.",
      );
    }

    controles.push({
      numero: 4,
      cle: "maxbytes-fixtures",
      libelle: "Aucune sortie ne dépasse son `maxBytes` sur son `fixtureMax`",
      mesures: entree.fixtures.length,
      // Plancher DÉRIVÉ : un jeu maximal par outil, pas un nombre écrit.
      plancher: definition.tools.length,
      anomalies,
      detail:
        `${String(entree.fixtures.length)} fixture(s) exécutée(s) pour ` +
        `${String(definition.tools.length)} outil(s).`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  5 · Les préfixes sont dérivés de l'id
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    const prefixe = prefixeDe(definition.id);
    const vus = new Set<string>();
    for (const outil of definition.tools) {
      if (outil.name.startsWith(`${prefixe}.`)) {
        anomalies.push(
          `« ${outil.name} » : le préfixe « ${prefixe}. » est écrit à la main alors qu'il ` +
            "est dérivé de l'id de l'adaptateur.",
        );
      }
      const complet = nomComplet(definition.id, outil.name);
      if (vus.has(complet)) {
        anomalies.push(`« ${complet} » : deux outils portent le même nom complet.`);
      }
      vus.add(complet);
    }
    controles.push({
      numero: 5,
      cle: "prefixes-derives",
      libelle: "Les préfixes sont dérivés de l'id",
      mesures: definition.tools.length,
      plancher: 1,
      anomalies,
      detail: `${String(vus.size)} nom(s) complet(s) dérivé(s) du préfixe « ${prefixe} ».`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  6 · Le manifeste est produit et son SHA est STABLE
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    let mesures = 0;
    if (manifeste === null) {
      anomalies.push(
        "le manifeste n'est pas constructible : " + premiere.verdict.anomalies.join(" · "),
      );
    } else {
      // Deuxième production, par un chemin indépendant du premier objet. Un SHA
      // qui ne serait stable que parce qu'on relit le MÊME objet ne prouverait
      // rien : ce qui est en jeu, c'est l'ordre des clés à la sérialisation.
      const seconde = analyserDefinition(definition, entree.profilsConnus, entree.sceauProfils);
      mesures = 2;
      if (seconde.manifeste === null) {
        anomalies.push("la seconde production échoue là où la première réussit.");
      } else if (texteDuManifeste(manifeste) !== texteDuManifeste(seconde.manifeste)) {
        anomalies.push(
          "deux productions du même manifeste donnent deux textes différents. " +
            "Le SHA du verrou refuserait alors l'admission sans qu'AUCUN écart réel existe, " +
            "et une garde qui rougit au hasard finit désarmée.",
        );
      } else if (empreinteDuManifeste(manifeste) !== empreinteDuManifeste(seconde.manifeste)) {
        anomalies.push("deux productions donnent le même texte et deux empreintes.");
      }
    }
    controles.push({
      numero: 6,
      cle: "manifeste-sha-stable",
      libelle: "Le manifeste est produit et son SHA est stable",
      mesures,
      plancher: 2,
      anomalies,
      detail:
        manifeste === null
          ? "manifeste non constructible."
          : `2 productions comparées · empreinte ${empreinteDuManifeste(manifeste)}.`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  7 · Aucun champ d'autorisation ne provient du schéma d'entrée
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    let proprietesInspectees = 0;
    const interdits = new Set(entree.clesDAutorisation.toutes);

    for (const outil of manifeste?.tools ?? []) {
      const proprietes = proprietesDuSchema(outil.inputSchema);
      proprietesInspectees += proprietes.length;
      for (const propriete of proprietes) {
        if (interdits.has(propriete)) {
          anomalies.push(
            `« ${outil.name} » : le schéma d'entrée porte « ${propriete} », qui est une ` +
              `propriété de \`ctx\` (dérivée de ${entree.clesDAutorisation.origine}). ` +
              "Une décision de droit atteint la couche service par UN SEUL chemin, `ctx`. " +
              "Renommez le champ d'entrée.",
          );
        }
      }
    }
    controles.push({
      numero: 7,
      cle: "autorisation-hors-input",
      libelle: "Aucun champ d'autorisation ne provient du schéma d'entrée",
      mesures: manifeste === null ? 0 : manifeste.tools.length,
      plancher: 1,
      anomalies,
      // ⚠️ TROIS COMPTES, PAS DEUX — ADR 0020. Le troisième ensemble porte les
      //    noms que `ToolContext` a PORTÉS et ne porte plus. Sans lui annoncé à
      //    part, un retrait qui rétrécit la garde ne se verrait dans aucun
      //    chiffre : un total seul ne distingue pas « un nom ajouté ici » de
      //    « un nom perdu là ».
      detail:
        `${String(proprietesInspectees)} propriété(s) d'entrée confrontée(s) à ` +
        `${String(interdits.size)} nom(s) interdit(s) dérivé(s) — ` +
        `${String(entree.clesDAutorisation.toolContext.length)} de \`ToolContext\`, ` +
        `${String(entree.clesDAutorisation.habilitations.length)} d'\`Habilitations\`, ` +
        `${String(entree.clesDAutorisation.reservesHorsContexte.length)} réservé(s) hors ` +
        `contexte : ${entree.clesDAutorisation.toutes.join(", ")}.`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  8 · La route, appelée SANS le secret partagé, rend 401 ou 503
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    let mesures = 0;
    let detail: string;
    const routeAttendue = definition.mode === "fédéré";

    if (!routeAttendue) {
      // Un adaptateur hébergé vit DANS le processus du socle : il n'a pas de
      // route. Le contrôle est sans objet, et son plancher vaut 0 — la seule
      // façon honnête de dire « rien à mesurer », plutôt qu'un vert emprunté.
      detail = "mode « hébergé » : aucune route à sonder, contrôle sans objet.";
    } else if (entree.sonde === null) {
      anomalies.push(
        "aucune sonde fournie pour un adaptateur FÉDÉRÉ. Le contrôle ne peut pas conclure : " +
          "une sonde absente n'est pas un succès. Aucune garde globale ne couvre la route " +
          "`/api/mcp` — la garde s'écrit DANS le handler, et se vérifie ici.",
      );
      detail = "sonde absente.";
    } else {
      const statut = await entree.sonde();
      mesures = 1;
      detail = `statut obtenu sans le secret partagé : ${String(statut)}.`;
      if (statut !== 401 && statut !== 503) {
        anomalies.push(
          `la route rend ${String(statut)} sans le secret partagé — attendu 401 ` +
            "(secret refusé) ou 503 (secret absent de la configuration : la route ne sert rien).",
        );
      }
    }
    controles.push({
      numero: 8,
      cle: "route-sans-secret",
      libelle: "La route de l'adaptateur, appelée sans le secret partagé, rend 401 ou 503",
      mesures,
      plancher: routeAttendue ? 1 : 0,
      anomalies,
      detail,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  9 · La garde annonce combien de fichiers d'adaptateur elle a lus
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    if (entree.plancherFichiers < 1) {
      // Un plancher à zéro n'est pas un plancher : il rend le contrôle 9
      // toujours satisfait, ce qui est exactement l'état que le § 09 décrit
      // comme « muette sans un mot ».
      anomalies.push(
        `plancher-témoin à ${String(entree.plancherFichiers)} — un plancher qui ne peut pas ` +
          "être franchi par le bas ne garde rien. Posez-le sur la mesure du jour.",
      );
    }
    const cheminsEnDouble = entree.fichiers
      .map((fichier) => fichier.chemin)
      .filter((chemin, index, tous) => tous.indexOf(chemin) !== index);
    if (cheminsEnDouble.length > 0) {
      anomalies.push(
        `fichier(s) comptés deux fois — ${[...new Set(cheminsEnDouble)].join(", ")}. ` +
          "Un doublon gonfle le compte et fait passer le plancher sans lire davantage.",
      );
    }
    controles.push({
      numero: 9,
      cle: "compte-fichiers",
      libelle: "La garde annonce combien de fichiers d'adaptateur elle a lus",
      mesures: entree.fichiers.length,
      plancher: entree.plancherFichiers,
      anomalies,
      detail:
        `${String(entree.fichiers.length)} fichier(s) lu(s) pour un plancher-témoin de ` +
        `${String(entree.plancherFichiers)}.`,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  C13.3 · Tout champ de rang 2 est OPTIONNEL au schéma de sortie
  // ───────────────────────────────────────────────────────────────────────────
  {
    const anomalies: string[] = [];
    let champsInspectes = 0;
    for (const outil of manifeste?.tools ?? []) {
      const requis = requisDuSchema(outil.outputSchema);
      champsInspectes += outil.compaction.tier2.length;
      for (const champ of outil.compaction.tier2) {
        if (requis.includes(champ)) {
          anomalies.push(
            `« ${outil.name} » : « ${champ} » est de rang 2 mais OBLIGATOIRE au schéma de ` +
              "sortie. Le deuxième palier de la cascade le retire, et la charge compactée " +
              "ne valide plus le schéma que l'outil publie.",
          );
        }
      }
    }
    controles.push({
      numero: 0,
      cle: "tier2-optionnel",
      libelle: "§ 13.3 — tout champ de rang 2 est optionnel au schéma de sortie",
      mesures: manifeste === null ? 0 : manifeste.tools.length,
      plancher: 1,
      anomalies,
      detail: `${String(champsInspectes)} champ(s) de rang 2 confronté(s) aux champs requis.`,
    });
  }

  const anomalies = controles.flatMap((controle) =>
    anomaliesCompletes(
      { mesures: controle.mesures, plancher: controle.plancher, anomalies: controle.anomalies },
      `contrôle ${String(controle.numero)} (${controle.cle})`,
    ),
  );

  return {
    adaptateur: definition.id,
    controles,
    fichiersLus: entree.fichiers.length,
    plancherFichiers: entree.plancherFichiers,
    anomalies,
    conforme: anomalies.length === 0,
  };
}

/** Un rapport lisible en une page, pour la sortie de CI. */
export function formaterRapport(rapport: RapportHarnais): string {
  const lignes: string[] = [
    `Harnais de conformité — adaptateur « ${rapport.adaptateur} »`,
    `Fichiers d'adaptateur LUS : ${String(rapport.fichiersLus)} ` +
      `(plancher-témoin ${String(rapport.plancherFichiers)})`,
    "",
  ];
  for (const controle of rapport.controles) {
    const etiquette = controle.numero === 0 ? "C13.3" : `n°${String(controle.numero)}`;
    const vert = controle.anomalies.length === 0 && controle.mesures >= controle.plancher;
    lignes.push(
      `${vert ? "vert " : "ROUGE"} ${etiquette} ${controle.libelle} — ` +
        `${String(controle.mesures)} mesuré(s) / plancher ${String(controle.plancher)} · ` +
        controle.detail,
    );
  }
  if (rapport.anomalies.length > 0) {
    lignes.push("", `${String(rapport.anomalies.length)} anomalie(s) :`);
    for (const anomalie of rapport.anomalies) lignes.push(` · ${anomalie}`);
  }
  return lignes.join("\n");
}

/** Ré-export : le harnais mesure des octets de JSON canonique, comme le budget. */
export type { ValeurJson };
