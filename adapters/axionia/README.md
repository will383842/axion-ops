# `adapters/axionia/` — l'adaptateur FÉDÉRÉ d'Axion-IA, tel que le socle l'épingle

Le code de cet adaptateur ne vit pas ici : il vit dans le dépôt `axion-ia`
(`src/server/mcp/`, PR #926, ADR 0046), et répond sur `POST /api/mcp` avec un
secret partagé en en-tête (`x-mcp-secret`). Ce dossier porte ce que le socle
doit **posséder** pour l'admettre et l'appeler :

- `manifeste.json` — la copie ÉPINGLÉE du manifeste publié par l'adaptateur
  (`src/server/mcp/manifeste.json` là-bas, régénéré par `pnpm mcp:manifeste`).
  C'est d'elle que le socle lira un jour `compaction`, `maxBytes`, `idFields` et
  `pagination`, que `ops_tool` ne porte pas.
- `verrou.spec.ts` — le témoin : l'empreinte que calcule le socle sur ce fichier
  est celle du verrou ET celle que l'adaptateur publie, et le registre réel
  ADMET le manifeste avec le verrou réel. Un manifeste republié sans mise à jour
  du verrou fait rougir ici, avant de désactiver l'adaptateur au démarrage.

## Mettre à jour l'épingle

1. Dans `axion-ia` : `pnpm mcp:manifeste`, relire le diff du manifeste, fusionner.
2. Ici : recopier `manifeste.json`, reporter `manifestSha` dans
   `core/registry/adapters.lock.json`, relancer `npx vitest run adapters/axionia`.
3. Le socle redémarré relit le verrou (étage 5). Aucune mise à jour silencieuse
   n'est possible : c'est le point du § 20.

## Ce que le verrou décide, et que le manifeste n'a pas le droit de dire

`trustTier` et `maxDataClass` sont fixés ICI. Un manifeste qui les porterait est
refusé (`confiance_auto_decernee`). `secretRef` nomme une ligne d'`ops_secret`
du coffre du socle — jamais une valeur ; la valeur est la même que
`MCP_SHARED_SECRET` posée dans Coolify côté Axion-IA.
