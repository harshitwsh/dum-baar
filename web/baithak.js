// Dum Baar — Online Multiplayer Hookah Baithak (Virtual Lounge with Video Calls & Turn-Based Pipe Sharing)
// Built with WebRTC (PeerJS) for real-time peer-to-peer video, audio, and pipe physics synchronization.

class BaithakManager {
  constructor() {
    this.peer = null;
    this.myPeerId = null;
    this.roomId = null;
    this.myName = localStorage.getItem('dumbaar.baithak.name') || 'Lounge Guest';
    this.isHost = false;
    this.isInRoom = false;
    this.localStream = null;
    this.connections = new Map(); // peerId -> DataConnection
    this.mediaCalls = new Map();   // peerId -> MediaConnection
    this.participants = new Map(); // peerId -> { name, isHolder, stream, videoEl }
    this.pipeHolderId = null;
    this.pipeHolderName = null;
    this.lastDrawSend = 0;
    this.remoteDrawState = null;
    this.isCamMuted = false;
    this.isMicMuted = false;
    this.requestQueue = [];

    this._initUI();
    this._checkURLRoom();
  }

  _initUI() {
    // Check if baithak elements exist in DOM or inject them
    this._injectModalAndDock();
  }

  _checkURLRoom() {
    // If room param is in URL, auto-prompt join dialog
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
      setTimeout(() => {
        this.openModal(room);
      }, 600);
    }
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
            <label for="baithak-username">Your Name</label>
            <input type="text" id="baithak-username" class="baithak-input" placeholder="e.g. Harshit" value="${this.myName}" maxlength="24">
          </div>

          <div class="baithak-tab-choice">
            <button type="button" id="tab-create-room" class="btn btn-cta active">Create Room</button>
            <button type="button" id="tab-join-room" class="btn btn-subtle">Join With Code</button>
          </div>

          <div id="section-create" class="baithak-section">
            <p class="baithak-hint">Create a private virtual lounge and invite your friends with a link.</p>
            <button type="button" id="btn-start-room" class="btn btn-cta">Start Baithak Room 🔥</button>
          </div>

          <div id="section-join" class="baithak-section" hidden>
            <div class="form-group">
              <label for="baithak-code-input">Baithak Room Code</label>
              <input type="text" id="baithak-code-input" class="baithak-input" placeholder="e.g. ROYAL-842" uppercase>
            </div>
            <button type="button" id="btn-enter-room" class="btn btn-cta">Join Room 💨</button>
          </div>
        </div>

        <p class="fine">Runs directly browser-to-browser via secure WebRTC. No logins or accounts needed.</p>
      </section>
    `;
    document.body.appendChild(dialog);

    // 2. In-Call Video Bar (floating on the right/top of the screen)
    const videoDock = document.createElement('aside');
    videoDock.id = 'baithak-dock';
    videoDock.className = 'baithak-dock';
    videoDock.hidden = true;
    videoDock.innerHTML = `
      <div class="baithak-header-pill">
        <div class="baithak-room-badge">
          <span class="live-dot"></span>
          <span id="baithak-room-name">Baithak</span>
          <span id="baithak-user-count" class="user-count">1 friend</span>
        </div>
        <div class="baithak-header-actions">
          <button type="button" id="btn-copy-invite" class="baithak-pill-btn" title="Copy Invite Link">🔗 Invite</button>
          <button type="button" id="btn-leave-baithak" class="baithak-pill-btn danger" title="Leave Lounge">Leave</button>
        </div>
      </div>

      <div id="baithak-videos-grid" class="baithak-videos-grid">
        <!-- Local and Remote video tiles rendered here -->
      </div>

      <!-- Turn & Pipe Status Banner -->
      <div id="baithak-turn-banner" class="baithak-turn-banner">
        <div class="turn-info">
          <span id="turn-icon" class="turn-icon">💨</span>
          <span id="turn-text" class="turn-text">You hold the pipe. Take a drag!</span>
        </div>
        <div id="turn-actions" class="turn-actions">
          <!-- Action buttons (Pass pipe, Request pipe) injected here -->
        </div>
      </div>

      <!-- Quick Social Reactions Bar -->
      <div class="baithak-reactions">
        <button type="button" class="react-btn" data-reaction="🗣️ Bhai Pass Kar!">🗣️ Pass Kar!</button>
        <button type="button" class="react-btn" data-reaction="🔥 Kya Dum Maara!">🔥 Dum Maara!</button>
        <button type="button" class="react-btn" data-reaction="💨 Chhalla Bana!">💨 Ring!</button>
        <button type="button" class="react-btn" data-reaction="👏 Wah Wah!">👏 Wah!</button>
        <button type="button" class="react-btn" data-reaction="🍹 Cheers!">🍹 Cheers!</button>
      </div>

      <!-- Media controls for self -->
      <div class="baithak-controls">
        <button type="button" id="btn-toggle-cam" class="media-ctrl-btn" title="Toggle Camera">📹 Cam</button>
        <button type="button" id="btn-toggle-mic" class="media-ctrl-btn" title="Toggle Microphone">🎤 Mic</button>
      </div>
    `;
    document.body.appendChild(videoDock);

    // 3. Floating Reactions Canvas Overlay
    const reactionsLayer = document.createElement('div');
    reactionsLayer.id = 'baithak-reactions-layer';
    reactionsLayer.className = 'baithak-reactions-layer';
    reactionsLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(reactionsLayer);

    // 4. Hook up DOM Event Listeners
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
      const name = document.getElementById('baithak-username')?.value.trim() || 'Lounge Guest';
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

    // Copy Invite Link
    document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('📋 Invite link copied! Send it to your friends.');
      }).catch(() => {
        prompt('Copy this Baithak link:', url);
      });
    });

    // Leave Room
    document.getElementById('btn-leave-baithak')?.addEventListener('click', () => {
      if (confirm('Leave this Baithak room?')) {
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

    // Reactions
    document.querySelectorAll('.react-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.reaction;
        this.sendReaction(text);
      });
    });

    // Add Baithak button in main header top-actions
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
          // Toggle video dock visibility
          const dock = document.getElementById('baithak-dock');
          if (dock) dock.hidden = !dock.hidden;
        } else {
          this.openModal();
        }
      });
      topActions.insertBefore(baithakBtn, topActions.firstChild);
    }
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

  // Generate clean 4-character room code (e.g. "ROYAL-492")
  _generateRoomCode() {
    const prefixes = ['ROYAL', 'SHISHA', 'DUM', 'LOUNGE', 'CLOUD', 'EMBER'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const n = Math.floor(100 + Math.random() * 900);
    return `${p}-${n}`;
  }

  async _getMediaStream() {
    if (this.localStream) return this.localStream;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      console.warn("Could not get webcam+audio, trying audio only:", e);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn("Media denied, proceeding with canvas dummy stream:", err);
        // Create 1x1 black canvas stream so WebRTC call still functions
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 160, 120);
        this.localStream = canvas.captureStream(10);
      }
    }
    return this.localStream;
  }

  // 1. Create Room (Host)
  async createRoom(name) {
    this.myName = name || 'Lounge Host';
    localStorage.setItem('dumbaar.baithak.name', this.myName);
    this.roomId = this._generateRoomCode();
    this.isHost = true;
    this.pipeHolderId = 'self';
    this.pipeHolderName = this.myName;

    this.showToast(`Setting up Baithak #${this.roomId}...`);
    await this._getMediaStream();

    const hostPeerId = `dumbaar-${this.roomId.toLowerCase()}-host`;
    this._initPeer(hostPeerId, () => {
      this.isInRoom = true;
      this.closeModal();
      this._updateRoomUI();
      this.showToast(`🔥 Baithak #${this.roomId} started! Share the link with friends.`);
      window.history.pushState(null, '', `?room=${this.roomId}`);

      // Host starts with pipe
      this._setPipeHolder('self', this.myName);
    });
  }

  // 2. Join Room (Guest)
  async joinRoom(roomId, name) {
    this.myName = name || 'Lounge Guest';
    localStorage.setItem('dumbaar.baithak.name', this.myName);
    this.roomId = roomId.toUpperCase().trim();
    this.isHost = false;

    this.showToast(`Joining Baithak #${this.roomId}...`);
    await this._getMediaStream();

    const randSuffix = Math.random().toString(36).substring(2, 7);
    const guestPeerId = `dumbaar-${this.roomId.toLowerCase()}-p-${randSuffix}`;
    const hostPeerId = `dumbaar-${this.roomId.toLowerCase()}-host`;

    this._initPeer(guestPeerId, () => {
      this.isInRoom = true;
      this.closeModal();
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

    this.peer = new Peer(peerId, {
      debug: 1
    });

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

    // Listen for incoming data connections
    this.peer.on('connection', (conn) => {
      this._handleConnection(conn);
    });

    // Listen for incoming media calls
    this.peer.on('call', (call) => {
      call.answer(this.localStream);
      this._handleCall(call);
    });
  }

  _handleConnection(conn) {
    conn.on('open', () => {
      const remotePeerId = conn.peer;
      const remoteName = conn.metadata?.name || 'Friend';
      this.connections.set(remotePeerId, conn);

      if (!this.participants.has(remotePeerId)) {
        this.participants.set(remotePeerId, { name: remoteName, isHolder: false });
        this._renderVideoTiles();
      }

      // If Host: send state sync to new peer
      if (this.isHost) {
        const participantsList = Array.from(this.participants.entries()).map(([pid, p]) => ({
          peerId: pid,
          name: p.name
        }));
        participantsList.push({ peerId: this.myPeerId, name: this.myName });

        conn.send({
          type: 'SYNC_STATE',
          pipeHolderId: this.pipeHolderId === 'self' ? this.myPeerId : this.pipeHolderId,
          pipeHolderName: this.pipeHolderName,
          participants: participantsList,
          flavour: window.__hookahScene?.flavour,
          hookah: window.__hookahScene?.body?.model?.id
        });

        // Broadcast to existing peers about new joiner
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
      const p = this.participants.get(remotePeerId) || { name: call.metadata?.name || 'Friend' };
      p.stream = remoteStream;
      this.participants.set(remotePeerId, p);
      this._renderVideoTiles();
    });

    call.on('close', () => {
      this._handlePeerDisconnect(remotePeerId);
    });
  }

  _handlePeerDisconnect(peerId) {
    this.connections.delete(peerId);
    this.mediaCalls.delete(peerId);
    const p = this.participants.get(peerId);
    if (p) {
      this.showToast(`👋 ${p.name} left the Baithak.`);
      this.participants.delete(peerId);
    }

    // If disconnected user had the pipe, release pipe
    if (this.pipeHolderId === peerId) {
      this._setPipeHolder('none', null);
      this.showToast("💨 The pipe is free on the table.");
    }

    this._renderVideoTiles();
    this._updateRoomUI();
  }

  _handleDataMessage(senderPeerId, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'SYNC_STATE':
        this.pipeHolderId = data.pipeHolderId === this.myPeerId ? 'self' : data.pipeHolderId;
        this.pipeHolderName = data.pipeHolderName;
        if (data.participants) {
          data.participants.forEach(p => {
            if (p.peerId !== this.myPeerId) {
              this.participants.set(p.peerId, { name: p.name, isHolder: p.peerId === this.pipeHolderId });
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

        // Connect media to new peer if not host
        if (!this.isHost && this.localStream) {
          const call = this.peer.call(data.peerId, this.localStream, { metadata: { name: this.myName } });
          this._handleCall(call);
        }
        break;

      case 'DRAW_UPDATE':
        // Synchronize remote smoking state
        if (this.pipeHolderId === senderPeerId) {
          this.remoteDrawState = data.state;
          // Trigger bubbling audio and glowing coals
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
        break;

      case 'REQUEST_PIPE':
        this.showToast(`🙋‍♂️ ${data.fromName} requested the pipe next!`);
        if (this.amIHolder()) {
          this._updateTurnBanner();
        }
        break;

      case 'REACTION':
        this._showFloatingReaction(data.text, data.fromName);
        break;

      case 'RING':
        try {
          window.hookahAudio?.playRingChime();
          // Spawn smoke ring in center
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
    return this.pipeHolderId === 'self';
  }

  getRemoteDrawState() {
    return this.remoteDrawState;
  }

  sendLocalDrawState(state) {
    if (!this.isInRoom || !this.amIHolder()) return;
    const now = performance.now();
    if (now - this.lastDrawSend > 50) { // Throttle to 20 updates/sec
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
    this._broadcast({ type: 'RING' });
  }

  sendReaction(text) {
    this._showFloatingReaction(text, this.myName);
    if (this.isInRoom) {
      this._broadcast({
        type: 'REACTION',
        text,
        fromName: this.myName
      });
    }
  }

  passPipeTo(targetPeerId, targetName) {
    this._setPipeHolder(targetPeerId === this.myPeerId ? 'self' : targetPeerId, targetName);
    this._broadcast({
      type: 'PASS_PIPE',
      targetPeerId,
      targetName
    });
    this.showToast(`You passed the pipe to ${targetName}!`);
  }

  requestPipe() {
    if (this.amIHolder()) return;
    this.showToast("🙋‍♂️ You requested the pipe next!");
    this._broadcast({
      type: 'REQUEST_PIPE',
      fromName: this.myName
    });
  }

  grabPipe() {
    this.passPipeTo(this.myPeerId, this.myName);
  }

  _setPipeHolder(holderId, holderName) {
    this.pipeHolderId = holderId;
    this.pipeHolderName = holderName || this.myName;
    this._renderVideoTiles();
    this._updateTurnBanner();
  }

  // --- UI Rendering ---

  _updateRoomUI() {
    const dock = document.getElementById('baithak-dock');
    if (!dock) return;
    dock.hidden = !this.isInRoom;

    document.getElementById('baithak-room-name').textContent = `#${this.roomId}`;
    const totalCount = this.participants.size + 1;
    document.getElementById('baithak-user-count').textContent = `${totalCount} ${totalCount === 1 ? 'friend' : 'friends'}`;

    // Update main header button badge
    const headerBtn = document.getElementById('btn-open-baithak');
    if (headerBtn) {
      headerBtn.classList.add('in-room');
      headerBtn.innerHTML = `
        <span class="live-dot"></span>
        <span>Baithak #${this.roomId}</span>
      `;
    }

    this._renderVideoTiles();
    this._updateTurnBanner();
  }

  _renderVideoTiles() {
    const grid = document.getElementById('baithak-videos-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Self Video Tile
    const selfTile = document.createElement('div');
    selfTile.className = `video-tile self-tile ${this.amIHolder() ? 'is-smoking' : ''}`;
    selfTile.innerHTML = `
      <video id="baithak-self-video" autoplay playsinline muted></video>
      <div class="video-overlay">
        <span class="tile-name">${this.myName} (You)</span>
        ${this.amIHolder() ? '<span class="pipe-badge">🔥 Holding Pipe</span>' : ''}
      </div>
    `;
    grid.appendChild(selfTile);

    const selfVideo = selfTile.querySelector('video');
    if (selfVideo && this.localStream) {
      selfVideo.srcObject = this.localStream;
    }

    // 2. Remote Peers Tiles
    this.participants.forEach((p, peerId) => {
      const isHolder = this.pipeHolderId === peerId;
      const tile = document.createElement('div');
      tile.className = `video-tile remote-tile ${isHolder ? 'is-smoking' : ''}`;
      tile.innerHTML = `
        <video autoplay playsinline></video>
        <div class="video-overlay">
          <span class="tile-name">${p.name}</span>
          ${isHolder ? '<span class="pipe-badge">🔥 Holding Pipe</span>' : ''}
        </div>
        ${this.amIHolder() ? `<button type="button" class="pass-direct-btn" data-peer="${peerId}" data-name="${p.name}">Pass ➡️</button>` : ''}
      `;
      grid.appendChild(tile);

      const vid = tile.querySelector('video');
      if (vid && p.stream) {
        vid.srcObject = p.stream;
      }

      // Quick pass button on video tile
      tile.querySelector('.pass-direct-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.passPipeTo(peerId, p.name);
      });
    });
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
      textEl.textContent = 'Your turn! Take a drag or pass to a friend.';

      // Generate Pass Options
      if (this.participants.size > 0) {
        const passSelect = document.createElement('select');
        passSelect.className = 'pass-select';
        passSelect.innerHTML = `<option value="" disabled selected>Pass pipe to...</option>` +
          Array.from(this.participants.entries()).map(([pid, p]) => `<option value="${pid}">${p.name}</option>`).join('');

        passSelect.addEventListener('change', (e) => {
          const targetId = e.target.value;
          const targetName = this.participants.get(targetId)?.name || 'Friend';
          this.passPipeTo(targetId, targetName);
        });
        actionsEl.appendChild(passSelect);
      }
    } else if (this.pipeHolderId && this.pipeHolderId !== 'none') {
      banner.className = 'baithak-turn-banner other-turn';
      iconEl.textContent = '💨';
      textEl.textContent = `${this.pipeHolderName || 'Friend'} has the pipe...`;

      const reqBtn = document.createElement('button');
      reqBtn.type = 'button';
      reqBtn.className = 'btn-request-pipe';
      reqBtn.textContent = 'Request Next 🙋‍♂️';
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
    bubble.style.left = `${20 + Math.random() * 60}%`;
    layer.appendChild(bubble);

    setTimeout(() => {
      bubble.remove();
    }, 4000);
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
    if (btn) btn.classList.toggle('muted', this.isCamMuted);
  }

  toggleMic() {
    if (!this.localStream) return;
    this.isMicMuted = !this.isMicMuted;
    this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMicMuted);
    const btn = document.getElementById('btn-toggle-mic');
    if (btn) btn.classList.toggle('muted', this.isMicMuted);
  }

  leaveRoom() {
    this.isInRoom = false;
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
    if (dock) dock.hidden = true;

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
