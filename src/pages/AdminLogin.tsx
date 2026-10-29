import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../auth/AdminAuth'

type LoginState = {
  from?: {
    pathname?: string
  }
}

export default function AdminLogin() {
  const location = useLocation()
  const { user, loading, signInError, firebaseConfigError, loginWithGoogle } = useAdminAuth()
  const [pending, setPending] = useState(false)
  const redirectTo = (location.state as LoginState | null)?.from?.pathname || '/admin'

  const onLogin = async () => {
    setPending(true)
    try {
      await loginWithGoogle()
    } catch {
      // El error se refleja en signInError.
    } finally {
      setPending(false)
    }
  }

  if (!loading && user) return <Navigate to={redirectTo} replace />

  return (
    <div className="admin-auth-screen">
      <div className="admin-auth-card">
        <h1>Acceso administrador</h1>
        <p>Inicia sesión con Google para entrar al panel.</p>
        <button className="btn primary full-width" type="button" onClick={onLogin} disabled={pending || !!firebaseConfigError}>
          {pending ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>
        {firebaseConfigError && <p className="notice bad">{firebaseConfigError}</p>}
        {signInError && <p className="notice bad">{signInError}</p>}
      </div>
    </div>
  )
}
