# ADR 0017 — L'effet extérieur entre dans la ligne, et `outcome` ne gagne aucune valeur

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1c)
- **Portée** : `core/audit/journal.ts` (`issue`, `avecJournal`, affineurs),
  `core/audit/vocabulaire.ts` (`OUTCOMES`, `ContenuLigne`,
  `PorteurDEffetExterieur`), `core/audit/canonique.ts` (`CHAMPS_COUVERTS`),
  `core/chaine/orchestrateur.ts` (étape 14), `prisma/schema.prisma`
  (`ops_audit`)
- **Sources** : CDC v6 § 11 (invariant de sortie), § 12 (`ops_audit`), § 13.3
  (cascade de compaction), § 20 (« ce qui compte comme effet extérieur »), § 24
  (observabilité), objectif O6 — et **ADR 0002** (l'empreinte chaînée)

---

## Le défaut, et il est sous témoin

`avecJournal` dérive le triplet de la ligne du **seul GENRE** de la
terminaison :

```ts
if (terminaison.genre === "refus") {
  return { decision: "refusé", stepDenied: terminaison.etape, outcome: "non-exécuté" };
}
```

Or **l'étape 14 est la seule dont le refus arrive APRÈS l'effet extérieur** :
`result_too_large` se prononce sur ce qui **sort**, pas sur ce qui s'est passé.
Un `send` **parti** dont la réponse dépasse le plafond est donc journalisé
« refusé / non-exécuté ».

Témoin sous `it.fails`, `core/epreuve/chaine-chemins-de-panne.spec.ts` :

```
[garde journal après l'effet] 1 ligne mesurée — effets extérieurs RÉELS : 1,
effect journalisé : send, decision : refusé, outcome : non-exécuté, stepDenied : 14
```

La ligne existe, l'invariant du § 11 tient — **elle est fausse**. Le § 24 range
cet envoi parmi les appels qui n'ont rien fait, et une revue des effets
extérieurs conduite sur `ops_audit` ne le verra jamais. C'est l'objectif O6 qui
tombe.

---

## Décision, en deux moitiés indépendantes

### 1 · `outcome` ne gagne AUCUNE valeur — la dérivation est corrigée

Le vocabulaire était déjà juste. `OUTCOMES` définit `erreur` comme
« **incompactable (`result_too_large`)**, amont injoignable, ou exception », et
`non-exécuté` comme « refusé **AVANT l'étape 14** : rien n'a tourné ».

C'est la **dérivation** qui violait ces deux définitions à la fois. Elle est
corrigée :

> un refus dont l'étape est celle de l'**exécution** vaut `outcome: "erreur"`.

Le numéro se **dérive** d'`APPEL_STEPS` par la clé `"execution"` — jamais un `14`
écrit à la main, qui deviendrait faux à la première étape insérée.

**Aucune rupture de format.** L'arbitrage annoncé — « quelle valeur d'`outcome`
ajouter » — n'avait pas lieu d'être : le mot existait.

### 2 · Le fait « un effet extérieur a eu lieu » devient une colonne

```
ops_audit.externalEffect : boolean   // entre dans CHAMPS_COUVERTS
```

Posée par la **seule** étape 14, via un signal à sens unique
(`SignalEffetExterieur`), croisée avec `estEffetExterieur()` de
`core/policy/effet.ts` — dérivée, jamais recopiée.

---

## Pourquoi une colonne, et pas une valeur d'`outcome` de plus

Trois raisons, et la première suffirait.

**1 · Une valeur d'`outcome` ne couvrirait qu'une des deux fuites.** L'objectif
O6 cherche tous les effets extérieurs. Il en manque deux familles, pas une :

| Fuite                                                                                       | `decision`   | `outcome`  | Ce qu'une valeur d'`outcome` dédiée ferait                            |
| ------------------------------------------------------------------------------------------- | ------------ | ---------- | --------------------------------------------------------------------- |
| Refus de l'étape 14 après le départ de l'effet                                              | `refusé`     | à corriger | la couvrirait                                                         |
| **Exception** après le retour de l'adaptateur (compaction, masquage, clôture d'idempotence) | `interrompu` | `erreur`   | **ne la couvrirait pas** — `outcome` n'est pas consulté sur ce chemin |

La seconde n'est pas hypothétique : `orchestrateur.ts` écrit lui-même, dans sa
borne, qu'« un appel exécuté avec succès dont la réservation ne peut pas être
close devient un “interrompu” — le journal dira “erreur” d'un appel dont l'effet
a bien eu lieu ».

**2 · `outcome` décrit ce qui REVIENT, pas ce qui EST SORTI.** Y loger le second
serait exactement la faute que le § 13.2 dénonce pour `truncated` /
`sourceIncomplete` : deux étages sous un seul mot. Le socle ne s'accorde pas ce
qu'il refuse aux adaptateurs.

**3 · La question qu'on pose est binaire.** « Quelque chose est-il sorti ? » se
répond par oui ou non, sur **toutes** les lignes, y compris `autorisé`. Une
valeur d'`outcome` ne répond que sur les lignes où elle apparaît.

---

## Pourquoi maintenant

`externalEffect` **entre dans l'empreinte chaînée** (ADR 0002, `CHAMPS_COUVERTS`).
La fenêtre où cela ne coûte rien est ouverte tant qu'**aucune ligne réelle
n'existe** — aucune base ne tourne. Après le premier chaînage, l'ajouter aurait
exigé une clôture de rupture et **deux régimes de vérification dans le même
journal**.

⚠️ **Le coût n'est pas par colonne, il est par FRANCHISSEMENT de cette fenêtre.**
Trois colonnes sont aujourd'hui connues comme manquantes :

1. `externalEffect` — celle-ci ;
2. l'**état du coffre** sur un refus d'étape 0 — ADR 0005, « ce qui reste
   ouvert » : `absent` et `verrouillé` ne se réparent pas du même geste, et la
   ligne ne les distingue pas ;
3. ce que l'ADR 0002 § 4.1 laisse ouvert sur la résistance à une réécriture
   complète.

**Elles devraient atterrir dans le même lot.** Cet ADR n'en tranche qu'une — la
seule dont il avait mandat — et le dit, plutôt que de laisser croire que la
fenêtre reste ouverte indéfiniment.

---

## Ce que la décision EXCLUT

- **Ajouter une valeur à `OUTCOMES`.** Le mot existait ; en ajouter un aurait
  rompu le format pour rien, et laissé la seconde fuite ouverte.
- **Déduire `externalEffect` d'`effect === "send"`.** Un `send` refusé à l'étape
  10 n'a rien envoyé. La déduction serait vraie sur la moitié des lignes et
  fausse sur l'autre, sans qu'on puisse dire laquelle.
- **Un signal `(survenu: boolean) => void`.** Il pourrait **repasser** la ligne à
  `false` : un chemin de sortie écrit six mois plus tard effacerait le fait qu'un
  envoi est parti. Le signal est un **cliquet sans argument** — la seule
  direction possible est celle qui accuse.
- **Deux appelants du signal.** C'est le motif de l'affineur d'`argHash` :
  « il n'existe qu'un endroit où la valeur change ». Deux seraient deux occasions
  de désaccord, et le compilateur n'en verrait aucune.
- **Faire porter le fait par `Refus`.** Il faudrait alors que **chaque** refus,
  des étapes 0 à 13, écrive `externalEffect: false` — soit quatorze occasions de
  se tromper, exactement ce qu'`ARG_HASH_NON_VALIDE` a été nommé pour éviter. Le
  cliquet part de `EFFET_EXTERIEUR_NON_SURVENU` et n'en sort que par un appel.
- **Corriger `outcome` sans ajouter la colonne.** L'inverse aussi. Le premier
  corrige un **mot**, le second ajoute un **fait** ; l'un sans l'autre laisse O6
  faux.

---

## Ce que le constructeur ② doit écrire

1. `issue()` reçoit de quoi savoir si l'étape refusante est celle de
   l'exécution, et rend `erreur` dans ce cas. Le numéro dérive d'`APPEL_STEPS`.
2. Le paramètre unique de `corps` devient `AffineursDAppel`
   (`{ affinerArgHash, signalerEffetExterieur }`) — objet, pas second paramètre
   positionnel : un troisième affineur viendra.
3. `externalEffect` : `ContenuLigne` (par `extends PorteurDEffetExterieur`),
   `CHAMPS_COUVERTS`, `ops_audit`. **Les trois ensemble** — un champ absent de
   `CHAMPS_COUVERTS` se modifie après coup sans casser la chaîne, et
   `derivation.spec.ts` rougit s'il apparaît au schéma sans être ni couvert ni
   exclu.
4. L'orchestrateur appelle le signal **juste après le retour de l'adaptateur**,
   et seulement si `estEffetExterieur(outil.effect)`.
5. Le témoin sous `it.fails` de `chaine-chemins-de-panne.spec.ts` **bascule en
   `it()`**, et son assertion se durcit : `outcome` vaut `erreur` **et**
   `externalEffect` vaut `true`. Ne pas le supprimer, ne pas l'affaiblir.

### Les trois gardes

| Garde                                                                                                | Ce qu'elle annonce                                                        | Le témoin qui la fait rougir                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **G1 — un envoi parti n'est jamais « non-exécuté ».** Le témoin du lot 1b, basculé.                  | effets extérieurs réels · `decision` · `outcome` · `stepDenied`           | Rétablir la dérivation par le seul genre.                                           |
| **G2 — l'exception post-effet est vue.** Faire lever la clôture d'idempotence après un `send` servi. | lignes écrites · `decision` · `externalEffect`                            | Un `externalEffect` déduit d'`effect` le manquerait : `decision` vaut `interrompu`. |
| **G3 — le cliquet ne redescend pas.** Appeler le signal, puis parcourir tous les chemins de sortie.  | chemins de sortie parcourus · lignes dont `externalEffect` est resté vrai | Un signal à paramètre booléen : le compte tombe.                                    |

Et la garde existante de `derivation.spec.ts` — champs du schéma **confrontés**
à `CHAMPS_COUVERTS` ∪ `CHAMPS_EXCLUS` — n'a **rien à retoucher** : elle rougira
d'elle-même si la colonne atterrit sans entrer dans l'empreinte. C'est
exactement ce pour quoi elle a été écrite.

---

## Conséquences acceptées

1. **`externalEffect` vaut `false` quand l'adaptateur LÈVE après avoir envoyé.**
   L'étape 14 ne peut pas le savoir. Ce champ dit ce que le socle **sait** ; la
   ligne d'INTENTION (`PorteeDIntention`, non armée) dit ce qu'il a **tenté**.
   Les deux ne se remplacent pas, et c'est écrit dans le type.
2. **Une ligne de plus dans l'empreinte.** Toute empreinte calculée avant cette
   colonne devient invérifiable — sans conséquence : aucune n'existe.
3. **`ops_audit` porte désormais deux dimensions du même appel** — ce qui a été
   décidé (`decision`), ce qui est revenu (`outcome`), et ce qui est sorti
   (`externalEffect`). Le § 24 doit croiser les trois ; une métrique qui n'en lit
   qu'une reste fausse, et c'est à porter au tableau de bord.

---

## Ce qui reste OUVERT

- **Les deux autres colonnes de la même fenêtre** (état du coffre, ADR 0002
  § 4.1). Voir « pourquoi maintenant ».
- **La ligne d'INTENTION reste NON ARMÉE.** `INTENTION_NON_ARMEE` est câblée, et
  c'est une décision écrite, pas un oubli. Tant qu'elle l'est, la borne du
  point 1 ci-dessus n'est pas couverte : un adaptateur qui envoie puis lève reste
  invisible.
