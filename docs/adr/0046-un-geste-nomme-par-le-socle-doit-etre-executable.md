# ADR 0046 — Un geste que le socle nomme doit être exécutable

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `package.json` (scripts), `ops/vault-init.ts`,
  `ops/vault-init.spec.ts`, `ops/gestes-nommes.ts`, `ops/gestes-nommes.spec.ts`,
  `prisma/migrations/`
- **Sources** : cahier des charges v6, § 23 (les trois états du coffre), § 25
  (séquestrer la clé avant de la poser ; runbook « le socle refuse de démarrer :
  **le message nomme la commande** »), § 12 (les dix tables) ; ADR 0002 (le
  journal en ajout seul) ; ADR 0045 (la migration initiale et le chaînage) ;
  ADR 0041 (une décision n'est fermée que si une assertion la voit)

---

## Le fait, mesuré

**Deux gestes étaient nommés par le dépôt, et aucun des deux n'était faisable.**

1. `core/vault/demarrage.ts:65` exporte
   `COMMANDE_DE_PROVISION = "pnpm ops:vault:init"`. Le socle **refuse de
   démarrer** sur un coffre absent en nommant cette commande, mot pour mot, dans
   son message de refus. `package.json` ne déclarait **aucun script de ce nom** :
   la commande tapée rendait `command not found`. Le fichier le disait
   lui-même — « ⚠️ Ce script n'existe PAS encore » — dans un commentaire que
   personne ne lit au moment où il servirait : **au milieu d'un incident, le
   socle à terre**, puisque c'est le seul état où ce message paraît.
2. `prisma/sql/0001-ops-audit-append-only.sql` se déclare lui-même « s'applique
   APRÈS `prisma migrate deploy` ». **Il n'y avait rien après quoi s'appliquer**
   (ADR 0045) : `prisma/migrations/` n'existait pas.

> **Un message qui nomme un geste introuvable est pire qu'un message vague.** Un
> message vague fait chercher. Un message précis et faux fait chercher **au
> mauvais endroit, avec confiance**.

Ce sont deux instances du même défaut, et c'est pourquoi une seule ADR les porte.

## Décision 1 — le provisionnement existe, et il regarde l'état AVANT la clé

`ops/vault-init.ts` fait quatre choses, **dans cet ordre** :

1. il constate l'état du coffre **avant tout geste** et **refuse si le coffre
   existe déjà** ;
2. il vérifie qu'une clé est fournie, et refuse en **nommant la variable** ;
3. il pose le sceau ;
4. il dit ce qu'il a fait — la source, l'état avant, l'état après, le `keyId`.

**L'ordre des deux premiers contrôles EST la décision.** L'inverse donnerait, sur
un coffre déjà créé dont la clé a été oubliée, le message « pose une clé » —
c'est-à-dire **l'invitation exacte à provisionner par-dessus**, ce qui poserait
un sceau neuf sur des lignes qu'aucune clé n'ouvrirait plus. Le seul remède
serait une restauration.

`Coffre.provisionner()` refusait déjà, par sa table de transitions. Ce programme
refuse **avant**, pour que le message parle du coffre et non d'un geste interdit.

Les trois refus sont **nommés**, jamais réduits à un code de sortie :
`coffre-déjà-créé`, `clé-absente`, `sceau-non-posé`. « 1 » se lit « ça n'a pas
marché » ; `coffre-déjà-créé` se lit « surtout ne recommence pas ». Les deux
situations appellent des gestes **opposés**.

## Décision 2 — il ne génère PAS la clé, et c'est une décision

Le § 25 exige que la clé soit **séquestrée hors machine AVANT** d'être posée, sur
le modèle déjà en service (« seule la clé publique est sur le VPS, la clé privée
reste hors système, 1Password + papier »).

**Un outil qui génère la clé invite à sauter le séquestre** : elle naît dans le
terminal, le coffre s'ouvre, tout marche — et la sauvegarde hors machine est
indéchiffrable **le seul jour où elle sert**. Le programme dit donc comment en
produire une (`openssl rand -base64 32`) et refuse tant qu'elle n'est pas là.

C'est une **absence**, et aucune exécution ne prouve une absence : la garde lit
le **source** de `ops/vault-init.ts` et confronte six formes de génération d'aléa
(`randomBytes`, `randomFillSync`, `generateKeySync`, `getRandomValues`,
`randomUUID`, `Math.random`). Elle exige aussi que le fichier **dise où** en
produire une — une interdiction sans issue est un mur nu.

**Aucune valeur de clé ne sort du programme.** Le rapport porte le `keyId` (un
SHA-256 tronqué, qui ne s'inverse pas) et le **nom** de la source. Ce dépôt est
public, et la sortie d'un provisionnement se colle dans un ticket.

## Décision 3 — la répétition, parce qu'un geste qu'on ne peut pas répéter s'apprend en incident

`pnpm ops:vault:init --repetition` fait tourner les quatre gestes sur un dépôt
**jetable, en mémoire**, et le rapport porte `repetition: true` pour que personne
ne lise « sceau posé » comme « sceau posé **en base** ».

Ce n'est pas un confort de développement. C'est le **seul mode que ce dépôt peut
exécuter aujourd'hui** — aucune base n'y tourne — et il répond à la question qui
coûte le plus cher : « ma clé est-elle bien formée ? ». Elle se pose **avant** de
toucher la base, pas pendant l'incident.

Deux scripts sont déclarés, parce que deux chemins existent réellement :
`ops:vault:init` (`tsx ops/vault-init.ts`, depuis les sources) et
`ops:vault:init:dist` (`node dist/ops/vault-init.js`, dans une image construite
sans les dépendances de développement). Le message du socle nomme le premier,
et c'est celui que la garde confronte.

## Décision 4 — la garde qui manquait : chaque commande nommée est confrontée

`verifierLesCommandesNommees` (`ops/gestes-nommes.ts`) est une **fonction pure**
d'un ensemble de fichiers et d'une liste de scripts. Elle :

- retire les commentaires (`sansProse`) **avant** toute recherche — ce dépôt écrit
  `pnpm build` et `pnpm typecheck` dans une dizaine de blocs de documentation, et
  les compter ferait d'elle une lectrice de commentaires. Ce qu'on cherche est ce
  qu'un **utilisateur** verra : un littéral d'un message rendu par le socle ;
- **dérive** la liste des scripts de `package.json`, jamais recopiée ;
- **annonce ses comptes** — modules balayés, scripts déclarés, occurrences,
  commandes distinctes, introuvables ;
- **écrit sa borne avec la règle** : une commande composée à l'exécution
  (`pnpm ${…}`) ne peut pas être confrontée sans faire tourner le programme.
  Elles sont donc **comptées à part**, jamais silencieusement ignorées.

Trois verbes de `pnpm` sont écartés (`exec`, `run`, `dlx`) parce qu'ils prennent
un sous-argument. **La liste est délibérément courte** : si un message venait à
nommer `pnpm install`, la garde **rougirait** au lieu de laisser passer, et
quelqu'un trancherait. Une liste plus large aurait le défaut inverse.

## Décision 5 — la migration initiale entre au dépôt, et le chaînage est ÉCRIT

`prisma/migrations/20260901120000_socle_initial/migration.sql` porte les **dix
tables du § 12**, produites **hors ligne** par
`prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
--script`. `--from-empty` ne se connecte à rien : il compare le vide au modèle
déclaré. Le `DATABASE_URL` que la ligne de commande exige est l'URL stub de la
chaîne d'intégration (`stub.invalid`, RFC 2606), qui ne résout nulle part.

**Le fichier n'a pas été appliqué. Aucune base ne tourne dans ce dépôt.**

Le chaînage est écrit dans `package.json`, pas convenu oralement :

```
"db:deploy": "prisma migrate deploy && prisma db execute --schema prisma/schema.prisma --file prisma/sql/0001-ops-audit-append-only.sql"
```

`prisma db execute` plutôt que `psql` : il lit l'adresse dans le schéma, ne
demande aucun client externe, et ne dépend d'aucune expansion de variable par le
shell — un `"$DATABASE_URL"` dans un script npm ne s'expanse pas sous `cmd.exe`.

**Ce script tourne sous le rôle de MIGRATION**, propriétaire des tables, jamais
sous le rôle de connexion de l'application : c'est l'exigence que le script
d'ajout seul écrit lui-même (« le rôle de connexion de l'application NE DOIT PAS
être propriétaire d'`ops_audit` »).

`verifierLaChaineDeMigration` rougit dans **cinq sens**, et le cinquième est
celui qui manquait : aucune migration · une table du schéma qu'aucune migration
ne crée · le moteur non fixé par `migration_lock.toml` · le script d'ajout seul
absent · **l'ordre non écrit**. Les tables attendues sont **dérivées des `@@map`
du schéma** : écrire ici les dix noms du § 12 ferait de la garde une seconde
source de vérité, verte le jour où une onzième table entre au schéma.

## Ce que ces gardes ne prouvent pas, écrit avec elles

Elles lisent des **formes**. Elles ne se connectent à aucune base, ne jouent
aucune migration, ne lancent aucun script. Elles ne peuvent donc pas dire que le
cluster applique ce que le script **dit** — cette preuve-là exige une base, et
les deux requêtes qui la fourniraient sont écrites en clair à la fin de
`prisma/sql/0001-ops-audit-append-only.sql`.

Et cette ADR **ne rend pas le socle déployable** : le rôle de connexion, la
sauvegarde et la restauration éprouvée vivent hors de ce dépôt public et n'y
entreront jamais.

## Les deux états, transcrits

**ROUGE**, avant toute correction — `prisma/migrations/` mis de côté,
`package.json` inchangé :

```
[A] 141 module(s) de production balayé(s) · 11 script(s) déclaré(s) ·
    3 occurrence(s) de « pnpm <mot> » · 2 commande(s) composée(s) à l'exécution
    (non confrontables) · 3 commande(s) distincte(s) confrontée(s), dont
    1 DÉCLARÉE [prisma:generate] · 2 INTROUVABLE(S)
    [ops:vault:init @ core/vault/demarrage.ts, db:deploy @ ops/vault-init.ts]
[B] 0 migration(s) [aucune] · moteur « NON FIXÉ » · 10 table(s) dérivée(s) des
    @@map du schéma · 0 créée(s) · 10 manquante(s) · « prisma migrate deploy » en
    position -1, le script d'ajout seul en position -1 · ordre écrit : false ·
    4 anomalie(s)
Tests  3 failed | 3 passed (6)
```

**VERT**, après :

```
[A] 141 module(s) de production balayé(s) · 14 script(s) déclaré(s) ·
    3 occurrence(s) · 2 commande(s) composée(s) à l'exécution (non confrontables) ·
    3 commande(s) distincte(s) confrontée(s), dont 3 DÉCLARÉES
    [db:deploy, ops:vault:init, prisma:generate] · 0 INTROUVABLE(S)
[B] 1 migration(s) [20260901120000_socle_initial] · moteur « postgresql » ·
    10 table(s) dérivée(s) des @@map · 10 créée(s) · 0 manquante(s) ·
    « prisma migrate deploy » en position 0, le script d'ajout seul en position 80 ·
    ordre écrit : true · 0 anomalie(s)
```

> Le dénominateur de `[A]` bouge d'un lot à l'autre — 138, puis 140, puis 141
> modules de production, trois autres constructeurs travaillant en même temps.
> **C'est la raison pour laquelle la garde l'annonce au lieu de l'écrire ici** :
> ce bloc est une transcription datée, le compte vivant sort à chaque exécution.

**Et les gardes savent rougir**, mutation par mutation, transcrites :

- l'ordre des deux contrôles inversé (`etatAvant !== "absent"` →
  `etatAvant === "ouvert"`) : « refuse un coffre DÉJÀ CRÉÉ avant même de regarder
  la clé » rougit — `expected 'sceau-non-posé' to be 'coffre-déjà-créé'` ;
- la mention `openssl rand -base64 32` retirée : « ne fabrique AUCUNE clé »
  rougit ;
- cinq états fabriqués de la chaîne de migration : **une anomalie chacun**, et
  deux pour « aucune migration » — inséparable, puisque retirer les migrations
  retire du même geste les tables qu'elles créaient. Le compte attendu est écrit
  par cas plutôt que relâché à « au moins une », faute de quoi un cas serait vert
  en rougissant pour la raison du **voisin**.
