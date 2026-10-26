import { Share, Share2 } from "lucide-react";

export function ShareIcon({ size = 21 }: { size?: number }) {
  // Includes iPadOS requesting desktop sites, which identifies as Macintosh.
  const apple = /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(
    navigator.userAgent,
  );
  const Icon = apple ? Share : Share2;
  return (
    <Icon
      size={apple ? size - 1 : size}
      className={apple ? "share-icon-apple" : "share-icon-network"}
    />
  );
}
