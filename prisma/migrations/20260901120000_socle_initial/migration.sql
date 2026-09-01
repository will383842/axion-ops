-- ═══════════════════════════════════════════════════════════════════════════
--  axion-ops — MIGRATION INITIALE : LES DIX TABLES DU § 12
--  ADR 0045 (la décision) · ADR 0046 (le chaînage et sa garde)
--
--  ⚠️ CE FICHIER N'A PAS ÉTÉ APPLIQUÉ. AUCUNE BASE NE TOURNE DANS CE DÉPÔT.
--     Il a été PRODUIT hors ligne, sans connexion, par :
--
--       prisma migrate diff --from-empty \
--         --to-schema-datamodel prisma/schema.prisma --script
--
--     `migrate diff --from-empty` ne se connecte à rien : il compare le VIDE au
--     modèle de données déclaré. Le `DATABASE_URL` que la ligne de commande
--     exige est l'URL STUB de la chaîne d'intégration (`stub.invalid`,
--     RFC 2606) — un domaine réservé qui ne résout nulle part.
--
--  ⚠️ CE QUE CE FICHIER NE FAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE.
--     Il crée la FORME des tables. Il ne pose NI les rôles, NI les droits :
--     `prisma migrate` ne les gère pas. Le journal en ajout seul de l'ADR 0002
--     — la seule chose qui empêche un compte disposant d'`UPDATE` de retirer
--     une tranche PUIS de recalculer toute la chaîne — vit dans
--     `prisma/sql/0001-ops-audit-append-only.sql`, qui s'applique APRÈS
--     `prisma migrate deploy`.
--
--     L'ORDRE EST ÉCRIT, PAS CONVENU ORALEMENT : c'est le script `db:deploy` de
--     `package.json`, et `ops/gestes-nommes.spec.ts` rougit si le script cesse
--     de nommer les deux gestes dans cet ordre.
--
--  ⚠️ AUCUN IDENTIFIANT D'INFRASTRUCTURE N'ENTRE ICI. Ce dépôt est PUBLIC : ni
--     hôte, ni rôle de connexion, ni mot de passe. Le rôle de MIGRATION —
--     propriétaire des tables, distinct de celui de `DATABASE_URL` — vit hors
--     dépôt, et l'exigence est écrite dans le script d'ajout seul.
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "Effect" AS ENUM ('read', 'write-draft', 'send', 'destructive');

-- CreateEnum
CREATE TYPE "DataClass" AS ENUM ('none', 'internal', 'personal', 'sensitive');

-- CreateEnum
CREATE TYPE "AdapterMode" AS ENUM ('hébergé', 'fédéré');

-- CreateEnum
CREATE TYPE "PolicyLevel" AS ENUM ('brouillon', 'confirmé', 'libre');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('in_flight', 'done', 'failed');

-- CreateTable
CREATE TABLE "ops_secret" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "keyId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "tag" BYTEA NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "bootstrapCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_policy" (
    "id" TEXT NOT NULL,
    "level" "PolicyLevel" NOT NULL,
    "scope" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "setBy" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ops_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_adapter" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "mode" "AdapterMode" NOT NULL,
    "authMode" TEXT NOT NULL,
    "secretRef" TEXT,
    "endpoint" TEXT,
    "manifestSha" TEXT NOT NULL,
    "trustTier" INTEGER NOT NULL,
    "maxDataClass" "DataClass" NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "healthy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_adapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_tool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "bytes" INTEGER NOT NULL,
    "effect" "Effect" NOT NULL,
    "dataClass" "DataClass" NOT NULL,
    "profiles" TEXT[],
    "governanceFields" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "sunsetAt" TIMESTAMP(3),
    "limit" INTEGER,
    "warnAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_audit" (
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "principal" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "toolVersion" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "effect" "Effect" NOT NULL,
    "policyLevel" "PolicyLevel" NOT NULL,
    "decision" TEXT NOT NULL,
    "stepDenied" INTEGER,
    "argHash" TEXT NOT NULL,
    "argHashValidated" BOOLEAN NOT NULL,
    "recordIds" TEXT[],
    "partialSources" TEXT[],
    "durationMs" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "externalEffect" BOOLEAN NOT NULL,
    "prevHash" TEXT,
    "selfHash" TEXT NOT NULL,

    CONSTRAINT "ops_audit_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "ops_idempotency" (
    "tool" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL,
    "argHash" TEXT NOT NULL,
    "resultRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_idempotency_pkey" PRIMARY KEY ("tool","key")
);

-- CreateTable
CREATE TABLE "ops_quota" (
    "id" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,
    "warnAt" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_discovery" (
    "id" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ops_discovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_token" (
    "jti" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopes" TEXT[],
    "audience" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ops_token_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "ops_runtime" (
    "principal" TEXT NOT NULL,
    "activeProfile" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_runtime_pkey" PRIMARY KEY ("principal")
);

-- CreateIndex
CREATE INDEX "ops_secret_name_idx" ON "ops_secret"("name");

-- CreateIndex
CREATE INDEX "ops_secret_keyId_idx" ON "ops_secret"("keyId");

-- CreateIndex
CREATE UNIQUE INDEX "ops_secret_name_version_key" ON "ops_secret"("name", "version");

-- CreateIndex
CREATE INDEX "ops_policy_supersededAt_expiresAt_idx" ON "ops_policy"("supersededAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ops_policy_scope_idx" ON "ops_policy"("scope");

-- CreateIndex
CREATE INDEX "ops_policy_setAt_idx" ON "ops_policy"("setAt");

-- CreateIndex
CREATE INDEX "ops_adapter_mode_idx" ON "ops_adapter"("mode");

-- CreateIndex
CREATE INDEX "ops_adapter_healthy_idx" ON "ops_adapter"("healthy");

-- CreateIndex
CREATE INDEX "ops_tool_adapterId_idx" ON "ops_tool"("adapterId");

-- CreateIndex
CREATE INDEX "ops_tool_enabled_idx" ON "ops_tool"("enabled");

-- CreateIndex
CREATE INDEX "ops_tool_effect_idx" ON "ops_tool"("effect");

-- CreateIndex
CREATE UNIQUE INDEX "ops_tool_name_version_key" ON "ops_tool"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ops_audit_selfHash_key" ON "ops_audit"("selfHash");

-- CreateIndex
CREATE INDEX "ops_audit_sessionId_idx" ON "ops_audit"("sessionId");

-- CreateIndex
CREATE INDEX "ops_audit_principal_at_idx" ON "ops_audit"("principal", "at");

-- CreateIndex
CREATE INDEX "ops_audit_tool_idx" ON "ops_audit"("tool");

-- CreateIndex
CREATE INDEX "ops_audit_stepDenied_idx" ON "ops_audit"("stepDenied");

-- CreateIndex
CREATE INDEX "ops_idempotency_expiresAt_idx" ON "ops_idempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "ops_idempotency_status_idx" ON "ops_idempotency"("status");

-- CreateIndex
CREATE INDEX "ops_quota_resetAt_idx" ON "ops_quota"("resetAt");

-- CreateIndex
CREATE INDEX "ops_quota_principal_idx" ON "ops_quota"("principal");

-- CreateIndex
CREATE UNIQUE INDEX "ops_quota_window_tool_principal_key" ON "ops_quota"("window", "tool", "principal");

-- CreateIndex
CREATE INDEX "ops_discovery_status_idx" ON "ops_discovery"("status");

-- CreateIndex
CREATE INDEX "ops_discovery_lastSeenAt_idx" ON "ops_discovery"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ops_discovery_adapterId_kind_subject_key" ON "ops_discovery"("adapterId", "kind", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ops_token_tokenHash_key" ON "ops_token"("tokenHash");

-- CreateIndex
CREATE INDEX "ops_token_principal_idx" ON "ops_token"("principal");

-- CreateIndex
CREATE INDEX "ops_token_expiresAt_idx" ON "ops_token"("expiresAt");

-- CreateIndex
CREATE INDEX "ops_token_revokedAt_idx" ON "ops_token"("revokedAt");

-- CreateIndex
CREATE INDEX "ops_token_grantId_idx" ON "ops_token"("grantId");

-- CreateIndex
CREATE INDEX "ops_token_sessionId_idx" ON "ops_token"("sessionId");

-- AddForeignKey
ALTER TABLE "ops_tool" ADD CONSTRAINT "ops_tool_adapterId_fkey" FOREIGN KEY ("adapterId") REFERENCES "ops_adapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_discovery" ADD CONSTRAINT "ops_discovery_adapterId_fkey" FOREIGN KEY ("adapterId") REFERENCES "ops_adapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

