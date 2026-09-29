import { useState, type CSSProperties } from "react";
import { photoUrls } from "../data/stats";

interface PlayerPhotoProps {
  /** The player's ESPN id, which the headshot is looked up by. */
  espn: string;
  /** Used only for the initials fallback. */
  name: string;
  size: number;
  /** The team's tint (`teamTint()` in data/teams.ts). Without one the CSS uses `--duotone-neutral`. */
  tint?: string | null;
}

export function PlayerPhoto({ espn, name, size, tint }: PlayerPhotoProps) {
  // The resized headshot, then the original, then the initials: each failed load moves one step. The count
  // is kept per player, so a photo that stays mounted while the player changes starts again at the first.
  const sources = photoUrls(espn, size);
  const [failed, setFailed] = useState({ espn, count: 0 });
  const src = sources[failed.espn === espn ? failed.count : 0];
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The team color rides on a custom property the .duotone::after overlay reads (theme.css); React's
  // CSSProperties doesn't type custom properties, hence the cast.
  const style: CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    borderRadius: "50%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...(tint ? ({ "--duotone-color": tint } as CSSProperties) : {}),
  };

  return (
    <div
      className="duotone player-photo"
      // Decorative: the name is always shown as text beside the photo, so alt text would repeat it.
      aria-hidden="true"
      style={style}
    >
      {src ? (
        <img
          // A new element per source: a late error from the previous source can't count against this one.
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
          onError={() => setFailed((f) => ({ espn, count: (f.espn === espn ? f.count : 0) + 1 }))}
        />
      ) : (
        <span className="text-heading player-photo-initials" style={{ fontSize: size * 0.36 }}>
          {initials}
        </span>
      )}
    </div>
  );
}
