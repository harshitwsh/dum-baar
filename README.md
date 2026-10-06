# 💨 Dum Baar — The Royal Hookah Lounge & Virtual Shisha Simulator

An interactive, browser-based luxury hookah lounge simulator that runs with realistic fluid physics, binaural water bubbling audio synthesis, and hands-free computer vision.

Smoke an illustrated hookah using your **hands** via your webcam, or use **direct mouse & touch dragging**.

Crafted with ♥ by **[Harshit Yadav](https://github.com/harshitwsh)**.

---

## ✨ Features

### 1. 🫖 10 Iconic Hookah Models
Rendered procedurally in real-time HTML5 Canvas with custom downstems, water illumination, and glowing embers:
1. **The Classic Baithak** — Traditional ribbed brass stem with royal indigo cut-crystal jar.
2. **Crimson Flare** — Contemporary Russian flare with crimson anodized aluminum and trumpet base.
3. **Crystal Teardrop** — European lead crystal with mirror-polished surgical steel tray and marbled stem.
4. **Imperial Sheesh Mahal** — Squat cut crystal vase with jade-toned bowl and gold filigree.
5. **Kohl Stealth** — Matte obsidian black stem, dark smoke glass base, and rose-gold accents.
6. **Haryana Heritage** — Raw hammered brass desi baithak with rope-wound stem and terracotta chilm.
7. **Khalil Mamoon Pharonie** — Authentic Egyptian tri-metal hand-engraved brass & copper bell jar.
8. **Steamulation Pro X** — German heavy CNC surgical stainless steel with 360° click-lock and frosted base.
9. **Turkish Elmas Nargile** — Ottoman antique cast brass with authentic leather marpuch hose and wide copper tray.
10. **Lavoo All-Glass Borosilicate** — Laboratory-grade hand-blown glass sculpture with floating spiral downstem.

---

### 2. 🍓 30 Market Flavours & Custom Bowl Mixer
Includes all world-renowned flavours from **Al Fakher, Starbuzz, Adalya, Tangiers, Afzal, Fumari, and traditional lounges**:

* **Classics**: Classic House Blend, Double Apple (Do Seeb), Gum Cinnamon.
* **Mint & Chill**: Mint Freeze (Cane Mint), Nimbu Pudina, Icy Grapefruit Splash.
* **Royal & Desi**: Paan Raas (Paan Nights), Zafrani Paan Supreme, Kesar Elaichi, Rooh Afza Velvet, Kala Khatta Jamun, Thandai Holi Bliss, Rose Velvet.
* **Fruity & Exotic**: Blue Mist, Love 66, Lady Killer, Watermelon Chill, Grape Mint, Mango Sunset (Alphonso), Peach Iced Tea, Guava Mint, Black Currant Bramble, Lychee Frost, Strawberry Margarita.
* **Sweet & Creamy**: White Gummy Bear, Chai Sutta (Tapri Kadak), Gulab Jamun & Pistachio, Coconut Palms, Turkish Coffee & Cardamom, Blueberry Vanilla Muffin.

#### 🥣 2-Flavour Bowl Mixing Ritual
* Mix any two flavours with a dynamic proportion slider (e.g. 70% Paan + 30% Mint).
* **Live Oklab Color Blending** calculates realistic perceptual water lighting and smoke tinting.
* **Surprise Me** button serves curated house combinations (e.g. *The Bombay Masala*, *Dubai Nights*, *Miami Vice*).
* **Share Your Bowl** generates a shareable link (`?flavour=paan+mint@70`).

---

### 3. 👥 Online Multiplayer Baithak (Hookah Circle with Video Call)
Sit together with friends in a real-time virtual hookah lounge:
* **WebRTC Live Video & Audio**: Live peer-to-peer webcam & microphone communication directly in the browser (powered by PeerJS with zero account setup).
* **Pass The Pipe Ritual**: True social hookah etiquette — one friend holds the pipe at a time. Click **"Pass Pipe ➡️"** to pass to any friend in the circle, or **"Request Next 🙋‍♂️"** to ask for your turn.
* **Synchronized Physics & Audio**: When the pipe holder inhales, bubbling water sounds and glowing coals synchronize live on all friends' screens. When they exhale, smoke billows across the shared lounge.
* **Instant Invite Links**: Generate private rooms (`?room=ROYAL-492`) and invite up to 6 friends with one click.
* **Social Lounge Reactions**: Tap quick shoutouts that float on screen (🗣️ *"Bhai Pass Kar!"*, 🔥 *"Kya Dum Maara!"*, 💨 *"Chhalla Bana!"*, 👏 *"Wah!"*, 🍹 *"Cheers!"*).

---

### 4. 🎮 Dual Control Modes

#### Mode A: Camera AI (Hands & Face Tracking)
* Powered by Google MediaPipe Tasks Vision.
* Close your hand around the hose mouthpiece to pick it up.
* Bring it to your mouth to draw smoke with bubbling water.
* Move the pipe away and blow into the air to exhale thick smoke clouds.
* Shape your fingers or purse your lips to blow toroidal smoke rings (**chhalla**).
* Fallback architecture: Automatically loads from Google Cloud Storage CDN if local weights are not cached.

#### Mode B: Mouse, Touch & Keyboard Mode
* Drag the mouthpiece directly on touchscreen or with a mouse.
* Hold **`Spacebar`** to inhale / draw smoke and bubble the water.
* Release **`Spacebar`** to exhale billowing clouds.
* Click or tap anywhere on smoke clouds to trigger spinning smoke rings.

---

### 4. 🔊 Realistic Web Audio Synthesizer
* Procedural audio built with the HTML5 Web Audio API (zero audio files needed).
* **Draw**: Dynamic bubbling water frequency sweeps (150Hz – 480Hz) and filtered splash pops.
* **Exhale**: Low-pass filtered noise modulated by exhalation intensity.
* **Smoke Rings**: Resonant crystal chime when rings are formed.
* Audio toggle button and quick mute shortcut (**`M`** key).

---

### 5. ⌨️ Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| **`Space`** | Hold to inhale/draw smoke; release to exhale |
| **`M`** | Toggle sound on / mute |
| **`R`** | Reset lounge scene and hose |
| **`F`** | Open Flavour Collection menu |
| **`H`** | Open Hookah Rack menu |

---

## 🚀 Running Locally

No build tools or heavy dependencies required. Run with any static HTTP server:

```bash
# Using Python
python3 -m http.server 8080

# Or using Node
npx serve .
```

Open `http://localhost:8080` in your web browser.

---

## 🌐 Deploy to Vercel / GitHub Pages

### Deploy to Vercel
```bash
npx vercel
```

### Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings > Pages**.
3. Under **Branch**, select `main` and `/ (root)`.
4. Click **Save**. Your site will be live instantly!

---

## ⚖️ Legal & Age Verification
* **18+ Only**: This application is a 100% digital entertainment simulation.
* Contains **zero tobacco, zero nicotine, and zero coal**.
* *Smoking is injurious to health.*
