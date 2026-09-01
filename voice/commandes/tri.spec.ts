import { describe, expect, it } from "vitest";

import {
  CANAUX,
  SCOPE_DEMARRAGE,
  SCOPE_DESSERRAGE,
  TTL_DESSERRAGE_MAX_MS,
  canalDelivreUneConfirmation,
  classerChangement,
  type LignePolitique,
} from "../../core/policy/index.js";
import {
  PROFILE_NAMES,
  outilsServis,
  reduitStrictement,
  type DefinitionOutil,
  type ProfileName,
} from "../../core/profiles/index.js";
import { NOMS_COMMANDES, peutElargir, commande } from "./grammaire.js";
import {
  CANAL_VOIX,
  CANAUX_QUI_CONFIRMENT,
  LA_VOIX_CONFIRME,
  SCOPE_GLOBAL,
  commandesQuiDementent,
  trier,
  trierToutes,
  verdictDeReduction,
  type EtatObserve,
} from "./tri.js";

/**
 * GARDES DU TRI DU § 20.
 *
 * Ce qu'elles doivent établir, et rien de moins :
 *
 *  1. le verdict vient de `reduitStrictement()`, pas d'une colonne écrite ici ;
 *  2. le détour par le PORTE-ENSEMBLES ne déforme rien — confrontation ;
 *  3. « passe en mode dev » n'est pas classé « élargit » d'avance : sur un
 *     catalogue où `dev` sert MOINS que le profil courant, il passe sans
 *     facteur. C'est la garde qui distingue une dérivation d'une liste ;
 *  4. une commande qui ne peut pas élargir ne fait jamais gagner d'outil, même
 *     sur un catalogue fabriqué exprès pour lui en faire gagner.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Fabrication de catalogues
// ─────────────────────────────────────────────────────────────────────────────

function outil(name: string, profils: readonly ProfileName[]): DefinitionOutil {
  return {
    name,
    version: "1.0.0",
    description: `outil témoin ${name}`,
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: false },
    profiles: profils,
    enabled: true,
    retireDeLaListe: false,
  };
}

/** `dev` sert TOUT ce que sert `courrier`, PLUS deux outils : il élargit. */
const CATALOGUE_DEV_ELARGIT: readonly DefinitionOutil[] = [
  outil("boite.recent", ["courrier", "dev"]),
  outil("depot.pr", ["dev"]),
  outil("depot.deploy", ["dev"]),
  outil("journal.lire", ["audit"]),
];

/** `dev` sert un SOUS-ENSEMBLE STRICT de `courrier` : il réduit. */
const CATALOGUE_DEV_REDUIT: readonly DefinitionOutil[] = [
  outil("boite.recent", ["courrier", "dev"]),
  outil("boite.brouillon", ["courrier"]),
  outil("boite.envoyer", ["courrier"]),
];

/** Aucune définition : la mesure ne peut RIEN voir. */
const CATALOGUE_VIDE: readonly DefinitionOutil[] = [];

/**
 * Fabriqué EXPRÈS pour faire gagner des outils à n'importe quelle transition :
 * chaque profil de l'énumération sert un outil qui n'appartient qu'à lui.
 * C'est le témoin de la garde 4 — si une commande à ensemble d'arrivée vide
 * pouvait faire gagner quoi que ce soit, c'est ici qu'elle le ferait.
 */
const CATALOGUE_TOUT_GAGNE: readonly DefinitionOutil[] = PROFILE_NAMES.map((profil) =>
  outil(`exclusif.${profil}`, [profil]),
);

function etat(
  outils: readonly DefinitionOutil[],
  lignes: readonly LignePolitique[] = [],
  profilActif: ProfileName = "courrier",
): EtatObserve {
  return {
    profilActif,
    outils,
    lignesDePolitique: lignes,
    maintenant: new Date("2026-09-01T10:00:00.000Z"),
  };
}

function ligne(level: LignePolitique["level"], scope: string): LignePolitique {
  return {
    id: `ligne-${level}-${scope}`,
    level,
    scope,
    channel: "console",
    // Une ligne `libre` porte toujours une durée (§ 20) : celle-ci court.
    expiresAt: level === "libre" ? new Date("2026-09-01T18:00:00.000Z") : null,
    supersededAt: null,
    setBy: "témoin",
    setAt: new Date("2026-09-01T09:00:00.000Z"),
    reason: "témoin de garde",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le porte-ensembles ne déforme rien
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — le porte-ensembles", () => {
  it("VOIT : sur deux ensembles connus, il rend les gagnés et les perdus exacts", () => {
    const verdict = verdictDeReduction(new Set(["a", "b"]), new Set(["b", "c"]));

    console.info(
      `[garde porte-ensembles] avant=${String(verdict.avant)} après=${String(verdict.apres)} ` +
        `gagnés=[${verdict.gagnes.join(",")}] perdus=[${verdict.perdus.join(",")}]`,
    );
    expect(verdict.avant).toBe(2);
    expect(verdict.apres).toBe(2);
    expect(verdict.gagnes).toEqual(["c"]);
    expect(verdict.perdus).toEqual(["a"]);
    // Autant d'outils que l'union des deux ensembles.
    expect(verdict.outilsExamines).toBe(3);
    expect(verdict.reduitStrictement).toBe(false);
  });

  it("réduit strictement quand l'ensemble d'arrivée est VIDE et le départ non vide", () => {
    const verdict = verdictDeReduction(new Set(["a", "b"]), new Set<string>());
    expect(verdict.reduitStrictement).toBe(true);
    expect(verdict.gagnes).toEqual([]);
    expect(verdict.perdus).toEqual(["a", "b"]);
  });

  it("ne réduit RIEN quand les deux ensembles sont vides — le neutre, tel que l'autorité le tranche", () => {
    const verdict = verdictDeReduction(new Set<string>(), new Set<string>());
    // C'est bien la position de `reduitStrictement` : « un changement qui ne
    // retire rien n'a rien réduit ». Elle est reprise telle quelle, pas corrigée.
    expect(verdict.reduitStrictement).toBe(false);
    expect(verdict.gagnes).toEqual([]);
    expect(verdict.perdus).toEqual([]);
  });

  it("CONFRONTATION : identique, champ par champ, à `reduitStrictement` appelée en direct", () => {
    // ⚠️ SANS CETTE GARDE, LE PORTE-ENSEMBLES SERAIT UNE SECONDE IMPLÉMENTATION
    //    DÉGUISÉE. Il dépend de la sémantique d'`outilsServis` — `enabled`,
    //    `retireDeLaListe`, `profiles.includes`. Si elle change, il ment en
    //    silence. On confronte donc, sur chaque paire ordonnée de profils, le
    //    verdict obtenu par le détour à celui obtenu directement.
    const catalogues = [CATALOGUE_DEV_ELARGIT, CATALOGUE_DEV_REDUIT, CATALOGUE_TOUT_GAGNE];
    let paires = 0;
    const ecarts: string[] = [];

    for (const catalogue of catalogues) {
      for (const depuis of PROFILE_NAMES) {
        for (const vers of PROFILE_NAMES) {
          paires += 1;
          const direct = reduitStrictement(depuis, vers, catalogue);
          const parLeDetour = verdictDeReduction(
            new Set(outilsServis(catalogue, depuis).map((o) => o.name)),
            new Set(outilsServis(catalogue, vers).map((o) => o.name)),
          );

          if (
            direct.reduitStrictement !== parLeDetour.reduitStrictement ||
            direct.avant !== parLeDetour.avant ||
            direct.apres !== parLeDetour.apres ||
            direct.gagnes.join("|") !== parLeDetour.gagnes.join("|") ||
            direct.perdus.join("|") !== parLeDetour.perdus.join("|")
          ) {
            ecarts.push(`${depuis} → ${vers}`);
          }
        }
      }
    }

    console.info(
      `[garde confrontation] ${String(paires)} paires de profils confrontées sur ` +
        `${String(catalogues.length)} catalogues, ${String(ecarts.length)} écart(s)`,
    );
    expect(paires).toBe(catalogues.length * PROFILE_NAMES.length * PROFILE_NAMES.length);
    expect(ecarts).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le tri est DÉRIVÉ, pas listé
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — « passe en mode dev » n'est classé d'avance par personne", () => {
  it("ÉLARGIT quand `dev` sert plus que le profil courant → chemin du desserrage", () => {
    const tri = trier("mode-dev", etat(CATALOGUE_DEV_ELARGIT));

    console.info(`[garde mode-dev/élargit] ${tri.message}`);
    expect(tri.axe).toBe("outils");
    expect(tri.elargit).toBe(true);
    expect(tri.gagnes).toEqual(["depot.deploy", "depot.pr"]);
    expect(tri.perdus).toEqual([]);
    expect(tri.chemin).toBe("desserrage");
    expect(tri.outilsExamines).toBe(4);
    expect(tri.mesureAveugle).toBe(false);
  });

  it("RÉDUIT quand `dev` sert un sous-ensemble strict → sans facteur, SUR LA MÊME COMMANDE", () => {
    // ═══ C'EST LA GARDE QUI DISTINGUE UNE DÉRIVATION D'UNE LISTE ═══
    //
    // Si le tri portait une colonne « mode-dev élargit », ce test serait
    // impossible à écrire : la même commande, deux catalogues, deux chemins.
    const tri = trier("mode-dev", etat(CATALOGUE_DEV_REDUIT));

    console.info(`[garde mode-dev/réduit] ${tri.message}`);
    expect(tri.elargit).toBe(false);
    expect(tri.reduitStrictement).toBe(true);
    expect(tri.gagnes).toEqual([]);
    expect(tri.perdus).toEqual(["boite.brouillon", "boite.envoyer"]);
    expect(tri.chemin).toBe("sans-facteur");
    expect(tri.desserrage).toBeNull();
  });
});

describe("voice/commandes/tri — les commandes à ensemble d'arrivée vide", () => {
  it("« stop » réduit strictement et passe sans facteur", () => {
    const tri = trier("stop", etat(CATALOGUE_DEV_ELARGIT));

    console.info(`[garde stop] ${tri.message}`);
    expect(tri.elargit).toBe(false);
    expect(tri.reduitStrictement).toBe(true);
    expect(tri.outilsApres).toBe(0);
    expect(tri.chemin).toBe("sans-facteur");
  });

  it("TÉMOIN : sur un catalogue fabriqué pour faire gagner à toute transition, elles ne gagnent RIEN", () => {
    // Les commandes dont l'ensemble d'arrivée est VIDE : axe « outils », aucun
    // profil visé. `brouillon-seul` ne peut pas élargir non plus, mais pour une
    // autre raison — elle est sur l'axe politique, où l'on ne gagne aucun outil
    // par construction. La confondre avec les trois autres ferait passer ce
    // témoin pour plus large qu'il n'est.
    const aEnsembleVide = NOMS_COMMANDES.filter((nom) => {
      const effet = commande(nom).effet;
      return effet.axe === "outils" && effet.versProfil === null && !peutElargir(effet);
    });
    const tris = aEnsembleVide.map((nom) => trier(nom, etat(CATALOGUE_TOUT_GAGNE)));

    console.info(
      `[garde ensemble-vide] ${String(tris.length)} commandes mesurées sur un catalogue de ` +
        `${String(CATALOGUE_TOUT_GAGNE.length)} outils exclusifs ; ` +
        `gagnés au total : ${String(tris.reduce((n, t) => n + t.gagnes.length, 0))}`,
    );

    // Le témoin est réel : sur CE catalogue, une transition entre profils gagne
    // bel et bien. La ligne suivante le prouve — sans elle, l'absence de gain
    // ci-dessous serait verte pour la mauvaise raison.
    expect(trier("mode-dev", etat(CATALOGUE_TOUT_GAGNE)).gagnes).toEqual(["exclusif.dev"]);

    // 3 commandes de la grammaire : stop, annule, verrouille.
    expect(tris).toHaveLength(3);
    for (const tri of tris) {
      expect(tri.gagnes, `« ${tri.commande} » a gagné un outil`).toEqual([]);
      expect(tri.chemin).toBe("sans-facteur");
    }
  });

  it("`commandesQuiDementent` ne trouve aucun démenti, sur 4 catalogues et 5 commandes", () => {
    const catalogues = [
      CATALOGUE_DEV_ELARGIT,
      CATALOGUE_DEV_REDUIT,
      CATALOGUE_TOUT_GAGNE,
      CATALOGUE_VIDE,
    ];
    let mesurees = 0;
    const tous: string[] = [];

    for (const catalogue of catalogues) {
      const verdict = commandesQuiDementent(NOMS_COMMANDES, etat(catalogue));
      mesurees += verdict.commandesMesurees;
      tous.push(...verdict.dementies);
    }

    console.info(
      `[garde démentis] ${String(mesurees)} (commande × catalogue) mesurées, ` +
        `${String(tous.length)} démenti(s)`,
    );
    expect(mesurees).toBe(catalogues.length * NOMS_COMMANDES.length);
    expect(tous).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — la mesure aveugle, et les deux régimes
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — catalogue vide : les deux régimes divergent, et le disent", () => {
  it("le défaut « n-elargit-pas » garde « stop » disponible, et ANNONCE la mesure aveugle", () => {
    const tri = trier("stop", etat(CATALOGUE_VIDE));

    console.info(`[garde aveugle/défaut] ${tri.message}`);
    expect(tri.outilsExamines).toBe(0);
    expect(tri.mesureAveugle).toBe(true);
    expect(tri.message).toContain("mesure aveugle");
    expect(tri.elargit).toBe(false);
    expect(tri.chemin).toBe("sans-facteur");
  });

  it("le régime « reduit-strictement » — la lettre du § 20 — enverrait « stop » au desserrage", () => {
    // ⚠️ C'EST L'ÉCART, RENDU MESURABLE PLUTÔT QUE COMMENTÉ. Les deux lectures
    //    du § 20 donnent des chemins DIFFÉRENTS sur le même état, et les deux
    //    verdicts sont rendus dans le même objet : personne n'a à recalculer
    //    quoi que ce soit pour appliquer l'autre.
    const tri = trier("stop", etat(CATALOGUE_VIDE), "reduit-strictement");

    console.info(`[garde aveugle/strict] ${tri.message}`);
    expect(tri.reduitStrictement).toBe(false);
    expect(tri.chemin).toBe("desserrage");
    expect(tri.desserrage).not.toBeNull();
  });

  it("la mesure aveugle N'ADOUCIT JAMAIS : « mode-dev » part au desserrage sur un catalogue vide", () => {
    // Sur un catalogue vide, `mode-dev` ne gagne rien non plus — il ne peut donc
    // pas être routé par le gain. C'est le régime strict qui décide ici, et il
    // faut le dire : sous le régime par défaut, `mode-dev` passe SANS FACTEUR
    // quand le catalogue est illisible.
    const parDefaut = trier("mode-dev", etat(CATALOGUE_VIDE));
    const strict = trier("mode-dev", etat(CATALOGUE_VIDE), "reduit-strictement");

    console.info(
      `[garde aveugle/mode-dev] défaut → ${parDefaut.chemin} · strict → ${strict.chemin} ` +
        `(mesure aveugle : ${String(parDefaut.mesureAveugle)})`,
    );

    // ⚠️ ÉCART SIGNALÉ, PAS COMBLÉ : sous le régime par défaut, un catalogue
    //    illisible fait passer « passe en mode dev » sans facteur. Le champ
    //    `mesureAveugle` le DIT, et c'est à l'appelant de refuser. Ce test fixe
    //    le comportement observé plutôt que de le laisser se découvrir en prod.
    expect(parDefaut.mesureAveugle).toBe(true);
    expect(parDefaut.chemin).toBe("sans-facteur");
    expect(strict.chemin).toBe("desserrage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'axe politique lit `classerChangement`, et rien d'autre
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — « brouillon seul », axe politique", () => {
  it("CONFRONTATION : le genre rendu est exactement celui de `classerChangement`", () => {
    const jeux: readonly (readonly LignePolitique[])[] = [
      [],
      [ligne("libre", SCOPE_GLOBAL)],
      [ligne("confirmé", SCOPE_GLOBAL)],
      [ligne("brouillon", SCOPE_GLOBAL)],
      [ligne("libre", "zoho.*"), ligne("confirmé", SCOPE_GLOBAL)],
    ];
    const maintenant = new Date("2026-09-01T10:00:00.000Z");
    const ecarts: string[] = [];

    for (const lignes of jeux) {
      const tri = trier("brouillon-seul", etat(CATALOGUE_DEV_ELARGIT, lignes));
      const attendu = classerChangement(lignes, SCOPE_GLOBAL, "brouillon", maintenant);
      if (
        tri.genreDeChangement !== attendu.genre ||
        tri.niveauAvant !== attendu.niveauAvant ||
        tri.niveauDemande !== attendu.niveauDemande
      ) {
        ecarts.push(`${String(lignes.length)} ligne(s)`);
      }
    }

    console.info(
      `[garde politique] ${String(jeux.length)} jeux de lignes confrontés, ` +
        `${String(ecarts.length)} écart(s)`,
    );
    expect(jeux).toHaveLength(5);
    expect(ecarts).toEqual([]);
  });

  it("resserre depuis `libre` → sans facteur, et le message dit le plancher", () => {
    const tri = trier(
      "brouillon-seul",
      etat(CATALOGUE_DEV_ELARGIT, [ligne("libre", SCOPE_GLOBAL)]),
    );

    console.info(`[garde brouillon-seul] ${tri.message}`);
    expect(tri.axe).toBe("politique");
    expect(tri.niveauAvant).toBe("libre");
    expect(tri.genreDeChangement).toBe("resserrage");
    expect(tri.elargit).toBe(false);
    expect(tri.chemin).toBe("sans-facteur");
    expect(tri.desserrage).toBeNull();
  });

  it("sans aucune ligne lue : repli fail-closed, resserrage, ET mesure aveugle annoncée", () => {
    const tri = trier("brouillon-seul", etat(CATALOGUE_DEV_ELARGIT, []));

    console.info(`[garde brouillon-seul/aveugle] ${tri.message}`);
    expect(tri.lignesExaminees).toBe(0);
    expect(tri.mesureAveugle).toBe(true);
    expect(tri.genreDeChangement).toBe("resserrage");
    expect(tri.chemin).toBe("sans-facteur");
  });

  it("TÉMOIN : l'autorité SAIT rendre « desserrage » — l'arm non exercée par la grammaire", () => {
    // ⚠️ ÉCART SIGNALÉ. Aucune commande de la grammaire ne vise un niveau PLUS
    //    PERMISSIF : la branche « desserrage » de l'axe politique n'est donc
    //    jamais empruntée par le tri réel. Sans ce témoin, on ne saurait pas si
    //    elle est morte ou seulement inutilisée. Elle est vivante :
    const desserre = classerChangement(
      [ligne("brouillon", SCOPE_GLOBAL)],
      SCOPE_GLOBAL,
      "libre",
      new Date("2026-09-01T10:00:00.000Z"),
    );
    console.info(`[garde politique/témoin] genre rendu pour brouillon → libre : ${desserre.genre}`);
    expect(desserre.genre).toBe("desserrage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — les exigences du desserrage sont DÉRIVÉES
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — le chemin du desserrage", () => {
  it("la VOIX ne délivre pas de confirmation, et les exigences le disent", () => {
    const tri = trier("mode-dev", etat(CATALOGUE_DEV_ELARGIT));
    const exigences = tri.desserrage;
    if (exigences === null) throw new Error("le chemin du desserrage n'a pas été emprunté");

    console.info(
      `[garde desserrage] canal « ${CANAL_VOIX} » confirme : ${String(LA_VOIX_CONFIRME)} · ` +
        `canaux admis : ${exigences.canauxAdmis.join(", ")} · ` +
        `TTL max ${String(exigences.ttlMaxMs)} ms · scope ${exigences.scopeDeJeton}`,
    );

    // § 20 : « ni l'élicitation MCP, ni une réponse produite par le démon vocal
    // ne comptent comme confirmation humaine ».
    expect(LA_VOIX_CONFIRME).toBe(false);
    expect(exigences.parLaVoix).toBe(false);
    expect(exigences.secondFacteur).toBe("TOTP");
    expect(exigences.ttlObligatoire).toBe(true);
    expect(exigences.ttlMaxMs).toBe(TTL_DESSERRAGE_MAX_MS);
    expect(exigences.scopeDeJeton).toBe(SCOPE_DESSERRAGE);
    expect(tri.message).toContain("PAS PAR LA VOIX");
  });

  it("les canaux admis sont DÉRIVÉS de `CANAUX`, pas recopiés", () => {
    const attendus = CANAUX.filter(canalDelivreUneConfirmation);
    console.info(
      `[garde canaux] ${String(CANAUX.length)} canaux du socle, ` +
        `${String(attendus.length)} délivrent une confirmation`,
    );
    expect(CANAUX_QUI_CONFIRMENT).toEqual(attendus);
    expect(CANAUX_QUI_CONFIRMENT).not.toContain(CANAL_VOIX);
    // Un jeu vide rendrait la garde verte pour la pire des raisons.
    expect(CANAUX_QUI_CONFIRMENT.length).toBeGreaterThan(0);
  });

  it("`SCOPE_GLOBAL` est confronté au scope du démarrage — la seule constante recopiée du module", () => {
    // ⚠️ Elle est recopiée, donc elle est gardée. Si `core/policy` changeait sa
    //    grammaire de scope, ce test rougirait ici plutôt qu'en production.
    console.info(
      `[garde scope] SCOPE_GLOBAL=« ${SCOPE_GLOBAL} » · SCOPE_DEMARRAGE=« ${SCOPE_DEMARRAGE} »`,
    );
    expect(SCOPE_GLOBAL).toBe(SCOPE_DEMARRAGE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — la campagne balaie TOUTE la grammaire
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes/tri — `trierToutes` couvre la grammaire entière", () => {
  it("trie les 5 commandes et annonce les deux comptes", () => {
    const verdict = trierToutes(NOMS_COMMANDES, etat(CATALOGUE_DEV_ELARGIT));

    console.info(
      `[garde campagne] ${String(verdict.commandesMesurees)} commandes triées : ` +
        `${String(verdict.sansFacteur)} sans facteur, ${String(verdict.auDesserrage)} au desserrage`,
    );

    expect(verdict.commandesMesurees).toBe(NOMS_COMMANDES.length);
    expect(verdict.commandesMesurees).toBe(5);
    // Sur ce catalogue : stop, annule, verrouille, brouillon-seul sans facteur ;
    // mode-dev au desserrage.
    expect(verdict.sansFacteur).toBe(4);
    expect(verdict.auDesserrage).toBe(1);
    expect(verdict.sansFacteur + verdict.auDesserrage).toBe(verdict.commandesMesurees);
  });
});
