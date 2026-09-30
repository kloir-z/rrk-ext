const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'quickfilter.js'), 'utf8');
const PENDING_KEY = 'rrkQuickFilterPending';
const targets = {
  attendance: '/app/attendancemanagement',
  approval: '/app/applicationmanagement.approval'
};

// 実際のスクリプトを、設定読込の完了を制御できるDOM/APIモックで実行する。
function createPage(pathname, storage = new Map()) {
  const elements = new Map();
  const observers = new Set();
  const messages = [];
  const typed = [];
  const observedRoots = [];
  const delays = [];
  let submitted = 0;
  let storageCallback;
  let changeListener;
  const runtime = { id: 'test', getManifest: () => ({ version: 'test' }) };

  function element(tag = 'div') {
    return {
      tag, children: [], dataset: {}, isConnected: true, textContent: '',
      classList: { add() {}, remove() {} },
      getClientRects: () => [1],
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll(selector) {
        if (selector === '.rrk-qf-button') return this.children;
        return [];
      },
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        if (child.id) elements.set(child.id, child);
      },
      addEventListener(type, listener) { this[type] = listener; },
      dispatchEvent(event) {
        if (event.type === 'input') typed.push(this.value);
      },
      focus() {},
      click() {},
      remove() { elements.delete(this.id); this.isConnected = false; }
    };
  }

  const body = element();
  const input = element('input');
  input.placeholder = '部門名を入力・選択してください';
  input.outerHTML = '<input>';
  const area = element();
  area.parentElement = body;
  input.parentElement = area;
  const suggestion = element('span');
  suggestion.textContent = 'D001 開発部';
  suggestion.closest = () => area;
  area.contains = node => node === suggestion;
  suggestion.click = () => {
    for (const observer of [...observers]) observer.callback();
  };
  const decide = element('button');
  decide.textContent = '決定';
  decide.click = () => { decide.isConnected = false; };
  area.querySelectorAll = selector => selector === 'button' ? [decide] : [];
  const submit = element();
  submit.click = () => { submitted++; };
  const filter = element();
  const filterArea = element();
  filterArea.parentElement = body;
  filter.parentElement = filterArea;
  const document = {
    body,
    getElementById: id => elements.get(id) || null,
    createElement: element,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === 'textarea, input[type="text"]') return [input];
      if (selector === '#suggest_scroll_child li span, div.suggest_list_area li span') return [suggestion];
      if (selector === 'div.filter_index') return [filter];
      if (selector === 'div.filter_submit') return [submit];
      return [];
    }
  };
  const location = { pathname };
  const context = {
    document, location,
    chrome: {
      runtime,
      storage: {
        sync: { get(keys, callback) { storageCallback = callback; } },
        onChanged: { addListener(listener) { changeListener = listener; } }
      }
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(root) { observers.add(this); observedRoots.push(root); }
      disconnect() { observers.delete(this); }
    },
    Event: class { constructor(type) { this.type = type; } },
    MouseEvent: class { constructor(type) { this.type = type; } },
    KeyboardEvent: class { constructor(type) { this.type = type; } },
    // 操作待機だけを短縮。トーストの消去と失敗タイムアウトは通常どおり。
    setTimeout: (callback, ms) => {
      delays.push(ms);
      return setTimeout(callback, ms === 800 || ms === 700 ? 0 : ms).unref();
    },
    clearTimeout,
    setInterval() {},
    console: { log: (...args) => messages.push(args.join(' ')), error: (...args) => messages.push(args.join(' ')) }
  };
  vm.runInNewContext(source, context, { filename: 'quickfilter.js' });
  return {
    location, typed, messages, observedRoots, delays, filterArea,
    showFilter(visible) { filter.isConnected = visible; },
    setSuggestion(text, visible = true) {
      suggestion.textContent = text;
      suggestion.isConnected = visible;
    },
    get suggestionArea() { return area; },
    get submitted() { return submitted; },
    get toast() { return elements.get('rrk-qf-toast')?.textContent || ''; },
    button: key => elements.get('rrk-quick-filter').children.find(button => button.dataset.target === key),
    click(key) { this.button(key).click({ preventDefault() {}, stopPropagation() {} }); },
    load(code = 'D001', error) {
      runtime.lastError = error;
      storageCallback({ quickFilterDept: code });
      runtime.lastError = undefined;
    },
    change(code) { changeListener({ quickFilterDept: { newValue: code } }, 'sync'); }
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 30));

async function waitForResult(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, '非同期処理が完了しませんでした');
    await flush();
  }
}

for (const [key, pathname] of Object.entries(targets)) {
  test(`${key}: URL直接遷移後、設定読込を待って1回の押下で絞り込む`, async () => {
    const storage = new Map();
    const initial = createPage('/app/home', storage);
    initial.load();
    initial.click(key);
    await waitForResult(() => initial.location.href === pathname);
    assert.equal(initial.location.href, pathname);
    assert.ok(storage.has(PENDING_KEY));

    const destination = createPage(pathname, storage);
    await flush();
    assert.equal(destination.toast.includes('未設定'), false);
    assert.equal(destination.submitted, 0);
    destination.load();
    await waitForResult(() => destination.submitted === 1);
    assert.deepEqual(destination.typed, ['D001']);
    assert.equal(destination.submitted, 1);
    assert.match(destination.toast, /絞り込みました/);
    assert.equal(destination.observedRoots[0], destination.filterArea);
    assert.ok(destination.delays.includes(200));
    assert.ok(destination.delays.includes(2000));
    // 候補が正常表示される経路では800msの固定待機を入れない。
    assert.equal(destination.delays.filter(ms => ms === 800).length, 0);
    assert.equal(storage.has(PENDING_KEY), false);
    assert.deepEqual(initial.messages, []);
    assert.deepEqual(destination.messages, []);
  });
}

test('設定読込前の押下・連打を待機し、1回だけ実行する', async () => {
  const page = createPage(targets.attendance);
  page.click('attendance');
  page.click('attendance');
  await flush();
  assert.equal(page.toast.includes('未設定'), false);
  page.load();
  await waitForResult(() => page.submitted === 1);
  assert.equal(page.submitted, 1);
});

test('保存値が空なら未設定を表示し、遷移・絞り込みをしない', async () => {
  const page = createPage('/app/home');
  page.click('attendance');
  page.load('');
  await flush();
  assert.match(page.toast, /部門コードが未設定/);
  assert.equal(page.location.href, undefined);
  assert.equal(page.submitted, 0);
  // 未設定による終了後も、ポップアップの設定変更を受けて再実行できる。
  page.change('D002');
  page.click('attendance');
  await flush();
  assert.equal(page.location.href, targets.attendance);
  assert.match(page.button('attendance').textContent, /D002/);
});

test('設定読込エラーを未設定と区別し、遷移・絞り込みをしない', async () => {
  const page = createPage('/app/home');
  page.click('approval');
  page.load('', { message: 'storage unavailable' });
  await flush();
  assert.match(page.toast, /部門コードの読み込みに失敗/);
  assert.equal(page.location.href, undefined);
  assert.equal(page.submitted, 0);
});

test('期限切れの続行情報は再実行しない', async () => {
  const storage = new Map([[PENDING_KEY, JSON.stringify({ key: 'attendance', ts: Date.now() - 61000 })]]);
  const page = createPage(targets.attendance, storage);
  page.load();
  await flush();
  assert.equal(page.submitted, 0);
  assert.equal(storage.has(PENDING_KEY), false);
});

test('画面の準備待ちを表示し、絞り込み条件が現れるまでは入力しない', async () => {
  const storage = new Map([[PENDING_KEY, JSON.stringify({ key: 'approval', ts: Date.now() })]]);
  const page = createPage(targets.approval, storage);
  page.showFilter(false);
  page.load();
  await flush();
  assert.match(page.toast, /絞り込み条件の準備を待っています/);
  assert.deepEqual(page.typed, []);
  assert.equal(page.submitted, 0);
  page.showFilter(true);
  await waitForResult(() => page.submitted === 1);
  assert.deepEqual(page.typed, ['D001']);
  assert.match(page.toast, /絞り込みました/);
});

for (const [key, pathname] of Object.entries(targets)) {
  test(`${key}: 部門名だけの候補はリスト周辺を短く待つ`, async () => {
    const page = createPage(pathname);
    page.setSuggestion('開発部');
    page.load();
    page.click(key);
    await waitForResult(() => page.submitted === 1);
    assert.deepEqual(page.typed, ['D001']);
    assert.deepEqual(page.observedRoots, [page.suggestionArea, page.suggestionArea]);
    assert.equal(page.delays.includes(800), false);
    assert.equal(page.delays.includes(700), false);
    assert.ok(page.delays.includes(200));
    assert.deepEqual(page.messages, []);
  });
}

test('固定待機を省いても候補の遅延表示を待ってから選択する', async () => {
  const page = createPage(targets.approval);
  page.setSuggestion('D001 開発部', false);
  page.load();
  page.click('approval');
  await flush();
  assert.deepEqual(page.typed, ['D001']);
  assert.equal(page.submitted, 0);
  page.setSuggestion('D001 開発部');
  await waitForResult(() => page.submitted === 1);
  assert.equal(page.delays.includes(800), false);
  assert.deepEqual(page.messages, []);
});

test('候補待機がタイムアウトしたら部門コードを再入力して続行する', async () => {
  const page = createPage(targets.attendance);
  page.setSuggestion('D001 開発部', false);
  page.load();
  page.click('attendance');
  await waitForResult(() => page.typed.length === 3, 7000);
  assert.deepEqual(page.typed, ['D001', '', 'D001']);
  assert.ok(page.delays.includes(800));
  page.setSuggestion('D001 開発部');
  await waitForResult(() => page.submitted === 1);
  assert.deepEqual(page.messages, []);
});
