# ADR 0019 — Toute décision nomme le symbole qui la porte, et une garde confronte ce registre au graphe d'appels

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1d)
- **Portée** : `core/coutures/registre.ts` (nouveau), `core/coutures/contrat.ts`
  (nouveau), `core/coutures/registre.spec.ts` et
  `core/coutures/couture.temoin.spec.ts` (constructeur ①), `tsconfig.build.json`
  (`exclude`), `docs/adr/` (le dossier devient une SOURCE de garde)
- **Sources** : l'épreuve du lot 1c
  (`core/epreuve/lot1c-la-couture-manquante.temoin.spec.ts`), la garde G2 du
  graphe d'imports (`core/chaine/identite.spec.ts`), `core/chaine/modules.ts`
  (le motif de la table-feuille), ADR 0014, ADR 0015, ADR 0016, ADR 0018

---

## Le défaut, et il est systémique

L'épreuve du lot 1c a mesuré un mode de défaillance que rien ne surveillait :

> **une décision écrite, testée, documentée — et non cousue au chemin de
> production.**

Quatre ADR sur cinq étaient dans cet état. Leurs fonctions existaient, étaient
exportées, étaient gardées ; **aucun module de production ne les appelait**. Les
tests passaient parce qu'ils éprouvaient la FONCTION, jamais son BRANCHEMENT.

Le témoin, mot pour mot, sur la fonction d'union de l'ADR 0016 :

```
[G3 · couture de l'union] 73 module(s) de production scanné(s) ·
1 définisseur(s) : adapter-kit/champs-declares.ts ·
0 appelant(s) : aucun ·
2 citation(s) en COMMENTAIRE : adapter-kit/types.ts, registry/types.ts
```

**Ce n'est pas quatre oublis, c'est UN défaut.** Rien, dans le dépôt, ne
confrontait la prose d'un ADR au graphe d'appels réel. Il s'ensuit le pire des
trois états possibles : le trou est ouvert, **et** la documentation donne
l'apparence d'un périmètre couvert. Les deux citations en commentaire suffisaient
d'ailleurs à faire croire la couture faite à qui cherchait le nom au `grep` —
c'est la règle maison « un `grep` ne prouve que l'absence de la FORME écrite »,
prise à l'envers.

---

## Décision, en trois pièces indissociables

### 1 · Un REGISTRE, qui est une donnée typée et non de la prose

`core/coutures/registre.ts` — une entrée par décision, plusieurs par ADR quand
l'ADR en porte plusieurs. Chaque entrée nomme le **symbole**, son **genre**, le
**module qui le définit**, l'**état attendu aujourd'hui**, et un **motif écrit**.

Ce fichier **n'importe rien**. C'est le motif de `core/chaine/modules.ts` : une
table que tout le monde lit ne doit dépendre de personne, sans quoi l'ordre de
chargement décide de sa valeur.

Quatre états, et ils forment une **totalité**, pas une échelle :

| État        | Ce que la garde EXIGE                         | Ce que l'état dit                                              |
| ----------- | --------------------------------------------- | -------------------------------------------------------------- |
| `cousue`    | **au moins un** appelant de production        | la décision atteint ce qui tourne                              |
| `à-coudre`  | **exactement zéro**                           | la dette est chiffrée, pas cachée                              |
| `à-nommer`  | le dossier attendu est **absent du disque**   | le symbole n'est pas nommable honnêtement ; l'entrée se périme |
| `hors-code` | rien, mais un **motif écrit** est obligatoire | autre dépôt, table, ADR non acceptée                           |

### 2 · Une GARDE qui rougit **dans les deux sens**

`core/coutures/registre.spec.ts`. Pour chaque entrée, elle mesure les appelants
de production du symbole et confronte le compte à l'état déclaré.

**Les deux sens comptent, et pour des raisons différentes :**

- une entrée `cousue` qui perd son dernier appelant → la décision a été
  débranchée sans que personne le dise ;
- une entrée `à-coudre` qui en gagne un → **le jour où un constructeur coud sans
  mettre le registre à jour, la prose recommence à mentir.** C'est ce second sens
  qui empêche le registre de pourrir, et c'est celui qu'on oublie d'écrire.

Elle annonce des **nombres** : modules de production balayés, symboles
confrontés, répartition par état et par genre, et pour chaque symbole le nombre
d'appelants **avec leurs noms**.

### 3 · Une garde de COUVERTURE, qui lit `docs/adr/` et non le registre

C'est elle qui rend un ADR neuf impossible à oublier. Elle **ne demande pas au
registre quels ADR existent** — elle lit le dossier. Un ADR qui atterrit sans
entrée fait monter `adrTrouves` sans faire monter `adrCouverts`, et l'écart est
l'anomalie.

Elle lit aussi le **statut** dans l'en-tête : un ADR `proposée` peut
légitimement n'avoir aucun symbole, un ADR `acceptée` classé `hors-code` doit
porter un motif. Si le format d'en-tête change, `statutsLus` s'effondre et le
plancher le dit — la garde ne devient pas muette en silence.

---

## Ce que la garde MESURE, et les trois formes qu'elle a dû apprendre

La question posée est : _ce symbole a-t-il un appelant dans un fichier de
production ?_ Trois pièges ont été mesurés en la posant, et chacun a produit une
règle.

**① Un ré-export n'est pas un appelant.** `core/adapter-kit/index.ts` exporte
`cumulerChampsDeGouvernance` ; la fonction n'en est pas moins morte. La garde
retire donc toute clause `import … from` **et** `export … from` avant de
chercher.

**② Une citation en commentaire n'est pas un appel.** Deux modules nomment la
fonction dans un bloc JSDoc, parenthèses comprises. La garde retire les
commentaires — et **compte les citations restantes**, parce qu'un compte de
citations qui tombe à zéro sans que les appelants montent signale que le filtre
de commentaires a cessé de fonctionner.

**③ Un argument de type s'intercale entre le nom et la parenthèse.** Le motif
naïf `nom\s*\(` déclare **`avecJournal` non cousue** : l'orchestrateur l'appelle
`avecJournal<ChargeServie>(…)`. Une garde écrite sans cette forme aurait annoncé
un trou inexistant sur le module le plus central du socle — et le remède qu'on
lui aurait cherché aurait été de la désactiver. La forme cherchée pour le genre
`fonction` admet donc un argument de type optionnel.

Quatre genres, quatre formes, **une règle par genre et non une expression par
entrée** — sans quoi la garde porterait sa liste :

| Genre       | Forme cherchée                         | Borne écrite avec la règle                                        |
| ----------- | -------------------------------------- | ----------------------------------------------------------------- |
| `fonction`  | nom + argument de type optionnel + `(` | la plus forte des quatre                                          |
| `constante` | le nom seul                            | **la plus faible** : un nom se cite plus qu'il ne s'appelle       |
| `type`      | l'IMPORT du symbole                    | un type ne s'appelle pas ; l'import EST la couture                |
| `membre`    | `.` + le nom                           | un nom banal rendrait de faux appelants — d'où l'annonce des noms |

---

## Ce que « zéro appelant » veut dire aujourd'hui, et pourquoi la garde ne l'interdit pas

🔴 **LE SOCLE N'A PAS DE RACINE DE COMPOSITION.** Ni serveur, ni `main.ts`, ni
console : `core/transport/` est un lot à venir, et `adapters/`, `console/`,
`voice/` sont des dossiers **vides**. Mesuré sur les 73 modules de production :

| Symbole                      | ADR  | Appelants de production |
| ---------------------------- | ---- | ----------------------- |
| `verifierChaine`             | 0002 | **0**                   |
| `creerScelleurJournal`       | 0002 | **0**                   |
| `dialecteDeFermeture`        | 0003 | **0**                   |
| `verifierEnumerationProfils` | 0004 | **0**                   |
| `estErreurDeCoffre`          | 0005 | **0**                   |

Une garde qui exigerait un appelant pour tous serait **rouge en permanence, pour
une raison qui n'a rien à voir avec la règle gardée** — et elle serait désactivée
dans la semaine. C'est le « rouge pour la mauvaise raison » que
`ops/temoin-ci.ts` nomme déjà.

D'où l'état `à-coudre`, qui n'est pas une échappatoire : **il ne cache pas la
dette, il la chiffre.** L'ADR peut écrire « la décision est prise », le registre
écrit « personne ne l'appelle », et les deux phrases cohabitent sans que la
seconde puisse se perdre.

### Un écart trouvé en établissant le registre

`verifierEnumerationProfils` (ADR 0004) a **zéro** appelant, quand sa voisine
immédiate `verifierFormeDuSceau` — même fichier, même décision — en a un. Le
sceau des profils est donc confronté dans sa **forme** et jamais dans son
**contenu** : un manifeste peut annoncer une énumération de profils que personne
ne dément. **Le registre a trouvé son premier défaut en étant simplement
écrit.**

---

## `tsconfig.build.json` gagne deux exclusions, et ce n'est pas un détail de confort

Le critère « fichier de production » est **dérivé** de l'`exclude` de
`tsconfig.build.json` — c'est déjà le critère de la garde G2, et c'est le bon :
ce qui rend une décision non cousue dangereuse est qu'elle n'atteint pas **ce qui
tourne**.

Or l'`exclude` actuel — `["node_modules", "dist", "**/*.spec.ts", "*.config.ts"]`
— **émet** `core/epreuve/outils.ts`, `core/audit/fixtures.ts` et
`core/identite/fixtures.ts`. Un symbole dont l'unique appelant serait une
fabrique de témoins passerait donc pour cousu.

Le remède n'est **pas** une seconde liste dans la garde : ce serait exactement la
liste qu'elle ne doit pas porter. C'est d'ajouter le dossier `core/epreuve/` et
tout `fixtures.ts` à l'`exclude` — ce qui est de toute façon la vérité, mesurée :
**aucun module de production n'en importe un seul.** La garde reste alors une
pure dérivation, et G2 y gagne au passage : la fabrique de sessions de témoins
cesse d'être émise par `pnpm build`.

---

## Ce que la décision EXCLUT

- **Une garde qui porterait la liste des symboles.** Elle serait une seconde
  source de vérité, et c'est la seconde qui ne suit jamais. Le registre est la
  donnée ; la garde est la dérivation.
- **Un registre en Markdown.** `docs/adr/COUTURES.md` était l'autre voie. Refusée :
  un tableau de prose ne se type pas, un nom de symbole mal orthographié n'y est
  pas une erreur de compilation, et un état inventé n'y est pas une erreur
  d'union. Le registre est du TypeScript **parce qu'un compilateur le relit**.
- **Exiger un appelant pour toute décision acceptée.** Voir ci-dessus : rouge en
  permanence, donc désactivée.
- **Une garde qui lirait le disque depuis son propre corps.** Elle ne serait
  éprouvable qu'en mutilant le dépôt. La garde est une fonction **pure** d'un
  ensemble de fichiers ; le témoin lui en passe un fabriqué.
- **Compter les `index.ts` par leur nom de fichier.** La règle qui vaut est
  « une clause `export … from` n'est pas un appel », et elle tient partout, y
  compris dans un barillet qui ne s'appellerait pas `index.ts`.
- **Faire de `hors-code` un état sans motif.** Il deviendrait la voiture-balai du
  registre en trois ADR. Le motif est obligatoire, et le type l'impose.
- **Laisser `à-nommer` sans date de péremption.** L'entrée nomme le dossier
  attendu et la garde exige qu'il soit **absent**. Le jour où il atterrit, elle
  rougit. Un état qui ne peut pas pourrir en silence.

---

## Ce que le constructeur ① doit écrire

1. `core/coutures/registre.spec.ts` — les deux gardes, écrites contre les types
   de `core/coutures/contrat.ts`. **Fonctions pures**, ensemble de fichiers
   injecté.
2. `core/coutures/couture.temoin.spec.ts` — les témoins fabriqués. **Au moins
   quatre**, et chacun sur une propriété différente :
   - retirer l'unique appelant de production d'un symbole `cousue` → **rougit** ;
   - ajouter un appelant à un symbole `à-coudre` → **rougit** ;
   - un fichier qui cite le symbole **dans un commentaire** → n'est pas compté ;
   - un fichier qui le **ré-exporte** → n'est pas compté ;
   - un appel `nom<T>(…)` → **est** compté (témoin de la règle ③) ;
   - un ADR fabriqué, absent du registre → **rougit**.
3. `tsconfig.build.json` : `exclude` gagne le dossier `core/epreuve/` et tout
   `fixtures.ts`. Vérifier que `pnpm build` reste vert — mesuré : aucun module de
   production ne les importe.
4. Les **planchers-témoins**, sans lesquels la garde serait verte en ne lisant
   rien : `modulesDeProduction ≥ 60`, `symbolesConfrontes ≥ 20`,
   `adrTrouves ≥ 14`, `motifsLus ≥ 2`.
5. `core/coutures/registre.ts` gagne l'entrée de tout ADR neuf. **C'est la seule
   dette que cet ADR crée, et elle est visible : la garde de couverture rougit
   tant qu'elle n'est pas payée.**

### Les trois gardes

| Garde                                                                          | Ce qu'elle annonce                                                                        | Le témoin qui la fait rougir                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **G1 — chaque symbole a le nombre d'appelants que son état déclare.**          | modules balayés · symboles confrontés · appelants NOMMÉS par symbole · citations en prose | Retirer l'unique appelant d'un `cousue` ; en ajouter un à un `à-coudre`.                  |
| **G2 — chaque ADR du dossier est inscrit au registre.**                        | ADR trouvés · couverts · statuts lus · acceptés · sans entrée · entrées fantômes          | Fabriquer un `0099-*.md` : le compte des trouvés monte, celui des couverts non.           |
| **G3 — les trois formes de non-appel ne sont pas comptées, la quatrième oui.** | témoins éprouvés · désaccords                                                             | Retirer le retrait de commentaires : le compte d'appelants monte sans qu'un appel existe. |

---

## Conséquences acceptées

1. **Un ADR neuf coûte une entrée de registre.** C'est le prix, et il est
   délibéré : c'est le seul moment où l'on sait encore qui porte la décision.
2. **Le registre porte des comptes mesurés à une date.** Ils sont écrits dans les
   motifs pour qu'une revue ultérieure puisse les **contredire** au lieu de les
   croire. Un motif qui vieillit mal est un motif qu'on relit.
3. **La garde du genre `constante` est faible**, et elle est nommée comme telle.
   Un nom seul se cite plus facilement qu'il ne s'appelle ; la lire comme une
   preuve serait la faute que cet ADR combat.
4. **Le registre ne dit pas si la couture est BONNE**, seulement si elle existe.
   L'ADR 0015 en est l'exemple : sa couture est un **retrait de paramètre**, que
   le compte d'appelants ne mesure pas. L'entrée délègue alors à une garde
   nommée — et la délégation est **comptée**, parce qu'une échappatoire qu'on
   compte n'en est plus une.

---

## Ce qui reste OUVERT

- **Les décisions prises hors ADR.** Le dépôt en porte : les écarts assumés
  écrits dans les en-têtes de module (`OUTIL_INCONNU`, `vault_locked` avant
  l'ADR 0005). Ce registre ne les voit pas. Le remède serait d'exiger un ADR pour
  tout écart au CDC — décision de Will, pas de l'architecte.
- **Le genre `membre` sur un nom banal.** La garde annonce les fichiers trouvés,
  ce qui rend un compte anormal lisible, mais elle ne le refuse pas. À reprendre
  si le registre gagne plusieurs entrées de ce genre.
- **`verifierEnumerationProfils`** — l'écart trouvé ci-dessus. Il n'est pas
  refermé par cet ADR : il est **inscrit**, en `à-coudre`, ce qui est exactement
  ce que le registre est fait pour rendre impossible à perdre.
