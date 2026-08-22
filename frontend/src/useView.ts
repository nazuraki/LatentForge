import { useCallback, useEffect, useState } from 'react'
import type { View } from './TopNav'

function viewFromHash(): View {
  return window.location.hash === '#/admin' ? 'admin' : 'jobs'
}

/** Hash-routed view (`#/admin`) so views are linkable and back-button friendly. */
export function useView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: View) => {
    window.location.hash = next === 'admin' ? '#/admin' : '#/'
    setView(next)
  }, [])

  return [view, navigate]
}
