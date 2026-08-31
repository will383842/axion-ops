import { describe, expect, it } from "vitest";

import { analyserArgumentsDuSchema, familleDeGouvernance } from "../chaine/etape-11-provenance.js";
import {
  cumulerChampsDeGouvernance,
  estValeurLibre,
  FORMATS_CONTRAIGNANTS,
  PROFONDEUR_VALEUR,
  TEMOINS_DE_PROSE,
} from "./champs-declares.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "./types.js";
import type { ObjetJson, ValeurJson } from "./json.js";

/**
 * TÉMOINS — LES DEUX ENDROITS OÙ CETTE PAIRE D'ADR PEUT SE DÉFAIRE EN SILENCE.
 *
 * ═══ ① UNE SEULE ÉCRITURE, ET LA COUTURE QUI LE PROUVE ═══
 *
 * `estValeurLibre()` répond à « quels mots-clés de JSON Schema referment
 * l'ensemble des valeurs d'un champ ». `core/chaine/etape-11-provenance.ts`
 * portait sa propre réponse — `estTexteLibre()` — et deux dérivations d'un même
 * fait finissent par se contredire. Quand elles le font ici, la conséquence est
 * précise : **l'admission dirait « ce champ est fermé, votre `idFields` est
 * effectif » pendant que l'étape 11 continuerait de le surveiller**, ou
 * l'inverse, ce qui est pire — l'admission annoncerait « sans effet » un champ
 * que le § 20 tient pour fermé.
 *
 * ✅ **AU LOT 1d, `estTexteLibre()` A DISPARU** au profit d'un appel à
 *    `estValeurLibre()`. Ce témoin ne mesure donc plus une divergence possible
 *    entre deux écritures : il mesure **la COUTURE** — que le verdict SERVI par
 *    l'étape 11 est bien celui de la fonction du kit, sur 51 formes. Une refonte
 *    qui rebrancherait la branche sur autre chose, ou qui réécrirait une
 *    dérivation locale, ferait diverger au moins une forme.
 *
 * ⚠️ IL PASSE PAR LA PORTE PUBLIQUE, et c'est ce qui en fait une garde de couture
 *    plutôt qu'un test de fonction. On n'appelle pas la fonction dans l'étape 11 :
 *    on interroge `analyserArgumentsDuSchema()`, qui la gouverne. Pour un schéma
 *    d'objet fermé à UNE seule propriété, le nom figure dans `libres` si et
 *    seulement si le juge a rendu vrai. C'est le comportement SERVI qui est
 *    mesuré, jamais la fonction isolée — la panne du lot 1c était précisément
 *    une fonction juste que rien n'appelait.
 *
 * ⚠️ **LA CONFRONTATION NE TROUVE QUE LES FORMES QU'ELLE A NOMMÉES**, et trois
 *    tests gardent désormais le CORPUS lui-même : chaque `format` contraignant
 *    doit être porté par une forme, chaque témoin de prose doit être ISOLÉ par un
 *    motif, et la borne de profondeur doit être encadrée. Les trois dérivent des
 *    constantes exportées : un ajout là-bas fait rougir ici.
 *
 * ═══ ② LE CUMUL, QUI NE PEUT QU'AJOUTER ═══
 *
 * L'ADR 0016 croit une déclaration qui RESSERRE et jamais une qui DESSERRE. Le
 * seul moyen qu'elle desserre serait qu'on REMPLACE le filet par la déclaration
 * au lieu de les unir. Les témoins ci-dessous rejouent les vingt noms mesurés au
 * lot 1b et vérifient que les onze retenus par le nom le RESTENT — y compris
 * face à une déclaration qui essaie de les écarter.
 */

/** Un schéma d'objet FERMÉ, comme `z.object({…}).strict()` en produit un. */
function schemaFerme(proprietes: Record<string, ValeurJson>): ValeurJson {
  return {
    type: "object",
    properties: proprietes,
    additionalProperties: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ① LA CONFRONTATION DES DEUX DÉRIVATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un tableau imbriqué `niveaux` fois, dont la feuille est `feuille`.
 *
 * ⚠️ IL SERT À PINCER LA BORNE DE PROFONDEUR, ET C'EST UNE MESURE QUI MANQUAIT.
 *    Le kit la nomme (`PROFONDEUR_VALEUR`), l'étape 11 l'écrivait en chiffre nu
 *    (`niveau > 4`). Aucune forme du corpus ne descendait au-delà du deuxième
 *    niveau : les deux bornes pouvaient donc s'écarter d'un cran sans qu'un seul
 *    désaccord n'apparaisse. Les formes `profondeur 4` et `profondeur 5`
 *    encadrent le seuil — la première doit être FERMÉE, la seconde LIBRE — et
 *    tout décalage d'un cran, d'un côté ou de l'autre, produit un désaccord.
 */
function tableauImbrique(niveaux: number, feuille: ObjetJson): ObjetJson {
  let schema: ObjetJson = feuille;
  for (let reste = 0; reste < niveaux; reste += 1) schema = { type: "array", items: schema };
  return schema;
}

/**
 * LE CORPUS DE FORMES.
 *
 * Il ne porte AUCUNE attente écrite : ce témoin ne mesure pas « la bonne
 * réponse », il mesure **que les deux modules donnent LA MÊME**. Une attente
 * recopiée ici ferait une troisième source de vérité, et c'est exactement la
 * maladie qu'on surveille.
 *
 * ⚠️ CE QUE LE CORPUS DE DÉPART NE POUVAIT PAS VOIR, ET QUI EST LE MOTIF DE SON
 *    ÉLARGISSEMENT. Une confrontation ne trouve que les formes qu'elle a
 *    NOMMÉES. Trois trous ont été mesurés en le relisant, et chacun rendait une
 *    divergence RÉELLE parfaitement muette :
 *
 *     · `FORMATS_CONTRAIGNANTS` porte SEPT formats ; le corpus n'en éprouvait
 *       que QUATRE. Retirer `date`, `time` ou `ipv6` d'un seul des deux modules
 *       ne changeait la réponse d'aucune forme écrite ;
 *     · `TEMOINS_DE_PROSE` en porte TROIS, et aucune forme ne les distinguait :
 *       tous les `pattern` du corpus rejetaient les trois d'un bloc ou les
 *       acceptaient tous les trois. Un témoin retiré d'un côté était invisible ;
 *     · la borne de profondeur n'était jamais atteinte (voir
 *       {@link tableauImbrique}).
 *
 *    Les formes ajoutées ci-dessous sont choisies pour qu'une seule ligne
 *    modifiée d'un seul côté fasse basculer AU MOINS UNE d'entre elles.
 */
const FORMES: readonly { readonly nom: string; readonly schema: ObjetJson }[] = [
  { nom: "chaîne nue", schema: { type: "string" } },
  { nom: "sans type", schema: { description: "rien" } },
  { nom: "enum", schema: { type: "string", enum: ["a", "b"] } },
  { nom: "const", schema: { type: "string", const: "a" } },
  { nom: "format uuid", schema: { type: "string", format: "uuid" } },
  { nom: "format date-time", schema: { type: "string", format: "date-time" } },
  { nom: "format duration", schema: { type: "string", format: "duration" } },
  { nom: "format ipv4", schema: { type: "string", format: "ipv4" } },
  { nom: "format uri", schema: { type: "string", format: "uri" } },
  { nom: "format email", schema: { type: "string", format: "email" } },
  { nom: "format inventé", schema: { type: "string", format: "texte-long" } },
  { nom: "pattern ancré strict", schema: { type: "string", pattern: "^[0-9]{1,20}$" } },
  { nom: "pattern vacant", schema: { type: "string", pattern: "^[\\s\\S]*$" } },
  { nom: "pattern non ancré", schema: { type: "string", pattern: "[0-9]+" } },
  { nom: "pattern illisible", schema: { type: "string", pattern: "^(?<=x)$[" } },
  { nom: "entier", schema: { type: "integer" } },
  { nom: "booléen", schema: { type: "boolean" } },
  { nom: "tableau de chaînes", schema: { type: "array", items: { type: "string" } } },
  { nom: "tableau d'enum", schema: { type: "array", items: { type: "string", enum: ["a"] } } },
  { nom: "tableau sans items", schema: { type: "array" } },
  { nom: "objet nu", schema: { type: "object" } },
  {
    nom: "objet fourre-tout",
    schema: { type: "object", additionalProperties: { type: "string" } },
  },
  {
    nom: "objet fermé déclarant",
    schema: { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
  },
  { nom: "type en liste", schema: { type: ["string", "null"] } },

  // ── LES TROIS FORMATS CONTRAIGNANTS QUE LE CORPUS N'ÉPROUVAIT PAS ─────────
  { nom: "format date", schema: { type: "string", format: "date" } },
  { nom: "format time", schema: { type: "string", format: "time" } },
  { nom: "format ipv6", schema: { type: "string", format: "ipv6" } },
  // ── ET DES FORMATS STANDARD QUI NE CONTRAIGNENT RIEN ──────────────────────
  { nom: "format hostname", schema: { type: "string", format: "hostname" } },
  { nom: "format regex", schema: { type: "string", format: "regex" } },
  { nom: "format json-pointer", schema: { type: "string", format: "json-pointer" } },

  // ── LES TROIS TÉMOINS DE PROSE, ISOLÉS UN À UN ────────────────────────────
  //
  // ⚠️ CHAQUE MOTIF N'EN LAISSE PASSER QU'UN SEUL, et c'est ce qui les rend
  //    utiles : `patternReferme()` exige que les TROIS soient rejetés. Chacune
  //    de ces trois formes est donc LIBRE aujourd'hui — et deviendrait FERMÉE
  //    si le témoin qu'elle laisse passer disparaissait de la liste d'un seul
  //    des deux modules. Un corpus dont tous les motifs rejettent les trois d'un
  //    bloc ne distingue jamais une liste amputée d'une liste entière.
  {
    nom: "pattern qui laisse passer la seule URL de collecte",
    schema: { type: "string", pattern: "^[A-Za-z0-9:/?.=&_-]+$" },
  },
  {
    nom: "pattern qui laisse passer la seule phrase ordinaire",
    schema: { type: "string", pattern: "^[a-zç, ]+$" },
  },
  {
    nom: "pattern qui laisse passer la seule consigne injectée",
    schema: { type: "string", pattern: "^[A-Za-zéèàçû '.]+$" },
  },

  // ── LA BORNE DE PROFONDEUR, ENCADRÉE ──────────────────────────────────────
  { nom: "profondeur 3 (feuille entière)", schema: tableauImbrique(3, { type: "integer" }) },
  { nom: "profondeur 4 (feuille entière)", schema: tableauImbrique(4, { type: "integer" }) },
  { nom: "profondeur 5 (feuille entière)", schema: tableauImbrique(5, { type: "integer" }) },
  { nom: "profondeur 6 (feuille entière)", schema: tableauImbrique(6, { type: "integer" }) },

  // ── LES BORDS DE CHAQUE TEST, PRIS UN PAR UN ──────────────────────────────
  // `enum` VIDE : présent, donc referme. Un test écrit sur la vérité plutôt que
  // sur `!== undefined` rendrait « libre » ici, et sur ce cas-là seulement.
  { nom: "enum vide", schema: { enum: [] } },
  // `const: null` : même piège, en pire — `null` est faux en JavaScript.
  { nom: "const null", schema: { const: null } },
  { nom: "schéma vide", schema: {} },
  // `pattern` VIDE : la garde `motif.length > 0` est ce qui l'empêche d'être lu
  // comme un motif ancré. Sans elle, `"".startsWith("^")` est faux → libre aussi,
  // mais par un autre chemin ; la forme reste utile pour tenir les deux d'accord.
  { nom: "pattern vide", schema: { type: "string", pattern: "" } },
  { nom: "type null", schema: { type: "null" } },
  { nom: "nombre", schema: { type: "number" } },
  { nom: "type en liste objet+chaîne", schema: { type: ["object", "string"] } },
  {
    nom: "objet à patternProperties",
    schema: { type: "object", patternProperties: { "^x-": { type: "string" } } },
  },
  {
    nom: "objet fourre-tout par unevaluatedProperties",
    schema: { type: "object", unevaluatedProperties: { type: "string" } },
  },
  {
    nom: "objet fermé par unevaluatedProperties",
    schema: {
      type: "object",
      properties: { a: { type: "string" } },
      unevaluatedProperties: false,
    },
  },
  { nom: "tableau à items booléen", schema: { type: "array", items: true } },
  { nom: "tableau d'objets nus", schema: { type: "array", items: { type: "object" } } },
  { nom: "tableau d'entiers", schema: { type: "array", items: { type: "integer" } } },
  // Le `format` est lu AVANT le `pattern` : la forme tient l'ordre des deux tests.
  {
    nom: "format contraignant ET pattern non ancré",
    schema: { type: "string", format: "uuid", pattern: "[0-9]+" },
  },
];

/** Ce que l'ÉTAPE 11 conclut d'une forme, vu par sa porte publique. */
function libreSelonEtape11(schema: ObjetJson): boolean {
  const analyse = analyserArgumentsDuSchema(
    schemaFerme({ champ: schema }),
    AUCUN_CHAMP_DE_GOUVERNANCE,
  );
  return analyse.libres.some((champ) => champ.nom === "champ");
}

describe("TÉMOIN — les deux dérivations de « ce schéma referme la valeur » s'accordent", () => {
  it("confronte le kit et l'étape 11 sur chaque forme, et ANNONCE le compte", () => {
    const desaccords: string[] = [];
    let libresKit = 0;

    for (const forme of FORMES) {
      const kit = estValeurLibre(forme.schema);
      const chaine = libreSelonEtape11(forme.schema);
      if (kit) libresKit += 1;
      if (kit !== chaine) {
        desaccords.push(`${forme.nom} (kit : ${String(kit)}, étape 11 : ${String(chaine)})`);
      }
    }

    console.log(
      `[témoin double dérivation] ${String(FORMES.length)} forme(s) confrontée(s) · ` +
        `${String(libresKit)} jugée(s) LIBRE(s) par le kit · ` +
        `${String(FORMES.length - libresKit)} FERMÉE(s) · ` +
        `${String(desaccords.length)} désaccord(s)` +
        (desaccords.length > 0 ? ` : ${desaccords.join(" | ")}` : ""),
    );

    // Plancher-témoin : un corpus vidé ne rend pas cette garde verte.
    expect(FORMES.length, "plancher-témoin").toBeGreaterThanOrEqual(45);
    // ET la confrontation doit trancher DES DEUX CÔTÉS : un corpus qui ne
    // porterait que des formes libres s'accorderait pour une mauvaise raison.
    expect(libresKit, "des formes libres").toBeGreaterThanOrEqual(5);
    expect(FORMES.length - libresKit, "des formes fermées").toBeGreaterThanOrEqual(5);

    expect(
      desaccords,
      "les deux dérivations de « ce schéma referme la valeur » ont divergé — voir " +
        "l'en-tête de `core/adapter-kit/champs-declares.ts`",
    ).toEqual([]);
  });

  /**
   * ⚠️ CE TEST GARDE LE CORPUS, PAS LA FONCTION — et c'est le manque qui rendait
   *    la confrontation ci-dessus structurellement aveugle. Une campagne ne
   *    trouve que les formes qu'elle a NOMMÉES : le jour où un format entre dans
   *    `FORMATS_CONTRAIGNANTS`, aucune forme du corpus ne le porte, et la
   *    confrontation reste verte en ne l'ayant jamais éprouvé.
   *
   *    La liste attendue n'est donc PAS recopiée : elle est LUE dans la constante
   *    exportée. Un format ajouté fait rougir ici — « ton corpus ne l'éprouve
   *    pas » — au lieu de s'installer dans un angle mort.
   */
  it("le corpus ÉPROUVE chacun des formats contraignants, et ANNONCE la couverture", () => {
    const portesParLeCorpus = new Set(
      FORMES.map((forme) => forme.schema["format"]).filter(
        (format): format is string => typeof format === "string",
      ),
    );
    const jamaisEprouves = [...FORMATS_CONTRAIGNANTS].filter(
      (format) => !portesParLeCorpus.has(format),
    );

    console.log(
      `[témoin couverture des formats] ${String(FORMATS_CONTRAIGNANTS.size)} format(s) ` +
        `contraignant(s) déclaré(s) · ${String(portesParLeCorpus.size)} format(s) porté(s) par le ` +
        `corpus · ${String(jamaisEprouves.length)} jamais éprouvé(s)` +
        (jamaisEprouves.length > 0 ? ` : ${jamaisEprouves.join(", ")}` : ""),
    );

    expect(FORMATS_CONTRAIGNANTS.size, "plancher — la liste ne doit pas être vide").toBeGreaterThan(
      0,
    );
    expect(
      jamaisEprouves,
      "un format contraignant qu'aucune forme du corpus ne porte : une divergence sur " +
        "celui-là serait MUETTE — ajouter une forme qui le porte",
    ).toEqual([]);
  });

  /**
   * ⚠️ LE MÊME MANQUE, SUR LES TÉMOINS DE PROSE. `patternReferme()` exige que les
   *    TROIS soient rejetés : un corpus dont tous les motifs les rejettent en bloc
   *    ne distingue pas une liste de trois d'une liste de deux. Il faut, pour
   *    chaque témoin, un motif qui ne laisse passer QUE lui — retirer ce témoin
   *    d'un seul côté fait alors basculer cette forme-là, et le désaccord se voit.
   */
  it("le corpus ISOLE chacun des témoins de prose, et ANNONCE lesquels", () => {
    const motifs = FORMES.map((forme) => forme.schema["pattern"]).filter(
      (motif): motif is string => typeof motif === "string" && motif.length > 0,
    );

    const nonIsoles: string[] = [];
    for (const temoin of TEMOINS_DE_PROSE) {
      const autres = TEMOINS_DE_PROSE.filter((candidat) => candidat !== temoin);
      const isole = motifs.some((motif) => {
        let regex: RegExp;
        try {
          regex = new RegExp(motif, "u");
        } catch {
          return false;
        }
        return regex.test(temoin) && autres.every((candidat) => !regex.test(candidat));
      });
      if (!isole) nonIsoles.push(temoin.slice(0, 40));
    }

    console.log(
      `[témoin isolement des prose] ${String(TEMOINS_DE_PROSE.length)} témoin(s) de prose · ` +
        `${String(motifs.length)} motif(s) dans le corpus · ` +
        `${String(TEMOINS_DE_PROSE.length - nonIsoles.length)} isolé(s) · ` +
        `${String(nonIsoles.length)} non isolé(s)` +
        (nonIsoles.length > 0 ? ` : ${nonIsoles.join(" | ")}` : ""),
    );

    expect(TEMOINS_DE_PROSE.length, "plancher — la liste ne doit pas être vide").toBeGreaterThan(0);
    expect(motifs.length, "plancher — le corpus doit porter des motifs").toBeGreaterThanOrEqual(6);
    expect(
      nonIsoles,
      "un témoin de prose qu'aucun motif du corpus ne distingue des autres : son retrait " +
        "d'un seul des deux modules serait MUET",
    ).toEqual([]);
  });

  /**
   * ⚠️ LA BORNE DE PROFONDEUR, PINCÉE DEPUIS LA CONSTANTE EXPORTÉE ET NON DEPUIS
   *    UN CHIFFRE. Le kit la NOMME (`PROFONDEUR_VALEUR`) ; l'étape 11 l'écrivait
   *    en chiffre nu. Deux bornes décalées d'un cran donnaient exactement le même
   *    verdict sur toutes les formes peu profondes — c'est-à-dire sur tout le
   *    corpus d'origine.
   *
   *    Les deux schémas sont construits À PARTIR de la constante : un changement
   *    de borne déplace le couple avec elle, et ce qui est éprouvé reste « le cran
   *    juste en dessous » et « le cran juste au-dessus », quelle que soit sa
   *    valeur.
   */
  it("les deux modules placent la borne de profondeur au MÊME cran", () => {
    const sousLaBorne = tableauImbrique(PROFONDEUR_VALEUR, { type: "integer" });
    const auDela = tableauImbrique(PROFONDEUR_VALEUR + 1, { type: "integer" });

    const mesures = {
      kitSousLaBorne: estValeurLibre(sousLaBorne),
      etape11SousLaBorne: libreSelonEtape11(sousLaBorne),
      kitAuDela: estValeurLibre(auDela),
      etape11AuDela: libreSelonEtape11(auDela),
    };

    console.log(
      `[témoin borne de profondeur] PROFONDEUR_VALEUR = ${String(PROFONDEUR_VALEUR)} · ` +
        `au cran ${String(PROFONDEUR_VALEUR)} — kit : ${String(mesures.kitSousLaBorne)}, ` +
        `étape 11 : ${String(mesures.etape11SousLaBorne)} · ` +
        `au cran ${String(PROFONDEUR_VALEUR + 1)} — kit : ${String(mesures.kitAuDela)}, ` +
        `étape 11 : ${String(mesures.etape11AuDela)}`,
    );

    // ① La borne EXISTE : les deux crans ne donnent pas le même verdict. Sans
    //    cela, ce test serait vert sur une fonction qui aurait perdu sa borne.
    expect(
      mesures.kitSousLaBorne,
      "la borne doit trancher : le cran du dessous et celui du dessus doivent différer",
    ).not.toBe(mesures.kitAuDela);
    // ② Et elle est AU MÊME CRAN des deux côtés.
    expect(mesures.etape11SousLaBorne, "sous la borne").toBe(mesures.kitSousLaBorne);
    expect(mesures.etape11AuDela, "au-delà de la borne").toBe(mesures.kitAuDela);
    // ③ Fail-closed : au-delà, on ne sait pas conclure, donc on surveille.
    expect(mesures.kitAuDela, "au-delà de la borne, fail-closed : réputé LIBRE").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ② LE CUMUL — sur les vingt noms mesurés au lot 1b
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LES VINGT NOMS DU LOT 1b, REJOUÉS.
 *
 * ⚠️ CE QUI EST RECOPIÉ ET CE QUI NE L'EST PAS. Cette liste est une DONNÉE — un
 *    corpus de graphies ordinaires — et elle est rejouée depuis le témoin
 *    `core/epreuve/exfiltration-par-les-arguments.temoin.spec.ts`. Ce qui n'est
 *    PAS recopié, et qui est tout l'enjeu, c'est le PARTAGE entre retenus et
 *    échappés : il est DÉRIVÉ à l'exécution en appelant `familleDeGouvernance()`
 *    elle-même. Le jour où le filet change, ce témoin suit sans être retouché —
 *    alors qu'une liste d'attendus figée mesurerait l'ancien filet.
 *
 * ⚠️ ÉCART SIGNALÉ : le corpus vit à deux endroits. Le refermer demanderait de
 *    l'exporter depuis une fixture commune, ce qui n'est pas ce périmètre.
 */
const NOMS_DE_GOUVERNANCE: readonly string[] = [
  "to",
  "recipients",
  "destinataire",
  "mailTo",
  "emailTo",
  "adresseDeReponse",
  "envoyerA",
  "ttl",
  "expiresAt",
  "validUntil",
  "maxAge",
  "slot",
  "slotStart",
  "startAt",
  "dateDebut",
  "scheduledFor",
  "policyLevel",
  "enabled",
  "profil",
  "toolset",
];

/** Le partage retenus / échappés, DÉRIVÉ du filet réel. */
function partagerParLeFilet(): { retenus: readonly string[]; echappes: readonly string[] } {
  const retenus: string[] = [];
  const echappes: string[] = [];
  for (const nom of NOMS_DE_GOUVERNANCE) {
    if (familleDeGouvernance(nom) === null) echappes.push(nom);
    else retenus.push(nom);
  }
  return { retenus, echappes };
}

describe("TÉMOIN ADR 0016 — le cumul ne retire rien, et la déclaration ferme les échappés", () => {
  it("G1 — les noms retenus PAR LE NOM le restent quand la déclaration est vide", () => {
    const { retenus, echappes } = partagerParLeFilet();
    const cumul = cumulerChampsDeGouvernance(retenus, []);

    console.log(
      `[témoin G1 · cumul] ${String(NOMS_DE_GOUVERNANCE.length)} nom(s) confronté(s) · ` +
        `${String(retenus.length)} retenu(s) par le nom · ` +
        `${String(echappes.length)} échappé(s) · ` +
        `0 retenu(s) par déclaration · ${String(cumul.union.length)} dans l'union · ` +
        `${String(cumul.perdus.length)} perdu(s)`,
    );

    expect(NOMS_DE_GOUVERNANCE.length, "plancher-témoin").toBeGreaterThanOrEqual(20);
    // Le filet MORD encore : un filet devenu muet rendrait `retenus` vide, et
    // l'union serait vide elle aussi — verte pour n'avoir rien retenu.
    expect(retenus.length, "le filet doit encore mordre").toBeGreaterThanOrEqual(1);
    expect(cumul.union).toEqual(retenus);
    expect(cumul.perdus).toEqual([]);
  });

  it("G2 — déclarer les échappés les FERME : zéro échappé après l'union", () => {
    const { retenus, echappes } = partagerParLeFilet();
    const cumul = cumulerChampsDeGouvernance(retenus, echappes);
    const echappesApres = NOMS_DE_GOUVERNANCE.filter((nom) => !cumul.union.includes(nom));

    console.log(
      `[témoin G2 · déclaration] ${String(echappes.length)} échappé(s) AVANT · ` +
        `${String(cumul.ajoutesParLaDeclaration.length)} ajouté(s) par la déclaration · ` +
        `${String(echappesApres.length)} échappé(s) APRÈS`,
    );

    expect(cumul.ajoutesParLaDeclaration).toEqual([...echappes]);
    expect(echappesApres).toEqual([]);
    expect(cumul.union.length).toBe(NOMS_DE_GOUVERNANCE.length);
  });

  it("G1 bis — une déclaration qui ESSAIE DE RETIRER n'y parvient pas", () => {
    // ⚠️ LE TÉMOIN QUE L'ADR 0016 DEMANDE NOMMÉMENT. Un adaptateur hostile — ou
    //    simplement distrait — déclare « mes seuls champs de gouvernance sont
    //    ceux-ci », en omettant ceux que le filet retenait. C'est une tentative
    //    de RETRAIT, et c'est la seule chose que le socle ne doit jamais croire.
    const { retenus, echappes } = partagerParLeFilet();
    const declarationQuiRetire = echappes.slice(0, 1);
    const cumul = cumulerChampsDeGouvernance(retenus, declarationQuiRetire);

    const rescapes = retenus.filter((nom) => cumul.union.includes(nom));

    console.log(
      `[témoin retrait] déclaration : ${declarationQuiRetire.join(", ") || "(vide)"} · ` +
        `${String(retenus.length)} retenu(s) par le nom · ` +
        `${String(rescapes.length)} encore dans l'union · ` +
        `${String(cumul.perdus.length)} perdu(s)`,
    );

    expect(rescapes).toEqual(retenus);
    expect(
      cumul.perdus,
      "une déclaration a retiré un champ de la surveillance — l'union a été remplacée " +
        "par la déclaration (ADR 0016)",
    ).toEqual([]);
  });

  it("le filet et la déclaration sont bien DEUX sources — leurs comptes ne se confondent pas", () => {
    const { retenus, echappes } = partagerParLeFilet();

    console.log(
      `[témoin deux sources] filet : ${retenus.length ? retenus.join(", ") : "(aucun)"} · ` +
        `hors filet : ${echappes.length ? echappes.join(", ") : "(aucun)"}`,
    );

    // Le corpus doit contenir des noms des DEUX côtés, sans quoi les témoins
    // ci-dessus s'accorderaient sur un ensemble vide.
    expect(retenus.length, "des noms que le filet retient").toBeGreaterThanOrEqual(1);
    expect(
      echappes.length,
      "des noms que le filet laisse passer — c'est ce que la déclaration existe pour fermer",
    ).toBeGreaterThanOrEqual(1);
    expect(retenus.length + echappes.length).toBe(NOMS_DE_GOUVERNANCE.length);
  });
});
