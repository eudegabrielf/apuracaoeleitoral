import type { CSSProperties } from "react";
import { cx } from "@/utils/cx";

export function ElectionSkeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx(
        "block shrink-0 rounded-md bg-background-tertiary-default motion-safe:animate-pulse",
        className,
      )}
    />
  );
}