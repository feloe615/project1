(function () {
  'use strict';
  var form = document.getElementById('form');
  var statusEl = document.getElementById('status');
  var resultsEl = document.getElementById('results');
  var cuisinesEl = document.getElementById('cuisines');
  var dialog = document.getElementById('dialog');
  var frame = document.getElementById('frame');
  var cities = [];
  var here = null;       // { lat, lon } vom Gerät
  var requestNo = 0;

  function el(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function getJson(path) {
    return fetch(path).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Fehler');
        return data;
      });
    });
  }

  function formatDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  // --- Formular füllen -----------------------------------------------------------
  function fillForm(meta) {
    cities = meta.cities;
    form.date.value = meta.suggested.date;
    form.date.min = meta.today;

    for (var m = 11 * 60; m <= 22 * 60 + 30; m += 30) {
      var t = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      form.time.appendChild(el('option', { value: t, selected: t === meta.suggested.time ? '' : null }, t + ' Uhr'));
    }
    for (var n = 1; n <= 10; n++) {
      form.partySize.appendChild(el('option', { value: n, selected: n === 2 ? '' : null }, n + (n === 1 ? ' Person' : ' Personen')));
    }
    cities.forEach(function (c, i) { form.place.appendChild(el('option', { value: i }, c.city)); });
    if (navigator.geolocation) form.place.appendChild(el('option', { value: 'here' }, 'Mein Standort'));

    meta.cuisines.forEach(function (c) {
      cuisinesEl.appendChild(el('button', {
        type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-cuisine': c,
        onclick: function () {
          this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
          search();
        },
      }, c));
    });
  }

  function locate() {
    statusEl.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(function (pos) {
      here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      search();
    }, function () {
      form.place.value = '0';
      statusEl.textContent = 'Standort nicht verfügbar. Bitte eine Stadt wählen.';
      resultsEl.replaceChildren();
    }, { timeout: 10000, maximumAge: 300000 });
  }

  // --- Suche -------------------------------------------------------------------
  function search() {
    if (!form.date.value) return;
    var origin;
    if (form.place.value === 'here') {
      if (!here) return locate();
      origin = here;
    } else origin = cities[Number(form.place.value)];
    if (!origin) { statusEl.textContent = 'Noch keine Restaurants vorhanden.'; return; }

    var selected = Array.prototype.map.call(
      cuisinesEl.querySelectorAll('[aria-pressed="true"]'), function (b) { return b.getAttribute('data-cuisine'); });
    var q = new URLSearchParams({
      date: form.date.value, time: form.time.value, partySize: form.partySize.value,
      lat: origin.lat, lon: origin.lon, radiusKm: form.radiusKm.value, sort: form.sort.value,
    });
    if (selected.length) q.set('cuisine', selected.join(','));
    if (form.maxPrice.value) q.set('maxPrice', form.maxPrice.value);
    if (form.minRating.value) q.set('minRating', form.minRating.value);

    var mine = ++requestNo;
    statusEl.textContent = 'Suche läuft …';
    getJson('/api/search?' + q).then(function (data) {
      if (mine !== requestNo) return; // veraltete Antwort
      render(data);
    }).catch(function (e) {
      if (mine !== requestNo) return;
      statusEl.textContent = '';
      resultsEl.replaceChildren(el('p', { class: 'err', role: 'alert', text: e.message }));
    });
  }

  function render(data) {
    var n = data.results.length;
    var when = formatDate(data.date) + ', ' + data.time + ' Uhr, ' + data.partySize + (data.partySize === 1 ? ' Person' : ' Personen');
    statusEl.textContent = n
      ? n + (n === 1 ? ' Restaurant' : ' Restaurants') + ' mit freiem Tisch · ' + when
      : 'Kein freier Tisch gefunden für ' + when + '. Versuchen Sie eine andere Uhrzeit, einen größeren Umkreis oder weniger Filter.';

    resultsEl.replaceChildren.apply(resultsEl, data.results.map(function (r) {
      var meta = el('p', { class: 'meta' });
      var parts = [r.cuisine, r.priceLevel ? '€'.repeat(r.priceLevel) : null].filter(Boolean);
      if (r.rating != null) {
        meta.appendChild(el('b', { text: '★ ' + r.rating.toFixed(1).replace('.', ',') }));
        meta.appendChild(document.createTextNode(' (' + r.ratingCount + ')' + (parts.length ? ' · ' : '')));
      }
      meta.appendChild(document.createTextNode(parts.join(' · ')));

      var slots = el('div', { class: 'slots' });
      r.slots.forEach(function (s) {
        slots.appendChild(el('button', {
          type: 'button', class: 'slot' + (s.exact ? ' exact' : ''),
          'aria-label': r.name + ' um ' + s.time + ' Uhr reservieren',
          onclick: function () { openBooking(r, data.date, s.time, data.partySize); },
        }, s.time));
      });

      return el('article', { class: 'card' },
        el('div', { class: 'top' },
          el('h2', { text: r.name }),
          el('span', { class: 'dist', text: r.distanceKm.toFixed(1).replace('.', ',') + ' km' })),
        meta,
        r.description ? el('p', { class: 'desc', text: r.description }) : null,
        r.exact ? null : el('p', { class: 'hint', text: 'Um ' + data.time + ' Uhr ist nichts frei. Andere Zeiten:' }),
        slots,
        r.address ? el('p', { class: 'meta', text: r.address }) : null);
    }));
  }

  // --- Buchung im Dialog -------------------------------------------------------------
  function openBooking(r, date, time, partySize) {
    document.getElementById('dtitle').textContent = r.name;
    var q = new URLSearchParams({ restaurant: r.slug, date: date, time: time, partySize: partySize });
    frame.style.height = '520px';
    frame.src = '/embed.html?' + q;
    dialog.showModal();
  }
  function closeBooking() { dialog.close(); }
  dialog.querySelector('.close').addEventListener('click', closeBooking);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeBooking(); });
  dialog.addEventListener('close', function () { frame.src = 'about:blank'; search(); }); // Verfügbarkeit aktualisieren
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data && e.data.type === 'tischbuchung:resize') {
      frame.style.height = Math.min(e.data.height + 16, window.innerHeight - 80) + 'px';
    }
  });

  // --- Start ---------------------------------------------------------------------------
  form.addEventListener('submit', function (e) { e.preventDefault(); search(); });
  form.addEventListener('change', search);
  getJson('/api/meta').then(function (meta) { fillForm(meta); search(); }).catch(function (e) {
    statusEl.textContent = '';
    resultsEl.replaceChildren(el('p', { class: 'err', role: 'alert', text: e.message }));
  });
})();
