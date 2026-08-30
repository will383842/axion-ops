# `core/policy` — les garde-fous

§ 20 du cahier des charges v6, plus la règle 1 du § 12 et l'étape 10 du § 11.
Ce module ne connaît **aucun métier**. Il répond à quatre questions.

| Question                                             | Fichier           |
| ---------------------------------------------------- | ----------------- |
| Quel niveau s'applique à cet outil, **maintenant** ? | `niveau.ts`       |
| Cet `effect` passe-t-il à ce niveau ?                | `effet.ts`        |
| Cette confirmation vaut-elle pour **cet appel** ?    | `confirmation.ts` |
| Ce changement de politique est-il libre, ou non ?    | `desserrage.ts`   |

Plus deux fondations : `scope.ts` (la grammaire `*` · `adapterId.*` ·
`adapterId.tool`), `ligne.ts` (une ligne d'`ops_policy` et sa lisibilité).
`second-facteur.ts` porte le TOTP ; `depot.ts` les interfaces de persistance.

## Les six règles tenues, et où elles vivent

1. **Le plus strict gagne**, jamais le plus spécifique — `niveau.ts`.
   `specificite()` existe pour trier un écran, et `niveau.spec.ts` porte la garde
   qui interdit de s'en servir pour décider.
2. **TTL évalué paresseusement à l'appel** — `ligne.ts:ligneEnVigueur`. C'est le
   seul endroit où l'heure entre dans le calcul. Aucune tâche de fond, et
   `niveauPourEcran()` existe pour qu'aucun écran n'ait de raison d'écrire un
   second calcul.
3. **Asymétrie** — `desserrage.ts`. `resserrer()` : aucun facteur, aucun scope,
   n'importe quel canal. `desserrer()` : `ops:policy`, canal humain, second
   facteur, durée non nulle **et** sous borne haute. Le tri des deux est
   **calculé**, jamais déclaré par l'appelant.
4. **Fail-closed** — `niveau.ts`. Aucune ligne, ligne illisible, redémarrage → le
   niveau le plus strict, avec `setBy: "boot"`. Une ligne corrompue n'est **pas
   écartée** : elle replie le calcul entier, parce qu'écarter une ligne
   `brouillon` retirerait un plancher.
5. **Confirmation à usage unique liée à l'`argHash`** — `confirmation.ts`.
   Vérification **puis** consommation atomique. Le jeton n'apparaît jamais dans
   un refus : `deciderEtape10` ne le reçoit même pas.
6. **Effets extérieurs** — `effet.ts`. `send` et `destructive`, classés par un
   `switch` **exhaustif** : un effet ajouté au socle et non classé est une erreur
   de compilation.

## Les gardes

78 tests, sept fichiers. Chacun suit le motif de la Fondation : une fonction pure
appliquée **d'abord** à un témoin fabriqué défectueux — on prouve qu'elle rougit
—, **puis** à la vraie donnée, en annonçant son compte d'éléments mesurés.

Deux gardes tirent leur référence d'ailleurs que d'elles-mêmes, et c'est
délibéré :

- `second-facteur.spec.ts` compare le TOTP aux **six vecteurs d'essai publiés à
  l'appendice B de la RFC 6238**. Une implémentation qui se tromperait de
  condensat, d'ordre d'octets ou de troncature ne peut pas les retrouver.
- `schema.spec.ts` **lit `prisma/schema.prisma`** et en dérive les champs
  scalaires d'`OpsPolicy` pour les confronter à `LignePolitique`. Le chemin est
  dérivé d'`import.meta.url`, jamais codé en dur — une garde attachée à un
  chemin absolu devient muette au premier déménagement, et son silence se lit
  comme un succès.

**Douze mutations ont été passées sur le code pour vérifier que les gardes
mordent** — `send` retiré des effets extérieurs, « le plus permissif gagne », la
liaison `argHash` retirée, `setBy: "boot"` changé, le second facteur toujours
valide, l'usage unique retiré, la grammaire de scope ouverte, le découpage de
l'`adapterId` au premier point, la voix autorisée à confirmer, un champ ajouté au
schéma Prisma, le TTL jamais comparé à l'heure, le jeton glissé dans un message
de refus. **Les douze font rougir au moins une garde**, et le fichier est
restauré après chaque essai.

## Ce que ce module ne fait PAS

- **L'étape 11 (provenance)** et **l'étape 12 (quota)** ne sont pas ici, même si
  le § 20 les décrit dans la même section. Elles ont leurs dossiers.
- **L'outil MCP `ops.policy.tighten` et la route de desserrage** ne sont pas ici
  non plus : ce module fournit `resserrer()` et `desserrer()`, la couche
  transport les expose.
- **Aucun accès à PostgreSQL.** Les interfaces sont déclarées dans `depot.ts` et
  `confirmation.ts`, avec des implémentations en mémoire.

Les écarts du CDC relevés en chemin sont dans `DEPS.md`.
