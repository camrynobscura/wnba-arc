import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { loadLaterFonts } from "./fonts";
// The app's two typefaces, served with the app from the @fontsource packages (src/styles/fonts.css; the faces
// are listed in src/fonts.ts), not from Google Fonts: that request chain held up the first paint and sent every
// visitor's browser to Google.
import "./styles/fonts.css";
import "./styles/theme.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// The faces index.html doesn't preload, fetched now so they're ready before a player's stats or the search results
// need them (src/fonts.ts).
loadLaterFonts(document.fonts);
