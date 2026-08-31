# ADR 0025 — Deux transports, un seul noyau, et le contournement rendu inconstructible

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/transport/contrat.ts`, `core/transport/http.ts` et
  `core/transport/stdio.ts` (à écrire), `core/chaine/orchestrateur.ts`,
  `core/identite/session.ts` (`FRAPPEURS_DE_SESSION`), `ops/demarrage/etages.ts`
- **Sources** : cahier des charges v6, § 11 (protocole, quatorze étapes, colonne
  par transport, anti DNS-rebinding), § 23 (local = stdio, production = HTTP),
  § 30 (couper une instance stdio) ; ADR 0014

---

## Le sujet

Le § 11 pose quatorze étapes et « une colonne par transport ». Le lot 1b a écrit
cette colonne (`colonneDuTransport`, `identiteStdio`, `identiteHttp`,
`PRINCIPAL_STDIO`, `SCOPES_PAR_DEFAUT_STDIO`) et l'a entièrement **dérivée**
d'`APPEL_STEPS.httpSeul`. Ce qui manquait est ce qui l'appelle.

Le défaut à rendre impossible n'est pas « un transport mal écrit » : c'est **un
transport qui contournerait une étape**. Un interdit écrit dans un commentaire ne
tient pas ; ce qui tient est un interdit qu'on ne peut pas construire.

---

## Décision

### 1 · Trois interdits de construction, pas une règle

**a. Un transport ne peut pas fabriquer une identité.** `IdentiteAppelante`
porte un `SessionId`, type marqué dont la marque est un `unique symbol` **non
exporté** : aucun module ne peut nommer la propriété, donc aucun ne peut écrire
un littéral assignable. Un transport passe par `identiteStdio` ou
`identiteHttp`, ou il ne compile pas. C'est déjà acquis (ADR 0014) ; cette ADR
en fait la première ligne de la défense plutôt qu'un effet de bord.

**b. Un transport n'importe aucun module d'étape.** L'ensemble interdit est
**dérivé d'`EXECUTANTS_ETAPES`**, jamais listé : un transport qui importerait
`etape-05-scopes.ts` ou `etape-14-execution.ts` refait la chaîne à côté du
noyau, et c'est le contournement recherché. Une liste écrite à la main aurait
divergé au premier module d'étape ajouté — et la divergence aurait été muette.

**c. La couverture est vérifiée au démarrage.**
`verifierCouvertureDesEtapes(transport)` est appelée à l'étage 6 de
`ETAGES_DU_DEMARRAGE`, pas seulement en test. Une étape applicable sans exécutant
fait **refuser le démarrage** plutôt que de laisser traverser une chaîne trouée.

⚠️ **Ce que ces trois interdits ne couvrent pas, écrit avec eux.** Aucun ne voit
un transport qui appellerait bien le noyau mais lui **mentirait** sur ce que les
étapes 1 à 4 ont établi — un `principal` inventé, une `deadline` déjà passée.
C'est l'objet de l'ADR 0029, et il fallait le dire ici pour que « le
contournement est impossible » ne se lise pas plus large que la mesure.

### 2 · Streamable HTTP — l'étape 1 avant tout traitement

JSON-RPC 2.0 sur `POST /api/mcp`. SSE déprécié. Une seule primitive en v1 :
`tools`.

**L'anti DNS-rebinding s'exécute avant l'analyse syntaxique du corps.** Le § 11
écrit « avant tout traitement », et la borne est celle-là : avant le parseur
JSON, avant toute lecture de base, avant le moindre journal. Un analyseur JSON
est une surface d'attaque ; le sens de l'étape 1 est qu'un hôte non autorisé ne
l'atteigne jamais.

**Une liste blanche vide est un refus de démarrer, pas un « tout autoriser ».**
C'est le mode de défaillance classique de ce contrôle : la variable est mal
orthographiée, la liste se résout à zéro entrée, la boucle ne trouve aucun refus
à prononcer, et la garde reste verte. `OPS_ALLOWED_HOSTS` vide fait donc échouer
l'étage 6.

### 3 · stdio — une session par exécution du démon, un principal réservé

Rien n'est à réinventer, et c'est le point : `SESSION_DE_CETTE_EXECUTION`
(`core/chaine/identite.ts`) est frappée au chargement du module,
`PRINCIPAL_STDIO` est imposé et non paramétré, `SCOPES_PAR_DEFAUT_STDIO` est
dérivé de trois totalités et ne couvre aucun effet extérieur.

Les quatre étapes « HTTP seul » ne s'appliquent pas : stdio n'a ni `Host`, ni
jeton, ni audience, ni `jti` à révoquer. `colonneDuTransport("stdio")` le dérive
déjà d'`APPEL_STEPS`, et rien ne doit le réécrire.

⚠️ Le § 30 note qu'une instance stdio **n'a pas de jeton à révoquer** : la couper
suit une procédure dédiée. C'est précisément pourquoi ses scopes par défaut sont
les plus étroits que la table du § 19.2 permette.

### 4 · Le `sessionId` HTTP vient de l'octroi, jamais du client

Il est lu dans la ligne `ops_token` relue à l'étape 4 — qui est déjà lue à cet
instant, donc il ne coûte aucune lecture de plus. Il **ne se dérive pas du
`jti`** : le jeton d'accès vit une heure, une marque de provenance quatre. Une
session dérivée du `jti` s'effacerait trois fois par TTL, sur un
rafraîchissement que le client MCP conduit tout seul, et la garde du § 20 se
désarmerait d'elle-même sans qu'aucun compte ne bouge (ADR 0014).

### 5 · Écart mesuré et corrigé — `FRAPPEURS_DE_SESSION` nomme les mauvais modules

`core/identite/session.ts` déclare aujourd'hui :

```
FRAPPEURS_DE_SESSION = ["core/chaine/identite.ts", "core/transport/http.ts", "core/transport/stdio.ts"]
```

Sa propre prose dit pourtant, deux lignes plus haut, que frapper est « le geste
du **serveur d'autorisation** à l'octroi, et celui du démon stdio à son
démarrage ». Les deux ne peuvent pas être vrais ensemble :

- `core/transport/http.ts` **relit**, il ne frappe pas. Il figure déjà, à juste
  titre, dans `APPELANTS_DE_LA_RELECTURE` ;
- `core/transport/stdio.ts` ne frappe pas non plus : la session stdio est
  frappée par `core/chaine/identite.ts`, qui est déjà dans la liste.

**Liste cible : `core/chaine/identite.ts` et `core/auth/octroi.ts`.** La liste
des frappeurs doit rester **plus courte** que celle des relecteurs, et le cliquet
de `core/chaine/identite.spec.ts` continue de l'exiger. La correction est due au
constructeur du transport, en même temps que l'émetteur : la faire seule
laisserait la liste nommer un fichier qui n'existe pas encore, ce que le cliquet
tolère explicitement mais qui perdrait la moitié du sens.

⚠️ **Cet écart n'était pas visible avant ce lot.** Il fallait écrire l'émetteur
pour que « qui frappe » cesse d'être une question théorique — c'est pourquoi il
est relevé ici et non au lot 1b.

---

## Ce que la garde doit tenir

- **le graphe d'imports** des deux fichiers de transport, confronté à l'ensemble
  interdit **dérivé** d'`EXECUTANTS_ETAPES`, avec un témoin fabriqué : un
  transport auquel on ajoute un import de module d'étape doit produire exactement
  une anomalie, nommant le module ;
- **le compte de modules balayés et d'imports lus**. Une garde qui lirait zéro
  fichier serait verte pour la pire des raisons ;
- **la couverture des étapes par transport**, déjà tenue par
  `verifierCouvertureDesEtapes`, désormais appelée aussi au démarrage.

---

## Conséquences acceptées

- Les deux transports ne partagent pas leur enveloppe — JSON-RPC d'un côté,
  lignes sur l'entrée standard de l'autre. Ils partagent **tout ce qui décide**,
  et rien d'autre. Une couche d'abstraction commune sur l'enveloppe serait une
  troisième chose à tenir, pour un bénéfice nul.
- L'étape 1 n'existe qu'en HTTP. Le transport stdio ne valide aucun `Host` — il
  n'en reçoit pas. La colonne le dit, et aucune garde ne doit chercher une
  validation absente.
