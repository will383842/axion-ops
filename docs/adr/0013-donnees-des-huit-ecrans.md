# ADR 0013 — Les données derrière les huit écrans de la console

- **Statut** : proposée — elle appelle une décision sur les huit manques du § 5
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin
- **Portée** : lot 5 (console, 8 écrans), et les modules de `core/` dont ces
  écrans tirent leurs chiffres. Cet ADR ne dessine **aucune interface** : il
  établit ce qu'il y a derrière.
- **Sources** : cahier des charges v6, § 12 (modèle de données), § 20
  (garde-fous), § 21 (pourquoi le socle a sa propre console), § 22 (les huit
  écrans), § 24 (observabilité), § 25 (arrêt d'urgence), § 32 (critère de fini
  du lot 5) ; le code de `core/` et `prisma/schema.prisma` au 2026-08-31 ;
  `docs/ETAT.md` (état du socle à la fin du lot 1).

---

## Décision

Chacun des huit écrans reçoit **une question, une liste de données avec leur
source nommée, une liste d'actions avec leur effet, et son comportement coffre
verrouillé.** Ce qui suit est cette liste.

Trois écrans sur huit **ne peuvent pas être servis complètement** avec le socle
tel qu'il existe aujourd'hui : Santé, Découvertes et Quotas. Les huit manques
mesurés sont au § 5. Ce ne sont pas des détails d'interface : ce sont des
tables, des colonnes et des modules absents.

| Écran           | Source principale                                         | Servi sans le coffre ?           |
| --------------- | --------------------------------------------------------- | -------------------------------- |
| Arrêt d'urgence | `core/policy.resserrer` · `core/vault.Coffre.verrouiller` | **Oui, intégralement**           |
| Déverrouillage  | `core/vault` (`appliquerGeste`, `deverrouiller`)          | **Oui — c'est sa raison d'être** |
| Outils          | `ops_tool` · `core/profiles.mesurerBudgetProfil`          | Oui, en lecture                  |
| Politique       | `ops_policy` · `core/policy.niveauPourEcran`              | Oui, en lecture                  |
| Journal         | `ops_audit` · `core/audit.verifierChaine`                 | Partiellement — voir § 4.5       |
| Quotas          | `ops_quota` · `core/limits.resoudreCompteurs`             | Oui, en lecture                  |
| Santé           | `Coffre.sante()` · `ops_token` · `ops_adapter`            | **Oui — obligatoire**            |
| Découvertes     | `ops_discovery`                                           | Oui, en lecture                  |

---

## 1 · Cinq règles qui valent pour les huit écrans

Elles sont écrites une fois ici pour ne pas être réinventées huit fois.

**1 · L'écran dérive du calcul, jamais du champ brut.** Le § 20, protection 3,
l'exige pour le TTL ; `core/policy/desserrage.ts:567` expose `niveauPourEcran()`
précisément pour qu'aucun écran n'ait de raison d'écrire un second calcul. La
règle s'étend : le budget se lit par `mesurerBudgetProfil()`, l'intégrité du
journal par `verifierChaine()`, l'état du coffre par `Coffre.sante()`. Un écran
qui relit `ops_policy.level` ou compte `ops_tool` à la main **ment le jour où
les deux dévient**.

**2 · Tout compte s'affiche avec son dénominateur, et avec le nombre d'éléments
mesurés.** `NiveauApplique` porte `mesures` et `enVigueur` ; `VerdictBudget`
porte `outilsExamines`, `outilsComptes` et `mesureAveugle` ; `RapportVerification`
porte `lignesVerifiees` ; `EtatCompteur` porte `count`, `limit`, `warnAt`. Ces
champs existent pour être **affichés**, pas seulement testés : une garde à zéro
élément doit se voir à l'écran, pas seulement en CI.

**3 · Aucun écran n'affiche un secret, un contenu, ni un jeton.** Le § 20 pose
que le jeton de confirmation ne sort jamais, pas même dans un message d'erreur.
`ops_secret` n'est jamais déchiffré pour l'affichage : seuls `keyId`, `version`,
`rotatedAt` et `bootstrapCount` sont des métadonnées publiques par construction
(`Coffre.sante()` ne rend que des `keyId`, et `lireAmorcage()` lit le compteur
**sans déchiffrer**). `ops_audit` ne porte aucun corps par construction
(`verifierAucunContenu`, garde à l'écriture).

**4 · L'arrêt d'urgence est présent sur les huit écrans.** § 22 : « toujours
atteignable en un geste depuis tous les autres écrans — seul élément dupliqué de
l'interface, volontairement ».

**5 · Un écran qui ne peut pas lire sa source le DIT.** Il n'affiche jamais
« 0 » là où il faut lire « je n'ai pas pu mesurer ». `NiveauApplique.raison`
distingue déjà `aucune-ligne` de `politique-illisible` ; `VerdictBudget`
distingue `depasse` de `mesureAveugle`. Les écrans dont la source n'existe pas
encore (§ 5) affichent **l'absence du module**, pas un zéro rassurant.

---

## 2 · Les quatre écrans qui agissent

### 2.1 · Arrêt d'urgence

> **La question** : « comment je referme tout, immédiatement, depuis mon
> téléphone, sans terminal et sans savoir ce qui est en cours ? »

**Ce que l'écran affiche** — le strict nécessaire pour que le geste soit
décidable, et rien de plus :

| Donnée                                          | Source                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Niveau appliqué sur `*`, et sur quoi il porte   | `core/policy.niveauPourEcran(depot, ref, maintenant)` → `NiveauApplique.niveau`, `.mesures`, `.enVigueur` |
| Y a-t-il un desserrage vivant, et jusqu'à quand | `NiveauApplique.retenues` → les `ops_policy.id` couvrants, puis leur `expiresAt`                          |
| État du coffre (3 valeurs)                      | `Coffre.sante().etat`, `.vaultLocked`                                                                     |
| Combien de jetons seront révoqués               | `ops_token` : `revokedAt IS NULL AND expiresAt > now()`, ventilé par `kind`                               |
| Ce que le bouton **ne fait pas**                | Texte fixe, dérivé du § 25 : il ne touche pas au refresh token Zoho                                       |
| `ops_secret.bootstrapCount` du secret Zoho      | `Coffre.lireAmorcage(nom, version)` → `CompteurDAmorcage.compte`, `.reste`                                |

Le dernier point n'est pas décoratif. Le § 25 range la révocation Zoho réelle
**hors du bouton**, « avec une confirmation qui rappelle
`ops_secret.bootstrapCount` » : l'écran doit montrer combien d'amorçages restent
avant que la seule voie de retour soit fermée.

**Ce que l'écran permet, et l'effet de chaque geste** :

| Action                           | Appel                                                                                                             | Effet                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tout resserrer**               | `resserrer({ level: "brouillon", scope: "*", channel: "console", expiresAt: null, supersederIds: [], … }, depot)` | Écrit une ligne `ops_policy`. Tout effet extérieur est refusé à l'étape 10 (`policy_denied`). Immédiat, sans TTL — un resserrage n'expire pas.               |
| **Verrouiller le coffre**        | `Coffre.verrouiller()` — transition `ouvert → verrouillé`                                                         | `refusDAppelDOutil()` rend un refus pour **tout** appel d'outil. Le healthcheck reste à **200 + `vaultLocked`**. Console et déverrouillage répondent encore. |
| **Révoquer les jetons**          | `ops_token.revokedAt = now()` sur les jetons vivants                                                              | L'étape 4 de la chaîne rend `unauthenticated`. Invalide aussi les sessions de console — donc **l'opérateur devra se reconnecter**, ce que l'écran annonce.   |
| **Jeter le jeton Zoho en cache** | Cache mémoire de l'adaptateur hébergé                                                                             | Le prochain appel Zoho re-demande un access token via le refresh token, **qui reste valide**.                                                                |

**Pourquoi c'est une route de resserrement PUR.** Trois refus de
`core/policy/desserrage.ts` le garantissent, et ils sont exécutables :

- `pas-un-resserrage` — une demande qui **élargit** la surface est refusée et
  renvoyée vers `desserrer`, avec second facteur et durée ;
- `supersession-interdite` — un resserrage **ne lève aucune ligne** :
  `supersederIds` non vide est refusé, « marquer `supersededAt` ne peut
  qu'élargir » ;
- `ttl-interdit` — un `expiresAt` sur un resserrage en ferait « un desserrage à
  retardement, sans second facteur ».

C'est ce triplet, et lui seul, qui autorise la route à sortir de `ops:admin`. Le
§ 21 le pose comme une correction de symétrie : le § 20 veut que resserrer soit
« exécuté immédiatement d'où que ça vienne », or l'arrêt d'urgence portait
**strictement plus d'authentification qu'un envoi de courrier**. La route vit
donc derrière Cloudflare Access **seul** — ni `ops:admin`, ni OAuth.

**Conséquence à ne pas manquer** : sans jeton OAuth, le `setBy` de la ligne
`ops_policy` **ne peut pas être un principal de jeton**. Il doit porter
l'identité Access, et `channel` doit valoir `console` (`CANAUX`,
`core/policy/confirmation.ts:26`) — jamais `mcp`, qui ne délivre aucune
confirmation. Un arrêt d'urgence dont la trace ne nomme pas son auteur rend
l'écran Politique illisible le lendemain.

**Sans le coffre** : l'écran fonctionne **intégralement**. Les trois actions
écrivent en base ou en mémoire, aucune ne déchiffre. Le geste
`verrouillé + verrouiller` est **idempotent à dessein** —
`core/vault/etat.ts:112` : « l'arrêt d'urgence ne doit jamais rendre une erreur
parce que le coffre était déjà fermé ». Seule la ligne `bootstrapCount` demande
une lecture, et `lireAmorcage()` est explicitement lisible coffre verrouillé.

---

### 2.2 · Déverrouillage

> **La question** : « le coffre est fermé — comment je le rouvre, d'ici, sans
> ouvrir un terminal ? »

C'est l'écran que la v5 n'avait pas. Le § 21 nomme le défaut : elle « permettait
de fermer depuis un téléphone et imposait un terminal pour rouvrir ». Cet écran
est aussi la moitié du **critère décisif du lot 5** (§ 32) : « arrêt d'urgence
depuis le téléphone, PUIS déverrouillage depuis le même téléphone, sans
terminal ».

**Ce qu'il affiche** :

| Donnée                                                   | Source                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| L'état courant, en **trois** valeurs — jamais un booléen | `Coffre.etat()` → `EtatCoffre`                                              |
| Les gestes permis depuis cet état                        | `gestesPermis(etat)`, dérivé de `TRANSITIONS_COFFRE`                        |
| Ce que ce geste ferait, en une phrase                    | `TransitionCoffre.motif` — le texte est **dans la table**                   |
| D'où viendrait la clé                                    | `Coffre.sante().sourceDeCle` (`"déverrouillage-manuel"` ou l'autre)         |
| Le socle se rouvrirait-il seul au prochain démarrage ?   | `Coffre.sante().ouvreAuDemarrage` — c'est la décision W-4, lisible          |
| `keyId` principal et `keyId` connus du trousseau         | `Coffre.sante().keyIdPrincipal`, `.keyIdsConnus` — publics par construction |
| Ce qui reste refusé tant que le coffre est fermé         | `Coffre.refusDAppelDOutil()` → message, pas booléen                         |
| La commande de provision, quand l'état est `absent`      | `COMMANDE_DE_PROVISION` (`core/vault/demarrage.ts`)                         |

**Ce qu'il permet** :

| Action                | Appel                                       | Effet                                                                                                               |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Déverrouiller**     | poser la clé, puis `Coffre.deverrouiller()` | `verrouillé → ouvert`. La preuve est le **déchiffrement du sceau**, pas la promesse. Les appels d'outils repartent. |
| **Verrouiller**       | `Coffre.verrouiller()`                      | `ouvert → verrouillé`, trousseau effacé en mémoire (`effacerTrousseau`).                                            |
| **Rejouer le calcul** | rafraîchir `sante()`                        | Aucun effet — mais l'écran doit pouvoir se relire sans rien changer.                                                |

**Ce que l'écran ne fait pas, et pourquoi.** Il ne **provisionne** pas. La
transition `absent → provisionner → ouvert` existe dans la table, mais le § 25
exige que la clé soit **séquestrée hors machine avant d'être posée** ; et l'état
`absent` est celui où **le conteneur ne démarre pas** (`decisionDeDemarrage`,
`demarre: false`) — il n'y a donc pas d'écran pour le servir. L'écran affiche
alors le message qui nomme la commande, et rien d'autre.

**Sans le coffre** : c'est **toute** sa raison d'être. `ROUTES_SANS_COFFRE` =
`["healthcheck", "console", "déverrouillage"]`, dérivé de `ROUTES_DU_SOCLE` moins
`"outils"`. Le § 21 ajoute la clause qui rend la chose tenable :
**le matériel d'authentification de la console n'entre jamais dans le coffre.**
Un mot de passe de console chiffré par la clé du coffre transformerait l'écran de
déverrouillage en porte fermée à clé de l'intérieur.

---

### 2.3 · Outils

> **La question** : « qu'est-ce que le modèle voit en ce moment, combien ça
> pèse, et qu'est-ce que je peux éteindre tout de suite ? »

**Ce qu'il affiche**, groupé par adaptateur :

| Donnée                                                                                     | Source                                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Adaptateur : `id`, `version`, `mode`, `trustTier`, `maxDataClass`, `healthy`, `lastSeenAt` | `ops_adapter`                                                                            |
| Outil : `name`, `version`, `description`                                                   | `ops_tool`                                                                               |
| `effect` et `dataClass`, **épinglés**                                                      | `ops_tool.effect`, `.dataClass`                                                          |
| Profils qui l'exposent                                                                     | `ops_tool.profiles`, typés sur `PROFILE_NAMES`                                           |
| Interrupteur                                                                               | `ops_tool.enabled`                                                                       |
| Sorti de la liste ? (déprécié, encore appelable)                                           | `ops_tool.retiredAt` → `retireDeLaListe = retiredAt !== null && retiredAt <= maintenant` |
| Poids en octets de la définition servie                                                    | `ops_tool.bytes`, dérivé par `octetsDeLaDefinition()`                                    |
| **Le compteur du profil**                                                                  | `mesurerBudgetProfil(profil, outils)` → `VerdictBudget`                                  |

**Le compteur du profil est la donnée centrale de cet écran**, et il obéit à
trois règles qui viennent du § 14 :

1. **Il mesure la liste SERVIE, jamais la déclarée.** `estServi()`
   (`core/profiles/budget.ts:265`) exige **les trois conditions** :
   `enabled && !retireDeLaListe && profiles.includes(profil)`. Un outil déclaré
   mais éteint en console ne compte pas ; un outil déprécié qui répond encore
   pendant six mois ne compte pas non plus. C'est la correction 3 du § 14 :
   « la valeur mesurée en CI n'est jamais celle qui est servie ».
2. **Rouge au-dessus de 40.** `PLAFOND_OUTILS_PAR_PROFIL`. Le seuil se lit dans
   la constante, jamais recopié dans l'écran.
3. **L'écran affiche `outilsExamines` à côté d'`outilsComptes`.** `VerdictBudget`
   porte aussi `mesureAveugle` — vrai quand la mesure a porté sur moins d'outils
   que le plancher-témoin. Un « 0 / 40 » vert parce que la requête n'a rien
   rendu doit être **distinguable** d'un « 0 / 40 » vert parce qu'aucun outil
   n'est activé. C'est exactement le défaut que ce dossier a mesuré six fois :
   un contrôle vert parce qu'il ne regarde rien.

L'écran affiche en outre `octetsMesures / plafondOctets` (le plafond bloquant est
en **octets UTF-8**, pas en tokens : aucun tokenizer n'est installé, et
`countTokens` du SDK est un appel HTTP) et `poids`, la liste par outil en ordre
décroissant — « de quoi montrer le coupable à l'écran ».

**Ce qu'il permet** :

| Action                                  | Effet                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basculer `enabled`**                  | Sans redéploiement. L'outil éteint sort de `tools/list` (relue à chaque appel, § 11) et l'étape 6 rend `tool_disabled`. **C'est le critère de fini du lot 5** : « un interrupteur bascule un outil sans redéploiement et le client le voit ». |
| **Voir le profil actif, par principal** | `ops_runtime.activeProfile`. **Changer** de profil ne se fait pas ici : c'est une opération de sécurité (§ 20), donc l'écran Politique.                                                                                                       |

**Portée des interrupteurs** : `ops_tool.enabled` côté socle **fait foi**. Le
§ 21 interdit nommément une console d'adaptateur côté Axion-IA — elle
fabriquerait un état de vérité double.

**Sans le coffre** : la lecture fonctionne (aucun déchiffrement). La bascule
aussi — c'est une écriture en base. Un écran Outils qui liste correctement
pendant que **tout appel d'outil est refusé** n'est pas une contradiction : c'est
le deuxième état du coffre qui fait son travail.

---

### 2.4 · Politique

> **La question** : « quel niveau s'applique en ce moment, à quoi, jusqu'à
> quand, et qui l'a posé par quel canal ? »

**Ce qu'il affiche** :

| Donnée                                     | Source                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Niveau **calculé**, par scope et par outil | `niveauPourEcran()` → `niveauApplique()`                                                 |
| Pourquoi ce niveau                         | `NiveauApplique.raison` : `aucune-ligne` \| `lignes-couvrantes` \| `politique-illisible` |
| Combien de lignes examinées / en vigueur   | `.mesures` / `.enVigueur`                                                                |
| Quelles lignes couvrent l'outil regardé    | `.retenues` (identifiants `ops_policy`)                                                  |
| Anomalies de lignes                        | `.anomalies` → `AnomalieLigne`                                                           |
| Échéance du desserrage                     | `ops_policy.expiresAt` des lignes retenues                                               |
| Historique daté, **avec auteur et canal**  | `ops_policy` : `setBy`, `setAt`, `channel`, `reason`, `supersededAt`                     |
| Profil actif par principal                 | `ops_runtime`                                                                            |

**Quatre points de conception, chacun adossé à un défaut mesuré** :

1. **Le TTL est évalué paresseusement, à l'affichage comme à l'appel.**
   `ligneEnVigueur(ligne, maintenant)` est appelée dans le même
   `niveauApplique()` que l'étape 10. Aucune tâche de fond ne « périme » les
   lignes : l'écran qui lirait `ops_policy.level` brut montrerait **un desserrage
   périmé comme courant** — c'est le défaut que la colonne `supersededAt` et
   cette fonction existent pour fermer.

2. **Une ligne illisible fait basculer l'écran en `brouillon`, et l'écran le
   dit.** `niveauApplique()` ne l'écarte pas : écarter une ligne corrompue qui
   portait `brouillon` **retirerait un plancher**, donc élargirait la surface.
   L'écran affiche alors `raison: "politique-illisible"` et la liste des
   anomalies — un niveau `brouillon` affiché sans son motif serait rassurant à
   tort.

3. **L'écran n'utilise QUE `niveauPourEcran`.** `docs/ETAT.md` § 4.4 mesure que
   `plancherDuScope()` / `scopeDomine()` et `niveauApplique()` **se contredisent**
   sur une politique parfaitement lisible : le même outil reçoit `libre` ou
   `brouillon` selon la façon dont sa référence a été construite. Un écran qui
   lirait `plancherDuScope` afficherait donc `libre` là où le socle applique
   `brouillon`. Tant que cette contradiction n'est pas tranchée, **l'écran est lié
   à la fonction que l'étape 10 appelle**, et cette contrainte est un contrat, pas
   une préférence.

4. **Le desserrage ne part pas de cet écran sans facteur.** `desserrer()` exige
   `SCOPE_DESSERRAGE = "ops:policy"`, un second facteur TOTP
   (`SecondFacteurTotp`, RFC 6238) et une durée bornée par
   `TTL_DESSERRAGE_MAX_MS` (24 h — valeur **proposée**, en attente de
   confirmation, `docs/ETAT.md` § 4.7). Le canal ne peut pas être `mcp`.
   L'écran montre **le résultat** : `ResultatChangement.niveauAvant`,
   `.niveauApres`, `.residuelles` — les lignes plus strictes qui survivent au
   changement et pour lesquelles il ne vaut donc pas.

**Ce qu'il permet** : resserrer (libre, immédiat), desserrer (TOTP + TTL +
`ops:policy`), changer de profil (même chemin que le desserrage — « changer de
profil change la surface exposée, donc c'est une opération de sécurité », § 14),
et lever une ligne nommément (`supersederIds`, réservé au desserrage).

**Ce qu'il n'affiche jamais** : le jeton de confirmation. Le § 20 est explicite —
il est « délivré sur le canal du desserrage et jamais dans la réponse d'erreur ».
Ce qui est affichable d'une confirmation en attente est `CiblePublique`, soit
`{ tool, argHash }` — l'empreinte, pas les arguments.

**Sans le coffre** : lecture et resserrage fonctionnent. Le **desserrage**, lui,
suppose le secret TOTP, qui vit dans le coffre : coffre fermé, il échoue — et
c'est le bon sens du fail-closed. L'écran doit dire **pourquoi** il échoue, pas
rendre une erreur générique.

---

## 3 · Les deux écrans de lecture pure

### 3.1 · Journal

> **La question** : « qu'est-ce qui s'est passé, dans quel ordre, quelle étape a
> refusé quoi, et est-ce que ce que je lis a été retouché ? »

**Ce qu'il affiche**, par ligne :

| Colonne                        | Source `ops_audit`                                                  |
| ------------------------------ | ------------------------------------------------------------------- |
| Rang                           | `seq` — **ordonner par `seq`, jamais par `at`**                     |
| Quand                          | `at`                                                                |
| Qui, quelle session            | `principal`, `sessionId`                                            |
| Quel outil, quelles versions   | `tool`, `toolVersion`, `adapterVersion`                             |
| Quel effet, à quel niveau      | `effect`, `policyLevel`                                             |
| Décision                       | `decision` ∈ `["autorisé", "refusé", "interrompu"]`                 |
| **Quelle étape a refusé**      | `stepDenied` ∈ `0..14`, libellé par `etapeParNumero()`              |
| Ce qui est sorti               | `outcome` ∈ `["ok", "compacté", "agrégé", "erreur", "non-exécuté"]` |
| Durée                          | `durationMs`                                                        |
| Sources partielles ou en échec | `partialSources`                                                    |
| Empreinte des arguments        | `argHash` — un **HMAC clé**, pas un SHA nu                          |

Et, en tête d'écran, **le verdict d'intégrité**, qui n'est jamais un booléen
seul : `verifierChaine()` → `RapportVerification` porte `lignesVerifiees`,
`valide`, `anomalies`, `clotures`, `sautsAncres`, `lignesRetireesAncrees`,
`ancresInutilisees`, `ancresHorsTranche`, `premiereSeq`, `derniereSeq`.

Quatre de ces chiffres méritent d'être à l'écran et pas seulement en test :

- `lignesVerifiees` — « `lignesVerifiees === 0` sur un journal supposé peuplé est
  le pire des verts » ;
- `lignesRetireesAncrees` — « le seul chiffre qui dise ce que le journal a
  perdu » ;
- `ancresInutilisees` — sur un journal lu en entier, un cumul non nul veut dire
  qu'une purge a déclaré une tranche **qui est pourtant toujours là** ;
- `ancresHorsTranche` — un rapport valide portant un compte non nul est « un vert
  **adossé**, pas un vert autoportant ». L'écran doit faire cette différence, ou
  il transforme une borne assumée en garantie.

**Ce que l'écran ne montre pas, par construction** : aucun contenu. § 22 :
« Aucun contenu ». La garde `verifierAucunContenu` tourne **à l'écriture** et
refuse la ligne — il n'y a donc rien à masquer à l'affichage. Sa borne est
mesurée et doit être écrite à côté du filtre : elle prouve l'absence de **texte
libre**, pas l'absence de donnée personnelle ; « un nom en un seul mot, un numéro
de téléphone, une URL courte la traversent » (`docs/ETAT.md` § 4.7).

`recordIds` est le cas délicat. Le § 12, règle 3, tranche : ce n'est **pas
anonyme**, c'est de la pseudonymisation, et sur le canal appels un identifiant
mène à une fiche portant des URL-capacités. L'écran l'affiche **masqué par
défaut**, dévoilable par un geste explicite qui écrit sa propre ligne de journal.

**Ce que l'écran permet** : filtrer (par `sessionId`, `principal`, `tool`,
`stepDenied`, fenêtre de temps — les quatre index existent), relancer la
vérification de chaîne sur une tranche, exporter. **Aucune action ne modifie
`ops_audit`** : le journal est en ajout seul.

**Une règle d'affichage imposée par un écart mesuré.** `docs/ETAT.md` § 4.6 :
`argHash` porte **deux populations**. Les terminaisons antérieures à l'étape 8
portent l'empreinte de la charge **brute** ; les suivantes portent l'empreinte
**affinée**, celle que le jeton de confirmation désigne. Rien dans la ligne ne
les distingue. Tant que la colonne booléenne n'est pas ajoutée, **l'écran lit
`stepDenied < 8`** et l'affiche : deux empreintes voisines qui ne portent pas sur
la même chose, présentées identiquement, feraient conclure à une divergence
inexistante — ou masqueraient une vraie.

**Sans le coffre** : la lecture des lignes fonctionne. La **vérification de
chaîne** aussi (SHA-256 nu, sans clé — c'est d'ailleurs son défaut, § 4.1 de
`ETAT.md`). Mais tout affichage qui **recalculerait** un `argHash` échoue :
`creerCalculArgHash` exige la clé du coffre et **fail-loud** si elle manque
(`ErreurCleArgHash`). L'écran affiche donc les empreintes stockées, jamais des
empreintes recalculées.

---

### 3.2 · Quotas

> **La question** : « où en sont les compteurs, contre quels plafonds, et
> lesquels vont mordre ? »

**Ce qu'il affiche**, pour chaque compteur :

| Donnée                           | Source                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Clé et libellé                   | `CLES_LIMITES` et `LIMITES_DE_DEPART[cle].libelle`                                                        |
| Fenêtre canonique                | `fenetreCanonique()` → `ops_quota.window`                                                                 |
| Portée (outil / principal)       | `LIMITES_DE_DEPART[cle].portee` ; `TOUT_OUTIL = "*"` pour une portée `principal`                          |
| Consommation                     | `ops_quota.count`                                                                                         |
| **Plafond**                      | `ops_quota.limit`                                                                                         |
| **Seuil d'alerte**               | `ops_quota.warnAt` — en valeur absolue                                                                    |
| Réarmement                       | `ops_quota.resetAt`                                                                                       |
| Ce qui s'appliquerait à un appel | `resoudreCompteurs({ tool, effect, principal, limiteOutil, warnAtOutil, maintenant })` → `PlanCompteur[]` |

Les quatre limites de départ sont dans le code, pas dans l'écran :
rafale 10 / 10 s · lecture 60 / h · écriture 20 / h · jeton 300 / h. Un outil
peut porter son propre dénominateur (`ops_tool.limit`, `ops_tool.warnAt`) ;
`resoudreCompteurs` le préfère au défaut pour les compteurs de portée `outil`.

**La règle qui fait tout l'écran** : _un compteur sans dénominateur ne peut ni
refuser ni alerter à 80 %_ (§ 12). L'écran n'affiche **jamais** un `count` seul.
`EtatCompteur` le dit explicitement — « c'est elle qu'on affiche : “61 / 60” ne
veut rien dire ».

**Ce qu'il permet** : filtrer par principal, par outil, par fenêtre.
**Aucune remise à zéro manuelle** n'est proposée : `resetAt` fait le travail, et
un bouton « remettre à zéro » serait un desserrage déguisé qui ne passerait par
aucune des quatre protections du § 20.

**Sans le coffre** : lecture en base, aucun déchiffrement — l'écran fonctionne.

> ⚠️ **Cet écran n'a pas de chemin de lecture.** Voir le manque **M-6** au § 5 :
> `DepotQuota` n'expose que `incrementerSiSousLePlafond` et `decrementer`.
> Aucune méthode ne **lit** un compteur.

---

## 4 · Les deux écrans qui rendent compte

### 4.1 · Santé

> **La question** : « est-ce que le socle est en état de servir, et est-ce que
> mes gardes regardent réellement quelque chose ? »

Le § 22 énumère sept données. Voici chacune, avec sa source :

| Donnée (§ 22)                                           | Source                                                                                                        | État                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Coffre, 3 états**                                     | `Coffre.sante()` → `etat`, `vaultLocked`, `keyIdPrincipal`, `keyIdsConnus`, `sourceDeCle`, `ouvreAuDemarrage` | ✅ existe                           |
| **Jetons rafraîchissables**                             | `ops_token` : `kind = "refresh" AND revokedAt IS NULL AND expiresAt > now()`, par `principal`                 | ✅ existe                           |
| **Adaptateurs joignables**                              | `ops_adapter.healthy`, `.lastSeenAt`                                                                          | ⚠️ colonnes sans écrivain — **M-4** |
| **Dernier battement**                                   | —                                                                                                             | 🔴 **aucune source** — **M-3**      |
| **`bootstrapCount`**                                    | `Coffre.lireAmorcage(nom, version)` → `CompteurDAmorcage { compte, plafond, reste }`                          | ✅ existe                           |
| **`attestedAt`** (et `attestationExpiresAt`)            | —                                                                                                             | 🔴 **aucune colonne** — **M-1**     |
| **Nombre d'extraits indexés** par l'index de provenance | —                                                                                                             | 🔴 **aucun module** — **M-2**       |

**Les trois données que le § 22 met en avant, et pourquoi :**

**`bootstrapCount`** — § 27 : « un plafond qu'on ne compte pas est un mur qu'on
découvre en le percutant ». La régénération du refresh token Zoho est plafonnée
côté Zoho ; chaque amorçage en trop est **irrécupérable**. L'écran affiche le
compte **et le reste** (`CompteurDAmorcage.reste`), et il est lisible **coffre
verrouillé** — c'est explicite dans le code, « un compteur qu'on ne peut lire que
quand tout va bien ne sert à rien le jour où ça va mal ». Le § 25 impose de le
lire **avant** de relancer un bootstrap sur `invalid_grant`.

**`attestedAt`** — § 16 : la clé du coffre ne va dans Coolify que sous condition
de révocation du jeton d'API, et la question du bootstrap a été reformulée parce
que « as-tu révoqué ? » n'est pas vérifiable par celui qui répond. La nouvelle
formulation demande de **lister les jetons existants et de confirmer qu'aucun
n'est stocké dans un système automatisé disposant du droit de lecture des
variables d'environnement**, avec « `attestedAt` / `attestationExpiresAt`
affichés à l'écran Santé, et réattestation obligatoire à chaque rotation de clé
et à chaque création de jeton ». **Aucune de ces deux colonnes n'existe** (M-1) —
une attestation qui n'a pas de date de péremption affichée est une case cochée
une fois pour toujours.

**Le nombre d'extraits indexés** — § 20 et § 31 : l'index de provenance est une
**exception motivée et bornée** à la règle « aucun cache de contenu sur disque »,
et le prix de l'exception est que « le healthcheck expose le nombre d'extraits
indexés — **signal positif, pour qu'une garde à zéro élément se voie** ». C'est
la donnée la plus importante de l'écran, et **elle n'a pas de source** (M-2) : le
module `core/provenance/` n'existe pas (`docs/ETAT.md` § 3.1). Un écran Santé qui
afficherait « 0 extrait marqué » sans distinguer « rien à marquer » de « le module
n'existe pas » fabriquerait exactement le vert rassurant que le § 20 cherche à
rendre impossible.

**Ce que l'écran permet** : relancer la vérification de chaîne du journal
(§ 24, alerte critique), sonder les adaptateurs, re-attester (M-1). Il ne
**modifie** rien d'autre.

**Sans le coffre** : **obligatoire, et c'est le point le plus délicat des huit
écrans.** Le healthcheck rend **200 avec `vaultLocked: true`** — pas 503, parce
que « sans le deuxième état, le repli “déverrouillage au démarrage” rend rouge
chaque déploiement », et que ce repli est **le mode par défaut du chantier** tant
que la décision W-4 n'est pas tranchée. Donc, coffre fermé :
`sante()` répond (`keyIdsConnus` vide, `keyIdPrincipal` à `null`),
`lireAmorcage()` répond, `ops_token` et `ops_adapter` se lisent en base. Ce qui
**ne** répond pas, ce sont les sondes qui ont besoin d'un secret pour parler à un
adaptateur : l'écran les affiche **« non mesurable, coffre fermé »**, jamais
« injoignable ». Confondre les deux ferait sonner une alerte critique à chaque
déploiement.

---

### 4.2 · Découvertes

> **La question** : « qu'est-ce qui a changé du côté des adaptateurs depuis la
> dernière fois que j'ai regardé, et qu'est-ce que j'en fais ? »

Le § 22 range cet écran en **coquille au lot 5, bascule au lot 9**. La coquille
est légitime ; ce qui ne l'est pas serait une coquille qui n'annonce pas qu'elle
en est une.

**Ce qu'il afficherait** :

| Donnée                            | Source `ops_discovery`                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| Adaptateur concerné               | `adapterId`                                                             |
| Nature de la trouvaille           | `kind` — nouveau domaine, champ ajouté, champ disparu, `effect` modifié |
| Ce qui a été trouvé               | `subject`, sous forme canonique                                         |
| Depuis quand, vu la dernière fois | `firstSeenAt`, `lastSeenAt`                                             |
| Décision humaine                  | `status`, `decidedBy`, `decidedAt`                                      |

**Ce qu'il permettrait** : proposer une nouvelle table **désactivée**, ignorer un
sujet, accepter un changement. L'unicité `(adapterId, kind, subject)` est ce qui
fait tenir « ignorer » : « sans l'unicité, l'action _ignorer_ ne survit pas au
scan suivant » — le scan réinsérerait le même sujet et la décision humaine serait
perdue en silence.

**Le lien avec l'épinglage du § 20.** « Tout écart entre la valeur épinglée et la
valeur reçue **désactive l'outil et alerte**, au lieu de mettre à jour en
silence. Un `effect` basculé de `send` à `read` n'est ni un champ ajouté ni un
champ disparu : sans cette règle il n'apparaît nulle part. » C'est le producteur
naturel des lignes `ops_discovery` — et **il n'existe pas** (M-5). Le registre,
lui, détecte bien `empreinte_divergente` et `epinglage_incoherent`, mais il
**refuse l'enregistrement** : il ne produit aucune ligne de découverte, et un
adaptateur refusé n'apparaît nulle part dans la console.

**Sans le coffre** : lecture en base, l'écran fonctionne. Le **scan**, lui, parle
aux adaptateurs et suppose leurs secrets : coffre fermé, il ne tourne pas, et
l'écran affiche la date du dernier scan réussi plutôt qu'une liste vide.

---

## 5 · Huit manques du socle, à combler avant le lot 5

Chacun est une donnée que le § 22 demande et qui n'existe **dans aucune table ni
aucune fonction**. Ils sont classés par ce qu'ils coûtent, pas par gravité.

| #       | Ce qui manque                                             | Écran         | Où ça se répare                       |
| ------- | --------------------------------------------------------- | ------------- | ------------------------------------- |
| **M-1** | `attestedAt` / `attestationExpiresAt`                     | Santé         | Migration de schéma                   |
| **M-2** | L'index de provenance, et sa taille                       | Santé         | Lot 3.5 (`core/provenance/`)          |
| **M-3** | Le dernier battement de veille                            | Santé         | Décision de source, puis lecture      |
| **M-4** | Ce qui écrit `ops_adapter.healthy` / `lastSeenAt`         | Santé, Outils | Sonde, lot 2 ou lot 5                 |
| **M-5** | Ce qui produit une ligne `ops_discovery`                  | Découvertes   | Lot 9 — mais l'épinglage est au lot 1 |
| **M-6** | Une lecture de compteur qui ne consomme pas               | Quotas        | `core/limits`, méthode à ajouter      |
| **M-7** | La bascule de `ops_tool.enabled`, et l'étape 6 qui la lit | Outils        | `core/catalogue/`, absent             |
| **M-8** | De quoi distinguer les deux populations d'`argHash`       | Journal       | Colonne — **change le chaînage**      |

### M-1 · L'attestation n'a aucune colonne

`grep -i attest` sur `prisma/schema.prisma` et sur `core/**/*.ts` ne rend que des
occurrences relatives à la **clôture de purge du journal** (`core/audit/`) —
aucune ne concerne l'attestation du § 16. `ops_secret` porte `rotatedAt` et
`bootstrapCount`, jamais `attestedAt`.

**Décision demandée** : deux colonnes sur `ops_secret` (l'attestation porte sur la
ligne de clé, ce qui la fait naturellement expirer avec une rotation), ou une
onzième table. C'est une **migration**, donc antérieure au lot 5. Sans elle, la
condition posée au § 16 — « réattestation obligatoire à chaque rotation de clé et
à chaque création de jeton » — n'a **aucun support**, et la seule chose que
l'écran pourra afficher est du texte saisi à la main.

### M-2 · L'index de provenance n'existe pas, donc son compteur non plus

`docs/ETAT.md` § 3.1 mesure que **cinq étapes du § 11 n'ont aucun propriétaire**,
dont l'étape 11 (`core/provenance/`). Le § 20 exige que le healthcheck expose la
taille de l'index, et le § 32 place ce travail au **lot 3.5**, avant le lot 6.

**Le conflit d'ordre est réel** : le lot 5 (console) précède le lot 6, mais le
§ 22 demande cette donnée à l'écran Santé. Deux issues, et une seule est
acceptable : soit le lot 3.5 passe avant le lot 5, soit l'écran affiche
explicitement **« index de provenance : module absent »** — jamais « 0 ».

### M-3 · Le battement de veille n'a ni table, ni colonne, ni fonction

`grep -i "battement|veille|heartbeat"` sur `core/` ne rend **qu'un commentaire**
(`core/vault/coffre.ts:87`, qui recopie la liste du § 22). Aucune des dix tables
ne porte la date du dernier battement.

Le § 24 pose la contrainte qui rend la chose non triviale : le récepteur de la
veille n'est **ni sur le VPS, ni dans une application** — sinon « le processus
qui aurait dû prévenir était lui-même coupé du réseau ». Donc la donnée que
l'écran Santé affiche vient nécessairement **de l'extérieur** : soit le socle
interroge le service de veille à l'affichage, soit il stocke l'accusé de
réception d'un battement.

**Décision demandée** : laquelle des deux. Et la garde qui va avec — une veille
muette ne distingue pas sa propre mort ; le seul affichage honnête est **la date
du dernier battement effectivement constaté**, jamais « OK ».

### M-4 · Rien n'écrit `ops_adapter.healthy` ni `lastSeenAt`

Les deux colonnes existent (`healthy` avec `@default(false)`, `lastSeenAt`
nullable). `core/registry/enregistrer.ts` produit les lignes `ops_adapter` à
l'enregistrement ; **aucune fonction de `core/` ne les met à jour ensuite.** Il
n'y a pas de sonde.

Conséquence : l'écran Santé afficherait tous les adaptateurs à `healthy: false`,
`lastSeenAt: null`, pour toujours — un rouge permanent qu'on apprend à ignorer,
ce qui est pire qu'un vert. Et le § 24 range « adaptateur injoignable > 5 min »
parmi les alertes : elle n'a aucune source.

### M-5 · `ops_discovery` a une table et zéro ligne de code

Aucun fichier de `core/` ne mentionne la découverte. La table, ses index et son
unicité existent ; le producteur n'existe pas.

Ce n'est pas seulement un manque du lot 9. La règle d'**épinglage** du § 20 —
« tout écart entre la valeur épinglée et la valeur reçue désactive l'outil et
alerte » — est un mécanisme du lot 1, et son seul lieu d'affichage naturel est
cet écran. Aujourd'hui : le registre **refuse** l'enregistrement d'un manifeste
divergent (`empreinte_divergente`, `epinglage_incoherent`, `bytes_incoherent`) et
ce refus **n'apparaît dans aucune console**. Un `effect` basculé de `send` à
`read` chez un adaptateur produit donc un refus d'enregistrement silencieux, pas
une découverte.

**Décision demandée** : la coquille du lot 5 affiche-t-elle déjà les refus du
registre — qui, eux, existent — ou reste-t-elle vide ? Une coquille vide qui
n'annonce pas qu'elle est vide est une garde à zéro élément de plus.

### M-6 · Aucune lecture de compteur qui ne consomme pas

`DepotQuota` (`core/limits/quota.ts`) déclare exactement **deux** méthodes :
`incrementerSiSousLePlafond(demande)` et `decrementer(cle)`. Il n'y a **aucune
lecture**.

L'écran Quotas ne peut donc pas afficher un `count` sans l'incrémenter — c'est le
motif « une commande de diagnostic qui écrit un état », mesuré ailleurs dans ce
dossier, et il transformerait chaque consultation de la console en consommation
de quota.

Ce qui **existe** et se lit sans rien toucher : `resoudreCompteurs()`, qui rend
les `PlanCompteur` — clé, libellé, fenêtre canonique, outil, principal, `limit`,
`warnAt`, `resetAt`. **Tout le dénominateur, jamais le numérateur.**

**Décision demandée** : ajouter `lire(cle): Promise<EtatCompteur | null>` au
contrat `DepotQuota`. C'est une méthode, pas un lot — mais elle appartient à
`core/limits`, hors du périmètre d'écriture du lot 5. À noter aussi
(`docs/ETAT.md` § 5) : aucun double en mémoire de `DepotQuota` n'est exporté, si
bien que la console n'a rien contre quoi coder ses gardes.

### M-7 · La bascule d'interrupteur n'a ni fonction ni étape

`ops_tool.enabled` existe et vaut `false` par défaut. `core/registry` **produit**
la ligne à l'enregistrement ; rien ne la **bascule** ensuite. Et l'étape 6 de la
chaîne — « l'outil existe et est activé », refus `tool_disabled` — n'a **aucun
module** (`docs/ETAT.md` § 3.1, `core/catalogue/` à écrire).

Or le **critère de fini du lot 5** est nommément : « un interrupteur bascule un
outil sans redéploiement et le client le voit ». Ce critère traverse trois
absences : la bascule, l'étape 6 qui la lit, et la relecture de `tools/list`.
Traiter cela comme du travail d'interface le ferait sous-estimer d'un facteur
important.

### M-8 · Le journal ne distingue pas ses deux `argHash`

`docs/ETAT.md` § 4.6. Le remède est une colonne booléenne sur `ops_audit` — et
elle **entrerait dans l'empreinte chaînée**, donc elle change le calcul du
journal. À décider **avant le premier chaînage réel**, pas à glisser après.
D'ici là, la règle d'affichage du § 3.1 (`stepDenied < 8`) est le contournement
correct, et il doit être **écrit à l'écran**, pas seulement dans le code.

---

## 6 · Trois autres constats, sans manque de données

**6.1 — La confirmation ne survit pas à un redémarrage.** Les jetons de
confirmation sont **en mémoire** (`DepotJetonsConfirmationMemoire`) ; aucune des
dix tables ne les porte, et `ops_token` n'a ni `argHash` ni `tool`, c'est-à-dire
précisément la liaison qui fait leur valeur. C'est **retenu et défendable** :
leur durée de vie se compte en minutes et un redémarrage les efface, ce qui va
dans le sens du fail-closed. Conséquence pour l'écran Politique : il affiche
« confirmations en attente » comme un état **volatil**, et une confirmation
demandée avant un redéploiement doit être redemandée après.

**6.2 — Le journal reste falsifiable par qui a `UPDATE` sur sa table.**
`docs/ETAT.md` § 4.1 : le chaînage est un SHA-256 **nu**, et aucun rôle
PostgreSQL append-only n'existe. `verifierChaine` rend alors `valide = true` sur
un journal amputé puis recalculé. L'écran Journal affiche donc un verdict dont le
modèle d'attaquant est **borné**, et il doit nommer cette borne — sinon il
transforme un périmètre d'observation en garantie.

**6.3 — Une ligne de politique qui ne couvre rien n'est visible nulle part.**
`docs/ETAT.md` § 4.4 demande la garde manquante : « une ligne d'`ops_policy` en
vigueur dont le scope ne couvre **aucun** outil enregistré est une anomalie
affichée, **qui annonce le nombre d'outils confrontés** ». Les deux tables
existent (`ops_policy`, `ops_tool`) ; la fonction, non. C'est un ajout à l'écran
Politique, pas un manque de données.

---

## 7 · Conséquence sur le chiffrage

Le § 33 chiffre le lot 5 à **2,5 jours**. Ce chiffre suppose que les huit écrans
n'ont qu'à afficher des données existantes. Trois écrans sur huit ne le peuvent
pas.

| Poste                                                       | Charge       | Lot d'accueil                           |
| ----------------------------------------------------------- | ------------ | --------------------------------------- |
| Les huit écrans, sur les données qui existent               | 2,5 j        | 5 (chiffrage inchangé)                  |
| M-1 · colonnes d'attestation + migration                    | 0,25 j       | avant 5                                 |
| M-6 · lecture de compteur + double en mémoire               | 0,25 j       | avant 5 (`core/limits`)                 |
| M-4 · sonde d'adaptateur qui écrit `healthy` / `lastSeenAt` | 0,5 j        | 2 ou 5                                  |
| M-7 · `core/catalogue/` (étape 6) + bascule                 | 0,5 j        | **critère de fini du lot 5**            |
| M-3 · source du battement — après décision                  | 0,25 j       | 5                                       |
| M-2 · index de provenance                                   | déjà chiffré | **3.5 (1,5 j)** — à ordonnancer avant 5 |
| M-5 · producteur de découvertes                             | déjà chiffré | 9 (1 j)                                 |
| M-8 · colonne d'`argHash` — décision, pas construction      | ~0           | avant le premier chaînage               |

**Charge à ajouter au lot 5 : + 1,75 j** — soit **4,25 j** au lieu de 2,5 j —
**et** l'ordonnancement du lot 3.5 avant le lot 5, faute de quoi l'écran Santé
sort avec sa donnée la plus importante manquante.

Ce n'est pas un dépassement : c'est le coût de trois données que le § 22 demande
et que le § 12 n'a jamais posées.

---

## 8 · Ce que cet ADR n'a pas pu vérifier

Écrit ici parce qu'un écart signalé vaut mieux qu'un trou comblé par une
supposition.

- **Aucune base ne tourne, aucune migration n'a été lancée.** Tout ce qui est dit
  des dix tables est lu dans `prisma/schema.prisma`, jamais dans un
  `information_schema`. Une colonne présente dans le schéma n'est pas une colonne
  présente en base.
- **`console/` est vide.** Aucun écran n'existe ; aucune de ces sources n'a été
  observée servie à un navigateur. La vérification qui lèverait le doute est le
  critère de fini du lot 5 lui-même : arrêt d'urgence depuis un téléphone, puis
  déverrouillage depuis le même téléphone.
- **Le comportement « servi sans le coffre » est dérivé, pas mesuré.** Il est
  déduit de `decisionDeDemarrage()`, de `ROUTES_SANS_COFFRE` et des méthodes de
  `Coffre` qui n'appellent pas `exigerOuvert()` — lecture de code, pas exécution
  d'un socle verrouillé.
- **Les manques ont été établis par recherche de motifs sur `core/` et
  `prisma/`.** Un `grep` ne prouve que l'absence de la **forme écrite** : si l'un
  de ces mécanismes existe sous un autre nom que ceux cherchés
  (`attest`, `battement`, `veille`, `heartbeat`, `provenance`, `discovery`,
  `découverte`), le constat tombe. Les motifs sont écrits ici pour être rejoués.
- **Le nombre exact d'écrans dont l'affichage exige un secret n'a pas été
  mesuré**, faute d'adaptateur : aujourd'hui `adapters/` est vide, et aucun
  appel réel ne traverse le coffre.
