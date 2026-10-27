import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { DbService } from 'src/app/services/db.service';
import { Song, SongFile } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

export interface PrintEntry {
  song: Song;
  file: SongFile;
  /** How many times the file's pages are repeated in the merged PDF. Default 1. */
  copies?: number;
}

/**
 * Single entry point for printing sheet music.
 *
 * Every print button collects its files and hands them here; the service
 * merges them into one A4 PDF and picks one print route per platform:
 *   • Native app: @capgo/capacitor-printer opens the system print dialog
 *     (AirPrint / Android print service). Shells installed before the plugin
 *     shipped (OTA bundles reach them too) fall back to the file viewer.
 *   • Desktop browser: the plugin's web implementation prints from a hidden
 *     iframe, so there is no popup for a blocker to stop.
 *   • Mobile browser / PWA: the share sheet (iOS offers "Drucken" there),
 *     else a plain download — mobile browsers can't print PDFs from an iframe.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private db = inject(DbService);
  private printing = false;

  /** Downloads, merges and prints the given files as one PDF. */
  async printEntries(entries: PrintEntry[], fileName: string, loadingMessage = translate('svc.mergingPdfs')): Promise<boolean> {
    if (this.printing) { return false; }
    this.printing = true;
    try {
      const loader = await Utils.getLoadingElement(999999, loadingMessage);
      await loader.present();
      let merged: { blob: Blob; pageCount: number; skipped: number };
      try {
        merged = await this.mergeEntries(entries);
      } catch (err) {
        console.error('Merging print files failed:', err);
        Utils.showToast(translate('svc.mergeScoresFailed'), 'danger');
        return false;
      } finally {
        await loader.dismiss();
      }

      if (!merged.pageCount) {
        Utils.showToast(translate('svc.noPrintableScores'), 'warning');
        return false;
      }
      if (merged.skipped) {
        Utils.showToast(`${merged.skipped} Datei(en) konnten nicht eingebunden werden.`, 'warning');
      }

      await this.printBlob(merged.blob, fileName);
      return true;
    } finally {
      this.printing = false;
    }
  }

  /** Prints a single song file (PDF or image). */
  async printSongFile(song: Song, file: SongFile): Promise<boolean> {
    const baseName = (file.fileName || song.name || translate('svc.scores')).replace(/\.[^.]+$/, '');
    return this.printEntries([{ song, file }], `${baseName}.pdf`, translate('svc.fileLoading'));
  }

  /** Prints a ready-made PDF blob on the current platform. */
  async printBlob(blob: Blob, fileName: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      if (Capacitor.isPluginAvailable('Printer')) {
        try {
          await this.printNative(blob, fileName);
          return;
        } catch (err) {
          console.error('Native print failed, opening viewer instead:', err);
        }
      }
      await Utils.downloadFileNative(blob, fileName);
      return;
    }

    if (PrintService.isMobileWeb()) {
      // Opens the share sheet (with "Drucken" on iOS) or downloads the file.
      await Utils.downloadFileNative(blob, fileName);
      return;
    }

    const url = URL.createObjectURL(blob);
    try {
      const { Printer } = await import('@capgo/capacitor-printer');
      await Printer.printFile({ path: url, mimeType: 'application/pdf', name: fileName });
    } catch (err) {
      console.error('Browser print failed, downloading instead:', err);
      await Utils.downloadFileNative(blob, fileName);
      Utils.showToast(translate('svc.pdfDownloaded'), 'warning');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async printNative(blob: Blob, fileName: string): Promise<void> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Printer } = await import('@capgo/capacitor-printer');
    // Written to the cache dir and printed by path, not base64: merged folders
    // get large and the plugin warns about crashes for base64 above ~5 MB.
    // The file is not deleted afterwards because Android resolves before the
    // print service has read it; the cache dir is cleaned by the OS.
    const { uri } = await Filesystem.writeFile({
      path: PrintService.toCacheFileName(fileName),
      data: await Utils.blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Printer.printFile({ path: uri, mimeType: 'application/pdf', name: fileName });
  }

  private async mergeEntries(entries: PrintEntry[]): Promise<{ blob: Blob; pageCount: number; skipped: number }> {
    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();
    let skipped = 0;

    for (const entry of entries) {
      const copies = entry.copies ?? 1;
      if (copies <= 0) { continue; }
      try {
        const fileBlob = await this.downloadEntry(entry);
        const bytes = await fileBlob.arrayBuffer();
        const type = (entry.file.fileType || fileBlob.type || '').toLowerCase();
        const name = (entry.file.fileName || '').toLowerCase();
        const isPng = type.includes('png') || name.endsWith('.png');
        const isJpg = type.includes('jpeg') || type.includes('jpg') || /\.jpe?g$/.test(name);

        if (isPng || isJpg) {
          const image = isPng ? await mergedPdf.embedPng(bytes) : await mergedPdf.embedJpg(bytes);
          // A4 page, image scaled to fit
          const pageWidth = 595.28;
          const pageHeight = 841.89;
          const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          for (let copy = 0; copy < copies; copy++) {
            const page = mergedPdf.addPage([pageWidth, pageHeight]);
            page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
          }
        } else {
          const pdf = await PDFDocument.load(bytes);
          for (let copy = 0; copy < copies; copy++) {
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
          }
        }
      } catch (err) {
        // skip individual file errors (e.g. unsupported file types)
        console.error(`Fehler beim Laden von ${entry.file.fileName}:`, err);
        skipped++;
      }
    }

    const pageCount = mergedPdf.getPageCount();
    if (!pageCount) {
      return { blob: new Blob([], { type: 'application/pdf' }), pageCount, skipped };
    }
    const pdfBytes = await mergedPdf.save();
    return { blob: new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), pageCount, skipped };
  }

  private async downloadEntry(entry: PrintEntry): Promise<Blob> {
    try {
      return await this.db.downloadSongFile(
        entry.file.storageName ?? entry.file.url.split('/').pop(),
        entry.song.id,
      );
    } catch {
      const res = await fetch(entry.file.url);
      if (!res.ok) { throw new Error(res.statusText); }
      return res.blob();
    }
  }

  /**
   * ASCII-only name for the temp file handed to the native printer. Filesystem
   * returns a percent-encoded URI, and the iOS printer turns it back into a path
   * without decoding it, so spaces or umlauts ("Einsam und allein - Flöte.pdf")
   * end in "file not found" and the viewer fallback instead of the print dialog.
   * The readable name is still passed to the printer as the job name.
   */
  static toCacheFileName(fileName: string): string {
    const base = fileName
      .replace(/\.pdf$/i, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${base || 'noten'}.pdf`;
  }

  private static isMobileWeb(): boolean {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod|Android/i.test(ua)
      || (ua.includes('Macintosh') && (navigator as any).maxTouchPoints > 1); // iPadOS 13+
  }
}
