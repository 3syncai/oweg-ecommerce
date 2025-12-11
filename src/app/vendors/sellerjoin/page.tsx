'use client';

import React from 'react';

export default function SellerJoinPage() {
  const steps = [
    { title: 'Why OWEG', points: ['Local + online reach', 'Trusted logistics and secure payments', 'Dedicated vendor support'] },
    { title: 'How to Start?', points: ['Create your seller profile', 'Add GST / KYC details', 'List products with images and pricing'] },
    { title: 'How to Sell?', points: ['Manage inventory and orders in one place', 'Use shipping labels we generate', 'Track payouts from your dashboard'] },
    { title: 'Policies and Rules', points: ['Follow quality and authenticity standards', 'Ship within promised timelines', 'Transparent pricing and returns'] },
    { title: 'Privacy Policy', points: ['Data is encrypted at rest and in transit', 'You control your product and pricing data'] },
    { title: 'User Agreement', points: ['Payouts aligned to delivery confirmations', 'Fair-use terms to keep the marketplace safe'] },
    { title: 'FAQ', points: ['How do fees work?', 'Can I self-ship?', 'How fast are payouts?'] },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Vendors · Sellers</p>
          <h1 className="text-3xl sm:text-4xl font-semibold">Start selling on OWEG</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Everything you need to know before you start—clear process, policies, and support.
          </p>
        </header>

        <section className="space-y-6">
          {steps.map((step) => (
            <div key={step.title} className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">{step.title}</h2>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {step.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-800">Ready to begin?</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:brightness-95 transition"
            >
              Signup (Vendors)
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white text-emerald-700 border border-emerald-200 text-sm font-semibold shadow-sm hover:bg-emerald-50 transition"
            >
              Login (Vendors)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
