# Timeline

Vaadin 15 Flow component

Migrated from GWT Timeline widget for Gantt component (Java/Vaadin 8).

## Development instructions

Flow component integrates `<timeline-element>` LitElement web component.

TypeScript source file is located in `/src/main/resources/META-INF/resources/frontend/src/timeline-element.ts`

Flow integration is located in `/src/main/java/org/vaadin/tltv/timeline/Timeline.java`


Starting the test/demo server:
1. Run `mvn jetty:run`.
2. Open http://localhost:8080 in the browser.