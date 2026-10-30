import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';
import { BeamerFile, FieldSelection } from '../../utilities/interfaces';
import { autoNeedsBeamer } from '../../utilities/plan-beamer';

export interface PlanFieldEditResult {
  name: string;
  conductor: string;
  info?: string;
  time: string;
  /** undefined = follows the automatic rule. */
  needsBeamer?: boolean;
}

/** "Feld bearbeiten" for a Programmpunkt; replaces the former alert so it can hold the Beamer switch. */
@Component({
  selector: 'app-plan-field-edit',
  templateUrl: './plan-field-edit.component.html',
  styleUrls: ['./plan-field-edit.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslocoModule],
})
export class PlanFieldEditComponent implements OnInit {
  @Input() field: FieldSelection;
  /** Beamer section only on ORG plans of linked orgs (see plan-beamer.ts). */
  @Input() showBeamer = false;

  name = '';
  conductor = '';
  info = '';
  time: number | null = 20;
  showNameError = false;
  /** Value switched by hand; undefined while the automatic rule applies. */
  manualBeamer?: boolean;
  beamerFile?: BeamerFile;

  constructor(private modalController: ModalController) { }

  ngOnInit() {
    this.name = this.field.name ?? '';
    this.conductor = this.field.conductor ?? '';
    this.info = this.field.info ?? '';
    this.time = this.field.time ? Number(this.field.time) : 20;
    this.manualBeamer = this.field.needsBeamer;
    this.beamerFile = this.field.beamerFile;
  }

  get autoBeamer(): boolean {
    return autoNeedsBeamer({ name: this.name, songId: this.field.songId });
  }

  get beamerOn(): boolean {
    return this.manualBeamer ?? this.autoBeamer;
  }

  /** Why the switch is on by itself: "Werk" or the word found in the title. */
  get autoReason(): { song: boolean; word?: string } | null {
    if (this.manualBeamer !== undefined || !this.autoBeamer) { return null; }
    if (this.field.songId) { return { song: true }; }
    return { song: false, word: /gedicht/i.test(this.name) && !/lied/i.test(this.name) ? 'Gedicht' : 'Lied' };
  }

  setBeamer(on: boolean) {
    if (on !== this.beamerOn) {
      this.manualBeamer = on;
    }
  }

  cancel() {
    this.modalController.dismiss(null, 'cancel');
  }

  save() {
    const name = this.name?.trim();
    if (!name) {
      this.showNameError = true;
      return;
    }
    const result: PlanFieldEditResult = {
      name,
      conductor: this.conductor ?? '',
      info: this.info?.trim() || undefined,
      time: this.time ? String(this.time) : this.field.time,
      needsBeamer: this.showBeamer ? this.manualBeamer : this.field.needsBeamer,
    };
    this.modalController.dismiss(result, 'save');
  }
}
