import Image from "next/image";

export type AccountHubIconName =
  | "my-account"
  | "orders"
  | "wishlist"
  | "addresses"
  | "preferences"
  | "notifications"
  | "help-and-support"
  | "logout"
  | "profile-information"
  | "account-security"
  | "edit"
  | "update"
  | "verified-user"
  | "password-key"
  | "package"
  | "coupons"
  | "coins"
  | "account-summary"
  | "track-order"
  | "view-details"
  | "buy-again"
  | "delivered"
  | "processing"
  | "shipped"
  | "cancelled"
  | "add-address"
  | "default-address"
  | "category-chip"
  | "brand-follow"
  | "recommendation-toggle"
  | "email"
  | "sms"
  | "whatsapp-message"
  | "offer-alert"
  | "new-arrival"
  | "login-alert"
  | "search"
  | "return-refund"
  | "payment-issue"
  | "cancel-order"
  | "shipping-issue"
  | "account-help"
  | "faq"
  | "chat-support"
  | "phone-support"
  | "more-options"
  | "wallet"
  | "cash-on-delivery";

type AccountHubIconProps = {
  name: AccountHubIconName;
  className?: string;
  size?: number;
};

export default function AccountHubIcon({
  name,
  className = "h-5 w-5",
  size = 20,
}: AccountHubIconProps) {
  return (
    <Image
      src={`/icons/account-hub/${name}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}
