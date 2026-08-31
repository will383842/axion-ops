# ADR 0023 — La racine de composition, et l'ordre des sept étages du démarrage

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `ops/main.ts` (à écrire), `ops/demarrage/etages.ts`,
  `core/instance/demarrage.ts`, `core/vault/demarrage.ts`,
  `core/policy/demarrage.ts`, `core/registry/`, `core/transport/`
- **Sources** : cahier des charges v6, § 19 (règle absolue), § 20 (protection 4,
  fail-closed), § 21 (la console survit à la panne), § 23 (trois états de
  coffre), § 25 (le message nomme la commande)

---

## Le manque

**Rien n'appelait le socle.** À la fin du lot 1d, le dépôt portait un cœur écrit
et prouvé — coffre à trois états, journal chaîné et scellé, politique avec TOTP,
limites, profils fermés, registre, contrat d'adaptateur, les quatorze étapes du
§ 11 et leur orchestrateur — et **aucun point d'entrée de conteneur**.

Ce n'est pas une gêne d'ergonomie. Deux gardes du dépôt le comptaient déjà :

- `verifierLeCablageDuDemarrage` (`core/policy/demarrage.ts`) rend les fichiers
  de production qui appellent `demarrerPolitique` — **zéro** ;
- le registre des coutures porte `relireLaSanteMonoInstance` en `à-coudre` avec
  « 0 appelant » et un `it.todo` apparié.

Conséquence directe, et elle est nommée par le § 20 : un socle qui redémarre
pendant un desserrage **reprend au dernier niveau connu**, parce que personne
n'écrit la ligne `setBy: "boot"`. La quatrième protection du § 20 —
« panne, corruption, redémarrage → niveau le plus strict » — était une phrase
sans mécanisme.

---

## Décision

**`ops/main.ts` parcourt une échelle de sept étages déclarée comme une donnée
dans `ops/demarrage/etages.ts`. Elle ne redécide rien : chaque étage NOMME le
symbole qui décide, et la racine se contente de l'appeler dans l'ordre.**

| #   | Étage              | Ce qu'il établit                                     | Refus                          |
| --- | ------------------ | ---------------------------------------------------- | ------------------------------ |
| 1   | `verrou`           | ce processus est le seul socle en vie                | le processus **sort**          |
| 2   | `coffre`           | lequel des trois états du § 23 est le nôtre          | démarrage **amputé**           |
| 3   | `authentification` | l'émetteur est configuré, l'audience a une forme     | le processus **sort**          |
| 4   | `politique`        | le niveau le plus strict, et une ligne qui le dit    | le processus **sort**          |
| 5   | `registre`         | le catalogue servi est celui que le lock épingle     | le processus **sort**          |
| 6   | `transports`       | chaque transport couvre les étapes qui lui incombent | le processus **sort**          |
| 7   | `veille`           | la veille **bat**, et son battement se lit           | aucun — mais jamais en silence |

### L'ordre est la décision

Deux inversions plausibles sont écartées nommément.

**Le verrou avant tout.** L'ADR 0018 écrit « un verrou exclusif est pris AVANT
de servir quoi que ce soit ». Un second socle qui prendrait le verrou après
avoir monté ses transports aurait déjà servi des appels — et l'index de
provenance du § 20 étant local au processus, il les aurait servis avec une garde
d'exfiltration qui ne voit que la moitié des sessions.

**Le coffre avant l'authentification.** C'est le rang qui surprend, et il tient à
une phrase du § 21 : « le matériel d'authentification de la console **n'entre
jamais** dans le coffre ». L'étage 3 est donc vérifiable sous coffre verrouillé,
et il **doit** l'être : le § 23 exige qu'un coffre verrouillé serve la console et
la route de déverrouillage. Placer l'authentification avant le coffre laisserait
croire l'inverse — qu'un coffre verrouillé peut empêcher de se connecter pour le
déverrouiller, c'est-à-dire exactement le socle mort que la v5 imposait de
rouvrir depuis un terminal.

### Ce qu'un coffre verrouillé retire, et ce qu'il ne retire pas

**Les sept étages s'exécutent tous sous coffre verrouillé.** C'est une
conséquence qu'il faut écrire, parce qu'on la suppose fausse :

- la ligne `setBy: "boot"` de l'étage 4 va dans `ops_policy`, pas dans
  `ops_audit`. Le § 20 parle d'une « ligne d'historique », et le § 12 range
  `setBy` parmi les colonnes d'`ops_policy`. Elle ne demande donc **aucune clé de
  scellement**, donc aucun coffre ouvert ;
- l'étage 5 lit `adapters.lock.json` et le catalogue. Les secrets d'adaptateur
  (`secretRef`) ne sont résolus **qu'à l'appel**, pas au démarrage.

Ce qu'un coffre verrouillé retire est donc exactement ce que le § 23 dit qu'il
retire : la famille de routes `outils`, et tout appel d'outil (étape 0,
`vault_locked`, ADR 0005). Rien de plus. Élargir cette amputation « par
prudence » ferait rougir chaque déploiement, ce que le § 23 nomme comme le
défaut à ne pas commettre.

### Trois issues de refus, pas deux

`ISSUES_DE_REFUS` en compte trois : `processus-sort`, `demarrage-ampute`,
`objet-desactive`. Réduire à « démarre / ne démarre pas » écraserait le deuxième
état du coffre — et l'épinglage du § 20, qui **désactive un outil et alerte** au
lieu de mettre à jour en silence, n'aurait pas non plus d'endroit où se ranger.

### Où s'écrivent les refus des premiers étages

**Sur la sortie d'erreur, et nulle part ailleurs.** Un refus aux étages 1 à 3 ne
peut pas s'écrire dans `ops_audit` : la chaîne y est scellée par une clé du
coffre, et l'étage 2 n'est pas encore franchi. Écrire une ligne non scellée
serait fabriquer un trou dans la chaîne — précisément ce que l'ADR 0002 rend
détectable, et qu'on rendrait alors normal.

Le message nomme le geste (§ 25). `COMMANDE_DE_PROVISION` existe déjà pour le
coffre ; les autres étages doivent lui ressembler.

---

## Ce que la garde doit tenir

`ops/main.ts` est **confronté** à `ETAGES_DU_DEMARRAGE`, jamais l'inverse. C'est
le motif d'`EXECUTANTS_ETAPES` / `verifierCouvertureDesEtapes`
(`core/chaine/orchestrateur.ts`), appliqué au démarrage :

1. **chaque étage a un exécutant** — pour chaque symbole de `decideurs`, la
   racine doit contenir un appel. Un étage sans exécutant fait **lever au
   démarrage**, pas passer ;
2. **l'ordre est respecté** — la position de chaque appel dans la racine suit
   `CLES_DES_ETAGES`. Un étage déplacé est une anomalie, même si tous sont
   présents : c'est l'ordre qui porte la sûreté ;
3. **elle annonce ses comptes** — étages confrontés, symboles cherchés, appels
   trouvés. Une garde qui lirait une racine vide serait verte sans un mot ;
4. **elle a un témoin fabriqué** — une racine à laquelle on retire un appel doit
   produire exactement une anomalie, nommant l'étage.

⚠️ **La borne, écrite avec la mesure.** C'est une lecture de TEXTE, pas d'AST —
même borne que `verifierLeCablageDuDemarrage`, qui l'écrit déjà : elle répond à
« quel fichier écrit ce nom », pas à « quel chemin d'exécution l'atteint ». Un
appel derrière un drapeau jamais vrai lui échapperait.

---

## Conséquences acceptées

- `ops/` cesse d'être un dossier d'outillage de chaîne d'intégration : il porte
  désormais le point d'entrée du conteneur. La séparation reste nette —
  `core/` décide, `ops/` séquence.
- Le compte de modules de production augmente, donc le dénominateur annoncé par
  la garde des coutures aussi. C'est attendu : il est **annoncé**, jamais écrit
  dans une prose qui vieillirait.
- Trois entrées du registre des coutures deviendront `cousue` quand la racine
  atterrira — `demarrerPolitique`, `demarrerLeSocleMonoInstance`,
  `relireLaSanteMonoInstance`. Aucune ne doit être basculée avant que l'appel
  existe : c'est le geste exact que l'état `à-coudre` existe pour rendre visible.
