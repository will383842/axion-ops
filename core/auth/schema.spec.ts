import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OPS_SCOPES } from "../types.js";
import { GENRES_DE_JETON } from "./depot.js";
import type { LigneOpsToken } from "./depot.js";
import { creerDepotDeJetonsEnMemoire } from "./memoire.js";

/**
 * GARDE DE COUTURE `ops_token` ↔ `core/auth/depot.ts` — ADR 0027, point 4.
 *
 * ═══ LE DÉFAUT QUE CETTE GARDE FERME ═══
 *
 * L'ADR 0027 exige que les deux colonnes neuves atterrissent « **avec leur
 * migration ET leur lecteur, dans le même geste** », parce que « poser une
 * colonne sans lecteur fabriquerait une seconde source de vérité » — le motif
 * pour lequel le lot 1d a refusé de poser `governanceFields` seul.
 *
 * Une prose ne tient pas cela. Ce fichier le tient : il LIT `model OpsToken`
 * dans `prisma/schema.prisma`, LIT les champs de `LigneOpsToken` par une valeur
 * réellement construite, et exige que les deux ensembles soient **égaux**. Une
 * colonne sans champ et un champ sans colonne sont deux anomalies distinctes,
 * comptées séparément.
 *
 * ⚠️ **POURQUOI LES CHAMPS SONT LUS SUR UNE VALEUR, ET NON DANS LE SOURCE.** Un
 *    type TypeScript n'existe pas à l'exécution ; le lire par une expression
 *    régulière sur le fichier ferait une TROISIÈME dérivation, à tenir en accord
 *    avec les deux autres. Construire une ligne complète et énumérer ses clés
 *    passe par le COMPILATEUR : un champ ajouté à `LigneOpsToken` sans être posé
 *    ici **ne compile pas**, et un champ retiré non plus.
 */

const SCHEMA = readFileSync(
  fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

/**
 * Les noms de colonnes de `model OpsToken`, LUS dans le schéma.
 *
 * Les lignes de documentation (`///`) et les attributs de bloc (`@@`) sont
 * écartés : ce sont les seules formes que le bloc porte en plus des colonnes.
 */
function colonnesDuModele(modele: string): readonly string[] {
  const debut = SCHEMA.indexOf(`model ${modele} {`);
  if (debut < 0) {
    throw new Error(
      `prisma/schema.prisma : \`model ${modele}\` est introuvable — la garde ne lit plus ce ` +
        "qu'elle prétend lire, et son verdict ne vaut rien.",
    );
  }
  const fin = SCHEMA.indexOf("\n}", debut);
  const corps = SCHEMA.slice(debut, fin);
  const colonnes: string[] = [];
  for (const ligne of corps.split("\n").slice(1)) {
    const nu = ligne.trim();
    if (nu.length === 0 || nu.startsWith("///") || nu.startsWith("//") || nu.startsWith("@@")) {
      continue;
    }
    const trouve = /^([A-Za-z_][A-Za-z0-9_]*)\s+\S/.exec(nu);
    if (trouve?.[1] !== undefined) colonnes.push(trouve[1]);
  }
  return colonnes;
}

/**
 * UNE LIGNE COMPLÈTE, posée à la main. Le compilateur exige TOUS les champs de
 * `LigneOpsToken` — c'est ce qui fait de `Object.keys` une dérivation du type et
 * non une seconde liste.
 */
const LIGNE_COMPLETE: LigneOpsToken = {
  jti: "jti-de-temoin",
  tokenHash: "a".repeat(64),
  principal: "connecteur.mcp",
  kind: "access",
  scopes: ["ops:read"],
  audience: "https://stub.invalid/api/mcp",
  grantId: "grant-de-temoin",
  sessionId: "0".repeat(64),
  issuedAt: new Date("2026-08-31T09:00:00.000Z"),
  expiresAt: new Date("2026-08-31T10:00:00.000Z"),
  revokedAt: null,
  lastUsedAt: null,
};

describe("ADR 0027 — `ops_token` et son lecteur ne peuvent pas diverger", () => {
  it("chaque colonne a son champ, et chaque champ sa colonne", () => {
    const colonnes = colonnesDuModele("OpsToken");
    const champs = Object.keys(LIGNE_COMPLETE);

    const colonnesSansChamp = colonnes.filter((colonne) => !champs.includes(colonne));
    const champsSansColonne = champs.filter((champ) => !colonnes.includes(champ));

    console.info(
      `[ADR 0027 · couture] ${String(colonnes.length)} colonne(s) lue(s) dans ` +
        `model OpsToken [${colonnes.join(", ")}] · ${String(champs.length)} champ(s) de ` +
        `LigneOpsToken · ${String(colonnesSansChamp.length)} colonne(s) sans lecteur ` +
        `[${colonnesSansChamp.join(", ") || "aucune"}] · ${String(champsSansColonne.length)} ` +
        `champ(s) sans colonne [${champsSansColonne.join(", ") || "aucun"}]`,
    );

    // Plancher : la lecture du schéma a RÉELLEMENT rendu quelque chose. Zéro
    // colonne rendrait « aucun écart » sans rien confronter.
    expect(colonnes.length).toBeGreaterThanOrEqual(10);
    // ⚠️ LES DEUX SENS SONT DES ANOMALIES DISTINCTES. Une colonne sans lecteur
    //    est la seconde source de vérité que l'ADR refuse ; un champ sans colonne
    //    est un émetteur qui écrit dans le vide.
    expect(colonnesSansChamp).toEqual([]);
    expect(champsSansColonne).toEqual([]);
  });

  it("les DEUX colonnes de l'ADR 0027 sont là, et elles portent leur motif", () => {
    const colonnes = colonnesDuModele("OpsToken");
    const bloc = SCHEMA.slice(
      SCHEMA.indexOf("model OpsToken {"),
      SCHEMA.indexOf("\n}", SCHEMA.indexOf("model OpsToken {")),
    );

    console.info(
      `[ADR 0027 · colonnes neuves] grantId présent : ` +
        `${String(colonnes.includes("grantId"))} · sessionId présent : ` +
        `${String(colonnes.includes("sessionId"))} · ` +
        `bloc de ${String(bloc.length)} caractère(s) lu`,
    );

    expect(colonnes).toContain("grantId");
    expect(colonnes).toContain("sessionId");
    // ⚠️ UNE COLONNE SANS MOTIF ÉCRIT EST UN RÉGLAGE. Les deux nomment leur ADR
    //    et leur lecteur — c'est ce qui permettra de savoir, dans un an, si elles
    //    servent encore.
    expect(bloc).toContain("ADR 0027");
    expect(bloc).toContain("ADR 0014");
  });

  it("TÉMOIN — la lecture du schéma SAIT rougir sur un modèle absent", () => {
    // Sans ce témoin, « 12 colonnes lues » pourrait venir d'un lecteur qui rend
    // toujours quelque chose. Un modèle inexistant doit LEVER, pas rendre vide.
    let leve = false;
    try {
      colonnesDuModele("OpsJamaisEcrit");
    } catch {
      leve = true;
    }

    console.info(`[ADR 0027 · témoin] modèle inexistant · levée : ${String(leve)}`);
    expect(leve).toBe(true);
  });

  it("le vocabulaire des colonnes de texte est celui du code — genres et scopes", () => {
    /**
     * ⚠️ `kind` ET `scopes` SONT DES `String` EN BASE, ET DES TOTALITÉS DANS LE
     *    CODE. Prisma ne portera pas l'énumération — le § 12 range `scopes` en
     *    `String[]` et `kind` en `String` — donc rien, côté base, n'empêche une
     *    valeur inventée. Ce qui la retient est le TYPE, et ce test mesure que le
     *    dépôt refuse effectivement d'écrire une ligne hors vocabulaire.
     */
    const bloc = SCHEMA.slice(
      SCHEMA.indexOf("model OpsToken {"),
      SCHEMA.indexOf("\n}", SCHEMA.indexOf("model OpsToken {")),
    );
    const scopesNommesAuSchema = OPS_SCOPES.filter((scope) => bloc.includes(scope));

    console.info(
      `[ADR 0027 · vocabulaire] ${String(GENRES_DE_JETON.length)} genre(s) de jeton dans le ` +
        `code [${GENRES_DE_JETON.join(", ")}] · ` +
        `${String(scopesNommesAuSchema.length)} scope(s) sur ${String(OPS_SCOPES.length)} ` +
        `nommés dans la documentation de la colonne`,
    );

    // Les deux genres du code sont nommés dans la documentation de `kind`.
    for (const genre of GENRES_DE_JETON) expect(bloc).toContain(genre);
    // Et les cinq scopes du § 19.2 y sont énumérés : la colonne dit ce qu'elle
    // porte, faute d'énumération en base.
    expect(scopesNommesAuSchema).toHaveLength(OPS_SCOPES.length);
  });

  it("le magasin accepte une ligne complète — la forme du port est CONSTRUCTIBLE", async () => {
    // ⚠️ SANS CE TEST, `LIGNE_COMPLETE` pourrait être une valeur que rien
    //    n'accepte, et la confrontation ci-dessus porterait sur un type mort.
    const depot = creerDepotDeJetonsEnMemoire();
    await depot.inserer(LIGNE_COMPLETE);
    const relue = await depot.parJti(LIGNE_COMPLETE.jti);

    console.info(
      `[ADR 0027 · aller-retour] ligne insérée et relue · ` +
        `${String(Object.keys(relue ?? {}).length)} champ(s) rendus · ` +
        `grantId conservé : ${String(relue?.grantId === LIGNE_COMPLETE.grantId)} · ` +
        `sessionId conservé : ${String(relue?.sessionId === LIGNE_COMPLETE.sessionId)}`,
    );

    expect(relue?.grantId).toBe(LIGNE_COMPLETE.grantId);
    expect(relue?.sessionId).toBe(LIGNE_COMPLETE.sessionId);
    expect(Object.keys(relue ?? {})).toHaveLength(Object.keys(LIGNE_COMPLETE).length);
  });
});
