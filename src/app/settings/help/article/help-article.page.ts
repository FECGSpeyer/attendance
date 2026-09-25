import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NavController, PopoverController } from '@ionic/angular/lazy';
import { HelpContentService } from 'src/app/services/help/help-content.service';
import { HelpArticle } from '../content';
import { renderArticleHtml } from '../help-markdown.util';
import { HelpGlossaryPopoverComponent } from '../glossary-popover/help-glossary-popover.component';

@Component({
  selector: 'app-help-article',
  templateUrl: './help-article.page.html',
  styleUrls: ['./help-article.page.scss'],
  standalone: false
})
export class HelpArticlePage implements OnInit {
  public article: HelpArticle | undefined;
  public bodyHtml = '';

  constructor(
    private route: ActivatedRoute,
    private navController: NavController,
    private helpContent: HelpContentService,
    private popoverController: PopoverController,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.article = id ? this.helpContent.getArticle(id) : undefined;
    this.bodyHtml = this.article ? renderArticleHtml(this.article.body) : '';
  }

  // Event delegation: markdown body is rendered via [innerHTML], so glossary
  // links can't have (click) bindings attached directly.
  async onBodyClick(event: MouseEvent): Promise<void> {
    const target = (event.target as HTMLElement).closest('.glossary-term') as HTMLAnchorElement | null;
    if (!target) { return; }
    event.preventDefault();

    const href = target.getAttribute('href') ?? '';
    const termName = href.startsWith('#') ? decodeURIComponent(href.slice(1)) : '';
    const term = termName ? this.helpContent.findGlossaryTermByName(termName) : undefined;
    if (!term) { return; }

    const popover = await this.popoverController.create({
      component: HelpGlossaryPopoverComponent,
      componentProps: { term },
      event,
      translucent: true,
      cssClass: 'help-glossary-popover',
    });
    await popover.present();
  }

  navigateBack(): void {
    this.navController.navigateBack('/tabs/settings/help');
  }
}
