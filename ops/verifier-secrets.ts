/**
 * `ops/verifier-secrets.ts` — L'ÉTAPE DE CHAÎNE.
 *
 * Elle ÉCHOUE quand un secret requis manque. Elle ne se saute pas, elle ne
 * prévient pas, elle ne se replie sur rien. Voir `ops/secrets.ts` pour le
 * pourquoi et la liste.
 *
 * ⚠️ ELLE ANNONCE COMBIEN D'EXIGENCES ELLE A CONFRONTÉES, y compris quand ce
 *    nombre est ZÉRO. Une étape qui écrirait « secrets vérifiés » sans dire
 *    combien serait la forme exacte du vert rassurant que ce dépôt refuse : on
 *    ne saurait pas distinguer « aucun secret requis » de « la liste n'a pas
 *    été lue ».
 *
 * ⚠️ ELLE N'ÉCRIT AUCUNE VALEUR, JAMAIS. La sortie d'une chaîne d'intégration
 *    est publique sur un dépôt public (§ 29). Seuls des NOMS de variables
 *    sortent d'ici.
 */

import { SECRETS_REQUIS, verifierSecrets } from "./secrets.js";

function principale(): number {
  const verdict = verifierSecrets(SECRETS_REQUIS);

  process.stdout.write(
    `[secrets] ${String(verdict.exigencesMesurees)} exigence(s) confrontée(s) à ` +
      `l'environnement, ${String(verdict.manquants.length)} manquante(s)\n`,
  );

  if (verdict.exigencesMesurees === 0) {
    process.stdout.write(
      "[secrets] aucune exigence déclarée dans `ops/secrets.ts` — le socle ne sort pas de la " +
        "machine, et la chaîne n'appelle rien. Ce n'est PAS une conformité : c'est un compte à " +
        "zéro, et il est écrit pour qu'on ne le lise pas comme un succès.\n",
    );
    return 0;
  }

  if (verdict.anomalies.length > 0) {
    for (const anomalie of verdict.anomalies) process.stderr.write(`[secrets] ${anomalie}\n`);
    return 1;
  }

  process.stdout.write("[secrets] toutes les exigences sont satisfaites.\n");
  return 0;
}

process.exitCode = principale();
