# `voice/commandes/` — dépendances

## Aucune dépendance nouvelle. `package.json` n'est pas à toucher.

Le module n'importe rien hors du dépôt. La liste complète de ce qu'il tire :

| Import                       | Provenance                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:crypto` (`createHash`) | runtime Node, déjà employé par `core/profiles/profiles.ts`                                                                                          |
| `core/profiles/index.js`     | `reduitStrictement`, `outilsServis`, `PROFILE_NAMES`, `jsonCanonique`, types                                                                        |
| `core/policy/index.js`       | `classerChangement`, `canalDelivreUneConfirmation`, `canauxDeConfirmation`, `CANAUX`, `SCOPE_DESSERRAGE`, `TTL_DESSERRAGE_MAX_MS`, types            |
| `core/types.js`              | `POLICY_LEVELS`, `lePlusStrict`, `Effect`, `PolicyLevel`, `OpsScope`                                                                                |
| `core/audit/index.js`        | **types et constantes seulement** — `ContenuLigne`, `Decision`, `Outcome`, `VERSION_INCONNUE`, `EFFET_EXTERIEUR_NON_SURVENU`, `ARG_HASH_NON_VALIDE` |
| `vitest`                     | déjà en `devDependencies`                                                                                                                           |

C'est délibéré, et c'est ce que le § 30 attend de cette part du poste vocal :
**ni micro, ni modèle, ni réseau, ni base, ni horloge propre.** Tout ce qui entre
est passé en argument ; tout ce qui sort est un nombre ou un verdict.

## Ce que le LOT 8 devra ajouter, et qui n'est PAS ici

Les dépendances de la voix elle-même — reconnaissance et synthèse — ne
concernent pas ce dossier et n'ont **pas** été ajoutées :

- **SAPI / `System.Speech`** (grammaire fermée, synthèse `fr-FR`) : présent
  d'origine sur Windows, atteint par sous-processus PowerShell. Aucun paquet npm.
  Mesuré par l'ADR 0010 : 119 ms en grammaire fermée, 116 ms de synthèse.
- **Moteur de dictée libre** (`smart-whisper`, `sherpa-onnx-node`, `vosk`…) :
  **rien n'est choisi**, et l'ADR 0010 (I-1) fait de ce choix le poste à risque
  du chiffrage. À trancher sur mesure, pas sur avis.
- **`@anthropic-ai/claude-agent-sdk`** : pour le démon pilote (voie B), pas pour
  les commandes hors modèle — qui existent précisément pour **ne pas** passer par
  lui.

## Une remarque d'exploitation

`core/audit/index.js` n'est importé que pour des **types** et des **constantes
convenues**. Aucune valeur calculée, aucun appel. Si ce dossier devait un jour
appeler `core/audit`, ce serait le signe qu'il s'est mis à journaliser lui-même —
ce que `journal.ts` interdit explicitement : il déclare le port, il ne
l'implémente pas.
