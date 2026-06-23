import Image from "next/image";

export type SignOutModalIconName =
  | "logout-modal-illustration"
  | "logout-door-arrow"
  | "secure-shield-check"
  | "stay-signed-in"
  | "sign-out-red"
  | "sparkle-green";

type SignOutModalIconProps = {
  name: SignOutModalIconName;
  className?: string;
  size?: number;
};

export default function SignOutModalIcon({
  name,
  className = "h-5 w-5",
  size = 20,
}: SignOutModalIconProps) {
  return (
    <Image
      src={`/icons/signout-modal/${name}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
    />
  );
}
