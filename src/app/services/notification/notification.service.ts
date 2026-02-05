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
        criticals: true,
        reminders: true,
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

  async sendPlanPerTelegram(blob: Blob, name: string, chatId: string, asImage: boolean = false): Promise<void> {
    const loading = await Utils.getLoadingElement(99999);
    await loading.present();
    const extension = asImage ? '.png' : '.pdf';
    const fileName: string = name + "_" + Math.floor(Math.random() * 100) + extension;

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

  /**
   * Send a reminder notification via Telegram for an attendance
   * @param chatId Telegram chat ID
   * @param attendanceTypeName Name of the attendance type
   * @param attendanceDate Formatted date string (e.g., "05.02.2026")
   * @param attendanceTime Formatted time string (e.g., "19:30")
   * @param reminderHoursAhead Hours before the attendance
   */
  async sendReminderNotification(
    chatId: string,
    attendanceTypeName: string,
    attendanceDate: string,
    attendanceTime: string,
    reminderHoursAhead: number
  ): Promise<void> {
    const reminderText = reminderHoursAhead === 0 
      ? 'jetzt'
      : reminderHoursAhead === 1
      ? 'in 1 Stunde'
      : reminderHoursAhead < 24
      ? `in ${reminderHoursAhead} Stunden`
      : `in ${Math.floor(reminderHoursAhead / 24)} Tag(en)`;

    const message = `⏰ *Terminerinnerung*\n\n${reminderText}:\n\n📋 ${attendanceTypeName}\n📅 ${attendanceDate}\n🕐 ${attendanceTime}`;

    const telegramToken = (await supabase.functions.invoke("get-env", {
      body: { key: "TELEGRAM_BOT_TOKEN" },
    })).data?.value || Deno.env.get('TELEGRAM_BOT_TOKEN');

    // This will be called from Edge Function, so we'll use a direct approach
    // The actual sending happens in the edge function
  }
}
