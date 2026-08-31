# ADR 0024 — Le verrou mono-instance en PostgreSQL tient sur une connexion dédiée

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 2)
- **Portée** : `core/instance/postgres.ts` (à écrire),
  `core/instance/contrat-postgres.ts`, `core/instance/verrou.ts`,
  `ops/main.ts`, `core/epreuve/politique-chemins-de-panne.spec.ts:591`
- **Sources** : ADR 0018 ; cahier des charges v6, § 20 (index de provenance local
  au processus), § 22 (écran Santé), § 23 (environnements)

---

## Ce que l'ADR 0018 avait laissé ouvert

Elle demande deux implémentations du port : `VerrouPostgres` (adaptation) **et**
`VerrouEnMemoire` (double). Seul le double existe. Le lot 1d l'a mesuré et a
nommé la cause : « le verrou consultatif de session attend `core/transport/` ».

Et surtout : **aucun point d'entrée de conteneur n'appelait la couture.**
`[G1] ADR 0018 · à-coudre · fonction · relireLaSanteMonoInstance → 0 appelant(s)`.
Un socle réellement déployé n'aurait pris aucun verrou.

---

## Décision

### 1 · Un verrou consultatif de **session**, sur une **connexion dédiée hors du pool**

C'est le cœur de cette ADR, et l'ADR 0018 ne pouvait pas l'écrire : elle décidait
le mécanisme, pas l'endroit où la connexion vit.

Un verrou consultatif de session PostgreSQL est **relâché quand la session qui le
tient se ferme**. Un pool de connexions ferme et rouvre ses connexions sans
prévenir personne. Un verrou pris sur une connexion empruntée au pool est donc
relâché **en silence**, à un moment que rien n'observe — et le socle continue de
croire qu'il l'a.

C'est exactement la forme du défaut que `relireLaSanteMonoInstance` existe pour
voir. L'ADR 0018 l'écrit : « personne ne démarre volontairement deux socles ; une
connexion, elle, tombe toute seule ». Sauf qu'ici le socle se l'infligerait
lui-même, à chaque recyclage.

La connexion du verrou :

- **n'est jamais rendue au pool** ;
- **ne sert aucune requête applicative** — une transaction abandonnée dessus
  suspendrait la relecture, et la santé mono-instance deviendrait indisponible
  pour une raison étrangère au verrou ;
- **porte un `application_name` reconnaissable** — c'est ce qui distingue, devant
  `pg_stat_activity`, « le socle tient son verrou » d'« une connexion oubliée ».

**La perte de cette connexion n'est pas une erreur à rattraper : c'est la perte
du verrou.** Une reconnexion automatique qui reprendrait le verrou sans le dire
effacerait la fenêtre pendant laquelle deux socles ont pu servir — et cette
fenêtre est précisément ce que le § 20 doit connaître.

### 2 · La relecture interroge **la même connexion** que l'acquisition

Interroger l'état du verrou par une connexion du pool répondrait « tenu » sans
dire **par qui** : un verrou tenu par une autre instance a exactement la même
apparence. C'est la forme la plus coûteuse de faux vert — verte précisément dans
le cas qu'on cherche.

### 3 · La clé dérive de `DOMAINE_DU_VERROU`, en 64 bits

L'ADR 0018 écarte l'entier littéral : « elle serait recopiée dans une migration
et divergerait en silence ». Restaient deux moitiés à fixer :

- **quelle empreinte** : une empreinte du domaine, **tronquée** à la largeur
  attendue. Le tronquage est une perte, et elle est assumée — deux domaines
  distincts pourraient tomber sur la même clé. Le socle n'a qu'un domaine, donc
  la collision n'a personne avec qui entrer en conflit ; le jour où un second
  apparaîtra, cette phrase est l'endroit où on s'en souviendra ;
- **quelle largeur** : la variante à **un seul argument 64 bits**, pas celle à
  deux entiers 32 bits. Deux entiers offrent deux fois plus de place pour une
  erreur de recopie, et aucun bénéfice.

### 4 · Le verrou est **toujours** pris ; seule son implémentation dépend du magasin

La tentation à écarter : « en local on n'a qu'un socle, le verrou ne sert à
rien ». C'est faux — deux démons stdio lancés depuis deux terminaux sont deux
socles, et le § 20 les verrait une fois sur deux.

Ce qui change en local n'est pas l'existence du verrou mais **ce qu'il partage**.
Une base sur `stub.invalid` ne résout jamais (RFC 2606) : aucun magasin partagé
n'existe, et `VerrouEnMemoire` est la seule implémentation dont la portée
corresponde à la réalité.

**Le choix se dérive de l'URL de base, jamais d'un drapeau d'environnement.** Un
drapeau se met à `false` pour faire passer un test, et ne revient jamais.

⚠️ **Borne assumée, écrite avec la décision.** `VerrouEnMemoire` ne voit pas un
second processus : en local, deux démons stdio démarreront tous les deux. Ce
n'est pas couvert, c'est assumé. « Le verrou est pris » ne se lit pas « deux
socles sont impossibles ».

---

## Ce que ça ferme, et comment on le vérifie

Le point 4 du lot 1d se ferme en trois gestes, et **les trois du même
mouvement** — un seul suffirait à donner du vert sans rien fermer :

1. `core/instance/postgres.ts` implémente le port ;
2. `ops/main.ts` appelle `demarrerLeSocleMonoInstance` à l'étage 1 et
   `relireLaSanteMonoInstance` dans `/healthz` ;
3. le `it.todo` de `core/epreuve/politique-chemins-de-panne.spec.ts:591` bascule
   en `it()`, et les entrées du registre passent de `à-coudre` à `cousue`.

⚠️ **Ne pas basculer les entrées du registre avant que les appels existent.**
C'est le geste exact que l'état `à-coudre` existe pour rendre impossible en
silence.

### La garde

Elle ne peut pas ouvrir de connexion — le dépôt ne fait **aucun appel réseau
sortant**. Ce qu'elle tient est donc :

- que la clé est **dérivée** : un témoin qui change `DOMAINE_DU_VERROU` doit
  changer la clé, et un entier écrit en dur dans le module est une anomalie ;
- que la connexion déclarée est celle de l'acquisition
  (`memeSessionQuAlAcquisition`), avec un témoin fabriqué où elle ne l'est pas ;
- **le compte de propriétés confrontées**, jamais une couleur.

---

## Conséquences acceptées

- Une connexion PostgreSQL de plus, permanente, par instance du socle. C'est le
  prix du mécanisme : un verrou de session n'existe pas sans sa session.
- Le socle ne démarre plus si la base est injoignable, **même si le coffre est
  ouvert**. C'est voulu : `REPLI_MAGASIN_INJOIGNABLE` tombe déjà du côté strict,
  et il rend `indisponible` plutôt que `refusé` — les deux refusent, mais ils ne
  se réparent pas du même geste.
