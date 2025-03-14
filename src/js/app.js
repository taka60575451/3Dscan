/**
 * app.js - LiDAR 3Dスキャン点群データ取得Webアプリケーション
 * メインアプリケーションモジュール
 */

// グローバル名前空間
window.App = {};

// アプリケーションのメインモジュール
(function() {
    'use strict';
    
    // プライベート変数
    let isInitialized = false;
    let currentView = null;
    let appVersion = '1.0.0';
    let debugMode = false;
    
    // モジュール参照
    let deviceDetector = null;
    let viewManager = null;
    let eventBus = null;
    let settingsManager = null;
    
    /**
     * アプリケーション初期化
     */
    async function init() {
        if (isInitialized) return;
        
        try {
            // ローディング表示
            showLoadingOverlay();
            
            // モジュールの読み込み
            await loadModules();
            
            // デバイスとブラウザの互換性チェック
            const deviceCompatibility = deviceDetector.checkCompatibility();
            
            if (!deviceCompatibility.isCompatible) {
                handleIncompatibleDevice(deviceCompatibility.reasons);
                return;
            }
            
            // 設定の読み込み
            const settings = settingsManager.loadSettings();
            
            // テーマ設定の適用
            applyThemeSettings(settings.theme);
            
            // ビューマネージャーの初期化
            viewManager.init({
                defaultView: 'device-detection',
                containerSelector: '#main-container'
            });
            
            // グローバルイベントリスナーの設定
            setupGlobalEventListeners();
            
            // アプリ名前空間へのAPIのエクスポート
            exportPublicAPI();
            
            isInitialized = true;
            
            // 初期ビューを表示
            viewManager.switchView('device-detection');
            
            // アプリ初期化完了イベント発行
            eventBus.publish('app:initialized');
            
            // デバッグ情報
            if (debugMode) {
                console.info('App initialized with version:', appVersion);
                console.info('Device info:', deviceDetector.getDeviceInfo());
            }
        } catch (error) {
            handleInitError(error);
        } finally {
            // ローディング非表示
            hideLoadingOverlay();
        }
    }
    
    /**
     * モジュールの非同期読み込み
     */
    async function loadModules() {
        try {
            // 同期的に各モジュールを参照（すでにHTMLでロード済みと想定）
            deviceDetector = window.DeviceDetector;
            viewManager = window.ViewManager;
            eventBus = window.EventBus;
            settingsManager = window.SettingsManager;
            
            if (!deviceDetector || !viewManager || !eventBus || !settingsManager) {
                throw new Error('必須モジュールが見つかりません');
            }
            
            // 各モジュールの初期化（必要に応じて）
            eventBus.init();
            settingsManager.init();
            
            return true;
        } catch (error) {
            console.error('モジュール読み込みエラー:', error);
            throw error;
        }
    }
    
    /**
     * グローバルイベントリスナーの設定
     */
    function setupGlobalEventListeners() {
        // イベント委任によるグローバルクリックハンドラー
        document.addEventListener('click', handleGlobalClick);
        
        // リサイズイベント（スロットリング付き）
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                eventBus.publish('window:resized', {
                    width: window.innerWidth,
                    height: window.innerHeight
                });
            }, 250);
        });
        
        // オンライン/オフラインステータス変更
        window.addEventListener('online', function() {
            eventBus.publish('network:online');
        });
        
        window.addEventListener('offline', function() {
            eventBus.publish('network:offline');
        });
        
        // ビジビリティ変更（タブ切替など）
        document.addEventListener('visibilitychange', function() {
            eventBus.publish('visibility:changed', {
                isVisible: document.visibilityState === 'visible'
            });
        });
        
        // オリエンテーション変更
        window.addEventListener('orientationchange', function() {
            eventBus.publish('orientation:changed');
        });
        
        // テーマ変更検出（メディアクエリ）
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeMediaQuery.addEventListener('change', function(e) {
            const theme = e.matches ? 'dark' : 'light';
            eventBus.publish('system:theme-changed', { theme });
            
            // 設定が「システム設定に従う」の場合のみ変更を適用
            const currentSettings = settingsManager.loadSettings();
            if (currentSettings.theme === 'system') {
                applyThemeSettings('system');
            }
        });
        
        // アプリケーション終了時の処理
        window.addEventListener('beforeunload', function() {
            eventBus.publish('app:before-unload');
        });
        
        // エラーハンドリング
        window.addEventListener('error', function(event) {
            handleGlobalError(event.error);
        });
        
        window.addEventListener('unhandledrejection', function(event) {
            handleGlobalError(event.reason);
        });
        
        // カスタムアプリイベントの購読
        eventBus.subscribe('settings:changed', function(data) {
            if (data.theme) {
                applyThemeSettings(data.theme);
            }
        });
    }
    
    /**
     * グローバルクリックイベントのハンドラー（イベント委任パターン）
     */
    function handleGlobalClick(event) {
        // データ属性によるアクション処理
        const actionElement = findClosestActionElement(event.target);
        
        if (actionElement) {
            const actionType = actionElement.dataset.action;
            const actionParams = JSON.parse(actionElement.dataset.actionParams || '{}');
            
            // イベント伝播を止める（必要な場合）
            if (actionElement.dataset.stopPropagation === 'true') {
                event.stopPropagation();
            }
            
            // アクションタイプに応じた処理
            switch (actionType) {
                case 'view-switch':
                    if (actionParams.view) {
                        viewManager.switchView(actionParams.view);
                    }
                    break;
                    
                case 'modal-open':
                    if (actionParams.modalId) {
                        openModal(actionParams.modalId);
                    }
                    break;
                    
                case 'modal-close':
                    closeModal();
                    break;
                    
                case 'start-scan':
                    eventBus.publish('scan:start-requested', actionParams);
                    break;
                    
                case 'stop-scan':
                    eventBus.publish('scan:stop-requested');
                    break;
                    
                case 'export-data':
                    eventBus.publish('data:export-requested', actionParams);
                    break;
                    
                default:
                    // カスタムアクションの場合はイベントを発行
                    if (actionType) {
                        eventBus.publish(`action:${actionType}`, actionParams);
                    }
                    break;
            }
        }
    }
    
    /**
     * 最も近いアクション要素を見つける
     */
    function findClosestActionElement(target) {
        let currentElement = target;
        
        while (currentElement && currentElement !== document.body) {
            if (currentElement.dataset && currentElement.dataset.action) {
                return currentElement;
            }
            currentElement = currentElement.parentElement;
        }
        
        return null;
    }
    
    /**
     * テーマ設定の適用
     */
    function applyThemeSettings(theme) {
        const htmlElement = document.documentElement;
        
        if (theme === 'system') {
            // システム設定に従う
            const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            htmlElement.dataset.theme = prefersDarkMode ? 'dark' : 'light';
        } else {
            // 明示的な設定
            htmlElement.dataset.theme = theme;
        }
        
        // メタテーマカラーの更新
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const themeColors = {
                light: '#ffffff',
                dark: '#121212'
            };
            metaThemeColor.content = themeColors[htmlElement.dataset.theme];
        }
    }
    
    /**
     * 互換性のないデバイスの処理
     */
    function handleIncompatibleDevice(reasons) {
        // 互換性エラービューの表示
        viewManager.switchView('compatibility-error');
        
        // エラー理由の表示
        const errorReasonContainer = document.getElementById('compatibility-error-reasons');
        if (errorReasonContainer) {
            errorReasonContainer.innerHTML = '';
            
            reasons.forEach(reason => {
                const reasonElement = document.createElement('li');
                reasonElement.textContent = reason;
                errorReasonContainer.appendChild(reasonElement);
            });
        }
        
        // 互換性エラーイベント発行
        eventBus.publish('device:incompatible', { reasons });
    }
    
    /**
     * 初期化エラーの処理
     */
    function handleInitError(error) {
        console.error('アプリケーション初期化エラー:', error);
        
        // エラービューの表示
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.style.display = 'block';
            
            const errorMessage = document.getElementById('error-message');
            if (errorMessage) {
                errorMessage.textContent = `初期化エラー: ${error.message || '不明なエラー'}`;
            }
        }
        
        // 初期化エラーイベント発行
        eventBus.publish('app:init-error', { error });
    }
    
    /**
     * グローバルエラーの処理
     */
    function handleGlobalError(error) {
        console.error('グローバルエラー:', error);
        
        // 重大なエラーの場合のみユーザーに通知
        if (error && error.isCritical) {
            showErrorMessage(`エラーが発生しました: ${error.message || '不明なエラー'}`);
        }
        
        // エラーイベント発行
        eventBus.publish('app:error', { error });
    }
    
    /**
     * エラーメッセージの表示
     */
    function showErrorMessage(message) {
        const errorToast = document.getElementById('error-toast');
        const errorToastMessage = document.getElementById('error-toast-message');
        
        if (errorToast && errorToastMessage) {
            errorToastMessage.textContent = message;
            errorToast.classList.add('visible');
            
            // 5秒後に消える
            setTimeout(() => {
                errorToast.classList.remove('visible');
            }, 5000);
        }
    }
    
    /**
     * ローディングオーバーレイの表示
     */
    function showLoadingOverlay() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
    }
    
    /**
     * ローディングオーバーレイの非表示
     */
    function hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
    
    /**
     * モーダルを開く
     */
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('modal-active');
            document.body.classList.add('modal-open');
            
            // モーダルオープンイベント発行
            eventBus.publish('modal:opened', { modalId });
        }
    }
    
    /**
     * モーダルを閉じる
     */
    function closeModal() {
        const activeModal = document.querySelector('.modal-active');
        if (activeModal) {
            const modalId = activeModal.id;
            activeModal.classList.remove('modal-active');
            document.body.classList.remove('modal-open');
            
            // モーダルクローズイベント発行
            eventBus.publish('modal:closed', { modalId });
        }
    }
    
    /**
     * デバッグモードの設定
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
        
        if (debugMode) {
            console.info('デバッグモード有効化');
            document.documentElement.dataset.debug = 'true';
        } else {
            console.info('デバッグモード無効化');
            delete document.documentElement.dataset.debug;
        }
        
        // 設定に保存
        const currentSettings = settingsManager.loadSettings();
        currentSettings.debug = debugMode;
        settingsManager.saveSettings(currentSettings);
        
        return debugMode;
    }
    
    /**
     * バージョン情報の取得
     */
    function getVersion() {
        return appVersion;
    }
    
    /**
     * 公開API関数のエクスポート
     */
    function exportPublicAPI() {
        // グローバルApp名前空間へAPIをエクスポート
        window.App = {
            // 初期化と設定
            init: init,
            setDebugMode: setDebugMode,
            getVersion: getVersion,
            
            // イベント関連
            on: eventBus.subscribe,
            off: eventBus.unsubscribe,
            trigger: eventBus.publish,
            
            // ビュー操作
            showView: viewManager.switchView,
            getCurrentView: viewManager.getCurrentView,
            
            // モーダル操作
            showModal: openModal,
            closeModal: closeModal,
            
            // エラー表示
            showError: showErrorMessage,
            
            // ユーティリティ
            isCompatibleDevice: () => deviceDetector.checkCompatibility().isCompatible,
            getDeviceInfo: deviceDetector.getDeviceInfo,
            
            // ローディング表示
            showLoading: showLoadingOverlay,
            hideLoading: hideLoadingOverlay
        };
    }
})();

// DOMContentLoadedイベントでアプリを初期化
document.addEventListener('DOMContentLoaded', function() {
    // アプリが存在すれば初期化
    if (window.App && typeof window.App.init === 'function') {
        window.App.init().catch(error => {
            console.error('アプリケーション初期化に失敗しました:', error);
        });
    } else {
        console.error('アプリケーションモジュールが見つかりません');
    }
});