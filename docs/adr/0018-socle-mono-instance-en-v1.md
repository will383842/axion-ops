# ADR 0018 — Le socle est mono-instance en v1, et deux gardes le tiennent

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (décision prise, formalisée par l'architecte du
  lot 1c)
- **Portée** : `core/instance/verrou.ts` (nouveau),
  `core/chaine/etape-11-provenance.ts` (`IndexProvenanceMemoire`),
  `core/vault/demarrage.ts` (le healthcheck, § 23), `README.md`, et la racine de
  composition
- **Sources** : CDC v6 § 01 (un outil personnel), § 20 (mise en œuvre : « un
  index en mémoire […] le healthcheck expose le nombre d'extraits indexés »),
  § 22 (écran Santé), § 23 (déploiement), § 31 (aucun cache de contenu sur
  disque)

---

## Le défaut

L'index de provenance est **local au processus**. Le § 20 l'exige — « un index
en mémoire, borné en durée et en taille […] jamais persistée » — et le § 23 ne
décrit qu'un conteneur.

Mais **rien n'interdisait d'en démarrer un second**. Deux instances derrière un
répartiteur appliqueraient la garde d'exfiltration **une fois sur deux**, selon
celle qui sert l'appel : une session marquée sur A arrive **propre** sur B,
l'étape 11 laisse passer, et **aucun compte ne le dit**.

C'est le même mode de panne que l'ADR 0014 par un autre chemin : la marque
existe, elle est cherchée au mauvais endroit.

---

## Décision

**Le socle reste MONO-INSTANCE en v1.**

C'est un outil personnel, à un seul utilisateur (§ 01). Un magasin partagé serait
de la complexité sans besoin — et il déplacerait la garde du § 20 hors du
processus qui la tient, ce qui est un coût de sûreté, pas seulement de code.

Une décision qu'aucune garde ne tient n'est qu'une intention. Celle-ci en a
**deux**, et elles ne se remplacent pas :

| Quand            | Ce qui se passe                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Au démarrage** | Un verrou EXCLUSIF est pris avant de servir quoi que ce soit. Déjà tenu ⇒ **le conteneur ne démarre pas** (§ 23). |
| **En continu**   | Le healthcheck **relit** le verrou à chaque appel et rend **503** dès qu'il n'est plus tenu.                      |

Et une borne, écrite noir sur blanc dans le README, dans `core/instance/`, dans
`etape-11-provenance.ts` et ici — quatre endroits, parce que celui qui ajoutera
un réplica ne lira pas forcément les trois autres :

> **Si le socle passe un jour à deux instances, le § 20 est à ROUVRIR AVANT.**

---

## Pourquoi les deux gardes, et pas une seule

**Le démarrage seul ne suffit pas.** Un verrou perdu en cours de vie — la
connexion au magasin est tombée, donc le verrou a pu être repris ailleurs — est
la seule forme de ce défaut qu'un contrôle de démarrage ne voit jamais. Et c'est
la forme la plus probable : personne ne démarre volontairement deux socles ; une
connexion, elle, tombe toute seule.

**Le healthcheck seul ne suffit pas non plus.** Il constate ; il n'empêche pas.
Entre le démarrage d'une seconde instance et la lecture suivante du healthcheck,
des appels sont servis avec une garde du § 20 qui ne mord qu'une fois sur deux.

---

## Pourquoi 503, alors qu'un coffre verrouillé rend 200

Les deux états ne disent pas la même chose au déploiement, et le § 23 est
explicite sur le second :

| État                  | Statut  | Pourquoi                                                                                            |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Coffre **verrouillé** | **200** | C'est l'état **normal** après chaque déploiement. Le faire rougir apprendrait à ignorer le rouge.   |
| Verrou **non tenu**   | **503** | Il dit que la garde du § 20 est **peut-être déjà** en train de ne s'appliquer qu'un appel sur deux. |

---

## Le mécanisme retenu, et pourquoi celui-là

Un **verrou consultatif de session PostgreSQL**, sur une clé dérivée de
`DOMAINE_DU_VERROU`.

| Candidat                          | Pourquoi écarté                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier verrou (`O_EXCL`)         | Ne voit que **la même machine**. Deux conteneurs sur deux hôtes ne se voient pas — or c'est précisément le cas du répartiteur.                      |
| Ligne en base avec bail et TTL    | Il faut renouveler le bail, donc une tâche de fond, donc un état de plus qui peut tomber. Et un bail expiré laisse une fenêtre ouverte.             |
| **Verrou consultatif de session** | Il **se libère tout seul quand la connexion tombe** : un socle tué par `SIGKILL` ne laisse pas un verrou orphelin qui empêcherait tout redémarrage. |

⚠️ Ce choix appartient à l'**adaptation**, pas au port. `core/` ne connaît ni
Prisma ni SQL : `VerrouDInstance` doit pouvoir être tenu par un double en
mémoire, sans quoi la garde ne serait éprouvable qu'avec une base — et une garde
qu'on ne peut pas exécuter en CI finit désactivée.

---

## Ce que le healthcheck expose, et pourquoi les deux comptes vont ensemble

Le § 20 exige déjà le **nombre d'extraits indexés** — « signal positif, pour
qu'une garde à zéro élément se voie ».

**Ce compte, seul, ne distingue pas** « aucune session marquée » de « je regarde
le mauvais index parce qu'une autre instance sert la moitié des appels ».
L'identifiant d'instance à côté du compte les distingue : deux instances servent
deux identifiants, et deux comptes qui bougent chacun de leur côté.

```
SanteMonoInstance = { instance, verrou, provenance { extraits, sessions, indetermine }, statut }
```

⚠️ **Ce qui n'y entre pas, et c'est une règle de dépôt public** : ni nom d'hôte,
ni adresse, ni identifiant de conteneur, **ni `pid` système**. L'identifiant
d'instance est opaque, frappé au démarrage, et suffit à répondre à la seule
question que le healthcheck pose — « est-ce toujours moi qui tiens le verrou ? ».
Le `pid`, qui n'ajoute rien à cette réponse, reste hors de toute sortie publique.

⚠️ **Les comptes de provenance sont DÉRIVÉS d'`EtatIndexProvenance`**
(`Pick<…>`), jamais recopiés : une saturation de plus à voir arrive ici le jour
où elle est ajoutée là-bas.

---

## Ce que la décision EXCLUT

- **Un magasin partagé en mémoire** (Redis, memcached) pour l'index de
  provenance. Il resterait « jamais persisté » au sens du § 31, mais il change la
  mise en œuvre du § 20 : la garde d'exfiltration dépendrait alors de la
  disponibilité d'un service tiers, et un magasin injoignable la rendrait muette
  au lieu de la rendre stricte. À reconsidérer **le jour où** une seconde
  instance devient nécessaire, et pas avant.
- **Trois régimes de démarrage.** `refusé`, `perdu` et `indisponible` refusent
  tous les trois, y compris le dernier : le socle qui ne peut pas savoir s'il est
  seul ne peut pas non plus journaliser — le § 11 fait de l'écriture du journal
  un invariant fail-closed, et le journal vit dans la même base. Un régime
  « démarre mais n'accepte aucun appel » aurait ajouté un état sans ajouter une
  capacité.
- **Un verrou qui se souvient.** `relire()` RELIT ; rendre un drapeau posé à
  l'acquisition ferait une garde verte exactement dans le cas où le verrou vient
  d'être perdu.
- **Une clé numérique écrite en dur.** Elle serait recopiée dans une migration et
  divergerait en silence. La clé dérive de `DOMAINE_DU_VERROU`, qui est
  **versionné** : le jour où la sémantique change, une ancienne instance ne
  bloque pas une nouvelle par accident.
- **Une quinzième étape de la chaîne d'appel.** Le refus n'est pas un refus
  d'appel : c'est un refus de **démarrage**, comme le coffre absent (§ 23).
  L'ajouter à `APPEL_STEPS` aurait élargi `AppelStep` pour un contrôle qui ne se
  prononce jamais par appel — voir ADR 0005 sur le coût d'un numéro.

---

## Ce que le constructeur ④ doit écrire

1. `VerrouPostgres` (adaptation) **et** `VerrouEnMemoire` (double), tenant le
   même `VerrouDInstance`.
2. `deciderDemarrageMonoInstance(etat)` — **pure**, comme
   `deciderDemarrage(etatCoffre)` de `core/vault/demarrage.ts`, et couverte sur
   les **quatre** états. Le message nomme le geste, jamais un identifiant
   d'infrastructure.
3. Le câblage du healthcheck : `relire()` à chaque appel, statut dérivé de
   `STATUT_HEALTHCHECK_VERROU_*`.
4. La borne dans le README (faite au lot 1c) **et** la ligne d'exploitation :
   Coolify ne doit pas être réglé sur plus d'un réplica.

### Les trois gardes

| Garde                                                                                                                                               | Ce qu'elle annonce                                        | Le témoin qui la fait rougir                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **G1 — un second démarrage concurrent est DÉTECTABLE.** Deux acquisitions sur le même double : la seconde rend `refusé`, et `demarre` vaut `false`. | tentatives · acquisitions réussies · démarrages autorisés | Un verrou réentrant (qui accorderait deux fois) : le compte de démarrages passe à 2. |
| **G2 — la décision couvre les QUATRE états.** Dérivée d'`ETATS_DU_VERROU`, jamais d'une liste écrite.                                               | états confrontés · états qui démarrent                    | Un état ajouté à `ETATS_DU_VERROU` sans décision : la garde le voit le jour même.    |
| **G3 — un verrou perdu fait rougir le healthcheck.** `relire()` rend `perdu` après une acquisition réussie.                                         | appels de `relire` · statuts rendus · lignes à 503        | Un healthcheck qui se souviendrait de l'acquisition : il rendrait 200.               |

⚠️ **G1 et G3 sont deux gardes, pas une.** G1 couvre le démarrage, G3 la vie du
processus — et c'est G3 qui couvre le cas réel (la connexion tombe), celui que
personne ne provoque volontairement.

---

## Conséquences acceptées

1. **Aucune haute disponibilité en v1.** Le socle redémarre, il ne bascule pas.
   C'est cohérent avec le § 23 (un conteneur) et avec le § 30, qui décrit déjà la
   coupure comme une procédure, pas comme un basculement.
2. **Un redéploiement sans recouvrement.** L'ancienne instance doit avoir rendu
   le verrou avant que la nouvelle ne le prenne. Un déploiement en recouvrement
   (`rolling`) ferait échouer le démarrage de la nouvelle — ce qui est le
   comportement voulu, mais qui doit être **su** de qui règle Coolify.
3. **Le verrou est un point de panne de plus au démarrage.** Il partage la base
   du journal : s'il tombe, le socle ne démarre pas — et il n'aurait de toute
   façon pas pu journaliser.

---

## Ce qui reste OUVERT

- **Le CDC ne dit nulle part que le socle est mono-instance.** Il ne décrit qu'un
  conteneur, ce qui n'est pas la même chose qu'une interdiction. Écart porté au
  README : ce dépôt porte désormais une contrainte que le document ne pose pas.
- **La fenêtre entre deux lectures du healthcheck.** G3 constate au plus tard à
  la lecture suivante ; les appels servis entre-temps l'ont été avec une garde
  douteuse. La refermer exigerait de relire le verrou **à chaque appel d'outil**,
  c'est-à-dire un aller-retour de base sur le chemin chaud. Non pris, et chiffré
  comme tel : l'intervalle du healthcheck est la borne réelle de cette garde.
