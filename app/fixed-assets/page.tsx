export default function FixedAssetsPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Fixed Assets</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 24 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Total Asset Cost</strong>
          <div style={{ marginTop: 8, fontSize: 28 }}>0</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Accumulated Depreciation</strong>
          <div style={{ marginTop: 8, fontSize: 28 }}>0</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Net Book Value</strong>
          <div style={{ marginTop: 8, fontSize: 28 }}>0</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <strong>Monthly Depreciation</strong>
          <div style={{ marginTop: 8, fontSize: 28 }}>0</div>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <h2>Module status</h2>
        <ul>
          <li>Schema initialized via the voucher-driven accounting model</li>
          <li>Asset and category API routes are available under /api/fixed-assets</li>
          <li>Depreciation, transfer, improvement and disposal flows can be added next as the accounting subledger layer</li>
        </ul>
      </section>
    </main>
  )
}
