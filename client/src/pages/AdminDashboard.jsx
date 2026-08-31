import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Users, FileText, Heart, CheckCircle, ArrowRight, Shield } from 'lucide-react';

const AdminDashboard = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (!isAdmin) {
      navigate('/');
      return;
    }

    fetchStats();
  }, [isAuthenticated, isAdmin, navigate]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/dashboard');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
      </div>
    );
  }

  const statCards = [
    { title: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'bg-sky-500/20 text-sky-400' },
    { title: 'Active Lost Reports', value: stats?.activeLostReports || 0, icon: FileText, color: 'bg-red-500/20 text-red-400' },
    { title: 'Active Found Reports', value: stats?.activeFoundReports || 0, icon: FileText, color: 'bg-green-500/20 text-green-400' },
    { title: 'Possible Matches', value: stats?.possibleMatches || 0, icon: Heart, color: 'bg-yellow-500/20 text-yellow-400' },
    { title: 'Pending Claims', value: stats?.pendingClaims || 0, icon: CheckCircle, color: 'bg-purple-500/20 text-purple-400' },
    { title: 'Returned Items', value: stats?.returnedItems || 0, icon: CheckCircle, color: 'bg-green-500/20 text-green-400' },
    { title: 'Closed Cases', value: stats?.closedCases || 0, icon: FileText, color: 'bg-gray-500/20 text-gray-400' },
  ];

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <Shield className="h-8 w-8 text-purple-400 mr-3" />
          Admin Dashboard
        </h1>
        <p className="mt-2 text-gray-400">
          Overview of platform activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <div key={index} className="bg-white/5 backdrop-blur-sm border border-sky-400/20 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">{stat.title}</p>
                <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-full`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/admin/reports')}
            className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="font-medium text-white">View All Reports</span>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </button>
          <button
            onClick={() => navigate('/admin/claims')}
            className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="font-medium text-white">Review Claims</span>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </button>
          <button
            onClick={() => navigate('/admin/users')}
            className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="font-medium text-white">Manage Users</span>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </button>
          <button
            onClick={() => navigate('/admin/events')}
            className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="font-medium text-white">Manage Events</span>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
