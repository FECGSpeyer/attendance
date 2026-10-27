import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {

  async sendQuestion(message: string, phone: string, tenantId: number, userId?: string): Promise<void> {
    const { error } = await supabase
      .from('questions')
      .insert({
        message,
        phone,
        tenant_id: tenantId,
        user_id: userId,
      });

    if (error) {
      Utils.showToast(translate('svc.sendQuestionFailed'), 'danger');
      throw error;
    }
  }

  async sendFeedback(
    message: string,
    rating: number,
    anonymous: boolean,
    phone: string,
    tenantId?: number,
    userId?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('feedback')
      .insert({
        message,
        rating,
        anonymous,
        phone,
        tenant_id: anonymous ? null : tenantId,
        user_id: anonymous ? null : userId,
      });

    if (error) {
      Utils.showToast(translate('svc.sendFeedbackFailed'), 'danger');
      throw error;
    }
  }
}
