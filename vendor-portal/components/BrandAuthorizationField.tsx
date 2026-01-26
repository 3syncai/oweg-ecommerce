"use client"

import React, { useState, useEffect } from "react"
import { Input, Text } from "@medusajs/ui"
import axios from "axios"

interface BrandAuthorizationProps {
    brand: string
    onBrandChange: (brand: string) => void
    onAuthorizationStatusChange: (isAuthorized: boolean, needsAuthorization: boolean) => void
    onFileSelect: (file: File | null) => void
}

type AuthStatus = "idle" | "checking" | "authorized" | "pending" | "needs_upload" | "file_selected"

export const BrandAuthorizationField: React.FC<BrandAuthorizationProps> = ({
    brand,
    onBrandChange,
    onAuthorizationStatusChange,
    onFileSelect,
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
            onAuthorizationStatusChange(false, false)
            onFileSelect(null)
            setAuthorizationFile(null)
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

            const status = response.data.status || (response.data.requires_authorization ? "missing" : "authorized")

            if (status === "pending") {
                setAuthStatus("pending")
                onFileSelect(null)
                setAuthorizationFile(null)
                // Block progress: not authorized, but doesn't need upload (needs approval)
                // We set needsAuthorization=true so parent blocks "Next" if not authorized
                onAuthorizationStatusChange(false, true) 
            } else if (status === "authorized") {
                setAuthStatus("authorized")
                setAuthorizationFile(null)
                onFileSelect(null)
                onAuthorizationStatusChange(true, false)
            } else { // missing or other
                setAuthStatus("needs_upload")
                setAuthorizationFile(null)
                onFileSelect(null)
                onAuthorizationStatusChange(false, true)
            }
        } catch (error) {
            console.error("Brand authorization check error:", error)
            // On error, allow product creation to proceed ?? Or fail safe?
            // Existing logic allowed proceeding.
            setAuthStatus("idle")
            onAuthorizationStatusChange(true, false)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setAuthorizationFile(file)
            onFileSelect(file)
            setAuthStatus("file_selected")
            // Mark as authorized (temporarily) because we have the file ready to upload
            onAuthorizationStatusChange(true, true)
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
            case "pending":
                return (
                    <div style={{ marginTop: 8, padding: 12, background: "var(--bg-warning-subtle)", borderRadius: 6, border: "1px solid var(--border-warning)" }}>
                        <Text size="small" weight="plus" style={{ color: "var(--fg-warning)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span>⏳</span>
                            <span>Authorization Pending Approval</span>
                        </Text>
                        <Text size="small" style={{ color: "var(--fg-muted)", marginTop: 4 }}>
                            You have already uploaded an authorization letter for this brand. Please wait for admin approval before adding products.
                        </Text>
                    </div>
                )
            case "needs_upload":
            case "file_selected":
                return (
                    <div style={{ marginTop: 8, padding: 12, background: "var(--bg-warning-subtle)", borderRadius: 6, border: "1px solid var(--border-warning)" }}>
                        <Text size="small" weight="plus" style={{ color: "var(--fg-warning)", marginBottom: 8 }}>
                            ⚠️ Required: Upload brand authorization letter for "{brand}" to continue
                        </Text>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileSelect}
                                style={{ flex: 1, fontSize: 12 }}
                            />
                        </div>
                        {authStatus === "file_selected" && authorizationFile && (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                <Text size="small" style={{ color: "var(--fg-success)" }}>
                                    ✓ File selected: {authorizationFile.name}
                                </Text>
                                <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
                                    (Will be uploaded upon publishing)
                                </Text>
                            </div>
                        )}
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
