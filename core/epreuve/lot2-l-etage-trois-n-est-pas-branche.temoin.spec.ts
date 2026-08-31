/**
 * ÉPREUVE DU LOT 2 — **L'ÉTAGE 3 A SON DÉCIDEUR, ET LA RACINE NE L'APPELLE PAS.**
 *
 * ═══ CE QUE CE FICHIER CHERCHE ═══
 *
 * Le lot 2 se donne un critère écrit : « le socle doit pouvoir DÉMARRER EN LOCAL
 * avec des valeurs factices sur `stub.invalid` ». Il livre deux choses qui
 * devraient s'emboîter :
 *
 *  · `ops/main.ts` — la racine de composition, sept étages, dont le troisième
 *    exige un port `controlerLAuthentification` et REFUSE de démarrer s'il vaut
 *    `null` ;
 *  · `core/auth/configuration.ts` — `verifierLaConfigurationDAuthentification`,
 *    une fonction PURE dont la forme de retour est celle du port, au champ près.
 *
 * Les deux sont dans le MÊME lot. Rien ne les relie.
 *
 * ⚠️ **CE FICHIER NE JUGE PAS UN STYLE, IL MESURE UNE CONSÉQUENCE.** Un port non
 *    branché n'est pas une gêne d'ergonomie : l'étage 3 prononce
 *    `processus-sort`, donc la racine livrée ne démarre sur AUCUNE configuration
 *    — factice ou non. Le seul démarrage vert du dépôt est celui que la garde
 *    du lot s'accorde à elle-même en fabriquant un verdict.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU.** Les environnements sont fabriqués en
 *    mémoire, sur `stub.invalid` (RFC 2606). Rien n'est lu dans `process.env`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  REGLAGES_DAUTHENTIFICATION,
  verifierLaConfigurationDAuthentification,
} from "../auth/configuration.js";
import { VARIABLE_DE_L_AUDIENCE } from "../auth/ressource.js";
import type { DependancesDuSocle } from "../../ops/main.js";
import {
  DECIDEURS_NON_APPELES_DIRECTEMENT,
  ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
} from "../../ops/main.js";

/** Le dépôt, dérivé d'`import.meta.url`. Jamais un chemin codé en dur. */
const RACINE = new URL("../../", import.meta.url);

function lire(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, RACINE)), "utf8");
}

const SOURCE_RACINE = lire("ops/main.ts");
const SOURCE_GARDE_DU_LOT = lire("ops/main.spec.ts");
const SOURCE_CONFIGURATION = lire("core/auth/configuration.ts");

/**
 * Un environnement factice COMPLET : les quatre réglages du § 19, tous sur
 * `stub.invalid`. Il est DÉRIVÉ de la liste exigée, jamais recopié — une liste
 * recopiée resterait verte le jour où un cinquième réglage s'ajouterait.
 */
function environnementFactice(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const reglage of REGLAGES_DAUTHENTIFICATION) {
    env[reglage.nom] =
      reglage.nom === VARIABLE_DE_L_AUDIENCE ? "https://stub.invalid/api/mcp" : "valeur-factice";
  }
  return env;
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LE PLANCHER — les deux moitiés existent bien, et elles s'emboîtent
// ═════════════════════════════════════════════════════════════════════════════

describe("① le plancher — le décideur de l'étage 3 EXISTE et rend la forme du port", () => {
  /**
   * ⚠️ **SANS CE TEST, TOUS LES SUIVANTS SERAIENT VERTS POUR LA PIRE DES
   *    RAISONS.** Si `verifierLaConfigurationDAuthentification` n'existait pas,
   *    « la racine ne l'appelle pas » serait un constat vide plutôt qu'un
   *    défaut. Ce plancher établit que le symbole est livré, qu'il mord, et que
   *    sa forme de retour satisfait déjà le port de la racine.
   */
  it("mesure la fonction livrée sur trois environnements fabriqués", () => {
    const complet = verifierLaConfigurationDAuthentification(environnementFactice());

    const ampute = environnementFactice();
    delete ampute["OPS_CONSOLE_SESSION_KEY"];
    const sansUn = verifierLaConfigurationDAuthentification(ampute);

    const vide = verifierLaConfigurationDAuthentification({});

    console.info(
      `[lot2·①] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) exigé(s) par le § 19 · ` +
        `env COMPLET → ${String(complet.reglagesConfrontes)} confronté(s), ` +
        `${String(complet.manquants.length)} manquant(s), ${String(complet.anomalies.length)} anomalie(s) · ` +
        `env AMPUTÉ d'un réglage → ${String(sansUn.manquants.length)} manquant(s) ` +
        `[${sansUn.manquants.join(", ")}] · ` +
        `env VIDE → ${String(vide.manquants.length)} manquant(s), ` +
        `${String(vide.anomalies.length)} anomalie(s)`,
    );

    // La fonction mord : elle distingue les trois environnements.
    expect(complet.manquants).toEqual([]);
    expect(complet.anomalies).toEqual([]);
    expect(sansUn.manquants).toEqual(["OPS_CONSOLE_SESSION_KEY"]);
    expect(vide.manquants.length).toBe(REGLAGES_DAUTHENTIFICATION.length);

    // Et sa forme de retour est DÉJÀ celle que l'étage 3 attend : les trois
    // champs du port `VerdictDAuthentification`, aux mêmes noms.
    const port: DependancesDuSocle["controlerLAuthentification"] = () => complet;
    expect(port).not.toBeNull();
    expect(Object.keys(complet)).toEqual(
      expect.arrayContaining(["reglagesConfrontes", "manquants", "anomalies"]),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LE DÉFAUT — la racine annonce que le décideur « reste à écrire »
// ═════════════════════════════════════════════════════════════════════════════

describe("② la racine de composition affirme une absence qui est fausse", () => {
  /**
   * TROIS ÉNONCÉS DE LA RACINE, ET LE FAIT QUI LES DÉMENT.
   *
   * `ops/main.ts` écrit, en toutes lettres :
   *
   *  · « `verifierLaConfigurationDAuthentification`, appartient à `core/auth/`
   *    et reste à écrire » — dans le message de refus de l'étage 3 ;
   *  · « Étage 3 — jamais écrite » — au-dessus de
   *    `DECIDEURS_NON_APPELES_DIRECTEMENT` ;
   *  · « un étage dont l'implémentation n'existe pas » — au-dessus d'
   *    `ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR`.
   *
   * Les trois sont datés du lot 1d et le lot 2 les a laissés en place APRÈS
   * avoir livré la fonction. Ce ne sont pas trois formulations d'une même
   * remarque de style : le troisième énoncé est le MOTIF ÉCRIT du cliquet
   * `ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR`, et ce cliquet est ce qui autorise
   * la garde de couverture des étages à rester verte sur un étage non câblé.
   *
   * ⚠️ **BORNE.** Ce test lit des CHAÎNES du source. Un `grep` ne prouve que la
   *    présence de la forme écrite : il ne dit pas qu'il n'existe pas ailleurs
   *    une quatrième phrase disant la même chose autrement. Le compte annoncé
   *    est donc un PLANCHER, pas un total.
   */
  it("confronte ce que la racine DIT à ce que `core/auth/` LIVRE", () => {
    const affirmationsDAbsence = [
      "reste à écrire",
      "jamais écrite",
      "dont l'implémentation n'existe pas",
    ];
    const trouvees = affirmationsDAbsence.filter((forme) => SOURCE_RACINE.includes(forme));

    // Le fait qui les dément, lu dans l'autre fichier : la fonction est bien
    // DÉFINIE là où la racine la dit absente.
    const definie = /export function verifierLaConfigurationDAuthentification\s*\(/u.test(
      SOURCE_CONFIGURATION,
    );

    console.info(
      `[lot2·②] ${String(SOURCE_RACINE.length)} octet(s) lus dans ops/main.ts · ` +
        `${String(affirmationsDAbsence.length)} forme(s) d'affirmation cherchée(s) · ` +
        `${String(trouvees.length)} trouvée(s) [${trouvees.join(" | ")}] · ` +
        `le symbole est DÉFINI dans core/auth/configuration.ts : ${String(definie)} · ` +
        `${String(ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.length)} étage(s) au cliquet ` +
        `[${ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.join(", ")}] · ` +
        `${String(DECIDEURS_NON_APPELES_DIRECTEMENT.length)} décideur(s) déclaré(s) non appelé(s)`,
    );

    // Les deux moitiés du fichier ont bien été lues.
    expect(SOURCE_RACINE.length).toBeGreaterThan(10_000);
    expect(definie, "le décideur de l'étage 3 est livré par le lot 2").toBe(true);

    // 🔴 L'ATTENTE. La racine ne doit affirmer AUCUNE de ces absences, puisque
    //    le symbole existe. Une seule suffit à faire lire le contraire du réel.
    expect(trouvees, "la racine affirme une absence démentie par le dépôt").toEqual([]);
  });

  /**
   * LE CLIQUET DE L'ÉTAGE 3 EST ENCORE ARMÉ — et son propre commentaire dit ce
   * qui devrait alors se produire : « le jour où la racine appellera le vrai
   * symbole, cette entrée fera rougir la garde tant qu'elle n'aura pas été
   * retirée ». Elle n'a pas été retirée, donc la racine n'appelle pas.
   */
  it("mesure le cliquet, et prouve qu'il n'a pas été vidé", () => {
    const nommeLeSymbole = DECIDEURS_NON_APPELES_DIRECTEMENT.includes(
      "verifierLaConfigurationDAuthentification",
    );

    console.info(
      `[lot2·② cliquet] authentification en attente : ` +
        `${String(ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.includes("authentification"))} · ` +
        `le décideur figure parmi les « non appelés » : ${String(nommeLeSymbole)}`,
    );

    // 🔴 L'ATTENTE : le lot qui livre le décideur doit vider ces deux entrées.
    expect(ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR).toEqual([]);
    expect(nommeLeSymbole).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ LA GARDE DU LOT SE FABRIQUE SON PROPRE VERT
// ═════════════════════════════════════════════════════════════════════════════

describe("③ le critère « le socle démarre » est éprouvé sur un verdict FABRIQUÉ", () => {
  /**
   * `ops/main.spec.ts` s'annonce « LE CRITÈRE DU LOT : LE SOCLE DÉMARRE, ET IL
   * RÉPOND ». Son unique fabrique de dépendances pose, par défaut :
   *
   *     controlerLAuthentification: () => ({ reglagesConfrontes: 5, manquants: [], anomalies: [] })
   *
   * C'est-à-dire que la garde du critère franchit l'étage 3 en s'accordant
   * elle-même le verdict que la racine ne sait pas obtenir. Le socle démarre
   * dans le test ; il ne démarrerait nulle part ailleurs.
   *
   * ⚠️ ET LE NOMBRE NE DÉRIVE DE RIEN. La fabrique annonce cinq réglages
   *    confrontés ; le décideur réel en confronte
   *    {@link REGLAGES_DAUTHENTIFICATION}`.length`. Deux dérivations d'un même
   *    fait, dans le même lot, qui se contredisent — et c'est la fabriquée qui
   *    est verte, précisément parce qu'elle ne dérive de rien.
   */
  it("lit le verdict codé en dur dans la garde du critère et le confronte au réel", () => {
    const codeEnDur = /reglagesConfrontes:\s*(\d+)\s*,\s*manquants:\s*\[\s*\]/u.exec(
      SOURCE_GARDE_DU_LOT,
    );
    const annonce = codeEnDur === null ? null : Number(codeEnDur[1]);
    const reel = verifierLaConfigurationDAuthentification(environnementFactice());

    // La garde du critère importe-t-elle seulement le décideur réel ?
    const importeLeDecideur = /from\s+"[^"]*auth\/configuration\.js"/u.test(SOURCE_GARDE_DU_LOT);

    console.info(
      `[lot2·③] ${String(SOURCE_GARDE_DU_LOT.length)} octet(s) lus dans ops/main.spec.ts · ` +
        `verdict CODÉ EN DUR : ${annonce === null ? "aucun" : String(annonce)} réglage(s) ` +
        `« confrontés » · verdict RÉEL : ${String(reel.reglagesConfrontes)} · ` +
        `écart : ${annonce === null ? "n/a" : String(Math.abs(annonce - reel.reglagesConfrontes))} · ` +
        `la garde importe-t-elle core/auth/configuration.js : ${String(importeLeDecideur)}`,
    );

    // Le fichier a bien été lu, et il porte bien un verdict fabriqué.
    expect(SOURCE_GARDE_DU_LOT.length).toBeGreaterThan(5_000);
    expect(annonce, "la garde du critère fabrique bien un verdict").not.toBeNull();

    // 🔴 DEUX ATTENTES, ET ELLES SE COMPLÈTENT.
    //    (a) le nombre annoncé par la fabrique doit DÉRIVER du réel ;
    //    (b) la garde du critère doit éprouver le décideur réel, pas un double.
    expect(annonce, "le compte fabriqué doit dériver de la liste réelle").toBe(
      reel.reglagesConfrontes,
    );
    expect(importeLeDecideur, "le critère doit s'éprouver sur le décideur livré").toBe(true);
  });
});
