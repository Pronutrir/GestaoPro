import Image from "next/image";

type BrandLogoProps = {
  size?: number;
  showLabel?: boolean;
  className?: string;
  labelClassName?: string;
};

export function BrandLogo({
  size = 28,
  showLabel = true,
  className = "",
  labelClassName = "text-base font-semibold text-foreground",
}: BrandLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <Image
        src="/gestaopro-logo.svg"
        alt="Gestão Pro"
        width={size}
        height={size}
        className="shrink-0"
        priority
      />
      {showLabel && <span className={labelClassName}>Gestão Pro</span>}
    </div>
  );
}
