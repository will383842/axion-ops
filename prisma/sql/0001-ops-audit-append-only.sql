-- ═══════════════════════════════════════════════════════════════════════════
--  axion-ops — ops_audit EN AJOUT SEUL
--  ADR 0002. Rattaché au LOT 1, pas au lot 10.
--
--  ⚠️ CE FICHIER N'EST PAS UNE MIGRATION PRISMA, ET C'EST DÉLIBÉRÉ.
--     `prisma migrate` gère la FORME des tables ; il ne gère pas les rôles ni
--     les droits, et une migration écrite à la main dans `prisma/migrations/`
--     avant la migration de base ferait échouer `migrate deploy` sur une table
--     qui n'existe pas encore.
--
--     Ce script s'applique APRÈS `prisma migrate deploy`, sous le rôle
--     PROPRIÉTAIRE de la base, à chaque déploiement. Il est IDEMPOTENT.
--
--  ⚠️ AUCUN SECRET N'ENTRE ICI. Les deux rôles créés sont des rôles de GROUPE,
--     `NOLOGIN` : ils portent des droits, jamais un mot de passe. Les rôles de
--     connexion réels sont créés hors dépôt et reçoivent l'appartenance par un
--     `GRANT <groupe> TO <rôle de connexion>`. Le dépôt est PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
--  LE DÉFAUT QUE CE SCRIPT REFERME
-- ───────────────────────────────────────────────────────────────────────────
--
--  Le chaînage d'`ops_audit` (§ 12) rend une réécriture visible — À CONDITION
--  que l'attaquant ne puisse pas RECALCULER la chaîne. Tant que tout compte
--  disposant d'`UPDATE`/`DELETE` pouvait retirer une tranche PUIS recalculer
--  chaque empreinte, `verifierChaine` rendait `valide = true` sur un journal
--  amputé, et les quatre gardes de troncature ne mordaient que sur un
--  attaquant qui aurait eu `DELETE` SANS `INSERT` — une répartition de droits
--  que rien n'écrivait nulle part.
--
--  Ce script l'écrit. Il est la MOITIÉ de l'ADR 0002 ; l'autre moitié est le
--  scellement HMAC du `selfHash` (`core/audit/sceau.ts`), qui retire à un
--  attaquant la capacité de recalculer même s'il obtient l'écriture.
--
--  ⚠️ CE QU'IL NE PROTÈGE PAS, ÉCRIT AVEC LA MESURE : le rôle PROPRIÉTAIRE de
--     la table peut toujours se redonner tous les droits. C'est une propriété
--     de PostgreSQL, pas un oubli. La conséquence opérationnelle est donc une
--     EXIGENCE, et elle est vérifiée plus bas : le rôle de connexion de
--     l'application NE DOIT PAS être propriétaire d'`ops_audit`, et
--     `DATABASE_URL` ne doit jamais porter le rôle de migration.

-- ───────────────────────────────────────────────────────────────────────────
--  1 · LES DEUX RÔLES DE GROUPE
-- ───────────────────────────────────────────────────────────────────────────
--
--  Ils sont SÉPARÉS parce que les deux compromissions qu'on redoute ne sont pas
--  la même. Un attaquant qui obtient le processus du socle obtient l'INSERT et
--  la clé de scellement — il ne peut ni modifier ni supprimer. Un attaquant qui
--  obtient les identifiants de la purge obtient le DELETE — il n'a ni INSERT,
--  ni la clé. Réécrire le journal exige LES DEUX, séparément.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_audit_ecriture') THEN
    CREATE ROLE ops_audit_ecriture NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_audit_purge') THEN
    CREATE ROLE ops_audit_purge NOLOGIN;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
--  2 · PERSONNE D'AUTRE
-- ───────────────────────────────────────────────────────────────────────────
--
--  `PUBLIC` est un rôle implicite dont tout le monde hérite. Un droit qui y
--  traîne annule tout ce qui suit, en silence.

REVOKE ALL ON TABLE ops_audit FROM PUBLIC;

-- ───────────────────────────────────────────────────────────────────────────
--  3 · L'APPLICATION — LIRE ET AJOUTER, JAMAIS AUTRE CHOSE
-- ───────────────────────────────────────────────────────────────────────────
--
--  C'est sous ce rôle que le socle écrit ses lignes, ET la ligne de CLÔTURE de
--  purge du § 31 : la clôture est une ligne d'`ops_audit` comme une autre, elle
--  se chaîne à la pointe et elle exige donc l'INSERT.

GRANT SELECT, INSERT ON TABLE ops_audit TO ops_audit_ecriture;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ops_audit FROM ops_audit_ecriture;

--  `seq` est un `BIGSERIAL` : sans la séquence, l'INSERT échoue.
GRANT USAGE, SELECT ON SEQUENCE ops_audit_seq_seq TO ops_audit_ecriture;

-- ───────────────────────────────────────────────────────────────────────────
--  4 · LA PURGE — LIRE ET SUPPRIMER, JAMAIS INSÉRER
-- ───────────────────────────────────────────────────────────────────────────
--
--  ⚠️ ELLE N'A PAS L'INSERT, DONC ELLE N'ÉCRIT PAS SA PROPRE CLÔTURE. Ce n'est
--     pas un manque, c'est la séparation elle-même : un rôle qui pourrait à la
--     fois supprimer une tranche et écrire la ligne qui l'atteste pourrait
--     écrire n'importe quelle attestation.
--
--     LA SÉQUENCE D'UNE PURGE (§ 31) est donc, dans cet ordre :
--       1. le socle (rôle `ops_audit_ecriture`) écrit la ligne de clôture ;
--       2. la purge (rôle `ops_audit_purge`) supprime la tranche attestée.
--
--     ELLES NE SONT PAS ATOMIQUES, et le trou est ASSUMÉ parce qu'il est
--     DÉTECTABLE : une panne entre les deux laisse une clôture qui atteste une
--     tranche encore présente, ce que `verifierChaine` compte déjà sous
--     `ancresInutilisees` — « sur un journal lu en entier, un cumul non nul
--     veut dire qu'une purge a déclaré une tranche qui est pourtant toujours
--     là ». Le remède est de rejouer la suppression, jamais de réécrire la
--     clôture.
--
--     L'ordre inverse — supprimer puis attester — laisserait, à la même panne,
--     un journal troué SANS ancre : indiscernable d'une troncature hostile.

GRANT SELECT, DELETE ON TABLE ops_audit TO ops_audit_purge;
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON TABLE ops_audit FROM ops_audit_purge;

-- ───────────────────────────────────────────────────────────────────────────
--  5 · CE QUI DOIT ÊTRE VÉRIFIÉ APRÈS APPLICATION
-- ───────────────────────────────────────────────────────────────────────────
--
--  Ces deux requêtes ne sont pas décoratives : elles sont ce qui distingue
--  « le script a tourné » de « le script MORD ». Un `GRANT` appliqué sur une
--  base où le rôle de connexion est propriétaire de la table ne change rien du
--  tout, et rien ne le dirait.
--
--  a) Le rôle de connexion de l'application n'est PAS propriétaire :
--       SELECT tableowner FROM pg_tables WHERE tablename = 'ops_audit';
--     ⇒ doit rendre le rôle de MIGRATION, jamais celui de `DATABASE_URL`.
--
--  b) Les droits effectifs, rôle par rôle :
--       SELECT has_table_privilege('ops_audit_ecriture', 'ops_audit', 'UPDATE'); -- false
--       SELECT has_table_privilege('ops_audit_ecriture', 'ops_audit', 'DELETE'); -- false
--       SELECT has_table_privilege('ops_audit_ecriture', 'ops_audit', 'INSERT'); -- true
--       SELECT has_table_privilege('ops_audit_purge',    'ops_audit', 'INSERT'); -- false
--       SELECT has_table_privilege('ops_audit_purge',    'ops_audit', 'UPDATE'); -- false
--       SELECT has_table_privilege('ops_audit_purge',    'ops_audit', 'DELETE'); -- true
--
--  ⚠️ `core/audit/droits-sql.spec.ts` lit CE FICHIER et vérifie que les
--     `GRANT`/`REVOKE` qu'il porte produisent bien cette table de droits. Elle
--     prouve ce que le SCRIPT DIT ; les deux requêtes ci-dessus sont ce qui
--     prouve que le CLUSTER l'applique. Les deux sont nécessaires, et la
--     seconde ne peut pas tourner dans ce dépôt : aucune base n'y tourne.
--
--  ⚠️ LA MOITIÉ QUI VIT DANS LE CODE : `core/audit/roles.ts`. Elle porte QUELLE
--     OPÉRATION PASSE SOUS QUEL RÔLE — le socle lit et ajoute, la purge lit et
--     supprime —, elle REFUSE dans le code une purge qui insérerait, et
--     `roles.spec.ts` confronte cette décision aux `GRANT`/`REVOKE` ci-dessus.
--     Sans elle, rien du côté du socle ne refusait : le refus venait de
--     PostgreSQL, donc seulement là où ce script avait été appliqué.
