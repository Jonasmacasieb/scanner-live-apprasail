let canvas, ctx, video;
let cameraStream = null;
let isVideoReady = false;
let isScanning = false;
let currentFacingMode = 'environment';

let lastFrameTime = 0;
const targetFPS = 30;
const frameInterval = 1000 / targetFPS;

function initCameraElements() {
    canvas = document.getElementById('appCanvas');
    ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    video = document.getElementById('webcam');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

async function startCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }

    try {
        const constraints = {
            video: { 
                facingMode: currentFacingMode, 
                width: { ideal: 854, max: 1280 }, 
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = cameraStream;
        await video.play();
        isVideoReady = true;
        document.getElementById('camSourceBadge').textContent = 
            currentFacingMode === 'user' ? 'FRONT CAM' : 'REAR CAM';
    } catch (err) {
        isVideoReady = false;
        document.getElementById('camSourceBadge').textContent = 'SIMULATION';
    }
}

function toggleCameraFacing() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
}

function renderLoop(timestamp) {
    requestAnimationFrame(renderLoop);

    const elapsed = timestamp - lastFrameTime;
    if (elapsed < frameInterval) return;
    lastFrameTime = timestamp - (elapsed % frameInterval);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isVideoReady && video.readyState >= 2) {
        ctx.save();
        if (currentFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    } else {
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
        for (let x = 0; x < canvas.width; x += 60) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 60) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
    }

    drawFullscreenGridLines();
}

function drawFullscreenGridLines() {
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.strokeStyle = isScanning ? 'rgba(236, 72, 153, 0.6)' : 'rgba(6, 182, 212, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);

    ctx.beginPath();
    ctx.moveTo(cx - 40, cy); ctx.lineTo(cx + 40, cy);
    ctx.moveTo(cx, cy - 40); ctx.lineTo(cx, cy + 40);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = isScanning ? '#ec4899' : '#06b6d4';
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}