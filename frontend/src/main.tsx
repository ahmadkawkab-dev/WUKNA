import { useEffect, useRef, useState, type FormEvent } from 'react'
import ReactDOM from 'react-dom/client'
import {
  AuthApiError,
  exchangeGoogleCode,
  login,
  logout,
  logoutEverywhere,
  register,
  restoreSession,
  startGoogleLink,
  startGoogleLogin,
  unlinkGoogle,
  type AuthSession,
} from './auth'
import './styles.css'

const errorMessages: Record<string, string> = {
  account_link_required: 'An account already uses this email. Sign in with your password, then link Google from your account.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  external_login_failed: 'Google sign-in could not be completed. Please try again.',
  external_login_code_expired: 'This Google sign-in expired. Please start again.',
  external_login_code_invalid: 'This Google sign-in link is invalid or was already used. Please start again.',
  external_login_already_linked: 'This Google account is already linked to another LAPIS user.',
  cannot_remove_only_login: 'Add a password or another sign-in method before removing Google.',
  email_already_registered: 'An account with this email already exists. Try signing in.',
  authentication_failed: 'Authentication failed. Please check your details and try again.',
}

// Remove the one-time code synchronously, before any network request or React effect runs.
const callback = window.location.pathname === '/auth/callback'
  ? new URLSearchParams(window.location.search)
  : null
if (callback) window.history.replaceState(null, '', '/auth/callback')

function messageFor(error: unknown): string {
  if (error instanceof AuthApiError) return errorMessages[error.code] ?? errorMessages.authentication_failed
  return errorMessages.authentication_failed
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function initialize() {
      try {
        const code = callback?.get('code')
        const callbackError = callback?.get('error')
        const linked = callback?.get('linked')

        if (code) {
          setSession(await exchangeGoogleCode(code))
          window.history.replaceState(null, '', '/')
          setMessage('Signed in with Google.')
        } else {
          setSession(await restoreSession())
          if (callbackError) {
            setMessage(errorMessages[callbackError] ?? errorMessages.external_login_failed)
          } else if (linked === 'google') {
            window.history.replaceState(null, '', '/')
            setMessage('Google is now linked to your LAPIS account.')
          } else if (callback) {
            setMessage(errorMessages.external_login_code_invalid)
          }
        }
      } catch (error) {
        setMessage(messageFor(error))
      } finally {
        setBusy(false)
      }
    }

    void initialize()
  }, [])

  async function submitLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      setSession(await (mode === 'login' ? login(email, password) : register(email, password)))
      setPassword('')
    } catch (error) {
      setMessage(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setMessage(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-6">
      <section className="w-full max-w-xl p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <div>
          <p className="text-cyan-400 font-semibold">LAPIS</p>
          <h1 className="text-3xl font-bold mt-2">Your boards start here</h1>
          <p className="text-slate-400 mt-2">Sign in to create and share connected notes.</p>
        </div>

        {message && <p role="status" className="rounded-lg bg-slate-800 p-3 text-sm">{message}</p>}

        {busy && !session ? <p>Loading your session…</p> : session ? (
          <div className="space-y-4">
            <p>Signed in as <strong>{session.user.email}</strong></p>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => void run(startGoogleLink, 'Opening Google…')}
                className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
                Link Google
              </button>
              <button disabled={busy} onClick={() => void run(unlinkGoogle, 'Google login removed.')}
                className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-50">
                Remove Google login
              </button>
              <button disabled={busy} onClick={() => void run(async () => { await logout(); setSession(null) }, 'Signed out.')}
                className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-50">
                Sign out
              </button>
              <button disabled={busy} onClick={() => void run(async () => { await logoutEverywhere(); setSession(null) }, 'Signed out everywhere.')}
                className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-50">
                Sign out everywhere
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <form onSubmit={(event) => void submitLocal(event)} className="space-y-4">
              <label className="block text-sm">Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required
                  autoComplete="email" className="mt-1 w-full rounded-lg bg-slate-800 p-3" />
              </label>
              <label className="block text-sm">Password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="mt-1 w-full rounded-lg bg-slate-800 p-3" />
              </label>
              <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(null) }}
              className="text-sm text-cyan-300">
              {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
            </button>
            <div className="border-t border-slate-700 pt-5">
              <button onClick={startGoogleLogin} className="w-full rounded-lg border border-slate-600 px-4 py-3">
                Continue with Google
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
