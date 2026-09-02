import { describe, expect, it, vi } from "vitest";

import type { OutilDuCatalogue } from "../chaine/etapes.js";
import type { LigneOpsAdapter } from "../registry/types.js";
import type { RefusDeCoffre } from "../vault/erreurs.js";
import {
  construireRaccordement,
  ErreurRaccordement,
  MOTIFS_RACCORDEMENT,
  nomCompletDeLOutil,
  type LectureDesAdaptateurs,
  type LectureDuCoffre,
  type MotifRaccordement,
} from "./raccordement.js";

/**
 * `core/federe/raccordement.spec.ts` — CHAQUE REFUS A SON TÉMOIN.
 *
 * Un raccordement qui se construirait « au mieux » — une adresse par défaut, un
 * appel sans en-tête, un secret vide présenté tel quel — ne ferait pas échouer
 * ce fichier tout en produisant un 401 que personne ne saurait expliquer. On
 * fabrique donc **une faute à la fois**, et on exige le motif exact.
 *
 * 🔑 Le dernier test confronte la LISTE des motifs à ceux qu'on a su déclencher :
 *    un motif ajouté sans témoin fait rougir. Sans lui, la couverture de ce
 *    fichier se dégraderait en silence à chaque nouveau refus.
 */

const LIGNE_SAINE: LigneOpsAdapter = {
  id: "axionia",
  version: "1.0.0",
  mode: "fédéré",
  authMode: "secret-partage",
  secretRef: "axionia-mcp",
  endpoint: "https://produit.stub.invalid/api/mcp",
  manifestSha: `sha256:${"0".repeat(64)}`,
  trustTier: 2,
  maxDataClass: "personal",
};

function outilDeTemoin(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return {
    adapterId: "axionia",
    adapterVersion: "1.0.0",
    name: "inbox.recent",
    effect: "read",
    dataClass: "personal",
    pagination: "page",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 20_480,
    idFields: ["id"],
    ...surcharge,
  } as OutilDuCatalogue;
}

function adaptateurs(ligne: LigneOpsAdapter | null): LectureDesAdaptateurs {
  return { relire: vi.fn(() => Promise.resolve(ligne)) };
}

function coffre(options: {
  secret?: string;
  refus?: RefusDeCoffre | null;
  leve?: Error;
}): LectureDuCoffre {
  return {
    lire: vi.fn(() => {
      if (options.leve !== undefined) return Promise.reject(options.leve);
      return Promise.resolve(Buffer.from(options.secret ?? "un-secret-de-garde", "utf8"));
    }),
    refusDAppelDOutil: () => options.refus ?? null,
  };
}

const COFFRE_VERROUILLE: RefusDeCoffre = {
  code: "vault_locked",
  etape: 0,
  etat: "verrouillé",
  message: "déverrouiller depuis la console.",
};

/** Ce que chaque témoin a su déclencher — confronté à la liste, tout en bas. */
const motifsDeclenches = new Set<MotifRaccordement>();

async function attendreRefus(
  promesse: Promise<unknown>,
  motif: MotifRaccordement,
): Promise<ErreurRaccordement> {
  try {
    await promesse;
    expect.unreachable(`« ${motif} » devait être refusé`);
  } catch (erreur) {
    expect(erreur, `« ${motif} » : mauvaise classe d'erreur`).toBeInstanceOf(ErreurRaccordement);
    const refus = erreur as ErreurRaccordement;
    expect(refus.motif).toBe(motif);
    motifsDeclenches.add(refus.motif);
    return refus;
  }
  throw new Error("inatteignable");
}

describe("le cas nominal — ce qu'un raccordement complet donne", () => {
  it("rend l'adresse, le secret déchiffré, le nom COMPLET et les idFields", async () => {
    const raccordement = await construireRaccordement(
      outilDeTemoin(),
      adaptateurs(LIGNE_SAINE),
      coffre({ secret: "le-vrai-secret" }),
    );

    expect(raccordement.endpoint).toBe(LIGNE_SAINE.endpoint);
    expect(raccordement.secret).toBe("le-vrai-secret");
    // Le préfixe est DÉRIVÉ de l'adapterId, jamais saisi.
    expect(raccordement.nomComplet).toBe("axionia.inbox.recent");
    expect(raccordement.idFields).toEqual(["id"]);
    expect(raccordement.delaiMs).toBeUndefined();
    console.info(`[raccordement] ${raccordement.nomComplet} → ${raccordement.endpoint}`);
  });

  it("le secret est relu à CHAQUE appel, jamais mémorisé", async () => {
    const lecture = coffre({ secret: "s" });
    await construireRaccordement(outilDeTemoin(), adaptateurs(LIGNE_SAINE), lecture);
    await construireRaccordement(outilDeTemoin(), adaptateurs(LIGNE_SAINE), lecture);
    // ⚠️ Un secret gardé en cache survivrait au verrouillage du coffre, et
    //    l'arrêt d'urgence du § 25 ne serait plus un arrêt.
    expect(lecture.lire).toHaveBeenCalledTimes(2);
  });

  it("transmet un délai quand on lui en donne un, et rien sinon", async () => {
    const avec = await construireRaccordement(
      outilDeTemoin(),
      adaptateurs(LIGNE_SAINE),
      coffre({}),
      { delaiMs: 2_500 },
    );
    expect(avec.delaiMs).toBe(2_500);
  });
});

describe("chaque refus, fabriqué un par un", () => {
  it("adaptateur absent du registre", async () => {
    const refus = await attendreRefus(
      construireRaccordement(outilDeTemoin(), adaptateurs(null), coffre({})),
      "adaptateur_introuvable",
    );
    expect(refus.adapterId).toBe("axionia");
  });

  it("mode « hébergé » — il n'y a rien à joindre par le réseau", async () => {
    await attendreRefus(
      construireRaccordement(
        outilDeTemoin(),
        adaptateurs({ ...LIGNE_SAINE, mode: "hébergé", endpoint: null, authMode: "en-processus" }),
        coffre({}),
      ),
      "mode_non_federe",
    );
  });

  it("endpoint absent — le socle ne fabrique AUCUNE adresse par défaut", async () => {
    for (const endpoint of [null, ""]) {
      await attendreRefus(
        construireRaccordement(
          outilDeTemoin(),
          adaptateurs({ ...LIGNE_SAINE, endpoint }),
          coffre({}),
        ),
        "endpoint_absent",
      );
    }
  });

  it("authMode inattendu — on ne choisit pas l'authentification à la place du registre", async () => {
    await attendreRefus(
      construireRaccordement(
        outilDeTemoin(),
        adaptateurs({ ...LIGNE_SAINE, authMode: "en-processus" }),
        coffre({}),
      ),
      "auth_non_supportee",
    );
  });

  it("secretRef absent — on n'appelle JAMAIS sans en-tête", async () => {
    for (const secretRef of [null, ""]) {
      await attendreRefus(
        construireRaccordement(
          outilDeTemoin(),
          adaptateurs({ ...LIGNE_SAINE, secretRef }),
          coffre({}),
        ),
        "secret_ref_absent",
      );
    }
  });

  it("coffre verrouillé — refusé AVANT tout aller-retour réseau", async () => {
    const lecture = coffre({ refus: COFFRE_VERROUILLE });
    const refus = await attendreRefus(
      construireRaccordement(outilDeTemoin(), adaptateurs(LIGNE_SAINE), lecture),
      "coffre_indisponible",
    );
    // L'état exact, pas un booléen : « absent » et « verrouillé » ne se réparent
    // pas de la même façon.
    expect(refus.message).toContain("verrouillé");
    expect(refus.message).toContain("déverrouiller depuis la console");
    // Et le secret n'a même pas été demandé.
    expect(lecture.lire).not.toHaveBeenCalled();
  });

  it("coffre qui lève — le motif est nommé, le message du coffre n'est PAS recopié", async () => {
    const refus = await attendreRefus(
      construireRaccordement(
        outilDeTemoin(),
        adaptateurs(LIGNE_SAINE),
        coffre({
          leve: Object.assign(new Error("/var/secrets/axionia.age illisible"), {
            name: "ErreurDeCoffre",
          }),
        }),
      ),
      "secret_illisible",
    );
    // ⚠️ Le message du coffre peut nommer un chemin, une version, ou pire.
    expect(refus.message).not.toContain("/var/secrets");
    expect(refus.message).toContain("axionia-mcp");
  });

  it("secret VIDE — refusé ici, où la cause est lisible, plutôt qu'en 401", async () => {
    const refus = await attendreRefus(
      construireRaccordement(outilDeTemoin(), adaptateurs(LIGNE_SAINE), coffre({ secret: "" })),
      "secret_illisible",
    );
    expect(refus.message).toContain("VIDE");
  });
});

describe("le secret ne fuit pas, et le nom complet est dérivé", () => {
  it("aucun refus ne cite la VALEUR du secret", async () => {
    const secret = "valeur-tres-secrete-a-ne-jamais-voir";
    // Un raccordement réussi, puis un refus sur la même configuration : dans les
    // deux cas, le message ne doit pas porter la valeur.
    const ok = await construireRaccordement(
      outilDeTemoin(),
      adaptateurs(LIGNE_SAINE),
      coffre({ secret }),
    );
    expect(ok.secret).toBe(secret);

    const refus = await attendreRefus(
      construireRaccordement(
        outilDeTemoin(),
        adaptateurs({ ...LIGNE_SAINE, endpoint: null }),
        coffre({ secret }),
      ),
      "endpoint_absent",
    );
    expect(refus.message).not.toContain(secret);
  });

  it("le nom complet dérive de l'adapterId — un outil ne saisit jamais son préfixe", () => {
    expect(nomCompletDeLOutil(outilDeTemoin())).toBe("axionia.inbox.recent");
    expect(nomCompletDeLOutil(outilDeTemoin({ adapterId: "zoho-mail", name: "mail.send" }))).toBe(
      "zoho-mail.mail.send",
    );
  });
});

describe("🔑 la couverture des motifs — un refus sans témoin fait rougir", () => {
  it("chacun des motifs déclarés a été déclenché par un témoin de ce fichier", () => {
    const manquants = MOTIFS_RACCORDEMENT.filter((m) => !motifsDeclenches.has(m));
    console.info(
      `[raccordement] ${String(motifsDeclenches.size)} motif(s) déclenché(s) sur ` +
        `${String(MOTIFS_RACCORDEMENT.length)} déclaré(s)`,
    );
    expect(
      manquants,
      "des refus sont déclarés mais jamais éprouvés : ajouter un témoin, ou retirer le motif",
    ).toEqual([]);
  });
});
