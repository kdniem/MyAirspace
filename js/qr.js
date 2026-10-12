/* Compact QR code encoder (byte mode, error correction level M, versions 1-20).
   Adapted from "QR Code generator library" by Project Nayuki
   (https://www.nayuki.io/page/qr-code-generator-library), MIT License:
   Copyright (c) Project Nayuki. Permission is hereby granted, free of charge, to any
   person obtaining a copy of this software and associated documentation files, to deal
   in the Software without restriction, including the rights to use, copy, modify, merge,
   publish, distribute, sublicense, and/or sell copies, subject to the condition that the
   above copyright notice and this permission notice shall be included in all copies or
   substantial portions of the Software. The software is provided "as is", without
   warranty of any kind.
   Plain ES5/ES2017, no dependencies. API: MA.qr.encode(text) -> {size, dark(x, y)},
   MA.qr.svg(text, {dark, light, border}) -> SVG markup. */
var MA = window.MA || {};
window.MA = MA;

(function () {
  // Level M, index = version (0 unused)
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  var NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  var MAX_VERSION = 20;
  var FORMAT_ECL_M = 0;

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  function alignPositions(ver, size) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2;
    var step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    var res = [6];
    for (var pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  /* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    var res = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ res.shift();
      res.push(0);
      divisor.forEach(function (coef, i) { res[i] ^= gfMul(coef, factor); });
    });
    return res;
  }

  function addEccAndInterleave(data, ver) {
    var numBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var numShort = numBlocks - raw % numBlocks;
    var shortLen = Math.floor(raw / numBlocks);
    var div = rsDivisor(eccLen);
    var blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var res = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) res.push(blocks[j][i]);
      }
    }
    return res;
  }

  /* ---------- data segment (byte mode) ---------- */

  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encodeData(bytes) {
    for (var ver = 1; ver <= MAX_VERSION; ver++) {
      var ccBits = ver <= 9 ? 8 : 16;
      var cap = dataCodewords(ver) * 8;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > MAX_VERSION) throw new Error('QR: text too long');
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ccBits);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var words = [];
    for (var i = 0; i < bits.length; i += 8) {
      var w = 0;
      for (var j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
      words.push(w);
    }
    return { ver: ver, words: words };
  }

  /* ---------- matrix ---------- */

  function Matrix(ver) {
    this.ver = ver;
    this.size = ver * 4 + 17;
    this.m = [];
    this.fn = [];
    for (var y = 0; y < this.size; y++) {
      this.m.push([]);
      this.fn.push([]);
      for (var x = 0; x < this.size; x++) { this.m[y].push(false); this.fn[y].push(false); }
    }
  }
  Matrix.prototype.setFn = function (x, y, dark) { this.m[y][x] = dark; this.fn[y][x] = true; };

  Matrix.prototype.drawFunctionPatterns = function () {
    var s = this.size, i, j;
    for (i = 0; i < s; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(s - 4, 3);
    this.finder(3, s - 4);
    var al = alignPositions(this.ver, s), n = al.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            this.setFn(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    this.drawFormat(0);
    this.drawVersion();
  };

  Matrix.prototype.finder = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFn(xx, yy, d !== 2 && d !== 4);
      }
    }
  };

  Matrix.prototype.drawFormat = function (mask) {
    var data = (FORMAT_ECL_M << 3) | mask, rem = data, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412, s = this.size;
    for (i = 0; i <= 5; i++) this.setFn(8, i, bit(bits, i));
    this.setFn(8, 7, bit(bits, 6));
    this.setFn(8, 8, bit(bits, 7));
    this.setFn(7, 8, bit(bits, 8));
    for (i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(bits, i));
    for (i = 0; i < 8; i++) this.setFn(s - 1 - i, 8, bit(bits, i));
    for (i = 8; i < 15; i++) this.setFn(8, s - 15 + i, bit(bits, i));
    this.setFn(8, s - 8, true);
  };

  Matrix.prototype.drawVersion = function () {
    if (this.ver < 7) return;
    var rem = this.ver, i;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.ver << 12) | rem;
    for (i = 0; i < 18; i++) {
      var c = bit(bits, i), a = this.size - 11 + i % 3, b = Math.floor(i / 3);
      this.setFn(a, b, c);
      this.setFn(b, a, c);
    }
  };

  Matrix.prototype.drawCodewords = function (data) {
    var i = 0, s = this.size;
    for (var right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var v = 0; v < s; v++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - v : v;
          if (!this.fn[y][x] && i < data.length * 8) {
            this.m[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];

  Matrix.prototype.applyMask = function (k) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        if (!this.fn[y][x] && MASKS[k](x, y)) this.m[y][x] = !this.m[y][x];
      }
    }
  };

  // Simplified ISO 18004 penalty (rules 1-4); any mask yields a valid code.
  Matrix.prototype.penalty = function () {
    var s = this.size, m = this.m, p = 0, dark = 0, x, y;
    function line(get) {
      var run = 1, str = '';
      for (var i = 0; i < s; i++) {
        var c = get(i);
        str += c ? '1' : '0';
        if (i > 0) {
          if (c === get(i - 1)) {
            run++;
            if (run === 5) p += 3; else if (run > 5) p++;
          } else run = 1;
        }
      }
      var re = /(?=(00001011101|10111010000))/g;
      while (re.exec(str)) { p += 40; re.lastIndex++; }
    }
    for (y = 0; y < s; y++) line(function (i) { return m[y][i]; });
    for (x = 0; x < s; x++) line(function (i) { return m[i][x]; });
    for (y = 0; y < s - 1; y++) {
      for (x = 0; x < s - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
    }
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) if (m[y][x]) dark++;
    var total = s * s;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  };

  function encode(text) {
    var d = encodeData(utf8(text));
    var all = addEccAndInterleave(d.words, d.ver);
    var mat = new Matrix(d.ver);
    mat.drawFunctionPatterns();
    mat.drawCodewords(all);
    var best = 0, bestP = Infinity;
    for (var k = 0; k < 8; k++) {
      mat.applyMask(k);
      mat.drawFormat(k);
      var p = mat.penalty();
      if (p < bestP) { best = k; bestP = p; }
      mat.applyMask(k); // XOR again = undo
    }
    mat.applyMask(best);
    mat.drawFormat(best);
    return {
      size: mat.size,
      version: d.ver,
      mask: best,
      dark: function (x, y) { return mat.m[y][x]; }
    };
  }

  function svg(text, opts) {
    opts = opts || {};
    var q = encode(text), b = opts.border === undefined ? 4 : opts.border, n = q.size + b * 2, path = '';
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.dark(x, y)) path += 'M' + (x + b) + ' ' + (y + b) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n +
      '" shape-rendering="crispEdges" role="img" aria-label="QR-Code">' +
      '<rect width="' + n + '" height="' + n + '" fill="' + (opts.light || '#fff') + '"/>' +
      '<path d="' + path + '" fill="' + (opts.dark || '#000') + '"/></svg>';
  }

  MA.qr = { encode: encode, svg: svg };
})();
