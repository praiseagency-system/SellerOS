// Status run shadow. PARTIAL TIDAK PERNAH diperlakukan sebagai SUCCESS.
export const STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
})

// Status batch (banyak unit advertiser×date) dari status per-unit.
// LOCKED (di-skip karena run konkuren) TIDAK dihitung sebagai sukses → batch PARTIAL
// bila ada unit yang tak SUCCESS.
export function batchStatus(unitStatuses) {
  const s = unitStatuses.filter(Boolean)
  if (!s.length) return STATUS.FAILED
  if (s.every(x => x === STATUS.SUCCESS)) return STATUS.SUCCESS
  if (s.every(x => x === STATUS.AUTH_REQUIRED)) return STATUS.AUTH_REQUIRED
  if (s.every(x => x === STATUS.FAILED || x === STATUS.AUTH_REQUIRED)) return STATUS.FAILED
  return STATUS.PARTIAL // campuran sukses & non-sukses
}

// Exit code: 0 HANYA bila SUCCESS. PARTIAL/FAILED/AUTH_REQUIRED → non-zero.
export function exitCodeFor(status) {
  return status === STATUS.SUCCESS ? 0 : (status === STATUS.PARTIAL ? 3 : status === STATUS.AUTH_REQUIRED ? 4 : 1)
}
export const isSuccess = (s) => s === STATUS.SUCCESS
