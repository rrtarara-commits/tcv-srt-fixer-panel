===========================================================================
  TCV SRT FIXER — ADOBE PREMIERE PRO EXTENSION (v1.1)
  Team Installation & Quick-Start Guide
===========================================================================

Compatible with Adobe Premiere Pro 2024, 2025, 2026, and 2027+ (macOS & Windows)


---------------------------------------------------------------------------
1. HOW TO INSTALL (NO CODING OR TERMINAL REQUIRED)
---------------------------------------------------------------------------

ON MAC (macOS):
  1. Open this folder in Finder.
  2. Double-click "Install-Mac.command".
     * TIP: If macOS shows a security prompt ("cannot be opened because it is
       from an unidentified developer"), simply RIGHT-CLICK (or Control-Click)
       on "Install-Mac.command" and select "Open" -> "Open".
  3. A window will pop up, install the panel, and say "[SUCCESS]".
  4. Restart Adobe Premiere Pro.

ON WINDOWS (Windows 10 / 11):
  1. If this folder is inside a .zip file, Extract/Unzip it first.
  2. Double-click "Install-Windows.bat".
  3. Restart Adobe Premiere Pro.


---------------------------------------------------------------------------
2. HOW TO OPEN THE PANEL IN PREMIERE PRO
---------------------------------------------------------------------------

  1. Open your project in Adobe Premiere Pro.
  2. In the top menu bar, go to:
     Window > Extensions > TCV SRT Fixer
  3. Dock the panel wherever you like (it works great in both square and
     wide horizontal layouts).


---------------------------------------------------------------------------
3. DAILY WORKFLOW (HOW TO USE)
---------------------------------------------------------------------------

STEP 1: Load Your Captions (0-Finder Workflow)
  - In Premiere Pro's "Text" panel (under the "Captions" tab), click the
    "..." (3 dots) menu in the top right -> "Export to SRT file".
  - In the TCV SRT Fixer panel, click the green "⚡ Auto-Detect Latest SRT"
    button. Your captions will load immediately!
  - (Alternatively, you can drag-and-drop any .srt file straight into the
    panel, choose one from the Project Bin dropdown, or click "Browse File").

STEP 2: Inspect & Auto-Conform
  - Look at the compact metric pills right below the 16:9 Safe Zone preview:
      * Segments: Total number of subtitle segments.
      * Overlaps: Segments whose end time touches or overlaps the next
        segment (needs an 80ms / ~2-frame gap so captions don't flicker).
      * >37 Characters Per Line: Lines that are too wide for the screen.
        (Choose 37 for Broadcast/Netflix or 42 for YouTube/Social).
      * >20 Characters Per Second: Segments that disappear too fast to read.
  - Click any metric pill to filter the vertical caption list on the right.
  - Click the blue "⚡ Auto-Conform All" button to automatically resolve all
    overlaps, wrap long lines at natural grammatical pauses, and clean quotes.

STEP 3: Edit Text or Run AI Grammar QC (Optional)
  - Click directly inside any caption segment on the right to edit text live.
  - Optional AI Rewriter: Go to the "AI Rewriter" tab, paste a Google Gemini
    or OpenAI API key, add any protected proper nouns to the Glossary, and
    click "Run AI QC & Grammar Fix".

STEP 4: Sync Back to Your Premiere Timeline
  - Click "Sync to Premiere ->" in the bottom right (or go to the "Export & Sync"
    tab) and click "✔ Apply & Create Caption Track on Timeline".
  - The panel automatically saves a clean SRT into a "TCV_Captions" folder next
    to your Premiere project, imports it into your Project Bin, and drops a new
    synced caption track straight onto your active sequence!
