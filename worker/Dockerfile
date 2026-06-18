# Render Worker — Cloud Run 배포 단위
# 렌더는 @napi-rs/canvas(Skia 내장) + ffmpeg로 한다. Chrome/Puppeteer는 더 이상 쓰지 않는다.
FROM node:22-slim

# ffmpeg(영상 합성) + fontconfig/한글 폰트(@napi-rs/canvas의 in-image 텍스트 렌더용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates fontconfig \
    fonts-noto fonts-noto-cjk fonts-nanum fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript && npx tsc

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
