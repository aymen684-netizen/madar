(function (root) {
  'use strict';
  // Approximate city points from Natural Earth 1:10m populated places. No lookup service.
  // Source URL, retrieval date and source SHA-256 are recorded in credits.txt.
  const cities = [
    ['riyadh', 'الرياض', 'Riyadh', 24.634497, 46.720487],
    ['jeddah', 'جدة', 'Jeddah', 21.518835, 39.217252],
    ['makkah', 'مكة المكرمة', 'Makkah', 21.431967, 39.818094],
    ['medina', 'المدينة المنورة', 'Medina', 24.501935, 39.578057],
    ['dammam', 'الدمام', 'Dammam', 26.430138, 50.097724],
    ['tabuk', 'تبوك', 'Tabuk', 28.383835, 36.554967],
    ['abha', 'أبها', 'Abha', 18.230087, 42.500134],
    ['jizan', 'جازان', 'Jizan', 16.906551, 42.556565],
    ['najran', 'نجران', 'Najran', 17.50654, 44.131559],
    ['hail', 'حائل', 'Hail', 27.523577, 41.70008],
    ['buraydah', 'بريدة', 'Buraydah', 26.366387, 43.962836],
    ['taif', 'الطائف', 'At Taif', 21.262228, 40.382279],
    ['sakakah', 'سكاكا', 'Sakakah', 29.999997, 40.133305],
    ['arar', 'عرعر', 'Arar', 30.990006, 41.02069],
    ['dubai', 'دبي', 'Dubai', 25.214912, 55.286946],
    ['abu-dhabi', 'أبوظبي', 'Abu Dhabi', 24.466684, 54.366593],
    ['doha', 'الدوحة', 'Doha', 25.286556, 51.532968],
    ['manama', 'المنامة', 'Manama', 26.236136, 50.583052],
    ['kuwait', 'مدينة الكويت', 'Kuwait City', 29.371664, 47.976355],
    ['muscat', 'مسقط', 'Muscat', 23.585179, 58.378311],
    ['amman', 'عمّان', 'Amman', 31.951971, 35.931354],
    ['cairo', 'القاهرة', 'Cairo', 30.051906, 31.248022],
    ['beirut', 'بيروت', 'Beirut', 33.873921, 35.507762],
    ['baghdad', 'بغداد', 'Baghdad', 33.340594, 44.391923],
    ['tunis', 'تونس', 'Tunis', 36.802778, 10.179678],
    ['algiers', 'الجزائر', 'Algiers', 36.765011, 3.048607],
    ['rabat', 'الرباط', 'Rabat', 34.025307, -6.836408],
  ];
  function mount(host, { prefix, locked, apply }) {
    const T = (s) => root.MadarI18n.translate(s),
      details = document.createElement('details');
    details.id = prefix + '-city-picker';
    details.className = 'observer-city-picker';
    details.innerHTML =
      '<summary>اختيار مدينة من قائمة محلية</summary><label>بحث المدينة<input type="search" autocomplete="off" maxlength="80" placeholder="ابحث بالعربية أو الإنجليزية"></label><label>المدينة<select></select></label><button type="button">استخدام إحداثيات المدينة</button><p>نقطة تقريبية للمدينة من Natural Earth؛ راجع الموقع والارتفاع والتوقيت. لا يتغير الارتفاع أو التوقيت، ولا يُحفظ الموقع أو يبدأ الحساب تلقائيًا.</p><p class="observer-city-status" role="status" aria-live="polite"></p>';
    const search = details.querySelector('input'),
      select = details.querySelector('select'),
      button = details.querySelector('button'),
      status = details.querySelector('.observer-city-status');
    search.id = prefix + '-city-search';
    select.id = prefix + '-city-select';
    button.id = prefix + '-city-apply';
    function render() {
      const selected = select.value,
        query = root.CatalogSearch.normalize(search.value),
        matches = cities.filter((city) =>
          root.CatalogSearch.normalize(city[1] + ' ' + city[2]).includes(query),
        );
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = T(
        matches.length
          ? 'اختر مدينة لتطبيقها على الحقول'
          : 'لا توجد مدينة مطابقة؛ يمكنك إدخال الإحداثيات يدويًا.',
      );
      select.append(empty);
      for (const city of matches) {
        const option = document.createElement('option');
        option.value = city[0];
        option.dataset.noTranslate = '';
        option.textContent = root.MadarI18n.language === 'en' ? city[2] : city[1];
        select.append(option);
      }
      if (matches.some((city) => city[0] === selected)) select.value = selected;
      sync();
    }
    function sync() {
      search.disabled = select.disabled = locked();
      button.disabled = locked() || !select.value;
    }
    search.oninput = render;
    search.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        select.focus();
      }
    };
    select.onchange = sync;
    button.onclick = () => {
      if (locked()) return;
      const city = cities.find((c) => c[0] === select.value);
      if (!city) return;
      apply({
        name: root.MadarI18n.language === 'en' ? city[2] : city[1],
        lat: city[3],
        lon: city[4],
      });
      status.textContent = T(
        'طُبّقت نقطة المدينة على الحقول فقط. راجع الارتفاع والتوقيت قبل الحساب أو حفظ الموقع.',
      );
    };
    host.append(details);
    document.addEventListener('madar-language', render);
    render();
    return { sync };
  }
  root.ObserverCities = { mount };
})(window);
