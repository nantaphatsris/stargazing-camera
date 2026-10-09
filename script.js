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
const HTTP_URL = "https://continues-wide-poultry-dev.trycloudflare.com/xy";


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
        "กำลังตรวจจับ TV...";


    detectTV();

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


// ========================================
// ตรวจจับ TV
// ========================================

function detectTV() {

    if (!cameraStarted) {

        requestAnimationFrame(
            detectTV
        );

        return;

    }


    if (

        camera.videoWidth === 0 ||

        camera.videoHeight === 0

    ) {

        requestAnimationFrame(
            detectTV
        );

        return;

    }


    // ====================================
    // ขนาดภาพสำหรับ OpenCV
    // ====================================

    const width =
        640;


    const height =
        Math.round(

            camera.videoHeight *
            (
                width /
                camera.videoWidth
            )

        );


    canvas.width =
        width;


    canvas.height =
        height;


    // ====================================
    // เอาภาพกล้องเข้า Canvas
    // ====================================

    const context =
        canvas.getContext(
            "2d"
        );


    context.drawImage(

        camera,

        0,
        0,

        width,
        height

    );


    try {

        // =================================
        // อ่านภาพ
        // =================================

        let src =
            cv.imread(
                canvas
            );


        // =================================
        // Grayscale
        // =================================

        let gray =
            new cv.Mat();


        cv.cvtColor(

            src,

            gray,

            cv.COLOR_RGBA2GRAY

        );


        // =================================
        // Blur
        // =================================

        let blurred =
            new cv.Mat();


        cv.GaussianBlur(

            gray,

            blurred,

            new cv.Size(
                5,
                5
            ),

            0

        );


        // =================================
        // Canny
        // =================================

        let edges =
            new cv.Mat();


        cv.Canny(

            blurred,

            edges,

            50,
            150

        );


        // =================================
        // Contours
        // =================================

        let contours =
            new cv.MatVector();


        let hierarchy =
            new cv.Mat();


        cv.findContours(

            edges,

            contours,

            hierarchy,

            cv.RETR_LIST,

            cv.CHAIN_APPROX_SIMPLE

        );


        // =================================
        // หา candidate
        // =================================

        let candidates = [];


        const imageArea =
            width *
            height;


        for (

            let i = 0;

            i <
            contours.size();

            i++

        ) {

            let contour =
                contours.get(i);


            let area =
                cv.contourArea(
                    contour
                );


            // ขนาดเล็กเกินไป

            if (
                area < 5000
            ) {

                contour.delete();

                continue;

            }


            const areaRatio =
                area /
                imageArea;


            // ไม่เอาเล็กเกิน
            // และไม่เอาเต็มภาพ

            if (

                areaRatio < 0.05 ||

                areaRatio > 0.90

            ) {

                contour.delete();

                continue;

            }


            let perimeter =
                cv.arcLength(

                    contour,

                    true

                );


            let approx =
                new cv.Mat();


            cv.approxPolyDP(

                contour,

                approx,

                0.02 *
                perimeter,

                true

            );


            // =================================
            // ต้องเป็น 4 มุม
            // =================================

            if (
                approx.rows === 4
            ) {

                let points = [];


                for (

                    let j = 0;

                    j < 4;

                    j++

                ) {

                    let px =
                        approx.intPtr(
                            j,
                            0
                        )[0];


                    let py =
                        approx.intPtr(
                            j,
                            0
                        )[1];


                    points.push({

                        x: px,

                        y: py

                    });

                }


                // จัดลำดับมุม

                points =
                    orderPoints(
                        points
                    );


                // =================================
                // Bounding Box
                // =================================

                let minX =
                    Math.min(

                        ...points.map(
                            p => p.x
                        )

                    );


                let maxX =
                    Math.max(

                        ...points.map(
                            p => p.x
                        )

                    );


                let minY =
                    Math.min(

                        ...points.map(
                            p => p.y
                        )

                    );


                let maxY =
                    Math.max(

                        ...points.map(
                            p => p.y
                        )

                    );


                const boxWidth =
                    maxX -
                    minX;


                const boxHeight =
                    maxY -
                    minY;


                // =================================
                // ขนาดขั้นต่ำ
                // =================================

                if (

                    boxWidth > 100 &&

                    boxHeight > 80

                ) {

                    const ratio =
                        boxWidth /
                        boxHeight;


                    // aspect ratio
                    // ของจอแนวนอน

                    if (

                        ratio > 1.1 &&

                        ratio < 3.5

                    ) {

                        candidates.push({

                            area: area,

                            points: points

                        });

                    }

                }

            }


            approx.delete();

            contour.delete();

        }


        // =================================
        // เลือก candidate ที่ใหญ่สุด
        // =================================

        let bestCandidate =
            null;


        if (
            candidates.length > 0
        ) {

            candidates.sort(

                (a, b) =>
                    b.area -
                    a.area

            );


            bestCandidate =
                candidates[0];

        }


        // =================================
        // เจอ TV
        // =================================

        if (bestCandidate) {

            lostFrames = 0;


            statusText.textContent =
                "เจอรูปทรง 4 มุมแล้ว";


            // --------------------------------
            // วาดกรอบ
            // --------------------------------

            drawDetectedTV(

                bestCandidate.points,

                width,

                height

            );


            // --------------------------------
            // คำนวณ X/Y
            // --------------------------------

            calculateXY(

                bestCandidate.points,

                width,

                height

            );

        }

        else {

            lostFrames++;


            statusText.textContent =
                "กำลังหา TV...";


            if (

                lostFrames >
                maxLostFrames

            ) {

                clearOverlay();

                lastTVPoints =
                    null;

            }

        }


        // =================================
        // Cleanup
        // =================================

        src.delete();

        gray.delete();

        blurred.delete();

        edges.delete();

        contours.delete();

        hierarchy.delete();


    }

    catch (error) {

        console.error(
            "OpenCV Error:",
            error
        );

    }


    requestAnimationFrame(
        detectTV
    );

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
