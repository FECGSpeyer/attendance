import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class TelegramService {

  private encodeFilename(name: string, extension: string): string {
    const sanitizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();

    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${sanitizedName || 'file'}_${randomNumber}${extension}`;
  }

  async sendPlanPerTelegram(blob: Blob, name: string, chatId: string, asImage: boolean = false): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999);
    await loading.present();
    const extension = asImage ? '.png' : '.pdf';
    const fileName: string = this.encodeFilename(name, extension);

    const { error } = await supabase.storage
      .from("attendances")
      .upload(fileName, blob, { upsert: true, contentType: asImage ? 'image/png' : 'application/pdf' });

    if (error) {
      loading.dismiss();
      throw new Error(error.message);
    }

    const { data: urlData } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(fileName);

    const functionName = asImage ? "send-photo" : "send-document";
    const { error: sendError } = await supabase.functions.invoke(functionName, {
      body: {
        url: urlData.publicUrl,
        chat_id: chatId,
      },
      method: "POST",
    });

    loading.dismiss();

    if (!sendError) {
      Utils.showToast("Nachricht wurde erfolgreich gesendet!");
    } else {
      Utils.showToast("Fehler beim Senden der Nachricht, versuche es später erneut!", "danger");
    }

    window.setTimeout(async () => {
      await supabase.storage
        .from("attendances")
        .remove([fileName]);
    }, 10000);
  }

  async sendSongPerTelegram(url: string, chatId: string): Promise<void> {
    const { error: sendError } = await supabase.functions.invoke("send-document", {
      body: {
        url: url,
        sendAsUrl: !url.includes(".pdf"),
        chat_id: chatId,
      },
      method: "POST",
    });

    if (!sendError) {
      Utils.showToast("Nachricht wurde erfolgreich gesendet!");
    } else {
      Utils.showToast("Fehler beim Senden der Nachricht, versuche es später erneut!", "danger");
    }
  }

  async notifyPerTelegram(
    attId: string,
    type: string = "signin",
    reason?: string,
    isParents: boolean = false,
    notes: string = ""
  ): Promise<void> {
    await supabase.functions.invoke("quick-processor", {
      body: {
        attId,
        type,
        reason,
        isParents,
        notes
      },
      method: "POST",
    });
  }
}
