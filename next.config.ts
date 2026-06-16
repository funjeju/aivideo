import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// firebase-admin은 Next 기본 serverExternalPackages에 포함되어 런타임 require()로 로드되는데,
// v14는 ESM(+TLA)이라 ERR_REQUIRE_ESM 발생 (Node 22 require(esm)으로도 불가).
// transpilePackages로 강제 번들하여 해결.
const nextConfig: NextConfig = {
  transpilePackages: ["firebase-admin"],
  // 큐 적재는 @google-cloud/tasks SDK(gRPC) 대신 Cloud Tasks REST를 fetch로 직접
  // 호출한다(src/lib/queue.ts) — Vercel 번들/런타임에서 SDK 로드가 불안정해서.
};

export default withNextIntl(nextConfig);
