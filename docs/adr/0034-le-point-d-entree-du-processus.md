# ADR 0034 — Le point d'entrée du processus : qui monte les transports, et ce qui l'en empêche

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à la recette du lot 2)
- **Portée** : `ops/index.ts`, `ops/service.ts`, `ops/main.ts` (étage 3), `package.json`
- **Sources** : cahier des charges v6, § 11 (les quatorze étapes, deux colonnes),
  § 19 (règle absolue d'authentification), § 23 (les trois états du coffre),
  § 28 (l'accès passe par une porte), § 30 (le poste local en stdio), § 32
  (critère de recette du lot 1) ; ADR 0018, ADR 0023, ADR 0024, ADR 0025,
  ADR 0032, ADR 0033

---

## Le fait qui rend cette décision nécessaire

À la recette du lot 2, le dépôt portait **deux transports entièrement écrits et
éprouvés, et aucun module de production ne les montait**. Mesuré sur les 128
modules que `pnpm build` émet — critère dérivé de l'`exclude` de
`tsconfig.build.json`, jamais recopié :

| symbole              | appelants de production |
| -------------------- | ----------------------- |
| `creerServeurHttp`   | 0                       |
| `creerTransportHttp` | 0                       |
| `creerServeurStdio`  | 0                       |
| `brancherSurLesFlux` | 0                       |

Le dépôt ne portait par ailleurs **aucun point d'entrée exécutable** : ni `bin`
dans `package.json`, ni garde `import.meta.url` / `process.argv`, ni shebang —
alors que `ops/main.ts` titrait déjà une section « L'ENTRÉE DU PROCESSUS »
au-dessus de trois fabriques d'aide.

Le manque du lot 1d — « le socle est une bibliothèque très bien testée que
personne ne peut appeler » — avait donc été **remonté d'un étage, intact**. Une
seule de ces quatre dettes était écrite au registre des coutures
(`brancherSurLesFlux`, en `à-coudre`, « 0 appelant de production MESURÉ ») ; les
trois autres n'étaient comptées nulle part, et c'est cette asymétrie, plus que le
zéro lui-même, qui a fait passer le défaut pour une gêne d'ergonomie.

---

## Décision

### 1 · Trois fichiers, trois responsabilités, et elles ne se recouvrent pas

- **`ops/main.ts` SÉQUENCE.** Les sept étages de l'ADR 0023, dans l'ordre de
  l'échelle. Il ne monte rien.
- **`ops/service.ts` MONTE.** Il reçoit un socle déjà démarré et des ports ; il
  construit les transports, ou il dit ce qui l'en empêche. Il ne décide d'aucune
  valeur : ni identité, ni audience, ni budget.
- **`ops/index.ts` RELIE.** Il lit l'environnement et les arguments, construit
  les dépendances, appelle les deux autres, et écrit sur la sortie d'erreur.
  C'est le seul fichier du dépôt qui touche `process`, et seulement sous sa garde
  d'entrée.

**Pourquoi trois et non un.** Un montage écrit dans la racine aurait été
inéprouvable sans ouvrir une socket dans la garde des sept étages ; un montage
écrit dans le point d'entrée aurait été inéprouvable tout court, puisqu'un point
d'entrée lit `process.env`. La séparation est ce qui rend `ops/service.spec.ts`
possible : il monte le service **deux fois** dans le même test, sur des flux
fabriqués, et lie une socket éphémère sur `127.0.0.1`.

### 2 · `appelsDOutilsAcceptes` DÉCIDE, il ne se contente plus d'être publié

Le § 23 écrit que sous coffre verrouillé « tout appel d'outil est refusé ». Ce
drapeau était **calculé** par `core/vault/demarrage.ts`, **relayé** par
`ops/demarrage.ts`, **republié** par le healthcheck de `ops/main.ts` — et lu par
personne. Le critère de recette du § 32 était donc éprouvé sur des ÉTIQUETTES
(« `routesServies` contient la chaîne `console` ») et non sur un comportement :
un périmètre d'observation transformé en garantie.

`monterLeService` le LIT, et **ne monte aucun transport d'outils quand il vaut
`false`**. C'est ici, et nulle part ailleurs, que le refus est prononcé.

### 3 · Un empêchement n'est pas une levée — sauf quand c'est un câblage manquant

Trois faits empêchent de servir, et ils sont COMPTÉS, pas levés :

1. le socle ne sert pas (un étage a fait sortir le processus) ;
2. les appels d'outils sont refusés (§ 23) ;
3. la chaîne des quatorze étapes n'est pas composée — aucun noyau n'a été remis.

Lever sur l'un de ces trois ferait d'un socle amputé un socle mort, et le
deuxième état du § 23 perdrait son sens : la console, le healthcheck et le
déverrouillage doivent continuer de répondre.

**En revanche, un transport DEMANDÉ dont il manque un port LÈVE.** Un transport
HTTP monté sans vérificateur de jeton n'aurait aucune étape 2, et l'étape 4
n'aurait aucune ligne `ops_token` à relire : le socle servirait des appels non
authentifiés **en restant vert**, ce que le § 19 interdit absolument. Cinq
mutilations sont fabriquées et éprouvées, avec le témoin inverse obligatoire.

### 4 · L'étage 3 appelle le décideur du § 19, et le port devient un cas limite

`ops/main.ts` appelle désormais `verifierLaConfigurationDAuthentification` sur
les **quatre** réglages que `reglagesDepuisLEnvironnement` extrait de
l'environnement — la liste étant dérivée de `REGLAGES_DAUTHENTIFICATION`, jamais
recopiée. La racine ne reçoit que ces quatre valeurs, jamais l'environnement
entier : `OPS_CONSOLE_SESSION_KEY` est un secret (§ 21), et l'étage 3 n'en
regarde que la présence.

Le port `controlerLAuthentification` demeure, à `null` par défaut. **`null` ne
veut plus dire « aucun contrôle » mais « le décideur réel du § 19 »** : un
environnement vide y rend quatre réglages manquants et le processus sort. Le port
ne sert plus qu'aux verdicts qu'aucun environnement ne sait produire — au premier
chef le contrôle AVEUGLE, qui confronte zéro réglage et doit être refusé.

### 5 · Aucun réglage de service n'a de valeur par défaut

`OPS_TRANSPORTS`, `OPS_CALL_BUDGET_MS`, `OPS_MAX_BODY_BYTES`, `OPS_HTTP_PORT`,
`OPS_WATCH_PERIOD_MS` sont **obligatoires**, et refusés quand ils n'ont pas de
sens. Le cahier des charges ne les fixe nulle part : le § 13 borne des TAILLES de
résultat, le § 12 des DÉBITS, aucun ne borne une DURÉE d'appel ni une taille de
requête. En inventer une reviendrait à décider, depuis le montage, combien de
temps le socle travaille — exactement ce que `ValeursFrappeesParLeTransport`
interdit à l'appelant.

Chacun porte en outre une **borne haute**, parce qu'un réglage sans borne haute
fabrique la panne suivante : un budget d'un an ou un plafond de corps d'un
gigaoctet ne sont pas des réglages, ce sont des pannes qu'on demande.

Les réglages sont lus **AVANT** le démarrage : un socle qui prendrait le verrou
d'instance puis refuserait sur un réglage absent laisserait derrière lui un
verrou tenu par un processus mort.

### 6 · Le magasin de secrets local, et le geste de provision reste explicite

Sur une URL de base qui désigne `HOTE_SANS_MAGASIN_PARTAGE` — la convention que
`choisirImplementationDuVerrou` applique déjà (ADR 0024), dérivée du **même**
symbole —, le coffre est monté sur `DepotEnMemoire`. Il meurt avec le processus :
il ne conserve rien, ne survit à rien, et ne peut donc pas devenir un coffre de
production par inadvertance.

**La provision n'est jamais automatique.** Le § 23 veut qu'un coffre `absent`
refuse le démarrage et que le message NOMME la commande ; provisionner tout seul
rendrait ce refus inatteignable, et personne ne saurait jamais qu'une base a été
remplacée sous le processus. L'argument `--provisionner-le-coffre-local` demande
le geste, et il est **refusé** sur une URL de magasin partagé.

Sur une URL de magasin réel, `ops/index.ts` rend `absent` : le câblage Prisma du
coffre n'existe pas dans ce dépôt, et rendre « verrouillé » ferait démarrer un
socle amputé **sur une absence de code**, tandis que « ouvert » serait un
mensonge.

---

## Conséquences acceptées, écrites plutôt que découvertes

- **Le point d'entrée ne compose pas la chaîne.** `ops/index.ts` remet
  `noyau: null`, et `monterLeService` compte l'empêchement : « la chaîne des
  quatorze étapes n'est pas composée ». Les quatorze étapes exigent un journal
  SCELLÉ par une clé du coffre (ADR 0002), des dépôts de quota et d'idempotence,
  un catalogue épinglé — aucun n'est câblé. Un noyau de fortune ferait servir des
  appels qu'aucune ligne d'`ops_audit` n'atteste, et l'invariant de sortie du
  § 11 tomberait en silence. **Le socle démarre et se tait, plutôt que de servir
  sans journal.**
- **Le catalogue ne filtre pas par profil.** Il est dérivé des adaptateurs admis
  à l'étage 5 ; ce processus n'en soumet aucun, la liste est donc vide, et la
  question du filtrage ne se pose pas encore. Le jour où elle se posera, elle
  passera par `outilsServis()` de `core/profiles` : un catalogue câblé sur
  l'inventaire complet annoncerait des outils que l'étape 7 refuserait ensuite.
- **Le healthcheck n'a pas de route HTTP.** `creerServeurHttp` ne sert que le
  chemin MCP ; publier `/healthz` demanderait soit une seconde écoute, soit un
  aiguillage qui fabriquerait une `TraceDeTraitement` de complaisance. Le
  healthcheck est donc CALCULÉ au démarrage et écrit sur la sortie d'erreur ;
  l'exposer est un geste à part, et il n'est pas fait ici.
- **L'état `verrouillé` n'est pas atteignable depuis le point d'entrée en local**,
  puisque le magasin local est vide tant qu'on ne provisionne pas, et ouvert dès
  qu'on provisionne. Il est éprouvé au niveau de la racine
  (`ops/main.spec.ts`) et du montage (`ops/service.spec.ts`), sur un état de
  coffre injecté.
