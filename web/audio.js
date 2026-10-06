// Realistic Web Audio synthesizer for Dum Baar
// Generates authentic water bubbling sounds during inhalation (draw),
// soft airy exhale whoosh sounds during smoke blow,
// resonant crystalline chimes when smoke rings are blown,
// and rich procedural audio for social lounge reactions.

class HookahAudio {
  constructor() {
    this.ctx = null;
    this.compressor = null;
    this.masterGain = null;
    this.drawGain = null;
    this.exhaleGain = null;
    this.bubbleTimer = null;
    this.isDrawing = false;
    this.isExhaling = false;
    this.noiseBuffer = null;
    this.isMuted = false;
    this.volume = 1.35; // Boosted volume
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

    // Dynamic range compressor for rich, loud, punchy audio without clipping
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.2, this.ctx.currentTime);

    // Master volume gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // Create 2 seconds of pink/brown noise
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.8;
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
    exhaleFilter.frequency.setValueAtTime(750, this.ctx.currentTime);
    exhaleFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);

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

  // Create individual water bubble "plop / blub" (boosted loudness)
  _triggerBubble(intensity = 1.0) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Bubble oscillator (sine wave with rapid rising pitch)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    const startFreq = 140 + Math.random() * 140;
    const endFreq = startFreq + 180 + Math.random() * 160;
    const duration = 0.045 + Math.random() * 0.04;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    oscGain.gain.setValueAtTime(0.01, now);
    oscGain.gain.linearRampToValueAtTime(0.48 * intensity, now + 0.007);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Noise burst for the water splash / pop
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(340 + Math.random() * 160, now);
    noiseFilter.Q.setValueAtTime(3.0, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32 * intensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.3);

    osc.connect(oscGain);
    oscGain.connect(this.drawGain);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.drawGain);

    osc.start(now);
    noiseSrc.start(now);

    osc.stop(now + duration);
    noiseSrc.stop(now + duration * 1.3);
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
      this.drawGain.gain.setTargetAtTime(1.1, now, 0.04);
      if (!this.bubbleTimer) {
        const scheduleBubble = () => {
          if (!this.isDrawing) return;
          this._triggerBubble(state.drawIntensity || 1.0);
          const nextInterval = 38 + Math.random() * 55; // Rapid rich bubbling 16-22 bubbles/sec
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
        this.drawGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      }
    }

    // Handle Exhale sound (boosted loudness)
    if (isExhaling && state.lung > 0) {
      const rate = state.exhaleRate || 0.65;
      this.exhaleGain.gain.setTargetAtTime(Math.min(0.85, rate * 0.72), this.ctx.currentTime, 0.06);
    } else {
      this.exhaleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
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
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.38);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain || this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Play realistic acoustic reaction sound bites
  async playReactionSound(type = 'default') {
    if (!this.ctx) {
      this.init();
    }
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn("AudioContext resume failed:", err);
      }
    }

    if (this.isMuted) {
      this.isMuted = false;
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      }
    }

    const now = this.ctx.currentTime;
    const dest = this.ctx.destination;
    const lower = String(type).toLowerCase();

    if (lower.includes('pass')) {
      // Ascending cheerful 3-note melodic arpeggio: G4 -> C5 -> E5 ("Bhai pass kar!")
      const notes = [392.00, 523.25, 659.25];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.11;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.01, t);
        g.gain.linearRampToValueAtTime(0.55, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.35);
      });

    } else if (lower.includes('dum') || lower.includes('flame')) {
      // Warm resonant power chord & triumphant swoosh: "Kya dum maara!"
      const freqs = [220, 330, 440];
      freqs.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.25);
        g.gain.setValueAtTime(0.01, now);
        g.gain.linearRampToValueAtTime(0.5 / (i + 1), now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);

        osc.connect(filter);
        filter.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.55);
      });

    } else if (lower.includes('ring') || lower.includes('chhalla')) {
      // Crystalline bell chime
      this.playRingChime();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.6, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.5);

    } else if (lower.includes('wah') || lower.includes('clap')) {
      // Double acoustic clap / table tap
      for (let i = 0; i < 2; i++) {
        const t = now + i * 0.13;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(360, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.07);
        g.gain.setValueAtTime(0.65, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.08);
      }

    } else if (lower.includes('cheer')) {
      // Crystal toast glass clink: C7 (2093Hz) + high shimmer
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(2093, now);
      osc2.frequency.setValueAtTime(3135, now);
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.65, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc1.connect(g);
      osc2.connect(g);
      g.connect(dest);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.75);
      osc2.stop(now + 0.75);

    } else {
      // Default notification chime
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.14);
      g.gain.setValueAtTime(0.01, now);
      g.gain.linearRampToValueAtTime(0.5, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  }
}

window.hookahAudio = new HookahAudio();

const activateAudio = () => {
  if (window.hookahAudio) {
    window.hookahAudio.init();
    if (window.hookahAudio.ctx && window.hookahAudio.ctx.state === 'suspended') {
      window.hookahAudio.ctx.resume().catch(() => {});
    }
  }
};
document.addEventListener('pointerdown', activateAudio);
document.addEventListener('click', activateAudio);
document.addEventListener('touchstart', activateAudio);
document.addEventListener('keydown', activateAudio);
