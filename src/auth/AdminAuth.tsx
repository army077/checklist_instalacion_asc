import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { firebaseAuth, firebaseConfigError } from '../data/firebase'

type AdminAuthContextValue = {
  user: User | null
  loading: boolean
  signInError: string
  firebaseConfigError: string
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [signInError, setSignInError] = useState('')

  useEffect(() => {
    if (!firebaseAuth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const loginWithGoogle = async () => {
    setSignInError('')
    if (!firebaseAuth) {
      setSignInError(firebaseConfigError)
      return
    }
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible iniciar sesión.'
      setSignInError(message)
      throw error
    }
  }

  const logout = async () => {
    if (!firebaseAuth) return
    try {
      await signOut(firebaseAuth)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible cerrar sesión.'
      setSignInError(message)
      throw error
    }
  }

  const value = useMemo<AdminAuthContextValue>(() => ({
    user,
    loading,
    signInError,
    firebaseConfigError,
    loginWithGoogle,
    logout,
  }), [user, loading, signInError])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider.')
  return context
}

export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAdminAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="admin-auth-screen">
        <div className="admin-auth-card">
          <h1>Validando sesión…</h1>
          <p>Espera un momento.</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/admin/login" replace state={{ from: location }} />
  return <>{children}</>
}
