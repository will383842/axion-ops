# ADR 0049 — La voie vocale tranchée, et ce que Claude exige vraiment

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin
- **Portée** : `core/auth/surfaces-claude.ts`, `core/auth/surfaces-claude.spec.ts`
- **Sources** : cahier des charges v6, § 30 (« une voie ne peut pas être
  recommandée et à trancher ») ; documentation Anthropic relevée le 2026-09-01 —
  _Use voice mode_, _Use connectors to extend Claude's capabilities_,
  _Get started with custom connectors using remote MCP_,
  _Authentication for connectors_

---

## Le fait qui rend cette décision nécessaire

Le § 30 posait trois voies et refusait d'en recommander une, parce que personne
n'avait vérifié **ce que le client fournit réellement**. Il chiffrait un
préalable de 0,5 j pour lever le doute. Ce préalable est fait ; voici ce qu'il a
trouvé.

### Ce que la documentation dit, et qui tranche

- **Le mode vocal se sert des outils connectés.** « In voice mode, Claude can use
  the tools you've connected. » Il est disponible sur mobile, bureau **et web**.
- **Le mobile atteint les serveurs MCP distants**, mais on les **ajoute** depuis
  le web ou le bureau : « Claude for iOS and Android can access remote MCP
  servers, but adding new ones must be done through the web or desktop apps. »
- **Une seule infrastructure d'authentification** sert toutes les surfaces : « The
  same infrastructure backs Claude.ai, Claude Desktop, Claude mobile, Claude
  Code, and Cowork. »

**Donc la voie A existe** : on ajoute le connecteur une fois depuis le bureau, et
il sert ensuite au clavier comme à la voix, y compris depuis le téléphone.

### Le cahier des charges se trompait sur l'interruption

Le § 30 écrivait, en colonne « ce que ça donne » de la voie A : « Claude garde le
tour de parole : **tu ne peux pas l'interrompre**. » C'est **faux**. La page du
mode vocal dit l'inverse : « If Claude does interrupt you, simply start speaking
again — **Claude will stop and listen**. »

C'est le deuxième écart du même genre trouvé dans ce cahier le même jour, après
le scope `ZohoMail.attachments.ALL` qui n'existait pas. Les deux ont la même
cause : **une affirmation sur un système tiers, écrite sans confronter la
documentation de ce tiers.**

Ce qui reste vrai de l'avantage de la voie B, une fois l'interruption retirée :
les **mots hors modèle**. « Stop » reconnu localement coupe sans aller-retour
réseau ; en voie A, l'interruption passe par le service.

## La décision

**La voie A est retenue pour la mise en service.** Elle coûte 2 j au lieu de 6, et
la seule chose qu'elle ne donne pas — la reconnaissance locale des cinq mots de
contrôle — n'est pas un préalable à l'usage.

**La voie B n'est pas écartée : elle est différée.** Le socle ne change pas selon
la voie ; seule l'interface change. Rien de ce qui est décidé ici ne la ferme.

**La voie C reste écartée**, sans changement.

## Ce que le socle doit porter, et qui n'y était pas

Confrontation faite le 2026-09-01 entre la documentation d'Anthropic et
`core/auth/`. Ce qui existait déjà : les deux documents `/.well-known/`, le défi
`WWW-Authenticate` sur `401`, PKCE `S256` obligatoire avec `plain` refusé, et les
hôtes de bouclage reconnus.

Trois manques, dont deux empêchent purement et simplement la connexion :

1. **`https://claude.ai/api/mcp/auth_callback` n'était nulle part.** C'est l'URI
   de rappel de toutes les surfaces hébergées. Sans elle, le rappel est refusé
   après le consentement — au moment où l'on croit avoir fini.
2. **Aucun traitement de `redirect_uri`, donc rien qui ignore le port** sur un
   rappel de boucle locale. Claude Code écoute sur un **port éphémère** et
   déclare ses rappels **sans port** ; une comparaison stricte échoue à chaque
   session, avec un port différent à chaque fois.
3. **`offline_access` n'était pas annoncée.** Claude ne la demande que si elle
   figure dans `scopes_supported` — l'annonce **crée** la capacité. Ne pas
   l'annoncer ne produit aucune erreur : seulement une reconnexion à chaque
   expiration, que personne ne rattache à cette ligne.

## L'enregistrement du client : les identifiants statiques, pas DCR

Trois voies existent pour que Claude obtienne un `client_id`. La documentation
déconseille DCR — « DCR causes Claude to register a new client on every fresh
connection » — et CIMD exige **deux** annonces conjointes, faute de quoi Claude
retombe sur DCR **sans le dire**.

Pour un connecteur personnalisé, la documentation décrit exactement notre cas :
« Supplying your own pre-registered client ID […] avoids dynamic client
registration entirely. » **Retenu.** Aucun endpoint public supplémentaire, aucun
client fantôme accumulé, et le secret reste optionnel.

## Ce que cela impose à l'exploitation

Le trafic d'Anthropic sort de `160.79.104.0/21`. La documentation avertit que la
découverte part de la **même** plage que les appels MCP : « a WAF in front of
your identity provider can break the flow even when your MCP server is
reachable ».

**Quatre chemins doivent rester joignables** — les deux `/.well-known/`,
`/auth/token` et `/api/mcp`. `/auth/authorize` est le seul qui peut vivre
derrière un portail d'accès, parce que c'est un **navigateur** qui s'y rend, pas
Anthropic ; l'y mettre ajoute même une authentification humaine devant le
consentement, ce qui est souhaitable.

Ceci corrige la répartition du § 21, qui plaçait `/.well-known/*` en dérogation
sans nommer `/auth/token`.

## Ce que cette décision ne fait pas

Elle **pose les valeurs, elle ne les câble pas.** `core/auth/surfaces-claude.ts`
est une table ; l'émetteur ne la lit pas encore. Le câblage — validation du
`redirect_uri`, annonce de `offline_access` dans les métadonnées, acceptation
d'un client pré-enregistré — est le lot suivant, et il est **borné par les
gardes de ce fichier**, qui rougissent déjà si une valeur dérive.

C'est délibéré : une décision qui prétendrait avoir atterri alors que rien ne la
lit serait exactement le défaut que l'ADR 0041 a fermé.

## Conséquences mesurées

- 7 tests, 7 verts. 7 témoins de rappel refusés, **chacun pour un motif distinct**
  — un refus qui rendrait toujours le même motif serait indiscernable d'un
  `return false`.
- Un piège trouvé en écrivant la garde : `new URL("localhost:3118/callback")`
  **ne lève pas** — le WHATWG lit `localhost:` comme un schéma. La garde a rougi
  sur une attente écrite de travers, ce qui est son métier.
- Le chiffrage de la voix passe de **6 j à 2 j**. L'écart de 4 j retourne au
  chantier de la console.
