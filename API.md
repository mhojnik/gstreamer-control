# Switcher API Documentation

## Overview

The Switcher API provides remote control over the source switcher service. It allows you to get and set state, define camera rotation schedules, select cameras for rotation, disable rotation, and set a fixed source.

## Base URL

The API server runs on port 3000 by default (configurable via `API_PORT` environment variable).

```
http://localhost:3000
```

## Authentication

All endpoints except `/api/health` require Bearer token authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer <API_TOKEN>
```

The `API_TOKEN` must be set as an environment variable when starting the switcher.

## Endpoints

### GET /api/health

Health check endpoint. Does not require authentication.

**Response:**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl http://localhost:3000/api/health
```

---

### GET /api/state

Get the current switcher state.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)

**Response:**
```json
{
  "rotationEnabled": false,
  "fixedSourceId": 1,
  "selectedCameraIds": [1, 2, 3],
  "rotationSchedule": [
    { "cameraId": 1, "durationSeconds": 60 },
    { "cameraId": 2, "durationSeconds": 120 },
    { "cameraId": 3, "durationSeconds": 90 }
  ],
  "currentSourceId": 1,
  "lastSwitchTime": "2024-01-15T10:30:00.000Z",
  "currentScheduleIndex": 0
}
```

**Fields:**
- `rotationEnabled` (boolean): Whether rotation is currently enabled
- `fixedSourceId` (number | null): The fixed source ID when rotation is disabled
- `selectedCameraIds` (number[]): Array of camera IDs to include in rotation
- `rotationSchedule` (array): Per-camera rotation schedule with duration for each camera
- `currentSourceId` (number | null): Currently active source ID
- `lastSwitchTime` (string | null): ISO timestamp of last source switch
- `currentScheduleIndex` (number | null): Index of the currently active camera in the rotation schedule. `null` when rotation is disabled or no schedule is active. Use this to determine which camera in the schedule is currently being displayed.

**Example:**
```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:3000/api/state
```

---

### PUT /api/state

Update the switcher state. Supports partial updates - only include fields you want to change.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "rotationEnabled": true,
  "fixedSourceId": null,
  "selectedCameraIds": [1, 2, 3],
  "rotationSchedule": [
    { "cameraId": 1, "durationSeconds": 60 },
    { "cameraId": 2, "durationSeconds": 120 }
  ]
}
```

**All fields are optional:**
- `rotationEnabled` (boolean): Enable or disable rotation
- `fixedSourceId` (number | null): Set a fixed source when rotation is disabled
- `selectedCameraIds` (number[]): Set which cameras to include in rotation
- `rotationSchedule` (array): Set the per-camera rotation schedule

**Response:**
Returns the complete updated state (same format as GET /api/state).

**Example:**
```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"rotationEnabled": true, "fixedSourceId": null}' \
  http://localhost:3000/api/state
```

**Behavior:**
- When `rotationEnabled` is set to `false`, the switcher will set the `fixedSourceId` (if provided) and pause rotation
- When `rotationEnabled` is set to `true`, the switcher will follow the `rotationSchedule`
- If `rotationSchedule` is empty when rotation is enabled, the switcher will wait for a schedule to be set

---

### GET /api/sources

Get the list of all available sources from the pipeline service.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)

**Response:**
```json
{
  "sources": [
    {
      "id": 1,
      "name": "North Camera",
      "source_type": "srt",
      "enabled": true,
      "is_healthy": true,
      "uri": "srt://example.com:5000"
    },
    {
      "id": 2,
      "name": "South Camera",
      "source_type": "srt",
      "enabled": true,
      "is_healthy": true,
      "uri": "srt://example.com:5001"
    }
  ]
}
```

**Example:**
```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:3000/api/sources
```

---

### PUT /api/source/active

Manually switch to a specific source.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "id": 1
}
```

**Response:**
```json
{
  "success": true,
  "sourceId": 1
}
```

**Error Responses:**
- `404`: Source not found
- `500`: Failed to switch source

**Example:**
```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"id": 1}' \
  http://localhost:3000/api/source/active
```

---

### PUT /api/rotation/schedule

Set the per-camera rotation schedule. Each camera in the schedule will be shown for its specified duration before moving to the next camera.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "schedule": [
    { "cameraId": 1, "durationSeconds": 60 },
    { "cameraId": 2, "durationSeconds": 120 },
    { "cameraId": 3, "durationSeconds": 90 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "schedule": [
    { "cameraId": 1, "durationSeconds": 60 },
    { "cameraId": 2, "durationSeconds": 120 },
    { "cameraId": 3, "durationSeconds": 90 }
  ]
}
```

**Behavior:**
- The schedule is executed in order
- After the last camera, it loops back to the first camera
- Each camera is shown for its `durationSeconds` before switching to the next
- The schedule only takes effect when `rotationEnabled` is `true`

**Example:**
```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": [
      {"cameraId": 1, "durationSeconds": 60},
      {"cameraId": 2, "durationSeconds": 120},
      {"cameraId": 3, "durationSeconds": 90}
    ]
  }' \
  http://localhost:3000/api/rotation/schedule
```

---

### PUT /api/rotation/cameras

Set which cameras should be included in rotation. Only cameras in this list will be considered when following the rotation schedule.

**Headers:**
- `Authorization: Bearer <API_TOKEN>` (required)
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "cameraIds": [1, 2, 3]
}
```

**Response:**
```json
{
  "success": true,
  "cameraIds": [1, 2, 3]
}
```

**Behavior:**
- If `selectedCameraIds` is empty, all enabled SRT sources are available for rotation
- If `selectedCameraIds` is set, only sources with IDs in this list are used
- Cameras in the rotation schedule that are not in `selectedCameraIds` will be skipped

**Example:**
```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"cameraIds": [1, 2, 3]}' \
  http://localhost:3000/api/rotation/cameras
```

---

## Error Responses

All endpoints may return the following error responses:

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```
Returned when the `Authorization` header is missing or the token is invalid.

### 400 Bad Request
```json
{
  "error": "Invalid request body"
}
```
Returned when the request body is malformed or missing required fields.

### 404 Not Found
```json
{
  "error": "Not found"
}
```
Returned for unknown endpoints or when a requested resource doesn't exist.

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```
Returned when an unexpected error occurs on the server.

---

## Usage Examples

### Example 1: Enable Rotation with a Schedule

```bash
# 1. Set the rotation schedule
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": [
      {"cameraId": 1, "durationSeconds": 60},
      {"cameraId": 2, "durationSeconds": 120}
    ]
  }' \
  http://localhost:3000/api/rotation/schedule

# 2. Enable rotation
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"rotationEnabled": true}' \
  http://localhost:3000/api/state
```

### Example 2: Disable Rotation and Set Fixed Source

```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "rotationEnabled": false,
    "fixedSourceId": 1
  }' \
  http://localhost:3000/api/state
```

### Example 3: Select Specific Cameras for Rotation

```bash
# 1. Select which cameras to use
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"cameraIds": [1, 3, 5]}' \
  http://localhost:3000/api/rotation/cameras

# 2. Set schedule for selected cameras
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule": [
      {"cameraId": 1, "durationSeconds": 60},
      {"cameraId": 3, "durationSeconds": 90},
      {"cameraId": 5, "durationSeconds": 120}
    ]
  }' \
  http://localhost:3000/api/rotation/schedule

# 3. Enable rotation
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"rotationEnabled": true}' \
  http://localhost:3000/api/state
```

### Example 4: Manual Source Switch

```bash
curl -X PUT \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"id": 2}' \
  http://localhost:3000/api/source/active
```

### Example 5: Check Current State

```bash
curl -H "Authorization: Bearer your-token-here" http://localhost:3000/api/state
```

---

## State Persistence

The switcher automatically saves its state to `/data/state.json` whenever the state changes. This allows the configuration to survive restarts. The state is loaded automatically when the switcher starts.

The state file is created automatically in the `./data` directory if it doesn't exist.

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Camera IDs must correspond to valid source IDs from the pipeline service
- Only enabled SRT sources are considered for rotation
- The rotation schedule loops continuously when rotation is enabled
- When rotation is disabled, the switcher sets the fixed source and waits for new instructions via the API

