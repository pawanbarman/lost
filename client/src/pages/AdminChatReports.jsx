import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

const AdminChatReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await api.get('/admin/chat-reports');
      setReports(response.data || []);
    } catch (error) {
      console.error('Failed to fetch chat reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      await api.put(`/admin/chat-reports/${id}`, { action });
      await fetchReports();
    } catch (error) {
      console.error('Failed to update report:', error);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Chat Reports</h1>
          <p className="text-gray-400">Moderation queue for reported messages</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Reporter</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.reason || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.status}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.reporter?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {r.status === 'OPEN' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleAction(r.id, 'RESOLVE')} className="px-2 py-1 text-xs bg-green-500/20 text-green-300 border border-green-400/30 rounded">Resolve</button>
                          <button onClick={() => handleAction(r.id, 'DISMISS')} className="px-2 py-1 text-xs bg-gray-500/20 text-gray-300 border border-gray-400/30 rounded">Dismiss</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminChatReports;
