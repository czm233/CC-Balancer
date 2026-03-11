import { useCallback, useState, useRef, useEffect } from 'react'
import type { TimeSlot } from '../utils/time'
import { formatMinutes, genId, isOverlapping } from '../utils/time'
import { BUSY_COLORS } from '../utils/colors'

interface TimeSlotManagerProps {
  /** 忙时区间列表 */
  slots: TimeSlot[]
  /** 区间变更回调 */
  onChange: (slots: TimeSlot[]) => void
}

interface DragState {
  origIdx: number
  type: 'start' | 'end' | 'move'
  startClientX: number
  initialStart: number
  initialEnd: number
}

/** 默认新区间时长（2小时 = 120分钟） */
const DEFAULT_DURATION = 120
/** 轨道最大分钟数（23:45） */
const TRACK_MAX = 1425

export default function TimeSlotManager({ slots, onChange }: TimeSlotManagerProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // 用 ref 避免 useEffect 中闭包捕获过期 state
  const slotsRef = useRef(slots)
  const onChangeRef = useRef(onChange)

  useEffect(() => { slotsRef.current = slots }, [slots])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // 按开始时间排序用于显示，保持原始 index
  const indexed = slots.map((s, i) => ({ slot: s, origIdx: i }))
  indexed.sort((a, b) => a.slot.start - b.slot.start)

  // 删除区间
  const removeSlot = useCallback((index: number) => {
    onChange(slots.filter((_, i) => i !== index))
  }, [slots, onChange])

  // 添加新区间：自动找一个 2 小时的空闲区间
  const addSlot = useCallback(() => {
    for (let m = 0; m <= TRACK_MAX - DEFAULT_DURATION; m += 15) {
      const candidate = { start: m, end: m + DEFAULT_DURATION }
      if (!isOverlapping(candidate, slots)) {
        onChange([...slots, { id: genId(), ...candidate }])
        return
      }
    }
  }, [slots, onChange])

  // 鼠标按下：记录拖拽起点
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    origIdx: number,
    type: DragState['type'],
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      origIdx,
      type,
      startClientX: e.clientX,
      initialStart: slots[origIdx].start,
      initialEnd: slots[origIdx].end,
    })
  }, [slots])

  // 全局鼠标移动/抬起处理
  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (e: MouseEvent) => {
      const track = trackRef.current
      if (!track) return
      const trackWidth = track.getBoundingClientRect().width
      const dx = e.clientX - dragState.startClientX
      const dMinutes = Math.round((dx / trackWidth) * TRACK_MAX / 15) * 15

      const currentSlots = slotsRef.current
      const slot = currentSlots[dragState.origIdx]
      if (!slot) return
      const others = currentSlots.filter((_, i) => i !== dragState.origIdx)

      let newStart = slot.start
      let newEnd = slot.end

      if (dragState.type === 'start') {
        newStart = Math.max(0, Math.min(dragState.initialStart + dMinutes, dragState.initialEnd - 15))
        if (newStart === slot.start) return
        if (isOverlapping({ start: newStart, end: slot.end }, others)) return
      } else if (dragState.type === 'end') {
        newEnd = Math.max(dragState.initialStart + 15, Math.min(dragState.initialEnd + dMinutes, TRACK_MAX))
        if (newEnd === slot.end) return
        if (isOverlapping({ start: slot.start, end: newEnd }, others)) return
        newStart = slot.start
      } else {
        // 整体平移
        const duration = dragState.initialEnd - dragState.initialStart
        newStart = Math.max(0, Math.min(dragState.initialStart + dMinutes, TRACK_MAX - duration))
        newEnd = newStart + duration
        if (newStart === slot.start) return
        if (isOverlapping({ start: newStart, end: newEnd }, others)) return
      }

      const next = [...currentSlots]
      next[dragState.origIdx] = { ...slot, start: newStart, end: newEnd }
      onChangeRef.current(next)
    }

    const handleMouseUp = () => setDragState(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState])

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4">
      {/* 标题行：左边标题，右边添加按钮 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-300">忙时区间管理</h3>
        <button
          onClick={addSlot}
          disabled={slots.length >= 6}
          className="px-3 py-1 text-xs rounded-lg bg-emerald-600/80 text-white
                     hover:bg-emerald-500/80 transition-colors border-none cursor-pointer
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 添加区间
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        拖动区间调整忙时的起止时间，拖两端调整边界，拖中间移动整体。
      </p>

      {slots.length === 0 ? (
        <div className="text-center text-xs text-slate-500 py-4">
          暂无忙时区间，点击上方按钮添加
        </div>
      ) : (
        <>
          {/* 区间标签列表 */}
          <div className="flex flex-col gap-1 mb-3">
            {indexed.map(({ slot, origIdx }, sortedIdx) => {
              const duration = slot.end - slot.start
              const durationHours = Math.round(duration / 60 * 10) / 10
              const color = BUSY_COLORS[sortedIdx % 2]
              return (
                <div key={slot.id} className="group flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-mono" style={{ color }}>
                      {formatMinutes(slot.start)} - {formatMinutes(slot.end)}
                    </span>
                    <span className="text-xs text-slate-500">({durationHours}h)</span>
                  </div>
                  <button
                    onClick={() => removeSlot(origIdx)}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors
                               cursor-pointer bg-transparent border-none opacity-0 group-hover:opacity-100"
                  >
                    删除
                  </button>
                </div>
              )
            })}
          </div>

          {/* 统一时间轨道 */}
          <div
            ref={trackRef}
            className="relative h-5 bg-slate-700/40 rounded-full"
            style={{ userSelect: 'none' }}
          >
            {indexed.map(({ slot, origIdx }, sortedIdx) => {
              const leftPct = (slot.start / TRACK_MAX) * 100
              const widthPct = ((slot.end - slot.start) / TRACK_MAX) * 100
              const color = BUSY_COLORS[sortedIdx % 2]
              return (
                <div
                  key={slot.id}
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: color,
                    opacity: 0.75,
                  }}
                >
                  {/* 左端手柄：拖拽调整开始时间 */}
                  <div
                    className="absolute left-0 top-0 w-2.5 h-full rounded-l-full cursor-ew-resize"
                    style={{ backgroundColor: color, zIndex: 10 }}
                    onMouseDown={(e) => handleMouseDown(e, origIdx, 'start')}
                  />
                  {/* 中间区域：拖拽整体平移 */}
                  <div
                    className="absolute inset-0 mx-2.5 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleMouseDown(e, origIdx, 'move')}
                  />
                  {/* 右端手柄：拖拽调整结束时间 */}
                  <div
                    className="absolute right-0 top-0 w-2.5 h-full rounded-r-full cursor-ew-resize"
                    style={{ backgroundColor: color, zIndex: 10 }}
                    onMouseDown={(e) => handleMouseDown(e, origIdx, 'end')}
                  />
                </div>
              )
            })}
          </div>

          {/* 底部时间刻度 */}
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
