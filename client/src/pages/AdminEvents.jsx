import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Calendar, MapPin, Plus, Trash2, QrCode } from 'lucide-react';

const AdminEvents = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [qrEvent, setQrEvent] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    venue: '',
    location: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
      return;
    }
    fetchEvents();
  }, [isAuthenticated, isAdmin, navigate]);

  const fetchEvents = async () => {
    try {
      const response = await api.get('/events');
      setEvents(response.data);
    } catch (error) {
      console.error('Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/events', formData);
      setShowForm(false);
      setFormData({ name: '', venue: '', location: '', startDate: '', endDate: '' });
      fetchEvents();
    } catch (error) {
      console.error('Failed to create event');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await api.delete(`/events/${id}`);
      setEvents(events.filter(e => e.id !== id));
    } catch (error) {
      console.error('Failed to delete event');
    }
  };

  const toggleActive = async (id, active) => {
    try {
      await api.put(`/events/${id}`, { active: !active });
      setEvents(events.map(e => 
        e.id === id ? { ...e, active: !active } : e
      ));
    } catch (error) {
      console.error('Failed to toggle event status');
    }
  };

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Calendar className="h-8 w-8 text-sky-400 mr-3" />
            Event Management
          </h1>
          <p className="mt-2 text-gray-400">
            Create and manage events for lost & found reporting
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30"
        >
          <Plus className="h-5 w-5 mr-2" />
          Create Event
        </button>
      </div>

      {showForm && (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Create New Event</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                  placeholder="e.g., College Fest 2026"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Venue</label>
                <input
                  type="text"
                  required
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                  placeholder="e.g., Main Campus"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                  placeholder="e.g., University Ground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30"
              >
                Create Event
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 bg-white/10 text-gray-300 rounded-md hover:bg-white/20 border border-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div key={event.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white">{event.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${event.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {event.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(event.id)}
                  className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  {event.venue}
                </div>
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  {event.location}
                </div>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2" />
                  {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
                <button
                  onClick={() => toggleActive(event.id, event.active)}
                  className="flex-1 py-2 px-3 bg-white/10 text-gray-300 rounded-md hover:bg-white/20 border border-white/10 text-sm"
                >
                  {event.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => setQrEvent(qrEvent?.id === event.id ? null : event)}
                  className="flex-1 py-2 px-3 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 text-sm flex items-center justify-center"
                >
                  <QrCode className="h-4 w-4 mr-1" />
                  QR Code
                </button>
              </div>

              {qrEvent?.id === event.id && (
                <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                  <p className="text-sm text-gray-400 mb-3">Event QR Code</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(window.location.origin + '/report/lost?eventId=' + event.id)}&size=200x200&bgcolor=030407&color=38bdf8`}
                    alt={`QR Code for ${event.name}`}
                    className="mx-auto rounded-lg border border-white/10"
                  />
                  <p className="text-xs text-gray-500 mt-3 font-mono break-all">
                    {window.location.origin}/report/lost?eventId={event.id}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin + '/report/lost?eventId=' + event.id);
                    }}
                    className="mt-2 text-xs text-sky-400 hover:text-sky-300"
                  >
                    Copy Link
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminEvents;
