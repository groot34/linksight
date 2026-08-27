# ==============================================================================
# LinkSight Dockerfile (Production Ready with Playwright System Dependencies)
# ==============================================================================

# Build Stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json tsconfig.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Production Stage with Playwright dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.50.1-noble AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package definitions and install production only dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Install Chromium browser binary for Playwright fallback mode
RUN npx playwright install chromium

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start LinkSight Fastify Server
CMD ["node", "dist/index.js"]
