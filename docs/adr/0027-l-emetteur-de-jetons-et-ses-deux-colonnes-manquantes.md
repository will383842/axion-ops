# ADR 0027 — L'émetteur de jetons, et les deux colonnes qui manquaient à `ops_token`

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/auth/contrat.ts`, `core/auth/octroi.ts` et
  `core/auth/routes.ts` (à écrire), `prisma/schema.prisma` (`model OpsToken`),
  `core/vault/demarrage.ts` (`ROUTES_DU_SOCLE`), `.env.example`, étage 3 de
  `ETAGES_DU_DEMARRAGE`
- **Sources** : cahier des charges v6, § 11 (deux rôles), § 12 (`ops_token`),
  § 19 (règle absolue, § 19.1 durées, § 19.2 scopes), § 21 (la console survit),
  § 23 (trois états de coffre) ; ADR 0001, ADR 0014, ADR 0026

---

## Ce que l'ADR 0001 avait décidé, et ce qu'elle avait laissé

Elle a tranché l'option A — serveur d'autorisation minimal, intégré, sur
`/auth/*`, domaine distinct, séparé logiquement du resource server. Décision de
Will, non rouvrable.

Elle nommait **un dossier et une table, aucune fonction** : le registre des
coutures portait donc son entrée en `à-nommer`, en écrivant que l'entrée « se
périmera d'elle-même le jour où `core/auth/` atterrira ». Ce lot est ce jour-là.

---

## Décision

### 1 · Les routes, et la coupure qui compte

| Route             | Rôle                   | Qui l'appelle |
| ----------------- | ---------------------- | ------------- |
| `/.well-known/*`  | découverte             | une machine   |
| `/auth/authorize` | serveur d'autorisation | un **humain** |
| `/auth/token`     | serveur d'autorisation | une machine   |
| `/auth/revoke`    | serveur d'autorisation | une machine   |
| `/console/*`      | session de console     | un **humain** |
| `/api/mcp`        | resource server        | une machine   |

**Les handlers d'émission et les handlers de validation ne partagent aucune
fonction de décision, et un jeton n'est jamais émis sur le chemin d'une requête
`/api/mcp`.** La séparation n'est pas une convention de nommage.

La colonne « qui l'appelle » n'est pas décorative : c'est elle qui décide de la
politique d'accès de l'ADR 0028, et elle explique pourquoi mettre tout `/auth/*`
derrière Cloudflare Access reproduirait le défaut bloquant n° 14.

### 2 · PKCE `S256` obligatoire

`plain` est refusé. Un `code_challenge_method` absent est refusé. Il n'existe pas
de client historique à ménager : le socle n'a jamais émis de jeton.

### 3 · Durées, et rotation avec détection de rejeu

Access **1 h**, refresh **30 j rotatif** (§ 19.1). Chaque usage d'un refresh en
émet un neuf et révoque l'ancien.

**Un refresh déjà révoqué qui se représente révoque toute la chaîne d'octroi.**
C'est la seule lecture sûre de l'événement : soit le client rejoue, soit un
attaquant s'est intercalé, et on ne peut pas les distinguer. Le coût est un
client à réauthentifier ; le coût de l'autre choix est un jeton volé qui reste
valide trente jours.

Le jeton en clair **ne s'affiche qu'une fois**.

### 4 · Deux colonnes manquent à `ops_token`, et c'est mesuré

`LigneOpsTokenRelue` (`core/chaine/identite.ts`) exige un `sessionId`, et l'ADR
0014 décide qu'il **suit l'octroi, pas le `jti`**. Or `model OpsToken`
(`prisma/schema.prisma`) n'en porte **aucun** : `grep sessionId prisma/schema.prisma`
ne rend que les deux occurrences d'`ops_audit`.

C'est le premier lot qui pouvait le constater, parce qu'il est le premier à
écrire l'émetteur. Deux colonnes atterrissent avec lui :

- **`grantId`** — l'identifiant de la chaîne de rafraîchissement, c'est-à-dire
  d'un consentement humain. Il ne tourne jamais. C'est lui qui rend « révoque
  toute la chaîne » exécutable, et « la session suit l'octroi » vérifiable ;
- **`sessionId`** — frappée **une fois par octroi**, propagée à tout jeton qui en
  descend.

⚠️ **Elles atterrissent avec leur migration et avec leur lecteur, dans le même
geste.** Poser une colonne sans lecteur fabriquerait une seconde source de vérité,
et c'est le motif pour lequel le lot 1d a refusé de poser `governanceFields` seul.

### 5 · La frappe appartient à l'émetteur

`core/auth/octroi.ts` est le seul module du côté HTTP qui frappe une session.
`core/transport/http.ts` **relit** (voir ADR 0025, écart 5). Un module qui peut
frapper peut s'ouvrir une session propre à volonté, c'est-à-dire refaire
exactement le défaut mesuré au lot 1b : la liste des frappeurs doit rester plus
courte que celle des relecteurs.

### 6 · `ops:policy` est refusé **à l'octroi**, pas à l'étape 5

Le § 19.2 : « le jeton du connecteur ne le porte **jamais** ». La distinction
porte toute la décision — l'étape 5 refuse un **appel**, l'émetteur refuse que le
jeton **existe**. Un jeton portant `ops:policy` qu'aucun appel n'atteindrait
resterait une capacité en circulation, révocable seulement si quelqu'un s'avise
de la révoquer.

**L'ensemble émissible se dérive de `PORTE_PAR_LE_JETON_DAPPEL`, jamais d'une
seconde liste.** C'est la même totalité qui produit déjà
`SCOPES_PAR_DEFAUT_STDIO` : basculer un scope dans cette table change les deux du
même geste.

Le desserrage passe donc par la session de console et sa route dédiée, avec
second facteur TOTP et TTL — l'asymétrie du § 20 devient mécanique.

### 7 · L'empreinte des jetons est **clée par le coffre** ; la console ne l'est pas

Le § 12 écrit « empreinte SHA-256 salée ». Un sel par ligne ne protège pas un
extrait de base : il vit dans la même ligne que l'empreinte. La règle 2 du même
§ 12 tranche déjà le cas jumeau pour `argHash` — « HMAC-SHA-256, clé issue du
coffre, **fail-loud si la clé manque** » —, et le motif y est écrit : « un
SHA-256 nu se casse en quelques secondes ; un HMAC clé rend l'index inutilisable
pour qui obtiendrait un extrait sans le secret ». `tokenHash` suit la même règle.

**Conséquence, et c'est elle qui explique une asymétrie du § 21 :**

- le matériel d'authentification de la **console** n'entre jamais dans le coffre
  (§ 21). Il vit dans l'environnement, et l'étage 3 le confronte. C'est ce qui
  permet de se connecter pour **déverrouiller** ;
- la clé d'empreinte des **jetons OAuth** vit dans le coffre. Donc `/auth/token`
  ne répond pas sous coffre verrouillé.

C'est cohérent avec le § 23 : sous coffre verrouillé, « la console et le
déverrouillage répondent, tout appel d'outil est refusé ». L'émission de jetons
n'a rien à y faire — elle sert `/api/mcp`, qui refuse tout de toute façon
(étape 0, `vault_locked`).

⚠️ **`ROUTES_SANS_COFFRE` doit cesser de se dériver par exception.** Il vaut
aujourd'hui « tout sauf `outils` ». L'ajout d'une famille `émission` ferait de
cette exception une liste d'exceptions — la forme qui diverge. Chaque famille de
routes déclare donc si elle **exige le coffre**, et `ROUTES_SANS_COFFRE` se dérive
de cette déclaration. La garde annonce le nombre de familles lues.

### 8 · Jamais de pass-through

Le jeton reçu n'est **jamais** transmis en aval (§ 11). Ce n'est pas seulement une
règle : `ToolContext` ne porte aucun champ de jeton, et sa totalité est tenue par
le compilateur (`STATUT_DES_CANAUX_DE_CONTEXTE`). Un champ ajouté demain
obligerait quelqu'un à le **classer**.

---

## La règle absolue, et son test

> **Le socle ne démarre pas si l'authentification n'est pas configurée. Pas de
> mode dégradé. Pas d'`AUTH_DISABLED`.**

Le § 19 la pose comme la phrase la plus forte du document ; la v5 ne lui donnait
aucun test quand le coffre en avait un. Elle entre à la liste obligatoire du
§ 32, sous la forme de l'étage 3 :

- la vérification **annonce combien de réglages elle a confrontés**. Une
  vérification qui en confronterait zéro serait verte pour la pire des raisons —
  c'est le mode de défaillance qu'`ops/secrets.ts` documente déjà ;
- elle **nomme les manquants**, jamais leur valeur ;
- un témoin fabriqué, à qui il manque un réglage, doit produire exactement une
  anomalie nommant ce réglage ;
- une garde de texte rougit sur toute occurrence d'`AUTH_DISABLED` dans le dépôt,
  hors de la garde elle-même — filet, pas preuve : elle ne voit que la forme
  écrite.

---

## Conséquences acceptées

- Le socle porte du code d'émission de jetons : une surface d'attaque de plus, à
  tenir à jour (§ 18). C'était déjà la conséquence acceptée de l'ADR 0001.
- Un client dont le refresh a été rejoué est **déconnecté**, et doit repasser par
  `/auth/authorize`. C'est le prix de la détection de rejeu.
- La révision courante de la spécification MCP reste à **relire** : ni le cahier
  des charges v6 ni celui du 29 août ne font autorité sur un numéro de révision.
