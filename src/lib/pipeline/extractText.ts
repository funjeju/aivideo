import mammoth from "mammoth";

export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === "pdf") {
    const pdfParse = await import("pdf-parse");
    const parse = (pdfParse as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default ?? pdfParse;
    const data = await parse(buffer);
    return data.text;
  }

  // txt / md
  return buffer.toString("utf-8");
}
