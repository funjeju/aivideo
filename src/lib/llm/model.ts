/** 영상 생성에 쓰는 텍스트 LLM 모델 (원고·Vision). 어드민에서 선택. */
export const LLM_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-5",
  "gpt-5-mini",
  "o4-mini",
] as const;
export type LlmModel = (typeof LLM_MODELS)[number];
export const DEFAULT_LLM_MODEL: LlmModel = "gpt-4o";

/** 사람이 보기 좋은 라벨 + 성격 */
export const LLM_MODEL_INFO: Record<LlmModel, string> = {
  "gpt-4o": "gpt-4o (기본, 균형)",
  "gpt-4o-mini": "gpt-4o-mini (빠르고 저렴)",
  "gpt-4.1": "gpt-4.1 (개선판)",
  "gpt-4.1-mini": "gpt-4.1-mini (저렴)",
  "gpt-5": "gpt-5 (최고 품질, 느림·고가)",
  "gpt-5-mini": "gpt-5-mini (고품질·중간가)",
  "o4-mini": "o4-mini (추론 특화)",
};

export function resolveLlmModel(v: unknown): LlmModel {
  return typeof v === "string" && (LLM_MODELS as readonly string[]).includes(v)
    ? (v as LlmModel)
    : DEFAULT_LLM_MODEL;
}

/** gpt-5 / o-시리즈는 추론 모델 — temperature 미지원 + max_completion_tokens 사용 */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}
