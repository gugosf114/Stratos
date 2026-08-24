// Inventory — stock levels, low-stock flags, adjustments, movement log.
import { state, isManager, adjustStock, saveInventoryItem, deleteInventoryItem } from '../store.js';
import { esc, icon, fmtDateShort, fmtTime, formDialog, confirmDialog, toast } from '../util.js';

const fields = i => `
  <div class="field"><label>Name</label><input class="input" name="name" required value="${esc(i.name || '')}"></div>
  <div class="field-row">
    <div class="field"><label>Quantity</label><input class="input" name="qty" type="number" step="any" required value="${i.qty != null ? esc(String(i.qty)) : ''}"></div>
    <div class="field"><label>Unit</label><input class="input" name="unit" placeholder="gal, bottles, pcs" value="${esc(i.unit || '')}"></div>
  </div>
  <div class="field"><label>Low-stock alert at</label><input class="input" name="minQty" type="number" step="any" value="${i.minQty != null ? esc(String(i.minQty)) : '0'}"></div>`;

export function page() {
  const low = state.inventory.filter(i => Number(i.qty) <= Number(i.minQty || 0));
  const mgr = isManager();

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Consumables</div>
      <h1 class="display">Inventory</h1>
    </div>
    ${mgr ? `<div class="page-actions"><button class="btn btn-gold" data-action="add">${icon('plus')} Add item</button></div>` : ''}
  </div>

  ${low.length ? `<div class="card" style="margin-bottom:14px;border-color:rgba(198,162,75,.5)">
    <div class="card-title"><span class="kicker">${icon('warning')} Reorder now</span></div>
    ${low.map(i => `<div class="inv-row"><span>${esc(i.name)}</span><span class="inv-qty"><span class="lowstock">Low</span> ${esc(String(i.qty))} ${esc(i.unit || '')} <span class="faint small">(alert at ${esc(String(i.minQty))})</span></span></div>`).join('')}
  </div>` : ''}

  <div class="card" style="margin-bottom:14px">
    <div class="card-title"><span class="kicker">All items</span></div>
    ${state.inventory.map(i => `
      <div class="inv-row">
        <div class="list-main">
          <div class="list-title">${esc(i.name)}</div>
          <div class="list-sub">${Number(i.qty) <= Number(i.minQty || 0) ? '<span class="lowstock">Low stock</span> ' : ''}${esc(String(i.qty))} ${esc(i.unit || '')} · alert at ${esc(String(i.minQty || 0))}</div>
        </div>
        <div class="stepper">
          <button data-action="adj" data-item="${esc(i.id)}" data-delta="-1">−</button>
          <button data-action="adj" data-item="${esc(i.id)}" data-delta="1">+</button>
          ${mgr ? `<button data-action="edit" data-item="${esc(i.id)}" title="Edit">${icon('edit')}</button>` : ''}
        </div>
      </div>`).join('') || '<div class="empty small">No items yet.</div>'}
  </div>

  <div class="card">
    <div class="card-title"><span class="kicker">Recent movement</span></div>
    ${(state.stockLog || []).slice(0, 25).map(l => `
      <div class="act-row">
        <span class="act-when">${fmtDateShort(l.at)} ${fmtTime(l.at)}</span>
        <span><b>${esc(l.itemName)}</b> ${l.delta > 0 ? '+' + l.delta : l.delta} — ${esc(l.reason === 'job' ? 'used on job' : l.reason)}${l.byName ? ` · ${esc(l.byName)}` : ''}</span>
      </div>`).join('') || '<div class="empty small">No movement yet.</div>'}
  </div>`;

  const bind = root => {
    root.onclick = async e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      if (a === 'add') {
        const r = await formDialog('Add inventory item', fields({}), { ok: 'Add' });
        if (r && r.name) saveInventoryItem(null, { name: r.name.trim(), qty: Number(r.qty) || 0, unit: r.unit || '', minQty: Number(r.minQty) || 0 });
      }
      if (a === 'adj') {
        const item = state.inventory.find(i => i.id === el.dataset.item);
        const delta = Number(el.dataset.delta);
        const r = await formDialog(`${delta > 0 ? 'Add' : 'Remove'} stock — ${esc(item.name)}`, `
          <div class="field"><label>How much</label><input class="input" name="qty" type="number" step="any" min="0" value="1" required></div>
          <div class="field"><label>Reason</label><input class="input" name="reason" placeholder="${delta > 0 ? 'restock, delivery…' : 'spill, correction…'}" value="${delta > 0 ? 'restock' : ''}"></div>`,
          { ok: delta > 0 ? 'Add stock' : 'Remove stock' });
        if (r && Number(r.qty) > 0) adjustStock(item.id, delta * Number(r.qty), r.reason || 'adjustment');
      }
      if (a === 'edit') {
        const item = state.inventory.find(i => i.id === el.dataset.item);
        const r = await formDialog('Edit item', fields(item) + `
          <div class="field"><label class="small faint" style="text-transform:none;letter-spacing:0">Deleting removes it from every job screen.</label>
          <button type="button" class="btn btn-danger btn-sm" id="inv-del">Delete item</button></div>`, {
          ok: 'Save',
          onMount: form => {
            form.querySelector('#inv-del').onclick = async () => {
              if (await confirmDialog('Delete item?', `${item.name} disappears from inventory.`, { ok: 'Delete', danger: true })) {
                deleteInventoryItem(item.id);
                document.getElementById('modal-root').innerHTML = '';
                document.body.classList.remove('modal-open');
              }
            };
          }
        });
        if (r && r.name) saveInventoryItem(item.id, { name: r.name.trim(), qty: Number(r.qty) || 0, unit: r.unit || '', minQty: Number(r.minQty) || 0 });
      }
    };
  };
  return { html, bind };
}
