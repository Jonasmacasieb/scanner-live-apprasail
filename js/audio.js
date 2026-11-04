let audioCtx = null;
let isAudioMuted = false;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSynthSound(freq, type, duration, vol = 0.1) {
    if (isAudioMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playScanCompleteSound() {
    if (isAudioMuted || !audioCtx) return;
    playSynthSound(587.33, 'triangle', 0.15, 0.2);
    setTimeout(() => playSynthSound(880, 'triangle', 0.25, 0.25), 100);
}

function toggleAudioMute() {
    isAudioMuted = !isAudioMuted;
    const icon = document.getElementById('audioBtnIcon');
    if (isAudioMuted) {
        icon.className = 'fa-solid fa-volume-xmark text-red-400';
    } else {
        icon.className = 'fa-solid fa-volume-high text-cyan-300';
        initAudioContext();
        playSynthSound(800, 'sine', 0.1);
    }
}