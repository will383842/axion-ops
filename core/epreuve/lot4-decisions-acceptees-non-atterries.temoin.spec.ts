import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sansProse } from "../coutures/verifier.js";

/**
 * **LES DÉCISIONS ACCEPTÉES QUI N'ONT PAS ATTERRI — NOMMÉES, DATÉES, COMPTÉES.**
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * Le lot 1d a construit une garde de couture pour rendre impossible le défaut
 * « une décision écrite, testée, documentée, et jamais branchée ». Elle tourne,
 * elle annonce ses comptes, elle est verte. **Et deux ADR marqués « Statut :
 * acceptée » sont passés au travers**, dans le lot suivant.
 *
 * La cause est mesurée, et elle n'est pas un oubli : l'état `cousue` compte les
 * **APPELANTS DE PRODUCTION D'UN SYMBOLE**. Quand une décision NEUVE porte sur
 * un symbole DÉJÀ COUSU — ajouter un champ à `PortsDuService`, poser un refus
 * dans le bloc de l'étape 7 —, le symbole garde ses appelants, l'entrée reste
 * `cousue`, et la garde reste verte sur une décision qui n'existe nulle part.
 *
 * ⚠️ **CHAQUE TEST DE CE FICHIER EST NÉ `it.fails`, ET CHACUN EST UNE DETTE
 *    NOMMÉE.** Il est VERT tant que la décision n'a pas atterri, et il ROUGIT
 *    LE JOUR OÙ ELLE ATTERRIT — forçant le correcteur à retirer le `.fails`. Un
 *    `it.fails` qui passe au vert est le seul mécanisme de ce dépôt qui rende
 *    une dette impossible à laisser derrière soi.
 *
 * ✅ **DEUX Y ONT DÉJÀ BASCULÉ EN `it()` — ADR 0036, décision 1, et ADR 0043.**
 *    Le plafond de quarante outils SERVIS se refuse désormais à l'étape 7 de
 *    `core/chaine/orchestrateur.ts`, et la réimplantation qu'il éprouvait à sa
 *    place a quitté `core/__tests__/integration.spec.ts`. Les deux assertions
 *    n'ont été NI supprimées NI affaiblies : elles sont passées du futur au
 *    présent, et ce sont elles qui interdisent désormais le retour en arrière.
 *    Le CAS ÉPROUVÉ — 41 outils refusés, 40 servis, mesure aveugle refusée — vit
 *    dans `core/__tests__/integration.spec.ts`, monté sur l'orchestrateur RÉEL ;
 *    ces deux-ci gardent la FORME, jamais le comportement.
 *
 * ⚠️ **CHACUN EST NOMMÉ PAR UNE ENTRÉE DU REGISTRE**, champ `assertion`
 *    (ADR 0041). Retirer un test d'ici sans retirer l'entrée fait rougir la
 *    garde G4 : « le registre nomme un test que personne ne peut exécuter ».
 *    C'est ce qui empêche de fermer une dette en effaçant son témoin.
 *
 * ⚠️ **ILS LISENT LE DISQUE, ET ILS ANNONCENT CE QU'ILS ONT LU.** Un `it.fails`
 *    est vert dès qu'UNE de ses assertions échoue — y compris pour une raison
 *    étrangère, un chemin déplacé par exemple. Le compte d'octets lus est écrit
 *    à chaque fois : c'est ce qui distingue « la décision manque » de « je n'ai
 *    rien pu lire ».
 */

const RACINE = new URL("../../", import.meta.url);

function lire(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, RACINE)), "utf8");
}

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0036 · décision 1 — LE PLAFOND DE 40 SE REFUSE À L'ÉTAPE 7 (ADR 0043)
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0036 · décision 1 — le plafond de 40 outils servis SE REFUSE à l'étape 7", () => {
  /**
   * L'ADR 0036 décide que le plafond mord **dans le bloc de l'étape 7**, à côté
   * d'`estServi`. L'ADR 0043 tranche l'endroit exact : le refus se prononce
   * APRÈS `estServi` et AVANT `franchir(ETAPE_PROFIL_CHAINE.numero)`, dans
   * `core/chaine/orchestrateur.ts`.
   */
  it("le bloc de l'étape 7 de l'orchestrateur lit PLAFOND_OUTILS_PAR_PROFIL", () => {
    const source = sansProse(lire("core/chaine/orchestrateur.ts"));
    const debut = source.indexOf("estServi(outil, profil)");
    const fin = source.indexOf("franchir(ETAPE_PROFIL_CHAINE.numero)");
    const bloc = debut === -1 || fin === -1 ? "" : source.slice(debut, fin);

    console.info(
      `[ADR 0043 ① · atterrie] ${String(source.length)} caractère(s) lus dans orchestrateur.ts · ` +
        `bloc de l'étape 7 isolé : ${String(bloc.length)} caractère(s) · ` +
        `nomme PLAFOND_OUTILS_PAR_PROFIL : ${String(bloc.includes("PLAFOND_OUTILS_PAR_PROFIL"))}`,
    );

    // Plancher : le fichier a bien été lu, et le bloc a bien été isolé. Sans
    // eux, ce `it.fails` serait vert pour un chemin déplacé.
    expect(source.length).toBeGreaterThan(10_000);
    expect(bloc.length).toBeGreaterThan(100);
    expect(bloc).toContain("PLAFOND_OUTILS_PAR_PROFIL");
  });

  /**
   * L'ADR 0036 désigne elle-même la réimplémentation d'`integration.spec.ts`
   * comme « à SUPPRIMER ». Tant qu'elle est là, le dépôt éprouve le SOSIE de la
   * règle et non la règle : un test qui réimplémente ce qu'il garde est vert
   * quelle que soit la production.
   */
  it("la réimplémentation du plafond a QUITTÉ core/__tests__/integration.spec.ts", () => {
    const source = sansProse(lire("core/__tests__/integration.spec.ts"));
    const occurrences = (source.match(/PLAFOND_OUTILS_PAR_PROFIL/g) ?? []).length;

    console.info(
      `[ADR 0043 ② · atterrie] ${String(source.length)} caractère(s) lus dans integration.spec.ts · ` +
        `${String(occurrences)} occurrence(s) de PLAFOND_OUTILS_PAR_PROFIL (le SOSIE)`,
    );

    expect(source.length).toBeGreaterThan(10_000);
    expect(occurrences).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0037 · décisions 2 et 3 — DETTE FERMÉE AU LOT 4
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **CES DEUX `it.fails` ONT ÉTÉ RETIRÉS PARCE QUE LA DÉCISION A ATTERRI, ET
 *    C'EST LE MÉCANISME QUI L'A EXIGÉ.** `PortsDuService` porte désormais
 *    `journalDesRefus` et `delaiDeReprise`, et `monterLeService` les transmet à
 *    `creerTransportHttp` : les deux `it.fails` seraient passés au VERT, donc
 *    ROUGES au sens de `it.fails`. Un `it.fails` qui passe est le seul mécanisme
 *    de ce dépôt qui rende une dette impossible à laisser derrière soi.
 *
 * ⚠️ **ILS NE SONT PAS SUPPRIMÉS, ILS SONT REMPLACÉS PAR PLUS FORT.** Ils
 *    lisaient une FORME sur le disque — « l'interface contient-elle ce nom ? ».
 *    Les deux gardes qui les remplacent partent d'un service RÉELLEMENT MONTÉ,
 *    la première jusqu'à la socket, et chacune porte son témoin inverse :
 *    `ops/service.spec.ts`, § ③ — « un refus d'amont servi par un service
 *    RÉELLEMENT MONTÉ écrit une ligne, et refusConsignes l'ADDITIONNE » et « un
 *    429 servi par un service RÉELLEMENT MONTÉ porte Retry-After, et le
 *    non-armé ne le porte pas ». Les deux entrées du registre les NOMMENT
 *    (champ `assertion`), si bien qu'aucune des deux ne peut disparaître sans
 *    faire rougir G4.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0044 — LE FILET ANTI-FUITE COUVRE DÉSORMAIS LES DEUX TRANSPORTS
// ═════════════════════════════════════════════════════════════════════════════

describe("ATTERRI · le filet anti-fuite du § 20 sert les DEUX fils (ADR 0044)", () => {
  /**
   * Le § 20 exige que le jeton de confirmation ne paraisse « jamais dans la
   * réponse d'erreur », **sans distinguer le transport**. Le fil stdio sert le
   * MÊME noyau (ADR 0025) et transporte le même jeton ; il n'avait aucun
   * équivalent. L'ADR 0044 a tranché : le filet remonte à `core/transport/`.
   *
   * ⚠️ **LE `.fails` A ÉTÉ RETIRÉ AU LOT 4, ET C'EST LE MÉCANISME QUI L'A
   *    EXIGÉ.** Le jour où la décision a atterri, cet `it.fails` a cessé
   *    d'échouer — donc il est devenu ROUGE, vitest exigeant d'un `it.fails`
   *    qu'il échoue. Transcrit : `1 failed | 3 passed` sur ce fichier, puis le
   *    `.fails` retiré. La dette a été impossible à laisser derrière soi, et ce
   *    test est désormais une garde VIVANTE : il rougit le jour où le filet
   *    redescend sous `core/transport/http/`, ou perd son appelant côté stdio.
   *
   * ⚠️ **CE QU'IL MESURE, ET CE QU'IL NE MESURE PAS.** Il lit des FORMES sur le
   *    disque — un fichier présent, un appelant trouvé. Que le filet MORDE
   *    réellement sur les deux fils est une autre question, et elle appartient à
   *    `core/transport/anti-fuite.spec.ts`, qui met la MÊME entrée devant les
   *    deux transports et relit ce qui part sur le fil. Aucune des deux gardes
   *    ne subsume l'autre, et c'est pourquoi il y en a deux.
   */
  it("verifierAucuneFuite vit sous core/transport/ et les DEUX transports l'appellent", () => {
    const remonte = existsSync(fileURLToPath(new URL("core/transport/anti-fuite.ts", RACINE)));
    const stdio = readdirSync(fileURLToPath(new URL("core/transport/stdio/", RACINE)))
      .filter((nom) => nom.endsWith(".ts") && !nom.endsWith(".spec.ts"))
      .map((nom) => ({ nom, source: sansProse(lire(`core/transport/stdio/${nom}`)) }));
    const appelantsStdio = stdio.filter((f) => /verifierAucuneFuite\s*\(/.test(f.source));

    console.info(
      `[dette · 0044] core/transport/anti-fuite.ts présent : ${String(remonte)} · ` +
        `${String(stdio.length)} module(s) de production balayé(s) sous core/transport/stdio/ · ` +
        `${String(appelantsStdio.length)} appelant(s) de verifierAucuneFuite ` +
        `[${appelantsStdio.map((f) => f.nom).join(", ") || "aucun"}]`,
    );

    // Plancher : le dossier stdio a réellement été lu.
    expect(stdio.length).toBeGreaterThanOrEqual(4);
    expect(remonte).toBe(true);
    expect(appelantsStdio.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0045 — LES DIX TABLES NE SONT MATÉRIALISABLES PAR AUCUN CHEMIN
// ═════════════════════════════════════════════════════════════════════════════

describe("dette CLOSE · la migration initiale est au dépôt, et le SQL se chaîne après elle", () => {
  /**
   * ⚠️ **CE TEST N'EST PLUS UN `it.fails`, ET C'EST LA PREUVE ATTENDUE DU
   *    CORRECTEUR (ADR 0046).** Il a été écrit VERT-SI-LA-DÉCISION-MANQUE : tant
   *    que `prisma/migrations/` n'existait pas, l'`it.fails` passait. Le jour où
   *    la migration a atterri, il a ROUGI — forçant à retirer le `.fails`. C'est
   *    le seul mécanisme de ce dépôt qui rende une dette impossible à laisser
   *    derrière soi.
   *
   * `prisma/sql/0001-ops-audit-append-only.sql` se déclarait lui-même
   * « s'applique APRÈS `prisma migrate deploy` », et il n'y avait RIEN après
   * quoi s'appliquer. Le journal en ajout seul de l'ADR 0002 — seule chose qui
   * empêche un compte disposant d'`UPDATE` de retirer une tranche PUIS de
   * recalculer la chaîne — n'était appliqué par rien.
   *
   * ⚠️ **LE SECOND CONTRÔLE EST CELUI QUI MANQUAIT AU PREMIER.** Une migration
   *    présente ne dit pas que le script d'ajout seul s'applique APRÈS elle. Cet
   *    ordre-là est écrit dans le script `db:deploy` de `package.json`, et il est
   *    lu ici — un ordre convenu oralement s'inverse au premier remplaçant.
   */
  it("prisma/migrations/ porte une migration initiale, et le SQL se chaîne après elle", () => {
    const dossier = fileURLToPath(new URL("prisma/migrations/", RACINE));
    const present = existsSync(dossier);
    const migrations = present
      ? readdirSync(dossier, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];
    const schema = lire("prisma/schema.prisma");
    const modeles = (schema.match(/^model\s+\w+/gm) ?? []).length;

    const manifeste = JSON.parse(lire("package.json")) as { scripts?: Record<string, string> };
    const deploiement = manifeste.scripts?.["db:deploy"] ?? "";
    const rangMigration = deploiement.indexOf("prisma migrate deploy");
    const rangAjoutSeul = deploiement.indexOf("prisma/sql/0001-ops-audit-append-only.sql");

    console.info(
      `[0045] prisma/migrations/ présent : ${String(present)} · ` +
        `${String(migrations.length)} migration(s) [${migrations.join(", ") || "aucune"}] · ` +
        `${String(modeles)} modèle(s) déclaré(s) au schéma, matérialisables par ` +
        `${String(migrations.length)} chemin(s) reproductible(s) · ` +
        `script db:deploy : ${String(deploiement.length)} caractère(s), ` +
        `« prisma migrate deploy » en ${String(rangMigration)}, ` +
        `script d'ajout seul en ${String(rangAjoutSeul)}`,
    );

    // Plancher : le schéma a bien été lu, et il porte les tables du § 12.
    expect(modeles).toBeGreaterThanOrEqual(10);
    expect(present).toBe(true);
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    // Et l'ORDRE est écrit, pas convenu.
    expect(rangMigration).toBeGreaterThanOrEqual(0);
    expect(rangAjoutSeul).toBeGreaterThan(rangMigration);
  });
});
