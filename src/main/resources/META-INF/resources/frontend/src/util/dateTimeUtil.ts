import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

export class DateTimeConstants {
  static readonly DAYS_IN_WEEK: number = 7;
  static readonly HOURS_IN_DAY: number = 24;
  static readonly DAY_INTERVAL: number = 24 * 60 * 60 * 1000;
  static readonly HOUR_INTERVAL: number = 60 * 60 * 1000;
}

export function atEndOfDay(date: Date): Date {
  let endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

export function atStartOfDay(date: Date): Date {
  let startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

export function atEndOfHour(date: Date): Date {
  let endOfHour = new Date(date);
  endOfHour.setMinutes(59, 59, 999);
  return endOfHour;
}

export function atStartOfHour(date: Date): Date {
  let startOfHour = new Date(date);
  startOfHour.setMinutes(0, 0, 0);
  return startOfHour;
}

/** Clears Daylight saving time adjustment from the given time. */
export function toNormalDate(zonedDate: Date, adjustment: number): Date {
  return new Date(zonedDate.getTime() - adjustment);
}

export function adjustToMiddleOfDay(zonedDate: Date, timeZone: string): Date {
  let hourStr: string = format(zonedDate, "HH", { timeZone: timeZone });
  let h: number = parseInt(hourStr);
  let addHours: number = 12 - h;
  return new Date(zonedDate.getTime() + (addHours * DateTimeConstants.HOUR_INTERVAL));
}

export function getDSTAdjustedDate(previousIsDST: boolean, zonedDate: Date, dstAdjustment: number): Date {
  // adjusts previously without dst adjusted date by dst
  // ((date + interval) - dst )
  // Note! intervals that are less or equal to dst are not supported
  // currently.
  let isDST: boolean = dstAdjustment > 0;
  if (previousIsDST && !isDST) {
    // previously added interval is shorter than the real interval.
    // with 24h interval and 1h dst: real interval is 25h.
    return new Date(zonedDate.getTime() + dstAdjustment);
  } else if (!previousIsDST && isDST) {
    // previously added interval is longer than the real interval.
    // with 24h interval and 1h dst: real interval is 23h.
    return new Date(zonedDate.getTime() - dstAdjustment);
  }
  return zonedDate;
}

/**
 * Calculate week number for the given date.
 *
 * @param d
 *            Target date
 * @param timezoneOffset
 *            Time zone offset in milliseconds
 * @param firstDayOfWeek
 *            First day of week. Integer between 1-7. 1 is Sunday.
 * @return Week number
 */
export function getWeekNumber(d: Date, timezoneOffset: number, firstDayOfWeek: number): number {
    /*
     * Thanks to stackoverflow.com for a easy function to calculate week
     * number. See
     * http://stackoverflow.com/questions/6117814/get-week-of-year
     * -in-javascript-like-in-php
     */
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let daysToTursday: number;
    if (firstDayOfWeek == 1) {
        daysToTursday = 4 - d.getDay();
    } else {
        daysToTursday = 4 - ((d.getDay() == 0) ? 7 : d.getDay());
    }
    d.setDate(d.getDate() + daysToTursday);
    let yearStart: Date = new Date(d.getFullYear(), 0, 1);
    let weekNo: number = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000.0) + 1.0) / 7.0);
    return weekNo;
}