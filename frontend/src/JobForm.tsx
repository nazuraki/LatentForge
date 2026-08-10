import { useState, type FormEvent } from 'react'
import { createJob } from './api'

interface JobFormProps {
  onCreated: () => void
}

export function JobForm({ onCreated }: JobFormProps) {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [seed, setSeed] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      await createJob({
        prompt,
        ...(model ? { model } : {}),
        ...(seed ? { seed: Number(seed) } : {}),
      })
      setPrompt('')
      setSeed('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="job-form" onSubmit={handleSubmit}>
      <label>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a red fox in fresh snow, golden hour"
          rows={2}
          required
        />
      </label>
      <div className="job-form-row">
        <label>
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="sdxl-1.0"
          />
        </label>
        <label>
          Seed
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </label>
        <button type="submit" disabled={submitting || prompt.trim() === ''}>
          Generate
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}
