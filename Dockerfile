# ==========================================
# STAGE 1: Build & Dependency Resolution
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies cleanly
RUN npm ci --only=production

# Copy application source code
COPY server.js ./

# ==========================================
# STAGE 2: Distroless Minimal Production Runtime
# ==========================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app

# Copy isolated production artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js

# Enforce Non-Root Execution Context (UID 65532 is nonroot in Distroless)
USER nonroot:nonroot

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["server.js"]