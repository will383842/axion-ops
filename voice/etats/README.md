# `voice/etats` — la machine à états du démon vocal

§ 18 (modèle de menace), § 20 (garde-fous), § 30 (architecture vocale) du cahier
des charges v6, et ADR 0010 (voie B — le démon pilote).

**Logique pure.** Aucun micro, aucun modèle, aucune synthèse, aucun `Date.now()`.
Elle reçoit un état, un geste et un contexte ; elle rend une décision et un
motif. Le démon du lot 8 branche le matériel autour — il ne réécrit pas ces
règles-là.

| Question                                             | Fichier          |
| ---------------------------------------------------- | ---------------- |
| Quels états, quels gestes, et qu'exigent-ils ?       | `vocabulaire.ts` |
| La fenêtre déverrouillée est-elle encore vivante ?   | `fenetre.ts`     |
| Ce geste est-il permis depuis cet état, maintenant ? | `machine.ts`     |

## Les quatre exigences tenues, et où elles vivent

1. **Le verrouillage après inactivité** — `fenetre.ts`. Le temps est un
   paramètre : `instant`, `derniereActivite` et `delaiInactiviteMs` voyagent
   dans `HorlogeVocale`. La bascule est mesurée à la milliseconde, et la garde
   annonce son pas.
2. **Hors fenêtre déverrouillée : aucun desserrage, aucun changement de
   profil** — `machine.ts`, et **deux barrières indépendantes** :
   - la table n'inscrit aucune transition élargissante depuis l'état fermé ;
   - la règle de fenêtre refuse même depuis un état ouvert, dès que le délai est
     écoulé. **C'est cette seconde barrière qui ferme le trou réel** : entre
     l'écoulement du délai et le battement de la minuterie, l'état est encore
     ouvert. Une règle qui lirait l'état seul laisserait passer cet intervalle.
3. **L'interruption** — `parle` × `interrompre` → `interrompu`, admis sans
   facteur et fenêtre morte. Et depuis `en-tour` aussi : sans cette seconde
   ligne, il faudrait attendre que le démon commence à parler pour avoir le
   droit de le couper.
4. **« Stop » aboutit depuis TOUS les états**, y compris `en-tour`, `parle` et
   `verrouillé` (où il est idempotent). Mesuré dans le contexte le plus
   hostile : aucun facteur, fenêtre échue.

## Ce qui est dérivé, et pourquoi

- **Les 45 lignes régulières de la table sont ENGENDRÉES** à partir de
  `ETATS_VOCAUX`. Un huitième état étend automatiquement « stop »,
  « verrouiller », « expirer-inactivité » et « brouillon-seul ». Les 9 lignes du
  tour de parole sont écrites : elles n'ont pas de régularité à dériver.
- **Les deux obligations sont CALCULÉES** à partir de deux champs déclarés par
  chaque geste — sa `nature` et son `effet`. Aucune liste de gestes privilégiés
  n'est écrite à la main, donc aucun seizième geste ne peut naître dans un angle
  mort.
- **`déverrouiller` est exempté de la règle de fenêtre par sa NATURE**
  (`hors-bande`), pas par son nom mis à part. La différence entre une règle et
  une exception : la règle survit à l'ajout d'un geste.
- **Le renouvellement de l'activité dérive de la DESTINATION** de la transition
  (`renouvelleLActivite`). D'où, sans citer un seul nom de geste : un « stop »
  adressé à un démon verrouillé ne tient pas sa fenêtre ouverte, et un geste
  refusé n'en renouvelle jamais aucune.

## Les gardes, et ce qu'elles annoncent

`vitest run voice/etats` — 53 tests, 3 fichiers. Chaque garde annonce son
compte, et chacune est réfutable : `decider()` prend la machine en paramètre,
ce qui permet de lui présenter des machines **mutilées**.

| Garde                                | Compte mesuré                         | Témoin qui la fait rougir                   |
| ------------------------------------ | ------------------------------------- | ------------------------------------------- |
| Couverture (état × geste × contexte) | 105 paires × 8 contextes = 840        | motif de refus recalculé indépendamment     |
| Table bien formée                    | 54 transitions                        | couple en double · destination inconnue     |
| « stop » universel                   | 7 états, contexte hostile             | ligne `en-tour × stop` retirée → 1 refus    |
| Hors fenêtre                         | 14 tentatives, facteur probant fourni | `desserrer` déclaré `réduit` → 6 admissions |
| Obligations dérivées                 | 9 combinaisons (nature × effet)       | table attendue écrite à la main, confrontée |
| Ancrage au § 20 / § 30               | 5 gestes nommés par le CDC            | `stop` déclaré `élargit` → anomalie         |
| Bascule d'inactivité                 | 8 instants injectés, pas de 1 ms      | encadrement `[délai−1, délai]` annoncé      |

## Écarts signalés — à trancher, non comblés ici

1. **Le délai d'inactivité n'est pas arbitré.** Le § 30 pose le verrouillage, il
   ne donne aucune durée, et l'ADR 0010 non plus. La constante s'appelle
   `DELAI_INACTIVITE_NON_ARBITRE_MS` pour que personne ne prenne cinq minutes
   pour une décision de Will. La machine ne la lit jamais : le délai est injecté.
2. **Deux dérivations du même fait cohabitent dans `voice/`.** Ce module et
   `voice/commandes/` — écrit en parallèle — définissent chacun un
   `EffetSurLaSurface` et un catalogue de commandes hors modèle :
   - ici : trois valeurs déclarées (`réduit` · `neutre` · `élargit`) par geste ;
   - là-bas : une propriété **structurelle** calculée sur un axe et un ensemble
     d'arrivée (`peutElargir`), plus fine et plus difficile à fausser.

   Les deux **collisionnent sur le nom du type exporté**, et les cinq commandes
   se nomment différemment de part et d'autre (`annuler`/`annule`,
   `verrouiller`/`verrouille`, `changer-de-profil`/`mode-dev`). Le raccord
   naturel est de faire dériver `exigeSecondFacteur` et
   `exigeFenetreDeverrouillee` de `peutElargir()` au lieu du champ déclaré, et de
   n'avoir qu'un seul catalogue. **Ce raccord n'a pas été fait ici** : les deux
   modules sont écrits en même temps, et choisir l'un des deux vocabulaires sans
   relire l'autre en entier serait combler un trou par une supposition.

3. **`desserrer` est modélisé comme une commande hors modèle**, alors que le
   § 20 le fait passer par une route dédiée du socle, pas par le micro. Cela ne
   change rien à la décision — il exige le facteur ET la fenêtre dans les deux
   lectures — mais le nom de sa `nature` décrit son régime, pas son canal.
