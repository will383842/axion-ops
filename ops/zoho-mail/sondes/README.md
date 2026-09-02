# `ops/zoho-mail/sondes/` — la mesure M2

**Ce dossier ne contient aucun code de production.** Il contient cinq sondes
d'exploitation, faites pour être lancées **une fois**, à la main, et pour rendre
un **relevé écrit** qui tranche des questions que personne ne peut trancher en
relisant le cahier des charges.

Le § 35 du cahier des charges v6 les résume ainsi :

> **M2** — Le plan Zoho donne-t-il l'API REST, et l'enchaînement pièce jointe ×
> brouillon marche-t-il ? Quatre appels jetables : `GET /api/accounts` ;
> enregistrer un brouillon `mode:"draft"` ; téléverser une pièce jointe ; relire
> le brouillon avec la pièce attachée. **1 h · lot 0b — tranche l'unique critère
> de fin du lot 6.**

La cinquième sonde n'est pas dans cette liste, et elle devrait y être : elle
mesure ce qui rend `zoho.mail.send` possible **ou impossible**. Le § 27 dit
pourquoi elle manquait — `send` avait été spécifié sur un endpoint qui n'existe
pas, faute d'avoir appelé.

---

## Ce qu'il faut avoir AVANT de lancer quoi que ce soit

### 1 · Un jeton — et **il n'y en a aucun aujourd'hui**

Mesuré au 2026-09-01, **sur les noms de clés seuls et jamais sur les valeurs** :
le `.env` non suivi du répertoire de travail porte `ZOHO_CLIENT_ID` et
`ZOHO_CLIENT_SECRET`, et **rien d'autre**. Le consentement OAuth du § 27 n'a pas
eu lieu. **Aucune des cinq sondes ne peut donc tourner en l'état.**

Deux voies, et **la première est la bonne pour M2** :

| Voie                                              | Ce qu'elle coûte                                                         | Quand la prendre                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **« Client seul »** → `ZOHO_ACCESS_TOKEN`         | une heure de validité · **aucun coffre engagé, aucun amorçage consommé** | **pour M2.** C'est une mesure jetable, elle ne doit rien décider du transfert du jeton |
| `ops/zoho-mail/bootstrap/` → `ZOHO_REFRESH_TOKEN` | un amorçage, compté et plafonné (`ops_secret.bootstrapCount`, § 27)      | quand l'adaptateur sera écrit — pas pour une mesure d'une heure                        |

**Voie courte, pas à pas** — sur `api-console.zoho.eu`, créer un client de type
**Self Client**, générer un code avec les quatre scopes du § 27, l'échanger
contre un jeton d'accès, puis :

```sh
export ZOHO_ACCESS_TOKEN="…"      # une heure. Jamais commité, jamais affiché.
```

> ⚠️ **`ZOHO_REFRESH_TOKEN` est un SECOND chemin vers un secret qui vit au
> coffre.** `ops/zoho-mail/bootstrap/` dépose le sien dans le coffre du
> socle. Cette variable-ci existe parce que M2 doit pouvoir tourner **avant que
> le socle, sa base et son coffre n'existent** — le § 35 la place au lot 0b,
> avant le lot 1. **Elle ne doit jamais servir en production** : sortir un jeton
> du coffre pour le poser dans un environnement annule ce que le coffre apporte.

### 2 · Les trois autres réglages

```sh
export ZOHO_SONDE_FROM="…"        # DOIT figurer parmi les identités validées de la sonde ①
export ZOHO_SONDE_TO="…"          # ⚠️ UNE ADRESSE QUE VOUS POSSÉDEZ — voyez ci-dessous
export ZOHO_REGION="eu"           # facultatif ; défaut : la région du § 27
```

> 🔥 **POURQUOI `ZOHO_SONDE_TO` DOIT ÊTRE VOTRE PROPRE ADRESSE.** Chez Zoho,
> « enregistrer un brouillon » et « envoyer » sont **le même `POST /messages`, à
> un paramètre `mode` près » (§ 27, correction bloquante n° 10). Le mode de
> défaillance de ce paramètre n'est pas « le brouillon n'est pas créé » : c'est
> **« le courrier part »**. La question que la sonde ② pose est justement
> « `mode` a-t-il été ignoré ? », et une réponse positive avec l'adresse d'un
> tiers dans le champ `to` serait un **effet extérieur au sens du § 20**, causé
> par la mesure elle-même.
>
> C'est pourquoi les sondes ②, ④ et ⑤ **refusent de partir** sans
> `--je-possede-le-destinataire`. Le drapeau n'est pas une formalité : il est
> l'endroit où quelqu'un atteste.

### 3 · Rien d'autre

Aucune base de données, aucun coffre, aucun socle démarré. C'est délibéré : M2
est au lot 0b, **avant** le lot 1.

---

## Comment les lancer

```sh
pnpm exec tsx ops/zoho-mail/sondes/sonde-01-abonnement.ts
```

Il n'y a **pas de script `pnpm`** pour ces sondes, et c'est écrit dans
`DEPS.md` : `package.json` appartient à un autre chantier au moment où ce
dossier est écrit.

**Les sondes s'appellent l'une l'autre par un fichier de relais**, posé **hors du
dépôt** — dans le répertoire temporaire du système par défaut,
`ZOHO_SONDE_RELAIS` pour le déplacer. Un chemin qui tomberait **sous la racine du
dépôt** est **refusé** : ce dépôt est PUBLIC, et le refus est une garde
(`commun.spec.ts`), pas une consigne.

### Les codes de sortie

| Code  | Ce qu'il veut dire                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| **0** | la sonde a mesuré. **Y compris quand le verdict est `RÉFUTÉ`** — une sonde qui réfute a parfaitement fonctionné |
| **1** | la sonde a été **empêchée** : réglage absent, relais dans le dépôt, fuite détectée. Elle n'a rien mesuré        |

> Sortir en 1 sur un `RÉFUTÉ` ferait d'un **résultat** une **panne**, et la
> première réaction serait de relancer la sonde au lieu de lire le relevé.

---

## L'ordre, et ce que chaque résultat DÉCIDE

### ① `sonde-01-abonnement.ts` — l'abonnement, et l'hôte

`GET /api/accounts`, sur **les deux hôtes candidats**.

| Résultat                              | Ce qu'il décide                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **200** sur `mail.zoho.<région>`      | la colonne « endpoint Zoho » du § 27 est **à corriger** : elle écrit `accounts.zoho.eu`, qui sert l'autorisation. Toutes les sondes suivantes partent de l'hôte relevé                                                 |
| **200** sur `accounts.zoho.<région>`  | le § 27 avait raison. On le note, avec la date du relevé                                                                                                                                                               |
| **401/403** sur les deux              | ⚠️ **ne concluez pas « plan insuffisant »**. Un refus dit aussi bien jeton expiré, scope manquant ou région erronée. C'est le `errorCode` que le relevé imprime qui les sépare — et ce code n'était pas connu d'avance |
| **200, mais 0 identité d'expédition** | `zoho.mail.identities_list` n'a pas de source. Le § 27 exige que tout `from` soit validé contre cette liste : sans elle, l'outil ne peut pas être écrit tel qu'il est spécifié                                         |

C'est cette sonde qui tranche la **chronologie** de l'annexe A — « plan payant
Mail Lite » (16 août) contre « Zoho Mail Free EU » (13 mai). Le cahier des
charges l'écrit lui-même : cela « se tranche par M2, **pas par la lecture** ».

### ② `sonde-02-brouillon.ts` — `mode: "draft"` enregistre-t-il, ou envoie-t-il ?

```sh
pnpm exec tsx ops/zoho-mail/sondes/sonde-02-brouillon.ts --je-possede-le-destinataire
```

**Un `HTTP 200` sur le POST ne prouve rien** : il est le même que le message soit
enregistré ou envoyé. La preuve est l'**emplacement**, et elle se prend dans les
deux sens — relisible dans `Drafts`, **et introuvable dans `Sent`**.

| Résultat                            | Ce qu'il décide                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dans `Drafts`, **absent** de `Sent` | la séparation `write-draft` / `send` du § 20 a une réalité côté Zoho. On continue                                                                                                                                                               |
| dans `Drafts` **et** dans `Sent`    | ⛔ **tout le § 27 est à reprendre.** Le § 27 écrit déjà que le **scope** ne sépare pas les deux (`ZohoMail.messages.ALL` couvre l'un et l'autre) : si l'**API** ne les sépare pas non plus, le « double contrôle » du § 19 n'a plus aucun étage |
| aucun identifiant rendu par le POST | `send` « n'accepte qu'un `draftId` » et il n'y a rien à lui passer. Le lot 6 s'arrête là                                                                                                                                                        |

### ③ `sonde-03-piece-jointe.ts` — le téléversement seul

La vraie question n'est pas « ça marche » : c'est **sous quelle forme la
référence revient**. Zoho rend un **triplet** — `storeName`, `attachmentPath`,
`attachmentName` — qu'il faut recopier tel quel dans le `POST /messages` suivant.

> ⚠️ **Lancez ④ juste après.** La zone de dépôt d'une pièce téléversée mais
> jamais attachée a une durée de vie que Zoho ne documente pas. Un ④ lancé le
> lendemain mesurerait une expiration, pas la combinaison.

Le fichier est **fabriqué en mémoire** avec un marqueur unique, et son empreinte
est calculée avant l'envoi. Aucun fichier du disque n'est téléversé ; aucune
pièce jointe n'est téléchargée (§ 31).

### ④ `sonde-04-relecture.ts` — **l'unique critère de fin du lot 6**

```sh
pnpm exec tsx ops/zoho-mail/sondes/sonde-04-relecture.ts --je-possede-le-destinataire [--nettoyer]
```

Elle poste un brouillon **avec** la pièce, dans le **même appel**, puis relit le
corps **et** les métadonnées de la pièce. C'est le risque que le § 34 note à
gravité « élevé » : « `mode:"draft"` ne se combine pas aux pièces jointes ».

| Résultat                                                 | Ce qu'il décide                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pièce présente, **bon nom, bonne taille**                | ✅ **le critère de fin est atteint.** Le § 34 perd son risque, le § 27 peut être écrit tel quel                                                                                                                                                                    |
| POST refusé                                              | ⛔ trois issues, aucune n'est un rafistolage : (a) rattacher par un second appel, s'il existe — à mesurer ; (b) restreindre `draft_create` aux messages sans pièce, ce qui retire à l'adaptateur son usage principal ; (c) retenir « la voie plus courte » du § 27 |
| POST **accepté** mais **aucune pièce** dans la relecture | ⛔ le pire des trois : il est **silencieux**. Un adaptateur écrit sur ce comportement produirait des brouillons sans pièce, relus et envoyés par un humain qui croirait le devis attaché                                                                           |
| pièce présente, **taille différente**                    | regardez d'abord Q2 de la sonde ③ : un écart déjà présent au téléversement n'est pas un défaut de la combinaison                                                                                                                                                   |

`--nettoyer` met les brouillons d'épreuve à la corbeille. Ce bloc **ne mesure pas
`zoho.mail.delete`** — son échec n'est pas un verdict. À défaut, les brouillons
sont reconnaissables à leur objet, préfixé `[axion-ops M2]`.

### ⑤ `sonde-05-envoi.ts` — « relire-puis-envoyer » est-il implémentable ?

Le § 27 remplace `send` par : _relire le brouillon chez Zoho, recomparer son
empreinte, n'envoyer que si elle correspond_. **Ce remplacement n'a pas été
mesuré non plus.** Il suppose que la relecture d'un brouillon rend un document
**fidèle** et **stable** — et si cette propriété est fausse, le garde-fou de
remplacement échoue exactement comme celui qu'il remplace.

#### La sonde ⑤, phase par phase

```sh
# 1 · crée le brouillon de référence, mesure Q2 (fidélité), Q3 (déterminisme) et Q5 (pièces)
pnpm exec tsx …/sonde-05-envoi.ts --phase=reference --je-possede-le-destinataire

# 2 · UNE HEURE PLUS TARD, sans toucher à rien — Q3 dans le temps
pnpm exec tsx …/sonde-05-envoi.ts --phase=stabilite

# 3 · ouvrez le brouillon dans l'interface web, changez UN caractère, enregistrez.
#     PUIS — le témoin :
pnpm exec tsx …/sonde-05-envoi.ts --phase=temoin

# 4 · seulement si vous voulez trancher Q1 — CETTE PHASE PEUT ENVOYER UN COURRIER
pnpm exec tsx …/sonde-05-envoi.ts --phase=envoi --autoriser-un-envoi-vers-moi
```

| Question                                                   | Verdict                        | Ce qu'il décide                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q2** empreinte(posté) = empreinte(relu) ?                | identiques                     | l'empreinte de référence peut être prise sur le **corps posté**, comme le § 27 l'écrit                                                                                                                                                                   |
|                                                            | identiques après normalisation | ⚠️ **le § 27 est à amender, pas à abandonner.** Normaliser avant de hacher **affaiblit** la garde ; prendre l'empreinte sur la **première relecture** ne l'affaiblit pas. `draft_create` doit donc relire ce qu'il vient d'écrire — un appel de plus     |
|                                                            | divergentes                    | ⛔ l'empreinte du corps posté est inutilisable. Lisez le **voisinage du premier écart** que le relevé imprime avant de conclure : une enveloppe HTML et un horodatage inséré mènent à des décisions opposées                                             |
| **Q3** deux relectures identiques, sans modification ?     | oui                            | l'empreinte survit au temps — la condition que « recomparer avant d'envoyer » exige                                                                                                                                                                      |
|                                                            | non                            | ⛔ l'empreinte **dérive toute seule**. Un brouillon préparé le matin serait refusé l'après-midi. Le correctif n'est pas de tolérer l'écart — ce serait rouvrir la porte — mais de hacher un sous-ensemble stable, ce qui est une décision d'architecture |
| **Q4 · LE TÉMOIN** l'empreinte change après modification ? | oui                            | ✅ le garde-fou détecte ce qu'il prétend détecter                                                                                                                                                                                                        |
|                                                            | non                            | ⛔ **le garde-fou ne garde rien, et Q2 et Q3 étaient vertes pour rien.** Vérifiez d'abord que la modification a bien été enregistrée dans l'interface web ; si oui, le § 27 est à repenser entièrement                                                   |
| **Q5** la relecture rend-elle le triplet de pièce jointe ? | oui                            | `send` peut reconstruire à l'identique le message relu, pièces comprises                                                                                                                                                                                 |
|                                                            | non                            | ⚠️ le garde-fou ne couvre **que le corps**. `send` devra re-téléverser la pièce, donc envoyer un message qui n'est pas exactement celui qui a été relu. **Le § 27 doit l'écrire** — ou restreindre `send` aux brouillons sans pièce                      |
| **Q1** un endpoint envoie-t-il un brouillon enregistré ?   | aucun                          | le constat de l'audit est confirmé **par l'appel**. « Relire-puis-envoyer » reste le seul mécanisme. ⚠️ **Borne** : ceci prouve que ces formes-**ci** ne fonctionnent pas, pas qu'aucune n'existe                                                        |
|                                                            | l'une fonctionne               | 🔄 **le § 27 peut être simplifié**, et la v5 avait raison : `send` peut n'accepter qu'un `draftId` sans rien reconstruire — un garde-fou **plus fort**, puisqu'il n'y a plus de fenêtre entre la relecture et l'envoi                                    |

> **Q4 exige un geste humain, et ce n'est pas une faiblesse.** Modifier le
> brouillon par l'API mesurerait la fidélité de l'API à elle-même. Le mode de
> défaillance que le § 27 vise est « quelqu'un a retouché le brouillon dans
> l'interface web ». **Sans Q4, Q2 et Q3 sont satisfaites par une relecture qui
> rendrait toujours la même chose** — un cache, un rendu normalisé, un corps
> vide — c'est-à-dire par une garde qui ne peut pas échouer.

---

## Ce que les sondes ne font jamais

| Promesse                                            | Ce qui la tient                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **elles n'affichent aucun identifiant**             | `ValeurSecrete` ferme les **quatre** voies de rendu de JavaScript — interpolation, `String()`, `JSON.stringify`, l'inspecteur de Node. `devoiler()` est l'unique porte, et son nom est fait pour être `grep`é                          |
| **le relevé passe par un filet avant d'être servi** | `verifierAucuneFuite` de `core/transport/anti-fuite.ts` (ADR 0044) — **le même filet que les deux transports**, jamais un second. **Zéro valeur confrontée fait échouer l'écriture** : un relevé qu'aucun filet n'a vu n'est pas servi |
| **elles n'écrivent rien dans le dépôt**             | `cheminDuRelais()` **lève** sur tout chemin sous la racine, dérivée d'`import.meta.url`                                                                                                                                                |
| **aucune adresse ne paraît en clair**               | `caviarderAdresse()` garde deux caractères et le domaine. Un relevé finit collé dans un ADR d'un dépôt PUBLIC                                                                                                                          |
| **aucun nom de dossier de la boîte n'est imprimé**  | seuls les dossiers système reconnus sont nommés ; les autres sont **comptés**. Un dossier peut porter un nom de client                                                                                                                 |
| **elles ne tournent pas dans `pnpm test`**          | aucune ne s'appelle `*.spec.ts`, et `vitest.config.ts` n'inclut que ce motif. ⚠️ **renommer une sonde en `.spec.ts` ferait sortir la chaîne d'intégration PUBLIQUE sur le réseau, avec un jeton**                                      |
| **une sonde importée ne part pas**                  | `estLePointDEntree()`, qui **échoue du côté sûr** : sans `process.argv[1]`, la réponse est « non »                                                                                                                                     |

Les quatre premières lignes sont **éprouvées** par `commun.spec.ts`, chacune avec
un témoin fabriqué et un compte annoncé. Une promesse de sécurité non gardée
n'est qu'une phrase.

---

## Les écarts signalés, et ce qu'ils attendent

1. **`ops/conformite-ci.ts` échoue tant que `ops/zoho-mail/` n'est pas au
   verrou.** Il tient tout dossier sous `adapters/` pour un adaptateur, et
   `core/registry/adapters.lock.json` n'existe pas encore. **Épingler un dossier
   qui ne porte ni manifeste ni `defineAdapter()` serait épingler un fantôme** —
   exactement ce que la seconde moitié de ce contrôle interdit. La proposition
   est d'affiner le **critère** : un adaptateur est un dossier qui porte un
   manifeste, pas un dossier. Non corrigé ici : `ops/` appartient à un autre
   chantier.

2. **`SortieServie.transport` ne sait pas nommer une sonde.** Le type n'admet
   que `"http"` et `"stdio"`, les deux fils du § 11 ; une sonde écrit sur la
   sortie standard, qui n'est ni l'un ni l'autre. `"stdio"` est passé tel quel —
   littéralement vrai, faux au sens du § 11 — plutôt que de fabriquer un second
   filet, ce qui aurait refait le défaut que l'ADR 0044 vient de fermer. La
   proposition est d'élargir le champ à un **canal nommé**.

3. **Le § 27 écrit `GET accounts.zoho.eu/api/accounts`.** C'est douteux :
   `accounts.zoho.<région>` sert l'autorisation, l'API du courrier est servie
   par `mail.zoho.<région>`. **Ce n'est pas corrigé, c'est mesuré** — la sonde ①
   appelle les deux et relève les deux codes. Réécrire le § 27 sur une lecture de
   documentation referait exactement le défaut de `send`.

4. **Le § 27 ne dit pas si « relire-puis-envoyer » couvre les pièces jointes.**
   Q5 de la sonde ⑤ le tranche. Si la relecture ne rend pas le triplet, le
   garde-fou couvre le corps et pas les pièces, ce qui n'est écrit nulle part.

---

## Après le relevé

Un relevé porte **sa date** et **le nombre d'appels qu'il a faits**. Un relevé
qui aurait fait moins d'appels que son plancher le dit en toutes lettres, et son
verdict d'ensemble devient `INDÉCIS` — jamais « vert ».

Collez-le dans un ADR, avec la date et la région employée. C'est la forme que
l'annexe A réclame pour tout fait : **le fait, sa source, et sa borne.**
