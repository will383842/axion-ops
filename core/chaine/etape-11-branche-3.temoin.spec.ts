import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { BORNE_DE_FERMETURE } from "../adapter-kit/capacite.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";
import type { PolicyLevel } from "../types.js";
import {
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
} from "./etape-11-provenance.js";

/**
 * TÉMOIN — **LA BRANCHE 3 DE L'ÉTAPE 11, ET CE QU'ELLE LAISSE PASSER.**
 *
 * ═══ CE QUE CE FICHIER MESURE, ET POURQUOI IL NE CORRIGE RIEN ═══
 *
 * L'audit de bout en bout a retenu deux constats qui sont **le même mécanisme vu
 * de deux étages** :
 *
 *  · côté kit — un `pattern` cosmétique achetait la fermeture d'un champ capable
 *    de porter 2 000 caractères de prose. **C'est fermé** : l'ADR 0035 fait
 *    reposer la fermeture sur la CAPACITÉ, et la garde
 *    `core/adapter-kit/champs-declares.temoin.spec.ts` rougit sur le
 *    contournement exact.
 *  · côté chaîne — un destinataire **réellement** refermé (un `pattern`
 *    d'adresse courriel ancré, 60 caractères) dont le NOM échappe aux cinq
 *    familles du filet n'est ni « libre » ni « gouvernance » : la branche 3
 *    autorise, `confirmationExigee: false`. **Celui-là reste OUVERT**, et
 *    l'ADR 0035 l'écrit noir sur blanc dans sa section « ce que cette décision
 *    NE COUVRE PAS ».
 *
 * ⚠️ **CE FICHIER NE FERME PAS LE SECOND — IL LE REND NON SILENCIEUX.** Le
 *    correctif décidé (obligation de `governanceFields` sur les effets `send` et
 *    `destructive` à l'admission, plus un cliquet à l'étape 11) exige que
 *    `ContexteProvenance` porte l'`effect` de l'outil et le compte de propriétés
 *    inspectées. Ces deux champs vivent dans `core/chaine/etapes.ts` et se
 *    remplissent dans l'orchestrateur — **hors du périmètre de ce lot**. Écrire
 *    le cliquet sans eux reviendrait à exiger une confirmation sur les lectures,
 *    c'est-à-dire à décider seul une règle que le § 20 n'a pas écrite.
 *
 * ⚠️ **UN DÉFAUT MESURÉ ET CHIFFRÉ N'EST PLUS UN DÉFAUT SILENCIEUX.** Ce qui a
 *    laissé celui-ci vivre n'est pas qu'il soit difficile : c'est qu'aucune
 *    garde ne le CHIFFRAIT. La dette est donc portée par un `it.fails` NOMMÉ —
 *    il rougira le jour où le cliquet atterrira, et forcera la mise à jour de ce
 *    fichier au lieu de le laisser mentir.
 */

const DOMAINE_LU = "zoho-mail";
const DOMAINE_APPELE = "crm-pro";

/**
 * UN `pattern` D'ADRESSE COURRIEL RÉELLEMENT FERMANT APRÈS L'ADR 0035.
 *
 * 32 + 1 + 20 + 1 + 6 = **60 caractères** de capacité maximale, donc sous
 * {@link BORNE_DE_FERMETURE}. Ce n'est PAS le motif cosmétique de l'audit : il
 * referme pour de bon, et c'est précisément ce qui rend ce second constat
 * distinct du premier.
 */
const MOTIF_COURRIEL = "^[a-z0-9._%+-]{1,32}@[a-z0-9.-]{1,20}\\.[a-z]{2,6}$";

/**
 * LES TROIS MOTS-CLÉS QUI REFERMENT UN CHAMP TEXTUEL APRÈS L'ADR 0035.
 *
 * Ils sont confrontés TOUS LES TROIS parce que la branche 3 ne se déclenche pas
 * sur un mot-clé mais sur son EFFET : un corpus qui n'éprouverait que le
 * `pattern` laisserait croire que `maxLength` — le chemin le plus court, et le
 * seul que JSON Schema valide réellement — n'y mène pas.
 */
const FERMETURES: readonly {
  readonly nom: string;
  readonly sousSchema: Record<string, unknown>;
}[] = [
  { nom: "pattern courriel ancré", sousSchema: { type: "string", pattern: MOTIF_COURRIEL } },
  { nom: "maxLength à la borne", sousSchema: { type: "string", maxLength: BORNE_DE_FERMETURE } },
  { nom: "format uuid", sousSchema: { type: "string", format: "uuid" } },
];

/**
 * SIX NOMS DE DESTINATAIRE — trois que le filet du § 20 reconnaît, trois qu'il
 * laisse passer. Le partage n'est PAS écrit ici : il est DÉRIVÉ de
 * {@link familleDeGouvernance}, si bien qu'un motif ajouté au filet déplace la
 * frontière et fait bouger les comptes annoncés au lieu de laisser ce corpus
 * raconter une frontière périmée.
 */
const NOMS_DE_DESTINATAIRE: readonly string[] = [
  "to",
  "destinataireDuMessage",
  "recipients",
  "emailTo",
  "adresseDeReponse",
  "cible",
];

/** Un schéma d'objet FERMÉ (§ 09) portant une seule propriété. */
function schemaFerme(nom: string, sousSchema: Record<string, unknown>): unknown {
  return {
    type: "object",
    additionalProperties: false,
    properties: { [nom]: sousSchema },
  };
}

/** Une session qui a LU chez un autre domaine, puis un appel vers `crm-pro`. */
function verdictSurSessionMarquee(
  schema: unknown,
  niveau: PolicyLevel,
): { readonly issue: string; readonly confirmationExigee: boolean | null } {
  const session: SessionId = sessionIdDeTemoin();
  const index = new IndexProvenanceMemoire();
  marquerResultat(index, {
    sessionId: session,
    adapterId: DOMAINE_LU,
    dataClass: "personal",
    empreintes: ["une empreinte de contenu personnel lu"],
  });

  const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
  const verdict = etape11Provenance({
    sessionId: session,
    adapterId: DOMAINE_APPELE,
    porteUnArgumentLibre: analyse.porteUnArgumentLibre,
    porteUnArgumentDeGouvernance: analyse.porteUnArgumentDeGouvernance,
    niveau,
    index,
  });

  return {
    issue: verdict.issue,
    confirmationExigee: verdict.issue === "autorise" ? verdict.etabli.confirmationExigee : null,
  };
}

describe("§ 20 · la branche 3 de l'étape 11 — ce qu'un champ FERMÉ fait franchir", () => {
  /**
   * ⚠️ **LE CONTRASTE EST LA MOITIÉ DE LA MESURE.** Sans lui, « ces champs
   *    franchissent » se lirait comme « l'étape 11 ne refuse rien » — alors
   *    qu'elle refuse très bien le MÊME champ dès qu'il est laissé libre.
   */
  it("le MÊME champ laissé LIBRE ne franchit pas — la garde de provenance mord bien", () => {
    const franchis: string[] = [];
    for (const nom of NOMS_DE_DESTINATAIRE) {
      const schema = schemaFerme(nom, { type: "string" });
      const { issue, confirmationExigee } = verdictSurSessionMarquee(schema, "libre");
      if (issue === "autorise" && confirmationExigee === false) franchis.push(nom);
    }

    console.log(
      `[branche 3 · contraste] ${String(NOMS_DE_DESTINATAIRE.length)} nom(s) confronté(s), ` +
        `sous-schéma \`{ type: "string" }\` · ${String(franchis.length)} franchi(s) sans ` +
        `confirmation : ${franchis.join(", ") || "aucun"}`,
    );

    expect(
      franchis,
      "un champ LIBRE vers un autre domaine sur session marquée doit être refusé ou confirmé",
    ).toEqual([]);
  });

  /**
   * ⚠️ **LA BORNE DU FILET, CHIFFRÉE — ET ELLE EST DÉRIVÉE.** Ce qui décide
   *    n'est pas une liste écrite ici : c'est {@link familleDeGouvernance}. Un
   *    motif ajouté au § 20 déplace la frontière, et les deux comptes annoncés
   *    bougent avec elle.
   */
  it("un destinataire FERMÉ franchit dès que son nom échappe au filet — le compte", () => {
    const retenusParLeFilet = NOMS_DE_DESTINATAIRE.filter(
      (nom) => familleDeGouvernance(nom) !== null,
    );
    const echappes = NOMS_DE_DESTINATAIRE.filter((nom) => familleDeGouvernance(nom) === null);

    const franchis: string[] = [];
    const gardes: string[] = [];
    let confrontes = 0;

    for (const fermeture of FERMETURES) {
      for (const nom of NOMS_DE_DESTINATAIRE) {
        confrontes += 1;
        const schema = schemaFerme(nom, fermeture.sousSchema);
        const { issue, confirmationExigee } = verdictSurSessionMarquee(schema, "libre");
        const etiquette = `${nom} @ ${fermeture.nom}`;
        if (issue === "autorise" && confirmationExigee === false) franchis.push(etiquette);
        else gardes.push(etiquette);
      }
    }

    console.log(
      `[branche 3 · borne du filet] ${String(confrontes)} forme(s) confrontée(s) ` +
        `(${String(NOMS_DE_DESTINATAIRE.length)} nom(s) × ${String(FERMETURES.length)} ` +
        `fermeture(s)) · ${String(retenusParLeFilet.length)} nom(s) retenu(s) par le filet ` +
        `[${retenusParLeFilet.join(", ")}] · ${String(echappes.length)} échappé(s) ` +
        `[${echappes.join(", ")}] · ${String(franchis.length)} forme(s) FRANCHIE(s) sans ` +
        `confirmation · ${String(gardes.length)} gardée(s)`,
    );

    // Plancher-témoin : le corpus porte bien les deux côtés de la frontière.
    expect(retenusParLeFilet.length, "des noms que le filet retient").toBeGreaterThanOrEqual(1);
    expect(echappes.length, "des noms que le filet laisse passer").toBeGreaterThanOrEqual(1);
    expect(confrontes).toBe(NOMS_DE_DESTINATAIRE.length * FERMETURES.length);

    // ⚠️ CE QUI EST FIGÉ ICI EST L'ÉTAT MESURÉ D'AUJOURD'HUI, PAS UNE RÈGLE
    //    SOUHAITÉE. Chaque échappé franchit avec CHACUNE des trois fermetures —
    //    et rien d'autre ne franchit. Le jour où le cliquet atterrira, ce compte
    //    tombera à zéro et cette assertion rougira : c'est ce qui empêchera la
    //    prose de ce fichier de survivre à sa propre correction.
    expect(franchis.length, "l'état mesuré de la branche 3, chiffré").toBe(
      echappes.length * FERMETURES.length,
    );
    for (const nom of retenusParLeFilet) {
      expect(
        franchis.some((etiquette) => etiquette.startsWith(`${nom} @`)),
        `${nom} est retenu par le filet : il ne doit franchir avec aucune fermeture`,
      ).toBe(false);
    }
  });

  /**
   * 🔴 **DETTE NOMMÉE — LE CLIQUET DE L'ÉTAPE 11 N'EXISTE PAS.**
   *
   * Ce test dit ce que le socle DEVRAIT faire, et il est déclaré `it.fails`
   * parce qu'il ne le fait pas. Il n'est pas une garde verte pour une mauvaise
   * raison : il est la dette, écrite là où elle se paiera.
   *
   * **Ce qu'il faudra pour le rendre vert, et que ce lot n'avait pas le droit
   * d'écrire :** `ContexteProvenance` (`core/chaine/etapes.ts`) doit porter
   * l'`effect` de l'outil et le nombre de propriétés inspectées, et
   * l'orchestrateur doit les remplir. Le cliquet lit alors : effet extérieur,
   * `porteUnArgumentLibre === false`, `porteUnArgumentDeGouvernance === false`,
   * `proprietesInspectees > 0` → replier sur `confirmationExigee: true`.
   *
   * ⚠️ **ET IL NE SUFFIT PAS.** Sa moitié amont est l'obligation de
   *    `governanceFields` sur les effets `send` et `destructive` à l'admission
   *    (`core/registry/enregistrer.ts`) : sans elle, le cliquet transforme un
   *    laissez-passer en confirmation, là où le § 20 veut un REFUS pour un
   *    destinataire.
   */
  it.fails("🔴 DETTE — un destinataire FERMÉ et hors filet devrait exiger une confirmation", () => {
    const echappes = NOMS_DE_DESTINATAIRE.filter((nom) => familleDeGouvernance(nom) === null);
    const sansConfirmation: string[] = [];

    for (const nom of echappes) {
      const schema = schemaFerme(nom, { type: "string", pattern: MOTIF_COURRIEL });
      const { issue, confirmationExigee } = verdictSurSessionMarquee(schema, "libre");
      if (issue === "autorise" && confirmationExigee === false) sansConfirmation.push(nom);
    }

    console.log(
      `[branche 3 · dette] ${String(echappes.length)} échappé(s) fermé(s) par un motif ` +
        `courriel · ${String(sansConfirmation.length)} autorisé(s) SANS confirmation : ` +
        `${sansConfirmation.join(", ") || "aucun"}`,
    );

    expect(sansConfirmation).toEqual([]);
  });

  /**
   * ⚠️ **UN TROISIÈME CHEMIN VERS LA BRANCHE 3, ET IL EST PIRE : ZÉRO PROPRIÉTÉ
   *    INSPECTÉE.** `AnalyseArguments` écrit dans sa propre prose que « sans les
   *    comptes, une dérivation qui n'aurait inspecté AUCUNE propriété rendrait
   *    `false, false` — c'est-à-dire "appel inoffensif" — et l'étape 11
   *    laisserait tout passer ». Les comptes SONT rendus ; **personne ne les
   *    lit.** Le danger est nommé dans le module et gardé nulle part.
   *
   * ⚠️ CE TEST NE LE CORRIGE PAS NON PLUS — il le CHIFFRE. Le repli fail-closed
   *    (`proprietesInspectees === 0` ⇒ `porteUnArgumentLibre = true`) est le même
   *    geste que pour `schemaIllisible` et `profondeurDepassee`, mais il change
   *    le verdict SERVI de tout appel dont le schéma ne déclare rien : c'est une
   *    décision, elle veut son ADR et son entrée au registre.
   */
  it("un schéma SANS aucune propriété passe pour inoffensif — mesuré, et pas gardé", () => {
    const SANS_PROPRIETE: readonly { readonly nom: string; readonly schema: unknown }[] = [
      {
        nom: "objet fermé sans `properties`",
        schema: { type: "object", additionalProperties: false },
      },
      { nom: "schéma vide", schema: {} },
      { nom: "objet fourre-tout", schema: { type: "object", additionalProperties: true } },
    ];

    const franchis: string[] = [];
    for (const cas of SANS_PROPRIETE) {
      const analyse = analyserArgumentsDuSchema(cas.schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      const { issue, confirmationExigee } = verdictSurSessionMarquee(cas.schema, "libre");
      if (
        analyse.proprietesInspectees === 0 &&
        issue === "autorise" &&
        confirmationExigee === false
      ) {
        franchis.push(cas.nom);
      }
    }

    console.log(
      `[branche 3 · zéro propriété] ${String(SANS_PROPRIETE.length)} forme(s) confrontée(s) · ` +
        `${String(franchis.length)} franchie(s) avec ZÉRO propriété inspectée : ` +
        `${franchis.join(", ") || "aucune"}`,
    );

    // L'état mesuré, figé : les trois franchissent. Le repli fail-closed fera
    // rougir cette ligne, et c'est exactement ce qu'on lui demande.
    expect(franchis.length, "l'état mesuré du chemin « zéro propriété », chiffré").toBe(
      SANS_PROPRIETE.length,
    );
  });
});
