# ── Build the frontend ───────────────────────────────────────────────
FROM oven/bun:1 AS web
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY web/ ./
RUN bun run build

# ── Runtime: Elysia serves the API and the built SPA ─────────────────
FROM oven/bun:1 AS runtime
WORKDIR /app/server
COPY server/package.json server/bun.lock* ./
RUN bun install --frozen-lockfile --production || bun install --production
COPY server/ ./
COPY --from=web /app/web/dist /app/web/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["bun", "src/index.ts"]
