FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    unixodbc-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps


# Build Next.js
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    STANDALONE_BUILD=true

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

RUN npm run build


# Production
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PSQL_PATH=/usr/bin/psql \
    COMPANY_BOOTSTRAP_SCRIPT_PATH=/app/scripts/company-bootstrap.sql

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    unixodbc \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

RUN mkdir -p /app/uploads \
  && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
