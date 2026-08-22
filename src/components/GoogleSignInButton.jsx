import { useEffect, useRef } from 'react'
import { apiRequest, setToken } from '../lib/api'

export default function GoogleSignInButton({ onSuccess, onError }) {
  const buttonRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      let clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (!clientId) {
        try {
          const config = await apiRequest('/api/superadmin/public-config')
          clientId = config.googleClientId
        } catch {
          // ignore
        }
      }
      if (!clientId) {
        onError?.('Google Sign-In no configurado.')
        return
      }

      if (!window.google?.accounts?.id) return
      if (cancelled) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            const result = await apiRequest('/api/superadmin/login', {
              method: 'POST',
              body: { idToken: response.credential },
            })
            setToken(result.token)
            onSuccess?.(result)
          } catch (error) {
            onError?.(error.message)
          }
        },
      })

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
      })
    }

    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer)
        init()
      }
    }, 200)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [onSuccess, onError])

  return <div ref={buttonRef} />
}
