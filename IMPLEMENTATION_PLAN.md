# RYTC Photo Card — Implementation Plan

## Phase 1: Foundation

- Confirm or initialize Vite + React.
- Configure Tailwind CSS.
- Add PWA manifest, service worker, icons, and install metadata.
- Keep public frontend configuration separate from secrets.
- Establish modules for UI, canvas composition, storage, and API.

## Phase 2: Design and templates

- Define green, white, and yellow design tokens.
- Build responsive mobile, tablet, and desktop layouts.
- Use the eight approved 600 x 1800 px portrait template assets.
- Define photo slots per template instead of sharing one fixed layout.
- Support two-photo and three-photo templates.

## Phase 3: Image input and editing

- Implement browser camera access.
- Support front/rear camera switching.
- Add capture and retake.
- Support image selection from the device.
- Add touch-friendly zoom and crop.
- Handle camera permission denial and unsupported browsers.
- Normalize orientation and draw the final crop to Canvas.

## Phase 4: PNG creation and local save

- Render the selected image and template layers to Canvas.
- Export the final canvas as PNG.
- Generate timestamp filename, for example:
  RYTC-Photo-2026-07-18-143025.png
- Trigger a device download.
- Keep the PNG available for upload and retry.

## Phase 5: Offline-first queue

- Store pending PNG blobs and metadata in IndexedDB.
- Show pending, uploading, uploaded, and failed states.
- Detect reconnection with online events.
- Retry pending uploads with bounded retries.
- Retain failed items for manual retry.
- Use a client request ID to avoid duplicate uploads.

## Phase 6: Google Apps Script backend

Create a Web App with doGet health response and doPost upload handling.

The backend should:

- Validate MIME type, size, filename, and request ID.
- Decode the PNG and save it to the configured Google Drive folder.
- Set anyone-with-link viewer permission.
- Return success, request ID, Drive file ID, and view URL.
- Keep DRIVE_FOLDER_ID in Apps Script Properties.
- Never expose credentials in the React bundle.

Test cross-origin requests from https://photo-card.rytc.ac.th. If direct browser requests are unreliable, use a compatible form-post strategy or a thin proxy without exposing secrets.

## Phase 7: Verification

Test Chrome, Safari, Android, iPhone, tablet, and desktop.

Verify camera permissions, camera switching, retake, zoom, crop, file selection, all eight templates, 600 x 1800 PNG output, download behavior, offline queue persistence, reconnection retry, Drive upload, public link viewing, duplicate prevention, and responsive layouts.

## Acceptance criteria

- No login is required.
- A user can create a 600 x 1800 px portrait photo-card PNG.
- All eight templates work with camera and selected images.
- Each template requests and renders only its configured number of photos.
- The cached or installed PWA works offline.
- Offline files remain queued until upload succeeds.
- Online files are saved to the configured Drive folder.
- Returned Drive links open for anyone who has the link.
- No Google credentials or secrets are committed.
