/**
 * 点群データレンダリングモジュール
 * Three.jsを使用して点群データを効率的にレンダリングするための機能を提供
 */

// 依存モジュールをインポート
import * as THREE from 'THREE';
import { OrbitControls } from 'OrbitControls';
import { ShaderLib } from './shaders.js';
import { EventBus } from './eventBus.js';

// 点群レンダラーモジュール
const PointCloudRenderer = (function() {
  // プライベート変数
  let container, scene, camera, renderer, controls;
  let pointCloud, pointCloudGeometry, pointCloudMaterial;
  let animationFrameId;
  let isInitialized = false;
  let viewMode = 'realtime'; // 'realtime' または 'static'
  
  // レンダリング設定
  const settings = {
    pointSize: 0.005,
    pointColor: 0xffffff,
    backgroundColor: 0x000000,
    maxPoints: 1000000, // 一度に描画できる最大点数
    frustumCulled: true,
    enableLOD: true,
    lodLevels: [
      { distance: 0, density: 1.0 },
      { distance: 10, density: 0.5 },
      { distance: 20, density: 0.25 }
    ],
    bloom: {
      enabled: false,
      strength: 1.5,
      radius: 0.4,
      threshold: 0.85
    }
  };
  
  // レンダラーの初期化
  function init(containerElement) {
    if (isInitialized) return;
    
    // コンテナを保存
    container = typeof containerElement === 'string' 
      ? document.getElementById(containerElement)
      : containerElement;
    
    if (!container) {
      console.error('PointCloudRenderer: 指定されたコンテナが見つかりません');
      return;
    }
    
    // Three.jsのセットアップ
    scene = new THREE.Scene();
    scene.background = new THREE.Color(settings.backgroundColor);
    
    // カメラのセットアップ
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspectRatio = width / height;
    camera = new THREE.PerspectiveCamera(65, aspectRatio, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    // レンダラーのセットアップ
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // コントロールのセットアップ
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    
    // 初期ジオメトリの作成
    createPointCloud();
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // レンダリングループの開始
    animate();
    
    isInitialized = true;
    
    // 初期化完了イベントを発火
    EventBus.publish('pointCloudRenderer:initialized');
    
    return {
      scene,
      camera,
      renderer,
      controls
    };
  }
  
  // 点群の作成
  function createPointCloud() {
    // BufferGeometryの作成
    pointCloudGeometry = new THREE.BufferGeometry();
    
    // プリアロケーションバッファー
    const positions = new Float32Array(settings.maxPoints * 3);
    const colors = new Float32Array(settings.maxPoints * 3);
    const intensities = new Float32Array(settings.maxPoints);
    
    // バッファー属性の設定
    pointCloudGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointCloudGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pointCloudGeometry.setAttribute('intensity', new THREE.BufferAttribute(intensities, 1));
    
    // 初期に有効な点の数を0に設定
    pointCloudGeometry.setDrawRange(0, 0);
    
    // カスタムシェーダーマテリアルの作成
    pointCloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        pointSize: { value: settings.pointSize },
        defaultColor: { value: new THREE.Color(settings.pointColor) },
        useVertexColors: { value: true }
      },
      vertexShader: ShaderLib.pointCloud.vertex,
      fragmentShader: ShaderLib.pointCloud.fragment,
      transparent: true,
      vertexColors: true
    });
    
    // 点群オブジェクトの作成
    pointCloud = new THREE.Points(pointCloudGeometry, pointCloudMaterial);
    pointCloud.frustumCulled = settings.frustumCulled;
    scene.add(pointCloud);
  }
  
  // レンダリングループ
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    
    // カメラコントロールの更新
    if (controls) controls.update();
    
    // LODの適用（必要に応じて）
    if (settings.enableLOD && pointCloud) {
      applyLOD();
    }
    
    // シーンのレンダリング
    render();
  }
  
  // シーンのレンダリング
  function render() {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
  
  // レベル・オブ・ディテールの適用
  function applyLOD() {
    if (!camera || !pointCloud) return;
    
    const cameraPosition = camera.position.clone();
    const pointCloudPosition = pointCloud.position.clone();
    const distance = cameraPosition.distanceTo(pointCloudPosition);
    
    // 距離に基づいて密度を決定
    let density = 1.0;
    for (let i = settings.lodLevels.length - 1; i >= 0; i--) {
      if (distance >= settings.lodLevels[i].distance) {
        density = settings.lodLevels[i].density;
        break;
      }
    }
    
    // 表示する点の数を密度に基づいて調整
    const totalPoints = pointCloudGeometry.attributes.position.count;
    const visiblePoints = Math.floor(totalPoints * density);
    pointCloudGeometry.setDrawRange(0, visiblePoints);
  }
  
  // データの更新
  function updatePointCloud(pointData) {
    if (!pointCloudGeometry || !pointData) return;
    
    const positions = pointCloudGeometry.attributes.position.array;
    const colors = pointCloudGeometry.attributes.color.array;
    const intensities = pointCloudGeometry.attributes.intensity.array;
    
    // 点の数に制限を設ける
    const numPoints = Math.min(pointData.length, settings.maxPoints);
    
    // データの更新
    for (let i = 0; i < numPoints; i++) {
      const point = pointData[i];
      const i3 = i * 3;
      
      // 位置の更新
      positions[i3] = point.x || 0;
      positions[i3 + 1] = point.y || 0;
      positions[i3 + 2] = point.z || 0;
      
      // 色の更新（存在する場合）
      if (point.color) {
        colors[i3] = point.color.r || 1.0;
        colors[i3 + 1] = point.color.g || 1.0;
        colors[i3 + 2] = point.color.b || 1.0;
      } else {
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;
      }
      
      // 強度の更新（存在する場合）
      intensities[i] = point.intensity !== undefined ? point.intensity : 1.0;
    }
    
    // バッファーの更新フラグを設定
    pointCloudGeometry.attributes.position.needsUpdate = true;
    pointCloudGeometry.attributes.color.needsUpdate = true;
    pointCloudGeometry.attributes.intensity.needsUpdate = true;
    
    // 描画範囲を更新
    pointCloudGeometry.setDrawRange(0, numPoints);
    
    // 点群が正しく表示されるようにバウンディングスフィアを更新
    pointCloudGeometry.computeBoundingSphere();
    
    // データ更新イベントを発火
    EventBus.publish('pointCloudRenderer:dataUpdated', { pointCount: numPoints });
  }
  
  // 点群データの追加（既存データへの追加）
  function appendPointCloudData(pointData) {
    if (!pointCloudGeometry || !pointData || pointData.length === 0) return;
    
    const positions = pointCloudGeometry.attributes.position.array;
    const colors = pointCloudGeometry.attributes.color.array;
    const intensities = pointCloudGeometry.attributes.intensity.array;
    
    // 現在の点の数を取得
    const currentCount = pointCloudGeometry.drawRange.count;
    
    // 追加できる最大の点の数を計算
    const appendCount = Math.min(pointData.length, settings.maxPoints - currentCount);
    
    if (appendCount <= 0) {
      console.warn('PointCloudRenderer: 最大点数に達しました。データを追加できません。');
      return;
    }
    
    // 新しいデータを追加
    for (let i = 0; i < appendCount; i++) {
      const point = pointData[i];
      const index = currentCount + i;
      const i3 = index * 3;
      
      // 位置の設定
      positions[i3] = point.x || 0;
      positions[i3 + 1] = point.y || 0;
      positions[i3 + 2] = point.z || 0;
      
      // 色の設定
      if (point.color) {
        colors[i3] = point.color.r || 1.0;
        colors[i3 + 1] = point.color.g || 1.0;
        colors[i3 + 2] = point.color.b || 1.0;
      } else {
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;
      }
      
      // 強度の設定
      intensities[index] = point.intensity !== undefined ? point.intensity : 1.0;
    }
    
    // バッファーの更新フラグを設定
    pointCloudGeometry.attributes.position.needsUpdate = true;
    pointCloudGeometry.attributes.color.needsUpdate = true;
    pointCloudGeometry.attributes.intensity.needsUpdate = true;
    
    // 描画範囲を更新
    pointCloudGeometry.setDrawRange(0, currentCount + appendCount);
    
    // バウンディングスフィアを更新
    pointCloudGeometry.computeBoundingSphere();
    
    // データ追加イベントを発火
    EventBus.publish('pointCloudRenderer:dataAppended', { 
      pointCount: currentCount + appendCount,
      appendedCount: appendCount 
    });
  }
  
  // 点群データのクリア
  function clearPointCloud() {
    if (pointCloudGeometry) {
      pointCloudGeometry.setDrawRange(0, 0);
      EventBus.publish('pointCloudRenderer:dataCleared');
    }
  }
  
  // レンダリング設定の更新
  function updateSettings(newSettings) {
    // 設定のマージ
    Object.assign(settings, newSettings);
    
    // 点のサイズを更新
    if (pointCloudMaterial) {
      pointCloudMaterial.uniforms.pointSize.value = settings.pointSize;
    }
    
    // 色を更新
    if (pointCloudMaterial) {
      pointCloudMaterial.uniforms.defaultColor.value = new THREE.Color(settings.pointColor);
    }
    
    // 背景色を更新
    if (scene) {
      scene.background = new THREE.Color(settings.backgroundColor);
    }
    
    // フラスタムカリングの更新
    if (pointCloud) {
      pointCloud.frustumCulled = settings.frustumCulled;
    }
    
    // 設定更新イベントを発火
    EventBus.publish('pointCloudRenderer:settingsUpdated', settings);
  }
  
  // ビューモードの切り替え
  function setViewMode(mode) {
    if (mode !== 'realtime' && mode !== 'static') {
      console.error('PointCloudRenderer: 無効なビューモードです。"realtime"または"static"を使用してください。');
      return;
    }
    
    viewMode = mode;
    
    // リアルタイムモードではアニメーションループを実行、静的モードでは一度だけレンダリング
    if (viewMode === 'static') {
      cancelAnimationFrame(animationFrameId);
      render(); // 一度レンダリング
    } else {
      // アニメーションループが実行されていない場合は再開
      if (!animationFrameId) {
        animate();
      }
    }
    
    // モード変更イベントを発火
    EventBus.publish('pointCloudRenderer:viewModeChanged', { mode: viewMode });
  }
  
  // リサイズ処理
  function resize() {
    if (!container || !camera || !renderer) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // カメラのアスペクト比を更新
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    // レンダラーのサイズを更新
    renderer.setSize(width, height);
    
    // 再描画
    render();
    
    // リサイズイベントを発火
    EventBus.publish('pointCloudRenderer:resized', { width, height });
  }
  
  // 点群の中心にカメラを移動
  function focusOnPointCloud() {
    if (!pointCloud || !pointCloudGeometry || !controls) return;
    
    // バウンディングスフィアを計算
    pointCloudGeometry.computeBoundingSphere();
    const boundingSphere = pointCloudGeometry.boundingSphere;
    
    if (boundingSphere) {
      // 点群の中心にコントロールのターゲットを設定
      controls.target.copy(boundingSphere.center);
      
      // 中心から適切な距離にカメラを配置
      const offset = new THREE.Vector3(0, 0, boundingSphere.radius * 2.5);
      camera.position.copy(boundingSphere.center).add(offset);
      
      // コントロールを更新
      controls.update();
      
      // フォーカスイベントを発火
      EventBus.publish('pointCloudRenderer:focusedOnPointCloud');
    }
  }
  
  // イベントリスナーの設定
  function setupEventListeners() {
    // ウィンドウリサイズイベント
    window.addEventListener('resize', resize);
    
    // イベントバスのサブスクリプション
    EventBus.subscribe('pointCloudProcessor:dataProcessed', function(data) {
      if (data && data.points) {
        updatePointCloud(data.points);
      }
    });
  }
  
  // クリーンアップ
  function dispose() {
    // アニメーションフレームをキャンセル
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    // イベントリスナーを削除
    window.removeEventListener('resize', resize);
    
    // Three.jsリソースの解放
    if (pointCloudGeometry) pointCloudGeometry.dispose();
    if (pointCloudMaterial) pointCloudMaterial.dispose();
    
    if (scene) {
      scene.remove(pointCloud);
    }
    
    if (controls) {
      controls.dispose();
    }
    
    if (renderer) {
      if (container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    }
    
    // 変数をクリア
    container = null;
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    pointCloud = null;
    pointCloudGeometry = null;
    pointCloudMaterial = null;
    
    isInitialized = false;
    
    // クリーンアップイベントを発火
    EventBus.publish('pointCloudRenderer:disposed');
  }
  
  // 一時停止/再開
  function pause() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      EventBus.publish('pointCloudRenderer:paused');
    }
  }
  
  function resume() {
    if (!animationFrameId && isInitialized) {
      animate();
      EventBus.publish('pointCloudRenderer:resumed');
    }
  }
  
  // 公開API
  return {
    init,
    updatePointCloud,
    appendPointCloudData,
    clearPointCloud,
    updateSettings,
    setViewMode,
    resize,
    focusOnPointCloud,
    dispose,
    pause,
    resume
  };
})();

export default PointCloudRenderer;