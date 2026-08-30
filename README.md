# axion-ops — le socle

> **⚠️ AUCUN SECRET RÉEL. AUCUN DÉPLOIEMENT TANT QUE LE LOT 0a N'EST PAS FAIT.**
>
> Les prérequis d'exploitation du § 16 ne sont pas remplis. Tant qu'ils ne le
> sont pas, ce dépôt **n'expose rien** : pas de conteneur en production, pas d'URL publique, pas de valeur
> d'identifiant réelle dans un fichier, un test, un commentaire ou un message
> de commit. `.env.example` ne porte que des valeurs factices sur l'hôte
> `stub.invalid` (TLD réservé, RFC 2606 : il ne résout jamais).
>
> On écrit du code. Rien d'autre.

---

## Ce qu'est le socle

`axion-ops` est le **poste de pilotage vocal générique**. Il **ne connaît aucun
métier**.

Il fait quatre choses, et seulement quatre :

- il **autorise** — jeton, audience, scopes, profil actif, politique, provenance ;
- il **journalise** — un journal chaîné, à ordre total, où _chaque terminaison,
  refus compris_, écrit une ligne portant le numéro de l'étape qui a refusé ;
- il **limite** — débit et quota avec dénominateur, idempotence avec statut,
  compaction honnête des sorties ;
- il **route** — vers des **adaptateurs** qui, eux, portent tout le métier.

Tout ce qui sait quelque chose d'un domaine — une boîte mail, un agenda, un
CRM — vit dans un adaptateur, jamais ici.

### Deux rôles, séparés dans le code et dans les routes

| Route      | Rôle                                                                      |
| ---------- | ------------------------------------------------------------------------- |
| `/auth/*`  | **Serveur d'autorisation minimal** : OAuth 2.1 + PKCE, RFC 8414, RFC 8707 |
| `/api/mcp` | **Resource server** : il valide des jetons, il n'en émet jamais           |

Cette dualité est une décision actée par Will le 2026-08-30 — option A.
Voir [`docs/adr/0001-emetteur-de-jetons.md`](docs/adr/0001-emetteur-de-jetons.md).

### Les trois couches

```
COUCHE 1 — l'interface        poste vocal local, Claude Code, Claude web
COUCHE 2 — le socle           axion-ops · AUCUN MÉTIER
COUCHE 3 — les adaptateurs    TOUT LE MÉTIER
```

Le socle **ne consomme jamais une fonction `handler` distante**. Il consomme un
**manifeste JSON**, épinglé par empreinte SHA dans un `adapters.lock.json`
versionné ici, et appelle l'endpoint en JSON-RPC.

---

## Comment lancer les tests

```bash
pnpm install          # Node >= 22, pnpm 10
pnpm typecheck        # tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
pnpm lint             # eslint, règles typées
pnpm test             # vitest run
pnpm test:watch       # vitest, en veille
pnpm build            # tsc -p tsconfig.build.json → dist/
```

La base **n'est pas requise** pour `typecheck`, `lint`, `test` ni `build`.
`prisma validate` demande en revanche une `DATABASE_URL` présente ; la valeur
factice suffit :

```bash
DATABASE_URL="postgresql://stub:stub@stub.invalid:5432/stub" pnpm prisma:validate
```

**Aucune migration n'a été lancée** — aucune base ne tourne. `prisma migrate`
attend le lot d'infrastructure.

---

## La règle des gardes

> **Une garde qui ne peut pas échouer n'existe pas.**

Toute garde de ce dépôt doit satisfaire **deux** conditions :

1. **elle rougit sur un témoin fabriqué** — la logique de la garde est une
   fonction pure, appliquée d'abord à une donnée défectueuse construite pour
   l'occasion, puis à la vraie ;
2. **elle annonce combien d'éléments elle a mesurés**, et échoue sous un
   plancher-témoin.

Sans (1), on ne sait pas si le vert vient de la conformité ou de l'aveuglement.
Sans (2), un fichier déplacé rend la garde muette sans un mot — _elle mesure
zéro et reste verte_.

Le motif de référence est écrit en entier dans
[`core/types.spec.ts`](core/types.spec.ts). Les six constructeurs le copient.

Corollaire : **dériver, jamais recopier.** Aucune liste écrite à la main de ce
qui peut se dériver du code. `AppelStep` se dérive de `APPEL_STEPS` ;
`rangDataClass` se dérive de l'ordre de `DATA_CLASSES` ; la garde des codes
d'étape se dérive de `ERROR_CODES`.

---

## Le français

Commentaires, messages d'erreur et noms de tests sont **en français**. Les
identifiants de code restent en anglais quand c'est l'usage (`vault`, `policy`,
`handler`), mais **les concepts métier du socle gardent leur nom du cahier des
charges** : `effect`, `dataClass`, `profiles`, `hébergé`, `fédéré`, `brouillon`,
`confirmé`, `libre`.

Les valeurs accentuées descendent jusqu'en base : les énumérations Prisma
portent un identifiant ASCII et un `@map` vers la valeur du document
(`confirme @map("confirmé")`).

---

## Arborescence

```
axion-ops/
├─ core/
│  ├─ types.ts       LES TYPES PARTAGÉS, ET EUX SEULS  ← posé par la Fondation
│  ├─ auth/          émetteur (/auth/*) + resource server (/api/mcp) + session console
│  ├─ vault/         coffre à TROIS ÉTATS : absent · verrouillé · ouvert
│  ├─ policy/        niveaux, grammaire de scope, TTL paresseux, TOTP
│  ├─ provenance/    marquage de session, argHash HMAC, étape 11
│  ├─ profiles/      ÉNUMÉRATION FERMÉE, typée, versionnée
│  ├─ registry/      ops_adapter, ops_tool, adapters.lock.json, découverte
│  ├─ audit/         journal append-only, chaîné (seq + prevHash + selfHash)
│  ├─ limits/        débit avec dénominateur, idempotence avec statut
│  ├─ transport/     stdio + Streamable HTTP, même noyau
│  └─ adapter-kit/   defineAdapter(), manifeste JSON Schema, harnais à 9 contrôles
├─ adapters/zoho-mail/   seul adaptateur en mode HÉBERGÉ
├─ console/              8 écrans, dont Arrêt d'urgence et Déverrouillage
├─ voice/                démon local, verrouillé après inactivité
├─ ops/                  Dockerfile, healthcheck, migrations, sauvegarde
├─ prisma/schema.prisma  LES DIX TABLES DU § 12
└─ docs/adr/             décisions, datées
```

**Les constructeurs travaillent sur des dossiers disjoints.** Écrire hors de son
dossier casse le travail d'un autre. Une dépendance absente ne se rajoute pas à
`package.json` : elle s'écrit dans `core/<module>/DEPS.md`, avec le motif, et la
Recette la fusionne.

---

## Ce que la Fondation a posé

| Fichier                | Ce qu'il porte                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `package.json`         | Scripts et **toutes** les dépendances du socle — n'y touchez pas                             |
| `tsconfig.json`        | Rigueur maximale — n'y touchez pas                                                           |
| `tsconfig.build.json`  | Compilation de livraison (sans tests ni configuration)                                       |
| `vitest.config.ts`     | Tests **à côté du code**, en `*.spec.ts`                                                     |
| `eslint.config.js`     | Règles typées, `import type` explicite, `no-console` hors tests                              |
| `.prettierrc`          | 100 colonnes, guillemets doubles, virgule finale                                             |
| `prisma/schema.prisma` | Les dix tables du § 12 — n'y touchez pas                                                     |
| `core/types.ts`        | `Effect`, `DataClass`, `AdapterMode`, `PolicyLevel`, `ToolContext`, `ErrorCode`, `AppelStep` |
| `core/types.spec.ts`   | Le **motif de garde** à copier                                                               |
| `.env.example`         | Modèle de configuration, valeurs factices seulement                                          |

### Vérification `zod/v4` — faite, et voici le résultat

Le § 07 du cahier des charges annonce que `zod` expose le sous-chemin `zod/v4`,
où `z.toJSONSchema()` produit du JSON Schema draft 2020-12, **sans dépendance
nouvelle**. Vérifié le 2026-08-30 sur la version installée ici :

- `zod` **3.25.76** (la version d'Axion-IA — épinglée à l'identique pour que le
  manifeste de l'adaptateur fédéré, produit dans l'autre dépôt, porte **le même
  SHA** que celui qu'attend `adapters.lock.json`) ;
- `node_modules/zod/package.json` déclare bien les sous-chemins
  `./v3 ./v4 ./v4-mini ./v4/mini ./v4/core` ;
- `typeof z.toJSONSchema === "function"` ;
- sur `z.object({ … }).strict()`, la sortie porte
  `"$schema": "https://json-schema.org/draft/2020-12/schema"` **et**
  `"additionalProperties": false` — donc le schéma **fermé** exigé par le § 09
  traverse le fil sans perte.

**Conclusion : aucune dépendance de conversion à ajouter.**

---

## Écarts relevés dans le cahier des charges

Trois points où le CDC se contredit ou laisse un trou. Ils sont laissés
**visibles** dans le code plutôt que bouchés en silence.

1. **`destructive` : scope ou effect ?** Le § 19.2 le range dans le tableau des
   _scopes_ ; le § 09 énumère `ctx.scopes` en **cinq** valeurs, sans lui.
   `core/types.ts` le traite comme un **`Effect`** — ce qu'il est déjà dans
   `EFFECTS` — et `OPS_SCOPES` en compte cinq. La règle du § 19.2 (« assujetti à
   `ops:send` **et** à une confirmation systématique, à tous les niveaux,
   `libre` compris ») reste vraie et s'applique dans `core/policy`.

2. **L'étape 5 n'a aucun code d'erreur.** Le § 11 lui donne un `403` ; le § 15
   n'énumère **aucun** code pour un scope insuffisant. `APPEL_STEPS[4].refus`
   vaut donc `null` et `statutHttp` vaut `403`. Le trou est visible, pas comblé
   par un code voisin qui mentirait sur la cause.

3. **`ops_tool` n'a pas où ranger tout le manifeste.** Le § 09 fait porter au
   manifeste `maxBytes`, `idempotency`, `pagination`, les annotations de
   `compaction` et `idFields` ; le § 12 ne nomme, pour `ops_tool`, ni l'un ni
   les autres. Le schéma s'en tient **strictement** au § 12. `core/registry`
   devra trancher : colonnes supplémentaires, ou manifeste épinglé conservé tel
   quel et relu. Sans l'un des deux, l'étape 14 (compaction) et le § 13.3 n'ont
   pas de source.

---

## Ce qui n'est pas encore posé

- **Lot 0a — les prérequis d'exploitation du § 16.** Ils se traitent hors de ce
  dépôt et ne sont pas décrits ici. Rien ne s'expose avant qu'ils soient remplis.
- **L'identifiant de ressource servant d'audience** (§ 19.1) : il se décide et
  s'écrit **avant le lot 1**. L'étape 3 de la chaîne d'appel n'a aucun sens
  sans lui. `.env.example` en porte l'emplacement, pas la valeur.
- **La révision courante de la spécification MCP** : à relire au lot 1. Ni le
  cahier des charges v6, ni celui du 29 août ne font autorité sur un numéro de
  révision.
- **Décision W-6** (§ 19 bis) : au nom de quel rôle console l'adaptateur agit-il ?
  Défaut retenu en l'absence de réponse : **le rôle le plus faible**, donc
  `peutVoirAppels: false` et coordonnées masquées.

---

## Ce dépôt est PUBLIC

Décision de Williams Jullin, 2026-08-30. Trois règles en découlent, et elles
tiennent quel que soit le contenu du code :

1. **La sécurité ne repose sur aucun secret de conception.** Tout ce qui protège
   le socle doit tenir alors qu'un attaquant lit le code. C'est déjà le parti pris
   du § 09 de la spécification — le rendre public le rend vérifiable, pas plus
   faible.
2. **Aucun identifiant d'infrastructure n'entre ici** : adresse IP, UUID
   d'application, sous-domaine, préfixe d'administration, nom d'hôte réel,
   identifiant de compte. Les exemples emploient l'hôte réservé `stub.invalid`
   (RFC 2606).
3. **Aucune description d'une faiblesse non corrigée.** Un dépôt ouvert qui
   raconte quelle porte est ouverte, et qu'elle l'est encore, transforme une
   documentation honnête en indication. Les prérequis d'exploitation se
   nomment ; leur état ne se publie pas.

Aucune donnée personnelle, sous aucune forme — ni dans le code, ni dans un test,
ni dans une fixture, ni dans un message de commit.
