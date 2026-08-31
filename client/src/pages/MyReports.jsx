import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FileText, MapPin, Calendar, Trash2, Edit } from 'lucide-react';

const MyReports = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchReports();
  }, [isAuthenticated]);

  const fetchReports = async () => {
    try {
      const response = await api.get('/reports/my');
      setReports(response.data);
    } catch (error) {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    
    try {
      await api.delete(`/reports/${id}`);
      setReports(reports.filter(r => r.id !== id));
    } catch (error) {
      console.error('Failed to delete report');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      LOST: 'bg-red-500/20 text-red-300',
      FOUND: 'bg-green-500/20 text-green-300',
      POSSIBLE_MATCH: 'bg-yellow-500/20 text-yellow-300',
      UNDER_VERIFICATION: 'bg-orange-500/20 text-orange-300',
      CLAIMED: 'bg-purple-500/20 text-purple-300',
      RETURNED: 'bg-green-500/20 text-green-300',
      CLOSED: 'bg-white/10 text-gray-300'
    };
    return colors[status] || 'bg-white/10 text-gray-300';
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to view your reports</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <FileText className="h-8 w-8 text-primary-600 mr-3" />
          My Reports
        </h1>
        <p className="mt-2 text-gray-400">
          View and manage your lost and found reports
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No reports yet</h3>
          <p className="text-gray-400 mb-6">
            You haven't submitted any lost or found reports.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/report/lost"
              className="px-6 py-2 bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/30 border border-red-400/30"
            >
              Report Lost Item
            </a>
            <a
              href="/report/found"
              className="px-6 py-2 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30"
            >
              Report Found Item
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">
                        {report.item.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${report.type === 'LOST' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                          {report.type}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(report.status)}`}>
                          {report.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {report.item.imageUrl && (
                      <img
                        src={report.item.imageUrl}
                        alt={report.item.title}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2" />
                      <span className="font-medium">Category:</span>
                      <span className="ml-2">{report.item.category}</span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-2" />
                      <span className="font-medium">Location:</span>
                      <span className="ml-2">{report.location}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span className="font-medium">Date:</span>
                      <span className="ml-2">{new Date(report.dateTime).toLocaleString()}</span>
                    </div>
                    {report.event && (
                      <div className="flex items-center">
                        <span className="font-medium">Event:</span>
                        <span className="ml-2">{report.event.name}</span>
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-gray-300 text-sm line-clamp-2">
                    {report.item.description}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => navigate(`/reports/${report.id}`)}
                    className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 text-sm"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => navigate(`/reports/${report.id}/edit`)}
                    className="px-4 py-2 bg-white/10 text-gray-300 rounded-md hover:bg-white/15 border border-white/10 text-sm flex items-center justify-center"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(report.id)}
                    className="px-4 py-2 bg-red-500/10 text-red-400 rounded-md hover:bg-red-500/20 border border-red-400/20 text-sm flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyReports;
