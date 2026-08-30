/**
 * axion-ops — `core/profiles/`
 *
 * L'ÉNUMÉRATION FERMÉE DES PROFILS et le BUDGET D'OUTILS du § 14.
 *
 * C'est ici qu'un adaptateur importe, et nulle part ailleurs :
 *
 * ```ts
 * import { declarerProfils, type ToolContext } from "core/profiles/index.js";
 *
 * profiles: declarerProfils(["dev", "admin"]),   // ✅
 * profiles: declarerProfils(["facturation"]),    // ❌ erreur de COMPILATION
 * ```
 *
 * `ToolContext` exporté ici est la forme RESSERRÉE — `ToolContext<ProfileName>`.
 * Un adaptateur qui importerait la forme générique de `core/types.js` perdrait
 * la fermeture, et c'est justement la seule garde du budget qui morde dès le
 * lot 1 (§ 14).
 */

export {
  ErreurValeurNonCanonique,
  jsonCanonique,
  octetsCanoniques,
  octetsUtf8,
} from "./canonique.js";

export {
  PLAFOND_PROFILS,
  PROFILES,
  PROFILES_VERSION,
  PROFILE_NAMES,
  declarerProfils,
  empreinteProfils,
  estProfil,
  exigerProfil,
  trierProfils,
} from "./profiles.js";

export type { Profil, ProfileName, ProfilsDeclares, ToolContext } from "./profiles.js";

export {
  CIBLE_TOKENS_DEFINITIONS,
  CODE_REFUS_PROFIL,
  ETAPE_REFUS_PROFIL,
  PLAFOND_OCTETS_DEFINITIONS,
  PLAFOND_OUTILS_PAR_PROFIL,
  PLAFOND_TOKENS_DEFINITIONS,
  RATIO_OCTETS_PAR_TOKEN_PROVISOIRE,
  estServi,
  mesurerBudgetProfil,
  mesurerTousLesProfils,
  octetsDeLaDefinition,
  outilsServis,
  plafondOctetsDepuisRatio,
  profilLeMoinsExposant,
  projectionServieParDefaut,
  reduitStrictement,
  verifierNombreDeProfils,
} from "./budget.js";

export type {
  Anomalie,
  DefinitionOutil,
  OptionsBudget,
  PoidsOutil,
  VerdictBudget,
  VerdictGlobal,
} from "./budget.js";
