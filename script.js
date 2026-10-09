// ========================================
// STARGAZING
// Camera + OpenCV + TV Detection + X/Y
// + WebSocket → Node.js → OSC
// ========================================


// ========================================
// HTML ELEMENTS
// ========================================

const camera =
    document.getElementById("camera");

const startButton =
    document.getElementById("startButton");

const xText =
    document.getElementById("x");

const yText =
    document.getElementById("y");

const canvas =
    document.getElementById("processingCanvas");

const overlayCanvas =
    document.getElementById("overlayCanvas");

const overlayContext =
    overlayCanvas.getContext("2d");

const statusText =
    document.getElementById("status");


// ========================================
// VARIABLES
// ========================================

let cameraStarted = false;

let lastTVPoints = null;

let lostFrames = 0;

const maxLostFrames = 8;


// ========================================
// WEBSOCKET → NODE.JS
// ========================================

let socket = null;

let websocketConnected = false;


// ========================================
// CLOUDFLARE WEBSOCKET URL
// ========================================

const WEBSOCKET_URL = "wss://recovery-nose-evanescence-wolf.trycloudflare.com";
const HTTP_URL = "https://wheel-ruth-outsourcing-organized.trycloudflare.com/xy";






// ========================================
// จำกัดความถี่การส่ง X/Y
// ========================================

let lastSendTime = 0;

const SEND_INTERVAL = 50;


// ========================================
// เชื่อมต่อ WebSocket
// ========================================

function connectOSCBridge() {

    console.log(
        "================================"
    );

    console.log(
        "กำลังเชื่อมต่อ WebSocket..."
    );

    console.log(
        WEBSOCKET_URL
    );

    console.log(
        "================================"
    );


    try {

        socket =
            new WebSocket(
                WEBSOCKET_URL
            );


        // --------------------------------
        // เชื่อมต่อสำเร็จ
        // --------------------------------

        socket.onopen =
            function () {

                websocketConnected =
                    true;

                console.log(
                    "✅ WebSocket Connected!"
                );

                console.log(
                    "พร้อมส่ง X/Y ไป Node.js"
                );

            };


        // --------------------------------
        // มี Error
        // --------------------------------

        socket.onerror =
            function (error) {

                websocketConnected =
                    false;

                console.error(
                    "❌ WebSocket Error:",
                    error
                );

            };


        // --------------------------------
        // หลุดการเชื่อมต่อ
        // --------------------------------

        socket.onclose =
            function (event) {

                websocketConnected =
                    false;

                console.log(
                    "⚠️ WebSocket Closed",
                    event.code,
                    event.reason
                );


                // พยายามเชื่อมต่อใหม่
                setTimeout(
                    connectOSCBridge,
                    2000
                );

            };

    }

    catch (error) {

        websocketConnected =
            false;

        console.error(
            "❌ WebSocket Setup Error:",
            error
        );


        setTimeout(
            connectOSCBridge,
            2000
        );

    }

}


// ========================================
// ส่ง X/Y ไป Node.js
// ========================================

function sendXYToServer(
    x,
    y
) {

    // --------------------------------
    // จำกัดความถี่
    // 50 ms = 20 ครั้ง / วินาที
    // --------------------------------

    const now =
        performance.now();

    if (
        now - lastSendTime <
        SEND_INTERVAL
    ) {

        return;

    }

    lastSendTime =
        now;


    // --------------------------------
    // จำกัด X/Y ให้อยู่ 0 - 1
    // --------------------------------

    const safeX =
        Math.max(
            0,
            Math.min(
                1,
                Number(x)
            )
        );

    const safeY =
        Math.max(
            0,
            Math.min(
                1,
                Number(y)
            )
        );


    // --------------------------------
    // ส่ง HTTP POST
    // --------------------------------

    fetch(
        HTTP_URL,
        {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                x: safeX,
                y: safeY

            })

        }
    )

    .then(response => {

        if (!response.ok) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }

        return response.json();

    })

    .then(data => {

        console.log(
            "📡 SEND X:",
            safeX.toFixed(3),
            "Y:",
            safeY.toFixed(3)
        );

    })

    .catch(error => {

        console.error(
            "❌ ส่ง X/Y ไม่สำเร็จ:",
            error
        );

    });

}




// ========================================
// RESIZE OVERLAY
// ========================================

function resizeOverlay() {

    overlayCanvas.width =
        window.innerWidth;

    overlayCanvas.height =
        window.innerHeight;

}


window.addEventListener(
    "resize",
    resizeOverlay
);


resizeOverlay();


// ========================================
// เปิดกล้อง
// ========================================

startButton.addEventListener(
    "click",
    async function () {

        try {

            const stream =
                await navigator.mediaDevices
                    .getUserMedia({

                        video: {

                            facingMode:
                                "environment"

                        },

                        audio: false

                    });


            camera.srcObject =
                stream;


            cameraStarted =
                true;


            startButton.style.display =
                "none";


            statusText.textContent =
                "เปิดกล้องแล้ว กำลังรอ OpenCV...";


            camera.onloadedmetadata =
                function () {

                    camera.play();

                    startDetection();

                };

        }

        catch (error) {

            console.error(error);

            alert(
                "ไม่สามารถเปิดกล้องได้"
            );

        }

    }
);


// ========================================
// ตรวจ OpenCV
// ========================================

function waitForOpenCV() {

    if (

        typeof cv !==
            "undefined" &&

        cv.Mat

    ) {

        return true;

    }

    return false;

}


// ========================================
// เริ่ม Detection
// ========================================

function startDetection() {

    if (
        !waitForOpenCV()
    ) {

        statusText.textContent =
            "กำลังรอ OpenCV...";


        setTimeout(
            startDetection,
            500
        );


        return;

    }


    statusText.textContent =
    "กำลังหาสี่เหลี่ยมกลางภาพ...";

detectLargestRectangle();

}


// ========================================
// จัดลำดับ 4 มุม
//
// 0 = TL
// 1 = TR
// 2 = BR
// 3 = BL
// ========================================

function orderPoints(points) {

    let ordered =
        new Array(4);


    let sums =
        points.map(
            point =>
                point.x +
                point.y
        );


    let differences =
        points.map(
            point =>
                point.x -
                point.y
        );


    let topLeftIndex =
        sums.indexOf(
            Math.min(
                ...sums
            )
        );


    let bottomRightIndex =
        sums.indexOf(
            Math.max(
                ...sums
            )
        );


    let topRightIndex =
        differences.indexOf(
            Math.max(
                ...differences
            )
        );


    let bottomLeftIndex =
        differences.indexOf(
            Math.min(
                ...differences
            )
        );


    ordered[0] =
        points[
            topLeftIndex
        ];


    ordered[1] =
        points[
            topRightIndex
        ];


    ordered[2] =
        points[
            bottomRightIndex
        ];


    ordered[3] =
        points[
            bottomLeftIndex
        ];


    return ordered;

}


// ========================================
// แปลงพิกัด OpenCV
// → พิกัดหน้าจอ
//
// รองรับ object-fit: cover
// ========================================

function cameraToScreen(
    x,
    y,
    imageWidth,
    imageHeight
) {

    const screenWidth =
        window.innerWidth;


    const screenHeight =
        window.innerHeight;


    const scale =
        Math.max(

            screenWidth /
                imageWidth,

            screenHeight /
                imageHeight

        );


    const displayedWidth =
        imageWidth *
        scale;


    const displayedHeight =
        imageHeight *
        scale;


    const offsetX =
        (
            screenWidth -
            displayedWidth
        ) / 2;


    const offsetY =
        (
            screenHeight -
            displayedHeight
        ) / 2;


    return {

        x:
            x * scale +
            offsetX,

        y:
            y * scale +
            offsetY

    };

}


// ========================================
// คำนวณ X/Y
//
// ใช้ Perspective Transform
// ========================================

function calculateXY(
    tvPoints,
    width,
    height
) {

    try {

        // --------------------------------
        // จุดทั้ง 4 ของ TV
        //
        // TL → TR → BR → BL
        // --------------------------------

        let source =
            cv.matFromArray(

                4,
                1,
                cv.CV_32FC2,

                [

                    tvPoints[0].x,
                    tvPoints[0].y,

                    tvPoints[1].x,
                    tvPoints[1].y,

                    tvPoints[2].x,
                    tvPoints[2].y,

                    tvPoints[3].x,
                    tvPoints[3].y

                ]

            );


        // --------------------------------
        // พื้นที่ปลายทาง
        //
        // กำหนด TV ให้เป็น
        // สี่เหลี่ยม 1 × 1
        // --------------------------------

        let destination =
            cv.matFromArray(

                4,
                1,
                cv.CV_32FC2,

                [

                    0,
                    0,

                    1,
                    0,

                    1,
                    1,

                    0,
                    1

                ]

            );


        // --------------------------------
        // สร้าง Perspective Matrix
        // --------------------------------

        let transform =
            cv.getPerspectiveTransform(

                source,

                destination

            );


        // --------------------------------
        // จุดกลางกล้อง
        // --------------------------------

        let centerX =
            width / 2;


        let centerY =
            height / 2;


        let centerPoint =
            cv.matFromArray(

                1,
                1,
                cv.CV_32FC2,

                [

                    centerX,
                    centerY

                ]

            );


        // --------------------------------
        // แปลงจุดกลาง
        // --------------------------------

        let result =
            new cv.Mat();


        cv.perspectiveTransform(

            centerPoint,

            result,

            transform

        );


        // --------------------------------
        // อ่านผล
        // --------------------------------

        let x =
            result.data32F[0];


        let y =
            result.data32F[1];


        // --------------------------------
        // จำกัดค่า 0 - 1
        // --------------------------------

        x =
            Math.max(
                0,
                Math.min(
                    1,
                    x
                )
            );


        y =
            Math.max(
                0,
                Math.min(
                    1,
                    y
                )
            );


        // --------------------------------
        // แสดงบนหน้าเว็บ
        // --------------------------------

        xText.textContent =
            x.toFixed(2);


        yText.textContent =
            y.toFixed(2);


        // ========================================
        // ส่ง X/Y ไป Node.js
        // ========================================

        sendXYToServer(
            x,
            y
        );


        // --------------------------------
        // Cleanup
        // --------------------------------

        source.delete();

        destination.delete();

        transform.delete();

        centerPoint.delete();

        result.delete();


    }

    catch (error) {

        console.error(
            "XY Error:",
            error
        );

    }

}


function detectLargestRectangle() {
    if (!cameraStarted ||
        camera.videoWidth === 0 ||
        camera.videoHeight === 0) {
        requestAnimationFrame(detectLargestRectangle);
        return;
    }

    const width = 640;
    const height = Math.round(
        camera.videoHeight * width / camera.videoWidth
    );

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.drawImage(camera, 0, 0, width, height);

    let src, gray, blurred, edges, contours, hierarchy;

    try {
        src = cv.imread(canvas);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        edges = new cv.Mat();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(
            gray, blurred, new cv.Size(5, 5), 0
        );
        cv.Canny(blurred, edges, 50, 150);

        cv.findContours(
            edges,
            contours,
            hierarchy,
            cv.RETR_LIST,
            cv.CHAIN_APPROX_SIMPLE
        );

        const imageArea = width * height;

        // พื้นที่ค้นหากลางภาพ: 60% ของความกว้างและความสูง
        const centerLeft = width * 0.20;
        const centerRight = width * 0.80;
        const centerTop = height * 0.20;
        const centerBottom = height * 0.80;

        let candidates = [];

        for (let i = 0; i < contours.size(); i++) {
            let contour = contours.get(i);
            let approx = null;

            try {
                const contourArea = cv.contourArea(contour);

                if (contourArea < 2500 ||
                    contourArea > imageArea * 0.90) {
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

                // ต้องมี 4 มุม
                if (approx.rows !== 4) continue;

                let points = [];

                for (let j = 0; j < 4; j++) {
                    const p = approx.intPtr(j, 0);
                    points.push({ x: p[0], y: p[1] });
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

                // กรองกรอบที่เล็กเกินไป
                if (boxWidth < 60 || boxHeight < 60) continue;

                // จุดกึ่งกลางของสี่เหลี่ยม
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;

                // ต้องอยู่ในบริเวณกลางภาพ
                if (
                    centerX < centerLeft ||
                    centerX > centerRight ||
                    centerY < centerTop ||
                    centerY > centerBottom
                ) {
                    continue;
                }

                // คำนวณพื้นที่จากจุดทั้ง 4
                // ใช้พื้นที่รูปหลายเหลี่ยมแทน contourArea
                let polygonArea = 0;

                for (let j = 0; j < 4; j++) {
                    const next = (j + 1) % 4;
                    polygonArea +=
                        points[j].x * points[next].y -
                        points[next].x * points[j].y;
                }

                polygonArea = Math.abs(polygonArea) / 2;

                candidates.push({
                    area: polygonArea,
                    points: points
                });
            } finally {
                if (approx) approx.delete();
                contour.delete();
            }
        }

        // เลือกกรอบที่ใหญ่ที่สุดจากกรอบในบริเวณกลางภาพ
        candidates.sort((a, b) => b.area - a.area);

        const bestCandidate =
            candidates.length > 0 ? candidates[0] : null;

        if (bestCandidate) {
            lostFrames = 0;

            statusText.textContent =
                "พบสี่เหลี่ยมกลางภาพ";

            drawDetectedTV(
                bestCandidate.points,
                width,
                height
            );

            // คำนวณ X/Y ด้วยระบบเดิม
            // ไม่ส่งข้อมูลไป Node.js ในขั้นนี้
            calculateXY(
                bestCandidate.points,
                width,
                height
            );
        } else {
            lostFrames++;

            statusText.textContent =
                "กำลังหาสี่เหลี่ยมกลางภาพ...";

            if (lostFrames > maxLostFrames) {
                clearOverlay();
                lastTVPoints = null;
            }
        }
    } catch (error) {
        console.error("Rectangle Detection Error:", error);
    } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (edges) edges.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
    }

    requestAnimationFrame(detectLargestRectangle);
}


// ========================================
// วาดกรอบ TV
// ========================================

function drawDetectedTV(

    points,

    width,

    height

) {

    // --------------------------------
    // แปลง 4 มุมเป็น screen
    // --------------------------------

    let screenPoints =
        points.map(

            point =>

                cameraToScreen(

                    point.x,

                    point.y,

                    width,

                    height

                )

        );


    // --------------------------------
    // Smooth
    // --------------------------------

    if (
        lastTVPoints === null
    ) {

        lastTVPoints =
            screenPoints.map(

                point => ({

                    x: point.x,

                    y: point.y

                })

            );

    }

    else {

        const smooth =
            0.25;


        for (

            let i = 0;

            i < 4;

            i++

        ) {

            lastTVPoints[i].x +=

                (

                    screenPoints[i].x -

                    lastTVPoints[i].x

                ) *

                smooth;


            lastTVPoints[i].y +=

                (

                    screenPoints[i].y -

                    lastTVPoints[i].y

                ) *

                smooth;

        }

    }


    // --------------------------------
    // ล้างกรอบเก่า
    // --------------------------------

    overlayContext.clearRect(

        0,

        0,

        overlayCanvas.width,

        overlayCanvas.height

    );


    // --------------------------------
    // เริ่มวาดกรอบ
    // --------------------------------

    overlayContext.beginPath();


    overlayContext.moveTo(

        lastTVPoints[0].x,

        lastTVPoints[0].y

    );


    for (

        let i = 1;

        i < 4;

        i++

    ) {

        overlayContext.lineTo(

            lastTVPoints[i].x,

            lastTVPoints[i].y

        );

    }


    overlayContext.closePath();


    // --------------------------------
    // เส้น
    // --------------------------------

    overlayContext.strokeStyle =
        "lime";


    overlayContext.lineWidth =
        4;


    overlayContext.stroke();


    // --------------------------------
    // จุดมุม
    // --------------------------------

    for (

        const point of lastTVPoints

    ) {

        overlayContext.beginPath();


        overlayContext.arc(

            point.x,

            point.y,

            7,

            0,

            Math.PI * 2

        );


        overlayContext.fillStyle =
            "lime";


        overlayContext.fill();

    }


    // --------------------------------
    // Label
    // --------------------------------

    overlayContext.font =
        "bold 14px Arial";


    overlayContext.fillStyle =
        "lime";


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
// ล้าง Overlay
// ========================================

function clearOverlay() {

    overlayContext.clearRect(

        0,

        0,

        overlayCanvas.width,

        overlayCanvas.height

    );

}
