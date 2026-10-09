
// ========================================
// WEBSOCKET → NODE.JS → OSC
// ========================================

let socket = null;
let websocketConnected = false;

const WEBSOCKET_URL =
    "wss://wto-hours-sells-pairs.trycloudflare.com";

let lastSendTime = 0;
const SEND_INTERVAL = 50;

// ========================================
// เชื่อมต่อ WebSocket
// ========================================

function connectOSCBridge() {
    console.log("กำลังเชื่อมต่อ WebSocket...");
    console.log(WEBSOCKET_URL);

    try {
        socket = new WebSocket(WEBSOCKET_URL);

        socket.onopen = function () {
            websocketConnected = true;
            console.log("WebSocket Connected!");
            console.log("พร้อมส่ง X/Y ไป Node.js");
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
// ส่ง X/Y ไป Node.js
// ========================================

function sendXYToServer(x, y) {
    if (
        !websocketConnected ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    const now = performance.now();

    if (now - lastSendTime < SEND_INTERVAL) {
        return;
    }

    const safeX = Number(x);
    const safeY = Number(y);

    if (
        !Number.isFinite(safeX) ||
        !Number.isFinite(safeY)
    ) {
        return;
    }

    const normalizedX = Math.max(0, Math.min(1, safeX));
    const normalizedY = Math.max(0, Math.min(1, safeY));

    lastSendTime = now;

    try {
        socket.send(JSON.stringify({
            x: normalizedX,
            y: normalizedY
        }));

    } catch (error) {
        console.error("ส่ง X/Y ไม่สำเร็จ:", error);
    }
}

// เริ่มเชื่อมต่อทันที
connectOSCBridge();
