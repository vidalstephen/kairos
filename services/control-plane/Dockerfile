# syntax=docker/dockerfile:1.7
FROM node:20.11-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini

FROM base AS deps
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM base AS dev
ENV NODE_ENV=development
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
EXPOSE 3001
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npx","nest","start","--watch"]

FROM base AS prod
ENV NODE_ENV=production
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/main.js"]
