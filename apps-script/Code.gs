const CONFIG = {
  folderProperty: "DRIVE_FOLDER_ID",
  maxBytes: 8 * 1024 * 1024,
  requestPrefix: "RYTC_UPLOADED_"
};

function doGet() {
  return jsonResponse({ success: true, service: "RYTC Photo Card Upload API" });
}

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || "{}");
    validatePayload(body);

    const properties = PropertiesService.getScriptProperties();
    const existingUrl = properties.getProperty(CONFIG.requestPrefix + body.requestId);
    if (existingUrl) {
      return jsonResponse({
        success: true,
        requestId: body.requestId,
        viewUrl: existingUrl,
        duplicate: true
      });
    }

    const folderId = properties.getProperty(CONFIG.folderProperty);
    if (!folderId) throw new Error("ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID");

    const bytes = Utilities.base64Decode(body.base64);
    if (bytes.length > CONFIG.maxBytes) throw new Error("ไฟล์มีขนาดใหญ่เกินกำหนด");

    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(bytes, "image/png", safeFilename(body.filename));
    const file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      throw new Error("ไม่สามารถตั้งค่า Anyone with the link ได้: " + sharingError.message);
    }

    const viewUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";
    properties.setProperty(CONFIG.requestPrefix + body.requestId, viewUrl);

    return jsonResponse({
      success: true,
      requestId: body.requestId,
      fileId: file.getId(),
      viewUrl
    });
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function validatePayload(body) {
  if (!body.requestId || !/^[a-zA-Z0-9-]{10,100}$/.test(body.requestId)) {
    throw new Error("requestId ไม่ถูกต้อง");
  }
  if (!body.base64 || body.base64.length < 20) throw new Error("ไม่พบข้อมูลรูปภาพ");
  if (body.mimeType !== "image/png") throw new Error("รองรับเฉพาะ PNG");
  if (!body.filename || !body.filename.toLowerCase().endsWith(".png")) {
    throw new Error("ชื่อไฟล์ไม่ถูกต้อง");
  }
}

function safeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
