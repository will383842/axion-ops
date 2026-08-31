/**
 * TÉMOIN ADVERSAIRE — l'`id` d'un adaptateur DOIT être nommable par un scope.
 *
 * ═══ LE DÉFAUT QUE CE FICHIER GARDE FERMÉ ═══
 *
 * La grammaire de `ops_policy.scope` (§ 12) est `*` | `adapterId.*` |
 * `adapterId.tool`. Un scope se lit de gauche à droite : le PREMIER point
 * sépare l'adaptateur de l'outil, donc `adapterId` n'en porte AUCUN.
 *
 * `core/adapter-kit/manifest.ts` applique déjà cette règle — mais AU BUILD,
 * donc au seul adaptateur écrit en TypeScript avec le kit. Le registre est la
 * SEULE barrière pour un manifeste produit ailleurs, et `lireManifesteRecu()`
 * n'exigeait de son `id` qu'une chaîne non vide. Un manifeste étranger — le CRM
 * en PHP, dépôt public à jamais (§ 29) — pouvait donc s'enregistrer sous
 * `zoho.mail`.
 *
 * Ce que cela produisait : son outil `send` s'appelait `zoho.mail.send`, ce que
 * la politique relit comme l'outil `mail.send` de l'adaptateur `zoho`. Une
 * ligne posée sur `zoho.*` — pour l'agenda, la facturation, autre chose —
 * s'appliquait alors au courrier, et une ligne posée sur le courrier ne
 * s'appliquait à rien. Le lot 1 avait mesuré la contradiction DANS
 * `core/policy` ; ce refus-ci l'empêche d'ENTRER.
 *
 * ═══ CE QUE CE TÉMOIN VÉRIFIE, ET DANS CET ORDRE ═══
 *
 *  1. le refus MORD sur un manifeste fabriqué pour lui ;
 *  2. il sait dire OUI — un id ordinaire passe, sans quoi le contrôle
 *     refuserait tout et serait « vert » pour la pire des raisons ;
 *  3. il est DÉRIVÉ : sur une batterie d'identifiants, le verdict du registre
 *     est exactement celui de `analyserScope()`. Une règle retapée dans le
 *     registre divergerait de la grammaire le jour où elle bouge, et ce
 *     troisième contrôle est le seul qui puisse le voir.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import { analyserScope } from "../policy/scope.js";
import { SCEAU_PROFILS } from "../profiles/index.js";
import { enregistrerAdaptateur } from "./enregistrer.js";
import { empreinteDuManifesteProduit } from "./lock.js";
import { MOTIFS_REFUS, type EntreeVerrou, type VerrouAdaptateurs } from "./types.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;
const kit = creerAdapterKit(PROFILS, SCEAU_PROFILS);
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

/** Le motif de refus éprouvé ici. Nommé une fois, confronté à l'énumération. */
const MOTIF = "id_innommable_par_un_scope";

/**
 * Un manifeste conforme, produit par le kit.
 *
 * ⚠️ IL EST PRODUIT AVEC UN ID VALIDE, PUIS L'ID EST RÉÉCRIT DANS LE DOCUMENT
 *    BRUT. C'est la seule façon d'obtenir le document qu'on redoute : le kit
 *    refuse un id à points au build, et c'est bien pour cela que le registre
 *    est la seconde barrière. Fabriquer le témoin par le chemin que le kit
 *    interdit reviendrait à éprouver le kit, pas le registre.
 */
function manifesteTemoin(): Manifeste {
  return kit
    .defineAdapter({
      id: "zoho",
      version: "1.0.0",
      mode: "fédéré",
      profiles: ["courrier"],
      secrets: [],
      tools: [
        kit.definirOutil({
          name: "mail.send",
          version: "1.0.0",
          description: "Envoie un message.",
          effect: "send",
          dataClass: "personal",
          idempotency: "key",
          pagination: "none",
          input: z.object({ destinataire: z.string() }).strict(),
          output: z.object({ messageId: z.string() }).strict(),
          maxBytes: 4096,
          compaction: { free: [], tier2: [], aggregateBy: null },
          idFields: ["messageId"],
          governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
          fixtureMax: "fixtures/mail-send.json",
          handler: () => ({ messageId: "m1" }),
        }),
      ],
    })
    .manifeste();
}

/** Le document brut, avec l'`id` qu'on veut lui faire porter. */
function brutAvecId(manifeste: Manifeste, id: string): Record<string, unknown> {
  const brut = JSON.parse(JSON.stringify(manifeste)) as Record<string, unknown>;
  brut["id"] = id;
  return brut;
}

function entreeVerrou(manifeste: Manifeste, id: string): EntreeVerrou {
  return {
    id,
    version: manifeste.version,
    mode: manifeste.mode,
    // L'empreinte est celle du document RÉELLEMENT servi : sans cela, le
    // manifeste serait refusé pour « empreinte divergente » et le témoin
    // n'aurait rien prouvé sur le contrôle qu'il vise.
    manifestSha: empreinteDuManifesteProduit({ ...manifeste, id }),
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://adaptateur.stub.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "zoho.mcp.shared",
  };
}

function verrou(entrees: readonly EntreeVerrou[]): VerrouAdaptateurs {
  return { lockVersion: 1, adapters: entrees };
}

/** Enregistre un manifeste sous l'`id` donné, et rend les motifs de refus. */
function motifsPour(id: string): readonly string[] {
  const manifeste = manifesteTemoin();
  const resultat = enregistrerAdaptateur({
    manifesteBrut: brutAvecId(manifeste, id),
    verrou: verrou([entreeVerrou(manifeste, id)]),
    profilsConnus: PROFILS,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: CLES_AUTORISATION,
  });
  return resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
}

describe("TÉMOIN — § 12 : un `id` d'adaptateur que la politique ne saurait pas viser", () => {
  it("REFUSE un id à points — celui qui faisait porter la politique d'un adaptateur sur un autre", () => {
    const motifs = motifsPour("zoho.mail");

    console.log(`[témoin § 12 · id] id « zoho.mail » → refus : ${motifs.join(", ")}`);

    expect(motifs).toContain(MOTIF);
  });

  it("le refus DIT ce qu'il faut comprendre — pas seulement qu'il refuse", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: brutAvecId(manifeste, "zoho.mail"),
      verrou: verrou([entreeVerrou(manifeste, "zoho.mail")]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(false);
    if (resultat.admis) return;

    const detail = resultat.refus.find((refus) => refus.motif === MOTIF)?.detail ?? "";
    console.log(`[témoin § 12 · id] détail rendu : ${detail}`);

    // § 15 — une erreur du socle dit quoi faire. Elle doit donc nommer la règle
    // (le PREMIER point) et pas seulement constater l'échec.
    expect(detail).toContain("PREMIER point");
    expect(detail).toContain("zoho.mail");
  });

  it("SAIT DIRE OUI — un id ordinaire est admis, et le compte d'outils est ANNONCÉ", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: brutAvecId(manifeste, "zoho"),
      verrou: verrou([entreeVerrou(manifeste, "zoho")]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    console.log(
      `[témoin § 12 · id] id « zoho » → admis ${String(resultat.admis)}, ` +
        `${String(resultat.outilsInspectes)} outil(s) inspecté(s)`,
    );

    // Un contrôle qui refuserait TOUT serait vert sur le témoin précédent sans
    // rien mesurer : c'est ce cas-ci qui l'interdit.
    expect(resultat.admis).toBe(true);
    expect(resultat.outilsInspectes).toBeGreaterThan(0);
  });

  it("EST DÉRIVÉ de la grammaire — le verdict du registre suit `analyserScope`, id par id", () => {
    // Chaque id est éprouvé DEUX FOIS : par le registre, et par la grammaire
    // que le registre est censé consulter. Une règle retapée dans le registre
    // divergerait ici, et nulle part ailleurs.
    const IDS: readonly string[] = [
      "zoho",
      "crm",
      "axionia",
      "zoho-mail",
      "zoho_mail",
      "z0h0",
      // Hors grammaire, chacun pour une raison différente.
      "zoho.mail",
      "zoho.mail.send",
      "Zoho",
      "zoho mail",
      ".zoho",
      "zoho.",
      "*",
      "",
    ];

    const desaccords: string[] = [];
    const sansLeMotif: string[] = [];
    let mesures = 0;

    for (const id of IDS) {
      const parLaGrammaire = analyserScope(`${id}.*`).valide;
      const motifs = motifsPour(id);
      const admisParLeRegistre = motifs.length === 0;
      mesures += 1;

      // On compare L'ADMISSION à la grammaire, pas la présence d'un motif
      // précis : un id que le registre refuserait pour une AUTRE raison est
      // tout aussi bien refusé, et exiger ce motif-ci masquerait le fait.
      if (parLaGrammaire !== admisParLeRegistre) {
        desaccords.push(
          `« ${id} » : grammaire ${String(parLaGrammaire)}, admis ${String(admisParLeRegistre)}`,
        );
      }
      if (!parLaGrammaire && !motifs.includes(MOTIF))
        sansLeMotif.push(`« ${id} » → ${motifs.join(", ")}`);
    }

    console.log(
      `[témoin § 12 · dérivation] ${String(mesures)} identifiant(s) mesuré(s), ` +
        `${String(desaccords.length)} désaccord(s) ; ` +
        `refusés par un AUTRE motif : ${sansLeMotif.length > 0 ? sansLeMotif.join(" · ") : "aucun"}`,
    );

    // Plancher-témoin : une liste vide serait verte sans rien mesurer, et la
    // batterie doit contenir des DEUX côtés — sans quoi elle ne prouve qu'un
    // sens de la règle.
    expect(mesures).toBe(IDS.length);
    expect(mesures).toBeGreaterThanOrEqual(12);
    expect(IDS.filter((id) => analyserScope(`${id}.*`).valide).length).toBeGreaterThanOrEqual(5);
    expect(IDS.filter((id) => !analyserScope(`${id}.*`).valide).length).toBeGreaterThanOrEqual(5);
    expect(desaccords).toEqual([]);

    // ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE. Un seul identifiant hors grammaire
    //    est refusé par un AUTRE motif que celui-ci : l'id VIDE, que le schéma
    //    de forme (`lireManifesteRecu`, `z.string().min(1)`) arrête avant que
    //    ce contrôle-ci ne s'exécute. Le compter comme un succès de ce refus
    //    serait s'attribuer le travail d'un voisin ; il est donc NOMMÉ, et
    //    l'attente est écrite sur lui plutôt que passée sous silence.
    expect(sansLeMotif).toEqual(["«  » → manifeste_malforme"]);
  });

  it("range son motif dans l'énumération fermée `MOTIFS_REFUS`", () => {
    console.log(
      `[témoin § 12 · motif] ${String(MOTIFS_REFUS.length)} motif(s) déclaré(s), ` +
        `« ${MOTIF} » présent : ${String((MOTIFS_REFUS as readonly string[]).includes(MOTIF))}`,
    );

    expect(MOTIFS_REFUS as readonly string[]).toContain(MOTIF);
  });
});
