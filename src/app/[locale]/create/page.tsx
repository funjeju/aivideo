import { getTranslations } from "next-intl/server";
import CreateForm from "./CreateForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "create" });
  return { title: `${t("title")} — Easyshorts` };
}

export default function CreatePage() {
  return <CreateForm />;
}
