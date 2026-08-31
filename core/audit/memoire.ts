/**
 * `core/audit/memoire.ts` — UN `JournalStore` EN MÉMOIRE.
 *
 * ⚠️ CE N'EST PAS UN STORE DE PRODUCTION. Il n'a ni durabilité, ni section
 *    critique répartie, et il vit dans le tas du processus : le § 31 interdit
 *    par ailleurs tout cache de contenu sur disque, ce qui ne l'autorise pas
 *    pour autant à tenir le journal.
 *
 * Il existe pour deux raisons, et deux seulement :
 *
 *  · les gardes de ce module doivent pouvoir FABRIQUER un journal, le mutiler,
 *    et vérifier que la vérification rougit. Un test qui ne peut pas mutiler ne
 *    prouve rien ;
 *  · `core/audit` ne doit connaître ni Prisma ni SQL — la vérification doit
 *    tourner aussi bien sur une archive hors ligne (§ 31, 12 mois archivés) que
 *    sur la base vivante.
 *
 * ═══ LA SECTION CRITIQUE : DÉCLARÉE AU LOT 1c, TENUE AU LOT 1d ═══
 *
 * 🔴 **CE FICHIER A DÉCLARÉ PENDANT TOUT UN LOT UNE PROPRIÉTÉ QU'IL N'AVAIT
 *    PAS.** Son en-tête écrivait mot pour mot : « Il tient la section critique
 *    du port par une file d'attente à un seul jeton ». Il n'y avait ni file, ni
 *    jeton, ni verrou : `dernierSelfHash()` et `ajouter()` étaient deux méthodes
 *    indépendantes, et l'`await` entre les deux était une FENÊTRE. Deux
 *    `journaliser` concurrents lisaient le MÊME `prevHash` et écrivaient tous
 *    deux : la chaîne FOURCHAIT.
 *
 * ⚠️ POURQUOI CELA COMPTAIT MÊME SI LE STORE RÉEL TIENDRA LE CONTRAT. Ce double
 *    est le seul instrument dont disposent les gardes du socle. Une propriété
 *    que le double NE TIENT PAS est une propriété que RIEN n'éprouve — et son
 *    en-tête affirmait le contraire, ce qui est la façon la plus sûre de ne
 *    jamais l'écrire.
 *
 * {@link JournalMemoire} tient désormais la section critique : `dernierSelfHash`
 * PREND un jeton unique, `ajouter` le REND. C'est la PROPRIÉTÉ que
 * l'implémentation Prisma devra reproduire, par verrou consultatif ou
 * transaction sérialisable.
 *
 * ⚠️ ET LE JUMEAU EXISTE, LUI AUSSI, POUR UNE RAISON PRÉCISE.
 *    {@link JournalMemoireSansSectionCritique} garde le comportement d'AVANT —
 *    aucune file. Sans lui, une garde qui constate « la chaîne reste valide sous
 *    concurrence » serait verte sans qu'on sache si elle sait dire NON : elle
 *    pourrait l'être parce que le vérificateur est cassé, parce que les deux
 *    écritures n'ont jamais été concurrentes, ou parce que le harnais ne mesure
 *    rien. Le témoin fabrique la fourche à la demande, et la garde la voit.
 */

import type { JournalStore } from "./ports.js";
import type { LigneAAjouter, LigneAudit, LigneEcrite } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE FOND COMMUN — LE JOURNAL, SANS LA QUESTION DE LA CONCURRENCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tout ce que les deux doubles partagent : le stockage, l'unicité de `selfHash`,
 * l'ordre par `seq`, et les deux prises réservées aux gardes.
 *
 * ⚠️ IL EST ABSTRAIT ET NON EXPORTÉ, ET C'EST LA DÉRIVATION QUI COMPTE. Les deux
 *    doubles ne se distinguent QUE par la section critique — un seul membre,
 *    `tientLaSectionCritique`, et deux méthodes redéfinies. Recopier le corps du
 *    journal dans le témoin aurait fabriqué deux stockages légèrement
 *    différents, et une garde éprouvée contre le mauvais.
 */
abstract class JournalEnMemoire implements JournalStore {
  #lignes: LigneAudit[] = [];
  #prochaineSeq: bigint;

  constructor(premiereSeq = 1n) {
    this.#prochaineSeq = premiereSeq;
  }

  /**
   * `dernierSelfHash` puis `ajouter` sont-ils indissociables sur CE double ?
   *
   * ⚠️ C'EST UN SIGNAL LISIBLE, PAS UNE DÉCORATION. Une garde qui reçoit un
   *    store peut ANNONCER contre quel régime elle a mesuré — et un témoin qui
   *    croirait éprouver la section critique sur le double qui ne la tient pas
   *    se voit dans son propre compte rendu.
   */
  abstract readonly tientLaSectionCritique: boolean;

  dernierSelfHash(): Promise<string | null> {
    const derniere = this.#lignes[this.#lignes.length - 1];
    return Promise.resolve(derniere?.selfHash ?? null);
  }

  ajouter(ligne: LigneAAjouter): Promise<LigneEcrite> {
    // `selfHash` est UNIQUE en base (§ 12) : le double ici aussi, sans quoi le
    // double en mémoire passerait et le double en production échouerait.
    if (this.#lignes.some((existante) => existante.selfHash === ligne.selfHash)) {
      return Promise.reject(new Error("selfHash déjà présent : contrainte d'unicité violée"));
    }
    const seq = this.#prochaineSeq;
    this.#prochaineSeq += 1n;
    this.#lignes.push({ ...ligne, seq });
    return Promise.resolve({ seq, selfHash: ligne.selfHash });
  }

  lireDepuis(seqDepuis: bigint, limite: number): Promise<readonly LigneAudit[]> {
    // ORDONNÉ PAR `seq`, jamais par `at` (§ 12). Le tri est explicite plutôt
    // qu'implicite dans l'ordre d'insertion : c'est le contrat du port.
    const tranche = this.#lignes
      .filter((ligne) => ligne.seq >= seqDepuis)
      .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
      .slice(0, limite);
    return Promise.resolve(tranche);
  }

  /** Toutes les lignes, ordonnées par `seq`. Pour les gardes. */
  toutes(): readonly LigneAudit[] {
    return [...this.#lignes].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  }

  /** Retire les lignes dont le `seq` est dans l'intervalle, bornes incluses. */
  supprimerIntervalle(seqDepuis: bigint, seqJusqua: bigint): number {
    const avant = this.#lignes.length;
    this.#lignes = this.#lignes.filter((ligne) => ligne.seq < seqDepuis || ligne.seq > seqJusqua);
    return avant - this.#lignes.length;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE DOUBLE QUI TIENT LA SECTION CRITIQUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UN `JournalStore` EN MÉMOIRE **QUI TIENT LA SECTION CRITIQUE DU PORT.**
 *
 * ═══ LE MÉCANISME, ET POURQUOI C'EST CELUI-LÀ ═══
 *
 * `ports.ts` pose l'exigence que le type ne peut pas exprimer : « `dernierSelfHash`
 * puis `ajouter` forment UNE SECTION CRITIQUE ». Deux méthodes indépendantes ne
 * peuvent pas la tenir chacune de son côté — **sérialiser chaque méthode
 * séparément ne servirait à rien** : entre le retour de la lecture et l'appel de
 * l'écriture, le lecteur rend la main, et le lecteur suivant lit encore l'ancien
 * chaînon. La file doit enjamber les DEUX appels.
 *
 * D'où le jeton unique, et ses deux gestes :
 *
 *  · `dernierSelfHash()` **PREND** le jeton, et ne rend le chaînon qu'ensuite ;
 *  · `ajouter()` **REND** le jeton, quoi qu'il arrive (`finally`).
 *
 * Un `ajouter()` qui ne suit aucune lecture prend le jeton pour son propre
 * compte : une écriture directe — celle des fabriques de journaux — reste
 * sérialisée elle aussi.
 *
 * ═══ LA BORNE, ÉCRITE AVEC LE MÉCANISME ═══
 *
 * ⚠️ **UNE LECTURE QUI N'EST JAMAIS SUIVIE D'UNE ÉCRITURE GARDE LE JETON.** Le
 *    port n'a aucune identité d'appelant : ce double ne peut pas savoir qu'un
 *    lecteur a renoncé. Dans le socle, le seul appelant de `dernierSelfHash` est
 *    `Journal.journaliser`, qui appelle toujours `ajouter` ensuite ; si un jour
 *    un appelant lit sans écrire, l'écriture suivante ATTENDRA — et le test qui
 *    la contient expirera. C'est bruyant, et c'est le seul régime acceptable :
 *    un jeton qu'on relâcherait tout seul au bout d'un délai referait exactement
 *    la fourche que cette file existe pour empêcher, mais plus rarement, donc
 *    plus difficilement.
 *
 *    `reservationsPosees` et `reservationsConsommees` rendent cette fuite
 *    LISIBLE : un écart entre les deux compte les lectures abandonnées.
 *
 * ⚠️ `toutes()` ET `supprimerIntervalle()` NE PASSENT PAS PAR LA FILE. Ce sont
 *    des prises de garde, synchrones, hors du contrat du port — les faire entrer
 *    dans la section critique interdirait à un témoin de mutiler le journal
 *    pendant qu'une écriture est en vol, ce qui est précisément ce qu'un témoin
 *    doit pouvoir faire.
 */
export class JournalMemoire extends JournalEnMemoire {
  override readonly tientLaSectionCritique: boolean = true;

  /** La file : une promesse chaînée. Le jeton est le droit de la résoudre. */
  #file: Promise<void> = Promise.resolve();
  /** Comment rendre le jeton, quand on le tient. `null` quand il est libre. */
  #rendreLeJeton: (() => void) | null = null;
  #reservationsPosees = 0;
  #reservationsConsommees = 0;
  #misesEnAttente = 0;
  /** Appelants entrés dans la file et qui n'en sont pas encore sortis. */
  #enFile = 0;

  /** Combien de fois le jeton a été PRIS. Un zéro rend toute garde vacuous. */
  get reservationsPosees(): number {
    return this.#reservationsPosees;
  }

  /** Combien de fois il a été RENDU. Un écart compte les lectures abandonnées. */
  get reservationsConsommees(): number {
    return this.#reservationsConsommees;
  }

  /**
   * Combien d'appelants ont réellement DÛ ATTENDRE.
   *
   * ⚠️ C'EST LA MESURE QUI DIT SI LA FILE A MORDU. Sur deux écritures
   *    séquentielles, elle vaut 0 — et c'est normal. Sur deux écritures
   *    concurrentes, elle vaut au moins 1 ; si elle valait 0, une garde qui
   *    constate une chaîne valide serait verte parce que rien n'a été mis en
   *    concurrence, et non parce que la section critique tient.
   */
  get ecrituresMisesEnAttente(): number {
    return this.#misesEnAttente;
  }

  /** Prend le jeton, en attendant que le précédent détenteur l'ait rendu. */
  async #prendreLeJeton(): Promise<void> {
    // ⚠️ ON COMPTE LES OCCUPANTS, PAS LE JETON. Un appelant qui vient d'entrer
    //    dans la file n'a pas encore SAISI le jeton — il l'attend, dans une
    //    micro-tâche à venir. Mesurer l'attente sur `#rendreLeJeton` compterait
    //    donc ZÉRO sur deux écritures rigoureusement concurrentes : mesuré, et
    //    c'est exactement le compteur muet qui aurait rendu la garde G1 verte
    //    sans qu'aucune concurrence n'ait eu lieu.
    if (this.#enFile > 0) this.#misesEnAttente += 1;
    this.#enFile += 1;
    const precedent = this.#file;
    let rendre!: () => void;
    this.#file = new Promise<void>((resoudre) => {
      rendre = resoudre;
    });
    await precedent;
    this.#rendreLeJeton = rendre;
    this.#reservationsPosees += 1;
  }

  /** Rend le jeton. Sans effet si on ne le tient pas. */
  #relacherLeJeton(): void {
    const rendre = this.#rendreLeJeton;
    if (rendre === null) return;
    this.#rendreLeJeton = null;
    this.#enFile -= 1;
    this.#reservationsConsommees += 1;
    rendre();
  }

  override async dernierSelfHash(): Promise<string | null> {
    await this.#prendreLeJeton();
    // La lecture NE REND PAS le jeton : il est rendu par l'`ajouter` qui suit.
    // C'est ce qui fait de la paire une section critique, et non deux verrous.
    return super.dernierSelfHash();
  }

  override async ajouter(ligne: LigneAAjouter): Promise<LigneEcrite> {
    // Le jeton est tenu ⇒ il l'est par le lecteur qui nous précède, puisque
    // tout autre appelant est bloqué dans la file. Il ne l'est pas ⇒ cette
    // écriture ne suit aucune lecture, et elle prend le jeton pour son compte.
    if (this.#rendreLeJeton === null) await this.#prendreLeJeton();
    try {
      return await super.ajouter(ligne);
    } finally {
      this.#relacherLeJeton();
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE TÉMOIN — LE MÊME JOURNAL, SANS SECTION CRITIQUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE DOUBLE QUI NE TIENT PAS LA SECTION CRITIQUE. IL EXISTE POUR QUE LA GARDE
 * PUISSE PROUVER QU'ELLE SAIT DIRE NON.**
 *
 * C'est le comportement exact de {@link JournalMemoire} AVANT le lot 1d : deux
 * `journaliser` concurrents lisent le même `prevHash`, écrivent tous deux, et la
 * chaîne fourche. Le défaut est reproductible à la demande, sur un objet dont le
 * nom l'annonce.
 *
 * ⚠️ **CE N'EST PAS UN REPLI, ET AUCUN MODULE DE PRODUCTION NE DOIT
 *    L'INSTANCIER.** Il ne sert qu'à une chose : donner à une garde son régime
 *    NÉGATIF, sans quoi le régime positif serait vert sans qu'on sache s'il
 *    regarde quelque chose. Une garde qui n'a jamais vu son propre échec n'est
 *    pas une garde.
 *
 * ⚠️ **LA FOURCHE QU'IL PRODUIT EST DÉFINITIVE.** Elle ne se répare pas : les
 *    deux lignes sont écrites, chacune intègre pour elle-même, et `verifierChaine`
 *    la voit comme un `saut-non-ancré` que ni purge ni clôture n'efface. C'est
 *    la seule bonne nouvelle du défaut : il n'est pas silencieux.
 */
export class JournalMemoireSansSectionCritique extends JournalEnMemoire {
  override readonly tientLaSectionCritique: boolean = false;
}
