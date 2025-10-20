import React, { useRef, useState } from "react";
import { chatKitSendMessage, chatKitUpload } from "../../services/agents.chatkit";

export default function ChatKitPage() {
  const [sessionKey, setSessionKey] = useState<string>(() => `ck-${Date.now()}`);
  const [events, setEvents] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  function push(ev: any) {
    setEvents((prev) => [...prev, ev]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 999999, behavior: "smooth" }));
  }

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    push({ type: 'message', role: 'user', content: [{ type: 'text', text: text }] });
    setInput("");
    const res = await chatKitSendMessage({ sessionKey, content: text });
    (res.events || []).forEach(push);
  }

  async function onUpload() {
    const res = await chatKitUpload({ name: 'note.txt', content: 'hello' });
    if (res.ok) push({ type: 'system', text: '上传成功: note.txt' });
  }

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      <div className="card bg-base-200">
        <div className="card-body gap-3">
          <div className="flex items-center gap-2">
            <label className="label" htmlFor="session">会话键</label>
            <input id="session" className="input input-bordered input-sm w-full" value={sessionKey} onChange={(e)=>setSessionKey(e.target.value)} />
            <button className="btn btn-outline btn-sm" onClick={onUpload}>上传示例</button>
          </div>
          <div ref={listRef} className="h-80 overflow-auto rounded bg-base-100 p-3 space-y-2">
            {events.map((ev, i) => (
              <div key={i} className={"text-sm "+(ev.role==='user'?'text-right':'text-left') }>
                {ev.type==='message' ? (
                  <div><span className="opacity-60 mr-1">{ev.role}:</span>{ev.content?.[0]?.text ?? JSON.stringify(ev)}</div>
                ) : (
                  <div className="opacity-60">{JSON.stringify(ev)}</div>
                )}
              </div>
            ))}
            {!events.length && <div className="opacity-60 text-sm">暂无事件，开始对话吧～</div>}
          </div>
          <form className="flex items-center gap-2" onSubmit={onSend}>
            <input className="input input-bordered w-full" placeholder="输入消息，回车发送" value={input} onChange={(e)=>setInput(e.target.value)} />
            <button className="btn btn-primary" type="submit">发送</button>
          </form>
        </div>
      </div>
    </div>
  );
}
