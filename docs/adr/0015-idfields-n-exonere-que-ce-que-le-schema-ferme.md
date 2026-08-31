# ADR 0015 — `idFields` n'exonère plus rien : le schéma seul referme un champ

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1c)
- **Portée** : `core/chaine/etape-11-provenance.ts`
  (`analyserArgumentsDuSchema`), `core/chaine/etapes.ts`
  (`OutilDuCatalogue.idFields`), `core/adapter-kit/types.ts`,
  `core/adapter-kit/manifest.ts`, `core/registry/enregistrer.ts`
- **Sources** : CDC v6 § 09 (contrat d'adaptateur, `idFields`), § 12 (règle 3,
  `recordIds` n'est pas anonyme), § 20 (trois règles d'intégrité — étiquetage),
  § 27 et § 28 (les adaptateurs réels)

---

## Le défaut

`idFields` est **déclaré par l'adaptateur et confronté à rien** — ni au schéma,
ni au type du champ. `analyserDefinition()` n'en vérifie que les doublons.

Or l'étape 11 le lit pour **retirer** un champ de la liste des arguments libres :

```ts
if (identifiants.has(nom)) continue; // ← le champ n'est plus surveillé
```

Conséquence, mesurée par le témoin
`core/epreuve/exfiltration-par-les-arguments.temoin.spec.ts` — « `idFields` qui
désigne un champ de texte libre », le seul des huit schémas témoins qui passe
encore : **déclarer `idFields: ["requete"]` sur un `{"type":"string"}` suffit à
désarmer la garde d'exfiltration du § 20, depuis le manifeste.** C'est-à-dire
depuis un dépôt tiers — public à jamais dans le cas du CRM (§ 29).

Le § 20 dit l'inverse, mot pour mot : « l'étiquetage se décide **côté socle**,
JAMAIS sur déclaration ».

---

## Les deux voies, et pourquoi aucune des deux n'est retenue telle quelle

| Voie                                                                                                                                         | Ce qu'elle coûte                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** `idFields` n'exonère que les champs **eux-mêmes fermés** (`enum`, `const`, `format` contraignant, `pattern` ancré, type non textuel) | Rien — **mais l'exonération devient alors un NO-OP** : `estTexteLibre()` referme déjà exactement ces champs-là. La voie (a), poussée jusqu'au bout, dit que la déclaration ne sert plus à rien à l'étape 11.     |
| **(b)** L'admission **exige** un `pattern` sur tout champ déclaré identifiant                                                                | Elle **refuse de vrais outils** : un `messageId: z.string()` est légitime et sans motif. Et elle pousse à écrire un motif de complaisance pour passer la porte — ce que `patternReferme()` doit alors rattraper. |

La voie (a) est juste **et** elle se simplifie d'elle-même. C'est ce qu'on
retient, en tirant la conclusion jusqu'au bout plutôt qu'en gardant un test mort.

---

## Décision

**L'étape 11 cesse de lire `idFields`. Ce qui referme un champ d'entrée est le
SCHÉMA, et lui seul.**

- Le paramètre `idFields` d'`analyserArgumentsDuSchema()` **disparaît**, et avec
  lui le `identifiants.has(nom)` du corps.
- `estTexteLibre()` reste le seul juge, avec les fermetures qu'il sait déjà
  reconnaître : `enum`, `const`, un `format` **réellement** contraignant, un
  `pattern` ancré aux deux bouts qui **rejette de la prose**, un type non textuel.
- **Aucune admission n'est refusée pour ce motif.** Le registre ne croit pas la
  déclaration ; il n'a donc pas à la punir.
- `idFields` **garde** son rôle du § 12 : nommer les champs porteurs
  d'identifiants, pour que `recordIds` soit purgé à la même échéance qu'`argHash`
  (§ 31).

Une déclaration ne peut plus **retirer** un champ de la surveillance. Elle ne
peut que le **nommer**.

---

## Ce que ça coûte aux adaptateurs réels — vérifié sur le § 27 et le § 28

Les identifiants que les deux adaptateurs déclareront : `messageId`, `draftId`,
`submissionId`, `id`. Sous cette décision, un `z.string()` nu **reste surveillé**
— donc, session marquée par une lecture `personal` chez un autre domaine, l'appel
demande une confirmation au lieu de passer.

**Le remède est une ligne de Zod, chez l'adaptateur** :

```ts
submissionId: z.string().uuid(),                 // format: "uuid" — fermé
messageId:    z.string().regex(/^[0-9]{1,20}$/), // pattern ancré — fermé
```

C'est la seule chose qui rende la déclaration **vraie**. Et c'est un progrès en
soi : un identifiant sans forme déclarée est aussi un identifiant que le schéma
d'entrée ne valide pas.

⚠️ **Ce coût n'est pas nul et il est écrit ici** : un adaptateur qui ne referme
pas ses identifiants verra des confirmations là où il n'en attendait pas. Le
signal doit donc lui parvenir — voir la garde G2 ci-dessous, qui le lui dit à
l'admission, **sans** le refuser.

---

## Ce que la décision EXCLUT

- **Refuser un manifeste dont un `idFields` désigne un champ non fermé.** Ce
  serait rejeter de vrais outils pour une déclaration que le socle a de toute
  façon cessé de croire. On n'interdit pas ce qu'on ignore.
- **Garder l'exonération « pour les cas fermés ».** Elle serait un test mort :
  `estTexteLibre()` referme déjà ces champs-là. Un test mort finit par être
  « réparé » dans le mauvais sens.
- **Remplacer le paramètre par un paramètre facultatif.** Une signature qui
  accepte encore la liste laisse un appelant la renseigner — le trou se rouvre
  sans qu'aucune garde ne rougisse.
- **Croire `recordIds` sur parole en compensation.** Ce n'est pas compensé : voir
  « ce qui reste ouvert ».

---

## Ce que le constructeur ② doit écrire

1. **Retirer** le paramètre `idFields` d'`analyserArgumentsDuSchema()` et le
   `continue` qu'il gouverne. Retirer `idFields` de `ContexteProvenance` si
   l'appelant le passait.
2. **Basculer le témoin** de
   `core/epreuve/exfiltration-par-les-arguments.temoin.spec.ts` : « `idFields`
   qui désigne un champ de texte libre » passe de « contournement attendu » à
   « refermé ». Le compte annoncé passe de **8 schémas témoins · 1
   contournement** à **8 schémas témoins · 0 contournement**, et
   `expect(passants).toEqual([…])` devient `toEqual([])`.
   ⚠️ Ne pas supprimer le témoin : c'est lui qui rougira si l'exonération
   revient.
3. **Ajouter la garde G2** à l'admission (`core/registry/enregistrer.ts`), en
   ANNONÇANT ses comptes.

### Les deux gardes

| Garde                                                                                                                              | Ce qu'elle annonce                                                             | Le témoin qui la fait rougir                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **G1 — une déclaration n'exonère plus.** Le schéma témoin « champ libre déclaré `idFields` » est retenu dans `libres`.             | schémas témoins confrontés · contournements restants                           | Réintroduire le `identifiants.has(nom)` : le compte de contournements repasse à 1.          |
| **G2 — l'admission DIT ce qui est sans effet.** Combien d'`idFields` désignent un champ que le schéma d'entrée **ne referme pas**. | `idFields` déclarés · désignant une propriété du schéma · fermés par le schéma | Un manifeste dont tous les `idFields` sont fermés doit rendre un compte de zéro sans effet. |

⚠️ **G2 annonce, elle ne refuse pas.** Un compte à zéro élément **mesuré** est
lui-même une anomalie (`anomaliesCompletes`) : un manifeste sans aucun `idFields`
confronté rend la garde muette, et c'est ce que le plancher du `Verdict` existe
pour dire.

---

## Conséquences acceptées

1. **`idFields` n'a plus aucun lecteur dans la chaîne d'appel.** Il reste
   déclaratif jusqu'à ce que la purge du § 31 l'emploie. Un champ sans lecteur
   est un champ qui dérive : la garde G2 lui donne un lecteur — le registre — dès
   maintenant.
2. **Certains appels légitimes demanderont une confirmation** là où ils
   passaient. C'est le comportement voulu du § 20, et il ne se paie que dans une
   session **déjà marquée** par une lecture `personal`/`sensitive`.

---

## Ce qui reste OUVERT

- **`recordIds` est rendu par l'adaptateur, et confronté à rien.**
  `ChargeAdaptateur.recordIds` arrive tel quel dans `ops_audit` : le socle ne
  vérifie pas qu'il vient bien des champs déclarés `idFields`. C'est **la même
  maladie que celle refermée ici, à l'autre bout de l'appel** — une déclaration
  crue sur parole. Elle est moins grave (elle fait entrer des pseudonymes dans le
  journal, elle n'en fait pas sortir), et elle est nommée pour ne pas être
  découverte deux fois.
- **Le § 09 du CDC décrit `idFields` sans dire de quel côté** — entrée ou
  sortie. L'étape 11 le lisait côté **entrée**, le § 12 le décrit côté **sortie**
  (`recordIds`). Cette décision tranche implicitement pour la sortie ; le CDC
  reste à corriger. Écart porté au README.
