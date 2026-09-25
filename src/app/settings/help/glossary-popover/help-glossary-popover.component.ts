import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { GlossaryTerm } from '../content';
import { renderGlossaryDefinitionHtml } from '../help-markdown.util';

@Component({
  selector: 'app-help-glossary-popover',
  templateUrl: './help-glossary-popover.component.html',
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class HelpGlossaryPopoverComponent {
  @Input() term: GlossaryTerm;

  get definitionHtml(): string {
    return renderGlossaryDefinitionHtml(this.term.definition);
  }
}
