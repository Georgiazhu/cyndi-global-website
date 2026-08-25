import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const AuthContext = createContext(null)

async function apiRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load current session on mount.
  useEffect(() => {
    let active = true
    apiRequest('/api/me')
      .then(data => { if (active) setUser(data.user) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const register = useCallback(async ({ email, password, displayName }) => {
    const data = await apiRequest('/api/register', { method: 'POST', body: { email, password, displayName } })
    setUser(data.user)
    return data.user
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const data = await apiRequest('/api/login', { method: 'POST', body: { email, password } })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await apiRequest('/api/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
