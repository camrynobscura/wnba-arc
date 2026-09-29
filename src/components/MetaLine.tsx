import type { MetaText } from "../lib/playerMeta";

/**
 * A player's team / position line, drawn as written ("Las Vegas Aces · C") and spoken as a screen reader should say
 * it ("Las Vegas Aces, center"): the drawn copy is aria-hidden, the spoken one visually hidden (lib/playerMeta.ts,
 * `MetaText`). Inside a link or a search result it becomes part of that control's name. Each copy is one run of
 * text, so a reader moving through the page meets it once, whole.
 */
export function MetaLine({ text }: { text: MetaText }) {
  if (text.shown === text.spoken) return <>{text.shown}</>;
  return (
    <>
      <span aria-hidden="true">{text.shown}</span>
      <span className="sr-only">{text.spoken}</span>
    </>
  );
}
