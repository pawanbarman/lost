import React from 'react';
import { ArrowLeft, FileText, AlertTriangle, CheckCircle, Scale } from 'lucide-react';

const Terms = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.history.back()} className="flex items-center text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="h-5 w-5 mr-2" /> Back
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Terms & Conditions</h1>
        <p className="text-gray-400">Last updated: August 2026</p>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-300 leading-relaxed">
            By accessing or using LeftBehind, you agree to be bound by these Terms & Conditions.
            If you do not agree, please do not use our platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">2. Platform Description</h2>
          <p className="text-gray-300 leading-relaxed">
            LeftBehind is a Lost & Found platform that connects people who have lost items with people
            who have found items. We facilitate matching, verification, and communication between parties,
            but we are not a party to any transaction or handover.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">3. User Responsibilities</h2>
          <div className="space-y-4">
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <h3 className="font-semibold text-white">You agree to:</h3>
              </div>
              <ul className="space-y-2 text-gray-300 list-disc list-inside ml-8">
                <li>Provide accurate and truthful information in reports</li>
                <li>Only claim items you genuinely believe are yours</li>
                <li>Respond to messages and claims in a timely manner</li>
                <li>Complete handovers honestly and safely</li>
              </ul>
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <h3 className="font-semibold text-white">You agree NOT to:</h3>
              </div>
              <ul className="space-y-2 text-gray-300 list-disc list-inside ml-8">
                <li>Submit false, misleading, or fraudulent reports</li>
                <li>Claim items that do not belong to you</li>
                <li>Use the platform for spam or malicious purposes</li>
                <li>Attempt to circumvent the verification process</li>
                <li>Harass or abuse other users</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">4. Verification Process</h2>
          <p className="text-gray-300 leading-relaxed">
            LeftBehind uses a verification system to help confirm item ownership. However, we cannot
            guarantee the accuracy of verification details provided by users. Both parties are responsible
            for conducting their own due diligence during the handover process.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">5. Limitation of Liability</h2>
          <p className="text-gray-300 leading-relaxed">
            LeftBehind is a platform for connecting people. We are not responsible for the condition,
            value, or authenticity of items reported, nor for the conduct of users during handovers.
            Use the platform at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">6. Account Termination</h2>
          <p className="text-gray-300 leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these terms, submit
            fraudulent reports, or engage in harmful behavior on the platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">7. Changes to Terms</h2>
          <p className="text-gray-300 leading-relaxed">
            We may update these terms from time to time. Continued use of the platform after changes
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="text-center py-8 bg-white/5 rounded-lg border border-white/10">
          <Scale className="h-12 w-12 text-sky-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Questions?</h2>
          <p className="text-gray-400">Contact us at <span className="text-sky-400">legal@leftbehind.app</span></p>
        </section>
      </div>
    </div>
  );
};

export default Terms;
