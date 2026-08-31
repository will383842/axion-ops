/**
 * `core/auth/memoire.ts` — **LES DEUX MAGASINS EN MÉMOIRE, ET CE QU'ILS NE SONT
 * PAS.**
 *
 * ═══ POURQUOI CE FICHIER EST DE PRODUCTION, ET NON UNE FIXTURE ═══
 *
 * Le critère de recette de ce lot est que **le socle DÉMARRE EN LOCAL avec des
 * valeurs factices sur `stub.invalid`**. `stub.invalid` ne résout jamais (RFC
 * 2606) : aucune base n'est joignable, et un émetteur qui n'aurait qu'une
 * implantation Prisma ne pourrait pas démarrer du tout. C'est le même motif que
 * `core/limits/memoire.ts`, `core/audit/memoire.ts` et `core/instance/memoire.ts`,
 * qui shippent tous pour la même raison.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE — ET ELLE EST GRAVE.** Ces magasins ne
 *    survivent PAS au processus :
 *
 *     · un redémarrage invalide TOUS les jetons émis. En exploitation, cela veut
 *       dire que chaque déploiement déconnecte tous les clients MCP ;
 *     · `revokedAt` disparaît avec le reste — une révocation « tient » parce que
 *       la ligne révoquée n'existe plus, ce qui a le même effet et n'est PAS la
 *       même chose : une revue ne retrouve aucune trace de la révocation ;
 *     · rien n'est chaîné ni scellé : ce n'est pas `ops_audit`, et ce fichier ne
 *       remplace aucune ligne de journal.
 *
 *    **Ils sont donc le magasin du POSTE DE TRAVAIL et de l'épreuve, jamais celui
 *    de la production.** L'implantation Prisma appartient au lot qui montera la
 *    base ; ce fichier ne prétend pas la préfigurer, et
 *    {@link MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS} porte cet avis à un
 *    endroit qu'une garde peut lire.
 *
 * ⚠️ **CE N'EST PAS UN DOUBLE DE TEST DÉGUISÉ.** Un double de test ment sur
 *    demande ; ces deux magasins tiennent EXACTEMENT les invariants que le port
 *    déclare — unicité du `jti` et du `tokenHash`, révocation qui ne se réécrit
 *    pas, consommation atomique d'un code. Les éprouver, c'est éprouver le
 *    contrat, ce qu'un double complaisant n'aurait pas permis.
 */

import type {
  DemandeDAutorisation,
  DepotDeDemandes,
  DepotDeJetons,
  LigneOpsToken,
} from "./depot.js";

/**
 * L'avis, sous une forme qu'une garde peut lire et qu'un écran peut afficher
 * (§ 22, écran Santé). Une borne écrite dans un commentaire ne se surveille pas.
 */
export const MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS =
  "magasin en mémoire : les jetons et les codes émis disparaissent au redémarrage, et " +
  "la trace des révocations avec eux. Poste de travail et épreuve seulement.";

/** Une ligne déjà présente. Le port l'exige : un dépôt n'écrase jamais. */
export class ErreurJetonDejaPresent extends Error {
  public constructor(champ: "jti" | "tokenHash") {
    super(
      `ops_token : une ligne portant le même « ${champ} » existe déjà. Le schéma le déclare ` +
        "UNIQUE, et écraser reviendrait à remplacer un jeton vivant par un autre — la " +
        "révocation du premier ne serait alors ni possible ni traçable.",
    );
    this.name = "ErreurJetonDejaPresent";
  }
}

/** Un code d'autorisation déjà déposé. */
export class ErreurCodeDejaDepose extends Error {
  public constructor() {
    super(
      "Un code d'autorisation identique est déjà en vol. Un code est à usage UNIQUE " +
        "(RFC 6749 § 10.5) : le redéposer ouvrirait deux échanges pour un seul consentement.",
    );
    this.name = "ErreurCodeDejaDepose";
  }
}

/**
 * LE MAGASIN DE JETONS EN MÉMOIRE.
 *
 * ⚠️ **LES LIGNES SONT COPIÉES À L'ENTRÉE ET À LA SORTIE.** Rendre la référence
 *    stockée laisserait un appelant muter `revokedAt` sans passer par
 *    `revoquer()` — c'est-à-dire contourner la seule opération que le port
 *    surveille. Une base ne rend jamais un objet mutable partagé ; le double ne
 *    doit pas être plus permissif que ce qu'il double.
 */
export function creerDepotDeJetonsEnMemoire(): DepotDeJetons {
  const parJti = new Map<string, LigneOpsToken>();
  const parEmpreinte = new Map<string, string>();

  const copie = (ligne: LigneOpsToken): LigneOpsToken => ({
    ...ligne,
    scopes: [...ligne.scopes],
    issuedAt: new Date(ligne.issuedAt.getTime()),
    expiresAt: new Date(ligne.expiresAt.getTime()),
    revokedAt: ligne.revokedAt === null ? null : new Date(ligne.revokedAt.getTime()),
    lastUsedAt: ligne.lastUsedAt === null ? null : new Date(ligne.lastUsedAt.getTime()),
  });

  return {
    // ⚠️ `async`, ET CE N'EST PAS COSMÉTIQUE : un `throw` dans une méthode qui
    //    rend une `Promise` sans être `async` lève SYNCHRONEMENT, et un appelant
    //    qui écrit `await depot.inserer(...)` dans un `try` l'attrape quand même
    //    — mais un appelant qui chaîne `.catch()` ne l'attrape PAS. Le port
    //    déclare une promesse ; il doit REJETER, jamais lever.
    async inserer(ligne: LigneOpsToken): Promise<void> {
      await Promise.resolve();
      if (parJti.has(ligne.jti)) throw new ErreurJetonDejaPresent("jti");
      if (parEmpreinte.has(ligne.tokenHash)) throw new ErreurJetonDejaPresent("tokenHash");
      parJti.set(ligne.jti, copie(ligne));
      parEmpreinte.set(ligne.tokenHash, ligne.jti);
    },

    parEmpreinte(tokenHash: string): Promise<LigneOpsToken | null> {
      const jti = parEmpreinte.get(tokenHash);
      if (jti === undefined) return Promise.resolve(null);
      const ligne = parJti.get(jti);
      return Promise.resolve(ligne === undefined ? null : copie(ligne));
    },

    parJti(jti: string): Promise<LigneOpsToken | null> {
      const ligne = parJti.get(jti);
      return Promise.resolve(ligne === undefined ? null : copie(ligne));
    },

    revoquer(jti: string, quand: Date): Promise<boolean> {
      const ligne = parJti.get(jti);
      if (ligne === undefined) return Promise.resolve(false);
      // Une révocation ne se RÉÉCRIT pas : `revokedAt` dit quand la capacité a
      // cessé, et l'écraser effacerait le seul instant qui compte pour une revue.
      if (ligne.revokedAt !== null) return Promise.resolve(true);
      parJti.set(jti, { ...ligne, revokedAt: new Date(quand.getTime()) });
      return Promise.resolve(true);
    },

    revoquerLaChaine(grantId: string, quand: Date): Promise<number> {
      let revoques = 0;
      for (const [jti, ligne] of parJti) {
        if (ligne.grantId !== grantId || ligne.revokedAt !== null) continue;
        parJti.set(jti, { ...ligne, revokedAt: new Date(quand.getTime()) });
        revoques += 1;
      }
      return Promise.resolve(revoques);
    },

    marquerUsage(jti: string, quand: Date): Promise<void> {
      const ligne = parJti.get(jti);
      if (ligne !== undefined) {
        parJti.set(jti, { ...ligne, lastUsedAt: new Date(quand.getTime()) });
      }
      return Promise.resolve();
    },

    listerLaChaine(grantId: string): Promise<readonly LigneOpsToken[]> {
      const lignes: LigneOpsToken[] = [];
      for (const ligne of parJti.values()) {
        if (ligne.grantId === grantId) lignes.push(copie(ligne));
      }
      return Promise.resolve(lignes);
    },
  };
}

/**
 * LE MAGASIN DES DEMANDES D'AUTORISATION EN VOL.
 *
 * ⚠️ **`consommer()` EST ATOMIQUE PAR CONSTRUCTION ICI** — un seul fil, un
 *    `delete` dans le même tour de boucle que le `get`. Ce n'est PAS gratuit
 *    dans une implantation en base : elle devra faire un `DELETE … RETURNING`,
 *    et non un `SELECT` suivi d'un `DELETE`. C'est écrit ici parce que c'est ici
 *    que la propriété est facile, donc ici qu'on oublierait qu'elle est due.
 */
export function creerDepotDeDemandesEnMemoire(): DepotDeDemandes {
  const demandes = new Map<string, DemandeDAutorisation>();

  return {
    // `async` pour la même raison que `inserer` : le port déclare une promesse,
    // donc l'échec doit être un REJET et non une levée synchrone.
    async deposer(demande: DemandeDAutorisation): Promise<void> {
      await Promise.resolve();
      if (demandes.has(demande.code)) throw new ErreurCodeDejaDepose();
      demandes.set(demande.code, {
        ...demande,
        scopesDemandes: [...demande.scopesDemandes],
        expiresAt: new Date(demande.expiresAt.getTime()),
      });
    },

    consommer(code: string): Promise<DemandeDAutorisation | null> {
      const demande = demandes.get(code);
      if (demande === undefined) return Promise.resolve(null);
      demandes.delete(code);
      return Promise.resolve(demande);
    },

    enVol(): Promise<number> {
      return Promise.resolve(demandes.size);
    },
  };
}
