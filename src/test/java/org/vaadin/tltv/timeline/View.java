package org.vaadin.tltv.timeline;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.TimeZone;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.vaadin.tltv.timeline.Timeline.Resolution;

import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.combobox.ComboBox;
import com.vaadin.flow.component.contextmenu.MenuItem;
import com.vaadin.flow.component.datepicker.DatePicker;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.menubar.MenuBar;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.select.Select;
import com.vaadin.flow.component.timepicker.TimePicker;
import com.vaadin.flow.router.Route;

@Route("")
public class View extends Div {

    public View() {
    	setWidthFull();
    	
    	Timeline timeline = createTimeline();
    	
    	Div controlPanel = buildControlPanel(timeline);
    	
    	
    	Div scrollWrapper = new Div();
    	scrollWrapper.setId("scroll-wrapper");
    	scrollWrapper.setWidthFull();
    	scrollWrapper.add(timeline);
    	
        add(controlPanel, scrollWrapper);
    }

    private Div buildControlPanel(Timeline timeline) {
    	Div div = new Div();
    	div.setWidthFull();
    	
    	MenuBar menu = buildMenu(timeline);
    	HorizontalLayout tools = createTools(timeline);
    	div.add(menu, tools);
    	return div;
    }
    
    private HorizontalLayout createTools(Timeline timeline) {
    	HorizontalLayout tools = new HorizontalLayout();
    	Select<Resolution> resolutionField = new Select<Resolution>(Resolution.values());
    	resolutionField.setLabel("Resolution");
		resolutionField.setValue(timeline.getResolution());
    	resolutionField.addValueChangeListener(event -> timeline.setResolution(event.getValue()));
    	
    	DatePicker startDate = new DatePicker(timeline.getStartDateTime().toLocalDate());
    	startDate.setLabel("Start Date");
    	startDate.addValueChangeListener(event -> timeline.setStartDate(event.getValue()));
    	
    	TimePicker startTimeField = new TimePicker("Start Time", timeline.getStartDateTime().toLocalTime());
    	startTimeField.addValueChangeListener(
				event -> timeline.setStartDateTime(startDate.getValue().atTime(event.getValue())));
		
    	DatePicker endDate = new DatePicker(timeline.getEndDateTime().toLocalDate());
    	endDate.setLabel("End Date");
		endDate.addValueChangeListener(
				event -> timeline.setEndDate(event.getValue()));
		
		TimePicker endTimeField = new TimePicker("End Time (inclusive)", timeline.getEndDateTime().toLocalTime());
		endTimeField.addValueChangeListener(
				event -> timeline.setEndDateTime(endDate.getValue().atTime(event.getValue())));
		
		tools.add(resolutionField, startDate, startTimeField, endDate, endTimeField);
		tools.add(createTimeZoneField(timeline));
		tools.add(createLocaleField(timeline));
		return tools;
    }

	private ComboBox<String> createTimeZoneField(Timeline timeline) {
		ComboBox<String> timeZoneField = new ComboBox<>("Timezone", getSupportedTimeZoneIds());
		timeZoneField.setWidth("350px");
		timeZoneField.setValue("Default");
		timeZoneField.setItemLabelGenerator(item -> {
			if ("Default".equals(item)) {
				return "Default (" + getDefaultTimeZone().getDisplayName(TextStyle.FULL, UI.getCurrent().getLocale())
						+ ")";
			}
			TimeZone tz = TimeZone.getTimeZone(item);
			return tz.getID() + " (raw offset " + (tz.getRawOffset() / 60000) + "m)";
		});
		timeZoneField.addValueChangeListener(e -> Optional.ofNullable(e.getValue()).ifPresent(zoneId -> {
			if ("Default".equals(zoneId)) {
				timeline.setTimeZone(TimeZone.getTimeZone(getDefaultTimeZone()));
			} else {
				timeline.setTimeZone(TimeZone.getTimeZone(ZoneId.of(zoneId)));
			}
		}));
		return timeZoneField;
	}
	
	private ComboBox<Locale> createLocaleField(Timeline timeline) {
		ComboBox<Locale> localeField = new ComboBox<>("Locale",
				Stream.of(Locale.getAvailableLocales()).collect(Collectors.toList()));
		localeField.setWidth("350px");
		localeField.setItemLabelGenerator((l) -> l.getDisplayName(UI.getCurrent().getLocale()));
		localeField.setValue(timeline.getLocale());
		localeField
				.addValueChangeListener(e -> Optional.ofNullable(e.getValue()).ifPresent(l -> timeline.setLocale(l)));
		return localeField;
	}
    
	private MenuBar buildMenu(Timeline timeline) {
    	
    	MenuBar menu = new MenuBar();
    	MenuItem menuEdit = menu.addItem("View");
		MenuItem showYear = menuEdit.getSubMenu().addItem("Show year");
		showYear.addClickListener(event -> {
			timeline.setYearRowVisible(event.getSource().isChecked());
		});
		showYear.setCheckable(true);
		showYear.setChecked(timeline.isYearRowVisible());
		
		MenuItem showMonth = menuEdit.getSubMenu().addItem("Show month");
		showMonth.addClickListener(event -> {
			timeline.setMonthRowVisible(event.getSource().isChecked());
		});
		showMonth.setCheckable(true);
		showMonth.setChecked(timeline.isMonthRowVisible());
    	
		return menu;
	}

	private Timeline createTimeline() {
		Timeline timeline = new Timeline();
    	timeline.setScrollContainerId("scroll-wrapper");
    	timeline.setResolution(Resolution.Day);
    	timeline.setStartDate(LocalDate.of(2020, 4, 1));
    	timeline.setEndDateTime(LocalDateTime.of(2020, 12, 1, 23, 59, 59));
    	timeline.setLocale(UI.getCurrent().getLocale());
    	timeline.setTimeZone(TimeZone.getDefault());
		return timeline;
	}
	
	private ZoneId getDefaultTimeZone() {
        ZoneId zone = ZoneId.systemDefault();
        return zone;
    }
	
	 private List<String> getSupportedTimeZoneIds() {
	        List<String> items = new ArrayList<>();
	        items.add("Default");
	        items.addAll(Arrays.asList(TimeZone.getAvailableIDs()));
	        return items;
	    }
}
