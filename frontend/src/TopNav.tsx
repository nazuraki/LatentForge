import { useEffect, useRef, useState } from 'react'
import type { User } from './api'

export type View = 'jobs' | 'admin'

interface TopNavProps {
  view: View
  onNavigate: (view: View) => void
  user: User | null
  isAdmin: boolean
  /** Where the account is managed (usr); omitted when SSO is off. */
  accountUrl?: string
}

/** Initials for the avatar: first letter of the username (email local part). */
function initials(user: User | null): string {
  if (!user) return '?'
  const name = user.username.split('@')[0]
  return name.slice(0, 1).toUpperCase() || '?'
}

/**
 * Top navigation: brand on the left (returns to the job queue), profile menu
 * on the right with Account (usr) and Admin entries.
 */
export function TopNav({ view, onNavigate, user, isAdmin, accountUrl }: TopNavProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const hasMenu = user !== null || isAdmin || accountUrl !== undefined

  return (
    <header className="topnav">
      <a
        className="brand"
        href="#/"
        aria-current={view === 'jobs' ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          onNavigate('jobs')
        }}
      >
        LatentForge
      </a>
      {hasMenu && (
        <div className="profile-menu" ref={menuRef}>
          <button
            type="button"
            className="avatar"
            aria-label="Profile menu"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {initials(user)}
          </button>
          {open && (
            <ul className="menu" role="menu">
              {user && (
                <li className="menu-user" role="presentation">
                  Signed in as <strong>{user.username}</strong>
                </li>
              )}
              {accountUrl && (
                <li role="none">
                  <a role="menuitem" href={accountUrl}>
                    Account
                  </a>
                </li>
              )}
              {isAdmin && (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={view === 'admin' ? 'page' : undefined}
                    onClick={() => {
                      setOpen(false)
                      onNavigate('admin')
                    }}
                  >
                    Admin
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </header>
  )
}
