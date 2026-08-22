import { getToken } from '../lib/api'

export function useAuth() {
  return { isAuthenticated: Boolean(getToken()) }
}
