import { formatMinutes } from '../utils/time'
import { CYCLE_COLORS } from '../utils/colors'
import type { CycleDetail } from '../utils/time'

interface CycleDetailsPanelProps {
  details: CycleDetail[]
}

export default function CycleDetailsPanel({ details }: CycleDetailsPanelProps) {
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">周期效率详情</h3>
      <div className="flex flex-col gap-2">
        {details.map((d) => {
          const color = CYCLE_COLORS[d.index % CYCLE_COLORS.length]
          const overlapH = +(d.overlapMinutes / 60).toFixed(1)
          const durationH = +(d.duration / 60).toFixed(1)
          const ratio = d.duration > 0 ? d.overlapMinutes / d.duration : 0
          const pct = Math.round(ratio * 100)

          return (
            <div
              key={d.index}
              className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-2.5 border border-slate-700/40"
            >
              {/* 周期色标 */}
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* 时间范围 */}
              <span className="text-sm text-slate-300 font-mono w-[120px] shrink-0">
                {formatMinutes(d.start)} - {formatMinutes(d.end)}
              </span>

              {/* 进度条 */}
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>

              {/* 重合时长 */}
              <span className="text-sm font-mono shrink-0" style={{ color }}>
                {overlapH}h
              </span>
              <span className="text-xs text-slate-500 shrink-0">
                / {durationH}h
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
