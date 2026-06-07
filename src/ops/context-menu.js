const el = document.getElementById('ctx-menu');

export function showMenu(x, y, items) {
  el.innerHTML = '';
  for (const item of items) {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      el.appendChild(sep);
    } else {
      const div = document.createElement('div');
      div.className = 'menu-item' + (item.danger ? ' danger' : '');
      div.textContent = item.label;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        hideMenu();
        item.action();
      });
      el.appendChild(div);
    }
  }
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  el.classList.remove('hidden');
}

export function hideMenu() {
  el.classList.add('hidden');
}
