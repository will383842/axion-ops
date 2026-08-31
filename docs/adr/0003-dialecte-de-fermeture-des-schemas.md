# ADR 0003 — Le registre exige un schéma d'entrée FERMÉ, dans deux dialectes

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1b)
- **Portée** : `core/adapter-kit/fermeture.ts`, `core/adapter-kit/manifest.ts`,
  `core/registry/enregistrer.ts`, `core/registry/types.ts`, table `ops_tool`
- **Sources** : cahier des charges v6, § 09 (contrat d'adaptateur, contrôle 7),
  § 19 bis (pont d'identité), § 29 (CRM Pro) ; `docs/ETAT.md` § 4.2

---

## Le défaut, tel qu'il a été mesuré

Le § 09 pose deux règles sur le schéma d'entrée d'un outil :

> Le schéma d'entrée est `.strict()`, pour qu'un champ d'autorisation glissé
> dans la charge utile soit un **refus visible** et non un silence.

> **Contrôle 7** — aucun champ d'autorisation ne provient du schéma d'entrée.

À la fin du lot 1, **les deux n'étaient tenues que du côté build**. Le harnais
de conformité tourne dans la CI de l'**adaptateur**, et `analyserDefinition()`
ne voit que les adaptateurs écrits en TypeScript avec le kit. Le registre — la
**seule barrière statique** pour un manifeste produit ailleurs — n'en vérifiait
aucune.

Témoin exécuté par la Recette :

```json
{ "type": "object", "properties": { "peutVoirAppels": { "type": "boolean" } } }
```

Un manifeste fédéré portant ce `inputSchema` — sans `additionalProperties` —
était **admis sans un mot**. `peutVoirAppels` est nommément une propriété de
`Habilitations` (§ 19 bis).

Et le § 29 nomme précisément le cas que cela vise : **le CRM en PHP, dépôt
public à jamais**, qui ne passe par aucun compilateur du socle.

---

## La question qui a bloqué le lot 1

Le lot 1 a refusé de trancher seul, et il avait raison de le refuser : refuser
tout `inputSchema` dont `additionalProperties !== false` **rejetterait un
manifeste PHP parfaitement correct** qui exprimerait la fermeture autrement.
C'est un **contrat inter-langages**, pas un détail d'implémentation.

---

## Décision

**Le registre REFUSE tout `inputSchema` qui n'exprime pas sa fermeture — en
acceptant les DEUX dialectes.**

| Dialecte                       | Qui le produit                                     |
| ------------------------------ | -------------------------------------------------- |
| `additionalProperties: false`  | Zod (`.strict()` via `z.toJSONSchema()`)           |
| `unevaluatedProperties: false` | un générateur qui **compose** ses schémas (PHP, …) |

`unevaluatedProperties` n'est pas une variante de style : c'est le mot-clé que
JSON Schema 2020-12 a introduit pour fermer un schéma **après** composition
(`allOf`, `$ref`), là où `additionalProperties` ne voit pas les propriétés
apportées par les sous-schémas. Un générateur qui compose n'a pas d'autre moyen
de se fermer.

**Le dialecte qui a servi est RENDU** (`VerdictFermeture.dialecteRacine`) : la
console peut dire lequel, et une bascule silencieuse de l'un à l'autre se voit.

Et **le contrôle 7 est appliqué au registre**, sur la liste de noms **dérivée**
de `ToolContext` et `Habilitations` par `clesDAutorisationDepuisSource()` — le
code existait déjà dans `core/adapter-kit/autorisation.ts` et n'était appelé
que par le harnais.

### Une seule définition de « fermé », deux appelants

`core/adapter-kit/fermeture.ts` porte l'analyse. `manifest.ts` (build) et
`core/registry/enregistrer.ts` (admission) l'appellent tous les deux. Deux
implémentations feraient deux définitions, et **le build accepterait ce que
l'admission refuse — ou l'inverse, ce qui est pire.**

---

## Ce que la décision EXCLUT

- **N'accepter que le dialecte de Zod.** Cela reviendrait, en pratique, à
  accorder une exception écrite à la main au premier adaptateur non-TypeScript —
  c'est-à-dire un trou, avec un nom d'adaptateur dedans.
- **Accepter un schéma dont seule la RACINE est fermée.** La garde exige la
  fermeture de **chaque** schéma d'objet, à la racine et en profondeur. Une
  racine fermée dont un champ `options` serait un objet ouvert laisserait
  passer `{ options: { peutVoirAppels: true } }`.
- **Résoudre les `$ref` externes.** Le socle ne va pas chercher un document
  ailleurs pour décider d'une admission. Un schéma dont la fermeture en
  dépendrait est refusé **pour ce qu'il est** : un schéma que le socle ne peut
  pas vérifier. Le compte des renvois non résolus figure dans le message.
- **Un contrôle 7 alimenté par une liste écrite à la main.** Elle se périmerait
  au premier drapeau ajouté à `Habilitations`, en silence.
- **Un appelant qui priverait le contrôle 7 de sa matière.** Une liste vide ou
  trop courte fait **lever** (`ErreurGardeAveugle`) : ce n'est pas un refus de
  manifeste — le manifeste n'y est pour rien — c'est un défaut de l'appelant, et
  le laisser passer rendrait le contrôle vert sur n'importe quel schéma.

---

## Conséquences acceptées

### 1 · Un schéma sans aucun objet à fermer n'est pas « fermé »

`analyserFermeture` exige `objetsAFermer > 0`. Un `{ "type": "string" }` n'a
aucune propriété, donc aucune porte — le déclarer « fermé » serait vrai et
trompeur : la garde ne l'a pas éprouvé, elle n'a rien eu à éprouver. Le registre
rend ce cas **visible** plutôt que vert.

### 2 · Le parcours est borné en profondeur, et il le dit

Un schéma reçu d'un dépôt tiers **peut** être hostile. Sans borne, un parcours
naïf figerait le socle sur un document : un déni de service déclenchable par
n'importe quel adaptateur. `PROFONDEUR_MAXIMALE = 32`, et un dépassement rend le
verdict **négatif** — ne pas pouvoir conclure n'est pas conclure que c'est
fermé.

### 3 · La garde compare des NOMS, et rien d'autre

Un champ nommé `peutTout` ou `bypass` ne ressemble à aucune propriété de
`ToolContext` et passe. C'était déjà écrit dans `autorisation.ts` ; ce lot ne
fait pas mieux. **Un `grep` ne prouve que l'absence de la forme écrite.**

### 4 · La garde du build est désormais la même, donc plus stricte qu'avant

`analyserDefinition()` refusait auparavant un schéma dont la racine n'était pas
`additionalProperties: false`. Elle applique désormais la même analyse
descendante que le registre : un adaptateur TypeScript dont un sous-objet serait
ouvert ne construit plus son manifeste. C'est un durcissement, et il est voulu —
la barrière du build et celle de l'admission doivent dire la même chose.

---

## Ce qui reste OUVERT

- **Un manifeste composé dont chaque morceau n'est pas fermé** est refusé, même
  si sa racine porte `unevaluatedProperties: false` — ce qui, au sens strict de
  JSON Schema, suffirait. C'est une garde **plus stricte que la spécification**,
  mesurée par le test « reconnaît `unevaluatedProperties: false` ». Si un
  adaptateur réel bute dessus, l'assouplissement demandera de savoir résoudre
  `allOf`, donc d'implémenter une partie du moteur de schémas : c'est un lot, pas
  un réglage. À rouvrir avec un cas réel, jamais par anticipation.
