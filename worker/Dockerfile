# Render Worker — Cloud Run 배포 단위
FROM node:22-slim

# ffmpeg + Chromium 실행에 필요한 시스템 라이브러리
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc-s1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    wget gnupg \
    && rm -rf /var/lib/apt/lists/*

# 한글 폰트 (in-image 텍스트가 overlay/hybrid일 때 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk fonts-nanum \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
# Puppeteer가 Chromium을 컨테이너 내부에 받도록
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npm install --omit=dev && npx puppeteer browsers install chrome

COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript && npx tsc

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
