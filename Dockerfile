# check=skip=SecretsUsedInArgOrEnv
# VITE_SUPABASE_PUBLISHABLE_KEY is a public anon key intentionally embedded in the JS bundle

# ---- Build stage ----
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG APP_VERSION=0.1.0

RUN bun run build

# ---- Serve stage ----
FROM nginx:alpine

ARG APP_VERSION=0.1.0

LABEL org.opencontainers.image.title="GestãoPro" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="Pronutrir"

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
