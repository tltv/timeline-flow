interface ILocaleDataProvider {

  /**
   * Returns month names in order starting from January.
   *
   * @return Locale dependent month names
   */
  getMonthNames(): string[];

  /**
   * Returns weekdays in order starting from Sunday.
   *
   * @return Locale dependent weekday names
   */
  getWeekdayNames(): string[];

  /**
   * Returns first day of week. Allowed values are 1-7. 1 is Sunday.
   *
   * @return Integer between 1-7.
   */
  getFirstDayOfWeek(): number;

  /**
   * Format zoned date to String.
   *
   * @param date
   *            Date to format (Expected to be in same TimeZone as
   *            {@link #getTimeZone()}).
   * @param format
   *            Pattern of the date format. Like MMM or MMMM.
   * @return Formatted date
   */
  formatDate(date: Date, format: string): string;

  /**
   * Returns true, if active locale uses twelve hour clock.
   *
   * @return true if 12h clock. False if 24h clock.
   */
  isTwelveHourClock(): boolean;

  /**
   * Get currently active locale id. See {@link Locale#toString()}.
   *
   * @return Locale
   */
  getLocale(): string;

  /**
   * Get currently active time-zone.
   */
  getTimeZone(): string;

  /** Get daylight saving time adjustment in milliseconds for the target date. */
  getDaylightAdjustment(zonedDate: Date): number;

  isDaylightTime(zonedDate: Date): boolean;
}
