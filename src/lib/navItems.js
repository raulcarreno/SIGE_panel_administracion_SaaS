export const mainNavItems = [
  {
    to: '/superadmin',
    end: true,
    labelKey: 'nav.dashboard',
    icon: 'dashboard',
  },
  {
    to: '/superadmin/tenants',
    end: false,
    labelKey: 'nav.tenants',
    icon: 'tenants',
  },
  {
    to: '/superadmin/tenants/new',
    end: true,
    labelKey: 'nav.newTenant',
    icon: 'plus',
  },
]

export const tenantSections = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'domains', labelKey: 'domains.title' },
  { id: 'versioning', labelKey: 'versioning.title' },
  { id: 'modules', labelKey: 'modules' },
  { id: 'validity', labelKey: 'validity' },
  { id: 'maintenance', labelKey: 'maintenance' },
  { id: 'migrations', labelKey: 'migrations' },
  { id: 'settings', labelKey: 'settings' },
  { id: 'audit', labelKey: 'audit' },
]

export const pageMeta = {
  '/superadmin': { titleKey: 'nav.dashboard' },
  '/superadmin/tenants': { titleKey: 'nav.tenants' },
  '/superadmin/tenants/new': { titleKey: 'nav.newTenant', parentKey: 'nav.tenants', parentTo: '/superadmin/tenants' },
}
