import { useCallback, useEffect, useRef, useState } from "react";

const LOGO_URL = "https://resume.rytc.ac.th/assets/rytc_logo-DMbLvb1_.png";
const LOGO_EXPORT_URL = (import.meta.env.BASE_URL || "/") + "assets/rytc-logo.svg";
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

  function drawCover(ctx, image, x, y, width, height, scale = 1) {
    const ratio = Math.max(width / image.width, height / image.height) * scale;
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function templateColors(selected) {
    const colors = {
      sunshine: { background: "#fff8df", paper: "#fffdf4", accent: "#f4b400", ink: "#4c3510" },
      "green-pop": { background: "#edf8eb", paper: "#ffffff", accent: "#17804a", ink: "#173b2b" },
      tropical: { background: "#fff0f3", paper: "#ffffff", accent: "#e84576", ink: "#5a1933" },
      "school-day": { background: "#eaf6f8", paper: "#ffffff", accent: "#1967a3", ink: "#123b5b" },
      confetti: { background: "#f6efff", paper: "#ffffff", accent: "#8b5cf6", ink: "#3b216b" }
    };
    return colors[selected.id] || colors.sunshine;
  }

  function drawLogoContain(ctx, logo, x, y, maxWidth, maxHeight) {
    if (!logo.naturalWidth) return;
    const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight);
    const width = logo.naturalWidth * scale;
    const height = logo.naturalHeight * scale;
    ctx.drawImage(logo, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height);
  }

  async function renderPostcard() {
    if (!imageSrc) throw new Error("กรุณาถ่ายภาพหรือเลือกรูปก่อน");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const image = imageRef.current;
    const selected = templates.find((item) => item.id === templateId);
    const colors = templateColors(selected);
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; logo.src = LOGO_EXPORT_URL; });

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = "center";

    if (selected.id === "sunshine") {
      ctx.fillStyle = "#fff8df";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#f4b400";
      ctx.fillRect(0, 0, CANVAS_WIDTH, 24);
      if (logo.naturalWidth) drawLogoContain(ctx, logo, 500, 55, 200, 95);
      ctx.fillStyle = "#4c3510";
      ctx.font = "700 54px Georgia, serif";
      ctx.fillText("วิทยาลัยเทคนิคระยอง", 600, 200);
      ctx.font = "italic 32px Georgia, serif";
      ctx.fillStyle = "#b87c00";
      ctx.fillText(today(), 600, 250);
      drawCover(ctx, image, 115, 320, 970, 1160, zoom);
      ctx.strokeStyle = "#f4b400";
      ctx.lineWidth = 8;
      ctx.strokeRect(105, 310, 990, 1180);
      ctx.fillStyle = "#4c3510";
      ctx.font = "700 54px Georgia, serif";
      ctx.fillText("RYTC PHOTO CARD", 600, 1585);
      ctx.font = "italic 30px Georgia, serif";
      ctx.fillStyle = "#b87c00";
      ctx.fillText("Rayong Technical College", 600, 1645);
    } else if (selected.id === "green-pop") {
      ctx.fillStyle = "#edf8eb";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#17804a";
      ctx.fillRect(0, 0, 260, CANVAS_HEIGHT);
      if (logo.naturalWidth) drawLogoContain(ctx, logo, 35, 90, 190, 100);
      ctx.save();
      ctx.translate(130, 940);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = "800 48px sans-serif";
      ctx.fillText("วิทยาลัยเทคนิคระยอง", 0, 0);
      ctx.restore();
      ctx.fillStyle = "#173b2b";
      ctx.textAlign = "left";
      ctx.font = "800 42px sans-serif";
      ctx.fillText("RYTC", 330, 120);
      ctx.font = "700 30px sans-serif";
      ctx.fillStyle = "#17804a";
      ctx.fillText(today(), 330, 175);
      drawCover(ctx, image, 330, 260, 760, 1040, zoom);
      ctx.strokeStyle = "#17804a";
      ctx.lineWidth = 12;
      ctx.strokeRect(315, 245, 790, 1070);
      ctx.fillStyle = "#173b2b";
      ctx.textAlign = "center";
      ctx.font = "800 55px sans-serif";
      ctx.fillText("PHOTO MOMENT", 700, 1450);
      ctx.font = "italic 30px sans-serif";
      ctx.fillStyle = "#17804a";
      ctx.fillText("Rayong Technical College", 700, 1510);
    } else if (selected.id === "tropical") {
      ctx.fillStyle = "#fff0f3";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#e84576";
      ctx.fillRect(0, 0, CANVAS_WIDTH, 180);
      if (logo.naturalWidth) drawLogoContain(ctx, logo, 55, 45, 170, 85);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = "800 42px sans-serif";
      ctx.fillText("RYTC", 240, 95);
      ctx.font = "700 32px sans-serif";
      ctx.fillText(today(), 240, 140);
      drawCover(ctx, image, 100, 260, 1000, 1120, zoom);
      ctx.strokeStyle = "#e84576";
      ctx.lineWidth = 7;
      ctx.strokeRect(88, 248, 1024, 1144);
      ctx.fillStyle = "#5a1933";
      ctx.textAlign = "center";
      ctx.font = "900 70px Georgia, serif";
      ctx.fillText("MEMORIES", 600, 1515);
      ctx.font = "italic 32px Georgia, serif";
      ctx.fillStyle = "#e84576";
      ctx.fillText("วิทยาลัยเทคนิคระยอง", 600, 1580);
    } else if (selected.id === "school-day") {
      ctx.fillStyle = "#eaf6f8";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#1967a3";
      ctx.fillRect(0, 0, CANVAS_WIDTH, 250);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.font = "900 62px sans-serif";
      ctx.fillText("RYTC", 90, 115);
      ctx.font = "700 34px sans-serif";
      ctx.fillText("วิทยาลัยเทคนิคระยอง", 90, 180);
      if (logo.naturalWidth) drawLogoContain(ctx, logo, 900, 55, 210, 110);
      drawCover(ctx, image, 135, 340, 930, 1050, zoom);
      ctx.strokeStyle = "#1967a3";
      ctx.lineWidth = 5;
      ctx.strokeRect(125, 330, 950, 1070);
      ctx.fillStyle = "#123b5b";
      ctx.textAlign = "left";
      ctx.font = "900 58px sans-serif";
      ctx.fillText("SCHOOL DAY", 135, 1530);
      ctx.font = "700 32px sans-serif";
      ctx.fillStyle = "#1967a3";
      ctx.fillText(today() + "  /  RAYONG", 135, 1600);
    } else {
      ctx.fillStyle = "#f6efff";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#8b5cf6";
      ctx.beginPath();
      ctx.arc(1050, 130, 180, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b216b";
      ctx.textAlign = "center";
      ctx.font = "900 76px Georgia, serif";
      ctx.fillText("HELLO!", 600, 150);
      if (logo.naturalWidth) drawLogoContain(ctx, logo, 500, 180, 200, 85);
      ctx.font = "700 30px sans-serif";
      ctx.fillStyle = "#8b5cf6";
      ctx.fillText(today(), 600, 290);
      ctx.save();
      ctx.translate(600, 885);
      ctx.rotate(-0.025);
      ctx.fillStyle = "#fff";
      ctx.fillRect(-500, -570, 1000, 1140);
      drawCover(ctx, image, -430, -500, 860, 900, zoom);
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 8;
      ctx.strokeRect(-440, -510, 880, 920);
      ctx.restore();
      ctx.fillStyle = "#3b216b";
      ctx.font = "900 54px Georgia, serif";
      ctx.fillText("GOOD VIBES", 600, 1510);
      ctx.font = "italic 30px Georgia, serif";
      ctx.fillStyle = "#8b5cf6";
      ctx.fillText("วิทยาลัยเทคนิคระยอง", 600, 1570);
    }

    ctx.textAlign = "start";
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
            {cameraOpen && <div className="camera-actions"><button className="primary-button" onClick={capturePhoto}>ถ่ายภาพ</button><button className="ghost-button" onClick={() => { const next = facingMode === "environment" ? "user" : "environment"; setFacingMode(next); startCamera(next); }}>สลับกล้อง</button><button className="ghost-button" onClick={stopCamera}>ปิดกล้อง</button></div>}
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
            <div className="postcard-paper">
              <div className="postcard-top-line" />
              <div className="postcard-kicker">RYTC PHOTO CARD</div>
              <img className="postcard-logo" src={LOGO_URL} alt="โลโก้วิทยาลัยเทคนิคระยอง" />
              <div className="postcard-header">
                <strong>วิทยาลัยเทคนิคระยอง</strong>
                <span>{today()}</span>
              </div>
              <div className="postcard-photo-frame">
                {imageSrc ? <img src={imageSrc} alt="ตัวอย่าง Photo Card" style={{ transform: "scale(" + zoom + ")" }} /> : <div className="preview-placeholder">ภาพตัวอย่าง<br />จะปรากฏที่นี่</div>}
              </div>
              <div className="postcard-caption">RYTC PHOTO CARD</div>
              <div className="postcard-subcaption">Rayong Technical College</div>
            </div>
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
