"""Build the two versioned overview documents and their exact in-app previews."""
from pathlib import Path
import json,hashlib
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
ROOT=Path(__file__).resolve().parents[1]
content=json.loads((ROOT/'scripts/overview-content.json').read_text())
for lang,entries in content.items():
    ar=lang=='ar';doc=Document();section=doc.sections[0]
    section.page_width=Inches(8.27);section.page_height=Inches(11.69)
    section.top_margin=section.bottom_margin=Inches(.7);section.left_margin=section.right_margin=Inches(.8)
    for name in ['Normal','Title','Heading 1']:
        style=doc.styles[name];style.font.name='Arial';style.font.color.rgb=RGBColor(0,0,0)
        style.font.size=Pt(12 if name=='Normal' else 23 if name=='Title' else 15)
        style.paragraph_format.space_after=Pt(8 if name=='Normal' else 12)
        style.paragraph_format.line_spacing=1.15
        if name=='Heading 1':style.paragraph_format.space_before=Pt(14)
    for style in doc.styles:
        for border in list(style.element.iter(qn('w:pBdr'))):border.getparent().remove(border)
    for i,(text,heading) in enumerate(entries):
        p=doc.add_paragraph(text,'Title' if i==0 else 'Heading 1' if heading else 'Normal')
        p.alignment=WD_ALIGN_PARAGRAPH.RIGHT if ar else WD_ALIGN_PARAGRAPH.LEFT
        if ar:p._p.get_or_add_pPr().find(qn('w:jc')).set(qn('w:val'),'start' if not text.startswith('https://') else 'left')
        if ar and not text.startswith('https://'):
            bidi=OxmlElement('w:bidi');bidi.set(qn('w:val'),'1');p._p.get_or_add_pPr().append(bidi)
            for run in p.runs:
                rtl=OxmlElement('w:rtl');rtl.set(qn('w:val'),'1');run._r.get_or_add_rPr().append(rtl)
                fonts=OxmlElement('w:rFonts');fonts.set(qn('w:cs'),'Arial');run._r.get_or_add_rPr().append(fonts)
    path=ROOT/('public/downloads/madar-overview'+('' if ar else '-en')+'.docx')
    doc.core_properties.title=entries[0][0];doc.core_properties.author='Madar';doc.core_properties.subject='Application features and usage'
    doc.save(path)
    data={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'version':'16 أكتوبر 2026' if ar else '16 October 2026','paragraphs':[{'text':t,'heading':bool(h and i)}for i,(t,h)in enumerate(entries)]}
    (ROOT/('public/data/program-overview'+('' if ar else '-en')+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
