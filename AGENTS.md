# AI Agent Instructions

## Project

- Name: RYTC Photo Card
- Repository: prinya-c/rytc-photo-card
- Production URL: https://photo-card.rytc.ac.th
- Product: responsive PWA for creating 4 x 6 inch portrait postcard PNG images.

## Technology

Use Vite, React, Tailwind CSS, PWA service worker, IndexedDB for offline pending uploads, Google Apps Script Web App as the upload backend, and Google Drive as storage.

## Confirmed requirements

- Responsive on smartphone, tablet, and desktop.
- Green, white, and yellow visual theme.
- Five colorful postcard templates.
- Every template includes the RYTC logo, the text วิทยาลัยเทคนิคระยอง, and the current date in YYYY-MM-DD format.
- Logo: https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png
- Camera access from the browser, front/rear camera switching, capture, retake, zoom, crop, and selecting an existing image.
- Export and download the final composition as PNG.
- Upload a copy to Google Drive without end-user login.
- Use a timestamp-based filename.
- Drive files are viewable by anyone with the link.
- Offline creation is supported; pending uploads are queued in IndexedDB and retried after reconnection.

## Architecture rules

Expected flow:

    React PWA -> Google Apps Script Web App -> Google Drive

The browser must never contain Google credentials, service-account JSON, access tokens, or other secrets. Apps Script executes as the owner, receives the PNG, saves it in a configured Drive folder, sets link-view permission, and returns the file URL or ID.

## Safety and quality

- Validate file type, file size, and payload before upload.
- Use HTTPS for production camera access.
- Preserve local pending work when the backend is unavailable.
- Use accessible, touch-friendly controls and clear permission/error messages.
- Test mobile browsers, camera permission, download behavior, offline queue, and reconnection retry.
- Do not reset or delete unrelated user changes.

## Local AI workflow

1. Read this file, PROJECT_CONTEXT.md, and IMPLEMENTATION_PLAN.md before coding.
2. Inspect the repository before making assumptions.
3. Keep UI, image composition, offline storage, and API code in separate modules.
4. Never commit secrets.
5. Run formatting, build, and relevant tests before completing a change.
6. Update the project documentation when an approved requirement changes.
