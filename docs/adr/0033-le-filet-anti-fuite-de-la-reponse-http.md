# ADR 0033 — Le filet anti-fuite de la réponse HTTP : la réponse est relue avant d'être expédiée

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué au constructeur du transport HTTP, lot 2)
- **Portée** : `core/transport/http/reponse.ts` (`verifierAucuneFuite`),
  `core/transport/http/transport.ts` (le scellement de chaque réponse)
- **Sources** : cahier des charges v6, § 15 (« une erreur ne fuit JAMAIS un secret
  ni une donnée personnelle » · « `internal` dit un identifiant de corrélation,
  JAMAIS une trace de pile »), § 20 (« `confirmation_required` dit la cible
  exacte — ET JAMAIS LE JETON DE CONFIRMATION »), § 31 ; ADR 0025, ADR 0029

---

## Le sujet

Le § 15 pose trois règles, dont la première : **une erreur ne fuit jamais un
secret ni une donnée personnelle.** Le § 20 en pose une quatrième, plus étroite
et plus dure : le jeton de confirmation ne reparaît **jamais** dans une réponse
d'erreur.

Aucune des deux n'était tenue par autre chose que le soin de celui qui écrivait
le message. Or les messages de refus viennent de partout :

- des quatre étapes amont (`core/transport/http/amont.ts`) ;
- de la lecture d'enveloppe ;
- et surtout des dix étapes de l'orchestrateur, qui **composent leur texte à
  partir de valeurs de l'appel** — le nom d'outil, le compteur, la fenêtre, le
  délai de reprise, le niveau de politique.

Aucun de ces auteurs ne connaît la liste des valeurs sensibles de LA requête en
cours. Le transport, lui, la connaît : c'est lui qui a lu le porteur, l'hôte, la
clé d'idempotence, le curseur et le jeton de confirmation.

Le mode de défaillance visé n'est donc pas « quelqu'un a mal écrit un message ».
C'est : **le message a été écrit correctement, et une valeur de la requête y est
entrée par une composition que personne n'a relue.**

---

## Décision

### 1 · Chaque réponse est relue avant d'être expédiée

`verifierAucuneFuite(reponse, sensibles)` confronte la réponse **sérialisée** —
statut, en-têtes ET corps — aux valeurs sensibles de l'appel. Les en-têtes en
font partie : un défi `WWW-Authenticate` voyage en clair et se journalise plus
facilement qu'un corps.

### 2 · Une fuite REMPLACE la réponse — fail-closed

Quand une valeur est retrouvée, la réponse est remplacée par un `internal` nu,
portant l'identifiant de corrélation et **les NOMS** des valeurs retenues —
jamais leur contenu.

Perdre un message d'aide coûte moins qu'un jeton porteur ou un jeton de
confirmation à usage unique renvoyé dans un corps d'erreur. C'est le même
arbitrage que le § 20 fait déjà entre « dire la cible exacte » et « ne jamais
dire le jeton ».

### 3 · La liste des valeurs sensibles est NOMMÉE, et le nom d'outil n'en est pas

Sont confrontés : l'en-tête `Host`, le porteur, la clé d'idempotence, le curseur,
le jeton de confirmation, et **chaque chaîne d'`input`** (parcours borné en
profondeur et en nombre).

⚠️ **Le nom d'outil est délibérément EXCLU, et il faut l'écrire ici, sinon
quelqu'un l'ajoutera pour « faire bonne mesure ».** Le § 15 exige au contraire
que `tool_disabled` « dise qu'il existe, et où l'activer », et que
`tool_not_in_profile` « dise le profil courant, et lequel l'expose ». Un filet
qui confronterait le nom d'outil rougirait sur le comportement **prescrit**, et
le remède qu'on chercherait à cette fausse alerte serait de le désactiver.

### 4 · Les valeurs trop courtes sont ÉCARTÉES, et comptées

En deçà de huit caractères, une valeur n'est pas confrontée : une collision
fortuite avec un mot du protocole (« invalid », « request », un identifiant
court) ferait rougir la garde sur une coïncidence. `valeursEcartees` dit combien
n'ont pas été confrontées, pour que la borne soit **lue** et non seulement
écrite.

---

## Ce que la garde doit tenir

- **les deux comptes** : valeurs confrontées et valeurs écartées. Un filet qui
  aurait confronté zéro valeur serait vert pour la pire des raisons, et
  `transport.spec.ts` lit ce nombre plutôt que la couleur ;
- **un témoin par famille** : le jeton de confirmation recopié dans un message de
  refus, et un argument de l'appel recopié dans un autre. Les deux doivent faire
  remplacer la réponse ;
- **un témoin de NON-régression** : un message qui nomme l'outil ne doit
  produire AUCUNE fuite. Sans lui, la garde dériverait vers le refus du
  comportement prescrit.

---

## Ce que ce filet ne voit pas — écrit avec la décision

- **une valeur ré-encodée** (base64, URL-encodée), tronquée ou reformatée lui
  échappe entièrement. Il compare des chaînes, telles quelles ;
- **une donnée personnelle qui ne vient pas de la requête** — d'un adaptateur,
  par exemple — n'est pas dans la liste, donc pas confrontée. Ce n'est pas un
  détecteur de contenu, et c'en est le contraire : il répond à « cette valeur-CI
  est-elle ressortie ? », question à laquelle on peut répondre exactement.
  `verifierAucunContenu()` (§ 31) porte l'autre moitié, du côté du journal ;
- **il ne remplace aucune discipline d'écriture.** Il est le dernier filet, pas
  le premier.

---

## Conséquences acceptées

- Un message d'aide légitime peut être perdu si l'une des valeurs de la requête
  y figure pour une bonne raison. Le cas est signalé — la réponse porte les NOMS
  des valeurs retenues — et se corrige en amont, dans le message, jamais en
  assouplissant le filet.
- Le coût est un parcours de la charge utile par appel, borné à 64 chaînes et
  8 niveaux de profondeur. Il est payé sur le chemin de succès comme sur celui
  du refus : une garde qui ne tournerait que sur les erreurs ne verrait pas une
  fuite dans une réponse de succès.
