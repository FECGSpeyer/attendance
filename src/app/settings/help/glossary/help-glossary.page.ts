import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular/lazy';
import { HelpContentService } from 'src/app/services/help/help-content.service';
import { GlossaryTerm } from '../content';
import { renderGlossaryDefinitionHtml } from '../help-markdown.util';

@Component({
  selector: 'app-help-glossary',
  templateUrl: './help-glossary.page.html',
  styleUrls: ['./help-glossary.page.scss'],
  standalone: false
})
export class HelpGlossaryPage implements OnInit {
  public allTerms: GlossaryTerm[] = [];
  public filteredTerms: GlossaryTerm[] = [];
  public searchTerm = '';

  constructor(
    private helpContent: HelpContentService,
    private navController: NavController,
  ) {}

  ngOnInit(): void {
    this.allTerms = this.helpContent.getAllGlossaryTerms();
    this.filteredTerms = this.allTerms;
  }

  search(event: CustomEvent): void {
    this.searchTerm = ((event.detail as { value?: string }).value ?? '').trim().toLowerCase();
    this.filteredTerms = !this.searchTerm
      ? this.allTerms
      : this.helpContent.search(this.searchTerm).glossaryTerms;
  }

  definitionHtml(term: GlossaryTerm): string {
    return renderGlossaryDefinitionHtml(term.definition);
  }

  navigateBack(): void {
    this.navController.navigateBack('/tabs/settings/help');
  }
}
