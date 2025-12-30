import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { DbService } from 'src/app/services/db.service';

@Injectable({
  providedIn: 'root'
})
export class AiService {

  constructor(
    private db: DbService
  ) { }

  async getGroupSynonyms(group: string) {
    const { data } = await this.db.getSupabase().functions.invoke("synonyms-gpt", {
      body: {
        group,
      },
      method: "POST",
    });

    return data;
  }
}
