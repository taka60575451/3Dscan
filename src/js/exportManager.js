/**
 * exportManager.js
 * 点群データエクスポート管理モジュール
 */

const ExportManager = (function() {
    // 内部変数
    let activeExport = null;
    let exportWorker = null;
    let exportSettings = {
        format: 'ply', // デフォルトフォーマット
        quality: 'high',
        includeColor: true,
        includeNormals: true,
        compressed: true,
        metadata: {
            creator: 'LiDAR Web Scanner',
            creationDate: new Date().toISOString(),
            device: '',
            notes: ''
        }
    };
    let progressCallbacks = [];
    let errorCallbacks = [];
    let completionCallbacks = [];

    // Worker 初期化
    function initWorker() {
        if (exportWorker) {
            exportWorker.terminate();
        }
        
        exportWorker = new Worker('src/js/workers/exportWorker.js');
        
        exportWorker.onmessage = function(e) {
            const message = e.data;
            
            switch (message.type) {
                case 'progress':
                    notifyProgress(message.data);
                    break;
                case 'complete':
                    handleExportComplete(message.data);
                    break;
                case 'error':
                    handleExportError(message.error);
                    break;
            }
        };
        
        exportWorker.onerror = function(error) {
            handleExportError({
                message: 'Worker error: ' + error.message,
                code: 'WORKER_ERROR'
            });
        };
    }

    // 進捗通知
    function notifyProgress(progressData) {
        // イベントバスで進捗を通知
        EventBus.publish('export:progress', progressData);
        
        // 登録済みコールバックを実行
        progressCallbacks.forEach(callback => {
            try {
                callback(progressData);
            } catch (err) {
                console.error('Error in progress callback:', err);
            }
        });
    }

    // エクスポート完了ハンドラー
    function handleExportComplete(exportData) {
        // エクスポート完了イベント発行
        EventBus.publish('export:complete', exportData);
        
        // ダウンロードをトリガー
        if (exportData.blob) {
            triggerDownload(exportData.blob, exportData.filename);
        }
        
        // コールバック実行
        completionCallbacks.forEach(callback => {
            try {
                callback(exportData);
            } catch (err) {
                console.error('Error in completion callback:', err);
            }
        });
        
        // アクティブエクスポートをクリア
        activeExport = null;
    }

    // エラーハンドラー
    function handleExportError(error) {
        // エラーイベント発行
        EventBus.publish('export:error', error);
        
        // コールバック実行
        errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (err) {
                console.error('Error in error callback:', err);
            }
        });
        
        // アクティブエクスポートをクリア
        activeExport = null;
    }

    // ファイルダウンロードをトリガー
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // クリーンアップ
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // 現在の日時を含むファイル名を生成
    function generateFilename(format) {
        const now = new Date();
        const dateStr = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
        return `lidar-scan-${dateStr}.${format.toLowerCase()}`;
    }

    // メタデータを準備
    function prepareMetadata(customMetadata = {}) {
        const deviceInfo = window.navigator.userAgent;
        const timestamp = new Date().toISOString();
        
        // デバイス情報を更新
        exportSettings.metadata.device = deviceInfo;
        
        // カスタムメタデータをマージ
        Object.assign(exportSettings.metadata, customMetadata);
        exportSettings.metadata.creationDate = timestamp;
        
        return exportSettings.metadata;
    }

    // エクスポート開始
    function startExport(pointCloudData, customSettings = {}) {
        if (activeExport) {
            return { success: false, error: 'Export already in progress' };
        }
        
        try {
            // Workerが未初期化の場合は初期化
            if (!exportWorker) {
                initWorker();
            }
            
            // 設定をマージ
            const mergedSettings = Object.assign({}, exportSettings, customSettings);
            
            // メタデータを準備
            const metadata = prepareMetadata(customSettings.metadata);
            
            // ファイル名を生成
            const filename = customSettings.filename || 
                             generateFilename(mergedSettings.format);
            
            // エクスポート情報を作成
            activeExport = {
                id: Date.now(),
                format: mergedSettings.format,
                settings: mergedSettings,
                metadata: metadata,
                filename: filename,
                startTime: Date.now()
            };
            
            // Worker にエクスポート開始を指示
            exportWorker.postMessage({
                type: 'start',
                data: pointCloudData,
                settings: mergedSettings,
                metadata: metadata,
                filename: filename
            });
            
            // エクスポート開始イベント発行
            EventBus.publish('export:start', {
                id: activeExport.id,
                format: activeExport.format,
                filename: activeExport.filename
            });
            
            return { success: true, exportId: activeExport.id };
        } catch (error) {
            handleExportError({
                message: 'Failed to start export: ' + error.message,
                code: 'EXPORT_START_ERROR',
                originalError: error
            });
            
            return { success: false, error: error.message };
        }
    }

    // エクスポートキャンセル
    function cancelExport() {
        if (!activeExport) {
            return false;
        }
        
        try {
            exportWorker.postMessage({ type: 'cancel' });
            
            // キャンセルイベント発行
            EventBus.publish('export:canceled', {
                id: activeExport.id,
                format: activeExport.format
            });
            
            activeExport = null;
            return true;
        } catch (error) {
            console.error('Error canceling export:', error);
            return false;
        }
    }

    // 設定を更新
    function updateSettings(newSettings) {
        if (activeExport) {
            return false; // エクスポート中は設定変更不可
        }
        
        Object.assign(exportSettings, newSettings);
        
        // 設定変更イベント発行
        EventBus.publish('export:settings-updated', exportSettings);
        
        return true;
    }

    // ファイル形式を設定
    function setFormat(format) {
        if (!['ply', 'e57'].includes(format.toLowerCase())) {
            console.error('Unsupported format:', format);
            return false;
        }
        
        return updateSettings({ format: format.toLowerCase() });
    }

    // 品質設定
    function setQuality(quality) {
        if (!['low', 'medium', 'high'].includes(quality.toLowerCase())) {
            console.error('Invalid quality setting:', quality);
            return false;
        }
        
        return updateSettings({ quality: quality.toLowerCase() });
    }

    // 圧縮設定
    function setCompression(enableCompression) {
        return updateSettings({ compressed: !!enableCompression });
    }

    // 色情報含めるか設定
    function setIncludeColor(includeColor) {
        return updateSettings({ includeColor: !!includeColor });
    }

    // 法線情報含めるか設定
    function setIncludeNormals(includeNormals) {
        return updateSettings({ includeNormals: !!includeNormals });
    }

    // エクスポート設定UIの初期化
    function initExportUI(containerElement) {
        if (!containerElement) {
            console.error('Container element is required for UI initialization');
            return false;
        }
        
        // 現在の設定を反映したUIを構築
        containerElement.innerHTML = `
            <div class="export-settings">
                <h3>エクスポート設定</h3>
                
                <div class="setting-group">
                    <label for="export-format">ファイル形式:</label>
                    <select id="export-format">
                        <option value="ply" ${exportSettings.format === 'ply' ? 'selected' : ''}>PLY</option>
                        <option value="e57" ${exportSettings.format === 'e57' ? 'selected' : ''}>E57</option>
                    </select>
                </div>
                
                <div class="setting-group">
                    <label for="export-quality">品質:</label>
                    <select id="export-quality">
                        <option value="low" ${exportSettings.quality === 'low' ? 'selected' : ''}>低 (圧縮あり)</option>
                        <option value="medium" ${exportSettings.quality === 'medium' ? 'selected' : ''}>中</option>
                        <option value="high" ${exportSettings.quality === 'high' ? 'selected' : ''}>高 (最大品質)</option>
                    </select>
                </div>
                
                <div class="setting-group checkbox">
                    <input type="checkbox" id="include-color" ${exportSettings.includeColor ? 'checked' : ''}>
                    <label for="include-color">色情報を含める</label>
                </div>
                
                <div class="setting-group checkbox">
                    <input type="checkbox" id="include-normals" ${exportSettings.includeNormals ? 'checked' : ''}>
                    <label for="include-normals">法線情報を含める</label>
                </div>
                
                <div class="setting-group checkbox">
                    <input type="checkbox" id="use-compression" ${exportSettings.compressed ? 'checked' : ''}>
                    <label for="use-compression">圧縮を使用</label>
                </div>
                
                <div class="metadata-section">
                    <h4>メタデータ</h4>
                    <div class="setting-group">
                        <label for="metadata-notes">メモ:</label>
                        <textarea id="metadata-notes">${exportSettings.metadata.notes}</textarea>
                    </div>
                </div>
                
                <div class="export-controls">
                    <button id="start-export" class="primary-btn">エクスポート開始</button>
                    <button id="cancel-export" class="secondary-btn" disabled>キャンセル</button>
                </div>
                
                <div class="export-progress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="progress-text">0%</div>
                </div>
            </div>
        `;
        
        // イベントリスナーを設定
        const formatSelect = containerElement.querySelector('#export-format');
        formatSelect.addEventListener('change', () => {
            setFormat(formatSelect.value);
        });
        
        const qualitySelect = containerElement.querySelector('#export-quality');
        qualitySelect.addEventListener('change', () => {
            setQuality(qualitySelect.value);
        });
        
        const includeColorCheck = containerElement.querySelector('#include-color');
        includeColorCheck.addEventListener('change', () => {
            setIncludeColor(includeColorCheck.checked);
        });
        
        const includeNormalsCheck = containerElement.querySelector('#include-normals');
        includeNormalsCheck.addEventListener('change', () => {
            setIncludeNormals(includeNormalsCheck.checked);
        });
        
        const compressionCheck = containerElement.querySelector('#use-compression');
        compressionCheck.addEventListener('change', () => {
            setCompression(compressionCheck.checked);
        });
        
        const notesField = containerElement.querySelector('#metadata-notes');
        notesField.addEventListener('blur', () => {
            updateSettings({ metadata: { notes: notesField.value } });
        });
        
        // イベント購読
        EventBus.subscribe('export:progress', (progressData) => {
            updateProgressUI(containerElement, progressData);
        });
        
        EventBus.subscribe('export:start', () => {
            toggleExportUIState(containerElement, true);
        });
        
        EventBus.subscribe('export:complete', () => {
            toggleExportUIState(containerElement, false);
            showExportSuccess(containerElement);
        });
        
        EventBus.subscribe('export:error', (error) => {
            toggleExportUIState(containerElement, false);
            showExportError(containerElement, error);
        });
        
        // エクスポート開始ボタン
        const startBtn = containerElement.querySelector('#start-export');
        startBtn.addEventListener('click', () => {
            // 点群データを取得してエクスポート開始（この部分はアプリのデータフローに合わせて調整）
            EventBus.publish('request:point-cloud-data', (pointCloudData) => {
                if (pointCloudData) {
                    // メタデータを更新
                    const metadata = {
                        notes: notesField.value
                    };
                    
                    startExport(pointCloudData, { metadata });
                } else {
                    showExportError(containerElement, { message: 'No point cloud data available' });
                }
            });
        });
        
        // エクスポートキャンセルボタン
        const cancelBtn = containerElement.querySelector('#cancel-export');
        cancelBtn.addEventListener('click', () => {
            cancelExport();
        });
        
        return true;
    }

    // エクスポートUIの状態を切り替え
    function toggleExportUIState(container, isExporting) {
        const startBtn = container.querySelector('#start-export');
        const cancelBtn = container.querySelector('#cancel-export');
        const progressElem = container.querySelector('.export-progress');
        const settingsElements = container.querySelectorAll('select, input, textarea');
        
        if (isExporting) {
            startBtn.disabled = true;
            cancelBtn.disabled = false;
            progressElem.style.display = 'block';
            
            // 設定要素を無効化
            settingsElements.forEach(elem => {
                elem.disabled = true;
            });
        } else {
            startBtn.disabled = false;
            cancelBtn.disabled = true;
            progressElem.style.display = 'none';
            
            // 設定要素を有効化
            settingsElements.forEach(elem => {
                elem.disabled = false;
            });
        }
    }

    // プログレスUIを更新
    function updateProgressUI(container, progressData) {
        const progressFill = container.querySelector('.progress-fill');
        const progressText = container.querySelector('.progress-text');
        
        const percent = Math.round(progressData.percent);
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}% - ${progressData.message || '処理中...'}`;
    }

    // エクスポート成功メッセージを表示
    function showExportSuccess(container) {
        const progressText = container.querySelector('.progress-text');
        progressText.textContent = 'エクスポート完了 - ダウンロードを開始しました';
        progressText.classList.add('success');
        
        setTimeout(() => {
            progressText.classList.remove('success');
            container.querySelector('.export-progress').style.display = 'none';
        }, 3000);
    }

    // エクスポートエラーメッセージを表示
    function showExportError(container, error) {
        const progressElem = container.querySelector('.export-progress');
        const progressText = container.querySelector('.progress-text');
        
        progressElem.style.display = 'block';
        progressText.textContent = `エラー: ${error.message || '不明なエラー'}`;
        progressText.classList.add('error');
        
        setTimeout(() => {
            progressText.classList.remove('error');
        }, 5000);
    }

    // 進捗コールバック登録
    function onProgress(callback) {
        if (typeof callback === 'function') {
            progressCallbacks.push(callback);
        }
    }

    // エラーコールバック登録
    function onError(callback) {
        if (typeof callback === 'function') {
            errorCallbacks.push(callback);
        }
    }

    // 完了コールバック登録
    function onComplete(callback) {
        if (typeof callback === 'function') {
            completionCallbacks.push(callback);
        }
    }

    // コールバック削除
    function removeCallback(callback, callbackArray) {
        const index = callbackArray.indexOf(callback);
        if (index !== -1) {
            callbackArray.splice(index, 1);
            return true;
        }
        return false;
    }

    // 進捗コールバック削除
    function offProgress(callback) {
        return removeCallback(callback, progressCallbacks);
    }

    // エラーコールバック削除
    function offError(callback) {
        return removeCallback(callback, errorCallbacks);
    }

    // 完了コールバック削除
    function offComplete(callback) {
        return removeCallback(callback, completionCallbacks);
    }

    // 初期化
    function init() {
        // イベントバスからの通知を購読
        EventBus.subscribe('settings:updated', (newSettings) => {
            if (newSettings.export) {
                updateSettings(newSettings.export);
            }
        });
        
        return {
            startExport,
            cancelExport,
            updateSettings,
            setFormat,
            setQuality,
            setCompression,
            setIncludeColor,
            setIncludeNormals,
            initExportUI,
            onProgress,
            onError,
            onComplete,
            offProgress,
            offError,
            offComplete,
            getSettings: () => Object.assign({}, exportSettings)
        };
    }

    // モジュールを初期化して公開APIを返す
    return init();
})();

// グローバルにエクスポート
window.ExportManager = ExportManager;