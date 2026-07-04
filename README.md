# Files Mover

A simple Node.js utility to automate moving files from a source directory to a specified destination.

## Installation

```bash
npm init
npm install --save-dev typescript @types/node
# If using Express:
npm install express
npm install --save-dev @types/express
npm i ts-node --save-dev
# For API Testing
npm install --save-dev jest
npm install dotenv --save-dev
```

## Configuration

Set these in `.env` before running:

| Env var | Description |
|---|---|
| `SOURCE_ROOT` | Absolute path browsed by the **Source** panel |
| `DESTINATION_ROOT` | Absolute path browsed by the **Destination** panel |

Example:

```env
SOURCE_ROOT=C:/data/source
DESTINATION_ROOT=C:/data/destination
```

## To Run

```bash
nodemon
```

Server runs at http://localhost:3300 (override with `PORT`).

## To Test

```bash
npm run test
# or
npx jest

npx jest -t "with invalid file type"
```

## UI

Open http://localhost:3300 — dual directory browsers for **Source** and **Destination**, plus an editable **Ignore directories** list. Both panels read from the real filesystem under `SOURCE_ROOT` and `DESTINATION_ROOT`.

- Check items in the **Source** panel with checkboxes (files and folders); use **Select all** / **Unselect all** for the current folder view
- Browse to the target folder in **Destination**, then check the folder checkbox (shows the current folder name); the readonly field updates when selected
- Click **Start copy** to copy selected source items into the destination (folders as subfolders, files placed directly in the destination folder)
- Selections apply to the current folder view only and clear when you navigate
- Ignored directory names are hidden from listings, skipped during copy, and persisted in `localStorage`

## APIs

### Health

- `GET /api/ping` — returns `{ "message": "pong" }`

### Browse source (filesystem)

`GET /api/source/browse`

Lists directories under `SOURCE_ROOT`. Returns 503 if `SOURCE_ROOT` is not set.

| Query param | Description |
|---|---|
| `root` | Optional relative path within `SOURCE_ROOT`. Omit for root listing. |
| `ignore` | Optional comma-separated directory **names** to hide (e.g. `node_modules,.git`) |

**Example**

```bash
curl "http://localhost:3300/api/source/browse?root=my-folder&ignore=node_modules"
```

### Browse destination (filesystem)

`GET /api/destination/browse`

Same query params and response shape as source browse, rooted at `DESTINATION_ROOT`. Returns 503 if `DESTINATION_ROOT` is not set.

**Example**

```bash
curl "http://localhost:3300/api/destination/browse?root=output&ignore=node_modules"
```

**Response (200)**

```json
{
  "path": "my-folder",
  "parent": "",
  "entries": [
    { "name": "src", "type": "directory" },
    { "name": "readme.md", "type": "file" }
  ],
  "message": ""
}
```

### Copy

`POST /api/copy`

Copies selected items from `SOURCE_ROOT` into a folder under `DESTINATION_ROOT`. Returns 503 if either root env var is missing.

| Body field | Description |
|---|---|
| `sources` | Array of relative paths within `SOURCE_ROOT` (e.g. `["projects/app", "readme.md"]`). |
| `source` | Legacy single path (same as one entry in `sources`). |
| `destination` | Target directory path within `DESTINATION_ROOT` (e.g. `backups`). Use `""` for the destination root. |
| `ignore` | Optional comma-separated directory **names** to skip (e.g. `node_modules,.git`). |

Directories are copied as **subfolders** of the destination (e.g. `projects/app` → `backups` creates `backups/app/...`). Files are copied directly into the destination folder.

**Example**

```bash
curl -X POST http://localhost:3300/api/copy \
  -H "Content-Type: application/json" \
  -d '{"sources":["projects/app","projects/app/readme.md"],"destination":"backups","ignore":"node_modules,.git"}'
```

**Response (200)**

```json
{
  "message": "",
  "source": "projects/app",
  "sources": ["projects/app", "projects/app/readme.md"],
  "destination": "backups",
  "copiedFiles": 13,
  "copiedDirectories": 4,
  "skipped": ["projects/app/node_modules", "projects/app/.git"]
}
```
