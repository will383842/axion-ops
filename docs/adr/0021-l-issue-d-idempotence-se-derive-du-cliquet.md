# ADR 0021 — L'issue d'idempotence se dérive du CLIQUET, jamais du genre de la terminaison

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1d)
- **Portée** : `core/audit/journal.ts` (`AffineursDAppel`,
  `LecteurEffetExterieur`, `avecJournal`), `core/limits/idempotency.ts`
  (`issueDeReservation`), `core/chaine/orchestrateur.ts` (étape 14, le
  `finally`), `core/chaine/index.ts`
- **Sources** : CDC v6 § 11 (étape 13, étape 14), § 12 (`ops_idempotency`,
  règle 1), § 13 (rejeu), § 20 (ce qui compte comme effet extérieur) ; **ADR
  0017** (le cliquet), ADR 0002

---

## Le défaut : un envoi PARTI redevient rejouable

L'orchestrateur applique la bonne règle sur une branche et pas sur sa voisine.

```ts
if (v14.issue === "refuse") {
  // ⚠️ L'EFFET A DÉJÀ EU LIEU. […] l'idempotence est close en `done`,
  //    sans quoi un rejeu produirait un SECOND effet.
  issueDeLEffet = "done";
  return refuserDepuis(v14);
}
…
} catch (erreur: unknown) {
  issueDeLEffet = "failed";
  throw erreur;
}
```

`"failed"` est **le seul statut que `reserver()` reprend** — par
`reprendreSiEchouee`, qui repasse la ligne en `in_flight` et autorise l'appel
suivant à s'exécuter.

Or tout ce qui suit le retour de l'adaptateur — vérification de contrat,
masquage, cascade de compaction, marquage de provenance, clôture des limites —
se passe **dans un monde où l'effet est déjà parti**. Une exception levée là
laisse la clé rejouable.

**Conséquence, en une phrase : un courrier parti peut repartir.**

La cause n'est pas la règle, elle est **structurelle** : une seule variable à
trois valeurs sert deux questions différentes, et le point d'usage l'écrase en
deux valeurs.

```ts
issue: issueDeLEffet === "done" ? "done" : "failed",
```

`"interrompu"` et `"failed"` deviennent le même mot **à l'endroit exact où la
distinction comptait**. Une variable qu'on écrase à l'usage est une décision
qu'on ne prend pas.

> ⚠️ **Borne, écrite avec le constat.** Aucun adaptateur n'existe, aucun
> transport n'assemble la chaîne, rien ne tourne. Le défaut est mesuré sur le
> code, pas sur un incident.

---

## Décision, en trois pièces

### 1 · L'issue se DÉRIVE. Elle n'est plus affectée dans un `catch`.

Une fonction pure, chez le propriétaire des statuts
(`core/limits/idempotency.ts`) :

```ts
export function issueDeReservation(faits: {
  /** Le CLIQUET de l'ADR 0017, LU. Jamais le genre de la terminaison. */
  readonly effetExterieurSurvenu: boolean;
  /** L'étape 14 a-t-elle RENDU — succès ou refus — plutôt que levé ? */
  readonly terminaisonRendue: boolean;
  /** L'`effect` ÉPINGLÉ de l'outil (`ops_tool`, § 20, règle d'épinglage). */
  readonly effetDeclare: Effect;
}): Extract<StatutIdempotence, "done" | "failed">;
```

Trois branches, et une totalité :

| Faits                                                    | Issue    | Motif                                                                                                           |
| -------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| le cliquet est **levé**                                  | `done`   | quelque chose est sorti. Rejouer produirait un **second** effet.                                                |
| l'étape 14 a **rendu** (succès ou refus)                 | `done`   | le handler a rendu la main : ce qu'il a fait est fait, réversible ou non.                                       |
| elle a **levé**, et l'`effect` épinglé est **extérieur** | `done`   | **fail-closed** — l'adaptateur a pu envoyer avant de lever.                                                     |
| elle a **levé**, `read` ou `write-draft`                 | `failed` | rien n'est sorti ; la reprise est le comportement utile, et le § 20 confie le brouillon à la relecture humaine. |

### 2 · Le LECTEUR du cliquet vit là où le cliquet vit

Le cliquet est une variable de la **fermeture d'`avecJournal`**. L'orchestrateur
n'a que le SIGNAL. Il lui faut le LECTEUR, et il n'y a qu'un endroit honnête où
le mettre :

```ts
/** ADR 0021 — la LECTURE du cliquet. Elle ne peut ni le lever ni le baisser. */
export type LecteurEffetExterieur = () => boolean;

export interface AffineursDAppel {
  readonly affinerArgHash: AffineurDEntete;
  readonly signalerEffetExterieur: SignalEffetExterieur;
  readonly effetExterieurSurvenu: LecteurEffetExterieur; // ← le troisième
}
```

**L'ADR 0017 l'avait annoncé mot pour mot** — « un objet plutôt qu'un second
paramètre positionnel, pour qu'un troisième affineur — il y en aura — n'oblige
personne à relire l'ordre des arguments ». C'est celui-là. La forme retenue
n'est pas une trouvaille du lot 1d : elle était déjà décidée, et il suffit de
l'employer.

**Trois autres emplacements ont été pesés, et écartés :**

- **une variable de l'orchestrateur, tenue en parallèle du cliquet** — deux
  dérivations d'un même fait, qui finissent par se contredire. C'est le défaut
  que `core/chaine/modules.ts` a déjà eu à réparer une fois ;
- **rendre le cliquet lui-même mutable et lisible** (`{ get, set }`) — un objet
  qui expose son état invite à l'écrire. Le cliquet de l'ADR 0017 est **sans
  argument** précisément pour qu'il ne puisse pas redescendre ; lui donner un
  accesseur en écriture reviendrait sur cette décision par la porte de service ;
- **lire `ligne.externalEffect` après coup** — impossible : la ligne s'écrit
  **après** le `finally`, et c'est le `finally` qui a besoin de la réponse.

Le lecteur ne peut **ni lever ni baisser** le cliquet : c'est une fonction sans
argument qui rend un booléen. Le cliquet garde son unique appelant.

### 3 · Les deux issues sont SÉPARÉES

`issueDeLEffet` cesse de servir deux maîtres :

- **l'INTENTION** garde ses trois valeurs (`done` / `failed` / `interrompu`) —
  c'est `PorteeDIntention.apresEffet`, et la nuance « interrompu » y est le
  signal recherché (ADR 0022) ;
- **l'IDEMPOTENCE** reçoit le résultat de `issueDeReservation(…)` — deux valeurs,
  dérivées, jamais écrasées par un ternaire au point d'usage.

---

## Pourquoi le fail-closed sur l'`effect` déclaré ne contredit PAS l'ADR 0017

L'ADR 0017 exclut nommément de « déduire `externalEffect` d'`effect === "send"` ».
La troisième branche ci-dessus regarde pourtant l'`effect` épinglé. La
distinction est nette, et elle porte tout :

|                              | `ops_audit.externalEffect`                                      | l'issue d'idempotence                                        |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Nature                       | un **FAIT** que le journal atteste                              | une **POLITIQUE** de reprise                                 |
| Règle                        | on n'infère jamais un fait qu'on n'a pas observé                | on se replie toujours du côté qui ne double pas un effet     |
| Sur une exception post-envoi | reste `false` — le socle ne l'a pas vu (borne écrite dans 0017) | vaut `done` — le socle refuse de parier qu'il n'a pas envoyé |

**Et cette troisième branche solde une dette de l'ADR 0017.** Sa « conséquence
acceptée n° 1 » dit : « `externalEffect` vaut `false` quand l'adaptateur LÈVE
après avoir envoyé. L'étape 14 ne peut pas le savoir. » Le journal continuera de
le dire honnêtement ; l'**idempotence**, elle, cesse d'en tirer la conclusion
dangereuse.

---

## Ce que la décision EXCLUT

- **Dériver l'issue du seul genre de la terminaison.** C'est le défaut lui-même.
- **Fermer TOUTE exception en `done`.** La reprise après panne disparaîtrait pour
  les lectures et les brouillons, et un amont transitoirement injoignable
  verrouillerait la clé jusqu'au TTL. Un fail-closed qui coûte la disponibilité
  sur les appels sans effet extérieur n'est pas prudent, il est brutal.
- **Un second cliquet « l'adaptateur a été atteint ».** Il discriminerait mieux —
  une exception levée _avant_ l'appel de l'adaptateur mérite `failed`, même sur
  un `send`. Refusé pour deux raisons : il ajouterait un quatrième membre à
  `AffineursDAppel` qui ne mute **aucune** colonne de la ligne (ce que le type
  interdit par son commentaire), et il rouvrirait la fenêtre de l'empreinte
  chaînée pour une colonne de plus (ADR 0017, « le coût est par
  FRANCHISSEMENT »). **Écart assumé : une panne survenue entre la réservation et
  l'appel de l'adaptateur, sur un outil `send`, ferme la clé en `done` alors que
  rien n'est parti.** Conséquence : un appel légitime doit employer une clé
  neuve. C'est le sens sûr.
- **Rendre le cliquet mutable de l'extérieur.** Voir ci-dessus : le sens unique
  de l'ADR 0017 est la garantie, pas une commodité.
- **Laisser une seule variable porter les deux issues.** C'est la cause du
  défaut, pas sa manifestation.

---

## Ce que le constructeur ③ doit écrire

1. `LecteurEffetExterieur` et le troisième membre d'`AffineursDAppel`
   (`core/audit/journal.ts`). `avecJournal` le fabrique dans la même fermeture
   que le cliquet — **la même variable, lue**.
2. `issueDeReservation` (`core/limits/idempotency.ts`), pure, avec un `switch`
   **exhaustif** sur `Effect` : ajouter un effet au § 09 sans le classer doit
   être une erreur de **compilation**, comme dans `estEffetExterieur`.
   ⚠️ **NE PAS recopier `estEffetExterieur` : l'APPELER.** C'est sa totalité qui
   décide, jamais une seconde liste.
3. `core/chaine/orchestrateur.ts` : la destructuration ligne 1417 prend le
   troisième membre ; `issueDeLEffet` devient `issueDeLIntention` ; le `finally`
   appelle `issueDeReservation(…)` et **le ternaire disparaît**.
4. Le témoin de `core/epreuve/rejeu-et-concurrence.spec.ts` gagne le cas
   « l'adaptateur rend, le traitement d'aval lève, la clé n'est PAS rejouable ».
   S'il existe un `it.fails` portant cette attente, **il bascule en `it()`** — il
   ne se supprime pas.
5. `core/chaine/index.ts` ré-exporte `LecteurEffetExterieur`.

### Les trois gardes

| Garde                                                                                            | Ce qu'elle annonce                                                                       | Le témoin qui la fait rougir                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **G1 — un envoi parti suivi d'une exception laisse la clé FERMÉE.** Bout en bout, chaîne réelle. | statut de la ligne d'idempotence · cliquet · `reserver()` rejoue-t-il ?                  | Rétablir `issueDeLEffet = "failed"` dans le `catch` : la clé redevient reprenable.      |
| **G2 — `issueDeReservation` est une TOTALITÉ.** Éprouvée sur le produit `EFFECTS` × faits.       | combinaisons confrontées (**dérivé** d'`EFFECTS`, jamais `2 × 2 × 4` écrit) · désaccords | Ajouter un effet à `EFFECTS` sans le classer : erreur de compilation, pas de faux vert. |
| **G3 — le lecteur ne peut pas bouger le cliquet.** Le signal garde son appelant unique.          | appelants du signal trouvés dans le dépôt · lecteurs                                     | Un second appelant du signal, ou un lecteur qui écrit : le compte bouge.                |

---

## Conséquences acceptées

1. **Une exception après réservation, sur un outil `send`, consomme la clé.** Le
   client doit en employer une neuve. C'est le sens sûr, et le message de refus
   du § 15 doit le dire — il dit déjà « employer une clé neuve pour un nouvel
   effet ».
2. **`AffineursDAppel` gagne un membre qui ne mute rien.** Son commentaire dit
   aujourd'hui que chacun de ses membres est « un point de MUTATION de la ligne ».
   La phrase devient fausse d'un tiers, et elle doit être **réécrite** plutôt que
   laissée : l'objet est ce que le corps reçoit **pour connaître et pour affiner**
   la ligne. Une phrase fausse sur un contrat est ce qui fait supprimer la garde
   suivante.
3. **Le journal et l'idempotence peuvent DIVERGER sur un même appel** —
   `externalEffect: false` et clé fermée en `done`. Ce n'est pas une
   contradiction : le premier dit ce que le socle **a vu**, le second ce qu'il
   **refuse de parier**. Le § 24 doit lire les deux, et un tableau de bord qui
   n'en lit qu'un reste faux.

---

## Borne d'éprouvabilité — la première branche ne décide d'aucun cas atteignable

**Ajoutée au lot 2, sur la mesure du lot 1d. Ce n'est pas un défaut : c'est une
propriété de la décision, et elle doit être écrite là où la décision vit.**

`issueDeReservation()` a trois branches. La première lit le cliquet de
l'ADR 0017 (`effetExterieurSurvenu`) ; elle est la bonne, et **elle n'est
décisive nulle part aujourd'hui** :

- le cliquet n'est levé que sous `estEffetExterieur(outil.effect)` ;
- or la troisième branche rend déjà `done` sous exactement cette condition.

Mesuré :

> `[N6 · décision] 4 couple(s) ATTEIGNABLE(s) confronté(s) · 4 écarté(s) · 0 cas
où la LECTURE du cliquet change l'issue`

avec son témoin de capacité apparié — `16 cellule(s) parcourue(s) sur 4 effet(s)
· 2 issue(s) DISTINCTE(s)` — sans lequel « 0 cas » se lirait « cette table ne
mesure rien ».

### Ce qui a réellement refermé le défaut du lot 1c

**`terminaisonRendue`**, la deuxième branche, posée juste après le retour de
l'étape 14. C'est elle qui empêche qu'un courrier parti reparte quand la panne
est POSTÉRIEURE au retour de l'adaptateur. L'écrire importe : attribuer ce
mérite au cliquet ferait déplacer le mauvais garde-fou le jour où quelqu'un
voudrait en retirer un.

### Pourquoi la première branche reste

Elle est la **provision** du jour où la troisième cessera d'être aussi
franchement fail-closed — si l'on distinguait, par exemple, un `send` dont on
SAIT que l'adaptateur n'a pas été atteint. Ce jour-là, la lecture du cliquet sera
la seule à savoir que quelque chose EST sorti.

⚠️ **Et ce jour-là, écrire D'ABORD le témoin de bout en bout qui distingue les
deux branches — il n'en existe AUCUN.** Les mutations M3 et M6 du lot 1d ne font
rougir aucun test de l'épreuve ; la seule garde du dépôt qui rougit sur M3 appelle
la fonction PURE avec un couple que la chaîne ne produit pas. Affiner la
troisième branche sans ce témoin, ce serait rendre décisive une branche que rien
n'éprouve — c'est-à-dire refaire, à l'envers, la panne du lot 1c.

---

## Ce qui reste OUVERT

- **La panne entre la réservation et l'appel de l'adaptateur** — écart assumé
  ci-dessus. Le remède serait le second cliquet, refusé pour le coût de la
  fenêtre d'empreinte. À reprendre si les trois colonnes que l'ADR 0017 laisse
  ouvertes atterrissent un jour dans le même lot : ce serait le moment.
- **`intention.avantEffet` est appelé HORS du `try … finally`.** S'il lève,
  `cloturerLimites` n'est jamais atteint et la réservation demeure `in_flight`
  jusqu'au TTL. C'est fail-closed — rien ne part, aucun rejeu ne double —, mais
  un port d'intention défaillant suffit à rendre un outil indisponible. Le
  remède est d'un mot (faire entrer l'appel dans le `try`, la réservation étant
  posée à l'étape 13, donc avant) et il appartient à l'ADR 0022, qui décide de
  la ligne d'intention.
