export type AuthSession = {
  accessToken: string
  expiresAt: string
  user: { id: string; email: string }
}

export class AuthApiError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

let session: AuthSession | null = null
let csrfToken: string | null = null
let refreshInFlight: Promise<AuthSession | null> | null = null
let externalExchangeInFlight: Promise<AuthSession> | null = null

async function errorFromResponse(response: Response): Promise<AuthApiError> {
  const body: { error?: string } = await response.json().catch(() => ({}))
  return new AuthApiError(body.error ?? 'authentication_failed')
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken

  const response = await fetch('/api/auth/csrf', { credentials: 'include' })
  if (!response.ok) throw new Error('Could not start the authentication request.')

  const body: { token: string } = await response.json()
  csrfToken = body.token
  return csrfToken
}

async function startSession(path: string, email: string, password: string): Promise<AuthSession> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': await getCsrfToken() },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw await errorFromResponse(response)

  session = await response.json()
  return session!
}

export function register(email: string, password: string): Promise<AuthSession> {
  return startSession('/api/auth/register', email, password)
}

export function login(email: string, password: string): Promise<AuthSession> {
  return startSession('/api/auth/login', email, password)
}

export function startGoogleLogin(): void {
  window.location.assign('/api/auth/external/google')
}

export function exchangeGoogleCode(code: string): Promise<AuthSession> {
  // React Strict Mode may run a callback effect twice in development. Both callers must
  // share one request because the database grant is deliberately single-use.
  externalExchangeInFlight ??= (async () => {
    const response = await fetch('/api/auth/external/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!response.ok) throw await errorFromResponse(response)

    session = await response.json()
    return session!
  })()
  return externalExchangeInFlight
}

export async function startGoogleLink(): Promise<void> {
  const response = await apiFetch('/api/auth/external/google/link-intent', { method: 'POST' })
  if (!response.ok) throw await errorFromResponse(response)
  // The backend derives the user from our JWT before browser navigation starts.
  window.location.assign('/api/auth/external/google/link')
}

export async function unlinkGoogle(): Promise<void> {
  const response = await apiFetch('/api/auth/external/google/link', { method: 'DELETE' })
  if (!response.ok) throw await errorFromResponse(response)
}

export async function restoreSession(): Promise<AuthSession | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': await getCsrfToken() },
    })
    if (!response.ok) {
      session = null
      return null
    }

    session = await response.json()
    return session
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('Authenticated requests must target this app’s API.')
  }
  if (!session) await restoreSession()

  const send = (accessToken: string | null) => {
    const headers = new Headers(request.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(new Request(request.clone(), { headers, credentials: 'include' }))
  }

  let response = await send(session?.accessToken ?? null)
  if (response.status === 401 && session) {
    const renewed = await restoreSession()
    if (renewed) response = await send(renewed.accessToken)
  }
  return response
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-TOKEN': await getCsrfToken() },
  })
  if (!response.ok) throw new Error('Logout failed.')
  session = null
}

export async function logoutEverywhere(): Promise<void> {
  const response = await apiFetch('/api/auth/logout-everywhere', { method: 'POST' })
  if (!response.ok) throw new Error('Logout everywhere failed.')
  session = null
}
