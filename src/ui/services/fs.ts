import { requestJson } from "./core/http";

export type FSScope = 'plansRepo' | 'plansConfig' | 'state' | 'archives' | 'logs';
export interface FSEntry { name: string; type: 'file'|'dir'; size: number; modifiedAt: string }

export async function fsList(scope: FSScope, path = '.') {
  const data = await requestJson<{ entries: FSEntry[] }>("GET", "/fs/list", { query: { scope, path } });
  return data.entries;
}
export async function fsRead(scope: FSScope, path: string) {
  const data = await requestJson<{ content: string }>("GET", "/fs/read", { query: { scope, path } });
  return data.content;
}
export async function fsWrite(scope: FSScope, path: string, content: string, overwrite = true) {
  await requestJson<void>("POST", "/fs/write", { body: { scope, path, content, overwrite } });
  return true;
}
export async function fsMkdir(scope: FSScope, path: string) {
  await requestJson<void>("POST", "/fs/mkdir", { body: { scope, path } });
  return true;
}
export async function fsMove(scope: FSScope, from: string, to: string) {
  await requestJson<void>("POST", "/fs/move", { body: { scope, from, to } });
  return true;
}
export async function fsDelete(scope: FSScope, path: string, recursive = false) {
  await requestJson<void>("DELETE", "/fs/delete", { body: { scope, path, recursive } });
  return true;
}
