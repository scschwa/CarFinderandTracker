FROM node:20-slim

RUN npx playwright install --with-deps chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
