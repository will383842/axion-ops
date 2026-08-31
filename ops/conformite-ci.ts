/**
 * `ops/conformite-ci.ts` — LA PORTE DU HARNAIS DE CONFORMITÉ, EN CHAÎNE.
 *
 * ═══ CE QUE CETTE ÉTAPE DÉCIDE ═══
 *
 * `core/adapter-kit/conformite.ts` porte les neuf contrôles du § 09 et sait
 * les appliquer à UN adaptateur. Il ne dit pas SUR QUELS adaptateurs il doit
 * tourner — et c'est là que se loge le défaut : un harnais qu'on lance sur les
 * adaptateurs qu'on a pensé à lui donner est vert le jour où l'on en oublie un.
 *
 * Cette étape dérive l'ensemble à couvrir de DEUX sources indépendantes, et
 * exige qu'elles coïncident :
 *
 *  · les dossiers réellement présents sous `adapters/` — ce qui est LÀ ;
 *  · les entrées d'`adapters.lock.json` — ce qu'un humain a RELU et ÉPINGLÉ.
 *
 * Un dossier sans entrée de verrou est un adaptateur que personne n'a relu ; une
 * entrée sans dossier est un verrou qui épingle un fantôme. Les deux sont des
 * échecs, et aucun ne se voit si l'on se contente d'itérer sur une seule liste.
 *
 * ⚠️ ELLE ANNONCE SES DEUX COMPTES, Y COMPRIS QUAND ILS SONT NULS. Le socle n'a
 *    aujourd'hui AUCUN adaptateur : le harnais ne mesure donc rien, et l'étape
 *    l'écrit en toutes lettres plutôt que de rendre un vert qui se lirait
 *    « conformité vérifiée ». C'est le défaut mesuré ailleurs dans ce dépôt —
 *    un contrôle vert parce qu'il ne regarde rien.
 *
 * ⚠️ ÉCART SIGNALÉ AU RAPPORT : le § 09 fixe le CONTRAT d'un adaptateur, pas la
 *    disposition de ses fichiers. La convention retenue ici — un adaptateur est
 *    un dossier `adapters/<id>/` — est donc une DÉCISION de ce dépôt, pas une
 *    lecture du cahier des charges. Elle est écrite ici, à un seul endroit.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Le dossier des adaptateurs, dérivé d'`import.meta.url` — jamais codé en dur. */
function dossierDesAdaptateurs(): string {
  return fileURLToPath(new URL("../adapters/", import.meta.url));
}

/** Le verrou versionné dans le socle. Absent tant qu'aucun adaptateur n'existe. */
function cheminDuVerrou(): string {
  return fileURLToPath(new URL("../core/registry/adapters.lock.json", import.meta.url));
}

/** Les dossiers d'adaptateurs présents, triés. */
function adaptateursPresents(): readonly string[] {
  const dossier = dossierDesAdaptateurs();
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((nom) => !nom.startsWith(".") && statSync(`${dossier}${nom}`).isDirectory())
    .sort();
}

/** Les identifiants épinglés par le verrou, triés. Liste vide si le verrou n'existe pas. */
function adaptateursEpingles(): readonly string[] {
  const chemin = cheminDuVerrou();
  if (!existsSync(chemin)) return [];
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (brut === null || typeof brut !== "object") return [];
  const entrees: unknown = (brut as Record<string, unknown>)["adapters"];
  if (!Array.isArray(entrees)) return [];
  return entrees
    .map((entree: unknown) => {
      if (entree === null || typeof entree !== "object") return "";
      // ⚠️ On n'appelle PAS `String()` sur une valeur inconnue : un objet y
      //    deviendrait « [object Object] », c'est-à-dire un identifiant
      //    d'adaptateur parfaitement plausible qu'aucun dossier ne porterait.
      //    Le verrou est un document venu du dépôt ; rien n'y est cru sur parole.
      const id: unknown = (entree as Record<string, unknown>)["id"];
      return typeof id === "string" ? id : "";
    })
    .filter((id) => id.length > 0)
    .sort();
}

function principale(): number {
  const presents = adaptateursPresents();
  const epingles = adaptateursEpingles();

  process.stdout.write(
    `[conformité] ${String(presents.length)} adaptateur(s) présent(s) sous \`adapters/\` ` +
      `(${presents.length > 0 ? presents.join(", ") : "aucun"}), ` +
      `${String(epingles.length)} épinglé(s) au verrou ` +
      `(${epingles.length > 0 ? epingles.join(", ") : "aucun"})\n`,
  );

  const sansVerrou = presents.filter((id) => !epingles.includes(id));
  const sansDossier = epingles.filter((id) => !presents.includes(id));
  let anomalies = 0;

  for (const id of sansVerrou) {
    anomalies += 1;
    process.stderr.write(
      `[conformité] adaptateur « ${id} » présent mais ABSENT DU VERROU : personne ne l'a relu, ` +
        "et le socle ne sait pas quelle version il admettrait. Ajoutez-le à " +
        "`core/registry/adapters.lock.json` dans un commit du socle, après revue.\n",
    );
  }
  for (const id of sansDossier) {
    anomalies += 1;
    process.stderr.write(
      `[conformité] adaptateur « ${id} » épinglé au verrou mais SANS DOSSIER sous \`adapters/\` : ` +
        "le verrou épingle un fantôme, et le harnais ne tournera jamais dessus.\n",
    );
  }

  if (anomalies > 0) return 1;

  if (presents.length === 0) {
    process.stdout.write(
      "[conformité] 0 adaptateur mesuré. Le harnais du § 09 n'a rien éprouvé — ce n'est PAS " +
        "une conformité, c'est un compte à zéro. Ses NEUF CONTRÔLES restent gardés par " +
        "`core/adapter-kit/conformite.spec.ts`, qui les applique à des adaptateurs témoins " +
        "fabriqués défectueux.\n",
    );
    return 0;
  }

  process.stdout.write(
    `[conformité] les ${String(presents.length)} adaptateur(s) présent(s) sont tous épinglés.\n`,
  );
  return 0;
}

process.exitCode = principale();
