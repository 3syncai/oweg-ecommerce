"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Table, Badge, Input, Textarea } from "@medusajs/ui"
import { CheckCircleSolid, XCircleSolid, ClockSolid, Eye } from "@medusajs/icons"

type AffiliateUser = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  is_agent: boolean
  is_approved: boolean
  approved_at?: string | null
  approved_by?: string | null
  rejected_at?: string | null
  rejected_by?: string | null
  rejection_reason?: string | null
  created_at: string
  // All other fields
  [key: string]: any
}

const AffiliateUsersPage = () => {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AffiliateUser[]>([])
  const [pendingUsers, setPendingUsers] = useState<AffiliateUser[]>([])
  const [approvedUsers, setApprovedUsers] = useState<AffiliateUser[]>([])
  const [rejectedUsers, setRejectedUsers] = useState<AffiliateUser[]>([])
  const [selectedTab, setSelectedTab] = useState<"all" | "pending" | "approved" | "rejected">("pending")
  const [selectedUser, setSelectedUser] = useState<AffiliateUser | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/affiliate/users`, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
        setPendingUsers(data.pending || [])
        setApprovedUsers(data.approved || [])
        setRejectedUsers(data.rejected || [])
      }
    } catch (error) {
      console.error("Failed to fetch affiliate users:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId: string) => {
    setProcessing(userId)
    try {
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/affiliate/users/${userId}/approve`, {
        method: "POST",
        credentials: "include",
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
      const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")
      const response = await fetch(`${backend}/admin/affiliate/users/${selectedUser.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
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

  const getStatusBadge = (user: AffiliateUser) => {
    if (user.is_approved && user.approved_at) {
      return (
        <Badge color="green" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircleSolid style={{ width: 12, height: 12 }} />
          Approved
        </Badge>
      )
    } else if (user.rejected_at) {
      return (
        <Badge color="red" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <XCircleSolid style={{ width: 12, height: 12 }} />
          Rejected
        </Badge>
      )
    } else {
      return (
        <Badge color="orange" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <ClockSolid style={{ width: 12, height: 12 }} />
          Pending
        </Badge>
      )
    }
  }

  const getUsersToDisplay = () => {
    switch (selectedTab) {
      case "approved":
        return approvedUsers
      case "rejected":
        return rejectedUsers
      case "pending":
        return pendingUsers
      default:
        return users
    }
  }

  if (loading) {
    return (
      <Container style={{ padding: 24 }}>
        <Text>Loading affiliate users...</Text>
      </Container>
    )
  }

  return (
    <Container style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Heading level="h1" style={{ marginBottom: 8 }}>
          Affiliate Users
        </Heading>
        <Text size="small" style={{ color: "var(--fg-muted)" }}>
          Manage affiliate user registrations and approvals
        </Text>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: "flex", 
        gap: 8, 
        marginBottom: 24,
        borderBottom: "1px solid var(--border-base)",
        paddingBottom: 8,
      }}>
        <Button
          variant={selectedTab === "all" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("all")}
        >
          All ({users.length})
        </Button>
        <Button
          variant={selectedTab === "pending" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("pending")}
        >
          Pending ({pendingUsers.length})
        </Button>
        <Button
          variant={selectedTab === "approved" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("approved")}
        >
          Approved ({approvedUsers.length})
        </Button>
        <Button
          variant={selectedTab === "rejected" ? "primary" : "secondary"}
          onClick={() => setSelectedTab("rejected")}
        >
          Rejected ({rejectedUsers.length})
        </Button>
      </div>

      {getUsersToDisplay().length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Text style={{ color: "var(--fg-muted)" }}>
            No {selectedTab !== "all" ? selectedTab : ""} affiliate users found
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Phone</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Registered</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {getUsersToDisplay().map((user) => (
              <Table.Row key={user.id}>
                <Table.Cell>
                  <Text weight="plus">{user.first_name} {user.last_name}</Text>
                  {user.is_agent && (
                    <Badge color="blue" style={{ marginLeft: 8 }}>Agent</Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text>{user.email}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text>{user.phone || "-"}</Text>
                </Table.Cell>
                <Table.Cell>
                  {getStatusBadge(user)}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{formatDate(user.created_at)}</Text>
                </Table.Cell>
                <Table.Cell>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setSelectedUser(user)}
                    >
                      <Eye style={{ width: 14, height: 14, marginRight: 4 }} />
                      View
                    </Button>
                    {!user.is_approved && !user.rejected_at && (
                      <>
                        <Button
                          size="small"
                          variant="primary"
                          onClick={() => handleApprove(user.id)}
                          disabled={processing === user.id}
                        >
                          {processing === user.id ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowRejectModal(true)
                          }}
                          disabled={processing === user.id}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* View User Modal */}
      {selectedUser && !showRejectModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 8,
            maxWidth: 800,
            maxHeight: "90vh",
            overflow: "auto",
            width: "90%",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <Heading level="h2">User Details</Heading>
              <Button variant="secondary" onClick={() => setSelectedUser(null)}>Close</Button>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <Text size="small" weight="plus">Personal Information</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Name:</strong> {selectedUser.first_name} {selectedUser.last_name}</Text>
                  <Text size="small"><strong>Email:</strong> {selectedUser.email}</Text>
                  <Text size="small"><strong>Phone:</strong> {selectedUser.phone || "-"}</Text>
                  <Text size="small"><strong>Gender:</strong> {selectedUser.gender || "-"}</Text>
                  <Text size="small"><strong>Birth Date:</strong> {selectedUser.birth_date ? formatDate(selectedUser.birth_date) : "-"}</Text>
                </div>
              </div>
              
              <div>
                <Text size="small" weight="plus">Family Information</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Father Name:</strong> {selectedUser.father_name || "-"}</Text>
                  <Text size="small"><strong>Mother Name:</strong> {selectedUser.mother_name || "-"}</Text>
                  <Text size="small"><strong>Marital Status:</strong> {selectedUser.marital_status || "-"}</Text>
                </div>
              </div>

              <div>
                <Text size="small" weight="plus">Work Information</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Designation:</strong> {selectedUser.designation || "-"}</Text>
                  <Text size="small"><strong>Branch:</strong> {selectedUser.branch || "-"}</Text>
                  <Text size="small"><strong>Area:</strong> {selectedUser.area || "-"}</Text>
                  <Text size="small"><strong>State:</strong> {selectedUser.state || "-"}</Text>
                </div>
              </div>

              <div>
                <Text size="small" weight="plus">Payment Information</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Payment Method:</strong> {selectedUser.payment_method || "-"}</Text>
                  <Text size="small"><strong>Bank Name:</strong> {selectedUser.bank_name || "-"}</Text>
                  <Text size="small"><strong>Account Name:</strong> {selectedUser.account_name || "-"}</Text>
                  <Text size="small"><strong>IFSC Code:</strong> {selectedUser.ifsc_code || "-"}</Text>
                </div>
              </div>

              <div>
                <Text size="small" weight="plus">Documents</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Aadhar No:</strong> {selectedUser.aadhar_card_no || "-"}</Text>
                  {selectedUser.aadhar_card_photo && (
                    <a href={selectedUser.aadhar_card_photo} target="_blank" rel="noopener noreferrer">
                      <Text size="small" style={{ color: "blue" }}>View Aadhar Card</Text>
                    </a>
                  )}
                  <Text size="small"><strong>PAN No:</strong> {selectedUser.pan_card_no || "-"}</Text>
                  {selectedUser.pan_card_photo && (
                    <a href={selectedUser.pan_card_photo} target="_blank" rel="noopener noreferrer">
                      <Text size="small" style={{ color: "blue" }}>View PAN Card</Text>
                    </a>
                  )}
                </div>
              </div>

              <div>
                <Text size="small" weight="plus">Address</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text size="small"><strong>Address:</strong> {selectedUser.address_1 || "-"}</Text>
                  <Text size="small"><strong>City:</strong> {selectedUser.city || "-"}</Text>
                  <Text size="small"><strong>Pin Code:</strong> {selectedUser.pin_code || "-"}</Text>
                  <Text size="small"><strong>State:</strong> {selectedUser.address_state || "-"}</Text>
                </div>
              </div>
            </div>

            {!selectedUser.is_approved && !selectedUser.rejected_at && (
              <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={() => handleApprove(selectedUser.id)}
                  disabled={processing === selectedUser.id}
                >
                  {processing === selectedUser.id ? "Processing..." : "Approve"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowRejectModal(true)}
                  disabled={processing === selectedUser.id}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedUser && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001,
        }}>
          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 8,
            maxWidth: 500,
            width: "90%",
          }}>
            <Heading level="h2" style={{ marginBottom: 16 }}>Reject User</Heading>
            <Text style={{ marginBottom: 16 }}>
              Please provide a reason for rejecting {selectedUser.first_name} {selectedUser.last_name}
            </Text>
            <Textarea
              value={rejectionReason}
              onChange={(e: any) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              style={{ marginBottom: 16, minHeight: 100 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason("")
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processing === selectedUser.id}
              >
                {processing === selectedUser.id ? "Processing..." : "Reject"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Affiliate Users",
})

export default AffiliateUsersPage

