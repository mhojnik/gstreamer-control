/**
 * State management with persistence
 */

import type { SwitcherState } from "./types.ts";

const DATA_DIR = "./data";
const STATE_FILE = `${DATA_DIR}/state.json`;

/**
 * Simple EventEmitter for state change events
 */
class EventEmitter {
	private listeners: Map<string, Set<() => void>> = new Map();

	on(event: string, listener: () => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(listener);
	}

	off(event: string, listener: () => void): void {
		this.listeners.get(event)?.delete(listener);
	}

	emit(event: string): void {
		this.listeners.get(event)?.forEach((listener) => listener());
	}

	removeAllListeners(event?: string): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}
}

/**
 * Global event emitter for state changes
 */
export const stateEvents = new EventEmitter();

/**
 * Default state
 */
const defaultState: SwitcherState = {
	rotationEnabled: false,
	fixedSourceId: null,
	selectedCameraIds: [],
	rotationSchedule: [],
	currentSourceId: null,
	lastSwitchTime: null,
	currentScheduleIndex: null,
};

/**
 * Global state instance
 */
export const state: SwitcherState = { ...defaultState };

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
	try {
		await Deno.mkdir(DATA_DIR, { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.AlreadyExists)) {
			throw error;
		}
	}
}

/**
 * Load state from disk
 */
export async function loadState(): Promise<void> {
	try {
		await ensureDataDir();
		const data = await Deno.readTextFile(STATE_FILE);
		const loaded = JSON.parse(data) as Partial<SwitcherState>;
		
		// Merge with defaults, only override if values exist
		if (loaded.rotationEnabled !== undefined) {
			state.rotationEnabled = loaded.rotationEnabled;
		}
		if (loaded.fixedSourceId !== undefined) {
			state.fixedSourceId = loaded.fixedSourceId;
		}
		if (loaded.selectedCameraIds !== undefined) {
			state.selectedCameraIds = loaded.selectedCameraIds;
		}
		if (loaded.rotationSchedule !== undefined) {
			state.rotationSchedule = loaded.rotationSchedule;
		}
		if (loaded.currentSourceId !== undefined) {
			state.currentSourceId = loaded.currentSourceId;
		}
		if (loaded.lastSwitchTime !== undefined) {
			state.lastSwitchTime = loaded.lastSwitchTime;
		}
		if (loaded.currentScheduleIndex !== undefined) {
			state.currentScheduleIndex = loaded.currentScheduleIndex;
		}
		
		console.log("✅ Loaded state from disk");
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) {
			console.log("ℹ️  No saved state found, using defaults");
		} else {
			console.error(`⚠️  Error loading state: ${error}`);
		}
	}
}

/**
 * Save state to disk
 * @param emitEvent - Whether to emit a stateChanged event (default: true)
 *                    Set to false when updating operational state (currentSourceId, lastSwitchTime)
 */
export async function saveState(emitEvent: boolean = true): Promise<void> {
	try {
		await ensureDataDir();
		await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2));
		if (emitEvent) {
			stateEvents.emit("stateChanged");
		}
	} catch (error) {
		console.error(`⚠️  Error saving state: ${error}`);
	}
}

