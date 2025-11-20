"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Input, toast } from "@medusajs/ui"
import VendorShell from "../../../components/VendorShell"
// Icons removed - using text labels instead

type Vendor = {
  id: string
  name: string
  email: string
  phone?: string | null
  store_name?: string | null
  store_logo?: string | null
  pan_gst?: string | null
}

const VendorProfilePage = () => {
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    store_name: "",
  })

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    
    if (!vendorToken) {
      window.location.href = "/app/login"
      return
    }

    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    const loadProfile = async () => {
      try {
        const res = await fetch(`${backend}/vendor/profile`, {
          headers: { Authorization: `Bearer ${vendorToken}` },
        })

        if (res.status === 403) {
          window.location.href = "/vendor/pending"
          return
        }

        if (!res.ok) {
          throw new Error(`Failed to load profile: ${res.status}`)
        }

        const data = await res.json()
        setVendor(data?.vendor || null)
        if (data?.vendor) {
          setFormData({
            name: data.vendor.name || "",
            phone: data.vendor.phone || "",
            store_name: data.vendor.store_name || "",
          })
        }
      } catch (e: any) {
        toast.error("Error", {
          description: e?.message || "Failed to load profile",
        })
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const vendorToken = localStorage.getItem("vendor_token")
    const backend = (process.env.BACKEND_URL || window.location.origin).replace(/\/$/, "")

    try {
      const res = await fetch(`${backend}/vendor/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error?.message || "Failed to update profile")
      }

      const data = await res.json()
      setVendor(data?.vendor || null)
      toast.success("Success", { description: "Profile updated successfully" })
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to update profile" })
    } finally {
      setSaving(false)
    }
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <Text>Loading profile...</Text>
      </Container>
    )
  } else {
    content = (
    <Container className="p-6 space-y-6">
      <div>
        <Heading level="h1">Profile Settings</Heading>
        <Text className="text-ui-fg-subtle">Manage your vendor profile information</Text>
      </div>

      {vendor && (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Email
            </label>
            <Input value={vendor.email} disabled />
              <Text className="text-ui-fg-subtle text-xs mt-1">Email cannot be changed</Text>
          </div>

          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Vendor Name *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Phone
            </label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              type="tel"
            />
          </div>

          <div>
            <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
              Store Name
            </label>
            <Input
              value={formData.store_name}
              onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
            />
          </div>

          {vendor.pan_gst && (
            <div>
              <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
                PAN / GST
              </label>
              <Input value={vendor.pan_gst} disabled />
                <Text className="text-ui-fg-subtle text-xs mt-1">PAN / GST cannot be changed</Text>
            </div>
          )}

          {vendor.store_logo && (
            <div>
              <label className="text-ui-fg-subtle text-sm font-medium mb-2 block">
                Store Logo
              </label>
              <img
                src={vendor.store_logo}
                alt="Store logo"
                className="w-32 h-32 object-cover border border-ui-border-base rounded"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      )}
    </Container>
  )
  }

  return <VendorShell>{content}</VendorShell>
}

// Explicitly no config export to prevent sidebar registration
// Route is still accessible at /app/vendor/profile
// export const config = defineRouteConfig({
//   label: "Profile",
// })

export default VendorProfilePage

