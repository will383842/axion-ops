import { describe, expect, it } from "vitest";

import {
  ETATS_DU_VERROU,
  ETATS_SANS_EXCLUSIVITE,
  FORME_INSTANCE_ID,
  OCTETS_INSTANCE_ID,
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
  deciderDemarrageMonoInstance,
  decisionsPourTousLesEtatsDuVerrou,
  frapperInstance,
  statutHealthcheckPourVerrou,
} from "./verrou.js";

/**
 * GARDE G2 DE L'ADR 0018 — **LA DÉCISION COUVRE LES QUATRE ÉTATS, ET ELLE EST
 * DÉRIVÉE.**
 *
 * L'ADR 0018 nomme la garde et son témoin :
 *
 *   « G2 — la décision couvre les QUATRE états. Dérivée d'`ETATS_DU_VERROU`,
 *     jamais d'une liste écrite. → états confrontés · états qui démarrent. Le
 *     témoin qui la fait rougir : un état ajouté à `ETATS_DU_VERROU` sans
 *     décision — la garde le voit le jour même. »
 *
 * ⚠️ CE TÉMOIN-LÀ EST TENU PAR LE TYPE, ET C'EST MIEUX QU'UN TEST. Un cinquième
 *    état ajouté à `ETATS_DU_VERROU` rend `MESSAGE_DE_DEMARRAGE` incomplet, donc
 *    `tsc --noEmit` ROUGE, avant qu'aucun test ne tourne. Les gardes ci-dessous
 *    couvrent l'autre moitié : que la décision soit DÉRIVÉE et non recopiée, et
 *    que le compte soit annoncé plutôt que supposé.
 */

describe("ADR 0018 — l'arbitre de démarrage couvre les QUATRE états", () => {
  it("mesure les quatre états, et n'en trouve qu'UN qui démarre", () => {
    const decisions = decisionsPourTousLesEtatsDuVerrou();
    const demarrent = decisions.filter((decision) => decision.demarre);

    console.info(
      `[garde G2 · arbitre] ${String(decisions.length)} état(s) mesuré(s) — ` +
        `${String(demarrent.length)} démarre(nt) : ` +
        `${demarrent.map((decision) => decision.etat).join(", ") || "aucun"} · ` +
        `${String(decisions.length - demarrent.length)} refuse(nt)`,
    );

    // Le compte est DÉRIVÉ du tableau des états : ajouter un état allonge la
    // liste sans qu'aucune énumération ne soit à retoucher.
    expect(decisions.length).toBe(ETATS_DU_VERROU.length);
    expect(decisions.length, "les quatre états du § 20 sont bien déclarés").toBe(4);
    expect(demarrent.map((decision) => decision.etat)).toEqual(["tenu"]);
  });

  it("dérive `demarre` d'`ETATS_SANS_EXCLUSIVITE`, dans les deux sens", () => {
    let mesures = 0;
    for (const decision of decisionsPourTousLesEtatsDuVerrou()) {
      // L'équivalence, dans les DEUX sens : un socle démarre si et seulement si
      // son état n'est pas dans l'ensemble des états sans exclusivité. Un
      // booléen écrit à la main, lui, pourrait se désynchroniser en silence.
      expect(decision.demarre, decision.etat).toBe(!ETATS_SANS_EXCLUSIVITE.includes(decision.etat));
      mesures += 1;
    }

    console.info(
      `[garde G2 · dérivation] ${String(mesures)} état(s) mesuré(s), ` +
        `${String(ETATS_SANS_EXCLUSIVITE.length)} état(s) sans exclusivité : ` +
        ETATS_SANS_EXCLUSIVITE.join(", "),
    );

    expect(mesures).toBe(4);
    // Les trois refus. Un socle qui ne sait pas s'il est seul ne peut pas non
    // plus journaliser : le § 11 fait de l'écriture du journal un invariant
    // fail-closed, et le journal vit dans la même base.
    expect([...ETATS_SANS_EXCLUSIVITE].sort()).toEqual(["indisponible", "perdu", "refusé"]);
  });

  it("REFUSE les trois états sans exclusivité, `indisponible` compris", () => {
    let refus = 0;
    for (const etat of ETATS_SANS_EXCLUSIVITE) {
      const decision = deciderDemarrageMonoInstance(etat);
      expect(decision.demarre, etat).toBe(false);
      // Le processus ne vit pas : il n'y a AUCUN healthcheck à rendre. Un 503
      // ici confondrait « le socle est mort » et « le socle sert mal ».
      expect(decision.statutHealthcheck, etat).toBeNull();
      refus += 1;
    }

    console.info(`[garde G2 · refus] ${String(refus)} état(s) refusé(s) sur 4 confrontés`);
    expect(refus).toBe(3);
  });

  it("un verrou TENU démarre, et rend 200", () => {
    const decision = deciderDemarrageMonoInstance("tenu");

    expect(decision.demarre).toBe(true);
    expect(decision.statutHealthcheck).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
    expect(decision.etat).toBe("tenu");
  });
});

describe("ADR 0018 — ce que les messages disent, et ce qu'ils ne doivent JAMAIS dire", () => {
  /**
   * ⚠️ § 29, DÉPÔT PUBLIC. Ces messages sortent par le healthcheck et par les
   *    journaux d'exploitation. Un nom d'hôte, une adresse ou un `pid` y seraient
   *    publiés — c'est la règle que `InstanceDuSocle` porte déjà pour
   *    l'identifiant, et elle vaut aussi pour la prose.
   */
  it("aucun message ne porte d'identifiant d'infrastructure, et chacun nomme un geste", () => {
    const interdits = [/\bpid\b/iu, /\bhost(name)?\b/iu, /\b\d{1,3}(\.\d{1,3}){3}\b/u, /:\/\//u];
    const gestes = [/arrêter|ramener|redémarr|réparer|nominal/iu];
    let mesures = 0;
    const fautifs: string[] = [];

    for (const decision of decisionsPourTousLesEtatsDuVerrou()) {
      mesures += 1;
      for (const interdit of interdits) {
        if (interdit.test(decision.message)) fautifs.push(`${decision.etat} → ${interdit.source}`);
      }
      // § 25, deuxième règle : le message dit ce qu'il faut FAIRE ensuite.
      expect(
        gestes.some((geste) => geste.test(decision.message)),
        decision.etat,
      ).toBe(true);
      expect(decision.message.length, decision.etat).toBeGreaterThan(80);
    }

    console.info(
      `[garde messages] ${String(mesures)} message(s) confronté(s) à ` +
        `${String(interdits.length)} forme(s) interdite(s) — ` +
        `${String(fautifs.length)} manquement(s)${fautifs.length > 0 ? " : " + fautifs.join(" · ") : ""}`,
    );

    expect(mesures).toBe(4);
    expect(fautifs).toEqual([]);
  });

  it("SAIT DIRE NON — les mêmes formes interdites, sur une prose fabriquée", () => {
    // ⚠️ SANS CE TÉMOIN, la garde précédente serait verte le jour où les
    //    expressions ne trouveraient plus rien — parce qu'elles seraient
    //    fausses, et non parce que les messages seraient propres.
    const interdits = [/\bpid\b/iu, /\bhost(name)?\b/iu, /\b\d{1,3}(\.\d{1,3}){3}\b/u, /:\/\//u];
    const fabrique =
      "Verrou tenu par le pid 4211 sur host axion-01, base postgres://10.0.0.7:5432/ops.";
    const trouves = interdits.filter((interdit) => interdit.test(fabrique)).length;

    console.info(
      `[témoin messages] ${String(interdits.length)} forme(s) cherchée(s) sur une prose ` +
        `fabriquée — ${String(trouves)} trouvée(s)`,
    );

    // Les quatre pièges sont dans la phrase, et l'instrument les voit tous.
    expect(trouves).toBe(interdits.length);
  });
});

describe("ADR 0018 — le statut du healthcheck est DÉRIVÉ de l'état relu", () => {
  it("rend 503 sur les trois états sans exclusivité, 200 sur `tenu`", () => {
    const statuts = ETATS_DU_VERROU.map((etat) => ({
      etat,
      statut: statutHealthcheckPourVerrou(etat),
    }));
    const rouges = statuts.filter(
      (mesure) => mesure.statut === STATUT_HEALTHCHECK_VERROU_ABSENT,
    ).length;

    console.info(
      `[garde statut] ${String(statuts.length)} état(s) confronté(s) — ` +
        statuts.map((mesure) => `${mesure.etat}=${String(mesure.statut)}`).join(", ") +
        ` · ${String(rouges)} état(s) à ${String(STATUT_HEALTHCHECK_VERROU_ABSENT)}`,
    );

    expect(statuts.length).toBe(4);
    expect(rouges).toBe(3);
    expect(statutHealthcheckPourVerrou("tenu")).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
    // ⚠️ 200 pour un coffre VERROUILLÉ (§ 23), 503 pour un verrou PERDU : les
    //    deux états ne disent pas la même chose au déploiement, et faire rougir
    //    le premier apprendrait à ignorer le rouge.
    expect(STATUT_HEALTHCHECK_VERROU_TENU).not.toBe(STATUT_HEALTHCHECK_VERROU_ABSENT);
  });
});

describe("ADR 0018 — l'identité d'instance est OPAQUE et frappée à chaque fois", () => {
  it("frappe une identité de la forme attendue, différente à chaque exécution", () => {
    const combien = 32;
    const instant = new Date(Date.UTC(2026, 7, 31, 9, 0, 0));
    const frappes = Array.from({ length: combien }, () => frapperInstance(instant));
    const distincts = new Set(frappes.map((instance) => instance.instanceId));
    const horsForme = frappes.filter(
      (instance) => !FORME_INSTANCE_ID.test(instance.instanceId),
    ).length;

    console.info(
      `[garde identité] ${String(frappes.length)} identité(s) frappée(s), ` +
        `${String(distincts.size)} distincte(s), ${String(horsForme)} hors forme — ` +
        `${String(OCTETS_INSTANCE_ID)} octets attendus, soit ` +
        `${String(OCTETS_INSTANCE_ID * 2)} caractères`,
    );

    expect(frappes.length).toBe(combien);
    // Deux exécutions successives du même conteneur portent des identifiants
    // différents : c'est ce qui permet de voir qu'un processus a redémarré.
    expect(distincts.size).toBe(combien);
    expect(horsForme).toBe(0);
    // La forme EXCLUT mécaniquement un `pid`, un nom d'hôte ou une adresse.
    for (const instance of frappes.slice(0, 4)) {
      expect(instance.instanceId.length).toBe(OCTETS_INSTANCE_ID * 2);
      expect(instance.demarreeA.getTime()).toBe(instant.getTime());
    }
  });

  it("SAIT DIRE NON — la forme refuse un `pid`, un nom d'hôte et une adresse", () => {
    const fabriques = ["4211", "axion-01", "10.0.0.7", "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6", ""];
    const acceptes = fabriques.filter((valeur) => FORME_INSTANCE_ID.test(valeur));

    console.info(
      `[témoin forme] ${String(fabriques.length)} valeur(s) fabriquée(s) confrontée(s) — ` +
        `${String(acceptes.length)} acceptée(s)`,
    );

    // Y compris l'hexadécimal MAJUSCULE : la forme est ancrée aux deux bouts et
    // minuscule, sans quoi deux écritures du même identifiant se compteraient
    // comme deux instances.
    expect(acceptes).toEqual([]);
  });
});
