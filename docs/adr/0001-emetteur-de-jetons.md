# ADR 0001 — Le socle émet ses propres jetons

- **Statut** : acceptée
- **Date** : 2026-08-30
- **Décideur** : Williams Jullin
- **Portée** : `core/auth/`, routes `/auth/*` et `/api/mcp`, table `ops_token`,
  étapes 2, 3 et 4 de la chaîne d'appel
- **Sources** : cahier des charges v6, § 11 (protocole et chaîne d'appel),
  § 19 (identité et accès) ; cahier des charges du 2026-08-29, § 13.5

---

## Décision

**Option A — un serveur d'autorisation minimal, intégré au socle, servi sur
`/auth/*`, sur un domaine distinct, et séparé logiquement du resource server.**

Le socle porte donc **deux rôles**, et ils ne se mélangent nulle part :

| Route      | Rôle                       | Ce qu'il fait                                                                                                               |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/auth/*`  | **Serveur d'autorisation** | OAuth 2.1 + PKCE, métadonnées RFC 8414, indicateur de ressource RFC 8707. Émet des jetons. Porte la **session de console**. |
| `/api/mcp` | **Resource server**        | Streamable HTTP, JSON-RPC 2.0. **Valide** des jetons, n'en émet **jamais**.                                                 |

Cette décision est **actée par Will le 2026-08-30**. Elle n'est pas à rouvrir.

---

## Motif

### 1. Le § 11 l'exige : sans émetteur, le socle n'a pas d'identité à valider

La v5 du document écrivait : « resource server uniquement : il valide des
jetons, il n'en émet jamais, il ne gère aucun login ». Cette phrase est **une
recopie amputée**.

Le cahier des charges du 29 août tranchait explicitement au § 13.5 —
« _option A — AS minimal intégré, sur domaine distinct, séparé logiquement du
resource server · **Retenue**_ » — et chiffrait « pas de serveur d'autorisation
à installer de zéro **(option A, comprise dans le lot 1)** ». La v5 a repris la
phrase **sans la parenthèse** : elle a gardé l'hypothèse et jeté ce qui la
rendait vraie.

Un resource server pur suppose un émetteur **ailleurs**. Il n'y en a aucun. Sans
émetteur, les étapes 2, 3 et 4 de la chaîne d'appel — signature et `iss`,
audience RFC 8707, `jti` non révoqué — n'ont **aucun objet à interroger**.

### 2. Le § 19 l'exige : l'arrêt d'urgence doit partir d'un téléphone

Le § 21 pose que la console appartient au socle et qu'elle doit **survivre à la
panne d'Axion-IA**. Le § 22 y range un écran **Arrêt d'urgence** et un écran
**Déverrouillage**.

Servir un arrêt d'urgence depuis un téléphone suppose une **session de console**
— donc un login, donc un serveur d'autorisation. C'est la seule façon. Déléguer
ce login à Axion-IA ferait tomber l'arrêt d'urgence en même temps que ce qu'il
doit arrêter.

### 3. Le § 20 l'exige : desserrer n'est jamais un outil MCP

L'asymétrie du § 20 veut que **resserrer** soit toujours libre — un outil MCP,
sans scope particulier — et que **desserrer** ne le soit jamais : _aucun outil
MCP_, une route dédiée du socle sous `ops:policy`, avec second facteur TOTP et
TTL obligatoire.

Une route de desserrage exige un **canal que le socle ne peut ni lire ni
écrire**, et une identité qui n'a pas transité par `/api/mcp`. Cela ne se
fabrique que du côté émetteur.

### 4. Ce que coûte l'alternative

Un serveur d'autorisation tiers (Keycloak, Auth0, Zitadel) ajouterait un
service à héberger, une dépendance de disponibilité de plus sur un VPS déjà
saturé, et — pour un émetteur SaaS — un sous-traitant supplémentaire au
registre RGPD, pour un seul principal humain. Le § 33 chiffrait explicitement
l'option A comme « comprise dans le lot 1 ».

---

## Ce que ça implique

### Dans le code

- **Deux répertoires de routes, jamais mêlés.** Le module `core/auth/` porte les
  deux rôles, mais les handlers d'émission et les handlers de validation ne
  partagent aucune fonction de décision. Un jeton n'est jamais émis sur le
  chemin d'une requête `/api/mcp`.
- **Domaine distinct** pour `/auth/*` : la surface d'émission n'est pas jointe à
  la surface d'appel.
- **Aucune session d'authentification serveur sur `/api/mcp`** : le jeton porte
  les droits (§ 11). Le socle tient en revanche deux états de **pilotage** —
  `ops_audit.sessionId` (session de pilotage, porteuse du marquage de
  provenance) et `ops_runtime` (profil actif par principal). Ce ne sont pas des
  états de protocole.

### Sur la table `ops_token`

Elle existe **parce que** le socle émet. Sans elle, « révoque les jetons du
socle » n'a aucun objet, et l'étape 4 n'a rien à interroger.

- Access token **1 h**, refresh **30 j rotatif**.
- Seule une **empreinte salée** est conservée. Le jeton en clair ne s'affiche
  **qu'une fois**.
- `principal` et `kind` ont été ajoutés par la Fondation aux champs nommés par
  le § 12 : le § 19.1 range **deux durées de vie** dans une seule table, il faut
  les distinguer pour faire tourner la chaîne de refresh ; et « révoque les
  jetons du socle » doit savoir **de qui**.

### Sur les scopes (§ 19.2)

Cinq scopes : `ops:read`, `ops:draft`, `ops:send`, `ops:admin`, `ops:policy`.

> **`ops:policy` n'est JAMAIS porté par le jeton du connecteur.**

C'est ce scope, et lui seul, qui rend l'asymétrie du § 20 mécanique plutôt
qu'intentionnelle. Un jeton de connecteur qui le porterait rendrait le
desserrage atteignable depuis `/api/mcp` — exactement ce que le § 20 interdit.

### Une décision qui reste à prendre AVANT le lot 1

> **L'identifiant de ressource qui sert d'audience (RFC 8707) se décide et
> s'écrit avant le lot 1.** L'étape 3 de la chaîne d'appel n'a aucun sens sans
> lui.

`.env.example` en porte l'emplacement (`OPS_RESOURCE_INDICATOR`), avec une
valeur factice sur `stub.invalid`. Aucune valeur réelle n'entre dans le dépôt.

### Une règle absolue qui gagne un test

> **Le socle ne démarre pas si l'authentification n'est pas configurée.**
> Pas de mode dégradé. Pas de `AUTH_DISABLED`.

Le § 19 pose cette phrase comme la plus forte du document, et la v5 ne lui
donnait **aucun test** quand le coffre en avait un. Elle entre à la liste
obligatoire du § 32 : `core/auth/` doit livrer une garde qui rougit sur un
témoin de configuration absente, et qui **annonce combien de réglages elle a
vérifiés**.

---

## Conséquences acceptées

- Le socle porte du code d'émission de jetons : c'est une surface d'attaque de
  plus, sur un domaine distinct, à tenir à jour (§ 18).
- La spécification MCP courante doit être **relue au lot 1** : ni le cahier des
  charges v6, ni celui du 29 août ne font autorité sur un numéro de révision.
- Le pass-through reste **interdit** (§ 11) : le jeton reçu n'est jamais
  transmis en aval. Le jeton Zoho est un secret du coffre, pas une identité
  relayée.
