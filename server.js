import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aiInstance = null;
function getGemini() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY environment variable is required');
    aiInstance = new GoogleGenAI({ apiKey: key, httpOptions: { headers: { 'User-Agent': 'the-harbor' } } });
  }
  return aiInstance;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/gemini/summarize', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 12000) : '';
    const lang = typeof body.lang === 'string' && body.lang.trim() ? body.lang.trim().slice(0, 32) : 'English';
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const ai = getGemini();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Summarize the following personal story warmly and concisely in ${lang}:\n\n${text}`,
    });
    const summary = typeof response.text === 'string' && response.text.trim()
      ? response.text.trim()
      : (response.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || 'Summary unavailable');
    res.json({ summary });
  } catch (err) {
    console.error('Gemini summarize error:', err);
    res.status(500).json({ error: err?.message || 'AI Summarization failed' });
  }
});

app.post('/api/gemini/moderate', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const ai = getGemini();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Analyze if this text violates community guidelines (hate speech, self-harm instructions, harassment, explicit content). Sad/difficult stories are OK. Text:\n\n${text}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { flagged: { type: Type.BOOLEAN } },
          required: ['flagged'],
        },
      },
    });
    let flagged = false;
    if (response.text) {
      try { flagged = !!JSON.parse(response.text.trim()).flagged; } catch { /* noop */ }
    }
    res.json({ flagged });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI Moderation failed' });
  }
});

app.post('/api/gemini/reflect', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 12000) : '';
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const ai = getGemini();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Provide a warm, highly empathetic, and supportive AI reflection for the following anonymous story. Focus on validating their emotions, offering deep insight or a new perspective, and suggesting a gentle reflective question or next step. Keep the response around 2 to 3 sentences, comforting and gentle. Do not use markdown headers, lists, or bolding. Keep it pure plain text.
Story text: ${text}`,
    });
    const reflection = typeof response.text === 'string' && response.text.trim()
      ? response.text.trim()
      : (response.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || 'Reflection unavailable');
    res.json({ reflection });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI Reflection failed' });
  }
});

// Serve static files from project root (zero-build vanilla architecture)
app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚓ The Harbor running at http://localhost:${PORT}`);
});
