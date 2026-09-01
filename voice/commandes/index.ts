/**
 * axion-ops — `voice/commandes/`
 *
 * LES COMMANDES HORS MODÈLE DU POSTE VOCAL (§ 30), et le tri du § 20.
 *
 * C'est la part du poste vocal qui ne demande NI micro NI modèle : de la logique
 * pure, sans réseau, sans base, sans horloge propre. C'est aussi celle qui porte
 * la sécurité — le § 32 en fait un critère de fin du lot 8 : « aller-retour
 * complet, interruptible ; "stop" coupe sans passer par le modèle ».
 *
 * ═══ LES QUATRE FICHIERS, ET CE QUE CHACUN TIENT ═══
 *
 *  · `grammaire.ts`      — l'ensemble FINI, TYPÉ, VERSIONNÉ des commandes. Une
 *                          commande inconnue est une erreur de COMPILATION.
 *  · `tri.ts`            — la règle du § 20, POSÉE à `reduitStrictement()` et à
 *                          `classerChangement()`. Jamais réécrite.
 *  · `reconnaissance.ts` — tolérante sur ce qui ne peut pas élargir, STRICTE sur
 *                          ce qui le peut. Même asymétrie qu'au § 20.
 *  · `journal.ts`        — le port du § 18. Déclaré, pas implémenté.
 *
 * ═══ L'ORDRE DES TROIS ÉTAGES, ET IL N'EST PAS INDIFFÉRENT ═══
 *
 *   transcription → `reconnaitre()` → `trier()` → `ligneDeCommande()`
 *                        ↑               ↑
 *          ne lit RIEN d'extérieur   a besoin de l'état
 *
 * `reconnaitre()` ne dépend d'aucun état : ni catalogue, ni base, ni politique.
 * C'est ce qui permet de reconnaître « stop » quand tout le reste est
 * injoignable. Le tri, lui, mesure — et quand il ne peut pas mesurer, il le
 * DIT (`mesureAveugle`) sans jamais adoucir son verdict.
 *
 * ═══ CE QUE CE DOSSIER NE FAIT PAS ═══
 *
 * Il n'exécute rien, n'interrompt rien, ne verrouille rien, n'écrit rien. Il
 * répond à trois questions et rend des NOMBRES : qu'a-t-on entendu, qu'est-ce
 * que ça change à la surface exposée, et que faut-il écrire au journal.
 */

export {
  COMMANDES,
  GRAMMAIRE_VERSION,
  NOMS_COMMANDES,
  PLAFOND_COMMANDES,
  SCEAU_GRAMMAIRE,
  commande,
  declarerCommandes,
  empreinteGrammaire,
  estCommande,
  exigerCommande,
  peutElargir,
  type Commande,
  type CommandesDeclarees,
  type EffetDeclare,
  type NomCommande,
  type SceauGrammaire,
} from "./grammaire.js";

export {
  CANAL_VOIX,
  CANAUX_QUI_CONFIRMENT,
  LA_VOIX_CONFIRME,
  REGIMES_DE_TRI,
  REGIME_DE_TRI_PAR_DEFAUT,
  SCOPE_GLOBAL,
  commandesQuiDementent,
  trier,
  trierToutes,
  verdictDeReduction,
  type EtatObserve,
  type ExigencesDeDesserrage,
  type RegimeDeTri,
  type Tri,
} from "./tri.js";

export {
  CHEVILLES,
  PLAFOND_CARACTERES_TRANSCRIPTION,
  PLAFOND_CHEVILLES_PAR_BORD,
  formesDe,
  formesEnDouble,
  normaliser,
  reconnaitre,
  reconnaitreDans,
  regimeDe,
  retirerChevilles,
  type Reconnaissance,
  type RegimeDeReconnaissance,
} from "./reconnaissance.js";

export {
  EFFET_DE_COMMANDE_HORS_MODELE,
  ISSUES_DE_COMMANDE,
  PREFIXE_OUTIL_VOIX,
  argumentsAEmpreindre,
  ligneDeCommande,
  nomAuJournal,
  projeterAuJournal,
  traduireIssue,
  type ArgumentsDeCommande,
  type ChampsDerives,
  type ChampsDuDemon,
  type EvenementCommandeHorsModele,
  type IssueDeCommande,
  type JournalDesCommandes,
} from "./journal.js";
