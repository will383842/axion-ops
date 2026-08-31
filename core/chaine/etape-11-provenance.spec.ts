import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { APPEL_STEPS, DATA_CLASSES, POLICY_LEVELS } from "../types.js";
import type { DataClass, PolicyLevel } from "../types.js";
import { ETAPE_PROVENANCE } from "./etapes.js";
import type { ContexteProvenance, IndexProvenance } from "./etapes.js";
// ADR 0014 — les sessions de témoin passent par la fabrique NOMMÉE de
// `core/identite/`, jamais par une conversion forcée écrite au cas par cas :
// c'est ce qui laisse la garde G3 distinguer une anomalie d'un décor de test.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";
import {
  DOMAINE_INDETERMINE,
  FAMILLES_GOUVERNANCE,
  IndexProvenanceMemoire,
  MOTIF_ID_ADAPTATEUR,
  NOMBRE_MOTIFS_GOUVERNANCE,
  PLAFOND_EXTRAITS,
  PLAFOND_SESSIONS,
  TTL_MARQUAGE_MS,
  analyserArgumentsDuSchema,
  empreinteExtrait,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
  segmenterNom,
} from "./etape-11-provenance.js";

/**
 * Gardes de l'étape 11 — LA PROVENANCE.
 *
 * C'est la garde la plus importante du socle : celle qui empêche qu'un contenu
 * lu ressorte vers un tiers. Chaque garde de ce fichier (a) rougit d'abord sur
 * un TÉMOIN FABRIQUÉ, et (b) ANNONCE combien d'éléments elle a mesurés, sous un
 * plancher-témoin.
 *
 * ⚠️ CE QUI EST ÉPROUVÉ ICI, ET QUI EST LE PIÈGE DU § 20 : la garde ne porte
 *    PAS sur la forme des arguments. Une garde de forme — « l'argument
 *    reprend-il verbatim un extrait lu ? » — se contourne d'une reformulation.
 *    La garde 1 le MESURE : elle soumet cinq variantes du même contenu et
 *    compte, pour chacune, ce qu'une garde de forme aurait fait.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Matériel commun
// ─────────────────────────────────────────────────────────────────────────────

const DOMAINE_LECTURE = "zoho-mail";
const DOMAINE_TIERS = "crm-pro";
const SESSION: SessionId = sessionIdDeTemoin();

/**
 * Trois sessions DISTINCTES pour la garde de saturation. Elles sont gardées dans
 * des constantes plutôt que refabriquées à chaque emploi : `sessionIdDeTemoin()`
 * frappe de l'aléa, exactement comme le socle, et deux appels ne rendent jamais
 * la même valeur — c'est le point de l'ADR 0014.
 */
const SESSION_A: SessionId = sessionIdDeTemoin();
const SESSION_B: SessionId = sessionIdDeTemoin();
const SESSION_C: SessionId = sessionIdDeTemoin();

/** Une horloge injectée : aucune garde de ce fichier ne lit l'heure système. */
function horlogeFigee(debut = "2026-08-31T10:00:00.000Z"): {
  maintenant: () => Date;
  avancerDe: (ms: number) => void;
} {
  let instant = new Date(debut).getTime();
  return {
    maintenant: (): Date => new Date(instant),
    avancerDe: (ms: number): void => {
      instant += ms;
    },
  };
}

function contexte(parts: {
  readonly index: IndexProvenance;
  readonly adapterId?: string;
  readonly sessionId?: SessionId;
  readonly libre?: boolean;
  readonly gouvernance?: boolean;
  readonly niveau?: PolicyLevel;
}): ContexteProvenance {
  return {
    sessionId: parts.sessionId ?? SESSION,
    adapterId: parts.adapterId ?? DOMAINE_TIERS,
    porteUnArgumentLibre: parts.libre ?? true,
    porteUnArgumentDeGouvernance: parts.gouvernance ?? false,
    niveau: parts.niveau ?? "brouillon",
    index: parts.index,
  };
}

/**
 * LE CONTENU LU, ET QUATRE REFORMULATIONS.
 *
 * La première est l'extrait tel qu'il a été lu ; les quatre autres disent la
 * même chose autrement. C'est exactement ce qu'un modèle produit quand on lui
 * demande de « chercher des informations sur ce client ».
 */
const EXTRAIT_LU = "Marc Dubois, responsable achats, joignable au bureau le mardi.";
const REFORMULATIONS: readonly string[] = [
  EXTRAIT_LU,
  "Marc Dubois est le responsable des achats ; il est au bureau les mardis.",
  "responsable achats Dubois disponibilite mardi",
  "Purchasing manager Marc Dubois, reachable at the office on Tuesdays.",
  "Le contact achats du dossier travaille sur site en début de semaine.",
];

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 0 — le numéro et le code sont DÉRIVÉS du § 11
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 11 — son numéro et son code sont dérivés d'APPEL_STEPS", () => {
  it("porte le numéro et le code que le § 11 associe à la clé « provenance »", () => {
    const officielle = APPEL_STEPS.find((etape) => etape.cle === "provenance");
    expect(officielle).toBeDefined();
    expect(ETAPE_PROVENANCE.numero).toBe(officielle?.numero);
    expect(ETAPE_PROVENANCE.code).toBe(officielle?.refus);
    expect(ETAPE_PROVENANCE.code).toBe("provenance_denied");
  });

  it("fait porter au verdict le numéro et le code de l'ancrage, jamais des constantes", () => {
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);

    const verdict = etape11Provenance(contexte({ index }));

    expect(verdict.issue).toBe("refuse");
    expect(verdict.etape).toBe(ETAPE_PROVENANCE.numero);
    if (verdict.issue === "refuse") {
      expect(verdict.code).toBe(ETAPE_PROVENANCE.code);
      // § 15 — le message NOMME le domaine marquant, et RIEN du contenu.
      expect(verdict.message).toContain(DOMAINE_LECTURE);
      expect(verdict.message).not.toContain("Dubois");
      expect(verdict.message).not.toContain(empreinteExtrait(EXTRAIT_LU));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LA REFORMULATION NE CONTOURNE RIEN
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — la règle porte sur la PROVENANCE, jamais sur la forme", () => {
  it("refuse les cinq variantes vers un AUTRE domaine, et dit combien elle en a soumises", () => {
    const horloge = horlogeFigee();
    const index = new IndexProvenanceMemoire({ maintenant: horloge.maintenant });

    // La session a lu un contenu `personal` chez `zoho-mail`. SEULE l'empreinte
    // de l'extrait exact est indexée — c'est tout ce qu'une lecture produit.
    const marquee = marquerResultat(index, {
      sessionId: SESSION,
      adapterId: DOMAINE_LECTURE,
      dataClass: "personal",
      empreintes: [empreinteExtrait(EXTRAIT_LU)],
    });
    expect(marquee).toBe(true);

    // ⚠️ TÉMOIN NÉGATIF — CE QU'UNE GARDE DE FORME AURAIT FAIT.
    //    On rejoue la règle que le § 20 a RETIRÉE : « refuser si l'argument
    //    reprend verbatim un extrait lu ». Elle se réduit à comparer des
    //    empreintes, et une reformulation la traverse.
    const empreintesIndexees = new Set([empreinteExtrait(EXTRAIT_LU)]);
    const refusesParLaForme = REFORMULATIONS.filter((variante) =>
      empreintesIndexees.has(empreinteExtrait(variante)),
    ).length;

    // La garde réelle : chaque variante est placée dans le champ `query` d'un
    // outil de `crm-pro`. Le contexte ne porte AUCUN texte — c'est structurel.
    let refusesParLaProvenance = 0;
    let soumises = 0;
    for (const _variante of REFORMULATIONS) {
      soumises += 1;
      const verdict = etape11Provenance(contexte({ index, libre: true }));
      if (verdict.issue === "refuse") refusesParLaProvenance += 1;
    }

    console.info(
      `[garde provenance] ${String(soumises)} tentative(s) soumise(s) — ` +
        `${String(refusesParLaProvenance)} refusée(s) par la PROVENANCE, ` +
        `${String(refusesParLaForme)} l'auraient été par la FORME (règle retirée du § 20) ; ` +
        `${String(index.taille())} extrait(s) indexé(s)`,
    );

    // Plancher-témoin : cinq variantes soumises. Zéro rendrait la garde vacueuse.
    expect(soumises).toBe(REFORMULATIONS.length);
    expect(soumises).toBeGreaterThanOrEqual(5);
    // La garde réelle refuse TOUT.
    expect(refusesParLaProvenance).toBe(soumises);
    // La garde de forme n'aurait retenu que la copie littérale : c'est LA
    // mesure du défaut que le § 20 a corrigé. Si ce compte devenait égal à
    // `soumises`, c'est que l'instrument ne distingue plus les deux règles.
    expect(refusesParLaForme).toBe(1);
    expect(refusesParLaForme).toBeLessThan(soumises);
  });

  it("laisse passer les mêmes variantes vers le MÊME domaine — `reply` et `forward` vivent", () => {
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);

    let autorisees = 0;
    let soumises = 0;
    for (const _variante of REFORMULATIONS) {
      soumises += 1;
      const verdict = etape11Provenance(
        contexte({ index, adapterId: DOMAINE_LECTURE, libre: true }),
      );
      if (verdict.issue === "autorise") autorisees += 1;
    }

    console.info(
      `[garde même domaine] ${String(soumises)} tentative(s) soumise(s) vers ` +
        `« ${DOMAINE_LECTURE} », ${String(autorisees)} autorisée(s)`,
    );

    expect(soumises).toBe(REFORMULATIONS.length);
    expect(autorisees).toBe(soumises);

    // Et le verdict porte ce que l'étape a ÉTABLI, pour que l'étape suivante ne
    // le recalcule pas — donc ne le recalcule pas différemment.
    const verdict = etape11Provenance(contexte({ index, adapterId: DOMAINE_LECTURE }));
    expect(verdict.issue).toBe("autorise");
    if (verdict.issue === "autorise") {
      expect(verdict.etabli.domainesMarquants).toEqual([DOMAINE_LECTURE]);
      expect(verdict.etabli.confirmationExigee).toBe(false);
      expect(verdict.etabli.extraitsIndexes).toBe(1);
    }
  });

  it("rougit sur un témoin fabriqué : sans marquage, la même tentative passe", () => {
    // Sans ce témoin, on ne saurait pas si le refus vient du MARQUAGE ou d'un
    // refus systématique — une garde qui refuse tout ne garde rien non plus.
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    const verdict = etape11Provenance(contexte({ index, libre: true }));
    expect(verdict.issue).toBe("autorise");
    expect(index.taille()).toBe(0);
  });

  it("laisse passer un appel SANS argument libre, même session marquée", () => {
    // La règle du § 20 porte sur « un appel […] portant un argument libre ». Un
    // identifiant ou une énumération ne transporte aucun contenu lu.
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);
    const verdict = etape11Provenance(contexte({ index, libre: false }));
    expect(verdict.issue).toBe("autorise");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — « refusé OU confirmé » : lequel, et pourquoi
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — « refusé ou confirmé » se dérive du niveau, jamais d'un défaut", () => {
  it("refuse en « brouillon » et exige une confirmation aux deux autres niveaux", () => {
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);

    const issues = new Map<PolicyLevel, string>();
    // La liste des niveaux est DÉRIVÉE de `POLICY_LEVELS`, jamais écrite : un
    // niveau ajouté au § 20 apparaît ici sans qu'on y touche, et son issue
    // manquante se voit.
    for (const niveau of POLICY_LEVELS) {
      const verdict = etape11Provenance(contexte({ index, niveau, libre: true }));
      issues.set(
        niveau,
        verdict.issue === "refuse"
          ? "refus"
          : verdict.etabli.confirmationExigee
            ? "confirmation"
            : "laissez-passer",
      );
    }

    console.info(
      `[garde niveaux] ${String(issues.size)} niveau(x) mesuré(s) : ` +
        [...issues].map(([niveau, issue]) => `${niveau} → ${issue}`).join(", "),
    );

    expect(issues.size).toBe(POLICY_LEVELS.length);
    expect(issues.size).toBeGreaterThanOrEqual(3);
    expect(issues.get("brouillon")).toBe("refus");
    // ⚠️ `libre` NE DISPENSE PAS. § 20 : il dispense de la confirmation PAR
    //    APPEL, jamais du geste humain. Si ce compte devenait « laissez-passer »,
    //    la garde s'évaporerait au niveau où les effets extérieurs partent seuls.
    expect(issues.get("confirmé")).toBe("confirmation");
    expect(issues.get("libre")).toBe("confirmation");
    // AUCUN niveau ne laisse passer sans rien exiger.
    expect([...issues.values()].filter((issue) => issue === "laissez-passer")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — les arguments de GOUVERNANCE : refusés, toujours
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — un argument de gouvernance ne provient JAMAIS d'un contenu lu", () => {
  it("refuse à TOUS les niveaux, et même vers le domaine qui a marqué", () => {
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);

    const cibles = [DOMAINE_TIERS, DOMAINE_LECTURE];
    let mesurees = 0;
    const passees: string[] = [];

    for (const niveau of POLICY_LEVELS) {
      for (const adapterId of cibles) {
        for (const libre of [true, false]) {
          mesurees += 1;
          const verdict = etape11Provenance(
            contexte({ index, niveau, adapterId, libre, gouvernance: true }),
          );
          if (verdict.issue !== "refuse")
            passees.push(`${niveau}/${adapterId}/libre=${String(libre)}`);
        }
      }
    }

    console.info(
      `[garde gouvernance] ${String(mesurees)} combinaison(s) mesurée(s) ` +
        `(${String(POLICY_LEVELS.length)} niveaux × ${String(cibles.length)} domaines × 2), ` +
        `${String(passees.length)} passée(s)`,
    );

    // Plancher-témoin : trois niveaux, deux domaines, deux formes d'argument.
    expect(mesurees).toBe(POLICY_LEVELS.length * cibles.length * 2);
    expect(mesurees).toBeGreaterThanOrEqual(12);
    // ⚠️ Y COMPRIS VERS LE MÊME DOMAINE. Le § 20 n'assortit cette règle d'aucune
    //    clause « autre domaine » : un destinataire dicté par un courrier lu
    //    reste dicté quand l'envoi part par le même adaptateur.
    expect(passees).toEqual([]);
  });

  it("rougit sur un témoin fabriqué : sans marquage, l'argument de gouvernance passe", () => {
    // Le témoin prouve que le rouge vient du MARQUAGE et non de la seule
    // présence d'un argument de gouvernance — sans lui, la garde refuserait
    // toute pose de créneau, y compris dans une session vierge.
    const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
    const verdict = etape11Provenance(contexte({ index, gouvernance: true }));
    expect(verdict.issue).toBe("autorise");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — la SATURATION : bornée et annoncée, jamais un silence
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — l'index est borné en durée ET en taille, et sa saturation s'annonce", () => {
  it("rougit sur un témoin fabriqué : une borne qui ne peut pas mordre est refusée", () => {
    // Une garde qui ne peut pas échouer n'existe pas. Un plafond à zéro, une
    // durée nulle : l'index resterait vide, `domainesMarquants()` rendrait
    // toujours `[]`, et `taille()` afficherait zéro — le « signal positif » du
    // § 20 devenu un mensonge.
    expect(() => new IndexProvenanceMemoire({ plafondSessions: 0 })).toThrow(RangeError);
    expect(() => new IndexProvenanceMemoire({ plafondExtraits: 0 })).toThrow(RangeError);
    expect(() => new IndexProvenanceMemoire({ ttlMs: 0 })).toThrow(RangeError);
    expect(() => new IndexProvenanceMemoire({ ttlMs: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });

  it("saturé en SESSIONS : dégrade en « provenance indéterminée », et le DIT", () => {
    const horloge = horlogeFigee();
    const index = new IndexProvenanceMemoire({
      plafondSessions: 2,
      maintenant: horloge.maintenant,
    });

    index.marquer(SESSION_A, DOMAINE_LECTURE, [empreinteExtrait("a")]);
    horloge.avancerDe(1_000);
    index.marquer(SESSION_B, DOMAINE_LECTURE, [empreinteExtrait("b")]);
    horloge.avancerDe(1_000);
    // La troisième déborde : `SESSION_A` est évincée.
    index.marquer(SESSION_C, DOMAINE_LECTURE, [empreinteExtrait("c")]);

    const etat = index.etat();
    console.info(
      `[garde saturation sessions] ${String(etat.sessions)} session(s) retenue(s) sur un ` +
        `plafond de ${String(etat.plafondSessions)}, ${String(etat.sessionsEvincees)} évincée(s), ` +
        `indéterminé = ${String(etat.indetermine)}, ${String(etat.extraits)} extrait(s) indexé(s)`,
    );

    expect(etat.sessionsEvincees).toBe(1);
    expect(etat.indetermine).toBe(true);
    expect(etat.sessions).toBe(2);

    // ⚠️ LE POINT DE LA GARDE : une session dont la marque a été perdue — ou une
    //    session dont on ne sait plus rien — n'est PAS traitée comme propre.
    const domaines = index.domainesMarquants(SESSION_A);
    expect(domaines).toContain(DOMAINE_INDETERMINE);

    const verdict = etape11Provenance(contexte({ index, sessionId: SESSION_A, libre: true }));
    expect(verdict.issue).toBe("refuse");

    // ⚠️ ET L'INDÉTERMINATION EST BORNÉE : une dégradation définitive devient un
    //    mur permanent, et un mur permanent finit désarmé. Au-delà de la durée
    //    de marquage, ce qui a été évincé aurait expiré de toute façon.
    horloge.avancerDe(TTL_MARQUAGE_MS + 1);
    const apres = index.etat();
    console.info(
      `[garde saturation levée] indéterminé = ${String(apres.indetermine)}, ` +
        `${String(apres.sessions)} session(s) restante(s), ` +
        `${String(apres.extraits)} extrait(s)`,
    );
    expect(apres.indetermine).toBe(false);
    expect(index.domainesMarquants(SESSION_A)).toEqual([]);
    expect(etape11Provenance(contexte({ index, sessionId: SESSION_A })).issue).toBe("autorise");
  });

  it("saturé en EMPREINTES : la marque de domaine SURVIT, et les refus se comptent", () => {
    const index = new IndexProvenanceMemoire({
      plafondExtraits: 2,
      maintenant: horlogeFigee().maintenant,
    });

    index.marquer(SESSION, DOMAINE_LECTURE, [
      empreinteExtrait("un"),
      empreinteExtrait("deux"),
      empreinteExtrait("trois"),
      empreinteExtrait("quatre"),
    ]);

    const etat = index.etat();
    console.info(
      `[garde saturation empreintes] ${String(etat.extraits)} extrait(s) indexé(s) sur un ` +
        `plafond de ${String(etat.plafondExtraits)}, ` +
        `${String(etat.empreintesRefusees)} empreinte(s) refusée(s), ` +
        `${String(index.domainesMarquants(SESSION).length)} domaine(s) marquant(s)`,
    );

    expect(etat.extraits).toBe(2);
    expect(etat.empreintesRefusees).toBe(2);
    // ⚠️ CE QUI COMPTE POUR LA DÉCISION SURVIT. L'étape 11 ne lit aucune
    //    empreinte : elle lit des DOMAINES. Sacrifier une empreinte ne coûte
    //    rien ; sacrifier la marque de domaine coûterait la garde entière.
    expect(index.domainesMarquants(SESSION)).toEqual([DOMAINE_LECTURE]);
    expect(etape11Provenance(contexte({ index, libre: true })).issue).toBe("refuse");
    // Et la saturation d'empreintes ne dégrade PAS la provenance : rien n'est
    // devenu indéterminé, parce que rien de décisif n'a été perdu.
    expect(etat.indetermine).toBe(false);
  });

  it("borne la marque en DURÉE : au-delà du TTL, l'index retombe à zéro", () => {
    const horloge = horlogeFigee();
    const index = new IndexProvenanceMemoire({ maintenant: horloge.maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait(EXTRAIT_LU)]);

    expect(index.taille()).toBe(1);
    expect(etape11Provenance(contexte({ index })).issue).toBe("refuse");

    // Juste avant l'échéance : la marque tient encore.
    horloge.avancerDe(TTL_MARQUAGE_MS - 1);
    expect(index.taille()).toBe(1);
    expect(etape11Provenance(contexte({ index })).issue).toBe("refuse");

    // Une milliseconde plus tard : elle a expiré.
    horloge.avancerDe(2);
    console.info(
      `[garde durée] TTL de marquage ${String(TTL_MARQUAGE_MS)} ms — ` +
        `${String(index.taille())} extrait(s) après échéance, ` +
        `${String(index.domainesMarquants(SESSION).length)} domaine(s) marquant(s)`,
    );
    expect(index.taille()).toBe(0);
    expect(index.domainesMarquants(SESSION)).toEqual([]);
    expect(etape11Provenance(contexte({ index })).issue).toBe("autorise");
  });

  it("repousse l'échéance à chaque nouvelle lecture marquée", () => {
    const horloge = horlogeFigee();
    const index = new IndexProvenanceMemoire({ maintenant: horloge.maintenant });
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait("premier")]);
    horloge.avancerDe(TTL_MARQUAGE_MS - 1_000);
    index.marquer(SESSION, DOMAINE_LECTURE, [empreinteExtrait("second")]);
    horloge.avancerDe(2_000);

    // Le premier extrait a expiré, la MARQUE DE DOMAINE non : une session qui
    // continue de lire reste marquée aussi longtemps qu'elle lit.
    expect(index.domainesMarquants(SESSION)).toEqual([DOMAINE_LECTURE]);
    expect(index.taille()).toBe(1);
  });

  it("garde des bornes par défaut qui ne sont ni nulles ni infinies", () => {
    console.info(
      `[garde bornes] TTL ${String(TTL_MARQUAGE_MS)} ms · ` +
        `${String(PLAFOND_EXTRAITS)} extraits · ${String(PLAFOND_SESSIONS)} sessions`,
    );
    for (const borne of [TTL_MARQUAGE_MS, PLAFOND_EXTRAITS, PLAFOND_SESSIONS]) {
      expect(Number.isFinite(borne)).toBe(true);
      expect(borne).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — la sentinelle ne peut collisionner avec aucun `adapterId`
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 11 — le domaine sentinelle ne peut pas être un adaptateur réel", () => {
  it("est refusé par le motif d'identifiant d'adaptateur, que les vrais passent", () => {
    const reels = [DOMAINE_LECTURE, DOMAINE_TIERS, "axionia", "zoho-mail-2"];
    const acceptes = reels.filter((id) => MOTIF_ID_ADAPTATEUR.test(id));

    console.info(
      `[garde sentinelle] ${String(reels.length)} identifiant(s) réel(s) confronté(s) au motif, ` +
        `${String(acceptes.length)} accepté(s) ; sentinelle acceptée = ` +
        `${String(MOTIF_ID_ADAPTATEUR.test(DOMAINE_INDETERMINE))}`,
    );

    // Plancher-témoin : sans identifiants réels acceptés, le motif pourrait tout
    // refuser et la garde serait verte pour la pire des raisons.
    expect(acceptes).toEqual(reels);
    expect(acceptes.length).toBeGreaterThanOrEqual(4);
    expect(MOTIF_ID_ADAPTATEUR.test(DOMAINE_INDETERMINE)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — le marquage DÉRIVE de `marqueLaSession`, il ne le recopie pas
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — quelles `dataClass` marquent la session", () => {
  it("marque exactement `personal` et `sensitive`, et dit combien de classes mesurées", () => {
    const marquantes: DataClass[] = [];
    for (const classe of DATA_CLASSES) {
      const index = new IndexProvenanceMemoire({ maintenant: horlogeFigee().maintenant });
      const marquee = marquerResultat(index, {
        sessionId: SESSION,
        adapterId: DOMAINE_LECTURE,
        dataClass: classe,
        empreintes: [empreinteExtrait(EXTRAIT_LU)],
      });
      // La mesure porte sur l'EFFET, pas sur le retour : un `marquerResultat`
      // qui rendrait `true` sans rien indexer serait indiscernable ici sans ça.
      if (marquee && index.domainesMarquants(SESSION).length > 0) marquantes.push(classe);
    }

    console.info(
      `[garde marquage] ${String(DATA_CLASSES.length)} classe(s) mesurée(s), ` +
        `${String(marquantes.length)} marquante(s) : ${marquantes.join(", ")}`,
    );

    expect(DATA_CLASSES.length).toBeGreaterThanOrEqual(4);
    expect(marquantes).toEqual(["personal", "sensitive"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 7 — les deux booléens se dérivent du SCHÉMA, jamais de la valeur
// ─────────────────────────────────────────────────────────────────────────────

/** Un schéma d'entrée FERMÉ (§ 09), tel qu'un manifeste le porte. */
function schema(proprietes: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    properties: proprietes,
    required: Object.keys(proprietes),
    additionalProperties: false,
  };
}

describe("étape 11 — la dérivation porte sur le SCHÉMA, jamais sur la valeur", () => {
  it("reconnaît un champ de texte libre, et annonce ce qu'elle a inspecté", () => {
    const analyse = analyserArgumentsDuSchema(
      schema({
        query: { type: "string" },
        limit: { type: "integer" },
        statut: { type: "string", enum: ["ouvert", "clos"] },
        messageId: { type: "string" },
      }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[garde dérivation] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) ` +
        `dans ${String(analyse.sousSchemasInspectes)} sous-schéma(s) ; ` +
        `${String(analyse.libres.length)} champ(s) libre(s) : ` +
        analyse.libres.map((champ) => champ.nom).join(", "),
    );

    // Plancher-témoin : quatre propriétés confrontées. Zéro rendrait
    // `porteUnArgumentLibre` faux pour n'avoir rien regardé.
    expect(analyse.proprietesInspectees).toBe(4);
    expect(analyse.sousSchemasInspectes).toBeGreaterThanOrEqual(1);
    // ✅ **ADR 0015 — `messageId` EST DÉSORMAIS RETENU, ET C'EST LA DÉCISION.**
    //    Ce schéma le déclarait `idFields`, et l'étape 11 l'en exonérait : ce seul
    //    mot, écrit dans un manifeste — donc dans un dépôt tiers — éteignait la garde
    //    d'exfiltration du § 20. La fonction ne lit plus la déclaration : un
    //    `{"type":"string"}` nu est un texte libre, qu'un adaptateur l'appelle `query`
    //    ou `messageId`.
    //
    //    Le remède est chez l'adaptateur, en une ligne de Zod — `z.string().uuid()`,
    //    ou un `pattern` ancré — et c'est un progrès en soi : un identifiant sans
    //    forme déclarée est aussi un identifiant que le schéma d'entrée ne valide pas.
    expect(analyse.libres.map((champ) => champ.nom)).toEqual(["query", "messageId"]);
    expect(analyse.porteUnArgumentLibre).toBe(true);
    expect(analyse.schemaIllisible).toBe(false);
  });

  it("ne retient QUE ce que le SCHÉMA referme — une déclaration n'y peut plus rien", () => {
    // ✅ **ADR 0015 — CE TEST A CHANGÉ D'OBJET, PAS DE CAMP.** Il s'appelait « ne
    //    retient ni un identifiant DÉCLARÉ, ni une énumération, ni un `format` » et
    //    mêlait deux choses : quatre fermetures que le SCHÉMA porte, et une
    //    cinquième que l'ADAPTATEUR se contentait d'affirmer. La cinquième a
    //    disparu ; les quatre autres sont intactes, et ce sont elles seules que ce
    //    test mesure désormais. `messageId` est donc écrit ici REFERMÉ PAR SON
    //    SCHÉMA, c'est-à-dire dans la forme que l'ADR 0015 demande aux adaptateurs
    //    réels du § 27 et du § 28.
    const analyse = analyserArgumentsDuSchema(
      schema({
        messageId: { type: "string", format: "uuid" },
        statut: { type: "string", enum: ["ouvert", "clos"] },
        jour: { type: "string", format: "date" },
        reference: { type: "string", pattern: "^[A-Z]{3}-\\d{4}$" },
        page: { type: "integer" },
      }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[garde dérivation fermée] ${String(analyse.proprietesInspectees)} propriété(s) ` +
        `inspectée(s), ${String(analyse.libres.length)} libre(s)`,
    );

    expect(analyse.proprietesInspectees).toBe(5);
    expect(analyse.libres).toEqual([]);
    expect(analyse.porteUnArgumentLibre).toBe(false);
  });

  it("ADR 0015 — le MÊME schéma, `messageId` laissé NU, redevient surveillé", () => {
    // ⚠️ **LE CLIQUET DU TEST PRÉCÉDENT, ET IL NE SE DÉDUIT PAS DE LUI.** Sans
    //    lui, « zéro champ libre » serait indiscernable de « la dérivation ne
    //    regarde plus rien ». Un seul mot change entre les deux schémas — le
    //    `format: "uuid"` — et c'est bien le SCHÉMA, et lui seul, qui referme.
    //    Ce couple rougirait le jour où l'exonération par déclaration
    //    reviendrait, sous ce nom ou sous un autre.
    const analyse = analyserArgumentsDuSchema(
      schema({
        messageId: { type: "string" },
        statut: { type: "string", enum: ["ouvert", "clos"] },
        page: { type: "integer" },
      }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[cliquet ADR 0015] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s), ` +
        `${String(analyse.libres.length)} libre(s) : ` +
        analyse.libres.map((champ) => champ.nom).join(", "),
    );

    expect(analyse.proprietesInspectees).toBe(3);
    expect(analyse.libres.map((champ) => champ.nom)).toEqual(["messageId"]);
    expect(analyse.porteUnArgumentLibre).toBe(true);
  });

  it("descend dans les sous-objets — une racine fermée ne suffit pas", () => {
    // Un champ libre logé dans `options.notes` est aussi exfiltrant qu'à la
    // racine. Le parcours est celui de `core/adapter-kit/fermeture.ts`, importé
    // et non réécrit : un applicateur ajouté là-bas est vu ici le jour même.
    const analyse = analyserArgumentsDuSchema(
      schema({
        // Refermé PAR SON SCHÉMA (ADR 0015) : nu, il entrerait lui aussi dans
        // `libres` et brouillerait ce que ce test mesure — LA DESCENTE.
        messageId: { type: "string", format: "uuid" },
        options: schema({ notes: { type: "string" } }),
      }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[garde dérivation profondeur] ${String(analyse.sousSchemasInspectes)} sous-schéma(s) ` +
        `visité(s), ${String(analyse.proprietesInspectees)} propriété(s), ` +
        `libre(s) : ${analyse.libres.map((champ) => champ.chemin).join(", ")}`,
    );

    expect(analyse.sousSchemasInspectes).toBeGreaterThanOrEqual(2);
    expect(analyse.libres.map((champ) => champ.nom)).toEqual(["notes"]);
    expect(analyse.porteUnArgumentLibre).toBe(true);
  });

  it("retient un TABLEAU de textes libres — la porte à côté", () => {
    const analyse = analyserArgumentsDuSchema(
      schema({ tags: { type: "array", items: { type: "string" } } }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );
    expect(analyse.libres.map((champ) => champ.nom)).toEqual(["tags"]);
  });

  it("rougit FAIL-CLOSED sur un schéma illisible, et le dit", () => {
    // Témoin fabriqué : un schéma cyclique, comme un manifeste venu d'un dépôt
    // tiers pourrait en porter. Ne pas savoir lire n'est pas « rien à signaler ».
    const cyclique: Record<string, unknown> = { type: "object" };
    cyclique["properties"] = cyclique;

    const analyse = analyserArgumentsDuSchema(cyclique, AUCUN_CHAMP_DE_GOUVERNANCE);

    console.info(
      `[garde schéma illisible] illisible = ${String(analyse.schemaIllisible)}, ` +
        `${String(analyse.proprietesInspectees)} propriété(s) inspectée(s), ` +
        `libre = ${String(analyse.porteUnArgumentLibre)}, ` +
        `gouvernance = ${String(analyse.porteUnArgumentDeGouvernance)}`,
    );

    expect(analyse.schemaIllisible).toBe(true);
    expect(analyse.porteUnArgumentLibre).toBe(true);
    expect(analyse.porteUnArgumentDeGouvernance).toBe(true);
  });

  it("traite un schéma vide comme LIBRE plutôt que comme inoffensif", () => {
    // Un schéma sans propriété n'a rien à dire — mais un appel qui n'a rien à
    // dire n'existe pas non plus. Ce qu'il faut éviter, c'est qu'un schéma
    // absent ou anodin fabrique un `false` qui ouvre la porte : le compte
    // annoncé (`proprietesInspectees`) est ce qui le distingue.
    const analyse = analyserArgumentsDuSchema({ type: "object" }, AUCUN_CHAMP_DE_GOUVERNANCE);
    expect(analyse.proprietesInspectees).toBe(0);
    expect(analyse.porteUnArgumentLibre).toBe(false);
    // ⚠️ C'est ici que se lit la borne : `false` avec ZÉRO propriété inspectée
    //    n'est pas la même chose que `false` avec quatre. L'appelant qui ne
    //    regarderait que le booléen ne verrait pas la différence.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 8 — les cinq familles d'arguments de gouvernance du § 20
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 20 — les cinq familles d'arguments de gouvernance sont NOMMÉES", () => {
  it("retient au moins un champ par famille, et dit combien de motifs ont servi", () => {
    const temoins: Readonly<Record<string, string>> = {
      "niveau de politique": "policyLevel",
      TTL: "ttl",
      "bascule d'outil": "enabled",
      "destinataire d'un envoi": "to",
      "créneau posé": "slotStart",
    };

    const famillesTouchees = new Set<string>();
    let confrontes = 0;
    for (const [famille, champ] of Object.entries(temoins)) {
      confrontes += 1;
      const trouvee = familleDeGouvernance(champ);
      if (trouvee !== null) famillesTouchees.add(trouvee);
      expect(trouvee, `${champ} → ${famille}`).toBe(famille);
    }

    console.info(
      `[garde gouvernance familles] ${String(confrontes)} champ(s) témoin(s) confronté(s) à ` +
        `${String(NOMBRE_MOTIFS_GOUVERNANCE)} motif(s) répartis en ` +
        `${String(FAMILLES_GOUVERNANCE.length)} famille(s) ; ` +
        `${String(famillesTouchees.size)} famille(s) touchée(s)`,
    );

    // Plancher-témoin : les CINQ familles que le § 20 énumère en toutes lettres.
    expect(FAMILLES_GOUVERNANCE.length).toBe(5);
    expect(famillesTouchees.size).toBe(FAMILLES_GOUVERNANCE.length);
    expect(NOMBRE_MOTIFS_GOUVERNANCE).toBeGreaterThanOrEqual(FAMILLES_GOUVERNANCE.length);
  });

  it("retient les QUATRE graphies d'un même nom — `camelCase` compris", () => {
    // ⚠️ DÉFAUT MESURÉ, PAS PRÉCAUTION. Les motifs s'ancrent à des séparateurs,
    //    et le `camelCase` n'en porte aucun : `slot`, `slot_start` et
    //    `slot-start` mordaient, `slotStart` PASSAIT. Une garde qui couvre trois
    //    graphies sur quatre donne l'apparence d'un périmètre maîtrisé.
    const graphies = ["slot", "slot_start", "slot-start", "slotStart"];
    const retenues = graphies.filter((nom) => familleDeGouvernance(nom) !== null);

    console.info(
      `[garde graphies] ${String(graphies.length)} graphie(s) confrontée(s), ` +
        `${String(retenues.length)} retenue(s) ; ` +
        `segmentations : ${graphies.map((nom) => segmenterNom(nom)).join(", ")}`,
    );

    expect(graphies.length).toBe(4);
    expect(retenues).toEqual(graphies);
    // Les autres familles, sur leur forme `camelCase`.
    expect(familleDeGouvernance("policyLevel")).toBe("niveau de politique");
    expect(familleDeGouvernance("expiresAt")).toBe("TTL");
    expect(familleDeGouvernance("sendTo")).toBe("destinataire d'un envoi");
  });

  it("rougit sur un témoin fabriqué : un champ anodin n'est retenu par aucune famille", () => {
    // Sans ce témoin, une famille dont le motif serait devenu `/.*/` retiendrait
    // tout, et la garde précédente resterait verte.
    for (const anodin of ["query", "messageId", "page", "corps"]) {
      expect(familleDeGouvernance(anodin), anodin).toBeNull();
    }
  });

  it("dérive `porteUnArgumentDeGouvernance` du schéma, et annonce les champs retenus", () => {
    const analyse = analyserArgumentsDuSchema(
      schema({
        query: { type: "string" },
        recipients: { type: "array", items: { type: "string" } },
      }),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[garde gouvernance dérivée] ${String(analyse.proprietesInspectees)} propriété(s) ` +
        `confrontée(s) à ${String(analyse.motifsAppliques)} motif(s) ; ` +
        `retenue(s) : ${analyse.gouvernance.map((c) => `${c.nom} (${c.famille ?? "?"})`).join(", ")}`,
    );

    expect(analyse.proprietesInspectees).toBe(2);
    expect(analyse.motifsAppliques).toBe(NOMBRE_MOTIFS_GOUVERNANCE);
    expect(analyse.gouvernance.map((champ) => champ.nom)).toEqual(["recipients"]);
    expect(analyse.porteUnArgumentDeGouvernance).toBe(true);
  });
});
