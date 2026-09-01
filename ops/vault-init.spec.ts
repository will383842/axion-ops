import { describe, expect, it } from "vitest";

import {
  ARGUMENT_DE_REPETITION,
  REFUS_DE_PROVISION,
  executerLeProvisionnement,
  provisionnerLeCoffre,
} from "./vault-init.js";
import type { MondeDuProvisionnement } from "./vault-init.js";
import { COMMANDE_DE_PROVISION } from "../core/vault/demarrage.js";
import { DepotEnMemoire, VARIABLES_DE_CLE, depuisEnvironnement } from "../core/vault/index.js";
import type { DepotDeSecrets } from "../core/vault/index.js";
import { lireDuDepot } from "../core/epreuve/perimetre-de-production.js";

/**
 * **LE GESTE QUE LE SOCLE NOMMAIT SANS QU'IL EXISTE — ADR 0046.**
 *
 * ⚠️ **AUCUNE CLÉ RÉELLE N'ENTRE ICI.** Les 32 octets utilisés sont une suite
 *    constante et publique, fabriquée à l'octet près dans ce fichier. Ce dépôt
 *    est PUBLIC ; une clé de démonstration lisible comme telle vaut mieux
 *    qu'une valeur qui aurait l'air d'un secret.
 *
 * ⚠️ **AUCUNE BASE, AUCUN RÉSEAU.** Le dépôt de secrets est
 *    `DepotEnMemoire` — celui que le socle monte déjà aujourd'hui.
 */

/** 32 octets constants, encodés en base64. Une clé de DÉMONSTRATION, publique. */
const CLE_DE_DEMONSTRATION = Buffer.alloc(32, 7).toString("base64");
/** Une seconde, distincte, pour éprouver qu'on n'écrase pas un coffre existant. */
const AUTRE_CLE_DE_DEMONSTRATION = Buffer.alloc(32, 19).toString("base64");

function environnement(cle?: string): Readonly<Record<string, string | undefined>> {
  return cle === undefined ? {} : { [VARIABLES_DE_CLE.cle]: cle };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE GESTE LUI-MÊME
// ═════════════════════════════════════════════════════════════════════════════

describe("le provisionnement du coffre — les quatre gestes, dans cet ordre", () => {
  it("pose le sceau sur un coffre ABSENT, et DIT ce qu'il a fait", async () => {
    const depot: DepotDeSecrets = new DepotEnMemoire();
    const rapport = await provisionnerLeCoffre({
      depot,
      source: depuisEnvironnement(environnement(CLE_DE_DEMONSTRATION)),
    });

    console.info(
      `[vault:init] état ${rapport.etatAvant} → ${rapport.etatApres} · ` +
        `clé fournie : ${String(rapport.cleFournie)} · sceau posé : ${String(rapport.sceauPose)} · ` +
        `keyId « ${rapport.keyId ?? "aucun"} » · refus ${rapport.refus ?? "aucun"} · ` +
        `${String(rapport.lignes.length)} ligne(s) de rapport`,
    );

    expect(rapport.etatAvant).toBe("absent");
    expect(rapport.etatApres).toBe("ouvert");
    expect(rapport.sceauPose).toBe(true);
    expect(rapport.refus).toBeNull();
    // Le rapport DIT quelque chose : un programme muet ne se relit pas.
    expect(rapport.lignes.length).toBeGreaterThanOrEqual(3);
    expect(rapport.keyId).not.toBeNull();
  });

  /**
   * ⚠️ **L'ASSERTION DE L'ADR 0046, DÉCISION 1.** L'ordre des deux contrôles
   *    EST la décision : l'état d'abord, la clé ensuite. L'inverse donnerait,
   *    sur un coffre déjà créé dont la clé a été oubliée, le message « pose une
   *    clé » — c'est-à-dire l'invitation exacte à provisionner par-dessus, et
   *    le seul remède serait une restauration.
   */
  it("refuse un coffre DÉJÀ CRÉÉ avant même de regarder la clé, et ne pose rien", async () => {
    const depot: DepotDeSecrets = new DepotEnMemoire();
    const pose = await provisionnerLeCoffre({
      depot,
      source: depuisEnvironnement(environnement(CLE_DE_DEMONSTRATION)),
    });

    // Deuxième passage, AVEC une autre clé : le sceau existant ne doit pas bouger.
    const rejoue = await provisionnerLeCoffre({
      depot,
      source: depuisEnvironnement(environnement(AUTRE_CLE_DE_DEMONSTRATION)),
    });
    // Troisième passage, SANS aucune clé : le refus doit rester le MÊME. C'est
    // ce qui prouve que l'état a été regardé AVANT la clé.
    const sansCle = await provisionnerLeCoffre({
      depot,
      source: depuisEnvironnement(environnement()),
    });

    console.info(
      `[vault:init · déjà créé] pose → ${String(pose.sceauPose)} (keyId « ${pose.keyId ?? "?"} ») · ` +
        `rejeu avec une AUTRE clé → refus « ${rejoue.refus ?? "aucun"} », sceau posé ` +
        `${String(rejoue.sceauPose)} · rejeu SANS clé → refus « ${sansCle.refus ?? "aucun"} » · ` +
        `${String((depot as DepotEnMemoire).ecritures)} écriture(s) au dépôt en tout`,
    );

    expect(pose.sceauPose).toBe(true);
    expect(rejoue.refus).toBe("coffre-déjà-créé");
    expect(rejoue.sceauPose).toBe(false);
    // ⚠️ LE POINT : sans clé, le refus n'est PAS « clé-absente ». L'état passe
    //    en premier, sinon le message enverrait poser une clé sur un coffre
    //    qu'il ne faut surtout pas re-sceller.
    expect(sansCle.refus).toBe("coffre-déjà-créé");
    // Une seule écriture pour trois appels : rien n'a été écrasé.
    expect((depot as DepotEnMemoire).ecritures).toBe(1);
    expect(REFUS_DE_PROVISION).toContain("coffre-déjà-créé");
  });

  it("refuse sans clé en NOMMANT la variable, et ne fabrique rien à la place", async () => {
    const depot: DepotDeSecrets = new DepotEnMemoire();
    const rapport = await provisionnerLeCoffre({
      depot,
      source: depuisEnvironnement(environnement()),
    });
    const texte = rapport.lignes.join(" ");

    console.info(
      `[vault:init · sans clé] refus « ${rapport.refus ?? "aucun"} » · ` +
        `état ${rapport.etatAvant} → ${rapport.etatApres} · ` +
        `${String((depot as DepotEnMemoire).ecritures)} écriture(s) au dépôt · ` +
        `le message nomme ${VARIABLES_DE_CLE.cle} : ${String(texte.includes(VARIABLES_DE_CLE.cle))}`,
    );

    expect(rapport.refus).toBe("clé-absente");
    expect(rapport.cleFournie).toBe(false);
    expect(rapport.etatApres).toBe("absent");
    expect((depot as DepotEnMemoire).ecritures).toBe(0);
    // Le message nomme la variable ET la commande à relancer. Sans les deux, il
    // faudrait relire ce fichier au pire moment.
    expect(texte).toContain(VARIABLES_DE_CLE.cle);
    expect(texte).toContain(COMMANDE_DE_PROVISION);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE PROGRAMME NE FERA JAMAIS
// ═════════════════════════════════════════════════════════════════════════════

describe("la clé est SÉQUESTRÉE avant d'être posée — le programme n'en génère aucune", () => {
  /**
   * ⚠️ **L'ASSERTION DE L'ADR 0046, DÉCISION 2.** Le § 25 exige que la clé soit
   *    séquestrée hors machine AVANT d'être posée. Un outil qui la génère
   *    invite à sauter le séquestre : la clé naît dans le terminal, le coffre
   *    s'ouvre, tout marche — et la sauvegarde hors machine est indéchiffrable
   *    le seul jour où elle sert.
   *
   * Cette garde lit le SOURCE, parce que la propriété gardée est une ABSENCE :
   * aucune exécution ne peut prouver qu'une génération n'existe nulle part.
   */
  it("ne fabrique AUCUNE clé : aucune génération d'aléa n'entre dans ops/vault-init.ts", () => {
    const source = lireDuDepot("ops/vault-init.ts");
    const formes = [
      "randomBytes",
      "randomFillSync",
      "generateKeySync",
      "getRandomValues",
      "randomUUID",
      "Math.random",
    ];
    const trouvees = formes.filter((forme) => source.includes(forme));

    console.info(
      `[vault:init · séquestre] ${String(source.length)} caractère(s) lus dans ` +
        `ops/vault-init.ts · ${String(formes.length)} forme(s) de génération cherchée(s) ` +
        `[${formes.join(", ")}] · ${String(trouvees.length)} trouvée(s) ` +
        `[${trouvees.join(", ") || "aucune"}] · le fichier dit comment en produire une ` +
        `hors de lui : ${String(source.includes("openssl rand -base64 32"))}`,
    );

    // Plancher : le fichier a réellement été lu.
    expect(source.length).toBeGreaterThan(5_000);
    expect(trouvees).toEqual([]);
    // Et il DIT où en produire une, sinon l'interdiction serait un mur nu.
    expect(source).toContain("openssl rand -base64 32");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE PROGRAMME, MONTÉ SANS `process`
// ═════════════════════════════════════════════════════════════════════════════

/** Un monde fabriqué : pas de `process`, pas de base, pas de disque. */
function mondeFabrique(
  options: Readonly<{
    cle?: string;
    arguments?: readonly string[];
    depot?: DepotDeSecrets | null;
  }>,
): { monde: MondeDuProvisionnement; sortie: string[]; erreurs: string[] } {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  const monde: MondeDuProvisionnement = {
    env: environnement(options.cle),
    arguments: options.arguments ?? [],
    ecrire: (ligne) => sortie.push(ligne),
    ecrireErreur: (ligne) => erreurs.push(ligne),
    ouvrirLeDepotDeLaBase: () => Promise.resolve(options.depot ?? null),
  };
  return { monde, sortie, erreurs };
}

describe("le programme d'exploitation — il rend un code, et il dit pourquoi", () => {
  it("en RÉPÉTITION, éprouve la clé sur un dépôt jetable et le DIT", async () => {
    const { monde, sortie, erreurs } = mondeFabrique({
      cle: CLE_DE_DEMONSTRATION,
      arguments: [ARGUMENT_DE_REPETITION],
    });

    const code = await executerLeProvisionnement(monde);

    console.info(
      `[vault:init · répétition] code de sortie ${String(code)} · ` +
        `${String(sortie.length)} ligne(s) sur la sortie · ` +
        `${String(erreurs.length)} sur la sortie d'erreur · ` +
        `annonce la répétition : ${String(sortie.join(" ").includes("RÉPÉTITION"))}`,
    );

    expect(code).toBe(0);
    expect(erreurs).toEqual([]);
    expect(sortie.join(" ")).toContain("RÉPÉTITION");
    expect(sortie.join(" ")).toContain("répétition : true");
  });

  it("sans base ET sans répétition, refuse en nommant les gestes qui manquent", async () => {
    const { monde, sortie, erreurs } = mondeFabrique({ cle: CLE_DE_DEMONSTRATION, depot: null });

    const code = await executerLeProvisionnement(monde);
    const texte = erreurs.join(" ");

    console.info(
      `[vault:init · sans base] code de sortie ${String(code)} · ` +
        `${String(sortie.length)} ligne(s) sur la sortie · ` +
        `${String(erreurs.length)} sur la sortie d'erreur · nomme db:deploy : ` +
        `${String(texte.includes("db:deploy"))} · nomme la répétition : ` +
        `${String(texte.includes(ARGUMENT_DE_REPETITION))}`,
    );

    expect(code).toBe(1);
    expect(texte).toContain("DATABASE_URL");
    expect(texte).toContain("prisma:generate");
    expect(texte).toContain("db:deploy");
    expect(texte).toContain(ARGUMENT_DE_REPETITION);
  });

  it("rend 1 et NOMME le refus quand la clé manque, jamais un échec muet", async () => {
    const { monde, sortie, erreurs } = mondeFabrique({ arguments: [ARGUMENT_DE_REPETITION] });

    const code = await executerLeProvisionnement(monde);

    console.info(
      `[vault:init · clé manquante] code ${String(code)} · ` +
        `${String(sortie.length)} ligne(s) sur la sortie · ` +
        `${String(erreurs.length)} sur la sortie d'erreur · ` +
        `le refus est nommé : ${String(sortie.join(" ").includes("clé-absente"))}`,
    );

    expect(code).toBe(1);
    // Le refus est NOMMÉ sur la ligne de synthèse : « 1 » se lit « ça n'a pas
    // marché » ; « clé-absente » se lit « pose la clé ».
    expect(sortie.join(" ")).toContain("clé-absente");
    expect(erreurs.length).toBeGreaterThanOrEqual(1);
  });
});
