# ADR 0048 — La garde des assertions attaquée, et le cliquet qui ne se compense pas

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à la recette du lot 4)
- **Portée** : `core/coutures/contrat.ts`, `core/coutures/verifier.ts`,
  `core/coutures/registre.spec.ts`,
  `core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts`
- **Sources** : ADR 0041 (une décision n'est fermée que si une assertion la
  voit) ; rapport d'épreuve du lot 4, constats n° 1, n° 3 et n° 4 ; cahier des
  charges v6, § 32

---

## Le fait qui rend cette décision nécessaire

L'ADR 0041 a posé G4 pour rendre impossible qu'une décision soit déclarée fermée
sans qu'un test la voie. **L'épreuve du même lot a montré que G4 pouvait être
fermée par un test qui ne peut pas rougir — c'est-à-dire par le défaut même
qu'elle existe pour interdire.** Trois brèches, chacune mesurée sur un jeu
fabriqué, chacune accompagnée d'un `it.fails` :

| #   | La brèche                                                                           | Ce que G4 rendait                                                 |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| ①   | `expect(1).toBe(1)` satisfait « au moins un `expect(` », et il est vert toujours    | test trouvé, 1 `expect(`, 0 nom absent, **0 anomalie**            |
| ②   | `it()` enfermé dans un `describe.skip` : vitest n'exécute rien, le texte est intact | test trouvé, corps isolé, **0 anomalie** (contre 1 sur `it.skip`) |
| ③   | Le cliquet des « sans assertion » était un TOTAL, et une somme se compense          | 88 avant, **88 après** une décision aveugle de plus               |

La brèche ① est la plus coûteuse, parce qu'elle est silencieuse dans les deux
sens : le critère `nomme` se cherche dans le corps BRUT, littéraux compris — un
`console.info("… journalDesRefus …")` le fournit aussi bien qu'une mesure. Sur
le registre réel **au moment de l'épreuve**, 23 des 47 noms exigés ne vivaient
que dans un littéral ; **24 sur 53** après les trois entrées de cet ADR-ci. G4 ne
peut pas, par construction, distinguer une mesure d'un message.

La brèche ② est un cas d'école de la règle du dossier : **une garde qui mord sur
une forme et pas sur son équivalent se contourne sans que personne l'ait
décidé.** G4 mordait sur `it.skip` — par effet de bord, le test n'y étant plus
trouvé — et pas sur la MÊME suspension posée d'un cran au-dessus.

La brèche ③ est le défaut central du lot rentrant par la porte que le lot avait
posée : inscrire une décision que rien ne voit (+1) et poser une assertion sur
une entrée ancienne (−1) laisse le total, les anomalies et `cousuesNonAtterries`
tous immobiles.

## La décision

### 1 · Un `expect(` qui ne confronte que des littéraux ne ferme rien

`VerdictDUneAssertion` porte `expectsFalsifiables` : le nombre d'`expect(` dont
l'argument, lu dans `corps.code` (chaînes blanchies), contient au moins un
caractère d'identifiant. **Un corps qui en compte zéro alors qu'il porte des
`expect(` est une anomalie.**

Le seuil est « au moins un », jamais « tous » : un test légitime mêle des
planchers à des comparaisons de constantes, et exiger que chaque `expect(` soit
falsifiable rejetterait des gardes correctes. Ce qui est refusé est le corps où
**aucun** ne l'est.

### 2 · Un test qu'aucun lanceur n'exécute ne ferme rien

`suiteSuspendue` cherche la déclaration du test dans la source nue, puis
confronte son index aux blocs `describe.skip` / `.todo` / `.only` repérés sur la
source **blanchie à longueur constante** (`chainesBlanchies`) — sans quoi le
décor fabriqué par le témoin de cette garde-ci serait lu comme du code.
`.only` est refusé avec les deux autres : il n'éteint pas le test qu'il porte,
il éteint tous les autres du fichier.

### 3 · Le cliquet porte sur l'IDENTITÉ, jamais sur la somme

`RapportDesAssertions` rend `sansAssertionNommees` — l'identité de chaque entrée
sans assertion — et `core/coutures/registre.spec.ts` fige cette liste au
2026-09-01 (88 identités). Toute identité **entrante** fait rougir ; les
sortantes sont annoncées, jamais reprochées : une entrée qui quitte cette liste
est une décision qu'un test voit désormais.

> **Aucun correctif ne pouvait sauver le total, et c'est pourquoi on en change.**
> `sansAssertion` vaut `entrées − avecAssertion` : c'est une soustraction, elle
> est incapable de distinguer un échange d'un ajout. Les deux mesures cohabitent
> — le total reste annoncé, la liste porte la règle.

### 4 · Ce que G4 ne sait pas trancher, elle l'ANNONCE

`nomsEnLitteralSeul` (par entrée et en total) et `assertionsPartagees` sont
comptés et rendus, **sans être des anomalies**. Un test qui lit une source du
dépôt y cherche légitimement un nom en littéral ; l'ADR 0036 et l'ADR 0043
portent légitimement la même règle et donc la même assertion. Ce sont aussi les
deux formes exactes que prend la compensation du § 3 : les rendre visibles est
la seule chose qu'une garde puisse faire quand elle ne peut pas juger.

## Ce que cette décision NE fait PAS, et c'est écrit avec elle

- **Elle ne fait toujours pas tourner le test.** G4 mesure des FORMES sur le
  disque : elle rend impossible qu'une assertion soit une chaîne, et qu'elle
  soit un test qui ne peut pas rougir. Elle ne rend pas inutile de MUTER la
  décision. Cette preuve-là reste à la charge du lot qui pose l'assertion.
- **Elle ne voit que la forme ÉCRITE d'une suspension.** Un fichier écarté par
  la configuration du lanceur, ou une suspension décidée à l'exécution, lui
  échappe. Aucune garde du dépôt n'interdit aujourd'hui `.skip` / `.only` /
  `.todo` dans un `**/*.spec.ts` — mesuré : **0 fichier sur 323** en porte une.
  La porte est ouverte, elle n'est pas empruntée.
- **Elle ne distingue pas un nom-mesure d'un nom-décor.** Elle en compte la
  part : **24 sur 53** au 2026-09-01, cet ADR compris.

## La preuve attendue du correcteur

Les trois brèches sont gardées par les tests qui les ont ouvertes, dans
`core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts` — écrits en
`it.fails` par l'épreuve, VUS ROUGES en `it()`, puis retirés de la dette par la
recette :

| test                                                                 | ROUGE avant                                   | VERT après                                       |
| -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| « G4 rougit sur un test dont l'assertion ne peut pas échouer »       | `expected 0 to be greater than or equal to 1` | 1 anomalie sur la garde tautologique             |
| « G4 rougit sur un test enfermé dans un describe.skip »              | `expected 0 to be greater than or equal to 1` | `describe.skip → 1` et `it.skip → 1`             |
| « une décision neuve que RIEN ne voit se voit dans les IDENTITÉS … » | `expected 88 to be greater than 88`           | 1 entrante `[faireLaChoseDeLEpreuve (ADR 9997)]` |

Le troisième porte, dans son corps, l'assertion qui garde la borne : le total
`sansAssertion` **reste** à 88 avant comme après. C'est la preuve que c'est
l'instrument qui a changé, pas la mutation.
