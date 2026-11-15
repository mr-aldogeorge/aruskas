/* ARUS — Modul Aset & Persediaan (add-on, tidak mengubah fitur kas)
   Pasang: <script src="aset.js"></script> tepat sebelum </body> di index.html
   (atau tempel isinya di dalam <script> baru setelah script utama). */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const rp=n=>fmtRp(n);
const KOND=['Baik','Rusak Ringan','Rusak Berat'];
const KAT={Elektronik:4,Perabot:8,Kendaraan:8,Peralatan:4,Bangunan:20,Tanah:0,Lainnya:4,Pakaian:2,Perhiasan:0}; // umur manfaat (tahun); 0 = tidak disusutkan
const CARA=[['beli','Beli'],['hibah','Hibah'],['lain','Lainnya / saldo awal']];
const S={assets:[],stock:[],moves:[],audits:[],tab:'aset',q:'',cf:'all',draft:{},form:null,loaded:false};
const A=window.ASET={};
const cap=()=>+localStorage.getItem('arus_aset_cap')||1000000;
const upsert=(arr,it)=>{const i=arr.findIndex(x=>x.id===it.id);if(i<0)arr.push(it);else arr[i]=it;};
const kv=(k,v)=>`<div class="list-row"><div class="l">${k}</div><div class="r">${v}</div></div>`;
const fld=(l,h)=>`<label class="field">${l}</label>${h}`;
const opts=(arr,sel)=>arr.map(x=>`<option${x===sel?' selected':''}>${x}</option>`).join('');
const accOpts=()=>STATE.accounts.map(a=>`<option value="${a.id}">${a.icon} ${esc(a.name)}</option>`).join('');

// Pembelian aset/persediaan diberi tanda [ASET] pada catatan: saldo kas tetap berkurang,
// tetapi tidak dihitung sebagai pengeluaran bulanan (bukan beban).
const _tim=txInMonth;
window.txInMonth=m=>_tim(m).filter(t=>!(t.note||'').startsWith('[ASET]'));

// ---------- perhitungan nilai buku (garis lurus, per bulan penuh sejak tanggal perolehan) ----------
function mon(from,to){const a=new Date(from+'T00:00:00'),b=new Date(to+'T00:00:00');let m=(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth();if(b.getDate()<a.getDate())m--;return Math.max(0,m);}
function calc(a){
  const cost=+a.cost||0;
  if(!a.kapital) return {cost,acc:0,book:0,pm:0};
  const life=+a.life||0,res=+a.res||0;
  if(a.kat==='Tanah'||!life) return {cost,acc:0,book:cost,pm:0};
  const dep=Math.max(0,cost-res),pm=dep/(life*12);
  const acc=Math.min(dep,pm*mon(a.date,a.keluar||todayLocalStr()));
  return {cost,acc,book:cost-acc,pm};
}

// ---------- API ----------
async function load(){
  try{const d=await apiPost('aset_get',{});S.assets=d.assets||[];S.stock=d.stock||[];S.moves=d.moves||[];S.audits=d.audits||[];S.loaded=true;render();}
  catch(e){toast('Gagal memuat aset: '+e.message);}
}
const put=(kind,items)=>apiPost('aset_put',{kind,items:[].concat(items)});
async function capCat(){
  const f=()=>STATE.categories.find(x=>x.type==='expense'&&x.name==='Pembelian Aset');
  if(!f()){await apiPost('addCategory',{name:'Pembelian Aset',icon:'🏷️',type:'expense'});await loadAll();}
  return f()&&f().id;
}
function shrink(file){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>{const r=Math.min(1,1024/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(im.src);ok(c.toDataURL('image/jpeg',.72).split(',')[1]);};im.onerror=no;im.src=URL.createObjectURL(file);});}
function pick(cb){
  const i=document.createElement('input');i.type='file';i.accept='image/*';
  i.onchange=async()=>{const f=i.files[0];if(!f)return;toast('Mengunggah foto…');
    try{const r=await apiPost('aset_photo',{name:'f'+Date.now(),data:await shrink(f)});cb(r.url);toast('Foto tersimpan');}
    catch(e){toast('Gagal unggah: '+e.message);}};
  i.click();
}
const sheet=h=>{$('aset-sheet-body').innerHTML='<div class="sheet-handle"></div>'+h;$('aset-sheet').classList.add('open');};
A.close=()=>$('aset-sheet').classList.remove('open');

// ---------- navigasi ----------
A.open=()=>{document.body.classList.add('aset-mode');showOnly('screen-aset');window.scrollTo(0,0);if(!S.loaded)load();render();};
A.exit=()=>{document.body.classList.remove('aset-mode');A.close();goTo('home');};
A.tab=t=>{S.tab=t;if(t==='cek')S.draft={};render();window.scrollTo(0,0);};

function render(){
  document.querySelectorAll('#aset-nav [data-t]').forEach(e=>e.classList.toggle('on',e.dataset.t===S.tab));
  const v={aset:vAset,stok:vStok,neraca:vNeraca,cek:vCek}[S.tab]();
  const ttl={aset:'Aset Tetap',stok:'Persediaan',neraca:'Neraca',cek:'Inventarisasi'}[S.tab];
  $('aset-root').innerHTML=`<div class="top"><h1>${ttl}</h1><span style="color:var(--text-muted);font-size:12.5px;">per ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</span></div>`+v;
  if(S.tab==='aset')lstAset();
}

// ---------- ASET ----------
function vAset(){
  const act=S.assets.filter(a=>!a.keluar),book=act.filter(a=>a.kapital).reduce((s,a)=>s+calc(a).book,0);
  return `<div class="grid2"><div class="card"><div class="lab">Jumlah barang</div><div class="val num">${act.length}</div></div><div class="card"><div class="lab">Total nilai buku</div><div class="val num">${rp(book)}</div></div></div>
  <button class="btn btn-primary" onclick="ASET.form()">＋ Tambah Aset</button>
  <input type="text" placeholder="🔍 Cari barang…" value="${esc(S.q)}" oninput="ASET.search(this.value)" style="margin:14px 0 10px;">
  <div class="filter-row">${['all',...KOND].map(k=>`<div class="chip ${S.cf===k?'active':''}" onclick="ASET.cf('${k}')">${k==='all'?'Semua':k}</div>`).join('')}</div>
  <div id="as-list"></div>`;
}
A.search=v=>{S.q=v;lstAset();};
A.cf=k=>{S.cf=k;render();};
function lstAset(){
  const q=S.q.toLowerCase(),L=S.assets.filter(a=>!a.keluar&&(S.cf==='all'||a.kond===S.cf)&&(!q||(a.name+' '+(a.lokasi||'')+' '+a.kat).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name));
  $('as-list').innerHTML=L.length?L.map(a=>{const c=calc(a);
    return `<div class="tx-item" onclick="ASET.detail('${a.id}')">${thumb(a)}<div class="mid"><div class="t1">${esc(a.name)}</div><div class="t2">${esc(a.kat)}${a.lokasi?' • '+esc(a.lokasi):''}</div><span class="as-b k${KOND.indexOf(a.kond)}">${a.kond}</span></div><div class="amt">${a.kapital?rp(c.book):'<small style="color:var(--text-muted)">Non-kapital</small>'}</div></div>`;}).join('')
    :'<div class="empty">Belum ada barang.</div>';
}
const thumb=a=>a.fotos&&a.fotos[0]?`<img class="as-thumb" src="${esc(a.fotos[0])}" loading="lazy">`:'<div class="as-thumb">📦</div>';

A.detail=id=>{
  const a=S.assets.find(x=>x.id===id);if(!a)return;const c=calc(a);
  const gal=(a.fotos||[]).map(u=>`<img class="as-big" src="${esc(u)}" onclick="window.open(this.src,'_blank')">`).join('');
  sheet(`<h2>${esc(a.name)}</h2><div class="sub">${esc(a.kat)}${a.lokasi?' • '+esc(a.lokasi):''}</div>
  <div class="as-gal">${gal||'<div class="as-thumb" style="width:100%;height:90px">📦 Belum ada foto</div>'}</div>
  <button class="btn btn-ghost" style="margin:10px 0 14px;" onclick="ASET.photoTo('${a.id}')">📷 Tambah Foto Terbaru</button>
  <div class="toggle-row">${KOND.map(k=>`<div class="opt ${a.kond===k?'active '+(k==='Baik'?'income':'expense'):''}" onclick="ASET.kond('${a.id}','${k}')">${k}</div>`).join('')}</div>
  ${a.kond==='Rusak Berat'?'<div class="sub" style="margin-top:8px;color:var(--danger)">Pertimbangkan mengeluarkan barang ini dari daftar.</div>':''}
  <div class="settings-block" style="margin-top:16px;">
  ${kv('Tanggal perolehan',new Date(a.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}))}
  ${kv('Cara perolehan',esc((CARA.find(x=>x[0]===a.cara)||[0,'-'])[1]))}
  ${kv('Nilai perolehan (kapitalisasi)',rp(c.cost))}
  ${a.kapital?kv('Penyusutan / bulan',rp(c.pm))+kv('Akumulasi penyusutan',rp(c.acc))+kv('<b>Nilai buku hari ini</b>','<b>'+rp(c.book)+'</b>'):kv('Status','Di bawah batas kapitalisasi — tidak masuk neraca')}
  ${a.lastCheck?kv('Terakhir dicek',a.lastCheck):''}
  </div>
  ${(a.hist||[]).length?'<div class="section-title">Riwayat kondisi</div><div class="settings-block">'+a.hist.slice(-6).reverse().map(h=>kv(h.d,esc(h.f)+' → '+esc(h.t))).join('')+'</div>':''}
  <div class="btn-row"><button class="btn btn-ghost" onclick="ASET.form('${a.id}')">Edit</button><button class="btn btn-ghost" onclick="ASET.out('${a.id}')">Keluarkan</button></div>
  <div class="btn-row" style="margin-top:10px;"><button class="btn btn-danger" onclick="ASET.del('${a.id}')">Hapus</button></div>`);
};
A.kond=async(id,k)=>{
  const a=S.assets.find(x=>x.id===id);if(!a||a.kond===k)return;
  a.hist=(a.hist||[]).concat({d:todayLocalStr(),f:a.kond,t:k});a.kond=k;
  try{await put('aset',a);A.detail(id);render();}catch(e){toast('Gagal: '+e.message);}
};
A.photoTo=id=>pick(async u=>{const a=S.assets.find(x=>x.id===id);a.fotos=[u].concat(a.fotos||[]);await put('aset',a);A.detail(id);render();});
A.out=async id=>{
  if(!confirm('Keluarkan barang dari daftar (dijual/dibuang/hilang)? Nilainya tidak lagi masuk neraca.'))return;
  const a=S.assets.find(x=>x.id===id);a.keluar=todayLocalStr();
  try{await put('aset',a);A.close();render();toast('Barang dikeluarkan');}catch(e){toast('Gagal: '+e.message);}
};
A.del=async id=>{
  if(!confirm('Hapus permanen? Transaksi kas pembelian tidak ikut terhapus.'))return;
  try{await apiPost('aset_del',{kind:'aset',id});S.assets=S.assets.filter(x=>x.id!==id);A.close();render();}catch(e){toast('Gagal: '+e.message);}
};

const strip=()=>S.form.fotos.map(u=>`<img class="as-thumb" src="${esc(u)}">`).join('')+'<div class="as-thumb" style="cursor:pointer;border:1px dashed var(--line)" onclick="ASET.fpick()">📷</div>';
A.fpick=()=>pick(u=>{S.form.fotos.unshift(u);$('af-fotos').innerHTML=strip();});
A.form=id=>{
  const a=id?S.assets.find(x=>x.id===id):{};
  S.form={id:id||null,fotos:[...(a.fotos||[])]};
  const kat=a.kat||'Elektronik',cara=a.cara||'beli';
  sheet(`<h2>${id?'Edit Aset':'Aset Baru'}</h2><div class="sub">Batas kapitalisasi: ${rp(cap())}. Di bawahnya tidak masuk neraca.</div>
  <div class="icon-pick" id="af-fotos" style="gap:10px">${strip()}</div>
  ${fld('Nama barang','<input type="text" id="af-name" value="'+esc(a.name)+'" placeholder="Contoh: Laptop Lenovo">')}
  ${fld('Kategori','<select id="af-kat" onchange="ASET.katChg()">'+opts(Object.keys(KAT),kat)+'</select>')}
  ${fld('Lokasi (opsional)','<input type="text" id="af-lokasi" value="'+esc(a.lokasi)+'" placeholder="Contoh: Ruang kerja">')}
  ${fld('Tanggal perolehan','<input type="date" id="af-date" value="'+(a.date||todayLocalStr())+'">')}
  ${fld('Cara perolehan','<select id="af-cara" onchange="ASET.caraChg()">'+CARA.map(c=>`<option value="${c[0]}"${c[0]===cara?' selected':''}>${c[1]}</option>`).join('')+'</select>')}
  ${fld('Harga beli / nilai wajar hibah (Rp)','<input type="number" id="af-nilai" inputmode="numeric" value="'+(a.nilai||'')+'">')}
  ${fld('Biaya tambahan: ongkir, pemasangan (Rp)','<input type="number" id="af-extra" inputmode="numeric" value="'+(a.extra||'')+'">')}
  ${fld('Umur manfaat (tahun, 0 = tidak disusutkan)','<input type="number" id="af-life" inputmode="numeric" value="'+(a.life!=null?a.life:KAT[kat])+'">')}
  ${fld('Nilai residu (Rp)','<input type="number" id="af-res" inputmode="numeric" value="'+(a.res||0)+'">')}
  ${fld('Kondisi','<select id="af-kond">'+opts(KOND,a.kond||'Baik')+'</select>')}
  <div id="af-accbox" style="display:${!id&&cara==='beli'?'block':'none'}">${fld('Bayar dari akun','<select id="af-acc"><option value="">Jangan catat ke kas</option>'+accOpts()+'</select>')}</div>
  <button class="btn btn-primary" id="af-save" style="margin-top:22px;" onclick="ASET.save()">Simpan</button>`);
  if(!id&&STATE.accounts[0])$('af-acc').value=STATE.accounts[0].id;
};
A.katChg=()=>{$('af-life').value=KAT[$('af-kat').value];};
A.caraChg=()=>{$('af-accbox').style.display=(!S.form.id&&$('af-cara').value==='beli')?'block':'none';};
A.save=async()=>{
  const g=i=>$('af-'+i).value,name=g('name').trim(),nilai=+g('nilai')||0,extra=+g('extra')||0;
  if(!name||nilai<=0){toast('Isi nama dan nilai');return;}
  const old=S.form.id?S.assets.find(x=>x.id===S.form.id):null,cost=nilai+extra;
  const a=Object.assign({hist:[]},old||{},{id:old?old.id:uid(),name,kat:g('kat'),lokasi:g('lokasi').trim(),date:g('date')||todayLocalStr(),cara:g('cara'),nilai,extra,cost,life:+g('life')||0,res:+g('res')||0,kond:g('kond'),fotos:S.form.fotos,kapital:cost>=cap()});
  if(old&&old.kond!==a.kond)a.hist=(old.hist||[]).concat({d:todayLocalStr(),f:old.kond,t:a.kond});
  $('af-save').disabled=true;
  try{
    const acc=old?'':g('acc');
    if(!old&&a.cara==='beli'&&acc){
      await apiPost('addTransaction',{type:'expense',amount:cost,date:a.date,accountId:acc,categoryId:await capCat(),note:(a.kapital?'[ASET] ':'')+name});
    }
    await put('aset',a);upsert(S.assets,a);A.close();await loadAll();render();toast('Tersimpan');
  }catch(e){toast('Gagal: '+e.message);$('af-save').disabled=false;}
};

// ---------- PERSEDIAAN ----------
const stokNilai=s=>(+s.qty||0)*(+s.avg||0);
function vStok(){
  const tot=S.stock.reduce((x,s)=>x+stokNilai(s),0);
  return `<div class="grid2"><div class="card"><div class="lab">Jenis barang</div><div class="val num">${S.stock.length}</div></div><div class="card"><div class="lab">Nilai persediaan</div><div class="val num">${rp(tot)}</div></div></div>
  <button class="btn btn-primary" onclick="ASET.sform()">＋ Tambah Persediaan</button><div style="height:14px"></div>`+
  (S.stock.length?S.stock.map(s=>`<div class="tx-item" onclick="ASET.sd('${s.id}')">${thumb(s)}<div class="mid"><div class="t1">${esc(s.name)}</div><div class="t2">${+(+s.qty).toFixed(2)} ${esc(s.unit)} • @ ${rp(s.avg)}</div></div><div class="amt">${rp(stokNilai(s))}</div></div>`).join(''):'<div class="empty">Belum ada persediaan.</div>');
}
A.sform=()=>{
  S.form={id:null,fotos:[]};
  sheet(`<h2>Persediaan Baru</h2><div class="icon-pick" id="af-fotos" style="gap:10px">${strip()}</div>
  ${fld('Nama barang','<input type="text" id="sf-name" placeholder="Contoh: Kertas A4">')}
  ${fld('Satuan','<input type="text" id="sf-unit" value="pcs">')}
  ${fld('Jumlah awal','<input type="number" id="sf-qty" inputmode="decimal">')}
  ${fld('Harga satuan (Rp)','<input type="number" id="sf-price" inputmode="numeric">')}
  ${fld('Tanggal','<input type="date" id="sf-date" value="'+todayLocalStr()+'">')}
  ${fld('Cara perolehan','<select id="sf-cara" onchange="$(\'sf-accbox\').style.display=this.value===\'beli\'?\'block\':\'none\'">'+CARA.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')+'</select>')}
  <div id="sf-accbox">${fld('Bayar dari akun','<select id="sf-acc"><option value="">Jangan catat ke kas</option>'+accOpts()+'</select>')}</div>
  <button class="btn btn-primary" id="sf-save" style="margin-top:22px;" onclick="ASET.ssave()">Simpan</button>`);
  if(STATE.accounts[0])$('sf-acc').value=STATE.accounts[0].id;
};
window.$=$; // dipakai handler inline di form persediaan
async function applyMove(s,m,acc){
  if(m.type==='in'){const nv=s.qty*s.avg+m.qty*m.price;s.qty+=m.qty;s.avg=s.qty?nv/s.qty:0;
    if(m.cara==='beli'&&acc)await apiPost('addTransaction',{type:'expense',amount:Math.round(m.qty*m.price),date:m.date,accountId:acc,categoryId:await capCat(),note:'[ASET] Stok: '+s.name});}
  else{if(m.qty>s.qty)throw new Error('Stok tidak cukup');m.price=s.avg;s.qty-=m.qty;}
  await put('stok',s);await put('mutasi',m);upsert(S.stock,s);upsert(S.moves,m);
}
A.ssave=async()=>{
  const name=$('sf-name').value.trim(),qty=+$('sf-qty').value,price=+$('sf-price').value||0;
  if(!name||qty<=0){toast('Isi nama dan jumlah');return;}
  const s={id:uid(),name,unit:$('sf-unit').value.trim()||'pcs',qty:0,avg:0,fotos:S.form.fotos};
  const m={id:uid(),sid:s.id,date:$('sf-date').value||todayLocalStr(),type:'in',qty,price,cara:$('sf-cara').value};
  $('sf-save').disabled=true;
  try{await applyMove(s,m,$('sf-acc').value);A.close();await loadAll();render();toast('Tersimpan');}catch(e){toast('Gagal: '+e.message);$('sf-save').disabled=false;}
};
A.sd=id=>{
  const s=S.stock.find(x=>x.id===id);if(!s)return;
  const mv=S.moves.filter(m=>m.sid===id).sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id)).slice(0,10);
  sheet(`<h2>${esc(s.name)}</h2><div class="sub">${+(+s.qty).toFixed(2)} ${esc(s.unit)} • nilai ${rp(stokNilai(s))} (rata-rata ${rp(s.avg)})</div>
  <div class="as-gal">${(s.fotos||[]).map(u=>`<img class="as-big" src="${esc(u)}" onclick="window.open(this.src,'_blank')">`).join('')}</div>
  <div class="btn-row" style="margin:14px 0;"><button class="btn btn-primary" onclick="ASET.mv('${id}','in')">＋ Masuk</button><button class="btn btn-ghost" onclick="ASET.mv('${id}','out')">− Keluar</button></div>
  <button class="btn btn-ghost" onclick="ASET.sphoto('${id}')">📷 Tambah Foto</button>
  ${mv.length?'<div class="section-title">Riwayat terakhir</div><div class="settings-block">'+mv.map(m=>kv(m.date+' • '+(m.type==='in'?'Masuk':'Keluar')+(m.cara==='hibah'?' (hibah)':''),(m.type==='in'?'+':'−')+m.qty+' @ '+rp(m.price))).join('')+'</div>':''}
  <button class="btn btn-danger" style="margin-top:12px;" onclick="ASET.sdel('${id}')">Hapus Barang</button>`);
};
A.sphoto=id=>pick(async u=>{const s=S.stock.find(x=>x.id===id);s.fotos=[u].concat(s.fotos||[]);await put('stok',s);A.sd(id);render();});
A.sdel=async id=>{
  if(!confirm('Hapus barang persediaan ini?'))return;
  try{await apiPost('aset_del',{kind:'stok',id});S.stock=S.stock.filter(x=>x.id!==id);A.close();render();}catch(e){toast('Gagal: '+e.message);}
};
A.mv=(id,type)=>{
  const s=S.stock.find(x=>x.id===id),inn=type==='in';
  sheet(`<h2>${inn?'Stok Masuk':'Stok Keluar'}: ${esc(s.name)}</h2><div class="sub">Tersedia ${+(+s.qty).toFixed(2)} ${esc(s.unit)}</div>
  ${fld('Jumlah','<input type="number" id="mv-qty" inputmode="decimal">')}
  ${inn?fld('Harga satuan (Rp)','<input type="number" id="mv-price" inputmode="numeric" value="'+(s.avg||'')+'">')+fld('Cara perolehan','<select id="mv-cara">'+CARA.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')+'</select>')+fld('Bayar dari akun (jika beli)','<select id="mv-acc"><option value="">Jangan catat ke kas</option>'+accOpts()+'</select>'):''}
  ${fld('Tanggal','<input type="date" id="mv-date" value="'+todayLocalStr()+'">')}
  <button class="btn btn-primary" id="mv-save" style="margin-top:22px;" onclick="ASET.mvSave('${id}','${type}')">Simpan</button>`);
  if(inn&&STATE.accounts[0])$('mv-acc').value=STATE.accounts[0].id;
};
A.mvSave=async(id,type)=>{
  const s=S.stock.find(x=>x.id===id),qty=+$('mv-qty').value;
  if(qty<=0){toast('Jumlah tidak valid');return;}
  const m={id:uid(),sid:id,date:$('mv-date').value||todayLocalStr(),type,qty,price:type==='in'?(+$('mv-price').value||0):0,cara:type==='in'?$('mv-cara').value:'pakai'};
  $('mv-save').disabled=true;
  try{await applyMove(s,m,type==='in'?$('mv-acc').value:'');A.close();await loadAll();render();toast('Tersimpan');}catch(e){toast('Gagal: '+e.message);$('mv-save').disabled=false;}
};

// ---------- NERACA ----------
function vNeraca(){
  const act=S.assets.filter(a=>!a.keluar&&a.kapital),calcs=act.map(a=>[a,calc(a)]);
  const cost=calcs.reduce((s,[,c])=>s+c.cost,0),acc=calcs.reduce((s,[,c])=>s+c.acc,0),book=cost-acc;
  const kas=totalBalance(),stok=S.stock.reduce((s,x)=>s+stokNilai(x),0);
  const piut=STATE.debts.filter(d=>d.type==='piutang'&&!isDebtPaid(d)).reduce((s,d)=>s+debtRemaining(d),0);
  const utang=STATE.debts.filter(d=>d.type==='utang'&&!isDebtPaid(d)).reduce((s,d)=>s+debtRemaining(d),0);
  const lancar=kas+piut+stok,total=lancar+book,eq=total-utang;
  const byK={};calcs.forEach(([a,c])=>{byK[a.kat]=(byK[a.kat]||0)+c.book;});
  const blk=(t,rows)=>`<div class="section-title">${t}</div><div class="settings-block">${rows}</div>`;
  return blk('Aset Lancar',kv('Kas & rekening',rp(kas))+kv('Piutang',rp(piut))+kv('Persediaan',rp(stok))+kv('<b>Jumlah aset lancar</b>','<b>'+rp(lancar)+'</b>'))+
  blk('Aset Tetap',kv('Nilai perolehan',rp(cost))+kv('Akumulasi penyusutan','('+rp(acc)+')')+kv('<b>Nilai buku</b>','<b>'+rp(book)+'</b>'))+
  (Object.keys(byK).length?blk('Nilai buku per kategori',Object.entries(byK).map(([k,v])=>kv(esc(k),rp(v))).join('')):'')+
  `<div class="card" style="margin:14px 0;"><div class="lab">TOTAL ASET</div><div class="val num">${rp(total)}</div></div>`+
  blk('Liabilitas & Ekuitas',kv('Utang',rp(utang))+kv('<b>Ekuitas (kekayaan bersih)</b>','<b>'+rp(eq)+'</b>'))+
  `<button class="btn btn-ghost" onclick="ASET.setCap()">⚙️ Batas kapitalisasi: ${rp(cap())}</button>
  <div class="sub" style="margin:12px 0 30px;line-height:1.6">Nilai buku dihitung otomatis per hari ini dengan metode garis lurus per bulan sejak tanggal perolehan, tidak melewati nilai residu. Tanah tidak disusutkan. Barang di bawah batas kapitalisasi dan barang yang sudah dikeluarkan tidak masuk neraca.</div>`;
}
A.setCap=()=>{const v=prompt('Batas minimal nilai untuk dikapitalisasi sebagai aset (Rp):',cap());if(v===null)return;const n=+v;if(n>=0){localStorage.setItem('arus_aset_cap',n);render();toast('Disimpan (berlaku untuk input berikutnya)');}};

// ---------- INVENTARISASI ----------
function vCek(){
  const act=S.assets.filter(a=>!a.keluar).sort((a,b)=>a.name.localeCompare(b.name));
  const last=[...S.audits].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  return `<div class="sub" style="margin-bottom:12px;">Cocokkan kondisi barang saat ini, lalu simpan. Perubahan masuk ke riwayat tiap barang.</div><div id="au-list">${auList(act)}</div>
  ${act.length?'<button class="btn btn-primary" style="margin-top:16px;" onclick="ASET.auSave()">Simpan Inventarisasi</button>':''}
  ${last.length?'<div class="section-title">Riwayat inventarisasi</div><div class="settings-block">'+last.map(x=>kv(x.date,x.n+' dicek • '+x.changes.length+' berubah')).join('')+'</div>':''}`;
}
function auList(act){
  return act.length?act.map(a=>{const cur=S.draft[a.id]||a.kond;
    return `<div class="card" style="margin-bottom:10px;"><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">${thumb(a)}<div style="flex:1;min-width:0"><div class="t1" style="font-weight:600">${esc(a.name)}</div><div class="t2" style="font-size:12px;color:var(--text-muted)">${a.lastCheck?'Dicek '+a.lastCheck:'Belum pernah dicek'}</div></div><div style="cursor:pointer;font-size:20px" onclick="ASET.photoCek('${a.id}')">📷</div></div>
    <div class="toggle-row" style="margin:0">${KOND.map(k=>`<div class="opt ${cur===k?'active '+(k==='Baik'?'income':'expense'):''}" style="font-size:12px;padding:8px 4px" onclick="ASET.dr('${a.id}','${k}')">${k}</div>`).join('')}</div></div>`;}).join(''):'<div class="empty">Belum ada aset untuk diinventarisasi.</div>';
}
A.dr=(id,k)=>{S.draft[id]=k;$('au-list').innerHTML=auList(S.assets.filter(a=>!a.keluar).sort((a,b)=>a.name.localeCompare(b.name)));};
A.photoCek=id=>pick(async u=>{const a=S.assets.find(x=>x.id===id);a.fotos=[u].concat(a.fotos||[]);await put('aset',a);render();});
A.auSave=async()=>{
  const d=todayLocalStr(),changes=[],items=S.assets.filter(a=>!a.keluar);
  items.forEach(a=>{const k=S.draft[a.id]||a.kond;if(k!==a.kond){changes.push({n:a.name,f:a.kond,t:k});a.hist=(a.hist||[]).concat({d,f:a.kond,t:k});a.kond=k;}a.lastCheck=d;});
  try{await put('aset',items);await put('audit',{id:uid(),date:d,n:items.length,changes});
    S.audits.push({id:uid(),date:d,n:items.length,changes});S.draft={};render();toast('Inventarisasi tersimpan');}
  catch(e){toast('Gagal: '+e.message);}
};

// ---------- pasang UI ----------
document.body.insertAdjacentHTML('beforeend',`<style>
body.aset-mode #bottom-nav,body.aset-mode #nx-fab{display:none!important}
#aset-nav{position:fixed;bottom:0;left:0;right:0;background:var(--nav-bg);backdrop-filter:blur(10px);border-top:1px solid var(--line);display:none;justify-content:space-around;padding:10px 6px calc(10px + env(safe-area-inset-bottom));z-index:40}
body.aset-mode #aset-nav{display:flex}
#aset-nav div{flex:1;text-align:center;font-size:10.5px;font-weight:600;color:var(--text-muted);cursor:pointer}
#aset-nav div.on{color:var(--gold)}#aset-nav .ic{display:block;font-size:19px;margin-bottom:3px}
.as-thumb{width:48px;height:48px;border-radius:12px;object-fit:cover;background:var(--surface2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px}
.as-gal{display:flex;gap:8px;overflow-x:auto;margin-top:12px}
.as-big{height:150px;border-radius:12px;object-fit:cover;flex:0 0 auto}
.as-b{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;display:inline-block;margin-top:4px}
.as-b.k0{background:var(--teal-dim);color:var(--teal)}.as-b.k1{background:var(--gold-dim);color:var(--gold)}.as-b.k2{background:var(--gold-dim);color:var(--danger)}
</style>
<section class="screen" id="screen-aset"><div id="aset-root"></div></section>
<nav id="aset-nav"><div onclick="ASET.exit()"><span class="ic">💰</span>Kas</div><div data-t="aset" onclick="ASET.tab('aset')"><span class="ic">🏛️</span>Aset</div><div data-t="stok" onclick="ASET.tab('stok')"><span class="ic">📦</span>Stok</div><div data-t="neraca" onclick="ASET.tab('neraca')"><span class="ic">⚖️</span>Neraca</div><div data-t="cek" onclick="ASET.tab('cek')"><span class="ic">✅</span>Cek</div></nav>
<div class="sheet-overlay" id="aset-sheet"><div class="sheet" id="aset-sheet-body"></div></div>`);
$('aset-sheet').addEventListener('click',e=>{if(e.target.id==='aset-sheet')A.close();});
const hb=document.querySelector('#screen-home .top > div');
if(hb)hb.insertAdjacentHTML('afterbegin','<div class="icon-btn" onclick="ASET.open()" role="button" aria-label="Aset &amp; Neraca" title="Aset &amp; Neraca">🏛️</div>');
})();
