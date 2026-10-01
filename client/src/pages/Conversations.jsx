import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Clock, CheckCircle, Ban } from 'lucide-react';
import api from '../utils/api';

const Conversations = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await api.get('/conversations');
      setConversations(response.data || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACCEPTED':
        return <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full border border-green-400/30 flex items-center"><CheckCircle className="h-3 w-3 mr-1" />Accepted</span>;
      case 'PENDING':
        return <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full border border-yellow-400/30 flex items-center"><Clock className="h-3 w-3 mr-1" />Pending</span>;
      case 'BLOCKED':
        return <span className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full border border-red-400/30 flex items-center"><Ban className="h-3 w-3 mr-1" />Blocked</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Conversations</h1>
          <p className="text-gray-400">Your messages with finders/owners</p>
        </div>

        {conversations.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg p-8 text-center">
            <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                to={`/conversations/${conv.id}`}
                className="block bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 hover:border-sky-400/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Conversation</h3>
                    <p className="text-gray-400 text-sm mt-1">{conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : ''}</p>
                  </div>
                  {getStatusBadge(conv.status)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
