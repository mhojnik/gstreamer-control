#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Overlay Manager - Control HTML overlay visibility and URL
 *
 * Environment Variables:
 *    BASE_URL           Base URL of the pipeline service (default: https://nw4ckks004cw4kwwskwck40k.sljeme360.apsiscloud.com)
 *    DEFAULT_OVERLAY_URL Default overlay URL (default: https://sljeme360-overlay.widecast.workers.dev/)
 *
 * Usage:
 *    deno run --allow-net --allow-env overlay.ts [command] [base_url]
 *
 * Commands:
 *    status              Show current overlay status
 *    enable              Enable/show the overlay
 *    disable             Disable/hide the overlay
 *    set-url URL         Change the overlay URL
 *    refresh             Force reload current URL (clears cache)
 *
 * Examples:
 *    deno run --allow-net --allow-env overlay.ts status
 *    deno run --allow-net --allow-env overlay.ts enable http://localhost:5000
 *    BASE_URL=http://localhost:5000 deno run --allow-net --allow-env overlay.ts status
 *    deno run --allow-net --allow-env overlay.ts disable
 *    deno run --allow-net --allow-env overlay.ts set-url https://sljeme360-overlay.widecast.workers.dev/
 *    deno run --allow-net --allow-env overlay.ts refresh
 */

interface OverlayStatus {
  enabled?: boolean;
  visible?: boolean;
  url?: string;
  message?: string;
}

// Configuration - read from environment variables with fallbacks
const DEFAULT_BASE_URL = Deno.env.get("BASE_URL");

async function getOverlayStatus(baseUrl: string): Promise<OverlayStatus | null> {
  /** Get current HTML overlay status */
  try {
    const response = await fetch(`${baseUrl}/overlay/html`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return await response.json();
    } else {
      console.error(`❌ Failed to get overlay status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching overlay status: ${error}`);
    return null;
  }
}

async function showOverlay(baseUrl: string): Promise<boolean> {
  /** Enable/show the HTML overlay */
  try {
    const response = await fetch(`${baseUrl}/overlay/html`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visible: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data: OverlayStatus = await response.json();
      console.log(`✅ HTML overlay enabled`);
      console.log(`   URL: ${data.url || "N/A"}`);
      return true;
    } else {
      console.error(`❌ Failed to enable overlay: ${response.status}`);
      if (response.status === 500) {
        console.log("\n⚠️  HTML overlay not initialized. To enable it:");
        console.log("   1. Add to compose.yml environment:");
        console.log("      - ENABLE_HTML_OVERLAY=true");
        console.log(
          "      - HTML_OVERLAY_URL=https://sljeme360-overlay.widecast.workers.dev/"
        );
        console.log("   2. Restart: docker-compose restart");
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Error enabling overlay: ${error}`);
    return false;
  }
}

async function hideOverlay(baseUrl: string): Promise<boolean> {
  /** Disable/hide the HTML overlay */
  try {
    const response = await fetch(`${baseUrl}/overlay/html`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visible: false }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      console.log(`✅ HTML overlay disabled`);
      return true;
    } else {
      const text = await response.text();
      console.error(
        `❌ Failed to disable overlay: ${response.status} - ${text}`
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Error disabling overlay: ${error}`);
    return false;
  }
}

async function refreshOverlay(baseUrl: string): Promise<boolean> {
  /** Force refresh the HTML overlay by reloading the current URL */
  try {
    // First get the current URL
    const status = await getOverlayStatus(baseUrl);
    if (!status || !status.enabled) {
      console.error("❌ Overlay not initialized");
      return false;
    }

    const currentUrl = status.url;
    if (!currentUrl) {
      console.error("❌ No URL configured for overlay");
      return false;
    }

    // Re-set the same URL to trigger cache-busting
    const response = await fetch(`${baseUrl}/overlay/html`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: currentUrl }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      console.log(`✅ HTML overlay refreshed: ${currentUrl}`);
      console.log(`   Cache cleared and content reloaded`);
      return true;
    } else {
      console.error(`❌ Failed to refresh overlay: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error refreshing overlay: ${error}`);
    return false;
  }
}

async function setOverlayUrl(
  baseUrl: string,
  overlayUrl: string,
  visible: boolean | null = null
): Promise<boolean> {
  /** Set the HTML overlay URL and optionally its visibility */
  try {
    const payload: { url: string; visible?: boolean } = { url: overlayUrl };
    if (visible !== null) {
      payload.visible = visible;
    }

    const response = await fetch(`${baseUrl}/overlay/html`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data: OverlayStatus = await response.json();
      console.log(`✅ HTML overlay URL updated: ${overlayUrl}`);
      if (data.visible !== undefined) {
        const status = data.visible ? "enabled" : "disabled";
        console.log(`   Status: ${status}`);
      }
      return true;
    } else {
      console.error(`❌ Failed to set overlay URL: ${response.status}`);
      if (response.status === 500) {
        console.log("\n⚠️  HTML overlay not initialized. To enable it:");
        console.log("   1. Add to compose.yml environment:");
        console.log("      - ENABLE_HTML_OVERLAY=true");
        console.log(
          "      - HTML_OVERLAY_URL=https://sljeme360-overlay.widecast.workers.dev/"
        );
        console.log("   2. Restart: docker-compose restart");
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Error setting overlay URL: ${error}`);
    return false;
  }
}

function printStatus(status: OverlayStatus): void {
  /** Print formatted overlay status */
  console.log("\n" + "=".repeat(70));
  console.log("HTML Overlay Status");
  console.log("=".repeat(70));

  const enabled = status.enabled || false;
  if (!enabled) {
    console.log("Status: ❌ Not initialized");
    console.log(status.message || "HTML overlay not available");
    console.log("\n⚠️  To enable HTML overlay:");
    console.log("   1. Add to compose.yml environment:");
    console.log("      - ENABLE_HTML_OVERLAY=true");
    console.log(
      "      - HTML_OVERLAY_URL=https://sljeme360-overlay.widecast.workers.dev/"
    );
    console.log("   2. Restart the container:");
    console.log("      docker-compose restart");
  } else {
    const visible = status.visible || false;
    const url = status.url || "N/A";

    const statusIcon = visible ? "✅" : "⏸️";
    const statusText = visible ? "Enabled (Visible)" : "Disabled (Hidden)";

    console.log(`Status: ${statusIcon} ${statusText}`);
    console.log(`URL: ${url}`);
  }

  console.log("=".repeat(70) + "\n");
}

function printUsage(): void {
  /** Print usage information */
  console.log(`
Overlay Manager - Control HTML overlay visibility and URL

Usage:
    deno run --allow-net --allow-env overlay.ts [command] [base_url]

Commands:
    status              Show current overlay status
    enable              Enable/show the overlay
    disable             Disable/hide the overlay
    set-url URL         Change the overlay URL
    refresh             Force reload current URL (clears cache)

Examples:
    deno run --allow-net --allow-env overlay.ts status
    deno run --allow-net --allow-env overlay.ts enable http://localhost:5000
    deno run --allow-net --allow-env overlay.ts disable
    deno run --allow-net --allow-env overlay.ts set-url https://sljeme360-overlay.widecast.workers.dev/
    deno run --allow-net --allow-env overlay.ts refresh
`);
}

async function main(): Promise<void> {
  /** Main function */
  const args = Deno.args;

  if (args.length < 1) {
    console.error("❌ Error: Command required\n");
    printUsage();
    Deno.exit(1);
  }

  const command = args[0].toLowerCase();

  // Determine base URL (priority: command line arg > env var > default)
  let baseUrl = DEFAULT_BASE_URL;

  if (!baseUrl) {
    console.error("❌ Error: BASE_URL environment variable is not set\n");
    printUsage();
    Deno.exit(1);
  }

  if (command === "status" || command === "enable" || command === "disable" || command === "refresh") {
    if (args.length > 1) {
      baseUrl = args[1];
    }
  } else if (command === "set-url") {
    if (args.length < 2) {
      console.error("❌ Error: URL required for set-url command\n");
      printUsage();
      Deno.exit(1);
    }
    if (args.length > 2) {
      baseUrl = args[2];
    }
  }

  console.log(`Overlay Manager - Connecting to ${baseUrl}\n`);

  // Health check
  try {
    const response = await fetch(`${baseUrl}/health`, {
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

  // Execute command
  if (command === "status") {
    const status = await getOverlayStatus(baseUrl);
    if (status) {
      printStatus(status);
    } else {
      Deno.exit(1);
    }
  } else if (command === "enable") {
    const success = await showOverlay(baseUrl);
    Deno.exit(success ? 0 : 1);
  } else if (command === "disable") {
    const success = await hideOverlay(baseUrl);
    Deno.exit(success ? 0 : 1);
  } else if (command === "refresh") {
    const success = await refreshOverlay(baseUrl);
    Deno.exit(success ? 0 : 1);
  } else if (command === "set-url") {
    const overlayUrl = args[1];
    // By default, enable the overlay when setting a new URL
    const success = await setOverlayUrl(baseUrl, overlayUrl, true);
    Deno.exit(success ? 0 : 1);
  } else {
    console.error(`❌ Error: Unknown command '${command}'\n`);
    printUsage();
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}

