-- 003_tenant_versioning.sql — git branch tracking + deploy jobs

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_branch TEXT NOT NULL DEFAULT 'main';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_branch TEXT NOT NULL DEFAULT 'main';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_deployed_sha TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_deployed_sha TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_deployed_version TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_deployed_version TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS erp_desired_sha TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_desired_sha TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_deploy_status TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_deploy_error TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_deploy_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tenant_deploy_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('erp', 'web', 'both')),
  action TEXT NOT NULL CHECK (action IN ('promote_main', 'deploy')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  actor_email TEXT NOT NULL,
  request_payload JSONB,
  result_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_deploy_jobs_tenant_created
  ON tenant_deploy_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_deploy_jobs_status
  ON tenant_deploy_jobs (status);
