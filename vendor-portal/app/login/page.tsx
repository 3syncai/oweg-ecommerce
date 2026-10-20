'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { safeVendorRedirect } from '@/lib/vendor-redirect'
import Link from 'next/link'
import { vendorAuthApi, vendorProfileApi } from '@/lib/api/client'
import { ArrowRight, ChartNoAxesColumnIncreasing, CreditCard, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Truck, UsersRound } from 'lucide-react'
import logo from '@/public/vendor/oweg-wordmark.svg'
import laptopArtwork from '@/public/vendor/login-laptop.png'
import packageArtwork from '@/public/vendor/login-packages-branded.png'
import styles from './login.module.css'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [showRecovery, setShowRecovery] = useState(false)
  const recoveryDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (showRecovery) recoveryDialog.current?.showModal()
    else recoveryDialog.current?.close()
  }, [showRecovery])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [redirectPath, setRedirectPath] = useState('/dashboard')

  // Get redirect path from URL query parameter on mount
  useEffect(() => {
    const redirect = searchParams.get('redirect')
    if (redirect) {
      setRedirectPath(safeVendorRedirect(redirect))
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await vendorAuthApi.login(email, password)
      const token = response.token

      // Store token in localStorage AND cookie for middleware
      localStorage.setItem('vendor_token', token)
      localStorage.setItem('vendor_user', JSON.stringify(response.vendor_user))

      // Also set cookie for middleware to detect
      document.cookie = `vendor_token=${token}; path=/; ${keepSignedIn ? 'max-age=86400; ' : ''}SameSite=Lax`

      // Check if password reset needed
      if (response?.vendor_user?.must_reset_password) {
        router.push('/reset-password')
        return
      }

      // Check vendor status from login response
      const vendor = response?.vendor

      if (vendor) {
        // If vendor is rejected, redirect to reapply page
        if (vendor.rejected_at) {
          router.push('/reapply')
          return
        }

        // If vendor is approved, redirect to dashboard
        if (vendor.is_approved) {
          console.log('Login successful, redirecting to:', redirectPath)
          router.replace(redirectPath)
          return
        }

        // Vendor is pending, redirect to pending page
        router.push('/pending')
        return
      }

      // Fallback: Check approval status via API if vendor data not in response
      try {
        const meResponse = await vendorProfileApi.getMe()
        const vendorData = meResponse.vendor

        // If vendor is rejected, redirect to reapply page
        if (vendorData?.rejected_at) {
          router.push('/reapply')
          return
        }

        // Vendor is approved - redirect to the intended path or dashboard
        if (vendorData?.is_approved) {
          console.log('Login successful, redirecting to:', redirectPath)
          router.replace(redirectPath)
          return
        }

        // Vendor is pending
        router.push('/pending')
      } catch (meError: unknown) {
        // If 403, vendor not approved (pending)
        if (typeof meError === 'object' && meError !== null && 'status' in meError && meError.status === 403) {
          router.push('/pending')
          return
        }
        // If 401, token might be invalid - clear and show error
        if (typeof meError === 'object' && meError !== null && 'status' in meError && meError.status === 401) {
          localStorage.removeItem('vendor_token')
          localStorage.removeItem('vendor_user')
          setError('Invalid credentials. Please try again.')
          return
        }
        throw meError
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.')
      // Clear any partial token storage on error
      localStorage.removeItem('vendor_token')
      localStorage.removeItem('vendor_user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.canvas}>
        <section className={styles.hero} aria-label="OWEG Vendor Control">
          <BrandLogo className={styles.heroLogo} />
          <div className={styles.heroCopy}>
            <h1>Smarter Tools.<br />Better Sales.<br /><span>Higher Earnings.</span></h1>
            <p>One workspace for operations, sales performance,<br className={styles.desktopBreak} /> payments and dispatch tracking.</p>
          </div>
          <div className={styles.features}>
            {[
              { icon: UsersRound, lines: ['User', 'Management'] },
              { icon: ChartNoAxesColumnIncreasing, lines: ['Sales', 'Performance'] },
              { icon: CreditCard, lines: ['Payments &', 'Settlements'] },
              { icon: Truck, lines: ['Dispatch', 'Monitoring'] },
            ].map(({ icon: Icon, lines }) => (
              <div className={styles.feature} key={lines[0]}>
                <span className={styles.featureIcon}><Icon aria-hidden="true" strokeWidth={2.1} /></span>
                <p>{lines[0]}<br />{lines[1]}</p>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.artworkScene}>
          <div className={styles.packages}>
            <Image src={packageArtwork} alt="OWEG branded shipping packages" fill priority sizes="(min-width: 1101px) 28vw, 1px" className={styles.productImage} />
          </div>
          <div className={styles.laptop}>
            <Image src={laptopArtwork} alt="Laptop displaying the OWEG vendor dashboard" fill priority sizes="(min-width: 1101px) 36vw, 1px" className={styles.productImage} />
          </div>
        </div>

        <section className={styles.card} aria-labelledby="login-title">
          <BrandLogo className={styles.cardLogo} />
          <div>
            <h2 id="login-title">Sign in to OWEG Vendor</h2>
            <p className={styles.intro}>Access your workspace and manage<br className={styles.desktopBreak} /> your business securely.</p>
          </div>
          <form onSubmit={handleSubmit} className={styles.form} aria-busy={loading}>
            {error && <div className={styles.error} role="alert">{error}</div>}
            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.fieldLabel}>Email address</label>
              <div className={styles.field}>
                <Mail aria-hidden="true" />
                <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="password" className={styles.fieldLabel}>Password</label>
              <div className={styles.field}>
                <LockKeyhole aria-hidden="true" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className={styles.options}>
              <label className={styles.remember}><input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} /><span>Keep me signed in</span></label>
              <button type="button" className={styles.forgot} onClick={() => setShowRecovery(true)}>Forgot password?</button>
            </div>
            <button type="submit" disabled={loading} className={styles.submit}>
              {loading ? <><LoaderCircle className={styles.spinner} aria-hidden="true" />Signing in...</> : <>Sign In <ArrowRight aria-hidden="true" /></>}
            </button>
          </form>
          <p className={styles.signup}>Don&apos;t have an account? <Link href="/signup">Sign up</Link></p>
          <div className={styles.security}><ShieldCheck aria-hidden="true" /><span>Secure access for authorized users</span></div>
        </section>
      </div>
      <dialog ref={recoveryDialog} className={styles.recovery} aria-labelledby="recovery-title" onClose={() => setShowRecovery(false)} onClick={(e) => { if (e.target === e.currentTarget) setShowRecovery(false) }}>
        <ShieldCheck aria-hidden="true" />
        <h2 id="recovery-title">Reset your password</h2>
        <p>Contact your OWEG administrator to request a password reset for your vendor account.</p>
        <button type="button" autoFocus onClick={() => setShowRecovery(false)}>Back to sign in</button>
      </dialog>
    </main>
  )
}

function BrandLogo({ className }: { className: string }) {
  return (
    <div className={`${styles.brand} ${className}`}>
      <div className={styles.wordmark}><Image src={logo} alt="OWEG" width={685} height={173} priority unoptimized /></div>
      <p>VENDOR CONTROL</p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className={styles.loading} aria-label="Loading sign in"><LoaderCircle className={styles.spinner} /></main>}>
      <LoginForm />
    </Suspense>
  )
}
