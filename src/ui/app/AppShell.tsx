import React, { Suspense, useState } from "react";
import { Outlet, Link } from "@tanstack/react-router";
import { IconSettings } from "@tabler/icons-react";
import { useBridgeConnection } from "../hooks/useBridgeConnection";
import { appStore, isAppStoreEnabled, useAppStoreSelector } from "../state/appStore";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PluginRuntimeProvider } from "../plugins/runtime";
import { fetchExecutions } from "../services";
const DesignerSettingsLazy = React.lazy(() => import("../pages/Designer/Settings").then(m => ({ default: m.DesignerSettings })));
const ToolStreamsLazy = React.lazy(() => import("../pages/ToolStreams").then(m => ({ default: m.default })));


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

  // 单入口模式：移除多路由导航，仅保留顶部工具条
  const bridgeState = useAppStoreSelector((s)=> s.runtime.bridgeState);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <div role="banner" className="sticky top-0 z-20 bg-base-200/80 border-b border-base-content/10 backdrop-blur h-8 px-2 flex items-center justify-between">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <Link to="/" aria-label="返回首页" className="inline-flex items-center gap-2">
            <img src="/logo.svg" alt="hush-ops" className="h-4 w-auto" />
          </Link>
          <nav aria-label="主导航" className="hidden sm:flex items-center gap-3 text-[12px]">
            <Link to="/" className="link link-hover" activeProps={{ 'aria-current': 'page' }}>首页</Link>
            <Link to="/test-hub" className="link link-hover" activeProps={{ 'aria-current': 'page' }}>TestHub</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
            bridgeState === 'connected' ? 'bg-success' : bridgeState === 'disconnected' ? 'bg-error' : 'bg-warning'
          }`} aria-label="连接状态" />
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
          <div className="divider my-2" />
          <div className="space-y-2">
            <h4 className="font-medium text-sm">运行与审计</h4>
            <button
              type="button"
              className="btn btn-sm w-full"
              onClick={() => { (document.getElementById('toolstreams-modal') as HTMLDialogElement)?.showModal(); }}
            >运行日志（工具流）</button>
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

      {/* 工具流抽屉/对话框 */}
      <dialog id="toolstreams-modal" className="modal">
        <div className="modal-box max-w-5xl w-full">
          <h3 className="font-semibold mb-2">运行日志（工具流）</h3>
          <div className="min-h-[360px]">
            <Suspense fallback={<div className="text-sm opacity-60">加载工具流…</div>}>
              <ToolStreamsLazy />
            </Suspense>
          </div>
          <div className="modal-action">
            <form method="dialog"><button className="btn btn-sm">关闭</button></form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <main id="main-content" className="container mx-auto p-4" tabIndex={-1}>
        {/* 单入口：不再显示多页 Tab 导航，所有视图均在 Dashboard 内切换 */}
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
