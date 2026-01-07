'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type DowntimeReason = 'break' | 'fault'

type WorkOrder = {
  id: string
  wo: string
  model: string
  operation: string
  color: string
  size: string
  target_pph: number
}

type SessionState =
  | { phase: 'idle' }
  | { phase: 'authenticated'; operatorId: string; operatorName: string }
  | { phase: 'running'; operatorId: string; operatorName: string; wo: WorkOrder; startTs: number; produced: number }
  | {
      phase: 'paused'
      operatorId: string
      operatorName: string
      wo: WorkOrder
      startTs: number
      produced: number
      reason: DowntimeReason
      pauseTs: number
    }

const demoWorkOrders: WorkOrder[] = [
  { id: '1', wo: 'WO-1001', model: 'LACOSTE POLO', operation: 'Dikiş', color: 'Lacivert', size: 'M', target_pph: 45 },
  { id: '2', wo: 'WO-1002', model: 'LACOSTE TSHIRT', operation: 'Overlok', color: 'Beyaz', size: 'L', target_pph: 60 },
  { id: '3', wo: 'WO-1003', model: 'LACOSTE SWEAT', operation: 'Reçme', color: 'Siyah', size: 'S', target_pph: 35 },
]

function demoLookupOperator(rfid: string) {
  const cleaned = rfid.trim()
  if (!cleaned) return null
  if (cleaned === '000000001' || cleaned.toLowerCase() === 'ahmet') return { id: 'op-1', name: 'Ahmet' }
  if (cleaned === '000000002' || cleaned.toLowerCase() === 'lider') return { id: 'op-2', name: 'Lider' }
  return { id: 'op-x', name: `Operatör (${cleaned})` }
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

function formatHMS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
}

export default function KioskClient({ deviceId }: { deviceId: string }) {
  const [rfidBuffer, setRfidBuffer] = useState('')
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null)
  const [state, setState] = useState<SessionState>({ phase: 'idle' })
  const [tick, setTick] = useState(0)

  // Touch/Android gibi cihazlarda soft-keyboard açmamak için davranış ayrımı
  const [isTouch, setIsTouch] = useState(false)

  // Barcode scanner state
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  function stopScanner() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setScanOpen(false)
  }

  function loginWithCode(code: string) {
    const op = demoLookupOperator(code)
    setRfidBuffer('')
    if (!op) return
    setState({ phase: 'authenticated', operatorId: op.id, operatorName: op.name })
  }

  async function openScanner() {
    setScanError(null)
    setScanOpen(true)

    try {
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera erişimi desteklenmiyor.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('Video elementi bulunamadı.')
      video.srcObject = stream
      await video.play()

      const Detector = (window as any).BarcodeDetector
      if (!Detector) {
        throw new Error('BarcodeDetector desteklenmiyor. (Android Chrome güncel olmalı)')
      }

      const detector = new Detector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix'],
      })

      const loop = async () => {
        try {
          const barcodes = await detector.detect(video)
          if (barcodes?.length) {
            const raw = barcodes[0]?.rawValue?.trim()
            if (raw) {
              stopScanner()
              loginWithCode(raw)
              return
            }
          }
        } catch {
          // Bazı frame'lerde detect hata atabilir, sessiz geçiyoruz
        }
        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
    } catch (e: any) {
      setScanError(e?.message || 'Scanner açılamadı.')
    }
  }

  // Touch tespiti + hidden input focus davranışı
  useEffect(() => {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsTouch(touch)

    const focusHidden = () => {
      // Touch cihazlarda soft keyboard açmamak için otomatik focus yok
      if (touch) return
      hiddenInputRef.current?.focus()
    }

    // İlk açılışta (touch değilse) focusla
    focusHidden()

    const onPointerDown = (e: any) => {
      // Buton / input / select vs tıklanınca focus zorlamayalım
      const tag = (e.target?.tagName || '').toLowerCase()
      if (['button', 'input', 'textarea', 'select', 'a', 'label', 'video'].includes(tag)) return
      focusHidden()
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // Tick
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Unmount cleanup (kamera açıksa kapat)
  useEffect(() => {
    return () => stopScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runningInfo = useMemo(() => {
    if (state.phase === 'running' || state.phase === 'paused') {
      const now = Date.now()
      const elapsed = (state.phase === 'paused' ? state.pauseTs : now) - state.startTs
      const hours = elapsed / 3600000
      const pph = hours > 0 ? state.produced / hours : 0
      return { elapsed, pph }
    }
    return { elapsed: 0, pph: 0 }
  }, [state, tick])

  function resetToIdle() {
    stopScanner()
    setSelectedWO(null)
    setRfidBuffer('')
    setState({ phase: 'idle' })
  }

  function onRFIDEnter() {
    const op = demoLookupOperator(rfidBuffer)
    setRfidBuffer('')
    if (!op) return
    setState({ phase: 'authenticated', operatorId: op.id, operatorName: op.name })
  }

  function startWork() {
    if (!selectedWO) return
    if (state.phase !== 'authenticated') return
    setState({
      phase: 'running',
      operatorId: state.operatorId,
      operatorName: state.operatorName,
      wo: selectedWO,
      startTs: Date.now(),
      produced: 0,
    })
  }

  function pause(reason: DowntimeReason) {
    if (state.phase !== 'running') return
    setState({
      phase: 'paused',
      operatorId: state.operatorId,
      operatorName: state.operatorName,
      wo: state.wo,
      startTs: state.startTs,
      produced: state.produced,
      reason,
      pauseTs: Date.now(),
    })
  }

  function resume() {
    if (state.phase !== 'paused') return
    const pausedDuration = Date.now() - state.pauseTs
    setState({
      phase: 'running',
      operatorId: state.operatorId,
      operatorName: state.operatorName,
      wo: state.wo,
      startTs: state.startTs + pausedDuration,
      produced: state.produced,
    })
  }

  function addPiece() {
    if (state.phase === 'running') {
      setState({ ...state, produced: state.produced + 1 })
    }
  }

  function finishWork() {
    if (state.phase !== 'running' && state.phase !== 'paused') return
    const opName = state.operatorName
    const wo = state.wo
    const produced = state.produced
    const elapsedMs = (state.phase === 'paused' ? state.pauseTs : Date.now()) - state.startTs

    alert(
      `İŞ EMRİ BİTTİ\nOperatör: ${opName}\nWO: ${wo.wo}\nÜretilen: ${produced}\nSüre: ${formatHMS(elapsedMs)}\nPPH: ${Math.round(
        runningInfo.pph
      )}`
    )
    resetToIdle()
  }

  const canPickWO = state.phase === 'authenticated'
  const canStart = state.phase === 'authenticated' && !!selectedWO

  return (
    <div
      style={{
        padding: 28,
        fontFamily: 'system-ui',
        minHeight: '100vh',
        background: '#f6f7fb',
        color: '#111827',
      }}
    >
      {/* Scanner Modal */}
      {scanOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div style={{ background: 'white', borderRadius: 16, padding: 14, width: 'min(520px, 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>Barcode Okut</div>
              <button onClick={stopScanner} style={ghostBtn()}>
                Kapat
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 14, background: '#111827' }} />
            </div>

            {scanError && (
              <div style={{ marginTop: 10, color: '#b91c1c', fontWeight: 700 }}>
                {scanError}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>
              Kamerayı barkoda yaklaştır. Okuyunca otomatik giriş yapar.
            </div>
          </div>
        </div>
      )}

      {/* Klavye-emülatör RFID okuyucu için (touch olmayan cihazlarda) hidden input */}
      <input
        ref={hiddenInputRef}
        value={rfidBuffer}
        onChange={(e) => setRfidBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onRFIDEnter()
        }}
        placeholder="RFID okut..."
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 1, width: 1 }}
      />

      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* SOL */}
        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>1) Operatör</div>
            {state.phase !== 'idle' && (
              <button onClick={resetToIdle} style={ghostBtn()}>
                Çıkış
              </button>
            )}
          </div>

          {state.phase === 'idle' ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 16, color: '#374151' }}>
                {isTouch
                  ? 'Operatör barkodunu “Scan Barcode” ile okut.'
                  : 'RFID kartı okut. (Okuyucu klavye gibi yazıp Enter gönderir.)'}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                <input
                  value={rfidBuffer}
                  onChange={(e) => setRfidBuffer(e.target.value)}
                  onFocus={() => {
                    // Touch cihazlarda input'a tıklayınca da scanner açılsın
                    if (isTouch) openScanner()
                  }}
                  placeholder={isTouch ? 'Touch cihaz: Scan Barcode kullan' : 'Test için: 000000001 veya ahmet'}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                    background: 'white',
                    color: '#111827',
                  }}
                />

                {/* Giriş: Touch cihazda scanner aç, diğerinde mevcut enter/login */}
                <button
                  onClick={() => {
                    if (isTouch) openScanner()
                    else onRFIDEnter()
                  }}
                  style={solidBtn('#111827')}
                >
                  Giriş
                </button>
              </div>

              {/* Giriş butonunun ALTINA Scan Barcode */}
              <div style={{ marginTop: 10 }}>
                <button onClick={openScanner} style={solidBtn('#2563eb', true)}>
                  📷 Scan Barcode
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 18 }}>
              Operatör: <b>{state.operatorName}</b>
            </div>
          )}

          <div style={{ marginTop: 18, fontSize: 18, fontWeight: 800 }}>2) İş Emri Seç</div>

          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {demoWorkOrders.map((wo) => {
              const selected = selectedWO?.id === wo.id
              return (
                <button
                  key={wo.id}
                  disabled={!canPickWO}
                  onClick={() => setSelectedWO(wo)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 14,
                    border: selected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: !canPickWO ? '#f3f4f6' : 'white',
                    color: '#111827',
                    cursor: !canPickWO ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {wo.wo} — {wo.model}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, color: '#374151' }}>
                    {wo.operation} • {wo.color} • {wo.size} • hedef {wo.target_pph} parça/saat
                  </div>
                </button>
              )
            })}
          </div>

          <button onClick={startWork} disabled={!canStart} style={solidBtn(canStart ? '#16a34a' : '#9ca3af', true)}>
            ▶️ Başlat
          </button>
        </div>

        {/* SAĞ */}
        <div style={cardStyle()}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>3) Üretim / Durum</div>

          {state.phase === 'running' || state.phase === 'paused' ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 16, color: '#374151' }}>
                Aktif WO: <b style={{ color: '#111827' }}>{state.wo.wo}</b> — {state.wo.model} / {state.wo.operation} / {state.wo.color} /{' '}
                {state.wo.size}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Stat label="Süre" value={formatHMS(runningInfo.elapsed)} />
                <Stat label="Üretilen" value={`${state.produced}`} />
                <Stat label="PPH" value={`${Math.round(runningInfo.pph)}`} />
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={addPiece} disabled={state.phase !== 'running'} style={btnStyle(state.phase === 'running' ? '#111827' : '#9ca3af')}>
                  ➕ Parça (+1)
                </button>

                {state.phase === 'paused' ? (
                  <button onClick={resume} style={btnStyle('#2563eb')}>
                    ▶️ Devam
                  </button>
                ) : (
                  <button onClick={() => pause('break')} style={btnStyle('#f59e0b')}>
                    ⏸ Mola
                  </button>
                )}

                <button
                  onClick={() => pause('fault')}
                  disabled={state.phase !== 'running'}
                  style={btnStyle(state.phase === 'running' ? '#ef4444' : '#9ca3af')}
                >
                  ⚠️ Arıza
                </button>

                <button onClick={finishWork} style={btnStyle('#16a34a')}>
                  ⏹ İş Emri Bitir
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 16, color: '#374151' }}>Başlatınca burada üretim butonları açılacak.</div>
          )}

          <div style={{ marginTop: 18, fontSize: 18, fontWeight: 800 }}>4) Günlük (Demo)</div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Stat label="Bugün Toplam" value="0" />
            <Stat label="Mola" value="0 dk" />
            <Stat label="Arıza" value="0 dk" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: '#374151' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#111827' }}>{value}</div>
    </div>
  )
}

function cardStyle() {
  return {
    background: 'white',
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
  } as const
}

function ghostBtn() {
  return {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  } as const
}

function solidBtn(bg: string, fullWidth = false) {
  return {
    marginTop: 14,
    width: fullWidth ? '100%' : undefined,
    padding: '14px 16px',
    borderRadius: 12,
    border: 0,
    background: bg,
    color: 'white',
    fontSize: 16,
    fontWeight: 800,
    cursor: bg === '#9ca3af' ? 'not-allowed' : 'pointer',
  } as const
}

function btnStyle(bg: string) {
  return {
    padding: 16,
    borderRadius: 14,
    border: 0,
    background: bg,
    color: 'white',
    fontSize: 18,
    fontWeight: 900,
    cursor: bg === '#9ca3af' ? 'not-allowed' : 'pointer',
  } as const
}
