/**
 * 設定管理モジュール
 * アプリケーション設定の保存/読み込み、テーマ管理、UI設定を担当
 */
const SettingsManager = (function() {
  // 依存モジュール
  const EventBus = window.App ? window.App.EventBus : null;
  
  // プライベート変数
  let currentSettings = {};
  const STORAGE_KEY = 'lidar_scanner_settings';
  
  // デフォルト設定
  const DEFAULT_SETTINGS = {
    theme: 'system', // system, light, dark
    scanQuality: 'balanced', // low, balanced, high
    scanModes: {
      maxArea: {
        enabled: true,
        resolution: 'medium', // low, medium, high
        density: 5
      },
      maxDetail: {
        enabled: true,
        resolution: 'high',
        density: 8
      }
    },
    ui: {
      showFPS: false,
      showPointCount: true,
      showScanProgress: true,
      vibrationFeedback: true
    },
    export: {
      defaultFormat: 'ply', // ply, e57
      compressFiles: true,
      includeMetadata: true,
      autoExport: false
    },
    advanced: {
      cameraFOV: 75,
      pointSize: 2,
      pointColorMode: 'height', // height, rgb, intensity
      depthFilterStrength: 3,
      maxPoints: 5000000
    }
  };
  
  /**
   * 設定の初期化
   */
  function init() {
    loadSettings();
    applyTheme();
    
    // システムのテーマ変更を監視
    if (window.matchMedia) {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeMediaQuery.addEventListener('change', () => {
        if (currentSettings.theme === 'system') {
          applyTheme();
        }
      });
    }
    
    // 設定変更イベントリスナー登録
    if (EventBus) {
      EventBus.subscribe('settings:changed', handleSettingsChanged);
    }
  }
  
  /**
   * 保存されている設定をロード
   */
  function loadSettings() {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY);
      if (savedSettings) {
        currentSettings = {...DEFAULT_SETTINGS, ...JSON.parse(savedSettings)};
      } else {
        currentSettings = {...DEFAULT_SETTINGS};
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      currentSettings = {...DEFAULT_SETTINGS};
    }
  }
  
  /**
   * 現在の設定を保存
   */
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
      if (EventBus) {
        EventBus.publish('settings:saved', currentSettings);
      }
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      return false;
    }
  }
  
  /**
   * 設定値を取得
   * @param {string} key - 設定キー（ドット記法でネストした設定にアクセス可能）
   * @param {*} defaultValue - 設定が存在しない場合のデフォルト値
   * @returns {*} 設定値
   */
  function getSetting(key, defaultValue) {
    if (!key) return currentSettings;
    
    const keys = key.split('.');
    let value = currentSettings;
    
    for (const k of keys) {
      if (value === undefined || value === null || typeof value !== 'object') {
        return defaultValue;
      }
      value = value[k];
    }
    
    return value !== undefined ? value : defaultValue;
  }
  
  /**
   * 設定値を更新
   * @param {string} key - 設定キー（ドット記法でネストした設定も可）
   * @param {*} value - 設定する値
   * @param {boolean} saveImmediately - 即座に保存するか
   */
  function updateSetting(key, value, saveImmediately = true) {
    if (!key) return false;
    
    const keys = key.split('.');
    let target = currentSettings;
    
    // ネストしたオブジェクトのパスを辿る（最後の要素以外）
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (target[k] === undefined || target[k] === null) {
        target[k] = {};
      }
      target = target[k];
    }
    
    // 最後のキーに値を設定
    const lastKey = keys[keys.length - 1];
    target[lastKey] = value;
    
    // 変更イベントを発行
    if (EventBus) {
      EventBus.publish('settings:changed', {
        key: key,
        value: value,
        settings: currentSettings
      });
    }
    
    // 保存（オプション）
    if (saveImmediately) {
      saveSettings();
    }
    
    return true;
  }
  
  /**
   * 設定変更イベントハンドラ
   * @param {Object} data - 変更された設定データ
   */
  function handleSettingsChanged(data) {
    // テーマ設定が変更された場合
    if (data.key === 'theme') {
      applyTheme();
    }
    
    // 他の特定の設定変更に応じたアクション
    // ...
  }
  
  /**
   * 現在のテーマ設定に基づいてテーマを適用
   */
  function applyTheme() {
    const theme = currentSettings.theme;
    const isDarkMode = theme === 'dark' || 
                      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.documentElement.classList.remove('dark-theme');
    }
    
    if (EventBus) {
      EventBus.publish('theme:changed', {
        theme: isDarkMode ? 'dark' : 'light',
        systemPreference: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      });
    }
  }
  
  /**
   * テーマを切り替え
   * @param {string} theme - 'light', 'dark', または 'system'
   */
  function setTheme(theme) {
    if (['light', 'dark', 'system'].includes(theme)) {
      updateSetting('theme', theme);
      applyTheme();
      return true;
    }
    return false;
  }
  
  /**
   * 設定UIの初期化
   * @param {string} containerId - 設定UIのコンテナ要素ID
   */
  function initSettingsUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return false;
    
    // 現在の設定値をUIに反映
    populateSettingsForm(container);
    
    // フォーム要素のイベントリスナー設定
    attachFormEventListeners(container);
    
    return true;
  }
  
  /**
   * 設定フォームに現在の値を設定
   * @param {HTMLElement} container - 設定フォームのコンテナ要素
   */
  function populateSettingsForm(container) {
    // テーマ設定
    const themeInputs = container.querySelectorAll('[name="theme"]');
    themeInputs.forEach(input => {
      if (input.value === currentSettings.theme) {
        input.checked = true;
      }
    });
    
    // スキャン品質設定
    const qualitySelect = container.querySelector('[name="scanQuality"]');
    if (qualitySelect) {
      qualitySelect.value = currentSettings.scanQuality;
    }
    
    // UI設定のチェックボックス
    Object.keys(currentSettings.ui).forEach(key => {
      const checkbox = container.querySelector(`[name="ui.${key}"]`);
      if (checkbox) {
        checkbox.checked = currentSettings.ui[key];
      }
    });
    
    // 他の設定項目も同様に設定
    // ...
  }
  
  /**
   * フォーム要素にイベントリスナーを設定
   * @param {HTMLElement} container - 設定フォームのコンテナ要素
   */
  function attachFormEventListeners(container) {
    // ラジオボタン、チェックボックス、セレクトなどの変更検知
    container.addEventListener('change', e => {
      const target = e.target;
      const name = target.name;
      
      if (!name) return;
      
      let value;
      if (target.type === 'checkbox') {
        value = target.checked;
      } else if (target.type === 'radio') {
        value = target.value;
      } else {
        value = target.value;
      }
      
      updateSetting(name, value);
    });
    
    // 範囲スライダーなどの入力検知
    container.addEventListener('input', e => {
      const target = e.target;
      if (target.type === 'range') {
        const name = target.name;
        const value = parseFloat(target.value);
        
        // リアルタイムプレビューのためにイベントを発行するが、保存は行わない
        if (EventBus) {
          EventBus.publish('settings:changing', {
            key: name,
            value: value
          });
        }
      }
    });
    
    // 範囲スライダーの値確定時に保存
    container.addEventListener('change', e => {
      const target = e.target;
      if (target.type === 'range') {
        const name = target.name;
        const value = parseFloat(target.value);
        updateSetting(name, value);
      }
    });
    
    // リセットボタン
    const resetBtn = container.querySelector('#reset-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resetToDefaults();
        populateSettingsForm(container);
      });
    }
    
    // エクスポートボタン
    const exportBtn = container.querySelector('#export-settings');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportSettings);
    }
    
    // インポートボタン/フィールド
    const importInput = container.querySelector('#import-settings');
    if (importInput) {
      importInput.addEventListener('change', handleSettingsImport);
    }
  }
  
  /**
   * 設定をデフォルトにリセット
   */
  function resetToDefaults() {
    currentSettings = {...DEFAULT_SETTINGS};
    saveSettings();
    applyTheme();
    
    if (EventBus) {
      EventBus.publish('settings:reset', currentSettings);
    }
    
    return true;
  }
  
  /**
   * 設定をJSONファイルとしてエクスポート
   */
  function exportSettings() {
    const settingsJson = JSON.stringify(currentSettings, null, 2);
    const blob = new Blob([settingsJson], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `lidar-scanner-settings-${timestamp}.json`;
    a.href = url;
    a.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
    
    return true;
  }
  
  /**
   * 設定JSONファイルからインポート
   * @param {Event} event - ファイル選択イベント
   */
  function handleSettingsImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedSettings = JSON.parse(e.target.result);
        
        // 設定をマージ（矛盾するプロパティの検証などもここで行う）
        importSettings(importedSettings);
        
        // ファイル入力をリセット
        event.target.value = '';
      } catch (err) {
        console.error('Failed to import settings:', err);
        if (EventBus) {
          EventBus.publish('settings:importError', {
            error: err.message
          });
        }
      }
    };
    
    reader.readAsText(file);
  }
  
  /**
   * 設定オブジェクトをインポートして適用
   * @param {Object} importedSettings - インポートする設定オブジェクト
   */
  function importSettings(importedSettings) {
    // 設定のバリデーション（必要に応じて）
    // ...
    
    // 既存設定とマージ
    currentSettings = {...DEFAULT_SETTINGS, ...importedSettings};
    
    // 保存して適用
    saveSettings();
    applyTheme();
    
    // 設定UIを開いている場合は更新
    const settingsContainer = document.getElementById('settings-container');
    if (settingsContainer) {
      populateSettingsForm(settingsContainer);
    }
    
    if (EventBus) {
      EventBus.publish('settings:imported', currentSettings);
    }
    
    return true;
  }
  
  // パブリックAPI
  return {
    init,
    getSetting,
    updateSetting,
    setTheme,
    initSettingsUI,
    resetToDefaults,
    exportSettings,
    importSettings
  };
})();

// グローバル名前空間に追加
window.App = window.App || {};
window.App.SettingsManager = SettingsManager;