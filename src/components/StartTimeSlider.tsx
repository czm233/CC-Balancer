import { formatMinutes } from '../utils/time'

interface StartTimeSliderProps {
  /** 当前激活起始时间（分钟） */
  value: number
  /** 时间变更回调 */
  onChange: (minutes: number) => void
}

export default function StartTimeSlider({ value, onChange }: StartTimeSliderProps) {
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">激活起始时间</span>
        <span className="text-lg font-mono font-bold text-emerald-400">
          {formatMinutes(value)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1425}
        step={15}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:45</span>
      </div>
    </div>
  )
}
