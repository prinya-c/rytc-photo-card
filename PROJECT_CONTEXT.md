# RYTC Photo Card — Project Context

## Purpose

RYTC Photo Card is a web PWA for taking or selecting a photo, placing it into a colorful postcard template, exporting the composition as PNG, downloading it locally, and uploading a copy to Google Drive.

## Confirmed decisions

| Item | Decision |
|---|---|
| App name | RYTC Photo Card |
| Production URL | photo-card.rytc.ac.th |
| Frontend | Vite + React + Tailwind CSS |
| Output | PNG |
| Postcard | Portrait photo-card strip |
| Canvas | 600 x 1800 px, matching the approved template files |
| Theme | Green, white, yellow |
| Templates | 8 approved templates |
| Photos per template | 2 or 3 photos, defined independently for each template |
| Logo | https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png |
| Required text | วิทยาลัยเทคนิคระยอง |
| Date format | YYYY-MM-DD, for example 2026-07-18 |
| Login | Not required |
| Storage | User device and Google Drive |
| Drive sharing | Anyone with the link can view |
| Drive filename | Timestamp-based |
| Backend | Google Apps Script Web App |
| Offline | Save locally and upload pending files after reconnection |

## User flow

1. Open the PWA.
2. Choose one of eight templates; the app shows whether it needs two or three photos.
3. Fill each photo slot using the camera or an image from the device.
4. Switch camera if needed.
5. Capture, retake, zoom, and crop.
6. Preview the completed portrait postcard.
7. Export and download a PNG.
8. Upload the PNG to Google Drive when online.
9. If offline, place the upload in an IndexedDB queue.
10. Retry queued uploads when connectivity returns.

## Technical constraints

- Camera access requires HTTPS, except localhost development.
- Offline use requires the PWA to have been loaded or installed while online at least once.
- The browser cannot write directly to an arbitrary server folder; Apps Script is the bridge to Drive.
- Cross-origin requests between the production site and Apps Script must be tested early.
- Compress or resize before upload and define a maximum file size.
- Workspace policy may prevent public Drive links.
- Do not expose Google credentials or secrets in frontend code.

## Open deployment values

- Google Drive destination folder ID.
- Apps Script Web App deployment URL.
- Maximum upload size.
- Retry policy and whether manual retry is also shown.
