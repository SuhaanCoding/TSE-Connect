import { RESUME_LIMITS } from "./config";
import { cleanMatchText } from "./documents";
export function validateResumeFile(
  file: Pick<File, "name" | "size">,
): string | null {
  if (file.size > RESUME_LIMITS.bytes)
    return "Use a PDF or text file smaller than 5 MB.";
  if (!/\.(pdf|txt)$/i.test(file.name))
    return "Choose a PDF or .txt file. You can also paste your experience below.";
  if (!file.size)
    return "That file is empty. Choose another file or paste your experience.";
  return null;
}
export async function readResume(file: File): Promise<string> {
  const error = validateResumeFile(file);
  if (error) throw new Error(error);
  let text = "";
  if (/\.txt$/i.test(file.name)) text = await file.text();
  else {
    const data = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(data.slice(0, 8)).includes("%PDF-"))
      throw new Error(
        "That file isn’t a readable PDF. Export it as a PDF again or paste the text.",
      );
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/matching/pdf.worker.min.mjs";
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    try {
      task = pdfjs.getDocument({
        data,
        disableFontFace: true,
        useWorkerFetch: false,
        enableXfa: false,
      });
      const document = await task.promise;
      if (document.numPages > RESUME_LIMITS.pages)
        throw new Error(
          "Use a resume of 10 pages or fewer, or paste the sections you want to match.",
        );
      const pages = [];
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) =>
              "str" in item
                ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                : "",
            )
            .join(""),
        );
        page.cleanup();
      }
      text = pages.join("\n\n");
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException")
        throw new Error(
          "This PDF is password protected. Use an unlocked copy or paste its text.",
        );
      if (error instanceof Error && /pages or fewer/.test(error.message))
        throw error;
      throw new Error(
        "Couldn’t read that PDF. Try a text-based PDF or paste your experience below.",
      );
    } finally {
      await task?.destroy();
    }
  }
  if (text.length > RESUME_LIMITS.characters)
    throw new Error(
      "Use 30,000 characters or fewer. Paste the projects and experience you want to match.",
    );
  const cleaned = cleanMatchText(text);
  if (cleaned.length < 40)
    throw new Error(
      "There isn’t enough selectable text in this file. Scanned PDFs need text recognition first; you can paste your experience below.",
    );
  return cleaned;
}
