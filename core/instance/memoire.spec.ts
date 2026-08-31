import { describe, expect, it } from "vitest";

import { MagasinDeVerrousEnMemoire, VerrouEnMemoire } from "./memoire.js";
import { DOMAINE_DU_VERROU, ETATS_DU_VERROU, frapperInstance } from "./verrou.js";
import type { EtatDuVerrou } from "./verrou.js";

/**
 * GARDES — **LE DOUBLE EN MÉMOIRE DU VERROU TIENT LE CONTRAT DU PORT.**
 *
 * ⚠️ POURQUOI CES GARDES-CI EXISTENT AVANT L'ADAPTATION POSTGRES. L'ADR 0018
 *    l'écrit : « `VerrouDInstance` doit pouvoir être tenu par un double en
 *    mémoire, sans quoi la garde ne serait éprouvable qu'avec une base — et une
 *    garde qu'on ne peut pas exécuter en intégration continue finit désactivée ».
 *    Le double est donc l'instrument, et il doit lui-même être éprouvé : un
 *    instrument faux rend vertes toutes les gardes qui s'en servent.
 *
 * ⚠️ CE QU'ELLES NE PROUVENT PAS, ET LA BORNE EST ÉCRITE ICI. L'exclusivité est
 *    tenue par le fait que tout vit dans un seul tas JavaScript — c'est-à-dire
 *    par la propriété même que le verrou existe pour ne PAS supposer. Deux
 *    conteneurs sur deux hôtes ne partagent aucun magasin. Ces gardes éprouvent
 *    la DÉCISION et le CÂBLAGE ; elles ne remplacent pas le verrou consultatif
 *    de session Postgres, qui reste à écrire.
 */

/** Deux socles, un seul magasin — la situation que l'ADR 0018 interdit de servir. */
function deuxSoclesSurUnMagasin(): {
  magasin: MagasinDeVerrousEnMemoire;
  premier: VerrouEnMemoire;
  second: VerrouEnMemoire;
} {
  const magasin = new MagasinDeVerrousEnMemoire();
  const instant = new Date(Date.UTC(2026, 7, 31, 9, 0, 0));
  return {
    magasin,
    premier: new VerrouEnMemoire(magasin, frapperInstance(instant)),
    second: new VerrouEnMemoire(magasin, frapperInstance(instant)),
  };
}

describe("ADR 0018 — le second socle se voit REFUSER le verrou", () => {
  it("accorde une fois sur deux acquisitions, et annonce ses comptes", async () => {
    const { magasin, premier, second } = deuxSoclesSurUnMagasin();

    const premiere = await premier.acquerir();
    const seconde = await second.acquerir();

    console.info(
      `[garde G1 · double] ${String(magasin.tentatives)} tentative(s) d'acquisition, ` +
        `${String(magasin.acquisitionsAccordees)} accordée(s) — ` +
        `états rendus : « ${premiere.etat} », « ${seconde.etat} »`,
    );

    // ⚠️ LE COMPTE DE TENTATIVES DISTINGUE « REFUSÉ » DE « PAS ESSAYÉ ». Une
    //    garde qui ne lirait que l'état rendu serait verte le jour où plus rien
    //    n'est tenté.
    expect(magasin.tentatives).toBe(2);
    expect(magasin.acquisitionsAccordees).toBe(1);
    expect(premiere.etat).toBe("tenu");
    expect(seconde.etat).toBe("refusé");
    expect(premiere.instance?.instanceId).toBe(premier.instance.instanceId);
    // Le refus ne rend AUCUNE instance : un socle qui publierait son identité
    // sans tenir le verrou ferait compter un chevauchement imaginaire à
    // `ops/mono-instance.ts`.
    expect(seconde.instance).toBeNull();
  });

  it("reste MUET sur le détenteur, comme un verrou consultatif Postgres", async () => {
    const { premier, second } = deuxSoclesSurUnMagasin();
    await premier.acquerir();
    const refus = await second.acquerir();

    console.info(
      `[garde détenteur] refus rendu — détenteur nommé : ${String(refus.detenteur !== null)} · ` +
        `longueur du message : ${String(refus.message.length)}`,
    );

    // ⚠️ UN DOUBLE PLUS CAPABLE QUE LA PRODUCTION EST UN PIÈGE. Un verrou
    //    consultatif Postgres ne nomme pas son détenteur : une garde écrite
    //    contre un double bavard exigerait un nom que l'adaptation ne pourra
    //    jamais rendre. Le défaut est donc le silence.
    expect(refus.detenteur).toBeNull();
    // Le message reste JUSTE : « une autre instance », jamais un nom inventé.
    expect(refus.message).toContain("autre instance");
  });

  it("nomme le détenteur SEULEMENT quand une garde le demande", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const tenant = frapperInstance();
    await new VerrouEnMemoire(magasin, tenant).acquerir();
    const bavard = new VerrouEnMemoire(magasin, frapperInstance(), { nommeLeDetenteur: true });

    const refus = await bavard.acquerir();

    console.info(
      `[garde détenteur · bavard] détenteur nommé : ${String(refus.detenteur !== null)}`,
    );

    // Le réglage existe, et il n'est pas le défaut. Sans cette garde, on ne
    // saurait pas si le silence précédent vient du réglage ou d'un magasin qui
    // ne sait rien retenir.
    expect(refus.detenteur?.instanceId).toBe(tenant.instanceId);
  });
});

describe("ADR 0018 — `relire()` RELIT, et ne se souvient de rien", () => {
  it("rend `perdu` après une acquisition RÉUSSIE dont le verrou a été arraché", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());

    const acquisition = await verrou.acquerir();
    const avant = await verrou.relire();
    // Le cas RÉEL de l'ADR 0018 : « la connexion au magasin est tombée, donc le
    // verrou a pu être repris ailleurs ». Personne n'a appelé `liberer()`.
    magasin.arracherLeVerrou();
    const apres = await verrou.relire();

    console.info(
      `[garde G3 · relecture] ${String(magasin.relectures)} relecture(s) — ` +
        `acquisition « ${acquisition.etat} », puis « ${avant} », puis « ${apres} » ` +
        `après arrachement du verrou`,
    );

    expect(magasin.relectures).toBe(2);
    expect(acquisition.etat).toBe("tenu");
    expect(avant).toBe("tenu");
    // ⚠️ C'EST LE CŒUR DE G3. Un verrou qui SE SOUVIENDRAIT de son acquisition
    //    rendrait « tenu » ici — c'est-à-dire vert exactement dans le cas où le
    //    verrou vient d'être perdu.
    expect(apres).toBe("perdu");
  });

  it("rend `perdu` — jamais `refusé` — quand un AUTRE socle a repris le verrou", async () => {
    const { magasin, premier, second } = deuxSoclesSurUnMagasin();
    await premier.acquerir();
    magasin.arracherLeVerrou();
    await second.acquerir();

    const vuParLePremier = await premier.relire();

    console.info(
      `[garde G3 · reprise] le premier socle relit « ${vuParLePremier} » ` +
        `alors qu'un autre tient le verrou`,
    );

    // `refusé` est un état de DÉMARRAGE — « une autre instance le tenait AU
    // MOMENT du démarrage ». En cours de vie, tout ce qui n'est pas « c'est
    // moi » est `perdu`, et le geste qui répare est le même : redémarrer.
    expect(vuParLePremier).toBe("perdu");
  });

  it("SAIT DIRE OUI — sans arrachement, la relecture rend toujours `tenu`", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());
    await verrou.acquerir();

    const lectures = [await verrou.relire(), await verrou.relire(), await verrou.relire()];

    console.info(
      `[garde G3 · plancher] ${String(lectures.length)} relecture(s) : ${lectures.join(", ")}`,
    );

    // Sans ce plancher, la garde précédente serait verte pour un `relire()` qui
    // rendrait `perdu` en toutes circonstances — c'est-à-dire un healthcheck
    // rouge en permanence, donc désactivé dans la semaine.
    expect(lectures).toEqual(["tenu", "tenu", "tenu"]);
  });
});

describe("ADR 0018 — le magasin injoignable est un ÉTAT, pas une exception", () => {
  it("rend `indisponible` sans lever, à l'acquisition comme à la relecture", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());
    magasin.rendreInjoignable();

    const acquisition = await verrou.acquerir();
    const relecture = await verrou.relire();

    console.info(
      `[garde indisponible] ${String(magasin.tentatives)} tentative(s) comptée(s) par le ` +
        `magasin — acquisition « ${acquisition.etat} », relecture « ${relecture}  »`,
    );

    // ⚠️ LE PORT L'EXIGE : « elle NE LÈVE PAS sur un magasin injoignable ». Une
    //    exception y serait indiscernable d'un défaut de câblage, et c'est
    //    l'arbitre qui doit trancher ce que le socle en fait.
    expect(acquisition.etat).toBe("indisponible");
    expect(relecture).toBe("indisponible");
    expect(acquisition.instance).toBeNull();
    // Rien n'a été tenté : le magasin ne compte aucune tentative, ce qui
    // distingue « injoignable » de « refusé ».
    expect(magasin.tentatives).toBe(0);
  });

  it("SAIT DIRE OUI — le magasin rétabli redevient acquérable", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const verrou = new VerrouEnMemoire(magasin, frapperInstance());
    magasin.rendreInjoignable();
    await verrou.acquerir();
    magasin.retablir();

    const apres = await verrou.acquerir();

    console.info(
      `[garde indisponible · plancher] ${String(magasin.tentatives)} tentative(s) après ` +
        `rétablissement — état rendu « ${apres.etat} »`,
    );

    // Sans ce plancher, la garde précédente serait verte pour un double qui
    // rendrait `indisponible` en toutes circonstances — c'est-à-dire pour un
    // instrument qui ne sait plus dire oui, et dont toutes les gardes qui s'en
    // servent seraient vertes pour la mauvaise raison.
    expect(apres.etat).toBe("tenu");
    expect(magasin.tentatives).toBe(1);
  });

  it("les QUATRE états sont réellement atteignables sur le double", async () => {
    const atteints = new Set<EtatDuVerrou>();
    const magasin = new MagasinDeVerrousEnMemoire();
    const premier = new VerrouEnMemoire(magasin, frapperInstance());
    const second = new VerrouEnMemoire(magasin, frapperInstance());

    atteints.add((await premier.acquerir()).etat); // tenu
    atteints.add((await second.acquerir()).etat); // refusé
    magasin.arracherLeVerrou();
    atteints.add(await premier.relire()); // perdu
    magasin.rendreInjoignable();
    atteints.add(await premier.relire()); // indisponible

    console.info(
      `[garde couverture] ${String(ETATS_DU_VERROU.length)} état(s) déclaré(s), ` +
        `${String(atteints.size)} atteint(s) sur le double : ${[...atteints].join(", ")}`,
    );

    // ⚠️ UN ÉTAT DÉCLARÉ ET JAMAIS ATTEINT EST UN ÉTAT QUE RIEN N'ÉPROUVE. Le
    //    compte est confronté au tableau des états, jamais à un nombre écrit.
    expect(atteints.size).toBe(ETATS_DU_VERROU.length);
    for (const etat of ETATS_DU_VERROU) expect(atteints.has(etat), etat).toBe(true);
  });
});

describe("ADR 0018 — la clé DÉRIVE du domaine versionné", () => {
  it("deux domaines différents ne se bloquent pas l'un l'autre", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const courant = new VerrouEnMemoire(magasin, frapperInstance());
    const suivant = new VerrouEnMemoire(magasin, frapperInstance(), {
      domaine: `${DOMAINE_DU_VERROU}-suivant`,
    });

    const premiere = await courant.acquerir();
    const seconde = await suivant.acquerir();

    console.info(
      `[garde domaine] domaine courant « ${courant.domaine} » — ` +
        `${String(magasin.acquisitionsAccordees)} acquisition(s) accordée(s) sur ` +
        `${String(magasin.tentatives)} tentative(s), sur 2 domaines`,
    );

    // ⚠️ C'EST LA RAISON POUR LAQUELLE LE DOMAINE EST VERSIONNÉ. Le jour où la
    //    sémantique du verrou change, la version change — et une ANCIENNE
    //    instance ne bloque pas une nouvelle par accident.
    expect(premiere.etat).toBe("tenu");
    expect(seconde.etat).toBe("tenu");
    expect(magasin.acquisitionsAccordees).toBe(2);
    expect(courant.domaine).toBe(DOMAINE_DU_VERROU);
    // Le domaine porte sa version : sans elle, il n'y aurait rien à faire varier.
    expect(DOMAINE_DU_VERROU).toMatch(/:v\d+$/u);
  });

  it("`liberer()` ne rend le verrou QUE pour celui qui le tient", async () => {
    const { magasin, premier, second } = deuxSoclesSurUnMagasin();
    await premier.acquerir();

    await second.liberer();
    const apresTentativeEtrangere = magasin.detenteur();
    await premier.liberer();
    const apresLegitime = magasin.detenteur();

    console.info(
      `[garde libération] ${String(magasin.liberations)} libération(s) effective(s) sur ` +
        `2 appels — détenteur après l'appel étranger : ` +
        `${apresTentativeEtrangere === null ? "aucun" : "toujours le premier"}`,
    );

    // Un socle qui pourrait libérer le verrou d'un autre rouvrirait exactement
    // la porte que ce verrou ferme.
    expect(apresTentativeEtrangere?.instanceId).toBe(premier.instance.instanceId);
    expect(apresLegitime).toBeNull();
    expect(magasin.liberations).toBe(1);
  });
});
