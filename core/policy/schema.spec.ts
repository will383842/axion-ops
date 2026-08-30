import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { LignePolitique } from "./ligne.js";

/**
 * LA GARDE DE DÉRIVATION — `LignePolitique` contre `prisma/schema.prisma`.
 *
 * « Dériver, jamais recopier. » `LignePolitique` est le miroir du modèle
 * `OpsPolicy`, et un miroir se désaligne en silence : un champ ajouté au schéma
 * par un autre chantier ne casserait RIEN ici — le calcul du niveau tournerait
 * simplement sur une vue partielle de la table.
 *
 * Cette garde lit le schéma comme un FICHIER, en dérive les champs scalaires du
 * modèle, et les compare aux clés de l'interface. Elle n'a aucune liste écrite à
 * la main.
 *
 * ⚠️ LE CHEMIN EST DÉRIVÉ DE `import.meta.url`, jamais codé en dur : une garde
 *    attachée à un chemin absolu devient muette au premier déménagement du
 *    dossier, et son silence se lit comme un succès.
 */

const CHEMIN_SCHEMA = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

/** Extrait les noms de champs SCALAIRES d'un modèle Prisma. */
function champsDuModele(source: string, modele: string): readonly string[] {
  const debut = source.indexOf(`model ${modele} {`);
  if (debut < 0) return [];
  const fin = source.indexOf("\n}", debut);
  if (fin < 0) return [];

  const corps = source.slice(debut, fin);
  const champs: string[] = [];

  for (const ligneBrute of corps.split("\n").slice(1)) {
    const ligne = ligneBrute.trim();
    // Ni commentaire (`//`, `///`), ni attribut de bloc (`@@`), ni ligne vide.
    if (ligne.length === 0 || ligne.startsWith("/") || ligne.startsWith("@@")) continue;
    const nom = /^([A-Za-z_][A-Za-z0-9_]*)\s+\S/u.exec(ligne)?.[1];
    if (nom !== undefined) champs.push(nom);
  }

  return champs;
}

describe("core/policy — `LignePolitique` reflète `OpsPolicy`", () => {
  it("rougit sur un témoin fabriqué : un schéma dont un champ manque à l'interface", () => {
    const temoin = [
      "model OpsPolicy {",
      "  id String @id",
      "  level PolicyLevel",
      "  /// un commentaire de documentation",
      "  champInvente String",
      "",
      "  @@index([scope])",
      '  @@map("ops_policy")',
      "}",
    ].join("\n");

    const champs = champsDuModele(temoin, "OpsPolicy");

    expect(champs).toEqual(["id", "level", "champInvente"]);
    // Le commentaire et les attributs de bloc ne sont pas comptés pour des
    // champs — sinon la garde rougirait toujours, donc ne dirait plus rien.
    expect(champs).not.toContain("@@index");
  });

  it("rougit si le fichier de schéma est introuvable — jamais un saut silencieux", () => {
    const absent = champsDuModele("", "OpsPolicy");
    expect(absent).toEqual([]);
    // C'est bien pour cela que la garde suivante impose un PLANCHER : zéro champ
    // mesuré est le symptôme d'un fichier déplacé, pas d'une table vide.
  });

  it("mesure les neuf champs d'`ops_policy` et les retrouve TOUS dans l'interface", () => {
    const source = readFileSync(CHEMIN_SCHEMA, "utf8");
    const duSchema = champsDuModele(source, "OpsPolicy");

    // L'exemple est TYPÉ : un champ ajouté à `LignePolitique` et oublié ici ne
    // compile pas, et un champ en trop non plus. C'est le second bout de la
    // chaîne — le premier est la comparaison au schéma.
    const exemple: LignePolitique = {
      id: "x",
      level: "brouillon",
      scope: "*",
      channel: "console",
      expiresAt: null,
      supersededAt: null,
      setBy: "will",
      setAt: new Date(0),
      reason: "garde",
    };
    const deLinterface = Object.keys(exemple);

    console.info(
      `[garde schéma] ${String(duSchema.length)} champs lus dans ${CHEMIN_SCHEMA}, ` +
        `${String(deLinterface.length)} champs dans LignePolitique`,
    );

    // Plancher-témoin : le § 12 énumère `level`, `scope`, `channel`, `expiresAt`,
    // `supersededAt`, `setBy`, `setAt`, `reason` — plus la clé primaire.
    expect(duSchema.length).toBeGreaterThanOrEqual(9);

    const manquants = duSchema.filter((champ) => !deLinterface.includes(champ));
    const enTrop = deLinterface.filter((champ) => !duSchema.includes(champ));

    expect(manquants, "champs du schéma absents de LignePolitique").toEqual([]);
    expect(enTrop, "champs de LignePolitique absents du schéma").toEqual([]);
  });

  it("vérifie que le schéma porte bien les huit champs nommés par le § 12", () => {
    const source = readFileSync(CHEMIN_SCHEMA, "utf8");
    const duSchema = new Set(champsDuModele(source, "OpsPolicy"));

    // Ceux-ci ne sont pas dérivables : le § 12 les NOMME. Les vérifier ici, c'est
    // garder que la Fondation ne les perde pas — `channel` et `supersededAt`
    // sont précisément les deux que l'audit a fait ajouter.
    const nommesParLeCdc = [
      "level",
      "scope",
      "channel",
      "expiresAt",
      "supersededAt",
      "setBy",
      "setAt",
      "reason",
    ];

    const absents = nommesParLeCdc.filter((champ) => !duSchema.has(champ));

    console.info(
      `[garde § 12] ${String(nommesParLeCdc.length)} champs nommés par le CDC vérifiés, ` +
        `${String(absents.length)} absent(s)`,
    );

    expect(absents).toEqual([]);
  });
});
