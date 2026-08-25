import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AuthModal({ isOpen, onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const reset = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setError(''); setSubmitting(false)
  }

  const switchMode = (next) => {
    setMode(next); setError('')
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login({ email, password })
      } else {
        await register({ email, password, displayName })
      }
      handleClose()
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-base font-semibold uppercase tracking-wide text-stone-900">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h2>
          <button onClick={handleClose} className="text-stone-400 hover:text-stone-900" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">
                Display name <span className="text-stone-400 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={60}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="You can add this later"
                className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
            />
            {mode === 'register' && (
              <p className="mt-1 text-xs text-stone-400">At least 8 characters.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-[#b7410e]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-stone-900 text-white py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <div className="text-center text-sm text-stone-500">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-stone-900 underline underline-offset-4 hover:decoration-stone-900">
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-stone-900 underline underline-offset-4 hover:decoration-stone-900">
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
