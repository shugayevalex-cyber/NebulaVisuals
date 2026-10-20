# Nebula Visuals — Docker image for production
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy deps and source
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY public ./public

# Data directory for SQLite (mounted volume)
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "server.js"]