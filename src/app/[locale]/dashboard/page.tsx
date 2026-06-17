import { getTranslations } from "next-intl/server";
import DashboardClient from "./DashboardClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: `${t("title")} — Easyshorts` };
}

export default function DashboardPage() {
  return <DashboardClient />;
}
