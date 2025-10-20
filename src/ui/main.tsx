import React from "react";
import ReactDOM from "react-dom/client";

import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./styles/app.css";
import { isPluginsDisabled } from "./utils/plugins";
import { installRuntimeErrorHooks } from "./utils/runtimeErrors";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { router } from "./app/router";
import { getAppStore } from "./state/appStore";
import { initPersistMiddleware } from "./state/middleware/persistMiddleware";
import { queryClient } from "./lib/queryClient";

installRuntimeErrorHooks();

// 初始化持久化中间件，自动同步 IndexedDB
initPersistMiddleware(getAppStore(), {
  plans: true,
  chatkit: true,
  executions: false,
  approvals: false,
  debounceMs: 500
});

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
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  ) : (
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
);
