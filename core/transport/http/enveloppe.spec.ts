/**
 * `core/transport/http/enveloppe.spec.ts` — **LES TROIS VALEURS DU SOCLE
 * VOYAGENT HORS D'`input`, ET LE TYPE TIENT L'INVENTAIRE.**
 *
 * § 20 : la clé d'idempotence voyage HORS d'`input` — « la v5 la rendait
 * obligatoire sur `zoho.mail.send` alors qu'aucun champ ne la transportait ».
 * Le curseur (§ 13.1) et le jeton de confirmation (§ 20) suivent le même chemin.
 *
 * ⚠️ **CE QUE CETTE GARDE TIENT ET QUE LE COMPILATEUR NE TIENT PAS.** Le
 *    compilateur garantit qu'`AppelEntrant` ne porte ni `effect`, ni
 *    `dataClass`, ni `policyLevel`, ni habilitation, ni `sessionId` : un champ
 *    de plus ne compile pas. Il ne garantit RIEN sur ce que l'enveloppe met dans
 *    `input` — une lecture qui recopierait `_meta` dans les arguments, ou qui
 *    lirait la clé d'idempotence dans `arguments`, compilerait parfaitement.
 */

import { describe, expect, it } from "vitest";

import { CLES_META_DU_SOCLE, lireLEnveloppe } from "./enveloppe.js";

function enveloppe(params: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params });
}

describe("§ 20 — les valeurs de protocole voyagent dans `_meta`, jamais dans `arguments`", () => {
  it("extrait les trois, et laisse `input` intact", () => {
    const lecture = lireLEnveloppe(
      enveloppe({
        name: "demo.outil.envoyer",
        arguments: { destinataire: "pseudo-01", corps: "texte" },
        _meta: {
          [CLES_META_DU_SOCLE.idempotence]: "cle-0001",
          [CLES_META_DU_SOCLE.curseur]: "curseur-signe-0001",
          [CLES_META_DU_SOCLE.confirmation]: "jeton-de-confirmation-0001",
          "autre/extension": "ignorée",
        },
      }),
    );

    expect(lecture.genre).toBe("appel");
    if (lecture.genre !== "appel") return;

    console.info(
      `[enveloppe · _meta] ${String(Object.keys(CLES_META_DU_SOCLE).length)} valeur(s) du socle ` +
        `extraite(s) de « params._meta » · clé d'idempotence : ` +
        `${String(lecture.appel.idempotencyKey !== null)} · curseur : ` +
        `${String(lecture.appel.curseur !== null)} · jeton de confirmation : ` +
        `${String(lecture.appel.jetonDeConfirmation !== null)} · ` +
        `champs d'input : ${String(Object.keys(lecture.appel.input as object).length)}`,
    );

    expect(lecture.appel.idempotencyKey).toBe("cle-0001");
    expect(lecture.appel.curseur).toBe("curseur-signe-0001");
    expect(lecture.appel.jetonDeConfirmation).toBe("jeton-de-confirmation-0001");
    // ⚠️ `input` NE PORTE QUE LES ARGUMENTS. Recopier `_meta` dedans ferait
    //    échouer un schéma `.strict()` — à juste titre — et ferait porter à
    //    l'étape 8 un refus qui n'a rien à voir avec la charge utile.
    expect(lecture.appel.input).toEqual({ destinataire: "pseudo-01", corps: "texte" });
  });

  it("une clé d'idempotence rangée dans `arguments` n'est PAS lue — elle reste un argument", () => {
    // ⚠️ TÉMOIN DU § 20 : si la lecture allait la chercher là, un appelant
    //    obtiendrait l'idempotence en la glissant dans la charge utile, et le
    //    contrôle 7 du § 09 ne la verrait pas passer.
    const lecture = lireLEnveloppe(
      enveloppe({ name: "demo.outil.envoyer", arguments: { idempotencyKey: "contrebande" } }),
    );
    expect(lecture.genre).toBe("appel");
    if (lecture.genre !== "appel") return;

    console.info(
      `[enveloppe · contrebande] clé d'idempotence lue : ` +
        `${String(lecture.appel.idempotencyKey)} — elle reste dans « arguments », ` +
        "où l'étape 8 la refusera comme n'importe quel champ non déclaré.",
    );
    expect(lecture.appel.idempotencyKey).toBeNull();
    expect(lecture.appel.input).toEqual({ idempotencyKey: "contrebande" });
  });

  it("les trois valeurs sont NULLES quand `_meta` est absent — jamais inventées", () => {
    const lecture = lireLEnveloppe(enveloppe({ name: "demo.outil.lire" }));
    expect(lecture.genre).toBe("appel");
    if (lecture.genre !== "appel") return;

    const nulles = [
      lecture.appel.idempotencyKey,
      lecture.appel.curseur,
      lecture.appel.jetonDeConfirmation,
    ];
    console.info(
      `[enveloppe · absence] ${String(nulles.filter((v) => v === null).length)} valeur(s) sur ` +
        `${String(nulles.length)} rendue(s) nulle(s) · input : ${String(lecture.appel.input)}`,
    );
    expect(nulles).toEqual([null, null, null]);
    // `arguments` absent donne `undefined`, pas `{}` : c'est l'étape 8 qui
    // décide de ce qu'un schéma fait d'une charge absente, pas le transport.
    expect(lecture.appel.input).toBeUndefined();
  });
});
