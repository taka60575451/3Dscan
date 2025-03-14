/**
 * 3D測定ツール - 点群データ上での測定機能を提供するモジュール
 */
const MeasurementTools = (function() {
    // 依存モジュール
    const EventBus = window.App.EventBus;
    const PointCloudRenderer = window.App.PointCloudRenderer;
    
    // プライベート変数
    let currentTool = 'distance'; // 現在選択されているツール
    let selectedPoints = []; // 選択された点の配列
    let measurementResults = []; // 測定結果の履歴
    let activeResult = null; // 現在アクティブな測定結果
    let measurementHelpers = {}; // 測定用の視覚的ヘルパーオブジェクト
    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();
    
    // 測定ツールのオプション
    const toolOptions = {
        distance: { maxPoints: 2, color: 0x00ff00, lineWidth: 2 },
        area: { maxPoints: 999, color: 0xffff00, lineWidth: 2, closed: true },
        volume: { maxPoints: 8, color: 0xff8800, lineWidth: 2, closed: true },
        angle: { maxPoints: 3, color: 0x00aaff, lineWidth: 2 },
        section: { maxPoints: 4, color: 0xff00ff, lineWidth: 2, closed: true }
    };
    
    /**
     * 測定ツールを初期化する
     * @param {Object} scene - Three.jsシーン
     * @param {Object} camera - Three.jsカメラ
     * @param {Object} container - マウスイベントを受け取るDOM要素
     */
    function initialize(scene, camera, container) {
        // 視覚的ヘルパーオブジェクトのコンテナを作成
        measurementHelpers.scene = scene;
        measurementHelpers.camera = camera;
        measurementHelpers.container = container;
        measurementHelpers.pointGroup = new THREE.Group();
        measurementHelpers.lineGroup = new THREE.Group();
        measurementHelpers.labelGroup = new THREE.Group();
        
        scene.add(measurementHelpers.pointGroup);
        scene.add(measurementHelpers.lineGroup);
        scene.add(measurementHelpers.labelGroup);
        
        // マウスイベントリスナーを設定
        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mousemove', handleMouseMove);
        
        // イベントリスナーを設定
        EventBus.subscribe('tool.select', handleToolSelect);
        EventBus.subscribe('measurement.clear', clearMeasurement);
        EventBus.subscribe('measurement.undo', undoLastPoint);
        
        console.log('測定ツールが初期化されました');
    }
    
    /**
     * ツール選択ハンドラー
     * @param {Object} data - 選択されたツールの情報
     */
    function handleToolSelect(data) {
        if (toolOptions[data.tool]) {
            clearMeasurement();
            currentTool = data.tool;
            console.log(`測定ツール「${currentTool}」が選択されました`);
            
            // 選択されたツールに関する説明をユーザーに表示
            const toolInstructions = {
                distance: '2点間の距離を測定します。2点を選択してください。',
                area: '面積を測定します。3点以上を選択して閉じた多角形を作成してください。',
                volume: '体積を測定します。頂点を選択して直方体を作成してください。',
                angle: '角度を測定します。3点を選択してください（中点が角の頂点になります）。',
                section: '断面図を作成します。断面を通る平面上の4点を選択してください。'
            };
            
            EventBus.publish('ui.notification', {
                message: toolInstructions[currentTool],
                type: 'info'
            });
        }
    }
    
    /**
     * マウスダウンハンドラー - 点選択処理
     * @param {Event} event - マウスイベント
     */
    function handleMouseDown(event) {
        if (!currentTool || !toolOptions[currentTool]) return;
        
        // マウス位置を正規化
        const rect = measurementHelpers.container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // レイキャストで点群データ内の点を選択
        raycaster.setFromCamera(mouse, measurementHelpers.camera);
        const pointCloud = PointCloudRenderer.getPointCloud();
        
        if (!pointCloud) {
            console.warn('点群データが読み込まれていません');
            return;
        }
        
        const intersects = raycaster.intersectObject(pointCloud);
        
        if (intersects.length > 0) {
            const point = intersects[0].point.clone();
            addMeasurementPoint(point);
        }
    }
    
    /**
     * マウス移動ハンドラー - 現在位置のプレビュー表示
     * @param {Event} event - マウスイベント
     */
    function handleMouseMove(event) {
        if (!currentTool || selectedPoints.length === 0) return;
        
        // マウス位置を正規化
        const rect = measurementHelpers.container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // レイキャストで現在のポイント位置を取得
        raycaster.setFromCamera(mouse, measurementHelpers.camera);
        const pointCloud = PointCloudRenderer.getPointCloud();
        
        if (!pointCloud) return;
        
        const intersects = raycaster.intersectObject(pointCloud);
        
        if (intersects.length > 0) {
            const point = intersects[0].point.clone();
            updateMeasurementPreview(point);
        }
    }
    
    /**
     * 測定点を追加する
     * @param {THREE.Vector3} point - 選択された3D座標点
     */
    function addMeasurementPoint(point) {
        const toolOpts = toolOptions[currentTool];
        
        // 最大点数チェック
        if (selectedPoints.length >= toolOpts.maxPoints) {
            if (currentTool === 'area') {
                // エリア測定では多角形が開いている限り点を追加できる
                selectedPoints.push(point);
                createPointHelper(point);
                updateMeasurementVisualization();
                return;
            }
            
            // それ以外のツールは最大点数に達したら測定完了
            calculateMeasurement();
            return;
        }
        
        // 点を追加
        selectedPoints.push(point);
        createPointHelper(point);
        updateMeasurementVisualization();
        
        // 必要な点がすべて選択されたら測定を実行
        if (selectedPoints.length === toolOpts.maxPoints) {
            calculateMeasurement();
        }
    }
    
    /**
     * 測定計算を実行して結果を表示する
     */
    function calculateMeasurement() {
        if (selectedPoints.length < 2) return;
        
        let result = {
            tool: currentTool,
            points: selectedPoints.map(p => p.clone()),
            timestamp: new Date(),
            value: 0,
            unit: ''
        };
        
        switch (currentTool) {
            case 'distance':
                result = calculateDistance(result);
                break;
            case 'area':
                result = calculateArea(result);
                break;
            case 'volume':
                result = calculateVolume(result);
                break;
            case 'angle':
                result = calculateAngle(result);
                break;
            case 'section':
                result = createSection(result);
                break;
        }
        
        // 結果を保存
        activeResult = result;
        measurementResults.push(result);
        
        // イベントを発行
        EventBus.publish('measurement.complete', result);
        
        // UI表示を更新
        displayMeasurementResult(result);
    }
    
    /**
     * 距離を計算する
     * @param {Object} result - 測定結果オブジェクト
     * @return {Object} 更新された結果オブジェクト
     */
    function calculateDistance(result) {
        const distance = selectedPoints[0].distanceTo(selectedPoints[1]);
        result.value = distance;
        result.unit = 'm';
        result.displayValue = `${distance.toFixed(3)} m`;
        console.log(`距離測定結果: ${result.displayValue}`);
        return result;
    }
    
    /**
     * 面積を計算する
     * @param {Object} result - 測定結果オブジェクト
     * @return {Object} 更新された結果オブジェクト
     */
    function calculateArea(result) {
        if (selectedPoints.length < 3) {
            result.value = 0;
            result.unit = 'm²';
            result.displayValue = '0 m²';
            return result;
        }
        
        // 多角形の面積計算（三角形分割法）
        let area = 0;
        const firstPoint = selectedPoints[0];
        
        for (let i = 1; i < selectedPoints.length - 1; i++) {
            const triangle = new THREE.Triangle(
                firstPoint,
                selectedPoints[i],
                selectedPoints[i + 1]
            );
            area += triangle.getArea();
        }
        
        result.value = area;
        result.unit = 'm²';
        result.displayValue = `${area.toFixed(3)} m²`;
        console.log(`面積測定結果: ${result.displayValue}`);
        return result;
    }
    
    /**
     * 体積を計算する
     * @param {Object} result - 測定結果オブジェクト
     * @return {Object} 更新された結果オブジェクト
     */
    function calculateVolume(result) {
        if (selectedPoints.length < 8) {
            result.value = 0;
            result.unit = 'm³';
            result.displayValue = '0 m³';
            return result;
        }
        
        // 直方体の体積計算
        // 簡易実装: 対角点から直方体を構築
        const minPoint = new THREE.Vector3(
            Math.min(...selectedPoints.map(p => p.x)),
            Math.min(...selectedPoints.map(p => p.y)),
            Math.min(...selectedPoints.map(p => p.z))
        );
        
        const maxPoint = new THREE.Vector3(
            Math.max(...selectedPoints.map(p => p.x)),
            Math.max(...selectedPoints.map(p => p.y)),
            Math.max(...selectedPoints.map(p => p.z))
        );
        
        const dimensions = maxPoint.clone().sub(minPoint);
        const volume = dimensions.x * dimensions.y * dimensions.z;
        
        result.value = volume;
        result.unit = 'm³';
        result.displayValue = `${volume.toFixed(3)} m³`;
        console.log(`体積測定結果: ${result.displayValue}`);
        return result;
    }
    
    /**
     * 角度を計算する
     * @param {Object} result - 測定結果オブジェクト
     * @return {Object} 更新された結果オブジェクト
     */
    function calculateAngle(result) {
        if (selectedPoints.length < 3) {
            result.value = 0;
            result.unit = '°';
            result.displayValue = '0°';
            return result;
        }
        
        // 3点による角度計算
        const point1 = selectedPoints[0];
        const point2 = selectedPoints[1]; // 角の頂点
        const point3 = selectedPoints[2];
        
        // 2つのベクトルを計算
        const vector1 = new THREE.Vector3().subVectors(point1, point2).normalize();
        const vector2 = new THREE.Vector3().subVectors(point3, point2).normalize();
        
        // 角度を計算（ラジアン）
        const angleRadians = vector1.angleTo(vector2);
        
        // ラジアンから度に変換
        const angleDegrees = angleRadians * (180 / Math.PI);
        
        result.value = angleDegrees;
        result.unit = '°';
        result.displayValue = `${angleDegrees.toFixed(1)}°`;
        console.log(`角度測定結果: ${result.displayValue}`);
        return result;
    }
    
    /**
     * 断面図を生成する
     * @param {Object} result - 測定結果オブジェクト
     * @return {Object} 更新された結果オブジェクト
     */
    function createSection(result) {
        if (selectedPoints.length < 4) {
            result.displayValue = '断面図作成には4点以上必要です';
            return result;
        }
        
        // 選択された4点から平面を定義
        const plane = new THREE.Plane().setFromCoplanarPoints(
            selectedPoints[0],
            selectedPoints[1],
            selectedPoints[2]
        );
        
        // 点群データを取得
        const pointCloud = PointCloudRenderer.getPointCloud();
        if (!pointCloud || !pointCloud.geometry) {
            result.displayValue = '点群データが利用できません';
            return result;
        }
        
        // 断面図計算のための情報を結果に追加
        result.plane = plane;
        result.displayValue = '断面図が生成されました';
        result.unit = '';
        
        // 断面データの生成イベントを発行
        EventBus.publish('section.generate', {
            plane: plane,
            points: selectedPoints,
            thickness: 0.05 // 断面の厚さ（m）
        });
        
        console.log('断面図が生成されました');
        return result;
    }
    
    /**
     * 測定点のビジュアルヘルパーを作成する
     * @param {THREE.Vector3} point - 3D座標点
     */
    function createPointHelper(point) {
        // 球体ジオメトリで点を表示
        const geometry = new THREE.SphereGeometry(0.02, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: toolOptions[currentTool].color
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(point);
        
        measurementHelpers.pointGroup.add(sphere);
    }
    
    /**
     * 測定ビジュアライゼーションを更新する
     */
    function updateMeasurementVisualization() {
        // 以前の線を削除
        while (measurementHelpers.lineGroup.children.length > 0) {
            measurementHelpers.lineGroup.remove(measurementHelpers.lineGroup.children[0]);
        }
        
        if (selectedPoints.length < 2) return;
        
        // 選択された点を接続する線を描画
        const points = [...selectedPoints];
        const toolOpts = toolOptions[currentTool];
        
        // ツールに応じた接続線の描画
        if (currentTool === 'area' || currentTool === 'volume' || currentTool === 'section') {
            // 多角形を描画（最後の点と最初の点を接続）
            if (toolOpts.closed && points.length > 2) {
                points.push(points[0].clone());
            }
        }
        
        // 線の描画
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: toolOpts.color,
            linewidth: toolOpts.lineWidth
        });
        
        const line = new THREE.Line(geometry, material);
        measurementHelpers.lineGroup.add(line);
        
        // 角度測定の場合、角度を視覚的に表示
        if (currentTool === 'angle' && points.length >= 3) {
            displayAngleArc(points[0], points[1], points[2], toolOpts.color);
        }
    }
    
    /**
     * 角度を視覚的に表示する弧を描画
     * @param {THREE.Vector3} point1 - 1つ目の点
     * @param {THREE.Vector3} center - 角の頂点
     * @param {THREE.Vector3} point3 - 3つ目の点
     * @param {number} color - 弧の色
     */
    function displayAngleArc(point1, center, point3, color) {
        // 2つのベクトルを計算
        const vector1 = new THREE.Vector3().subVectors(point1, center).normalize();
        const vector2 = new THREE.Vector3().subVectors(point3, center).normalize();
        
        // 角度を計算（ラジアン）
        const angleRadians = vector1.angleTo(vector2);
        
        // 弧を描画するための円を作成
        const radius = 0.1; // 弧の半径
        const segments = 32; // 弧のセグメント数
        
        // 始点の角度を計算
        const normalVector = new THREE.Vector3().crossVectors(vector1, vector2).normalize();
        const startAngle = Math.atan2(vector1.z, vector1.x);
        
        // 角度に応じた弧の点を生成
        const arcPoints = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startAngle + t * angleRadians;
            
            // 回転行列を使用して点を計算
            const quaternion = new THREE.Quaternion().setFromAxisAngle(normalVector, angle);
            const rotatedVector = vector1.clone().applyQuaternion(quaternion);
            
            // 弧上の点を計算
            const arcPoint = center.clone().add(rotatedVector.multiplyScalar(radius));
            arcPoints.push(arcPoint);
        }
        
        // 弧を描画
        const arcGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
        const arcMaterial = new THREE.LineBasicMaterial({ color: color });
        const arc = new THREE.Line(arcGeometry, arcMaterial);
        
        measurementHelpers.lineGroup.add(arc);
    }
    
    /**
     * 測定プレビューを更新する
     * @param {THREE.Vector3} currentPoint - 現在のマウス位置の3D点
     */
    function updateMeasurementPreview(currentPoint) {
        // 実際の測定点が選択される前のプレビュー表示
        if (selectedPoints.length === 0) return;
        
        // 一時的なプレビュー点配列を作成
        const previewPoints = [...selectedPoints, currentPoint];
        
        // 以前の線を削除
        while (measurementHelpers.lineGroup.children.length > 0) {
            measurementHelpers.lineGroup.remove(measurementHelpers.lineGroup.children[0]);
        }
        
        // プレビュー線を描画
        const toolOpts = toolOptions[currentTool];
        
        // ツールに応じた接続線の描画
        if ((currentTool === 'area' || currentTool === 'volume' || currentTool === 'section') && 
            previewPoints.length > 2 && toolOpts.closed) {
            // 多角形を閉じる
            previewPoints.push(previewPoints[0].clone());
        }
        
        // 線の描画
        const geometry = new THREE.BufferGeometry().setFromPoints(previewPoints);
        const material = new THREE.LineBasicMaterial({
            color: toolOpts.color,
            linewidth: toolOpts.lineWidth,
            opacity: 0.7,
            transparent: true
        });
        
        const line = new THREE.Line(geometry, material);
        measurementHelpers.lineGroup.add(line);
        
        // プレビュー測定値を計算して表示
        if (currentTool === 'distance' && previewPoints.length === 2) {
            const distance = previewPoints[0].distanceTo(previewPoints[1]);
            displayTemporaryResult(`距離: ${distance.toFixed(3)} m`);
        } else if (currentTool === 'angle' && previewPoints.length === 3) {
            // 角度の計算
            const vector1 = new THREE.Vector3().subVectors(previewPoints[0], previewPoints[1]).normalize();
            const vector2 = new THREE.Vector3().subVectors(previewPoints[2], previewPoints[1]).normalize();
            const angleRadians = vector1.angleTo(vector2);
            const angleDegrees = angleRadians * (180 / Math.PI);
            
            displayTemporaryResult(`角度: ${angleDegrees.toFixed(1)}°`);
        }
    }
    
    /**
     * 一時的な測定結果をUI上に表示
     * @param {string} text - 表示するテキスト
     */
    function displayTemporaryResult(text) {
        EventBus.publish('ui.measurement.preview', { text: text });
    }
    
    /**
     * 測定結果をUI上に表示
     * @param {Object} result - 測定結果オブジェクト
     */
    function displayMeasurementResult(result) {
        EventBus.publish('ui.measurement.result', result);
    }
    
    /**
     * 最後に追加した点を取り消す
     */
    function undoLastPoint() {
        if (selectedPoints.length === 0) return;
        
        // 最後の点を削除
        selectedPoints.pop();
        
        // 対応する視覚的ヘルパーを削除
        if (measurementHelpers.pointGroup.children.length > 0) {
            const lastPoint = measurementHelpers.pointGroup.children[measurementHelpers.pointGroup.children.length - 1];
            measurementHelpers.pointGroup.remove(lastPoint);
        }
        
        // 測定ビジュアライゼーションを更新
        updateMeasurementVisualization();
        
        console.log('最後の点が取り消されました');
    }
    
    /**
     * 現在の測定をクリアする
     */
    function clearMeasurement() {
        // 選択された点をリセット
        selectedPoints = [];
        
        // 視覚的ヘルパーをクリア
        while (measurementHelpers.pointGroup.children.length > 0) {
            measurementHelpers.pointGroup.remove(measurementHelpers.pointGroup.children[0]);
        }
        
        while (measurementHelpers.lineGroup.children.length > 0) {
            measurementHelpers.lineGroup.remove(measurementHelpers.lineGroup.children[0]);
        }
        
        while (measurementHelpers.labelGroup.children.length > 0) {
            measurementHelpers.labelGroup.remove(measurementHelpers.labelGroup.children[0]);
        }
        
        // アクティブな結果をリセット
        activeResult = null;
        
        console.log('測定がクリアされました');
    }
    
    /**
     * 測定履歴を取得する
     * @return {Array} 測定結果の配列
     */
    function getMeasurementHistory() {
        return measurementResults;
    }
    
    /**
     * 測定履歴をクリアする
     */
    function clearMeasurementHistory() {
        measurementResults = [];
        EventBus.publish('measurement.history.cleared');
        console.log('測定履歴がクリアされました');
    }
    
    /**
     * 測定結果をJSONとしてエクスポートする
     * @return {string} JSON形式の測定結果
     */
    function exportMeasurementsAsJSON() {
        // 座標点はシリアライズ可能な形式に変換
        const exportData = measurementResults.map(result => {
            const serializedResult = { ...result };
            serializedResult.points = result.points.map(point => ({
                x: point.x,
                y: point.y,
                z: point.z
            }));
            
            // 平面データがある場合はシリアライズ
            if (result.plane) {
                serializedResult.plane = {
                    normal: {
                        x: result.plane.normal.x,
                        y: result.plane.normal.y,
                        z: result.plane.normal.z
                    },
                    constant: result.plane.constant
                };
            }
            
            // タイムスタンプを文字列に変換
            serializedResult.timestamp = result.timestamp.toISOString();
            
            return serializedResult;
        });
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // パブリックAPI
    return {
        initialize: initialize,
        selectTool: handleToolSelect,
        clearMeasurement: clearMeasurement,
        undoLastPoint: undoLastPoint,
        getMeasurementHistory: getMeasurementHistory,
        clearMeasurementHistory: clearMeasurementHistory,
        exportMeasurementsAsJSON: exportMeasurementsAsJSON
    };
})();

// グローバルApp名前空間への登録
window.App = window.App || {};
window.App.MeasurementTools = MeasurementTools;