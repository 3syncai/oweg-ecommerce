"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("affiliate_token")
    const userData = localStorage.getItem("affiliate_user")
    const role = localStorage.getItem("affiliate_role")

    if (!token || !userData) {
      router.push("/login")
      return
    }

    // If admin, redirect to admin dashboard
    if (role === "admin") {
      router.push("/admin/dashboard")
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      
      // Check if user is approved
      if (!parsedUser.is_approved) {
        router.push("/verification-pending")
        return
      }

      // If rejected, redirect to pending page (which will show rejection)
      if (parsedUser.rejected_at) {
        router.push("/verification-pending")
        return
      }

      setUser(parsedUser)
    } catch (e) {
      console.error("Error parsing user data:", e)
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem("affiliate_token")
    localStorage.removeItem("affiliate_user")
    localStorage.removeItem("affiliate_role")
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">Affiliate Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : user?.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 className="text-2xl font-bold mb-4">Welcome to Your Affiliate Dashboard</h2>
            <p className="text-gray-600 mb-4">
              This is your affiliate user dashboard. Here you can manage your affiliate activities,
              track referrals, and view your earnings.
            </p>
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Your Information:</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>Name: {user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : "N/A"}</li>
                <li>Email: {user?.email}</li>
                {user?.phone && <li>Phone: {user.phone}</li>}
                {user?.refer_code && (
                  <li>
                    <strong>Your Referral Code:</strong> <span className="font-mono text-lg font-bold text-indigo-600">{user.refer_code}</span>
                  </li>
                )}
                {user?.is_agent && <li>Status: Agent</li>}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

