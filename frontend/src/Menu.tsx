import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string
  /** Trigger contents (icon or initials). */
  trigger: ReactNode
  /** Extra class on the trigger button. */
  triggerClassName?: string
  /** Optional non-interactive header row shown above the items. */
  header?: ReactNode
  /** Menu items: render `<MenuItem>`s; `close` dismisses the menu. */
  children: (close: () => void) => ReactNode
}

/** Dropdown menu anchored to a trigger; closes on outside click or Escape. */
export function Menu({ label, trigger, triggerClassName, header, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
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

  const close = () => setOpen(false)

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className={triggerClassName ? `nav-icon ${triggerClassName}` : 'nav-icon'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <ul className="menu" role="menu">
          {header && (
            <li className="menu-header" role="presentation">
              {header}
            </li>
          )}
          {children(close)}
        </ul>
      )}
    </div>
  )
}

interface MenuItemProps {
  children: ReactNode
  href?: string
  current?: boolean
  onSelect?: () => void
}

/** One menu entry: a link when `href` is given, otherwise a button. */
export function MenuItem({ children, href, current, onSelect }: MenuItemProps) {
  const ariaCurrent = current ? 'page' : undefined
  return (
    <li role="none">
      {href ? (
        <a role="menuitem" href={href} aria-current={ariaCurrent}>
          {children}
        </a>
      ) : (
        <button type="button" role="menuitem" aria-current={ariaCurrent} onClick={onSelect}>
          {children}
        </button>
      )}
    </li>
  )
}
