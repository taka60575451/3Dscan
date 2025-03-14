/**
 * EventBus - イベント発行/購読システム
 * アプリケーション内のコンポーネント間通信を疎結合に実現するモジュール
 */
const EventBus = (function() {
  // プライベート変数
  const events = {};
  let debugMode = false;

  /**
   * デバッグメッセージをログに出力
   * @param {string} message - ログメッセージ
   * @param {any} data - 追加データ（オプション）
   */
  function debug(message, data) {
    if (!debugMode) return;
    
    const timestamp = new Date().toISOString();
    console.log(`[EventBus][${timestamp}] ${message}`, data || '');
  }

  return {
    /**
     * イベントを購読（リスナー登録）
     * @param {string} eventName - イベント名
     * @param {Function} listener - イベントリスナー関数
     * @param {Object} options - オプション（priority, context など）
     * @returns {Object} 購読解除用ハンドラ
     */
    on: function(eventName, listener, options = {}) {
      if (!eventName || typeof listener !== 'function') {
        throw new Error('イベント名とリスナー関数は必須です');
      }

      // イベントキューが存在しない場合は作成
      if (!events[eventName]) {
        events[eventName] = [];
      }

      const listenerObj = {
        callback: listener,
        once: false,
        priority: options.priority || 0,
        context: options.context || null
      };

      events[eventName].push(listenerObj);
      
      // 優先度でソート
      events[eventName].sort((a, b) => b.priority - a.priority);

      debug(`イベント "${eventName}" を購読`, { listener: listener.name || 'anonymous', options });

      // 購読解除用ハンドラを返す
      return {
        remove: () => this.off(eventName, listener)
      };
    },

    /**
     * 一度だけ実行するイベントリスナーを登録
     * @param {string} eventName - イベント名
     * @param {Function} listener - イベントリスナー関数
     * @param {Object} options - オプション
     * @returns {Object} 購読解除用ハンドラ
     */
    once: function(eventName, listener, options = {}) {
      if (!events[eventName]) {
        events[eventName] = [];
      }

      const listenerObj = {
        callback: listener,
        once: true,
        priority: options.priority || 0,
        context: options.context || null
      };

      events[eventName].push(listenerObj);
      events[eventName].sort((a, b) => b.priority - a.priority);

      debug(`イベント "${eventName}" を一度だけ購読`, { listener: listener.name || 'anonymous', options });

      return {
        remove: () => this.off(eventName, listener)
      };
    },

    /**
     * イベントの購読を解除
     * @param {string} eventName - イベント名
     * @param {Function} [listener] - 特定のリスナー (省略時は全リスナー削除)
     */
    off: function(eventName, listener) {
      if (!events[eventName]) return;

      if (!listener) {
        // リスナーが指定されていない場合は全てのリスナーを削除
        debug(`イベント "${eventName}" の全リスナーを削除`);
        delete events[eventName];
        return;
      }

      // 特定のリスナーのみ削除
      const index = events[eventName].findIndex(e => e.callback === listener);
      if (index !== -1) {
        events[eventName].splice(index, 1);
        debug(`イベント "${eventName}" から特定のリスナーを削除`, { listener: listener.name || 'anonymous' });
      }

      // リスナーが空になったらイベントエントリを削除
      if (events[eventName].length === 0) {
        delete events[eventName];
      }
    },

    /**
     * イベントを発行（トリガー）
     * @param {string} eventName - イベント名
     * @param {any} data - イベントデータ
     * @returns {Promise<Array>} すべてのリスナーの実行結果Promise
     */
    emit: function(eventName, data) {
      debug(`イベント "${eventName}" を発行`, { data });

      if (!events[eventName]) {
        debug(`イベント "${eventName}" のリスナーはありません`);
        return Promise.resolve([]);
      }

      const promises = [];
      const removableListeners = [];

      // リスナーを実行して結果をPromiseに変換
      events[eventName].forEach(listenerObj => {
        try {
          const result = listenerObj.callback.call(
            listenerObj.context, 
            data, 
            { 
              eventName, 
              timestamp: Date.now() 
            }
          );

          // Promise変換して追加
          const resultPromise = result instanceof Promise ? result : Promise.resolve(result);
          promises.push(resultPromise);

          // 一度だけのリスナーを記録
          if (listenerObj.once) {
            removableListeners.push(listenerObj.callback);
          }
        } catch (error) {
          debug(`イベント "${eventName}" のリスナー実行中にエラー`, { error });
          promises.push(Promise.reject(error));
        }
      });

      // 一度だけのリスナーを削除
      removableListeners.forEach(listener => {
        this.off(eventName, listener);
      });

      // すべてのPromiseを返す
      return Promise.all(promises).catch(err => {
        debug(`イベント "${eventName}" の処理中にエラー発生`, { error: err });
        return Promise.reject(err);
      });
    },

    /**
     * イベントチェーン - 複数のイベントを順次実行
     * @param {Array<{name: string, data: any}>} eventChain - 実行するイベントチェーン
     * @returns {Promise<Array>} チェーン実行結果
     */
    chain: function(eventChain) {
      if (!Array.isArray(eventChain) || eventChain.length === 0) {
        return Promise.resolve([]);
      }

      debug('イベントチェーンを開始', { chain: eventChain });

      return eventChain.reduce((promise, event) => {
        return promise.then(results => {
          return this.emit(event.name, event.data).then(result => {
            results.push(result);
            return results;
          });
        });
      }, Promise.resolve([]));
    },

    /**
     * 登録されているすべてのイベントとリスナー数を取得
     * @returns {Object} イベント名とリスナー数のマップ
     */
    getRegisteredEvents: function() {
      const registeredEvents = {};
      
      Object.keys(events).forEach(eventName => {
        registeredEvents[eventName] = events[eventName].length;
      });
      
      return registeredEvents;
    },

    /**
     * デバッグモードの切り替え
     * @param {boolean} enabled - 有効にするかどうか
     */
    setDebugMode: function(enabled) {
      debugMode = !!enabled;
      debug(`デバッグモードを ${debugMode ? '有効' : '無効'} に設定`);
      return this;
    },

    /**
     * イベントの存在確認
     * @param {string} eventName - イベント名
     * @returns {boolean} イベントが登録されているか
     */
    hasEvent: function(eventName) {
      return !!events[eventName] && events[eventName].length > 0;
    },

    /**
     * すべてのイベントリスナーをクリア
     */
    clearAll: function() {
      debug('すべてのイベントリスナーをクリア');
      Object.keys(events).forEach(eventName => {
        delete events[eventName];
      });
    }
  };
})();

// グローバルで利用可能にする
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
}

// CommonJS環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventBus;
}