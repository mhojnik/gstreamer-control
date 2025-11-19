#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --env-file
/**
 * Source Switcher - Rotates between camera sources with remote API control
 * 
 * Environment Variables (can be set via .env file or environment):
 *    BASE_URL                  Base URL of the pipeline service
 *    API_PORT                  Port for the API server (default: 3000)
 *    API_TOKEN                 Bearer token for API authentication (required)
 *    CAMERA_API_HOST           Camera API host URL (default: http://localhost:3000)
 *    CAMERA_API_TOKEN          Bearer token for camera API authentication
 *    SOURCE_DIRECTION_MAP      Comma-separated mapping of source IDs to directions (e.g., "1:N,2:E,3:W,4:S")
 *
 * Usage:
 *    deno run --allow-net --allow-env --allow-read --allow-write --env-file switcher.ts [base_url]
 *
 * Example:
 *    deno run --allow-net --allow-env --allow-read --allow-write --env-file switcher.ts http://localhost:5000
 */

import { loadConfig } from "./src/switcher/config.ts";
import { loadState } from "./src/switcher/state.ts";
import { getSources, checkHealth, printSourcesList } from "./src/switcher/pipeline.ts";
import { initCameraAPI } from "./src/switcher/camera.ts";
import { initAPI, startAPIServer } from "./src/switcher/api.ts";
import { runRotationLoop } from "./src/switcher/rotation.ts";

function sleep(seconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main(): Promise<void> {
	// Load configuration
	let config;
	try {
		config = loadConfig(Deno.args[0]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`❌ Error: ${message}\n`);
		Deno.exit(1);
	}

	console.log(`Source Switcher - Connecting to ${config.baseUrl}`);
	console.log(`API Server: http://localhost:${config.apiPort}`);
	if (config.cameraApiToken && config.sourceDirectionMap.size > 0) {
		console.log(`Camera API: Enabled (${config.sourceDirectionMap.size} source(s) mapped)`);
	} else if (config.cameraApiToken) {
		console.log(`Camera API: Token configured but no source mappings found`);
	} else {
		console.log(`Camera API: Disabled (no token configured)`);
	}
	console.log();

	// Initialize modules
	initCameraAPI(config);
	initAPI(config);

	// Load saved state
	await loadState();

	// Initial health check
	if (!await checkHealth(config.baseUrl)) {
		console.error("❌ Health check failed. Is the service running?");
		Deno.exit(1);
	}

	console.log("✅ Connected to pipeline service\n");

	// Get initial list of sources
	const sources = await getSources(config.baseUrl);
	if (sources === null) {
		console.error("❌ Failed to retrieve sources. Exiting.");
		Deno.exit(1);
	}

	// Print sources list
	printSourcesList(sources);

	const srtSources = sources.filter(
		(s) => (s.enabled || false) && s.source_type === "srt"
	);
	console.log(`Found ${srtSources.length} enabled SRT source(s).\n`);

	// Start API server (non-blocking)
	startAPIServer();

	// Give API server a moment to start
	await sleep(1);

	// Start rotation loop
	await runRotationLoop(config.baseUrl, sources);
}

if (import.meta.main) {
	main();
}
