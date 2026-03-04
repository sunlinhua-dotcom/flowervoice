// ================================================
// VoiceMeet - App Logic (Enhanced with PDF Export)
// ================================================

const $ = id => document.getElementById(id);

// DOM Elements
const uploadArea = $('uploadArea');
const fileInput = $('fileInput');
const fileInfo = $('fileInfo');
const fileName = $('fileName');
const fileSize = $('fileSize');
const fileRemove = $('fileRemove');
const processBtn = $('processBtn');
const uploadSection = $('uploadSection');
const processingSection = $('processingSection');
const resultsSection = $('resultsSection');
const errorSection = $('errorSection');
const errorMessage = $('errorMessage');
const retryBtn = $('retryBtn');
const resetBtn = $('resetBtn');
const copyAllBtn = $('copyAllBtn');
const exportPdfBtn = $('exportPdfBtn');
const processingText = $('processingText');
const toast = $('toast');
const toastMessage = $('toastMessage');

let selectedFile = null;
let meetingData = null;

// ================================================
// File Upload
// ================================================

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'block';
    uploadArea.style.display = 'none';
}

fileRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    uploadArea.style.display = 'block';
});

processBtn.addEventListener('click', () => {
    if (selectedFile) startProcessing();
});

retryBtn.addEventListener('click', () => {
    errorSection.style.display = 'none';
    uploadSection.style.display = 'block';
    fileInfo.style.display = 'none';
    uploadArea.style.display = 'block';
    selectedFile = null;
    fileInput.value = '';
});

resetBtn.addEventListener('click', () => {
    resultsSection.style.display = 'none';
    uploadSection.style.display = 'block';
    fileInfo.style.display = 'none';
    uploadArea.style.display = 'block';
    selectedFile = null;
    fileInput.value = '';
    meetingData = null;
});

// ================================================
// Processing
// ================================================

async function startProcessing() {
    uploadSection.style.display = 'none';
    processingSection.style.display = 'block';
    errorSection.style.display = 'none';
    resultsSection.style.display = 'none';

    resetSteps();

    const formData = new FormData();
    formData.append('audio', selectedFile);

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`服务器错误: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6).trim();
                    if (jsonStr) {
                        try {
                            const event = JSON.parse(jsonStr);
                            handleProgressEvent(event);
                        } catch (e) {
                            console.warn('Failed to parse SSE event:', e);
                        }
                    }
                }
            }
        }

    } catch (error) {
        console.error('Processing error:', error);
        showError(error.message || '处理失败，请检查网络连接后重试');
    }
}

function handleProgressEvent(event) {
    const { step, message, data } = event;

    switch (step) {
        case 'upload':
            setStepState('step-upload', 'completed');
            $('status-upload').textContent = message;
            setStepState('step-transcribe', 'active');
            processingText.textContent = '正在处理语音转写...';
            break;

        case 'transcribe':
            setStepState('step-transcribe', 'active');
            $('status-transcribe').textContent = message;
            processingText.textContent = '正在进行语音识别...';
            break;

        case 'transcribe_done':
            setStepState('step-transcribe', 'completed');
            $('status-transcribe').textContent = '转写完成';
            setStepState('step-summarize', 'active');
            processingText.textContent = '正在生成会议记录...';
            break;

        case 'summarize':
            setStepState('step-summarize', 'active');
            $('status-summarize').textContent = message;
            processingText.textContent = 'AI 正在分析会议内容...';
            break;

        case 'done':
            setStepState('step-summarize', 'completed');
            $('status-summarize').textContent = '生成完成';
            processingText.textContent = '处理完成！';

            setTimeout(() => {
                processingSection.style.display = 'none';
                if (data.meeting) {
                    meetingData = data.meeting;
                    meetingData._transcription = data.transcription;
                    renderResults(data.meeting);
                } else if (data.rawText) {
                    renderRawResults(data.rawText, data.transcription);
                }
            }, 800);
            break;

        case 'error':
            showError(message);
            break;
    }
}

function setStepState(stepId, state) {
    const el = $(stepId);
    el.classList.remove('active', 'completed', 'error');
    el.classList.add(state);
}

function resetSteps() {
    ['step-upload', 'step-transcribe', 'step-summarize'].forEach(id => {
        const el = $(id);
        el.classList.remove('active', 'completed', 'error');
    });
    setStepState('step-upload', 'active');
    ['status-upload', 'status-transcribe', 'status-summarize'].forEach(id => {
        $(id).textContent = '';
    });
}

function showError(message) {
    processingSection.style.display = 'none';
    errorSection.style.display = 'block';
    errorMessage.textContent = message;
}

// ================================================
// Render Results
// ================================================

function renderResults(meeting) {
    resultsSection.style.display = 'block';

    // Meeting header
    $('meetingTitle').textContent = meeting.title || '会议记录';
    $('meetingDate').textContent = meeting.date ? `📅 ${meeting.date}` : '';
    $('meetingDuration').textContent = meeting.duration ? `⏱️ ${meeting.duration}` : '';
    $('meetingAtmosphere').textContent = meeting.meeting_atmosphere ? `🎯 ${meeting.meeting_atmosphere}` : '';
    $('meetingSummary').textContent = meeting.summary || '';

    // Hidden text for copy
    $('meetingHeaderText').textContent = `【${meeting.title || '会议记录'}】\n日期：${meeting.date || '未知'}\n时长：${meeting.duration || '未知'}\n氛围：${meeting.meeting_atmosphere || ''}\n概要：${meeting.summary || ''}`;

    // Key highlights
    renderHighlights(meeting.key_highlights || []);

    // Participants
    renderParticipants(meeting.participants || []);

    // Action items
    renderActionItems(meeting.action_items || []);

    // Detailed discussion
    renderDetailedDiscussion(meeting.detailed_discussion || meeting.agenda_items || []);

    // Key decisions
    renderDecisions(meeting.key_decisions || [], meeting.next_steps || []);

    // Risks
    renderRisks(meeting.risks_and_concerns || []);

    // Scroll to top of results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// ---- Key Highlights ----
function renderHighlights(highlights) {
    const container = $('highlightsList');
    container.innerHTML = '';
    let textContent = '';

    if (!highlights || highlights.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">暂无重要提要</div>';
        return;
    }

    highlights.forEach(h => {
        const el = document.createElement('div');
        el.className = 'highlight-item';
        el.innerHTML = `<span class="highlight-icon">⚠️</span><span>${escapeHtml(h.replace(/^⚠️\s*/, ''))}</span>`;
        container.appendChild(el);
        textContent += `⚠️ ${h.replace(/^⚠️\s*/, '')}\n`;
    });

    $('highlightsText').textContent = textContent;
}

// ---- Participants ----
function renderParticipants(participants) {
    const container = $('participantsList');
    container.innerHTML = '';
    let textContent = '';

    participants.forEach((p, i) => {
        const genderClass = getGenderClass(p.gender);
        const genderIcon = getGenderIcon(p.gender);

        const card = document.createElement('div');
        card.className = 'participant-card';
        card.innerHTML = `
      <div class="participant-header">
        <div class="participant-avatar ${genderClass}">${genderIcon}</div>
        <div>
          <div class="participant-name">${escapeHtml(p.name || `参会者${i + 1}`)}</div>
          <div class="participant-tags">
            <span class="participant-tag gender-${genderClass}">${p.gender || '未知'}</span>
            <span class="participant-tag age">${p.age_range || '未知'}</span>
            ${p.role ? `<span class="participant-tag role">${escapeHtml(p.role)}</span>` : ''}
            ${p.attitude ? `<span class="participant-tag role">${escapeHtml(p.attitude)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="participant-summary">${escapeHtml(p.speaking_summary || '')}</div>
      ${p.key_quotes && p.key_quotes.length > 0 ? `
        <div class="participant-quotes">
          ${p.key_quotes.map(q => `<div class="participant-quote">${escapeHtml(q)}</div>`).join('')}
        </div>
      ` : ''}
    `;
        container.appendChild(card);

        textContent += `👤 ${p.name || `参会者${i + 1}`}（${p.gender || '未知'}，${p.age_range || '未知'}，${p.role || '未知'}）\n`;
        if (p.attitude) textContent += `态度倾向：${p.attitude}\n`;
        textContent += `发言要点：${p.speaking_summary || ''}\n`;
        if (p.key_quotes && p.key_quotes.length > 0) {
            textContent += `关键发言：\n${p.key_quotes.map(q => `  "${q}"`).join('\n')}\n`;
        }
        textContent += '\n';
    });

    $('participantsText').textContent = textContent;
}

// ---- Action Items ----
function renderActionItems(items) {
    const container = $('actionItemsList');
    container.innerHTML = '';
    let textContent = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="action-item" style="color: var(--text-muted); font-size: 0.85rem;">暂无待办事项</div>';
        return;
    }

    items.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'action-item';
        el.innerHTML = `
      <div class="action-checkbox" onclick="toggleCheckbox(this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="action-content">
        <div class="action-task">${escapeHtml(item.task)}</div>
        ${item.context ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; line-height: 1.3;">${escapeHtml(item.context)}</div>` : ''}
        <div class="action-meta">
          ${item.assignee ? `<span class="action-meta-tag assignee">👤 ${escapeHtml(item.assignee)}</span>` : ''}
          ${item.deadline ? `<span class="action-meta-tag deadline">📅 ${escapeHtml(item.deadline)}</span>` : ''}
          ${item.priority ? `<span class="action-meta-tag priority-${item.priority === '高' ? 'high' : item.priority === '中' ? 'medium' : 'low'}">${getPriorityLabel(item.priority)}</span>` : ''}
        </div>
      </div>
    `;
        container.appendChild(el);

        textContent += `${i + 1}. ${item.task}`;
        if (item.assignee) textContent += ` [负责人: ${item.assignee}]`;
        if (item.deadline) textContent += ` [截止: ${item.deadline}]`;
        if (item.priority) textContent += ` [优先级: ${item.priority}]`;
        if (item.context) textContent += `\n   背景: ${item.context}`;
        textContent += '\n';
    });

    $('actionItemsText').textContent = textContent;
}

// ---- Detailed Discussion ----
function renderDetailedDiscussion(sections) {
    const container = $('discussionList');
    container.innerHTML = '';
    let textContent = '';

    if (!sections || sections.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">暂无详细讨论记录</div>';
        return;
    }

    // Check if this is the old format (agenda_items) or new format (detailed_discussion)
    const isOldFormat = sections[0] && sections[0].discussion !== undefined && sections[0].detailed_record === undefined;

    sections.forEach((section, i) => {
        const num = section.section_number || (i + 1);
        const el = document.createElement('div');
        el.className = 'discussion-section';

        if (isOldFormat) {
            // Legacy agenda_items format
            el.innerHTML = `
        <div class="discussion-header">
          <div class="section-number">${num}</div>
          <div class="section-title">${escapeHtml(section.topic)}</div>
        </div>
        <div class="section-detailed-record">${escapeHtml(section.discussion || '')}</div>
        ${section.decisions && section.decisions.length > 0 ? `
          <div class="section-decisions">
            ${section.decisions.map(d => `<div class="section-decision-item">${escapeHtml(d)}</div>`).join('')}
          </div>
        ` : ''}
      `;
            textContent += `${num}. ${section.topic}\n`;
            textContent += `   ${section.discussion || ''}\n`;
            if (section.decisions) {
                section.decisions.forEach(d => { textContent += `   ✓ ${d}\n`; });
            }
            textContent += '\n';
        } else {
            // New detailed_discussion format
            el.innerHTML = `
        <div class="discussion-header">
          <div class="section-number">${num}</div>
          <div class="section-title">${escapeHtml(section.topic)}</div>
          ${section.time_estimate ? `<span class="section-time">${escapeHtml(section.time_estimate)}</span>` : ''}
        </div>

        ${section.section_summary ? `<div class="section-summary">${escapeHtml(section.section_summary)}</div>` : ''}

        ${section.highlights && section.highlights.length > 0 ? `
          <div class="section-highlights">
            ${section.highlights.map(h => `<div class="section-highlight-item">${escapeHtml(h)}</div>`).join('')}
          </div>
        ` : ''}

        ${section.detailed_record ? `<div class="section-detailed-record">${escapeHtml(section.detailed_record)}</div>` : ''}

        ${section.dialogue_highlights && section.dialogue_highlights.length > 0 ? `
          <div class="dialogue-highlights">
            ${section.dialogue_highlights.map(d => `
              <div class="dialogue-item">
                <span class="dialogue-speaker">${escapeHtml(d.speaker)}：</span>
                <span class="dialogue-content">${escapeHtml(d.content)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${section.decisions_made && section.decisions_made.length > 0 ? `
          <div class="section-decisions">
            ${section.decisions_made.map(d => `<div class="section-decision-item">${escapeHtml(d)}</div>`).join('')}
          </div>
        ` : ''}
      `;

            textContent += `━━━━━━━━━━━━━━━━━━━━━\n`;
            textContent += `第${num}段：${section.topic}\n`;
            if (section.time_estimate) textContent += `时长：${section.time_estimate}\n`;
            textContent += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
            if (section.section_summary) textContent += `📌 核心结论：${section.section_summary}\n\n`;
            if (section.highlights) {
                section.highlights.forEach(h => { textContent += `${h}\n`; });
                textContent += '\n';
            }
            if (section.detailed_record) textContent += `详细记录：\n${section.detailed_record}\n\n`;
            if (section.dialogue_highlights) {
                textContent += `重要发言：\n`;
                section.dialogue_highlights.forEach(d => {
                    textContent += `  ${d.speaker}：${d.content}\n`;
                });
                textContent += '\n';
            }
            if (section.decisions_made) {
                textContent += `本段决定：\n`;
                section.decisions_made.forEach(d => { textContent += `  ✓ ${d}\n`; });
                textContent += '\n';
            }
        }

        container.appendChild(el);
    });

    $('discussionText').textContent = textContent;
}

// ---- Key Decisions ----
function renderDecisions(decisions, nextSteps) {
    const container = $('decisionsList');
    container.innerHTML = '';
    let textContent = '';

    if ((!decisions || decisions.length === 0) && (!nextSteps || nextSteps.length === 0)) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">暂无关键决策</div>';
        return;
    }

    // Handle both old format (string array) and new format (object array)
    if (decisions && decisions.length > 0) {
        decisions.forEach(d => {
            const el = document.createElement('div');
            if (typeof d === 'string') {
                el.className = 'decision-item';
                el.innerHTML = `<div class="decision-icon">📌</div><div>${escapeHtml(d)}</div>`;
                textContent += `📌 ${d}\n`;
            } else {
                el.className = 'decision-detail';
                el.innerHTML = `
          <div class="decision-title">${escapeHtml(d.decision)}</div>
          ${d.reason ? `<div class="decision-reason">${escapeHtml(d.reason)}</div>` : ''}
          ${d.impact ? `<div class="decision-impact">${escapeHtml(d.impact)}</div>` : ''}
        `;
                textContent += `📌 ${d.decision}\n`;
                if (d.reason) textContent += `   原因：${d.reason}\n`;
                if (d.impact) textContent += `   影响：${d.impact}\n`;
            }
            container.appendChild(el);
        });
    }

    if (nextSteps && nextSteps.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = 'font-size: 0.8rem; color: var(--text-muted); margin: 12px 0 6px; font-weight: 600;';
        divider.textContent = '下一步行动';
        container.appendChild(divider);
        textContent += '\n下一步行动：\n';

        nextSteps.forEach(s => {
            const el = document.createElement('div');
            el.className = 'decision-item';
            el.innerHTML = `<div class="decision-icon">➡️</div><div>${escapeHtml(s)}</div>`;
            container.appendChild(el);
            textContent += `➡️ ${s}\n`;
        });
    }

    $('decisionsText').textContent = textContent;
}

// ---- Risks & Concerns ----
function renderRisks(risks) {
    const container = $('risksList');
    container.innerHTML = '';
    let textContent = '';

    if (!risks || risks.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px;">暂无风险记录</div>';
        return;
    }

    risks.forEach(r => {
        const el = document.createElement('div');
        el.className = 'risk-item';
        el.innerHTML = `<span class="risk-icon">⚡</span><span>${escapeHtml(r)}</span>`;
        container.appendChild(el);
        textContent += `⚡ ${r}\n`;
    });

    $('risksText').textContent = textContent;
}

// ---- Raw Results fallback ----
function renderRawResults(rawText, transcription) {
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    $('meetingTitle').textContent = '会议记录';
    $('meetingDate').textContent = '';
    $('meetingDuration').textContent = '';
    $('meetingAtmosphere').textContent = '';
    $('meetingSummary').textContent = rawText;
    $('meetingHeaderText').textContent = rawText;

    $('highlightsList').innerHTML = '';
    $('participantsList').innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">AI 未能生成结构化数据，请查看上方原始内容</div>';
    $('actionItemsList').innerHTML = '';
    $('discussionList').innerHTML = '';
    $('decisionsList').innerHTML = '';
    $('risksList').innerHTML = '';
}

// ================================================
// Copy Functions
// ================================================

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-target');
    const text = $(targetId)?.textContent || '';
    copyToClipboard(text, btn);
});

copyAllBtn.addEventListener('click', () => {
    const fullText = generateFullMeetingText();
    copyToClipboard(fullText);
});

function generateFullMeetingText() {
    if (!meetingData) return '';

    let text = '';
    text += `═══════════════════════════════\n`;
    text += `📋 ${meetingData.title || '会议记录'}\n`;
    text += `═══════════════════════════════\n\n`;

    if (meetingData.date) text += `📅 日期：${meetingData.date}\n`;
    if (meetingData.duration) text += `⏱️ 时长：${meetingData.duration}\n`;
    if (meetingData.meeting_atmosphere) text += `🎯 氛围：${meetingData.meeting_atmosphere}\n`;
    text += `\n📝 会议概要：\n${meetingData.summary || ''}\n\n`;

    // Key highlights
    if (meetingData.key_highlights && meetingData.key_highlights.length > 0) {
        text += `───────────────────────────────\n`;
        text += `⚠️ 重要提要\n`;
        text += `───────────────────────────────\n\n`;
        meetingData.key_highlights.forEach(h => {
            text += `⚠️ ${h.replace(/^⚠️\s*/, '')}\n`;
        });
        text += '\n';
    }

    // Participants
    if (meetingData.participants && meetingData.participants.length > 0) {
        text += `───────────────────────────────\n`;
        text += `👥 参会人员\n`;
        text += `───────────────────────────────\n\n`;
        meetingData.participants.forEach((p, i) => {
            text += `👤 ${p.name || `参会者${i + 1}`}`;
            text += `（${p.gender || '未知'}，${p.age_range || '未知'}`;
            if (p.role) text += `，${p.role}`;
            text += `）\n`;
            if (p.attitude) text += `态度：${p.attitude}\n`;
            text += `发言要点：${p.speaking_summary || ''}\n`;
            if (p.key_quotes && p.key_quotes.length > 0) {
                p.key_quotes.forEach(q => { text += `  💬 "${q}"\n`; });
            }
            text += '\n';
        });
    }

    // Action items
    if (meetingData.action_items && meetingData.action_items.length > 0) {
        text += `───────────────────────────────\n`;
        text += `✅ 待办事项\n`;
        text += `───────────────────────────────\n\n`;
        meetingData.action_items.forEach((item, i) => {
            text += `${i + 1}. ${item.task}`;
            if (item.assignee) text += ` [${item.assignee}]`;
            if (item.deadline) text += ` [截止: ${item.deadline}]`;
            if (item.priority) text += ` [${item.priority}]`;
            text += '\n';
            if (item.context) text += `   背景: ${item.context}\n`;
        });
        text += '\n';
    }

    // Detailed discussion
    const discussions = meetingData.detailed_discussion || meetingData.agenda_items || [];
    if (discussions.length > 0) {
        text += `───────────────────────────────\n`;
        text += `📋 详细讨论记录\n`;
        text += `───────────────────────────────\n\n`;
        discussions.forEach((section, i) => {
            const num = section.section_number || (i + 1);
            text += `━━━ 第${num}段：${section.topic} ━━━\n`;
            if (section.time_estimate) text += `时长：${section.time_estimate}\n`;
            if (section.section_summary) text += `📌 核心结论：${section.section_summary}\n`;
            text += '\n';
            if (section.highlights) {
                section.highlights.forEach(h => { text += `${h}\n`; });
                text += '\n';
            }
            if (section.detailed_record) text += `${section.detailed_record}\n\n`;
            if (section.dialogue_highlights) {
                text += `重要发言：\n`;
                section.dialogue_highlights.forEach(d => { text += `  ${d.speaker}：${d.content}\n`; });
                text += '\n';
            }
            if (section.decisions_made) {
                section.decisions_made.forEach(d => { text += `  ✓ ${d}\n`; });
                text += '\n';
            }
        });
    }

    // Key decisions
    const decisions = meetingData.key_decisions || [];
    if (decisions.length > 0) {
        text += `───────────────────────────────\n`;
        text += `📌 关键决策\n`;
        text += `───────────────────────────────\n\n`;
        decisions.forEach(d => {
            if (typeof d === 'string') {
                text += `• ${d}\n`;
            } else {
                text += `• ${d.decision}\n`;
                if (d.reason) text += `  原因：${d.reason}\n`;
                if (d.impact) text += `  影响：${d.impact}\n`;
            }
        });
        text += '\n';
    }

    // Next steps
    if (meetingData.next_steps && meetingData.next_steps.length > 0) {
        text += `───────────────────────────────\n`;
        text += `➡️ 下一步行动\n`;
        text += `───────────────────────────────\n\n`;
        meetingData.next_steps.forEach(s => { text += `• ${s}\n`; });
        text += '\n';
    }

    // Risks
    if (meetingData.risks_and_concerns && meetingData.risks_and_concerns.length > 0) {
        text += `───────────────────────────────\n`;
        text += `⚡ 风险与关注点\n`;
        text += `───────────────────────────────\n\n`;
        meetingData.risks_and_concerns.forEach(r => { text += `⚡ ${r}\n`; });
    }

    return text;
}

async function copyToClipboard(text, btnElement = null) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('已复制到剪贴板');
        if (btnElement) {
            btnElement.classList.add('copied');
            setTimeout(() => btnElement.classList.remove('copied'), 2000);
        }
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('已复制到剪贴板');
        if (btnElement) {
            btnElement.classList.add('copied');
            setTimeout(() => btnElement.classList.remove('copied'), 2000);
        }
    }
}

// ================================================
// PDF Export
// ================================================

exportPdfBtn.addEventListener('click', async () => {
    if (typeof html2pdf === 'undefined') {
        showToast('PDF 库加载中，请稍后重试');
        return;
    }
    if (!meetingData) {
        showToast('暂无会议数据');
        return;
    }

    const originalBtn = exportPdfBtn.innerHTML;
    exportPdfBtn.disabled = true;
    exportPdfBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    正在生成 PDF...
  `;

    const title = meetingData.title || '会议记录';
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    const pdfFilename = `VoiceMeet_${safeTitle}_${dateStr}.pdf`;

    // Build clean HTML for PDF with inline styles
    const pdfHtml = buildPdfHtml(meetingData);

    // Create a hidden container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:210mm;z-index:-9999;opacity:0;pointer-events:none;';
    container.innerHTML = pdfHtml;
    document.body.appendChild(container);

    try {
        const opt = {
            margin: [8, 8, 8, 8],
            filename: pdfFilename,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                width: 794 // A4 width in px at 96dpi
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
        const blobUrl = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = pdfFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => { window.open(blobUrl, '_blank'); }, 500);
        showToast('PDF 已生成');
    } catch (error) {
        console.error('PDF export error:', error);
        showToast('PDF 生成失败，请重试');
    }

    document.body.removeChild(container);
    exportPdfBtn.disabled = false;
    exportPdfBtn.innerHTML = originalBtn;
});

function buildPdfHtml(m) {
    const S = {
        page: 'font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:24px;line-height:1.6;font-size:13px;',
        h1: 'font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 6px;',
        meta: 'font-size:12px;color:#666;margin-bottom:12px;',
        summary: 'font-size:13px;color:#333;line-height:1.7;margin-bottom:20px;padding:12px 14px;background:#f8f9fa;border-radius:8px;border-left:4px solid #6366f1;',
        section: 'margin-bottom:20px;page-break-inside:avoid;',
        sectionTitle: 'font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #6366f1;',
        card: 'background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;page-break-inside:avoid;',
        highlight: 'background:#fffde7;border:1px solid #f9a825;border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:13px;color:#333;',
        tagMale: 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:#e3f2fd;color:#1565c0;margin-right:4px;',
        tagFemale: 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:#fce4ec;color:#c62828;margin-right:4px;',
        tagRole: 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:#ede7f6;color:#4527a0;margin-right:4px;',
        tagAge: 'display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:#fff3e0;color:#e65100;margin-right:4px;',
        quote: 'font-size:12px;color:#555;font-style:italic;padding-left:10px;border-left:3px solid #6366f1;margin:4px 0;',
        actionItem: 'padding:10px 12px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px;page-break-inside:avoid;',
        actionTask: 'font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:4px;',
        actionMeta: 'font-size:11px;color:#666;',
        discSection: 'background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:14px;margin-bottom:10px;page-break-inside:avoid;',
        discNum: 'display:inline-block;width:24px;height:24px;background:#6366f1;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:8px;',
        discTitle: 'font-size:14px;font-weight:600;color:#1a1a1a;',
        discSummary: 'background:#ede7f6;color:#4a148c;padding:8px 10px;border-radius:6px;font-size:12px;margin:8px 0;',
        discRecord: 'font-size:12px;color:#333;line-height:1.6;margin:8px 0;',
        dialogue: 'background:#f5f5f5;border-radius:6px;padding:8px 10px;margin:4px 0;font-size:12px;',
        decision: 'padding:8px 12px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px;font-size:13px;color:#1a1a1a;',
        risk: 'padding:8px 12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;margin-bottom:6px;font-size:13px;color:#333;',
    };

    let html = `<div style="${S.page}">`;

    // Header
    html += `<div style="margin-bottom:16px;">`;
    html += `<h1 style="${S.h1}">📋 ${esc(m.title || '会议记录')}</h1>`;
    html += `<div style="${S.meta}">`;
    if (m.date) html += `📅 ${esc(m.date)}　`;
    if (m.duration) html += `⏱️ ${esc(m.duration)}　`;
    if (m.meeting_atmosphere) html += `🎯 ${esc(m.meeting_atmosphere)}`;
    html += `</div>`;
    if (m.summary) html += `<div style="${S.summary}">${esc(m.summary)}</div>`;
    html += `</div>`;

    // Key Highlights
    const highlights = m.key_highlights || [];
    if (highlights.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">⚠️ 重要提要</div>`;
        highlights.forEach(h => {
            html += `<div style="${S.highlight}">⚠️ ${esc(h.replace(/^⚠️\s*/, ''))}</div>`;
        });
        html += `</div>`;
    }

    // Participants
    const participants = m.participants || [];
    if (participants.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">👥 参会人员</div>`;
        participants.forEach((p, i) => {
            const gTag = p.gender?.includes('男') ? S.tagMale : p.gender?.includes('女') ? S.tagFemale : S.tagMale;
            const icon = p.gender?.includes('男') ? '👨' : p.gender?.includes('女') ? '👩' : '👤';
            html += `<div style="${S.card}">`;
            html += `<div style="font-size:14px;font-weight:600;margin-bottom:4px;">${icon} ${esc(p.name || '参会者' + (i + 1))}</div>`;
            html += `<div style="margin-bottom:6px;">`;
            if (p.gender) html += `<span style="${gTag}">${esc(p.gender)}</span>`;
            if (p.age_range) html += `<span style="${S.tagAge}">${esc(p.age_range)}</span>`;
            if (p.role) html += `<span style="${S.tagRole}">${esc(p.role)}</span>`;
            html += `</div>`;
            if (p.speaking_summary) html += `<div style="font-size:12px;color:#333;margin-bottom:4px;">${esc(p.speaking_summary)}</div>`;
            if (p.key_quotes?.length > 0) {
                p.key_quotes.forEach(q => {
                    html += `<div style="${S.quote}">"${esc(q)}"</div>`;
                });
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    // Action Items
    const actions = m.action_items || [];
    if (actions.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">✅ 待办事项</div>`;
        actions.forEach((item, i) => {
            html += `<div style="${S.actionItem}">`;
            html += `<div style="${S.actionTask}">${i + 1}. ${esc(item.task)}</div>`;
            if (item.context) html += `<div style="font-size:11px;color:#666;margin-bottom:4px;">${esc(item.context)}</div>`;
            html += `<div style="${S.actionMeta}">`;
            if (item.assignee) html += `👤 ${esc(item.assignee)}　`;
            if (item.deadline) html += `📅 ${esc(item.deadline)}　`;
            if (item.priority) html += `${item.priority === '高' ? '🔴' : item.priority === '中' ? '🟡' : '🟢'} ${esc(item.priority)}`;
            html += `</div></div>`;
        });
        html += `</div>`;
    }

    // Detailed Discussion
    const discussions = m.detailed_discussion || m.agenda_items || [];
    if (discussions.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">📋 详细讨论记录</div>`;
        discussions.forEach((sec, i) => {
            const num = sec.section_number || (i + 1);
            html += `<div style="${S.discSection}">`;
            html += `<div style="margin-bottom:8px;"><span style="${S.discNum}">${num}</span><span style="${S.discTitle}">${esc(sec.topic)}</span>`;
            if (sec.time_estimate) html += `<span style="font-size:11px;color:#666;margin-left:8px;">${esc(sec.time_estimate)}</span>`;
            html += `</div>`;
            if (sec.section_summary) html += `<div style="${S.discSummary}">📌 ${esc(sec.section_summary)}</div>`;
            if (sec.highlights?.length > 0) {
                sec.highlights.forEach(h => {
                    html += `<div style="${S.highlight}">${esc(h)}</div>`;
                });
            }
            if (sec.detailed_record) html += `<div style="${S.discRecord}">${esc(sec.detailed_record)}</div>`;
            if (sec.dialogue_highlights?.length > 0) {
                html += `<div style="margin:6px 0;">`;
                sec.dialogue_highlights.forEach(d => {
                    html += `<div style="${S.dialogue}"><strong style="color:#4527a0;">${esc(d.speaker)}：</strong>${esc(d.content)}</div>`;
                });
                html += `</div>`;
            }
            if (sec.decisions_made?.length > 0) {
                sec.decisions_made.forEach(d => {
                    html += `<div style="font-size:12px;color:#2e7d32;margin:3px 0;">✓ ${esc(d)}</div>`;
                });
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    // Key Decisions
    const decisions = m.key_decisions || [];
    if (decisions.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">📌 关键决策</div>`;
        decisions.forEach(d => {
            html += `<div style="${S.decision}">`;
            if (typeof d === 'string') {
                html += `📌 ${esc(d)}`;
            } else {
                html += `<div style="font-weight:600;">📌 ${esc(d.decision)}</div>`;
                if (d.reason) html += `<div style="font-size:12px;color:#555;margin-top:2px;">原因：${esc(d.reason)}</div>`;
                if (d.impact) html += `<div style="font-size:12px;color:#555;">影响：${esc(d.impact)}</div>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    // Risks
    const risks = m.risks_and_concerns || [];
    if (risks.length > 0) {
        html += `<div style="${S.section}">`;
        html += `<div style="${S.sectionTitle}">⚡ 风险与关注点</div>`;
        risks.forEach(r => {
            html += `<div style="${S.risk}">⚡ ${esc(r)}</div>`;
        });
        html += `</div>`;
    }

    // Footer
    html += `<div style="text-align:center;font-size:11px;color:#999;margin-top:24px;padding-top:12px;border-top:1px solid #e0e0e0;">`;
    html += `VoiceMeet AI 会议纪要 · 生成于 ${new Date().toLocaleString('zh-CN')}`;
    html += `</div>`;

    html += `</div>`;
    return html;
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ================================================
// Helpers
// ================================================

function toggleCheckbox(el) {
    el.classList.toggle('checked');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getGenderClass(gender) {
    if (!gender) return 'unknown';
    if (gender.includes('男')) return 'male';
    if (gender.includes('女')) return 'female';
    return 'unknown';
}

function getGenderIcon(gender) {
    if (!gender) return '👤';
    if (gender.includes('男')) return '👨';
    if (gender.includes('女')) return '👩';
    return '👤';
}

function getPriorityLabel(priority) {
    switch (priority) {
        case '高': return '🔴 高';
        case '中': return '🟡 中';
        case '低': return '🟢 低';
        default: return priority;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}
