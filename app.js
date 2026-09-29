const API='https://api.taiwanlottery.com/TLCAPIWeB/Lottery/';
const CONFIG={
lotto649:{file:'lotto649.json',endpoint:'Lotto649Result',key:'lotto649Res',max:49,count:6,special:'特別號'},
superlotto638:{file:'superlotto638.json',endpoint:'SuperLotto638Result',key:'superLotto638Res',max:38,count:6,special:'第二區'},
daily539:{file:'daily539.json',endpoint:'Daily539Result',key:'daily539Res',max:39,count:5,special:null}
};
const descriptions={ensemble:'綜合最近 120 期頻率、最近 30 期頻率與遺漏期數，加權取樣 5 組。',hot:'依最近 120 期出現次數加權取樣。',overdue:'依最近 120 期未出現間隔加權取樣；久未出現不代表快開出。',trend:'依最近 30 期出現次數加權取樣。',balanced:'隨機取樣，奇偶與高低區數量差不超過 1。',cold:'依近兩年低頻號碼加權取樣。',carry:'以最新一期各號碼為條件，統計過去出現後「緊接下一期」各號碼的頻率，平均並平滑後加權取樣。主號與威力彩第二區分開分析；歷史關聯不是固定規律。',all7:'把綜合評分、熱門、遺漏、短期趨勢、均衡、冷門與號碼帶出 7 種分析一起加權，產生連貫分析 5 組。'};
let state={game:'lotto649',method:'ensemble',data:{},shown:12,syncing:false};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],pad=n=>String(n).padStart(2,'0');
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function cutoff(){const d=new Date(today()+'T00:00:00Z');d.setUTCFullYear(d.getUTCFullYear()-2);return d.toISOString().slice(0,10)}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>$('#toast').classList.remove('show'),2600)}
function valid(r,cfg){
if(!r||!/^\d{8,9}$/.test(r.period)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<cutoff()||r.date>today()||!Array.isArray(r.nums))return false;
const main=r.nums.slice(0,cfg.count),s=r.nums[cfg.count];
return r.nums.length===cfg.count+(cfg.special?1:0)&&new Set(main).size===cfg.count&&main.every(n=>Number.isInteger(n)&&n>=1&&n<=cfg.max)&&(!cfg.special||(Number.isInteger(s)&&s>=1&&s<=(cfg===CONFIG.superlotto638?8:49)&&(cfg!==CONFIG.lotto649||!main.includes(s))));
}
function merge(rows,cfg){return [...new Map(rows.filter(r=>valid(r,cfg)).map(r=>[r.period,r])).values()].sort((a,b)=>b.date.localeCompare(a.date)||b.period.localeCompare(a.period))}
function unwrap(raw,cfg){
if(raw.rtCode!==0||!Array.isArray(raw.content?.[cfg.key]))throw Error('Invalid response');
const rows=raw.content[cfg.key].map(r=>({period:String(r.period),date:r.lotteryDate.slice(0,10),nums:r.drawNumberSize||r.drawNumberAppear}));
if(rows.some(r=>r.date>=cutoff()&&r.date<=today()&&!valid(r,cfg)))throw Error('Invalid draw');
return merge(rows,cfg);
}
async function loadBundled(){await Promise.all(Object.entries(CONFIG).map(async([id,cfg])=>{
const raw=await fetch('data/'+cfg.file).then(r=>r.json());let saved=[];
try{const v=JSON.parse(localStorage.getItem('official-'+id)||'[]');if(Array.isArray(v))saved=v}catch{}
state.data[id]=merge([...unwrap(raw,cfg),...saved],cfg);
}))}
function parts(r,cfg){return {main:r.nums.slice(0,cfg.count),special:r.nums[cfg.count]}}
function balls(p,label,mini=false){const cls=mini?'mini':'ball';return p.main.map(n=>'<span class="'+cls+'">'+pad(n)+'</span>').join('')+(p.special?'<span class="'+cls+' special" data-label="'+label+'" aria-label="'+label+' '+p.special+'">'+pad(p.special)+'</span>':'')}
function stats(rows,cfg,limit){const use=rows.slice(0,limit),freq=Array(cfg.max+1).fill(0),gap=Array(cfg.max+1).fill(use.length);use.forEach((r,i)=>parts(r,cfg).main.forEach(n=>{freq[n]++;gap[n]=Math.min(gap[n],i)}));return {freq,gap}}
// Newest first: index i triggers the following draw at i-1, not the reverse.
function carryScores(rows,cfg,second=false){
const max=second?8:cfg.max,base=(second?1:cfg.count)/max,extract=r=>second?[r.nums[cfg.count]]:parts(r,cfg).main;
const triggers=rows.length?extract(rows[0]):[],scores=Array(max+1).fill(0);
for(const a of triggers){let samples=0;const hits=Array(max+1).fill(0);
for(let i=1;i<rows.length;i++)if(extract(rows[i]).includes(a)){samples++;extract(rows[i-1]).forEach(b=>hits[b]++)}
for(let b=1;b<=max;b++)scores[b]+=(hits[b]+5*base)/(samples+5)/triggers.length;
}return scores.map((v,i)=>i?Math.max(v,base/100):0);
}
function seeded(seed){let x=seed%2147483647||1;return()=>((x=x*48271%2147483647)-1)/2147483646}
function weightedPick(scores,count,rnd){const pool=scores.map((s,n)=>({n,s:Math.max(.00001,s)})).slice(1),out=[];while(out.length<count){let x=rnd()*pool.reduce((a,b)=>a+b.s,0),i=0;for(;i<pool.length-1&&x>pool[i].s;i++)x-=pool[i].s;out.push(pool.splice(i,1)[0].n)}return out.sort((a,b)=>a-b)}
function fiveGroups(rows,cfg,method){
if(rows.length<2)return [];
const {freq,gap}=stats(rows,cfg,120),short=stats(rows,cfg,30).freq,all=stats(rows,cfg,rows.length).freq,norm=a=>a.map(v=>v/Math.max(1,...a)),f=norm(freq),g=norm(gap),s=norm(short),a=norm(all);
const carry=carryScores(rows,cfg),carryNorm=norm(carry);
const scores=method==='carry'?carry:method==='all7'?Array.from({length:cfg.max+1},(_,n)=>n?(
  (.2+f[n]*1.35+s[n]*.9+g[n]*.75)+(.1+f[n]*3)+(.1+g[n]*3)+(.1+s[n]*3)+1+(.1+(1-a[n])*3)+(.1+carryNorm[n]*3)
)/7:0):Array.from({length:cfg.max+1},(_,n)=>method==='hot'?.1+f[n]*3:method==='cold'?.1+(1-a[n])*3:method==='overdue'?.1+g[n]*3:method==='trend'?.1+s[n]*3:method==='balanced'?1:.2+f[n]*1.35+s[n]*.9+g[n]*.75);
let second=Array(9).fill(1);
if(cfg===CONFIG.superlotto638){if(method==='carry')second=carryScores(rows,cfg,true);else if(method==='all7'){
  const recent=Array(9).fill(1),linked=carryScores(rows,cfg,true);rows.slice(0,80).forEach(r=>recent[r.nums[6]]++);const nr=norm(recent),nl=norm(linked);second=recent.map((_,n)=>n?.5+nr[n]+nl[n]:0);
}else rows.slice(0,80).forEach(r=>second[r.nums[6]]++)}
let seed=Number(rows[0].period);for(const ch of method)seed=(seed*31+ch.charCodeAt(0))%2147483647;
const rnd=seeded(seed),out=[],seen=new Set();
for(let attempt=0;out.length<5&&attempt<10000;attempt++){
const main=weightedPick(scores,cfg.count,rnd);
if(method==='balanced'||method==='all7'){const odd=main.filter(n=>n%2).length,low=main.filter(n=>n<=Math.floor(cfg.max/2)).length;if(Math.abs(2*odd-cfg.count)>1||Math.abs(2*low-cfg.count)>1)continue}
const special=cfg===CONFIG.superlotto638?weightedPick(second,1,rnd)[0]:null,key=main.join(',')+'|'+special;
if(!seen.has(key)){seen.add(key);out.push({main,special})}
}return out;
}
function renderHistory(){const cfg=CONFIG[state.game],all=state.data[state.game]||[];
$('#historyList').innerHTML=all.slice(0,state.shown).map(r=>'<div class="history-row"><div class="draw-meta"><strong>'+r.date+'</strong><small>第 '+r.period+' 期</small></div><div class="mini-balls">'+balls(parts(r,cfg),cfg.special,true)+'</div></div>').join('')||'<p>尚無資料</p>';
$('#moreBtn').hidden=state.shown>=all.length;
}
function generate(){const cfg=CONFIG[state.game],rows=state.data[state.game]||[],predictions=fiveGroups(rows,cfg,state.method);
$('#methodDesc').textContent=descriptions[state.method];
$('#predictionBalls').innerHTML=predictions.map((p,i)=>'<div class="prediction-group"><strong>第 '+(i+1)+' 組</strong><div class="balls">'+balls(p,'第二區')+'</div></div>').join('')||'<p>資料不足，請更新號碼。</p>';
$('#predictionStamp').textContent=rows.length?'依 '+rows.length+' 期資料・截至 '+rows[0].date+'・5 組無機率排名':'尚無資料';
}
function render(){const cfg=CONFIG[state.game],rows=state.data[state.game]||[],last=rows[0];
$$('.game-tab').forEach(b=>b.classList.toggle('active',b.dataset.game===state.game));
$('#latestInfo').textContent=last?'第 '+last.period+' 期・'+last.date:'尚無資料';
$('#latestBalls').innerHTML=last?balls(parts(last,cfg),cfg.special):'';
$('#rangeLabel').textContent=rows.length?rows.at(-1).date+' 至 '+last.date:'近 2 年';
renderHistory();generate();
}
async function syncOfficial(silent=false){
if(state.syncing)return;state.syncing=true;$('#syncBtn').disabled=true;$('#syncBtn').classList.add('loading');let failed=0;
for(const [id,cfg] of Object.entries(CONFIG)){try{
const url=API+cfg.endpoint+'?month='+cutoff().slice(0,7)+'&endMonth='+today().slice(0,7)+'&pageNum=1&pageSize=1000';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let raw;
try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP');raw=await response.json()}finally{clearTimeout(timer)}
const fresh=unwrap(raw,cfg);if(!fresh.length||raw.content.totalSize>1000)throw Error('Incomplete response');
state.data[id]=merge([...(state.data[id]||[]),...fresh],cfg);
try{localStorage.setItem('official-'+id,JSON.stringify(state.data[id]))}catch{}
}catch{failed++}}
$('#sourceLabel').textContent=failed?'部分更新失敗・保留既有資料':'官方資料・已更新';
state.syncing=false;$('#syncBtn').disabled=false;$('#syncBtn').classList.remove('loading');render();
if(!silent)toast(failed?'部分更新失敗，請稍後重試':'官方號碼及分析已更新');
}
// UI
$$('.game-tab').forEach(b=>b.addEventListener('click',()=>{state.game=b.dataset.game;state.shown=12;render()}));
$$('.method').forEach(b=>b.addEventListener('click',()=>{$$('.method').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-checked',String(x===b))});state.method=b.dataset.method;generate()}));
$('#predictBtn').addEventListener('click',generate);
$('#syncBtn').addEventListener('click',()=>syncOfficial());
$('#moreBtn').addEventListener('click',()=>{state.shown+=20;renderHistory()});
loadBundled().then(()=>{render();syncOfficial(true)}).catch(()=>{toast('內建資料載入失敗，嘗試官方更新');syncOfficial(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncOfficial(true)});
setInterval(()=>{if(!document.hidden)syncOfficial(true)},300000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
