import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { demarrerLeSocleMonoInstance } from "./demarrage.js";
import type { LigneDuMagasin, RequeteDuVerrou, SessionDeVerrou } from "./postgres.js";
import {
  APPLICATION_NAME_DU_VERROU,
  BITS_RETENUS_DE_LA_CLE,
  HOTE_SANS_MAGASIN_PARTAGE,
  REQUETES_DU_VERROU,
  VerrouPostgres,
  choisirImplementationDuVerrou,
  cleDuVerrouPostgres,
} from "./postgres.js";
import { DOMAINE_DU_VERROU, frapperInstance } from "./verrou.js";

/**
 * **ADR 0024 — LE VERROU MONO-INSTANCE EN POSTGRESQL, ÉPROUVÉ SANS BASE.**
 *
 * ═══ CE QUE CES GARDES MESURENT ═══
 *
 * L'ADR 0024 écrit noir sur blanc ce que sa garde ne peut PAS faire : « elle ne
 * peut pas ouvrir de connexion — le dépôt ne fait aucun appel réseau sortant ».
 * Ce qu'elle tient est donc, mot pour mot :
 *
 *  · que la clé est **dérivée** — un témoin qui change `DOMAINE_DU_VERROU` doit
 *    changer la clé, et un entier écrit en dur dans le module est une anomalie ;
 *  · que la connexion déclarée est celle de l'acquisition
 *    (`memeSessionQuAlAcquisition`), avec un témoin fabriqué où elle ne l'est pas ;
 *  · **le compte de propriétés confrontées**, jamais une couleur.
 *
 * ═══ LE MAGASIN FACTICE, ET POURQUOI IL N'EST PAS UNE TAUTOLOGIE ═══
 *
 * ⚠️ **IL RE-DÉRIVE LA CLÉ, IL NE LA RECOPIE PAS.** L'acquisition passe la clé
 *    en 64 bits SIGNÉS ; la relecture passe les deux moitiés de 32 bits sous
 *    lesquelles le catalogue des verrous la range. Le magasin factice
 *    reconstruit la MÊME valeur non signée à partir des deux formes, par deux
 *    chemins indépendants — et il ne trouve le verrou que si les deux formes
 *    désignent bien le même. Une décomposition fausse dans `postgres.ts` ferait
 *    donc rendre `perdu` sur un verrou tenu, et ces gardes rougiraient.
 *
 * ⚠️ **IL NE PORTE AUCUNE DONNÉE, ET SÛREMENT PAS UN IDENTIFIANT
 *    D'INFRASTRUCTURE** — le dépôt est PUBLIC (§ 29). Les identités de session
 *    sont des compteurs, pas des `pid` réels.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE MAGASIN FACTICE
// ═════════════════════════════════════════════════════════════════════════════

/** La forme non signée d'une clé passée à l'acquisition. */
function depuisLaCleSignee(parametre: string): bigint {
  return BigInt.asUintN(64, BigInt(parametre));
}

/** La même valeur, reconstruite depuis les deux moitiés de la relecture. */
function depuisLesDeuxMoities(haute: string, basse: string): bigint {
  return (BigInt(haute) << 32n) | BigInt(basse);
}

class MagasinPostgresFactice {
  /** clé non signée → identité de la session qui tient le verrou. */
  readonly verrous = new Map<bigint, string>();
  ouvertures = 0;
  interrogations = 0;
  #prochaine = 0;
  #injoignable = false;
  #ouverturesQuiEchouent = false;

  rendreInjoignable(): void {
    this.#injoignable = true;
  }

  refuserTouteOuverture(): void {
    this.#ouverturesQuiEchouent = true;
  }

  ouvrir(): Promise<SessionDeVerrou> {
    if (this.#ouverturesQuiEchouent) return Promise.reject(new Error("connexion refusée"));
    this.ouvertures += 1;
    this.#prochaine += 1;
    return Promise.resolve(new SessionFactice(this, `session-${String(this.#prochaine)}`));
  }

  /** Le catalogue est interrogé. Compté : une garde à zéro interrogation est vide. */
  interroger(session: SessionFactice, requete: RequeteDuVerrou): readonly LigneDuMagasin[] {
    this.interrogations += 1;
    if (this.#injoignable) throw new Error("magasin injoignable");
    if (!session.ouverte) throw new Error("connexion fermée");

    if (requete.texte === REQUETES_DU_VERROU.acquisition) {
      const cle = depuisLaCleSignee(requete.parametres[0] ?? "0");
      const detenteur = this.verrous.get(cle);
      if (detenteur === undefined) {
        this.verrous.set(cle, session.identite);
        return [{ session: session.identite, pris: true }];
      }
      return [{ session: session.identite, pris: detenteur === session.identite }];
    }

    if (requete.texte === REQUETES_DU_VERROU.relecture) {
      const cle = depuisLesDeuxMoities(requete.parametres[0] ?? "0", requete.parametres[1] ?? "0");
      const detenteur = this.verrous.get(cle);
      // Le catalogue ne compte QUE les verrous tenus par la session courante :
      // `pid = pg_backend_pid()` dans la requête réelle.
      return [{ session: session.identite, tenus: detenteur === session.identite ? 1 : 0 }];
    }

    if (requete.texte === REQUETES_DU_VERROU.liberation) {
      const cle = depuisLaCleSignee(requete.parametres[0] ?? "0");
      const rendu = this.verrous.get(cle) === session.identite;
      if (rendu) this.verrous.delete(cle);
      return [{ session: session.identite, rendu }];
    }

    throw new Error("requête inconnue du magasin factice");
  }
}

class SessionFactice implements SessionDeVerrou {
  readonly applicationName = APPLICATION_NAME_DU_VERROU;
  ouverte = true;
  #identite: string;
  readonly #magasin: MagasinPostgresFactice;

  constructor(magasin: MagasinPostgresFactice, identite: string) {
    this.#magasin = magasin;
    this.#identite = identite;
  }

  get identite(): string {
    return this.#identite;
  }

  /**
   * **LE RECYCLAGE DE POOL, FABRIQUÉ — ET IL ISOLE UNE SEULE RÈGLE.**
   *
   * ⚠️ **LE VERROU EST TRANSFÉRÉ À LA NOUVELLE SESSION, ET C'EST TOUT L'INTÉRÊT
   *    DU TÉMOIN.** Un recyclage qui laisserait le catalogue vide serait vu par
   *    le compte `tenus`, et le témoin serait vert sans que la confrontation
   *    d'identité serve à rien — mesuré : en neutralisant cette confrontation,
   *    ce témoin restait VERT. Ici, le catalogue répond « oui, la session
   *    courante tient ce verrou » : c'est vrai, et c'est pourtant un socle qui a
   *    laissé une FENÊTRE pendant laquelle il ne le tenait plus. Seule la
   *    confrontation d'identité voit cette fenêtre.
   */
  recyclerCommeUnPool(nouvelleIdentite: string, cle: bigint): void {
    if (this.#magasin.verrous.get(cle) === this.#identite) {
      this.#magasin.verrous.set(cle, nouvelleIdentite);
    }
    this.#identite = nouvelleIdentite;
  }

  /**
   * Le verrou disparaît du catalogue SANS que la session change — un
   * `pg_advisory_unlock` prononcé ailleurs, ou une bascule du magasin. C'est
   * l'autre moitié, et elle se mesure séparément : deux règles, deux témoins.
   */
  arracherLeVerrou(cle: bigint): boolean {
    return this.#magasin.verrous.delete(cle);
  }

  /** La connexion tombe. Le verrou de session tombe AVEC elle. */
  tomber(cle: bigint): void {
    this.ouverte = false;
    if (this.#magasin.verrous.get(cle) === this.#identite) this.#magasin.verrous.delete(cle);
  }

  interroger(requete: RequeteDuVerrou): Promise<readonly LigneDuMagasin[]> {
    return Promise.resolve(this.#magasin.interroger(this, requete));
  }

  fermer(): Promise<void> {
    this.ouverte = false;
    return Promise.resolve();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  T1 — LA CLÉ EST DÉRIVÉE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0024 · T1 — la clé DÉRIVE du domaine, elle n'est écrite nulle part", () => {
  it("change avec le domaine, et se recompose depuis ses deux moitiés", () => {
    const domaines = [DOMAINE_DU_VERROU, "axion-ops:instance-unique:v2", "autre-domaine"];
    const cles = domaines.map((domaine) => cleDuVerrouPostgres(domaine));
    const distinctes = new Set(cles.map((cle) => cle.cle.toString())).size;

    const recompositions = cles.map(
      (cle) => (BigInt(cle.moitieHaute) << 32n) | BigInt(cle.moitieBasse),
    );
    const accords = cles.filter(
      (cle, rang) => BigInt.asUintN(64, cle.cle) === recompositions[rang],
    ).length;

    console.info(
      `[T1 · dérivation] ${String(domaines.length)} domaine(s) confronté(s) · ` +
        `${String(distinctes)} clé(s) DISTINCTE(s) · ` +
        `${String(accords)} recomposition(s) 32+32 → 64 en accord · ` +
        `bits retenus : ${String(BITS_RETENUS_DE_LA_CLE)}`,
    );

    // Plancher : trois domaines ont bien été confrontés.
    expect(domaines.length).toBe(3);
    // Un domaine changé change la clé — sinon la version du domaine ne
    // protégerait rien le jour où la sémantique du verrou changerait.
    expect(distinctes).toBe(3);
    // ⚠️ LA MOITIÉ QUI COMPTE : les deux formes désignent le MÊME verrou. Une
    //    décomposition fausse ferait rendre « perdu » sur un verrou bien tenu.
    expect(accords).toBe(3);
    expect(BITS_RETENUS_DE_LA_CLE).toBe(64);
    // Stable : deux appels rendent la même clé.
    expect(cleDuVerrouPostgres(DOMAINE_DU_VERROU).cle).toBe(cles[0]?.cle);
  });

  it("SAIT DIRE NON — le module ne porte AUCUN entier de clé écrit en dur", () => {
    const source = readFileSync(fileURLToPath(new URL("./postgres.ts", import.meta.url)), "utf8");
    // Un identifiant de verrou consultatif écrit à la main a au moins dix
    // chiffres : c'est la forme que l'ADR 0018 écarte, « recopiée dans une
    // migration et divergeant en silence ».
    const entiersLongs = source.match(/\b\d{10,}\b/g) ?? [];
    const paramètres = source.match(/\$\d::(?:bigint|oid)/g) ?? [];

    console.info(
      `[T1 · témoin] ${String(source.length)} octet(s) lus · ` +
        `${String(entiersLongs.length)} entier(s) de 10 chiffres ou plus ` +
        `[${entiersLongs.join(", ") || "aucun"}] · ` +
        `${String(paramètres.length)} paramètre(s) typé(s) dans les requêtes ` +
        `[${paramètres.join(", ")}]`,
    );

    // Plancher : le fichier a bien été lu.
    expect(source.length).toBeGreaterThan(2000);
    expect(entiersLongs).toEqual([]);
    // La clé voyage en PARAMÈTRE, jamais interpolée dans le texte de la requête.
    expect(paramètres.length).toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T2 — DEUX SOCLES, UN SEUL VERROU
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0024 · T2 — un second socle est REFUSÉ, et le refus reste muet", () => {
  it("deux verrous sur le même magasin : un seul tenu, un seul démarrage", async () => {
    const magasin = new MagasinPostgresFactice();
    const verrous = [
      new VerrouPostgres({ ouvrirLaSession: () => magasin.ouvrir(), instance: frapperInstance() }),
      new VerrouPostgres({ ouvrirLaSession: () => magasin.ouvrir(), instance: frapperInstance() }),
    ];

    const demarrages = [];
    for (const verrou of verrous) demarrages.push(await demarrerLeSocleMonoInstance(verrou));
    const autorises = demarrages.filter((demarrage) => demarrage.decision.demarre);

    console.info(
      `[T2 · couture] ${String(verrous.length)} socle(s) confronté(s) · ` +
        `${String(magasin.ouvertures)} session(s) dédiée(s) ouverte(s) · ` +
        `${String(magasin.interrogations)} interrogation(s) du magasin · ` +
        `${String(magasin.verrous.size)} verrou(s) tenu(s) · ` +
        `${String(autorises.length)} DÉMARRAGE(S) AUTORISÉ(S) — ` +
        `états : ${demarrages.map((d) => d.decision.etat).join(", ")}`,
    );

    // Les trois comptes ne disent pas la même chose : le magasin a été
    // INTERROGÉ, le verrou a MORDU, et le socle en a TENU COMPTE.
    expect(magasin.interrogations).toBe(2);
    expect(magasin.verrous.size).toBe(1);
    expect(autorises.length).toBe(1);
    expect(demarrages[1]?.decision.etat).toBe("refusé");
    // ⚠️ MUET SUR LE DÉTENTEUR : un verrou consultatif ne nomme pas qui le
    //    tient. Un double plus capable que la production ferait écrire des
    //    gardes qui exigent un nom que la production ne rendra jamais.
    expect(demarrages[1]?.resultat.detenteur).toBeNull();
    expect(demarrages[1]?.instance).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T3 — LA MÊME SESSION QUE L'ACQUISITION
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0024 · T3 — la relecture interroge LA MÊME session, ou elle dit « perdu »", () => {
  it("TÉMOIN DE CONTRASTE — sans recyclage, la relecture rend « tenu »", async () => {
    const magasin = new MagasinPostgresFactice();
    const verrou = new VerrouPostgres({ ouvrirLaSession: () => magasin.ouvrir() });

    const acquisition = await verrou.acquerir();
    const relecture = await verrou.relireLeVerrou();

    console.info(
      `[T3 · contraste] acquisition : ${acquisition.etat} · relecture : ${relecture.etat} · ` +
        `même session qu'à l'acquisition : ${String(relecture.connexion.memeSessionQuAlAcquisition)} · ` +
        `application_name : « ${relecture.connexion.applicationName} » · ` +
        `${String(verrou.relectures)} relecture(s)`,
    );

    // Sans ce contraste, le témoin ci-dessous serait vert sur un verrou qui
    // rendrait « perdu » à tout le monde.
    expect(acquisition.etat).toBe("tenu");
    expect(relecture.etat).toBe("tenu");
    expect(relecture.connexion.memeSessionQuAlAcquisition).toBe(true);
    expect(relecture.connexion.applicationName).toBe(APPLICATION_NAME_DU_VERROU);
    expect(verrou.relectures).toBe(1);
  });

  it("SAIT DIRE NON — une connexion RECYCLÉE par le pool rend « perdu », pas « tenu »", async () => {
    const magasin = new MagasinPostgresFactice();
    let session: SessionFactice | null = null;
    const verrou = new VerrouPostgres({
      ouvrirLaSession: async () => {
        session = (await magasin.ouvrir()) as SessionFactice;
        return session;
      },
    });

    const acquisition = await verrou.acquerir();
    const avant = await verrou.relireLeVerrou();

    // ⚠️ LE DÉFAUT, FABRIQUÉ : le pool recycle la connexion. Elle se dit
    //    TOUJOURS OUVERTE — c'est tout le sujet —, le catalogue répond TOUJOURS
    //    « la session courante tient ce verrou », et pourtant une fenêtre a
    //    existé pendant laquelle ce socle ne le tenait plus.
    const cle = BigInt.asUintN(64, verrou.cle.cle);
    const recyclee = session as SessionFactice | null;
    recyclee?.recyclerCommeUnPool("session-recyclée", cle);
    const apres = await verrou.relireLeVerrou();
    const catalogueDitTenu = magasin.verrous.get(cle) === recyclee?.identite;

    console.info(
      `[T3 · recyclage] acquisition : ${acquisition.etat} · ` +
        `relecture AVANT recyclage : ${avant.etat} ` +
        `(même session : ${String(avant.connexion.memeSessionQuAlAcquisition)}) · ` +
        `relecture APRÈS recyclage : ${apres.etat} ` +
        `(même session : ${String(apres.connexion.memeSessionQuAlAcquisition)}) · ` +
        `connexion encore « ouverte » : ${String(recyclee?.ouverte ?? false)} · ` +
        `catalogue : la session courante tient le verrou : ${String(catalogueDitTenu)} · ` +
        `${String(magasin.ouvertures)} ouverture(s) de session au total`,
    );

    expect(avant.etat).toBe("tenu");
    // ⚠️ LES TROIS FAITS QUI ISOLENT LA RÈGLE. La connexion est ouverte, le
    //    catalogue répond « tenu », et c'est POURTANT perdu. Sans les deux
    //    premiers, ce témoin serait vert par le compte `tenus` — mesuré :
    //    neutraliser la confrontation d'identité le laissait VERT.
    expect(recyclee?.ouverte).toBe(true);
    expect(catalogueDitTenu).toBe(true);
    expect(apres.etat).toBe("perdu");
    expect(apres.connexion.memeSessionQuAlAcquisition).toBe(false);
    // AUCUNE RECONNEXION : la perte de la connexion est la perte du verrou.
    expect(verrou.ouverturesDeSession).toBe(1);
  });

  it("SAIT DIRE NON — le verrou ARRACHÉ du catalogue rend « perdu », à session inchangée", async () => {
    const magasin = new MagasinPostgresFactice();
    let session: SessionFactice | null = null;
    const verrou = new VerrouPostgres({
      ouvrirLaSession: async () => {
        session = (await magasin.ouvrir()) as SessionFactice;
        return session;
      },
    });

    await verrou.acquerir();
    const avant = await verrou.relireLeVerrou();
    const arrache = (session as SessionFactice | null)?.arracherLeVerrou(
      BigInt.asUintN(64, verrou.cle.cle),
    );
    const apres = await verrou.relireLeVerrou();

    console.info(
      `[T3 · arrachage] verrou retiré du catalogue : ${String(arrache ?? false)} · ` +
        `avant : ${avant.etat} · après : ${apres.etat} · ` +
        `même session qu'à l'acquisition : ${String(apres.connexion.memeSessionQuAlAcquisition)}`,
    );

    // ⚠️ LA SECONDE RÈGLE, ISOLÉE : l'identité de session est INCHANGÉE — donc
    //    ce n'est pas la confrontation d'identité qui décide ici, c'est le
    //    compte de verrous tenus. Deux règles, deux témoins.
    expect(arrache).toBe(true);
    expect(avant.etat).toBe("tenu");
    expect(apres.connexion.memeSessionQuAlAcquisition).toBe(true);
    expect(apres.etat).toBe("perdu");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T4 — LA PERTE DE LA CONNEXION N'EST PAS UNE ERREUR À RATTRAPER
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0024 · T4 — la connexion tombée n'est jamais reprise en silence", () => {
  it("le verrou reste PERDU, et aucune seconde session n'est ouverte", async () => {
    const magasin = new MagasinPostgresFactice();
    let session: SessionFactice | null = null;
    const verrou = new VerrouPostgres({
      ouvrirLaSession: async () => {
        session = (await magasin.ouvrir()) as SessionFactice;
        return session;
      },
    });

    await verrou.acquerir();
    const tombee = session as SessionFactice | null;
    tombee?.tomber(BigInt.asUintN(64, verrou.cle.cle));

    const premiere = await verrou.relire();
    const seconde = await verrou.relire();
    const reprise = await verrou.acquerir();

    console.info(
      `[T4 · perte] ${String(magasin.ouvertures)} session(s) ouverte(s) · ` +
        `${String(magasin.verrous.size)} verrou(s) restant(s) dans le magasin · ` +
        `relectures : ${premiere}, ${seconde} · reprise tentée : ${reprise.etat} · ` +
        `${String(verrou.ouverturesDeSession)} ouverture(s) côté verrou`,
    );

    expect(premiere).toBe("perdu");
    expect(seconde).toBe("perdu");
    // ⚠️ LA REPRISE EST REFUSÉE. Reprendre le verrou effacerait la fenêtre
    //    pendant laquelle deux socles ont pu servir — et cette fenêtre est
    //    précisément ce que le § 20 doit connaître.
    expect(reprise.etat).toBe("perdu");
    expect(verrou.ouverturesDeSession).toBe(1);
    expect(magasin.ouvertures).toBe(1);
  });

  it("DISTINGUE « perdu » de « indisponible » — les deux refusent, pas du même geste", async () => {
    const magasin = new MagasinPostgresFactice();
    const verrou = new VerrouPostgres({ ouvrirLaSession: () => magasin.ouvrir() });
    await verrou.acquerir();

    // Le magasin ne répond plus, mais la connexion se dit ouverte : on ne SAIT
    // pas si le verrou est encore tenu. Annoncer « perdu » enverrait redémarrer
    // un socle qui va bien ; annoncer « tenu » serait pire.
    magasin.rendreInjoignable();
    const etat = await verrou.relire();

    console.info(
      `[T4 · ignorance] magasin injoignable, connexion ouverte → « ${etat} » · ` +
        `${String(magasin.interrogations)} interrogation(s) tentée(s)`,
    );

    expect(etat).toBe("indisponible");
    expect(magasin.interrogations).toBeGreaterThanOrEqual(2);
  });

  it("`acquerir` NE LÈVE JAMAIS — une ouverture refusée rend « indisponible »", async () => {
    const magasin = new MagasinPostgresFactice();
    magasin.refuserTouteOuverture();
    const verrou = new VerrouPostgres({ ouvrirLaSession: () => magasin.ouvrir() });

    const resultat = await verrou.acquerir();

    console.info(
      `[T4 · contrat du port] ouverture refusée → « ${resultat.etat} » · ` +
        `${String(magasin.ouvertures)} session(s) ouverte(s) · ` +
        `la cause est-elle relayée : ${String(resultat.message.includes("refusée"))}`,
    );

    expect(resultat.etat).toBe("indisponible");
    // La cause n'est PAS relayée : elle peut porter une chaîne de connexion, et
    // ce dépôt est public (§ 29).
    expect(resultat.message).not.toContain("refusée");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T5 — QUELLE IMPLÉMENTATION, ET POURQUOI
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0024 · T5 — le choix se dérive de l'URL, jamais d'un drapeau", () => {
  it("confronte quatre URL et annonce ce que chacune décide", () => {
    const cas = [
      { nom: "absente", url: undefined },
      { nom: "factice", url: `postgresql://stub:stub@${HOTE_SANS_MAGASIN_PARTAGE}:5432/stub` },
      { nom: "réelle", url: "postgresql://socle:x@base.interne:5432/ops" },
      { nom: "illisible", url: "ceci n'est pas une URL" },
    ];
    const choix = cas.map((entree) => ({
      ...entree,
      choix: choisirImplementationDuVerrou(entree.url),
    }));

    for (const entree of choix) {
      console.info(
        `[T5 · choix] URL ${entree.nom} → « ${entree.choix.implementation} » · ` +
          `aveugle aux autres processus : ${String(entree.choix.aveugleAuxAutresProcessus)} · ` +
          `URL lisible : ${String(entree.choix.urlLisible)}`,
      );
    }

    // Plancher : quatre cas ont été confrontés.
    expect(choix.length).toBe(4);
    expect(choix[0]?.choix.implementation).toBe("mémoire");
    expect(choix[1]?.choix.implementation).toBe("mémoire");
    // ⚠️ LA BORNE VOYAGE AVEC LE CHOIX : « le verrou est pris » ne se lit pas
    //    « deux socles sont impossibles ».
    expect(choix[1]?.choix.aveugleAuxAutresProcessus).toBe(true);
    expect(choix[2]?.choix.implementation).toBe("postgres");
    expect(choix[2]?.choix.aveugleAuxAutresProcessus).toBe(false);
    // Une URL ILLISIBLE ne se confond pas avec une URL factice : c'est ce champ
    // qui permet à la racine de refuser au lieu de prendre un verrou aveugle.
    expect(choix[3]?.choix.urlLisible).toBe(false);
    expect(choix[1]?.choix.urlLisible).toBe(true);
  });
});
