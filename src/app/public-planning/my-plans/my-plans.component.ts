import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { SharedPlan } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { getSupabase } from '../../services/base/supabase';

@Component({
  selector: 'app-my-plans',
  templateUrl: './my-plans.component.html',
  standalone: false,
})
export class MyPlansComponent implements OnInit {
  public plans: SharedPlan[] = [];
  public loading = true;

  constructor(
    private modalController: ModalController,
    private alertController: AlertController,
  ) {}

  async ngOnInit() {
    const { data: sessionData } = await getSupabase().auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      this.loading = false;
      return;
    }
    const { data } = await getSupabase()
      .from('shared_plans')
      .select('*')
      .eq('creator_user_id', userId)
      .order('created_at', { ascending: false });
    this.plans = (data as unknown as SharedPlan[]) || [];
    this.loading = false;
  }

  formatDate(plan: SharedPlan): string {
    if (!plan.date) { return ''; }
    return dayjs(plan.date).format('DD.MM.YYYY');
  }

  fieldCount(plan: SharedPlan): number {
    return plan.fields?.length ?? 0;
  }

  loadPlan(plan: SharedPlan) {
    this.modalController.dismiss({ plan }, 'load');
  }

  async deletePlan(plan: SharedPlan) {
    const alert = await this.alertController.create({
      header: 'Plan löschen',
      message: `"${plan.plan_title || 'Ablaufplan'}" endgültig löschen?`,
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            const { error } = await getSupabase()
              .from('shared_plans')
              .delete()
              .eq('id', plan.id);
            if (error) {
              Utils.showToast('Fehler beim Löschen', 'danger');
            } else {
              this.plans = this.plans.filter(p => p.id !== plan.id);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  dismiss() {
    this.modalController.dismiss(null, 'cancel');
  }
}
