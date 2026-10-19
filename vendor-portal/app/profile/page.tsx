"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Heading,
  Text,
  Button,
  Input,
  Textarea,
  Badge,
  Tabs,
  IconButton,
  toast,
} from "@medusajs/ui"
import styles from "./profile.module.css"
import VendorShell from "@/components/VendorShell"
import PageSkeleton from "@/components/PageSkeleton"
import { ApiError, vendorAuthApi, vendorProfileApi } from "@/lib/api/client"
import { useRouter } from "next/navigation"
import {
  User,
  Mail,
  Phone,
  Store,
  Building2,
  CheckCircle2,
  Clock,
  Lock,
  Camera,
  MapPin,
  CreditCard,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Info,
  Loader2,
  ImagePlus,
  ArrowUpRight,
  X,
} from "lucide-react"

type Vendor = {
  id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  email: string
  phone?: string | null
  telephone?: string | null
  whatsapp_number?: string | null
  store_name?: string | null
  store_phone?: string | null
  store_address?: string | null
  store_city?: string | null
  store_region?: string | null
  store_country?: string | null
  store_pincode?: string | null
  store_logo?: string | null
  store_banner?: string | null
  shipping_policy?: string | null
  return_policy?: string | null
  pan_gst?: string | null
  pan_no?: string | null
  gst_no?: string | null
  bank_name?: string | null
  account_no?: string | null
  ifsc_code?: string | null
  is_approved?: boolean
  approved_at?: string | null
  rejected_at?: string | null
  rejection_reason?: string | null
  commission_rate?: number | null
}

type ProfileFormState = {
  name: string
  first_name: string
  last_name: string
  phone: string
  telephone: string
  whatsapp_number: string
  store_name: string
  store_phone: string
  store_address: string
  store_city: string
  store_region: string
  store_country: string
  store_pincode: string
  shipping_policy: string
  return_policy: string
}

const PROFILE_FIELDS_TO_TRACK: Array<keyof Vendor> = [
  "name",
  "phone",
  "store_name",
  "store_phone",
  "store_address",
  "store_city",
  "store_region",
  "store_country",
  "store_pincode",
  "store_logo",
  "store_banner",
  "pan_gst",
  "bank_name",
  "account_no",
  "ifsc_code",
  "shipping_policy",
  "return_policy",
]

const initialFormState: ProfileFormState = {
  name: "",
  first_name: "",
  last_name: "",
  phone: "",
  telephone: "",
  whatsapp_number: "",
  store_name: "",
  store_phone: "",
  store_address: "",
  store_city: "",
  store_region: "",
  store_country: "",
  store_pincode: "",
  shipping_policy: "",
  return_policy: "",
}

function getInitials(input?: string | null): string {
  if (!input) return "?"
  return input
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function maskAccount(value?: string | null): string {
  if (!value) return "—"
  if (value.length <= 4) return `••••${value}`
  return `••••${value.slice(-4)}`
}

const VendorProfilePage = () => {
  const router = useRouter()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingStore, setSavingStore] = useState(false)
  const [savingPolicies, setSavingPolicies] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<{ file: File; type: "logo" | "banner"; url: string } | null>(null)
  const [activeTab, setActiveTab] = useState("personal")
  const [formData, setFormData] = useState<ProfileFormState>(initialFormState)

  // Security tab state
  const [pwForm, setPwForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  })
  const [changingPassword, setChangingPassword] = useState(false)

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const bannerInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => { if (pendingMedia) URL.revokeObjectURL(pendingMedia.url) }
  }, [pendingMedia])

  useEffect(() => {
    const vendorToken = localStorage.getItem("vendor_token")
    if (!vendorToken) {
      router.push("/login")
      return
    }
    void loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const loadProfile = async () => {
    try {
      const data = await vendorProfileApi.getMe()
      if (data?.vendor) {
        applyVendor(data.vendor)
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        router.push("/pending")
        return
      }
      toast.error("Unable to load profile", {
        description: e instanceof Error ? e.message : "Please try again in a moment.",
      })
    } finally {
      setLoading(false)
    }
  }

  const applyVendor = (v: Vendor) => {
    setVendor(v)
    setFormData({
      name: v.name || "",
      first_name: v.first_name || "",
      last_name: v.last_name || "",
      phone: v.phone || "",
      telephone: v.telephone || "",
      whatsapp_number: v.whatsapp_number || "",
      store_name: v.store_name || "",
      store_phone: v.store_phone || "",
      store_address: v.store_address || "",
      store_city: v.store_city || "",
      store_region: v.store_region || "",
      store_country: v.store_country || "",
      store_pincode: v.store_pincode || "",
      shipping_policy: v.shipping_policy || "",
      return_policy: v.return_policy || "",
    })
  }

  const completion = useMemo(() => {
    if (!vendor) return 0
    const filled = PROFILE_FIELDS_TO_TRACK.reduce((acc, key) => {
      const value = vendor[key]
      if (typeof value === "string" && value.trim().length > 0) return acc + 1
      if (typeof value === "number" && !Number.isNaN(value)) return acc + 1
      return acc
    }, 0)
    return Math.round((filled / PROFILE_FIELDS_TO_TRACK.length) * 100)
  }, [vendor])

  const memberSince = useMemo(() => {
    if (!vendor?.approved_at) return null
    try {
      return new Date(vendor.approved_at).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    } catch {
      return null
    }
  }, [vendor?.approved_at])

  const handleField = <K extends keyof ProfileFormState>(key: K, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const updateProfile = async (
    payload: Partial<ProfileFormState>,
    setBusy: (b: boolean) => void,
    successMessage: string
  ) => {
    setBusy(true)
    try {
      const { vendor: updated } = await vendorProfileApi.updateProfile(payload)
      if (updated) applyVendor(updated)
      toast.success(successMessage)
    } catch (e: unknown) {
      toast.error("Update failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  const handlePersonalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfile(
      {
        name: formData.name,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        telephone: formData.telephone,
        whatsapp_number: formData.whatsapp_number,
      },
      setSavingProfile,
      "Personal information saved"
    )
  }

  const handleStoreSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfile(
      {
        store_name: formData.store_name,
        store_phone: formData.store_phone,
        store_address: formData.store_address,
        store_city: formData.store_city,
        store_region: formData.store_region,
        store_country: formData.store_country,
        store_pincode: formData.store_pincode,
      },
      setSavingStore,
      "Store details saved"
    )
  }

  const handlePoliciesSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfile(
      {
        shipping_policy: formData.shipping_policy,
        return_policy: formData.return_policy,
      },
      setSavingPolicies,
      "Policies updated"
    )
  }

  const selectMedia = async (file: File, type: "logo" | "banner") => {
    const input = type === "logo" ? logoInputRef : bannerInputRef
    if (input.current) input.current.value = ""
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image")
      return
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      toast.error("Image must be between 1 byte and 5 MB")
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new window.Image()
      image.src = url
      await image.decode()
      setPendingMedia({ file, type, url })
    } catch {
      URL.revokeObjectURL(url)
      toast.error("This image could not be opened. Please choose another file.")
    }
  }

  const saveMedia = async () => {
    if (!vendor?.id || !pendingMedia || uploadingMedia) return
    setUploadingMedia(true)
    try {
      const uploaded = await (pendingMedia.type === "logo"
        ? vendorProfileApi.uploadLogo(pendingMedia.file, vendor.id)
        : vendorProfileApi.uploadBanner(pendingMedia.file, vendor.id))
      const { vendor: updated } = await vendorProfileApi.updateProfile({
        [pendingMedia.type === "logo" ? "store_logo" : "store_banner"]: uploaded.url,
      })
      if (!updated) throw new Error("The image could not be saved")
      // Updating an image must not reset unsaved personal/store/policy fields.
      setVendor(updated)
      toast.success(`Store ${pendingMedia.type} updated`)
      setPendingMedia(null)
    } catch (e: unknown) {
      toast.error("Image update failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      })
    } finally {
      setUploadingMedia(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwForm.current_password || !pwForm.new_password) {
      toast.error("Missing fields", { description: "All password fields are required." })
      return
    }
    if (pwForm.new_password.length < 8) {
      toast.error("Weak password", {
        description: "New password must be at least 8 characters.",
      })
      return
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error("Passwords don't match", {
        description: "Confirmation password must match the new password.",
      })
      return
    }
    setChangingPassword(true)
    try {
      await vendorAuthApi.changePassword(pwForm.current_password, pwForm.new_password)
      toast.success("Password updated", {
        description: "Use your new password the next time you sign in.",
      })
      setPwForm({ current_password: "", new_password: "", confirm_password: "" })
    } catch (e: unknown) {
      toast.error("Password change failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const copy = (value?: string | null, label = "Copied") => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      toast.success(label)
    })
  }

  if (loading) {
    return (
      <VendorShell>
        <PageSkeleton label="Loading profile…" />
      </VendorShell>
    )
  }

  if (!vendor) {
    return (
      <VendorShell>
        <div className="p-6 max-w-6xl mx-auto">
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-8 text-center">
            <Heading level="h2">No profile found</Heading>
            <Text className="text-ui-fg-subtle mt-2">
              We couldn&apos;t load your vendor profile. Please refresh or sign in again.
            </Text>
          </div>
        </div>
      </VendorShell>
    )
  }

  const displayName = vendor.store_name || vendor.name
  const verified = !!vendor.is_approved

  return (
    <VendorShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.pageHeading}>
            <div>
              <span className={styles.eyebrow}>YOUR VENDOR ACCOUNT</span>
              <Heading level="h1" className={styles.pageTitle}>Profile &amp; store</Heading>
              <Text className={styles.pageSubtitle}>A little about you. Everything about your store.</Text>
            </div>
            <Button variant="secondary" onClick={() => router.push("/dashboard")}>
              Dashboard <ArrowUpRight className="h-4 w-4" />
            </Button>
          </header>

          <section className={styles.hero} aria-label="Store identity">
            <div className={styles.cover}>
              {vendor.store_banner ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vendor.store_banner} alt={`${displayName} store banner`} className={styles.coverImage} />
              ) : <div className={styles.coverPattern} aria-hidden="true" />}
              <div className={styles.coverLabel}><Store size={16} /> YOUR STOREFRONT</div>
              <button className={styles.coverEdit} type="button" disabled={uploadingMedia}
                onClick={() => bannerInputRef.current?.click()}>
                <ImagePlus size={16} /> {vendor.store_banner ? "Edit banner" : "Add store banner"}
              </button>
            </div>
            <div className={styles.identity}>
              <div className={styles.avatarWrap}>
                <button type="button" className={styles.avatar} aria-label="Change store logo"
                  disabled={uploadingMedia} onClick={() => logoInputRef.current?.click()}>
                  {vendor.store_logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vendor.store_logo} alt={`${displayName} logo`} />
                  ) : <span>{getInitials(displayName)}</span>}
                  <span className={styles.camera}><Camera size={15} /></span>
                </button>
              </div>
              <div className={styles.identityText}>
                <div className={styles.nameRow}>
                  <Heading level="h2" className={styles.storeName}>{displayName}</Heading>
                  <Badge color={verified ? "green" : "orange"}>
                    <span className="inline-flex items-center gap-1">
                      {verified ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                      {verified ? "Verified vendor" : "Pending review"}
                    </span>
                  </Badge>
                </div>
                <div className={styles.contact}>
                  <span><Mail size={14} />{vendor.email}</span>
                  {vendor.phone && <span><Phone size={14} />{vendor.phone}</span>}
                  {memberSince && <span><Shield size={14} />Member since {memberSince}</span>}
                </div>
              </div>
              <button type="button" className={styles.copyId} onClick={() => copy(vendor.id, "Vendor ID copied")}>
                <Copy size={14} /> Copy vendor ID
              </button>
            </div>
            <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              aria-label="Choose store logo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void selectMedia(f, "logo") }} />
            <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              aria-label="Choose store banner" onChange={(e) => { const f = e.target.files?.[0]; if (f) void selectMedia(f, "banner") }} />
          </section>

          <div className={styles.layout}>
            {/* Main column with tabs */}
            <div className={styles.mainColumn}>
              <div className={styles.formCard}>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className={styles.tabBar}>
                    <Tabs.List className={styles.tabs}>
                      <Tabs.Trigger value="personal" className={styles.tab}>
                        <User className="h-4 w-4" />
                        Personal
                      </Tabs.Trigger>
                      <Tabs.Trigger value="store" className={styles.tab}>
                        <Store className="h-4 w-4" />
                        Store
                      </Tabs.Trigger>
                      <Tabs.Trigger value="policies" className={styles.tab}>
                        <Building2 className="h-4 w-4" />
                        Policies
                      </Tabs.Trigger>
                      <Tabs.Trigger value="security" className={styles.tab}>
                        <Lock className="h-4 w-4" />
                        Security
                      </Tabs.Trigger>
                    </Tabs.List>
                  </div>

                  {/* Personal tab */}
                  <Tabs.Content value="personal" className={styles.tabContent}>
                    <SectionHeader
                      title="Personal information"
                      description="Update the contact details we use to reach you about your account."
                    />
                    <form onSubmit={handlePersonalSubmit} className="mt-6 space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="First name" htmlFor="first_name">
                          <Input
                            id="first_name"
                            value={formData.first_name}
                            onChange={(e) => handleField("first_name", e.target.value)}
                            placeholder="First name"
                          />
                        </Field>
                        <Field label="Last name" htmlFor="last_name">
                          <Input
                            id="last_name"
                            value={formData.last_name}
                            onChange={(e) => handleField("last_name", e.target.value)}
                            placeholder="Last name"
                          />
                        </Field>
                      </div>

                      <Field
                        label="Display name"
                        htmlFor="name"
                        required
                        hint="The name shown on invoices and internal records."
                      >
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleField("name", e.target.value)}
                          required
                          placeholder="Full name"
                        />
                      </Field>

                      <Field label="Email" htmlFor="email" hint="Email cannot be changed.">
                        <Input id="email" value={vendor.email} disabled />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="Mobile number" htmlFor="phone">
                          <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => handleField("phone", e.target.value)}
                            placeholder="+91 98765 43210"
                          />
                        </Field>
                        <Field label="WhatsApp number" htmlFor="whatsapp_number">
                          <Input
                            id="whatsapp_number"
                            type="tel"
                            value={formData.whatsapp_number}
                            onChange={(e) => handleField("whatsapp_number", e.target.value)}
                            placeholder="WhatsApp number"
                          />
                        </Field>
                      </div>

                      <Field
                        label="Alternative phone"
                        htmlFor="telephone"
                        hint="Optional. A backup contact number for urgent matters."
                      >
                        <Input
                          id="telephone"
                          type="tel"
                          value={formData.telephone}
                          onChange={(e) => handleField("telephone", e.target.value)}
                          placeholder="Landline or alternative number"
                        />
                      </Field>

                      <FormFooter
                        busy={savingProfile}
                        onReset={() => applyVendor(vendor)}
                      />
                    </form>
                  </Tabs.Content>

                  {/* Store tab */}
                  <Tabs.Content value="store" className={styles.tabContent}>
                    <SectionHeader
                      title="Store information"
                      description="What your customers see on your storefront and order receipts."
                    />
                    <div className={styles.brandingPanel}>
                      <div><ImagePlus size={20} /><div><strong>Make it yours</strong><p>Update your store logo and cover image.</p></div></div>
                      <div className={styles.brandingActions}>
                        <Button variant="secondary" type="button" disabled={uploadingMedia} onClick={() => logoInputRef.current?.click()}>Change logo</Button>
                        <Button variant="secondary" type="button" disabled={uploadingMedia} onClick={() => bannerInputRef.current?.click()}>Change banner</Button>
                      </div>
                      <small>JPG, PNG or WebP · Up to 5 MB · Banner recommended: 1600 × 400 px</small>
                    </div>
                    <form onSubmit={handleStoreSubmit} className="mt-6 space-y-5">
                      <Field label="Store name" htmlFor="store_name">
                        <Input
                          id="store_name"
                          value={formData.store_name}
                          onChange={(e) => handleField("store_name", e.target.value)}
                          placeholder="e.g. Acme Home Appliances"
                        />
                      </Field>

                      <Field label="Store phone" htmlFor="store_phone">
                        <Input
                          id="store_phone"
                          type="tel"
                          value={formData.store_phone}
                          onChange={(e) => handleField("store_phone", e.target.value)}
                          placeholder="Customer-facing phone"
                        />
                      </Field>

                      <Field label="Street address" htmlFor="store_address">
                        <Textarea
                          id="store_address"
                          value={formData.store_address}
                          onChange={(e) => handleField("store_address", e.target.value)}
                          placeholder="Building, street, landmark"
                          rows={3}
                        />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="City" htmlFor="store_city">
                          <Input
                            id="store_city"
                            value={formData.store_city}
                            onChange={(e) => handleField("store_city", e.target.value)}
                            placeholder="City"
                          />
                        </Field>
                        <Field label="State / Region" htmlFor="store_region">
                          <Input
                            id="store_region"
                            value={formData.store_region}
                            onChange={(e) => handleField("store_region", e.target.value)}
                            placeholder="State or region"
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field label="Pincode" htmlFor="store_pincode">
                          <Input
                            id="store_pincode"
                            value={formData.store_pincode}
                            onChange={(e) => handleField("store_pincode", e.target.value)}
                            placeholder="Postal code"
                          />
                        </Field>
                        <Field label="Country" htmlFor="store_country">
                          <Input
                            id="store_country"
                            value={formData.store_country}
                            onChange={(e) => handleField("store_country", e.target.value)}
                            placeholder="Country"
                          />
                        </Field>
                      </div>

                      <FormFooter
                        busy={savingStore}
                        onReset={() => applyVendor(vendor)}
                      />
                    </form>
                  </Tabs.Content>

                  {/* Policies tab */}
                  <Tabs.Content value="policies" className={styles.tabContent}>
                    <SectionHeader
                      title="Customer policies"
                      description="Tell your buyers how shipping and returns work."
                    />
                    <form onSubmit={handlePoliciesSubmit} className="mt-6 space-y-5">
                      <Field
                        label="Shipping policy"
                        htmlFor="shipping_policy"
                        hint="Cut-off times, processing windows, regions you ship to."
                      >
                        <Textarea
                          id="shipping_policy"
                          value={formData.shipping_policy}
                          onChange={(e) => handleField("shipping_policy", e.target.value)}
                          placeholder="Describe your shipping policy"
                          rows={5}
                        />
                      </Field>

                      <Field
                        label="Return policy"
                        htmlFor="return_policy"
                        hint="Acceptance window, condition requirements, refund timeline."
                      >
                        <Textarea
                          id="return_policy"
                          value={formData.return_policy}
                          onChange={(e) => handleField("return_policy", e.target.value)}
                          placeholder="Describe your return policy"
                          rows={5}
                        />
                      </Field>

                      <FormFooter
                        busy={savingPolicies}
                        onReset={() => applyVendor(vendor)}
                      />
                    </form>
                  </Tabs.Content>

                  {/* Security tab */}
                  <Tabs.Content value="security" className={styles.tabContent}>
                    <SectionHeader
                      title="Change password"
                      description="Use a strong password you don't reuse anywhere else."
                    />
                    <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-5 max-w-lg">
                      <PasswordField
                        label="Current password"
                        value={pwForm.current_password}
                        visible={showPasswords.current}
                        onToggle={() =>
                          setShowPasswords((s) => ({ ...s, current: !s.current }))
                        }
                        onChange={(v) =>
                          setPwForm((p) => ({ ...p, current_password: v }))
                        }
                      />
                      <PasswordField
                        label="New password"
                        value={pwForm.new_password}
                        visible={showPasswords.next}
                        onToggle={() =>
                          setShowPasswords((s) => ({ ...s, next: !s.next }))
                        }
                        onChange={(v) =>
                          setPwForm((p) => ({ ...p, new_password: v }))
                        }
                        hint="At least 8 characters."
                      />
                      <PasswordField
                        label="Confirm new password"
                        value={pwForm.confirm_password}
                        visible={showPasswords.confirm}
                        onToggle={() =>
                          setShowPasswords((s) => ({ ...s, confirm: !s.confirm }))
                        }
                        onChange={(v) =>
                          setPwForm((p) => ({ ...p, confirm_password: v }))
                        }
                      />

                      <div className="pt-2 flex items-center gap-3">
                        <Button type="submit" disabled={changingPassword}>
                          {changingPassword ? "Updating…" : "Update password"}
                        </Button>
                        {pwForm.current_password ||
                        pwForm.new_password ||
                        pwForm.confirm_password ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setPwForm({
                                current_password: "",
                                new_password: "",
                                confirm_password: "",
                              })
                            }
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </form>

                    <div className="mt-8 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 flex gap-3">
                      <Info className="h-4 w-4 text-ui-fg-subtle mt-0.5 shrink-0" />
                      <Text size="small" className="text-ui-fg-subtle">
                        For security, signing in elsewhere will continue to work until
                        the existing session expires. Contact support if you suspect
                        unauthorized access.
                      </Text>
                    </div>
                  </Tabs.Content>
                </Tabs>
              </div>
            </div>

            {/* Sidebar */}
            <aside className={styles.sidebar}>
              {/* Profile completion */}
              <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm p-6">
                <div className="flex items-center justify-between mb-2">
                  <Heading level="h3" className="text-base">
                    Profile completion
                  </Heading>
                  <Text size="small" weight="plus">
                    {completion}%
                  </Text>
                </div>
                <div className="h-2 rounded-full bg-ui-bg-subtle overflow-hidden">
                  <div
                    className="h-full bg-oweg-500 transition-all duration-500"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <Text size="small" className="text-ui-fg-subtle mt-3">
                  {completion >= 80
                    ? "Your profile is in great shape."
                    : "Filling out more details builds buyer trust."}
                </Text>
              </div>

              {/* Account status */}
              <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm p-6 space-y-4">
                <Heading level="h3" className="text-base">
                  Account
                </Heading>
                <SidebarRow
                  label="Verification"
                  value={
                    <Badge color={verified ? "green" : "orange"}>
                      {verified ? "Verified" : "Pending"}
                    </Badge>
                  }
                />
                <SidebarRow label="Account type" value={<Badge color="blue">Vendor</Badge>} />
                {typeof vendor.commission_rate === "number" && (
                  <SidebarRow
                    label="Commission"
                    value={
                      <Text size="small" weight="plus">
                        {vendor.commission_rate}%
                      </Text>
                    }
                  />
                )}
                <SidebarRow
                  label="Vendor ID"
                  value={
                    <button
                      type="button"
                      onClick={() => copy(vendor.id, "Vendor ID copied")}
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-ui-fg-subtle hover:text-ui-fg-base transition"
                    >
                      {vendor.id.slice(0, 12)}…
                      <Copy className="h-3 w-3" />
                    </button>
                  }
                />
              </div>

              {/* Tax & banking summary (read-only) */}
              <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Heading level="h3" className="text-base">
                      Tax &amp; banking
                    </Heading>
                    <Text size="small" className="text-ui-fg-subtle">
                      Read-only. Contact support to update.
                    </Text>
                  </div>
                  <CreditCard className="h-5 w-5 text-ui-fg-muted" />
                </div>
                <div className="space-y-3 text-sm">
                  <ReadOnlyRow label="GST / PAN" value={vendor.pan_gst || vendor.gst_no || vendor.pan_no || "—"} />
                  <ReadOnlyRow label="Bank" value={vendor.bank_name || "—"} />
                  <ReadOnlyRow label="Account" value={maskAccount(vendor.account_no)} />
                  <ReadOnlyRow label="IFSC" value={vendor.ifsc_code || "—"} />
                </div>
              </div>

              {/* Address summary */}
              {(vendor.store_address || vendor.store_city) && (
                <div className="rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm p-6">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-ui-fg-muted mt-0.5" />
                    <div>
                      <Heading level="h3" className="text-base">
                        Store address
                      </Heading>
                      <Text size="small" className="text-ui-fg-subtle mt-1 leading-relaxed">
                        {[
                          vendor.store_address,
                          vendor.store_city,
                          vendor.store_region,
                          vendor.store_pincode,
                          vendor.store_country,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </Text>
                    </div>
                  </div>
                </div>
              )}

              {/* Help */}
              <div className="rounded-xl border border-oweg-500/20 bg-gradient-to-br from-oweg-50 to-emerald-50 dark:from-oweg-950/40 dark:to-emerald-950/30 p-6">
                <Heading level="h3" className="text-base mb-1">
                  Need help?
                </Heading>
                <Text size="small" className="text-ui-fg-subtle mb-4">
                  Reach out to our vendor support team for assistance with verification,
                  payouts, or account changes.
                </Text>
                <Button
                  variant="secondary"
                  size="small"
                  className="w-full"
                  onClick={() => (window.location.href = "mailto:owegonline@oweg.in")}
                >
                  Contact support
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </div>
      {pendingMedia && <MediaPreview media={pendingMedia} busy={uploadingMedia}
        onClose={() => setPendingMedia(null)} onSave={() => void saveMedia()} />}
    </VendorShell>
  )
}

function MediaPreview({ media, busy, onClose, onSave }: {
  media: { url: string; type: "logo" | "banner"; file: File }
  busy: boolean
  onClose: () => void
  onSave: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return (
    <dialog ref={dialog} className={styles.mediaDialog} aria-labelledby="media-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}>
      <div className={styles.dialogHeading}>
        <div><span className={styles.eyebrow}>STORE APPEARANCE</span><h2 id="media-title">Preview your {media.type}</h2></div>
        <button type="button" aria-label="Close image preview" disabled={busy} onClick={onClose}><X size={20} /></button>
      </div>
      <div className={media.type === "banner" ? styles.bannerPreview : styles.logoPreview}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.url} alt={`New store ${media.type} preview`} />
      </div>
      <p className={styles.previewHint}>{media.type === "banner" ? "Your banner fills the cover area and is cropped from the centre on smaller screens." : "Your logo is shown in a square frame. Keep important details away from the edges."}</p>
      <p className={styles.fileName}>{media.file.name}</p>
      <div className={styles.dialogFooter}>
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={onSave}>{busy && <Loader2 size={15} className="animate-spin" />}{busy ? "Saving image…" : `Save ${media.type}`}</Button>
      </div>
    </dialog>
  )
}

/* ---------- small presentational helpers ---------- */

function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div>
      <Heading level="h2" className="text-lg">
        {title}
      </Heading>
      {description && (
        <Text size="small" className="text-ui-fg-subtle mt-1">
          {description}
        </Text>
      )}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-ui-fg-base text-sm font-medium mb-1.5 block"
      >
        {label}
        {required && <span className="text-ui-tag-red-text ml-0.5">*</span>}
      </label>
      {children}
      {hint && (
        <Text size="small" className="text-ui-fg-subtle text-xs mt-1.5">
          {hint}
        </Text>
      )}
    </div>
  )
}

function FormFooter({ busy, onReset }: { busy: boolean; onReset: () => void }) {
  return (
    <div className={styles.formFooter}>
      <Button type="button" variant="secondary" onClick={onReset} disabled={busy}>
        Reset
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </div>
  )
}

function PasswordField({
  label,
  value,
  visible,
  onToggle,
  onChange,
  hint,
}: {
  label: string
  value: string
  visible: boolean
  onToggle: () => void
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div>
      <label className="text-ui-fg-base text-sm font-medium mb-1.5 block">{label}</label>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={label.toLowerCase().includes("current") ? "current-password" : "new-password"}
        />
        <IconButton
          type="button"
          variant="transparent"
          size="small"
          onClick={onToggle}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </IconButton>
      </div>
      {hint && (
        <Text size="small" className="text-ui-fg-subtle text-xs mt-1.5">
          {hint}
        </Text>
      )}
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div>{value}</div>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="small" className="text-ui-fg-base font-medium truncate text-right">
        {value}
      </Text>
    </div>
  )
}

export default VendorProfilePage
