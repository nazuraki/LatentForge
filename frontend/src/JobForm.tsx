import { Alert, Button, Field, Input, Textarea } from '@nazuraki/ui-react'
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
    <form className="panel" onSubmit={handleSubmit}>
      <Field label="Prompt" htmlFor="job-prompt">
        <Textarea
          id="job-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="a red fox in fresh snow, golden hour"
          rows={2}
          required
        />
      </Field>
      <div className="form-row">
        <Field label="Model" htmlFor="job-model">
          <Input
            id="job-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="sdxl-1.0"
          />
        </Field>
        <Field label="Seed" htmlFor="job-seed">
          <Input
            id="job-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            inputMode="numeric"
            pattern="[0-9]*"
          />
        </Field>
        <Button type="submit" variant="accent" disabled={submitting || prompt.trim() === ''}>
          Generate
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
    </form>
  )
}
