import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const TOPICS = [
  { id: 'daily', label: 'Daily Life', emoji: '🏡' },
  { id: 'business', label: 'Business', emoji: '💼' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'hobbies', label: 'Hobbies', emoji: '🎨' },
  { id: 'news', label: 'News & Society', emoji: '📰' },
  { id: 'food', label: 'Food & Cooking', emoji: '🍳' },
];

const LEVELS = [
  { id: 'Beginner', label: 'Beginner', desc: 'Simple words & sentences' },
  { id: 'Intermediate', label: 'Intermediate', desc: 'Natural conversation' },
  { id: 'Advanced', label: 'Advanced', desc: 'Complex topics & idioms' },
];

const STARTER_MESSAGES = {
  daily: "Let's talk about your daily routine! What time do you usually wake up?",
  business: "Let's practice business English! Tell me about your job or career goals.",
  travel: "Let's talk about travel! Have you visited any interesting places recently?",
  hobbies: "Let's chat about hobbies! What do you enjoy doing in your free time?",
  news: "Let's discuss current events! What topic in the news interests you lately?",
  food: "Let's talk about food! What's your favorite meal to cook or eat?",
};

export default function Home() {
  const [topic, setTopic] = useState('daily');
  const [level, setLevel] = useState('Intermediate');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const startConversation = () => {
    const selectedTopic = TOPICS.find(t => t.id === topic);
    const starterText = STARTER_MESSAGES[topic];
    setMessages([{ role: 'assistant', content: starterText }]);
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const resetConversation = () => {
    setMessages([]);
    setInput('');
    setStarted(false);
    setIsLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Build messages for API (exclude initial assistant greeting from history
    // so Claude starts fresh, but include it for context)
    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          topic: TOPICS.find(t => t.id === topic)?.label,
          level,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      // Add placeholder for streaming response
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessageContent = (content) => {
    // Highlight corrections and tips
    const parts = content.split(/(💡 Tip:.*)/s);
    return parts.map((part, i) => {
      if (part.startsWith('💡 Tip:')) {
        return (
          <div key={i} className="mt-3 pt-3 border-t border-green-200 text-green-800 text-sm">
            {part}
          </div>
        );
      }
      // Highlight corrections in parentheses
      const correctionParts = part.split(/(\(correction: "[^"]+"\))/g);
      return (
        <span key={i}>
          {correctionParts.map((cp, j) => {
            if (cp.match(/^\(correction: "[^"]+"\)$/)) {
              return (
                <span key={j} className="bg-yellow-100 text-yellow-800 rounded px-1 text-sm font-medium">
                  {cp}
                </span>
              );
            }
            return <span key={j}>{cp}</span>;
          })}
        </span>
      );
    });
  };

  const selectedTopic = TOPICS.find(t => t.id === topic);

  return (
    <>
      <Head>
        <title>English Conversation Practice</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗣️</span>
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-tight">English Conversation</h1>
              {started && (
                <p className="text-xs text-gray-500">
                  {selectedTopic?.emoji} {selectedTopic?.label} · {level}
                </p>
              )}
            </div>
          </div>
          {started && (
            <button
              onClick={resetConversation}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              New Chat
            </button>
          )}
        </header>

        {!started ? (
          /* Setup Screen */
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
              <h2 className="text-xl font-bold text-gray-800 mb-1">Start Practicing</h2>
              <p className="text-gray-500 text-sm mb-6">Choose a topic and your level to begin</p>

              {/* Topic Selection */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Topic</label>
                <div className="grid grid-cols-2 gap-2">
                  {TOPICS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTopic(t.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        topic === t.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-gray-50'
                      }`}
                    >
                      <span>{t.emoji}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Level Selection */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Your Level</label>
                <div className="flex flex-col gap-2">
                  {LEVELS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setLevel(l.id)}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 text-sm transition-all ${
                        level === l.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`font-semibold ${level === l.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                        {l.label}
                      </span>
                      <span className="text-gray-400 text-xs">{l.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={startConversation}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-base hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
              >
                Start Conversation →
              </button>
            </div>
          </div>
        ) : (
          /* Chat Screen */
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                      <span className="text-sm">🤖</span>
                    </div>
                  )}
                  <div
                    className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 shadow-sm rounded-bl-none'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div>{renderMessageContent(msg.content)}</div>
                    ) : (
                      msg.content
                    )}
                    {msg.role === 'assistant' && msg.content === '' && (
                      <span className="inline-flex gap-1">
                        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center ml-2 flex-shrink-0 mt-1">
                      <span className="text-sm">👤</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 shadow-md">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  placeholder="Type your message in English... (Enter to send)"
                  rows={1}
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                  style={{ maxHeight: '120px' }}
                  onInput={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium text-sm hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {isLoading ? '...' : 'Send'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">
                Shift+Enter for new line · Grammar corrections shown in yellow
              </p>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        .animate-bounce {
          animation: bounce 1.2s infinite;
        }
      `}</style>
    </>
  );
}
