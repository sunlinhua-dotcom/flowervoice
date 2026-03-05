## [LRN-20260305-001] JS: html2pdf.js Styling in Dark Themes

**Logged**: 2026-03-05T15:05:35+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
`html2canvas` (used by `html2pdf.js`) does not reliably apply CSS class overrides (like `background: white !important`) when capturing a DOM element that is heavily styled with dark themes, glassmorphism, or transparent backgrounds. Text elements remain invisible or retain gradient styling.

### Details
Attempted to export a dark-theme UI to PDF by adding a `.pdf-rendering` class to the existing DOM that forces white background and dark text. `html2pdf.js` failed to render this cleanly; the background remained dark, and the text wasn't visible. Instead of trying to override the intricate active page styles, the robust approach is to generate a completely separate, clean HTML string.

### Suggested Action
When building PDF exports for complex themes (especially dark mode/glassmorphism), **build a separate HTML string entirely with inline styles** specifically designed for printing (e.g., `<div style="background:#fff;color:#000;">...</div>`). Inject this HTML into a hidden container off-screen (`position:fixed; opacity:0; z-index:-9999; pointer-events:none`), pass that container to `html2pdf.js`, and remove the container afterward.

### Metadata
- Source: conversation
- Related Files: public/app.js, public/index.css
- Tags: frontend, html2pdf, css, dark-theme

---

## [LRN-20260305-002] API: DashScope Qwen Models Hanging (Thinking Mode)

**Logged**: 2026-03-05T15:05:35+08:00
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary
Certain Qwen models (e.g., `qwen-plus`, `qwen3.5-plus`) accessed via DashScope's OpenAI-compatible endpoint can hang indefinitely or timeout on simple summarization tasks because they default to a "thinking" mode.

### Details
When generating meeting summaries from short transcriptions, calls to `qwen-plus` hung for minutes. Attempting to disable this via `extra_body: { enable_thinking: false }` did not work on the OpenAI-compatible `/chat/completions` endpoint.

### Suggested Action
Use explicit pre-thinking snapshot models (e.g., `qwen-plus-2025-01-25`) to bypass thinking mode. Also, ensure `max_tokens` does not exceed the valid range for that specific snapshot (e.g., `qwen-plus-2025-01-25` max is `8192`, not `16384` or `32768`).

### Metadata
- Source: conversation
- Related Files: server.js
- Tags: backend, api, dashscope, qwen

---

## [LRN-20260305-003] API: Long Audio Chunking & Transcription Fallbacks

**Logged**: 2026-03-05T15:05:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Long audio files (e.g., 2 hours) fail transcription APIs if sent in chunks that are still too large (e.g., 5 minutes) or if sent to multimodal models not optimized for base ASR.

### Details
Attempting to transcribe 5-minute chunks using `qwen-omni-turbo` failed with "audio is too long" errors. `qwen-omni-turbo` is multimodal and not ideal for pure, long-form chunked ASR.

### Suggested Action
1. Compress the audio using `ffmpeg -ar 16000 -ac 1 -ab 32k` (16kHz mono 32kbps mp3) to minimize payload size.
2. Split the audio into shorter chunks (e.g., **90 seconds**).
3. Use specialized ASR models (e.g., `paraformer-v2`) via explicit file upload endpoints rather than multimodal base endpoints.
4. Implement a per-chunk fallback mechanism (if Paraformer fails, fall back to Qwen) to guarantee resilience.

### Metadata
- Source: conversation
- Related Files: server.js
- Tags: backend, ffmpeg, audio, asr, dashscope
