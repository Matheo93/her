"use client"

/**
 * Authentication Forms - Sprint 822
 *
 * Login, signup, and password recovery components.
 *
 * Features:
 * - Login form
 * - Signup form
 * - Password recovery
 * - Social login buttons
 * - Two-factor authentication
 * - Form validation
 */

import React, {
  memo,
  useState,
  useCallback,
  FormEvent,
  ReactNode,
} from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
}

interface SignupData {
  email: string
  password: string
  confirmPassword: string
  name?: string
  acceptTerms: boolean
}

interface SocialProvider {
  id: string
  name: string
  icon: ReactNode
  color: string
}

interface ValidationError {
  field: string
  message: string
}

// ============================================================================
// Icons
// ============================================================================

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="14" height="14">
    <path d="M5 12l5 5L20 7" />
  </svg>
)

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
)

// ============================================================================
// Password Input
// ============================================================================

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  showStrength?: boolean
  autoComplete?: string
  className?: string
}

export const PasswordInput = memo(function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
  error,
  showStrength = false,
  autoComplete = "current-password",
  className = "",
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  const getStrength = (password: string): number => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.length >= 12) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[a-z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^A-Za-z0-9]/.test(password)) strength++
    return Math.min(strength, 4)
  }

  const strength = getStrength(value)
  const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"]
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"]

  return (
    <div className={className}>
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? "border-red-500" : "border-gray-300"
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}

      {showStrength && value && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded ${
                  i < strength ? strengthColors[strength - 1] : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Password strength: {strength > 0 ? strengthLabels[strength - 1] : "Too weak"}
          </p>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Social Login Button
// ============================================================================

interface SocialButtonProps {
  provider: SocialProvider
  onClick: () => void
  isLoading?: boolean
  className?: string
}

export const SocialButton = memo(function SocialButton({
  provider,
  onClick,
  isLoading = false,
  className = "",
}: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`flex items-center justify-center gap-3 w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 ${className}`}
    >
      {provider.icon}
      <span className="font-medium">Continue with {provider.name}</span>
    </button>
  )
})

// ============================================================================
// Social Login Group
// ============================================================================

const defaultProviders: SocialProvider[] = [
  { id: "google", name: "Google", icon: <GoogleIcon />, color: "#4285F4" },
  { id: "github", name: "GitHub", icon: <GithubIcon />, color: "#333" },
  { id: "apple", name: "Apple", icon: <AppleIcon />, color: "#000" },
]

interface SocialLoginGroupProps {
  providers?: SocialProvider[]
  onProviderClick: (providerId: string) => void
  className?: string
}

export const SocialLoginGroup = memo(function SocialLoginGroup({
  providers = defaultProviders,
  onProviderClick,
  className = "",
}: SocialLoginGroupProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {providers.map((provider) => (
        <SocialButton
          key={provider.id}
          provider={provider}
          onClick={() => onProviderClick(provider.id)}
        />
      ))}
    </div>
  )
})

// ============================================================================
// Divider
// ============================================================================

interface DividerProps {
  text?: string
  className?: string
}

export const AuthDivider = memo(function AuthDivider({
  text = "or",
  className = "",
}: DividerProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-sm text-gray-500">{text}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
})

// ============================================================================
// Login Form
// ============================================================================

interface LoginFormProps {
  onSubmit: (credentials: LoginCredentials) => Promise<void>
  onForgotPassword?: () => void
  onSignUp?: () => void
  showRememberMe?: boolean
  showSocialLogin?: boolean
  socialProviders?: SocialProvider[]
  onSocialLogin?: (providerId: string) => void
  className?: string
}

export const LoginForm = memo(function LoginForm({
  onSubmit,
  onForgotPassword,
  onSignUp,
  showRememberMe = true,
  showSocialLogin = true,
  socialProviders,
  onSocialLogin,
  className = "",
}: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setErrors([])

      const newErrors: ValidationError[] = []
      if (!email) newErrors.push({ field: "email", message: "Email is required" })
      if (!password) newErrors.push({ field: "password", message: "Password is required" })

      if (newErrors.length > 0) {
        setErrors(newErrors)
        return
      }

      setIsLoading(true)
      try {
        await onSubmit({ email, password, rememberMe })
      } catch (error) {
        setErrors([{ field: "form", message: "Invalid email or password" }])
      } finally {
        setIsLoading(false)
      }
    },
    [email, password, rememberMe, onSubmit]
  )

  const getError = (field: string) => errors.find((e) => e.field === field)?.message

  return (
    <div className={className}>
      {showSocialLogin && onSocialLogin && (
        <>
          <SocialLoginGroup
            providers={socialProviders}
            onProviderClick={onSocialLogin}
          />
          <AuthDivider className="my-6" />
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {getError("form") && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {getError("form")}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              getError("email") ? "border-red-500" : "border-gray-300"
            }`}
          />
          {getError("email") && (
            <p className="mt-1 text-sm text-red-500">{getError("email")}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            error={getError("password")}
            autoComplete="current-password"
          />
        </div>

        <div className="flex items-center justify-between">
          {showRememberMe && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-colors ${
                  rememberMe ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"
                }`}
              >
                {rememberMe && <CheckIcon />}
              </div>
              <span className="text-sm text-gray-600">Remember me</span>
            </label>
          )}

          {onForgotPassword && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Forgot password?
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      {onSignUp && (
        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onSignUp}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Sign up
          </button>
        </p>
      )}
    </div>
  )
})

// ============================================================================
// Signup Form
// ============================================================================

interface SignupFormProps {
  onSubmit: (data: SignupData) => Promise<void>
  onLogin?: () => void
  showName?: boolean
  showTerms?: boolean
  termsUrl?: string
  privacyUrl?: string
  className?: string
}

export const SignupForm = memo(function SignupForm({
  onSubmit,
  onLogin,
  showName = true,
  showTerms = true,
  termsUrl = "#",
  privacyUrl = "#",
  className = "",
}: SignupFormProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setErrors([])

      const newErrors: ValidationError[] = []
      if (showName && !name) newErrors.push({ field: "name", message: "Name is required" })
      if (!email) newErrors.push({ field: "email", message: "Email is required" })
      if (!password) newErrors.push({ field: "password", message: "Password is required" })
      if (password.length < 8) newErrors.push({ field: "password", message: "Password must be at least 8 characters" })
      if (password !== confirmPassword) newErrors.push({ field: "confirmPassword", message: "Passwords do not match" })
      if (showTerms && !acceptTerms) newErrors.push({ field: "terms", message: "You must accept the terms" })

      if (newErrors.length > 0) {
        setErrors(newErrors)
        return
      }

      setIsLoading(true)
      try {
        await onSubmit({ email, password, confirmPassword, name, acceptTerms })
      } catch (error) {
        setErrors([{ field: "form", message: "Failed to create account" }])
      } finally {
        setIsLoading(false)
      }
    },
    [name, email, password, confirmPassword, acceptTerms, showName, showTerms, onSubmit]
  )

  const getError = (field: string) => errors.find((e) => e.field === field)?.message

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {getError("form") && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {getError("form")}
          </div>
        )}

        {showName && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              autoComplete="name"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                getError("name") ? "border-red-500" : "border-gray-300"
              }`}
            />
            {getError("name") && (
              <p className="mt-1 text-sm text-red-500">{getError("name")}</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              getError("email") ? "border-red-500" : "border-gray-300"
            }`}
          />
          {getError("email") && (
            <p className="mt-1 text-sm text-red-500">{getError("email")}</p>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Create a password"
            error={getError("password")}
            showStrength
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm your password"
            error={getError("confirmPassword")}
            autoComplete="new-password"
          />
        </div>

        {showTerms && (
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <div
                onClick={() => setAcceptTerms(!acceptTerms)}
                className={`w-5 h-5 mt-0.5 border-2 rounded flex items-center justify-center transition-colors ${
                  acceptTerms ? "bg-blue-500 border-blue-500 text-white" : "border-gray-300"
                }`}
              >
                {acceptTerms && <CheckIcon />}
              </div>
              <span className="text-sm text-gray-600">
                I agree to the{" "}
                <a href={termsUrl} className="text-blue-600 hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href={privacyUrl} className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
              </span>
            </label>
            {getError("terms") && (
              <p className="mt-1 text-sm text-red-500">{getError("terms")}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating account...
            </span>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {onLogin && (
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onLogin}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Sign in
          </button>
        </p>
      )}
    </div>
  )
})

// ============================================================================
// Forgot Password Form
// ============================================================================

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>
  onBack?: () => void
  className?: string
}

export const ForgotPasswordForm = memo(function ForgotPasswordForm({
  onSubmit,
  onBack,
  className = "",
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setError("")

      if (!email) {
        setError("Email is required")
        return
      }

      setIsLoading(true)
      try {
        await onSubmit(email)
        setIsSubmitted(true)
      } catch (err) {
        setError("Failed to send reset email")
      } finally {
        setIsLoading(false)
      }
    },
    [email, onSubmit]
  )

  if (isSubmitted) {
    return (
      <div className={`text-center ${className}`}>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-green-600">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Check your email</h3>
        <p className="mt-2 text-gray-600">
          We sent a password reset link to <strong>{email}</strong>
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-6 text-blue-600 hover:text-blue-800 font-medium"
          >
            Back to sign in
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-gray-600 text-sm">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      {onBack && (
        <button
          onClick={onBack}
          className="mt-4 w-full text-center text-sm text-gray-600 hover:text-gray-800"
        >
          Back to sign in
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Two-Factor Auth
// ============================================================================

interface TwoFactorFormProps {
  onSubmit: (code: string) => Promise<void>
  onResend?: () => void
  onBack?: () => void
  codeLength?: number
  className?: string
}

export const TwoFactorForm = memo(function TwoFactorForm({
  onSubmit,
  onResend,
  onBack,
  codeLength = 6,
  className = "",
}: TwoFactorFormProps) {
  const [code, setCode] = useState<string[]>(Array(codeLength).fill(""))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return

      const newCode = [...code]
      newCode[index] = value.slice(-1)
      setCode(newCode)

      // Auto-focus next input
      if (value && index < codeLength - 1) {
        const nextInput = document.getElementById(`code-${index + 1}`)
        nextInput?.focus()
      }

      // Auto-submit when complete
      if (newCode.every((c) => c) && newCode.join("").length === codeLength) {
        handleSubmit(newCode.join(""))
      }
    },
    [code, codeLength]
  )

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !code[index] && index > 0) {
        const prevInput = document.getElementById(`code-${index - 1}`)
        prevInput?.focus()
      }
    },
    [code]
  )

  const handleSubmit = useCallback(
    async (fullCode: string) => {
      setError("")
      setIsLoading(true)
      try {
        await onSubmit(fullCode)
      } catch (err) {
        setError("Invalid verification code")
        setCode(Array(codeLength).fill(""))
      } finally {
        setIsLoading(false)
      }
    },
    [codeLength, onSubmit]
  )

  return (
    <div className={className}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
        <p className="mt-2 text-gray-600 text-sm">
          Enter the {codeLength}-digit code from your authenticator app
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
          {error}
        </div>
      )}

      <div className="flex justify-center gap-2 mb-6">
        {code.map((digit, index) => (
          <input
            key={index}
            id={`code-${index}`}
            type="text"
            inputMode="numeric"
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={isLoading}
            className="w-12 h-14 text-center text-2xl font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus={index === 0}
          />
        ))}
      </div>

      {onResend && (
        <p className="text-center text-sm text-gray-600">
          Didn't receive a code?{" "}
          <button
            type="button"
            onClick={onResend}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Resend
          </button>
        </p>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="mt-4 w-full text-center text-sm text-gray-600 hover:text-gray-800"
        >
          Use a different method
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export {
  type LoginCredentials,
  type SignupData,
  type SocialProvider,
  type ValidationError,
}
