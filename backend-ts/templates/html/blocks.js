/**
 * Drape Feature Blocks - vanilla JS functional UI components.
 * Each function returns a DOM element with working event handlers.
 * Usage: document.getElementById('target').appendChild(Drape.likeButton({ id: '1' }));
 */
const Drape = {
  _toast(message) {
    const t = document.createElement('div');
    t.textContent = message;
    Object.assign(t.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#333', color: '#fff', padding: '10px 20px', borderRadius: '8px',
      fontSize: '14px', zIndex: '10000', transition: 'opacity 0.3s', opacity: '1'
    });
    document.body.appendChild(t);
    setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 300); }, 2500);
  },

  likeButton: function(opts) {
    var id = opts.id, onToggle = opts.onToggle, initialLiked = opts.initialLiked || false;
    var liked = initialLiked;
    var btn = document.createElement('button');
    btn.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;transition:transform 0.2s;padding:8px;';
    function update() {
      btn.textContent = liked ? '\u2665' : '\u2661';
      btn.style.color = liked ? '#ef4444' : '#9ca3af';
    }
    update();
    btn.onclick = function() { liked = !liked; update(); Drape._toast(liked ? 'Added to favorites' : 'Removed'); if (onToggle) onToggle(liked); };
    btn.onmouseenter = function() { btn.style.transform = 'scale(1.2)'; };
    btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; };
    return btn;
  },

  shareButton: function(opts) {
    var url = opts.url, title = opts.title;
    var btn = document.createElement('button');
    btn.textContent = 'Share';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;';
    btn.onclick = function() {
      var u = url || location.href;
      if (navigator.share) { navigator.share({ title: title || document.title, url: u }).catch(function() {}); return; }
      navigator.clipboard.writeText(u).then(function() { Drape._toast('Link copied!'); });
    };
    return btn;
  },

  quantitySelector: function(opts) {
    var val = opts.value || 1, min = opts.min || 0, max = opts.max || 99, onChange = opts.onChange;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;border:1px solid #e5e7eb;border-radius:8px;';
    var minus = document.createElement('button');
    var display = document.createElement('span');
    var plus = document.createElement('button');
    minus.textContent = '\u2212'; plus.textContent = '+';
    var btnStyle = 'padding:8px 12px;border:none;background:none;cursor:pointer;font-size:16px;';
    minus.style.cssText = btnStyle; plus.style.cssText = btnStyle;
    display.style.cssText = 'width:40px;text-align:center;font-size:14px;font-weight:500;';
    function update() { display.textContent = String(val); minus.disabled = val <= min; plus.disabled = val >= max; }
    update();
    minus.onclick = function() { val = Math.max(min, val - 1); update(); if (onChange) onChange(val); };
    plus.onclick = function() { val = Math.min(max, val + 1); update(); if (onChange) onChange(val); };
    wrap.append(minus, display, plus);
    return wrap;
  },

  ratingStars: function(opts) {
    var maxStars = opts.maxStars || 5, rating = opts.initialRating || 0, onRate = opts.onRate;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;gap:2px;';
    var stars = [];
    function update() {
      stars.forEach(function(s, i) {
        s.textContent = i < rating ? '\u2605' : '\u2606';
        s.style.color = i < rating ? '#facc15' : '#d1d5db';
      });
    }
    for (var i = 0; i < maxStars; i++) {
      var s = document.createElement('button');
      s.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;transition:transform 0.15s;padding:2px;';
      s.setAttribute('data-star', String(i + 1));
      s.onclick = function() { rating = parseInt(this.getAttribute('data-star')); update(); Drape._toast('Rated ' + rating + ' star' + (rating > 1 ? 's' : '')); if (onRate) onRate(rating); };
      s.onmouseenter = function() { this.style.transform = 'scale(1.3)'; };
      s.onmouseleave = function() { this.style.transform = 'scale(1)'; };
      stars.push(s);
      wrap.appendChild(s);
    }
    update();
    return wrap;
  },

  deleteButton: function(opts) {
    var onDelete = opts.onDelete, label = opts.label || 'Delete', confirmMessage = opts.confirmMessage;
    var confirming = false;
    var btn = document.createElement('button');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #fecaca;border-radius:8px;background:#fff;color:#dc2626;cursor:pointer;font-size:14px;transition:all 0.2s;';
    btn.textContent = label;
    btn.onclick = function() {
      if (confirmMessage && !confirming) {
        confirming = true; btn.textContent = 'Confirm?'; btn.style.background = '#dc2626'; btn.style.color = '#fff';
        setTimeout(function() { confirming = false; btn.textContent = label; btn.style.background = '#fff'; btn.style.color = '#dc2626'; }, 3000);
        return;
      }
      if (onDelete) onDelete(); confirming = false; Drape._toast('Deleted');
    };
    return btn;
  },

  toggleSwitch: function(opts) {
    var enabled = opts.initialValue || false, onChange = opts.onChange, labelText = opts.label;
    var wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:12px;cursor:pointer;';
    var track = document.createElement('div');
    track.style.cssText = 'width:44px;height:24px;border-radius:12px;position:relative;transition:background 0.2s;';
    var thumb = document.createElement('div');
    thumb.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:4px;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);';
    track.appendChild(thumb);
    function update() { track.style.background = enabled ? '#8b5cf6' : '#d1d5db'; thumb.style.transform = enabled ? 'translateX(24px)' : 'translateX(4px)'; }
    update();
    wrap.onclick = function(e) { e.preventDefault(); enabled = !enabled; update(); if (onChange) onChange(enabled); };
    wrap.appendChild(track);
    if (labelText) { var lbl = document.createElement('span'); lbl.textContent = labelText; lbl.style.fontSize = '14px'; wrap.appendChild(lbl); }
    return wrap;
  },

  searchBar: function(opts) {
    var onSearch = opts.onSearch, placeholder = opts.placeholder || 'Search...';
    var timer;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';
    var input = document.createElement('input');
    input.type = 'text'; input.placeholder = placeholder;
    input.style.cssText = 'width:100%;padding:10px 40px 10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;';
    input.oninput = function() { clearTimeout(timer); timer = setTimeout(function() { if (onSearch) onSearch(input.value); }, 300); };
    wrap.appendChild(input);
    return wrap;
  },

  filterChips: function(opts) {
    var chips = opts.chips, onChange = opts.onChange, multiple = opts.multiple !== false;
    var selected = new Set();
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    var allBtns = [];
    function updateAll() {
      allBtns.forEach(function(item) {
        var active = selected.has(item.chip.id);
        item.btn.style.background = active ? '#8b5cf6' : '#f3f4f6';
        item.btn.style.color = active ? '#fff' : '#4b5563';
      });
    }
    chips.forEach(function(chip) {
      var btn = document.createElement('button');
      btn.textContent = chip.label;
      btn.style.cssText = 'padding:6px 14px;border-radius:9999px;font-size:14px;font-weight:500;border:none;cursor:pointer;transition:all 0.2s;';
      btn.onclick = function() {
        if (!multiple) selected.clear();
        if (selected.has(chip.id)) { selected.delete(chip.id); } else { selected.add(chip.id); }
        updateAll();
        if (onChange) onChange(Array.from(selected));
      };
      allBtns.push({ btn: btn, chip: chip });
      wrap.appendChild(btn);
    });
    updateAll();
    return wrap;
  }
};
