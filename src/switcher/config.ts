/**
 * Configuration management
 */

export interface Config {
	baseUrl: string;
	apiPort: number;
	apiToken: string;
	cameraApiHost: string;
	cameraApiToken: string | undefined;
	sourceDirectionMap: Map<number, string>;
}

/**
 * Parse source-to-direction mapping from environment variable
 * Format: "1:N,2:E,3:W,4:S" or similar
 */
function parseSourceDirectionMap(): Map<number, string> {
	const map = new Map<number, string>();
	const mapStr = Deno.env.get("SOURCE_DIRECTION_MAP");
	if (mapStr) {
		const pairs = mapStr.split(",");
		for (const pair of pairs) {
			const [sourceId, direction] = pair.split(":").map((s) => s.trim());
			const id = parseInt(sourceId, 10);
			if (!isNaN(id) && ["N", "E", "W", "S"].includes(direction.toUpperCase())) {
				map.set(id, direction.toUpperCase());
			}
		}
	}
	return map;
}

/**
 * Load configuration from environment variables and command line arguments
 */
export function loadConfig(baseUrlArg?: string): Config {
	const baseUrl = baseUrlArg || Deno.env.get("BASE_URL");
	if (!baseUrl) {
		throw new Error("BASE_URL environment variable is not set");
	}

	const apiToken = Deno.env.get("API_TOKEN");
	if (!apiToken) {
		throw new Error("API_TOKEN environment variable is not set");
	}

	return {
		baseUrl,
		apiPort: parseInt(Deno.env.get("API_PORT") || "3000", 10),
		apiToken,
		cameraApiHost: Deno.env.get("CAMERA_API_HOST") || "http://localhost:3000",
		cameraApiToken: Deno.env.get("CAMERA_API_TOKEN"),
		sourceDirectionMap: parseSourceDirectionMap(),
	};
}

