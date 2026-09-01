# ADR 0042 — Le `.env` reste où il est, et c'est la garde qui manquait

- **Statut** : acceptée
- **Date** : 2026-09-01
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 4)
- **Portée** : `.gitignore`, `ops/depot-public.ts`, `ops/depot-public.spec.ts`
- **Sources** : rapport de recette du lot 3, constat n° 6 ; cahier des charges
  v6, § 29 (dépôt public) ; ADR 0019 (une garde annonce ses comptes)

---

## Le fait

Le répertoire de travail de ce dépôt **public** porte un `.env` renseigné, sans
rapport avec ce projet. Il est **ignoré et non suivi** — mesuré sans lire aucune
valeur : `git check-ignore -v .env` → `.gitignore:6:.env`, `git ls-files .env` →
vide. **Rien n'est exposé aujourd'hui.**

Il est à **un `git add -f`** ou à **une ligne de `.gitignore`** de l'être.

## Ce qu'on a rejeté, et pourquoi c'était le mauvais correctif

La recette du lot 3 proposait de **déplacer le fichier**. Deux raisons de ne pas
le faire, et elles sont mesurables :

1. **Un `.env` ignoré est la pratique normale de tout projet Node.** Le déplacer
   ne supprime pas le risque : il l'emmène dans un répertoire voisin où plus
   aucune règle ne le couvre. On aurait échangé un risque gardé contre un risque
   nu.
2. **Déplacer un fichier ne pose aucune garde.** Le lendemain, un outil recrée un
   `.env` ici — et le dépôt est exactement là où il était, sans que rien ne l'ait
   dit.

> C'est le motif de tout ce dossier : **on ne déplace pas le risque, on le rend
> visible.**

## La décision

**Le fichier reste où il est. On pose la garde qui manque.**

`ops/depot-public.ts` est une **fonction pure d'un état de dépôt** — elle ne lit
aucun fichier, n'appelle pas git, ne voit **aucune valeur**, et ne rend que des
chemins. Elle rougit dans **trois sens** :

1. un chemin de secret devient **SUIVI** par git — l'index, donc l'historique
   public, donc irrévocable : on ne retire pas un secret d'un historique, on
   **révoque la valeur** ;
2. un chemin de secret est **présent, non suivi, et non ignoré** — un `git add .`
   l'emporte au prochain commit sans que personne ne le voie passer ;
3. une **sonde** cesse d'être ignorée — c'est ce qui arrive quand on retire la
   ligne `.env` de `.gitignore`.

**Le troisième sens est celui qui compte le plus, et c'est le moins évident.** Un
dépôt fraîchement cloné ne porte aucun `.env` : les deux premiers contrôles
n'ont alors **rien** à confronter, et la garde serait verte en ne regardant rien
— c'est-à-dire précisément en intégration continue, là où elle est censée
protéger. Les sondes se confrontent aux **règles d'ignorance elles-mêmes**, et
ne demandent pas que le fichier existe pour mordre.

La garde **annonce le nombre de chemins confrontés**, de motifs lus et de sondes,
et porte quatre planchers : un `git ls-files` muet — git absent, dépôt non
initialisé, mauvais répertoire de travail — rendrait zéro chemin, donc zéro
anomalie, et c'est le vert le plus coûteux qui soit.

## Ce que la garde a trouvé le jour même

État **ROUGE** transcrit dès la première exécution, sur `.gitignore` inchangé :

```
[dépôt public] 335 chemin(s) confronté(s) dont 332 suivi(s) par git ·
  15 motif(s) sensible(s) lu(s) · 6 sonde(s) d'ignorance confrontée(s) ·
  0 suivi(s) sensible(s) · 0 présent(s) non ignoré(s) ·
  3 sonde(s) NON ignorée(s) [id_rsa, prive.pem, secrets.json] · 3 anomalie(s)
Tests  2 failed | 3 passed (5)
```

**`.gitignore` couvrait `.env` et `.env.*`, et rien d'autre.** Un `secrets.json`,
une clé SSH ou un `.pem` déposés dans le répertoire de travail étaient à un
`git add .` d'entrer dans l'historique **public**. Ce n'était pas le risque
signalé — c'était un risque voisin, plus large, que personne n'avait mesuré parce
que personne n'avait posé la question au dépôt.

Les règles manquantes ont été ajoutées à `.gitignore`. État **VERT** après :
`0 sonde(s) NON ignorée(s) · 0 anomalie(s)`.

## Les motifs sont délibérément ÉTROITS

Ce dépôt porte `ops/secrets.ts`, `ops/verifier-secrets.ts` et leur garde : trois
modules qui **parlent** de secrets sans en porter aucun. Un motif `*secret*` les
attraperait, la garde serait rouge au premier jour, et on la désarmerait dans la
semaine — **la façon la plus sûre de se retrouver sans garde du tout.**

Un test le vérifie dans les deux sens : les trois modules qui en parlent ne sont
attrapés par aucun motif, et cinq chemins qui en portent réellement le sont tous.

## Ce qui reste hors de cette décision

Les identifiants présents dans le `.env` de la machine **appartiennent à un autre
chantier**. Ils n'ont été ni lus, ni copiés, ni supprimés : supprimer le fichier
d'un autre chantier aurait été pire que le signaler. Leur sort — révocation ou
déplacement — est une décision d'exploitation, pas d'architecture, et elle reste
à Will.
