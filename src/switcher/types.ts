/**
 * Type definitions for the switcher
 */

export interface Source {
	id: number;
	name?: string;
	source_type: string;
	enabled?: boolean;
	is_healthy?: boolean;
	uri?: string;
	file_path?: string;
}

export interface SourcesResponse {
	sources: Source[];
}

export interface SourceResponse {
	id: number;
}

export interface RotationScheduleItem {
	cameraId: number;
	durationSeconds: number;
}

export interface SwitcherState {
	rotationEnabled: boolean;
	fixedSourceId: number | null;
	selectedCameraIds: number[];
	rotationSchedule: RotationScheduleItem[];
	currentSourceId: number | null;
	lastSwitchTime: string | null;
	currentScheduleIndex: number | null; // Index of currently active camera in schedule
}

