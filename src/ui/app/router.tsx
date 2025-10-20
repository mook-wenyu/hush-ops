import React, { lazy } from "react";
import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { AppShell } from "./AppShell";

// 页面入口
const DashboardPage = lazy(() => import("../pages/Dashboard"));
const TestHubPage = lazy(() => import("../pages/TestHub").then(m => ({ default: m.default })));


function NotFound() {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-semibold">页面不存在</h2>
      <p className="text-sm opacity-70">请返回首页 “/”。</p>
      <div className="flex items-center gap-2">
        <Link to="/" className="btn btn-primary btn-sm">返回首页</Link>
      </div>
    </div>
  );
}

const Root = createRootRoute({
  component: () => <AppShell />,
  notFoundComponent: () => <NotFound />,
});

const Index = createRoute({
  getParentRoute: () => Root,
  path: "/",
  component: () => <DashboardPage />,
});

const TestHub = createRoute({
  getParentRoute: () => Root,
  path: "/test-hub",
  component: () => <TestHubPage />,
});

const routeTree = Root.addChildren([Index, TestHub]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
