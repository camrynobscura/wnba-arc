import { useLocation, useNavigate } from "react-router-dom";
import { AboutView } from "../components/AboutView";
import { Footer } from "../components/Footer";
import { useAppData } from "../appData";
import { pageTitle, usePageTitle } from "../pageArrival";

/** "/about" — reachable from every page's footer (and the landing page). Back returns where you came from. */
export function AboutRoute() {
  const { meta } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle(pageTitle("About"));

  // If we arrived from within the app, browser-back lands exactly where we were. If /about was
  // opened directly (a shared link → first history entry, key "default"), go to the landing page
  // instead of leaving the site.
  const goBack = () => (location.key === "default" ? navigate("/") : navigate(-1));

  return (
    <>
      <AboutView onBack={goBack} />
      <Footer meta={meta} showAbout={false} />
    </>
  );
}
