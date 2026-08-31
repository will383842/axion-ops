# `docs/adr/` — les décisions d'architecture du socle

Une décision par fichier, numérotée sur quatre chiffres, jamais renumérotée.
Une décision qu'on remplace se remplace par un ADR NEUF qui la supersède ; on ne
réécrit pas l'ancien, sans quoi la trace de ce qu'on croyait à l'époque
disparaît, et avec elle la seule chose qui permet de comprendre pourquoi le code
a la forme qu'il a.

## Ce qui garde ce dossier

**Aucun ADR ne peut atterrir ici sans dire quel symbole porte sa décision.**
`core/coutures/registre.spec.ts` (garde G2, ADR 0019) dérive l'ensemble des ADR
du **contenu de ce dossier** — jamais du registre — et rougit dans les deux
sens : un ADR sans entrée au registre, une entrée qui désigne un ADR inexistant.

Elle lit aussi le **statut** dans l'en-tête de chaque fichier, à la forme
`- **Statut** : …`. Si cette forme change, le compte des statuts lus s'effondre
et la garde le DIT, au lieu de devenir muette.

## La plage 0006 → 0009 est LIBRE — elle n'a jamais été attribuée

Les numéros vont de 0001 à 0005, puis de 0010 à 0022. **Le trou est réel, et il
ne cache rien** :

- aucun fichier `0006-*` à `0009-*` n'a jamais existé — vérifié sur l'historique
  complet (`git log --all --diff-filter=D -- 'docs/adr/*'` ne rend aucune
  suppression) ;
- aucun fichier du dépôt ne mentionne ces numéros (`docs/`, `README.md`,
  `CHANGELOG.md`, sources comprises).

Les ADR 0010 à 0013 ont été ouverts d'un bloc, à la dizaine, pour les quatre
sujets du lot 1b ; les quatre numéros précédents n'ont simplement pas été
consommés. **Ils sont disponibles pour un ADR neuf.**

> ⚠️ **POURQUOI CETTE LIGNE EXISTE.** Dériver l'ensemble des ADR du contenu du
> dossier est le bon choix, et il a une borne : un ADR écrit puis perdu ne
> laisse **aucune trace** — son numéro manque, et rien ne distingue « jamais
> attribué » de « disparu ». La garde G2 compte donc les trous et les annonce
> (`trousDeNumerotation`), et ce paragraphe dit ce qu'il en est de ceux-là.
> Sans lui, quatre décisions manquantes seraient indiscernables d'une plage
> réservée.

## L'en-tête attendu

```
# ADR NNNN — titre en une phrase

- **Statut** : acceptée | proposée | remplacée par ADR NNNN
- **Date** : AAAA-MM-JJ
- **Décideur** : …
- **Portée** : les dossiers et fichiers que la décision touche
- **Sources** : les paragraphes du cahier des charges qui la fondent
```
