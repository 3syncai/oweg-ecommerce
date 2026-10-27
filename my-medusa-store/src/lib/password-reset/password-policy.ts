export const PASSWORD_POLICY_MESSAGE =
  "Include 1 capital letter, 1 number and 1 special character."

export const PASSWORD_REQUIREMENTS = [
  { label: "1 capital letter", test: (password: string) => /[A-Z]/.test(password) },
  { label: "1 number", test: (password: string) => /\d/.test(password) },
  { label: "1 special character", test: (password: string) => /[\p{P}\p{S}]/u.test(password) },
]

export function validateStrongPassword(password: string) {
  return PASSWORD_REQUIREMENTS.every(rule => rule.test(password)) ? null : PASSWORD_POLICY_MESSAGE
}
