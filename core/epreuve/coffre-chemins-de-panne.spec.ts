import { describe, expect, it } from "vitest";

import { Coffre, NOM_DU_SCEAU, VERSION_DU_SCEAU } from "../vault/coffre.js";
import { LONGUEUR_CLE } from "../vault/chiffrement.js";
import { decisionDeDemarrage } from "../vault/demarrage.js";
import { DepotEnMemoire } from "../vault/depot.js";
import { estErreurDeCoffre } from "../vault/erreurs.js";
import {
  depuisDeverrouillageManuel,
  depuisEnvironnement,
  VARIABLES_DE_CLE,
} from "../vault/source-de-cle.js";

/**
 * ÉPREUVE — LES CHEMINS DE PANNE DU COFFRE.
 *
 * La question de toutes ces épreuves : quand la clé manque, est fausse ou
 * change sous le processus, le socle SE FERME-T-IL ? Un coffre qui s'ouvre
 * sur une clé qu'il n'a pas prouvée est le pire défaut possible du § 16.
 *
 * Chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

/**
 * Clés d'épreuve. AUCUN SECRET RÉEL : des motifs constants, fabriqués ici,
 * qui n'ouvrent rien d'autre que les coffres de ce fichier.
 */
function cleDEpreuve(remplissage: number): string {
  return Buffer.alloc(LONGUEUR_CLE, remplissage).toString("base64");
}

const CLE_A = cleDEpreuve(0x11);
const CLE_B = cleDEpreuve(0x22);

function envAvec(cle: string, keyId?: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { [VARIABLES_DE_CLE.cle]: cle };
  if (keyId !== undefined) env[VARIABLES_DE_CLE.keyId] = keyId;
  return env;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CLÉ MANQUE
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — la clé du coffre manque", () => {
  it("ne pose AUCUN sceau et ne s'ouvre pas quand la source ne fournit rien", async () => {
    const depot = new DepotEnMemoire();
    const coffre = await Coffre.ouvrir({ depot, source: depuisEnvironnement({}) });

    let raison: string | null = null;
    await coffre.provisionner().catch((e: unknown) => {
      raison = estErreurDeCoffre(e) ? e.raison : "erreur non typée";
    });

    const lignes = await depot.lister();
    const decision = decisionDeDemarrage(coffre.etat());

    console.log(
      `[épreuve clé absente] 1 témoin mesuré · état=${coffre.etat()} · raison=${String(raison)} · ` +
        `${String(lignes.length)} ligne(s) en base · ${String(depot.ecritures)} écriture(s) tentée(s) · ` +
        `démarre=${String(decision.demarre)} · vaultLocked=${String(decision.vaultLocked)}`,
    );

    expect(raison).toBe("cle_absente");
    expect(lignes).toHaveLength(0);
    expect(coffre.etat()).toBe("absent");
    expect(decision.demarre, "un coffre absent ne doit pas faire démarrer le socle").toBe(false);
    expect(coffre.refusDAppelDOutil(), "aucun outil ne doit passer").not.toBeNull();
  });

  it("refuse tout appel d'outil sur un coffre verrouillé, sans jamais lire un secret", async () => {
    const depot = new DepotEnMemoire();
    // Un coffre provisionné sous CLÉ A…
    const ouvert = await Coffre.ouvrir({ depot, source: depuisEnvironnement(envAvec(CLE_A)) });
    await ouvert.provisionner();
    await ouvert.ecrire("zoho.refresh", 1, Buffer.from("valeur-d-epreuve", "utf8"));

    // …redémarré avec une source manuelle vide : personne n'a présenté de clé.
    const manuelle = depuisDeverrouillageManuel();
    const auRedemarrage = await Coffre.ouvrir({ depot, source: manuelle });

    const refus = auRedemarrage.refusDAppelDOutil();
    let lectureLevee = false;
    await auRedemarrage.lire("zoho.refresh", 1).catch(() => {
      lectureLevee = true;
    });

    const sante = auRedemarrage.sante();
    console.log(
      `[épreuve verrouillé] ${String((await depot.lister()).length)} ligne(s) en base mesurée(s) · ` +
        `état=${sante.etat} · vaultLocked=${String(sante.vaultLocked)} · ` +
        `keyIds connus=${String(sante.keyIdsConnus.length)} · ` +
        `refus d'outil=${refus === null ? "AUCUN" : refus.code} · lecture a levé=${String(lectureLevee)}`,
    );

    expect(auRedemarrage.etat()).toBe("verrouillé");
    expect(refus).not.toBeNull();
    expect(lectureLevee, "lire un secret coffre fermé doit échouer").toBe(true);
    expect(sante.keyIdsConnus, "aucun keyId ne doit fuiter coffre fermé").toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LA CLÉ EST FAUSSE OU MAL FORMÉE
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — la clé du coffre est fausse", () => {
  it("refuse six formes de clé mal formée, chacune bruyamment", async () => {
    const malFormees: readonly { readonly nom: string; readonly valeur: string }[] = [
      { nom: "trop courte (31 octets)", valeur: Buffer.alloc(31, 7).toString("base64") },
      { nom: "trop longue (33 octets)", valeur: Buffer.alloc(33, 7).toString("base64") },
      { nom: "tout à zéro", valeur: Buffer.alloc(LONGUEUR_CLE, 0).toString("base64") },
      { nom: "pas du base64", valeur: "!!!ceci n'est pas du base64!!!" },
      { nom: "un seul caractère", valeur: "A" },
      { nom: "des espaces", valeur: "   " },
    ];

    // ⚠️ ON MESURE LES SIX AVANT D'AFFIRMER QUOI QUE CE SOIT. Une assertion
    //    dans la boucle arrêterait la garde à la première forme fautive, et le
    //    compte annoncé serait plus petit que le périmètre réellement couvert.
    const motifs: string[] = [];
    const passees: string[] = [];
    for (const cas of malFormees) {
      const depot = new DepotEnMemoire();
      const source = depuisEnvironnement(envAvec(cas.valeur));

      let raison = "AUCUNE — LA CLÉ EST PASSÉE";
      const coffre = await Coffre.ouvrir({ depot, source })
        .then(async (c) => {
          await c.provisionner();
          return c;
        })
        .catch((e: unknown) => {
          raison = estErreurDeCoffre(e) ? e.raison : "erreur non typée";
          return null;
        });

      const lignes = await depot.lister();
      motifs.push(`${cas.nom}→${raison}/${String(lignes.length)} ligne(s)`);
      if (lignes.length > 0) {
        passees.push(`${cas.nom} (coffre ${coffre === null ? "?" : coffre.etat()})`);
      }
    }

    console.log(
      `[épreuve clés mal formées] ${String(malFormees.length)} formes mesurées · ` +
        motifs.join(" · ") +
        ` · FORMES ACCEPTÉES=${passees.length === 0 ? "aucune" : passees.join(", ")}`,
    );

    expect(motifs).toHaveLength(malFormees.length);
    expect(
      passees,
      "une clé dégénérée ne doit pas provisionner un coffre que le socle annonce ensuite « nominal »",
    ).toHaveLength(0);
  });

  it("ne s'ouvre PAS sur une clé qui ne déchiffre pas le sceau", async () => {
    const depot = new DepotEnMemoire();
    const sousA = await Coffre.ouvrir({ depot, source: depuisEnvironnement(envAvec(CLE_A)) });
    await sousA.provisionner();

    // Le même sceau, présenté à un socle qui ne détient que la CLÉ B.
    const sousB = await Coffre.ouvrir({ depot, source: depuisEnvironnement(envAvec(CLE_B)) });

    console.log(
      `[épreuve mauvaise clé] 1 témoin mesuré · état sous la clé d'origine=${sousA.etat()} · ` +
        `état sous une clé étrangère=${sousB.etat()} · ` +
        `refus d'outil=${sousB.refusDAppelDOutil() === null ? "AUCUN" : "posé"}`,
    );

    expect(sousA.etat()).toBe("ouvert");
    expect(sousB.etat(), "une clé qui n'ouvre pas le sceau ne doit pas ouvrir le coffre").toBe(
      "verrouillé",
    );
    expect(sousB.refusDAppelDOutil()).not.toBeNull();
  });

  /**
   * LE PIÈGE QUE `clonerTrousseau` EXISTE POUR ÉVITER — vérifié, pas cru.
   *
   * `verrouiller()` écrase le matériau de clé qu'il détient. S'il travaillait
   * sur les tampons de la SOURCE plutôt que sur une copie, un arrêt d'urgence
   * détruirait la clé de l'environnement et le coffre ne se rouvrirait plus
   * jamais sans redémarrage — « la clé Coolify ne marche plus après un arrêt
   * d'urgence », cause invisible.
   */
  it("se rouvre après un arrêt d'urgence : le verrouillage n'écrase pas la clé de la source", async () => {
    const depot = new DepotEnMemoire();
    const env = envAvec(CLE_A);
    const coffre = await Coffre.ouvrir({ depot, source: depuisEnvironnement(env) });
    await coffre.provisionner();

    const etats: string[] = [coffre.etat()];
    for (let tour = 0; tour < 3; tour += 1) {
      etats.push(coffre.verrouiller());
      etats.push(await coffre.deverrouiller());
    }

    console.log(
      `[épreuve arrêt d'urgence] ${String(etats.length)} états mesurés sur 3 cycles · ` +
        etats.join(" → "),
    );

    expect(coffre.etat(), "le coffre doit se rouvrir après chaque arrêt d'urgence").toBe("ouvert");
    // La variable d'environnement n'a pas été touchée en place.
    expect(env[VARIABLES_DE_CLE.cle]).toBe(CLE_A);
  });

  /**
   * LA BASE A ÉTÉ REMPLACÉE SOUS LE PROCESSUS : le sceau a disparu. Le socle
   * ne doit PAS « réparer » en provisionnant par-dessus — cela poserait un
   * sceau neuf sur des lignes qu'aucune clé n'ouvre.
   */
  it("ne provisionne pas par-dessus un sceau disparu", async () => {
    const depot = new DepotEnMemoire();
    const coffre = await Coffre.ouvrir({ depot, source: depuisEnvironnement(envAvec(CLE_A)) });
    await coffre.provisionner();
    coffre.verrouiller();

    // La base est remplacée : le sceau n'y est plus.
    const vide = new DepotEnMemoire();
    const orphelin = await Coffre.ouvrir({
      depot: vide,
      source: depuisEnvironnement(envAvec(CLE_A)),
    });

    console.log(
      `[épreuve sceau disparu] 2 témoins mesurés · état sur base saine=${coffre.etat()} · ` +
        `état sur base vidée=${orphelin.etat()} · ` +
        `sceau présent=${String((await vide.lire(NOM_DU_SCEAU, VERSION_DU_SCEAU)) !== null)}`,
    );

    expect(orphelin.etat()).toBe("absent");
    expect(decisionDeDemarrage(orphelin.etat()).demarre).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE PLAFOND D'AMORÇAGE (§ 27)
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve — le plafond d'amorçage sous concurrence", () => {
  /**
   * L'ATTAQUE. `Coffre.compterUnAmorcage` LIT le compteur, compare au plafond,
   * PUIS incrémente — avec un `await` entre la lecture et l'écriture. Deux
   * amorçages concurrents lisent donc la même valeur, passent tous deux le
   * contrôle, et incrémentent tous deux.
   *
   * Le dépôt, lui, tient son contrat : `incrementerBootstrapCount` est
   * atomique et ne perd aucun incrément. C'est le CONTRÔLE DU PLAFOND qui est
   * un lire-puis-écrire — le motif que `insererSiAbsente`, `consommer` et
   * `enregistrerPas` interdisent nommément ailleurs dans le socle.
   *
   * Le § 27 rappelle que la régénération du jeton Zoho est PLAFONNÉE : chaque
   * amorçage en trop est irrécupérable.
   */
  it("ne doit jamais dépasser le plafond, même sur six amorçages concurrents", async () => {
    const PLAFOND = 5;
    const depot = new DepotEnMemoire();
    const coffre = await Coffre.ouvrir({
      depot,
      source: depuisEnvironnement(envAvec(CLE_A)),
      plafondBootstrap: PLAFOND,
    });
    await coffre.provisionner();
    await coffre.ecrire("zoho.refresh", 1, Buffer.from("valeur-d-epreuve", "utf8"));

    // On amène le compteur juste sous le plafond, séquentiellement.
    for (let i = 0; i < PLAFOND - 1; i += 1) {
      await coffre.compterUnAmorcage("zoho.refresh", 1);
    }
    const avant = await coffre.lireAmorcage("zoho.refresh", 1);

    // Puis six amorçages concurrents : UN SEUL doit passer.
    const concurrents = 6;
    const issues = await Promise.allSettled(
      Array.from({ length: concurrents }, () => coffre.compterUnAmorcage("zoho.refresh", 1)),
    );
    const passes = issues.filter((i) => i.status === "fulfilled");

    const apres = await coffre.lireAmorcage("zoho.refresh", 1);

    console.log(
      `[épreuve plafond d'amorçage] plafond=${String(PLAFOND)} · compte avant=${String(avant.compte)} · ` +
        `${String(concurrents)} amorçages concurrents mesurés · ${String(passes.length)} passé(s) · ` +
        `compte après=${String(apres.compte)} · reste annoncé=${String(apres.reste)}`,
    );

    expect(
      apres.compte,
      "le compteur d'amorçage a franchi le plafond : le contrôle est un lire-puis-écrire",
    ).toBeLessThanOrEqual(PLAFOND);
  });

  it("témoin de contraste : SÉQUENTIELLEMENT, le plafond tient", async () => {
    const PLAFOND = 3;
    const depot = new DepotEnMemoire();
    const coffre = await Coffre.ouvrir({
      depot,
      source: depuisEnvironnement(envAvec(CLE_A)),
      plafondBootstrap: PLAFOND,
    });
    await coffre.provisionner();
    await coffre.ecrire("zoho.refresh", 1, Buffer.from("valeur-d-epreuve", "utf8"));

    let passes = 0;
    let refuses = 0;
    for (let i = 0; i < PLAFOND + 3; i += 1) {
      try {
        await coffre.compterUnAmorcage("zoho.refresh", 1);
        passes += 1;
      } catch {
        refuses += 1;
      }
    }
    const apres = await coffre.lireAmorcage("zoho.refresh", 1);

    console.log(
      `[épreuve plafond séquentiel] ${String(PLAFOND + 3)} tentatives mesurées · ` +
        `${String(passes)} passée(s) · ${String(refuses)} refusée(s) · compte=${String(apres.compte)}`,
    );

    expect(passes).toBe(PLAFOND);
    expect(apres.compte).toBe(PLAFOND);
  });
});
