# ADR 0053 — La racine branchée : l'inventaire, le fédéré, et le catalogue servi

- **Statut** : acceptée
- **Date** : 2026-09-02
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 5)
- **Portée** : `ops/index.ts`, `ops/main.ts`, `ops/adaptateurs-epingles.ts`,
  `ops/racine-branchee.spec.ts`, `.env.example`
- **Sources** : cahier des charges v6, § 08, § 11, § 12, § 14 (correction 3),
  § 20, § 23 ; ADR 0039 (la composition de la chaîne à la racine) ; ADR 0050,
  0051, 0052

---

## Le fait

`ops/index.ts` déclarait, mot pour mot, « aucun verrou, aucun manifeste »
(`lireLeLockDAdaptateurs → { present: false }`, `manifestesAAdmettre: []`) et
servait `outilsEpingles = []`, avec ce commentaire : « le zéro est une mesure,
pas un bouchon ».

**Le zéro était bien une mesure — celle d'un montage qui ne regardait pas le
disque.** Le verrou existait (`core/registry/adapters.lock.json`), l'instantané
d'`axionia` existait (`adapters/axionia/manifeste.json`), et la racine ne les
ouvrait pas.

## Décision 1 · La racine lit les deux documents, AVANT tout démarrage

`lireLesAdaptateursEpingles(SOURCE_DU_DEPOT)` est appelé avant le coffre. La
lecture ne décide rien — l'étage 5 confronte, admet ou désactive — mais elle est
**annoncée** avant que quoi que ce soit ne démarre : un exploitant qui voit
« 0 instantané trouvé » sait déjà que son socle ne servira rien.

## Décision 2 · L'étage 5 POSE ce qu'il admet

`DependancesDuSocle.depotDuRegistre` est **obligatoire, même pour valoir
`null`** — comme `federe` avant lui. Un champ facultatif se serait lu « on n'y a
pas pensé » ; celui-ci oblige chaque montage à **dire** s'il pose ou non.

Une écriture qui échoue **n'arrête pas le démarrage** : elle est comptée
(`echecsDEcriture`) et l'adaptateur est nommé, jamais le message du pilote — il
porte volontiers une URL de connexion. Un socle qui refuserait de démarrer parce
qu'une base est momentanément indisponible cesserait aussi de servir la console,
par laquelle on répare.

Les trois comptes neufs (`lignesOpsToolPosees`, `outilsOrphelins`,
`echecsDEcriture`) sont annoncés **même à zéro** : un zéro de lignes posées
distingue « rien à poser » de « personne n'a écrit », et c'est exactement la
confusion que ce lot est venu défaire.

## Décision 3 · L'inventaire est une FONCTION, pas un tableau

`ops_tool.enabled` bascule sans redéploiement (§ 14, correction 3). Un tableau
calculé au démarrage servirait l'ancienne valeur jusqu'au suivant — c'est-à-dire
qu'une désactivation d'urgence ne désactiverait rien.

`inventaireVivant()` relit le dépôt et reconstruit le catalogue **à chaque
appel**, et `catalogueDesAdaptateursAdmis` accepte désormais un **fournisseur**
en plus d'une liste figée. Le § 11 l'exige déjà pour `tools/list` (« la liste est
relue à chaque appel ») ; c'est maintenant vrai.

La garde ne le décrit pas : elle **désactive entre deux lectures** et compte
`avant : 1 · après : 0`.

## Décision 4 · Le port `federe` est fourni

`{ adaptateurs: { relire: id => depot.lireAdaptateur(id) }, coffre:
coffreCommeLecture(coffre) }`. Il valait `null` tant que l'inventaire était vide,
avec pour conséquence qu'un `tools/call` traversait les quatorze étapes puis
butait sur `ErreurAdaptateurNonAdmis`.

Le fournir déclare **qu'on a de quoi joindre quelqu'un — pas qu'on l'a joint** :
`construireRaccordement` refuse encore, en nommant, si l'endpoint, le mode ou le
secret ne suivent pas. Le coffre passe par le **port étroit** : ce chemin n'a
aucune raison de pouvoir écrire un secret, et un port large finit toujours par
être utilisé largement.

## Décision 5 · Une seule règle de profil, deux lecteurs

`profilServi(regle, inventaire)` = le réglage, sinon `profilLeMoinsExposant()`.
`tools/list` et `profilActif` (étape 7) l'empruntent tous les deux. **Sans cela,
`tools/list` annoncerait des outils que l'étape 7 refuserait ensuite** — un
catalogue qui ment, et un modèle qui insiste.

## Décision 6 · Deux remplaçants PROVISOIRES de la console, et leur défaut est écrit

`OPS_ENABLED_TOOLS` et `OPS_PROFILE`. Ils portent **le défaut même que le § 14
nomme** : la correction 3 veut qu'`enabled` bascule « en console, **sans
redéploiement** », et une variable d'environnement exige exactement un
redéploiement. `OPS_PROFILE` en porte un second : `ops_runtime.profile` se lit
**par principal**, une variable n'en distingue aucun.

Ils existent parce que la console n'existe pas encore, et parce qu'un socle dont
aucun outil n'est activé ne sert rien — ce qui rendrait invérifiable tout le
reste de la chaîne. Ils passent par **les mêmes gestes** que la console
(`basculerActivation`, `profilActif`) : le jour où elle arrive, ce sont ces deux
variables qui disparaissent, pas les gestes.

`OPS_PROFILE` hors de l'énumération **refuse le démarrage**. Retomber en silence
sur le repli ferait d'une faute de frappe un socle qui ne sert rien sans que
personne ne sache pourquoi.

## Décision 7 · Le secret partagé se sème dans le coffre local, sous un nom DÉRIVÉ

`axionia.mcp.shared` → `OPS_ADAPTER_SECRET_AXIONIA_MCP_SHARED`. Une table
`secretRef → variable` écrite à la main diverge au premier adaptateur ajouté, et
la divergence se découvre **en 401** — c'est-à-dire en dérangeant un tiers pour
apprendre ce qu'on savait déjà.

Une variable absente n'est **pas** un échec au démarrage : le refus appartient à
qui a besoin du secret, à l'appel, quand on sait quel outil est visé.

## Ce que la chaîne complète a rendu, mesuré

Socle démarré sur coffre local, transport `stdio`, verrou et manifeste réels :

```
[registre] verrou présent · 1 adaptateur(s) épinglé(s) [axionia] · 1 manifeste(s)
soumis à l'admission · 0 sans instantané
[catalogue] 7 ligne(s) ops_tool relue(s) · 1 manifeste(s) épinglé(s) indexé(s) ·
7 outil(s) à l'inventaire · 0 sans épingle · 0 désaccord(s) ligne/manifeste
[catalogue · servi] profil « admin » (réglé par OPS_PROFILE) · 7 outil(s) servi(s)
[chaîne] 28 champ(s) de `DependancesOrchestrateur` composé(s) · fabrique : posée
[démarrage] 7 étage(s) confronté(s), 7 franchi(s) · sert : true · coffre : ouvert
· appels d'outils acceptés : true
```

`tools/list` sur le fil stdio rend **les sept outils d'Axion-IA**, sous leur nom
complet, avec leur schéma d'entrée.

Et l'appel fédéré atteint **réellement la production** : sonde du 2026-09-02,
`https://axion-ia.com/api/mcp`, secret volontairement faux →

```
ErreurAdaptateurDistant: l'adaptateur refuse le secret partagé :
vérifier `secretRef` et la variable côté produit.
```

C'est un **401 d'Axion-IA**, donc la preuve que tout le trajet est câblé : nom
complet correct sur le fil, en-tête `x-mcp-secret` présent, route atteinte. Seule
la VALEUR du secret manque localement — elle vit dans Coolify, et n'a pas à
descendre ici.

## Deux constats MESURÉS, laissés ouverts

### 1 · Les sept outils d'Axion-IA DÉBORDENT le budget d'octets du § 14

Refus rendu par l'étape 7, sur la chaîne réelle :

```
tool_not_in_profile — 7 outil(s) servi(s) pour un plafond de 40, 23403 octet(s)
de définitions pour un plafond de 19500, sur 7 définition(s) soumises.
La définition la plus lourde : « axionia.rendezvous.list » à 3965 octet(s).
```

Ce n'est **pas** un défaut du socle : c'est le § 14 qui mord, pour la première
fois, sur un catalogue réel. Trois issues, aucune n'est prise ici — elles
appartiennent à Will : réduire les descriptions et les schémas, répartir les
sept outils sur plusieurs profils, ou relever le plafond en le justifiant. Le
socle sert aujourd'hui le sous-ensemble que `OPS_ENABLED_TOOLS` nomme.

### 2 · Un 401 de l'adaptateur ressort en `internal`, et le message dit « Réessayer »

`estAmontInjoignable()` ne reconnaît pas un 401 — à juste titre, l'adaptateur a
**répondu**. Rien d'autre ne le mappe : l'erreur remonte et le transport rend
`-32603 internal`, dont le message conseille de réessayer. **C'est exactement le
mauvais conseil pour un secret absent ou faux**, et le § 15 exige qu'un refus
dise quoi corriger.

Le précédent existe et il est nommé : `CODE_COFFRE_VERROUILLE` a été ajouté
**hors du tableau du § 15** au lot 1b, pour le cas jumeau — « rendre `internal`
mentirait sur la cause ; rendre `upstream_unavailable` mentirait autrement ».
Le même arbitrage est à refaire ici, avec son ADR, ses dérivations des deux côtés
(ADR 0047) et son témoin. **Ce lot ne le fait pas, il le NOMME.**
