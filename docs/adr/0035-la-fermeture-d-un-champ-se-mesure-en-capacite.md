# ADR 0035 — La fermeture d'un champ se mesure en CAPACITÉ, jamais par trois témoins

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `core/adapter-kit/capacite.ts` (neuf), `core/adapter-kit/champs-declares.ts`,
  `core/adapter-kit/champs-declares.temoin.spec.ts`, `core/chaine/etape-11-provenance.ts`
  (lecteur, inchangé)
- **Sources** : cahier des charges v6, § 09 (le contrat d'adaptateur), § 13.3
  (la cascade de compaction), § 20 (la cinquième règle, l'étiquetage côté socle),
  § 29 (le CRM en PHP, dépôt public à jamais) ; ADR 0003, ADR 0015, ADR 0016

---

## Le fait qui rend cette décision nécessaire

`patternReferme` jugeait qu'un `pattern` referme un champ à trois conditions : il
compile, il est ancré aux deux bouts, et il rejette les **trois**
`TEMOINS_DE_PROSE`. Ces trois témoins ne se distinguent de la prose ordinaire que
par des **accents** (« précédentes », « transférez », « reçu ») et par la
**ponctuation d'URL** (`: / ? =`).

Conséquence mesurée par l'audit de bout en bout, et transcrite ici :

| motif soumis                     | `patternReferme` | charge acceptée                           |
| -------------------------------- | ---------------- | ----------------------------------------- |
| `^[A-Za-z0-9 ,.'()-]{1,2000}$`   | **true**         | 214 caractères de consigne injectée ASCII |
| le même champ **sans** `pattern` | —                | `confirmationExigee = true` à `libre`     |

Le champ passait donc pour **fermé**, `porteUnArgumentLibre` tombait à `false`,
et l'étape 11 basculait sur sa troisième branche — « un identifiant ne transporte
rien » — qui **autorise sans confirmation aux trois niveaux**. Deux mille
caractères de prose sans accent traversaient la garde principale du § 20.

C'est le pouvoir que l'ADR 0015 a retiré à `idFields` — « l'étiquetage se décide
côté socle, **jamais sur déclaration** » — rouvert par une autre porte : celle du
corpus de témoins. Un manifeste fédéré n'a pas à forcer la serrure ; il lui
suffit de déclarer proprement.

**Un jeu de témoins n'a jamais prouvé une fermeture. Il ne peut que l'infirmer.**
Trois phrases décidaient d'une propriété universelle.

---

## Décision

### 1 · La règle : un mot-clé ne referme que s'il BORNE LA CAPACITÉ

Un `pattern` referme un champ **si et seulement si les quatre conditions
suivantes sont tenues ensemble** :

1. il **compile** (inchangé — fail-closed sur un motif illisible) ;
2. il est **ancré aux deux bouts** (inchangé — un motif non ancré ne contraint
   qu'une sous-chaîne, et le reste de la valeur demeure libre) ;
3. la **longueur maximale du langage qu'il accepte** est **finie** et
   **≤ `BORNE_DE_FERMETURE`**, cette longueur étant **DÉRIVÉE DU MOTIF** ;
4. il rejette les `TEMOINS_DE_PROSE` — **filet subordonné**, conservé et élargi,
   dont la garde **annonce le compte de témoins rejetés**.

La condition 3 est la décision. Les trois autres étaient déjà là ; la troisième
est celle qui manquait, et c'est la seule qui ne se contourne pas en changeant
d'alphabet.

### 2 · Comment la longueur maximale se dérive, et ce qui la rend `null`

`longueurMaximaleAcceptee(motif)` rend un nombre **ou `null`**. `null` veut dire
« je n'ai pas su borner », et **`null` ne referme jamais**. C'est la direction
fail-closed, et elle est la même que celle de `PROFONDEUR_VALEUR`.

| construction                                                 | contribution             |
| ------------------------------------------------------------ | ------------------------ |
| littéral, caractère échappé, `.`, `\d \w \s \D \W \S`, `[…]` | 1                        |
| ancres `^` `$` `\b` `\B`                                     | 0                        |
| groupe `( )` `(?: )` `(?<nom> )`                             | la borne de son contenu  |
| concaténation                                                | **somme**                |
| alternation `a\|b`                                           | **maximum** des branches |
| `?`, `{n}`, `{n,m}`                                          | × 1, × n, × m            |
| `*`, `+`, `{n,}`                                             | **`null`** — non bornée  |
| avant/arrière-vision `(?=` `(?!` `(?<=` `(?<!`               | **`null`** — fail-closed |
| référence arrière `\1`                                       | **`null`** — fail-closed |
| toute syntaxe que le parcours ne sait pas lire               | **`null`** — fail-closed |

⚠️ **CE N'EST PAS UN ANALYSEUR D'EXPRESSIONS RÉGULIÈRES COMPLET, ET C'EST ÉCRIT
EXPRÈS.** Le sous-ensemble reconnu est déclaré ; tout ce qui en sort rend `null`,
donc **ouvre** le champ. Un adaptateur qui écrit un motif exotique n'obtient pas
une exonération, il obtient une surveillance. Le seul risque résiduel est
l'inverse — refuser la fermeture à un motif honnête —, et il coûte une
confirmation, jamais une fuite.

⚠️ **LA MESURE ANNONCE SES COMPTES.** `MesureDeCapacite` porte `noeudsLus` :
une mesure qui aurait lu **zéro** nœud et rendu une borne serait verte pour la
pire des raisons. Elle porte aussi `raisonDeNonBorne`, pour qu'un `null` dise
laquelle des sept lignes du tableau l'a produit.

### 3 · `BORNE_DE_FERMETURE = 64`, et le nombre s'encadre par les DEUX bouts

Le nombre n'est pas élu : il est **encadré**, et les deux bornes de l'encadrement
sont des mesures déjà présentes dans le dépôt.

**Borne HAUTE — strictement en deçà de ce que le socle appelle lui-même une
phrase.** `LONGUEUR_RACCOURCIE = 160` (`core/chaine/etape-14-execution.ts`) porte
sa propre justification : « un extrait de 160 points de code garde **une phrase
entière et une amorce de la suivante**, ce qui suffit à ce qu'un modèle
reconnaisse un message ». Un champ capable de porter 160 caractères peut donc
porter une phrase, **par la mesure du socle lui-même**. La borne de fermeture
doit être strictement inférieure.

**Borne BASSE — au moins la plus longue valeur que le socle tient déjà pour
fermée par une autre voie.** `FORMATS_CONTRAIGNANTS` accepte `ipv6`, dont la
forme textuelle la plus longue — `0000:0000:0000:0000:0000:ffff:255.255.255.255`
— pèse **45 caractères**. Poser la borne en dessous ferait juger LIBRE un
`pattern` qui réécrit exactement ce que `format: "ipv6"` referme : deux
dérivations d'un même fait qui se contredisent, le défaut que l'ADR 0003 nomme.

`45 ≤ 64 < 160`. **64 est en outre `LONGUEUR_EMPREINTE` — le plus long
identifiant que le socle frappe lui-même** (une empreinte SHA-256 en
hexadécimal). Un `pattern` qui admet davantage que le plus long identifiant du
socle ne décrit plus un identifiant.

⚠️ **L'ENCADREMENT EST UNE GARDE, PAS UN PARAGRAPHE.** La garde CONFRONTE
`BORNE_DE_FERMETURE` à `LONGUEUR_RACCOURCIE` (importée, jamais recopiée) et à un
tableau de **sept exemplaires** — un par `format` retenu —, et elle **annonce les
sept**. Le jour où l'un des deux nombres bouge, l'encadrement rougit au lieu de
vieillir en silence.

### 4 · `maxLength` referme, et c'est le mot-clé le plus honnête des trois

Un sous-schéma portant `maxLength` **≤ `BORNE_DE_FERMETURE`** referme le champ.
C'est le seul des trois qui soit **réellement validé** par JSON Schema draft
2020-12, et le seul qu'un adaptateur puisse écrire sans se tromper. Le message de
refus du § 25 le NOMME : « ajouter `maxLength: 64` », plutôt que de laisser
l'auteur deviner un motif.

### 5 · Le JUMEAU OUBLIÉ : trois `format` admettent un texte NON BORNÉ

La même règle appliquée à `FORMATS_CONTRAIGNANTS` fait tomber trois de ses sept
entrées, et personne ne l'avait mesuré :

| format      | forme canonique la plus longue            | bornée ? |
| ----------- | ----------------------------------------- | -------- |
| `date`      | `2026-09-01` — 10                         | oui      |
| `uuid`      | 36                                        | oui      |
| `ipv4`      | `255.255.255.255` — 15                    | oui      |
| `ipv6`      | 45                                        | oui      |
| `time`      | fraction de seconde **de longueur libre** | **non**  |
| `date-time` | idem                                      | **non**  |
| `duration`  | `P` + un nombre **de chiffres libre**     | **non**  |

Et `format` est, le dit l'en-tête du module lui-même, une **ANNOTATION** : le
vocabulaire de base ne lui donne aucun effet de validation. Un
`{ "type": "string", "format": "duration" }` refermait donc un champ qui accepte
n'importe quoi — un contournement **plus court à écrire que celui de l'audit**.

**Décision : `time`, `date-time` et `duration` sortent de
`FORMATS_CONTRAIGNANTS`.** Ils ne referment plus seuls ; ils referment
accompagnés d'un `maxLength ≤ 64` ou d'un `pattern` borné, comme n'importe quel
autre champ textuel. Les quatre restants — `date`, `uuid`, `ipv4`, `ipv6` — ont
une forme canonique bornée sous 64, et la garde le mesure sur ses quatre
exemplaires.

⚠️ **C'EST UN RESSERRAGE, DONC IL EST LIBRE (§ 20, protection 1).** Il ne peut
faire que de la surveillance en plus. Son coût aujourd'hui est **nul** :
`adapters/` est vide, `ops/index.ts` remet un catalogue vide, et aucun manifeste
n'est admis. C'est exactement le moment où la règle ne coûte rien — le même
argument que l'ADR 0020.

---

## Ce que cette décision NE COUVRE PAS — écrit avec elle

- **64 caractères ne sont pas sûrs, et cette décision ne le prétend nulle part.**
  Une adresse de courriel tient en 30, une URL courte en 25, la traduction ASCII
  du premier témoin de prose amputée tient en 44. Ce que la borne empêche est
  qu'un `pattern` **achète l'exonération sur de la prose** ; elle ne fait pas
  d'un champ court un champ inoffensif.
- **Le destinataire d'un envoi ne relève pas de ce mécanisme.** Un champ refermé
  par un `pattern` d'adresse courriel ancré — 64 caractères ou moins — reste
  fermé après cette décision, et l'étape 11 lui délivrera toujours son
  laissez-passer si son nom échappe aux cinq familles du filet. **C'est un
  défaut distinct, il est ouvert, et il se ferme par l'obligation de
  `governanceFields` sur les effets `send` et `destructive` plus le cliquet de
  l'étape 11** — pas ici. Le corriger ici aurait consisté à faire porter à
  `patternReferme` une question qui n'est pas la sienne.
- **Un motif borné reste un canal.** `^[a-f0-9]{64}$` referme un champ qui porte
  256 bits choisis par l'appelant. La cinquième règle du § 20 vise la prose et
  les contenus lus, pas les canaux cachés ; ce dépôt ne prétend pas les fermer,
  et l'ADR 0015 a déjà écrit que l'exonération par `idFields` était refusée pour
  cette raison-là.
- **Rien ne valide `inputSchema` au runtime.** La validation de l'étape 8 est
  `validerEntree`, une dépendance INJECTÉE. Cette décision porte sur ce que le
  socle **croit** d'un schéma déclaré, pas sur ce qu'un appel porte réellement.
- **La borne du parcours reste celle de `sousSchemas()`.** Un schéma plus profond
  que `PROFONDEUR_VALEUR` est réputé LIBRE, et cette décision ne change pas ce
  sens.

---

## Ce que les gardes doivent tenir

1. **La garde rougit sur le contournement EXACT mesuré par l'audit.** Le corpus
   de `champs-declares.temoin.spec.ts` — 51 formes aujourd'hui — reçoit l'entrée
   qui manquait : `^[A-Za-z0-9 ,.'()-]{1,2000}$` doit rendre `referme = false`,
   avec `longueurMaximale = 2000`. Un corpus qui ne contient pas le trou ne peut
   pas le voir : c'est la borne que le corpus élargi du lot 1d portait déjà.
2. **Le témoin inverse est obligatoire.** `^[A-Za-z0-9]{1,32}$` doit rendre
   `referme = true` avec `longueurMaximale = 32`. Sans lui, une fonction qui
   refuse tout satisferait la garde.
3. **Les lignes du tableau du § 2 ont chacune un témoin**, et la garde annonce
   combien de constructions elle a confrontées. Une ligne non éprouvée est une
   ligne qui ne mordra pas.

   📏 **MESURÉ À LA CONSTRUCTION, ET LE COMPTE CORRIGE CE PARAGRAPHE : le
   tableau porte DIX lignes, pas sept.** La garde en confronte **26**, et elle
   annonce aussi la couverture des cinq raisons de non-borne — **4 sur 5**.
   La cinquième, `syntaxe-hors-sous-ensemble`, **n'a aucun témoin, et c'est un
   fait mesuré, pas un oubli** : sous le drapeau `u`, toute construction que ce
   parcours ne sait pas lire fait déjà lever `new RegExp`, si bien qu'aucun
   motif COMPILABLE ne l'atteint aujourd'hui. Elle reste comme filet — le
   drapeau ou la grammaire peuvent changer —, et la garde FIGE ce constat :
   elle exige que la liste des raisons sans témoin soit **exactement**
   celle-là, si bien qu'une raison ajoutée sans témoin rougit.

4. **L'encadrement de la borne est confronté, jamais recopié** : `45 ≤ 64` sur
   les quatre exemplaires de format, et `64 < LONGUEUR_RACCOURCIE` sur la
   constante IMPORTÉE de `core/chaine/etape-14-execution.ts`.
5. **La mutation qui doit MOURIR**, et c'est elle qui prouve la correction :
   remplacer le corps de `patternReferme` par la règle d'avant — compile, ancré,
   et `TEMOINS_DE_PROSE.every(…)` — et relancer la suite complète. Elle doit
   rougir sur le témoin n° 1. Restaurer, reconfronter l'empreinte, transcrire les
   deux états. **Une correction dont on n'a pas vu la mutation mourir n'est pas
   prouvée.**

---

## Conséquences acceptées

- **`estValeurLibre` rendra `true` plus souvent.** Chaque `true` supplémentaire
  est une confirmation de plus à l'étape 11 sur un appel de domaine croisé après
  une session marquée. Aucune aujourd'hui : le catalogue est vide.
- **Trois `format` courants perdent leur exonération solo.** Un adaptateur qui
  publie un `date-time` devra écrire `maxLength: 64` à côté. Le message le dit,
  et la charge est d'une ligne par champ.
- **Un nouveau module `core/adapter-kit/capacite.ts`** porte la borne et la forme
  de la mesure. Il est **la seule écriture** de la question « ce motif borne-t-il
  la capacité ? » — `champs-declares.ts` l'appelle, l'étape 11 continue de
  n'appeler que `estValeurLibre`, et le sens de dépendance de l'ADR 0015 est
  préservé.
- **Le dénominateur annoncé par la garde des coutures monte d'un module.**
  Attendu, et annoncé plutôt qu'écrit.
