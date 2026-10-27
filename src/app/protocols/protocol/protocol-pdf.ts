import { Utils } from 'src/app/utilities/Utils';
import { DocLine, docToLines } from './protocol.helpers';
import { translate } from '@jsverse/transloco';

export interface ProtocolPdfSection {
  /** e.g. "TOP 1 · Konzertplanung" */
  title: string;
  /** e.g. "19:35 · 20 min · Anna Weber" */
  meta?: string;
  /** Outcome label (Besprochen/Beschlossen/Vertagt). */
  outcome?: string;
  doc?: Record<string, unknown> | null;
  /** Task lines shown under the notes ("Mappen bestellen · Paul · 31.10."). */
  tasks?: string[];
}

export interface ProtocolPdfData {
  title: string;
  subtitle: string;
  /** "Freigegeben am …" or "Entwurf". */
  status?: string;
  present: string[];
  excused: string[];
  sections: ProtocolPdfSection[];
  generalNotes?: Record<string, unknown> | null;
  /** Tasks not shown under a section. */
  otherTasks?: string[];
  branding?: { logo?: { dataUrl: string; width: number; height: number }; text?: string };
}

const MARGIN = 14;
const BOTTOM = 16;

/** Builds the protocol as A4 PDF (jsPDF is loaded lazily). */
export async function createProtocolPdf(data: ProtocolPdfData): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const doc: any = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  await Utils.registerExportFont(doc);
  const font = doc.getFont?.()?.fontName || undefined;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  let y = Utils.addBrandingHeader(doc, data.branding, { title: data.title, subtitle: data.subtitle, accentColor: [67, 142, 150] });

  const ensure = (height: number) => {
    if (y + height > pageHeight - BOTTOM) {
      doc.addPage();
      y = 18;
    }
  };

  const write = (text: string, opts: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; x?: number; gap?: number; lineHeight?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const x = opts.x ?? MARGIN;
    doc.setFont(font, opts.style ?? 'normal');
    doc.setFontSize(size);
    const color = opts.color ?? [30, 30, 30];
    doc.setTextColor(color[0], color[1], color[2]);
    const lineHeight = opts.lineHeight ?? size * 0.45;
    const parts: string[] = doc.splitTextToSize(text, contentWidth - (x - MARGIN));
    for (const part of parts) {
      ensure(lineHeight);
      doc.text(part, x, y + lineHeight * 0.75);
      y += lineHeight;
    }
    y += opts.gap ?? 0;
  };

  const writeLines = (lines: DocLine[]) => {
    for (const line of lines) {
      const indentX = MARGIN + line.indent * 6;
      switch (line.kind) {
        case 'heading':
          y += 1.5;
          write(line.text, { size: line.level === 1 ? 13 : line.level === 2 ? 12 : 11, style: 'bold', x: indentX, gap: 1 });
          break;
        case 'bullet':
        case 'task': {
          const marker = line.marker === '☑' ? '[x]' : line.marker === '☐' ? '[ ]' : (line.marker ?? '•');
          const markerWidth = Math.max(4, doc.getTextWidth(marker) + 2);
          doc.setFont(font, 'normal');
          doc.setFontSize(10.5);
          ensure(6);
          doc.setTextColor(30, 30, 30);
          doc.text(marker, indentX, y + 4.7 * 0.75);
          write(line.text, { x: indentX + markerWidth, gap: 0.6 });
          break;
        }
        case 'quote':
          write(line.text, { x: indentX + 4, style: 'italic', color: [90, 90, 90], gap: 1 });
          break;
        case 'code':
          write(line.text, { x: indentX + 2, size: 9.5, color: [70, 70, 70] });
          break;
        case 'rule':
          ensure(4);
          doc.setDrawColor(200, 200, 200);
          doc.line(MARGIN, y + 2, pageWidth - MARGIN, y + 2);
          y += 4;
          break;
        default:
          write(line.text, { x: indentX, gap: 1.2 });
      }
    }
  };

  if (data.status) write(data.status, { size: 9.5, color: [110, 110, 110], gap: 2 });
  if (data.present.length) write(`${translate('protocol.presentList', { count: data.present.length })}: ${data.present.join(', ')}`, { size: 10, gap: 1 });
  if (data.excused.length) write(`${translate('protocol.excusedList', { count: data.excused.length })}: ${data.excused.join(', ')}`, { size: 10, color: [90, 90, 90], gap: 1 });
  y += 3;

  for (const section of data.sections) {
    ensure(14);
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 3;
    write(section.title + (section.outcome ? `  –  ${section.outcome}` : ''), { size: 12, style: 'bold', gap: 0.5 });
    if (section.meta) write(section.meta, { size: 9, color: [120, 120, 120], gap: 1.5 });
    const lines = docToLines(section.doc);
    if (lines.length) writeLines(lines);
    else write(translate('protocol.noNotes'), { size: 9.5, style: 'italic', color: [150, 150, 150] });
    for (const task of section.tasks ?? []) {
      write(translate('protocol.taskRef', { title: task }), { size: 10, color: [59, 125, 132], x: MARGIN + 2, gap: 0.5 });
    }
    y += 4;
  }

  const general = docToLines(data.generalNotes);
  if (general.length) {
    ensure(14);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 3;
    write(translate('protocol.generalNotes'), { size: 12, style: 'bold', gap: 1.5 });
    writeLines(general);
    y += 4;
  }

  if (data.otherTasks?.length) {
    ensure(14);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 3;
    write(translate('protocol.furtherTasks'), { size: 12, style: 'bold', gap: 1.5 });
    for (const task of data.otherTasks) write(`• ${task}`, { size: 10, gap: 0.5 });
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(translate('protocol.page', { i, n: pages }), pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

  return doc.output('blob');
}
