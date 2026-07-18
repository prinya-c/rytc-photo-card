# Google Apps Script Setup Notes

## Goal

Use Google Apps Script as the server-side bridge from the public PWA to Google Drive.

## Setup

1. Create a dedicated Apps Script project.
2. Create or select the destination Drive folder, such as images.
3. Copy the folder ID from the Drive URL.
4. Store it in Apps Script Properties as DRIVE_FOLDER_ID.
5. Implement doPost(e) to accept PNG payloads.
6. Deploy as a Web App executing as the script owner.
7. Configure the required public access setting for the Web App.
8. Test a small PNG from the production origin.
9. Confirm the created file has anyone-with-the-link viewer permission.

## Expected upload payload

    {
      "requestId": "client-generated-id",
      "filename": "RYTC-Photo-2026-07-18-143025.png",
      "mimeType": "image/png",
      "base64": "..."
    }

## Expected response

    {
      "success": true,
      "requestId": "client-generated-id",
      "fileId": "drive-file-id",
      "viewUrl": "https://drive.google.com/file/d/drive-file-id/view"
    }

## Security and operations

- Never put credentials, tokens, or service-account JSON in React or Vite environment files.
- Validate MIME type, decoded size, filename, and request ID.
- Do not log image base64 data.
- Add duplicate request ID handling so offline retries do not create unwanted duplicates.
- Consider basic abuse controls because the app has no login.
- Google Workspace administrators may block public link sharing.
- Apps Script has quotas and execution limits.
- Test cross-origin behavior from https://photo-card.rytc.ac.th.
- Keep the deployment URL in deployment configuration, not in committed secrets if it is sensitive.
