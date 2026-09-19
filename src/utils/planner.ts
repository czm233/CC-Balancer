export type Profile = 'even' | 'morning' | 'afternoon'
export interface Settings { start: number; end: number; lunch: boolean; lunchStart: number; lunchEnd: number; hours: number; profile: Profile; first: number }
export const defaults: Settings = { start: 540, end: 1080, lunch: true, lunchStart: 720, lunchEnd: 780, hours: 3, profile: 'even', first: 540 }
export function valid(s: Settings) {
  return Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 300 && s.end <= 1380 && s.end - s.start >= 60 && typeof s.lunch === 'boolean' && Number.isInteger(s.lunchStart) && Number.isInteger(s.lunchEnd) && s.lunchStart >= 0 && s.lunchEnd < 1440 && s.lunchEnd > s.lunchStart && Number.isFinite(s.hours) && s.hours >= 1 && s.hours <= 5 && ['even', 'morning', 'afternoon'].includes(s.profile) && Number.isInteger(s.first) && s.first >= Math.max(0, s.start - 285) && s.first <= s.start
}
export function working(s: Settings, t: number) { return t >= s.start && t < s.end && !(s.lunch && t >= s.lunchStart && t < s.lunchEnd) }
/** 忙时消耗翻倍；午休不消耗，不对全天总量归一化。 */
export function consumptionWeight(s: Settings, t: number) {
  if (!working(s, t)) return 0
  const morningEnd = s.lunch ? s.lunchStart : 720
  const afternoonStart = s.lunch ? s.lunchEnd : 720
  return (s.profile === 'morning' && t < morningEnd) || (s.profile === 'afternoon' && t >= afternoonStart) ? 2 : 1
}
export function simulate(s: Settings, first: number) {
  const demand = Array.from({ length: 1440 }, (_, t) => consumptionWeight(s, t) / (s.hours * 60) * 100)
  const cycles: { start: number; end: number; used: number; need: number }[] = []
  let served = 0, shortageMinutes = 0
  const unmet = Array(1440).fill(0) as number[]
  for (let start = first; start < s.end; start += 300) {
    let used = 0, need = 0
    for (let t = start; t < Math.min(start + 300, s.end); t++) {
      const requested = demand[t] || 0
      const accepted = Math.min(requested, Math.max(0, 100 - used))
      used += accepted; need += requested; served += accepted
      unmet[t] = requested - accepted
      if (requested > 0) shortageMinutes += (requested - accepted) / requested
    }
    cycles.push({ start, end: start + 300, used, need })
  }
  const total = demand.reduce((a, b) => a + b, 0)
  return { cycles, demand, unmet, total, served, satisfaction: total ? served / total * 100 : 100, shortageMinutes, unused: Math.max(0, cycles.length * 100 - served) }
}
export function recommend(s: Settings) {
  let first = s.start, result = simulate(s, first)
  for (let candidate = s.start - 15; candidate >= Math.max(0, s.start - 285); candidate -= 15) {
    const next = simulate(s, candidate)
    if (next.served > result.served + 0.00001 || (Math.abs(next.served - result.served) < 0.00001 && next.cycles.length < result.cycles.length)) { first = candidate; result = next }
  }
  return { first, result }
}
export function time(t: number) { return `${t >= 1440 ? '次日 ' : ''}${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

/** 只统计与实际工作相交的窗口；压力相对用户可支撑时长计算，不是额度耗尽概率。 */
export function windowPressure(s: Settings, first: number) {
  const windows = []
  for (let start = first; start < s.end; start += 300) {
    let workMinutes = 0, equivalentMinutes = 0, gapMinutes = 0
    let remaining = s.hours * 60
    for (let t = start; t < Math.min(start + 300, s.end); t++) {
      if (working(s, t)) workMinutes++
      const weight = consumptionWeight(s, t)
      equivalentMinutes += weight
      if (weight > 0) {
        const served = Math.min(remaining, weight)
        remaining -= served
        gapMinutes += (weight - served) / weight
      }
    }
    if (workMinutes > 0) windows.push({ start, end: start + 300, workMinutes, equivalentMinutes, gapMinutes, pressure: (equivalentMinutes / (s.hours * 60) - 1) * 100 })
  }
  return windows
}

/** 保守避用区间：目标触发前完整五小时，支持跨午夜。 */
export function activationGuard(first: number) {
  const start = first - 300
  return { start, end: first, startLabel: `${start < 0 ? '前一天 ' : ''}${time((start + 1440) % 1440)}`, endLabel: time(first) }
}
