# ADR 0045 — La migration initiale, et ce après quoi le script d'ajout-seul s'applique

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `prisma/migrations/` (à créer), `prisma/schema.prisma`,
  `prisma/sql/0001-ops-audit-append-only.sql`, `.github/workflows/ci.yml`
- **Sources** : ADR 0002 (journal en ajout seul et scellé) ; cahier des charges
  v6, § 12 ; rapport de recette du lot 3, constat n° 3

---

## Le fait

**Le dépôt ne porte aucune migration Prisma.** `ls prisma` rend exactement
`schema.prisma` et `sql/` ; `prisma/migrations/` n'existe pas. Mesure
transcrite : **10 modèles déclarés au schéma, matérialisables par 0 chemin
reproductible.**

Conséquence en chaîne, et c'est elle qui compte :
`prisma/sql/0001-ops-audit-append-only.sql` **se déclare lui-même** « s'applique
**APRÈS** `prisma migrate deploy` ». **Il n'y a rien après quoi s'appliquer.**

Or ce script est ce qui retire `UPDATE` et `DELETE` sur `ops_audit`. Sans lui, le
chaînage d'empreintes de l'ADR 0002 ne prouve rien contre un compte qui peut
retirer une tranche **puis recalculer la chaîne** : `verifierChaine` rendrait
`valide = true` sur un journal amputé. **Le seul verrou qui rende une réécriture
visible n'est appliqué par rien.**

Le socle « démarre et sert » — c'est mesuré, et c'est vrai sur le coffre **local
en mémoire**. Il ne peut pas être **mis en service** sur Postgres.

## La décision

### 1 · La migration initiale entre au dépôt

`prisma/migrations/<horodatage>_initial/migration.sql`, produite par
`prisma migrate dev --create-only` à partir du schéma, **relue** et versionnée.

`--create-only` n'est pas un détail : il produit le SQL **sans l'appliquer**, ce
qui permet de le relire avant qu'il ne touche quoi que ce soit. Une migration
initiale non relue est un schéma qu'on n'a jamais lu qu'à travers un générateur.

### 2 · Le script d'ajout-seul se chaîne APRÈS, et l'ordre est écrit

L'ordre de mise en service est **une donnée**, pas une convention orale :

1. `prisma migrate deploy` — les 10 tables du § 12 ;
2. `psql -f prisma/sql/0001-ops-audit-append-only.sql`, sous le rôle
   **propriétaire**, **à chaque déploiement**. Le script est idempotent, et il le
   dit lui-même.

L'inverse échoue sur une table qui n'existe pas encore — c'est d'ailleurs la
raison, écrite dans l'en-tête du script, pour laquelle il **n'est pas** une
migration Prisma : `prisma migrate` gère la **forme** des tables, jamais les
rôles ni les droits.

### 3 · La chaîne d'intégration valide le chaînage sans base

`.github/workflows/ci.yml` ne porte aujourd'hui que `prisma:validate` contre
l'URL stub `stub.invalid` (RFC 2606). **Aucune base ne tourne en CI, et aucune ne
doit y tourner** : le socle ne sort pas de la machine (§ 29), et aucun
identifiant d'infrastructure n'entre dans ce dépôt public.

Ce qui se garde sans base, et qui doit l'être :

- `prisma/migrations/` porte **au moins une** migration ;
- le nombre de modèles du schéma est **couvert** — chaque `model` du schéma
  paraît dans le SQL de migration ;
- le script d'ajout-seul **nomme** les tables qu'il verrouille, et elles existent
  au schéma.

**Ce qui ne se garde pas ainsi est écrit comme tel** : qu'une migration
s'applique réellement sur une Postgres réelle ne se prouve qu'en l'appliquant, et
cela appartient à l'exploitation, pas à cette chaîne-ci.

### 4 · La dette est NOMMÉE en attendant

`it.fails` « `prisma/migrations/` porte une migration initiale, et le SQL se
chaîne après elle », dans
`core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts`. Il annonce
le nombre de modèles lus au schéma — **plancher à 10** — et le nombre de
migrations trouvées. Il est inscrit au registre comme `assertion` de cet ADR
(ADR 0041).

## La borne, écrite avec la décision

**Cet ADR ne rend pas le socle déployable.** Il rend les dix tables
**matérialisables par un chemin reproductible**, et il donne au script
d'ajout-seul quelque chose après quoi s'appliquer. Tout ce qui suit — le rôle de
connexion, l'appartenance au groupe, la sauvegarde, la restauration éprouvée —
est de l'exploitation, vit **hors de ce dépôt public**, et n'y entrera jamais.

## Ce qu'on a rejeté

- **Faire du script d'ajout-seul une migration Prisma.** Son en-tête explique
  déjà pourquoi : `migrate` ne gère ni les rôles ni les droits, et une migration
  écrite à la main avant la migration de base échouerait sur une table absente.
- **Renoncer aux migrations et livrer un `db push`.** `db push` ne laisse aucune
  trace de ce qui a changé ni de quand : c'est exactement le contraire de ce que
  l'ADR 0002 demande au journal.
- **Monter une Postgres en intégration continue.** Aucun appel réseau sortant
  au-delà du registre de paquets, et aucune valeur d'infrastructure dans un dépôt
  public. Ce qui se garde sans base se garde ; le reste s'écrit comme borne.
