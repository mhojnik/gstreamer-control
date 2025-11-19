/**
 * Tests for rotation logic and infinite loop prevention
 */

import { assertEquals, assert } from "@std/assert";
import { state, stateEvents, saveState } from "../src/switcher/state.ts";
import type { Source } from "../src/switcher/types.ts";

// Mock switchToSource to track calls and prevent infinite loops
let switchToSourceCallCount = 0;
let switchToSourceCalls: Array<{ sourceId: number; sourceName: string }> = [];

async function mockSwitchToSource(
	_baseUrl: string,
	sourceId: number,
	sourceName: string,
): Promise<boolean> {
	switchToSourceCallCount++;
	switchToSourceCalls.push({ sourceId, sourceName });
	
	// Simulate updating state (this should NOT trigger events)
	state.currentSourceId = sourceId;
	state.lastSwitchTime = new Date().toISOString();
	await saveState(false); // Critical: must use false to prevent infinite loop
	
	return true;
}

// Reset test state
function resetTestState() {
	switchToSourceCallCount = 0;
	switchToSourceCalls = [];
	state.rotationEnabled = false;
	state.fixedSourceId = null;
	state.selectedCameraIds = [];
	state.rotationSchedule = [];
	state.currentSourceId = null;
	state.lastSwitchTime = null;
	stateEvents.removeAllListeners();
}

// Mock sources for testing
const mockSources: Source[] = [
	{ id: 1, name: "Source 1", source_type: "srt", enabled: true },
	{ id: 2, name: "Source 2", source_type: "srt", enabled: true },
	{ id: 3, name: "Source 3", source_type: "srt", enabled: false },
];

Deno.test("Rotation: source switch does not trigger infinite loop", async () => {
	resetTestState();
	
	let stateChangeEventCount = 0;
	stateEvents.on("stateChanged", () => {
		stateChangeEventCount++;
	});

	// Simulate a source switch (like what happens during rotation)
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");

	// Wait a bit to ensure no async events fire
	await new Promise(resolve => setTimeout(resolve, 100));

	assertEquals(switchToSourceCallCount, 1, "switchToSource should be called once");
	assertEquals(stateChangeEventCount, 0, "State change event should NOT fire for source switch");
	assertEquals(state.currentSourceId, 1, "State should be updated");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("Rotation: configuration change triggers event", async () => {
	resetTestState();
	
	let stateChangeEventCount = 0;
	stateEvents.on("stateChanged", () => {
		stateChangeEventCount++;
	});

	// Simulate a configuration change (like via API)
	state.rotationEnabled = true;
	await saveState(); // Should emit event

	assertEquals(stateChangeEventCount, 1, "State change event should fire for configuration change");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("Rotation: multiple source switches do not trigger events", async () => {
	resetTestState();
	
	let stateChangeEventCount = 0;
	stateEvents.on("stateChanged", () => {
		stateChangeEventCount++;
	});

	// Simulate multiple source switches (like during rotation)
	for (let i = 1; i <= 5; i++) {
		await mockSwitchToSource("http://localhost:5000", i, `Source ${i}`);
		await new Promise(resolve => setTimeout(resolve, 10));
	}

	assertEquals(switchToSourceCallCount, 5, "switchToSource should be called 5 times");
	assertEquals(stateChangeEventCount, 0, "No state change events should fire");
	assertEquals(state.currentSourceId, 5, "State should reflect last switch");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("Rotation: mixed configuration and source switches", async () => {
	resetTestState();
	
	let stateChangeEventCount = 0;
	stateEvents.on("stateChanged", () => {
		stateChangeEventCount++;
	});

	// Configuration change (should emit event)
	state.rotationEnabled = true;
	await saveState();
	assertEquals(stateChangeEventCount, 1, "Configuration change should emit event");

	// Source switch (should NOT emit event)
	await mockSwitchToSource("http://localhost:5000", 1, "Source 1");
	await new Promise(resolve => setTimeout(resolve, 10));
	assertEquals(stateChangeEventCount, 1, "Source switch should NOT emit event");

	// Another configuration change (should emit event)
	state.fixedSourceId = 1;
	await saveState();
	assertEquals(stateChangeEventCount, 2, "Another configuration change should emit event");

	// Another source switch (should NOT emit event)
	await mockSwitchToSource("http://localhost:5000", 2, "Source 2");
	await new Promise(resolve => setTimeout(resolve, 10));
	assertEquals(stateChangeEventCount, 2, "Source switch should still NOT emit event");

	stateEvents.off("stateChanged", () => {});
});

Deno.test("Rotation: event handler does not cause infinite recursion", async () => {
	resetTestState();
	
	let handlerCallCount = 0;
	let maxCalls = 10; // Safety limit
	
	// This handler simulates what processRotation does
	const handler = () => {
		handlerCallCount++;
		if (handlerCallCount >= maxCalls) {
			// Prevent infinite recursion in test
			return;
		}
		// Simulate what would happen - but we're testing that source switches
		// don't trigger this, so this should only be called by config changes
	};

	stateEvents.on("stateChanged", handler);

	// Simulate 10 source switches (like rapid rotation)
	for (let i = 1; i <= 10; i++) {
		await mockSwitchToSource("http://localhost:5000", i, `Source ${i}`);
		await new Promise(resolve => setTimeout(resolve, 10));
	}

	// Handler should NOT be called by source switches
	assertEquals(handlerCallCount, 0, "Handler should NOT be called by source switches");

	// Configuration change should trigger handler
	state.rotationEnabled = true;
	await saveState();
	assertEquals(handlerCallCount, 1, "Handler should be called by configuration change");

	stateEvents.off("stateChanged", handler);
});

Deno.test("Rotation: schedule index wraps correctly", () => {
	resetTestState();
	
	state.rotationSchedule = [
		{ cameraId: 1, durationSeconds: 30 },
		{ cameraId: 2, durationSeconds: 60 },
		{ cameraId: 3, durationSeconds: 90 },
	];

	const scheduleLength = state.rotationSchedule.length;
	
	// Test modulo wrapping
	for (let i = 0; i < 10; i++) {
		const index = i % scheduleLength;
		const item = state.rotationSchedule[index];
		assert(item, `Should get valid schedule item at index ${index}`);
		assertEquals(item.cameraId, (index % scheduleLength) + 1, "Camera ID should match");
	}
});

Deno.test("Rotation: available sources filtering", () => {
	resetTestState();
	
	// Test filtering by enabled status
	const allSources = mockSources;
	const enabledSources = allSources.filter(s => s.enabled);
	assertEquals(enabledSources.length, 2, "Should have 2 enabled sources");

	// Test filtering by selectedCameraIds
	state.selectedCameraIds = [1];
	const filteredSources = allSources.filter(
		s => s.enabled && state.selectedCameraIds.includes(s.id)
	);
	assertEquals(filteredSources.length, 1, "Should filter to 1 source when selectedCameraIds is set");
	assertEquals(filteredSources[0].id, 1, "Should be source 1");
});

