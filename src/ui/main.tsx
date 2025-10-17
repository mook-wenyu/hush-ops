import React from "react";
import ReactDOM from "react-dom/client";

import { RouterProvider } from "@tanstack/react-router";
import "./styles/app.css";
import { isPluginsDisabled } from "./utils/plugins";
import { installRuntimeErrorHooks } from "./utils/runtimeErrors";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { router } from "./app/router";

installRuntimeErrorHooks();

// 主题改由 daisyUI @plugin 配置控制（--default / --prefersdark），不在 JS 中强制设置
document.documentElement.setAttribute("data-app-mounted", "1");
try { document.body?.setAttribute("data-app-mounted", "1"); } catch {}

const container = document.getElementById("root");

if (!container) {
  throw new Error("未找到根节点 #root");
}

const disableStrictMode = isPluginsDisabled();

ReactDOM.createRoot(container).render(
  disableStrictMode ? (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  ) : (
    <React.StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </React.StrictMode>
  )
);
