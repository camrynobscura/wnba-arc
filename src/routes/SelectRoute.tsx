import { useNavigate } from "react-router-dom";
import { SelectView } from "../components/SelectView";
import { Footer } from "../components/Footer";
import { FEATURED } from "../data/featured";
import { useAppData } from "../appData";
import { playerPath } from "../lib/routes";

/** "/" — the landing / player-select screen. */
export function SelectRoute() {
  const { players, loadError, lastScrapedAt } = useAppData();
  const navigate = useNavigate();

  // Resolve the picked espn id to a name for the pretty slug — from the roster if loaded,
  // else the static featured list (a featured card can be clicked before the roster arrives).
  const pick = (espn: string) => {
    const name = players?.find((p) => p.espn === espn)?.name ?? FEATURED.find((f) => f.espn === espn)?.name ?? "";
    navigate(playerPath(name, espn, players));
  };

  return (
    <>
      <SelectView featured={FEATURED} players={players} listError={loadError} onPick={pick} />
      <Footer lastScrapedAt={lastScrapedAt} />
    </>
  );
}
