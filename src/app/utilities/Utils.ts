import { ToastController, LoadingController } from '@ionic/angular/lazy';
import { Capacitor } from '@capacitor/core';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { AttendanceStatus, DEFAULT_IMAGE, DefaultAttendanceType, FieldType, PlayerHistoryType, Role } from './constants';
import { Attendance, FieldSelection, GroupCategory, Group, PersonAttendance, Player, AttendanceType, ExtraField, ShiftPlan, Church } from './interfaces';
// jsPDF and xlsx are lazy-loaded for better initial bundle size. Type-only
// import (erased at compile time) so it doesn't pull xlsx into the main bundle.
import type { WorkBook } from 'xlsx';

export class Utils {
  public static getId(): number {
    return Math.floor(Math.random() * (999999999999 - 1000000000 + 1)) + 1000000000;
  }

  public static getModifiedPlayersForList(
    players: Player[],
    instruments: Group[],
    attendances: Attendance[],
    types: AttendanceType[],
    mainGroup?: number,
    additionalFields?: ExtraField[],
    churches?: Church[],
    shiftExcusedAsPresent: boolean = false,
  ): Player[] {
    // Pre-compute lookup maps for O(1) access instead of O(n) finds
    const instrumentCountMap = new Map<number, number>();
    const instrumentNameMap = new Map<number, string>();
    const attendanceMap = new Map<number, Attendance>();
    const typeMap = new Map<string, AttendanceType>();
    const instrumentFirstSeen = new Set<number>();

    // Build instrument name lookup map
    for (const ins of instruments) {
      instrumentNameMap.set(ins.id, ins.name);
    }

    // Build attendance lookup map
    if (attendances?.length) {
      for (const att of attendances) {
        attendanceMap.set(att.id, att);
      }
    }

    // Build type lookup map
    if (types?.length) {
      for (const t of types) {
        typeMap.set(t.id, t);
      }
    }

    // Pre-count players per instrument (O(n) instead of O(n²))
    for (const player of players) {
      instrumentCountMap.set(
        player.instrument,
        (instrumentCountMap.get(player.instrument) || 0) + 1
      );
    }

    // Pre-compute "one month ago" date once
    const oneMonthAgo = dayjs().subtract(1, 'month');
    const tomorrow = dayjs().add(1, 'day');

    // Sort once with proper comparator
    const sortedPlayers = [...players].sort((a: Player, b: Player) => {
      // Main group first
      if (a.instrument === mainGroup && b.instrument !== mainGroup) {return -1;}
      if (b.instrument === mainGroup && a.instrument !== mainGroup) {return 1;}

      // Get instrument data for sorting
      const aInstrument = instruments.find(i => i.id === a.instrument);
      const bInstrument = instruments.find(i => i.id === b.instrument);

      // If both have sort_order, sort by that first
      const aSortOrder = aInstrument?.sort_order;
      const bSortOrder = bInstrument?.sort_order;

      if (aSortOrder !== undefined && aSortOrder !== null &&
          bSortOrder !== undefined && bSortOrder !== null) {
        const sortOrderCompare = aSortOrder - bSortOrder;
        if (sortOrderCompare !== 0) {return sortOrderCompare;}
      }

      // Then by group name
      const aGroupName = instrumentNameMap.get(a.instrument) || '';
      const bGroupName = instrumentNameMap.get(b.instrument) || '';
      const groupCompare = aGroupName.localeCompare(bGroupName);
      if (groupCompare !== 0) {return groupCompare;}

      // Then by lastName within same group
      const aPlayerOrder = a.sort_order;
      const bPlayerOrder = b.sort_order;
      if (aPlayerOrder != null && bPlayerOrder != null) { return aPlayerOrder - bPlayerOrder; }
      if (aPlayerOrder != null) { return -1; }
      if (bPlayerOrder != null) { return 1; }
      return a.lastName.localeCompare(b.lastName);
    });

    return sortedPlayers.map((player: Player): Player => {
      const isFirstOfInstrument = !instrumentFirstSeen.has(player.instrument);
      if (isFirstOfInstrument) {
        instrumentFirstSeen.add(player.instrument);
      }

      const isNew = oneMonthAgo.isBefore(dayjs(player.joined));

      // Handle additional fields
      if (additionalFields && player.additional_fields) {
        for (const field of additionalFields) {
          if (player.additional_fields[field.id] === undefined || player.additional_fields[field.id] === null) {
            player.additional_fields[field.id] = Utils.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options, churches);
          }
        }
      }

      let percentage = 0;
      let lateCount = 0;

      // Date for lastSolve comparison (if player has been "solved", only count after that date)
      const lastSolveDate = player.lastSolve ? dayjs(player.lastSolve) : null;

      if (player.person_attendances?.length && attendanceMap.size > 0) {
        // Use pre-built maps for O(1) lookups instead of O(n) finds
        const personAttendancesTillNow = player.person_attendances.filter((personAttendance: PersonAttendance) => {
          const attendance = attendanceMap.get(personAttendance.attendance_id);
          if (!attendance) {return false;}

          const type = typeMap.get(attendance.type_id);
          if (!type?.include_in_average) {return false;}

          return dayjs(attendance.date).isBefore(tomorrow);
        });
        percentage = Utils.getPercentage(personAttendancesTillNow, shiftExcusedAsPresent) || 0;

        // Count unexcused late arrivals (only after lastSolve if set)
        lateCount = personAttendancesTillNow.filter((pa: PersonAttendance) => {
          if (pa.status !== AttendanceStatus.Late) {return false;}
          if (!lastSolveDate) {return true;}

          const attendance = attendanceMap.get(pa.attendance_id);
          return attendance && dayjs(attendance.date).isAfter(lastSolveDate);
        }).length;
      }

      let img = player.img || DEFAULT_IMAGE;

      if (img.includes('/storage/v1/object/public/profiles/') && !img.includes('?quality=20')) {
        img = img.replace('object/public/profiles/', 'render/image/public/profiles/');
        img = `${img}?quality=20`;
      }

      return {
        ...player,
        firstOfInstrument: isFirstOfInstrument,
        instrumentLength: instrumentCountMap.get(player.instrument) || 0,
        isNew,
        percentage,
        lateCount,
        groupName: instrumentNameMap.get(player.instrument) || '',
        img,
      };
    });
  }

  public static getModifiedPlayers(persons: PersonAttendance[], mainGroup?: number, instruments?: Group[]): PersonAttendance[] {
    const instrumentsMap: { [props: number]: boolean } = {};

    return Utils.sortPlayers(persons, mainGroup, instruments).map((player: PersonAttendance): PersonAttendance => {
      let firstOfInstrument = false;
      let instrumentLength = 0;
      let isNew = false;

      if (!instrumentsMap[player.instrument]) {
        instrumentsMap[player.instrument] = true;
        firstOfInstrument = true;
        instrumentLength = persons.filter((p: PersonAttendance) => p.instrument === player.instrument).length;
      }

      if (dayjs().subtract(1, 'month').isBefore(dayjs(player.person.joined))) {
        isNew = true;
      }

      return {
        ...player,
        ...player.person,
        firstOfInstrument,
        instrumentLength,
        isNew,
        img: player.img || DEFAULT_IMAGE,
      } as any;
    });
  }

  private static sortPlayers(players: PersonAttendance[], mainGroupId: number, instruments?: Group[]): PersonAttendance[] {
    // Separate main group and other players
    const mainGroup = players.filter(p => p.instrument === mainGroupId);
    const otherGroups = players.filter(p => p.instrument !== mainGroupId);

    // Sort main group by sort_order then lastName
    const sortedMainGroup = mainGroup.sort((a, b) => {
      const aOrder = (a as any).sort_order ?? a.person?.sort_order;
      const bOrder = (b as any).sort_order ?? b.person?.sort_order;
      if (aOrder != null && bOrder != null) { return aOrder - bOrder; }
      if (aOrder != null) { return -1; }
      if (bOrder != null) { return 1; }
      return (a.person?.lastName ?? a.lastName).localeCompare(b.person?.lastName ?? b.lastName);
    });

    // Group others by groupId
    const grouped = new Map<number, { groupName: string; players: PersonAttendance[]; sortOrder?: number }>();

    for (const player of otherGroups) {
      if (!grouped.has(player.instrument)) {
        const instrument = instruments?.find(i => i.id === player.instrument);
        grouped.set(player.instrument, {
          groupName: player.groupName,
          sortOrder: instrument?.sort_order,
          players: []
        });
      }
      grouped.get(player.instrument).players.push(player);
    }

    // Sort the groups by sort_order (if available), then by instrument name
    // Then sort each group's players by lastName
    const sortedOtherGroups = [...grouped.entries()]
      .sort(([, a], [, b]) => {
        // If both have sort_order, use it
        if (a.sortOrder !== undefined && a.sortOrder !== null &&
            b.sortOrder !== undefined && b.sortOrder !== null) {
          return a.sortOrder - b.sortOrder;
        }
        // If only one has sort_order, prioritize it
        if (a.sortOrder !== undefined && a.sortOrder !== null) {return -1;}
        if (b.sortOrder !== undefined && b.sortOrder !== null) {return 1;}
        // Otherwise sort by group name
        return a.groupName.localeCompare(b.groupName);
      })
      .map(([, group]) =>
        group.players.sort((a, b) => {
          const aOrder = (a as any).sort_order ?? a.person?.sort_order;
          const bOrder = (b as any).sort_order ?? b.person?.sort_order;
          if (aOrder != null && bOrder != null) { return aOrder - bOrder; }
          if (aOrder != null) { return -1; }
          if (bOrder != null) { return 1; }
          return (a.person?.lastName ?? a.lastName).localeCompare(b.person?.lastName ?? b.lastName);
        })
      )
      .reduce((acc, val) => acc.concat(val), []);

    // Return combined sorted result
    return [...sortedMainGroup, ...sortedOtherGroups];
  }

  public static getModifiedAttendanceData(attendance: Attendance): Attendance {
    attendance.persons = attendance.persons.map((person: PersonAttendance): PersonAttendance => ({
        ...person,
        img: (person.person as any)?.img || DEFAULT_IMAGE,
        instrument: (person.person.instrument as any).id,
        groupName: (person.person.instrument as any).name,
      }));

    return attendance;
  }

  public static isWorkExcused(notes: string): boolean {
    return notes?.includes('Schichtbedingt') || notes?.includes('Arbeitsbedingt');
  }

  public static getPercentage(personAttendances: PersonAttendance[], shiftExcusedAsPresent: boolean = false): number {
    if (!personAttendances.length) {
      return 0;
    }
    const overallCount: number = personAttendances.length;
    let presentCount = 0;
    for (const p of personAttendances) {
      if (p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late || p.status === AttendanceStatus.LateExcused) {
        presentCount++;
      } else if (shiftExcusedAsPresent && p.status === AttendanceStatus.Excused && Utils.isWorkExcused(p.notes)) {
        presentCount++;
      }
    }

    return Math.round((presentCount / overallCount) * 100);
  }

  public static getClefText(key: string) {
    switch (key) {
      case 'c':
        return 'Altschlüssel';
      case 'g':
        return 'Violinschlüssel';
      case 'f':
        return 'Bassschlüssel';
      default:
        throw new Error('unknown clef key');
    }
  }

  public static getRoleText(role: Role): string {
    switch (role) {
      case Role.ADMIN:
        return 'Admin';
      case Role.PLAYER:
        return 'Mitglied';
      case Role.VIEWER:
        return 'Beobachter';
      case Role.HELPER:
        return 'Helfer';
      case Role.RESPONSIBLE:
        return 'Verantwortlicher';
      case Role.PARENT:
        return 'Elternteil';
      case Role.VOICE_LEADER:
        return 'Stimmführer';
      case Role.VOICE_LEADER_HELPER:
        return 'Stimmführer & Helfer';
      case Role.NONE:
        return 'Mitglied';
      default:
        return 'Unbekannt';
    }
  }

  public static getTypeTitle(type: AttendanceType, typeInfo: string): string {
    if (typeInfo) {
      return typeInfo;
    } else {
      return type.hide_name ? '' : type.name;
    }
  }

  public static getPlayerHistoryTypeText(key: PlayerHistoryType) {
    switch (key) {
      case PlayerHistoryType.PAUSED:
        return 'Pausiert';
      case PlayerHistoryType.UNEXCUSED:
        return 'Unentschuldigt';
      case PlayerHistoryType.CRITICAL_PERSON:
        return '';
      case PlayerHistoryType.INSTRUMENT_CHANGE:
        return 'Wechsel';
      case PlayerHistoryType.ARCHIVED:
        return 'Archiviert';
      case PlayerHistoryType.RETURNED:
        return 'Reaktiviert';
      case PlayerHistoryType.TRANSFERRED_FROM:
      case PlayerHistoryType.TRANSFERRED_TO:
      case PlayerHistoryType.COPIED_FROM:
      case PlayerHistoryType.COPIED_TO:
        return '';
      default:
        return 'Sonstiges';
    }
  }

  public static async showToast(message: unknown, color: string = 'success', duration: number = 3000): Promise<void> {
    // Coerce non-string values (e.g. an Error object passed from a catch block)
    // to readable text — Ionic renders `message` as-is and shows nothing for a
    // non-string, which surfaces as an empty toast.
    let text: string;
    if (typeof message === 'string') {
      text = message;
    } else if (message instanceof Error) {
      text = message.message || String(message);
    } else if (message && typeof (message as any).message === 'string') {
      text = (message as any).message;
    } else {
      text = String(message ?? '');
    }

    const toast: HTMLIonToastElement = await new ToastController().create({
      message: text,
      color,
      position: 'bottom',
      duration,
    });

    return await toast.present();
  }

  public static validateEmail(email: string): boolean {
    // tslint:disable-next-line: max-line-length
    const regexp: any = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);

    return regexp.test(email);
  }

  public static validatePhoneNumber(phone: string): boolean {
    const regexp: any = new RegExp(/^(\+?[1-9]\d{1,14}|0\d+)$/);
    return regexp.test(phone);
  }

  public static async getLoadingElement(duration: number = 3000, message?: string) {
    return await new LoadingController().create({ duration, message });
  }

  // Name of the embedded Unicode font (Noto Sans) used for exports. It covers
  // full Cyrillic + Latin so user text renders as-is, unlike jsPDF's built-in
  // Helvetica which is limited to Latin-1. Noto Sans is close to Helvetica/Arial
  // in look, so the exports read as a neutral document sans-serif.
  public static readonly EXPORT_FONT = 'NotoSans';

  // The three Noto Sans variants, keyed by the jsPDF font style they back.
  // Filenames live under src/assets/fonts and are served as static assets.
  private static readonly EXPORT_FONT_FILES: { style: 'normal' | 'bold' | 'italic'; file: string }[] = [
    { style: 'normal', file: 'NotoSans-Regular.ttf' },
    { style: 'bold', file: 'NotoSans-Bold.ttf' },
    { style: 'italic', file: 'NotoSans-Italic.ttf' },
  ];

  // Session cache of base64-encoded font data so repeated exports don't refetch
  // the (~2MB total) TTFs. Populated lazily on first registration.
  private static exportFontCache: { style: 'normal' | 'bold' | 'italic'; file: string; base64: string }[] | null = null;

  /**
   * Register the embedded Unicode font (DejaVu Sans) on a jsPDF document and set
   * it as the active font. This is what lets Cyrillic (and other non-Latin1)
   * text render in PDF/image exports instead of coming out blank/garbled.
   *
   * The TTFs are fetched from the app's static assets, base64-encoded, and added
   * to the document's virtual file system for each style (normal/bold/italic).
   * Encoded data is cached for the session. Failure is swallowed so exports fall
   * back to Helvetica rather than breaking outright.
   */
  public static async registerExportFont(doc: any): Promise<void> {
    try {
      if (!Utils.exportFontCache) {
        Utils.exportFontCache = await Promise.all(
          Utils.EXPORT_FONT_FILES.map(async ({ style, file }) => {
            const res = await fetch(`assets/fonts/${file}`);
            if (!res.ok) {
              throw new Error(`font fetch failed: ${file} (${res.status})`);
            }
            const buffer = await res.arrayBuffer();
            return { style, file, base64: Utils.arrayBufferToBase64(buffer) };
          }),
        );
      }

      for (const { style, file, base64 } of Utils.exportFontCache) {
        doc.addFileToVFS(file, base64);
        doc.addFont(file, Utils.EXPORT_FONT, style);
      }
      doc.setFont(Utils.EXPORT_FONT, 'normal');
    } catch {
      // Keep the export working with the built-in font if anything fails.
      Utils.exportFontCache = null;
    }
  }

  // Encode an ArrayBuffer to a base64 string (jsPDF's addFileToVFS expects the
  // raw font bytes as base64). Chunked to avoid call-stack limits on large fonts.
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
  }

  // Cache resolved logo data URLs per source URL for the session, so repeated
  // exports don't refetch the same image.
  private static brandingImageCache = new Map<string, { dataUrl: string; width: number; height: number }>();

  /**
   * Fetch a remote image URL, downscale it to a small size suitable for the
   * tiny footer logo, and return it as a data URL plus its (scaled) dimensions.
   * jsPDF.addImage needs a data URL, not a remote URL. Downscaling keeps the
   * embedded image — which is placed on every page — from bloating the export
   * (a full-res logo can add many MB per page). Returns null on any failure so
   * branding never breaks an export.
   */
  public static async loadImageDataUrl(
    url: string,
  ): Promise<{ dataUrl: string; width: number; height: number } | null> {
    if (!url) {
      return null;
    }
    if (Utils.brandingImageCache.has(url)) {
      return Utils.brandingImageCache.get(url);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      const rawDataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to decode branding image'));
        image.src = rawDataUrl;
      });
      if (!img.naturalWidth || !img.naturalHeight) {
        return null;
      }

      // Cap the logo to a small footprint (the footer renders it ~9mm tall).
      // 120px on the longest side is ample and keeps the embedded bytes tiny.
      const MAX_EDGE = 120;
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      let dataUrl = rawDataUrl;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // PNG preserves transparency; the small canvas keeps it compact.
          dataUrl = canvas.toDataURL('image/png');
        }
      } catch {
        // Canvas can taint on cross-origin images without CORS; fall back to
        // the original data URL (still correct, just larger).
        dataUrl = rawDataUrl;
      }

      const result = { dataUrl, width, height };
      Utils.brandingImageCache.set(url, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Draw a clean letterhead-style header at the top of the current page and
   * return the Y coordinate where table content should begin (so callers can
   * set `margin.top` to it):
   *   top-left    -> logo + branding text (organization name) side by side
   *   top-right   -> "Erstellt am: {DD.MM.YYYY HH:mm}" (export generation time)
   *   below       -> large title + smaller "Stand: {date}" subtitle
   *   underneath  -> a thin colored divider rule spanning the content width
   * All branding parts are optional; the title/subtitle and rule are always drawn.
   *
   * In `sideBySide` mode the header is scaled down and anchored within the
   * region [startX, startX + regionWidth] so it fits an A5 half-page column.
   */
  public static addBrandingHeader(
    doc: any,
    branding: { logo?: { dataUrl: string; width: number; height: number }; text?: string } | undefined,
    opts: {
      title: string;
      subtitle?: string;
      accentColor?: [number, number, number];
      startX?: number;
      regionWidth?: number;
      sideBySide?: boolean;
    },
  ): number {
    const sideBySide = Boolean(opts.sideBySide);
    const startX = opts.startX ?? 0;
    const regionWidth = opts.regionWidth ?? doc.internal.pageSize.getWidth();
    const margin = sideBySide ? 5 : 14;
    const leftX = startX + margin;
    const rightEdge = startX + regionWidth - margin;
    const accent = opts.accentColor ?? [0, 82, 56];

    const prevFontSize = doc.getFontSize();
    // Reuse whatever font is active on the doc (the embedded Unicode font when
    // registered, else the built-in) so header text renders Cyrillic too and
    // matches the table body.
    const fontName = doc.getFont?.()?.fontName || undefined;

    // ---- top row: logo + branding text (left) and creation stamp (right) ----
    const topRowY = sideBySide ? 11 : 16;
    const logoHeight = sideBySide ? 7 : 10;
    const brandFontSize = sideBySide ? 9 : 12;
    const stampFontSize = sideBySide ? 6 : 8;
    let cursorX = leftX;
    const logoMidY = topRowY;

    if (branding?.logo) {
      const aspect = branding.logo.width / branding.logo.height;
      const logoWidth = logoHeight * aspect;
      const logoTop = topRowY - logoHeight / 2;
      try {
        doc.addImage(branding.logo.dataUrl, 'PNG', cursorX, logoTop, logoWidth, logoHeight, 'brandingLogo', 'FAST');
      } catch {
        // ignore image render failures — keep the export intact
      }
      cursorX += logoWidth + (sideBySide ? 2 : 4);
    }

    if (branding?.text) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(brandFontSize);
      doc.setTextColor(60, 60, 60);
      doc.text(branding.text, cursorX, logoMidY, { baseline: 'middle' });
      doc.setFont(fontName, 'normal');
    }

    // creation timestamp, right-aligned, vertically centered to the top row
    doc.setFontSize(stampFontSize);
    doc.setTextColor(140, 140, 140);
    doc.text(`Erstellt am: ${dayjs().format('DD.MM.YYYY HH:mm')}`, rightEdge, logoMidY, { align: 'right', baseline: 'middle' });

    // ---- title + subtitle block ----
    let y = topRowY + logoHeight / 2 + (sideBySide ? 6 : 9);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(sideBySide ? 13 : 20);
    doc.setTextColor(30, 30, 30);
    doc.text(opts.title, leftX, y);
    doc.setFont(fontName, 'normal');

    if (opts.subtitle) {
      y += sideBySide ? 4.5 : 6;
      doc.setFontSize(sideBySide ? 8 : 10);
      doc.setTextColor(120, 120, 120);
      doc.text(opts.subtitle, leftX, y);
    }

    // ---- divider rule ----
    y += sideBySide ? 3 : 4;
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(sideBySide ? 0.4 : 0.6);
    doc.line(leftX, y, rightEdge, y);

    // Restore defaults for subsequent drawing.
    doc.setFontSize(prevFontSize);
    doc.setTextColor(30, 30, 30);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);

    // Content should start a little below the rule.
    return y + (sideBySide ? 4 : 6);
  }

  /**
   * Build the branding block passed into createPlanExport / addBrandingHeader
   * from a tenant's configured logo_url + branding_text. Resolves the logo to a
   * data URL (or omits it on failure). Returns undefined when nothing is set.
   */
  public static async buildTenantBranding(
    tenant: { logo_url?: string; branding_text?: string } | undefined,
  ): Promise<{ logo?: { dataUrl: string; width: number; height: number }; text?: string } | undefined> {
    if (!tenant || (!tenant.logo_url && !tenant.branding_text)) {
      return undefined;
    }
    const logo = tenant.logo_url ? await Utils.loadImageDataUrl(tenant.logo_url) : null;
    const text = tenant.branding_text?.trim() || undefined;
    if (!logo && !text) {
      return undefined;
    }
    return { logo: logo || undefined, text };
  }

  public static async createPlanExport(props: any, typeText: string) {
    // Lazy load jsPDF to reduce initial bundle size
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const startingTime: dayjs.Dayjs = dayjs(props.time).isValid() ? dayjs(props.time) : dayjs().hour(Number(props.time.substring(0, 2))).minute(Number(props.time.substring(3, 5)));
    const date: string = props.attendance ? dayjs(props.attendances.find((att: Attendance) => att.id === props.attendance).date).locale('de').format('dddd, DD.MM.YYYY') : startingTime.locale('de').format('dddd, DD.MM.YYYY');
    const hasConductors = Boolean(props.fields.find((field: FieldSelection) => field.conductor));

    const data: any[] = [];

    let currentTime = startingTime;

    for (const field of props.fields) {
      const fieldName = field.name;

      if (field.id.includes('noteFld')) {
        data.push([
          { content: fieldName, colSpan: hasConductors ? 5 : 4 }
        ]);
      } else {
        // Field-attached info is carried on the Programmpunkt cell so it renders
        // as a second (italic) line inside the same row as its field. The custom
        // `_info` marker is picked up by the draw hooks below; autotable ignores it.
        const info = field.info || '';
        const nameCell: any = info
          ? { content: `${fieldName}\n${info}`, _name: fieldName, _info: info }
          : fieldName;

        if (hasConductors) {
          data.push([
            `${currentTime.format('HH:mm')} Uhr`,
            nameCell,
            field.conductor || '',
            `${field.time} min`,
          ]);
        } else {
          data.push([
            `${currentTime.format('HH:mm')} Uhr`,
            nameCell,
            `${field.time} min`,
          ]);
        }

        currentTime = currentTime.add(parseInt(field.time), 'minutes');
      }
    }

    const head = hasConductors ? [[
      { content: 'Uhrzeit', styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: 'Programmpunkt', styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: 'Ausführung', styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: 'Dauer', styles: { fontSize: props.sideBySide ? 8 : 11 } },
    ]] : [[
      { content: 'Uhrzeit', styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: 'Programmpunkt', styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: 'Dauer', styles: { fontSize: props.sideBySide ? 8 : 11 } },
    ]];

    const tableStyles = {
      font: Utils.EXPORT_FONT,
      fontSize: props.sideBySide ? 8 : 11,
      cellPadding: props.sideBySide ? 2 : 3.5,
      textColor: [30, 30, 30] as [number, number, number],
      lineColor: [180, 180, 180] as [number, number, number],
      lineWidth: 0,
    };

    const columnStyles = props.sideBySide ? {
      0: { cellWidth: 20 },
    } : {
      0: { cellWidth: 28 },
    };

    // ---- shared autotable hooks (used by both the A4 and side-by-side tables) ----

    // Style standalone note rows (full-width, gray, italic) and mark info-bearing
    // Programmpunkt cells for custom two-line drawing.
    const didParseCell = (hookData: any) => {
      const raw = hookData.row.raw;
      if (raw && raw.length === 1 && raw[0].colSpan) {
        // Standalone note row: gray background + italic text, normal padding.
        hookData.cell.styles.fontStyle = 'italic';
        hookData.cell.styles.fillColor = [235, 235, 235];
        hookData.cell.styles.textColor = [80, 80, 80];
      }
    };

    // Skip autotable's default text render for the Programmpunkt name cells; we
    // draw them ourselves in didDrawCell with a medium (faux-bold) weight — a bit
    // heavier than body text but lighter than the bold header. Info cells draw
    // both their name and italic info line the same way.
    const isNameCell = (hookData: any) =>
      hookData.section === 'body' &&
      hookData.column.index === 1 &&
      !(hookData.row.raw && hookData.row.raw.length === 1 && hookData.row.raw[0]?.colSpan);

    const willDrawCell = (hookData: any) => {
      if (isNameCell(hookData)) {
        hookData.cell.text = [];
      }
    };

    // Draw a string with a light stroke to fake a medium font weight (between
    // normal and bold). Uses jsPDF text render mode 2 (fill + stroke).
    const drawMediumText = (doc: any, text: string, x: number, y: number) => {
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.12);
      (doc as any).setTextRenderingMode?.(2);
      doc.text(text, x, y);
      (doc as any).setTextRenderingMode?.(0);
    };

    // Draw the field name (medium weight) and, when present, its attached info
    // line (italic) within the same Programmpunkt cell. Each part is wrapped to
    // the cell width (matching how autotable sized the row), and the whole block
    // is vertically centered like autotable's own renderer (valign middle,
    // line-height factor 1.15) so it aligns with sibling cells.
    const didDrawCell = (hookData: any) => {
      if (!isNameCell(hookData)) {
        return;
      }
      const raw = hookData.cell.raw;
      const doc = hookData.doc;
      const cell = hookData.cell;
      // Reuse the doc's active font (embedded Unicode font when registered) so
      // the custom-drawn name/info lines render Cyrillic like the rest.
      const cellFont = doc.getFont?.()?.fontName || undefined;
      const k = doc.internal.scaleFactor;
      const fontSize = cell.styles.fontSize / k;
      const lineHeightFactor = 1.15;
      const lineHeight = fontSize * lineHeightFactor;

      // Name is on raw._name for info cells, otherwise the raw cell string.
      const nameText: string = raw?._info ? raw._name : (typeof raw === 'string' ? raw : String(raw ?? ''));
      const infoText: string = raw?._info || '';

      const x = cell.x + cell.padding('left');
      const maxWidth = cell.width - cell.padding('horizontal');

      doc.setFontSize(cell.styles.fontSize);
      const nameLines: string[] = doc.splitTextToSize(nameText, maxWidth);
      const infoLines: string[] = infoText ? doc.splitTextToSize(infoText, maxWidth) : [];
      const totalLines = nameLines.length + infoLines.length;

      const netHeight = cell.height - cell.padding('vertical');
      let y = cell.y + netHeight / 2 + cell.padding('top');
      y += fontSize * (2 - lineHeightFactor);
      y -= (totalLines / 2) * lineHeight;

      doc.setTextColor(30, 30, 30);
      doc.setFont(cellFont, 'normal');
      for (const line of nameLines) {
        drawMediumText(doc, line, x, y);
        y += lineHeight;
      }

      if (infoLines.length) {
        doc.setTextColor(80, 80, 80);
        doc.setFont(cellFont, 'italic');
        for (const line of infoLines) {
          doc.text(line, x, y);
          y += lineHeight;
        }
        doc.setFont(cellFont, 'normal');
      }
    };

    // Side-by-side A5 landscape mode
    if (props.sideBySide) {
      const doc = new jsPDF({ orientation: 'landscape', format: 'a4', compress: true });
      await Utils.registerExportFont(doc);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const halfWidth = pageWidth / 2;
      const gap = 5;

      // Draw vertical divider line in the middle
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(halfWidth, 10, halfWidth, pageHeight - 10);

      // Helper function to render one side
      const renderSide = (startX: number, maxWidth: number) => {
        const headerOpts = { title: typeText, subtitle: date, startX, regionWidth: maxWidth, sideBySide: true };
        const sideContentTop = Utils.addBrandingHeader(doc, props.branding, headerOpts);

        (doc as any).autoTable({
          head,
          body: data,
          startY: sideContentTop,
          margin: { left: startX + 5, right: pageWidth - startX - maxWidth + 5, bottom: 12 },
          tableWidth: maxWidth - 10,
          theme: 'plain',
          styles: tableStyles,
          headStyles: {
            fillColor: false,
            textColor: [50, 50, 50],
            fontStyle: 'bold',
            lineWidth: { bottom: 0.3 },
            lineColor: [100, 100, 100],
          },
          bodyStyles: {
            fillColor: false,
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          columnStyles,
          didParseCell,
          willDrawCell,
          didDrawCell,
          didDrawPage: () => {
            Utils.addBrandingHeader(doc, props.branding, headerOpts);
          },
        });
      };

      // Left side (A5)
      renderSide(0, halfWidth - gap / 2);

      // Right side (A5)
      renderSide(halfWidth + gap / 2, halfWidth - gap / 2);

      if (props.asBlob) {
        if (props.asImage) {
          const pdfDataUri = doc.output('datauristring');
          return await Utils.pdfDataUriToImageBlob(pdfDataUri);
        }
        return doc.output('blob');
      } else {
        const fileName = `${typeText}_${date}_2x.pdf`;
        await Utils.downloadFileNative(doc.output('blob'), fileName);
      }
      return;
    }

    // Standard A4 portrait mode
    const buildA4Table = (doc: any, styles: any) => {
      const fs = styles.fontSize ?? (props.sideBySide ? 8 : 11);
      const scaledHead = hasConductors ? [[
        { content: 'Uhrzeit', styles: { fontSize: fs } },
        { content: 'Programmpunkt', styles: { fontSize: fs } },
        { content: 'Ausführung', styles: { fontSize: fs } },
        { content: 'Dauer', styles: { fontSize: fs } },
      ]] : [[
        { content: 'Uhrzeit', styles: { fontSize: fs } },
        { content: 'Programmpunkt', styles: { fontSize: fs } },
        { content: 'Dauer', styles: { fontSize: fs } },
      ]];
      const headerOpts = { title: typeText, subtitle: date };
      const contentTop = Utils.addBrandingHeader(doc, props.branding, headerOpts);
      (doc as any).autoTable({
        head: scaledHead,
        body: data,
        margin: { top: contentTop, bottom: 14 },
        theme: 'plain',
        styles,
        headStyles: {
          fillColor: false,
          textColor: [50, 50, 50],
          fontStyle: 'bold',
          lineWidth: { bottom: 0.5 },
          lineColor: [100, 100, 100],
        },
        bodyStyles: {
          fillColor: false,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        columnStyles,
        didParseCell,
        willDrawCell,
        didDrawCell,
        didDrawPage: () => {
          Utils.addBrandingHeader(doc, props.branding, { title: typeText, subtitle: date });
        },
      });
    };

    // Dry-run auto-fit: progressively compress until it fits one page.
    const probe1 = new jsPDF({ compress: true });
    await Utils.registerExportFont(probe1);
    buildA4Table(probe1, tableStyles);

    let finalStyles = { ...tableStyles };
    if (probe1.getNumberOfPages() > 1) {
      finalStyles = { ...tableStyles, fontSize: 9, cellPadding: 2 };

      const probe2 = new jsPDF({ compress: true });
      await Utils.registerExportFont(probe2);
      buildA4Table(probe2, finalStyles);
      if (probe2.getNumberOfPages() > 1) {
        finalStyles = { ...tableStyles, fontSize: 8, cellPadding: 1.5 };

        const probe3 = new jsPDF({ compress: true });
        await Utils.registerExportFont(probe3);
        buildA4Table(probe3, finalStyles);
        if (probe3.getNumberOfPages() > 1) {
          finalStyles = { ...tableStyles, fontSize: 7, cellPadding: 1 };
        }
      }
    }

    const doc = new jsPDF({ compress: true });
    await Utils.registerExportFont(doc);
    buildA4Table(doc, finalStyles);

    if (props.asBlob) {
      if (props.asImage) {
        // Convert PDF to image using jsPDF's built-in canvas output
        const pdfDataUri = doc.output('datauristring');
        return await Utils.pdfDataUriToImageBlob(pdfDataUri);
      }
      return doc.output('blob');
    } else {
      const fileName = `${typeText}_${date}.pdf`;
      await Utils.downloadFileNative(doc.output('blob'), fileName);
    }
  }

  /**
   * Convert a PDF data URI to a PNG image blob using an iframe and canvas
   */
  public static async pdfDataUriToImageBlob(pdfDataUri: string): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        // Dynamically load pdf.js from CDN
        const pdfjsVersion = '3.11.174';
        const pdfjsUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.min.js`;
        const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

        // Load pdf.js script if not already loaded
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((res, rej) => {
            const script = document.createElement('script');
            script.src = pdfjsUrl;
            script.onload = () => res();
            script.onerror = () => rej(new Error('Failed to load pdf.js'));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

        // Convert data URI to array buffer
        const base64 = pdfDataUri.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);

        const scale = 6; // Higher scale = better quality
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d')!;
        await page.render({ canvasContext: context, viewport }).promise;

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  public static async exportAttendanceToExcel(
    attendance: Attendance,
    players: PersonAttendance[],
    type: AttendanceType,
    churches?: Church[],
  ): Promise<void> {
    // Lazy load xlsx to reduce initial bundle size
    const { utils } = await import('xlsx');
    let data;

    if (churches?.length) {
      data = [['Nachname', 'Vorname', 'Gruppe', 'Gemeinde', 'Status', 'Bemerkung']];

      for (const user of players) {
        data.push([
          user.lastName,
          user.firstName,
          user.groupName,
          churches.find(ch => ch.id === user.person.additional_fields?.bfecg_church)?.name || '',
          Utils.getAttText(user),
          user.notes || ''
        ]);
      }
    } else {
      data = [['Nachname', 'Vorname', 'Gruppe', 'Status', 'Bemerkung']];

      for (const user of players) {
        data.push([user.lastName, user.firstName, user.groupName, Utils.getAttText(user), user.notes || '']);
      }
    }

    const ws = utils.aoa_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    const fileName = `${attendance.typeInfo ?? type.name}_${dayjs(attendance.date).format('DD_MM_YYYY')}_Anwesenheit.xlsx`;
    await Utils.saveWorkbook(wb, fileName);
  }

  /**
   * Saves an xlsx workbook to a file across all platforms.
   *
   * xlsx's own writeFile() relies on a DOM `<a download>`, which does nothing on
   * the native app (no file lands on disk, nothing opens) and is unreliable on
   * mobile web. On native + mobile web we instead serialise the workbook to a
   * binary buffer and hand it to downloadFileNative(), which writes it to the
   * Cache dir and opens the system viewer / share sheet. Desktop web keeps the
   * direct writeFile() download users expect there.
   */
  public static async saveWorkbook(wb: WorkBook, fileName: string): Promise<void> {
    const { write, writeFile } = await import('xlsx');

    const ua = navigator.userAgent || '';
    const isMobileWeb = /iPad|iPhone|iPod|Android/i.test(ua)
      || (ua.includes('Macintosh') && (navigator as any).maxTouchPoints > 1); // iPadOS 13+

    if (Capacitor.isNativePlatform() || isMobileWeb) {
      const buffer: ArrayBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await Utils.downloadFileNative(blob, fileName);
      return;
    }

    writeFile(wb, fileName);
  }

  public static getUrl(role: Role) {
    switch (role) {
      case Role.ADMIN:
      case Role.RESPONSIBLE:
      case Role.VIEWER:
        return '/tabs/player';
      case Role.PARENT:
        return '/tabs/parents';
      case Role.HELPER:
      case Role.VOICE_LEADER:
      case Role.VOICE_LEADER_HELPER:
      case Role.NONE:
      case Role.PLAYER:
      case Role.APPLICANT:
        return '/tabs/signout';
      default:
        return '/register';
    }
  }

  public static isUrlAccessAllowed(url: string, role: Role) {
    switch (url) {
      case '/tabs/settings':
      case '/tabs/settings/songs':
      case '/tabs/settings/register':
        return true;
      case '/tabs/members':
        return [Role.HELPER, Role.PLAYER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.NONE].includes(role);
      case '/tabs/signout':
        return [Role.HELPER, Role.PLAYER, Role.APPLICANT, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case '/tabs/player':
        return [Role.ADMIN, Role.RESPONSIBLE, Role.VIEWER].includes(role);
      case '/tabs/settings/notifications':
        return [Role.ADMIN, Role.RESPONSIBLE, Role.HELPER, Role.PLAYER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case '/tabs/settings/voice-leader':
        return [Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case '/tabs/attendance':
      case '/tabs/settings/teachers':
        return [Role.ADMIN, Role.RESPONSIBLE, Role.VIEWER].includes(role);
      case '/tabs/settings/general':
      case '/tabs/settings/general/types':
      case '/tabs/settings/general/branding':
      case '/tabs/settings/instruments':
      case '/tabs/settings/meetings':
      case '/tabs/settings/handover':
      case '/tabs/settings/handover/detail':
      case '/tabs/settings/role-permissions':
      case '/tabs/settings/org-settings':
      case '/tabs/settings/org-settings/branding':
      case '/tabs/settings/org-plans':
      case '/tabs/settings/org-plans/planung':
      case '/tabs/settings/planung':
      case '/tabs/org-plans':
      case '/tabs/org-plans/planung':
        return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
      case '/tabs/settings/files':
        return [Role.ADMIN, Role.RESPONSIBLE, Role.HELPER].includes(role);
      case '/tabs/parents':
        return [Role.PARENT].includes(role);
      default:
        if (url.includes('/tabs/settings/songs/')) {
          return true;
        } else if (url.includes('/tabs/settings/meetings/')) {
          return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
        } else if (url.includes('/tabs/settings/general/types/')) {
          return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
        } else if (url.startsWith('/tabs/attendance/') || url.startsWith('/tabs/attendance?')) {
          // Detail route /tabs/attendance/:id (and any future query-param
          // variant) inherits the role gate of the attendance list. Without
          // this branch, TabsPage's url-check effect kicks the user back to
          // their home page on a hard reload of the detail URL.
          return [Role.ADMIN, Role.HELPER, Role.VOICE_LEADER_HELPER, Role.VIEWER, Role.RESPONSIBLE].includes(role);
        }


        return false;
    }
  }

  public static calculateAge(birthdate: Date): number {
    // Use calendar arithmetic rather than ms-diff: a raw ms diff crosses the
    // year boundary a few hours early when the local timezone is ahead of UTC
    // (birthdate parses at UTC midnight, `Date.now()` is compared against it
    // in UTC), so on the actual birthday the age came out one year too low.
    const today = new Date();
    let age = today.getFullYear() - birthdate.getUTCFullYear();
    const monthDiff = today.getMonth() - birthdate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getUTCDate())) {
      age--;
    }
    return age;
  }

  public static getAttText(att: PersonAttendance): string {
    let attText = '';

    switch (att.status) {
      case AttendanceStatus.Neutral:
        attText = 'N';
        break;
      case AttendanceStatus.Present:
        attText = 'X';
        break;
      case AttendanceStatus.Excused:
        attText = 'E';
        break;
      case AttendanceStatus.Late:
      case AttendanceStatus.LateExcused:
        attText = 'L';
        break;
      case AttendanceStatus.Absent:
        attText = 'A';
        break;
    }

    return attText;
  }

  public static getAttendanceStatusDescription(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Neutral:
        return 'Neutral';
      case AttendanceStatus.Present:
        return 'Anwesend';
      case AttendanceStatus.Excused:
        return 'Entschuldigt';
      case AttendanceStatus.Late:
        return 'Verspätet anwesend';
      case AttendanceStatus.LateExcused:
        return 'Verspätet entschuldigt';
      case AttendanceStatus.Absent:
        return 'Abwesend';
      default:
        return 'Unbekannt';
    }
  }

  public static getInstrumentText(instrumentIds: number[], instruments: Group[], groupCategories: GroupCategory[]): string {
    const filteredInstruments: Group[] = instruments.filter((instrument: Group) => !instrumentIds.includes(instrument.id));
    // last instrument should be connected with 'und'

    if (filteredInstruments.length === 0) {
      return '';
    } else if (filteredInstruments.length === 1) {
      return 'Ohne ' + filteredInstruments[0].name;
    }

    // check if all instruments of one category are missing
    // also check if there are multiple categories with missing instruments, separate those with ',' and 'und'
    const categoryMap: { [key: number]: Group[] } = {};
    filteredInstruments.forEach((instrument: Group) => {
      if (instrument.category) {
        if (!categoryMap[instrument.category]) {
          categoryMap[instrument.category] = [];
        }
        categoryMap[instrument.category].push(instrument);
      } else {
        // no category, add to own category with id -1
        if (!categoryMap[-1]) {
          categoryMap[-1] = [];
        }
        categoryMap[-1].push(instrument);
      }
    });

    const categoriesMissingAllInstruments: string[] = [];
    Object.keys(categoryMap).forEach((categoryId: string) => {
      const catIdNum = Number(categoryId);
      const totalInstrumentsInCategory = instruments.filter((instrument: Group) => instrument.category === catIdNum).length;
      if (categoryMap[catIdNum].length === totalInstrumentsInCategory) {
        // all instruments of this category are missing
        const categoryName = catIdNum === -1 ? 'Sonstige' : groupCategories.find(cat => cat.id === catIdNum)?.name || 'Unbekannt';
        categoriesMissingAllInstruments.push(categoryName);
        // remove this category from categoryMap
        delete categoryMap[catIdNum];
      }
    });

    // now, categoryMap only contains categories with some missing instruments
    const individualInstruments: Group[] = [];
    Object.keys(categoryMap).forEach((categoryId: string) => {
      const catIdNum = Number(categoryId);
      individualInstruments.push(...categoryMap[catIdNum]);
    });

    const allParts: string[] = categoriesMissingAllInstruments.concat(individualInstruments.map(inst => inst.name));

    if (allParts.length === 1) {
      return 'Ohne ' + allParts[0];
    }

    return 'Ohne ' + allParts.slice(0, -1).join(', ') + ' und ' + allParts.slice(-1);
  }

  public static getFieldTypeDefaultValue(fieldType: FieldType, defaultValue?: any, options?: string[], churches?: Church[]): any {
    if (defaultValue !== undefined && defaultValue !== null) {
      return defaultValue;
    }

    if (fieldType === FieldType.BFECG_CHURCH && churches?.length) {
      return churches[0].id;
    }

    if (fieldType === FieldType.SELECT) {
      return options && options.length ? options[0] : '';
    }

    switch (fieldType) {
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
        return '';
      case FieldType.NUMBER:
        return 0;
      case FieldType.DATE:
        return new Date().toISOString();
      case FieldType.BOOLEAN:
        return true;
      default:
        return '';
    }
  }

  public static getDefaultAttendanceTypes(tenantId: number, type: string): AttendanceType[] {
    const attendanceTypes: AttendanceType[] = [
      {
        name: type === DefaultAttendanceType.GENERAL ? 'Treffen' : 'Probe',
        planning_title: type === DefaultAttendanceType.GENERAL ? 'Treffen' : 'Probenplan',
        color: 'primary',
        include_in_average: true,
        available_statuses: [AttendanceStatus.Present, AttendanceStatus.Excused, AttendanceStatus.Late, AttendanceStatus.Absent],
        default_status: AttendanceStatus.Present,
        hide_name: true,
        highlight: false,
        visible: true,
        manage_songs: false,
        relevant_groups: [],
        tenant_id: tenantId,
        reminders: [],
      }
    ];

    if (type !== DefaultAttendanceType.GENERAL) {
      attendanceTypes.push({
        name: 'Vortrag',
        planning_title: 'Vortrag',
        color: 'secondary',
        include_in_average: true,
        available_statuses: [AttendanceStatus.Present, AttendanceStatus.Excused, AttendanceStatus.Late, AttendanceStatus.Absent, AttendanceStatus.Neutral],
        default_status: AttendanceStatus.Neutral,
        hide_name: false,
        highlight: true,
        visible: true,
        manage_songs: true,
        relevant_groups: [],
        tenant_id: tenantId,
        reminders: [],
      });
    }

    attendanceTypes.push({
      name: 'Sonstiges',
      planning_title: 'Sonstiges',
      color: 'tertiary',
      include_in_average: true,
      available_statuses: [AttendanceStatus.Present, AttendanceStatus.Excused, AttendanceStatus.Late, AttendanceStatus.Absent, AttendanceStatus.Neutral],
      default_status: AttendanceStatus.Neutral,
      hide_name: false,
      highlight: false,
      visible: true,
      manage_songs: false,
      relevant_groups: [],
      tenant_id: tenantId,
      reminders: [],
    });

    return attendanceTypes;
  }

  public static getStatusByShift(
    shift: ShiftPlan,
    attDate: string,
    attendanceStart: string,
    attendanceEnd: string,
    defaultStatus: AttendanceStatus,
    shiftStart?: string,
    shiftName?: string,
  ): { status: AttendanceStatus; note: string } {
    if (!shift || !shift.definition || shift.definition.length === 0) {
      return {
        status: defaultStatus,
        note: ''
      };
    }

    // Normalize attendance date to avoid timezone issues
    const attDateNormalized = dayjs(attDate).startOf('day');
    const attDateStr = attDateNormalized.format('YYYY-MM-DD');
    const attendanceStartTime = dayjs(`${attDateStr}T${attendanceStart}`);
    const attendanceEndTime = dayjs(`${attDateStr}T${attendanceEnd}`);

    let currentDate;
    if (shiftName) {
      const matchingShift = shift.shifts.find(def => def.name === shiftName);
      if (matchingShift) {
        // Use startOf('day') to strip time/timezone information
        currentDate = dayjs(matchingShift.date).startOf('day');
      } else {
        throw new Error('Shift name not found in shift plan');
      }
    } else {
      currentDate = dayjs(shiftStart).startOf('day');
    }
    const endDate = attDateNormalized.add(2, 'day');

    while (currentDate.isBefore(endDate)) {
      for (const def of shift.definition) {
        for (let i = 0; i < def.repeat_count; i++) {
          if (currentDate.isAfter(attDateNormalized.subtract(2, 'day')) || currentDate.isSame(attDateNormalized, 'day') || currentDate.isAfter(attDateNormalized, 'day')) {
            const shiftStartTime = dayjs(`${currentDate.format('YYYY-MM-DD')}T${def.start_time}`);
            const shiftEndTime = shiftStartTime.add(def.duration, 'hour');

            // Check for overlap
            if (!def.free && attendanceStartTime.isBefore(shiftEndTime) && attendanceEndTime.isAfter(shiftStartTime)) {
              return {
                status: AttendanceStatus.Excused,
                note: 'Schichtbedingt'
              };
            }
          }

          currentDate = currentDate.add(1, 'day');
        }
      }
    }


    return {
      status: defaultStatus,
      note: ''
    };
  }

  public static getReadableDate(date: string, type: AttendanceType): string {
    if (type.all_day) {
      const endDate = dayjs(date).add((type.duration_days || 1) - 1, 'day');
      if (type.duration_days && type.duration_days > 1) {
        return `${dayjs(date).locale('de').format('ddd, DD.MM.YYYY')} - ${endDate.locale('de').format('ddd, DD.MM.YYYY')}`;
      } else {
        return dayjs(date).locale('de').format('ddd, DD.MM.YYYY');
      }
    }

    return dayjs(date).locale('de').format('ddd, DD.MM.YYYY');
  }

  public static getPlanningTitle(type: AttendanceType, typeInfo?: string): string {
    if (type.planning_title && typeInfo) {
      return `${type.planning_title} (${typeInfo})`;
    }

    return type.planning_title || typeInfo || type.name || 'Probenplan';
  }

  static async openFileNative(urlOrBlob: string | Blob, fileName?: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      if (typeof urlOrBlob === 'string') {
        window.open(urlOrBlob, '_blank');
      } else {
        const url = window.URL.createObjectURL(urlOrBlob);
        window.open(url, '_blank');
      }
      return;
    }

    const { FileViewer } = await import('@capacitor/file-viewer');

    if (typeof urlOrBlob === 'string' && urlOrBlob.startsWith('http')) {
      await FileViewer.openDocumentFromUrl({ url: urlOrBlob });
      return;
    }

    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    let base64: string;

    if (typeof urlOrBlob === 'string') {
      const response = await fetch(urlOrBlob);
      const blob = await response.blob();
      base64 = await Utils.blobToBase64(blob);
    } else {
      base64 = await Utils.blobToBase64(urlOrBlob);
    }

    const name = fileName || `document_${Date.now()}.pdf`;
    const result = await Filesystem.writeFile({
      path: name,
      data: base64,
      directory: Directory.Cache,
    });

    await FileViewer.openDocumentFromLocalPath({ path: result.uri });
  }

  static async downloadFileNative(blob: Blob, fileName: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      // On mobile browsers (iOS/iPadOS Safari especially) the <a download>
      // trick is ignored — the file just opens as a blob URL in a new tab
      // and the user has no way to share or save it. Use the Web Share API
      // there so the system share sheet pops up (Files, AirDrop, Mail, …).
      // Desktop browsers (Mac/Windows incl. Safari on macOS) get the direct
      // anchor download instead — that's what users expect on a desktop.
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua)
        || (ua.includes('Macintosh') && (navigator as any).maxTouchPoints > 1); // iPadOS 13+ reports as Mac
      const isAndroid = /Android/i.test(ua);
      const isMobile = isIOS || isAndroid;
      const mimeType = blob.type || (fileName.endsWith('.png') ? 'image/png' : 'application/pdf');

      if (isMobile) {
        try {
          const file = new File([blob], fileName, { type: mimeType });
          const nav: any = navigator;
          if (nav?.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
            await nav.share({ files: [file] });
            return;
          }
        } catch (err: any) {
          // AbortError = user dismissed the share sheet; treat as success.
          if (err?.name === 'AbortError') {return;}
          // Otherwise fall through to the anchor-download path.
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return;
    }

    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base64 = await Utils.blobToBase64(blob);

    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });

    const { FileViewer } = await import('@capacitor/file-viewer');
    await FileViewer.openDocumentFromLocalPath({ path: result.uri });
  }

  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Generate one A4-portrait certificate PDF page per player, overlaying
   * name, fixed body text, and today's date on the Vorkurs Urkunde background.
   * Downloads as a single multi-page PDF.
   */
  public static async generateVorkursCertificates(
    players: { firstName: string; lastName: string }[],
    city: string = 'Speyer',
  ): Promise<void> {
    const { default: jsPDF } = await import('jspdf');

    const bgRes = await fetch('assets/urkunde-vorkurs.jpg');
    if (!bgRes.ok) throw new Error('Hintergrundbild nicht gefunden');
    const bgBlob = await bgRes.blob();
    const bgDataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(bgBlob);
    });

    const today = dayjs().locale('de').format('D.M.YYYY');
    const W = 210;
    const H = 297;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    players.forEach((player, i) => {
      if (i > 0) doc.addPage();

      doc.addImage(bgDataUrl, 'JPEG', 0, 0, W, H, `bg${i}`, 'FAST');

      const fullName = `${player.firstName} ${player.lastName}`;

      doc.setFont('times', 'bolditalic');
      const maxNameWidth = W - 60; // 30mm margin each side
      let nameFontSize = 48;
      doc.setFontSize(nameFontSize);
      while (nameFontSize > 28 && doc.getTextWidth(fullName) > maxNameWidth) {
        nameFontSize -= 2;
        doc.setFontSize(nameFontSize);
      }
      doc.setTextColor(20, 20, 20);
      doc.text(fullName, W / 2, 138, { align: 'center' });

      doc.setFont('times', 'bolditalic');
      doc.setFontSize(33);
      doc.text('hat die Vorkursprüfung', W / 2, 168, { align: 'center' });
      doc.text('erfolgreich bestanden', W / 2, 186, { align: 'center' });

      doc.setFont('times', 'italic');
      doc.setFontSize(24);
      doc.text(`${city}, den ${today}`, 35, 252, { align: 'left' });
    });

    const fileName = `Urkunden_Vorkurs_${dayjs().format('YYYY-MM-DD')}.pdf`;
    await Utils.downloadFileNative(doc.output('blob'), fileName);
  }
}
