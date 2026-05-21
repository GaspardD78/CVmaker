import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installGlobalHandlers } from "@/lib/dev-error-tracker";

installGlobalHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
