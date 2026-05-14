"use client";

import Image from "next/image";

interface AppLogoProps {
  height?: number;
  className?: string;
}

export function AppLogo({ height = 32, className = "" }: AppLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Avena by SocialMoon"
      height={height}
      width={0}
      sizes="100vw"
      style={{ height, width: "auto" }}
      priority
      className={className}
    />
  );
}
