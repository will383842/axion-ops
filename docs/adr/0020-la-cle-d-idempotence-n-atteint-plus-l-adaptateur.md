# ADR 0020 — La clé d'idempotence n'atteint plus l'adaptateur, et sa forme est fermée côté socle

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1d)
- **Portée** : `core/types.ts` (`ToolContext`, `NOMS_RESERVES_HORS_CONTEXTE`),
  `core/adapter-kit/autorisation.ts` (`ClesDAutorisation`,
  `clesDAutorisationDepuisSource`), `core/limits/idempotency.ts`
  (`empreinteDeCleDIdempotence`, `reserver`), `core/limits/limites.ts`,
  `core/chaine/orchestrateur.ts` (`ConstruireContexteOutil`),
  `prisma/schema.prisma` (`ops_idempotency.key`), `core/adapter-kit/types.ts`
- **Sources** : CDC v6 § 20 (règle d'idempotence, anti-exfiltration), § 09
  (contrôle 7), § 12 (`ops_idempotency`), § 15 (codes d'erreur), § 31 (aucun
  cache de contenu) ; ADR 0014, ADR 0015, ADR 0016

---

## Le défaut : un canal que le § 20 ne voit pas

L'anti-exfiltration du § 20 (étape 11) refuse un appel vers un adaptateur d'un
**autre domaine** portant un **argument libre**, quand la session a été marquée
par une lecture `personal` ou `sensitive`.

`porteUnArgumentLibre` est dérivé du **seul `inputSchema`**
(`analyserArgumentsDuSchema`, `core/chaine/etape-11-provenance.ts`). Or
`AppelEntrant.idempotencyKey` :

- est une **chaîne libre choisie par l'appelant**, qu'aucune borne de forme ne
  contraint ;
- **voyage hors d'`input`** — c'est même le point du § 20, qui l'a écrit pour
  éviter la faute de la v5 ;
- **atteint l'adaptateur** par `ToolContext.idempotencyKey`.

Un appel vers un outil dont le schéma ne déclare aucun champ libre traverse donc
l'étape 11 avec `porteUnArgumentLibre: false` — et remet quand même une chaîne
arbitraire à l'adaptateur. **La garde est exacte sur son périmètre, et son
périmètre n'est pas celui qu'on croyait.**

> ⚠️ **Ce que ce constat borne.** Le socle ne tourne nulle part : `adapters/`,
> `console/` et `voice/` sont des dossiers **vides**, `core/transport/` n'existe
> pas, aucune racine de composition n'assemble la chaîne. Il n'y a aujourd'hui
> ni adaptateur pour recevoir la clé, ni transport pour l'apporter. La fenêtre
> est **théorique**, et c'est exactement pour cela qu'on la referme maintenant :
> après, il faudrait migrer des lignes et un contrat d'adaptateur.

Deux autres destinations de la même chaîne, trouvées en suivant le canal :

| Destination                                       | Ce qu'elle reçoit aujourd'hui         |
| ------------------------------------------------- | ------------------------------------- |
| `ToolContext.idempotencyKey` → l'adaptateur       | la chaîne **verbatim**                |
| `ops_idempotency.key` (clé primaire, § 12)        | la chaîne **verbatim**, jusqu'au TTL  |
| le message de refus `invalid_input` de `reserver` | la chaîne **verbatim**, dans sa prose |

---

## Décision — les deux voies, ensemble

Elles ne se remplacent pas : la première **supprime** le canal vers l'extérieur,
la seconde **ferme la forme** de ce qui reste à l'intérieur.

### 1 · La clé BRUTE n'entre plus dans `ToolContext`

`ToolContext.idempotencyKey: string | null` **disparaît** et est remplacée par :

```ts
/** § 20 — l'EMPREINTE de la clé d'idempotence, jamais la clé. */
readonly idempotencyRef: string | null;
```

`ConstruireContexteOutil` n'y verse plus `appel.idempotencyKey` mais
`empreinteDeCleDIdempotence(appel.idempotencyKey)` — soixante-quatre caractères
hexadécimaux, ou `null`.

**Pourquoi une empreinte plutôt qu'un retrait pur et simple.** Le retrait était
la voie la plus courte, et elle coûte une capacité réelle : un adaptateur qui
relaie vers une API tierce portant sa propre idempotence a besoin d'un jeton
stable par appel, sans quoi la déduplication s'arrête à la frontière du socle —
et les outils concernés sont précisément les `send`. L'empreinte sert ce besoin à
l'identique **et referme le canal** : l'appelant choisit le préimage, jamais le
condensat. Aucun extrait marqué ne survit à un SHA-256.

**Et le renommage est lui-même une garde.** Un champ nommé `idempotencyKey` qui
ne porterait plus la clé serait un mensonge de type ; `idempotencyRef` dit ce
qu'il contient, et le compilateur casse chez tout appelant qui croyait tenir la
clé.

### 2 · La clé est CONTRAINTE à une forme fermée, côté socle

Avant toute réservation, `core/limits/limites.ts` confronte la clé à une forme
**dérivée d'une constante unique** :

- longueur bornée — un plancher et un plafond écrits, jamais implicites ;
- alphabet restreint aux caractères qu'un identifiant emploie (lettres, chiffres,
  `-`, `_`, `.`, `:`) — un UUID, un ULID, un `Message-Id` passent ; une phrase,
  un espace, un retour à la ligne, un accent ne passent pas ;
- refus `invalid_input` (§ 15, code existant) **qui ne recopie jamais la clé**,
  et qui dit la forme attendue.

Et `ops_idempotency.key` **stocke l'empreinte**, plus la chaîne. Le socle cesse
alors de conserver douze heures durant un texte choisi par l'appelant, ce qui
est aussi la lecture la plus simple du § 31.

### 3 · Le piège que le retrait ouvre, et qu'il faut refermer DANS LE MÊME GESTE

🔴 **Le contrôle 7 du § 09 dérive sa liste de noms interdits des propriétés de
`ToolContext`, lues dans le SOURCE de `core/types.ts`.** C'est ce qui interdit
aujourd'hui à un schéma d'entrée de déclarer un champ `idempotencyKey` — la règle
que le § 20 énonce en toutes lettres (« jamais dans `input` »).

**Retirer la propriété retire donc le nom de la liste, en silence.** La décision
qui ferme un canal en ouvrirait un autre, et aucune garde ne rougirait : le
contrôle resterait vert, simplement plus étroit d'un nom.

Le remède, et il est obligatoire :

```ts
/** Noms que `ToolContext` ne porte plus, et qu'un schéma d'entrée ne peut pas porter. */
export const NOMS_RESERVES_HORS_CONTEXTE = ["idempotencyKey"] as const;
```

`ClesDAutorisation` gagne un troisième ensemble, `clesDAutorisationDepuisSource`
l'unit aux deux autres, et le rapport du contrôle 7 **annonce les trois
comptes** : propriétés de `ToolContext`, propriétés de `Habilitations`, noms
réservés hors contexte. Un plancher-témoin sur le troisième, comme il en existe
déjà sur les deux premiers.

---

## Et les huit autres champs ? L'inventaire, et sa méthode

**La méthode d'abord, parce qu'elle vaut plus que la liste.** Ce qui atteint un
adaptateur est **dérivable** : `AppelAdaptateur` a exactement deux paramètres.

```ts
export type AppelAdaptateur = (
  contexte: ToolContext<ProfileName>,
  entree: unknown,
) => Promise<ChargeAdaptateur>;
```

`entree` est la charge **validée** — c'est le périmètre que le § 20 voit déjà.
L'inventaire des canaux INVISIBLES est donc, exactement et sans reste, **les
propriétés de `ToolContext`**. Il y en a neuf.

| #   | Champ            | Type                          | Qui choisit la valeur                 | Canal ?                                          |
| --- | ---------------- | ----------------------------- | ------------------------------------- | ------------------------------------------------ |
| 1   | `principal`      | `string`                      | le jeton, relu à l'étape 4            | ⚠️ **à borner par l'ADR 0001** — voir ci-dessous |
| 2   | `sessionId`      | `SessionId` (type marqué)     | le socle (ADR 0014)                   | **non** — frappé, jamais accepté                 |
| 3   | `scopes`         | `readonly OpsScope[]`         | le jeton, union fermée                | **non** — énumération fermée                     |
| 4   | `policyLevel`    | `PolicyLevel`                 | le socle, calculé à l'appel           | **non** — trois valeurs                          |
| 5   | `profile`        | `ProfileName`                 | `ops_runtime`, union fermée           | **non** — énumération fermée                     |
| 6   | `idempotencyKey` | `string \| null`              | **l'appelant, librement**             | 🔴 **OUI** — l'objet de cet ADR                  |
| 7   | `requestId`      | `string`                      | le transport — **et il n'existe pas** | ⚠️ **oui, si on le laisse arriver du client**    |
| 8   | `deadline`       | `Date`                        | le transport — **et il n'existe pas** | ⚠️ **oui, si on recopie une valeur reçue**       |
| 9   | `habilitations`  | `{ peutVoirAppels: boolean }` | le socle, § 19 bis                    | **non** — un booléen calculé                     |

**Six sont fermés par construction** — un type marqué, trois unions fermées, un
booléen calculé. Ce n'est pas de la chance : c'est la même règle appliquée six
fois, et elle a été rompue une fois.

### Les deux canaux qui ne sont pas encore ouverts, et qu'on ferme maintenant

`requestId` et `deadline` sont établis par les étapes 1 à 4, « HTTP seul », qui
se passent **dans le transport**. `core/transport/` n'existe pas. C'est le moment
le moins cher de toute la vie du projet pour poser la règle, et le seul où elle
ne coûte aucune migration :

- **`requestId` est FRAPPÉ par le socle**, jamais recopié d'un en-tête client ni
  de l'`id` JSON-RPC. C'est le motif exact de l'ADR 0014 appliqué au second
  identifiant du `ctx` — et c'est aussi la seule façon qu'un identifiant de
  corrélation soit unique quand le client en réutilise un.
- **`deadline` est CALCULÉE par le socle** — `maintenant()` plus un budget borné
  par l'outil —, jamais un horodatage reçu recopié tel quel. Un `Date` recopié
  est une valeur de plusieurs dizaines de bits choisie par l'appelant.

Ces deux règles sont **inscrites au registre des coutures (ADR 0019) sous
l'ADR 0001**, qui portera `core/auth/` et le transport : c'est là qu'elles
devront être cousues, et le registre est ce qui empêche de les y oublier.

---

## Ce que la décision EXCLUT

- **Surveiller le canal au lieu de le supprimer.** Étendre
  `porteUnArgumentLibre` pour qu'il inspecte `idempotencyKey` était la voie
  « symétrique ». Refusée : elle ajoute une seconde dérivation du même fait
  (« cet appel porte-t-il du texte libre ? »), et deux dérivations d'un même fait
  finissent par se contredire. On retire l'entrée plutôt que d'ajouter un
  gardien.
- **Retirer `idempotencyKey` de `ToolContext` sans rien mettre à la place.**
  Voie la plus courte, et elle coûte la déduplication en amont pour les outils
  `send` — ceux dont la duplication se voit de l'extérieur (§ 20).
- **Garder le nom `idempotencyKey` pour l'empreinte.** Un champ qui ne contient
  pas ce que son nom annonce est un mensonge de type, et il survit à toutes les
  relectures.
- **Retirer la propriété sans `NOMS_RESERVES_HORS_CONTEXTE`.** C'est le piège
  décrit au point 3 : la décision refermerait un canal en en ouvrant un autre,
  sans qu'aucune garde ne bronche.
- **Contraindre la forme sans retirer la clé du `ctx`.** Un alphabet restreint et
  cent vingt-huit caractères laissent passer de quoi encoder une centaine
  d'octets. Une forme fermée réduit un débit ; elle ne supprime pas un canal.
- **Refuser la clé sur un outil `idempotency: "n/a"`.** `reserver()` l'ignore
  aujourd'hui, à raison et c'est écrit : le § 09 ne l'interdit pas, et refuser
  casserait un client qui en envoie une par prudence. ⚠️ **La borne de forme, en
  revanche, s'applique AVANT ce tri** — sinon un outil `n/a` reste une porte
  ouverte vers `ops_idempotency`.
- **Recopier la clé dans un message d'erreur.** Le § 15 exige qu'une erreur dise
  quoi faire ensuite ; il n'exige pas qu'elle répète ce qu'on lui a donné.

---

## Ce que le constructeur ② doit écrire

1. `empreinteDeCleDIdempotence(key: string | null): string | null` dans
   `core/limits/idempotency.ts` — SHA-256 hexadécimal, dérivé de `sha256Hex`
   (`core/audit/canonique.ts`), **jamais une seconde implémentation**.
2. La borne de forme : une constante unique (longueur et alphabet), un refus
   `invalid_input` **sans écho**, appliqué **avant** le tri par
   `ModeIdempotence`.
3. `core/types.ts` : `idempotencyKey` → `idempotencyRef` ; ajout de
   `NOMS_RESERVES_HORS_CONTEXTE`.
4. `core/adapter-kit/autorisation.ts` : `ClesDAutorisation` gagne
   `reservesHorsContexte`, l'union les prend, le rapport **annonce les trois
   comptes**, et un plancher-témoin garde le troisième.
5. `prisma/schema.prisma` : `ops_idempotency.key` reçoit l'empreinte. Aucune
   migration à écrire — **aucune ligne n'existe**.
6. `core/adapter-kit/types.ts` : le commentaire du régime `key` dit désormais
   `ctx.idempotencyRef`, et dit que c'est une **empreinte**.
7. Le témoin d'exfiltration
   (`core/epreuve/exfiltration-par-les-arguments.temoin.spec.ts`) gagne le cas
   « clé d'idempotence porteuse de prose » : il doit **rougir avant, passer
   après**, et ne pas être supprimé.

### Les trois gardes

| Garde                                                                                                | Ce qu'elle annonce                                                                       | Le témoin qui la fait rougir                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **G1 — aucun champ de `ToolContext` ne porte une chaîne choisie par l'appelant.** Dérivée du SOURCE. | propriétés lues · combien de type `string` libre · lesquelles                            | Remettre `idempotencyKey: string` : le compte des chaînes libres passe à un.     |
| **G2 — le contrôle 7 refuse toujours `idempotencyKey` dans un schéma d'entrée.**                     | noms interdits confrontés = `ToolContext` + `Habilitations` + **réservés hors contexte** | Vider `NOMS_RESERVES_HORS_CONTEXTE` : le troisième compte tombe à zéro.          |
| **G3 — la forme de la clé est fermée, et le refus ne recopie rien.**                                 | clés-témoins éprouvées · admises · refusées · occurrences de la clé dans le message      | Une clé de mille caractères, une clé à espaces, une clé à accents : trois refus. |

---

## Conséquences acceptées

1. **Un adaptateur ne peut plus lire la clé que son appelant a choisie.** Il en
   reçoit l'empreinte, stable et bornée. Aucun usage légitime connu n'en souffre ;
   l'usage illégitime disparaît.
2. **Deux clés distinctes qui se condenseraient au même point seraient
   confondues.** Sur SHA-256, l'événement n'est pas atteignable par calcul ; il
   est écrit ici parce qu'un lecteur doit pouvoir vérifier qu'on y a pensé.
3. **`ops_idempotency` n'est plus lisible « à l'œil » par clé.** L'exploitant qui
   cherche une réservation part de l'outil et de la fenêtre, pas de la chaîne.
   C'est le prix de ne plus conserver un texte que le socle n'a pas écrit.
4. **Le contrôle 7 devient plus large d'un nom que `ToolContext` ne porte plus.**
   C'est délibéré, et cohérent avec la borne déjà écrite dans
   `autorisation.ts` : la garde est « bruyante et dérivée plutôt que juste et
   recopiée ».

---

## Ce qui reste OUVERT

- **`principal`.** Sa forme n'est bornée par rien aujourd'hui, parce que rien ne
  l'émet : `core/auth/` est l'ADR 0001, lot 2. Un principal est une valeur
  d'annuaire, pas une chaîne libre — mais **cela n'est écrit nulle part**, et
  aucune garde ne le tient. À trancher avec l'émetteur, pas avant.
- **`requestId` et `deadline`.** Les règles sont posées ici ; leur couture
  appartient au transport (lot 3) et l'ADR 0019 la surveille.
- **Le débit résiduel d'un `ToolContext`.** Six champs fermés portent quand même
  quelques bits — la combinaison des scopes, le profil actif. Un adaptateur les
  connaît de toute façon par son propre enregistrement. Écart signalé, non
  refermé : le refermer demanderait de cacher à l'adaptateur ce dont il a besoin
  pour décider.
