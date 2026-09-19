import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import ts from 'typescript'
const js = ts.transpileModule(readFileSync(new URL('../src/utils/planner.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { defaults, simulate, recommend, valid } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`)
close(simulate(defaults,540).satisfaction,75)
close(simulate(defaults,540).shortageMinutes,120)
close(recommend(defaults).result.satisfaction,87.5)
assert.equal(recommend(defaults).first,420)
for (const profile of ['even','morning','afternoon']) for (const hours of [1,3,5]) {
 const s={...defaults,profile,hours}, best=recommend(s)
 close(best.result.total, (profile === 'even' ? 800 : profile === 'morning' ? 1100 : 1300)/hours)
 for(let first=255;first<=540;first+=15){const r=simulate(s,first);assert.ok(best.result.served+1e-7>=r.served);assert.ok(r.satisfaction<=100+1e-7);close(r.served+r.unmet.reduce((a,b)=>a+b,0),r.total);assert.ok(r.cycles.every(c=>c.used<=100+1e-7&&c.end-c.start===300))}
}
close(simulate({...defaults,start:720,end:780},720).satisfaction,100)
assert.equal(recommend({...defaults,hours:5}).first,540)
assert.equal(valid({...defaults,end:500}),false)
assert.equal(valid({...defaults,first:-1}),false)
assert.equal(simulate({...defaults,start:1020,end:1380,first:1020},1020).cycles.at(-1).end,1620)
console.log('Planner assertions passed: analytical baseline, all profiles, conservation, search optimality, no demand, midnight, validation.')

assert.equal(valid({...defaults,hours:5.5}),false)
const { windowPressure } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
assert.deepEqual(windowPressure({...defaults,lunch:false},540).map(w=>w.workMinutes / 300 * 100),[100,80])
assert.deepEqual(windowPressure({...defaults,lunch:false},390).map(w=>w.workMinutes / 300 * 100),[50,100,30])
assert.deepEqual(windowPressure(defaults,540).map(w=>w.workMinutes / 300 * 100),[80,80])
assert.equal(windowPressure({...defaults,start:720,end:780},720).length,0)
assert.equal(windowPressure({...defaults,end:840,lunch:false},540).length,1)
assert.ok(windowPressure({...defaults,profile:'morning'},540)[0].pressure > windowPressure(defaults,540)[0].pressure)
console.log('Window pressure checks passed: 100%, 50%, lunch, zero work, exact boundary, independent of consumption.')
assert.deepEqual(windowPressure({...defaults,lunchStart:690,lunchEnd:810},360).map(w=>w.workMinutes / 300 * 100),[40,60,40])
assert.deepEqual(windowPressure({...defaults,lunchStart:300,lunchEnd:360},540).map(w=>w.workMinutes / 300 * 100),[100,80])
assert.equal(valid({...defaults,lunchStart:810,lunchEnd:720}),false)
assert.equal(valid({...defaults,lunchStart:720,lunchEnd:720}),false)
assert.equal(valid({...defaults,lunchStart:NaN}),false)
console.log('Custom lunch tests passed: long break, no overlap, invalid intervals.')

const balanced = {...defaults, lunch:false, hours:2.5}
close(windowPressure(balanced,390)[0].pressure,0)
close(windowPressure(balanced,300)[0].pressure,-60)
close(windowPressure(balanced,540)[0].pressure,100)
close(windowPressure({...balanced,hours:1},300)[0].pressure,0)
close(windowPressure({...balanced,hours:1},540)[0].pressure,400)
console.log('Signed pressure tests passed: negative, zero, positive, changed capacity, +400%.')

const heavy = {...defaults,hours:4,profile:'morning'}
close(windowPressure(heavy,360)[0].pressure,0) // 09–11 两小时，消耗一份
close(windowPressure(heavy,480)[1].pressure,25) // 13–18 五小时，下午仍按四小时一份
close(windowPressure({...heavy,end:900},420)[1].pressure,-50) // 13–15 两小时 = 半份
close(windowPressure({...heavy,end:900},660)[0].pressure,0) // 上午1h + 下午2h = 一份
close(simulate({...heavy,lunch:false},540).demand[720],100/240)
close(simulate({...heavy,lunch:false,profile:'afternoon'},540).demand[720],200/240)
close(simulate(heavy,540).demand[720],0)
close(simulate({...heavy,lunchStart:690,lunchEnd:810},540).demand[690],0)
console.log('Busy mode tests passed: doubled consumption, unchanged other half, mixed window, noon and custom lunch boundaries.')

const { activationGuard } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
assert.deepEqual(activationGuard(345),{start:45,end:345,startLabel:'00:45',endLabel:'05:45'})
assert.equal(activationGuard(255).startLabel,'前一天 23:15')
assert.equal(activationGuard(300).startLabel,'00:00')
assert.equal(activationGuard(0).startLabel,'前一天 19:00')
assert.ok(180+300>345) // 凌晨三点开启的新窗口会挡住05:45
console.log('Activation guard checks passed: same day, previous day, midnight boundary, conflicting window.')

close(windowPressure({...defaults,hours:1,profile:'morning'},360)[0].gapMinutes,90)
close(windowPressure({...defaults,hours:4,profile:'morning',end:900},660)[0].gapMinutes,0)
close(windowPressure({...defaults,hours:3,profile:'even'},360)[1].gapMinutes,60)
console.log('Gap minutes tests passed: double-speed depletion, lunch exclusion and no gap.')
