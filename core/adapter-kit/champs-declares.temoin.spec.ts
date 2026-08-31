import { describe, expect, it } from "vitest";

import { analyserArgumentsDuSchema, familleDeGouvernance } from "../chaine/etape-11-provenance.js";
import { cumulerChampsDeGouvernance, estValeurLibre } from "./champs-declares.js";
import type { ObjetJson, ValeurJson } from "./json.js";

/**
 * TÉMOINS — LES DEUX ENDROITS OÙ CETTE PAIRE D'ADR PEUT SE DÉFAIRE EN SILENCE.
 *
 * ═══ ① LA SECONDE SOURCE DE VÉRITÉ, MESURÉE PLUTÔT QUE SUPPOSÉE ABSENTE ═══
 *
 * `estValeurLibre()` de `core/adapter-kit/champs-declares.ts` et
 * `estTexteLibre()` de `core/chaine/etape-11-provenance.ts` répondent à LA MÊME
 * question : quels mots-clés de JSON Schema referment l'ensemble des valeurs
 * d'un champ. Deux dérivations d'un même fait finissent par se contredire — et
 * quand elles le font ici, la conséquence est précise : **l'admission dirait
 * « ce champ est fermé, votre `idFields` est effectif » pendant que l'étape 11
 * continuerait de le surveiller**, ou l'inverse, ce qui est pire — l'admission
 * annoncerait « sans effet » un champ que le § 20 tient pour fermé.
 *
 * La réparation est écrite dans l'en-tête du module et hors de ce périmètre :
 * `estTexteLibre()` doit devenir un appel à `estValeurLibre()`. Tant qu'elle
 * n'est pas faite, ce témoin CONFRONTE les deux sur un corpus de formes et
 * annonce combien il en a confrontées. Il rougit le jour où l'une bouge sans
 * l'autre.
 *
 * ⚠️ IL PASSE PAR LA PORTE PUBLIQUE. `estTexteLibre()` n'est pas exportée : on
 *    l'interroge par `analyserArgumentsDuSchema()`, qui la gouverne. Pour un
 *    schéma d'objet fermé à UNE seule propriété, le nom figure dans `libres` si
 *    et seulement si `estTexteLibre()` a rendu vrai. Le témoin mesure donc la
 *    fonction TELLE QUE L'ÉTAPE 11 L'EMPLOIE, ce qui vaut mieux qu'un accès
 *    direct : c'est le comportement servi qui compte, pas la fonction isolée.
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
 * LE CORPUS DE FORMES.
 *
 * Il ne porte AUCUNE attente écrite : ce témoin ne mesure pas « la bonne
 * réponse », il mesure **que les deux modules donnent LA MÊME**. Une attente
 * recopiée ici ferait une troisième source de vérité, et c'est exactement la
 * maladie qu'on surveille.
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
];

/** Ce que l'ÉTAPE 11 conclut d'une forme, vu par sa porte publique. */
function libreSelonEtape11(schema: ObjetJson): boolean {
  const analyse = analyserArgumentsDuSchema(schemaFerme({ champ: schema }), []);
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
    expect(FORMES.length, "plancher-témoin").toBeGreaterThanOrEqual(20);
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
