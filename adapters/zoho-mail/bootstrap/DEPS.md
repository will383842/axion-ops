# `adapters/zoho-mail/bootstrap/` — ce qu'il manque, et ce qui reste à trancher

Ce dossier est **écrit et non exécuté**. Rien n'a été lancé, rien n'a été commité,
aucun appel réseau n'a été fait, aucun identifiant n'a été lu.

---

## 1 · La ligne à ajouter à `package.json`

`package.json` appartient au lot 4 : **ce dossier n'y touche pas.** Voici la ligne
exacte à insérer dans `scripts`, entre `ops:vault:init` et `ops:vault:init:dist` :

```json
"zoho:bootstrap": "tsx adapters/zoho-mail/bootstrap/index.ts --amorcage-explicite",
"zoho:bootstrap:dist": "node dist/adapters/zoho-mail/bootstrap/index.js --amorcage-explicite",
```

### Pourquoi l'argument est dans le script et non tapé par Will

`--amorcage-explicite` est le **verrou 4** de `mandat.ts` : il ferme le cas du
fichier lancé à la main « pour voir ». Il est porté par le script pour que la
part de Will reste **un clic**. Sa valeur est écrite une seule fois dans le code
(`ARGUMENT_SENTINELLE`, `mandat.ts`) ; **si vous changez la chaîne ici, changez-la
là — ou plutôt : ne la changez pas.**

### Aucune dépendance nouvelle

Ce dossier n'ajoute **aucun paquet**. Il n'utilise que :

| Ce qui est utilisé         | D'où ça vient                                      |
| -------------------------- | -------------------------------------------------- |
| `node:http`, `node:crypto` | Node 22+, déjà exigé par `engines`                 |
| `fetch`                    | global depuis Node 18 — aucun client HTTP installé |
| `core/vault/**`            | le coffre du socle, **importé, jamais refait**     |
| `tsx`                      | déjà en `devDependencies`                          |

### ⚠️ Une conséquence sur la garde des commandes nommées

`ops/gestes-nommes.spec.ts` (garde A) confronte chaque `pnpm <mot>` écrit **dans
le code** aux scripts déclarés. Aucun module de ce dossier n'écrit la chaîne
`pnpm zoho:bootstrap` dans un littéral — précisément pour que la garde reste
juste tant que le script n'existe pas. **Une fois la ligne ci-dessus ajoutée à
`package.json`**, il devient possible (et souhaitable) de nommer la commande dans
les messages d'exploitation : la garde la confrontera alors pour de bon.

---

## 2 · ⛔ CE QUI BLOQUE LA CI, ET QUI N'EST PAS À MOI DE TRANCHER

`ops/conformite-ci.ts` — étape « Harnais de conformité — adaptateurs » de
`.github/workflows/ci.yml` — **liste les dossiers présents sous `adapters/` et
exige que chacun ait une entrée dans `core/registry/adapters.lock.json`.**

La création de `adapters/zoho-mail/` fait donc **échouer cette étape** avec :

> adaptateur « zoho-mail » présent mais ABSENT DU VERROU

Ce n'est **pas** réparable ici sans mentir : une entrée de verrou exige un
`manifestSha` — l'empreinte d'un manifeste d'adaptateur qui **n'existe pas
encore**, puisque seul l'amorçage OAuth est écrit. Fabriquer une empreinte
épinglerait un fantôme, ce que la garde d'en face refuse aussi.

**Trois issues, par ordre de préférence :**

1. **Attendre l'adaptateur.** Écrire `adapters/zoho-mail/` (manifeste + outils du
   § 27), produire son manifeste, l'épingler. La conformité redevient verte
   d'elle-même. C'est la voie propre, et elle suppose que ce dossier ne soit pas
   fusionné seul.
2. **Déplacer le dossier hors de `adapters/`** — par exemple `ops/zoho/bootstrap/`.
   Coût : `ops/` appartient au lot 4, et l'amorçage cesse d'être rangé avec
   l'adaptateur qu'il sert.
3. **Faire de `ops/conformite-ci.ts` un lecteur de manifestes plutôt que de
   dossiers** — « un adaptateur est un dossier qui porte un manifeste ». Le
   fichier écrit lui-même que sa convention est « une DÉCISION de ce dépôt, pas
   une lecture du cahier des charges » : la changer est légitime, et elle
   appartient à son propriétaire.

**Aucune n'est prise ici.** Signalé plutôt que comblé.

---

## 3 · Du coffre local au coffre de production — **NON TRANCHÉ**

Le § 27 pose le problème et **ne le résout pas** :

> Le bootstrap se fait « une seule fois, en local » et le token doit vivre dans
> le coffre de production. Ce sont deux coffres, et rejouer le bootstrap depuis
> la production est interdit deux fois. Choisir : **export scellé en local puis
> import par la console admin**, ou **bootstrap exécuté en production derrière
> Access**.

### Ce que le code fait aujourd'hui, sans choisir

`amorcer()` écrit dans **le coffre où la commande a tourné**, quel qu'il soit, et
le rapport se termine par un avertissement qui le dit en toutes lettres. Le
serveur de rappel, lui, **refuse de se poser ailleurs que sur la boucle locale**
(`rappel.ts`, `deriverLEcoute`) : l'option « en production » n'est donc pas
utilisable telle quelle, et c'est délibéré — elle demande une décision, pas un
paramètre.

### Ce que coûte chacune des deux voies

| Voie                                            | Ce qu'elle exige, et qui n'existe pas encore                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · export scellé + import console**          | Un format d'export **scellé** (sous quelle clé ? pas celle du coffre local, que la production n'a pas) · un écran d'import à la console (§ 22 n'en prévoit aucun) · une règle de purge du fichier scellé · l'assurance qu'il ne traverse **jamais** un canal que le socle lit (§ 20, second facteur).                                                                                                                                             |
| **B · amorçage en production, derrière Access** | l'URI de production **déjà déclarée** à la console Zoho — c'est la seconde des deux du § 27, et elle est faite. **Son nom d'hôte n'est écrit nulle part dans ce dépôt PUBLIC** : il arrive par `ZOHO_REDIRECT_URI` · un chemin qui serve `/auth/zoho/callback` **en production** · l'assurance que ce chemin est fermé hors amorçage · et la levée de la contrainte « boucle locale seulement » de `rappel.ts`, qui est aujourd'hui un refus dur. |

**Ce que je peux dire de mesuré :** la voie B est la seule qui **n'invente aucun
format**, et le § 12 lui donne déjà sa fenêtre — le jeton se dépose en version
neuve pendant que l'ancienne reste valide. La voie A demande une décision de
cryptographie que personne n'a prise.

**⛔ Will tranche. Tant que ce n'est pas tranché, un amorçage local produit un
jeton qui reste local.**

---

## 4 · Ce qui reste à VÉRIFIER — et la mesure exacte qui le lève

Aucun appel réseau n'ayant été fait, quatre points sont **écrits d'après le § 27
et la forme OAuth 2.0 de Zoho**, et non confrontés à la documentation.

| Point                                                                                     | Où c'est écrit                              | La mesure qui le lève                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Les quatre noms de scopes**, à la lettre près                                           | `autorisation.ts`                           | Ouvrir la doc « Zoho Mail API → OAuth 2.0 → Scopes » et comparer les quatre chaînes. **À faire AVANT le premier consentement** : les élargir ensuite coûte un amorçage.                                               |
| **`access_type=offline` et `prompt=consent`** — les noms exacts des paramètres            | `autorisation.ts`                           | Doc « Zoho OAuth 2.0 → Server-based Applications → Step 1 ». Vérifier aussi que Zoho n'exige pas `prompt=consent` **écrit autrement** selon la région.                                                                |
| **La valeur du plafond de jetons de rafraîchissement par client**                         | `coffre-du-jeton.ts`, `PLAFOND_PRESUME = 8` | Doc Zoho « refresh token limit ». Le 8 est **présumé et volontairement bas** : le rôle du nombre est de faire arriver le mur **avant** celui de Zoho. Poser `ZOHO_BOOTSTRAP_PLAFOND` une fois la vraie valeur connue. |
| **La virgule comme séparateur de scopes**, et son encodage en `%2C` par `URLSearchParams` | `autorisation.ts`                           | Un `--repetition` suffit : il affiche l'URL sans rien consommer. Ouvrir le lien : si l'écran de consentement liste les quatre autorisations, c'est bon.                                                               |

Ajoutez-y une borne de gardes, écrite dans `rappel.spec.ts` :

> **Le serveur de rappel n'est pas mesuré, il est relu.** La consigne du chantier
> est « aucun appel réseau dans les tests », et une liaison de boucle locale en
> est un au sens strict. Trois propriétés restent donc non mesurées : la liaison
> sur les **seuls** hôtes de boucle, l'**usage unique**, et l'**échéance**. La
> mesure qui les lèverait : autoriser `127.0.0.1` en test, lier sur le port `0`,
> et faire deux requêtes dans le processus — la seconde doit rendre 410.

---

## 5 · Le mode d'emploi, en trois lignes

```
# 1 · éprouver la configuration sans rien consommer : affiche l'URL, s'arrête là
pnpm zoho:bootstrap --repetition

# 2 · le vrai geste. Ouvre le lien affiché, accepte. C'est tout.
pnpm zoho:bootstrap
```

Prérequis, dans un `.env` **non suivi** (ce dépôt est PUBLIC) :

| Variable                 | Obligatoire              | Ce que c'est                                                  |
| ------------------------ | ------------------------ | ------------------------------------------------------------- |
| `ZOHO_CLIENT_ID`         | oui                      | l'identifiant public du client OAuth                          |
| `ZOHO_CLIENT_SECRET`     | oui                      | son secret                                                    |
| `OPS_VAULT_KEY`          | oui                      | la clé du coffre — **séquestrée hors machine d'abord** (§ 25) |
| `DATABASE_URL`           | oui, hors `--repetition` | le coffre de production vit en base                           |
| `ZOHO_REGION`            | non                      | défaut `eu` (§ 27)                                            |
| `ZOHO_REDIRECT_URI`      | non                      | défaut `http://localhost:8787/auth/zoho/callback`             |
| `ZOHO_BOOTSTRAP_PLAFOND` | non                      | défaut **présumé** — voir § 4                                 |

---

## 6 · Ce que ce dossier NE fait pas

- **Il n'écrit pas l'adaptateur.** Aucun outil du § 27, aucun manifeste, aucune
  entrée de registre. Seulement l'amorçage OAuth.
- **Il ne rafraîchit pas le jeton.** L'échange `refresh_token` → `access_token`
  appartient à l'adaptateur, qui lira `zoho.oauth.refreshToken` au coffre.
- **Il ne retire pas les anciennes versions du jeton.** Le § 12 les veut vivantes
  pendant la propagation ; leur retrait est un geste d'exploitation, et le
  rapport le rappelle après chaque dépôt.
- **Il n'ouvre pas de navigateur.** Il affiche un lien. Ouvrir automatiquement
  ferait de ce programme quelque chose qui agit sur la session de l'utilisateur ;
  afficher un lien le laisse décider, y compris de le coller ailleurs.
