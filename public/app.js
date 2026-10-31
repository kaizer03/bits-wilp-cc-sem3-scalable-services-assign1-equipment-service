const $ = id => document.getElementById(id);
const state = { equipment: [], bookings: [], reserved: [], available: false, selected: null, cancelId: null, requestKey: null, submittedBody: null };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const dateLabel = value => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = { Presentation: 'bi-projector', Photography: 'bi-camera', Audio: 'bi-speaker', Conferencing: 'bi-webcam', Other: 'bi-box-seam' };
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body;
}
function notice(message, type = 'success') { $('notice').textContent = message; $('notice').className = `alert alert-${type}`; }
function errorAt(id, error) { $(id).textContent = error.message; $(id).classList.remove('d-none'); }
function slotState(item, slot) {
  if (item.status !== 'operational') return ['unavailable','Unavailable'];
  if (!state.available) return ['unavailable','Not available'];
  return state.reserved.some(r => r.equipmentId === item.id && r.slot === slot) ? ['reserved','Reserved'] : ['', 'Available'];
}
function renderEquipment() {
  const query = $('search').value.toLowerCase().trim();
  const category = $('category').value;
  const items = state.equipment.filter(item => (!category || item.category === category) && [item.name, item.assetTag, item.location].some(v => v.toLowerCase().includes(query)));
  $('equipment-count').textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${state.equipment.filter(i => i.status === 'operational').length} operational`;
  $('equipment-rows').innerHTML = items.map(item => {
    const am = slotState(item,'AM'), pm = slotState(item,'PM');
    const disabled = item.status !== 'operational' || !state.available || (am[0] === 'reserved' && pm[0] === 'reserved');
    return `<tr><td><div class="d-flex align-items-center gap-3"><span class="equipment-icon"><i class="bi ${icons[item.category] || icons.Other}" aria-hidden="true"></i></span><div><div class="equipment-name">${escape(item.name)}</div><div class="asset-meta">${escape(item.assetTag)} · ${escape(item.category)}</div>${item.status === 'maintenance' ? '<span class="maintenance">Under maintenance</span>' : ''}</div></div></td><td class="text-secondary">${escape(item.location)}</td><td><span class="slot-badge ${am[0]}">${am[1]}</span></td><td><span class="slot-badge ${pm[0]}">${pm[1]}</span></td><td><div class="d-flex align-items-center justify-content-end gap-2"><button class="btn btn-sm btn-outline-primary" data-book="${item.id}" ${disabled ? 'disabled' : ''}>Book</button><button class="action-button" data-maintenance="${item.id}" aria-label="${item.status === 'maintenance' ? 'Mark operational' : 'Mark under maintenance'}: ${escape(item.name)}" title="${item.status === 'maintenance' ? 'Mark operational' : 'Mark under maintenance'}"><i class="bi bi-tools" aria-hidden="true"></i></button></div></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-state"><i class="bi bi-search fs-3 d-block mb-3" aria-hidden="true"></i>No equipment matches these filters.</td></tr>';
}
async function loadEquipment() {
  state.equipment = await api('/api/equipment');
  const selected = $('category').value;
  $('category').innerHTML = '<option value="">All categories</option>' + [...new Set(state.equipment.map(i => i.category))].sort().map(c => `<option>${escape(c)}</option>`).join('');
  $('category').value = selected;
  renderEquipment();
}
async function loadAvailability() {
  const requestedDate = $('availability-date').value;
  if (!requestedDate) return;
  state.available = false; renderEquipment();
  const data = await api(`/api/availability?date=${encodeURIComponent(requestedDate)}`);
  if ($('availability-date').value !== requestedDate) return;
  state.reserved = data.reserved; state.available = true; renderEquipment();
}
async function loadBookings() {
  const query = $('booking-filter').value ? `?date=${encodeURIComponent($('booking-filter').value)}` : '';
  state.bookings = await api(`/api/bookings${query}`); renderBookings();
}
function renderBookings() {
  const status = $('status-filter').value;
  const items = state.bookings.filter(b => !status || status === b.status);
  $('booking-rows').innerHTML = items.map(b => `<tr><td><div class="equipment-name">${escape(b.equipmentName)}</div><div class="asset-meta">${escape(b.assetTag)} · ${escape(b.purpose)}</div></td><td>${dateLabel(b.date)}<div class="asset-meta">${b.slot === 'AM' ? 'Morning · 09:00–13:00' : 'Afternoon · 14:00–18:00'}</div></td><td>${escape(b.requester)}</td><td><span class="booking-status status-${b.status}">${b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}</span></td><td>${b.status === 'confirmed' ? `<button class="btn btn-sm btn-light border" data-cancel="${b.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-state"><i class="bi bi-calendar2 fs-3 d-block mb-3" aria-hidden="true"></i>No bookings to show.<div class="small mt-2">Choose equipment to make a reservation.</div></td></tr>';
  $('booking-count').textContent = `${items.length} ${items.length === 1 ? 'booking' : 'bookings'} shown · Latest dates first`;
}
function showPage(page) {
  for (const name of ['equipment','bookings']) {
    $(`${name}-page`).classList.toggle('d-none',name !== page); $(`${name}-tab`).classList.toggle('active',name === page);
    if (name === page) $(`${name}-tab`).setAttribute('aria-current','page'); else $(`${name}-tab`).removeAttribute('aria-current');
  }
  if (page === 'bookings') loadBookings().catch(e => notice(e.message,'danger'));
}
$('availability-date').value = today(); $('availability-date').min = today(); $('booking-date').min = today();
$('search').addEventListener('input', renderEquipment); $('category').addEventListener('change', renderEquipment);
$('availability-date').addEventListener('change', () => loadAvailability().catch(e => notice(e.message,'warning')));
$('equipment-tab').addEventListener('click', () => { showPage('equipment'); loadAvailability().catch(e => notice(e.message,'warning')); });
$('bookings-tab').addEventListener('click', () => showPage('bookings'));
$('refresh-bookings').addEventListener('click', () => loadBookings().catch(e => notice(e.message,'danger')));
$('booking-filter').addEventListener('change', () => loadBookings().catch(e => notice(e.message,'danger')));
$('status-filter').addEventListener('change',renderBookings);
$('clear-filters').addEventListener('click', () => { $('booking-filter').value=''; $('status-filter').value=''; loadBookings().catch(e=>notice(e.message,'danger')); });
$('equipment-rows').addEventListener('click', async event => {
  const book = event.target.closest('[data-book]');
  if (book) {
    state.selected = state.equipment.find(i => i.id === book.dataset.book); state.requestKey = crypto.randomUUID(); state.submittedBody = null;
    $('booking-form').reset(); $('booking-error').classList.add('d-none'); $('booking-date').value = $('availability-date').value;
    $('selected-equipment').textContent=state.selected.name; $('selected-tag').textContent = `${state.selected.assetTag} · ${state.selected.location}`;
    $('booking-slot').value = slotState(state.selected,'AM')[0] === 'reserved' ? 'PM' : 'AM';
    bootstrap.Modal.getOrCreateInstance($('booking-modal')).show(); return;
  }
  const manage = event.target.closest('[data-maintenance]');
  if (manage) {
    const item = state.equipment.find(i=>i.id === manage.dataset.maintenance);
    manage.disabled=true;
    try { await api(`/api/equipment/${item.id}`,{method:'PATCH',body:JSON.stringify({status:item.status==='operational'?'maintenance':'operational'})}); await loadEquipment(); notice(`${item.name} status updated. Existing reservations remain on record.`); }
    catch(e) {notice(e.message,'danger');} finally {manage.disabled=false;}
  }
});
$('booking-form').addEventListener('submit', async event => {
  event.preventDefault(); $('booking-error').classList.add('d-none'); $('confirm-booking').disabled=true; $('confirm-booking').textContent='Saving…';
  const body=JSON.stringify({equipmentId:state.selected.id,date:$('booking-date').value,slot:$('booking-slot').value,requester:$('requester').value,purpose:$('purpose').value});
  if (state.submittedBody !== null && state.submittedBody !== body) state.requestKey=crypto.randomUUID(); state.submittedBody=body;
  try { const booking=await api('/api/bookings',{method:'POST',headers:{'Idempotency-Key':state.requestKey},body}); bootstrap.Modal.getInstance($('booking-modal')).hide(); notice(`Reservation confirmed for ${booking.equipmentName} on ${dateLabel(booking.date)} (${booking.slot === 'AM'?'morning':'afternoon'}).`); $('availability-date').value=booking.date; await loadAvailability(); }
  catch(e) { errorAt('booking-error',e); }
  finally { $('confirm-booking').disabled=false; $('confirm-booking').textContent='Confirm booking'; }
});
$('equipment-form').addEventListener('submit', async event=>{
  event.preventDefault(); $('equipment-error').classList.add('d-none'); $('save-equipment').disabled=true;
  try { await api('/api/equipment',{method:'POST',body:JSON.stringify({assetTag:$('asset-tag').value,name:$('equipment-name').value,category:$('equipment-category').value,location:$('equipment-location').value,description:$('equipment-description').value})}); bootstrap.Modal.getInstance($('equipment-modal')).hide(); $('equipment-form').reset(); await loadEquipment(); notice('Equipment added to the catalogue.'); }
  catch(e){errorAt('equipment-error',e);} finally{$('save-equipment').disabled=false;}
});
$('booking-rows').addEventListener('click',event=>{
  const button=event.target.closest('[data-cancel]'); if(!button)return;
  state.cancelId=button.dataset.cancel; const booking=state.bookings.find(b=>b.id===state.cancelId);
  $('cancel-summary').textContent=`${booking.equipmentName} · ${dateLabel(booking.date)} · ${booking.slot==='AM'?'Morning':'Afternoon'}`;
  $('cancel-error').classList.add('d-none'); bootstrap.Modal.getOrCreateInstance($('cancel-modal')).show();
});
$('confirm-cancel').addEventListener('click',async()=>{
  $('confirm-cancel').disabled=true;
  try {await api(`/api/bookings/${state.cancelId}/cancel`,{method:'PATCH',body:'{}'}); bootstrap.Modal.getInstance($('cancel-modal')).hide(); notice('Reservation cancelled. The slot is available again.'); await loadBookings(); await loadAvailability();}
  catch(e){errorAt('cancel-error',e);} finally{$('confirm-cancel').disabled=false;}
});
loadEquipment().then(loadAvailability).catch(e=>{notice(e.message,'warning'); if(!state.equipment.length)$('equipment-rows').innerHTML='<tr><td colspan="5" class="empty-state">Equipment could not be loaded. Please refresh the page.</td></tr>';});
