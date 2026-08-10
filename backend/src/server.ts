import { buildApp } from './app.ts'

const port = Number(process.env.PORT ?? 3001)
const workerToken = process.env.LATENTFORGE_WORKER_TOKEN

// The Docker image sets NODE_ENV=production, so a deployed server can never run open.
if (!workerToken && process.env.NODE_ENV === 'production') {
  console.error('LATENTFORGE_WORKER_TOKEN is required in production')
  process.exit(1)
}

const app = buildApp(
  { logger: true },
  {
    dataDir: process.env.LATENTFORGE_DATA_DIR,
    workerToken,
    staticDir: process.env.LATENTFORGE_STATIC_DIR,
  },
)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down')
    // Escape hatch if a request refuses to drain
    setTimeout(() => process.exit(1), 10_000).unref()
    app.close().then(() => process.exit(0))
  })
}
