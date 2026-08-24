-- 004_tenant_domains.sql — SaaS hosts + custom domains + domain jobs

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS saas_base_domain TEXT NOT NULL DEFAULT 'findspo.com';
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS erp_host TEXT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS web_host TEXT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS domain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (domain_status IN ('draft', 'provisioning', 'active', 'failed'));
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS domain_error TEXT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS domains_provisioned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tenant_custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('erp', 'web')),
  hostname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_dns'
    CHECK (status IN ('pending_dns', 'verified', 'provisioned', 'failed')),
  verification_target TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hostname)
);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_domains_tenant
  ON tenant_custom_domains (tenant_id);

-- Extend deploy job actions for domain provisioning
ALTER TABLE tenant_deploy_jobs DROP CONSTRAINT IF EXISTS tenant_deploy_jobs_action_check;
ALTER TABLE tenant_deploy_jobs
  ADD CONSTRAINT tenant_deploy_jobs_action_check
  CHECK (action IN ('promote_main', 'deploy', 'provision_domains', 'verify_custom_domain'));
