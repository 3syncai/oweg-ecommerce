'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { vendorAuthApi, vendorProfileApi } from '@/lib/api/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [redirectPath, setRedirectPath] = useState('/dashboard')
  
  // Get redirect path from URL query parameter on mount
  useEffect(() => {
    const redirect = searchParams.get('redirect')
    if (redirect) {
      setRedirectPath(decodeURIComponent(redirect))
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await vendorAuthApi.login(email, password)
      const token = response.token

      // Store token in localStorage AND cookie for middleware
      localStorage.setItem('vendor_token', token)
      localStorage.setItem('vendor_user', JSON.stringify(response.vendor_user))
      
      // Also set cookie for middleware to detect
      document.cookie = `vendor_token=${token}; path=/; max-age=86400; SameSite=Lax`

      // Check if password reset needed
      if (response?.vendor_user?.must_reset_password) {
        router.push('/reset-password')
        return
      }

      // Check vendor status from login response
      const vendor = response?.vendor
      
      if (vendor) {
        // If vendor is rejected, redirect to reapply page
        if (vendor.rejected_at) {
          router.push('/reapply')
          return
        }
        
        // If vendor is approved, redirect to dashboard
        if (vendor.is_approved) {
          console.log('Login successful, redirecting to:', redirectPath)
          router.replace(redirectPath)
          return
        }
        
        // Vendor is pending, redirect to pending page
        router.push('/pending')
        return
      }

      // Fallback: Check approval status via API if vendor data not in response
      try {
        const meResponse = await vendorProfileApi.getMe()
        const vendorData = meResponse.vendor
        
        // If vendor is rejected, redirect to reapply page
        if (vendorData?.rejected_at) {
          router.push('/reapply')
          return
        }
        
        // Vendor is approved - redirect to the intended path or dashboard
        if (vendorData?.is_approved) {
        console.log('Login successful, redirecting to:', redirectPath)
        router.replace(redirectPath)
          return
        }
        
        // Vendor is pending
        router.push('/pending')
      } catch (meError: any) {
        // If 403, vendor not approved (pending)
        if (meError.status === 403) {
          router.push('/pending')
          return
        }
        // If 401, token might be invalid - clear and show error
        if (meError.status === 401) {
          localStorage.removeItem('vendor_token')
          localStorage.removeItem('vendor_user')
          setError('Invalid credentials. Please try again.')
          return
        }
        throw meError
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.')
      // Clear any partial token storage on error
      localStorage.removeItem('vendor_token')
      localStorage.removeItem('vendor_user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-3xl font-bold text-center text-gray-900">Vendor Login</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your vendor account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          <div className="text-center">
            <Link href="/signup" className="text-sm text-blue-600 hover:text-blue-500">
              Don't have an account? Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

