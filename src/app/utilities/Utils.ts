import { ToastController, LoadingController } from "@ionic/angular";
import dayjs from 'dayjs';
import { AttendanceStatus, DEFAULT_IMAGE, DefaultAttendanceType, FieldType, PlayerHistoryType, Role } from "./constants";
import { Attendance, FieldSelection, GroupCategory, Group, PersonAttendance, Player, AttendanceType, ExtraField, ShiftDefinition, ShiftPlan, Church } from "./interfaces";
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
    const instrumentsMap: { [props: number]: boolean } = {};

    return players.sort((a: Player, b: Player) => {
      if (a.instrument === b.instrument) {
        return a.lastName.localeCompare(b.lastName);
      }

      // Sort by instrument but maingroup first
      if (a.groupName === b.groupName) {
        return 0;
      } else if (a.instrument === mainGroup) {
        return -1;
      } else if (b.instrument === mainGroup) {
        return 1;
      }
    }).map((player: Player): Player => {
      let firstOfInstrument: boolean = false;
      let instrumentLength: number = 0;
      let isNew: boolean = false;

      if (!instrumentsMap[player.instrument]) {
        instrumentsMap[player.instrument] = true;
        firstOfInstrument = true;
        instrumentLength = players.filter((p: Player) => p.instrument === player.instrument).length;
      }

      if (dayjs().subtract(1, "month").isBefore(dayjs(player.joined))) {
        isNew = true;
      }

      if (additionalFields) {
        for (const field of additionalFields) {
          if (player.additional_fields?.[field.id] === undefined || player.additional_fields?.[field.id] === null) {
            player.additional_fields[field.id] = Utils.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options, churches);
          }
        }
      }

      let percentage: number = 0;

      if (player.person_attendances && attendances?.length) {
        const personAttendancesTillNow = player.person_attendances.filter((personAttendance: PersonAttendance) => {
          const attendance = attendances.find((attendance: Attendance) => personAttendance.attendance_id === attendance.id);
          const type = types.find((t: AttendanceType) => t.id === attendance?.type_id);

          if (!type?.include_in_average) {
            return false;
          }

          return attendance && dayjs(attendance.date).isBefore(dayjs().add(1, "day"));
        });
        percentage = Utils.getPercentage(personAttendancesTillNow);
        if (isNaN(percentage)) {
          percentage = 0;
        }
      }

      let img = player.img || DEFAULT_IMAGE;

      if (img.includes("/storage/v1/object/public/profiles/") && !img.includes("?quality=20")) {
        img = img.replace("object/public/profiles/", "render/image/public/profiles/");
        img = `${img}?quality=20`;
      }

      return {
        ...player,
        firstOfInstrument,
        instrumentLength,
        isNew,
        percentage,
        groupName: instruments.find((ins: Group) => ins.id === player.instrument).name,
        img,
      }
    }).sort((a: Player, b: Player) => {
      // Sort by instrument but maingroup first
      if (a.groupName === b.groupName) {
        return 0;
      } else if (a.instrument === mainGroup) {
        return -1;
      } else if (b.instrument === mainGroup) {
        return 1;
      }
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

  public static async createPlanExport(props: any, isPractice: boolean = true) {
    // Lazy load jsPDF to reduce initial bundle size
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const startingTime: dayjs.Dayjs = dayjs(props.time).isValid() ? dayjs(props.time) : dayjs().hour(Number(props.time.substring(0, 2))).minute(Number(props.time.substring(3, 5)));
    const date: string = props.attendance ? dayjs(props.attendances.find((att: Attendance) => att.id === props.attendance).date).format("DD.MM.YYYY") : startingTime.format("DD.MM.YYYY");
    const hasConductors = Boolean(props.fields.find((field: FieldSelection) => field.conductor));

    const data = [];

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
      fieldName = fieldName.replace(/Ä/g, 'Ae');
      fieldName = fieldName.replace(/Ö/g, 'Oe');
      fieldName = fieldName.replace(/Ü/g, 'Ue');
      fieldName = fieldName.replace(/ä/g, 'ae');
      fieldName = fieldName.replace(/ö/g, 'oe');
      fieldName = fieldName.replace(/ü/g, 'ue');
      fieldName = fieldName.replace(/ß/g, 'ss');

      if (field.id.includes("noteFld")) {
        data.push([
          { content: fieldName, styles: { fontSize: 14 }, colSpan: hasConductors ? 5 : 4 }
        ]);
      } else {
        if (hasConductors) {
          data.push([
            { content: row.toString(), styles: { fontSize: 14 } },
            { content: `${currentTime.format("HH:mm")} Uhr`, styles: { fontSize: 14 } },
            { content: fieldName, styles: { fontSize: 14 } },
            { content: field.conductor || "", styles: { fontSize: 14 } },
            { content: `${field.time} min`, styles: { fontSize: 14 } },
          ]);
        } else {
          data.push([
            { content: row.toString(), styles: { fontSize: 14 } },
            { content: `${currentTime.format("HH:mm")} Uhr`, styles: { fontSize: 14 } },
            { content: fieldName, styles: { fontSize: 14 } },
            { content: `${field.time} min`, styles: { fontSize: 14 } },
          ]);
        }

        currentTime = currentTime.add(parseInt(field.time), "minutes");
        row++;
      }
    }

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${isPractice ? "Probenplan" : "Gottesdienst"} ${date}`, 14, 25);
    (doc as any).autoTable({
      head: hasConductors ? [[
        { content: "", styles: { fontSize: 14 } },
        { content: "Uhrzeit", styles: { fontSize: 14 } },
        { content: "Programmpunkt", styles: { fontSize: 14 } },
        { content: "Ausführung", styles: { fontSize: 14 } },
        { content: "Dauer", styles: { fontSize: 14 } },
      ]] : [[
        { content: "", styles: { fontSize: 14 } },
        { content: "Uhrzeit", styles: { fontSize: 14 } },
        { content: "Programmpunkt", styles: { fontSize: 14 } },
        { content: "Dauer", styles: { fontSize: 14 } },
      ]],
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (props.asBlob) {
      return doc.output("blob");
    } else {
      doc.save(`${isPractice ? "Probenplan" : "Gottesdienst"}_${date}.pdf`);
    }
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
      case Role.PARENT:
        return "/tabs/player";
      case Role.HELPER:
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
      case "/tabs/signout":
        return [Role.HELPER, Role.PLAYER, Role.APPLICANT].includes(role);
      case "/tabs/player":
        return [Role.ADMIN, Role.RESPONSIBLE, Role.VIEWER, Role.PARENT].includes(role);
      case "/tabs/settings/notifications":
        return [Role.ADMIN, Role.RESPONSIBLE, Role.HELPER, Role.PLAYER].includes(role);
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
      }
    ];

    if (type !== DefaultAttendanceType.GENERAL) {
      attendanceTypes.push({
        name: "Vortrag",
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
      });
    }

    attendanceTypes.push({
      name: "Sonstiges",
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

    const attendanceStartTime = dayjs(`${dayjs(attDate).format("YYYY-MM-DD")}T${attendanceStart}`);
    const attendanceEndTime = dayjs(`${dayjs(attDate).format("YYYY-MM-DD")}T${attendanceEnd}`);

    let currentDate;
    if (shiftName) {
      const matchingShift = shift.shifts.find(def => def.name === shiftName);
      if (matchingShift) {
        currentDate = dayjs(matchingShift.date);
      } else {
        throw new Error("Shift name not found in shift plan");
      }
    } else {
      currentDate = dayjs(shiftStart);
    }
    const endDate = dayjs(attDate).add(2, 'day');

    while (currentDate.isBefore(endDate)) {
      for (const def of shift.definition) {
        for (let i = 0; i < def.repeat_count; i++) {
          if (currentDate.isAfter(dayjs(attDate).subtract(2, 'day')) || currentDate.isSame(dayjs(attDate), 'day') || currentDate.isAfter(dayjs(attDate), 'day')) {
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
}
