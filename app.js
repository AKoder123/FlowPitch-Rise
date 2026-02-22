/*
  FlowPitch landing deck renderer
  - Loads content.json
  - Scroll-snap sections + Space/Arrow navigation
  - Compact layout + header-safe offset on mobile
  - Slide-enter animations
  - Export PDF (client-side) with all elements visible
*/
(function(){
  const APP = document.getElementById('app');
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function setCompact(){
    const h = window.innerHeight || 800;
    document.body.classList.toggle('compact', h <= 720);
  }

  function setTopOffset(){
    const header = document.querySelector('.topbar');
    if(!header) return;
    const h = Math.ceil(header.getBoundingClientRect().height);
    // extra buffer for iOS dynamic bars
    const offset = h + 28;
    document.documentElement.style.setProperty('--topOffset', offset + 'px');
  }

  function tagForAnimation(root){
    const targets = root.querySelectorAll(
      '.kicker, .h1, .h2, .p, .actions, .heroCard, .card, .bigCard, .step'
    );
    targets.forEach((el, i) => {
      el.setAttribute('data-animate', 'rise');
      el.style.setProperty('--stagger', String(i));
    });
  }

  function setExportingVisible(on){
    // Used for both print and canvas export: force all slides visible
    const deck = document.querySelector('.deck');
    if(!deck) return;
    deck.querySelectorAll('.slide').forEach(s => {
      if(on) s.classList.add('is-active');
    });
  }

  function setupPdfExport(){
    const btn = document.getElementById('exportPdfBtn');
    if(!btn) return;

    const loadScript = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    const ensureLibs = async () => {
      if(!window.html2canvas){
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }
      if(!window.jspdf || !window.jspdf.jsPDF){
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }
    };

    const setBusy = (busy) => {
      btn.disabled = busy;
      btn.style.opacity = busy ? '0.65' : '1';
      btn.textContent = busy ? 'Exporting…' : 'Export PDF';
      btn.style.pointerEvents = busy ? 'none' : 'auto';
    };

    const buildStageForSlide = (slideEl) => {
      const stage = document.createElement('div');
      stage.id = 'pdfStage';

      const bg = document.querySelector('.bg');
      if(bg) stage.appendChild(bg.cloneNode(true));

      const app = document.createElement('div');
      app.className = 'app';

      const s = slideEl.cloneNode(true);
      s.classList.add('is-active');
      app.appendChild(s);

      stage.appendChild(app);
      document.body.appendChild(stage);
      return stage;
    };

    const removeStage = (stage) => {
      if(stage && stage.parentNode) stage.parentNode.removeChild(stage);
    };

    const exportPdf = async () => {
      try{
        setBusy(true);
        document.body.classList.add('exportingPdf');
        setExportingVisible(true);
        await ensureLibs();

        const { jsPDF } = window.jspdf;
        const deck = document.querySelector('.deck');
        if(!deck) throw new Error('Deck not ready');

        const slides = Array.from(deck.querySelectorAll('.slide'));
        if(!slides.length) throw new Error('No slides found');

        // Exact 16:9 pages
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1920, 1080] });

        for(let i=0;i<slides.length;i++){
          const stage = buildStageForSlide(slides[i]);

          // Let layout settle
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

          const canvas = await window.html2canvas(stage, {
            backgroundColor: '#050611',
            scale: 2,
            useCORS: true,
            logging: false
          });

          const imgData = canvas.toDataURL('image/png');
          if(i > 0) pdf.addPage([1920, 1080], 'landscape');
          pdf.addImage(imgData, 'PNG', 0, 0, 1920, 1080, undefined, 'FAST');

          removeStage(stage);
        }

        pdf.save('FlowPitch.pdf');
      }catch(err){
        console.error(err);
        alert('PDF export failed. If CDN scripts are blocked on your host, allow cdnjs.cloudflare.com or self-host html2canvas + jsPDF.');
      }finally{
        document.body.classList.remove('exportingPdf');
        setBusy(false);
      }
    };

    btn.addEventListener('click', exportPdf);
  }

  async function load(){
    setCompact();
    setTopOffset();
    window.addEventListener('resize', () => { setCompact(); setTopOffset(); }, {passive:true});
    window.addEventListener('orientationchange', () => { setCompact(); setTopOffset(); });

    const res = await fetch('content.json', {cache: 'no-store'});
    if(!res.ok) throw new Error('Failed to load content.json');
    const data = await res.json();

    document.title = (data?.meta?.title) ? data.meta.title : 'FlowPitch';

    const deck = document.createElement('div');
    deck.className = 'deck';
    deck.setAttribute('role', 'region');
    deck.setAttribute('aria-label', 'FlowPitch sections');

    const slides = Array.isArray(data.slides) ? data.slides : [];
    slides.forEach((s, idx) => deck.appendChild(renderSlide(s, idx)));

    APP.innerHTML = '';
    APP.appendChild(deck);

    requestAnimationFrame(() => setTopOffset());
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => setTopOffset()).catch(() => {});
    }

    setupNav(deck);
    setupPdfExport();
  }

  function renderSlide(slide, idx){
    const type = slide.type || 'content';
    const section = document.createElement('section');
    section.className = 'slide' + (type === 'closing' ? ' slide--center' : '');
    section.dataset.index = String(idx);
    section.id = String(idx);

    const inner = document.createElement('div');
    inner.className = 'slide__inner';

    const left = document.createElement('div');
    left.appendChild(buildHeader(slide, type));

    const right = document.createElement('div');

    if(type === 'title'){
      right.appendChild(buildHeroVisual());
      left.appendChild(buildHeroActions());
    } else if(type === 'content' && slide.note === 'Problem cards'){
      right.appendChild(buildCards([
        {title:'PDFs kill momentum', desc:'Recipients skim, bounce, and you get zero signal back.', icon:'file'},
        {title:'No engagement insights', desc:'Did they read it? What mattered? You\'ll never know.', icon:'search'},
        {title:'Quality varies wildly', desc:'The story breaks across devices, formats, and viewers.', icon:'palette'},
      ]));
    } else if(type === 'content' && slide.note === 'Solution cards'){
      right.appendChild(buildCards([
        {title:'One link, zero friction', desc:'Share a single URL. No attachments, no broken layouts.', icon:'dot'},
        {title:'Feels like a mini-site', desc:'Brandable themes, smooth navigation, premium reading.', icon:'dot'},
        {title:'Measurable impact', desc:'Know what got read—then follow up with precision.', icon:'dot'},
      ]));
    } else if(type === 'content' && slide.note === 'Steps'){
      right.appendChild(buildSteps());
    } else if(type === 'closing'){
      const card = document.createElement('div');
      card.className = 'bigCard';
      card.appendChild(buildHeader(slide, 'closing'));
      card.appendChild(buildClosingAction());
      inner.appendChild(card);
      section.appendChild(inner);
      tagForAnimation(section);
      return section;
    } else {
      right.appendChild(buildCardsFromBullets(slide));
    }

    inner.appendChild(left);
    inner.appendChild(right);
    section.appendChild(inner);
    tagForAnimation(section);
    return section;
  }

  function buildHeader(slide, type){
    const wrap = document.createElement('div');

    if(type === 'title' && Array.isArray(slide.bullets) && slide.bullets[0]){
      const kicker = document.createElement('div');
      kicker.className = 'kicker';
      const dot = document.createElement('span');
      dot.className = 'kicker__dot';
      dot.setAttribute('aria-hidden', 'true');
      const txt = document.createElement('span');
      txt.textContent = slide.bullets[0];
      kicker.appendChild(dot);
      kicker.appendChild(txt);
      wrap.appendChild(kicker);
    }

    const h = document.createElement('h1');
    h.className = (type === 'title') ? 'h1' : 'h2';
    h.innerHTML = stylizeHeadline(slide.headline || '');
    wrap.appendChild(h);

    if(slide.subheadline){
      const p = document.createElement('p');
      p.className = 'p';
      p.textContent = slide.subheadline;
      wrap.appendChild(p);
    }
    return wrap;
  }

  function stylizeHeadline(headline){
    const lines = String(headline).split('\n');
    const safe = lines.map(escapeHtml);

    if(safe.join('\n').includes('Web-native pitches.')){
      return safe.join('<br/>')
        .replace('Decks', '<span class="grad">Decks</span>')
        .replace('upgraded.', '<span class="grad">upgraded.</span>');
    }

    if(safe.join('\n').includes('Stop sending')){
      return safe.join('<br/>')
        .replace('Start', '<span class="grad">Start</span>')
        .replace('sending', '<span class="grad">sending</span>')
        .replace('experiences.', '<span class="grad">experiences.</span>');
    }

    return safe.join('<br/>');
  }

  function buildHeroActions(){
    const actions = document.createElement('div');
    actions.className = 'actions';

    const a = document.createElement('a');
    a.className = 'btn btn--primary';
    a.href = 'https://forms.gle/5dBfBjsfjzXrHoW27';
    a.innerHTML = 'Start for free <span class="btn__arrow" aria-hidden="true">→</span>';

    const b = document.createElement('a');
    b.className = 'btn btn--ghost';
    b.href = '#demo';
    b.textContent = 'Watch demo';

    actions.appendChild(a);
    actions.appendChild(b);
    return actions;
  }

  function buildHeroVisual(){
    const card = document.createElement('div');
    card.className = 'heroCard';

    const media = document.createElement('div');
    media.className = 'heroCard__media';

    const planes = document.createElement('div');
    planes.className = 'deckPlanes';
    const l = document.createElement('div'); l.className = 'plane plane--l';
    const m = document.createElement('div'); m.className = 'plane plane--m';
    const r = document.createElement('div'); r.className = 'plane plane--r';
    planes.appendChild(l); planes.appendChild(m); planes.appendChild(r);

    media.appendChild(planes);
    card.appendChild(media);
    return card;
  }

  function buildCards(items){
    const wrap = document.createElement('div');
    wrap.className = 'cards';
    items.forEach(it => {
      const c = document.createElement('div');
      c.className = 'card';

      const row = document.createElement('div');
      row.className = 'card__row';

      const ic = document.createElement('div');
      ic.className = 'card__icon';
      ic.setAttribute('aria-hidden', 'true');

      if(it.icon === 'file'){
        ic.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l3 3v15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="rgba(255,255,255,.72)" stroke-width="1.6"/><path d="M14 3v4a2 2 0 0 0 2 2h4" stroke="rgba(255,255,255,.72)" stroke-width="1.6"/></svg>';
      } else if(it.icon === 'search'){
        ic.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="rgba(255,255,255,.72)" stroke-width="1.6"/><path d="M16.5 16.5 21 21" stroke="rgba(255,255,255,.72)" stroke-width="1.6" stroke-linecap="round"/></svg>';
      } else if(it.icon === 'palette'){
        ic.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H13a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10H12Z" stroke="rgba(255,255,255,.72)" stroke-width="1.6"/><path d="M8 11h.01M9 7h.01M12 6h.01M16 8h.01" stroke="rgba(255,255,255,.72)" stroke-width="2.2" stroke-linecap="round"/></svg>';
      } else {
        const d = document.createElement('span');
        d.className = 'dot';
        ic.appendChild(d);
      }

      const col = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'card__title';
      t.textContent = it.title;
      const d = document.createElement('p');
      d.className = 'card__desc';
      d.textContent = it.desc;

      col.appendChild(t);
      col.appendChild(d);

      row.appendChild(ic);
      row.appendChild(col);
      c.appendChild(row);
      wrap.appendChild(c);
    });
    return wrap;
  }

  function buildCardsFromBullets(slide){
    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    const items = bullets.slice(0, 3).map(b => ({title: b, desc: '—'}));
    return buildCards(items);
  }

  function buildSteps(){
    const wrap = document.createElement('div');
    wrap.className = 'steps';

    const steps = [
      {n:'01', t:'Upload your deck', d:'Drop a PPT, PDF, or Google Slides link.'},
      {n:'02', t:'Theme it your way', d:'Apply brand colors, fonts, and layout in one click.'},
      {n:'03', t:'Publish & share', d:'Send a pitch link that looks great everywhere.'},
    ];

    steps.forEach(s => {
      const row = document.createElement('div');
      row.className = 'step';

      const num = document.createElement('div');
      num.className = 'step__num';
      num.textContent = s.n;

      const col = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'step__title';
      t.textContent = s.t;
      const d = document.createElement('p');
      d.className = 'step__desc';
      d.textContent = s.d;
      col.appendChild(t);
      col.appendChild(d);

      row.appendChild(num);
      row.appendChild(col);
      wrap.appendChild(row);
    });

    return wrap;
  }

  function buildClosingAction(){
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.justifyContent = 'center';

    const a = document.createElement('a');
    a.className = 'btn btn--primary';
    a.href = 'https://forms.gle/5dBfBjsfjzXrHoW27';
    a.innerHTML = 'Get started for free <span class="btn__arrow" aria-hidden="true">→</span>';
    actions.appendChild(a);

    return actions;
  }

  function setupNav(container){
    let index = 0;
    const slides = () => Array.from(container.querySelectorAll('.slide'));

    function go(next){
      const list = slides();
      const max = Math.max(0, list.length - 1);
      index = clamp(next, 0, max);
      const el = list[index];
      if(!el) return;
      const top = el.offsetTop;
      container.parentElement.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
    }

    let raf = 0;
    container.parentElement.addEventListener('scroll', () => {
      if(raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const sc = container.parentElement.scrollTop;
        const list = slides();
        let best = 0, bestDist = Infinity;
        for(let i=0;i<list.length;i++){
          const d = Math.abs(list[i].offsetTop - sc);
          if(d < bestDist){ bestDist = d; best = i; }
        }
        index = best;
      });
    }, {passive:true});

    window.addEventListener('keydown', (e) => {
      const key = e.key;
      const isTyping = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) ? e.target.tagName : '');
      if(isTyping) return;

      if(key === ' ' || key === 'ArrowDown' || key === 'PageDown'){
        e.preventDefault(); go(index + 1);
      } else if(key === 'ArrowUp' || key === 'PageUp'){
        e.preventDefault(); go(index - 1);
      }
    });

    go(0);

    // Activate slides on enter (drives CSS reveal)
    const list = slides();
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('is-active');
        }
      });
    }, { root: container.parentElement, threshold: 0.55 });

    list.forEach(s => obs.observe(s));
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  load().catch(err => {
    console.error(err);
    APP.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'slide slide--center';
    const inner = document.createElement('div');
    inner.className = 'slide__inner';
    const card = document.createElement('div');
    card.className = 'bigCard';
    card.innerHTML = '<h1 class="h2">Could not load content</h1><p class="p">Make sure content.json is next to index.html.</p>';
    inner.appendChild(card);
    s.appendChild(inner);
    APP.appendChild(s);
  });
})();
