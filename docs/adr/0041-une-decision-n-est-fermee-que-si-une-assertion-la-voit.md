# ADR 0041 — Une décision n'est fermée que si une assertion la voit

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `core/coutures/registre.ts`, `core/coutures/contrat.ts`,
  `core/coutures/verifier.ts`, `core/coutures/registre.spec.ts`,
  `core/coutures/couture.temoin.spec.ts`,
  `core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts`
- **Sources** : ADR 0019 (le registre des coutures) ; rapport de recette du
  lot 3, constat n° 5 ; cahier des charges v6, § 32

---

## Le fait qui rend cette décision nécessaire

Le lot 1d a construit une garde de couture pour rendre impossible le défaut
« une décision écrite, testée, documentée, et jamais branchée ». **Elle tourne,
elle annonce ses comptes, elle est verte.** Et **deux ADR du lot 3 — 0036 et
0037, toutes deux marquées « Statut : acceptée » — ne sont pas atterries.**

La garde n'a rien vu, **et elle avait raison sur ce qu'elle mesure.**

L'état `cousue` mesure **le nombre d'APPELANTS DE PRODUCTION d'un symbole**. Il
ne mesure pas que la **DÉCISION** a atterri. Les deux faits se séparent
exactement là où personne ne regarde : quand une décision NEUVE porte sur un
symbole **DÉJÀ COUSU**.

Deux cas mesurés, et ils sont exemplaires :

| ADR                | décision                                              | symbole               | état au registre | la décision est-elle dans le code ?  |
| ------------------ | ----------------------------------------------------- | --------------------- | ---------------- | ------------------------------------ |
| 0037 (déc. 2 et 3) | `journalDesRefus` et `delaiDeReprise` entrent au port | `PortsDuService`      | `cousue` ✅      | **non** — `0 occurrence` dans `ops/` |
| 0036 (déc. 1)      | le plafond de 40 mord à l'étape 7                     | `mesurerBudgetProfil` | `à-coudre` ✅    | **non** — le refus n'y est pas       |

Le premier est le plus instructif : `PortsDuService` **est** réellement cousu,
`ops/index.ts` l'importe, l'entrée est verte à bon droit — et ni l'un ni l'autre
des deux champs exigés n'existe. Ajouter un champ à un type déjà importé ne
change **aucun** compte d'appelants.

> **Une garde peut être verte, honnête, et mesurer autre chose que ce que son
> lecteur croit.** C'est le défaut le plus subtil rencontré dans ce dossier, et
> il n'a rien d'un bogue : la garde fait exactement ce qu'elle annonce.

## La décision

### 1 · Chaque entrée du registre porte DEUX faits, jamais confondus

- **`appelants`** — combien de modules de production appellent le symbole. Déjà
  mesuré par G1, inchangé.
- **`assertion`** — **le nom d'un test qui ÉCHOUE si la décision n'a pas
  atterri**. C'est le fait neuf, et c'est celui qui manquait.

Le champ est **obligatoire** sur toutes les entrées, `null` compris : on ne peut
pas inscrire une décision sans avoir répondu à la question. Une entrée dont
l'assertion est `null` n'est ni `cousue` ni `à-coudre` de ce point de vue — elle
est **`sans-assertion`**, et cet état **se compte** dans `parAssertion`.

### 2 · L'assertion n'est pas une chaîne : elle est confrontée au disque

Un nom de test écrit au registre et nulle part ailleurs remplacerait une garde
aveugle par un **registre menteur** — pire, parce qu'il aurait l'air d'une
mesure. La garde G4 (`verifierLesAssertions`) exige donc, pour chaque assertion :

1. le fichier existe **et se termine par `.spec.ts`** (une assertion portée par
   un module de production serait du code, pas une garde) ;
2. un `it` / `it.fails` / `test` y est déclaré **sous ce nom exact** ;
3. son corps s'isole **sans fuir** jusqu'au test voisin ;
4. son corps porte **au moins un `expect(`** — un test qui n'assère rien ne peut
   faire échouer personne ;
5. son corps **nomme** ce que la décision a changé (champ `nomme`, liste non
   vide) — sans quoi on fermerait n'importe quelle entrée en pointant le premier
   test vert venu.

### 3 · Une décision acceptée mais non atterrie se compte, elle ne se reproche pas

Une entrée `cousue` dont l'assertion est un `it.fails` dit **deux vérités à la
fois** : le symbole a des appelants, et la décision n'a pas atterri. En faire une
anomalie reviendrait à **reconfondre** les deux faits que cette garde existe pour
séparer, et forcerait à mentir sur l'un pour être vert sur l'autre.

La liste sort donc **nommée** — `cousuesNonAtterries` — et l'appelant tient le
cliquet dessus.

### 4 · La garde des assertions s'inscrit ELLE-MÊME au registre

Le rapport du lot 3 écrivait, du mécanisme des coutures : « **ET JE SUIS LOGÉ À
LA MÊME ENSEIGNE** » — il mesurait tout le monde et rien de lui-même. Cet
ADR-ci refuse cette phrase : `verifierLesAssertions` porte son entrée au
registre, et cette entrée porte une assertion comme les autres. Un test de
`registre.spec.ts` le vérifie nommément.

## Ce qui a été mesuré, avant et après

État **ROUGE** transcrit à l'écriture de la garde, sur le registre inchangé :

```
[G4 · totaux] 90 entrée(s) confrontée(s) · 0 avec assertion · 90 SANS assertion
[G4 · LA MESURE QUI MANQUAIT] 36 ADR inscrit(s) au registre ·
  0 porte(nt) AU MOINS UNE décision qu'un test voit · 36 n'en porte(nt) AUCUNE
Tests  3 failed | 7 passed (10)
```

**C'est le chiffre qui manquait au projet : sur 36 ADR et 90 décisions
inscrites, aucune n'était vue par une assertion nommée.** Ce n'est pas une faute
par entrée — les 90 ont été écrites avant que ce second fait existe. En exiger
une assertion aujourd'hui fabriquerait un rouge permanent, et une garde rouge en
permanence est une garde qu'on désactive dans la semaine.

**Le cliquet interdit seulement que le compte MONTE.** Une décision neuve ne peut
plus entrer sans qu'on ait répondu à la question.

État **VERT** après le lot, sur un registre passé de 90 à 99 entrées :

```
[G1 · totaux] 276 fichier(s) soumis · 135 module(s) de PRODUCTION balayé(s) ·
  99 entrée(s) au registre · 88 symbole(s) confronté(s) · 0 anomalie(s)
[G4 · totaux] 99 entrée(s) confrontée(s) · 11 avec assertion · 88 SANS assertion ·
  7 en dette (it.fails) ·
  répartition {"avec-assertion":4,"en-dette":7,"sans-assertion":88} ·
  3 fichier(s) de garde ouvert(s) · 0 anomalie(s)
[G4 · LA MESURE QUI MANQUAIT] 41 ADR inscrit(s) · 7 porte(nt) AU MOINS UNE
  décision qu'un test voit · 34 n'en porte(nt) AUCUNE
[G4 · défaut central] 3 entrée(s) COUSUE(s) dont l'assertion est en DETTE
  [PortsDuService (ADR 0037), PortsDuService (ADR 0037),
   verifierAucuneFuite (ADR 0044)] · 0 NOUVELLE(s)
Test Files 135 passed · Tests 1506 passed | 37 expected fail (1543)
```

**Le chiffre est passé de 0/36 à 7/41 ADR vus par une assertion.** Et les trois
entrées `cousuesNonAtterries` sont la première fois que ce dossier écrit noir sur
blanc qu'une décision acceptée n'est pas dans le code — sans mentir sur le fait
que le symbole, lui, est bien cousu.

## La garde tue-t-elle ? Cinq mutations, cinq mortes

Une garde qui ne peut pas échouer n'existe pas, et G4 est elle-même une garde.
Chaque mutation a été posée, mesurée, puis **restaurée à l'octet** (`diff` vide).

| mutation                                                   | ce qu'elle simule                     | mesuré                               |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| renommer sur le disque un test nommé au registre           | le registre ment                      | **2 rouges** — et **G1 reste verte** |
| `corpsDuTestNomme` rend le fichier entier au lieu du corps | l'isolement fuit jusqu'au test voisin | **2 rouges** (témoin + isolement)    |
| le compte d'`expect(` rendu constant à 1                   | un test qui n'assère rien passe       | **1 rouge** (cas ③)                  |
| retirer l'`assertion` d'une entrée neuve                   | une décision entre sans être vue      | **1 rouge** — 89 > cliquet 88        |
| retirer la ligne `.env` de `.gitignore` (ADR 0042)         | la règle d'ignorance disparaît        | **2 rouges** — la sonde mord         |

> **La première ligne est la démonstration du lot.** La même mutation qui rend
> le registre menteur laisse **G1 parfaitement verte** : elle mesure des
> appelants, et le nombre d'appelants n'a pas bougé. Sans G4, personne ne
> l'aurait vue.

## Les bornes, écrites avec la règle

- **G4 mesure des FORMES sur le disque.** Elle ne fait pas tourner le test : elle
  ne peut donc pas savoir si la mutation de la décision le tue réellement. Cette
  preuve-là s'obtient en **mutant**, et le lot qui pose une assertion transcrit
  les deux états. G4 rend impossible qu'une assertion soit une chaîne ; elle ne
  rend pas inutile de la muter.
- **L'isolement du corps ne traite pas les littéraux d'expression régulière.**
  Une accolade échappée dans un motif déséquilibre le compte — le cas rend
  `null`, donc une anomalie **bruyante**, jamais un vert.
- **Les chaînes de caractères sont blanchies avant de compter le code.** Le
  témoin de cette garde fabrique des sources de test à l'intérieur de chaînes :
  sans ce blanchiment, le décor d'un témoin serait lu comme du code.
- **Un nom de test composé à l'exécution est introuvable.** La garde cherche une
  forme littérale entre guillemets doubles, et le dit par une anomalie.

## Ce qu'on a rejeté

- **Faire de `assertion` un champ optionnel.** Un champ qu'on peut omettre est un
  champ qu'on omet. Obligatoire avec `null` explicite, la question se pose à
  chaque écriture.
- **Ajouter un cinquième état `sans-assertion` à `ETATS_DE_COUTURE`.** Ce serait
  faire de l'assertion une **valeur** de l'axe des appelants, c'est-à-dire
  reconfondre les deux faits. Ce sont deux axes, et ils se lisent séparément.
- **Exiger une assertion de toutes les entrées d'emblée.** Rouge permanent,
  garde désactivée. Le cliquet fait le même travail sans le coût.
