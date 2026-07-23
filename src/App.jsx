import { useCallback, useEffect, useRef, useState } from "react";
import packageJson from "../package.json";

const APP_VERSION = "v" + packageJson.version;
const LOGO_URL = "https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png";
const LOGO_EXPORT_URL = (import.meta.env.BASE_URL || "/") + "assets/rytc-logo-original.png";
const UPLOAD_ENDPOINT = import.meta.env.VITE_UPLOAD_ENDPOINT || "";
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 1800;
const DB_NAME = "rytc-photo-card";
const STORE_NAME = "pending-uploads";
const GALLERY_STORE_NAME = "gallery-items";

const TEMPLATE_BASE = (import.meta.env.BASE_URL || "/") + "templates/";
const templates = [
  {
    id: "template-1",
    name: "RYTC Heart",
    asset: TEMPLATE_BASE + "template-1.png",
    slots: [
      { x: 34, y: 493, width: 528, height: 360 },
      { x: 34, y: 976, width: 528, height: 372 }
    ]
  },
  {
    id: "template-2",
    name: "Always Friends",
    asset: TEMPLATE_BASE + "template-2.png",
    slots: [
      { x: 35, y: 335, width: 521, height: 395 },
      { x: 35, y: 823, width: 521, height: 397 }
    ]
  },
  {
    id: "template-3",
    name: "Fresh Start",
    asset: TEMPLATE_BASE + "template-3.png",
    slots: [
      { x: 28, y: 357, width: 544, height: 357 },
      { x: 30, y: 729, width: 544, height: 356 },
      { x: 33, y: 1100, width: 544, height: 356 }
    ]
  },
  {
    id: "template-4",
    name: "Snap the Moment",
    asset: TEMPLATE_BASE + "template-4.png",
    slots: [
      { x: 37, y: 289, width: 533, height: 377 },
      { x: 39, y: 697, width: 532, height: 377 },
      { x: 37, y: 1107, width: 533, height: 377 }
    ]
  },
  {
    id: "template-5",
    name: "Let's Go",
    asset: TEMPLATE_BASE + "template-5.png",
    slots: [
      { x: 74, y: 236, width: 439, height: 342 },
      { x: 74, y: 624, width: 439, height: 343 },
      { x: 74, y: 1012, width: 439, height: 343 }
    ]
  },
  {
    id: "template-6",
    name: "Special Moment",
    asset: TEMPLATE_BASE + "template-6.png",
    slots: [
      { x: 44, y: 321, width: 520, height: 376 },
      { x: 47, y: 782, width: 520, height: 376 }
    ]
  },
  {
    id: "template-7",
    name: "RYTC Photo Card",
    asset: TEMPLATE_BASE + "template-7.png",
    slots: [
      { x: 42, y: 263, width: 533, height: 383 },
      { x: 42, y: 647, width: 533, height: 404 },
      { x: 42, y: 1072, width: 533, height: 383 }
    ]
  },
  {
    id: "template-8",
    name: "Information Technology",
    asset: TEMPLATE_BASE + "template-8.png",
    slots: [
      { x: 94, y: 406, width: 465, height: 322 },
      { x: 93, y: 794, width: 466, height: 322 },
      { x: 94, y: 1171, width: 465, height: 322 }
    ]
  }
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
  const [photos, setPhotos] = useState(() => Array.from({ length: templates[0].slots.length }, createEmptyPhoto));
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
  const [selectedGalleryItem, setSelectedGalleryItem] = useState(null);
  const retryRunningRef = useRef(false);

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

  const getViewUrl = (result) => result?.viewUrl || result?.fileUrl || result?.url || "";

  const waitBeforeRetry = (attempt) => new Promise((resolve) => {
    window.setTimeout(resolve, Math.min(1000 * (2 ** Math.min(attempt, 4)), 10000));
  });

  async function uploadUntilSuccess(item) {
    let attempt = 0;
    while (navigator.onLine && UPLOAD_ENDPOINT) {
      try {
        return await uploadItem(item);
      } catch (error) {
        attempt += 1;
        setStatus("อัปโหลดไม่สำเร็จ กำลังลองใหม่อัตโนมัติครั้งที่ " + attempt + "...");
        await waitBeforeRetry(attempt);
      }
    }
    throw new Error("ออฟไลน์: ไฟล์ถูกเก็บไว้รออัปโหลด");
  }

  async function retryQueue() {
    if (retryRunningRef.current) return;
    retryRunningRef.current = true;
    setBusy(true);
    try {
      while (navigator.onLine && UPLOAD_ENDPOINT) {
        const items = await pendingUploads();
        if (!items.length) break;
        for (const item of items) {
          const result = await uploadUntilSuccess(item);
          await removeUpload(item.requestId);
          const viewUrl = getViewUrl(result);
          if (viewUrl) setLastUrl(viewUrl);
        }
      }
      await refreshQueue();
      setStatus("อัปโหลด Google Drive สำเร็จแล้ว");
    } catch (error) {
      await refreshQueue();
      setStatus(error.message);
    } finally {
      retryRunningRef.current = false;
      setBusy(false);
    }
  }

  function updateActivePhoto(changes) {
    setPhotos((current) => current.map((photo, index) => index === activePhotoSlot ? { ...photo, ...changes } : photo));
  }

  function chooseTemplate(id) {
    const nextTemplate = templates.find((item) => item.id === id);
    if (!nextTemplate) return;
    setTemplateId(id);
    setPhotos((current) => Array.from(
      { length: nextTemplate.slots.length },
      (_, index) => current[index] || createEmptyPhoto()
    ));
    setActivePhotoSlot(0);
    setPreviewSrc("");
    setActiveStep(2);
    setStatus("เลือก " + nextTemplate.name + " แล้ว · ต้องใช้ " + nextTemplate.slots.length + " รูป");
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
    const selected = templates.find((item) => item.id === templateId);
    if (photos.some((photo) => !photo.dataUrl)) {
      throw new Error("กรุณาใส่รูปให้ครบทั้ง " + selected.slots.length + " ช่อง");
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const background = await loadImage(selected.asset);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(background, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (let index = 0; index < selected.slots.length; index += 1) {
      const photo = photos[index];
      const image = await loadImage(photo.dataUrl);
      const slot = selected.slots[index];
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
      await saveGalleryItem({ galleryId: item.requestId, filename: item.filename, dataUrl: item.dataUrl, createdAt: item.createdAt, templateId, photoCount: selectedTemplate.slots.length });
      await refreshGallery();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = item.filename;
      link.click();
      await queueUpload(item);
      if (navigator.onLine && UPLOAD_ENDPOINT) {
        try {
          const result = await uploadUntilSuccess(item);
          await removeUpload(item.requestId);
          const viewUrl = getViewUrl(result);
          if (viewUrl) setLastUrl(viewUrl);
          setStatus("บันทึกลงเครื่องและ Google Drive แล้ว");
        } catch (error) {
          setStatus("บันทึกลงเครื่องแล้ว: " + error.message);
        }
      } else {
        setStatus(UPLOAD_ENDPOINT ? "ออฟไลน์: บันทึกแล้ว รออัปโหลด" : "บันทึกลงเครื่องแล้ว (ยังไม่ได้ตั้งค่า Upload API)");
      }
      await refreshQueue();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function shareGalleryItem(item) {
    try {
      const blob = dataUrlToBlob(item.dataUrl);
      const file = new File([blob], item.filename, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "RYTC Photo Card", files: [file] });
        setStatus("แชร์รูปเรียบร้อยแล้ว");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = item.filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("อุปกรณ์นี้ไม่รองรับการแชร์โดยตรง จึงเตรียมไฟล์สำหรับดาวน์โหลดแล้ว");
      }
    } catch (error) {
      if (error.name !== "AbortError") setStatus("แชร์รูปไม่สำเร็จ");
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
          <div className="section-heading"><span className="step-number">01</span><div><h3>เลือก Template</h3><p>มี 8 แบบ แต่ละแบบใช้จำนวนรูปต่างกัน</p></div></div>
          <div className="template-grid actual-template-grid">
            {templates.map((item) => (
              <button key={item.id} className={"template-option " + (item.id === templateId ? "selected" : "")} onClick={() => chooseTemplate(item.id)}>
                <img src={item.asset} alt={item.name} /><strong>{item.name}<small>{item.slots.length} รูป</small></strong>
              </button>
            ))}
          </div>
          <div className="step-actions"><button className="primary-button" onClick={() => setActiveStep(2)}>ต่อไป: เพิ่มรูปภาพ →</button></div>
        </div>

        <div className={"panel step-panel step-panel-2 " + (activeStep === 2 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">02</span><div><h3>เพิ่มรูปภาพ {selectedTemplate.slots.length} ช่อง</h3><p>เลือกช่อง แล้วถ่ายภาพหรือเลือกรูปจากเครื่อง</p></div></div>
          <div className="photo-slot-grid" style={{ gridTemplateColumns: "repeat(" + photos.length + ", minmax(0, 1fr))" }}>
            {photos.map((photo, index) => (
              <button key={index} className={"photo-slot " + (activePhotoSlot === index ? "active" : "")} onClick={() => setActivePhotoSlot(index)}>
                {photo.dataUrl ? <img src={photo.dataUrl} alt={"รูปที่ " + (index + 1)} /> : <span>รูปที่ {index + 1}<small>ยังไม่มีรูป</small></span>}
              </button>
            ))}
          </div>
          <p className="slot-status">กำลังแก้ไขรูปที่ {activePhotoSlot + 1} จาก {selectedTemplate.slots.length} {photos[activePhotoSlot].dataUrl ? "· มีรูปแล้ว" : "· รอรูปภาพ"}</p>
          <div className={"camera-stage " + (photos[activePhotoSlot].dataUrl ? "has-image" : "")}>
            {photos[activePhotoSlot].dataUrl && !cameraOpen && <img className="camera-image-layer" src={photos[activePhotoSlot].dataUrl} alt={"รูปที่ " + (activePhotoSlot + 1)} style={{ transform: "scale(" + photos[activePhotoSlot].zoom + ")", filter: getFilterStyle(photos[activePhotoSlot].filterId, photos[activePhotoSlot].filterIntensity) }} />}
            {!photos[activePhotoSlot].dataUrl && !cameraOpen && <div className="empty-camera"><div className="camera-icon">⌾</div><strong>ยังไม่มีรูปช่องนี้</strong><span>ถ่ายด้วยกล้องหรือเลือกจากเครื่อง</span><button className="primary-button empty-camera-action" onClick={() => startCamera()}>ถ่ายด้วยกล้อง</button></div>}
            {cameraOpen && <video ref={videoRef} autoPlay playsInline muted />}
            {cameraOpen && <div className="camera-actions">
              <button className="camera-icon-button camera-switch-button" aria-label="สลับกล้อง" title="สลับกล้อง" onClick={() => { const next = facingMode === "environment" ? "user" : "environment"; setFacingMode(next); startCamera(next); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h9a4 4 0 0 1 3.7 2.5M17 17H8a4 4 0 0 1-3.7-2.5M18 5v4.5h-4.5M6 19v-4.5h4.5M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"/></svg>
              </button>
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
          <div className="section-heading"><span className="step-number">03</span><div><h3>ตรวจสอบ Photo Card</h3><p>รูปทั้ง {selectedTemplate.slots.length} ช่องจะถูกวางใน Template ที่เลือก</p></div></div>
          <div className="poster-preview">
            {previewSrc ? <img className="poster-rendered-preview" src={previewSrc} alt={"ตัวอย่าง " + selectedTemplate.name} /> : <div className="preview-placeholder">กรุณาใส่รูปให้ครบทั้ง {selectedTemplate.slots.length} ช่อง</div>}
          </div>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="offscreen-canvas" />
          <button className="save-button" disabled={photos.some((photo) => !photo.dataUrl) || busy} onClick={savePostcard}>{busy ? "กำลังบันทึก..." : "บันทึกเป็น PNG"}</button>
          <p className="status-message">{status}</p>
          {lastUrl && <a className="drive-link" href={lastUrl} target="_blank" rel="noreferrer">เปิดรูปจาก Google Drive ↗</a>}
          {queueCount > 0 && <button className="queue-button" onClick={retryQueue}>มีไฟล์รออัปโหลด {queueCount} รายการ · ลองอีกครั้ง</button>}
        </div>

        <div className={"panel gallery-panel step-panel step-panel-4 " + (activeStep === 4 ? "active" : "")}>
          <div className="section-heading"><span className="step-number">04</span><div><h3>แกลเลอรี่</h3><p>รวม Photo Card ที่สร้างจากแอปนี้ในเครื่อง</p></div></div>
          {gallery.length ? <div className="gallery-grid">{gallery.map((item) => <button className="gallery-item" key={item.galleryId} onClick={() => setSelectedGalleryItem(item)}><img src={item.dataUrl} alt={item.filename} /><span className="gallery-item-meta"><strong>{item.filename}</strong><span>{new Date(item.createdAt).toLocaleString("th-TH")}</span></span></button>)}</div> : <div className="gallery-empty"><strong>ยังไม่มีรูปในแกลเลอรี่</strong><span>เมื่อบันทึก Photo Card รูปจะมาแสดงที่นี่อัตโนมัติ</span></div>}
        </div>
      </section>
      {selectedGalleryItem && <div className="gallery-modal" role="dialog" aria-modal="true" aria-label="ดูรูปภาพ" onClick={() => setSelectedGalleryItem(null)}>
        <div className="gallery-modal-card" onClick={(event) => event.stopPropagation()}>
          <button className="gallery-modal-close" aria-label="ปิด" onClick={() => setSelectedGalleryItem(null)}>×</button>
          <img src={selectedGalleryItem.dataUrl} alt={selectedGalleryItem.filename} />
          <div className="gallery-modal-actions">
            <button className="primary-button" onClick={() => shareGalleryItem(selectedGalleryItem)}>แชร์รูป</button>
            <a className="secondary-button" href={selectedGalleryItem.dataUrl} download={selectedGalleryItem.filename}>ดาวน์โหลด PNG</a>
          </div>
        </div>
      </div>}
      <footer>วิทยาลัยเทคนิคระยอง · RYTC Photo Card · ใช้งานได้ทุกอุปกรณ์ · {APP_VERSION}</footer>
    </main>
  );
}

export default App;
