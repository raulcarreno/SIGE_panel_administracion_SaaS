import { isHetznerRuntime } from './runtimeTarget.js'
import * as gke from './gkeDomainClient.js'
import * as hetzner from './hetznerDomainClient.js'
import { buildTenantDomainManifest } from './tenantDomains.js'

export async function resolveIngressIp() {
  if (isHetznerRuntime()) return hetzner.resolveIngressIp()
  return gke.resolveIngressIp()
}

export async function provisionTenantHosts({ slug, erpHost, webHost, customHosts = [] }) {
  if (isHetznerRuntime()) {
    const result = await hetzner.provisionTenantHosts({ slug, erpHost, webHost, customHosts })
    return {
      manifest: {
        certName: result.certName,
        ingressName: result.ingressName,
        domains: result.domains,
      },
      applyResult: { stdout: result.stdout, stderr: result.stderr || '' },
    }
  }

  const config = gke.getGkeConfig()
  const manifest = buildTenantDomainManifest({
    slug,
    namespace: config.namespace,
    erpHost,
    webHost,
    customHosts,
  })
  const applyResult = await gke.applyDomainManifest(manifest.yaml)
  return { manifest, applyResult }
}

export async function deleteTenantDomainResources(slug) {
  if (isHetznerRuntime()) return hetzner.deleteTenantDomainResources(slug)
  return gke.deleteTenantDomainResources(slug)
}
