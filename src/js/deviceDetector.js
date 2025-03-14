/**
 * deviceDetector.js
 * LiDARセンサー対応デバイスの検出とブラウザ互換性チェックを行う
 */

(function() {
    'use strict';
    
    // 依存モジュール
    const eventBus = window.App ? window.App.eventBus : { publish: () => {}, subscribe: () => {} };
    
    // 互換性のあるデバイスとブラウザの設定
    const compatibilityTable = {
        devices: {
            iPhones: ['iPhone 12 Pro', 'iPhone 12 Pro Max', 'iPhone 13 Pro', 'iPhone 13 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Pro Max'],
            iPads: ['iPad Pro (11-inch, 2020)', 'iPad Pro (12.9-inch, 2020)', 'iPad Pro (11-inch, 2021)', 'iPad Pro (12.9-inch, 2021)', 'iPad Pro (11-inch, 2022)', 'iPad Pro (12.9-inch, 2022)', 'iPad Pro (11-inch, 2024)', 'iPad Pro (13-inch, 2024)']
        },
        browsers: ['Safari']
    };
    
    // デバイス性能のベンチマーク基準値
    const performanceBenchmarks = {
        memory: 2000, // MB
        processingPower: 80, // 相対値
        gpuPower: 70 // 相対値
    };
    
    // デバイス検出モジュール
    const deviceDetector = {
        // 検出結果を格納
        result: {
            isCompatible: false,
            hasLiDAR: false,
            hasWebXR: false,
            browserSupported: false,
            deviceSupported: false,
            performanceLevel: 'unknown', // 'low', 'medium', 'high'
            deviceInfo: {},
            errors: []
        },
        
        /**
         * 互換性チェックを実行
         * @param {Object} options - 設定オプション
         * @return {Promise<Object>} 検出結果を返す
         */
        checkCompatibility: async function(options = {}) {
            this.result.errors = [];
            
            try {
                // デバイス情報の取得
                this._detectDeviceInfo();
                
                // ブラウザの互換性チェック
                this._checkBrowserCompatibility();
                
                // WebXR対応チェック
                await this._checkWebXRSupport();
                
                // LiDARセンサーのチェック
                this._checkLiDARSupport();
                
                // パフォーマンス評価
                this._evaluatePerformance();
                
                // 総合的な互換性判定
                this._determineOverallCompatibility();
                
                // イベント発行
                eventBus.publish('deviceDetection:complete', this.result);
                
                if (!this.result.isCompatible) {
                    eventBus.publish('deviceDetection:incompatible', {
                        reasons: this.result.errors,
                        deviceInfo: this.result.deviceInfo
                    });
                }
            } catch (error) {
                this.result.errors.push(this.generateErrorMessage('detection_failed', error.message));
                eventBus.publish('deviceDetection:error', {
                    error: error,
                    deviceInfo: this.result.deviceInfo
                });
            }
            
            return this.result;
        },
        
        /**
         * デバイス情報を取得
         * @private
         */
        _detectDeviceInfo: function() {
            const ua = navigator.userAgent;
            const platform = navigator.platform || '';
            const deviceInfo = {
                userAgent: ua,
                platform: platform,
                isIOS: /iPad|iPhone|iPod/.test(ua) && !window.MSStream,
                isIPadOS: /Mac/.test(platform) && navigator.maxTouchPoints > 1,
                isMobile: /Mobi|Android/i.test(ua),
                browserName: this._detectBrowserName(ua),
                osVersion: this._detectOSVersion(ua),
                deviceModel: this._detectDeviceModel(ua)
            };
            
            this.result.deviceInfo = deviceInfo;
        },
        
        /**
         * ブラウザ名を検出
         * @param {string} ua - ユーザーエージェント文字列
         * @return {string} ブラウザ名
         * @private
         */
        _detectBrowserName: function(ua) {
            if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
            if (/Chrome/.test(ua)) return 'Chrome';
            if (/Firefox/.test(ua)) return 'Firefox';
            if (/Edge/.test(ua)) return 'Edge';
            if (/MSIE|Trident/.test(ua)) return 'Internet Explorer';
            return 'Unknown';
        },
        
        /**
         * OS バージョンを検出
         * @param {string} ua - ユーザーエージェント文字列
         * @return {string} OSバージョン
         * @private
         */
        _detectOSVersion: function(ua) {
            let match;
            
            // iOS バージョン検出
            if ((match = ua.match(/OS (\d+)_(\d+)_?(\d+)?/)) !== null) {
                return match[1] + '.' + match[2] + (match[3] ? '.' + match[3] : '');
            }
            
            // Android バージョン検出
            if ((match = ua.match(/Android (\d+)\.(\d+)\.?(\d+)?/)) !== null) {
                return match[1] + '.' + match[2] + (match[3] ? '.' + match[3] : '');
            }
            
            return 'Unknown';
        },
        
        /**
         * デバイスモデルを検出
         * @param {string} ua - ユーザーエージェント文字列
         * @return {string} デバイスモデル
         * @private
         */
        _detectDeviceModel: function(ua) {
            // iOSデバイスの場合は特定が難しいため、一般的な種類を返す
            if (this.result.deviceInfo && this.result.deviceInfo.isIOS) {
                if (ua.includes('iPad')) return 'iPad';
                if (ua.includes('iPhone')) return 'iPhone';
                if (this.result.deviceInfo.isIPadOS) return 'iPad';
            }
            
            return 'Unknown';
        },
        
        /**
         * ブラウザ互換性のチェック
         * @private
         */
        _checkBrowserCompatibility: function() {
            const browserName = this.result.deviceInfo.browserName;
            this.result.browserSupported = compatibilityTable.browsers.includes(browserName);
            
            if (!this.result.browserSupported) {
                this.result.errors.push(
                    this.generateErrorMessage('browser_incompatible', 
                    `このアプリケーションは${compatibilityTable.browsers.join('または')}で動作します。現在のブラウザ: ${browserName}`)
                );
            }
        },
        
        /**
         * WebXR APIのサポートをチェック
         * @return {Promise<void>}
         * @private
         */
        _checkWebXRSupport: async function() {
            // navigator.xr の存在をチェック
            if ('xr' in navigator) {
                try {
                    // 'immersive-ar' セッションがサポートされているかチェック
                    this.result.hasWebXR = await navigator.xr.isSessionSupported('immersive-ar');
                } catch (error) {
                    this.result.hasWebXR = false;
                    this.result.errors.push(
                        this.generateErrorMessage('webxr_check_error', 'WebXR機能の確認中にエラーが発生しました: ' + error.message)
                    );
                }
            } else {
                this.result.hasWebXR = false;
                this.result.errors.push(
                    this.generateErrorMessage('webxr_not_supported', 'このブラウザはWebXR APIをサポートしていません')
                );
            }
        },
        
        /**
         * LiDARセンサーサポートをチェック
         * @private
         */
        _checkLiDARSupport: function() {
            const deviceInfo = this.result.deviceInfo;
            
            // iOS/iPadOSかつWebXR対応の場合に限定的なチェックを行う
            if ((deviceInfo.isIOS || deviceInfo.isIPadOS) && this.result.hasWebXR) {
                // iOSバージョンが14以上かチェック
                const majorVersion = parseInt(deviceInfo.osVersion, 10) || 0;
                
                if (majorVersion >= 14) {
                    // デバイスモデルによるLiDAR搭載チェック
                    if (deviceInfo.deviceModel === 'iPad') {
                        // iPad Proの最新モデルに限定的に対応と想定
                        this.result.hasLiDAR = true;
                        this.result.deviceSupported = true;
                    } else if (deviceInfo.deviceModel === 'iPhone') {
                        // iPhone 12 Pro以降のProモデルに限定的に対応と想定
                        this.result.hasLiDAR = true;
                        this.result.deviceSupported = true;
                    } else {
                        this.result.hasLiDAR = false;
                        this.result.deviceSupported = false;
                    }
                } else {
                    this.result.hasLiDAR = false;
                    this.result.errors.push(
                        this.generateErrorMessage('ios_version_incompatible', 'LiDARスキャンにはiOS/iPadOS 14以上が必要です')
                    );
                }
            } else {
                this.result.hasLiDAR = false;
                this.result.deviceSupported = false;
                this.result.errors.push(
                    this.generateErrorMessage('lidar_not_supported', 'お使いのデバイスにはLiDARセンサーが搭載されていないか、アクセスできません')
                );
            }
        },
        
        /**
         * デバイス性能を評価
         * @private
         */
        _evaluatePerformance: function() {
            // 実際のデバイス性能測定は複雑なため、
            // ここではOSとデバイスモデルからの推測で簡易的に判定
            let performanceScore = 0;
            const deviceInfo = this.result.deviceInfo;
            
            // WebXRがサポートされていれば基本スコア
            if (this.result.hasWebXR) {
                performanceScore += 40;
            }
            
            // OSバージョンに基づくスコア
            const osVersionNum = parseFloat(deviceInfo.osVersion) || 0;
            if (osVersionNum >= 16) {
                performanceScore += 30;
            } else if (osVersionNum >= 15) {
                performanceScore += 20;
            } else if (osVersionNum >= 14) {
                performanceScore += 10;
            }
            
            // デバイスモデルに基づくスコア
            if (deviceInfo.deviceModel === 'iPad') {
                performanceScore += 30; // iPadはより高性能が期待できる
            } else {
                performanceScore += 20;
            }
            
            // パフォーマンスレベルの設定
            if (performanceScore >= 80) {
                this.result.performanceLevel = 'high';
            } else if (performanceScore >= 60) {
                this.result.performanceLevel = 'medium';
            } else {
                this.result.performanceLevel = 'low';
            }
        },
        
        /**
         * 総合的な互換性を判定
         * @private
         */
        _determineOverallCompatibility: function() {
            this.result.isCompatible = 
                this.result.hasWebXR && 
                this.result.hasLiDAR && 
                this.result.browserSupported && 
                this.result.deviceSupported &&
                this.result.performanceLevel !== 'low';
                
            if (!this.result.isCompatible && this.result.errors.length === 0) {
                this.result.errors.push(
                    this.generateErrorMessage('general_incompatible', 'お使いのデバイスはLiDARスキャンに対応していません')
                );
            }
        },
        
        /**
         * ARセッション権限をリクエスト
         * @return {Promise<boolean>} 権限取得成功の場合true
         */
        requestARPermission: async function() {
            if (!('xr' in navigator)) {
                this.result.errors.push(
                    this.generateErrorMessage('ar_not_supported', 'このブラウザはAR機能をサポートしていません')
                );
                return false;
            }
            
            try {
                // 一時的なARセッション作成を試みることで権限を要求
                const session = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test', 'depth-sensing']
                });
                
                // セッションが作成できたら終了
                await session.end();
                eventBus.publish('deviceDetection:permissionGranted');
                return true;
            } catch (error) {
                let errorMessage = '不明なエラー';
                
                if (error.name === 'NotAllowedError') {
                    errorMessage = 'カメラへのアクセス権限が拒否されました';
                } else if (error.name === 'NotSupportedError') {
                    errorMessage = 'お使いのデバイスはAR機能をサポートしていません';
                } else {
                    errorMessage = error.message;
                }
                
                this.result.errors.push(
                    this.generateErrorMessage('ar_permission_denied', errorMessage)
                );
                
                eventBus.publish('deviceDetection:permissionDenied', {
                    error: error,
                    message: errorMessage
                });
                
                return false;
            }
        },
        
        /**
         * 詳細なデバイス情報を取得
         * @return {Object} デバイス情報
         */
        getDeviceInfo: function() {
            return {
                ...this.result.deviceInfo,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                pixelRatio: window.devicePixelRatio || 1,
                performanceLevel: this.result.performanceLevel,
                hasLiDAR: this.result.hasLiDAR,
                hasWebXR: this.result.hasWebXR,
                isCompatible: this.result.isCompatible
            };
        },
        
        /**
         * エラーメッセージを生成
         * @param {string} code - エラーコード
         * @param {string} message - エラーメッセージ
         * @return {Object} エラーオブジェクト
         */
        generateErrorMessage: function(code, message) {
            return {
                code: code,
                message: message,
                timestamp: new Date().toISOString()
            };
        },
        
        /**
         * ユーザーフレンドリーなエラーメッセージを取得
         * @return {Array<string>} ユーザー向けエラーメッセージ
         */
        getUserFriendlyErrors: function() {
            return this.result.errors.map(error => {
                switch (error.code) {
                    case 'browser_incompatible':
                        return 'このブラウザは対応していません。SafariブラウザでiOS/iPadOS 14以上で開いてください。';
                    case 'webxr_not_supported':
                    case 'webxr_check_error':
                        return 'お使いのブラウザはAR機能に対応していません。Safariの最新版をお使いください。';
                    case 'lidar_not_supported':
                        return 'このアプリはLiDARセンサーを搭載したiPhone/iPadが必要です（iPhone 12 Pro以降またはiPad Pro 2020以降）。';
                    case 'ios_version_incompatible':
                        return 'iOS/iPadOSを14以上にアップデートしてください。';
                    case 'ar_permission_denied':
                        return 'カメラへのアクセス権限が必要です。設定からカメラへのアクセスを許可してください。';
                    case 'ar_not_supported':
                        return 'お使いのデバイスはAR機能に対応していません。';
                    case 'general_incompatible':
                    case 'detection_failed':
                    default:
                        return 'お使いのデバイスはLiDARスキャンに対応していません。iPhone 12 Pro以降またはiPad Pro 2020以降のSafariブラウザでお試しください。';
                }
            });
        }
    };
    
    // グローバル名前空間に登録
    window.App = window.App || {};
    window.App.deviceDetector = deviceDetector;

})();