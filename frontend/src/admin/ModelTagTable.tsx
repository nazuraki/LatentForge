import { Input } from '@nazuraki/ui-react'
import { useEffect, useState } from 'react'
import { getModelTags, setModelTags } from '../api'
import { parseTags } from './tags'

interface ModelTagTableProps {
  models: string[]
  onError: (message: string) => void
}

export function ModelTagTable({ models, onError }: ModelTagTableProps) {
  const [tags, setTags] = useState<Record<string, string[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    getModelTags().then(
      ({ models: assigned }) => setTags(assigned),
      (err) => onError(err instanceof Error ? err.message : 'failed to load model tags'),
    )
  }, [onError])

  // Every model a worker offers, plus any model that already has tags.
  const all = [...new Set([...models, ...Object.keys(tags)])].sort()

  async function save(model: string, draft: string) {
    try {
      const res = await setModelTags(model, parseTags(draft))
      setTags((prev) => ({ ...prev, [model]: res.tags }))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'failed to save model tags')
    }
  }

  if (all.length === 0) return <p className="muted">No models yet — connect a worker.</p>
  return (
    <div className="table-wrap">
      <table className="nb-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {all.map((model) => {
            const current = (tags[model] ?? []).join(', ')
            const draft = drafts[model] ?? current
            return (
              <tr key={model}>
                <td>{model}</td>
                <td>
                  <Input
                    aria-label={`Tags for model ${model}`}
                    value={draft}
                    placeholder="open to everyone"
                    onChange={(e) => setDrafts({ ...drafts, [model]: e.target.value })}
                    onBlur={() => {
                      if (draft !== current) save(model, draft)
                    }}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
