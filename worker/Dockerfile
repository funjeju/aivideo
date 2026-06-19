# Render Worker — Cloud Run 배포 단위
# 렌더는 @napi-rs/canvas(Skia 내장) + ffmpeg로 한다. Chrome/Puppeteer는 더 이상 쓰지 않는다.
# 베이스를 고정 버전으로 핀(node:22-slim 무버전 태그는 재빌드마다 최신으로 바뀜).
# 2026-06-19: 갱신된 node:22-slim에서 googleapis OAuth 토큰 페치가 깨지는 회귀 발생 → 안정 LTS로 고정.
FROM node:22.12.0-slim

# ffmpeg(영상 합성) + fontconfig/한글 폰트(@napi-rs/canvas의 in-image 텍스트 렌더용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates fontconfig \
    fonts-noto fonts-noto-cjk fonts-nanum fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package-lock.json까지 복사 + npm ci → 의존성 트리 고정(재빌드 드리프트 방지).
# (과거 npm install은 매 빌드 최신 해석 → node-fetch 등 드리프트로 OAuth 토큰 페치가 깨지는 사고 발생)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript && npx tsc

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
