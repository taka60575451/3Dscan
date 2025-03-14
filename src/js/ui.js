/**
 * UI.js - UIコンポーネント管理モジュール
 * LiDAR 3Dスキャンアプリケーション用UI要素の生成と制御
 */

(function() {
    'use strict';

    // EventBusモジュールの参照を取得
    const EventBus = window.App && window.App.EventBus;
    if (!EventBus) {
        console.error('UI: EventBus module is required but not available');
        return;
    }

    // UIコンポーネントの名前空間
    const UI = {};
    
    // プライベート変数
    let initialized = false;
    let activeModals = [];
    let activeForms = {};
    
    // DOM要素のキャッシュ
    const elements = {
        scanControls: null,
        resultControls: null,
        progressIndicators: {},
        modals: {},
        forms: {}
    };
    
    // アニメーションID参照
    const animations = {};

    /**
     * UIコンポーネントの初期化
     */
    UI.initialize = function() {
        if (initialized) {
            return;
        }
        
        // DOM要素のキャッシュ
        cacheElements();
        
        // イベントリスナーの設定
        setupEventListeners();
        
        // アクセシビリティの設定
        setupAccessibility();
        
        // イベントサブスクリプション
        subscribeToEvents();
        
        initialized = true;
        EventBus.publish('ui:initialized');
        
        return UI;
    };
    
    /**
     * DOM要素をキャッシュする
     */
    function cacheElements() {
        // スキャンコントロール
        elements.scanControls = {
            container: document.getElementById('scan-controls'),
            startBtn: document.getElementById('start-scan'),
            stopBtn: document.getElementById('stop-scan'),
            pauseBtn: document.getElementById('pause-scan'),
            modeToggle: document.getElementById('scan-mode-toggle')
        };
        
        // 結果表示コントロール
        elements.resultControls = {
            container: document.getElementById('result-controls'),
            exportBtn: document.getElementById('export-result'),
            resetBtn: document.getElementById('reset-view'),
            zoomControls: document.getElementById('zoom-controls'),
            rotateControls: document.getElementById('rotate-controls')
        };
        
        // プログレスインジケーター
        elements.progressIndicators = {
            scan: document.getElementById('scan-progress'),
            export: document.getElementById('export-progress'),
            loading: document.getElementById('loading-overlay')
        };
        
        // モーダル
        elements.modals = {
            settings: document.getElementById('settings-modal'),
            export: document.getElementById('export-modal'),
            help: document.getElementById('help-modal'),
            alert: document.getElementById('alert-modal')
        };
        
        // フォーム
        elements.forms = {
            settings: document.getElementById('settings-form'),
            export: document.getElementById('export-form')
        };
    }
    
    /**
     * イベントリスナーの設定
     */
    function setupEventListeners() {
        // 共通のモーダルクローズボタン
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', function() {
                const modalId = this.closest('.modal').id;
                UI.hideModal(modalId);
            });
        });
        
        // モーダル背景クリックでも閉じる
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) {
                    const modalId = this.querySelector('.modal').id;
                    UI.hideModal(modalId);
                }
            });
        });
        
        // スキャンコントロール
        if (elements.scanControls.startBtn) {
            elements.scanControls.startBtn.addEventListener('click', function() {
                EventBus.publish('scan:start');
            });
        }
        
        if (elements.scanControls.stopBtn) {
            elements.scanControls.stopBtn.addEventListener('click', function() {
                EventBus.publish('scan:stop');
            });
        }
        
        if (elements.scanControls.pauseBtn) {
            elements.scanControls.pauseBtn.addEventListener('click', function() {
                const isPaused = this.classList.contains('paused');
                this.classList.toggle('paused');
                EventBus.publish(isPaused ? 'scan:resume' : 'scan:pause');
            });
        }
        
        if (elements.scanControls.modeToggle) {
            elements.scanControls.modeToggle.addEventListener('change', function() {
                const mode = this.checked ? 'detail' : 'area';
                EventBus.publish('scan:mode-change', { mode });
            });
        }
        
        // 結果表示コントロール
        if (elements.resultControls.exportBtn) {
            elements.resultControls.exportBtn.addEventListener('click', function() {
                UI.showModal('export-modal');
            });
        }
        
        if (elements.resultControls.resetBtn) {
            elements.resultControls.resetBtn.addEventListener('click', function() {
                EventBus.publish('view:reset');
            });
        }
        
        // フォーム送信ハンドリング
        if (elements.forms.settings) {
            elements.forms.settings.addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const settings = {};
                
                for (const [key, value] of formData.entries()) {
                    settings[key] = value;
                }
                
                EventBus.publish('settings:save', settings);
                UI.hideModal('settings-modal');
            });
        }
        
        if (elements.forms.export) {
            elements.forms.export.addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = new FormData(this);
                const options = {};
                
                for (const [key, value] of formData.entries()) {
                    options[key] = value;
                }
                
                EventBus.publish('data:export', options);
                UI.hideModal('export-modal');
                UI.showProgress('export');
            });
        }
        
        // タッチイベント
        setupTouchControls();
    }
    
    /**
     * タッチ入力処理の設定
     */
    function setupTouchControls() {
        const resultView = document.getElementById('result-view');
        if (!resultView) return;
        
        let touchStartX, touchStartY;
        let isPinching = false;
        let startDistance = 0;
        
        resultView.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                isPinching = true;
                startDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        });
        
        resultView.addEventListener('touchmove', function(e) {
            if (isPinching && e.touches.length === 2) {
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                const scale = currentDistance / startDistance;
                EventBus.publish('view:zoom', { scale });
                
                startDistance = currentDistance;
                e.preventDefault();
            } else if (e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - touchStartX;
                const deltaY = e.touches[0].clientY - touchStartY;
                
                EventBus.publish('view:rotate', { deltaX, deltaY });
                
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                e.preventDefault();
            }
        });
        
        resultView.addEventListener('touchend', function() {
            isPinching = false;
        });
    }
    
    /**
     * アクセシビリティ設定
     */
    function setupAccessibility() {
        // フォーム要素にラベルがあることを確認
        document.querySelectorAll('input, select, textarea').forEach(element => {
            if (!element.id) return;
            
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (!label) {
                console.warn(`Accessibility: No label found for form element with id "${element.id}"`);
            }
        });
        
        // キーボードナビゲーション
        document.querySelectorAll('.modal').forEach(modal => {
            const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            
            if (focusableElements.length === 0) return;
            
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            
            modal.addEventListener('keydown', function(e) {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
                
                if (e.key === 'Escape') {
                    const modalId = modal.id;
                    UI.hideModal(modalId);
                }
            });
        });
    }
    
    /**
     * イベントバスへのサブスクリプション
     */
    function subscribeToEvents() {
        // スキャン進捗のサブスクライブ
        EventBus.subscribe('scan:progress', data => {
            UI.updateProgress('scan', data.progress);
        });
        
        // エクスポート進捗のサブスクライブ
        EventBus.subscribe('export:progress', data => {
            UI.updateProgress('export', data.progress);
        });
        
        // エクスポート完了
        EventBus.subscribe('export:complete', () => {
            UI.hideProgress('export');
        });
        
        // スキャン完了
        EventBus.subscribe('scan:complete', () => {
            UI.hideProgress('scan');
            UI.toggleView('result-view', true);
            UI.toggleView('scan-view', false);
        });
        
        // エラー表示
        EventBus.subscribe('app:error', data => {
            UI.showAlert(data.message, data.type || 'error');
        });
    }
    
    /**
     * モーダルを表示する
     * @param {string} modalId - 表示するモーダルのID
     */
    UI.showModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        const overlay = modal.closest('.modal-overlay');
        if (overlay) {
            overlay.classList.add('active');
        }
        
        modal.classList.add('active');
        activeModals.push(modalId);
        
        // フォーカスをモーダル内の最初の要素に設定
        const focusableElement = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElement) {
            setTimeout(() => focusableElement.focus(), 100);
        }
        
        EventBus.publish('ui:modal-shown', { modalId });
    };
    
    /**
     * モーダルを非表示にする
     * @param {string} modalId - 非表示にするモーダルのID
     */
    UI.hideModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        const overlay = modal.closest('.modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
        
        modal.classList.remove('active');
        activeModals = activeModals.filter(id => id !== modalId);
        
        EventBus.publish('ui:modal-hidden', { modalId });
    };
    
    /**
     * アラートモーダルを表示する
     * @param {string} message - 表示するメッセージ
     * @param {string} type - アラートタイプ（'info', 'warning', 'error'）
     */
    UI.showAlert = function(message, type = 'info') {
        const alertModal = elements.modals.alert;
        if (!alertModal) return;
        
        const messageEl = alertModal.querySelector('.alert-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
        
        // 前回のタイプクラスをクリア
        alertModal.classList.remove('info', 'warning', 'error');
        alertModal.classList.add(type);
        
        UI.showModal('alert-modal');
        
        // 自動的に閉じる（エラーの場合は閉じない）
        if (type !== 'error') {
            setTimeout(() => {
                UI.hideModal('alert-modal');
            }, 3000);
        }
    };
    
    /**
     * プログレスインジケーターを表示して更新する
     * @param {string} type - プログレスタイプ（'scan', 'export', 'loading'）
     * @param {number} value - 進捗値（0〜100）
     */
    UI.showProgress = function(type) {
        const progress = elements.progressIndicators[type];
        if (!progress) return;
        
        progress.classList.add('active');
        
        // 初期値に設定
        UI.updateProgress(type, 0);
        
        EventBus.publish('ui:progress-shown', { type });
    };
    
    /**
     * プログレスインジケーターを非表示にする
     * @param {string} type - プログレスタイプ（'scan', 'export', 'loading'）
     */
    UI.hideProgress = function(type) {
        const progress = elements.progressIndicators[type];
        if (!progress) return;
        
        progress.classList.remove('active');
        
        EventBus.publish('ui:progress-hidden', { type });
    };
    
    /**
     * プログレスインジケーターを更新する
     * @param {string} type - プログレスタイプ（'scan', 'export', 'loading'）
     * @param {number} value - 進捗値（0〜100）
     */
    UI.updateProgress = function(type, value) {
        const progress = elements.progressIndicators[type];
        if (!progress) return;
        
        const progressBar = progress.querySelector('.progress-bar');
        const progressText = progress.querySelector('.progress-text');
        
        if (progressBar) {
            const clampedValue = Math.max(0, Math.min(100, value));
            progressBar.style.width = `${clampedValue}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(value)}%`;
        }
    };
    
    /**
     * ビューの表示/非表示を切り替える
     * @param {string} viewId - ビューのID
     * @param {boolean} show - trueで表示、falseで非表示
     */
    UI.toggleView = function(viewId, show) {
        const view = document.getElementById(viewId);
        if (!view) return;
        
        if (show) {
            view.classList.add('active');
            EventBus.publish('ui:view-shown', { viewId });
        } else {
            view.classList.remove('active');
            EventBus.publish('ui:view-hidden', { viewId });
        }
    };
    
    /**
     * アニメーションでDOM要素を更新する
     * @param {string} elementId - アニメーションする要素のID
     * @param {Object} props - アニメーションするプロパティ
     * @param {number} duration - アニメーション時間（ミリ秒）
     * @param {Function} easing - イージング関数
     */
    UI.animateElement = function(elementId, props, duration = 300, easing = t => t) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // すでに実行中のアニメーションをキャンセル
        if (animations[elementId]) {
            cancelAnimationFrame(animations[elementId]);
        }
        
        const startProps = {};
        const propUnits = {};
        
        // 初期値を取得
        for (const prop in props) {
            const computedStyle = window.getComputedStyle(element);
            const currentValue = computedStyle[prop];
            
            // 値から単位を抽出
            const match = currentValue.match(/^([-\d.]+)([a-z%]*)$/);
            
            if (match) {
                startProps[prop] = parseFloat(match[1]);
                propUnits[prop] = match[2] || '';
            } else {
                startProps[prop] = 0;
                propUnits[prop] = '';
            }
        }
        
        const startTime = performance.now();
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easing(progress);
            
            for (const prop in props) {
                const targetValue = parseFloat(props[prop]);
                const currentValue = startProps[prop] + (targetValue - startProps[prop]) * easedProgress;
                element.style[prop] = `${currentValue}${propUnits[prop]}`;
            }
            
            if (progress < 1) {
                animations[elementId] = requestAnimationFrame(animate);
            } else {
                delete animations[elementId];
            }
        }
        
        animations[elementId] = requestAnimationFrame(animate);
    };
    
    /**
     * 動的にDOM要素を生成する
     * @param {string} tagName - 生成する要素のタグ名
     * @param {Object} attributes - 要素の属性
     * @param {Array|string} children - 子要素または内部テキスト
     * @param {Object} eventListeners - イベントリスナー
     * @returns {HTMLElement} 生成した要素
     */
    UI.createElement = function(tagName, attributes = {}, children = [], eventListeners = {}) {
        const element = document.createElement(tagName);
        
        // 属性を設定
        for (const attr in attributes) {
            if (attr === 'className') {
                element.className = attributes[attr];
            } else if (attr === 'style' && typeof attributes[attr] === 'object') {
                Object.assign(element.style, attributes[attr]);
            } else {
                element.setAttribute(attr, attributes[attr]);
            }
        }
        
        // 子要素を追加
        if (Array.isArray(children)) {
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof Node) {
                    element.appendChild(child);
                }
            });
        } else if (typeof children === 'string') {
            element.textContent = children;
        }
        
        // イベントリスナーを追加
        for (const event in eventListeners) {
            element.addEventListener(event, eventListeners[event]);
        }
        
        return element;
    };
    
    /**
     * フォームのバリデーションを設定する
     * @param {string} formId - フォームのID
     * @param {Object} validationRules - バリデーションルール
     */
    UI.setupFormValidation = function(formId, validationRules) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        // すでに設定済みの場合は削除
        if (activeForms[formId]) {
            form.removeEventListener('submit', activeForms[formId]);
        }
        
        const validationHandler = function(e) {
            let isValid = true;
            const errors = {};
            
            // 各フィールドのバリデーション
            for (const fieldName in validationRules) {
                const field = form.elements[fieldName];
                if (!field) continue;
                
                const rules = validationRules[fieldName];
                const value = field.value;
                
                // エラーメッセージをクリア
                clearFieldError(field);
                
                // ルールに従ってバリデーション
                for (const rule in rules) {
                    const ruleValue = rules[rule];
                    let fieldValid = true;
                    
                    switch (rule) {
                        case 'required':
                            if (ruleValue && !value.trim()) {
                                fieldValid = false;
                                errors[fieldName] = 'このフィールドは必須です';
                            }
                            break;
                        case 'min':
                            if (parseFloat(value) < ruleValue) {
                                fieldValid = false;
                                errors[fieldName] = `${ruleValue}以上の値を入力してください`;
                            }
                            break;
                        case 'max':
                            if (parseFloat(value) > ruleValue) {
                                fieldValid = false;
                                errors[fieldName] = `${ruleValue}以下の値を入力してください`;
                            }
                            break;
                        case 'pattern':
                            const regex = new RegExp(ruleValue);
                            if (!regex.test(value)) {
                                fieldValid = false;
                                errors[fieldName] = '無効な形式です';
                            }
                            break;
                        case 'custom':
                            if (typeof ruleValue === 'function') {
                                const result = ruleValue(value, form);
                                if (result !== true) {
                                    fieldValid = false;
                                    errors[fieldName] = result || '無効な値です';
                                }
                            }
                            break;
                    }
                    
                    if (!fieldValid) {
                        isValid = false;
                        break;
                    }
                }
                
                // エラーメッセージの表示
                if (errors[fieldName]) {
                    showFieldError(field, errors[fieldName]);
                }
            }
            
            if (!isValid) {
                e.preventDefault();
                e.stopPropagation();
                
                // 最初のエラーフィールドにフォーカス
                const firstErrorField = form.querySelector('.field-error');
                if (firstErrorField) {
                    firstErrorField.focus();
                }
                
                EventBus.publish('ui:form-validation-failed', { formId, errors });
            }
        };
        
        form.addEventListener('submit', validationHandler);
        activeForms[formId] = validationHandler;
        
        // ヘルパー関数: フィールドエラーの表示
        function showFieldError(field, message) {
            field.classList.add('field-error');
            
            // エラーメッセージ要素の作成
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.textContent = message;
            
            const fieldContainer = field.closest('.form-field');
            if (fieldContainer) {
                fieldContainer.appendChild(errorEl);
            } else {
                field.parentNode.insertBefore(errorEl, field.nextSibling);
            }
        }
        
        // ヘルパー関数: フィールドエラーのクリア
        function clearFieldError(field) {
            field.classList.remove('field-error');
            
            const fieldContainer = field.closest('.form-field') || field.parentNode;
            const errorEl = fieldContainer.querySelector('.error-message');
            if (errorEl) {
                errorEl.remove();
            }
        }
    };
    
    // グローバル名前空間にエクスポート
    window.App = window.App || {};
    window.App.UI = UI;
    
})();