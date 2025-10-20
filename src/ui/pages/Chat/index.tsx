import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAgentThread, sendAgentMessage, clearAgentThread, buildAgentExportUrl } from "../../services/agents";

export default function ChatPage() {
  const [sessionKey, setSessionKey] = useState<string>(() => `chat-${Date.now()}`);
  const [messages, setMessages] = useState<Array<{ role: string; content: any; ts?: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (limit?: number) => {
    const params: any = { sessionKey };
    if (typeof limit === "number") params.limit = limit;
    const res = await getAgentThread(params);
    setMessages(res.messages || []);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 999999, behavior: "smooth" }));
  }, [sessionKey]);

  useEffect(() => { refresh(50); }, [refresh]);

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    try {
      const res = await sendAgentMessage({ sessionKey, message: text });
      setMessages(res.thread?.messages || []);
      setInput("");
    } finally { setLoading(false); }
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 999999, behavior: "smooth" }));
  }

  async function onClear() {
    await clearAgentThread({ sessionKey });
    setMessages([]);
  }

  const exportHref = useMemo(() => buildAgentExportUrl(sessionKey), [sessionKey]);

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      <div className="card bg-base-200">
        <div className="card-body gap-3">
          <div className="flex items-center gap-2">
            <label className="label" htmlFor="session">会话键</label>
            <input id="session" className="input input-bordered input-sm w-full" value={sessionKey} onChange={(e)=>setSessionKey(e.target.value)} />
            <a className="btn btn-ghost btn-sm" href={exportHref} target="_blank" rel="noreferrer">导出</a>
            <button className="btn btn-warning btn-sm" onClick={onClear}>清空</button>
          </div>
          <div ref={listRef} className="h-80 overflow-auto rounded bg-base-100 p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={"chat "+(m.role === 'user' ? 'chat-end' : 'chat-start') }>
                <div className="chat-header opacity-60 text-xs mb-1">{m.role}{m.ts ? ` · ${m.ts}`: ''}</div>
                <div className={"chat-bubble "+(m.role==='user'?'chat-bubble-primary':'')}>{String(m.content)}</div>
              </div>
            ))}
            {!messages.length && <div className="opacity-60 text-sm">暂无消息，开始对话吧～</div>}
          </div>
          <form className="flex items-center gap-2" onSubmit={onSend}>
            <input className="input input-bordered w-full" placeholder="输入消息，回车发送" value={input} onChange={(e)=>setInput(e.target.value)} />
            <button className={"btn btn-primary "+(loading?"btn-disabled":"")} type="submit">发送</button>
          </form>
        </div>
      </div>
    </div>
  );
}
