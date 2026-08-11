import type { FastifyInstance, FastifyRequest, onRequestHookHandler } from 'fastify'
import {
  clearSessionCookie,
  parseCookies,
  requireAdmin,
  SESSION_COOKIE,
  sessionCookie,
} from '../auth.ts'
import {
  LastAdminError,
  UsernameTakenError,
  UserNotFoundError,
  type Role,
  type User,
  type UserStore,
} from './store.ts'

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1 },
      password: { type: 'string', minLength: 1 },
    },
  },
} as const

const createUserSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1, maxLength: 64 },
      password: { type: 'string', minLength: 8 },
      role: { type: 'string', enum: ['admin', 'user'] },
      tags: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

const updateUserSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      password: { type: 'string', minLength: 8 },
      role: { type: 'string', enum: ['admin', 'user'] },
      disabled: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

const modelTagsSchema = {
  body: {
    type: 'object',
    required: ['tags'],
    additionalProperties: false,
    properties: {
      tags: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

interface LoginBody {
  username: string
  password: string
}

interface CreateUserBody extends LoginBody {
  role?: Role
  tags?: string[]
}

interface UpdateUserBody {
  password?: string
  role?: Role
  disabled?: boolean
  tags?: string[]
}

/** Public shape: everything but the password hash (which User never carries). */
function publicUser(user: User) {
  return user
}

function secure(req: FastifyRequest): boolean {
  return req.protocol === 'https'
}

/**
 * Login/logout/me plus admin-only user management and model-tag assignment.
 * The auth endpoints stay outside the session gate — the SPA needs them to
 * render the login screen; `me` reports rather than rejects.
 */
export function userRoutes(
  app: FastifyInstance,
  users: UserStore,
  sessionAuth: onRequestHookHandler[],
  authEnabled: boolean,
) {
  // Open: tells the SPA whether a login screen is needed and who is signed in.
  app.get('/api/auth/me', (req) => {
    if (!authEnabled) {
      return { authRequired: false, authenticated: true, user: null }
    }
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    const user = token ? users.userForSession(token) : undefined
    return {
      authRequired: true,
      authenticated: Boolean(user),
      user: user ? publicUser(user) : null,
    }
  })

  // Open: exchanges credentials for a session cookie.
  app.post<{ Body: LoginBody }>('/api/auth/login', { schema: loginSchema }, async (req, reply) => {
    if (!authEnabled) return reply.code(409).send({ error: 'auth is not enabled' })
    const user = users.verifyCredentials(req.body.username, req.body.password)
    if (!user) return reply.code(401).send({ error: 'invalid credentials' })
    const { token, expiresAt } = users.createSession(user.id)
    return reply
      .header('set-cookie', sessionCookie(token, expiresAt, secure(req)))
      .send({ user: publicUser(user) })
  })

  // Open but harmless: revokes only the session presented in the cookie.
  app.post('/api/auth/logout', async (req, reply) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) users.revokeSession(token)
    return reply.header('set-cookie', clearSessionCookie(secure(req))).send({ ok: true })
  })

  const adminOnly = { onRequest: sessionAuth, preHandler: requireAdmin }

  app.get('/api/users', adminOnly, () => ({ users: users.list().map(publicUser) }))

  app.post<{ Body: CreateUserBody }>(
    '/api/users',
    { ...adminOnly, schema: createUserSchema },
    async (req, reply) => {
      try {
        let user = users.create(req.body.username, req.body.password, req.body.role ?? 'user')
        if (req.body.tags?.length) user = users.setTags(user.id, req.body.tags)
        return reply.code(201).send(publicUser(user))
      } catch (err) {
        if (err instanceof UsernameTakenError) return reply.code(409).send({ error: err.message })
        throw err
      }
    },
  )

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    '/api/users/:id',
    { ...adminOnly, schema: updateUserSchema },
    async (req, reply) => {
      const { id } = req.params
      try {
        if (req.body.role !== undefined) users.setRole(id, req.body.role)
        if (req.body.disabled !== undefined) users.setDisabled(id, req.body.disabled)
        if (req.body.tags !== undefined) users.setTags(id, req.body.tags)
        if (req.body.password !== undefined) users.setPassword(id, req.body.password)
      } catch (err) {
        if (err instanceof UserNotFoundError) return reply.code(404).send({ error: err.message })
        if (err instanceof LastAdminError) return reply.code(409).send({ error: err.message })
        throw err
      }
      const user = users.get(id)
      if (!user) return reply.code(404).send({ error: `user not found: ${id}` })
      return publicUser(user)
    },
  )

  app.get('/api/model-tags', adminOnly, () => ({ models: users.modelTags() }))

  app.put<{ Params: { model: string }; Body: { tags: string[] } }>(
    '/api/model-tags/:model',
    { ...adminOnly, schema: modelTagsSchema },
    async (req) => {
      users.setModelTags(req.params.model, req.body.tags)
      return { model: req.params.model, tags: [...new Set(req.body.tags)].sort() }
    },
  )
}
