import { getTranslations } from "next-intl/server";
import CreateEnForm from "./CreateEnForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "create" });
  return { title: `Create English Video — Easyshorts` };
}

export default function CreateEnPage() {
  return <CreateEnForm />;
}
