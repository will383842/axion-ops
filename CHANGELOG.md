# Journal des modifications — `axion-ops`

Format : une entrée par lot. Les dates sont celles du dépôt, pas d'un
déploiement — **rien n'a été déployé.**

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
