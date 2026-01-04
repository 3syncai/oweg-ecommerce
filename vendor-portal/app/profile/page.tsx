"use client"

import { useEffect, useState } from "react"
import { Container, Heading, Text, Button, Input, toast, Badge } from "@medusajs/ui"
import VendorShell from "@/components/VendorShell"
import { vendorProfileApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import {
  User,
  Mail,
  Phone,
  Store,
  FileText,
  Building2,
  CheckCircle,
  Clock
} from "lucide-react"

type Vendor = {
  id: string
  name: string
  email: string
  phone?: string | null
  store_name?: string | null
  store_logo?: string | null
  pan_gst?: string | null
  is_approved?: boolean
}

const VendorProfilePage = () => {
  const router = useRouter()
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
      router.push("/login")
      return
    }

    const loadProfile = async () => {
      try {
        const data = await vendorProfileApi.getMe()

        if (data?.vendor) {
          setVendor(data.vendor)
          setFormData({
            name: data.vendor.name || "",
            phone: data.vendor.phone || "",
            store_name: data.vendor.store_name || "",
          })
        }
      } catch (e: any) {
        if (e.status === 403) {
          router.push("/pending")
          return
        }
        toast.error("Error", {
          description: e?.message || "Failed to load profile",
        })
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const data = await vendorProfileApi.updateProfile(formData)
      setVendor(data?.vendor || null)
      toast.success("Success", { description: "Profile updated successfully" })
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to update profile" })
    } finally {
      setSaving(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  let content

  if (loading) {
    content = (
      <Container className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ui-fg-base mx-auto mb-4"></div>
            <Text className="text-ui-fg-subtle">Loading profile...</Text>
          </div>
        </div>
      </Container>
    )
  } else {
    content = (
      <Container className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Profile Header */}
        {vendor && (
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-white shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-6">
                {/* Avatar */}
                <div className="relative">
                  {vendor.store_logo ? (
                    <img
                      src={vendor.store_logo}
                      alt={vendor.store_name || vendor.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white shadow-lg flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">
                        {getInitials(vendor.store_name || vendor.name)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Vendor Info */}
                <div>
                  <Heading level="h1" className="text-white text-3xl mb-2">
                    {vendor.store_name || vendor.name}
                  </Heading>
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-4 h-4" />
                    <Text className="text-white/90">{vendor.email}</Text>
                  </div>
                  {vendor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <Text className="text-white/90">{vendor.phone}</Text>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div>
                <Badge
                  size="large"
                  className="bg-white/20 backdrop-blur-sm border-white/30"
                >
                  <div className="flex items-center gap-2">
                    {vendor.is_approved ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4" />
                        <span>Pending</span>
                      </>
                    )}
                  </div>
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information Card */}
            <div className="border border-ui-border-base rounded-lg bg-ui-bg-base shadow-sm">
              <div className="p-6 border-b border-ui-border-base">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <Heading level="h2" className="text-lg">Personal Information</Heading>
                    <Text className="text-ui-fg-subtle text-sm">Update your personal details</Text>
                  </div>
                </div>
              </div>

              {vendor && (
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="text-ui-fg-base text-sm font-medium mb-2 block flex items-center gap-2">
                      <Mail className="w-4 h-4 text-ui-fg-subtle" />
                      Email Address
                    </label>
                    <Input value={vendor.email} disabled className="bg-ui-bg-subtle" />
                    <Text className="text-ui-fg-subtle text-xs mt-1">
                      Email cannot be changed
                    </Text>
                  </div>

                  <div>
                    <label className="text-ui-fg-base text-sm font-medium mb-2 block flex items-center gap-2">
                      <User className="w-4 h-4 text-ui-fg-subtle" />
                      Vendor Name *
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div>
                    <label className="text-ui-fg-base text-sm font-medium mb-2 block flex items-center gap-2">
                      <Phone className="w-4 h-4 text-ui-fg-subtle" />
                      Phone Number
                    </label>
                    <Input
                      value={formData.phone}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      type="tel"
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className="pt-4">
                    <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                      {saving ? "Saving Changes..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Business Information Card */}
            <div className="border border-ui-border-base rounded-lg bg-ui-bg-base shadow-sm">
              <div className="p-6 border-b border-ui-border-base">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <Heading level="h2" className="text-lg">Business Information</Heading>
                    <Text className="text-ui-fg-subtle text-sm">Manage your store details</Text>
                  </div>
                </div>
              </div>

              {vendor && (
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="text-ui-fg-base text-sm font-medium mb-2 block flex items-center gap-2">
                      <Store className="w-4 h-4 text-ui-fg-subtle" />
                      Store Name
                    </label>
                    <Input
                      value={formData.store_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, store_name: e.target.value })
                      }
                      placeholder="Enter your store name"
                    />
                    <Text className="text-ui-fg-subtle text-xs mt-1">
                      This will be displayed to customers
                    </Text>
                  </div>

                  {vendor.pan_gst && (
                    <div>
                      <label className="text-ui-fg-base text-sm font-medium mb-2 block flex items-center gap-2">
                        <FileText className="w-4 h-4 text-ui-fg-subtle" />
                        PAN / GST Number
                      </label>
                      <Input value={vendor.pan_gst} disabled className="bg-ui-bg-subtle" />
                      <Text className="text-ui-fg-subtle text-xs mt-1">
                        Tax identification cannot be changed
                      </Text>
                    </div>
                  )}

                  {vendor.store_logo && (
                    <div>
                      <label className="text-ui-fg-base text-sm font-medium mb-2 block">
                        Store Logo
                      </label>
                      <div className="flex items-start gap-4">
                        <img
                          src={vendor.store_logo}
                          alt="Store logo"
                          className="w-24 h-24 object-cover border-2 border-ui-border-base rounded-lg shadow-sm"
                        />
                        <div className="flex-1">
                          <Text className="text-ui-fg-subtle text-sm">
                            Your current store logo. This appears on your vendor profile and products.
                          </Text>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4">
                    <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                      {saving ? "Saving Changes..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right Column - Info Cards */}
          <div className="space-y-6">
            {/* Account Status */}
            <div className="border border-ui-border-base rounded-lg bg-ui-bg-base shadow-sm p-6">
              <Heading level="h3" className="text-base mb-4">Account Status</Heading>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-ui-bg-subtle rounded-lg">
                  <Text className="text-sm text-ui-fg-subtle">Verification</Text>
                  <Badge color={vendor?.is_approved ? 'green' : 'orange'}>
                    {vendor?.is_approved ? 'Verified' : 'Pending'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-ui-bg-subtle rounded-lg">
                  <Text className="text-sm text-ui-fg-subtle">Account Type</Text>
                  <Badge color="blue">Vendor</Badge>
                </div>
              </div>
            </div>

            {/* Quick Info */}
            <div className="border border-ui-border-base rounded-lg bg-ui-bg-base shadow-sm p-6">
              <Heading level="h3" className="text-base mb-4">Quick Information</Heading>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-ui-fg-subtle mt-0.5" />
                  <div className="flex-1">
                    <Text className="text-ui-fg-subtle text-xs mb-1">Email</Text>
                    <Text className="text-ui-fg-base break-all">{vendor?.email}</Text>
                  </div>
                </div>
                {vendor?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-ui-fg-subtle mt-0.5" />
                    <div className="flex-1">
                      <Text className="text-ui-fg-subtle text-xs mb-1">Phone</Text>
                      <Text className="text-ui-fg-base">{vendor.phone}</Text>
                    </div>
                  </div>
                )}
                {vendor?.store_name && (
                  <div className="flex items-start gap-3">
                    <Store className="w-4 h-4 text-ui-fg-subtle mt-0.5" />
                    <div className="flex-1">
                      <Text className="text-ui-fg-subtle text-xs mb-1">Store</Text>
                      <Text className="text-ui-fg-base">{vendor.store_name}</Text>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Help Card */}
            <div className="border border-ui-border-base rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 shadow-sm p-6">
              <Heading level="h3" className="text-base mb-2">Need Help?</Heading>
              <Text className="text-sm text-ui-fg-subtle mb-4">
                Contact support if you need assistance with your account or have questions.
              </Text>
              <Button variant="secondary" size="small" className="w-full">
                Contact Support
              </Button>
            </div>
          </div>
        </div>
      </Container>
    )
  }

  return <VendorShell>{content}</VendorShell>
}

export default VendorProfilePage
