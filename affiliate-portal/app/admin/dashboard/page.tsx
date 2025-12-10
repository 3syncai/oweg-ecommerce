"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { 
  Users, 
  UserCheck, 
  DollarSign, 
  Clock, 
  TrendingUp,
  ShoppingBag
} from "lucide-react"

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalAgents: 0,
    pendingRequests: 0,
    totalCommission: 0,
    pendingPayout: 0,
    totalOrders: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch dashboard stats
    const fetchStats = async () => {
      try {
        const { apiRequest } = await import("../../../lib/api-client")
        
        // Fetch affiliate users
        const usersResponse = await apiRequest("/affiliate/admin/users")
        
        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          setStats({
            totalAgents: usersData.counts?.total || 0,
            pendingRequests: usersData.counts?.pending || 0,
            totalCommission: 0, // TODO: Implement commission calculation
            pendingPayout: 0, // TODO: Implement payout calculation
            totalOrders: 0, // TODO: Implement order count
          })
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  const statCards = [
    {
      title: "Total Agent",
      value: stats.totalAgents,
      icon: Users,
      color: "bg-blue-500",
      href: "/admin/total-agent",
    },
    {
      title: "Affiliate Request",
      value: stats.pendingRequests,
      icon: UserCheck,
      color: "bg-orange-500",
      href: "/admin/affiliate-request",
    },
    {
      title: "Total Commission",
      value: `₹${stats.totalCommission.toLocaleString()}`,
      icon: DollarSign,
      color: "bg-green-500",
      href: "/admin/total-commission",
    },
    {
      title: "Pending Payout",
      value: `₹${stats.pendingPayout.toLocaleString()}`,
      icon: Clock,
      color: "bg-yellow-500",
      href: "/admin/pending-payout",
    },
    {
      title: "Order Layout",
      value: stats.totalOrders,
      icon: ShoppingBag,
      color: "bg-purple-500",
      href: "/admin/order-layout",
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your affiliate program</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <a
              key={card.title}
              href={card.href}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </a>
          )
        })}
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="text-center py-12 text-gray-500">
          <p>No recent activity to display</p>
        </div>
      </div>
    </div>
  )
}
