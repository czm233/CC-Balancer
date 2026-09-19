import { useMemo, useState } from 'react'
import { scriptPrompt } from './utils/scriptPrompt'
import ClockFace from './components/ClockFace'
import { defaults, simulate, time, valid, working, windowPressure, activationGuard } from './utils/planner'
import type { Settings, Profile } from './utils/planner'
import './planner.css'
const WINDOW_BLUES = ['#0EA5E9', '#3B82F6']
const KEY = 'cc-balancer-planner-v1'
function read(): Settings { try { const stored = JSON.parse(localStorage.getItem(KEY) || 'null'); const s = stored ? { ...defaults, ...stored } : null; if (s && typeof s.hours === 'number') s.hours = Math.min(5, s.hours); return s && valid(s) ? s : defaults } catch { return defaults } }
const pressureLabel = (value: number) => value > 0.00001 ? '偏紧' : value < -0.00001 ? '有余量' : '刚好够用'
const pressureColor = (value: number) => value > 0.00001 ? '#fb923c' : value < -0.00001 ? '#34d399' : '#cbd5e1'
const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3))
export default function Planner() {
  const [s, set] = useState<Settings>(read)
  const [saved, setSaved] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '未识别，请手动确认'
  const prompt = scriptPrompt(s, timezone)
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopyStatus('已复制，可以粘贴给你的 AI') }
    catch { setCopyStatus('复制未成功，请选中下方文本手动复制') }
  }
  const [notice, setNotice] = useState('')
  function persist(next: Settings) { set(next); try { localStorage.setItem(KEY, JSON.stringify(next)); setSaved(true) } catch { setSaved(false) } }
  const lunchStart = Math.max(s.start, s.lunchStart)
  const lunchEnd = Math.min(s.end, s.lunchEnd)
  const lunchSlot = s.lunch && lunchStart < lunchEnd ? { id: 'lunch', start: lunchStart, end: lunchEnd } : undefined
  const guard = activationGuard(s.first)
  const current = useMemo(() => simulate(s, s.first), [s])
  const pressureWindows = useMemo(() => windowPressure(s, s.first), [s])
  const totalGapMinutes = pressureWindows.reduce((sum, window) => sum + window.gapMinutes, 0)
  const averagePressure = pressureWindows.length ? pressureWindows.reduce((sum, window) => sum + window.pressure, 0) / pressureWindows.length : 0
  const pressureScale = Math.max(100, ...pressureWindows.map(w => Math.ceil(Math.abs(w.pressure) / 100) * 100))
  function update(patch: Partial<Settings>) {
    const next = { ...s, ...patch }
    next.first = Math.max(Math.max(0, next.start - 285), Math.min(next.start, next.first))
    if (!Number.isInteger(next.lunchStart) || !Number.isInteger(next.lunchEnd) || next.lunchEnd <= next.lunchStart) { setNotice('午休结束时间需要晚于开始时间。'); return }
    if (!valid(next)) { setNotice('请设置 05:00–23:00 之间、至少相隔 1 小时的同日工作时间。'); return }
    setNotice(''); setCopyStatus(''); persist(next)
  }
  const busy = [] as { id: string; start: number; end: number }[]
  for (let t = s.start; t < s.end; t++) if (working(s, t)) { const last = busy.at(-1); if (last?.end === t) last.end++; else busy.push({ id: `busy-${t}`, start: t, end: t + 1 }) }
  const cycles = current.cycles.map((c, i) => ({ id: `cycle-${i}`, start: c.start, end: c.end % 1440 }))
  return <main className="planner">
    <header className="masthead"><a className="wordmark" href="#">CC<span>·</span>BALANCER <small>额度规划实验室</small></a></header>
    <section className="intro"><div><div className="eyebrow">把额度，留给真正需要的时候</div><h1>让每一次刷新，<br className="mobile-break"/>更合你的工作节奏。</h1><p>模拟你的工作日，调整 5 小时窗口，找到更少中断的安排。</p></div><div className="save-status"><i/> {saved ? '方案已保存在此浏览器' : '浏览器无法保存，请记录方案'}</div></section>
    <div className="workspace"><aside className="settings panel"><div className="section-heading"><span className="step">01</span><h2>我的工作日</h2></div>
      <div className="time-fields"><label>开始工作<input aria-label="开始工作" type="time" step="900" value={time(s.start)} onChange={e => update({ start: toMinutes(e.target.value) })}/></label><span>—</span><label>结束工作<input aria-label="结束工作" type="time" step="900" value={time(s.end)} onChange={e => update({ end: toMinutes(e.target.value) })}/></label></div>
      <label className="check"><input type="checkbox" checked={s.lunch} onChange={e => update({ lunch: e.target.checked })}/> 午休，不消耗额度</label>
      {s.lunch && <div className="time-fields lunch-fields"><label>午休开始<input aria-label="午休开始" type="time" step="900" value={time(s.lunchStart)} onChange={e => update({ lunchStart: toMinutes(e.target.value) })}/></label><span>—</span><label>午休结束<input aria-label="午休结束" type="time" step="900" value={time(s.lunchEnd)} onChange={e => update({ lunchEnd: toMinutes(e.target.value) })}/></label></div>}{notice && <p role="alert" className="warning">{notice}</p>}
      <div className="field-title">什么时候用得更多？</div><p className="profile-hint">全天均匀：按平常用量。<br/>上午／下午更忙：该时段消耗翻倍，额度可支撑时长减半。</p><div className="profile-options">{([['even','全天均匀','▥'],['morning','上午更忙','◐'],['afternoon','下午更忙','◑']] as [Profile,string,string][]).map(([id,label,icon]) => <button key={id} aria-pressed={s.profile === id} className={s.profile === id ? 'selected' : ''} onClick={() => update({ profile: id })}><b>{icon}</b>{label}</button>)}</div>
      <div className="field-title">你平常的使用中，预估5 小时窗口内，额度能支撑多久？</div><div className="burn-value"><strong>{s.hours}<small> 小时</small></strong></div><input aria-label="一份额度可用小时" className="full-range" type="range" min="1" max="5" step="0.5" value={s.hours} onChange={e => update({ hours: Number(e.target.value) })}/>
      <p className="consumption-hint">一份额度：上午约 {s.profile === 'morning' ? s.hours / 2 : s.hours}h · 下午约 {s.profile === 'afternoon' ? s.hours / 2 : s.hours}h</p>
      
    </aside>
    <section className="simulation panel"><div className="simulation-top"><div className="section-heading"><span className="step">02</span><h2>试试你的安排</h2></div></div>
      <div className="clocks"><ClockFace lunchSlot={lunchSlot} cycleLabel="5H周期" busyLabel="工作时间" busyColor="#F59E0B" cycleColors={WINDOW_BLUES} period="am" busySlots={busy} cycles={cycles}/><div className="clock-divider">一天的安排<span>→</span></div><ClockFace lunchSlot={lunchSlot} cycleLabel="5H周期" busyLabel="工作时间" busyColor="#F59E0B" cycleColors={WINDOW_BLUES} period="pm" busySlots={busy} cycles={cycles}/></div>
      
      <div className="activation"><div><label htmlFor="first">首次触发时间</label><strong>{time(s.first)}</strong><span className="pause-inline">为确保窗口的准时开启，请在对应时间段暂停使用：<b className="pause-time">{guard.startLabel}–{guard.endLabel}</b></span></div><input id="first" aria-label="首次触发时间" type="range" min={Math.max(0,s.start-285)} max={s.start} step="15" value={s.first} onChange={e => update({ first: Number(e.target.value) })}/><div className="range-labels"><span>{time(Math.max(0,s.start-285))} 最早预开启</span><span>{time(s.start)} 上班时</span></div></div>


      <section className="pressure-summary" aria-label="工作窗口与压力">
        <div className="pressure-overview"><div className="window-count"><span>平均压力</span><strong style={{color: pressureColor(averagePressure)}}>{pressureLabel(averagePressure)}</strong></div></div>
        <div className="pressure-heading">每个窗口的工作压力<span className="total-gap">总空窗期：{Math.ceil(totalGapMinutes - 0.000001)} 分钟</span></div>
        <div className="pressure-windows">{pressureWindows.map(c => {
          const index = current.cycles.findIndex(cycle => cycle.start === c.start)
          const color = WINDOW_BLUES[index % WINDOW_BLUES.length]
          return <article className="pressure-window" key={c.start}>
            <div className="pressure-window-title"><span><i style={{background: color}}/>窗口 {index + 1}</span><b>{time(c.start)}–{time(c.end)}</b></div>
            <div className="pressure-value"><strong style={{color: pressureColor(c.pressure)}}>{pressureLabel(c.pressure)}</strong><span>工作 {Math.floor(c.workMinutes / 60)}h {c.workMinutes % 60 ? `${c.workMinutes % 60}m` : ''}</span></div>
            {c.pressure > 0.00001 && <p className="window-gap">可能有 {Math.ceil(c.gapMinutes - 0.000001)} 分钟空窗期</p>}
            <div className="signed-pressure-track" role="meter" aria-label={`窗口 ${index + 1} 工作压力`} aria-valuetext={pressureLabel(c.pressure)} aria-valuemin={-100} aria-valuemax={pressureScale} aria-valuenow={Number(c.pressure.toFixed(1))}><i style={{left: c.pressure < 0 ? `${50 + c.pressure / 100 * 50}%` : '50%', width: `${Math.abs(c.pressure) / (c.pressure < 0 ? 100 : pressureScale) * 50}%`, background: pressureColor(c.pressure)}}/><b/></div>
            <div className="pressure-axis"><span>有余量</span><span>刚好</span><span>偏紧</span></div>

          </article>
        })}</div>
      </section>
    </section></div>
    <section className="prompt-panel panel" aria-label="生成脚本 Prompt">
      <div className="prompt-header"><div><h2>把计划交给你的 AI</h2><p>生成包含触发时间的 Prompt，让 AI 帮你编写定时脚本。</p></div><button className="primary" onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? '收起 Prompt' : '生成脚本 Prompt'}</button></div>
      {showPrompt && <><div className="prompt-schedule">首次触发 <b>{time(s.first)}</b><span>定时触发 <b>{current.cycles.map(c => time(c.start)).join(' / ')}</b></span><span>时区 {timezone}</span></div><textarea aria-label="脚本编写 Prompt" readOnly value={prompt}/><div className="prompt-actions"><span role="status">{copyStatus || '内容随当前计划更新；执行日期与接口由你的 AI 向你确认。'}</span><button className="primary" onClick={copyPrompt}>复制 Prompt</button></div></>}
    </section>
    <footer className="planner-footer">CC-Balancer · 先模拟，再决定。</footer>
  </main>
}
