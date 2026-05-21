// avatar group 기반 룩 랜덤 선택.
// 등록 아바타(heygenAvatars.js)에 avatarGroupId 가 있으면, 영상 생성 때마다
// 그 그룹 안의 9:16 세로 룩 중 하나를 랜덤으로 골라 쓴다.
// HeyGen 그룹에 룩을 추가하면 코드 수정 없이 자동으로 풀에 포함된다.

import { findHeygenAvatarByAvatarId } from './heygenAvatars'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''

// avatarId 가 avatar group 을 가진 등록 아바타면 그룹 안 룩 중 랜덤 1개(9:16 우선)를 반환.
// 그 외(스톡 아바타·사용자 업로드 등)에는 입력 avatarId 를 그대로 돌려준다.
// 실패 시에도 입력 avatarId 를 폴백으로 반환해 영상 생성이 끊기지 않게 한다.
export async function resolveAvatarGroupLook(avatarId) {
  if (!avatarId) return avatarId
  const entry = findHeygenAvatarByAvatarId(avatarId)
  if (!entry?.avatarGroupId) return avatarId

  try {
    const res = await fetch(`${API_BASE}/api/heygen/avatar-group/${entry.avatarGroupId}/looks`)
    if (!res.ok) return avatarId
    const data = await res.json()
    const looks = Array.isArray(data?.looks) ? data.looks.filter((l) => l?.id) : []
    if (!looks.length) return avatarId
    // 9:16 세로 룩만 추림. 세로 룩이 하나도 없으면 전체에서 고른다.
    const portrait = looks.filter((l) => l.portrait)
    const pool = portrait.length ? portrait : looks
    const picked = pool[Math.floor(Math.random() * pool.length)]
    return picked?.id || avatarId
  } catch {
    return avatarId
  }
}
