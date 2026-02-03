import { Injectable } from '@angular/core';
import * as dayjs from 'dayjs';
import { Holiday } from 'open-holiday-js';

@Injectable({
  providedIn: 'root'
})
export class HolidayService {

  async getHolidays(region: string): Promise<{
    publicHolidays: any[];
    schoolHolidays: any[];
  }> {
    const holiday = new Holiday();
    const start = dayjs().startOf("year").toDate();
    const end = dayjs().add(1, "year").endOf("year").toDate();

    const publicHolidays = (await holiday.getPublicHolidays("DE", start, end, `DE-${region}`)).map((h) => {
      return {
        ...h,
        gone: dayjs(h.startDate).isBefore(dayjs(), 'day'),
      };
    });

    const schoolHolidays = (await holiday.getSchoolHolidays("DE", start, end, `DE-${region}`, "DE")).map((h) => {
      return {
        ...h,
        gone: dayjs(h.startDate).isBefore(dayjs(), 'day'),
      };
    });

    return { publicHolidays, schoolHolidays };
  }
}
