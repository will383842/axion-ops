import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { analyserDefinition } from "../adapter-kit/manifest.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import { octetsCanoniques } from "../adapter-kit/json.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { anomaliesCompletes } from "../adapter-kit/verdict.js";
import type { Manifeste, ManifesteOutil } from "../adapter-kit/manifest.js";
import { PROFILE_NAMES, SCEAU_PROFILS } from "../profiles/index.js";
import type { ProfileName } from "../profiles/index.js";

import { enregistrerAdaptateur } from "./enregistrer.js";
import { empreinteDuManifesteProduit } from "./lock.js";
import { MOTIFS_REFUS } from "./types.js";
import type { EntreeVerrou, MotifRefus, VerrouAdaptateurs } from "./types.js";

/**
 * TÉMOINS — L'ÉTIQUETAGE SE DÉCIDE CÔTÉ SOCLE (§ 20), ET L'ADMISSION LE DIT.
 *
 * Ce fichier éprouve les deux décisions du lot 1c sur le contrat d'adaptateur,
 * et surtout **ce qui les distingue** :
 *
 *  · **ADR 0015 — `idFields` n'exonère plus rien.** Le § 20 pose que
 *    « l'étiquetage se décide côté socle, JAMAIS sur déclaration ». L'admission
 *    ANNONCE ce qui est déclaré sans effet, avec le remède ; elle ne le REFUSE
 *    pas. On n'interdit pas ce qu'on ignore, et refuser rejetterait de vrais
 *    outils — un `messageId: z.string()` n'a rien d'illégitime.
 *  · **ADR 0016 — `governanceFields` ne peut qu'AJOUTER.** Une déclaration qui
 *    resserre se croit sur parole ; une qui ne désigne RIEN est refusée, parce
 *    que son auteur la croit appliquée et qu'elle porte sur la seule branche de
 *    l'étape 11 qu'aucune confirmation ne rattrape.
 *
 * ⚠️ **ÉCART SIGNALÉ AVEC L'ÉNONCÉ DU LOT.** L'énoncé demandait qu'un champ de
 *    texte libre déclaré identifiant soit « REFUSÉ À L'ADMISSION ». L'ADR 0015,
 *    postérieure et motivée, range ce refus dans « ce que la décision EXCLUT » :
 *    il rejetterait de vrais outils pour une déclaration que le socle a de toute
 *    façon cessé de croire, et il pousserait à écrire un motif de complaisance
 *    pour passer la porte. Ce fichier applique **l'ADR**, et l'écart est porté au
 *    rapport plutôt que tranché en silence. Le test ci-dessous mesure exactement
 *    ce qui se passerait si l'arbitrage basculait : le message actionnable est
 *    déjà écrit, il change seulement de canal.
 *
 * ── RÈGLE DE CE FICHIER ───────────────────────────────────────────────────
 * Chaque garde ANNONCE combien d'éléments elle a mesurés, et chaque témoin
 * n'abîme QU'UN point : sinon l'anomalie observée pourrait venir d'une voisine.
 */

const PROFILS: readonly ProfileName[] = PROFILE_NAMES;
const kit = creerAdapterKit<ProfileName>(PROFILS, SCEAU_PROFILS);

/** Les noms interdits au schéma d'entrée, DÉRIVÉS de `core/types.ts`. */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

/**
 * Un manifeste d'un seul outil, dont le schéma d'entrée et les deux
 * déclarations sont paramétrables. Tout le reste est CONFORME : un témoin doit
 * isoler une seule règle.
 */
function manifesteAvec(options: {
  readonly entree: z.ZodObject;
  readonly idFields: readonly string[];
  readonly governanceFields: readonly string[];
}): Manifeste {
  return kit
    .defineAdapter({
      id: "axionia",
      version: "1.0.0",
      mode: "fédéré",
      profiles: ["dev", "admin"],
      secrets: [],
      tools: [
        kit.definirOutil({
          name: "mail.envoyer",
          version: "1.0.0",
          description: "Envoie un courrier déjà rédigé.",
          effect: "send",
          dataClass: "personal",
          idempotency: "key",
          pagination: "none",
          input: options.entree,
          output: z.object({ messageId: z.string() }).strict(),
          maxBytes: 4096,
          compaction: { free: [], tier2: [], aggregateBy: null },
          idFields: options.idFields,
          governanceFields: options.governanceFields,
          fixtureMax: "fixtures/envoi.json",
          handler: () => ({ messageId: "m1" }),
        }),
      ],
    })
    .manifeste();
}

/** Une copie profonde, franchissant un fil JSON — comme un manifeste reçu. */
function recu(manifeste: Manifeste): Manifeste {
  return JSON.parse(JSON.stringify(manifeste)) as Manifeste;
}

/**
 * Recalcule les `bytes` après mutation.
 *
 * Sans lui, `bytes_incoherent` refuserait AVANT la garde visée, et le témoin
 * mesurerait la mauvaise. C'est le sens de « neutraliser les voisines ».
 */
function rebaser(manifeste: Manifeste): Manifeste {
  return {
    ...manifeste,
    tools: manifeste.tools.map((outil) => {
      const { bytes: _ignore, ...sansBytes } = outil;
      return { ...outil, bytes: octetsCanoniques(sansBytes) };
    }),
  };
}

function entreeVerrou(manifeste: Manifeste): EntreeVerrou {
  return {
    id: manifeste.id,
    version: manifeste.version,
    mode: manifeste.mode,
    // DÉRIVÉE du document exact, jamais recopiée : un SHA écrit à la main ne
    // prouverait que la stabilité du copier-coller.
    manifestSha: empreinteDuManifesteProduit(manifeste),
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://adaptateur.stub.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "axionia.mcp.shared",
  };
}

function verrou(entrees: readonly EntreeVerrou[]): VerrouAdaptateurs {
  return { lockVersion: 1, adapters: entrees };
}

/** Admet ou refuse, avec un verrou épinglé SUR CE document exact. */
function admettre(manifeste: Manifeste): ReturnType<typeof enregistrerAdaptateur> {
  return enregistrerAdaptateur({
    manifesteBrut: manifeste,
    verrou: verrou([entreeVerrou(manifeste)]),
    profilsConnus: PROFILS,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: CLES_AUTORISATION,
  });
}

function motifs(resultat: ReturnType<typeof enregistrerAdaptateur>): readonly MotifRefus[] {
  return resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
}

/** Le verdict de la garde G2 (ADR 0015), avec son plancher déjà appliqué. */
function annonceIdFields(resultat: ReturnType<typeof enregistrerAdaptateur>): {
  readonly nom: string;
  readonly lignes: readonly string[];
  readonly mesures: number;
} {
  const garde = resultat.annonces.find((annonce) => annonce.nom.startsWith("idFields"));
  if (garde === undefined) throw new Error("la garde G2 n'a rien annoncé — canal absent");
  return {
    nom: garde.nom,
    lignes: anomaliesCompletes(garde.verdict, garde.nom),
    mesures: garde.verdict.mesures,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0015 — L'ADMISSION DIT CE QUI EST SANS EFFET, ET NE LE REFUSE PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("TÉMOIN ADR 0015 — un `idFields` posé sur un champ de TEXTE LIBRE", () => {
  it("est ADMIS — et l'annonce dit ce qu'il faut ajouter AU SCHÉMA", () => {
    // ⚠️ LE TÉMOIN QUI A MOTIVÉ L'ADR. `idFields: ["requete"]` sur un
    //    `{"type":"string"}` suffit, jusqu'à la bascule de l'étape 11, à retirer
    //    le champ de la surveillance du § 20 — c'est-à-dire à désarmer la garde
    //    d'exfiltration DEPUIS LE MANIFESTE, donc depuis un dépôt tiers.
    //
    // 🔧 **LA FERMETURE A DEUX MOITIÉS, ET UNE SEULE EST ICI.** Ce test tient la
    //    moitié « registre » : la déclaration est confrontée au schéma et son
    //    absence d'effet est DITE. L'autre moitié — le retrait du paramètre
    //    `idFields` d'`analyserArgumentsDuSchema()` — appartient au constructeur
    //    ② (ADR 0015, point 1) ; tant qu'elle n'a pas atterri, l'exonération
    //    vit encore à l'étape 11, et c'est le témoin
    //    `core/epreuve/exfiltration-par-les-arguments.temoin.spec.ts` qui la
    //    compte. Ce fichier ne prétend donc PAS que le trou est refermé : il
    //    prouve que l'admission ne le couvre plus d'un silence.
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ requete: z.string() }).strict(),
        idFields: ["requete"],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );

    const resultat = admettre(manifeste);
    const annonce = annonceIdFields(resultat);

    console.log(
      `[témoin idFields libre] admis : ${String(resultat.admis)} · ` +
        `refus : ${motifs(resultat).join(", ") || "(aucun)"} · ` +
        `annonce « ${annonce.nom} » · ${String(annonce.lignes.length)} ligne(s)`,
    );
    for (const ligne of annonce.lignes) console.log(`  · ${ligne}`);

    // ① IL EST ADMIS — voir l'écart signalé en tête de fichier.
    expect(resultat.admis).toBe(true);
    // ② MAIS IL EST DIT, et le message est ACTIONNABLE : il nomme le champ, la
    //    conséquence, et les formes de schéma qui le referment.
    expect(annonce.lignes.length).toBe(1);
    expect(annonce.lignes[0]).toContain("requete");
    expect(annonce.lignes[0]).toContain("SANS EFFET");
    expect(annonce.lignes[0]).toContain("pattern");
    expect(annonce.lignes[0]).toContain("z.string()");
    // ③ La garde a MESURÉ : un `idFields` confronté au schéma.
    expect(annonce.mesures).toBe(1);
    expect(annonce.nom).toContain("1 déclaré(s)");
    expect(annonce.nom).toContain("0 fermé(s)");
  });

  it("est ADMIS SANS UN MOT quand le schéma le referme par un `format`", () => {
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ submissionId: z.string().uuid() }).strict(),
        idFields: ["submissionId"],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );

    const resultat = admettre(manifeste);
    const annonce = annonceIdFields(resultat);
    const schema = JSON.stringify(manifeste.tools[0]?.inputSchema);

    console.log(
      `[témoin idFields fermé par format] schéma : ${schema} · ` +
        `annonce « ${annonce.nom} » · ${String(annonce.lignes.length)} ligne(s)`,
    );

    expect(resultat.admis).toBe(true);
    // ⚠️ La garde a MESURÉ un élément et n'a RIEN trouvé — ce n'est pas la même
    //    chose que « zéro mesuré », et c'est le plancher du `Verdict` qui les
    //    distingue. `anomaliesCompletes()` rendrait une ligne sur un zéro.
    expect(annonce.mesures).toBe(1);
    expect(annonce.lignes).toEqual([]);
    expect(annonce.nom).toContain("1 fermé(s)");
  });

  it("passe SANS FRICTION avec un `pattern` ancré — le remède tient en une ligne de Zod", () => {
    // C'est le remède que l'ADR 0015 écrit pour les adaptateurs réels du § 27 :
    // `messageId: z.string().regex(/^[0-9]{1,20}$/)`.
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ messageId: z.string().regex(/^[0-9]{1,20}$/) }).strict(),
        idFields: ["messageId"],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );

    const resultat = admettre(manifeste);
    const annonce = annonceIdFields(resultat);

    console.log(
      `[témoin pattern ancré] schéma : ${JSON.stringify(manifeste.tools[0]?.inputSchema)} · ` +
        `annonce « ${annonce.nom} » · ${String(annonce.lignes.length)} ligne(s)`,
    );

    expect(resultat.admis).toBe(true);
    expect(annonce.lignes).toEqual([]);
    expect(annonce.nom).toContain("1 fermé(s)");
  });

  it("DIT aussi un `idFields` qui ne désigne AUCUNE propriété du schéma", () => {
    // Autre forme de « sans effet », et autre cause : le § 31 purgerait
    // `recordIds` sur une liste qui ne correspond à aucun champ.
    const conforme = recu(
      manifesteAvec({
        entree: z.object({ limite: z.number().int() }).strict(),
        idFields: [],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );
    const mute = rebaser({
      ...conforme,
      tools: conforme.tools.map((outil): ManifesteOutil => ({
        ...outil,
        idFields: ["submissionId"],
      })),
    });

    const resultat = admettre(mute);
    const annonce = annonceIdFields(resultat);

    console.log(
      `[témoin idFields introuvable] admis : ${String(resultat.admis)} · ` +
        `${String(annonce.lignes.length)} ligne(s) annoncée(s)`,
    );
    for (const ligne of annonce.lignes) console.log(`  · ${ligne}`);

    expect(resultat.admis).toBe(true);
    expect(annonce.lignes.length).toBeGreaterThanOrEqual(1);
    expect(annonce.lignes.join(" ")).toContain("submissionId");
  });

  it("dit sa CÉCITÉ quand aucun `idFields` n'a été confronté — plancher du verdict", () => {
    // ⚠️ C'EST LE POINT DE L'ADR 0015 SUR LE PLANCHER. Un manifeste sans aucun
    //    `idFields` rend cette garde MUETTE : zéro mesuré. Rendre « aucune
    //    anomalie » serait vert pour la pire des raisons ; c'est
    //    `anomaliesCompletes()` qui transforme ce zéro en phrase.
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ limite: z.number().int() }).strict(),
        idFields: [],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );

    const resultat = admettre(manifeste);
    const annonce = annonceIdFields(resultat);

    console.log(
      `[témoin garde muette] mesures : ${String(annonce.mesures)} · ` +
        `lignes : ${annonce.lignes.join(" | ")}`,
    );

    expect(resultat.admis).toBe(true);
    expect(annonce.mesures).toBe(0);
    expect(annonce.lignes.length).toBe(1);
    expect(annonce.lignes[0]).toContain("n'a pas regardé assez pour conclure");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0016 — UNE DÉCLARATION DE GOUVERNANCE QUI NE DÉSIGNE RIEN EST REFUSÉE
// ═════════════════════════════════════════════════════════════════════════════

describe("TÉMOIN ADR 0016 — `governanceFields`, cru mais confronté", () => {
  it("ADMET une déclaration qui désigne de vraies propriétés, et la PORTE jusqu'à `ops_tool`", () => {
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ destinataire: z.string(), corps: z.string() }).strict(),
        idFields: [],
        governanceFields: ["destinataire"],
      }),
    );

    const resultat = admettre(manifeste);
    const garde = resultat.annonces.find((annonce) =>
      annonce.nom.startsWith("champs de gouvernance"),
    );

    console.log(
      `[témoin gouvernance admise] admis : ${String(resultat.admis)} · ` +
        `annonce : ${garde?.nom ?? "(absente)"}`,
    );

    expect(resultat.admis).toBe(true);
    if (!resultat.admis) return;
    // ⚠️ LE CHAMP DOIT ARRIVER JUSQU'À LA LIGNE. Une déclaration validée à
    //    l'admission puis perdue en chemin serait une garde qui mord dans le
    //    vide : l'étape 11 ne verrait jamais ce que l'outil a déclaré.
    expect(resultat.outils[0]?.governanceFields).toEqual(["destinataire"]);
    expect(garde?.nom).toContain("1 déclaré(s)");
    expect(garde?.nom).toContain("1 confronté(s)");
    expect(garde?.nom).toContain("0 introuvable(s)");
  });

  it("REFUSE un `governanceFields` qui ne désigne aucune propriété — le no-op muet", () => {
    // Le kit REFUSE désormais de construire un tel manifeste : le témoin part
    // donc d'un document conforme, le mutile sur CE SEUL point, et réépingle le
    // verrou sur le document mutilé — sinon c'est l'empreinte qui refuserait.
    const conforme = recu(
      manifesteAvec({
        entree: z.object({ destinataire: z.string(), corps: z.string() }).strict(),
        idFields: [],
        governanceFields: ["destinataire"],
      }),
    );
    const mute = rebaser({
      ...conforme,
      tools: conforme.tools.map((outil): ManifesteOutil => ({
        ...outil,
        governanceFields: ["destinataireX"],
      })),
    });

    const resultat = admettre(mute);
    const trouves = motifs(resultat);
    const detail = resultat.admis ? "" : (resultat.refus[0]?.detail ?? "");

    console.log(
      `[témoin gouvernance introuvable] ${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );
    console.log(`  · ${detail}`);

    expect(trouves).toEqual(["champ_de_gouvernance_introuvable"]);
    // Le refus est ACTIONNABLE : il nomme le champ fautif ET ceux qui existent.
    expect(detail).toContain("destinataireX");
    expect(detail).toContain("destinataire, corps");
    expect(detail).toContain("NO-OP MUET");
  });

  it("REFUSE le même document au BUILD — la garde passe par LA MÊME fonction", () => {
    // ⚠️ ADR 0003, APPLIQUÉ À UN CHAMP DE PLUS. Le harnais tourne dans la CI de
    //    l'ADAPTATEUR, le registre dans celle du SOCLE. Deux implémentations
    //    feraient que le build accepte ce que l'admission refuse. Ce témoin
    //    confronte les deux verdicts sur LA MÊME faute.
    const analyse = analyserDefinition(
      {
        id: "axionia",
        version: "1.0.0",
        mode: "fédéré",
        profiles: ["dev"],
        secrets: [],
        tools: [
          kit.definirOutil({
            name: "mail.envoyer",
            version: "1.0.0",
            description: "Envoie un courrier déjà rédigé.",
            effect: "send",
            dataClass: "personal",
            idempotency: "key",
            pagination: "none",
            input: z.object({ destinataire: z.string() }).strict(),
            output: z.object({ messageId: z.string() }).strict(),
            maxBytes: 4096,
            compaction: { free: [], tier2: [], aggregateBy: null },
            idFields: [],
            governanceFields: ["destinataireX"],
            fixtureMax: "fixtures/envoi.json",
            handler: () => ({ messageId: "m1" }),
          }),
        ],
      },
      PROFILS,
      SCEAU_PROFILS,
    );

    console.log(
      `[témoin build ≡ admission] ${String(analyse.verdict.mesures)} outil(s) mesuré(s) · ` +
        `${String(analyse.verdict.anomalies.length)} anomalie(s) au build`,
    );
    for (const anomalie of analyse.verdict.anomalies) console.log(`  · ${anomalie}`);

    expect(analyse.manifeste).toBeNull();
    expect(analyse.verdict.mesures).toBe(1);
    expect(analyse.verdict.anomalies.length).toBe(1);
    // LE MÊME VOCABULAIRE des deux côtés : c'est le signe qu'une seule fonction
    // a parlé. Deux messages différents diraient deux implémentations.
    expect(analyse.verdict.anomalies[0]).toContain("destinataireX");
    expect(analyse.verdict.anomalies[0]).toContain("NO-OP MUET");
  });

  it("N'ANNONCE PAS un `idFields` sans effet au BUILD — l'asymétrie tient des deux côtés", () => {
    // Le build ne refuse PAS un identifiant laissé libre : l'ADR 0015 le confie
    // à l'annonce de l'admission. Un build qui le refuserait rejetterait de
    // vrais outils dans la CI d'un dépôt tiers, sans recours.
    const analyse = analyserDefinition(
      {
        id: "axionia",
        version: "1.0.0",
        mode: "fédéré",
        profiles: ["dev"],
        secrets: [],
        tools: [
          kit.definirOutil({
            name: "mail.repondre",
            version: "1.0.0",
            description: "Répond à un message.",
            effect: "send",
            dataClass: "personal",
            idempotency: "key",
            pagination: "none",
            input: z.object({ messageId: z.string() }).strict(),
            output: z.object({ messageId: z.string() }).strict(),
            maxBytes: 4096,
            compaction: { free: [], tier2: [], aggregateBy: null },
            idFields: ["messageId"],
            governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
            fixtureMax: "fixtures/repondre.json",
            handler: () => ({ messageId: "m1" }),
          }),
        ],
      },
      PROFILS,
      SCEAU_PROFILS,
    );

    console.log(
      `[témoin build tolérant] ${String(analyse.verdict.anomalies.length)} anomalie(s) — ` +
        "un identifiant laissé libre ne refuse pas au build",
    );

    expect(analyse.verdict.anomalies).toEqual([]);
    expect(analyse.manifeste).not.toBeNull();
  });

  it("REFUSE un manifeste qui ne porte PAS `governanceFields` — un document d'avant le lot 1c", () => {
    const base = recu(
      manifesteAvec({
        entree: z.object({ destinataire: z.string() }).strict(),
        idFields: [],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );
    // Le champ est RETIRÉ par déstructuration : `ManifesteOutil` est en lecture
    // seule, et un `delete` sur une propriété `readonly` ne compile pas — ce qui
    // est en soi une garde, celle du type.
    const sansChamp = {
      ...base,
      tools: base.tools.map((outil) => {
        const { governanceFields: _absent, ...reste } = outil;
        return reste;
      }),
    };

    const resultat = enregistrerAdaptateur({
      manifesteBrut: sansChamp,
      verrou: verrou([entreeVerrou(base)]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    console.log(
      `[témoin champ absent] admis : ${String(resultat.admis)} · ` +
        `motifs : ${motifs(resultat).join(", ")}`,
    );

    expect(resultat.admis).toBe(false);
    // Le schéma FERMÉ de `manifeste-recu.ts` le prend AVANT tout le reste : un
    // document sans ce champ n'est pas un manifeste de ce socle. C'est le même
    // traitement que le sceau des profils au lot 1b, et il est délibéré —
    // `VERSION_MANIFESTE` reste à 1 pour que le message nomme le champ manquant.
    expect(motifs(resultat)).toContain("manifeste_malforme");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LES CANAUX EUX-MÊMES — ils existent, et ils sont rendus SUR TOUS LES CHEMINS
// ═════════════════════════════════════════════════════════════════════════════

describe("TÉMOIN — les deux canaux de l'admission ne se vident pas en chemin", () => {
  it("rend les annonces MÊME sur un refus — et même sur un refus précoce", () => {
    // ⚠️ UN CANAL D'ANNONCE VIDE SE LIT « RIEN À SIGNALER ». Ici il veut dire
    //    « la garde n'a pas tourné », et seul le plancher du verdict les
    //    distingue — encore faut-il que le verdict soit RENDU. Le refus le plus
    //    précoce est celui du verrou : aucun outil n'a été inspecté.
    const manifeste = recu(
      manifesteAvec({
        entree: z.object({ destinataire: z.string() }).strict(),
        idFields: [],
        governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
      }),
    );

    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      // Aucune entrée pour cet id : refus `adaptateur_absent_du_verrou`.
      verrou: verrou([]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    const lignes = resultat.annonces.flatMap((annonce) =>
      anomaliesCompletes(annonce.verdict, annonce.nom),
    );

    console.log(
      `[témoin canal sur refus] motifs : ${motifs(resultat).join(", ")} · ` +
        `${String(resultat.annonces.length)} annonce(s) · ${String(lignes.length)} ligne(s)`,
    );
    for (const ligne of lignes) console.log(`  · ${ligne}`);

    expect(resultat.admis).toBe(false);
    expect(motifs(resultat)).toEqual(["adaptateur_absent_du_verrou"]);
    // Les deux gardes sont rendues, et celle qui n'a rien mesuré LE DIT.
    expect(resultat.annonces.length).toBe(2);
    expect(lignes.join(" ")).toContain("n'a pas regardé assez pour conclure");
  });

  it("REFUSE un doublon SOUS SON PROPRE MOTIF — un refus ne ment pas sur sa cause", () => {
    // ⚠️ POURQUOI UN MOTIF À PART. Ranger un doublon sous « introuvable » ferait
    //    dire au refus le CONTRAIRE de la cause : le nom répété est parfaitement
    //    trouvable. Un motif qui ment fait chercher au mauvais endroit.
    const conforme = recu(
      manifesteAvec({
        entree: z.object({ destinataire: z.string() }).strict(),
        idFields: [],
        governanceFields: ["destinataire"],
      }),
    );
    const mute = rebaser({
      ...conforme,
      tools: conforme.tools.map((outil): ManifesteOutil => ({
        ...outil,
        governanceFields: ["destinataire", "destinataire"],
      })),
    });

    const resultat = admettre(mute);
    const detail = resultat.admis ? "" : (resultat.refus[0]?.detail ?? "");

    console.log(`[témoin doublon] motifs : ${motifs(resultat).join(", ")}`);
    console.log(`  · ${detail}`);

    // Un SEUL motif : le doublon ne doit PAS déclencher « introuvable » en plus,
    // sinon l'exploitant corrigerait un nom qui n'a rien.
    expect(motifs(resultat)).toEqual(["champs_de_gouvernance_en_double"]);
    expect(detail).toContain("destinataire");
    expect(detail).not.toContain("NO-OP MUET");
  });

  it("range les motifs nouveaux dans `MOTIFS_REFUS` — déclarés, pas inventés à l'usage", () => {
    const nouveaux = [
      "champ_de_gouvernance_introuvable",
      "champs_de_gouvernance_en_double",
    ] as const;

    console.log(
      `[témoin motifs] ${String(MOTIFS_REFUS.length)} motifs déclarés · ` +
        `${String(nouveaux.length)} confrontés`,
    );

    // Plancher-témoin : l'union ne s'est pas vidée.
    expect(MOTIFS_REFUS.length).toBeGreaterThanOrEqual(20);
    for (const motif of nouveaux) expect(MOTIFS_REFUS).toContain(motif);
  });
});
