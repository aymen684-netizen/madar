(function () {
  'use strict';
  const $ = (id) => document.getElementById(id),
    make = (tag, text) => {
      const n = document.createElement(tag);
      if (text) n.textContent = text;
      return n;
    };
  const brand = document.querySelector('.brand'),
    mark = make('img');
  mark.src = 'icons/madar-symbol-64-v76.png';
  mark.alt = '';
  mark.width = 54;
  mark.height = 54;
  mark.className = 'madar-mark';
  brand.querySelector('.logo')?.replaceWith(mark);
  brand.setAttribute('aria-label', 'مدار');
  const language = make('button');
  language.type = 'button';
  language.id = 'language-toggle';
  language.dataset.noTranslate = '';
  language.setAttribute('aria-label', 'Switch to English');
  language.onclick = () => MadarI18n.setLanguage(MadarI18n.language === 'ar' ? 'en' : 'ar');
  document.querySelector('header .top').prepend(language);
  function languageState() {
    const en = MadarI18n.language === 'en';
    for (const b of [language, $('welcome-language')])
      if (b) {
        b.textContent = en ? 'العربية' : 'English';
        b.setAttribute('aria-label', en ? 'التبديل إلى العربية' : 'Switch to English');
      }
    document.title = en ? 'Madar | Satellite explorer' : 'مدار | مرصدك الفضائي';
    if ($('welcome-language')) $('welcome-language').lang = en ? 'ar' : 'en';
  }
  document.addEventListener('madar-language', languageState);
  MadarI18n.ready.then(languageState);
  $('shell-nav-help').innerHTML =
    '<span aria-hidden="true">ⓘ</span><span class="help-button-label">النبذة والمساعدة</span>';
  const reportForm = $('report-form'),
    scope = make('fieldset');
  scope.className = 'report-step';
  scope.id = 'report-scope-step';
  scope.append(make('legend', 'حدد نطاق التقرير'), reportForm.querySelector('.report-grid'));
  $('report-builder').after(scope);
  const actionTitle = make('h3', 'احسب وراجع ثم صدّر');
  actionTitle.id = 'report-action-title';
  scope.after(actionTitle);
  const hint = make('p', 'الحقول الملوّنة مخصصة للإدخال.');
  hint.className = 'report-form-hint';
  reportForm.before(hint);
  for (const id of [
    'report-country',
    'report-start-date',
    'report-start-time',
    'report-end-date',
    'report-end-time',
  ])
    $(id).setAttribute('aria-required', 'true');
  for (const id of [
    'report-run',
    'analysis-run',
    'observer-run',
    'live-video-play',
    'report-view-apply',
  ])
    $(id)?.classList.add('action-primary');
  for (const id of [
    'report-download',
    'analysis-download',
    'observer-download',
    'watchlist-export',
  ])
    $(id)?.classList.add('action-download');
  for (const id of ['report-cancel', 'analysis-cancel', 'observer-cancel', 'clear-private-data'])
    $(id)?.classList.add('action-caution');
  const welcome = $('welcome-dialog');
  const mapUnavailable = () => $('globe').dataset.renderState === 'unavailable';
  function start(route = location.hash.slice(1) || 'map') {
    try {
      localStorage.setItem('madar-started', '1');
    } catch {}
    document.body.classList.remove('startup');
    welcome.close();
    MadarShell.show(mapUnavailable() && route === 'map' ? 'catalog' : route, { focus: true });
    window.dispatchEvent(new Event('resize'));
  }
  $('welcome-start').onclick = () => start();
  $('welcome-track').onclick = () => {
    start('catalog');
    $('search').focus();
  };
  $('welcome-country').onclick = () => {
    MadarShell.selectReport('inventory');
    start('reports');
    $('inventory-owner').focus();
  };
  $('welcome-report').onclick = () => {
    start('reports');
    $('shell-report-' + MadarShell.report()).focus();
  };
  $('welcome-language').onclick = language.onclick;
  $('welcome-language').disabled = false;
  function ready() {
    for (const id of ['welcome-start', 'welcome-track', 'welcome-country', 'welcome-report'])
      $(id).disabled = false;
  }
  function mapFailure() {
    welcome.querySelector('.welcome-note').textContent =
      'الخارطة غير متاحة في هذا المتصفح. يمكنك فتح دليل الأقمار والتقارير؛ قد يستمر تحميل البيانات في الخلفية.';
    ready();
  }
  document.addEventListener('madar-map-unavailable', mapFailure);
  if (mapUnavailable()) mapFailure();
  Promise.resolve(window.MadarStartupReady).then(ready, ready);
  welcome.addEventListener('cancel', (event) => event.preventDefault());
  const reopen = make('button', 'العودة إلى شاشة البداية');
  reopen.id = 'welcome-reopen';
  reopen.type = 'button';
  reopen.onclick = () => welcome.showModal();
  const helpActions = make('div');
  helpActions.className = 'info-actions help-footer-actions';
  helpActions.append($('shell-help').querySelector(':scope > a.launch'), reopen);
  $('shell-help').append(helpActions);
  welcome.close();
  welcome.showModal();
  languageState();
})();
