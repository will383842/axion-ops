# ADR 0043 — Le plafond de 40 se refuse à l'étape 7, et le sosie est supprimé

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `core/chaine/orchestrateur.ts`, `core/__tests__/integration.spec.ts`,
  `core/profiles/budget.ts`
- **Sources** : ADR 0036 (décision 1, restée non atterrie) ; cahier des charges
  v6, § 14 ; rapport de recette du lot 3, constat n° 2

---

## Le fait

L'ADR 0036 décide, décision 1, que le plafond de 40 outils **servis** par profil
se refuse **à l'étape 7**, dans le même bloc qu'`estServi`, et pas seulement en
intégration continue. Elle est marquée « Statut : acceptée ». **Elle n'a pas
atterri.**

Mesures transcrites :

- `core/chaine/orchestrateur.ts`, bloc de l'étape 7 : **453 caractères**, il ne
  fait que `if (!estServi(outil, profil))`. `PLAFOND_OUTILS_PAR_PROFIL` n'y
  paraît pas.
- `mesurerBudgetProfil` : **zéro appelant de production**, toutes ses occurrences
  sont dans `core/profiles/budget.ts`, sa ré-exportation, et le registre.
- `core/__tests__/integration.spec.ts` porte **2 occurrences** de
  `PLAFOND_OUTILS_PAR_PROFIL`, dans une **réimplémentation** de la règle, sous le
  commentaire « § 14 — le plafond se refuse ICI, pas seulement en CI ».

> **Le dépôt éprouve le SOSIE de la règle au lieu de la règle.** Un test qui
> réimplémente ce qu'il garde est vert quelle que soit la production.

L'ADR 0036 désigne elle-même cette réimplémentation comme « à SUPPRIMER ». Le
rapport du lot 3 laissait deux voies ouvertes — poser le refus, **ou** écrire
l'`it.fails` qui nomme la dette — en exigeant « l'un des deux, pas ni l'un ni
l'autre ».

## La décision

### 1 · L'endroit exact

Le refus se prononce dans `core/chaine/orchestrateur.ts`, **après** le bloc
`if (!estServi(outil, profil)) { … }` et **avant**
`franchir(ETAPE_PROFIL_CHAINE.numero)`.

Pourquoi cet ordre, et il n'est pas indifférent :

- **après `estServi`** — un outil qui n'est de toute façon pas au profil doit se
  voir refuser pour cette raison-là, qui est exacte, et non pour un dépassement
  de plafond qui parlerait d'autre chose. Un message qui nomme la mauvaise cause
  coûte plus qu'un message absent ;
- **avant `franchir`** — franchir l'étape 7 puis la refuser plus loin ferait
  porter le refus par une étape qui n'est pas la sienne, et le journal
  d'intention mentirait sur le point d'arrêt.

Le refus lit `ETAPE_PROFIL_CHAINE` et le code que l'ADR 0036 a déjà arrêtés — il
ne les réécrit pas. Le **message** porte les deux nombres du verdict : combien
d'outils sont servis, et le plafond.

### 2 · La réimplémentation d'`integration.spec.ts` est SUPPRIMÉE

Le sosie ne se corrige pas, il se retire. Tant qu'il est là, la suite est verte
sur une production qui ne porte pas la règle — c'est exactement l'état qu'on
vient de mesurer.

**L'ordre des deux gestes est imposé** : poser le refus **d'abord**, retirer le
sosie **ensuite**. L'inverse laisserait le dépôt, pendant un temps, sans aucune
épreuve du plafond ni en production ni en test.

### 3 · La garde exigée : 41 refuse, 40 passe

Un seul témoin ne suffit pas. Il faut **les deux bornes** :

- un catalogue de **41 outils servis** dans le profil actif → **refus** à
  l'étape 7, code et étape lus du verdict ;
- un catalogue de **40 outils servis** → **passage**.

Sans la seconde, un refus posé sur `>= 0` serait vert.

### 4 · La dette est NOMMÉE en attendant

Deux `it.fails` vivent dans
`core/epreuve/lot4-decisions-acceptees-non-atterries.temoin.spec.ts` :

- « le bloc de l'étape 7 de l'orchestrateur lit `PLAFOND_OUTILS_PAR_PROFIL` » ;
- « la réimplémentation du plafond a QUITTÉ `core/__tests__/integration.spec.ts` ».

Chacun **isole le bloc** et **annonce le nombre de caractères lus** : un
`it.fails` est vert dès qu'une de ses assertions échoue, y compris pour un
chemin déplacé, et le compte est ce qui distingue « la décision manque » de « je
n'ai rien pu lire ». Les deux sont inscrits au registre comme `assertion`
(ADR 0041) : **les retirer sans retirer l'entrée fait rougir G4.**

Ils **rougissent le jour où la décision atterrit**, forçant le correcteur à
retirer le `.fails`. C'est le seul mécanisme de ce dépôt qui rende une dette
impossible à laisser derrière soi.

## Ce qu'on a rejeté

- **Se contenter de l'`it.fails`.** L'ADR 0036 est acceptée depuis un lot ; la
  laisser en dette une seconde fois reviendrait à faire de « acceptée » un mot
  sans conséquence.
- **Refuser dès `mesurerBudgetProfil` au montage.** Le plafond porte sur le
  profil **actif au moment de l'appel**, que le montage ne connaît pas.
- **Inventer un code de refus propre au dépassement.** L'ADR 0036 a tranché : le
  § 15 n'en énumère aucun, et un code voisin mentirait sur la cause. C'est le
  **message** qui distingue, et il porte les nombres.
