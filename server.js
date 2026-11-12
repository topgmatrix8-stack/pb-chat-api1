import { createServer } from 'http';

const SYSTEM_PROMPT = `You are the AI assistant for Private Business, a premium web design agency based in Montréal, Quebec, Canada. You speak both French and English fluently — always respond in the same language the user writes in.

Your role is to help visitors learn about Private Business services, answer questions, and guide them toward booking a free consultation.

Services offered:
- Professional websites ($1,500–$2,500 CAD)
- Premium animated websites ($3,000–$5,000 CAD)
- Restaurant ordering sites ($4,000–$7,500 CAD)
- Custom mobile apps ($7,500–$15,000 CAD)
- SMS marketing system — SMS Texline ($150–$350/month)
- Analytics & Dashboard ($800–$2,500 CAD)
- Google Business & Reputation management ($400–$900 CAD)

Key facts:
- Serving Montréal, Miami, New York, LA, Chicago
- Real clients include: Construction Hibou, Lave Auto Splash, Nathan Café Floral, Maison Créole, La Ligne Rouge, SMS Texline
- Free consultation available, no commitment required
- Fast delivery, one point of contact, transparent pricing

Keep responses concise, friendly, and professional. Never promise specific rankings, revenue figures, or guaranteed results. Always encourage the user to book a free consultation for specific pricing.`;

const PORT = process.env.PORT || 3001;

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Private Business AI Chat API — running');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/chat') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set' }));
    return;
  }

  // Read request body
  let body = '';
  for await (const chunk of req) body += chunk;

  let messages = [];
  try {
    messages = JSON.parse(body).messages || [];
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  // Call OpenAI streaming
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.slice(-10),
      ],
    }),
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    res.writeHead(openaiRes.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const reader = openaiRes.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content || '';
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch {}
        }
      }
    }
  } finally {
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
