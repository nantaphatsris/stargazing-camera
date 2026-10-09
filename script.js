
"use strict";

// ======================================================
// STARGAZING
// Camera + OpenCV + Auto Rectangle + Manual 4 Corners
// Perspective Transform + Live X/Y
//
// NO WebSocket
// NO HTTP
// NO OSC
// NO TouchDesigner
// ======================================================


// 1. HTML ELEMENTS
// ======================================================

const camera = document.getElementById("camera");
const startButton = document.getElementById("startButton");
const xText = document.getElementById("x");
const yText = document.getElementById("y");
const canvas = document.getElementById("processingCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const statusText = document.getElementById("status");

if (
    !camera ||
    !startButton ||
    !xText ||
    !yText ||
    !canvas ||
    !overlayCanvas ||
    !statusText
) {
    throw new Error(
        "ไม่พบ HTML element กรุณาตรวจสอบ IDs ในไฟล์ HTML"
    );
}

const overlayContext = overlayCanvas.getContext("2d");
const processingContext = canvas.getContext("2d", {
    willReadFrequently: true
});


// 2. SETTINGS
// ======================================================

const PROCESS_WIDTH = 640;
const DETECTION_INTERVAL = 120;

// พื้นที่ขั้นต่ำของกรอบ เทียบกับพื้นที่ภาพทั้งหมด
const MIN_AREA_RATIO = 0.025;
const MAX_AREA_RATIO = 0.92;

const MIN_BOX_WIDTH = 80;
const MIN_BOX_HEIGHT = 60;

// ยอมรับสี่เหลี่ยมแนวตั้งและแนวนอน
const MIN_ASPECT_RATIO = 0.45;
const MAX_ASPECT_RATIO = 2.8;

// ลดการสั่นของกรอบอัตโนมัติ
const SMOOTHING = 0.30;

// จำนวนเฟรมที่ยอมให้ไม่พบกรอบ
const MAX_LOST_FRAMES = 5;


// 3. STATE
// ======================================================

let cameraStream = null;
let cameraStarted = false;
let openCVReady = false;
let detectionRunning = false;
let detectionTimer = null;
let lastDetectionTime = 0;

let detectionMode = "auto";
// auto = ตรวจจับอัตโนมัติ
// manual = เลือกมุมเอง
// locked = ใช้กรอบที่เลือกแล้ว

let selectedPoints = [];
let lastRectangle = null;
let lostFrames = 0;
let currentXY = null;


// 4. CREATE CONTROL BUTTONS
// ======================================================

function createButton(id, text) {
    let button = document.getElementById(id);

    if (!button) {
        button = document.createElement("button");
        button.id = id;
        button.textContent = text;

        button.style.cssText = `
            padding: 10px 14px;
            margin: 4px;
            border: 0;
            border-radius: 8px;
            background: #202020;
            color: white;
            font-size: 14px;
            cursor: pointer;
            position: relative;
            z-index: 10001;
        `;

        const parent = startButton.parentElement || document.body;
        parent.appendChild(button);
    }

    return button;
}

const manualButton = createButton(
    "manualButton",
    "เลือก 4 มุมเอง"
);

const autoButton = createButton(
    "autoButton",
    "กลับไปตรวจจับอัตโนมัติ"
);

const resetButton = createButton(
    "resetButton",
    "ล้างมุมที่เลือก"
);

manualButton.addEventListener("click", enableManualMode);
autoButton.addEventListener("click", enableAutoMode);
resetButton.addEventListener("click", resetSelection);


// 5. OVERLAY SETUP
// ======================================================

overlayCanvas.style.position = "fixed";
overlayCanvas.style.left = "0";
overlayCanvas.style.top = "0";
overlayCanvas.style.width = "100vw";
overlayCanvas.style.height = "100vh";
overlayCanvas.style.zIndex = "1000";
overlayCanvas.style.pointerEvents = "none";
overlayCanvas.style.touchAction = "none";

function resizeOverlay() {
    const dpr = window.devicePixelRatio || 1;

    overlayCanvas.width = Math.round(
        window.innerWidth * dpr
    );

    overlayCanvas.height = Math.round(
        window.innerHeight * dpr
    );

    overlayContext.setTransform(
        dpr, 0, 0, dpr, 0, 0
    );

    drawOverlay();
}

window.addEventListener("resize", resizeOverlay);
resizeOverlay();


// 6. WAIT FOR OPENCV
// ======================================================

function waitForOpenCV() {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        function check() {
            if (
                typeof cv !== "undefined" &&
                cv.Mat &&
                cv.findContours &&
                cv.getPerspectiveTransform &&
                cv.perspectiveTransform
            ) {
                openCVReady = true;
                resolve();
                return;
            }

            if (Date.now() - startedAt > 30000) {
                reject(
                    new Error("OpenCV โหลดไม่สำเร็จ")
                );
                return;
            }

            setTimeout(check, 200);
        }

        check();
    });
}


// 7. START CAMERA
// ======================================================

startButton.addEventListener("click", startCamera);

async function startCamera() {
    if (cameraStarted) return;

    startButton.disabled = true;
    statusText.textContent = "กำลังเปิดกล้อง...";

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "ต้องเปิดเว็บผ่าน HTTPS หรือ localhost"
            );
        }

        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: "environment"
                    },
                    width: {
                        ideal: 1280
                    },
                    height: {
                        ideal: 720
                    }
                },
                audio: false
            });

        camera.srcObject = cameraStream;

        await new Promise((resolve, reject) => {
            if (
                camera.readyState >=
                HTMLMediaElement.HAVE_METADATA
            ) {
                resolve();
                return;
            }

            camera.onloadedmetadata = resolve;

            camera.onerror = () => {
                reject(new Error("อ่านภาพจากกล้องไม่ได้"));
            };
        });

        await camera.play();

        cameraStarted = true;

        startButton.style.display = "none";

        statusText.textContent = "กำลังโหลด OpenCV...";

        await waitForOpenCV();

        statusText.textContent =
            "พร้อมแล้ว กำลังตรวจจับรูปสี่เหลี่ยม";

        startDetection();

    } catch (error) {
        console.error(error);

        statusText.textContent =
            "เปิดกล้องไม่สำเร็จ: " + error.message;

        startButton.disabled = false;
    }
}


// 8. ORDER CORNERS
// ======================================================
// TL -> TR -> BR -> BL

function orderPoints(points) {
    const sums = points.map(p => p.x + p.y);
    const diffs = points.map(p => p.x - p.y);

    return [
        points[sums.indexOf(Math.min(...sums))],
        points[diffs.indexOf(Math.max(...diffs))],
        points[sums.indexOf(Math.max(...sums))],
        points[diffs.indexOf(Math.min(...diffs))]
    ];
}


// 9. AUTO DETECTION
// ======================================================

function findRectangleCandidates(src) {
    const gray = new cv.Mat();
    const enhanced = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const threshold = new cv.Mat();
    const combined = new cv.Mat();
    const closed = new cv.Mat();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);

    const candidates = [];

    const width = src.cols;
    const height = src.rows;
    const imageArea = width * height;

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const clahe = new cv.CLAHE(
            3.0,
            new cv.Size(8, 8)
        );

        try {
            clahe.apply(gray, enhanced);
        } finally {
            clahe.delete();
        }

        cv.GaussianBlur(
            enhanced,
            blurred,
            new cv.Size(5, 5),
            0
        );

        // Edge detection
        cv.Canny(blurred, edges, 25, 100);

        // Adaptive threshold for uneven lighting
        cv.adaptiveThreshold(
            blurred,
            threshold,
            255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY,
            31,
            5
        );

        cv.bitwise_or(
            edges,
            threshold,
            combined
        );

        cv.morphologyEx(
            combined,
            closed,
            cv.MORPH_CLOSE,
            kernel
        );

        cv.findContours(
            closed,
            contours,
            hierarchy,
            cv.RETR_LIST,
            cv.CHAIN_APPROX_SIMPLE
        );

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            let approx = null;

            try {
                const area = cv.contourArea(contour);
                const areaRatio = area / imageArea;

                if (
                    areaRatio < MIN_AREA_RATIO ||
                    areaRatio > MAX_AREA_RATIO
                ) {
                    continue;
                }

                const perimeter = cv.arcLength(
                    contour,
                    true
                );

                approx = new cv.Mat();

                cv.approxPolyDP(
                    contour,
                    approx,
                    0.025 * perimeter,
                    true
                );

                if (approx.rows !== 4) continue;
                if (!cv.isContourConvex(approx)) continue;

                const rawPoints = [];

                for (let j = 0; j < 4; j++) {
                    const p = approx.intPtr(j, 0);

                    rawPoints.push({
                        x: p[0],
                        y: p[1]
                    });
                }

                const points = orderPoints(rawPoints);

                const minX = Math.min(...points.map(p => p.x));
                const maxX = Math.max(...points.map(p => p.x));
                const minY = Math.min(...points.map(p => p.y));
                const maxY = Math.max(...points.map(p => p.y));

                const boxWidth = maxX - minX;
                const boxHeight = maxY - minY;

                if (
                    boxWidth < MIN_BOX_WIDTH ||
                    boxHeight < MIN_BOX_HEIGHT
                ) {
                    continue;
                }

                const ratio = boxWidth / boxHeight;

                if (
                    ratio < MIN_ASPECT_RATIO ||
                    ratio > MAX_ASPECT_RATIO
                ) {
                    continue;
                }

                const rectangularity =
                    area / (boxWidth * boxHeight);

                if (rectangularity < 0.35) continue;

                const ratioScore = Math.exp(
                    -Math.abs(Math.log(ratio / (16 / 9)))
                );

                const score =
                    ratioScore * 0.55 +
                    rectangularity * 0.30 +
                    Math.sqrt(areaRatio) * 0.15;

                candidates.push({
                    score,
                    area,
                    points
                });

            } finally {
                if (approx) approx.delete();
                contour.delete();
            }
        }

        candidates.sort((a, b) => b.score - a.score);

        return candidates;

    } finally {
        gray.delete();
        enhanced.delete();
        blurred.delete();
        edges.delete();
        threshold.delete();
        combined.delete();
        closed.delete();
        contours.delete();
        hierarchy.delete();
        kernel.delete();
    }
}


// 10. SCREEN <-> CAMERA COORDINATES
// ======================================================

// รองรับภาพกล้องที่แสดงแบบ object-fit: cover
function cameraToScreen(x, y, imageWidth, imageHeight) {
    const rect = camera.getBoundingClientRect();

    const scale = Math.max(
        rect.width / imageWidth,
        rect.height / imageHeight
    );

    const offsetX =
        (rect.width - imageWidth * scale) / 2;

    const offsetY =
        (rect.height - imageHeight * scale) / 2;

    return {
        x: rect.left + offsetX + x * scale,
        y: rect.top + offsetY + y * scale
    };
}

function screenToCamera(x, y) {
    const rect = camera.getBoundingClientRect();

    const imageWidth = camera.videoWidth;
    const imageHeight = camera.videoHeight;

    if (
        !imageWidth ||
        !imageHeight ||
        !rect.width ||
        !rect.height
    ) {
        return null;
    }

    const scale = Math.max(
        rect.width / imageWidth,
        rect.height / imageHeight
    );

    const offsetX =
        (rect.width - imageWidth * scale) / 2;

    const offsetY =
        (rect.height - imageHeight * scale) / 2;

    return {
        x: (x - rect.left - offsetX) / scale,
        y: (y - rect.top - offsetY) / scale
    };
}


// 11. MANUAL CORNER SELECTION
// ======================================================

function enableManualMode() {
    if (!cameraStarted) {
        statusText.textContent = "กรุณาเปิดกล้องก่อน";
        return;
    }

    detectionMode = "manual";
    selectedPoints = [];
    lastRectangle = null;
    currentXY = null;

    xText.textContent = "--";
    yText.textContent = "--";

    overlayCanvas.style.pointerEvents = "auto";
    overlayCanvas.style.cursor = "crosshair";

    statusText.textContent =
        "แตะมุมที่ 1: TL (ซ้ายบน)";

    drawOverlay();
}

function enableAutoMode() {
    detectionMode = "auto";
    selectedPoints = [];
    currentXY = null;
    lostFrames = 0;

    overlayCanvas.style.pointerEvents = "none";
    overlayCanvas.style.cursor = "default";

    xText.textContent = "--";
    yText.textContent = "--";

    statusText.textContent =
        "กำลังตรวจจับรูปสี่เหลี่ยมอัตโนมัติ";

    drawOverlay();
}

function resetSelection() {
    selectedPoints = [];
    lastRectangle = null;
    currentXY = null;
    lostFrames = 0;

    if (detectionMode === "locked") {
        detectionMode = "manual";
    }

    overlayCanvas.style.pointerEvents =
        detectionMode === "manual" ? "auto" : "none";

    xText.textContent = "--";
    yText.textContent = "--";

    statusText.textContent =
        detectionMode === "manual"
            ? "แตะมุมที่ 1: TL (ซ้ายบน)"
            : "ล้างกรอบแล้ว";

    drawOverlay();
}

overlayCanvas.addEventListener(
    "pointerdown",
    function (event) {
        if (detectionMode !== "manual") return;

        const point = screenToCamera(
            event.clientX,
            event.clientY
        );

        if (!point) return;

        // Reject taps outside the actual camera image
        if (
            point.x < 0 ||
            point.y < 0 ||
            point.x > camera.videoWidth ||
            point.y > camera.videoHeight
        ) {
            statusText.textContent =
                "แตะภายในภาพกล้องเท่านั้น";
            return;
        }

        // Scale full-resolution camera coordinates
        // to the 640-pixel processing image
        const scale =
            canvas.width / camera.videoWidth;

        selectedPoints.push({
            x: point.x * scale,
            y: point.y * scale
        });

        const labels = [
            "TL (ซ้ายบน)",
            "TR (ขวาบน)",
            "BR (ขวาล่าง)",
            "BL (ซ้ายล่าง)"
        ];

        if (selectedPoints.length < 4) {
            statusText.textContent =
                "เลือกมุมที่ " +
                (selectedPoints.length + 1) +
                ": " +
                labels[selectedPoints.length];

            drawOverlay();
            return;
        }

        // All four corners selected
        const ordered = selectedPoints.map(p => ({
            x: p.x,
            y: p.y
        }));

        if (!isValidRectangle(ordered)) {
            selectedPoints = [];

            statusText.textContent =
                "มุมไม่ถูกต้อง ลองแตะใหม่ตาม TL → TR → BR → BL";

            drawOverlay();
            return;
        }

        lastRectangle = ordered;
        detectionMode = "locked";

        overlayCanvas.style.pointerEvents = "none";
        overlayCanvas.style.cursor = "default";

        statusText.textContent =
            "เลือกกรอบสำเร็จ กำลังคำนวณ X/Y";

        calculateAndDisplayXY();
        drawOverlay();
    }
);


// 12. VALIDATE MANUAL POINTS
// ======================================================

function isValidRectangle(points) {
    if (points.length !== 4) return false;

    const [tl, tr, br, bl] = points;

    // Require a non-degenerate quadrilateral
    const cross = (a, b, c) =>
        (b.x - a.x) * (c.y - b.y) -
        (b.y - a.y) * (c.x - b.x);

    const crosses = [
        cross(tl, tr, br),
        cross(tr, br, bl),
        cross(br, bl, tl),
        cross(bl, tl, tr)
    ];

    if (
        crosses.some(v => Math.abs(v) < 100)
    ) {
        return false;
    }

    const area = Math.abs(
        tl.x * tr.y +
        tr.x * br.y +
        br.x * bl.y +
        bl.x * tl.y -
        tr.x * tl.y -
        br.x * tr.y -
        bl.x * br.y -
        tl.x * bl.y
    ) / 2;

    return area > 1000;
}


// 13. CALCULATE PERSPECTIVE X/Y
// ======================================================

function calculateXY(points, width, height) {
    let source = null;
    let destination = null;
    let transform = null;
    let center = null;
    let result = null;

    try {
        source = cv.matFromArray(
            4, 1, cv.CV_32FC2,
            [
                points[0].x, points[0].y,
                points[1].x, points[1].y,
                points[2].x, points[2].y,
                points[3].x, points[3].y
            ]
        );

        destination = cv.matFromArray(
            4, 1, cv.CV_32FC2,
            [
                0, 0,
                1, 0,
                1, 1,
                0, 1
            ]
        );

        transform = cv.getPerspectiveTransform(
            source,
            destination
        );

        center = cv.matFromArray(
            1, 1, cv.CV_32FC2,
            [width / 2, height / 2]
        );

        result = new cv.Mat();

        cv.perspectiveTransform(
            center,
            result,
            transform
        );

        const rawX = result.data32F[0];
        const rawY = result.data32F[1];

        if (
            !Number.isFinite(rawX) ||
            !Number.isFinite(rawY)
        ) {
            throw new Error("พิกัดไม่ถูกต้อง");
        }

        return {
            x: Math.max(0, Math.min(1, rawX)),
            y: Math.max(0, Math.min(1, rawY))
        };

    } finally {
        if (source) source.delete();
        if (destination) destination.delete();
        if (transform) transform.delete();
        if (center) center.delete();
        if (result) result.delete();
    }
}

function calculateAndDisplayXY() {
    if (!lastRectangle) return;

    try {
        const xy = calculateXY(
            lastRectangle,
            canvas.width,
            canvas.height
        );

        currentXY = xy;

        xText.textContent = xy.x.toFixed(3);
        yText.textContent = xy.y.toFixed(3);

        statusText.textContent =
            "เลือกกรอบแล้ว | X: " +
            xy.x.toFixed(3) +
            " Y: " +
            xy.y.toFixed(3);

    } catch (error) {
        console.error("Perspective error:", error);

        statusText.textContent =
            "คำนวณพิกัดไม่ได้ กรุณาเลือกมุมใหม่";
    }
}


// 14. DRAW OVERLAY
// ======================================================

function drawOverlay() {
    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );

    let points = null;

    if (detectionMode === "manual") {
        points = selectedPoints;
    } else if (
        detectionMode === "locked" &&
        lastRectangle
    ) {
        points = lastRectangle;
    } else if (lastRectangle) {
        points = lastRectangle;
    }

    if (!points || points.length === 0) return;

    const screenPoints = points.map(p =>
        cameraToScreen(
            p.x,
            p.y,
            canvas.width,
            canvas.height
        )
    );

    overlayContext.lineWidth = 3;
    overlayContext.strokeStyle = "#00FF66";
    overlayContext.fillStyle = "#00FF66";

    if (screenPoints.length >= 2) {
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

        overlayContext.stroke();
    }

    const labels = ["TL", "TR", "BR", "BL"];

    screenPoints.forEach((p, i) => {
        overlayContext.beginPath();
        overlayContext.arc(
            p.x,
            p.y,
            7,
            0,
            Math.PI * 2
        );

        overlayContext.fill();

        overlayContext.font = "bold 14px Arial";
        overlayContext.fillText(
            labels[i],
            p.x + 10,
            p.y - 10
        );
    });

    if (detectionMode === "manual") {
        overlayContext.fillStyle = "white";
        overlayContext.font = "bold 14px Arial";

        overlayContext.fillText(
            `เลือกแล้ว ${selectedPoints.length}/4 มุม`,
            16,
            32
        );
    }
}


// 15. MAIN DETECTION LOOP
// ======================================================

function startDetection() {
    if (detectionRunning) return;

    detectionRunning = true;
    detectLoop();
}

function detectLoop() {
    if (!detectionRunning || !cameraStarted) return;

    detectionTimer = setTimeout(() => {
        requestAnimationFrame(detectLoop);
    }, DETECTION_INTERVAL);

    if (
        !openCVReady ||
        camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !camera.videoWidth ||
        !camera.videoHeight
    ) {
        return;
    }

    // Manual and locked modes do not replace the selected corners
    if (
        detectionMode === "manual" ||
        detectionMode === "locked"
    ) {
        drawOverlay();
        return;
    }

    const now = performance.now();

    if (
        now - lastDetectionTime < DETECTION_INTERVAL
    ) {
        return;
    }

    lastDetectionTime = now;

    const width = PROCESS_WIDTH;

    const height = Math.round(
        camera.videoHeight *
        (width / camera.videoWidth)
    );

    canvas.width = width;
    canvas.height = height;

    processingContext.drawImage(
        camera,
        0,
        0,
        width,
        height
    );

    let src = null;

    try {
        src = cv.imread(canvas);

        const candidates = findRectangleCandidates(src);

        if (candidates.length === 0) {
            lostFrames++;

            if (lostFrames > MAX_LOST_FRAMES) {
                lastRectangle = null;
            }

            statusText.textContent =
                "ไม่พบสี่เหลี่ยม — กดเลือก 4 มุมเองได้";

            xText.textContent = "--";
            yText.textContent = "--";

            drawOverlay();
            return;
        }

        lostFrames = 0;

        lastRectangle = candidates[0].points;

        calculateAndDisplayXY();

        statusText.textContent =
            "ตรวจพบสี่เหลี่ยมอัตโนมัติ";

        drawOverlay();

    } catch (error) {
        console.error("Detection error:", error);

        statusText.textContent =
            "ตรวจจับผิดพลาด สามารถเลือก 4 มุมเองได้";

    } finally {
        if (src) src.delete();
    }
}


// 16. STOP CAMERA
// ======================================================

function stopCamera() {
    detectionRunning = false;

    if (detectionTimer !== null) {
        clearTimeout(detectionTimer);
        detectionTimer = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(
            track => track.stop()
        );

        cameraStream = null;
    }

    camera.srcObject = null;
    cameraStarted = false;
    detectionMode = "auto";

    selectedPoints = [];
    lastRectangle = null;
    currentXY = null;

    overlayCanvas.style.pointerEvents = "none";

    clearOverlay();

    xText.textContent = "--";
    yText.textContent = "--";

    startButton.style.display = "";
    startButton.disabled = false;

    statusText.textContent = "ปิดกล้องแล้ว";
}

function clearOverlay() {
    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );
}

window.stopStargazingCamera = stopCamera;
