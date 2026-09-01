# ADR 0044 — Le filet anti-fuite remonte au transport et sert les deux fils

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `core/transport/anti-fuite.ts` (à créer),
  `core/transport/http/reponse.ts`, `core/transport/http/transport.ts`,
  `core/transport/stdio/serveur.ts`
- **Sources** : ADR 0033 (le filet anti-fuite de la réponse HTTP) ; ADR 0025
  (deux transports, un seul noyau) ; cahier des charges v6, § 20 ; rapport de
  recette du lot 3, constat n° 4

---

## Le fait

Le § 20 exige que le jeton de confirmation ne paraisse « **jamais** dans la
réponse d'erreur ». Il ne distingue pas le transport.

Mesure transcrite : `verifierAucuneFuite` compte **deux occurrences** dans le
dépôt hors gardes — sa définition, `core/transport/http/reponse.ts:227`, et **un
seul appel de production**, `core/transport/http/transport.ts:390`. **Rien sous
`core/transport/stdio/`** — 6 modules de production balayés, 0 appelant.

Or le fil stdio sert le **même noyau** (ADR 0025), **accepte et transporte le
même jeton de confirmation**, et n'a **aucun équivalent**. Le filet couvre un
transport sur deux, et c'est le mot « jamais » du § 20 qui devient faux.

C'est le motif du dossier, sous une autre forme que celle de l'ADR 0041 : une
règle **tenue là où on l'a écrite**, et pas là où elle s'applique.

## La décision

### 1 · Le filet remonte d'un étage

`verifierAucuneFuite`, `VerdictDeFuite`, `ValeurSensible` et
`LONGUEUR_MINIMALE_CONFRONTEE` quittent `core/transport/http/reponse.ts` pour
**`core/transport/anti-fuite.ts`** — à côté de `core/transport/valeurs-servies.ts`,
que le lot 3 vient d'unifier pour la même raison exactement : une dérivation qui
vaut pour les deux fils n'appartient à aucun des deux.

`core/transport/http/reponse.ts` la **ré-exporte** pour ne casser aucun appelant,
et le registre sait qu'un ré-export n'est pas un appelant.

### 2 · Elle prend la réponse SÉRIALISÉE de chaque transport

Le filet d'aujourd'hui reçoit une `ReponseHttp` — statut, en-têtes, corps. Il
doit recevoir **ce que le transport va réellement écrire sur le fil**, quel que
soit le fil : une chaîne, et le nom de ce qui l'a produite.

Pour stdio, c'est la trame JSON-RPC **sérialisée**, en-têtes de cadrage compris.
Confronter l'objet avant sérialisation laisserait passer une valeur qu'un
sérialiseur recopierait dans un champ d'erreur — et c'est précisément le chemin
d'exception, celui qu'on garde le moins.

### 3 · Les deux transports l'appellent, et sur le chemin d'ERREUR

L'appel se fait à l'endroit où la réponse part, **y compris quand elle part
depuis un `catch`**. Le § 20 parle de la **réponse d'erreur** : la garder sur le
chemin nominal seulement reviendrait à ne pas la garder.

### 4 · La preuve attendue du correcteur

> **La MÊME mutation doit tuer un test côté stdio comme elle en tue un côté
> HTTP.**

Concrètement : neutraliser le filet — lui faire rendre `fuites: []` sans
regarder — doit faire rougir **au moins un test de chaque côté**. Un seul côté
rouge signifie que la remontée est cosmétique et que le fil stdio n'est toujours
pas couvert.

Le compte de valeurs **réellement confrontées** est déjà annoncé par
`VerdictDeFuite.valeursConfrontees`, des deux côtés : `TraceDeTraitement.fuite`
en HTTP, `MesuresDuServeurStdio.valeursConfrontees` en stdio. Un filet qui aurait
regardé zéro valeur est donc **lisible**.

> 🔴 **CORRECTION DE LA RECETTE DU LOT 4 — CE PARAGRAPHE A ÉCRIT UNE FAUSSETÉ, ET
> IL FAUT LA LIRE AVANT D'AGIR DESSUS.**
>
> La rédaction d'origine disait : « `reponseSansFuite` refuse d'expédier une
> réponse dont le filet n'a confronté aucune valeur alors qu'on lui en a nommé.
> **Cette propriété doit survivre à la remontée.** » **`reponseSansFuite`
> n'existe nulle part dans ce dépôt et n'a jamais existé** — le nom ne paraît que
> dans des blocs de prose. La propriété n'a donc pas « survécu » à la remontée :
> elle n'a jamais eu de porteur. Une prose qui décrit une garde absente est le
> pire des trois états, parce qu'un relecteur y compte un verrou de plus.
>
> **Ce qui est vrai aujourd'hui, mesuré :** aucun des deux transports ne refuse
> pour ce motif ; ils ne remplacent la réponse que sur une fuite CONSTATÉE. La
> propriété est tenue par une GARDE — `core/transport/anti-fuite.spec.ts`,
> § « TÉMOIN INVERSE », qui exige des deux fils un compte de valeurs confrontées
> non nul — et pas par la production. L'en-tête de `core/transport/anti-fuite.ts`
> porte déjà cet écart, mot pour mot.
>
> **Et la règle n'est PAS reprise telle quelle en dette, parce qu'elle est
> dangereuse telle qu'elle est écrite.** `valeursConfrontees === 0` ne veut pas
> dire « le filet n'a rien regardé » : il vaut aussi zéro quand TOUTES les
> valeurs nommées ont été légitimement **écartées** parce qu'elles sont plus
> courtes que `LONGUEUR_MINIMALE_CONFRONTEE`. Un en-tête `Host` de sept
> caractères suffit. Poser `refuser si valeursConfrontees === 0` dans `sceller()`
> et dans `ecrireReponse()` ferait donc refuser **toutes** les réponses d'un
> socle servi sur un hôte au nom court : une panne totale, provoquée par la garde
> elle-même. Le refus juste distingue les deux cas —
> `valeursConfrontees === 0 && valeursEcartees === 0`, soit « on m'a nommé des
> valeurs et je n'en ai regardé aucune ».
>
> **Dette nommée, et son porteur :** `core/epreuve/lot4-la-garde-des-assertions-attaquee.temoin.spec.ts`,
> `it.fails` « un filet qui n'a confronté AUCUNE valeur nommée doit retenir la
> réponse, sur les DEUX fils ». Il rougira le jour où le refus sera posé. Le
> correcteur qui le ferme doit écrire la distinction ci-dessus dans le code, pas
> seulement le refus.

### 5 · La dette est NOMMÉE en attendant

`it.fails` « verifierAucuneFuite vit sous `core/transport/` et les DEUX transports
l'appellent », dans
`core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts`. Il balaie
`core/transport/stdio/`, **annonce le nombre de modules balayés** — plancher à 4,
sans quoi un dossier déplacé le rendrait vert — et il est inscrit au registre
comme `assertion` de cet ADR (ADR 0041).

## Les bornes, écrites avec la décision

- **Le filet compare des CHAÎNES.** Une valeur sensible qui sortirait
  **transformée** — tronquée, ré-encodée, hachée puis affichée — lui échappe. Le
  filet est un **plancher** de détection, jamais une preuve d'absence de fuite.
- **`LONGUEUR_MINIMALE_CONFRONTEE` écarte les valeurs trop courtes**, et le
  verdict les compte séparément (`valeursEcartees`). Cette borne doit rester
  **comptée** après la remontée, pas seulement écrite.

## Ce qui a atterri — lot 4, 2026-09-01

La décision est **appliquée**. Ce qui suit est transcrit, pas annoncé.

- `core/transport/anti-fuite.ts` existe et porte `verifierAucuneFuite`,
  `valeursSensiblesDeLAppel`, `VerdictDeFuite`, `SortieServie`, `ValeurSensible`
  et les trois bornes. `core/transport/http/reponse.ts` le **ré-exporte** et
  n'en écrit plus rien ; elle n'ajoute que `sortieServieHttp`, la sérialisation
  qui appartient à sa porte.
- **2 appelants de production**, contre 1 avant :
  `core/transport/http/transport.ts` et `core/transport/stdio/serveur.ts`.
- Sur stdio, le filet est posé sur `ecrireReponse`, **point d'écriture unique** :
  `refuserLEnveloppe`, le refus de chaîne et le `catch` de `servirToolsCall` y
  passent tous. `MesuresDuServeurStdio` expose désormais `valeursConfrontees` et
  `reponsesRetenues` — un filet qui aurait confronté zéro valeur se verrait.
- **La collecte est unifiée** : `valeursSensiblesDeLAppel` remplace le
  `chainesDeLInput` privé de `transport.ts`. Sans elle, le silence des deux fils
  n'aurait rien prouvé — chacun aurait pu confronter une liste différente.

### La preuve exigée au § 4, transcrite

`core/transport/anti-fuite.spec.ts` met **4 entrées** — jeton de confirmation,
clé d'idempotence, curseur, argument — devant les **2 transports**, chacun dans
SON emballage (`params._meta` sous `ops/` pour HTTP, clés à plat pour stdio).

| état                                  | résultat                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| **AVANT** (`serveur.ts` de `b8718f7`) | `4 failed \| 2 passed` — **4 valeurs ressorties, toutes « → stdio »**, 0 côté HTTP |
| **APRÈS**                             | `6 passed` — 8 sorties relues, **0 valeur ressortie**, 0 fil aveugle               |

Les quatre échecs ne nommaient **que** le fil stdio : c'est la forme exacte du
défaut, et c'est ce que « un seul côté rouge signifie que la remontée est
cosmétique » demandait de vérifier.

La dette du § 5 est **fermée** : le `.fails` a été retiré de
`core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts` après que
l'`it.fails` soit passé au vert — donc rouge (`1 failed | 3 passed`).
`cousuesNonAtterries` passe de 1 à **0**.

### Un défaut trouvé sur la garde elle-même, en l'écrivant

À sa première exécution contre l'état d'avant, **deux planchers de cette garde
sont restés VERTS sur `undefined`** : le fil stdio ne portait aucun compteur,
`mesures().reponsesRetenues` valait `undefined`, et `undefined === 0` est faux.
La garde annonçait « 0 sans retenue » sur un fil qui ne mesurait rien.

`comptePositif()` ferme le cas : un compte qui n'est pas un nombre fini
strictement positif n'est **pas** un zéro, c'est un **aveuglement**. Le même
piège attend toute garde qui lit un compteur d'un module dont elle ne partage
pas la compilation.

## Ce qu'on a rejeté

- **Écrire un second filet pour stdio.** Deux dérivations d'un même fait finissent
  par se contredire, et c'est la seconde qui ne suit jamais. Une seule
  implémentation, deux appelants.
- **Laisser le filet en HTTP et documenter la borne.** C'est ce que le dépôt
  faisait déjà. Le § 20 dit « jamais », pas « jamais en HTTP ».
