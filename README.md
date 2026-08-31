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
│  ├─ identite/      la SESSION DE PILOTAGE — établie par le socle (ADR 0014)
│  ├─ instance/      le verrou MONO-INSTANCE, et la santé qu'il expose (ADR 0018)
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
├─ ops/                  chaîne d'intégration, healthcheck, exploitation
│  ├─ alertes.ts             la TABLE D'ALERTES du § 24 — huit lignes, plus l'écart d'épinglage
│  ├─ codes-hors-tableau.ts  les codes que le § 15 n'énumère pas, et leur motif écrit
│  └─ mono-instance.ts       l'observation du healthcheck : un SECOND socle est détectable
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

Onze points où le CDC se contredit, laisse un trou, ou dit moins que ce que ce
dépôt tient. Ils sont laissés **visibles** dans le code plutôt que bouchés en
silence. Les points 4 et 5 ont été tranchés au **lot 1b** (ADR 0005), les
points 6 à 9 au **lot 1c** (ADR 0014 à 0018), le point 11 au **lot 1d**, les
points 2 et 10 au **lot 1c**
également ; l'écart avec le document, lui, subsiste et reste écrit.

⚠️ **Un écart peut être justifié ; il ne peut pas être MUET.**
`ops/codes-hors-tableau.ts` tient désormais la règle par une garde : tout code
présent dans `ERROR_CODES` et absent du tableau du § 15 doit porter, écrits, le §
qui exige le refus, les voisins écartés **avec ce que chacun mentirait**, et
l'ADR. Un quinzième code ajouté sans cela fait rougir le dépôt le jour même — pas
au prochain audit.

1. **`destructive` : scope ou effect ?** Le § 19.2 le range dans le tableau des
   _scopes_ ; le § 09 énumère `ctx.scopes` en **cinq** valeurs, sans lui.
   `core/types.ts` le traite comme un **`Effect`** — ce qu'il est déjà dans
   `EFFECTS` — et `OPS_SCOPES` en compte cinq. La règle du § 19.2 (« assujetti à
   `ops:send` **et** à une confirmation systématique, à tous les niveaux,
   `libre` compris ») reste vraie et s'applique dans `core/policy`.

2. **L'étape 5 n'avait aucun code d'erreur — `scope_insufficient` est ajouté ici.**
   Le § 11 lui donne un `403` ; le § 15 n'énumère **aucun** code pour un scope
   insuffisant. Les **trois** refus de `core/chaine/etape-05-scopes.ts` — jeton
   sur-privilégié, correspondance mal câblée, scope manquant — sortaient tous
   avec `code: null` : le comptage du § 24 ne pouvait pas séparer une **attaque**
   d'un **socle mal câblé**, alors que le § 15 (troisième règle) fonde sur ce
   comptage la détection d'une injection à demi réussie. Aucun voisin ne
   convenait : `unauthenticated` ferait se ré-authentifier un jeton parfaitement
   valide, `policy_denied` parlerait d'un garde-fou que personne n'a consulté —
   la politique est à l'étape 10 —, `tool_disabled` enverrait chercher un
   interrupteur pour un outil actif. Même geste qu'au lot 1b pour `vault_locked`
   (ADR 0005) : nommer le code manquant. **`ERROR_CODES` en porte donc quinze.**

   ✅ **Branché par la Recette du lot 1c.** `APPEL_STEPS[5].refus` vaut
   `scope_insufficient`, et les refus de l'étape le rendent — **mesuré, pas
   déduit** : la garde d'`ops/codes-hors-tableau.spec.ts` fait refuser l'étape
   sur ses **quatre branches** (les trois causes de l'en-tête, dont l'une a deux
   branches) et LIT le code rendu, au lieu de relire le tableau. Le module de
   l'étape n'a pas bougé d'une ligne : `refuse()` LIT le code dans l'ancrage,
   ce que `core/chaine/etapes.ts` existe pour tenir. Le `403` du § 11 est
   inchangé — le code nomme la cause, il ne remplace pas le statut.
   L'`it.fails` qui portait l'attente a basculé en `it()` du même geste ; il
   n'a été ni supprimé ni affaibli, et `enAttenteDeBranchement` est désormais
   **vide** pour les deux écarts assumés.

3. **`ops_tool` n'a pas où ranger tout le manifeste.** Le § 09 fait porter au
   manifeste `maxBytes`, `idempotency`, `pagination`, les annotations de
   `compaction` et `idFields` ; le § 12 ne nomme, pour `ops_tool`, ni l'un ni
   les autres. Le schéma s'en tient **strictement** au § 12. `core/registry`
   devra trancher : colonnes supplémentaires, ou manifeste épinglé conservé tel
   quel et relu. Sans l'un des deux, l'étape 14 (compaction) et le § 13.3 n'ont
   pas de source.

4. **`vault_locked` n'est pas au § 15 — il y est ajouté ici.** Le § 23 exige que
   **tout appel d'outil soit refusé** coffre verrouillé, et le § 32 en fait un
   critère de recette du lot 1 ; le tableau du § 15 n'énumère que treize codes.
   `ERROR_CODES` en porte **quatorze**. Les deux voisins possibles mentiraient :
   `internal` ne dit pas quoi faire ensuite, `upstream_unavailable` accuse un
   adaptateur parfaitement joignable. Voir **ADR 0005**.

5. **Ce refus n'est aucune des quatorze étapes du § 11 : il les précède.**
   L'outil existe, il est activé, il est au profil — c'est le socle qui ne peut
   rien déchiffrer. Sans numéro, `ops_audit.stepDenied` reste nul et la ligne
   devient indiscernable d'une exception, ce qui vide la métrique du § 24 après
   **chaque déploiement** (le repli du § 23 fait démarrer verrouillé). D'où
   l'**étape 0** dans `APPEL_STEPS`, et `AppelStep = 0 | 1 | … | 14`. Voir
   **ADR 0005**.

6. **Le § 12 ne dit pas d'où vient le `sessionId`.** Il donne la colonne à
   `ops_audit` et le § 11 en fait un « état de pilotage », sans dire **qui
   l'établit**. Toute la garde du § 20 s'y ancre pourtant : un appelant qui la
   renouvelle entre deux appels l'annule. Ce dépôt tranche — elle est établie par
   le socle, portée par `ops_token` (colonne que le § 12 ne nomme pas), et frappée
   par exécution du démon en stdio. Voir **ADR 0014**.

7. **Le § 09 ne dit pas de quel CÔTÉ `idFields` s'applique.** L'étape 11 le
   lisait côté **entrée** (pour exonérer un champ de la surveillance du § 20) ;
   le § 12 le décrit côté **sortie** (`recordIds`). Les deux lectures ne peuvent
   pas être vraies ensemble, et la première désarmait la garde d'exfiltration
   depuis un manifeste. Ce dépôt tranche pour la sortie : à l'entrée, seul le
   schéma referme un champ. Voir **ADR 0015**.

8. **Le § 09 ne nomme pas `governanceFields`.** Le § 20 exige que les arguments
   de gouvernance ne proviennent jamais d'un contenu lu, sans donner au socle le
   moyen de les connaître : la reconnaissance par le nom laissait échapper 9 noms
   sur 20 confrontés. Le contrat d'adaptateur porte donc **un champ de plus que
   le document**, et il ne peut que RESSERRER. Voir **ADR 0016**.

9. **Le CDC ne dit nulle part que le socle est mono-instance.** Le § 23 décrit
   **un** conteneur — ce qui n'est pas une interdiction d'en lancer deux. Or
   l'index de provenance du § 20 est local au processus : deux instances
   appliqueraient la garde une fois sur deux, sans qu'aucun compte ne le dise. Ce
   dépôt pose donc une contrainte que le document ne pose pas. Voir **ADR 0018**
   et la section ci-dessous.

10. **L'écart d'épinglage n'a aucune ligne dans la table d'alertes du § 24.** Le
    § 20 prescrit **nommément** d'alerter — « tout écart entre la valeur épinglée
    et la valeur reçue désactive l'outil **et alerte**, au lieu de mettre à jour
    en silence ». La table du § 24 énumère **huit** événements, et aucun n'est
    celui-là : le niveau de cette alerte n'était fixé par rien, et **une alerte
    sans niveau n'est routée nulle part** — le canal du § 24 trie sur le niveau.
    L'alerte la plus importante du § 20 aurait donc été émise, puis jetée.
    `ops/alertes.ts` pose la table du socle : les huit lignes du document, **plus
    une neuvième**, au niveau `critique` — retenu par **voisinage** avec
    « vérification de chaîne du journal en échec », parce que les deux disent
    qu'une valeur qui **fait foi** ne correspond plus à ce qu'on reçoit, et
    appellent le même geste : ne plus croire la source avant de l'avoir relue.
    C'est une décision de ce dépôt, pas une lecture du § 24.

    ⚠️ La clé et le niveau de cette neuvième ligne **dérivent** du type
    `AlerteEpinglage` porté par `core/chaine/etape-06-outil.ts`, qui émet
    l'alerte : si le module émetteur renomme son genre ou change son niveau, la
    table **ne compile plus**. Deux sources de vérité qui divergent en silence
    sont exactement le mode de panne que la règle d'épinglage combat par
    ailleurs.

    ⚠️ La **septième** ligne du § 24 en colle deux — « adaptateur injoignable

    > 5 min · journal vide alors qu'une génération de coffre est attendue » — sur
    > une seule ligne, à un seul niveau. Ce sont deux événements sans rapport, qui
    > ne se diagnostiquent pas du même geste. Elle est conservée telle quelle : le
    > document en compte huit, et les séparer est une décision à prendre, pas un
    > nettoyage à faire en passant.

11. **Le § 12 donne à `ops_audit` une colonne `sessionId` non nulle, et le
    journal porte des lignes qui n'ont AUCUNE session.** Toute la prose du § 12
    décrit une ligne d'appel ; or deux familles de lignes ne sont pas des appels
    et doivent pourtant s'enchaîner dans le même journal scellé — la **clôture de
    purge** (§ 31), écrite aujourd'hui, et la **ligne d'intention** (ADR 0022),
    écrite demain. Elles n'ont pas d'appelant, pas de pilotage, pas de session,
    et la colonne ne se laisse pas vider. Ce dépôt tranche par une **valeur
    réservée**, `SESSION_HORS_APPEL` (`core/audit/vocabulaire.ts`), dont la forme
    est disjointe de celle qu'une vraie session peut prendre : le type marqué
    `SessionId` de l'**ADR 0014** descend jusqu'à `ContenuLigne`, et il n'y a
    donc pas moyen d'écrire une ligne sans avoir DÉCIDÉ laquelle des deux
    populations elle rejoint.

    ⚠️ **LA VALEUR RÉSERVÉE DIT « CETTE LIGNE N'A PAS DE SESSION », PAS « CETTE
    LIGNE N'EST PAS UN APPEL ».** Les deux phrases se confondent aujourd'hui, et
    elles cesseront de se confondre à l'ADR 0022 : la ligne d'intention **EST**
    un appel en vol, avec une vraie session. Le prédicat qui trie les deux
    familles doit donc rester dérivé de `NOMS_RESERVES_AU_SOCLE` — le nom de
    l'outil — et ne jamais employer la valeur de session comme critère. Deux
    dérivations d'un même fait finissent toujours par se contredire ; celle-ci a
    son contre-exemple déjà écrit.

---

## Le socle est MONO-INSTANCE — et ce n'est pas une préférence

**Une seule instance du socle tourne à la fois.** Ce n'est ni une simplification
de départ, ni une question de coût : c'est une **condition de validité de la
garde d'exfiltration du § 20**.

L'index de provenance vit **en mémoire du processus** — le § 20 l'exige, et le
§ 31 interdit qu'il soit persisté. Deux instances derrière un répartiteur ne
partagent donc pas leurs marques : une session marquée par une lecture
`personal` sur l'instance A arrive **propre** sur l'instance B, l'étape 11 laisse
passer, et **rien ne le signale**. La garde s'appliquerait une fois sur deux, en
restant verte.

Deux gardes tiennent la contrainte (`core/instance/`) :

- **au démarrage** — un verrou exclusif ; s'il est déjà tenu, le conteneur **ne
  démarre pas**, comme pour un coffre absent (§ 23) ;
- **en continu** — le healthcheck relit le verrou à chaque appel et rend **503**
  dès qu'il n'est plus tenu, à côté du nombre d'extraits indexés qu'exige déjà le
  § 20.

Une troisième la tient **du dehors** (`ops/mono-instance.ts`), et elle ne
remplace pas les deux autres : le verrou vit **dans le processus qu'on
soupçonne**. Un socle mal déployé, ou dont le magasin de verrous a été neutralisé,
ne se dénoncera pas lui-même. L'observateur, lui, ne lit que ce que le
healthcheck **expose** — l'identifiant d'instance et le nombre d'extraits — et
confronte une série de lectures :

| Ce qu'il regarde                                     | Ce qu'un écart signifie                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Deux fenêtres de vie qui **se chevauchent**          | deux socles ont servi en même temps ; le § 20 ne s'applique qu'à celui qui a servi l'appel |
| Les deux annoncent le verrou **`tenu`**              | le verrou lui-même a accordé deux fois — redémarrer une instance n'y changerait rien       |
| Statut ≠ état du verrou (dérivé du socle)            | un `200` sans verrou tenu : la garde est peut-être déjà à moitié muette, et rien ne le dit |
| Identifiant hors forme (32 hexadécimaux)             | une sortie bricolée — et un `pid`, un hôte ou une adresse n'entrent pas ici (§ 29)         |
| Le même identifiant sous **deux dates de démarrage** | deux exécutions devenues indiscernables : la détection est aveugle sans qu'un compte bouge |
| Moins de deux lectures                               | `rien-mesuré` — un collecteur en panne ressemble en tout point à un socle sain             |

> ⚠️ **CE QU'IL DÉTECTE, ET CE QU'IL NE PROUVE PAS.** Il détecte une **seconde
> instance** ; il ne prouve **jamais** qu'il n'y en a pas. Un répartiteur peut
> servir toutes les lectures depuis la même instance pendant qu'une seconde sert
> le trafic. C'est pourquoi sa conclusion s'appelle `aucune-seconde-instance-vue`
> et non « conforme » — et pourquoi la borne voyage **dans le verdict lui-même**,
> et pas seulement dans un commentaire.

> ⚠️ **SI LE SOCLE PASSE UN JOUR À DEUX INSTANCES, LE § 20 EST À ROUVRIR AVANT.**
> Pas après. Un réplica ajouté sans cela vide la garde en silence, et le seul
> signal serait un index qui reste petit pendant que le trafic monte —
> c'est-à-dire un signal que personne ne regarde.

Deux conséquences d'exploitation, à connaître **avant** de régler l'hébergeur :

- **une seule réplique**, jamais deux (`REPLIQUES_ADMISES`). ⚠️ Aucun manifeste
  de déploiement ne vit dans ce dépôt : le réglage se fait dans l'interface de
  l'hébergeur, et **rien ici ne peut le lire**. La règle est donc écrite, et
  confrontée à une valeur **relevée à la main** — ce qui est une garde plus
  faible qu'une lecture, et l'est **volontairement** plutôt qu'en silence ;
- **pas de déploiement en recouvrement.** L'ancienne instance doit avoir rendu le
  verrou avant que la nouvelle ne le prenne.

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
