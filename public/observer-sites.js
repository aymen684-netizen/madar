(function (root) {
  'use strict';
  let serial = 0;
  const model = ObserverSitesCore.create({
    privacy: Privacy,
    id: () => root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + ++serial,
  });
  function mount(form, { prefix, read, apply, nameInput }) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'observer-sites';
    fieldset.innerHTML =
      '<legend>مواقع الرصد المحفوظة</legend><label>استخدام موقع محفوظ<select></select></label><div class="observer-sites-actions"><button type="button">حفظ كموقع جديد</button><button type="button">تحديث الموقع المختار</button><button type="button">حذف الموقع المختار</button></div><p>اكتب اسم الموقع وإحداثياته في الحقول أدناه، ثم احفظه. اختيار موقع يملأ الحقول فقط؛ يبدأ الحساب عند الضغط على زر الحساب.</p><p class="observer-sites-storage"></p><p class="observer-sites-status" role="status" aria-live="polite"></p>';
    const select = fieldset.querySelector('select'),
      [save, update, remove] = fieldset.querySelectorAll('button'),
      status = fieldset.querySelector('.observer-sites-status'),
      storage = fieldset.querySelector('.observer-sites-storage');
    select.id = prefix + '-site-select';
    save.id = prefix + '-site-save';
    update.id = prefix + '-site-update';
    remove.id = prefix + '-site-delete';
    function locked() {
      return form.getAttribute('aria-busy') === 'true';
    }
    function sync() {
      const selected = select.value;
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'اختر موقعًا محفوظًا';
      select.append(empty);
      for (const site of model.all()) {
        const option = document.createElement('option');
        option.value = site.id;
        option.dataset.noTranslate = '';
        option.dir = 'auto';
        option.textContent = site.name;
        select.append(option);
      }
      select.value = [...select.options].some((o) => o.value === selected) ? selected : '';
      update.disabled = remove.disabled = !select.value || locked();
      save.disabled = select.disabled = locked();
      storage.textContent = model.sessionOnly()
        ? 'تعذّر التخزين على الجهاز؛ تبقى التعديلات الجديدة لهذه الجلسة فقط حتى إعادة تحميل الصفحة.'
        : Privacy.persistent()
          ? 'الحفظ على هذا الجهاز مفعّل؛ تبقى المواقع في هذا المتصفح حتى حذفها أو مسح بيانات مدار.'
          : 'الحفظ على الجهاز متوقف؛ تبقى المواقع لهذه الجلسة فقط.';
    }
    function announce(message) {
      status.textContent = message;
    }
    select.onchange = () => {
      if (locked()) return;
      const site = model.all().find((s) => s.id === select.value);
      sync();
      if (!site) return;
      nameInput.value = site.name;
      apply(site);
      announce('طُبّق الموقع على الحقول. اضغط حسابًا لتحديث النتائج.');
    };
    function store(selected = null) {
      if (locked()) return;
      try {
        const saved = model.save({ ...read(), name: nameInput.value }, selected);
        document.dispatchEvent(new Event('madar-observer-sites'));
        select.value = saved.site.id;
        sync();
        announce(saved.persistent ? 'حُفظ الموقع على هذا الجهاز.' : 'حُفظ الموقع لهذه الجلسة فقط.');
      } catch (error) {
        announce(error.message);
      }
    }
    save.onclick = () => store();
    update.onclick = () => {
      if (select.value) store(select.value);
    };
    remove.onclick = () => {
      if (locked() || !select.value) return;
      try {
        const removed = model.remove(select.value);
        document.dispatchEvent(new Event('madar-observer-sites'));
        announce(
          removed.persistent
            ? 'حُذف الموقع المحفوظ؛ لم تتغير المدخلات أو التقارير.'
            : 'حُذف الموقع من قائمة هذه الجلسة فقط.',
        );
      } catch (error) {
        sync();
        announce(error.message);
      }
    };
    document.addEventListener('madar-observer-sites', sync);
    new MutationObserver(sync).observe(form, { attributes: true, attributeFilter: ['aria-busy'] });
    form.prepend(fieldset);
    nameInput.dir = 'auto';
    sync();
    return { sync };
  }
  root.addEventListener('storage', (e) => {
    if (e.key === ObserverSitesCore.KEY || e.key === null)
      document.dispatchEvent(new Event('madar-observer-sites'));
  });
  root.ObserverSites = { mount };
})(window);
