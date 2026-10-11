/* docx-writer.js — يحوّل HTML (من المحرر) إلى ملف Word .docx حقيقي
   يدعم: فقرات، عناوين، عريض/مائل/تسطير/يتوسطه خط، ألوان، أحجام، محاذاة، اتجاه RTL،
   قوائم نقطية ومرقمة (مع تداخل)، جداول، صور، روابط، فواصل أسطر. */
'use strict';
const DocxWriter = (() => {
  const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const HEAD = { H1: [40, 'Heading1'], H2: [32, 'Heading2'], H3: [28, 'Heading3'], H4: [24, 'Heading4'], H5: [22, 'Heading5'], H6: [22, 'Heading6'] };
  const FONT_SIZES = { 1: 16, 2: 20, 3: 24, 4: 28, 5: 36, 6: 48, 7: 72 }; // half-points

  function colorHex(c) {
    if (!c) return null;
    if (c.startsWith('#')) { let h = c.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return h.toUpperCase(); }
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (m) { if (m[4] !== undefined && +m[4] === 0) return null; return [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase(); }
    return null;
  }

  async function fromHTML(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    return build(root);
  }

  async function build(root) {
    const media = []; // {name, data:Uint8Array, ext}
    const rels = [];
    let relId = 10, numId = 2, imgId = 1;
    const nums = []; // {id, abs}
    const body = [];

    const relFor = (target, type, external) => { const id = 'rId' + (relId++); rels.push({ id, target, type, external }); return id; };

    async function imageRun(img) {
      try {
        const src = img.getAttribute('src') || '';
        let bytes, mime;
        const r = await fetch(src); const b = await r.blob(); mime = b.type || 'image/png';
        bytes = new Uint8Array(await b.arrayBuffer());
        let ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpeg' : mime.includes('gif') ? 'gif' : 'png';
        if (!/png|jpe?g|gif/.test(mime)) { // تحويل لـ PNG (مثلاً svg/webp)
          const bm = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
          bytes = new Uint8Array(await (await new Promise(res => c.toBlob(res, 'image/png'))).arrayBuffer()); ext = 'png';
        }
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { try { const bm = await createImageBitmap(b); w = bm.width; h = bm.height; } catch { w = 300; h = 200; } }
        const shownW = parseFloat(img.getAttribute('width') || img.style.width) || 0;
        if (shownW && shownW < w) { h = h * shownW / w; w = shownW; }
        const maxW = 600; if (w > maxW) { h = h * maxW / w; w = maxW; }
        const name = `image${imgId}.${ext}`; media.push({ name, bytes });
        const rid = relFor('media/' + name, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
        const cx = Math.round(w * 9525), cy = Math.round(h * 9525), id = imgId++;
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/>` +
          `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
          `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
          `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
          `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
      } catch { return ''; }
    }

    function rPr(f) {
      let s = '';
      if (f.font) s += `<w:rFonts w:ascii="${X(f.font)}" w:hAnsi="${X(f.font)}" w:cs="${X(f.font)}"/>`;
      if (f.b) s += '<w:b/><w:bCs/>';
      if (f.i) s += '<w:i/><w:iCs/>';
      if (f.strike) s += '<w:strike/>';
      if (f.color) s += `<w:color w:val="${f.color}"/>`;
      if (f.sz) s += `<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`;
      if (f.hl) s += `<w:shd w:val="clear" w:color="auto" w:fill="${f.hl}"/>`;
      if (f.u) s += '<w:u w:val="single"/>';
      if (f.sup) s += '<w:vertAlign w:val="superscript"/>';
      if (f.sub) s += '<w:vertAlign w:val="subscript"/>';
      if (f.rtl) s += '<w:rtl/>';
      return s ? `<w:rPr>${s}</w:rPr>` : '';
    }

    // يجمع الـ runs داخل عنصر inline
    async function runs(node, f, out) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/[\r\n]+/g, ' ');
          if (!t) continue;
          out.push(`<w:r>${rPr({ ...f, rtl: AR.test(t) })}<w:t xml:space="preserve">${X(t)}</w:t></w:r>`);
          continue;
        }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { out.push('<w:r><w:br/></w:r>'); continue; }
        if (tag === 'IMG') { out.push(await imageRun(n)); continue; }
        if (isBlock(n)) { continue; }
        const g = { ...f };
        if (tag === 'B' || tag === 'STRONG') g.b = true;
        if (tag === 'I' || tag === 'EM') g.i = true;
        if (tag === 'U' || tag === 'INS') g.u = true;
        if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') g.strike = true;
        if (tag === 'SUP') g.sup = true;
        if (tag === 'SUB') g.sub = true;
        if (tag === 'MARK') g.hl = 'FFFF00';
        if (tag === 'FONT') {
          if (n.getAttribute('color')) g.color = colorHex(n.getAttribute('color'));
          if (n.getAttribute('size')) g.sz = FONT_SIZES[n.getAttribute('size')] || g.sz;
          if (n.getAttribute('face')) g.font = n.getAttribute('face');
        }
        const st = n.style;
        if (st) {
          if (st.fontWeight === 'bold' || +st.fontWeight >= 600) g.b = true;
          if (st.fontStyle === 'italic') g.i = true;
          if ((st.textDecoration || st.textDecorationLine || '').includes('underline')) g.u = true;
          if ((st.textDecoration || st.textDecorationLine || '').includes('line-through')) g.strike = true;
          if (st.color) g.color = colorHex(st.color) || g.color;
          if (st.backgroundColor) g.hl = colorHex(st.backgroundColor) || g.hl;
          if (st.fontSize && st.fontSize.endsWith('px')) g.sz = Math.round(parseFloat(st.fontSize) * 1.5);
          if (st.fontSize && st.fontSize.endsWith('pt')) g.sz = Math.round(parseFloat(st.fontSize) * 2);
        }
        if (tag === 'A' && n.getAttribute('href') && !n.getAttribute('href').startsWith('#')) {
          const rid = relFor(n.getAttribute('href'), 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', true);
          const inner = []; await runs(n, { ...g, u: true, color: '0563C1' }, inner);
          out.push(`<w:hyperlink r:id="${rid}">${inner.join('')}</w:hyperlink>`);
          continue;
        }
        await runs(n, g, out);
      }
    }

    const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TR', 'TD', 'TH', 'TBODY', 'THEAD']);
    const isBlock = n => n.nodeType === 1 && BLOCKS.has(n.tagName);

    function pPr(el, extra = '') {
      let s = extra;
      const text = el.textContent || '';
      const align = (el.style && el.style.textAlign) || el.getAttribute?.('align') || '';
      let dir = el.getAttribute?.('dir') || (el.style && el.style.direction) || '';
      if (dir === 'auto') dir = '';
      const rtl = dir === 'rtl' || (!dir && AR.test(text));
      if (rtl) s += '<w:bidi/>';
      // في Word: "both" للضبط، و start/end تعتمد على الاتجاه
      const map = { left: rtl ? 'right' : 'left', right: rtl ? 'left' : 'right', center: 'center', justify: 'both', start: 'left', end: 'right' };
      // ملاحظة: مع bidi، قيمة left تعني "البداية" عند وورد القديم؛ نستخدم start/end الحديثة
      if (align) {
        const m2 = { left: rtl ? 'end' : 'start', right: rtl ? 'start' : 'end', center: 'center', justify: 'both', start: 'start', end: 'end' };
        s += `<w:jc w:val="${m2[align] || 'start'}"/>`;
      }
      void map;
      return s ? `<w:pPr>${s}</w:pPr>` : '';
    }

    async function paragraph(el, extraPPr = '', baseF = {}) {
      const out = []; await runs(el, baseF, out);
      return `<w:p>${pPr(el, extraPPr)}${out.join('')}</w:p>`;
    }

    // فقرة من عنصر يحتوي خليط inline + block: نقسمه
    async function mixed(el, extraPPr, baseF, sink) {
      let buf = document.createElement('span');
      const flush = async () => {
        if (buf.childNodes.length && (buf.textContent.trim() || buf.querySelector('img,br'))) {
          // انقل خصائص الاتجاه/المحاذاة من الأب
          if (el.style) buf.style.textAlign = el.style.textAlign;
          if (el.getAttribute('dir')) buf.setAttribute('dir', el.getAttribute('dir'));
          sink.push(await paragraph(buf, extraPPr, baseF));
        }
        buf = document.createElement('span');
      };
      for (const n of [...el.childNodes]) {
        if (isBlock(n)) { await flush(); await block(n, sink, 0); }
        else buf.appendChild(n.cloneNode(true));
      }
      await flush();
    }

    async function list(el, sink, level) {
      const ordered = el.tagName === 'OL';
      let id;
      if (ordered) { id = numId++; nums.push({ id, abs: 2 }); } else id = 1;
      for (const li of el.children) {
        if (li.tagName !== 'LI') { await block(li, sink, level); continue; }
        const inline = document.createElement('span');
        const nested = [];
        for (const n of [...li.childNodes]) {
          if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) nested.push(n);
          else if (n.nodeType === 1 && n.tagName === 'P') { inline.appendChild(document.createTextNode(' ')); [...n.childNodes].forEach(c => inline.appendChild(c.cloneNode(true))); }
          else inline.appendChild(n.cloneNode(true));
        }
        sink.push(await paragraph(inline, `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${id}"/></w:numPr>`));
        for (const nl of nested) await list(nl, sink, level + 1);
      }
    }

    async function table(el, sink) {
      const rows = [...el.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr')];
      const cols = Math.max(1, ...rows.map(r => [...r.children].reduce((s, c) => s + (+c.getAttribute('colspan') || 1), 0)));
      const rtl = AR.test(el.textContent || '');
      let x = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>${rtl ? '<w:bidiVisual/>' : ''}` +
        `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr>` +
        `<w:tblGrid>${'<w:gridCol w:w="' + Math.floor(9000 / cols) + '"/>'.repeat(cols)}</w:tblGrid>`;
      for (const r of rows) {
        x += '<w:tr>';
        for (const c of r.children) {
          const span = +c.getAttribute('colspan') || 1;
          const inner = [];
          await mixed(c, '', c.tagName === 'TH' ? { b: true } : {}, inner);
          x += `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>${inner.join('') || '<w:p/>'}</w:tc>`;
        }
        x += '</w:tr>';
      }
      sink.push(x + '</w:tbl><w:p/>');
    }

    async function block(n, sink, level) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) sink.push(await paragraph(Object.assign(document.createElement('span'), { textContent: n.nodeValue }))); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (HEAD[t]) return sink.push(await paragraph(n, `<w:pStyle w:val="${HEAD[t][1]}"/>`));
      if (t === 'UL' || t === 'OL') return list(n, sink, level);
      if (t === 'TABLE') return table(n, sink);
      if (t === 'HR') return sink.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>');
      if (t === 'PRE') { for (const line of n.textContent.split('\n')) sink.push(`<w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${X(line)}</w:t></w:r></w:p>`); return; }
      if (t === 'BLOCKQUOTE') return mixed(n, '<w:ind w:start="720"/>', { i: true }, sink);
      if (t === 'P') {
        if ([...n.children].some(isBlock)) return mixed(n, '', {}, sink);
        return sink.push(await paragraph(n));
      }
      if (isBlock(n)) return mixed(n, '', {}, sink);
      // inline على المستوى الأعلى
      sink.push(await paragraph(Object.assign(document.createElement('span'), {}).appendChild(n.cloneNode(true)).parentNode));
    }

    // تجميع عناصر inline المتتالية على المستوى الأعلى في فقرة واحدة
    let pending = document.createElement('p');
    const flushTop = async () => { if (pending.childNodes.length && (pending.textContent.trim() || pending.querySelector('img'))) body.push(await paragraph(pending)); pending = document.createElement('p'); };
    for (const n of [...root.childNodes]) {
      if (isBlock(n)) { await flushTop(); await block(n, body, 0); }
      else if (n.nodeType === 3 && !n.nodeValue.trim() && !pending.childNodes.length) continue;
      else pending.appendChild(n.cloneNode(true));
    }
    await flushTop();
    if (!body.length) body.push('<w:p/>');

    const docRtl = AR.test(root.textContent || '');
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>${docRtl ? '<w:bidi/>' : ''}</w:sectPr></w:body></w:document>`;

    const lvl = (i, fmt, txt, font) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
    const bullets = ['•', 'o', '▪'];
    const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, 'bullet', bullets[i % 3], i % 3 === 1 ? 'Courier New' : '')).join('')}</w:abstractNum>` +
      `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, ['decimal', 'lowerLetter', 'lowerRoman'][i % 3], `%${i + 1}.`)).join('')}</w:abstractNum>` +
      `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>` +
      nums.map(n => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abs}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('') +
      `</w:numbering>`;

    const hs = (id, name, sz) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${+id.slice(-1) - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="2F2A5A"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial" w:eastAsia="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="de-DE" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
      Object.values(HEAD).map(([sz, id]) => hs(id, 'heading ' + id.slice(-1), sz)).join('') +
      `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>` +
      `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
      rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${X(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('') + `</Relationships>`;

    const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>HomeLab</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

    const zip = new JSZip();
    zip.file('[Content_Types].xml', types);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file('docProps/core.xml', core);
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', styles);
    zip.file('word/numbering.xml', numbering);
    zip.file('word/_rels/document.xml.rels', docRels);
    media.forEach(m => zip.file('word/media/' + m.name, m.bytes));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  return { fromHTML, fromElement: build };
})();
