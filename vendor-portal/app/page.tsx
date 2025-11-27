'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white">
      {/* Header/Navigation */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center">
              <Link href="http://localhost:3000">
                <Image
                  src="/Oweg.png"
                  alt="OWEG Logo"
                  width={140}
                  height={48}
                  className="h-12 w-auto cursor-pointer"
                  priority
                />
              </Link>
            </div>
            <nav className="flex items-center gap-8">
              <Link
                href="http://localhost:3000"
                className="text-gray-700 hover:text-[#00D26A] font-medium transition-colors"
              >
                Home
              </Link>
              <Link
                href="/about"
                className="text-gray-700 hover:text-[#00D26A] font-medium transition-colors"
              >
                About
              </Link>
              <Link
                href="/blog"
                className="text-gray-700 hover:text-[#00D26A] font-medium transition-colors"
              >
                Blog
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white pt-16 pb-24 md:pt-24 md:pb-32 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                🚀 India's Fastest Growing Platform
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
                Sell Online with
                <br />
                <span className="bg-gradient-to-r from-white to-green-100 bg-clip-text text-transparent">OWEG</span>
              </h1>
              <p className="text-lg md:text-xl mb-10 text-white/90 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Join thousands of sellers and grow your business with India's fastest-growing e-commerce platform. Zero commission, instant setup.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => router.push('/signup')}
                  className="bg-white text-[#00D26A] px-10 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 transition-all shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 hover:scale-105"
                >
                  Start Selling Now →
                </button>
                <Link
                  href="/login"
                  className="bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-white/20 transition-all text-center"
                >
                  Sign In
                </Link>
              </div>
              
              {/* Stats */}
              <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg mx-auto lg:mx-0">
                <div className="text-center lg:text-left">
                  <div className="text-4xl font-extrabold mb-1">10K+</div>
                  <div className="text-sm text-white/80 font-medium">Active Sellers</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-4xl font-extrabold mb-1">50K+</div>
                  <div className="text-sm text-white/80 font-medium">Products Listed</div>
                </div>
                <div className="text-center lg:text-left">
                  <div className="text-4xl font-extrabold mb-1">24/7</div>
                  <div className="text-sm text-white/80 font-medium">Support</div>
                </div>
              </div>
            </div>
            
            {/* Hero Image */}
            <div className="hidden lg:flex justify-center items-center">
              <div className="relative w-full max-w-lg">
                <div className="relative transform hover:scale-105 transition-transform duration-500">
                  <Image
                    src="/Oweg3d-400.png"
                    alt="OWEG Platform"
                    width={600}
                    height={600}
                    className="w-full h-auto"
                    quality={100}
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-block mb-4 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
              Why Choose Us
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Why Sell with OWEG?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to grow your online business, all in one place
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Card 1 */}
            <div className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-[#00D26A]/30 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Zero Commission</h3>
              <p className="text-gray-600 leading-relaxed">
                Start selling with zero commission fees. Keep 100% of your profits and grow faster.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-[#00D26A]/30 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Fast Payments</h3>
              <p className="text-gray-600 leading-relaxed">
                Get paid quickly with secure and reliable payment processing. No delays.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-[#00D26A]/30 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Analytics</h3>
              <p className="text-gray-600 leading-relaxed">
                Track sales, orders, and performance with detailed analytics dashboard.
              </p>
            </div>

            {/* Card 4 */}
            <div className="group bg-white p-8 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-[#00D26A]/30 hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">24/7 Support</h3>
              <p className="text-gray-600 leading-relaxed">
                Get help whenever you need it with our dedicated support team always ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-block mb-4 px-4 py-2 bg-[#00D26A]/10 rounded-full text-sm font-semibold text-[#00D26A]">
              Getting Started
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start selling in just 3 simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connection lines - hidden on mobile */}
            <div className="hidden md:block absolute top-10 left-1/6 right-1/6 h-1 bg-gradient-to-r from-[#00D26A] via-[#00D26A] to-[#00D26A] opacity-20" style={{top: '2.5rem'}}></div>
            
            {/* Step 1 */}
            <div className="text-center relative">
              <div className="w-20 h-20 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-3xl font-bold shadow-xl relative z-10">
                1
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Sign Up</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Create your vendor account in minutes. Complete your profile and get verified instantly.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center relative">
              <div className="w-20 h-20 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-3xl font-bold shadow-xl relative z-10">
                2
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Add Products</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Upload your products with images, descriptions, and pricing. Our team reviews quickly.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center relative">
              <div className="w-20 h-20 bg-gradient-to-br from-[#00D26A] to-[#00B856] rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-3xl font-bold shadow-xl relative z-10">
                3
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Start Selling</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Once approved, your products go live and customers can start ordering immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 bg-gradient-to-br from-[#00D26A] via-[#00BD5F] to-[#00A551] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Ready to Start Selling?
          </h2>
          <p className="text-xl md:text-2xl mb-10 text-white/90 max-w-2xl mx-auto">
            Join thousands of successful sellers on OWEG today and grow your business
          </p>
          <button
            onClick={() => router.push('/signup')}
            className="bg-white text-[#00D26A] px-12 py-5 rounded-xl font-bold text-xl hover:bg-gray-50 transition-all shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 hover:scale-105 inline-block"
          >
            Get Started Free →
          </button>
          <div className="mt-8 flex items-center justify-center gap-6 text-white/80 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free to sign up
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Start in minutes
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div>
              <Image
                src="/Oweg.png"
                alt="OWEG Logo"
                width={140}
                height={48}
                className="h-10 w-auto mb-6 brightness-0 invert"
              />
              <p className="text-sm leading-relaxed">
                India's fastest-growing e-commerce platform for sellers. Start selling today!
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-5 text-lg">For Sellers</h4>
              <ul className="space-y-3 text-sm">
                <li><Link href="/signup" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Become a Seller</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Seller Login</Link></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Seller Resources</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-5 text-lg">Support</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">FAQs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-5 text-lg">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Seller Agreement</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} OWEG. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}