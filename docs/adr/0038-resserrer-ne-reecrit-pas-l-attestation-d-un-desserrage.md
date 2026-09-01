# ADR 0038 — Resserrer ne réécrit pas l'attestation d'un desserrage

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 3)
- **Portée** : `core/policy/desserrage.ts` (`resserrer`, `remplaceesDoffice`),
  `core/policy/desserrage.spec.ts`, **et la lecture du § 20 du cahier des
  charges**
- **Sources** : cahier des charges v6, § 12 (les colonnes d'`ops_policy`, dont
  `channel`, `setBy`, `reason`), § 20 (les quatre protections, protection 1 :
  « resserrer est toujours libre, desserrer ne l'est jamais »), § 21 (la console
  survit à la panne) ; ADR 0017

---

## Le fait qui rend cette décision nécessaire — **et c'est un défaut du CAHIER DES CHARGES d'abord**

C'est le seul défaut de ce lot dont le correctif ne se pose pas d'abord dans le
code. Le § 20 accorde au chemin de resserrage d'être « exécuté immédiatement
**d'où que ça vienne** » : aucun second facteur, aucun `ops:policy`, aucun
contrôle de canal. Il ne distingue pas **RESSERRER** de **RÉÉCRIRE
L'ATTESTATION** d'un desserrage. `resserrer` applique fidèlement une règle qui
n'a pas été assez découpée.

`remplaceesDoffice` marque `supersededAt` sur **toute** ligne en vigueur de même
`scope` :

```ts
return lignes.filter((ligne) => ligne.scope === scope && ligneEnVigueur(ligne, maintenant));
```

Aucun filtre de niveau, aucun filtre de canal. Mesuré sur le dépôt en mémoire,
avec les vraies fonctions :

| moment                              | niveau servi | lignes retenues                          |
| ----------------------------------- | ------------ | ---------------------------------------- |
| avant                               | `libre`      | `L-console`                              |
| `resserrer()` depuis le canal `mcp` | —            | `{"applique":true,"genre":"resserrage"}` |
| après                               | `libre`      | **`L-mcp`**                              |

**Le niveau servi ne bouge pas. Ce qui bouge est l'ATTRIBUTION.** Une ligne
`libre` écrite par `desserrer` — TOTP vérifié, `ops:policy`, canal `console`,
TTL borné — est remplacée par une ligne `libre` de même portée et **de même
échéance** venue de `mcp`, dont l'appelant a choisi `setBy` et `reason`. La ligne
en vigueur qui autorise les effets extérieurs porte désormais un canal qui n'est
pas celui du geste humain qui l'a autorisée.

Le § 12, règle 2, écrit que sans `channel` « la protection second facteur est
**INAUDITABLE** ». Ici le canal survit — **et il ment**, ce qui est pire qu'une
colonne vide : une colonne vide se voit.

---

## Décision

### 1 · Au § 20 d'abord — la phrase se découpe en deux

Le chemin libre peut :

- poser un niveau **strictement plus strict** ;
- **raccourcir** une durée, à niveau égal.

Il ne peut pas, **à niveau ET à échéance égaux**, remplacer la ligne en vigueur :
cette écriture-là ne resserre rien, elle ne fait que **réattribuer**. Le § 20 lui
a accordé le droit de resserrer, jamais celui de réécrire l'attestation d'un
desserrage — il ne l'a simplement jamais distingué.

Cette lecture est celle qui vaut pour le socle. Elle est écrite ici, datée, et
elle ne réécrit pas le § 20 : elle le découpe.

### 2 · Dans `resserrer` ensuite — un refus, à côté de son voisin exact

`resserrer` porte déjà le refus `resserrage-qui-recule-la-fermeture`, prononcé
quand, à niveau égal, l'échéance demandée est **postérieure** à l'échéance
courante. Le trou est le cas d'**égalité**, qui tombe aujourd'hui dans le chemin
nominal.

**Nouveau motif : `resserrage-sans-effet`.** Il se prononce quand, sur le
`scope` demandé :

- `demande.level === classement.niveauAvant`, **et**
- l'échéance demandée est **exactement** l'échéance courante la plus proche.

Le message NOMME ce que l'appelant voulait faire et ce qu'il doit faire à la
place (§ 15) : cette ligne ne resserre ni le niveau ni la durée ; elle ne
changerait que le canal, l'auteur et la raison de la ligne en vigueur. Pour
refermer la surface, poser un niveau plus strict ou une échéance plus proche ;
pour reprendre la main sur un desserrage, passer par la route dédiée, avec
second facteur et `ops:policy`.

⚠️ **LA COUPE EST À L'ÉGALITÉ, ET PAS AILLEURS.** Une échéance strictement
antérieure **raccourcit** : c'est un resserrage authentique, il reste libre, et
la supersession y est légitime — la nouvelle ligne ferme plus tôt que celle
qu'elle remplace. Élargir le refus au cas « échéance antérieure » retirerait au
chemin libre sa fonction, qui est de refermer vite d'où que ça vienne. Ce refus
lui retire **seulement** ce qu'il n'a jamais eu.

### 3 · Ce que `remplaceesDoffice` continue de faire, et pourquoi on ne le touche pas

La fonction garde son sens : à portée égale, deux lignes en vigueur ne peuvent
pas coexister, sinon l'écran ne saurait laquelle est courante. Le tri ne se fait
donc **pas** dans `remplaceesDoffice` mais **avant** l'écriture, dans le refus du
§ 2. Filtrer la supersession par niveau ou par canal fabriquerait des lignes
orphelines toujours « en vigueur » que rien ne remplacerait jamais — une seconde
panne, plus difficile à voir que la première.

---

## Ce que cette décision NE COUVRE PAS

- **Elle ne dit pas que le chemin libre pouvait ÉLARGIR la surface.**
  `classerChangement` et le contrôle temporel refusent chacune des
  configurations éprouvées ; ni le niveau servi ni l'échéance ne bougeaient dans
  la sonde. Ce qui bougeait était l'attribution, et rien d'autre.
- **Le défaut est LATENT.** `resserrer` n'a **aucun appelant de production**
  aujourd'hui — `console/` est vide, et seuls les ré-exports de
  `core/policy/index.ts` le citent. Mais il est sur le chemin que
  `core/chaine/etape-05-scopes.ts` nomme déjà comme outil MCP futur
  (`ops.policy.tighten`) : le fermer maintenant coûte un refus ; le fermer après
  coûtera une migration de lignes.
- **Elle ne rend pas `resserrer` auditables sur tous les axes.** Un appelant qui
  resserre pour de bon depuis `mcp` écrit toujours `setBy` et `reason` de son
  choix. C'est voulu — le § 20 le veut libre —, et c'est la ligne PRÉCÉDENTE que
  cette décision protège, pas la nouvelle.

---

## Ce que les gardes doivent tenir

1. **Le témoin exact de la sonde** : une ligne `libre` posée par `desserrer`
   depuis `console`, puis un `resserrer` depuis `mcp` de même portée, même niveau
   et **même échéance** → refus `resserrage-sans-effet`, et la ligne `console`
   **toujours en vigueur**, `supersededAt` à `null`.
2. **Les deux témoins inverses, obligatoires**, sans quoi une fonction qui refuse
   tout satisferait la garde :
   - même portée, niveau **plus strict** → appliqué, la ligne `console` est
     remplacée ;
   - même niveau, échéance **plus proche** → appliqué.
3. **La garde annonce** le niveau avant, le niveau après, le canal de la ligne en
   vigueur avant et après, et le nombre de lignes examinées. Un refus qui ne
   dirait pas quelle ligne il protège ne se relit pas.
4. **La mutation qui doit MOURIR** : retirer le refus `resserrage-sans-effet` —
   c'est-à-dire le code d'aujourd'hui — et relancer la suite complète. Elle doit
   rougir sur le témoin n° 1. Restaurer, reconfronter l'empreinte, transcrire les
   deux états.

---

## Conséquences acceptées

- **`MOTIFS` de refus du desserrage gagne une entrée.** Un appelant qui rejouait
  un resserrage identique par idempotence naïve recevra désormais un refus ; le
  message lui dit que rien n'était à resserrer, ce qui est l'information juste.
- **Le § 20 se lit désormais avec cet ADR à côté.** C'est le premier défaut du
  cahier des charges que le socle corrige plutôt qu'il n'applique, et il faut que
  la trace en reste : on ne réécrit pas le § 20, on le découpe et on date le
  découpage.
