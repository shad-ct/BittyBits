import { useState, useCallback, useRef } from 'react';
import {
  processPDF, renderThumbnails,
  PAGE_SIZES, FILL_ORDERS, DEFAULT_CONFIG,
} from './lib/pdfProcessor';
import type { ProcessingProgress, GridConfig, PageSizeId, FillOrder } from './lib/pdfProcessor';

// ── tiny SVG icons ────────────────────────────────────────────────────────────
const Ic = {
  Upload: () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  PDF:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  DL:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  X:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:  () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Spark:  () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
  Spin:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{animation:'spin .9s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  Grid:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Refresh:() => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 12l3 3 3-3"/></svg>,
};

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ label, sub, val, min, max, onChange, disabled }: {
  label: string; sub: string; val: number;
  min: number; max: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const bump = (d: number) => onChange(Math.min(max, Math.max(min, val + d)));
  return (
    <div>
      <p className="sec-label" style={{ marginBottom: 6 }}>{label}</p>
      <div className="stepper" style={{ opacity: disabled ? .45 : 1 }}>
        <button className="step-btn" onClick={() => bump(-1)} disabled={disabled || val <= min}>−</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="step-val">{val}</div>
          <div className="step-sub">{sub}</div>
        </div>
        <button className="step-btn" onClick={() => bump(1)} disabled={disabled || val >= max}>+</button>
      </div>
    </div>
  );
}

// ── Mini grid preview ─────────────────────────────────────────────────────────
function MiniGrid({ cols, rows, fillOrder }: { cols: number; rows: number; fillOrder: FillOrder }) {
  const total = cols * rows;
  const sz = Math.max(10, Math.min(20, Math.floor(100 / Math.max(cols, rows))));
  const getLabel = (c: number, r: number) =>
    fillOrder === 'col-first' ? c * rows + r + 1 : r * cols + c + 1;
  return (
    <div className="mini-grid">
      {Array.from({ length: cols }).map((_, c) => (
        <div className="mini-col" key={c}>
          {Array.from({ length: rows }).map((_, r) => {
            const n = getLabel(c, r);
            return (
              <div key={r} className="mini-cell" style={{
                width: sz, height: Math.round(sz * 1.35),
                fontSize: Math.min(7, sz * 0.36),
                background: `linear-gradient(135deg,rgba(124,108,252,${.2+(n/total)*.5}),rgba(240,108,187,.12))`,
              }}>{n}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [cfg, setCfg] = useState<GridConfig>(DEFAULT_CONFIG);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [outBytes, setOutBytes] = useState<Uint8Array | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spp = cfg.cols * cfg.rows;
  const outPages = pageCount > 0 ? Math.ceil(pageCount / spp) : 0;
  const isProcessing = !!progress && progress.stage !== 'done';
  const isDone = progress?.stage === 'done' && !!outBytes;
  const pct = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;

  const patch = (p: Partial<GridConfig>) => { setCfg(c => ({ ...c, ...p })); setOutBytes(null); setProgress(null); setErr(null); };

  const loadFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) { setErr('Only PDF files are supported.'); return; }
    setErr(null); setOutBytes(null); setProgress(null); setFile(f); setThumbs([]);
    const buf = await f.arrayBuffer();
    const { getDocument } = await import('pdfjs-dist');
    const doc = await getDocument({ data: buf.slice(0) }).promise;
    setPageCount(doc.numPages);
    setThumbs(await renderThumbnails(buf.slice(0), 12));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }, [loadFile]);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setOver(true); };
  const onDragLeave = () => setOver(false);
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) loadFile(f); };

  const run = async () => {
    if (!file) return;
    setErr(null); setOutBytes(null);
    try {
      const buf = await file.arrayBuffer();
      setOutBytes(await processPDF(buf, cfg, p => setProgress({ ...p })));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Unknown error'); setProgress(null); }
  };

  const download = () => {
    if (!outBytes) return;
    const url = URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
    Object.assign(document.createElement('a'), {
      href: url,
      download: `${file!.name.replace('.pdf', '')}-${cfg.cols}x${cfg.rows}-grid.pdf`,
    }).click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setFile(null); setPageCount(0); setThumbs([]); setProgress(null); setOutBytes(null); setErr(null); if (inputRef.current) inputRef.current.value = ''; };

  const pageDef = PAGE_SIZES.find(p => p.id === cfg.pageSize)!;

  return (
    <div className="app-shell">
      <div className="noise" />

      {/* Ambient */}
      <div style={{ position:'fixed',top:'-15%',left:'-10%',width:500,height:500,background:'radial-gradient(circle,rgba(124,108,252,.1) 0%,transparent 70%)',pointerEvents:'none',zIndex:0 }} />
      <div style={{ position:'fixed',bottom:'-15%',right:'-10%',width:400,height:400,background:'radial-gradient(circle,rgba(240,108,187,.07) 0%,transparent 70%)',pointerEvents:'none',zIndex:0 }} />

      <main className="main-wrap" style={{ position:'relative',zIndex:1 }}>

        {/* ── Header ── */}
        <header className="afu" style={{ textAlign:'center', marginBottom:44 }}>
          <div style={{ marginBottom:14 }}>
            <span className="badge badge-accent"><Ic.Spark /> BittyBits</span>
          </div>
          <h1 style={{
            fontFamily:"'Space Grotesk',sans-serif",
            fontSize:'clamp(1.9rem,4.5vw,2.8rem)',fontWeight:700,
            letterSpacing:'-.03em',lineHeight:1.1,marginBottom:10,
            background:'linear-gradient(130deg,#eeeef8 0%,var(--accent-lt) 55%,var(--pink) 100%)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',
          }}>
            Slides, Condensed.
          </h1>
          <p style={{ color:'var(--txt-2)',fontSize:14,maxWidth:400,margin:'0 auto',lineHeight:1.7 }}>
            Turn any PDF into a compact grid handout. Configure the layout, upload, done.
          </p>
        </header>

        {/* ── Two-col layout ── */}
        <div className="two-col">

          {/* ══ LEFT: Config panel ══ */}
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>

            {/* Grid layout card */}
            <div className="card card-pad afu afu-1">
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:18 }}>
                <span className="step-chip">1</span>
                <span style={{ fontSize:13,fontWeight:600,color:'var(--txt)' }}>Configure Layout</span>
              </div>

              {/* Live preview + summary */}
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,padding:'12px 14px',background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)' }}>
                <div>
                  <p style={{ fontSize:20,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",color:'var(--txt)',lineHeight:1 }}>
                    {cfg.cols}<span style={{color:'var(--txt-3)'}}> × </span>{cfg.rows}
                  </p>
                  <p style={{ fontSize:11,color:'var(--txt-3)',marginTop:3 }}>
                    <span style={{color:'var(--accent-lt)',fontWeight:600}}>{spp} slides</span> per page
                    {outPages > 0 && <> → <span style={{color:'var(--accent-lt)',fontWeight:600}}>{outPages}pg</span></>}
                  </p>
                </div>
                <MiniGrid cols={cfg.cols} rows={cfg.rows} fillOrder={cfg.fillOrder} />
              </div>

              {/* Steppers */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18 }}>
                <Stepper label="Columns" sub="across" val={cfg.cols} min={1} max={6} onChange={v => patch({cols:v})} disabled={isProcessing} />
                <Stepper label="Rows" sub="per col" val={cfg.rows} min={1} max={10} onChange={v => patch({rows:v})} disabled={isProcessing} />
              </div>

              <div className="divider" style={{marginBottom:16}} />

              {/* Fill order */}
              <div style={{ marginBottom:16 }}>
                <p className="sec-label" style={{marginBottom:7}}>Fill Order</p>
                <div className="pill-group">
                  {FILL_ORDERS.map(fo => (
                    <button key={fo.id} className={`pill-btn${cfg.fillOrder===fo.id?' active':''}`}
                      onClick={() => patch({fillOrder: fo.id as FillOrder})} disabled={isProcessing} title={fo.desc}>
                      {fo.label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:11,color:'var(--txt-3)',marginTop:5 }}>
                  {FILL_ORDERS.find(f=>f.id===cfg.fillOrder)?.desc}
                </p>
              </div>

              <div className="divider" style={{marginBottom:16}} />

              {/* Page size */}
              <div>
                <p className="sec-label" style={{marginBottom:7}}>Page Size</p>
                <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
                  {PAGE_SIZES.map(ps => (
                    <button key={ps.id} className={`size-chip${cfg.pageSize===ps.id?' active':''}`}
                      id={`ps-${ps.id}`}
                      onClick={() => patch({pageSize: ps.id as PageSizeId})} disabled={isProcessing}>
                      {ps.label}{ps.id==='a4-portrait'?' ★':''}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:11,color:'var(--txt-3)',marginTop:6 }}>
                  {pageDef.w.toFixed(0)} × {pageDef.h.toFixed(0)} pt
                </p>
              </div>
            </div>

            {/* Summary bar */}
            <div className="card afu afu-2" style={{ padding:'14px 18px',display:'flex',gap:12,flexWrap:'wrap' }}>
              {[
                { k:'Grid',    v:`${cfg.cols}×${cfg.rows}` },
                { k:'Slides',  v:`${spp}/page` },
                { k:'Order',   v: FILL_ORDERS.find(f=>f.id===cfg.fillOrder)?.label.split('-')[0] ?? '' },
                { k:'Paper',   v: pageDef.shortLabel },
              ].map(({ k, v }) => (
                <div key={k} style={{ flex:1, minWidth:56 }}>
                  <p className="sec-label">{k}</p>
                  <p style={{ fontSize:13,fontWeight:600,color:'var(--txt)',marginTop:3 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ══ RIGHT: Upload + Output ══ */}
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>

            {/* Step header */}
            <div className="card card-pad afu afu-2">
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16 }}>
                <span className={`step-chip${file ? ' done':''}`}>{file ? <Ic.Check /> : '2'}</span>
                <span style={{ fontSize:13,fontWeight:600,color:'var(--txt)' }}>
                  {file ? 'File loaded' : 'Upload PDF'}
                </span>
                {file && (
                  <button className="btn-ghost" onClick={reset}
                    style={{ marginLeft:'auto',padding:'4px 10px',fontSize:12,borderRadius:8 }}>
                    <Ic.X /> Change
                  </button>
                )}
              </div>

              {/* Drop zone */}
              {!file ? (
                <div
                  className={`drop-zone${over?' over':''}`}
                  style={{ padding:'52px 24px',textAlign:'center' }}
                  onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                  onClick={() => inputRef.current?.click()}
                >
                  <input ref={inputRef} id="file-input" type="file" accept=".pdf" style={{display:'none'}} onChange={onInput} />
                  <div style={{ color:over?'var(--accent)':'var(--txt-3)',marginBottom:12,transition:'color .2s' }}><Ic.Upload /></div>
                  <p style={{ fontSize:15,fontWeight:600,color:'var(--txt)',marginBottom:5,fontFamily:"'Space Grotesk',sans-serif" }}>
                    {over ? 'Release to upload' : 'Drop PDF here'}
                  </p>
                  <p style={{ fontSize:13,color:'var(--txt-2)' }}>
                    or <span style={{color:'var(--accent)',textDecoration:'underline',cursor:'pointer'}}>browse files</span>
                  </p>
                  <p style={{ fontSize:11,color:'var(--txt-3)',marginTop:14 }}>PDF only · processed entirely in your browser</p>
                </div>
              ) : (
                /* File info */
                <div style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)' }}>
                  <div style={{ width:36,height:36,borderRadius:9,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--accent-lt)',flexShrink:0 }}>
                    <Ic.PDF />
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ fontWeight:600,fontSize:13,color:'var(--txt)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{file.name}</p>
                    <p style={{ fontSize:11,color:'var(--txt-3)',marginTop:2 }}>{pageCount} slides · {(file.size/1024).toFixed(0)} KB</p>
                  </div>
                  {isDone && <span className="badge badge-green"><Ic.Check /> Ready</span>}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {thumbs.length > 0 && (
              <div className="card card-pad afu afu-2">
                <p className="sec-label" style={{marginBottom:10}}>Preview — first {thumbs.length} slides</p>
                <div className="thumb-grid" style={{gridTemplateColumns:`repeat(${Math.min(thumbs.length,4)},1fr)`}}>
                  {thumbs.map((src,i) => (
                    <div key={i} className="thumb" title={`Slide ${i+1}`}>
                      <img src={src} alt={`Slide ${i+1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Generate / Download */}
            {file && (
              <div className="card card-pad afu afu-3">
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:16 }}>
                  <span className={`step-chip${isDone?' done':''}`}>{isDone ? <Ic.Check /> : '3'}</span>
                  <span style={{ fontSize:13,fontWeight:600,color:'var(--txt)' }}>
                    {isDone ? 'Output ready' : 'Generate'}
                  </span>
                </div>

                {/* Progress */}
                {isProcessing && progress && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:6 }}>
                      <span style={{ fontSize:12,color:'var(--txt-2)' }}>{progress.message}</span>
                      <span style={{ fontSize:12,color:'var(--accent-lt)',fontWeight:600 }}>{pct}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{width:`${pct}%`}} />
                    </div>
                  </div>
                )}

                {/* Error */}
                {err && (
                  <div style={{ padding:'10px 14px',borderRadius:10,background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.2)',color:'var(--red)',fontSize:13,marginBottom:14 }}>
                    ⚠ {err}
                  </div>
                )}

                {/* Output summary (done state) */}
                {isDone && (
                  <div style={{ display:'flex',gap:10,marginBottom:14,padding:'10px 14px',background:'var(--green-dim)',borderRadius:10,border:'1px solid rgba(74,222,128,.15)',fontSize:12,color:'var(--green)' }}>
                    <Ic.Check />
                    <span>{pageCount} slides condensed into <strong>{outPages} page{outPages!==1?'s':''}</strong> ({cfg.cols}×{cfg.rows} grid, {pageDef.shortLabel})</span>
                  </div>
                )}

                <div style={{ display:'flex',gap:10 }}>
                  {!isDone ? (
                    <button id="btn-process" className="btn-primary" onClick={run} disabled={isProcessing} style={{flex:1,justifyContent:'center'}}>
                      {isProcessing ? <><Ic.Spin /> Processing…</> : <><Ic.Grid /> Generate Grid PDF</>}
                    </button>
                  ) : (
                    <>
                      <button id="btn-download" className="btn-primary" onClick={download} style={{flex:1,justifyContent:'center'}}>
                        <Ic.DL /> Download PDF
                      </button>
                      <button className="btn-ghost" onClick={reset} title="Start over">
                        <Ic.Refresh />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={{ textAlign:'center',marginTop:52,color:'var(--txt-3)',fontSize:12 }}>
          <p>All processing happens <strong style={{color:'var(--txt-2)'}}>in your browser</strong> — no files are uploaded anywhere.</p>
        </footer>

      </main>
    </div>
  );
}
