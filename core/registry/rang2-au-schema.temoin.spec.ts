/**
 * TÉMOIN ADVERSAIRE — § 13.3 : UN CHAMP DE RANG 2 OBLIGATOIRE AU SCHÉMA DE
 * SORTIE (ADR 0036, décision 6).
 *
 * ═══ LE DÉFAUT QUE CE FICHIER FERME ═══
 *
 * Le § 13.3 pose que tout champ de `compaction.tier2` est OPTIONNEL au schéma
 * `output` : au deuxième palier de la cascade, le socle RETIRE ce champ, et une
 * charge compactée dont le schéma publié l'exigeait ne valide plus ce schéma.
 *
 * La règle n'était tenue que **du côté BUILD** — `analyserDefinition()`,
 * contrôle C13.3. Or c'est le mode FÉDÉRÉ qu'elle vise, et un manifeste fédéré
 * est produit AILLEURS : le CRM en PHP, dépôt public à jamais (§ 29).
 * `core/registry/enregistrer.ts` se déclare lui-même « la SEULE barrière
 * statique » pour ce document-là — et il ne portait pas la règle. Rien ne
 * rattrapait en aval : `outputSchema` n'est validé à aucun moment du runtime, et
 * `core/chaine/etape-14-execution.ts` l'écrit lui-même — « ici on retire, on ne
 * revalide pas ».
 *
 * ⚠️ LES DEUX MESURES SONT APPARIÉES DANS CE FICHIER. Un témoin qui ne
 *    montrerait que le refus de l'admission laisserait ouverte la question de
 *    l'ADR 0003 : « le build accepte-t-il ce que l'admission refuse — ou
 *    l'inverse, ce qui est pire ? ». La même forme est présentée aux deux.
 *
 * ⚠️ LA FONCTION EST LA MÊME DES DEUX CÔTÉS — `requisDuSchema()`, exportée par
 *    `core/adapter-kit/manifest.ts`. Une seconde écriture de « quels champs ce
 *    schéma exige-t-il » divergerait au premier dialecte ajouté, et la
 *    divergence serait muette.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { octetsCanoniques } from "../adapter-kit/json.js";
import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import { requisDuSchema, type Manifeste } from "../adapter-kit/manifest.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { SCEAU_PROFILS } from "../profiles/index.js";
import { enregistrerAdaptateur } from "./enregistrer.js";
import { empreinteDuManifesteProduit, empreinteDuManifesteRecu } from "./lock.js";
import type { EntreeVerrou, VerrouAdaptateurs } from "./types.js";

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;

const kit = creerAdapterKit(PROFILS, SCEAU_PROFILS);

/** DÉRIVÉES de `core/types.ts`, jamais écrites ici (§ 09, contrôle 7). */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

/** Le champ que la cascade du § 13.3 retire au deuxième palier. */
const CHAMP_DE_RANG_2 = "detailHref";

type SpecOutilDuKit = Parameters<typeof kit.definirOutil>[0];

/**
 * Un outil dont `detailHref` est déclaré de rang 2. `optionnel` décide de la
 * SEULE chose que ce témoin fait varier — tout le reste est identique, sans
 * quoi la mesure porterait sur deux documents.
 */
function specOutil(optionnel: boolean): SpecOutilDuKit {
  const href = z.string();
  return {
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    input: z.object({ limite: z.number().int() }).strict(),
    output: z
      .object({
        submissionId: z.string(),
        extrait: z.string(),
        [CHAMP_DE_RANG_2]: optionnel ? href.optional() : href,
      })
      .strict(),
    maxBytes: 4096,
    compaction: { free: ["extrait"], tier2: [CHAMP_DE_RANG_2], aggregateBy: null },
    idFields: ["submissionId"],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
    fixtureMax: "fixtures/inbox.json",
    handler: () => ({ submissionId: "s1", extrait: "…", [CHAMP_DE_RANG_2]: "/x" }),
  };
}

function adaptateur(optionnel: boolean) {
  return kit.defineAdapter({
    id: "axionia",
    version: "1.0.0",
    mode: "fédéré",
    profiles: ["dev", "admin"],
    secrets: [],
    tools: [kit.definirOutil(specOutil(optionnel))],
  });
}

function entreeVerrou(manifeste: Manifeste, surcharge: Partial<EntreeVerrou> = {}): EntreeVerrou {
  return {
    id: manifeste.id,
    version: manifeste.version,
    mode: manifeste.mode,
    manifestSha: empreinteDuManifesteProduit(manifeste),
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://axion-ia.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "axionia.mcp.shared",
    ...surcharge,
  };
}

function verrou(entrees: readonly EntreeVerrou[]): VerrouAdaptateurs {
  return { lockVersion: 1, adapters: entrees };
}

/**
 * LE DOCUMENT DE LA SONDE DE L'AUDIT, reconstruit : un manifeste fédéré dont
 * `detailHref` est de rang 2 ET obligatoire au schéma de sortie.
 *
 * Il part du manifeste CONFORME produit par le kit, puis pousse le champ dans
 * `required` — c'est exactement ce qu'un producteur étranger écrit, et le kit
 * ne peut pas le produire. `bytes` est recalculé dans la foulée : sans quoi le
 * refus `bytes_incoherent`, qui ne vise pas ce défaut-ci, masquerait la
 * question posée. Neutraliser les règles voisines est la condition pour qu'un
 * témoin isole UNE règle.
 */
function documentFedere(): unknown {
  const conforme = adaptateur(true).manifeste();
  const document = JSON.parse(JSON.stringify(conforme)) as {
    tools: { bytes: number; outputSchema: { required?: string[] } }[];
  };
  const outil = document.tools[0];
  if (outil === undefined) throw new Error("témoin : le manifeste conforme n'a aucun outil.");
  outil.outputSchema.required = [...(outil.outputSchema.required ?? []), CHAMP_DE_RANG_2];
  const { bytes: _annonce, ...sansBytes } = outil;
  outil.bytes = octetsCanoniques(sansBytes);
  return document;
}

describe("TÉMOIN — § 13.3 : le rang 2 obligatoire au schéma de sortie", () => {
  it("REFUSE à l'admission le document FÉDÉRÉ de la sonde de l'audit", () => {
    const document = documentFedere();
    const epingle = entreeVerrou(adaptateur(true).manifeste(), {
      // Le verrou épingle CE document : l'empreinte n'est pas la question posée.
      manifestSha: empreinteDuManifesteRecu(document),
    });

    const resultat = enregistrerAdaptateur({
      manifesteBrut: document,
      verrou: verrou([epingle]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    const motifs = resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
    const annonce = resultat.annonces.find((garde) => /rang 2/.test(garde.nom));
    console.log(
      "[témoin § 13.3 · admission] mode « fédéré » · compaction.tier2 = " +
        `[${CHAMP_DE_RANG_2}] · outputSchema.required le contient — ` +
        `admis : ${String(resultat.admis)} · ` +
        `refus : ${motifs.length === 0 ? "(aucun)" : motifs.join(", ")} · ` +
        `annonce : ${String(annonce?.verdict.mesures ?? 0)} champ(s) de rang 2 confronté(s)`,
    );

    expect(resultat.admis, "le document de la sonde de l'audit doit être REFUSÉ").toBe(false);
    expect(motifs).toContain("rang2_obligatoire_au_schema");
    // La garde ANNONCE son compte : sans lui, un contrôle qui n'aurait
    // confronté AUCUN champ passerait pour « rien à signaler ».
    expect(annonce, "l'admission doit ANNONCER son compte de champs de rang 2").toBeDefined();
    expect(annonce?.verdict.mesures).toBe(1);
  });

  it("le MÊME défaut est refusé AU BUILD — les deux mesures sont appariées", () => {
    let messageDuBuild = "";
    try {
      adaptateur(false).manifeste();
    } catch (erreur) {
      messageDuBuild = erreur instanceof Error ? erreur.message : String(erreur);
    }

    console.log(
      "[témoin § 13.3 · build] la MÊME forme, écrite en TypeScript — " +
        `refusée au build : ${String(messageDuBuild !== "")}`,
    );

    expect(messageDuBuild, "le build doit refuser la même forme").toMatch(/rang 2/);
  });

  it("CONTRE-TÉMOIN — le rang 2 OPTIONNEL est ADMIS, et le compte reste annoncé", () => {
    // Sans ce contre-témoin, le refus ci-dessus serait indistinguable d'une
    // admission qui refuserait tout manifeste portant un `tier2` non vide.
    const conforme = adaptateur(true).manifeste();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: JSON.parse(JSON.stringify(conforme)) as unknown,
      verrou: verrou([entreeVerrou(conforme)]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    const annonce = resultat.annonces.find((garde) => /rang 2/.test(garde.nom));
    console.log(
      `[témoin § 13.3 · contre-témoin] ${CHAMP_DE_RANG_2} optionnel — ` +
        `admis : ${String(resultat.admis)} · ` +
        `${String(annonce?.verdict.mesures ?? 0)} champ(s) de rang 2 confronté(s) · ` +
        `requis du schéma : ${requisDuSchema(conforme.tools[0]?.outputSchema ?? null).join(", ")}`,
    );

    expect(resultat.admis, "contre-témoin : le rang 2 OPTIONNEL doit être admis").toBe(true);
    expect(annonce?.verdict.mesures).toBe(1);
    // La mesure de la borne : le champ n'est PAS dans les requis, et c'est la
    // seule différence entre les deux documents.
    expect(requisDuSchema(conforme.tools[0]?.outputSchema ?? null)).not.toContain(CHAMP_DE_RANG_2);
  });
});
