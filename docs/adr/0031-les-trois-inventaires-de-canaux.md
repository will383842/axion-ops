# ADR 0031 — Trois inventaires de canaux, et la destination JOURNAL cesse d'être implicite

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/types.ts` (`StatutDeCanal`,
  `STATUT_DES_CANAUX_DE_CONTEXTE` et ses deux nouveaux jumeaux),
  `core/chaine/orchestrateur.ts` (`AppelEntrant`, `IdentiteAppelante`)
- **Sources** : cahier des charges v6, § 20 (anti-exfiltration), § 31 (aucun
  contenu au journal) ; ADR 0020, ADR 0029

---

## Le défaut, tel que le lot 1d l'a mesuré

`STATUT_DES_CANAUX_DE_CONTEXTE` est un
`Readonly<Record<keyof ToolContext, StatutDeCanal>>` : sa totalité est tenue par
le compilateur. Solide — **pour la destination « adaptateur »**.

Mais la question posée par les deux épreuves précédentes est plus large : _un
champ qui atteint l'adaptateur **ou le journal** sans passer par le schéma_. Or :

- `AppelEntrant` porte cinq valeurs que **l'appelant choisit**, et aucune n'est
  classée ;
- `IdentiteAppelante` n'est couverte que par **homonymie** — ses champs portent
  les mêmes noms que ceux du `ctx`. Le jour où l'un des deux types en gagne un
  que l'autre n'a pas, la coïncidence cesse et **rien ne le dit**.

Mesuré :

> `[N2 · totalité] 11 champ(s) de SOURCE confronté(s) à 9 champ(s) classé(s) ·
6 couvert(s) par HOMONYMIE · 5 classé(s) par RIEN : AppelEntrant.nomComplet,
.input, .idempotencyKey, .curseur, .jetonDeConfirmation`

Et l'ADR 0029 vient de montrer que ce n'est pas théorique : `nomComplet` et
`principal` atteignent le journal verbatim, et une ligne refusée par la garde du
§ 31 fait perdre la trace entière.

---

## Décision

### 1 · Deux inventaires de plus, tenus par le compilateur de la même façon

```
STATUT_DES_CANAUX_D_APPEL:    Readonly<Record<keyof AppelEntrant, StatutDeCanal>>
STATUT_DES_CANAUX_D_IDENTITE: Readonly<Record<keyof IdentiteAppelante, StatutDeCanal>>
```

La totalité doit être tenue **des deux côtés**, sans quoi un champ ajouté demain
n'obligera personne à **décider** d'où il vient ni où il va.

L'homonymie cesse d'être une couverture : c'est la seule façon de la faire cesser
qui ne dépende pas de la vigilance.

### 2 · Le régime cesse de porter une seule destination

C'est le fond du défaut, et un quatrième régime n'en serait pas la réponse. Un
champ a **deux** destinations, et un même champ peut être fermé vers l'une et
ouvert vers l'autre — `nomComplet` en est l'exemple exact : borné à l'étape 6
côté adaptateur, verbatim côté journal.

`StatutDeCanal` gagne donc une seconde déclaration :

| `versLeJournal` | Ce que ça veut dire                                             |
| --------------- | --------------------------------------------------------------- |
| `jamais`        | le champ n'atteint aucune colonne d'`ops_audit`                 |
| `borné-par`     | il l'atteint, et la borne est **nommée** — p. ex. `FORMES.tool` |
| `verbatim`      | il l'atteint tel quel                                           |

**`verbatim` est une ANOMALIE de la garde, pas un état toléré.** C'est exactement
le défaut bloquant du lot 1d, et le déclarer sans le refuser reviendrait à
l'inscrire au registre des choses normales.

`borné-par` **nomme** la borne : une borne qu'on ne peut pas nommer est une borne
qu'on croit avoir. C'est ce que l'ADR 0029 dérive de `FORMES`.

### 3 · La garde confronte les **clés lues dans le source**, pas les clés du type

Le compilateur tient la totalité de chaque record. Il ne dit pas si les **trois**
records couvrent l'ensemble des champs qui atteignent une destination : c'est ce
que la garde doit mesurer, et elle le fait par la même fonction de lecture de
source que le contrôle 7 du § 09.

Elle **annonce** : champs de source confrontés, champs classés, **combien par
homonymie** (la réponse doit devenir zéro), et combien classés par rien.

⚠️ **Le compte « par homonymie » ne disparaît pas de l'annonce quand il tombe à
zéro.** Un compte qu'on retire est un compte qu'on ne peut plus voir remonter.

### 4 · Ce que cette ADR ne prétend pas fermer

Elle classe les canaux ; elle ne borne aucune valeur. Les bornes elles-mêmes sont
l'objet de l'ADR 0029 pour `principal` et `tool`, et de l'étape 8 pour `input`.
Un inventaire complet et juste **n'empêche rien** tout seul : il rend
obligatoire de décider, et c'est tout ce qu'il fait. Le confondre avec une
protection serait la même erreur que lire une couleur de garde au lieu de son
compte.

---

## Conséquences acceptées

- Trois records au lieu d'un : un champ ajouté à l'un des trois types **ne
  compile plus** tant qu'il n'est pas classé. C'est le coût recherché.
- `StatutDeCanal` gagne un champ obligatoire, donc les entrées existantes doivent
  toutes être complétées. C'est un travail de relecture, une entrée à la fois, et
  il ne doit **pas** être expédié par un défaut : un `versLeJournal` optionnel
  avec une valeur implicite reproduirait exactement l'implicite qu'on retire.
