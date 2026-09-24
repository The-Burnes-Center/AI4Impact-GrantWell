import { CSSProperties } from "react";
import { useBranding } from "../../common/branding";

/** A branding image, or the app name as text when the branding has none (the unstaged fallback). */
export function BrandLogo({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { appName } = useBranding();
  if (src) return <img src={src} alt={alt} className={className} style={style} />;
  return alt ? <span className={className}>{appName}</span> : null;
}
