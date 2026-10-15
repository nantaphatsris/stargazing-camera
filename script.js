// ========================================
// STARGAZING
// Camera + OpenCV + TV Detection + X/Y
// Lock first detected TV until page refresh
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
let lostFrames = 0;
const maxLostFrames = 8;

// ล็อกพิกัดจอแรกที่ตรวจพบ จนกว่าจะรีเฟรชเว็บ
let lockedTVPoints = null;


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
// SEND X/Y
