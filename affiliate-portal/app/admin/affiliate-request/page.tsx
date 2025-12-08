"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, CheckCircle, XCircle } from "lucide-react"

type AffiliateUser = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  is_agent: boolean
  is_approved: boolean
  rejected_at?: string | null
  created_at: string
  [key: string]: any
}

export default function AffiliateRequestPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AffiliateUser[]>([])
  const [pendingUsers, setPendingUsers] = useState<AffiliateUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<AffiliateUser | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectModal, setShowRejectModal] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      
      // Check if token exists
      const token = localStorage.getItem("affiliate_token")
      const role = localStorage.getItem("affiliate_role")
      console.log("Token exists:", !!token, "Role:", role)
      
      if (!token) {
        alert("Please login first")
        return
      }
      
      if (role !== "admin") {
        alert("You must be logged in as an affiliate admin")
        return
      }
      
      const response = await apiRequest("/affiliate/admin/users")
      console.log("Response status:", response.status)

      if (response.ok) {
        const data = await response.json()
        console.log("Fetched affiliate users:", data)
        setUsers(data.users || [])
        setPendingUsers(data.pending || [])
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        console.error("Failed to fetch users:", response.status, errorData)
        alert(`Failed to load users: ${errorData.message || errorData.error || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Failed to fetch users:", error)
      alert(`Error loading users: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId: string) => {
    setProcessing(userId)
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest(`/affiliate/admin/users/${userId}/approve`, {
        method: "POST",
      })

      if (response.ok) {
        loadUsers()
      } else {
        const data = await response.json()
        alert(data.message || "Failed to approve user")
      }
    } catch (error) {
      console.error("Failed to approve user:", error)
      alert("Failed to approve user")
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async () => {
    if (!selectedUser || !rejectionReason.trim()) {
      alert("Please provide a rejection reason")
      return
    }

    setProcessing(selectedUser.id)
    try {
      const { apiRequest } = await import("../../../lib/api-client")
      const response = await apiRequest(`/affiliate/admin/users/${selectedUser.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      })

      if (response.ok) {
        setShowRejectModal(false)
        setRejectionReason("")
        setSelectedUser(null)
        loadUsers()
      } else {
        const data = await response.json()
        alert(data.message || "Failed to reject user")
      }
    } catch (error) {
      console.error("Failed to reject user:", error)
      alert("Failed to reject user")
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-"
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Affiliate Request</h1>
        <p className="text-gray-600 mt-1">Review and manage affiliate user registrations</p>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No pending affiliate requests</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                          {user.is_agent && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                              Agent
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.phone || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="text-indigo-600 hover:text-indigo-900 flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </button>
                        <button
                          onClick={() => handleApprove(user.id)}
                          disabled={processing === user.id}
                          className="text-green-600 hover:text-green-900 flex items-center disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowRejectModal(true)
                          }}
                          disabled={processing === user.id}
                          className="text-red-600 hover:text-red-900 flex items-center disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {selectedUser && !showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">User Details</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Information</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Name:</strong> {selectedUser.first_name} {selectedUser.last_name}</p>
                  <p><strong>Email:</strong> {selectedUser.email}</p>
                  <p><strong>Phone:</strong> {selectedUser.phone || "-"}</p>
                  <p><strong>Gender:</strong> {selectedUser.gender || "-"}</p>
                  <p><strong>Birth Date:</strong> {selectedUser.birth_date ? formatDate(selectedUser.birth_date) : "-"}</p>
                  {selectedUser.refer_code && (
                    <p>
                      <strong>Referral Code:</strong>{" "}
                      <span className="font-mono font-bold text-indigo-600">{selectedUser.refer_code}</span>
                    </p>
                  )}
                  {selectedUser.entry_sponsor && (
                    <p><strong>Entry Sponsor:</strong> {selectedUser.entry_sponsor}</p>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Family Information</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Father Name:</strong> {selectedUser.father_name || "-"}</p>
                  <p><strong>Mother Name:</strong> {selectedUser.mother_name || "-"}</p>
                  <p><strong>Marital Status:</strong> {selectedUser.marital_status || "-"}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Work Information</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Designation:</strong> {selectedUser.designation || "-"}</p>
                  <p><strong>Branch:</strong> {selectedUser.branch || "-"}</p>
                  <p><strong>Area:</strong> {selectedUser.area || "-"}</p>
                  <p><strong>State:</strong> {selectedUser.state || "-"}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Information</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Payment Method:</strong> {selectedUser.payment_method || "-"}</p>
                  <p><strong>Bank Name:</strong> {selectedUser.bank_name || "-"}</p>
                  <p><strong>Account Name:</strong> {selectedUser.account_name || "-"}</p>
                  <p><strong>IFSC Code:</strong> {selectedUser.ifsc_code || "-"}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Documents</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Aadhar No:</strong> {selectedUser.aadhar_card_no || "-"}</p>
                  {selectedUser.aadhar_card_photo && (
                    <a href={selectedUser.aadhar_card_photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View Aadhar Card
                    </a>
                  )}
                  <p><strong>PAN No:</strong> {selectedUser.pan_card_no || "-"}</p>
                  {selectedUser.pan_card_photo && (
                    <a href={selectedUser.pan_card_photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View PAN Card
                    </a>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Address</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>Address:</strong> {selectedUser.address_1 || "-"}</p>
                  <p><strong>City:</strong> {selectedUser.city || "-"}</p>
                  <p><strong>Pin Code:</strong> {selectedUser.pin_code || "-"}</p>
                  <p><strong>State:</strong> {selectedUser.address_state || "-"}</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => handleApprove(selectedUser.id)}
                disabled={processing === selectedUser.id}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {processing === selectedUser.id ? "Processing..." : "Approve"}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={processing === selectedUser.id}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Reject User</h2>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting {selectedUser.first_name} {selectedUser.last_name}
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 min-h-[100px]"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason("")
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processing === selectedUser.id}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {processing === selectedUser.id ? "Processing..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

