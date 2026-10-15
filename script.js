```javascript
// ========================================
// STARGAZING
// Camera + OpenCV + TV Detection + X/Y
// Stable Lock First TV Until Page Refresh
// WebSocket → Node.js → OSC
// ========================================


// ========================================
// HTML ELEMENTS
// ========================================

const camera = document.getElementById("camera");
const startButton = document.getElementById("startButton");
const xText = document.getElementById("x");
const yText = document.getElementById("y");
const canvas = document.getElementById("processingCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");

const overlayContext = overlayCanvas
    ? overlayCanvas.getContext("2d")
    : null;

const statusText = document.getElementById("status");


// ========================================
// VARIABLES
// ========================================

let cameraStarted = false;
let detectionRunning = false;

let lastTVPoints = null;
let lastDetectedCenter = null;

// ล็อกจอแรกจนกว่าจะรีเฟรชเว็บ
let lockedTVPoints = null;

// ใช้สะสมผลตรวจจับก่อนล็อกจริง
let pendingTVPoints = null;
let stableFrames = 0;

const REQUIRED_STABLE_FRAMES = 8;
const MAX_PENDING_MOVEMENT = 0.045;

// พิกัดขอบจอที่เปลี่ยนแปลงได้น้อยจะถือว่าเป็นจอเดิม
// ค่านี้คิดเทียบกับความกว้างและความสูงของภาพกล้อง


// ========================================
// SERVER URLS — KEEP EXISTING URLS
// ========================================

let socket = null;
let websocketConnected = false;

const WEBSOCKET_URL =
    "wss://recovery-nose-evanescence-wolf.trycloudflare.com";

const HTTP_URL =
    "https://what-coordinated-drives-quotes.trycloudflare.com/xy";


// ========================================
// SEND X/Y SETTINGS
// ========================================

let lastSendTime = 0;
const SEND_INTERVAL = 50;


// ========================================
// CHECK REQUIRED HTML ELEMENTS
// ========================================

console.log("STARGAZING JS LOADED");

console.log({
    camera: !!camera,
    startButton: !!startButton,
    processingCanvas: !!canvas,
    overlayCanvas: !!overlayCanvas,
    status: !!statusText
});

if (
    !camera ||
    !startButton ||
    !canvas ||
    !overlayCanvas ||
    !statusText ||
    !overlayContext
) {
    console.error(
        "STARGAZING: HTML element missing. Check element IDs."
    );

    if (statusText) {
        statusText.textContent =
            "HTML Error: ตรวจสอบ ID ขององค์ประกอบ";
    }
}


// ========================================
// WEBSOCKET → NODE.JS
// ========================================

function connectOSCBridge() {
    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {
        return;
    }

    console.log("กำลังเชื่อมต่อ WebSocket...", WEBSOCKET_URL);

    try {
        socket = new WebSocket(WEBSOCKET_URL);

        socket.onopen = function () {
            websocketConnected = true;
            console.log("WebSocket Connected!");
        };

        socket.onerror = function (error) {
            websocketConnected = false;
            console.error("WebSocket Error:", error);
        };

        socket.onclose = function (event) {
            websocketConnected = false;

            console.log(
                "WebSocket Closed:",
                event.code,
                event.reason
            );

            setTimeout(connectOSCBridge, 2000);
        };
    } catch (error) {
        websocketConnected = false;
        console.error("WebSocket Setup Error:", error);

        setTimeout(connectOSCBridge, 2000);
    }
}


// ========================================
// SEND X/Y TO NODE.JS
// ========================================

function sendXYToServer(x, y) {
    const now = performance.now();

    if (now - lastSendTime < SEND_INTERVAL) {
        return;
    }

    lastSendTime = now;

    const safeX = Math.max(0, Math.min(1, Number(x)));
    const safeY = Math.max(0, Math.min(1, Number(y)));

    fetch(HTTP_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            x: safeX,
            y: safeY
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            return response.json();
        })
        .catch(error => {
            console.error("ส่ง X/Y ไม่สำเร็จ:", error);
        });
}


// ========================================
// RESIZE OVERLAY
// ========================================

function resizeOverlay() {
    if (!overlayCanvas) return;

    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;

    // ถ้ามีจอที่ล็อกไว้ ให้วาดกรอบใหม่หลัง resize
    if (lockedTVPoints && canvas) {
        drawDetectedTV(
            lockedTVPoints,
            canvas.width,
            canvas.height
        );
    }
}

window.addEventListener("resize", resizeOverlay);
resizeOverlay();


// ========================================
// OPEN CAMERA
// ========================================

if (startButton && camera) {
    startButton.addEventListener("click", async function () {
        console.log("กดปุ่มเปิดกล้องแล้ว");

        if (cameraStarted) return;

        try {
            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "เบราว์เซอร์ไม่รองรับกล้อง กรุณาเปิดผ่าน HTTPS"
                );
            }

            statusText.textContent = "กำลังขอเปิดกล้อง...";

            const stream =
                await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: {
                            ideal: "environment"
                        }
                    },
                    audio: false
                });

            camera.srcObject = stream;

            await new Promise((resolve, reject) => {
                if (
                    camera.readyState >=
                    HTMLMediaElement.HAVE_METADATA
                ) {
                    resolve();
                    return;
                }

                const onLoaded = () => {
                    cleanup();
                    resolve();
                };

                const onError = () => {
                    cleanup();
                    reject(
                        new Error("ไม่สามารถโหลดภาพจากกล้องได้")
                    );
                };

                const cleanup = () => {
                    camera.removeEventListener(
                        "loadedmetadata",
                        onLoaded
                    );

                    camera.removeEventListener(
                        "error",
                        onError
                    );
                };

                camera.addEventListener(
                    "loadedmetadata",
                    onLoaded,
                    { once: true }
                );

                camera.addEventListener(
                    "error",
                    onError,
                    { once: true }
                );
            });

            await camera.play();

            cameraStarted = true;
            startButton.style.display = "none";

            statusText.textContent =
                "เปิดกล้องแล้ว กำลังรอ OpenCV...";

            console.log(
                "Camera started:",
                camera.videoWidth,
                camera.videoHeight
            );

            startDetection();

        } catch (error) {
            console.error("Camera Error:", error);

            if (camera.srcObject) {
                camera.srcObject.getTracks().forEach(
                    track => track.stop()
                );

                camera.srcObject = null;
            }

            cameraStarted = false;

            statusText.textContent =
                "เปิดกล้องไม่สำเร็จ: " + error.message;

            let message = error.message;

            if (error.name === "NotAllowedError") {
                message =
                    "ไม่ได้รับอนุญาตให้ใช้กล้อง " +
                    "ตรวจสอบสิทธิ์กล้องของเว็บไซต์";
            } else if (error.name === "NotFoundError") {
                message = "ไม่พบกล้องที่สามารถใช้งานได้";
            } else if (error.name === "NotReadableError") {
                message =
                    "กล้องอาจกำลังถูกใช้งานโดยโปรแกรมอื่น";
            } else if (error.name === "OverconstrainedError") {
                message =
                    "กล้องไม่รองรับการตั้งค่าที่ร้องขอ";
            }

            alert(
                "ไม่สามารถเปิดกล้องได้\n\n" +
                error.name + "\n" + message
            );
        }
    });
}


// ========================================
// CHECK OPENCV
// ========================================

function waitForOpenCV() {
    return (
        typeof cv !== "undefined" &&
        !!cv.Mat &&
        typeof cv.imread === "function"
    );
}


// ========================================
// START DETECTION
// ========================================

function startDetection() {
    if (detectionRunning || !cameraStarted) return;

    if (!waitForOpenCV()) {
        statusText.textContent = "กำลังรอ OpenCV...";
        setTimeout(startDetection, 500);
        return;
    }

    detectionRunning = true;
    statusText.textContent = "กำลังตรวจจับ TV...";

    requestAnimationFrame(detectTV);
}


// ========================================
// ORDER FOUR CORNER POINTS
// 0 = TL, 1 = TR, 2 = BR, 3 = BL
// ========================================

function orderPoints(points) {
    const ordered = new Array(4);

    const sums = points.map(p => p.x + p.y);
    const differences = points.map(p => p.x - p.y);

    ordered[0] = points[sums.indexOf(Math.min(...sums))];
    ordered[2] = points[sums.indexOf(Math.max(...sums))];

    ordered[1] = points[
        differences.indexOf(Math.max(...differences))
    ];

    ordered[3] = points[
        differences.indexOf(Math.min(...differences))
    ];

    return ordered;
}


// ========================================
// CAMERA COORDINATES → SCREEN COORDINATES
// Supports object-fit: cover
// ========================================

function cameraToScreen(x, y, imageWidth, imageHeight) {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const scale = Math.max(
        screenWidth / imageWidth,
        screenHeight / imageHeight
    );

    const displayedWidth = imageWidth * scale;
    const displayedHeight = imageHeight * scale;

    const offsetX = (screenWidth - displayedWidth) / 2;
    const offsetY = (screenHeight - displayedHeight) / 2;

    return {
        x: x * scale + offsetX,
        y: y * scale + offsetY
    };
}


// ========================================
// CALCULATE NORMALIZED X/Y
// ========================================

function calculateXY(tvPoints, width, height) {
    let source = null;
    let destination = null;
    let transform = null;
    let centerPoint = null;
    let result = null;

    try {
        source = cv.matFromArray(
            4, 1, cv.CV_32FC2,
            [
                tvPoints[0].x, tvPoints[0].y,
                tvPoints[1].x, tvPoints[1].y,
                tvPoints[2].x, tvPoints[2].y,
                tvPoints[3].x, tvPoints[3].y
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

        centerPoint = cv.matFromArray(
            1, 1, cv.CV_32FC2,
            [width / 2, height / 2]
        );

        result = new cv.Mat();

        cv.perspectiveTransform(
            centerPoint,
            result,
            transform
        );

        let x = result.data32F[0];
        let y = result.data32F[1];

        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        xText.textContent = x.toFixed(2);
        yText.textContent = y.toFixed(2);

        sendXYToServer(x, y);

    } catch (error) {
        console.error("XY Error:", error);
    } finally {
        if (source) source.delete();
        if (destination) destination.delete();
        if (transform) transform.delete();
        if (centerPoint) centerPoint.delete();
        if (result) result.delete();
    }
}


// ========================================
// CHECK WHETHER CANDIDATE IS STABLE
// Compare all four corners with previous frame
// ========================================

function isSameTV(pointsA, pointsB, width, height) {
    if (!pointsA || !pointsB) return false;

    for (let i = 0; i < 4; i++) {
        const dx = (pointsA[i].x - pointsB[i].x) / width;
        const dy = (pointsA[i].y - pointsB[i].y) / height;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > MAX_PENDING_MOVEMENT) {
            return false;
        }
    }

    return true;
}


// ========================================
// DETECT TV / SKY DISPLAY
// ========================================

function detectTV() {
    if (!cameraStarted || !detectionRunning) {
        detectionRunning = false;
        return;
    }

    if (
        !waitForOpenCV() ||
        camera.videoWidth === 0 ||
        camera.videoHeight === 0
    ) {
        requestAnimationFrame(detectTV);
        return;
    }

    const width = 640;

    const height = Math.round(
        camera.videoHeight * (width / camera.videoWidth)
    );

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    context.drawImage(camera, 0, 0, width, height);


    // =================================
    // LOCKED TV: NEVER SEARCH AGAIN
    // =================================

    if (lockedTVPoints !== null) {
        statusText.textContent = "ล็อกจอแล้ว";

        // วาดจากพิกัดที่ล็อกไว้ ไม่ใช้ผลตรวจจับเฟรมใหม่
        drawDetectedTV(lockedTVPoints, width, height);

        calculateXY(lockedTVPoints, width, height);

        requestAnimationFrame(detectTV);
        return;
    }


    // =================================
    // OPENCV IMAGE PROCESSING
    // =================================

    let src = null;
    let gray = null;
    let blurred = null;
    let edges = null;
    let contours = null;
    let hierarchy = null;

    try {
        src = cv.imread(canvas);

        gray = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        blurred = new cv.Mat();

        cv.GaussianBlur(
            gray,
            blurred,
            new cv.Size(5, 5),
            0
        );

        edges = new cv.Mat();

        cv.Canny(blurred, edges, 50, 150);

        contours = new cv.MatVector();
        hierarchy = new cv.Mat();

        cv.findContours(
            edges,
            contours,
            hierarchy,
            cv.RETR_LIST,
            cv.CHAIN_APPROX_SIMPLE
        );

        const candidates = [];
        const imageArea = width * height;


        // =================================
        // FIND RECTANGULAR CANDIDATES
        // =================================

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);

            try {
                const area = cv.contourArea(contour);

                if (area < 2500) continue;

                const areaRatio = area / imageArea;

                if (areaRatio < 0.02 || areaRatio > 0.97) {
                    continue;
                }

                const perimeter = cv.arcLength(contour, true);
                const approx = new cv.Mat();

                try {
                    cv.approxPolyDP(
                        contour,
                        approx,
                        0.02 * perimeter,
                        true
                    );

                    if (approx.rows !== 4) continue;

                    let points = [];

                    for (let j = 0; j < 4; j++) {
                        const point = approx.intPtr(j, 0);

                        points.push({
                            x: point[0],
                            y: point[1]
                        });
                    }

                    points = orderPoints(points);

                    const xs = points.map(p => p.x);
                    const ys = points.map(p => p.y);

                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    const boxWidth = maxX - minX;
                    const boxHeight = maxY - minY;

                    if (boxWidth <= 80 || boxHeight <= 50) {
                        continue;
                    }

                    const ratio = boxWidth / boxHeight;

                    if (ratio < 1.05 || ratio > 4.5) {
                        continue;
                    }

                    candidates.push({
                        area,
                        points
                    });

                } finally {
                    approx.delete();
                }

            } finally {
                contour.delete();
            }
        }


        // =================================
        // SCORE CANDIDATES
        // =================================

        let bestCandidate = null;
        let bestScore = -Infinity;

        for (const candidate of candidates) {
            const points = candidate.points;

            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);

            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const boxWidth = maxX - minX;
            const boxHeight = maxY - minY;

            if (boxWidth <= 0 || boxHeight <= 0) continue;

            const ratio = boxWidth / boxHeight;
            const areaRatio = candidate.area / imageArea;

            const expectedRatio = 16 / 9;

            if (
                ratio < 1.3 ||
                ratio > 2.2 ||
                areaRatio < 0.04 ||
                areaRatio > 0.65
            ) {
                continue;
            }

            const ratioScore = Math.exp(
                -2 * Math.abs(Math.log(ratio / expectedRatio))
            );

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const dx = (centerX - width / 2) / (width / 2);
            const dy = (centerY - height / 2) / (height / 2);

            const centerDistance = Math.sqrt(dx * dx + dy * dy);
            const centerScore = Math.exp(-centerDistance * 1.5);

            const areaScore = Math.exp(
                -Math.abs(Math.log(areaRatio / 0.18))
            );

            let continuityScore = 0.5;

            if (lastDetectedCenter !== null) {
                const oldDx =
                    (centerX - lastDetectedCenter.x) / width;

                const oldDy =
                    (centerY - lastDetectedCenter.y) / height;

                const movement = Math.sqrt(
                    oldDx * oldDx + oldDy * oldDy
                );

                continuityScore = Math.exp(-movement * 8);
            }

            const score =
                ratioScore * 0.40 +
                centerScore * 0.25 +
                areaScore * 0.15 +
                continuityScore * 0.20;

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }


        // =================================
        // STABLE LOCK LOGIC
        // Require 8 consecutive similar detections
        // =================================

        if (bestCandidate) {
            const points = bestCandidate.points;

            const centerX = points.reduce(
                (sum, p) => sum + p.x, 0
            ) / 4;

            const centerY = points.reduce(
                (sum, p) => sum + p.y, 0
            ) / 4;

            lastDetectedCenter = {
                x: centerX,
                y: centerY
            };

            if (
                pendingTVPoints !== null &&
                isSameTV(
                    pendingTVPoints,
                    points,
                    width,
                    height
                )
            ) {
                // เฉลี่ยตำแหน่งเล็กน้อย ลดการสั่นก่อนล็อก
                const smoothing = 0.35;

                pendingTVPoints = pendingTVPoints.map(
                    (oldPoint, i) => ({
                        x: oldPoint.x +
                            (points[i].x - oldPoint.x) * smoothing,

                        y: oldPoint.y +
                            (points[i].y - oldPoint.y) * smoothing
                    })
                );

                stableFrames++;

            } else {
                // เริ่มนับใหม่เมื่อเจอกรอบที่ต่างจากเดิม
                pendingTVPoints = points.map(p => ({
                    x: p.x,
                    y: p.y
                }));

                stableFrames = 1;
            }

            statusText.textContent =
                "กำลังยืนยันจอ... " +
                stableFrames + "/" + REQUIRED_STABLE_FRAMES;

            // แสดงกรอบชั่วคราวระหว่างยืนยัน
            drawDetectedTV(pendingTVPoints, width, height);

            if (stableFrames >= REQUIRED_STABLE_FRAMES) {
                // ล็อกเพียงครั้งเดียว จนกว่าจะรีเฟรชเว็บ
                lockedTVPoints = pendingTVPoints.map(p => ({
                    x: p.x,
                    y: p.y
                }));

                // ป้องกันกรอบชั่วคราวเก่ารบกวนกรอบที่ล็อก
                lastTVPoints = null;

                console.log(
                    "LOCKED FIRST TV:",
                    lockedTVPoints
                );

                statusText.textContent = "ล็อกจอแล้ว";

                drawDetectedTV(lockedTVPoints, width, height);

                calculateXY(lockedTVPoints, width, height);
            }

        } else {
            // ยังไม่ล็อก: หากหาไม่เจอ ให้เริ่มยืนยันใหม่
            pendingTVPoints = null;
            stableFrames = 0;
            lastDetectedCenter = null;
            lastTVPoints = null;

            clearOverlay();

            statusText.textContent = "กำลังหา TV...";
        }

    } catch (error) {
        console.error("OpenCV Error:", error);

    } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (edges) edges.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
    }

    requestAnimationFrame(detectTV);
}


// ========================================
// DRAW DETECTED TV
// ========================================

function drawDetectedTV(points, width, height) {
    if (!points || points.length !== 4) return;

    const screenPoints = points.map(point =>
        cameraToScreen(
            point.x,
            point.y,
            width,
            height
        )
    );

    if (lastTVPoints === null) {
        lastTVPoints = screenPoints.map(point => ({
            x: point.x,
            y: point.y
        }));
    } else {
        const smooth = lockedTVPoints !== null ? 1 : 0.25;

        for (let i = 0; i < 4; i++) {
            lastTVPoints[i].x +=
                (screenPoints[i].x - lastTVPoints[i].x) * smooth;

            lastTVPoints[i].y +=
                (screenPoints[i].y - lastTVPoints[i].y) * smooth;
        }
    }

    overlayContext.clearRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
    );

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

    overlayContext.strokeStyle = "lime";
    overlayContext.lineWidth = 4;
    overlayContext.stroke();

    for (const point of lastTVPoints) {
        overlayContext.beginPath();

        overlayContext.arc(
            point.x,
            point.y,
            7,
            0,
            Math.PI * 2
        );

        overlayContext.fillStyle = "lime";
        overlayContext.fill();
    }

    overlayContext.font = "bold 14px Arial";
    overlayContext.fillStyle = "lime";

    overlayContext.fillText(
        "TL",
        lastTVPoints[0].x + 10,
        lastTVPoints[0].y - 10
    );

    overlayContext.fillText(
        "TR",
        lastTVPoints[1].x + 10,
        lastTVPoints[1].y - 10
    );

    overlayContext.fillText(
        "BR",
        lastTVPoints[2].x + 10,
        lastTVPoints[2].y + 25
    );

    overlayContext.fillText(
        "BL",
        lastTVPoints[3].x - 30,
        lastTVPoints[3].y + 25
    );
}


// ========================================
// CLEAR OVERLAY
// ========================================

function clearOverlay() {
    if (!overlayContext || !overlayCanvas) return;

    overlayContext.clearRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
    );
}


// ========================================
// INITIALIZE
// ========================================

connectOSCBridge();

console.log("STARGAZING initialization complete");
```
