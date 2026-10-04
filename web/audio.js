// Realistic Web Audio synthesizer for Dum Baar
// Generates authentic water bubbling sounds during inhalation (draw),
// soft airy exhale whoosh sounds during smoke blow,
// and resonant crystalline chimes when smoke rings are blown.

class HookahAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.drawGain = null;
    this.exhaleGain = null;
    this.bubbleTimer = null;
    this.isDrawing = false;
    this.isExhaling = false;
    this.noiseBuffer = null;
    this.isMuted = false;
    this.volume = 0.85;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
    } catch (e) {
      console.warn("AudioContext init error:", e);
      return;
    }

    // Master volume gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Create 2 seconds of pink/brown noise
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }

    // Master draw gain
    this.drawGain = this.ctx.createGain();
    this.drawGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.drawGain.connect(this.masterGain);

    // Master exhale gain
    this.exhaleGain = this.ctx.createGain();
    this.exhaleGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.exhaleGain.connect(this.masterGain);

    // Setup Exhale noise source
    const exhaleSource = this.ctx.createBufferSource();
    exhaleSource.buffer = this.noiseBuffer;
    exhaleSource.loop = true;

    const exhaleFilter = this.ctx.createBiquadFilter();
    exhaleFilter.type = 'lowpass';
    exhaleFilter.frequency.setValueAtTime(650, this.ctx.currentTime);
    exhaleFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    exhaleSource.connect(exhaleFilter);
    exhaleFilter.connect(this.exhaleGain);
    exhaleSource.start();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, now, 0.05);
    }
    window.dispatchEvent(new CustomEvent('hookah-audio-mute-change', { detail: { isMuted: this.isMuted } }));
    return this.isMuted;
  }

  // Create individual water bubble "plop / blub"
  _triggerBubble(intensity = 1.0) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Bubble oscillator (sine wave with rapid rising pitch)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    const startFreq = 150 + Math.random() * 130;
    const endFreq = startFreq + 170 + Math.random() * 150;
    const duration = 0.042 + Math.random() * 0.04;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    oscGain.gain.setValueAtTime(0.01, now);
    oscGain.gain.linearRampToValueAtTime(0.24 * intensity, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Noise burst for the water splash / pop
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(320 + Math.random() * 160, now);
    noiseFilter.Q.setValueAtTime(3.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14 * intensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.25);

    osc.connect(oscGain);
    oscGain.connect(this.drawGain);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.drawGain);

    osc.start(now);
    noiseSrc.start(now);

    osc.stop(now + duration);
    noiseSrc.stop(now + duration * 1.25);
  }

  update(state) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const isDrawing = state.state === 'drawing' || (state.drawIntensity && state.drawIntensity > 0.08);
    const isExhaling = state.state === 'exhaling' || (state.exhaleRate && state.exhaleRate > 0.05);

    // Handle Bubbling (Drawing)
    if (isDrawing) {
      const now = this.ctx.currentTime;
      this.drawGain.gain.setTargetAtTime(0.85, now, 0.05);
      if (!this.bubbleTimer) {
        const scheduleBubble = () => {
          if (!this.isDrawing) return;
          this._triggerBubble(state.drawIntensity || 1.0);
          const nextInterval = 42 + Math.random() * 60; // 14-20 bubbles/sec
          this.bubbleTimer = setTimeout(scheduleBubble, nextInterval);
        };
        this.isDrawing = true;
        scheduleBubble();
      }
    } else {
      this.isDrawing = false;
      if (this.bubbleTimer) {
        clearTimeout(this.bubbleTimer);
        this.bubbleTimer = null;
      }
      if (this.drawGain) {
        this.drawGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
    }

    // Handle Exhale sound
    if (isExhaling && state.lung > 0) {
      const rate = state.exhaleRate || 0.6;
      this.exhaleGain.gain.setTargetAtTime(Math.min(0.55, rate * 0.48), this.ctx.currentTime, 0.08);
    } else {
      this.exhaleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    }
  }

  // Play resonant ring chime when a smoke ring / chhalla is shaped
  playRingChime() {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(784, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(659, now + 0.36);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

window.hookahAudio = new HookahAudio();

const activateAudio = () => {
  window.hookahAudio.init();
};
document.addEventListener('pointerdown', activateAudio, { once: true });
document.addEventListener('keydown', activateAudio, { once: true });
document.addEventListener('touchstart', activateAudio, { once: true });
