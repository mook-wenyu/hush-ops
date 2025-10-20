import React, { lazy, Suspense, useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";

// 懒加载各实验模块，按需渲染，避免首屏负担
const ChatLazy = lazy(() => import("../Chat").then((m) => ({ default: m.default })));
const ChatKitLazy = lazy(() => import("../ChatKit").then((m) => ({ default: m.default })));
const SchedulesLazy = lazy(() => import("../Schedules").then((m) => ({ default: m.default })));
const ToolStreamsLazy = lazy(() => import("../ToolStreams").then((m) => ({ default: m.default })));
const RunsLazy = lazy(() => import("../Runs").then((m) => ({ default: m.default })));
const PluginSidePanelsLazy = lazy(() =>
  import("../../components/PluginSidePanels").then((m) => ({ default: m.PluginSidePanels }))
);

function openDialog(id: string) {
  try {
    const dlg = document.getElementById(id) as HTMLDialogElement | null;
    dlg?.showModal?.();
  } catch {}
}

export default function TestHub() {
  const [showChat, setShowChat] = useState(false);
  const [showChatKit, setShowChatKit] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [showToolStreams, setShowToolStreams] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [showPluginPanels, setShowPluginPanels] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">TestHub · 实验入口</h1>
        <div className="join">
          <button
            className="btn btn-sm join-item"
            onClick={() => openDialog("settings-modal")}
            aria-label="打开设置对话框"
          >
            打开设置
          </button>
          <button
            className="btn btn-sm join-item"
            onClick={() => openDialog("toolstreams-modal")}
            aria-label="打开工具流对话框"
          >
            工具流对话框
          </button>
        </div>
      </header>

      <div className="alert alert-warning">
        <span>
          本页仅用于本地/内部测试，包含实验与占位功能。某些功能依赖后端开关（如 Agents/ChatKit），若未启用会显示错误提示。
        </span>
      </div>

      {/* 开关区 */}
      <div className="card bg-base-200">
        <div className="card-body gap-3">
          <h2 className="card-title text-base">显示的实验模块</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showChat} onChange={(e)=>setShowChat(e.target.checked)} />
              <span className="label-text">Chat（简易对话）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showChatKit} onChange={(e)=>setShowChatKit(e.target.checked)} />
              <span className="label-text">ChatKit（自定义后端占位）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showSchedules} onChange={(e)=>setShowSchedules(e.target.checked)} />
              <span className="label-text">Schedules（调度概览）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showToolStreams} onChange={(e)=>setShowToolStreams(e.target.checked)} />
              <span className="label-text">Tool Streams（工具流汇总）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showRuns} onChange={(e)=>setShowRuns(e.target.checked)} />
              <span className="label-text">运行历史（Runs）</span>
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-sm" checked={showPluginPanels} onChange={(e)=>setShowPluginPanels(e.target.checked)} />
              <span className="label-text">插件侧栏面板（Panels）</span>
            </label>
          </div>
        </div>
      </div>

      {/* 动态区块：按需渲染 */}
      {showChat && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">Chat</h3>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载 Chat…</div>}>
                <ChatLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}

      {showChatKit && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">ChatKit</h3>
            <p className="text-xs opacity-70">说明：使用自定义后端占位路由，仅作演示。</p>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载 ChatKit…</div>}>
                <ChatKitLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}

      {showSchedules && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">Schedules</h3>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载 Schedules…</div>}>
                <SchedulesLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}

      {showToolStreams && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">Tool Streams（工具流汇总）</h3>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载 Tool Streams…</div>}>
                <ToolStreamsLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}

      {showRuns && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">运行历史（Runs）</h3>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载 Runs…</div>}>
                <RunsLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}

      {showPluginPanels && (
        <section className="card bg-base-200">
          <div className="card-body gap-2">
            <h3 className="text-base font-semibold">插件侧栏面板</h3>
            <p className="text-xs opacity-70">若无任何面板，表示当前运行时未注册相应插件面板。</p>
            <ErrorBoundary>
              <Suspense fallback={<div className="text-sm opacity-60">加载插件面板…</div>}>
                <PluginSidePanelsLazy />
              </Suspense>
            </ErrorBoundary>
          </div>
        </section>
      )}
    </div>
  );
}
