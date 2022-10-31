import { ToastController } from "@ionic/angular";
import * as dayjs from "dayjs";
import { AttendanceItem, Instrument, Player } from "./interfaces";

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

      if (dayjs().subtract(2, "month").isBefore(dayjs(player.joined))) {
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
        return "Altschlüssel (C)";
      case 'g':
        return "Violinschlüssel (G)";
      case 'f':
        return "Bassschlüssel (F)"
      default:
        throw new Error("unknown clef key")
    }
  }

  public static async showToast(message: string, color: string = "success"): Promise<void> {
    const toast: HTMLIonToastElement = await new ToastController().create({
      message, color,
      position: "top"
    });

    return await toast.present();
  }

}