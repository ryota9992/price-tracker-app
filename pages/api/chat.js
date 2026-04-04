import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = (topic, level) => `You are a friendly and encouraging English conversation tutor. Your role is to:

1. Have natural, engaging conversations in English on the topic: "${topic}"
2. Adapt your vocabulary and complexity to a ${level} English learner
3. Gently correct grammar mistakes by including the corrected version in parentheses like: (correction: "the correct phrase")
4. Introduce 1-2 new vocabulary words naturally in your responses when appropriate
5. Keep responses conversational and appropriately concise (2-4 sentences for most replies)
6. If the user writes in Japanese or another language, kindly encourage them to try in English, and provide a helpful example sentence they can use

Level guidelines:
- Beginner: Simple sentences, common vocabulary, slow pace, lots of encouragement
- Intermediate: Natural conversation, some idioms, moderate vocabulary expansion
- Advanced: Complex topics, idiomatic English, nuanced expressions, debate/discussion

At the end of each response, optionally add a brief "💡 Tip:" note highlighting one grammar point, vocabulary word, or useful expression from the conversation.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, topic, level } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT(topic || 'Daily Life', level || 'Intermediate'),
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }

    res.end();
  } catch (error) {
    console.error('Claude API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get response', message: error.message });
    } else {
      res.end();
    }
  }
}
