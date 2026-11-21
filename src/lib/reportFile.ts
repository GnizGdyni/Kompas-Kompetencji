import { supabase } from "./supabase";

const BUCKET = "reports";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ReportFileMeta = {
  report_file_path: string;
  report_file_name: string;
  report_file_mime: string;
  report_file_size: number;
  report_file_uploaded_at: string;
};

function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export function validateReportFile(file: File): string | null {
  if (file.size <= 0) return "Plik jest pusty.";
  if (file.size > MAX_BYTES) return "Plik jest za duży (max 10 MB).";
  if (file.type && !ALLOWED.has(file.type)) {
    return "Dozwolone: PDF, DOC/DOCX, JPG, PNG, WEBP.";
  }
  return null;
}

export async function uploadReportFile(
  caseId: string,
  file: File,
): Promise<ReportFileMeta> {
  const err = validateReportFile(file);
  if (err) throw new Error(err);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${caseId}/${stamp}_${safeFileName(file.name)}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
  if (upErr) throw new Error(upErr.message);

  return {
    report_file_path: path,
    report_file_name: file.name,
    report_file_mime: file.type || "application/octet-stream",
    report_file_size: file.size,
    report_file_uploaded_at: new Date().toISOString(),
  };
}

export async function removeReportFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function signedReportUrl(
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Nie udało się otworzyć pliku");
  }
  return data.signedUrl;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
