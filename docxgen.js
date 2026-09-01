/* docxgen.js —— 纯前端 DOCX 生成（取代原 Python 脚本方案）
 * 版本: v1.2.1
 * 生成四种文档：notice 监理通知单 / contact 工作联系单 / form 监理用表 / monthly 监理月报
 * 通知单 / 联系单 / 月报逐字段对齐官方模板（E:\项目\北星小学\监理\监理用表\*.docx）：
 *   - A4，页边距上下 2cm（1134 缇）、左右 1.8cm（1020 缇）
 *   - 表格边框定义在表级（single sz4，含 insideH/V），单元格边距 0/108/0/108
 *   - 通知单/联系单为「单格大框」结构，月报为「封面节 + 表格节」双节文档
 * 打包用自实现 ZIP（STORE），无任何第三方依赖。
 * 桌面版经 fsBridge.saveDocx 落盘并自动打开；网页版回退为浏览器下载。
 */
(function (global) {
  'use strict';

  // ---------- 基础常量（单位：twip = 1/1440 英寸，1cm = 567 twip） ----------
  var A4_W = 11906, A4_H = 16838;
  var CM = 567;
  var SONG = '宋体', HEI = '黑体';
  var LATIN = 'Calibri'; // 模板 Normal 的拉丁字体
  var PLACE = '（由总监理工程师填写）';
  var XX = 'XX';
  // 官方模板统一页边距：上下 2cm，左右 1.8cm
  var TPL_MARGINS = { top: 1134, bottom: 1134, left: 1020, right: 1020 };

  // ---------- XML 工具 ----------
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // 一个文本 run。o: { cjk, latin, sz(pt), bold }；文本内 \n 转为换行符 <w:br/>
  function run(text, o) {
    o = o || {};
    var cjk = o.cjk || SONG, latin = o.latin || LATIN;
    var sz = Math.round((o.sz || 12) * 2);
    var rpr = '<w:rFonts w:ascii="' + latin + '" w:hAnsi="' + latin + '" w:eastAsia="' + cjk + '"/>';
    if (o.bold) rpr += '<w:b/>';
    rpr += '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>';
    var parts = String(text == null ? '' : text).split('\n');
    var body = '';
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) body += '<w:br/>';
      body += '<w:t xml:space="preserve">' + esc(parts[i]) + '</w:t>';
    }
    return '<w:r><w:rPr>' + rpr + '</w:rPr>' + body + '</w:r>';
  }

  // 一个段落。content 为 run 拼接；o: { align:'left|center|right|both', before/after(pt), indentLeft(twip) }
  function para(content, o) {
    o = o || {};
    var ppr = '';
    var sp = '';
    if (o.before != null) sp += ' w:before="' + Math.round(o.before * 20) + '"';
    if (o.after != null) sp += ' w:after="' + Math.round(o.after * 20) + '"';
    if (sp) ppr += '<w:spacing' + sp + '/>';
    if (o.indentLeft != null) ppr += '<w:ind w:left="' + Math.round(o.indentLeft) + '"/>';
    var align = o.align === 'center' ? 'center' : o.align === 'right' ? 'right'
      : o.align === 'both' ? 'both' : 'left';
    if (align !== 'left') ppr += '<w:jc w:val="' + align + '"/>';
    return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (content || '') + '</w:p>';
  }

  // ---------- 表格工具 ----------
  // 表级边框（对齐模板：single sz4，含内部横竖线）
  function tblBordersXml(sz) {
    var e = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
    var xml = '';
    for (var i = 0; i < e.length; i++) {
      xml += '<w:' + e[i] + ' w:val="single" w:sz="' + (sz || 4) + '" w:space="0" w:color="auto"/>';
    }
    return '<w:tblBorders>' + xml + '</w:tblBorders>';
  }

  // 一个单元格。paras：段落 XML 数组；o: { w(dxa), span, vmerge('restart'|'continue'),
  //   valign('top'|'center'|'bottom'), borders:false 禁用单元格级边框（用表级） }
  function tc(paras, o) {
    o = o || {};
    var pr = '<w:tcW w:w="' + Math.round(o.w || 0) + '" w:type="dxa"/>';
    if (o.span > 1) pr += '<w:gridSpan w:val="' + o.span + '"/>';
    if (o.vmerge === 'restart') pr += '<w:vMerge w:val="restart"/>';
    else if (o.vmerge === 'continue') pr += '<w:vMerge/>';
    if (o.borders !== false) pr += tcBordersXml(o.borderSz || 4, o.noBorder);
    pr += '<w:vAlign w:val="' + (o.valign || 'center') + '"/>';
    if (!paras || !paras.length) paras = [para('')];
    return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + paras.join('') + '</w:tc>';
  }

  function tcBordersXml(singleSz, nilEdges) {
    var names = ['top', 'left', 'bottom', 'right'];
    var xml = '';
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (nilEdges && nilEdges[n]) xml += '<w:' + n + ' w:val="nil"/>';
      else xml += '<w:' + n + ' w:val="single" w:sz="' + (singleSz || 4) + '" w:space="0" w:color="auto"/>';
    }
    return '<w:tcBorders>' + xml + '</w:tcBorders>';
  }

  function tr(cells) { return '<w:tr>' + cells.join('') + '</w:tr>'; }

  // 表格。grid: 各列宽 dxa 数组；o: { ind(表缩进 twip), borderSz }
  function tbl(rows, grid, o) {
    o = o || {};
    var g = '';
    var total = 0;
    for (var i = 0; i < grid.length; i++) { g += '<w:gridCol w:w="' + grid[i] + '"/>'; total += grid[i]; }
    var pr = '<w:tblW w:w="' + total + '" w:type="dxa"/>';
    if (o.ind) pr += '<w:tblInd w:w="' + o.ind + '" w:type="dxa"/>';
    pr += tblBordersXml(o.borderSz || 4);
    pr += '<w:tblLayout w:type="fixed"/>';
    pr += '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>'
        + '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>';
    return '<w:tbl><w:tblPr>' + pr + '</w:tblPr><w:tblGrid>' + g + '</w:tblGrid>'
      + rows.join('') + '</w:tbl>';
  }

  // 整宽单格边框框（通知单照片框）
  function boxTable(paras, widthDxa, borderSz) {
    return tbl([tr([tc(paras, { w: widthDxa, valign: 'top', borderSz: borderSz || 6 })])],
      [widthDxa], { borderSz: borderSz || 6 });
  }

  // ---------- 文档骨架（支持多节） ----------
  function sectPrInner(margins) {
    return '<w:pgSz w:w="' + A4_W + '" w:h="' + A4_H + '"/>'
      + '<w:pgMar w:top="' + margins.top + '" w:right="' + margins.right + '" w:bottom="' + margins.bottom
      + '" w:left="' + margins.left + '" w:header="851" w:footer="851" w:gutter="0"/>';
  }

  function docXml(bodyXml, margins) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<w:document'
      + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
      + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
      + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
      + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<w:body>' + bodyXml
      + '<w:sectPr>' + sectPrInner(margins) + '</w:sectPr>'
      + '</w:body></w:document>';
  }

  // 分节符段落（结束当前节；月报按模板在叙述框1之后分节）
  function sectBreakPara(margins) {
    return '<w:p><w:pPr><w:sectPr>' + sectPrInner(margins) + '</w:sectPr></w:pPr></w:p>';
  }

  // 手动分页段落（模板封面后即为手动分页，而非分节符）
  function pageBreakPara() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="' + LATIN + '" w:hAnsi="' + LATIN + '" w:eastAsia="' + SONG + '"/>'
    + '</w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>'
    + '<w:pPr><w:widowControl w:val="0"/></w:pPr>'
    + '<w:rPr><w:kern w:val="2"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>'
    + '</w:styles>';

  // ---------- ZIP 打包（STORE，无压缩；含 CRC32） ----------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    var dosTime = 0, dosDate = ((2026 - 1980) << 9) | (8 << 5) | 29;
    files.forEach(function (f) {
      var nameB = enc.encode(f.name);
      var crc = crc32(f.data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, f.data.length, true);
      lh.setUint32(22, f.data.length, true);
      lh.setUint16(26, nameB.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameB, f.data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, f.data.length, true);
      ch.setUint32(24, f.data.length, true);
      ch.setUint16(28, nameB.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + f.data.length;
    });
    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    var all = chunks.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (s, c) { return s + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  // ---------- 图片（data URL → word/media） ----------
  function parseImage(src) {
    if (typeof src !== 'string') return null;
    var m = src.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/);
    if (!m) return null;
    var ext = m[1] === 'jpeg' ? 'jpeg' : m[1] === 'jpg' ? 'jpeg' : m[1];
    var bin = atob(m[2]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ext: ext, bytes: bytes, dims: imageSize(bytes, ext) };
  }

  function imageSize(bytes, ext) {
    try {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (ext === 'png' && bytes.length > 24 && dv.getUint32(0) === 0x89504e47) {
        return { w: dv.getUint32(16), h: dv.getUint32(20) };
      }
      if (ext === 'jpeg') {
        var i = 2;
        while (i + 9 < bytes.length) {
          if (bytes[i] !== 0xFF) { i++; continue; }
          var marker = bytes[i + 1];
          if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5) };
          }
          i += 2 + dv.getUint16(i + 2);
        }
      }
    } catch (e) { /* 尺寸解析失败时按 4:3 处理 */ }
    return { w: 800, h: 600 };
  }

  function imagePara(img, relId, docPrId) {
    var maxWcm = 14, maxHcm = 18;
    var scale = Math.min(maxWcm * 360000 / img.dims.w, maxHcm * 360000 / img.dims.h, 1);
    var cx = Math.round(img.dims.w * scale), cy = Math.round(img.dims.h * scale);
    return para('<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
      + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
      + '<wp:docPr id="' + docPrId + '" name="图片' + docPrId + '"/><wp:cNvGraphicFramePr/>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + docPrId + '" name="img' + docPrId + '"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="' + relId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      + '</a:graphicData></a:graphic></wp:inline></w:drawing>', { align: 'center' });
  }

  function assemble(bodyXml, margins, images) {
    images = images || [];
    var rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
    var media = [];
    images.forEach(function (img, i) {
      var rid = 'rId' + (10 + i);
      rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + (i + 1) + '.' + img.ext + '"/>');
      media.push({ name: 'word/media/image' + (i + 1) + '.' + img.ext, data: img.bytes });
      bodyXml = bodyXml.replace('{{IMG' + i + '}}', imagePara(img, rid, i + 1));
    });
    var enc = new TextEncoder();
    var files = [
      { name: '[Content_Types].xml', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '</Types>') },
      { name: '_rels/.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>') },
      { name: 'word/document.xml', data: enc.encode(docXml(bodyXml, margins)) },
      { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + rels.join('') + '</Relationships>') }
    ].concat(media);
    return zipStore(files);
  }

  // ---------- 填充辅助 ----------
  // "2026-08-29" → "2026 年 8 月 29 日"
  function dateCn(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? (m[1] + ' 年 ' + Number(m[2]) + ' 月 ' + Number(m[3]) + ' 日') : '';
  }

  // 标签 + 值（多行值：首行接在标签后，其余行独立段落）
  function labelParas(label, value, o) {
    o = o || {};
    var v = String(value == null ? '' : value);
    var lines = v.split('\n');
    var out = [para(run(label + (lines[0] || ''), { sz: o.sz || 12 }), { indentLeft: o.indentLeft })];
    for (var i = 1; i < lines.length; i++) {
      out.push(para(run(lines[i], { sz: o.sz || 12 }), { indentLeft: o.indentLeft }));
    }
    return out;
  }

  // =====================================================================
  // 监理通知单 —— 对齐官方模板：标题 + 工程名称/编号行 + 单格大框 + 注
  // =====================================================================
  function buildNotice(d) {
    var party = d.construction_party || XX;
    var box = [];
    box.push(para(run('致：' + party + '（施工单位）', { sz: 12 })));
    box.push(para(run('　', { sz: 12 }), { indentLeft: 113 }));
    box = box.concat(labelParas('事由：', d.subject || '', { sz: 12 }));
    box.push(para(run('　', { sz: 12 }), { indentLeft: 113 }));
    box.push(para(run('　', { sz: 12 }), { indentLeft: 113 }));
    box.push(para(run('　', { sz: 12 }), { indentLeft: 113 }));
    box = box.concat(labelParas('　内容：', d.body || '', { sz: 12, indentLeft: 113 }));
    box.push(para('', { indentLeft: 113 }));
    box.push(para('', { indentLeft: 113 }));
    box = box.concat(labelParas('  要求：', d.requirement || '', { sz: 12, indentLeft: 113 }));
    box.push(para(run('　', { sz: 12 }), { indentLeft: 113 }));
    box.push(para(''));
    box.push(para(''));
    box.push(para(run('项目监理机构（印章）：' + (d.supervisor_name || ''), { sz: 12 })));
    box.push(para(run('总/专业监理工程师（签字、执业印章）：' + (d.engineer_name || ''), { sz: 12 })));
    box.push(para(run(dateCn(d.date) || '年   月   日', { sz: 12 })));

    var body = para(run('监理通知单（质量/安全）', { cjk: HEI, sz: 16, bold: true }), { align: 'center' })
      + para('')
      + para(run('工程名称：' + (d.project_name || XX) + '                                编号：' + (d.notice_number || XX), { sz: 12 }))
      + tbl([tr([tc(box, { w: 9864, valign: 'top', borders: false })])], [9864], { ind: 139 })
      + para(run('注：本表一式三份，施工单位、建设单位、项目监理机构各一份。', { sz: 9 }));

    var images = [];
    var photos = d.photos || [];
    if (photos.length) {
      body += para('') + para(run('附件：现场照片', { sz: 12 }));
      for (var p = 0; p < photos.length; p++) {
        var ph = typeof photos[p] === 'string' ? { src: photos[p], caption: '图' + (p + 1) } : photos[p];
        var img = parseImage(ph.src || ph.path || ph.data || '');
        if (img) {
          images.push(img);
          body += boxTable(['{{IMG' + (images.length - 1) + '}}'], Math.round(15 * CM), 4);
          body += para(run(ph.caption || ('图' + (p + 1)), { sz: 12 }), { align: 'center' });
        } else {
          body += para(run('[图片缺失: ' + (ph.src || ph.path || '') + ']', { sz: 12 }));
        }
      }
    }
    return { body: body, margins: TPL_MARGINS, images: images };
  }

  // =====================================================================
  // 工作联系单 —— 对齐官方模板：标题 + 工程名称/编号行 + 单格大框 + 注
  // =====================================================================
  function buildContact(d) {
    var box = [];
    box.push(para(run('致：' + (d.toUnit || ''), { sz: 12 })));
    box.push(para(''));
    var content = box.concat([]);
    content = content.concat(labelParas('事由：', d.subject || '', { sz: 12 }));
    content.push(para(''));
    var lines = String(d.body || '').split('\n');
    for (var i = 0; i < lines.length; i++) content.push(para(run(lines[i], { sz: 12 })));
    // 补足留白，保持模板的内容区高度
    while (content.length < 12) content.push(para(''));
    box = content;
    box.push(para(''));
    box.push(para(run('发文单位（印章）' + (d.fromUnit ? '：' + d.fromUnit : ''), { sz: 12 })));
    box.push(para(run('负责人（签字）：' + (d.signer || ''), { sz: 12 })));
    box.push(para(run(dateCn(d.date) || '年   月   日', { sz: 12 })));

    var body = para(run('工作联系单', { cjk: HEI, sz: 16, bold: true }), { align: 'center' })
      + para(run('工程名称：' + (d.project_name || XX) + '                                编号：' + (d.no || XX), { sz: 12 }))
      + tbl([tr([tc(box, { w: 9852, valign: 'top', borders: false })])], [9852], { ind: 115 })
      + para(run('　注：本表一式多份，收文单位、其他有关单位、发文单位各一份。', { sz: 9 }))
      + para('');
    return { body: body, margins: TPL_MARGINS, images: [] };
  }

  // =====================================================================
  // 监理月报 GB/T 50319 —— 对齐官方模板：封面节 + 表格节（双节文档）
  // 封面：项目名称 22pt / 监理月报 36pt / （第 N 期）16pt / 主要内容 14pt / 签字 16pt 黑体
  // 表格节：15pt 黑体页头 + 8×7 主表（竖排标签、双节合并）+ 两个叙述框
  // =====================================================================
  function buildMonthly(d) {
    var COL_W = [684, 1455, 1479, 567, 814, 1280, 3609];
    var W02 = 2139, W26 = 2860, W27 = 7749, W46 = 5703;
    var visa = d.visa || {};
    function vitem(k) {
      var it = visa[k] || {};
      return [(it.count == null ? '' : String(it.count)), (it.brief || '')];
    }
    // 竖排双列标签：每段 = 第1列字 + 全角空格 + 第2列字
    function v2col(chars) {
      var arr = String(chars).split('');
      var n = Math.ceil(arr.length / 2);
      var ps = [];
      for (var i = 0; i < n; i++) {
        ps.push(para(run((arr[i] || '') + '　' + (arr[i + n] || ''), { sz: 12 }), { align: 'center' }));
      }
      return ps;
    }
    function v1col(chars, sz) {
      var ps = [];
      for (var i = 0; i < chars.length; i++) {
        ps.push(para(run(chars[i], { sz: sz || 14 }), { align: 'center' }));
      }
      return ps;
    }

    // ---- 封面节 ----
    var cover = '';
    cover += para(run(d.project_name || '                  工程', { cjk: HEI, sz: 22, bold: true }), { align: 'center' });
    cover += para('');
    cover += para(run('监 理 月 报', { cjk: HEI, sz: 36, bold: true }), { align: 'center' });
    cover += para(run(d.issue ? '（第 ' + d.issue + ' 期）' : '（第   期）', { sz: 16 }), { align: 'center' });
    cover += para('');
    cover += para('');
    cover += para(run('主要内容：', { sz: 14 }), { indentLeft: 2730 });
    ['本月工程实施情况', '本月监理工作情况', '本月施工中存在的问题及处理情况', '下月监理工作重点']
      .forEach(function (item) {
        cover += para(run(item, { sz: 14 }), { indentLeft: 2730 });
      });
    cover += para('');
    cover += para('');
    cover += para(run('总监理工程师（签字）：            ', { cjk: HEI, sz: 16 }));
    cover += para(run('项目监理机构（印章）：            ', { cjk: HEI, sz: 16 }));
    cover += para('');
    cover += para(run(
      (d.period_start && d.period_end)
        ? '       ' + d.period_start + ' 至        ' + d.period_end
        : '       年    月    日 至        年    月    日', { sz: 16 }), { align: 'center' });
    cover += para('');
    cover += para('');
    cover += para('');
    cover += para('');
    // 模板此处为手动分页（分节符在叙述框一之后），分页符与 15pt 空隔同段
    cover += para('<w:r><w:br w:type="page"/></w:r>'
      + run('      ', { cjk: HEI, sz: 15, bold: true }), { align: 'center' });

    // ---- 表格节 ----
    var page = '';
    var header = para(run('监 理 月 报', { cjk: HEI, sz: 15, bold: true }), { align: 'center' });
    page += header;

    // 8×7 主表
    var mCnt = vitem('meeting'), vCnt = vitem('visa'), nCnt = vitem('notice'), rCnt = vitem('report');
    function lab(t, align) { return para(run(t, { sz: 12 }), { align: align || 'center' }); }
    function val(t) { return para(run(t == null ? '' : String(t), { sz: 12 })); }
    var rows = [];
    rows.push(tr([
      tc([lab('工程名称', 'left')], { w: W02, span: 2, borders: false }),
      tc([val(d.project_name || '')], { w: W26, span: 3, borders: false }),
      tc([lab('设计单位')], { w: COL_W[5], borders: false }),
      tc([val(d.design_party || '')], { w: COL_W[6], borders: false })
    ]));
    rows.push(tr([
      tc([lab('建设单位')], { w: W02, span: 2, borders: false }),
      tc([val(d.build_party || '')], { w: W26, span: 3, borders: false }),
      tc([lab('施工单位')], { w: COL_W[5], borders: false }),
      tc([val(d.construct_party || '')], { w: COL_W[6], borders: false })
    ]));
    rows.push(tr([
      tc([para('')], { w: COL_W[0], vmerge: 'restart', valign: 'top', borders: false }),
      tc(v1col('实　际完　成', 12), { w: COL_W[1], borders: false }),
      tc([val(d.progress_actual || '')], { w: W27, span: 5, borders: false })
    ]));
    rows.push(tr([
      tc([para('')], { w: COL_W[0], vmerge: 'continue', valign: 'top', borders: false }),
      tc(v2col('原因分析'), { w: COL_W[1], borders: false }),
      tc([val(d.progress_reason || '')], { w: W27, span: 5, borders: false })
    ]));
    var visaRows = [
      [v2col('专题报告例会纪要'), mCnt],
      [v2col('工程质量签证'), vCnt],
      [v2col('向施工单位发出的通知指示指令'), nCnt],
      [v2col('施工单位提出的各种报告'), rCnt]
    ];
    for (var i = 0; i < visaRows.length; i++) {
      rows.push(tr([
        i === 0
          ? tc(v1col('工程签证情况', 14), { w: COL_W[0], vmerge: 'restart', valign: 'top', borders: false })
          : tc([para('')], { w: COL_W[0], vmerge: 'continue', valign: 'top', borders: false }),
        tc(visaRows[i][0], { w: COL_W[1], borders: false }),
        tc([val(visaRows[i][1][0])], { w: COL_W[2], borders: false }),
        tc([para(run('内容简要', { sz: 12 }), { align: 'center' })], { w: COL_W[3], borders: false }),
        tc([val(visaRows[i][1][1])], { w: W46, span: 3, borders: false })
      ]));
    }
    page += tbl(rows, COL_W, { ind: 103 });

    // 叙述框（标签行 + 填写内容行，12pt 宋体）
    function narrBox(items, w, ind) {
      var ps = [];
      for (var j = 0; j < items.length; j++) {
        if (j > 0) ps.push(para(''));
        ps = ps.concat(labelParas(items[j][0], items[j][1] || '', { sz: 12 }));
      }
      return tbl([tr([tc(ps, { w: w, valign: 'top', borders: false })])], [w], { ind: ind });
    }
    page += header + para('');
    page += narrBox([['本月工程实施情况：', d.impl_text], ['本月监理工作情况：', d.work_text]], 9900, 103);
    // 模板在此处（叙述框一之后）分节
    page += sectBreakPara(TPL_MARGINS);
    page += header + para('');
    page += narrBox([
      ['本月施工中存在的问题及处理情况：', d.issue_text],
      ['下月监理工作重点：', d.next_text],
      ['附件：', d.attachment || '有关统计表、图片等']
    ], 9876, 115);
    page += para('');

    return { body: cover + page, margins: TPL_MARGINS, images: [] };
  }

  // =====================================================================
  // 监理用表（通用表单，字段定义驱动；非官方三表，保持原实现）
  // =====================================================================
  function buildForm(d) {
    var half = 4513;
    var rows = [];
    var fields = d.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var label = f.label || '', value = f.value || '';
      if (f.span === 2) {
        var ps = [para(run(label, { sz: 12 }), { align: 'center' })];
        if (value) ps.push(para(run(value, { sz: 12 })));
        rows.push(tr([tc(ps, { w: 9026, span: 2 })]));
      } else {
        var vps = [para(run(value, { sz: 12 }))];
        if (f.multiline) { vps.push(para('')); vps.push(para('')); }
        rows.push(tr([
          tc([para(run(label, { sz: 12 }), { align: 'center' })], { w: half }),
          tc(vps, { w: half })
        ]));
      }
    }
    var body = para(run(d.title || '监 理 用 表', { cjk: HEI, sz: 16, bold: true }), { align: 'center' });
    if (d.subtitle) body += para(run(d.subtitle, { sz: 12 }), { align: 'center' });
    if (rows.length) body += tbl(rows, [half, half]);
    body += para('');
    (d.sign || []).forEach(function (s) {
      body += para(run(s, { sz: 12 }));
    });
    var dd = d.date;
    if (dd !== undefined && dd !== null && dd !== '') {
      body += para(run(dd === '____-__-__' ? '年    月    日' : ('日期：' + dd), { sz: 12 }), { align: 'right' });
    }
    if (d.note) body += para(run(d.note, { sz: 10.5 }));
    return { body: body, margins: TPL_MARGINS, images: [] };
  }

  // ---------- 对外入口 ----------
  var BUILDERS = { notice: buildNotice, contact: buildContact, form: buildForm, monthly: buildMonthly };

  function build(type, data) {
    var b = BUILDERS[type];
    if (!b) throw new Error('未知文档类型：' + type);
    var out = b(data || {});
    return assemble(out.body, out.margins, out.images);
  }

  function generate(type, data, outDir, baseName) {
    return new Promise(function (resolve) {
      try {
        var bytes = build(type, data);
        var fb = global.fsBridge;
        if (fb && fb.saveDocx) {
          resolve(fb.saveDocx(outDir, baseName, bytes));
        } else {
          var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          var a = document.createElement('a');
          var url = URL.createObjectURL(blob);
          a.href = url;
          a.download = String(baseName).replace(/[\\/:*?"<>|]/g, '_') + '.docx';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
          resolve({ success: true, path: a.download });
        }
      } catch (e) {
        resolve({ success: false, error: e.message || String(e) });
      }
    });
  }

  global.DocxGen = { build: build, generate: generate };
})(typeof window !== 'undefined' ? window : this);
