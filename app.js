const { createApp } = Vue;

createApp({
  data(){return{rows:[],loading:true,error:'',status:'delivered',year:'all',period:'24',topN:8,rankMode:'qty',category:'all',tooltip:null}},
  computed:{
    latestMonth(){return d3.timeMonth(d3.max(this.rows,r=>r.date)||new Date())},
    periodStart(){return d3.timeMonth.offset(this.latestMonth,-23)},
    currentKpis(){const f=this.filtered.filter(r=>+d3.timeMonth(r.date)===+this.latestMonth);return {orders:new Set(f.map(r=>r.order_id)).size,spend:d3.sum(f,r=>r.amount),discount:d3.mean(f,r=>r.discount)||0}},
    monthLabel(){return d3.timeFormat('%m.%Y')(this.latestMonth)},
    years(){return [...new Set(this.rows.map(r=>r.date.getFullYear()))].sort((a,b)=>a-b)},
    filtered(){return this.rows.filter(r=>{
      const statusOk=this.status==='all'||(this.status==='delivered'?r.status==='доставлен':r.status==='отменен');
      const yearOk=this.year==='all'||r.date.getFullYear()===+this.year;
      const catOk=this.category==='all'||r.category===this.category;
      return statusOk&&yearOk&&catOk&&(this.period==='all'||r.date>=this.periodStart);
    })},
    baseFiltered(){return this.rows.filter(r=>{const statusOk=this.status==='all'||(this.status==='delivered'?r.status==='доставлен':r.status==='отменен'); const yearOk=this.year==='all'||r.date.getFullYear()===+this.year; return statusOk&&yearOk&&(this.period==='all'||r.date>=this.periodStart)})},
    kpis(){const f=this.filtered; return {orders:new Set(f.map(r=>r.order_id)).size,spend:d3.sum(f,r=>r.amount),discount:d3.mean(f,r=>r.discount)||0}},
    monthly(){const map=d3.rollup(this.filtered,v=>({spend:d3.sum(v,d=>d.amount),orders:new Set(v.map(d=>d.order_id)).size,discount:d3.mean(v,d=>d.discount)||0}),d=>+d3.timeMonth(d.date));const start=this.period==='24'?this.periodStart:d3.timeMonth(d3.min(this.rows,r=>r.date)||this.latestMonth);return d3.timeMonth.range(start,d3.timeMonth.offset(this.latestMonth,1)).filter(date=>this.year==='all'||date.getFullYear()===+this.year).map(date=>({...map.get(+date)||{spend:0,orders:0,discount:null},date}))},
    rankedItems(){const map=d3.rollup(this.filtered,v=>({qty:d3.sum(v,d=>d.quantity),spend:d3.sum(v,d=>d.amount),category:(String(v[0].category||'Без категории').trim()||'Без категории')}),d=>d.item_name); const arr=[...map].map(([item_name,v])=>({item_name,...v,image:window.IMAGE_MAP?.[item_name]||'items/placeholder.svg',hasImage:!!window.IMAGE_MAP?.[item_name]&&window.IMAGE_MAP[item_name]!=='items/placeholder.svg'})); arr.sort((a,b)=>this.rankMode==='qty'?b.qty-a.qty:b.spend-a.spend); return arr.slice(0,Number(this.topN)||8)},
    maxItemQty(){return d3.max(this.rankedItems,r=>r.qty)||1},
    maxItemSpend(){return d3.max(this.rankedItems,r=>r.spend)||1},
    categories(){const map=d3.rollup(this.baseFiltered,v=>({qty:d3.sum(v,d=>d.quantity),spend:d3.sum(v,d=>d.amount),orders:new Set(v.map(d=>d.order_id)).size}),d=>(String(d.category||'Без категории').trim()||'Без категории')); return [...map].map(([name,v])=>({name,...v})).sort((a,b)=>b.spend-a.spend)},
    totalCategorySpend(){return d3.sum(this.baseFiltered,d=>d.amount)},
    maxCatSpend(){return d3.max(this.categories,c=>c.spend)||1}
  },
  watch:{period(){this.$nextTick(this.draw)},status(){this.category='all';this.$nextTick(this.draw)},year(){this.category='all';this.$nextTick(this.draw)},category(){this.$nextTick(this.draw)}},
  async mounted(){
    try{const text=await fetch('data.csv').then(r=>{if(!r.ok)throw new Error('Не удалось загрузить data.csv');return r.text()});
      const parsed=(window.Papa?Papa.parse(text,{header:true,skipEmptyLines:true,dynamicTyping:false}).data:d3.csvParse(text));
      const parseDate=d3.timeParse('%Y-%m-%d');
      this.rows=parsed.filter(r=>r.order_id && r.order_date).map(r=>{
        const date=parseDate(r.order_date) || new Date(r.order_date);
        const num=(value)=>{if(value==null||String(value).trim()==='')return NaN; const n=Number(String(value).replace(/\s/g,'').replace(',','.')); return n};
        const quantity=num(r.quantity)||1;
        const discounted=num(r.price_discounted);
        const price=num(r.price)||0;
        const rawAmount=num(r.amount);
        const amount=Number.isFinite(rawAmount) && r.amount.trim()!=='' ? rawAmount : ((Number.isFinite(discounted)&&r.price_discounted.trim()!=='')?discounted:price)*quantity;
        return {...r,date, status:String(r.status||'').trim().toLowerCase().replace('ё','е'), price, price_discounted:Number.isFinite(discounted)?discounted:price, discount:num(r.discount)||0, quantity, amount};
      }).filter(r=>r.date instanceof Date && !Number.isNaN(r.date.getTime()));
      if(!this.rows.length) throw new Error('CSV загрузился, но строки не распознаны. Проверьте, что data.csv находится рядом с index.html.');
      this.loading=false; this.$nextTick(()=>this.draw());
    }catch(e){this.loading=false;this.error=(e.message||String(e))+' Убедитесь, что сервер запущен из папки проекта и открыт адрес http://localhost:8000.'}
  },
  methods:{
    fmtInt(v){return new Intl.NumberFormat('ru-RU').format(Math.round(v||0))},
    fmtMoney(v){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(v||0)+' ₽'},
    fmtPct(v){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(v||0)},
    onImgError(e){e.target.classList.remove('has-image');e.target.src='items/placeholder.svg'},
    draw(){if(this.loading)return; this.hideTip(); this.drawSpend(); this.drawOrders(); this.drawDiscount()},
    setup(sel){sel.selectAll('*').remove(); const node=sel.node(); const w=node.clientWidth||600,h=node.clientHeight||280; const m={top:14,right:18,bottom:38,left:54}; return {w,h,m,svg:d3.select(node).append('svg').attr('viewBox',`0 0 ${w} ${h}`)}} ,
    drawSpend(){
      const data=this.monthly, {w,h,m,svg}=this.setup(d3.select('#spendChart'));
      m.right=54; m.top=30;
      if(!data.length){d3.select('#spendChart').html('<div class="empty">Нет данных</div>');return}
      const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,w-m.right]);
      const y=d3.scaleLinear().domain([0,(d3.max(data,d=>d.spend)||1)*1.12]).nice().range([h-m.bottom,m.top]);
      const yOrders=d3.scaleLinear().domain([0,(d3.max(data,d=>d.orders)||1)*1.12]).nice().range([h-m.bottom,m.top]);
      svg.append('g').attr('class','axis orders-axis').attr('transform',`translate(${w-m.right},0)`).call(d3.axisRight(yOrders).ticks(5).tickFormat(d3.format('d')));
      svg.append('text').attr('x',m.left).attr('y',14).attr('class','axis-title spend-axis-title').text('Траты, ₽');
      svg.append('text').attr('x',w-m.right).attr('y',14).attr('text-anchor','end').attr('class','axis-title orders-axis-title').text('Заказы, шт.');
      svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).ticks(Math.min(8,data.length)).tickFormat(d3.timeFormat('%b %Y')));
      svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>d3.format('~s')(d)));
      svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('class','gridline').attr('x1',m.left).attr('x2',w-m.right).attr('y1',d=>y(d)).attr('y2',d=>y(d));
      const area=d3.area().x(d=>x(d.date)).y0(h-m.bottom).y1(d=>y(d.spend)).curve(d3.curveMonotoneX);
      const line=d3.line().x(d=>x(d.date)).y(d=>y(d.spend)).curve(d3.curveMonotoneX);
      svg.append('path').datum(data).attr('class','area').attr('d',area);
      svg.append('path').datum(data).attr('class','line-main').attr('d',line);
      const ordersLine=d3.line().x(d=>x(d.date)).y(d=>yOrders(d.orders)).curve(d3.curveMonotoneX);
      svg.append('path').datum(data).attr('class','line-orders').attr('d',ordersLine);
      const orderPoints=svg.append('g').selectAll('circle').data(data).join('circle').attr('class','dot-orders').attr('r',3).attr('cx',d=>x(d.date)).attr('cy',d=>yOrders(d.orders));
      const points=svg.append('g').attr('class','spend-points').selectAll('circle').data(data).join('circle').attr('class','dot').attr('r',4).attr('cx',d=>x(d.date)).attr('cy',d=>y(d.spend));
      const focus=svg.append('g').style('display','none').attr('class','chart-focus').style('pointer-events','none');
      focus.append('line').attr('class','focus-line').attr('y1',m.top).attr('y2',h-m.bottom).attr('stroke','#8b8be8').attr('stroke-dasharray','4 4');
      focus.append('circle').attr('class','focus-point').attr('r',7).attr('fill','#5b5bd6').attr('stroke','#fff').attr('stroke-width',3);
      focus.append('circle').attr('class','focus-order-point').attr('r',6).attr('fill','#dc7a18').attr('stroke','#fff').attr('stroke-width',3);
      const label=focus.append('text').attr('class','focus-label').attr('text-anchor','middle').attr('font-size',12).attr('font-weight',800).attr('fill','#3535a8').attr('paint-order','stroke').attr('stroke','#fff').attr('stroke-width',4).attr('stroke-linejoin','round');
      const bisect=d3.bisector(d=>d.date).center;
      svg.append('rect').attr('class','chart-hover-overlay').attr('x',m.left).attr('y',m.top).attr('width',Math.max(0,w-m.left-m.right)).attr('height',Math.max(0,h-m.top-m.bottom)).attr('fill','transparent').style('cursor','crosshair')
        .on('pointerenter',()=>focus.style('display',null))
        .on('pointermove',(ev)=>{const [px]=d3.pointer(ev,svg.node()); const idx=Math.max(0,Math.min(data.length-1,bisect(data,x.invert(px)))); const d=data[idx], cx=x(d.date), cy=y(d.spend); focus.select('line').attr('x1',cx).attr('x2',cx); focus.select('.focus-point').attr('cx',cx).attr('cy',cy); focus.select('.focus-order-point').attr('cx',cx).attr('cy',yOrders(d.orders)); label.attr('x',Math.max(m.left+45,Math.min(w-m.right-45,cx))).attr('y',Math.max(m.top+14,cy-14)).text(this.fmtMoney(d.spend)); points.attr('r',(p,i)=>i===idx?0:4); orderPoints.attr('r',(p,i)=>i===idx?0:3); this.showTip(ev,`${d3.timeFormat('%B %Y')(d.date)}<br><b>${this.fmtMoney(d.spend)}</b><br>${this.fmtInt(d.orders)} заказов`);})
        .on('pointerleave',()=>{focus.style('display','none');points.attr('r',4);orderPoints.attr('r',3);this.hideTip()});
    },
    drawOrders(){const data=this.monthly, {w,h,m,svg}=this.setup(d3.select('#ordersChart')); if(!data.length){d3.select('#ordersChart').html('<div class="empty">Нет данных</div>');return} const x=d3.scaleBand().domain(data.map(d=>+d.date)).range([m.left,w-m.right]).padding(.25); const y=d3.scaleLinear().domain([0,(d3.max(data,d=>d.orders)||1)*1.15]).nice().range([h-m.bottom,m.top]); svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).tickValues(data.filter((d,i)=>i%Math.max(1,Math.ceil(data.length/8))===0).map(d=>+d.date)).tickFormat(d=>d3.timeFormat('%b %y')(new Date(d)))); svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d'))); svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('class','gridline').attr('x1',m.left).attr('x2',w-m.right).attr('y1',d=>y(d)).attr('y2',d=>y(d)); svg.append('g').selectAll('rect').data(data).join('rect').attr('class','bar').attr('x',d=>x(+d.date)).attr('y',d=>y(d.orders)).attr('width',x.bandwidth()).attr('height',d=>h-m.bottom-y(d.orders)).on('mousemove',(ev,d)=>this.showTip(ev,`${d3.timeFormat('%B %Y')(d.date)}<br>${this.fmtInt(d.orders)} заказов`)).on('mouseleave',this.hideTip)},
    drawDiscount(){const data=this.monthly,{w,h,m,svg}=this.setup(d3.select('#discountChart'));if(!data.some(d=>d.discount!==null)){d3.select('#discountChart').html('<div class="empty">Нет данных</div>');return}const x=d3.scaleTime().domain(d3.extent(data,d=>d.date)).range([m.left,w-m.right]),y=d3.scaleLinear().domain([0,(d3.max(data,d=>d.discount)||1)*1.15]).nice().range([h-m.bottom,m.top]);svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.bottom})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.timeFormat('%m.%y')));svg.append('g').attr('class','axis').attr('transform',`translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>d+'%'));svg.append('path').datum(data).attr('class','line-main').attr('d',d3.line().defined(d=>d.discount!==null).x(d=>x(d.date)).y(d=>y(d.discount)));svg.selectAll('circle').data(data.filter(d=>d.discount!==null)).join('circle').attr('class','dot').attr('r',5).attr('cx',d=>x(d.date)).attr('cy',d=>y(d.discount)).on('mousemove',(ev,d)=>this.showTip(ev,`${d3.timeFormat('%m.%Y')(d.date)}<br>Средняя скидка: ${this.fmtPct(d.discount)}%`)).on('mouseleave',this.hideTip)},
    escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},
    showItemTip(ev,item){const rows=this.filtered.filter(r=>r.item_name===item.item_name);const prices=[...d3.rollup(rows,v=>d3.sum(v,r=>r.amount)/d3.sum(v,r=>r.quantity),r=>+d3.timeMonth(r.date))].sort((a,b)=>a[0]-b[0]);if(!prices.length)return;const x=d3.scaleTime().domain(d3.extent(prices,d=>d[0])).range([12,268]),extent=d3.extent(prices,d=>d[1]),y=d3.scaleLinear().domain([Math.max(0,extent[0]*.9),extent[1]*1.1||1]).range([72,12]);const line=d3.line().x(d=>x(d[0])).y(d=>y(d[1]))(prices);const dots=prices.map(d=>`<circle cx="${x(d[0])}" cy="${y(d[1])}" r="3" fill="#b4b4ff"><title>${d3.timeFormat('%m.%Y')(new Date(d[0]))}: ${this.fmtMoney(d[1])}</title></circle>`).join('');this.showTip(ev,`<b>${this.escapeHtml(item.item_name)}</b><br>${this.escapeHtml(item.category)}<br>${this.fmtInt(item.qty)} шт. · ${this.fmtMoney(item.spend)}<br>Цена за единицу: ${this.fmtMoney(prices[0][1])} → ${this.fmtMoney(prices.at(-1)[1])}<br><svg width="280" height="84" role="img" aria-label="Динамика средней цены"><path d="${line}" fill="none" stroke="#b4b4ff" stroke-width="2"/>${dots}</svg><br>${d3.timeFormat('%m.%Y')(new Date(prices[0][0]))} — ${d3.timeFormat('%m.%Y')(new Date(prices.at(-1)[0]))}<br>Средняя фактическая цена по месяцам`);},
    showTip(ev,html){this.tooltip={x:Math.max(8,Math.min((ev.clientX??ev.target?.getBoundingClientRect().left??8)+12,window.innerWidth-310)),y:Math.max(8,Math.min((ev.clientY??ev.target?.getBoundingClientRect().top??8)+12,window.innerHeight-250)),html}},hideTip(){this.tooltip=null}
  }
}).mount('#app');
