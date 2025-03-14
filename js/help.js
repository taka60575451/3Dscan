// help.js - ヘルプページ操作用JavaScript

(function() {
  'use strict';

  // ヘルプシステム名前空間
  const HelpSystem = {
    // 状態管理
    state: {
      activeSection: null,
      searchQuery: '',
      imageViewerActive: false,
      currentImage: null
    },

    // DOM要素キャッシュ
    elements: {},

    // 初期化関数
    init: function() {
      // DOM要素の参照を取得
      this.cacheElements();
      
      // イベントリスナーを設定
      this.bindEvents();
      
      // URLハッシュからセクション表示
      this.handleHashNavigation();
      
      // 戻るボタン設定
      this.setupBackButton();
      
      // 印刷設定
      this.setupPrintHandler();

      console.log('ヘルプシステムが初期化されました');
    },

    // DOM要素をキャッシュ
    cacheElements: function() {
      this.elements = {
        searchInput: document.getElementById('help-search'),
        searchResults: document.getElementById('search-results'),
        tocLinks: document.querySelectorAll('.toc-link'),
        sections: document.querySelectorAll('.help-section'),
        sectionHeaders: document.querySelectorAll('.section-header'),
        helpImages: document.querySelectorAll('.help-image'),
        imageViewer: document.getElementById('image-viewer'),
        imageViewerContent: document.getElementById('image-viewer-content'),
        imageViewerClose: document.getElementById('image-viewer-close'),
        backButton: document.getElementById('help-back-button'),
        printButton: document.getElementById('help-print-button')
      };
    },

    // イベントリスナーをバインド
    bindEvents: function() {
      const self = this;
      
      // 検索機能
      if (this.elements.searchInput) {
        this.elements.searchInput.addEventListener('input', function(e) {
          self.handleSearch(e.target.value);
        });
      }
      
      // セクションヘッダークリックでトグル
      this.elements.sectionHeaders.forEach(header => {
        header.addEventListener('click', function() {
          self.toggleSection(this.parentElement);
        });
      });
      
      // 目次リンクのクリックハンドリング
      this.elements.tocLinks.forEach(link => {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          const targetId = this.getAttribute('href').substring(1);
          self.navigateToSection(targetId);
        });
      });
      
      // 画像クリックでビューア表示
      this.elements.helpImages.forEach(img => {
        img.addEventListener('click', function() {
          self.openImageViewer(this.src, this.alt);
        });
      });
      
      // 画像ビューアを閉じる
      if (this.elements.imageViewerClose) {
        this.elements.imageViewerClose.addEventListener('click', function() {
          self.closeImageViewer();
        });
      }
      
      // ウィンドウのハッシュ変更検出
      window.addEventListener('hashchange', function() {
        self.handleHashNavigation();
      });
    },

    // 検索処理
    handleSearch: function(query) {
      this.state.searchQuery = query.toLowerCase().trim();
      
      if (!this.state.searchQuery) {
        // 検索クエリが空の場合は全セクション表示
        this.resetSearch();
        return;
      }
      
      let resultsFound = false;
      
      // 各セクションとコンテンツを検索
      this.elements.sections.forEach(section => {
        const sectionTitle = section.querySelector('.section-header').textContent.toLowerCase();
        const sectionContent = section.querySelector('.section-content').textContent.toLowerCase();
        const matchesQuery = sectionTitle.includes(this.state.searchQuery) || 
                             sectionContent.includes(this.state.searchQuery);
        
        if (matchesQuery) {
          section.classList.remove('hidden');
          // 検索にマッチしたセクションを展開
          this.expandSection(section);
          resultsFound = true;
          
          // 検索語句をハイライト（オプション）
          this.highlightSearchTerms(section, this.state.searchQuery);
        } else {
          section.classList.add('hidden');
        }
      });
      
      // 検索結果の表示
      if (this.elements.searchResults) {
        this.elements.searchResults.textContent = resultsFound ? 
          `"${query}" の検索結果が見つかりました` : 
          `"${query}" に一致する結果が見つかりません`;
        this.elements.searchResults.classList.toggle('hidden', !this.state.searchQuery);
      }
    },
    
    // 検索結果のリセット
    resetSearch: function() {
      this.elements.sections.forEach(section => {
        section.classList.remove('hidden');
      });
      
      if (this.elements.searchResults) {
        this.elements.searchResults.classList.add('hidden');
      }
      
      // ハイライトを削除
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.outerHTML = el.textContent;
      });
    },
    
    // 検索語句のハイライト
    highlightSearchTerms: function(section, query) {
      const contentElements = section.querySelectorAll('p, li, h3, h4');
      
      contentElements.forEach(element => {
        const originalText = element.innerHTML;
        const lowerText = originalText.toLowerCase();
        const queryIndex = lowerText.indexOf(query);
        
        if (queryIndex >= 0) {
          const before = originalText.substring(0, queryIndex);
          const match = originalText.substring(queryIndex, queryIndex + query.length);
          const after = originalText.substring(queryIndex + query.length);
          
          element.innerHTML = before + 
                              `<span class="search-highlight">${match}</span>` + 
                              after;
        }
      });
    },

    // セクションの開閉
    toggleSection: function(section) {
      const content = section.querySelector('.section-content');
      const isExpanded = section.getAttribute('aria-expanded') === 'true';
      
      if (isExpanded) {
        this.collapseSection(section);
      } else {
        this.expandSection(section);
      }
    },
    
    // セクションを展開
    expandSection: function(section) {
      const content = section.querySelector('.section-content');
      const header = section.querySelector('.section-header');
      
      section.setAttribute('aria-expanded', 'true');
      content.style.maxHeight = content.scrollHeight + 'px';
      content.classList.remove('hidden');
      
      // アイコン変更（＋→−）があれば
      const icon = header.querySelector('.toggle-icon');
      if (icon) {
        icon.textContent = '−';
      }
      
      this.state.activeSection = section.id;
    },
    
    // セクションを折りたたむ
    collapseSection: function(section) {
      const content = section.querySelector('.section-content');
      const header = section.querySelector('.section-header');
      
      section.setAttribute('aria-expanded', 'false');
      content.style.maxHeight = '0';
      
      // アイコン変更（−→＋）があれば
      const icon = header.querySelector('.toggle-icon');
      if (icon) {
        icon.textContent = '＋';
      }
      
      // 検索中でなければ
      if (!this.state.searchQuery) {
        // アニメーション後に非表示
        setTimeout(() => {
          if (section.getAttribute('aria-expanded') === 'false') {
            content.classList.add('hidden');
          }
        }, 300);
      }
    },

    // 指定セクションへのナビゲーション
    navigateToSection: function(sectionId) {
      const targetSection = document.getElementById(sectionId);
      
      if (!targetSection) return;
      
      // 他のセクションを閉じる（オプション）
      this.elements.sections.forEach(section => {
        if (section.id !== sectionId) {
          this.collapseSection(section);
        }
      });
      
      // ターゲットセクションを開く
      this.expandSection(targetSection);
      
      // スムーズスクロール
      targetSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
      });
      
      // URLハッシュを更新（履歴に追加）
      history.pushState(null, null, `#${sectionId}`);
      
      // 状態を更新
      this.state.activeSection = sectionId;
    },

    // URLハッシュからのナビゲーション処理
    handleHashNavigation: function() {
      const hash = window.location.hash;
      
      if (hash && hash.length > 1) {
        const sectionId = hash.substring(1);
        this.navigateToSection(sectionId);
      } else {
        // デフォルトセクションを開く（最初のセクションなど）
        const defaultSection = this.elements.sections[0];
        if (defaultSection) {
          this.expandSection(defaultSection);
        }
      }
    },
    
    // 画像ビューアを開く
    openImageViewer: function(imageSrc, imageAlt) {
      if (!this.elements.imageViewer) return;
      
      // 画像を設定
      this.elements.imageViewerContent.innerHTML = `
        <img src="${imageSrc}" alt="${imageAlt || '拡大画像'}" class="viewer-image">
        <p class="image-caption">${imageAlt || ''}</p>
      `;
      
      // ビューアを表示
      this.elements.imageViewer.classList.remove('hidden');
      
      // 背景スクロール無効化
      document.body.style.overflow = 'hidden';
      
      // 状態更新
      this.state.imageViewerActive = true;
      this.state.currentImage = imageSrc;
      
      // ESCキーでビューアを閉じる
      document.addEventListener('keydown', this.handleKeydown.bind(this));
    },
    
    // 画像ビューアを閉じる
    closeImageViewer: function() {
      if (!this.elements.imageViewer) return;
      
      this.elements.imageViewer.classList.add('hidden');
      
      // 背景スクロール有効化
      document.body.style.overflow = '';
      
      // 状態更新
      this.state.imageViewerActive = false;
      this.state.currentImage = null;
      
      // ESCキーイベントリスナーを削除
      document.removeEventListener('keydown', this.handleKeydown.bind(this));
    },
    
    // キーボードイベント処理
    handleKeydown: function(e) {
      if (e.key === 'Escape' && this.state.imageViewerActive) {
        this.closeImageViewer();
      }
    },
    
    // 戻るボタン設定
    setupBackButton: function() {
      if (!this.elements.backButton) return;
      
      this.elements.backButton.addEventListener('click', function(e) {
        e.preventDefault();
        window.history.back();
      });
    },
    
    // 印刷機能設定
    setupPrintHandler: function() {
      if (!this.elements.printButton) return;
      
      const self = this;
      this.elements.printButton.addEventListener('click', function() {
        // 印刷前にすべてのセクションを展開
        self.elements.sections.forEach(section => {
          self.expandSection(section);
        });
        
        // 少し遅延して印刷ダイアログを表示（展開アニメーション完了後）
        setTimeout(() => {
          window.print();
        }, 300);
      });
      
      // 印刷メディアの開始時にすべてのセクションを展開
      window.matchMedia('print').addEventListener('change', function(mql) {
        if (mql.matches) {
          // 印刷モード開始時
          self.elements.sections.forEach(section => {
            self.expandSection(section);
          });
        }
      });
    }
  };

  // DOMの読み込み完了時に初期化
  document.addEventListener('DOMContentLoaded', function() {
    HelpSystem.init();
  });

  // グローバルアクセス用に公開
  window.HelpSystem = HelpSystem;
})();