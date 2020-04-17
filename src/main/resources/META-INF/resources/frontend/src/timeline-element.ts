import { LitElement, html, css, property, customElement } from 'lit-element';
import { zonedTimeToUtc, utcToZonedTime, toDate, format } from 'date-fns-tz'
import { Resolution } from './model/Resolution';
import { Weekday } from './model/Weekday';
import { BlockRowData } from './model/blockRowData';
import './model/ILocaleDataProvider.ts';
import './model/IResolutionBlockFiller.ts';
import './model/IResolutionBlockRegisterer.ts';
import * as DateUtil from './util/dateTimeUtil';
import { DateTimeConstants } from './util/dateTimeUtil';
import * as ElementUtil from './util/elementUtil';
import { DefaultLocaleDataProvider } from './model/DefaultLocaleDataProvider';
import { parse, getISOWeek } from 'date-fns';

/**
 * Scalable timeline web component that supports more than one
 * resolutions ({@link Resolution}). When timeline element doesn't overflow
 * horizontally in it's parent element, it scales the content width up to fit in
 * the space available.
 * <p>
 * When this component scales up, all widths are calculated as percentages.
 * Pixel widths are used otherwise. Some browsers may not support percentages
 * accurately enough, and for those it's best to call
 * {@link #setAlwaysCalculatePixelWidths(boolean)} with 'true' to disable
 * percentage values.
 * <p>
 * There's always a minimum width calculated and updated to the timeline
 * element. Percentage values set some limitation for the component's width.
 * Wider the component (&gt; 4000px), bigger the chance to get year, month and
 * date blocks not being vertically in-line with each others.
 * <p>
 * Supports setting a scroll left position.
 * <p>
 * After construction, attach the component to it's parent and call update
 * method with a required parameters and the timeline is ready. After that, all
 * widths are calculated and all other API methods available can be used safely.
 *
 */
@customElement('timeline-element')
class TimelineElement extends LitElement {

  private static readonly STYLE_TIMELINE: string =  "timeline";
  private static readonly  STYLE_ROW: string =      "row";
  private static readonly STYLE_COL: string =       "col";
  private static readonly STYLE_MONTH: string =     "month";
  private static readonly STYLE_YEAR: string =      "year";
  private static readonly STYLE_DAY: string =       "day";
  private static readonly STYLE_WEEK: string =      "w";
  private static readonly STYLE_RESOLUTION: string = "resolution";
  private static readonly STYLE_WEEK_FIRST: string = "week-f";
  private static readonly STYLE_WEEK_LAST: string = "week-l";
  private static readonly STYLE_WEEK_MIDDLE: string = "week-m";
  private static readonly STYLE_EVEN: string =      "even";
  private static readonly STYLE_WEEKEND: string =   "weekend";
  private static readonly STYLE_SPACER: string =    "spacer";
  private static readonly STYLE_FIRST: string =     "f-col";
  private static readonly STYLE_CENTER: string =    "c-col";
  private static readonly STYLE_LAST: string =      "l-col";
  private static readonly STYLE_MEASURE: string =   "measure";

  private readonly resolutionWeekDayblockWidth: number = 4;

  @property({ 
    reflect: true,
    converter: {
      fromAttribute: (value: string, type) => { 
        return <any>Resolution[<any>value];
      },
      toAttribute: (value: Resolution, type) => { 
        return <any>Resolution[value];
      }
    }
  }) 
  public resolution: Resolution = Resolution.Day;
  /* Inclusive start Date (millisecond accuracy) */
  @property({ 
    reflect: true,
    converter: {
      fromAttribute: (value: string, type) => { 
        return toDate(value);
      },
      toAttribute: (value: Date, type) => { 
        return format(value, "yyyy-MM-dd'T'HH:mm:ss");
      }
    } 
  }) 
  public startDateTime: Date;
  /* Inclusive end Date (millisecond accuracy) */
  @property({ 
    reflect: true, 
    converter: {
      fromAttribute: (value: string, type) => { 
        return toDate(value);
      },
      toAttribute: (value: Date, type) => { 
        return format(value, "yyyy-MM-dd'T'HH:mm:ss");
      }
    } 
  }) 
  public endDateTime: Date;
  @property({ reflect: true}) 
  public timeZone: string = "Europe/London";
  @property({ reflect: true}) 
  public locale: string = "en-US";
  @property({ reflect: true}) firstDayOfWeek: number = 1; // sunday;
  @property({ reflect: true }) twelveHourClock: boolean = false;

  @property() minWidth: number;

  @property() normalStartDate: Date;
  @property() normalEndDate: Date;
  @property() lastDayOfWeek: number;
  /* First day of the whole range. Allowed values are 1-7. 1 is Sunday. Required with {@link Resolution#Week}. */
  @property() firstDayOfRange: number;
  /* First hour of the range. Allowed values are 0-23. Required with {@link Resolution#Hour}. */
  @property() firstHourOfRange: number;
  @property({ reflect: true }) scrollContainerId: string;

  @property() monthRowVisible: boolean = true;
  @property() yearRowVisible: boolean = true;

  @property() monthNames: string[];
  @property() weekdayNames: string[];

  private localeDataProvider: ILocaleDataProvider;

  /*
   * number of blocks in resolution range. Days for Day/Week resolution, Hours
   * for hour resolution..
   */
  private blocksInRange: number = 0;
  /*
   * number of elements in resolution range. Same as blocksInRange for
   * Day/Hour resolution. blocksInRange / 7 for Week resolution.
   */
  private resolutionBlockCount: number = 0;
  private firstResBlockCount: number = 0;
  private lastResBlockCount: number = 0;
  private firstDay: boolean;
  private timelineOverflowingHorizontally: boolean;
  private noticeVerticalScrollbarWidth: boolean;
  private monthFormat: string;
  private yearFormat: string;
  private weekFormat: string;
  private dayFormat: string;

  /*
   * resolutionDiv contains the resolution specific elements that represents a
   * timeline's sub-parts like hour, day or week.
   */
  private resolutionDiv: HTMLDivElement;
  private resSpacerDiv: HTMLDivElement;
  private spacerBlocks: HTMLDivElement[] = [];

  private yearRowData: BlockRowData = new BlockRowData();
  private monthRowData: BlockRowData = new BlockRowData();
  // days/daysLength are needed only with resolutions smaller than Day.
  private dayRowData: BlockRowData = new BlockRowData();

  /*
     * Currently active widths. Updated each time when timeline column widths
     * are updated.
     */
  private dayWidthPercentage: number = 0;
  private dayOrHourWidthPx: number = 0;
  private resBlockMinWidthPx: number = 0;
  private resBlockWidthPx: number = 0;
  private resBlockWidthPercentage: number = 0;

  private minResolutionWidth: number = -1;
  private calcPixels: boolean = false;
  private positionLeft: number = 0;

  private setPositionForEachBlock: boolean = false;

  private firstWeekBlockHidden: boolean = false;

  private ie: boolean = false; // deprecated property

  private lazyResolutionPaint: any;

  /* directlyInsideScrollContainer: 
      true: timeline element is a child element inside a container with scroll bar. 
      false: timeline.style.left is adjusted by scrollHandler. */
  private directlyInsideScrollContainer: boolean = true;
  private scrollHandler: any;
  private scrollContainer: HTMLElement | Window;
  private previousContainerScrollLeft: number = 0;
  private previousContainerScrollTop: number = 0;

  connectedCallback() {
    super.connectedCallback();
    if (this.scrollContainer && this.scrollHandler) {
      this.scrollContainer.addEventListener('scroll', this.scrollHandler);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.scrollContainer && this.scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
    }
  }
  
  static get styles() {
    return css`
      :host {
        display: block;
        overflow: hidden;
        position: relative;
        
        --no-user-select: {
					-webkit-user-select: none;
					-khtml-user-select: none;
					-moz-user-select: none;
					-ms-user-select: none;
          user-select: none;
        }
      }
      :host([hidden]) {
        display: none;
      }
      
      .year,
			.month,
			.day {
				padding-left: 2px;
				text-overflow: ellipsis;
				white-space: nowrap;
		   	border-right: 1px solid #A9A9A9;
		    box-sizing: border-box;
		    -moz-box-sizing: border-box;
		    -webkit-box-sizing: border-box;
			}
			.year.spacer,
			.month.spacer,
			.day.spacer {
				padding-left: 0px;
			}

			.month:nth-of-type(even),
			.day:nth-of-type(even) {
			    background-color: #ddd;
			}
			.col.even {
			    background-color: #ccc;
			}

			.col {
        position: var(--timeline-col-position);
				left: var(--timeline-col-left);
				height: 100%;
				float: left;
				overflow: hidden;
				border-right: 1px solid #A9A9A9;
				background-color: var(--timeline-col-background-color, #ddd);
				font-size: var(--timeline-col-font-size, 10px);
				text-align: center;
				box-sizing: border-box;
				-moz-box-sizing: border-box;
				-webkit-box-sizing: border-box;
				-webkit-touch-callout: none;
				@apply --no-user-select;
			}

      .c-col {
				width: var(--timeline-col-center-width);
			}

			.f-col {
				width: var(--timeline-col-first-width);
			}

			.l-col {
				width: var(--timeline-col-last-width);
      }
      
			.col.w {
				text-align: left;
			}

			.col.weekend {
				background-color: var(--timeline-col-weekend, #ccc);
			}

			.col.measure {
			    // Change min-width to adjust grid's cell width with day and hour-resolution.
				//min-width: 40px;
			}
			.col.w.measure {
				// Change min-width to adjust grid's cell width with week-resolution.
				//min-width: 70px;
			}

			.row {
				width: 100%;
				float: left;
				overflow: hidden;
				height: var(--timeline-row-height, 15px);
				font-size: var(--timeline-row-font-size, 10px);
				background-color: var(--timeline-row-background, #d0d0d0);
				-ms-flex-pack: justify;
				-webkit-touch-callout: none;
				@apply --no-user-select;
			}
    `;
  }

  render() {
    return html``;
  }

  shouldUpdate(changedProperties: any) {
    return changedProperties.has('resolution')
        || changedProperties.has('startDateTime')
        || changedProperties.has('endDateTime')
        || changedProperties.has('locale')
        || changedProperties.has('timeZone')
        || changedProperties.has('firstDayOfWeek')
        || changedProperties.has('twelveHourClock')
        || changedProperties.has('yearRowVisible')
        || changedProperties.has('monthRowVisible')
        || changedProperties.has('monthNames')
        || changedProperties.has('weekdayNames')
        ;
  }

  updated(changedProps: any) {
    if (changedProps.has('resolution')) {
      this.minResolutionWidth = -1;
    }
    this.updateTimeLine(this.resolution, this.startDateTime, this.endDateTime, new DefaultLocaleDataProvider(this.locale, this.timeZone, this.firstDayOfWeek, this.twelveHourClock));
  }
  
  /**
   * <p>
   * Updates the content of this component. Builds the time-line and calculates
   * width and heights for the content (calls in the end
   * {@link #updateWidths()}). This should be called explicitly. Otherwise the
   * component will be empty.
   * <p>
   * Date values should always follow specification in {@link Date#getTime()}.
   * Start and end date is always required.
   *
   * @param resolution
   *            Resolution enum (not null)
   * @param startDate
   *            Time-line's start date. (inclusive; not null)
   * @param endDate
   *            Time-line's end date. (inclusive; not null)
   * @param localeDataProvider
   *            Data provider for locale specific data. month names, first day
   *            of week etc.
   *
   */
  updateTimeLine(resolution: Resolution, startDate: Date, endDate: Date,
                localeDataProvider: ILocaleDataProvider) {
    if (!localeDataProvider) {
      console.log("TimelineElement requires ILocaleDataProvider. Can't complete update(...) operation.");
      return;
    }
    this.clear();
    console.log("TimelineElement content cleared.");

    if(!(resolution) || !startDate || !endDate) {
      return;
    }
    console.log("TimelineElement Updating content.");

    this.localeDataProvider = localeDataProvider;
    this.resolution = resolution;
    this.resetDateRange(startDate, endDate);
    this.lastDayOfWeek = (localeDataProvider.getFirstDayOfWeek() == 1) ? 7 : Math.max((localeDataProvider.getFirstDayOfWeek() - 1) % 8, 1);
    this.monthNames = this.monthNames || localeDataProvider.getMonthNames();
    this.weekdayNames = this.weekdayNames || localeDataProvider.getWeekdayNames();
    this.resolutionDiv = document.createElement('div');
    this.resolutionDiv.classList.add(TimelineElement.STYLE_ROW, TimelineElement.STYLE_RESOLUTION);

    if (this.minResolutionWidth < 0) {
      this.minResolutionWidth = this.calculateResolutionMinWidth();
    }

    if (this.resolution === Resolution.Day || this.resolution === Resolution.Week) {
      this.prepareTimelineForDayOrWeekResolution(this.startDateTime, this.endDateTime);
    } else if (this.resolution === Resolution.Hour) {
      this.prepareTimelineForHourResolution(this.startDateTime, this.endDateTime);
    } else {
      console.log("TimelineElement resolution " + (this.resolution ? Resolution[this.resolution] : "null")
        + " is not supported");
      return;
    }

    if (this.yearRowVisible) {
      this.appendTimelineBlocks(this.yearRowData, TimelineElement.STYLE_YEAR);
    }
    if (this.monthRowVisible) {
      this.appendTimelineBlocks(this.monthRowData, TimelineElement.STYLE_MONTH);
    }
    if (this.isDayRowVisible()) {
      this.appendTimelineBlocks(this.dayRowData, TimelineElement.STYLE_DAY);
    }
    this.shadowRoot.appendChild(this.resolutionDiv);

    console.log("TimelineElement Constructed content.");
    this.updateWidths();
    console.log("TimelineElement is updated for resolution " + Resolution[resolution] + ".");

    this.registerScrollHandler();
  }

  resetDateRange(startDate: Date, endDate: Date) {
    this.startDateTime = startDate;
    this.endDateTime = endDate;
    this.normalStartDate = this.toNormalDate(this.startDateTime);
    this.normalEndDate = this.toNormalDate(this.endDateTime);
    this.firstDayOfRange = this.firstDayOfRange || this.startDateTime.getDay();
    this.firstHourOfRange = this.firstHourOfRange || this.startDateTime.getHours();
  }

  registerScrollHandler() {
    if (this.scrollHandler) {
      return;
    }
    let timeline = this;
    this.scrollContainer = this.setupScrollContainer();
    this.scrollHandler = function (e: any) {
      window.requestAnimationFrame(function () {
        let container: any = timeline.scrollContainer;
        let sl: number = container.scrollLeft || container.scrollX;
        let st: number = container.scrollTop || container.scrollY;
        if (sl != timeline.previousContainerScrollLeft) {
          timeline.setScrollLeft(sl);
          timeline.previousContainerScrollLeft = sl;
        }
        if (st != timeline.previousContainerScrollTop) {
          timeline.previousContainerScrollTop = st;
        }
      });
    };
    this.scrollContainer.addEventListener('scroll', this.scrollHandler);
  }

  setupScrollContainer(): HTMLElement | Window {
    let scrollContainer;
    if(this.scrollContainerId) {
      scrollContainer = this.getParentElement(this).querySelector('#' + this.scrollContainerId);
      if(!scrollContainer) {
        scrollContainer = document.querySelector('#' + this.scrollContainerId);
      }
      if(scrollContainer) {
        (<HTMLElement>scrollContainer).style.overflowX = "auto";
      }
    } 
    if(!scrollContainer) {
      scrollContainer = this.getParentElement(this);
      this.directlyInsideScrollContainer = true;
      if(scrollContainer === document.body) {
        return window; // window scrolls by default, not body
      }
    }
    return scrollContainer;
  }

  clear() {
    while (this.shadowRoot.firstChild) {
      this.shadowRoot.removeChild(this.shadowRoot.lastChild);
    }
    this.spacerBlocks = [];
    this.yearRowData.clear();
    this.monthRowData.clear();
    this.dayRowData.clear();
  }

  calculateResolutionMinWidth(): number {
    let removeResolutionDiv: boolean = false;
    if (!this.getParentElement(this.resolutionDiv)) {
      removeResolutionDiv = true;
      this.shadowRoot.appendChild(this.resolutionDiv);
    }
    let resBlockMeasure: HTMLDivElement = document.createElement('div');
    if (this.resolution === Resolution.Week) {
      // configurable with '.col.w.measure' selector
      resBlockMeasure.classList.add(TimelineElement.STYLE_COL, TimelineElement.STYLE_WEEK, TimelineElement.STYLE_MEASURE);
    } else {
      // measure for text 'MM'
      resBlockMeasure.innerText = "MM";
      // configurable with '.col.measure' selector
      resBlockMeasure.classList.add(TimelineElement.STYLE_COL, TimelineElement.STYLE_MEASURE);
    }
    this.resolutionDiv.appendChild(resBlockMeasure);
    let width: number = resBlockMeasure.clientWidth;
    if (this.resolution === Resolution.Week) {
      // divide given width by number of days in week
      width = width / DateTimeConstants.DAYS_IN_WEEK;
    }
    width = (width < this.resolutionWeekDayblockWidth) ? this.resolutionWeekDayblockWidth : width;
    resBlockMeasure.parentNode.removeChild(resBlockMeasure);
    if (removeResolutionDiv) {
      this.resolutionDiv.parentNode.removeChild(this.resolutionDiv);
    }
    return width;
  }

  registerHourResolutionBlock() {
    this.blocksInRange++;
    this.resolutionBlockCount++;
  }

  registerDayResolutionBlock() {
    this.blocksInRange++;
    this.resolutionBlockCount++;
  }

  registerWeekResolutionBlock(index: number, weekDay: Weekday, lastBlock: boolean, firstWeek: boolean) {
    if (index == 0 || weekDay === Weekday.First) {
      this.resolutionBlockCount++;
    }

    if (firstWeek && (weekDay === Weekday.Last || lastBlock)) {
      this.firstResBlockCount = index + 1;
    } else if (lastBlock) {
      this.lastResBlockCount = (index + 1 - this.firstResBlockCount) % 7;
    }

    this.blocksInRange++;
  }

  appendTimelineBlocks(rowData: BlockRowData, style: string) {
    for (let entry of rowData.getBlockEntries()) {
      this.shadowRoot.appendChild(entry[1]);
    }
    if (this.isAlwaysCalculatePixelWidths()) {
      this.shadowRoot.appendChild(this.createSpacerBlock(style));
    }
  }

  /**
 * Returns true if Widget is set to calculate widths by itself. Default is
 * false.
 *
 * @return
 */
  isAlwaysCalculatePixelWidths(): boolean {
    return this.calcPixels;
  }

  createSpacerBlock(className: string): HTMLDivElement {
      let block: HTMLDivElement = document.createElement('div');
      block.classList.add(TimelineElement.STYLE_ROW, TimelineElement.STYLE_YEAR, TimelineElement.STYLE_SPACER);
      block.innerText = " ";
      block.style.display = "none"; // not visible by default
      this.spacerBlocks.push(block);
      return block;
  }

  /** Clears Daylight saving time adjustment from the given time. */
  toNormalDate(zonedDate: Date): Date {
    return DateUtil.toNormalDate(zonedDate, this.localeDataProvider.getDaylightAdjustment(zonedDate));
  }

  getDSTAdjustedDate(previousIsDST: boolean, zonedDate: Date): Date {
    return DateUtil.getDSTAdjustedDate(previousIsDST, zonedDate, this.localeDataProvider.getDaylightAdjustment(zonedDate));
  }

  getParentElement(node: any): any {
    var parent = node.parentNode;
    if (!parent || parent.nodeType != 1) {
      parent = null;
    }
    return parent;
  }

  getDay(date: Date): string {
    // by adjusting the date to the middle of the day before formatting is a
    // workaround to avoid DST issues with DateTimeFormatter.
    let adjusted: Date = DateUtil.adjustToMiddleOfDay(date, this.localeDataProvider.getLocale());
    return this.localeDataProvider.formatDate(adjusted, "d");
  }

  getYear(date: Date): string {
      return this.localeDataProvider.formatDate(date, "yyyy");
  }

  getMonth(date: Date): number {
      let m: string = this.localeDataProvider.formatDate(date, "M");
      return parseInt(m) - 1;
  }

  isWeekEnd(dayCounter: number): boolean {
    return dayCounter == 1 || dayCounter == 7;
  }

  key(prefix: string, rowData: BlockRowData): string {
    return prefix + "_" + (rowData.size());
  }

  newKey(prefix: string, rowData: BlockRowData): string {
    return prefix + "_" + (rowData.size() + 1);
  }

  addBlock(current: string, target: string, date: Date, rowData: BlockRowData, operation: (target: string, value: string, date: Date) => void): string {
    let key: string;
    if (target !== current) {
      current = target;
      key = this.newKey("" + current, rowData);
      operation(target, key, date);
    } else {
      key = this.key("" + current, rowData);
      rowData.setBlockLength(key, rowData.getBlockLength(key) + 1);
    }
    return current;
  }

  addDayBlock(currentDay: string, date: Date): string {
    let day: string = this.getDay(date);

    return this.addBlock(currentDay, day, date, this.dayRowData, (day: string, key: string, date: Date) => {
      this.addDayBlockElement(key, this.formatDayCaption(day, date));
    });
  }

  addMonthBlock(currentMonth: string, date: Date): string {
    let month: number = this.getMonth(date);

    return this.addBlock(currentMonth, ""+month, date, this.monthRowData, (target: string, key: string, date: Date) => {
      this.addMonthBlockElement(key, this.formatMonthCaption(month, date));
    });
  }

  addYearBlock(currentYear: string, date: Date): string {
    let year: string = this.getYear(date);

    return this.addBlock(currentYear, year, date, this.yearRowData, (year: string, key: string, date: Date) => {
      this.addYearBlockElement(key, this.formatYearCaption(year, date));
    });
  }

  addMonthBlockElement(key: string, text: string) {
    this.createTimelineBlock(key, text, TimelineElement.STYLE_MONTH, this.monthRowData);
  }

  addYearBlockElement(key: string, text: string) {
    this.createTimelineBlock(key, text, TimelineElement.STYLE_YEAR, this.yearRowData);
  }

  addDayBlockElement(key: string, text: string) {
    this.createTimelineBlock(key, text, TimelineElement.STYLE_DAY, this.dayRowData);
  }

  createTimelineBlock(key: string, text: string, styleSuffix: string, rowData: BlockRowData): HTMLDivElement {
      let div: HTMLDivElement = document.createElement('div');
      div.classList.add(TimelineElement.STYLE_ROW, styleSuffix);
      div.innerText = text;
      rowData.setBlockLength(key, 1);
      rowData.setBlock(key, div);
      return div;
  }

  formatDayCaption(day: string, date: Date): string {
      if (!this.dayFormat || this.dayFormat === "") {
          return day;
      }
      return this.localeDataProvider.formatDate(date, this.dayFormat);
  }

  formatYearCaption(year: string, date: Date): string {
      if (!this.yearFormat || this.yearFormat === "") {
          return year;
      }
      return this.localeDataProvider.formatDate(date, this.yearFormat);
  }

  formatWeekCaption(date: Date): string {
      if (!this.weekFormat || this.weekFormat === "") {
          return "" + getISOWeek(date);
      }
      return this.localeDataProvider.formatDate(date, this.weekFormat);
  }

  formatMonthCaption(month: number, date: Date): string {
      if (!this.monthFormat || this.monthFormat === "") {
          return this.monthNames[month];
      }
      return this.localeDataProvider.formatDate(date, this.monthFormat);
  }

  getWeekday(dayCounter: number): Weekday {
      if (dayCounter === this.localeDataProvider.getFirstDayOfWeek()) {
          return Weekday.First;
      }
      if (dayCounter === this.lastDayOfWeek) {
          return Weekday.Last;
      }
      return Weekday.Between;
  }

  prepareTimelineForHourResolution(startDate: Date, endDate: Date) {
    let timeline = this;
    this.firstDay = true;
    let hourCounter: number = this.firstHourOfRange;
    this.prepareTimelineForHour(DateTimeConstants.HOUR_INTERVAL, startDate, endDate, <IResolutionBlockRegisterer>{

      registerResolutionBlock(index: number, date: Date, currentYear: string, lastTimelineBlock: boolean) {
        timeline.registerHourResolutionBlock();
        hourCounter = Math.max((hourCounter + 1) % 25, 1);
      }
    });
  }

  prepareTimelineForHour(interval: number, startDate: Date, endDate: Date, resBlockRegisterer: IResolutionBlockRegisterer) {
    this.blocksInRange = 0;
    this.resolutionBlockCount = 0;
    this.firstResBlockCount = 0;
    this.lastResBlockCount = 0;
    let currentYear = null;
    let currentMonth = null;
    let currentDay = null;
    let pos: Date = startDate;
    let end: Date = endDate;
    let index: number = 0;
    let lastTimelineBlock: boolean = false;
    let date: Date;

    while (pos.getTime() <= end.getTime()) {
      date = pos;
      let nextHour: Date = new Date(pos.getTime() + interval);
      lastTimelineBlock = nextHour.getTime() > end.getTime();

      resBlockRegisterer.registerResolutionBlock(index, date, currentYear, lastTimelineBlock);

      if (this.yearRowVisible) {
        currentYear = this.addYearBlock(currentYear, date);
      }
      if (this.monthRowVisible) {
        currentMonth = this.addMonthBlock(currentMonth, date);
      }
      if (this.isDayRowVisible()) {
        currentDay = this.addDayBlock(currentDay, date);
      }
      pos = nextHour;
      index++;
    }
  }

  prepareTimelineForDayOrWeekResolution(startDate: Date, endDate: Date) {
    let timeline = this;
    let dayCounter: number = this.firstDayOfRange;
    let weekday: Weekday;
    let firstWeek: boolean = true;
    this.prepareTimelineForDayOrWeek(DateTimeConstants.DAY_INTERVAL, startDate, endDate, <IResolutionBlockRegisterer>{
      registerResolutionBlock: function (index: number, date: Date, currentYear: string, lastTimelineBlock: boolean) {

        weekday = timeline.getWeekday(dayCounter);

        if (timeline.resolution === Resolution.Week) {
          timeline.registerWeekResolutionBlock(index, weekday, lastTimelineBlock, firstWeek);
          if (firstWeek && (weekday === Weekday.Last || lastTimelineBlock)) {
            firstWeek = false;
          }
        } else {
          timeline.registerDayResolutionBlock();
        }

        dayCounter = Math.max((dayCounter + 1) % 8, 1);
      }
    });
  }

  prepareTimelineForDayOrWeek(interval: number, startDate: Date, endDate: Date,
          resBlockRegisterer: IResolutionBlockRegisterer) {
      this.blocksInRange = 0;
      this.resolutionBlockCount = 0;
      this.firstResBlockCount = 0;
      this.lastResBlockCount = 0;
      let currentYear: string = null;
      let currentMonth: string = null;
      let currentDay: string = null;
      let pos: Date = DateUtil.adjustToMiddleOfDay(startDate, this.localeDataProvider.getLocale());
      let end: Date = endDate;
      let index: number = 0;
      let lastTimelineBlock: boolean = false;
      let date: Date;
      let isDST: boolean = false;
      let isPreviousDst: boolean = this.localeDataProvider.isDaylightTime(startDate);

      while (!lastTimelineBlock) {
          let date: Date = DateUtil.getDSTAdjustedDate(isPreviousDst, pos, this.localeDataProvider.getDaylightAdjustment(pos));
          pos = date;
          isDST = this.localeDataProvider.isDaylightTime(date);
          let d: Date = new Date(date.getTime() + interval);
          lastTimelineBlock = DateUtil.getDSTAdjustedDate(isDST, d, this.localeDataProvider.getDaylightAdjustment(d)).getTime() > end.getTime();

          resBlockRegisterer.registerResolutionBlock(index, date, currentYear, lastTimelineBlock);

          if (this.yearRowVisible) {
              currentYear = this.addYearBlock(currentYear, date);
          }
          if (this.monthRowVisible) {
              currentMonth = this.addMonthBlock(currentMonth, date);
          }
          if (this.isDayRowVisible()) {
              currentDay = this.addDayBlock(currentDay, date);
          }
          isPreviousDst = isDST;
          pos = new Date(pos.getTime() + interval);
          index++;
      }
  }

  isDayRowVisible(): boolean {
    return this.resolution === Resolution.Hour;
  }

  /**
 * Get actual width of the timeline.
 *
 * @return
 */
  public getResolutionWidth(): number {
    if (!this.isTimelineOverflowingHorizontally()) {
      return this.calculateTimelineWidth();
    }

    let width: number = this.getResolutionDivWidth();
    if (this.isAlwaysCalculatePixelWidths() && this.containsResBlockSpacer()) {
      width = width - ElementUtil.getWidth(this.resSpacerDiv);
    }
    return width;
  }

  /**
 * Calculate the exact width of the timeline. Excludes any spacers in the
 * end.
 *
 * @return
 */
  public calculateTimelineWidth(): number {
    let last: HTMLElement = this.getLastResolutionElement();
    if (last === null) {
      return 0.0;
    }
    let r: number = ElementUtil.getRight(last);
    let l: number = ElementUtil.getLeft(this.getFirstResolutionElement());
    let timelineRealWidth: number = r - l;
    return timelineRealWidth;
  }

  /*
   * Get width of the resolution div element.
   */
  private getResolutionDivWidth(): number {
    if (!this.isTimelineOverflowingHorizontally()) {
      return ElementUtil.getWidth(this.resolutionDiv);
    }
    return this.blocksInRange * this.minResolutionWidth;
  }

  /**
 * Calculate matching left offset in percentage for a date (
 * {@link Date#getTime()}).
 *
 * @param date
 *            Target date in milliseconds.
 * @param contentWidth
 *            Width of the content that the given 'date' is relative to.
 * @return Left offset in percentage.
 */
  public getLeftPositionPercentageForDate(date: Date, contentWidth: number): number {
    let timelineLeft: number = this.getLeftPositionForDate(date);
    let relativeLeft: number = this.convertRelativeLeftPosition(timelineLeft, contentWidth);

    let width: number = this.getResolutionWidth();
    return (100.0 / width) * relativeLeft;
  }

  /**
   * Calculate CSS value for 'left' property matching left offset in
   * percentage for a date ( {@link Date#getTime()}).
   * <p>
   * May return '2.123456%' or 'calc(2.123456%)' if IE;
   *
   * @param date
   *            Target date in milliseconds.
   * @param contentWidth
   *            Width of the content that the given 'date' is relative to.
   * @return Left offset as a String value.
   */
  public getLeftPositionPercentageStringForDate(date: Date, contentWidth: number): string {
    let timelineLeft: number = this.getLeftPositionForDate(date);
    let relativeLeft: number = this.convertRelativeLeftPosition(timelineLeft, contentWidth);

    let width: number = this.getResolutionWidth();
    let calc: string = this.createCalcCssValue(width, relativeLeft);

    if (calc != null) {
      return calc;
    }
    return (100.0 / width) * relativeLeft + "%";
  }

  public getLeftPositionPercentageStringForDateRange(date: Date, rangeWidth: number, rangeStartDate: Date,
    rangeEndDate: Date): string {
    let rangeLeft: number = this.getLeftPositionForDateRange(date, rangeWidth, rangeStartDate, rangeEndDate);
    let width: number = rangeWidth;
    let calc: string = this.createCalcCssValue(width, rangeLeft);

    if (calc != null) {
      return calc;
    }
    return (100.0 / width) * rangeLeft + "%";
  }

  /**
   * Calculate CSS value for 'width' property matching date interval inside
   * the time-line. Returns percentage value. Interval is in milliseconds.
   * <p>
   * May return '2.123456%' or 'calc(2.123456%)' if IE;
   *
   * @param interval
   *            Date interval in milliseconds.
   * @return
   */
  public getWidthPercentageStringForDateInterval(interval: number): string {
    let range: number = this.endDateTime.getTime() - this.startDateTime.getTime();
    return this.getWidthPercentageStringForDateIntervalForRange(interval, range);
  }

  /** @see #getWidthPercentageStringForDateInterval(long) */
  public getWidthPercentageStringForDateIntervalForRange(interval: number, range: number): string {
    let calc: string = this.createCalcCssValue(range, interval);
    if (calc != null) {
      return calc;
    }
    return (100.0 / range) * interval + "%";
  }

  /**
   * Calculate matching left offset in pixels for a date (
   * {@link Date#getTime()}).
   *
   * @param date
   *            Target date in milliseconds.
   * @return Left offset in pixels.
   */
  public getLeftPositionForDate(date: Date): number {
    return this.getLeftPositionForDateRange(date, this.getResolutionWidth(), this.startDateTime, this.endDateTime);
  }

  public getLeftPositionForDateRange(date: Date, rangeWidth: number, rangeStartDate: Date, rangeEndDate: Date): number {
    let width: number = rangeWidth;
    let range: number = rangeEndDate.getTime() - rangeStartDate.getTime();
    if (range <= 0) {
      return 0;
    }
    let p: number = width / range;
    let offset: number = date.getTime() - rangeStartDate.getTime();
    let left: number = p * offset;
    return left;
  }

  /**
   * Calculate matching date ({@link Date#getTime()}) for the target left
   * pixel offset.
   *
   * @param left
   *            Left offset in pixels.
   * @return Date in a milliseconds or null if timeline width is invalid (<=0).
   */
  public getDateForLeftPosition(left: number): Date {
    return this.getDateForLeftPositionNoticeDST(left, this.resolution === Resolution.Hour);
  }

  public getDateForLeftPositionNoticeDST(left: number, noticeDST: boolean): Date {
    let width: number = this.getResolutionWidth();
    if (width <= 0) {
      return null;
    }
    let range: number = this.normalEndDate.getTime() - this.normalStartDate.getTime();
    if (noticeDST) {
      range = this.adjustDateRangeByDST(range);
    }
    let p: number = range / width;
    let offset: number = p * left;
    let date: Date = new Date(this.startDateTime.getTime() + offset);

    console.log("Zoned: " + this.localeDataProvider.formatDate(date, "dd. HH:mm") + "  DST: "
      + this.localeDataProvider.getDaylightAdjustment(date) / 60000);
    return date;
  }

  /**
   * Convert left position for other relative target width.
   *
   * @param left
   * @param contentWidthToConvertFor
   * @return
   */
  public convertRelativeLeftPosition(left: number, contentWidthToConvertFor: number): number {
      let width: number = this.getResolutionWidth();
      if (width <= 0 || contentWidthToConvertFor <= 0) {
          return 0;
      }

      let relativePosition: number = (1.0 / contentWidthToConvertFor) * left;
      let timelineLeft: number = relativePosition * width;
      return timelineLeft;
  }

  adjustDateRangeByDST(range: number): number {
    /*
     * Notice extra block(s) or missing block(s) in range when start time is
     * in DST and end time is not, or vice versa.
     */
    let dstStart = this.localeDataProvider.getDaylightAdjustment(this.startDateTime);
    let dstEnd = this.localeDataProvider.getDaylightAdjustment(this.endDateTime);
    if (dstStart > dstEnd) {
      range -= Math.abs(dstStart - dstEnd);
    } else if (dstEnd > dstStart) {
      range += Math.abs(dstEnd - dstStart);
    }
    return range;
  }

  /**
   * Set horizontal scroll position for the time-line.
   *
   * @param left
   *            Scroll position in pixels.
   */
  public setScrollLeft(left: number) {
      if (this.positionLeft === left) {
          return;
      }
      this.positionLeft = left || 0;
      if(!this.directlyInsideScrollContainer) {
        this.style.left = -this.positionLeft + "px";
      }
      this.lazyResolutionPaint = setTimeout(() => this.fillVisibleTimeline(), 20);
  }
  
  /**
   * Re-calculates required widths for this widget.
   * <p>
   * Re-creates and fills the visible part of the resolution element.
   */
  updateWidths() {
      if (this.resolutionDiv == null) {
          console.log("TimelineElement is not ready for updateWidths() call. Call update(...) instead.");
          return;
      }
      console.log("TimelineElement Started updating widths.");

      // start by clearing old content in resolution element
      while (this.resolutionDiv.firstChild) {
        this.resolutionDiv.removeChild(this.resolutionDiv.lastChild);
      }

      this.setMinWidth(this.blocksInRange * this.minResolutionWidth);

      // update horizontal overflow state here, after min-width is updated.
      this.updateTimelineOverflowingHorizontally();

      this.createTimelineElementsOnVisibleArea();
      // fill timeline
      this.fillVisibleTimeline();

      // remove spacer block if it exist
      this.removeResolutionSpacerBlock();

      // calculate new block width for day-resolution.
      // Year and month blocks are vertically in-line with days.
      this.dayWidthPercentage = 100.0 / this.blocksInRange;
      this.dayOrHourWidthPx = this.calculateDayOrHourResolutionBlockWidthPx(this.blocksInRange);

      // calculate block width for currently selected resolution
      // (day,week,...)
      // resolution div's content may not be vertically in-line with
      // year/month blocks. This is the case for example with Week resolution.
      this.resBlockMinWidthPx = this.minResolutionWidth;
      this.resBlockWidthPx = this.calculateActualResolutionBlockWidthPx(this.dayOrHourWidthPx);
      this.resBlockWidthPercentage = 100.0 / this.resolutionBlockCount;
      let pct: string = this.createCalcCssValue(this.resolutionBlockCount, null);
      if (this.resolution === Resolution.Week) {
        this.resBlockMinWidthPx = DateTimeConstants.DAYS_IN_WEEK * this.minResolutionWidth;
        this.resBlockWidthPercentage = this.dayWidthPercentage * DateTimeConstants.DAYS_IN_WEEK;
        pct = this.createCalcCssValue(this.blocksInRange, DateTimeConstants.DAYS_IN_WEEK);
      }

      // update resolution block widths
      this.updateResolutionBlockWidths(pct);

      if (this.yearRowVisible) {
          // update year block widths
          this.updateBlockWidths(this.yearRowData);
      }

      if (this.monthRowVisible) {
          // update month block widths
          this.updateBlockWidths(this.monthRowData);
      }

      if (this.isDayRowVisible()) {
        this.updateBlockWidths(this.dayRowData);
      }

      if (this.isAlwaysCalculatePixelWidths()) {
        this.updateSpacerBlocks(this.dayOrHourWidthPx);
      }

      console.log("TimelineElement Widths are updated.");
  }

  updateBlockWidths(rowData: BlockRowData) {
    for (let entry of rowData.getBlockEntries()) {
      this.setWidth(entry[1], rowData.getBlockLength(entry[0]));
    }
  }

  updateSpacerBlocks(dayWidthPx: number) {
    let spaceLeft: number = this.getResolutionDivWidth() - (this.blocksInRange * dayWidthPx);
    if (spaceLeft > 0) {
      for (let e of this.spacerBlocks) {
        e.style.removeProperty("display");
        e.style.width = spaceLeft + "px";
      }

      this.resSpacerDiv = this.createResolutionBlock();
      this.resSpacerDiv.classList.add(TimelineElement.STYLE_SPACER);
      this.resSpacerDiv.style.width = spaceLeft + "px";
      this.resSpacerDiv.innerText = " ";
      this.resolutionDiv.appendChild(this.resSpacerDiv);
    } else {
      this.hideSpacerBlocks();
    }
  }

  hideSpacerBlocks() {
    for (let e of this.spacerBlocks) {
      e.style.display = "none";
    }
  }

  /**
   * Set minimum width (pixels) of this widget's root DIV element. Default is
   * -1. Notice that
   * {@link #update(Resolution, long, long, int, int, LocaleDataProvider)}
   * will calculate min-width and call this internally.
   *
   * @param minWidth
   *            Minimum width in pixels.
   */
  setMinWidth(minWidth: number) {
      this.minWidth = minWidth;
      this.style.minWidth = this.minWidth + "px";
      this.resolutionDiv.style.minWidth = this.minWidth + "px";
  }

  /**
   * Returns true if the timeline is overflowing the parent's width. This
   * works only when this widget is attached to some parent.
   *
   * @return True when timeline width is more than the parent's width (@see
   *         {@link Element#getClientWidth()}).
   */
  isTimelineOverflowingHorizontally(): boolean {
    return this.timelineOverflowingHorizontally;
  }

  /**
  * Update horizontal overflow state.
  */
  updateTimelineOverflowingHorizontally() {
    this.timelineOverflowingHorizontally = (ElementUtil.getWidth(this.resolutionDiv) > ElementUtil.getWidth(this.getParentElement(this)));
  }

  createTimelineElementsOnVisibleArea() {
    // create place holder elements that represents weeks/days/hours
    // depending on the resolution in the timeline.
    // Only visible blocks are created, and only once, content will change
    // on scroll.

    // first: detect how many blocks we can fit in the screen
    let blocks: number = this.resolutionBlockCount;
    if (this.isTimelineOverflowingHorizontally()) {
      blocks = Math.floor((ElementUtil.getWidth(this.getParentElement(this))
        / this.calculateMinimumResolutionBlockWidth()));
      if (this.resolutionBlockCount < blocks) {
        // blocks need to be scaled up to fit the screen
        blocks = this.resolutionBlockCount;
      } else {
        blocks += 2;
      }
    }

    let element: HTMLDivElement = null;
    for (let i = 0; i < blocks; i++) {
      switch (this.resolution) {
        case Resolution.Hour:
          element = this.createHourResolutionBlock();
          break;
        case Resolution.Day:
          element = this.createDayResolutionBlock();
          break;
        case Resolution.Week:
          element = this.createWeekResolutionBlock();
          break;
      }
      this.resolutionDiv.appendChild(element);
    }

    console.log(`TimelineElement Added ${blocks} visible timeline elements for resolution ${Resolution[this.resolution]}`);
  }

  calculateMinimumResolutionBlockWidth(): number {
    if (this.resolution === Resolution.Week) {
      return DateTimeConstants.DAYS_IN_WEEK * this.minResolutionWidth;
    }
    return this.minResolutionWidth;
  }

  createResolutionBlock(): HTMLDivElement {
    let resBlock: HTMLDivElement = document.createElement('div');
    resBlock.classList.add("col");
    return resBlock;
  }

  createHourResolutionBlock(): HTMLDivElement {
    let resBlock: HTMLDivElement = this.createResolutionBlock();
    resBlock.classList.add("h", TimelineElement.STYLE_CENTER);
    return resBlock;
  }

  createDayResolutionBlock(): HTMLDivElement {
    let resBlock: HTMLDivElement = this.createResolutionBlock();
    resBlock.classList.add(TimelineElement.STYLE_CENTER);
    return resBlock;
  }

  createWeekResolutionBlock(): HTMLDivElement {
    let resBlock: HTMLDivElement = this.createResolutionBlock();
    resBlock.classList.add("w", TimelineElement.STYLE_CENTER);
    return resBlock;
  }

  fillVisibleTimeline() {
    if (this.isTimelineOverflowingHorizontally()) {
      this.showResolutionBlocksOnView();
    } else {
      this.showAllResolutionBlocks();
    }
  }

  showResolutionBlocksOnView() {
    let positionLeftSnapshot: number = this.positionLeft;
    let datePos: number = positionLeftSnapshot;
    this.firstWeekBlockHidden = false;

    let left: number = Math.floor(positionLeftSnapshot);
    if (positionLeftSnapshot > 0 && this.resBlockWidthPx > 0) {
      let overflow: number = 0.0;
      let firstResBlockShort: boolean = this.isFirstResBlockShort();
      overflow = this.getScrollOverflowForResolutionBlock(positionLeftSnapshot, left, firstResBlockShort);
      left = Math.floor(positionLeftSnapshot - overflow);
      datePos = this.adjustLeftPositionForDateDetection(left);
    }
    if (datePos < 0.0) {
      datePos = positionLeftSnapshot;
    }
    let leftDate: Date;
    let noticeDst: boolean = this.resolution === Resolution.Hour;
    leftDate = this.getDateForLeftPositionNoticeDST(datePos, noticeDst);

    let containerWidth: number = ElementUtil.getWidth(this.getParentElement(this));
    this.fillTimelineForResolution(leftDate,
      new Date(Math.min(this.endDateTime.getTime(), this.getDateForLeftPositionNoticeDST(datePos + containerWidth, noticeDst).getTime())), left);

    this.style.setProperty("--timeline-col-position", "relative");
    this.style.setProperty("--timeline-col-left", left + "px");

    console.log(`TimelineElement Updated visible timeline elements for horizontal scroll position ${left} (plus ${datePos-left} to center-of-first-block)`);
  }

  showAllResolutionBlocks() {
    this.style.setProperty("--timeline-col-position", "relative");
    this.style.setProperty("--timeline-col-left", "0px");
    this.fillTimelineForResolution(this.startDateTime, this.endDateTime, 0);
  }

  fillTimelineForResolution(startDate: Date, endDate: Date, left: number) {
    if (this.resolution === Resolution.Day || this.resolution === Resolution.Week) {
      this.fillTimelineForDayResolution(startDate, endDate, left);
    } else if (this.resolution == Resolution.Hour) {
      this.fillTimelineForHourResolution(startDate, endDate, left);
    } else {
      console.log("TimelineElement resolution " + (this.resolution != null ? Resolution[this.resolution] : "null")
        + " is not supported");
      return;
    }
    console.log("TimelineElement Filled new data and styles to visible timeline elements");
  }

  isFirstResBlockShort(): boolean {
    return this.firstResBlockCount > 0 && ((this.resolution === Resolution.Week && this.firstResBlockCount < DateTimeConstants.DAYS_IN_WEEK));
  }

  isLastResBlockShort(): boolean {
    return this.lastResBlockCount > 0 && ((this.resolution === Resolution.Week && this.lastResBlockCount < DateTimeConstants.DAYS_IN_WEEK));
  }

  getScrollOverflowForResolutionBlock(positionLeftSnapshot: number, left: number, firstResBlockShort: boolean): number {
    let overflow: number;
    if (firstResBlockShort && left <= this.getFirstResolutionElementWidth()) {
      overflow = this.getScrollOverflowForShortFirstResolutionBlock(positionLeftSnapshot);
    } else {
      overflow = this.getScrollOverflowForRegularResoultionBlock(positionLeftSnapshot, firstResBlockShort);
    }
    return overflow;
  }

  getScrollOverflowForRegularResoultionBlock(positionLeftSnapshot: number, firstResBlockShort: boolean): number {
    let overflow: number;
    let firstBlockWidth: number = this.getFirstResolutionElementWidth();
    let positionLeft: number = (positionLeftSnapshot - (firstResBlockShort ? firstBlockWidth : 0));
    overflow = positionLeft % this.resBlockWidthPx;
    if (firstResBlockShort) {
      overflow += firstBlockWidth;
      this.firstWeekBlockHidden = true;
    }
    return overflow;
  }

  getScrollOverflowForShortFirstResolutionBlock(positionLeftSnapshot: number): number {
    let overflow;
    // need to notice a short resolution block due to timeline's
    // start date which is in middle of a week.
    overflow = positionLeftSnapshot % this.getFirstResolutionElementWidth();
    if (overflow == 0.0) {
      overflow = this.getFirstResolutionElementWidth();
    }
    return overflow;
  }

  /**
   * Returns a width of the first resolution block.
   *
   * @return
   */
  getFirstResolutionElementWidth(): number {
    if (this.isFirstResBlockShort()) {
      if (this.isTimelineOverflowingHorizontally()) {
        return this.firstResBlockCount * this.minResolutionWidth;
      } else {
        return ElementUtil.getWidth(this.getFirstResolutionElement());
      }
    } else {
      if (this.isTimelineOverflowingHorizontally()) {
        return this.resBlockMinWidthPx;
      } else {
        return ElementUtil.getWidth(this.getFirstResolutionElement());
      }
    }
  }

  getFirstResolutionElement(): HTMLElement {
    if (this.resolutionDiv.hasChildNodes()) {
      return <HTMLElement>this.resolutionDiv.firstElementChild;
    }
    return null;
  }

  getLastResolutionElement(): HTMLElement {
    let div: HTMLDivElement = this.resolutionDiv;
    if (!div) {
      return null;
    }
    let nodeList: NodeListOf<ChildNode> = div.childNodes;
    if (!nodeList) {
      return null;
    }
    let blockCount: number = nodeList.length;
    if (blockCount < 1) {
      return null;
    }
    if (this.containsResBlockSpacer()) {
      let index: number = blockCount - 2;
      if (blockCount > 1 && index >= 0) {
        return <HTMLElement>this.resolutionDiv.childNodes.item(index);
      }
      return null;
    }
    return <HTMLElement>this.resolutionDiv.lastChild;
  }

  containsResBlockSpacer(): boolean {
    return this.resSpacerDiv != null && this.resSpacerDiv.parentElement
      && this.resSpacerDiv.parentElement === this.resolutionDiv;
  }

  removeResolutionSpacerBlock() {
    if (this.containsResBlockSpacer()) {
      this.resSpacerDiv.parentNode.removeChild(this.resSpacerDiv);
    }
  }

  /*
 * Calculates either day or hour resolution block width depending on the
 * current resolution.
 */
  calculateDayOrHourResolutionBlockWidthPx(blockCount: number): number {
    let dayOrHourWidthPx: number = Math.round(this.resolutionDiv.clientWidth / blockCount);
    while ((blockCount * dayOrHourWidthPx) < this.resolutionDiv.clientWidth) {
      dayOrHourWidthPx++;
    }
    return dayOrHourWidthPx;
  }

  /*
 * Calculates the actual width of one resolution block element. For example:
 * week resolution will return 7 * dayOrHourBlockWidthPx.
 */
  calculateActualResolutionBlockWidthPx(dayOrHourBlockWidthPx: number): number {
    if (this.resolution === Resolution.Week) {
      return DateTimeConstants.DAYS_IN_WEEK * dayOrHourBlockWidthPx;
    }
    return dayOrHourBlockWidthPx;
  }

  /**
 * Adjust left position for optimal position to detect accurate date with
 * the current resolution.
 */
  adjustLeftPositionForDateDetection(left: number): number {
    let datePos: number;
    if (this.resolution === Resolution.Week) {
      // detect date from the center of the first day block inside the
      // week block.
      datePos = left + this.dayOrHourWidthPx / 2;
    } else {
      // detect date from the center of the block (day/hour)
      datePos = left + this.resBlockWidthPx / 2;
    }
    return datePos;
  }

  createCalcCssValue(v: number, multiplier: number): string {
    if (this.ie) {
      // see comments in createCalcCssValue(int, Integer)
      let percents: number = 100.0 / v * multiplier;
      return "calc(" + percents + "%)";
    }
    return null;
  }

  updateResolutionBlockWidths(pct: string) {
    if (this.setPositionForEachBlock) {
      if (!this.isTimelineOverflowingHorizontally()) {
        this.resolutionDiv.style.display = "flex";
      } else {
        this.resolutionDiv.style.removeProperty("display");
      }
      let firstResBlockIsShort: boolean = this.isFirstResBlockShort();
      let lastResBlockIsShort: boolean = this.isLastResBlockShort();
      // when setPositionForEachBlock is true, set width for each block explicitly.
      let count: number = this.resolutionDiv.childElementCount;
      if (this.containsResBlockSpacer()) {
        count--;
      }
      let lastIndex: number = count - 1;
      let i: number;
      let resBlock: HTMLElement;
      for (i = 0; i < count; i++) {
        resBlock = <HTMLElement>this.resolutionDiv.childNodes.item(i);

        // first and last week blocks may be thinner than other
        // resolution blocks.
        if (firstResBlockIsShort && i == 0) {
          this.setWidth(resBlock, this.firstResBlockCount);
        } else if (lastResBlockIsShort && i == lastIndex) {
          this.setWidth(resBlock, this.lastResBlockCount);
        } else {
          this.setWidthPct(this.resBlockWidthPx, pct, resBlock);
        }
      }

    } else {
      // set widths by updating injected styles in one place. Faster than
      // setting widths explicitly for each element.
      let center: string = this.getWidthStyleValue(pct);
      let first: string = center;
      let last: string = center;
      if (this.isFirstResBlockShort()) {
        first = this.getWidth(this.firstResBlockCount);
      }
      if (this.isLastResBlockShort()) {
        last = this.getWidth(this.lastResBlockCount);
      }
      this.style.setProperty("--timeline-col-center-width", center);
      this.style.setProperty("--timeline-col-first-width", first);
      this.style.setProperty("--timeline-col-last-width", last);
    }
  }

  getWidth(multiplier: number): string {
    if (this.isTimelineOverflowingHorizontally()) {
      return (multiplier * this.minResolutionWidth) + "px";
    } else {
      if (this.isAlwaysCalculatePixelWidths()) {
        return multiplier * this.dayOrHourWidthPx + "px";
      } else {
        return this.getCssPercentageWidth(this.blocksInRange, this.dayWidthPercentage, multiplier);
      }
    }
  }

  setWidth(element: HTMLElement, multiplier: number) {
    if (this.isTimelineOverflowingHorizontally()) {
      element.style.width = (multiplier * this.minResolutionWidth) + "px";
    } else {
      if (this.isAlwaysCalculatePixelWidths()) {
        element.style.width = (multiplier * this.dayOrHourWidthPx) + "px";
      } else {
        this.setCssPercentageWidth(element, this.blocksInRange, this.dayWidthPercentage, multiplier);
      }
    }
  }

  setWidthPct(resBlockWidthPx: number, pct: string, element: HTMLElement) {
    if (this.isTimelineOverflowingHorizontally()) {
      element.style.width = this.resBlockMinWidthPx + "px";
    } else {
      if (this.isAlwaysCalculatePixelWidths()) {
        element.style.width = resBlockWidthPx + "px";
      } else {
        if (this.ie) {
          element.style.flex = "1";
        }
        this.setCssPercentageWidthFor(element, this.resBlockWidthPercentage, pct);
      }
    }
  }

  setCssPercentageWidth(element: HTMLElement, daysInRange: number, width: number, position: number) {
    let pct: string = this.createCalcCssValue(daysInRange, position);
    this.setCssPercentageWidthFor(element, position * width, pct);
  }

  getCssPercentageWidth(daysInRange: number, width: number, position: number): string {
    let pct: string = this.createCalcCssValue(daysInRange, position);
    return this.getPercentageWidthString(position * width, pct);
  }

  setCssPercentageWidthFor(element: HTMLElement, nValue: number, pct: string) {
    if (pct) {
      element.style.width = pct;
    } else {
      element.style.width = nValue + "%";
    }
  }

  getPercentageWidthString(nValue: number, pct: string): string {
    if (pct) {
      return pct;
    } else {
      return nValue + "%";
    }
  }

  getWidthStyleValue(pct: string): string {
    if (this.isTimelineOverflowingHorizontally()) {
      return this.resBlockMinWidthPx + "px";
    } else {
      if (this.isAlwaysCalculatePixelWidths()) {
        return this.resBlockWidthPx + "px";
      } else {
        return this.getPercentageWidthString(this.resBlockWidthPercentage, pct);
      }
    }
  }

  fillTimelineForHourResolution(startDate: Date, endDate: Date, left: number) {
    let timeline = this;
    this.firstDay = true;
    let hourCounter: number;
    let even: boolean;
    this.fillTimelineForHour(DateTimeConstants.HOUR_INTERVAL, startDate, endDate, <IResolutionBlockFiller>{

      setup() {
        hourCounter = this.getFirstHourOfVisibleRange(startDate);
        even = this.isEven(startDate);
      },

      fillResolutionBlock(index: number, date: Date, currentYear: string, lastTimelineBlock: boolean) {
        let childCount: number = timeline.resolutionDiv.childElementCount;
        if (timeline.isValidChildIndex(index, childCount)) {
          let resBlock: HTMLDivElement = <HTMLDivElement>timeline.resolutionDiv.childNodes.item(index);
          timeline.fillHourResolutionBlock(resBlock, date, index, hourCounter, lastTimelineBlock, left, even);
          hourCounter = (hourCounter + 1) % 24;
          even = !even;
        } else {
          timeline.logIndexOutOfBounds("hour", index, childCount);
          return;
        }
      },

      isEven(startDate: Date): boolean {
        let normalDate: Date = timeline.toNormalDate(startDate);
        if (timeline.normalStartDate.getTime() < normalDate.getTime()) {
          let hours: number = Math.floor(((normalDate.getTime() - timeline.normalStartDate.getTime()) / DateTimeConstants.HOUR_INTERVAL));
          return (hours % 2) == 1;
        }
        return false;
      },

      getFirstHourOfVisibleRange(startDate: Date): number {
        let normalDate: Date = timeline.toNormalDate(startDate);
        if (timeline.normalStartDate.getTime() < normalDate.getTime()) {
          let hours: number = Math.floor(((normalDate.getTime() - timeline.normalStartDate.getTime()) / DateTimeConstants.HOUR_INTERVAL));
          return ((timeline.firstHourOfRange + hours) % 24);
        }
        return timeline.firstHourOfRange;
      }
    });
  }

  fillTimelineForDayResolution(startDate: Date, endDate: Date, left: number) {
    let timeline = this;
    let dayCounter: number;
    let even: boolean;
    let firstWeek: boolean = true;
    let weekIndex: number = 0;
    let weekday: Weekday;

    this.fillTimelineForDayOrWeek(DateTimeConstants.DAY_INTERVAL, startDate, endDate, <IResolutionBlockFiller>{
      setup: function () {
        dayCounter = this.getFirstDayOfVisibleRange(startDate);
        even = this.isEven(startDate, timeline.firstDayOfRange);
      },

      fillResolutionBlock: function (index: number, date: Date, currentYear: string, lastTimelineBlock: boolean) {
        try {
          weekday = timeline.getWeekday(dayCounter);

          if (timeline.resolution === Resolution.Week) {
            this.fillWeekBlock(left, index, date, lastTimelineBlock);
          } else {
            this.fillDayBlock(left, index, date);
          }

        } finally {
          dayCounter = Math.max((dayCounter + 1) % 8, 1);
        }
      },

      fillDayBlock: function (left: number, index: number, date: Date) {
        let childCount: number = timeline.resolutionDiv.childElementCount;
        if (timeline.isValidChildIndex(index, childCount)) {
          let resBlock: HTMLDivElement = <HTMLDivElement>timeline.resolutionDiv.childNodes.item(index);
          timeline.fillDayResolutionBlock(resBlock, date, index, timeline.isWeekEnd(dayCounter), left);
        } else {
          timeline.logIndexOutOfBounds("day", index, childCount);
          return;
        }
      },

      fillWeekBlock: function (left: number, index: number, date: Date, lastTimelineBlock: boolean) {
        let resBlock: HTMLDivElement = null;
        if (index > 0 && weekday == Weekday.First) {
          weekIndex++;
          firstWeek = false;
          even = !even;
        }
        if (index == 0 || weekday == Weekday.First) {
          let childCount: number = timeline.resolutionDiv.childElementCount;
          if (timeline.isValidChildIndex(weekIndex, childCount)) {
            resBlock = <HTMLDivElement>timeline.resolutionDiv.childNodes.item(weekIndex);
          } else {
            timeline.logIndexOutOfBounds("week", weekIndex, childCount);
            return;
          }
        }
        timeline.fillWeekResolutionBlock(resBlock, date, weekIndex, weekday, firstWeek, lastTimelineBlock, left, even);
      },

      calcDaysLeftInFirstWeek: function (startDay: number): number {
        let daysLeftInWeek: number = 0;
        if (startDay != timeline.firstDayOfWeek) {
          for (let i = startDay; ; i++) {
            daysLeftInWeek++;
            if (Math.max(i % 8, 1) === timeline.lastDayOfWeek) {
              break;
            }
          }
        }
        return daysLeftInWeek;
      },

      isEven: function (startDate: Date, startDay: number): boolean {
        let visibleRangeNormalStartDate: Date = timeline.toNormalDate(startDate);
        if (timeline.normalStartDate.getTime() < visibleRangeNormalStartDate.getTime()) {
          let daysHidden: number = Math.floor(((visibleRangeNormalStartDate.getTime() - timeline.normalStartDate.getTime()) / DateTimeConstants.DAY_INTERVAL));
          console.log("Days hidden: " + daysHidden);
          console.log("firstWeekBlockHidden = " + timeline.firstWeekBlockHidden);
          if (daysHidden === 0) {
            return false;
          }
          let daysLeftInFirstWeek: number = this.calcDaysLeftInFirstWeek(startDay);
          if (daysHidden > daysLeftInFirstWeek) {
            daysHidden -= daysLeftInFirstWeek;
          }
          let weeks: number = daysHidden / DateTimeConstants.DAYS_IN_WEEK;
          let even: boolean = (weeks % 2) === 1;
          return (timeline.firstWeekBlockHidden) ? !even : even;
        }
        return false;
      },

      getFirstDayOfVisibleRange: function (startDate: Date): number {
        let visibleRangeNormalStartDate: Date = timeline.toNormalDate(startDate);
        if (timeline.normalStartDate.getTime() < visibleRangeNormalStartDate.getTime()) {
          let days: number = Math.floor(((visibleRangeNormalStartDate.getTime() - timeline.normalStartDate.getTime()) / DateTimeConstants.DAY_INTERVAL));
          return ((timeline.firstDayOfRange - 1 + days) % 7) + 1;
        }
        return timeline.firstDayOfRange;
      }

    });
  }

  logIndexOutOfBounds(indexName: string, index: number, childCount: number) {
    console.log("${indexName} index ${index} out of bounds with childCount ${childCount}. Can't fill content.");
  }

  fillTimelineForHour(interval: number, startDate: Date, endDate: Date,
    resBlockFiller: IResolutionBlockFiller) {
    let currentYear: string = null;
    let pos: Date = startDate;
    let end: Date = endDate;
    let index: number = 0;
    let lastTimelineBlock: boolean = false;
    let date: Date;

    resBlockFiller.setup();

    while (pos <= end) {
      date = pos;
      let nextHour: Date = new Date(pos.getTime() + interval);
      lastTimelineBlock = nextHour.getTime() > end.getTime();

      resBlockFiller.fillResolutionBlock(index, date, currentYear, lastTimelineBlock);

      pos = nextHour;
      index++;
    }
  }

  fillTimelineForDayOrWeek(interval: number, startDate: Date, endDate: Date, resBlockFiller: IResolutionBlockFiller) {
    let currentYear: string = null;
    let pos: Date = startDate;
    pos = DateUtil.adjustToMiddleOfDay(pos, this.localeDataProvider.getLocale());
    let end: Date = endDate;
    let index: number = 0;
    let lastTimelineBlock: boolean = false;
    let date: Date;
    let isDST: boolean = false;
    let previousIsDST: boolean = this.localeDataProvider.isDaylightTime(startDate);
    
    resBlockFiller.setup();

    while (!lastTimelineBlock) {
      let dstAdjusted: Date = this.getDSTAdjustedDate(previousIsDST, pos);
      date = dstAdjusted;
      pos = dstAdjusted;
      isDST = this.localeDataProvider.isDaylightTime(date);
      lastTimelineBlock = this.getDSTAdjustedDate(isDST, new Date(date.getTime() + interval)).getTime() > end.getTime();

      resBlockFiller.fillResolutionBlock(index, date, currentYear, lastTimelineBlock);

      previousIsDST = isDST;
      pos = new Date(pos.getTime() + interval);
      index++;
    }
  }

  isValidChildIndex(index: number, childCount: number): boolean {
    return (index >= 0) && (index < childCount);
  }

  fillDayResolutionBlock(resBlock: HTMLDivElement, date: Date, index: number, weekend: boolean, left: number) {
    resBlock.innerText = this.localeDataProvider.formatDate(date, "d");
    if (weekend) {
      resBlock.classList.add(TimelineElement.STYLE_WEEKEND);
    } else {
      resBlock.classList.remove(TimelineElement.STYLE_WEEKEND);
    }

    if (this.setPositionForEachBlock && this.isTimelineOverflowingHorizontally()) {
      resBlock.style.position = "relative";
      resBlock.style.left = left + "px";
    }
  }

  fillWeekResolutionBlock(resBlock: HTMLDivElement, date: Date, index: number, weekDay: Weekday, firstWeek: boolean,
    lastBlock: boolean, left: number, even: boolean) {
    if (resBlock != null) {
      resBlock.innerText = this.formatWeekCaption(date);

      if (even) {
        resBlock.classList.add(TimelineElement.STYLE_EVEN);
      } else {
        resBlock.classList.remove(TimelineElement.STYLE_EVEN);
      }

      if (this.setPositionForEachBlock && this.isTimelineOverflowingHorizontally()) {
        resBlock.style.position = "relative";
        resBlock.style.left = left + "px";
      }

      resBlock.classList.remove(TimelineElement.STYLE_FIRST, TimelineElement.STYLE_LAST);
    }

    if (firstWeek && (weekDay === Weekday.Last || lastBlock)) {
      let firstEl: HTMLElement = <HTMLElement>this.resolutionDiv.firstElementChild;
      if (!firstEl.classList.contains(TimelineElement.STYLE_FIRST)) {
        firstEl.classList.add(TimelineElement.STYLE_FIRST);
      }
    } else if (lastBlock) {
      let lastEl: HTMLElement = <HTMLElement>this.resolutionDiv.lastChild;
      if (!lastEl.classList.contains(TimelineElement.STYLE_LAST)) {
        lastEl.classList.add(TimelineElement.STYLE_LAST);
      }
    }
  }

  fillHourResolutionBlock(resBlock: HTMLDivElement, date: Date, index: number, hourCounter: number, lastBlock: boolean,
    left: number, even: boolean) {
    if (this.localeDataProvider.isTwelveHourClock()) {
      resBlock.innerText = this.localeDataProvider.formatDate(date, "h");
    } else {
      resBlock.innerText = this.localeDataProvider.formatDate(date, "HH");
    }

    if (even) {
      resBlock.classList.add(TimelineElement.STYLE_EVEN);
    } else {
      resBlock.classList.remove(TimelineElement.STYLE_EVEN);

    }

    if (this.firstDay && (hourCounter == 24 || lastBlock)) {
      this.firstDay = false;
      this.firstResBlockCount = index + 1;
    } else if (lastBlock) {
      this.lastResBlockCount = (index + 1 - this.firstResBlockCount) % 24;
    }

    if (this.setPositionForEachBlock && this.isTimelineOverflowingHorizontally()) {
      resBlock.style.position = "relative";
      resBlock.style.left = left + "px";
    }
  }
}
