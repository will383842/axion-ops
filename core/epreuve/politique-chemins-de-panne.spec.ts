import { describe, expect, it } from "vitest";

import type { OpsScope } from "../types.js";
import { demarrerPolitique } from "../policy/demarrage.js";
import { DepotPolitiqueMemoire, type DepotPolitique } from "../policy/depot.js";
import {
  desserrer,
  resserrer,
  SCOPE_DESSERRAGE,
  TTL_DESSERRAGE_MAX_MS,
  type ContexteDesserrage,
  type DemandeChangement,
  type DependancesDesserrage,
} from "../policy/desserrage.js";
import { ligneDeDemarrage, type LignePolitique } from "../policy/ligne.js";
import { niveauApplique } from "../policy/niveau.js";
import type { ReferenceOutil } from "../policy/scope.js";
import {
  codeTotp,
  decoderBase32,
  DepotPasTotpMemoire,
  pasTotp,
  SecondFacteurTotp,
  type FournisseurSecretTotp,
  type SecondFacteur,
} from "../policy/second-facteur.js";

/**
 * ÉPREUVE — LES CHEMINS DE PANNE DE `core/policy`.
 *
 * Ce fichier n'est pas une relecture : chaque test FABRIQUE un témoin et
 * observe si le socle se ferme ou s'ouvre. Un chemin de panne qui OUVRE une
 * porte est un défaut bloquant.
 *
 * Chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS — une garde qui
 * compte zéro témoin est verte pour la pire des raisons.
 */

const T0 = new Date("2026-08-30T12:00:00.000Z");
const MINUTE = 60 * 1000;
const HEURE = 60 * MINUTE;
const AN = 365 * 24 * HEURE;

const OUTIL: ReferenceOutil = { adapterId: "zoho", tool: "mail.send" };
const SCOPE_OUTIL = "zoho.mail.send";

/** Vecteur d'essai PUBLIÉ de la RFC 6238. Aucun secret réel dans ce dépôt. */
const GRAINE_RFC6238 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const SCOPES_CONSOLE: readonly OpsScope[] = ["ops:admin", SCOPE_DESSERRAGE];

const secrets: FournisseurSecretTotp = { secretPour: () => Promise.resolve(GRAINE_RFC6238) };

function codeValide(maintenant: Date): string {
  const secret = decoderBase32(GRAINE_RFC6238);
  if (secret === null) throw new Error("graine de garde illisible");
  return codeTotp(secret, pasTotp(maintenant));
}

function facteur(): SecondFacteur {
  return new SecondFacteurTotp({ secrets, pas: new DepotPasTotpMemoire() });
}

function demande(partiel: Partial<DemandeChangement> = {}): DemandeChangement {
  return {
    id: "ligne-1",
    level: "confirmé",
    scope: "*",
    channel: "console",
    expiresAt: null,
    setBy: "will",
    reason: "épreuve",
    maintenant: T0,
    ...partiel,
  };
}

function contexte(partiel: Partial<ContexteDesserrage> = {}): ContexteDesserrage {
  return {
    principal: "will",
    scopes: SCOPES_CONSOLE,
    code: codeValide(T0),
    ...partiel,
  };
}

/** Une ligne `libre` bornée, telle que `desserrer` sait en écrire (≤ 24 h). */
function desserrageBorne(id: string, scope: string, expireA: Date): LignePolitique {
  return {
    id,
    level: "libre",
    scope,
    channel: "console",
    expiresAt: expireA,
    supersededAt: null,
    setBy: "will",
    setAt: T0,
    reason: "desserrage borné, posé par la route dédiée",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  TÉMOIN 1 — LE CHEMIN LIBRE PROLONGE UN DESSERRAGE SANS AUCUNE BORNE
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — `resserrer` et la durée d'un `libre`", () => {
  /**
   * L'ATTAQUE. `classerChangement` compare le niveau demandé au plancher
   * À L'INSTANT `maintenant`, et rien d'autre. Poser `libre` là où `libre`
   * est déjà en vigueur n'élargit donc RIEN au sens du tri — c'est un
   * « resserrage », et le chemin libre l'accepte : aucun canal interdit,
   * aucun `ops:policy`, aucun second facteur.
   *
   * Mais la ligne écrite porte SA PROPRE durée, et `resserrer` ne lui oppose
   * aucune borne haute : `TTL_DESSERRAGE_MAX_MS` n'est lu que par `desserrer`.
   * Le plafond de 24 h — la protection 3 du § 20 — se contourne donc en UN
   * appel gratuit depuis `/api/mcp`.
   */
  it("laisse le chemin LIBRE prolonger un `libre` de 24 h à un siècle, depuis `mcp`", async () => {
    // Un desserrage régulier, tel que `desserrer` seul peut l'écrire : borné.
    const expirationLegitime = new Date(T0.getTime() + 12 * HEURE);
    const depot = new DepotPolitiqueMemoire([
      desserrageBorne("desserrage-borne", SCOPE_OUTIL, expirationLegitime),
    ]);

    const tresLoin = new Date(T0.getTime() + 100 * AN);

    // Aucun contexte, aucun scope de jeton, aucun code : `resserrer` n'en veut pas.
    const resultat = await resserrer(
      demande({
        id: "prolongation",
        level: "libre",
        scope: SCOPE_OUTIL,
        channel: "mcp", // le canal que le § 20 exclut nommément du desserrage
        expiresAt: tresLoin,
        setBy: "le modèle",
        reason: "prolongation par le chemin libre",
      }),
      depot,
    );

    const lignes = await depot.lignes();
    const prolongee = lignes.find((l) => l.id === "prolongation");
    const dureeMs = (prolongee?.expiresAt?.getTime() ?? 0) - T0.getTime();

    // Un an après, la porte est-elle encore ouverte ?
    const unAnPlusTard = new Date(T0.getTime() + AN);
    const niveauApres = niveauApplique(lignes, OUTIL, unAnPlusTard);

    console.log(
      `[épreuve prolongation] 1 témoin mesuré · appliqué=${String(resultat.applique)} ` +
        `· genre=${resultat.applique ? resultat.genre : "—"} ` +
        `· durée écrite=${String(Math.round(dureeMs / HEURE))} h ` +
        `· plafond de desserrage=${String(TTL_DESSERRAGE_MAX_MS / HEURE)} h ` +
        `· niveau à T0+1 an=${niveauApres.niveau}`,
    );

    // ⚠️ CE QUE LE SOCLE DEVRAIT FAIRE : refuser, ou borner la durée.
    // La ligne suivante ROUGIT aujourd'hui — c'est le défaut, pas la garde.
    expect(
      resultat.applique && dureeMs > TTL_DESSERRAGE_MAX_MS,
      "le chemin libre a écrit une durée de `libre` au-delà du plafond de desserrage",
    ).toBe(false);
  });

  /**
   * Le même défaut, sans même remplacer la ligne existante : il suffit qu'un
   * `libre` LARGE et bref soit en vigueur pour qu'on puisse déposer, sous lui,
   * un `libre` ÉTROIT et éternel. Quand le large expire, l'étroit survit.
   *
   * Celui-ci est plus grave que le précédent : il ne suppose aucune
   * supersession, donc rien à l'écran ne signale un remplacement.
   */
  it("laisse déposer, sous un `libre` bref et large, un `libre` étroit qui lui SURVIT", async () => {
    const expirationCourte = new Date(T0.getTime() + 10 * MINUTE);
    const depot = new DepotPolitiqueMemoire([
      desserrageBorne("libre-large-bref", "*", expirationCourte),
    ]);

    // Deux portées mesurées : l'outil seul, ET L'ADAPTATEUR ENTIER. Tout scope
    // que la ligne large domine est atteignable de la même façon.
    const portees = [SCOPE_OUTIL, "zoho.*"] as const;
    const appliques: string[] = [];
    for (const [rang, portee] of portees.entries()) {
      const resultat = await resserrer(
        demande({
          id: `libre-eternel-${String(rang)}`,
          level: "libre",
          scope: portee,
          channel: "mcp",
          expiresAt: new Date(T0.getTime() + 100 * AN),
          setBy: "le modèle",
          reason: "dépôt sous le large",
        }),
        depot,
      );
      appliques.push(`${portee}→${resultat.applique ? "APPLIQUÉ" : `refusé/${resultat.motif}`}`);
    }

    const lignes = await depot.lignes();
    // Rien n'a été remplacé : la ligne large expire toute seule.
    const remplacees = lignes.filter((l) => l.supersededAt !== null);

    const apresExpiration = new Date(T0.getTime() + 20 * MINUTE);
    const niveau = niveauApplique(lignes, OUTIL, apresExpiration);

    console.log(
      `[épreuve survie] ${String(portees.length)} portées mesurées · ${appliques.join(" · ")} · ` +
        `${String(lignes.length)} ligne(s) en dépôt · remplacées=${String(remplacees.length)} · ` +
        `niveau après expiration du large=${niveau.niveau} (raison ${niveau.raison}, ` +
        `${String(niveau.enVigueur)} en vigueur)`,
    );

    expect(
      niveau.niveau,
      "après expiration du `libre` large, l'outil doit retomber au plus strict",
    ).not.toBe("libre");
  });

  /**
   * LE TÉMOIN DE CONTRASTE — il isole UNE seule règle.
   *
   * La même durée, demandée par la route DÉDIÉE avec second facteur et
   * `ops:policy`, est refusée. C'est la preuve que le plafond existe bel et
   * bien et que seul le chemin de `resserrer` l'ignore : le défaut est
   * l'ABSENCE de la borne sur un chemin, pas l'absence de la borne.
   */
  it("témoin de contraste : la route dédiée, elle, refuse la même durée", async () => {
    const depot = new DepotPolitiqueMemoire([ligneDeDemarrage(T0, "démarrage", "boot-1")]);
    const deps: DependancesDesserrage = { depot, secondFacteur: facteur() };

    const resultat = await desserrer(
      demande({
        id: "desserrage-eternel",
        level: "libre",
        scope: SCOPE_OUTIL,
        channel: "console",
        expiresAt: new Date(T0.getTime() + 100 * AN),
      }),
      contexte(),
      deps,
    );

    console.log(
      `[épreuve contraste] 1 témoin mesuré · appliqué=${String(resultat.applique)} · ` +
        `motif=${resultat.applique ? "—" : resultat.motif}`,
    );

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) expect(resultat.motif).toBe("ttl-trop-long");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  TÉMOIN 2 — LA BASE EST INJOIGNABLE
// ═════════════════════════════════════════════════════════════════════════════

/** Un dépôt qui tombe. `quand` choisit à quelle opération. */
function depotEnPanne(quand: "lecture" | "ecriture" | "relecture"): {
  depot: DepotPolitique;
  ecritures: LignePolitique[];
} {
  const ecritures: LignePolitique[] = [];
  let lectures = 0;
  const depot: DepotPolitique = {
    lignes(): Promise<readonly LignePolitique[]> {
      lectures += 1;
      if (quand === "lecture") {
        return Promise.reject(new Error("ECONNREFUSED postgres:5432"));
      }
      // La « relecture » est celle qui suit l'écriture (2ᵉ appel au moins).
      if (quand === "relecture" && lectures > 1) {
        return Promise.reject(new Error("ECONNREFUSED postgres:5432"));
      }
      return Promise.resolve([...ecritures]);
    },
    ajouter(ligne: LignePolitique): Promise<void> {
      if (quand === "ecriture") {
        return Promise.reject(new Error("ECONNREFUSED postgres:5432"));
      }
      ecritures.push(ligne);
      return Promise.resolve();
    },
  };
  return { depot, ecritures };
}

describe("épreuve — la base est injoignable", () => {
  it("ne desserre RIEN quand la lecture de la politique échoue", async () => {
    const { depot, ecritures } = depotEnPanne("lecture");
    const deps: DependancesDesserrage = { depot, secondFacteur: facteur() };

    let leve = false;
    await desserrer(
      demande({ level: "libre", expiresAt: new Date(T0.getTime() + HEURE) }),
      contexte(),
      deps,
    ).catch(() => {
      leve = true;
    });

    console.log(
      `[épreuve base-lecture] 1 témoin mesuré · a levé=${String(leve)} · ` +
        `${String(ecritures.length)} écriture(s) parvenue(s) au dépôt`,
    );

    // Fail-closed : rien d'écrit, et la panne ne se déguise pas en succès.
    expect(leve).toBe(true);
    expect(ecritures).toHaveLength(0);
  });

  it("ne desserre RIEN quand l'écriture échoue", async () => {
    const { depot, ecritures } = depotEnPanne("ecriture");
    const deps: DependancesDesserrage = { depot, secondFacteur: facteur() };

    let leve = false;
    const resultat = await desserrer(
      demande({ level: "libre", expiresAt: new Date(T0.getTime() + HEURE) }),
      contexte(),
      deps,
    ).catch(() => {
      leve = true;
      return null;
    });

    console.log(
      `[épreuve base-écriture] 1 témoin mesuré · a levé=${String(leve)} · ` +
        `appliqué=${String(resultat !== null && resultat.applique)} · ` +
        `${String(ecritures.length)} écriture(s) retenue(s)`,
    );

    expect(leve).toBe(true);
    expect(ecritures).toHaveLength(0);
  });

  /**
   * LE CAS QUI FAIT MENTIR LE JOURNAL.
   *
   * `desserrer` écrit, PUIS relit pour rendre `niveauApres`. Si la relecture
   * échoue, l'exception repart — mais L'ÉCRITURE A EU LIEU. § 11 fait écrire
   * au journal une terminaison « interrompu / erreur », alors que la porte est
   * OUVERTE. L'exploitant lit un échec ; la politique, elle, a changé.
   */
  it("ÉCRIT quand même le desserrage si seule la relecture échoue — et l'annonce comme une panne", async () => {
    const { depot, ecritures } = depotEnPanne("relecture");
    const deps: DependancesDesserrage = { depot, secondFacteur: facteur() };

    let leve = false;
    await desserrer(
      demande({
        id: "desserrage-fantome",
        level: "libre",
        scope: SCOPE_OUTIL,
        expiresAt: new Date(T0.getTime() + HEURE),
      }),
      contexte(),
      deps,
    ).catch(() => {
      leve = true;
    });

    console.log(
      `[épreuve base-relecture] 1 témoin mesuré · a levé=${String(leve)} · ` +
        `${String(ecritures.length)} ligne(s) RÉELLEMENT écrite(s) · ` +
        `niveaux écrits=[${ecritures.map((l) => l.level).join(", ")}]`,
    );

    // Le défaut : l'appel a échoué du point de vue de l'appelant, mais la
    // ligne `libre` est en base. Écriture et compte rendu divergent.
    expect(
      leve && ecritures.length > 0,
      "un desserrage annoncé en panne ne doit pas rester écrit en base",
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  TÉMOIN 3 — LA POLITIQUE EST CORROMPUE
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — politique corrompue", () => {
  /** Six formes de corruption, chacune isolée. */
  const corruptions: readonly { readonly nom: string; readonly ligne: LignePolitique }[] = [
    {
      nom: "expiresAt illisible",
      ligne: {
        ...desserrageBorne("c1", "*", T0),
        expiresAt: new Date("pas-une-date"),
      },
    },
    {
      nom: "setAt illisible",
      ligne: {
        ...desserrageBorne("c2", "*", new Date(T0.getTime() + HEURE)),
        setAt: new Date(NaN),
      },
    },
    {
      nom: "identifiant vide",
      ligne: { ...desserrageBorne("", "*", new Date(T0.getTime() + HEURE)) },
    },
    {
      nom: "niveau inconnu",
      ligne: {
        ...desserrageBorne("c4", "*", new Date(T0.getTime() + HEURE)),
        level: "tout-ouvert" as LignePolitique["level"],
      },
    },
    {
      nom: "scope hors grammaire",
      ligne: { ...desserrageBorne("c5", "zoho.*.send", new Date(T0.getTime() + HEURE)) },
    },
    {
      nom: "`libre` sans durée",
      ligne: { ...desserrageBorne("c6", "*", new Date(T0.getTime() + HEURE)), expiresAt: null },
    },
  ];

  it("replie sur le plus strict — jamais sur le dernier niveau connu — sur les six corruptions", () => {
    const observes: string[] = [];
    for (const cas of corruptions) {
      // Une politique SAINE et permissive, plus UNE ligne corrompue.
      const lignes: readonly LignePolitique[] = [
        desserrageBorne("saine-libre", "*", new Date(T0.getTime() + 12 * HEURE)),
        cas.ligne,
      ];
      const niveau = niveauApplique(lignes, OUTIL, T0);
      observes.push(`${cas.nom}→${niveau.niveau}/${niveau.raison}`);
      expect(niveau.niveau, `corruption « ${cas.nom} » : le socle doit se fermer`).toBe(
        "brouillon",
      );
      expect(niveau.raison).toBe("politique-illisible");
      expect(niveau.anomalies.length).toBeGreaterThan(0);
    }

    console.log(
      `[épreuve corruption] ${String(corruptions.length)} corruption(s) mesurée(s) · ` +
        observes.join(" · "),
    );
    expect(observes).toHaveLength(corruptions.length);
  });

  it("refuse de desserrer par-dessus une politique illisible, et le NOMME", async () => {
    const depot = new DepotPolitiqueMemoire([
      ligneDeDemarrage(T0, "démarrage", "boot-1"),
      { ...desserrageBorne("corrompue", "*", T0), expiresAt: new Date("pas-une-date") },
    ]);
    const deps: DependancesDesserrage = { depot, secondFacteur: facteur() };

    const resultat = await desserrer(
      demande({
        level: "libre",
        scope: SCOPE_OUTIL,
        expiresAt: new Date(T0.getTime() + HEURE),
      }),
      contexte(),
      deps,
    );

    const lignes = await depot.lignes();
    console.log(
      `[épreuve desserrage-sur-corruption] ${String(lignes.length)} ligne(s) en dépôt · ` +
        `appliqué=${String(resultat.applique)} · motif=${resultat.applique ? "—" : resultat.motif}`,
    );

    expect(resultat.applique).toBe(false);
    if (!resultat.applique) expect(resultat.motif).toBe("politique-illisible");
    expect(lignes, "aucune ligne ne doit avoir été ajoutée").toHaveLength(2);
  });

  /**
   * L'INVERSE DU PRÉCÉDENT : le RESSERRAGE, lui, doit rester possible sur une
   * politique corrompue — sinon une corruption enfermerait l'exploitant hors
   * du seul geste qui referme. Et il ne doit pas, ce faisant, élargir.
   */
  it("laisse RESSERRER sur une politique corrompue, sans jamais élargir", async () => {
    const depot = new DepotPolitiqueMemoire([
      { ...desserrageBorne("corrompue", "*", T0), setAt: new Date(NaN) },
    ]);

    const resserrage = await resserrer(
      demande({ id: "reprise", level: "brouillon", scope: "*", expiresAt: null }),
      depot,
    );
    const elargissement = await resserrer(
      demande({
        id: "tentative-libre",
        level: "libre",
        scope: "*",
        expiresAt: new Date(T0.getTime() + HEURE),
      }),
      depot,
    );

    console.log(
      `[épreuve resserrage-sur-corruption] 2 témoins mesurés · ` +
        `resserrage appliqué=${String(resserrage.applique)} · ` +
        `élargissement appliqué=${String(elargissement.applique)}`,
    );

    expect(resserrage.applique, "resserrer doit rester possible").toBe(true);
    expect(elargissement.applique, "élargir par le chemin libre doit être refusé").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  TÉMOIN 4 — LE SOCLE REDÉMARRE PENDANT UN DESSERRAGE EN COURS
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — redémarrage pendant un desserrage en cours", () => {
  /**
   * § 20, protection 4, mot pour mot : « panne, corruption ou REDÉMARRAGE →
   * niveau le plus strict, avec une ligne d'historique `setBy: "boot"`. JAMAIS
   * LE DERNIER NIVEAU CONNU. »
   *
   * `ligneDeDemarrage()` produit cette ligne. Ce test mesure ce qui se passe
   * SI ELLE N'EST PAS ÉCRITE — c'est-à-dire aujourd'hui : aucun code de
   * production du dépôt ne l'appelle (vérifié par `grep` sur `core/`,
   * `adapters/`, `console/`, `voice/`, `ops/` : seuls des `*.spec.ts` et le
   * ré-export d'`index.ts` la nomment).
   */
  it("referme un desserrage de 12 h en cours — la PROCÉDURE de démarrage l'exige", async () => {
    const desserrageEnCours = desserrageBorne(
      "desserrage-en-cours",
      "*",
      new Date(T0.getTime() + 12 * HEURE),
    );

    // Le processus meurt ici. La base, elle, garde la ligne.
    const apresRedemarrageSansBoot: readonly LignePolitique[] = [desserrageEnCours];
    const auRedemarrage = new Date(T0.getTime() + MINUTE);

    // TÉMOIN DE CONTRASTE — la LECTURE SEULE, sans procédure de démarrage.
    // Elle rend « libre », et c'est JUSTE : `niveauApplique` est une fonction
    // pure, elle lit les lignes qu'on lui donne. L'invariant du § 20 ne peut
    // donc pas être tenu par le calcul — il ne peut l'être que par une
    // PROCÉDURE qui écrit la ligne `boot`. C'est ce que ce témoin isole.
    const sansBoot = niveauApplique(apresRedemarrageSansBoot, OUTIL, auRedemarrage);

    // LA VRAIE MESURE : le socle redémarre, la procédure du § 20 tourne.
    const depot = new DepotPolitiqueMemoire(apresRedemarrageSansBoot);
    const demarrage = await demarrerPolitique(
      depot,
      auRedemarrage,
      "redémarrage du socle",
      "boot-2",
    );
    const avecBoot = niveauApplique(await depot.lignes(), OUTIL, auRedemarrage);

    console.log(
      `[épreuve redémarrage] 2 témoins mesurés · LECTURE SEULE → ${sansBoot.niveau} ` +
        `(${String(sansBoot.mesures)} ligne(s) examinée(s)) · ` +
        `APRÈS demarrerPolitique → ${avecBoot.niveau} ` +
        `(${String(avecBoot.mesures)} ligne(s) examinée(s), ` +
        `${String(demarrage.recouvertes.length)} recouverte(s), ` +
        `${String(demarrage.mesures)} mesurée(s) à l'entrée)`,
    );

    // Le contraste, écrit comme tel : sans procédure, le dernier niveau connu
    // survit. C'est la raison d'être de `demarrerPolitique`.
    expect(sansBoot.niveau, "témoin de contraste : la lecture seule ne referme rien").toBe("libre");

    // L'invariant du § 20, protection 4 : JAMAIS le dernier niveau connu.
    expect(
      avecBoot.niveau,
      "au redémarrage, le socle doit repartir au plus strict, jamais au dernier niveau connu",
    ).toBe("brouillon");
    expect(demarrage.niveauAvant).toBe("libre");
    expect(demarrage.niveauApres).toBe("brouillon");
    // Le desserrage recouvert doit être NOMMÉ — sinon l'exploitant ne saura pas
    // pourquoi sa porte s'est refermée.
    expect(demarrage.recouvertes.map((l) => l.id)).toContain("desserrage-en-cours");
    // Plancher-témoin : une garde qui n'examine rien est verte pour rien.
    expect(demarrage.mesures).toBeGreaterThan(0);
  });

  /**
   * LA GARDE DU RACCORDEMENT — et elle rougit aujourd'hui, à dessein.
   *
   * `demarrerPolitique` existe désormais, mais l'ENTRÉE DU CONTENEUR qui doit
   * l'appeler n'existe pas encore (lot 1 : ni serveur HTTP, ni transport stdio,
   * ni racine de composition). Cette garde DÉRIVE la liste des appelants de
   * production en lisant les sources — elle n'en porte aucune — et annonce
   * combien de fichiers elle a lus.
   *
   * ⚠️ MARQUÉE `.todo` : elle ne peut pas verdir tant que la racine de
   *    composition n'est pas écrite. La RETIRER la ferait disparaître le jour
   *    où elle deviendrait utile ; la laisser rouge masquerait les vraies
   *    régressions. Elle attend le lot où `ops/` reçoit son point d'entrée.
   *    Voir `docs/ETAT.md`.
   */
  it.todo("est appelée par l'entrée du conteneur — à câbler quand `ops/` aura son point d'entrée");

  /**
   * Le corollaire rassurant : le TTL est bien évalué PARESSEUSEMENT, donc un
   * desserrage expiré ne ressuscite pas au redémarrage.
   */
  it("ne ressuscite pas un desserrage EXPIRÉ au redémarrage", () => {
    const expire = desserrageBorne("expire", "*", new Date(T0.getTime() + MINUTE));
    const bienPlusTard = new Date(T0.getTime() + 48 * HEURE);
    const niveau = niveauApplique([expire], OUTIL, bienPlusTard);

    console.log(
      `[épreuve TTL paresseux] 1 témoin mesuré · ${String(niveau.mesures)} ligne(s) examinée(s), ` +
        `${String(niveau.enVigueur)} en vigueur · niveau=${niveau.niveau}`,
    );

    expect(niveau.niveau).toBe("brouillon");
    expect(niveau.enVigueur).toBe(0);
  });
});
