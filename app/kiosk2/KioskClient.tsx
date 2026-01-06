'use client'

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";


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
  | { phase: 'paused'; operatorId: string; operatorName: string; wo: WorkOrder; startTs: number; produced: number; reason: DowntimeReason; pauseTs: number }

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

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const focus = () => hiddenInputRef.current?.focus()
    focus()
    window.addEventListener('click', focus)
    return () => window.removeEventListener('click', focus)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
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
      `İŞ EMRİ BİTTİ\nOperatör: ${opName}\nWO: ${wo.wo}\nÜretilen: ${produced}\nSüre: ${formatHMS(elapsedMs)}\nPPH: ${Math.round(runningInfo.pph)}`
    )

    resetToIdle()
  }

  return (
    <div style={{ padding: 28, fontFamily: 'system-ui', minHeight: '100vh', background: '#f6f7fb' }}>
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
        <div style={{ background: 'white', borderRadius: 16, padding: 18, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>1) Operatör</div>
            {state.phase !== 'idle' && (
              <button onClick={resetToIdle} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #ddd', background: 'white' }}>
                Çıkış
              </button>
            )}
          </div>

          {state.phase === 'idle' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 16, opacity: 0.8 }}>RFID kartı okut. (Okuyucu klavye gibi yazıp Enter gönderir.)</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                <input
                  value={rfidBuffer}
                  onChange={(e) => setRfidBuffer(e.target.value)}
                  placeholder="Test için: 000000001 veya ahmet"
                  style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #ddd', fontSize: 16 }}
                />
                <button
                  onClick={onRFIDEnter}
                  style={{ padding: '14px 16px', borderRadius: 12, border: 0, background: '#111827', color: 'white', fontSize: 16, fontWeight: 700 }}
                >
                  Giriş
                </button>
              </div>
            </div>
          )}

          {state.phase !== 'idle' && <div style={{ marginTop: 12, fontSize: 18 }}>Operatör: <b>{state.operatorName}</b></div>}

          <div style={{ marginTop: 18, fontSize: 18, fontWeight: 800 }}>2) İş Emri Seç</div>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {demoWorkOrders.map((wo) => {
              const selected = selectedWO?.id === wo.id
              const disabled = state.phase !== 'authenticated'
              return (
                <button
                  key={wo.id}
                  disabled={disabled}
                  onClick={() => setSelectedWO(wo)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 14,
                    border: selected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: disabled ? '#f3f4f6' : 'white',
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{wo.wo} — {wo.model}</div>
                  <div style={{ opacity: 0.85, marginTop: 4, fontSize: 14 }}>
                    {wo.operation} • {wo.color} • {wo.size} • hedef {wo.target_pph} parça/saat
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={startWork}
            disabled={!(state.phase === 'authenticated' && selectedWO)}
            style={{
              marginTop: 14,
              width: '100%',
              padding: 16,
              borderRadius: 14,
              border: 0,
              background: state.phase === 'authenticated' && selectedWO ? '#16a34a' : '#9ca3af',
              color: 'white',
              fontSize: 18,
              fontWeight: 900,
            }}
          >
            ▶️ Başlat
          </button>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 18, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>3) Üretim / Durum</div>

          {(state.phase === 'running' || state.phase === 'paused') ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 16, opacity: 0.85 }}>
                Aktif WO: <b>{state.wo.wo}</b> — {state.wo.model} / {state.wo.operation} / {state.wo.color} / {state.wo.size}
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
                  <button onClick={resume} style={btnStyle('#2563eb')}>▶️ Devam</button>
                ) : (
                  <button onClick={() => pause('break')} style={btnStyle('#f59e0b')}>⏸ Mola</button>
                )}

                <button onClick={() => pause('fault')} disabled={state.phase !== 'running'} style={btnStyle(state.phase === 'running' ? '#ef4444' : '#9ca3af')}>
                  ⚠️ Arıza
                </button>

                <button onClick={finishWork} style={btnStyle('#16a34a')}>
                  ⏹ İş Emri Bitir
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12, opacity: 0.75, fontSize: 16 }}>Başlatınca burada üretim butonları açılacak.</div>
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
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  )
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
  } as const
}
