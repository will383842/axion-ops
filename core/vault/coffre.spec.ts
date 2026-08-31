import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LONGUEUR_CLE } from "./chiffrement.js";
import { Coffre, NOM_DU_SCEAU, VERSION_DU_SCEAU } from "./coffre.js";
import { decisionDeDemarrage } from "./demarrage.js";
import { DepotEnMemoire } from "./depot.js";
import { ErreurDeCoffre } from "./erreurs.js";
import type { EtatCoffre } from "./etat.js";
import { JournalEnMemoire } from "./evenements.js";
import { depuisDeverrouillageManuel, empreinteDeCle } from "./source-de-cle.js";
import type { CleDeCoffre, SourceDeCleManuelle } from "./source-de-cle.js";

/**
 * Gardes du coffre — LES TROIS ÉTATS DU § 23, DE BOUT EN BOUT.
 *
 * Les cinq épreuves demandées au chantier vivent ici ou dans
 * `chiffrement.spec.ts` :
 *   · chiffrer/déchiffrer aller-retour ......... chiffrement.spec.ts
 *   · un AAD qui ne correspond pas fait échouer  chiffrement.spec.ts
 *   · les trois états et leurs transitions ..... ici + etat.spec.ts
 *   · coffre absent → démarrage refusé ......... ici + demarrage.spec.ts
 *   · coffre verrouillé → démarre, outils NON .. ici + demarrage.spec.ts
 */

function octetsDeCle(remplissage: number): Uint8Array {
  return Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, remplissage));
}

/**
 * Les méthodes de `Coffre` que la garde « coffre verrouillé » éprouve une par
 * une. Elle est confrontée à `coffre.ts` : c'est la confrontation qui vaut, pas
 * la liste.
 */
const METHODES_EPROUVEES = new Set([
  "lire",
  "ecrire",
  "compterUnAmorcage",
  "tournerCle",
  // Le pont vers `core/limits` (§ 12, règle 2). Ne pas pouvoir lire et n'avoir
  // rien à lire sont deux situations différentes : coffre fermé, il LÈVE ; il
  // ne rend `null` que quand le secret n'est pas encore configuré.
  "lireCleArgHash",
  // Le pont vers `core/sceau` (ADR 0002). Même règle que ci-dessus, et un enjeu
  // plus grand : servir un journal scellé avec rien parce que le coffre est
  // fermé rendrait toute la chaîne d'`ops_audit` invérifiable en silence.
  "lireCleSceauJournal",
]);

/**
 * DÉRIVE, depuis la source de `coffre.ts`, les méthodes dont le corps appelle
 * `this.exigerOuvert()` — c'est-à-dire celles qui refusent quand le coffre n'est
 * pas ouvert.
 *
 * ⚠️ BORNE ÉCRITE : c'est une lecture de TEXTE, pas d'AST. Elle répond à « quelle
 *    méthode écrit l'appel », pas à « quelle méthode touche un secret ». Une
 *    méthode qui garderait le coffre par un autre moyen lui échapperait ; le
 *    remède serait un contrôle d'AST, pas un motif de plus.
 */
function methodesQuiExigentLeCoffreOuvert(source: string): readonly string[] {
  const trouvees: string[] = [];
  let methodeCourante: string | null = null;

  for (const ligneBrute of source.split("\n")) {
    const ligne = ligneBrute.trimEnd();
    // Une méthode publique de la classe : deux espaces d'indentation exactement.
    const entete = /^ {2}public (?:async )?([A-Za-z_][A-Za-z0-9_]*)\(/u.exec(ligne);
    if (entete?.[1] !== undefined) {
      methodeCourante = entete[1];
      continue;
    }
    if (methodeCourante !== null && ligne.includes("this.exigerOuvert()")) {
      trouvees.push(methodeCourante);
      methodeCourante = null;
    }
  }

  return trouvees;
}

function cleBase64(remplissage: number): string {
  return Buffer.alloc(LONGUEUR_CLE, remplissage).toString("base64");
}

function cleDeCoffre(remplissage: number, keyId?: string): CleDeCoffre {
  const octets = octetsDeCle(remplissage);
  return { keyId: keyId ?? empreinteDeCle(octets), octets };
}

/**
 * La raison d'une `ErreurDeCoffre`, ou un MARQUEUR si l'appel n'a pas levé.
 *
 * Les deux marqueurs — `aucun-refus` et `erreur-inattendue` — sont ce qui
 * empêche un `expect(...).toBe("coffre_verrouille")` d'être vert pour une
 * mauvaise raison : un appel qui réussirait, ou qui lèverait autre chose,
 * rendrait une valeur qui ne ressemble à aucune raison du § 15.
 */
async function raisonDuRefus(appel: () => Promise<unknown>): Promise<string> {
  try {
    await appel();
    return "aucun-refus";
  } catch (erreur) {
    return erreur instanceof ErreurDeCoffre ? erreur.raison : "erreur-inattendue";
  }
}

interface Montage {
  readonly depot: DepotEnMemoire;
  readonly source: SourceDeCleManuelle;
  readonly journal: JournalEnMemoire;
}

function montage(): Montage {
  return {
    depot: new DepotEnMemoire(),
    source: depuisDeverrouillageManuel(),
    journal: new JournalEnMemoire(),
  };
}

/** Un coffre provisionné, ouvert, avec la clé `remplissage`. */
async function coffreOuvert(m: Montage, remplissage = 0x11): Promise<Coffre> {
  m.source.poser(cleBase64(remplissage));
  const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source, journal: m.journal });
  await coffre.provisionner();
  return coffre;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 1 — COFFRE ABSENT : le démarrage est refusé
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — état ABSENT", () => {
  it("constate l'absence sans lever, et le démarrage est refusé", async () => {
    const m = montage();
    m.source.poser(cleBase64(0x11)); // Une clé PRÉSENTE ne suffit pas : il faut un sceau.

    const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source });

    expect(coffre.etat()).toBe("absent");
    // Constater n'est pas décider : `ouvrir` ne lève pas, `decisionDeDemarrage`
    // décide. Sans cette séparation, le cas « absent » ne serait testable que
    // par un `throws`, et le § 32 en fait un critère de recette à part entière.
    expect(decisionDeDemarrage(coffre.etat()).demarre).toBe(false);
    expect(coffre.sante().vaultLocked).toBe(true);
    expect(coffre.sante().keyIdPrincipal).toBeNull();
  });

  it("refuse tout appel d'outil, et toute lecture", async () => {
    const m = montage();
    const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source });

    const refus = coffre.refusDAppelDOutil();
    expect(refus).not.toBeNull();
    expect(refus?.etat).toBe("absent");
    expect(refus?.code).toBe("vault_locked");

    expect(await raisonDuRefus(() => coffre.lire("zoho.refresh_token"))).toBe("coffre_absent");
  });

  it("refuse de se déverrouiller — on ne rouvre pas ce qui n'existe pas", async () => {
    const m = montage();
    m.source.poser(cleBase64(0x11));
    const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source, journal: m.journal });

    expect(await raisonDuRefus(() => coffre.deverrouiller())).toBe("transition_interdite");
    expect(coffre.etat()).toBe("absent");
    expect(m.journal.compte("geste-refusé")).toBe(1);
  });

  it("provisionne — et refuse de le refaire une fois ouvert", async () => {
    const m = montage();
    m.source.poser(cleBase64(0x11));
    const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source, journal: m.journal });

    expect(await coffre.provisionner()).toBe("ouvert");
    expect(await m.depot.lire(NOM_DU_SCEAU, VERSION_DU_SCEAU)).not.toBeNull();
    expect(m.journal.compte("provisionné")).toBe(1);

    // Re-provisionner écraserait le sceau d'un coffre qui contient déjà des
    // secrets : toutes ses lignes deviendraient orphelines.
    expect(await raisonDuRefus(() => coffre.provisionner())).toBe("transition_interdite");
  });

  it("refuse de provisionner sans clé, et dit de séquestrer AVANT de poser", async () => {
    const m = montage();
    const coffre = await Coffre.ouvrir({ depot: m.depot, source: m.source });

    let message = "";
    try {
      await coffre.provisionner();
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : "";
    }

    expect(message).toContain("SÉQUESTRER");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 2 — COFFRE VERROUILLÉ : il démarre, mais aucun outil
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — état VERROUILLÉ", () => {
  it("démarre SANS clé sur une base qui porte un sceau", async () => {
    const premier = montage();
    await coffreOuvert(premier);

    // Redémarrage : même base, source neuve et VIDE. C'est le repli du § 16,
    // « mode déverrouillage au démarrage », et c'est ce que fait CHAQUE
    // déploiement tant que W-4 n'est pas tranchée.
    const source = depuisDeverrouillageManuel();
    const coffre = await Coffre.ouvrir({ depot: premier.depot, source });

    expect(coffre.etat()).toBe("verrouillé");

    const decision = decisionDeDemarrage(coffre.etat());
    expect(decision.demarre).toBe(true);
    expect(decision.statutHealthcheck).toBe(200);
    expect(decision.vaultLocked).toBe(true);
    expect(decision.appelsDOutilsAcceptes).toBe(false);
  });

  it("refuse TOUT appel d'outil, et chaque opération qui touche un secret", async () => {
    const premier = montage();
    await coffreOuvert(premier);
    const coffre = await Coffre.ouvrir({
      depot: premier.depot,
      source: depuisDeverrouillageManuel(),
    });

    expect(coffre.refusDAppelDOutil()?.code).toBe("vault_locked");

    // Une par une, les opérations qui doivent toutes refuser. Le compte est
    // annoncé : une garde qui n'en mesurerait qu'une serait verte pour la pire
    // des raisons.
    const operations: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
      ["lire", () => coffre.lire("zoho.refresh_token")],
      ["écrire", () => coffre.ecrire("zoho.refresh_token", 1, Buffer.from("x"))],
      ["compter un amorçage", () => coffre.compterUnAmorcage("zoho.refresh_token", 1)],
      ["tourner la clé", () => coffre.tournerCle(cleDeCoffre(0x22))],
      ["lire la clé argHash", () => coffre.lireCleArgHash()],
      ["lire la clé de scellement du journal", () => coffre.lireCleSceauJournal()],
    ];

    let mesurees = 0;
    for (const [libelle, operation] of operations) {
      expect(await raisonDuRefus(operation), libelle).toBe("coffre_verrouille");
      mesurees += 1;
    }

    console.info(
      `[garde coffre verrouillé] ${String(mesurees)} opérations mesurées, toutes refusées`,
    );
    expect(mesurees).toBe(operations.length);
    // Plancher-témoin : six opérations depuis l'ADR 0002, qui a ajouté la clé
    // de scellement du journal. Le plancher suit la dérivation ci-dessous.
    expect(mesurees).toBeGreaterThanOrEqual(6);

    // ⚠️ CETTE LISTE EST ÉCRITE À LA MAIN — donc elle se périme en silence.
    //    Une méthode nouvelle qui toucherait un secret sans figurer ici passerait
    //    la garde sans être éprouvée. On la CONFRONTE donc à la source : le
    //    garde-fou réel du coffre est `this.exigerOuvert()`, et les méthodes qui
    //    l'appellent sont dérivables du fichier lui-même.
    const source = readFileSync(fileURLToPath(new URL("./coffre.ts", import.meta.url)), "utf8");
    const gardees = methodesQuiExigentLeCoffreOuvert(source);

    console.info(
      `[garde couverture verrouillé] ${String(gardees.length)} méthode(s) appelant ` +
        `\`exigerOuvert()\` dérivée(s) de coffre.ts : ${gardees.join(", ")}`,
    );

    // Plancher-témoin : zéro méthode dérivée signifierait que le motif de
    // dérivation ne mord plus, pas que le coffre a cessé de se garder.
    expect(gardees.length).toBeGreaterThanOrEqual(6);

    const nonEprouvees = gardees.filter((methode) => !METHODES_EPROUVEES.has(methode));
    expect(
      nonEprouvees,
      "méthodes qui exigent le coffre ouvert mais qu'aucune opération ci-dessus n'éprouve",
    ).toEqual([]);
  });

  it("rougit sur un témoin fabriqué : une CINQUIÈME méthode gardée qu'aucune opération n'éprouve", () => {
    // Sans ce témoin, la dérivation ci-dessus serait indistinguable d'une
    // fonction qui rendrait toujours exactement la liste attendue.
    const temoin = [
      "class Coffre {",
      "  public async lire(nom: string): Promise<Buffer> {",
      "    this.exigerOuvert();",
      "  }",
      "  public async exporterTout(): Promise<Buffer[]> {",
      "    this.exigerOuvert();",
      "  }",
      "  private exigerOuvert(): void {}",
      "}",
    ].join("\n");

    const gardees = methodesQuiExigentLeCoffreOuvert(temoin);
    const nonEprouvees = gardees.filter((methode) => !METHODES_EPROUVEES.has(methode));

    console.info(
      `[garde dérivation — témoin] ${String(gardees.length)} méthodes dérivées du témoin`,
    );

    expect(gardees).toEqual(["lire", "exporterTout"]);
    // C'est bien la méthode INVENTÉE que la garde réelle signalerait.
    expect(nonEprouvees).toEqual(["exporterTout"]);
  });

  it("reste VERROUILLÉ quand la clé présentée n'ouvre pas le sceau, et ALERTE", async () => {
    const premier = montage();
    await coffreOuvert(premier, 0x11);

    const source = depuisDeverrouillageManuel();
    const journal = new JournalEnMemoire();
    source.poser(cleBase64(0x99), "k-fausse-mais-bien-nommée");

    const coffre = await Coffre.ouvrir({ depot: premier.depot, source, journal });

    // Le keyId ne correspond pas : le trousseau ne porte pas la clé du sceau.
    expect(coffre.etat()).toBe("verrouillé");
    // § 24 — « coffre illisible » est CRITIQUE. La garde vérifie que le coffre
    // le DIT ; sans événement, l'incident n'existe pour personne.
    expect(journal.compte("coffre-illisible")).toBe(1);
  });

  it("reste VERROUILLÉ quand le keyId correspond mais la clé est fausse", async () => {
    // Le cas vicieux : quelqu'un a recopié le keyId à la main d'un
    // environnement à l'autre, mais pas la clé. Sans le SCEAU, le coffre
    // passerait « ouvert » et ne découvrirait l'erreur qu'au premier vrai
    // secret lu — c'est-à-dire au pire moment.
    const premier = montage();
    const coffre0 = await coffreOuvert(premier, 0x11);
    const keyIdLegitime = coffre0.sante().keyIdPrincipal;
    expect(keyIdLegitime).not.toBeNull();

    const source = depuisDeverrouillageManuel();
    const journal = new JournalEnMemoire();
    source.poser(cleBase64(0x99), keyIdLegitime ?? "");

    const coffre = await Coffre.ouvrir({ depot: premier.depot, source, journal });

    expect(coffre.etat()).toBe("verrouillé");
    expect(journal.compte("coffre-illisible")).toBe(1);
  });

  it("se déverrouille à chaud quand la bonne clé est posée à la console", async () => {
    const premier = montage();
    await coffreOuvert(premier, 0x11);

    const source = depuisDeverrouillageManuel();
    const journal = new JournalEnMemoire();
    const coffre = await Coffre.ouvrir({ depot: premier.depot, source, journal });
    expect(coffre.etat()).toBe("verrouillé");

    // Le geste de l'écran Déverrouillage (§ 22, écran 5), servi SANS le coffre.
    source.poser(cleBase64(0x11));
    expect(await coffre.deverrouiller()).toBe("ouvert");
    expect(coffre.refusDAppelDOutil()).toBeNull();
    expect(journal.compte("déverrouillé")).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 3 — COFFRE OUVERT : lire, écrire, refermer
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — état OUVERT", () => {
  it("fait l'aller-retour d'un secret, et garde les versions côte à côte", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);

    // § 12 : l'unicité est (name, version) — « le § 27 exige de garder l'ancien
    // refresh token valide pendant la propagation ; un `name` unique
    // l'interdirait ».
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from("ancien-jeton", "utf8"));
    await coffre.ecrire("zoho.refresh_token", 2, Buffer.from("nouveau-jeton", "utf8"));

    expect((await coffre.lire("zoho.refresh_token", 1)).toString("utf8")).toBe("ancien-jeton");
    expect((await coffre.lire("zoho.refresh_token", 2)).toString("utf8")).toBe("nouveau-jeton");
    // Sans version : la plus haute.
    expect((await coffre.lire("zoho.refresh_token")).toString("utf8")).toBe("nouveau-jeton");
  });

  it("ne laisse AUCUN clair dans la ligne stockée", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);
    const clair = "1000.un-jeton-qui-ressemble-a-un-vrai.zoho";

    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from(clair, "utf8"));
    const ligne = await m.depot.lire("zoho.refresh_token", 1);

    expect(ligne).not.toBeNull();
    const stocke = Buffer.from(ligne?.ciphertext ?? new Uint8Array()).toString("utf8");
    expect(stocke).not.toContain("jeton");
    expect(stocke).not.toContain(clair);
  });

  it("refuse le nom du sceau, en lecture comme en écriture", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);

    // Écraser le sceau rendrait le coffre « absent » au redémarrage suivant —
    // c'est-à-dire un socle qui refuse de démarrer, sans que rien ne dise
    // pourquoi.
    const gestes: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
      ["écrire", () => coffre.ecrire(NOM_DU_SCEAU, 1, Buffer.from("x"))],
      ["lire", () => coffre.lire(NOM_DU_SCEAU)],
    ];

    let mesures = 0;
    for (const [libelle, geste] of gestes) {
      expect(await raisonDuRefus(geste), libelle).toBe("nom_reserve");
      mesures += 1;
    }

    console.info(`[garde nom réservé] ${String(mesures)} gestes mesurés`);
    expect(mesures).toBe(2);
  });

  it("refuse un nom ou une version hors contrat", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);
    const clair = Buffer.from("x");

    expect(await raisonDuRefus(() => coffre.ecrire("", 1, clair))).toBe("nom_invalide");
    expect(await raisonDuRefus(() => coffre.ecrire("a‖b", 1, clair))).toBe("nom_invalide");
    expect(await raisonDuRefus(() => coffre.ecrire("a", 0, clair))).toBe("version_invalide");
  });

  it("dit `secret_introuvable` plutôt que de rendre un vide", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);

    expect(await raisonDuRefus(() => coffre.lire("jamais.ecrit"))).toBe("secret_introuvable");
    expect(await raisonDuRefus(() => coffre.lire("jamais.ecrit", 7))).toBe("secret_introuvable");
  });

  it("referme, écrase le matériau, et reste refermable (arrêt d'urgence)", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);

    expect(coffre.verrouiller()).toBe("verrouillé");
    expect(coffre.sante().keyIdPrincipal).toBeNull();
    expect(coffre.sante().keyIdsConnus).toEqual([]);
    expect(coffre.refusDAppelDOutil()?.code).toBe("vault_locked");

    // § 25 — idempotent : presser deux fois le bouton d'urgence n'est pas une
    // erreur.
    expect(coffre.verrouiller()).toBe("verrouillé");

    // Et la source, elle, n'a rien perdu : le coffre travaillait sur une COPIE.
    expect(await coffre.deverrouiller()).toBe("ouvert");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 4 — le keyId, et la rotation interrompue
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — la rotation, et ce que keyId rattrape", () => {
  async function coffreGarni(): Promise<{ m: Montage; coffre: Coffre; secrets: number }> {
    const m = montage();
    const coffre = await coffreOuvert(m, 0x11);
    const noms = ["zoho.refresh_token", "zoho.client_secret", "axionia.secret_partage"];
    for (const [index, nom] of noms.entries()) {
      await coffre.ecrire(nom, 1, Buffer.from(`clair-${String(index)}`, "utf8"));
    }
    return { m, coffre, secrets: noms.length };
  }

  it("réécrit toutes les lignes, sceau compris, et ANNONCE combien", async () => {
    const { m, coffre, secrets } = await coffreGarni();
    const nouvelle = cleDeCoffre(0x22, "k-2026-09");

    const resultat = await coffre.tournerCle(nouvelle);

    console.info(`[garde rotation] ${String(resultat.lignes)} lignes réécrites`);

    // Le sceau EN FAIT PARTIE : sans lui, le prochain démarrage ne
    // reconnaîtrait plus le coffre sous la nouvelle clé.
    expect(resultat.lignes).toBe(secrets + 1);
    expect(resultat.keyId).toBe("k-2026-09");

    for (const ligne of await m.depot.lister()) {
      expect(ligne.keyId, ligne.name).toBe("k-2026-09");
      expect(ligne.rotatedAt, ligne.name).not.toBeNull();
    }

    // Et tout se relit.
    expect((await coffre.lire("zoho.refresh_token", 1)).toString("utf8")).toBe("clair-0");
  });

  it("refuse une rotation vers la clé déjà principale", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m, 0x11);
    const memeCle = cleDeCoffre(0x11, coffre.sante().keyIdPrincipal ?? "");

    expect(await raisonDuRefus(() => coffre.tournerCle(memeCle))).toBe("cle_invalide");
  });

  it("INTERROMPUE : la base porte deux keyId, et le coffre lit ENCORE tout", async () => {
    // C'est la démonstration de la phrase du § 12 : « sans keyId, la rotation
    // est un tout-ou-rien qu'une interruption rend irrattrapable ».
    const { m, coffre } = await coffreGarni();
    const journal = m.journal;

    m.depot.programmerUnePanneDEcriture(3);
    await expect(coffre.tournerCle(cleDeCoffre(0x22, "k-2026-09"))).rejects.toThrowError();

    const lignes = await m.depot.lister();
    const parKeyId = new Map<string, number>();
    for (const ligne of lignes) {
      parKeyId.set(ligne.keyId, (parKeyId.get(ligne.keyId) ?? 0) + 1);
    }

    console.info(
      `[garde rotation interrompue] ${String(lignes.length)} lignes mesurées, ` +
        `réparties sur ${String(parKeyId.size)} keyId : ` +
        `${[...parKeyId.entries()].map(([k, n]) => `${k}=${String(n)}`).join(", ")}`,
    );

    // Le témoin de l'interruption : DEUX keyId coexistent. Si ce compte était
    // de 1, la garde ne mesurerait plus rien de ce qu'elle prétend garder.
    expect(parKeyId.size).toBe(2);
    expect(journal.compte("rotation-interrompue")).toBe(1);

    // ET TOUT SE LIT ENCORE — c'est la propriété qui compte.
    let relues = 0;
    for (const ligne of lignes) {
      if (ligne.name === NOM_DU_SCEAU) {
        continue;
      }
      await expect(coffre.lire(ligne.name, ligne.version)).resolves.toBeInstanceOf(Buffer);
      relues += 1;
    }
    console.info(`[garde rotation interrompue] ${String(relues)} secrets relus après la panne`);
    expect(relues).toBeGreaterThanOrEqual(3);
  });

  it("INTERROMPUE puis REDÉMARRÉE sans l'ancienne clé : le message nomme le keyId manquant", async () => {
    const { m, coffre } = await coffreGarni();
    m.depot.programmerUnePanneDEcriture(2);
    await expect(coffre.tournerCle(cleDeCoffre(0x22, "k-2026-09"))).rejects.toThrowError();

    // Redémarrage en n'ayant posé QUE la nouvelle clé — l'erreur qu'on commet
    // le lendemain matin.
    const source = depuisDeverrouillageManuel();
    source.poser(cleBase64(0x22), "k-2026-09");
    const apres = await Coffre.ouvrir({ depot: m.depot, source });

    const lignes = await m.depot.lister();
    const orphelines = lignes.filter((ligne) => ligne.keyId !== "k-2026-09");
    expect(orphelines.length).toBeGreaterThan(0);

    const premiere = orphelines[0];
    expect(premiere).toBeDefined();
    if (premiere === undefined) {
      return;
    }

    let message = "";
    let raison: string = "";
    try {
      await apres.lire(premiere.name, premiere.version);
    } catch (erreur) {
      if (erreur instanceof ErreurDeCoffre) {
        message = erreur.message;
        raison = erreur.raison;
      }
    }

    console.info(`[garde keyId manquant] ${String(orphelines.length)} lignes orphelines mesurées`);

    expect(raison).toBe("keyid_inconnu");
    // Le message NOMME le keyId manquant, et dit que c'est rattrapable. Sans
    // cela, « impossible de déchiffrer » enverrait restaurer une sauvegarde
    // alors qu'il suffit de reposer une clé.
    expect(message).toContain(premiere.keyId);
    expect(message.toLowerCase()).toContain("ancienne");
  });

  it("REDÉMARRÉE avec les DEUX clés : tout se relit", async () => {
    const { m, coffre } = await coffreGarni();
    const ancienKeyId = coffre.sante().keyIdPrincipal ?? "";
    m.depot.programmerUnePanneDEcriture(2);
    await expect(coffre.tournerCle(cleDeCoffre(0x22, "k-2026-09"))).rejects.toThrowError();

    const source = depuisDeverrouillageManuel();
    source.poser(cleBase64(0x22), "k-2026-09");
    source.poserAncienne(cleBase64(0x11), ancienKeyId);
    const apres = await Coffre.ouvrir({ depot: m.depot, source });

    // Le sceau lui-même peut être resté sous l'ancienne clé : c'est pour cela
    // que le trousseau, et non la clé seule, ouvre le coffre.
    expect(apres.etat()).toBe("ouvert");

    let relues = 0;
    for (const ligne of await m.depot.lister()) {
      if (ligne.name === NOM_DU_SCEAU) {
        continue;
      }
      await expect(apres.lire(ligne.name, ligne.version)).resolves.toBeInstanceOf(Buffer);
      relues += 1;
    }

    console.info(`[garde deux clés] ${String(relues)} secrets relus avec le trousseau complet`);
    expect(relues).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 5 — § 27, le compteur d'amorçage
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — bootstrapCount, le mur annoncé avant d'être percuté", () => {
  it("se lit MÊME COFFRE VERROUILLÉ — l'écran Santé est servi sans le coffre", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from("x"));
    await coffre.compterUnAmorcage("zoho.refresh_token", 1);

    coffre.verrouiller();

    // § 21/§ 22 : l'écran Santé affiche `bootstrapCount` et vit sans le coffre.
    // Un compteur qu'on ne peut lire que quand tout va bien ne sert à rien le
    // jour où ça va mal.
    const compteur = await coffre.lireAmorcage("zoho.refresh_token", 1);
    expect(compteur.compte).toBe(1);
  });

  it("compte, et REFUSE au plafond", async () => {
    const m = montage();
    m.source.poser(cleBase64(0x11));
    const coffre = await Coffre.ouvrir({
      depot: m.depot,
      source: m.source,
      journal: m.journal,
      plafondBootstrap: 2,
    });
    await coffre.provisionner();
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from("x"));

    const premier = await coffre.compterUnAmorcage("zoho.refresh_token", 1);
    expect(premier.compte).toBe(1);
    expect(premier.reste).toBe(1);

    const second = await coffre.compterUnAmorcage("zoho.refresh_token", 1);
    expect(second.compte).toBe(2);
    expect(second.reste).toBe(0);

    // Le mur, annoncé.
    expect(await raisonDuRefus(() => coffre.compterUnAmorcage("zoho.refresh_token", 1))).toBe(
      "plafond_bootstrap",
    );
    expect(m.journal.compte("plafond-d-amorçage-atteint")).toBe(1);
  });

  it("sans plafond configuré, le dit — `null`, pas zéro", async () => {
    // Le CDC ne chiffre AUCUN plafond (voir écarts). Rendre `0` ou un nombre
    // inventé serait pire que rendre `null` : cela ferait croire à une limite
    // mesurée.
    const m = montage();
    const coffre = await coffreOuvert(m);
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from("x"));

    const compteur = await coffre.lireAmorcage("zoho.refresh_token", 1);
    expect(compteur.plafond).toBeNull();
    expect(compteur.reste).toBeNull();
  });

  it("survit à une réécriture du secret — une rotation ne fait pas reculer le compteur", async () => {
    const m = montage();
    const coffre = await coffreOuvert(m);
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from("x"));
    await coffre.compterUnAmorcage("zoho.refresh_token", 1);

    await coffre.tournerCle(cleDeCoffre(0x22, "k-2026-09"));

    expect((await coffre.lireAmorcage("zoho.refresh_token", 1)).compte).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Épreuve 6 — la cohérence entre le coffre et la décision de démarrage
// ═════════════════════════════════════════════════════════════════════════════

describe("core/vault/coffre — coffre et démarrage disent la MÊME chose", () => {
  it("mesure les trois états, et croise les deux modules sur chacun", async () => {
    // DEUX dérivations d'un même fait qui se contredisent est un défaut connu.
    // Cette garde les confronte : `Coffre.refusDAppelDOutil()` et
    // `decisionDeDemarrage().appelsDOutilsAcceptes` doivent toujours s'accorder.
    const base = montage();
    await coffreOuvert(base, 0x11);

    const sourceVide = depuisDeverrouillageManuel();
    const sourceOuvrante = depuisDeverrouillageManuel();
    sourceOuvrante.poser(cleBase64(0x11));

    const cas: ReadonlyArray<readonly [EtatCoffre, Coffre]> = [
      ["absent", await Coffre.ouvrir({ depot: new DepotEnMemoire(), source: sourceVide })],
      ["verrouillé", await Coffre.ouvrir({ depot: base.depot, source: sourceVide })],
      ["ouvert", await Coffre.ouvrir({ depot: base.depot, source: sourceOuvrante })],
    ];

    let mesures = 0;
    for (const [attendu, coffre] of cas) {
      expect(coffre.etat(), attendu).toBe(attendu);

      const decision = decisionDeDemarrage(coffre.etat());
      const accepte = coffre.refusDAppelDOutil() === null;

      expect(accepte, `${attendu} : appels d'outils`).toBe(decision.appelsDOutilsAcceptes);
      expect(coffre.sante().vaultLocked, `${attendu} : vaultLocked`).toBe(decision.vaultLocked);
      mesures += 1;
    }

    console.info(`[garde cohérence] ${String(mesures)} états croisés entre coffre et démarrage`);
    expect(mesures).toBe(3);
  });
});
