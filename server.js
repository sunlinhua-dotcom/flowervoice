require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DASHSCOPE_ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';

// Detailed meeting summary prompt
const DETAILED_MEETING_PROMPT = `你是一位资深的会议记录整理专家和文档撰写高手。请根据会议转写文本，生成一份**极其详细、逻辑清晰、专业规范**的会议记录。

## 核心要求
1. **详细程度**：每一段讨论都要有详细记录，不能遗漏任何重要信息
2. **逻辑清晰**：总结文字要条理分明，层次结构清楚，方便快速阅读
3. **重点突出**：每一段讨论都要提炼出「⚠️ 重要提要」，让读者一眼抓住关键
4. **人物区分**：根据语音特征和内容推断每位发言人的性别和大致年龄段

请严格按照以下 JSON 格式输出（不要输出任何其他内容）：
{
  "title": "会议标题（根据内容推断，要精准概括会议核心主题）",
  "date": "会议日期（如果能推断则填写，否则填'待确认'）",
  "duration": "预估会议时长",
  "summary": "会议整体概要（3-5句话，包含会议的核心目的、主要讨论内容、最终结论。要写得像一段精炼的摘要，让没参会的人也能快速了解会议全貌）",
  "key_highlights": [
    "⚠️ 最重要的结论或决定1",
    "⚠️ 最重要的结论或决定2",
    "⚠️ 最重要的结论或决定3"
  ],
  "participants": [
    {
      "id": "speaker_1",
      "name": "姓名（有名字用名字，否则用'参会者A'）",
      "gender": "男/女/未知",
      "age_range": "青年(20-35)/中年(35-55)/老年(55+)/未知",
      "role": "推断的角色（如：会议主持人、项目负责人、技术负责人、产品经理、设计师等）",
      "speaking_summary": "该人发言要点的详细总结（200-500字），要包含：1)此人的核心观点是什么 2)提出了哪些建议或方案 3)对他人观点的回应 4)承担了哪些任务",
      "key_quotes": ["关键原话1（完整引用，保留原始表述）", "关键原话2", "关键原话3"],
      "speaking_count": "发言次数（估算）",
      "attitude": "此人在会议中的态度倾向（如：积极推动、审慎质疑、中立客观、提供支持等）"
    }
  ],
  "detailed_discussion": [
    {
      "section_number": 1,
      "topic": "讨论主题（精准概括）",
      "time_estimate": "大约占会议的xx分钟",
      "section_summary": "本段讨论的核心结论（2-3句话，用清晰简洁的语言概括本段的最终结果）",
      "highlights": ["⚠️ 本段最重要的要点1", "⚠️ 本段最重要的要点2"],
      "detailed_record": "本段讨论的完整详细记录（500-1000字），按时间顺序叙述：谁先说了什么→引发了什么讨论→各方观点是什么→最终达成了什么共识。要写得像一篇详细的会议纪要，而不是简单的概括。使用自然流畅的叙述语言。",
      "dialogue_highlights": [
        {"speaker": "发言人姓名", "content": "重要发言的完整内容"},
        {"speaker": "发言人姓名", "content": "重要发言的完整内容"}
      ],
      "decisions_made": ["本段讨论中做出的具体决定"]
    }
  ],
  "action_items": [
    {
      "task": "待办事项的详细描述（要具体到可以直接执行，不要模糊）",
      "assignee": "负责人姓名",
      "deadline": "截止日期（如有）",
      "priority": "高/中/低",
      "context": "这项任务的背景和来源（在哪段讨论中提出的）"
    }
  ],
  "key_decisions": [
    {
      "decision": "决策的详细描述",
      "reason": "做出此决策的原因",
      "impact": "此决策的预期影响"
    }
  ],
  "next_steps": ["接下来的具体步骤1", "具体步骤2"],
  "risks_and_concerns": ["会议中提到的风险或担忧1", "风险2"],
  "meeting_atmosphere": "会议整体氛围描述（如：高效务实、讨论热烈、意见分歧较大等）"
}

## 写作规范
1. **总结的文字逻辑要非常清晰**：使用「首先...其次...最后...」「一方面...另一方面...」等逻辑连接词
2. **每一段detailed_discussion都要足够详细**：不少于300字，要像一篇小文章
3. **highlights必须用⚠️开头**：让重要信息一眼可见
4. **语言风格**：专业、客观、条理清晰，不用口语化表达
5. **人物标签**：性别用「男/女」，年龄用「青年/中年/老年」，要根据说话方式和内容合理推断
6. 请只输出 JSON，不要有任何其他内容，不要用 markdown 代码块包裹`;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'audio-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac',
      'audio/ogg', 'audio/flac', 'audio/x-flac',
      'audio/webm', 'audio/amr', 'audio/x-amr',
      'audio/wma', 'audio/x-ms-wma',
      'video/mp4', 'video/webm', 'video/x-flv',
      'application/octet-stream' // fallback for unknown types
    ];
    cb(null, true); // Accept all - we'll validate by extension
  }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// ============================================================
// API Routes
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Upload audio file
app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择音频文件' });
  }
  console.log(`[Upload] File received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    }
  });
});

// Submit transcription task (DashScope Paraformer async API)
app.post('/api/transcribe', async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: '缺少文件名' });
  }

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件未找到' });
  }

  try {
    console.log(`[Transcribe] Starting transcription for: ${filename}`);

    // Read file and convert to base64 for the OpenAI-compatible endpoint
    const fileBuffer = fs.readFileSync(filePath);

    // Use DashScope OpenAI-compatible audio transcription endpoint
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), {
      filename: filename,
      contentType: 'audio/mpeg'
    });
    formData.append('model', 'paraformer-v2');
    formData.append('response_format', 'verbose_json');

    const transcriptionResponse = await fetch(`${DASHSCOPE_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error(`[Transcribe] OpenAI-compatible API failed: ${errorText}`);

      // Fallback: try the async Paraformer API
      console.log('[Transcribe] Trying async Paraformer API...');
      return await handleAsyncTranscription(req, res, filename, filePath);
    }

    const result = await transcriptionResponse.json();
    console.log(`[Transcribe] Transcription completed successfully`);

    res.json({
      success: true,
      transcription: result.text || result,
      raw: result
    });

  } catch (error) {
    console.error(`[Transcribe] Error:`, error.message);
    // Try async API as fallback
    try {
      return await handleAsyncTranscription(req, res, filename, filePath);
    } catch (fallbackError) {
      res.status(500).json({ error: '转写失败: ' + error.message });
    }
  }
});

// Async Paraformer transcription (requires public URL - we'll use file_urls with OSS-like workaround)
async function handleAsyncTranscription(req, res, filename, filePath) {
  // Since we can't provide a public URL easily, we'll use base64 + Qwen for transcription
  console.log('[Transcribe] Using Qwen audio understanding as fallback...');

  const fileBuffer = fs.readFileSync(filePath);
  const base64Audio = fileBuffer.toString('base64');
  const ext = path.extname(filename).toLowerCase().replace('.', '');

  // Map extension to MIME type
  const mimeMap = {
    'mp3': 'audio/mp3', 'wav': 'audio/wav', 'm4a': 'audio/m4a',
    'ogg': 'audio/ogg', 'flac': 'audio/flac', 'webm': 'audio/webm',
    'amr': 'audio/amr', 'aac': 'audio/aac', 'wma': 'audio/wma',
    'mp4': 'video/mp4'
  };
  const mimeType = mimeMap[ext] || 'audio/mpeg';

  // Use Qwen's multimodal capability to transcribe audio with speaker identification
  const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen-omni-turbo',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的语音转写助手。请将音频内容完整转写为文字，并尽可能区分不同的说话人。用 "说话人1:", "说话人2:" 等标记不同的发言人。'
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: `data:${mimeType};base64,${base64Audio}`,
                format: ext
              }
            },
            {
              type: 'text',
              text: '请完整转写这段音频的内容，区分不同说话人，格式为 "说话人1: xxx"。如果能判断说话人的性别和大致年龄，请也标注出来。'
            }
          ]
        }
      ],
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Transcribe Fallback] Qwen audio failed: ${errorText}`);
    throw new Error('语音转写失败，请稍后重试');
  }

  const result = await response.json();
  const transcription = result.choices?.[0]?.message?.content || '';

  console.log(`[Transcribe] Fallback transcription completed`);
  res.json({
    success: true,
    transcription: transcription,
    method: 'qwen-audio'
  });
}

// Query async transcription task status
app.get('/api/transcribe/status/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    const response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
        }
      }
    );

    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '查询状态失败: ' + error.message });
  }
});

// Generate meeting summary using Qwen3.5-plus
app.post('/api/summarize', async (req, res) => {
  const { transcription } = req.body;
  if (!transcription) {
    return res.status(400).json({ error: '缺少转写文本' });
  }

  try {
    console.log(`[Summarize] Generating meeting summary...`);

    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus',
        messages: [
          {
            role: 'system',
            content: DETAILED_MEETING_PROMPT
          },
          {
            role: 'user',
            content: `以下是会议的转写文本，请生成详细的会议记录：\n\n${transcription}`
          }
        ],
        max_tokens: 32768,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Summarize] API error:`, errorText);
      return res.status(500).json({ error: '生成会议总结失败' });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || '';

    // Clean up the response - extract JSON from markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const meetingData = JSON.parse(content);
      console.log(`[Summarize] Meeting summary generated successfully`);
      res.json({ success: true, meeting: meetingData });
    } catch (parseError) {
      console.log(`[Summarize] JSON parse failed, returning raw text`);
      res.json({
        success: true,
        meeting: null,
        rawText: content
      });
    }

  } catch (error) {
    console.error(`[Summarize] Error:`, error.message);
    res.status(500).json({ error: '生成会议总结失败: ' + error.message });
  }
});

// One-stop processing: upload → transcribe → summarize
app.post('/api/process', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择音频文件' });
  }

  // Set headers for SSE (Server-Sent Events) for real-time progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendProgress = (step, message, data = null) => {
    res.write(`data: ${JSON.stringify({ step, message, data })}\n\n`);
  };

  try {
    const filename = req.file.filename;
    const filePath = req.file.path;

    // Step 1: File uploaded
    sendProgress('upload', '文件上传完成', {
      filename: req.file.originalname,
      size: req.file.size
    });

    // Step 2: Transcribe
    sendProgress('transcribe', '正在进行语音转写...');

    let transcription = '';

    // Try OpenAI-compatible endpoint first
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), {
        filename: filename,
        contentType: 'audio/mpeg'
      });
      formData.append('model', 'paraformer-v2');
      formData.append('response_format', 'verbose_json');

      const transcribeRes = await fetch(`${DASHSCOPE_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (transcribeRes.ok) {
        const result = await transcribeRes.json();
        transcription = result.text || JSON.stringify(result);
      } else {
        throw new Error('OpenAI-compatible endpoint failed');
      }
    } catch (e) {
      // Fallback: compress with ffmpeg, split, and use Paraformer per chunk
      console.log('[Process] Primary transcription failed, using chunked approach...');

      const ext = path.extname(filename).toLowerCase().replace('.', '');

      // Step 1: Get audio duration
      let audioDuration = 0;
      try {
        const durationStr = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
          { encoding: 'utf-8' }
        ).trim();
        audioDuration = parseFloat(durationStr) || 0;
        console.log(`[Process] Audio duration: ${(audioDuration / 60).toFixed(1)} min`);
      } catch (e) {
        audioDuration = 600; // assume 10 min if we can't detect
        console.log('[Process] Could not detect duration, assuming 10 min');
      }

      sendProgress('transcribe', `音频时长 ${(audioDuration / 60).toFixed(0)} 分钟，正在压缩和分段处理...`);

      // Step 2: Compress audio to 16kHz mono MP3 (much smaller, better for API)
      const compressedPath = filePath.replace(/\.[^.]+$/, '_compressed.mp3');
      try {
        execSync(
          `ffmpeg -i "${filePath}" -ar 16000 -ac 1 -b:a 32k -y "${compressedPath}" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 120000 }
        );
        console.log('[Process] Audio compressed to 16kHz mono MP3');
      } catch (e) {
        console.error('[Process] Compression failed, using original file');
        fs.copyFileSync(filePath, compressedPath);
      }

      // Step 3: Split into 90-second chunks
      const chunkDuration = 90; // 90 seconds per chunk - safe for all APIs
      const chunkDir = path.join(uploadsDir, `chunks-${Date.now()}`);
      fs.mkdirSync(chunkDir, { recursive: true });

      try {
        execSync(
          `ffmpeg -i "${compressedPath}" -f segment -segment_time ${chunkDuration} -ar 16000 -ac 1 -reset_timestamps 1 "${chunkDir}/chunk_%03d.mp3" -y 2>/dev/null`,
          { encoding: 'utf-8', timeout: 120000 }
        );
      } catch (e) {
        console.error('[Process] Split failed:', e.message);
        throw new Error('音频分段失败，请检查文件格式');
      }

      const chunkFiles = fs.readdirSync(chunkDir).filter(f => f.endsWith('.mp3')).sort();
      console.log(`[Process] Split into ${chunkFiles.length} chunks (${chunkDuration}s each)`);
      sendProgress('transcribe', `已分为 ${chunkFiles.length} 段，开始逐段转写...`);

      let allTranscriptions = [];

      for (let i = 0; i < chunkFiles.length; i++) {
        const chunkPath = path.join(chunkDir, chunkFiles[i]);
        sendProgress('transcribe', `正在转写第 ${i + 1}/${chunkFiles.length} 段...`);

        let chunkText = '';

        // Try Paraformer API first (file upload - best for ASR)
        try {
          const chunkFormData = new FormData();
          chunkFormData.append('file', fs.createReadStream(chunkPath), {
            filename: chunkFiles[i],
            contentType: 'audio/mpeg'
          });
          chunkFormData.append('model', 'paraformer-v2');
          chunkFormData.append('response_format', 'verbose_json');

          const paraRes = await fetch(`${DASHSCOPE_BASE_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
              ...chunkFormData.getHeaders()
            },
            body: chunkFormData
          });

          if (paraRes.ok) {
            const paraResult = await paraRes.json();
            chunkText = paraResult.text || '';
            console.log(`[Process] Chunk ${i + 1}/${chunkFiles.length} - Paraformer OK (${chunkText.length} chars)`);
          } else {
            throw new Error('Paraformer failed for chunk');
          }
        } catch (paraErr) {
          // Fallback: try Qwen for this chunk
          console.log(`[Process] Chunk ${i + 1} Paraformer failed, trying Qwen...`);
          try {
            const chunkBuffer = fs.readFileSync(chunkPath);
            const chunkBase64 = chunkBuffer.toString('base64');

            const qwenRes = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'qwen-omni-turbo',
                messages: [
                  {
                    role: 'system',
                    content: '你是专业的语音转写助手。请将音频完整转写为文字，区分不同说话人。'
                  },
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'input_audio',
                        input_audio: {
                          data: `data:audio/mp3;base64,${chunkBase64}`,
                          format: 'mp3'
                        }
                      },
                      { type: 'text', text: '请完整转写这段音频，区分说话人。' }
                    ]
                  }
                ],
                max_tokens: 2048
              })
            });

            if (qwenRes.ok) {
              const qwenResult = await qwenRes.json();
              chunkText = qwenResult.choices?.[0]?.message?.content || '';
              console.log(`[Process] Chunk ${i + 1}/${chunkFiles.length} - Qwen OK (${chunkText.length} chars)`);
            }
          } catch (qwenErr) {
            console.error(`[Process] Chunk ${i + 1} both APIs failed`);
          }
        }

        if (chunkText) {
          allTranscriptions.push(chunkText);
        }
      }

      transcription = allTranscriptions.join('\n\n');

      if (!transcription.trim()) {
        throw new Error('所有分段的转写都失败了，请检查音频文件是否有效');
      }

      console.log(`[Process] Final transcription: ${transcription.length} chars from ${allTranscriptions.length} chunks`);

      // Clean up
      try {
        fs.rmSync(chunkDir, { recursive: true });
        fs.unlinkSync(compressedPath);
      } catch (e) { /* ignore */ }
    }

    sendProgress('transcribe_done', '语音转写完成', { transcription });

    // Step 3: Summarize
    sendProgress('summarize', '正在生成会议记录...');

    const summaryRes = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-plus-2025-01-25',
        messages: [
          {
            role: 'system',
            content: DETAILED_MEETING_PROMPT
          },
          {
            role: 'user',
            content: `以下是会议的转写文本，请生成详细的会议记录：\n\n${transcription}`
          }
        ],
        max_tokens: 8192,
        temperature: 0.3
      })
    });

    if (!summaryRes.ok) {
      const errText = await summaryRes.text();
      throw new Error('生成会议总结失败: ' + errText);
    }

    const summaryResult = await summaryRes.json();
    let content = summaryResult.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Also remove any thinking tags that Qwen might include
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let meetingData = null;
    try {
      meetingData = JSON.parse(content);
    } catch (e) {
      console.log('[Process] JSON parse failed, will pass raw text');
    }

    sendProgress('done', '会议记录生成完成', {
      meeting: meetingData,
      rawText: meetingData ? null : content,
      transcription
    });

    // Clean up uploaded file after processing
    setTimeout(() => {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }, 60000); // Delete after 1 minute

  } catch (error) {
    console.error('[Process] Error:', error.message);
    sendProgress('error', error.message);
  }

  res.end();
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎙️  语音会议记录服务已启动`);
  console.log(`📱 请在浏览器中打开: http://localhost:${PORT}`);
  console.log(`🔑 DashScope API Key: ${DASHSCOPE_API_KEY ? '已配置 ✓' : '未配置 ✗'}\n`);
});
