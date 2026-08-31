# Journal des modifications — `axion-ops`

Format : une entrée par lot. Les dates sont celles du dépôt, pas d'un
déploiement — **rien n'a été déployé.**

---

## Lot 1c — cinq décisions d'architecture, et la moitié de leur couture — 2026-08-31

L'épreuve adverse du lot 1b avait montré que **la garde la plus importante du
socle — l'anti-exfiltration du § 20 — pouvait être désarmée de deux façons**, et
les agents avaient refusé de trancher seuls : ce sont des décisions
d'architecture, pas des correctifs. Ce lot les **tranche** — cinq ADR — et en
**coud une partie**.

> ⚠️ **CORRECTION DE CETTE ENTRÉE PAR LA RECETTE.** Elle a d'abord annoncé
> « aucune implémentation », « il n'écrit aucune logique et aucune garde »,
> « 838 verts » et « aucun test ajouté, supprimé ni modifié ». Les quatre
> énoncés sont **contredits par le diff qu'ils décrivent**, et l'épreuve
> adverse les a mesurés : **douze** fichiers de gardes créés (onze par les
> constructeurs, un par la Recette), **dix** fichiers TypeScript de production
> neufs, l'ADR 0017 entièrement implémentée (colonne Prisma `externalEffect`,
> entrée dans `CHAMPS_COUVERTS`, cliquet à l'étape 14), et **+139 tests**. Ce qui suit est la mesure corrigée, avec sa date et son
> périmètre — le chiffre nu était périmé le jour même, puisque quatre
> constructeurs écrivaient en parallèle.

### Les cinq décisions

| ADR      | Décision                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| **0014** | Le `sessionId` est **établi par le socle**, jamais accepté du client. Type marqué, fabrique unique. |
| **0015** | `idFields` n'exonère plus rien : **seul le schéma referme** un champ d'entrée.                      |
| **0016** | L'outil **déclare** ses champs de gouvernance ; union avec le nom, jamais soustraction.             |
| **0017** | `outcome` ne gagne **aucune** valeur ; `externalEffect` devient une colonne de l'empreinte chaînée. |
| **0018** | Le socle est **mono-instance en v1**, tenu par un verrou au démarrage ET un healthcheck à 503.      |

### Deux corrections de cap par rapport à l'énoncé du lot

- **Le `sessionId` n'est PAS dérivé du `jti`** (ADR 0014). Mesure : le jeton
  d'accès vit **1 h** (§ 19.1), une marque de provenance **4 h**
  (`TTL_MARQUAGE_MS`). Une session dérivée du `jti` s'effacerait trois fois par
  TTL, sur un rafraîchissement que le client conduit tout seul — c'est-à-dire
  qu'elle rendrait au client, par la petite porte, le renouvellement qu'on lui
  retire. La session suit **l'octroi**, et `ops_token` gagne la colonne.
- **`outcome` ne gagne aucune valeur** (ADR 0017). L'arbitrage annoncé — « quelle
  valeur ajouter, sachant qu'elle rompt le format » — n'avait pas lieu d'être :
  `OUTCOMES` définit **déjà** `erreur` comme « incompactable
  (`result_too_large`) ». C'est la dérivation qui violait la définition écrite. Le
  champ ajouté est ailleurs, et il répond à une autre question : **ce qui est
  sorti**, pas ce qui est revenu.

### Ce qui est posé, et ce qui est ÉCRIT

**Posé** — `ChampsDeGouvernanceDeclares` et `AUCUN_CHAMP_DE_GOUVERNANCE`
(`core/adapter-kit/types.ts`) · `PorteurDEffetExterieur` et
`EFFET_EXTERIEUR_NON_SURVENU` (`core/audit/vocabulaire.ts`) ·
`SignalEffetExterieur` et `AffineursDAppel` (`core/audit/journal.ts`).

**Écrit, et non seulement déclaré** — `core/identite/` (fabrique de sessions,
forme du § 31, liste des frappeurs) · `core/chaine/identite.ts` ·
`core/adapter-kit/champs-declares.ts` (fermeture d'un champ, cumul de
gouvernance) · `ops/codes-hors-tableau.ts` · `ops/alertes.ts` ·
`ops/mono-instance.ts` · la colonne Prisma `OpsAudit.externalEffect`, son entrée
dans `CHAMPS_COUVERTS` et le cliquet de l'étape 14. `core/instance/verrou.ts`,
lui, ne porte **que des déclarations** : l'arbitre `deciderDemarrageMonoInstance`
que sa prose nomme **n'existe pas encore** — la moitié « constater » de l'ADR
0018 est écrite, la moitié « empêcher » ne l'est pas, et un `it.fails` le
mesure.

Les champs obligatoires sont posés **à côté** des types qu'ils rejoindront, et
non fusionnés : les fusionner aurait fait partir le lot rouge, et le premier
réflexe aurait été de les rendre optionnels — c'est-à-dire la forme sous laquelle
une décision redevient un oubli.

### Ce que la RECETTE a fait, et ce qu'elle n'a pas fait

**Ce qu'elle a fait.**

- **`scope_insufficient` est BRANCHÉ.** `APPEL_STEPS[5].refus` le porte, et les
  **quatre branches de refus** de `core/chaine/etape-05-scopes.ts` le rendent —
  mesuré en faisant refuser l'étape quatre fois et en LISANT le code rendu, pas
  en relisant le tableau. Le module de l'étape n'a pas bougé d'une ligne :
  `refuse()` LIT le code dans l'ancrage. Le `403` du § 11 est inchangé.
  L'`it.fails` d'`ops/codes-hors-tableau.spec.ts` a **basculé en `it()`** — ni
  supprimé, ni affaibli : c'est le signe du progrès. Le canal
  `enAttenteDeBranchement` est désormais **vide** pour les deux écarts assumés.
- **Trois gardes fermées par ce lot ont été ÉPROUVÉES par un témoin posé dans
  le code RÉEL, puis restaurées** (empreintes md5 confrontées avant/après) —
  voir le tableau ci-dessous. Les trois ont rougi.
- **Trois documents comptaient « seize » champs couverts ; l'empreinte en
  compte dix-sept** depuis que l'ADR 0017 y a fait entrer `externalEffect`.
  Corrigés — et surtout, `core/audit/prose-de-l-empreinte.spec.ts` **confronte
  désormais la prose à `CHAMPS_COUVERTS.length`** : le dix-huitième champ fera
  rougir les trois phrases le jour même. Aucune garde ne lisait ces chiffres,
  et c'est exactement pour cela qu'ils avaient dérivé.

**Ce qu'elle n'a pas fait, et pourquoi.** La **couture** des ADR 0015 et 0016
dans `core/chaine` reste **ouverte** : `analyserArgumentsDuSchema()` porte
toujours son paramètre `idFields` et son `identifiants.has(nom) continue`, et
elle n'a toujours **aucun** paramètre pour recevoir `governanceFields`. Les deux
ADR ont atterri côté **manifeste et registre** — la déclaration est confrontée
au schéma, son absence d'effet est **dite** — et pas côté **décision**. Ce sont
des modifications de signature dont les ADR nomment l'ordre et les
conséquences ; elles appartiennent aux constructeurs ② et ③, et les
`it.fails` de `core/epreuve/lot1c-la-couture-manquante.temoin.spec.ts` et de
`core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts` les portent nommément.

### Les trois témoins de la Recette

| Garde éprouvée                  | Témoin posé dans le code réel                                             | Ce qui a rougi                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Souveraineté du `sessionId`     | `sessionDuJetonRelu()` frappe une session à la volée au lieu de la relire | 3 tests d'`identite.spec.ts`, dont G1 : « le rafraîchissement ne blanchit plus » → `autorise`  |
| Étiquetage `idFields`           | la boucle d'annonce d'`enregistrer.ts` ne pousse plus rien                | `registry/champs-declares.temoin.spec.ts` : « 0 ligne(s) » au lieu de 1, admission muette      |
| Cumul des champs de gouvernance | `cumulerChampsDeGouvernance()` remplace au lieu d'unir                    | 7 tests sur 3 fichiers ; `perdus : 11` annoncé, les 11 champs retenus par le nom disparaissent |

### Mesures de fin de lot — 2026-08-31, après la Recette

| Gate                   | Résultat                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`       | vert                                                             |
| `pnpm lint`            | vert                                                             |
| `pnpm format:check`    | vert **sur tout le dépôt**                                       |
| `pnpm prisma:validate` | vert (URL stub `stub.invalid`)                                   |
| `pnpm test`            | **977 verts, 17 `it.fails`, 1 `.todo`, 0 rouge** (838 au lot 1b) |

**76 fichiers de gardes, et aucun sans compte annoncé** — mesuré deux fois, et
les deux mesures sont écrites parce qu'elles ne disent pas la même chose : `0`
fichier sans aucune annonce `console.*`, et `0` fichier dont les annonces ne
porteraient **aucun nombre**. La seconde est la vraie : une annonce sans chiffre
est une couleur.

**11 étapes applicables au JSON-RPC, 11 revendiquées par un module propriétaire,
0 orpheline** ; **5** de ces modules vivent dans `core/chaine` et **existent sur
le disque**, 0 fantôme ; `etapesNonImplementees()` rend **0**.

⚠️ **LA FORMULE « 14 ÉTAPES AVEC UN MODULE PROPRIÉTAIRE CHACUNE » N'EST LA
MESURE DE RIEN**, et elle circule. Le registre porte **15** entrées (les 14 du
§ 11, plus l'étape 0 du § 23) ; **4** d'entre elles sont « HTTP seul » et
attendent `core/transport/`, qui n'existe pas ; **5** ont un module livré. Le
lot 1b écrivait la chose exactement — « les quatorze étapes ont un
PROPRIÉTAIRE, et les cinq de `core/chaine` sont IMPLÉMENTÉES » — et c'est la
reprise abrégée qui a transformé un périmètre d'observation en garantie.

⚠️ **LES 17 `it.fails` SE LISENT PAR LEUR LISTE, JAMAIS PAR LEUR NOMBRE.** Deux
`it.fails` peuvent très bien être deux autres : celui de la Recette a basculé
(18 → 17) pendant que d'autres arrivaient. Chacun porte l'attente d'un défaut
**nommé et encore ouvert** — couture des ADR 0015/0016, resserrement du type
`SessionId` en aval, `dependentSchemas` absent du parcours de fermeture,
`idempotencyKey` hors schéma, section critique de `JournalMemoire`, arbitre du
verrou mono-instance, ligne d'intention non armée, `tool` brut perdant sa ligne
de journal.

---

## Lot 1b, seconde moitié — l'orchestrateur et les quatorze étapes — 2026-08-31

La première moitié (ci-dessous) avait **posé les interfaces** des cinq étapes du
§ 11 sans propriétaire, et laissé l'orchestrateur sans corps. Conséquence
mesurée, non supposée : chaque appelant devait réécrire à la main deux gardes de
sécurité — l'étape 5 (scopes) et l'étape 11 (provenance). Cette moitié-ci les
**écrit**, les câble dans un ordre qui appartient à quelqu'un, et **referme dix-sept
défauts que ses propres témoins adverses ont trouvés.**

### Ce qui est construit

| Module / fichier                     | Ce qu'il porte                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `core/chaine/etape-05-scopes.ts`     | § 19.2 — le scope exigé par `effect`, en lecture stricte (aucune implication entre scopes).              |
| `core/chaine/etape-06-outil.ts`      | § 14 corr. 3 — l'outil existe, il est activé, et son épinglage n'a pas divergé.                          |
| `core/chaine/etape-09-curseur.ts`    | § 13.1 — curseur signé HMAC, `filtersHash`, refus qui dit de repartir de la première page.               |
| `core/chaine/etape-11-provenance.ts` | § 20 — la garde d'exfiltration : index en mémoire, borné en durée et en taille, quatre branches.         |
| `core/chaine/etape-14-execution.ts`  | § 13.2 / 13.3 / 18 — exécution, masquage, cascade de compaction, enveloppe bâtie depuis un littéral.     |
| `core/chaine/orchestrateur.ts`       | **L'ORDRE.** Étape 0, puis 5 à 14. Invariant de sortie tenu par le TYPE DE RETOUR, pas par une consigne. |
| `core/chaine/modules.ts`             | La SEULE table qui dise quel fichier exécute quelle étape. Les deux registres la LISENT.                 |

### Ce que la recette a refermé

Dix-sept défauts, tous trouvés par un témoin exécuté, tous laissant derrière eux
une garde qui rougit sur ce témoin. **Aucun test n'a été supprimé pour obtenir du
vert** : trente-six témoins adverses sont passés de `it.fails` à `it()`, la
plupart sans qu'une ligne de leur corps ne change — parce qu'ils portaient déjà
l'attente du CDC, jamais la valeur fausse. Le détail de ceux dont une assertion a
bougé, et pourquoi, est dans `docs/ETAT.md` § 8.4.

**Bloquants**

- **La politique était FAIL-OPEN sur tout niveau hors énumération.**
  `deciderEtape10` testait `brouillon`, puis `confirmé` : toute autre valeur
  tombait dans la branche PERMISSIVE et valait `libre`. Six formes de corruption
  ordinaires — un espace de fin, une casse changée, un octet nul, une colonne
  vide, une valeur d'une autre énumération, un accent perdu à l'import —
  faisaient **toutes** partir un `send` sans confirmation. Le § 20 dit l'inverse :
  `brouillon` est le niveau de repli « en cas de panne, CORRUPTION ou
  redémarrage ». Le repli est posé, et le message sépare « la politique refuse »
  de « la politique est illisible » : les deux ne se réparent pas du même geste.
- **L'orchestrateur ne confrontait jamais le niveau rendu par le port à
  `POLICY_LEVELS`.** Mesuré sur la chaîne complète : effet parti, **et pas même
  une ligne d'`ops_audit`** — un `policyLevel` hors énumération étant refusé par
  la garde du § 31, après coup. Le même fichier fail-closait pourtant déjà,
  explicitement, sur un TRANSPORT inconnu : l'asymétrie était le défaut.
- **Un adaptateur pouvait faire perdre la ligne d'audit d'un appel dont l'effet
  était déjà parti.** `recordIds` traversait tout le socle sans normalisation
  jusqu'à la garde du § 31, qui refusait la ligne — hors du `try` de
  `journaliser`, donc sans même l'habillage. Répétable, à chaque appel, sans
  aucune panne d'infrastructure : l'objectif **O6 était faux** pour tout appel que
  cet adaptateur servait. La normalisation est posée à l'étape 14, et elle
  **dérive** sa forme et ses deux plafonds de `core/audit/contenu.ts`.
- **Le contrôle 7 du § 09 était aveugle aux propriétés déclarées hors de
  `properties`.** Le même nom réservé passait ou non selon l'endroit du schéma où
  on l'écrivait. Pire : `analyserFermeture` déclarait `ferme: true` — net, positif
  et faux — sur un schéma acceptant n'importe quelle clé.
- **La cinquième règle du § 20 était désarmée d'un mot.** `estTexteLibre()`
  traitait la PRÉSENCE de `format` ou de `pattern` comme une fermeture de
  l'ensemble des valeurs. Or `format` est une ANNOTATION en draft 2020-12, et un
  `pattern` peut être vacant. Cinq formes de texte libre parfaitement ordinaires
  rendaient `porteUnArgumentLibre: false`, donc ne déclenchaient RIEN.

**Majeurs**

- Les deux registres d'étapes se **contredisaient sur les cinq**, et rien ne les
  confrontait : le reste-à-faire renvoyait vers cinq chemins fantômes, et aurait
  envoyé le constructeur suivant écrire un fichier déjà écrit sous un autre nom.
- `core/chaine/index.ts` n'exportait **aucun** des cinq exécutants : l'appelant
  n'avait pas de quoi nourrir `DependancesOrchestrateur` — le défaut d'origine du
  lot, intact.
- Un niveau permissif calculé sur **zéro ligne examinée** ouvrait quand même. Le
  compte était publié par la trace, et jamais confronté.
- Les trois familles accentuées du § 20 ne mordaient qu'en NFC : un nom reçu en
  forme décomposée s'affiche à l'identique et ne se compare pas.
- `FORME_SOURCE` admettait les phrases écrites en slug — 2 048 octets de budget
  d'injection dans `meta`. La borne de PHRASE existait déjà à un module de là.
- La charge de l'adaptateur n'était **typée qu'à la compilation** : une chaîne à
  la place d'un tableau était itérée caractère par caractère, et l'enveloppe
  inventait des canaux.
- Cinq canaux en échec aux noms mal formés **fondaient en une seule entrée**.

**Mineurs**

- Le bloc `finally` affirmait que « les deux clôtures ont lieu quoi qu'il
  arrive » ; la première n'était pas protégée, et la seconde est celle qui compte.
- À scopes vides, le numéro d'étape refusante distinguait un outil qui existe d'un
  outil qui n'existe pas — un oracle d'énumération du catalogue.
- Deux fichiers de gardes du lot 1 n'annonçaient **aucun compte** : un vert y
  était indiscernable d'un vert obtenu sur zéro élément mesuré.

### Ce qui reste, et qui attend une décision de Will

- **`ops_audit` nie une exécution qui a eu lieu.** Un `send` PARTI dont la réponse
  dépasse le plafond est journalisé « refusé / non-exécuté ». La ligne existe,
  l'invariant tient — elle est FAUSSE, et le § 24 rangera cet envoi parmi les
  appels qui n'ont rien fait. Arbitrage **ADR 0002** : `outcome` entre dans
  l'empreinte chaînée. Témoin sous `it.fails`.
- **`idFields` est déclaré par l'adaptateur et confronté à rien.** Le § 20 pose
  que « l'étiquetage se décide côté socle, jamais sur déclaration » ; ici une
  déclaration décide. Deux voies, aucune sans coût, et la règle appartient au
  registre — pas à l'étape 11.
- **Le `sessionId` n'est ni contraint, ni authentifié, ni lié au jeton.** Toute la
  garde du § 20 s'y ancre. Le contrat manquant doit être écrit AVANT tout
  transport.
- **L'enveloppe n'a aucun champ pour dire ce qu'elle a perdu** — sources écartées
  par le plafond, valeur d'agrégat absente. Le § 13.2 énumère treize champs et
  n'en prévoit aucun ; en ajouter un est une décision de CDC.
- Le § 15 sans code pour un scope insuffisant, le § 24 sans ligne pour l'écart
  d'épinglage, l'index de provenance **local au processus**, et cinq bornes de
  durée à revoir au lot 6.

Le détail complet, avec les mesures et leurs bornes, est dans `docs/ETAT.md`.

### Mesures

`pnpm typecheck` vert · `pnpm lint` vert · `pnpm format:check` vert **sur tout le
dépôt** · **838 tests verts, 2 `it.fails`, 1 `.todo`, 0 rouge** (738 à la
première moitié, 511 au lot 1). **64 fichiers de gardes, et plus aucun sans
compte annoncé.** Quatre gardes ont été éprouvées par un témoin fabriqué posé
dans le code RÉEL, puis restaurées — chemin de module fantôme, garde fail-closed
de politique neutralisée, `format` redevenu une fermeture, `continue-on-error`
dans la vraie CI : les quatre ont rougi.

**Les quatorze étapes du § 11 ont désormais un propriétaire, et les cinq de
`core/chaine` sont IMPLÉMENTÉES** — `etapesNonImplementees()` rend zéro, et deux
gardes l'adossent à autre chose qu'une déclaration : le fichier nommé par le
registre doit EXISTER sur le disque, et le résolveur doit RENDRE une fonction.

---

## Lot 1b, première moitié — les arbitrages et la chaîne d'appel — 2026-08-31

> ⚠️ **La section « ce qui reste » de cette entrée est PÉRIMÉE** : les cinq étapes
> y étaient déclarées et non implémentées, et l'orchestrateur n'avait pas de
> corps. Les deux sont faits — voir l'entrée ci-dessus. Le reste de l'entrée
> (décisions, ADR, ruptures de format) tient inchangé.

Aucun module métier, aucune ligne de production nouvelle. Ce lot **tranche
quatre décisions** que le lot 1 avait refusé de prendre seul, et **pose les
interfaces** des cinq étapes du § 11 qui n'avaient aucun propriétaire.

### Les quatre décisions, avec leur ADR

| ADR      | Décision                                                                            | Ce qu'elle ferme                                                     |
| -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **0002** | `ops_audit` en ajout seul (rôle PostgreSQL) **et** `selfHash` scellé par HMAC.      | Le journal se recalculait : `valide = true` sur un journal amputé.   |
| **0003** | Le registre exige un `inputSchema` FERMÉ, dans **deux** dialectes.                  | Un manifeste PHP portant `peutVoirAppels` était admis sans un mot.   |
| **0004** | `profilesVersion` et `profilesSha` entrent dans le manifeste.                       | `empreinteProfils()` était une garde branchée nulle part.            |
| **0005** | `vault_locked` entre dans `ERROR_CODES` ; le refus de coffre devient l'**étape 0**. | `stepDenied` restait nul : le refus était indiscernable d'une panne. |

### Ce qui est construit

| Module / fichier                            | Ce qu'il porte                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core/chaine/etapes.ts`                     | Les cinq étapes orphelines — 5, 6, 9, 11, 14 — **déclarées** : ancrage dérivé, verdict typé, ports.      |
| `core/chaine/orchestrateur.ts`              | L'ossature : signature, contexte d'appel, invariant de sortie tenu **par le type de retour**. Elle LÈVE. |
| `core/sceau/`                               | Le scellement HMAC de la chaîne d'`ops_audit`, hors de `core/audit` pour ne désarmer aucune garde.       |
| `core/adapter-kit/fermeture.ts`             | Une seule définition de « schéma fermé », deux appelants : le build et l'admission.                      |
| `core/audit/droits-sql.ts`                  | La lecture du script de droits — elle prouve ce que le script DIT, pas ce que le cluster applique.       |
| `prisma/sql/0001-ops-audit-append-only.sql` | Deux rôles de groupe, `NOLOGIN` : l'écriture n'a pas `DELETE`, la purge n'a pas `INSERT`.                |

### Ce que ces changements CASSENT — et pourquoi maintenant

Deux d'entre eux changent un format, et **aucun des deux n'aurait pu attendre** :

- le `selfHash` passe d'un SHA nu à un HMAC : **toutes** les empreintes du
  journal changent. Aucune base ne tourne, aucune ligne n'existe ;
- le manifeste passe de sept à neuf clés : **toutes** les empreintes épinglées
  changent. `adapters.lock.json` n'existe qu'en exemple.

Après le premier chaînage et le premier épinglage, l'un aurait exigé une clôture
de rupture, l'autre de revalider à la main chaque `manifestSha` de chaque dépôt
tiers.

### Ce qui reste, et qui est mesuré

- **Les cinq étapes sont DÉCLARÉES, pas implémentées.** `ETAPES_CHAINE` porte un
  `statut` par étape, et `etapes.spec.ts` rougit sur une entrée qui se dirait
  implémentée sans porter de fonction. Le reste-à-faire est calculé, pas écrit.
- **L'orchestrateur n'a pas de corps** et lève `ErreurOrchestrateurNonImplemente`
  plutôt que de rendre un verdict : rendre « autorisé » servirait un appel
  qu'aucune garde n'a examiné ; rendre « refusé » écrirait dans `ops_audit` un
  refus que personne n'a prononcé.
- **Trois colonnes manquantes à `ops_audit`** — version de clé de scellement,
  population d'`argHash`, état de coffre — entreraient **toutes trois** dans
  l'empreinte chaînée du § 12. Elles doivent être décidées ENSEMBLE, et avant le
  premier chaînage réel. Voir ADR 0002 § « ce qui reste ouvert ».

### Correctifs et chaîne d'intégration (même lot)

| Ce qui est posé                                | Ce que ça ferme                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `core/audit/roles.ts` + `roles.spec.ts`        | La moitié CODE de l'ADR 0002 : qui écrit, qui supprime. Rien, côté socle, ne refusait une purge qui insère.                             |
| Grammaire de `scope` **tranchée**              | `adapterId` ne porte AUCUN point. `scopeCouvre()` passe par `scopeDomine()` : une seule dérivation (ETAT § 4.4).                        |
| Refus `id_innommable_par_un_scope` au registre | Un manifeste étranger pouvait s'enregistrer sous `zoho.mail` : sa politique portait sur l'adaptateur `zoho`.                            |
| `ops_audit.argHashValidated`                   | Les deux populations d'`argHash` (ETAT § 4.6). ⚠️ Elle ENTRE dans l'empreinte chaînée (`CHAMPS_COUVERTS`, dix-sept champs aujourd'hui). |
| `.github/workflows/ci.yml` + `ops/`            | La CI n'existait pas (ETAT § 3.3). Aucune `continue-on-error`, et une garde LIT le YAML pour l'exiger.                                  |
| `core/limits/memoire.ts`                       | Quatre copies divergentes des dépôts en mémoire, dans quatre fichiers de gardes.                                                        |

**La CI sait rougir, et c'est mesuré.** `ops/temoin-ci.ts` fabrique un défaut
par gate, exige que chacune échoue, retire le défaut et exige que chacune
reverdisse — sans la seconde moitié, une gate cassée en permanence passerait
pour une gate qui mord. **Un secret absent FAIT ÉCHOUER l'étape** (`ops/secrets.ts`,
liste vide aujourd'hui, mécanique en service).

⚠️ **Une seule des trois colonnes annoncées ci-dessus a été posée.** La version
de clé de scellement et l'état de coffre restent ouverts, et l'empreinte
chaînée changera encore si on les ajoute. Sans coût tant qu'aucune base ne
tourne — voir ADR 0002 § 4.1, mis à jour.

### Mesures

`pnpm typecheck` vert · `pnpm lint` vert · `pnpm format:check` vert **sur tout
le dépôt** · `pnpm prisma:validate` vert (URL stub) · **738 tests verts,
1 `.todo`, 0 rouge** (511 au lot 1, 570 au premier jet du lot 1b).
Le `.todo` restant est celui de la racine de composition, inchangé.
`ops/temoin-ci.ts` : 4 gates éprouvées, 0 anomalie.

---

## Lot 1 — cœur du socle — 2026-08-30

Premier lot. Le dépôt passe de vide à un socle qui compile, se garde et se
mesure. **Aucun secret réel, aucun appel réseau sortant, aucun déploiement** :
les portes du lot 0a (Cloudflare Access, rotation du jeton Coolify) ne sont pas
posées, c'est pourquoi rien n'est exposé.

### Ce qui est construit

| Module             | Ce qu'il porte                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `core/types`       | Le vocabulaire fermé du CDC : `Effect`, `DataClass`, `PolicyLevel`, `OpsScope`, `ErrorCode`, `APPEL_STEPS`. |
| `core/vault`       | Coffre AES-GCM, AAD = `name‖version`, trois états, rotation reprenable, plafond d'amorçage (§ 27).          |
| `core/policy`      | Niveau appliqué, effet, confirmation liée à l'`argHash`, asymétrie resserrer/desserrer, TOTP (§ 20).        |
| `core/limits`      | Étapes 8, 12, 13 : schéma, quota, idempotence. `argHash` HMAC clé (§ 12, règle 2).                          |
| `core/audit`       | Journal chaîné, invariant de sortie, purge ancrée, garde de contenu (§ 11, § 31).                           |
| `core/profiles`    | Énumération fermée des profils, budget du § 14 en octets UTF-8, projection servie.                          |
| `core/registry`    | Admission d'un manifeste reçu, verrou d'épinglage, production des lignes `ops_tool` (§ 09).                 |
| `core/adapter-kit` | Contrat d'adaptateur, manifeste, harnais de conformité en neuf contrôles.                                   |

### Défauts fermés pendant la recette

Chacun a été trouvé par un témoin exécuté, et chacun laisse derrière lui une
garde qui rougit sur ce témoin.

**Bloquants**

- **Le coffre s'ouvrait sur une clé de trente-deux octets à zéro.** Elle
  provisionnait, le socle s'annonçait `ouvert` / `vaultLocked: false`, nominal —
  et comme `keyId` est dérivé du matériau, il était publiquement calculable :
  le sceau se déchiffrait avec la clé évidente. `motifCleInvalide` refuse
  désormais ce matériau. _(`core/vault/chiffrement.ts`)_
- **Le plafond d'amorçage du § 27 était un lire-puis-écrire.** Six amorçages
  concurrents passaient tous et le compteur doublait le mur, sur un plafond dont
  chaque dépassement est irrécupérable. La condition voyage maintenant DANS
  l'écriture (`incrementerBootstrapCountSousPlafond`). _(`core/vault/`)_
- **Le chemin LIBRE prolongeait un desserrage sans borne.** À niveau égal, le
  tri resserrage/desserrage ne voyait rien : depuis `mcp`, sans second facteur
  ni `ops:policy`, on repoussait la fermeture de 12 h à un siècle — ou on
  déposait sous une ligne large et brève une ligne étroite et éternelle que rien
  ne remplaçait. Règle posée : **un resserrage ne recule jamais l'instant où la
  surface se referme.** _(`core/policy/desserrage.ts`)_
- **Le filtre de commentaires effaçait du CODE.** Deux chaînes anodines — ou
  deux motifs de globbing — encadrant un `process.env.ZOHO_SECRET` écrit nu
  suffisaient à aveugler le contrôle 2 du § 09, la seule garde de sécurité du
  harnais. Le filtre est devenu un balayage à états ; **et le contrôle 2 lit
  désormais le source BRUT**, pour ne dépendre d'aucun filtre.
  _(`core/adapter-kit/`)_
- **L'empreinte et la forme lisaient deux documents différents.** Un `toJSON`
  hérité rendait un manifeste bénin à `JSON.stringify` pendant que les
  propriétés propres portaient le manifeste hostile : le refus n° 1 du § 09 —
  celui qui protège de tous les autres — était hors service. Refusé à la
  frontière. _(`core/adapter-kit/json.ts`)_

**Majeurs**

- **La cause première disparaissait en double panne.** Corps qui lève + journal
  indisponible : le `throw erreur` n'était jamais atteint. Un `AggregateError`
  porte maintenant les deux ; aucune ne masque l'autre. _(`core/audit/journal.ts`)_
- **Un desserrage annoncé en panne restait écrit en base.** La relecture
  post-écriture rouvrait une fenêtre. `niveauApres` est dérivé de la simulation.
- **La protection 4 du § 20 n'était câblée nulle part.** `demarrerPolitique()`
  existe désormais et referme un desserrage en cours au redémarrage.
- **`ops_tool.bytes` était dérivé deux fois, différemment** (~38 % d'écart entre
  le registre et le budget). Une seule fonction, deux appelants.
- **`ops.audit.purge` n'était réservé par rien.** Un adaptateur pouvait rendre
  la vérification du journal rouge en permanence. Refusé à l'enregistrement, en
  **important** la constante.
- **Deux `argHash` pour un seul appel.** Le journal empreignait la charge brute,
  le jeton du § 20 la valeur validée : dès qu'un schéma porte un `.default()`,
  les deux désignaient des appels différents. L'en-tête est affiné après
  l'étape 8.
- **`appliquerLimites` soudait 8-12-13 sans couture pour 9, 10 et 11.** La
  composition naturelle brûlait le quota d'un appel que la politique refusait.
  `entreSchemaEtQuota` est **obligatoire** : le compilateur ne laisse plus
  l'oublier.
- **Deux ports déclarés et fournis par personne.** `ArgHasher` porte la forme de
  son fournisseur ; `Coffre.lireCleArgHash()` implémente `CoffreArgHash`.
- **`recordIds` acceptait une adresse e-mail et une phrase à tirets.**

**Mineurs**

- `ttlMs` d'idempotence non borné : un `ttlMs` non fini figeait la clé à jamais.
- `MODES_IDEMPOTENCE` recopiait `IDEMPOTENCIES` : une seule déclaration.
- `ETAPE_POLITIQUE` était écrit en dur : dérivé d'`APPEL_STEPS`.
- `enregistrer.spec.ts` recopiait l'énumération des profils : dérivée.
- Le libellé du contrôle 3 promettait plus que sa mesure.
- `ops_tool` a reçu `retiredAt` / `sunsetAt` (§ 13.4), sans quoi
  `retireDeLaListe` vaudrait `false` pour toujours.
- Scripts `format` / `format:check` ajoutés ; tout le dépôt reformaté.

### Ce qui reste ouvert

Voir **`docs/ETAT.md`** — deux gardes sont marquées `.todo` avec leur motif, et
sept points attendent un arbitrage de Will.

### Mesures de fin de lot

| Gate                | Résultat                      |
| ------------------- | ----------------------------- |
| `pnpm typecheck`    | vert                          |
| `pnpm lint`         | vert                          |
| `pnpm format:check` | vert                          |
| `pnpm test`         | 511 verts, 2 `.todo`, 0 rouge |
