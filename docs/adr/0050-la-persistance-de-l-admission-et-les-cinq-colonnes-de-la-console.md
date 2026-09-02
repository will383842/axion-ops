# ADR 0050 — La persistance de l'admission, et les cinq colonnes que la console possède

- **Statut** : acceptée
- **Date** : 2026-09-02
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 5)
- **Portée** : `core/registry/depot.ts`, `core/registry/depot.spec.ts`,
  `core/registry/index.ts`
- **Sources** : cahier des charges v6, § 12 (`ops_adapter`, `ops_tool`), § 13.4
  (dépréciation), § 14 correction 3 (`enabled` bascule en console) ; ADR 0015 et
  ADR 0016 (ce qui se croit sur parole et ce qui ne se croit pas) ; le patron de
  `core/vault/depot.ts`

---

## Le fait

`enregistrerAdaptateur()` rend des lignes **et n'écrit rien** — c'est écrit dans
son en-tête, et c'est le bon découpage : « un enregistrement qui écrirait au fil
de ses contrôles laisserait un registre à moitié rempli au premier refus ».

**Personne ne prenait ces lignes.** L'étage 5 de `ops/main.ts` admettait
l'adaptateur, incrémentait `admis`, et **jetait le résultat**. Mesure transcrite
au 2026-09-02 : `grep -rn "prisma" core/ ops/ --include=*.ts` ne rendait qu'un
seul module de production, `core/vault/depot.ts`. **Aucune ligne `ops_adapter`,
aucune ligne `ops_tool`, n'a jamais pu être écrite par ce dépôt.**

Conséquence en chaîne, et c'est elle qui compte : `ops/index.ts` sert
`outilsEpingles = []` avec le commentaire « le zéro est une mesure, pas un
bouchon ». Le zéro était bien une mesure — celle d'un chaînon absent, pas celle
d'un catalogue vide.

## La décision

### 1 · Un `DepotDuRegistre`, sur le patron du coffre

Un port, deux prises : `DepotDuRegistreEnMemoire` et `DepotDuRegistrePrisma`,
cette dernière écrite contre une **interface structurelle** du délégué que le
vrai `PrismaClient` satisfait sans le savoir. Les trois motifs de
`core/vault/depot.ts` valent mot pour mot : éprouver une écriture qui échoue au
milieu, ne pas dépendre d'un client non généré, et garder la porte ouverte aux
deux environnements du § 23.

`depot.spec.ts` **dérive de `prisma/schema.prisma`** la liste des colonnes et
confronte celles que le module touche. Une interface structurelle écrite à la
main dérive en silence ; celle-ci ne peut pas.

### 2 · Les cinq colonnes que l'admission ne réécrit JAMAIS

`enabled`, `retiredAt`, `sunsetAt`, `limit`, `warnAt` sont **absentes de la
branche `update`** des deux prises. Le type l'exige (`Omit<…>` sur le délégué) et
le corps le fait.

Le motif n'est pas une précaution, c'est une **mesure** : le socle admet ses
adaptateurs **à chaque démarrage** (étage 5). Une prise qui réécrirait `enabled`
remettrait donc `false` à chaque redéploiement — alors que le § 14, correction 3,
fait précisément d'`enabled` la bascule d'urgence « en console, **sans
redéploiement** ». Une désactivation d'urgence serait annulée par le déploiement
suivant, en silence, sur un chemin que personne ne relit.

C'est mot pour mot le motif qui exclut `bootstrapCount` de l'upsert du coffre :
**un réglage qu'un redémarrage peut faire reculer ne règle rien.**

La garde correspondante ne lit pas le corps des méthodes : elle **admet deux
fois**, pose entre-temps le geste de la console, et **relit la valeur**.

### 3 · Deux dérivés ne sont pas persistés

`versEnregistrementOutil()` laisse tomber deux champs de `LigneOpsTool`, et les
deux sont des **dérivés** :

- `nomComplet` — il se dérive du préfixe (`prefixeDe()`). Le stocker en ferait
  une seconde vérité, qui divergerait le jour où le préfixe cesserait d'être
  l'id nu ;
- `retireDeLaListe` — le § 13.4 le dérive de `ops_tool.retiredAt`, « jamais
  l'inverse ». L'admission le rend toujours `false` : l'écrire écraserait, à
  chaque démarrage, une dépréciation posée en console.

### 4 · Un outil disparu du manifeste est NOMMÉ, jamais supprimé ni désactivé

`ResultatEcritureDuRegistre.outilsOrphelins` porte les `name@version` présents en
base et absents du manifeste admis. Le dépôt **ne les touche pas** :

- les **supprimer** effacerait les réglages de console d'un outil que le § 13.4
  veut « retiré de la liste, encore appelable six mois » ;
- les **désactiver** serait une mise à jour silencieuse — exactement ce que le
  § 20 interdit dans l'autre sens.

Un outil disparu change l'empreinte du manifeste, donc exige une ré-épingle
relue par un humain. **La décision se prend là, avec la liste sous les yeux**, et
la liste est ce que ce champ fournit.

### 5 · Aucune transaction, et ce que ça coûte est écrit

`$transaction` n'est pas dans l'interface structurelle : l'y mettre obligerait à
décrire le client entier, et la garde de schéma perdrait sa dérivation.

La conséquence réelle d'une écriture interrompue est **bornée par la forme des
opérations** : chaque upsert est idempotent sur sa clé, et l'admission a lieu à
chaque démarrage — une reprise repose exactement les mêmes lignes. Un registre à
moitié posé se répare donc en redémarrant, sans intervention. **Le jour où une
écriture cessera d'être idempotente, cette clause devra être remplacée par une
transaction, pas par une précaution.**

## Ce que cette décision ne fait pas

- Elle **n'écrit ni `lastSeenAt` ni `healthy`** : ils appartiennent à la sonde de
  santé. Les poser à l'admission ferait dire « joignable » à un adaptateur que
  personne n'a joint.
- Elle **ne branche rien**. `ops/main.ts` et `ops/index.ts` continuent d'admettre
  en mémoire ; le câblage appartient au lot suivant, et il a son propre ADR.
- Elle **ne lit pas le catalogue**. Les cinq champs qu'`OutilDuCatalogue` exige
  et qu'`ops_tool` ne porte pas (`pagination`, `compaction`, `maxBytes`,
  `idFields`, `adapterVersion`) sont l'objet de l'ADR suivant.

## Conséquences

- Le socle peut poser une admission dès qu'une base existe, sans changer une
  ligne du registre lui-même.
- `pnpm db:deploy` n'a toujours **aucune cible** : aucune base ne tourne, ni en
  local ni en CI (`stub.invalid`). Cette décision est éprouvée sur le jumeau en
  mémoire et sur un client Prisma **feint qui tient de vraies tables** — ce qui
  permet d'admettre deux fois et de relire, mais ne remplace pas une application
  réelle de la migration. C'est écrit ici plutôt que supposé ailleurs.
