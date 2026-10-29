const MANUAL_COPY_ERROR = "Copy the text manually. Automatic copying is unavailable on this page.";

export async function copyText(text: string): Promise<void> {
  if (!text) throw new Error("Enter or select text to copy, then try again.");
  if (!navigator.clipboard?.writeText) throw new Error(MANUAL_COPY_ERROR);
  try { await navigator.clipboard.writeText(text); }
  catch { throw new Error(MANUAL_COPY_ERROR); }
}

export function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
