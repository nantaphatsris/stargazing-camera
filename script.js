
"use strict";

// ================================================
// STARGAZING - NEW DETECTION SYSTEM
// Camera + OpenCV + TV Detection + Perspective X/Y
// No WebSocket / HTTP / OSC / TouchDesigner
// ================================================


// 1. HTML ELEMENTS
// ================================================

const camera = document.getElementById("camera");
const startButton = document.getElementById("startButton");
const xText = document.getElementById("x");
const yText = document.getElementById("y");
const canvas = document.getElementById("processingCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const statusText = document.getElementById("status");

const overlayContext = overlayCanvas.getContext("2d");
const processingContext = canvas.getContext("2d", {
    willReadFrequently: true
});


// 2. CONFIGURATION
// ================================================

const PROCESS_WIDTH = 640;

// ขนาดพื้นที่ที่อนุญาตให้ตรวจจับ
const MIN_AREA_RATIO = 0.04;
const MAX_AREA_RATIO = 0.90;

// จอ TV ส่วนใหญ่อยู่ในแนวนอน
const MIN_ASPECT_RATIO = 1.15;
const MAX_ASPECT_RATIO = 2.80;

// ลดการตรวจจับสี่เหลี่ยมขนาดเล็ก
const MIN_BOX_WIDTH = 100;
const MIN_BOX_HEIGHT = 65;

// ความถี่การตรวจจับ
const DETECTION_INTERVAL = 60;

// ความนุ่มนวลของกรอบ
const SMOOTHING = 0.30;

// จำนวนเฟรมที่ยอมให้ไม่พบจอก่อนล้างกรอบ
const MAX_LOST_FRAMES = 5;


// 3. STATE
// ================================================

let cameraStream = null;
let cameraStarted = false;
let detectionRunning = false;
let detectionTimer = null;
let openCVReady = false;

let lastTVPoints = null;
let lostFrames = 0;
let lastDetectionTime = 0;


// 4. VALIDATE HTML
// ================================================

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
        "ไม่พบ HTML element ที่จำเป็น กรุณาตรวจสอบ IDs ในไฟล์ HTML"
    );
}


// 5. RESIZE OVERLAY
// ================================================

function resizeOverlay() {
    const dpr = window.devicePixelRatio || 1;

    overlayCanvas.width = Math.round(window.innerWidth * dpr);
    overlayCanvas.height = Math.round(window.innerHeight * dpr);

    overlayCanvas.style.width = window.innerWidth + "px";
    overlayCanvas.style.height = window.innerHeight + "px";

    overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawCurrentOverlay();
}

window.addEventListener("resize", resizeOverlay);
resizeOverlay();


// 6. WAIT FOR OPENCV
// ================================================

function waitForOpenCV() {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeout = 30000;

        function check() {
            if (
                typeof cv !== "undefined" &&
                cv.Mat &&
                cv.findContours &&
                cv.getPerspectiveTransform
            ) {
                openCVReady = true;
                resolve();
                return;
            }

            if (Date.now() - startTime > timeout) {
                reject(
                    new Error(
                        "โหลด OpenCV ไม่สำเร็จภายใน 30 วินาที"
                    )
                );
                return;
            }

            setTimeout(check, 200);
        }

        check();
    });
}


// 7. START CAMERA
// ================================================

startButton.addEventListener("click", startCamera);

async function startCamera() {
    if (cameraStarted) return;

    startButton.disabled = true;
    statusText.textContent = "กำลังเปิดกล้อง...";

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "เบราว์เซอร์นี้ไม่รองรับกล้อง หรือเว็บไม่ได้ใช้ HTTPS"
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
                reject(new Error("ไม่สามารถอ่านภาพจากกล้องได้"));
            };
        });

        await camera.play();

        cameraStarted = true;
        startButton.style.display = "none";

        statusText.textContent = "กำลังโหลด OpenCV...";

        await waitForOpenCV();

        statusText.textContent = "OpenCV พร้อมแล้ว กำลังค้นหาจอ TV...";

        startDetection();

    } catch (error) {
        console.error("Camera startup error:", error);

        statusText.textContent =
            "เปิดกล้องไม่สำเร็จ: " + error.message;

        startButton.disabled = false;
    }
}


// 8. ORDER THE FOUR CORNERS
// ================================================
// Output: TL -> TR -> BR -> BL

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


// 9. DETECT TV CANDIDATES
// ================================================


"use strict";

// ================================================
// STARGAZING - NEW DETECTION SYSTEM
// Camera + OpenCV + TV Detection + Perspective X/Y
// No WebSocket / HTTP / OSC / TouchDesigner
// ================================================


// 1. HTML ELEMENTS
// ================================================

const camera = document.getElementById("camera");
const startButton = document.getElementById("startButton");
const xText = document.getElementById("x");
const yText = document.getElementById("y");
const canvas = document.getElementById("processingCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const statusText = document.getElementById("status");

const overlayContext = overlayCanvas.getContext("2d");
const processingContext = canvas.getContext("2d", {
    willReadFrequently: true
});


// 2. CONFIGURATION
// ================================================

const PROCESS_WIDTH = 640;

// ขนาดพื้นที่ที่อนุญาตให้ตรวจจับ
const MIN_AREA_RATIO = 0.04;
const MAX_AREA_RATIO = 0.90;

// จอ TV ส่วนใหญ่อยู่ในแนวนอน
const MIN_ASPECT_RATIO = 1.15;
const MAX_ASPECT_RATIO = 2.80;

// ลดการตรวจจับสี่เหลี่ยมขนาดเล็ก
const MIN_BOX_WIDTH = 100;
const MIN_BOX_HEIGHT = 65;

// ความถี่การตรวจจับ
const DETECTION_INTERVAL = 60;

// ความนุ่มนวลของกรอบ
const SMOOTHING = 0.30;

// จำนวนเฟรมที่ยอมให้ไม่พบจอก่อนล้างกรอบ
const MAX_LOST_FRAMES = 5;


// 3. STATE
// ================================================

let cameraStream = null;
let cameraStarted = false;
let detectionRunning = false;
let detectionTimer = null;
let openCVReady = false;

let lastTVPoints = null;
let lostFrames = 0;
let lastDetectionTime = 0;


// 4. VALIDATE HTML
// ================================================

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
        "ไม่พบ HTML element ที่จำเป็น กรุณาตรวจสอบ IDs ในไฟล์ HTML"
    );
}


// 5. RESIZE OVERLAY
// ================================================

function resizeOverlay() {
    const dpr = window.devicePixelRatio || 1;

    overlayCanvas.width = Math.round(window.innerWidth * dpr);
    overlayCanvas.height = Math.round(window.innerHeight * dpr);

    overlayCanvas.style.width = window.innerWidth + "px";
    overlayCanvas.style.height = window.innerHeight + "px";

    overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawCurrentOverlay();
}

window.addEventListener("resize", resizeOverlay);
resizeOverlay();


// 6. WAIT FOR OPENCV
// ================================================

function waitForOpenCV() {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const timeout = 30000;

        function check() {
            if (
                typeof cv !== "undefined" &&
                cv.Mat &&
                cv.findContours &&
                cv.getPerspectiveTransform
            ) {
                openCVReady = true;
                resolve();
                return;
            }

            if (Date.now() - startTime > timeout) {
                reject(
                    new Error(
                        "โหลด OpenCV ไม่สำเร็จภายใน 30 วินาที"
                    )
                );
                return;
            }

            setTimeout(check, 200);
        }

        check();
    });
}


// 7. START CAMERA
// ================================================

startButton.addEventListener("click", startCamera);

async function startCamera() {
    if (cameraStarted) return;

    startButton.disabled = true;
    statusText.textContent = "กำลังเปิดกล้อง...";

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "เบราว์เซอร์นี้ไม่รองรับกล้อง หรือเว็บไม่ได้ใช้ HTTPS"
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
                reject(new Error("ไม่สามารถอ่านภาพจากกล้องได้"));
            };
        });

        await camera.play();

        cameraStarted = true;
        startButton.style.display = "none";

        statusText.textContent = "กำลังโหลด OpenCV...";

        await waitForOpenCV();

        statusText.textContent = "OpenCV พร้อมแล้ว กำลังค้นหาจอ TV...";

        startDetection();

    } catch (error) {
        console.error("Camera startup error:", error);

        statusText.textContent =
            "เปิดกล้องไม่สำเร็จ: " + error.message;

        startButton.disabled = false;
    }
}


// 8. ORDER THE FOUR CORNERS
// ================================================
// Output: TL -> TR -> BR -> BL

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


// 9. DETECT TV CANDIDATES
// ================================================

function findTVCandidates(src) {
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const closed = new cv.Mat();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);

    const candidates = [];

    const width = src.cols;
    const height = src.rows;
    const imageArea = width * height;

    try {
        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Reduce noise
        cv.GaussianBlur(
            gray,
            blurred,
            new cv.Size(5, 5),
            0
        );

        // Find edges
        cv.Canny(blurred, edges, 50, 150);

        // Connect nearby broken edges
        cv.morphologyEx(
            edges,
            closed,
            cv.MORPH_CLOSE,
            kernel
        );

        // Find outer contours
        cv.findContours(
            closed,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            let approx = null;

            try {
                const area = cv.contourArea(contour);
                const areaRatio = area / imageArea;

                // Reject objects that are too small or too large
                if (
                    areaRatio < MIN_AREA_RATIO ||
                    areaRatio > MAX_AREA_RATIO
                ) {
                    continue;
                }

                const perimeter = cv.arcLength(contour, true);

                approx = new cv.Mat();

                cv.approxPolyDP(
                    contour,
                    approx,
                    0.02 * perimeter,
                    true
                );

                // Must be a four-corner polygon
                if (approx.rows !== 4) continue;

                if (!cv.isContourConvex(approx)) continue;

                const points = [];

                for (let j = 0; j < 4; j++) {
                    const point = approx.intPtr(j, 0);

                    points.push({
                        x: point[0],
                        y: point[1]
                    });
                }

                const ordered = orderPoints(points);

                const minX = Math.min(...ordered.map(p => p.x));
                const maxX = Math.max(...ordered.map(p => p.x));
                const minY = Math.min(...ordered.map(p => p.y));
                const maxY = Math.max(...ordered.map(p => p.y));

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

                // Reject shapes that fill too little of their bounding box
                const boxArea = boxWidth * boxHeight;
                const rectangularity = area / boxArea;

                if (rectangularity < 0.55) continue;

                // Score: prefer a large, rectangular, 16:9-like object
                const ratioScore = Math.exp(
                    -Math.abs(Math.log(ratio / (16 / 9)))
                );

                const sizeScore = Math.sqrt(areaRatio);

                const score =
                    ratioScore * 0.6 +
                    rectangularity * 0.25 +
                    sizeScore * 0.15;

                candidates.push({
                    area,
                    score,
                    points: ordered
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
        blurred.delete();
        edges.delete();
        closed.delete();
        contours.delete();
        hierarchy.delete();
        kernel.delete();
    }
}


// 10. PERSPECTIVE TRANSFORM -> X/Y
// ================================================

function calculateXY(points, width, height) {
    let source = null;
    let destination = null;
    let transform = null;
    let centerPoint = null;
    let result = null;

    try {
        source = cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
            [
                points[0].x, points[0].y,
                points[1].x, points[1].y,
                points[2].x, points[2].y,
                points[3].x, points[3].y
            ]
        );

        destination = cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
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

        centerPoint = cv.matFromArray(
            1,
            1,
            cv.CV_32FC2,
            [
                width / 2,
                height / 2
            ]
        );

        result = new cv.Mat();

        cv.perspectiveTransform(
            centerPoint,
            result,
            transform
        );

        const x = result.data32F[0];
        const y = result.data32F[1];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("พิกัดที่คำนวณได้ไม่ถูกต้อง");
        }

        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        };

    } finally {
        if (source) source.delete();
        if (destination) destination.delete();
        if (transform) transform.delete();
        if (centerPoint) centerPoint.delete();
        if (result) result.delete();
    }
}


// 11. CAMERA COORDINATES -> OVERLAY COORDINATES
// ================================================

function cameraToScreen(x, y, imageWidth, imageHeight) {
    const rect = camera.getBoundingClientRect();

    const scale = Math.max(
        rect.width / imageWidth,
        rect.height / imageHeight
    );

    const displayedWidth = imageWidth * scale;
    const displayedHeight = imageHeight * scale;

    const offsetX = (rect.width - displayedWidth) / 2;
    const offsetY = (rect.height - displayedHeight) / 2;

    return {
        x: rect.left + offsetX + x * scale,
        y: rect.top + offsetY + y * scale
    };
}


// 12. DRAW TV OUTLINE
// ================================================

function drawDetectedTV(points, width, height) {
    const screenPoints = points.map(point =>
        cameraToScreen(
            point.x,
            point.y,
            width,
            height
        )
    );

    if (!lastTVPoints) {
        lastTVPoints = screenPoints.map(p => ({
            x: p.x,
            y: p.y
        }));
    } else {
        for (let i = 0; i < 4; i++) {
            lastTVPoints[i].x +=
                (screenPoints[i].x - lastTVPoints[i].x) *
                SMOOTHING;

            lastTVPoints[i].y +=
                (screenPoints[i].y - lastTVPoints[i].y) *
                SMOOTHING;
        }
    }

    drawCurrentOverlay();
}

function drawCurrentOverlay() {
    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );

    if (!lastTVPoints) return;

    overlayContext.beginPath();

    overlayContext.moveTo(
        lastTVPoints[0].x,
        lastTVPoints[0].y
    );

    for (let i = 1; i < 4; i++) {
        overlayContext.lineTo(
            lastTVPoints[i].x,
            lastTVPoints[i].y
        );
    }

    overlayContext.closePath();

    overlayContext.strokeStyle = "#00FF66";
    overlayContext.lineWidth = 3;
    overlayContext.stroke();

    const labels = ["TL", "TR", "BR", "BL"];

    for (let i = 0; i < 4; i++) {
        const p = lastTVPoints[i];

        overlayContext.beginPath();
        overlayContext.arc(p.x, p.y, 6, 0, Math.PI * 2);

        overlayContext.fillStyle = "#00FF66";
        overlayContext.fill();

        overlayContext.font = "bold 14px Arial";
        overlayContext.fillText(
            labels[i],
            p.x + 9,
            p.y - 9
        );
    }
}

function clearOverlay() {
    lastTVPoints = null;

    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );
}


// 13. MAIN DETECTION LOOP
// ================================================

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
        camera.videoWidth === 0 ||
        camera.videoHeight === 0
    ) {
        return;
    }

    const now = performance.now();

    if (now - lastDetectionTime < DETECTION_INTERVAL) return;

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

        const candidates = findTVCandidates(src);

        if (candidates.length === 0) {
            lostFrames++;

            statusText.textContent =
                "ยังไม่พบจอ TV — ลองปรับมุมกล้อง";

            xText.textContent = "--";
            yText.textContent = "--";

            if (lostFrames > MAX_LOST_FRAMES) {
                clearOverlay();
            }

            return;
        }

        // Use the highest-scoring candidate
        const best = candidates[0];

        lostFrames = 0;

        drawDetectedTV(
            best.points,
            width,
            height
        );

        const xy = calculateXY(
            best.points,
            width,
            height
        );

        xText.textContent = xy.x.toFixed(3);
        yText.textContent = xy.y.toFixed(3);

        statusText.textContent =
            "พบกรอบจอที่เป็นไปได้ | X: " +
            xy.x.toFixed(3) +
            " Y: " +
            xy.y.toFixed(3);

    } catch (error) {
        console.error("Detection error:", error);

        statusText.textContent =
            "เกิดข้อผิดพลาดในการตรวจจับ";

    } finally {
        if (src) src.delete();
    }
}


// 14. STOP CAMERA
// ================================================

function stopCamera() {
    detectionRunning = false;

    if (detectionTimer !== null) {
        clearTimeout(detectionTimer);
        detectionTimer = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    camera.srcObject = null;
    cameraStarted = false;

    clearOverlay();

    xText.textContent = "--";
    yText.textContent = "--";

    startButton.style.display = "";
    startButton.disabled = false;

    statusText.textContent = "ปิดกล้องแล้ว";
}

// เรียก stopCamera() จาก Console ได้เมื่อต้องการปิดกล้อง
window.stopStargazingCamera = stopCamera;



// 10. PERSPECTIVE TRANSFORM -> X/Y
// ================================================

function calculateXY(points, width, height) {
    let source = null;
    let destination = null;
    let transform = null;
    let centerPoint = null;
    let result = null;

    try {
        source = cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
            [
                points[0].x, points[0].y,
                points[1].x, points[1].y,
                points[2].x, points[2].y,
                points[3].x, points[3].y
            ]
        );

        destination = cv.matFromArray(
            4,
            1,
            cv.CV_32FC2,
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

        centerPoint = cv.matFromArray(
            1,
            1,
            cv.CV_32FC2,
            [
                width / 2,
                height / 2
            ]
        );

        result = new cv.Mat();

        cv.perspectiveTransform(
            centerPoint,
            result,
            transform
        );

        const x = result.data32F[0];
        const y = result.data32F[1];

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("พิกัดที่คำนวณได้ไม่ถูกต้อง");
        }

        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        };

    } finally {
        if (source) source.delete();
        if (destination) destination.delete();
        if (transform) transform.delete();
        if (centerPoint) centerPoint.delete();
        if (result) result.delete();
    }
}


// 11. CAMERA COORDINATES -> OVERLAY COORDINATES
// ================================================

function cameraToScreen(x, y, imageWidth, imageHeight) {
    const rect = camera.getBoundingClientRect();

    const scale = Math.max(
        rect.width / imageWidth,
        rect.height / imageHeight
    );

    const displayedWidth = imageWidth * scale;
    const displayedHeight = imageHeight * scale;

    const offsetX = (rect.width - displayedWidth) / 2;
    const offsetY = (rect.height - displayedHeight) / 2;

    return {
        x: rect.left + offsetX + x * scale,
        y: rect.top + offsetY + y * scale
    };
}


// 12. DRAW TV OUTLINE
// ================================================

function drawDetectedTV(points, width, height) {
    const screenPoints = points.map(point =>
        cameraToScreen(
            point.x,
            point.y,
            width,
            height
        )
    );

    if (!lastTVPoints) {
        lastTVPoints = screenPoints.map(p => ({
            x: p.x,
            y: p.y
        }));
    } else {
        for (let i = 0; i < 4; i++) {
            lastTVPoints[i].x +=
                (screenPoints[i].x - lastTVPoints[i].x) *
                SMOOTHING;

            lastTVPoints[i].y +=
                (screenPoints[i].y - lastTVPoints[i].y) *
                SMOOTHING;
        }
    }

    drawCurrentOverlay();
}

function drawCurrentOverlay() {
    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );

    if (!lastTVPoints) return;

    overlayContext.beginPath();

    overlayContext.moveTo(
        lastTVPoints[0].x,
        lastTVPoints[0].y
    );

    for (let i = 1; i < 4; i++) {
        overlayContext.lineTo(
            lastTVPoints[i].x,
            lastTVPoints[i].y
        );
    }

    overlayContext.closePath();

    overlayContext.strokeStyle = "#00FF66";
    overlayContext.lineWidth = 3;
    overlayContext.stroke();

    const labels = ["TL", "TR", "BR", "BL"];

    for (let i = 0; i < 4; i++) {
        const p = lastTVPoints[i];

        overlayContext.beginPath();
        overlayContext.arc(p.x, p.y, 6, 0, Math.PI * 2);

        overlayContext.fillStyle = "#00FF66";
        overlayContext.fill();

        overlayContext.font = "bold 14px Arial";
        overlayContext.fillText(
            labels[i],
            p.x + 9,
            p.y - 9
        );
    }
}

function clearOverlay() {
    lastTVPoints = null;

    overlayContext.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );
}


// 13. MAIN DETECTION LOOP
// ================================================

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
        camera.videoWidth === 0 ||
        camera.videoHeight === 0
    ) {
        return;
    }

    const now = performance.now();

    if (now - lastDetectionTime < DETECTION_INTERVAL) return;

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

        const candidates = findTVCandidates(src);

        if (candidates.length === 0) {
            lostFrames++;

            statusText.textContent =
                "ยังไม่พบจอ TV — ลองปรับมุมกล้อง";

            xText.textContent = "--";
            yText.textContent = "--";

            if (lostFrames > MAX_LOST_FRAMES) {
                clearOverlay();
            }

            return;
        }

        // Use the highest-scoring candidate
        const best = candidates[0];

        lostFrames = 0;

        drawDetectedTV(
            best.points,
            width,
            height
        );

        const xy = calculateXY(
            best.points,
            width,
            height
        );

        xText.textContent = xy.x.toFixed(3);
        yText.textContent = xy.y.toFixed(3);

        statusText.textContent =
            "พบกรอบจอที่เป็นไปได้ | X: " +
            xy.x.toFixed(3) +
            " Y: " +
            xy.y.toFixed(3);

    } catch (error) {
        console.error("Detection error:", error);

        statusText.textContent =
            "เกิดข้อผิดพลาดในการตรวจจับ";

    } finally {
        if (src) src.delete();
    }
}


// 14. STOP CAMERA
// ================================================

function stopCamera() {
    detectionRunning = false;

    if (detectionTimer !== null) {
        clearTimeout(detectionTimer);
        detectionTimer = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    camera.srcObject = null;
    cameraStarted = false;

    clearOverlay();

    xText.textContent = "--";
    yText.textContent = "--";

    startButton.style.display = "";
    startButton.disabled = false;

    statusText.textContent = "ปิดกล้องแล้ว";
}

// เรียก stopCamera() จาก Console ได้เมื่อต้องการปิดกล้อง
window.stopStargazingCamera = stopCamera;

