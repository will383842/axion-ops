# ADR 0010 — Le poste vocal est un démon pilote (voie B)

- **Statut** : proposée — décision W-7, elle attend l'accord de Will
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin
- **Portée** : `voice/`, lot 8. Aucune conséquence sur `core/`, `adapters/`,
  `console/`.
- **Sources** : cahier des charges v6, § 30 (architecture vocale), § 31 (RGPD),
  § 18 (le micro n'authentifie personne), § 20 (desserrer n'est jamais un outil
  MCP), § 32 (critère de fin du lot 8), § 33 (chiffrage), § 35 (décision W-7).
- **Préalable** : ce document **est** le préalable de 0,5 j que le § 30 exige.
  Toutes les mesures ci-dessous ont été prises le 2026-08-31 sur le poste de
  développement.

---

## Décision

**Voie B — un démon pilote, qui conduit une session Claude Code par le SDK
d'agents et garde le tour de parole.**

La voie A (serveur MCP « voix », Claude reste le pilote) est écartée. Elle n'est
pas écartée par préférence : **elle est structurellement incapable de tenir
l'exigence d'interruption du § 30**, et cette incapacité est visible dans la
surface de types du SDK, mesurée plus bas.

Coût retenu : **0,5 j (fait) + 6 j**. Le total du § 33 passe donc à **37 j**.

---

## 1 · Ce que le poste de mesure était

Écrit pour que la portée des chiffres soit lisible, et qu'aucun ne soit relu
comme une garantie générale.

| Élément         | Valeur mesurée                                        |
| --------------- | ----------------------------------------------------- |
| Système         | Windows 11 Professionnel, build 22631                 |
| Processeur      | Intel Core i7-9750H, 6 cœurs / 12 fils                |
| Mémoire         | 15,8 Gio                                              |
| Carte graphique | NVIDIA GeForce RTX 2060 (VRAM non mesurée — voir I-5) |
| Claude Code     | 2.1.251, exécutable natif                             |
| SDK d'agents    | `@anthropic-ai/claude-agent-sdk` 0.3.251              |
| Node            | v24.12.0                                              |

**Une seule machine, un seul jour, un seul compte.** Tout ce qui suit vaut pour
ce poste. Rien n'y est vrai « en général ».

---

## 2 · ① Ce que le client Claude Code fournit nativement

### Il existe une dictée. Elle s'appelle `/voice`.

Le § 30 déclarait ne pas savoir ce que le client fournit. La réponse est : **une
dictée, oui ; une sortie parlée, non.**

Relevé dans l'exécutable `claude` 2.1.251 (recherche de chaînes dans le binaire,
`C:\Users\willi\.local\bin\claude.exe`) :

```
{type:"local",name:"voice",description:"Toggle voice mode",
 argumentHint:"[hold|tap|off]",availability:["claude-ai"],
 get isHidden(){return !awe()},supportsNonInteractive:!1, …}
```

Et le schéma de réglage correspondant :

```
voice: { enabled, mode: "hold" | "tap", autoSubmit }
   — "'hold' (default): hold to talk. 'tap': tap to start, tap to stop+submit."
   — "Submit the prompt when hold-to-talk is released (hold mode only)"
```

Ce que cela donne, point par point :

| Question du § 30         | Réponse mesurée                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entrée micro ?           | **Oui** — `/voice`, en maintien (`hold`) ou en bascule (`tap`).                                                                                                                                                                                                                                                                                                                |
| Sortie parlée ?          | **Non.** Aucune synthèse. Le binaire expose bien `startNativePlayback`, mais aucun chemin de code de lecture de réponse n'a été trouvé : la lecture sert le retour audio, pas une voix de réponse.                                                                                                                                                                             |
| Raccourci ?              | La commande `/voice` et le réglage `voice.enabled`. Le mode `hold` est un maintien de touche.                                                                                                                                                                                                                                                                                  |
| Disponible sur Windows ? | **Oui, par un module natif, et sans repli.** Le binaire contient une fonction dont la première ligne est `n("[voice] startRecording called, platform=win32")`, qui appelle `startNativeRecording`, et dont la seule sortie d'échec est `n("[voice] Windows native recording unavailable, no fallback")`. Sur Linux le repli `arecord`/SoX `rec` existe ; **sur Windows, non**. |

### Trois limites qui décident

**(a) La transcription n'est pas locale.** Le module de flux vocal ouvre un
WebSocket :

```
L = "/api/ws/speech_to_text/voice_stream"
… a.VOICE_STREAM_BASE_URL || Vt().BASE_API_URL.replace(…)
```

L'audio quitte la machine et part vers l'API. Le § 31 exige la reconnaissance
**locale** ; `/voice` ne la fournit pas. Ce point est développé au § 5.

**(b) `supportsNonInteractive: !1`.** `/voice` n'existe que dans l'interface de
terminal. Un démon ne peut pas s'en servir : ni la voie A ni la voie B ne peuvent
s'appuyer dessus. C'est un confort pour un humain assis devant un terminal, pas
une brique d'architecture.

**(c) Deux conditions d'ouverture.** `awe()` = `fjt() && pjt()`, avec
`fjt()` qui exige une session Claude.ai (le binaire répond sinon _« Voice mode
requires a Claude.ai account »_) et `pjt() = Ot("allow_voice_mode")`, un drapeau
distant. Une clé d'API seule ne l'ouvre pas.

> **Conclusion de ①** : `/voice` est réel, disponible sur Windows, utile à Will
> pour dicter dans un terminal — et **sans effet sur le choix A/B**. Il ne donne
> ni sortie parlée, ni interruption, ni commande hors modèle, ni verrouillage,
> et il est inaccessible à un programme.

---

## 3 · ② Ce que le SDK expose pour piloter une session

C'est ici que la décision se prend.

### La surface, lue dans `sdk.d.ts` (0.3.251)

`query({ prompt, options })` rend un objet `Query` qui **étend
`AsyncGenerator<SDKMessage, void>`** et porte, en plus, des requêtes de contrôle.
Les quatre besoins du § 30 s'y lisent un par un :

| Besoin du § 30          | Ce que le SDK expose                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Ouvrir une session      | `query({ prompt: AsyncIterable<SDKUserMessage>, options })` ; `resume`, `forkSession` |
| Envoyer un tour         | `streamInput(stream)` — ou, plus simplement, produire dans l'itérable d'entrée        |
| Lire la réponse en flux | `includePartialMessages: true` → événements `stream_event` / `content_block_delta`    |
| **Interrompre**         | **`interrupt(): Promise<SDKControlInterruptResponse \| undefined>`**                  |

En prime, et utiles au lot 8 : `setPermissionMode`, `setModel`, `canUseTool`,
`hooks`, `setMcpServers`, `stopTask`, `close`, `supportedCommands`.

Le commentaire d'`interrupt()` est explicite sur ce qui survit :

> _« Interrupt the current query execution. […] the resolved value is the
> interrupt receipt — `still_queued` uuids of async user messages that WILL
> still run unless cancelled first. »_

Et le champ `cancel_queued: true` de la requête de contrôle sert exactement le
bouton « stop » du § 30 : _« A Stop-means-stop-everything client (a remote UI's
Stop button) sets this true so one round-trip halts the session »_.

### La mesure, sur ce poste, ce jour

Sonde écrite pour l'occasion (entrée en flux, `includePartialMessages`, aucun
outil), exécutée sous Node 24 sur Windows. Sortie brute :

```
  4956 ms init | capabilities = ["interrupt_receipt_v1","interrupt_cancel_queued_v1","msg_lifecycle_v1"]
  6573 ms 1er delta de texte
  7117 ms interrupt() resolu en 2 ms | recu = {"still_queued":[]}
  7138 ms result | subtype = error_during_execution | is_error = true | num_turns = 2
  7778 ms FIN | deltas=5 chars=209 1er_delta=6573ms
```

**L'interruption fonctionne, sur Windows, et elle rend la main en 2 ms.** Le tour
en cours se clôt 21 ms plus tard. La capacité `interrupt_receipt_v1` est annoncée
par le client : le reçu est exploitable, il n'est pas une supposition.

### Le tour de parole, chiffré

Seconde sonde, trois tours courts sur **une session tenue ouverte** :

```
  2601 ms session prete (demarrage a froid du sous-processus)
  4073 ms tour 1 : 1er delta a 4004 ms apres l'envoi
  5322 ms tour 2 : 1er delta a 1137 ms apres l'envoi
  6942 ms tour 3 : 1er delta a 1546 ms apres l'envoi
```

Retenir : **démarrage à froid du sous-processus 2,6 s** (5,0 s sur l'autre
exécution — deux points, pas une distribution), puis **1,1 à 1,5 s jusqu'au
premier mot** sur une session déjà ouverte. Un démon qui garde la session ouverte
ne paie le démarrage qu'une fois. C'est ce qui rend un aller-retour vocal
supportable.

> ⚠️ **Borne.** Ces tours étaient triviaux (« Dis juste : un. »), sans outil ni
> lecture de fichier. Un tour réel du socle — appel d'adaptateur, politique,
> journal — sera plus long. Le chiffre mesuré borne le **plancher** de latence,
> pas le temps de réponse du poste.

### Pourquoi la voie A ne peut pas tenir

Un serveur MCP ne reçoit qu'une chose : un appel d'outil. La signature du SDK est
sans ambiguïté :

```ts
export declare function tool<Schema>(
  _name: string, _description: string, _inputSchema: Schema,
  _handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  …
): SdkMcpToolDefinition<Schema>;
```

`(args, extra) => Promise<CallToolResult>`. **Aucune prise sur le tour en
cours.** Pas d'`interrupt`, pas d'`abort`, pas de canal montant. Le serveur est
appelé _pendant_ le tour, il rend une valeur, et le modèle continue. Il n'a aucun
moyen de couper la parole à celui qui l'appelle.

Trois conséquences, qui sont les trois exigences du § 30 :

1. **Interruption** — impossible. C'est l'exigence que le § 30 déclare non
   négociable, et le § 32 en fait le critère de fin du lot 8 : _« aller-retour
   complet, interruptible ; "stop" coupe sans passer par le modèle »_.
2. **Commandes hors modèle** — impossibles par construction. En voie A, « stop »
   arrive dans un texte, donc **par le modèle**, donc entre deux tours, et au
   prix d'un aller-retour (1,1 à 1,5 s mesurés, plancher). En voie B, il est
   apparié localement (119 ms mesurés, § 4) et appelle `interrupt()` (2 ms
   mesurés). Le § 30 exige que « stop » et « annule » soient admis **sans
   facteur** parce qu'ils _réduisent_ la surface : cela suppose qu'ils soient
   reconnus hors du modèle, pas interprétés par lui.
3. **Verrouillage après inactivité** — impossible. Le § 30 veut un démon qui se
   verrouille, redemande un facteur, et **refuse tout desserrage et tout
   changement de profil hors fenêtre déverrouillée**. Un serveur MCP ne porte
   aucun état entre deux appels, et le § 20 interdit de toute façon qu'un
   desserrage passe par un outil MCP. La voie A n'a nulle part où poser ce
   verrou.

Une nuance relevée et écartée : le client expose une capacité de _canal_
(`claude/channel`, réglage `channelsEnabled`), qui permet à un serveur MCP de
**pousser un message entrant**. Cela crée un tour, cela ne coupe pas un tour en
cours ; et le réglage voisin `allowedChannelPlugins` décrit une liste blanche
d'organisation gérée. Ce n'est pas une interruption, et sa disponibilité sur un
compte personnel n'a pas été mesurée (I-4).

---

## 4 · ③ Reconnaissance et synthèse locales sur Windows

Le § 31 pose : _« Aucun sous-traitant nouveau sans DPA — d'où la reconnaissance
vocale locale. »_ Mesuré sur ce poste, sans rien installer.

### Ce qui est déjà là, sans installation

```
Reconnaissance (System.Speech, SAPI) :
  MS-1036-80-DESK | fr-FR | Microsoft Speech Recognizer 8.0 (French - France)
  MS-1033-80-DESK | en-US    MS-1031-80-DESK | de-DE    MS-3082-80-DESK | es-ES

Synthèse SAPI :      Hortense (fr-FR), Zira (en-US), David (en-US)
Synthèse OneCore :   Hortense, Julie, Paul (fr-FR) + David, Mark, Zira (en-US)
```

Un moteur de reconnaissance **français**, et trois voix de synthèse
**françaises**, présents d'origine, hors ligne, sans compte et sans réseau.

### Synthèse : le problème est réglé

Rendu hors ligne d'une phrase de 130 caractères vers un fichier WAV :

```
Synthese fr-FR hors ligne (fichier wav) : 116 ms
Taille wav : 342180 octets     (≈ 7,8 s de parole)
Methodes d'interruption exposees : SpeakAsyncCancelAll, Pause, Resume
```

**116 ms pour 7,8 s de parole, soit ~67× le temps réel.** Et `SpeakAsyncCancelAll`
existe : couper la synthèse en parlant — l'exigence « Interruption » du § 30 côté
sortie — est une méthode, pas un chantier. Intégration Node : appel d'un
sous-processus PowerShell, ou liaison natée si le surcoût de démarrage gêne (I-3).

### Reconnaissance : deux régimes, et ils ne se valent pas

Deux mesures, **même moteur, même voix, même chaîne** — synthèse d'une phrase en
WAV, puis reconnaissance de ce WAV. Seule la grammaire change.

**Grammaire fermée** (les commandes hors modèle du § 30) :

```
RECONNU : 'passe en mode developpement' | confiance 0.892 | 119 ms
```

**Dictée libre**, sur une phrase du métier :

```
ATTENDU : ouvre le tableau des relances Qualiopi et prepare un brouillon pour l'OPCO
OBTENU  : Ouvre le tableau des relances Calliope les et prépara brouillons pour locaux
confiance 0.43 | 900 ms
```

`Qualiopi` → « Calliope ». `OPCO` → « locaux ». Confiance 0,43.

> ⚠️ **Borne, à ne pas franchir en relisant.** Ces deux mesures reconnaissent de
> la **parole synthétique**, pas la voix de Will au micro. Elles prouvent que la
> chaîne est câblée et qu'elle tourne hors ligne ; elles ne prédisent pas un taux
> d'erreur humain. Ce qu'elles établissent en revanche solidement, c'est
> l'**écart entre les deux régimes** : sur une entrée identique, la grammaire
> fermée réussit et la dictée libre échoue sur le lexique même du projet. Le § 30
> nomme ce lexique : _« Qualiopi, OPCO, Coolify, numéros de PR, noms
> d'adaptateurs »_. Le moteur intégré ne le connaît pas et ne peut pas
> l'apprendre.

**Ce que cela impose à l'architecture** — et c'est le second apport de ce
préalable :

- **Les commandes hors modèle** (« stop », « annule », « brouillon seul »,
  « passe en mode dev », « verrouille ») passent par une **grammaire fermée
  SAPI** : locale, 119 ms, confiance élevée, aucune dépendance à installer,
  aucun modèle à télécharger. C'est exactement le tri du § 30 : le chemin qui
  _réduit_ la surface est aussi le plus rapide et le plus sûr.
- **La dictée libre** exige un autre moteur. SAPI ne convient pas.

### Le moteur de dictée libre : candidats, et leur coût de stockage

Tailles **mesurées** par requête HTTP sur le dépôt officiel de `whisper.cpp`
(`huggingface.co/ggerganov/whisper.cpp`), le 2026-08-31 :

| Modèle                    | Taille mesurée               |
| ------------------------- | ---------------------------- |
| `ggml-tiny.bin`           | 77 691 713 o — ~74 Mio       |
| `ggml-base.bin`           | 147 951 465 o — ~141 Mio     |
| `ggml-small.bin`          | 487 601 967 o — ~465 Mio     |
| `ggml-medium.bin`         | 1 533 763 059 o — ~1 462 Mio |
| `ggml-large-v3-turbo.bin` | 1 624 555 275 o — ~1 549 Mio |

Liaisons Node publiées, **existence vérifiée sur le registre npm, aucune
installée ni exécutée ici** : `smart-whisper` 0.8.1, `nodejs-whisper` 0.3.1,
`whisper-node` 1.1.1 (liaisons `whisper.cpp`) ; `sherpa-onnx-node` 1.13.6
(reconnaissance **et** synthèse hors ligne) ; `vosk` 0.3.39 (modèles plus petits,
qualité française réputée inférieure — **non mesurée**).

**Aucune latence n'est écrite ici pour ces moteurs, parce qu'aucune n'a été
mesurée.** La mesure qui lève l'incertitude est en I-1.

### Ce que le sous-traitant devient, ou ne devient pas

Trois faits à ne pas confondre :

1. La dictée intégrée `/voice` **envoie l'audio** à l'API (§ 2). Elle ne satisfait
   pas le § 31.
2. Le **texte** du tour part de toute façon chez le même destinataire : c'est la
   nature du projet. La reconnaissance locale ne change rien à cela.
3. Ce que la reconnaissance locale évite, c'est l'ajout d'une **catégorie de
   données** — l'enregistrement de la voix — au traitement. Le § 18 pose que le
   micro n'authentifie personne : la voix n'est donc pas utilisée à des fins
   d'identification, et ne bascule pas dans l'article 9 de ce seul fait. Cette
   lecture est **juridique, pas mesurée** : elle est à confirmer (I-2).

Décision qui en découle et qui n'est pas rouverte au lot 8 : **le poste vocal ne
transmet jamais d'audio à quiconque.** Reconnaissance locale, synthèse locale.

---

## 5 · Chiffrage de la branche retenue

Le § 33 chiffre la voie B à 6 j. Décomposition proposée :

| Poste                                                             | Charge  | Assise                                      |
| ----------------------------------------------------------------- | ------- | ------------------------------------------- |
| Démon, capture micro, détection de parole, réveil, états          | 1,5 j   | estimé                                      |
| Pilotage de session par le SDK (ouvrir, tour, flux, reprise)      | 1 j     | **ancré** — surface lue, sonde exécutée     |
| Commandes hors modèle : grammaire fermée, tri, journal            | 1 j     | **ancré** — 119 ms mesurés                  |
| Dictée libre locale : intégration, modèle, lexique du projet      | 1,5 j   | estimé — **le poste à risque**              |
| Synthèse et coupure de la synthèse (barge-in)                     | 0,5 j   | **ancré** — 116 ms et `SpeakAsyncCancelAll` |
| Verrouillage après inactivité, second facteur, refus hors fenêtre | 0,5 j   | estimé                                      |
| **Total**                                                         | **6 j** |                                             |

**Cette décomposition retombe sur les 6 j du § 33 ; elle ne les confirme pas de
façon indépendante.** Trois lignes sur six reposent sur du travail non mesuré, et
la ligne « dictée libre » porte seule le risque : elle n'était pas identifiée
avant ce préalable, puisque le § 30 supposait la question de la reconnaissance
réglée. **Les 6 j tiennent si et seulement si l'intégration de `whisper.cpp` (ou
équivalent) tient en 1,5 j** — ce qui se mesure en une demi-journée (I-1) avant
d'engager le lot.

Effet sur le § 33 : lot 8 = **0,5 j (fait) + 6 j**, total du plan **37 j**.

---

## 6 · Conséquences acceptées

- Le démon est un **second programme long** à côté du socle : à démarrer, à
  surveiller, à mettre à jour. La voie A n'aurait rien ajouté à faire tourner.
- Le démon **dépend du client Claude Code installé** : le SDK lance
  l'exécutable en sous-processus (`pathToClaudeCodeExecutable`). Une mise à jour
  du client peut déplacer le comportement sous le démon ; les capacités
  annoncées à l'`init` (`interrupt_receipt_v1`, `interrupt_cancel_queued_v1`)
  doivent être **lues au démarrage et vérifiées**, jamais supposées — le SDK dit
  lui-même « feature-detect instead of version-sniffing ».
- Le démon **n'utilise pas `/voice`**, et ne peut pas : `supportsNonInteractive`
  y vaut faux. Les deux chemins coexistent sans se rencontrer, et `/voice` reste
  disponible à Will pour dicter dans un terminal.
- Le poste télécharge et stocke un **modèle de reconnaissance** (de ~465 Mio à
  ~1,5 Gio selon le choix). C'est du poids sur la machine de Will, pas sur le
  VPS : le démon est local.
- Le § 18 tient sans changement : **le micro n'authentifie personne.** Le
  verrouillage après inactivité redemande un facteur, et la voix n'en est pas un.
- Le § 32 garde son critère de fin inchangé — il était déjà écrit pour la voie B.

---

## 7 · Incertitudes — ce qui n'a pas pu être vérifié

Aucune n'est comblée par une supposition. Chacune porte la mesure exacte qui la
lève.

| #   | Sujet non vérifié                                                                                                                                                                                                                                                                                                                                    | Mesure qui le lève                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I-1 | **Latence et exactitude d'un moteur de dictée libre local.** Aucun n'a été installé ni exécuté. Seules les tailles de modèle sont mesurées. C'est le poste à risque du chiffrage.                                                                                                                                                                    | Installer `smart-whisper` ou `sherpa-onnx-node`, charger `ggml-small` puis `ggml-medium`, dicter au micro dix phrases contenant Qualiopi, OPCO, Coolify et deux noms d'adaptateurs ; relever le temps du dernier mot à la transcription finale, et le taux d'erreur sur ces termes. **0,5 j, avant d'engager le lot 8.** |
| I-2 | **Qualification RGPD de l'enregistrement vocal** (catégorie de données ajoutée au traitement, article 9 ou non). Lecture juridique, pas mesure.                                                                                                                                                                                                      | Porter la question à l'inscription du socle au registre des traitements (§ 31) et faire trancher la ligne « poste vocal » à ce moment.                                                                                                                                                                                   |
| I-3 | **Coût de démarrage de la synthèse depuis Node.** Les 116 ms mesurés sont le temps de rendu _dans_ PowerShell ; le démarrage d'un sous-processus PowerShell par phrase n'a pas été mesuré.                                                                                                                                                           | Chronométrer 20 synthèses successives depuis Node : sous-processus par phrase contre processus PowerShell tenu ouvert. **30 min, au lot 8.**                                                                                                                                                                             |
| I-4 | **Disponibilité de la capacité de canal MCP** (`claude/channel`) sur un compte personnel. Sans effet sur la décision — un canal crée un tour, il ne coupe pas un tour en cours — mais l'affirmation « indisponible » n'a pas été mesurée.                                                                                                            | Déclarer un serveur MCP avec la capacité `claude/channel`, lancer avec `--channels`, observer si un message poussé arrive.                                                                                                                                                                                               |
| I-5 | **`/voice` est-il ouvert sur ce compte ?** `supportedCommands()` rend 49 commandes et `voice` n'y figure pas — mais cette liste est filtrée (ni `login`, ni `resume`, ni `help`, ni `mobile` n'y sont), donc **la mesure ne distingue pas « drapeau `allow_voice_mode` fermé » de « écarté parce que non interactif »**. Sans effet sur la décision. | Ouvrir une session interactive et taper `/voice`. Une seconde.                                                                                                                                                                                                                                                           |
| I-6 | **VRAM réelle de la carte** — la valeur remontée par WMI (4 Gio) est connue pour être tronquée sur 32 bits ; elle n'est pas fiable et n'est pas reprise comme un fait.                                                                                                                                                                               | `nvidia-smi --query-gpu=memory.total --format=csv`. Nécessaire seulement si I-1 conduit à une compilation CUDA.                                                                                                                                                                                                          |

---

## 8 · Ce que ce document tranche, et ce qu'il ne tranche pas

**Tranché** : la voie (B), le motif (l'interruption est une requête de contrôle
côté client, mesurée à 2 ms ; un outil MCP n'a aucune prise sur le tour en
cours), la reconnaissance et la synthèse locales, la séparation entre grammaire
fermée pour les commandes hors modèle et moteur de dictée pour le texte libre.

**Non tranché, et laissé au développeur** conformément au § 35 (« ce qui ne
remonte PAS à toi ») : le choix du moteur de dictée entre les candidats, la
forme de la détection de parole, le découpage des fichiers de `voice/`, le
mécanisme exact du réveil. Ces choix se font sur la mesure I-1, pas sur un avis.

**Ce qui reste à Will** : accepter ou refuser cette décision — c'est W-7. Le § 35
donne « voie A » comme défaut si rien n'est répondu ; ce document soutient que ce
défaut livrerait un poste qui ne satisfait aucun des trois critères de fin du
lot 8.
