FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./

ENV CHROME_PATH=/usr/bin/chromium
EXPOSE 4181
CMD ["npm", "start"]
