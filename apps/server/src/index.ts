import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Busboy from '@fastify/busboy';
import { nanoid } from 'nanoid';
import { mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { serveStatic } from 'hono/bun';
import { join, basename } from 'node:path';
const ROOT = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILES = join(ROOT, 'files');
const TMP = join(ROOT, 'tmp');
type UploadedFile = { name: string; path: string; size: number };
type Row = UploadedFile & { id: string; expiresAt: string; uploadedAt?: string };
const PORT = Number(process.env.PORT || 3000);
const MAX = 200_000_000;
const dbFile = join(ROOT, 'files.json');
let rows: Row[] = [];

async function init() {
  await mkdir(FILES, { recursive: true });
  await mkdir(TMP, { recursive: true });
  try { rows = JSON.parse(await readFile(dbFile, 'utf8')); } catch { rows = []; }
}
async function persist() { await writeFile(dbFile, JSON.stringify(rows, null, 2)); }
async function cleanup() {
  const now = Date.now(); const keep: Row[] = [];
  for (const row of rows) {
    if (new Date(row.expiresAt).getTime() <= now) await rm(row.path, { force: true }); else keep.push(row);
  }
  if (keep.length !== rows.length) { rows = keep; await persist(); }
}
function parseUpload(request: Request): Promise<UploadedFile> {
  const { promise, resolve, reject } = Promise.withResolvers<UploadedFile>();
  const contentType = request.headers.get('content-type') || '';
  if (!request.body || !contentType.includes('multipart/form-data')) {
    reject(new Error('multipart file required'));
    return promise;
  }
  const id = nanoid(12);
  const tempPath = join(TMP, `${id}.part`);
  const safeName = { value: 'untitled' };
  let size = 0;
  let stream: ReturnType<typeof createWriteStream> | undefined;
  let failed: Error | undefined;
  const busboy = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX } });
  busboy.on('file', (_field, file, info) => {
    const rawName = typeof info === 'string' ? info : info?.filename;
    const name = basename(rawName || 'untitled').replace(/[\\/\0\r\n]/g, '_') || 'untitled';
    safeName.value = name;
    stream = createWriteStream(tempPath, { flags: 'wx' });
    file.on('data', (chunk: Buffer) => { size += chunk.length; });
    file.on('limit', () => { failed = new Error('file exceeds 200 MB'); file.resume(); });
    file.on('error', error => { failed = error; });
    file.pipe(stream);
  });
  busboy.on('error', error => { failed = error; });
  busboy.on('finish', async () => {
    try {
      if (stream) await new Promise<void>((resolveClose, rejectClose) => { stream!.on('close', resolveClose); stream!.on('error', rejectClose); });
      if (failed) throw failed;
      if (!stream) throw new Error('file required');
      const finalDir = join(FILES, id);
      await mkdir(finalDir, { recursive: true });
      const finalPath = join(finalDir, safeName.value);
      await rename(tempPath, finalPath);
      resolve({ name: safeName.value, path: finalPath, size });
    } catch (error) {
      await rm(tempPath, { force: true });
      reject(error);
    }
  });
  request.body.pipeTo(new WritableStream<Uint8Array>({
    write(chunk) { busboy.write(Buffer.from(chunk)); },
    close() { busboy.end(); },
    abort(error) { busboy.destroy(error); },
  })).catch(reject);
  return promise;
}

const app = new Hono(); app.use('*', cors());
app.get('/api/files', async c => { await cleanup(); return c.json(rows.slice().reverse()); });
app.post('/api/files', async c => {
  try { const uploaded = await parseUpload(c.req.raw); const now = Date.now(); const row = { id: uploaded.path.split('/').at(-2)!, name: uploaded.name, size: uploaded.size, path: uploaded.path, uploadedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 60 * 60 * 1000).toISOString() }; rows.push(row); await persist(); return c.json(row, 201); }
  catch (error) { const message = error instanceof Error ? error.message : 'upload failed'; return c.text(message, message.includes('200 MB') ? 413 : 400); }
});
app.delete('/api/files/:id', async c => { const i = rows.findIndex(row => row.id === c.req.param('id')); if (i < 0) return c.notFound(); await rm(join(FILES, rows[i].id), { recursive: true, force: true }); rows.splice(i, 1); await persist(); return c.body(null, 204); });
app.get('/api/files/:id/download', async c => { const row = rows.find(item => item.id === c.req.param('id')); if (!row || Date.parse(row.expiresAt) <= Date.now()) return c.notFound(); const file = Bun.file(row.path); if (!(await file.exists())) return c.notFound(); return new Response(file, { headers: { 'Content-Disposition': `attachment; filename="${row.name.replace(/"/g, '')}"`, 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }); });
app.get('/api/files/:id/preview', async c => { const row = rows.find(item => item.id === c.req.param('id')); if (!row || Date.parse(row.expiresAt) <= Date.now()) return c.notFound(); const type = row.name.toLowerCase().match(/\.(png|jpe?g|gif|webp)$/)?.[1]; if (!type) return c.notFound(); try { const file = Bun.file(row.path); if (!(await file.exists())) return c.notFound(); const contentType = type === 'jpg' || type === 'jpeg' ? 'image/jpeg' : `image/${type}`; return new Response(file, { headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }); } catch { return c.notFound(); } });
app.use('/*', serveStatic({ root: '../web/dist' }));
await init(); setInterval(cleanup, 15 * 60 * 1000); serve({ fetch: app.fetch, port: PORT }); console.log(`Fileport server on ${PORT}`);
