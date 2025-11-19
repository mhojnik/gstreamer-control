/**
 * Tests for state management and event emission
 */

import { assertEquals, assert } from "@std/assert";
import { state, stateEvents, saveState } from "../src/switcher/state.ts";

// Reset state before each test
function resetState() {
	state.rotationEnabled = false;
	state.fixedSourceId = null;
	state.selectedCameraIds = [];
	state.rotationSchedule = [];
	state.currentSourceId = null;
	state.lastSwitchTime = null;
	stateEvents.removeAllListeners();
}

Deno.test("State: saveState emits event by default", async () => {
	resetState();
	let eventFired = false;

	stateEvents.on("stateChanged", () => {
		eventFired = true;
	});

	state.rotationEnabled = true;
	await saveState();

	assert(eventFired, "State change event should be emitted");
	stateEvents.off("stateChanged", () => {});
});

Deno.test("State: saveState(false) does not emit event", async () => {
	resetState();
	let eventFired = false;

	stateEvents.on("stateChanged", () => {
		eventFired = true;
	});

	state.currentSourceId = 1;
	await saveState(false);

	assert(!eventFired, "State change event should NOT be emitted for operational state");
	stateEvents.off("stateChanged", () => {});
});

Deno.test("State: configuration changes emit events", async () => {
	resetState();
	let eventCount = 0;

	stateEvents.on("stateChanged", () => {
		eventCount++;
	});

	state.rotationEnabled = true;
	await saveState();
	assertEquals(eventCount, 1, "Should emit event for rotationEnabled change");

	state.fixedSourceId = 1;
	await saveState();
	assertEquals(eventCount, 2, "Should emit event for fixedSourceId change");

	state.selectedCameraIds = [1, 2, 3];
	await saveState();
	assertEquals(eventCount, 3, "Should emit event for selectedCameraIds change");

	state.rotationSchedule = [{ cameraId: 1, durationSeconds: 60 }];
	await saveState();
	assertEquals(eventCount, 4, "Should emit event for rotationSchedule change");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("State: operational state changes do not emit events", async () => {
	resetState();
	let eventCount = 0;

	stateEvents.on("stateChanged", () => {
		eventCount++;
	});

	state.currentSourceId = 1;
	await saveState(false);
	assertEquals(eventCount, 0, "Should NOT emit event for currentSourceId change");

	state.lastSwitchTime = new Date().toISOString();
	await saveState(false);
	assertEquals(eventCount, 0, "Should NOT emit event for lastSwitchTime change");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("State: multiple listeners receive events", async () => {
	resetState();
	let listener1Count = 0;
	let listener2Count = 0;

	const listener1 = () => { listener1Count++; };
	const listener2 = () => { listener2Count++; };

	stateEvents.on("stateChanged", listener1);
	stateEvents.on("stateChanged", listener2);

	state.rotationEnabled = true;
	await saveState();

	assertEquals(listener1Count, 1, "Listener 1 should receive event");
	assertEquals(listener2Count, 1, "Listener 2 should receive event");

	stateEvents.off("stateChanged", listener1);
	stateEvents.off("stateChanged", listener2);
});

Deno.test("State: listeners can be removed", async () => {
	resetState();
	let eventCount = 0;

	const listener = () => { eventCount++; };

	stateEvents.on("stateChanged", listener);
	state.rotationEnabled = true;
	await saveState();
	assertEquals(eventCount, 1, "Listener should receive event");

	stateEvents.off("stateChanged", listener);
	state.rotationEnabled = false;
	await saveState();
	assertEquals(eventCount, 1, "Listener should NOT receive event after removal");
});

