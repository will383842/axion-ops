-- § 09 — `ops_tool.idempotency`, lu par le port `reglages` de l'étape 8.
-- Mode fédéré, 2026-09-02. Les valeurs de fil sont conservées telles quelles
-- (`non-rejouable`, `n/a`) : ce sont celles du manifeste et du contrat d'adaptateur.
--
-- ⚠️ SANS DEFAULT, et c'est voulu : un « n/a » implicite ferait passer une écriture
--    rejouable pour une lecture pure. La table est vide à cette date (aucun
--    adaptateur admis) ; si elle ne l'était pas, cette migration ÉCHOUERAIT — ce
--    qui vaut mieux qu'une valeur inventée sur des lignes existantes.
CREATE TYPE "Idempotency" AS ENUM ('key', 'non-rejouable', 'n/a');

ALTER TABLE "ops_tool" ADD COLUMN "idempotency" "Idempotency" NOT NULL;
