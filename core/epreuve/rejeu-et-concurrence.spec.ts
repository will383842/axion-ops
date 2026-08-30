import { describe, expect, it } from "vitest";

import {
  DepotJetonsConfirmationMemoire,
  emettreConfirmation,
  verifierEtConsommer,
  type AppelAConfirmer,
  type DependancesConfirmation,
} from "../policy/confirmation.js";
import {
  DepotPasTotpMemoire,
  SecondFacteurTotp,
  codeTotp,
  decoderBase32,
  pasTotp,
  type FournisseurSecretTotp,
} from "../policy/second-facteur.js";
import {
  reserver,
  type DemandeReservation,
  type DepotIdempotence,
  type LigneIdempotence,
} from "../limits/idempotency.js";
import { correspondance } from "./outils.js";

/**
 * ÉPREUVE — REJEU ET CONCURRENCE.
 *
 * Trois questions, une par section : un jeton de confirmation peut-il servir
 * deux fois ? deux appels concurrents portant la même clé d'idempotence
 * peuvent-ils passer tous les deux ? un code de second facteur se rejoue-t-il ?
 *
 * Chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

const T0 = new Date("2026-08-30T12:00:00.000Z");
const MINUTE = 60 * 1000;

/** Sel d'épreuve. AUCUN SECRET RÉEL : une chaîne fabriquée pour ce fichier. */
const SEL = "sel-d-epreuve-non-secret";
/** Vecteur d'essai PUBLIÉ de la RFC 6238. */
const GRAINE_RFC6238 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const ARG_A = "a".repeat(64);
const ARG_B = "b".repeat(64);

function deps(sel = SEL): DependancesConfirmation {
  return { depot: new DepotJetonsConfirmationMemoire(), sel };
}

function appel(partiel: Partial<AppelAConfirmer> = {}): AppelAConfirmer {
  return {
    presente: "",
    tool: "zoho.mail.send",
    argHash: ARG_A,
    principal: "will",
    maintenant: T0,
    ...partiel,
  };
}

async function jetonNeuf(d: DependancesConfirmation): Promise<string> {
  const emission = await emettreConfirmation(
    {
      tool: "zoho.mail.send",
      argHash: ARG_A,
      principal: "will",
      canal: "console",
      maintenant: T0,
    },
    d,
  );
  if (!emission.emis) throw new Error(`émission refusée : ${emission.motif}`);
  return emission.valeur;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE JETON DE CONFIRMATION
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — le jeton de confirmation rejoué", () => {
  it("refuse le second usage, séquentiellement", async () => {
    const d = deps();
    const valeur = await jetonNeuf(d);

    const premier = await verifierEtConsommer(appel({ presente: valeur }), d);
    const second = await verifierEtConsommer(appel({ presente: valeur }), d);

    console.log(
      `[épreuve rejeu séquentiel] 2 présentations mesurées · ` +
        `1ʳᵉ valide=${String(premier.valide)} · 2ᵈᵉ valide=${String(second.valide)}` +
        (second.valide ? "" : ` (motif ${second.motif})`),
    );

    expect(premier.valide).toBe(true);
    expect(second.valide).toBe(false);
    if (!second.valide) expect(second.motif).toBe("deja-consomme");
  });

  it("n'en laisse passer QU'UN sur douze présentations concurrentes", async () => {
    const d = deps();
    const valeur = await jetonNeuf(d);

    const racers = 12;
    const resultats = await Promise.all(
      Array.from({ length: racers }, () => verifierEtConsommer(appel({ presente: valeur }), d)),
    );
    const gagnants = resultats.filter((r) => r.valide);

    console.log(
      `[épreuve rejeu concurrent] ${String(racers)} présentations mesurées · ` +
        `${String(gagnants.length)} gagnant(s) · ` +
        `motifs des perdants=[${[
          ...new Set(resultats.filter((r) => !r.valide).map((r) => (r.valide ? "" : r.motif))),
        ].join(", ")}]`,
    );

    expect(gagnants).toHaveLength(1);
  });

  /**
   * LA GARDE PRÉCÉDENTE SAIT-ELLE ROUGIR ?
   *
   * Une garde de concurrence peut être verte parce que rien ne s'entrelace, et
   * non parce que le code se défend. On refait donc la MÊME course contre un
   * dépôt délibérément cassé — `consommer` qui décide sur un instantané lu
   * avant, au lieu d'un compare-et-échange sur l'état frais. C'est exactement
   * le défaut que `DepotJetonsConfirmation.consommer` interdit par contrat.
   *
   * Si ce témoin laisse passer plus d'un gagnant, la course est réelle, et la
   * garde d'à côté mesure bien quelque chose.
   */
  it("TÉMOIN — la même course, contre un dépôt non atomique, laisse passer PLUSIEURS jetons", async () => {
    const socle = new DepotJetonsConfirmationMemoire();
    const casse: DependancesConfirmation = {
      sel: SEL,
      depot: {
        enregistrer: (j) => socle.enregistrer(j),
        lire: (jti) => socle.lire(jti),
        taille: () => socle.taille(),
        // LE DÉFAUT FABRIQUÉ : lecture, puis écriture, avec un tour de boucle
        // entre les deux. Aucun compare-et-échange.
        async consommer(jti: string, maintenant: Date): Promise<boolean> {
          const jeton = await socle.lire(jti);
          if (jeton === null || jeton.consommeA !== null) return false;
          await Promise.resolve();
          await socle.enregistrer({ ...jeton, consommeA: maintenant });
          return true;
        },
      },
    };

    const valeur = await jetonNeuf(casse);
    const racers = 12;
    const resultats = await Promise.all(
      Array.from({ length: racers }, () => verifierEtConsommer(appel({ presente: valeur }), casse)),
    );
    const gagnants = resultats.filter((r) => r.valide);

    console.log(
      `[épreuve témoin-de-course] ${String(racers)} présentations mesurées contre un dépôt ` +
        `NON ATOMIQUE · ${String(gagnants.length)} gagnant(s) — la course est donc bien réelle`,
    );

    expect(
      gagnants.length,
      "si le dépôt cassé n'en laisse passer qu'un, la garde d'à côté ne mesure aucune course",
    ).toBeGreaterThan(1);
  });

  /**
   * LE JETON NE DOIT PAS BRÛLER SUR UN APPEL QUI N'EST PAS LE SIEN.
   *
   * Sinon un appelant hostile, en présentant le jeton sur un `argHash`
   * quelconque, ferait perdre sa confirmation à l'humain qui l'attend — un
   * déni de service à un appel de distance.
   */
  it("ne se consomme PAS quand la liaison échoue — cinq liaisons rompues mesurées", async () => {
    const d = deps();
    const valeur = await jetonNeuf(d);

    const rompues: readonly { readonly nom: string; readonly appel: AppelAConfirmer }[] = [
      { nom: "argHash différent", appel: appel({ presente: valeur, argHash: ARG_B }) },
      { nom: "outil différent", appel: appel({ presente: valeur, tool: "zoho.mail.delete" }) },
      { nom: "principal différent", appel: appel({ presente: valeur, principal: "quentin" }) },
      {
        nom: "expiré",
        appel: appel({ presente: valeur, maintenant: new Date(T0.getTime() + 10 * MINUTE) }),
      },
      { nom: "empreinte truquée", appel: appel({ presente: `${valeur}X` }) },
    ];

    const motifs: string[] = [];
    for (const cas of rompues) {
      const r = await verifierEtConsommer(cas.appel, d);
      expect(r.valide, `« ${cas.nom} » ne doit pas valider`).toBe(false);
      motifs.push(`${cas.nom}→${r.valide ? "?" : r.motif}`);
    }

    // Le jeton légitime doit AVOIR SURVÉCU à ces cinq tentatives.
    const legitime = await verifierEtConsommer(appel({ presente: valeur }), d);

    console.log(
      `[épreuve liaison] ${String(rompues.length)} liaisons rompues mesurées · ` +
        motifs.join(" · ") +
        ` · jeton légitime encore valide=${String(legitime.valide)}`,
    );

    expect(legitime.valide, "un jeton légitime ne doit pas être brûlé par un tiers").toBe(true);
  });

  /**
   * LE COFFRE A ÉTÉ REFERMÉ, PUIS ROUVERT SOUS UNE AUTRE CLÉ. Les jetons émis
   * sous l'ancien sel ne doivent PAS valider — sans quoi la rotation de clé
   * laisserait une porte derrière elle.
   */
  it("refuse un jeton émis sous un AUTRE sel de coffre", async () => {
    const ancien = deps("ancien-sel-d-epreuve");
    const valeur = await jetonNeuf(ancien);

    // Le même dépôt, un sel neuf : c'est ce que voit le socle après rotation.
    const apresRotation: DependancesConfirmation = {
      depot: ancien.depot,
      sel: "nouveau-sel-d-epreuve",
    };
    const r = await verifierEtConsommer(appel({ presente: valeur }), apresRotation);

    console.log(
      `[épreuve rotation de sel] ${String(await ancien.depot.taille())} jeton(s) en dépôt mesuré(s) · ` +
        `valide=${String(r.valide)}${r.valide ? "" : ` (motif ${r.motif})`}`,
    );

    expect(r.valide).toBe(false);
  });

  /**
   * LE COFFRE EST VERROUILLÉ : le sel est vide. La vérification doit se
   * FERMER — jamais valider, jamais rendre « invalide » en silence sur un
   * HMAC sans secret.
   */
  it("se ferme, sans valider, quand le sel du coffre manque", async () => {
    const d = deps();
    const valeur = await jetonNeuf(d);

    const coffreVerrouille: DependancesConfirmation = { depot: d.depot, sel: "" };

    let leve = false;
    let valide = false;
    await verifierEtConsommer(appel({ presente: valeur }), coffreVerrouille)
      .then((r) => {
        valide = r.valide;
      })
      .catch(() => {
        leve = true;
      });

    console.log(
      `[épreuve sel absent] 1 témoin mesuré · a levé=${String(leve)} · a validé=${String(valide)}`,
    );

    expect(valide, "un HMAC sans secret ne doit JAMAIS valider").toBe(false);
    expect(leve, "l'absence de sel doit être bruyante, pas silencieuse").toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE SECOND FACTEUR
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — le code de second facteur rejoué", () => {
  it("refuse le même code une seconde fois, et sur douze essais concurrents", async () => {
    const secrets: FournisseurSecretTotp = {
      secretPour: () => Promise.resolve(GRAINE_RFC6238),
    };
    const graine = decoderBase32(GRAINE_RFC6238);
    if (graine === null) throw new Error("graine d'épreuve illisible");
    const code = codeTotp(graine, pasTotp(T0));

    const facteur = new SecondFacteurTotp({ secrets, pas: new DepotPasTotpMemoire() });
    const essais = 12;
    const resultats = await Promise.all(
      Array.from({ length: essais }, () =>
        facteur.verifier({ principal: "will", code, maintenant: T0 }),
      ),
    );
    const gagnants = resultats.filter((r) => r.valide);

    console.log(
      `[épreuve rejeu TOTP] ${String(essais)} essais concurrents mesurés sur le MÊME code · ` +
        `${String(gagnants.length)} accepté(s)`,
    );

    expect(gagnants).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'IDEMPOTENCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un dépôt d'idempotence qui TIENT le contrat écrit dans `idempotency.ts` :
 * insertion conditionnelle atomique, remplacement conditionnel, reprise
 * conditionnelle. La mutation de la `Map` est synchrone — c'est ce qui rend le
 * compare-et-échange réel dans la boucle d'événements.
 */
class DepotIdempotenceAtomique implements DepotIdempotence {
  private readonly lignes = new Map<string, LigneIdempotence>();
  public inserts = 0;

  private static cle(tool: string, key: string): string {
    return `${tool} ${key}`;
  }

  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdempotenceAtomique.cle(ligne.tool, ligne.key);
    if (this.lignes.has(cle)) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    this.inserts += 1;
    return Promise.resolve(true);
  }

  lire(tool: string, key: string): Promise<LigneIdempotence | null> {
    return Promise.resolve(this.lignes.get(DepotIdempotenceAtomique.cle(tool, key)) ?? null);
  }

  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean> {
    const cle = DepotIdempotenceAtomique.cle(ligne.tool, ligne.key);
    const actuelle = this.lignes.get(cle);
    if (actuelle === undefined || actuelle.expiresAt.getTime() > maintenant.getTime()) {
      return Promise.resolve(false);
    }
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdempotenceAtomique.cle(ligne.tool, ligne.key);
    const actuelle = this.lignes.get(cle);
    if (actuelle === undefined || actuelle.status !== "failed") return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: "done" | "failed";
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void> {
    const cle = DepotIdempotenceAtomique.cle(params.tool, params.key);
    const actuelle = this.lignes.get(cle);
    if (actuelle !== undefined) {
      this.lignes.set(cle, {
        ...actuelle,
        status: params.status,
        resultRef: params.resultRef,
        completedAt: params.completedAt,
      });
    }
    return Promise.resolve();
  }

  /** Signal POSITIF : combien de lignes le dépôt tient. */
  get taille(): number {
    return this.lignes.size;
  }
}

function reservation(
  depot: DepotIdempotence,
  partiel: Partial<DemandeReservation> = {},
): DemandeReservation {
  return {
    depot,
    calcul: correspondance,
    tool: "zoho.mail.send",
    mode: "key",
    key: "cle-1",
    argHash: ARG_A,
    ttlMs: 10 * MINUTE,
    maintenant: T0,
    ...partiel,
  };
}

describe("épreuve — deux appels concurrents sous la même clé d'idempotence", () => {
  it("n'en réserve QU'UN sur huit appels concurrents identiques", async () => {
    const depot = new DepotIdempotenceAtomique();

    const racers = 8;
    const resultats = await Promise.all(
      Array.from({ length: racers }, () => reserver(reservation(depot))),
    );
    const reservees = resultats.filter((r) => r.type === "reservee");
    const refus = resultats.filter((r) => r.type === "refus");

    console.log(
      `[épreuve idempotence concurrente] ${String(racers)} appels mesurés · ` +
        `${String(reservees.length)} réservation(s) · ${String(refus.length)} refus · ` +
        `${String(depot.taille)} ligne(s) en dépôt · ${String(depot.inserts)} insertion(s) réussie(s)`,
    );

    expect(reservees).toHaveLength(1);
    expect(depot.taille).toBe(1);
    for (const r of refus) {
      if (r.type === "refus") expect(r.code).toBe("conflict");
    }
  });

  it("refuse — jamais ne sert l'autre résultat — quand la clé revient avec un AUTRE argument", async () => {
    const depot = new DepotIdempotenceAtomique();

    const premiere = await reserver(reservation(depot));
    expect(premiere.type).toBe("reservee");
    await depot.cloturer({
      tool: "zoho.mail.send",
      key: "cle-1",
      status: "done",
      resultRef: "ref-du-premier-appel",
      completedAt: T0,
    });

    const seconde = await reserver(reservation(depot, { argHash: ARG_B }));

    console.log(
      `[épreuve clé recyclée] 2 appels mesurés sur la même clé · ` +
        `type=${seconde.type}` +
        (seconde.type === "refus" ? ` code=${seconde.code}` : "") +
        (seconde.type === "rejeu" ? ` resultRef=${String(seconde.resultRef)}` : ""),
    );

    expect(seconde.type).toBe("refus");
    if (seconde.type === "refus") expect(seconde.code).toBe("invalid_input");
  });

  /**
   * LA DURÉE DE RÉSERVATION N'EST BORNÉE PAR RIEN.
   *
   * `reserver` calcule `expiresAt = maintenant + ttlMs` sans jamais vérifier
   * que `ttlMs` est un nombre fini. Un `ttlMs` non fini produit une
   * `Invalid Date`, dont le `getTime()` vaut `NaN` : la comparaison de péremption
   * `expiresAt <= maintenant` est alors TOUJOURS fausse, et la clé ne se libère
   * PLUS JAMAIS. Toutes les autres bornes du socle (`TTL_CONFIRMATION_MAX_MS`,
   * `TTL_DESSERRAGE_MAX_MS`) sont explicites ; celle-ci manque.
   */
  it("borne la durée de réservation — un `ttlMs` non fini ne doit pas figer la clé", async () => {
    const depot = new DepotIdempotenceAtomique();

    const posee = await reserver(reservation(depot, { ttlMs: Number.POSITIVE_INFINITY }));
    const expiresAt = posee.type === "reservee" ? posee.ligne.expiresAt : null;

    // Très loin dans le futur : la clé devrait être libre depuis longtemps.
    const dansMilleAns = new Date(T0.getTime() + 1000 * 365 * 24 * 3600 * 1000);
    const plusTard = await reserver(
      reservation(depot, { argHash: ARG_B, maintenant: dansMilleAns }),
    );

    console.log(
      `[épreuve ttl non borné] 2 appels mesurés · expiresAt écrit=${String(expiresAt)} ` +
        `(lisible=${String(expiresAt !== null && Number.isFinite(expiresAt.getTime()))}) · ` +
        `reprise dans 1000 ans → type=${plusTard.type}` +
        (plusTard.type === "refus" ? ` code=${plusTard.code}` : ""),
    );

    expect(
      posee.type === "reservee" && !Number.isFinite(posee.ligne.expiresAt.getTime()),
      "`reserver` a écrit une date d'expiration illisible : la clé ne se libérera jamais",
    ).toBe(false);
  });
});
