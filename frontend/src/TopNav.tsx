import type { User } from './api'
import { Menu, MenuItem } from './Menu'
import type { Route } from './routes'

interface TopNavProps {
  route: Route
  onNavigate: (route: Route) => void
  user: User | null
  isAdmin: boolean
  /** Where the account is managed (usr); omitted when SSO is off. */
  accountUrl?: string
}

/** Initials for the avatar: first letter of the username (email local part). */
function initials(user: User | null): string {
  const name = user?.username.split('@')[0] ?? ''
  return name.slice(0, 1).toUpperCase() || '?'
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

/**
 * Top navigation: brand on the left (returns to the job queue); on the right a
 * settings gear (Workers, Admin) and a profile menu (Account).
 */
export function TopNav({ route, onNavigate, user, isAdmin, accountUrl }: TopNavProps) {
  const showProfile = user !== null || accountUrl !== undefined

  return (
    <header className="topnav">
      <a
        className="brand"
        href="#/"
        aria-current={route.view === 'jobs' ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          onNavigate({ view: 'jobs' })
        }}
      >
        LatentForge
      </a>
      <nav className="topnav-actions" aria-label="Site">
        <Menu label="Settings" trigger={<GearIcon />}>
          {(close) => (
            <>
              <MenuItem
                current={route.view === 'workers'}
                onSelect={() => {
                  close()
                  onNavigate({ view: 'workers' })
                }}
              >
                Workers
              </MenuItem>
              {isAdmin && (
                <MenuItem
                  current={route.view === 'admin'}
                  onSelect={() => {
                    close()
                    onNavigate({ view: 'admin' })
                  }}
                >
                  Admin
                </MenuItem>
              )}
            </>
          )}
        </Menu>
        {showProfile && (
          <Menu
            label="Profile menu"
            trigger={initials(user)}
            triggerClassName="avatar"
            header={
              user && (
                <>
                  Signed in as <strong>{user.username}</strong>
                </>
              )
            }
          >
            {() => (accountUrl ? <MenuItem href={accountUrl}>Account</MenuItem> : null)}
          </Menu>
        )}
      </nav>
    </header>
  )
}
