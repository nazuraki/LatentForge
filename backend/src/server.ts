import { buildApp } from './app.ts'

const port = Number(process.env.PORT ?? 3001)
const app = buildApp({ logger: true }, { dataDir: process.env.LATENTFORGE_DATA_DIR })

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
