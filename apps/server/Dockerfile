# Multi-stage build for the Captio WebSocket proxy (apps/server).
#
# Build context is this directory (apps/server), not the monorepo root — the
# server has no workspace:* dependencies, so it builds standalone.
#
#   docker build -t captio-server .
#   docker run -p 3001:3001 --env-file .env captio-server

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Required at runtime: DEEPGRAM_API_KEY, DEEPL_API_KEY, SUPABASE_JWT_SECRET
# (omit to run auth-open — fine for a private/dev deploy, not for production).
# See .env.example. PORT defaults to 3001, HOST defaults to 0.0.0.0.
EXPOSE 3001
CMD ["node", "dist/index.js"]
