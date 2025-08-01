import { ToastController, LoadingController, Platform } from "@ionic/angular";
import * as dayjs from "dayjs";
import { environment } from "src/environments/environment";
import { AttendanceStatus, DEFAULT_IMAGE, Role } from "./constants";
import { Attendance, FieldSelection, Instrument, Person, PersonAttendance, Player } from "./interfaces";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';

export class Utils {
  public static getId(): number {
    return Math.floor(Math.random() * (999999999999 - 1000000000 + 1)) + 1000000000;
  }

  public static getModifiedPlayersForList(players: Player[], instruments: Instrument[], attendances: Attendance[], mainGroup?: number): Player[] {
    const instrumentsMap: { [props: number]: boolean } = {};

    return players.sort((a: Player, b: Player) => {
      if (a.instrument === b.instrument) {
        return a.lastName.localeCompare(b.lastName);
      }

      // Sort by instrument but maingroup first
      if (a.instrumentName === b.instrumentName) {
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

      let percentage: number = 0;

      if (player.person_attendances && attendances?.length) {
        const personAttendancesTillNow = player.person_attendances.filter((personAttendance: PersonAttendance) => {
          const attendance = attendances.find((attendance: Attendance) => personAttendance.attendance_id === attendance.id);
          return attendance && dayjs(attendance.date).isBefore(dayjs().add(1, "day"));
        });
        percentage = Utils.getPercentage(personAttendancesTillNow);
        if (isNaN(percentage)) {
          percentage = 0;
        }
      }

      return {
        ...player,
        firstOfInstrument,
        instrumentLength,
        isNew,
        percentage,
        instrumentName: instruments.find((ins: Instrument) => ins.id === player.instrument).name,
        img: player.img || DEFAULT_IMAGE,
      }
    }).sort((a: Player, b: Player) => {
      // Sort by instrument but maingroup first
      if (a.instrumentName === b.instrumentName) {
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

    return persons.sort((a: PersonAttendance, b: PersonAttendance) => {
      if (a.instrument === b.instrument) {
        return a.person.lastName.localeCompare(b.person.lastName);
      }
      // Sort by instrument name but maingroup (only one exists) first
      if (a.instrumentName === b.instrumentName) {
        return 0;
      } else if (a.instrument === mainGroup) {
        return -1;
      } else if (b.instrument === mainGroup) {
        return 1;
      }
    }).map((player: PersonAttendance): PersonAttendance => {
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
    }).sort((a: PersonAttendance, b: PersonAttendance) => {
      // Sort by instrument but maingroup first
      if (a.instrumentName === b.instrumentName) {
        return 0;
      } else if (a.instrument === mainGroup) {
        return -1;
      } else if (b.instrument === mainGroup) {
        return 1;
      }
    });
  }

  public static getModifiedAttendanceData(attendance: Attendance): Attendance {
    attendance.persons = attendance.persons.map((person: PersonAttendance): PersonAttendance => {
      return {
        ...person,
        img: person.img || DEFAULT_IMAGE,
        instrument: (person.person.instrument as any).id,
        instrumentName: (person.person.instrument as any).name,
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
      if (p.status === AttendanceStatus.Present || p.status === AttendanceStatus.Late) {
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

  public static getPlayerHistoryTypeText(key: number) {
    switch (key) {
      case 1:
        return "Pausiert";
      case 2:
        return "Unentschuldigt";
      case 3:
        return "Fehlt oft";
      default:
        return "Sonstiges";
    }
  }

  public static getTypeText(key: string): string {
    switch (key) {
      case "uebung":
        return "Übung";
      case "vortrag":
        return "Vortrag";
      case "hochzeit":
        return "Hochzeit";
      default:
        return "Sonstiges";
    }
  }

  public static async showToast(message: string, color: string = "success", duration: number = 1500): Promise<void> {
    const toast: HTMLIonToastElement = await new ToastController().create({
      message, color,
      position: "top",
      duration,
    });

    return await toast.present();
  }

  public static validateEmail(email: string): boolean {
    // tslint:disable-next-line: max-line-length
    const regexp: any = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);

    return regexp.test(email);
  }

  public static async getLoadingElement(duration: number = 3000) {
    return await new LoadingController().create({ duration });
  }

  public static getAttendanceText(attendance: Attendance): string {
    return attendance.typeInfo ? attendance.typeInfo : attendance.type === "vortrag" ? "Vortrag" : "";
  }

  public static createPlanExport(props: any) {
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

      if (hasConductors) {
        data.push([
          { content: row.toString(), styles: { fontSize: 14 } },
          { content: fieldName, styles: { fontSize: 14 } },
          { content: field.conductor || "", styles: { fontSize: 14 } },
          { content: `${field.time} min`, styles: { fontSize: 14 } },
          { content: `${currentTime.format("HH:mm")} Uhr`, styles: { fontSize: 14 } },
        ]);
      } else {
        data.push([
          { content: row.toString(), styles: { fontSize: 14 } },
          { content: fieldName, styles: { fontSize: 14 } },
          { content: `${field.time} min`, styles: { fontSize: 14 } },
          { content: `${currentTime.format("HH:mm")} Uhr`, styles: { fontSize: 14 } },
        ]);
      }
      currentTime = currentTime.add(parseInt(field.time), "minutes");
      row++;
    }

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Probenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: hasConductors ? [[
        { content: "", styles: { fontSize: 14 } },
        { content: "Werk", styles: { fontSize: 14 } },
        { content: "Dirigent", styles: { fontSize: 14 } },
        { content: "Dauer", styles: { fontSize: 14 } },
        { content: "Uhrzeit", styles: { fontSize: 14 } },
      ]] : [[
        { content: "", styles: { fontSize: 14 } },
        { content: "Werk", styles: { fontSize: 14 } },
        { content: "Dauer", styles: { fontSize: 14 } },
        { content: "Uhrzeit", styles: { fontSize: 14 } },
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
      doc.save(`Probenplan_${date}.pdf`);
    }
  }

  public static getUrl(role: Role) {
    switch (role) {
      case Role.ADMIN:
      case Role.RESPONSIBLE:
      case Role.VIEWER:
        return "/tabs/player";
      case Role.HELPER:
        return "/tabs/signout";
      case Role.NONE:
        return "/login";
      default:
        return "/signout";
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
      case AttendanceStatus.LateExcused:
        attText = 'E';
        break;
      case AttendanceStatus.Late:
        attText = 'L';
        break;
      case AttendanceStatus.Absent:
        attText = 'A';
        break;
    }

    return attText;
  }
}