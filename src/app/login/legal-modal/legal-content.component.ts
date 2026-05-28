import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { LegalService } from '../../services/legal/legal.service';

@Component({
  selector: 'app-legal-content',
  templateUrl: './legal-content.component.html',
  styleUrls: ['./legal-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class LegalContentComponent implements OnInit {
  private legalService = inject(LegalService);

  content = signal<string | null>(null);
  error = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.content.set(await this.legalService.getLegalContent());
    } catch {
      this.error.set(true);
    }
  }
}
