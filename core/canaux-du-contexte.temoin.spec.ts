/**
 * `core/canaux-du-contexte.temoin.spec.ts` — L'INVENTAIRE DES CANAUX DU `ctx`.
 *
 * ═══ CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE ═══
 *
 * L'ADR 0020 a fermé un canal : `ToolContext.idempotencyKey` remettait à
 * l'adaptateur une chaîne LIBRE choisie par l'appelant, hors de portée de
 * l'anti-exfiltration du § 20 — qui ne dérive `porteUnArgumentLibre` que du
 * SEUL `inputSchema`.
 *
 * **Ce défaut n'a pas été trouvé en inspectant du code.** Il a été trouvé en
 * FERMANT une liste : `AppelAdaptateur` a exactement deux paramètres, le `ctx`
 * et l'entrée validée ; l'entrée validée est ce que le § 20 voit déjà ; donc
 * l'inventaire des canaux INVISIBLES est, exactement et sans reste, les
 * propriétés de `ToolContext`. Fermer une liste trouve ce qu'aucune relecture
 * ne trouve.
 *
 * Ce fichier garde cette fermeture. Il ne cherche AUCUN nom : il confronte
 * l'inventaire au source, et rougit si un champ y apparaît sans statut, ou si un
 * statut promet une fermeture que le type ne tient pas.
 *
 * ═══ POURQUOI DEUX DÉRIVATIONS, ALORS QU'ON N'EN GARDE JAMAIS DEUX ═══
 *
 * La règle du dépôt est qu'on ne garde qu'UNE dérivation d'un même fait — deux
 * finissent par se contredire. Il n'y a pas deux dérivations ici, il y en a deux
 * de faits DIFFÉRENTS, et leur confrontation est précisément la garde :
 *
 *  · `keyof ToolContext` dit la TOTALITÉ. Ajouter un champ sans le classer dans
 *    `STATUT_DES_CANAUX_DE_CONTEXTE` est une erreur de COMPILATION. Aucun test
 *    n'est nécessaire pour cela, et aucun ne pourrait faire mieux ;
 *  · le SOURCE dit le TYPE RÉEL de chaque champ — ce que `keyof` ne dit pas. Et
 *    c'est la MÊME lecture que celle du contrôle 7 du § 09
 *    (`clesDAutorisationDepuisSource`), si bien que leur accord prouve aussi que
 *    le contrôle 7 voit bien les mêmes champs.
 *
 * ═══ LA RÈGLE QUE CHAQUE GARDE D'ICI RESPECTE ═══
 *
 *  (a) l'analyse est une FONCTION PURE d'un source INJECTÉ — c'est ce qui rend
 *      les témoins possibles sans mutiler `core/types.ts` ;
 *  (b) chaque garde ANNONCE COMBIEN D'ÉLÉMENTS elle a mesurés, et échoue sous un
 *      plancher-témoin.
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUN IDENTIFIANT D'INFRASTRUCTURE.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NOMS_RESERVES_HORS_CONTEXTE,
  REGIMES_DE_CANAL,
  STATUT_DES_CANAUX_DE_CONTEXTE,
  type StatutDeCanal,
} from "./types.js";
// ⚠️ ON EMPRUNTE LE LECTEUR DU CONTRÔLE 7, ON N'EN ÉCRIT PAS UN SECOND.
//    `sansCommentaires` est le balayage qui distingue un commentaire d'une
//    chaîne ; `proprietesDInterface` est la lecture des NOMS dont le § 09 dérive
//    ses interdits. Réécrire l'un ou l'autre ferait mesurer à ce fichier son
//    propre code plutôt que celui du socle.
import {
  clesDAutorisationDepuisSource,
  proprietesDInterface,
  sansCommentaires,
} from "./adapter-kit/autorisation.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ANALYSE — pure, sur un source injecté
// ═════════════════════════════════════════════════════════════════════════════

/** Le corps d'une interface, borné par comptage d'accolades. */
function corpsDInterface(source: string, nom: string): string {
  const propre = sansCommentaires(source);
  const declaration = new RegExp(`\\binterface\\s+${nom}\\b[^{]*\\{`).exec(propre);
  if (declaration === null) return "";

  let profondeur = 0;
  let debut = -1;
  for (let i = declaration.index; i < propre.length; i += 1) {
    const caractere = propre[i];
    if (caractere === "{") {
      if (profondeur === 0) debut = i + 1;
      profondeur += 1;
    } else if (caractere === "}") {
      profondeur -= 1;
      if (profondeur === 0) return debut === -1 ? "" : propre.slice(debut, i);
    }
  }
  return "";
}

/**
 * LE TYPE ÉCRIT de chaque propriété, lu dans le source.
 *
 * ⚠️ CE N'EST PAS UN ANALYSEUR SYNTAXIQUE, et la borne est écrite avec la
 *    mesure : le motif s'arrête au premier `;` de la ligne. Un type d'objet en
 *    ligne ou une signature de fonction portant un `;` serait mal lu. Le remède
 *    complet serait un AST ; ce qu'on cherche ici est plus étroit — savoir si un
 *    champ porte une CHAÎNE NUE —, et un faux rouge se corrige en une minute
 *    tandis qu'un faux vert ne se voit pas. Le désaccord de noms mesuré plus bas
 *    est ce qui empêche cette lecture de devenir muette.
 */
function typesDesProprietes(source: string, nom: string): ReadonlyMap<string, string> {
  const corps = corpsDInterface(source, nom);
  const types = new Map<string, string>();
  for (const trouve of corps.matchAll(
    /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:\s*([^;]+);/gm,
  )) {
    const propriete = trouve[1];
    const type = trouve[2];
    if (propriete === undefined || type === undefined) continue;
    if (!types.has(propriete)) types.set(propriete, type.replace(/\s+/g, " ").trim());
  }
  return types;
}

/**
 * CE CHAMP PORTE-T-IL UNE CHAÎNE QUE L'APPELANT PEUT REMPLIR LIBREMENT ?
 *
 * `string`, `string | null`, `string | undefined` — oui. Un type MARQUÉ
 * (`SessionId`), une union fermée (`PolicyLevel`, `readonly OpsScope[]`), un
 * paramètre resserré ailleurs (`TProfile` → `ProfileName`), un objet de
 * booléens : non. Le partage est TEXTUEL, et c'est assumé — un alias
 * `type Truc = string` passerait pour fermé. C'est la borne de cette garde, et
 * c'est pourquoi le régime de chaque champ porte AUSSI un motif écrit.
 */
function estChaineLibre(type: string): boolean {
  const membres = type.split("|").map((membre) => membre.trim());
  const admis = new Set(["string", "null", "undefined"]);
  return membres.every((membre) => admis.has(membre)) && membres.includes("string");
}

interface AnalyseDesCanaux {
  readonly champsLusDansLeSource: readonly string[];
  readonly champsStatues: readonly string[];
  readonly chainesLibres: readonly string[];
  readonly parRegime: ReadonlyMap<string, number>;
  /** Dans le source, absent de l'inventaire — le mode de défaillance principal. */
  readonly champsSansStatut: readonly string[];
  /** Dans l'inventaire, absent du source — un statut devenu fantôme. */
  readonly statutsSansChamp: readonly string[];
  /** Un régime qui PROMET une fermeture par le type, sur un champ qui n'en a pas. */
  readonly fermeturesPromisesNonTENUES: readonly string[];
  readonly motifsVides: readonly string[];
  readonly regimesInconnus: readonly string[];
  /** Désaccord entre CETTE lecture et celle du contrôle 7 du § 09. */
  readonly desaccordsAvecLeControle7: readonly string[];
}

/** ANALYSE PURE — aucun accès disque, aucun nom de champ écrit en dur. */
function analyserCanaux(
  source: string,
  statuts: Readonly<Record<string, StatutDeCanal>>,
): AnalyseDesCanaux {
  const types = typesDesProprietes(source, "ToolContext");
  const champsLusDansLeSource = [...types.keys()];
  const champsStatues = Object.keys(statuts);
  const nomsDuControle7 = proprietesDInterface(source, "ToolContext");

  const chainesLibres: string[] = [];
  const parRegime = new Map<string, number>();
  const champsSansStatut: string[] = [];
  const fermeturesPromisesNonTENUES: string[] = [];
  const motifsVides: string[] = [];
  const regimesInconnus: string[] = [];

  for (const [champ, type] of types) {
    const libre = estChaineLibre(type);
    if (libre) chainesLibres.push(`${champ}: ${type}`);

    const statut = statuts[champ];
    if (statut === undefined) {
      champsSansStatut.push(champ);
      continue;
    }
    parRegime.set(statut.regime, (parRegime.get(statut.regime) ?? 0) + 1);
    if (statut.motif.trim().length === 0) motifsVides.push(champ);
    if (!(REGIMES_DE_CANAL as readonly string[]).includes(statut.regime)) {
      regimesInconnus.push(`${champ} → ${statut.regime}`);
    }
    // LA RÈGLE, ET ELLE EST LA SEULE QUI RELIE LES DEUX DÉRIVATIONS :
    // « fermé-par-construction » affirme que le TYPE ferme le canal. Un champ qui
    // porte une chaîne nue le contredit, et le contredit en silence.
    if (statut.regime === "fermé-par-construction" && libre) {
      fermeturesPromisesNonTENUES.push(`${champ}: ${type}`);
    }
  }

  const statutsSansChamp = champsStatues.filter((champ) => !types.has(champ));
  const desaccordsAvecLeControle7 = [
    ...nomsDuControle7
      .filter((nom) => !types.has(nom))
      .map((nom) => `${nom} : vu par le § 09 seul`),
    ...champsLusDansLeSource
      .filter((nom) => !nomsDuControle7.includes(nom))
      .map((nom) => `${nom} : vu par cette garde seule`),
  ];

  return {
    champsLusDansLeSource,
    champsStatues,
    chainesLibres,
    parRegime,
    champsSansStatut,
    statutsSansChamp,
    fermeturesPromisesNonTENUES,
    motifsVides,
    regimesInconnus,
    desaccordsAvecLeControle7,
  };
}

/** Le source réel de `core/types.ts`, par `import.meta.url` — jamais un chemin figé. */
function sourceDesTypes(): { readonly texte: string; readonly chemin: string } {
  const chemin = fileURLToPath(new URL("./types.ts", import.meta.url));
  return { texte: readFileSync(chemin, "utf8"), chemin };
}

function rendu(analyse: AnalyseDesCanaux): string {
  return [...analyse.parRegime.entries()]
    .map(([regime, compte]) => `${regime}=${String(compte)}`)
    .join(", ");
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES TÉMOINS FABRIQUÉS — sans eux, tout ce qui suit serait vert pour rien
// ═════════════════════════════════════════════════════════════════════════════

/** Un `core/types.ts` fabriqué, minuscule, où l'on plante le défaut qu'on veut voir. */
function sourceFabrique(proprietes: readonly string[]): string {
  return [
    "export interface ToolContext<TProfile extends string = string> {",
    ...proprietes.map((ligne) => `  readonly ${ligne}`),
    "}",
    "",
    "export interface Habilitations {",
    "  readonly peutVoirAppels: boolean;",
    "}",
  ].join("\n");
}

const PROPRIETES_SAINES = [
  "principal: string;",
  "sessionId: SessionId;",
  "scopes: readonly OpsScope[];",
  "policyLevel: PolicyLevel;",
  "profile: TProfile;",
  "idempotencyRef: string | null;",
  "requestId: string;",
  "deadline: Date;",
  "habilitations: Habilitations;",
];

const STATUTS_SAINS: Readonly<Record<string, StatutDeCanal>> = {
  principal: { regime: "ouvert-signalé", motif: "témoin" },
  sessionId: { regime: "fermé-par-construction", motif: "témoin" },
  scopes: { regime: "fermé-par-construction", motif: "témoin" },
  policyLevel: { regime: "fermé-par-construction", motif: "témoin" },
  profile: { regime: "fermé-par-construction", motif: "témoin" },
  idempotencyRef: { regime: "fermé-par-le-socle", motif: "témoin" },
  requestId: { regime: "à-fermer-au-transport", motif: "témoin" },
  deadline: { regime: "à-fermer-au-transport", motif: "témoin" },
  habilitations: { regime: "fermé-par-construction", motif: "témoin" },
};

describe("ADR 0020 — l'analyse des canaux SAIT DIRE NON", () => {
  it("rougit sur le défaut RÉEL : `idempotencyKey` remise, et déclarée fermée par le type", () => {
    // ⚠️ C'EST LE DÉFAUT EXACT QUE L'ADR 0020 A FERMÉ, REJOUÉ EN LABORATOIRE.
    //    Il ne suffit pas que le champ revienne : il faut que quelqu'un le
    //    déclare `fermé-par-construction`, c'est-à-dire qu'il AFFIRME une
    //    fermeture que le type ne tient pas. C'est la forme qu'aurait prise un
    //    ajout inattentif, et c'est celle qu'aucune relecture n'attrape.
    const analyse = analyserCanaux(
      sourceFabrique([...PROPRIETES_SAINES, "idempotencyKey: string | null;"]),
      { ...STATUTS_SAINS, idempotencyKey: { regime: "fermé-par-construction", motif: "témoin" } },
    );

    console.info(
      `[témoin · fermeture promise non tenue] ` +
        `${String(analyse.champsLusDansLeSource.length)} champ(s) lu(s) · ` +
        `${String(analyse.chainesLibres.length)} chaîne(s) libre(s) · ` +
        `${String(analyse.fermeturesPromisesNonTENUES.length)} fermeture(s) promise(s) ` +
        `non tenue(s) : ${analyse.fermeturesPromisesNonTENUES.join(", ")}`,
    );

    expect(analyse.champsLusDansLeSource).toHaveLength(10);
    expect(analyse.fermeturesPromisesNonTENUES).toEqual(["idempotencyKey: string | null"]);
  });

  it("rougit sur un champ AJOUTÉ au source sans statut — l'inventaire cesse d'être clos", () => {
    const analyse = analyserCanaux(
      sourceFabrique([...PROPRIETES_SAINES, "surnom: string;"]),
      STATUTS_SAINS,
    );

    console.info(
      `[témoin · champ sans statut] ${String(analyse.champsLusDansLeSource.length)} champ(s) ` +
        `lu(s) · ${String(analyse.champsStatues.length)} statué(s) · ` +
        `${String(analyse.champsSansStatut.length)} sans statut : ` +
        `${analyse.champsSansStatut.join(", ")}`,
    );

    expect(analyse.champsSansStatut).toEqual(["surnom"]);
  });

  it("rougit sur un statut FANTÔME — un champ retiré du type, son statut resté", () => {
    const analyse = analyserCanaux(sourceFabrique(PROPRIETES_SAINES), {
      ...STATUTS_SAINS,
      champDisparu: { regime: "fermé-par-construction", motif: "témoin" },
    });

    console.info(
      `[témoin · statut fantôme] ${String(analyse.statutsSansChamp.length)} statut(s) sans ` +
        `champ : ${analyse.statutsSansChamp.join(", ")}`,
    );

    expect(analyse.statutsSansChamp).toEqual(["champDisparu"]);
  });

  it("rougit sur un MOTIF vide — un régime sans motif n'est qu'une opinion", () => {
    const analyse = analyserCanaux(sourceFabrique(PROPRIETES_SAINES), {
      ...STATUTS_SAINS,
      requestId: { regime: "à-fermer-au-transport", motif: "   " },
    });

    console.info(
      `[témoin · motif vide] ${String(analyse.motifsVides.length)} motif(s) vide(s) : ` +
        `${analyse.motifsVides.join(", ")}`,
    );

    expect(analyse.motifsVides).toEqual(["requestId"]);
  });

  it("sait lire un TYPE, et pas seulement un nom — trois chaînes libres sur neuf champs", () => {
    // Sans ce témoin, `estChaineLibre` pourrait rendre `false` partout et TOUTES
    // les gardes de ce fichier seraient vertes en ne regardant rien.
    const analyse = analyserCanaux(sourceFabrique(PROPRIETES_SAINES), STATUTS_SAINS);

    console.info(
      `[témoin · lecture des types] ${String(analyse.champsLusDansLeSource.length)} champ(s) · ` +
        `${String(analyse.chainesLibres.length)} chaîne(s) libre(s) : ` +
        `${analyse.chainesLibres.join(", ")} · régimes : ${rendu(analyse)}`,
    );

    expect(analyse.chainesLibres).toEqual([
      "principal: string",
      "idempotencyRef: string | null",
      "requestId: string",
    ]);
    expect(analyse.champsSansStatut).toEqual([]);
    expect(analyse.fermeturesPromisesNonTENUES).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LA MESURE RÉELLE — sur `core/types.ts`
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0020 — l'inventaire des canaux du `ctx` est CLOS", () => {
  it("statue chaque champ de `ToolContext`, et le source ne cache rien", () => {
    const { texte, chemin } = sourceDesTypes();
    const analyse = analyserCanaux(texte, STATUT_DES_CANAUX_DE_CONTEXTE);

    console.info(
      `[garde canaux du ctx] ${String(analyse.champsLusDansLeSource.length)} propriété(s) lue(s) ` +
        `dans le SOURCE · ${String(analyse.champsStatues.length)} statuée(s) par le TYPE · ` +
        `régimes : ${rendu(analyse)} · ` +
        `${String(analyse.chainesLibres.length)} chaîne(s) libre(s) : ` +
        `${analyse.chainesLibres.join(", ")} · ` +
        `${String(analyse.champsSansStatut.length)} sans statut · ` +
        `${String(analyse.statutsSansChamp.length)} statut(s) fantôme(s) · ` +
        `${String(analyse.fermeturesPromisesNonTENUES.length)} fermeture(s) promise(s) non ` +
        `tenue(s) · ${String(analyse.desaccordsAvecLeControle7.length)} désaccord(s) avec le ` +
        `contrôle 7 du § 09 · lu dans ${chemin}`,
    );

    // PLANCHER-TÉMOIN : un fichier déplacé, un motif qui ne mord plus, et cette
    // garde deviendrait muette en restant verte.
    expect(
      analyse.champsLusDansLeSource.length,
      "la dérivation depuis le source a bien mordu",
    ).toBeGreaterThanOrEqual(9);
    expect(analyse.chainesLibres.length, "et elle sait lire les TYPES").toBeGreaterThan(0);

    expect(analyse.champsSansStatut, "aucun champ du `ctx` n'échappe à l'inventaire").toEqual([]);
    expect(analyse.statutsSansChamp, "et aucun statut ne survit à son champ").toEqual([]);
    expect(analyse.regimesInconnus, "chaque régime est l'un de ceux de REGIMES_DE_CANAL").toEqual(
      [],
    );
    expect(analyse.motifsVides, "et chacun porte un motif ÉCRIT").toEqual([]);
    expect(
      analyse.fermeturesPromisesNonTENUES,
      "aucun champ déclaré fermé par le type ne porte une chaîne libre",
    ).toEqual([]);
    expect(
      analyse.desaccordsAvecLeControle7,
      "cette garde et le contrôle 7 du § 09 lisent bien la MÊME interface",
    ).toEqual([]);
  });

  it("ne porte AUCUN canal `ouvert-signalé` qui ne soit pas écrit dans un ADR", () => {
    // ⚠️ CE N'EST PAS UN INTERDIT, C'EST UN COMPTE. Un canal ouvert est
    //    admissible tant qu'il est NOMMÉ et daté ; ce qui ne l'est pas, c'est
    //    qu'il en apparaisse un de plus sans que personne ne s'en aperçoive.
    //    `principal` est le seul, et l'ADR 0020 le laisse ouvert en toutes
    //    lettres : sa forme se tranchera AVEC l'émetteur de jetons (ADR 0001),
    //    pas avant — une borne devinée ici serait une borne fausse.
    const ouverts = Object.entries(STATUT_DES_CANAUX_DE_CONTEXTE)
      .filter(([, statut]) => statut.regime === "ouvert-signalé")
      .map(([champ]) => champ);
    const aFermerAuTransport = Object.entries(STATUT_DES_CANAUX_DE_CONTEXTE)
      .filter(([, statut]) => statut.regime === "à-fermer-au-transport")
      .map(([champ]) => champ);

    console.info(
      `[garde canaux ouverts] ${String(Object.keys(STATUT_DES_CANAUX_DE_CONTEXTE).length)} ` +
        `champ(s) inventorié(s) · ${String(ouverts.length)} ouvert(s) signalé(s) : ` +
        `${ouverts.join(", ") || "aucun"} · ${String(aFermerAuTransport.length)} ` +
        `à fermer au transport : ${aFermerAuTransport.join(", ") || "aucun"}`,
    );

    expect(ouverts, "un seul canal reste ouvert, et il est écrit dans l'ADR 0020").toEqual([
      "principal",
    ]);
    expect(
      aFermerAuTransport,
      "et deux règles attendent leur couture dans `core/transport/`",
    ).toEqual(["requestId", "deadline"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE PIÈGE QUE LE RETRAIT OUVRAIT — ADR 0020, garde G2
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0020 — un nom RETIRÉ du `ctx` reste interdit dans un schéma d'entrée", () => {
  /**
   * ═══ CE QUE CETTE GARDE EMPÊCHE, ET IL EST PLUS FIN QU'IL N'Y PARAÎT ═══
   *
   * Le contrôle 7 du § 09 dérive ses noms interdits des propriétés de
   * `ToolContext`. Retirer `idempotencyKey` du type retirait donc le nom de la
   * liste — **et le contrôle serait resté VERT, simplement plus étroit d'un
   * nom.** La décision qui ferme un canal en aurait rouvert un autre, sans
   * qu'aucune couleur ne change. C'est le mode de défaillance le plus coûteux
   * qu'on connaisse : une garde qui RÉTRÉCIT.
   */
  it("refuse toujours `idempotencyKey`, alors que le type ne le porte plus", () => {
    const { texte, chemin } = sourceDesTypes();
    const cles = clesDAutorisationDepuisSource(texte, chemin);
    const proprietesDuType = proprietesDInterface(texte, "ToolContext");

    console.info(
      `[garde noms réservés] ${String(cles.toutes.length)} nom(s) interdit(s) — ` +
        `${String(cles.toolContext.length)} de \`ToolContext\`, ` +
        `${String(cles.habilitations.length)} d'\`Habilitations\`, ` +
        `${String(cles.reservesHorsContexte.length)} réservé(s) hors contexte : ` +
        `${cles.reservesHorsContexte.join(", ")}`,
    );

    // LE FAIT QUI REND LA GARDE NÉCESSAIRE : le nom n'est PLUS dans le type.
    expect(proprietesDuType, "`ToolContext` ne porte plus la clé").not.toContain("idempotencyKey");
    expect(proprietesDuType, "il porte son empreinte").toContain("idempotencyRef");

    // L'ATTENTE : il reste malgré tout refusé dans un schéma d'entrée.
    expect(cles.reservesHorsContexte.length, "le troisième ensemble n'est pas vide").toBe(
      NOMS_RESERVES_HORS_CONTEXTE.length,
    );
    expect(cles.toutes, "et l'union le porte encore").toContain("idempotencyKey");
  });

  it("LÈVE si l'on vide `NOMS_RESERVES_HORS_CONTEXTE` — le plancher-témoin mord", () => {
    // ⚠️ LE TÉMOIN DE CETTE GARDE, ET IL EST FABRIQUÉ. Vider le tableau est
    //    exactement le geste qu'un nettoyage bien intentionné ferait — « ce nom
    //    n'existe plus nulle part, retirons-le » — et c'est le geste qui rouvre
    //    la porte. La dérivation lève plutôt que de rendre une liste plus courte.
    const { texte, chemin } = sourceDesTypes();
    let leve = false;
    let message = "";
    try {
      clesDAutorisationDepuisSource(texte, chemin, []);
    } catch (erreur: unknown) {
      leve = true;
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }

    console.info(
      `[témoin · réserves vidées] a levé : ${String(leve)} · ` +
        `${String(message.length)} caractère(s) de message · ` +
        `dit « rétrécit » : ${String(message.includes("rétrécit"))}`,
    );

    expect(leve, "une liste vide doit LEVER, jamais rendre une garde plus étroite").toBe(true);
    expect(message, "et le message dit ce qui se serait passé").toContain("schéma d'entrée");
  });
});
