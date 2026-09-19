import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

const app = express();
const port = Number(process.env.PORT || 3001);
const apiKey = process.env.GEMINI_API_KEY;

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  if (!apiKey) {
    return res.status(503).json({ error: 'AI concierge is not configured.' });
  }

  const themeName = typeof req.body?.themeName === 'string'
    ? req.body.themeName.trim().slice(0, 120)
    : 'this location';
  const message = typeof req.body?.message === 'string'
    ? req.body.message.trim().slice(0, 2000)
    : '';
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const history: ChatMessage[] = rawHistory
    .slice(-12)
    .filter((item: unknown): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<ChatMessage>;
      return (value.role === 'user' || value.role === 'model') && typeof value.text === 'string';
    })
    .map(item => ({
      role: item.role,
      text: item.text.slice(0, 2000),
    }));

  const historyText = history
    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.text}`)
    .join('\n');

  const prompt = [
    `You are Vicinity Vibe's local AI concierge for ${themeName}.`,
    'Be concise, upbeat, practical, and transparent when you do not know a live fact.',
    'Do not claim real-time hours, prices, availability, or events unless they were supplied in the conversation.',
    historyText ? `Conversation so far:\n${historyText}` : '',
    `User: ${message}`,
    'Assistant:',
  ].filter(Boolean).join('\n\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return res.json({
      text: response.text || 'I could not generate a response just now. Please try again.',
    });
  } catch (error) {
    console.error('Gemini request failed', error);
    return res.status(502).json({ error: 'AI concierge request failed.' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Vicinity Vibe server listening on port ${port}`);
});
