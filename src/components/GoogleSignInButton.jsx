import { useEffect, useRef } from 'react'
import { apiRequest, setToken } from '../lib/api'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

export default function GoogleSignInButton({ onSuccess, onError }) {
  const buttonRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!GOOGLE_CLIENT_ID) {
        onError?.('Google Sign-In no configurado (VITE_GOOGLE_CLIENT_ID).')
        return
      }

      if (!window.google?.accounts?.id) return
      if (cancelled) return

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
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
