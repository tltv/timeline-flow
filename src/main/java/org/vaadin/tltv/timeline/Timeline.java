package org.vaadin.tltv.timeline;

import java.text.DateFormatSymbols;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.Objects;
import java.util.TimeZone;
import java.util.stream.IntStream;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.component.dependency.NpmPackage;

import elemental.json.JsonArray;
import elemental.json.impl.JreJsonFactory;

@Tag("timeline-element")
@NpmPackage(value = "tltv-timeline-element", version = "^1.0.7")
@JsModule("tltv-timeline-element/src/timeline-element.ts")
@NpmPackage(value = "date-fns", version = "^2.9.0")
@NpmPackage(value = "date-fns-tz", version = "^1.0.9")
public class Timeline extends Component {

	public static enum Resolution {
		Hour, Day, Week
	}

	private final JreJsonFactory jsonFactory = new JreJsonFactory();

	private final DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH");

	public void setResolution(Resolution resolution) {
		getElement().setAttribute("resolution",
				Objects.requireNonNull(resolution, "Setting null Resolution is not allowed").name());
	}

	public Resolution getResolution() {
		return Resolution.valueOf(getElement().getAttribute("resolution"));
	}

	public void setLocale(Locale locale) {
		getElement().setAttribute("locale",
				Objects.requireNonNull(locale, "Setting null Locale is not allowed").toLanguageTag());
		setupByLocale();
	}

	public Locale getLocale() {
		return Locale.forLanguageTag(getElement().getAttribute("locale"));
	}

	public void setTimeZone(TimeZone timeZone) {
		getElement().setAttribute("timezone",
				Objects.requireNonNull(timeZone, "Setting null TimeZone is not allowed").getID());
		updateTimelineStartTimeDetails();
	}

	public TimeZone getTimeZone() {
		return TimeZone.getTimeZone(getElement().getAttribute("timezone"));
	}

	public void setStartDate(LocalDate startDate) {
		getElement().setAttribute("startdatetime", dateTimeFormatter.format(resetTimeToMin(startDate.atStartOfDay())));
		updateTimelineStartTimeDetails();
	}

	public void setStartDateTime(LocalDateTime startDateTime) {
		getElement().setAttribute("startdatetime", dateTimeFormatter.format(resetTimeToMin(startDateTime)));
		updateTimelineStartTimeDetails();
	}

	public LocalDateTime getStartDateTime() {
		return LocalDateTime.from(dateTimeFormatter.parse(getElement().getAttribute("startdatetime")));
	}

	public void setEndDate(LocalDate endDate) {
		getElement().setAttribute("enddatetime", dateTimeFormatter.format(resetTimeToMin(endDate.atStartOfDay())));
	}

	public void setEndDateTime(LocalDateTime endDateTime) {
		getElement().setAttribute("enddatetime", dateTimeFormatter.format(resetTimeToMin(endDateTime)));
	}

	public LocalDateTime getEndDateTime() {
		return LocalDateTime.from(dateTimeFormatter.parse(getElement().getAttribute("enddatetime")));
	}

	public void setYearRowVisible(boolean visible) {
		getElement().setProperty("yearRowVisible", visible);
	}

	public boolean isYearRowVisible() {
		return getElement().getProperty("yearRowVisible", true);
	}

	public void setMonthRowVisible(boolean visible) {
		getElement().setProperty("monthRowVisible", visible);
	}

	public boolean isMonthRowVisible() {
		return getElement().getProperty("monthRowVisible", true);
	}

	/**
	 * Set target scroll container element ID to handle horizontal scrolling. If ID
	 * is not given, parent element or 'window' acts as scroll container.
	 * 
	 * @param id Unique ID of the scroll container element.
	 */
	public void setScrollContainerId(String id) {
		getElement().setAttribute("scrollcontainerid", id);
	}

	/**
	 * Returns target scroll container element ID that handles horizontal scrolling.
	 * null or empty means that parent element or 'window' acts as scroll container.
	 * 
	 * @return ID of scroll container if set via
	 *         {@link #setScrollContainerId(String)}.
	 */
	public String getScrollContainerId() {
		return getElement().getAttribute("scrollcontainerid");
	}

	private void updateTimelineStartTimeDetails() {
		getElement().setProperty("firstDayOfRange", translateDayOfWeek(getStartDateTime().getDayOfWeek()));
		getElement().setProperty("firstHourOfRange", getStartDateTime().getHour());
	}

	private int translateDayOfWeek(DayOfWeek dow) {
		return (DayOfWeek.SUNDAY.equals(dow)) ? 1 : dow.getValue() + 1;
	}

	private void setupByLocale() {
		setArrayProperty("monthNames", new DateFormatSymbols(getLocale()).getMonths());
		setArrayProperty("weekdayNames", new DateFormatSymbols(getLocale()).getWeekdays());
		// First day of week (1 = sunday, 2 = monday)
		final java.util.Calendar cal = new GregorianCalendar(getLocale());
		getElement().setProperty("firstDayOfWeek", cal.getFirstDayOfWeek() - 1);
		updateTimelineStartTimeDetails();
	}

	private void setArrayProperty(String name, String[] array) {
		final JsonArray jsonArray = jsonFactory.createArray();
		IntStream.range(0, array.length).forEach(index -> jsonArray.set(index, array[index]));
		getElement().executeJs("this." + name + " = $0;", jsonArray);
	}

	LocalDateTime resetTimeToMin(LocalDateTime dateTime) {
		if (Objects.isNull(dateTime)) {
			return null;
		}
		if (Resolution.Hour.equals(getResolution())) {
			return dateTime.truncatedTo(ChronoUnit.HOURS);
		}
		return dateTime.truncatedTo(ChronoUnit.DAYS);
	}

	LocalDateTime resetTimeToMax(LocalDateTime dateTime, boolean exclusive) {
		if (Objects.isNull(dateTime)) {
			return null;
		}
		if (Resolution.Hour.equals(getResolution())) {
			if (exclusive) {
				dateTime = dateTime.minusHours(1);
			}
			return dateTime.plusHours(1).truncatedTo(ChronoUnit.HOURS).minusSeconds(1);
		}
		if (exclusive) {
			dateTime = dateTime.minusDays(1);
		}
		return dateTime.plusDays(1).truncatedTo(ChronoUnit.DAYS).minusSeconds(1);
	}
}
