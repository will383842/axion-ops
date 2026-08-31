# ADR 0028 — La politique d'accès, chemin par chemin, versionnée dans le dépôt

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `ops/acces/politique-de-chemins.ts`, `core/transport/`,
  `core/auth/`
- **Sources** : cahier des charges v6, § 16 (les trois portes, défaut bloquant
  n° 14), § 21 (arrêt d'urgence derrière Access seul), § 11 (découverte) ;
  ADR 0001, ADR 0027

---

## Le défaut bloquant n° 14

Le § 16 le pose : mis devant `/api/mcp`, Cloudflare Access **n'ajoute pas une
serrure, il empêche OAuth de commencer**. Un client MCP n'a pas de navigateur
pour franchir une page de connexion, et la découverte `/.well-known/*` doit être
joignable sans authentification **par construction** — c'est elle qui dit au
client où s'authentifier.

La v5 écrivait « Cloudflare Access devant le socle », sans chemin.

---

## Décision

**La politique attendue est une configuration versionnée du dépôt
(`ops/acces/politique-de-chemins.ts`). La pose réelle appartient à Will ; le
dépôt porte la forme attendue et une garde qui rougit si le code s'en écarte.**

| Chemin            | Régime      | Pourquoi                                             |
| ----------------- | ----------- | ---------------------------------------------------- |
| `/.well-known/*`  | Bypass      | découverte, aucune capacité, machine sans navigateur |
| `/console/*`      | Access      | un humain, un navigateur, l'arrêt d'urgence          |
| `/auth/authorize` | Access      | un humain s'y identifie                              |
| `/auth/token`     | hors Access | une machine ; protégé par PKCE                       |
| `/auth/revoke`    | hors Access | une machine ; la révocation doit rester facile       |
| `/api/mcp`        | hors Access | protégé par OAuth, l'étape 1 et le pare-feu          |
| `/healthz`        | hors Access | lu par l'orchestrateur de conteneurs                 |

### Un écart assumé avec le § 16, signalé plutôt que recopié

Le § 16 écrit : « `/console/*` et **`/auth/*`** derrière Access ». Appliqué tel
quel, ce serait **le défaut bloquant n° 14 une seconde fois, une porte plus
loin** : `/auth/token` et `/auth/revoke` sont appelés par un programme, sans
navigateur, exactement comme `/api/mcp`. Les mettre derrière Access rend
l'échange du code contre un jeton impossible, et l'émetteur inutilisable.

La coupure passe donc **à l'intérieur** de `/auth/*`, entre ce qu'un humain
atteint et ce qu'une machine atteint :

- `/auth/authorize` est la page où un humain s'identifie. Un navigateur y est
  présent par construction : Access ne casse rien, et pose une seconde serrure
  devant l'endroit exact où un consentement s'accorde ;
- `/auth/token` et `/auth/revoke` sont déjà liés à une interaction humaine
  **passée**, par le `code` et le `code_verifier` de PKCE.

**Cet écart est une décision, pas un oubli du § 16.** Recopier la phrase du
cahier des charges aurait reproduit, une porte plus loin, exactement le défaut
que ce même paragraphe existe pour corriger.

### Le joker vit dans la règle Access, pas dans la donnée

Chaque entrée porte un chemin **sans joker** et une portée explicite —
`préfixe` ou `exact`. Deux raisons, et la seconde est mesurée :

1. la garde confronte des chemins **réellement servis** à ces entrées ; un joker
   l'obligerait à interpréter une syntaxe de motif, c'est-à-dire à comprendre un
   chemin d'une seconde façon, qui divergerait de la règle réellement posée ;
2. **une barre oblique suivie d'une étoile, à l'intérieur d'une chaîne de
   caractères, ouvre un commentaire de bloc pour `sansProse`
   (`core/coutures/verifier.ts`)** : la garde de couture de l'ADR 0019 devient
   aveugle sur tout ce qui suit, jusqu'au prochain marqueur de fin de
   commentaire. C'est un défaut de cette garde-là — il est signalé au rapport du
   lot 2 —, et l'écrire ici évite de rouvrir un trou sans le savoir.

La forme jokerisée reste celle de la règle Access, et elle est dans le tableau
ci-dessus, où elle ne traverse aucun analyseur.

### Chaque entrée écrit ce qui casse si le régime est autre

C'est la seule moitié qui se vérifie : un régime se justifie mal, une panne se
reconnaît. `siOnSeTrompe` est obligatoire sur chaque entrée, et une entrée sans
lui n'est pas une entrée.

### `/healthz` hors Access

Il est lu par l'orchestrateur de conteneurs, qui n'a ni navigateur ni identité.
Derrière Access, il rendrait une page de connexion : le conteneur serait déclaré
malsain en permanence, et le déploiement rougirait pour une raison étrangère à la
santé du socle. Il ne rend qu'un statut et des **comptes** — jamais un contenu.

---

## Ce que la garde doit tenir, et ce qu'elle ne peut pas tenir

**Le sens de lecture est l'inverse de l'intuition.** Une garde qui relirait
`POLITIQUE_DE_CHEMINS` et se déclarerait satisfaite serait verte le jour où un
chemin neuf est servi sans y être déclaré — c'est-à-dire le seul jour où elle
aurait quelque chose à dire. Donc :

1. **la source est l'ensemble des chemins que le socle SERT**, lu dans
   `core/transport/` et `core/auth/` — comme `verifierLeCablageDuDemarrage` lit
   ses appelants ;
2. tout chemin servi que **aucune** entrée ne couvre est une anomalie ;
3. toute entrée qui ne couvre **aucun** chemin servi est une anomalie aussi : une
   règle posée devant rien est une règle qu'on croit active ;
4. la garde **annonce les deux comptes** — chemins servis lus, entrées
   confrontées — et a un témoin fabriqué de chaque côté : un chemin servi retiré
   de la politique, et une entrée qui ne couvre rien.

⚠️ **La borne, écrite avec la mesure.** Cette garde répond à « le dépôt est-il
cohérent avec lui-même ? ». Elle ne répond **pas** à « la porte est-elle posée
chez Cloudflare ? », et aucune garde de ce dépôt ne le peut : il n'y a aucun
appel réseau sortant ici, par règle. Écrire « le risque est couvert par la
garde » serait raisonner sur une fausse sécurité — le dépôt voisin a payé
plusieurs mois pour l'apprendre.

---

## Conséquences acceptées

- Le dépôt public décrit la **topologie** des chemins servis. C'est une
  information de conception, pas un secret : la règle 1 du même paragraphe pose
  que la sécurité ne repose sur aucun secret de conception. Aucun identifiant
  d'infrastructure, aucun nom d'hôte réel n'entre ici.
- Si Will pose la porte autrement, le dépôt ment. La garde ne le verra pas —
  c'est écrit ci-dessus, et c'est la raison pour laquelle la vérification de la
  pose reste un geste humain, à refaire après chaque changement de la
  configuration Cloudflare.
