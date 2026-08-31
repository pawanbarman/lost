import React from 'react';
import { ArrowLeft, Shield, Lock, Eye, Database } from 'lucide-react';

const Privacy = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.history.back()} className="flex items-center text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="h-5 w-5 mr-2" /> Back
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
        <p className="text-gray-400">Last updated: August 2026</p>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            When you use LeftBehind, we collect the following information to provide our Lost & Found services:
          </p>
          <ul className="space-y-3 text-gray-300">
            <li className="flex items-start gap-3">
              <Database className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
              <span><strong className="text-white">Account Information:</strong> Name, email address, and optionally your phone number when you register.</span>
            </li>
            <li className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
              <span><strong className="text-white">Report Data:</strong> Details about lost or found items including descriptions, photos, locations, and dates.</span>
            </li>
            <li className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-sky-400 mt-0.5 shrink-0" />
              <span><strong className="text-white">Private Details:</strong> Verification details you provide are encrypted and only accessible to you, admins, and during the claim verification process.</span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Your Information</h2>
          <ul className="space-y-2 text-gray-300 list-disc list-inside">
            <li>To match lost items with found items using our matching algorithm</li>
            <li>To facilitate the claim and verification process</li>
            <li>To send notifications about matches and claim updates</li>
            <li>To improve our platform and matching accuracy</li>
            <li>To maintain platform security and prevent abuse</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">3. Data Protection</h2>
          <div className="bg-white/5 p-6 rounded-lg border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-6 w-6 text-sky-400" />
              <h3 className="text-lg font-semibold text-white">Security Measures</h3>
            </div>
            <ul className="space-y-2 text-gray-300">
              <li>Passwords are encrypted using bcrypt hashing</li>
              <li>JWT tokens for secure session management</li>
              <li>Private verification details are never exposed publicly</li>
              <li>Rate limiting to prevent abuse</li>
              <li>Input validation on all API endpoints</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">4. Data Sharing</h2>
          <p className="text-gray-300 leading-relaxed">
            We do not sell, trade, or share your personal information with third parties. Your data is only
            shared with other users as necessary for the lost-and-found matching process (e.g., item name,
            category, and location are visible to help with matching). Your email and phone number are not
            shared publicly.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">5. Your Rights</h2>
          <ul className="space-y-2 text-gray-300 list-disc list-inside">
            <li>Access your personal data</li>
            <li>Update your account information</li>
            <li>Delete your reports and account</li>
            <li>Opt out of notifications</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">6. Contact</h2>
          <p className="text-gray-300">
            For privacy-related inquiries, contact us at <span className="text-sky-400">privacy@leftbehind.app</span>
          </p>
        </section>
      </div>
    </div>
  );
};

export default Privacy;
