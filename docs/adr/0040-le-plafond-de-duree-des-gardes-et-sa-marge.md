# ADR 0040 — Le plafond de durée des gardes, et la marge qui doit se surveiller

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `vitest.config.ts` (POSÉ par cet ADR), `.github/workflows/ci.yml`,
  `ops/marge-des-gardes.ts` (à écrire)
- **Sources** : cahier des charges v6, § 32 (critère de recette) ; ADR 0019 (une
  garde annonce ses comptes)

---

## Le fait qui rend cette décision nécessaire

`vitest.config.ts` — 19 lignes — pose `include`, `environment`, `globals` et
`reporters`. **Il ne pose ni `testTimeout`, ni `hookTimeout`, ni réglage de
pool.** Les défauts de vitest s'appliquent : **5 000 ms par test**, **10 000 ms
par crochet**.

Or plusieurs gardes balaient les sources sur disque et lisent les 130 modules de
production à chaque assertion. Mesure transcrite d'une exécution complète VERTE
sur HEAD `68f1496`, arbre propre :

| garde                                                            | durée        |
| ---------------------------------------------------------------- | ------------ |
| `lot1d-le-registre-sans-sa-garde.temoin.spec.ts` (14 tests)      | 20 731 ms    |
| › « aucune entrée du registre ne contredit le graphe d'appels »  | **3 895 ms** |
| › « annonce les comptes, symbole par symbole, appelants NOMMÉS » | 3 580 ms     |
| › « le prouve sur un témoin fabriqué »                           | 3 718 ms     |
| › « tient le CLIQUET »                                           | 3 500 ms     |
| › « tout symbole du registre est DÉFINI dans son module »        | 3 433 ms     |

**3 895 ms contre 5 000 : 22 % de marge.**

Ce n'est pas une gêne d'ergonomie. Deux observateurs se contredisent sur le même
arbre : un vérificateur a mesuré 17, puis 9, puis 0, puis 0 tests rouges — tous
en `Test timed out in 5000ms` — pendant qu'une autre exécution était verte
124/124. **Les deux sont vrais et ne se contredisent pas** : c'est la signature
d'une marge trop mince, pas d'un désaccord.

Le coût n'est pas seulement le rouge. Une garde qui rougit pour une raison
**étrangère à la règle qu'elle garde** est celle qu'on finit par désactiver — et
`pnpm test` est un gate BLOQUANT de la chaîne d'intégration, sans
`continue-on-error`. Symétriquement, **un vert sur ces cinq fichiers ne prouve
rien de plus que « la machine était rapide aujourd'hui »**.

### ⚠️ LA MARGE A ÉTÉ FRANCHIE PENDANT L'ÉCRITURE DE CET ADR — mesure transcrite

Ce paragraphe a d'abord dit « aucun rouge n'a été reproduit par l'architecte ».
**C'est devenu faux dans la même session, et par le lot lui-même.**

L'atterrissage du lot 3 fait passer `REGISTRE_DES_COUTURES` de 74 à 88 entrées et
`docs/adr/` de 30 à 36 fichiers. Les gardes du registre relisent le dépôt entier
à chaque assertion, donc leur durée croît avec ces deux nombres. Exécution
complète, arbre du lot, plafond encore au défaut de 5 000 ms :

| test                                                          | durée         |
| ------------------------------------------------------------- | ------------- |
| « annonce, symbole par symbole, combien d'appelants… »        | **10 738 ms** |
| « ne trouve AUCUN désaccord entre la prose et le graphe »     | **8 236 ms**  |
| « tient le CLIQUET des symboles inscrits mais JAMAIS ÉCRITS » | **8 097 ms**  |
| « mesure la PROPORTION de décisions réellement cousues »      | **5 719 ms**  |

**8 tests rouges dans 3 fichiers, tous en `Test timed out in 5000ms`.** Et la
mesure que ces gardes ont eu le temps d'ÉCRIRE avant d'expirer, transcrite telle
quelle :

> `[G1 · désaccords] 79 symbole(s) confronté(s) · 0 anomalie(s) : aucune`

**Le registre était juste. Les gardes ont expiré.** C'est la panne exacte que cet
ADR décrit, et elle s'est produite sur un arbre où la règle gardée était tenue.
La marge de 22 % n'était pas une hypothèse : c'était un délai.

---

## Décision

### 1 · `testTimeout: 30_000` — et le nombre s'explique

**Ce qu'un plafond de durée doit attraper** : un test qui ne finira **jamais** —
une promesse jamais résolue, une horloge figée qu'on n'avance pas, une file dont
le jeton n'est jamais rendu. Il n'est **pas** là pour attraper un test lent.

**Ce qu'il doit laisser passer** : la même garde sur une machine chargée. Une
machine en contention — une chaîne d'intégration partagée, un poste qui compile
en parallèle — multiplie couramment une durée par quatre.

30 000 ms, c'est **7,7 fois le pire cas de l'arbre vert d'origine** (3 895 ms) et
**2,8 fois celui de l'arbre du lot** (10 738 ms) — et **une demi-minute** pour
qu'un test réellement bloqué échoue vite, plutôt qu'à la minute. Un plafond de
60 000 ms ne gagnerait rien et doublerait le prix d'un blocage.

⚠️ **ET LE FACTEUR 2,8 EST UN AVERTISSEMENT, PAS UN CONFORT.** Sous contention à
quatre, ces gardes dépasseraient le plafond neuf. **La réponse ne sera pas de
remonter le plafond, elle sera de mémoïser le balayage du dépôt** — ces gardes
relisent les 131 modules de production à chaque assertion, et c'est là qu'est le
coût. Le plafond est posé pour que le rouge dise alors la bonne chose : « cette
garde coûte trop », et non « la machine était lente ».

**Le nombre est écrit avec sa mesure, dans le fichier lui-même.** Un réglage sans
motif écrit est un réglage qu'on remonte au premier rouge.

### 2 · `hookTimeout: 30_000` — sans lui, tout le raisonnement est vide

Le défaut de `hookTimeout` vaut **10 000 ms**, et il s'applique aux `beforeAll` /
`beforeEach`. Une garde qui balaie le dépôt dans un `beforeAll` — la forme
naturelle quand cinq tests lisent le même corpus — aurait donc une **falaise
DIFFÉRENTE et PLUS BASSE** que les tests qu'elle prépare.

Poser `testTimeout` sans `hookTimeout` déplacerait la panne au lieu de la fermer,
et la déplacerait à l'endroit le plus difficile à lire : un crochet qui expire ne
nomme aucun test. Les deux sont posés, à la même valeur, pour qu'il n'y ait
**qu'une seule falaise** dans le dépôt.

### 3 · La marge SE SURVEILLE — alerte à 50 % du plafond

Un plafond confortable est un plafond qu'on cesse de regarder. `ops/marge-des-gardes.ts`
— une étape de chaîne d'intégration, dans le même moule que `ops/conformite-ci.ts`
et `ops/temoin-ci.ts` — relance la suite en `--reporter=json` et **ANNONCE** :

- le nombre de tests **mesurés** — un zéro ici rend le contrôle vacuous, et c'est
  ce compte qui le dira ;
- le plafond configuré, **lu dans `vitest.config.ts`** et jamais recopié ;
- les **cinq plus longs**, avec leur fichier et leur durée ;
- la **marge effective** : `duréeMax / plafond`.

Elle **rougit** dès qu'un test dépasse **50 % du plafond**. Le seuil n'est pas le
plafond lui-même : arriver à 99 % un jour de machine calme veut dire qu'on est
déjà passé de l'autre côté un jour de machine chargée, et c'est trop tard pour
l'apprendre. À 50 %, il reste un facteur deux de marge pour la contention, et le
signal arrive pendant qu'il est encore réparable.

Aujourd'hui, sur l'arbre du lot : 10 738 / 30 000 = **36 %**. Le contrôle passe,
avec un facteur 1,4 seulement avant l'alerte — **c'est serré, et c'est le compte
qui le dit** plutôt qu'une couleur. La prochaine campagne de mutations, ou la
prochaine dizaine d'entrées au registre, le fera parler.

⚠️ **CE QU'ON FAIT QUAND ELLE ROUGIT.** On rend la garde moins chère — mémoïser
le balayage du dépôt, lire les fichiers une fois pour tous les tests d'un
fichier — ou on décide une nouvelle borne **dans un ADR, avec la mesure**. On ne
remonte pas le plafond en silence : c'est le geste que ce contrôle existe pour
rendre visible.

### 4 · Le plafond a UNE écriture, et deux lecteurs

`vitest.config.ts` **exporte** la valeur en plus de l'utiliser, et
`ops/marge-des-gardes.ts` l'**importe**. Une valeur recopiée dans le contrôle
resterait juste jusqu'au jour où le plafond change — et ce jour-là, le contrôle
mesurerait une marge par rapport à un plafond qui n'existe plus, en restant vert.

⚠️ **`vitest.config.ts` N'EST PAS UN MODULE DE PRODUCTION** : `tsconfig.build.json`
l'exclut par le motif `*.config.ts`, et la garde des coutures en dérive le même
critère. C'est pourquoi l'entrée de registre de cet ADR est `hors-code` : la
décision porte sur l'outillage, elle ne produit aucun symbole livré, et le motif
est écrit plutôt que sous-entendu.

---

## Ce que cette décision NE COUVRE PAS

- **Le rouge reproduit ici vient d'une CHARGE AJOUTÉE, pas de la contention.** Il
  prouve que la marge était franchissable, et il l'a franchie par la croissance
  du registre et du dossier d'ADR. Il ne dit rien de la **fréquence** du rouge
  sous contention, qui reste inconnue.
- **La mesure qui lèverait cette inconnue est nommée, et elle n'a pas été
  faite** : vingt exécutions consécutives en `--reporter=json`, durée de chaque
  test enregistrée, sur machine chargée **et** sur exécuteur GitHub.
- **Le plafond ne rend pas ces gardes rapides — il déplace ce que leur rouge
  VEUT DIRE.** Avec un pire cas à 10 738 ms, quatre fois moins de marge qu'il n'y
  paraît : en contention, ces gardes repasseront la moitié du plafond et le
  contrôle du § 3 le dira. **La réponse sera alors de mémoïser le balayage du
  dépôt, jamais de remonter le plafond.** Cette dette est ouverte ici, datée, et
  elle a un compteur.
- **Le réglage de pool n'est pas touché.** La cause première du coût est que
  plusieurs gardes relisent le dépôt entier à chaque assertion ; changer le pool
  déplacerait le symptôme.
- **`pnpm build` reste absent de la chaîne d'intégration.** C'est un défaut
  distinct, mineur et réel — `pnpm typecheck` compile `tsconfig.json` (tout le
  dépôt, `--noEmit`) tandis que `pnpm build` compile `tsconfig.build.json` (le
  périmètre livré, avec émission), et **les deux périmètres diffèrent**. Il est
  laissé ouvert ici, avec son remède écrit : une étape `pnpm build` après
  `typecheck`, **annonçant le nombre de `.js` émis** — un build qui émettrait
  soudain 40 fichiers au lieu de 130 est un périmètre qui a bougé, et c'est
  précisément ce qu'une garde muette ne dirait pas.

---

## Ce que la garde doit tenir

1. **Le contrôle ANNONCE son dénominateur** : nombre de tests mesurés. Un
   contrôle qui lirait un rapport vide serait vert sans un mot.
2. **Le plafond est LU, jamais recopié.** Le témoin : changer la valeur exportée
   par `vitest.config.ts` doit changer la marge annoncée.
3. **Le témoin de rougeur est fabriqué**, jamais attendu : un rapport FABRIQUÉ
   portant un test à 60 % du plafond doit faire rougir le contrôle. Sans lui, un
   contrôle qui ne sait pas dire non serait vert pour la même raison que la
   marge qu'il surveille.

---

## Conséquences acceptées

- **Un test réellement bloqué coûte 30 secondes au lieu de 5.** C'est le prix, et
  il est payé une fois par blocage, contre un faux rouge payé à chaque exécution
  sur machine chargée.
- **Le contrôle de marge relance la suite**, donc la chaîne d'intégration
  l'exécute deux fois. Il peut n'être branché que sur `main` si le coût pèse ; ce
  qui ne peut pas être fait est de le supprimer et de garder le plafond
  confortable.
