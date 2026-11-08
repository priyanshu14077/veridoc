# Caddy with the landing page baked in. Build context: landing/ (see deploy/compose.yml).
# Stage 1 builds the static site; stage 2 is the stock Caddy image plus those files, nothing else.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Same address as the app: its own files live under /_landing (the app owns /_next) and links to the
# demo are same-site (/login, /api/health).
ENV LANDING_ASSET_PREFIX=/_landing NEXT_PUBLIC_APP_URL= NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=build /app/out /srv/landing
