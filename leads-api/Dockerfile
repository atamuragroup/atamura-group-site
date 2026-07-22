# syntax=docker/dockerfile:1
# Lead-capture backend for atamura-group-site — bundled to a single .mjs, no runtime node_modules.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LEADS_FILE=/app/data/leads.jsonl \
    SITE_LEADS_FILE=/app/data/site-leads.jsonl
WORKDIR /app
COPY --from=build /app/dist-server/server.mjs ./server.mjs
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
