// Inline SVG masks keep grid actions sharp and independent of icon-font loading.
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  money: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  barcode: '<path d="M3 5v14M7 5v14M10 5v14M14 5v14M18 5v14M21 5v14"/>',
  print: '<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h.01"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
}
const aliases = { trash: 'delete', remove: 'delete', eye: 'view', pencil: 'edit', plus: 'add', 'money-bill': 'money', printer: 'print' }
const labels = { search: 'بحث', edit: 'تعديل', delete: 'حذف', add: 'إضافة', view: 'عرض', save: 'حفظ', calendar: 'اختيار التاريخ', money: 'تفاصيل المبلغ', barcode: 'باركود', print: 'طباعة', copy: 'نسخ', more: 'إجراءات' }
export function gridActionName(iconType, className) {
  const value = String(iconType || '').toLowerCase()
  return aliases[value] || (paths[value] ? value : className === 'danger' ? 'delete' : 'more')
}
export function gridActionLabel(iconType, className) { return labels[gridActionName(iconType, className)] }
export function gridActionClass(className, iconType) {
  const action = gridActionName(iconType, className)
  const tone = ['danger', 'warning', 'info', 'success'].includes(className) ? className : action === 'delete' ? 'danger' : ['add', 'save'].includes(action) ? 'success' : ['calendar', 'money'].includes(action) ? 'warning' : 'info'
  return `wj-cell-maker-btn dgv-action dgv-action-${action} btn-${tone}`
}
export function gridActionStyle(className, iconType) {
  const name = gridActionName(iconType, className)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
  return `--dgv-icon:url("data:image/svg+xml,${encodeURIComponent(svg)}");`
}
