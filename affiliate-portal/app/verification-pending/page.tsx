"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react"

export default function VerificationPendingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("affiliate_token")
    const userData = localStorage.getItem("affiliate_user")

    if (!token || !userData) {
      router.push("/login")
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)

      // If user is approved, redirect to dashboard
      if (parsedUser.is_approved) {
        router.push("/dashboard")
        return
      }

      // If user is rejected, show rejection message
      if (parsedUser.rejected_at) {
        // Will be handled in the render
      }
    } catch (e) {
      console.error("Error parsing user data:", e)
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }, [router])

  const checkStatus = async () => {
    setChecking(true)
    try {
      const { apiRequest } = await import("../../lib/api-client")
      const token = localStorage.getItem("affiliate_token")

      const response = await apiRequest("/affiliate/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem("affiliate_user", JSON.stringify(data.user))
        setUser(data.user)

        if (data.user.is_approved) {
          router.push("/dashboard")
        } else if (data.user.rejected_at) {
          // Stay on page to show rejection
        }
      }
    } catch (err) {
      console.error("Error checking status:", err)
    } finally {
      setChecking(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("affiliate_token")
    localStorage.removeItem("affiliate_user")
    localStorage.removeItem("affiliate_role")
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  // If user is rejected
  if (user?.rejected_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Rejected</h2>
            <p className="text-gray-600 mb-4">
              Your affiliate application has been rejected.
            </p>
            {user.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-red-800 mb-1">Reason:</p>
                <p className="text-sm text-red-700">{user.rejection_reason}</p>
              </div>
            )}
            <div className="space-y-3">
              <button
                onClick={handleLogout}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // If user is pending approval
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <Clock className="w-16 h-16 text-yellow-500 mx-auto mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Pending</h2>
          <p className="text-gray-600 mb-6">
            Your registration is under review. Our team will verify your details and get back to you soon.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>What happens next?</strong>
            </p>
            <ul className="text-sm text-blue-700 mt-2 text-left list-disc list-inside space-y-1">
              <li>Our admin team will review your application</li>
              <li>We'll verify your documents and information</li>
              <li>You'll receive access to your dashboard once approved</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={checkStatus}
              disabled={checking}
              className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {checking ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Status
                </>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            >
              Logout
            </button>
          </div>

          {user && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Registered as: {user.first_name} {user.last_name}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Email: {user.email}
              </p>
              {user.refer_code && (
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs font-semibold text-indigo-800 mb-1">Your Referral Code:</p>
                  <p className="text-lg font-bold text-indigo-900">{user.refer_code}</p>
                  <p className="text-xs text-indigo-600 mt-1">
                    Share this code with others to earn commissions!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

