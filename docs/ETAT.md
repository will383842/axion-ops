# État du socle `axion-ops` — fin du lot 1

**Date : 2026-08-30.** Établi par la Recette, après quinze passes de
construction, de croisement et d'épreuve.

> **Rien n'est déployé, rien n'est exposé, aucun secret réel n'existe dans ce
> dépôt.** Les portes du lot 0a — Cloudflare Access devant la console, rotation
> du jeton Coolify — ne sont pas posées. C'est la raison d'être de cette
> retenue, pas une négligence.

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

⚠️ **Ce que « vert » ne prouve pas.** Il n'existe aucune CI dans ce dépôt :
`.github/` n'existe pas. Ces quatre commandes ont été passées à la main. Une
gate qui n'est lancée par rien ne peut pas rougir — voir § 4.

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

### 3.3 · Aucune CI

`.github/` n'existe pas. Le § 23 décrit « push → typecheck · lint · tests
unitaires · harnais de conformité ». Les scripts existent tous
(`typecheck`, `lint`, `format:check`, `test`) ; **rien ne les lance.**

⚠️ La mémoire du projet est formelle sur ce piège, mesuré sur `axionia` : un
gate qui porte `continue-on-error: true` ne fait jamais rougir une PR, et « le
risque est couvert par la gate » devient une fausse sécurité. Quand la CI sera
posée, **vérifier qu'elle rougit sur un témoin fabriqué.**

---

## 4 · Ce qui attend une décision de Will

Sept points. Aucun n'est un bug à corriger : chacun est un choix que la Recette
a refusé de trancher seule.

### 4.1 · 🔴 Le journal ne résiste pas à une réécriture complète

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

### 4.4 · 🟠 Deux dérivations du niveau de politique se contredisent

`core/policy/niveau.ts`

`niveauApplique()` répond par **appartenance** aux scopes que
`scopesCouvrants()` fabrique ; `plancherDuScope()` / `scopeDomine()` répondent
par **analyse** de la grammaire, en découpant le scope sur son dernier point. Le
§ 12 ne dit pas si `ops_tool.name` porte déjà le préfixe de son adaptateur, et
rien ne valide ni ne normalise `ReferenceOutil`.

Trois conséquences mesurées, sur une politique **parfaitement lisible** — donc
là où aucun fail-closed ne vient refermer l'écart :

- le même outil `zoho.mail.send` reçoit `libre` ou `brouillon` **selon la façon
  dont sa référence a été construite** ;
- une ligne de RESSERRAGE valide et en vigueur sur `zoho.mail.*` **ne mord
  pas**, et rien ne le dit ;
- `classerChangement()` lit le plancher par `plancherDuScope`, donc `libre`, là
  où le niveau appliqué est `brouillon` : **un élargissement réel est classé
  « resserrage »** et part par le chemin libre, sans TOTP ni `ops:policy`.

**Ce qu'il faut décider : la sémantique du § 12.** Faire passer `scopeCouvre()`
par `scopeDomine()` impose de trancher — `adapterId` est-il TOUJOURS le préfixe
complet jusqu'au dernier point ? Poser en outre la garde manquante : une ligne
d'`ops_policy` en vigueur dont le scope ne couvre AUCUN outil enregistré est une
anomalie affichée, qui annonce le nombre d'outils confrontés.

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

### 4.6 · 🟠 `ops_audit.argHash` porte deux populations

`core/audit/journal.ts`

L'en-tête est désormais **affiné** après l'étape 8 : le journal et le jeton de
confirmation désignent le même appel (garde exécutée). Mais les terminaisons
**antérieures** à l'étape 8 gardent l'empreinte de la charge brute — elles n'ont
rien d'autre — et **rien dans la ligne ne les distingue.**

Le remède est une colonne booléenne de plus sur `ops_audit`. Elle entrerait dans
l'empreinte chaînée du § 12, donc **elle change le calcul du journal** : à
décider avant le premier chaînage réel, pas à glisser. En attendant,
`stepDenied < 8` permet de savoir laquelle des deux on lit.

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
