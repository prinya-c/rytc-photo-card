const CONFIG = {
  folderId: "12lwFHPzuO4rWUmHRzxjSOQ-RBde6LYB_",
  folderProperty: "DRIVE_FOLDER_ID",
  maxBytes: 8 * 1024 * 1024,
  requestPrefix: "RYTC_UPLOADED_",
  lockTimeoutMs: 30000,
  recordRetentionDays: 30,
  cleanupProperty: "RYTC_LAST_CLEANUP"
};

function doGet() {
  return jsonResponse({
    success: true,
    service: "RYTC Photo Card Upload API",
    version: "2.0.0",
    timestamp: new Date().toISOString()
  });
}

function doPost(event) {
  let lock = null;
  let lockAcquired = false;

  try {
    if (!event || !event.postData || !event.postData.contents) {
      throw createError("ไม่พบข้อมูลที่ส่งมายังระบบ", "INVALID_REQUEST", false);
    }

    let body;
    try {
      body = JSON.parse(event.postData.contents);
    } catch (parseError) {
      throw createError("ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง", "INVALID_JSON", false);
    }

    validatePayload(body);

    const maxBase64Length = Math.ceil(CONFIG.maxBytes / 3) * 4 + 100;
    if (body.base64.length > maxBase64Length) {
      throw createError("ไฟล์มีขนาดใหญ่เกิน " + formatMegabytes(CONFIG.maxBytes) + " MB", "FILE_TOO_LARGE", false);
    }

    let bytes;
    try {
      bytes = Utilities.base64Decode(body.base64);
    } catch (decodeError) {
      throw createError("ไม่สามารถถอดรหัสข้อมูลรูปภาพได้", "INVALID_BASE64", false);
    }

    if (!bytes || bytes.length === 0) {
      throw createError("ข้อมูลรูปภาพว่างเปล่า", "EMPTY_FILE", false);
    }
    if (bytes.length > CONFIG.maxBytes) {
      throw createError("ไฟล์มีขนาดใหญ่เกิน " + formatMegabytes(CONFIG.maxBytes) + " MB", "FILE_TOO_LARGE", false);
    }

    const properties = PropertiesService.getScriptProperties();
    const folderId = CONFIG.folderId || properties.getProperty(CONFIG.folderProperty);
    if (!folderId) {
      throw createError("ยังไม่ได้ตั้งค่า Google Drive Folder ID", "FOLDER_NOT_CONFIGURED", false);
    }

    lock = LockService.getScriptLock();
    try {
      lock.waitLock(CONFIG.lockTimeoutMs);
      lockAcquired = true;
    } catch (lockError) {
      throw createError("ระบบกำลังประมวลผลคำขออื่น กรุณาลองใหม่อีกครั้ง", "LOCK_TIMEOUT", true);
    }

    const propertyKey = CONFIG.requestPrefix + body.requestId;
    const existingRecord = readUploadRecord(properties.getProperty(propertyKey));
    if (existingRecord && existingRecord.viewUrl) {
      return jsonResponse({
        success: true,
        requestId: body.requestId,
        fileId: existingRecord.fileId || "",
        viewUrl: existingRecord.viewUrl,
        filename: existingRecord.filename || "",
        duplicate: true,
        message: "คำขอนี้เคยอัปโหลดสำเร็จแล้ว"
      });
    }

    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (folderError) {
      throw createError("ไม่สามารถเข้าถึงโฟลเดอร์ Google Drive ได้: " + folderError.message, "FOLDER_ACCESS_FAILED", false);
    }

    const serverFilename = buildServerFilename(body.filename, body.requestId);
    const existingFiles = folder.getFilesByName(serverFilename);
    if (existingFiles.hasNext()) {
      const existingFile = existingFiles.next();
      const existingViewUrl = createViewUrl(existingFile.getId());
      trySetSharing(existingFile);
      saveUploadRecordSafely(
        properties,
        propertyKey,
        createUploadRecord(body.requestId, existingFile.getId(), existingViewUrl, serverFilename)
      );
      return jsonResponse({
        success: true,
        requestId: body.requestId,
        fileId: existingFile.getId(),
        viewUrl: existingViewUrl,
        filename: serverFilename,
        duplicate: true,
        message: "พบไฟล์ที่อัปโหลดไว้แล้ว"
      });
    }

    const blob = Utilities.newBlob(bytes, "image/png", serverFilename);
    let file = null;
    try {
      file = folder.createFile(blob);
      file.setDescription(
        "RYTC Photo Card\nRequest ID: " + body.requestId + "\nUploaded: " + new Date().toISOString()
      );
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (fileError) {
      if (file) {
        try {
          file.setTrashed(true);
        } catch (trashError) {
          console.error("ไม่สามารถย้ายไฟล์ที่สร้างไม่สมบูรณ์เข้าถังขยะได้", trashError);
        }
      }
      throw createError("ไม่สามารถสร้างหรือตั้งค่ารูปภาพได้: " + fileError.message, "FILE_CREATION_FAILED", false);
    }

    const fileId = file.getId();
    const viewUrl = createViewUrl(fileId);
    const propertySaved = saveUploadRecordSafely(
      properties,
      propertyKey,
      createUploadRecord(body.requestId, fileId, viewUrl, serverFilename)
    );
    cleanupOldRecordsSafely(properties);

    return jsonResponse({
      success: true,
      requestId: body.requestId,
      fileId: fileId,
      viewUrl: viewUrl,
      filename: serverFilename,
      duplicate: false,
      propertySaved: propertySaved,
      message: "อัปโหลดรูปภาพสำเร็จ"
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      success: false,
      errorCode: error.errorCode || "SERVER_ERROR",
      retryable: typeof error.retryable === "boolean" ? error.retryable : true,
      message: error.message || "เกิดข้อผิดพลาดภายในระบบ"
    });
  } finally {
    if (lock && lockAcquired) {
      try {
        lock.releaseLock();
      } catch (releaseError) {
        console.error("ไม่สามารถปล่อย Script Lock ได้", releaseError);
      }
    }
  }
}

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    throw createError("ไม่พบข้อมูลคำขอ", "INVALID_PAYLOAD", false);
  }
  if (!body.requestId || typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{10,100}$/.test(body.requestId)) {
    throw createError("requestId ไม่ถูกต้อง", "INVALID_REQUEST_ID", false);
  }
  if (!body.base64 || typeof body.base64 !== "string" || body.base64.length < 20) {
    throw createError("ไม่พบข้อมูลรูปภาพ", "IMAGE_DATA_MISSING", false);
  }
  if (body.mimeType !== "image/png") {
    throw createError("รองรับเฉพาะไฟล์ PNG", "UNSUPPORTED_MIME_TYPE", false);
  }
  if (!body.filename || typeof body.filename !== "string" || !body.filename.toLowerCase().endsWith(".png")) {
    throw createError("ชื่อไฟล์ไม่ถูกต้อง", "INVALID_FILENAME", false);
  }
}

function buildServerFilename(filename, requestId) {
  const cleanName = safeFilename(filename).replace(/\.png$/i, "").slice(0, 70);
  const cleanRequestId = requestId.replace(/[^a-zA-Z0-9-]/g, "");
  return (cleanName + "-" + cleanRequestId + ".png").slice(0, 120);
}

function safeFilename(filename) {
  return String(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function createViewUrl(fileId) {
  return "https://drive.google.com/file/d/" + fileId + "/view";
}

function trySetSharing(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (error) {
    console.error("ไม่สามารถตั้งค่า Sharing ให้ไฟล์เดิมได้", error);
    return false;
  }
}

function createUploadRecord(requestId, fileId, viewUrl, filename) {
  return {
    requestId: requestId,
    fileId: fileId,
    viewUrl: viewUrl,
    filename: filename,
    createdAt: Date.now()
  };
}

function readUploadRecord(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.viewUrl) return parsed;
  } catch (error) {
    if (typeof value === "string" && value.indexOf("https://") === 0) {
      return { viewUrl: value, createdAt: 0 };
    }
  }
  return null;
}

function saveUploadRecordSafely(properties, propertyKey, record) {
  try {
    properties.setProperty(propertyKey, JSON.stringify(record));
    return true;
  } catch (error) {
    console.error("ไม่สามารถบันทึก Upload Record ได้", error);
    return false;
  }
}

function cleanupOldRecordsSafely(properties) {
  try {
    const now = Date.now();
    const lastCleanup = Number(properties.getProperty(CONFIG.cleanupProperty) || 0);
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (now - lastCleanup < oneDayMs) return;

    properties.setProperty(CONFIG.cleanupProperty, String(now));
    const retentionMs = CONFIG.recordRetentionDays * oneDayMs;
    const allProperties = properties.getProperties();

    Object.keys(allProperties).forEach(function (key) {
      if (key.indexOf(CONFIG.requestPrefix) !== 0) return;
      const record = readUploadRecord(allProperties[key]);
      if (!record || !record.createdAt || now - Number(record.createdAt) > retentionMs) {
        properties.deleteProperty(key);
      }
    });
  } catch (error) {
    console.error("ไม่สามารถล้าง Upload Record เก่าได้", error);
  }
}

function createError(message, errorCode, retryable) {
  const error = new Error(message);
  error.errorCode = errorCode;
  error.retryable = retryable;
  return error;
}

function formatMegabytes(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
