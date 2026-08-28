// Tabel video GMV Max — dipakai Video Overview & Video Check. Kolom standar +
// opsi kolom Aksi (teks rekomendasi), kolom EKSEKUSI (Boost/Exclude nyata, lewat
// prop `exec` — sengaja opt-in supaya modal Creator tetap murni baca), & Catatan.
import { StickyNote } from 'lucide-react'
import { RoasBadge, StatusBadge, DeliveryBadge, VideoLabel, VideoIdLink, fmtRp, useSortableRows, SortTh } from './ui'
import { TableScroll, usePaged, Pager } from '../ui/DataTable'
import { STATUS_META } from '../../utils/gmvmaxClassify'
import { VideoExecCell } from './VideoExecActions'

const VIDEO_SORT = {
  cost: (v) => v.lifetime.cost,
  revenue: (v) => v.lifetime.revenue,
  roas: (v) => v.lifetime.roas,
  orders: (v) => v.lifetime.orders,
}

const ACTION_TEXT = {
  scale: 'Scale Budget — naikkan anggaran',
  active: 'Pertahankan',
  watch: 'Pantau / refresh kreatif',
  kill: 'Exclude — matikan iklan',
  inactive: '—',
}

export default function VideoTable({ videos, thresholds, notes = {}, onNote, productNames = {}, showAction = false, showHook = false, showStatus = true, showDelivery = false, showCampaign = false, showProduct = false, exec = null }) {
  const { sorted, sort, toggle } = useSortableRows(videos, VIDEO_SORT)
  // Urut dulu atas SELURUH video, baru dipotong per halaman — supaya
  // "ROAS tertinggi" tetap tertinggi dari semua baris, bukan dari yang tampil.
  const pg = usePaged(sorted)
  if (!videos.length) return <p className="text-sm text-ink-faint py-10 text-center">Tidak ada video yang cocok.</p>
  return (
    <div>
      <TableScroll stickyFirst>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-faint border-b border-line/10">
            <th className="py-2.5 pr-3 font-medium">VIDEO</th>
            <th className="py-2.5 px-3 font-medium">VIDEO ID</th>
            {showDelivery && <th className="py-2.5 px-3 font-medium">STATUS</th>}
            {showStatus && <th className="py-2.5 px-3 font-medium">TIER</th>}
            {showCampaign && <th className="py-2.5 px-3 font-medium">KAMPANYE</th>}
            {showProduct && <th className="py-2.5 px-3 font-medium">PRODUK</th>}
            {showHook && <th className="py-2.5 px-3 font-medium">HOOK</th>}
            <SortTh label="COST" sortKey="cost" sort={sort} onSort={toggle} />
            <SortTh label="REVENUE" sortKey="revenue" sort={sort} onSort={toggle} />
            <SortTh label="ROAS" sortKey="roas" sort={sort} onSort={toggle} />
            <SortTh label="ORDERS" sortKey="orders" sort={sort} onSort={toggle} />
            {showAction && <th className="py-2.5 px-3 font-medium">AKSI</th>}
            {exec && <th className="py-2.5 px-3 font-medium text-right">EKSEKUSI</th>}
            <th className="py-2.5 pl-3 font-medium text-center">CATATAN</th>
          </tr>
        </thead>
        <tbody>
          {pg.paged.map(v => {
            const note = notes[v.videoId]
            return (
              <tr key={v.videoId} className="border-b border-line/5 hover:bg-fill/5">
                <td className="py-2.5 pr-3 max-w-xs"><VideoLabel title={v.title} account={v.account} videoId={v.videoId} compact /></td>
                <td className="py-2.5 px-3"><VideoIdLink videoId={v.videoId} account={v.account} /></td>
                {showDelivery && <td className="py-2.5 px-3"><DeliveryBadge delivery={v.delivery} /></td>}
                {showStatus && <td className="py-2.5 px-3"><StatusBadge status={v.status} /></td>}
                {showCampaign && (
                  <td className="py-2.5 px-3 text-ink-muted max-w-[10rem]">
                    <span className="block truncate" title={v.campaign || ''}>{v.campaign || '—'}</span>
                  </td>
                )}
                {showProduct && (
                  <td className="py-2.5 px-3 text-ink-muted max-w-[12rem]">
                    {v.productId
                      ? <span className="block truncate" title={(productNames[v.productId] || '') + ' · ' + v.productId}>
                          {productNames[v.productId] || <span className="font-mono text-xs">{v.productId}</span>}
                        </span>
                      : '—'}
                  </td>
                )}
                {showHook && <td className="py-2.5 px-3 text-ink-muted capitalize">{v.hook}</td>}
                <td className="py-2.5 px-3 text-right text-ink-muted whitespace-nowrap">{fmtRp(v.lifetime.cost)}</td>
                <td className="py-2.5 px-3 text-right text-ink whitespace-nowrap">{fmtRp(v.lifetime.revenue)}</td>
                <td className="py-2.5 px-3 text-right"><RoasBadge roas={v.lifetime.roas} thresholds={thresholds} showLabel={false} /></td>
                <td className="py-2.5 px-3 text-right text-ink-muted">{v.lifetime.orders || 0}</td>
                {showAction && (
                  <td className="py-2.5 px-3">
                    <span className={`text-xs ${v.status === 'kill' ? 'text-red-500' : v.status === 'scale' ? 'text-emerald-500' : 'text-ink-muted'}`}>
                      {ACTION_TEXT[v.status] || STATUS_META[v.status]?.label}
                    </span>
                  </td>
                )}
                {exec && (
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <VideoExecCell video={v} resolve={exec.resolve} onBoost={exec.onBoost} onExclude={exec.onExclude}
                      anchorOf={exec.anchorOf} productName={exec.productName} />
                  </td>
                )}
                <td className="py-2.5 pl-3 text-center">
                  <button onClick={() => onNote?.(v)}
                    className={`inline-flex ${note ? 'text-accent' : 'text-ink-faint hover:text-ink'}`}
                    title={note?.body || 'Tambah catatan'}>
                    <StickyNote className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </TableScroll>
      <Pager {...pg} unit="video" />
    </div>
  )
}
