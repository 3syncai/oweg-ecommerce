"use client"

import { useState } from "react"

/**
 * Lightweight newsletter sign-up form. Currently a placeholder — wires a
 * real endpoint by replacing the body of the submit handler.
 */
export default function NewsletterForm() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <p className="text-white/90 max-w-md mx-auto">
        Thanks — we&apos;ll send the next playbook to{" "}
        <span className="font-semibold">{email}</span>.
      </p>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!email.trim()) return
        setSubmitted(true)
      }}
      className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="flex-1 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 outline-none focus:ring-4 focus:ring-white/40"
      />
      <button
        type="submit"
        className="bg-white text-[#00D26A] px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-lg hover:-translate-y-0.5"
      >
        Subscribe
      </button>
    </form>
  )
}
