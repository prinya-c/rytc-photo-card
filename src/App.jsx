import { useCallback, useEffect, useRef, useState } from "react";
import packageJson from "../package.json";

const APP_VERSION = "v" + packageJson.version;
const LOGO_URL = "https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png";
const LOGO_EXPORT_URL = (import.meta.env.BASE_URL || "/") + "assets/rytc-logo-original.png";
const UPLOAD_ENDPOINT = import.meta.env.VITE_UPLOAD_ENDPOINT || "";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1800;
const DB_NAME = "rytc-photo-card";
const STORE_NAME = "pending-uploads";
const GALLERY_STORE_NAME = "gallery-items";

const TEMPLATE_BASE = (import.meta.env.BASE_URL || "/") + "templates/";
const PHOTO_SLOTS = [
  { x: 72, y: 375, width: 480, height: 480 },
  { x: 628, y: 375, width: 480, height: 480 },
  { x: 72, y: 877, width: 480, height: 480 },
  { x: 628, y: 877, width: 480, height: 480 }
];
const templates = [
  { id: "template-1", name: "Digital Blue", asset: TEMPLATE_BASE + "template-1.png" },
  { id: "template-2", name: "Blue Light", asset: TEMPLATE_BASE + "template-2.png" },
  { id: "template-3", name: "Color Burst", asset: TEMPLATE_BASE + "template-3.png" },
  { id: "template-4", name: "Art Connect", asset: TEMPLATE_BASE + "template-4.png" },
  { id: "template-5", name: "Purple Tech", asset: TEMPLATE_BASE + "template-5.png" }
];


const filters = [
  { id: "original", name: "ต้นฉบับ", emoji: "◌" },
  { id: "bright", name: "หน้าใส", emoji: "✦" },
  { id: "clear", name: "คมชัด", emoji: "◈" },
  { id: "soft-skin", name: "ผิวนุ่ม", emoji: "◒" },
  { id: "smooth", name: "บิวตี้", emoji: "♡" },
  { id: "warm", name: "ผิวอุ่น", emoji: "☀" },
  { id: "fresh", name: "สดใส", emoji: "✿" },
  { id: "peach", name: "พีช", emoji: "●" },
  { id: "cool", name: "โทนเย็น", emoji: "◆" },
  { id: "mono", name: "ขาวดำ", emoji: "◐" }
];

function getFilterStyle(id, intensity = 100) {
  const t = intensity / 100;
  const styles = {
    original: "none",
    bright: `brightness(${1 + 0.2 * t}) saturate(${1 + 0.08 * t})`,
    clear: `contrast(${1 + 0.25 * t}) saturate(${1 + 0.1 * t})`,
    "soft-skin": `brightness(${1 + 0.08 * t}) contrast(${1 - 0.05 * t}) saturate(${1 + 0.04 * t})`,
    smooth: `blur(${0.45 * t}px) brightness(${1 + 0.1 * t}) saturate(${1 + 0.05 * t})`,
    warm: `sepia(${0.16 * t}) saturate(${1 + 0.14 * t}) brightness(${1 + 0.04 * t})`,
    fresh: `saturate(${1 + 0.32 * t}) brightness(${1 + 0.06 * t}) contrast(${1 + 0.04 * t})`,
    peach: `sepia(${0.2 * t}) hue-rotate(${-8 * t}deg) saturate(${1 + 0.22 * t}) brightness(${1 + 0.06 * t})`,
    cool: `hue-rotate(${12 * t}deg) saturate(${1 + 0.08 * t}) brightness(${1 + 0.03 * t})`,
    mono: `grayscale(${t}) contrast(${1 + 0.08 * t})`
  };
  return styles[id] || styles.original;
}

const today = () => new Date().toISOString().slice(0, 10);
const createEmptyPhoto = () => ({ dataUrl: "", zoom: 1, filterId: "original", filterIntensity: 100 });
const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});
const timestamp = () => new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const fileName = () => "RYTC-Photo-" + timestamp() + ".png";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "requestId" });
      if (!db.objectStoreNames.contains(GALLERY_STORE_NAME)) db.createObjectStore(GALLERY_STORE_NAME, { keyPath: "galleryId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueUpload(item) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function pendingUploads() {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function saveGalleryItem(item) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE_NAME, "readwrite");
    tx.objectStore(GALLERY_STORE_NAME).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function galleryItems() {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(GALLERY_STORE_NAME).objectStore(GALLERY_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function removeUpload(requestId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(requestId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(encoded);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

async function uploadItem(item) {
  if (!UPLOAD_ENDPOINT) throw new Error("ยังไม่ได้ตั้งค่า Google Apps Script Upload API");
  const response = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      requestId: item.requestId,
      filename: item.filename,
      mimeType: "image/png",
      base64: item.dataUrl.split(",")[1]
    })
  });
  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    const detail = responseText.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 180);
    throw new Error(
      "Apps Script ตอบกลับไม่ใช่ JSON" +
      (response.status ? " (HTTP " + response.status + ")" : "") +
      (detail ? ": " + detail : "")
    );
  }
  if (!response.ok) throw new Error(result.message || "อัปโหลดไม่สำเร็จ (HTTP " + response.status + ")");
  if (!result.success) throw new Error(result.message || "Google Drive ปฏิเสธการอัปโหลด");
  return result;
}

function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [activeStep, setActiveStep] = useState(1);
  const [photos, setPhotos] = useState(() => Array.from({ length: 4 }, createEmptyPhoto));
  const [activePhotoSlot, setActivePhotoSlot] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [status, setStatus] = useState("พร้อมสร้าง Photo Card");
  const [busy, setBusy] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastUrl, setLastUrl] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [previewSrc, setPreviewSrc] = useState("");

  useEffect(() => {
    window.__RYTC_CAN_UPDATE = !busy && !cameraOpen;
    if (!busy && !cameraOpen && updateAvailable) {
      window.__RYTC_UPDATE_SW?.();
      setUpdateAvailable(false);
    }
  }, [busy, cameraOpen, updateAvailable]);

  useEffect(() => {
    const onUpdateAvailable = () => setUpdateAvailable(true);
    window.addEventListener("rytc-update-available", onUpdateAvailable);
    return () => window.removeEventListener("rytc-update-available", onUpdateAvailable);
  }, []);

  const refreshQueue = useCallback(async () => {
    try { setQueueCount((await pendingUploads()).length); } catch { setQueueCount(0); }
  }, []);

  const refreshGallery = useCallback(async () => {
    try { setGallery(await galleryItems()); } catch { setGallery([]); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (photos.some((photo) => !photo.dataUrl)) {
      setPreviewSrc("");
      return undefined;
    }
    renderPostcard()
      .then((dataUrl) => { if (!cancelled) setPreviewSrc(dataUrl); })
      .catch(() => { if (!cancelled) setPreviewSrc(""); });
    return () => { cancelled = true; };
  }, [templateId, photos]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  const startCamera = useCallback(async (mode = facingMode) => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 1920 } },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setStatus("กล้องพร้อมถ่ายภาพ");
    } catch (error) {
      setStatus(error.name === "NotAllowedError" ? "กรุณาอนุญาตการใช้กล้องใน Browser" : "ไม่สามารถเปิดกล้องได้");
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  useEffect(() => {
    if (activeStep !== 2 && cameraOpen) stopCamera();
  }, [activeStep, cameraOpen, stopCamera]);

  useEffect(() => {
    refreshQueue();
    refreshGallery();
    const onOnline = async () => {
      setStatus("เชื่อมต่ออินเทอร์เน็ตแล้ว กำลังอัปโหลดไฟล์ค้าง...");
      await retryQueue();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      stopCamera();
    };
  }, [refreshGallery, refreshQueue, stopCamera]);

  async function retryQueue() {
    setBusy(true);
    try {
      const items = await pendingUploads();
      let lastError = null;
      for (const item of items) {
        try {
          await uploadItem(item);
          await removeUpload(item.requestId);
        } catch (error) {
          lastError = error;
          break;
        }
      }
      await refreshQueue();
      if (lastError) setStatus("อัปโหลดไม่สำเร็จ: " + lastError.message);
      else if (items.length) setStatus("ตรวจสอบคิวอัปโหลดแล้ว");
    } finally {
      setBusy(false);
    }
  }

  function updateActivePhoto(changes) {
    setPhotos((current) => current.map((photo, index) => index === activePhotoSlot ? { ...photo, ...changes } : photo));
  }

  function setImageFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("กรุณาเลือกไฟล์ภาพเท่านั้น");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateActivePhoto({ dataUrl: reader.result, zoom: 1, filterId: "original", filterIntensity: 100 });
      setActiveStep(2);
      setStatus("เลือกรูปที่ " + (activePhotoSlot + 1) + " แล้ว");
    };
    reader.readAsDataURL(file);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sourceX = Math.floor((video.videoWidth - size) / 2);
    const sourceY = Math.floor((video.videoHeight - size) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(video, sourceX, sourceY, size, size, 0, 0, size, size);
    updateActivePhoto({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), zoom: 1, filterId: "original", filterIntensity: 100 });
    setActiveStep(2);
    setStatus("ถ่ายรูปที่ " + (activePhotoSlot + 1) + " แล้ว");
    stopCamera();
  }

  function drawCover(ctx, image, x, y, width, height, scale = 1, filter = "none") {
    const ratio = Math.max(width / image.width, height / image.height) * scale;
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.filter = filter;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  async function renderPostcard() {
    if (photos.some((photo) => !photo.dataUrl)) throw new Error("กรุณาใส่รูปให้ครบทั้ง 4 ช่อง");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const selected = templates.find((item) => item.id === templateId);
    const background = await loadImage(selected.asset);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(background, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (let index = 0; index < PHOTO_SLOTS.length; index += 1) {
      const photo = photos[index];
      const image = await loadImage(photo.dataUrl);
      const slot = PHOTO_SLOTS[index];
      drawCover(ctx, image, slot.x, slot.y, slot.width, slot.height, photo.zoom, getFilterStyle(photo.filterId, photo.filterIntensity));
    }
    return canvas.toDataURL("image/png");
  }

  async function savePostcard() {
    setBusy(true);
    setLastUrl("");
    try {
      const dataUrl = await renderPostcard();
      const item = { requestId: crypto.randomUUID(), filename: fileName(), dataUrl, createdAt: Date.now() };
      await saveGalleryItem({ galleryId: item.requestId, filename: item.filename, dataUrl: item.dataUrl, createdAt: item.createdAt, templateId, photoCount: 4 });
      await refreshGallery();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = item.filename;
      link.click();
      if (navigator.onLine && UPLOAD_ENDPOINT) {
        try {
          const result = await uploadItem(item);
          setLastUrl(result.viewUrl || "");
          setStatus("บันทึกลงเครื่องและ Google Drive แล้ว");
        } catch (error) {
          await queueUpload(item);
          setStatus("บันทึกลงเครื่องแล้ว แต่ส่ง Google Drive ไม่สำเร็จ: " + error.message);
        }
      } else {
        await queueUpload(item);
        setStatus(UPLOAD_ENDPOINT ? "ออฟไลน์: บันทึกแล้ว รออัปโหลด" : "บันทึกลงเครื่องแล้ว (ยังไม่ได้ตั้งค่า Upload API)");
      }
      await refreshQueue();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedTemplate = templates.find((item) => item.id === templateId);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">RY</div>
        <div><p className="eyebrow">RAYONG TECHNICAL COLLEGE</p><h1>RYTC Photo Card</h1></div>
        <div className="online-pill"><span />{navigator.onLine ? "ออนไลน์" : "ออฟไลน์"}</div>
      </header>

      <nav className="stepper" aria-label="ขั้นตอนการสร้าง Photo Card">
        {[["01", "แบบ", 1], ["02", "รูปภาพ", 2], ["03", "บันทึก", 3], ["04", "แกลเลอรี่", 4]].map(([number, label, step]) => (
          <button key={step} className={activeStep === step ? "active" : ""} onClick={() => setActiveStep(step)}><span>{number}</span><b>{label}</b></button>
        ))}
      </nav>

      <section className="workspace">
        <div className={"panel step-panel step-panel-1 " + (activeStep === 1 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">01</span><div><h3>เลือก Template</h3><p>เลือกแบบที่ต้องการ แล้วใส่รูปให้ครบ 4 ช่อง</p></div></div>
          <div className="template-grid actual-template-grid">
            {templates.map((item) => (
              <button key={item.id} className={"template-option " + (item.id === templateId ? "selected" : "")} onClick={() => { setTemplateId(item.id); setActiveStep(2); }}>
                <img src={item.asset} alt={item.name} /><strong>{item.name}</strong>
              </button>
            ))}
          </div>
          <div className="step-actions"><button className="primary-button" onClick={() => setActiveStep(2)}>ต่อไป: เพิ่มรูปภาพ →</button></div>
        </div>

        <div className={"panel step-panel step-panel-2 " + (activeStep === 2 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">02</span><div><h3>เพิ่มรูปภาพ 4 ช่อง</h3><p>เลือกช่อง แล้วถ่ายภาพหรือเลือกรูปจากเครื่อง</p></div></div>
          <div className="photo-slot-grid">
            {photos.map((photo, index) => (
              <button key={index} className={"photo-slot " + (activePhotoSlot === index ? "active" : "")} onClick={() => setActivePhotoSlot(index)}>
                {photo.dataUrl ? <img src={photo.dataUrl} alt={"รูปที่ " + (index + 1)} /> : <span>รูปที่ {index + 1}<small>ยังไม่มีรูป</small></span>}
              </button>
            ))}
          </div>
          <p className="slot-status">กำลังแก้ไขรูปที่ {activePhotoSlot + 1} จาก 4 {photos[activePhotoSlot].dataUrl ? "· มีรูปแล้ว" : "· รอรูปภาพ"}</p>
          <div className={"camera-stage " + (photos[activePhotoSlot].dataUrl ? "has-image" : "")}>
            {photos[activePhotoSlot].dataUrl && !cameraOpen && <img className="camera-image-layer" src={photos[activePhotoSlot].dataUrl} alt={"รูปที่ " + (activePhotoSlot + 1)} style={{ transform: "scale(" + photos[activePhotoSlot].zoom + ")", filter: getFilterStyle(photos[activePhotoSlot].filterId, photos[activePhotoSlot].filterIntensity) }} />}
            {!photos[activePhotoSlot].dataUrl && !cameraOpen && <div className="empty-camera"><div className="camera-icon">⌾</div><strong>ยังไม่มีรูปช่องนี้</strong><span>ถ่ายด้วยกล้องหรือเลือกจากเครื่อง</span><button className="primary-button empty-camera-action" onClick={() => startCamera()}>ถ่ายด้วยกล้อง</button></div>}
            {cameraOpen && <video ref={videoRef} autoPlay playsInline muted />}
            {cameraOpen && <div className="camera-actions">
              <button className="camera-icon-button camera-switch-button" aria-label="สลับกล้อง" title="สลับกล้อง" onClick={() => { const next = facingMode === "environment" ? "user" : "environment"; setFacingMode(next); startCamera(next); }}>⟳</button>
              <button className="camera-shutter" aria-label="ถ่ายภาพ" title="ถ่ายภาพ" onClick={capturePhoto}><span /></button>
            </div>}
          </div>
          <div className="control-row">
            <label className="secondary-button">เลือกภาพ<input type="file" accept="image/*" onChange={(event) => setImageFromFile(event.target.files[0])} /></label>
            {photos[activePhotoSlot].dataUrl && <button className="secondary-button" onClick={() => updateActivePhoto({ dataUrl: "", zoom: 1, filterId: "original", filterIntensity: 100 })}>ล้างช่อง</button>}
          </div>
          {photos[activePhotoSlot].dataUrl && <div className="zoom-control"><span>ซูม</span><input type="range" min="1" max="2.5" step=".05" value={photos[activePhotoSlot].zoom} onChange={(event) => updateActivePhoto({ zoom: Number(event.target.value) })} /><strong>{photos[activePhotoSlot].zoom.toFixed(1)}x</strong></div>}
          {photos[activePhotoSlot].dataUrl && <div className="filter-editor">
            <div className="filter-heading"><strong>แต่งภาพช่องที่ {activePhotoSlot + 1}</strong><span>{filters.find((item) => item.id === photos[activePhotoSlot].filterId)?.name}</span></div>
            <div className="filter-strip">
              {filters.map((item) => <button key={item.id} className={photos[activePhotoSlot].filterId === item.id ? "filter-chip active" : "filter-chip"} onClick={() => updateActivePhoto({ filterId: item.id })}><span className="filter-chip-preview" style={{ filter: getFilterStyle(item.id, photos[activePhotoSlot].filterIntensity) }}>{item.emoji}</span><small>{item.name}</small></button>)}
            </div>
            {photos[activePhotoSlot].filterId !== "original" && <div className="filter-intensity"><span>ความแรง</span><input type="range" min="0" max="100" value={photos[activePhotoSlot].filterIntensity} onChange={(event) => updateActivePhoto({ filterIntensity: Number(event.target.value) })} /><strong>{photos[activePhotoSlot].filterIntensity}%</strong></div>}
          </div>}
          <div className="step-actions"><button className="secondary-button" onClick={() => setActiveStep(1)}>← เปลี่ยน Template</button><button className="primary-button" disabled={photos.some((photo) => !photo.dataUrl)} onClick={() => setActiveStep(3)}>ต่อไป: ตรวจสอบ →</button></div>
        </div>

        <div className={"panel preview-panel step-panel step-panel-3 " + (activeStep === 3 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">03</span><div><h3>ตรวจสอบ Photo Card</h3><p>รูปทั้ง 4 ช่องจะถูกวางแทนพื้นที่วิวใน Template</p></div></div>
          <div className="poster-preview">
            {previewSrc ? <img className="poster-rendered-preview" src={previewSrc} alt={"ตัวอย่าง " + selectedTemplate.name} /> : <div className="preview-placeholder">กรุณาใส่รูปให้ครบทั้ง 4 ช่อง</div>}
          </div>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="offscreen-canvas" />
          <button className="save-button" disabled={photos.some((photo) => !photo.dataUrl) || busy} onClick={savePostcard}>{busy ? "กำลังบันทึก..." : "บันทึกเป็น PNG"}</button>
          <p className="status-message">{status}</p>
          {lastUrl && <a className="drive-link" href={lastUrl} target="_blank" rel="noreferrer">เปิดรูปจาก Google Drive ↗</a>}
          {queueCount > 0 && <button className="queue-button" onClick={retryQueue}>มีไฟล์รออัปโหลด {queueCount} รายการ · ลองอีกครั้ง</button>}
        </div>

        <div className={"panel gallery-panel step-panel step-panel-4 " + (activeStep === 4 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">04</span><div><h3>แกลเลอรี่</h3><p>รวม Photo Card ที่สร้างจากแอปนี้ในเครื่อง</p></div></div>
          {gallery.length ? <div className="gallery-grid">{gallery.map((item) => <article className="gallery-item" key={item.galleryId}><img src={item.dataUrl} alt={item.filename} /><div className="gallery-item-meta"><strong>{item.filename}</strong><span>{new Date(item.createdAt).toLocaleString("th-TH")}</span></div></article>)}</div> : <div className="gallery-empty"><strong>ยังไม่มีรูปในแกลเลอรี่</strong><span>เมื่อบันทึก Photo Card รูปจะมาแสดงที่นี่อัตโนมัติ</span></div>}
        </div>
      </section>
      <footer>วิทยาลัยเทคนิคระยอง · RYTC Photo Card · ใช้งานได้ทุกอุปกรณ์ · {APP_VERSION}</footer>
    </main>
  );
}

export default App;
