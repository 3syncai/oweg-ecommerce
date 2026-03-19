export const PASSWORD_POLICY_MESSAGE =
  "Use at least 10 characters with uppercase, lowercase, number, and special character."

export function validateStrongPassword(password: string) {
  if (password.length < 10) {
    return PASSWORD_POLICY_MESSAGE
  }

  if (!/[a-z]/.test(password)) {
    return PASSWORD_POLICY_MESSAGE
  }

  if (!/[A-Z]/.test(password)) {
    return PASSWORD_POLICY_MESSAGE
  }

  if (!/\d/.test(password)) {
    return PASSWORD_POLICY_MESSAGE
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return PASSWORD_POLICY_MESSAGE
  }

  return null
}
