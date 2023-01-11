import { ToastController, LoadingController } from "@ionic/angular";
import * as dayjs from "dayjs";
import { environment } from "src/environments/environment";
import { Attendance, AttendanceItem, Instrument, Player } from "./interfaces";

export class Utils {
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

      if (dayjs().subtract(2, "month").isBefore(dayjs(player.joined)) && environment.shortName === "VoS") {
        isNew = true;
      }

      return {
        ...player,
        firstOfInstrument,
        instrumentLength,
        isNew,
        instrumentName: instruments.find((ins: Instrument) => ins.id === player.instrument).name,
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
}