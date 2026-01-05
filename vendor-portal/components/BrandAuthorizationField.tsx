"use client"

import React, { useState, useEffect } from "react"
import { Input, Label, Text, Button, toast } from "@medusajs/ui"
import axios from "axios"

interface BrandAuthorizationProps {
    brand: string
    onBrandChange: (brand: string) => void
    onAuthorizationStatusChange: (isAuthorized: boolean) => void
}

type AuthStatus = "idle" | "checking" | "authorized" | "needs_upload" | "uploading"

export const BrandAuthorizationField: React.FC<BrandAuthorizationProps> = ({
    brand,
    onBrandChange,
    onAuthorizationStatusChange,
}) => {
    const [authStatus, setAuthStatus] = useState<AuthStatus>("idle")
    const [authorizationFile, setAuthorizationFile] = useState<File | null>(null)
    const [checkDebounceTimer, setCheckDebounceTimer] = useState<NodeJS.Timeout | null>(null)

    // Debounced brand authorization check
    useEffect(() => {
        // Clear previous timer
        if (checkDebounceTimer) {
            clearTimeout(checkDebounceTimer)
        }

        if (!brand || brand.trim() === "") {
            setAuthStatus("idle")
            onAuthorizationStatusChange(false)
            return
        }

        // Set checking status immediately for UX feedback
        setAuthStatus("checking")

        // Debounce the API call
        const timer = setTimeout(async () => {
            await checkBrandAuthorization(brand)
        }, 500)

        setCheckDebounceTimer(timer)

        return () => {
            if (timer) clearTimeout(timer)
        }
    }, [brand])

    const checkBrandAuthorization = async (brandName: string) => {
        try {
            const token = localStorage.getItem("vendor_token")
            if (!token) return

            const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
            const response = await axios.get(
                `${API_URL}/vendor/brands/check-authorization`,
                {
                    params: { brand_name: brandName },
                    headers: { Authorization: `Bearer ${token}` }
                }
            )

            if (response.data.requires_authorization) {
                setAuthStatus("needs_upload")
                onAuthorizationStatusChange(false)
            } else {
                setAuthStatus("authorized")
                onAuthorizationStatusChange(true)
            }
        } catch (error) {
            console.error("Brand authorization check error:", error)
            // On error, allow product creation to proceed
            setAuthStatus("idle")
            onAuthorizationStatusChange(true)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setAuthorizationFile(e.target.files[0])
        }
    }

    const handleUploadAuthorization = async () => {
        if (!authorizationFile || !brand) return

        setAuthStatus("uploading")

        try {
            const token = localStorage.getItem("vendor_token")
            if (!token) {
                toast.error("Error", { description: "Not authenticated" })
                return
            }

            const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
            const formData = new FormData()
            formData.append("brand_name", brand)
            formData.append("file", authorizationFile)

            await axios.post(
                `${API_URL}/vendor/brands/upload-authorization`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data"
                    }
                }
            )

            toast.success("Success", { description: "Brand authorization uploaded" })
            setAuthStatus("authorized")
            onAuthorizationStatusChange(true)
            setAuthorizationFile(null)
        } catch (error: any) {
            console.error("Upload error:", error)
            toast.error("Error", { description: error?.response?.data?.error || "Failed to upload authorization" })
            setAuthStatus("needs_upload")
        }
    }

    const getStatusDisplay = () => {
        switch (authStatus) {
            case "checking":
                return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <div style={{
                            width: 16,
                            height: 16,
                            border: "2px solid var(--border-base)",
                            borderTopColor: "var(--fg-accent)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite"
                        }} />
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>
                            Checking authorization...
                        </Text>
                    </div>
                )
            case "authorized":
                return (
                    <div style={{ marginTop: 8, padding: 8, background: "var(--bg-success-subtle)", borderRadius: 6, border: "1px solid var(--border-success)" }}>
                        <Text size="small" style={{ color: "var(--fg-success)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span>✓</span>
                            <span>Brand authorized</span>
                        </Text>
                    </div>
                )
            case "needs_upload":
                return (
                    <div style={{ marginTop: 8, padding: 12, background: "var(--bg-warning-subtle)", borderRadius: 6, border: "1px solid var(--border-warning)" }}>
                        <Text size="small" style={{ color: "var(--fg-warning)", marginBottom: 8 }}>
                            ⚠ Upload brand authorization letter for "{brand}"
                        </Text>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileSelect}
                                style={{ flex: 1, fontSize: 12 }}
                            />
                            <Button
                                size="small"
                                onClick={handleUploadAuthorization}
                                disabled={!authorizationFile}
                            >
                                Upload
                            </Button>
                        </div>
                        {authorizationFile && (
                            <Text size="xsmall" style={{ marginTop: 4, color: "var(--fg-muted)" }}>
                                Selected: {authorizationFile.name}
                            </Text>
                        )}
                    </div>
                )
            case "uploading":
                return (
                    <div style={{ marginTop: 8, padding: 8, background: "var(--bg-subtle)", borderRadius: 6 }}>
                        <Text size="small" style={{ color: "var(--fg-muted)" }}>
                            Uploading authorization...
                        </Text>
                    </div>
                )
            default:
                return null
        }
    }

    return (
        <div>
            <div style={{
                padding: "12px 16px",
                background: "var(--bg-base)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Text size="small" style={{ minWidth: 120, color: "var(--fg-muted)" }}>Brand</Text>
                    <Input
                        value={brand}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onBrandChange(e.target.value)}
                        placeholder="Nike, Adidas, etc. (or leave empty for unbranded)"
                        style={{ flex: 1 }}
                    />
                </div>
                {getStatusDisplay()}
            </div>

            <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    )
}
