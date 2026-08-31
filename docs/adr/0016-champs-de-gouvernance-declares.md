# ADR 0016 — Les champs de gouvernance sont déclarés, et le cumul ne peut que resserrer

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1c)
- **Portée** : `core/adapter-kit/types.ts` (`ChampsOutil`,
  `ChampsDeGouvernanceDeclares`, `AUCUN_CHAMP_DE_GOUVERNANCE`),
  `core/adapter-kit/manifest.ts` (`ManifesteOutil`),
  `core/registry/manifeste-recu.ts` (`SchemaOutilRecu`),
  `core/chaine/etapes.ts` (`OutilDuCatalogue`),
  `core/chaine/etape-11-provenance.ts` (`analyserArgumentsDuSchema`),
  `prisma/schema.prisma` (`ops_tool`)
- **Sources** : CDC v6 § 09 (contrat d'adaptateur), § 20 (deuxième règle de
  provenance, protection 1 — asymétrie), § 27 et § 28 (adaptateurs réels)

---

## Le défaut, chiffré

Le § 20 : « les arguments de gouvernance — **niveau de politique, TTL, bascule
d'outil, destinataire d'un envoi, créneau posé** — ne peuvent **JAMAIS** provenir
d'un contenu lu ». C'est la seule branche de l'étape 11 qu'aucune confirmation ne
rattrape, à aucun niveau de politique.

Le socle les reconnaissait **au nom du champ** (`FAMILLES_GOUVERNANCE`, cinq
familles, motifs français et anglais). L'épreuve du lot 1b l'a mesuré :

```
[garde noms de gouvernance] 20 nom(s) confronté(s) · 11 retenu(s) · 9 échappé(s)
```

Les neuf : `emailTo`, `adresseDeReponse`, `envoyerA`, `validUntil`, `maxAge`,
`dateDebut`, `scheduledFor`, `profil`, `toolset`.

**Un motif ne prouve que l'absence de la FORME ÉCRITE.** Élargir la liste ne
ferme rien : le nom suivant qui échappe s'écrira `cible`, `param3` ou `x`.

---

## Décision

**L'outil DÉCLARE, dans son manifeste, quels champs d'entrée sont de
gouvernance. Le socle ne devine plus — il lit. Et il continue de deviner en
plus.**

```ts
governanceFields: readonly string[]   // obligatoire, § 09
```

La règle de cumul, en trois lignes :

1. **Union.** Champs surveillés = `governanceFields` **∪** ce que
   `FAMILLES_GOUVERNANCE` retient par le nom.
2. **La reconnaissance par nom RESTE**, en filet. Elle n'est pas remplacée, elle
   n'est pas affaiblie, et son compte continue d'être annoncé.
3. **Une déclaration ne peut qu'AJOUTER.** Il n'existe, et il n'existera, aucun
   champ « ceci n'est pas de la gouvernance ».

---

## Pourquoi une déclaration peut être crue ici, et pas dans l'ADR 0015

C'est la seule chose à retenir de cette paire d'ADR, et elle tient à une
asymétrie que le § 20 pose déjà pour la politique — « resserrer est toujours
libre, desserrer ne l'est jamais » :

| Déclaration              | Sens                        | Peut-on la croire ?                                                                                             |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `idFields` (ADR 0015)    | **retire** une surveillance | **Non.** Un dépôt tiers hostile a tout intérêt à s'exonérer. Le socle re-dérive du schéma.                      |
| `governanceFields` (ici) | **ajoute** une surveillance | **Oui.** Un dépôt tiers hostile n'a aucun intérêt à s'auto-restreindre — et s'il le fait, il se punit lui-même. |

Un manifeste qui déclarerait tous ses champs de gouvernance rendrait ses propres
outils inutilisables dès que la session est marquée. C'est son droit ; ce n'est
pas une attaque contre le socle.

---

## Ce que déclarer COÛTE, et pourquoi c'est le comportement voulu

Un champ de gouvernance déclenche la branche 1 de l'étape 11 : **REFUS**, pas
« confirmation », dès que la session porte une marque `personal`/`sensitive`.

Les outils du § 27 et du § 28 les plus concernés :

| Outil                        | Champs à déclarer                | Pourquoi c'est exactement ce qu'on veut                                                        |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `zoho.mail.send` · `forward` | destinataire, expéditeur         | Un destinataire dicté par un courrier qu'on vient de lire est le cas d'école du § 20.          |
| `axionia.agenda.poser`       | début, fin, participants         | Poser un créneau ferme une réservation Calendly en ~11 s : un tiers s'en aperçoit.             |
| `axionia.message.repondre`   | l'identifiant de la soumission ? | **Non** — la cible est portée par la soumission, pas par l'appel. À ne pas déclarer par excès. |

⚠️ **Déclarer par excès a un coût réel**, et il n'est pas rattrapable par une
confirmation. La règle d'écriture est : _un champ est de gouvernance s'il décide
**vers qui**, **quand** ou **sous quel régime** l'effet part._ Le corps d'un
message n'en est pas un — le § 20 le dit : « pour le corps d'un brouillon, le
garde-fou est la relecture humaine, pas un refus d'appel ».

---

## Pourquoi le champ est OBLIGATOIRE, avec une valeur neutre NOMMÉE

`AUCUN_CHAMP_DE_GOUVERNANCE`, et pas un champ optionnel.

C'est le motif d'`INTENTION_NON_ARMEE` (`core/chaine/orchestrateur.ts`), mot pour
mot : « le rendre facultatif aurait fait de l'arbitrage un oubli — personne
n'aurait eu à **dire** qu'il ne l'armait pas ». Un champ obligatoire dont la
valeur neutre porte un nom transforme « je n'y ai pas pensé » en « j'ai écrit que
cet outil n'en a aucun ». Seule la seconde se relit en revue.

---

## Ce que la décision EXCLUT

- **Retirer `FAMILLES_GOUVERNANCE`.** Un adaptateur qui ne déclare rien serait
  alors **moins** couvert qu'aujourd'hui. La déclaration s'ajoute au filet, elle
  ne le remplace pas.
- **Un champ « ces champs ne sont PAS de la gouvernance ».** Ce serait `idFields`
  à nouveau, avec un autre nom, et le même trou.
- **Déduire la gouvernance de l'`effect`.** « Tout champ d'un outil `send` est de
  gouvernance » rendrait `reply` et `forward` inutilisables dans toute session
  marquée — c'est-à-dire exactement ce que la réécriture de la cinquième règle du
  § 20 a corrigé.
- **Un champ optionnel.** Voir ci-dessus.
- **Le vérifier au seul BUILD.** Le harnais tourne dans la CI de l'adaptateur ;
  pour le CRM en PHP, il n'y a pas de kit TypeScript. Le registre est la seule
  barrière commune — c'est l'ADR 0003, appliqué à un champ de plus.

---

## Ce que le constructeur ③ doit écrire

1. **La fusion** — une ligne :
   `interface ChampsOutil extends ChampsDeGouvernanceDeclares`.
2. **La propagation**, dans cet ordre : `ManifesteOutil` →
   `octetsCanoniques` (le champ entre dans `ops_tool.bytes`, donc au budget du
   § 14) → `SchemaOutilRecu` (`z.array(z.string())`, schéma **fermé**) →
   `OutilDuCatalogue` → `ops_tool.governanceFields` → l'appel
   d'`analyserArgumentsDuSchema` dans l'orchestrateur.
3. **L'union**, dans `analyserArgumentsDuSchema` : un champ déclaré entre dans
   `gouvernance` avec une famille **nommée** — `"déclaré par l'outil"` — pour que
   le rapport puisse dire laquelle des deux sources a mordu.
4. **La migration des fixtures** : toutes celles qui portent `idFields:` portent
   désormais `governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE`, sauf celles dont le
   sujet est précisément la gouvernance.

⚠️ **Le champ entre dans l'empreinte du manifeste** (`manifestSha`), donc dans
`adapters.lock.json`. Sans coût aujourd'hui : le verrou n'existe qu'en exemple.
Après le premier épinglage réel, il aurait fallu revalider à la main chaque
`manifestSha` de chaque dépôt tiers — c'est le motif exact qui a fait poser
`profilesSha` au lot 1b, et c'est pourquoi ce champ est posé maintenant.

### Les trois gardes

| Garde                                                                                                                                               | Ce qu'elle annonce                                                     | Le témoin qui la fait rougir                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **G1 — le cumul ne retire rien.** Rejouer les 20 noms du lot 1b : les 11 retenus par le nom le RESTENT quand `governanceFields` est vide.           | noms confrontés · retenus par le nom · retenus par déclaration · union | Une implémentation qui remplacerait l'union par la seule déclaration : 11 retenus tombent à 0.   |
| **G2 — la déclaration ferme les 9 échappés.** Les mêmes 20 noms, les 9 déclarés.                                                                    | échappés avant · échappés après                                        | Le compte « après » doit être 0 ; il remonte dès que l'union est cassée.                         |
| **G3 — un `governanceFields` qui ne désigne rien est une ANOMALIE d'admission.** Un nom absent des propriétés du schéma d'entrée est un no-op muet. | noms déclarés · confrontés au schéma · introuvables                    | Un manifeste déclarant `governanceFields: ["destinataireX"]` sur un schéma qui n'a pas ce champ. |

⚠️ **G3 refuse, contrairement à la G2 de l'ADR 0015.** La différence est nette :
un `idFields` sans effet est une déclaration que le socle **ignore** ; un
`governanceFields` sans effet est une déclaration que l'auteur **croit
appliquée**. La première est inoffensive, la seconde donne l'apparence d'un
périmètre couvert — et c'est la faute que ce lot referme partout.

---

## Ce qui reste OUVERT

- **`FAMILLES_GOUVERNANCE` garde sa borne**, et elle reste large : un champ nommé
  `cible` ou `param3` échappe toujours au filet. La déclaration la referme **pour
  les adaptateurs qui déclarent**, et pour eux seuls. Aucun compte ne peut dire
  ce qu'un adaptateur n'a pas déclaré : c'est la limite structurelle de cette
  décision, et elle est écrite ici plutôt que découverte plus tard.
- **Le § 09 du CDC ne nomme pas `governanceFields`.** Écart porté au README,
  comme `vault_locked` au § 15 (ADR 0005) et `ops_token.sessionId` (ADR 0014) :
  ce dépôt porte un contrat plus large que le document.
