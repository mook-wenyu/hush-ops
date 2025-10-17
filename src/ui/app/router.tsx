import React, { lazy } from "react";
import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { AppShell } from "./AppShell";

// 页面：仅保留首页（工作台）
const DashboardPage = lazy(() => import("../pages/Dashboard"));
const SchedulesPage = lazy(() => import("../pages/Schedules"));
const ExecutionPage = lazy(() => import("../pages/Execution"));
const ToolStreamsPage = lazy(() => import("../pages/ToolStreams"));
const ChatPage = lazy(() => import("../pages/Chat"));
const ChatKitPage = lazy(() => import("../pages/ChatKit"));


function NotFound() {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-semibold">页面不存在</h2>
      <p className="text-sm opacity-70">请检查链接是否正确，或返回首页。</p>
      <Link to="/" className="btn btn-primary btn-sm">返回首页</Link>
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

const Schedules = createRoute({
  getParentRoute: () => Root,
  path: "/schedules",
  component: () => <SchedulesPage />,
});

const Execution = createRoute({
  getParentRoute: () => Root,
  path: "/executions/$id",
  component: () => <ExecutionPage />,
});



const ToolStreams = createRoute({
  getParentRoute: () => Root,
  path: "/tool-streams",
  component: () => <ToolStreamsPage />,
});

const Chat = createRoute({
  getParentRoute: () => Root,
  path: "/chat",
  component: () => <ChatPage />,
});

const ChatKit = createRoute({
  getParentRoute: () => Root,
  path: "/chatkit",
  component: () => <ChatKitPage />,
});

const routeTree = Root.addChildren([Index, Schedules, Execution, ToolStreams, Chat, ChatKit]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
