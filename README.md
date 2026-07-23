# RYTC Photo Card

Responsive PWA สำหรับสร้าง Photo Card แนวตั้งขนาด 600 x 1800 พิกเซล ของวิทยาลัยเทคนิคระยอง

## Run locally

ต้องใช้ Node.js ที่รองรับ Vite

    npm install
    cp .env.example .env
    npm run dev

เปิด URL ที่ Vite แสดงใน Terminal โดยกล้องจะทำงานบน HTTPS หรือ localhost เท่านั้น

## Configure Google Apps Script

กำหนด URL ของ Google Apps Script Web App ในไฟล์ .env:

    VITE_UPLOAD_ENDPOINT=https://script.google.com/macros/s/DEPLOYMENT_ID/exec

ถ้ายังไม่กำหนด ระบบยังสามารถสร้างและดาวน์โหลด PNG ได้ แต่ไฟล์จะถูกเก็บไว้ในคิวออฟไลน์เพื่อรอการตั้งค่า Upload API

## Features

- Eight approved photo-card templates.
- Each template uses its own two-photo or three-photo layout.
- Portrait 600 x 1800 composition.
- Camera access, front/rear camera switching, capture, retake, zoom, and image selection.
- PNG export and device download.
- IndexedDB pending-upload queue for offline use.
- Google Apps Script and Google Drive upload integration point.

อ่านรายละเอียดเพิ่มเติมจาก:

- PROJECT_CONTEXT.md
- IMPLEMENTATION_PLAN.md
- docs/GOOGLE_APPS_SCRIPT_SETUP.md
- AGENTS.md
