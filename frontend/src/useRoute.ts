import { useCallback, useEffect, useState } from 'react'
import { parseHash, toHash, type Route } from './routes'

/** Current hash route plus a navigate function; hash keeps views linkable. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    window.location.hash = toHash(next)
    setRoute(next)
  }, [])

  return [route, navigate]
}
