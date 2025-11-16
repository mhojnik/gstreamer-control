#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --env-file
/**
 * Source Switcher - Rotates between all available sources every 2 minutes
 * Optionally plays sljeme_zicara.mp4 video after N SRT source switches (configurable via SWITCHES_BEFORE_VIDEO)
 *
 * Environment Variables (can be set via .env file or environment):
 *    BASE_URL                  Base URL of the pipeline service
 *    SWITCH_INTERVAL_SECONDS   Seconds between source switches (default: 120)
 *    VIDEO_FILE                Video file path to play (default: sljeme_zicara.mp4)
 *    SWITCHES_BEFORE_VIDEO     Number of SRT switches before playing video, 0 to disable (default: 0)
 *
 * Usage:
 *    deno run --allow-net --allow-env --allow-read --env-file switcher.ts [base_url]
 *
 * Example:
 *    deno run --allow-net --allow-env --allow-read --env-file switcher.ts http://localhost:5000
 *    BASE_URL=http://localhost:5000 SWITCH_INTERVAL_SECONDS=60 deno run --allow-net --allow-env --allow-read --env-file switcher.ts
 */

interface Source {
  id: number;
  name?: string;
  source_type: string;
  enabled?: boolean;
  is_healthy?: boolean;
  uri?: string;
  file_path?: string;
}

interface SourcesResponse {
  sources: Source[];
}

interface SourceResponse {
  id: number;
}

// Configuration - read from environment variables with fallbacks
// Note: .env file is automatically loaded via --env-file flag
const BASE_URL = Deno.args[0] || 
  Deno.env.get("BASE_URL");
const SWITCH_INTERVAL_SECONDS = parseInt(
  Deno.env.get("SWITCH_INTERVAL_SECONDS") || "120",
  10
); // 2 minutes default
const VIDEO_FILE = Deno.env.get("VIDEO_FILE") || "sljeme_zicara.mp4";
const SWITCHES_BEFORE_VIDEO = parseInt(
  Deno.env.get("SWITCHES_BEFORE_VIDEO") || "0",
  10
); // Set to 0 to disable video playback, or set to N to play video after every N SRT switches

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function getSources(): Promise<Source[] | null> {
  /** Fetch list of all available sources from the API */
  try {
    const response = await fetch(`${BASE_URL}/sources`, {
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

async function addVideoSource(filePath: string, name: string): Promise<number | null> {
  /** Add a video source to the pipeline */
  try {
    const response = await fetch(`${BASE_URL}/sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "video",
        file_path: filePath,
        name: name,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 201) {
      const data: SourceResponse = await response.json();
      const sourceId = data.id;
      console.log(`✅ Added video source: ID=${sourceId}, File=${filePath}`);
      return sourceId;
    } else {
      const text = await response.text();
      console.error(`⚠️  Could not add video source: ${response.status} - ${text}`);
      return null;
    }
  } catch (error) {
    console.error(`⚠️  Error adding video source: ${error}`);
    return null;
  }
}

function findVideoSource(sources: Source[], filePath: string): Source | null {
  /** Find a video source by file path */
  return sources.find(
    (source) => source.source_type === "video" && source.file_path === filePath
  ) || null;
}

async function switchToSource(sourceId: number, sourceName: string): Promise<boolean> {
  /** Switch to a specific source */
  try {
    const response = await fetch(`${BASE_URL}/source/active`, {
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

function printSourcesList(sources: Source[]): void {
  /** Print formatted list of sources */
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
    } else if (sourceType === "video") {
      const filePath = source.file_path || "N/A";
      console.log(`     File: ${filePath}`);
    }
  }

  console.log("=".repeat(70) + "\n");
}

async function main(): Promise<void> {
  /** Main loop - rotates through sources every 2 minutes, optionally plays video after N switches (if SWITCHES_BEFORE_VIDEO > 0) */
  if (!BASE_URL) {
    console.error("❌ Error: BASE_URL environment variable is not set\n");
    Deno.exit(1);
  }

  console.log(`Source Switcher - Connecting to ${BASE_URL}`);
  console.log(
    `Switch interval: ${SWITCH_INTERVAL_SECONDS} seconds (${SWITCH_INTERVAL_SECONDS / 60} minutes)`
  );
  if (SWITCHES_BEFORE_VIDEO > 0) {
    console.log(
      `Video playback: After every ${SWITCHES_BEFORE_VIDEO} SRT source switches\n`
    );
  } else {
    console.log(`Video playback: Disabled\n`);
  }

  // Initial health check
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("❌ Health check failed. Is the service running?");
      Deno.exit(1);
    }
  } catch (error) {
    console.error(`❌ Cannot connect to service: ${error}`);
    Deno.exit(1);
  }

  console.log("✅ Connected to pipeline service\n");

  // Get initial list of sources
  const sources = await getSources();
  if (sources === null) {
    console.error("❌ Failed to retrieve sources. Exiting.");
    Deno.exit(1);
  }

  // Separate SRT and video sources - only rotate through SRT sources
  const srtSources = sources.filter(
    (s) => (s.enabled || false) && s.source_type === "srt"
  );

  if (srtSources.length === 0) {
    console.error(
      "❌ No enabled SRT sources found. Please add SRT sources before running the switcher."
    );
    Deno.exit(1);
  }

  // Check if video source exists, if not try to add it
  let videoSource = findVideoSource(sources, VIDEO_FILE);
  let videoSourceId: number | null = null;

  if (videoSource) {
    videoSourceId = videoSource.id;
    console.log(`✅ Found video source: ${VIDEO_FILE} (ID=${videoSourceId})`);
  } else {
    console.log(
      `Video source '${VIDEO_FILE}' not found, attempting to add it...`
    );
    videoSourceId = await addVideoSource(VIDEO_FILE, "Sljeme Zicara Video");
    if (videoSourceId) {
      console.log(`✅ Video source added successfully`);
    } else {
      console.log(
        `⚠️  Warning: Could not add video source. Will skip video playback.`
      );
    }
  }

  console.log();

  // Print sources list
  printSourcesList(sources);
  console.log(`Found ${srtSources.length} enabled SRT source(s) to rotate through.`);
  if (videoSourceId && SWITCHES_BEFORE_VIDEO > 0) {
    console.log(
      `Video '${VIDEO_FILE}' will play after every ${SWITCHES_BEFORE_VIDEO} switches.\n`
    );
  } else {
    if (SWITCHES_BEFORE_VIDEO === 0) {
      console.log(`⚠️  Video playback disabled (SWITCHES_BEFORE_VIDEO = 0).\n`);
    } else {
      console.log(
        `⚠️  Video playback disabled (video source not available).\n`
      );
    }
  }

  // Start rotation loop
  let currentIndex = 0;
  let switchCount = 0;
  let shouldStop = false;

  // Handle Ctrl+C gracefully
  Deno.addSignalListener("SIGINT", () => {
    shouldStop = true;
    console.log("\n\n🛑 Stopping source switcher...");
    console.log("Current source will remain active.");
    Deno.exit(0);
  });

  try {
    console.log("Starting source rotation... (Press Ctrl+C to stop)\n");

    while (!shouldStop) {
      // Check if it's time to play the video
      if (
        SWITCHES_BEFORE_VIDEO > 0 &&
        switchCount > 0 &&
        switchCount % SWITCHES_BEFORE_VIDEO === 0 &&
        videoSourceId
      ) {
        console.log(
          `🎬 Playing video after ${SWITCHES_BEFORE_VIDEO} switches...`
        );
        await switchToSource(videoSourceId, VIDEO_FILE);
        console.log(
          `   Waiting ${SWITCH_INTERVAL_SECONDS} seconds for video playback...\n`
        );
        await sleep(SWITCH_INTERVAL_SECONDS);
      }

      // Get current SRT source from rotation
      const source = srtSources[currentIndex];
      const sourceId = source.id;
      const sourceName = source.name || `Source ${sourceId}`;

      // Switch to this SRT source
      await switchToSource(sourceId, sourceName);
      switchCount++;

      // Move to next source for next iteration
      currentIndex = (currentIndex + 1) % srtSources.length;

      // Wait for the switch interval
      console.log(
        `   Waiting ${SWITCH_INTERVAL_SECONDS} seconds until next switch... (Switch #${switchCount})\n`
      );
      await sleep(SWITCH_INTERVAL_SECONDS);
    }
  } catch (error) {
    console.error(`\n❌ Unexpected error: ${error}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}

