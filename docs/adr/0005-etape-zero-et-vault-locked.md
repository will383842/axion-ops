# ADR 0005 — L'étape 0 du coffre, et le code `vault_locked`

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1b)
- **Portée** : `core/types.ts` (`ERROR_CODES`, `APPEL_STEPS`, `AppelStep`),
  `core/vault/erreurs.ts`, `core/vault/coffre.ts`, `core/chaine/`, colonne
  `ops_audit.stepDenied`
- **Sources** : cahier des charges v6, § 11 (chaîne d'appel, invariant de
  sortie), § 15 (codes d'erreur), § 23 (trois états de coffre), § 24
  (observabilité), § 32 (critère de recette du lot 1)

---

## Deux manques du CDC, relevés par le lot 1, et justes

### Manque 1 — `vault_locked` n'existe pas au § 15

Le § 23 exige que **tout appel d'outil soit refusé** quand le coffre est
verrouillé, et le § 32 en fait un critère de recette du lot 1. Le tableau du
§ 15 — source de `ERROR_CODES` — n'énumère que **treize** codes, et celui-ci
n'en fait pas partie. Les deux ne peuvent pas être vrais ensemble.

`core/vault/erreurs.ts` portait donc la constante **hors** de l'union, avec
cette phrase : « la Recette l'y ajoutera, et cette constante deviendra alors un
simple alias typé ».

### Manque 2 — ce refus n'est aucune des quatorze étapes

Il les **précède toutes**. L'outil existe (étape 6), il est au profil actif
(étape 7), les scopes suffisent (étape 5) — c'est le socle qui ne peut rien
déchiffrer.

Or le § 11 pose que **toute terminaison, refus compris, écrit une ligne
d'`ops_audit` portant le numéro de l'étape qui a refusé**. Un refus sans numéro
n'a rien à inscrire dans `stepDenied` : la colonne reste nulle, et la ligne
devient **indiscernable d'une exception** (`decision: "interrompu"`,
`stepDenied: null`).

---

## Décision

**`vault_locked` entre dans `ERROR_CODES`. Le refus devient l'ÉTAPE 0 de
`APPEL_STEPS`.**

```ts
{
  numero: 0,
  cle: "coffre",
  libelle: "Coffre ouvert — sinon TOUT appel d'outil est refusé (§ 23)",
  refus: "vault_locked",
  statutHttp: null,
  httpSeul: false,
}
```

`core/vault` la **revendique** par `ETAPE_COFFRE`, dérivée d'`APPEL_STEPS` par
sa clé — même motif qu'`ETAPE_POLITIQUE` (`core/policy`) et
`ETAPE_REFUS_PROFIL` (`core/profiles`). `RefusDeCoffre` porte désormais ce
numéro, et `Coffre.refusDAppelDOutil()` le rend.

---

## Pourquoi ZÉRO, et pas quinze

Le numéro dit l'**ordre réel**. Un quinzième rang ferait croire à un contrôle
tardif, et casserait une lecture dont le code se sert déjà :
`core/audit/journal.ts` écrit, à propos des deux populations d'`argHash`, que
« `stepDenied < 8` ⇒ empreinte brute ». Un refus de coffre numéroté 15 y serait
classé du mauvais côté.

`AppelStep` vaut donc `0 | 1 | … | 14`.

---

## Pourquoi ce code, et pas un voisin

Trois issues étaient possibles ; deux mentent :

| Issue                        | Ce qu'elle dit                                   | Pourquoi elle est fausse                                                                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `internal`                   | « un identifiant de corrélation »                | Le § 15 exige que le message dise **quoi faire ensuite**. Ce n'est pas ce que promet `internal`. |
| `upstream_unavailable`       | « l'adaptateur ou l'API tierce est injoignable » | L'adaptateur est parfaitement joignable. C'est **le socle** qui refuse.                          |
| **`vault_locked`** (retenue) | « le coffre est fermé, voici où le rouvrir »     | —                                                                                                |

Le message distingue `absent` de `verrouillé` : **ils ne se réparent pas du même
geste** (§ 23 — un coffre absent empêche le démarrage, un coffre verrouillé sert
la console et le déverrouillage).

---

## Ce que la décision EXCLUT

- **Laisser `stepDenied` nul sur ce refus.** La métrique du § 24 perdrait, sans
  un mot, la totalité des appels refusés pendant qu'un coffre attend sa clé —
  c'est-à-dire, d'après le § 23, **après chaque déploiement**, puisque le repli
  fait démarrer verrouillé.
- **Garder la constante hors de `ERROR_CODES`.** Deux vocabulaires pour un seul
  code divergent au premier renommage.
- **Une annotation `: ErrorCode` sur `CODE_COFFRE_VERROUILLE`.** Elle
  élargirait le type de la constante à l'union entière, et `RefusDeCoffre`
  accepterait alors `internal` ou `conflict` sans broncher. `satisfies` contrôle
  l'appartenance **sans élargir**.
- **Un `refus(0, …)` écrit à la main.** Le numéro se dérive d'`APPEL_STEPS` par
  la clé `"coffre"`, et `etapeDuCoffre()` **lève** au chargement si la clé
  disparaît ou si son code change.

---

## Conséquences acceptées

### 1 · `0` est une valeur légitime de `stepDenied` — et c'est un piège

Tout code qui testerait `if (stepDenied)` plutôt que `if (stepDenied !== null)`
**effacerait ce refus-là**. Aucun n'existe au moment de l'ajout — vérifié sur
l'ensemble de `core/` — mais c'est le piège que ce numéro apporte, et il est
écrit dans `core/types.ts`, à côté de la définition d'`AppelStep`, plutôt que
découvert plus tard dans une métrique creuse.

### 2 · Les gardes qui comptaient « quatorze » devaient être DÉRIVÉES

Quatre l'étaient déjà et n'ont rien coûté. Deux portaient un littéral et ont
rougi — ce qui est exactement leur rôle :

- `core/types.spec.ts` exigeait `index + 1` pour chaque numéro. La contiguïté
  est ce qui rend `stepDenied` lisible, **pas le point de départ** : la
  vérification dérive désormais le premier numéro de la première entrée, et le
  point de départ est contrôlé une fois, à part.
- `core/audit/journal.spec.ts` écrivait `toBe(15)` à côté d'un
  `toBe(APPEL_STEPS.length + 1)` déjà juste. Le littéral est devenu un
  **plancher-témoin** (`toBeGreaterThanOrEqual(15)`), qui garde la garde d'être
  verte sur un `APPEL_STEPS` vidé.

### 3 · Une étape applicable de plus au transport JSON-RPC

`APPEL_STEPS.filter((e) => !e.httpSeul)` en compte onze au lieu de dix. La
garde de propriété du § 11 l'a vue immédiatement — elle a réclamé un témoin de
plus dans l'orchestrateur d'intégration, qui exerce désormais un appel **coffre
verrouillé sur un outil qui existe, qui est activé, et qui est au profil actif**.

---

## Ce qui reste OUVERT

- **`ops_audit` n'a aucune colonne d'état de coffre.** Une ligne de refus
  d'étape 0 ne dit pas si le coffre était `absent` ou `verrouillé` — seule la
  réponse au client le porte. Les deux ne se réparent pas du même geste, et la
  métrique du § 24 ne peut donc pas les distinguer. Ajouter la colonne changerait
  l'empreinte chaînée du § 12 : **c'est la même décision, au même endroit, que
  celles laissées ouvertes par l'ADR 0002 § 4.1 et `docs/ETAT.md` § 4.6.** Les
  trois devraient être prises ensemble.
- **Le § 15 du CDC reste à corriger.** Ce dépôt porte quatorze codes ; le
  document en énumère treize. L'écart est écrit à trois endroits — dans
  `ERROR_CODES`, dans `core/vault/erreurs.ts` et ici — plutôt que corrigé en
  silence dans un seul.
