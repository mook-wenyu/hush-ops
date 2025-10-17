import React, { Suspense, useMemo, useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { IconSettings } from "@tabler/icons-react";
import { useBridgeConnection } from "../hooks/useBridgeConnection";
import { appStore, isAppStoreEnabled, useAppStoreSelector } from "../state/appStore";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PluginRuntimeProvider } from "../plugins/runtime";
import { fetchExecutions, getBaseUrl } from "../services";
const DesignerSettingsLazy = React.lazy(() => import("../pages/Designer/Settings").then(m => ({ default: m.DesignerSettings })));


const TOPICS = ["runtime", "bridge", "execution", "approvals"] as const;

export function AppShell() {
  // 在应用外壳建立 WebSocket 桥接，让各页面仅消费 store/selector 即可
  const storeEnabled = isAppStoreEnabled();
  useBridgeConnection({
    topics: TOPICS,
    storeEnabled,
    storeApi: appStore,
    onFallbackPoll: async () => {
      try {
        const list = await fetchExecutions();
        appStore.getState().hydrateExecutions?.(list);
      } catch (e) {
        appStore.getState().setExecutionsError?.((e as Error).message ?? 'fallback 刷新失败');
      }
    }
  });

  const navItems = useMemo(
    () => [
      { to: "/", label: "Dashboard" },
      { to: "/schedules", label: "Schedules" },
      { to: "/tool-streams", label: "Tool Streams" },
      // 实验：对话（受后端开关控制，未开启时访问将返回 404）
      { to: "/chat", label: "Chat (实验)" },
      { to: "/chatkit", label: "ChatKit (实验)" }
      // 编辑器入口已并入 Dashboard（Edit 模式），/designer 导航移除
    ],
    []
  );
  const bridgeState = useAppStoreSelector((s)=> s.runtime.bridgeState);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div role="banner" className="sticky top-0 z-20 bg-base-200/80 border-b border-base-content/10 backdrop-blur h-7 px-2 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <span className="font-semibold tracking-wide text-[11px] leading-none">hush-ops</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
            bridgeState === 'connected' ? 'bg-success' : bridgeState === 'disconnected' ? 'bg-error' : 'bg-warning'
          }`} aria-label="连接状态" />
          <span className="opacity-30 select-none">|</span>
          <button
            aria-label="API 文档（JSON）"
            className="inline-flex items-center justify-center px-2 py-1 text-[11px] rounded-md hover:bg-base-300/60 active:bg-base-300/80 transition"
            onClick={() => {
              const base = getBaseUrl();
              window.open(`${base}/openapi.json`, '_blank');
            }}
          >
            API 文档
          </button>
          <button
            aria-label="设置"
            className="inline-flex items-center justify-center p-1 rounded-md hover:bg-base-300/60 active:bg-base-300/80 transition"
            onClick={() => { setSettingsLoaded(true); (document.getElementById('settings-modal') as HTMLDialogElement)?.showModal(); }}
          >
            <IconSettings size={14} />
          </button>
        </div>
      </div>
      {/* 设置中心：daisyUI modal */}
      <dialog id="settings-modal" className="modal">
        <div className="modal-box space-y-3">
          <h3 className="font-semibold">设置</h3>
          <div className="space-y-2">
            <div className="form-control">
              <label className="label"><span className="label-text">主题模式</span></label>
              <div className="join">
                <button type="button" className="btn btn-sm join-item" onClick={()=>{ document.documentElement.removeAttribute('data-theme'); }}>
                  跟随系统
                </button>
                <button type="button" className="btn btn-sm join-item" onClick={()=>{ document.documentElement.setAttribute('data-theme','light'); }}>
                  浅色
                </button>
                <button type="button" className="btn btn-sm join-item" onClick={()=>{ document.documentElement.setAttribute('data-theme','dark'); }}>
                  深色
                </button>
              </div>
            </div>
            {/* Designer 设置（自动 dry-run / 仅渲染可视区） */}
            <div className="divider my-2" />
            <div>
              <h4 className="font-medium text-sm mb-1">Designer 设置</h4>
              {settingsLoaded && (
                <React.Suspense fallback={<div className="text-xs opacity-60">加载设置…</div>}>
                  <DesignerSettingsLazy />
                </React.Suspense>
              )}
            </div>
          </div>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-sm">关闭</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
      <main className="container mx-auto p-4">
        <div className="tabs tabs-bordered mb-3">
          {navItems.map((n) => (
            <Link key={n.to} to={n.to} className={"tab tab-bordered tab-sm"}>{n.label}</Link>
          ))}
        </div>
        <PluginRuntimeProvider>
          <ErrorBoundary>
            <Suspense fallback={<div className="text-sm opacity-60">加载中…</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </PluginRuntimeProvider>
      </main>
    </div>
  );
}
