package org.vaadin.tltv.timeline;

import org.junit.Assert;
import org.junit.Test;

import com.vaadin.testbench.TestBenchElement;

public class ViewIT extends AbstractViewTest {

    @Test
    public void componentWorks() {
        final TestBenchElement timeline = $("timeline-element").first();
        // Check that timeline contains at least one other element, which means that
        // is has been upgraded to a custom element and not just rendered as an empty
        // tag
        Assert.assertTrue(
        		timeline.$(TestBenchElement.class).all().size() > 0);
    }
}
