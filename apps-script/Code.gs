const CONFIG = {
  folderId: "12lwFHPzuO4rWUmHRzxjSOQ-RBde6LYB_",
  templateFolderId: "19pphOccOvJWxPbqs9NSzcmaptLlUKc29",
  folderProperty: "DRIVE_FOLDER_ID",
  maxBytes: 8 * 1024 * 1024,
  requestPrefix: "RYTC_UPLOADED_",
  lockTimeoutMs: 30000,
  recordRetentionDays: 30,
  cleanupProperty: "RYTC_LAST_CLEANUP"
};

function doGet(event) {
  if (event && event.parameter && event.parameter.action === "listTemplates") {
    return listTemplates();
  }
  return jsonResponse({
    success: true,
    service: "RYTC Photo Card Upload API",
    version: "2.0.0",
    timestamp: new Date().toISOString()
  });
}

function listTemplates() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const folderId = CONFIG.templateFolderId || properties.getProperty("TEMPLATE_FOLDER_ID");
    if (!folderId) throw new Error("ยังไม่ได้ตั้งค่า Template Folder ID");
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();
    const templates = [];
    while (files.hasNext()) {
      const file = files.next();
      if (!file.getName().toLowerCase().endsWith(".json")) continue;
      try {
        const metadata = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
        const imageFileId = metadata && (metadata.imageFileId || extractDriveFileId(metadata.imageUrl));
        if (metadata && metadata.id && Array.isArray(metadata.slots) && imageFileId) {
          templates.push({
            ...metadata,
            metadataFileId: file.getId(),
            imageFileId,
            imageUrl: createTemplateImageUrl(imageFileId)
          });
        }
      } catch (error) {
        console.error("ข้าม Metadata Template ที่อ่านไม่ได้", file.getName(), error);
      }
    }
    templates.sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
    return jsonResponse({ success: true, templates });
  } catch (error) {
    return jsonResponse({ success: false, message: "ไม่สามารถโหลด Template จาก Google Drive ได้: " + error.message });
  }
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

    if (body.action === "uploadTemplate") {
      return handleTemplateUpload(body);
    }
    if (body.action === "updateTemplate") {
      return handleTemplateUpdate(body);
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
      // ใช้สิทธิ์ Full/Editor ที่สืบทอดจากโฟลเดอร์ ไม่ลดสิทธิ์ไฟล์ซ้ำด้วย setSharing()
    } catch (fileError) {
      throw createError("ไม่สามารถสร้างไฟล์รูปภาพได้: " + fileError.message, "FILE_CREATION_FAILED", false);
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

function handleTemplateUpload(body) {
  validateTemplatePayload(body);
  const properties = PropertiesService.getScriptProperties();
  const folderId = CONFIG.templateFolderId || properties.getProperty("TEMPLATE_FOLDER_ID") || CONFIG.folderId || properties.getProperty(CONFIG.folderProperty);
  if (!folderId) throw createError("ยังไม่ได้ตั้งค่า Google Drive Folder ID", "FOLDER_NOT_CONFIGURED", false);
  const bytes = Utilities.base64Decode(body.base64);
  if (bytes.length > CONFIG.maxBytes) throw createError("ไฟล์ Template มีขนาดใหญ่เกินกำหนด", "FILE_TOO_LARGE", false);
  const folder = DriveApp.getFolderById(folderId);
  const templateId = "template-" + body.requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase();
  const filename = safeFilename(body.filename);
  const imageFile = folder.createFile(Utilities.newBlob(bytes, body.mimeType, templateId + "-" + filename));
  const metadata = {
    id: templateId,
    name: body.template.name,
    imageFileId: imageFile.getId(),
    imageUrl: createTemplateImageUrl(imageFile.getId()),
    width: body.template.width,
    height: body.template.height,
    slots: body.template.slots,
    version: 1,
    createdAt: new Date().toISOString()
  };
  folder.createFile(Utilities.newBlob(JSON.stringify(metadata, null, 2), "application/json", templateId + ".json"));
  return jsonResponse({ success: true, template: metadata });
}

function handleTemplateUpdate(body) {
  validateTemplateUpdatePayload(body);
  const properties = PropertiesService.getScriptProperties();
  const folderId = CONFIG.templateFolderId || properties.getProperty("TEMPLATE_FOLDER_ID");
  if (!folderId) throw createError("ยังไม่ได้ตั้งค่า Template Folder ID", "FOLDER_NOT_CONFIGURED", false);

  const folder = DriveApp.getFolderById(folderId);
  const metadataFile = findTemplateMetadataFile(folder, body.templateId, body.metadataFileId);
  if (!metadataFile) throw createError("ไม่พบไฟล์ JSON ของ Template ที่ต้องการแก้ไข", "TEMPLATE_NOT_FOUND", false);

  let currentMetadata;
  try {
    currentMetadata = JSON.parse(metadataFile.getBlob().getDataAsString("UTF-8"));
  } catch (error) {
    throw createError("ไฟล์ JSON ของ Template ไม่ถูกต้อง", "INVALID_TEMPLATE_METADATA", false);
  }
  if (!currentMetadata || currentMetadata.id !== body.templateId) {
    throw createError("รหัส Template ไม่ตรงกับไฟล์ JSON", "TEMPLATE_ID_MISMATCH", false);
  }

  validateTemplateSlots(body.template.width, body.template.height, body.template.slots);
  const backupName = safeFilename(
    metadataFile.getName().replace(/\.json$/i, "") + ".backup-" + timestampForFilename() + ".json"
  );
  metadataFile.makeCopy(backupName, folder);

  const updatedMetadata = {
    ...currentMetadata,
    name: body.template.name,
    width: Number(body.template.width),
    height: Number(body.template.height),
    slots: body.template.slots,
    imageFileId: currentMetadata.imageFileId || extractDriveFileId(currentMetadata.imageUrl),
    imageUrl: createTemplateImageUrl(currentMetadata.imageFileId || extractDriveFileId(currentMetadata.imageUrl)),
    version: (Number(currentMetadata.version) || 1) + 1,
    updatedAt: new Date().toISOString()
  };
  metadataFile.setContent(JSON.stringify(updatedMetadata, null, 2));
  return jsonResponse({
    success: true,
    template: {
      ...updatedMetadata,
      metadataFileId: metadataFile.getId()
    },
    backupFilename: backupName
  });
}

function findTemplateMetadataFile(folder, templateId, metadataFileId) {
  if (metadataFileId) {
    try {
      const file = DriveApp.getFileById(metadataFileId);
      if (file.getName().toLowerCase().endsWith(".json")) return file;
    } catch (error) {
      console.error("ไม่สามารถเปิดไฟล์ Metadata ตาม ID ได้", metadataFileId, error);
    }
  }
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!file.getName().toLowerCase().endsWith(".json")) continue;
    try {
      const metadata = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
      if (metadata && metadata.id === templateId) return file;
    } catch (error) {
      console.error("ข้าม Metadata Template ที่อ่านไม่ได้", file.getName(), error);
    }
  }
  return null;
}

function validateTemplateUpdatePayload(body) {
  if (!body || !body.templateId || !body.template) {
    throw createError("ข้อมูลการแก้ไข Template ไม่ครบถ้วน", "INVALID_TEMPLATE_UPDATE", false);
  }
  if (!body.template.name || !body.template.width || !body.template.height || !Array.isArray(body.template.slots)) {
    throw createError("กรุณาระบุชื่อ ขนาด และช่องรูปของ Template", "INVALID_TEMPLATE_UPDATE", false);
  }
}

function validateTemplateSlots(width, height, slots) {
  const templateWidth = Number(width);
  const templateHeight = Number(height);
  if (!Number.isFinite(templateWidth) || !Number.isFinite(templateHeight) || templateWidth <= 0 || templateHeight <= 0) {
    throw createError("ขนาด Template ไม่ถูกต้อง", "INVALID_TEMPLATE_DIMENSIONS", false);
  }
  if (!slots.length) throw createError("ต้องมีช่องรูปอย่างน้อย 1 ช่อง", "EMPTY_TEMPLATE_SLOTS", false);
  slots.forEach(function(slot, index) {
    const values = [slot.x, slot.y, slot.width, slot.height].map(Number);
    if (values.some(function(value) { return !Number.isFinite(value); }) || slot.width < 10 || slot.height < 10) {
      throw createError("ช่องที่ " + (index + 1) + " มีค่าไม่ถูกต้อง", "INVALID_TEMPLATE_SLOT", false);
    }
    if (slot.x < 0 || slot.y < 0 || slot.x + slot.width > templateWidth || slot.y + slot.height > templateHeight) {
      throw createError("ช่องที่ " + (index + 1) + " เกินขอบภาพ Template", "TEMPLATE_SLOT_OUT_OF_BOUNDS", false);
    }
  });
}

function timestampForFilename() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Bangkok", "yyyyMMdd-HHmmss");
}

function validateTemplatePayload(body) {
  if (!body.requestId || !body.filename || !body.base64 || !body.template) throw createError("ข้อมูล Template ไม่ครบถ้วน", "INVALID_TEMPLATE", false);
  if (!["image/png", "image/jpeg"].includes(body.mimeType)) throw createError("รองรับเฉพาะ PNG หรือ JPG", "INVALID_TEMPLATE_TYPE", false);
  if (!body.template.name || !body.template.width || !body.template.height || !Array.isArray(body.template.slots) || !body.template.slots.length) throw createError("กรุณาระบุชื่อ ขนาด และช่องรูปของ Template", "INVALID_TEMPLATE", false);
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

// ใช้ Googleusercontent โดยตรงเพื่อเลี่ยง Cross-Origin-Resource-Policy
// ของ drive.usercontent.google.com ที่ทำให้รูปถูกบล็อกเมื่อฝังในหน้าเว็บ
function createTemplateImageUrl(fileId) {
  return "https://lh3.googleusercontent.com/d/" + encodeURIComponent(fileId);
}

function extractDriveFileId(url) {
  const value = String(url || "");
  const match = value.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : "";
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
