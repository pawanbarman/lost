import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { FileText, MapPin, Calendar, Filter, CheckCircle, XCircle, Flag } from 'lucide-react';

const AdminReports = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', status: '', flagged: '' });
  const [flaggingId, setFlaggingId] = useState(null);
  const [flagReason, setFlagReason] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
      return;
    }
    fetchReports();
  }, [isAuthenticated, isAdmin, navigate, filters]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (filters.flagged === 'flagged') {
        const response = await api.get('/admin/reports/flagged');
        setReports(response.data);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);

      const response = await api.get(`/admin/reports?${params.toString()}`);
      setReports(response.data);
    } catch (error) {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (reportId, newStatus) => {
    try {
      await api.put(`/admin/reports/${reportId}/status`, { status: newStatus });
      setReports(reports.map(r => 
        r.id === reportId ? { ...r, status: newStatus } : r
      ));
    } catch (error) {
      console.error('Failed to update status');
    }
  };

  const handleFlag = async (reportId) => {
    const reason = prompt('Enter a reason for flagging this report:');
    if (!reason || !reason.trim()) return;
    try {
      await api.put(`/admin/reports/${reportId}/flag`, { reason: reason.trim() });
      setReports(reports.map(r => 
        r.id === reportId ? { ...r, isFlagged: true, flaggedReason: reason.trim() } : r
      ));
    } catch (error) {
      console.error('Failed to flag report');
    }
  };

  const handleUnflag = async (reportId) => {
    try {
      await api.put(`/admin/reports/${reportId}/unflag`);
      setReports(reports.map(r => 
        r.id === reportId ? { ...r, isFlagged: false, flaggedReason: null } : r
      ));
    } catch (error) {
      console.error('Failed to unflag report');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      LOST: 'bg-red-500/20 text-red-400',
      FOUND: 'bg-green-500/20 text-green-400',
      POSSIBLE_MATCH: 'bg-yellow-500/20 text-yellow-400',
      UNDER_VERIFICATION: 'bg-orange-500/20 text-orange-400',
      CLAIMED: 'bg-purple-500/20 text-purple-400',
      RETURNED: 'bg-green-500/20 text-green-400',
      CLOSED: 'bg-gray-500/20 text-gray-400'
    };
    return colors[status] || 'bg-gray-500/20 text-gray-400';
  };

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <FileText className="h-8 w-8 text-sky-400 mr-3" />
          All Reports
        </h1>
        <p className="mt-2 text-gray-400">
          View and manage all lost and found reports
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-lg mb-6 flex gap-4 flex-wrap">
        <Filter className="h-5 w-5 text-gray-400 mt-2" />
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
        >
          <option value="">All Types</option>
          <option value="LOST">Lost</option>
          <option value="FOUND">Found</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
        >
          <option value="">All Statuses</option>
          <option value="LOST">Lost</option>
          <option value="FOUND">Found</option>
          <option value="POSSIBLE_MATCH">Possible Match</option>
          <option value="UNDER_VERIFICATION">Under Verification</option>
          <option value="CLAIMED">Claimed</option>
          <option value="RETURNED">Returned</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          value={filters.flagged}
          onChange={(e) => setFilters({ ...filters, flagged: e.target.value })}
          className="px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
        >
          <option value="">All Reports</option>
          <option value="flagged">Flagged Reports</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Flagged</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {report.item.imageUrl && (
                        <img
                          src={report.item.imageUrl}
                          alt={report.item.title}
                          className="h-10 w-10 rounded object-cover mr-3"
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-white">{report.item.title}</div>
                        <div className="text-sm text-gray-400">{report.item.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${report.type === 'LOST' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                      {report.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {report.user.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {report.location}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(report.status)}`}>
                      {report.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {report.isFlagged ? (
                      <div className="flex items-center gap-1 text-yellow-400" title={report.flaggedReason}>
                        <Flag className="h-4 w-4" />
                        <span className="text-xs">Flagged</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <select
                        value={report.status}
                        onChange={(e) => updateStatus(report.id, e.target.value)}
                        className="px-2 py-1 border rounded text-xs focus:ring-sky-500 focus:border-sky-500"
                      >
                        <option value="LOST">Lost</option>
                        <option value="FOUND">Found</option>
                        <option value="POSSIBLE_MATCH">Possible Match</option>
                        <option value="UNDER_VERIFICATION">Under Verification</option>
                        <option value="CLAIMED">Claimed</option>
                        <option value="RETURNED">Returned</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                      {report.isFlagged ? (
                        <button
                          onClick={() => handleUnflag(report.id)}
                          className="px-2 py-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-400/30 rounded"
                        >
                          Unflag
                        </button>
                      ) : (
                        <button
                          onClick={() => handleFlag(report.id)}
                          className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-400/30 rounded"
                        >
                          Flag
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                    No reports found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminReports;
