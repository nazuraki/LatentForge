import { Button, Input, Select } from '@nazuraki/ui-react'
import { useState } from 'react'
import type { Role, User } from '../api'
import { parseTags } from './tags'

export type UserUpdate = { role?: Role; disabled?: boolean; tags?: string[] }

interface UserTableProps {
  users: User[]
  selfId?: string
  onApply: (id: string, update: UserUpdate) => void
}

export function UserTable({ users, selfId, onApply }: UserTableProps) {
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})

  if (users.length === 0) return <p className="muted">No users yet.</p>
  return (
    <div className="table-wrap">
      <table className="nb-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Tag grants</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const self = user.id === selfId
            const draft = tagDrafts[user.id] ?? user.tags.join(', ')
            return (
              <tr key={user.id}>
                <td>
                  {user.username}
                  {self ? ' (you)' : ''}
                </td>
                <td>
                  <Select
                    aria-label={`Role for ${user.username}`}
                    value={user.role}
                    disabled={self}
                    onChange={(e) => onApply(user.id, { role: e.target.value as Role })}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </Select>
                </td>
                <td>
                  <Input
                    aria-label={`Tags for ${user.username}`}
                    value={draft}
                    placeholder="e.g. nsfw"
                    onChange={(e) => setTagDrafts({ ...tagDrafts, [user.id]: e.target.value })}
                    onBlur={() => {
                      if (draft !== user.tags.join(', ')) onApply(user.id, { tags: parseTags(draft) })
                    }}
                  />
                </td>
                <td>
                  {self ? (
                    'active'
                  ) : (
                    <Button
                      type="button"
                      variant={user.disabled ? 'accent' : 'danger'}
                      onClick={() => onApply(user.id, { disabled: !user.disabled })}
                    >
                      {user.disabled ? 'Enable' : 'Disable'}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
