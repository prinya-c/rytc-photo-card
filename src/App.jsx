import { useCallback, useEffect, useRef, useState } from "react";

const LOGO_URL = "https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png";
const UPLOAD_ENDPOINT = import.meta.env.VITE_UPLOAD_ENDPOINT || "";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1800;
const DB_NAME = "rytc-photo-card";
const STORE_NAME = "pending-uploads";

const templates = [
  { id: "sunshine", name: "Sunshine", className: "template-sunshine", accent: "#f4b400" },
  { id: "green-pop", name: "Green Pop", className: "template-green-pop", accent: "#17804a" },
  { id: "tropical", name: "Tropical", className: "template-tropical", accent: "#ef6c57" },
  { id: "school-day", name: "School Day", className: "template-school-day", accent: "#1967a3" },
  { id: "confetti", name: "Confetti", className: "template-confetti", accent: "#8b5cf6" }
];

const today = () => new Date().toISOString().slice(0, 10);
const timestamp = () => new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const fileName = () => "RYTC-Photo-" + timestamp() + ".png";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "requestId" });
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
  if (!UPLOAD_ENDPOINT) return { queued: true };
  const response = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: item.requestId,
      filename: item.filename,
      mimeType: "image/png",
      base64: item.dataUrl.split(",")[1]
    })
  });
  if (!response.ok) throw new Error("อัปโหลดไม่สำเร็จ (" + response.status + ")");
  const result = await response.json();
  if (!result.success) throw new Error(result.message || "Google Drive ปฏิเสธการอัปโหลด");
  return result;
}

function App() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [imageSrc, setImageSrc] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("พร้อมสร้าง Photo Card");
  const [busy, setBusy] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastUrl, setLastUrl] = useState("");

  const refreshQueue = useCallback(async () => {
    try { setQueueCount((await pendingUploads()).length); } catch { setQueueCount(0); }
  }, []);

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
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOpen(true);
      setStatus("กล้องพร้อมถ่ายภาพ");
    } catch (error) {
      setStatus(error.name === "NotAllowedError" ? "กรุณาอนุญาตการใช้กล้องใน Browser" : "ไม่สามารถเปิดกล้องได้");
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    refreshQueue();
    const onOnline = async () => {
      setStatus("เชื่อมต่ออินเทอร์เน็ตแล้ว กำลังอัปโหลดไฟล์ค้าง...");
      await retryQueue();
    };
    window.addEventListener("online", onOnline);
    return () => { window.removeEventListener("online", onOnline); stopCamera(); };
  }, []);

  async function retryQueue() {
    const items = await pendingUploads();
    for (const item of items) {
      try { await uploadItem(item); await removeUpload(item.requestId); } catch { break; }
    }
    await refreshQueue();
    if (items.length) setStatus("ตรวจสอบคิวอัปโหลดแล้ว");
  }

  function setImageFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("กรุณาเลือกไฟล์ภาพเท่านั้น");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageSrc(reader.result); setZoom(1); setStatus("เลือกรูปภาพแล้ว ปรับภาพได้ตามต้องการ"); };
    reader.readAsDataURL(file);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setImageSrc(canvas.toDataURL("image/jpeg", 0.92));
    setStatus("ถ่ายภาพแล้ว");
    stopCamera();
  }

  function drawCover(ctx, image, width, height, scale = 1) {
    const ratio = Math.max(width / image.width, height / image.height) * scale;
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  async function renderPostcard() {
    if (!imageSrc) throw new Error("กรุณาถ่ายภาพหรือเลือกรูปก่อน");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const image = imageRef.current;
    const selected = templates.find((item) => item.id === templateId);
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#fffdf4";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawCover(ctx, image, CANVAS_WIDTH, CANVAS_HEIGHT, zoom);
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.fillRect(50, 55, CANVAS_WIDTH - 100, 230);
    ctx.fillStyle = selected.accent;
    ctx.fillRect(50, 55, 18, 230);
    ctx.fillStyle = "#173b2b";
    ctx.font = "700 48px sans-serif";
    ctx.fillText("วิทยาลัยเทคนิคระยอง", 105, 170);
    ctx.font = "700 34px sans-serif";
    ctx.fillStyle = selected.accent;
    ctx.fillText(today(), 105, 225);
    ctx.fillStyle = "rgba(23,59,43,.92)";
    ctx.fillRect(50, CANVAS_HEIGHT - 205, CANVAS_WIDTH - 100, 125);
    ctx.fillStyle = "#fff";
    ctx.font = "700 42px sans-serif";
    ctx.fillText("RYTC PHOTO CARD", 90, CANVAS_HEIGHT - 125);
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; logo.src = LOGO_URL; });
    if (logo.naturalWidth) ctx.drawImage(logo, CANVAS_WIDTH - 235, 80, 130, 130);
    return canvas.toDataURL("image/png");
  }

  async function savePostcard() {
    setBusy(true);
    setLastUrl("");
    try {
      const dataUrl = await renderPostcard();
      const item = { requestId: crypto.randomUUID(), filename: fileName(), dataUrl, createdAt: Date.now() };
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = item.filename;
      link.click();
      if (navigator.onLine && UPLOAD_ENDPOINT) {
        try {
          const result = await uploadItem(item);
          setLastUrl(result.viewUrl || "");
          setStatus("บันทึกลงเครื่องและ Google Drive แล้ว");
        } catch {
          await queueUpload(item);
          setStatus("บันทึกลงเครื่องแล้ว รออัปโหลดไป Google Drive");
        }
      } else {
        await queueUpload(item);
        setStatus(UPLOAD_ENDPOINT ? "ออฟไลน์: บันทึกแล้ว รออัปโหลด" : "บันทึกลงเครื่องแล้ว (ยังไม่ได้ตั้งค่า Upload API)");
      }
      await refreshQueue();
    } catch (error) {
      setStatus(error.message);
    } finally { setBusy(false); }
  }

  const selectedTemplate = templates.find((item) => item.id === templateId);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">RY</div>
        <div>
          <p className="eyebrow">RAYONG TECHNICAL COLLEGE</p>
          <h1>RYTC Photo Card</h1>
        </div>
        <div className="online-pill"><span />{navigator.onLine ? "ออนไลน์" : "ออฟไลน์"}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow yellow">CREATE • CAPTURE • SHARE</p>
          <h2>สร้างโปสการ์ด<br /><em>ในสไตล์ของคุณ</em></h2>
          <p className="hero-copy">ถ่ายภาพ เลือกแบบที่ชอบ แล้วบันทึกเป็น Photo Card ของวิทยาลัยเทคนิคระยอง</p>
        </div>
        <div className={"hero-card " + selectedTemplate.className}>
          <div className="hero-card-dots">✦　✦　✦</div>
          <strong>วิทยาลัยเทคนิคระยอง</strong>
          <span>{today()}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="section-heading"><span className="step-number">01</span><div><h3>เลือก Template</h3><p>เลือกดีไซน์ที่เข้ากับภาพของคุณ</p></div></div>
          <div className="template-grid">
            {templates.map((item) => (
              <button key={item.id} className={"template-option " + item.className + (item.id === templateId ? " selected" : "")} onClick={() => setTemplateId(item.id)}>
                <span>RYTC</span><small>{item.name}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading"><span className="step-number">02</span><div><h3>เพิ่มรูปภาพ</h3><p>ใช้กล้องหรือเลือกรูปจากเครื่อง</p></div></div>
          <div className={"camera-stage " + (imageSrc ? "has-image" : "")} style={imageSrc ? { backgroundImage: "url(" + imageSrc + ")", backgroundSize: (zoom * 100) + "% auto" } : {}}>
            {!imageSrc && !cameraOpen && <div className="empty-camera"><div className="camera-icon">⌾</div><strong>ยังไม่มีรูปภาพ</strong><span>กดเปิดกล้อง หรือเลือกรูปจากเครื่อง</span></div>}
            {cameraOpen && <video ref={videoRef} autoPlay playsInline muted />}
            {imageSrc && <img ref={imageRef} src={imageSrc} alt="ภาพที่เลือก" className="hidden-image" />}
            {cameraOpen && <div className="camera-actions"><button className="primary-button" onClick={capturePhoto}>ถ่ายภาพ</button><button className="ghost-button" onClick={stopCamera}>ปิดกล้อง</button></div>}
          </div>
          <div className="control-row">
            <button className="primary-button" onClick={() => startCamera()}>{cameraOpen ? "เปิดกล้องอีกครั้ง" : "เปิดกล้อง"}</button>
            <label className="secondary-button">เลือกรูป<input type="file" accept="image/*" onChange={(event) => setImageFromFile(event.target.files[0])} /></label>
            {imageSrc && <button className="secondary-button" onClick={() => { setImageSrc(""); setZoom(1); }}>ถ่ายใหม่</button>}
          </div>
          {imageSrc && <div className="zoom-control"><span>ซูม</span><input type="range" min="1" max="2.5" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><strong>{zoom.toFixed(1)}x</strong></div>}
        </div>

        <div className="panel preview-panel">
          <div className="section-heading"><span className="step-number">03</span><div><h3>บันทึก Photo Card</h3><p>ตรวจสอบภาพก่อนบันทึกเป็น PNG</p></div></div>
          <div className={"postcard-preview " + selectedTemplate.className}>
            {imageSrc ? <img src={imageSrc} alt="ตัวอย่าง Photo Card" style={{ transform: "scale(" + zoom + ")" }} /> : <div className="preview-placeholder">ภาพตัวอย่าง<br />จะปรากฏที่นี่</div>}
            <div className="preview-overlay"><strong>วิทยาลัยเทคนิคระยอง</strong><span>{today()}</span></div>
            <div className="preview-footer">RYTC PHOTO CARD</div>
          </div>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="offscreen-canvas" />
          <button className="save-button" disabled={!imageSrc || busy} onClick={savePostcard}>{busy ? "กำลังบันทึก..." : "บันทึกเป็น PNG"}</button>
          <p className="status-message">{status}</p>
          {lastUrl && <a className="drive-link" href={lastUrl} target="_blank" rel="noreferrer">เปิดรูปจาก Google Drive ↗</a>}
          {queueCount > 0 && <button className="queue-button" onClick={retryQueue}>มีไฟล์รออัปโหลด {queueCount} รายการ · ลองอีกครั้ง</button>}
        </div>
      </section>

      <footer>วิทยาลัยเทคนิคระยอง · RYTC Photo Card · ใช้งานได้ทุกอุปกรณ์</footer>
    </main>
  );
}

export default App;
