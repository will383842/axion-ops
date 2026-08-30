/**
 * TÉMOINS ADVERSAIRES — `core/policy/`, le calcul du niveau appliqué (§ 12).
 *
 * ═══ LA QUESTION QU'ON POSE ═══
 *
 * Deux fonctions de ce dossier dérivent LE MÊME FAIT — « à quel niveau ce
 * périmètre est-il tenu ? » :
 *
 *  · `niveauApplique(lignes, référenceOutil, t)` — pour un outil, par
 *    APPARTENANCE aux trois scopes que `scopesCouvrants()` fabrique depuis une
 *    `ReferenceOutil` ;
 *  · `plancherDuScope(lignes, scope, t)` — pour un scope, par ANALYSE de la
 *    grammaire (`scopeDomine`), qui découpe le scope sur son dernier point.
 *
 * `niveau.ts` écrit lui-même pourquoi cela compte : « Ce calcul et
 * `niveauApplique` dérivent LE MÊME FAIT. Tant que `plancherDuScope` se
 * contentait d'écarter ce qu'il ne savait pas lire, les deux se contredisaient
 * […] un plancher surévalué faisait passer un élargissement réel pour un
 * resserrage, donc par `resserrer` — le chemin libre, sans second facteur et
 * sans `ops:policy`. »
 *
 * Le fail-closed a été posé pour la politique CORROMPUE. Les témoins ci-dessous
 * cherchent si la contradiction subsiste sur une politique parfaitement
 * LISIBLE — c'est-à-dire là où aucune anomalie ne viendra la refermer.
 */

import { describe, expect, it } from "vitest";

import { classerChangement } from "./desserrage.js";
import { anomaliesSemantiques, anomaliesStructurelles, type LignePolitique } from "./ligne.js";
import { niveauApplique, plancherDuScope, NIVEAU_DE_REPLI } from "./niveau.js";
import { analyserScope, referenceDepuisNom, scopeCouvre, scopeDomine } from "./scope.js";

const MAINTENANT = new Date("2026-08-30T12:00:00.000Z");
const DANS_SIX_HEURES = new Date("2026-08-30T18:00:00.000Z");

function ligne(
  surcharge: Partial<LignePolitique> & Pick<LignePolitique, "id" | "level" | "scope">,
): LignePolitique {
  return {
    channel: "console",
    expiresAt: null,
    supersededAt: null,
    setBy: "will",
    setAt: MAINTENANT,
    reason: "témoin",
    ...surcharge,
  };
}

describe("TÉMOIN — § 12 : le calcul du niveau sait-il rougir, et dit-il la même chose deux fois ?", () => {
  it("fail-closed : sans aucune ligne, le niveau est le plus strict ET le compte est ANNONCÉ", () => {
    const resultat = niveauApplique([], referenceDepuisNom("zoho.mail", "send"), MAINTENANT);

    console.log(
      `[témoin § 12 · vide] ${String(resultat.mesures)} ligne(s) mesurée(s), ` +
        `${String(resultat.enVigueur)} en vigueur, niveau « ${resultat.niveau} », ` +
        `raison « ${resultat.raison} »`,
    );

    expect(resultat.niveau).toBe(NIVEAU_DE_REPLI);
    // C'est `raison` qui distingue « aucune ligne » d'une politique corrompue :
    // sans elle, un « brouillon » rassurant couvrirait les deux.
    expect(resultat.raison).toBe("aucune-ligne-couvrante");
    expect(resultat.mesures).toBe(0);
  });

  it("fail-closed : UNE seule ligne illisible fait replier le calcul ENTIER, elle n'est pas écartée", () => {
    const lignes = [
      ligne({ id: "large", level: "libre", scope: "*", expiresAt: DANS_SIX_HEURES }),
      // Une date d'expiration illisible : la ligne est INCLASSABLE.
      ligne({
        id: "corrompue",
        level: "brouillon",
        scope: "zoho.mail.send",
        expiresAt: new Date(NaN),
      }),
    ];

    const resultat = niveauApplique(lignes, referenceDepuisNom("zoho.mail", "send"), MAINTENANT);

    console.log(
      `[témoin § 12 · corrompue] ${String(resultat.mesures)} ligne(s) mesurée(s), ` +
        `${String(resultat.anomalies.length)} anomalie(s), niveau « ${resultat.niveau} »`,
    );

    expect(resultat.niveau).toBe(NIVEAU_DE_REPLI);
    expect(resultat.raison).toBe("politique-illisible");
    expect(resultat.mesures).toBe(2);
    // Écarter la ligne corrompue aurait laissé le `libre` sur `*` s'appliquer :
    // la corruption aurait ÉLARGI la surface.
    expect(resultat.anomalies.length).toBeGreaterThan(0);
  });

  it("aucune règle du PLUS SPÉCIFIQUE : un `libre` étroit ne bat pas un `brouillon` large", () => {
    const lignes = [
      ligne({ id: "large", level: "brouillon", scope: "*" }),
      ligne({ id: "etroit", level: "libre", scope: "zoho.mail.send", expiresAt: DANS_SIX_HEURES }),
    ];
    const resultat = niveauApplique(lignes, referenceDepuisNom("zoho.mail", "send"), MAINTENANT);

    console.log(
      `[témoin § 12 · spécificité] ${String(resultat.mesures)} ligne(s), ` +
        `${String(resultat.retenues.length)} retenue(s), niveau « ${resultat.niveau} »`,
    );

    expect(resultat.niveau).toBe("brouillon");
    expect(resultat.retenues).toHaveLength(2);
  });

  it(
    "🔴 DÉFAUT CONSTATÉ — `niveauApplique` et `plancherDuScope` DÉRIVENT LE MÊME FAIT " +
      "et se contredisent sur une politique parfaitement lisible",
    () => {
      // Une seule ligne, grammaticalement valide, sémantiquement valide, en
      // vigueur : `zoho.mail.*` à `libre` avec une durée.
      const lignes = [
        ligne({ id: "l1", level: "libre", scope: "zoho.mail.*", expiresAt: DANS_SIX_HEURES }),
      ];

      // La politique est LISIBLE — aucune anomalie ne viendra refermer l'écart.
      expect(analyserScope("zoho.mail.*").valide).toBe(true);
      expect(anomaliesStructurelles(lignes[0]!)).toHaveLength(0);
      expect(anomaliesSemantiques(lignes[0]!)).toHaveLength(0);

      // Le § 12 ne dit PAS si `ops_tool.name` porte déjà le préfixe de son
      // adaptateur, et `scope.ts` le signale en écart. Les deux lectures d'un
      // même outil `zoho.mail.send` sont donc l'une et l'autre défendables :
      const commeAdaptateurLong = referenceDepuisNom("zoho.mail", "zoho.mail.send");
      const commeAdaptateurCourt = referenceDepuisNom("zoho", "zoho.mail.send");
      expect(commeAdaptateurLong).toEqual({ adapterId: "zoho.mail", tool: "send" });
      expect(commeAdaptateurCourt).toEqual({ adapterId: "zoho", tool: "mail.send" });

      const parOutilLong = niveauApplique(lignes, commeAdaptateurLong, MAINTENANT);
      const parOutilCourt = niveauApplique(lignes, commeAdaptateurCourt, MAINTENANT);
      const parScope = plancherDuScope(lignes, "zoho.mail.send", MAINTENANT);

      console.log(
        "[témoin § 12 · contradiction] 1 ligne lisible, 3 dérivations du MÊME outil " +
          `« zoho.mail.send » : par outil (adapterId long) « ${parOutilLong.niveau} », ` +
          `par outil (adapterId court) « ${parOutilCourt.niveau} », ` +
          `par scope « ${parScope.niveau} »`,
      );

      // Deux dérivations d'un même fait, deux réponses.
      expect(parOutilLong.niveau).toBe("libre");
      expect(parOutilCourt.niveau).toBe("brouillon");
      expect(parScope.niveau).toBe("libre");

      // Et la contradiction est bien celle-là : `scopeDomine` reconnaît la
      // couverture que `scopeCouvre` ne reconnaît pas.
      expect(scopeDomine("zoho.mail.*", "zoho.mail.send")).toBe(true);
      expect(scopeCouvre("zoho.mail.*", commeAdaptateurCourt)).toBe(false);

      // AUCUNE anomalie n'est levée : rien, nulle part, ne dit que la ligne
      // « zoho.mail.* » ne couvre pas l'outil qu'elle vise.
      expect(parOutilCourt.anomalies).toHaveLength(0);
      expect(parScope.anomalies).toHaveLength(0);
    },
  );

  it(
    "🔴 DÉFAUT CONSTATÉ — un RESSERRAGE en vigueur est silencieusement sans effet, " +
      "et l'outil reste `libre`",
    () => {
      // Le cas dans le sens qui compte : quelqu'un pose un plancher
      // `brouillon` sur `zoho.mail.*` pour fermer la messagerie, par-dessus un
      // `libre` sur `zoho.*`. La ligne est valide, en vigueur, et l'écran la
      // montrera comme courante.
      const lignes = [
        ligne({ id: "ouvert", level: "libre", scope: "zoho.*", expiresAt: DANS_SIX_HEURES }),
        ligne({ id: "resserrage", level: "brouillon", scope: "zoho.mail.*" }),
      ];

      const reference = referenceDepuisNom("zoho", "zoho.mail.send");
      const resultat = niveauApplique(lignes, reference, MAINTENANT);

      console.log(
        `[témoin § 12 · resserrage muet] ${String(resultat.mesures)} ligne(s) mesurée(s), ` +
          `${String(resultat.enVigueur)} en vigueur, ${String(resultat.retenues.length)} retenue(s) ` +
          `(${resultat.retenues.join(", ")}), niveau « ${resultat.niveau} », ` +
          `${String(resultat.anomalies.length)} anomalie(s)`,
      );

      // Le resserrage n'est PAS retenu — il ne figure pas dans `retenues`.
      expect(resultat.retenues).toEqual(["ouvert"]);
      expect(resultat.niveau, "DÉFAUT : le plancher posé ne mord pas").toBe("libre");
      // Et rien ne le dit. Pas une anomalie, pas un compte à zéro : la garde
      // est verte parce qu'elle a regardé, mais elle a regardé à côté.
      expect(resultat.anomalies).toHaveLength(0);
    },
  );

  it(
    "🔴 DÉFAUT CONSTATÉ — la contradiction atteint le TRI resserrage / desserrage, " +
      "donc le chemin sans second facteur",
    () => {
      // Aucune ligne : le plancher réel de l'outil `zoho.mail.send` est le
      // repli `brouillon`, quelle que soit la lecture de son nom.
      const aucune: readonly LignePolitique[] = [];
      expect(
        niveauApplique(aucune, referenceDepuisNom("zoho", "zoho.mail.send"), MAINTENANT).niveau,
      ).toBe("brouillon");

      // Une ligne `libre` sur `zoho.mail.*` est posée.
      const lignes = [
        ligne({ id: "l1", level: "libre", scope: "zoho.mail.*", expiresAt: DANS_SIX_HEURES }),
      ];

      // On demande ensuite `libre` sur `zoho.mail.send`.
      const classement = classerChangement(lignes, "zoho.mail.send", "libre", MAINTENANT);

      console.log(
        `[témoin § 12 · tri] ${String(classement.mesures)} ligne(s) mesurée(s), ` +
          `plancher lu « ${classement.niveauAvant} », demande « ${classement.niveauDemande} », ` +
          `genre « ${classement.genre} »`,
      );

      // Le plancher lu par `plancherDuScope` vaut `libre` — donc la demande est
      // classée RESSERRAGE, c'est-à-dire le chemin LIBRE de `resserrer()` :
      // aucun second facteur, aucun `ops:policy`.
      expect(classement.niveauAvant).toBe("libre");
      expect(classement.genre).toBe("resserrage");

      // Or pour l'outil lu avec l'adapterId court, le niveau APPLIQUÉ était
      // `brouillon` et devient `libre` : un ÉLARGISSEMENT réel est passé par le
      // chemin qui ne demande rien.
      const apres = [
        ...lignes,
        ligne({ id: "l2", level: "libre", scope: "zoho.mail.send", expiresAt: DANS_SIX_HEURES }),
      ];
      const avant = niveauApplique(
        lignes,
        referenceDepuisNom("zoho", "zoho.mail.send"),
        MAINTENANT,
      );
      const apresNiveau = niveauApplique(
        apres,
        referenceDepuisNom("zoho", "zoho.mail.send"),
        MAINTENANT,
      );

      console.log(
        `[témoin § 12 · tri] niveau APPLIQUÉ à l'outil : « ${avant.niveau} » → « ${apresNiveau.niveau} », ` +
          `classé « ${classement.genre} »`,
      );

      expect(avant.niveau).toBe("brouillon");
      expect(apresNiveau.niveau, "DÉFAUT : un élargissement classé resserrage").toBe("libre");
    },
  );
});
