
"use strict";

/* =========================================
   STAR GAZING — Camera + Rectangle Detection
   Manual 4-corner selection + X/Y 0–1
   No WebSocket, HTTP, OSC, or TouchDesigner
========================================= */

// ---------- CONFIG ----------
const PROCESS_WIDTH = 640;
const DETECTION_INTERVAL = 120;
const MAX_LOST_FRAMES = 8;
const MIN_RECT_AREA = 0.025;
const MAX_RECT_AREA = 0.95;

// ---------- ELEMENTS ----------
const camera = document.getElementById("camera");
const startButton = document.getElementById("startButton");
const xElement = document.getElementById("x");
const yElement = document.getElementById("y");
const processingCanvas = document.getElementById("processingCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const statusElement = document.getElementById("status");

if (
  !camera ||
  !startButton ||
  !xElement ||
  !yElement ||
  !processingCanvas ||
  !overlayCanvas ||
  !statusElement
) {
  console.error(
    "Missing HTML element. Check camera, startButton, x, y, processingCanvas, overlayCanvas, and status."
  );
}

const processingContext = processingCanvas?.getContext("2d", {
  willReadFrequently: true
});

const overlayContext = overlayCanvas?.getContext("2d");

// ---------- STATE ----------
let stream = null;
let running = false;
let cvReady = false;
let loopTimer = null;

let manualMode = false;
let selectedPoints = [];
let lastRectangle = null;
let lostFrames = 0;

let manualButton;
let autoButton;
let resetButton;
let controlsPanel;
let instructionsElement;

// ---------- STATUS ----------
function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setXY(x, y) {
  if (xElement) {
    xElement.textContent =
      x == null ? "--" : Number(x).toFixed(3);
  }

  if (yElement) {
    yElement.textContent =
      y == null ? "--" : Number(y).toFixed(3);
  }
}

function resetXY() {
  setXY(null, null);
}

// ---------- UI ----------
function addPageStyles() {
  const style = document.createElement("style");
  style.id = "stargazing-ui-styles";

  style.textContent = `
    #sg-controls {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      left: 10px;
      right: 10px;
      z-index: 2147483000;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
      pointer-events: none;
      font-family: Arial, sans-serif;
    }

    #sg-controls button {
      pointer-events: auto;
      appearance: none;
      -webkit-appearance: none;
      touch-action: manipulation;
      cursor: pointer;
      color: white;
      background: #176b39;
      border: 1px solid rgba(255,255,255,.35);
      border-radius: 12px;
      padding: 11px 13px;
      min-height: 44px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }

    #sg-controls button.sg-secondary {
      background: #333333;
    }

    #sg-controls button.sg-danger {
      background: #8c2831;
    }

    #sg-instructions {
      flex-basis: 100%;
      width: fit-content;
      max-width: 100%;
      box-sizing: border-box;
      padding: 9px 12px;
      border-radius: 10px;
      color: white;
      background: rgba(0,0,0,.75);
      font-size: 14px;
      line-height: 1.45;
      pointer-events: none;
    }

    #overlayCanvas {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 1000 !important;
      pointer-events: none;
      touch-action: manipulation;
    }

    #sg-controls button:active {
      opacity: .75;
      transform: scale(.98);
    }
  `;

  document.head.appendChild(style);
}

function createControls() {
  addPageStyles();

  // Prevent creating duplicate controls.
  document.getElementById("sg-controls")?.remove();

  controlsPanel = document.createElement("div");
  controlsPanel.id = "sg-controls";

  manualButton = createButton(
    "เลือก 4 มุมเอง",
    "sg-primary",
    () => enableManualMode()
  );

  autoButton = createButton(
    "กลับไปตรวจจับอัตโนมัติ",
    "sg-secondary",
    () => enableAutoMode()
  );

  resetButton = createButton(
    "ล้างมุมที่เลือก",
    "sg-danger",
    () => resetManualPoints()
  );

  instructionsElement = document.createElement("div");
  instructionsElement.id = "sg-instructions";
  instructionsElement.textContent =
    "เปิดกล้อง แล้วเลือก 4 มุมเองได้เมื่อระบบหาไม่พบ";

  controlsPanel.append(
    manualButton,
    autoButton,
    resetButton,
    instructionsElement
  );

  document.body.appendChild(controlsPanel);
}

function createButton(label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;

  if (className === "sg-secondary") {
    button.classList.add("sg-secondary");
  }

  if (className === "sg-danger") {
    button.classList.add("sg-danger");
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  });

  return button;
}

function setInstructions(message) {
  if (instructionsElement) {
    instructionsElement.textContent = message;
  }
}

// ---------- OPENCV READY ----------
function waitForOpenCV(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function check() {
      if (
        typeof cv !== "undefined" &&
        cv &&
        cv.Mat &&
        cv.findContours &&
        cv.getPerspectiveTransform
      ) {
        // OpenCV.js runtime is ready after this callback.
        if (cv.HEAP8 && cv.HEAP8.length > 0) {
          cvReady = true;
          resolve();
          return;
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(
          new Error(
            "OpenCV ยังไม่พร้อม กรุณาตรวจสอบว่า HTML โหลด OpenCV.js แล้ว"
          )
        );
        return;
      }

      setTimeout(check, 150);
    }

    check();
  });
}

// ---------- CAMERA ----------
async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "เบราว์เซอร์นี้ไม่รองรับกล้อง กรุณาเปิดเว็บผ่าน HTTPS"
      );
    }

    setStatus("กำลังเปิดกล้อง...");
    setInstructions("กำลังขออนุญาตใช้กล้อง");

    if (!cvReady) {
      setStatus("กำลังโหลดระบบตรวจจับ...");
      await waitForOpenCV();
    }

    stopCamera(false);

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    camera.srcObject = stream;
    camera.setAttribute("playsinline", "");
    camera.setAttribute("autoplay", "");
    camera.muted = true;

    await new Promise((resolve, reject) => {
      if (camera.readyState >= 2 && camera.videoWidth > 0) {
        resolve();
        return;
      }

      camera.onloadedmetadata = () => resolve();
      camera.onerror = () => reject(
        new Error("โหลดภาพจากกล้องไม่สำเร็จ")
      );
    });

    await camera.play();

    if (!camera.videoWidth || !camera.videoHeight) {
      throw new Error("ยังไม่ได้รับภาพจากกล้อง");
    }

    prepareCanvases();

    running = true;
    manualMode = false;
    selectedPoints = [];
    lastRectangle = null;
    lostFrames = 0;

    resetXY();

    setStatus("กล้องพร้อม — กำลังตรวจจับกรอบ");
    setInstructions(
      "ถ้าหากรอบไม่เจอ ให้กด “เลือก 4 มุมเอง” ด้านบน"
    );

    startButton.textContent = "ปิดกล้อง";
    startButton.onclick = () => stopCamera();

    requestAnimationFrame(detectLoop);
  } catch (error) {
    console.error(error);

    setStatus("เปิดกล้องไม่สำเร็จ: " + error.message);
    setInstructions(
      "ตรวจสอบสิทธิ์กล้องและการโหลด OpenCV.js"
    );

    stopCamera(false);
  }
}

function prepareCanvases() {
  const scale = Math.min(
    1,
    PROCESS_WIDTH / camera.videoWidth
  );

  processingCanvas.width = Math.round(
    camera.videoWidth * scale
  );

  processingCanvas.height = Math.round(
    camera.videoHeight * scale
  );

  resizeOverlayCanvas();
}

function resizeOverlayCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const width = window.innerWidth;
  const height = window.innerHeight;

  overlayCanvas.width = Math.round(width * dpr);
  overlayCanvas.height = Math.round(height * dpr);

  overlayCanvas.style.width = width + "px";
  overlayCanvas.style.height = height + "px";

  overlayContext?.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawOverlay();
}

window.addEventListener("resize", resizeOverlayCanvas);
window.addEventListener("orientationchange", () => {
  setTimeout(resizeOverlayCanvas, 300);
});

function stopCamera(updateStatus = true) {
  running = false;

  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (camera) {
    camera.pause();
    camera.srcObject = null;
  }

  if (startButton) {
    startButton.textContent = "เปิดกล้อง";
    startButton.onclick = startCamera;
  }

  if (updateStatus) {
    setStatus("ปิดกล้องแล้ว");
    setInstructions("กดเปิดกล้องเพื่อเริ่มใช้งาน");
  }

  drawOverlay();
}

window.stopStargazingCamera = stopCamera;

// ---------- IMAGE PROCESSING ----------
function detectLoop() {
  if (!running) return;

  try {
    if (
      camera.readyState >= 2 &&
      processingCanvas.width > 0 &&
      processingCanvas.height > 0
    ) {
      processingContext.drawImage(
        camera,
        0,
        0,
        processingCanvas.width,
        processingCanvas.height
      );

      if (!manualMode) {
        const candidates = findRectangleCandidates();

        if (candidates.length > 0) {
          lastRectangle = candidates[0].points;
          lostFrames = 0;
          calculateXY(lastRectangle);
          setStatus("ตรวจพบกรอบสี่เหลี่ยม");
        } else {
          lostFrames++;

          if (lostFrames > MAX_LOST_FRAMES) {
            lastRectangle = null;
            resetXY();
            setStatus(
              "ไม่พบสี่เหลี่ยม — กดเลือก 4 มุมเองได้"
            );
          }
        }
      }

      drawOverlay();
    }
  } catch (error) {
    console.error("Detection error:", error);
    setStatus("เกิดข้อผิดพลาดในการตรวจจับ");
  }

  loopTimer = setTimeout(() => {
    requestAnimationFrame(detectLoop);
  }, DETECTION_INTERVAL);
}

function findRectangleCandidates() {
  const candidates = [];

  let src;
  let gray;
  let enhanced;
  let edges;
  let hierarchy;
  let contours;

  try {
    src = cv.imread(processingCanvas);
    gray = new cv.Mat();
    enhanced = new cv.Mat();
    edges = new cv.Mat();
    hierarchy = new cv.Mat();
    contours = new cv.MatVector();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Improve contrast to help with dark screen borders.
    const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));

    try {
      clahe.apply(gray, enhanced);
    } finally {
      clahe.delete();
    }

    cv.GaussianBlur(
      enhanced,
      enhanced,
      new cv.Size(5, 5),
      0
    );

    cv.Canny(enhanced, edges, 35, 110);

    const kernel = cv.getStructuringElement(
      cv.MORPH_RECT,
      new cv.Size(3, 3)
    );

    try {
      cv.dilate(
        edges,
        edges,
        kernel,
        new cv.Point(-1, -1),
        1
      );
    } finally {
      kernel.delete();
    }

    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const imageArea =
      processingCanvas.width * processingCanvas.height;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);

      try {
        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();

        try {
          cv.approxPolyDP(
            contour,
            approx,
            0.025 * perimeter,
            true
          );

          if (approx.rows !== 4 || !cv.isContourConvex(approx)) {
            continue;
          }

          const area = Math.abs(cv.contourArea(approx));
          const areaRatio = area / imageArea;

          if (
            areaRatio < MIN_RECT_AREA ||
            areaRatio > MAX_RECT_AREA
          ) {
            continue;
          }

          const rawPoints = [];

          for (let j = 0; j < 4; j++) {
            rawPoints.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            });
          }

          const points = orderPoints(rawPoints);

          if (!isValidRectangle(points)) continue;

          const score = scoreRectangle(points, areaRatio);

          candidates.push({
            points,
            area,
            score
          });
        } finally {
          approx.delete();
        }
      } finally {
        contour.delete();
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  } catch (error) {
    console.error("Rectangle detection error:", error);
    return [];
  } finally {
    src?.delete();
    gray?.delete();
    enhanced?.delete();
    edges?.delete();
    hierarchy?.delete();
    contours?.delete();
  }
}

function scoreRectangle(points, areaRatio) {
  const [tl, tr, br, bl] = points;

  const top = distance(tl, tr);
  const right = distance(tr, br);
  const bottom = distance(br, bl);
  const left = distance(bl, tl);

  const oppositeSideSimilarity =
    Math.min(top, bottom) / Math.max(top, bottom) +
    Math.min(left, right) / Math.max(left, right);

  // Prefer larger, reasonably regular rectangles.
  return areaRatio * 100 + oppositeSideSimilarity * 10;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function orderPoints(points) {
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / 4,
      y: sum.y + point.y / 4
    }),
    { x: 0, y: 0 }
  );

  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(
      a.y - center.y,
      a.x - center.x
    );

    const angleB = Math.atan2(
      b.y - center.y,
      b.x - center.x
    );

    return angleA - angleB;
  });

  // Rotate the sequence so the first point is top-left.
  let startIndex = 0;
  let bestScore = Infinity;

  sorted.forEach((point, index) => {
    const score = point.x + point.y;

    if (score < bestScore) {
      bestScore = score;
      startIndex = index;
    }
  });

  const rotated = [
    ...sorted.slice(startIndex),
    ...sorted.slice(0, startIndex)
  ];

  // Ensure clockwise ordering.
  const cross =
    (rotated[1].x - rotated[0].x) *
      (rotated[2].y - rotated[1].y) -
    (rotated[1].y - rotated[0].y) *
      (rotated[2].x - rotated[1].x);

  if (cross < 0) {
    return [
      rotated[0],
      rotated[3],
      rotated[2],
      rotated[1]
    ];
  }

  return rotated;
}

function isValidRectangle(points) {
  if (!points || points.length !== 4) return false;

  const area = Math.abs(
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % 4];
      return sum + p.x * next.y - next.x * p.y;
    }, 0) / 2
  );

  if (area < 100) return false;

  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const c = points[(i + 2) % 4];

    const cross =
      (b.x - a.x) * (c.y - b.y) -
      (b.y - a.y) * (c.x - b.x);

    if (Math.abs(cross) < 1) return false;
  }

  return true;
}

// ---------- MANUAL CORNER SELECTION ----------
function enableManualMode() {
  if (!running) {
    setStatus("กรุณาเปิดกล้องก่อน");
    setInstructions("กดเปิดกล้องก่อนเลือกมุม");
    return;
  }

  manualMode = true;
  selectedPoints = [];
  lastRectangle = null;

  resetXY();

  overlayCanvas.style.pointerEvents = "auto";
  overlayCanvas.style.touchAction = "none";

  setStatus("โหมดเลือก 4 มุมเอง");
  setInstructions(
    "แตะมุมซ้ายบน → ขวาบน → ขวาล่าง → ซ้ายล่าง บนภาพกล้อง"
  );

  drawOverlay();
}

function enableAutoMode() {
  manualMode = false;
  selectedPoints = [];
  lastRectangle = null;
  lostFrames = 0;

  overlayCanvas.style.pointerEvents = "none";
  overlayCanvas.style.touchAction = "manipulation";

  resetXY();

  setStatus("กลับไปตรวจจับอัตโนมัติ");
  setInstructions(
    "กำลังค้นหากรอบสี่เหลี่ยม หากไม่พบให้เลือก 4 มุมเอง"
  );

  drawOverlay();
}

function resetManualPoints() {
  if (!manualMode) {
    setStatus("กด “เลือก 4 มุมเอง” ก่อน");
    return;
  }

  selectedPoints = [];
  lastRectangle = null;
  resetXY();

  setStatus("ล้างมุมแล้ว — เริ่มแตะใหม่");
  setInstructions(
    "แตะมุมซ้ายบน → ขวาบน → ขวาล่าง → ซ้ายล่าง"
  );

  drawOverlay();
}

function screenToProcessingPoint(clientX, clientY) {
  const rect = camera.getBoundingClientRect();

  if (
    !rect.width ||
    !rect.height ||
    !camera.videoWidth ||
    !camera.videoHeight ||
    !processingCanvas.width ||
    !processingCanvas.height
  ) {
    return null;
  }

  // Map a tap to the visible video, accounting for object-fit: cover.
  const videoRatio = camera.videoWidth / camera.videoHeight;
  const boxRatio = rect.width / rect.height;

  let renderedWidth;
  let renderedHeight;
  let offsetX = 0;
  let offsetY = 0;

  const fit = getComputedStyle(camera).objectFit;

  if (fit === "contain") {
    if (videoRatio > boxRatio) {
      renderedWidth = rect.width;
      renderedHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderedHeight) / 2;
    } else {
      renderedHeight = rect.height;
      renderedWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderedWidth) / 2;
    }
  } else {
    // Default to cover.
    if (videoRatio > boxRatio) {
      renderedHeight = rect.height;
      renderedWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderedWidth) / 2;
    } else {
      renderedWidth = rect.width;
      renderedHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderedHeight) / 2;
    }
  }

  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;

  const videoX = localX * camera.videoWidth / renderedWidth;
  const videoY = localY * camera.videoHeight / renderedHeight;

  if (
    videoX < 0 ||
    videoY < 0 ||
    videoX > camera.videoWidth ||
    videoY > camera.videoHeight
  ) {
    return null;
  }

  return {
    x: videoX * processingCanvas.width / camera.videoWidth,
    y: videoY * processingCanvas.height / camera.videoHeight
  };
}

function handleManualTap(event) {
  if (!running || !manualMode) return;

  event.preventDefault();

  if (selectedPoints.length >= 4) return;

  const point = screenToProcessingPoint(
    event.clientX,
    event.clientY
  );

  if (!point) {
    setStatus("แตะภายในพื้นที่ภาพกล้อง");
    return;
  }

  selectedPoints.push(point);

  const names = [
    "ซ้ายบน",
    "ขวาบน",
    "ขวาล่าง",
    "ซ้ายล่าง"
  ];

  drawOverlay();

  if (selectedPoints.length < 4) {
    const nextName = names[selectedPoints.length];

    setStatus(
      `เลือกแล้ว ${selectedPoints.length}/4 มุม`
    );

    setInstructions(
      `เลือกมุม${nextName} เป็นจุดที่ ${selectedPoints.length + 1}`
    );
    return;
  }

  if (!isValidRectangle(selectedPoints)) {
    setStatus("มุมที่เลือกไม่เป็นกรอบสี่เหลี่ยม");
    setInstructions(
      "กด “ล้างมุมที่เลือก” แล้วแตะ 4 มุมใหม่ตามลำดับ"
    );
    selectedPoints = [];
    resetXY();
    drawOverlay();
    return;
  }

  lastRectangle = [...selectedPoints];

  calculateXY(lastRectangle);

  setStatus("เลือกครบ 4 มุมแล้ว");
  setInstructions(
    "สำเร็จ! หากต้องการเลือกใหม่ กด “ล้างมุมที่เลือก”"
  );

  drawOverlay();
}

// Listen for touch/pointer input on the overlay.
overlayCanvas.addEventListener(
  "pointerdown",
  handleManualTap,
  { passive: false }
);

// ---------- X/Y CALCULATION ----------
function calculateXY(points) {
  if (!points || points.length !== 4) {
    resetXY();
    return;
  }

  let src;
  let dst;
  let transform;
  let result;

  try {
    const [tl, tr, br, bl] = points;

    src = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y,
      tr.x, tr.y,
      br.x, br.y,
      bl.x, bl.y
    ]);

    const w = processingCanvas.width;
    const h = processingCanvas.height;

    dst = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      w - 1, 0,
      w - 1, h - 1,
      0, h - 1
    ]);

    transform = cv.getPerspectiveTransform(src, dst);

    // Map the camera image center into the selected rectangle's
    // normalized coordinate system.
    const center = cv.matFromArray(1, 1, cv.CV_32FC2, [
      w / 2, h / 2
    ]);

    result = new cv.Mat();

    try {
      cv.perspectiveTransform(center, result, transform);

      const x = result.data32F[0] / (w - 1);
      const y = result.data32F[1] / (h - 1);

      setXY(
        Math.max(0, Math.min(1, x)),
        Math.max(0, Math.min(1, y))
      );
    } finally {
      center.delete();
    }
  } catch (error) {
    console.error("Coordinate calculation error:", error);
    resetXY();
  } finally {
    src?.delete();
    dst?.delete();
    transform?.delete();
    result?.delete();
  }
}

// ---------- DRAW OVERLAY ----------
function cameraToScreen(point) {
  const rect = camera.getBoundingClientRect();

  if (
    !rect.width ||
    !rect.height ||
    !camera.videoWidth ||
    !camera.videoHeight
  ) {
    return { x: 0, y: 0 };
  }

  const videoRatio = camera.videoWidth / camera.videoHeight;
  const boxRatio = rect.width / rect.height;

  let renderedWidth;
  let renderedHeight;
  let offsetX = 0;
  let offsetY = 0;

  const fit = getComputedStyle(camera).objectFit;

  if (fit === "contain") {
    if (videoRatio > boxRatio) {
      renderedWidth = rect.width;
      renderedHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderedHeight) / 2;
    } else {
      renderedHeight = rect.height;
      renderedWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderedWidth) / 2;
    }
  } else {
    if (videoRatio > boxRatio) {
      renderedHeight = rect.height;
      renderedWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderedWidth) / 2;
    } else {
      renderedWidth = rect.width;
      renderedHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderedHeight) / 2;
    }
  }

  return {
    x:
      rect.left +
      offsetX +
      (point.x / processingCanvas.width) * renderedWidth,
    y:
      rect.top +
      offsetY +
      (point.y / processingCanvas.height) * renderedHeight
  };
}

function drawOverlay() {
  if (!overlayContext) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  overlayContext.clearRect(0, 0, width, height);

  let points = null;
  let color = "#22ff77";

  if (manualMode && selectedPoints.length > 0) {
    points = selectedPoints;
    color = "#00e5ff";
  } else if (!manualMode && lastRectangle) {
    points = lastRectangle;
    color = "#22ff77";
  }

  if (!points || points.length === 0) return;

  const screenPoints = points.map(cameraToScreen);

  // Draw connected edges.
  overlayContext.beginPath();
  overlayContext.moveTo(
    screenPoints[0].x,
    screenPoints[0].y
  );

  for (let i = 1; i < screenPoints.length; i++) {
    overlayContext.lineTo(
      screenPoints[i].x,
      screenPoints[i].y
    );
  }

  if (screenPoints.length === 4) {
    overlayContext.closePath();
  }

  overlayContext.strokeStyle = color;
  overlayContext.lineWidth = 3;
  overlayContext.stroke();

  const labels = ["TL", "TR", "BR", "BL"];

  screenPoints.forEach((point, index) => {
    overlayContext.beginPath();
    overlayContext.arc(point.x, point.y, 7, 0, Math.PI * 2);

    overlayContext.fillStyle = color;
    overlayContext.fill();

    overlayContext.lineWidth = 2;
    overlayContext.strokeStyle = "#ffffff";
    overlayContext.stroke();

    overlayContext.font = "bold 14px Arial";
    overlayContext.fillStyle = "#ffffff";
    overlayContext.shadowColor = "#000000";
    overlayContext.shadowBlur = 4;

    overlayContext.fillText(
      labels[index],
      point.x + 10,
      point.y - 10
    );

    overlayContext.shadowBlur = 0;
  });
}

// ---------- STARTUP ----------
createControls();

if (startButton) {
  startButton.textContent = "เปิดกล้อง";
  startButton.onclick = startCamera;
}

setStatus("พร้อม — กดเปิดกล้อง");
setInstructions(
  "ปุ่มเลือกมุมอยู่ด้านบนของหน้าจอ"
);

// Resize overlay after initial layout.
requestAnimationFrame(resizeOverlayCanvas);
