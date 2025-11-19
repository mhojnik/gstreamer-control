/**
 * Camera API notification
 */

import type { Config } from "./config.ts";

let config: Config | null = null;

/**
 * Initialize camera API with configuration
 */
export function initCameraAPI(cfg: Config): void {
	config = cfg;
}

/**
 * Notify camera API about source switch with direction
 */
export async function notifyCameraAPI(sourceId: number): Promise<void> {
	if (!config || !config.cameraApiToken) {
		return;
	}

	const direction = config.sourceDirectionMap.get(sourceId);
	if (!direction) {
		return;
	}

	try {
		const response = await fetch(`${config.cameraApiHost}/api/camera`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${config.cameraApiToken}`,
			},
			body: JSON.stringify({ direction }),
			signal: AbortSignal.timeout(5000),
		});
		if (response.ok) {
			console.log(`   📡 Camera API notified: direction=${direction}`);
		} else {
			const text = await response.text();
			console.error(
				`   ⚠️  Camera API notification failed: ${response.status} - ${text}`
			);
		}
	} catch (error) {
		console.error(`   ⚠️  Camera API notification error: ${error}`);
	}
}

