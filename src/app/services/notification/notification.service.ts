import { Injectable, inject } from '@angular/core';
import { supabase } from '../base/supabase';
import { NotificationConfig } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { TrackingEvent, TrackingService } from '../tracking/tracking.service';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private tracking = inject(TrackingService);

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
        telegram_chat_id: '',
        birthdays: true,
        signins: true,
        signouts: true,
        updates: true,
        registrations: true,
        criticals: true,
        reminders: true,
        checklist: true,
        tasks: true,
        messages: true,
        push_enabled: false,
        push_and_telegram: false,
      };

      await supabase
        .from('notifications')
        .insert(newData as any);

      return newData;
    }

    if (data.enabled_tenants) {
      data.enabled_tenants = data.enabled_tenants.map(Number);
    }
    return data;
  }

  async updateNotificationConfig(config: NotificationConfig): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update(config as any)
      .eq('id', config.id);

    if (error) {
      Utils.showToast(translate('svc.updateConfigFailed'), 'danger');
      throw new Error(error.message);
    }

    this.tracking.track(TrackingEvent.NotificationSettingsChanged, {
      enabled: config.enabled,
      pushEnabled: config.push_enabled,
    });
    return;
  }

  async notifyPerTelegram(
    attId: string,
    type: string = 'signin',
    reason?: string,
    isParents: boolean = false,
    notes: string = ''
  ): Promise<void> {
    await supabase.functions.invoke('quick-processor', {
      body: {
        attId,
        type,
        reason,
        isParents,
        notes
      },
      method: 'POST',
    });
  }

  async sendPlanPerTelegram(blob: Blob, name: string, chatId: string, asImage: boolean = false): Promise<void> {
    const loading = await Utils.getLoadingElement(99999);
    await loading.present();
    const extension = asImage ? '.png' : '.pdf';
    const fileName: string = name + '_' + Math.floor(Math.random() * 100) + extension;

    const { error } = await supabase.storage
      .from('attendances')
      .upload(fileName, blob, { upsert: true, contentType: asImage ? 'image/png' : 'application/pdf' });

    if (error) {
      loading.dismiss();
      throw new Error(error.message);
    }

    const { data: urlData } = await supabase
      .storage
      .from('attendances')
      .getPublicUrl(fileName);

    const cleanName = (name || 'file')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim() || 'file';
    const publicUrl = `${urlData.publicUrl}?download=${encodeURIComponent(cleanName + extension)}`;

    const functionName = asImage ? 'send-photo' : 'send-document';
    const { error: sendError } = await supabase.functions.invoke(functionName, {
      body: {
        url: publicUrl,
        chat_id: chatId,
      },
      method: 'POST',
    });

    loading.dismiss();

    if (!sendError) {
      Utils.showToast(translate('svc.messageSent'));
    } else {
      Utils.showToast(translate('svc.sendMessageFailed'), 'danger');
    }

    window.setTimeout(async () => {
      await supabase.storage
        .from('attendances')
        .remove([fileName]);
    }, 10000);
  }

  async sendSongPerTelegram(url: string, chatId: string): Promise<void> {
    const { error: sendError } = await supabase.functions.invoke('send-document', {
      body: {
        url,
        sendAsUrl: !url.includes('.pdf'),
        chat_id: chatId,
      },
      method: 'POST',
    });

    if (!sendError) {
      Utils.showToast(translate('svc.messageSent'));
    } else {
      Utils.showToast(translate('svc.sendMessageFailed'), 'danger');
    }
  }
}
