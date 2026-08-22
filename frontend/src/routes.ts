/** Hash-routed views: `#/`, `#/admin`, `#/workers`, `#/workers/<id>`. */
export type Route =
  | { view: 'jobs' }
  | { view: 'admin' }
  | { view: 'workers'; workerId?: string }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'admin') return { view: 'admin' }
  if (parts[0] === 'workers') {
    return parts[1] ? { view: 'workers', workerId: decodeURIComponent(parts[1]) } : { view: 'workers' }
  }
  return { view: 'jobs' }
}

export function toHash(route: Route): string {
  switch (route.view) {
    case 'admin':
      return '#/admin'
    case 'workers':
      return route.workerId ? `#/workers/${encodeURIComponent(route.workerId)}` : '#/workers'
    default:
      return '#/'
  }
}
