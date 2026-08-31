# ADR 0002 — Le journal est en ajout seul, et sa chaîne est scellée

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1b)
- **Portée** : `prisma/sql/0001-ops-audit-append-only.sql`, `core/sceau/`,
  `core/audit/canonique.ts`, `core/audit/journal.ts`,
  `core/audit/verification.ts`, `core/audit/ports.ts`, `core/vault/coffre.ts`,
  table `ops_audit`
- **Sources** : cahier des charges v6, § 11 (invariant de sortie), § 12 (modèle
  de données), § 25 (rotation), § 31 (RGPD, purge et archivage) ;
  `docs/ETAT.md` § 4.1

> **Numérotation.** Les ADR 0010 à 0013 sont produits en parallèle par un autre
> chantier du même dépôt. Le lot 1b occupe 0002 à 0005.

---

## Le défaut, tel qu'il a été mesuré

Le lot 1 l'a écrit noir sur blanc, et c'est une mesure, pas une crainte :

> Le chaînage du journal est un **SHA-256 nu**, sans clé, et **aucun rôle base
> append-only n'existe** (aucun `REVOKE` dans le dépôt). Tout compte disposant
> d'`UPDATE` / `DELETE` sur `ops_audit` peut retirer une tranche **puis
> recalculer toute la chaîne** : `verifierChaine` rend alors `valide = true` sur
> un journal amputé.

Conséquence exacte : les quatre gardes de troncature de `core/audit` ne
mordaient que sur un attaquant disposant de `DELETE` **sans** `INSERT` — une
répartition de droits que **rien n'écrivait nulle part**. Le critère de fini du
lot 1 (« une ligne retirée au milieu casse la vérification ») était satisfait
par un test qui ne donnait à l'attaquant que la suppression.

Un journal falsifiable pendant toute la construction est un journal qui
n'atteste rien de la construction.

---

## Décision

**Les deux moitiés, ensemble. Rattachées au lot 1, pas au lot 10.**

### Moitié 1 — un rôle PostgreSQL en ajout seul

`prisma/sql/0001-ops-audit-append-only.sql` crée **deux rôles de groupe**,
`NOLOGIN`, et répartit les droits sur `ops_audit` :

| Rôle                 | `SELECT` | `INSERT` | `UPDATE` | `DELETE` | `TRUNCATE` |
| -------------------- | -------- | -------- | -------- | -------- | ---------- |
| `ops_audit_ecriture` | oui      | **oui**  | non      | non      | non        |
| `ops_audit_purge`    | oui      | non      | non      | **oui**  | non        |
| `PUBLIC`             | non      | non      | non      | non      | non        |

L'application écrit sous le premier. La purge du § 31 supprime sous le second.
**Aucun rôle ne porte les deux droits qui, ensemble, permettent de réécrire.**

### Moitié 2 — le `selfHash` devient un HMAC

`ops_audit.selfHash` était `SHA-256(prevHash ‖ "|" ‖ canonique)`. Il devient
`HMAC-SHA-256` sur le même message, **clé propre tirée du coffre**, séparation
de domaine (`axion-ops/ops_audit/selfHash/v1`), **fail-loud** si la clé manque.
Motif déjà en service : `core/limits/arg-hash.ts`.

Le module vit dans `core/sceau/`, et non dans `core/audit/` : ce dossier-là
porte une garde qui refuse tout appel à `createHmac`, et son motif — une
seconde implémentation de l'`argHash` serait une seconde clé pour le **même**
usage — reste juste. `core/audit` en déclare le **port** (`ScelleurJournal`,
quatrième de `ports.ts`) et code contre lui. Aucune garde n'a été désarmée.

---

## Pourquoi les deux, et pas l'une des deux

Elles ne couvrent pas le même attaquant, et c'est le point :

| Ce que l'attaquant obtient      | Il a la clé ? | `INSERT` | `DELETE` | Peut-il réécrire ? |
| ------------------------------- | ------------- | -------- | -------- | ------------------ |
| Le processus du socle           | **oui**       | oui      | **non**  | non                |
| Les identifiants de la purge    | non           | **non**  | oui      | non                |
| Une injection SQL sous le socle | non           | oui      | **non**  | non                |
| Les deux, séparément            | oui           | oui      | oui      | oui                |

Réécrire le journal exige désormais **deux compromissions distinctes**. Avec le
seul rôle append-only, un attaquant qui obtient le processus obtient tout, parce
qu'un SHA nu se recalcule sans rien. Avec le seul HMAC, un attaquant qui obtient
la base peut encore **supprimer** une tranche — la chaîne casse, ce qui est
visible, mais rien ne l'empêche.

---

## Ce que la décision EXCLUT

- **Un `selfHash` sans clé, sous quelque forme que ce soit.** Aucun repli, aucun
  mode dégradé, aucune clé de développement. Une clé de secours connue
  permettrait de forger la chaîne entière, et ce dépôt est public.
- **Un rôle unique portant `INSERT` et `DELETE`** sur `ops_audit`. C'est ce que
  la garde `n'accorde à AUCUN rôle à la fois l'écriture et la suppression`
  interdit, et elle est dérivée : un troisième rôle ajouté un jour avec les deux
  la fait rougir sans qu'on ait à penser à lui.
- **Une purge qui écrirait sa propre clôture.** Un rôle qui pourrait à la fois
  supprimer une tranche et écrire la ligne qui l'atteste pourrait écrire
  n'importe quelle attestation.
- **Le report au lot 10.** Un journal falsifiable pendant toute la construction
  n'atteste rien de la construction.

---

## Conséquences acceptées

### 1 · La purge se fait en deux temps, et le trou est détectable

La purge (§ 31) n'est plus atomique :

1. le socle (`ops_audit_ecriture`) écrit la ligne de **clôture** ;
2. la purge (`ops_audit_purge`) supprime la tranche attestée.

Une panne entre les deux laisse une clôture qui atteste une tranche **encore
présente**. Ce n'est pas un silence : `verifierChaine` le compte déjà sous
`ancresInutilisees`, dont la documentation existante dit — mot pour mot — que
« sur un journal lu en entier, un cumul non nul veut dire qu'une purge a déclaré
une tranche qui est pourtant toujours là ». **Le remède est de rejouer la
suppression, jamais de réécrire la clôture.**

L'ordre inverse — supprimer puis attester — laisserait, à la même panne, un
journal troué **sans ancre** : indiscernable d'une troncature hostile.

### 2 · Le changement casse toutes les empreintes — d'où « maintenant »

Passer d'un SHA nu à un HMAC change **toutes** les valeurs de `selfHash`. Le
faire après le premier chaînage réel aurait exigé une clôture de rupture et deux
régimes de vérification cohabitant dans le même journal. **Aucune base ne
tourne, aucune ligne n'existe** : c'était maintenant ou jamais.

### 3 · Cette clé ne se tourne pas comme les autres

Une rotation de la clé de scellement rend **invérifiable** tout le journal
scellé avec l'ancienne. Ce n'est pas un défaut : si l'ancienne clé suffisait
encore à valider les anciennes lignes, il suffirait de la garder pour recalculer
la chaîne. Trois obligations en découlent :

- l'ancienne clé se **séquestre hors ligne** tant que le journal qu'elle a
  scellé est conservé (§ 31 : douze mois archivés) ;
- la clé est **lue une fois, à la composition** (`scelleurDepuisCoffre`), et non
  à chaque appel — à l'inverse de celle de l'`argHash`, dont la relecture
  systématique est ce qui rend sa rotation effective. Ici une relecture ne
  servirait à rien : un changement de clé casse la chaîne au lieu de la
  continuer ;
- le § 25 doit inscrire cette clé sur sa liste **avec cette réserve écrite**.

### 4 · Le scelleur est un paramètre obligatoire, partout

`new Journal(scelleur, store, horloge?)`, `verifierChaine(scelleur, lignes,
options?)`, `calculerSelfHash(scelleur, prevHash, ligne)`. Un paramètre
optionnel avec repli annulerait la protection pour quiconque oublierait de le
passer, et personne ne le verrait. Le compilateur le réclame à chaque site
d'appel.

---

## Ce qui reste OUVERT — à porter à Will

### 4.1 · `ops_audit` ne porte aucune version de clé de scellement

Tant qu'il n'y a eu **qu'une** clé, la question ne se pose pas. À la première
rotation, elle se pose entièrement : on ne saura pas avec quelle clé vérifier
quelle tranche. Le remède est une colonne de plus — **qui entrerait dans
l'empreinte chaînée du § 12, donc qui change à nouveau le calcul du journal.**

C'est la même décision, au même endroit, que la colonne réclamée par
`docs/ETAT.md` § 4.6 (les deux populations d'`argHash`). **Les deux devraient
être prises ensemble, et avant le premier chaînage réel.** Elles ne l'ont pas
été ici : ce lot a changé le calcul une fois, pour un défaut de sécurité mesuré ;
le changer une seconde fois pour deux colonnes de traçabilité est un arbitrage
de commanditaire, pas de constructeur.

> ⚠️ **MISE À JOUR — le lot 1b a posé UNE des deux, pas les deux.**
> `ops_audit.argHashValidated` est en place (§ 4.6 de `docs/ETAT.md`, refermé),
> et l'empreinte chaînée compte **dix-sept** champs — seize au lot 1b, plus
> `externalEffect` que l'ADR 0017 y a fait entrer. La colonne de
> version de clé de scellement, elle, **reste ouverte**.
>
> L'écart est donc à porter tel quel : la recommandation « les deux ensemble »
> n'a pas été suivie, et le calcul du journal changera **une fois de plus** si
> l'on pose la version de clé. Cela reste sans coût **tant qu'aucune base ne
> tourne** — aucune ligne n'existe, aucune clôture de rupture n'est nécessaire.
> La fenêtre se referme au premier chaînage réel, et c'est elle, pas le nombre
> de changements, qui doit commander la décision.

### 4.2 · Le rôle de connexion ne doit pas être propriétaire de la table

Un propriétaire PostgreSQL peut toujours se redonner tous les droits. C'est une
propriété du moteur, pas un oubli du script. La conséquence est donc une
**exigence d'exploitation** :

- `DATABASE_URL` ne porte **jamais** le rôle de migration ;
- après application, `SELECT tableowner FROM pg_tables WHERE tablename =
'ops_audit'` doit rendre le rôle de migration.

---

## Ce que les gardes prouvent, et ce qu'elles ne prouvent pas

| Garde                           | Elle prouve                                                    | Elle NE prouve PAS                                        |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `core/audit/droits-sql.spec.ts` | que le **script** accorde et retire ce qu'il prétend           | que le **cluster** l'applique — aucune base ne tourne ici |
| `core/sceau/journal.spec.ts`    | qu'un journal amputé **puis recalculé sans la clé** est refusé | qu'un attaquant ne puisse pas obtenir la clé              |
| `core/vault/coffre.spec.ts`     | que la clé n'est pas lisible coffre fermé                      | que le coffre soit ouvert au bon moment                   |

Les deux requêtes `has_table_privilege` qui répondent à la première colonne
manquante sont nommées **en fin de script SQL** et tournent au déploiement.
