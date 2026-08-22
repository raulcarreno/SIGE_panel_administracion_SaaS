import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  es: {
    translation: {
      appTitle: 'SIGE Superadmin',
      login: 'Iniciar sesión',
      logout: 'Cerrar sesión',
      dashboard: 'Panel',
      tenants: 'Tenants',
      newTenant: 'Nuevo tenant',
      sync: 'Sincronizar',
      syncAll: 'Sincronizar todos',
      maintenance: 'Mantenimiento',
      modules: 'Módulos',
      validity: 'Validez',
      settings: 'Configuración',
      migrations: 'Migraciones',
      audit: 'Auditoría',
      save: 'Guardar',
      cancel: 'Cancelar',
      active: 'Activo',
      suspended: 'Suspendido',
      expired: 'Expirado',
      future: 'Futuro',
      archived: 'Archivado',
      loading: 'Cargando...',
      error: 'Error',
      noTenants: 'No hay tenants registrados.',
      runMigrations: 'Ejecutar migraciones',
      overview: 'Resumen',
    },
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
})

export default i18n
