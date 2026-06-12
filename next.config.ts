import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// firebase-admin을 serverExternalPackages로 빼면 Vercel 런타임이 require()로 로드해
// v13(ESM)에서 ERR_REQUIRE_ESM 발생 → 번들에 포함시킨다 (기본 동작).
const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
