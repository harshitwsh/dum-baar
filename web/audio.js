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

  // Play realistic recorded audio reaction bites (or user's custom recording)
  playReactionSound(type = 'default') {
    const lower = String(type).toLowerCase();
    let key = 'pass';
    let defaultFile = 'web/audio/bhai_pass_kar.mp3';

    if (lower.includes('pass')) {
      key = 'pass';
      defaultFile = 'web/audio/bhai_pass_kar.mp3';
    } else if (lower.includes('dum') || lower.includes('flame')) {
      key = 'dum';
      defaultFile = 'web/audio/kya_dum_maara.mp3';
    } else if (lower.includes('ring') || lower.includes('chhalla')) {
      key = 'ring';
      defaultFile = 'web/audio/chhalla_bana.mp3';
    } else if (lower.includes('wah') || lower.includes('clap')) {
      key = 'wah';
      defaultFile = 'web/audio/wah_wah.mp3';
    } else if (lower.includes('cheer')) {
      key = 'cheer';
      defaultFile = 'web/audio/cheers.mp3';
    }

    const customAudio = localStorage.getItem(`dumbaar.custom_voice.${key}`);
    if (customAudio && customAudio.length > 50) {
      try {
        const audio = new Audio(customAudio);
        audio.volume = 1.0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log(`[Dum Baar Audio] Playing custom voice for: ${key}`);
          }).catch(err => {
            console.warn(`[Dum Baar Audio] Custom playback failed for ${key}, falling back to studio default:`, err);
            const fallback = new Audio(defaultFile);
            fallback.volume = 1.0;
            fallback.play().catch(() => {});
          });
        }
        return;
      } catch (e) {
        console.warn("[Dum Baar Audio] Error initializing custom audio playback:", e);
      }
    }

    try {
      const audio = new Audio(defaultFile);
      audio.volume = 1.0;
      audio.play().catch(err => {
        console.warn("Reaction audio play error:", err);
      });
    } catch (e) {
      console.warn("Could not play reaction audio:", e);
    }
  }

  playAudioData(base64OrBlobUrl) {
    if (!base64OrBlobUrl) return;
    try {
      const audio = new Audio(base64OrBlobUrl);
      audio.volume = 1.0;
      audio.play().catch(e => console.warn("playAudioData error:", e));
    } catch (err) {
      console.warn("playAudioData error:", err);
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
