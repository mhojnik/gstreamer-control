/**
 * Pipeline service client
 */

import type { Source, SourcesResponse } from "./types.ts";
import { state, saveState } from "./state.ts";
import { notifyCameraAPI } from "./camera.ts";

/**
 * Fetch list of all available sources from the pipeline API
 */
export async function getSources(baseUrl: string): Promise<Source[] | null> {
	try {
		const response = await fetch(`${baseUrl}/sources`, {
			signal: AbortSignal.timeout(5000),
		});
		if (response.ok) {
			const data: SourcesResponse = await response.json();
			return data.sources || [];
		} else {
			console.error(`❌ Failed to get sources: ${response.status}`);
			return null;
		}
	} catch (error) {
		console.error(`❌ Error fetching sources: ${error}`);
		return null;
	}
}

/**
 * Switch to a specific source
 */
export async function switchToSource(
	baseUrl: string,
	sourceId: number,
	sourceName: string,
	notifyCamera: boolean = true
): Promise<boolean> {
	try {
		const response = await fetch(`${baseUrl}/source/active`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ id: sourceId }),
			signal: AbortSignal.timeout(5000),
		});
		if (response.ok) {
			const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
			console.log(`[${timestamp}] ✅ Switched to source ${sourceId}: ${sourceName}`);

			// Update state (don't emit event - this is operational state, not configuration)
			state.currentSourceId = sourceId;
			state.lastSwitchTime = new Date().toISOString();
			await saveState(false);

			// Notify camera API after successful switch
			if (notifyCamera) {
				await notifyCameraAPI(sourceId);
			}

			return true;
		} else {
			const text = await response.text();
			console.error(
				`❌ Failed to switch to source ${sourceId}: ${response.status} - ${text}`
			);
			return false;
		}
	} catch (error) {
		console.error(`❌ Error switching source: ${error}`);
		return false;
	}
}

/**
 * Check pipeline service health
 */
export async function checkHealth(baseUrl: string): Promise<boolean> {
	try {
		const response = await fetch(`${baseUrl}/health`, {
			signal: AbortSignal.timeout(5000),
		});
		return response.ok;
	} catch (_error) {
		return false;
	}
}

/**
 * Print formatted list of sources
 */
export function printSourcesList(sources: Source[]): void {
	console.log("\n" + "=".repeat(70));
	console.log("Available Sources:");
	console.log("=".repeat(70));

	if (sources.length === 0) {
		console.log("No sources configured.");
		return;
	}

	for (const source of sources) {
		const sourceId = source.id;
		const name = source.name || "Unnamed";
		const sourceType = source.source_type || "unknown";
		const enabled = source.enabled || false;
		const healthy = source.is_healthy || false;

		const status = enabled ? "✓" : "✗";
		const health = healthy ? "●" : "○";

		console.log(`  ${status} ID ${sourceId}: ${name}`);
		console.log(
			`     Type: ${sourceType} | Health: ${health} ${healthy ? "(healthy)" : "(unhealthy)"}`
		);

		if (sourceType === "srt") {
			const uri = source.uri || "N/A";
			console.log(`     URI: ${uri}`);
		}
	}

	console.log("=".repeat(70) + "\n");
}

