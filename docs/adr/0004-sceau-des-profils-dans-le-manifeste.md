# ADR 0004 — Le manifeste porte le sceau de l'énumération de profils

- **Statut** : acceptée
- **Date** : 2026-08-31
- **Décideur** : Williams Jullin (arbitrage délégué à l'architecte du lot 1b)
- **Portée** : `core/profiles/profiles.ts`, `core/adapter-kit/profils.ts`,
  `core/adapter-kit/manifest.ts`, `core/adapter-kit/kit.ts`,
  `core/adapter-kit/conformite.ts`, `core/registry/manifeste-recu.ts`,
  `core/registry/enregistrer.ts`, `adapters.lock.json`
- **Sources** : cahier des charges v6, § 09 (manifeste et épinglage), § 14
  (budget d'outils, énumération fermée), § 29 ; `docs/ETAT.md` § 4.3

---

## Le défaut, tel qu'il a été mesuré

`core/profiles/profiles.ts` porte `PROFILES_VERSION` et `empreinteProfils()`,
et affirme :

> Un adaptateur fédéré, qui vit dans un **autre dépôt**, épingle cette version
> dans son manifeste : c'est le seul moyen de savoir qu'un manifeste a été
> produit contre une énumération qui n'est plus celle du socle.

**C'était faux.** Le manifeste ne portait ni la version ni l'empreinte — ses
sept clés étaient `manifestVersion, id, version, mode, profiles, secrets,
tools` — et `EntreeVerrou` non plus. La fonction n'était branchée nulle part.

C'est le pire genre de garde : **une garde qui décrit un mécanisme absent**. On
la croit en service. Un adaptateur fédéré produisait son manifeste contre SA
copie de l'énumération ; si les deux divergeaient, le manifeste restait
syntaxiquement valide, les noms de profils restaient connus, le registre
admettait — et **la divergence ne se voyait nulle part**.

---

## Décision

**`profilesVersion` et `profilesSha` entrent dans `Manifeste`.
`analyserDefinition()` les remplit depuis le sceau qu'il reçoit. Le registre
REFUSE un manifeste produit contre une énumération qui n'est plus celle du
socle.**

### Le trajet du sceau, sans un seul recalcul

```
core/profiles.SCEAU_PROFILS
   → creerAdapterKit(PROFILE_NAMES, SCEAU_PROFILS)
   → analyserDefinition(definition, profilsConnus, sceauProfils)
   → Manifeste.profilesVersion / .profilesSha
   → (fil JSON, autre dépôt, autre langage)
   → enregistrerAdaptateur({ …, sceauProfils })   ← confrontation
```

Le sceau est **reçu** à chaque étape, jamais recalculé. Un recalcul quelque
part sur ce trajet serait une seconde source de vérité, et la garde cesserait de
mordre. `core/adapter-kit` ne contient toujours **aucune liste de profils** :
`ContratProfils` s'est élargi, il n'a pas été rempli.

### Les DEUX champs sont confrontés, pas un seul

| Version    | Empreinte  | Verdict    | Ce que ça veut dire                                   |
| ---------- | ---------- | ---------- | ----------------------------------------------------- |
| identique  | identique  | admis      | même énumération                                      |
| différente | —          | refusé     | manifeste produit contre une autre version            |
| identique  | différente | **refusé** | **l'énumération a changé sans que sa version change** |

La troisième ligne est celle qui justifie l'empreinte. Deux énumérations peuvent
porter les mêmes noms sans être la même : un profil retiré puis rendu, un
`depuis` corrigé. **Ne confronter que la version laisserait passer exactement
ce cas-là**, et c'est celui qu'un oubli humain produit.

---

## Pourquoi maintenant, et pas plus tard

**Ajouter un champ au manifeste change TOUTES les empreintes épinglées.**
`adapters.lock.json` n'existe aujourd'hui qu'en exemple, et aucun adaptateur
réel n'est épinglé. Après le premier épinglage, ce changement aurait exigé de
revalider à la main chaque `manifestSha`, dans chaque dépôt tiers, y compris
ceux qu'on ne contrôle pas.

C'est la même fenêtre que l'ADR 0002, pour la même raison : **le lot 1b est le
dernier moment où un changement de format ne coûte rien.**

---

## Ce que la décision EXCLUT

- **L'autre issue**, que `docs/ETAT.md` § 4.3 posait comme alternative :
  « corriger la phrase de `profiles.ts` pour qu'elle cesse de décrire un
  mécanisme absent ». Elle était honnête, mais elle laissait le défaut : un
  manifeste produit contre une énumération périmée reste admis, et la seule
  garde du budget « qui ne dépende d'aucun adaptateur pour exister » (§ 14)
  s'arrêterait toujours à la frontière du registre.
- **Épingler le sceau dans `adapters.lock.json` plutôt que dans le manifeste.**
  Le verrou dit ce que **le socle** décide ; le manifeste dit ce que
  **l'adaptateur** a fait. La divergence qu'on cherche est celle du second, et
  elle doit voyager avec lui.
- **Faire dépendre `core/adapter-kit` de `core/profiles`.** Le kit reçoit le
  sceau ; il ne va pas le chercher. `profils.ts` déclare le contrat sans le
  contenir, et cela n'a pas changé.
- **Déduire le sceau de `PROFILE_NAMES`.** C'est `core/profiles` qui décide de
  ce que l'empreinte couvre — elle exclut nommément `libelle`, « parce qu'une
  reformulation d'écran ne doit pas invalider les manifestes de tout le monde ».
  Le recalculer ailleurs serait décider à sa place.

---

## Conséquences acceptées

### 1 · Tout manifeste antérieur au lot 1b est refusé

Il ne porte pas le sceau, donc le schéma fermé de `manifeste-recu.ts` le rejette
en `manifeste_malforme`. C'est exact : **un document sans sceau n'est pas un
manifeste de ce socle.** Aucun n'existe.

### 2 · Le manifeste passe de sept à neuf clés

`manifest.spec.ts` porte le compte **écrit à la main**, et c'est délibéré : c'est
le seul endroit du dépôt où un champ **ajouté** au manifeste fait rougir quelque
chose, et un champ ajouté au manifeste change toutes les empreintes épinglées.
Un compte dérivé se serait tu.

### 3 · Un troisième motif de refus au registre

`enumeration_profils_divergente` rejoint les seize autres de `MOTIFS_REFUS`. Le
message dit quoi faire : **reconstruire le manifeste dans le dépôt de
l'adaptateur, jamais corriger le champ à la main.**

### 4 · Une rotation de l'énumération périme tous les manifestes

Incrémenter `PROFILES_VERSION` — ou modifier `PROFILES` — invalide chaque
manifeste épinglé, jusqu'à reconstruction dans chaque dépôt d'adaptateur. C'est
le coût, et il est voulu : **ajouter un profil est une opération de sécurité**
(§ 14, « changer de profil change la surface exposée »), pas un accident de
fusion. Le § 20 range d'ailleurs déjà le changement de profil sur le chemin du
desserrage.

---

## Ce qui reste OUVERT

- **`EntreeVerrou` ne porte toujours pas le sceau.** Ce n'est pas nécessaire —
  le `manifestSha` couvre déjà le manifeste entier, sceau compris, donc une
  divergence de sceau change l'empreinte épinglée. Mais cela veut dire qu'un
  exploitant qui lit le verrou **ne voit pas** contre quelle énumération
  l'adaptateur a été construit ; il doit ouvrir le manifeste. À trancher si
  l'écran Adaptateurs du § 22 en a besoin.
- **Le CDC ne nomme aucun profil de repli** quand `ops_runtime.activeProfile`
  est absent ou inconnu (écart relevé au lot 1, toujours ouvert). Le § 20 donne
  un repli à la politique (`brouillon`, fail-closed) et aucun au profil.
  `core/chaine/orchestrateur.ts` porte l'emplacement de cette décision
  (`EtatDePilotage.profilActif` rend `null`) et nomme la seule réponse
  fail-closed possible : `profilLeMoinsExposant()`, jamais `admin`.
