// 楽楽勤怠カスタマイザー - 部門クイック絞り込み
// ヘッダーにボタンを追加し、「出勤簿管理」「申請承認」を部門で絞り込んだ状態で開く

(() => {
  console.log(`楽楽勤怠カスタマイザー: クイック絞り込み読み込み開始 (v${chrome.runtime?.getManifest?.().version})`);

  const DEFAULT_DEPT = ''; // 部門コードはポップアップで設定する
  const PENDING_KEY = 'rrkQuickFilterPending';
  const PENDING_TTL = 60 * 1000; // URL直接遷移後に続きを実行する有効期限
  const DEPT_PLACEHOLDER = '部門名を入力・選択してください';
  const STEP_WAIT = 800; // 各操作の間の最低待ち時間
  const DOM_QUIET_MS = 700; // この時間DOMが変化しなければ画面の反映が終わったとみなす
  const DOM_IDLE_TIMEOUT = 10000;

  // 絞り込み対象の画面（Chromeレコーダーの記録より）
  const TARGETS = {
    attendance: {
      label: '出勤簿管理',
      path: '/app/attendancemanagement',
      menuButtonText: '勤怠管理',
      menuButtonIndex: 1,
      menuItem: '#attendanceManager'
    },
    approval: {
      label: '申請承認',
      path: '/app/applicationmanagement.approval',
      menuButtonText: '申請承認',
      menuButtonIndex: 2,
      menuItem: '#approval'
    }
  };

  let deptCode = DEFAULT_DEPT;
  let running = false;
  let startTime = Date.now();

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function isVisible(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0;
  }

  function findVisible(selector, root = document) {
    return Array.from(root.querySelectorAll(selector)).find(isVisible) || null;
  }

  // 条件を満たす要素が現れるまで待機
  async function waitFor(finder, timeout, description) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = finder();
      if (result) return result;
      await sleep(100);
    }
    throw new Error(`${description}が見つかりませんでした`);
  }

  // DOMの変化が一定時間止まるまで待機（画面の読み込み・再描画の完了待ち）
  function waitForDomIdle() {
    return new Promise(resolve => {
      let quietTimer = null;
      let timeoutTimer = null;
      const done = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(timeoutTimer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, DOM_QUIET_MS);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      quietTimer = setTimeout(done, DOM_QUIET_MS);
      timeoutTimer = setTimeout(done, DOM_IDLE_TIMEOUT);
    });
  }

  // 操作後、画面に反映されるまで待つ
  async function settle() {
    await sleep(STEP_WAIT);
    await waitForDomIdle();
  }

  // 進行状況をコンソール（開始からの経過秒付き）と画面右下に表示
  function log(message) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[クイック絞り込み +${elapsed}s] ${message}`);
    if (running) showToast(`${message}…`);
  }

  function clickElement(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  function typeText(el, text) {
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: text.slice(-1) || 'Backspace', bubbles: true }));
  }

  // ===== 画面遷移 =====

  function findMenuButton(target) {
    const buttons = Array.from(document.querySelectorAll('#appHeader nav button'));
    const byLabel = buttons.find(button =>
      button.textContent.includes(target.menuButtonText) ||
      button.getAttribute('aria-label') === target.menuButtonText ||
      button.querySelector(`img[alt="${target.menuButtonText}"]`)
    );
    return byLabel ||
      document.querySelector(`#appHeader nav ul > div:nth-of-type(${target.menuButtonIndex}) button`);
  }

  async function navigateTo(target) {
    if (location.pathname === target.path) return false;

    // ヘッダーメニューから開く（ページ再読み込みなし）
    const menuButton = findMenuButton(target);
    if (menuButton) {
      try {
        log(`メニュー「${target.menuButtonText}」をクリック`);
        clickElement(menuButton);
        const menuItem = await waitFor(() => findVisible(target.menuItem), 3000, `メニューの「${target.label}」`);
        log(`メニュー項目「${target.label}」をクリック`);
        clickElement(menuItem.querySelector('span') || menuItem);
        await waitFor(() => location.pathname === target.path, 10000, `${target.label}画面`);
        return true;
      } catch (error) {
        console.log('メニューから開けなかったため、URLで直接開きます:', error.message);
      }
    }

    // メニューから開けない場合はURLで直接開く（読み込み後にresumePending()で続きを実行）
    location.href = target.path;
    await new Promise(() => {});
  }

  // ===== 部門で絞り込み =====

  // 「部門名を入力・選択してください」の欄（検索キーワード欄など、他の欄と取り違えないよう完全一致で探す）
  function findDeptInput() {
    return Array.from(document.querySelectorAll('textarea, input[type="text"]')).find(el =>
      isVisible(el) && (
        (el.placeholder || '').trim() === DEPT_PLACEHOLDER ||
        (el.getAttribute('aria-label') || '').trim() === DEPT_PLACEHOLDER
      )
    ) || null;
  }

  function findSuggestion() {
    const items = Array.from(document.querySelectorAll('#suggest_scroll_child li span, div.suggest_list_area li span'))
      .filter(isVisible);
    return items.find(item => item.textContent.includes(deptCode)) || items[0] || null;
  }

  // 部門入力欄の近くにある「決定」ボタンを探す
  function findDecideButton(ancestors) {
    for (const node of ancestors) {
      if (!node.isConnected) continue;
      const button = Array.from(node.querySelectorAll('button')).find(b =>
        isVisible(b) && b.textContent.trim() === '決定'
      );
      if (button) return button;
    }
    return null;
  }

  // 要素が消えるまで待つ（消えなければ画面の反映を待って続行）
  async function waitUntilGone(isPresent, description) {
    try {
      await waitFor(() => !isPresent(), 3000, description);
    } catch {
      console.log(`[クイック絞り込み] ${description}が閉じないため、画面の反映を待ちます`);
      await settle();
    }
  }

  // クリックして、root内の表示が変わるまで待つ（変化しなければ画面の反映を待って続行）
  async function clickAndWaitForChange(el, root, description) {
    const changed = new Promise(resolve => {
      const observer = new MutationObserver(() => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 3000);
      observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    });
    clickElement(el);
    if (!(await changed)) {
      console.log(`[クイック絞り込み] ${description}の反映が確認できないため、画面の反映を待ちます`);
      await settle();
    }
  }

  async function applyDeptFilter(pageOpened) {
    await waitFor(() => findVisible('div.filter_index'), 15000, '「絞り込み条件」');
    // 画面を開いた直後は読み込みが落ち着くまで待つ（完了を判定できる目印がないため）
    if (pageOpened) await settle();

    // 絞り込み条件パネルが閉じていれば開く
    let input = findDeptInput();
    if (!input) {
      log('「絞り込み条件」をクリック');
      const filterIndex = await waitFor(() => findVisible('div.filter_index'), 5000, '「絞り込み条件」');
      clickElement(filterIndex.querySelector('span') || filterIndex);
      input = await waitFor(findDeptInput, 5000, '部門の入力欄');
    }

    console.log('[クイック絞り込み] 部門の入力欄:', input.outerHTML.slice(0, 300));

    const ancestors = [];
    for (let node = input.parentElement; node && node !== document.body; node = node.parentElement) {
      ancestors.push(node);
    }

    // 入力後、候補リストが表示されるまで少し時間がかかる
    log('部門の入力欄をクリック');
    clickElement(input);
    await sleep(STEP_WAIT);
    log(`部門コード「${deptCode}」を入力`);
    typeText(input, deptCode);
    let suggestion;
    try {
      suggestion = await waitFor(findSuggestion, 5000, '部門の候補');
    } catch {
      log('候補が表示されないため、入力し直します');
      typeText(input, '');
      await sleep(STEP_WAIT);
      typeText(input, deptCode);
      suggestion = await waitFor(findSuggestion, 15000, '部門の候補');
    }
    // 部門コードを含む候補ならそれが目的の候補なのですぐクリック。含まなければ表示が落ち着くのを待つ
    if (!suggestion.textContent.includes(deptCode)) {
      await settle();
      suggestion = await waitFor(findSuggestion, 5000, '部門の候補');
    }
    // 候補をクリックしても候補リストは閉じないため、選択状態の表示が変わったことで反映を確認する
    log('部門の候補をクリック');
    const suggestionArea = ancestors.find(node => node.contains(suggestion)) ||
      suggestion.closest('div.suggest_list_area') || document.body;
    await clickAndWaitForChange(suggestion, suggestionArea, '候補の選択');

    log('「決定」をクリック');
    const decideButton = await waitFor(() => findDecideButton(ancestors), 5000, '「決定」ボタン');
    clickElement(decideButton);
    await waitUntilGone(() => isVisible(decideButton), '「決定」ボタン');

    log('絞り込みを実行');
    const submit = await waitFor(() => findVisible('div.filter_submit'), 5000, '絞り込み実行ボタン');
    clickElement(submit.querySelector('span') || submit);
  }

  // ===== 実行制御 =====

  async function runQuickFilter(key, reloaded = false) {
    if (running) return;
    if (!deptCode) {
      showToast('部門コードが未設定です。拡張機能のポップアップで設定してください', 'error');
      return;
    }
    running = true;
    startTime = Date.now();
    const target = TARGETS[key];

    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ key, ts: Date.now() }));
      showToast(`${target.label}を開いています…`);
      const navigated = await navigateTo(target);
      sessionStorage.removeItem(PENDING_KEY);

      showToast(`部門「${deptCode}」で絞り込み中…`);
      await applyDeptFilter(navigated || reloaded);
      showToast(`${target.label}を部門「${deptCode}」で絞り込みました`, 'success');
      console.log(`${target.label}を部門「${deptCode}」で絞り込みました`);
    } catch (error) {
      sessionStorage.removeItem(PENDING_KEY);
      showToast(`自動絞り込みに失敗しました: ${error.message}`, 'error');
      console.error('自動絞り込みエラー:', error);
    } finally {
      running = false;
    }
  }

  // URL直接遷移でページが再読み込みされた場合に続きを実行
  function resumePending() {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY));
    } catch {
      // 壊れた値は無視
    }
    sessionStorage.removeItem(PENDING_KEY);
    if (!pending || Date.now() - pending.ts > PENDING_TTL) return;

    const target = TARGETS[pending.key];
    if (target && location.pathname === target.path) {
      runQuickFilter(pending.key, true);
    }
  }

  // ===== UI =====

  let toastTimer = null;

  function showToast(message, type = 'info') {
    let toast = document.getElementById('rrk-qf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rrk-qf-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `rrk-qf-toast-${type}`;

    if (toastTimer) clearTimeout(toastTimer);
    if (type !== 'info') {
      toastTimer = setTimeout(() => toast.remove(), type === 'error' ? 8000 : 3000);
    }
  }

  function createToolbar() {
    const bar = document.createElement('div');
    bar.id = 'rrk-quick-filter';

    Object.keys(TARGETS).forEach(key => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rrk-qf-button';
      button.dataset.target = key;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        runQuickFilter(key);
      });
      bar.appendChild(button);
    });

    updateButtonLabels(bar);
    return bar;
  }

  function updateButtonLabels(bar = document.getElementById('rrk-quick-filter')) {
    if (!bar) return;
    bar.querySelectorAll('.rrk-qf-button').forEach(button => {
      const target = TARGETS[button.dataset.target];
      if (deptCode) {
        button.textContent = `${target.label} ${deptCode}`;
        button.title = `${target.label}を部門「${deptCode}」で絞り込んで開きます`;
      } else {
        button.textContent = `${target.label}（部門未設定）`;
        button.title = '拡張機能のポップアップで部門コードを設定してください';
      }
    });
  }

  // ヘッダーのメニューの右隣にボタンを配置（ヘッダーが見つからなければ画面右下に表示）
  function ensureToolbar() {
    if (!document.body) return;
    const nav = document.querySelector('#appHeader nav');
    let bar = document.getElementById('rrk-quick-filter');
    if (bar && (nav ? nav.nextElementSibling === bar : bar.parentElement === document.body)) return;

    if (!bar) bar = createToolbar();
    if (nav) {
      bar.classList.remove('rrk-qf-floating');
      nav.insertAdjacentElement('afterend', bar);
    } else {
      bar.classList.add('rrk-qf-floating');
      document.body.appendChild(bar);
    }
  }

  // ===== 初期化 =====

  if (chrome.runtime?.id) {
    chrome.storage.sync.get(['quickFilterDept'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('部門コードの読み込みエラー:', chrome.runtime.lastError);
        return;
      }
      deptCode = result.quickFilterDept || DEFAULT_DEPT;
      updateButtonLabels();
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.quickFilterDept) {
        deptCode = changes.quickFilterDept.newValue || DEFAULT_DEPT;
        updateButtonLabels();
      }
    });
  }

  ensureToolbar();
  setInterval(ensureToolbar, 1000); // SPAの画面切り替えでヘッダーが再描画されても復元
  resumePending();
})();
