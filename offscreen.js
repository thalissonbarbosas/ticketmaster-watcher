let loopInterval = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'playSound') {
    stopLoop();
    playAlertSound();
    loopInterval = setInterval(playAlertSound, 1000);
  }
  if (msg.action === 'stopSound') {
    stopLoop();
  }
});

function stopLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

function playAlertSound() {
  const ctx = new AudioContext();
  const notes = [830, 1050, 830, 1050, 830, 1050];
  const noteDuration = 0.15;
  const gap = 0.08;

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + i * (noteDuration + gap);
    osc.start(start);
    gain.gain.setValueAtTime(0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
    osc.stop(start + noteDuration);
  });
}
