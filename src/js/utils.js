/**
 * utils.js
 * アプリケーション全体で使用するユーティリティ関数のコレクション
 */

// ----------------------
// 型チェック関数
// ----------------------

/**
 * 値の型を確認
 */
const isType = (val, type) => typeof val === type;
const isString = (val) => isType(val, 'string');
const isNumber = (val) => isType(val, 'number') && !isNaN(val);
const isBoolean = (val) => isType(val, 'boolean');
const isObject = (val) => val !== null && isType(val, 'object') && !Array.isArray(val);
const isArray = (val) => Array.isArray(val);
const isFunction = (val) => isType(val, 'function');
const isEmpty = (val) => {
  if (val === null || val === undefined) return true;
  if (isString(val) || isArray(val)) return val.length === 0;
  if (isObject(val)) return Object.keys(val).length === 0;
  return false;
};

// ----------------------
// 数学計算関数
// ----------------------

/**
 * 数値の範囲内クランプ
 */
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

/**
 * 範囲のランダム値を生成
 */
const random = (min, max) => Math.random() * (max - min) + min;

/**
 * 小数点以下の桁数を指定して四捨五入
 */
const roundTo = (num, decimals = 0) => {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

/**
 * 2点間の距離を計算
 */
const distance = (x1, y1, x2, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

/**
 * 3D空間での2点間の距離を計算
 */
const distance3D = (x1, y1, z1, x2, y2, z2) => {
  return Math.sqrt(
    Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)
  );
};

/**
 * 配列の平均値を計算
 */
const average = (arr) => arr.reduce((sum, val) => sum + val, 0) / arr.length;

/**
 * ベクトル演算
 */
const Vector3 = {
  add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z }),
  subtract: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z }),
  multiply: (v, scalar) => ({ x: v.x * scalar, y: v.y * scalar, z: v.z * scalar }),
  divide: (v, scalar) => ({ x: v.x / scalar, y: v.y / scalar, z: v.z / scalar }),
  length: (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
  normalize: (v) => {
    const len = Vector3.length(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return Vector3.divide(v, len);
  },
  dotProduct: (v1, v2) => v1.x * v2.x + v1.y * v2.y + v1.z * v2.z,
  crossProduct: (v1, v2) => ({
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x
  })
};

/**
 * 行列演算（4x4行列、3D変換用）
 */
const Matrix4 = {
  identity: () => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ],
  
  multiply: (a, b) => {
    const result = new Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i * 4 + k] * b[k * 4 + j];
        }
        result[i * 4 + j] = sum;
      }
    }
    return result;
  },
  
  translation: (tx, ty, tz) => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1
  ],
  
  rotation: (angleRad, axisX, axisY, axisZ) => {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const t = 1 - c;
    const len = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
    const x = axisX / len;
    const y = axisY / len;
    const z = axisZ / len;
    
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
      0, 0, 0, 1
    ];
  },
  
  scale: (sx, sy, sz) => [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1
  ],
  
  transformPoint: (matrix, point) => {
    const x = point.x * matrix[0] + point.y * matrix[4] + point.z * matrix[8] + matrix[12];
    const y = point.x * matrix[1] + point.y * matrix[5] + point.z * matrix[9] + matrix[13];
    const z = point.x * matrix[2] + point.y * matrix[6] + point.z * matrix[10] + matrix[14];
    const w = point.x * matrix[3] + point.y * matrix[7] + point.z * matrix[11] + matrix[15];
    
    return {
      x: x / w,
      y: y / w,
      z: z / w
    };
  }
};

// ----------------------
// フォーマット変換関数
// ----------------------

/**
 * 数値をフォーマット（桁区切り、小数点など）
 */
const formatNumber = (num, options = {}) => {
  const {
    decimals = 2,
    decimalSeparator = '.',
    thousandsSeparator = ',',
    round = true,
    prefix = '',
    suffix = ''
  } = options;
  
  let formatted = num;
  
  if (round) {
    formatted = roundTo(formatted, decimals);
  }
  
  const parts = formatted.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  if (decimals > 0) {
    if (parts.length === 1) parts.push('');
    while (parts[1].length < decimals) parts[1] += '0';
    if (parts[1].length > decimals) parts[1] = parts[1].substring(0, decimals);
  } else {
    if (parts.length > 1) parts.pop();
  }
  
  return prefix + parts.join(decimalSeparator) + suffix;
};

/**
 * バイトサイズを人間が読みやすいフォーマットに変換
 */
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

/**
 * RGB色をHEX色に変換
 */
const rgbToHex = (r, g, b) => {
  return '#' + [r, g, b]
    .map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');
};

/**
 * HEX色をRGBに変換
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// ----------------------
// 文字列処理関数
// ----------------------

/**
 * 文字列の先頭を大文字に
 */
const capitalize = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * キャメルケースをケバブケースに変換
 */
const camelToKebab = (str) => {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
};

/**
 * ケバブケースをキャメルケースに変換
 */
const kebabToCamel = (str) => {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
};

/**
 * 文字列を指定長に切り詰め
 */
const truncate = (str, maxLength, suffix = '...') => {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
};

// ----------------------
// 日付/時間処理関数
// ----------------------

/**
 * 日付をフォーマット
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const pad = (num) => String(num).padStart(2, '0');
  
  const tokens = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
    SSS: String(d.getMilliseconds()).padStart(3, '0')
  };
  
  return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (match) => tokens[match]);
};

/**
 * 2つの日付の差を計算
 */
const dateDiff = (date1, date2, unit = 'days') => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d2 - d1);
  
  const units = {
    milliseconds: 1,
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  };
  
  return Math.floor(diffMs / units[unit]);
};

/**
 * 指定された日数/時間を加算した日付を取得
 */
const addToDate = (date, amount, unit = 'days') => {
  const d = new Date(date);
  
  switch (unit) {
    case 'years': d.setFullYear(d.getFullYear() + amount); break;
    case 'months': d.setMonth(d.getMonth() + amount); break;
    case 'days': d.setDate(d.getDate() + amount); break;
    case 'hours': d.setHours(d.getHours() + amount); break;
    case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
    case 'seconds': d.setSeconds(d.getSeconds() + amount); break;
    case 'milliseconds': d.setMilliseconds(d.getMilliseconds() + amount); break;
  }
  
  return d;
};

/**
 * タイムスタンプを取得
 */
const timestamp = () => new Date().getTime();

// ----------------------
// ファイル操作関数
// ----------------------

/**
 * ファイル名から拡張子を取得
 */
const getFileExtension = (filename) => {
  if (!filename || typeof filename !== 'string') return '';
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
};

/**
 * ファイル名から拡張子を除いた部分を取得
 */
const getFileName = (path) => {
  if (!path || typeof path !== 'string') return '';
  const filename = path.split('/').pop().split('\\').pop();
  return filename.substring(0, filename.lastIndexOf('.')) || filename;
};

/**
 * タイムスタンプを含むファイル名を生成
 */
const generateFileName = (prefix = 'file', extension = 'txt') => {
  const date = new Date();
  const timestamp = formatDate(date, 'YYYY-MM-DD_HH-mm-ss');
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * 点群データ用のファイル名を生成
 */
const generatePointCloudFileName = (mode = 'scan', extension = 'ply') => {
  const date = new Date();
  const timestamp = formatDate(date, 'YYYY-MM-DD_HH-mm-ss');
  return `lidar_${mode}_${timestamp}.${extension}`;
};

/**
 * データURLをBlobに変換
 */
const dataURLtoBlob = (dataURL) => {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  
  return new Blob([uInt8Array], { type: contentType });
};

/**
 * Blobオブジェクトをダウンロード
 */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// ----------------------
// 汎用ユーティリティ
// ----------------------

/**
 * Sleep関数 - 指定ミリ秒待機
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 指定された回数だけリトライするPromiseラッパー
 */
const retry = async (fn, retriesLeft = 3, interval = 1000, exponential = false) => {
  try {
    return await fn();
  } catch (error) {
    if (retriesLeft === 0) {
      throw error;
    }
    
    const delay = exponential ? interval * Math.pow(2, 3 - retriesLeft) : interval;
    await sleep(delay);
    
    return retry(fn, retriesLeft - 1, interval, exponential);
  }
};

/**
 * オブジェクトをディープコピー
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (obj instanceof Object) {
    const copy = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepClone(obj[key]);
    });
    return copy;
  }
  
  return obj;
};

/**
 * 2つのオブジェクトをマージ（ディープマージ）
 */
const deepMerge = (target, source) => {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
};

/**
 * 指定されたミリ秒間隔で関数実行を制限するデバウンス関数
 */
const debounce = (fn, delay) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * 指定されたミリ秒間隔で関数実行を制限するスロットル関数
 */
const throttle = (fn, limit) => {
  let inThrottle;
  return function(...args) {
    const context = this;
    if (!inThrottle) {
      fn.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * UUID v4 生成
 */
const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// エクスポート
const Utils = {
  // 型チェック
  isType, isString, isNumber, isBoolean, isObject, isArray, isFunction, isEmpty,
  
  // 数学計算
  clamp, random, roundTo, distance, distance3D, average, Vector3, Matrix4,
  
  // フォーマット変換
  formatNumber, formatBytes, rgbToHex, hexToRgb,
  
  // 文字列処理
  capitalize, camelToKebab, kebabToCamel, truncate,
  
  // 日付/時間処理
  formatDate, dateDiff, addToDate, timestamp,
  
  // ファイル操作
  getFileExtension, getFileName, generateFileName, generatePointCloudFileName,
  dataURLtoBlob, downloadBlob,
  
  // 汎用ユーティリティ
  sleep, retry, deepClone, deepMerge, debounce, throttle, uuidv4
};

export default Utils;