import { describe, expect, it } from "vitest";

import type { EtatIndexProvenance } from "../chaine/etape-11-provenance.js";
import {
  REPLI_MAGASIN_INJOIGNABLE,
  demarrerLeSocleMonoInstance,
  relireLaSanteMonoInstance,
} from "./demarrage.js";
import { MagasinDeVerrousEnMemoire, VerrouEnMemoire } from "./memoire.js";
import type { EtatDuVerrou, ResultatAcquisition, VerrouDInstance } from "./verrou.js";
import {
  ETATS_DU_VERROU,
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
  frapperInstance,
} from "./verrou.js";

/**
 * GARDES G1 ET G3 DE L'ADR 0018 — **LA COUTURE, ÉPROUVÉE DE BOUT EN BOUT.**
 *
 * ═══ CE QUE CES GARDES MESURENT, ET QUE `verrou.spec.ts` NE MESURE PAS ═══
 *
 * `verrou.spec.ts` éprouve l'arbitre : il couvre les quatre états, il dérive
 * `demarre`, ses messages nomment un geste. Tout cela peut être juste pendant
 * que **rien, dans le dépôt, ne fait qu'un second socle refuse de démarrer** —
 * c'est le mode de défaillance que l'épreuve du lot 1c a mesuré sur quatre ADR
 * sur cinq : la fonction existe, elle est exportée, elle est gardée, et aucun
 * module ne l'appelle.
 *
 * Ces gardes-ci passent donc par `demarrerLeSocleMonoInstance` et
 * `relireLaSanteMonoInstance` — les deux seules fonctions que la racine de
 * composition appellera. Si la couture était défaite, l'arbitre resterait vert
 * et CELLES-CI rougiraient.
 *
 * ⚠️ G1 ET G3 SONT DEUX GARDES, PAS UNE. L'ADR 0018 y insiste : G1 couvre le
 *    démarrage, G3 la vie du processus — et c'est G3 qui couvre le cas RÉEL, la
 *    connexion qui tombe, celui que personne ne provoque volontairement.
 */

/** Un état de provenance figé (§ 20). Les trois champs que la santé publie. */
function provenanceTemoin(surcharge: Partial<EtatIndexProvenance> = {}): EtatIndexProvenance {
  return {
    extraits: 7,
    sessions: 2,
    empreintesRefusees: 0,
    sessionsEvincees: 0,
    indetermine: false,
    plafondExtraits: 100,
    plafondSessions: 10,
    ttlMs: 60_000,
    ...surcharge,
  };
}

/** Un verrou qui LÈVE au lieu de répondre — l'écart au contrat du port. */
class VerrouQuiLeve implements VerrouDInstance {
  acquisitions = 0;
  relectures = 0;

  acquerir(): Promise<ResultatAcquisition> {
    this.acquisitions += 1;
    return Promise.reject(new Error("connexion au magasin de verrous rompue"));
  }

  relire(): Promise<EtatDuVerrou> {
    this.relectures += 1;
    return Promise.reject(new Error("connexion au magasin de verrous rompue"));
  }

  liberer(): Promise<void> {
    return Promise.resolve();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — AU DÉMARRAGE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0018 · G1 — un second socle ne DÉMARRE pas", () => {
  it("deux démarrages sur le même magasin : UN SEUL est autorisé", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const socles = [
      new VerrouEnMemoire(magasin, frapperInstance()),
      new VerrouEnMemoire(magasin, frapperInstance()),
    ];

    const demarrages = [];
    for (const verrou of socles) demarrages.push(await demarrerLeSocleMonoInstance(verrou));
    const autorises = demarrages.filter((demarrage) => demarrage.decision.demarre);

    console.info(
      `[garde G1 · couture] ${String(socles.length)} socle(s) confronté(s), ` +
        `${String(magasin.tentatives)} tentative(s) d'acquisition, ` +
        `${String(magasin.acquisitionsAccordees)} accordée(s), ` +
        `${String(autorises.length)} DÉMARRAGE(S) AUTORISÉ(S) — ` +
        `états : ${demarrages.map((demarrage) => demarrage.decision.etat).join(", ")}`,
    );

    // ⚠️ LES TROIS COMPTES NE DISENT PAS LA MÊME CHOSE, et c'est pour cela
    //    qu'ils sont annoncés tous les trois. « accordées = 1 » dit que le
    //    verrou a mordu ; « autorisés = 1 » dit que le socle en a TENU COMPTE.
    //    C'est la seconde phrase qui est la couture, et elle est la seule que le
    //    lot 1c aurait pu perdre sans que rien ne rougisse.
    expect(magasin.tentatives).toBe(2);
    expect(magasin.acquisitionsAccordees).toBe(1);
    expect(autorises.length).toBe(1);

    expect(demarrages[0]?.decision.demarre).toBe(true);
    expect(demarrages[1]?.decision.demarre).toBe(false);
    expect(demarrages[1]?.decision.etat).toBe("refusé");
    // Le message du refus nomme le geste et la borne du § 20.
    expect(demarrages[1]?.decision.message).toContain("§ 20");
    // Le socle refusé ne publie AUCUNE identité : sans cela, l'observateur de
    // `ops/mono-instance.ts` compterait une instance qui ne sert pas.
    expect(demarrages[1]?.instance).toBeNull();
    expect(demarrages[0]?.instance?.instanceId).toBe(socles[0]?.instance.instanceId);
  });

  it("le socle refusé ne prend le verrou à personne : le premier le tient toujours", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const premier = new VerrouEnMemoire(magasin, frapperInstance());
    const second = new VerrouEnMemoire(magasin, frapperInstance());

    await demarrerLeSocleMonoInstance(premier);
    await demarrerLeSocleMonoInstance(second);

    console.info(
      `[garde G1 · non-vol] détenteur après le second démarrage : ` +
        `${magasin.detenteur()?.instanceId === premier.instance.instanceId ? "le premier" : "AUTRE"}`,
    );

    expect(magasin.detenteur()?.instanceId).toBe(premier.instance.instanceId);
  });

  it("FAIL-CLOSED — un port qui LÈVE ne fait pas démarrer le socle", async () => {
    const verrou = new VerrouQuiLeve();

    const demarrage = await demarrerLeSocleMonoInstance(verrou);

    console.info(
      `[garde fail-closed] ${String(verrou.acquisitions)} acquisition(s) tentée(s), ` +
        `port levé : ${String(demarrage.portALeve)} — état retenu « ${demarrage.decision.etat} », ` +
        `démarre : ${String(demarrage.decision.demarre)}`,
    );

    expect(verrou.acquisitions).toBe(1);
    expect(demarrage.portALeve).toBe(true);
    expect(demarrage.decision.demarre).toBe(false);
    // ⚠️ `indisponible`, PAS `refusé`. Les deux refusent, donc la sûreté est la
    //    même ; mais ils ne se réparent pas du même geste. Annoncer « une autre
    //    instance tient le verrou » quand on ne sait rien enverrait arrêter un
    //    socle qui n'existe pas.
    expect(demarrage.decision.etat).toBe("indisponible");
    expect(demarrage.resultat).toBe(REPLI_MAGASIN_INJOIGNABLE);
    // La cause n'est PAS relayée : elle peut porter une chaîne de connexion, et
    // ce dépôt est public (§ 29).
    expect(demarrage.resultat.message).not.toContain("connexion au magasin de verrous rompue");
  });

  it("SAIT DIRE OUI — un socle SEUL démarre, et publie son identité", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());

    const demarrage = await demarrerLeSocleMonoInstance(verrou);

    console.info(
      `[garde G1 · plancher] démarre : ${String(demarrage.decision.demarre)}, ` +
        `statut de démarrage : ${String(demarrage.decision.statutHealthcheck)}`,
    );

    // Sans ce plancher, les gardes précédentes seraient vertes pour une couture
    // qui refuserait TOUT le monde — un socle qui ne démarre jamais.
    expect(demarrage.decision.demarre).toBe(true);
    expect(demarrage.decision.statutHealthcheck).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
    expect(demarrage.portALeve).toBe(false);
    expect(demarrage.instance).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — EN CONTINU
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0018 · G3 — un verrou perdu fait rougir le healthcheck", () => {
  it("RELIT à chaque appel, et passe à 503 dès que le verrou n'est plus tenu", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());
    const demarrage = await demarrerLeSocleMonoInstance(verrou);
    const instance = demarrage.instance;
    expect(instance).not.toBeNull();
    if (instance === null) return;

    const avant = await relireLaSanteMonoInstance(verrou, instance, () => provenanceTemoin());
    // Le cas RÉEL : la connexion est tombée, le verrou a pu être repris.
    magasin.arracherLeVerrou();
    const apres = await relireLaSanteMonoInstance(verrou, instance, () => provenanceTemoin());

    console.info(
      `[garde G3 · couture] ${String(magasin.relectures)} appel(s) de « relire » — ` +
        `statuts rendus : ${String(avant.statut)} puis ${String(apres.statut)} · ` +
        `verrous vus : « ${avant.verrou} » puis « ${apres.verrou} » · ` +
        `${String(apres.statut === STATUT_HEALTHCHECK_VERROU_ABSENT ? 1 : 0)} ligne(s) à 503`,
    );

    // ⚠️ LE COMPTE DE RELECTURES EST LA MESURE, ET NON LE STATUT. Un healthcheck
    //    qui SE SOUVIENDRAIT de l'acquisition rendrait 200 sans jamais relire :
    //    le compte le dit, la couleur ne le dirait pas.
    expect(magasin.relectures).toBe(2);
    expect(avant.statut).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
    expect(avant.verrou).toBe("tenu");
    expect(apres.statut).toBe(STATUT_HEALTHCHECK_VERROU_ABSENT);
    expect(apres.verrou).toBe("perdu");
    // L'identité publiée ne change PAS : c'est la même exécution.
    expect(apres.instance.instanceId).toBe(instance.instanceId);
  });

  it("publie les TROIS comptes du § 20, dérivés de l'index de provenance", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());
    const instance = frapperInstance();
    await verrou.acquerir();

    const sature = await relireLaSanteMonoInstance(verrou, instance, () =>
      provenanceTemoin({ extraits: 0, sessions: 0, indetermine: true, sessionsEvincees: 3 }),
    );

    console.info(
      `[garde § 20] santé publiée — ${String(sature.provenance.extraits)} extrait(s) sur ` +
        `${String(sature.provenance.sessions)} session(s), ` +
        `indéterminé : ${String(sature.provenance.indetermine)}`,
    );

    // § 20 — « le nombre d'extraits indexés, SIGNAL POSITIF, pour qu'une garde à
    // zéro élément se voie ». Un zéro se publie, il ne se tait pas.
    expect(sature.provenance.extraits).toBe(0);
    expect(sature.provenance.sessions).toBe(0);
    // La dégradation est publiée : sans elle, une garde d'exfiltration qui a dû
    // renoncer ressemblerait à une garde qui n'a rien trouvé.
    expect(sature.provenance.indetermine).toBe(true);
    // ⚠️ ET RIEN D'AUTRE N'EST PUBLIÉ. Le § 29 : ni `pid`, ni hôte, ni adresse.
    //    Les clés sont confrontées à la liste attendue, pas seulement comptées.
    expect(Object.keys(sature.provenance).sort()).toEqual(["extraits", "indetermine", "sessions"]);
    expect(Object.keys(sature).sort()).toEqual(["instance", "provenance", "statut", "verrou"]);
  });

  it("FAIL-CLOSED — une relecture qui LÈVE rend 503, jamais 200", async () => {
    const verrou = new VerrouQuiLeve();
    const instance = frapperInstance();

    const sante = await relireLaSanteMonoInstance(verrou, instance, () => provenanceTemoin());

    console.info(
      `[garde G3 · fail-closed] ${String(verrou.relectures)} relecture(s) tentée(s) — ` +
        `état retenu « ${sante.verrou} », statut ${String(sante.statut)}`,
    );

    expect(verrou.relectures).toBe(1);
    // Un 200 sans verrou tenu est le pire des cas : la garde du § 20 est
    // peut-être déjà en train de ne s'appliquer qu'un appel sur deux, et
    // l'exploitant ne verra rien.
    expect(sante.statut).toBe(STATUT_HEALTHCHECK_VERROU_ABSENT);
    expect(sante.verrou).toBe("indisponible");
  });

  it("les QUATRE états traversent la couture, et trois rendent 503", async () => {
    const statuts = new Map<EtatDuVerrou, number>();
    const instance = frapperInstance();

    for (const etat of ETATS_DU_VERROU) {
      // Un verrou fabriqué qui rend l'état demandé : c'est le seul moyen de
      // faire passer les QUATRE états par la couture, `refusé` compris — que le
      // double en mémoire ne rend jamais en relecture.
      const verrou: VerrouDInstance = {
        acquerir: () =>
          Promise.resolve({ etat, instance: null, detenteur: null, message: "fabriqué" }),
        relire: () => Promise.resolve(etat),
        liberer: () => Promise.resolve(),
      };
      const sante = await relireLaSanteMonoInstance(verrou, instance, () => provenanceTemoin());
      statuts.set(etat, sante.statut);
    }

    const rouges = [...statuts.values()].filter(
      (statut) => statut === STATUT_HEALTHCHECK_VERROU_ABSENT,
    ).length;

    console.info(
      `[garde G3 · couverture] ${String(statuts.size)} état(s) passé(s) par la couture — ` +
        [...statuts].map(([etat, statut]) => `${etat}=${String(statut)}`).join(", ") +
        ` · ${String(rouges)} à ${String(STATUT_HEALTHCHECK_VERROU_ABSENT)}`,
    );

    expect(statuts.size).toBe(ETATS_DU_VERROU.length);
    expect(rouges).toBe(3);
    expect(statuts.get("tenu")).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
  });
});
