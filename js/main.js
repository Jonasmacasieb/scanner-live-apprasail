function toggleSettingsMenu() {
    const menu = document.getElementById('settingsDrawer');
    menu.classList.toggle('hidden');
}

window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pointer-events-auto')) return;
    initAudioContext();
    playSynthSound(1200, 'triangle', 0.08, 0.2);
});

window.addEventListener('load', async () => {
    initCameraElements();
    await initDatabase();
    startCamera();
    requestAnimationFrame(renderLoop);
});