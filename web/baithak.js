// Dum Baar — Online Multiplayer Hookah Baithak (Virtual Lounge with Video Calls & Turn-Based Pipe Sharing)
// Built with WebRTC (PeerJS) for real-time peer-to-peer video, audio, and pipe physics synchronization.
// Strictly matches the "Ink wash & Soft Ivory" royal aesthetic.

class BaithakManager {
  constructor() {
    this.peer = null;
    this.myPeerId = null;
    this.roomId = null;
    this.myName = localStorage.getItem('dumbaar.baithak.name') || 'Lounge Guest';
    this.isHost = false;
    this.isInRoom = false;
    this.isExpanded = false;
    this.localStream = null;
    this.connections = new Map(); // peerId -> DataConnection
    this.mediaCalls = new Map();   // peerId -> MediaConnection
    this.participants = new Map(); // peerId -> { name, isHolder, stream }
    this.pipeHolderId = null;
    this.pipeHolderName = null;
    this.lastDrawSend = 0;
    this.remoteDrawState = null;
    this.isCamMuted = false;
    this.isMicMuted = false;
    this._pendingAudioElements = new Set();
    this.audioCtx = null;
    this._audioAnalysers = new Map();
    this._localAnalyser = null;
    this._vadInterval = null;

    this._initUI();
    this._initAudioUnlocker();
    this._checkURLRoom();
  }

  _initAudioUnlocker() {
    const unlock = () => {
      if (this._pendingAudioElements && this._pendingAudioElements.size > 0) {
        this._pendingAudioElements.forEach(el => {
          el.play().catch(() => {});
        });
        this._pendingAudioElements.clear();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    };
    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
      document.addEventListener(evt, unlock, { passive: true });
    });
  }

  _getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  _initUI() {
    this._injectModalAndDock();
  }

  _checkURLRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
      setTimeout(() => {
        this.openModal(room);
      }, 500);
    }
  }

  _dismissIntroSheet() {
    const startInteractiveBtn = document.getElementById('start-interactive');
    if (startInteractiveBtn) {
      try { startInteractiveBtn.click(); } catch (_) {}
    }
    const intro = document.getElementById('intro');
    if (intro) {
      intro.classList.add('leaving');
      intro.style.pointerEvents = 'none';
      intro.hidden = true;
      intro.setAttribute('hidden', '');
      intro.style.display = 'none';
    }
    const coach = document.getElementById('coach');
    if (coach) coach.hidden = false;

    // Show docks
    document.getElementById('hookah-dock')?.removeAttribute('hidden');
    document.getElementById('flavour-dock')?.removeAttribute('hidden');

    // Ensure audio context is ready
    try { window.hookahAudio?.init(); } catch (_) {}
  }

  _injectModalAndDock() {
    if (document.getElementById('baithak-dialog')) return;

    // 1. Baithak Setup Modal
    const dialog = document.createElement('dialog');
    dialog.id = 'baithak-dialog';
    dialog.className = 'flavour-dialog baithak-dialog';
    dialog.setAttribute('aria-labelledby', 'baithak-title');
    dialog.innerHTML = `
      <section class="flavour-card baithak-card">
        <div class="flavour-menu-top">
          <span class="flavour-eyebrow">Online Baithak · Video Hookah Circle</span>
          <button id="baithak-close" class="flavour-close" type="button" aria-label="Close dialog">×</button>
        </div>
        <h2 id="baithak-title">Sit together in a <em>Baithak.</em></h2>
        <p class="flavour-description">Video call your friends, pass the pipe one-by-one, and blow smoke rings together in real time.</p>

        <div class="baithak-form">
          <div class="form-group">
            <label for="baithak-username" class="baithak-label">Your Name</label>
            <input type="text" id="baithak-username" class="baithak-input" placeholder="e.g. Harshit" value="${this.myName}" maxlength="24">
          </div>

          <div class="baithak-tab-choice">
            <button type="button" id="tab-create-room" class="btn btn-cta active">Create Room</button>
            <button type="button" id="tab-join-room" class="btn btn-subtle">Join With Code</button>
          </div>

          <div id="section-create" class="baithak-section">
            <p class="baithak-hint">Start a private virtual lounge. You'll receive a direct link to share with friends via WhatsApp or chat.</p>
            <button type="button" id="btn-start-room" class="btn btn-cta" style="width:100%;margin-top:6px;">Start Baithak Room 🔥</button>
          </div>

          <div id="section-join" class="baithak-section" hidden>
            <div class="form-group" style="margin-top:10px;">
              <label for="baithak-code-input" class="baithak-label">Baithak Room Code</label>
              <input type="text" id="baithak-code-input" class="baithak-input" placeholder="e.g. ROYAL-842" style="text-transform:uppercase;">
            </div>
            <p class="baithak-hint">Paste the 8-character code sent by your friend.</p>
            <button type="button" id="btn-enter-room" class="btn btn-cta" style="width:100%;margin-top:6px;">Join Room 💨</button>
          </div>
        </div>

        <p class="fine" style="margin-top:16px;">Direct browser-to-browser WebRTC encrypted connection. No signups or downloads required.</p>
      </section>
    `;
    document.body.appendChild(dialog);

    // 2. In-Call Video Lounge Dock
    const videoDock = document.createElement('aside');
    videoDock.id = 'baithak-dock';
    videoDock.className = 'baithak-dock is-hidden';
    videoDock.hidden = true;
    videoDock.setAttribute('hidden', '');
    videoDock.style.display = 'none';
    videoDock.innerHTML = `
      <div class="baithak-dock-card">
        <!-- Top Bar -->
        <div class="baithak-dock-top">
          <div class="baithak-room-pill">
            <span class="live-pulse"></span>
            <span id="baithak-room-name" class="room-name">#ROOM</span>
            <span id="baithak-user-count" class="user-pill">1 friend</span>
          </div>

          <div class="baithak-top-btns">
            <button type="button" id="btn-toggle-expand" class="baithak-icon-btn" title="Toggle Fullscreen Lounge">⛶ Expand</button>
            <button type="button" id="btn-copy-invite" class="baithak-icon-btn highlight" title="Copy Invite Link">🔗 Invite</button>
            <button type="button" id="btn-leave-baithak" class="baithak-icon-btn danger" title="Leave Baithak">Leave</button>
          </div>
        </div>

        <!-- Dedicated Invite Banner for Host & Friends -->
        <div id="baithak-invite-banner" class="baithak-invite-banner">
          <div class="invite-banner-copy">
            <span class="invite-title">Room Code: <strong id="invite-code-display">ROYAL-000</strong></span>
            <span class="invite-sub">Share this link with friends to sit together:</span>
          </div>
          <div class="invite-banner-actions">
            <button type="button" id="btn-copy-link-banner" class="btn btn-cta btn-banner-copy">📋 Copy Link</button>
            <button type="button" id="btn-whatsapp-banner" class="btn btn-subtle btn-banner-wa">💬 WhatsApp</button>
          </div>
        </div>

        <!-- Video Tiles Stage -->
        <div id="baithak-videos-grid" class="baithak-videos-grid">
          <!-- Self, Remote tiles, and Invite card rendered here -->
        </div>

        <!-- Turn & Pipe Status Banner -->
        <div id="baithak-turn-banner" class="baithak-turn-banner">
          <div class="turn-info">
            <span id="turn-icon" class="turn-icon">💨</span>
            <span id="turn-text" class="turn-text">You hold the pipe. Take a drag!</span>
          </div>
          <div id="turn-actions" class="turn-actions">
            <!-- Dynamic turn buttons -->
          </div>
        </div>

        <!-- Quick Social Shout Reactions -->
        <div class="baithak-reactions">
          <button type="button" class="react-btn" data-reaction="🗣️ Bhai Pass Kar!">🗣️ Pass Kar!</button>
          <button type="button" class="react-btn" data-reaction="🔥 Kya Dum Maara!">🔥 Dum Maara!</button>
          <button type="button" class="react-btn" data-reaction="💨 Chhalla Bana!">💨 Ring!</button>
          <button type="button" class="react-btn" data-reaction="👏 Wah Wah!">👏 Wah!</button>
          <button type="button" class="react-btn" data-reaction="🍹 Cheers!">🍹 Cheers!</button>
          <button type="button" id="btn-open-voice-studio" class="react-btn voice-studio-btn" title="Record your own voice for reactions">🎙️ Custom Voice</button>
        </div>

        <!-- Media Toggles -->
        <div class="baithak-controls">
          <button type="button" id="btn-toggle-cam" class="media-ctrl-btn" title="Toggle Camera">📹 Cam On</button>
          <button type="button" id="btn-toggle-mic" class="media-ctrl-btn" title="Toggle Microphone">🎤 Mic On</button>
        </div>
      </div>
    `;
    document.body.appendChild(videoDock);

    // 2b. Voice Studio Dialog
    const voiceDialog = document.createElement('dialog');
    voiceDialog.id = 'voice-studio-dialog';
    voiceDialog.className = 'flavour-dialog voice-studio-dialog';
    voiceDialog.innerHTML = `
      <section class="flavour-card voice-studio-card">
        <div class="flavour-menu-top">
          <span class="flavour-eyebrow">Baithak Studio / Real Voice</span>
          <button id="voice-studio-close" class="flavour-close" type="button" aria-label="Close Voice Studio">×</button>
        </div>
        <h2 id="voice-studio-title">Record your <em>own voice.</em></h2>
        <p class="flavour-description">Record yourself shouting these phrases. When you click reaction buttons, your friends in the stream will hear your real voice!</p>

        <div class="voice-phrases-list">
          <div class="voice-phrase-item" data-key="pass">
            <div class="phrase-meta">
              <span class="phrase-name">🗣️ "Bhai Pass Kar!"</span>
              <span class="phrase-status" id="voice-status-pass">Default Voice</span>
            </div>
            <div class="phrase-actions">
              <button type="button" class="btn-voice-rec" data-key="pass">🔴 Record</button>
              <button type="button" class="btn-voice-play" data-key="pass">▶️ Play</button>
              <button type="button" class="btn-voice-reset" data-key="pass">↺ Reset</button>
            </div>
          </div>

          <div class="voice-phrase-item" data-key="dum">
            <div class="phrase-meta">
              <span class="phrase-name">🔥 "Kya Dum Maara!"</span>
              <span class="phrase-status" id="voice-status-dum">Default Voice</span>
            </div>
            <div class="phrase-actions">
              <button type="button" class="btn-voice-rec" data-key="dum">🔴 Record</button>
              <button type="button" class="btn-voice-play" data-key="dum">▶️ Play</button>
              <button type="button" class="btn-voice-reset" data-key="dum">↺ Reset</button>
            </div>
          </div>

          <div class="voice-phrase-item" data-key="ring">
            <div class="phrase-meta">
              <span class="phrase-name">💨 "Chhalla Bana!"</span>
              <span class="phrase-status" id="voice-status-ring">Default Voice</span>
            </div>
            <div class="phrase-actions">
              <button type="button" class="btn-voice-rec" data-key="ring">🔴 Record</button>
              <button type="button" class="btn-voice-play" data-key="ring">▶️ Play</button>
              <button type="button" class="btn-voice-reset" data-key="ring">↺ Reset</button>
            </div>
          </div>

          <div class="voice-phrase-item" data-key="wah">
            <div class="phrase-meta">
              <span class="phrase-name">👏 "Wah Wah!"</span>
              <span class="phrase-status" id="voice-status-wah">Default Voice</span>
            </div>
            <div class="phrase-actions">
              <button type="button" class="btn-voice-rec" data-key="wah">🔴 Record</button>
              <button type="button" class="btn-voice-play" data-key="wah">▶️ Play</button>
              <button type="button" class="btn-voice-reset" data-key="wah">↺ Reset</button>
            </div>
          </div>

          <div class="voice-phrase-item" data-key="cheer">
            <div class="phrase-meta">
              <span class="phrase-name">🍹 "Cheers!"</span>
              <span class="phrase-status" id="voice-status-cheer">Default Voice</span>
            </div>
            <div class="phrase-actions">
              <button type="button" class="btn-voice-rec" data-key="cheer">🔴 Record</button>
              <button type="button" class="btn-voice-play" data-key="cheer">▶️ Play</button>
              <button type="button" class="btn-voice-reset" data-key="cheer">↺ Reset</button>
            </div>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(voiceDialog);

    // 3. Floating Reactions Layer
    const reactionsLayer = document.createElement('div');
    reactionsLayer.id = 'baithak-reactions-layer';
    reactionsLayer.className = 'baithak-reactions-layer';
    reactionsLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(reactionsLayer);

    // 4. Attach Event Listeners
    this._attachEventListeners();
  }

  _attachEventListeners() {
    const dialog = document.getElementById('baithak-dialog');
    const closeBtn = document.getElementById('baithak-close');
    const tabCreate = document.getElementById('tab-create-room');
    const tabJoin = document.getElementById('tab-join-room');
    const secCreate = document.getElementById('section-create');
    const secJoin = document.getElementById('section-join');
    const btnStart = document.getElementById('btn-start-room');
    const btnEnter = document.getElementById('btn-enter-room');

    closeBtn?.addEventListener('click', () => dialog.close());

    tabCreate?.addEventListener('click', () => {
      tabCreate.classList.add('active');
      tabJoin.classList.remove('active');
      secCreate.hidden = false;
      secJoin.hidden = true;
    });

    tabJoin?.addEventListener('click', () => {
      tabJoin.classList.add('active');
      tabCreate.classList.remove('active');
      secJoin.hidden = false;
      secCreate.hidden = true;
    });

    btnStart?.addEventListener('click', () => {
      const name = document.getElementById('baithak-username')?.value.trim() || 'Lounge Host';
      this.createRoom(name);
    });

    btnEnter?.addEventListener('click', () => {
      const name = document.getElementById('baithak-username')?.value.trim() || 'Lounge Guest';
      const code = document.getElementById('baithak-code-input')?.value.trim();
      if (!code) {
        alert('Please enter a Baithak room code.');
        return;
      }
      this.joinRoom(code, name);
    });

    // Copy Invite Links
    const copyLinkHandler = () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('📋 Invite link copied to clipboard! Send it to your friends.');
      }).catch(() => {
        prompt('Copy this Baithak invite link:', url);
      });
    };

    document.getElementById('btn-copy-invite')?.addEventListener('click', copyLinkHandler);
    document.getElementById('btn-copy-link-banner')?.addEventListener('click', copyLinkHandler);

    // WhatsApp Share
    document.getElementById('btn-whatsapp-banner')?.addEventListener('click', () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      const text = encodeURIComponent(`Come sit with me in Dum Baar Hookah Baithak! 💨 Tap here to join our video lounge & smoke together: ${url}`);
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    });

    // Expand / Fullscreen Toggle
    document.getElementById('btn-toggle-expand')?.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      const dock = document.getElementById('baithak-dock');
      const btn = document.getElementById('btn-toggle-expand');
      if (dock) dock.classList.toggle('is-expanded', this.isExpanded);
      if (btn) btn.textContent = this.isExpanded ? '🗗 Dock' : '⛶ Expand';
    });

    // Leave Room
    document.getElementById('btn-leave-baithak')?.addEventListener('click', () => {
      if (confirm('Leave this Baithak room and return to solo lounge?')) {
        this.leaveRoom();
      }
    });

    // Toggle Camera
    document.getElementById('btn-toggle-cam')?.addEventListener('click', () => {
      this.toggleCamera();
    });

    // Toggle Mic
    document.getElementById('btn-toggle-mic')?.addEventListener('click', () => {
      this.toggleMic();
    });

    // Reactions with procedural audio shouts
    document.querySelectorAll('.react-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = btn.dataset.reaction || btn.textContent.trim();
        this.sendReaction(text);
      });
    });

    // Automatically claim the pipe if it's resting free on the table when clicking the hookah canvas
    const stage = document.getElementById('stage');
    if (stage) {
      stage.addEventListener('pointerdown', () => {
        if (this.isInRoom && !this.amIHolder() && (!this.pipeHolderId || this.pipeHolderId === 'none' || this.participants.size === 0)) {
          this.grabPipe();
        }
      });
    }

    // Add Baithak button in main header top-actions if not present
    const topActions = document.querySelector('.top-actions');
    if (topActions && !document.getElementById('btn-open-baithak')) {
      const baithakBtn = document.createElement('button');
      baithakBtn.id = 'btn-open-baithak';
      baithakBtn.className = 'audio-btn baithak-trigger-btn';
      baithakBtn.type = 'button';
      baithakBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <span>Baithak</span>
      `;
      baithakBtn.addEventListener('click', () => {
        if (this.isInRoom) {
          const dock = document.getElementById('baithak-dock');
          if (dock) {
            const isCurrentlyHidden = dock.hidden || dock.classList.contains('is-hidden') || dock.style.display === 'none';
            if (isCurrentlyHidden) {
              dock.hidden = false;
              dock.removeAttribute('hidden');
              dock.classList.remove('is-hidden');
              dock.style.display = 'flex';
            } else {
              dock.hidden = true;
              dock.setAttribute('hidden', '');
              dock.classList.add('is-hidden');
              dock.style.display = 'none';
            }
          }
        } else {
          this.openModal();
        }
      });
      topActions.insertBefore(baithakBtn, topActions.firstChild);
    }

    this._attachVoiceStudioListeners();
  }

  _attachVoiceStudioListeners() {
    const dialog = document.getElementById('voice-studio-dialog');
    const openBtn = document.getElementById('btn-open-voice-studio');
    const closeBtn = document.getElementById('voice-studio-close');

    openBtn?.addEventListener('click', () => {
      this._updateVoiceStudioStatus();
      dialog?.showModal();
    });

    closeBtn?.addEventListener('click', () => {
      dialog?.close();
    });

    let currentMediaRecorder = null;
    let recordingChunks = [];
    let activeKey = null;

    document.querySelectorAll('.btn-voice-rec').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
          currentMediaRecorder.stop();
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          recordingChunks = [];
          activeKey = key;
          currentMediaRecorder = new MediaRecorder(stream);

          currentMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordingChunks.push(e.data);
          };

          currentMediaRecorder.onstop = () => {
            const blob = new Blob(recordingChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result;
              localStorage.setItem(`dumbaar.custom_voice.${activeKey}`, base64Audio);
              btn.textContent = '🔴 Record';
              btn.classList.remove('is-recording');
              this._updateVoiceStudioStatus();
              this.showToast(`🎙️ Custom voice saved for ${activeKey}!`);
            };
            reader.readAsDataURL(blob);
          };

          currentMediaRecorder.start();
          btn.textContent = '⏹️ Stop';
          btn.classList.add('is-recording');
        } catch (err) {
          alert("Microphone permission needed to record voice: " + err.message);
        }
      });
    });

    document.querySelectorAll('.btn-voice-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (window.hookahAudio) {
          window.hookahAudio.playReactionSound(key);
        }
      });
    });

    document.querySelectorAll('.btn-voice-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        localStorage.removeItem(`dumbaar.custom_voice.${key}`);
        this._updateVoiceStudioStatus();
        this.showToast(`↺ Reset ${key} voice to default.`);
      });
    });
  }

  _updateVoiceStudioStatus() {
    ['pass', 'dum', 'ring', 'wah', 'cheer'].forEach(key => {
      const statusEl = document.getElementById(`voice-status-${key}`);
      const hasCustom = !!localStorage.getItem(`dumbaar.custom_voice.${key}`);
      if (statusEl) {
        statusEl.textContent = hasCustom ? '✨ Real Voice Active' : 'Studio Voice (Default)';
        statusEl.className = hasCustom ? 'phrase-status custom' : 'phrase-status';
      }
    });
  }

  openModal(prefillRoom = null) {
    const dialog = document.getElementById('baithak-dialog');
    if (!dialog) return;

    if (prefillRoom) {
      document.getElementById('tab-join-room')?.click();
      const codeInput = document.getElementById('baithak-code-input');
      if (codeInput) codeInput.value = prefillRoom.toUpperCase();
    }
    dialog.showModal();
  }

  closeModal() {
    document.getElementById('baithak-dialog')?.close();
  }

  _generateRoomCode() {
    const prefixes = ['ROYAL', 'SHISHA', 'DUM', 'LOUNGE', 'CLOUD', 'EMBER'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const n = Math.floor(100 + Math.random() * 900);
    return `${p}-${n}`;
  }

  async _getMediaStream() {
    // If localStream already has active audio, return it
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
        return this.localStream;
      }
    }

    const camEl = document.getElementById('cam');
    let videoTrack = null;

    // 1. If #cam already has an active camera stream, reuse its video track directly!
    if (camEl && camEl.srcObject && typeof camEl.srcObject.getVideoTracks === 'function') {
      const tracks = camEl.srcObject.getVideoTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        videoTrack = tracks[0];
      }
    }

    let audioTrack = null;
    try {
      // Request mic audio with echo cancellation & noise suppression
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMicMuted;
      }
    } catch (e) {
      console.warn("Microphone access unavailable or denied:", e);
    }

    if (this.localStream) {
      if (audioTrack) {
        this.localStream.addTrack(audioTrack);
        this._setupLocalAudioAnalyser();
        // Add to active media calls
        this.mediaCalls.forEach(call => {
          if (call.peerConnection) {
            try {
              call.peerConnection.addTrack(audioTrack, this.localStream);
            } catch (_) {}
          }
        });
      }
      return this.localStream;
    }

    if (videoTrack) {
      const tracks = [videoTrack];
      if (audioTrack) tracks.push(audioTrack);
      this.localStream = new MediaStream(tracks);
    } else {
      // If camera was not started yet, request both video and audio
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: audioTrack ? false : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (audioTrack) {
          this.localStream.addTrack(audioTrack);
        }
        if (camEl && (!camEl.srcObject || !camEl.srcObject.active)) {
          camEl.srcObject = this.localStream;
          camEl.play().catch(() => {});
        }
      } catch (err) {
        console.warn("Could not acquire camera+mic, falling back:", err);
        try {
          if (audioTrack) {
            this.localStream = new MediaStream([audioTrack]);
          } else {
            this.localStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true }
            });
          }
        } catch (_) {
          const canvas = document.createElement('canvas');
          canvas.width = 160; canvas.height = 120;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#2a2a2e'; ctx.fillRect(0, 0, 160, 120);
          this.localStream = canvas.captureStream(10);
        }
      }
    }

    this._setupLocalAudioAnalyser();
    return this.localStream;
  }

  _setupLocalAudioAnalyser() {
    if (!this.localStream) return;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      const localAudioStream = new MediaStream([audioTracks[0]]);
      const source = ctx.createMediaStreamSource(localAudioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      this._localAnalyser = { analyser, dataArray, isSpeaking: false, lastSpoke: 0 };
      if (!this._vadInterval) {
        this._startVadLoop();
      }
    } catch (e) {
      console.warn("Could not setup local VAD:", e);
    }
  }

  _attachRemoteAudio(peerId, remoteStream) {
    let container = document.getElementById('baithak-audio-streams');
    if (!container) {
      container = document.createElement('div');
      container.id = 'baithak-audio-streams';
      container.setAttribute('aria-hidden', 'true');
      container.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;';
      document.body.appendChild(container);
    }

    let audioEl = document.getElementById(`baithak-audio-${peerId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `baithak-audio-${peerId}`;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.muted = false; // Remote audio must be clearly audible
      audioEl.volume = 1.0;
      container.appendChild(audioEl);
    }

    if (audioEl.srcObject !== remoteStream) {
      audioEl.srcObject = remoteStream;
    }

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn(`[Baithak Audio] Autoplay waiting for user gesture for ${peerId}:`, err);
        if (!this._pendingAudioElements) this._pendingAudioElements = new Set();
        this._pendingAudioElements.add(audioEl);
      });
    }

    const p = this.participants.get(peerId);
    if (p) {
      p._audioEl = audioEl;
    }
  }

  _removeRemoteAudio(peerId) {
    const audioEl = document.getElementById(`baithak-audio-${peerId}`);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      } catch (_) {}
    }
    if (this._pendingAudioElements && audioEl) {
      this._pendingAudioElements.delete(audioEl);
    }
    if (this._audioAnalysers && this._audioAnalysers.has(peerId)) {
      this._audioAnalysers.delete(peerId);
    }
    this._setTileSpeakingState(peerId, false);
  }

  _monitorAudioActivity(peerId, stream) {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    try {
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;

      if (!this._audioAnalysers) this._audioAnalysers = new Map();
      if (this._audioAnalysers.has(peerId)) return;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      this._audioAnalysers.set(peerId, { analyser, dataArray, isSpeaking: false, lastSpoke: 0 });

      if (!this._vadInterval) {
        this._startVadLoop();
      }
    } catch (e) {
      console.warn("VAD monitoring error for", peerId, e);
    }
  }

  _startVadLoop() {
    this._vadInterval = setInterval(() => {
      if (!this.isInRoom) return;
      const now = performance.now();

      // 1. Remote peers voice activity
      if (this._audioAnalysers) {
        this._audioAnalysers.forEach((entry, peerId) => {
          entry.analyser.getByteFrequencyData(entry.dataArray);
          let sum = 0;
          for (let i = 0; i < entry.dataArray.length; i++) {
            sum += entry.dataArray[i];
          }
          const avg = sum / entry.dataArray.length;
          const wasSpeaking = entry.isSpeaking;
          const isSpeaking = avg > 12; // Voice presence threshold
          if (isSpeaking) {
            entry.lastSpoke = now;
            entry.isSpeaking = true;
          } else if (now - entry.lastSpoke > 400) {
            entry.isSpeaking = false;
          }

          if (wasSpeaking !== entry.isSpeaking) {
            this._setTileSpeakingState(peerId, entry.isSpeaking);
          }
        });
      }

      // 2. Local user speaking activity
      if (this._localAnalyser && !this.isMicMuted) {
        this._localAnalyser.analyser.getByteFrequencyData(this._localAnalyser.dataArray);
        let sum = 0;
        for (let i = 0; i < this._localAnalyser.dataArray.length; i++) {
          sum += this._localAnalyser.dataArray[i];
        }
        const avg = sum / this._localAnalyser.dataArray.length;
        const wasSpeaking = this._localAnalyser.isSpeaking;
        const isSpeaking = avg > 12;
        if (isSpeaking) {
          this._localAnalyser.lastSpoke = now;
          this._localAnalyser.isSpeaking = true;
        } else if (now - this._localAnalyser.lastSpoke > 400) {
          this._localAnalyser.isSpeaking = false;
        }

        if (wasSpeaking !== this._localAnalyser.isSpeaking) {
          this._setTileSpeakingState('self', this._localAnalyser.isSpeaking);
        }
      }
    }, 100);
  }

  _setTileSpeakingState(peerId, isSpeaking) {
    const tile = peerId === 'self'
      ? document.querySelector('.video-tile.self-tile')
      : document.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
    if (tile) {
      tile.classList.toggle('is-speaking', isSpeaking);
    }
  }

  _updateParticipantMicBadge(peerId, isMuted) {
    const tile = document.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
    if (tile) {
      const badge = tile.querySelector('.tile-mic-badge');
      if (badge) {
        badge.className = `tile-mic-badge ${isMuted ? 'muted' : 'active'}`;
        badge.textContent = isMuted ? '🔇' : '🎤';
        badge.title = isMuted ? 'Mic Muted' : 'Mic Live';
      }
    }
  }

  // 1. Create Room (Host)
  async createRoom(name) {
    this.myName = name || 'Lounge Host';
    localStorage.setItem('dumbaar.baithak.name', this.myName);
    this.roomId = this._generateRoomCode();
    this.isHost = true;
    this.pipeHolderId = 'self';
    this.pipeHolderName = this.myName;

    this.closeModal();
    this._dismissIntroSheet();
    this._setPipeHolder('self', this.myName);
    this.showToast(`Starting Baithak #${this.roomId}...`);
    await this._getMediaStream();

    const hostPeerId = `dumbaar-${this.roomId.toLowerCase()}-host`;
    this._initPeer(hostPeerId, () => {
      this.isInRoom = true;
      this._updateRoomUI();
      this.showToast(`🔥 Baithak #${this.roomId} started! Share link with friends.`);
      window.history.pushState(null, '', `?room=${this.roomId}`);

      // Host starts holding the pipe
      this._setPipeHolder('self', this.myName);
    });
  }

  // 2. Join Room (Guest)
  async joinRoom(roomId, name) {
    this.myName = name || 'Lounge Guest';
    localStorage.setItem('dumbaar.baithak.name', this.myName);
    this.roomId = roomId.toUpperCase().trim();
    this.isHost = false;

    this.closeModal();
    this._dismissIntroSheet();
    this.showToast(`Entering Baithak #${this.roomId}...`);
    await this._getMediaStream();

    const randSuffix = Math.random().toString(36).substring(2, 7);
    const guestPeerId = `dumbaar-${this.roomId.toLowerCase()}-p-${randSuffix}`;
    const hostPeerId = `dumbaar-${this.roomId.toLowerCase()}-host`;

    this._initPeer(guestPeerId, () => {
      this.isInRoom = true;
      this._updateRoomUI();
      window.history.pushState(null, '', `?room=${this.roomId}`);

      // Connect data channel to Host
      const conn = this.peer.connect(hostPeerId, {
        metadata: { name: this.myName, peerId: this.myPeerId }
      });
      this._handleConnection(conn);

      // Call Host video
      if (this.localStream) {
        const call = this.peer.call(hostPeerId, this.localStream, {
          metadata: { name: this.myName }
        });
        this._handleCall(call);
      }

      this.showToast(`Connected to Baithak #${this.roomId}!`);
    });
  }

  _initPeer(peerId, onOpen) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
    }

    if (typeof Peer === 'undefined') {
      alert("PeerJS library not loaded. Please reload the page.");
      return;
    }

    this.peer = new Peer(peerId, { debug: 1 });

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      onOpen();
    });

    this.peer.on('error', (err) => {
      console.error("PeerJS Error:", err);
      if (err.type === 'unavailable-id') {
        alert(`Room #${this.roomId} already has an active host. Try joining instead of creating.`);
      } else if (err.type === 'peer-unavailable') {
        this.showToast(`Host of room #${this.roomId} is not online yet.`);
      }
    });

    this.peer.on('connection', (conn) => {
      this._handleConnection(conn);
    });

    this.peer.on('call', async (call) => {
      const stream = await this._getMediaStream();
      call.answer(stream);
      this._handleCall(call);
    });
  }

  _handleConnection(conn) {
    conn.on('open', () => {
      const remotePeerId = conn.peer;
      const remoteName = conn.metadata?.name || 'Friend';
      this.connections.set(remotePeerId, conn);

      if (!this.participants.has(remotePeerId)) {
        this.participants.set(remotePeerId, { name: remoteName, isHolder: false, isMicMuted: false });
        this._renderVideoTiles();
      }

      if (this.isHost) {
        const participantsList = Array.from(this.participants.entries()).map(([pid, p]) => ({
          peerId: pid,
          name: p.name,
          isMicMuted: !!p.isMicMuted
        }));
        participantsList.push({ peerId: this.myPeerId, name: this.myName, isMicMuted: this.isMicMuted });

        conn.send({
          type: 'SYNC_STATE',
          pipeHolderId: this.pipeHolderId === 'self' ? this.myPeerId : this.pipeHolderId,
          pipeHolderName: this.pipeHolderName,
          participants: participantsList,
          flavour: window.__hookahScene?.flavour,
          hookah: window.__hookahScene?.body?.model?.id
        });

        this._broadcast({
          type: 'PEER_JOINED',
          peerId: remotePeerId,
          name: remoteName
        }, [remotePeerId]);
      }
    });

    conn.on('data', (data) => {
      this._handleDataMessage(conn.peer, data);
    });

    conn.on('close', () => {
      this._handlePeerDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn("Connection error with", conn.peer, err);
      this._handlePeerDisconnect(conn.peer);
    });
  }

  _handleCall(call) {
    const remotePeerId = call.peer;
    this.mediaCalls.set(remotePeerId, call);

    call.on('stream', (remoteStream) => {
      const p = this.participants.get(remotePeerId) || { name: call.metadata?.name || 'Friend', isMicMuted: false };
      p.stream = remoteStream;
      this.participants.set(remotePeerId, p);

      // 1. Maintain persistent unmuted <audio> element for remote audio playback
      this._attachRemoteAudio(remotePeerId, remoteStream);

      // 2. Setup speaking activity detector for this peer
      this._monitorAudioActivity(remotePeerId, remoteStream);

      this._renderVideoTiles();
      this._renderCenterStage();
    });

    call.on('close', () => {
      this._removeRemoteAudio(remotePeerId);
      this._handlePeerDisconnect(remotePeerId);
    });

    call.on('error', (err) => {
      console.warn("Media call error with", remotePeerId, err);
    });
  }

  _handlePeerDisconnect(peerId) {
    this._removeRemoteAudio(peerId);
    this.connections.delete(peerId);
    this.mediaCalls.delete(peerId);
    const p = this.participants.get(peerId);
    if (p) {
      this.showToast(`👋 ${p.name} left the Baithak.`);
      this.participants.delete(peerId);
    }

    if (this.pipeHolderId === peerId) {
      this._setPipeHolder('none', null);
      this.showToast("💨 The pipe is free on the table.");
    }

    this._renderVideoTiles();
    this._updateRoomUI();
  }

  _handleDataMessage(senderPeerId, data) {
    if (!data || !data.type) return;

    // Host forwards data messages to all other connected peers so room stays completely synchronized
    if (this.isHost) {
      this._broadcast(data, [senderPeerId]);
    }

    switch (data.type) {
      case 'SYNC_STATE':
        this.pipeHolderId = data.pipeHolderId === this.myPeerId ? 'self' : data.pipeHolderId;
        this.pipeHolderName = data.pipeHolderName;
        if (data.participants) {
          data.participants.forEach(p => {
            if (p.peerId !== this.myPeerId) {
              const existing = this.participants.get(p.peerId) || {};
              this.participants.set(p.peerId, {
                ...existing,
                name: p.name,
                isHolder: p.peerId === this.pipeHolderId,
                isMicMuted: !!p.isMicMuted
              });
            }
          });
        }
        if (data.flavour && window.__hookahScene) {
          window.__hookahScene.setFlavour(data.flavour);
        }
        this._renderVideoTiles();
        this._updateTurnBanner();
        break;

      case 'PEER_JOINED':
        this.participants.set(data.peerId, { name: data.name, isHolder: false });
        this.showToast(`🎉 ${data.name} joined the Baithak!`);
        this._renderVideoTiles();
        this._updateRoomUI();

        if (!this.isHost && this.localStream) {
          const call = this.peer.call(data.peerId, this.localStream, { metadata: { name: this.myName } });
          this._handleCall(call);
        }
        break;

      case 'DRAW_UPDATE':
        if (this.pipeHolderId === senderPeerId) {
          this.remoteDrawState = data.state;
          try {
            window.hookahAudio?.update(data.state);
            if (window.__hookahScene?.body) {
              if (data.state.state === 'drawing') {
                window.__hookahScene.body.coalGlow = Math.min(1, window.__hookahScene.body.coalGlow + 0.25);
              }
            }
          } catch (_) {}
        }
        break;

      case 'PASS_PIPE':
        const targetId = data.targetPeerId === this.myPeerId ? 'self' : data.targetPeerId;
        this._setPipeHolder(targetId, data.targetName);
        this.showToast(`➡️ Pipe passed to ${data.targetName}!`);
        try { window.hookahAudio?.playReactionSound('pass'); } catch (_) {}
        break;

      case 'REQUEST_PIPE':
        this.showToast(`🗣️ ${data.fromName}: Bhai Pass Kar!`);
        if (data.customAudio && window.hookahAudio) {
          window.hookahAudio.playAudioData(data.customAudio);
        } else if (window.hookahAudio) {
          window.hookahAudio.playReactionSound('🗣️ Bhai Pass Kar!');
        }
        this._showFloatingReaction('🗣️ Bhai Pass Kar!', data.fromName);
        if (this.amIHolder()) {
          this._updateTurnBanner();
        }
        break;

      case 'REACTION':
        if (data.customAudio && window.hookahAudio) {
          window.hookahAudio.playAudioData(data.customAudio);
        } else if (window.hookahAudio) {
          window.hookahAudio.playReactionSound(data.text);
        }
        this._showFloatingReaction(data.text, data.fromName);
        break;

      case 'RING':
        try {
          window.hookahAudio?.playRingChime();
          if (window.__hookahScene?.smoke) {
            window.__hookahScene.smoke.spawnRing(0.5, 0.45, 0, -1, 120);
          }
        } catch (_) {}
        break;

      case 'FLAVOUR_CHANGE':
        if (window.__hookahScene && data.flavour) {
          window.__hookahScene.setFlavour(data.flavour);
          this.showToast(`🍃 Bowl updated to ${data.flavour.name || 'New Blend'}!`);
        }
        break;

      case 'HOOKAH_CHANGE':
        if (window.__hookahScene && data.hookahId) {
          window.__hookahScene.body?.setModel(data.hookahId);
          this.showToast(`🫖 Hookah switched!`);
        }
        break;

      case 'MIC_STATUS':
        const targetP = this.participants.get(data.peerId);
        if (targetP) {
          targetP.isMicMuted = data.isMuted;
          this._updateParticipantMicBadge(data.peerId, data.isMuted);
        }
        break;
    }
  }

  _broadcast(data, excludePeerIds = []) {
    this.connections.forEach((conn, peerId) => {
      if (!excludePeerIds.includes(peerId) && conn.open) {
        conn.send(data);
      }
    });
  }

  // --- Pipe Sharing Logic ---

  amIHolder() {
    if (!this.isInRoom) return true;
    if (this.pipeHolderId === 'self') return true;
    if (this.participants.size === 0) return true;
    if (!this.pipeHolderId || this.pipeHolderId === 'none') return true;
    return false;
  }

  getRemoteDrawState() {
    return this.remoteDrawState;
  }

  getHolderVideoElement() {
    if (!this.isInRoom || this.amIHolder()) return null;
    const p = this.participants.get(this.pipeHolderId);
    if (!p) return null;
    if (p._videoEl && p._videoEl.readyState >= 2 && p._videoEl.videoWidth > 0) {
      return p._videoEl;
    }
    if (p.stream) {
      if (!p._videoEl) {
        const vid = document.createElement('video');
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = false;
        vid.srcObject = p.stream;
        vid.play().catch(() => {});
        p._videoEl = vid;
      }
      return p._videoEl;
    }
    return null;
  }

  sendLocalDrawState(state) {
    if (!this.isInRoom || !this.amIHolder()) return;
    const now = performance.now();
    if (now - this.lastDrawSend > 50) {
      this.lastDrawSend = now;
      this._broadcast({
        type: 'DRAW_UPDATE',
        state: {
          state: state.state,
          drawIntensity: state.drawIntensity,
          exhaleRate: state.exhaleRate,
          lung: state.lung
        }
      });
    }
  }

  sendRing() {
    if (!this.isInRoom) return;
    try { window.hookahAudio?.playRingChime(); } catch (_) {}
    this._broadcast({ type: 'RING' });
  }

  _getReactionKey(text) {
    const lower = String(text).toLowerCase();
    if (lower.includes('pass')) return 'pass';
    if (lower.includes('dum') || lower.includes('flame')) return 'dum';
    if (lower.includes('ring') || lower.includes('chhalla')) return 'ring';
    if (lower.includes('wah') || lower.includes('clap')) return 'wah';
    if (lower.includes('cheer')) return 'cheer';
    return 'pass';
  }

  sendReaction(text) {
    if (window.hookahAudio) {
      window.hookahAudio.playReactionSound(text);
    }
    this._showFloatingReaction(text, this.myName);
    if (this.isInRoom) {
      const key = this._getReactionKey(text);
      const customAudio = localStorage.getItem(`dumbaar.custom_voice.${key}`);
      this._broadcast({
        type: 'REACTION',
        text,
        fromName: this.myName,
        customAudio: customAudio || null
      });
    }
  }

  passPipeTo(targetPeerId, targetName) {
    this._setPipeHolder(targetPeerId === this.myPeerId ? 'self' : targetPeerId, targetName);
    try { window.hookahAudio?.playReactionSound('pass'); } catch (_) {}
    this._broadcast({
      type: 'PASS_PIPE',
      targetPeerId,
      targetName
    });
    this.showToast(`You passed the pipe to ${targetName}!`);
  }

  requestPipe() {
    if (this.amIHolder()) return;
    this.sendReaction('🗣️ Bhai Pass Kar!');
    this.showToast("🗣️ Bhai Pass Kar! Sent request to get the pipe back.");
    const customVoice = localStorage.getItem('dumbaar.custom_voice.pass');
    this._broadcast({
      type: 'REQUEST_PIPE',
      fromName: this.myName,
      customAudio: customVoice || null
    });
  }

  grabPipe() {
    this._setPipeHolder('self', this.myName);
    if (this.isInRoom && this.peer) {
      this._broadcast({
        type: 'PASS_PIPE',
        targetPeerId: this.myPeerId,
        targetName: this.myName
      });
    }
    this.showToast("🔥 You picked up the pipe!");
  }

  _setPipeHolder(holderId, holderName) {
    this.pipeHolderId = holderId;
    this.pipeHolderName = holderName || this.myName;
    this._renderVideoTiles();
    this._updateTurnBanner();
    this._renderCenterStage();
  }

  // --- UI Rendering ---

  _updateRoomUI() {
    const dock = document.getElementById('baithak-dock');
    const stage = document.getElementById('baithak-center-stage');
    if (!dock) return;
    if (this.isInRoom) {
      dock.hidden = false;
      dock.removeAttribute('hidden');
      dock.classList.remove('is-hidden');
      dock.style.display = 'flex';
      if (stage) {
        stage.hidden = false;
        stage.removeAttribute('hidden');
        stage.classList.remove('is-hidden');
        stage.style.display = 'block';
      }
    } else {
      dock.hidden = true;
      dock.setAttribute('hidden', '');
      dock.classList.add('is-hidden');
      dock.style.display = 'none';
      if (stage) {
        stage.hidden = true;
        stage.setAttribute('hidden', '');
        stage.classList.add('is-hidden');
        stage.style.display = 'none';
      }
    }

    const roomNameEl = document.getElementById('baithak-room-name');
    if (roomNameEl) roomNameEl.textContent = `#${this.roomId}`;

    const inviteCodeEl = document.getElementById('invite-code-display');
    if (inviteCodeEl) inviteCodeEl.textContent = this.roomId;

    const totalCount = this.participants.size + 1;
    const userCountEl = document.getElementById('baithak-user-count');
    if (userCountEl) userCountEl.textContent = `${totalCount} ${totalCount === 1 ? 'friend' : 'friends'}`;

    // Update main header button
    const headerBtn = document.getElementById('btn-open-baithak');
    if (headerBtn) {
      headerBtn.classList.add('in-room');
      headerBtn.innerHTML = `
        <span class="live-pulse"></span>
        <span>Baithak #${this.roomId}</span>
      `;
    }

    this._renderVideoTiles();
    this._updateTurnBanner();
    this._renderCenterStage();
  }

  _renderVideoTiles() {
    const grid = document.getElementById('baithak-videos-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Self Video Tile
    const selfTile = document.createElement('div');
    selfTile.className = `video-tile self-tile ${this.amIHolder() ? 'is-smoking' : ''}`;
    selfTile.dataset.peerId = 'self';
    selfTile.innerHTML = `
      <video id="baithak-self-video" autoplay playsinline muted></video>
      <div class="video-overlay">
        <div class="tile-meta-row">
          <span class="tile-name">${this.myName} (You)</span>
          <span class="tile-mic-badge ${this.isMicMuted ? 'muted' : 'active'}" title="${this.isMicMuted ? 'Mic Muted' : 'Mic Live'}">
            ${this.isMicMuted ? '🔇' : '🎤'}
          </span>
        </div>
        ${this.amIHolder() ? '<span class="pipe-badge">🔥 Holding Pipe</span>' : ''}
      </div>
    `;
    grid.appendChild(selfTile);

    const selfVideo = selfTile.querySelector('video');
    if (selfVideo && this.localStream) {
      selfVideo.srcObject = this.localStream;
      selfVideo.play().catch(() => {});
    }

    // 2. Remote Peers Tiles
    this.participants.forEach((p, peerId) => {
      const isHolder = this.pipeHolderId === peerId;
      const isMicMuted = !!p.isMicMuted;
      const tile = document.createElement('div');
      tile.className = `video-tile remote-tile ${isHolder ? 'is-smoking' : ''}`;
      tile.dataset.peerId = peerId;
      tile.innerHTML = `
        <video autoplay playsinline muted></video>
        <div class="video-overlay">
          <div class="tile-meta-row">
            <span class="tile-name">${p.name}</span>
            <span class="tile-mic-badge ${isMicMuted ? 'muted' : 'active'}" title="${isMicMuted ? 'Mic Muted' : 'Mic Live'}">
              ${isMicMuted ? '🔇' : '🎤'}
            </span>
          </div>
          ${isHolder ? '<span class="pipe-badge">🔥 Holding Pipe</span>' : ''}
        </div>
        ${this.amIHolder() ? `<button type="button" class="pass-direct-btn" data-peer="${peerId}" data-name="${p.name}">Pass ➡️</button>` : ''}
      `;
      grid.appendChild(tile);

      const vid = tile.querySelector('video');
      if (vid && p.stream) {
        vid.srcObject = p.stream;
        vid.play().catch(() => {});
      }

      // Ensure persistent unmuted audio is attached for this remote peer
      if (p.stream) {
        this._attachRemoteAudio(peerId, p.stream);
      }

      tile.querySelector('.pass-direct-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.passPipeTo(peerId, p.name);
      });
    });

    // 3. If only host or alone in room, show an inviting placeholder card
    if (this.participants.size === 0) {
      const inviteTile = document.createElement('div');
      inviteTile.className = 'video-tile invite-placeholder-tile';
      inviteTile.innerHTML = `
        <div class="invite-tile-content">
          <span class="invite-tile-icon">➕</span>
          <span class="invite-tile-text">Invite Friends</span>
          <span class="invite-tile-sub">Tap to copy link</span>
        </div>
      `;
      inviteTile.addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('📋 Link copied! Send on WhatsApp or chat.');
        }).catch(() => {
          prompt('Copy this Baithak link:', url);
        });
      });
      grid.appendChild(inviteTile);
    }

    this._renderCenterStage();
  }

  _renderCenterStage() {
    const stage = document.getElementById('baithak-center-stage');
    if (!stage) return;
    if (!this.isInRoom) {
      stage.hidden = true;
      stage.setAttribute('hidden', '');
      stage.classList.add('is-hidden');
      stage.style.display = 'none';
      return;
    }

    stage.hidden = false;
    stage.removeAttribute('hidden');
    stage.classList.remove('is-hidden');
    stage.style.display = 'block';

    const titleEl = document.getElementById('smoker-stage-title');
    const badgeEl = document.getElementById('smoker-stage-badge');
    const nameEl = document.getElementById('smoker-stage-name');
    const statusEl = document.getElementById('smoker-stage-status');
    const videoEl = document.getElementById('smoker-stage-video');
    const fallbackEl = document.getElementById('smoker-stage-fallback');
    const fallbackNameEl = document.getElementById('smoker-fallback-name');
    const actionsEl = document.getElementById('smoker-stage-actions');

    if (!actionsEl) return;
    actionsEl.innerHTML = '';

    if (this.amIHolder()) {
      if (titleEl) titleEl.textContent = '🔥 Your Turn (You have the Pipe)';
      if (badgeEl) {
        badgeEl.textContent = 'Active Smoker';
        badgeEl.className = 'spotlight-badge active-self';
      }
      if (nameEl) nameEl.textContent = `${this.myName} (You)`;
      if (statusEl) statusEl.textContent = '💨 Take a drag or pass control below';

      if (videoEl && this.localStream) {
        videoEl.style.display = 'block';
        if (fallbackEl) fallbackEl.style.display = 'none';
        videoEl.muted = true;
        if (videoEl.srcObject !== this.localStream) {
          videoEl.srcObject = this.localStream;
        }
      } else if (fallbackEl) {
        if (videoEl) videoEl.style.display = 'none';
        fallbackEl.style.display = 'flex';
        if (fallbackNameEl) fallbackNameEl.textContent = `${this.myName} (You)`;
      }

      if (this.participants.size > 0) {
        const passPrompt = document.createElement('div');
        passPrompt.className = 'stage-pass-prompt';
        passPrompt.innerHTML = `<span>Pass Hookah Controls to:</span>`;
        actionsEl.appendChild(passPrompt);

        const memberList = document.createElement('div');
        memberList.className = 'stage-member-list';

        this.participants.forEach((p, peerId) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-member-pass';
          btn.innerHTML = `<span class="pass-arrow">➡️</span> <strong>${p.name}</strong>`;
          btn.title = `Pass hookah control to ${p.name}`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.passPipeTo(peerId, p.name);
          });
          memberList.appendChild(btn);
        });
        actionsEl.appendChild(memberList);
      } else {
        const waitingNotice = document.createElement('div');
        waitingNotice.className = 'stage-waiting-notice';
        waitingNotice.innerHTML = `
          <div style="font-size:12px;color:#555550;line-height:1.4;margin-bottom:6px;">
            You hold the pipe! Drag on canvas or hold Space to smoke.
          </div>
          <button type="button" class="btn-stage-copy-link">
            📋 Copy Invite Link for Friends
          </button>
        `;
        waitingNotice.querySelector('.btn-stage-copy-link')?.addEventListener('click', () => {
          document.getElementById('btn-copy-invite')?.click();
        });
        actionsEl.appendChild(waitingNotice);
      }
    } else if (this.pipeHolderId && this.pipeHolderId !== 'none') {
      const smokerName = this.pipeHolderName || 'Friend';
      if (titleEl) titleEl.textContent = `💨 ${smokerName} is Smoking`;
      if (badgeEl) {
        badgeEl.textContent = 'Smoking Now';
        badgeEl.className = 'spotlight-badge active-friend';
      }
      if (nameEl) nameEl.textContent = smokerName;
      if (statusEl) statusEl.textContent = '🔥 Taking Dum...';

      const friendParticipant = this.participants.get(this.pipeHolderId);
      if (videoEl && friendParticipant?.stream) {
        videoEl.style.display = 'block';
        if (fallbackEl) fallbackEl.style.display = 'none';
        videoEl.muted = true; // Video element is muted; audio streams cleanly via dedicated audio element
        if (videoEl.srcObject !== friendParticipant.stream) {
          videoEl.srcObject = friendParticipant.stream;
        }
        videoEl.play().catch(() => {});
      } else if (fallbackEl) {
        if (videoEl) videoEl.style.display = 'none';
        fallbackEl.style.display = 'flex';
        if (fallbackNameEl) fallbackNameEl.textContent = smokerName;
      }

      const reqBtn = document.createElement('button');
      reqBtn.type = 'button';
      reqBtn.className = 'btn-hero-pass-request';
      reqBtn.innerHTML = `🗣️ Bhai Pass Kar! <span class="req-sub">(Ask turn back)</span>`;
      reqBtn.addEventListener('click', () => {
        this.requestPipe();
      });
      actionsEl.appendChild(reqBtn);
    } else {
      if (titleEl) titleEl.textContent = '🫖 Pipe is on the Table';
      if (badgeEl) {
        badgeEl.textContent = 'Available';
        badgeEl.className = 'spotlight-badge';
      }
      if (nameEl) nameEl.textContent = 'Dum Baar';
      if (statusEl) statusEl.textContent = 'Pipe is resting. Grab to smoke';
      if (fallbackEl) {
        if (videoEl) videoEl.style.display = 'none';
        fallbackEl.style.display = 'flex';
        if (fallbackNameEl) fallbackNameEl.textContent = 'Hookah Ready';
      }

      const grabBtn = document.createElement('button');
      grabBtn.type = 'button';
      grabBtn.className = 'btn-hero-pass-request';
      grabBtn.textContent = '🔥 Pick Up Pipe (Take Turn)';
      grabBtn.addEventListener('click', () => {
        this.grabPipe();
      });
      actionsEl.appendChild(grabBtn);
    }
  }

  _updateTurnBanner() {
    const banner = document.getElementById('baithak-turn-banner');
    const textEl = document.getElementById('turn-text');
    const iconEl = document.getElementById('turn-icon');
    const actionsEl = document.getElementById('turn-actions');
    if (!banner || !textEl || !actionsEl) return;

    actionsEl.innerHTML = '';

    if (this.amIHolder()) {
      banner.className = 'baithak-turn-banner my-turn';
      iconEl.textContent = '🔥';

      if (this.participants.size > 0) {
        textEl.textContent = 'Your turn! Pass hookah control to:';

        const memberChips = document.createElement('div');
        memberChips.className = 'banner-member-chips';
        this.participants.forEach((p, pid) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-member-pass-chip';
          btn.innerHTML = `<span>➡️</span> <strong>${p.name}</strong>`;
          btn.title = `Pass hookah control to ${p.name}`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.passPipeTo(pid, p.name);
          });
          memberChips.appendChild(btn);
        });
        actionsEl.appendChild(memberChips);
      } else {
        textEl.textContent = 'You hold the pipe! Drag with mouse or hold Space to smoke.';

        const passGuidance = document.createElement('div');
        passGuidance.className = 'pass-guidance';
        passGuidance.style.width = '100%';
        passGuidance.innerHTML = `
          <div style="font-size:11px;color:#737367;line-height:1.4;margin:3px 0 6px;">
            👥 <strong>How to pass pipe:</strong> Share your room link with friends. When a friend joins, a <strong>"Pass Pipe ➡️"</strong> button appears right here and in the spotlight!
          </div>
          <button type="button" class="btn btn-cta btn-pass-share" style="width:100%;font-size:11px;padding:6px 12px;border-radius:999px;">
            📋 Copy Invite Link to Send Friend
          </button>
        `;
        passGuidance.querySelector('.btn-pass-share')?.addEventListener('click', () => {
          document.getElementById('btn-copy-invite')?.click();
        });
        actionsEl.appendChild(passGuidance);
      }
    } else if (this.pipeHolderId && this.pipeHolderId !== 'none') {
      banner.className = 'baithak-turn-banner other-turn';
      iconEl.textContent = '💨';
      textEl.textContent = `${this.pipeHolderName || 'Friend'} has the pipe...`;

      const reqBtn = document.createElement('button');
      reqBtn.type = 'button';
      reqBtn.className = 'btn-request-pipe btn-bhai-pass';
      reqBtn.textContent = '🗣️ Bhai Pass Kar!';
      reqBtn.addEventListener('click', () => this.requestPipe());
      actionsEl.appendChild(reqBtn);
    } else {
      banner.className = 'baithak-turn-banner free-pipe';
      iconEl.textContent = '🫖';
      textEl.textContent = 'Pipe is resting on the table.';

      const grabBtn = document.createElement('button');
      grabBtn.type = 'button';
      grabBtn.className = 'btn-grab-pipe';
      grabBtn.textContent = 'Grab Pipe ✋';
      grabBtn.addEventListener('click', () => this.grabPipe());
      actionsEl.appendChild(grabBtn);
    }
  }

  _showFloatingReaction(text, author) {
    const layer = document.getElementById('baithak-reactions-layer');
    if (!layer) return;

    const bubble = document.createElement('div');
    bubble.className = 'floating-reaction';
    bubble.innerHTML = `<strong>${author}:</strong> <span>${text}</span>`;
    bubble.style.left = `${15 + Math.random() * 65}%`;
    layer.appendChild(bubble);

    setTimeout(() => {
      bubble.remove();
    }, 3800);
  }

  showToast(msg) {
    const toast = document.getElementById('flavour-toast') || document.getElementById('hookah-toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 3200);
    }
  }

  toggleCamera() {
    if (!this.localStream) return;
    this.isCamMuted = !this.isCamMuted;
    this.localStream.getVideoTracks().forEach(t => t.enabled = !this.isCamMuted);
    const btn = document.getElementById('btn-toggle-cam');
    if (btn) {
      btn.classList.toggle('muted', this.isCamMuted);
      btn.textContent = this.isCamMuted ? '📹 Cam Off' : '📹 Cam On';
    }
  }

  async toggleMic() {
    // If localStream doesn't exist or has no audio track, try acquiring it
    if (!this.localStream || this.localStream.getAudioTracks().length === 0) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const track = stream.getAudioTracks()[0];
        if (track) {
          if (!this.localStream) {
            this.localStream = new MediaStream([track]);
          } else {
            this.localStream.addTrack(track);
          }
          this._setupLocalAudioAnalyser();
          this.mediaCalls.forEach(call => {
            if (call.peerConnection) {
              try {
                call.peerConnection.addTrack(track, this.localStream);
              } catch (_) {}
            }
          });
        }
      } catch (err) {
        alert("Microphone permission needed: " + err.message);
        return;
      }
    }

    this.isMicMuted = !this.isMicMuted;
    this.localStream.getAudioTracks().forEach(t => {
      t.enabled = !this.isMicMuted;
    });

    const btn = document.getElementById('btn-toggle-mic');
    if (btn) {
      btn.classList.toggle('muted', this.isMicMuted);
      btn.innerHTML = this.isMicMuted ? '🔇 Mic Muted' : '🎤 Mic On';
    }

    // Update self tile mic badge
    const selfBadge = document.querySelector('.self-tile .tile-mic-badge');
    if (selfBadge) {
      selfBadge.className = `tile-mic-badge ${this.isMicMuted ? 'muted' : 'active'}`;
      selfBadge.textContent = this.isMicMuted ? '🔇' : '🎤';
      selfBadge.title = this.isMicMuted ? 'Mic Muted' : 'Mic Live';
    }

    // Broadcast to room
    if (this.isInRoom) {
      this._broadcast({
        type: 'MIC_STATUS',
        peerId: this.myPeerId,
        isMuted: this.isMicMuted
      });
    }

    this.showToast(this.isMicMuted ? '🔇 Microphone muted' : '🎤 Microphone live (Friends can hear you)');
  }

  leaveRoom() {
    this.isInRoom = false;
    this.isExpanded = false;

    // Stop local audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => t.stop());
    }

    // Remove all remote audio elements
    const audioContainer = document.getElementById('baithak-audio-streams');
    if (audioContainer) {
      audioContainer.innerHTML = '';
      audioContainer.remove();
    }

    // Stop voice activity detection loop and clear analysers
    if (this._vadInterval) {
      clearInterval(this._vadInterval);
      this._vadInterval = null;
    }
    if (this._audioAnalysers) {
      this._audioAnalysers.clear();
    }
    this._localAnalyser = null;
    if (this._pendingAudioElements) {
      this._pendingAudioElements.clear();
    }

    this.connections.forEach(c => c.close());
    this.mediaCalls.forEach(c => c.close());
    this.connections.clear();
    this.mediaCalls.clear();
    this.participants.clear();

    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }

    const dock = document.getElementById('baithak-dock');
    if (dock) {
      dock.hidden = true;
      dock.setAttribute('hidden', '');
      dock.classList.add('is-hidden');
      dock.style.display = 'none';
      dock.classList.remove('is-expanded');
    }

    const headerBtn = document.getElementById('btn-open-baithak');
    if (headerBtn) {
      headerBtn.classList.remove('in-room');
      headerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <span>Baithak</span>
      `;
    }

    window.history.pushState(null, '', window.location.pathname);
    this.showToast("Left the Baithak room. Returned to Solo Lounge.");
  }
}

window.hookahBaithak = new BaithakManager();
