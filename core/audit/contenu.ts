/**
 * `core/audit/contenu.ts` — CE QUI N'ENTRE JAMAIS DANS LE JOURNAL (§ 31).
 *
 * « Jamais de corps ni d'extraits dans les journaux. » Une phrase de cahier des
 * charges n'empêche rien : il faut une garde, elle doit s'exécuter À L'ÉCRITURE,
 * et un manquement doit être une écriture REFUSÉE — pas un avertissement dans
 * un fichier que personne ne relit.
 *
 * MÉTHODE — on ne cherche pas « du contenu » (impossible à définir), on exige
 * une FORME pour chaque champ couvert. Une phrase, un extrait d'e-mail, un nom
 * de personne : tous portent des espaces, ou dépassent une longueur d'identifiant.
 * Aucun des quinze champs couverts n'a de raison légitime d'en porter.
 *
 * La table des formes est un `Record<ChampCouvert, Forme>` : ajouter un champ
 * couvert sans lui déclarer de forme est une ERREUR DE COMPILATION. C'est la
 * dérivation, pas une seconde liste tenue à la main.
 */

import { APPEL_STEPS, EFFECTS, POLICY_LEVELS } from "../types.js";
import type { ChampCouvert } from "./canonique.js";
import { CHAMPS_COUVERTS } from "./canonique.js";
import type { ContenuLigne } from "./vocabulaire.js";
import { DECISIONS, FORME_EMPREINTE, OUTCOMES } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Les formes admises
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un identifiant : aucun caractère d'espacement, aucun caractère de contrôle,
 * et une longueur bornée. C'est ce que ni une phrase, ni un extrait de corps,
 * ni une adresse postale ne peuvent satisfaire.
 *
 * `\p{C}` couvre les caractères de contrôle ET les non-attribués ; `\s` couvre
 * l'espacement Unicode, saut de ligne compris. Le drapeau `u` est obligatoire :
 * sans lui, `\p{...}` n'est pas une classe Unicode mais un littéral, et la garde
 * mesurerait autre chose que ce qu'elle annonce.
 */
const FORME_IDENTIFIANT = /^[^\s\p{C}]+$/u;

/**
 * Au-delà de ce nombre de segments purement alphabétiques séparés par `-`, `_`
 * ou `.`, ce n'est plus un identifiant composite : c'est une phrase francisée.
 *
 * POURQUOI CE CONTRÔLE EXISTE. `FORME_IDENTIFIANT` ne refuse que ce qui porte
 * un espace, un caractère de contrôle, ou dépasse la longueur maximale. Deux
 * formes ordinaires passaient donc sans un mot : une phrase dont les espaces
 * ont été remplacés par des tirets, et une adresse e-mail. Or `recordIds` et
 * `partialSources` sont les DEUX SEULES colonnes du journal dont la valeur
 * n'est pas fabriquée par le socle — elles arrivent d'un `Succes` produit par
 * un adaptateur, dans le cas du CRM depuis un dépôt PUBLIC.
 *
 * Six segments laissent passer un identifiant composite bavard
 * (`crm.contact.v2.fr.actif.42`) et crèvent une phrase, qui en tire une dizaine.
 */
const MAX_SEGMENTS_ALPHABETIQUES = 6;

type Forme =
  | { readonly genre: "énumération"; readonly valeurs: readonly string[] }
  | { readonly genre: "empreinte" }
  | { readonly genre: "identifiant"; readonly maxCar: number }
  | {
      readonly genre: "liste-identifiants";
      readonly maxCar: number;
      readonly maxElements: number;
    }
  | { readonly genre: "entier-positif"; readonly max: number }
  | { readonly genre: "horodatage" }
  | { readonly genre: "étape-ou-null" };

/**
 * La forme admise de CHAQUE champ couvert.
 *
 * Les bornes ne sont pas des chiffres ronds jetés là : elles sont juste au-delà
 * de ce que le socle produit légitimement, pour qu'un texte d'humain les crève.
 * Un nom d'outil du § 28 fait une trentaine de caractères ; 128 laisse de la
 * marge à un adaptateur bavard sans laisser passer une phrase.
 */
const FORMES: Record<ChampCouvert, Forme> = {
  at: { genre: "horodatage" },
  principal: { genre: "identifiant", maxCar: 128 },
  sessionId: { genre: "identifiant", maxCar: 128 },
  tool: { genre: "identifiant", maxCar: 128 },
  toolVersion: { genre: "identifiant", maxCar: 64 },
  adapterVersion: { genre: "identifiant", maxCar: 64 },
  // Les quatre énumérations sont DÉRIVÉES de leur source, jamais recopiées :
  // ajouter un `effect` au § 09 élargit cette garde sans la retoucher.
  effect: { genre: "énumération", valeurs: EFFECTS },
  policyLevel: { genre: "énumération", valeurs: POLICY_LEVELS },
  decision: { genre: "énumération", valeurs: DECISIONS },
  outcome: { genre: "énumération", valeurs: OUTCOMES },
  stepDenied: { genre: "étape-ou-null" },
  argHash: { genre: "empreinte" },
  // § 12, règle 3 — pseudonymes, donc bornés et sans texte libre. 512 identifiants
  // au maximum : au-delà, ce n'est plus une trace d'appel, c'est un export.
  // 64 caractères, pas 128 : un pseudonyme du § 12, règle 3, y tient largement
  // (un cuid en fait 25, un UUID 36), et chaque caractère de marge en plus est
  // de la place pour une phrase.
  recordIds: { genre: "liste-identifiants", maxCar: 64, maxElements: 512 },
  // § 13.2 — noms de sources, et l'encodage de clôture du § 31 (`cloture.ts`),
  // dont le plus long champ fait 88 caractères.
  partialSources: { genre: "liste-identifiants", maxCar: 256, maxElements: 64 },
  durationMs: { genre: "entier-positif", max: 86_400_000 },
};

/** Les numéros d'étape admis, DÉRIVÉS de `APPEL_STEPS` (§ 11). */
const ETAPES_ADMISES: ReadonlySet<number> = new Set(APPEL_STEPS.map((etape) => etape.numero));

// ═════════════════════════════════════════════════════════════════════════════
//  Le verdict
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que rend la garde. `champsInspectes` n'est pas décoratif : une garde qui
 * inspecte zéro champ est verte pour la pire des raisons, et c'est ce compte,
 * pas la couleur, que les tests lisent.
 */
export interface VerdictContenu {
  /** MESURÉ dans la boucle, jamais `CHAMPS_COUVERTS.length` rendu de confiance. */
  readonly champsInspectes: number;
  readonly valeursInspectees: number;
  readonly anomalies: readonly string[];
}

/** Levée à l'écriture quand une ligne porte autre chose que des formes admises. */
export class ErreurContenuJournal extends Error {
  readonly anomalies: readonly string[];

  constructor(anomalies: readonly string[]) {
    super(`§ 31 — la ligne d'audit porte du contenu interdit : ${anomalies.join(" · ")}`);
    this.name = "ErreurContenuJournal";
    this.anomalies = anomalies;
  }
}

function verifierIdentifiant(
  champ: string,
  valeur: unknown,
  maxCar: number,
  anomalies: string[],
): void {
  if (typeof valeur !== "string") {
    anomalies.push(`${champ} : attendu une chaîne, reçu ${typeof valeur}`);
    return;
  }
  if (valeur.length === 0) {
    anomalies.push(`${champ} : vide`);
    return;
  }
  if (valeur.length > maxCar) {
    anomalies.push(
      `${champ} : ${String(valeur.length)} caractères, au-delà de ${String(maxCar)} — ` +
        `un journal ne porte pas de texte libre`,
    );
    return;
  }
  if (!FORME_IDENTIFIANT.test(valeur)) {
    anomalies.push(
      `${champ} : porte un espace ou un caractère de contrôle — signature d'un extrait de contenu`,
    );
    return;
  }
  if (valeur.includes("@")) {
    anomalies.push(
      `${champ} : porte un « @ » — forme d'une adresse e-mail. Le § 12, règle 3, veut un ` +
        "PSEUDONYME : aucun pseudonyme n'a de raison légitime de porter une adresse.",
    );
    return;
  }
  const segments = valeur.split(/[-_.]/u).filter((segment) => /^\p{L}+$/u.test(segment));
  if (segments.length > MAX_SEGMENTS_ALPHABETIQUES) {
    anomalies.push(
      `${champ} : ${String(segments.length)} segments alphabétiques séparés par « - », « _ » ou ` +
        `« . », au-delà de ${String(MAX_SEGMENTS_ALPHABETIQUES)} — c'est la forme d'une PHRASE ` +
        "dont les espaces ont été remplacés, pas celle d'un identifiant composite.",
    );
  }
}

/**
 * Vérifie qu'une ligne ne porte QUE des formes admises.
 *
 * Ce n'est pas un détecteur de données personnelles — il n'en existe pas de
 * fiable. C'est une garde de FORME, et c'est plus fort : elle ne demande pas
 * « est-ce personnel ? », elle demande « cette valeur pouvait-elle légitimement
 * sortir du socle ? ». Un extrait de corps échoue quelle que soit sa langue.
 */
export function verifierAucunContenu(ligne: ContenuLigne): VerdictContenu {
  const anomalies: string[] = [];
  let champsInspectes = 0;
  let valeursInspectees = 0;

  for (const champ of CHAMPS_COUVERTS) {
    const forme = FORMES[champ];
    const valeur: unknown = ligne[champ];
    // Compté DANS la boucle, jamais rendu depuis `CHAMPS_COUVERTS.length` : un
    // compte annoncé sans être mesuré est exactement le vert que ce chantier
    // refuse. Ici, une sortie prématurée ferait baisser le nombre.
    champsInspectes += 1;

    switch (forme.genre) {
      case "horodatage": {
        valeursInspectees += 1;
        if (!(valeur instanceof Date) || !Number.isFinite(valeur.getTime())) {
          anomalies.push(`${champ} : horodatage invalide`);
        }
        break;
      }
      case "énumération": {
        valeursInspectees += 1;
        if (typeof valeur !== "string" || !forme.valeurs.includes(valeur)) {
          // On NE RECOPIE PAS la valeur fautive dans le message : une erreur ne
          // fuit jamais de contenu (§ 15, première règle), et c'est justement une
          // valeur suspecte. On dit ce qui était attendu, c'est ce qui aide.
          anomalies.push(`${champ} : hors de l'énumération fermée (${forme.valeurs.join(" | ")})`);
        }
        break;
      }
      case "empreinte": {
        valeursInspectees += 1;
        if (typeof valeur !== "string" || !FORME_EMPREINTE.test(valeur)) {
          // § 12, règle 2 — la garde ne peut pas distinguer un HMAC d'un SHA nu
          // (même forme, 64 hex). Elle refuse en revanche tout ce qui n'est pas
          // une empreinte : une valeur d'argument glissée là est visible.
          anomalies.push(`${champ} : n'est pas une empreinte hexadécimale de 64 caractères`);
        }
        break;
      }
      case "identifiant": {
        valeursInspectees += 1;
        verifierIdentifiant(champ, valeur, forme.maxCar, anomalies);
        break;
      }
      case "liste-identifiants": {
        if (!Array.isArray(valeur)) {
          valeursInspectees += 1;
          anomalies.push(`${champ} : attendu une liste`);
          break;
        }
        const elements = valeur as readonly unknown[];
        if (elements.length > forme.maxElements) {
          anomalies.push(
            `${champ} : ${String(elements.length)} éléments, ` +
              `au-delà de ${String(forme.maxElements)}`,
          );
        }
        elements.forEach((element, index) => {
          valeursInspectees += 1;
          verifierIdentifiant(`${champ}[${String(index)}]`, element, forme.maxCar, anomalies);
        });
        break;
      }
      case "entier-positif": {
        valeursInspectees += 1;
        if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 0) {
          anomalies.push(`${champ} : attendu un entier positif`);
        } else if (valeur > forme.max) {
          anomalies.push(`${champ} : ${String(valeur)} au-delà de ${String(forme.max)}`);
        }
        break;
      }
      case "étape-ou-null": {
        valeursInspectees += 1;
        if (valeur !== null && !(typeof valeur === "number" && ETAPES_ADMISES.has(valeur))) {
          anomalies.push(
            `${champ} : ne désigne aucune des ${String(APPEL_STEPS.length)} étapes du § 11, ` +
              `et n'est pas nul`,
          );
        }
        break;
      }
    }
  }

  return { champsInspectes, valeursInspectees, anomalies };
}
