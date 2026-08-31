# État du socle `axion-ops` — fin du lot 1

**Date : 2026-08-30.** Établi par la Recette, après quinze passes de
construction, de croisement et d'épreuve.

> **Rien n'est déployé, rien n'est exposé, aucun secret réel n'existe dans ce
> dépôt.** Les portes du lot 0a — Cloudflare Access devant la console, rotation
> du jeton Coolify — ne sont pas posées. C'est la raison d'être de cette
> retenue, pas une négligence.

> ### ⚠️ 2026-08-31 — CE DOCUMENT DATE DE LA FIN DU LOT 1
>
> Le **lot 1b** a tranché quatre des points laissés ouverts ici, et modifié le
> code en conséquence. Les paragraphes concernés portent un marqueur ✅ et
> renvoient à l'ADR qui les ferme. Le reste du document reste vrai.
>
> | Point ouvert au lot 1                 | Tranché par | Ce qui a changé                                      |
> | ------------------------------------- | ----------- | ---------------------------------------------------- |
> | § 3.1 — cinq étapes sans propriétaire | lot 1b      | les cinq sont ÉCRITES et CÂBLÉES — voir § 3.1 et § 8 |
> | § 4.1 — le journal se recalcule       | ADR 0002    | rôle en ajout seul + `selfHash` scellé par HMAC      |
> | § 4.2 — schéma d'entrée non fermé     | ADR 0003    | le registre exige la fermeture, deux dialectes       |
> | § 4.3 — l'empreinte des profils       | ADR 0004    | `profilesVersion` / `profilesSha` au manifeste       |
> | (nouveau) `vault_locked`, étape 0     | ADR 0005    | 14 codes d'erreur, `AppelStep = 0 \| 1 \| … \| 14`   |
>
> **Mesures à la fin du lot 1b** : `pnpm typecheck` vert, `pnpm lint` vert,
> `pnpm format:check` vert **sur tout le dépôt**, **838 tests verts,
> 2 `it.fails`, 1 `.todo`, 0 rouge** (contre 511 + 2 `.todo` à la fin du lot 1).
>
> ⚠️ **CE QUE LES DEUX `it.fails` SONT, ET POURQUOI ILS NE SONT PAS DES ROUGES.**
> Un `it.fails` porte l'attente CORRECTE — celle du CDC — et est vert TANT QUE le
> socle ne la tient pas. Ce sont donc **deux défauts ouverts, datés et
> instrumentés**, pas deux tests qui passent. Le jour où on les corrige, ils
> rougissent, ce qui force à les repasser en `it()`. Les deux demandent un
> arbitrage : voir **§ 8**.

---

## 1 · Les quatre gates, mesurées

| Gate   | Commande            | Résultat                          |
| ------ | ------------------- | --------------------------------- |
| Types  | `pnpm typecheck`    | **vert** — aucune sortie          |
| Style  | `pnpm lint`         | **vert** — aucune sortie          |
| Format | `pnpm format:check` | **vert** — tous les fichiers      |
| Tests  | `pnpm test`         | **511 verts, 2 `.todo`, 0 rouge** |

**Périmètre mesuré**, écrit avec la mesure : 99 fichiers TypeScript dans
`core/` (57 de code, 42 de gardes), 42 fichiers de tests, 513 tests déclarés.
Les dossiers `adapters/`, `console/`, `voice/` et `ops/` sont **vides** — c'est
le lot 2.

⚠️ **Ce que « vert » ne prouve pas — mis à jour au lot 1b.** La CI existe
désormais (`.github/workflows/ci.yml`, § 3.3) et lance ces quatre commandes plus
la validation du schéma. Elle **sait rougir**, et c'est mesuré, pas affirmé :
`ops/temoin-ci.ts` fabrique un défaut par gate et exige que chacune échoue, puis
reverdisse. Ce qu'elle ne prouve toujours pas : qu'une PR rouge ne peut pas être
fusionnée — la protection de branche est un réglage GitHub, hors du dépôt.

---

## 2 · Ce qui est construit

Huit modules sous `core/`, tous avec leurs gardes à côté du code.

- **`core/types`** — le vocabulaire fermé : `Effect`, `DataClass`,
  `PolicyLevel`, `OpsScope`, `ErrorCode`, et `APPEL_STEPS`, la table des étapes
  du § 11 dont les autres modules **dérivent** leurs numéros.
- **`core/vault`** — coffre AES-GCM, AAD = `name‖version`, trois états
  (absent / verrouillé / ouvert), rotation reprenable par `keyId`, plafond
  d'amorçage atomique du § 27.
- **`core/policy`** — le niveau appliqué à un outil, l'effet, le jeton de
  confirmation lié à l'`argHash`, l'asymétrie resserrer/desserrer du § 20, le
  TOTP (RFC 6238, gardé par les six vecteurs de l'appendice B), et la
  **procédure de démarrage** qui referme un desserrage en cours.
- **`core/limits`** — étapes 8, 12 et 13, dans cet ordre, avec la couture
  obligatoire où viennent se placer 9, 10 et 11.
- **`core/audit`** — le journal chaîné, l'invariant de sortie (« toute
  terminaison écrit exactement une ligne »), la purge ancrée par clôture, la
  garde de contenu du § 31.
- **`core/profiles`** — l'énumération fermée des profils et le budget du § 14,
  compté en **octets UTF-8** (aucun tokenizer : `countTokens` du SDK est un
  appel HTTP, et ce chantier n'émet aucun appel sortant).
- **`core/registry`** — l'admission d'un manifeste venu d'ailleurs, le verrou
  d'épinglage, et la production des lignes `ops_tool`.
- **`core/adapter-kit`** — le contrat d'adaptateur, le manifeste, et le harnais
  de conformité en neuf contrôles.

**Dépendances** : aucune n'a été ajoutée. Les quatre `core/*/DEPS.md` déclaraient
tous « aucune dépendance nouvelle » ; ils ont été lus, leurs écarts reportés
ci-dessous, puis supprimés.

---

## 3 · Ce qui n'est PAS construit

### 3.1 · Cinq étapes du § 11 n'ont aucun module — `it.todo` n° 1

> ✅ **2026-08-31, lot 1b seconde moitié — REFERMÉ.** Les cinq modules sont
> ÉCRITS, testés, exportés par `core/chaine/index.ts`, et câblés par
> `orchestrerAppel()`, qui a désormais un corps. `etapesNonImplementees()` rend
> **zéro**.
>
> | Étape | Module RÉEL                          |
> | ----- | ------------------------------------ |
> | 5     | `core/chaine/etape-05-scopes.ts`     |
> | 6     | `core/chaine/etape-06-outil.ts`      |
> | 9     | `core/chaine/etape-09-curseur.ts`    |
> | 11    | `core/chaine/etape-11-provenance.ts` |
> | 14    | `core/chaine/etape-14-execution.ts`  |
>
> ⚠️ **CE QUI ADOSSE CE ZÉRO À AUTRE CHOSE QU'UNE DÉCLARATION.** Un registre qui
> se dit implémenté est de la prose, et de la prose ne contredit que de la prose.
> Ce reste-à-faire a d'ailleurs MENTI pendant tout le lot : il nommait cinq
> fichiers qui n'existaient pas, pendant qu'un second registre en nommait cinq
> autres qui existaient, sans que rien ne les confronte. Deux gardes le tiennent
> désormais : le fichier nommé par `module` doit **EXISTER sur le disque**, et le
> résolveur d'`executer` est **APPELÉ** — il doit rendre une fonction. Et il n'y a
> plus qu'une seule table (`core/chaine/modules.ts`), lue par les deux registres.
>
> ⚠️ **La table de noms de modules ci-dessous est PÉRIMÉE** : `core/scopes/`,
> `core/catalogue/` et les autres n'ont jamais été retenus. Elle est conservée
> telle quelle parce qu'elle porte le RAISONNEMENT — « pourquoi c'est grave » —
> qui, lui, reste juste et explique ce que le lot a refermé.

`core/__tests__/integration.spec.ts` → « quelles étapes un module
revendique-t-il ? »

Sur les dix étapes du § 11 applicables au transport JSON-RPC, **cinq n'ont
aucun propriétaire** :

| Étape | Ce qu'elle fait                   | Module à écrire    |
| ----- | --------------------------------- | ------------------ |
| 5     | scopes suffisants pour l'`effect` | `core/scopes/`     |
| 6     | l'outil existe et est activé      | `core/catalogue/`  |
| 9     | curseur signé / `filtersHash`     | `core/cursor/`     |
| 11    | provenance                        | `core/provenance/` |
| 14    | exécution + compaction (§ 13.3)   | `core/compaction/` |

**Pourquoi c'est grave.** Deux d'entre elles (5 et 11) sont des gardes de
**sécurité** ; une (9) empêche une fenêtre de pagination silencieusement fausse.
Tant qu'elles n'ont pas de module, **chaque appelant les réécrit à la main** —
c'est ce que l'orchestrateur des tests fait, et cette main-là n'est gardée par
rien. Corollaire non couvert : rien ne force l'`effect` à être lu dans
`ops_tool` plutôt que reçu de l'appelant.

**Pourquoi `.todo` et non rouge.** Écrire cinq modules est un LOT, pas un
correctif ; à la hâte, ils produiraient exactement ce que ce chantier interdit —
des gardes vertes parce qu'elles ne mesurent rien. Relâcher la garde à la valeur
observée (`[5,6,9,11,14]`) la ferait cesser de garder : une sixième étape
orpheline resterait verte. La laisser rouge masquerait toutes les autres
régressions.

**La garde est écrite pour verdir toute seule** le jour où ces modules existent,
chacun exportant sa constante d'étape comme `ETAPE_POLITIQUE` et
`ETAPES_LIMITES` le font déjà.

⛔ **Arbitrage Will : ces cinq modules sont-ils le lot 2 ?**

### 3.2 · La racine de composition n'existe pas — `it.todo` n° 2

`core/epreuve/politique-chemins-de-panne.spec.ts` → « est appelée par l'entrée
du conteneur ».

Il n'y a **ni serveur HTTP, ni transport stdio, ni point d'entrée**. Trois
conséquences mesurées :

1. `demarrerPolitique()` (protection 4 du § 20) existe et fonctionne, mais
   **rien ne l'appelle**. Tant que l'entrée du conteneur ne l'exécute pas au
   démarrage, un socle qui redémarre pendant un desserrage reprend au dernier
   niveau connu — ce que le § 20 interdit nommément.
2. `PROFILE_NAMES` n'est passé à `creerAdapterKit()` ni à
   `enregistrerAdaptateur()` par aucun appel de production. La « seule garde du
   budget qui ne dépende d'aucun adaptateur » (§ 14) est déclarée, armée nulle
   part. `EntreeEnregistrement.profilsConnus` reste typé `readonly string[]` :
   même au jour du câblage, rien ne rattraperait un appelant qui passerait une
   autre liste. **Correctif préparé** : paramétrer sur `<TProfile extends
string>` pour que le compilateur voie le raccordement.
3. `Coffre.lireCleArgHash()` fournit désormais le port `CoffreArgHash`, mais
   personne ne branche encore le coffre au calcul d'`argHash`.

### 3.3 · ✅ La CI existe désormais (lot 1b)

`.github/workflows/ci.yml`. Le § 23 décrit « push → typecheck · lint · tests
unitaires · harnais de conformité » ; les cinq gates sont posées, plus la
validation du schéma Prisma contre l'URL **stub** (`stub.invalid`, RFC 2606).

**AUCUNE étape ne porte `continue-on-error`**, et ce n'est pas une promesse :
`ops/workflow.spec.ts` LIT le fichier et rougit sur quatre formes —
`continue-on-error`, un `if:` conditionné à un secret, un code de retour écrasé
(`|| true`, `set +e`), une sortie d'erreur jetée. Elle annonce le nombre de
fichiers, de lignes et d'étapes examinés.

**Un secret absent FAIT ÉCHOUER l'étape, il ne la fait pas sauter.**
`ops/secrets.ts` porte la liste — **vide aujourd'hui**, et l'étape l'écrit
plutôt que de le taire : le socle ne sort pas de la machine. La mécanique, elle,
est en service, et `ops/secrets.spec.ts` l'éprouve sur les trois formes
d'absence (non exposé, chaîne vide, espaces seuls) — la deuxième étant celle que
GitHub Actions produit pour un nom mal orthographié.

**La CI sait rougir, et c'est MESURÉ.** Le job `temoin` lance
`ops/temoin-ci.ts`, qui fabrique un défaut pour chacune des quatre gates, exige
que chacune ÉCHOUE, retire le défaut et exige que chacune REVERDISSE. Sans la
seconde moitié, une gate cassée en permanence passerait pour une gate qui mord.
Exécuté à la main sur ce dépôt : `typecheck` code 2 / 0, `lint` 1 / 0,
`format:check` 1 / 0, `test` 1 / 0 — quatre gates, zéro anomalie.

⚠️ **Ce que la CI ne prouve pas.** Aucune protection de branche n'est déclarée
ici : rien, dans ce dépôt, ne dit qu'une PR rouge ne peut pas être fusionnée.
C'est un réglage GitHub, hors du dépôt, et aucune garde de texte ne l'atteint.
Les actions tierces sont épinglées **par étiquette** (`@v4`), pas par SHA.

---

## 4 · Ce qui attend une décision de Will

Sept points. Aucun n'est un bug à corriger : chacun est un choix que la Recette
a refusé de trancher seule.

### 4.1 · 🔴 Le journal ne résiste pas à une réécriture complète

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0002.** Les DEUX sorties ont été
> prises, parce qu'elles ne couvrent pas le même attaquant : un rôle PostgreSQL
> en ajout seul (`prisma/sql/0001-ops-audit-append-only.sql`, avec une purge sous
> un autre rôle) ET le `selfHash` scellé par HMAC (`core/sceau/`). Réécrire le
> journal exige désormais deux compromissions distinctes. **Reste ouvert** :
> `ops_audit` ne porte aucune version de clé de scellement.

`prisma/schema.prisma` + `core/audit/verification.ts`

Le chaînage est un **SHA-256 nu, sans clé**, et **aucun rôle base append-only
n'existe** (aucun `REVOKE` dans le dépôt). Tout compte disposant d'`UPDATE` /
`DELETE` sur `ops_audit` peut retirer une tranche **puis recalculer toute la
chaîne** : `verifierChaine` rend alors `valide = true` sur un journal amputé.

Les quatre gardes de troncature ne mordent donc que sur un attaquant qui aurait
`DELETE` **sans** `INSERT` — une répartition de droits que rien n'écrit nulle
part. Le critère de fini du lot 1 (« une ligne retirée au milieu casse la
vérification ») est satisfait par un test qui ne donne à l'attaquant que la
suppression.

**Ce qu'il faut décider.** Soit un rôle PostgreSQL dédié
(`REVOKE UPDATE, DELETE ON ops_audit`), l'application écrivant sous ce rôle et
la purge sous un autre — **à rattacher au lot 1, pas au lot 10**. Soit écrire
noir sur blanc dans un ADR quel modèle d'attaquant les gardes couvrent. Un
journal falsifiable pendant toute la construction est un journal qui n'atteste
rien de la construction.

### 4.2 · 🔴 Le registre n'exige pas un schéma d'entrée FERMÉ

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0003.** Le dialecte est décidé :
> `additionalProperties: false` ET `unevaluatedProperties: false` sont acceptés,
> et le dialecte qui a servi est rendu. Les deux ajouts (a) et (b) sont posés,
> et le témoin exact cité ci-dessous rougit — `core/registry/`
> `admission-schema.temoin.spec.ts`.

`core/registry/manifeste-recu.ts`

Deux règles du § 09 — « le schéma d'entrée est `.strict()` » et le contrôle 7
« aucun champ d'autorisation ne provient du schéma d'entrée » — ne sont tenues
**que du côté build**, c'est-à-dire seulement pour un adaptateur TypeScript qui
passe par le kit. Le registre est la **seule barrière statique** pour un
manifeste produit ailleurs — et c'est exactement le cas que le § 29 redoute : le
CRM en PHP, dépôt **public à jamais**.

Témoin exécuté : un manifeste fédéré dont un outil déclare
`inputSchema: { type: "object", properties: { peutVoirAppels: { type: "boolean" } } }`
— sans `additionalProperties` — est **admis** sans un mot. `peutVoirAppels` est
nommément une propriété de `Habilitations`.

**Ce qu'il faut décider : le DIALECTE.** Refuser tout `inputSchema` dont
`additionalProperties !== false` rejetterait un manifeste PHP qui exprimerait la
fermeture autrement (`unevaluatedProperties: false`). C'est un contrat
inter-langages, pas un détail d'implémentation.

Deux ajouts, tous deux vérifiables sur le manifeste SEUL, sans réseau :
(a) le registre exige la fermeture du schéma d'entrée, sous la forme retenue ;
(b) le registre applique le contrôle 7 en confrontant les propriétés du schéma
aux clés dérivées par `clesDAutorisationDepuisSource` — **le code existe déjà**
dans `core/adapter-kit/autorisation.ts` et n'est appelé que par le harnais, qui
tourne dans la CI de l'ADAPTATEUR.

### 4.3 · 🔴 L'empreinte des profils ne voyage pas dans le manifeste

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0004.** `profilesVersion` et
> `profilesSha` entrent dans `Manifeste` ; le sceau voyage de `core/profiles`
> jusqu'au registre sans être recalculé nulle part, et le registre confronte LES
> DEUX champs. C'était la dernière fenêtre : aucun épinglage réel n'existait.

`core/profiles/profiles.ts`

`PROFILES_VERSION` et `empreinteProfils()` sont une garde qui **ne peut pas
rougir** : elle n'est branchée nulle part. Le fichier affirme pourtant qu'« un
adaptateur fédéré épingle cette version dans son manifeste ». Or le manifeste ne
porte **ni la version ni l'empreinte** (ses sept clés sont `manifestVersion, id,
version, mode, profiles, secrets, tools`), et `EntreeVerrou` non plus.

Un adaptateur fédéré produit donc son manifeste contre SA copie de
l'énumération ; si les deux divergent, le manifeste reste valide, le registre
l'admet, et **la divergence ne se voit nulle part** — précisément le défaut que
l'empreinte prétend rendre visible d'un seul octet.

**Ce qu'il faut décider.** Ajouter `profilesVersion` (et/ou `profilesSha`) au
manifeste **change toutes les empreintes épinglées** : c'est une décision à
prendre AVANT le premier épinglage réel. Soit on l'ajoute et le registre le
confronte à `empreinteProfils()`, soit **on corrige la phrase de `profiles.ts`
pour qu'elle cesse de décrire un mécanisme absent.** La première est la seule
qui rende la garde exécutable.

### 4.4 · ✅ Deux dérivations du niveau de politique se contredisaient — TRANCHÉ (lot 1b)

`core/policy/scope.ts` · `core/policy/niveau.ts` · `core/registry/enregistrer.ts`

`niveauApplique()` répondait par **appartenance** aux scopes que
`scopesCouvrants()` fabrique ; `plancherDuScope()` / `scopeDomine()` répondaient
par **analyse** de la grammaire, en découpant le scope sur son dernier point.
Trois conséquences mesurées, sur une politique **parfaitement lisible** — donc
là où aucun fail-closed ne venait refermer l'écart : le même outil recevait
`libre` ou `brouillon` selon la façon dont sa référence avait été construite ;
un RESSERRAGE valide et en vigueur ne mordait pas ; et `classerChangement()`
faisait passer un élargissement réel par le chemin « resserrage », sans second
facteur ni `ops:policy`.

**Ce qui est tranché, et écrit à un seul endroit.** La grammaire du § 12 est
`*` | `adapterId.*` | `adapterId.tool` : un scope se lit de gauche à droite, le
**PREMIER** point sépare l'adaptateur de l'outil, **donc `adapterId` ne contient
aucun point**. `zoho.mail.send` est l'outil `mail.send` de l'adaptateur `zoho`,
et `zoho.mail.*` n'est plus un scope.

Ce n'est pas un arbitrage de confort : c'est déjà la règle que
`core/adapter-kit/manifest.ts` applique au BUILD (`MOTIF_ID` n'admet ni point ni
majuscule), tandis que `MOTIF_NOM_OUTIL` admet les points.

**Ce qui a été fait.**

- `scopeCouvre()` passe par `scopeDomine()` — **une seule dérivation**.
  `scopesCouvrants()` subsiste pour l'écran : elle ÉNUMÈRE, elle ne DÉCIDE plus.
  `core/policy/scope.spec.ts` confronte les deux lectures sur 60 paires.
- `analyserReference()` refuse une référence qu'aucun scope ne saurait nommer,
  et `niveauApplique()` replie alors sur le niveau le plus strict avec la raison
  **`référence-illisible`** — le bon niveau POUR LA BONNE RAISON.
- La règle est **revalidée à l'enregistrement** : refus
  `id_innommable_par_un_scope` (`core/registry/enregistrer.ts`). C'était
  nécessaire — `lireManifesteRecu()` n'exigeait qu'un `id` non vide, donc un
  manifeste produit ailleurs (le CRM en PHP, § 29) pouvait s'enregistrer sous
  `zoho.mail`. Le refus INTERROGE `analyserScope()` au lieu de retaper la règle,
  et `core/registry/id-nommable.temoin.spec.ts` le prouve sur 14 identifiants.
- Les trois témoins « 🔴 DÉFAUT CONSTATÉ » de `niveau.temoin.spec.ts` ont été
  **conservés** : ils rejouent la même politique et montrent ce qui referme
  l'écart. Aucun n'a été supprimé.

⛔ **Reste ouvert** : la garde manquante que le lot 1 nommait déjà — une ligne
d'`ops_policy` en vigueur dont le scope ne couvre AUCUN outil enregistré est une
anomalie qui devrait être affichée, avec le nombre d'outils confrontés. Elle
suppose un catalogue d'outils, qui appartient à la chaîne d'appel.

### 4.5 · 🟠 Un effet peut partir sans trace (objectif O6)

`core/audit/journal.ts`

L'inversion de contrôle d'`avecJournal()` garantit qu'on **passe** par
l'écriture, pas qu'elle **réussisse**. Sur le chemin de succès, le corps a déjà
tourné — à l'étape 14, l'effet extérieur a eu lieu — quand l'écriture échoue.
L'appel « échoue » pour l'appelant, **zéro ligne est écrite**, et l'effet est
bien parti.

Ce n'est pas rattrapable par la seule inversion : le journal ne peut pas être
écrit avant que la durée et l'issue soient connues. L'invariant tient pour toute
terminaison atteinte **avant** l'étape 14 ; au-delà, il est faux.

**Ce qu'il faut décider.** (a) Reconnaître l'écart dans l'en-tête du fichier et
dans le rapport, en remplaçant la phrase absolue par sa borne. (b) Le refermer :
écrire une ligne d'**intention** avant l'étape 14, puis la clore après — le
chaînage accepte deux lignes, et une intention non close est précisément le
signal qu'on veut voir. Coût : une écriture de plus par appel exécuté.

### 4.6 · ✅ `ops_audit.argHash` portait deux populations — REFERMÉ (lot 1b)

`core/audit/journal.ts` · `core/audit/vocabulaire.ts` · `prisma/schema.prisma`

L'en-tête est **affiné** après l'étape 8 : le journal et le jeton de
confirmation désignent le même appel. Mais les terminaisons **antérieures** à
l'étape 8 gardaient l'empreinte de la charge brute — elles n'ont rien d'autre —
et **rien dans la ligne ne les distinguait.**

`ops_audit.argHashValidated` porte désormais le fait lui-même, et il **entre
dans l'empreinte chaînée** (`CHAMPS_COUVERTS`, seize champs). Il a été posé
maintenant précisément pour cela : aucune base ne tourne, aucune ligne n'existe.
Après le premier chaînage réel, il aurait fallu une clôture de rupture et deux
régimes de vérification dans le même journal.

**Le remède provisoire était faux, et le témoin le montre.** `stepDenied < 8`
est une INFÉRENCE : elle se trompe sur une terminaison par **exception**, où
`stepDenied` est nul — l'empreinte y est brute et l'inférence la déclare
validée. Mesuré dans `core/audit/deux-populations.temoin.spec.ts`.

**Trois états, pas deux, et le troisième se lit ailleurs.** `false` couvre
l'empreinte brute ET « arguments jamais lus » (refus d'étape 1). Les deux se
séparent par la VALEUR : `ARG_HASH_NON_LU` est une constante convenue qu'aucun
HMAC ne produira. Un troisième champ n'aurait rien ajouté.

### 4.7 · 🟡 Bornes et périmètres à confirmer

Quatre valeurs ont été **proposées** par les constructeurs et attendent une
confirmation, chacune écrite en un seul endroit :

| Valeur                       | Fixée à | Où                            |
| ---------------------------- | ------- | ----------------------------- |
| `TTL_DESSERRAGE_MAX_MS`      | 24 h    | `core/policy/desserrage.ts`   |
| `TTL_CONFIRMATION_MAX_MS`    | 5 min   | `core/policy/confirmation.ts` |
| `TTL_IDEMPOTENCE_MAX_MS`     | 24 h    | `core/limits/config.ts`       |
| `MAX_SEGMENTS_ALPHABETIQUES` | 6       | `core/audit/contenu.ts`       |

Et trois périmètres délibérément étroits, **écrits avec leur mesure** :

- **La clé de coffre dégénérée** — seuls les trente-deux octets à zéro sont
  refusés. Refuser « tous les octets identiques » serait plus fort, mais
  obligerait à réécrire la convention de fixtures de tout `core/vault/**`, qui
  fabrique ses clés d'essai avec `Buffer.alloc(32, n)`.
- **La garde du § 31** — elle prouve l'absence de **texte libre**, pas l'absence
  de donnée personnelle. Un nom en un seul mot, un numéro de téléphone, une URL
  courte la traversent : c'est **mesuré** par un témoin dédié, pas affirmé
  nulle part. Un renforcement réel passerait par les `idFields` que l'outil
  DÉCLARE (§ 09), pas par un motif de plus.
- **Le contrôle 3 du harnais** — il mesure la fraîcheur de sa liste
  d'exceptions, **et rien d'autre** : il ne regarde aucun appel. Le libellé a
  été corrigé pour cesser de promettre davantage ; la mesure manquante (balayer
  `entree.fichiers` à la recherche des appels à la couche de données) reste à
  écrire. Un témoin fixe cette borne et rougira le jour de la réparation.

---

## 5 · Dettes techniques mineures, sans arbitrage

- **`lireVerrou()` rend un verrou non nul sur `adapters: []`**, avec zéro
  anomalie. C'est légitime au lot 1, mais un appelant qui teste `verrou !== null`
  voit du vert sur un verrou qui n'épingle rien. Le contrat est désormais écrit
  dans la documentation de la fonction : **la lecture correcte est
  `estVert(verdict)`**. Le forcer par le type (rendre `verrou` inaccessible sans
  le verdict) reste possible.
- **Aucune implémentation en mémoire de `DepotQuota` / `DepotIdempotence` n'est
  exportée** par `core/limits`, là où `core/audit`, `core/policy` et
  `core/vault` exportent les leurs. Résultat : le même double est recopié dans
  quatre fichiers de gardes. Le jour où le contrat d'atomicité bouge, trois
  copies sur quatre garderont l'ancien comportement — et resteront vertes.
- **Le jeton de confirmation n'a aucune des dix tables du § 12.** `ops_token`
  en est la plus proche mais n'a ni `argHash` ni `tool` — c'est-à-dire
  précisément la liaison qui fait toute sa valeur. Retenu au lot 1 : **jetons
  en mémoire**, défendable (leur durée de vie se compte en minutes, un
  redémarrage les efface, ce qui va dans le sens du fail-closed). Coût : une
  confirmation demandée avant un redéploiement doit être redemandée après.
- **`non-rejouable` n'est défini nulle part dans le CDC.** Le § 09 l'énumère,
  aucune section ne dit ce qu'il fait. L'interprétation de `core/limits` est
  signalée dans le module, et elle a été choisie parce qu'elle échoue du côté
  sûr.

---

## 6 · Contrats posés par le lot 1 qu'il ne faut pas défaire

Cinq invariants ont coûté cher à établir. Les retirer rouvrirait un défaut
mesuré, chacun documenté à l'endroit du code qui le porte.

1. **`entreSchemaEtQuota` est OBLIGATOIRE** dans `ParametresLimites`. Facultatif,
   il laissait la composition naïve compiler sans un mot — et une garde qu'on
   peut ne pas appeler n'existe pas.
2. **Le contrôle 2 du § 09 lit le source BRUT.** Il ne doit dépendre d'aucun
   filtre préalable. Un `process.env` en commentaire est un faux rouge assumé.
3. **`versValeurJson()` refuse les prototypes étrangers et `toJSON`.** C'est ce
   qui garantit que l'empreinte et la forme lisent le même document.
4. **`resserrer` ne recule jamais l'instant où la surface se referme.** Le tri
   par niveau seul ne voit pas la dimension du temps.
5. **`ops_tool.bytes` est le poids de la PROJECTION SERVIE**, dérivé par
   `core/profiles.octetsDeLaDefinition`. Le contrôle d'intégrité du manifeste
   (`bytes_incoherent`) mesure une autre grandeur, sous un autre nom.

---

## 7 · Ce que la Recette a fait aux tests, et pourquoi

**Aucun test n'a été supprimé.** Un test retiré est un défaut caché.

Onze témoins ont été **ré-orientés** : ils affirmaient un défaut (« 🔴 DÉFAUT
CONSTATÉ — la garde reste verte ») ; le défaut ayant été corrigé, ils affirment
désormais l'invariant, et chacun a reçu un **contre-témoin** dans la même garde
pour qu'on ne puisse pas le confondre avec une garde qui refuserait tout.

Deux tests sont marqués **`.todo`**, chacun avec le motif écrit sur place et
repris ci-dessus (§ 3.1 et § 3.2). Aucune assertion n'a été relâchée à la valeur
observée : une garde calée sur le défaut du jour ne garde plus rien.

---

## 8 · Lot 1b, seconde moitié — ce que la chaîne a coûté, et ce qu'elle laisse

**Date : 2026-08-31.** Établi par la Recette du lot 1b, après onze passes de
construction et trois passes d'épreuve adverse.

### 8.1 · Ce qui est désormais tenu par du code

Les cinq étapes orphelines du § 11 sont écrites, et l'ORDRE appartient à
`orchestrerAppel()`. Trois propriétés en découlent, chacune tenue par une
structure et non par une consigne :

- **L'invariant de sortie du § 11 est tenu par le TYPE DE RETOUR.**
  `orchestrerAppel()` rend un `ResultatAppel`, qui étend `AppelJournalise` — dont
  le champ `ligne` est la ligne ÉCRITE. Il n'existe aucune façon de construire
  cette valeur sans qu'une écriture ait eu lieu.
- **Le schéma passe avant le quota**, et l'orchestrateur ne PEUT pas inverser
  l'ordre : il n'a pas la main dessus, c'est `appliquerLimites` qui reçoit le
  validateur et l'exécute lui-même.
- **Une seule table dit quel fichier exécute quelle étape** — `modules.ts` —, et
  les deux registres la lisent. La contradiction n'est plus improbable, elle est
  impossible.

### 8.2 · Les deux `it.fails` — deux défauts ouverts, datés

**① `ops_audit` nie une exécution qui a eu lieu.**
`core/audit/journal.ts` dérive le triplet de la ligne du seul GENRE de la
terminaison : `refus` ⇒ `decision: "refusé"`, `outcome: "non-exécuté"`. Or
l'étape 14 est la seule dont le refus arrive APRÈS l'effet extérieur —
`result_too_large` se prononce sur ce qui SORT, pas sur ce qui s'est passé. Un
`send` PARTI dont la réponse dépasse le plafond est donc journalisé « refusé /
non-exécuté ». La ligne existe, l'invariant tient — **elle est fausse**, et une
revue des effets extérieurs conduite sur `ops_audit` ne verrait jamais cet envoi.

L'information existe pourtant à cet instant : `ExecutionEtablie` porte
`octetsBruts`, donc la preuve que l'adaptateur a répondu.

⛔ **Arbitrage Will.** Faire porter au `Refus` le fait « l'effet extérieur a eu
lieu » est mécanique. QUELLE valeur d'`outcome` retenir ne l'est pas : `outcome`
entre dans l'empreinte chaînée (**ADR 0002**), donc en ajouter une est une
rupture de format — sans coût aujourd'hui, aucune base ne tournant. Qu'elle ne
soit pas `non-exécuté` n'est, en revanche, pas un arbitrage.

**② La « valeur réservée » du mode agrégat n'est réservée par rien.**
`CLE_AGREGAT_ABSENTE` distingue « 40 éléments sans canal » de « 40 éléments dont
le canal n'a pas été rendu ». Ce ne sont pas la même panne — et un adaptateur qui
rend littéralement cette chaîne comme VALEUR du champ d'agrégat fusionne les deux
populations en un seul compte, donc les rend irrécupérables.

⛔ **Arbitrage Will.** Le remède est structurel — un booléen `champAbsent` que le
socle produit et qu'aucune valeur d'adaptateur ne peut usurper —, mais il
**ajoute un champ à une sortie que le § 13.2 énumère**. C'est la même décision
que la troisième ligne du tableau ci-dessous, et les deux se prennent ensemble.

### 8.3 · Ce qui attend une décision, sans témoin exécutable

| Écart                                                         | Pourquoi la Recette ne l'a pas tranché                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sessionId` ni contraint, ni authentifié, ni lié au jeton** | Toute la garde du § 20 s'y ancre. Le contrat manquant est une décision de TRANSPORT — il n'existe pas encore. À écrire AVANT, pas après.               |
| **`idFields` est cru sur parole**                             | Le § 20 pose que « l'étiquetage se décide côté socle, jamais sur déclaration ». Exiger la fermeture d'un `messageId` rejetterait de vrais outils.      |
| **L'enveloppe ne dit pas ce qu'elle a perdu**                 | Sources écartées par le plafond, non conformes fondus, valeur d'agrégat absente. Le § 13.2 énumère TREIZE champs ; en ajouter un est une décision CDC. |
| **Le § 15 n'a aucun code pour un scope insuffisant**          | Trois causes de nature très différente sortent avec `code: null`. Le § 24 ne pourra pas les séparer dans sa métrique.                                  |
| **Le § 24 n'a aucune ligne pour l'écart d'épinglage**         | Le § 20 prescrit d'ALERTER ; le niveau n'est fixé par rien. `critique` est retenu **par décision de module**, écrit dans le type pour qu'il se relise. |
| **L'index de provenance est LOCAL AU PROCESSUS**              | Deux instances derrière un répartiteur verraient la garde du § 20 s'appliquer une fois sur deux, sans qu'aucun compte ne le dise.                      |
| **Fuite d'existence résiduelle**                              | Fermée à scopes VIDES. Un porteur qui a UN scope mais pas le BON apprend encore qu'un nom n'existe pas : il faudrait l'`effect` d'un outil illisible.  |
| **Cinq bornes de durée et de taille**                         | Les quatre de Will (2026-08-31) plus `TTL_MARQUAGE_MS`. Chacune vit à UN seul endroit, pour qu'une révision soit UNE ligne. Lot 6.                     |

### 8.4 · Ce que la Recette a fait aux tests, et ce qu'elle n'a pas fait

**Aucun test n'a été supprimé.** Trente-six témoins adverses sont passés de
`it.fails` à `it()` — **la plupart sans qu'une ligne de leur corps ne change**,
parce qu'ils portaient déjà l'attente du CDC et non la valeur fausse. C'est
l'idiome qui a fonctionné : un défaut écrit sous `it.fails` rougit le jour où il
est corrigé, ce qui interdit de le corriger en silence.

⚠️ **CE QUI A BOUGÉ QUAND MÊME, ET IL FAUT LE COMPTER.** Dix-huit tests ont vu au
moins une assertion changer. Dire « aucune ligne de leur corps » sans cette
réserve serait exactement le travers que ce dépôt combat : une mesure juste
énoncée plus largement qu'elle. Quatre familles, et chacun des tests le dit sur
place, en nommant l'assertion et le motif :

- **cinq** attendaient la valeur de remplacement `SOURCE_NON_CONFORME` à
  l'identique. C'était précisément ce dédoublonnage-là qui faisait fondre cinq
  canaux en échec en une seule entrée : le correctif SUFFIXE le rang, donc la
  valeur servie change. L'attente du § 13.2 — le nombre de canaux — est
  inchangée ;
- **six** portaient le SYMPTÔME du défaut plutôt que la règle : une levée
  d'`ErreurContenuJournal`, une enveloppe servie, un « la garde est verte alors
  que… ». Ils sont RETARGÉS sur ce qui rend la règle vraie. Le premier a reçu un
  **cliquet** : la garde du § 31, présentée avec la valeur BRUTE, doit toujours
  refuser — sans quoi ce test serait vert des deux façons ;
- **cinq** exigeaient `admisParLeRegistre === true` comme PRÉCONDITION. Deux des
  cinq formes ne sont plus admises par le § 09 ; garder cette exigence aurait
  rendu ces tests verts POUR LA MAUVAISE RAISON — « le registre le refuse déjà ».
  L'admission est désormais MESURÉE et annoncée, jamais exigée ;
- **deux** portaient le COMPTE des contournements. Il est passé de six à un, et
  le seul qui reste — `idFields` — est nommé dans l'attente, pour que le jour où
  il sera tranché, le test rougisse.

**Ce que la Recette n'a pas fait :** relâcher une assertion à la valeur observée,
et corriger un défaut qui demandait un arbitrage. Les huit du § 8.3 sont
au-dessus de son mandat.

### 8.5 · Gardes éprouvées par un témoin posé dans le code RÉEL

Quatre témoins ont été fabriqués DANS les fichiers de production, la suite
relancée, puis les fichiers restaurés. Les quatre ont rougi :

| Témoin posé                                               | Ce qui a rougi                                  |
| --------------------------------------------------------- | ----------------------------------------------- |
| Un chemin de module fantôme dans `modules.ts`             | 3 tests, sur les DEUX registres                 |
| La garde fail-closed de `deciderEtape10` neutralisée      | le témoin des six niveaux corrompus             |
| `format` redevenu une fermeture dans `estTexteLibre`      | 4 tests, dont la mesure d'ensemble des 5 formes |
| `continue-on-error: true` dans `.github/workflows/ci.yml` | la garde qui LIT le YAML                        |

Une garde qui ne peut pas échouer n'existe pas. Celles-ci le peuvent.
