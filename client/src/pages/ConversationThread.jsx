import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, Ban, Flag, X } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const CHAT_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — server cap is handleImage's CHAT_MAX_FILE_SIZE
const POLL_MS = 5000;

const ConversationThread = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const knownCountRef = useRef(0);

  // Revoked on change/unmount — otherwise the 5s poll render leaks a blob URL each time.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    fetchMessages();
    markRead();
    const timer = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    if (document.hidden || blocked) return;
    try {
      const response = await api.get(`/conversations/${id}/messages`);
      const next = response.data || [];
      setMessages(next);
      if (next.length > knownCountRef.current) {
        knownCountRef.current = next.length;
        markRead();
      }
    } catch (error) {
      // 403 once blocked is the expected state, not an error worth logging.
      if (error.response?.status === 403) setBlocked(true);
      else console.error('Failed to fetch messages:', error);
    }
  };

  const markRead = async () => {
    try {
      await api.put(`/conversations/${id}/read`);
    } catch (error) {
      // ignore
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (sending || (!body.trim() && !file)) return;
    setSending(true);
    try {
      // clientId is the dedupe key: a retried send can never create a duplicate row.
      const clientId = crypto.randomUUID();
      if (file) {
        const form = new FormData();
        form.append('clientId', clientId);
        if (body.trim()) form.append('body', body.trim());
        form.append('image', file);
        await api.post(`/conversations/${id}/messages`, form);
      } else {
        await api.post(`/conversations/${id}/messages`, { body: body.trim(), clientId });
      }
      setBody('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchMessages();
    } catch (error) {
      const message = error.response?.data?.error || 'Could not send the message';
      alert(message);
      if (error.response?.status === 403) setBlocked(true);
    } finally {
      setSending(false);
    }
  };

  const pickFile = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.size > CHAT_MAX_FILE_SIZE) {
      alert('Image too large. Maximum size is 2MB.');
      e.target.value = '';
      return;
    }
    setFile(picked);
  };

  const handleBlock = async () => {
    if (!confirm('Block this conversation? You will stop receiving and sending messages.')) return;
    try {
      await api.put(`/conversations/${id}/block`);
      setBlocked(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Could not block this conversation');
    }
  };

  // reason is NOT optional: zod requires min 1 and the column is NOT NULL.
  const handleReportMessage = async (messageId) => {
    const reason = prompt('Reason for reporting this message (max 500 chars):');
    if (reason === null) return;
    try {
      await api.post(`/conversations/${id}/messages/${messageId}/report`, {
        reason: reason.trim() || 'No reason given',
      });
      alert('Message reported');
    } catch (error) {
      alert(error.response?.data?.error || 'Could not report this message');
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
            <button onClick={handleBlock} className="inline-flex items-center px-3 py-1 text-xs bg-red-500/20 text-red-300 border border-red-400/30 rounded hover:bg-red-500/30">
              <Ban className="h-3 w-3 mr-1" />
              Block
            </button>
          </div>
        </div>

        {blocked && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-400/30 rounded-lg text-red-300 text-sm">
            This conversation is blocked. Neither side can send messages.
          </div>
        )}

        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg h-[600px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.senderId === user?.id ? 'bg-sky-500 text-white' : 'bg-slate-800 text-white'}`}>
                  {msg.body && <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>}
                  {msg.imageUrl && <img src={msg.imageUrl} alt="attachment" className="mt-2 rounded max-w-full" />}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs opacity-70">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                    {msg.senderId !== user?.id && (
                      <button onClick={() => handleReportMessage(msg.id)} className="inline-flex items-center text-xs opacity-70 hover:opacity-100 ml-2">
                        <Flag className="h-3 w-3 mr-1" />
                        Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 border-t border-white/10">
            {file && (
              <div className="mb-2 inline-flex items-center text-xs bg-slate-800/70 border border-white/10 rounded px-2 py-1">
                <img src={previewUrl} alt="" className="h-8 w-8 object-cover rounded mr-2" />
                <span className="max-w-[12rem] truncate">{file.name}</span>
                <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-2 text-gray-400 hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={blocked}
                title="Attach an image (max 2MB)"
                className="px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-gray-300 hover:text-white disabled:opacity-50 flex items-center"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                type="text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e); }}
                placeholder={blocked ? 'This conversation is blocked' : 'Type a message...'}
                disabled={blocked}
                className="flex-1 px-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50"
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={sending || blocked || (!body.trim() && !file)}
                className="px-4 py-2 bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-lg hover:bg-sky-500/30 disabled:opacity-50 flex items-center"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConversationThread;