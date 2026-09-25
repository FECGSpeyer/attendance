import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular/lazy';
import { HelpContentService } from 'src/app/services/help/help-content.service';
import { GlossaryTerm, HelpArticle, HelpCategory } from './content';

@Component({
  selector: 'app-help',
  templateUrl: './help.page.html',
  styleUrls: ['./help.page.scss'],
  standalone: false
})
export class HelpPage implements OnInit {
  public categories: HelpCategory[] = [];
  public articlesByCategory = new Map<string, HelpArticle[]>();

  public searchTerm = '';
  public searchResults: { articles: HelpArticle[]; glossaryTerms: GlossaryTerm[] } | null = null;

  constructor(
    private helpContent: HelpContentService,
    private navController: NavController,
  ) {}

  ngOnInit(): void {
    this.categories = this.helpContent.getCategories();
    for (const category of this.categories) {
      this.articlesByCategory.set(category.id, this.helpContent.getArticlesByCategory(category.id));
    }
  }

  search(event: CustomEvent): void {
    this.searchTerm = (event.detail as { value?: string }).value ?? '';
    const term = this.searchTerm.trim();
    this.searchResults = term ? this.helpContent.search(term) : null;
  }

  openArticle(articleId: string): void {
    this.navController.navigateForward(`/tabs/settings/help/article/${articleId}`);
  }

  openGlossary(): void {
    this.navController.navigateForward('/tabs/settings/help/glossary');
  }

  navigateBack(): void {
    this.navController.navigateBack('/tabs/settings');
  }
}
