/**
 * exportWorker.js - 点群データのエクスポート処理を行うWebWorker
 */

// Workerスコープ内で利用できるグローバル変数
let pointCloudData = null;
let exportConfig = null;
let exportAborted = false;
let compressWorker = null;

// メッセージ受信ハンドラー
self.onmessage = function(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'init':
      pointCloudData = data.pointCloud;
      exportConfig = data.config;
      sendProgress(0, 'エクスポート処理を初期化中...');
      break;
      
    case 'export':
      performExport(data.format);
      break;
      
    case 'abort':
      exportAborted = true;
      if (compressWorker) {
        compressWorker.terminate();
      }
      sendProgress(0, 'エクスポート処理が中止されました');
      break;
      
    default:
      sendError('不明なメッセージタイプです: ' + type);
  }
};

// エクスポート処理実行
function performExport(format) {
  if (!pointCloudData || !exportConfig) {
    sendError('初期化されていないデータでエクスポートが実行されました');
    return;
  }
  
  exportAborted = false;
  
  try {
    sendProgress(5, 'データ変換準備中...');
    
    // 形式に応じたエクスポート処理を実行
    switch (format.toLowerCase()) {
      case 'ply':
        exportToPLY();
        break;
        
      case 'e57':
        exportToE57();
        break;
        
      default:
        sendError('サポートされていないフォーマットです: ' + format);
    }
  } catch (error) {
    sendError('エクスポート処理中にエラーが発生しました: ' + error.message);
  }
}

// PLY形式へのエクスポート
function exportToPLY() {
  sendProgress(10, 'PLY形式に変換中...');
  
  try {
    // ポイント数の取得
    const numPoints = pointCloudData.positions.length / 3;
    
    // ヘッダー作成
    let header = 'ply\n';
    header += 'format binary_little_endian 1.0\n';
    header += 'comment Created by LiDAR Scanner Web App\n';
    header += `element vertex ${numPoints}\n`;
    header += 'property float x\n';
    header += 'property float y\n';
    header += 'property float z\n';
    
    // 色情報が存在する場合
    if (pointCloudData.colors && pointCloudData.colors.length === numPoints * 3) {
      header += 'property uchar red\n';
      header += 'property uchar green\n';
      header += 'property uchar blue\n';
    }
    
    // 法線情報が存在する場合
    if (pointCloudData.normals && pointCloudData.normals.length === numPoints * 3) {
      header += 'property float nx\n';
      header += 'property float ny\n';
      header += 'property float nz\n';
    }
    
    header += 'end_header\n';
    
    // プログレス更新
    sendProgress(20, 'バイナリデータを生成中...');
    
    // バイナリデータの生成
    const headerBuffer = new TextEncoder().encode(header);
    
    // 必要なバッファサイズの計算
    let pointDataSize = numPoints * 3 * 4; // XYZ (float) = 12 bytes per point
    
    if (pointCloudData.colors) pointDataSize += numPoints * 3; // RGB (uchar) = 3 bytes per point
    if (pointCloudData.normals) pointDataSize += numPoints * 3 * 4; // Normal (float) = 12 bytes per point
    
    // バッファの生成
    const dataBuffer = new ArrayBuffer(pointDataSize);
    let dataView = new DataView(dataBuffer);
    let offset = 0;
    
    // ポイントデータの書き込み（10%区切りで進捗を報告）
    const progressStep = Math.ceil(numPoints / 10);
    
    for (let i = 0; i < numPoints; i++) {
      if (exportAborted) return;
      
      const idx = i * 3;
      
      // XYZ座標の書き込み
      dataView.setFloat32(offset, pointCloudData.positions[idx], true);
      offset += 4;
      dataView.setFloat32(offset, pointCloudData.positions[idx + 1], true);
      offset += 4;
      dataView.setFloat32(offset, pointCloudData.positions[idx + 2], true);
      offset += 4;
      
      // 色情報の書き込み
      if (pointCloudData.colors) {
        dataView.setUint8(offset, Math.floor(pointCloudData.colors[idx] * 255));
        offset += 1;
        dataView.setUint8(offset, Math.floor(pointCloudData.colors[idx + 1] * 255));
        offset += 1;
        dataView.setUint8(offset, Math.floor(pointCloudData.colors[idx + 2] * 255));
        offset += 1;
      }
      
      // 法線情報の書き込み
      if (pointCloudData.normals) {
        dataView.setFloat32(offset, pointCloudData.normals[idx], true);
        offset += 4;
        dataView.setFloat32(offset, pointCloudData.normals[idx + 1], true);
        offset += 4;
        dataView.setFloat32(offset, pointCloudData.normals[idx + 2], true);
        offset += 4;
      }
      
      // 進捗状況の更新（10%区切り）
      if (i % progressStep === 0) {
        const progress = 20 + Math.floor((i / numPoints) * 60);
        sendProgress(progress, `PLYデータ生成中... ${Math.floor(i / numPoints * 100)}%`);
      }
    }
    
    sendProgress(80, 'データを圧縮中...');
    
    // ヘッダーとデータの結合
    const resultBlob = new Blob([headerBuffer, dataBuffer], { type: 'application/octet-stream' });
    
    // 最終データの送信
    sendProgress(100, 'エクスポート完了');
    self.postMessage({
      type: 'complete',
      data: resultBlob,
      format: 'ply',
      filename: generateFilename('ply')
    });
  } catch (error) {
    sendError('PLY形式への変換中にエラーが発生しました: ' + error.message);
  }
}

// E57形式へのエクスポート
function exportToE57() {
  sendProgress(10, 'E57形式に変換中...');
  
  try {
    // E57は複雑な規格であり、Web環境での完全な実装は難しいため
    // ここではE57のシンプルな実装または中間フォーマットへの変換を行う
    
    sendProgress(20, 'E57メタデータを生成中...');
    
    // E57メタデータの生成（簡易版）
    const e57Header = {
      version: "1.0",
      guid: generateGUID(),
      title: exportConfig.title || "LiDAR Scan",
      description: exportConfig.description || "Exported from LiDAR Scanner Web App",
      dateTime: new Date().toISOString(),
      pointCount: pointCloudData.positions.length / 3,
      coordinateSystem: "cartesian",
      units: "millimeters",
    };
    
    const headerJson = JSON.stringify(e57Header);
    const headerBuffer = new TextEncoder().encode(headerJson);
    
    sendProgress(30, 'E57データ構造を構築中...');
    
    // 点群データのバイナリ変換
    const numPoints = e57Header.pointCount;
    const dataBuffer = new ArrayBuffer(numPoints * 3 * 4); // XYZ floats
    const dataView = new DataView(dataBuffer);
    
    sendProgress(40, 'ポイントデータを処理中...');
    
    // ポイントデータの書き込み
    const progressStep = Math.ceil(numPoints / 10);
    let offset = 0;
    
    for (let i = 0; i < numPoints; i++) {
      if (exportAborted) return;
      
      const idx = i * 3;
      
      dataView.setFloat32(offset, pointCloudData.positions[idx], true);
      offset += 4;
      dataView.setFloat32(offset, pointCloudData.positions[idx + 1], true);
      offset += 4;
      dataView.setFloat32(offset, pointCloudData.positions[idx + 2], true);
      offset += 4;
      
      // 進捗状況の更新
      if (i % progressStep === 0) {
        const progress = 40 + Math.floor((i / numPoints) * 40);
        sendProgress(progress, `E57データ生成中... ${Math.floor(i / numPoints * 100)}%`);
      }
    }
    
    // カラーデータがある場合は別途処理
    let colorBuffer = null;
    if (pointCloudData.colors && pointCloudData.colors.length === numPoints * 3) {
      sendProgress(80, 'カラーデータを処理中...');
      colorBuffer = new ArrayBuffer(numPoints * 3);
      const colorView = new Uint8Array(colorBuffer);
      
      for (let i = 0; i < numPoints * 3; i++) {
        if (exportAborted) return;
        colorView[i] = Math.floor(pointCloudData.colors[i] * 255);
      }
    }
    
    sendProgress(90, 'E57ファイルを構築中...');
    
    // E57ファイル構造（簡易版 - 実際のE57標準とは異なる）
    // ヘッダーの長さを先頭に配置
    const headerLengthBuffer = new ArrayBuffer(4);
    new DataView(headerLengthBuffer).setUint32(0, headerBuffer.byteLength, true);
    
    // 各部分を結合
    const blobs = [
      new Blob([headerLengthBuffer]),
      new Blob([headerBuffer]),
      new Blob([dataBuffer])
    ];
    
    if (colorBuffer) {
      blobs.push(new Blob([colorBuffer]));
    }
    
    const resultBlob = new Blob(blobs, { type: 'application/octet-stream' });
    
    // 最終データの送信
    sendProgress(100, 'エクスポート完了');
    self.postMessage({
      type: 'complete',
      data: resultBlob,
      format: 'e57',
      filename: generateFilename('e57')
    });
  } catch (error) {
    sendError('E57形式への変換中にエラーが発生しました: ' + error.message);
  }
}

// ファイル名生成関数
function generateFilename(extension) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const prefix = exportConfig.filenamePrefix || 'lidar-scan';
  return `${prefix}-${timestamp}.${extension}`;
}

// 進捗状況送信関数
function sendProgress(percent, message) {
  self.postMessage({
    type: 'progress',
    data: {
      percent: percent,
      message: message
    }
  });
}

// エラー送信関数
function sendError(message) {
  self.postMessage({
    type: 'error',
    data: message
  });
}

// GUID生成関数
function generateGUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// データ圧縮関数（簡易実装 - 実際のアプリでは外部ライブラリを使うことが多い）
function compressData(data, callback) {
  // WebWorkerでは標準でzlib等の圧縮ライブラリがないため、
  // 実際のアプリでは圧縮ライブラリをimportするか、
  // シンプルなRLE（Run-Length Encoding）等を実装する
  
  // ここでは圧縮せずにそのまま返す簡易実装
  setTimeout(() => {
    callback(data);
  }, 100);
}