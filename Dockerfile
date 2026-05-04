# check=skip=SecretsUsedInArgOrEnv
# NEXT_PUBLIC_SUPABASE_ANON_KEY is a public anon key intentionally embedded in the JS bundle

# ---- Build stage ----
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG APP_VERSION=0.1.0

# Next.js le variaveis NEXT_PUBLIC_* durante o build para embutir no bundle cliente.
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN bun run build

# ---- Serve stage ----
# Node.js Alpine: executa o servidor standalone gerado pelo Next.js
FROM node:22-alpine

WORKDIR /app

ARG APP_VERSION=0.1.0

LABEL org.opencontainers.image.title="GestãoPro" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="Pronutrir"

# Standalone bundle gerado pelo Next.js
COPY --from=builder /app/.next/standalone ./
# Arquivos estáticos (CSS, JS, imagens)
COPY --from=builder /app/.next/static ./.next/static
# Arquivos públicos (favicon, robots.txt, etc.)
COPY --from=builder /app/public ./public

# Porta padrão Next.js standalone
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

CMD ["node", "server.js"]
