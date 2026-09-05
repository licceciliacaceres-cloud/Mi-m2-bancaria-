const PRICE=10000, TOTAL=600;
const grid=document.getElementById('grid');
let units=Array.from({length:TOTAL},(_,i)=>({id:i+1,status:'available',public_name:''}));
let selected=new Set(), currentReservation=null, adminToken=localStorage.getItem('bancariaAdminToken')||'';
const $=id=>document.getElementById(id);
function label(s){return s==='available'?'Disponible':s==='reserved'?'Reservado':s==='acquired'?'Adquirido':'Bloqueado'}
function render(){
  grid.innerHTML='';
  units.forEach(m=>{const b=document.createElement('button');b.className=`cell ${m.status} ${selected.has(m.id)?'selected':''}`;b.textContent=m.id;b.title=`M² ${m.id} · ${label(m.status)}`;b.onclick=()=>toggleM2(m.id);grid.appendChild(b)});
  updateStats(); updateSelection();
}
function updateStats(){
  const acquired=units.filter(x=>x.status==='acquired').length; const available=units.filter(x=>x.status==='available').length;
  $('a1').textContent=acquired; $('a2').textContent='$'+(acquired*PRICE).toLocaleString('es-AR'); $('a3').textContent=available;
  const recent=units.filter(x=>x.status==='acquired').slice(-5).reverse(); $('supporters').innerHTML=recent.length?recent.map(x=>`<div class="supporter"><b>${x.id}</b><span>${escapeHtml(x.public_name||'Aporte anónimo')}</span></div>`).join(''):'<div class="empty">Todavía no hay colaboradores.</div>';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function toggleM2(id){const m=units[id-1];if(!m||m.status!=='available'){alert('Este m² no está disponible.');return} selected.has(id)?selected.delete(id):selected.add(id);render()}
function updateSelection(){
  const ids=[...selected].sort((a,b)=>a-b); const card=$('selectionCard');
  if(!ids.length){card.innerHTML='<h3>🌱 TU SELECCIÓN</h3><div class="empty">Elegí uno o varios m² verdes del mapa.</div>';return}
  card.innerHTML=`<h3>🌱 TU SELECCIÓN</h3><h2>${ids.length} m²</h2><p>${ids.map(x=>`M² ${x}`).join(' · ')}</p><p><strong>Total: $${(ids.length*PRICE).toLocaleString('es-AR')}</strong></p><button class="primary" onclick="openPurchase()">CONTINUAR</button>`;
}
function openPurchase(){
 if(!selected.size){alert('Elegí al menos un m².');return}
 $('modal').classList.remove('hidden'); $('modalContent').innerHTML=`<span class="eyebrow">${selected.size} m² · $${(selected.size*PRICE).toLocaleString('es-AR')}</span><h2>Dejá tus datos</h2>
 <form class="form" onsubmit="submitPurchase(event)"><label>Nombre<input required id="nombre" maxlength="80"></label><label>Apellido<input required id="apellido" maxlength="80"></label><label>División<input required id="division" maxlength="120" placeholder="Ej. Primera Masculino"></label><label>Email<input required type="email" id="email" maxlength="160"></label>
 <div class="choice"><label><input type="radio" name="pub" value="nombre" checked> Mi nombre</label><label><input type="radio" name="pub" value="familia"> Mi familia</label><label><input type="radio" name="pub" value="anonimo"> Anónimo</label><label><input type="radio" name="pub" value="honor"> En honor a… <input id="honor" maxlength="120" placeholder="Opcional"></label></div>
 <button class="pay" id="submitPay">CONTINUAR A MERCADO PAGO →</button></form>`;
}
async function submitPurchase(e){
 e.preventDefault(); const btn=$('submitPay'); btn.disabled=true; btn.textContent='RESERVANDO…';
 const mode=document.querySelector('input[name=pub]:checked').value;
 const body={unitIds:[...selected],firstName:$('nombre').value,lastName:$('apellido').value,division:$('division').value,email:$('email').value,publicMode:mode,honorText:$('honor').value};
 try{const r=await fetch('/api/create-preference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'No se pudo crear la reserva');currentReservation=d.reservationId;modalContent.innerHTML=`<div class="success"><div class="big">⏳</div><h2>Reserva realizada</h2><p>Tenés <strong>10 minutos</strong> para completar el pago.</p><p>Total: <strong>$${d.amount.toLocaleString('es-AR')}</strong></p><a class="pay" href="${d.initPoint}" target="_blank" rel="noopener">PAGAR CON MERCADO PAGO →</a><p class="note">Al volver, la confirmación se verifica automáticamente. No cierres la ventana hasta completar el pago.</p></div>`; selected.clear(); await loadUnits();}catch(err){alert(err.message);btn.disabled=false;btn.textContent='CONTINUAR A MERCADO PAGO →'}
}
async function loadUnits(){try{const r=await fetch('/api/units');const d=await r.json();if(!r.ok)throw new Error(d.error||'No se pudo cargar el mapa');units=d.units;render()}catch(e){console.warn(e);render()}}
function closeModal(){ $('modal').classList.add('hidden') }
function openAdmin(){ $('admin').classList.remove('hidden'); if(!adminToken) showAdminLogin(); else loadAdmin(); }
function closeAdmin(){ $('admin').classList.add('hidden') }
function showAdminLogin(){ $('adminContent').innerHTML=`<span class="eyebrow">PANEL ADMINISTRADOR</span><h2>Ingresar</h2><form class="form" onsubmit="adminLogin(event)"><label>Email<input id="adminEmail" type="email" required></label><label>Contraseña<input id="adminPassword" type="password" required></label><button class="pay">INGRESAR</button></form><p class="note">Solo los 3 usuarios administradores autorizados pueden ingresar.</p>` }
async function adminLogin(e){e.preventDefault();try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('adminEmail').value,password:$('adminPassword').value})});const d=await r.json();if(!r.ok)throw new Error(d.error);adminToken=d.access_token;localStorage.setItem('bancariaAdminToken',adminToken);loadAdmin()}catch(err){alert(err.message)}}
async function loadAdmin(){try{const r=await fetch('/api/admin',{headers:{Authorization:`Bearer ${adminToken}`}});const d=await r.json();if(r.status===401){adminToken='';localStorage.removeItem('bancariaAdminToken');showAdminLogin();return}if(!r.ok)throw new Error(d.error);$('adminContent').innerHTML=`<span class="eyebrow">PANEL ADMINISTRADOR</span><h2>Gestión de la campaña</h2><div class="admin-stats"><div><b>${d.units.filter(x=>x.status==='acquired').length}</b><span>Adquiridos</span></div><div><b>$${d.reservations.filter(x=>x.status==='paid').reduce((s,x)=>s+Number(x.amount),0).toLocaleString('es-AR')}</b><span>Recaudado</span></div><div><b>${d.units.filter(x=>x.status==='available').length}</b><span>Disponibles</span></div></div><div class="admin-actions"><button onclick="exportAdminCSV(${JSON.stringify(d.reservations).replace(/</g,'\\u003c')})">EXPORTAR CSV</button><button onclick="adminLogout()">CERRAR SESIÓN</button></div><h3>Últimas operaciones</h3><div class="admin-list">${d.reservations.slice(0,20).map(x=>`<div><b>${x.status.toUpperCase()}</b> · ${escapeHtml(x.buyer_first_name)} ${escapeHtml(x.buyer_last_name)} · $${Number(x.amount).toLocaleString('es-AR')} · ${escapeHtml(x.email)}</div>`).join('')||'<div class="empty">Sin operaciones todavía.</div>'}</div>`}catch(e){alert(e.message)}}
function adminLogout(){adminToken='';localStorage.removeItem('bancariaAdminToken');showAdminLogin()}
function exportAdminCSV(rows){const head=['ID','Estado','Nombre','Apellido','Division','Email','Nombre publico','Monto','Vencimiento','Pago','Voucher'];const csv=[head,...rows.map(x=>[x.id,x.status,x.buyer_first_name,x.buyer_last_name,x.division,x.email,x.public_name,x.amount,x.expires_at,x.paid_at||'',x.voucher_code||''])].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='bancaria_m2_operaciones.csv';a.click()}
async function checkReturn(){const p=new URLSearchParams(location.search),status=p.get('payment');if(!status)return;if(status==='success'){modal.classList.remove('hidden');modalContent.innerHTML='<div class="success"><div class="big">🌱</div><h2>¡Gracias!</h2><p>Estamos verificando tu pago. La adquisición quedará confirmada automáticamente cuando Mercado Pago nos envíe la aprobación.</p></div>';setTimeout(async()=>{closeModal();await loadUnits()},5000)}else if(status==='failure'){alert('El pago no se completó. Tu reserva puede vencer automáticamente a los 10 minutos.')}else if(status==='pending'){alert('El pago quedó pendiente. Te enviaremos la confirmación cuando Mercado Pago lo apruebe.')}history.replaceState({},'',location.pathname)}
window.addEventListener('load',()=>{loadUnits();checkReturn()});
