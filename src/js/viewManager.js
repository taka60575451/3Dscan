/**
 * viewManager.js
 * アプリケーションのビュー管理を担当するモジュール
 */

(function(global) {
    'use strict';

    // 依存関係の確認
    if (!global.EventBus) {
        console.error('EventBus is required for ViewManager');
        return;
    }

    // プライベート変数
    const TRANSITION_DURATION = 300; // トランジション時間（ミリ秒）
    const VIEW_ATTR = 'data-view';
    const ACTIVE_CLASS = 'active';
    const ANIMATE_CLASS = 'view-transition';
    const HIDDEN_CLASS = 'hidden';

    // 現在のビュー状態
    let currentView = null;
    let previousView = null;
    let viewHistory = [];
    let isTransitioning = false;

    // DOM要素のキャッシュ
    let viewContainers = {};
    
    // イベントバスへの参照
    const eventBus = global.EventBus;

    // ビューマネージャーの初期化
    function init() {
        // ビューコンテナの取得とキャッシュ
        document.querySelectorAll(`[${VIEW_ATTR}]`).forEach(container => {
            const viewName = container.getAttribute(VIEW_ATTR);
            viewContainers[viewName] = container;
            
            // 初期状態では非表示（最初に表示するビューを除く）
            if (!container.classList.contains(ACTIVE_CLASS)) {
                container.classList.add(HIDDEN_CLASS);
            } else {
                currentView = viewName;
                viewHistory.push(viewName);
            }
        });

        // ブラウザの戻る/進むボタンのハンドリング
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.view) {
                changeView(event.state.view, { updateHistory: false });
            }
        });

        // イベント購読
        eventBus.subscribe('view:change', (viewName, options) => {
            changeView(viewName, options);
        });
        
        // 初期化完了イベント発行
        eventBus.publish('viewManager:initialized', { currentView });
    }

    /**
     * ビューを切り替える
     * @param {string} viewName - 切り替え先のビュー名
     * @param {Object} options - オプション設定
     * @param {boolean} options.updateHistory - 履歴を更新するかどうか
     * @param {Object} options.state - 状態データ
     * @param {boolean} options.animate - アニメーションを適用するかどうか
     */
    function changeView(viewName, options = {}) {
        const defaultOptions = {
            updateHistory: true,
            state: {},
            animate: true
        };
        
        const settings = {...defaultOptions, ...options};
        
        // 対象のビューが存在しない場合や現在と同じビューの場合は何もしない
        if (!viewContainers[viewName] || (viewName === currentView && !settings.force)) {
            return false;
        }
        
        // すでにトランジション中の場合は処理をスキップ
        if (isTransitioning) {
            return false;
        }
        
        isTransitioning = true;
        
        // イベント発行: トランジション開始
        eventBus.publish('viewTransition:start', {
            from: currentView,
            to: viewName
        });
        
        // 履歴を更新
        if (settings.updateHistory) {
            const historyState = { view: viewName, ...settings.state };
            const url = settings.url || `#${viewName}`;
            
            window.history.pushState(historyState, '', url);
            viewHistory.push(viewName);
        }
        
        // 前のビューを記録
        previousView = currentView;
        
        // 新しいビューへの切り替え
        _performViewTransition(viewName, settings.animate);
        
        return true;
    }
    
    /**
     * 実際のビュートランジションを実行
     * @private
     */
    function _performViewTransition(newView, animate) {
        const fromElement = viewContainers[currentView];
        const toElement = viewContainers[newView];
        
        // アニメーションフラグがOFFまたはCSSアニメーションが未サポートの場合
        if (!animate || !('ontransitionend' in window)) {
            // 即時切り替え
            _hideElement(fromElement);
            _showElement(toElement);
            _completeTransition(newView);
            return;
        }
        
        // トランジション前のセットアップ
        toElement.classList.remove(HIDDEN_CLASS);
        
        // アニメーション準備（フレーム描画後に実行）
        requestAnimationFrame(() => {
            // 退場アニメーション
            fromElement.classList.add(ANIMATE_CLASS, 'exit');
            
            // 入場アニメーション
            toElement.classList.add(ANIMATE_CLASS, 'enter');
            
            // トランジション完了ハンドラの設定
            const onTransitionEnd = (event) => {
                if (event.target !== fromElement) return;
                
                fromElement.removeEventListener('transitionend', onTransitionEnd);
                
                // 古いビューを非表示
                _hideElement(fromElement);
                fromElement.classList.remove(ANIMATE_CLASS, 'exit');
                
                // 新しいビューのアニメーションクラスを削除
                toElement.classList.remove(ANIMATE_CLASS, 'enter');
                
                // トランジション完了処理
                _completeTransition(newView);
            };
            
            // トランジションが終了しなかった場合のフォールバック
            const transitionTimeout = setTimeout(() => {
                fromElement.removeEventListener('transitionend', onTransitionEnd);
                _hideElement(fromElement);
                fromElement.classList.remove(ANIMATE_CLASS, 'exit');
                toElement.classList.remove(ANIMATE_CLASS, 'enter');
                _completeTransition(newView);
            }, TRANSITION_DURATION + 50);
            
            // トランジションイベントリスナーの設定
            fromElement.addEventListener('transitionend', (event) => {
                clearTimeout(transitionTimeout);
                onTransitionEnd(event);
            });
        });
    }
    
    /**
     * ビュー遷移の完了処理
     * @private
     */
    function _completeTransition(newView) {
        // 状態の更新
        currentView = newView;
        isTransitioning = false;
        
        // 遷移完了イベントの発行
        eventBus.publish('viewTransition:complete', {
            currentView: newView,
            previousView
        });
        
        // 新しいビューのコンテンツを必要に応じて遅延ロード
        _lazyLoadContent(viewContainers[newView]);
    }
    
    /**
     * 要素を表示する
     * @private
     */
    function _showElement(element) {
        if (!element) return;
        element.classList.remove(HIDDEN_CLASS);
        element.classList.add(ACTIVE_CLASS);
    }
    
    /**
     * 要素を非表示にする
     * @private
     */
    function _hideElement(element) {
        if (!element) return;
        element.classList.remove(ACTIVE_CLASS);
        element.classList.add(HIDDEN_CLASS);
    }
    
    /**
     * コンテンツの遅延ロード処理
     * @private
     */
    function _lazyLoadContent(viewElement) {
        if (!viewElement) return;
        
        // data-lazy-src属性を持つ画像を探す
        viewElement.querySelectorAll('[data-lazy-src]').forEach(img => {
            const src = img.getAttribute('data-lazy-src');
            if (src) {
                img.setAttribute('src', src);
                img.removeAttribute('data-lazy-src');
            }
        });
        
        // data-lazy-load属性を持つ要素を探す（APIからの動的データロードなど）
        viewElement.querySelectorAll('[data-lazy-load]').forEach(element => {
            const loadTarget = element.getAttribute('data-lazy-load');
            
            // ロード済みかどうかのチェック
            if (element.getAttribute('data-loaded') !== 'true') {
                // ロード完了イベントの発行
                eventBus.publish('content:lazyLoad', {
                    element,
                    target: loadTarget
                });
                
                // ロード済みとしてマーク
                element.setAttribute('data-loaded', 'true');
            }
        });
    }
    
    /**
     * 前のビューに戻る
     * @param {Object} options - オプション設定
     */
    function goBack(options = {}) {
        if (viewHistory.length <= 1) {
            return false;
        }
        
        // 現在のビューを履歴から削除
        viewHistory.pop();
        
        // 前のビューを取得
        const prevView = viewHistory[viewHistory.length - 1];
        
        // 前のビューに切り替え
        return changeView(prevView, {
            ...options,
            updateHistory: false
        });
    }
    
    /**
     * UI要素の表示/非表示を切り替える
     * @param {string|Element} element - 対象要素またはセレクタ
     * @param {boolean} show - 表示するかどうか
     * @param {Object} options - オプション設定
     */
    function toggleElement(element, show, options = {}) {
        const targetElement = typeof element === 'string' 
            ? document.querySelector(element) 
            : element;
            
        if (!targetElement) return false;
        
        const defaultOptions = {
            animate: true,
            class: HIDDEN_CLASS,
            activeClass: ACTIVE_CLASS
        };
        
        const settings = {...defaultOptions, ...options};
        
        if (show) {
            targetElement.classList.remove(settings.class);
            if (settings.activeClass) {
                targetElement.classList.add(settings.activeClass);
            }
            
            if (settings.animate) {
                targetElement.classList.add('fade-in');
                setTimeout(() => {
                    targetElement.classList.remove('fade-in');
                }, TRANSITION_DURATION);
            }
        } else {
            if (settings.activeClass) {
                targetElement.classList.remove(settings.activeClass);
            }
            
            if (settings.animate) {
                targetElement.classList.add('fade-out');
                setTimeout(() => {
                    targetElement.classList.add(settings.class);
                    targetElement.classList.remove('fade-out');
                }, TRANSITION_DURATION);
            } else {
                targetElement.classList.add(settings.class);
            }
        }
        
        return true;
    }
    
    /**
     * 現在のビュー状態を取得
     * @returns {Object} ビュー状態オブジェクト
     */
    function getViewState() {
        return {
            currentView,
            previousView,
            history: [...viewHistory],
            isTransitioning
        };
    }
    
    /**
     * ビューを登録する（動的に追加されたビュー用）
     * @param {string} viewName - ビュー名
     * @param {Element} element - ビュー要素
     */
    function registerView(viewName, element) {
        if (!viewName || !element) {
            return false;
        }
        
        // 既に存在する場合は更新
        viewContainers[viewName] = element;
        
        // データ属性の設定
        element.setAttribute(VIEW_ATTR, viewName);
        
        // 初期状態は非表示
        if (currentView !== viewName) {
            element.classList.add(HIDDEN_CLASS);
        }
        
        return true;
    }
    
    // 公開API
    const ViewManager = {
        init,
        changeView,
        goBack,
        toggleElement,
        getViewState,
        registerView
    };
    
    // グローバル公開
    global.ViewManager = ViewManager;
    
    // イベントバスがロードされたらビューマネージャーを初期化
    if (document.readyState === 'complete') {
        setTimeout(init, 0);
    } else {
        window.addEventListener('load', init);
    }
    
})(window);