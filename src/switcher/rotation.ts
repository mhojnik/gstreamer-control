/**
 * Rotation management - Fully event-driven implementation (no loops)
 */

import type { Source } from "./types.ts";
import { state, stateEvents, saveState } from "./state.ts";
import { switchToSource } from "./pipeline.ts";

// Global state for rotation management
let currentTimer: number | null = null;
let shouldStop = false;

/**
 * Cancel current rotation timer
 */
function cancelCurrentTimer(): void {
	if (currentTimer !== null) {
		clearTimeout(currentTimer);
		currentTimer = null;
	}
}

/**
 * Filter and get available sources
 */
function getAvailableSources(sources: Source[]): Source[] {
	let availableSources = sources.filter(
		(s) => (s.enabled || false) && s.source_type === "srt"
	);

	if (state.selectedCameraIds.length > 0) {
		availableSources = availableSources.filter(s => 
			state.selectedCameraIds.includes(s.id)
		);
	}

	return availableSources;
}

/**
 * Handle fixed source mode (rotation disabled)
 * Only sets the source if needed, then waits for state change events
 */
async function handleFixedSource(
	baseUrl: string,
	sources: Source[]
): Promise<void> {
	if (state.fixedSourceId !== null) {
		const fixedSource = sources.find(s => s.id === state.fixedSourceId);
		if (fixedSource && (fixedSource.enabled || false)) {
			// Only switch if we're not already on this source
			if (state.currentSourceId !== state.fixedSourceId) {
				console.log("Rotation is disabled, setting fixed source...");
				await switchToSource(
					baseUrl,
					state.fixedSourceId,
					fixedSource.name || `Source ${state.fixedSourceId}`
				);
			}
			// Source is set, no need to poll - wait for state change events
			return;
		}
	}
	// No fixed source configured or source not available
	// Wait for state change events - no polling needed
}

/**
 * Process next rotation step
 */
async function processRotation(
	baseUrl: string,
	sources: Source[]
): Promise<void> {
	if (shouldStop) {
		return;
	}

	// Cancel any existing timer
	cancelCurrentTimer();

	// If rotation is disabled, handle fixed source and clear schedule index
	if (!state.rotationEnabled) {
		if (state.currentScheduleIndex !== null) {
			state.currentScheduleIndex = null;
			await saveState(false);
		}
		await handleFixedSource(baseUrl, sources);
		return;
	}

	// Rotation is enabled - follow schedule
	if (state.rotationSchedule.length === 0) {
		// No schedule defined - wait for state change events
		console.log("⚠️  Rotation enabled but no schedule defined. Waiting for schedule...");
		// No timer needed - will re-evaluate when state changes via events
		return;
	}

	// Initialize or reset schedule index if needed
	if (state.currentScheduleIndex === null || state.currentScheduleIndex >= state.rotationSchedule.length) {
		state.currentScheduleIndex = 0;
		await saveState(false); // Update index without emitting event
	}

	// Get current schedule item
	const scheduleItem = state.rotationSchedule[state.currentScheduleIndex % state.rotationSchedule.length];
	const cameraId = scheduleItem.cameraId;
	const duration = scheduleItem.durationSeconds;

	// Get available sources
	const availableSources = getAvailableSources(sources);

	// Find the source for this camera
	const source = availableSources.find(s => s.id === cameraId);
	
	if (source) {
		await switchToSource(baseUrl, cameraId, source.name || `Source ${cameraId}`);
		console.log(`   Waiting ${duration} seconds until next switch...\n`);
		
		// Save current index (points to the camera we just switched to - currently active)
		await saveState(false); // Update index without emitting event
		
		// Move to next item in schedule for next iteration
		state.currentScheduleIndex = (state.currentScheduleIndex + 1) % state.rotationSchedule.length;
		
		// Schedule next rotation
		currentTimer = setTimeout(() => {
			currentTimer = null;
			processRotation(baseUrl, sources);
		}, duration * 1000);
	} else {
		console.log(`⚠️  Source ${cameraId} not found or not available. Skipping...`);
		// Move to next item in schedule and save
		state.currentScheduleIndex = (state.currentScheduleIndex + 1) % state.rotationSchedule.length;
		await saveState(false); // Update index without emitting event
		
		// Retry after 5 seconds
		currentTimer = setTimeout(() => {
			currentTimer = null;
			processRotation(baseUrl, sources);
		}, 5000);
	}
}

/**
 * Handle state change events - re-evaluate rotation
 */
function handleStateChange(baseUrl: string, sources: Source[]): void {
	// Cancel current timer and re-process
	cancelCurrentTimer();
	processRotation(baseUrl, sources);
}

/**
 * Main rotation function - Fully event-driven (no loops)
 */
export async function runRotationLoop(
	baseUrl: string,
	sources: Source[]
): Promise<void> {
	// Handle Ctrl+C gracefully
	Deno.addSignalListener("SIGINT", () => {
		shouldStop = true;
		cancelCurrentTimer();
		console.log("\n\n🛑 Stopping source switcher...");
		console.log("Current source will remain active.");
		Deno.exit(0);
	});

	// Handle state change events
	const stateChangeHandler = () => {
		handleStateChange(baseUrl, sources);
	};

	stateEvents.on("stateChanged", stateChangeHandler);

	console.log("Starting rotation loop... (Press Ctrl+C to stop)\n");

	// Start the event-driven rotation process
	await processRotation(baseUrl, sources);

	// Note: This function will return, but the event-driven system continues
	// The process will keep running via timers and event handlers
}

