/** 每个 5h 周期的独立颜色，最多 5 个周期 */
export const CYCLE_COLORS = [
  '#F59E0B',  // 琥珀
  '#A78BFA',  // 紫色
  '#38BDF8',  // 天蓝
  '#FB7185',  // 玫红
  '#34D399',  // 翡翠绿
]

/** 忙时区间交替颜色（两种，按排序后奇偶交替，避开 CYCLE_COLORS） */
export const BUSY_COLORS: [string, string] = [
  '#FF6B6B',  // 珊瑚红
  '#4ECDC4',  // 青绿
]
