// app/kiosk2/page.tsx
import Image from "next/image";
import KioskClient from "./KioskClient";

export default async function Kiosk2Page({
  searchParams,
}: {
  searchParams: Promise<{ device_id?: string }>;
}) {
  const sp = await searchParams;
  const deviceId = sp.device_id || "DVN-0001";

  return (
    <div style={{ padding: 28, fontFamily: "system-ui", minHeight: "100vh", background: "#f6f7fb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Image src="/eren-logo.png" alt="Eren Logo" width={120} height={40} priority />
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>MESAI Kiosk (v2)</h1>
          </div>
          <div style={{ marginTop: 0, opacity: 1, color: '#111827' }}>
            Device ID: <b>{deviceId}</b>
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#111827' }}>
          <div style={{ fontSize: 14, opacity: 1 }}>Durum</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>RFID Bekleniyor</div>
        </div>
      </div>

      <KioskClient deviceId={deviceId} />
    </div>
  );
}
