import { ToastController, LoadingController } from "@ionic/angular";
import dayjs from 'dayjs';
import { AttendanceStatus, DEFAULT_IMAGE, DefaultAttendanceType, FieldType, PlayerHistoryType, Role } from "./constants";
import { Attendance, FieldSelection, GroupCategory, Group, PersonAttendance, Player, AttendanceType, ExtraField, ShiftPlan, Church } from "./interfaces";
// jsPDF and xlsx are lazy-loaded for better initial bundle size

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
    const oneMonthAgo = dayjs().subtract(1, "month");
    const tomorrow = dayjs().add(1, "day");

    // Sort once with proper comparator
    const sortedPlayers = [...players].sort((a: Player, b: Player) => {
      // Main group first
      if (a.instrument === mainGroup && b.instrument !== mainGroup) return -1;
      if (b.instrument === mainGroup && a.instrument !== mainGroup) return 1;

      // Then by group name
      const aGroupName = instrumentNameMap.get(a.instrument) || '';
      const bGroupName = instrumentNameMap.get(b.instrument) || '';
      const groupCompare = aGroupName.localeCompare(bGroupName);
      if (groupCompare !== 0) return groupCompare;

      // Then by lastName within same group
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
          if (!attendance) return false;

          const type = typeMap.get(attendance.type_id);
          if (!type?.include_in_average) return false;

          return dayjs(attendance.date).isBefore(tomorrow);
        });
        percentage = Utils.getPercentage(personAttendancesTillNow) || 0;

        // Count unexcused late arrivals (only after lastSolve if set)
        lateCount = personAttendancesTillNow.filter((pa: PersonAttendance) => {
          if (pa.status !== AttendanceStatus.Late) return false;
          if (!lastSolveDate) return true;

          const attendance = attendanceMap.get(pa.attendance_id);
          return attendance && dayjs(attendance.date).isAfter(lastSolveDate);
        }).length;
      }

      let img = player.img || DEFAULT_IMAGE;

      if (img.includes("/storage/v1/object/public/profiles/") && !img.includes("?quality=20")) {
        img = img.replace("object/public/profiles/", "render/image/public/profiles/");
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

  public static getModifiedPlayers(persons: PersonAttendance[], mainGroup?: number): PersonAttendance[] {
    const instrumentsMap: { [props: number]: boolean } = {};

    return Utils.sortPlayers(persons, mainGroup).map((player: PersonAttendance): PersonAttendance => {
      let firstOfInstrument: boolean = false;
      let instrumentLength: number = 0;
      let isNew: boolean = false;

      if (!instrumentsMap[player.instrument]) {
        instrumentsMap[player.instrument] = true;
        firstOfInstrument = true;
        instrumentLength = persons.filter((p: PersonAttendance) => p.instrument === player.instrument).length;
      }

      if (dayjs().subtract(1, "month").isBefore(dayjs(player.person.joined))) {
        isNew = true;
      }

      return {
        ...player,
        ...player.person,
        firstOfInstrument,
        instrumentLength,
        isNew,
        img: player.img || DEFAULT_IMAGE,
      } as any
    });
  }

  private static sortPlayers(players: PersonAttendance[], mainGroupId: number): PersonAttendance[] {
    // Separate main group and other players
    const mainGroup = players.filter(p => p.instrument === mainGroupId);
    const otherGroups = players.filter(p => p.instrument !== mainGroupId);

    // Sort main group by lastName
    const sortedMainGroup = mainGroup.sort((a, b) => (a.person?.lastName ?? a.lastName).localeCompare(b.person?.lastName ?? b.lastName));

    // Group others by groupId
    const grouped = new Map<number, { groupName: string; players: PersonAttendance[] }>();

    for (const player of otherGroups) {
      if (!grouped.has(player.instrument)) {
        grouped.set(player.instrument, {
          groupName: player.groupName,
          players: []
        });
      }
      grouped.get(player.instrument).players.push(player);
    }

    // Sort the groups by instrument name, then sort each group's players by lastName
    const sortedOtherGroups = [...grouped.entries()]
      .sort(([, a], [, b]) => a.groupName.localeCompare(b.groupName))
      .map(([, group]) =>
        group.players.sort((a, b) => (a.person?.lastName ?? a.lastName).localeCompare(b.person?.lastName ?? b.lastName))
      )
      .reduce((acc, val) => acc.concat(val), []);

    // Return combined sorted result
    return [...sortedMainGroup, ...sortedOtherGroups];
  }

  public static getModifiedAttendanceData(attendance: Attendance): Attendance {
    attendance.persons = attendance.persons.map((person: PersonAttendance): PersonAttendance => {
      return {
        ...person,
        img: person.img || DEFAULT_IMAGE,
        instrument: (person.person.instrument as any).id,
        groupName: (person.person.instrument as any).name,
      }
    });

    return attendance;
  }

  public static getPercentage(personAttendances: PersonAttendance[]): number {
    if (!personAttendances.length) {
      return 0;
    }
    const overallCount: number = personAttendances.length;
    let presentCount: number = 0;
    for (const p of personAttendances) {
      if (p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late || p.status === AttendanceStatus.LateExcused) {
        presentCount++;
      }
    }

    return Math.round((presentCount / overallCount) * 100);
  }

  public static getClefText(key: string) {
    switch (key) {
      case 'c':
        return "Altschlüssel";
      case 'g':
        return "Violinschlüssel";
      case 'f':
        return "Bassschlüssel"
      default:
        throw new Error("unknown clef key")
    }
  }

  public static getRoleText(role: Role): string {
    switch (role) {
      case Role.ADMIN:
        return "Admin";
      case Role.PLAYER:
        return "Mitglied";
      case Role.VIEWER:
        return "Beobachter";
      case Role.HELPER:
        return "Helfer";
      case Role.RESPONSIBLE:
        return "Verantwortlicher";
      case Role.PARENT:
        return "Elternteil";
      case Role.VOICE_LEADER:
        return "Stimmführer";
      case Role.VOICE_LEADER_HELPER:
        return "Stimmführer & Helfer";
      case Role.NONE:
        return "Mitglied";
      default:
        return "Unbekannt";
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
        return "Pausiert";
      case PlayerHistoryType.UNEXCUSED:
        return "Unentschuldigt";
      case PlayerHistoryType.CRITICAL_PERSON:
        return "";
      case PlayerHistoryType.INSTRUMENT_CHANGE:
        return "Wechsel";
      case PlayerHistoryType.ARCHIVED:
        return "Archiviert";
      case PlayerHistoryType.RETURNED:
        return "Reaktiviert";
      case PlayerHistoryType.TRANSFERRED_FROM:
      case PlayerHistoryType.TRANSFERRED_TO:
      case PlayerHistoryType.COPIED_FROM:
      case PlayerHistoryType.COPIED_TO:
        return "";
      default:
        return "Sonstiges";
    }
  }

  public static async showToast(message: string, color: string = "success", duration: number = 3000): Promise<void> {
    const toast: HTMLIonToastElement = await new ToastController().create({
      message,
      color,
      position: "bottom",
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

  public static async createPlanExport(props: any, typeText: string) {
    // Lazy load jsPDF to reduce initial bundle size
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const startingTime: dayjs.Dayjs = dayjs(props.time).isValid() ? dayjs(props.time) : dayjs().hour(Number(props.time.substring(0, 2))).minute(Number(props.time.substring(3, 5)));
    const date: string = props.attendance ? dayjs(props.attendances.find((att: Attendance) => att.id === props.attendance).date).locale("de").format("dddd, DD.MM.YYYY") : startingTime.locale("de").format("dddd, DD.MM.YYYY");
    const hasConductors = Boolean(props.fields.find((field: FieldSelection) => field.conductor));

    const data: any[] = [];

    let row = 1;
    let currentTime = startingTime;

    for (const field of props.fields) {
      let fieldName = field.name;

      fieldName = fieldName.replace(/А/g, 'A');
      fieldName = fieldName.replace(/Б/g, 'B');
      fieldName = fieldName.replace(/В/g, 'V');
      fieldName = fieldName.replace(/Г/g, 'G');
      fieldName = fieldName.replace(/Д/g, 'D');
      fieldName = fieldName.replace(/Е/g, 'E');
      fieldName = fieldName.replace(/Ё/g, 'E');
      fieldName = fieldName.replace(/Ж/g, 'Zh');
      fieldName = fieldName.replace(/З/g, 'Z');
      fieldName = fieldName.replace(/И/g, 'I');
      fieldName = fieldName.replace(/Й/g, 'I');
      fieldName = fieldName.replace(/К/g, 'K');
      fieldName = fieldName.replace(/Л/g, 'L');
      fieldName = fieldName.replace(/М/g, 'M');
      fieldName = fieldName.replace(/Н/g, 'N');
      fieldName = fieldName.replace(/О/g, 'O');
      fieldName = fieldName.replace(/П/g, 'P');
      fieldName = fieldName.replace(/Р/g, 'R');
      fieldName = fieldName.replace(/С/g, 'S');
      fieldName = fieldName.replace(/Т/g, 'T');
      fieldName = fieldName.replace(/У/g, 'U');
      fieldName = fieldName.replace(/Ф/g, 'F');
      fieldName = fieldName.replace(/Х/g, 'Kh');
      fieldName = fieldName.replace(/Ц/g, 'Ts');
      fieldName = fieldName.replace(/Ч/g, 'Ch');
      fieldName = fieldName.replace(/Ш/g, 'Sh');
      fieldName = fieldName.replace(/Щ/g, 'Shch');
      fieldName = fieldName.replace(/Ъ/g, '');
      fieldName = fieldName.replace(/Ы/g, 'Y');
      fieldName = fieldName.replace(/Ь/g, '');
      fieldName = fieldName.replace(/Э/g, 'E');
      fieldName = fieldName.replace(/Ю/g, 'Yu');
      fieldName = fieldName.replace(/Я/g, 'Ya');
      fieldName = fieldName.replace(/а/g, 'a');
      fieldName = fieldName.replace(/б/g, 'b');
      fieldName = fieldName.replace(/в/g, 'v');
      fieldName = fieldName.replace(/г/g, 'g');
      fieldName = fieldName.replace(/д/g, 'd');
      fieldName = fieldName.replace(/е/g, 'e');
      fieldName = fieldName.replace(/ё/g, 'e');
      fieldName = fieldName.replace(/ж/g, 'zh');
      fieldName = fieldName.replace(/з/g, 'z');
      fieldName = fieldName.replace(/и/g, 'i');
      fieldName = fieldName.replace(/й/g, 'i');
      fieldName = fieldName.replace(/к/g, 'k');
      fieldName = fieldName.replace(/л/g, 'l');
      fieldName = fieldName.replace(/м/g, 'm');
      fieldName = fieldName.replace(/н/g, 'n');
      fieldName = fieldName.replace(/о/g, 'o');
      fieldName = fieldName.replace(/п/g, 'p');
      fieldName = fieldName.replace(/р/g, 'r');
      fieldName = fieldName.replace(/с/g, 's');
      fieldName = fieldName.replace(/т/g, 't');
      fieldName = fieldName.replace(/у/g, 'u');
      fieldName = fieldName.replace(/ф/g, 'f');
      fieldName = fieldName.replace(/х/g, 'kh');
      fieldName = fieldName.replace(/ц/g, 'ts');
      fieldName = fieldName.replace(/ч/g, 'ch');
      fieldName = fieldName.replace(/ш/g, 'sh');
      fieldName = fieldName.replace(/щ/g, 'shch');
      fieldName = fieldName.replace(/ъ/g, '');
      fieldName = fieldName.replace(/ы/g, 'y');
      fieldName = fieldName.replace(/ь/g, '');
      fieldName = fieldName.replace(/э/g, 'e');
      fieldName = fieldName.replace(/ю/g, 'yu');
      fieldName = fieldName.replace(/я/g, 'ya');

      if (field.id.includes("noteFld")) {
        data.push([
          { content: fieldName, colSpan: hasConductors ? 5 : 4 }
        ]);
      } else {
        if (hasConductors) {
          data.push([
            row.toString(),
            `${currentTime.format("HH:mm")} Uhr`,
            fieldName,
            field.conductor || "",
            `${field.time} min`,
          ]);
        } else {
          data.push([
            row.toString(),
            `${currentTime.format("HH:mm")} Uhr`,
            fieldName,
            `${field.time} min`,
          ]);
        }

        currentTime = currentTime.add(parseInt(field.time), "minutes");
        row++;
      }
    }

    const head = hasConductors ? [[
      { content: "#", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Uhrzeit", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Programmpunkt", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Ausführung", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Dauer", styles: { fontSize: props.sideBySide ? 8 : 11 } },
    ]] : [[
      { content: "#", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Uhrzeit", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Programmpunkt", styles: { fontSize: props.sideBySide ? 8 : 11 } },
      { content: "Dauer", styles: { fontSize: props.sideBySide ? 8 : 11 } },
    ]];

    const tableStyles = {
      fontSize: props.sideBySide ? 8 : 11,
      cellPadding: props.sideBySide ? 2 : 3.5,
      textColor: [30, 30, 30] as [number, number, number],
      lineColor: [180, 180, 180] as [number, number, number],
      lineWidth: 0,
    };

    const columnStyles = props.sideBySide ? {
      0: { cellWidth: 8, halign: 'center' as const },
      1: { cellWidth: 20 },
    } : {
      0: { cellWidth: 12, halign: 'center' as const },
      1: { cellWidth: 28 },
    };

    // Side-by-side A5 landscape mode
    if (props.sideBySide) {
      const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
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
        doc.setFontSize(14);
        doc.text(`${typeText} ${date}`, startX + 5, 15);

        (doc as any).autoTable({
          head,
          body: data,
          startY: 22,
          margin: { left: startX + 5, right: pageWidth - startX - maxWidth + 5 },
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
          didParseCell: (hookData: any) => {
            if (hookData.row.raw && hookData.row.raw.length === 1 && hookData.row.raw[0].colSpan) {
              hookData.cell.styles.fontStyle = 'italic';
              hookData.cell.styles.fillColor = [235, 235, 235];
              hookData.cell.styles.textColor = [80, 80, 80];
            }
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
        return doc.output("blob");
      } else {
        doc.save(`${typeText}_${date}_2x.pdf`);
      }
      return;
    }

    // Standard A4 portrait mode
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${typeText} ${date}`, 14, 25);
    (doc as any).autoTable({
      head,
      body: data,
      margin: { top: 40 },
      theme: 'plain',
      styles: tableStyles,
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
      didParseCell: (hookData: any) => {
        // Style note rows (spanning all columns) differently
        if (hookData.row.raw && hookData.row.raw.length === 1 && hookData.row.raw[0].colSpan) {
          hookData.cell.styles.fontStyle = 'italic';
          hookData.cell.styles.fillColor = [235, 235, 235];
          hookData.cell.styles.textColor = [80, 80, 80];
        }
      },
    });

    if (props.asBlob) {
      if (props.asImage) {
        // Convert PDF to image using jsPDF's built-in canvas output
        const pdfDataUri = doc.output('datauristring');
        return await Utils.pdfDataUriToImageBlob(pdfDataUri);
      }
      return doc.output("blob");
    } else {
      doc.save(`${typeText}_${date}.pdf`);
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
    const { utils, writeFile } = await import('xlsx');

    let row = 1;
    let data;

    if (churches?.length) {
      data = [['', 'Nachname', 'Vorname', 'Gruppe', 'Gemeinde', 'Status', 'Bemerkung']];

      for (const user of players) {
        data.push([
          row.toString(),
          user.lastName,
          user.firstName,
          user.groupName,
          churches.find(ch => ch.id === user.person.additional_fields?.bfecg_church)?.name || '',
          Utils.getAttText(user),
          user.notes || ''
        ]);
        row++;
      }
    } else {
      data = [['', 'Nachname', 'Vorname', 'Gruppe', 'Status', 'Bemerkung']];

      for (const user of players) {
        data.push([row.toString(), user.lastName, user.firstName, user.groupName, Utils.getAttText(user), user.notes || '']);
        row++;
      }
    }

    const ws = utils.aoa_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Anwesenheit');

    writeFile(wb, `${attendance.typeInfo ?? type.name}_${dayjs(attendance.date).format('DD_MM_YYYY')}_Anwesenheit.xlsx`);
  }

  public static getUrl(role: Role) {
    switch (role) {
      case Role.ADMIN:
      case Role.RESPONSIBLE:
      case Role.VIEWER:
        return "/tabs/player";
      case Role.PARENT:
        return "/tabs/parents";
      case Role.HELPER:
      case Role.VOICE_LEADER:
      case Role.VOICE_LEADER_HELPER:
      case Role.NONE:
      case Role.PLAYER:
      case Role.APPLICANT:
        return "/tabs/signout";
      default:
        return "/register";
    }
  }

  public static isUrlAccessAllowed(url: string, role: Role) {
    switch (url) {
      case "/tabs/settings":
      case "/tabs/settings/songs":
      case "/tabs/settings/register":
        return true;
      case "/tabs/members":
        return [Role.HELPER, Role.PLAYER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.NONE].includes(role);
      case "/tabs/signout":
        return [Role.HELPER, Role.PLAYER, Role.APPLICANT, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case "/tabs/player":
        return [Role.ADMIN, Role.RESPONSIBLE, Role.VIEWER].includes(role);
      case "/tabs/settings/notifications":
        return [Role.ADMIN, Role.RESPONSIBLE, Role.HELPER, Role.PLAYER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case "/tabs/settings/voice-leader":
        return [Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER].includes(role);
      case "/tabs/attendance":
      case "/tabs/settings/teachers":
        return [Role.ADMIN, Role.RESPONSIBLE, Role.VIEWER].includes(role);
      case "/tabs/settings/general":
      case "/tabs/settings/general/types":
      case "/tabs/settings/instruments":
      case "/tabs/settings/meetings":
      case "/tabs/settings/handover":
      case "/tabs/settings/handover/detail":
        return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
      case "/tabs/parents":
        return [Role.PARENT].includes(role);
      default:
        if (url.includes("/tabs/settings/songs/")) {
          return true;
        } else if (url.includes("/tabs/settings/meetings/")) {
          return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
        } else if (url.includes("/tabs/settings/general/types/")) {
          return [Role.ADMIN, Role.RESPONSIBLE].includes(role);
        }


        return false;
    }
  }

  public static calculateAge(birthdate: Date): number {
    const msDiff = Date.now() - birthdate.getTime();
    const ageDiff = new Date(msDiff);

    return Math.abs(ageDiff.getUTCFullYear() - 1970);
  }

  public static getAttText(att: PersonAttendance): string {
    let attText: string = "";

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
        return "Neutral";
      case AttendanceStatus.Present:
        return "Anwesend";
      case AttendanceStatus.Excused:
        return "Entschuldigt";
      case AttendanceStatus.Late:
        return "Verspätet anwesend";
      case AttendanceStatus.LateExcused:
        return "Verspätet entschuldigt";
      case AttendanceStatus.Absent:
        return "Abwesend";
      default:
        return "Unbekannt";
    }
  }

  public static getInstrumentText(instrumentIds: number[], instruments: Group[], groupCategories: GroupCategory[]): string {
    const filteredInstruments: Group[] = instruments.filter((instrument: Group) => !instrumentIds.includes(instrument.id));
    // last instrument should be connected with 'und'

    if (filteredInstruments.length === 0) {
      return "";
    } else if (filteredInstruments.length === 1) {
      return "Ohne " + filteredInstruments[0].name;
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
        const categoryName = catIdNum === -1 ? "Sonstige" : groupCategories.find(cat => cat.id === catIdNum)?.name || "Unbekannt";
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
      return "Ohne " + allParts[0];
    }

    return "Ohne " + allParts.slice(0, -1).join(", ") + " und " + allParts.slice(-1);
  }

  public static getFieldTypeDefaultValue(fieldType: FieldType, defaultValue?: any, options?: string[], churches?: Church[]): any {
    if (defaultValue !== undefined && defaultValue !== null) {
      return defaultValue;
    }

    if (fieldType === FieldType.BFECG_CHURCH && churches?.length) {
      return churches[0].id;
    }

    if (fieldType === FieldType.SELECT) {
      return options && options.length ? options[0] : "";
    }

    switch (fieldType) {
      case FieldType.TEXT:
      case FieldType.TEXTAREA:
        return "";
      case FieldType.NUMBER:
        return 0;
      case FieldType.DATE:
        return new Date().toISOString();
      case FieldType.BOOLEAN:
        return true;
      default:
        return "";
    }
  }

  public static getDefaultAttendanceTypes(tenantId: number, type: string): AttendanceType[] {
    const attendanceTypes: AttendanceType[] = [
      {
        name: type === DefaultAttendanceType.GENERAL ? "Treffen" : "Probe",
        planning_title: type === DefaultAttendanceType.GENERAL ? "Treffen" : "Probenplan",
        color: "primary",
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
        name: "Vortrag",
        planning_title: "Vortrag",
        color: "secondary",
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
      name: "Sonstiges",
      planning_title: "Sonstiges",
      color: "tertiary",
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
        note: ""
      };
    }

    // Normalize attendance date to avoid timezone issues
    const attDateNormalized = dayjs(attDate).startOf('day');
    const attDateStr = attDateNormalized.format("YYYY-MM-DD");
    const attendanceStartTime = dayjs(`${attDateStr}T${attendanceStart}`);
    const attendanceEndTime = dayjs(`${attDateStr}T${attendanceEnd}`);

    let currentDate;
    if (shiftName) {
      const matchingShift = shift.shifts.find(def => def.name === shiftName);
      if (matchingShift) {
        // Use startOf('day') to strip time/timezone information
        currentDate = dayjs(matchingShift.date).startOf('day');
      } else {
        throw new Error("Shift name not found in shift plan");
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
                note: "Schichtbedingt"
              };
            }
          }

          currentDate = currentDate.add(1, 'day');
        }
      }
    }


    return {
      status: defaultStatus,
      note: ""
    };
  }

  public static getReadableDate(date: string, type: AttendanceType): string {
    if (type.all_day) {
      const endDate = dayjs(date).add((type.duration_days || 1) - 1, 'day');
      if (type.duration_days && type.duration_days > 1) {
        dayjs.locale("de");
        return `${dayjs(date).format("ddd, DD.MM.YYYY")} - ${endDate.format("ddd, DD.MM.YYYY")}`;
      } else {
        dayjs.locale("de");
        return dayjs(date).format("ddd, DD.MM.YYYY");
      }
    }

    dayjs.locale("de");
    return dayjs(date).format("ddd, DD.MM.YYYY");
  }

  public static getPlanningTitle(type: AttendanceType, typeInfo?: string): string {
    if (type.planning_title && typeInfo) {
      return `${type.planning_title} (${typeInfo})`;
    }

    return type.planning_title || typeInfo || type.name || 'Probenplan';
  }
}
