import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the LatentForge heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'LatentForge' })).toBeInTheDocument()
  })

  it('renders the project description', () => {
    render(<App />)
    expect(
      screen.getByText(/distributed image generation with workflow automation/i),
    ).toBeInTheDocument()
  })
})
