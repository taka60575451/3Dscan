// lidarScanner.js - LiDARセンサーを使った3Dスキャン機能

(function() {
    'use strict';

    // 依存モジュールのインポート
    const EventBus = window.App.EventBus;
    const PointCloudProcessor = window.App.PointCloudProcessor;

    // モジュール内部の状態
    let session = null;
    let xrRefSpace = null;
    let scanning = false;
    let paused = false;
    let scanOptions = {
        mode: 'MAX_AREA', // 'MAX_AREA' または 'MAX_DETAIL'
        resolution: 'medium', // 'low', 'medium', 'high'
        filterNoise: true,
        autoOptimize: true
    };
    let scanStartTime = 0;
    let lastFrameTime = 0;
    let pointsCollected = 0;
    let errorState = null;
    let reconnectAttempts = 0;
    let MAX_RECONNECT_ATTEMPTS = 3;
    let scanPercentComplete = 0;
    let estimatedTimeRemaining = 0;

    // ARKitセッション設定
    const AR_SESSION_CONFIG = {
        requiredFeatures: ['hit-test', 'depth-sensing'],
        optionalFeatures: ['light-estimation'],
        depthSensing: {
            usagePreference: ['cpu-optimized', 'gpu-optimized'],
            dataFormatPreference: ['luminance-alpha', 'float32']
        }
    };

    // スキャンモードの設定値
    const SCAN_MODES = {
        MAX_AREA: {
            pointDensity: 100, // points per square meter
            scanRadius: 10, // meters
            frameProcessingRate: 5, // process every n-th frame
            depthConfidenceThreshold: 0.7
        },
        MAX_DETAIL: {
            pointDensity: 500, // points per square meter
            scanRadius: 3, // meters
            frameProcessingRate: 2, // process every n-th frame
            depthConfidenceThreshold: 0.85
        }
    };

    /**
     * XRセッションが対応しているかチェック
     */
    function checkXRSupport() {
        return new Promise((resolve, reject) => {
            if (!window.isSecureContext) {
                reject(new Error('WebXR requires HTTPS'));
                return;
            }
            
            if (!navigator.xr) {
                reject(new Error('WebXR not supported by browser'));
                return;
            }
            
            navigator.xr.isSessionSupported('immersive-ar')
                .then(supported => {
                    if (supported) {
                        resolve();
                    } else {
                        reject(new Error('AR not supported on this device'));
                    }
                })
                .catch(err => {
                    reject(new Error(`WebXR support check failed: ${err.message}`));
                });
        });
    }

    /**
     * ARセッションを初期化
     */
    function initARSession() {
        return new Promise((resolve, reject) => {
            navigator.xr.requestSession('immersive-ar', AR_SESSION_CONFIG)
                .then(xrSession => {
                    session = xrSession;
                    
                    session.addEventListener('end', () => {
                        EventBus.publish('lidarScanner.sessionEnded');
                        session = null;
                        xrRefSpace = null;
                    });
                    
                    session.requestReferenceSpace('local')
                        .then(refSpace => {
                            xrRefSpace = refSpace;
                            
                            // XRレンダリングループのセットアップ
                            session.requestAnimationFrame(processXRFrame);
                            
                            resolve(session);
                            EventBus.publish('lidarScanner.sessionInitialized');
                        })
                        .catch(err => {
                            session.end();
                            reject(new Error(`Failed to get reference space: ${err.message}`));
                        });
                })
                .catch(err => {
                    reject(new Error(`Failed to start AR session: ${err.message}`));
                });
        });
    }

    /**
     * XRフレームを処理
     */
    function processXRFrame(time, frame) {
        if (!session) return;
        
        // 次のフレームをリクエスト
        session.requestAnimationFrame(processXRFrame);
        
        // スキャンが停止またはポーズ中なら処理しない
        if (!scanning || paused) return;
        
        // 一定のフレームレートで処理（モードに応じて）
        const currentMode = SCAN_MODES[scanOptions.mode];
        const frameTime = time - lastFrameTime;
        
        // スキャン時間と進捗を更新
        const scanElapsedTime = time - scanStartTime;
        updateScanProgress(scanElapsedTime);
        
        // 適切なフレームレートで処理（フレームスキップ）
        if (time - lastFrameTime > (1000 / currentMode.frameProcessingRate)) {
            lastFrameTime = time;
            
            try {
                // センサーデータの取得
                const viewerPose = frame.getViewerPose(xrRefSpace);
                if (!viewerPose) return;
                
                // 深度データの取得
                const depthData = getDepthData(frame);
                if (!depthData) return;
                
                // LiDARデータをポイントクラウドに変換
                const pointCloud = processDepthData(depthData, viewerPose, currentMode);
                
                // ポイントクラウドのフィルタリングと最適化
                const processedCloud = PointCloudProcessor.processPointCloud(pointCloud, {
                    filterNoise: scanOptions.filterNoise,
                    optimize: scanOptions.autoOptimize,
                    confidenceThreshold: currentMode.depthConfidenceThreshold
                });
                
                // ポイント数を加算
                pointsCollected += processedCloud.points.length;
                
                // イベント発行（リアルタイム更新用）
                EventBus.publish('lidarScanner.frameProcessed', {
                    pointCloud: processedCloud,
                    stats: {
                        pointsCollected,
                        scanElapsedTime,
                        scanPercentComplete,
                        estimatedTimeRemaining
                    }
                });
                
                // エラー状態をリセット（処理に成功したため）
                if (errorState) {
                    errorState = null;
                    reconnectAttempts = 0;
                    EventBus.publish('lidarScanner.errorRecovered');
                }
            } catch (err) {
                handleScanError(err);
            }
        }
    }
    
    /**
     * フレームから深度データを取得
     */
    function getDepthData(frame) {
        try {
            // この実装はARKitのWeb APIに依存
            // 実際の実装はデバイスと使用するAPIによって異なる
            const depthInfo = frame.getDepthInformation();
            if (!depthInfo) return null;
            
            return {
                data: depthInfo.data,
                width: depthInfo.width,
                height: depthInfo.height,
                timestamp: frame.predictedDisplayTime,
                depthNear: depthInfo.depthNear,
                depthFar: depthInfo.depthFar,
                rawData: depthInfo.rawData
            };
        } catch (err) {
            console.warn('Failed to get depth data:', err);
            return null;
        }
    }
    
    /**
     * 深度データを処理してポイントクラウドに変換
     */
    function processDepthData(depthData, viewerPose, modeSettings) {
        // ビュー行列の取得
        const view = viewerPose.views[0];
        const viewMatrix = view.transform.matrix;
        
        // 点群データの配列
        const points = [];
        const colors = [];
        
        // 深度マップから点群を生成
        // 実際の実装は使用するAPIによって異なる
        // ここではシンプルな疑似実装
        const stride = Math.ceil(depthData.width / Math.sqrt(modeSettings.pointDensity));
        
        for (let y = 0; y < depthData.height; y += stride) {
            for (let x = 0; x < depthData.width; x += stride) {
                const index = y * depthData.width + x;
                const depth = depthData.data[index];
                
                // 有効な深度値のみ処理
                if (depth >= depthData.depthNear && depth <= depthData.depthFar) {
                    // 2D座標を3D空間に投影
                    const normalizedX = (x / depthData.width) * 2 - 1;
                    const normalizedY = (y / depthData.height) * 2 - 1;
                    
                    const point = unprojectPoint(normalizedX, normalizedY, depth, view, viewMatrix);
                    
                    // 有効な点のみ追加
                    if (point && isPointInRange(point, modeSettings.scanRadius)) {
                        points.push(point.x, point.y, point.z);
                        
                        // 色情報（現実的にはカメラフレームからのカラーマッピングが必要）
                        colors.push(0.7, 0.7, 0.7); // デフォルトグレー
                    }
                }
            }
        }
        
        return {
            points,
            colors,
            timestamp: depthData.timestamp,
            pointCount: points.length / 3
        };
    }
    
    /**
     * 2D点を3D空間に逆投影
     */
    function unprojectPoint(normalizedX, normalizedY, depth, view, viewMatrix) {
        // 投影行列の逆行列を計算
        const projectionMatrixInverse = getInverseMatrix(view.projectionMatrix);
        
        // ビュー行列の逆行列を計算
        const viewMatrixInverse = getInverseMatrix(viewMatrix);
        
        // 4次元の射影座標を作成
        const clipSpacePoint = [normalizedX, -normalizedY, 2.0 * depth - 1.0, 1.0];
        
        // クリップ空間からカメラ空間へ変換
        const cameraSpacePoint = multiplyVectorByMatrix(clipSpacePoint, projectionMatrixInverse);
        
        // W成分で除算して正規化
        for (let i = 0; i < 3; i++) {
            cameraSpacePoint[i] /= cameraSpacePoint[3];
        }
        cameraSpacePoint[3] = 1.0;
        
        // カメラ空間からワールド空間へ変換
        const worldSpacePoint = multiplyVectorByMatrix(cameraSpacePoint, viewMatrixInverse);
        
        return {
            x: worldSpacePoint[0],
            y: worldSpacePoint[1],
            z: worldSpacePoint[2]
        };
    }
    
    /**
     * 4x4行列の逆行列を計算（シンプルな実装）
     */
    function getInverseMatrix(m) {
        // 実際の実装では高速な行列ライブラリを使用
        // ここでは簡易実装のためPlaceholderとして単位行列を返す
        // ※実際のARアプリでは、GLMatrix等の行列計算ライブラリを使用することを推奨
        
        // プレースホルダー - 実際には逆行列計算が必要
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
    }
    
    /**
     * ベクトルと行列の乗算
     */
    function multiplyVectorByMatrix(v, m) {
        const result = [0, 0, 0, 0];
        
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                result[i] += v[j] * m[i * 4 + j];
            }
        }
        
        return result;
    }
    
    /**
     * 点が設定された範囲内かをチェック
     */
    function isPointInRange(point, radius) {
        const distanceSquared = point.x * point.x + point.y * point.y + point.z * point.z;
        return distanceSquared <= radius * radius;
    }
    
    /**
     * スキャン進捗を更新
     */
    function updateScanProgress(elapsedTimeMs) {
        // モードに基づく予想完了時間の計算
        let estimatedTotalTime;
        
        if (scanOptions.mode === 'MAX_AREA') {
            estimatedTotalTime = 60000; // 1分想定
        } else {
            estimatedTotalTime = 180000; // 3分想定
        }
        
        // 進捗率の計算（単純な時間ベース）
        scanPercentComplete = Math.min(100, (elapsedTimeMs / estimatedTotalTime) * 100);
        
        // 残り時間の見積もり
        estimatedTimeRemaining = Math.max(0, estimatedTotalTime - elapsedTimeMs);
        
        // イベント発行
        EventBus.publish('lidarScanner.progressUpdated', {
            percentComplete: scanPercentComplete,
            estimatedTimeRemaining,
            pointsCollected,
            elapsedTime: elapsedTimeMs
        });
    }
    
    /**
     * スキャンエラーのハンドリング
     */
    function handleScanError(error) {
        errorState = {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message || 'Unknown scanning error occurred',
            timestamp: Date.now(),
            recoverable: isErrorRecoverable(error)
        };
        
        // イベント発行
        EventBus.publish('lidarScanner.error', errorState);
        
        // 回復可能なエラーは自動再接続を試みる
        if (errorState.recoverable && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            
            setTimeout(() => {
                EventBus.publish('lidarScanner.reconnecting', {
                    attempt: reconnectAttempts,
                    maxAttempts: MAX_RECONNECT_ATTEMPTS
                });
                
                // セッションの再接続を試みる
                if (session) {
                    session.requestAnimationFrame(processXRFrame);
                } else {
                    initARSession().catch(err => {
                        errorState.recoverable = false;
                        errorState.message = `Failed to reconnect: ${err.message}`;
                        EventBus.publish('lidarScanner.error', errorState);
                    });
                }
            }, 1000 * reconnectAttempts); // 指数バックオフ的なディレイ
        }
    }
    
    /**
     * エラーが回復可能かどうかを判断
     */
    function isErrorRecoverable(error) {
        // 回復可能なエラータイプ
        const recoverableErrors = [
            'TEMPORARILY_UNAVAILABLE',
            'FRAME_PROCESS_ERROR',
            'SENSOR_ERROR',
            'DEPTH_DATA_UNAVAILABLE'
        ];
        
        return recoverableErrors.includes(error.code) || 
               error.message.includes('temporarily') ||
               error.message.includes('timeout');
    }
    
    // 公開API
    const LidarScanner = {
        /**
         * スキャナーを初期化
         * @returns {Promise} 初期化プロセスのPromise
         */
        initialize: function() {
            return new Promise((resolve, reject) => {
                checkXRSupport()
                    .then(() => {
                        // イベントリスナーのセットアップ
                        EventBus.publish('lidarScanner.ready');
                        resolve();
                    })
                    .catch(err => {
                        errorState = {
                            code: 'INITIALIZATION_ERROR',
                            message: err.message,
                            timestamp: Date.now(),
                            recoverable: false
                        };
                        
                        EventBus.publish('lidarScanner.error', errorState);
                        reject(err);
                    });
            });
        },
        
        /**
         * ARセッションを開始
         * @returns {Promise} セッション開始プロセスのPromise
         */
        startSession: function() {
            return initARSession();
        },
        
        /**
         * スキャンを開始
         * @returns {boolean} 開始成功かどうか
         */
        startScan: function() {
            if (!session || scanning) {
                return false;
            }
            
            scanning = true;
            paused = false;
            scanStartTime = performance.now();
            lastFrameTime = scanStartTime;
            pointsCollected = 0;
            scanPercentComplete = 0;
            
            EventBus.publish('lidarScanner.scanStarted', {
                mode: scanOptions.mode,
                settings: SCAN_MODES[scanOptions.mode],
                timestamp: scanStartTime
            });
            
            return true;
        },
        
        /**
         * スキャンを停止
         * @returns {boolean} 停止成功かどうか
         */
        stopScan: function() {
            if (!scanning) {
                return false;
            }
            
            scanning = false;
            paused = false;
            
            const scanDuration = performance.now() - scanStartTime;
            
            EventBus.publish('lidarScanner.scanStopped', {
                duration: scanDuration,
                pointsCollected,
                timestamp: performance.now()
            });
            
            return true;
        },
        
        /**
         * スキャンを一時停止
         * @returns {boolean} 一時停止成功かどうか
         */
        pauseScan: function() {
            if (!scanning || paused) {
                return false;
            }
            
            paused = true;
            
            EventBus.publish('lidarScanner.scanPaused', {
                timestamp: performance.now(),
                pointsCollected,
                percentComplete: scanPercentComplete
            });
            
            return true;
        },
        
        /**
         * 一時停止したスキャンを再開
         * @returns {boolean} 再開成功かどうか
         */
        resumeScan: function() {
            if (!scanning || !paused) {
                return false;
            }
            
            paused = false;
            lastFrameTime = performance.now();
            
            EventBus.publish('lidarScanner.scanResumed', {
                timestamp: performance.now(),
                pointsCollected,
                percentComplete: scanPercentComplete
            });
            
            return true;
        },
        
        /**
         * セッションを終了
         */
        endSession: function() {
            if (session) {
                if (scanning) {
                    this.stopScan();
                }
                
                session.end().then(() => {
                    session = null;
                    xrRefSpace = null;
                    
                    EventBus.publish('lidarScanner.sessionEnded', {
                        timestamp: performance.now()
                    });
                });
            }
        },
        
        /**
         * スキャンモードを設定
         * @param {string} mode - スキャンモード ('MAX_AREA' または 'MAX_DETAIL')
         * @returns {boolean} 設定成功かどうか
         */
        setMode: function(mode) {
            if (mode !== 'MAX_AREA' && mode !== 'MAX_DETAIL') {
                return false;
            }
            
            scanOptions.mode = mode;
            
            EventBus.publish('lidarScanner.modeChanged', {
                mode,
                settings: SCAN_MODES[mode]
            });
            
            return true;
        },
        
        /**
         * 解像度を設定
         * @param {string} resolution - 解像度 ('low', 'medium', 'high')
         * @returns {boolean} 設定成功かどうか
         */
        setResolution: function(resolution) {
            if (!['low', 'medium', 'high'].includes(resolution)) {
                return false;
            }
            
            scanOptions.resolution = resolution;
            
            // 解像度に応じてポイント密度を調整
            const densityMultipliers = {
                'low': 0.5,
                'medium': 1.0,
                'high': 2.0
            };
            
            const multiplier = densityMultipliers[resolution];
            SCAN_MODES.MAX_AREA.pointDensity = 100 * multiplier;
            SCAN_MODES.MAX_DETAIL.pointDensity = 500 * multiplier;
            
            EventBus.publish('lidarScanner.resolutionChanged', {
                resolution,
                pointDensity: SCAN_MODES[scanOptions.mode].pointDensity
            });
            
            return true;
        },
        
        /**
         * フィルタリングを設定
         * @param {boolean} enable - フィルタリングを有効化するかどうか
         */
        setNoiseFiltering: function(enable) {
            scanOptions.filterNoise = !!enable;
            
            EventBus.publish('lidarScanner.filteringChanged', {
                filteringEnabled: scanOptions.filterNoise
            });
        },
        
        /**
         * 自動最適化を設定
         * @param {boolean} enable - 自動最適化を有効化するかどうか
         */
        setAutoOptimize: function(enable) {
            scanOptions.autoOptimize = !!enable;
            
            EventBus.publish('lidarScanner.optimizationChanged', {
                optimizationEnabled: scanOptions.autoOptimize
            });
        },
        
        /**
         * 現在のエラー状態を取得
         * @returns {Object|null} エラー状態またはnull
         */
        getErrorState: function() {
            return errorState;
        },
        
        /**
         * 現在のスキャン状態を取得
         * @returns {Object} スキャン状態オブジェクト
         */
        getStatus: function() {
            return {
                initialized: !!session,
                scanning,
                paused,
                pointsCollected,
                progress: scanPercentComplete,
                elapsedTime: scanning ? (performance.now() - scanStartTime) : 0,
                estimatedTimeRemaining,
                mode: scanOptions.mode,
                resolution: scanOptions.resolution,
                errorState
            };
        },
        
        /**
         * イベントコールバックを登録
         * @param {string} eventName - イベント名
         * @param {Function} callback - コールバック関数
         * @returns {string} サブスクリプションID
         */
        on: function(eventName, callback) {
            return EventBus.subscribe(`lidarScanner.${eventName}`, callback);
        },
        
        /**
         * イベントコールバックの登録を解除
         * @param {string} subscriptionId - サブスクリプションID
         */
        off: function(subscriptionId) {
            EventBus.unsubscribe(subscriptionId);
        }
    };
    
    // グローバル名前空間にエクスポート
    window.App = window.App || {};
    window.App.LidarScanner = LidarScanner;
})();