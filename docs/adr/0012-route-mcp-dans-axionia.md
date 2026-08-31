# ADR 0012 — La route `/api/mcp` dans Axion-IA : les gardes qu'elle rencontre

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin
- **Portée** : lot 4a — travaux préalables dans le dépôt voisin `axionia`.
  Fichier à créer : `src/app/api/mcp/route.ts`. Répertoire à créer :
  `src/server/mcp/`. Aucun fichier du socle n'est concerné.
- **Sources** : cahier des charges v6, § 08 (branchements), § 09 (contrat
  d'adaptateur), § 11 (protocole), § 28 (adaptateur Axion-IA), § 32 (recette,
  lot 4a) ; et la **lecture directe** des fichiers d'`axionia` cités ci-dessous.

---

## Ce que ce document est, et ce qu'il n'est pas

C'est un **relevé de lecture**. Rien n'a été modifié dans `axionia` : le dépôt
voisin est en lecture seule tant que Will n'a pas été prévenu. Les deux gardes
ont été **exécutées** — `tsx` ne fait qu'écrire sur la sortie standard — et
`git status --porcelain` est ressorti vide juste après. Les chiffres ci-dessous
sont donc mesurés, pas déduits.

Son objet : permettre d'écrire le lot 4a **sans redécouvrir un seul de ces
faits**, et sans découvrir une garde rouge après coup.

### Mesures de référence, à reprendre comme point de comparaison

| Mesure                                 | Valeur au 2026-08-31                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Fichiers suivis par git dans `axionia` | **11 349**                                                                                        |
| `qualiopi:isolation-check`             | **vert** — 11 349 fichiers scannés, 0 violation, **54** consommateurs assumés, tous encore actifs |
| `admin-nav:routes-check`               | **vert** — **162** routes internes résolues, **1** lien externe valide                            |
| `src/server/mcp/`                      | **n'existe pas**                                                                                  |
| Occurrences de « mcp » dans `src/`     | uniquement du **contenu éditorial** (glossaire, base de connaissances) — aucun code               |

> Ces deux gardes sont des étapes du job `gate-a` de `.github/workflows/ci.yml`
> (lignes 162-163 et 130-131). `gate-a` est un contexte **exigé** par la
> protection de `main`. Elles bloquent réellement.

---

## Décision

Le lot 4a pose **six** gestes, dans cet ordre, et **chacun se prouve par un
témoin fabriqué** — un défaut introduit exprès, qui doit faire rougir la garde,
puis retiré. Une garde qu'on modifie sans la voir rougir une fois n'a plus de
valeur connue.

| #   | Garde rencontrée                       | Ce qu'il faut faire                                                       | Témoin qui prouve qu'elle mord encore                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A   | `src/proxy.ts` — nommage de la route   | La route s'appelle **`/api/mcp`**, jamais `/mcp`                          | `POST /mcp` doit rendre **301** vers `/fr/mcp`                        |
| B   | `authorized()` de `src/auth.config.ts` | Écrire la garde **dans le handler** — rien ne la porte à l'extérieur      | Un appel sans secret rend 401, mesuré depuis un autre réseau          |
| C   | `qualiopi:isolation-check`             | Ajouter chaque fichier **nominativement** à `CONSOMMATEURS_ASSUMES`       | Un fichier témoin sous `src/server/mcp/`, **`git add`é**, fait rougir |
| D   | `admin-nav:routes-check`               | L'élargir — et il faut d'abord savoir **ce qu'il sait faire aujourd'hui** | Une entrée de nav sans `page.tsx` ; et 11 entrées `external`          |
| E   | `content-gen:isolation-check`          | **Ne jamais écrire la chaîne `content-gen`** dans le nouveau fichier      | Écrire la chaîne en commentaire → doit rougir                         |
| F   | Le stub `stub.invalid`                 | Early-exit **en tête de handler**, avant tout appel Prisma                | `DATABASE_URL` stub → la route répond sans toucher la base            |
| G   | `bundle:check` (gate B, **bloquante**) | Mesurer le delta et l'écrire dans la PR                                   | — (voir § I, ce que cette gate ne promet pas)                         |

---

## § A — Le nom de la route se décide au proxy, et il est déjà décidé

Deux faits mesurés dans `src/proxy.ts`, tous deux confirmés par la lecture.

### A.1 — Le matcher exclut `api/`

`src/proxy.ts:503` — le motif unique du `matcher` commence par :

```
"/((?!api/|widget/|qr/|maintenance|_next/static|_next/image|favicon\\.ico|sitemap|…"
```

La négation porte sur ce qui suit le `/` de tête. Pour `/api/mcp`, le reste est
`api/mcp`, qui commence par `api/` : le lookahead échoue, **la requête n'est
jamais remise au proxy**. Ni le pipeline Auth.js, ni next-intl, ni la pose des
en-têtes CSP ne s'exécutent sur `/api/mcp`.

Ce n'est pas un accident : le commentaire de `src/proxy.ts:446-459` en donne
l'histoire — toutes les routes d'API sont montées à la racine, sans variante de
locale, et le middleware i18n les faisait toutes partir en 307 vers `/fr/api/*`.

### A.2 — `POST /mcp` à la racine est redirigé en 301

`src/proxy.ts:137-146`, règle « 0bis » :

```ts
const path = req.nextUrl.pathname;
const firstSeg = path.split("/")[1] ?? "";
const isLocalePrefixed = firstSeg === "fr" || firstSeg === "en";
const isRoot = path === "/" || path === "";
if (!isLocalePrefixed && !isRoot) {
  const dest = new URL(`/fr${path}${req.nextUrl.search}`, req.url);
  return NextResponse.redirect(dest, 301); // ← ligne 144
}
```

`/mcp` n'est ni préfixé par une locale, ni la racine, et **ne figure dans
aucune exclusion du matcher** — `maintenance`, `qr/`, `widget/` y sont écrits en
toutes lettres, `mcp` non. Il tombe donc dans 0bis : **301 vers `/fr/mcp`**, une
route qui n'existe pas.

**Conséquence à connaître** : un 301 sur un `POST` fait perdre le corps de la
requête chez la quasi-totalité des clients HTTP, qui rejouent en `GET`. Un
client MCP qui viserait `/mcp` n'obtiendrait donc pas une erreur lisible, mais
un 404 sur une requête devenue vide. C'est le pire des symptômes : il ne désigne
pas sa cause.

> **Partout : `/api/mcp`.** Ce n'est pas une préférence de style, c'est la seule
> forme qui atteint un handler.

**Témoin** : depuis un autre réseau, `curl -X POST -i https://<hôte>/mcp` doit
rendre **301** avec `location: /fr/mcp`. Si un jour il rend autre chose, c'est
que quelqu'un a ajouté `mcp` aux exclusions du matcher — et alors la garde du
§ B change de nature, il faut relire.

---

## § B — Aucune garde globale ne couvre cette route

`src/auth.config.ts:45-51` :

```ts
authorized({ auth, request }) {
  const { nextUrl, headers } = request;
  const isLoggedIn = !!auth?.user;
  const adminSegment = process.env.ADMIN_URL_PREFIX ?? "<valeur par défaut de dev>";
  const adminRegex = new RegExp(`^/(fr|en)/${adminSegment}(?:/|$)`);
  const isOnAdmin = adminRegex.test(nextUrl.pathname);
  if (!isOnAdmin) return true; // hors admin = laisse passer (public site)
```

Deux raisons cumulées, et il suffit de la première :

1. `authorized()` n'est invoqué que par le middleware, **sur les requêtes que le
   matcher retient** — et `api/` est exclu (§ A.1). Il ne s'exécute donc jamais
   sur une route d'API, quelle qu'elle soit.
2. Quand bien même il s'exécuterait : `isOnAdmin` ne teste que
   `^/(fr|en)/<préfixe admin>`, et `/api/mcp` ne matche pas — `return true`.

> **La garde s'écrit dans le handler, et nulle part ailleurs.** Il n'existe
> aucune couche au-dessus sur laquelle se reposer.

(La valeur par défaut du préfixe d'administration est écrite en clair à la ligne
48 du fichier d'origine. Elle n'est pas recopiée ici : ce dépôt est public.)

---

## § C — `qualiopi:isolation-check` : le cliquet nominatif

Fichier : `scripts/qualiopi/isolation-check.ts`, 441 lignes.

### C.1 — Comment la liste `CONSOMMATEURS_ASSUMES` fonctionne

C'est un **`ReadonlySet<string>` de chemins exacts** (lignes 144-290, 54 entrées
au 2026-08-31), et il joue dans **les deux sens** :

- **Sens 1 — laisser passer.** `main()`, lignes 381-384 : si un fichier hors
  zone porte une arête de dépendance vers le domaine, son chemin normalisé est
  cherché dans le Set ; s'il y est, il est marqué « utilisé » et la boucle
  continue. Sinon, ligne 385-388, c'est une violation.
- **Sens 2 — le cliquet.** Lignes 399-400 : en mode `all`, toute entrée du Set
  qui n'a **pas** été utilisée pendant le passage est déclarée **périmée**, et
  fait échouer le script au même titre qu'une violation (lignes 423-433).
  ⚠️ En mode `--staged`, ce contrôle est désactivé — la plupart des fichiers ne
  sont pas dans le lot examiné.

Le fichier écrit lui-même la règle de gouvernance, lignes 140-142 :

> « ⚠️ Cette liste doit RÉTRÉCIR, jamais grandir. `main()` échoue si une entrée
> n'importe plus rien : une exception périmée est une garde qu'on a desserrée
> pour rien. »

### C.2 — Ce qui se passe exactement si `src/server/mcp/` importe le domaine

Déroulé, ligne par ligne, pour un fichier `src/server/mcp/outils-qualiopi.ts`
contenant `import { listAlertes } from "@/server/qualiopi/alertes/alertes-service";` :

1. `main()` ligne 372 : `isPathAllowed("src/server/mcp/outils-qualiopi.ts")` —
   aucun des 40 motifs de `ALLOWED_PATTERNS` (lignes 44-111) ne couvre
   `src/server/mcp/`. Retourne `false`, on ne saute pas.
2. Ligne 375 : le fichier est **lu**.
3. `looksLikeQualiopi()` lignes 345-347 : le contenu est découpé en lignes ; on
   cherche une ligne qui satisfasse **deux** conditions à la fois —
   `EST_ARETE` (ligne 320 : `/\bfrom\s*["']|\brequire\s*\(|\bimport\s*\(/`)
   **et** l'un des dix `QUALIOPI_MARKERS` (lignes 298-309). La ligne d'import
   porte `from "` et `@/server/qualiopi/`. Les deux passent.
4. Ligne 381 : le chemin n'est pas dans `CONSOMMATEURS_ASSUMES`.
5. Ligne 385 : **violation**, avec la raison
   `"Importe le domaine qualiopi hors des zones dédiées (cloisonnement)."`
6. Ligne 435 : `process.exit(1)` → `gate-a` rouge → la PR ne peut pas entrer.

### C.3 — Le remède que le script prescrit lui-même

Lignes 413-419, mot pour mot :

> ```
>   Ce fichier importe le domaine Qualiopi depuis une surface qui ne le faisait pas.
>   Deux issues, et une seule est un choix :
>     · le code appartient au domaine  → le déplacer dans une zone dédiée ;
>     · la surface le consomme vraiment → l'ajouter à CONSOMMATEURS_ASSUMES
>       dans ce fichier, AVEC sa raison. Ce n'est pas une formalité : c'est la
>       trace qu'on a décidé d'élargir la surface qui dépend du domaine.
> ```

Pour le lot 4a, c'est la **seconde** issue : l'adaptateur consomme vraiment le
domaine — `qualiopi.conformite` s'appuie sur `listAlertes()` (§ 28 du cahier des
charges). Chaque fichier concerné entre **nominativement**, avec sa raison
écrite au-dessus, dans le style des 54 entrées existantes.

### C.4 — Pourquoi un motif de répertoire dans `ALLOWED_PATTERNS` est un blanc-seing

Le fichier le dit, lignes 132-138 :

> « On acte donc l'état réel — mais **nominativement, pas par répertoire**. Une
> exception par dossier serait un blanc-seing : le 50ᵉ consommateur entrerait
> sans que personne ne le voie. Ici, tout NOUVEAU fichier qui importe le
> domaine fait rougir la garde, y compris dans un dossier déjà représenté. »

Le **mécanisme** derrière cette phrase est à deux endroits, et il est brutal :

- `looksLikeQualiopi()`, ligne 329 : `if (isPathAllowed(normalized)) return false;`
- `main()`, ligne 372 : `if (isPathAllowed(f)) continue;` — le fichier n'est
  même **pas lu**.

Ajouter `/^src\/server\/mcp\//` à `ALLOWED_PATTERNS` ne « tolérerait » donc pas
un import : cela **retirerait tout le répertoire du champ d'observation**, pour
toujours, y compris les fichiers qui n'existent pas encore. Et — différence
décisive — un motif de répertoire **échappe au cliquet du sens 2** : seules les
entrées de `CONSOMMATEURS_ASSUMES` sont vérifiées comme périmées. Un motif de
répertoire ne périme jamais ; il ne rougit jamais ; il ne se retire jamais tout
seul. C'est exactement ce que le § 32 du cahier des charges interdit pour le
lot 4a.

### C.5 — Deux façons de contourner cette garde, à ne surtout pas emprunter

Les marqueurs de chemin sont **littéralement** `"@/server/qualiopi/"` et
`"@/server/actions/qualiopi/"` (lignes 307-308). La comparaison est un
`ligne.includes(m)`. Donc :

- **Un import relatif la rend muette.** `from "../../server/qualiopi/alertes/alertes-service"`
  ne contient pas la chaîne `@/server/qualiopi/`, et `listAlertes` n'est pas
  dans la liste des huit symboles marqués. L'arête existe, la garde ne la voit
  pas.
- **Un ré-export depuis une zone autorisée la rend muette aussi.** Un fichier
  logé sous un motif de `ALLOWED_PATTERNS` — par exemple `src/features/admin-qualiopi/`
  (ligne 69) — peut ré-exporter le symbole ; l'importer ensuite depuis
  `src/server/mcp/` ne fait apparaître aucun marqueur sur la ligne d'import.

> **Règle pour le lot 4a : écrire les imports sous la forme d'alias
> `@/server/qualiopi/…`, délibérément, pour que la garde VOIE l'arête** — et
> inscrire le fichier nominativement. Un import relatif « qui passe » n'est pas
> une garde satisfaite, c'est une garde évitée.

### C.6 — Le témoin fabriqué

Deux témoins, l'un pour chaque sens du cliquet.

**Témoin 1 — le sens « laisser passer » mord encore.**

1. Créer `src/server/mcp/_temoin-isolation.ts` contenant une seule ligne
   d'import en alias vers `@/server/qualiopi/…`.
2. **`git add` ce fichier.** ⚠️ Sans cela le témoin ne prouve rien :
   `listFiles()` (lignes 350-361) appelle `git ls-files`, qui **est aveugle aux
   fichiers non suivis**. Un témoin non ajouté produit un vert imaginaire.
3. Lancer `pnpm qualiopi:isolation-check`. Attendu :
   `❌ … 1 violation(s)` nommant le fichier, sortie **1**.
4. Supprimer le témoin.

**Témoin 2 — le cliquet des exceptions périmées mord encore.**

1. Ajouter au Set un chemin qui n'existe pas.
2. Lancer la garde. Attendu : `❌ … 1 exception(s) PÉRIMÉE(S)`, sortie **1**.
3. Retirer la ligne.

**Après les gestes réels du lot 4a**, la garde doit redevenir verte **et
annoncer un compte** : `N fichiers scannés, 0 violation, 54 + k consommateurs
assumés (tous encore actifs)`. Lire le compte, jamais la couleur : c'est la
seule preuve qu'elle a regardé quelque chose.

---

## § D — `admin-nav:routes-check` : ce qu'il fait, et ce qu'il ne fait pas

Script : `scripts/check-admin-nav-routes.ts` (118 lignes), déclaré
`package.json:96` (`tsx scripts/check-admin-nav-routes.ts`), appelé par
`ci.yml:130-131`.

### D.1 — Écart signalé : ce script n'a pas de marqueurs, et ne lit aucun import

Le mandat du lot 4a supposait des « marqueurs reposant sur des chaînes
d'import ». **La lecture ne le confirme pas.** Le script fonctionne autrement :

- il **importe** `buildAdminNav` (`ligne 17`) et l'appelle avec un préfixe
  factice (`ligne 20`, `ligne 60`) ;
- pour chaque entrée **interne**, il retire `/fr/<préfixe>` (lignes 23-26) puis
  descend l'arborescence réelle depuis `src/app/[locale]/(admin)/[adminPrefix]`
  (`routeExists`, lignes 32-58) en traitant les groupes `(x)` comme
  transparents et les segments `[x]` comme joker, jusqu'à trouver un `page.tsx` ;
- pour chaque entrée **externe**, il exige une URL absolue en `https://`
  (lignes 84-88).

Il ne cherche donc **aucune chaîne de caractères dans aucun fichier source**. La
question « un ré-export contourne-t-il les marqueurs ? » **ne s'applique pas à
ce script** — elle s'applique à `qualiopi:isolation-check`, dont les marqueurs
`@/server/qualiopi/` et `@/server/actions/qualiopi/` sont bien des chaînes
d'import, et la réponse est **oui** : voir § C.5, où les deux contournements
sont écrits.

Corollaire pour le lot 4a : **la garde d'aujourd'hui ne verra jamais un fichier
posé sous `src/server/mcp/`.** Le critère de recette (d) du § 32 — « un fichier
témoin sous `src/server/mcp/` fait rougir le balayage de nav » — décrit donc un
**contrôle à écrire**, pas un contrôle à déclencher.

### D.2 — Le contre-témoin déjà présent, à ne pas casser

Lignes 93-99 : si `internes.length < items.length - 10`, le script échoue avec
« beaucoup trop [d'entrées `external`] : cette garde ne vérifierait plus rien ».
C'est un garde-fou contre le vert obtenu en ne regardant rien. Mesuré : **162
internes, 1 externe, 163 entrées** — le seuil se déclenche à partir de
**11 entrées `external`**.

### D.3 — Ce que « l'élargir » doit vouloir dire, au minimum

Proposition, à confirmer avec Will avant d'écrire le lot 4a (voir
« Incertitudes ») : **réutiliser `routeExists()`, ne pas la recopier**, et
ajouter au script un second balayage qui lit les déclarations d'outils sous
`src/server/mcp/` et exige que toute route d'administration qu'un outil nomme
résolve vers un `page.tsx` réel — puis **annonce le nombre de fichiers d'outils
lus**, à côté du « 162 routes internes résolues » actuel.

Deux exigences non négociables sur cet élargissement :

- **il annonce son dénominateur.** Ce dépôt a déjà payé six gardes vertes parce
  qu'elles ne regardaient rien. Un balayage qui trouve zéro fichier doit le
  dire, et une garde à zéro élément doit se voir ;
- **il dérive, il ne recopie pas.** La liste des routes vient de
  `buildAdminNav()` et du disque, jamais d'une liste écrite dans le script.

### D.4 — Les témoins fabriqués

**Témoin a — la garde actuelle mord toujours sur une route absente.** Ajouter à
`buildAdminNav()` une entrée interne pointant vers un segment sans `page.tsx`.
Attendu : `❌ [admin-nav:routes] 1 entrée(s) sans route :` + la ligne, sortie 1.
Retirer.

**Témoin b — le contre-témoin de comptage mord toujours.** Marquer 11 entrées
`external: true`. Attendu : le message « beaucoup trop », sortie 1. Retirer.

**Témoin c — l'élargissement mord.** Poser un fichier d'outil sous
`src/server/mcp/` nommant une route d'administration inexistante ; le nouveau
balayage doit le nommer et sortir en 1. Le retirer, et vérifier que le compte
annoncé de fichiers lus **redescend de un** : c'est ce qui prouve que le
balayage lisait bien ce fichier, et pas un autre.

---

## § E — Le piège `content-gen` : une garde qui marque sur une MENTION

Sur les trois checks d'isolation câblés dans `gate-a`, deux ont été corrigés le
2026-08-24 pour ne marquer que sur une **arête de dépendance** — `qualiopi`
(ligne 347) et `image-bank` (ligne 237 de son script). **Le troisième non.**

`scripts/content-gen/isolation-check.ts:591` :

```ts
return CONTENT_GEN_MARKERS.some((m) => content.includes(m));
```

Et `CONTENT_GEN_MARKERS` (lignes 559-565) commence par la chaîne **`"content-gen"`**.

> **Conséquence directe pour le lot 4a : écrire la chaîne `content-gen` où que
> ce soit dans `src/app/api/mcp/route.ts` ou sous `src/server/mcp/` — y compris
> dans un commentaire, y compris pour expliquer qu'on ne s'en sert pas — fait
> rougir `gate-a`.**

Cette garde est actuellement à 0 violation. `src/app/api/mcp/` n'est couvert par
aucun de ses `ALLOWED_PATTERNS` (seul `src/app/api/content-gen/` l'est, ligne
32). Si l'adaptateur doit vraiment parler à ce domaine, le remède est le même
que pour qualiopi — une exception explicite, la plus étroite possible — mais le
plus simple reste de **ne pas écrire le mot**.

**Témoin** : ajouter la chaîne en commentaire dans le nouveau fichier, lancer
`pnpm content-gen:isolation-check`, vérifier qu'il rougit, retirer.

---

## § F — Le stub `stub.invalid`

### F.1 — Une méthode inconnue se résout à `undefined`, **pas** à `[]`

`src/lib/prisma.ts`, Proxy de modèle (lignes 31-58) :

- `findMany` → `[]` (ligne 35)
- `findFirst` / `findUnique` → `null` (ligne 36)
- `count` → `0` (ligne 37)
- `aggregate` → `{ _count: { _all: 0 } }` (ligne 38)
- `groupBy` → `[]` (ligne 39)
- mutations → **throw** (lignes 41-53)
- **tout le reste** — lignes 54-55 :
  ```ts
  // Unknown method → resolve to undefined (graceful).
  return async () => undefined;
  ```

C'est la ligne qui compte. `findFirstOrThrow`, `findUniqueOrThrow`,
`createManyAndReturn`, `updateManyAndReturn` — toute méthode que ce Proxy ne
nomme pas — rendent **`undefined`**. Un appelant qui écrit `(await …).length` ou
qui déstructure le résultat casse le SSG, avec une pile qui désigne l'appelant
et jamais le stub.

Second point, moins visible : le Proxy **racine** (lignes 59-75) renvoie
`stubModel` pour **toute** propriété non nommée (ligne 72), y compris
`$extends`, `$on`, `$use`. `prisma.$extends(...)` ne rend donc pas un client
mais un objet Proxy, et l'erreur apparaîtra plus loin.

L'activation est ligne 79 :
`const isBuildStub = process.env.DATABASE_URL?.includes("stub.invalid") === true;`

### F.2 — Le seul précédent de route qui pose l'early-exit

Mesuré : dans `src/app/api/**`, **une seule** route pose réellement le garde en
tête de handler — `src/app/api/qualiopi/alertes/stream/route.ts`. Les deux
autres routes d'API qui citent la chaîne (`api/admin/embeddings-health`,
`api/observatoire/export-csv`) ne la citent **qu'en commentaire**. Hors
`api/`, cinq routes de sitemap posent le même garde (dont
`sitemap-news-evergreen.xml/route.ts:54` et `sitemaps/images-fr.xml/route.ts:84`),
sous la forme courte `return [];`.

Les trois lignes exactes, `src/app/api/qualiopi/alertes/stream/route.ts:67-69` :

```ts
  if (process.env["DATABASE_URL"]?.includes("stub.invalid")) {
    const encoder = new TextEncoder();
    const body = encoder.encode('event: count\ndata: {"nonLues":0}\n\n');
```

À noter, parce que le lot 4a doit reproduire la **place** autant que le code :
dans ce précédent l'early-exit vient **après** l'authentification et le
plafond de débit (lignes 39-64) et **avant** toute lecture de la base. Le § 32
demande l'early-exit « **en tête de handler** » ; la lecture montre qu'il est en
tête de la **partie qui touche la base**. Les deux se concilient : refuser un
appel non authentifié ne coûte aucun accès à la base, et il ne faut pas qu'un
build change le verdict d'autorisation.

C'est aussi de ce fichier que le § 11 tire la borne de dix minutes du flux
(`MAX_DURATION_MS`, ligne 31).

**Témoin** : lancer un build avec `DATABASE_URL` sur `stub.invalid` et vérifier
que la route répond sans qu'aucune requête Prisma ne parte. Le contre-témoin est
plus parlant : retirer l'early-exit doit faire apparaître l'échec — s'il ne se
passe rien, c'est que le chemin testé n'atteignait pas la base, et le témoin
n'aura rien prouvé.

---

## § G — Le motif du secret partagé machine-à-machine

Référence : `src/app/api/internal/revalidate/route.ts`. C'est **le** motif à
reprendre — le cahier des charges le désigne nommément (§ 09).

### G.1 — Secret absent en configuration → 503, avant tout le reste

Lignes 38-42, les cinq premières lignes du handler :

```ts
export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return new Response("revalidate_secret_missing", { status: 503 });
  }
```

L'en-tête du fichier écrit l'intention (ligne 10) : « Sans secret en env, la
route retourne 503 (anti-bypass public) ». C'est le point important : une route
dont le secret n'est pas configuré **ne s'ouvre pas**, elle se ferme. Il n'y a
pas de mode dégradé — même posture que « le socle ne démarre pas si
l'authentification n'est pas configurée » (ADR 0001).

### G.2 — Comparaison à temps constant : oui, et avec égalisation des longueurs

Lignes 32-36 :

```ts
function constantTimeEquals(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}
```

Le commentaire au-dessus (lignes 25-31) donne le motif, et il est à reprendre
tel quel : on hashe les **deux** côtés d'abord pour obtenir deux tampons de
32 octets, parce que `timingSafeEqual` **lève** si les tailles diffèrent — et
que comparer les longueurs brutes fuite déjà de l'information.

Le verdict, lignes 56-59 :

```ts
const headerSecret = req.headers.get("X-Revalidate-Secret");
if (!headerSecret || !constantTimeEquals(headerSecret, secret)) {
  return new Response("unauthorized", { status: 401 });
}
```

### G.3 — Limitation de débit : oui, par IP, **et avec une réserve**

Lignes 47-54 :

```ts
const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";
const rl = await checkRateLimit(`internal:revalidate:${ip}`, { limit: 60, windowSec: 60 });
if (!rl.allowed) {
  return new Response("rate_limited", { status: 429 });
}
```

Deux points que le lot 4a doit traiter, et **ne pas recopier tels quels** :

1. **L'ordre.** Ici le plafond de débit est évalué **avant** la comparaison du
   secret. C'est le bon ordre pour une route à secret partagé : il coûte moins
   qu'une comparaison et il protège la comparaison elle-même. À conserver.
2. **La conduite en cas de panne du compteur.** `checkRateLimit` accepte un
   troisième réglage, `surPanne` (`src/lib/rate-limit.ts:41-56`), dont le
   **défaut est `"laisser-passer"`** — pensé pour les surfaces publiques, où une
   panne d'infrastructure ne doit pas couper le site. L'appel ci-dessus ne le
   déclare pas. Une route d'accès machine-à-machine relève de l'autre famille :
   **`/api/mcp` déclare `surPanne: "refuser"`.**

   ⚠️ **La garde de famille ne le dira pas.** `src/lib/rate-limit.spec.ts:148`
   énumère les préfixes réputés sensibles :

   ```ts
   const PREFIXES_SENSIBLES = ["auth:login", "gdpr:", ":magic:"];
   ```

   Une clé `mcp:…` n'y figure pas : l'oubli passerait au vert. **Le lot 4a
   ajoute le préfixe de la clé MCP à cette liste**, sinon il pose un compteur
   que rien ne surveille.

   Second piège du même test, lignes 173-180 : le balayage part de
   `git ls-files src`. Un fichier non `git add`é en est invisible — le même
   angle mort qu'au § C.6.

**Témoin (critère (b) du § 32)** : depuis un **autre réseau**, `POST /api/mcp`
sans en-tête de secret doit rendre **401** ; avec la configuration vide, **503**.
Et le témoin de la garde de famille : poser un appel `checkRateLimit("mcp:…")`
sans `surPanne` après avoir ajouté le préfixe à la liste — le test doit rougir
en nommant `fichier:ligne`. Le retirer.

---

## § H — Ce que les gardes de budget promettent, et ce qu'elles ne promettent pas

Point mesuré, contre-intuitif, et à ne pas se raconter à l'envers.

- `bundle:check` (`package.json:100`, `size-limit`) **bloque** : `ci.yml:473-474`
  porte le nom « Poids du bundle (gate bloquante — cliquet anti-croissance, PAS
  un budget per-route) » et **n'a pas** de `continue-on-error`. Le retirer est
  verrouillé par un test (`tests/unit/ci/poids-du-bundle-garde-vraiment.spec.ts`).
- Mais c'est un **cliquet anti-croissance sur des sommes**, pas un budget par
  route. Le doctrinal de `package.json` l'écrit noir sur blanc : « le First Load
  JS PAR ROUTE (≤ 75 KB gz) n'est mesuré par **aucune** gate. Il se mesure à la
  main. »
- `AGENTS.md` affirme encore que « les gates PR de budget portent **tous**
  `continue-on-error: true` ». **C'est périmé** pour cette étape depuis le
  2026-08-24. Écart signalé, pas comblé : ce n'est pas notre dépôt.

Pour le lot 4a : une route d'API ne charge pas de JavaScript client, l'effet
attendu sur le bundle est **nul**. C'est précisément pourquoi il faut le
**mesurer et écrire le delta dans la PR** (critère (e) du § 32) : un delta non
nul sur une route d'API signale qu'un import a tiré du code client dans un
graphe où il n'a rien à faire.

---

## Conséquences acceptées

- Le lot 4a **allonge** `CONSOMMATEURS_ASSUMES`, une liste dont le fichier dit
  qu'elle doit rétrécir. C'est assumé, et c'est le remède que le script
  prescrit lui-même (§ C.3) — mais chaque entrée porte sa raison écrite, et le
  cliquet du sens 2 la retirera d'office le jour où elle ne sert plus.
- Le lot 4a **écrit une garde neuve** (§ D.3). Une garde de plus est une garde
  de plus à maintenir ; sans elle, le critère de recette (d) est indéclarable.
- La route `/api/mcp` porte **seule** sa propre autorisation (§ B). Il n'y a pas
  de filet, et il ne faut pas en imaginer un.

## Incertitudes — ce qui n'a pas pu être vérifié

1. **Ce que « élargir `admin-nav:routes-check` » recouvre exactement.** Le
   script mesuré ne connaît ni chaînes d'import, ni `src/server/mcp/` (§ D.1).
   La forme proposée au § D.3 est une **proposition**, pas une lecture. Mesure
   qui lèverait le doute : que Will écrive en une phrase ce que le balayage doit
   refuser — « un outil MCP qui nomme un écran d'administration inexistant », ou
   autre chose.
2. **Le coût réel de `listAlertes()` sous le stub et en production.** Non
   mesuré ici. Le cahier des charges note déjà que le voisin
   `evaluerAlertesDetaille()` porte 47 règles et 31 `findMany` sans `take`, coût
   non mesuré. Mesure : chronométrer `listAlertes({ resolue: false, limit: 50 })`
   sur la base de production, une fois, et écrire le nombre.
3. **Le comportement réel d'un client MCP face au 301 du § A.2.** Le 301 est
   certain (lecture du code) ; la perte du corps de requête est le comportement
   usuel des clients HTTP, pas une mesure. Mesure : un `curl -X POST -i` sur
   `/mcp` en production, et la lecture de ce que le client MCP retenu en fait.
4. **Aucune vérification n'a été faite sur la couche service elle-même**
   (`admin-submissions`, `admin-job-applications`) : ce document ne traite que
   des gardes. Le geste ① du lot 4a — extraire une lecture sans session — reste
   à instruire.
