type BankDetails = {
  account_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name?: string;
};

export function returnPayoutError(method: "upi" | "bank", upiId: string, bank: BankDetails): string | null {
  if (method === "upi") {
    const value = upiId.trim();
    return value.length >= 5 && value.length <= 120 && /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(value)
      ? null : "Enter a valid UPI ID (example: name@upi).";
  }
  if (!bank.account_name.trim() || bank.account_name.trim().length > 120) {
    return "Enter the account holder name (up to 120 characters).";
  }
  if (!/^[0-9]{6,32}$/.test(bank.account_number.trim())) {
    return "Enter a bank account number containing 6–32 digits.";
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bank.ifsc_code.trim())) {
    return "Enter a valid 11-character IFSC code (example: ABCD0123456).";
  }
  if ((bank.bank_name?.trim().length || 0) > 120) {
    return "Bank name must be 120 characters or fewer.";
  }
  return null;
}
