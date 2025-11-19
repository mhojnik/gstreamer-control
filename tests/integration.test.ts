/**
 * Integration tests for the complete rotation system
 * Tests the interaction between state, events, and rotation logic
 */

import { assertEquals, assert } from "@std/assert";
import { state, stateEvents, saveState } from "../src/switcher/state.ts";
import type { Source } from "../src/switcher/types.ts";

// Track all events and source switches
let eventLog: string[] = [];
let sourceSwitchLog: Array<{ sourceId: number; timestamp: string }> = [];

// Mock functions
async function mockSwitchToSource(
	_baseUrl: string,
	sourceId: number,
	_sourceName: string,
): Promise<boolean> {
	sourceSwitchLog.push({
		sourceId,
		timestamp: new Date().toISOString(),
	});
	
	state.currentSourceId = sourceId;
	state.lastSwitchTime = new Date().toISOString();
	await saveState(false); // Critical: no event emission
	
	return true;
}

function resetTestState() {
	eventLog = [];
	sourceSwitchLog = [];
	state.rotationEnabled = false;
	state.fixedSourceId = null;
	state.selectedCameraIds = [];
	state.rotationSchedule = [];
	state.currentSourceId = null;
	state.lastSwitchTime = null;
	stateEvents.removeAllListeners();
}

const mockSources: Source[] = [
	{ id: 1, name: "Source 1", source_type: "srt", enabled: true },
	{ id: 2, name: "Source 2", source_type: "srt", enabled: true },
	{ id: 3, name: "Source 3", source_type: "srt", enabled: true },
];

Deno.test("Integration: complete rotation cycle without infinite loop", async () => {
	resetTestState();
	
	let rotationHandlerCallCount = 0;
	
	// Simulate rotation handler
	const rotationHandler = () => {
		rotationHandlerCallCount++;
		eventLog.push(`rotation-handler-${rotationHandlerCallCount}`);
	};
	
	stateEvents.on("stateChanged", rotationHandler);

	// Setup rotation schedule
	state.rotationSchedule = [
		{ cameraId: 1, durationSeconds: 1 },
		{ cameraId: 2, durationSeconds: 1 },
	];
	state.rotationEnabled = true;
	await saveState(); // Should trigger event
	
	assertEquals(rotationHandlerCallCount, 1, "Handler should be called once for configuration");
	assertEquals(eventLog.length, 1, "Should have one event");

	// Simulate source switches during rotation (these should NOT trigger events)
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");
	await new Promise(resolve => setTimeout(resolve, 50));
	
	await mockSwitchToSource("http://localhost:5000", 2, "Source 2");
	await new Promise(resolve => setTimeout(resolve, 50));

	assertEquals(sourceSwitchLog.length, 2, "Should have 2 source switches");
	assertEquals(rotationHandlerCallCount, 1, "Handler should still be called only once");
	assertEquals(eventLog.length, 1, "Should still have only one event");

	stateEvents.off("stateChanged", rotationHandler);
});

Deno.test("Integration: state change during rotation", async () => {
	resetTestState();
	
	let handlerCallCount = 0;
	const handler = () => {
		handlerCallCount++;
	};
	
	stateEvents.on("stateChanged", handler);

	// Start rotation
	state.rotationEnabled = true;
	state.rotationSchedule = [
		{ cameraId: 1, durationSeconds: 1 },
	];
	await saveState();
	assertEquals(handlerCallCount, 1, "Initial config should trigger handler");

	// Simulate source switch (no event)
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");
	await new Promise(resolve => setTimeout(resolve, 50));
	assertEquals(handlerCallCount, 1, "Source switch should NOT trigger handler");

	// Change configuration during rotation (should trigger event)
	state.rotationEnabled = false;
	await saveState();
	assertEquals(handlerCallCount, 2, "Config change should trigger handler");

	// Another source switch (no event)
	await mockSwitchToSource("http://localhost:5000", 2, "Source 2");
	await new Promise(resolve => setTimeout(resolve, 50));
	assertEquals(handlerCallCount, 2, "Source switch should still NOT trigger handler");

	stateEvents.off("stateChanged", handler);
});

Deno.test("Integration: rapid configuration changes", async () => {
	resetTestState();
	
	let handlerCallCount = 0;
	const handler = () => {
		handlerCallCount++;
	};
	
	stateEvents.on("stateChanged", handler);

	// Rapid configuration changes
	state.rotationEnabled = true;
	await saveState();
	
	state.fixedSourceId = 1;
	await saveState();
	
	state.selectedCameraIds = [1, 2];
	await saveState();
	
	state.rotationSchedule = [{ cameraId: 1, durationSeconds: 60 }];
	await saveState();

	assertEquals(handlerCallCount, 4, "Each config change should trigger handler");

	// Source switches in between (should not trigger)
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");
	await mockSwitchToSource("http://localhost:5000", 2, "Source 2");
	
	assertEquals(handlerCallCount, 4, "Source switches should NOT trigger handler");

	stateEvents.off("stateChanged", handler);
});

Deno.test("Integration: event emission timing", async () => {
	resetTestState();
	
	const eventTimestamps: number[] = [];
	
	stateEvents.on("stateChanged", () => {
		eventTimestamps.push(Date.now());
	});

	// Configuration change
	const startTime = Date.now();
	state.rotationEnabled = true;
	await saveState();
	
	// Should fire immediately
	const timeDiff = eventTimestamps[0] - startTime;
	assert(timeDiff < 100, "Event should fire immediately after saveState");

	// Source switch (no event)
	const beforeSwitch = Date.now();
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");
	await new Promise(resolve => setTimeout(resolve, 50));
	
	assertEquals(eventTimestamps.length, 1, "Source switch should NOT add to event timestamps");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("Integration: multiple handlers with source switches", async () => {
	resetTestState();
	
	let handler1Count = 0;
	let handler2Count = 0;
	
	const handler1 = () => { handler1Count++; };
	const handler2 = () => { handler2Count++; };
	
	stateEvents.on("stateChanged", handler1);
	stateEvents.on("stateChanged", handler2);

	// Configuration change (both handlers should fire)
	state.rotationEnabled = true;
	await saveState();
	assertEquals(handler1Count, 1, "Handler 1 should fire");
	assertEquals(handler2Count, 1, "Handler 2 should fire");

	// Source switches (neither should fire)
	for (let i = 1; i <= 5; i++) {
		await mockSwitchToSource("http://localhost:5000", i, `Source ${i}`);
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	
	assertEquals(handler1Count, 1, "Handler 1 should not fire for source switches");
	assertEquals(handler2Count, 1, "Handler 2 should not fire for source switches");

	stateEvents.off("stateChanged", handler1);
	stateEvents.off("stateChanged", handler2);
});

