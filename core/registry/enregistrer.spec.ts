import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { OUTIL_CLOTURE } from "../audit/vocabulaire.js";
import { PROFILE_NAMES, SCEAU_PROFILS, type ProfileName } from "../profiles/index.js";
import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import type { DefinitionAdaptateur, DefinitionOutil } from "../adapter-kit/types.js";
import { enregistrerAdaptateur } from "./enregistrer.js";
import { empreinteDuManifesteRecu } from "./lock.js";
import type { EntreeVerrou, MotifRefus, VerrouAdaptateurs } from "./types.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

/**
 * Gardes de L'ENREGISTREMENT (§ 09, § 12, § 29).
 *
 * Chaque garde est appliquée d'abord à un couple manifeste / verrou COHÉRENT —
 * on prouve qu'elle laisse passer ce qui doit passer — puis à un témoin
 * fabriqué qui ne dégrade QU'UN point.
 */

// ⚠️ DÉRIVÉE, PAS RECOPIÉE. Cette garde éprouve le refus « profil inconnu » :
//    si elle portait sa propre liste écrite à la main, le jour où un profil est
//    ajouté ou retiré elle resterait verte sur l'ANCIENNE énumération pendant
//    que le socle sert la nouvelle, et le refus qu'elle teste ne mesurerait
//    plus rien de réel.
const PROFILS: readonly ProfileName[] = PROFILE_NAMES;
type Profil = ProfileName;

const kit = creerAdapterKit(PROFILS, SCEAU_PROFILS);

/**
 * Les noms qu'un schéma d'entrée n'a pas le droit de porter (§ 09, contrôle 7).
 *
 * DÉRIVÉS de `core/types.ts` — jamais écrits ici. `lireClesDAutorisation()` lit
 * les propriétés de `ToolContext` et de `Habilitations` dans le source, et lève
 * si la dérivation rend trop peu de clés : une liste vide rendrait le contrôle
 * vacueux, et l'absence d'alerte se lirait comme une absence de problème.
 */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

function outil(surcharges: Partial<DefinitionOutil<Profil>> = {}): DefinitionOutil<Profil> {
  const base = kit.definirOutil<z.ZodObject, z.ZodObject>({
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents, tous canaux confondus.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    input: z.object({ limite: z.number().int() }).strict(),
    output: z.object({ submissionId: z.string(), extrait: z.string() }).strict(),
    maxBytes: 32768,
    compaction: { free: ["extrait"], tier2: [], aggregateBy: null },
    idFields: ["submissionId"],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
    fixtureMax: "fixtures/inbox-max.json",
    handler: () => ({ submissionId: "s1", extrait: "…" }),
  });
  return { ...base, ...surcharges };
}

function manifesteTemoin(surcharges: Partial<DefinitionAdaptateur<Profil>> = {}): Manifeste {
  return kit
    .defineAdapter({
      id: "axionia",
      version: "1.0.0",
      mode: "fédéré",
      profiles: ["dev", "admin"],
      secrets: [],
      tools: [outil()],
      ...surcharges,
    })
    .manifeste();
}

/** Un verrou COHÉRENT avec le manifeste donné — l'empreinte en est dérivée. */
function verrouPour(
  manifeste: Manifeste,
  surcharges: Partial<EntreeVerrou> = {},
): VerrouAdaptateurs {
  return {
    lockVersion: 1,
    adapters: [
      {
        id: manifeste.id,
        version: manifeste.version,
        mode: manifeste.mode,
        // DÉRIVÉE du manifeste, jamais recopiée : un SHA écrit à la main dans
        // ce fichier de test ne prouverait que la stabilité du copier-coller.
        manifestSha: empreinteDuManifesteRecu(manifeste),
        trustTier: 1,
        maxDataClass: "personal",
        endpoint: manifeste.mode === "fédéré" ? "https://exemple.invalid/api/mcp" : null,
        authMode: manifeste.mode === "fédéré" ? "secret-partage" : "en-processus",
        secretRef: "axionia.mcp.shared",
        ...surcharges,
      },
    ],
  };
}

function motifs(resultat: ReturnType<typeof enregistrerAdaptateur>): readonly MotifRefus[] {
  return resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le cas admis
// ═════════════════════════════════════════════════════════════════════════════

describe("un couple manifeste / verrou cohérent", () => {
  it("est admis, et les champs de confiance viennent du VERROU", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste, { trustTier: 2, maxDataClass: "sensitive" }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(true);
    if (!resultat.admis) return;

    expect(resultat.outilsInspectes).toBe(1);
    expect(resultat.adaptateur.trustTier).toBe(2);
    expect(resultat.adaptateur.maxDataClass).toBe("sensitive");
    expect(resultat.adaptateur.secretRef).toBe("axionia.mcp.shared");
    // Le nom complet est DÉRIVÉ du préfixe, et `ops_tool.name` reste local.
    expect(resultat.outils[0]?.name).toBe("inbox.recent");
    expect(resultat.outils[0]?.nomComplet).toBe("axionia.inbox.recent");
    expect(resultat.outils[0]?.bytes).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Les quatre refus qui comptent
// ═════════════════════════════════════════════════════════════════════════════

describe("l'épinglage par empreinte", () => {
  it("refuse un SHA divergent", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste, { manifestSha: `sha256:${"0".repeat(64)}` }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).toContain("empreinte_divergente");
  });

  it("refuse un manifeste où un seul `effect` a basculé — § 20, épinglage", () => {
    // Le verrou est calé sur la version « read ». Le manifeste servi bascule
    // l'outil en « send ». Ce n'est ni un champ ajouté ni un champ disparu :
    // sans l'empreinte, cela n'apparaîtrait NULLE PART.
    const relu = manifesteTemoin();
    const servi = manifesteTemoin({ tools: [outil({ effect: "send" })] });

    const resultat = enregistrerAdaptateur({
      manifesteBrut: servi,
      verrou: verrouPour(relu),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).toContain("empreinte_divergente");
  });

  it("refuse un adaptateur absent du verrou", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: { lockVersion: 1, adapters: [] },
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).toContain("adaptateur_absent_du_verrou");
  });

  it("prend l'empreinte sur le document BRUT, pas sur la forme validée", () => {
    // Témoin décisif. Le manifeste porte un champ en trop. Si l'empreinte était
    // calculée APRÈS validation, ce champ aurait été retiré et l'empreinte
    // coïnciderait avec celle épinglée : le verrou certifierait un document
    // qu'il n'a jamais vu.
    const propre = manifesteTemoin();
    const altere = { ...propre, trustTier: 9 };

    // Le témoin, en deux lignes : l'empreinte du document ALTÉRÉ diffère, mais
    // l'empreinte de sa forme FILTRÉE — celle qu'un schéma fermé rendrait —
    // coïncide exactement avec celle épinglée. Prendre l'empreinte après
    // validation ferait donc PASSER ce document.
    const { trustTier: _trustTier, ...filtre } = altere;
    expect(empreinteDuManifesteRecu(altere)).not.toBe(empreinteDuManifesteRecu(propre));
    expect(empreinteDuManifesteRecu(filtre)).toBe(empreinteDuManifesteRecu(propre));

    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(propre),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    // Le champ usurpé est NOMMÉ pour ce qu'il est, et non noyé dans un message
    // générique de clé inconnue : c'est une tentative de se décerner un niveau
    // de confiance, pas une faute de frappe.
    expect(motifs(resultat)).toContain("confiance_auto_decernee");
    expect(motifs(resultat)).toContain("manifeste_malforme");
  });
});

describe("la confiance ne se décerne pas soi-même", () => {
  it("refuse un manifeste qui porte `trustTier` ou `maxDataClass`", () => {
    const propre = manifesteTemoin();
    for (const champ of ["trustTier", "maxDataClass", "endpoint", "secretRef", "authMode"]) {
      const altere = { ...propre, [champ]: "peu importe" };
      const resultat = enregistrerAdaptateur({
        manifesteBrut: altere,
        verrou: verrouPour(propre),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: CLES_AUTORISATION,
      });
      expect(motifs(resultat), `champ « ${champ} »`).toContain("confiance_auto_decernee");
    }
  });

  it("laisse passer les champs que le manifeste a le DROIT de porter", () => {
    // Témoin inverse : la garde ne refuse pas tout ce qui coïncide avec le
    // verrou. `id`, `version` et `mode` figurent dans les deux formes.
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).not.toContain("confiance_auto_decernee");
  });
});

describe("l'assertion des secrets", () => {
  it("refuse un adaptateur FÉDÉRÉ qui déclare des secrets", () => {
    // Le kit refuse déjà de construire un tel manifeste : le témoin est donc
    // fabriqué à la main, exactement comme le ferait un adaptateur d'un autre
    // langage qui produirait son manifeste sans passer par le kit.
    const propre = manifesteTemoin();
    const altere: Manifeste = { ...propre, secrets: ["zoho.refresh"] };

    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).toContain("secrets_en_mode_federe");
  });

  it("accepte des secrets en mode HÉBERGÉ — l'adaptateur vit dans le processus", () => {
    const heberge = manifesteTemoin({ mode: "hébergé", secrets: [{ name: "zoho.refresh" }] });
    const resultat = enregistrerAdaptateur({
      manifesteBrut: heberge,
      verrou: verrouPour(heberge),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).not.toContain("secrets_en_mode_federe");
    expect(resultat.admis).toBe(true);
  });
});

describe("le plafond de classe de données", () => {
  it("refuse un outil au-dessus du `maxDataClass` de son adaptateur", () => {
    const manifeste = manifesteTemoin({ tools: [outil({ dataClass: "sensitive" })] });
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste, { maxDataClass: "personal" }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(motifs(resultat)).toContain("dataclass_au_dessus_du_plafond");
    expect(resultat.outilsInspectes).toBe(1);
  });

  it("accepte un outil AU niveau du plafond, et un outil en dessous", () => {
    for (const classe of ["none", "internal", "personal"] as const) {
      const manifeste = manifesteTemoin({ tools: [outil({ dataClass: classe })] });
      const resultat = enregistrerAdaptateur({
        manifesteBrut: manifeste,
        verrou: verrouPour(manifeste, { maxDataClass: "personal" }),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: CLES_AUTORISATION,
      });
      expect(motifs(resultat), `classe « ${classe} »`).not.toContain(
        "dataclass_au_dessus_du_plafond",
      );
    }
  });

  it("le plafond descend jusqu'à `none` — et refuse alors `internal`", () => {
    const manifeste = manifesteTemoin({ tools: [outil({ dataClass: "internal" })] });
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste, { maxDataClass: "none" }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("dataclass_au_dessus_du_plafond");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Les autres refus
// ═════════════════════════════════════════════════════════════════════════════

describe("les autres refus d'admission", () => {
  it("refuse un profil hors de l'énumération fermée", () => {
    const propre = manifesteTemoin();
    const altere: Manifeste = { ...propre, profiles: ["dev", "inconnu"] };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("profil_inconnu");
  });

  it("refuse un préfixe écrit à la main dans le nom d'un outil", () => {
    const propre = manifesteTemoin();
    const premier = propre.tools[0];
    expect(premier).toBeDefined();
    if (premier === undefined) return;

    const altere: Manifeste = {
      ...propre,
      tools: [{ ...premier, name: "axionia.inbox.recent" }],
    };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("prefixe_non_derive");
  });

  it("refuse deux outils de même nom complet", () => {
    const propre = manifesteTemoin();
    const premier = propre.tools[0];
    if (premier === undefined) return;
    const altere: Manifeste = { ...propre, tools: [premier, premier] };

    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("outil_en_double");
  });

  it("refuse un outil qui porte le nom réservé aux lignes de clôture du journal", () => {
    // Le nom vient de `core/audit/vocabulaire.ts` — IMPORTÉ, jamais retapé.
    // Une ligne d'appel ordinaire portant ce nom serait lue par
    // `estLigneDeCloture` comme une clôture, et rendrait la vérification du
    // journal ROUGE en permanence : un déni de service sur la vérification,
    // déclenchable par n'importe quel adaptateur.
    const propre = manifesteTemoin();
    const premier = propre.tools[0];
    if (premier === undefined) return;

    // Le nom LOCAL qui, préfixé par l'id de l'adaptateur, donnerait exactement
    // le nom réservé — ou le nom réservé lui-même s'il ne porte pas le préfixe.
    const prefixe = `${propre.id}.`;
    const local = OUTIL_CLOTURE.startsWith(prefixe)
      ? OUTIL_CLOTURE.slice(prefixe.length)
      : OUTIL_CLOTURE;
    const altere: Manifeste = { ...propre, tools: [{ ...premier, name: local }] };

    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    console.info(
      `[garde nom réservé] nom éprouvé « ${local} » (réservé « ${OUTIL_CLOTURE} ») — ` +
        `motifs : ${motifs(resultat).join(", ")}`,
    );

    expect(motifs(resultat)).toContain("nom_reserve_au_socle");

    // CONTRE-TÉMOIN : un nom voisin, mais distinct, passe. Sans lui, la garde
    // serait indistinguable d'un registre qui refuse tout.
    const voisin: Manifeste = {
      ...propre,
      tools: [{ ...premier, name: `${local}-bis` }],
    };
    const admis = enregistrerAdaptateur({
      manifesteBrut: voisin,
      verrou: verrouPour(voisin),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(admis)).not.toContain("nom_reserve_au_socle");
  });

  it("refuse une version ou un mode divergents de l'épinglage", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      // Le verrou garde l'empreinte cohérente mais annonce une autre version :
      // l'incohérence est alors visible SANS l'empreinte, et doit être nommée.
      verrou: verrouPour(manifeste, { version: "2.0.0" }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("epinglage_incoherent");
  });

  it("refuse un document qui n'a pas la forme d'un manifeste", () => {
    const resultat = enregistrerAdaptateur({
      manifesteBrut: { id: "axionia" },
      verrou: verrouPour(manifesteTemoin()),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("manifeste_malforme");
    expect(resultat.outilsInspectes).toBe(0);
  });

  it("refuse un `effect` inconnu venu d'un adaptateur d'un autre langage", () => {
    const propre = manifesteTemoin();
    const premier = propre.tools[0];
    if (premier === undefined) return;
    const altere = {
      ...propre,
      tools: [{ ...premier, effect: "lecture" }],
    };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere as unknown as Manifeste),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).toContain("manifeste_malforme");
  });

  it("refuse un manifeste SANS AUCUN OUTIL — sinon l'admission inspecte zéro outil", () => {
    // TÉMOIN FABRIQUÉ À LA MAIN, comme le ferait le CRM en PHP : le kit refuse
    // déjà `tools: []` au build, mais ce refus-là ne protège qu'un adaptateur
    // TypeScript. Le registre est la SEULE barrière pour les autres langages, et
    // il admettait ce manifeste en annonçant « 0 outil inspecté ».
    const propre = manifesteTemoin();
    const altere: Manifeste = { ...propre, tools: [] };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(false);
    expect(motifs(resultat)).toContain("manifeste_malforme");
    expect(resultat.outilsInspectes).toBe(0);
  });

  it("refuse un manifeste SANS AUCUN PROFIL — ses outils échapperaient au § 14", () => {
    // Même piège, autre colonne : `ops_tool.profiles` recevait une liste vide,
    // l'outil n'était servi dans aucun profil, et il échappait donc au décompte
    // des « ≤ 40 outils SERVIS par profil » tout en étant enregistré.
    const propre = manifesteTemoin();
    const altere: Manifeste = { ...propre, profiles: [] };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(false);
    expect(motifs(resultat)).toContain("manifeste_malforme");
  });

  it("refuse un `bytes` MENSONGER — l'unité du budget du § 14 est recalculée", () => {
    // TÉMOIN DÉCISIF. `bytes` est ANNONCÉ par le manifeste et il est
    // intégralement DÉRIVABLE de ce même manifeste. Il était recopié tel quel
    // dans `ops_tool.bytes` : un adaptateur pouvait déclarer `bytes: 0` sur une
    // définition de plusieurs centaines d'octets, et toute la mesure du budget
    // en dépendait. L'épinglage par empreinte ne rattrape rien — il certifie
    // qu'un humain a relu le document, pas qu'il en a recompté les octets.
    const propre = manifesteTemoin();
    const premier = propre.tools[0];
    expect(premier).toBeDefined();
    if (premier === undefined) return;

    const altere: Manifeste = { ...propre, tools: [{ ...premier, bytes: 0 }] };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      // Le verrou épingle le manifeste MENTEUR : l'empreinte est cohérente, et
      // seule la mesure du contenu peut encore le prendre en défaut.
      verrou: verrouPour(altere),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(false);
    expect(motifs(resultat)).toContain("bytes_incoherent");
    if (resultat.admis) return;
    const refuse = resultat.refus.find((candidat) => candidat.motif === "bytes_incoherent");
    // Le message DIT les deux nombres — jamais un simple « incohérent ».
    expect(refuse?.detail).toContain("0 octets");
    expect(refuse?.detail).toContain(String(premier.bytes));

    console.info(
      `[garde bytes] annoncé 0, mesuré ${String(premier.bytes)} sur ` +
        `${String(propre.tools.length)} outil(s) inspecté(s)`,
    );
  });

  it("laisse passer le `bytes` que le kit a lui-même calculé", () => {
    // Témoin inverse : la garde ne refuse pas un manifeste honnête. Elle prouve
    // aussi que la mesure du registre reproduit EXACTEMENT celle du kit — deux
    // formules qui divergeraient rendraient tout manifeste inadmissible.
    const propre = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: propre,
      verrou: verrouPour(propre),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });
    expect(motifs(resultat)).not.toContain("bytes_incoherent");
    expect(resultat.admis).toBe(true);
  });

  it("rend TOUS les refus, pas le premier", () => {
    const propre = manifesteTemoin({ tools: [outil({ dataClass: "sensitive" })] });
    const altere: Manifeste = { ...propre, profiles: ["inconnu"] };
    const resultat = enregistrerAdaptateur({
      manifesteBrut: altere,
      verrou: verrouPour(propre, { maxDataClass: "internal" }),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    expect(resultat.admis).toBe(false);
    if (resultat.admis) return;
    // Compte mesuré : au moins trois motifs distincts remontent d'un coup.
    expect(new Set(resultat.refus.map((refus) => refus.motif)).size).toBeGreaterThanOrEqual(3);
    for (const refus of resultat.refus) {
      expect(refus.detail.length).toBeGreaterThan(20);
    }
  });
});
