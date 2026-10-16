# حماية مدار

تطبّق الواجهة سياسة CSP تمنع تشغيل البرامج المضمنة وeval وتقيّد البرامج بالملفات المحلية والاتصالات بمصدر CelesTrak والاستضافة نفسها. تبقى الأنماط المضمنة مسموحة لتوافق العارض الحالي. أزيل تحميل الخطوط من Google Fonts؛ يستخدم المتصفح الخطوط المتاحة محليًا.

## حفظ البيانات

«حفظ عملي على هذا الجهاز» يحافظ على المفضلة والمدخلات والنتائج في المتصفح. إيقافه يمسح بيانات مدار القديمة ويعمل بالذاكرة فقط؛ تُفقد الجلسة عند إعادة التحميل. يحذف زر المسح مفاتيح مدار وقاعدة سجلات madar-session فقط، دون حذف بيانات التطبيقات الأخرى على الأصل نفسه. خيار الحفظ ومعرّف جيل المسح إعدادات غير شخصية تبقى في المتصفح حتى يمكن تطبيق الاختيار عبر العلامات. تُستخدم معرّفات الجيل لمنع إعادة حفظ النتائج القديمة بعد المسح.

لا يضيف التطبيق تشفيرًا للتخزين المحلي، ولا يوفر خزنة للمعلومات الحساسة. ملفات Word المحفوظة خارج المتصفح والمشاركة مع تطبيقات أخرى لا يحذفها زر المسح.

## الاستضافة

GitHub Pages يطبّق CSP وReferrer-Policy بواسطة meta. لا تتيح هذه الاستضافة إعداد ترويسات HTTP مخصصة، ولا يمكن فرض frame-ancestors أو Permissions-Policy بواسطة meta. إعداد public/_headers يضيف CSP مع frame-ancestors none، وX-Frame-Options وnosniff وReferrer-Policy وPermissions-Policy وHSTS عند نشر Cloudflare. يطبّق العامل الترويسات كذلك على ردود API والأخطاء.

نُشرت النسخة كذلك على https://madar.aymen684.workers.dev/ في 14 أكتوبر 2026 مع ترويسات Cloudflare وخدمة Word ومحدد الطلبات. يبقى رابط GitHub Pages متاحًا، وترويساته خاضعة للاستضافة.

## خدمة Word في Cloudflare

الخدمة البديلة لا تحفظ الملفات على الخادم. تقبل POST من الأصل نفسه فقط، وتقرأ جسم الطلب تدريجيًا بحد أقصى 12 MB، وتحد حجم المستند بـ8 MiB. تتحقق من الدليل المركزي وبنية ZIP وأسماء الملفات الإلزامية في DOCX، وتمنع الإدخالات المشفرة والمسارات غير الآمنة والمشروعات الماكرو والكائنات المضمنة. لا تستخرج المحتوى ولا تنفّذه؛ الفحص ليس برنامج مكافحة برمجيات خبيثة ولا مراجعة لكل XML داخل المستند.

يتطلب العامل رابط WORD_LIMITER؛ غيابه أو تعطل المحدد يعيد 503 بدل فتح الخدمة دون تحديد. الحد 10 طلبات لكل دقيقة لكل عنوان IP في موقع Cloudflare، باستخدام CF-Connecting-IP الموثوق من الاستضافة. هذه حماية إساءة استخدام وليست حساب مستخدم أو حدًا عالميًا دقيقًا. عند نشر عدة مشاريع يجب تخصيص namespace_id مختلف للمحدد.

## الاعتماديات والفحوص

إصدارات Wrangler وPlaywright مثبتة مع package-lock.json. يسجل tools/vendor-audit شجرة مرجعية لإصدارات المكتبات المضمّنة في التطبيق ويستخدم npm audit لفحص التنبيهات المعروفة. يتكرر الفحص في طلبات الدمج وجدول أسبوعي، وتفتح Dependabot طلبات تحديث. تحديث سجل الفحص وحده لا يعيد بناء ملفات vendor المضغوطة؛ عند تحديث مكتبة يجب تحديث الحزمة الفعلية وبصمة packed/manifest.json وفحص العرض والتقارير.

الفحوص تشمل الأصل ونوع المحتوى وحجم الطلب المتدفق وبنية DOCX وتحديد الطلبات وحماية الصفحة وحفظ البيانات. لا تمثل هذه الفحوص اختبار اختراق شاملًا أو ضمانًا لعدم وجود ثغرات غير معلنة.


## Local-only reports and public read requests (revision 43)

The `/api/word` and `/api/word.docx` upload services have been retired (410); no request body is consumed. Reports, searches, observer coordinates and watchlists remain in browser storage/memory unless the user explicitly exports or shares a file. Forms cannot submit (`form-action 'none'`) and third-party frames are blocked (`frame-src 'none'`). Older upload-service descriptions above are historical and no longer describe the current deployment.

A generated public-resource list restricts application fetch/XHR requests to read-only static resources and fixed public orbital group queries. Arbitrary parameters, per-object NORAD queries, bodies, custom headers, credentials, beacons and sockets are rejected. The same guard runs in the calculation workers; it does not run in propagation loops. This supplements CSP and trusted-code review; it does not protect a compromised browser/device or make same-origin hostile code safe. User-opened external links and user-chosen OS sharing destinations remain outside this guarantee.

Saved data is currently not encrypted by Madar. Updates may be disabled independently of local saving; disabling them does not make initial site/resource loading offline or conceal the network address from the hosting provider.
