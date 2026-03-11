import { useState, useMemo } from 'react'
import ClockFace from './components/ClockFace'
import StartTimeSlider from './components/StartTimeSlider'
import MetricsPanel from './components/MetricsPanel'
import CycleDetailsPanel from './components/CycleDetailsPanel'
import TimeSlotManager from './components/TimeSlotManager'
import CycleStartManager from './components/CycleStartManager'
import CycleBridge from './components/CycleBridge'
import { generateCycles, generateCustomCycles, calculateMetrics, calculateCycleDetails, calculateDeadZone, genId } from './utils/time'
import type { TimeSlot } from './utils/time'

type ScheduleMode = 'continuous' | 'custom'

/** 默认忙时：9:00-12:00, 13:30-18:00 */
const DEFAULT_BUSY: TimeSlot[] = [
  { id: genId(), start: 540, end: 720 },
  { id: genId(), start: 810, end: 1080 },
]

function App() {
  // 调度模式
  const [mode, setMode] = useState<ScheduleMode>('continuous')
  // 连续模式：激活起始时间（分钟，默认 5:45）
  const [activateTime, setActivateTime] = useState(345)
  // 自定义模式：多个周期起始时间
  const [customStarts, setCustomStarts] = useState<number[]>([540, 960]) // 默认 9:00, 16:00
  // 忙时区间
  const [busySlots, setBusySlots] = useState<TimeSlot[]>(DEFAULT_BUSY)
  // 预计每个周期的耗尽时长（分钟，默认 2h）
  const [burnMinutes, setBurnMinutes] = useState(120)

  // 根据模式生成周期
  const cycles = useMemo(() => {
    if (mode === 'continuous') {
      return generateCycles(activateTime)
    }
    return generateCustomCycles(customStarts)
  }, [mode, activateTime, customStarts])

  // 计算策略指标
  const metrics = useMemo(
    () => calculateMetrics(busySlots, cycles),
    [busySlots, cycles],
  )

  // 计算每个周期与忙时的重合详情
  const cycleDetails = useMemo(
    () => calculateCycleDetails(cycles, busySlots),
    [cycles, busySlots],
  )

  // 有效时长：所有周期与忙时重合的总和
  const effectiveHours = useMemo(
    () => +(cycleDetails.reduce((sum, d) => sum + d.overlapMinutes, 0) / 60).toFixed(1),
    [cycleDetails],
  )

  // 工作时段内等待时长：Token 耗尽后仍在忙时中等待刷新
  const deadZoneHours = useMemo(
    () => +(calculateDeadZone(cycles, busySlots, burnMinutes) / 60).toFixed(1),
    [cycles, busySlots, burnMinutes],
  )

  // 找出跨 AM/PM 边界（12:00）的周期，用于绘制连接线
  const bridgeCycles = useMemo(() => {
    return cycles.filter((c) => {
      if (c.start < c.end) {
        return c.start < 720 && c.end > 720
      }
      return true
    })
  }, [cycles])

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200">
      {/* 标题 */}
      <header className="text-center pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-wide">
          <span className="text-emerald-400">CC-Balancer</span>
          <span className="text-slate-400 mx-2">·</span>
          <span className="text-slate-300">策略规划器</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Claude Code 5h Token 周期智能规划 — 找到最优激活时间
        </p>
      </header>

      {/* 模式切换 */}
      <div className="flex justify-center gap-2 py-3">
        <button
          onClick={() => setMode('continuous')}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
            mode === 'continuous'
              ? 'bg-emerald-600/80 border-emerald-500/60 text-white'
              : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200'
          }`}
        >
          连续模式
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
            mode === 'custom'
              ? 'bg-emerald-600/80 border-emerald-500/60 text-white'
              : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200'
          }`}
        >
          自定义模式
        </button>
      </div>
      <p className="text-center text-xs text-slate-500 mb-2">
        {mode === 'continuous'
          ? '周期首尾相连填满 24h，通过调整起始时间优化覆盖'
          : '自由放置周期，闲时跳过不浪费 Token，最大化有效时长'}
      </p>

      {/* 双时钟区域 + 跨周期连接 */}
      <div className="flex justify-center items-center gap-2 py-6 flex-wrap">
        <ClockFace
          period="am"
          busySlots={busySlots}
          cycles={cycles}
          onBusySlotsChange={setBusySlots}
        />
        <CycleBridge bridgeCycles={bridgeCycles} />
        <ClockFace
          period="pm"
          busySlots={busySlots}
          cycles={cycles}
          onBusySlotsChange={setBusySlots}
        />
      </div>

      {/* 分隔线 */}
      <div className="max-w-2xl mx-auto border-t border-slate-700/50" />

      {/* 调度控制：根据模式不同显示不同组件 */}
      {mode === 'continuous' ? (
        <StartTimeSlider value={activateTime} onChange={setActivateTime} />
      ) : (
        <CycleStartManager startTimes={customStarts} onChange={setCustomStarts} />
      )}

      {/* 分隔线 */}
      <div className="max-w-2xl mx-auto border-t border-slate-700/50" />

      {/* 消耗速度设置 */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-slate-400 whitespace-nowrap">我的耗尽速度</span>
        <input
          type="range"
          min={60}
          max={300}
          step={15}
          value={burnMinutes}
          onChange={(e) => setBurnMinutes(Number(e.target.value))}
          className="flex-1 cursor-pointer"
        />
        <span className="text-sm font-mono text-emerald-400 w-8 text-right">
          {burnMinutes >= 300 ? '5h' : `${+(burnMinutes / 60).toFixed(1)}h`}
        </span>
        <span className="text-xs text-slate-500 whitespace-nowrap">/ 周期</span>
      </div>

      {/* 策略指标 */}
      <MetricsPanel
        coverage={metrics.coverage}
        utilization={metrics.utilization}
        idleHours={metrics.idleHours}
        effectiveHours={effectiveHours}
        deadZoneHours={deadZoneHours}
      />

      {/* 分隔线 */}
      <div className="max-w-2xl mx-auto border-t border-slate-700/50" />

      {/* 周期效率详情 */}
      <CycleDetailsPanel details={cycleDetails} />

      {/* 分隔线 */}
      <div className="max-w-2xl mx-auto border-t border-slate-700/50" />

      {/* 忙时区间管理 */}
      <TimeSlotManager slots={busySlots} onChange={setBusySlots} />

      {/* 底部说明 */}
      <footer className="text-center text-xs text-slate-600 py-6">
        {mode === 'continuous'
          ? '拖动滑块调整激活时间 · 在时钟内圈拖拽创建忙时区间 · 观察 Token 周期如何覆盖你的工作时段'
          : '添加周期起点 · 闲时留空不浪费 · 在时钟内圈拖拽创建忙时区间'}
      </footer>
    </div>
  )
}

export default App
