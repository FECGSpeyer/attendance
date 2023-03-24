import { ToastController, LoadingController } from "@ionic/angular";
import * as dayjs from "dayjs";
import { environment } from "src/environments/environment";
import { DEFAULT_IMAGE, Role } from "./constants";
import { Attendance, AttendanceItem, FieldSelection, Instrument, Player } from "./interfaces";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';

export class Utils {
  public static getId(): number {
    return Math.floor(Math.random() * (999999999999 - 1000000000 + 1)) + 1000000000;
  }

  public static getModifiedPlayers(players: Player[], instruments: Instrument[]): Player[] {
    const instrumentsMap: { [props: number]: boolean } = {};

    return players.map((player: Player): Player => {
      let firstOfInstrument: boolean = false;
      let instrumentLength: number = 0;
      let isNew: boolean = false;

      if (!instrumentsMap[player.instrument]) {
        instrumentsMap[player.instrument] = true;
        firstOfInstrument = true;
        instrumentLength = players.filter((p: Player) => p.instrument === player.instrument).length;
      }

      if (dayjs().subtract(1, "month").isBefore(dayjs(player.joined)) && environment.shortName === "VoS") {
        isNew = true;
      }

      return {
        ...player,
        firstOfInstrument,
        instrumentLength,
        isNew,
        instrumentName: instruments.find((ins: Instrument) => ins.id === player.instrument).name,
        img: player.img || DEFAULT_IMAGE,
      }
    }).sort((a: Player, b: Player) => (a.instrumentName > b.instrumentName) ? 1 : ((b.instrumentName > a.instrumentName) ? -1 : 0));
  }

  public static getPercentage(attItem: AttendanceItem): number {
    const overallCount: number = Object.keys(attItem).length;
    let presentCount: number = 0;
    for (const p in attItem) {
      if (attItem[p]) {
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
      if (hasConductors) {
        data.push([
          { content: row.toString(), styles: { fontSize: 14 } },
          { content: field.name, styles: { fontSize: 14 } },
          { content: field.conductor || "", styles: { fontSize: 14 } },
          { content: `${field.time} min`, styles: { fontSize: 14 } },
          { content: `${currentTime.format("HH:mm")} Uhr`, styles: { fontSize: 14 } },
        ]);
      } else {
        data.push([
          { content: row.toString(), styles: { fontSize: 14 } },
          { content: field.name, styles: { fontSize: 14 } },
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

    const output: string = doc.output("datauristring");
    console.log(output);
    console.log(doc.canvas.getContext("2d"));

    //   doc.getPage(currentPage).then(function(page) {
    //     console.log("Printing:" + currentPage);
    //     var viewport = page.getViewport({scale});
    //     var canvas = document.createElement('canvas') , ctx = canvas.getContext('2d');
    //     var renderContext = { canvasContext: ctx, viewport: viewport };

    //     canvas.height = viewport.height;
    //     canvas.width = viewport.width;


    //     const mypage = page.render(renderContext)
    //     mypage.promise.then(function() {
    //         pages.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    //         heights.push(height);
    //         height += canvas.height;
    //         if (width < canvas.width) width = canvas.width;

    //         if (currentPage < pdf.numPages) {
    //             currentPage++;
    //             getPage();
    //         }
    //         else {
    //             draw();
    //         }
    //     });
    // });

    // if (props.asBlob) {
    return doc.output("blob");
    // } else {
    //   doc.save(`Probenplan_${date}.pdf`);
    // }
  }

  public static getUrl(role: Role) {
    let url: string;

    switch (role) {
      case Role.ADMIN:
      case Role.VIEWER:
        return "/tabs/player";
      case Role.HELPER:
        return "/tabs/attendance";
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
}