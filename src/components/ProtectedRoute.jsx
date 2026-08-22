import { Navigate, Outlet } from 'react-router-dom'
import { getToken } from '../lib/api'

export default function ProtectedRoute() {
  if (!getToken()) {
    return <Navigate to="/superadmin/login" replace />
  }
  return <Outlet />
}
