# TCV SRT Fixer — Adobe Premiere Pro Extension Panel

A precision Subtitle Quality Control (QC), Timecode Integrity, and AI Rewriting extension panel for **Adobe Premiere Pro** (tested and compatible with Premiere Pro CC 2020 through **2024, 2025, 2026, and 2027+**).

Built directly from the specification and engine of [`tcv-srt-fixer.ai.studio`](https://tcv-srt-fixer.ai.studio/).

---

## Key Features

### 1. Direct Premiere Pro Timeline Integration & 0-Finder Workflow
- **⚡ 1-Click Auto-Detect:** In Premiere's Text panel, click `...` > *Export to SRT file*. Then in TCV SRT Fixer, click **⚡ Auto-Detect Latest SRT**. The panel finds the exported file and loads it immediately—no manual file browsing required.
- **Auto-Apply & Rewrite on Timeline:** Exports the conformed and AI-cleaned subtitles with strict Windows CRLF compliance, organizes them in a `TCV_Captions` project bin, and generates a new, aligned caption track directly on your active sequence timeline using Premiere Pro's ExtendScript API.
- **Sequence Timecode Sync:** Automatically detects active sequence frame rate, zero point, and dimensions.

### 2. Timecode Integrity & Collision Detection
- **Auto-Resolve Collisions:** Detects timestamp overlaps where Cue $N$'s end time touches or violates Cue $N+1$'s start time and automatically enforces the broadcast-standard **80ms gap** (approx. 2 frames at 24/25fps).
- **Integer Millisecond Precision:** Uses exact integer millisecond math to permanently eliminate floating-point rounding errors and invalid 4-digit milliseconds at boundaries (`.9995s`).
- **Inverted / Zero-Duration Repair:** Fixes anomalous cues where end time $\le$ start time.
- **Minimum Duration Extender:** Extends short cues ($< 0.8\text{s}$) to meet readability requirements when space allows.

### 3. CPL (Characters Per Line) Compliance & Smart Reflow
- **Presets:** Quick-switch between **37 CPL** (Netflix, BBC, Broadcast standard) and **42 CPL** (YouTube, Social).
- **Intelligent Semantic Line-Wrapping:** Splits lines using grammatical pauses (periods, commas, conjunctions) rather than breaking mid-phrase.

### 4. Reading Speed & CPS Analysis
- Computes real-time **Characters Per Second (CPS)**.
- Flags cues exceeding recommended reading speeds ($> 20\text{ CPS}$).

### 5. High-Performance Architecture for Large Transcripts
- **Event Delegation:** High-performance delegated event handling that effortlessly handles feature-length transcripts (1,500+ subtitle cues) with zero memory leaks and $O(1)$ cue selection.
- **Triple-Layer Resilient File I/O:** Multi-tier file writing across Node.js `fs`, native Adobe `window.cep.fs`, and ExtendScript disk I/O with automatic folder provisioning (`TCV_Captions/`).

### 6. AI Precision QC & Smart Rewriter
- Built-in integration with **Google Gemini** (`gemini-3.8-flash`, `gemini-3.8-flash-lite`, `gemini-3.6-flash`) and **OpenAI** (`gpt-4o-mini`, `gpt-4o`).
- **Batched Processing:** Fast 35-cue streaming batches with real-time progress indicators, 40-second timeout recovery, and instant cancellation.
- **Glossary Protection:** Strict preservation of proper nouns, company names, speaker names, and technical terms.
- **Word-by-Word Diff Viewer:** Highlights every added, removed, or changed word with instant click-to-revert.

### 7. Video Preview & Title Safe Overlays
- Real-time caption preview with SMPTE **80% Title Safe** and **90% Action Safe** guidelines.

---

## Installation Guide (For You & Teammates)

### 1-Click Install via Git (Recommended)

#### On macOS
```bash
git clone https://github.com/rrtarara-commits/tcv-srt-fixer-panel.git
cd tcv-srt-fixer-panel
chmod +x install.sh
./install.sh
```

#### On Windows
```cmd
git clone https://github.com/rrtarara-commits/tcv-srt-fixer-panel.git
cd tcv-srt-fixer-panel
install.bat
```

> **Note:** The installers automatically copy panel files to the Adobe CEP extensions directory and enable `PlayerDebugMode` across CSXS versions 9 through 20 (guaranteeing compatibility with Premiere Pro 2024, 2025, 2026, and 2027+).

### Updating to the Latest Version
If you already have the repository cloned, simply run:
```bash
# macOS
git pull && ./install.sh

# Windows
git pull && install.bat
```

### Manual Installation (If Preferred)
Copy the `tcv-srt-fixer-panel` folder to your Adobe CEP directory:
- **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/com.tcv.srtfixer/`
- **Windows:** `%APPDATA%\Adobe\CEP\extensions\com.tcv.srtfixer\`

---

## How to Use

1. **Open the Panel:** In Premiere Pro, open `Window > Extensions > TCV SRT Fixer`. Dock it alongside your Text or Essential Graphics panel.
2. **Load Captions:**
   - In Premiere's **Text panel** (under *Captions*), click `...` &rarr; **Export to SRT file**.
   - In the TCV SRT Fixer panel, click **⚡ Auto-Detect Latest SRT**. It loads your subtitles instantly!
   - *(Optional: You can also drag and drop any `.srt` file directly onto the panel, pick from the project bin dropdown, or paste raw text).*
3. **Review Audit KPIs:**
   - Check the top metric cards for **Collisions**, **>37 CPL**, or **>20 CPS**. Click any card to filter only the offending cues.
4. **Auto-Conform:**
   - Click **⚡ Auto-Conform All** to fix overlapping timecodes, conform to 80ms broadcast gaps, wrap long lines, and clean curly quotes.
5. **Run AI QC (Optional):**
   - Switch to the **AI Rewriter** tab.
   - Enter your Gemini or OpenAI API key.
   - Add sensitive terms or speaker names to the **Glossary**.
   - Click **Run AI QC & Grammar Fix**.
6. **Apply Back to Timeline:**
   - Click **Export & Sync > Apply & Create Caption Track on Timeline**.
   - The panel automatically writes the cleaned file to `[Project]/TCV_Captions/`, imports it into Premiere Pro, and places a new caption track directly onto your sequence!

