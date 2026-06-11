import RenderStage from "./RenderStage";

/**
 * 렌더 전용 페이지 — Worker(Puppeteer)가 여는 헤드리스 렌더 무대.
 * UI 없음. window API로 장면 주입 → seek → 프레임 캡처.
 * 프리뷰(ScenePlayer)와 동일한 renderCore를 사용해 픽셀 일치를 보장한다.
 */
export default function RenderPage() {
  return <RenderStage />;
}
