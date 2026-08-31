# ADR 0029 — La forme du `principal` et celle du nom d'outil : deux champs, deux réponses

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/auth/contrat.ts` (`PrincipalEmis`),
  `core/audit/contenu.ts` (une dérivation sœur de `bornesDeListeDuJournal`),
  `core/chaine/orchestrateur.ts` (l'en-tête vivant, l'étape 6),
  `core/transport/http.ts` (étape 4), `core/types.ts`
  (`STATUT_DES_CANAUX_DE_CONTEXTE.principal`)
- **Sources** : cahier des charges v6, § 11 (invariant de sortie), § 12
  (`ops_audit`, `ops_quota`, `ops_runtime`), § 24 (métrique de refus), § 31
  (aucun contenu au journal) ; ADR 0001, ADR 0002, ADR 0026, ADR 0027

---

## Le défaut, tel que le lot 1d l'a mesuré

**Une terminaison peut ne laisser aucune ligne.** `verifierAucunContenu()` (§ 31)
borne des colonnes dont la valeur ne vient pas du socle. Deux sont normalisées en
amont par l'étape 14, deux sont bornées à l'admission par le registre, et **deux
ne le sont par rien** :

- `tool`, qui vient d'`AppelEntrant.nomComplet` ;
- `principal`, qui vient d'`IdentiteAppelante`.

L'en-tête vivant les pose verbatim, la garde du § 31 refuse la ligne, et
l'écriture lève **hors** du `try` de `journaliser` : **zéro ligne d'`ops_audit`**.

Rien ne sort — la porte est bien fermée. C'est la **trace** qui est perdue, et
avec elle l'invariant du § 11 (« toute terminaison écrit une ligne portant le
numéro de l'étape qui a refusé »), la métrique de refus du § 24 et l'objectif O6.

Le lot 1d a délibérément laissé le correctif ouvert, parce qu'il exigeait deux
arbitrages : **quelle valeur de repli**, et **un `principal` malformé refuse-t-il
l'appel ou borne-t-il seulement sa trace ?** Les combler par une supposition
aurait été le geste que ce lot existait pour proscrire.

Ces deux arbitrages étaient indécidables avant l'émetteur.
`STATUT_DES_CANAUX_DE_CONTEXTE.principal` l'écrit noir sur blanc : « à trancher
**avec** l'émetteur, pas avant : une borne posée ici serait devinée ». L'émetteur
est décidé (ADR 0027). C'est donc maintenant.

---

## Décision

### 1 · Le `principal` est borné **à la source**

Le socle n'a que **deux sources** de principal, et il n'en aura pas d'autre :

- l'émetteur — `ops_token.principal`, écrit à l'octroi ;
- `PRINCIPAL_STDIO`, une constante conforme par construction, dont
  `orchestrateur.spec.ts` mesure déjà la forme.

**L'émetteur refuse d'émettre un jeton dont le principal ne passe pas la forme du
journal.** Borner là, c'est borner partout. Le type `PrincipalEmis`
(`core/auth/contrat.ts`) porte cette garantie à la compilation : sa marque est un
`unique symbol` non exporté, donc aucun module ne peut en fabriquer un sans
passer par l'émetteur.

`STATUT_DES_CANAUX_DE_CONTEXTE.principal` cesse d'être `ouvert-signalé` et devient
`fermé-par-le-socle`, avec le motif réécrit.

### 2 · Un `principal` malformé rencontré malgré tout **refuse l'appel**

C'est le premier arbitrage, et la réponse n'est pas « borner la trace ».

Le `principal` n'est pas seulement le « qui » d'une ligne de journal. Il est la
**clé d'ancrage** de deux mécanismes de sûreté :

- `ops_quota`, unicité `(window, tool, principal)` ;
- `ops_runtime`, un profil actif **par principal**.

Un repli — quelle que soit la valeur choisie — **fusionnerait deux principaux
distincts dans un même compteur de quota** et leur donnerait le même profil
actif. Ce n'est pas une perte de trace : c'est un **désarmement de limite**, et
une confusion de surface exposée. Le refus est donc la seule réponse.

**Où le refus est prononcé : à l'étape 4**, en HTTP. C'est là que la ligne
`ops_token` est relue, donc là que le principal est lu — donc là qu'il se juge.
Aucune étape neuve n'est créée, et le refus porte le `401` que l'étape 4 porte
déjà. En stdio, la question ne se pose pas : `PRINCIPAL_STDIO` est une constante.

**La ligne de refus existe, et elle ne ment pas.** Elle porte un principal
**réservé** — de la famille de `stdio:local`, reconnaissable, conforme à la forme
du journal, et qu'aucun émetteur ne peut produire. Aucun quota réel n'est touché,
et l'invariant du § 11 tient : une terminaison, une ligne, un numéro d'étape.

### 3 · Le nom d'outil est **borné**, pas refusé — et le motif de la différence est écrit

C'est le second arbitrage, et la réponse est l'inverse de la première. Il faut
donc dire pourquoi, sans quoi l'une des deux sera « corrigée » pour ressembler à
l'autre.

Un `nomComplet` inconnu ou malformé est **déjà** un refus : l'étape 6 (« outil
existe et activé »). La question n'est pas s'il faut refuser — il l'est — mais ce
que la ligne écrit.

**Aucun compteur n'est ancré sur `tool` pour un outil qui n'existe pas.** Il n'y
a donc rien à fusionner, aucune limite à désarmer : le seul enjeu est la trace,
et perdre la trace est strictement pire que la borner. Le nom est donc **normalisé
à l'étape 6, avant toute recherche au catalogue**, et la ligne porte le nom borné.

### 4 · Les deux bornes **dérivent de `FORMES`**, jamais réécrites

`core/audit/contenu.ts` exporte déjà `bornesDeListeDuJournal(champ)` pour la
famille des listes, avec la propriété qui compte : elle **lève** si le genre de
la colonne change, au lieu de rendre des bornes fantaisistes.

Une fonction sœur fait la même chose pour la famille des identifiants — elle rend
la borne de `principal` et de `tool`, et lève si l'un des deux cesse d'être un
identifiant.

⚠️ **Ne pas écrire une seconde expression à la main, et ne pas corriger seulement
`nomComplet`.** C'est ainsi que le troisième champ de la famille sera oublié de la
même façon : la dérivation est ce qui l'attrape.

⚠️ **Ne pas assouplir `verifierAucunContenu()`.** Elle a raison. C'est l'amont qui
était faux.

---

## Ce que la garde doit tenir

- **Le témoin de perte de ligne du lot 1d bascule en `it()`.** Il vit dans
  `core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts`, section N3, en
  `it.fails`, et il sait rougir (mutation M8 posée puis retirée). C'est **lui**
  qui prouve la fermeture, pas un test neuf : un test écrit après le correctif ne
  prouve que le correctif.
- **Son témoin de capacité apparié reste**, et il est indispensable : sans lui,
  « zéro ligne » se lirait « ce socle ne journalise pas les refus ».
- **La dérivation depuis `FORMES` a son propre témoin** : changer le genre d'une
  colonne doit faire **lever**, pas rendre une borne.
- **Le principal réservé du refus est confronté à la forme du journal**, avec le
  compte annoncé — sinon la valeur choisie pour réparer la perte de ligne
  pourrait, elle-même, ne pas passer la garde.

---

## Conséquences acceptées

- Un jeton émis avant cette décision peut porter un principal que l'étape 4
  refuse désormais. Il n'en existe aucun — le socle n'a jamais émis. Le dire ici
  évite qu'on invente une compatibilité ascendante qui n'a pas d'objet.
- Deux champs de la même famille reçoivent deux réponses opposées. C'est
  inhabituel, et c'est justifié par ce que chacun ancre. Le motif est écrit dans
  les deux sens, à l'endroit du code où chacun s'applique — sinon la prochaine
  revue les uniformisera.
