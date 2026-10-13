FROM node:20-alpine AS builder

WORKDIR /app

# Copy root monorepo files and package manifests
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build shared and server
RUN npm run build:shared
WORKDIR /app/apps/server
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/dist ./packages/shared/dist
COPY apps/server/package.json ./apps/server/
COPY apps/server/dist ./apps/server/dist
COPY apps/server/prisma ./apps/server/prisma

# Install production dependencies only
RUN npm install --omit=dev
WORKDIR /app/apps/server
RUN npx prisma generate

EXPOSE 4000

CMD ["node", "dist/index.js"]
