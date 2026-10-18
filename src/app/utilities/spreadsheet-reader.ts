import type { WorkBook } from 'xlsx';

/**
 * Liest eine Excel- oder CSV-Datei als Workbook ein.
 *
 * SheetJS interpretiert CSV-Bytes ohne BOM als Windows-1252, wodurch
 * UTF-8-Umlaute zu „Ã¼" usw. werden. CSV-Dateien werden deshalb selbst
 * dekodiert: zuerst als UTF-8, bei ungültigen Bytes als Windows-1252
 * (z. B. CSV aus älteren Excel-Versionen).
 */
export async function readSpreadsheetFile(file: File): Promise<WorkBook> {
  const { read } = await import('xlsx');
  const buffer = await file.arrayBuffer();

  if (!isCsv(file)) {
    return read(buffer, { type: 'array', cellDates: true });
  }

  return read(decodeCsv(buffer), { type: 'string', cellDates: true });
}

function isCsv(file: File): boolean {
  return /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv';
}

function decodeCsv(buffer: ArrayBuffer): string {
  try {
    // ignoreBOM: false (default) entfernt ein vorhandenes UTF-8-BOM
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}
