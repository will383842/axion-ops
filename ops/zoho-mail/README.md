# `ops/zoho-mail/` — un CHANTIER, pas un adaptateur

Ce dossier a vécu sous `adapters/zoho-mail/` jusqu'au 2026-09-02. Il en est sorti
parce qu'il ne contient **aucun adaptateur** : pas de manifeste, pas de
`definirAdaptateur()`, pas un outil. Il contient :

- `bootstrap/` — l'amorçage OAuth du § 27, **écrit et jamais lancé** (`DEPS.md`) ;
- `sondes/` — cinq mesures d'exploitation jetables (M2, `README.md`).

Le harnais de conformité (`ops/conformite-ci.ts`) exige que tout ce qui vit sous
`adapters/` soit épinglé dans `core/registry/adapters.lock.json` par son
`manifestSha`. Un dossier sans manifeste ne PEUT pas l'être : le laisser là
condamnait `main` à rester rouge (trois runs, du 1er au 2 septembre), et
l'épingler avec une empreinte inventée aurait fait admettre au socle un
manifeste qui n'existe pas.

Le jour où l'adaptateur Zoho existe — un manifeste, des outils, le harnais à neuf
contrôles vert — il naît sous `adapters/zoho-mail/` avec son entrée de verrou,
et ce chantier le rejoint ou disparaît. Rester sous `ops/` le garde dans le
périmètre des gardes du dépôt (`DOSSIERS_DE_SOURCES`), ce qu'un dossier neuf à
la racine n'aurait pas fait.
