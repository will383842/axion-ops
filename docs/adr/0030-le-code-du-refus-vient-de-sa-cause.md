# ADR 0030 — Le code d'un refus vient de sa cause ; l'ancrage d'étape n'en est que le défaut

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/chaine/orchestrateur.ts` (`refuser`, `case 13:`),
  `core/limits/idempotency.ts`, `core/types.ts` (`APPEL_STEPS`)
- **Sources** : cahier des charges v6, § 11 (tableau des quatorze étapes et leurs
  refus), § 15 (codes d'erreur) ; ADR 0020, ADR 0021

---

## Le défaut, tel que le lot 1d l'a mesuré

`core/limits/idempotency.ts` rend `invalid_input` sur une clé mal formée, et
l'ADR 0020 le nomme en toutes lettres. L'orchestrateur prononce pourtant le refus
par `refuser(ETAPE_IDEMPOTENCE_CHAINE, …)`, et `refuser()` **lit le code dans
l'ancrage** : `APPEL_STEPS[13].refus === "conflict"`.

Quatre causes de natures opposées sortent donc sous un code unique. Mesuré :

> `[R5 · code du refus] 4 cause(s) soumise(s) · 3 refusée(s) · 2 message(s)
DISTINCT(s) · 1 code(s) DISTINCT(s) : conflict`

Le socle **sait** distinguer les causes — deux messages —, il ne le **dit** pas
dans le code.

**Les deux codes prescrivent des gestes opposés.** `conflict` veut dire « relire
puis rejouer » : un client qui l'obéit rejouera la même clé mal formée, **en
boucle**. `invalid_input` veut dire « corriger l'argument ».

Et le socle sait déjà faire autrement à trois lignes de là : les étapes 9, 10 et
11 rendent `code: limites.code`.

---

## Décision

**L'ancrage d'étape porte le code par DÉFAUT. Une étape qui connaît la cause rend
le code de la cause.**

`refuser(etape, …)` accepte un code facultatif ; absent, il retombe sur
`APPEL_STEPS[n].refus`. L'étape 13 rend `limites.code`, comme les étapes 9, 10
et 11.

### Pourquoi cette question est rouverte, alors qu'elle avait été tranchée

Elle l'avait été dans l'autre sens, et le lot 1d le signale : « `ETAPE_IDEMPOTENCE_CHAINE`
est un ancrage partagé, et _une étape peut-elle rendre un code autre que celui de
son ancrage_ a déjà été tranché une fois dans l'autre sens ».

La rouvrir demande de dire ce qui a changé. Ce qui a changé est qu'on distingue
désormais **deux questions que l'ancrage confondait** :

- **où le refus a eu lieu** — c'est `stepDenied`, et il vient de l'ancrage,
  toujours, sans exception. C'est la colonne du § 12 et l'invariant du § 11 ;
- **ce que le client doit faire** — c'est le code, et il vient de la cause.

Confondre les deux fait dire au client « rejoue » quand il faut « corrige ». Le
tableau du § 11 donne une colonne « Refus » par étape parce que **la plupart** des
étapes n'ont qu'une cause ; l'étape 13 en a quatre, et c'est elle qui rend la
distinction nécessaire.

### La garde doit refuser le faux correctif

Il y a une manière de « corriger » ce défaut qui ne corrige rien : remplacer un
code unique par un autre code unique. La garde doit donc tenir **les deux
moitiés** :

1. **soumettre les quatre causes de l'étape 13** et exiger **au moins deux codes
   distincts** — c'est la moitié qui manque aujourd'hui ;
2. **exiger que `conflict` reste le code des trois causes qui le méritent** —
   clé en vol, outil non rejouable, reprise concurrente. Sans elle, faire rendre
   `invalid_input` partout passerait la première moitié.

Elle **annonce** : causes soumises, refusées, codes distincts, et la liste des
codes. Un compte de codes distincts est ce que les tests lisent, jamais la
couleur.

⚠️ **Et un témoin fabriqué**, qui rougit dans les deux sens : un orchestrateur
qui réécraserait le code, et un qui rendrait `invalid_input` aux quatre causes.

---

## Portée : cette règle est **générale**, et c'est pour cela qu'elle est une ADR

Elle ne concerne pas seulement l'étape 13. Toute étape dont le module
propriétaire rend un code motivé le fait remonter. La formulation générale évite
le mode de défaillance des correctifs ponctuels : la même confusion se
reproduirait à la prochaine étape multi-causes, et personne ne la reconnaîtrait.

⚠️ **Borne écrite avec la décision.** Cette règle n'autorise pas une étape à
rendre un code **hors** de `ERROR_CODES` : l'union reste fermée (§ 15), et
`ops/codes-hors-tableau.spec.ts` continue de compter les écarts assumés. Elle
autorise une étape à rendre un autre code **de l'union**, pas à en inventer un.

---

## Conséquences acceptées

- Un client qui traitait tous les refus de l'étape 13 comme des `conflict` verra
  apparaître `invalid_input`. Il n'en existe aucun — le socle n'a jamais servi
  d'appel. Le dire évite d'inventer une compatibilité qui n'a pas d'objet.
- `APPEL_STEPS[n].refus` cesse d'être « le code de l'étape » pour devenir « le
  code par défaut de l'étape ». Le champ n'est pas renommé : le renommer
  toucherait la source d'`ETAPES_ADMISES`, de `colonneDuTransport` et de la garde
  du § 31, pour un gain de prose. Le sens est écrit ici et dans l'en-tête de
  `refuser`.
