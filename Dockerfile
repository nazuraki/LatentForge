# Backend + built frontend in one image. The Python worker is NOT part of this
# image — it runs wherever the GPU is and talks to this server over HTTP.

FROM node:24-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-slim AS backend-deps
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Runtime: Node 24 strips types natively, so backend .ts sources run as-is.
FROM node:24-slim
ENV NODE_ENV=production \
    LATENTFORGE_DATA_DIR=/data \
    LATENTFORGE_STATIC_DIR=/app/public \
    PORT=3001
WORKDIR /app
COPY --from=backend-deps /build/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=frontend-build /build/dist ./public
# chown before USER so a named volume mounted at /data inherits node's ownership
RUN mkdir -p /data && chown node:node /data /app
USER node
EXPOSE 3001
CMD ["node", "src/server.ts"]
