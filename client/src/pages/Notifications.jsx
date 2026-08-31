import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Bell, Check, CheckCheck } from 'lucide-react';

const Notifications = () => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
  }, [isAuthenticated]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, isRead: true } : n
      ));
    } catch (error) {
      console.error('Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all as read');
    }
  };

  const getNotificationIcon = (type) => {
    const icons = {
      MATCH_FOUND: '💡',
      CLAIM_SUBMITTED: '📋',
      CLAIM_APPROVED: '✅',
      CLAIM_REJECTED: '❌',
      ITEM_RETURNED: '🎉',
      REPORT_UPDATED: '📝',
      SYSTEM: 'ℹ️'
    };
    return icons[type] || '📢';
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to view notifications</p>
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Bell className="h-8 w-8 text-sky-400 mr-3" />
            Notifications
          </h1>
          <p className="mt-2 text-gray-400">
            Stay updated with latest activities
          </p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button
            onClick={markAllAsRead}
            className="flex items-center px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30"
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark All Read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
          <Bell className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No notifications</h3>
          <p className="text-gray-400">
            You're all caught up!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white/5 backdrop-blur-sm rounded-lg p-4 border-l-4 ${
                notification.isRead ? 'border-gray-600 border border-white/10' : 'border-sky-400 border border-white/10'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl">{getNotificationIcon(notification.type)}</div>
                <div className="flex-1">
                  <p className={`text-white ${notification.isRead ? 'text-gray-400' : 'font-semibold'}`}>
                    {notification.message}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                {!notification.isRead && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="p-2 hover:bg-white/10 rounded-full"
                    title="Mark as read"
                  >
                    <Check className="h-5 w-5 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
