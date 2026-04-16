import { FileText, Users, MessageCircle, Instagram, Film } from 'lucide-react'

export const CHANNELS = [
  { key: 'blog',      label: '네이버 블로그', shortLabel: '블로그',  Icon: FileText,      color: 'text-emerald-500', bg: 'bg-emerald-50',  border: 'border-emerald-500/30', accent: 'emerald' },
  { key: 'band',      label: '네이버 밴드',   shortLabel: '밴드',    Icon: Users,         color: 'text-green-600',   bg: 'bg-green-50',    border: 'border-green-600/30',   accent: 'green' },
  { key: 'kakao',     label: '카카오톡',      shortLabel: '카톡',    Icon: MessageCircle, color: 'text-yellow-500',  bg: 'bg-yellow-50',   border: 'border-yellow-500/30',  accent: 'yellow' },
  { key: 'instagram', label: '인스타그램',    shortLabel: '인스타',  Icon: Instagram,     color: 'text-pink-500',    bg: 'bg-pink-50',     border: 'border-pink-500/30',    accent: 'pink' },
  { key: 'shorts',    label: '유튜브 숏츠',   shortLabel: '숏츠',    Icon: Film,          color: 'text-red-500',     bg: 'bg-red-50',      border: 'border-red-500/30',     accent: 'red' },
]

export const CHANNEL_KEYS = CHANNELS.map(c => c.key)
export const getChannel = (key) => CHANNELS.find(c => c.key === key)
