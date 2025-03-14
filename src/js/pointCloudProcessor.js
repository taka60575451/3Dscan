/**
 * pointCloudProcessor.js
 * 点群データの処理と最適化を行うモジュール
 */

// モジュールパターンで実装
const PointCloudProcessor = (function() {
  // プライベート変数
  let rawPointData = null;
  let processedPointData = null;
  let octree = null;
  let worker = null;
  let processingCallbacks = {};
  let analysisResults = {};
  
  // WebWorkerの初期化
  function initWorker() {
    if (window.Worker) {
      worker = new Worker('src/js/workers/pointCloudWorker.js');
      
      worker.onmessage = function(e) {
        const { type, data, requestId } = e.data;
        
        switch (type) {
          case 'filterComplete':
            processedPointData = data.points;
            if (processingCallbacks[requestId]) {
              processingCallbacks[requestId](data);
              delete processingCallbacks[requestId];
            }
            EventBus.publish('pointCloud:filtered', { points: processedPointData });
            break;
            
          case 'analysisComplete':
            analysisResults = data.results;
            if (processingCallbacks[requestId]) {
              processingCallbacks[requestId](data.results);
              delete processingCallbacks[requestId];
            }
            EventBus.publish('pointCloud:analysisComplete', { results: analysisResults });
            break;
            
          case 'bufferGenerated':
            if (processingCallbacks[requestId]) {
              processingCallbacks[requestId](data.buffer);
              delete processingCallbacks[requestId];
            }
            break;
            
          case 'error':
            console.error('Worker error:', data.message);
            if (processingCallbacks[requestId]) {
              processingCallbacks[requestId](null, new Error(data.message));
              delete processingCallbacks[requestId];
            }
            EventBus.publish('pointCloud:error', { message: data.message });
            break;
            
          case 'progress':
            EventBus.publish('pointCloud:processingProgress', { 
              progress: data.progress,
              stage: data.stage
            });
            break;
        }
      };
      
      worker.onerror = function(error) {
        console.error('Worker error:', error);
        EventBus.publish('pointCloud:error', { message: 'Worker処理中にエラーが発生しました' });
      };
    } else {
      console.warn('WebWorkerがサポートされていないため、メインスレッドでの処理に切り替えます');
    }
  }
  
  // Octreeデータ構造の構築
  function buildOctree(points, maxDepth = 8, minPointsPerNode = 5) {
    // シンプルなOctree実装
    function createNode(boundingBox) {
      return {
        boundingBox,
        points: [],
        children: null
      };
    }
    
    function calculateBoundingBox(points) {
      if (!points || points.length === 0) return null;
      
      const min = { x: Infinity, y: Infinity, z: Infinity };
      const max = { x: -Infinity, y: -Infinity, z: -Infinity };
      
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        min.x = Math.min(min.x, point.x);
        min.y = Math.min(min.y, point.y);
        min.z = Math.min(min.z, point.z);
        max.x = Math.max(max.x, point.x);
        max.y = Math.max(max.y, point.y);
        max.z = Math.max(max.z, point.z);
      }
      
      return { min, max };
    }
    
    function subdivideNode(node, depth) {
      const bb = node.boundingBox;
      const midX = (bb.min.x + bb.max.x) / 2;
      const midY = (bb.min.y + bb.max.y) / 2;
      const midZ = (bb.min.z + bb.max.z) / 2;
      
      node.children = [];
      
      // 8つの子ノードを作成
      for (let i = 0; i < 8; i++) {
        const minX = (i & 1) ? midX : bb.min.x;
        const maxX = (i & 1) ? bb.max.x : midX;
        const minY = (i & 2) ? midY : bb.min.y;
        const maxY = (i & 2) ? bb.max.y : midY;
        const minZ = (i & 4) ? midZ : bb.min.z;
        const maxZ = (i & 4) ? bb.max.z : midZ;
        
        node.children.push(createNode({
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ }
        }));
      }
      
      // 点を適切な子ノードに割り当て
      for (let i = 0; i < node.points.length; i++) {
        const point = node.points[i];
        const index = ((point.x > midX) ? 1 : 0) +
                     ((point.y > midY) ? 2 : 0) +
                     ((point.z > midZ) ? 4 : 0);
        node.children[index].points.push(point);
      }
      
      // 再帰的に子ノードを分割
      if (depth < maxDepth) {
        for (let i = 0; i < 8; i++) {
          if (node.children[i].points.length > minPointsPerNode) {
            subdivideNode(node.children[i], depth + 1);
          }
        }
      }
      
      // メモリを節約するため、親ノードの点を削除
      node.points = [];
    }
    
    // Octreeのルートノード作成
    const boundingBox = calculateBoundingBox(points);
    const root = createNode(boundingBox);
    root.points = [...points];
    
    // 基準点数以上あれば分割を開始
    if (points.length > minPointsPerNode) {
      subdivideNode(root, 0);
    }
    
    return root;
  }
  
  // データ処理のメインロジック（WebWorker非対応時のフォールバック）
  function processDataLocally(points, options) {
    return new Promise((resolve, reject) => {
      try {
        let processed = [...points];
        
        // ノイズフィルタリング
        if (options.noiseFilter) {
          processed = applyNoiseFilterLocal(processed, options.noiseFilterParams);
        }
        
        // ダウンサンプリング
        if (options.downsample) {
          processed = applyDownsamplingLocal(processed, options.downsampleFactor);
        }
        
        // 座標変換
        if (options.transform) {
          processed = applyTransformLocal(processed, options.transformMatrix);
        }
        
        // 結果を返す
        resolve(processed);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // ローカルでのノイズフィルタリング実装
  function applyNoiseFilterLocal(points, params = {}) {
    const { radius = 0.05, minNeighbors = 3 } = params;
    const result = [];
    
    // 単純な距離ベースのノイズ除去
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      let neighborCount = 0;
      
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        
        const other = points[j];
        const distance = Math.sqrt(
          Math.pow(point.x - other.x, 2) +
          Math.pow(point.y - other.y, 2) +
          Math.pow(point.z - other.z, 2)
        );
        
        if (distance < radius) {
          neighborCount++;
          if (neighborCount >= minNeighbors) break;
        }
      }
      
      if (neighborCount >= minNeighbors) {
        result.push(point);
      }
    }
    
    return result;
  }
  
  // ローカルでのダウンサンプリング実装
  function applyDownsamplingLocal(points, factor = 2) {
    if (factor <= 1) return points;
    
    const result = [];
    for (let i = 0; i < points.length; i += factor) {
      result.push(points[i]);
    }
    
    return result;
  }
  
  // ローカルでの座標変換実装
  function applyTransformLocal(points, matrix) {
    if (!matrix) return points;
    
    return points.map(point => {
      // 4x4行列による変換
      const x = matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12];
      const y = matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13];
      const z = matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14];
      const w = matrix[3] * point.x + matrix[7] * point.y + matrix[11] * point.z + matrix[15];
      
      return {
        x: x / w,
        y: y / w,
        z: z / w,
        r: point.r,
        g: point.g,
        b: point.b
      };
    });
  }
  
  // レンダリング用バッファー生成
  function generateBufferLocal(points) {
    const pointCount = points.length;
    
    // 頂点座標用Float32Array (x, y, z)
    const positions = new Float32Array(pointCount * 3);
    
    // 色情報用Float32Array (r, g, b)
    const colors = new Float32Array(pointCount * 3);
    
    // バッファーデータの構築
    for (let i = 0; i < pointCount; i++) {
      const point = points[i];
      
      // 頂点座標
      positions[i * 3]     = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      
      // 色情報（0-255 から 0-1 に正規化）
      colors[i * 3]     = (point.r !== undefined) ? point.r / 255 : 1.0;
      colors[i * 3 + 1] = (point.g !== undefined) ? point.g / 255 : 1.0;
      colors[i * 3 + 2] = (point.b !== undefined) ? point.b / 255 : 1.0;
    }
    
    return {
      positions,
      colors,
      count: pointCount
    };
  }
  
  // データ解析ローカル実装
  function analyzeDataLocal(points) {
    if (!points || points.length === 0) {
      return { error: 'データがありません' };
    }
    
    // 基本的な統計計算
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let sumX = 0, sumY = 0, sumZ = 0;
    
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
      
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
    }
    
    const count = points.length;
    const avgX = sumX / count;
    const avgY = sumY / count;
    const avgZ = sumZ / count;
    
    // 寸法計算
    const dimensionX = maxX - minX;
    const dimensionY = maxY - minY;
    const dimensionZ = maxZ - minZ;
    
    // 体積計算（簡易的な直方体近似）
    const volume = dimensionX * dimensionY * dimensionZ;
    
    // 密度計算（点の数/体積）
    const density = count / volume;
    
    return {
      pointCount: count,
      boundingBox: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ }
      },
      dimensions: {
        x: dimensionX,
        y: dimensionY,
        z: dimensionZ
      },
      center: { x: avgX, y: avgY, z: avgZ },
      volume: volume,
      density: density
    };
  }
  
  // ユニークなリクエストID生成
  function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }
  
  // 初期化処理
  function init() {
    initWorker();
    EventBus.subscribe('pointCloud:newData', onNewPointsReceived);
  }
  
  // 新しい点群データ受信時のハンドラ
  function onNewPointsReceived(data) {
    rawPointData = data.points;
    processedPointData = [...rawPointData]; // 初期状態としてコピー
    octree = null; // 新しいデータが来たらOctreeをリセット
    
    // 基本解析を即時実行
    analyzeData().then(results => {
      EventBus.publish('pointCloud:initialized', {
        pointCount: rawPointData.length,
        analysisResults: results
      });
    });
  }
  
  // パブリックAPI
  return {
    // 初期化
    init: init,
    
    // 点群データ設定
    setPointData: function(points) {
      rawPointData = points;
      processedPointData = [...points];
      EventBus.publish('pointCloud:newData', { points });
      return this;
    },
    
    // 点群データ取得
    getPointData: function() {
      return processedPointData || [];
    },
    
    // データ処理（フィルタリング、変換など）
    processData: function(options = {}) {
      return new Promise((resolve, reject) => {
        if (!rawPointData) {
          reject(new Error('処理するデータがありません'));
          return;
        }
        
        const requestId = generateRequestId();
        
        if (worker) {
          // WebWorkerが利用可能な場合
          processingCallbacks[requestId] = (result, error) => {
            if (error) {
              reject(error);
            } else {
              processedPointData = result.points;
              resolve(result);
            }
          };
          
          worker.postMessage({
            type: 'processData',
            requestId,
            points: rawPointData,
            options
          });
        } else {
          // WebWorkerが利用できない場合はメインスレッドで処理
          processDataLocally(rawPointData, options)
            .then(result => {
              processedPointData = result;
              resolve({ points: result });
            })
            .catch(reject);
        }
      });
    },
    
    // 特定のフィルタを適用
    applyFilter: function(filterType, params = {}) {
      return new Promise((resolve, reject) => {
        if (!processedPointData) {
          reject(new Error('処理するデータがありません'));
          return;
        }
        
        const requestId = generateRequestId();
        
        if (worker) {
          processingCallbacks[requestId] = (result, error) => {
            if (error) {
              reject(error);
            } else {
              processedPointData = result.points;
              resolve(result);
            }
          };
          
          worker.postMessage({
            type: 'applyFilter',
            requestId,
            filterType,
            points: processedPointData,
            params
          });
        } else {
          let result;
          
          switch (filterType) {
            case 'noise':
              result = applyNoiseFilterLocal(processedPointData, params);
              break;
            case 'downsample':
              result = applyDownsamplingLocal(processedPointData, params.factor);
              break;
            default:
              reject(new Error(`未知のフィルタータイプ: ${filterType}`));
              return;
          }
          
          processedPointData = result;
          resolve({ points: result });
        }
      });
    },
    
    // 座標変換の適用
    applyTransform: function(transformMatrix) {
      return new Promise((resolve, reject) => {
        if (!processedPointData) {
          reject(new Error('処理するデータがありません'));
          return;
        }
        
        const requestId = generateRequestId();
        
        if (worker) {
          processingCallbacks[requestId] = (result, error) => {
            if (error) {
              reject(error);
            } else {
              processedPointData = result.points;
              resolve(result);
            }
          };
          
          worker.postMessage({
            type: 'applyTransform',
            requestId,
            points: processedPointData,
            transformMatrix
          });
        } else {
          const result = applyTransformLocal(processedPointData, transformMatrix);
          processedPointData = result;
          resolve({ points: result });
        }
      });
    },
    
    // データの解析
    analyzeData: function() {
      return new Promise((resolve, reject) => {
        if (!processedPointData) {
          reject(new Error('解析するデータがありません'));
          return;
        }
        
        const requestId = generateRequestId();
        
        if (worker) {
          processingCallbacks[requestId] = (results, error) => {
            if (error) {
              reject(error);
            } else {
              analysisResults = results;
              resolve(results);
            }
          };
          
          worker.postMessage({
            type: 'analyzeData',
            requestId,
            points: processedPointData
          });
        } else {
          try {
            const results = analyzeDataLocal(processedPointData);
            analysisResults = results;
            resolve(results);
          } catch (error) {
            reject(error);
          }
        }
      });
    },
    
    // 解析結果の取得
    getAnalysisResults: function() {
      return analysisResults;
    },
    
    // レンダリング用バッファーの生成
    generateBuffer: function() {
      return new Promise((resolve, reject) => {
        if (!processedPointData) {
          reject(new Error('バッファーを生成するデータがありません'));
          return;
        }
        
        const requestId = generateRequestId();
        
        if (worker) {
          processingCallbacks[requestId] = (buffer, error) => {
            if (error) {
              reject(error);
            } else {
              resolve(buffer);
            }
          };
          
          worker.postMessage({
            type: 'generateBuffer',
            requestId,
            points: processedPointData
          });
        } else {
          try {
            const buffer = generateBufferLocal(processedPointData);
            resolve(buffer);
          } catch (error) {
            reject(error);
          }
        }
      });
    },
    
    // Octreeのビルドと取得
    buildOctree: function(maxDepth, minPointsPerNode) {
      return new Promise((resolve, reject) => {
        if (!processedPointData) {
          reject(new Error('Octreeを構築するデータがありません'));
          return;
        }
        
        if (!octree) {
          try {
            octree = buildOctree(processedPointData, maxDepth, minPointsPerNode);
          } catch (error) {
            reject(error);
            return;
          }
        }
        
        resolve(octree);
      });
    },
    
    // Octreeの取得
    getOctree: function() {
      return octree;
    },
    
    // WebWorkerの終了処理
    terminate: function() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    }
  };
})();

// モジュールの初期化
document.addEventListener('DOMContentLoaded', function() {
  PointCloudProcessor.init();
});