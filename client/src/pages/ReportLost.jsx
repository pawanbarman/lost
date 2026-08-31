import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Search, Upload, MapPin, Calendar, Clock } from 'lucide-react';

const ReportLost = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    description: '',
    location: '',
    dateTime: '',
    eventId: '',
    privateDetails: ''
  });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    fetchEvents();
    fetchCategories();
  }, [isAuthenticated, navigate]);

  const fetchEvents = async () => {
    try {
      const response = await api.get('/events');
      setEvents(response.data);
    } catch (error) {
      console.error('Failed to fetch events');
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const data = new FormData();
    data.append('type', 'LOST');
    data.append('title', formData.title);
    data.append('category', formData.category);
    data.append('description', formData.description);
    data.append('location', formData.location);
    data.append('dateTime', formData.dateTime);
    if (formData.eventId) data.append('eventId', formData.eventId);
    if (formData.privateDetails) data.append('privateDetails', formData.privateDetails);
    if (image) data.append('image', image);

    try {
      await api.post('/reports', data);
      navigate('/my-reports');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <Search className="h-8 w-8 text-red-500 mr-3" />
          Report Lost Item
        </h1>
        <p className="mt-2 text-gray-400">
          Provide details about the item you lost to help others find it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Image Upload */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-lg">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Item Photo (Optional)
          </label>
          <div className="border-2 border-dashed border-white/15 rounded-lg p-6 text-center">
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setPreview(null);
                  }}
                  className="mt-2 text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400 mb-2">
                  Click to upload or drag and drop
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="inline-block px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md cursor-pointer hover:bg-sky-500/30 border border-sky-400/30"
                >
                  Choose File
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Basic Information */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              placeholder="e.g., Black Leather Wallet"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Category *
            </label>
            <select
              name="category"
              required
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description *
            </label>
            <textarea
              name="description"
              required
              value={formData.description}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              placeholder="Describe the item in detail (color, brand, size, etc.)"
            />
          </div>
        </div>

        {/* Location and Time */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-lg space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                Location *
              </label>
              <input
                type="text"
                name="location"
                required
                value={formData.location}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g., Library, 2nd floor"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Date & Time *
              </label>
              <input
                type="datetime-local"
                name="dateTime"
                required
                value={formData.dateTime}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Event/Organization (Optional)
            </label>
            <select
              name="eventId"
              value={formData.eventId}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
            >
              <option value="">Select an event (optional)</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} - {event.venue}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Private Details */}
        <div className="bg-amber-500/10 p-6 rounded-lg border border-amber-400/20 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Private Identification Details
            </label>
            <p className="text-xs text-gray-400 mb-2">
              These details will NOT be shown publicly. They will only be used for verification.
            </p>
            <textarea
              name="privateDetails"
              value={formData.privateDetails}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              placeholder="e.g., Scratch on back, contains ID card with name John, blue sticker inside"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-red-500/20 text-red-300 rounded-md font-medium hover:bg-red-500/30 border border-red-400/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit Lost Report'}
        </button>
      </form>
    </div>
  );
};

export default ReportLost;
