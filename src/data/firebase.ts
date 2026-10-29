import { initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() || 'loginfirebase-9d539'
const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim()
const appId = (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim()
const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() || `${projectId}.firebaseapp.com`
const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() || `${projectId}.appspot.com`
const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim()

const missingFields = [
  !apiKey ? 'VITE_FIREBASE_API_KEY' : '',
  !appId ? 'VITE_FIREBASE_APP_ID' : '',
].filter(Boolean)

export const firebaseConfigError = missingFields.length
  ? `Falta configurar Firebase: ${missingFields.join(', ')}.`
  : ''

export const firebaseAuth: Auth | null = firebaseConfigError
  ? null
  : getAuth(initializeApp({
      apiKey,
      appId,
      projectId,
      authDomain,
      storageBucket,
      messagingSenderId,
    }))
