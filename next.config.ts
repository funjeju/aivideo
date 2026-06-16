import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// firebase-admin은 Next 기본 serverExternalPackages에 포함되어 런타임 require()로 로드되는데,
// v14는 ESM(+TLA)이라 ERR_REQUIRE_ESM 발생 (Node 22 require(esm)으로도 불가).
// transpilePackages로 강제 번들하여 해결.
const nextConfig: NextConfig = {
  transpilePackages: ["firebase-admin"],
  // @google-cloud/tasks는 gRPC 동적 require(proto 로딩)라 번들하면
  // "Cannot find module as expression is too dynamic"로 빌드 실패.
  // 번들에서 제외하고 런타임 node_modules require로 로드.
  serverExternalPackages: ["@google-cloud/tasks"],
};

export default withNextIntl(nextConfig);
