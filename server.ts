import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

// Lazy initialization of Gemini client
let aiInstance: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Summarize Story
  app.post('/api/gemini/summarize', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 12000) : '';
      const lang = typeof body.lang === 'string' && body.lang.trim() ? body.lang.trim().slice(0, 32) : 'English';
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const ai = getGemini();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Summarize the following personal story warmly, empathetically, and concisely in the requested language (Language: ${lang}). Use brief bullet points or a short paragraph. Keep it simple and focused. Story:\n\n${text}`,
      });

      const summary = typeof response.text === 'string' && response.text.trim()
        ? response.text.trim()
        : (response.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('').trim() || 'Summary unavailable');
      res.json({ summary });
    } catch (err: any) {
      console.error('Summarize error:', err);
      res.status(500).json({ error: err?.message || 'AI Summarization failed' });
    }
  });

  // API Route: Moderate content
  app.post('/api/gemini/moderate', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const ai = getGemini();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Analyze the following story or comment text to determine if it violates community guidelines (contains extreme hate speech, self-harm instructions, severe harassment, or explicit/graphic sexual content). It is perfectly fine to share sad, difficult, or struggling experiences (e.g., crying, feeling down, sharing grief) — we want to support those. Only flag if it is truly hostile, harmful, toxic, or unsafe. Text to evaluate:\n\n${text}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flagged: {
                type: Type.BOOLEAN,
                description: 'True if the content violates community safety guidelines, false otherwise.',
              },
            },
            required: ['flagged'],
          },
        },
      });

      let flagged = false;
      if (response.text) {
        try {
          const parsed = JSON.parse(response.text.trim());
          flagged = !!parsed.flagged;
        } catch (parseErr) {
          console.error('Error parsing JSON from moderation:', parseErr);
        }
      }

      res.json({ flagged });
    } catch (err: any) {
      console.error('Moderate error:', err);
      res.status(500).json({ error: err.message || 'AI Moderation failed' });
    }
  });

  // Serve static files from workspace root in development, or dist/ in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`⚓ The Harbor server running on port ${PORT}`);

    // Schedule the bot activity simulation to run once 10 seconds after server startup, then every 15 minutes
    setTimeout(() => {
      console.log('⏳ Running initial startup autonomous bot simulation...');
      exec('node bot-activity.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Bot activity startup run failed: ${error.message}`);
          return;
        }
        if (stderr) console.warn(`⚠️ Bot activity startup warning: ${stderr}`);
        console.log(`🤖 Bot activity startup run completed. Output:\n${stdout}`);
      });
    }, 10000);

    setInterval(() => {
      console.log('⏳ Running scheduled 15-minute interval autonomous bot simulation...');
      exec('node bot-activity.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Scheduled bot activity run failed: ${error.message}`);
          return;
        }
        if (stderr) console.warn(`⚠️ Scheduled bot activity warning: ${stderr}`);
        console.log(`🤖 Scheduled bot activity run completed. Output:\n${stdout}`);
      });
    }, 15 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
