# Cloud Run image for the demo service. Workspace-aware: installs at the
# root, builds the Next app, ships the traced standalone output only.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/assistant-core/package.json packages/assistant-core/
COPY apps/demo/package.json apps/demo/
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @amalthea/demo

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/demo/.next/standalone ./
COPY --from=build /app/apps/demo/.next/static ./apps/demo/.next/static
EXPOSE 8080
USER node
CMD ["node", "apps/demo/server.js"]
