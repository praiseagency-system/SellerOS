import { Settings2 } from 'lucide-react'

export default function Settings({ settings, onChange }) {
  function update(key, value) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 w-72 flex-shrink-0">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 className="w-4 h-4 text-ink-muted" />
        <h3 className="font-semibold text-gray-800 text-sm">Pengaturan Benchmark</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink-faint mb-1.5">
            Periode Data
          </label>
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => update('periodDays', d)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  settings.periodDays === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-ink-faint hover:bg-gray-200'
                }`}
              >
                {d}h
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-faint mb-1.5">
            Batas Traffic (Pengunjung)
          </label>
          <input
            type="number"
            value={settings.trafficThreshold}
            onChange={e => update('trafficThreshold', Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
            step={100}
          />
          <p className="text-xs text-ink-muted mt-1">
            per {settings.periodDays} hari · ≥ nilai ini = "High Traffic"
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-faint mb-1.5">
            Batas Konversi (%)
          </label>
          <input
            type="number"
            value={settings.conversionThreshold}
            onChange={e => update('conversionThreshold', Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
            step={0.1}
          />
          <p className="text-xs text-ink-muted mt-1">
            ≥ nilai ini = "High Conversion"
          </p>
        </div>

        <div className="pt-1 border-t border-gray-100">
          <p className="text-xs text-ink-muted leading-relaxed">
            <span className="font-medium text-ink-muted">Panduan:</span> Produk harga &lt;30rb → 2–3%, 30–100rb → 1.5%, &gt;100rb → 0.5–1%
          </p>
        </div>
      </div>
    </div>
  )
}
