# `ops/zoho-mail/sondes/` — dépendances et scripts

## Dépendances de paquet : **aucune**

Les cinq sondes n'ont besoin de **rien** qui ne soit déjà dans `package.json`.
C'est un constat, pas un objectif, et il est vérifiable ligne par ligne :

| Ce dont les sondes ont besoin | D'où ça vient                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `fetch`, `FormData`, `Blob`   | globaux de Node ≥ 18. `engines` déclare `>=22`                                    |
| `createHash`                  | `node:crypto`, **par `core/audit/canonique.ts`** — jamais réimplémenté (ADR 0020) |
| lecture/écriture du relais    | `node:fs`, `node:path`, `node:os`                                                 |
| exécution des `.ts`           | `tsx`, déjà en `devDependencies`                                                  |
| la garde des parties pures    | `vitest`, déjà en `devDependencies`                                               |

> **Aucun client HTTP tiers n'a été ajouté, et c'est un choix.** Une sonde doit
> montrer **exactement** ce qu'elle envoie et ce qu'elle reçoit : un client qui
> réessaie, suit une redirection ou normalise un en-tête ferait mesurer son
> comportement à lui. `fetch` nu est ici la bonne réponse, pas un compromis.

---

## Ce qui manque à `package.json`, et qui n'a **pas** été ajouté

`package.json` appartient à un autre chantier au moment où ce dossier est écrit.
Rien n'y a été touché. Voici ce qui y manque, avec le motif.

### 1 · Aucun script pour lancer les sondes

Elles se lancent aujourd'hui par leur chemin :

```sh
pnpm exec tsx ops/zoho-mail/sondes/sonde-01-abonnement.ts
```

Ce qui pourrait être ajouté, **si quelqu'un le juge utile** :

```jsonc
"ops:sonde:zoho:01": "tsx ops/zoho-mail/sondes/sonde-01-abonnement.ts",
"ops:sonde:zoho:02": "tsx ops/zoho-mail/sondes/sonde-02-brouillon.ts",
"ops:sonde:zoho:03": "tsx ops/zoho-mail/sondes/sonde-03-piece-jointe.ts",
"ops:sonde:zoho:04": "tsx ops/zoho-mail/sondes/sonde-04-relecture.ts",
"ops:sonde:zoho:05": "tsx ops/zoho-mail/sondes/sonde-05-envoi.ts",
```

> ⚠️ **UN SCRIPT `sondes:toutes` SERAIT UN DÉFAUT, PAS UNE COMMODITÉ.** Les
> sondes ne sont **pas** une suite : ② et ④ ont besoin d'un drapeau qui atteste
> que le destinataire vous appartient · ③ et ④ doivent se suivre de près · ⑤ a
> quatre phases, dont une qui **exige un geste humain entre deux exécutions**, et
> une autre qui peut **envoyer un courrier**. Un enchaînement automatique
> franchirait ces trois portes sans que personne ne les voie.

### 2 · Aucun réglage de sonde dans `.env.example`

`.env.example` documente les réglages du **socle**. Ceux des sondes ne sont pas
des réglages de service — ils vivent le temps d'une mesure. Ils sont documentés
dans `README.md`, § « Ce qu'il faut avoir AVANT de lancer quoi que ce soit ».

Si quelqu'un décide de les y ajouter, **ce sont des noms, jamais des valeurs** :

```
# — Mesure M2 (ops/zoho-mail/sondes/). Jetables, jamais en production.
ZOHO_ACCESS_TOKEN=""      # voie courte « client seul » — une heure, aucun coffre engagé
ZOHO_REFRESH_TOKEN=""     # ⚠️ SECOND chemin vers un secret qui vit au COFFRE — voyez README
ZOHO_SONDE_FROM=""        # doit figurer parmi les identités validées de la sonde ①
ZOHO_SONDE_TO=""          # ⚠️ UNE ADRESSE QUE VOUS POSSÉDEZ
ZOHO_ACCOUNT_ID=""        # relevé par la sonde ① ; sinon lu dans le relais
ZOHO_SONDE_RELAIS=""      # hors du dépôt, toujours. Vide = répertoire temporaire du système
```

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REGION` et `ZOHO_REDIRECT_URI` ne
figurent pas dans cette liste : ils appartiennent à
`ops/zoho-mail/bootstrap/`, et les sondes **importent leurs noms** de là
plutôt que de les retaper.

---

## Ce que ce dossier importe, et pourquoi chacun est une décision

| Import                                    | Motif                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/audit/canonique.js` → `sha256Hex`   | l'ADR 0020 interdit nommément une **seconde** implémentation de l'empreinte. Et le motif est plus fort ici : la mesure ne vaut que si elle est prise avec **la fonction que l'adaptateur emploiera**   |
| `core/transport/anti-fuite.js`            | ADR 0044 : « un seul filet, deux appelants — jamais deux écritures ». Les sondes en sont le **troisième** appelant                                                                                     |
| `ops/zoho-mail/bootstrap/autorisation.js` | il porte déjà les régions, l'hôte des comptes, l'URL des jetons, les noms des variables de client et la table des scopes du § 27. Les réécrire ici aurait fabriqué **deux dérivations d'un même fait** |

Le **seul fait neuf** écrit dans ce dossier est l'hôte de l'API du courrier —
`mail.zoho.<région>` — parce que le voisin n'en a jamais eu besoin : il autorise,
il n'appelle pas l'API. Et il est **dérivé** du domaine du voisin, pas retapé.

---

## Ce que ce dossier **n'**importe **pas**, et pourquoi

- **`core/vault/`** — les sondes ne lisent pas le coffre. M2 est au lot 0b et
  doit pouvoir tourner **avant que le socle, sa base et son coffre n'existent**.
- **`core/adapter-kit/`** — il n'y a pas d'adaptateur ici : pas de manifeste, pas
  de `defineAdapter()`, pas de `handler`. Les neuf contrôles du § 09 n'ont rien
  à mesurer sur ce dossier, et prétendre le contraire ferait passer une mesure
  pour un composant.
- **`core/adapter-kit/verdict.js`** — sa `Verdict` est le format d'une **garde**
  (`mesures`, `plancher`, `anomalies`). Un relevé de sonde n'est pas une garde :
  ses « mesures » sont des appels réseau dont l'échec **est** l'information.
  Réemployer le type aurait fait lire un relevé comme un contrôle. La **doctrine**
  est reprise — annoncer le compte, jamais la couleur ; le **type** ne l'est pas.
