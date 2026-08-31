# ADR 0011 — Les lectures sans session, agrégateur par agrégateur

- **Statut** : proposée — inventaire de mesure, aucune décision d'écriture
- **Date** : 2026-08-31
- **Portée** : lot 4a, dépôt `axionia` (travaux préalables) ; adaptateur Axion-IA
  du lot 4b ; outils `axionia.inbox.*`, `axionia.agenda.*`,
  `axionia.rendezvous.*`, `axionia.pilotage.*`, `axionia.qualiopi.*`
- **Sources** : cahier des charges v6, § 10 (l'existant à ne pas refaire),
  § 28 (adaptateur Axion-IA), § 32 (lots), § 35 (mesures ouvertes)
- **Méthode** : lecture seule du dépôt `axionia`, le 2026-08-31. **Aucune
  commande n'a été exécutée dans ce dépôt** — ni `pnpm`, ni `git` qui écrit, ni
  test. Tout ce qui suit est une lecture de fichier, pas une exécution.

> **Avertissement de dérive.** Les numéros de ligne cités ci-dessous sont ceux
> du 2026-08-31. Le § 28 du cahier des charges cite pour la même chaîne
> `queries.ts:85-86` et `actions.ts:113-114 → :50-54` ; les fichiers ont bougé
> depuis (`admin-inbox/queries.ts` et `admin-agenda/queries.ts` datent du
> 2026-08-30 17 h 44). Les décalages relevés sont de 1 à 3 lignes, et ils
> désignent le même code. **Un numéro de ligne n'est pas une adresse durable :
> vérifier le symbole, pas le rang.**

---

## 1 · Le précédent, et c'est le dépôt lui-même qui l'a posé

`src/features/admin-submissions/` porte deux modules et une frontière nette
entre eux. Elle n'a pas été inventée pour le MCP : elle date du **2026-08-18**,
et elle a été posée pour une tout autre raison.

| Fichier      | Lignes | `"use server"`  | Ce qu'il contient                                                                                                    |
| ------------ | -----: | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `query.ts`   |    174 | **non**         | Schéma Zod des filtres, construction du `where`, portée journalisée. Aucune I/O.                                     |
| `actions.ts` |    629 | **oui** (l. 10) | Les Server Actions, et **les gardes** : `requireAdminWriteSession` (l. 41-49), `requireAdminReadSession` (l. 51-55). |

Le motif, écrit dans l'en-tête de `query.ts` (l. 4-22) :

> « Le listing et l'export CSV construisaient chacun **leur** `where`, à deux
> endroits de `actions.ts`. Celui de l'export en avait oublié quatre clauses. […]
> Deux `where` séparés divergent toujours. Il n'y en a plus qu'un. »

et la contrainte technique, l. 20-22 :

> « ⚠️ Ce fichier n'est **pas** un module `"use server"` : il exporte des
> fonctions synchrones, ce que Next.js interdit dans un fichier de Server
> Actions. »

**Le motif est donc à trois étages, et les trois comptent.**

1. **La garde reste dans l'enveloppe.** `actions.ts` conserve `auth()` ; le
   module extrait n'en a jamais vu.
2. **La règle n'existe qu'une fois.** Ce qui est extrait est ce que deux
   appelants partageaient déjà — sinon l'extraction fabrique la seconde vérité
   qu'elle prétend éviter.
3. **Le module extrait n'est pas `"use server"`.** C'est ce qui le rend
   importable par n'importe quoi — un RSC, un test, un handler de route.

Un second précédent, plus proche encore de ce qu'il faut faire, existe déjà :
`src/features/admin-inbox/reads.ts` (97 lignes) **importe Prisma**, n'est pas
`"use server"`, et ne lit aucune session — il reçoit `adminUserId` en paramètre
(l. 74-76). C'est la forme exacte que doivent prendre les modules à extraire :
`query.ts` pour la forme du fichier, `reads.ts` pour le fait d'accéder à la base
sans identité propre.

**L'extraction du lot 4a est donc une répétition de ces deux fichiers, pas une
invention.**

---

## 2 · Ce qui bloque réellement — et ce qui ne bloque pas

Mesure par balayage des cinq chaînes complètes (fichier par fichier :
directive `"use server"` en tête, import de `next/*`, import de `@/auth`) :

| Module                                         | `"use server"` | import `next/*`      | import `@/auth` |
| ---------------------------------------------- | -------------- | -------------------- | --------------- |
| `features/admin-inbox/queries.ts`              | non            | 0                    | 0               |
| `features/admin-inbox/reads.ts`                | non            | 0                    | 0               |
| `features/admin-inbox/counters.ts`             | non            | 1 (`unstable_cache`) | 0               |
| `features/admin-agenda/queries.ts`             | non            | 0                    | 0               |
| `features/admin-rendezvous/queries.ts`         | non            | 0                    | 0               |
| `features/admin-planning/hub-queries.ts`       | non            | 0                    | 0               |
| `features/admin-planning/hub.ts`               | non            | 0                    | 0               |
| `server/qualiopi/alertes/alertes-service.ts`   | non            | 0                    | 0               |
| `server/qualiopi/alertes/evaluateur.ts`        | non            | 0                    | 0               |
| `server/google-calendar/events.ts` · `auth.ts` | non            | 0                    | 0               |

**Aucun de ces dix fichiers ne lit de session.** Le blocage n'est ni la
directive `"use server"`, ni le runtime Next : la route MCP vivra dans le même
processus Next (`src/app/api/mcp/route.ts`, § 28), où `unstable_cache` et
`next/cache` fonctionnent normalement.

**Le seul blocage est `auth()`**, et il est _transitif_ : il n'apparaît que
lorsque `admin-inbox/queries.ts` appelle les Server Actions de deux autres
features. NextAuth est configuré en **stratégie JWT porté par cookie**
(`src/auth.ts:65`). Un appel MCP porte un jeton `Bearer`, jamais un cookie de
session de navigateur : `auth()` rend `null`, et la garde **lève**
`new Error("unauthorized")`. Ce n'est pas un plantage de contexte, c'est un
refus — et il est correct. Il faut donc contourner la garde par extraction, pas
la neutraliser.

### Note sur « un agrégateur sur six »

Le § 28 écrit : « Mesuré agrégateur par agrégateur : vrai pour un sur six. »
La mesure du 2026-08-31 confirme la conclusion pratique et précise le compte.

- **Appelables sans session, tel quel** : quatre sur cinq — `admin-agenda`,
  `admin-rendezvous`, `admin-planning/hub`, `qualiopi/alertes`.
- **Appelables sans session ET portant déjà leur habilitation dans la
  signature** : **un seul — `getAgendaFenetre`**, dont le paramètre
  `peutVoirAppels` est obligatoire et sans valeur par défaut
  (`admin-agenda/queries.ts:135`).

C'est cette seconde lecture que le § 28 traduit par « prêt » : les trois autres
sont importables, mais **ne portent aucune habilitation** — leur appelant
actuel est une page de console, et c'est la page qui décide. Un appelant MCP qui
les brancherait telles quelles servirait tout à tout le monde. **Le travail du
lot 4a n'est donc pas seulement d'extraire une lecture : c'est aussi de faire
entrer l'habilitation dans la signature là où elle n'y est pas.**

---

## 3 · Le drapeau d'habilitation, en tête

Le drapeau `peutVoirAppels` est le seul de son espèce dans les cinq chaînes.
Il gouverne les coordonnées des prospects.

- **Le prédicat** : `peutVoirLesAppels(role)` —
  `src/features/admin-calendly/acces.ts:100`.
- **La liste de rôles** : `ROLES_APPELS` — même fichier, l. 91-95, dérivée du
  type `RoleAdmin` du SSOT `@/server/auth/habilitations`. Trois rôles :
  `super_admin`, `admin`, `editor`. **Plus étroite que le prédicat d'écriture
  générique du dépôt**, et l'écart est une décision de Will du 2026-08-27 : la
  lecture s'aligne sur l'écriture du domaine.
- **Deux régimes**, posés par le même fichier (l. 48-73) :
  - **refus** — `gardeLectureAppels(destinationLogin)` (l. 127), pour les écrans
    dédiés aux appels ;
  - **filtre** — `peutVoirLesAppels(role)` passé en paramètre, pour les écrans
    mixtes (agenda, boîte de réception).

**Pour le socle, c'est le régime FILTRE qui s'applique**, dans les deux cas :
un outil vocal qui refuse tout un agrégateur parce qu'un canal sur quatre est
sensible rend le poste inutilisable. Le drapeau doit donc être **un paramètre
d'entrée de chaque outil**, calculé côté socle depuis le profil, jamais deviné.

---

## 4 · Inventaire par agrégateur

### 4.1 · `admin-inbox` — le seul qui exige une extraction

|                        |                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| **Fonction appelable** | `listInbox(filters?: InboxFilters): Promise<InboxResult>`                                       |
| **Fichier:ligne**      | `src/features/admin-inbox/queries.ts:268`                                                       |
| **`"use server"`**     | non — importable tel quel                                                                       |
| **Session exigée à**   | **transitivement, en deux endroits** (voir ci-dessous)                                          |
| **Droits tirés**       | `filters.peutVoirAppels` (déclaré l. 229, **défaut `false`**) et `filters.adminUserId` (l. 219) |
| **Verdict**            | **extraction obligatoire** — deux des quatre canaux passent par une Server Action gardée        |

Chaîne d'appel complète, canal par canal :

| Canal         | Appelé depuis                                  | Cible                                                              | Session ? |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------ | --------- |
| `appel`       | `queries.ts:127` (`fetchAppels`, l. 126)       | `listRendezVous` — `admin-rendezvous/queries.ts:63`                | **non**   |
| `message`     | `queries.ts:88` (`fetchMessages`, l. 87)       | `listSubmissionsAction` — `admin-submissions/actions.ts:113`       | **oui**   |
| `candidature` | `queries.ts:158` (`fetchCandidatures`, l. 157) | `listApplicationsAction` — `admin-job-applications/actions.ts:103` | **oui**   |
| `podcast`     | `queries.ts:179` (`fetchPodcast`, l. 175)      | `prisma.podcastRequest.findMany` en direct                         | **non**   |

Les deux gardes, précisément :

| Action                                              | Garde appelée               | Fichier:ligne de la garde                 | `auth()`  | Ce qu'elle exige                                                                                                      |
| --------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `listSubmissionsAction` (l. 113, garde l. **116**)  | `requireAdminReadSession()` | `admin-submissions/actions.ts:51-55`      | **l. 52** | une session avec `user.id`. **Aucun contrôle de rôle** — toute session admin passe.                                   |
| `listApplicationsAction` (l. 103, garde l. **104**) | `requireAdminRead()`        | `admin-job-applications/actions.ts:57-63` | **l. 58** | une session avec `user.id`, **plus** `peutOuvrirDossierCandidat(role)` (l. 61), rôle par défaut `"reader"` si absent. |

**Ce qu'il faut extraire.**

1. **`admin-submissions`** — sortir le corps de `listSubmissionsAction`
   (l. 113 → 236, ≈ 124 lignes : construction du `select`, `mapRow` avec
   `decryptPii`, recherche en mémoire, pagination) vers une fonction
   `listSubmissions(input): Promise<SubmissionListResult>` dans un module
   **non `"use server"`**. `actions.ts` conserve la garde et devient une
   enveloppe de quatre lignes :
   `await requireAdminReadSession(); return listSubmissions(input);`
   ➤ **Ne pas la mettre dans `query.ts`** : ce fichier est délibérément sans
   I/O (aucun import Prisma) et `export-csv.test.ts` s'appuie sur cette
   propriété. Créer un `reads.ts` frère, sur le modèle de
   `admin-inbox/reads.ts`. `query.ts` reste la SSOT du `where` et est importé
   par les deux.
   ➤ Appelants à revalider : 2 hors tests (`SubmissionsV2.tsx:93` et
   `admin-inbox/queries.ts:88`).

2. **`admin-job-applications`** — même geste sur `listApplicationsAction`
   (l. 103 → ≈ 160, ≈ 58 lignes). Cette feature n'a **aucun** module non
   `"use server"` aujourd'hui : `reads.ts` est un fichier neuf. La garde
   `peutOuvrirDossierCandidat` reste dans `actions.ts` — c'est elle qui porte le
   rôle, et elle n'a rien à faire dans une lecture.
   ➤ Appelants à revalider : 2 hors tests (`contacts/candidatures/page.tsx:62`
   et `admin-inbox/queries.ts:158`).

3. **`admin-inbox/queries.ts`** — rebrancher `fetchMessages` (l. 88) et
   `fetchCandidatures` (l. 158) sur les deux lectures extraites. **Et corriger
   l'en-tête du fichier** (l. 3-8), qui justifie encore la réutilisation des
   actions par « elles portent déjà le contrôle de session » : après extraction,
   c'est faux des quatre canaux. Le fichier a déjà payé une fois pour cette
   phrase (rectification du 2026-08-27, l. 13-18) ; la laisser telle quelle
   ferait le même effet une seconde fois.

**Points d'attention mesurés, à ne pas perdre dans l'extraction :**

- `PER_CHANNEL_FETCH = 100` (l. 57) est plafonné par le `pageSize.max(100)` des
  deux schémas Zod. Au-delà, le `.parse()` **lève**. Les lectures extraites
  doivent conserver leur validation Zod, sinon le plafond cesse d'exister
  silencieusement.
- `InboxResult.failedChannels` (l. 262) et `truncated` (l. 254) existent parce
  qu'un canal en panne se lisait comme un canal vide. **L'outil MCP doit les
  rendre** — le § 28 exige déjà `failedSources` pour `zoho.mail.triage`, c'est
  la même règle.
- `InboxItem.detailHref` (l. 94, 139, 164, 197) est construit par `adminPath()`,
  qui lit `ADMIN_URL_PREFIX`. **Aucun outil ne doit le rendre** (§ 28) :
  l'adaptateur émet un identifiant opaque que la console résout.
- `counters.ts:75` (`getInboxActionCounts`, `unstable_cache` 30 s) est un
  **second chemin** vers les mêmes chiffres, par quatre `count()` SQL. Il ne
  passe par aucune action et est donc appelable tel quel. Son en-tête (l. 14-16)
  impose que ses critères restent le miroir exact des `needsAction` de
  `queries.ts` — un outil qui servirait les deux devrait les servir cohérents.

---

### 4.2 · `admin-agenda` — prêt, et c'est le modèle

|                        |                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fonction appelable** | `getAgendaFenetre(debut: Date, fin: Date, peutVoirAppels: boolean): Promise<AgendaFenetre>`                                                |
| **Fichier:ligne**      | `src/features/admin-agenda/queries.ts:124-136`                                                                                             |
| **`"use server"`**     | non                                                                                                                                        |
| **Session exigée**     | **nulle part dans le module.** Elle vit chez l'appelant : `agenda/page.tsx:135` (`auth()`), l. 136 (`peutVoirLesAppels`), l. 137 (l'appel) |
| **Droits tirés**       | `peutVoirAppels`, **paramètre obligatoire, sans valeur par défaut** (l. 135)                                                               |
| **À extraire**         | **rien**                                                                                                                                   |

C'est la seule signature des cinq qui **oblige le compilateur à trancher**. Son
commentaire (l. 127-134) le dit : un défaut à `true` ferait fuiter par oubli, un
défaut à `false` masquerait pour un administrateur légitime — donc pas de
défaut. **C'est le contrat que les trois autres agrégateurs doivent adopter.**

Le filtrage descend jusqu'au `select` Prisma (l. 82-84) : `inviteeName`,
`inviteePhone` et `location` ne sont **même pas sélectionnés** sans habilitation.
Une donnée non lue ne peut pas fuiter par un journal ni par un message d'erreur.
C'est plus fort qu'un masquage après lecture, et le socle doit préférer ce motif
partout où il est possible.

Deux réserves pour l'adaptateur :

- `AgendaItem.detailHref` (l. 108) est un `adminPath()` — à supprimer de la
  charge utile.
- `AgendaFenetre.diagnostics` (l. 194-201) porte `googleConfigure`, `googleOk`,
  `googleRaison`, `googleTronque`. **L'outil doit les rendre** : le module ne
  lève jamais (l. 9-13), donc un agenda injoignable et un agenda vide rendent la
  même liste. Sans les diagnostics, le poste vocal dirait « tu es libre » là où
  la vérité est « je n'ai pas pu regarder ».

---

### 4.3 · `admin-rendezvous` — appelable, mais sans aucune habilitation

|                          |                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fonctions appelables** | `listRendezVous(filters: RdvFilters): Promise<{ rows: UnifiedRdv[]; total: number }>` · `getRdvMonth(year: number, month: number): Promise<Map<string, UnifiedRdv[]>>`                                        |
| **Fichier:ligne**        | `src/features/admin-rendezvous/queries.ts:63-65` et `:89`                                                                                                                                                     |
| **`"use server"`**       | non                                                                                                                                                                                                           |
| **Session exigée**       | **nulle part, ni dans le module ni dans sa chaîne.** Le module ne contient ni `auth`, ni `session`, ni rôle — c'est écrit noir sur blanc dans `admin-inbox/queries.ts:14-18`, qui a payé pour l'avoir supposé |
| **Droits tirés**         | **aucun.** Le type `UnifiedRdv` porte `contactName`, `contactEmail`, `contactPhone` (`types.ts:30-32`), remplis inconditionnellement par `normalize.ts:53-55`                                                 |
| **À extraire**           | rien — **mais une habilitation est à ajouter**                                                                                                                                                                |

C'est le cas le plus délicat des cinq, précisément parce qu'il _a l'air_ prêt.
`listRendezVous` rend le nom, l'adresse et le téléphone de chaque prospect à
quiconque l'appelle. Aujourd'hui c'est sans conséquence : ses deux appelants
réels gardent en amont — `contacts/appels/page.tsx` par le régime **refus**
(la garde vient avant l'accès base, l. 73), et `admin-inbox/queries.ts:145-146`
par le régime **filtre**. Un troisième appelant qui oublierait de garder
n'aurait **rien pour le lui rappeler** : ni paramètre, ni type, ni compilateur.

**Travail à prévoir, et c'est une décision, pas une extraction.** Deux voies :

- **(a) — recommandée.** Ajouter à `listRendezVous` et `getRdvMonth` un
  paramètre `peutVoirAppels: boolean` **obligatoire et sans défaut**, calqué mot
  pour mot sur `admin-agenda/queries.ts:135`, et pousser le filtrage jusqu'au
  `CAL_SELECT` (l. 13-25) comme le fait l'agenda. Coût : deux signatures, deux
  appelants hors tests, un test d'ordre (`queries-order.spec.ts`) à ajuster.
  Bénéfice : le compilateur devient la garde, et le motif du dépôt cesse de
  n'exister qu'à un seul endroit.
- **(b)** — laisser la signature et masquer dans l'adaptateur. Moins cher
  aujourd'hui, et exactement le mécanisme qui a produit le défaut du
  2026-08-27 : la garde vit chez l'appelant, donc le prochain appelant ne l'a
  pas.

Autres relevés :

- `MAX_FETCH = 2000` (l. 27) : lecture non paginée en base puis filtres, tri et
  pagination **en mémoire** (l. 66-85). L'en-tête (l. 1-5) déclare le parti pris
  et sa borne. Un outil MCP qui pagine par-dessus paie 2 000 lignes à chaque
  appel — à confronter au budget de latence.
- Le filtre `q` (l. 72-79) cherche dans `contactName` et `contactEmail` : sans
  habilitation, il ne doit pas être exposé, sinon il devient un oracle sur des
  coordonnées qu'on vient de masquer.
- `UnifiedRdv.detailHref` (`normalize.ts:46`) — `adminPath()`, à supprimer de la
  charge utile.

---

### 4.4 · `admin-planning/hub` — appelable, aucune habilitation dans la chaîne

|                        |                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fonction appelable** | `getHubSignaux(year: number, month: number, adminPrefix: string, maintenant: Date): Promise<Signal[]>`                                                 |
| **Fichier:ligne**      | `src/features/admin-planning/hub-queries.ts:68-73`                                                                                                     |
| **`"use server"`**     | non                                                                                                                                                    |
| **Session exigée**     | **nulle part.** Ni dans `hub-queries.ts`, ni dans `hub.ts`, ni dans les cinq lectures Qualiopi qu'il agrège — aucun de ces fichiers n'importe `@/auth` |
| **Droits tirés**       | **aucun.** Aucun rôle n'apparaît dans la chaîne mesurée                                                                                                |
| **À extraire**         | rien — **mais le socle doit poser sa propre garde de rôle, il n'a rien à dériver**                                                                     |

La chaîne est entièrement Prisma, sans I/O externe : `getPlanningMonth`
(`./queries`), `getChargeMois` (`./charge-queries`), `listRelevesPeriode` et
`listAnomaliesPeriode` (`@/server/qualiopi/remuneration/queries`),
`listIndisposEntre` (`@/server/qualiopi/trainers/availability-queries`), puis
`listTrainers` et `getTrainerConformite` pour les seuls formateurs affectés
(l. 100-122). Le verdict lui-même est une **fonction pure** — `construireHub`,
`hub.ts:343`, qui reçoit `maintenant` en paramètre et ne fait aucune I/O.

Deux points structurants pour l'adaptateur :

- **`adminPrefix` est un paramètre d'entrée.** Il ne sert qu'à fabriquer les
  liens : `planningDetailHref` (`admin-planning/types.ts:91-97`) construit
  `/fr/{adminPrefix}/…`, et chaque `Signal.items[].href` en porte un. Le § 28
  interdit qu'un outil rende un `detailHref` : **l'adaptateur doit soit passer
  un jeton neutre et remplacer les `href` par des identifiants opaques, soit
  ajouter à `construireHub` un mode qui rend l'identifiant brut**. La seconde
  voie est plus sûre — elle empêche le préfixe d'entrer dans le contexte du
  modèle plutôt que de l'en retirer après coup.
- **Le contenu est nominatif.** Les `SignalItem.label` nomment des formateurs
  (`hub-queries.ts:117`, `nom: noms.get(trainerId)`), et
  `AnomalieRemuneration.trainerNom` / `ReleveEnAttente.trainerNom`
  (`hub.ts:71-82`) aussi. Cet outil sert donc des **données personnelles**, et
  sa `dataClass` doit le déclarer.

Le § 10 signale un consommateur voisin, `src/server/admin/pilotage-dashboard.ts`
(1 198 lignes) — **non lu dans cet inventaire**, il n'était pas dans le
périmètre demandé. Voir § 7.

---

### 4.5 · `qualiopi/alertes` — appelable, mais Gate A s'y oppose

|                          |                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fonctions appelables** | `listAlertes(options?: ListAlertesOptions): Promise<AlerteSysteme[]>` · `countNonLues(): Promise<number>`                                                                                                                                                      |
| **Fichier:ligne**        | `src/server/qualiopi/alertes/alertes-service.ts:148` et `:174`                                                                                                                                                                                                 |
| **`"use server"`**       | non                                                                                                                                                                                                                                                            |
| **Session exigée**       | **nulle part dans le service.** Elle vit chez les appelants : `qualiopi/alertes/page.tsx:117` (`gardePage("consultation")`, refus rendu l. 119, lecture l. 122) et `qualiopi/a-traiter/page.tsx:85` (`auth()`), l. 95 (`peutLireLesAlertes`), l. 104 (lecture) |
| **Droits tirés**         | **aucun dans le service.** Le prédicat existe : `peutLireLesAlertes(role)` — `server/qualiopi/alertes/routage.ts:154`, **dérivé** de `ROLES_PAR_GUICHET` (l. 121-136) et non recopié                                                                           |
| **À extraire**           | rien — **le coût est ailleurs**                                                                                                                                                                                                                                |

**Ne pas appeler `evaluerAlertesDetaille()`** (`evaluateur.ts:2635`) : le § 28 le
tranche, et le fichier le dit lui-même — 47 règles en séquence, 31 `findMany`
sans `take`, coût non mesuré, face à un budget de 1,5 s au p95. La lecture
persistée `listAlertes()` est la bonne porte. Elle est `isStub()`-safe
(l. 48-50 : `DATABASE_URL` contenant la chaîne magique du build → `[]`), ce qui
la rend compatible avec l'early-exit exigé en tête de handler.

**Deux obstacles réels, aucun n'est une extraction :**

1. **Gate A refuse l'import.** `scripts/qualiopi/isolation-check.ts` fait échouer
   tout fichier hors de sa zone qui importe `@/server/qualiopi/**`, sauf s'il
   est nommé **un par un** dans `CONSOMMATEURS_ASSUMES` (l. 144). Cette garde
   est câblée dans le job `gate-a` de la CI, qui est un contexte **exigé** par
   la protection de `main` (en-tête du script, l. 35-38 — et elle rappelle
   qu'elle est passée de 24 à 58 violations sans rougir, du temps où rien ne
   l'appelait). Le futur `src/app/api/mcp/route.ts` doit donc y être ajouté
   **nominativement**, jamais par un motif de répertoire — le § 32 le rappelle,
   et le commentaire de la constante (l. 140-142) exige en plus que la liste
   **rétrécisse**, `main()` échouant sur une exception périmée.
2. **La mesure M4 n'est pas faite.** Elle conditionne l'entrée de
   `qualiopi.conformite` en v1 (§ 35). Elle porte sur l'évaluateur, pas sur
   `listAlertes` — mais tant qu'elle n'existe pas, rien ne dit qu'un futur
   appelant ne rebranchera pas l'évaluateur « pour avoir du frais ».

**Un relevé qui n'apparaissait nulle part et qui change la classification :**
`AlerteSysteme.message` **contient des personnes nommées**, en texte libre.
Mesuré dans `evaluateur.ts` — l. 336 (nom du réclamant), 375, 913, 1021, 1050,
1075 (prénom et nom du stagiaire) — et dans
`besoin-adaptation.ts:40-44`, qui nomme délibérément le bénéficiaire (« une
alerte qui tairait les deux ne serait pas actionnable »). Un outil
`axionia.qualiopi.conformite` qui rend `listAlertes()` **rend donc des données
personnelles**, y compris de santé par déduction pour l'alerte « besoin
d'adaptation ». Sa `dataClass` doit le dire, et le § 29 rappelle que
`dataClass` est déclaré par l'adaptateur : ici, il ne peut pas être `public`.

---

## 5 · Récapitulatif

| Agrégateur           | Appelable sans session   | Habilitation dans la signature               | Extraction requise  | Autre travail                                           |
| -------------------- | ------------------------ | -------------------------------------------- | ------------------- | ------------------------------------------------------- |
| `admin-inbox`        | **non** (2 canaux sur 4) | partielle (`peutVoirAppels`, défaut `false`) | **oui — 2 modules** | rebrancher, corriger l'en-tête, identifiant opaque      |
| `admin-agenda`       | **oui**                  | **oui, obligatoire**                         | non                 | supprimer `detailHref`, rendre les diagnostics          |
| `admin-rendezvous`   | oui                      | **non**                                      | non                 | **ajouter `peutVoirAppels` (décision)**                 |
| `admin-planning/hub` | oui                      | **non**                                      | non                 | garde côté socle · neutraliser `adminPrefix`            |
| `qualiopi/alertes`   | oui                      | **non**                                      | non                 | **Gate A** (`CONSOMMATEURS_ASSUMES`) · M4 · `dataClass` |

Et le sixième, pour mémoire : **`unified-contact` n'est pas branchable**, et le
lot 1 avait raison. `actions.ts` y lit `getClientIp()`, `checkRateLimit`,
`verifyTurnstile`, des cookies UTM et l'en-tête `user-agent` — aucun appel MCP
ne fournit cela. Ce n'est pas une garde à contourner, c'est un formulaire
public : ses entrées **sont** la requête HTTP.

---

## 6 · Chiffrage du lot 4a, par module

Unité : jour de travail d'une session. **Le facteur limitant n'est pas la
frappe** : chaque itération sur ce lot est un déploiement de production
d'Axion-IA, et le dossier a mesuré qu'au-delà de trois chantiers en vol,
produire recule la fin.

| #   | Module                   | Geste                                                                                                                                                        | Fichiers touchés                                                   |     Charge |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------: |
| 1   | `admin-submissions`      | extraire `listSubmissions()` (≈ 124 l.) vers `reads.ts` non-`"use server"` ; `actions.ts` garde `requireAdminReadSession` et enveloppe                       | `reads.ts` (neuf), `actions.ts`, 2 appelants, tests                |  **0,5 j** |
| 2   | `admin-job-applications` | idem sur `listApplications()` (≈ 58 l.) ; `peutOuvrirDossierCandidat` reste dans l'enveloppe                                                                 | `reads.ts` (neuf), `actions.ts`, 2 appelants                       |  **0,5 j** |
| 3   | `admin-inbox`            | rebrancher 2 canaux sur les lectures extraites, corriger l'en-tête, exposer `failedChannels` / `truncated`, remplacer `detailHref` par un identifiant opaque | `queries.ts`, `__tests__/queries.test.ts`                          |  **0,5 j** |
| 4   | `admin-rendezvous`       | ajouter `peutVoirAppels` obligatoire à `listRendezVous` + `getRdvMonth`, filtrer dans `CAL_SELECT`                                                           | `queries.ts`, `normalize.ts`, 2 appelants, `queries-order.spec.ts` | **0,25 j** |
| 5   | `admin-planning/hub`     | neutraliser `adminPrefix` dans les `href` rendus (identifiant brut)                                                                                          | `hub.ts`, `types.ts`, `hub-queries.ts`, `hub.spec.ts`              | **0,25 j** |
| 6   | `qualiopi/alertes`       | inscrire le fichier MCP **nominativement** dans `CONSOMMATEURS_ASSUMES` et vérifier la garde par un témoin fabriqué                                          | `scripts/qualiopi/isolation-check.ts`                              | **0,25 j** |
| 7   | `admin-agenda`           | rien dans `axionia`                                                                                                                                          | —                                                                  |    **0 j** |
|     |                          |                                                                                                                                                              | **Sous-total extraction**                                          | **2,25 j** |

Reste du lot 4a, déjà cadré au § 32 et **non chiffré ici** parce qu'il ne relève
pas de l'inventaire : route `src/app/api/mcp/route.ts` avec early-exit
`stub.invalid` en tête de handler, secret partagé dans le handler,
élargissement de `admin-nav:routes-check` prouvé par un témoin fabriqué, mesure
du bundle. Le § 32 chiffre l'ensemble du lot 4a à **3 j** ; les 2,25 j
ci-dessus en sont la part d'extraction, ce qui laisse ≈ 0,75 j pour le reste —
**c'est serré**, et le § 34 prévient déjà que 4a et 4b sont les lots les plus
exposés au coût de la CI.

**Deux décisions à prendre avant de commencer**, qui ne sont pas des lignes de
code :

- **D-4a-1** — `admin-rendezvous` : voie (a) paramètre obligatoire, ou voie (b)
  masquage dans l'adaptateur ? _Recommandation : (a)._
- **D-4a-2** — `admin-planning/hub` : neutraliser `adminPrefix` dans
  `construireHub`, ou remplacer les `href` après coup dans l'adaptateur ?
  _Recommandation : dans `construireHub` — le préfixe ne doit pas exister dans
  la valeur de retour, pas seulement en sortir._

---

## 7 · Ce qui n'a PAS été vérifié

Écrit ici parce qu'un écart signalé vaut mieux qu'un trou comblé par une
supposition.

1. **Rien n'a été exécuté.** Aucun `pnpm typecheck`, `pnpm test`, `pnpm lint`
   n'a tourné dans `axionia` — le chantier est en lecture seule. Que les
   extractions décrites compilent reste **une hypothèse**.
   ➤ _Mesure qui lèverait le doute_ : sur une branche de `axionia`,
   `pnpm typecheck && pnpm test` après l'extraction n° 1, relever le nombre de
   tests exécutés (pas la couleur).
2. **Le comportement de `auth()` hors requête n'a pas été observé**, seulement
   déduit de la configuration (`src/auth.ts:65`, stratégie JWT). L'énoncé « un
   appel MCP lève `unauthorized` » est une **dérivation**, pas une mesure.
   ➤ _Mesure_ : dans une route de test, appeler `listSubmissionsAction()` sans
   cookie et relever le message exact de l'exception.
3. **`src/server/admin/pilotage-dashboard.ts` (1 198 lignes) n'a pas été lu.**
   Le § 10 le désigne comme « le plus gros » consommateur et comme celui que
   `admin-planning/hub` alimente. Il pourrait porter des lectures que le socle
   voudrait servir — ou dupliquer celles inventoriées ici.
   ➤ _Mesure_ : même balayage que le § 2 sur ce fichier et sa chaîne.
4. **Le coût de `evaluerAlertesDetaille()` reste non mesuré** (M4). Ce document
   ne l'a pas mesuré non plus ; il se borne à confirmer que la lecture
   persistée `listAlertes()` est une porte distincte et bon marché.
   ➤ _Mesure_ : celle prévue au § 35 — 20 exécutions en production, p95.
5. **Le volume réel n'a pas été mesuré.** `PER_CHANNEL_FETCH = 100`,
   `MAX_FETCH = 2000` et la pagination en mémoire sont des paramètres lus dans
   le code, pas des observations de production. Le budget de latence du § 12 ne
   peut donc pas être confronté à autre chose qu'à des bornes théoriques.
   ➤ _Mesure_ : `count()` sur les quatre tables sources en production, et
   chronométrage d'un `listInbox()` et d'un `listRendezVous()` réels.
6. **La complétude de l'inventaire n'est pas prouvée.** Il porte sur les cinq
   modules **nommés dans la commande**. Un sixième agrégateur branchable peut
   exister sous `src/server/**` — c'est précisément l'erreur que le § 10 dit
   avoir déjà commise une fois en ne cherchant que sous `src/features/**`.
   ➤ _Mesure_ : balayage de `src/server/**` sur le motif « module non
   `"use server"`, sans import `@/auth`, agrégeant au moins deux tables ».
