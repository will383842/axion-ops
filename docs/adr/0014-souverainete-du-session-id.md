# ADR 0014 — Le `sessionId` est établi par le socle, jamais accepté du client

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1c)
- **Portée** : `core/identite/session.ts` (nouveau), `core/types.ts`
  (`ToolContext.sessionId`), `core/chaine/orchestrateur.ts`
  (`IdentiteAppelante`, `identiteStdio`, `AppelEntrant`), `core/chaine/etapes.ts`
  (`ContexteProvenance`), `core/audit/vocabulaire.ts` (`ContenuLigne`),
  `prisma/schema.prisma` (`ops_token`), et le futur `core/transport/`
- **Sources** : CDC v6 § 11 (chaîne d'appel, « aucune session
  d'authentification »), § 12 (`ops_token`, `ops_audit`), § 19.1 (émetteur,
  jeton d'accès 1 h / rafraîchissement 30 j rotatif), § 20 (cinquième règle,
  garde de provenance)

---

## Le défaut, et il est mesuré

Toute la garde d'exfiltration du § 20 s'ancre sur **une** clé : `sessionId`.
C'est elle que l'index de provenance marque quand un résultat `personal` ou
`sensitive` traverse le socle, et c'est elle que l'étape 11 interroge à l'appel
suivant.

Rien ne la contraignait. Le `principal` d'`identiteStdio()` est **imposé**, et
son commentaire dit pourquoi — « un poste local qui choisirait son principal
pourrait se faire passer pour un jeton HTTP dans `ops_audit` ». Le `sessionId`,
**juste à côté**, était un paramètre ordinaire.

L'épreuve adverse du lot 1b l'a mesuré, sur le pire cas — argument de
gouvernance **et** argument libre **et** autre domaine, c'est-à-dire la branche
que le § 20 dit inconditionnelle :

```
verdict même session       : refusé
verdict session renouvelée : AUTORISÉ
```

L'attaque tient en une phrase : **un appelant qui renouvelle son `sessionId`
entre la lecture et l'appel suivant annule l'étape 11 en entier.** L'index reste
peuplé, la marque reste vivante, elle est simplement cherchée au mauvais endroit.
Aucun compte ne bouge, aucune garde ne rougit.

---

## Décision

**Le `sessionId` est ÉTABLI PAR LE SOCLE. Il n'est jamais accepté d'un
appelant, par aucun chemin.**

| Transport | D'où il vient                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------- |
| **HTTP**  | De la ligne `ops_token` **relue à l'étape 4** (« `jti` non révoqué »), qui est déjà lue à cet instant.  |
| **stdio** | Une **par exécution du démon**, frappée au démarrage du processus — comme `PRINCIPAL_STDIO` est imposé. |

Et un type qui rend l'erreur impossible à écrire : `SessionId`, marqué
(`unique symbol` **non exporté**), constructible par la seule
`FabriqueSessionId` de `core/identite/session.ts`.

---

## Pourquoi la session suit l'OCTROI, et non le `jti`

Le point de départ du lot était : « dérivé du jeton pour le transport HTTP — il
est déjà porté par `ops_token` (`jti`, § 12) ». **Mesure faite, c'est la
mauvaise dérivation**, et il faut l'écrire :

- § 19.1 — le jeton d'accès vit **une heure**, le rafraîchissement 30 jours
  rotatifs. Un `jti` change donc **au moins toutes les heures** ;
- `TTL_MARQUAGE_MS` — une marque de provenance vit **quatre heures**.

Une session dérivée du `jti` s'effacerait donc **trois fois par TTL de marque**.
Et le rafraîchissement est une opération que le client MCP conduit tout seul,
sans geste humain : ce serait rendre au client, par la petite porte, exactement
le renouvellement de session que cet ADR lui retire.

**La session suit donc l'OCTROI** : le serveur d'autorisation (§ 19.1) la frappe
au moment du consentement, et tout jeton d'accès né de la même chaîne de
rafraîchissement la porte. Un **nouvel** octroi ouvre une nouvelle session — et
il coûte un geste humain, ce qui est le prix qu'on veut.

`ops_token` gagne donc une colonne `sessionId`. Elle n'entre dans **aucune**
empreinte chaînée (`ops_token` n'est pas chaînée), donc elle ne coûte rien
au format du journal.

---

## Pourquoi un type marqué, et pas un contrôle au runtime

C'est le motif de `core/profiles/` (§ 14) : « un profil inconnu devient une
**erreur de compilation** chez l'adaptateur ». Un contrôle au runtime arrive trop
tard — au moment où le transport est écrit, câblé, déployé. Ici, un transport qui
tente de passer une chaîne venue du réseau **ne compile pas**.

**Une moitié du verrou tenait déjà, et par dérivation.** Le contrôle 7 du § 09
(`core/adapter-kit/autorisation.ts`) lit les propriétés de `ToolContext` dans le
**source** de `core/types.ts` et refuse tout schéma d'entrée qui en redéclare
une : un champ `sessionId` dans un `input` est **déjà** un refus visible, sans
qu'une ligne soit à ajouter. Ce qui restait ouvert est le **transport**, et c'est
lui seul que cet ADR ferme.

---

## Ce que la décision EXCLUT

- **Dériver le `sessionId` du `jti`.** Motif chiffré ci-dessus : 1 h contre 4 h.
- **Le laisser voyager dans `AppelEntrant`, « à titre indicatif ».** C'est la
  cinquième valeur d'une liste qui en compte déjà quatre (`effect`, `dataClass`,
  `policyLevel`, habilitations) et le motif est identique : une décision du socle
  qui arriverait par la charge utile.
- **Une session par APPEL en stdio.** Chaque appel arriverait sur une session
  propre : l'index de provenance serait inutile et l'étape 11 laisserait tout
  passer **en restant verte**.
- **Un `sessionId` lisible** (« session-de-will-31-aout »). La garde de contenu
  du § 31 (`core/audit/contenu.ts`) refuse à l'écriture ce qui ressemble à du
  contenu ; assouplir cette garde pour loger un identifiant parlant
  l'affaiblirait pour tout le reste de la ligne.
- **Un identifiant séquentiel ou prévisible.** Une session devinable est une
  marque de provenance qu'on peut **s'attribuer** — donc une exfiltration qu'on
  peut faire porter à un autre. 32 octets d'aléa, forme `^[0-9a-f]{64}$`.
- **Une fabrique injectée partout.** Deux appelants seulement la reçoivent : le
  transport HTTP et le démon stdio. Un module qui la demande en dépendance
  demande le droit de frapper des sessions ; cela doit se voir dans sa signature.

---

## Ce que le constructeur ① doit écrire

1. **Les fabriques**, dans `core/identite/session.ts` **et nulle part ailleurs** :
   `pourUnOctroi()`, `pourCetteExecutionDuDemon()`, `relireDepuisLeSocle()`.
   Cette dernière vérifie `FORME_SESSION_ID` et **lève**
   `ErreurSessionIdNonSouverain` — jamais de repli sur une session frappée à la
   volée, qui rendrait une base corrompue silencieuse.
2. **Le resserrement des types**, dans cet ordre (chacun casse la compilation
   jusqu'au suivant, ce qui est le but) : `ToolContext.sessionId`,
   `IdentiteAppelante.sessionId`, `identiteStdio`, `ContexteProvenance.sessionId`,
   `ContenuLigne.sessionId`, `IndexProvenance` (`marquer`, `domainesMarquants`).
3. **La colonne** `ops_token.sessionId`, et sa lecture à l'étape 4.
4. **La migration des fixtures** — les appels d'`identiteStdio` dans
   `orchestrateur.spec.ts`, les doubles de `core/epreuve/`, les fabriques de
   `core/audit/fixtures.ts`. Elles passent par une fabrique de test **nommée**,
   exportée depuis `core/identite/`, jamais par une conversion forcée écrite au
   cas par cas.

### Les trois gardes, et ce que chacune doit ANNONCER

| Garde                                                                                                                                                       | Ce qu'elle annonce                                      | Le témoin qui la fait rougir                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **G1 — le renouvellement n'annule plus rien.** Rejouer l'épreuve du lot 1b : lire `personal` chez A, puis appeler B avec une session **frappée à nouveau**. | les deux verdicts, et le nombre de branches confrontées | Le témoin EST le défaut : il est vert le jour où la seconde session ne peut plus être fabriquée. |
| **G2 — un seul module frappe des sessions.** Dérivée du GRAPHE D'IMPORTS, pas d'un motif de texte : qui importe `core/identite/session.ts`.                 | fichiers parcourus · importateurs trouvés               | Un import ajouté depuis un module hors `APPELANTS_DE_LA_RELECTURE`.                              |
| **G3 — aucune conversion forcée vers `SessionId`.** Motif `as unknown as SessionId` hors du module propriétaire et des doubles de test nommés.              | fichiers scannés · occurrences                          | Une conversion posée dans un fichier quelconque de `core/`.                                      |

⚠️ **G3 ne prouve que l'absence de la forme écrite** — un `grep` ne fait jamais
mieux. C'est G2 qui porte la garantie ; G3 n'est qu'un filet, et il est écrit ici
comme tel pour que personne ne lise sa couleur comme une preuve.

---

## Conséquences acceptées

1. **`APPELANTS_DE_LA_RELECTURE` désigne deux fichiers qui n'existent pas
   encore.** `core/transport/` est le lot suivant. Une entrée qui ne désigne
   aucun fichier est **attendue aujourd'hui** et deviendra une anomalie le jour
   où le transport atterrit. C'est le sens du cliquet — et c'est écrit pour que
   personne ne « répare » la liste en la vidant.
2. **Une marque de provenance survit désormais au rafraîchissement du jeton.**
   C'est le but. Elle expire sur son propre TTL (quatre heures), pas sur celui du
   jeton.
3. **Un `as unknown as SessionId` reste écrivable.** Le type ne rend pas la faute
   impossible ; il rend le **chemin honnête** exempt de chaîne, donc toute
   occurrence devient une anomalie visible.

---

## Ce qui reste OUVERT

- **La console tient une session de navigateur** (§ 11, « il porte une session de
  console »). Rien n'est décidé sur son rapport à la session de PILOTAGE : sont-ce
  la même, deux distinctes, ou l'une porte-t-elle l'autre ? Tant que la console
  n'appelle pas d'outil, la question ne se pose pas. Elle se posera au lot
  console, et elle est nommée ici pour ne pas être tranchée par accident.
- **Le § 12 du CDC ne nomme pas `ops_token.sessionId`.** Écart ajouté à la liste
  du README, comme `principal` et `kind` l'ont été au lot 1 pour la même table.
