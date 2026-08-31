# ADR 0032 — Le fil stdio : le cadrage, la fermeture des paramètres, et pourquoi un refus de la chaîne n'est pas une erreur de protocole

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué au constructeur du transport stdio, lot 2)
- **Portée** : `core/transport/stdio/cadrage.ts`, `core/transport/stdio/protocole.ts`,
  `core/transport/stdio/serveur.ts`, `core/transport/stdio/etapes-exercees.ts`
- **Sources** : cahier des charges v6, § 11 (protocole, JSON-RPC 2.0, « la liste
  est relue à chaque `tools/list` », anti DNS-rebinding), § 15 (les trois règles
  d'une erreur), § 20 (le jeton de confirmation ne sort jamais d'une réponse
  d'erreur), § 23 (local = stdio), § 30 (couper une instance stdio), § 31 (aucun
  contenu au journal) ; ADR 0020, ADR 0025

---

## Ce que cette ADR complète, et ce qu'elle ne rouvre pas

L'ADR 0025 tranche **ce qui décide** : deux transports, un seul noyau, trois
interdits de construction. Elle ne dit rien de **ce qui entoure** l'appel du
côté stdio — où finit un message, ce qu'on fait d'une ligne qu'on n'a pas su
lire, sous quelle forme un refus revient à l'appelant. Ces trois questions n'ont
pas de réponse implicite : chacune, laissée ouverte, se referme au premier
correctif venu, et dans le mauvais sens.

Rien de ce qui suit ne modifie l'ADR 0025 ni l'ADR 0014. La colonne du § 11, le
principal réservé, les scopes par défaut et la session par exécution du démon
sont pris tels quels et **ne sont pas réécrits**.

---

## Décision

### 1 · Le cadrage — un message JSON par ligne, et une borne qui resynchronise

**Un message par ligne, délimitée par `\n`.** Deux formes sont écartées
nommément :

- **un en-tête `Content-Length`, à la LSP** — il fait dépendre le cadrage d'un
  nombre écrit par l'appelant. Un `Content-Length` menteur désynchronise le
  flux, et la resynchronisation demande alors de deviner. Le délimiteur retenu,
  lui, est un caractère que l'appelant **ne peut pas produire à l'intérieur d'un
  message** : `JSON.stringify` échappe tout saut de ligne. Le cadrage ne repose
  donc sur aucune valeur choisie par l'appelant ;
- **un flux JSON concaténé** — il n'a aucun point de reprise : un octet fautif
  emporte tout ce qui suit.

**Le tampon est borné, et le dépassement RESYNCHRONISE.** C'est le point délicat,
et il est plus important que la borne elle-même. Vider le tampon sans
resynchroniser laisserait la **suite** de la ligne trop longue arriver au morceau
d'après et être lue comme un début de message : un attaquant obtiendrait de
faire analyser un fragment qu'il aura choisi à l'octet près, en préfixant sa
charge d'un mébicaractère de bourrage. Le découpeur jette donc jusqu'au prochain
délimiteur, et cet état est **annoncé dans ses mesures** — un découpeur bloqué en
resynchronisation qui ne livre plus rien doit se voir plutôt que de ressembler à
un client silencieux.

⚠️ **La borne est en unités de code UTF-16, pas en octets, et c'est écrit avec
elle.** Ce module reçoit des chaînes déjà décodées : c'est ce qu'il tient en
mémoire, donc c'est ce qu'il borne. Le plafond en octets qui en découle est
jusqu'à **quatre fois** plus haut. Lire `CARACTERES_MAX_PAR_LIGNE` comme « au
plus un mébioctet » se tromperait d'un facteur quatre. La borne en octets, si on
la veut, se pose là où le flux est décodé — chez l'appelant, hors de ce module.

**Quatre causes de rebut, comptées séparément** — ligne trop longue, JSON
illisible, lot refusé, enveloppe qui n'est pas un objet. Un compteur unique de
« lignes rejetées » ne distinguerait pas un client mal écrit d'un client qui
essaie la taille du tampon, et les deux appellent des gestes opposés : corriger
un client, ou couper une instance (§ 30).

**Le lot JSON-RPC est refusé.** La révision 2025-06-18 de MCP l'a retiré et le
§ 11 ne sert qu'une primitive. Le refuser explicitement vaut mieux que d'en
servir le premier élément : servir la moitié d'un lot est la façon la plus
discrète de perdre un appel.

### 2 · Un refus de la chaîne est un RÉSULTAT, jamais une erreur de protocole

C'est la décision centrale de cette ADR. La frontière est :

| Ce qui s'est passé                                                           | Ce qui sort                    | Ligne d'`ops_audit`            |
| ---------------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| l'enveloppe est fautive — illisible, méthode inconnue, `params` non conforme | `error`, code JSON-RPC négatif | **aucune**                     |
| l'appel a traversé la chaîne et une étape l'a refusé                         | `result` avec `isError: true`  | **une**, avec son `stepDenied` |

Le § 15 le dit sans le dire : « un refus de politique est une **réponse
normale** ». Un `-32603` sur un refus d'étape 10 ferait l'inverse exact de ce que
le § 15 exige — il ferait réessayer le **transport** là où il faut corriger
l'**appel** —, et il rendrait un refus d'autorisation indiscernable d'une
enveloppe malformée pour quiconque lit le fil.

**Le numéro de l'étape voyage dans le résultat**, à côté du code du § 15. Ce
n'est pas une redite de `ops_audit.stepDenied` : sans lui, « refusé » ne dit pas
à quel rang, et le client — qui est un modèle — ne peut pas distinguer « corrige
ton entrée » (étape 8) de « demande une confirmation » (étape 10) de « n'insiste
pas » (étape 11). Le § 15 exige que l'erreur dise ce qu'il faut faire ensuite ;
le rang en est la moitié.

⚠️ **Le coût est écrit avec la décision : une enveloppe fautive ne laisse AUCUNE
trace dans `ops_audit`.** L'invariant du § 11 lie les terminaisons de la
**chaîne**, et il n'y a pas eu de chaîne : aucun `AppelEntrant` n'a été formé.
C'est une **asymétrie réelle avec le transport HTTP**, où le § 11 donne aux
quatre premières étapes un numéro — un `Host` refusé a un `stepDenied` à
inscrire. En stdio ces quatre étapes n'existent pas, et une enveloppe fautive n'a
aucun rang à écrire. Le compte des rebuts et des enveloppes fautives vit donc
dans les mesures du serveur, et nulle part ailleurs. Voir « Ce qui reste ouvert ».

### 3 · Les paramètres de `tools/call` sont une liste FERMÉE

Cinq clés admises : `name`, `arguments`, `idempotencyKey`, `cursor`,
`confirmation`. **Toute autre clé fait refuser l'enveloppe.**

**Une fermeture, et non une liste noire, et c'est la décision.** Une liste noire
répond par énumération — `sessionId`, `principal`, `scopes`, `deadline`,
`policyLevel`… — et **elle vieillit** : le champ ajouté demain à `ToolContext` ou
à `IdentiteAppelante` n'y sera pas, et il entrera en silence. C'est très
exactement le mode de défaillance que `NOMS_RESERVES_HORS_CONTEXTE` a coûté au
lot 1d — une garde qui rétrécit sans changer de couleur. La fermeture, elle, ne
vieillit pas : ce qui n'est pas nommé est refusé, aujourd'hui et pour tout nom
qui n'existe pas encore. C'est le dialecte que le § 09 impose déjà aux
adaptateurs ; il n'y avait aucune raison que le transport s'en dispense.

**Refuser, et non ignorer.** Un paramètre inconnu silencieusement écarté laisse
croire à l'appelant qu'il a été pris en compte : un client qui croirait poser une
`deadline` obtiendrait un succès et une échéance autre que la sienne.

⚠️ **La borne : la fermeture porte sur le premier niveau de `params`.** Une
valeur cachée **sous** `arguments` lui échappe entièrement — et c'est très bien :
`arguments` est validé à l'étape 8 par le schéma fermé de l'outil, et le contrôle
7 du § 09 y interdit déjà les noms d'autorisation. Les deux fermetures se
répondent ; aucune ne couvre l'autre.

### 4 · Rien de ce que le transport reçoit ne ressort dans une erreur

Ni le nom d'une méthode inconnue, ni une clé de paramètre refusée, ni un extrait
de ligne illisible. Ce qui sort est une **cause**, et la liste de ce qui est
**admis** — deux valeurs qui ne viennent pas de l'appelant.

Le motif n'est pas seulement le § 31. C'est le § 20 : **le jeton de confirmation
voyage dans les paramètres**, et le § 20 interdit nommément qu'il soit délivré
dans une réponse d'erreur. Un message qui recopierait ce qu'il vient de recevoir
le rendrait au client par le canal d'erreur. Une garde mesure que rien de ce qui
est entré ne se retrouve dans l'octet écrit, refus compris.

### 5 · `tools/list` est relue, et le transport ne filtre rien

Le § 11 tranche : « la liste est relue à chaque `tools/list` ». Le port s'appelle
donc `listerPourCetAppel` — un nom qui ne se lit pas comme une lecture
mémorisable, là où un `lister()` l'aurait été — et le serveur annonce
`toolsListServis` et `lecturesDuCatalogue`, qui **doivent rester égaux**. Une
mémoïsation entre deux appels ferait diverger les deux comptes.

**Et le transport ne trie pas la liste.** Décider quels outils un principal voit
est l'étape 7 (`core/profiles`) ; un transport qui trierait lui-même referait
cette étape à côté du noyau, avec deux règles qui divergeraient en silence. C'est
l'interdit n° 2 de l'ADR 0025 appliqué à `tools/list`.

### 6 · Le budget d'un appel a un plafond, écrit dans le dépôt

`deadline = maintenant() + budget`, et le budget est **ramené sous
`BUDGET_MAX_MS`** plutôt que refusé. Un réglage sans borne haute permet
d'immobiliser le socle pour une durée arbitraire, et le § 30 rappelle qu'une
instance stdio **n'a pas de jeton à révoquer** : on ne la coupe pas d'un geste.
Ramener plutôt que refuser évite qu'une valeur malheureuse fasse échouer un
démarrage local — ce que le § 23 range en environnement de développement.

### 7 · L'attache aux flux SÉRIALISE, et elle ne saisit aucun flux du processus

Les événements `data` arrivent quand ils veulent, et `absorber` est asynchrone.
Sans chaîne de promesses, deux morceaux se serviraient en parallèle : l'ordre des
réponses deviendrait fonction de la durée des appels et — beaucoup plus grave —
**deux appels porteurs de la même clé d'idempotence se croiseraient dans le
transport** au lieu de se croiser dans le dépôt, à l'étape 13. Ce serait déplacer
une décision du § 11 hors du noyau, ce que l'ADR 0025 existe pour empêcher.

**Et l'attache ne nomme ni `process`, ni `stdin`, ni `stdout`.** Les flux lui
sont remis par la racine de composition, décrits par les deux méthodes dont elle
a besoin — jamais par `NodeJS.ReadStream`. Un module de `core/` qui saisirait les
flux du processus serait impossible à monter deux fois et impossible à éprouver
sans mutiler l'exécutant.

**Une levée pendant le service est comptée, jamais relancée.** Un écouteur `data`
est appelé hors de toute pile qui pourrait rattraper : une promesse rejetée y
devient un rejet non géré, c'est-à-dire un processus qui meurt sans rien dire. Le
§ 30 rappelle qu'une instance stdio se coupe par une procédure dédiée, jamais par
ce que quelqu'un lui envoie.

---

## Ce que la garde doit tenir

- **le cadrage**, éprouvé sur un flux morcelé à **chaque position possible** —
  un découpeur juste seulement sur des morceaux alignés sur les lignes serait
  vert sur tout test écrit gentiment ; et sur les **quatre** causes de rebut, la
  totalité étant dérivée de `CLES_DE_REBUT` plutôt que recopiée ;
- **la resynchronisation**, avec son témoin qui est l'attaque elle-même, et sa
  **contre-épreuve** : le même flux, sous un plafond qui ne mord pas, doit être
  analysé — sans quoi le vert du premier ne serait pas attribuable à la borne ;
- **la fermeture des paramètres**, éprouvée sur des noms **dérivés** des clés de
  `STATUT_DES_CANAUX_DE_CONTEXTE`, avec le témoin inverse obligatoire : les cinq
  clés admises passent. Sans ce contraste, un transport qui refuse tout
  satisferait la garde ;
- **le § 20**, mesuré : le jeton de confirmation soumis ne se retrouve dans aucun
  octet écrit, y compris sur le chemin de refus ;
- **la frontière du point 2**, mesurée par les deux comptes qui la rendent
  falsifiable : sur trois enveloppes fautives, **zéro** appel au noyau et
  **zéro** ligne d'`ops_audit` ; sur onze refus de chaîne, **onze** lignes, et
  aucune sortie en `error`.

---

## Conséquences acceptées

- **Une enveloppe fautive n'est comptée que par le serveur.** Elle ne laisse rien
  dans `ops_audit`. Un socle stdio bombardé d'enveloppes illisibles ne le dira
  qu'à qui lit ses mesures — le § 24 n'a pas de source pour ce cas-là.
- **Le cadrage ne borne pas les octets.** Il borne les caractères, et le facteur
  entre les deux est mesuré plutôt qu'écrit. La borne en octets appartient à
  l'appelant qui décode le flux.
- 🔴 **`brancherSurLesFlux` n'a aucun appelant de production.** La fonction est
  écrite et éprouvée sur des doubles ; la ligne qui la pose appartient à
  `ops/main.ts` (étage 6, ADR 0023). **Tant qu'elle n'est pas posée, le démon
  stdio ne lit aucun flux réel.** Le registre des coutures porte cette dette en
  `à-coudre` plutôt que de la taire.
- **Les cadres sont servis séquentiellement.** Deux appels concurrents porteurs
  de la même clé d'idempotence doivent se croiser **dans le dépôt** (étape 13),
  pas dans le transport ; servir en parallèle rendrait l'ordre des réponses
  dépendant de la durée des appels et déplacerait une décision hors du noyau.
