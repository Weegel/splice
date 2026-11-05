export const IMPORT_FILE_LIMITS = {
  files: 20,
  fileBytes: 5_000_000,
  totalBytes: 20_000_000,
};

export function validateImportFileSet(files: FileList | File[]): string | null {
  if (files.length > IMPORT_FILE_LIMITS.files) return `Select no more than ${IMPORT_FILE_LIMITS.files} files.`;
  let totalBytes = 0;
  for (const file of Array.from(files)) {
    if (file.size > IMPORT_FILE_LIMITS.fileBytes) return `${file.name} exceeds the 5 MB file limit.`;
    totalBytes += file.size;
  }
  if (totalBytes > IMPORT_FILE_LIMITS.totalBytes) return 'Selected files exceed the 20 MB total limit.';
  return null;
}

export async function processImportFiles<T>(
  files: FileList | File[],
  processFile: (content: string, file: File) => T
): Promise<T[]> {
  const error = validateImportFileSet(files);
  if (error) throw new Error(error);

  const results: T[] = [];
  for (const file of Array.from(files)) {
    results.push(processFile(await file.text(), file));
  }
  return results;
}