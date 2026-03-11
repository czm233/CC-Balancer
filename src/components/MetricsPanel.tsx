interface MetricsPanelProps {
  /** 覆盖率百分比 */
  coverage: number
  /** 利用率百分比 */
  utilization: number
  /** 空转时长（小时） */
  idleHours: number
  /** 有效时长（小时）：所有周期与忙时重合的总和 */
  effectiveHours: number
  /** 工作时段内等待时长（小时）：Token 耗尽后仍在忙时中等待刷新 */
  deadZoneHours: number
}

export default function MetricsPanel({ coverage, utilization, idleHours, effectiveHours, deadZoneHours }: MetricsPanelProps) {
  return (
    <div className="flex justify-center gap-6 py-4 flex-wrap">
      <MetricCard
        label="覆盖率"
        value={`${coverage}%`}
        desc="忙时被 Token 覆盖"
        color={coverage >= 80 ? '#10B981' : coverage >= 50 ? '#F59E0B' : '#EF4444'}
      />
      <MetricCard
        label="利用率"
        value={`${utilization}%`}
        desc="Token 期间在工作"
        color={utilization >= 60 ? '#10B981' : utilization >= 30 ? '#F59E0B' : '#EF4444'}
      />
      <MetricCard
        label="空转时长"
        value={`${idleHours}h`}
        desc="Token 生效但未工作"
        color={idleHours <= 5 ? '#10B981' : idleHours <= 10 ? '#F59E0B' : '#EF4444'}
      />
      <MetricCard
        label="有效时长"
        value={`${effectiveHours}h`}
        desc="周期与忙时重合总计"
        color={effectiveHours >= 6 ? '#10B981' : effectiveHours >= 3 ? '#F59E0B' : '#EF4444'}
      />
      <MetricCard
        label="干等时长"
        value={`${deadZoneHours}h`}
        desc="忙时中无 Token 可用"
        color={deadZoneHours === 0 ? '#10B981' : deadZoneHours <= 1 ? '#F59E0B' : '#EF4444'}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  desc,
  color,
}: {
  label: string
  value: string
  desc: string
  color: string
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl px-6 py-4 min-w-[160px] text-center border border-slate-700/50">
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className="text-3xl font-bold font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </div>
  )
}
