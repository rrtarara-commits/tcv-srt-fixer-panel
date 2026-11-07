/*************************************************************************
 * TCV SRT Fixer - Premiere Pro Extension Panel Core Application
 * Complete Subtitle QC, Timecode Integrity & Timeline Rewriting Engine
 *************************************************************************/

(function () {
  'use strict';

  // State Management
  const state = {
    cues: [],
    originalCues: [],
    activeFilter: 'all', // 'all', 'collision', 'cpl', 'cps', 'modified'
    selectedCueId: null,
    targetCpl: 37,
    minGapMs: 80,
    minDurationSec: 0.8,
    activeSequence: null,
    projectSrtFiles: [],
    apiKey: localStorage.getItem('tcv_api_key') || '',
    aiProvider: localStorage.getItem('tcv_ai_provider') || 'gemini', // 'gemini' or 'openai'
    aiModel: (() => {
      let m = localStorage.getItem('tcv_ai_model');
      if (!m || m === 'gemini-1.5-flash' || m === 'gemini-1.5-pro' || m === 'gemini-flash') {
        m = 'gemini-2.0-flash';
        localStorage.setItem('tcv_ai_model', m);
      }
      return m;
    })(),
    glossary: localStorage.getItem('tcv_glossary') || '',
    context: localStorage.getItem('tcv_context') || ''
  };

  let csInterface = null;
  try {
    if (typeof CSInterface !== 'undefined') {
      csInterface = new CSInterface();
    }
  } catch (e) {
    console.warn('CSInterface not available (running in browser mode).', e);
  }

  // --- Utility Functions: Universal Timecodes & Seconds ---
  function parseTimecode(tc, defaultFps = 24) {
    if (!tc) return 0;
    tc = tc.trim();
    // 1. Milliseconds format: HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS,mmm
    if (/[,.]\d{1,3}$/.test(tc)) {
      const parts = tc.replace(',', '.').split(':');
      if (parts.length === 3) {
        return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      } else if (parts.length === 2) {
        return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
      }
    }
    // 2. SMPTE Frame format: HH:MM:SS:FF or HH:MM:SS;FF (common in Premiere Pro)
    const frameParts = tc.split(/[:;]/);
    if (frameParts.length === 4) {
      const h = parseInt(frameParts[0], 10) || 0;
      const m = parseInt(frameParts[1], 10) || 0;
      const s = parseInt(frameParts[2], 10) || 0;
      const f = parseInt(frameParts[3], 10) || 0;
      return h * 3600 + m * 60 + s + (f / defaultFps);
    } else if (frameParts.length === 3) {
      const m = parseInt(frameParts[0], 10) || 0;
      const s = parseInt(frameParts[1], 10) || 0;
      const f = parseInt(frameParts[2], 10) || 0;
      return m * 60 + s + (f / defaultFps);
    }
    return 0;
  }

  function formatTimecode(seconds) {
    const s = Math.max(0, seconds || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);

    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  }

  // --- Typography Normalizer ---
  function normalizeTypography(text) {
    if (!text) return '';
    return text
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/[\u2013\u2014]/g, ' - ')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  // --- Smart Line Breaking for CPL ---
  function smartLineWrap(text, maxCpl) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxCpl) return clean;

    const words = clean.split(' ');
    if (words.length <= 1) return clean;

    let bestSplit = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < words.length - 1; i++) {
      const line1 = words.slice(0, i + 1).join(' ');
      const line2 = words.slice(i + 1).join(' ');

      if (line1.length > maxCpl * 1.25 || line2.length > maxCpl * 1.25) continue;

      let score = 0;
      const lastWord = words[i];
      if (/[.?!]$/.test(lastWord)) score += 50;
      else if (/[,;:—]$/.test(lastWord)) score += 35;
      else if (/^(and|but|or|so|yet|because|that|which|when|where)$/i.test(words[i + 1])) score += 20;

      // Penalize imbalance between lines
      const balancePenalty = Math.abs(line1.length - line2.length) * 0.5;
      score -= balancePenalty;

      // Penalize exceeding target CPL
      if (line1.length > maxCpl) score -= (line1.length - maxCpl) * 4;
      if (line2.length > maxCpl) score -= (line2.length - maxCpl) * 4;

      if (score > bestScore) {
        bestScore = score;
        bestSplit = i;
      }
    }

    if (bestSplit !== -1) {
      return words.slice(0, bestSplit + 1).join(' ') + '\n' + words.slice(bestSplit + 1).join(' ');
    }

    // Fallback: simple greedy word wrap
    let lines = [];
    let curLine = '';
    for (let w of words) {
      if ((curLine + ' ' + w).trim().length <= maxCpl) {
        curLine = (curLine + ' ' + w).trim();
      } else {
        if (curLine) lines.push(curLine);
        curLine = w;
      }
    }
    if (curLine) lines.push(curLine);
    return lines.slice(0, 2).join('\n');
  }

  // --- Universal Caption Parser (SRT, VTT, and Premiere Text Panel Clipboard) ---
  function parseSRT(raw) {
    if (!raw || !raw.trim()) return [];
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const allLines = normalized.split('\n');

    const parsedCues = [];
    // Range matches: "00:00:01,000 --> 00:00:03,000" OR "00:00:01:12 - 00:00:03:15" OR tab separated
    const timeRangeRegex = /((?:\d{1,2}:)?\d{1,2}:\d{1,2}[,.:;]\d{1,3})\s*(?:-->|-|\t)\s*((?:\d{1,2}:)?\d{1,2}:\d{1,2}[,.:;]\d{1,3})/;

    let autoId = 1;
    let currentCue = null;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (!line) {
        if (currentCue && currentCue.textLines.length > 0) {
          finalizeCue(currentCue);
          parsedCues.push(currentCue);
          currentCue = null;
        }
        continue;
      }

      // Check if line contains a timecode range
      const match = line.match(timeRangeRegex);
      if (match) {
        if (currentCue) {
          finalizeCue(currentCue);
          parsedCues.push(currentCue);
        }

        const rawStart = match[1];
        const rawEnd = match[2];
        const remaining = line.replace(match[0], '').trim();

        currentCue = {
          id: autoId++,
          originalId: autoId - 1,
          rawStart: rawStart,
          rawEnd: rawEnd,
          textLines: remaining ? [remaining] : []
        };
      } else if (currentCue) {
        // Skip pure index numbers at start of blocks
        if (/^\d+$/.test(line) && currentCue.textLines.length === 0) {
          continue;
        }
        currentCue.textLines.push(line);
      }
    }

    if (currentCue && currentCue.textLines.length > 0) {
      finalizeCue(currentCue);
      parsedCues.push(currentCue);
    }

    function finalizeCue(cue) {
      const startSec = parseTimecode(cue.rawStart);
      const endSec = parseTimecode(cue.rawEnd);
      cue.startSec = startSec;
      cue.endSec = endSec;
      cue.startTime = formatTimecode(startSec);
      cue.endTime = formatTimecode(endSec);
      cue.originalText = cue.textLines.join('\n');
      cue.currentText = cue.originalText;
      cue.isModified = false;
      delete cue.textLines;
      delete cue.rawStart;
      delete cue.rawEnd;
    }

    recalcMetrics(parsedCues);
    return parsedCues;
  }

  // --- Recalculate Metrics & Violations for Cues ---
  function recalcMetrics(cues) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const dur = Math.max(0.01, cue.endSec - cue.startSec);
      cue.durationSec = parseFloat(dur.toFixed(2));

      const lines = cue.currentText.split('\n').map(l => l.trim()).filter(Boolean);
      cue.lineCount = lines.length || 1;
      cue.cpl = lines.reduce((max, l) => Math.max(max, l.length), 0);

      const charCount = cue.currentText.replace(/\s+/g, ' ').trim().length;
      cue.cps = parseFloat((charCount / dur).toFixed(1));

      // Warnings
      cue.hasCplWarning = cue.cpl > state.targetCpl;
      cue.hasCpsWarning = cue.cps > 20.0;
      cue.hasShortDuration = cue.durationSec < state.minDurationSec;

      // Overlap checking with next cue
      if (i < cues.length - 1) {
        const nextCue = cues[i + 1];
        cue.gapMs = Math.round((nextCue.startSec - cue.endSec) * 1000);
        cue.hasCollision = cue.gapMs < 0 || cue.endSec >= nextCue.startSec;
      } else {
        cue.gapMs = 9999;
        cue.hasCollision = false;
      }

      cue.isModified = (cue.originalText.trim() !== cue.currentText.trim()) ||
                       (cue.startSec !== cue._origStartSec) ||
                       (cue.endSec !== cue._origEndSec);
    }
  }

  // --- Format Cues back to SRT ---
  function formatSRT(cues) {
    return cues.map((c, idx) => {
      return `${idx + 1}\r\n${c.startTime} --> ${c.endTime}\r\n${c.currentText.trim()}\r\n`;
    }).join('\r\n');
  }

  // --- Auto-Conform Engine ---
  function autoConform(cues, options = {}) {
    const maxCpl = options.targetCpl || state.targetCpl;
    const minGapMs = options.minGapMs !== undefined ? options.minGapMs : state.minGapMs;
    const minGapSec = minGapMs / 1000;
    const minDur = options.minDurationSec || state.minDurationSec;

    let changes = 0;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];

      // 1. Normalize typography
      const normText = normalizeTypography(cue.currentText);
      if (normText !== cue.currentText) {
        cue.currentText = normText;
        changes++;
      }

      // 2. Line wrap if exceeding CPL
      const lines = cue.currentText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.some(l => l.length > maxCpl)) {
        const wrapped = smartLineWrap(cue.currentText, maxCpl);
        if (wrapped !== cue.currentText) {
          cue.currentText = wrapped;
          changes++;
        }
      }

      // 3. Ensure minimum duration if possible
      if (cue.endSec - cue.startSec < minDur) {
        const maxAllowedEnd = (i < cues.length - 1) ? cues[i + 1].startSec - minGapSec : cue.startSec + minDur;
        if (maxAllowedEnd > cue.startSec + 0.3) {
          cue.endSec = Math.min(cue.startSec + minDur, maxAllowedEnd);
          cue.endTime = formatTimecode(cue.endSec);
          changes++;
        }
      }

      // 4. Resolve overlap / collision with next cue
      if (i < cues.length - 1) {
        const nextCue = cues[i + 1];
        if (cue.endSec >= nextCue.startSec) {
          const newEnd = Math.max(cue.startSec + 0.3, nextCue.startSec - minGapSec);
          cue.endSec = newEnd;
          cue.endTime = formatTimecode(cue.endSec);
          changes++;
        }
      }
    }

    recalcMetrics(cues);
    return changes;
  }

  // --- Word-level Diff Generator ---
  function renderDiffText(origText, currText) {
    if (origText === currText) {
      return escapeHtml(currText);
    }

    const origWords = origText.split(/\s+/);
    const currWords = currText.split(/\s+/);

    let html = '';
    let i = 0, j = 0;

    while (i < origWords.length || j < currWords.length) {
      if (i < origWords.length && j < currWords.length && origWords[i] === currWords[j]) {
        html += escapeHtml(currWords[j]) + ' ';
        i++;
        j++;
      } else if (j < currWords.length && (!origWords.includes(currWords[j]) || origWords.indexOf(currWords[j]) < i)) {
        html += `<span class="diff-added">${escapeHtml(currWords[j])}</span> `;
        j++;
      } else if (i < origWords.length) {
        html += `<span class="diff-removed">${escapeHtml(origWords[i])}</span> `;
        i++;
      } else {
        if (j < currWords.length) {
          html += `<span class="diff-added">${escapeHtml(currWords[j])}</span> `;
          j++;
        }
      }
    }
    return html.trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- UI Rendering ---
  function renderAuditKPIs() {
    let collisions = 0;
    let cplViolations = 0;
    let cpsViolations = 0;
    let modified = 0;

    for (let c of state.cues) {
      if (c.hasCollision) collisions++;
      if (c.hasCplWarning) cplViolations++;
      if (c.hasCpsWarning) cpsViolations++;
      if (c.isModified) modified++;
    }

    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="kpi-card ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
        <div class="kpi-value">${state.cues.length}</div>
        <div class="kpi-label">Total Cues</div>
      </div>
      <div class="kpi-card ${collisions > 0 ? 'danger' : ''} ${state.activeFilter === 'collision' ? 'active' : ''}" data-filter="collision">
        <div class="kpi-value">${collisions}</div>
        <div class="kpi-label">Collisions</div>
      </div>
      <div class="kpi-card ${cplViolations > 0 ? 'warning' : ''} ${state.activeFilter === 'cpl' ? 'active' : ''}" data-filter="cpl">
        <div class="kpi-value">${cplViolations}</div>
        <div class="kpi-label">&gt;${state.targetCpl} CPL</div>
      </div>
      <div class="kpi-card ${state.activeFilter === 'cps' ? 'active' : ''}" data-filter="cps">
        <div class="kpi-value">${cpsViolations}</div>
        <div class="kpi-label">&gt;20 CPS</div>
      </div>
      <div class="kpi-card ${state.activeFilter === 'modified' ? 'active' : ''}" data-filter="modified">
        <div class="kpi-value">${modified}</div>
        <div class="kpi-label">Modified</div>
      </div>
    `;

    grid.querySelectorAll('.kpi-card').forEach(card => {
      card.addEventListener('click', () => {
        state.activeFilter = card.getAttribute('data-filter');
        renderAuditKPIs();
        renderCueList();
      });
    });
  }

  function renderCueList() {
    const container = document.getElementById('cue-list');
    if (!container) return;

    let filtered = state.cues;
    if (state.activeFilter === 'collision') filtered = state.cues.filter(c => c.hasCollision);
    else if (state.activeFilter === 'cpl') filtered = state.cues.filter(c => c.hasCplWarning);
    else if (state.activeFilter === 'cps') filtered = state.cues.filter(c => c.hasCpsWarning);
    else if (state.activeFilter === 'modified') filtered = state.cues.filter(c => c.isModified);

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-muted);">
        ${state.cues.length === 0 ? 'No subtitles loaded. Import from Premiere or open an SRT file.' : 'No cues match the selected filter.'}
      </div>`;
      return;
    }

    let html = '';
    for (let cue of filtered) {
      const isSelected = cue.id === state.selectedCueId;
      const collisionClass = cue.hasCollision ? 'has-collision' : '';
      const cplClass = cue.hasCplWarning ? 'has-cpl' : '';
      const cpsClass = cue.hasCpsWarning ? 'has-cps' : '';

      html += `
        <div class="cue-card ${isSelected ? 'selected' : ''} ${collisionClass} ${cplClass} ${cpsClass}" data-id="${cue.id}">
          <div class="cue-card-header">
            <div class="cue-id-time">
              <span class="cue-num">#${cue.id}</span>
              <span class="timecode-chip">${cue.startTime} &rarr; ${cue.endTime}</span>
            </div>
            <div class="cue-badges">
              ${cue.hasCollision ? '<span class="badge badge-danger">Collision</span>' : ''}
              ${cue.hasCplWarning ? `<span class="badge badge-warning">${cue.cpl} CPL</span>` : ''}
              ${cue.hasCpsWarning ? `<span class="badge badge-info">${cue.cps} CPS</span>` : ''}
              ${cue.isModified ? '<span class="badge badge-success">Modified</span>' : ''}
            </div>
          </div>

          <div class="cue-text-box" contenteditable="true" spellcheck="false" data-id="${cue.id}">
            ${renderDiffText(cue.originalText, cue.currentText)}
          </div>

          <div class="cue-card-footer">
            <div class="cue-metrics-info">
              <span>${cue.durationSec}s</span>
              <span>&bull;</span>
              <span>${cue.cpl} max CPL</span>
              <span>&bull;</span>
              <span>${cue.cps} CPS</span>
              ${cue.gapMs !== undefined && cue.gapMs < 5000 ? `<span>&bull; Gap: ${cue.gapMs}ms</span>` : ''}
            </div>
            <div style="display:flex; gap: 4px;">
              ${cue.isModified ? `<button class="btn btn-sm btn-revert" data-id="${cue.id}" title="Revert to original">Revert</button>` : ''}
              ${cue.hasCollision ? `<button class="btn btn-sm btn-fix-gap" data-id="${cue.id}" title="Trim to 80ms gap">Fix Gap</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // Attach listeners
    container.querySelectorAll('.cue-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.cue-text-box')) return;
        const id = parseInt(card.getAttribute('data-id'), 10);
        selectCue(id);
      });
    });

    container.querySelectorAll('.cue-text-box').forEach(box => {
      box.addEventListener('blur', () => {
        const id = parseInt(box.getAttribute('data-id'), 10);
        const cue = state.cues.find(c => c.id === id);
        if (cue) {
          const newText = box.innerText.trim();
          if (newText !== cue.currentText) {
            cue.currentText = newText;
            recalcMetrics(state.cues);
            renderAuditKPIs();
            renderCueList();
            updatePreview(cue);
          }
        }
      });
    });

    container.querySelectorAll('.btn-revert').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const cue = state.cues.find(c => c.id === id);
        if (cue) {
          cue.currentText = cue.originalText;
          recalcMetrics(state.cues);
          renderAuditKPIs();
          renderCueList();
          updatePreview(cue);
        }
      });
    });

    container.querySelectorAll('.btn-fix-gap').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const idx = state.cues.findIndex(c => c.id === id);
        if (idx !== -1 && idx < state.cues.length - 1) {
          const next = state.cues[idx + 1];
          state.cues[idx].endSec = Math.max(state.cues[idx].startSec + 0.3, next.startSec - (state.minGapMs / 1000));
          state.cues[idx].endTime = formatTimecode(state.cues[idx].endSec);
          recalcMetrics(state.cues);
          renderAuditKPIs();
          renderCueList();
        }
      });
    });
  }

  function selectCue(id) {
    state.selectedCueId = id;
    const cue = state.cues.find(c => c.id === id);
    if (cue) {
      updatePreview(cue);
    }
    // Update card selection visual
    document.querySelectorAll('.cue-card').forEach(card => {
      if (parseInt(card.getAttribute('data-id'), 10) === id) {
        card.classList.add('selected');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function updatePreview(cue) {
    const previewText = document.getElementById('preview-caption');
    const previewBadge = document.getElementById('preview-badge');
    if (previewText) {
      previewText.innerText = cue ? cue.currentText : '[No Subtitle Selected]';
    }
    if (previewBadge) {
      previewBadge.innerText = cue ? `#${cue.id} (${cue.cpl} CPL · ${cue.cps} CPS)` : '16:9 Title Safe';
    }
  }

  function showBanner(msg, type = 'success') {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    banner.className = `banner banner-${type} show`;
    banner.innerText = msg;
    setTimeout(() => {
      banner.className = 'banner';
    }, 4500);
  }

  // --- ExtendScript Bridge Calls ---
  function evalExtendScript(script, callback) {
    if (!csInterface) {
      console.warn('[ExtendScript Bridge Offline]:', script);
      if (callback) callback('{"success":false,"error":"Running outside Premiere Pro environment."}');
      return;
    }
    csInterface.evalScript(script, (result) => {
      if (callback) callback(result);
    });
  }

  function refreshPremiereStatus() {
    evalExtendScript('TCV_Host.getActiveSequenceInfo()', (res) => {
      try {
        const data = JSON.parse(res);
        const dot = document.getElementById('seq-status-dot');
        const text = document.getElementById('seq-status-text');
        if (data.success && data.hasActiveSequence) {
          state.activeSequence = data;
          if (dot) dot.classList.add('active');
          if (text) text.innerText = `${data.sequenceName}`;
        } else {
          state.activeSequence = null;
          if (dot) dot.classList.remove('active');
          if (text) text.innerText = data.projectName ? `${data.projectName} (No active seq)` : 'No active sequence';
        }
      } catch (e) {
        console.error('Error parsing sequence info:', e);
      }
    });

    // Populate project SRTs
    evalExtendScript('TCV_Host.findProjectSubtitleFiles()', (res) => {
      try {
        const data = JSON.parse(res);
        const select = document.getElementById('project-srt-select');
        if (select && data.success && data.items) {
          state.projectSrtFiles = data.items;
          let opts = '<option value="">-- Select SRT from Project Bin --</option>';
          for (let item of data.items) {
            opts += `<option value="${escapeHtml(item.mediaPath)}">${escapeHtml(item.name)}</option>`;
          }
          select.innerHTML = opts;
        }
      } catch (e) {}
    });
  }

  // --- Timeline Caption Rewriter / Creator ---
  function applyToTimeline() {
    if (state.cues.length === 0) {
      showBanner('No subtitle cues to export.', 'error');
      return;
    }

    const srtContent = formatSRT(state.cues);
    const seqName = state.activeSequence?.sequenceName || 'Sequence';
    const cleanSeqName = seqName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempFileName = `${cleanSeqName}_TCV_QC_${Date.now()}.srt`;

    // Determine target save path
    evalExtendScript('Folder.temp.fsName', (tempDir) => {
      const cleanDir = (tempDir || '/tmp').replace(/"/g, '').trim();
      const fullPath = (cleanDir.endsWith('/') || cleanDir.endsWith('\\')) ?
        cleanDir + tempFileName : cleanDir + '/' + tempFileName;

      // 1. Write cleaned SRT file
      const escapedContent = JSON.stringify(srtContent);
      const writeScript = `TCV_Host.writeDiskFile("${fullPath.replace(/\\/g, '/')}", ${escapedContent})`;

      evalExtendScript(writeScript, (writeRes) => {
        try {
          const wData = JSON.parse(writeRes);
          if (!wData.success) {
            showBanner('Failed writing temp SRT: ' + wData.error, 'error');
            return;
          }

          // 2. Import into project and add caption track to timeline
          const importScript = `TCV_Host.importAndApplyCaptionTrack("${fullPath.replace(/\\/g, '/')}", "TCV QC Captions")`;
          evalExtendScript(importScript, (importRes) => {
            try {
              const iData = JSON.parse(importRes);
              if (iData.success) {
                showBanner(iData.message || 'Subtitles imported and synced to timeline!', 'success');
                refreshPremiereStatus();
              } else {
                showBanner('Import notice: ' + (iData.error || 'Check project bin.'), 'error');
              }
            } catch (err) {
              showBanner('Timeline import error: ' + err.message, 'error');
            }
          });
        } catch (e) {
          showBanner('Write file error: ' + e.message, 'error');
        }
      });
    });
  }

  // --- AI QC & Rewriter Implementation ---
  function syncModelUi(modelVal) {
    const modelSelect = document.getElementById('ai-model');
    const customModelInput = document.getElementById('ai-model-custom');
    if (!modelSelect) return;
    let clean = (modelVal || '').trim().replace(/^models\//, '');
    if (!clean || clean === 'gemini-1.5-flash' || clean === 'gemini-1.5-pro' || clean === 'gemini-flash') {
      clean = 'gemini-2.0-flash';
    }
    const hasOption = Array.from(modelSelect.options).some(o => o.value === clean);
    if (hasOption) {
      modelSelect.value = clean;
      if (customModelInput) customModelInput.style.display = 'none';
    } else {
      modelSelect.value = 'custom';
      if (customModelInput) {
        customModelInput.value = clean;
        customModelInput.style.display = 'block';
      }
    }
  }

  function parseAiJsonResponse(rawText) {
    if (!rawText) throw new Error('AI returned an empty response.');
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  }

  async function runAiQc() {
    if (state.cues.length === 0) {
      showBanner('Load subtitles before running AI QC.', 'error');
      return;
    }

    const apiKey = document.getElementById('ai-api-key')?.value.trim() || state.apiKey;
    if (!apiKey) {
      showBanner('Please enter an AI API key (Gemini or OpenAI).', 'error');
      return;
    }

    const provider = document.getElementById('ai-provider')?.value || state.aiProvider;
    const modelSelect = document.getElementById('ai-model');
    const customInput = document.getElementById('ai-model-custom');

    let model = (modelSelect && modelSelect.value === 'custom'
      ? (customInput?.value || '').trim()
      : modelSelect?.value) || state.aiModel || 'gemini-2.0-flash';

    // Strip "models/" prefix if user pasted it
    model = model.trim().replace(/^models\//, '');

    // Migrate deprecated 1.5 models automatically
    if (model === 'gemini-1.5-flash' || model === 'gemini-1.5-pro' || model === 'gemini-flash') {
      model = 'gemini-2.0-flash';
      syncModelUi(model);
    }

    const glossary = document.getElementById('ai-glossary')?.value.trim() || state.glossary;
    const context = document.getElementById('ai-context')?.value.trim() || state.context;

    // Save to localStorage
    localStorage.setItem('tcv_api_key', apiKey);
    localStorage.setItem('tcv_ai_provider', provider);
    localStorage.setItem('tcv_ai_model', model);
    localStorage.setItem('tcv_glossary', glossary);
    localStorage.setItem('tcv_context', context);

    const btn = document.getElementById('run-ai-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Analyzing & Correcting...';
    }

    try {
      const cuesPayload = state.cues.map(c => ({
        id: c.id,
        text: c.currentText,
        timecode: `${c.startTime} --> ${c.endTime}`,
        durationSec: c.durationSec,
        cpl: c.cpl
      }));

      const systemPrompt = `You are an elite broadcast subtitle QC editor and conform specialist.
Your task:
1. Fix all typos, spelling, capitalization, and punctuation errors.
2. Adhere strictly to the Glossary: "${glossary}".
3. Project Context: "${context}".
4. Optimize reading flow and ensure lines stay within ${state.targetCpl} CPL wherever possible.
5. Do NOT change subtitle IDs or timecodes under any circumstances.
6. Return ONLY valid JSON in the exact schema:
{
  "correctedCues": [
    { "id": 1, "text": "Corrected subtitle text" }
  ]
}`;

      let correctedList = null;

      if (provider === 'gemini') {
        const callGemini = async (targetModel) => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
          return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: systemPrompt + '\n\nInput Cues:\n' + JSON.stringify(cuesPayload) }]
              }],
              generationConfig: {
                responseMimeType: 'application/json'
              }
            })
          });
        };

        let response = await callGemini(model);

        // Auto fallback retry if 404 Not Found (e.g. deprecated model ID)
        if (!response.ok && response.status === 404 && model !== 'gemini-2.0-flash') {
          console.warn(`Model "${model}" returned 404. Falling back to gemini-2.0-flash...`);
          model = 'gemini-2.0-flash';
          syncModelUi(model);
          localStorage.setItem('tcv_ai_model', model);
          response = await callGemini('gemini-2.0-flash');
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Gemini API call failed (${response.status})`);
        }

        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = parseAiJsonResponse(jsonText);
        correctedList = parsed.correctedCues;
      } else {
        // OpenAI compatible endpoint
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'Input Cues:\n' + JSON.stringify(cuesPayload) }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `OpenAI API call failed (${response.status})`);
        }

        const data = await response.json();
        const jsonText = data.choices?.[0]?.message?.content;
        const parsed = parseAiJsonResponse(jsonText);
        correctedList = parsed.correctedCues;
      }

      if (Array.isArray(correctedList)) {
        let applied = 0;
        for (let item of correctedList) {
          const cue = state.cues.find(c => c.id === item.id);
          if (cue && item.text && item.text.trim() !== cue.currentText.trim()) {
            cue.currentText = item.text.trim();
            applied++;
          }
        }
        recalcMetrics(state.cues);
        renderAuditKPIs();
        renderCueList();
        showBanner(`AI QC successfully updated ${applied} subtitle cues!`, 'success');
      } else {
        throw new Error('Invalid JSON format returned from AI model.');
      }
    } catch (err) {
      console.error(err);
      showBanner(`AI QC Error: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Run AI QC & Grammar Fix';
      }
    }
  }

  // --- Export File Helpers ---
  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCsvReport() {
    if (state.cues.length === 0) {
      showBanner('No subtitle cues to export.', 'error');
      return;
    }

    const headers = ['Cue #', 'Start Time', 'End Time', 'Duration (s)', 'CPS', 'Max CPL', 'Lines', 'Collision Status', 'Edit Status', 'Original Text', 'QC Corrected Text'];
    const rows = state.cues.map(c => [
      c.id,
      `"${c.startTime}"`,
      `"${c.endTime}"`,
      c.durationSec,
      c.cps,
      c.cpl,
      c.lineCount,
      `"${c.hasCollision ? 'COLLISION' : 'OK'}"`,
      `"${c.isModified ? 'MODIFIED' : 'UNCHANGED'}"`,
      `"${c.originalText.replace(/"/g, '""')}"`,
      `"${c.currentText.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const seqName = state.activeSequence?.sequenceName || 'subtitles';
    downloadFile(csvContent, `${seqName}_QC_Report.csv`, 'text/csv;charset=utf-8');
    showBanner('QC Report exported to CSV.', 'success');
  }

  // --- Initializer and Event Binding ---
  function init() {
    // Nav Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });

    // Auto-Conform All Button
    const autoFixBtn = document.getElementById('autofix-all-btn');
    if (autoFixBtn) {
      autoFixBtn.addEventListener('click', () => {
        if (state.cues.length === 0) return;
        const changes = autoConform(state.cues);
        renderAuditKPIs();
        renderCueList();
        showBanner(`Auto-Conform applied: ${changes} timing & CPL adjustments made.`, 'success');
      });
    }

    // CPL Pill Selector
    document.querySelectorAll('.cpl-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.cpl-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.targetCpl = parseInt(pill.getAttribute('data-cpl'), 10);
        recalcMetrics(state.cues);
        renderAuditKPIs();
        renderCueList();
      });
    });

    // Slip / Offset Timecodes
    const slipBtn = document.getElementById('apply-slip-btn');
    if (slipBtn) {
      slipBtn.addEventListener('click', () => {
        const ms = parseInt(document.getElementById('slip-ms')?.value || 0, 10);
        if (!ms || state.cues.length === 0) return;
        const deltaSec = ms / 1000;
        for (let cue of state.cues) {
          cue.startSec = Math.max(0, cue.startSec + deltaSec);
          cue.endSec = Math.max(cue.startSec + 0.3, cue.endSec + deltaSec);
          cue.startTime = formatTimecode(cue.startSec);
          cue.endTime = formatTimecode(cue.endSec);
        }
        recalcMetrics(state.cues);
        renderAuditKPIs();
        renderCueList();
        showBanner(`Slipped all cues by ${ms > 0 ? '+' : ''}${ms}ms`, 'success');
      });
    }

    // Find and Replace
    const findReplaceBtn = document.getElementById('find-replace-btn');
    if (findReplaceBtn) {
      findReplaceBtn.addEventListener('click', () => {
        const findStr = document.getElementById('find-input')?.value || '';
        const replaceStr = document.getElementById('replace-input')?.value || '';
        if (!findStr || state.cues.length === 0) return;

        let count = 0;
        const regex = new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        for (let cue of state.cues) {
          if (regex.test(cue.currentText)) {
            cue.currentText = cue.currentText.replace(regex, replaceStr);
            count++;
          }
        }
        recalcMetrics(state.cues);
        renderAuditKPIs();
        renderCueList();
        showBanner(`Replaced occurrences across ${count} cues.`, 'success');
      });
    }

    // Auto-Detect Latest SRT Button (1-Click Ingest from Premiere Export)
    const autoDetectBtn = document.getElementById('auto-detect-srt-btn');
    if (autoDetectBtn) {
      autoDetectBtn.addEventListener('click', () => {
        showBanner('Scanning project & export folders for newest SRT...', 'info');
        evalExtendScript('TCV_Host.findRecentSrtOnDisk()', (res) => {
          try {
            const data = JSON.parse(res);
            if (data.success && data.content) {
              loadRawSrt(data.content, data.name);
              showBanner(`⚡ Auto-detected and loaded: ${data.name}`, 'success');
            } else {
              showBanner(data.error || 'No recent SRT found. In Premiere Text panel, click ... > Export to SRT file first.', 'error');
            }
          } catch (e) {
            showBanner('Auto-detect error: ' + e.message, 'error');
          }
        });
      });
    }

    // Direct Drag and Drop Zone onto Extension Panel
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('drag-over');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      document.body.classList.remove('drag-over');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          loadRawSrt(evt.target.result, file.name);
          showBanner(`Loaded ${file.name} via drag & drop!`, 'success');
        };
        reader.readAsText(file);
      }
    });

    // Import from Project Bin Dropdown
    const projectSrtSelect = document.getElementById('project-srt-select');
    if (projectSrtSelect) {
      projectSrtSelect.addEventListener('change', () => {
        const filePath = projectSrtSelect.value;
        if (!filePath) return;
        evalExtendScript(`TCV_Host.readDiskFile("${filePath.replace(/\\/g, '/')}")`, (res) => {
          try {
            const data = JSON.parse(res);
            if (data.success && data.content) {
              loadRawSrt(data.content, filePath.split('/').pop().split('\\').pop());
              showBanner('Loaded SRT from project bin.', 'success');
            } else {
              showBanner('Could not read SRT file: ' + data.error, 'error');
            }
          } catch (e) {
            showBanner('Error reading project item: ' + e.message, 'error');
          }
        });
      });
    }

    // Browse Local File
    const browseBtn = document.getElementById('browse-srt-btn');
    const fileInput = document.getElementById('file-input');
    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => {
        // Try native Premiere file dialog first
        evalExtendScript('TCV_Host.pickSrtFile()', (res) => {
          try {
            const data = JSON.parse(res);
            if (data.success && data.content) {
              loadRawSrt(data.content, data.path.split('/').pop().split('\\').pop());
              showBanner('Loaded subtitle file.', 'success');
              return;
            }
          } catch (e) {}
          // Fallback to browser file input
          fileInput.click();
        });
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          loadRawSrt(evt.target.result, file.name);
          showBanner(`Loaded ${file.name}`, 'success');
        };
        reader.readAsText(file);
      });
    }

    // Paste SRT Raw Text Modal / Dialog
    const pasteBtn = document.getElementById('paste-srt-btn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', () => {
        const pasted = prompt('Paste your raw SRT subtitle text here:');
        if (pasted && pasted.trim()) {
          loadRawSrt(pasted, 'Pasted_Captions');
          showBanner('Pasted SRT loaded.', 'success');
        }
      });
    }

    // Timeline Apply / Rewrite Button
    const applyTimelineBtn = document.getElementById('apply-timeline-btn');
    if (applyTimelineBtn) {
      applyTimelineBtn.addEventListener('click', applyToTimeline);
    }

    // Download Cleaned SRT
    const downloadSrtBtn = document.getElementById('download-srt-btn');
    if (downloadSrtBtn) {
      downloadSrtBtn.addEventListener('click', () => {
        if (state.cues.length === 0) return;
        const content = formatSRT(state.cues);
        const name = (state.activeSequence?.sequenceName || 'subtitles') + '_TCV_QC.srt';
        downloadFile(content, name, 'text/plain;charset=utf-8');
      });
    }

    // Export CSV
    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', exportCsvReport);
    }

    // AI QC Button
    const runAiBtn = document.getElementById('run-ai-btn');
    if (runAiBtn) {
      runAiBtn.addEventListener('click', runAiQc);
    }

    // Wire AI Settings & Model listeners
    const modelSelect = document.getElementById('ai-model');
    const customModelInput = document.getElementById('ai-model-custom');
    const providerSelect = document.getElementById('ai-provider');

    if (modelSelect) {
      modelSelect.addEventListener('change', () => {
        if (modelSelect.value === 'custom') {
          if (customModelInput) {
            customModelInput.style.display = 'block';
            customModelInput.focus();
          }
        } else {
          if (customModelInput) customModelInput.style.display = 'none';
          state.aiModel = modelSelect.value;
          localStorage.setItem('tcv_ai_model', state.aiModel);
        }
      });
    }

    if (customModelInput) {
      customModelInput.addEventListener('input', () => {
        const val = customModelInput.value.trim().replace(/^models\//, '');
        if (val) {
          state.aiModel = val;
          localStorage.setItem('tcv_ai_model', val);
        }
      });
    }

    if (providerSelect) {
      providerSelect.addEventListener('change', () => {
        const p = providerSelect.value;
        state.aiProvider = p;
        localStorage.setItem('tcv_ai_provider', p);
        if (p === 'gemini' && modelSelect && (modelSelect.value.startsWith('gpt-') || modelSelect.value === 'custom')) {
          syncModelUi('gemini-2.0-flash');
        } else if (p === 'openai' && modelSelect && (modelSelect.value.startsWith('gemini-') || modelSelect.value === 'custom')) {
          syncModelUi('gpt-4o-mini');
        }
      });
    }

    // Load stored AI settings into form
    if (document.getElementById('ai-api-key')) document.getElementById('ai-api-key').value = state.apiKey;
    if (document.getElementById('ai-provider')) document.getElementById('ai-provider').value = state.aiProvider;
    syncModelUi(state.aiModel);
    if (document.getElementById('ai-glossary')) document.getElementById('ai-glossary').value = state.glossary;
    if (document.getElementById('ai-context')) document.getElementById('ai-context').value = state.context;

    // Refresh Premiere connection
    refreshPremiereStatus();
    setInterval(refreshPremiereStatus, 8000);
  }

  function loadRawSrt(rawContent, sourceName) {
    const cues = parseSRT(rawContent);
    state.cues = cues;
    state.originalCues = JSON.parse(JSON.stringify(cues));
    state.selectedCueId = cues.length > 0 ? cues[0].id : null;

    renderAuditKPIs();
    renderCueList();
    if (cues.length > 0) {
      updatePreview(cues[0]);
    }
  }

  // Self start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
