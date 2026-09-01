# État du socle `axion-ops` — fin du lot 1

**Date : 2026-08-30.** Établi par la Recette, après quinze passes de
construction, de croisement et d'épreuve.

> **Rien n'est déployé, rien n'est exposé, aucun secret réel n'existe dans ce
> dépôt.** Les portes du lot 0a — Cloudflare Access devant la console, rotation
> du jeton Coolify — ne sont pas posées. C'est la raison d'être de cette
> retenue, pas une négligence.

> ### 🟢 2026-09-01 — LOT 3, RECETTE : LE SOCLE SERT DEPUIS SON PROPRE PROCESSUS, ET UNE GARDE LE REJOUE
>
> **Le jalon du lot 2 est franchi, et il est mesuré deux fois.**
>
> **① Lancement réel**, `npx tsx ops/index.ts --provisionner-le-coffre-local`,
> réglages factices sur `stub.invalid`, aucun réseau, aucune base :
>
> ```
> [chaîne] 28 champ(s) de `DependancesOrchestrateur` composé(s) · 0 outil(s) au catalogue · fabrique : posée
> [démarrage] 7 étage(s) confronté(s), 7 franchi(s) · sert : true · coffre : « ouvert » ·
>             transports MONTÉS : [stdio] · colonnes FRAPPÉES : 1 · 0 empêchement(s)
> {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}
> {"jsonrpc":"2.0","id":2,"result":{"isError":true,"step":6,"code":"tool_disabled", …}}
> CODE=0
> ```
>
> Le `tools/call` est ce qui distingue « le transport répond » de « la chaîne est
> traversée » : `tools/list` ne touche pas le noyau, le refus à l'**étape 6** si.
>
> **② Une garde le rejoue**, et c'est elle qui manquait :
> `ops/racine-en-service.temoin.spec.ts` appelle `demarrerLeProcessus` — jamais
> `composerLeNoyau`, jamais un `PortsDuService` fabriqué — sur des flux en
> mémoire, et lit ce que le socle a servi.
>
> #### 🔴 CE QUE LA RECETTE A TROUVÉ, ET FERMÉ — deux mutations qui survivaient
>
> | #   | Défaut                                                                                     | Mutation                                                            | Avant                                            | Après                                                |
> | --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
> | 1   | La ligne qui **compose** la chaîne n'était traversée par aucun test                        | `ops/index.ts` · `noyau: noyau.fabrique,` → `noyau: null,`          | **SURVIVANTE** — 132 fichiers verts, 1 489 tests | **TUÉE** — 1 fichier rouge                           |
> | 2   | Le seuil de marge était écrit **deux fois**, et l'écriture qui mordait était la non gardée | `marge-des-gardes.config.ts` · `> seuilMs` → `> PLAFOND_DE_TEST_MS` | **SURVIVANTE** — 0 fichier rouge                 | **structurellement impossible** : une seule écriture |
>
> Le défaut 2 mérite d'être lu en entier : la condition mutée ne pouvait **plus
> jamais tirer**, puisque vitest tue le test AU plafond avant que l'`afterEach`
> ne s'exécute. L'alarme devenait morte, en silence. `alerteDeDepassement` porte
> désormais la décision, l'amorce ne fait que la relayer, et un troisième témoin
> **lit le fichier d'amorce sur disque** et exige 1 appel au verdict et
> 0 comparaison propre — sans quoi l'amorce pourrait reprendre sa comparaison
> demain sans que rien ne rougisse. Les deux mutations successeurs ont été
> rejouées : toutes deux **TUÉES**.
>
> #### 🔴 CONSTAT N° 1 — LA SUITE N'ÉTAIT PAS REPRODUCTIBLE, ET LA CAUSE EST NOMMÉE
>
> Cinq exécutions vertes, puis une rouge, sur un **arbre inchangé** :
> `Test Files 2 failed | 131 passed (133)`. Les deux fichiers rouges étaient
> ceux qui balaient le dépôt, et le message était celui de l'ADR 0040 :
> `« annonce les comptes… » a pris 15 663 ms, au-delà de 15 000 ms`.
>
> **L'alarme faisait son travail ; c'est la garde qui coûtait trop.**
> `sansProse` et `sansLiaisons` étaient appelées au cœur d'une double boucle de
> 89 entrées × 134 modules — près de **12 000 passages** de quatre expressions
> régulières globales sur des sources entières, pour un résultat qui ne dépend
> **que du fichier**.
>
> **La contention était réelle et identifiée** : une seconde session travaillait
> sur un autre dépôt de la même machine ; les durées de suite passaient de 25 s
> à 67 s. Le facteur deux que l'ADR 0040 s'accorde à 50 % du plafond ne couvrait
> pas un facteur mesuré à ~5,5.
>
> **Contre-épreuve avant de corriger** : avec l'armement d'origine restauré et la
> même contention, la suite rougissait à l'identique — 3 fichiers, 7 tests,
> 12 messages ADR 0040 par exécution. **Le défaut n'était pas celui du lot ; il
> était déjà là.**
>
> | Mesure                                                            | Avant                      | Après                  |
> | ----------------------------------------------------------------- | -------------------------- | ---------------------- |
> | Pire garde                                                        | 4 641 ms (15 % du plafond) | **1 337 ms (4 %)**     |
> | `core/coutures/registre.spec.ts`                                  | 10 081 ms                  | **~1 400 ms**          |
> | `lot1d-le-registre-sans-sa-garde`                                 | 23 698 ms                  | **~1 400 ms**          |
> | Temps de test de la suite                                         | 56,7 s                     | **16,0 s**             |
> | 5 exécutions séquentielles                                        | 5 vertes / 1 rouge à la 6ᵉ | **5 vertes sur 5**     |
> | **3 suites concurrentes** (plus dur que la condition qui cassait) | non mesuré                 | **3 vertes, 0 alerte** |
>
> **Et ce n'est pas un assouplissement** : basculer l'entrée `orchestrerAppel` de
> `cousue` à `à-coudre` fait toujours rougir les **trois** gardes de désaccord,
> dans les **deux** fichiers — en 4 à 37 ms au lieu de plusieurs secondes.
>
> #### CE QUE LA RECETTE A VÉRIFIÉ SANS RIEN Y TOUCHER
>
> Six mutations rejouées au hasard par le protocole complet (empreinte, ancre
> unique, suite **complète**, restauration, empreinte reconfrontée) :
> **m15**, **m19**, **R1**, **R6** — TUÉES, comme annoncé.
> **A7** et **B16** — SURVIVANTES, ce sont les deux ci-dessus.
>
> #### 🔴 CE QUI RESTE OUVERT — mesuré par la recette, pas recopié
>
> - **ADR 0037, décisions 2 et 3 : pas atterries.** `PortsDuService` ne porte ni
>   `journalDesRefus` ni `delaiDeReprise` — `grep` sur `ops/**` hors gardes :
>   **0 ligne**. Contre-mesure qui exclut l'erreur de périmètre : les mêmes
>   formes sous `core/transport/**` rendent **27 lignes**. La fente existe au
>   transport, elle manque au service : en production, les refus d'amont
>   n'écrivent rien et tout 429 sort sans `Retry-After`.
> - **ADR 0036, décision 1 : pas atterrie.** L'étape 7 de l'orchestrateur
>   (ligne 1570) ne fait que `if (!estServi(outil, profil))` — aucun comptage
>   contre `PLAFOND_OUTILS_PAR_PROFIL`. `mesurerBudgetProfil` a **0 appelant de
>   production**. Et la réimplémentation que l'ADR ordonnait de supprimer est
>   toujours à `core/__tests__/integration.spec.ts:485` : le dépôt éprouve le
>   sosie de la règle au lieu de la règle. Aucun `it.fails` ne nomme cette dette.
> - **`upstream_unavailable` n'est émis par aucun module de production** — un
>   des treize codes du § 15. Ses deux seules occurrences hors `core/types.ts`
>   sont dans `ops/codes-hors-tableau.ts`, dont l'une décrit ce que ce code
>   aurait **menti**.
> - **Le filet anti-fuite du § 20 ne couvre qu'un transport sur deux.**
>   `verifierAucuneFuite` a **1 appelant de production**,
>   `core/transport/http/transport.ts:390`. Le fil stdio transporte le même
>   jeton de confirmation et n'a aucun équivalent.
> - **`prisma/migrations/` n'existe pas.** Le schéma est _validé_, les dix
>   tables du § 12 ne sont matérialisables par aucun chemin reproductible — et
>   le script d'ajout-seul, qui se déclare « APRÈS `prisma migrate deploy` », n'a
>   rien après quoi s'appliquer.
> - **La prose du registre des coutures n'est confrontée à rien.** Inverser le
>   sens d'un champ `decision` laisse la suite verte : `cousue` mesure le nombre
>   d'**appelants de production** d'un symbole, jamais l'atterrissage de la
>   décision. Le mécanisme est aveugle exactement là où la décision porte sur un
>   symbole déjà cousu — **et les deux entrées que ce lot vient d'écrire sont
>   logées à la même enseigne.**
> - **Les 24 `it.fails` du lot 2 sont toujours 24 : aucun n'a été fermé.** Le
>   compte est passé à **31** parce que sept ont été **ouverts**. Ce sont des
>   dettes nommées, pas des régressions — mais le solde du lot est +7, pas −n.
>
> ### ⚠️ 2026-09-01 — LOT 2, RECETTE : LE SOCLE DÉMARRE, ET IL RÉPOND — MAIS PAS ENCORE DEPUIS SON PROPRE PROCESSUS
>
> Le lot 2 a livré les deux transports, l'émetteur de jetons, la politique
> d'accès chemin par chemin et la racine de composition. **Aucun module de
> production ne montait quoi que ce soit.** Mesuré à l'ouverture de la recette,
> sur les 128 modules émis par `pnpm build` : `creerServeurHttp` 0 appelant,
> `creerTransportHttp` 0, `creerServeurStdio` 0, `brancherSurLesFlux` 0,
> `demarrerLeSocle` 0 — et aucun point d'entrée exécutable dans le dépôt.
>
> **Le manque du lot 1d avait été remonté d'un étage, intact.**
>
> #### Ce que la recette a posé — ADR 0034
>
> | Fichier               | Rôle                                                                |
> | --------------------- | ------------------------------------------------------------------- |
> | `ops/index.ts`        | le point d'entrée du processus ; `bin` + garde `import.meta`/`argv` |
> | `ops/service.ts`      | le montage des transports, et la liste NOMMÉE de ses empêchements   |
> | `ops/service.spec.ts` | la seule garde qui mesure un **octet qui revient** — socket + fil   |
>
> #### CE QUE LE SOCLE FAIT QUAND ON LE LANCE — quatre exécutions réelles
>
> Toutes en local, sur `stub.invalid` (RFC 2606), valeurs factices, aucun appel
> sortant :
>
> | Configuration                                     | Résultat mesuré                                                              |
> | ------------------------------------------------- | ---------------------------------------------------------------------------- |
> | aucune                                            | 4 réglages refusés, **code 1**, aucun verrou pris, aucune socket ouverte     |
> | réglages complets, base factice                   | **étage 2** — coffre absent —, **code 2**, message nommant la commande       |
> | coffre local provisionné, aucune authentification | **étage 3**, **code 3**, « le § 19 pose une règle absolue »                  |
> | tout, coffre local provisionné                    | **7 étages franchis**, healthcheck **200**, `vaultLocked: false`, **code 0** |
>
> #### 🔴 CE QUI RESTE OUVERT, ET C'EST LE CŒUR DU LOT SUIVANT
>
> **La chaîne des quatorze étapes n'est pas composée.** `ops/index.ts` remet
> `noyau: null`, et `monterLeService` COMPTE l'empêchement au lieu de le taire :
> le processus démarre, franchit ses sept étages, calcule son healthcheck — et
> **ne monte AUCUN transport**, parce qu'un transport monté sur un noyau absent
> servirait des appels qu'aucune ligne d'`ops_audit` n'atteste.
>
> Ce qui manque, nommément : un journal SCELLÉ par une clé du coffre (ADR 0002),
> les dépôts de quota et d'idempotence, un catalogue épinglé, le câblage Prisma
> du coffre et de `ops_token`. **Aucun n'existe en dehors des fabriques de
> témoins.** Le montage, lui, est prouvé : `ops/service.spec.ts` monte les deux
> transports sur un noyau RÉEL (`orchestrerAppel`, les cinq étapes, le vrai
> journal chaîné), lie une socket sur `127.0.0.1`, obtient **200** sur un
> `tools/call`, et sert **3 `tools/list` sur le fil stdio avec 0 levée**.
>
> #### Les quatre gardes cassées que la recette a réparées
>
> 1. **G3 (ADR 0014) était ROUGE sur une PHRASE** — le motif de `core/types.ts`
>    nommait la conversion forcée en prose. Le nettoyage vit désormais dans un
>    **seul** symbole partagé, et G3 a gagné le cinquième témoin qui manquait,
>    plus un sixième en sens inverse (une conversion dans une substitution de
>    gabarit est du CODE et doit rester vue).
> 2. **La garde du raccordement de `demarrerPolitique` EXIGEAIT que le défaut
>    subsiste** (`citationsEnProse.length >= 1`) : un cliquet à l'envers, qui
>    aurait rougi le jour de la correction.
> 3. **La garde de l'appelant unique du cliquet** disait « tout le code de
>    production » et ne lisait que `core/` : douze modules livrés de `ops/` hors
>    champ, cinq fichiers non livrés comptés dedans.
> 4. **La garde du critère du lot se fabriquait son propre vert** —
>    `reglagesConfrontes: 5` contre 4 réellement confrontés par le décideur.
>
> #### La mesure, à la fin de la recette
>
> - **Quatre gates vertes** : `typecheck`, `lint`, `format:check`, `test`.
> - **1 418 tests verts, 0 rouge** — contre 1 409 verts et **9 ROUGES** à
>   l'ouverture.
> - **24 `it.fails`** — contre 28 : **quatre dettes fermées**, toutes par le
>   point d'entrée.
> - **Registre des coutures : 52 symboles cousus sur 67 confrontés** (48/65 à
>   l'ouverture), 0 anomalie, 30 ADR couverts.
> - **0 fichier de garde sans compte annoncé, sur 124.**
> - 260 fichiers TypeScript, **130 émis** par `pnpm build`.
>
> #### Les cinq témoins des coutures neuves — posés, rougis, restaurés
>
> `brancherSurLesFlux` débranché · l'étage 3 qui n'appelle plus le décideur du
> § 19 · `monterLeService` qui ignore `appelsDOutilsAcceptes` · `ops/index.ts`
> qui n'appelle plus `monterLeService` · `creerServeurHttp` débranché. **Cinq
> mutilations, cinq rouges, zéro manquée.**

> ### ⚠️ 2026-08-31 — LOT 1d : CE DOCUMENT DATE DE LA FIN DU LOT 1, ET LE LOT 1d L'A DÉPASSÉ
>
> Le **lot 1d** a cousu quatre décisions au chemin de production et posé le
> mécanisme qui rend une décision non cousue VISIBLE. Ce qui suit remplace les
> chiffres de tout ce document ; le reste des paragraphes vaut toujours, sauf
> mention contraire.
>
> | Décision | Ce qui a changé                                                                                          |
> | -------- | -------------------------------------------------------------------------------------------------------- |
> | ADR 0019 | `core/coutures/` — un registre des coutures, **et enfin ses deux gardes** (G1, G2) plus leurs témoins    |
> | ADR 0020 | `idempotencyKey` n'atteint plus l'adaptateur ; le `ctx` n'en porte que l'empreinte                       |
> | ADR 0021 | l'issue d'idempotence se dérive du **cliquet** d'effet extérieur                                         |
> | ADR 0022 | la ligne d'intention a une forme ET un compteur — **deux entrées au registre, les deux encore ouvertes** |
>
> **Les gates, mesurées le 2026-08-31 après la recette** : `pnpm typecheck`
> vert, `pnpm lint` vert, `pnpm format:check` vert **sur tout le dépôt**,
> `pnpm build` vert (**90** modules émis), **1 138 tests verts, 12 `it.fails`,
> 1 `.todo`, 0 rouge** — contre 838 + 2 `it.fails` à la fin du lot 1b.
>
> **Le périmètre, écrit avec la mesure** : **184** fichiers TypeScript dans
> `core/`, `adapters/`, `console/`, `voice/` et `ops/` — **93** de code, **91**
> de gardes — dont **0 fichier de garde sans compte annoncé**. Les dossiers
> `adapters/`, `console/` et `voice/` sont toujours **vides** : c'est le lot 2.
>
> ### LA MESURE DU LOT 1d — combien de décisions sont BRANCHÉES ?
>
> C'est la question que l'épreuve du lot 1c a rendue nécessaire, et à laquelle
> aucune garde ne savait répondre. Elle a maintenant une réponse, produite à
> chaque exécution par `core/coutures/registre.spec.ts` :
>
> - **18 ADR** dans `docs/adr/`, **18 inscrits au registre**, **0 sans entrée**,
>   **0 entrée fantôme** ;
> - **33 entrées** au registre — 18 `cousue`, 9 `à-coudre`, 2 `à-nommer`,
>   4 `hors-code` ;
> - **27 symboles confrontés** au graphe d'appels de **90 modules de
>   production** : **18 ont au moins un appelant**, 9 en ont **zéro et le
>   registre l'exige** ;
> - **11 des 18 ADR** portent au moins une décision appelée par un module de
>   production ;
> - **0 désaccord** entre la prose du registre et le graphe d'appels réel.
>
> ⚠️ **CE QUE CE COMPTE NE DIT PAS.** « Zéro appelant » n'est pas une dette dans
> tous les cas : **le socle n'a pas de racine de composition**. Il n'existe ni
> serveur, ni `main.ts`, ni console — `core/transport/` est un lot à venir.
> `verifierChaine`, `relireLaSanteMonoInstance`, `relireDepuisLeSocle` ont zéro
> appelant **et c'est l'état attendu** ; l'état `à-coudre` dit cela, et la garde
> rougit si l'un d'eux en gagne un sans que le registre le dise. Un appelant est
> par ailleurs une **forme écrite** trouvée dans un source : un appel passé par
> une table de dispatch ou une injection lui échappe, et la mesure est donc un
> **plancher** d'appelants, jamais un plafond.
>
> ⚠️ **UN CAS QUE `à-coudre` NE SAIT TOUJOURS PAS DIRE, ET IL EST COMPTÉ.**
> « Exactement zéro appelant » est une condition qu'un symbole **jamais écrit**
> remplit sans effort. `estLigneDIntention` (ADR 0022) est dans ce cas : il est
> nommé d'avance, il n'existe pas. La garde compte donc les symboles réellement
> **définis** — 26 sur 27 — et tient un cliquet nommé sur celui qui ne l'est pas,
> pour qu'un second ne s'y ajoute pas en silence.
>
> ### CE QUE LES 12 `it.fails` SONT
>
> Un `it.fails` porte l'attente CORRECTE — celle du CDC ou d'un ADR — et il est
> vert TANT QUE le socle ne la tient pas. Ce sont **douze défauts ouverts, datés
> et instrumentés**, pas douze tests qui passent. Le jour où on les ferme, ils
> ROUGISSENT, ce qui force à les relire au lieu de les laisser vieillir : **cinq
> l'ont fait pendant ce lot**, et sont passés en `it()`.
>
> ⚠️ **UN `it.fails` EST VERT DÈS QU'IL ÉCHOUE, POUR N'IMPORTE QUELLE RAISON.**
> C'est pourquoi chacun est apparié à un cliquet ou à un témoin de capacité :
> sans eux, un import cassé les rendrait tous verts d'un coup.
>
> ### LE BLOQUANT QUI RESTE OUVERT
>
> 🔴 **`ops_audit.tool` et `ops_audit.principal` ne sont bornés par rien, et une
> terminaison peut ne laisser AUCUNE ligne.** Les deux champs sont posés
> verbatim dans l'en-tête vivant depuis `AppelEntrant.nomComplet` et
> `IdentiteAppelante` ; la garde de forme du § 31 refuse la ligne, et l'écriture
> lève HORS du `try` de `journaliser`. **Rien ne sort** — la porte est bien
> fermée —, c'est la **trace** qui est perdue, et avec elle l'invariant du § 11
> (« toute terminaison écrit une ligne ») et la métrique de refus du § 24.
> Mesuré : 4 formes soumises, 4 levées, **0 ligne écrite**, contre 2 lignes sur
> 2 cas bien formés. **Le correctif demande deux arbitrages de CDC** — quelle
> valeur de repli, et un `principal` malformé doit-il refuser l'appel ou
> seulement borner sa trace — et les combler par une supposition serait le geste
> exact que le lot 1d existe pour proscrire.

> ### ⚠️ 2026-08-31 — CE DOCUMENT DATE DE LA FIN DU LOT 1
>
> Le **lot 1b** a tranché quatre des points laissés ouverts ici, et modifié le
> code en conséquence. Les paragraphes concernés portent un marqueur ✅ et
> renvoient à l'ADR qui les ferme. Le reste du document reste vrai.
>
> | Point ouvert au lot 1                 | Tranché par | Ce qui a changé                                      |
> | ------------------------------------- | ----------- | ---------------------------------------------------- |
> | § 3.1 — cinq étapes sans propriétaire | lot 1b      | les cinq sont ÉCRITES et CÂBLÉES — voir § 3.1 et § 8 |
> | § 4.1 — le journal se recalcule       | ADR 0002    | rôle en ajout seul + `selfHash` scellé par HMAC      |
> | § 4.2 — schéma d'entrée non fermé     | ADR 0003    | le registre exige la fermeture, deux dialectes       |
> | § 4.3 — l'empreinte des profils       | ADR 0004    | `profilesVersion` / `profilesSha` au manifeste       |
> | (nouveau) `vault_locked`, étape 0     | ADR 0005    | 14 codes d'erreur, `AppelStep = 0 \| 1 \| … \| 14`   |
>
> **Mesures à la fin du lot 1b** : `pnpm typecheck` vert, `pnpm lint` vert,
> `pnpm format:check` vert **sur tout le dépôt**, **838 tests verts,
> 2 `it.fails`, 1 `.todo`, 0 rouge** (contre 511 + 2 `.todo` à la fin du lot 1).
>
> ⚠️ **CE QUE LES DEUX `it.fails` SONT, ET POURQUOI ILS NE SONT PAS DES ROUGES.**
> Un `it.fails` porte l'attente CORRECTE — celle du CDC — et est vert TANT QUE le
> socle ne la tient pas. Ce sont donc **deux défauts ouverts, datés et
> instrumentés**, pas deux tests qui passent. Le jour où on les corrige, ils
> rougissent, ce qui force à les repasser en `it()`. Les deux demandent un
> arbitrage : voir **§ 8**.

---

## 1 · Les quatre gates, mesurées

| Gate   | Commande            | Résultat                          |
| ------ | ------------------- | --------------------------------- |
| Types  | `pnpm typecheck`    | **vert** — aucune sortie          |
| Style  | `pnpm lint`         | **vert** — aucune sortie          |
| Format | `pnpm format:check` | **vert** — tous les fichiers      |
| Tests  | `pnpm test`         | **511 verts, 2 `.todo`, 0 rouge** |

**Périmètre mesuré**, écrit avec la mesure : 99 fichiers TypeScript dans
`core/` (57 de code, 42 de gardes), 42 fichiers de tests, 513 tests déclarés.
Les dossiers `adapters/`, `console/`, `voice/` et `ops/` sont **vides** — c'est
le lot 2.

⚠️ **Ce que « vert » ne prouve pas — mis à jour au lot 1b.** La CI existe
désormais (`.github/workflows/ci.yml`, § 3.3) et lance ces quatre commandes plus
la validation du schéma. Elle **sait rougir**, et c'est mesuré, pas affirmé :
`ops/temoin-ci.ts` fabrique un défaut par gate et exige que chacune échoue, puis
reverdisse. Ce qu'elle ne prouve toujours pas : qu'une PR rouge ne peut pas être
fusionnée — la protection de branche est un réglage GitHub, hors du dépôt.

---

## 2 · Ce qui est construit

Huit modules sous `core/`, tous avec leurs gardes à côté du code.

- **`core/types`** — le vocabulaire fermé : `Effect`, `DataClass`,
  `PolicyLevel`, `OpsScope`, `ErrorCode`, et `APPEL_STEPS`, la table des étapes
  du § 11 dont les autres modules **dérivent** leurs numéros.
- **`core/vault`** — coffre AES-GCM, AAD = `name‖version`, trois états
  (absent / verrouillé / ouvert), rotation reprenable par `keyId`, plafond
  d'amorçage atomique du § 27.
- **`core/policy`** — le niveau appliqué à un outil, l'effet, le jeton de
  confirmation lié à l'`argHash`, l'asymétrie resserrer/desserrer du § 20, le
  TOTP (RFC 6238, gardé par les six vecteurs de l'appendice B), et la
  **procédure de démarrage** qui referme un desserrage en cours.
- **`core/limits`** — étapes 8, 12 et 13, dans cet ordre, avec la couture
  obligatoire où viennent se placer 9, 10 et 11.
- **`core/audit`** — le journal chaîné, l'invariant de sortie (« toute
  terminaison écrit exactement une ligne »), la purge ancrée par clôture, la
  garde de contenu du § 31.
- **`core/profiles`** — l'énumération fermée des profils et le budget du § 14,
  compté en **octets UTF-8** (aucun tokenizer : `countTokens` du SDK est un
  appel HTTP, et ce chantier n'émet aucun appel sortant).
- **`core/registry`** — l'admission d'un manifeste venu d'ailleurs, le verrou
  d'épinglage, et la production des lignes `ops_tool`.
- **`core/adapter-kit`** — le contrat d'adaptateur, le manifeste, et le harnais
  de conformité en neuf contrôles.

**Dépendances** : aucune n'a été ajoutée. Les quatre `core/*/DEPS.md` déclaraient
tous « aucune dépendance nouvelle » ; ils ont été lus, leurs écarts reportés
ci-dessous, puis supprimés.

---

## 3 · Ce qui n'est PAS construit

### 3.1 · Cinq étapes du § 11 n'ont aucun module — `it.todo` n° 1

> ✅ **2026-08-31, lot 1b seconde moitié — REFERMÉ.** Les cinq modules sont
> ÉCRITS, testés, exportés par `core/chaine/index.ts`, et câblés par
> `orchestrerAppel()`, qui a désormais un corps. `etapesNonImplementees()` rend
> **zéro**.
>
> | Étape | Module RÉEL                          |
> | ----- | ------------------------------------ |
> | 5     | `core/chaine/etape-05-scopes.ts`     |
> | 6     | `core/chaine/etape-06-outil.ts`      |
> | 9     | `core/chaine/etape-09-curseur.ts`    |
> | 11    | `core/chaine/etape-11-provenance.ts` |
> | 14    | `core/chaine/etape-14-execution.ts`  |
>
> ⚠️ **CE QUI ADOSSE CE ZÉRO À AUTRE CHOSE QU'UNE DÉCLARATION.** Un registre qui
> se dit implémenté est de la prose, et de la prose ne contredit que de la prose.
> Ce reste-à-faire a d'ailleurs MENTI pendant tout le lot : il nommait cinq
> fichiers qui n'existaient pas, pendant qu'un second registre en nommait cinq
> autres qui existaient, sans que rien ne les confronte. Deux gardes le tiennent
> désormais : le fichier nommé par `module` doit **EXISTER sur le disque**, et le
> résolveur d'`executer` est **APPELÉ** — il doit rendre une fonction. Et il n'y a
> plus qu'une seule table (`core/chaine/modules.ts`), lue par les deux registres.
>
> ⚠️ **La table de noms de modules ci-dessous est PÉRIMÉE** : `core/scopes/`,
> `core/catalogue/` et les autres n'ont jamais été retenus. Elle est conservée
> telle quelle parce qu'elle porte le RAISONNEMENT — « pourquoi c'est grave » —
> qui, lui, reste juste et explique ce que le lot a refermé.

`core/__tests__/integration.spec.ts` → « quelles étapes un module
revendique-t-il ? »

Sur les dix étapes du § 11 applicables au transport JSON-RPC, **cinq n'ont
aucun propriétaire** :

| Étape | Ce qu'elle fait                   | Module à écrire    |
| ----- | --------------------------------- | ------------------ |
| 5     | scopes suffisants pour l'`effect` | `core/scopes/`     |
| 6     | l'outil existe et est activé      | `core/catalogue/`  |
| 9     | curseur signé / `filtersHash`     | `core/cursor/`     |
| 11    | provenance                        | `core/provenance/` |
| 14    | exécution + compaction (§ 13.3)   | `core/compaction/` |

**Pourquoi c'est grave.** Deux d'entre elles (5 et 11) sont des gardes de
**sécurité** ; une (9) empêche une fenêtre de pagination silencieusement fausse.
Tant qu'elles n'ont pas de module, **chaque appelant les réécrit à la main** —
c'est ce que l'orchestrateur des tests fait, et cette main-là n'est gardée par
rien. Corollaire non couvert : rien ne force l'`effect` à être lu dans
`ops_tool` plutôt que reçu de l'appelant.

**Pourquoi `.todo` et non rouge.** Écrire cinq modules est un LOT, pas un
correctif ; à la hâte, ils produiraient exactement ce que ce chantier interdit —
des gardes vertes parce qu'elles ne mesurent rien. Relâcher la garde à la valeur
observée (`[5,6,9,11,14]`) la ferait cesser de garder : une sixième étape
orpheline resterait verte. La laisser rouge masquerait toutes les autres
régressions.

**La garde est écrite pour verdir toute seule** le jour où ces modules existent,
chacun exportant sa constante d'étape comme `ETAPE_POLITIQUE` et
`ETAPES_LIMITES` le font déjà.

⛔ **Arbitrage Will : ces cinq modules sont-ils le lot 2 ?**

### 3.2 · ✅ La racine de composition existe (lot 2) — `it.todo` n° 2 FERMÉ

`core/epreuve/politique-chemins-de-panne.spec.ts` → l'attente « est appelée par
l'entrée du conteneur » est passée de `it.todo` à `it()`. Elle mesure désormais
`ops/main.ts` parmi les appelants de production de `demarrerPolitique`, et elle
annonce du même geste les **deux bornes** de la garde qui la porte : les
fichiers écartés par le suffixe `demarrage.ts`, et les citations en prose
comptées comme des appels.

`ops/main.ts` parcourt l'échelle de sept étages d'`ops/demarrage/etages.ts`
(ADR 0023) ; l'arbitrage vit dans `ops/demarrage.ts` et il est PUR.

1. ✅ `demarrerPolitique()` (protection 4 du § 20) est appelée à l'étage 4. Un
   socle qui redémarre pendant un desserrage de douze heures **referme** :
   `ops/main.spec.ts` (⑤) le mesure avec son témoin de contraste — la lecture
   seule rend `libre`, la racine rend `brouillon`.
   ⛔ **CE QUI RESTE** : l'étage 3 (authentification) n'a **pas d'exécutant**.
   Son décideur `verifierLaConfigurationDAuthentification` n'est écrit nulle
   part, et tant qu'aucun contrôle n'est fourni **le processus sort** (§ 19,
   règle absolue — pas de mode dégradé). Le cliquet daté
   `ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR` le porte et rougit dans les deux
   sens. Aucun point d'entrée de processus (`process.exit`) n'est donc posé : il
   sortirait toujours en 3, et une entrée qui échoue toujours est une mine.
2. `PROFILE_NAMES` n'est passé à `creerAdapterKit()` ni à
   `enregistrerAdaptateur()` par aucun appel de production. La « seule garde du
   budget qui ne dépende d'aucun adaptateur » (§ 14) est déclarée, armée nulle
   part. `EntreeEnregistrement.profilsConnus` reste typé `readonly string[]` :
   même au jour du câblage, rien ne rattraperait un appelant qui passerait une
   autre liste. **Correctif préparé** : paramétrer sur `<TProfile extends
string>` pour que le compilateur voie le raccordement.
3. `Coffre.lireCleArgHash()` fournit désormais le port `CoffreArgHash`, mais
   personne ne branche encore le coffre au calcul d'`argHash`.

### 3.3 · ✅ La CI existe désormais (lot 1b)

`.github/workflows/ci.yml`. Le § 23 décrit « push → typecheck · lint · tests
unitaires · harnais de conformité » ; les cinq gates sont posées, plus la
validation du schéma Prisma contre l'URL **stub** (`stub.invalid`, RFC 2606).

**AUCUNE étape ne porte `continue-on-error`**, et ce n'est pas une promesse :
`ops/workflow.spec.ts` LIT le fichier et rougit sur quatre formes —
`continue-on-error`, un `if:` conditionné à un secret, un code de retour écrasé
(`|| true`, `set +e`), une sortie d'erreur jetée. Elle annonce le nombre de
fichiers, de lignes et d'étapes examinés.

**Un secret absent FAIT ÉCHOUER l'étape, il ne la fait pas sauter.**
`ops/secrets.ts` porte la liste — **vide aujourd'hui**, et l'étape l'écrit
plutôt que de le taire : le socle ne sort pas de la machine. La mécanique, elle,
est en service, et `ops/secrets.spec.ts` l'éprouve sur les trois formes
d'absence (non exposé, chaîne vide, espaces seuls) — la deuxième étant celle que
GitHub Actions produit pour un nom mal orthographié.

**La CI sait rougir, et c'est MESURÉ.** Le job `temoin` lance
`ops/temoin-ci.ts`, qui fabrique un défaut pour chacune des quatre gates, exige
que chacune ÉCHOUE, retire le défaut et exige que chacune REVERDISSE. Sans la
seconde moitié, une gate cassée en permanence passerait pour une gate qui mord.
Exécuté à la main sur ce dépôt : `typecheck` code 2 / 0, `lint` 1 / 0,
`format:check` 1 / 0, `test` 1 / 0 — quatre gates, zéro anomalie.

⚠️ **Ce que la CI ne prouve pas.** Aucune protection de branche n'est déclarée
ici : rien, dans ce dépôt, ne dit qu'une PR rouge ne peut pas être fusionnée.
C'est un réglage GitHub, hors du dépôt, et aucune garde de texte ne l'atteint.
Les actions tierces sont épinglées **par étiquette** (`@v4`), pas par SHA.

---

## 4 · Ce qui attend une décision de Will

Sept points. Aucun n'est un bug à corriger : chacun est un choix que la Recette
a refusé de trancher seule.

### 4.1 · 🔴 Le journal ne résiste pas à une réécriture complète

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0002.** Les DEUX sorties ont été
> prises, parce qu'elles ne couvrent pas le même attaquant : un rôle PostgreSQL
> en ajout seul (`prisma/sql/0001-ops-audit-append-only.sql`, avec une purge sous
> un autre rôle) ET le `selfHash` scellé par HMAC (`core/sceau/`). Réécrire le
> journal exige désormais deux compromissions distinctes. **Reste ouvert** :
> `ops_audit` ne porte aucune version de clé de scellement.

`prisma/schema.prisma` + `core/audit/verification.ts`

Le chaînage est un **SHA-256 nu, sans clé**, et **aucun rôle base append-only
n'existe** (aucun `REVOKE` dans le dépôt). Tout compte disposant d'`UPDATE` /
`DELETE` sur `ops_audit` peut retirer une tranche **puis recalculer toute la
chaîne** : `verifierChaine` rend alors `valide = true` sur un journal amputé.

Les quatre gardes de troncature ne mordent donc que sur un attaquant qui aurait
`DELETE` **sans** `INSERT` — une répartition de droits que rien n'écrit nulle
part. Le critère de fini du lot 1 (« une ligne retirée au milieu casse la
vérification ») est satisfait par un test qui ne donne à l'attaquant que la
suppression.

**Ce qu'il faut décider.** Soit un rôle PostgreSQL dédié
(`REVOKE UPDATE, DELETE ON ops_audit`), l'application écrivant sous ce rôle et
la purge sous un autre — **à rattacher au lot 1, pas au lot 10**. Soit écrire
noir sur blanc dans un ADR quel modèle d'attaquant les gardes couvrent. Un
journal falsifiable pendant toute la construction est un journal qui n'atteste
rien de la construction.

### 4.2 · 🔴 Le registre n'exige pas un schéma d'entrée FERMÉ

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0003.** Le dialecte est décidé :
> `additionalProperties: false` ET `unevaluatedProperties: false` sont acceptés,
> et le dialecte qui a servi est rendu. Les deux ajouts (a) et (b) sont posés,
> et le témoin exact cité ci-dessous rougit — `core/registry/`
> `admission-schema.temoin.spec.ts`.

`core/registry/manifeste-recu.ts`

Deux règles du § 09 — « le schéma d'entrée est `.strict()` » et le contrôle 7
« aucun champ d'autorisation ne provient du schéma d'entrée » — ne sont tenues
**que du côté build**, c'est-à-dire seulement pour un adaptateur TypeScript qui
passe par le kit. Le registre est la **seule barrière statique** pour un
manifeste produit ailleurs — et c'est exactement le cas que le § 29 redoute : le
CRM en PHP, dépôt **public à jamais**.

Témoin exécuté : un manifeste fédéré dont un outil déclare
`inputSchema: { type: "object", properties: { peutVoirAppels: { type: "boolean" } } }`
— sans `additionalProperties` — est **admis** sans un mot. `peutVoirAppels` est
nommément une propriété de `Habilitations`.

**Ce qu'il faut décider : le DIALECTE.** Refuser tout `inputSchema` dont
`additionalProperties !== false` rejetterait un manifeste PHP qui exprimerait la
fermeture autrement (`unevaluatedProperties: false`). C'est un contrat
inter-langages, pas un détail d'implémentation.

Deux ajouts, tous deux vérifiables sur le manifeste SEUL, sans réseau :
(a) le registre exige la fermeture du schéma d'entrée, sous la forme retenue ;
(b) le registre applique le contrôle 7 en confrontant les propriétés du schéma
aux clés dérivées par `clesDAutorisationDepuisSource` — **le code existe déjà**
dans `core/adapter-kit/autorisation.ts` et n'est appelé que par le harnais, qui
tourne dans la CI de l'ADAPTATEUR.

### 4.3 · 🔴 L'empreinte des profils ne voyage pas dans le manifeste

> ✅ **2026-08-31, lot 1b — TRANCHÉ, voir ADR 0004.** `profilesVersion` et
> `profilesSha` entrent dans `Manifeste` ; le sceau voyage de `core/profiles`
> jusqu'au registre sans être recalculé nulle part, et le registre confronte LES
> DEUX champs. C'était la dernière fenêtre : aucun épinglage réel n'existait.

`core/profiles/profiles.ts`

`PROFILES_VERSION` et `empreinteProfils()` sont une garde qui **ne peut pas
rougir** : elle n'est branchée nulle part. Le fichier affirme pourtant qu'« un
adaptateur fédéré épingle cette version dans son manifeste ». Or le manifeste ne
porte **ni la version ni l'empreinte** (ses sept clés sont `manifestVersion, id,
version, mode, profiles, secrets, tools`), et `EntreeVerrou` non plus.

Un adaptateur fédéré produit donc son manifeste contre SA copie de
l'énumération ; si les deux divergent, le manifeste reste valide, le registre
l'admet, et **la divergence ne se voit nulle part** — précisément le défaut que
l'empreinte prétend rendre visible d'un seul octet.

**Ce qu'il faut décider.** Ajouter `profilesVersion` (et/ou `profilesSha`) au
manifeste **change toutes les empreintes épinglées** : c'est une décision à
prendre AVANT le premier épinglage réel. Soit on l'ajoute et le registre le
confronte à `empreinteProfils()`, soit **on corrige la phrase de `profiles.ts`
pour qu'elle cesse de décrire un mécanisme absent.** La première est la seule
qui rende la garde exécutable.

### 4.4 · ✅ Deux dérivations du niveau de politique se contredisaient — TRANCHÉ (lot 1b)

`core/policy/scope.ts` · `core/policy/niveau.ts` · `core/registry/enregistrer.ts`

`niveauApplique()` répondait par **appartenance** aux scopes que
`scopesCouvrants()` fabrique ; `plancherDuScope()` / `scopeDomine()` répondaient
par **analyse** de la grammaire, en découpant le scope sur son dernier point.
Trois conséquences mesurées, sur une politique **parfaitement lisible** — donc
là où aucun fail-closed ne venait refermer l'écart : le même outil recevait
`libre` ou `brouillon` selon la façon dont sa référence avait été construite ;
un RESSERRAGE valide et en vigueur ne mordait pas ; et `classerChangement()`
faisait passer un élargissement réel par le chemin « resserrage », sans second
facteur ni `ops:policy`.

**Ce qui est tranché, et écrit à un seul endroit.** La grammaire du § 12 est
`*` | `adapterId.*` | `adapterId.tool` : un scope se lit de gauche à droite, le
**PREMIER** point sépare l'adaptateur de l'outil, **donc `adapterId` ne contient
aucun point**. `zoho.mail.send` est l'outil `mail.send` de l'adaptateur `zoho`,
et `zoho.mail.*` n'est plus un scope.

Ce n'est pas un arbitrage de confort : c'est déjà la règle que
`core/adapter-kit/manifest.ts` applique au BUILD (`MOTIF_ID` n'admet ni point ni
majuscule), tandis que `MOTIF_NOM_OUTIL` admet les points.

**Ce qui a été fait.**

- `scopeCouvre()` passe par `scopeDomine()` — **une seule dérivation**.
  `scopesCouvrants()` subsiste pour l'écran : elle ÉNUMÈRE, elle ne DÉCIDE plus.
  `core/policy/scope.spec.ts` confronte les deux lectures sur 60 paires.
- `analyserReference()` refuse une référence qu'aucun scope ne saurait nommer,
  et `niveauApplique()` replie alors sur le niveau le plus strict avec la raison
  **`référence-illisible`** — le bon niveau POUR LA BONNE RAISON.
- La règle est **revalidée à l'enregistrement** : refus
  `id_innommable_par_un_scope` (`core/registry/enregistrer.ts`). C'était
  nécessaire — `lireManifesteRecu()` n'exigeait qu'un `id` non vide, donc un
  manifeste produit ailleurs (le CRM en PHP, § 29) pouvait s'enregistrer sous
  `zoho.mail`. Le refus INTERROGE `analyserScope()` au lieu de retaper la règle,
  et `core/registry/id-nommable.temoin.spec.ts` le prouve sur 14 identifiants.
- Les trois témoins « 🔴 DÉFAUT CONSTATÉ » de `niveau.temoin.spec.ts` ont été
  **conservés** : ils rejouent la même politique et montrent ce qui referme
  l'écart. Aucun n'a été supprimé.

⛔ **Reste ouvert** : la garde manquante que le lot 1 nommait déjà — une ligne
d'`ops_policy` en vigueur dont le scope ne couvre AUCUN outil enregistré est une
anomalie qui devrait être affichée, avec le nombre d'outils confrontés. Elle
suppose un catalogue d'outils, qui appartient à la chaîne d'appel.

### 4.5 · 🟠 Un effet peut partir sans trace (objectif O6)

`core/audit/journal.ts`

L'inversion de contrôle d'`avecJournal()` garantit qu'on **passe** par
l'écriture, pas qu'elle **réussisse**. Sur le chemin de succès, le corps a déjà
tourné — à l'étape 14, l'effet extérieur a eu lieu — quand l'écriture échoue.
L'appel « échoue » pour l'appelant, **zéro ligne est écrite**, et l'effet est
bien parti.

Ce n'est pas rattrapable par la seule inversion : le journal ne peut pas être
écrit avant que la durée et l'issue soient connues. L'invariant tient pour toute
terminaison atteinte **avant** l'étape 14 ; au-delà, il est faux.

**Ce qu'il faut décider.** (a) Reconnaître l'écart dans l'en-tête du fichier et
dans le rapport, en remplaçant la phrase absolue par sa borne. (b) Le refermer :
écrire une ligne d'**intention** avant l'étape 14, puis la clore après — le
chaînage accepte deux lignes, et une intention non close est précisément le
signal qu'on veut voir. Coût : une écriture de plus par appel exécuté.

### 4.6 · ✅ `ops_audit.argHash` portait deux populations — REFERMÉ (lot 1b)

`core/audit/journal.ts` · `core/audit/vocabulaire.ts` · `prisma/schema.prisma`

L'en-tête est **affiné** après l'étape 8 : le journal et le jeton de
confirmation désignent le même appel. Mais les terminaisons **antérieures** à
l'étape 8 gardaient l'empreinte de la charge brute — elles n'ont rien d'autre —
et **rien dans la ligne ne les distinguait.**

`ops_audit.argHashValidated` porte désormais le fait lui-même, et il **entre
dans l'empreinte chaînée** (`CHAMPS_COUVERTS`, dix-sept champs depuis que
l'ADR 0017 y a fait entrer `externalEffect` ; seize au lot 1b). Il a été posé
maintenant précisément pour cela : aucune base ne tourne, aucune ligne n'existe.
Après le premier chaînage réel, il aurait fallu une clôture de rupture et deux
régimes de vérification dans le même journal.

**Le remède provisoire était faux, et le témoin le montre.** `stepDenied < 8`
est une INFÉRENCE : elle se trompe sur une terminaison par **exception**, où
`stepDenied` est nul — l'empreinte y est brute et l'inférence la déclare
validée. Mesuré dans `core/audit/deux-populations.temoin.spec.ts`.

**Trois états, pas deux, et le troisième se lit ailleurs.** `false` couvre
l'empreinte brute ET « arguments jamais lus » (refus d'étape 1). Les deux se
séparent par la VALEUR : `ARG_HASH_NON_LU` est une constante convenue qu'aucun
HMAC ne produira. Un troisième champ n'aurait rien ajouté.

### 4.7 · 🟡 Bornes et périmètres à confirmer

Quatre valeurs ont été **proposées** par les constructeurs et attendent une
confirmation, chacune écrite en un seul endroit :

| Valeur                       | Fixée à | Où                            |
| ---------------------------- | ------- | ----------------------------- |
| `TTL_DESSERRAGE_MAX_MS`      | 24 h    | `core/policy/desserrage.ts`   |
| `TTL_CONFIRMATION_MAX_MS`    | 5 min   | `core/policy/confirmation.ts` |
| `TTL_IDEMPOTENCE_MAX_MS`     | 24 h    | `core/limits/config.ts`       |
| `MAX_SEGMENTS_ALPHABETIQUES` | 6       | `core/audit/contenu.ts`       |

Et trois périmètres délibérément étroits, **écrits avec leur mesure** :

- **La clé de coffre dégénérée** — seuls les trente-deux octets à zéro sont
  refusés. Refuser « tous les octets identiques » serait plus fort, mais
  obligerait à réécrire la convention de fixtures de tout `core/vault/**`, qui
  fabrique ses clés d'essai avec `Buffer.alloc(32, n)`.
- **La garde du § 31** — elle prouve l'absence de **texte libre**, pas l'absence
  de donnée personnelle. Un nom en un seul mot, un numéro de téléphone, une URL
  courte la traversent : c'est **mesuré** par un témoin dédié, pas affirmé
  nulle part. Un renforcement réel passerait par les `idFields` que l'outil
  DÉCLARE (§ 09), pas par un motif de plus.
- **Le contrôle 3 du harnais** — il mesure la fraîcheur de sa liste
  d'exceptions, **et rien d'autre** : il ne regarde aucun appel. Le libellé a
  été corrigé pour cesser de promettre davantage ; la mesure manquante (balayer
  `entree.fichiers` à la recherche des appels à la couche de données) reste à
  écrire. Un témoin fixe cette borne et rougira le jour de la réparation.

---

## 5 · Dettes techniques mineures, sans arbitrage

- **`lireVerrou()` rend un verrou non nul sur `adapters: []`**, avec zéro
  anomalie. C'est légitime au lot 1, mais un appelant qui teste `verrou !== null`
  voit du vert sur un verrou qui n'épingle rien. Le contrat est désormais écrit
  dans la documentation de la fonction : **la lecture correcte est
  `estVert(verdict)`**. Le forcer par le type (rendre `verrou` inaccessible sans
  le verdict) reste possible.
- **Aucune implémentation en mémoire de `DepotQuota` / `DepotIdempotence` n'est
  exportée** par `core/limits`, là où `core/audit`, `core/policy` et
  `core/vault` exportent les leurs. Résultat : le même double est recopié dans
  quatre fichiers de gardes. Le jour où le contrat d'atomicité bouge, trois
  copies sur quatre garderont l'ancien comportement — et resteront vertes.
- **Le jeton de confirmation n'a aucune des dix tables du § 12.** `ops_token`
  en est la plus proche mais n'a ni `argHash` ni `tool` — c'est-à-dire
  précisément la liaison qui fait toute sa valeur. Retenu au lot 1 : **jetons
  en mémoire**, défendable (leur durée de vie se compte en minutes, un
  redémarrage les efface, ce qui va dans le sens du fail-closed). Coût : une
  confirmation demandée avant un redéploiement doit être redemandée après.
- **`non-rejouable` n'est défini nulle part dans le CDC.** Le § 09 l'énumère,
  aucune section ne dit ce qu'il fait. L'interprétation de `core/limits` est
  signalée dans le module, et elle a été choisie parce qu'elle échoue du côté
  sûr.

---

## 6 · Contrats posés par le lot 1 qu'il ne faut pas défaire

Cinq invariants ont coûté cher à établir. Les retirer rouvrirait un défaut
mesuré, chacun documenté à l'endroit du code qui le porte.

1. **`entreSchemaEtQuota` est OBLIGATOIRE** dans `ParametresLimites`. Facultatif,
   il laissait la composition naïve compiler sans un mot — et une garde qu'on
   peut ne pas appeler n'existe pas.
2. **Le contrôle 2 du § 09 lit le source BRUT.** Il ne doit dépendre d'aucun
   filtre préalable. Un `process.env` en commentaire est un faux rouge assumé.
3. **`versValeurJson()` refuse les prototypes étrangers et `toJSON`.** C'est ce
   qui garantit que l'empreinte et la forme lisent le même document.
4. **`resserrer` ne recule jamais l'instant où la surface se referme.** Le tri
   par niveau seul ne voit pas la dimension du temps.
5. **`ops_tool.bytes` est le poids de la PROJECTION SERVIE**, dérivé par
   `core/profiles.octetsDeLaDefinition`. Le contrôle d'intégrité du manifeste
   (`bytes_incoherent`) mesure une autre grandeur, sous un autre nom.

---

## 7 · Ce que la Recette a fait aux tests, et pourquoi

**Aucun test n'a été supprimé.** Un test retiré est un défaut caché.

Onze témoins ont été **ré-orientés** : ils affirmaient un défaut (« 🔴 DÉFAUT
CONSTATÉ — la garde reste verte ») ; le défaut ayant été corrigé, ils affirment
désormais l'invariant, et chacun a reçu un **contre-témoin** dans la même garde
pour qu'on ne puisse pas le confondre avec une garde qui refuserait tout.

Deux tests sont marqués **`.todo`**, chacun avec le motif écrit sur place et
repris ci-dessus (§ 3.1 et § 3.2). Aucune assertion n'a été relâchée à la valeur
observée : une garde calée sur le défaut du jour ne garde plus rien.

---

## 8 · Lot 1b, seconde moitié — ce que la chaîne a coûté, et ce qu'elle laisse

**Date : 2026-08-31.** Établi par la Recette du lot 1b, après onze passes de
construction et trois passes d'épreuve adverse.

### 8.1 · Ce qui est désormais tenu par du code

Les cinq étapes orphelines du § 11 sont écrites, et l'ORDRE appartient à
`orchestrerAppel()`. Trois propriétés en découlent, chacune tenue par une
structure et non par une consigne :

- **L'invariant de sortie du § 11 est tenu par le TYPE DE RETOUR.**
  `orchestrerAppel()` rend un `ResultatAppel`, qui étend `AppelJournalise` — dont
  le champ `ligne` est la ligne ÉCRITE. Il n'existe aucune façon de construire
  cette valeur sans qu'une écriture ait eu lieu.
- **Le schéma passe avant le quota**, et l'orchestrateur ne PEUT pas inverser
  l'ordre : il n'a pas la main dessus, c'est `appliquerLimites` qui reçoit le
  validateur et l'exécute lui-même.
- **Une seule table dit quel fichier exécute quelle étape** — `modules.ts` —, et
  les deux registres la lisent. La contradiction n'est plus improbable, elle est
  impossible.

### 8.2 · Les deux `it.fails` — deux défauts ouverts, datés

**① `ops_audit` nie une exécution qui a eu lieu.**
`core/audit/journal.ts` dérive le triplet de la ligne du seul GENRE de la
terminaison : `refus` ⇒ `decision: "refusé"`, `outcome: "non-exécuté"`. Or
l'étape 14 est la seule dont le refus arrive APRÈS l'effet extérieur —
`result_too_large` se prononce sur ce qui SORT, pas sur ce qui s'est passé. Un
`send` PARTI dont la réponse dépasse le plafond est donc journalisé « refusé /
non-exécuté ». La ligne existe, l'invariant tient — **elle est fausse**, et une
revue des effets extérieurs conduite sur `ops_audit` ne verrait jamais cet envoi.

L'information existe pourtant à cet instant : `ExecutionEtablie` porte
`octetsBruts`, donc la preuve que l'adaptateur a répondu.

⛔ **Arbitrage Will.** Faire porter au `Refus` le fait « l'effet extérieur a eu
lieu » est mécanique. QUELLE valeur d'`outcome` retenir ne l'est pas : `outcome`
entre dans l'empreinte chaînée (**ADR 0002**), donc en ajouter une est une
rupture de format — sans coût aujourd'hui, aucune base ne tournant. Qu'elle ne
soit pas `non-exécuté` n'est, en revanche, pas un arbitrage.

**② La « valeur réservée » du mode agrégat n'est réservée par rien.**
`CLE_AGREGAT_ABSENTE` distingue « 40 éléments sans canal » de « 40 éléments dont
le canal n'a pas été rendu ». Ce ne sont pas la même panne — et un adaptateur qui
rend littéralement cette chaîne comme VALEUR du champ d'agrégat fusionne les deux
populations en un seul compte, donc les rend irrécupérables.

⛔ **Arbitrage Will.** Le remède est structurel — un booléen `champAbsent` que le
socle produit et qu'aucune valeur d'adaptateur ne peut usurper —, mais il
**ajoute un champ à une sortie que le § 13.2 énumère**. C'est la même décision
que la troisième ligne du tableau ci-dessous, et les deux se prennent ensemble.

### 8.3 · Ce qui attend une décision, sans témoin exécutable

| Écart                                                         | Pourquoi la Recette ne l'a pas tranché                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sessionId` ni contraint, ni authentifié, ni lié au jeton** | Toute la garde du § 20 s'y ancre. Le contrat manquant est une décision de TRANSPORT — il n'existe pas encore. À écrire AVANT, pas après.               |
| **`idFields` est cru sur parole**                             | Le § 20 pose que « l'étiquetage se décide côté socle, jamais sur déclaration ». Exiger la fermeture d'un `messageId` rejetterait de vrais outils.      |
| **L'enveloppe ne dit pas ce qu'elle a perdu**                 | Sources écartées par le plafond, non conformes fondus, valeur d'agrégat absente. Le § 13.2 énumère TREIZE champs ; en ajouter un est une décision CDC. |
| **Le § 15 n'a aucun code pour un scope insuffisant**          | Trois causes de nature très différente sortent avec `code: null`. Le § 24 ne pourra pas les séparer dans sa métrique.                                  |
| **Le § 24 n'a aucune ligne pour l'écart d'épinglage**         | Le § 20 prescrit d'ALERTER ; le niveau n'est fixé par rien. `critique` est retenu **par décision de module**, écrit dans le type pour qu'il se relise. |
| **L'index de provenance est LOCAL AU PROCESSUS**              | Deux instances derrière un répartiteur verraient la garde du § 20 s'appliquer une fois sur deux, sans qu'aucun compte ne le dise.                      |
| **Fuite d'existence résiduelle**                              | Fermée à scopes VIDES. Un porteur qui a UN scope mais pas le BON apprend encore qu'un nom n'existe pas : il faudrait l'`effect` d'un outil illisible.  |
| **Cinq bornes de durée et de taille**                         | Les quatre de Will (2026-08-31) plus `TTL_MARQUAGE_MS`. Chacune vit à UN seul endroit, pour qu'une révision soit UNE ligne. Lot 6.                     |

### 8.4 · Ce que la Recette a fait aux tests, et ce qu'elle n'a pas fait

**Aucun test n'a été supprimé.** Trente-six témoins adverses sont passés de
`it.fails` à `it()` — **la plupart sans qu'une ligne de leur corps ne change**,
parce qu'ils portaient déjà l'attente du CDC et non la valeur fausse. C'est
l'idiome qui a fonctionné : un défaut écrit sous `it.fails` rougit le jour où il
est corrigé, ce qui interdit de le corriger en silence.

⚠️ **CE QUI A BOUGÉ QUAND MÊME, ET IL FAUT LE COMPTER.** Dix-huit tests ont vu au
moins une assertion changer. Dire « aucune ligne de leur corps » sans cette
réserve serait exactement le travers que ce dépôt combat : une mesure juste
énoncée plus largement qu'elle. Quatre familles, et chacun des tests le dit sur
place, en nommant l'assertion et le motif :

- **cinq** attendaient la valeur de remplacement `SOURCE_NON_CONFORME` à
  l'identique. C'était précisément ce dédoublonnage-là qui faisait fondre cinq
  canaux en échec en une seule entrée : le correctif SUFFIXE le rang, donc la
  valeur servie change. L'attente du § 13.2 — le nombre de canaux — est
  inchangée ;
- **six** portaient le SYMPTÔME du défaut plutôt que la règle : une levée
  d'`ErreurContenuJournal`, une enveloppe servie, un « la garde est verte alors
  que… ». Ils sont RETARGÉS sur ce qui rend la règle vraie. Le premier a reçu un
  **cliquet** : la garde du § 31, présentée avec la valeur BRUTE, doit toujours
  refuser — sans quoi ce test serait vert des deux façons ;
- **cinq** exigeaient `admisParLeRegistre === true` comme PRÉCONDITION. Deux des
  cinq formes ne sont plus admises par le § 09 ; garder cette exigence aurait
  rendu ces tests verts POUR LA MAUVAISE RAISON — « le registre le refuse déjà ».
  L'admission est désormais MESURÉE et annoncée, jamais exigée ;
- **deux** portaient le COMPTE des contournements. Il est passé de six à un, et
  le seul qui reste — `idFields` — est nommé dans l'attente, pour que le jour où
  il sera tranché, le test rougisse.

**Ce que la Recette n'a pas fait :** relâcher une assertion à la valeur observée,
et corriger un défaut qui demandait un arbitrage. Les huit du § 8.3 sont
au-dessus de son mandat.

### 8.5 · Gardes éprouvées par un témoin posé dans le code RÉEL

Quatre témoins ont été fabriqués DANS les fichiers de production, la suite
relancée, puis les fichiers restaurés. Les quatre ont rougi :

| Témoin posé                                               | Ce qui a rougi                                  |
| --------------------------------------------------------- | ----------------------------------------------- |
| Un chemin de module fantôme dans `modules.ts`             | 3 tests, sur les DEUX registres                 |
| La garde fail-closed de `deciderEtape10` neutralisée      | le témoin des six niveaux corrompus             |
| `format` redevenu une fermeture dans `estTexteLibre`      | 4 tests, dont la mesure d'ensemble des 5 formes |
| `continue-on-error: true` dans `.github/workflows/ci.yml` | la garde qui LIT le YAML                        |

Une garde qui ne peut pas échouer n'existe pas. Celles-ci le peuvent.

---

## 9 · Lot 1c — cinq décisions d'architecture, et la moitié de leur couture

**Date : 2026-08-31.** Le lot 1c **tranche cinq points** que la Recette du lot 1b
avait refusé de trancher seule, parce que ce sont des décisions d'architecture et
non des correctifs. Il pose les **interfaces**, écrit les **cinq ADR** — et,
contrairement à ce que cette section a d'abord annoncé, il **écrit aussi du
code** : quatre constructeurs ont travaillé en parallèle après l'architecte, et
la Recette a clos derrière eux.

> ⚠️ **CETTE SECTION A ÉTÉ CORRIGÉE PAR LA RECETTE.** Elle affirmait « n'a écrit
> ni logique, ni garde », « aucune implémentation », « 838 verts » et « aucun
> test n'a été ajouté, supprimé ni modifié ». Les quatre sont faux, et le
> document énonçait lui-même le diagnostic : « si un compte avait bougé, ce
> serait le signe qu'une déclaration a changé du code ». **Le compte a bougé de
> +139.** **Douze** fichiers de gardes créés (onze par les constructeurs, un par
> la Recette), **dix** fichiers TypeScript de production neufs, l'ADR 0017
> entièrement implémentée. Ce qui suit porte sa **date** et son **périmètre**,
> parce qu'un chiffre nu était périmé le jour même.

| Point ouvert au lot 1b (§ 8.3 et rapport)          | Tranché par  | La décision, en une ligne                                                                       |
| -------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `sessionId` ni contraint, ni authentifié           | **ADR 0014** | Établi par le socle, jamais accepté du client. Type marqué, fabrique unique.                    |
| `idFields` est cru sur parole                      | **ADR 0015** | L'étape 11 cesse de le lire : seul le SCHÉMA referme un champ.                                  |
| `FAMILLES_GOUVERNANCE` laisse échapper 9 noms / 20 | **ADR 0016** | L'outil DÉCLARE ses champs de gouvernance ; union avec le nom, jamais soustraction.             |
| `ops_audit` nie une exécution qui a eu lieu        | **ADR 0017** | `outcome` ne gagne aucune valeur ; `externalEffect` devient une colonne de l'empreinte chaînée. |
| L'index de provenance est local au processus       | **ADR 0018** | Mono-instance en v1, tenu par un verrou au démarrage ET un healthcheck à 503.                   |

### 9.1 · Ce qui a été écrit

| Fichier                                   | Ce qu'il porte                                                                                | Déclaré ou écrit ?                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `core/identite/session.ts`                | `SessionId` (type marqué), `FabriqueSessionId`, forme du § 31, erreur, frappeurs admis        | **écrit** — la fabrique existe et est éprouvée sur 1 000 frappes |
| `core/chaine/identite.ts`                 | session du démon stdio, `LigneOpsTokenRelue`, `sessionDuJetonRelu()`                          | **écrit**                                                        |
| `core/adapter-kit/champs-declares.ts`     | fermeture d'un champ d'entrée, `cumulerChampsDeGouvernance()`, `FAMILLE_DECLAREE_PAR_L_OUTIL` | **écrit**                                                        |
| `core/audit/canonique.ts` + Prisma        | `externalEffect` : colonne `OpsAudit`, entrée dans `CHAMPS_COUVERTS` (dix-sept champs)        | **écrit** (ADR 0017 implémentée de bout en bout)                 |
| `core/chaine/etape-14-execution.ts`       | le cliquet de l'effet extérieur, tiré après le retour de la clôture `executer`                | **écrit**                                                        |
| `ops/codes-hors-tableau.ts`               | les deux écarts assumés au § 15, leurs voisins écartés, la confrontation qui refuse un muet   | **écrit**                                                        |
| `ops/alertes.ts` · `ops/mono-instance.ts` | alertes d'épinglage · observateur mono-instance (la moitié « constater » de l'ADR 0018)       | **écrit**                                                        |
| `core/adapter-kit/types.ts`               | `ChampsDeGouvernanceDeclares`, `AUCUN_CHAMP_DE_GOUVERNANCE`                                   | déclaré                                                          |
| `core/audit/vocabulaire.ts`               | `PorteurDEffetExterieur`, `EFFET_EXTERIEUR_NON_SURVENU`                                       | déclaré                                                          |
| `core/audit/journal.ts`                   | `SignalEffetExterieur` (cliquet), `AffineursDAppel`                                           | déclaré + câblé                                                  |
| `core/instance/verrou.ts`                 | `VerrouDInstance`, les quatre états, `SanteMonoInstance`                                      | **déclaré SEULEMENT** — voir ci-dessous                          |

⚠️ **`core/instance/verrou.ts` ne porte que des déclarations, et sa prose parle
au présent.** L'ADR 0018 pose deux gardes qui ne se remplacent pas — le
**verrou** (empêcher) et l'**observateur** (constater). L'observateur est écrit
et éprouvé ; le verrou n'a **aucune implémentation**, pas même le double en
mémoire, et `deciderDemarrageMonoInstance`, que le fichier nomme comme l'arbitre
du démarrage, **n'existe nulle part dans le dépôt**. Mesuré : 4 états déclarés,
0 fonction exportée pour en trancher un seul. **Rien, aujourd'hui, ne fait qu'un
second processus refuse de démarrer** — et l'index de provenance du § 20 étant
local au processus, ce serait la garde d'exfiltration qui s'appliquerait un appel
sur deux. Un `it.fails` le porte.

Chaque point de couture restant porte un marqueur `🔧` nommant **le
constructeur** et **l'ADR**, à l'endroit exact où la ligne se coud.

### 9.2 · Pourquoi les champs sont POSÉS et non FUSIONNÉS

Trois des cinq décisions ajoutent un champ **obligatoire** à un type partagé —
`SessionId`, `governanceFields`, `externalEffect`. Les fusionner ici aurait cassé
la compilation et une centaine de fixtures : le lot 1c serait parti rouge, et le
premier réflexe du constructeur suivant aurait été de rendre les champs
optionnels pour retrouver du vert. Un champ optionnel est exactement ce que ces
trois ADR refusent — **c'est la forme sous laquelle une décision redevient un
oubli**.

Les interfaces sont donc posées **à côté**, et la fusion est une ligne
(`extends`), écrite dans l'ADR avec la liste des fixtures à migrer.

### 9.3 · Les `it.fails` se lisent par leur LISTE, jamais par leur nombre

Le dépôt en portait 2 au lot 1b et en porte **17** après la Recette du lot 1c.
Le nombre ne dit rien — deux `it.fails` peuvent très bien être deux autres :
celui de l'ADR 0017 a **basculé en `it()`** (l'effet extérieur entre bien dans
la ligne), celui de `scope_insufficient` aussi, et les épreuves adverses en ont
ouvert d'autres. Chacun porte l'attente d'un défaut **nommé et encore ouvert** :

- **ADR 0015 non cousue** — `analyserArgumentsDuSchema()` porte toujours son
  paramètre `idFields` et son `identifiants.has(nom) continue`. Mesuré sur le
  verdict : 6 champs de texte libre ordinaires sont refusés sans déclaration et
  **les 6 deviennent autorisés** par la seule déclaration ;
- **ADR 0016 non cousue** — la fonction n'a **aucun** paramètre pour recevoir
  `governanceFields`, et `cumulerChampsDeGouvernance()` a **0 appelant de
  production** sur 68 modules scannés. Les 9 graphies que le filet laisse
  échapper sont déclarées, acceptées à l'admission, puis **surveillées par 0** ;
- **ADR 0014 partielle** — `ContexteProvenance.sessionId`,
  `IndexProvenance.marquer()` et `domainesMarquants()` sont toujours des
  `string` : 3 occurrences nues, 0 marquée ;
- `dependentSchemas` absent du parcours de `core/adapter-kit/fermeture.ts` ;
- `idempotencyKey`, chaîne libre hors schéma qui atteint l'adaptateur et se
  persiste telle quelle dans `ops_idempotency.key` ;
- section critique déclarée mais absente de `JournalMemoire` ;
- arbitre du verrou mono-instance inexistant (§ 9.1) ;
- ligne d'intention non armée, faute de forme et de compteur ;
- `tool` brut : un nom d'outil porteur d'un espace fait perdre **toute** la
  ligne de journal du refus.

**La couture des ADR 0015 et 0016 reste le reste-à-faire n° 1 de ce lot.** Les
deux ADR ont atterri côté **manifeste et registre** — la déclaration est
confrontée au schéma, son absence d'effet est **dite** — et pas côté
**décision**. Le § 20 peut donc encore être désarmé par deux mots dans un
manifeste de dépôt tiers, exactement comme au lot 1b.

### 9.4 · Gardes éprouvées par un témoin posé dans le code RÉEL — Recette 1c

Trois témoins ont été fabriqués DANS les fichiers de production, la suite
relancée, puis les fichiers restaurés — empreintes md5 confrontées avant et
après. Les trois ont rougi :

| Témoin posé                                                               | Ce qui a rougi                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sessionDuJetonRelu()` frappe une session à la volée au lieu de la relire | 3 tests d'`identite.spec.ts`, dont G1 : « le rafraîchissement ne blanchit plus » → `autorise` |
| La boucle d'annonce d'`enregistrer.ts` ne pousse plus rien                | `registry/champs-declares.temoin.spec.ts` : 0 ligne annoncée au lieu de 1 — admission muette  |
| `cumulerChampsDeGouvernance()` remplace au lieu d'unir                    | 7 tests sur 3 fichiers ; `perdus : 11` annoncé                                                |

Une garde qui ne peut pas échouer n'existe pas. Celles-ci le peuvent.

### 9.5 · Mesures de fin de lot 1c — 2026-08-31, après la Recette

| Gate                   | Résultat                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`       | vert                                                             |
| `pnpm lint`            | vert                                                             |
| `pnpm format:check`    | vert **sur tout le dépôt**                                       |
| `pnpm prisma:validate` | vert (URL stub `stub.invalid`)                                   |
| `pnpm test`            | **977 verts, 17 `it.fails`, 1 `.todo`, 0 rouge** (838 au lot 1b) |

**76 fichiers de gardes, aucun sans compte annoncé.** Mesuré deux fois, et les
deux mesures sont écrites parce qu'elles ne disent pas la même chose : **0**
fichier sans aucune annonce `console.*`, et **0** fichier dont les annonces ne
porteraient **aucun nombre**. La seconde est la vraie — une annonce sans chiffre
est une couleur.

**11 étapes applicables au JSON-RPC, 11 revendiquées par un module propriétaire,
0 orpheline** ; **5** de ces modules vivent dans `core/chaine` et existent sur
le disque, **0** fantôme ; `etapesNonImplementees()` rend **0**.

⚠️ **« 14 étapes avec un module propriétaire chacune » n'est la mesure de rien**,
et cette formule circule. Le registre porte **15** entrées (les 14 du § 11, plus
l'étape 0 du § 23) ; **4** sont « HTTP seul » et attendent `core/transport/`,
qui n'existe pas ; **5** ont un module livré. Le lot 1b écrivait la chose
exactement — « les quatorze étapes ont un PROPRIÉTAIRE, et les cinq de
`core/chaine` sont IMPLÉMENTÉES ». C'est la reprise abrégée qui a transformé un
périmètre d'observation en garantie.

### 9.6 · `scope_insufficient` est branché

Le § 11 donne un `403` à l'étape 5 et le § 15 ne nomme aucun code : les trois
causes de refus de l'étape sortaient toutes avec `code: null`, indiscernables
entre elles **et** d'un refus de politique, ce qui privait le comptage du § 24
de sa seule façon de séparer une **attaque** d'un **socle mal câblé**.

`APPEL_STEPS[5].refus` porte désormais `scope_insufficient`, et les **quatre
branches** de refus de `core/chaine/etape-05-scopes.ts` le rendent. Mesuré en
faisant refuser l'étape quatre fois et en LISANT le code rendu, pas en relisant
le tableau. **Le module de l'étape n'a pas bougé d'une ligne** : `refuse()` LIT
le code dans l'ancrage — c'est la propriété que `core/chaine/etapes.ts` existe
pour tenir. Le `403` est inchangé : le code nomme la cause, il ne remplace pas
le statut.

L'`it.fails` qui portait l'attente a **basculé en `it()`**, et il mesure
maintenant davantage qu'avant. `enAttenteDeBranchement` est **vide** pour les
deux écarts assumés du § 15.

### 9.7 · La prose qui compte des champs est désormais gardée

Trois documents — `CHANGELOG.md`, cette page et l'ADR 0002 — annonçaient une
empreinte chaînée d'une colonne plus courte qu'elle ne l'est : **dix-sept
champs** depuis que l'ADR 0017 y a fait entrer `externalEffect`. Les trois
phrases étaient vraies le jour de leur écriture et fausses le lendemain, et
**aucune garde ne les lisait** : `CHAMPS_COUVERTS` est confronté au schéma
Prisma et à sa forme canonique, à la prose par personne.

`core/audit/prose-de-l-empreinte.spec.ts` relit **tous les documents Markdown** du
dépôt, y trouve les phrases qui annoncent un nombre de champs couverts (trois, ce jour), et
exige que chacune dise `CHAMPS_COUVERTS.length`. Elle porte **deux planchers**
qui ne disent pas la même chose : « au moins 10 documents relus » refuse une
garde qui ne lirait plus rien, et « au moins 3 phrases trouvées » refuse une
garde qui les lirait tous sans plus rien y reconnaître — le cas exact d'une
reformulation qui laisserait le chiffre faux.

⚠️ **Sa borne est écrite dans son en-tête** : elle ne trouve que les formes
qu'elle a nommées (chiffres et noms de nombres de zéro à vingt, suivis de
« champs », à moins de 140 caractères de « empreinte chaînée » ou de
`CHAMPS_COUVERTS`). « Une quinzaine de colonnes » lui échapperait.
