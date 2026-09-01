# ADR 0039 — La composition de la chaîne à la racine : un noyau PAR TRANSPORT, et ce qui l'empêche encore

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `ops/composition/` (à écrire), `ops/index.ts`, `ops/service.ts`
  (`PortsDuService`), `core/transport/contrat.ts`, `core/vault/coffre.ts`
  (troisième lecteur de clé), `core/chaine/orchestrateur.ts`
  (`EtatDePilotage.inventaire`, prose)
- **Sources** : cahier des charges v6, § 11 (les quatorze étapes, une colonne par
  transport, l'invariant de sortie), § 12, § 13, § 19 (règle absolue), § 20
  (l'index de provenance en mémoire, borné), § 23 (les trois états du coffre) ;
  ADR 0002, ADR 0018, ADR 0020, ADR 0023, ADR 0024, ADR 0025, ADR 0034,
  ADR 0036, ADR 0037

---

## Le fait, mesuré

Le socle **démarre** — sept étages, codes de sortie distincts, chaque refus
nommant le geste — et **ne sert pas depuis son propre processus**. La mesure
tient en une ligne, faite sur les 130 modules que `pnpm build` émet :

| symbole                | appelants de production |
| ---------------------- | ----------------------- |
| `orchestrerAppel`      | **0**                   |
| `scelleurDepuisCoffre` | **0**                   |

`ops/index.ts` remet `noyau: null`, et `monterLeService` compte l'empêchement :
« la chaîne des quatorze étapes n'est pas composée ». **Ce refus est une GARDE,
pas un bug** — un transport monté sur un noyau absent servirait des appels
qu'aucune ligne d'`ops_audit` n'atteste, et l'invariant de sortie du § 11
tomberait en silence.

**Cette garde reste, mot pour mot. Elle doit devenir verte parce que le noyau est
là — jamais parce qu'on l'a assouplie.** Toute modification de son texte ou de sa
condition est un échec du lot, quel que soit le reste.

---

## Décision

### 1 · UN NOYAU PAR TRANSPORT — `PortsDuService.noyau` devient une FABRIQUE

C'est la décision la plus facile à manquer, et elle fabriquerait une panne
silencieuse dès le premier appel HTTP.

`DependancesOrchestrateur` porte un champ `transport`, et c'est **lui** qui fait
lire à l'orchestrateur la colonne du § 11 : quelles étapes sont applicables,
lesquelles sont établies **en amont**, lesquelles ne s'appliquent pas du tout.
Un noyau unique composé avec `transport: "stdio"` et remis aux **deux**
transports servirait les appels HTTP en croyant que les quatre étapes « HTTP
seul » n'existent pas — et `verifierCouvertureDesEtapes`, appelée à l'étage 6,
ne le verrait pas : elle boucle sur les **noms** de transports, pas sur les
noyaux montés.

```ts
export type FabriqueDeNoyau = (transport: Transport) => NoyauUnique;
```

`PortsDuService.noyau: NoyauUnique | null` devient
`PortsDuService.fabriqueDeNoyau: FabriqueDeNoyau | null`, et `monterLeService`
l'appelle **une fois par transport monté**, avec le nom de la colonne qu'il
monte. Le reste de `monterLeService` — l'ordre des trois empêchements, le refus
du § 23, les levées de câblage — est **inchangé**.

### 2 · L'ORDRE DE CONSTRUCTION, et il est la décision

La composition est tentée **après l'étage 5**, avant `monterLeService`. Chaque
rang a un motif qui interdit de l'échanger avec son voisin.

| #   | ce qui est construit                | pourquoi ici et pas ailleurs                                                                                                                    |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | rien — le socle SERT-il ?           | un socle dont l'arbitre a prononcé `sert: false` n'a rien à composer                                                                            |
| 0'  | rien — § 23                         | `appelsDOutilsAcceptes === false` ⇒ **aucun noyau**. Composer sous coffre verrouillé fabriquerait la chaîne que le § 23 refuse                  |
| 1   | le **scelleur** du journal          | `scelleurDepuisCoffre(coffre)` — sans clé de scellement, aucune ligne n'est chaînable (ADR 0002). C'est le lien MESURÉ entre le § 23 et le § 11 |
| 2   | le **journal**                      | `new Journal(scelleur, store, horloge)` — il n'existe qu'après 1, jamais avant                                                                  |
| 3   | le **calcul d'`argHash`**           | `creerCalculArgHash(coffre)` — même coffre, même état                                                                                           |
| 4   | le **signataire de curseur**        | `creerSignataireCurseur(coffre)` — voir § 4, il manque un lecteur                                                                               |
| 5   | les **dépôts** quota / idempotence  | ils ne dépendent de rien d'autre, et l'étape 12 comme la 13 les exigent                                                                         |
| 6   | le **catalogue** et le **pilotage** | DÉRIVÉS des adaptateurs admis à l'étage 5 — jamais reconstruits                                                                                 |
| 7   | la **politique**                    | l'étage 4 a déjà posé la ligne `setBy: "boot"` ; on la LIT, on ne la repose pas                                                                 |
| 8   | la **confirmation**                 | dépôt de jetons à usage unique (§ 20)                                                                                                           |
| 9   | l'**index de provenance**           | **celui que `ops/index.ts` a DÉJÀ construit** — voir § 3                                                                                        |
| 10  | les **cinq étapes**                 | importées de `core/chaine`, jamais réécrites (interdit n° 2 de l'ADR 0025)                                                                      |
| 11  | la **fabrique de noyau**            | elle ferme sur tout ce qui précède, et se donne le `transport` en paramètre                                                                     |

**La composition ne précède jamais l'étage 1.** Un second socle qui composerait
puis échouerait sur le verrou d'instance aurait déjà un index de provenance
vivant et un journal ouvert : l'ADR 0018 veut le verrou **avant** de servir quoi
que ce soit, et « servir » commence à la composition, pas à l'écoute.

### 3 · L'index de provenance est le MÊME OBJET, jamais un second

`ops/index.ts` construit déjà un `IndexProvenanceMemoire` et le donne à
`lireLaProvenance` pour que le healthcheck publie le nombre d'extraits indexés
(§ 20). La composition **reçoit cet objet** ; elle n'en fabrique pas un second.

**Deux index feraient une garde du § 20 qui ne voit que la moitié des sessions**,
et le healthcheck annoncerait un compte qui n'est pas celui de la garde. C'est
exactement le mode de défaillance que l'ADR 0018 décrit pour le verrou, transposé
à la provenance.

### 4 · CE QUI MANQUE ENCORE — un troisième lecteur de clé au coffre

Mesuré : `Coffre` implémente **deux** ports de lecture de clé —
`lireCleArgHash` (`CoffreArgHash`) et `lireCleSceauJournal`
(`CoffreSceauJournal`). Le port `CoffreCurseur.lireCleCurseur` de l'étape 9
n'a **aucune implémentation hors des fixtures**.

**Décision : le coffre gagne `lireCleCurseur`, écrit dans le même moule que ses
deux jumeaux** — nom et version de secret déclarés à côté des deux autres, lève
sur coffre fermé, rend `null` sur secret absent, et c'est
`creerSignataireCurseur` qui décide que l'absence est fatale (il le fait déjà,
bruyamment).

⚠️ **NE PAS PASSER PAR `coffre.lire(nom, version)` DEPUIS LA COMPOSITION.** La
racine choisirait alors le nom du secret, c'est-à-dire une décision de coffre
prise dans un fichier de montage — et le troisième secret n'apparaîtrait dans
aucun inventaire. Les deux lecteurs existants sont des PONTS nommés ; le
troisième doit leur ressembler, sans quoi il se perdra.

### 5 · CE QUE LA COMPOSITION N'A PAS LE DROIT DE FABRIQUER

Trois dépendances de `DependancesOrchestrateur` exigent un ADAPTATEUR :
`validerEntree` (étape 8), `appelAdaptateur` (étape 14), et `reglages`. Aucun
adaptateur n'est admis aujourd'hui.

**Elles sont composées en REFUS NOMMÉ, jamais en fonctions de complaisance.** Un
`validerEntree` qui rendrait `{ ok: true }` sur tout serait le « vert parce qu'il
ne regarde rien » dans sa forme la plus pure, et il traverserait toutes les
gardes du dépôt. Le refus porte le numéro de l'étape concernée et NOMME le geste
(§ 15) : « aucun adaptateur n'est raccordé à cet outil ».

⚠️ **CE CHEMIN N'EST PAS ATTEIGNABLE AUJOURD'HUI**, et c'est ce qui rend la
décision peu coûteuse : le catalogue est vide, donc **l'étape 6 refuse avant**.
Un catalogue vide ne rend pas la chaîne incomposable — il rend tout appel refusé
à l'étape 6, ce qui est le comportement JUSTE. **Un socle sans outil n'est pas un
socle sans chaîne**, et confondre les deux est ce qui a fait durer le manque.

`fabriqueMasquage` rend le masquage neutre **tant que le pont d'identité est
`PONT_AU_PLUS_FAIBLE`** : le second rideau du § 19 bis se dérive des
habilitations, et des habilitations au plus faible ne masquent rien de plus que
ce que les scopes refusent déjà. Le jour où un pont réel atterrit, le masquage se
dérive de lui — et la garde annoncera combien de champs il masque.

### 6 · LA DURABILITÉ EST UNE CONDITION DE COMPOSITION, pas un détail

Le journal, le quota et l'idempotence n'ont aujourd'hui que des implémentations
**en mémoire**. Un journal en mémoire ne survit pas au processus, et l'ADR 0002
veut un journal en **ajout seul** et vérifiable.

**Décision : la composition n'est autorisée que sur le magasin LOCAL** — l'URL de
base qui désigne `HOTE_SANS_MAGASIN_PARTAGE`, **la même convention que le coffre
(ADR 0034) et que le verrou (ADR 0024), dérivée du MÊME symbole**. Sur un magasin
partagé réel, la fabrique reste `null`, et l'empêchement de `monterLeService`
**NOMME le câblage manquant** au lieu de dire seulement « la chaîne n'est pas
composée ».

C'est ce qui empêche de composer à tout prix. Le socle sert en local, où rien ne
survit de toute façon ; il continue de se taire en partagé, où l'on croirait ses
lignes durables.

### 7 · Ce que la composition change dans `core/chaine`, et qu'il faut écrire

`EtatDePilotage.inventaire` est documenté « appelée QUE quand `profilActif` rend
`null` : un chemin de panne, pas le chemin normal ». **L'ADR 0036 la met sur le
chemin nominal** (le plafond du § 14 se refuse à l'étape 7, à chaque appel,
mémoïsé par appel). La prose doit être corrigée dans le même geste : une prose
qui survit à sa règle est le défaut que le lot 1c a nommé.

---

## Ce que cette décision NE COUVRE PAS

- **Elle ne rend pas le socle durable.** Journal, quota, idempotence et coffre
  restent en mémoire ; le câblage Prisma n'existe pas dans ce dépôt. Ce qui est
  livré est **un socle qui sert en local, et qui refuse de le faire ailleurs**.
- **Elle ne raccorde aucun adaptateur.** `adapters/` reste vide, le catalogue
  reste vide, et tout appel se refuse à l'étape 6. Ce qui est prouvé est que la
  **chaîne** répond, pas qu'un **outil** répond.
- **Elle ne dit rien du comportement en charge ni sous concurrence.** La section
  critique du journal est tenue par `JournalMemoire` ; l'implémentation Prisma
  devra la reproduire par verrou consultatif ou transaction sérialisable, et
  personne ne l'a mesurée.
- **Elle ne ferme pas la divergence d'enveloppe entre les deux transports**
  (ADR 0037, § « ce que cela ne couvre pas »).
- **`ttlIdempotenceMs` et `budgetMs` n'ont toujours aucune valeur par défaut**
  (ADR 0034, § 5), et cette décision n'en invente pas.

---

## Ce que les gardes doivent tenir

1. **UN APPEL DE BOUT EN BOUT, DEPUIS `ops/index.ts`, ET PAS DEPUIS UN HARNAIS.**
   Le processus démarre sur un environnement fabriqué, le coffre local est
   provisionné, la fabrique de noyau est construite, un `tools/call` entre par le
   fil — et la garde lit **la ligne d'`ops_audit` qui l'atteste**. C'est la seule
   mesure qui distingue « la chaîne est composée » de « la chaîne est
   composable ».
2. **LA COLONNE DE CHAQUE TRANSPORT EST CELLE DU TRANSPORT.** Un appel servi en
   HTTP et un appel servi en stdio doivent annoncer des `etapesApplicables`
   DIFFÉRENTES, confrontées à `colonneDuTransport(transport)` — jamais à une
   liste écrite. **Le témoin qui prouve que la garde mord** : composer un noyau
   unique en `stdio` et le remettre aux deux transports doit faire rougir.
3. **L'EMPÊCHEMENT RESTE, ET IL EST ÉPROUVÉ DANS LES DEUX SENS.** Sur un socle
   sans fabrique — magasin partagé, ou coffre verrouillé —, `monterLeService`
   compte toujours « la chaîne des quatorze étapes n'est pas composée » et ne
   monte **rien**. Sur un socle local avec fabrique, il monte et `empechements`
   est **vide**. Les deux, ou la garde ne prouve rien.
4. **L'INDEX EST LE MÊME OBJET.** Après un appel dont le résultat marque la
   session, le compte publié par le healthcheck doit **bouger**. Un second index
   laisserait ce compte à zéro pendant que la garde du § 20 marque : c'est le
   défaut, et c'est la mesure qui le voit.
5. **AUCUNE FONCTION DE COMPLAISANCE.** Une garde lit le source de
   `ops/composition/` et exige qu'aucune des trois dépendances d'adaptateur ne
   rende un succès inconditionnel. Borne écrite avec elle : **c'est une lecture
   de TEXTE, pas d'AST** — même borne que `verifierLeCablageDuDemarrage`, qui
   l'écrit déjà.
6. **La mutation qui doit MOURIR** : remettre `fabriqueDeNoyau: null` dans
   `ops/index.ts`, relancer la suite complète, vérifier que la garde n° 1 rougit,
   restaurer, reconfronter l'empreinte, transcrire les deux états.

---

## Conséquences acceptées

- **`ops/` gagne un dossier.** `ops/composition/` porte la fabrique et rien
  d'autre : `ops/index.ts` RELIE, `ops/main.ts` SÉQUENCE, `ops/service.ts` MONTE,
  et désormais `ops/composition/` COMPOSE. Écrire la composition dans
  `ops/index.ts` la rendrait inéprouvable sans lire `process.env`.
- **Deux noyaux vivent dans le même processus quand les deux transports sont
  demandés.** Ils partagent tout ce qui décide — journal, dépôts, index,
  politique — et ne diffèrent que par leur colonne. C'est exactement ce que
  l'ADR 0025 appelle « deux transports, un seul noyau » : un seul **chemin**, pas
  un seul objet.
- **`orchestrerAppel` passe de `à-coudre` à `cousue`**, et c'est le jalon du lot.
  Il ne doit pas être basculé au registre avant que l'appel existe.
- **Le coffre gagne un troisième secret nommé.** Il entrera dans l'inventaire des
  secrets d'exploitation, et son absence fera lever `creerSignataireCurseur` —
  bruyamment, ce qui est le comportement voulu.
