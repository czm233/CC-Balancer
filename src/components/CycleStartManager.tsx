import { useCallback, useState, useRef, useEffect } from 'react'
import { formatMinutes, isCycleOverlapping } from '../utils/time'
import { CYCLE_COLORS } from '../utils/colors'

interface CycleStartManagerProps {
  /** 周期起始时间列表（分钟） */
  startTimes: number[]
  /** 变更回调 */
  onChange: (times: number[]) => void
}

interface GroupDragState {
  startClientX: number
  /** 拖拽开始时各周期的初始时间（按原始 index 存） */
  initialTimes: number[]
}

const TRACK_MAX = 1425
const CYCLE_DURATION = 300
/** 判定为"点在滑块上"的像素容差 */
const THUMB_HIT_RADIUS = 14

export default function CycleStartManager({ startTimes, onChange }: CycleStartManagerProps) {
  const [groupDrag, setGroupDrag] = useState<GroupDragState | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // 用 ref 避免 useEffect 闭包捕获过期 state
  const startTimesRef = useRef(startTimes)
  const onChangeRef = useRef(onChange)
  useEffect(() => { startTimesRef.current = startTimes }, [startTimes])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // 按时间排序，保留原始 index
  const indexed = startTimes.map((t, i) => ({ time: t, origIdx: i }))
  indexed.sort((a, b) => a.time - b.time)

  // 拖动某个周期的滑块
  const handleSlide = useCallback((index: number, newValue: number) => {
    const snapped = Math.round(newValue / 15) * 15
    const others = startTimes.filter((_, i) => i !== index)
    if (isCycleOverlapping(snapped, others)) return
    const next = [...startTimes]
    next[index] = snapped
    onChange(next)
  }, [startTimes, onChange])

  // 删除周期
  const removeCycle = useCallback((index: number) => {
    onChange(startTimes.filter((_, i) => i !== index))
  }, [startTimes, onChange])

  // 添加新周期
  const addCycle = useCallback(() => {
    for (let m = 0; m < 1440; m += 15) {
      if (!isCycleOverlapping(m, startTimes)) {
        onChange([...startTimes, m])
        return
      }
    }
  }, [startTimes, onChange])

  // 轨道 mousedown：判断是否点在空白处，如果是则启动整体平移
  const handleTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left

    // 检查是否点在某个滑块附近
    const currentIndexed = startTimesRef.current.map((t, i) => ({ time: t, origIdx: i }))
    const nearThumb = currentIndexed.some(({ time }) => {
      const thumbX = (time / TRACK_MAX) * rect.width
      return Math.abs(clickX - thumbX) <= THUMB_HIT_RADIUS
    })

    if (!nearThumb) {
      e.preventDefault()
      setGroupDrag({
        startClientX: e.clientX,
        initialTimes: [...startTimesRef.current],
      })
    }
  }, [])

  // 整体平移的全局 mousemove / mouseup
  useEffect(() => {
    if (!groupDrag) return

    const handleMouseMove = (e: MouseEvent) => {
      const track = trackRef.current
      if (!track) return
      const trackWidth = track.getBoundingClientRect().width
      const dx = e.clientX - groupDrag.startClientX
      const rawDelta = (dx / trackWidth) * TRACK_MAX
      const dMinutes = Math.round(rawDelta / 15) * 15

      // 计算整体平移的边界限制
      const minTime = Math.min(...groupDrag.initialTimes)
      const maxTime = Math.max(...groupDrag.initialTimes)
      const minAllowed = -minTime                        // 不能超出左边界
      const maxAllowed = TRACK_MAX - CYCLE_DURATION - maxTime  // 不能超出右边界
      const clampedDelta = Math.max(minAllowed, Math.min(maxAllowed, dMinutes))

      const next = groupDrag.initialTimes.map(t => t + clampedDelta)
      onChangeRef.current(next)
    }

    const handleMouseUp = () => setGroupDrag(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [groupDrag])

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-300">自定义周期</h3>
        <button
          onClick={addCycle}
          disabled={startTimes.length >= 4}
          className="px-3 py-1 text-xs rounded-lg bg-emerald-600/80 text-white
                     hover:bg-emerald-500/80 transition-colors border-none cursor-pointer
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 添加周期
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        拖动滑块调整每个 5h 周期的位置，拖动轨道空白处可整体平移。
      </p>

      {startTimes.length === 0 ? (
        <div className="text-center text-xs text-slate-500 py-4">
          暂无周期，点击上方按钮添加
        </div>
      ) : (
        <>
          {/* 标签行：所有周期内联显示 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
            {indexed.map(({ time, origIdx }, sortedIdx) => {
              const color = CYCLE_COLORS[sortedIdx % CYCLE_COLORS.length]
              const endTime = (time + 300) % 1440
              return (
                <div key={origIdx} className="group flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-sm font-mono" style={{ color }}>
                    {formatMinutes(time)} - {formatMinutes(endTime)}
                  </span>
                  <button
                    onClick={() => removeCycle(origIdx)}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors
                               cursor-pointer bg-transparent border-none opacity-0 group-hover:opacity-100"
                  >
                    删除
                  </button>
                </div>
              )
            })}
          </div>

          {/* 共享滑轨：所有周期的滑块叠在同一轨道上，拖空白处可整体平移 */}
          <div
            ref={trackRef}
            className="dual-range-slider"
            style={{ cursor: groupDrag ? 'grabbing' : 'grab' }}
            onMouseDown={handleTrackMouseDown}
          >
            {/* 轨道背景 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-full h-[6px] rounded-[3px] pointer-events-none"
              style={{ backgroundColor: '#334155' }}
            />
            {/* 各周期 5h 区间可视化条 */}
            {indexed.map(({ time, origIdx }, sortedIdx) => {
              const color = CYCLE_COLORS[sortedIdx % CYCLE_COLORS.length]
              return (
                <div
                  key={`bar-${origIdx}`}
                  className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full pointer-events-none"
                  style={{
                    left: `${(time / TRACK_MAX) * 100}%`,
                    width: `${(Math.min(CYCLE_DURATION, TRACK_MAX - time) / TRACK_MAX) * 100}%`,
                    backgroundColor: color,
                    opacity: 0.35,
                  }}
                />
              )
            })}
            {/* 各周期滑块（叠加在同一轨道） */}
            {indexed.map(({ time, origIdx }) => (
              <input
                key={origIdx}
                type="range"
                min={0}
                max={TRACK_MAX}
                step={15}
                value={time}
                onChange={(e) => handleSlide(origIdx, Number(e.target.value))}
              />
            ))}
          </div>

          {/* 时间刻度 */}
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:45</span>
          </div>
        </>
      )}
    </div>
  )
}
