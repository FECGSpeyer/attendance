import { Pipe, PipeTransform } from '@angular/core';
import { FieldSelection } from '../utilities/interfaces';
import { groupDuration, isGroupHead } from '../utilities/plan-groups';

/** Minutes shown for a plan field: a Programmblock head shows the sum of its Unterpunkte. */
@Pipe({ name: 'planMinutes', standalone: true })
export class PlanMinutesPipe implements PipeTransform {
  transform(field: FieldSelection, fields: FieldSelection[] | null | undefined): string {
    return isGroupHead(field) ? String(groupDuration(fields ?? [], field.id)) : field.time;
  }
}
