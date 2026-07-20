# check=skip=SecretsUsedInArgOrEnv
# NEXT_PUBLIC_SUPABASE_ANON_KEY is a public anon key intentionally embedded in the JS bundle

# ---- Build stage ----
# Usar node:22-alpine (mesma base do runtime) para evitar erros de bun ao
# extrair tarballs de pacotes nativos grandes (@next/swc-*, sharp) no Docker.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG APP_VERSION=0.1.0

# Next.js le variaveis NEXT_PUBLIC_* durante o build para embutir no bundle cliente.
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Sem esses valores o bundle sai sem a URL do Supabase e o app quebra em runtime.
RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then \
      echo "ERRO: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY sao obrigatorios."; \
      echo "Use: docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... ."; \
      echo "Ou:  docker compose build (le as variaveis do .env)"; \
      exit 1; \
    fi

RUN npm run build

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

# --max-http-header-size=32768: mesmo limite usado nos scripts dev/build/start
# do package.json e nos buffers do nginx (proxy/nginx.conf). Sem isso o
# standalone roda com o padrão do Node (8KB) e devolve HTTP 431 quando os
# cookies de sessão do Supabase crescem — o token JWT vai no cookie e, somado a
# outros, estoura o limite.
CMD ["node", "--max-http-header-size=32768", "server.js"]
