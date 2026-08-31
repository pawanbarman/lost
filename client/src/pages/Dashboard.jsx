import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { LayoutDashboard, FileText, Heart, CheckCircle, Bell, Search, MapPin, Calendar, ArrowRight } from 'lucide-react';

const Dashboard = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ lost: 0, found: 0, matches: 0, claims: 0, returned: 0 });
  const [recentReports, setRecentReports] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchDashboard();
  }, [isAuthenticated, navigate]);

  const fetchDashboard = async () => {
    try {
      const [reportsRes, matchesRes, claimsRes, notifRes] = await Promise.all([
        api.get('/reports/my'),
        api.get('/matches'),
        api.get('/claims'),
        api.get('/notifications')
      ]);

      const reports = reportsRes.data;
      const matches = matchesRes.data;
      const claims = claimsRes.data;
      const notifs = notifRes.data;

      setStats({
        lost: reports.filter(r => r.type === 'LOST').length,
        found: reports.filter(r => r.type === 'FOUND').length,
        matches: matches.length,
        claims: claims.length,
        returned: reports.filter(r => r.status === 'RETURNED').length
      });

      setRecentReports(reports.slice(0, 5));
      setRecentMatches(matches.slice(0, 3));
      setNotifications(notifs.filter(n => !n.isRead).slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard');
    } finally {
      setLoading(false);
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
          <LayoutDashboard className="h-8 w-8 text-sky-400 mr-3" />
          Dashboard
        </h1>
        <p className="mt-2 text-gray-400">
          Welcome back, {user?.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Lost Items', value: stats.lost, icon: Search, color: 'text-red-400', bg: 'bg-red-500/20' },
          { label: 'Found Items', value: stats.found, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
          { label: 'Matches', value: stats.matches, icon: Heart, color: 'text-pink-400', bg: 'bg-pink-500/20' },
          { label: 'Claims', value: stats.claims, icon: FileText, color: 'text-sky-400', bg: 'bg-sky-500/20' },
          { label: 'Returned', value: stats.returned, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' }
        ].map((stat, i) => (
          <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4">
            <div className={`${stat.bg} p-2 rounded-lg inline-block mb-2`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Reports */}
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">My Recent Reports</h2>
            <Link to="/my-reports" className="text-sky-400 hover:text-sky-300 text-sm flex items-center">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-400">No reports yet</p>
              <div className="flex gap-3 justify-center mt-4">
                <Link to="/report/lost" className="px-4 py-2 bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/30 border border-red-400/30 text-sm">
                  Report Lost
                </Link>
                <Link to="/report/found" className="px-4 py-2 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30 text-sm">
                  Report Found
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                >
                  {report.item.imageUrl ? (
                    <img src={report.item.imageUrl} alt={report.item.title} className="w-12 h-12 rounded object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-white/10 rounded flex items-center justify-center">
                      <FileText className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{report.item.title}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{report.location}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${report.type === 'LOST' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                      {report.type}
                    </span>
                    <span className={`block mt-1 px-2 py-1 text-xs font-medium rounded ${getStatusColor(report.status)}`}>
                      {report.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Notifications */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <Bell className="h-5 w-5 text-sky-400 mr-2" />
                Notifications
              </h2>
              <Link to="/notifications" className="text-sky-400 hover:text-sky-300 text-sm">
                View All
              </Link>
            </div>
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-sm">No new notifications</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 bg-white/5 rounded-lg border-l-2 border-sky-400">
                    <p className="text-sm text-gray-300">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link to="/report/lost" className="block w-full py-2 px-4 bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/30 border border-red-400/30 text-center text-sm font-medium">
                Report Lost Item
              </Link>
              <Link to="/report/found" className="block w-full py-2 px-4 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30 text-center text-sm font-medium">
                Report Found Item
              </Link>
              <Link to="/search" className="block w-full py-2 px-4 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 text-center text-sm font-medium">
                Search Items
              </Link>
            </div>
          </div>

          {/* Recent Matches */}
          {recentMatches.length > 0 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center">
                  <Heart className="h-5 w-5 text-pink-400 mr-2" />
                  Matches
                </h2>
                <Link to="/matches" className="text-sky-400 hover:text-sky-300 text-sm">
                  View All
                </Link>
              </div>
              <div className="space-y-3">
                {recentMatches.map((match) => (
                  <div key={match.id} className="p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white truncate">{match.lostReport.item.title}</span>
                      <span className={`text-sm font-bold ${match.score >= 80 ? 'text-green-400' : match.score >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {match.score}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">vs {match.foundReport.item.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
