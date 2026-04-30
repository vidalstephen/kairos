# syntax=docker/dockerfile:1.7
FROM node:25.9-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini

FROM base AS deps
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund

FROM base AS dev
ENV NODE_ENV=development
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm","run","dev"]

FROM base AS build
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server.js"]
