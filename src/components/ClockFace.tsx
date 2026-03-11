import { useMemo, useRef, useCallback, useState } from 'react'
import type { TimeSlot } from '../utils/time'
import { formatMinutes, genId, isOverlapping } from '../utils/time'
import { CYCLE_COLORS, BUSY_COLORS } from '../utils/colors'

interface ClockFaceProps {
  /** 'am' 表示 0-12，'pm' 表示 12-24 */
  period: 'am' | 'pm'
  /** 忙时区间（全局分钟 0-1440） */
  busySlots: TimeSlot[]
  /** 5h Token 周期数组 */
  cycles: TimeSlot[]
  /** 忙时区间变更回调（拖拽创建） */
  onBusySlotsChange?: (slots: TimeSlot[]) => void
}

const SIZE = 280
const CENTER = SIZE / 2
const OUTER_R = 120 // 外圈（Token 周期）
const INNER_R = 95  // 内圈（忙时标记）
const ARC_WIDTH = 18
const FACE_R = 75   // 钟面半径
/** 拖拽操作的有效区域：内圈 ± 偏差 */
const DRAG_R_MIN = INNER_R - ARC_WIDTH
const DRAG_R_MAX = INNER_R + ARC_WIDTH

/**
 * 将全局分钟数（0-1440）转为时钟角度（0-360）
 * AM 时钟：0:00 在顶部 = 0度，顺时针
 * PM 时钟：12:00 在顶部 = 0度，顺时针
 */
function minutesToAngle(minutes: number, period: 'am' | 'pm'): number {
  const offset = period === 'pm' ? 720 : 0
  const localMinutes = ((minutes - offset) % 720 + 720) % 720
  return (localMinutes / 720) * 360
}

/** 将角度（0-360，从顶部顺时针）转为全局分钟数 */
function angleToMinutes(angle: number, period: 'am' | 'pm'): number {
  const offset = period === 'pm' ? 720 : 0
  const localMinutes = (angle / 360) * 720
  // 吸附到 15 分钟
  const snapped = Math.round(localMinutes / 15) * 15
  return offset + (snapped % 720)
}

/** 从鼠标/触摸事件中计算相对于圆心的角度 */
function getAngleFromEvent(
  e: React.MouseEvent | React.Touch,
  svgRef: React.RefObject<SVGSVGElement | null>,
): number | null {
  const svg = svgRef.current
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  const scaleX = SIZE / rect.width
  const scaleY = SIZE / rect.height
  const x = (e.clientX - rect.left) * scaleX - CENTER
  const y = (e.clientY - rect.top) * scaleY - CENTER

  // 检查是否在内圈拖拽区域
  const dist = Math.sqrt(x * x + y * y)
  if (dist < DRAG_R_MIN || dist > DRAG_R_MAX + 10) return null

  // 计算角度（从顶部顺时针）
  let angle = Math.atan2(x, -y) * (180 / Math.PI)
  if (angle < 0) angle += 360
  return angle
}

/** 将跨半天的 slot 裁剪到当前半天范围 */
function clipSlotToPeriod(slot: TimeSlot, period: 'am' | 'pm'): { start: number; end: number }[] {
  const pStart = period === 'am' ? 0 : 720
  const pEnd = period === 'am' ? 720 : 1440

  const segments: { start: number; end: number }[] = []
  if (slot.start < slot.end) {
    segments.push({ start: slot.start, end: slot.end })
  } else {
    segments.push({ start: slot.start, end: 1440 })
    segments.push({ start: 0, end: slot.end })
  }

  const clipped: { start: number; end: number }[] = []
  for (const seg of segments) {
    const s = Math.max(seg.start, pStart)
    const e = Math.min(seg.end, pEnd)
    if (e > s) {
      clipped.push({ start: s, end: e })
    }
  }
  return clipped
}

/** 生成 SVG 弧形路径 */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const startRad = ((startAngle - 90) * Math.PI) / 180
  const endRad = ((endAngle - 90) * Math.PI) / 180
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)

  let angleDiff = endAngle - startAngle
  if (angleDiff < 0) angleDiff += 360
  const largeArc = angleDiff > 180 ? 1 : 0

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

/** 每个 5h 周期独立颜色，同一周期跨两个时钟时保持同色 */

export default function ClockFace({ period, busySlots, cycles, onBusySlotsChange }: ClockFaceProps) {
  const label = period === 'am' ? 'AM' : 'PM'
  const hourOffset = period === 'am' ? 0 : 12
  const svgRef = useRef<SVGSVGElement>(null)

  // 拖拽状态
  const [dragStart, setDragStart] = useState<number | null>(null) // 起始角度
  const [dragEnd, setDragEnd] = useState<number | null>(null)     // 当前角度
  const [isDragging, setIsDragging] = useState(false)

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onBusySlotsChange) return
    const angle = getAngleFromEvent(e, svgRef)
    if (angle === null) return
    e.preventDefault() // 禁止拖拽时触发文本选中
    setDragStart(angle)
    setDragEnd(angle)
    setIsDragging(true)
  }, [onBusySlotsChange])

  // 拖拽中
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = SIZE / rect.width
    const scaleY = SIZE / rect.height
    const x = (e.clientX - rect.left) * scaleX - CENTER
    const y = (e.clientY - rect.top) * scaleY - CENTER
    let angle = Math.atan2(x, -y) * (180 / Math.PI)
    if (angle < 0) angle += 360
    setDragEnd(angle)
  }, [isDragging])

  // 拖拽结束，创建新的忙时区间
  const handleMouseUp = useCallback(() => {
    if (!isDragging || dragStart === null || dragEnd === null || !onBusySlotsChange) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    const startMin = angleToMinutes(dragStart, period)
    const endMin = angleToMinutes(dragEnd, period)

    // 至少 15 分钟才创建
    if (startMin !== endMin) {
      const newSlot: TimeSlot = {
        id: genId(),
        start: Math.min(startMin, endMin),
        end: Math.max(startMin, endMin),
      }
      // 重叠校验：不允许与已有区间重叠
      if (!isOverlapping(newSlot, busySlots)) {
        onBusySlotsChange([...busySlots, newSlot])
      }
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, period, busySlots, onBusySlotsChange])

  // 预览拖拽区间的角度
  const previewArc = useMemo(() => {
    if (!isDragging || dragStart === null || dragEnd === null) return null
    const s = Math.min(dragStart, dragEnd)
    const e = Math.max(dragStart, dragEnd)
    if (Math.abs(e - s) < 2) return null
    return { startAngle: s, endAngle: e }
  }, [isDragging, dragStart, dragEnd])

  // 拖拽时间预览文字
  const dragTimeLabel = useMemo(() => {
    if (!isDragging || dragStart === null || dragEnd === null) return null
    const startMin = angleToMinutes(Math.min(dragStart, dragEnd), period)
    const endMin = angleToMinutes(Math.max(dragStart, dragEnd), period)
    return `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`
  }, [isDragging, dragStart, dragEnd, period])

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-lg font-semibold mb-2 text-slate-300">{label}</h3>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: onBusySlotsChange ? 'crosshair' : 'default', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {/* 内圈底色（闲时/深灰蓝） */}
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" stroke="#1E293B" strokeWidth={ARC_WIDTH} />

        {/* 外圈底色 */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" stroke="#1E293B" strokeWidth={ARC_WIDTH} opacity={0.3} />

        {/* 钟面背景 */}
        <circle cx={CENTER} cy={CENTER} r={FACE_R} fill="#1E293B" />
        <circle cx={CENTER} cy={CENTER} r={FACE_R} fill="none" stroke="#334155" strokeWidth={1.5} />

        {/* 小时刻度和数字 */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180)
          const displayHour = i + hourOffset
          const tickInner = FACE_R - 8
          const tickOuter = FACE_R - 2
          const textR = FACE_R - 18

          return (
            <g key={i}>
              <line
                x1={CENTER + tickInner * Math.cos(angle)}
                y1={CENTER + tickInner * Math.sin(angle)}
                x2={CENTER + tickOuter * Math.cos(angle)}
                y2={CENTER + tickOuter * Math.sin(angle)}
                stroke="#64748b"
                strokeWidth={i % 3 === 0 ? 2 : 1}
              />
              <text
                x={CENTER + textR * Math.cos(angle)}
                y={CENTER + textR * Math.sin(angle)}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#94a3b8"
                fontSize={11}
                fontWeight={500}
              >
                {displayHour}
              </text>
            </g>
          )
        })}

        {/* 忙时区间弧形（内圈），按时间排序后奇偶交替颜色 */}
        {(() => {
          const sorted = [...busySlots].map((slot, i) => ({ slot, origIdx: i }))
          sorted.sort((a, b) => a.slot.start - b.slot.start)
          return sorted.map(({ slot }, sortedIdx) => {
            const color = BUSY_COLORS[sortedIdx % 2]
            const clipped = clipSlotToPeriod(slot, period)
            return clipped.map((seg, idx) => {
              const startAngle = minutesToAngle(seg.start, period)
              const endAngle = minutesToAngle(seg.end, period)
              if (Math.abs(endAngle - startAngle) < 0.1) return null
              return (
                <path
                  key={`busy-${slot.id}-${idx}`}
                  d={arcPath(CENTER, CENTER, INNER_R, startAngle, endAngle)}
                  fill="none"
                  stroke={color}
                  strokeWidth={ARC_WIDTH}
                  strokeLinecap="butt"
                  opacity={0.7}
                />
              )
            })
          })
        })()}

        {/* 5h Token 周期弧形（外圈），每个周期独立颜色 */}
        {cycles.map((cycle, cycleIdx) => {
          const clipped = clipSlotToPeriod(cycle, period)
          const color = CYCLE_COLORS[cycleIdx % CYCLE_COLORS.length]
          return clipped.map((seg, idx) => {
            const startAngle = minutesToAngle(seg.start, period)
            const endAngle = minutesToAngle(seg.end, period)
            if (Math.abs(endAngle - startAngle) < 0.1) return null
            return (
              <path
                key={`cycle-${cycle.id}-${idx}`}
                d={arcPath(CENTER, CENTER, OUTER_R, startAngle, endAngle)}
                fill="none"
                stroke={color}
                strokeWidth={ARC_WIDTH}
                strokeLinecap="butt"
                opacity={0.8}
              />
            )
          })
        })}

        {/* 拖拽预览弧形 */}
        {previewArc && (
          <path
            d={arcPath(CENTER, CENTER, INNER_R, previewArc.startAngle, previewArc.endAngle)}
            fill="none"
            stroke={BUSY_COLORS[0]}
            strokeWidth={ARC_WIDTH}
            strokeLinecap="butt"
            opacity={0.4}
            strokeDasharray="4 4"
          />
        )}

        {/* 中心标签 */}
        <text
          x={CENTER}
          y={CENTER - (isDragging ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#64748b"
          fontSize={isDragging ? 11 : 14}
          fontWeight={600}
        >
          {period === 'am' ? '0-12' : '12-24'}
        </text>

        {/* 拖拽时显示时间预览 */}
        {isDragging && dragTimeLabel && (
          <text
            x={CENTER}
            y={CENTER + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill={BUSY_COLORS[0]}
            fontSize={11}
            fontWeight={600}
          >
            {dragTimeLabel}
          </text>
        )}
      </svg>

      {/* 图例 + 拖拽提示 */}
      <div className="flex gap-3 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="flex gap-0.5">
            <span className="inline-block w-2 h-3 rounded-xs" style={{ backgroundColor: BUSY_COLORS[0] }} />
            <span className="inline-block w-2 h-3 rounded-xs" style={{ backgroundColor: BUSY_COLORS[1] }} />
          </span>
          忙时
        </span>
        <span className="flex items-center gap-1">
          <span className="flex gap-0.5">
            {CYCLE_COLORS.map((c, i) => (
              <span key={i} className="inline-block w-2 h-3 rounded-xs" style={{ backgroundColor: c }} />
            ))}
          </span>
          周期
        </span>
      </div>
      {onBusySlotsChange && (
        <div className="text-xs text-slate-500 mt-1">在内圈拖拽可创建忙时区间</div>
      )}
    </div>
  )
}
