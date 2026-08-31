# PRÉPARATION — ce que les ADR 0010 à 0013 permettent de décider

- **Date** : 2026-08-31
- **Statut** : relecture croisée. Aucune décision nouvelle n'est prise ici ; ce
  document consolide, vérifie et signale les écarts.
- **Portée** : les quatre ADR de préparation — 0010 (voie vocale, lot 8),
  0011 (lectures sans session, lot 4a), 0012 (route MCP dans le dépôt voisin,
  lot 4a), 0013 (données des huit écrans, lot 5) — confrontés au cahier des
  charges v6 et au code.
- **Méthode** : sondage de re-vérification dans le code (44 assertions reprises,
  § 1), recherche de contradictions (§ 2), consolidation (§ 3 à § 5).
- **Rien n'a été écrit hors de `docs/`.** Le dépôt voisin `axionia` a été lu
  seulement ; `git status --porcelain` y est ressorti vide après le sondage.

---

## 1 · Vérification par sondage

**44 assertions reprises dans le code · 4 pointeurs inexacts · 0 conclusion
invalidée.**

Le sondage a porté sur les faits **porteurs** — ceux qui, s'ils étaient faux,
feraient écrire du code faux — et non sur les plus faciles à recompter.

### 1.1 · Ce qui a été re-vérifié et tient

**ADR 0010 — voie vocale (12 assertions).** Le client `claude` répond bien
`2.1.251`. Les sept chaînes citées existent dans l'exécutable : `Toggle voice
mode`, `startNativeRecording`, `Windows native recording unavailable, no
fallback`, le chemin du WebSocket de transcription,
`allow_voice_mode`, `interrupt_receipt_v1`, `cancel_queued`. Le SDK d'agents
installé est bien en `0.3.251` ; `interrupt(): Promise<SDKControlInterruptResponse
| undefined>` est déclaré à `sdk.d.ts:2536`, et la phrase citée sur le bouton
« stop » (« A Stop-means-stop-everything client … one round-trip halts the
session ») est dans le commentaire de `cancel_queued`. La signature qui tue la
voie A est exacte : `tool(_name, _description, _inputSchema, _handler: (args,
extra) => Promise<CallToolResult>, _extras?)` — **aucune prise sur le tour en
cours**. L'inventaire vocal de Windows est reproduit à l'identique : quatre
moteurs de reconnaissance dont un `fr-FR`, trois voix SAPI dont une française,
et `SpeakAsyncCancelAll` / `Pause` / `Resume` exposées.

**ADR 0011 — lectures sans session (17 assertions).** Toutes les adresses
`fichier:ligne` du dépôt voisin retombent sur le bon symbole :
`getAgendaFenetre` (l. 124) et son `peutVoirAppels` **sans valeur par défaut**
(l. 135, avec le commentaire qui l'explique) · `listInbox` (l. 268) ·
`PER_CHANNEL_FETCH = 100` (l. 57) · `MAX_FETCH = 2000` (l. 27) ·
`listRendezVous` (l. 63) · `requireAdminReadSession` (l. 51-55, `auth()` l. 52)
et son appelant `listSubmissionsAction` (l. 113, garde l. 116) ·
`requireAdminRead` (l. 57-63, `auth()` l. 58, `peutOuvrirDossierCandidat`
l. 61) et `listApplicationsAction` (l. 103, garde l. 104) · `ROLES_APPELS`
(l. 91-95, **trois** rôles) et `peutVoirLesAppels` (l. 100) · `listAlertes`
(l. 148, `isStub()`-safe), `countNonLues` (l. 174), `evaluerAlertesDetaille`
(l. 2635) · les trois branchements de canaux (l. 88, 127, 158) ·
`getInboxActionCounts` (l. 75) · `getHubSignaux` (l. 68) · les trois comptes de
lignes (174 / 629 / 97).

**ADR 0012 — gardes rencontrées (12 assertions).** 11 349 fichiers suivis par
git dans le dépôt voisin. Le `matcher` du proxy est bien à la ligne 503, il
exclut `api/`, et **il ne contient nulle part la chaîne `mcp`** — donc la règle
« 0bis » (l. 137-146, redirection 301 à la l. 144) s'applique bien à `/mcp`.
`authorized()` est aux lignes 45-51 et rend `true` hors du segment
d'administration. Le contrôle d'isolation Qualiopi fait 441 lignes, sa liste
d'exceptions couvre les lignes 144-290 et contient **exactement 54 entrées**.
Le balayage de navigation fait 118 lignes, son contre-témoin de comptage est aux
lignes 93-99 et sa formule (`internes < items - 10`) donne bien un déclenchement
à partir de 11 entrées externes. Le troisième contrôle d'isolation marque bien
sur une simple mention (`content.includes(m)`, l. 591). Les trois étapes de CI
sont aux lignes annoncées (130-131, 162-163, 473-474), et celle du poids du
bundle **n'a pas** de `continue-on-error`. Le stub Prisma rend `undefined` pour
toute méthode inconnue (l. 54-55) et s'active l. 79. Le motif du secret partagé
est aux lignes 32-36 et 38-42. La liste des préfixes réputés sensibles du test
de débit est à la ligne 148. Le répertoire `src/server/mcp/` **n'existe pas**.

**ADR 0013 — données des huit écrans (10 assertions).** `niveauPourEcran` est à
`core/policy/desserrage.ts:567` · `estServi` à `core/profiles/budget.ts:265` ·
`PLAFOND_OUTILS_PAR_PROFIL = 40` · `TTL_DESSERRAGE_MAX_MS` = 24 h. Le contrat
`DepotQuota` déclare **exactement deux méthodes**, aucune lecture — le manque
**M-6** est confirmé. Aucune occurrence de `attestedAt` ni
`attestationExpiresAt` dans `core/` ni dans le schéma — **M-1** confirmé.
`prisma/schema.prisma` porte bien **dix** modèles `Ops*`. Les quatre renvois à
`docs/ETAT.md` (§ 3.1, § 4.4, § 4.6, § 4.7) désignent des sections qui existent
et qui disent ce qui leur est attribué.

### 1.2 · Les quatre pointeurs inexacts

Aucun ne change une conclusion. Tous font perdre du temps à qui les suivra.

| #   | ADR        | Ce qui est écrit                                                                                                                    | Ce qui est mesuré                                                                                                                                                                                       |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1 | 0011 § 2   | « NextAuth est configuré en stratégie JWT porté par cookie (`src/auth.ts:65`) »                                                     | La stratégie `"jwt"` est déclarée dans **`src/auth.config.ts:32`**. `src/auth.ts:65` est l'appel `NextAuth({…})`. **Le fichier est faux, pas seulement la ligne.** Le fait — stratégie JWT — est juste. |
| E-2 | 0013 § 2.1 | `core/vault/etat.ts:112` pour la phrase « l'arrêt d'urgence ne doit jamais rendre une erreur parce que le coffre était déjà fermé » | La ligne 112 ouvre le bon objet de transition ; la phrase est aux lignes **117-118**. Décalage de 5 lignes, cible correcte.                                                                             |
| E-3 | 0011 § 6   | « Le § 32 chiffre l'ensemble du lot 4a à 3 j »                                                                                      | C'est le **§ 33** qui chiffre. Le § 32 porte les critères de recette.                                                                                                                                   |
| E-4 | 0010 § 3   | Le commentaire d'`interrupt()` est donné entre guillemets                                                                           | Le texte du SDK est plus long et formulé autrement ; la citation est **condensée**, pas littérale. Le sens (le reçu, `still_queued`, ce qui survit) est fidèle.                                         |

> **À retenir de ce sondage** : les quatre documents sont **fiables sur le
> fond**. Le seul défaut de forme récurrent est le pointeur — et c'est ADR 0011
> qui a raison en tête de son propre document : _« un numéro de ligne n'est pas
> une adresse durable : vérifier le symbole, pas le rang. »_ E-1 en est
> l'illustration exacte, dans le document qui l'écrit.

---

## 2 · Contradictions

### C-1 · Le cahier des charges se contredit sur le nombre d'agrégateurs

Le § 28 écrit « Mesuré agrégateur par agrégateur : **vrai pour un sur six** ».
L'annexe A du § 35 écrit « **Cinq** agrégateurs — quatre sous `src/features/`,
un sous `src/server/qualiopi/alertes/` — `unified-contact` retiré : non
branchable ».

Le dénominateur a changé en cours de rédaction et les deux formulations sont
restées. **ADR 0011 tranche correctement** : il inventorie cinq agrégateurs et
range le sixième « pour mémoire ». Il précise en outre le numérateur, et cette
précision est le vrai apport :

- **quatre sur cinq** sont appelables sans session, tels quels ;
- **un seul sur cinq** porte son habilitation dans sa signature.

C'est cette seconde lecture que le § 28 appelle « prêt » — et le tableau du § 28
la confirme : `agenda.jour · semaine` est le seul outil marqué « prêt ».

➤ **À corriger dans le CDC** : § 28, lire « un sur cinq ». Le « sur six » est un
reste de la version antérieure au retrait de `unified-contact`.

### C-2 · Un critère de recette du lot 4a décrit une garde qui n'existe pas

Le § 32, critère (d) du lot 4a : « un fichier témoin sous `src/server/mcp/` fait
rougir le balayage de nav ».

ADR 0012 § D.1 mesure que le balayage de navigation **ne lit aucun fichier
source** : il importe le constructeur de menu, résout chaque entrée interne sur
le disque, et exige une URL absolue pour les entrées externes. Il ne verra
jamais un fichier posé sous `src/server/mcp/`.

**Le critère (d) n'est donc pas un contrôle à déclencher : c'est une garde à
écrire.** ADR 0012 le signale, et il a raison de contredire le CDC. La
conséquence est un poste de charge — voir § 5.

### C-3 · Les quatre ADR ne se somment pas au § 33, et aucun ne le dit

Chaque ADR raisonne sur son lot et conclut sur le total du plan **sans tenir
compte des trois autres**.

- ADR 0010 conclut « total du plan **37 j** » — le § 33 en voie B, inchangé.
- ADR 0013 ajoute **+ 1,75 j** au lot 5, sans reporter l'effet sur le total.
- ADR 0010 place la mesure I-1 (**0,5 j**) « avant d'engager le lot 8 » — elle
  n'est **dans aucun** des chiffrages, ni dans les 6 j du lot 8, ni au lot 0b.
- ADR 0011 et ADR 0012 posent ensemble, pour le lot 4a, plus de travail que ce
  que ses 3 j contiennent (voir C-4).

Le total consolidé est au § 5. Ce n'est la faute d'aucun des quatre documents :
c'est ce qu'une relecture croisée est là pour produire.

### C-4 · Le lot 4a : 2,25 j mesurés, 0,75 j de reste, et une garde neuve dedans

ADR 0011 § 6 chiffre l'extraction à **2,25 j** module par module, et écrit
lui-même que le reste — route, secret partagé, élargissement de garde, mesure du
bundle — dispose donc de **≈ 0,75 j**, ce qu'il qualifie de « serré ».

ADR 0012, écrit en parallèle, remplit ce reste sans le chiffrer :

- une **garde neuve** à écrire (§ D.3), avec son dénominateur annoncé et sa
  dérivation — c'est le critère (d) de C-2 ;
- le préfixe de la clé MCP à ajouter à la liste des préfixes sensibles du test
  de débit, **plus son témoin**, sans quoi le compteur posé n'est surveillé par
  rien (§ G.3) ;
- une dizaine de **témoins fabriqués** à poser puis retirer (§ A, § C.6 ×2,
  § D.4 ×3, § E, § F, § G) ;
- la mesure du bundle et son delta écrit dans la PR (§ H).

**Aucun de ces postes n'est chiffré nulle part.** Les 3 j du § 33 ne sont donc
ni confirmés ni réfutés : ils sont **non instruits sur leur seconde moitié**.

### C-5 · ADR 0013 remonte à Will cinq questions que le § 35 lui interdit de poser

Le § 35, « ce qui ne remonte PAS à toi », délègue nommément au développeur :
_la forme des migrations · le nommage interne et le découpage des fichiers ·
la structure de la console · la forme des tests_, et ajoute : « si une de ces
questions t'est posée pendant l'implémentation, c'est une escalade indue ».

Les huit manques du § 5 d'ADR 0013 sont tous **réels** — le sondage en a
confirmé trois par mesure directe (M-1, M-5, M-6). Mais ils sont présentés comme
huit « décisions demandées », et cinq n'en sont pas :

| Manque  | Ce qui est demandé à Will                                       | Verdict                                                                                                                                         |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-1** | « deux colonnes sur `ops_secret`, ou une onzième table ? »      | **Forme de migration** → développeur. Ce qui remonte à Will : accepter que l'attestation du § 16 n'a **aucun support** aujourd'hui, et le coût. |
| **M-2** | ordonnancer le lot 3.5 avant le lot 5                           | **Décision de plan → Will.** Légitime.                                                                                                          |
| **M-3** | le socle interroge la veille, ou stocke l'accusé de battement ? | **Légitime** — engage un service extérieur, donc un coût et un tiers.                                                                           |
| **M-4** | sonde d'adaptateur, « lot 2 ou 5 »                              | L'ordonnancement remonte à Will ; **la sonde elle-même** est du travail.                                                                        |
| **M-5** | « la coquille affiche-t-elle déjà les refus du registre ? »     | **Structure de la console** → développeur.                                                                                                      |
| **M-6** | « ajouter `lire(cle)` au contrat `DepotQuota` »                 | **Nommage et découpage** → développeur.                                                                                                         |
| **M-7** | `core/catalogue/` et la bascule d'interrupteur                  | Du travail, pas une décision. Ce qui remonte : c'est le **critère de fini du lot 5**, et il traverse trois absences.                            |
| **M-8** | colonne booléenne entrant dans l'empreinte chaînée              | **Légitime sur le calendrier** (« avant le premier chaînage réel »), pas sur la forme.                                                          |

➤ **Reformulation** : sur huit manques, **trois appellent une décision de Will**
(M-2 ordonnancement · M-3 source du battement · M-8 calendrier), et **cinq sont
du travail à chiffrer**, ce qu'ADR 0013 fait très correctement par ailleurs au
§ 7. C'est la présentation qu'il faut corriger, pas le contenu.

### C-6 · Trois points de forme à trancher avant toute publication

Le dépôt est public ; le § 01 en tire trois règles. Ces trois points sont
signalés, **pas comblés** — ils appellent l'arbitrage de Will.

1. **Un chemin de compte en clair.** ADR 0010 § 2 cite le chemin absolu de
   l'exécutable, lequel contient le nom du compte Windows. Le § 01, règle 2,
   interdit « identifiant de compte ». _Correctif : écrire « l'exécutable
   `claude` du poste » et retirer le chemin._ Une seule occurrence dans les
   quatre documents ; aucune adresse IP, aucun sous-domaine, aucun préfixe
   d'administration n'a été trouvé — ADR 0012 § B s'est explicitement abstenu de
   recopier le préfixe par défaut, et c'est le bon réflexe.
2. **Le profil matériel du poste.** ADR 0010 § 1 donne processeur, mémoire,
   carte graphique et build du système. Ce n'est pas dans la liste de la règle 2,
   et cela sert à borner les mesures — mais l'ensemble identifie une machine.
   _À trancher : garder (la borne a une valeur) ou réduire à ce qui borne
   vraiment (nombre de cœurs, mémoire, présence d'un GPU)._
3. **Deux contournements de garde publiés.** ADR 0012 § C.5 décrit comment un
   import relatif, puis un ré-export depuis une zone autorisée, rendent muet un
   contrôle d'isolation du dépôt voisin — **et que c'est l'état actuel**. Le
   § 01, règle 3, dit : « les prérequis d'exploitation se nomment ; leur état ne
   se publie pas ». La règle vise la sécurité et il s'agit ici d'une garde de CI,
   ce qui atténue ; mais la forme est exactement celle que la règle proscrit.
   _À trancher : reformuler en nommant l'exigence (« écrire les imports en alias
   pour que la garde voie l'arête ») sans publier les deux voies d'évitement._
   Le même arbitrage vaut pour ADR 0013 § 6.2 et pour `docs/ETAT.md` § 4.1, qui
   publient déjà l'état non corrigé du chaînage du journal — le motif est donc
   **antérieur à ces quatre documents**, et se règle en une décision, pas en
   quatre.

---

## 3 · Ce qui est désormais SU

Neuf faits qui n'étaient pas acquis hier et qui le sont aujourd'hui, chacun
mesuré.

1. **Le client Claude Code fournit une dictée, jamais une sortie parlée.** Elle
   n'est pas locale (l'audio part vers l'API) et **elle est inaccessible à un
   programme** (`supportsNonInteractive` faux). Elle est donc sans effet sur le
   choix A/B. C'était la troisième « incertitude assumée » du § 35 : elle est
   levée.
2. **L'interruption existe côté client, et pas côté serveur MCP.** C'est une
   requête de contrôle du SDK (`interrupt()`, `cancel_queued`), pas un outil ; la
   signature d'un outil MCP ne donne aucune prise sur le tour en cours. **La voie
   A ne peut structurellement pas tenir les trois exigences du § 30** —
   interruption, commandes hors modèle, verrouillage. Le défaut du § 35
   (« voie A ») livrerait un poste qui ne satisfait aucun des critères de fin du
   lot 8.
3. **La reconnaissance et la synthèse locales sont possibles sur ce poste, sans
   rien installer, pour les commandes hors modèle.** Un moteur français et trois
   voix françaises sont présents d'origine, et la coupure de la synthèse est une
   méthode exposée. Le poste vocal n'a donc **jamais besoin de transmettre
   d'audio**.
4. **En revanche, la dictée libre est un chantier à part entière**, et c'est le
   risque neuf que ce préalable met au jour : le moteur intégré ne connaît pas le
   lexique du projet et ne peut pas l'apprendre. Le § 30 supposait la question
   réglée ; elle ne l'est pas.
5. **Le blocage des lectures sans session est `auth()`, et lui seul.** Ni la
   directive `"use server"`, ni le runtime : dix modules sur dix sont importables
   tels quels. Le blocage est **transitif**, sur deux canaux de la boîte de
   réception, et se lève par **extraction**, jamais par neutralisation.
6. **Le dépôt voisin a déjà posé le motif d'extraction, deux fois** : un module
   sans I/O pour la forme du fichier, un module qui accède à la base sans
   identité propre pour le fond. Le lot 4a répète, il n'invente pas.
7. **Trois agrégateurs sur cinq ne portent aucune habilitation.** Le vrai travail
   du lot 4a n'est donc pas seulement d'extraire une lecture : c'est de **faire
   entrer l'habilitation dans la signature**, sur le modèle du seul agrégateur
   qui oblige déjà le compilateur à trancher.
8. **La route MCP porte seule son autorisation.** Aucune couche au-dessus ne la
   couvre — le matcher exclut les routes d'API, et le rappel d'autorisation rend
   `true` hors du segment d'administration. Et **elle doit s'appeler `/api/mcp`** :
   `/mcp` tombe dans une redirection 301, qui sur un `POST` fait perdre le corps
   de la requête chez la plupart des clients.
9. **Trois écrans de la console sur huit ne peuvent pas être servis** avec le
   socle d'aujourd'hui. Ce ne sont pas des détails d'interface : ce sont deux
   colonnes, un contrat sans lecture, une sonde, un module et un producteur qui
   n'existent pas. Le sondage en a confirmé trois par mesure directe.

---

## 4 · Ce qui reste incertain, et la mesure qui le lèverait

Consolidé et dédoublonné à partir des quatre ADR, plus deux points ajoutés par
cette relecture. Classé par ce qu'il bloque.

| #                       | Incertitude                                                                                                                                                                                                                                                          | Mesure exacte                                                                                                                                                                                                   | Coût             | Bloque                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------ |
| **U-1**                 | **Latence et exactitude d'un moteur de dictée libre local.** Aucun n'a été installé ni exécuté ; seules des tailles de modèle sont connues. C'est le seul poste à risque du lot 8.                                                                                   | Installer une liaison, charger deux tailles de modèle, dicter au micro dix phrases portant le lexique du projet ; relever le délai du dernier mot à la transcription et le taux d'erreur **sur ces termes-là**. | **0,5 j**        | Engagement du lot 8            |
| **U-2**                 | **Que doit refuser le balayage de navigation élargi ?** Le script mesuré ne connaît ni chaînes d'import ni le répertoire visé (C-2).                                                                                                                                 | Une phrase de Will — ou, si l'on suit le § 35 (« la forme des tests » ne remonte pas), une décision du développeur assumée en ADR.                                                                              | 0 (décision)     | Écriture du lot 4a             |
| **U-3**                 | **Rien n'a été exécuté dans le dépôt voisin.** Que les extractions décrites compilent est une **hypothèse**.                                                                                                                                                         | Sur une branche : `pnpm typecheck && pnpm test` après la première extraction, en relevant **le nombre de tests exécutés**, pas la couleur.                                                                      | 0,25 j           | Fin du lot 4a                  |
| **U-4**                 | **Le comportement de `auth()` hors requête est dérivé, pas observé.** L'énoncé « un appel MCP lève » vient de la configuration.                                                                                                                                      | Dans une route de test, appeler l'action gardée sans cookie et relever le message exact.                                                                                                                        | 30 min           | Rien — confort                 |
| **U-5**                 | **Coût de `listAlertes()` et de son voisin (M4 du § 35).** Non mesuré. Il décide de l'entrée de `qualiopi.conformite` en v1.                                                                                                                                         | Chronométrer en production, 20 exécutions, p95, contre le budget de 1,5 s.                                                                                                                                      | Prévu au lot 0b  | Périmètre v1                   |
| **U-6**                 | **Le volume réel n'est pas mesuré.** Les plafonds de lecture par canal et la pagination en mémoire sont lus dans le code, pas observés. Le budget de latence ne peut être confronté qu'à des bornes théoriques.                                                      | `count()` sur les tables sources en production, puis chronométrage d'un appel réel de chaque agrégateur.                                                                                                        | 0,25 j           | Recette du lot 4b              |
| **U-7**                 | **La complétude de l'inventaire n'est pas prouvée.** Il porte sur les cinq modules nommés dans la commande ; le plus gros consommateur voisin n'a pas été lu.                                                                                                        | Balayage de `src/server/**` sur le motif « module non `"use server"`, sans import d'authentification, agrégeant au moins deux tables », **en annonçant le nombre de fichiers examinés**.                        | 0,25 j           | Périmètre du lot 4b            |
| **U-8**                 | **Aucune base ne tourne, aucune migration n'a été lancée.** Tout ce qui est dit des dix tables est lu dans le schéma. Une colonne au schéma n'est pas une colonne en base.                                                                                           | Après la première migration : lecture de `information_schema`, avec le compte de colonnes trouvées.                                                                                                             | inclus au lot 1  | Écran Santé                    |
| **U-9**                 | **Le « servi sans le coffre » est dérivé, pas mesuré.** Déduit de la table des transitions et des méthodes qui n'exigent pas l'ouverture.                                                                                                                            | Démarrer le socle coffre verrouillé et appeler les trois routes ; c'est déjà le critère de fini du lot 1.                                                                                                       | inclus au lot 1  | Écrans Santé et Déverrouillage |
| **U-10**                | **Les manques du § 5 d'ADR 0013 reposent sur des recherches de motifs.** Un `grep` ne prouve que l'absence de la **forme écrite**. Les motifs sont écrits pour être rejoués — c'est le bon réflexe.                                                                  | Rejouer les motifs après chaque lot qui touche `core/`, et **compter les fichiers balayés**.                                                                                                                    | ~0               | Rien                           |
| **U-11** _(ajouté ici)_ | **La garde neuve du lot 4a n'est chiffrée nulle part** (C-4).                                                                                                                                                                                                        | Écrire son squelette et ses trois témoins sur une branche, chronométrer. Tant que ce n'est pas fait, les 3 j du lot 4a n'ont pas de seconde moitié instruite.                                                   | 0,25 j           | Chiffrage du lot 4a            |
| **U-12** _(ajouté ici)_ | **Le coût de la cadence de déploiement n'est pas dans le chiffrage du lot 4a.** Le critère (b) du § 32 exige une vérification **depuis un autre réseau**, donc un déploiement de production par itération. Le § 33 le signale en prose, aucun chiffrage ne le porte. | Compter les itérations attendues et les multiplier par la durée de la boucle mesurée sur ce dossier.                                                                                                            | 0 (arithmétique) | Réalisme du lot 4a             |

**Deux incertitudes des ADR sont écartées ici comme sans effet** : la
disponibilité d'une capacité de canal côté client (un canal crée un tour, il ne
coupe pas un tour en cours — la conclusion tient dans les deux cas), et
l'ouverture du drapeau de la dictée intégrée sur ce compte (la dictée est de
toute façon inutilisable par un démon).

---

## 5 · Chiffrage consolidé — lots 4a, 5 et 8

Rappel du § 33 : lot 4a = **3 j** · lot 5 = **2,5 j** · lot 8 = **0,5 + 2 (A) /
6 (B)** · total **33 j (A) / 37 j (B)**.

### 5.1 · Lot 4a — 3 j non instruits sur leur seconde moitié

| Poste                                                            |                           Charge | Assise                                                                    |
| ---------------------------------------------------------------- | -------------------------------: | ------------------------------------------------------------------------- |
| Extraction, 6 modules (ADR 0011 § 6)                             |                       **2,25 j** | **Ancré** — module par module, fichiers touchés nommés, appelants comptés |
| Route, secret partagé, préfixe de débit + son témoin, early-exit |                    _non chiffré_ | Le motif à reprendre est lu ligne à ligne (ADR 0012 § F, § G)             |
| **Garde neuve de navigation** (C-2, U-11)                        |                    _non chiffré_ | Sa forme est une **proposition**, pas une lecture                         |
| Dix témoins fabriqués à poser puis retirer                       |                    _non chiffré_ | Énumérés (ADR 0012), aucun chronométré                                    |
| Mesure du bundle et delta écrit dans la PR                       |                    _non chiffré_ | —                                                                         |
|                                                                  | **≈ 0,75 j** de reste disponible |                                                                           |

> **Verdict** : les 3 j ne sont **pas confirmés**. Ils sont **non réfutés faute
> d'instruction du reste**. Deux des postes non chiffrés — la garde neuve et les
> dix témoins — sont, à vue, du même ordre de grandeur que les 0,75 j restants à
> eux seuls. Le chiffre réaliste est probablement **entre 3 et 4 j**, et **ce
> delta est une estimation, pas une mesure** : U-11 le lève en 0,25 j.
>
> Et le facteur limitant n'est pas la frappe : chaque itération est un
> déploiement de production du dépôt voisin (U-12).

### 5.2 · Lot 5 — 4,25 j, et un ordonnancement à décider

L'arithmétique d'ADR 0013 § 7 est juste : 0,25 + 0,25 + 0,5 + 0,5 + 0,25 =
**1,75 j**, soit **2,5 → 4,25 j**.

Deux précisions que la relecture ajoute :

- **La sonde d'adaptateur (0,5 j) est attribuée à « lot 2 ou 5 ».** Si elle part
  au lot 2, le lot 5 retombe à **3,75 j** et le lot 2 passe de 2 à **2,5 j** :
  **le total du plan augmente de + 1,75 j dans les deux cas.** Ce n'est pas un
  arbitrage de charge, c'est un arbitrage d'ordre.
- **Le lot 3.5 doit passer avant le lot 5**, faute de quoi l'écran Santé sort
  sans sa donnée la plus importante — et devra afficher « module absent », jamais
  « 0 ». C'est la seule vraie décision de plan du document (M-2).

Un poste n'est pas dans les 1,75 j et devrait l'être : la charge que représente
le **critère de fini du lot 5** lui-même. « Un interrupteur bascule un outil sans
redéploiement et le client le voit » traverse trois absences — la bascule,
l'étape qui la lit, et la relecture de la liste d'outils. Le 0,5 j de M-7 couvre
les deux premières ; la troisième est ailleurs. **À vérifier au moment d'ouvrir
le lot 5**, pas ici.

### 5.3 · Lot 8 — 6 j retenus, plus 0,5 j oubliés

La décomposition d'ADR 0010 § 5 est juste (1,5 + 1 + 1 + 1,5 + 0,5 + 0,5 = 6,0)
et le document est honnête sur ce qu'elle vaut : elle **retombe** sur les 6 j du
§ 33, elle ne les confirme pas de façon indépendante. Trois lignes sur six sont
estimées, et une seule porte le risque — la dictée libre (1,5 j).

**Ce qui manque au chiffre** : la mesure U-1 (0,5 j) conditionne ces 6 j et
**n'est comptée nulle part**. Deux issues, toutes deux acceptables :

- la rattacher au **lot 0b**, avec les sept autres mesures — c'est sa nature ;
- ou la porter au lot 8, qui devient **0,5 (fait) + 0,5 + 6 = 7 j**.

Dans les deux cas, **le total du plan augmente de 0,5 j**.

### 5.4 · Total consolidé

| Ligne                                                                      |                                        Effet |
| -------------------------------------------------------------------------- | -------------------------------------------: |
| § 33, voie B                                                               |                                     **37 j** |
| Lot 5 — trois données que le § 22 demande et que le § 12 n'a jamais posées |                                 **+ 1,75 j** |
| Lot 8 — la mesure qui conditionne les 6 j                                  |                                  **+ 0,5 j** |
| Lot 4a — reste non instruit (C-4, U-11)                                    |                    **+ 0 à 1 j, non mesuré** |
| **Total**                                                                  | **39,25 j**, et **jusqu'à ~40 j** selon U-11 |

C'est **+ 2,25 j fermes sur 37**, soit un dépassement de 6 %. Ce n'est pas une
dérive : c'est le prix de trois questions que les quatre préalables ont posées
pour la première fois — l'attestation n'a pas de colonne, le compteur n'a pas de
lecture, et la dictée libre n'est pas le problème réglé que le § 30 supposait.

---

## 6 · Ce qui revient à Will, maintenant

Trois décisions sont **prêtes à être prises**, avec leur motif écrit :

1. **W-7 — voie vocale : B.** Le préalable de 0,5 j exigé par le § 30 est fait et
   vérifié. Le motif ne tient pas à une préférence : la voie A ne peut satisfaire
   **aucun** des trois critères de fin du lot 8. Le défaut du § 35 est donc à
   renverser explicitement.
2. **L'ordonnancement du lot 3.5 avant le lot 5** (M-2). Sans lui, l'écran Santé
   sort en affichant l'absence de son module principal.
3. **Le format du chiffrage** : accepter **39,25 j** en remplacement de 37, en
   sachant que le lot 4a peut encore coûter jusqu'à 1 j de plus, et que
   **0,25 j de mesure (U-11) suffit à le savoir**.

Deux décisions **ne sont pas prêtes** et il ne faut pas les forcer :

- **La source du battement de veille** (M-3). Elle engage un service extérieur,
  et le § 24 interdit qu'il vive sur la machine surveillée. C'est une décision de
  commanditaire, pas un choix technique — mais elle n'a pas de préalable écrit.
- **Le calendrier de la colonne d'`argHash`** (M-8). Elle entre dans l'empreinte
  chaînée, donc elle se décide **avant le premier chaînage réel**, pas après. Ce
  qui la déclenche est le lot 1, pas le lot 5.

Et **trois points de forme** (C-6) à trancher avant que ces documents restent
publiés en l'état : un chemin de compte, un profil matériel, et deux
contournements de garde publiés avec leur état.

---

## 7 · Ce que cette relecture n'a pas vérifié

- **Les mesures chronométrées d'ADR 0010 n'ont pas été rejouées** — ni le
  démarrage à froid, ni l'interruption à 2 ms, ni les délais de reconnaissance et
  de synthèse. Ce qui **a** été vérifié, c'est l'**instrument** : les trois
  sondes existent, elles interrogent le SDK sans outil ni lecture de fichier sur
  une session tenue ouverte, et le format de leur sortie correspond exactement
  aux chiffres rapportés. _Mesure qui lèverait le doute : relancer les trois
  sondes et comparer — quelques minutes, et un coût d'API._
- **Les deux gardes du dépôt voisin n'ont pas été relancées.** Les 54 entrées
  d'exceptions et les 11 349 fichiers suivis ont été recomptés statiquement ; les
  « 162 routes internes, 1 lien externe » d'ADR 0012 sont **repris tels quels**,
  seule leur cohérence arithmétique avec le seuil du contre-témoin a été
  vérifiée. _Mesure : relancer les deux contrôles et lire le compte, jamais la
  couleur._
- **Les tailles de modèle de dictée n'ont pas été re-téléchargées.**
- **Aucune section du cahier des charges n'a été lue en entier** hors des § 01,
  28, 30, 32, 33 et 35. Les renvois des quatre ADR aux § 09, 11, 12, 14, 16,
  18, 20, 21, 22, 24, 25, 26, 27, 29, 31 et 34 sont **repris sur parole**. C'est
  la borne la plus large de ce document : le sondage a porté sur le code, pas sur
  la conformité au cahier des charges section par section.
- **Le sondage sur `core/` a porté sur un arbre de travail en cours de
  modification.** Un autre chantier écrivait dans `core/` pendant cette
  relecture : 30 fichiers modifiés non validés au moment du sondage. Un seul des
  fichiers vérifiés ici en fait partie — `core/vault/coffre.ts`, et la
  vérification n'y portait que sur un commentaire. Les autres adresses de `core/`
  (le calcul de niveau, le budget de profil, le contrat de quota, la table des
  transitions) ont été lues sur des fichiers **non modifiés**. _À rejouer après la
  validation du lot 1b, en vérifiant le symbole et non le rang._
- **Rien n'a été exécuté dans le dépôt voisin**, et rien n'y a été écrit.
  Rien n'a été validé ni poussé dans le socle : ce document est le seul fichier
  écrit par cette relecture.
