import { Navigate, Route, Routes } from 'react-router-dom'
import SuperadminLayout from './components/SuperadminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/superadmin/LoginPage'
import DashboardPage from './pages/superadmin/DashboardPage'
import TenantsListPage from './pages/superadmin/TenantsListPage'
import TenantCreatePage from './pages/superadmin/TenantCreatePage'
import TenantDetailPage from './pages/superadmin/TenantDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/superadmin" replace />} />
      <Route path="/superadmin/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/superadmin" element={<SuperadminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tenants" element={<TenantsListPage />} />
          <Route path="tenants/new" element={<TenantCreatePage />} />
          <Route path="tenants/:id" element={<TenantDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/superadmin" replace />} />
    </Routes>
  )
}
