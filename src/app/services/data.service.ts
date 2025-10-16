import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private handoverData: { [key: string]: any };

  constructor() { }

  setHandoverData(data: any) {
    this.handoverData = data;
  }

  getHandoverData(): any {
    return this.handoverData;
  }
}
