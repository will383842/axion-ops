# ADR 0026 — L'identifiant de ressource qui sert d'audience

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/auth/ressource.ts`, `.env.example`
  (`OPS_RESOURCE_INDICATOR`), étape 3 de la chaîne d'appel, colonne
  `ops_token.audience`, étage 3 de `ETAGES_DU_DEMARRAGE`
- **Sources** : cahier des charges v6, § 19.1 ; § 11 (étape 3) ; RFC 8707 ;
  ADR 0001

---

## La décision qui devait être prise « avant le lot 1 »

Le § 19.1 l'écrit, et l'ADR 0001 le répète :

> **L'identifiant de ressource qui sert d'audience se décide et s'écrit avant le
> lot 1. L'étape 3 de la chaîne n'a aucun sens sans lui.**

Elle ne l'avait pas été. `.env.example` en portait l'emplacement et une valeur
factice sur `stub.invalid`, avec la mention « À DÉCIDER ET ÉCRIRE AVANT LE
LOT 1 ». L'étape 3 existait donc dans `APPEL_STEPS` sans avoir rien à comparer.

---

## Décision

**L'audience est l'URL absolue de la ressource MCP : l'origine du socle suivie du
chemin qui sert `POST /api/mcp`. Elle est portée par `OPS_RESOURCE_INDICATOR`,
hors du dépôt. Le dépôt porte sa FORME, pas sa valeur.**

### Elle n'est pas l'émetteur, et c'est tout l'objet de la RFC 8707

L'ADR 0001 sert `/auth/*` sur un **domaine distinct**. `iss` (étape 2) désigne
l'émetteur ; `aud` (étape 3) désigne la ressource. Deux valeurs, deux variables,
jamais la même. Les confondre rendrait l'étape 3 **tautologique** : tout jeton
émis ici passerait, ce qui est exactement ce que l'indicateur de ressource existe
pour empêcher.

### Cinq contraintes de forme, comptées séparément

Une expression régulière unique aurait rendu « conforme » ou « non conforme »
sans dire laquelle a mordu — et l'étage 3 **refuse le démarrage** : un message
qui ne nomme pas la contrainte violée envoie chercher au mauvais endroit (§ 25).

| Contrainte          | Exigence                                            |
| ------------------- | --------------------------------------------------- |
| schéma              | `https`, ou `http` **uniquement** sur boucle locale |
| aucune requête      | pas de `?`                                          |
| aucun fragment      | pas de `#`                                          |
| aucune barre finale | pas de `/` terminal                                 |
| chemin non vide     | un chemin, de préférence `/api/mcp`                 |

**Pourquoi `http` reste admis sur boucle locale** : le § 23 range le local en
environnement à part entière — « transport stdio, coffre en fichier local ». Le
critère de recette de ce lot est que le socle **démarre en local avec des valeurs
factices**. Exiger TLS rendrait la seule configuration démarrable impossible à
écrire, et la première chose que quelqu'un ferait serait de désactiver la
contrainte entière.

**Pourquoi pas de requête, pas de fragment, pas de barre finale** : ce sont les
trois variantes d'écriture qui produisent deux valeurs pour une seule intention.
Un fragment, en outre, n'est jamais transmis au serveur : une audience qui en
porterait un ne serait jamais celle que la ressource peut confronter.

**Pourquoi un chemin non vide** : une audience réduite à l'origine désignerait le
socle entier — console et émetteur compris — alors que le jeton du connecteur ne
doit valoir que pour la ressource MCP.

### La comparaison de l'étape 3 est une égalité exacte de chaînes

Ni préfixe, ni normalisation d'URL, ni insensibilité à la casse de l'hôte. Une
normalisation est une surface d'égalité **approchée** : chaque règle qu'on y
ajoute pour être accommodant est une paire de valeurs distinctes rendues
équivalentes, et l'étape 3 n'existe que pour dire qu'elles ne le sont pas.

### Un jeton sans audience est refusé ; un jeton à audiences multiples aussi

La RFC 8707 permet plusieurs indicateurs. **Le socle n'en admet qu'un en v1.**
Motif : une audience multiple oblige l'étape 3 à décider « l'une suffit-elle ? »,
et la réponse permissive est celle qu'on écrit sans y penser. Une v2 qui en
voudra plusieurs le décidera explicitement.

---

## Ce que la garde doit tenir

- **la forme, contrainte par contrainte**, avec pour chacune un témoin qui la
  viole seule : un verdict qui ne dirait que « non conforme » ne prouverait pas
  que les cinq mordent, et quatre d'entre elles pourraient être mortes ;
- **le compte de contraintes confrontées**, annoncé ;
- **que la valeur factice du dépôt passe** — sans quoi le critère « démarrer en
  local avec des valeurs factices » serait faux, et personne ne le saurait avant
  d'essayer ;
- **qu'aucune valeur réelle n'entre dans le dépôt** : `.env.example` reste sur
  `stub.invalid`, domaine réservé (RFC 2606) qui ne résout jamais.

---

## Conséquences acceptées

- Changer le domaine du socle change l'audience, donc **invalide tous les jetons
  en circulation** à l'étape 3. C'est le comportement voulu : un jeton émis pour
  une ressource ne vaut pas pour une autre. Le remède est de réémettre, pas
  d'assouplir la comparaison.
- La colonne `ops_token.audience` porte donc une chaîne qui peut devenir
  historique. Elle n'est jamais réécrite : une audience corrigée après coup
  effacerait la seule trace de ce pour quoi le jeton avait été émis.
