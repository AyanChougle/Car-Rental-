/* KRUIZLY V5 — accessible custom select used by the Fleet page. */
(() => {
  const SELECT_SELECTOR = '.fleet-select-wrap select';

  function initCustomSelect(select) {
    if (!select || select.dataset.krCustomReady === '1') return;
    select.dataset.krCustomReady = '1';

    const wrap = select.closest('.fleet-select-wrap');
    if (!wrap) return;

    wrap.classList.add('kr-custom-select');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'kr-custom-select__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${select.id || 'select'}-custom-menu`);

    const label = document.createElement('span');
    label.className = 'kr-custom-select__label';

    const chevron = document.createElement('span');
    chevron.className = 'kr-custom-select__chevron';
    chevron.setAttribute('aria-hidden', 'true');

    trigger.append(label, chevron);

    const menu = document.createElement('div');
    menu.className = 'kr-custom-select__menu';
    menu.id = `${select.id || 'select'}-custom-menu`;
    menu.setAttribute('role', 'listbox');

    const options = Array.from(select.options).map((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'kr-custom-select__option';
      item.dataset.value = option.value;
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      item.textContent = option.textContent;

      item.addEventListener('click', () => {
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
      });

      menu.appendChild(item);
      return item;
    });

    wrap.append(trigger, menu);

    function sync() {
      const current = select.options[select.selectedIndex];
      label.textContent = current ? current.textContent : '';

      options.forEach((item) => {
        const selected = item.dataset.value === select.value;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    }

    function positionDirection() {
      wrap.classList.remove('is-drop-up');
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(250, Math.max(120, options.length * 40 + 12));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < Math.min(menuHeight, 180) && spaceAbove > spaceBelow) {
        wrap.classList.add('is-drop-up');
      }
    }

    function open() {
      document.querySelectorAll('.kr-custom-select.is-open').forEach((other) => {
        if (other !== wrap) {
          other.classList.remove('is-open', 'is-drop-up');
          const otherTrigger = other.querySelector('.kr-custom-select__trigger');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        }
      });
      positionDirection();
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close() {
      wrap.classList.remove('is-open', 'is-drop-up');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', () => {
      wrap.classList.contains('is-open') ? close() : open();
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
        const selected = options.find((item) => item.classList.contains('is-selected'));
        (selected || options[0])?.focus();
      }
      if (event.key === 'Escape') close();
    });

    menu.addEventListener('keydown', (event) => {
      const current = document.activeElement;
      const index = options.indexOf(current);
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        trigger.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        options[(index + 1) % options.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        options[(index - 1 + options.length) % options.length]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        current?.click();
      }
    });

    select.addEventListener('change', sync);
    sync();
  }

  function init() {
    document.querySelectorAll(SELECT_SELECTOR).forEach(initCustomSelect);
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.kr-custom-select')) {
      document.querySelectorAll('.kr-custom-select.is-open').forEach((wrap) => {
        wrap.classList.remove('is-open', 'is-drop-up');
        wrap.querySelector('.kr-custom-select__trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll('.kr-custom-select.is-open').forEach((wrap) => {
      const trigger = wrap.querySelector('.kr-custom-select__trigger');
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      wrap.classList.toggle('is-drop-up', rect.top > window.innerHeight - rect.bottom);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
