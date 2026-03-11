/** 时间区间类型 */
export interface TimeSlot {
  id: string
  /** 开始时间，单位：分钟（0-1440） */
  start: number
  /** 结束时间，单位：分钟（0-1440） */
  end: number
}

/** 将分钟数格式化为 HH:MM */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 生成唯一 ID */
export function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** 生成 5h Token 周期数组（从 activateTime 开始，每 5h 一个，覆盖 24h） */
export function generateCycles(activateTime: number): TimeSlot[] {
  const cycles: TimeSlot[] = []
  const CYCLE_DURATION = 5 * 60 // 5小时 = 300分钟
  let cursor = activateTime
  const endBound = activateTime + 1440 // 24h 的绝对终点

  // 生成周期直到填满 24h
  for (let i = 0; i < 5; i++) {
    if (cursor >= endBound) break
    const duration = Math.min(CYCLE_DURATION, endBound - cursor)
    const start = cursor % 1440
    const end = (cursor + duration) % 1440
    cycles.push({ id: `cycle-${i}`, start, end })
    cursor += CYCLE_DURATION
  }

  return cycles
}

/** 自定义模式：根据用户指定的多个起始时间生成独立的 5h 周期（允许间隔） */
export function generateCustomCycles(startTimes: number[]): TimeSlot[] {
  const CYCLE_DURATION = 5 * 60
  const sorted = [...startTimes].sort((a, b) => a - b)
  return sorted.map((start, i) => ({
    id: `cycle-${i}`,
    start,
    end: (start + CYCLE_DURATION) % 1440,
  }))
}

/** 检查新周期起点是否与已有周期冲突（5h 区间不能重叠，端点相切允许） */
export function isCycleOverlapping(newStart: number, existingStarts: number[]): boolean {
  const CYCLE_DURATION = 5 * 60
  const newEnd = newStart + CYCLE_DURATION
  for (const s of existingStarts) {
    const end = s + CYCLE_DURATION
    // 用绝对时间比较，处理简单情况（不跨午夜）
    if (newStart < end && s < newEnd) {
      return true
    }
  }
  return false
}

/**
 * 计算两个时间区间集合的交集总时长（分钟）
 * 处理跨午夜的区间
 */
function slotMinutes(slot: TimeSlot): number {
  if (slot.end > slot.start) return slot.end - slot.start
  return (1440 - slot.start) + slot.end
}

/** 将可能跨午夜的区间拆分为不跨午夜的片段 */
function splitSlot(slot: TimeSlot): { start: number; end: number }[] {
  if (slot.start < slot.end) {
    return [{ start: slot.start, end: slot.end }]
  }
  // 跨午夜，拆分为两段
  return [
    { start: slot.start, end: 1440 },
    { start: 0, end: slot.end },
  ]
}

/** 计算两组时间区间的交集总时长 */
export function overlapMinutes(slotsA: TimeSlot[], slotsB: TimeSlot[]): number {
  let total = 0
  for (const a of slotsA) {
    for (const b of slotsB) {
      const partsA = splitSlot(a)
      const partsB = splitSlot(b)
      for (const pa of partsA) {
        for (const pb of partsB) {
          const overlapStart = Math.max(pa.start, pb.start)
          const overlapEnd = Math.min(pa.end, pb.end)
          if (overlapEnd > overlapStart) {
            total += overlapEnd - overlapStart
          }
        }
      }
    }
  }
  return total
}

/** 检查新区间是否与已有区间重叠（端点相交允许，如 8-12 和 12-18） */
export function isOverlapping(newSlot: { start: number; end: number }, existingSlots: TimeSlot[]): boolean {
  for (const slot of existingSlots) {
    // 两个区间重叠条件：a.start < b.end && b.start < a.end
    // 端点相等不算重叠（允许 8-12 + 12-18）
    if (newSlot.start < slot.end && slot.start < newSlot.end) {
      return true
    }
  }
  return false
}

/** 每个周期的详细信息 */
export interface CycleDetail {
  /** 周期序号（从 0 开始） */
  index: number
  /** 周期时间范围 */
  start: number
  end: number
  /** 周期总时长（分钟） */
  duration: number
  /** 与忙时重合时长（分钟） */
  overlapMinutes: number
  /** 空转时长（分钟） */
  idleMinutes: number
}

/** 计算每个周期与忙时的重合详情 */
export function calculateCycleDetails(cycles: TimeSlot[], busySlots: TimeSlot[]): CycleDetail[] {
  return cycles.map((cycle, index) => {
    const duration = slotMinutes(cycle)
    const overlap = overlapMinutes([cycle], busySlots)
    return {
      index,
      start: cycle.start,
      end: cycle.end,
      duration,
      overlapMinutes: overlap,
      idleMinutes: duration - overlap,
    }
  })
}

/**
 * 获取某个周期内的工作时段（周期与忙时的交集片段，按时间排序）
 */
function getWorkPeriodsInCycle(
  cycle: TimeSlot,
  busySlots: TimeSlot[],
): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = []
  const cycleParts = splitSlot(cycle)

  for (const busy of busySlots) {
    const busyParts = splitSlot(busy)
    for (const cp of cycleParts) {
      for (const bp of busyParts) {
        const s = Math.max(cp.start, bp.start)
        const e = Math.min(cp.end, bp.end)
        if (e > s) result.push({ start: s, end: e })
      }
    }
  }

  result.sort((a, b) => a.start - b.start)
  return result
}

/**
 * 计算工作时段内的等待时长（Token 耗尽后仍在忙时中等待下次刷新的时长）
 *
 * 核心逻辑：Token 只在工作时间被消耗（非忙时不烧 Token），
 * 所以按"累计工作时长"而非"挂钟时间"来判定耗尽时刻。
 *
 * @param cycles 所有周期
 * @param busySlots 忙时区间
 * @param burnMinutes 预计需要多少分钟的工作时间才能耗尽一个周期的 Token
 */
export function calculateDeadZone(
  cycles: TimeSlot[],
  busySlots: TimeSlot[],
  burnMinutes: number,
): number {
  if (cycles.length === 0 || busySlots.length === 0 || burnMinutes >= 300) return 0

  const sorted = [...cycles].sort((a, b) => a.start - b.start)
  let total = 0

  for (let i = 0; i < sorted.length; i++) {
    const cycle = sorted[i]

    // 找出该周期内的实际工作片段
    const workPeriods = getWorkPeriodsInCycle(cycle, busySlots)
    if (workPeriods.length === 0) continue

    // 按工作时长累计，找出 Token 耗尽的挂钟时刻
    let remaining = burnMinutes
    let exhaustionTime: number | null = null

    for (const period of workPeriods) {
      const duration = period.end - period.start
      if (duration >= remaining) {
        exhaustionTime = period.start + remaining
        break
      }
      remaining -= duration
    }

    if (exhaustionTime === null) continue // 该周期内工作时长不足以耗尽 Token

    // 死区：从耗尽时刻到下一个周期开始
    const deadEnd = i + 1 < sorted.length ? sorted[i + 1].start : cycle.end

    const deadSlot: TimeSlot = { id: `dead-${i}`, start: exhaustionTime, end: deadEnd }
    total += overlapMinutes([deadSlot], busySlots)
  }

  return total
}

/** 计算策略指标 */
export function calculateMetrics(busySlots: TimeSlot[], cycles: TimeSlot[]) {
  const totalBusy = busySlots.reduce((sum, s) => sum + slotMinutes(s), 0)
  const totalCycle = cycles.reduce((sum, s) => sum + slotMinutes(s), 0)
  const overlap = overlapMinutes(busySlots, cycles)

  // 覆盖率：忙时被 Token 覆盖的比例
  const coverage = totalBusy > 0 ? overlap / totalBusy : 0
  // 利用率：Token 有效期中实际在工作的比例
  const utilization = totalCycle > 0 ? overlap / totalCycle : 0
  // 空转时长：Token 生效但用户不在工作的时长
  const idleMinutes = totalCycle - overlap

  return {
    coverage: Math.round(coverage * 100),
    utilization: Math.round(utilization * 100),
    idleHours: +(idleMinutes / 60).toFixed(1),
  }
}
