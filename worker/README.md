# Render Worker

Scene Spec → mp4 렌더링 전담 서버. 메인 앱(`/render` 페이지)을 headless Chromium으로 열어
프리뷰와 동일한 `renderCore`로 프레임을 캡처하고, ffmpeg로 mp4를 만든다.

## 동작 흐름
1. `POST /render { jobId, projectId }` 수신
2. Firestore에서 project + scenes 읽기
3. 각 장면 오디오 다운로드 + `ffprobe`로 실제 길이 측정 → durationSec 보정
4. Puppeteer로 `RENDER_PAGE_URL` 열기 → 장면 주입 → 프레임별 `__seek` + 캡처
5. 오디오 concat → 프레임 + 오디오 → `ffmpeg`로 mp4
6. Storage 업로드, renderJobs/projects 문서 갱신 (진행률 포함)

## 로컬 검증

사전 요구: **ffmpeg/ffprobe가 PATH에 설치**되어 있어야 함.
(Windows: `winget install Gyan.FFmpeg` 또는 https://ffmpeg.org/download.html)

```bash
# 1) 메인 앱 실행 (렌더 페이지 제공)
cd ..
npm run dev            # http://localhost:3000

# 2) Worker 환경변수 (worker/.env 또는 셸에 export)
#    FIREBASE_ADMIN_SA_KEY=<메인 .env.local과 동일한 JSON>
#    RENDER_PAGE_URL=http://localhost:3000/render
#    PORT=8080

# 3) Worker 실행
cd worker
npm install
npm run dev            # http://localhost:8080

# 4) 메인 앱 .env.local 에 RENDER_WORKER_URL=http://localhost:8080 설정 후
#    UI에서 "mp4로 만들기" 클릭 → renderJobs 진행률 확인 → 다운로드
```

## Cloud Run 배포

```bash
gcloud run deploy aivideo-render-worker \
  --source . \
  --region asia-northeast3 \
  --memory 2Gi --cpu 2 --timeout 3600 \
  --set-env-vars RENDER_PAGE_URL=https://<your-vercel-app>/render \
  --set-env-vars FIREBASE_ADMIN_SA_KEY='<json>'
```

배포 후 출력된 서비스 URL을 메인 앱 `RENDER_WORKER_URL`에 설정한다.
