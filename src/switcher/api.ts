/**
 * API server for remote control
 */

import type { SwitcherState, RotationScheduleItem } from "./types.ts";
import { state, saveState } from "./state.ts";
import { getSources, switchToSource } from "./pipeline.ts";
import type { Config } from "./config.ts";

let config: Config | null = null;

/**
 * Initialize API server with configuration
 */
export function initAPI(cfg: Config): void {
	config = cfg;
}

/**
 * Authenticate API request
 */
function authenticateRequest(request: Request): boolean {
	if (!config || !config.apiToken) {
		return false;
	}
	const authHeader = request.headers.get("Authorization");
	if (!authHeader) {
		return false;
	}
	const token = authHeader.replace("Bearer ", "").trim();
	return token === config.apiToken;
}

/**
 * Handle API request
 */
async function handleAPIRequest(request: Request): Promise<Response> {
	if (!config) {
		return new Response(JSON.stringify({ error: "API not initialized" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	const url = new URL(request.url);
	const path = url.pathname;
	const method = request.method;

	// Health check doesn't require auth
	if (path === "/api/health" && method === "GET") {
		return new Response(JSON.stringify({ status: "ok" }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	// All other endpoints require authentication
	if (!authenticateRequest(request)) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	// GET /api/state
	if (path === "/api/state" && method === "GET") {
		return new Response(JSON.stringify(state), {
			headers: { "Content-Type": "application/json" },
		});
	}

	// PUT /api/state
	if (path === "/api/state" && method === "PUT") {
		try {
			const body = await request.json() as Partial<SwitcherState>;
			
			if (body.rotationEnabled !== undefined) {
				state.rotationEnabled = body.rotationEnabled;
			}
			if (body.fixedSourceId !== undefined) {
				state.fixedSourceId = body.fixedSourceId;
			}
			if (body.selectedCameraIds !== undefined) {
				state.selectedCameraIds = body.selectedCameraIds;
			}
			if (body.rotationSchedule !== undefined) {
				const oldScheduleLength = state.rotationSchedule.length;
				state.rotationSchedule = body.rotationSchedule;
				// Reset schedule index if schedule length changed or index is out of bounds
				if (
					state.currentScheduleIndex !== null &&
					(oldScheduleLength !== body.rotationSchedule.length || 
					 state.currentScheduleIndex >= body.rotationSchedule.length)
				) {
					state.currentScheduleIndex = body.rotationSchedule.length > 0 ? 0 : null;
				}
			}
			
			await saveState();
			
			return new Response(JSON.stringify(state), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response(JSON.stringify({ error: "Invalid request body" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	// GET /api/sources
	if (path === "/api/sources" && method === "GET") {
		const sources = await getSources(config.baseUrl);
		if (sources === null) {
			return new Response(JSON.stringify({ error: "Failed to fetch sources" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ sources }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	// PUT /api/source/active
	if (path === "/api/source/active" && method === "PUT") {
		try {
			const body = await request.json() as { id: number };
			const sources = await getSources(config.baseUrl);
			if (sources === null) {
				return new Response(JSON.stringify({ error: "Failed to fetch sources" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
			
			const source = sources.find(s => s.id === body.id);
			if (!source) {
				return new Response(JSON.stringify({ error: "Source not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			}
			
			const success = await switchToSource(config.baseUrl, body.id, source.name || `Source ${body.id}`);
			if (success) {
				return new Response(JSON.stringify({ success: true, sourceId: body.id }), {
					headers: { "Content-Type": "application/json" },
				});
			} else {
				return new Response(JSON.stringify({ error: "Failed to switch source" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				});
			}
		} catch (_error) {
			return new Response(JSON.stringify({ error: "Invalid request body" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	// PUT /api/rotation/schedule
	if (path === "/api/rotation/schedule" && method === "PUT") {
		try {
			const body = await request.json() as { schedule: RotationScheduleItem[] };
			const oldScheduleLength = state.rotationSchedule.length;
			state.rotationSchedule = body.schedule;
			// Reset schedule index if schedule length changed or index is out of bounds
			if (
				state.currentScheduleIndex !== null &&
				(oldScheduleLength !== body.schedule.length || 
				 state.currentScheduleIndex >= body.schedule.length)
			) {
				state.currentScheduleIndex = body.schedule.length > 0 ? 0 : null;
			}
			await saveState();
			return new Response(JSON.stringify({ success: true, schedule: state.rotationSchedule }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response(JSON.stringify({ error: "Invalid request body" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	// PUT /api/rotation/cameras
	if (path === "/api/rotation/cameras" && method === "PUT") {
		try {
			const body = await request.json() as { cameraIds: number[] };
			state.selectedCameraIds = body.cameraIds;
			await saveState();
			return new Response(JSON.stringify({ success: true, cameraIds: state.selectedCameraIds }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response(JSON.stringify({ error: "Invalid request body" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	// 404 for unknown endpoints
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Start the API server
 */
export function startAPIServer(): void {
	if (!config) {
		throw new Error("API not initialized. Call initAPI() first.");
	}

	console.log(`🌐 Starting API server on port ${config.apiPort}...`);
	
	Deno.serve({ port: config.apiPort }, async (request) => {
		try {
			return await handleAPIRequest(request);
		} catch (error) {
			console.error(`API error: ${error}`);
			return new Response(JSON.stringify({ error: "Internal server error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	});
	
	console.log(`✅ API server running on http://localhost:${config.apiPort}`);
}

