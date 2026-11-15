import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./index.css";
import { App } from "./ui/App";
import { start } from "./app/store";

void start();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
