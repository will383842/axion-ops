/**
 * `adapters.lock.json` — l'épinglage par empreinte (§ 09).
 *
 * ═══ CE QUE LE VERROU EST ═══
 *
 * Le socle ne consomme jamais une fonction `handler` distante : il consomme le
 * MANIFESTE, épinglé par empreinte SHA dans ce fichier, versionné DANS LE
 * SOCLE, et appelle l'endpoint en JSON-RPC.
 *
 * D'où l'unique règle d'admission : le manifeste servi par un adaptateur est
 * hachouré tel qu'il arrive, et cette empreinte doit être IDENTIQUE à celle
 * épinglée ici. Un adaptateur qui publie un outil de plus, change un `effect`,
 * ou élargit un `dataClass` produit une autre empreinte — et n'est pas admis
 * tant qu'un humain n'a pas mis le verrou à jour dans un commit du socle.
 *
 * ═══ LA GARDE DU § 14, QUI EST DANS CE FICHIER ═══
 *
 * « La garde annonce le nombre de manifestes qu'elle a lus et échoue si ce
 * nombre est inférieur à celui du `adapters.lock.json`. Sans ce compte, la
 * garde vit dans la CI du socle pendant que les outils qui la feraient rougir
 * vivent dans deux autres dépôts — elle mesure zéro et reste verte. »
 *
 * C'est `verifierCouvertureDuVerrou()`.
 */

import { z } from "zod/v4";

import { DATA_CLASSES } from "../types.js";
import { MOTIF_EMPREINTE, empreinteCanonique, versValeurJson } from "../adapter-kit/json.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import type { Verdict } from "../adapter-kit/verdict.js";
import { AUTH_MODES, ENTREE_VERROU_TEMOIN, VERSION_VERROU } from "./types.js";
import type { EntreeVerrou, VerrouAdaptateurs } from "./types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Les clés que le socle se réserve — DÉRIVÉES, jamais écrites
// ═════════════════════════════════════════════════════════════════════════════

let clesManifesteMemo: readonly string[] | null = null;

/**
 * Les clés de premier niveau d'un manifeste, DÉRIVÉES d'un manifeste témoin
 * réellement produit par le kit.
 *
 * Aucune liste n'est écrite : on fabrique un adaptateur minimal, on lui fait
 * produire son manifeste, et on lit ses clés. Le jour où le manifeste gagne un
 * champ, cette fonction le connaît sans qu'on la retouche — et le champ cesse
 * automatiquement d'être « réservé au socle ».
 */
export function clesDuManifeste(): readonly string[] {
  if (clesManifesteMemo !== null) return clesManifesteMemo;

  // Les méthodes sont appelées SUR le kit, jamais déstructurées : une méthode
  // détachée de son objet perd son `this`, et un kit qui gagnerait un jour un
  // état interne se casserait ici en silence.
  // Le sceau témoin n'est PAS celui du socle, et n'a pas à l'être : ce kit ne
  // sert qu'à DÉRIVER LA LISTE DES CLÉS d'un manifeste, jamais à en admettre
  // un. Y passer `SCEAU_PROFILS` ferait croire à un lien qui n'existe pas.
  const kitTemoin = creerAdapterKit(["temoin"] as const, {
    version: "0.0.0",
    empreinte: "0".repeat(64),
  });
  const temoin = kitTemoin.defineAdapter({
    id: "temoin",
    version: "0.0.0",
    mode: "hébergé",
    profiles: ["temoin"],
    secrets: [],
    tools: [
      kitTemoin.definirOutil({
        name: "temoin",
        version: "0.0.0",
        description: "Adaptateur témoin — sert uniquement à dériver les clés du manifeste.",
        effect: "read",
        dataClass: "none",
        idempotency: "n/a",
        pagination: "none",
        input: z.object({}).strict(),
        output: z.object({}).strict(),
        maxBytes: 1,
        compaction: { free: [], tier2: [], aggregateBy: null },
        idFields: [],
        fixtureMax: "temoin.json",
        handler: () => ({}),
      }),
    ],
  });

  clesManifesteMemo = Object.keys(temoin.manifeste()).sort();
  return clesManifesteMemo;
}

/**
 * Les clés qu'un manifeste n'a PAS le droit de porter : celles du verrou qui ne
 * sont pas des clés de manifeste.
 *
 * `trustTier` et `maxDataClass` en font partie, et c'est tout l'objet du § 12 :
 * « fixés côté socle à l'enregistrement, jamais lus dans le manifeste — sinon
 * le dépôt public se décerne son propre niveau de confiance ». Mais la liste
 * n'est pas écrite pour eux : elle est la DIFFÉRENCE entre deux formes, si bien
 * qu'un champ ajouté au verrou devient réservé le jour même.
 */
export function clesReserveesAuSocle(): readonly string[] {
  const duManifeste = new Set(clesDuManifeste());
  return Object.keys(ENTREE_VERROU_TEMOIN)
    .filter((cle) => !duManifeste.has(cle))
    .sort();
}

// ═════════════════════════════════════════════════════════════════════════════
//  Lecture d'un verrou
// ═════════════════════════════════════════════════════════════════════════════

const SchemaEntreeVerrou = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    mode: z.enum(["hébergé", "fédéré"]),
    manifestSha: z.string().regex(MOTIF_EMPREINTE),
    trustTier: z.number().int().min(0),
    maxDataClass: z.enum(DATA_CLASSES),
    endpoint: z.string().min(1).nullable(),
    authMode: z.enum(AUTH_MODES),
    secretRef: z.string().min(1).nullable(),
  })
  .strict();

const SchemaVerrou = z
  .object({
    lockVersion: z.literal(VERSION_VERROU),
    adapters: z.array(SchemaEntreeVerrou),
  })
  .strict();

/** Le résultat d'une lecture de verrou : le verrou, ou les anomalies. */
export interface LectureVerrou {
  readonly verrou: VerrouAdaptateurs | null;
  readonly verdict: Verdict;
}

/**
 * Lit et valide un `adapters.lock.json`.
 *
 * Le verrou est de confiance — il est versionné dans le socle — mais il est
 * écrit à la main, et une empreinte tronquée ou un id en double y feraient plus
 * de dégâts qu'un manifeste hostile : ils ouvriraient l'admission au lieu de la
 * fermer.
 *
 * ⚠️ CE QUE CETTE FONCTION NE DIT PAS, ET QU'UN APPELANT DOIT LIRE AILLEURS.
 *    Un verrou `{ lockVersion: 1, adapters: [] }` est VALIDE : elle rend un
 *    `verrou` non nul et ZÉRO anomalie. C'est délibéré — un `adapters.lock.json`
 *    vide est légitime tant qu'aucun adaptateur n'est épinglé, et faire échouer
 *    la lecture casserait l'amorçage.
 *
 *    La conséquence est qu'un appelant qui teste `verrou !== null` ou
 *    `anomalies.length === 0` voit du VERT sur un verrou qui n'épingle rien.
 *    Seul `verdict.plancher = 1` distingue ce cas, et RIEN dans le type
 *    n'oblige à le lire.
 *
 *    LA LECTURE CORRECTE DU RETOUR EST `estVert(verdict)`, jamais `verrou`
 *    seul. Le rattrapage en aval existe — `verifierCouvertureDuVerrou` refuse
 *    un verrou qui ne couvre aucun adaptateur attendu — mais il est en aval :
 *    il ne protège pas un appelant qui lit `lireVerrou` directement.
 *
 * ⛔ ARBITRAGE À PORTER À WILL (voir `docs/ETAT.md`) : soit la garde en aval
 *    suffit et cette phrase est le contrat, soit `verrou` devient inaccessible
 *    sans passer par le verdict — ce qui se force par le type, et c'est la
 *    seule forme qu'un appelant ne peut pas contourner par distraction.
 */
export function lireVerrou(brut: unknown): LectureVerrou {
  const anomalies: string[] = [];
  const analyse = SchemaVerrou.safeParse(brut);

  if (!analyse.success) {
    for (const probleme of analyse.error.issues) {
      const chemin = probleme.path.length > 0 ? probleme.path.join(".") : "(racine)";
      anomalies.push(`verrou, ${chemin} : ${probleme.message}`);
    }
    return { verrou: null, verdict: { mesures: 0, plancher: 1, anomalies } };
  }

  const entrees = analyse.data.adapters;
  const vus = new Set<string>();
  for (const entree of entrees) {
    if (vus.has(entree.id)) {
      anomalies.push(
        `verrou : deux entrées portent l'id « ${entree.id} ». L'admission lirait la ` +
          "première et ignorerait la seconde — donc une empreinte épinglée sans effet.",
      );
    }
    vus.add(entree.id);

    // Le raccordement doit être cohérent avec le mode, faute de quoi le socle
    // ne sait pas comment joindre l'adaptateur, ou croit devoir le joindre.
    if (entree.mode === "fédéré") {
      if (entree.endpoint === null) {
        anomalies.push(`verrou, « ${entree.id} » : mode fédéré sans endpoint.`);
      }
      if (entree.authMode !== "secret-partage") {
        anomalies.push(
          `verrou, « ${entree.id} » : mode fédéré avec authMode « ${entree.authMode} ». ` +
            "La route `/api/mcp` d'un adaptateur exige un secret partagé (§ 08).",
        );
      }
      if (entree.secretRef === null) {
        anomalies.push(
          `verrou, « ${entree.id} » : mode fédéré sans secretRef. Sans secret partagé logé ` +
            "dans `ops_secret`, la route ne peut ni authentifier le socle ni rendre 503.",
        );
      }
    } else {
      if (entree.endpoint !== null) {
        anomalies.push(
          `verrou, « ${entree.id} » : mode hébergé avec un endpoint. Un adaptateur hébergé ` +
            "vit DANS le processus du socle — un endpoint y désignerait un appel réseau " +
            "que personne n'a décidé.",
        );
      }
      if (entree.authMode !== "en-processus") {
        anomalies.push(
          `verrou, « ${entree.id} » : mode hébergé avec authMode « ${entree.authMode} ».`,
        );
      }
    }
  }

  const verdict: Verdict = { mesures: entrees.length, plancher: 1, anomalies };
  if (anomalies.length > 0) return { verrou: null, verdict };
  return { verrou: { lockVersion: analyse.data.lockVersion, adapters: entrees }, verdict };
}

/** L'entrée du verrou portant cet id, ou `undefined`. */
export function entreePourId(verrou: VerrouAdaptateurs, id: string): EntreeVerrou | undefined {
  return verrou.adapters.find((entree) => entree.id === id);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Empreinte et admission
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'empreinte d'un manifeste REÇU, calculée sur le document tel qu'il arrive.
 *
 * ⚠️ Le calcul porte sur la valeur BRUTE, avant toute validation et avant tout
 *    filtrage de clés. C'est essentiel : si l'on hachait la forme validée, un
 *    manifeste porteur d'un champ en trop verrait ce champ retiré AVANT le
 *    hachage, et son empreinte coïnciderait avec celle épinglée. Le verrou
 *    certifierait alors un document qu'il n'a jamais vu.
 */
export function empreinteDuManifesteRecu(brut: unknown): string {
  // Même canonicalisation que celle du kit, appliquée à un document qui n'est
  // pas de confiance : c'est la seule façon que les deux côtés du verrou
  // calculent la même chose.
  return empreinteCanonique(versValeurJson(brut, "manifeste reçu"));
}

/**
 * L'empreinte d'un manifeste PRODUIT — pour la commande qui met le verrou à
 * jour. Elle passe par le même chemin que l'empreinte d'un manifeste reçu, sans
 * quoi les deux pourraient diverger sans qu'aucun test ne le voie.
 */
export function empreinteDuManifesteProduit(manifeste: Manifeste): string {
  return empreinteDuManifesteRecu(manifeste);
}

// ═════════════════════════════════════════════════════════════════════════════
//  La garde du § 14 — la couverture du verrou
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie que la garde a lu AU MOINS autant de manifestes que le verrou en
 * épingle, et les nomme quand il en manque.
 *
 * C'est la garde que le § 14 décrit mot pour mot. Elle ne mesure pas un
 * booléen : elle rend le compte lu, le plancher (le nombre d'entrées du
 * verrou), et la liste des adaptateurs manquants — parce qu'un « il en manque
 * un » sans le nom oblige à recompter à la main.
 */
export function verifierCouvertureDuVerrou(
  verrou: VerrouAdaptateurs,
  manifestesLus: readonly { readonly id: string }[],
): Verdict {
  const anomalies: string[] = [];
  const lus = new Set(manifestesLus.map((manifeste) => manifeste.id));

  if (verrou.adapters.length === 0) {
    // ⚠️ LE CAS QUE CETTE GARDE LAISSAIT PASSER, ET QUI EST EXACTEMENT CELUI QUE
    // LE § 14 DÉCRIT. Sur un verrou vide, le plancher rendu vaut ZÉRO : la
    // mesure `0 >= 0` est satisfaite et `estVert()` rend VRAI après n'avoir lu
    // AUCUN manifeste, sans une anomalie. Un `adapters.lock.json` vidé, mal
    // chargé, ou lu au mauvais chemin ne se voyait alors nulle part.
    // Même cliquet que le contrôle 9 du § 09, qui refuse déjà un plancher-témoin
    // posé à zéro : « un plancher qui ne peut pas être franchi par le bas ne
    // garde rien ».
    anomalies.push(
      "le verrou n'épingle AUCUN adaptateur : le plancher de cette garde vaudrait zéro, et " +
        "elle serait verte après n'avoir rien mesuré. Vérifier que l'`adapters.lock.json` " +
        "chargé est bien celui du socle. S'il est légitimement vide — aucun adaptateur " +
        "encore épinglé —, ne pas exécuter cette garde plutôt que la laisser conclure sur " +
        "le vide.",
    );
  }

  const manquants = verrou.adapters.map((entree) => entree.id).filter((id) => !lus.has(id));
  if (manquants.length > 0) {
    anomalies.push(
      `${String(manquants.length)} adaptateur(s) épinglé(s) au verrou dont AUCUN manifeste ` +
        `n'a été lu — ${manquants.join(", ")}. La garde tourne dans la CI du socle pendant ` +
        "que les outils qui la feraient rougir vivent dans d'autres dépôts : sans ce " +
        "compte, elle mesure zéro et reste verte.",
    );
  }

  const epingles = new Set(verrou.adapters.map((entree) => entree.id));
  const inconnus = [...lus].filter((id) => !epingles.has(id));
  if (inconnus.length > 0) {
    anomalies.push(
      `manifeste(s) lu(s) sans entrée au verrou — ${inconnus.join(", ")}. Un adaptateur non ` +
        "épinglé n'est pas admissible : rien ne dit quelle version a été relue par un humain.",
    );
  }

  return { mesures: lus.size, plancher: verrou.adapters.length, anomalies };
}
