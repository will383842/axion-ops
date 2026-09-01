/**
 * `ops/depot-public.ts` — **UN FICHIER DE SECRET NE DOIT PAS POUVOIR ENTRER.**
 *
 * ═══ LE CONSTAT, ET POURQUOI LE CORRECTIF ÉVIDENT ÉTAIT LE MAUVAIS ═══
 *
 * Le répertoire de travail de ce dépôt PUBLIC porte un `.env` renseigné. Il est
 * ignoré et non suivi — donc rien n'est exposé —, mais il est à un `git add -f`
 * ou à une ligne de `.gitignore` de l'être.
 *
 * La recette proposait de **déplacer le fichier**. C'est le mauvais correctif,
 * pour deux raisons mesurables :
 *
 *  1. **un `.env` ignoré est la pratique normale de tout projet Node.** Le
 *     déplacer ne supprime pas le risque, il le déplace avec lui — dans un
 *     répertoire voisin où plus aucune règle ne le couvre ;
 *  2. **déplacer un fichier ne pose AUCUNE garde.** Le lendemain, un outil
 *     recrée un `.env` ici, et le dépôt est exactement là où il était, sans que
 *     rien ne l'ait dit.
 *
 * ⚠️ **LA DÉCISION (ADR 0042) : LE FICHIER RESTE OÙ IL EST, ET ON POSE LA GARDE
 *    QUI MANQUE.** C'est le motif de tout ce dossier — on ne déplace pas le
 *    risque, on le rend VISIBLE. La garde rougit dans les trois sens :
 *
 *  · un chemin de secret devient **SUIVI** par git (l'index, donc l'historique
 *    public, donc irrévocable) ;
 *  · un chemin de secret est **PRÉSENT et NON IGNORÉ** (un `git add .` suffit) ;
 *  · une **SONDE** cesse d'être ignorée — c'est ce qui arrive si quelqu'un
 *    retire la ligne `.env` de `.gitignore`, et ce contrôle-là ne demande pas
 *    que le fichier existe pour mordre.
 *
 * ⚠️ **CE MODULE NE LIT AUCUN FICHIER, N'APPELLE PAS GIT, ET NE VOIT AUCUNE
 *    VALEUR.** Il reçoit un état déjà constitué et rend des NOMS DE CHEMINS.
 *    C'est ce qui le rend éprouvable sur des états fabriqués — et c'est aussi
 *    ce qui garantit qu'aucun contenu de secret ne peut transiter par ici, ni
 *    donc paraître dans la sortie d'une chaîne d'intégration publique (§ 29).
 */

/** Un motif de chemin qui désigne un porteur de secret, et pourquoi. */
export interface MotifSensible {
  /** Un glob simple, confronté au chemin ENTIER et au nom de base. */
  readonly motif: string;
  /** Ce que ce motif attrape. Sans cela, personne ne saura s'il sert encore. */
  readonly pourquoi: string;
}

/**
 * LES MOTIFS, ET ILS SONT DÉLIBÉRÉMENT ÉTROITS.
 *
 * ⚠️ **PAS DE `*secret*`.** Ce dépôt porte `ops/secrets.ts`,
 *    `ops/verifier-secrets.ts` et leur garde : trois modules qui PARLENT de
 *    secrets sans en porter aucun. Un motif large les attraperait, la garde
 *    serait rouge au premier jour, et on la désarmerait dans la semaine — c'est
 *    la façon la plus sûre de se retrouver sans garde du tout. Ce qu'on cherche
 *    est un fichier qui PORTE une valeur, pas un fichier qui en parle.
 */
export const MOTIFS_SENSIBLES: readonly MotifSensible[] = [
  { motif: ".env", pourquoi: "l'environnement local — le cas mesuré sur ce dépôt" },
  { motif: ".env.*", pourquoi: "les variantes `.env.local`, `.env.production`, `.env.test`" },
  { motif: "*.pem", pourquoi: "une clé privée ou un certificat au format PEM" },
  { motif: "*.key", pourquoi: "une clé privée" },
  { motif: "*.p12", pourquoi: "un porte-clés PKCS#12" },
  { motif: "*.pfx", pourquoi: "un porte-clés PKCS#12, autre extension" },
  { motif: "*.jks", pourquoi: "un porte-clés Java" },
  { motif: "id_rsa", pourquoi: "une clé SSH privée" },
  { motif: "id_ed25519", pourquoi: "une clé SSH privée" },
  { motif: "*.secret", pourquoi: "un fichier déclaré secret par son extension" },
  { motif: "secrets.json", pourquoi: "un porte-secrets applicatif" },
  { motif: "secrets.y*ml", pourquoi: "un porte-secrets applicatif" },
  { motif: "credentials.json", pourquoi: "un jeu d'identifiants d'un service tiers" },
  { motif: "*-credentials.json", pourquoi: "un jeu d'identifiants d'un service tiers" },
  { motif: "service-account*.json", pourquoi: "une clé de compte de service" },
];

/**
 * LES CHEMINS QU'UN SUIVI NE FAIT PAS ROUGIR, ET LE MOTIF EST OBLIGATOIRE.
 *
 * ⚠️ **UNE EXEMPTION SANS MOTIF EST UNE PORTE.** Chaque ligne dit pourquoi le
 *    chemin ne porte PAS de valeur ; c'est ce qui empêche cette liste de
 *    devenir la voiture-balai de la garde.
 */
export const EXEMPTIONS: readonly MotifSensible[] = [
  {
    motif: ".env.example",
    pourquoi:
      "le gabarit public : des NOMS de variables et des valeurs de démonstration, jamais " +
      "une valeur réelle. Il est suivi PAR DESSEIN, et `.gitignore` le ré-inclut (`!`).",
  },
];

/**
 * LES SONDES — des chemins CANONIQUES dont on exige qu'ils restent ignorés,
 * **qu'ils existent ou non**.
 *
 * ⚠️ **C'EST LE SEUL DES TROIS CONTRÔLES QUI MORD SUR UNE MACHINE PROPRE.** Un
 *    dépôt fraîchement cloné ne porte aucun `.env` : les deux autres contrôles
 *    n'auraient alors rien à confronter, et la garde serait verte en ne
 *    regardant rien. Les sondes se confrontent aux règles d'ignorance
 *    elles-mêmes, si bien que retirer la ligne `.env` de `.gitignore` rougit
 *    **immédiatement**, y compris en intégration continue.
 */
export const SONDES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  "secrets.json",
  "id_rsa",
  "prive.pem",
];

/** L'état du dépôt, tel qu'un appelant l'a constitué. Aucun contenu, des chemins. */
export interface EtatDuDepot {
  /** Ce que git SUIT — l'index compris. Un secret ici est déjà irrévocable. */
  readonly suivis: readonly string[];
  /** Ce qui est présent, non suivi, et **non ignoré**. Un `git add .` l'emporte. */
  readonly nonSuivisNonIgnores: readonly string[];
  /** Le verdict d'ignorance des {@link SONDES}, sonde par sonde. */
  readonly sondes: readonly { readonly chemin: string; readonly ignore: boolean }[];
}

/** Ce que la garde rend. Des NOMBRES et des CHEMINS, jamais une couleur. */
export interface VerdictDuDepotPublic {
  /** Chemins réellement confrontés aux motifs. Un zéro rend la garde vacuous. */
  readonly cheminsConfrontes: number;
  /** Chemins suivis par git, part du total ci-dessus. */
  readonly suivisConfrontes: number;
  /** Motifs sensibles lus. À zéro motif, tout passerait. */
  readonly motifsLus: number;
  /** Sondes d'ignorance confrontées. À zéro, le troisième sens ne mord plus. */
  readonly sondesConfrontees: number;
  /** Chemins SUIVIS qui portent un motif sensible et ne sont pas exemptés. */
  readonly suivisSensibles: readonly string[];
  /** Chemins présents, sensibles, et qu'aucune règle d'ignorance ne couvre. */
  readonly presentsNonIgnores: readonly string[];
  /** Sondes qui ne sont plus ignorées — `.gitignore` a changé. */
  readonly sondesNonIgnorees: readonly string[];
  /** Chemins sensibles suivis mais EXEMPTÉS, nommés pour qu'on les voie. */
  readonly exemptes: readonly string[];
  readonly anomalies: readonly string[];
}

/** Échappe un texte pour l'insérer dans une expression régulière. */
function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, (caractere) => `\\${caractere}`);
}

/**
 * Un chemin porte-t-il ce motif ? Le glob est confronté au chemin ENTIER **et**
 * à son nom de base : `secrets.json` doit mordre à la racine comme au fond d'un
 * sous-dossier.
 */
export function porteLeMotif(chemin: string, motif: string): boolean {
  const forme = new RegExp(`^${echapper(motif).replace(/\\\*/g, "[^/]*")}$`);
  const base = chemin.slice(chemin.lastIndexOf("/") + 1);
  return forme.test(chemin) || forme.test(base);
}

/**
 * LA GARDE DU DÉPÔT PUBLIC — **fonction PURE de l'état qu'on lui remet.**
 *
 * ⚠️ ELLE ROUGIT DANS TROIS SENS, et le troisième est celui qu'on oublie : une
 *    garde qui ne regarderait que les fichiers PRÉSENTS serait verte sur une
 *    machine propre, c'est-à-dire précisément en intégration continue, c'est-à
 *    -dire là où elle est censée protéger.
 */
export function verifierLeDepotPublic(
  etat: EtatDuDepot,
  motifs: readonly MotifSensible[] = MOTIFS_SENSIBLES,
  exemptions: readonly MotifSensible[] = EXEMPTIONS,
): VerdictDuDepotPublic {
  const estSensible = (chemin: string): boolean =>
    motifs.some((motif) => porteLeMotif(chemin, motif.motif));
  const estExempte = (chemin: string): boolean =>
    exemptions.some((exemption) => porteLeMotif(chemin, exemption.motif));

  const sensiblesSuivis = etat.suivis.filter(estSensible);
  const suivisSensibles = sensiblesSuivis.filter((chemin) => !estExempte(chemin)).sort();
  const exemptes = sensiblesSuivis.filter(estExempte).sort();
  const presentsNonIgnores = etat.nonSuivisNonIgnores
    .filter(estSensible)
    .filter((chemin) => !estExempte(chemin))
    .sort();
  const sondesNonIgnorees = etat.sondes
    .filter((sonde) => !sonde.ignore)
    .map((sonde) => sonde.chemin)
    .sort();

  const anomalies: string[] = [];
  for (const chemin of suivisSensibles) {
    anomalies.push(
      `« ${chemin} » est SUIVI par git dans un dépôt PUBLIC — un secret entré dans l'index ` +
        "est dans l'historique, et l'en retirer ne le révoque pas : il faut révoquer la valeur",
    );
  }
  for (const chemin of presentsNonIgnores) {
    anomalies.push(
      `« ${chemin} » est présent, non suivi, et AUCUNE règle ne l'ignore — un « git add . » ` +
        "l'emporte dans le prochain commit sans que personne ne le voie passer",
    );
  }
  for (const chemin of sondesNonIgnorees) {
    anomalies.push(
      `« ${chemin} » n'est plus ignoré par git — la règle qui le couvrait a disparu de ` +
        ".gitignore. Ce contrôle mord même quand le fichier n'existe pas, et c'est le seul.",
    );
  }

  return {
    cheminsConfrontes: etat.suivis.length + etat.nonSuivisNonIgnores.length,
    suivisConfrontes: etat.suivis.length,
    motifsLus: motifs.length,
    sondesConfrontees: etat.sondes.length,
    suivisSensibles,
    presentsNonIgnores,
    sondesNonIgnorees,
    exemptes,
    anomalies,
  };
}
