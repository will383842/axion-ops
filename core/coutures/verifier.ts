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
  RapportDesCoutures,
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

      const nu = sansProse(fichier.source);
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

      const corps = sansLiaisons(nu);
      if (forme.test(corps)) appelants.push(fichier.chemin);
      else if (nomSeul.test(fichier.source) && !forme.test(corps)) {
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
