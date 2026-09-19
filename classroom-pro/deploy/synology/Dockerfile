# sql.js：无原生模块，兼容群晖 Web Station 旧 GLIBC
FROM node:20-bookworm-slim AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci || npm install
COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server/ ./

WORKDIR /app
COPY --from=client-build /build/client/dist ./client/dist
RUN mkdir -p /app/data && chown -R node:node /app

ENV PORT=3789
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CLIENT_DIST=/app/client/dist
EXPOSE 3789
USER node
WORKDIR /app/server
CMD ["node", "index.js"]
