/**
 * `defineAdapter()` — la DSL d'écriture, fermée sur l'énumération des profils.
 *
 * ═══ POURQUOI UN KIT PLUTÔT QU'UNE FONCTION NUE ═══
 *
 * Le § 14 nomme « la seule garde du budget qui ne dépende d'aucun adaptateur
 * pour exister » : **fermer l'énumération des profils**, de sorte qu'un profil
 * inconnu devienne une ERREUR DE COMPILATION chez l'adaptateur.
 *
 * Cette énumération vit dans `core/profiles/`, qui appartient à un autre
 * module. Deux mauvaises réponses, écartées :
 *
 *  · la RECOPIER ici — deux sources de vérité, et la garde cesse de mordre au
 *    premier profil ajouté d'un seul côté ;
 *  · exporter un `defineAdapter` générique ouvert sur `string` — l'échappatoire
 *    annule la garde pour quiconque l'emprunte, volontairement ou non.
 *
 * La réponse retenue : le kit **reçoit** l'énumération, une fois, et la propage
 * en type ET en valeur. `creerAdapterKit(PROFILE_NAMES)` rend un
 * `defineAdapter` dont le champ `profiles` n'accepte que ces valeurs, et la
 * liste sert aussi à la vérification au build. Aucune liste n'est écrite ici.
 *
 * Le contrat attendu de `core/profiles/` est déclaré dans `profils.ts` — ce
 * module ne l'importe pas, il code CONTRE lui.
 *
 * ═══ USAGE, CHEZ L'ADAPTATEUR ═══
 *
 * ```ts
 * import { PROFILE_NAMES } from "../../core/profiles/index.js";
 * import { creerAdapterKit } from "../../core/adapter-kit/index.js";
 *
 * const { defineAdapter, definirOutil } = creerAdapterKit(PROFILE_NAMES);
 *
 * export default defineAdapter({
 *   id: "axionia",
 *   version: "1.0.0",
 *   mode: "fédéré",
 *   profiles: ["dev", "admin"],   // « courier » ne compile pas
 *   secrets: [],                   // fédéré ⇒ obligatoirement vide
 *   tools: [ … ],
 * });
 * ```
 */

import { construireManifeste, empreinteDuManifeste, texteDuManifeste } from "./manifest.js";
import type { Manifeste } from "./manifest.js";
import { definirOutil } from "./types.js";
import type { DefinitionAdaptateur, DefinitionOutil, SpecOutil } from "./types.js";
import { verifierEnumerationProfils } from "./profils.js";
import type { SceauProfils } from "./profils.js";
import type { ZodType } from "zod/v4";

/**
 * Un adaptateur écrit : sa définition, et de quoi produire son manifeste.
 *
 * `manifeste()` est PARESSEUX à dessein. La définition doit pouvoir être
 * importée par le processus de l'adaptateur (qui, lui, appelle les `handler`)
 * sans payer la conversion de tous les schémas en JSON Schema à chaque
 * démarrage. Seule la commande de build appelle `manifeste()`.
 */
export interface AdaptateurEcrit<TProfile extends string> {
  readonly definition: DefinitionAdaptateur<TProfile>;
  /** Construit le manifeste, ou lève `ErreurManifeste`. */
  manifeste(): Manifeste;
  /** Le texte canonique du manifeste — c'est lui qui est haché. */
  texte(): string;
  /** L'empreinte à épingler dans `adapters.lock.json`. */
  empreinte(): string;
}

/** Ce que rend `creerAdapterKit()`. */
export interface AdapterKit<TProfile extends string> {
  /** La DSL du § 09, fermée sur l'énumération des profils. */
  defineAdapter(definition: DefinitionAdaptateur<TProfile>): AdaptateurEcrit<TProfile>;
  /** Écrit un outil en gardant le typage de ses schémas. */
  definirOutil<TEntree extends ZodType, TSortie extends ZodType>(
    outil: SpecOutil<TProfile, TEntree, TSortie>,
  ): DefinitionOutil<TProfile>;
  /** L'énumération reçue, re-exposée pour le harnais. */
  readonly profilsConnus: readonly TProfile[];
  /** Le sceau reçu, re-exposé pour le harnais (ADR 0004). */
  readonly sceauProfils: SceauProfils;
}

/**
 * Crée le kit d'écriture d'un adaptateur.
 *
 * ```ts
 * import { PROFILE_NAMES, SCEAU_PROFILS } from "../../core/profiles/index.js";
 * const { defineAdapter } = creerAdapterKit(PROFILE_NAMES, SCEAU_PROFILS);
 * ```
 *
 * @param profilsConnus l'énumération FERMÉE de `core/profiles/`. C'est le seul
 *        endroit où elle entre : ce module n'en garde aucune copie.
 * @param sceauProfils le SCEAU de cette énumération — version et empreinte
 *        (ADR 0004). Il entre dans le manifeste produit, et le registre le
 *        confronte au sceau du socle : c'est ce qui rend visible qu'un
 *        adaptateur fédéré a été construit contre une énumération périmée.
 *        Il est REÇU et non recalculé, pour la même raison que l'énumération.
 */
export function creerAdapterKit<TProfile extends string>(
  profilsConnus: readonly TProfile[],
  sceauProfils: SceauProfils,
): AdapterKit<TProfile> {
  // ⚠️ LE REFUS DÉRIVE, IL NE RECOPIE PLUS — ADR 0004, jumeau cousu au lot 2.
  //    Ces trois lignes portaient leur propre comparaison (`length === 0`) alors
  //    que `verifierEnumerationProfils` existait à côté, sans aucun appelant de
  //    production. Deux écritures d'une même règle, dont l'une était plus
  //    ÉTROITE : un profil au nom VIDE ou un profil EN DOUBLE traversait ici sans
  //    un mot, et la garde du § 14 comptait ensuite un profil de plus qu'il n'en
  //    existe. On refuse désormais sur la même règle que l'analyse de manifeste.
  //
  //    Un kit sans profil accepterait `profiles: []` partout et la garde du § 14
  //    mesurerait zéro en restant verte : le refus est à la CONSTRUCTION, avant
  //    qu'un seul adaptateur ait pu s'écrire contre lui.
  const anomalies = verifierEnumerationProfils(profilsConnus);
  if (anomalies.length > 0) {
    throw new Error(
      `creerAdapterKit : l'énumération des profils est inutilisable — ` +
        `${String(anomalies.length)} anomalie(s) : ${anomalies.join(" ")} ` +
        "La garde du § 14 n'aurait plus rien à fermer, et un profil inconnu " +
        "passerait sans un mot.",
    );
  }

  return {
    profilsConnus,
    sceauProfils,
    definirOutil,
    defineAdapter(definition) {
      let cache: Manifeste | null = null;
      const produire = (): Manifeste => {
        cache ??= construireManifeste(definition, profilsConnus, sceauProfils);
        return cache;
      };
      return {
        definition,
        manifeste: produire,
        texte: () => texteDuManifeste(produire()),
        empreinte: () => empreinteDuManifeste(produire()),
      };
    },
  };
}
