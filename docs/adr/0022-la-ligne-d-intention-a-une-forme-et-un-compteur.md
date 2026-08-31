# ADR 0022 — La ligne d'intention a une FORME et un COMPTEUR, et les deux atterrissent ensemble

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1d)
- **Portée** : `core/audit/intention.ts` (nouveau),
  `core/audit/vocabulaire.ts` (`OUTIL_INTENTION`, `NOMS_RESERVES_AU_SOCLE`),
  `core/audit/verification.ts` (`RapportVerification`, `GENRES_ANOMALIE`),
  `core/audit/cloture.ts` (`estLigneDAppel`), `core/registry/enregistrer.ts`
  (le refus des noms réservés), `core/chaine/orchestrateur.ts`
  (`PorteeDIntention`, l'étape 14)
- **Sources** : CDC v6 § 11 (invariant de sortie), § 12 (`ops_audit`, vocabulaire
  fermé), § 13.2 (`partialSources`), § 24 (observabilité), § 31 (purge et
  ancrage), objectif O6 ; **ADR 0002** (empreinte chaînée), **ADR 0017**
  (l'effet extérieur dans la ligne), **ADR 0021** (l'issue dérivée du cliquet)

---

## Le défaut : un mécanisme câblé qui n'a rien à écrire

`PorteeDIntention` est câblé **aux deux instants exacts** — `avantEffet` juste
avant l'effet extérieur, `apresEffet` dès l'issue connue. `INTENTION_NON_ARMEE`
est son implémentation neutre, et c'est une décision écrite, pas un oubli.

Mais **ce qu'`avantEffet` écrirait n'a aucune forme** :

- le vocabulaire fermé du § 12 n'a **aucun mot** pour désigner une intention —
  `DECISIONS` en compte trois, `OUTCOMES` cinq, et pas un ne dit « je vais
  tenter » ;
- `RapportVerification` porte **douze champs** et n'en compte **aucune** ;
- rien, dans le journal, ne saurait donc distinguer une intention **close** d'une
  intention **restée ouverte**.

🔴 **Armer le mécanisme dans cet état serait le pire des trois états.** Le
journal grossirait d'une écriture par appel exécuté, la promesse « une intention
sans issue EST l'alarme » serait affichée — et rien ne saurait lever cette
alarme. C'est le motif du lot 1c à l'identique : une décision écrite, non cousue,
et une documentation qui donne l'apparence d'un périmètre couvert.

**Une ligne qu'on écrit sans savoir la compter est une ligne qu'on ne saura pas
vérifier.**

---

## Décision

> **La forme et le compteur atterrissent ENSEMBLE, ou ni l'un ni l'autre.**
> `INTENTION_NON_ARMEE` reste câblée tant que les deux moitiés ne sont pas
> écrites. Ce n'est pas un report : c'est la condition d'armement, et elle est
> vérifiable.

### 1 · La FORME — le mécanisme d'`estLigneDeCloture`, repris tel quel

`core/audit/cloture.ts` a déjà résolu ce problème une fois : distinguer une ligne
de socle d'une ligne d'appel **sans ajouter un mot au vocabulaire fermé**. Trois
pièces, reprises sans en inventer une quatrième :

1. un **nom d'outil RÉSERVÉ** — `OUTIL_INTENTION`, aux côtés d'`OUTIL_CLOTURE` ;
2. un **prédicat** qui ne juge que ce nom — `estLigneDIntention`, sur la
   signature de son aîné (`Pick<LigneAudit, "tool">`, pour qu'un témoin fabriqué
   à la main suffise à l'éprouver) ;
3. une **charge versionnée** encodée dans `partialSources`, seule colonne libre
   de `ops_audit` qui ne porte pas d'identifiant pseudonyme.

**Deux lignes, corrélées par le `seq` de l'ouverture.** Trois voies ont été
pesées :

| Voie                                                                                | Verdict                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Muter la ligne d'ouverture**                                                      | impossible, et heureusement : le journal est en ajout seul et scellé (ADR 0002). La mutation casserait l'empreinte de toutes les lignes suivantes.                                                                                                                                    |
| **Laisser la ligne d'APPEL servir de clôture**, corrélée sur `(sessionId, argHash)` | **refusée.** Zéro écriture de plus, et **faux** : deux appels identiques dans la même session portent le même couple, et un rejeu légitime ferait passer une intention **orpheline** pour close. Une corrélation qui se trompe dans le sens rassurant est pire qu'aucune corrélation. |
| **Loger le renvoi dans le `partialSources` de la ligne d'appel**                    | **refusée.** Ce champ porte alors les sources partielles RÉELLES de l'adaptateur (§ 13.2). La clôture de purge ne peut y loger sa charge que parce qu'elle, précisément, n'en a aucune.                                                                                               |

Reste **deux lignes**, corrélées par le `seq` de l'ouverture — le seul
identifiant que le journal produise lui-même et que personne ne choisisse.

Le contenu des colonnes est **dérivé du modèle de la clôture**, et les points
qu'on devinerait mal sont écrits :

- `tool` porte le **nom réservé** ; le vrai nom d'outil voyage dans la charge ;
- `principal` et `sessionId` portent les **vraies** valeurs — c'est toute la
  valeur de la ligne, et les recopier dans la charge en ferait une seconde
  vérité ;
- `externalEffect` vaut **`EFFET_EXTERIEUR_NON_SURVENU` sur les deux lignes** :
  la colonne dit ce que le socle sait de **cette ligne-ci**, et écrire une ligne
  ne fait rien sortir. Le cliquet de la **tentative**, lui, entre dans la charge
  de clôture — c'est la seule pièce du journal qui puisse lever la « conséquence
  acceptée n° 1 » de l'ADR 0017 ;
- `decision` et `outcome` valent `autorisé` / `ok`, comme la clôture : ils
  attestent que **l'écriture** a réussi, et **ils n'ont aucun sens** sur une
  ligne d'intention. C'est un coût de la décision, écrit ci-dessous.

### 2 · Le COMPTEUR — trois champs, et pas un de plus

`RapportVerification` gagne :

```ts
readonly intentionsOuvertes: number;   // ouvertures rencontrées
readonly intentionsCloses: number;     // clôtures dont l'ouverture est dans la tranche
readonly intentionsSansIssue: number;  // ← LE SIGNAL
```

🔴 **Une intention ouverte NE REND PAS le rapport invalide, et c'est le point le
plus facile à rater.** Au moment où l'on vérifie, un appel peut être en vol : son
ouverture est écrite, sa clôture ne l'est pas encore. Faire tomber `valide`
là-dessus rendrait la vérification **rouge par construction sur tout journal
vivant** — et une garde rouge en permanence est une garde qu'on désactive.
`intentionsSansIssue` est donc un **compte** que le § 24 surveille avec un seuil
et une fenêtre, **jamais un verdict**.

⚠️ En revanche, une **clôture qui réfère une ouverture inexistante EST une
anomalie de chaîne** : c'est une ligne forgée, ou une purge qui a emporté
l'ouverture sans ancre. `GENRES_ANOMALIE` gagne **un** genre —
`intention-close-sans-ouverture` — et un seul.

### 3 · Le nom réservé ne peut pas être une SECONDE comparaison écrite à la main

`core/registry/enregistrer.ts` refuse aujourd'hui `OUTIL_CLOTURE` par un `if`
dédié, en **important** la constante — la bonne moitié de la règle. Un second
`if` pour un second nom est exactement le motif qui fabrique le **troisième**
oubli.

```ts
/** Les noms d'outil que le socle se réserve. DÉRIVÉE, et le refus l'itère. */
export const NOMS_RESERVES_AU_SOCLE = [OUTIL_CLOTURE, OUTIL_INTENTION] as const;
```

Le refus itère la liste, et la garde d'admission **annonce combien de noms
réservés elle a confrontés**. Un nom ajouté à la liste sans être confronté fait
tomber le compte ; un compte à zéro se lit.

### 4 · Et le prédicat qui manquait : `estLigneDAppel`

`ops_audit` porte désormais **deux** familles de lignes qui ne sont pas des
appels. Toute métrique du § 24 qui compte des appels doit les exclure **toutes
les deux** — et une métrique qui énumère les familles est une métrique fausse au
troisième nom réservé.

```ts
/** Une ligne d'APPEL : celle qui ne porte aucun nom réservé au socle. DÉRIVÉ. */
export function estLigneDAppel(ligne: Pick<LigneAudit, "tool">): boolean;
```

Dérivé de `NOMS_RESERVES_AU_SOCLE`, jamais de la négation de deux prédicats
écrits l'un à côté de l'autre.

### 5 · Et `avantEffet` entre dans le `try … finally`

Dette ouverte par l'ADR 0021, refermée ici parce qu'elle porte sur ce mécanisme.
`intention.avantEffet` est appelé **hors** du `try` de l'étape 14 : s'il lève,
`cloturerLimites` n'est jamais atteint et la réservation demeure `in_flight`
jusqu'au TTL. C'est fail-closed — rien ne part, aucun rejeu ne double, la ligne
existe — mais un port d'intention défaillant suffit à rendre un outil
indisponible.

La réservation est posée à l'étape 13, **donc avant** : l'appel peut entrer dans
le `try` sans rien déplacer d'autre. ⚠️ Vérifier alors que l'issue reste celle
que l'ADR 0021 dérive — sur ce chemin, l'étape 14 n'a pas rendu et le cliquet
n'est pas levé.

---

## Ce que la décision EXCLUT

- **Ajouter une valeur à `OUTCOMES` ou à `DECISIONS`.** C'est la leçon de
  l'ADR 0017 : le vocabulaire était juste, c'est la dérivation qui mentait. Un
  mot de plus romprait le format pour une distinction que le nom d'outil porte
  déjà — et il faudrait le classer dans toutes les métriques existantes.
- **Une colonne dédiée dans `ops_audit`.** Elle entrerait dans l'empreinte
  chaînée (ADR 0002) et **franchirait la fenêtre** que l'ADR 0017 décrit : le
  coût n'est pas par colonne, il est par franchissement. Trois colonnes sont
  connues comme manquantes ; celle-ci n'en fait pas partie, et `partialSources`
  suffit.
- **Armer `PorteeDIntention` avant que le compteur existe.** C'est la décision
  centrale, et elle se vérifie : la garde du registre des coutures (ADR 0019)
  tient `estLigneDIntention` en `à-coudre`, et rougirait si un appelant
  apparaissait sans que l'entrée change.
- **Corréler par `(sessionId, argHash)`.** Faux dans le sens rassurant. Voir le
  tableau ci-dessus.
- **Faire tomber `valide` sur une intention ouverte.** Rouge par construction,
  donc désactivée.
- **Écrire `externalEffect: true` sur la ligne de clôture d'intention** au
  prétexte que la tentative, elle, a pu sortir. La colonne dit ce que le socle
  sait de la ligne. Confondre les deux ferait de chaque intention un effet
  extérieur, et l'objectif O6 deviendrait illisible dans l'autre sens.
- **Deux `if` dans `enregistrer.ts`.** Voir le point 3.

---

## Ce que le constructeur ④ doit écrire

1. `core/audit/vocabulaire.ts` : `OUTIL_INTENTION` et `NOMS_RESERVES_AU_SOCLE`.
2. `core/audit/intention.ts` : `estLigneDIntention`, `encoderChargeIntention`,
   `decoderChargeIntention` — **sur le modèle exact de `cloture.ts`**, encodage
   versionné, `clé=valeur`, **sans espace** (la garde de contenu du § 31 les
   refuse, et l'intention ne fait pas exception à sa propre règle). Les types
   sont déjà posés dans ce fichier.
3. `core/audit/cloture.ts` : `estLigneDAppel`, dérivé de la liste.
4. `core/audit/verification.ts` : les trois compteurs, le genre d'anomalie, et le
   **plancher-témoin** — un rapport qui annoncerait zéro intention sur un journal
   qui en porte est le vert qu'on cherche à éviter.
5. `core/registry/enregistrer.ts` : le refus itère `NOMS_RESERVES_AU_SOCLE` et
   **annonce le compte confronté**.
6. `core/chaine/orchestrateur.ts` : `avantEffet` entre dans le `try` ; une
   implémentation `INTENTION_JOURNALISEE` de `PorteeDIntention` écrit les deux
   lignes. `INTENTION_NON_ARMEE` **reste** — c'est le défaut tant que Will n'a
   pas tranché le coût.
7. `core/audit/index.ts` ré-exporte le nouveau module.

### Les quatre gardes

| Garde                                                                                                 | Ce qu'elle annonce                                              | Le témoin qui la fait rougir                                                                 |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **G1 — une ouverture sans clôture est COMPTÉE, et n'invalide pas.**                                   | lignes vérifiées · ouvertures · closes · sans issue · `valide`  | Un journal avec une ouverture seule : le compte monte, `valide` reste vrai.                  |
| **G2 — une clôture sans ouverture est une ANOMALIE.**                                                 | anomalies par genre · `seq` fautif                              | Une clôture forgée renvoyant à un `seq` absent.                                              |
| **G3 — le registre refuse TOUS les noms réservés.** Dérivée de la liste, jamais de deux comparaisons. | noms réservés confrontés · outils inspectés · refus émis        | Ajouter un nom à la liste sans l'itérer : le compte confronté ne bouge pas.                  |
| **G4 — une métrique d'appels exclut les DEUX familles.**                                              | lignes lues · lignes d'appel · lignes de socle, **par famille** | Une troisième famille ajoutée : `estLigneDAppel` la couvre sans être retouché — sinon rouge. |

---

## Conséquences acceptées

1. **Deux écritures de journal de plus par appel exécuté.** C'est le coût réel,
   et c'est **précisément l'arbitrage que `INTENTION_NON_ARMEE` laisse à Will**.
   Il ne se prend pas dans un commentaire, et cet ADR ne le prend pas : il rend
   le mécanisme **armable**, pas armé.
2. **`decision` et `outcome` n'ont aucun sens sur une ligne d'intention.** C'est
   le prix de ne pas toucher au vocabulaire fermé. Il est déjà payé par la ligne
   de clôture de purge ; `estLigneDAppel` est ce qui empêche de le payer une
   troisième fois sans le voir.
3. **Le vrai nom d'outil voyage dans la charge.** Un tableau de bord qui
   grouperait par `tool` verrait toutes les intentions sous un seul nom. Écrit
   pour que ce ne soit pas découvert.
4. **`partialSources` porte maintenant deux encodages de socle.** Les décodeurs
   doivent être **exclusifs** — une charge de clôture ne doit jamais se décoder
   comme une charge d'intention. Le préfixe versionné (`cloture=1`,
   `intention=1`) le donne, à condition que chaque décodeur **refuse** ce qu'il
   ne reconnaît pas au lieu de l'ignorer.

---

## Ce qui reste OUVERT

- **L'arbitrage de Will sur le coût.** Deux écritures par appel exécuté, contre
  la capacité de voir qu'un effet est parti sans que le socle sache ce qu'il est
  devenu. Tant qu'il n'est pas rendu, `INTENTION_NON_ARMEE` est câblée et
  `TraceOrchestration.ligneDIntention` rend `null` — **le mécanisme ne ment
  pas**.
- **La rétention des lignes d'intention.** Elles doublent la croissance du
  journal sur les appels exécutés, et le § 31 fixe une purge à douze mois. Leur
  purger un horizon plus court serait raisonnable et n'est **pas** décidé ici :
  ce serait un second régime de rétention dans le même journal, ce qui touche à
  l'ancrage de la purge (§ 31) et mérite son propre ADR.
- **Le seuil et la fenêtre du § 24 sur `intentionsSansIssue`.** Un compte sans
  seuil n'alerte pas. Le tableau de bord n'existe pas ; c'est le lot 5.
