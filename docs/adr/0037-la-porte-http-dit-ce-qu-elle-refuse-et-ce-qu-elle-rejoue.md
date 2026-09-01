# ADR 0037 — La porte HTTP dit ce qu'elle refuse, et ce qu'elle rejoue

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `core/transport/http/amont.ts`, `core/transport/http/transport.ts`,
  `core/transport/http/serveur.ts`, `core/transport/http/reponse.ts`,
  `core/transport/contrat.ts`, `core/transport/stdio/serveur.ts`,
  `core/chaine/orchestrateur.ts` (`RefusDetaille`), `ops/service.ts`
- **Sources** : cahier des charges v6, § 11 (les quatorze étapes, les quatre
  « HTTP seul », l'invariant de sortie), § 12 (les débits), § 13 (le `resultRef`
  de l'étape 13), § 15 (`Retry-After`, un refus dit quoi faire ensuite), § 24
  (ce qu'on doit pouvoir mesurer) ; ADR 0002, ADR 0025, ADR 0030, ADR 0032,
  ADR 0033, ADR 0034

---

## Les trois faits qui rendent cette décision nécessaire

**① Le compteur censé dire l'absence affirme le contraire.**
`JOURNAL_AMONT_NON_ARME` est livré comme un port qui ne fait rien, et la prose du
fichier justifie exactement cela :

> « ELLE N'EST PAS UN DÉFAUT SILENCIEUX : `TraceAmont.refusConsignes` compte les
> appels, si bien qu'un socle non armé annonce “1 refus prononcé · 0 consigné”. »

Le code fait l'inverse. `refusConsignes += 1` s'exécute **inconditionnellement**
après l'`await`, et le port non armé résout. Un socle non armé annonce donc
« 1 prononcé · **1 CONSIGNÉ** ». Le commentaire de la ligne elle-même — « le port
livré ne fait rien ; le compte dit qu'il n'a rien fait » — est faux **à l'endroit
où il est écrit**. Mesuré sur les cinq refus d'amont : tous annoncent
`refusPrononces = 1 · refusConsignes = 1` alors qu'aucune ligne n'est écrite.
`grep -rn "refusConsignes"` rend **9 occurrences et AUCUNE assertion** sur le
champ ; la garde d'amont compte les lignes d'un journal de TEST **armé**, jamais
le chemin non armé.

**② La seule composition de production ne peut pas armer ce port.**
`grep -rn "journalDesRefus" ops` → **0**. `grep -rn "delaiDeReprise" ops` → **0**.
Ce n'est pas un oubli de câblage : **`PortsDuService` n'offre aucune fente pour
les poser.** Conséquences en service : les quatre refus « HTTP seul » n'écrivent
aucune ligne — une campagne de jetons contre la porte est invisible —, et tout
429 sort sans `Retry-After`, contre le § 11 et le § 15. Et même armé, personne ne
lirait le compte : `serveur.ts` consomme `traitement.reponse` et **jette**
`traitement.trace`.

**③ Le rejeu de l'étape 13 est effacé par HTTP.** `corpsDeSucces` ne connaît
qu'un genre de terminaison servie :

```ts
charge.genre === "succès" && charge.valeur.genre === "exécuté" ? … : null
```

Un **rejeu** tombe dans la branche `null` : `structuredContent: null`,
`isError: false`, ni genre ni `resultRef`. Le `_meta` ne rattrape rien —
`"ops/outcome"` vaut `"ok"` pour le rejeu comme pour l'exécution. Mesuré, même
noyau double présenté aux deux transports :

| transport | ce qui sort                                                          |
| --------- | -------------------------------------------------------------------- |
| HTTP      | `genre=undefined` · `resultRef=undefined` · `structuredContent=null` |
| stdio     | `genre="rejeu"` · `resultRef="ref-du-rejeu-0001"` · `content=[]`     |

Un client HTTP ne peut donc pas distinguer « ton appel a été REJOUÉ, voici la
référence du résultat d'origine » de « ton appel a été exécuté et n'a rien
rendu ». Le § 13 fait du `resultRef` le seul pointeur vers le résultat
d'origine : sur la porte HTTP, il n'existe pas. Et stdio écrit lui-même pourquoi
c'est grave : « loger un rejeu comme une exécution ferait croire à un appel
servi ».

---

## Décision

### 1 · Le port RÉPOND, et le compteur lit sa réponse

`JournalDesRefusEnAmont.consigner` rend **le nombre de lignes écrites** :

```ts
consigner(refus: RefusEnAmont): Promise<number>;
```

`JOURNAL_AMONT_NON_ARME` rend **`0`**, et `refusConsignes` **additionne la valeur
rendue** au lieu d'incrémenter. Un socle non armé annonce alors « 1 prononcé ·
0 consigné », ce que sa prose promettait depuis le début.

**Pourquoi un nombre et non un booléen.** Un port réel peut écrire une ligne, ou
zéro (écriture refusée, journal indisponible). Un booléen dirait « ça s'est bien
passé » ; un nombre dit **combien**, et c'est un compte qu'on peut confronter à
`refusPrononces`. Ce dépôt n'accepte pas les couleurs à la place des nombres.

### 2 · `PortsDuService` porte les deux ports absents

`journalDesRefus` et `delaiDeReprise` entrent dans `PortsDuService` et sont
passés à `creerTransportHttp`. Ils restent **facultatifs au type du transport**
— le transport doit pouvoir être monté nu dans une garde — mais **le montage de
production les fournit**, et la garde de composition l'exige.

⚠️ **OÙ S'ÉCRIVENT CES QUATRE REFUS, ET POURQUOI PAS DANS `ops_audit`.** Les
étapes 1 à 4 précèdent le noyau par construction ; le journal du § 11 est scellé
par une clé du coffre (ADR 0002) et s'écrit dans l'orchestrateur. Écrire une
ligne non scellée fabriquerait un trou dans la chaîne — précisément ce que
l'ADR 0002 rend détectable, et qu'on rendrait alors normal. **Ces refus vont
donc dans un canal DISTINCT, et le canal est NOMMÉ** : le journal d'amont n'est
pas `ops_audit`, il ne prétend pas l'être, et le healthcheck publie son compte.
Une campagne de jetons doit laisser une trace ; elle n'a pas à corrompre la
chaîne pour cela.

### 3 · Le `Retry-After` vient d'un CHAMP, jamais d'une prose française relue

`RefusDetaille` gagne `retryAfterSecondes: number | null`. L'orchestrateur a la
valeur sous la main au moment où il refuse à l'étape 12 ; `reponse.ts` pose
l'en-tête **depuis ce champ**.

L'écart est déjà écrit dans le dépôt (`reponse.ts`) : aujourd'hui la seule voie
serait de **relire le message français** du refus pour y retrouver un nombre de
secondes. Un en-tête de protocole dérivé d'une phrase en français est une
dérivation qui casse à la première reformulation, et elle casserait en silence.

⚠️ **`null` NE POSE AUCUN EN-TÊTE.** Un `Retry-After: 0` inviterait à réessayer
immédiatement le refus qu'on vient de prononcer.

### 4 · Les valeurs servies au client sont dérivées UNE FOIS, pour les deux transports

`ValeursServiesAuClient` (`core/transport/contrat.ts`) nomme ce qu'une
terminaison servie remet au client, quel que soit le fil : le **genre**, le
**`resultRef`**, et la **charge** quand il y en a une. Une seule dérivation la
produit, et chaque transport ne fait plus que **l'emballer dans son enveloppe**.

- **HTTP** porte le genre et le `resultRef` dans `_meta`, sous le préfixe `ops/`
  déjà en service : `"ops/genre"`, `"ops/resultRef"`. La forme du `result` MCP
  reste l'écart signalé en tête de `corpsDeSucces` — la révision courante de la
  spécification n'a pas été relue, et **servir une forme sans l'avoir lue serait
  la recopier**. Ce qui ne peut pas attendre est que les deux valeurs cessent de
  disparaître.
- **stdio** garde les champs qu'il publie déjà, mais **les tire de la même
  dérivation**. Deux écritures de « qu'est-ce qu'un rejeu rend au client »
  finiraient par se contredire, et la contradiction serait exactement celle qu'on
  vient de mesurer, dans l'autre sens.

**Le test d'égalité devient un `switch` EXHAUSTIF sur `ChargeServie`.** Une
troisième branche ajoutée un jour à l'union ne pourra plus tomber en silence dans
`null` : le compilateur le dira. C'est la seule partie de cette décision qui se
tient toute seule après notre départ.

### 5 · `TraceAmont` remonte jusqu'à un LECTEUR

`serveur.ts` cesse de jeter `traitement.trace`. Elle est remise à un port
d'observation — compté, annoncé au healthcheck — et **c'est cela qui donne un
sens au § 4** : tant que la trace est jetée, aucun compte d'amont n'existe en
service, corrigé ou non. Un compteur juste que personne ne lit vaut le compteur
faux qu'il remplace.

---

## Ce que cette décision NE COUVRE PAS

- **Le 429 n'est pas faux aujourd'hui** : statut, code `rate_limited` et message
  portant le nombre de secondes sont corrects. Ce qui manque est l'en-tête.
- **La divergence d'ENVELOPPE entre les deux transports reste ouverte.** HTTP
  rend un `error` JSON-RPC là où stdio rend un `result` avec `isError: true` ;
  c'est un écart DISTINCT, déjà signalé dans le dépôt, et cette décision ne le
  ferme pas. Elle ferme la divergence sur les **valeurs servies**, pas sur la
  forme de l'enveloppe.
- **stdio n'a aucune des quatre étapes d'amont** et n'est concerné ni par le
  journal d'amont, ni par le `Retry-After`.
- **La mesure du § 3 vient d'un noyau double, pas de l'orchestrateur réel** : il
  est établi que le transport HTTP jette ces deux valeurs quand on les lui remet,
  **pas** que l'orchestrateur les produit correctement — cela se mesure ailleurs
  (`core/epreuve/chaine-chemins-de-panne.spec.ts`).
- **Aucun constat de cette famille ne vient d'un socle DÉMARRÉ.** `ops/main.ts`
  n'a été exécuté de bout en bout par personne. La garde du § suivant est écrite
  pour que cela cesse.

---

## Ce que les gardes doivent tenir

1. **Le compte sur le chemin NON ARMÉ** : un transport monté **sans**
   `journalDesRefus` doit annoncer, sur un refus prononcé,
   `refusPrononces === 1` **et `refusConsignes === 0`**. C'est la garde qui
   manquait, et c'est elle qui rougira le jour où le port redeviendra muet.
   **Et le témoin inverse** : le même refus sur un journal armé annonce
   `refusConsignes === 1`.
2. **Le rejeu, sur les DEUX transports, apparié** : le même noyau rendant
   `{ genre: "rejeu", resultRef: … }` doit produire un genre et un `resultRef`
   lisibles des deux côtés. Aucun des onze `it.fails` de
   `core/epreuve/lot2-le-transport-attaque.temoin.spec.ts` ne porte sur le
   rejeu : c'est le trou exact, et le corpus ne peut pas le voir tant qu'il ne le
   contient pas.
3. **Le `Retry-After` sur un refus sorti de `monterLeService`**, pas sur un
   transport de test. Une garde de COMPOSITION, sans quoi le câblage manquant
   reste invisible — c'est ainsi qu'il a survécu au lot 2.
4. **Les mutations qui doivent MOURIR** :
   - remettre `refusConsignes += 1` inconditionnel ;
   - remettre `charge.valeur.genre === "exécuté" ? … : null` dans `corpsDeSucces` ;
   - retirer `journalDesRefus` du bloc de dépendances de `monterLeService`.
     Chacune réappliquée sur le vrai code, suite complète relancée, restaurée,
     empreinte reconfrontée, les deux états transcrits.

---

## Conséquences acceptées

- **Le contrat du port change de signature.** `Promise<void>` → `Promise<number>`
  casse toute implémentation existante — il n'y en a qu'une, non armée, plus les
  doubles des gardes. C'est le moment où le changement ne coûte rien.
- **`PortsDuService` grossit de deux ports.** C'est le prix de l'honnêteté du
  § 2 : tant que la fente n'existe pas, « non armé » n'est pas un réglage, c'est
  une impossibilité.
- **Un second canal de journal existe désormais**, et il faut le dire tout haut
  plutôt que le laisser croire à un `ops_audit` amputé. Le healthcheck publie son
  compte ; l'écran Santé du § 22 le montrera.
