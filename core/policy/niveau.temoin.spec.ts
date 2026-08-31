/**
 * TÉMOINS ADVERSAIRES — `core/policy/`, le calcul du niveau appliqué (§ 12).
 *
 * ═══ LA QUESTION QU'ON POSE ═══
 *
 * Deux fonctions de ce dossier dérivent LE MÊME FAIT — « à quel niveau ce
 * périmètre est-il tenu ? » :
 *
 *  · `niveauApplique(lignes, référenceOutil, t)` — pour un outil ;
 *  · `plancherDuScope(lignes, scope, t)` — pour un scope.
 *
 * `niveau.ts` écrit lui-même pourquoi cela compte : « Ce calcul et
 * `niveauApplique` dérivent LE MÊME FAIT. Tant que `plancherDuScope` se
 * contentait d'écarter ce qu'il ne savait pas lire, les deux se contredisaient
 * […] un plancher surévalué faisait passer un élargissement réel pour un
 * resserrage, donc par `resserrer` — le chemin libre, sans second facteur et
 * sans `ops:policy`. »
 *
 * ═══ CE QUE CES TÉMOINS ONT MESURÉ AU LOT 1 ═══
 *
 * Le fail-closed avait été posé pour la politique CORROMPUE. Les témoins
 * ci-dessous cherchaient si la contradiction subsistait sur une politique
 * parfaitement LISIBLE — c'est-à-dire là où aucune anomalie ne viendrait la
 * refermer. **Elle subsistait**, par une seconde voie : les deux fonctions ne
 * découpaient pas un scope au même endroit. `niveauApplique` répondait par
 * APPARTENANCE aux scopes fabriqués par `scopesCouvrants()` — donc sans jamais
 * découper — pendant que `scopeDomine()` découpait sur le DERNIER point. Le
 * même outil `zoho.mail.send` recevait `libre` ou `brouillon` selon la fonction
 * interrogée.
 *
 * ═══ CE QUI A ÉTÉ FAIT AU LOT 1b, ET CE QUE CE FICHIER PROUVE MAINTENANT ═══
 *
 * ⚖️ Une seule dérivation : `scopeCouvre()` passe par `analyserScope()` /
 *    `scopeDomine()`. Et une seule lecture d'un scope : le PREMIER point sépare
 *    l'adaptateur de l'outil, donc `adapterId` ne porte AUCUN point — règle
 *    revalidée à l'enregistrement (`id_innommable_par_un_scope`).
 *
 * ⚠️ AUCUN TÉMOIN N'A ÉTÉ RETIRÉ. Les trois qui portaient « 🔴 DÉFAUT
 *    CONSTATÉ » rejouent la même politique, le même outil, le même instant ;
 *    seules leurs ATTENTES ont changé, et chacun montre désormais ce qui
 *    referme l'écart — la lecture unique, ou l'anomalie levée. Un témoin
 *    supprimé aurait laissé le défaut libre de revenir sans un mot.
 */

import { describe, expect, it } from "vitest";

import { classerChangement } from "./desserrage.js";
import { anomaliesSemantiques, anomaliesStructurelles, type LignePolitique } from "./ligne.js";
import { niveauApplique, plancherDuScope, NIVEAU_DE_REPLI } from "./niveau.js";
import {
  analyserReference,
  analyserScope,
  referenceDepuisNom,
  scopeCouvre,
  scopeDomine,
} from "./scope.js";

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
    const resultat = niveauApplique([], referenceDepuisNom("zoho", "mail.send"), MAINTENANT);

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

    const resultat = niveauApplique(lignes, referenceDepuisNom("zoho", "mail.send"), MAINTENANT);

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
    const resultat = niveauApplique(lignes, referenceDepuisNom("zoho", "mail.send"), MAINTENANT);

    console.log(
      `[témoin § 12 · spécificité] ${String(resultat.mesures)} ligne(s), ` +
        `${String(resultat.retenues.length)} retenue(s), niveau « ${resultat.niveau} »`,
    );

    expect(resultat.niveau).toBe("brouillon");
    expect(resultat.retenues).toHaveLength(2);
  });

  it(
    "✅ DÉFAUT REFERMÉ — `niveauApplique` et `plancherDuScope` dérivent le même fait " +
      "et rendent LA MÊME réponse, parce qu'un scope n'a plus qu'une lecture",
    () => {
      // ═══ LE TÉMOIN DU LOT 1, REJOUÉ ═══
      //
      // Une seule ligne, en vigueur, portant `libre` sur le périmètre du
      // courrier. Ce qui a changé n'est PAS la politique : c'est que le scope
      // qui l'exprimait — `zoho.mail.*` — n'était pas un scope. Il supposait un
      // identifiant d'adaptateur à points, c'est-à-dire la lecture même qui
      // faisait diverger les deux fonctions.
      expect(analyserScope("zoho.mail.*").valide).toBe(false);

      // Le périmètre s'écrit donc du seul nom que la grammaire admette :
      // l'adaptateur `zoho`.
      const lignes = [
        ligne({ id: "l1", level: "libre", scope: "zoho.*", expiresAt: DANS_SIX_HEURES }),
      ];

      // La politique est LISIBLE — aucune anomalie ne viendra refermer l'écart,
      // et c'est bien là que le lot 1 avait trouvé la contradiction.
      expect(analyserScope("zoho.*").valide).toBe(true);
      expect(anomaliesStructurelles(lignes[0]!)).toHaveLength(0);
      expect(anomaliesSemantiques(lignes[0]!)).toHaveLength(0);

      // ═══ LA SECONDE LECTURE N'EST PLUS DÉFENDABLE ═══
      //
      // « adapterId long » était l'autre découpe de `zoho.mail.send`. Rien
      // n'empêche un appelant de fabriquer encore cette référence — mais
      // `analyserReference` la refuse, et `niveauApplique` replie sur le niveau
      // le plus strict EN LE DISANT, au lieu de calculer sur un nom à deux
      // lectures.
      const commeAdaptateurLong = referenceDepuisNom("zoho.mail", "zoho.mail.send");
      const commeAdaptateurCourt = referenceDepuisNom("zoho", "zoho.mail.send");
      expect(commeAdaptateurLong).toEqual({ adapterId: "zoho.mail", tool: "send" });
      expect(commeAdaptateurCourt).toEqual({ adapterId: "zoho", tool: "mail.send" });
      expect(analyserReference(commeAdaptateurLong).valide).toBe(false);
      expect(analyserReference(commeAdaptateurCourt).valide).toBe(true);

      const parOutilLong = niveauApplique(lignes, commeAdaptateurLong, MAINTENANT);
      const parOutilCourt = niveauApplique(lignes, commeAdaptateurCourt, MAINTENANT);
      const parScope = plancherDuScope(lignes, "zoho.mail.send", MAINTENANT);

      console.log(
        "[témoin § 12 · contradiction refermée] 1 ligne lisible, 3 dérivations du MÊME outil " +
          `« zoho.mail.send » : par outil (adapterId long, HORS GRAMMAIRE) ` +
          `« ${parOutilLong.niveau} » (raison ${parOutilLong.raison}, ` +
          `${String(parOutilLong.anomalies.length)} anomalie(s)), ` +
          `par outil (adapterId court) « ${parOutilCourt.niveau} », ` +
          `par scope « ${parScope.niveau} »`,
      );

      // Les DEUX dérivations légitimes concordent.
      expect(parOutilCourt.niveau).toBe("libre");
      expect(parScope.niveau).toBe("libre");

      // Et la troisième lecture — celle qui n'en est plus une — ne rend pas un
      // niveau divergent EN SILENCE : elle replie sur le plus strict et NOMME
      // sa raison. C'est la différence entre un désaccord et un refus.
      expect(parOutilLong.niveau).toBe(NIVEAU_DE_REPLI);
      expect(parOutilLong.raison).toBe("référence-illisible");
      expect(parOutilLong.anomalies).toHaveLength(1);

      // La contradiction d'origine était exactement celle-ci : `scopeDomine`
      // reconnaissait une couverture que `scopeCouvre` ne reconnaissait pas.
      // Les deux répondent maintenant par le MÊME code.
      expect(scopeDomine("zoho.*", "zoho.mail.send")).toBe(true);
      expect(scopeCouvre("zoho.*", commeAdaptateurCourt)).toBe(true);
    },
  );

  it("✅ DÉFAUT REFERMÉ — un RESSERRAGE en vigueur MORD, au lieu d'être silencieusement sans effet", () => {
    // Le cas dans le sens qui compte, rejoué : quelqu'un pose un plancher
    // `brouillon` sur le courrier, par-dessus un `libre` plus large. Au lot 1,
    // la ligne était valide, en vigueur, affichée comme courante — et elle ne
    // s'appliquait à RIEN.
    const lignes = [
      ligne({ id: "ouvert", level: "libre", scope: "zoho.*", expiresAt: DANS_SIX_HEURES }),
      ligne({ id: "resserrage", level: "brouillon", scope: "zoho.mail.send" }),
    ];

    const reference = referenceDepuisNom("zoho", "zoho.mail.send");
    const resultat = niveauApplique(lignes, reference, MAINTENANT);

    console.log(
      `[témoin § 12 · resserrage] ${String(resultat.mesures)} ligne(s) mesurée(s), ` +
        `${String(resultat.enVigueur)} en vigueur, ${String(resultat.retenues.length)} retenue(s) ` +
        `(${resultat.retenues.join(", ")}), niveau « ${resultat.niveau} », ` +
        `${String(resultat.anomalies.length)} anomalie(s)`,
    );

    // Les DEUX lignes couvrent l'outil, et le plus strict gagne.
    expect(resultat.retenues.slice().sort()).toEqual(["ouvert", "resserrage"]);
    expect(resultat.niveau, "le plancher posé doit mordre").toBe("brouillon");
    expect(resultat.anomalies).toHaveLength(0);

    // ⚠️ TÉMOIN DE CONTRASTE : la forme qui NE MORDAIT PAS au lot 1 — un scope
    //    à identifiant d'adaptateur pointé — n'est plus admise. On ne peut donc
    //    plus la poser en croyant fermer quelque chose : la ligne devient
    //    illisible, et le calcul replie sur le plus strict au lieu de laisser
    //    le `libre` s'appliquer.
    const avecScopeHorsGrammaire = [
      ligne({ id: "ouvert", level: "libre", scope: "zoho.*", expiresAt: DANS_SIX_HEURES }),
      ligne({ id: "resserrage", level: "brouillon", scope: "zoho.mail.*" }),
    ];
    const replie = niveauApplique(avecScopeHorsGrammaire, reference, MAINTENANT);

    console.log(
      `[témoin § 12 · contraste] scope hors grammaire → raison « ${replie.raison} », ` +
        `niveau « ${replie.niveau} », ${String(replie.anomalies.length)} anomalie(s)`,
    );

    expect(replie.raison).toBe("politique-illisible");
    expect(replie.niveau).toBe(NIVEAU_DE_REPLI);
    expect(replie.anomalies.length).toBeGreaterThan(0);
  });

  it("✅ DÉFAUT REFERMÉ — le TRI resserrage / desserrage lit le MÊME plancher que l'appel", () => {
    // Aucune ligne : le plancher réel de l'outil `zoho.mail.send` est le repli
    // `brouillon`.
    const aucune: readonly LignePolitique[] = [];
    expect(
      niveauApplique(aucune, referenceDepuisNom("zoho", "zoho.mail.send"), MAINTENANT).niveau,
    ).toBe("brouillon");

    // Une ligne `libre` sur l'adaptateur est posée.
    const lignes = [
      ligne({ id: "l1", level: "libre", scope: "zoho.*", expiresAt: DANS_SIX_HEURES }),
    ];

    // On demande ensuite `libre` sur l'outil.
    const classement = classerChangement(lignes, "zoho.mail.send", "libre", MAINTENANT);

    console.log(
      `[témoin § 12 · tri] ${String(classement.mesures)} ligne(s) mesurée(s), ` +
        `plancher lu « ${classement.niveauAvant} », demande « ${classement.niveauDemande} », ` +
        `genre « ${classement.genre} »`,
    );

    const avant = niveauApplique(lignes, referenceDepuisNom("zoho", "zoho.mail.send"), MAINTENANT);
    const apres = niveauApplique(
      [
        ...lignes,
        ligne({ id: "l2", level: "libre", scope: "zoho.mail.send", expiresAt: DANS_SIX_HEURES }),
      ],
      referenceDepuisNom("zoho", "zoho.mail.send"),
      MAINTENANT,
    );

    console.log(
      `[témoin § 12 · tri] niveau APPLIQUÉ à l'outil : « ${avant.niveau} » → « ${apres.niveau} », ` +
        `plancher classé « ${classement.genre} »`,
    );

    // ═══ LE POINT QUI COMPTE ═══
    //
    // Au lot 1, le plancher lu valait `libre` pendant que le niveau APPLIQUÉ à
    // l'outil valait `brouillon` : un élargissement réel passait par le chemin
    // « resserrage », c'est-à-dire sans second facteur et sans `ops:policy`.
    // Les deux calculs lisent désormais le MÊME plancher — c'est cette égalité,
    // et elle seule, qui rend le tri honnête.
    expect(avant.niveau).toBe(classement.niveauAvant);

    // Conséquence directe : poser `libre` là où `libre` s'applique déjà ne
    // change RIEN au niveau appliqué. Le chemin libre n'élargit rien.
    expect(apres.niveau, "aucun élargissement ne passe par le chemin libre").toBe(avant.niveau);
  });
});
