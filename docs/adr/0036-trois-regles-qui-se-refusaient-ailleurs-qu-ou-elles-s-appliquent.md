# ADR 0036 — Trois règles écrites qui se refusaient ailleurs qu'où elles s'appliquent

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `core/chaine/orchestrateur.ts` (étape 7), `core/profiles/budget.ts`,
  `core/__tests__/integration.spec.ts` (réimplémentation à SUPPRIMER),
  `core/registry/enregistrer.ts` (contrôle 7 ter), `core/registry/types.ts`
  (`MOTIFS_REFUS`), `core/adapter-kit/conformite.ts` (contrôle 4),
  `ops/conformite-ci.ts`
- **Sources** : cahier des charges v6, § 09 (le harnais de conformité, contrôle 4),
  § 13.3 (la cascade de compaction et le schéma publié), § 14 (les trois
  corrections, dont « le plafond se refuse à l'étape 7, pas seulement en CI »),
  § 15 (un refus dit quoi faire ensuite), § 29 (le CRM en PHP) ; ADR 0003,
  ADR 0019, ADR 0030

---

## Le fait qui rend cette décision nécessaire

Trois règles du cahier des charges sont **écrites, éprouvées, documentées — et
mesurées à côté de l'endroit où elles s'appliquent**. Aucune n'a de garde qui
rougisse, parce que dans les trois cas la garde regarde ailleurs.

**① Le plafond de 40 outils SERVIS (§ 14, correction 3).** Le paragraphe écrit
mot pour mot « le plafond se refuse à l'étape 7, **pas seulement en CI** ».
Mesuré :

| ce qui existe                         | où                                          |
| ------------------------------------- | ------------------------------------------- |
| la mesure, avec son étape et son code | `core/profiles/budget.ts`                   |
| **zéro appelant de production**       | mesuré sur 130 modules émis par le build    |
| l'étape 7 réelle                      | `estServi` seul — aucun comptage            |
| le seul refus effectif du dépôt       | **dans un test**, `integration.spec.ts:485` |
| la CI                                 | ne mesure ni `budget`, ni `PLAFOND`         |

Un test qui **réimplémente** la règle éprouve son propre sosie. Et le registre
des coutures ne portait aucune entrée sur le sujet : la garde qui existe pour
repérer ce cas précis était aveugle à celui-là.

**② Le rang 2 obligatoire au schéma de sortie (§ 13.3).** La règle — tout champ
de `compaction.tier2` est OPTIONNEL au schéma `output` — est tenue **du côté
BUILD** (`manifest.ts`, contrôle C13.3) et nulle part ailleurs.
`grep -rn "requisDuSchema" core ops` rend **5 lignes, toutes dans
`core/adapter-kit/`, zéro sous `core/registry/`**. Or `enregistrer.ts` se déclare
lui-même « la SEULE barrière statique pour un manifeste produit ailleurs : le CRM
en PHP, dépôt public à jamais ». Le mode **fédéré**, celui que la règle vise, est
donc le seul pour lequel elle ne s'applique jamais. Et rien ne rattrape en aval :
`outputSchema` n'est validé à aucun moment du runtime, et l'étape 14 l'écrit
elle-même (« ici on retire, on ne revalide pas »).

**③ Le `fixtureMax` du § 09, contrôle 4.** Le libellé promet « aucune sortie ne
dépasse son `maxBytes` **sur son `fixtureMax`** ». Le corps du contrôle itère
`entree.fixtures`, apparie par `fixture.outil`, et **ne lit `fixtureMax` à aucun
moment** : les six seules occurrences du dépôt sont un titre de section, le
libellé, deux lignes qui vérifient que la chaîne n'est pas VIDE, la déclaration
de type et une valeur de verrou. Une charge d'un octet sous un chemin quelconque
rend le contrôle vert avec son compte annoncé.

C'est le défaut que **le même fichier a corrigé pour le contrôle 3**, où le
libellé a été réécrit pour ne plus promettre plus que sa mesure. La correction
n'a pas été portée à son voisin immédiat : **le jumeau oublié**.

---

## Décision

### 1 · Le plafond du § 14 se refuse à l'étape 7, dans le même bloc que `estServi`

L'étape 7 pose désormais **les deux questions**, dans cet ordre :

1. **appartenance** — `estServi(outil, profil)` : inchangé, et il reste premier,
   parce qu'un outil absent du profil se refuse sans qu'aucun plafond n'ait à
   être mesuré ;
2. **plafond** — `mesurerBudgetProfil` appelé sur le profil retenu et
   l'inventaire du pilotage, puis refus **sur `verdict.depasse`**.

**Le numéro d'étape et le code du refus sont LUS dans le verdict**
(`verdict.etapeDeRefus`, `verdict.codeDeRefus`), jamais réécrits. `budget.ts` les
dérive déjà d'`APPEL_STEPS` par la clé `profil` ; les recopier à l'étape 7
fabriquerait la seconde source de vérité que l'ADR 0030 interdit.

**Le message porte les nombres que le verdict porte déjà** — outils servis,
plafond, dépassement, octets, et l'outil le plus lourd. Un refus qui dirait
seulement « profil trop plein » n'apprendrait pas quel outil retirer (§ 15).

⚠️ **LE CODE EST EXACT POUR L'APPARTENANCE ET INEXACT POUR LE PLAFOND, ET ON NE
L'INVENTE PAS.** `tool_not_in_profile` dit « absent du profil actif » ; sur un
dépassement, l'outil y est, c'est le profil qui déborde. Le § 15 n'énumère aucun
code pour ce second cas. `budget.ts` a déjà tranché en laissant l'écart VISIBLE
plutôt qu'en le bouchant par un code voisin qui mentirait sur la cause ; cette
décision reprend cet arbitrage tel quel, et le MESSAGE distingue les deux — c'est
lui que l'appelant lit.

### 2 · `inventaire()` devient un port du chemin NOMINAL, mémoïsé PAR APPEL

`EtatDePilotage.inventaire` était documenté « appelée QUE quand `profilActif`
rend `null` : un chemin de panne, pas le chemin normal ». Cette phrase devient
fausse et doit être corrigée dans le même geste — une prose qui survit à sa règle
est le défaut que le lot 1c a nommé.

**Elle est appelée à CHAQUE appel**, et c'est le sens même de la correction 3 du
§ 14 : `ops_tool.enabled` bascule en console **sans redéploiement**, donc la
valeur mesurée en CI n'est jamais celle qui est servie. Mesurer au démarrage
seulement rendrait le plafond aussi faux que la CI.

**Elle est mémoïsée par `memoiserPourCetAppel`, jamais au-delà de l'appel.** Un
cache inter-appels réintroduirait exactement la divergence que la correction 3
existe pour fermer, et il le ferait en silence.

### 3 · Une mesure AVEUGLE refuse, elle ne passe pas

`VerdictBudget.mesureAveugle` vaut `true` quand moins d'outils que le
plancher-témoin ont été soumis. À l'étape 7, cela ne peut vouloir dire qu'une
chose : **l'étape 6 a trouvé l'outil au catalogue et le pilotage rend un
inventaire vide** — les deux se contredisent.

Le socle **refuse**, et le message NOMME la contradiction plutôt que le plafond.
Laisser passer ferait exactement ce que ce dépôt appelle « une garde verte parce
qu'elle ne regarde rien » : le plafond serait mesuré sur zéro outil, et il ne
pourrait plus jamais mordre.

### 4 · La réimplémentation du test est SUPPRIMÉE

`core/__tests__/integration.spec.ts:485` réécrit la règle sous le commentaire
« § 14 — le plafond se refuse ICI, pas seulement en CI ». Elle disparaît, et le
test éprouve le **code de production**. Tant qu'elle vit, la garde est verte quoi
qu'il arrive à l'étape 7 : c'est une garde qui mesure sa propre recopie.

⚠️ **NE PAS SUPPRIMER LE TEST — SUPPRIMER SA RÉIMPLÉMENTATION.** Le cas éprouvé
(un profil au-delà de 40 outils servis se refuse) reste, monté sur l'orchestrateur
réel.

### 5 · La CI mesure AUSSI, et les deux mesures ne sont pas la même

`ops/conformite-ci.ts` mesure le plafond sur le catalogue **épinglé par le
verrou** — la liste DÉCLARÉE, statique, connue avant le déploiement. L'étape 7
mesure la liste **SERVIE**, dynamique. Le § 14 veut les deux : « pas SEULEMENT en
CI » n'a jamais voulu dire « plus en CI ».

**Une seule fonction porte les deux mesures.** Deux implémentations de « combien
d'outils ce profil sert-il » divergeraient au premier champ ajouté, et la
divergence serait muette (ADR 0003).

### 6 · Le rang 2 obligatoire se REFUSE à l'admission, pas s'annonce

Dans la boucle `for (const outil of manifeste.tools)` du contrôle 7 ter,
`enregistrer.ts` appelle **la MÊME fonction que le build** — `requisDuSchema`,
déjà exportée par `core/adapter-kit/manifest.ts`, dont ce module importe déjà
`nomComplet` et `prefixeDe` — et pousse **un refus par champ** de
`outil.compaction.tier2` présent dans les requis du schéma de sortie.

- nouveau motif dans `MOTIFS_REFUS` : **`rang2_obligatoire_au_schema`** ;
- les champs confrontés sont **COMPTÉS dans les annonces**, comme le font déjà
  `gouvernanceConfrontes` et `idFieldsConfrontes`. Sans ce compte, la garde ne
  dira pas combien d'éléments elle a mesurés, et un contrôle qui n'aurait
  confronté aucun champ passerait pour « rien à signaler ».

**Pourquoi un REFUS et non une annonce.** L'ADR 0015 a choisi l'annonce pour
`idFields`, parce qu'on n'interdit pas ce qu'on ignore. Ici c'est l'inverse : la
règle est TENUE au build, et admettre à l'admission ce que le build refuse est
précisément « le build accepte ce que l'admission refuse — ou l'inverse, ce qui
est pire » (ADR 0003). Une charge compactée au deuxième palier ne validerait plus
le schéma que l'outil PUBLIE, et aucun étage en aval ne le rattrape.

### 7 · Le contrôle 4 apparie par le CHEMIN DÉCLARÉ, ou il dit qu'il n'a rien mesuré

Pour chaque outil, le contrôle 4 exige qu'une fixture de `entree.fixtures` porte
**`chemin === outil.fixtureMax`**. Quand aucune ne le fait, l'anomalie est nommée
et porte les chemins **réellement exécutés** :

> « `<outil>` : le jeu maximal déclaré `<fixtureMax>` n'a pas été exécuté —
> `<n>` fixture(s) fournie(s) pour cet outil : `<chemins>`. Le contrôle mesurerait
> alors une charge quelconque en l'appelant « le jeu maximal ». »

Le libellé du contrôle reste celui du § 09 **parce qu'il redevient vrai**. Il ne
faut pas faire les deux : réécrire le libellé ET apparier serait avouer qu'on
mesure moins que ce qu'on annonce tout en mesurant autant.

⚠️ **`fixtureMax` N'ENTRE PAS DANS LE MANIFESTE, ET C'EST DÉLIBÉRÉ.** C'est un
chemin sur le disque de l'adaptateur : il ne veut rien dire pour le socle, et
l'admission ne peut pas l'exécuter. Le contrôle 4 est et reste un contrôle de
BUILD, tourné dans la CI de l'adaptateur. C'est la borne de cette décision, et
elle est écrite plutôt que découverte.

---

## Ce que cette décision NE COUVRE PAS

- **Aucun dépassement n'a été observé.** `ops/index.ts` livre un catalogue VIDE
  et `adapters/` est vide : le constat porte sur l'ABSENCE du contrôle, jamais
  sur un débordement mesuré.
- **Le second plafond du § 14 — les octets de définitions — n'a pas été confronté
  séparément.** Il vit dans le même verdict, donc au même endroit non appelé, et
  il sera refusé par le même geste. Personne n'a construit un catalogue sous
  40 outils et au-dessus du plafond d'octets ; **c'est la mesure qui manque, et
  elle est demandée à la garde du § 5.**
- **Le ratio octets/token reste PROVISOIRE.** `RATIO_OCTETS_PAR_TOKEN_PROVISOIRE`
  attend la mesure M5, hors CI, dans un ADR daté nommant le modèle. Cette
  décision ne la fait pas.
- **Ce qu'un client fait d'une charge non conforme au schéma publié n'est pas
  mesurable** : aucun client n'existe. À rouvrir au premier adaptateur.

---

## Ce que les gardes doivent tenir

1. **Le plafond, mesuré sur l'orchestrateur RÉEL** : un catalogue de 41 outils
   servis dans le profil actif, un appel vers l'un d'eux, et le refus doit porter
   l'étape 7 dans `ops_audit.stepDenied`. **Et le témoin inverse est
   obligatoire** : 40 outils passent. Sans lui, un socle qui refuse tout
   satisferait la garde.
2. **La mesure aveugle** : catalogue non vide à l'étape 6, inventaire vide au
   pilotage → refus nommé, jamais un passage.
3. **Le rang 2 à l'admission** : le manifeste exact de la sonde de l'audit —
   `mode: "fédéré"`, `compaction.tier2: ["detailHref"]`,
   `outputSchema.required` contenant `detailHref` — doit être **REFUSÉ**, et le
   même document doit rester refusé au build. Les deux mesures, appariées.
4. **Le `fixtureMax`** : un outil dont toutes les fixtures portent un chemin
   AUTRE que `fixtureMax` doit produire une anomalie nommée ; le même outil avec
   la fixture au bon chemin doit être vert.
5. **Les mutations qui doivent MOURIR** — une par règle, chacune réappliquée sur
   le vrai code, suite complète relancée, puis restaurée et l'empreinte
   reconfrontée :
   - remplacer `verdict.depasse` par `false` à l'étape 7 ;
   - retirer l'appel à `requisDuSchema` du contrôle 7 ter ;
   - remplacer l'appariement par chemin du contrôle 4 par l'appariement par
     `fixture.outil` seul — c'est-à-dire le code d'avant.
     Chacune doit rougir. **Une correction dont on n'a pas vu la mutation mourir
     n'est pas prouvée.**

---

## Conséquences acceptées

- **`inventaire()` est appelé à chaque appel d'outil.** Sur le dépôt en mémoire
  d'aujourd'hui, le coût est nul ; sur un dépôt réel, la mémoïsation par appel le
  borne à une lecture. Le jour où cette lecture pèse, la réponse est un cache
  **daté et invalidé par la console**, jamais un cache silencieux.
- **`MOTIFS_REFUS` gagne une entrée.** C'est une union fermée : le compilateur
  refusera tout refus non déclaré, ce qui est le comportement voulu.
- **Trois entrées du registre des coutures changent d'état** quand les appels
  atterrissent — `mesurerBudgetProfil` et `executerHarnais` passent de `à-coudre`
  à `cousue`, `requisDuSchema` gagne un second appelant. **Aucune ne doit être
  basculée avant que l'appel existe** : c'est le geste exact que l'état
  `à-coudre` existe pour rendre visible.
