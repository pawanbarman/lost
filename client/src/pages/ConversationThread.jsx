import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, Ban, Flag } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const ConversationThread = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    markRead();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const response = await api.get(`/conversations/${id}/messages`);
      setMessages(response.data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async () => {
    try {
      await api.put(`/conversations/${id}/read`);
    } catch (error) {
      // ignore
    }
  };

  const handleReportMessage = async (messageId) => {
    const reason = prompt('Reason for reporting this message (optional, max 500 chars):');
    if (reason === null) return;
    try {
      await api.post(`/conversations/${id}/messages/${messageId}/report`, { reason: reason.trim() || undefined });
      alert('Message reported');
    } catch (error) {
      console.error('Failed to report message:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-4">
            <Link to="/conversations" className="inline-flex items-center text-sky-400 hover:text-sky-300">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to conversations
            </Link>
            <div className="flex gap-2">
              <button onClick={handleBlock} className="px-3 py-1 text-xs bg-red-500/20 text-red-300 border border-red-400/30 rounded hover:bg-red-500/30">Block</button>
            </div>
          </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg h-[600px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.senderId === user?.id ? 'bg-sky-500 text-white' : 'bg-slate-800 text-white'}`}>
                  {msg.body && <p className="text-sm whitespace-pre-wrap">{msg.body}</p>}
                  {msg.imageUrl && <img src={msg.imageUrl} alt="attachment" className="mt-2 rounded max-w-full" />}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs opacity-70">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                    {msg.senderId !== user?.id && (
                      <button onClick={() => handleReportMessage(msg.id)} className="text-xs opacity-70 hover:opacity-100 ml-2">Report</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 border-t border-white/10 flex space-x-2">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="px-4 py-2 bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-lg hover:bg-sky-500/30 disabled:opacity-50 flex items-center"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConversationThread;
