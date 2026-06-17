import { ShoppingBag, Music } from 'lucide-react'

export function PlatformIcon({ id, className = 'w-4 h-4' }) {
  if (id === 'shopee') return <ShoppingBag className={className} />
  if (id === 'tiktok') return <Music className={className} />
  return null
}
