import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { NotificationConfig } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  async getNotificationConfig(userId: string): Promise<NotificationConfig> {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', userId)
      .single();

    if (!data) {
      const newData: NotificationConfig = {
        id: userId,
        created_at: new Date().toISOString(),
        enabled: false,
        telegram_chat_id: "",
        birthdays: true,
        signins: true,
        signouts: true,
        updates: true,
        registrations: true,
      };

      await supabase
        .from('notifications')
        .insert(newData);

      return newData;
    }

    return data;
  }

  async updateNotificationConfig(config: NotificationConfig): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update(config)
      .eq("id", config.id);

    if (error) {
      Utils.showToast("Fehler beim Updaten der Konfiguration, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }

    return;
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

  async sendPlanPerTelegram(blob: Blob, name: string, chatId: string): Promise<void> {
    const loading = await Utils.getLoadingElement(99999);
    await loading.present();
    const fileName: string = name + "_" + Math.floor(Math.random() * 100);

    const { error } = await supabase.storage
      .from("attendances")
      .upload(fileName, blob, { upsert: true });

    if (error) {
      loading.dismiss();
      throw new Error(error.message);
    }

    const { data: urlData } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(fileName);

    const { error: sendError } = await supabase.functions.invoke("send-document", {
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
}
