# ADR 0051 — Le catalogue se lit dans deux documents, et le préfixe ne se pose qu'une fois

- **Statut** : acceptée
- **Date** : 2026-09-02
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 5)
- **Portée** : `core/registry/catalogue.ts`, `core/registry/catalogue.spec.ts`,
  `core/federe/raccordement.ts`, `core/federe/raccordement.spec.ts`,
  `adapters/axionia/verrou.spec.ts`
- **Sources** : cahier des charges v6, § 12 (`ops_tool`), § 13.1 (pagination),
  § 13.3 (compaction, `maxBytes`), § 13.4 (dépréciation), § 20 (épinglage),
  § 31 (`recordIds`) ; ADR 0015 (les `idFields` n'exonèrent rien) ; ADR 0050
  (la persistance de l'admission)

---

## Le fait

`OutilDuCatalogue` (`core/chaine/etapes.ts`) exige **cinq valeurs que `ops_tool`
ne porte pas** : `pagination`, `compaction`, `maxBytes`, `idFields` et
`adapterVersion`. Aucun lecteur n'existait, et le lot précédent a posé l'écrivain
sans trancher où ces cinq valeurs seraient lues.

## Décision 1 · Elles se lisent dans le manifeste ÉPINGLÉ, pas en colonnes neuves

Deux voies s'offraient :

1. **Quatre colonnes de plus au schéma**, écrites à l'admission depuis le
   manifeste — donc **recopiées**. Une recopie n'est couverte par **aucune
   empreinte** : le jour où une console, une migration ou une main les
   modifierait, `manifestSha` resterait vrai et le socle compacterait selon des
   annotations que personne n'a relues.
2. **Les relire dans `adapters/<id>/manifeste.json`**, dont le SHA est confronté
   au verrou à chaque admission.

C'est la seconde. Le critère n'est pas l'économie de migration, c'est **l'endroit
où vit la vérité : sous l'empreinte, ou à côté d'elle**. Or ces cinq valeurs
gouvernent précisément ce qui **sort** du socle :

- `maxBytes` plafonne la charge servie (§ 13.3) ;
- `compaction.tier2` dit quels champs sont retirés au deuxième palier ;
- `idFields` alimente `recordIds`, donc la purge du § 31 ;
- `pagination` est ce que l'étape 9 interroge ;
- `adapterVersion` est ce que le journal appelle « la version qui a servi ».

La garde ne le dit pas en prose : elle **change le manifeste sans toucher la
ligne**, et relit `maxBytes: 4096` et `idFields: ["uuid"]`.

## Décision 2 · Une ligne sans entrée au manifeste n'est PAS servie

Elle sort en `sansEntreeAuManifeste`, nommée, et elle n'entre pas au catalogue.
**Un défaut serait permissif** : inventer un `maxBytes` ou une `compaction`, ce
serait servir une charge que personne n'a bornée. La ligne existe, l'épingle
n'existe pas — on ne sert pas.

Le témoin réel le mesure sur les sept outils d'Axion-IA : lignes en base, aucun
manifeste fourni → **0 servi**, et l'adaptateur muet est nommé.

## Décision 3 · `effect`, `dataClass`, `idempotency` font foi depuis `ops_tool`

Le § 20 dit : « tout écart entre `effect`/`dataClass` **épinglés ici** et la
valeur reçue DÉSACTIVE l'outil et alerte ». `ops_tool` **est** l'épingle de
gouvernance ; préférer le manifeste retirerait à l'étape 6 la valeur qu'elle est
chargée de confronter.

Les deux documents doivent donc dire la même chose — la ligne a été écrite depuis
le manifeste épinglé. **Quand ils divergent, l'outil sort du catalogue et le
désaccord est nommé** (`desaccords`, avec le champ, la valeur en base et la
valeur au manifeste). Une divergence signale une ligne modifiée **hors
admission** ; le socle ne choisit pas entre deux gouvernances, il ne sert pas.

## Décision 4 · Le préfixe se pose une fois, et `nomCompletDeLOutil` le VÉRIFIE

`nomCompletDeLOutil()` écrivait `` `${outil.adapterId}.${outil.name}` `` : elle
**ajoutait** le préfixe. Or `OutilDuCatalogue.name` **est déjà le nom complet** —
`enregistrerAdaptateur()` le dérive par `nomComplet(id, nomLocal)` avant de
mesurer `bytes` dessus, et `composerLeNoyau` compare `outil.name` au nom complet
demandé.

Le préfixe était donc posé **deux fois**, et c'est
`axionia.axionia.inbox.recent` qui serait parti dans `params.name` : l'adaptateur
d'en face aurait répondu « outil inconnu » sur un appel parfaitement autorisé.

**Pourquoi le défaut était invisible** : `inventaire` rendait `[]` — aucun
`OutilDuCatalogue` réel n'existait — et le seul témoin du fichier portait un
`name` **local**. Une fixture décidait du sens du champ à la place du type, et
elle a tenu vert tout un lot. Le premier catalogue réel l'aurait fait sortir, sur
le premier appel de bout en bout.

La fonction **refuse** désormais (`nom_non_prefixe`) au lieu de rattraper : un
`name` sans préfixe signale un `OutilDuCatalogue` construit hors du registre, et
le re-préfixer masquerait cette construction-là.

## Ce que cette décision ne fait pas

- Elle **ne filtre ni par profil ni par `enabled`**. `construireLeCatalogue()`
  rend l'**inventaire** ; `outilsServis()` décide de ce qui est servi et
  l'étape 7 refuse. Filtrer ici ferait deux endroits où un outil disparaît, et le
  second ne saurait pas dire lequel des deux l'a retiré.
- Elle **ne branche rien** à la racine — c'est le lot suivant.
- `maintenant` est un **paramètre sans défaut** : `retireDeLaListe` se dérive de
  `retiredAt <= maintenant`, et une garde qui ne peut pas choisir son instant ne
  mesure pas une échéance.

## Conséquences

La chaîne complète est éprouvée sur les documents **réels** dans
`adapters/axionia/verrou.spec.ts` : manifeste épinglé → admission → `ops_tool` →
relecture → catalogue → nom sur le fil. Mesure du 2026-09-02 :

```
[bout en bout] 7 ligne(s) ops_tool insérée(s) · 7 relue(s) · 7 au catalogue ·
7 servi(s) au profil « admin » · 0 sans épingle · 0 désaccord(s)
[bout en bout] sur le fil : axionia.agenda.jour, axionia.agenda.semaine,
axionia.deploiement.etat, axionia.inbox.recent, axionia.pilotage.alertes,
axionia.qualiopi.conformite, axionia.rendezvous.list
```

Elle s'arrête **à la porte du réseau**, qui appartient à `appel.ts` et exige un
secret réel et un endpoint joignable.
