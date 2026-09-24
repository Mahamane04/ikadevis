/* Marketing interactions only. No account, payment or application state is touched. */
(() => {
  'use strict';
  const menu = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  function setMenu(open) {
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    navigation.classList.toggle('is-open', open);
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setMenu(false); });
  matchMedia('(min-width: 701px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

  // Deliberately simplified illustration: linear surface-based rates, 5% material
  // waste, no overhead, 25% margin on sale price. These are NOT catalog prices.
  const examples = {
    construction: { name: 'Mur en maçonnerie', materials: 'Blocs, ciment & sable', rate: 12500, labor: 3500, caption: 'Maçonnerie' },
    metal: { name: 'Portail métallique', materials: 'Profilés, tôles & accessoires', rate: 15000, labor: 5000, caption: 'Fabrication & pose' },
    wood: { name: 'Agencement en bois', materials: 'Panneaux, quincaillerie & finition', rate: 22000, labor: 7000, caption: 'Fabrication & finition' },
    facade: { name: 'Habillage de façade ACM', materials: 'Panneaux, ossature & fixations', rate: 28000, labor: 6000, caption: 'Fourniture & pose' }
  };
  let selected = 'construction';
  const range = document.querySelector('#demo-surface');
  const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const surfaceFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const put = (id, text) => { document.getElementById(id).textContent = text; };
  function renderEstimate() {
    const example = examples[selected];
    const area = Number(range.value);
    const materials = Math.round(area * example.rate);
    const waste = Math.round(materials * .05);
    const labor = Math.round(area * example.labor);
    const cost = materials + waste + labor;
    const sale = Math.round(cost / .75);
    put('surface-value', surfaceFormat.format(area) + ' m²');
    range.setAttribute('aria-valuetext', surfaceFormat.format(area) + ' mètres carrés');
    put('estimate-name', example.name);
    put('drawing-caption', example.caption + ' · ' + surfaceFormat.format(area) + ' m²');
    put('materials-label', example.materials);
    for (const [id, value] of [['materials-price', materials], ['waste-price', waste], ['labor-price', labor], ['cost-price', cost]]) put(id, format.format(value) + ' F');
    const saleOutput = document.getElementById('sale-price');
    saleOutput.replaceChildren(document.createTextNode(format.format(sale) + ' '));
    const currency = document.createElement('small');
    currency.textContent = 'FCFA';
    saleOutput.append(currency);
    document.querySelectorAll('[data-trade]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.trade === selected)));
    Object.keys(examples).forEach(key => { document.getElementById('drawing-' + key).style.display = key === selected ? '' : 'none'; });
  }
  document.querySelectorAll('[data-trade], [data-demo-trade]').forEach(control => control.addEventListener('click', () => {
    const key = control.dataset.trade || control.dataset.demoTrade;
    if (Object.hasOwn(examples, key)) { selected = key; renderEstimate(); }
  }));
  range.addEventListener('input', renderEstimate);
  renderEstimate();
  put('year', String(new Date().getFullYear()));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.remove('is-pending'); observer.unobserve(entry.target); }
      });
    }, { threshold: .08, rootMargin: '0px 0px 30px 0px' });
    document.querySelectorAll('.reveal').forEach(element => {
      element.classList.add('is-pending');
      observer.observe(element);
    });
    reducedMotion.addEventListener('change', event => {
      if (event.matches) { observer.disconnect(); document.querySelectorAll('.is-pending').forEach(element => element.classList.remove('is-pending')); }
    });
  }
})();
