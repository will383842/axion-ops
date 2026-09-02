# Journal des modifications — `axion-ops`

Format : une entrée par lot. Les dates sont celles du dépôt, pas d'un
déploiement — **rien n'a été déployé.**

---

## Lot 5 · 2 — le catalogue se lit, et le préfixe cesse d'être posé deux fois — 2026-09-02

### Où vivent les cinq champs qu'`ops_tool` ne porte pas — ADR 0051

`OutilDuCatalogue` exige `pagination`, `compaction`, `maxBytes`, `idFields` et
`adapterVersion`. Quatre colonnes de plus les auraient **recopiées** depuis le
manifeste — et une recopie n'est couverte par **aucune empreinte** : le jour où
une console, une migration ou une main les modifierait, `manifestSha` resterait
vrai pendant que le socle compacterait selon des annotations que personne n'a
relues.

Elles se lisent donc dans le **manifeste épinglé**, sous l'empreinte qu'un humain
a relue. Ce n'est pas une économie de migration : c'est une décision sur
l'endroit où vit la vérité — sous l'empreinte, ou à côté d'elle. La garde ne le
dit pas en prose, elle **change le manifeste sans toucher la ligne** et relit
`maxBytes: 4096`.

Et **une ligne sans épingle n'est pas servie** : inventer un `maxBytes`, ce
serait servir une charge que personne n'a bornée.

### Le défaut que le premier catalogue réel a fait sortir

`nomCompletDeLOutil()` écrivait `` `${outil.adapterId}.${outil.name}` `` — elle
**ajoutait** le préfixe. Or `OutilDuCatalogue.name` **est** le nom complet :
`enregistrerAdaptateur()` le dérive avant de mesurer `bytes` dessus, et
`composerLeNoyau` le compare tel quel. C'est donc
**`axionia.axionia.inbox.recent`** qui serait parti dans `params.name`, et
l'adaptateur d'en face aurait répondu « outil inconnu » sur un appel parfaitement
autorisé.

Le défaut était invisible pour une raison qui vaut d'être notée : `inventaire`
rendait `[]` — aucun `OutilDuCatalogue` réel n'existait — et **le seul témoin du
fichier portait un `name` local**. Une fixture décidait du sens du champ à la
place du type, et elle a tenu vert tout un lot.

La fonction **refuse** désormais (`nom_non_prefixe`) au lieu de rattraper ; le
témoin conserve l'ancienne fabrication en une ligne et mesure ce qu'elle rendait.

### La chaîne complète, sur les documents RÉELS

`adapters/axionia/verrou.spec.ts` parcourt manifeste épinglé → admission →
`ops_tool` → relecture → catalogue → nom sur le fil :

```
[bout en bout] 7 ligne(s) ops_tool insérée(s) · 7 relue(s) · 7 au catalogue ·
7 servi(s) au profil « admin » · 0 sans épingle · 0 désaccord(s)
[bout en bout] sur le fil : axionia.agenda.jour, axionia.agenda.semaine,
axionia.deploiement.etat, axionia.inbox.recent, axionia.pilotage.alertes,
axionia.qualiopi.conformite, axionia.rendezvous.list
```

Elle s'arrête **à la porte du réseau**. Le témoin frère mesure l'autre sens :
sans le manifeste épinglé, les sept lignes sont en base et **0 outil est servi**.

---

## Lot 5 · 1 — la persistance de l'admission — 2026-09-02

`enregistrerAdaptateur()` rendait des lignes que **personne ne prenait**. L'étage 5
admettait `axionia` à chaque démarrage, comptait `adaptateursAdmis: 1`, et jetait
le résultat : mesure transcrite, **un seul module de production touchait Prisma**
(`core/vault/depot.ts`). Aucune ligne `ops_adapter`, aucune ligne `ops_tool`
n'avait jamais pu être écrite par ce dépôt — d'où `outilsEpingles = []` à la
racine, et d'où aucun outil servi.

### Ce que ce lot pose — ADR 0050

`core/registry/depot.ts` : un port `DepotDuRegistre`, deux prises (mémoire et
Prisma par interface **structurelle**), sur le patron exact de
`core/vault/depot.ts`. `depot.spec.ts` **dérive de `prisma/schema.prisma`** la
liste des colonnes et confronte celles que le module touche.

### La décision qui porte le reste : les cinq colonnes de la console

`enabled`, `retiredAt`, `sunsetAt`, `limit`, `warnAt` sont **absentes de la
branche `update`** des deux prises — le type l'exige, le corps le fait.

Le motif est une mesure, pas une précaution : le socle admet ses adaptateurs **à
chaque démarrage**. Une prise qui réécrirait `enabled` remettrait donc `false` à
chaque redéploiement, alors que le § 14, correction 3, fait précisément
d'`enabled` la bascule d'urgence « en console, **sans redéploiement** ». C'est
mot pour mot le motif qui exclut `bootstrapCount` de l'upsert du coffre : **un
réglage qu'un redémarrage peut faire reculer ne règle rien.**

La garde ne lit pas le corps des méthodes : elle **admet deux fois**, pose
entre-temps le geste de console, et **relit** `enabled: true`, `limit: 200`,
`warnAt: 160`. Le témoin joue la prise fautive en une ligne et mesure le retour à
`enabled: false`.

### Ce qui est NOMMÉ plutôt que fait

Un outil disparu du manifeste sort en `outilsOrphelins` et **rien ne le touche** :
le supprimer effacerait les réglages d'un outil que le § 13.4 veut « retiré de la
liste, encore appelable six mois » ; le désactiver serait la mise à jour
silencieuse que le § 20 interdit dans l'autre sens. La garde relit la ligne
orpheline et exige qu'elle soit **là ET encore activée**.

### Ce que ce lot ne fait pas

Il ne branche rien : `ops/main.ts` et `ops/index.ts` admettent toujours en
mémoire. Il ne lit pas le catalogue : les cinq champs qu'`OutilDuCatalogue` exige
et qu'`ops_tool` ne porte pas sont l'objet du lot suivant. Et `pnpm db:deploy`
n'a toujours **aucune cible** — la décision est éprouvée sur le jumeau en mémoire
et sur un client Prisma feint qui tient de vraies tables, ce qui permet
d'admettre deux fois et de relire, mais ne remplace pas une application réelle de
la migration.

---

## Lot 4, RECETTE — la garde des assertions attaquée, et ce qu'elle laissait passer — 2026-09-01

Le lot 4 a posé G4 pour rendre impossible qu'une décision soit déclarée fermée
sans qu'un test la voie. **Son épreuve a montré que G4 pouvait être fermée par un
test qui ne peut pas rougir** — c'est-à-dire par le défaut même qu'elle existe
pour interdire. La recette a fermé trois de ces brèches, chacune vue ROUGE avant
correction, et laissé les autres NOMMÉES plutôt que discrètes.

### Le chiffre du lot, et ce qu'il ne dit pas

**44 ADR inscrits au registre · 10 portent au moins une décision qu'un test voit
· 34 n'en portent AUCUNE.** C'est le chiffre neuf du dossier, et il ne dit
qu'une chose : ces 34 ADR ne sont gardés que par G1 — « le symbole a des
appelants » — jamais par « la décision a atterri ». Il ne dit pas que les 10
autres sont sûrs : G4 mesure des **formes sur le disque**, elle ne fait pas
tourner le test et ne peut pas savoir qu'une mutation de la décision le tue.

### Ce que la recette a fermé — ADR 0048, trois brèches de G4

| brèche                                                             | ROUGE avant                                   | VERT après                                      |
| ------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| `expect(1).toBe(1)` satisfaisait « au moins un `expect(` »         | `expected 0 to be greater than or equal to 1` | 1 anomalie · `expectsFalsifiables` compté       |
| un `it()` dans un `describe.skip` : G4 le trouvait, vitest non     | `expected 0 to be greater than or equal to 1` | `describe.skip → 1` **et** `it.skip → 1`        |
| le cliquet des « sans assertion » était un TOTAL, donc compensable | `expected 88 to be greater than 88`           | 1 identité ENTRANTE nommée, total inchangé à 88 |

La troisième est la plus instructive : **aucun correctif ne pouvait sauver le
total.** `sansAssertion` vaut `entrées − avecAssertion` — une soustraction est
incapable de distinguer un échange d'un ajout. Le cliquet porte donc désormais
sur l'**identité** (88 identités figées), et le total reste annoncé à côté, pour
que son incapacité reste lue au lieu d'être corrigée par oubli.

### Ce qui est ANNONCÉ parce que la garde ne sait pas trancher

- **24 des 53 noms exigés ne vivent que dans un littéral.** Un test qui lit une
  source du dépôt y cherche légitimement un nom en littéral ; un `console.info`
  le fournit tout aussi bien. G4 ne peut pas, par construction, distinguer une
  mesure d'un message — elle en compte donc la part.
- **1 assertion est partagée par deux entrées** (ADR 0036 et 0043, qui portent la
  même règle). Légitime — et c'est aussi la forme exacte que prend la
  compensation ci-dessus. Rendue visible, jamais reprochée.
- **0 fichier sur 323 porte un `.skip` / `.only` / `.todo`.** Aucune garde du
  dépôt ne l'interdit : la porte est ouverte, elle n'est pas empruntée.

### Ce que la recette a corrigé sans le coder — ADR 0044, § 4

La § 4 de l'ADR 0044 promettait qu'« un `reponseSansFuite` refuse d'expédier une
réponse dont le filet n'a confronté aucune valeur ». **Ce symbole n'existe nulle
part et n'a jamais existé** : la propriété n'a pas « survécu à la remontée »,
elle n'a jamais eu de porteur. Le paragraphe porte désormais sa correction.

Et la règle **n'a pas été reprise telle quelle**, parce qu'elle est dangereuse
comme elle est écrite : `valeursConfrontees === 0` vaut aussi zéro quand toutes
les valeurs nommées ont été légitimement écartées pour être plus courtes que le
seuil. Un en-tête `Host` de sept caractères suffit — poser `refuser si
valeursConfrontees === 0` dans les deux transports ferait refuser **toutes** les
réponses du socle. Le refus juste distingue les deux cas ; la dette reste nommée,
avec cette distinction écrite dedans.

### Les sept points du lot 3

**Cinq fermés** — la fente `journalDesRefus`/`delaiDeReprise` sur
`PortsDuService` (0037) ; le plafond de 40 à l'étape 7 et le sosie supprimé
(0043) ; `prisma/migrations/` et le chaînage du script d'ajout seul (0045) ; le
filet anti-fuite remonté et appelé par les DEUX transports (0044) ;
`upstream_unavailable` a enfin un émetteur (0047). **Un fermé partiellement** —
le registre et sa garde (0041 puis 0048) : le mécanisme existe et mord, trois de
ses brèches sont refermées, une reste nommée. **Un déplacé, pas fermé** — le
`.env` (0042) : la garde existe et morde, mais ses 6 sondes sont écrites à la
main quand `.gitignore` porte 16 règles de secret ; **11 ne sont exercées par
aucune sonde**, et l'avertissement en tête du fichier affirme le contraire à
celui qui l'édite. Dette nommée, correctif écrit : dériver les sondes.

### Mesuré

`156 fichiers · 1 724 tests verts · 34 dettes nommées · 0 rouge` — quatre gates
vertes, **44 ADR dont 41 acceptées**, 112 entrées au registre, 24 assertions,
0 anomalie sur G1, G2 et G4. Le socle **démarre et sert** :
`7 étages franchis · tools/list servi · tools/call refusé à l'étape 6 · code 0`.
`pnpm ops:vault:init` existe désormais et répond : `0` avec clé, `1` sans, et un
refus NOMMÉ sur le chemin base tant que `prisma generate` n'a pas tourné.

**Des 31 dettes nommées héritées de `b8718f7`, ZÉRO n'a été fermée.** Le lot 4 en
a ajouté 6, la recette en a fermé 3. Le compte monte de 31 à 34, et c'est écrit
ici plutôt que dilué dans un total.

---

## Lot 4 — le second fait du registre : une décision n'est fermée que si une assertion la voit — 2026-09-01

Le lot 1d avait construit une garde de couture pour rendre impossible le défaut
« une décision écrite, testée, documentée, et jamais branchée ». **Elle tourne,
elle annonce ses comptes, elle est verte.** Et **deux ADR du lot 3 — 0036 et
0037, toutes deux marquées « Statut : acceptée » — ne sont pas atterries.**

La garde n'a rien vu, **et elle avait raison sur ce qu'elle mesure** : l'état
`cousue` compte les **appelants de production d'un symbole**, jamais
l'atterrissage d'une décision. Les deux se séparent exactement là où personne ne
regarde — quand une décision NEUVE porte sur un symbole **DÉJÀ COUSU**. Ajouter
un champ à `PortsDuService`, poser un refus dans le bloc de l'étape 7 : le
symbole garde ses appelants, l'entrée reste verte.

> **Une garde peut être verte, honnête, et mesurer autre chose que ce que son
> lecteur croit.**

### Le chiffre qui manquait au projet

À l'écriture de la garde, sur le registre inchangé : **90 entrées, 0 assertion,
36 ADR inscrits dont 36 qu'aucun test ne voit.** Après le lot : 99 entrées,
**11 avec assertion**, dont **7 en dette nommée**, et **7 ADR sur 41** portent au
moins une décision qu'un test voit. Le cliquet interdit seulement que le compte
des `sans-assertion` **monte**.

### Ce qui est neuf

- **ADR 0041 — la garde de couture v2.** Chaque entrée porte désormais deux
  faits, jamais confondus : `appelants` (inchangé) et **`assertion`**, le nom
  d'un test qui échoue si la décision n'a pas atterri. L'assertion n'est pas une
  chaîne : le fichier doit exister et être un `.spec.ts`, le test y être déclaré
  sous ce nom exact, son corps s'isoler **sans fuir** jusqu'au voisin, porter au
  moins un `expect(` et **nommer** ce que la décision a changé. **La garde
  s'inscrit elle-même au registre** — le lot 3 écrivait « ET JE SUIS LOGÉ À LA
  MÊME ENSEIGNE » ; ce lot-ci refuse cette phrase.
- **Le défaut central est nommé, pas reproché.** Une entrée `cousue` dont
  l'assertion est en dette dit **deux vérités à la fois**. La liste sort nommée
  (`cousuesNonAtterries`, trois entrées aujourd'hui) et un cliquet la garde.
- **ADR 0042 — le `.env` reste où il est, et la garde se pose.** Déplacer le
  fichier l'emmène là où plus aucune règle ne le couvre et ne pose aucune garde.
  `ops/depot-public.ts` rougit dans trois sens, et le troisième — les **sondes**
  d'ignorance — est le seul qui morde sur une machine propre. **Ce qu'elle a
  trouvé le jour même n'était pas le risque signalé** : sur 6 sondes, **3
  n'étaient pas ignorées** (`secrets.json`, `id_rsa`, `prive.pem`).
- **ADR 0043, 0044, 0045 — trois décisions tranchées pour les correcteurs** : où
  exactement le plafond de 40 se refuse et dans quel ordre le sosie
  d'`integration.spec.ts` disparaît ; où remonte le filet anti-fuite pour servir
  les deux transports ; la migration initiale et ce après quoi le script
  d'ajout-seul s'applique.
- **Six dettes NOMMÉES** dans
  `core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts`. Chacune
  est un `it.fails` inscrit au registre : le retirer sans retirer l'entrée fait
  rougir G4, et il **rougit le jour où la décision atterrit**.

### Mesuré

`135 fichiers · 1506 tests verts · 37 dettes nommées · 0 rouge` — quatre gates
vertes, 41 ADR. **Cinq mutations posées, cinq mortes**, restaurations vérifiées à
l'octet. La première est la démonstration du lot : renommer sur le disque un test
nommé au registre fait rougir G4 **et laisse G1 parfaitement verte**.

---

## Lot 3 — fermer les constats, tuer les mutations survivantes, composer la chaîne — 2026-09-01

Le lot 2 s'était terminé sur un jalon manqué, écrit en toutes lettres : **le
socle démarrait et ne servait pas depuis son propre processus.** Le lot 3 ferme
ce manque, et l'audit qui l'a précédé a mesuré le reste par **113 mutations**
appliquées au vrai code, suite complète relancée à chaque fois : 86,5 % de mises
à mort au cœur, 73,3 % sur la chaîne, 89,1 % sur le transport — **18
comportements que rien ne vérifiait.**

### Le jalon est franchi, et il est mesuré deux fois

**Lancement réel**, `ops/index.ts --provisionner-le-coffre-local`, réglages
factices sur `stub.invalid`, aucun réseau, aucune base : 7 étages franchis,
28 champs de `DependancesOrchestrateur` composés, transport stdio monté,
**0 empêchement**, `tools/list` servi, et un `tools/call` sur un outil inconnu
refusé à l'**étape 6** — la chaîne est traversée, pas simulée. Code de sortie 0.

**Et une garde le rejoue** : `ops/racine-en-service.temoin.spec.ts` appelle
`demarrerLeProcessus` sur des flux en mémoire — jamais `composerLeNoyau`, jamais
un `PortsDuService` fabriqué.

### Ce que la recette a trouvé, et fermé

**Bloquants** — deux mutations survivaient, toutes deux vérifiées par la recette
sur la suite complète avant correction, et tuées après.

- **La ligne qui compose la chaîne n'était traversée par aucun test.**
  `ops/index.ts`, `noyau: noyau.fabrique,` → `noyau: null,` : suite complète
  **verte**, 132 fichiers, 1 489 tests. Ce qui existait — `ops/composition/noyau.spec.ts`
  en isolation, `ops/service.spec.ts` avec son propre noyau — mesurait que la
  chaîne était _composable_. `demarrerLeProcessus` n'avait qu'un seul appelant
  dans tout le dépôt, l'amorce, et aucun `.spec.ts`.
- **Le seuil de marge était écrit deux fois, et celle des deux écritures qui
  mordait était la non gardée.** `marge-des-gardes.config.ts` portait son propre
  `if (dureeMs > seuilMs)`. Le remplacer par `> PLAFOND_DE_TEST_MS` laissait la
  suite entièrement verte — et rendait l'alarme **structurellement morte**,
  puisque vitest tue le test AU plafond avant que l'`afterEach` ne s'exécute.
  `alerteDeDepassement` porte désormais la décision, l'amorce ne fait que la
  relayer, et un témoin **lit le fichier d'amorce sur disque** pour exiger
  1 appel au verdict et 0 comparaison propre.

- **CONSTAT N° 1 : la suite n'était pas reproductible.** Cinq exécutions vertes,
  puis une rouge, sur un **arbre inchangé** — et c'est l'alarme de l'ADR 0040
  qui tirait, sur une garde JUSTE. `sansProse` et `sansLiaisons` étaient
  appelées au cœur d'une double boucle de 89 entrées × 134 modules, soit près de
  12 000 passages de quatre expressions régulières globales, pour un résultat
  qui ne dépend que du fichier. La contention était réelle et identifiée : une
  seconde session travaillait sur un autre dépôt de la même machine. **Contre-
  épreuve faite avant de corriger** — avec l'armement d'origine restauré et la
  même contention, la suite rougissait à l'identique : le défaut était déjà là.
  Le remède est celui que l'ADR 0040 prescrit, **rendre la garde moins chère,
  jamais remonter le plafond** : pire garde 4 641 ms → **1 337 ms** (15 % → 4 %
  du plafond), temps de test de la suite 56,7 s → **16,0 s**. Vérifié sous
  **trois suites concurrentes** — plus dur que la condition qui cassait — :
  133 fichiers verts chacune, **zéro alerte**.

**Vérifié sans y toucher** — six mutations rejouées au hasard par le protocole
complet : **m15**, **m19**, **R1**, **R6** tuées comme annoncé ; **A7** et
**B16** survivantes, ce sont les deux ci-dessus.

### Ce qui reste ouvert

Voir **`docs/ETAT.md`**. En bref : deux décisions d'ADR marquées « acceptée » ne
sont **pas atterries** (0037 § 2-3, 0036 § 1), un code du § 15 n'est émis par
personne, le filet anti-fuite ne couvre qu'un transport sur deux,
`prisma/migrations/` n'existe pas, la prose du registre des coutures n'est
confrontée à rien — et **aucun des 24 `it.fails` du lot 2 n'a été fermé** : le
compte passe à 31 parce que sept ont été ouverts.

### Mesures de fin de lot

| Gate                   | Résultat                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`       | vert                                                                                                  |
| `pnpm lint`            | vert, 0 avertissement                                                                                 |
| `pnpm format:check`    | vert                                                                                                  |
| `pnpm prisma:validate` | vert (URL stub)                                                                                       |
| `pnpm test`            | **133 fichiers · 1 494 verts · 31 `it.fails` attendus · 0 rouge** · temps de test 56,7 s → **16,0 s** |
| `ops/temoin-ci.ts`     | **4 gates éprouvées sur 4, 0 anomalie** — chacune rougit sur un défaut fabriqué                       |
| Reproductibilité       | **5 exécutions sur 5 identiques**, et **3 suites concurrentes vertes, 0 alerte**                      |

---

## Lot 2 — le socle démarre et répond — 2026-09-01

Le lot 1d s'était terminé sur un manque nommé en toutes lettres : **rien
n'appelait le socle.** Le cœur était écrit et prouvé, et personne ne pouvait
l'atteindre. Le lot 2 devait fermer ce manque.

**Il l'a fermé d'un cran, et rouvert au cran du dessus.** Il a livré les deux
transports — HTTP streamable et stdio —, l'émetteur de jetons, la politique
d'accès chemin par chemin, la racine de composition et ses sept étages. Et, à la
recette, mesuré sur les 128 modules que `pnpm build` émettait :

| symbole              | appelants de production |
| -------------------- | ----------------------- |
| `creerServeurHttp`   | 0                       |
| `creerTransportHttp` | 0                       |
| `creerServeurStdio`  | 0                       |
| `brancherSurLesFlux` | 0                       |
| `demarrerLeSocle`    | 0                       |

Aucun `bin` dans `package.json`, aucune garde `import.meta.url` / `process.argv`,
aucun shebang — alors que `ops/main.ts` titrait déjà une section « L'ENTRÉE DU
PROCESSUS » au-dessus de trois fabriques d'aide. **« Le socle démarre » ne
désignait aucun geste possible.**

### Ce que la recette a écrit

| Fichier               | Ce qu'il fait                                                                         |
| --------------------- | ------------------------------------------------------------------------------------- |
| `ops/index.ts`        | **le point d'entrée du processus** — lit l'environnement, appelle la racine, monte    |
| `ops/service.ts`      | **le montage** — construit les transports, ou NOMME ce qui l'en empêche               |
| `ops/service.spec.ts` | la seule garde du dépôt qui mesure **un octet qui revient** : socket réelle, fil réel |
| `docs/adr/0034`       | la décision, ses six points et ses conséquences acceptées                             |

**ADR 0034.** Trois fichiers, trois responsabilités : `ops/main.ts` SÉQUENCE,
`ops/service.ts` MONTE, `ops/index.ts` RELIE. La séparation n'est pas une
coquetterie — c'est ce qui rend le montage éprouvable sans lire `process.env`, et
ce qui permet à `ops/service.spec.ts` de lier une socket éphémère sur
`127.0.0.1`, d'envoyer un `tools/call` et de lire un `result`.

### Les quatre défauts que la recette a fermés, et un qu'elle n'a pas pu fermer

**1 · L'étage 3 était écrit et débranché.**
`verifierLaConfigurationDAuthentification` existait, exportée, gardée — et la
racine ne l'appelait pas ; son port valait `null`, donc l'étage 3 REFUSAIT, donc
**la racine livrée ne démarrait sur AUCUNE configuration**. Le seul démarrage
vert du dépôt était celui que sa propre garde s'accordait, en fabriquant un
verdict qui annonçait `reglagesConfrontes: 5` là où le décideur réel en confronte
**4**. Deux dérivations d'un même fait, dans le même lot, qui se contredisaient —
et c'était la fabriquée qui était verte, précisément parce qu'elle ne dérivait de
rien.

**2 · La garde G3 de l'ADR 0014 était ROUGE, et sur une PHRASE.** Le motif de
l'entrée `sessionId` de `core/types.ts` NOMMAIT la conversion forcée en prose ;
G3 retirait les commentaires, jamais les chaînes. Une garde de sûreté rouge pour
une mauvaise raison s'apprend à ignorer, puis se désactive. Le nettoyage vit
désormais dans **un seul symbole partagé** (`sansCommentairesNiChaines`, un
balayage à états), et G3 a gagné le **cinquième témoin qui manquait** — plus un
sixième, en sens inverse : une conversion écrite dans la substitution d'un
gabarit est du CODE et doit rester vue.

**3 · Une garde EXIGEAIT la persistance du défaut qu'elle mesurait.** La garde du
raccordement de `demarrerPolitique` assurait `citationsEnProse.length >= 1` —
c'est-à-dire qu'au moins un module continue d'être compté pour un appelant alors
qu'il ne nomme la fonction que dans un commentaire. Un cliquet à l'envers, qui
aurait rougi le jour de la correction. `verifierLeCablageDuDemarrage` retire
désormais prose et chaînes ; l'assertion est remplacée par un **témoin fabriqué à
trois régimes**, et la borne est ANNONCÉE au lieu d'être exigée.

**4 · La garde de l'appelant unique du cliquet promettait « tout le code de
production » et ne lisait que `core/`.** Le lot 2 avait porté `ops/` à douze
modules livrés, dont la racine de composition : **aucun n'était regardé**, et son
plancher-témoin (« plus de cinquante fichiers ») était franchi sans peine par un
périmètre amputé. Elle lisait en outre cinq fichiers que `pnpm build` n'émet pas.
Le périmètre « de production » est maintenant **dérivé une seule fois**, dans
`core/epreuve/perimetre-de-production.ts`, et la garde lit 128 fichiers.

**5 · Ce que la recette n'a PAS pu fermer, et qui est écrit plutôt que tu.**
`ops/index.ts` remet `noyau: null`, et `monterLeService` COMPTE l'empêchement :
« la chaîne des quatorze étapes n'est pas composée ». Les quatorze étapes exigent
un journal SCELLÉ par une clé du coffre (ADR 0002), des dépôts de quota et
d'idempotence, un catalogue épinglé — **aucun n'est câblé dans ce dépôt**. Un
noyau de fortune ferait servir des appels qu'aucune ligne d'`ops_audit`
n'atteste. **Le socle démarre et se tait, plutôt que de servir sans journal.**

### `appelsDOutilsAcceptes` DÉCIDE enfin

Le § 23 écrit que sous coffre verrouillé « tout appel d'outil est refusé ». Ce
drapeau était calculé par `core/vault/demarrage.ts`, relayé par
`ops/demarrage.ts`, republié par le healthcheck — et **lu par personne**. Le
critère de recette du § 32 était donc éprouvé sur des ÉTIQUETTES
(« `routesServies` contient la chaîne `console` ») et non sur un comportement.
`monterLeService` le LIT, et ne monte aucun transport d'outils quand il vaut
`false`.

### Le socle a été LANCÉ, et voici ce qu'il fait

Quatre exécutions réelles, en local, sur `stub.invalid` (RFC 2606), avec des
valeurs factices :

| Ce qu'on lui donne                                | Ce qu'il fait                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| rien                                              | refuse **4 réglages**, code de sortie **1**, aucun verrou pris                    |
| réglages complets, base factice                   | refuse à l'**étage 2** — coffre absent —, code **2**, message nommant la commande |
| coffre local provisionné, aucune authentification | refuse à l'**étage 3**, code **3**, « le § 19 pose une règle absolue »            |
| tout, coffre local provisionné                    | **7 étages franchis**, healthcheck **200**, `vaultLocked: false`, code **0**      |

Et sur le fil, mesuré par `ops/service.spec.ts` : une socket liée sur
`127.0.0.1`, un `POST /api/mcp` qui rend **200** et un corps portant `result`
(jamais `error`) ; trois `tools/list` poussés sur le flux stdio, **3 réponses
écrites, 0 levée**, et les trois comptes de relecture du catalogue qui coïncident.

### La mesure du lot

- **Les quatre gates** : `typecheck`, `lint`, `format:check`, `test` — **vertes**.
- **Tests** : **1 418 verts, 0 rouge**, contre **1 409 verts et 9 ROUGES** à
  l'ouverture de la recette.
- **Dettes nommées** : **24 `it.fails`**, contre 28 — **quatre fermées**, toutes
  par le point d'entrée : « un point d'entrée doit APPELER la racine », « la
  racine doit MONTER un transport », « le drapeau des appels d'outils doit
  atteindre un refus », « les quatre montages ont ZÉRO appelant ».
- **Registre des coutures** : **52 symboles cousus sur 67 confrontés**, contre
  48 sur 65 — deux entrées basculées
  (`verifierLaConfigurationDAuthentification`, `brancherSurLesFlux`) et deux
  entrées neuves (ADR 0034).
- **Gardes sans compte annoncé** : **0 sur 124**. Aucune régression.
- **Périmètre** : 260 fichiers TypeScript, **130 émis** par `pnpm build`.

### Les témoins des coutures neuves

Cinq mutilations fabriquées, cinq gardes qui rougissent, toutes restaurées :

| Témoin                                           | Ce qui rougit                                           |
| ------------------------------------------------ | ------------------------------------------------------- |
| `brancherSurLesFlux` débranché                   | `ops/service.spec.ts` (2), registre G1                  |
| l'étage 3 n'appelle plus le décideur du § 19     | couverture des étages, registre G1, épreuve étage 3 (4) |
| `monterLeService` ignore `appelsDOutilsAcceptes` | `ops/service.spec.ts`, épreuve du démarrage (2)         |
| `ops/index.ts` n'appelle plus `monterLeService`  | épreuve « rien n'écoute »                               |
| `creerServeurHttp` débranché                     | `ops/service.spec.ts`, épreuve du transport (3)         |

## Lot 1d — brancher les décisions, fermer le canal `idempotencyKey` et le rejeu après panne — 2026-08-31

Le lot 1c s'est terminé sur un mode de défaillance que personne n'avait
anticipé, et qu'un fichier d'épreuve porte dans son nom
(`lot1c-la-couture-manquante.temoin.spec.ts`) : **une décision écrite, testée,
documentée — et non cousue au chemin de production.** Quatre ADR sur cinq
étaient dans cet état. Leurs fonctions existaient, étaient exportées, étaient
gardées — et **aucun module de production ne les appelait**. Les tests passaient
parce qu'ils éprouvaient la FONCTION, jamais son BRANCHEMENT.

Ce lot coud. Et il pose le mécanisme qui empêche que cela recommence.

### Les quatre décisions du lot

| ADR      | Décision                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **0019** | Toute décision d'architecture **nomme le symbole qui la porte**, et une garde confronte ce registre au graphe d'appels réel.                  |
| **0020** | La **clé d'idempotence n'atteint plus l'adaptateur** ; le `ctx` n'en porte que l'empreinte, et le nom reste interdit dans un schéma d'entrée. |
| **0021** | L'**issue d'idempotence se dérive du cliquet** d'effet extérieur, jamais du seul genre de la terminaison.                                     |
| **0022** | La **ligne d'intention a une FORME et un COMPTEUR**, et les deux atterrissent ensemble.                                                       |

### Ce que la recette a écrit, et pourquoi

**La pièce qui manquait était la garde de l'ADR 0019 elle-même.** L'ADR pose
trois pièces « indissociables » — un registre typé, une garde qui le confronte au
graphe d'appels (G1), une garde de couverture qui lit `docs/adr/` (G2). **Seule
la première avait été écrite.** Le registre — 33 entrées, 18 ADR — était une
DONNÉE que rien ne relisait, et l'entrée qui le décrit lui-même déléguait sa
mesure à `core/coutures/registre.spec.ts`, c'est-à-dire à un fichier absent.
**L'ADR écrite pour empêcher qu'une décision reste non cousue était elle-même
non cousue** : le défaut du lot 1c reproduit à l'intérieur de son propre remède.

Trois fichiers y répondent :

- `core/coutures/verifier.ts` — le corps, **fonction PURE d'un ensemble de
  fichiers injecté**. Il ne lit ni le disque, ni le registre, ni
  `tsconfig.build.json` : tout lui est passé en argument, ce qui rend le témoin
  possible sans mutiler le dépôt ;
- `core/coutures/registre.spec.ts` — **G1 et G2 sur le dépôt réel**, avec les
  quatre planchers que l'ADR prescrit ;
- `core/coutures/couture.temoin.spec.ts` — **G3, quatorze témoins fabriqués**,
  dont **huit exigent un rouge**.

**Et elle a rougi tout de suite, sur un désaccord réel.** L'entrée ADR 0018
déclarait `deciderDemarrageMonoInstance` en état `à-coudre` — « exactement zéro
appelant », motif « 🔴 la fonction n'existe pas encore » — alors que la fonction
était définie et appelée par `core/instance/demarrage.ts`, **dans le même arbre
de travail**. C'est le second sens de rougissement, celui que l'ADR 0019 nomme
« celui qu'on oublie d'écrire », survenu dans le lot même qui l'a écrit, et rien
ne l'avait vu parce que la garde n'existait pas.

### La mesure du lot

**18 symboles ont au moins un appelant de production, sur 27 confrontés** ; les
9 autres sont en `à-coudre`, c'est-à-dire **zéro appelant EXIGÉ et mesuré** —
leur appelant est `core/transport/`, qui n'existe pas. **11 des 18 ADR portent au
moins une décision appelée par un module de production.** Le registre compte 33
entrées : 18 `cousue`, 9 `à-coudre`, 2 `à-nommer`, 4 `hors-code`. **0 désaccord**,
sur **90 modules de production balayés**.

### Les autres corrections de la recette

- **`tsconfig.build.json` gagne ses deux exclusions** (décision 3 de l'ADR 0019).
  `core/epreuve/` et tout `fixtures.ts` étaient **émis par `pnpm build`** et
  comptaient donc comme modules de production : un symbole dont l'unique appelant
  aurait été une fabrique de témoins serait passé pour cousu. Mesuré : `dist`
  passe de 92 à 90 fichiers `.js`, et **aucun module de production n'en importe
  un seul**.
- **`core/audit/fixtures.ts` retrouve une vraie session.** Le repli
  `SESSION_HORS_APPEL`, posé faute de pouvoir importer la fabrique depuis un
  fichier livré, est levé — le kit n'est plus livré. ⚠️ **Et il ne se levait pas
  comme l'écart le proposait :** `sessionIdDeTemoin()` rend deux sessions
  différentes à deux appels, par décision écrite ; l'appeler dans le corps de
  `contenuTemoin` a rendu le kit NON DÉTERMINISTE et fait rougir
  `core/audit/canonique.spec.ts` sur-le-champ. Les deux sessions sont donc
  frappées **une fois au chargement**, et alternées comme avant l'ADR 0014.
- **Le contrôle 4 d'`ops/mono-instance.ts` cesse d'être une seconde dérivation.**
  Il recalculait le statut de healthcheck par un ternaire, pendant que
  `statutHealthcheckPourVerrou()` disait la même chose. Une garde de SOURCE le
  tient désormais, avec son témoin fabriqué — **1 appel, 0 recalcul** —, et la
  mesure « 4 états du verrou confrontés, 0 désaccord » dit pourquoi aucune garde
  de comportement ne pouvait voir ce défaut.
- **Le rapport du contrôle 7 annonce ses TROIS comptes** (ADR 0020) :
  `9 · 1 · 1 · 11 au total`. Il en annonçait deux, et `9 + 1 ≠ 11` — le onzième
  nom EST le troisième ensemble, celui qui empêche le retrait d'`idempotencyKey`
  de rouvrir ce nom dans un schéma d'entrée en silence.
- **Le témoin qui mesurait ce rapport a été resserré**, parce qu'il était devenu
  vrai pour la mauvaise raison : il cherchait `cles.<champ>.length` dans TOUT le
  fichier, et le correctif y avait posé un plancher portant la même forme.
  Mesuré en débranchant — le compte retiré du MESSAGE, il restait vert et
  annonçait « 3 annoncés ». Il ne lit plus que le `console.info` du rapport.
- **`docs/adr/README.md`** dit ce qu'il en est de la plage **0006-0009** : elle
  n'a jamais été attribuée — vérifié sur l'historique complet, aucune
  suppression, aucune mention nulle part. La garde G2 compte désormais les trous
  de numérotation, que la dérivation par le contenu du dossier rend invisibles.
- **Le README passe de dix à onze écarts** relevés dans le cahier des charges :
  `ops_audit.sessionId` porte **deux populations de lignes**, et la valeur
  réservée dit « cette ligne n'a pas de session », jamais « cette ligne n'est pas
  un appel ».

### Les `it.fails` qui ont basculé

Cinq attentes ouvertes ont ROUGI en atterrissant — ce qu'un `it.fails` est écrit
pour produire — et sont passées en `it()` : les deux gardes de l'ADR 0019
existent · toute mesure déléguée nomme un fichier qui existe · aucune entrée du
registre ne contredit le graphe d'appels · aucune fabrique de témoins n'est
émise par `pnpm build` · le rapport du contrôle 7 annonce ses trois comptes. Le
cliquet des désaccords connus s'est **vidé**. **Aucun test n'a été supprimé ni
affaibli** ; un `it()` a vu son FAIT mesuré mis à jour, motif écrit à côté.

### Les gates, mesurées

`pnpm typecheck` **vert** · `pnpm lint` **vert** · `pnpm format:check` **vert sur
tout le dépôt** · `pnpm test` **1 138 verts, 12 `it.fails`, 1 `.todo`, 0 rouge**
(184 fichiers TypeScript, 91 de gardes, **0 sans compte annoncé**) · `pnpm build`
**vert**, 90 modules émis.

### Ce qui reste ouvert — et le premier est un BLOQUANT

- 🔴 **`ops_audit.tool` et `ops_audit.principal` ne sont bornés par RIEN**, et une
  terminaison peut ne laisser **aucune ligne**. Les deux champs sont posés
  verbatim dans l'en-tête vivant depuis `AppelEntrant.nomComplet` et
  `IdentiteAppelante` ; la garde de forme du § 31 refuse alors la ligne, et
  l'écriture lève HORS du `try` de `journaliser`. Rien ne SORT — la porte est
  fermée —, c'est la TRACE qui est perdue, et avec elle l'invariant du § 11 et la
  métrique de refus du § 24. Mesuré par l'épreuve : **4 formes soumises,
  4 levées, 0 ligne écrite**, avec son témoin de capacité apparié (2 cas bien
  formés → 2 lignes). **Non corrigé ici : le choix de la valeur de repli et la
  question de savoir si un `principal` malformé doit refuser l'appel ou seulement
  borner sa trace sont des arbitrages de cahier des charges**, et les combler par
  une supposition serait le geste que ce lot existe pour proscrire.
- **L'inventaire des canaux du § 20 est clos sur la destination, pas sur la
  source** : `AppelEntrant` (5 champs) et `IdentiteAppelante` (6, couverts par
  simple homonymie) ne sont classés par aucun inventaire tenu par le compilateur.
- **Le code d'erreur de l'étape 13 est écrasé par celui de son ancrage** : quatre
  causes d'idempotence de natures opposées sortent en `conflict`, là où
  `invalid_input` dirait « corrige ton argument » plutôt que « relis et rejoue ».
- **La moitié Postgres de l'ADR 0018 n'est pas écrite**, et aucun point d'entrée
  de conteneur n'appelle `demarrerLeSocleMonoInstance` : un socle déployé
  aujourd'hui ne prendrait toujours aucun verrou.
- **`verifierEnumerationProfils` (ADR 0004) n'a toujours aucun appelant** — le
  jumeau oublié de `verifierFormeDuSceau` : le sceau des profils est confronté
  dans sa FORME et jamais dans son CONTENU.
- **`ops_tool.governanceFields` n'existe pas dans `prisma/schema.prisma`** : la
  déclaration de l'ADR 0016 voyage du manifeste à l'étape 11 **par le type**, et
  la couture est complète sur tout le chemin qui EXISTE — mais elle ne survivra
  pas au premier catalogue réel si la colonne n'atterrit pas avec lui.

---

## Lot 1c — cinq décisions d'architecture, et la moitié de leur couture — 2026-08-31

L'épreuve adverse du lot 1b avait montré que **la garde la plus importante du
socle — l'anti-exfiltration du § 20 — pouvait être désarmée de deux façons**, et
les agents avaient refusé de trancher seuls : ce sont des décisions
d'architecture, pas des correctifs. Ce lot les **tranche** — cinq ADR — et en
**coud une partie**.

> ⚠️ **CORRECTION DE CETTE ENTRÉE PAR LA RECETTE.** Elle a d'abord annoncé
> « aucune implémentation », « il n'écrit aucune logique et aucune garde »,
> « 838 verts » et « aucun test ajouté, supprimé ni modifié ». Les quatre
> énoncés sont **contredits par le diff qu'ils décrivent**, et l'épreuve
> adverse les a mesurés : **douze** fichiers de gardes créés (onze par les
> constructeurs, un par la Recette), **dix** fichiers TypeScript de production
> neufs, l'ADR 0017 entièrement implémentée (colonne Prisma `externalEffect`,
> entrée dans `CHAMPS_COUVERTS`, cliquet à l'étape 14), et **+139 tests**. Ce qui suit est la mesure corrigée, avec sa date et son
> périmètre — le chiffre nu était périmé le jour même, puisque quatre
> constructeurs écrivaient en parallèle.

### Les cinq décisions

| ADR      | Décision                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| **0014** | Le `sessionId` est **établi par le socle**, jamais accepté du client. Type marqué, fabrique unique. |
| **0015** | `idFields` n'exonère plus rien : **seul le schéma referme** un champ d'entrée.                      |
| **0016** | L'outil **déclare** ses champs de gouvernance ; union avec le nom, jamais soustraction.             |
| **0017** | `outcome` ne gagne **aucune** valeur ; `externalEffect` devient une colonne de l'empreinte chaînée. |
| **0018** | Le socle est **mono-instance en v1**, tenu par un verrou au démarrage ET un healthcheck à 503.      |

### Deux corrections de cap par rapport à l'énoncé du lot

- **Le `sessionId` n'est PAS dérivé du `jti`** (ADR 0014). Mesure : le jeton
  d'accès vit **1 h** (§ 19.1), une marque de provenance **4 h**
  (`TTL_MARQUAGE_MS`). Une session dérivée du `jti` s'effacerait trois fois par
  TTL, sur un rafraîchissement que le client conduit tout seul — c'est-à-dire
  qu'elle rendrait au client, par la petite porte, le renouvellement qu'on lui
  retire. La session suit **l'octroi**, et `ops_token` gagne la colonne.
- **`outcome` ne gagne aucune valeur** (ADR 0017). L'arbitrage annoncé — « quelle
  valeur ajouter, sachant qu'elle rompt le format » — n'avait pas lieu d'être :
  `OUTCOMES` définit **déjà** `erreur` comme « incompactable
  (`result_too_large`) ». C'est la dérivation qui violait la définition écrite. Le
  champ ajouté est ailleurs, et il répond à une autre question : **ce qui est
  sorti**, pas ce qui est revenu.

### Ce qui est posé, et ce qui est ÉCRIT

**Posé** — `ChampsDeGouvernanceDeclares` et `AUCUN_CHAMP_DE_GOUVERNANCE`
(`core/adapter-kit/types.ts`) · `PorteurDEffetExterieur` et
`EFFET_EXTERIEUR_NON_SURVENU` (`core/audit/vocabulaire.ts`) ·
`SignalEffetExterieur` et `AffineursDAppel` (`core/audit/journal.ts`).

**Écrit, et non seulement déclaré** — `core/identite/` (fabrique de sessions,
forme du § 31, liste des frappeurs) · `core/chaine/identite.ts` ·
`core/adapter-kit/champs-declares.ts` (fermeture d'un champ, cumul de
gouvernance) · `ops/codes-hors-tableau.ts` · `ops/alertes.ts` ·
`ops/mono-instance.ts` · la colonne Prisma `OpsAudit.externalEffect`, son entrée
dans `CHAMPS_COUVERTS` et le cliquet de l'étape 14. `core/instance/verrou.ts`,
lui, ne porte **que des déclarations** : l'arbitre `deciderDemarrageMonoInstance`
que sa prose nomme **n'existe pas encore** — la moitié « constater » de l'ADR
0018 est écrite, la moitié « empêcher » ne l'est pas, et un `it.fails` le
mesure.

Les champs obligatoires sont posés **à côté** des types qu'ils rejoindront, et
non fusionnés : les fusionner aurait fait partir le lot rouge, et le premier
réflexe aurait été de les rendre optionnels — c'est-à-dire la forme sous laquelle
une décision redevient un oubli.

### Ce que la RECETTE a fait, et ce qu'elle n'a pas fait

**Ce qu'elle a fait.**

- **`scope_insufficient` est BRANCHÉ.** `APPEL_STEPS[5].refus` le porte, et les
  **quatre branches de refus** de `core/chaine/etape-05-scopes.ts` le rendent —
  mesuré en faisant refuser l'étape quatre fois et en LISANT le code rendu, pas
  en relisant le tableau. Le module de l'étape n'a pas bougé d'une ligne :
  `refuse()` LIT le code dans l'ancrage. Le `403` du § 11 est inchangé.
  L'`it.fails` d'`ops/codes-hors-tableau.spec.ts` a **basculé en `it()`** — ni
  supprimé, ni affaibli : c'est le signe du progrès. Le canal
  `enAttenteDeBranchement` est désormais **vide** pour les deux écarts assumés.
- **Trois gardes fermées par ce lot ont été ÉPROUVÉES par un témoin posé dans
  le code RÉEL, puis restaurées** (empreintes md5 confrontées avant/après) —
  voir le tableau ci-dessous. Les trois ont rougi.
- **Trois documents comptaient « seize » champs couverts ; l'empreinte en
  compte dix-sept** depuis que l'ADR 0017 y a fait entrer `externalEffect`.
  Corrigés — et surtout, `core/audit/prose-de-l-empreinte.spec.ts` **confronte
  désormais la prose à `CHAMPS_COUVERTS.length`** : le dix-huitième champ fera
  rougir les trois phrases le jour même. Aucune garde ne lisait ces chiffres,
  et c'est exactement pour cela qu'ils avaient dérivé.

**Ce qu'elle n'a pas fait, et pourquoi.** La **couture** des ADR 0015 et 0016
dans `core/chaine` reste **ouverte** : `analyserArgumentsDuSchema()` porte
toujours son paramètre `idFields` et son `identifiants.has(nom) continue`, et
elle n'a toujours **aucun** paramètre pour recevoir `governanceFields`. Les deux
ADR ont atterri côté **manifeste et registre** — la déclaration est confrontée
au schéma, son absence d'effet est **dite** — et pas côté **décision**. Ce sont
des modifications de signature dont les ADR nomment l'ordre et les
conséquences ; elles appartiennent aux constructeurs ② et ③, et les
`it.fails` de `core/epreuve/lot1c-la-couture-manquante.temoin.spec.ts` et de
`core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts` les portent nommément.

### Les trois témoins de la Recette

| Garde éprouvée                  | Témoin posé dans le code réel                                             | Ce qui a rougi                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Souveraineté du `sessionId`     | `sessionDuJetonRelu()` frappe une session à la volée au lieu de la relire | 3 tests d'`identite.spec.ts`, dont G1 : « le rafraîchissement ne blanchit plus » → `autorise`  |
| Étiquetage `idFields`           | la boucle d'annonce d'`enregistrer.ts` ne pousse plus rien                | `registry/champs-declares.temoin.spec.ts` : « 0 ligne(s) » au lieu de 1, admission muette      |
| Cumul des champs de gouvernance | `cumulerChampsDeGouvernance()` remplace au lieu d'unir                    | 7 tests sur 3 fichiers ; `perdus : 11` annoncé, les 11 champs retenus par le nom disparaissent |

### Mesures de fin de lot — 2026-08-31, après la Recette

| Gate                   | Résultat                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`       | vert                                                             |
| `pnpm lint`            | vert                                                             |
| `pnpm format:check`    | vert **sur tout le dépôt**                                       |
| `pnpm prisma:validate` | vert (URL stub `stub.invalid`)                                   |
| `pnpm test`            | **977 verts, 17 `it.fails`, 1 `.todo`, 0 rouge** (838 au lot 1b) |

**76 fichiers de gardes, et aucun sans compte annoncé** — mesuré deux fois, et
les deux mesures sont écrites parce qu'elles ne disent pas la même chose : `0`
fichier sans aucune annonce `console.*`, et `0` fichier dont les annonces ne
porteraient **aucun nombre**. La seconde est la vraie : une annonce sans chiffre
est une couleur.

**11 étapes applicables au JSON-RPC, 11 revendiquées par un module propriétaire,
0 orpheline** ; **5** de ces modules vivent dans `core/chaine` et **existent sur
le disque**, 0 fantôme ; `etapesNonImplementees()` rend **0**.

⚠️ **LA FORMULE « 14 ÉTAPES AVEC UN MODULE PROPRIÉTAIRE CHACUNE » N'EST LA
MESURE DE RIEN**, et elle circule. Le registre porte **15** entrées (les 14 du
§ 11, plus l'étape 0 du § 23) ; **4** d'entre elles sont « HTTP seul » et
attendent `core/transport/`, qui n'existe pas ; **5** ont un module livré. Le
lot 1b écrivait la chose exactement — « les quatorze étapes ont un
PROPRIÉTAIRE, et les cinq de `core/chaine` sont IMPLÉMENTÉES » — et c'est la
reprise abrégée qui a transformé un périmètre d'observation en garantie.

⚠️ **LES 17 `it.fails` SE LISENT PAR LEUR LISTE, JAMAIS PAR LEUR NOMBRE.** Deux
`it.fails` peuvent très bien être deux autres : celui de la Recette a basculé
(18 → 17) pendant que d'autres arrivaient. Chacun porte l'attente d'un défaut
**nommé et encore ouvert** — couture des ADR 0015/0016, resserrement du type
`SessionId` en aval, `dependentSchemas` absent du parcours de fermeture,
`idempotencyKey` hors schéma, section critique de `JournalMemoire`, arbitre du
verrou mono-instance, ligne d'intention non armée, `tool` brut perdant sa ligne
de journal.

---

## Lot 1b, seconde moitié — l'orchestrateur et les quatorze étapes — 2026-08-31

La première moitié (ci-dessous) avait **posé les interfaces** des cinq étapes du
§ 11 sans propriétaire, et laissé l'orchestrateur sans corps. Conséquence
mesurée, non supposée : chaque appelant devait réécrire à la main deux gardes de
sécurité — l'étape 5 (scopes) et l'étape 11 (provenance). Cette moitié-ci les
**écrit**, les câble dans un ordre qui appartient à quelqu'un, et **referme dix-sept
défauts que ses propres témoins adverses ont trouvés.**

### Ce qui est construit

| Module / fichier                     | Ce qu'il porte                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `core/chaine/etape-05-scopes.ts`     | § 19.2 — le scope exigé par `effect`, en lecture stricte (aucune implication entre scopes).              |
| `core/chaine/etape-06-outil.ts`      | § 14 corr. 3 — l'outil existe, il est activé, et son épinglage n'a pas divergé.                          |
| `core/chaine/etape-09-curseur.ts`    | § 13.1 — curseur signé HMAC, `filtersHash`, refus qui dit de repartir de la première page.               |
| `core/chaine/etape-11-provenance.ts` | § 20 — la garde d'exfiltration : index en mémoire, borné en durée et en taille, quatre branches.         |
| `core/chaine/etape-14-execution.ts`  | § 13.2 / 13.3 / 18 — exécution, masquage, cascade de compaction, enveloppe bâtie depuis un littéral.     |
| `core/chaine/orchestrateur.ts`       | **L'ORDRE.** Étape 0, puis 5 à 14. Invariant de sortie tenu par le TYPE DE RETOUR, pas par une consigne. |
| `core/chaine/modules.ts`             | La SEULE table qui dise quel fichier exécute quelle étape. Les deux registres la LISENT.                 |

### Ce que la recette a refermé

Dix-sept défauts, tous trouvés par un témoin exécuté, tous laissant derrière eux
une garde qui rougit sur ce témoin. **Aucun test n'a été supprimé pour obtenir du
vert** : trente-six témoins adverses sont passés de `it.fails` à `it()`, la
plupart sans qu'une ligne de leur corps ne change — parce qu'ils portaient déjà
l'attente du CDC, jamais la valeur fausse. Le détail de ceux dont une assertion a
bougé, et pourquoi, est dans `docs/ETAT.md` § 8.4.

**Bloquants**

- **La politique était FAIL-OPEN sur tout niveau hors énumération.**
  `deciderEtape10` testait `brouillon`, puis `confirmé` : toute autre valeur
  tombait dans la branche PERMISSIVE et valait `libre`. Six formes de corruption
  ordinaires — un espace de fin, une casse changée, un octet nul, une colonne
  vide, une valeur d'une autre énumération, un accent perdu à l'import —
  faisaient **toutes** partir un `send` sans confirmation. Le § 20 dit l'inverse :
  `brouillon` est le niveau de repli « en cas de panne, CORRUPTION ou
  redémarrage ». Le repli est posé, et le message sépare « la politique refuse »
  de « la politique est illisible » : les deux ne se réparent pas du même geste.
- **L'orchestrateur ne confrontait jamais le niveau rendu par le port à
  `POLICY_LEVELS`.** Mesuré sur la chaîne complète : effet parti, **et pas même
  une ligne d'`ops_audit`** — un `policyLevel` hors énumération étant refusé par
  la garde du § 31, après coup. Le même fichier fail-closait pourtant déjà,
  explicitement, sur un TRANSPORT inconnu : l'asymétrie était le défaut.
- **Un adaptateur pouvait faire perdre la ligne d'audit d'un appel dont l'effet
  était déjà parti.** `recordIds` traversait tout le socle sans normalisation
  jusqu'à la garde du § 31, qui refusait la ligne — hors du `try` de
  `journaliser`, donc sans même l'habillage. Répétable, à chaque appel, sans
  aucune panne d'infrastructure : l'objectif **O6 était faux** pour tout appel que
  cet adaptateur servait. La normalisation est posée à l'étape 14, et elle
  **dérive** sa forme et ses deux plafonds de `core/audit/contenu.ts`.
- **Le contrôle 7 du § 09 était aveugle aux propriétés déclarées hors de
  `properties`.** Le même nom réservé passait ou non selon l'endroit du schéma où
  on l'écrivait. Pire : `analyserFermeture` déclarait `ferme: true` — net, positif
  et faux — sur un schéma acceptant n'importe quelle clé.
- **La cinquième règle du § 20 était désarmée d'un mot.** `estTexteLibre()`
  traitait la PRÉSENCE de `format` ou de `pattern` comme une fermeture de
  l'ensemble des valeurs. Or `format` est une ANNOTATION en draft 2020-12, et un
  `pattern` peut être vacant. Cinq formes de texte libre parfaitement ordinaires
  rendaient `porteUnArgumentLibre: false`, donc ne déclenchaient RIEN.

**Majeurs**

- Les deux registres d'étapes se **contredisaient sur les cinq**, et rien ne les
  confrontait : le reste-à-faire renvoyait vers cinq chemins fantômes, et aurait
  envoyé le constructeur suivant écrire un fichier déjà écrit sous un autre nom.
- `core/chaine/index.ts` n'exportait **aucun** des cinq exécutants : l'appelant
  n'avait pas de quoi nourrir `DependancesOrchestrateur` — le défaut d'origine du
  lot, intact.
- Un niveau permissif calculé sur **zéro ligne examinée** ouvrait quand même. Le
  compte était publié par la trace, et jamais confronté.
- Les trois familles accentuées du § 20 ne mordaient qu'en NFC : un nom reçu en
  forme décomposée s'affiche à l'identique et ne se compare pas.
- `FORME_SOURCE` admettait les phrases écrites en slug — 2 048 octets de budget
  d'injection dans `meta`. La borne de PHRASE existait déjà à un module de là.
- La charge de l'adaptateur n'était **typée qu'à la compilation** : une chaîne à
  la place d'un tableau était itérée caractère par caractère, et l'enveloppe
  inventait des canaux.
- Cinq canaux en échec aux noms mal formés **fondaient en une seule entrée**.

**Mineurs**

- Le bloc `finally` affirmait que « les deux clôtures ont lieu quoi qu'il
  arrive » ; la première n'était pas protégée, et la seconde est celle qui compte.
- À scopes vides, le numéro d'étape refusante distinguait un outil qui existe d'un
  outil qui n'existe pas — un oracle d'énumération du catalogue.
- Deux fichiers de gardes du lot 1 n'annonçaient **aucun compte** : un vert y
  était indiscernable d'un vert obtenu sur zéro élément mesuré.

### Ce qui reste, et qui attend une décision de Will

- **`ops_audit` nie une exécution qui a eu lieu.** Un `send` PARTI dont la réponse
  dépasse le plafond est journalisé « refusé / non-exécuté ». La ligne existe,
  l'invariant tient — elle est FAUSSE, et le § 24 rangera cet envoi parmi les
  appels qui n'ont rien fait. Arbitrage **ADR 0002** : `outcome` entre dans
  l'empreinte chaînée. Témoin sous `it.fails`.
- **`idFields` est déclaré par l'adaptateur et confronté à rien.** Le § 20 pose
  que « l'étiquetage se décide côté socle, jamais sur déclaration » ; ici une
  déclaration décide. Deux voies, aucune sans coût, et la règle appartient au
  registre — pas à l'étape 11.
- **Le `sessionId` n'est ni contraint, ni authentifié, ni lié au jeton.** Toute la
  garde du § 20 s'y ancre. Le contrat manquant doit être écrit AVANT tout
  transport.
- **L'enveloppe n'a aucun champ pour dire ce qu'elle a perdu** — sources écartées
  par le plafond, valeur d'agrégat absente. Le § 13.2 énumère treize champs et
  n'en prévoit aucun ; en ajouter un est une décision de CDC.
- Le § 15 sans code pour un scope insuffisant, le § 24 sans ligne pour l'écart
  d'épinglage, l'index de provenance **local au processus**, et cinq bornes de
  durée à revoir au lot 6.

Le détail complet, avec les mesures et leurs bornes, est dans `docs/ETAT.md`.

### Mesures

`pnpm typecheck` vert · `pnpm lint` vert · `pnpm format:check` vert **sur tout le
dépôt** · **838 tests verts, 2 `it.fails`, 1 `.todo`, 0 rouge** (738 à la
première moitié, 511 au lot 1). **64 fichiers de gardes, et plus aucun sans
compte annoncé.** Quatre gardes ont été éprouvées par un témoin fabriqué posé
dans le code RÉEL, puis restaurées — chemin de module fantôme, garde fail-closed
de politique neutralisée, `format` redevenu une fermeture, `continue-on-error`
dans la vraie CI : les quatre ont rougi.

**Les quatorze étapes du § 11 ont désormais un propriétaire, et les cinq de
`core/chaine` sont IMPLÉMENTÉES** — `etapesNonImplementees()` rend zéro, et deux
gardes l'adossent à autre chose qu'une déclaration : le fichier nommé par le
registre doit EXISTER sur le disque, et le résolveur doit RENDRE une fonction.

---

## Lot 1b, première moitié — les arbitrages et la chaîne d'appel — 2026-08-31

> ⚠️ **La section « ce qui reste » de cette entrée est PÉRIMÉE** : les cinq étapes
> y étaient déclarées et non implémentées, et l'orchestrateur n'avait pas de
> corps. Les deux sont faits — voir l'entrée ci-dessus. Le reste de l'entrée
> (décisions, ADR, ruptures de format) tient inchangé.

Aucun module métier, aucune ligne de production nouvelle. Ce lot **tranche
quatre décisions** que le lot 1 avait refusé de prendre seul, et **pose les
interfaces** des cinq étapes du § 11 qui n'avaient aucun propriétaire.

### Les quatre décisions, avec leur ADR

| ADR      | Décision                                                                            | Ce qu'elle ferme                                                     |
| -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **0002** | `ops_audit` en ajout seul (rôle PostgreSQL) **et** `selfHash` scellé par HMAC.      | Le journal se recalculait : `valide = true` sur un journal amputé.   |
| **0003** | Le registre exige un `inputSchema` FERMÉ, dans **deux** dialectes.                  | Un manifeste PHP portant `peutVoirAppels` était admis sans un mot.   |
| **0004** | `profilesVersion` et `profilesSha` entrent dans le manifeste.                       | `empreinteProfils()` était une garde branchée nulle part.            |
| **0005** | `vault_locked` entre dans `ERROR_CODES` ; le refus de coffre devient l'**étape 0**. | `stepDenied` restait nul : le refus était indiscernable d'une panne. |

### Ce qui est construit

| Module / fichier                            | Ce qu'il porte                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core/chaine/etapes.ts`                     | Les cinq étapes orphelines — 5, 6, 9, 11, 14 — **déclarées** : ancrage dérivé, verdict typé, ports.      |
| `core/chaine/orchestrateur.ts`              | L'ossature : signature, contexte d'appel, invariant de sortie tenu **par le type de retour**. Elle LÈVE. |
| `core/sceau/`                               | Le scellement HMAC de la chaîne d'`ops_audit`, hors de `core/audit` pour ne désarmer aucune garde.       |
| `core/adapter-kit/fermeture.ts`             | Une seule définition de « schéma fermé », deux appelants : le build et l'admission.                      |
| `core/audit/droits-sql.ts`                  | La lecture du script de droits — elle prouve ce que le script DIT, pas ce que le cluster applique.       |
| `prisma/sql/0001-ops-audit-append-only.sql` | Deux rôles de groupe, `NOLOGIN` : l'écriture n'a pas `DELETE`, la purge n'a pas `INSERT`.                |

### Ce que ces changements CASSENT — et pourquoi maintenant

Deux d'entre eux changent un format, et **aucun des deux n'aurait pu attendre** :

- le `selfHash` passe d'un SHA nu à un HMAC : **toutes** les empreintes du
  journal changent. Aucune base ne tourne, aucune ligne n'existe ;
- le manifeste passe de sept à neuf clés : **toutes** les empreintes épinglées
  changent. `adapters.lock.json` n'existe qu'en exemple.

Après le premier chaînage et le premier épinglage, l'un aurait exigé une clôture
de rupture, l'autre de revalider à la main chaque `manifestSha` de chaque dépôt
tiers.

### Ce qui reste, et qui est mesuré

- **Les cinq étapes sont DÉCLARÉES, pas implémentées.** `ETAPES_CHAINE` porte un
  `statut` par étape, et `etapes.spec.ts` rougit sur une entrée qui se dirait
  implémentée sans porter de fonction. Le reste-à-faire est calculé, pas écrit.
- **L'orchestrateur n'a pas de corps** et lève `ErreurOrchestrateurNonImplemente`
  plutôt que de rendre un verdict : rendre « autorisé » servirait un appel
  qu'aucune garde n'a examiné ; rendre « refusé » écrirait dans `ops_audit` un
  refus que personne n'a prononcé.
- **Trois colonnes manquantes à `ops_audit`** — version de clé de scellement,
  population d'`argHash`, état de coffre — entreraient **toutes trois** dans
  l'empreinte chaînée du § 12. Elles doivent être décidées ENSEMBLE, et avant le
  premier chaînage réel. Voir ADR 0002 § « ce qui reste ouvert ».

### Correctifs et chaîne d'intégration (même lot)

| Ce qui est posé                                | Ce que ça ferme                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `core/audit/roles.ts` + `roles.spec.ts`        | La moitié CODE de l'ADR 0002 : qui écrit, qui supprime. Rien, côté socle, ne refusait une purge qui insère.                             |
| Grammaire de `scope` **tranchée**              | `adapterId` ne porte AUCUN point. `scopeCouvre()` passe par `scopeDomine()` : une seule dérivation (ETAT § 4.4).                        |
| Refus `id_innommable_par_un_scope` au registre | Un manifeste étranger pouvait s'enregistrer sous `zoho.mail` : sa politique portait sur l'adaptateur `zoho`.                            |
| `ops_audit.argHashValidated`                   | Les deux populations d'`argHash` (ETAT § 4.6). ⚠️ Elle ENTRE dans l'empreinte chaînée (`CHAMPS_COUVERTS`, dix-sept champs aujourd'hui). |
| `.github/workflows/ci.yml` + `ops/`            | La CI n'existait pas (ETAT § 3.3). Aucune `continue-on-error`, et une garde LIT le YAML pour l'exiger.                                  |
| `core/limits/memoire.ts`                       | Quatre copies divergentes des dépôts en mémoire, dans quatre fichiers de gardes.                                                        |

**La CI sait rougir, et c'est mesuré.** `ops/temoin-ci.ts` fabrique un défaut
par gate, exige que chacune échoue, retire le défaut et exige que chacune
reverdisse — sans la seconde moitié, une gate cassée en permanence passerait
pour une gate qui mord. **Un secret absent FAIT ÉCHOUER l'étape** (`ops/secrets.ts`,
liste vide aujourd'hui, mécanique en service).

⚠️ **Une seule des trois colonnes annoncées ci-dessus a été posée.** La version
de clé de scellement et l'état de coffre restent ouverts, et l'empreinte
chaînée changera encore si on les ajoute. Sans coût tant qu'aucune base ne
tourne — voir ADR 0002 § 4.1, mis à jour.

### Mesures

`pnpm typecheck` vert · `pnpm lint` vert · `pnpm format:check` vert **sur tout
le dépôt** · `pnpm prisma:validate` vert (URL stub) · **738 tests verts,
1 `.todo`, 0 rouge** (511 au lot 1, 570 au premier jet du lot 1b).
Le `.todo` restant est celui de la racine de composition, inchangé.
`ops/temoin-ci.ts` : 4 gates éprouvées, 0 anomalie.

---

## Lot 1 — cœur du socle — 2026-08-30

Premier lot. Le dépôt passe de vide à un socle qui compile, se garde et se
mesure. **Aucun secret réel, aucun appel réseau sortant, aucun déploiement** :
les portes du lot 0a (Cloudflare Access, rotation du jeton Coolify) ne sont pas
posées, c'est pourquoi rien n'est exposé.

### Ce qui est construit

| Module             | Ce qu'il porte                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `core/types`       | Le vocabulaire fermé du CDC : `Effect`, `DataClass`, `PolicyLevel`, `OpsScope`, `ErrorCode`, `APPEL_STEPS`. |
| `core/vault`       | Coffre AES-GCM, AAD = `name‖version`, trois états, rotation reprenable, plafond d'amorçage (§ 27).          |
| `core/policy`      | Niveau appliqué, effet, confirmation liée à l'`argHash`, asymétrie resserrer/desserrer, TOTP (§ 20).        |
| `core/limits`      | Étapes 8, 12, 13 : schéma, quota, idempotence. `argHash` HMAC clé (§ 12, règle 2).                          |
| `core/audit`       | Journal chaîné, invariant de sortie, purge ancrée, garde de contenu (§ 11, § 31).                           |
| `core/profiles`    | Énumération fermée des profils, budget du § 14 en octets UTF-8, projection servie.                          |
| `core/registry`    | Admission d'un manifeste reçu, verrou d'épinglage, production des lignes `ops_tool` (§ 09).                 |
| `core/adapter-kit` | Contrat d'adaptateur, manifeste, harnais de conformité en neuf contrôles.                                   |

### Défauts fermés pendant la recette

Chacun a été trouvé par un témoin exécuté, et chacun laisse derrière lui une
garde qui rougit sur ce témoin.

**Bloquants**

- **Le coffre s'ouvrait sur une clé de trente-deux octets à zéro.** Elle
  provisionnait, le socle s'annonçait `ouvert` / `vaultLocked: false`, nominal —
  et comme `keyId` est dérivé du matériau, il était publiquement calculable :
  le sceau se déchiffrait avec la clé évidente. `motifCleInvalide` refuse
  désormais ce matériau. _(`core/vault/chiffrement.ts`)_
- **Le plafond d'amorçage du § 27 était un lire-puis-écrire.** Six amorçages
  concurrents passaient tous et le compteur doublait le mur, sur un plafond dont
  chaque dépassement est irrécupérable. La condition voyage maintenant DANS
  l'écriture (`incrementerBootstrapCountSousPlafond`). _(`core/vault/`)_
- **Le chemin LIBRE prolongeait un desserrage sans borne.** À niveau égal, le
  tri resserrage/desserrage ne voyait rien : depuis `mcp`, sans second facteur
  ni `ops:policy`, on repoussait la fermeture de 12 h à un siècle — ou on
  déposait sous une ligne large et brève une ligne étroite et éternelle que rien
  ne remplaçait. Règle posée : **un resserrage ne recule jamais l'instant où la
  surface se referme.** _(`core/policy/desserrage.ts`)_
- **Le filtre de commentaires effaçait du CODE.** Deux chaînes anodines — ou
  deux motifs de globbing — encadrant un `process.env.ZOHO_SECRET` écrit nu
  suffisaient à aveugler le contrôle 2 du § 09, la seule garde de sécurité du
  harnais. Le filtre est devenu un balayage à états ; **et le contrôle 2 lit
  désormais le source BRUT**, pour ne dépendre d'aucun filtre.
  _(`core/adapter-kit/`)_
- **L'empreinte et la forme lisaient deux documents différents.** Un `toJSON`
  hérité rendait un manifeste bénin à `JSON.stringify` pendant que les
  propriétés propres portaient le manifeste hostile : le refus n° 1 du § 09 —
  celui qui protège de tous les autres — était hors service. Refusé à la
  frontière. _(`core/adapter-kit/json.ts`)_

**Majeurs**

- **La cause première disparaissait en double panne.** Corps qui lève + journal
  indisponible : le `throw erreur` n'était jamais atteint. Un `AggregateError`
  porte maintenant les deux ; aucune ne masque l'autre. _(`core/audit/journal.ts`)_
- **Un desserrage annoncé en panne restait écrit en base.** La relecture
  post-écriture rouvrait une fenêtre. `niveauApres` est dérivé de la simulation.
- **La protection 4 du § 20 n'était câblée nulle part.** `demarrerPolitique()`
  existe désormais et referme un desserrage en cours au redémarrage.
- **`ops_tool.bytes` était dérivé deux fois, différemment** (~38 % d'écart entre
  le registre et le budget). Une seule fonction, deux appelants.
- **`ops.audit.purge` n'était réservé par rien.** Un adaptateur pouvait rendre
  la vérification du journal rouge en permanence. Refusé à l'enregistrement, en
  **important** la constante.
- **Deux `argHash` pour un seul appel.** Le journal empreignait la charge brute,
  le jeton du § 20 la valeur validée : dès qu'un schéma porte un `.default()`,
  les deux désignaient des appels différents. L'en-tête est affiné après
  l'étape 8.
- **`appliquerLimites` soudait 8-12-13 sans couture pour 9, 10 et 11.** La
  composition naturelle brûlait le quota d'un appel que la politique refusait.
  `entreSchemaEtQuota` est **obligatoire** : le compilateur ne laisse plus
  l'oublier.
- **Deux ports déclarés et fournis par personne.** `ArgHasher` porte la forme de
  son fournisseur ; `Coffre.lireCleArgHash()` implémente `CoffreArgHash`.
- **`recordIds` acceptait une adresse e-mail et une phrase à tirets.**

**Mineurs**

- `ttlMs` d'idempotence non borné : un `ttlMs` non fini figeait la clé à jamais.
- `MODES_IDEMPOTENCE` recopiait `IDEMPOTENCIES` : une seule déclaration.
- `ETAPE_POLITIQUE` était écrit en dur : dérivé d'`APPEL_STEPS`.
- `enregistrer.spec.ts` recopiait l'énumération des profils : dérivée.
- Le libellé du contrôle 3 promettait plus que sa mesure.
- `ops_tool` a reçu `retiredAt` / `sunsetAt` (§ 13.4), sans quoi
  `retireDeLaListe` vaudrait `false` pour toujours.
- Scripts `format` / `format:check` ajoutés ; tout le dépôt reformaté.

### Ce qui reste ouvert

Voir **`docs/ETAT.md`** — deux gardes sont marquées `.todo` avec leur motif, et
sept points attendent un arbitrage de Will.

### Mesures de fin de lot

| Gate                | Résultat                      |
| ------------------- | ----------------------------- |
| `pnpm typecheck`    | vert                          |
| `pnpm lint`         | vert                          |
| `pnpm format:check` | vert                          |
| `pnpm test`         | 511 verts, 2 `.todo`, 0 rouge |
