import React, { useState } from 'react';
import { ArrowLeft, Mail, MessageSquare, Send } from 'lucide-react';

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.history.back()} className="flex items-center text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="h-5 w-5 mr-2" /> Back
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Contact Us</h1>
        <p className="text-xl text-sky-300">Have questions, feedback, or need help? We'd love to hear from you.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
          <Mail className="h-8 w-8 text-sky-400 mx-auto mb-3" />
          <h3 className="font-semibold text-white mb-2">Email</h3>
          <p className="text-gray-400 text-sm">support@leftbehind.app</p>
        </div>
        <div className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
          <MessageSquare className="h-8 w-8 text-sky-400 mx-auto mb-3" />
          <h3 className="font-semibold text-white mb-2">Feedback</h3>
          <p className="text-gray-400 text-sm">We value your input</p>
        </div>
        <div className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
          <Send className="h-8 w-8 text-sky-400 mx-auto mb-3" />
          <h3 className="font-semibold text-white mb-2">Response Time</h3>
          <p className="text-gray-400 text-sm">Within 24 hours</p>
        </div>
      </div>

      {submitted ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-8 text-center">
          <h3 className="text-xl font-semibold text-green-400 mb-2">Message Sent!</h3>
          <p className="text-gray-300">Thank you for reaching out. We'll get back to you within 24 hours.</p>
          <button onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
            className="mt-4 px-6 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30">
            Send Another Message
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-8 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
              <input type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
                placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
              <input type="email" required value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
                placeholder="you@example.com" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Subject *</label>
            <input type="text" required value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              placeholder="How can we help?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Message *</label>
            <textarea required value={formData.message} rows={6}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full px-3 py-2 rounded-md focus:ring-sky-500 focus:border-sky-500"
              placeholder="Tell us more..." />
          </div>
          <button type="submit"
            className="w-full py-3 px-4 bg-sky-500/20 text-sky-300 rounded-md font-medium hover:bg-sky-500/30 border border-sky-400/30">
            Send Message
          </button>
        </form>
      )}
    </div>
  );
};

export default Contact;
