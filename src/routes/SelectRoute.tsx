import { useNavigate } from "react-router-dom";
import { SelectView } from "../components/SelectView";
import { Footer } from "../components/Footer";
import { FEATURED } from "../data/featured";
import { useAppData } from "../appData";
import { SITE_NAME, usePageTitle } from "../pageArrival";
import { playerPath } from "../lib/routes";

/** "/" — the landing / player-select screen. */
export function SelectRoute() {
  const { players, loadFailed, meta } = useAppData();
  const navigate = useNavigate();
  // The same as index.html's, which a fresh load shows before this runs.
  usePageTitle(`${SITE_NAME} — Career Arc Visualizer`);

  // A search result → the player's page. Results come from the roster, so it has the name for the
  // slug. (The featured list is links — they carry their own paths.)
  const pick = (espn: string) => {
    const name = players?.find((p) => p.espn === espn)?.name ?? "";
    navigate(playerPath(name, espn, players));
  };

  return (
    <>
      <SelectView featured={FEATURED} players={players} listFailed={loadFailed} onPick={pick} />
      <Footer meta={meta} />
    </>
  );
}
