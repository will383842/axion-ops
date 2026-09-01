/**
 * `core/coutures/verifier.ts` — **LE CORPS DES DEUX GARDES DE L'ADR 0019.**
 *
 * ═══ POURQUOI CE FICHIER EXISTE, ALORS QUE `contrat.ts` DIT « LE CORPS VA DANS
 *     `registre.spec.ts` » ═══
 *
 * L'ADR 0019 exige TROIS choses de la garde : qu'elle soit une **fonction PURE
 * d'un ensemble de fichiers injecté**, qu'elle **annonce des nombres**, et
 * qu'elle soit **éprouvée par des témoins fabriqués**. Les deux dernières
 * vivent dans deux fichiers différents — `registre.spec.ts` confronte le dépôt
 * RÉEL, `couture.temoin.spec.ts` confronte des jeux de fichiers FABRIQUÉS.
 *
 * Un fichier `.spec.ts` qui en importe un autre fait **exécuter deux fois** les
 * `describe` de l'importé, sous vitest : les comptes de la suite deviennent
 * faux, et un test peut alors rougir dans un fichier qui ne le déclare pas. Le
 * corps est donc ici, dans un module ordinaire que les DEUX gardes importent.
 * C'est un écart de LOCALISATION par rapport à la lettre de `contrat.ts`, pas
 * de nature : les formes rendues sont exactement celles qu'il pose, et ce
 * module n'implémente rien d'autre.
 *
 * ⚠️ **CE MODULE NE LIT NI LE DISQUE NI LE REGISTRE.** Il ne connaît ni
 *    `REGISTRE_DES_COUTURES`, ni `docs/adr/`, ni `tsconfig.build.json` : tout
 *    lui est passé en argument. C'est ce qui rend le témoin possible — lui
 *    remettre un jeu de fichiers dont on a RETIRÉ l'unique appelant d'un
 *    symbole, et exiger une anomalie — et c'est aussi ce qui l'empêche de
 *    devenir un lecteur de production du registre, ce que l'ADR 0019 interdit.
 *
 * ⚠️ **IL Y A DEUX DÉRIVATIONS DE CE MÊME FAIT DANS LE DÉPÔT, ET C'EST VOULU.**
 *    `core/epreuve/lot1d-le-registre-sans-sa-garde.temoin.spec.ts` porte une
 *    reconstruction INDÉPENDANTE, écrite par l'adversaire à un moment où cette
 *    garde-ci n'existait pas. Elle n'a pas été retirée : les deux confrontent le
 *    MÊME registre au MÊME dépôt et exigent toutes deux zéro désaccord, si bien
 *    qu'une divergence entre elles fait rougir l'une des deux. Deux dérivations
 *    d'un même fait finissent d'ordinaire par se contredire ; ici, se
 *    contredire EST le signal, et aucune des deux n'est la source de l'autre.
 */

import type {
  CritereDeProduction,
  FichierSoumis,
  RapportDeCouvertureDesAdr,
  RapportDesAssertions,
  RapportDesCoutures,
  VerdictDUneAssertion,
  VerdictDUneCouture,
} from "./contrat.js";
import type { EntreeDeCouture, GenreDeSymbole } from "./registre.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES TROIS NETTOYAGES — ce qu'un appelant N'EST PAS
// ═════════════════════════════════════════════════════════════════════════════

/** Échappe un nom pour l'insérer dans une expression régulière. */
function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, (caractere) => `\\${caractere}`);
}

/**
 * Retire les COMMENTAIRES.
 *
 * ⚠️ CE N'EST PAS UNE PRÉCAUTION, C'EST LA MESURE QUI A FAIT NAÎTRE CE
 *    REGISTRE. Au lot 1c, `cumulerChampsDeGouvernance()` était nommée dans deux
 *    blocs JSDoc de modules de production, parenthèses comprises. Un `grep`
 *    trouvait le nom, la fonction n'était appelée par personne, et la couture
 *    passait pour faite.
 */
export function sansProse(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

/**
 * Retire les clauses `import … from` et `export … from`.
 *
 * ⚠️ UN RÉ-EXPORT N'EST PAS UN APPELANT. `core/audit/index.ts` ré-exporte
 *    `verifierChaine` ; personne ne l'appelle pour autant, et la décision de
 *    l'ADR 0002 n'en est pas plus branchée.
 */
export function sansLiaisons(source: string): string {
  return source
    .replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["']\s*;?/gm, " ")
    .replace(/^\s*export\s[\s\S]*?from\s*["'][^"']+["']\s*;?/gm, " ")
    .replace(/^\s*import\s+["'][^"']+["']\s*;?/gm, " ");
}

/**
 * UNE FORME PAR GENRE — et non une expression par entrée, sans quoi la garde
 * porterait la liste que l'ADR 0019 lui interdit de porter.
 *
 * ⚠️ **LA FORME `fonction` ADMET UN ARGUMENT DE TYPE.** L'orchestrateur écrit
 *    `avecJournal<ChargeServie>(…)` : un motif `nom\s*\(` déclarerait non cousu
 *    le module le plus central du socle, et le remède qu'on aurait cherché à
 *    cette fausse alerte aurait été de désactiver la garde.
 *
 * ⚠️ **`\b` EST ASCII EN JAVASCRIPT.** Tous les symboles du registre sont en
 *    ASCII aujourd'hui ; le jour où l'un porterait un accent, la forme cesserait
 *    de mordre EN SILENCE. {@link symbolesHorsAscii} compte ce cas, pour que la
 *    borne soit surveillée et non seulement écrite.
 */
export function formeDuGenre(genre: GenreDeSymbole, symbole: string): RegExp {
  const nom = echapper(symbole);
  switch (genre) {
    case "fonction":
      return new RegExp(`\\b${nom}\\s*(?:<[^;()]*?>)?\\s*\\(`);
    case "membre":
      return new RegExp(`\\.\\s*${nom}\\b`);
    case "constante":
    case "type":
      return new RegExp(`\\b${nom}\\b`);
  }
}

/**
 * Les symboles du registre que `\b` ne saurait pas borner — la borne de
 * {@link formeDuGenre}, RENDUE MESURABLE au lieu d'être seulement écrite.
 */
export function symbolesHorsAscii(registre: readonly EntreeDeCouture[]): readonly string[] {
  return registre
    .filter(
      (entree): entree is Extract<EntreeDeCouture, { symbole: string }> =>
        entree.etat === "cousue" || entree.etat === "à-coudre",
    )
    .map((entree) => entree.symbole)
    .filter((symbole) => !/^[A-Za-z0-9_$]+$/.test(symbole));
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉFINITION — le symbole existe-t-il seulement ?
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le symbole est-il DÉFINI dans le module que le registre lui attribue ?
 *
 * ⚠️ **C'EST LE TROU QUE L'ÉTAT `à-coudre` LAISSE OUVERT, ET IL EST RÉEL.** Une
 *    entrée `à-coudre` n'exige que « zéro appelant » — condition qu'un symbole
 *    JAMAIS ÉCRIT remplit sans effort, et pour toujours. Sans ce compte, le
 *    registre ne saurait pas distinguer « écrit mais non branché » de « jamais
 *    écrit », alors que c'est précisément la distinction qu'il existe pour
 *    porter. La garde ANNONCE donc les non-définis et tient un cliquet nommé sur
 *    eux ; elle n'en fait une ANOMALIE que pour un `cousue`, où prétendre qu'un
 *    symbole inexistant a des appelants serait une contradiction dans les termes.
 */
function estDefiniDans(source: string, symbole: string): boolean {
  const nom = echapper(symbole);
  return [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${nom}\\b`),
    new RegExp(`export\\s+(?:abstract\\s+)?(?:const|let|class|interface|type|enum)\\s+${nom}\\b`),
    // Un MEMBRE d'interface : `readonly relireDepuisLeSocle: (…) => …`.
    new RegExp(`^\\s*(?:readonly\\s+)?${nom}\\s*[(:<]`, "m"),
  ].some((forme) => forme.test(source));
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LE REGISTRE CONFRONTÉ AU GRAPHE D'APPELS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA GARDE, fonction PURE de ce qu'on lui donne.
 *
 * Elle rougit **dans les deux sens**, et le second est celui qu'on oublie :
 *
 *  · une entrée `cousue` qui perd son dernier appelant — la décision est
 *    débranchée, et la prose de l'ADR devient fausse ;
 *  · une entrée `à-coudre` qui en gagne un — un constructeur a cousu sans le
 *    dire, et le registre annonce une dette là où le travail est fait. C'est
 *    arrivé sur l'ADR 0018 pendant le lot 1d, dans l'arbre même qui écrivait
 *    l'ADR 0019.
 *
 * Trois autres reproches, plus discrets, ferment les échappatoires du registre :
 * un `cousue` dont le symbole n'existe pas, un `mesureeAilleurs` qui pointe un
 * fichier ABSENT (une délégation vers le vide est pire qu'une absence de
 * délégation), et un `à-nommer` dont le dossier attendu VIENT D'ATTERRIR — cet
 * état est écrit pour s'auto-périmer, encore faut-il que quelque chose le périme.
 */
export function verifierLesCoutures(
  fichiers: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
  critere: CritereDeProduction,
): RapportDesCoutures {
  const production = fichiers.filter((fichier) => critere.estLivre(fichier.chemin));
  const cheminsSoumis = new Set(fichiers.map((fichier) => fichier.chemin));

  /**
   * ⚠️ **LA PROSE EST RETIRÉE UNE FOIS PAR FICHIER, PAS UNE FOIS PAR COUPLE
   *    (ENTRÉE × FICHIER) — ADR 0040, ET C'EST LE REMÈDE QU'IL NOMME.**
   *
   * `sansProse` était appelé au CŒUR de la double boucle : 89 entrées ×
   * 134 modules de production = près de 12 000 passages de deux expressions
   * régulières globales sur des sources entières, pour un résultat qui ne
   * dépend QUE du fichier. Mesuré : la garde qui l'emploie tenait 4 641 ms sur
   * une machine calme et **15 155 ms** sur une machine chargée, au-delà du
   * seuil d'alerte de 15 000 ms — la suite complète cessait alors d'être
   * reproductible, verte cinq fois puis rouge, sur un arbre inchangé.
   *
   * ⚠️ **CE N'EST PAS UN ASSOUPLISSEMENT.** `sansProse` est PURE et ne dépend
   *    que de `fichier.source` : le corpus confronté est exactement le même,
   *    entrée par entrée. Ce qui change est le nombre de fois qu'on le calcule.
   */
  const corpsSansProse = new Map<string, string>(
    production.map((fichier) => [fichier.chemin, sansProse(fichier.source)]),
  );
  /** Idem pour `sansLiaisons`, pure elle aussi et appelée dans la même boucle. */
  const corpsSansLiaisons = new Map<string, string>(
    production.map((fichier) => [
      fichier.chemin,
      sansLiaisons(corpsSansProse.get(fichier.chemin) ?? ""),
    ]),
  );

  const verdicts: VerdictDUneCouture[] = [];
  const anomalies: string[] = [];
  const parEtat: Record<string, number> = {};
  const parGenre: Record<string, number> = {};
  let mesuresDeleguees = 0;

  for (const entree of registre) {
    parEtat[entree.etat] = (parEtat[entree.etat] ?? 0) + 1;

    // ── Un motif écrit est obligatoire, quel que soit l'état ──────────────────
    // C'est ce qui distingue une décision d'un constat, et c'est ce qui empêche
    // `hors-code` de devenir la voiture-balai du registre.
    if (entree.motif.trim().length === 0) {
      anomalies.push(`ADR ${entree.adr} : une entrée sans MOTIF écrit (état « ${entree.etat} »)`);
    }

    // ── `à-nommer` : le dossier attendu doit être ABSENT ──────────────────────
    if (entree.etat === "à-nommer") {
      const atterri = [...cheminsSoumis].some((chemin) => chemin.startsWith(entree.dossierAttendu));
      if (atterri) {
        anomalies.push(
          `ADR ${entree.adr} : l'état « à-nommer » attend l'ABSENCE de ${entree.dossierAttendu}, ` +
            "et le dossier a atterri — l'entrée doit nommer son symbole",
        );
      }
      continue;
    }
    if (entree.etat === "hors-code") continue;

    // ── `cousue` / `à-coudre` : la confrontation au graphe d'appels ───────────
    parGenre[entree.genre] = (parGenre[entree.genre] ?? 0) + 1;

    if (entree.mesureeAilleurs !== null) {
      mesuresDeleguees += 1;
      if (!cheminsSoumis.has(entree.mesureeAilleurs)) {
        anomalies.push(
          `ADR ${entree.adr} · ${entree.symbole} : la mesure est déléguée à ` +
            `${entree.mesureeAilleurs}, qui N'EXISTE PAS — une délégation vers le vide`,
        );
      }
    }

    const forme = formeDuGenre(entree.genre, entree.symbole);
    const nomSeul = new RegExp(`\\b${echapper(entree.symbole)}\\b`);
    const appelants: string[] = [];
    const citationsEnProse: string[] = [];

    for (const fichier of production) {
      // Le DÉFINISSEUR ne se compte jamais lui-même : sans cette exclusion, un
      // module qui porte la fonction et l'appelle en récursion annoncerait
      // « 1 appelant » sur une fonction morte.
      if (fichier.chemin === entree.module) continue;

      const nu = corpsSansProse.get(fichier.chemin) ?? "";
      if (entree.genre === "type") {
        // Un type ne s'appelle pas : son IMPORT EST la couture. C'est tout ce
        // qu'un type peut faire — contraindre une signature ailleurs.
        if (new RegExp(`import[^;]*\\b${echapper(entree.symbole)}\\b[^;]*from`).test(nu)) {
          appelants.push(fichier.chemin);
        } else if (nomSeul.test(fichier.source)) {
          citationsEnProse.push(fichier.chemin);
        }
        continue;
      }

      const corps = corpsSansLiaisons.get(fichier.chemin) ?? "";
      // ⚠️ **UNE CONSTANTE LUE EST UNE CONSTANTE IMPORTÉE — SANS EXCEPTION.**
      //    Ce dépôt est en modules ES : il n'a aucune portée globale, donc un
      //    module qui LIT une constante d'un autre l'importe nécessairement.
      //    Exiger l'import n'ajoute donc aucune condition à la réalité ; il
      //    retire un mode de faux positif dont on a mesuré qu'il rendait ce genre
      //    inutilisable — le NOM SEUL suffisait, y compris **à l'intérieur d'une
      //    chaîne de caractères**. Deux fichiers de ce dépôt nomment des symboles
      //    dans des chaînes par construction : le registre, qui porte le champ
      //    `symbole:` de chaque entrée, et cette garde elle-même. Sans cette
      //    ligne, aucune entrée `à-coudre` de genre `constante` ne peut exister,
      //    et une entrée `cousue` de ce genre est verte sans qu'aucun module ne
      //    la lise.
      //
      //    ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : un `import * as m` suivi de
      //       `m.CONSTANTE` échappe à ce motif. Aucun module de production n'en
      //       écrit aujourd'hui, et c'est la citation en prose qui le dirait —
      //       elle compte ce cas au lieu de le perdre.
      const importee =
        entree.genre !== "constante" ||
        new RegExp(`import[^;]*\\b${echapper(entree.symbole)}\\b[^;]*from`).test(nu);
      if (importee && forme.test(corps)) appelants.push(fichier.chemin);
      else if (nomSeul.test(fichier.source)) {
        citationsEnProse.push(fichier.chemin);
      }
    }

    const definisseur = fichiers.find((fichier) => fichier.chemin === entree.module);
    const defini = definisseur !== undefined && estDefiniDans(definisseur.source, entree.symbole);

    const reproches: string[] = [];
    if (entree.etat === "cousue" && appelants.length === 0) {
      reproches.push(
        `${entree.symbole} (ADR ${entree.adr}) est déclaré COUSU et n'a AUCUN appelant de ` +
          "production — la décision est débranchée, ou le registre ment",
      );
    }
    if (entree.etat === "cousue" && !defini) {
      reproches.push(
        `${entree.symbole} (ADR ${entree.adr}) est déclaré COUSU et n'est DÉFINI nulle part ` +
          `dans ${entree.module}`,
      );
    }
    if (entree.etat === "à-coudre" && appelants.length > 0) {
      reproches.push(
        `${entree.symbole} (ADR ${entree.adr}) est déclaré À-COUDRE et compte ` +
          `${String(appelants.length)} appelant(s) : ${appelants.join(", ")} — ` +
          "la couture a été faite sans que le registre le dise",
      );
    }

    verdicts.push({
      entree,
      appelants,
      citationsEnProse,
      defini,
      anomalies: reproches,
    });
    anomalies.push(...reproches);
  }

  return {
    fichiersSoumis: fichiers.length,
    modulesDeProduction: production.length,
    symbolesConfrontes: verdicts.length,
    parEtat,
    parGenre: parGenre as Readonly<Record<GenreDeSymbole, number>>,
    mesuresDeleguees,
    verdicts,
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LA COUVERTURE DES ADR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le statut lu dans l'en-tête d'un ADR, ou `null` quand le format a changé.
 *
 * ⚠️ LE COMPTE DES STATUTS LUS EST LE PLANCHER DE CETTE GARDE. Si l'en-tête des
 *    ADR changeait de forme, cette fonction rendrait `null` partout, la garde
 *    n'aurait plus rien à confronter — et elle resterait VERTE. C'est
 *    `statutsLus` qui l'en empêche, à condition que l'appelant le confronte au
 *    nombre d'ADR trouvés.
 */
export function statutDeLAdr(source: string): string | null {
  const trouve = /^-\s+\*\*Statut\*\*\s*:\s*([^\n—]+)/m.exec(source);
  return trouve?.[1]?.trim().toLowerCase() ?? null;
}

/** Le numéro sur quatre chiffres porté par un nom de fichier d'ADR, ou `null`. */
export function numeroDeLAdr(chemin: string): string | null {
  const base = chemin.slice(chemin.lastIndexOf("/") + 1);
  return /^\d{4}-.*\.md$/.test(base) ? base.slice(0, 4) : null;
}

/**
 * LA GARDE DE COUVERTURE — celle qui rend un ADR neuf IMPOSSIBLE à oublier.
 *
 * Elle ne lit pas le registre pour savoir quels ADR existent : elle lit le
 * DOSSIER. Un ADR qui atterrit sans entrée fait donc monter `adrTrouves` sans
 * faire monter `adrCouverts`, et l'écart est l'anomalie. L'anomalie miroir — une
 * entrée qui désigne un ADR inexistant — est comptée dans le même geste.
 */
export function verifierLaCouvertureDesAdr(
  fichiersAdr: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
): RapportDeCouvertureDesAdr {
  const surDisque = new Map<string, string>();
  for (const fichier of fichiersAdr) {
    const numero = numeroDeLAdr(fichier.chemin);
    if (numero !== null) surDisque.set(numero, fichier.source);
  }
  const auRegistre = new Set(registre.map((entree) => entree.adr));

  let statutsLus = 0;
  let adrAcceptes = 0;
  for (const source of surDisque.values()) {
    const statut = statutDeLAdr(source);
    if (statut === null) continue;
    statutsLus += 1;
    if (statut.startsWith("accept")) adrAcceptes += 1;
  }

  const adrSansEntree = [...surDisque.keys()].filter((numero) => !auRegistre.has(numero)).sort();
  const entreesFantomes = [...auRegistre].filter((numero) => !surDisque.has(numero)).sort();

  const anomalies: string[] = [];
  for (const numero of adrSansEntree) {
    anomalies.push(
      `ADR ${numero} existe dans docs/adr/ et n'est inscrit à AUCUNE entrée du registre — ` +
        "personne ne dit quel symbole porte sa décision",
    );
  }
  for (const numero of entreesFantomes) {
    anomalies.push(`le registre inscrit un ADR ${numero} qui n'existe pas dans docs/adr/`);
  }
  if (statutsLus !== surDisque.size) {
    anomalies.push(
      `${String(surDisque.size - statutsLus)} ADR dont l'en-tête ne livre plus de statut ` +
        "lisible — la lecture du statut est cassée, et cette garde deviendrait muette",
    );
  }

  return {
    adrTrouves: surDisque.size,
    adrCouverts: [...auRegistre].filter((numero) => surDisque.has(numero)).length,
    statutsLus,
    adrAcceptes,
    adrSansEntree,
    entreesFantomes,
    anomalies,
  };
}

/**
 * LES TROUS DE NUMÉROTATION — ce que la couverture ne peut PAS voir.
 *
 * ⚠️ **DÉRIVER L'ENSEMBLE DES ADR DU CONTENU DU DOSSIER EST LE BON CHOIX, ET IL
 *    A UNE BORNE.** Un ADR écrit puis perdu ne laisse aucune trace : son numéro
 *    manque, et rien ne distingue « jamais attribué » de « disparu ». Cette
 *    fonction rend les numéros manquants entre le plus petit et le plus grand,
 *    pour que le trou soit COMPTÉ au lieu d'être invisible. Elle ne dit pas
 *    qu'un trou est une faute : `docs/adr/README.md` dit ce qu'il en est.
 */
export function trousDeNumerotation(fichiersAdr: readonly FichierSoumis[]): readonly string[] {
  const numeros = fichiersAdr
    .map((fichier) => numeroDeLAdr(fichier.chemin))
    .filter((numero): numero is string => numero !== null)
    .map(Number)
    .sort((a, b) => a - b);
  const premier = numeros[0];
  const dernier = numeros[numeros.length - 1];
  if (premier === undefined || dernier === undefined) return [];
  const presents = new Set(numeros);
  const trous: string[] = [];
  for (let numero = premier; numero <= dernier; numero += 1) {
    if (!presents.has(numero)) trous.push(String(numero).padStart(4, "0"));
  }
  return trous;
}

// ═════════════════════════════════════════════════════════════════════════════
//  G4 — L'ASSERTION : QUEL TEST ROUGIT SI LA DÉCISION SE DÉFAIT ? (ADR 0041)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE CORPS D'UN TEST, sous ses DEUX formes — et la distinction est une mesure.
 *
 * ⚠️ `brut` porte les chaînes de caractères, `code` les a BLANCHIES. Ce qu'une
 *    décision NOMME peut parfaitement vivre dans un littéral (un code de refus,
 *    un nom de champ), donc `nomme` se cherche dans `brut`. Ce qui COMPTE comme
 *    du code — un `expect(`, la déclaration d'un test voisin — se cherche dans
 *    `code`, faute de quoi le décor fabriqué par un témoin serait lu comme du
 *    code et la garde des gardes deviendrait illisible.
 */
export interface CorpsDeTest {
  readonly brut: string;
  readonly code: string;
}

/**
 * ISOLE LE CORPS D'UN TEST NOMMÉ, ou rend `null` quand il n'y parvient pas.
 *
 * ⚠️ **`null` N'EST PAS « RIEN À REDIRE » — C'EST UNE ANOMALIE.** Une garde qui
 *    rendrait une chaîne vide sur un isolement raté ferait passer tous les
 *    contrôles suivants : zéro nom absent, zéro reproche, vert. C'est le mode
 *    de défaillance le plus coûteux de tout ce dépôt, et il est refusé ici.
 *
 * ⚠️ **DEUX BORNES, ÉCRITES AVEC LA MESURE.** L'équilibrage des accolades saute
 *    les chaînes et leurs échappements, mais **pas les littéraux d'expression
 *    régulière** : une accolade échappée dans un motif déséquilibrerait le
 *    compte. Ce cas rend `null`, donc une anomalie BRUYANTE — jamais un vert.
 *    Et le corps isolé ne doit contenir AUCUNE autre déclaration de test : si
 *    l'isolement avait fui jusqu'à la fin du fichier, il en trouverait une, et
 *    la fuite se voit au lieu de se croire.
 */
export function corpsDuTestNomme(source: string, nom: string): CorpsDeTest | null {
  const nu = sansProse(source);
  const declaration = new RegExp(
    `(?<![.\\w])(?:it|test)(?:\\.fails)?\\s*\\(\\s*"${echapper(nom)}"`,
    "u",
  );
  const trouve = declaration.exec(nu);
  if (trouve === null) return null;

  const debut = nu.indexOf("{", trouve.index + trouve[0].length);
  if (debut === -1) return null;

  let profondeur = 0;
  let dansLaChaine: string | null = null;
  /**
   * ⚠️ **LE CODE SE CONSTRUIT DANS LA MÊME PASSE QUE L'ÉQUILIBRAGE, ET C'EST LA
   *    MESURE QUI L'EXIGE.** Le témoin de cette garde FABRIQUE des sources de
   *    test à l'intérieur de chaînes de caractères : `it("…")`, `expect(…)` et
   *    des accolades y figurent par construction. Compter ces occurrences
   *    reviendrait à lire le décor d'un témoin comme du code, et le contrôle
   *    « l'isolement a-t-il fui ? » rejetterait alors le corps de la garde qui
   *    éprouve la garde. Les chaînes sont donc BLANCHIES ici — jamais retirées
   *    du corps brut, où un nom cité en littéral (`"tool_not_in_profile"`) est
   *    une mention parfaitement légitime de la décision.
   */
  let code = "";
  for (let i = debut; i < nu.length; i += 1) {
    const c = nu[i] ?? "";
    if (dansLaChaine !== null) {
      if (c === "\\") i += 1;
      else if (c === dansLaChaine) dansLaChaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      dansLaChaine = c;
      continue;
    }
    code += c;
    if (c === "{") profondeur += 1;
    else if (c === "}") {
      profondeur -= 1;
      if (profondeur === 0) {
        // L'isolement a-t-il fui ? Un corps de test ne déclare jamais un test.
        if (/(?<![.\w])(?:it|test)(?:\.fails)?\s*\(/u.test(code)) return null;
        return { brut: nu.slice(debut + 1, i), code };
      }
    }
  }
  return null;
}

/**
 * BLANCHIT LES CHAÎNES **SANS DÉPLACER UN SEUL CARACTÈRE** — chaque octet de
 * chaîne devient une espace, les guillemets restent, les sauts de ligne aussi.
 *
 * ⚠️ **LA CONSERVATION DES POSITIONS EST TOUTE L'UTILITÉ DE CETTE FONCTION.**
 *    {@link suiteSuspendue} cherche la déclaration `it("nom")` dans la source
 *    NUE — le nom vit dans un littéral, il faut donc le lire — puis confronte
 *    son INDEX aux blocs suspendus repérés sur la source blanchie. Les deux
 *    lectures ne se comparent que si elles ont la même longueur.
 *
 * ⚠️ **POURQUOI BLANCHIR PLUTÔT QUE RETIRER.** Le témoin de cette garde-ci
 *    FABRIQUE des sources de test à l'intérieur de chaînes : `describe.skip(`
 *    y figure par construction, en littéral. Sans blanchiment, la garde lirait
 *    le décor du témoin comme du code et déclarerait suspendu le fichier même
 *    qui l'éprouve.
 */
export function chainesBlanchies(source: string): string {
  let sortie = "";
  let dansLaChaine: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i] ?? "";
    if (dansLaChaine !== null) {
      if (c === "\\") {
        sortie += "  ";
        i += 1;
        continue;
      }
      if (c === dansLaChaine) {
        dansLaChaine = null;
        sortie += c;
        continue;
      }
      sortie += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") dansLaChaine = c;
    sortie += c;
  }
  return sortie;
}

/**
 * LE TEST NOMMÉ EST-IL ENFERMÉ DANS UNE SUITE SUSPENDUE ?
 *
 * ⚠️ **G4 MORDAIT SUR `it.skip` ET PAS SUR `describe.skip`, ET C'EST LE MÊME
 *    GESTE.** Sur `it.skip("…")`, la déclaration ne correspond plus à la forme
 *    cherchée : le test devient « introuvable », donc une anomalie — la garde
 *    mord, par effet de bord. Posée d'un cran au-dessus, la MÊME suspension
 *    laisse la déclaration intacte : G4 la trouvait, isolait un corps, comptait
 *    des `expect(`, et rendait zéro reproche sur un test que vitest n'exécute
 *    pas. Une garde qui mord sur une forme et pas sur son équivalent se
 *    contourne sans que personne l'ait décidé.
 *
 * ⚠️ **`.only` EST DE LA MÊME FAMILLE, ET IL EST PIRE.** Il n'éteint pas le test
 *    qu'il porte : il éteint TOUS LES AUTRES du fichier. Un `.only` oublié ferme
 *    donc des décisions voisines sans qu'aucune d'elles ne le sache. Les trois
 *    formes sont refusées ensemble.
 *
 * ⚠️ **CE QU'ELLE NE VOIT PAS, ET C'EST ÉCRIT AVEC ELLE.** Elle lit du TEXTE :
 *    une suspension décidée à l'exécution lui échappe, comme lui échappe un
 *    fichier entier écarté par la configuration du lanceur. Elle ferme la forme
 *    ÉCRITE, qui est celle qu'un remaniement pose sans y penser.
 */
export function suiteSuspendue(source: string, nom: string): boolean {
  const nu = sansProse(source);
  const declaration = new RegExp(
    `(?<![.\\w])(?:it|test)(?:\\.\\w+)?\\s*\\(\\s*"${echapper(nom)}"`,
    "u",
  );
  const trouve = declaration.exec(nu);
  if (trouve === null) return false;

  const masque = chainesBlanchies(nu);
  const suspension = /(?<![.\w])(?:describe|suite)\s*\.\s*(?:skip|todo|only)\s*\(/gu;
  let ouverture: RegExpExecArray | null;
  while ((ouverture = suspension.exec(masque)) !== null) {
    const debut = masque.indexOf("{", ouverture.index + ouverture[0].length);
    if (debut === -1) continue;
    let profondeur = 0;
    for (let i = debut; i < masque.length; i += 1) {
      if (masque[i] === "{") profondeur += 1;
      else if (masque[i] === "}") {
        profondeur -= 1;
        if (profondeur === 0) {
          if (trouve.index > debut && trouve.index < i) return true;
          break;
        }
      }
    }
  }
  return false;
}

/**
 * LES ARGUMENTS DE CHAQUE `expect(` D'UN CORPS, un par appel.
 *
 * ⚠️ **L'ÉQUILIBRAGE DES PARENTHÈSES SE FAIT SUR `corps.code`**, donc sur un
 *    texte dont les chaînes sont déjà blanchies : une parenthèse citée dans un
 *    message ne déséquilibre rien. Un appel dont la parenthèse ne se referme pas
 *    rend un argument tronqué — jamais une exception, jamais un silence.
 */
export function argumentsDExpect(code: string): readonly string[] {
  const trouves: string[] = [];
  const appel = /\bexpect\s*\(/gu;
  let debut: RegExpExecArray | null;
  while ((debut = appel.exec(code)) !== null) {
    const ouvert = debut.index + debut[0].length;
    let profondeur = 1;
    let i = ouvert;
    for (; i < code.length && profondeur > 0; i += 1) {
      if (code[i] === "(") profondeur += 1;
      else if (code[i] === ")") profondeur -= 1;
    }
    trouves.push(code.slice(ouvert, i - 1));
  }
  return trouves;
}

/**
 * L'IDENTITÉ D'UNE ENTRÉE, quel que soit son état — ce qu'on met dans une liste
 * qu'un cliquet fige.
 *
 * ⚠️ **UN NUMÉRO D'ADR NE SUFFIT PAS** : un même ADR porte plusieurs décisions,
 *    et deux d'entre elles ont des sorts différents. Le second terme est donc le
 *    discriminant de l'état — le symbole quand il y en a un, le dossier attendu
 *    pour une couture `à-nommer`, la décision elle-même pour une `hors-code`,
 *    qui n'a rien d'autre à nommer.
 */
export function identiteDeLEntree(entree: EntreeDeCouture): string {
  if (entree.etat === "cousue" || entree.etat === "à-coudre") {
    return `${entree.symbole} (ADR ${entree.adr})`;
  }
  if (entree.etat === "à-nommer") return `${entree.dossierAttendu} (ADR ${entree.adr})`;
  return `${entree.decision} (ADR ${entree.adr})`;
}

/** Le test nommé est-il déclaré `it.fails` — une dette, non une garde vivante ? */
export function testEnDette(source: string, nom: string): boolean {
  return new RegExp(`(?<![.\\w])(?:it|test)\\.fails\\s*\\(\\s*"${echapper(nom)}"`, "u").test(
    sansProse(source),
  );
}

/**
 * LA GARDE DES ASSERTIONS — **le second fait du registre, celui qui manquait.**
 *
 * Elle rougit dans les DEUX sens, et le second est celui qui rend la première
 * moitié inutile si on l'oublie :
 *
 *  · **une assertion nommée et ABSENTE du dépôt** — fichier introuvable, test
 *    introuvable, nom composé à l'exécution : le registre MENT, et un registre
 *    menteur est pire qu'une garde aveugle, parce qu'il a l'air d'une mesure ;
 *  · **un test PRÉSENT qui ne fait échouer personne** — un corps sans un seul
 *    `expect(`, ou un corps qui ne NOMME rien de ce que la décision a changé.
 *    Sans ce second sens, on fermerait n'importe quelle entrée en pointant le
 *    premier test vert venu.
 *
 * Trois reproches de cohérence ferment les échappatoires restantes : une
 * assertion portée par autre chose qu'un `.spec.ts` (ce serait du code, pas une
 * garde), une liste `nomme` vide (une assertion sans objet), et une entrée
 * `cousue` dont l'assertion est un `it.fails` — déclarer une décision atterrie
 * en la gardant par une dette est une contradiction dans les termes.
 *
 * ⚠️ **CE QU'ELLE NE PROUVE PAS, ET C'EST ÉCRIT AVEC ELLE.** Elle mesure des
 *    FORMES sur le disque : elle ne fait pas tourner le test, donc elle ne peut
 *    pas savoir si la mutation de la décision le tue réellement. Cette
 *    preuve-là s'obtient en MUTANT, et le lot qui pose une assertion la
 *    transcrit — état ROUGE avant, état VERT après. G4 rend impossible qu'une
 *    assertion soit une chaîne ; elle ne rend pas inutile de la muter.
 */
export function verifierLesAssertions(
  fichiers: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
): RapportDesAssertions {
  const parChemin = new Map(fichiers.map((fichier) => [fichier.chemin, fichier.source]));
  const verdicts: VerdictDUneAssertion[] = [];
  const anomalies: string[] = [];
  const fichiersOuverts = new Set<string>();
  const cousuesNonAtterries: string[] = [];
  const sansAssertionNommees: string[] = [];
  const usagesParAssertion = new Map<string, number>();
  const adrAvecAssertion = new Set<string>();
  const adrInscrits = new Set<string>();
  let avecAssertion = 0;
  let enDetteTotal = 0;
  let nomsExiges = 0;
  let nomsEnLitteralSeulTotal = 0;

  for (const entree of registre) {
    adrInscrits.add(entree.adr);
    const assertion = entree.assertion;
    if (assertion === null) {
      /**
       * ⚠️ **L'IDENTITÉ, PAS SEULEMENT LE COMPTE.** Le total `sansAssertion` se
       *    compense : une décision aveugle de plus, une assertion posée sur une
       *    ancienne entrée, et le nombre ne bouge pas. La liste, elle, change.
       */
      sansAssertionNommees.push(identiteDeLEntree(entree));
      verdicts.push({
        entree,
        fichierTrouve: false,
        testTrouve: false,
        enDette: false,
        octetsDuCorps: 0,
        assertionsDansLeCorps: 0,
        expectsFalsifiables: 0,
        suspendu: false,
        nomsAttendus: 0,
        nomsAbsents: [],
        nomsEnLitteralSeul: [],
        anomalies: [],
      });
      continue;
    }

    avecAssertion += 1;
    adrAvecAssertion.add(entree.adr);
    const empreinteDeLAssertion = `${assertion.fichier} › ${assertion.nom}`;
    usagesParAssertion.set(
      empreinteDeLAssertion,
      (usagesParAssertion.get(empreinteDeLAssertion) ?? 0) + 1,
    );
    const reproches: string[] = [];
    const ou = `ADR ${entree.adr} · ${assertion.fichier} · « ${assertion.nom} »`;

    if (!assertion.fichier.endsWith(".spec.ts")) {
      reproches.push(
        `${ou} : une assertion doit être portée par un fichier « .spec.ts » — ` +
          "un test porté par un module de production n'est pas une garde, c'est du code",
      );
    }
    if (assertion.nomme.length === 0) {
      reproches.push(
        `${ou} : la liste « nomme » est VIDE — une assertion qui n'exige aucun nom du corps ` +
          "peut désigner n'importe quel test vert, et le registre redevient une prose",
      );
    }

    const source = parChemin.get(assertion.fichier);
    const fichierTrouve = source !== undefined;
    if (source === undefined) {
      reproches.push(
        `${ou} : le fichier d'assertion N'EXISTE PAS parmi les fichiers soumis — ` +
          "le registre nomme un test que personne ne peut exécuter",
      );
    } else {
      fichiersOuverts.add(assertion.fichier);
    }

    const corps = source === undefined ? null : corpsDuTestNomme(source, assertion.nom);
    const testTrouve = corps !== null;
    if (source !== undefined && corps === null) {
      reproches.push(
        `${ou} : aucun test de ce nom EXACT n'y est déclaré, ou son corps n'a pas pu être ` +
          "isolé (accolades déséquilibrées, ou l'isolement a fui jusqu'à un autre test)",
      );
    }

    const enDette = source !== undefined && testEnDette(source, assertion.nom);
    if (enDette) enDetteTotal += 1;
    /**
     * ⚠️ **CE CAS N'EST PAS UNE ANOMALIE — C'EST LE DÉFAUT CENTRAL DU LOT 4, ET
     *    LE COMPTER EST TOUT L'OBJET DE L'ADR 0041.**
     *
     * Une entrée `cousue` dont l'assertion est un `it.fails` dit deux choses
     * VRAIES en même temps : le symbole A des appelants de production, et la
     * décision N'A PAS atterri. C'est exactement l'état dans lequel l'ADR 0037
     * a passé un lot entier — `PortsDuService` importé par `ops/index.ts`,
     * entrée verte, et ni `journalDesRefus` ni `delaiDeReprise` nulle part.
     *
     * En faire un reproche reviendrait à RECONFONDRE les deux faits que cette
     * garde existe pour séparer, et forcerait à mentir sur l'un pour être vert
     * sur l'autre. La liste est donc NOMMÉE et RENDUE ; c'est à l'appelant de
     * tenir le cliquet dessus.
     */
    if (enDette && entree.etat === "cousue") {
      cousuesNonAtterries.push(`${entree.symbole} (ADR ${entree.adr})`);
    }

    /**
     * ⚠️ **UNE SUITE SUSPENDUE FERME LA DÉCISION SANS JAMAIS TOURNER.** Le
     *    reproche est posé même si tout le reste du verdict est irréprochable :
     *    un corps parfait qu'aucun lanceur n'exécute ne garde rien du tout.
     */
    const suspendu = source !== undefined && suiteSuspendue(source, assertion.nom);
    if (suspendu) {
      reproches.push(
        `${ou} : le test est enfermé dans une suite SUSPENDUE (« describe.skip », « .todo » ` +
          "ou « .only » posé plus haut) — le lanceur ne l'exécute pas, et un test qui ne " +
          "tourne pas ne fait échouer personne, quelle que soit la qualité de son corps",
      );
    }

    const assertionsDansLeCorps =
      corps === null ? 0 : (corps.code.match(/\bexpect\s*\(/g) ?? []).length;
    if (corps !== null && assertionsDansLeCorps === 0) {
      reproches.push(
        `${ou} : le corps du test ne porte AUCUN « expect( » — un test qui n'assère rien ` +
          "ne peut faire échouer personne, et il serait vert quoi qu'il arrive",
      );
    }

    /**
     * ⚠️ **LE CAS VOISIN DU CAS ZÉRO, ET IL ÉTAIT GRAND OUVERT.** Refuser un
     *    corps sans `expect(` ne dit rien d'un corps qui n'en porte que
     *    d'infalsifiables : `expect(1).toBe(1)` compte pour un, et il est vert
     *    quoi qu'il arrive. Un argument fait de littéraux seuls ne confronte
     *    RIEN du dépôt ; il faut au moins un identifiant pour qu'une mutation de
     *    la décision ait quoi que ce soit à changer.
     *
     * ⚠️ **LE SEUIL EST « AU MOINS UN », PAS « TOUS ».** Un test légitime mêle
     *    des planchers littéraux (`expect(fichiers.length).toBeGreaterThan(0)`,
     *    dont l'argument est bien un identifiant) à des comparaisons de
     *    constantes ; exiger que chaque `expect(` soit falsifiable rejetterait
     *    des gardes correctes. Ce qui est refusé, c'est le corps où AUCUN ne
     *    l'est.
     */
    const expectsFalsifiables =
      corps === null
        ? 0
        : argumentsDExpect(corps.code).filter((argument) => /[A-Za-z_$]/u.test(argument)).length;
    if (corps !== null && assertionsDansLeCorps > 0 && expectsFalsifiables === 0) {
      reproches.push(
        `${ou} : aucun des ${String(assertionsDansLeCorps)} « expect( » du corps ne confronte ` +
          "autre chose que des littéraux — un test qui ne peut pas échouer ne ferme aucune " +
          "décision, et il a l'air d'une mesure",
      );
    }

    const nomsAbsents =
      corps === null
        ? [...assertion.nomme]
        : assertion.nomme.filter((nom) => !corps.brut.includes(nom));
    if (corps !== null && nomsAbsents.length > 0) {
      reproches.push(
        `${ou} : le corps ne NOMME pas ${nomsAbsents.map((nom) => `« ${nom} »`).join(", ")} — ` +
          "l'assertion désigne un test qui parle d'autre chose que la décision",
      );
    }

    /**
     * ⚠️ **UNE PART ANNONCÉE, PAS UN REPROCHE — et la distinction est mesurée.**
     *    `nomme` se cherche dans le corps BRUT, littéraux compris, et c'est
     *    délibéré : un test qui LIT une source du dépôt y cherche un nom en
     *    littéral, où il est la mesure elle-même. Un `console.info` le fournit
     *    tout aussi bien, où il n'est que du décor. G4 ne sait pas trancher
     *    entre les deux ; elle compte donc la part concernée au lieu de la
     *    laisser invisible.
     */
    const nomsEnLitteralSeul =
      corps === null
        ? []
        : assertion.nomme.filter((nom) => corps.brut.includes(nom) && !corps.code.includes(nom));
    nomsExiges += assertion.nomme.length;
    nomsEnLitteralSeulTotal += nomsEnLitteralSeul.length;

    verdicts.push({
      entree,
      fichierTrouve,
      testTrouve,
      enDette,
      octetsDuCorps: corps?.brut.length ?? 0,
      assertionsDansLeCorps,
      expectsFalsifiables,
      suspendu,
      nomsAttendus: assertion.nomme.length,
      nomsAbsents,
      nomsEnLitteralSeul,
      anomalies: reproches,
    });
    anomalies.push(...reproches);
  }

  const sansAssertion = registre.length - avecAssertion;
  const adrSansAucuneAssertion = [...adrInscrits]
    .filter((adr) => !adrAvecAssertion.has(adr))
    .sort();

  return {
    entreesConfrontees: registre.length,
    avecAssertion,
    sansAssertion,
    enDette: enDetteTotal,
    parAssertion: {
      "avec-assertion": avecAssertion - enDetteTotal,
      "en-dette": enDetteTotal,
      "sans-assertion": sansAssertion,
    },
    adrConfrontes: adrInscrits.size,
    adrSansAucuneAssertion,
    cousuesNonAtterries: cousuesNonAtterries.sort(),
    sansAssertionNommees: sansAssertionNommees.sort(),
    assertionsPartagees: [...usagesParAssertion.entries()]
      .filter(([, usages]) => usages > 1)
      .map(([empreinte, usages]) => `${empreinte} (${String(usages)})`)
      .sort(),
    fichiersDAssertionDistincts: fichiersOuverts.size,
    nomsExiges,
    nomsEnLitteralSeul: nomsEnLitteralSeulTotal,
    verdicts,
    anomalies,
  };
}
