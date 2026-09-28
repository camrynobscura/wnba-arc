import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// The app's two typefaces, bundled and served with the app. Until 2026-09-28 they came from Google Fonts
// through an @import in theme.css: a request chain that held up the first paint (Lighthouse est. 831 ms on
// a phone) and sent every visitor's browser to Google. Barlow 600 and Condensed 500 were missing until
// 2026-09-28, so the browser drew 700 and 400 where the CSS asked for them (the color key's "below" /
// "above", the plates' stat codes, the chart's value labels); now every weight the pages' text uses has a face.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
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
