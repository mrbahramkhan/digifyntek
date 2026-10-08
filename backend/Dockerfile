FROM node:20-alpine
WORKDIR /app
RUN addgroup -S forge && adduser -S forge -G forge
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY phase1/ ./phase1/
# server expects phase1 at ../../phase1 from src => /app/phase1 works if path fixed
USER root
RUN mkdir -p /app/logs && chown -R forge:forge /app
USER forge
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node scripts/healthcheck.js || exit 1
CMD ["node", "src/server.js"]
