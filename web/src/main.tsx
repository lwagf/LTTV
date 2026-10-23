import { init } from "@noriginmedia/norigin-spatial-navigation";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui/theme.css";

// Screens and the rail are position:fixed, so offset-based measuring can't compare them; real
// on-screen rects also account for the rows' slide transforms.
init({ throttle: 80, throttleKeypresses: true, useGetBoundingClientRect: true });

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
