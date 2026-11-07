# TCV SRT Fixer — Adobe Premiere Pro Extension Panel

A precision Subtitle Quality Control (QC), Timecode Integrity, and AI Rewriting extension panel for **Adobe Premiere Pro** (compatible with Premiere Pro CC 2020 through 2025/2026+).

Built directly from the specification and engine of [`tcv-srt-fixer.ai.studio`](https://tcv-srt-fixer.ai.studio/).

---

## Key Features

### 1. Direct Premiere Pro Timeline Integration
- **Import from Project Bin:** Automatically scans your project items for `.srt` files and loads them with one click.
- **Auto-Apply & Rewrite on Timeline:** Exports the conformed and AI-cleaned subtitles, automatically organizes them in a `TCV QC Captions` bin, and generates a new, aligned caption track on your active sequence timeline using Premiere Pro's ExtendScript API.
- **Sequence Timecode Sync:** Automatically detects active sequence frame rate, zero point, and dimensions.

### 2. Timecode Integrity & Collision Detection
- **Auto-Resolve Collisions:** Detects timestamp overlaps where Cue $N$'s end time exceeds or touches Cue $N+1$'s start time and automatically enforces the broadcast-standard **80ms gap** (approx. 2 frames at 24/25fps).
- **Inverted / Zero-Duration Repair:** Fixes anomalous cues where end time $\le$ start time.
- **Minimum Duration Extender:** Extends short cues ($< 0.8\text{s}$) to meet readability requirements when space allows.

### 3. CPL (Characters Per Line) Compliance & Smart Reflow
- **Presets:** Quick-switch between **37 CPL** (Netflix, BBC, Broadcast standard) and **42 CPL** (YouTube, Social).
- **Intelligent Semantic Line-Wrapping:** Splits lines using grammatical pauses (periods, commas, conjunctions) rather than breaking mid-phrase.

### 4. Reading Speed & CPS Analysis
- Computes real-time **Characters Per Second (CPS)**.
- Flags cues exceeding recommended reading speeds ($> 20\text{ CPS}$).

### 5. AI Precision QC & Smart Rewriter
- Built-in integration with **Google Gemini** (`gemini-3.8-flash`, `gemini-3.8-flash-lite`, `gemini-3.6-flash`) or **OpenAI** (`gpt-4o-mini`, `gpt-4o`). Auto-fallbacks for retired model IDs.
- **Glossary Protection:** Strict preservation of proper nouns, company names, speaker names, and technical terms.
- **Domain Context:** Tailors terminology to your project's specific niche.
- **Word-by-Word Diff Viewer:** Highlights every added, removed, or changed word with instant click-to-revert.

### 6. Video Preview & Title Safe Overlays
- Real-time caption preview with SMPTE **80% Title Safe** and **90% Action Safe** guidelines.

---

## Panel File Structure

```
tcv-srt-fixer-panel/
├── CSXS/
│   └── manifest.xml          # Extension definition and host compatibility (PPRO 14.0 - 99.9)
├── css/
│   └── style.css             # Adobe Spectrum dark theme styling
├── js/
│   ├── CSInterface.js        # Official Adobe CEP v11 communication bridge
│   └── app.js                # Core QC engine, SRT parser, diff renderer, AI connector
├── jsx/
│   └── hostscript.jsx        # ExtendScript backend for project bin scanning & timeline caption track creation
├── index.html                # Panel user interface
├── .debug                    # Remote debugging port (8088)
├── install.sh                # Automated 1-click installer for macOS / Linux
├── install.bat               # Automated 1-click installer for Windows
└── README.md
```

---

## Installation Guide

### macOS
1. Open Terminal and navigate to the extension folder:
   ```bash
   cd /path/to/tcv-srt-fixer-panel
   chmod +x install.sh
   ./install.sh
   ```
2. Restart Adobe Premiere Pro.
3. Open Premiere Pro and go to:
   **`Window` > `Extensions` > `TCV SRT Fixer`**.

### Windows
1. Double-click `install.bat` (or run in Command Prompt).
2. Restart Adobe Premiere Pro.
3. Go to:
   **`Window` > `Extensions` > `TCV SRT Fixer`**.

### Manual Installation (If Preferred)
Copy the `tcv-srt-fixer-panel` folder to your Adobe CEP directory:
- **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/com.tcv.srtfixer/`
- **Windows:** `%APPDATA%\Adobe\CEP\extensions\com.tcv.srtfixer\`

Enable unsigned extensions (Developer Mode):
- **macOS (Terminal):**
  ```bash
  defaults write com.adobe.CSXS.11 PlayerDebugMode 1
  defaults write com.adobe.CSXS.12 PlayerDebugMode 1
  ```
- **Windows (Regedit):**
  Add string value `PlayerDebugMode = "1"` in `HKEY_CURRENT_USER\Software\Adobe\CSXS.11` and `CSXS.12`.

---

## How to Use

1. **Open the Panel:** In Premiere Pro, open `Window > Extensions > TCV SRT Fixer`. Dock it alongside your Text or Essential Graphics panel.
2. **Load Captions:**
   - Select an existing `.srt` file from the **Project Bin dropdown**, OR
   - Click **Browse File** to pick a file from disk, OR
   - Click **Paste SRT** to paste raw subtitle text.
3. **Review Audit KPIs:**
   - Check the top metric cards for **Collisions**, **>37 CPL**, or **>20 CPS**. Click any metric card to filter only the offending cues.
4. **Auto-Conform:**
   - Click **⚡ Auto-Conform All** to fix overlapping timecodes, conform to 80ms gaps, wrap long lines, and clean curly quotes.
5. **Run AI QC (Optional):**
   - Switch to the **AI Rewriter** tab.
   - Enter your Gemini or OpenAI API key.
   - Add any sensitive terms to the **Glossary**.
   - Click **Run AI QC & Grammar Fix**.
6. **Apply Back to Timeline:**
   - Click **Export & Sync > Apply & Create Caption Track on Timeline**.
   - The panel automatically writes the cleaned file, imports it into Premiere Pro, and places a new caption track directly onto your sequence!
