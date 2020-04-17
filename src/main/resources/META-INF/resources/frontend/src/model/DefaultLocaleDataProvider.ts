import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

export class DefaultLocaleDataProvider implements ILocaleDataProvider {

    public locale: string = "en-US";
    public timeZone: string = "Europe/London";
    public twelveHourClock: boolean = false;
    public firstDayOfWeek: number = 1; // sunday
    public monthNames: string[] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    public weekDayNames: string[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    constructor(locale: string, timeZone: string, firstDayOfWeek: number, twelveHourClock: boolean) {
        this.locale = locale;
        this.timeZone = timeZone;
        this.firstDayOfWeek = firstDayOfWeek;
        this.twelveHourClock = twelveHourClock;
    }

    getMonthNames(): string[] {
        return this.monthNames;
    }
    getWeekdayNames(): string[] {
        return this.weekDayNames;
    }
    getFirstDayOfWeek(): number {
        return this.firstDayOfWeek + 1;
    }
    formatDate(date: Date, pattern: string): string {
        return format(date, pattern, { timeZone: this.getTimeZone() });
    }
    isTwelveHourClock(): boolean {
        return this.twelveHourClock;
    }
    getLocale(): string {
        return this.locale;
    }
    getTimeZone(): string {
        return this.timeZone;
    }
    getDaylightAdjustment(zonedDate: Date): number {
        let jan = new Date(`${zonedDate.getFullYear()}-01-01T00:00:00Z`);
        let jul = new Date(`${zonedDate.getFullYear()}-07-01T00:00:00Z`);
        let janOffset = this.getTimezoneOffset(jan);
        let julOffset = this.getTimezoneOffset(jul);
        if(janOffset !== julOffset) {
            let maxOffset = Math.max(janOffset, julOffset);
            let targetOffset = this.getTimezoneOffset(zonedDate);
            if(targetOffset < maxOffset) {
                // This is Daylight saving time
                let minOffset = Math.min(janOffset, julOffset);
                return maxOffset - minOffset;
            }
        }
        return 0;
    }
    isDaylightTime(zonedDate: Date): boolean {
        let jan = new Date(`${zonedDate.getFullYear()}-01-01T00:00:00Z`);
        let jul = new Date(`${zonedDate.getFullYear()}-07-01T00:00:00Z`);
        let janOffset = this.getTimezoneOffset(jan);
        let julOffset = this.getTimezoneOffset(jul);
        if(janOffset !== julOffset) {
            let maxOffset = Math.max(janOffset, julOffset);
            let targetOffset = this.getTimezoneOffset(zonedDate);
            return targetOffset < maxOffset;
        }
        return false;
    }
    getTimezoneOffset(zonedDate: Date): number {
        let offset: string = format(zonedDate, "xxx", { timeZone: this.getTimeZone() }); // like "+01:00"
        if (offset && offset.length === 6) {
            let hour = offset[1] + offset[2];
            if(hour === '24') {
                hour = '00';
            }
            let tzOffset = (parseInt(hour) * 60) + parseInt(offset[4] + offset[5]);
            if (offset[0] === '-') {
                tzOffset = -1*tzOffset;
            }
            return tzOffset * 60000;
        }
        return 0;
    }
}