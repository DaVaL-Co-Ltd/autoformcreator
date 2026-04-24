import { FileText, Mail, Instagram, Film } from 'lucide-react'

export const CHANNELS = [
  { key: 'blog', label: '네이버 블로그', shortLabel: '블로그', Icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-500/30', accent: 'emerald' },
  { key: 'newsletter', label: '뉴스레터', shortLabel: '뉴스레터', Icon: Mail, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-500/30', accent: 'blue' },
  { key: 'instagram', label: '인스타그램', shortLabel: '인스타', Icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-500/30', accent: 'pink' },
  { key: 'shorts', label: '유튜브 쇼츠', shortLabel: '쇼츠', Icon: Film, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-500/30', accent: 'red' },
]

export const CHANNEL_KEYS = CHANNELS.map((c) => c.key)
export const getChannel = (key) => CHANNELS.find((c) => c.key === key)
