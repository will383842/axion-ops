# ADR 0047 — Un code du § 15 sans émetteur, et la dérivation des deux côtés

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué au correcteur du lot 4)
- **Portée** : `core/chaine/orchestrateur.ts` (étape 14, chemin d'exception),
  `ops/codes-hors-tableau.ts`, `core/chaine/index.ts`,
  `core/transport/stdio/fixtures.ts` (levier de panne),
  `core/__tests__/integration.spec.ts`, `ops/codes-hors-tableau.spec.ts`
- **Sources** : cahier des charges v6, § 15 (le tableau des treize codes, et
  « un refus dit quoi faire ensuite »), § 24 (le comptage des refus), § 18 (un
  adaptateur qui rend une réponse malveillante) ; ADR 0003, ADR 0005, ADR 0017,
  ADR 0019, ADR 0021, ADR 0041

---

## Le fait qui rend cette décision nécessaire

### ① `upstream_unavailable` n'avait AUCUN émetteur de production

Le tableau du § 15 énumère treize codes. Le onzième dit, mot pour mot :
« Adaptateur ou API tierce injoignable. **Dit lequel, et si c'est
transitoire.** » Mesuré avant ce lot, sur les 139 modules émis par
`pnpm build` — modules de déclaration écartés :

| ce qui existe                       | où                                  |
| ----------------------------------- | ----------------------------------- |
| la valeur, dans l'union fermée      | `core/types.ts`                     |
| la recopie du tableau, pour l'écart | `ops/codes-hors-tableau.ts`         |
| **zéro site d'émission**            | mesuré, aucun                       |
| ce que le socle rendait réellement  | `decision: "interrompu"`, sans code |

Une panne de joignabilité d'un tiers sortait donc sous « l'aveu qu'aucune
décision n'a été atteinte » (`core/audit/vocabulaire.ts`), c'est-à-dire rangée
parmi les **défauts du socle** dans le comptage du § 24. C'est faux : à cet
instant le socle sait ce qui s'est passé, il sait de quel adaptateur il s'agit,
et il sait que réessayer a un sens.

**Un code que rien n'émet est une métrique qui restera vide, et une métrique
vide ressemble à une métrique sans incident.**

### ② La garde qui aurait dû le voir mesurait deux booléens écrits à la main

`ops/codes-hors-tableau.ts` portait un champ `enAttenteDeBranchement: boolean`
sur chaque **écart** au § 15 — deux entrées, deux booléens saisis à la main.
Deux conséquences, mesurées :

- le champ ne vivait que sur les écarts, donc la garde **ne pouvait rien dire
  des treize codes DU tableau**. `upstream_unavailable` est l'un des treize ;
- un booléen recopié se relit comme une mesure alors qu'il n'est qu'une
  affirmation. C'est la seconde source de vérité de l'ADR 0003, et c'est
  toujours la seconde qui ne suit pas.

---

## Décision

### 1 · L'amont injoignable est un REFUS NOMMÉ, prononcé à l'étape 14

Quand l'appel à l'adaptateur lève, l'orchestrateur confronte l'erreur à une
liste **fermée** de codes systèmes de joignabilité
(`CODES_SYSTEME_AMONT_INJOIGNABLE`). Si elle en porte un, l'appel est refusé
à l'étape 14 avec `upstream_unavailable` ; sinon l'exception est relancée
telle quelle, comme avant.

**Le CODE est mesuré, jamais le MESSAGE.** Un adaptateur écrit ce qu'il veut
dans le texte d'une `Error` ; il ne fabrique pas un `code` de `libuv` ou de
`undici` sans le vouloir. Reconnaître « injoignable » à un mot du message ferait
du libellé d'un tiers l'entrée d'une décision du socle — le vecteur exact que le
§ 18 range parmi les adversaires.

**La chaîne `cause` est suivie, et la profondeur est bornée et annoncée.** Un
client HTTP moderne enveloppe presque toujours (`TypeError: fetch failed`, avec
`cause` portant `ECONNREFUSED`) : ne regarder que le premier niveau ne
reconnaîtrait jamais rien, et le code serait branché **en apparence seulement**.
La borne existe parce qu'une chaîne de causes peut être cyclique, et qu'une
boucle ici pendrait l'appel dans un `catch` — à l'endroit précis où le socle
doit encore écrire sa ligne de journal.

### 2 · Ni l'issue d'idempotence, ni l'issue d'intention ne changent

`issueDeReservation()` (ADR 0021) ne lit que le **cliquet** de l'ADR 0017 et
`terminaisonRendue` ; l'un et l'autre sont inchangés, puisque l'adaptateur a
levé. Un envoi PARTI dont l'aval lève reste donc fermé en `done` : ce refus
**nomme** la panne, il ne rouvre aucun rejeu. `issueDeLIntention` reste `failed`.

### 3 · L'`outcome` reste `erreur` — le mot existait avant l'émetteur

`core/audit/vocabulaire.ts` écrivait déjà « `erreur` — incompactable
(`result_too_large`), **amont injoignable**, ou exception », et `issue()` dérive
`erreur` pour tout refus prononcé À l'étape 14. Aucune valeur n'est ajoutée à
l'énumération : cela romprait l'empreinte chaînée pour un mot qui existait.

### 4 · Le message dit LEQUEL et s'il est transitoire — et RIEN d'autre

Il porte l'`adapterId`, que le socle connaît déjà, et le code système, qui est
un mot d'une liste fermée. **Ni le message de l'erreur, ni sa pile, ni hôte ni
URL** : ils portent couramment une adresse d'infrastructure, parfois un secret,
et le § 15 réserve l'identifiant de corrélation au seul `internal`.

### 5 · `enAttenteDeBranchement` est DÉRIVÉ des deux côtés, sur les QUINZE codes

Le champ écrit à la main disparaît de `CodeHorsTableau`. À sa place,
`chercherLesSitesDEmission()` — **fonction pure d'un ensemble de fichiers
injecté**, comme `core/coutures/verifier.ts` — cherche, pour CHAQUE code de
l'union, un site d'émission dans les modules de production, sous **deux formes**
qui ne se confondent pas :

- **littérale** — le module nomme le code entre guillemets, hors commentaire et
  hors ré-exportation (`sansProse`, `sansLiaisons`) ;
- **ancrée** — le module ancre une étape d'`APPEL_STEPS` (`ancrerEtape("…")`)
  dont le § 11 donne ce code en `refus`.

**La seconde forme n'est pas un confort.** Mesuré : le littéral seul laisse
**six** codes sans producteur — `cursor_invalid`, `provenance_denied`,
`result_too_large`, `scope_insufficient`, `tool_disabled`,
`tool_not_in_profile` — que la chaîne prononce tous les jours en LISANT leur
ancrage. Un `grep` ne prouve que l'absence de la FORME ÉCRITE.

### 6 · Les modules de DÉCLARATION sont écartés, nommément et avec leur motif

`core/types.ts` (l'union) et `ops/codes-hors-tableau.ts` (la recopie du tableau)
nomment les quinze codes sans en rendre aucun. Les compter pour des émetteurs
rendrait « tout est branché » vrai **par construction** — et c'est sous ce
vert-là que `upstream_unavailable` a dormi quatre lots. Un chemin écarté qui
n'existe plus est une **anomalie**, pas un écart silencieux : il n'écarterait
plus rien.

### 7 · Une confrontation qui n'a pas mesuré l'émission les range TOUS en attente

`confronterCodes()` accepte la recherche ; quand elle vaut `null`, le verdict
porte `emissionMesuree: false` et **tous** les codes en attente de branchement.
Rendre une liste vide se lirait « tout est branché » : ce serait une garde verte
parce qu'elle ne regarde rien. Une recherche qui a balayé zéro module est une
anomalie du même ordre.

---

## Ce que cette décision NE COUVRE PAS

- **La liste des codes systèmes est un CHOIX, et il est borné.** Chaque valeur
  désigne une panne de JOIGNABILITÉ, jamais une réponse : un `500` reçu d'une
  API tierce **est** une réponse et ne se range pas ici. Aucun adaptateur
  n'existe encore ; la liste sera à reconfronter au premier client réel.
- **`unauthenticated` n'a qu'un site d'émission, et c'est une table de
  correspondance** (`core/transport/http/codes.ts`). Les étapes 1 à 4 sont
  « HTTP seul » et `APPEL_STEPS` ne leur donne aucun code : la mesure le compte
  comme branché sur la forme littérale, ce qui est vrai de la FORME et n'a pas
  été confronté à une branche exécutée. Écart signalé, non refermé ici.
- **La recherche mesure des FORMES sur le source.** Elle ne fait tourner aucun
  appel : elle prouve qu'un endroit PEUT rendre le code, pas qu'une branche
  atteignable le rende. La preuve inverse s'obtient en faisant refuser l'étape
  et en LISANT le code rendu — c'est ce que font la garde des quatre branches de
  l'étape 5 et, pour ce code-ci, la garde de bout en bout du § 15.
- **Le lot ne mesure aucun réseau.** Toutes les pannes éprouvées sont
  fabriquées ; aucun appel sortant n'a eu lieu.

---

## Ce que les gardes doivent tenir

1. **Le chemin complet**, depuis une `Error` levée PAR L'ADAPTATEUR jusqu'à la
   ligne d'`ops_audit` : `stepDenied` = 14, `code` = `upstream_unavailable`,
   `outcome` = `erreur`, message portant l'`adapterId` et le code système, et
   ne portant NI le message de l'erreur NI sa pile.
2. **Le témoin inverse est obligatoire** : une panne SANS code système reste une
   exception (`decision: "interrompu"`, `stepDenied: null`). Sans lui, un socle
   qui rendrait `upstream_unavailable` sur toute exception serait vert, et le
   code mentirait dans l'autre sens.
3. **La chaîne `cause`** : une panne enveloppée est reconnue, et la garde LIT le
   nombre de maillons examinés — à un seul, la reconnaissance serait une
   coïncidence. Une chaîne cyclique ne pend pas.
4. **Les deux formes d'émission**, et la preuve que l'ancrée apporte quelque
   chose : le même balayage privé de la forme ancrée doit laisser au moins un
   code sans producteur.
5. **Le témoin fabriqué des déclarations** : un module de déclaration écarté ne
   compte pas, le même module compté rendrait « tout branché », et un chemin
   écarté introuvable rougit.
6. **Les mutations qui doivent MOURIR** — chacune réappliquée sur le vrai code,
   la suite relancée, puis restaurée :
   - remplacer la condition de reconnaissance par `false` à l'étape 14 ;
   - cesser de descendre la chaîne `cause` ;
   - retirer le littéral `upstream_unavailable` de la production.
     Chacune doit rougir.

---

## Conséquences acceptées

- **`ops/codes-hors-tableau.ts` importe désormais `core/coutures/verifier.ts`**
  pour `sansProse` et `sansLiaisons`. Ces deux nettoyages ont UN propriétaire
  dans le dépôt ; les recopier ici aurait fabriqué la seconde dérivation que
  l'ADR 0019 refuse.
- **`estAmontInjoignable` et `CODE_AMONT_INJOIGNABLE` vivent dans le module qui
  les appelle.** L'axe des appelants de G1 ne peut donc rien en dire — le
  définisseur ne se compte jamais lui-même — et leurs entrées de registre sont
  `à-coudre` de ce point de vue, avec la mesure DÉLÉGUÉE à leur garde et
  l'assertion de l'ADR 0041 qui porte la preuve. C'est exactement la séparation
  des deux faits que cet ADR-là a posée.
- **Le harnais stdio gagne deux leviers** (`inventaire`, `panneDeLAdaptateur`).
  Sans eux, deux cas exigés par l'ADR 0036 et par celui-ci ne sont pas
  fabricables, donc pas éprouvables. Le second est typé `Error` alors
  qu'`estAmontInjoignable` accepte `unknown` : c'est une borne du HARNAIS, pas du
  socle — la règle de lint du dépôt refuse de rejeter autre chose, et ce dépôt
  ne porte aucun `eslint-disable`. Le cas « l'adaptateur lève un objet nu » est
  éprouvé en appelant la fonction directement, avec une chaîne de causes
  cyclique.
