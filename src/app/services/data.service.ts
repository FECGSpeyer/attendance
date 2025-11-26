import { Injectable } from '@angular/core';
import { Player, Tenant } from 'src/app/utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private handoverData: { persons: Player[], stayInInstance: boolean, tenant: Tenant };

  constructor() { }

  setHandoverData(data: { persons: Player[], stayInInstance: boolean, tenant: Tenant }) {
    this.handoverData = data;
  }

  getHandoverData(): { persons: Player[], stayInInstance: boolean, tenant: Tenant } {
    return this.handoverData;
  }

}
