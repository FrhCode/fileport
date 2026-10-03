import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type FileRecord = { id: string; name: string; size: number; path: string; expiresAt: string; uploadedAt?: string; mime?: string };
type UploadStatus = 'waiting' | 'uploading' | 'saving' | 'error';
type UploadError = 'oversize' | 'network' | 'server';
type Upload = { id: string; file: File; loaded: number; progress: number; status: UploadStatus; error?: string; errorKind?: UploadError };
type Notice = { title: string; text?: string; tone?: 'success' | 'warn' | 'error' };
type CopyFeedback = { target: string; count: number };
type IconName = 'upload' | 'search' | 'folder' | 'copy' | 'download' | 'trash' | 'check' | 'close' | 'warning' | 'file' | 'image' | 'chevron';

const MAX = 200_000_000;
const CONCURRENCY = 1;
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const size = (bytes: number) => bytes < 1_000_000 ? `${(bytes / 1_000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
const kind = (name: string) => { const ext = name.split('.').pop()?.toLowerCase() || ''; return { ext: ext.toUpperCase() || 'FILE', label: ext ? `${ext.toUpperCase()} file` : 'File' }; };
const expiry = (date: string) => { const days = Math.ceil((Date.parse(date) - Date.now()) / 86_400_000); return days > 0 ? `${days} hari lagi` : 'Kedaluwarsa'; };
const expired = (date: string) => Date.parse(date) <= Date.now();
const isImage = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name);

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    folder: <path d="M3.5 7.5v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-7l-2-3h-4a2 2 0 0 0-2 2Z" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    download: <><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m7 7 1 13h8l1-13" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
    warning: <><path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    file: <><path d="M6 2.5h8l4 4V21H6Z" /><path d="M14 2.5V7h4" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 17 5-5 4 4 2-2 5 4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function copyWithExecCommand(text: string) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    try { previous?.focus({ preventScroll: true }); } catch { previous?.focus(); }
  }
}

function send(file: File, onProgress: (progress: number, loaded: number) => void, signal: AbortSignal) {
  return new Promise<FileRecord>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);
    xhr.open('POST', '/api/files');
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100), event.loaded);
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve(JSON.parse(xhr.responseText))
      : reject(Object.assign(new Error(xhr.status === 413 ? 'File terlalu besar. Maksimal 200 MB per file.' : xhr.responseText || 'Upload gagal.'), { kind: xhr.status === 413 ? 'oversize' : 'server' }));
    xhr.onerror = () => reject(Object.assign(new Error('Koneksi terputus. Upload belum selesai.'), { kind: 'network' }));
    xhr.onabort = () => reject(new Error('Upload dibatalkan'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

function App() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileRecord | null>(null);
  const [manualPaths, setManualPaths] = useState<string[] | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const requests = useRef(new Map<string, AbortController>());
  const pending = useRef<Upload[]>([]);
  const active = useRef(0);
  const successful = useRef(0);
  const successTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const copyGeneration = useRef(0);
  const mounted = useRef(true);

  const load = async () => {
    const response = await fetch('/api/files');
    if (!response.ok) throw Error('File gagal dimuat.');
    const next: FileRecord[] = await response.json();
    setFiles(next);
    setDetail(current => current && next.some(file => file.id === current.id) ? current : null);
    setConfirmDelete(current => current && next.some(file => file.id === current.id) ? current : null);
  };

  useEffect(() => {
    load().catch(error => setNotice({ title: error.message, tone: 'error' }));
    const timer = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmDelete(null); setDetail(null); setMenu(null); setManualPaths(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => () => {
    mounted.current = false;
    copyGeneration.current += 1;
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    if (successTimer.current) window.clearTimeout(successTimer.current);
  }, []);

  const announceSuccess = () => {
    successful.current += 1;
    if (successTimer.current) window.clearTimeout(successTimer.current);
    successTimer.current = window.setTimeout(() => {
      const count = successful.current;
      successful.current = 0;
      setNotice({ title: `${count} file berhasil diunggah.` });
    }, 300);
  };

  const runUpload = (upload: Upload, pump: () => void) => {
    const controller = new AbortController();
    requests.current.set(upload.id, controller);
    setUploads(current => current.map(item => item.id === upload.id ? { ...item, status: 'uploading' } : item));
    send(upload.file, (progress, loaded) => setUploads(current => current.map(item => item.id === upload.id ? { ...item, loaded, progress, status: progress >= 100 ? 'saving' : 'uploading' } : item)), controller.signal)
      .then(async () => {
        setUploads(current => current.filter(item => item.id !== upload.id));
        await load();
        announceSuccess();
      })
      .catch((error: Error & { kind?: UploadError }) => {
        if (error.message !== 'Upload dibatalkan') {
          setUploads(current => current.map(item => item.id === upload.id ? { ...item, status: 'error', error: error.message, errorKind: error.kind || 'server' } : item));
        }
      })
      .finally(() => {
        active.current -= 1;
        requests.current.delete(upload.id);
        pump();
      });
  };

  const pump = () => {
    while (active.current < CONCURRENCY && pending.current.length) {
      const next = pending.current.shift()!;
      active.current += 1;
      runUpload(next, pump);
    }
  };
  const start = (incoming: FileList | File[]) => {
    const additions = Array.from(incoming).map(file => {
      const oversize = file.size > MAX;
      return { id: id(), file, loaded: 0, progress: 0, status: oversize ? 'error' as const : 'waiting' as const, error: oversize ? 'File terlalu besar. Maksimal 200 MB per file.' : undefined, errorKind: oversize ? 'oversize' as const : undefined };
    });
    pending.current.push(...additions.filter(item => item.status === 'waiting'));
    setUploads(current => [...current, ...additions]);
    pump();
  };
  const cancel = (upload: Upload) => {
    pending.current = pending.current.filter(item => item.id !== upload.id);
    requests.current.get(upload.id)?.abort();
    setUploads(current => current.filter(item => item.id !== upload.id));
  };
  const retry = (upload: Upload) => {
    if (upload.file.size > MAX) return;
    setUploads(current => current.filter(item => item.id !== upload.id));
    const replacement: Upload = { ...upload, id: id(), loaded: 0, progress: 0, status: 'waiting', error: undefined, errorKind: undefined };
    pending.current.push(replacement);
    setUploads(current => [...current, replacement]);
    pump();
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length) start(event.dataTransfer.files);
  };
  const paste = (event: ClipboardEvent<HTMLElement>) => {
    if (event.clipboardData.files.length) { event.preventDefault(); start(event.clipboardData.files); }
  };
  const copy = async (paths: string[], target: string) => {
    if (!paths.length) return;
    const generation = ++copyGeneration.current;
    const text = paths.join('\n');
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); copied = true; } catch { /* Try the local fallback below. */ }
    }
    if (!copied) copied = copyWithExecCommand(text);
    if (!mounted.current || generation !== copyGeneration.current) return;
    if (!copied) {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      setCopyFeedback(null);
      setManualPaths(paths);
      return;
    }
    setManualPaths(null);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    const feedback = { target, count: paths.length };
    setCopyFeedback(feedback);
    copyTimer.current = window.setTimeout(() => {
      if (mounted.current && generation === copyGeneration.current) setCopyFeedback(null);
    }, 3_000);
  };
  const remove = async (file: FileRecord) => {
    const response = await fetch(`/api/files/${file.id}`, { method: 'DELETE' });
    if (!response.ok) { setNotice({ title: 'File gagal dihapus.', tone: 'error' }); return; }
    setFiles(current => current.filter(item => item.id !== file.id));
    setSelected(current => current.filter(fileId => fileId !== file.id));
    setMenu(null); setDetail(null); setConfirmDelete(null);
    setNotice({ title: 'File berhasil dihapus.' });
  };

  const visible = files.filter(file => file.name.toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = visible.filter(file => selected.includes(file.id));
  const copyableChosen = chosen.filter(file => !expired(file.expiresAt));
  const selectionTarget = `selection:${copyableChosen.map(file => file.id).join(',')}`;
  const selectionCopied = copyFeedback?.target === selectionTarget;
  const allVisibleSelected = visible.length > 0 && visible.every(file => selected.includes(file.id));
  const toggleSelected = (file: FileRecord, checked: boolean) => setSelected(current => checked ? Array.from(new Set([...current, file.id])) : current.filter(fileId => fileId !== file.id));
  const selectAll = (checked: boolean) => setSelected(current => checked ? Array.from(new Set([...current, ...visible.map(file => file.id)])) : current.filter(fileId => !visible.some(file => file.id === fileId)));
  const empty = files.length === 0;
  const noResults = !empty && visible.length === 0;

  return <>
    <header className="topbar"><div className="brand"><img src="/fileport-mark.svg" alt="" /><b>Fileport</b></div><div className="host-label"><i /> Host lokal</div></header>
    <main className="workspace" onPaste={paste}>
      <div className="page-heading"><h1>Unggah file</h1><p className="lead">Upload, lalu salin path ke Hermes.</p></div>
      <section className={`dropzone ${dragging ? 'is-dragging' : ''}`} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={event => event.preventDefault()} onDrop={drop} aria-label="Area unggah">
        <div className="drop-top"><Icon name="upload" size={27} /><span className="drop-copy">Tarik file ke sini atau paste screenshot</span></div>
        <button className="btn primary" onClick={() => input.current?.click()}>Pilih file</button>
        <small>Semua format&nbsp; · &nbsp;Maks. 200 MB/file&nbsp; · &nbsp;Disimpan 3 hari</small>
        <input ref={input} type="file" multiple onChange={event => { if (event.target.files) start(event.target.files); event.target.value = ''; }} />
      </section>

      {uploads.length > 0 && <section className="queue-panel" aria-label="Antrean upload"><div className="queue-heading"><h2>Mengunggah ({uploads.length})</h2></div>{uploads.map(upload => <UploadRow key={upload.id} upload={upload} cancel={cancel} retry={retry} />)}</section>}
      {notice && <div className={`notice ${notice.tone || 'success'}`} role="status"><span className="notice-symbol"><Icon name={notice.tone === 'error' ? 'warning' : 'check'} size={15} /></span><strong>{notice.title}</strong>{notice.text && <span>{notice.text}</span>}<button onClick={() => setNotice(null)} aria-label="Tutup notifikasi"><Icon name="close" size={15} /></button></div>}

      <div className="section-heading"><div className="section-title"><h2>File tersimpan ({visible.length})</h2></div><label className="search"><Icon name="search" size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari file..." aria-label="Cari file" /></label></div>
      {empty || noResults ? <section className="empty-panel"><Icon name={noResults ? 'search' : 'folder'} size={48} /><h3>{noResults ? 'File tidak ditemukan' : 'Belum ada file'}</h3><p>{noResults ? 'Coba kata pencarian yang lain.' : 'File yang kamu unggah akan muncul di sini.'}</p></section> : <section className="file-table">
        {chosen.length > 0 && <div className="selection"><b>{chosen.length} file dipilih</b><button className="quiet" onClick={() => setSelected([])}>Batal pilih</button><button className={`btn small selection-copy ${selectionCopied ? 'copied' : ''}`} disabled={!copyableChosen.length} aria-live="polite" onClick={() => copy(copyableChosen.map(file => file.path), selectionTarget)}><Icon name={selectionCopied ? 'check' : 'copy'} size={15} /> {selectionCopied ? `${copyFeedback.count} path tersalin` : `Salin ${copyableChosen.length} path`}</button></div>}
        <div className="table-head"><input type="checkbox" aria-label="Pilih semua file" checked={allVisibleSelected} onChange={event => selectAll(event.target.checked)} /><span>Nama file</span><span>Ukuran</span><span>Path lengkap</span><span>Kedaluwarsa</span><span>Aksi</span></div>
        {visible.map(file => <FileRow key={file.id} file={file} selected={selected.includes(file.id)} copied={copyFeedback?.target === `row:${file.id}`} onSelect={toggleSelected} onCopy={() => copy([file.path], `row:${file.id}`)} onOpen={() => setDetail(file)} menu={menu} setMenu={setMenu} onDelete={() => setConfirmDelete(file)} />)}
      </section>}
      <footer className="bottom-note"><b>File tersimpan di host lokal.</b><span>Path dapat disalin ke Hermes.</span></footer>
    </main>
    {detail && <DetailModal file={detail} copied={copyFeedback?.target === `detail:${detail.id}`} onClose={() => setDetail(null)} onCopy={() => copy([detail.path], `detail:${detail.id}`)} onDelete={() => setConfirmDelete(detail)} />}
    {confirmDelete && <ConfirmModal file={confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />}
    {manualPaths && <ManualCopyModal paths={manualPaths} onClose={() => setManualPaths(null)} />}
  </>;
}

function UploadRow({ upload, cancel, retry }: { upload: Upload; cancel: (upload: Upload) => void; retry: (upload: Upload) => void }) {
  const error = upload.status === 'error';
  const oversize = upload.errorKind === 'oversize';
  const detail = upload.status === 'waiting'
    ? 'Menunggu'
    : upload.status === 'saving'
      ? 'Transfer selesai · Menyimpan di host...'
      : upload.status === 'uploading'
        ? `${size(upload.loaded)} dari ${size(upload.file.size)} · ${upload.progress}%`
        : size(upload.file.size);
  return <div className={`queue-item ${error ? `error-item ${oversize ? 'oversize' : 'retryable'}` : ''}`}>
    <FileIcon name={upload.file.name} />
    <div className="upload-copy"><b>{upload.file.name}</b><small>{detail}</small></div>
    {error ? <div className="upload-error"><span className="error-mark"><Icon name={oversize ? 'close' : 'warning'} size={13} /></span><span>{upload.error}</span></div> : <div className="progress" aria-label={`${upload.progress}%`}><i style={{ width: upload.status === 'saving' ? '100%' : `${upload.progress}%` }} /></div>}
    <div className="queue-status">{error ? <>{!oversize && <button className="btn outline small" onClick={() => retry(upload)}>Coba lagi</button>}<button className="danger" onClick={() => cancel(upload)}>{oversize ? 'Hapus dari antrean' : 'Batal'}</button></> : <><span>{upload.status === 'waiting' ? 'Menunggu...' : upload.status === 'saving' ? 'Menyimpan...' : 'Mengunggah...'}</span><button className="danger" onClick={() => cancel(upload)}>Batal</button></>}</div>
  </div>;
}

function FileIcon({ name, id: fileId }: { name: string; id?: string }) {
  const [failed, setFailed] = useState(false);
  const type = kind(name);
  const preview = isImage(name) && fileId && !failed;
  return <div className={`file-icon file-${type.ext.toLowerCase()}`}>{preview ? <img src={`/api/files/${fileId}/preview`} alt={`Thumbnail ${name}`} loading="lazy" onError={() => setFailed(true)} /> : isImage(name) ? <><Icon name="image" size={20} /><span>IMG</span></> : <><Icon name="file" size={22} /><span>{type.ext.slice(0, 4)}</span></>}</div>;
}

function FileRow({ file, selected, copied, onSelect, onCopy, onOpen, menu, setMenu, onDelete }: { file: FileRecord; selected: boolean; copied: boolean; onSelect: (file: FileRecord, checked: boolean) => void; onCopy: () => void; onOpen: () => void; menu: string | null; setMenu: (id: string | null) => void; onDelete: () => void }) {
  const isExpired = expired(file.expiresAt);
  return <div className={`file-row ${selected ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`Buka detail ${file.name}`} onClick={onOpen} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    <input type="checkbox" aria-label={`Pilih ${file.name}`} checked={selected} onClick={event => event.stopPropagation()} onChange={event => onSelect(file, event.target.checked)} />
    <div className="file-name"><FileIcon name={file.name} id={file.id} /><div className="file-meta"><b>{file.name}</b><small className="mobile-meta">{size(file.size)}</small></div></div>
    <span className="file-size">{size(file.size)}</span>
    <code title={file.path}>{file.path}</code>
    <small className={isExpired ? 'expired' : ''}>{expiry(file.expiresAt)}</small>
    <div className="actions" onClick={event => event.stopPropagation()}>{!isExpired && <button className={`copy ${copied ? 'copied' : ''}`} aria-live="polite" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Tersalin' : 'Salin path'}</button>}<button className="dots" aria-label={`Menu ${file.name}`} onClick={() => setMenu(menu === file.id ? null : file.id)}>•••</button>{menu === file.id && <div className="menu"><a href={isExpired ? undefined : `/api/files/${file.id}/download`} onClick={event => isExpired && event.preventDefault()}><Icon name="download" size={14} /> Unduh</a><button onClick={onDelete}><Icon name="trash" size={14} /> Hapus</button></div>}</div>
  </div>;
}

function DetailModal({ file, copied, onClose, onCopy, onDelete }: { file: FileRecord; copied: boolean; onClose: () => void; onCopy: () => void; onDelete: () => void }) {
  const [failed, setFailed] = useState(false);
  const image = isImage(file.name);
  return <div className="modal-backdrop" role="presentation" onClick={event => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" aria-label="Tutup" onClick={onClose}><Icon name="close" /></button><h2 id="detail-title">Detail file</h2><div className="detail-preview">{image && !failed ? <img src={`/api/files/${file.id}/preview`} alt={file.name} onError={() => setFailed(true)} /> : <FileIcon name={file.name} />}</div><b>{file.name}</b><p>{kind(file.name).label} · {size(file.size)} · {expiry(file.expiresAt)}</p><code className="detail-path">{file.path}</code><div className="modal-actions"><button className={`detail-copy ${copied ? 'copied' : ''}`} aria-live="polite" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Tersalin' : 'Salin path'}</button><a className="button-link" href={`/api/files/${file.id}/download`}><Icon name="download" size={15} /> Unduh</a><button className="danger" onClick={() => { onClose(); onDelete(); }}><Icon name="trash" size={15} /> Hapus</button></div></section></div>;
}
function ConfirmModal({ file, onClose, onConfirm }: { file: FileRecord; onClose: () => void; onConfirm: () => void }) { return <div className="modal-backdrop" role="presentation" onClick={event => event.target === event.currentTarget && onClose()}><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title"><h2 id="confirm-delete-title">Hapus file?</h2><p><b>{file.name}</b> akan dihapus dari host lokal. Path yang pernah disalin tidak akan bisa digunakan lagi.</p><div className="modal-actions"><button className="quiet" onClick={onClose}>Batal</button><button className="danger solid" onClick={onConfirm}>Hapus file</button></div></section></div>; }
function ManualCopyModal({ paths, onClose }: { paths: string[]; onClose: () => void }) { const ref = useRef<HTMLTextAreaElement>(null); useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []); return <div className="modal-backdrop" role="presentation"><section className="modal manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-copy-title"><button className="modal-close" aria-label="Tutup" onClick={onClose}><Icon name="close" /></button><h2 id="manual-copy-title">Salin path secara manual</h2><p>Penyalinan otomatis tidak berhasil. Teks sudah dipilih; tekan <b>Ctrl+C</b> untuk menyalinnya.</p><textarea ref={ref} aria-label="Path untuk disalin manual" readOnly value={paths.join('\n')} /><div className="modal-actions"><button onClick={() => { ref.current?.focus(); ref.current?.select(); }}>Pilih semua teks</button><button className="button-link" onClick={onClose}>Selesai</button></div></section></div>; }

createRoot(document.getElementById('root')!).render(<App />);
