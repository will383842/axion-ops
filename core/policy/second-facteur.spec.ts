import { describe, expect, it } from "vitest";

import {
  CHIFFRES_TOTP,
  codeTotp,
  decoderBase32,
  DepotPasTotpMemoire,
  pasTotp,
  PERIODE_TOTP_S,
  SecondFacteurTotp,
  type FournisseurSecretTotp,
} from "./second-facteur.js";

/**
 * Gardes du second facteur (§ 20, protection 2).
 *
 * ⚠️ AUCUN SECRET RÉEL. Le secret employé ici est LE VECTEUR D'ESSAI PUBLIÉ de
 *    la RFC 6238 — la chaîne ASCII « 12345678901234567890 », encodée en base32.
 *    Il figure dans le document normatif ; il n'appartient à personne.
 *
 * C'est ce qui fait la force de cette garde : elle ne compare pas mon code à
 * lui-même. Elle le compare à des valeurs PUBLIÉES que je ne peux pas ajuster.
 * Une implémentation qui se tromperait de condensat, d'ordre d'octets ou de
 * troncature ne peut PAS les retrouver par hasard.
 */

/** RFC 6238, appendice B — la graine SHA-1, en base32 RFC 4648. */
const GRAINE_RFC6238 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LES VECTEURS D'ESSAI DE LA RFC 6238
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/second-facteur — TOTP RFC 6238", () => {
  it("décode la graine base32 en les vingt octets ASCII attendus", () => {
    const octets = decoderBase32(GRAINE_RFC6238);

    expect(octets).not.toBeNull();
    expect(octets?.toString("utf8")).toBe("12345678901234567890");
    expect(octets).toHaveLength(20);

    // Et refuse ce qui n'est pas du base32 : un secret « à peu près » décodé
    // produirait des codes faux sans qu'un mot soit dit.
    expect(decoderBase32("0189!")).toBeNull();
    expect(decoderBase32("")).toBeNull();
  });

  it("rougit sur un témoin fabriqué — une graine d'un octet ne retrouve rien", () => {
    // Si `codeTotp` rendait une constante, ou ignorait le secret, ce témoin
    // donnerait le MÊME code que la vraie graine. Il ne le donne pas.
    const fausse = decoderBase32("AA");
    const vraie = decoderBase32(GRAINE_RFC6238);
    expect(fausse).not.toBeNull();
    expect(vraie).not.toBeNull();
    if (fausse === null || vraie === null) return;

    expect(codeTotp(fausse, 1, 8)).not.toBe(codeTotp(vraie, 1, 8));
    expect(codeTotp(vraie, 1, 8)).not.toBe(codeTotp(vraie, 2, 8));
  });

  it("retrouve les six codes publiés à l'appendice B", () => {
    // Colonnes du tableau de la RFC, mode SHA-1, huit chiffres.
    const vecteurs: ReadonlyArray<readonly [number, string]> = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];

    const secret = decoderBase32(GRAINE_RFC6238);
    expect(secret).not.toBeNull();
    if (secret === null) return;

    let mesures = 0;
    for (const [secondes, attendu] of vecteurs) {
      const pas = pasTotp(new Date(secondes * 1000));
      expect(codeTotp(secret, pas, 8), `T=${String(secondes)}`).toBe(attendu);
      // Six chiffres, c'est la queue du même nombre.
      expect(codeTotp(secret, pas, CHIFFRES_TOTP)).toBe(attendu.slice(-CHIFFRES_TOTP));
      mesures += 1;
    }

    console.info(
      `[garde RFC 6238] ${String(mesures)} vecteurs d'essai publiés mesurés, période ${String(PERIODE_TOTP_S)} s`,
    );

    // Plancher-témoin : la RFC en publie six. Zéro vecteur mesuré rendrait cette
    // garde verte sans avoir rien comparé.
    expect(mesures).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LA VÉRIFICATION, ET SES QUATRE REFUS
// ─────────────────────────────────────────────────────────────────────────────

function fournisseur(secret: string | null): FournisseurSecretTotp {
  return { secretPour: () => Promise.resolve(secret) };
}

const T_VERIF = new Date("2026-08-30T12:00:00.000Z");

function codeCourant(decalagePas = 0): string {
  const secret = decoderBase32(GRAINE_RFC6238);
  if (secret === null) throw new Error("graine de garde illisible");
  return codeTotp(secret, pasTotp(T_VERIF) + decalagePas);
}

describe("core/policy/second-facteur — la vérification", () => {
  it("accepte le code courant, et ceux de la dérive déclarée", async () => {
    let acceptes = 0;
    for (const decalage of [-1, 0, 1]) {
      const facteur = new SecondFacteurTotp({
        secrets: fournisseur(GRAINE_RFC6238),
        pas: new DepotPasTotpMemoire(),
      });
      const resultat = await facteur.verifier({
        principal: "will",
        code: codeCourant(decalage),
        maintenant: T_VERIF,
      });
      expect(resultat.valide, `décalage ${String(decalage)}`).toBe(true);
      acceptes += 1;
    }

    console.info(`[garde dérive] ${String(acceptes)} pas de dérive acceptés (±1, soit ±30 s)`);
    expect(acceptes).toBe(3);
  });

  it("refuse au-delà de la dérive — la fenêtre a une BORNE", async () => {
    let refus = 0;
    for (const decalage of [-2, 2, 10]) {
      const facteur = new SecondFacteurTotp({
        secrets: fournisseur(GRAINE_RFC6238),
        pas: new DepotPasTotpMemoire(),
      });
      const resultat = await facteur.verifier({
        principal: "will",
        code: codeCourant(decalage),
        maintenant: T_VERIF,
      });
      expect(resultat.valide, `décalage ${String(decalage)}`).toBe(false);
      refus += 1;
    }

    console.info(`[garde borne de dérive] ${String(refus)} décalages hors fenêtre refusés`);
    expect(refus).toBe(3);
  });

  it("refuse un principal SANS second facteur — pas de mode dégradé (§ 19)", async () => {
    const facteur = new SecondFacteurTotp({
      secrets: fournisseur(null),
      pas: new DepotPasTotpMemoire(),
    });

    const resultat = await facteur.verifier({
      principal: "inconnu",
      code: codeCourant(),
      maintenant: T_VERIF,
    });

    expect(resultat.valide).toBe(false);
    if (!resultat.valide) {
      console.info(`[garde sans facteur] motif : ${resultat.motif}`);
      expect(resultat.motif).toBe("pas-de-second-facteur");
    }
  });

  it("refuse un code mal formé sans même toucher au secret", async () => {
    let refus = 0;
    let secretDemande = 0;
    const secrets: FournisseurSecretTotp = {
      secretPour: () => {
        secretDemande += 1;
        return Promise.resolve(GRAINE_RFC6238);
      },
    };

    for (const code of ["", "12345", "1234567", "abcdef", "12 456"]) {
      const facteur = new SecondFacteurTotp({ secrets, pas: new DepotPasTotpMemoire() });
      const resultat = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });
      expect(resultat.valide, code).toBe(false);
      if (!resultat.valide) expect(resultat.motif).toBe("format");
      refus += 1;
    }

    console.info(
      `[garde format] ${String(refus)} codes mal formés refusés, secret consulté ${String(secretDemande)} fois`,
    );
    expect(refus).toBe(5);
    expect(secretDemande).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — L'ANTI-REJEU, absent du motif voisin
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/second-facteur — anti-rejeu", () => {
  it("rougit sur un témoin sans mémoire des pas — deux fois le même code passent", async () => {
    // Le témoin est le comportement de `src/lib/auth-2fa.ts` du dépôt voisin :
    // `verifySync` seul, sans mémoire. Acceptable pour une connexion, pas pour
    // un desserrage de politique — un code vu par-dessus une épaule ouvre deux
    // desserrages.
    const sansMemoire = {
      dernierPas: () => Promise.resolve(null),
      enregistrerPas: () => Promise.resolve(true),
      taille: () => Promise.resolve(0),
    };
    const facteur = new SecondFacteurTotp({
      secrets: fournisseur(GRAINE_RFC6238),
      pas: sansMemoire,
    });

    const code = codeCourant();
    const premier = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });
    const second = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });

    expect(premier.valide).toBe(true);
    expect(second.valide).toBe(true); // le témoin laisse passer le rejeu
  });

  it("refuse le MÊME code présenté deux fois", async () => {
    const depotPas = new DepotPasTotpMemoire();
    const facteur = new SecondFacteurTotp({ secrets: fournisseur(GRAINE_RFC6238), pas: depotPas });

    const code = codeCourant();
    const premier = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });
    const second = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });

    console.info(
      `[garde anti-rejeu] 2 présentations mesurées, ${String(await depotPas.taille())} principal suivi, ` +
        `dernier pas ${String(await depotPas.dernierPas("will"))}`,
    );

    expect(premier.valide).toBe(true);
    expect(second.valide).toBe(false);
    if (!second.valide) expect(second.motif).toBe("rejeu");
  });

  it("refuse aussi un code ANTÉRIEUR au dernier pas consommé", async () => {
    const depotPas = new DepotPasTotpMemoire();
    const facteur = new SecondFacteurTotp({ secrets: fournisseur(GRAINE_RFC6238), pas: depotPas });

    // On consomme le pas suivant, puis on présente le précédent : il est dans la
    // fenêtre de dérive, et il doit quand même être refusé.
    const enAvance = await facteur.verifier({
      principal: "will",
      code: codeCourant(1),
      maintenant: T_VERIF,
    });
    const enRetard = await facteur.verifier({
      principal: "will",
      code: codeCourant(0),
      maintenant: T_VERIF,
    });

    expect(enAvance.valide).toBe(true);
    expect(enRetard.valide).toBe(false);
    if (!enRetard.valide) expect(enRetard.motif).toBe("rejeu");
  });

  it("ne confond pas deux principaux — la mémoire des pas est par personne", async () => {
    const depotPas = new DepotPasTotpMemoire();
    const facteur = new SecondFacteurTotp({ secrets: fournisseur(GRAINE_RFC6238), pas: depotPas });

    const code = codeCourant();
    const will = await facteur.verifier({ principal: "will", code, maintenant: T_VERIF });
    const autre = await facteur.verifier({ principal: "autre", code, maintenant: T_VERIF });

    console.info(`[garde cloisonnement] ${String(await depotPas.taille())} principaux suivis`);

    expect(will.valide).toBe(true);
    expect(autre.valide).toBe(true);
    expect(await depotPas.taille()).toBe(2);
  });
});
