# ============================================
# Mastra MCP Server — self-contained
# ============================================

FROM node:22-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV MASTRA_MCP_PORT=4112
ENV MASTRA_MCP_PATH=/mcp

COPY --from=build /app/node_modules ./node_modules
COPY package.json server.ts ./

EXPOSE 4112

CMD ["npx", "tsx", "server.ts"]
