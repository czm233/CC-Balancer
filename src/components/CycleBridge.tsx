import type { TimeSlot } from '../utils/time'
import { formatMinutes } from '../utils/time'

interface CycleBridgeProps {
  /** 跨越 AM/PM 边界的 Token 周期 */
  bridgeCycles: TimeSlot[]
}

/** Token 周期颜色 */
const BRIDGE_COLORS = ['#10B981', '#34D399']

/**
 * 在两个时钟之间显示跨周期连接指示
 * 当某个 5h Token 周期跨越 12:00 边界时，用箭头线连接两个时钟
 */
export default function CycleBridge({ bridgeCycles }: CycleBridgeProps) {
  // 过滤出真正跨越 12:00 的周期（start < 720 && end > 720）
  const crossingCycles = bridgeCycles.filter((c) => {
    if (c.start < c.end) {
      return c.start < 720 && c.end > 720
    }
    return false
  })

  if (crossingCycles.length === 0) {
    return <div className="w-12 flex-shrink-0" />
  }

  return (
    <div className="flex flex-col items-center justify-center w-12 flex-shrink-0 gap-2">
      {crossingCycles.map((cycle, idx) => (
        <div key={cycle.id} className="flex flex-col items-center">
          {/* 连接箭头 */}
          <svg width={40} height={32} viewBox="0 0 40 32">
            <defs>
              <marker
                id={`arrow-${idx}`}
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6" fill={BRIDGE_COLORS[idx % 2]} opacity={0.6} />
              </marker>
            </defs>
            {/* 从左时钟到右时钟的连接线 */}
            <line
              x1={2}
              y1={16}
              x2={34}
              y2={16}
              stroke={BRIDGE_COLORS[idx % 2]}
              strokeWidth={2}
              strokeDasharray="3 2"
              opacity={0.5}
              markerEnd={`url(#arrow-${idx})`}
            />
          </svg>
          {/* 周期时间标签 */}
          <span className="text-[9px] text-emerald-500/60 leading-tight whitespace-nowrap">
            {formatMinutes(cycle.start)}-{formatMinutes(cycle.end)}
          </span>
        </div>
      ))}
    </div>
  )
}
