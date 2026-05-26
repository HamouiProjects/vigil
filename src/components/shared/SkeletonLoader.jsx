import { memo } from 'react'

export const SkeletonLine = memo(function SkeletonLine({ w = '100%', h = 11 }) {
  return <div className="skel-line" style={{ width: w, height: h }} />
})

export function SkeletonFeedItems({ count = 6 }) {
  return (
    <div style={{ width: '100%' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-item">
          <SkeletonLine w={`${58 + (i % 3) * 12}%`} h={10} />
          <SkeletonLine w="28%" h={8} />
        </div>
      ))}
    </div>
  )
}
