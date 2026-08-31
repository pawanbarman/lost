import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { MapPin, Calendar, User, FileText, ArrowLeft, Edit, Trash2 } from 'lucide-react';

const ReportDetail = () => {
  const { id } = useParams();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, [id]);

  const fetchReport = async () => {
    try {
      const response = await api.get(`/reports/${id}`);
      setReport(response.data);
    } catch (error) {
      console.error('Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    
    try {
      await api.delete(`/reports/${id}`);
      navigate('/my-reports');
    } catch (error) {
      console.error('Failed to delete report');
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Report not found</p>
      </div>
    );
  }

  const isOwner = report.userId === user?.id;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-400 hover:text-white mb-6"
      >
        <ArrowLeft className="h-5 w-5 mr-2" />
        Back
      </button>

      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        {report.item.imageUrl && (
          <img
            src={report.item.imageUrl}
            alt={report.item.title}
            className="w-full h-64 object-cover"
          />
        )}

        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white">{report.item.title}</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-3 py-1 text-sm font-medium rounded ${report.type === 'LOST' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                  {report.type}
                </span>
                <span className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(report.status)}`}>
                  {report.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {(isOwner || isAdmin) && (
              <div className="flex gap-2">
                {isOwner && (
                  <>
                    <button
                      onClick={() => navigate(`/reports/${id}/edit`)}
                      className="p-2 text-sky-400 hover:bg-sky-500/20 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Category</p>
                  <p className="font-medium text-white">{report.item.category}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Location</p>
                  <p className="font-medium text-white">{report.location}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Date & Time</p>
                  <p className="font-medium text-white">
                    {new Date(report.dateTime).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-400">Reported By</p>
                  <p className="font-medium text-white">{report.user.name}</p>
                </div>
              </div>

              {report.item.currentLocation && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-sm text-gray-400">Current Location</p>
                    <p className="font-medium text-green-400">{report.item.currentLocation}</p>
                  </div>
                </div>
              )}

              {report.event && (
                <div>
                  <p className="text-sm text-gray-400">Event</p>
                  <p className="font-medium text-white">{report.event.name}</p>
                  <p className="text-sm text-gray-400">{report.event.venue}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-white mb-2">Description</h3>
            <p className="text-gray-300">{report.item.description}</p>
          </div>

          {(isOwner || isAdmin) && report.item.privateDetails && (
            <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
              <h3 className="font-semibold text-yellow-400 mb-2">Private Verification Details</h3>
              <p className="text-sm text-gray-300">{report.item.privateDetails}</p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-white/10 text-sm text-gray-400">
            <p>Report ID: {report.id}</p>
            <p>Submitted: {new Date(report.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportDetail;
