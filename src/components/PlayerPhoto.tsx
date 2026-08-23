import { useState } from "react";

interface PlayerPhotoProps {
  src: string;
  /** Player name — used only for the initials fallback. The photo is decorative
      (the name always appears as adjacent text), so it's hidden from the a11y tree. */
  name: string;
  size: number;
}

export function PlayerPhoto({ src, name, size }: PlayerPhotoProps) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="duotone"
      // Decorative: the name is always shown as text beside the photo, so an alt
      // here would just duplicate it (WCAG 1.1.1). Hide the whole avatar from SR.
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: "50%",
        overflow: "hidden",
        background: "var(--color-neutral-300)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            fontSize: size * 0.36,
            color: "var(--color-neutral-700)",
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
