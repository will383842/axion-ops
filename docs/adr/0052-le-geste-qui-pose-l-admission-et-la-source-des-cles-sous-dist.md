# ADR 0052 — Le geste qui pose l'admission, et la source des clés sous `dist/`

- **Statut** : acceptée
- **Date** : 2026-09-02
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 5)
- **Portée** : `ops/admettre.ts`, `ops/adaptateurs-epingles.ts`,
  `ops/admettre.spec.ts`, `core/adapter-kit/autorisation.ts`,
  `core/registry/depot.ts`, `package.json`
- **Sources** : cahier des charges v6, § 09 (contrôle 7), § 12, § 13.4, § 14
  correction 3, § 20 ; ADR 0046 (un geste nommé doit être exécutable) ; ADR 0050
  (la persistance de l'admission) ; ADR 0051 (le catalogue en deux documents)

---

## Décision 1 · `pnpm ops:admettre` — le chemin par lequel une admission atteint Postgres

Le socle admet déjà ses adaptateurs à chaque démarrage (étage 5), **en mémoire**,
dans un processus qui peut n'avoir aucune base. Ce geste est séparé, et pour
trois raisons qui sont des propriétés, pas des goûts :

- il **exige `DATABASE_URL` et refuse en la nommant**, au lieu de démarrer à
  moitié ;
- il rend un compte rendu qu'un exploitant lit **avant** de servir quoi que ce
  soit — outils insérés, mis à jour, orphelins, et lesquels ;
- il porte `--activer`, **le geste de la console** tant que la console n'existe
  pas.

Il **ne refait aucun contrôle** : `lireVerrou()` valide le verrou,
`enregistrerAdaptateur()` valide le manifeste. Les refaire ici en ferait une
seconde version, et c'est la seconde qui ne suit jamais.

### L'admission est TOUT OU RIEN

Si un seul adaptateur est refusé, **rien n'est écrit** — pas même les autres. Un
registre à moitié posé servirait un catalogue que personne n'a relu, et le § 20
en fait le cas à ne jamais laisser passer.

### Le refus d'écriture ne se confond pas avec le refus d'admission

Quand `DATABASE_URL` manque, le message dit que les adaptateurs sont **pourtant
admis** : le refus porte sur l'écriture. Les confondre ferait chercher un défaut
de manifeste là où il manque une variable — c'est la deuxième règle du § 15, un
refus doit dire quoi corriger.

### Aucune variante `:dist`, et c'est motivé

`tsconfig.build.json` n'émet que du `.js` et du `.d.ts`. Sous `dist/ops/`, ni
`../core/registry/adapters.lock.json` ni `../adapters/<id>/manifeste.json`
n'existent. **Déclarer un script incapable de trouver ses documents serait
exactement le défaut de l'ADR 0046** — un geste nommé et infaisable. Le geste
tourne donc sous `tsx`, depuis les sources.

## Décision 2 · `basculerActivation` — deux méthodes, deux intentions

L'ADR 0050 dit que l'admission ne réécrit pas les cinq colonnes de console. Elle
ne dit pas que personne ne les écrit.

Le port porte donc **deux méthodes** : `ecrireAdmission` pose ce qu'un manifeste
déclare, `basculerActivation` pose ce qu'un humain décide. Un seul `ecrire()`
générique aurait laissé la distinction dans la tête de l'appelant, c'est-à-dire
nulle part.

Elle **rend un compte, pas un booléen** : `0` veut dire « aucune ligne de ce nom
et de cette version ». Une bascule posée sur rien se lirait comme une bascule
appliquée, et c'est la panne qu'on découvre en incident.

Elle n'écrit que `enabled` — une bascule qui en profiterait pour réécrire autre
chose serait l'ADR 0050 défaite par la porte d'à côté.

## Décision 3 · Le contrôle 7 se dérive aussi du `.d.ts`

`lireClesDAutorisation()` lisait `../types.ts` et **rien d'autre**. Or
`tsconfig.build.json` ne copie aucun `.ts` : sous `node dist/ops/…`, la fonction
levait `ENOENT`.

**Le contrôle 7 du § 09 était donc impossible à armer dans le seul environnement
qui sert des appels.** Le défaut n'avait jamais paru parce qu'aucun appelant de
production ne l'invoquait encore — c'est ce lot-ci qui lui donne son premier.

`SOURCES_DES_CLES_DAUTORISATION` nomme les deux fichiers, dans l'ordre. Le second
n'est **pas une seconde source de vérité** : c'est la même, projetée par le
compilateur. Et la garde ne l'affirme pas — elle **fait émettre les déclarations
par le vrai émetteur de TypeScript, depuis le vrai `core/types.ts`**, et
confronte les deux dérivations :

```
[contrôle 7 · projection] 37616 caractère(s) de déclarations émis · 12 clé(s)
depuis le .ts · 12 depuis le .d.ts · écart : [aucun]
```

Les planchers (`PLANCHER_TOOL_CONTEXT`, `PLANCHER_HABILITATIONS`,
`PLANCHER_RESERVES_HORS_CONTEXTE`) mordent identiquement sur les deux : une
projection qui perdrait des noms **fait lever**, elle ne rétrécit pas la garde en
silence.

## Ce que cette décision ne fait pas

- Elle **ne branche pas la racine** : `ops/index.ts` sert toujours
  `outilsEpingles = []`. C'est le lot suivant.
- Elle **ne réécrit pas la couverture « dossier ↔ verrou »** :
  `ops/conformite-ci.ts` la tient déjà, et il ÉCHOUE quand les deux ensembles
  divergent. `ops/adaptateurs-epingles.ts` signale seulement ce que l'admission
  ne peut pas faire — une entrée de verrou dont l'instantané manque.
- Elle **n'applique aucune migration**. `pnpm db:deploy` n'a toujours aucune
  cible ; ce geste refuse proprement tant qu'il n'y en a pas.

## Observation portée au rapport, sans décision

L'admission du manifeste réel d'Axion-IA rend une garde **annoncée** (ADR 0015,
G2) : les sept outils déclarent des `idFields` (`id`, `commit`,
`commitEnService`) qui ne nomment **aucune propriété de leur schéma d'entrée**.
C'est sans effet — l'ADR 0015 a retiré à `idFields` tout pouvoir à l'entrée, et
ces noms désignent des identifiants de **sortie**. La garde annonce, elle ne
refuse pas, et c'est le comportement voulu. Le fait est consigné ici pour qu'il
soit **arbitré à la prochaine ré-épingle** plutôt que redécouvert.
