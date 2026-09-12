// 楽楽勤怠カスタマイザー - Popup Script

// デフォルトで表示する重要な列（content.jsと同じ）
const IMPORTANT_COLUMNS = [
  'カレンダー',
  '申請内容',
  '出社',
  '退社',
  '実働時間',
  '勤務時間',
  '残業時間',
  '備考'
];

// プリセット用の列リスト
const PRESET_COLUMNS = {
  minimal: [
    'カレンダー',
    '申請内容',
    '出社',
    '退社',
    '実働時間',
    '備考'
  ],
  basic: IMPORTANT_COLUMNS
};

// 部門クイック絞り込みのデフォルト部門コード（quickfilter.jsと同じ）
const DEFAULT_QUICK_FILTER_DEPT = '';

let currentSettings = {};
let currentRemarksWidth = 400;
let quickFilterDept = DEFAULT_QUICK_FILTER_DEPT;
let savedQuickFilterDept = DEFAULT_QUICK_FILTER_DEPT;
let availableColumns = []; // ページから取得した列名リスト

// 保存済み設定（キャンセル用）
let savedSettings = {};
let savedRemarksWidth = 400;
let savedEnableRowColors = false;
let savedSaturdayColor = { r: 224, g: 240, b: 255, a: 1 };
let savedSundayHolidayColor = { r: 255, g: 237, b: 237, a: 1 };

// 色設定のデフォルト値
let enableRowColors = false; // デフォルトはオフ
let saturdayColor = { r: 224, g: 240, b: 255, a: 1 };
let sundayHolidayColor = { r: 255, g: 237, b: 237, a: 1 };

// 未保存インジケーターの表示/非表示
function showUnsavedIndicator() {
  const indicator = document.getElementById('unsavedIndicator');
  if (indicator) {
    indicator.style.display = 'block';
  }
}

function hideUnsavedIndicator() {
  const indicator = document.getElementById('unsavedIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

// 列リストを生成
function renderColumnList(settings) {
  const columnList = document.getElementById('columnList');
  columnList.innerHTML = '';

  // 列が取得されていない場合のメッセージ
  if (availableColumns.length === 0) {
    const message = document.createElement('div');
    message.className = 'info-message';
    message.style.padding = '20px';
    message.style.textAlign = 'center';
    message.style.color = '#666';
    message.innerHTML = '列情報がまだ取得されていません。<br>出勤簿ページにアクセスしてから、もう一度設定画面を開いてください。';
    columnList.appendChild(message);
    return;
  }

  // 重要な列を先に表示
  const otherColumns = availableColumns.filter(col => !IMPORTANT_COLUMNS.includes(col));

  [...IMPORTANT_COLUMNS, ...otherColumns].forEach(columnName => {
    if (!availableColumns.includes(columnName)) return;
    if (settings[columnName] === undefined) return;

    const div = document.createElement('div');
    div.className = 'column-item';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settings[columnName];
    checkbox.dataset.column = columnName;

    checkbox.addEventListener('change', (e) => {
      currentSettings[columnName] = e.target.checked;
      showUnsavedIndicator();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(columnName));
    div.appendChild(label);
    columnList.appendChild(div);
  });
}

// 設定を読み込む
function loadSettings() {
  // 拡張機能のコンテキストが有効かチェック
  if (!chrome.runtime?.id) {
    console.error('拡張機能のコンテキストが無効です');
    return;
  }

  chrome.storage.sync.get([
    'columnSettings',
    'remarksWidth',
    'availableColumns',
    'enableRowColors',
    'saturdayColor',
    'sundayHolidayColor',
    'quickFilterDept'
  ], (result) => {
    // エラーチェック
    if (chrome.runtime.lastError) {
      console.error('設定の読み込みエラー:', chrome.runtime.lastError);
      return;
    }

    quickFilterDept = result.quickFilterDept || DEFAULT_QUICK_FILTER_DEPT;
    savedQuickFilterDept = quickFilterDept;
    document.getElementById('quickFilterDept').value = quickFilterDept;

    availableColumns = result.availableColumns || [];
    currentRemarksWidth = result.remarksWidth || 400;
    enableRowColors = result.enableRowColors || false;
    saturdayColor = result.saturdayColor || { r: 224, g: 240, b: 255, a: 1 };
    sundayHolidayColor = result.sundayHolidayColor || { r: 255, g: 237, b: 237, a: 1 };

    // 初回アクセス時（設定が存在しない場合）はデフォルト設定を作成
    if (!result.columnSettings && availableColumns.length > 0) {
      currentSettings = {};
      availableColumns.forEach(columnName => {
        currentSettings[columnName] = IMPORTANT_COLUMNS.includes(columnName);
      });
    } else {
      currentSettings = result.columnSettings || {};
    }

    // 保存済み設定をバックアップ（キャンセル用）
    savedSettings = JSON.parse(JSON.stringify(currentSettings));
    savedRemarksWidth = currentRemarksWidth;
    savedEnableRowColors = enableRowColors;
    savedSaturdayColor = JSON.parse(JSON.stringify(saturdayColor));
    savedSundayHolidayColor = JSON.parse(JSON.stringify(sundayHolidayColor));

    renderColumnList(currentSettings);

    // 備考列幅のスライダーを更新
    const slider = document.getElementById('remarksWidth');
    const valueDisplay = document.getElementById('remarksWidthValue');
    if (slider && valueDisplay) {
      slider.value = currentRemarksWidth;
      valueDisplay.textContent = `${currentRemarksWidth}px`;
    }

    // 色設定のUIを更新
    updateColorUI();
  });
}

// 色設定のUIを更新
function updateColorUI() {
  const enableCheckbox = document.getElementById('enableRowColors');
  const colorSettings = document.getElementById('colorSettings');

  enableCheckbox.checked = enableRowColors;
  if (enableRowColors) {
    colorSettings.classList.add('enabled');
  } else {
    colorSettings.classList.remove('enabled');
  }

  // 土曜日色
  document.getElementById('saturdayR').value = saturdayColor.r;
  document.getElementById('saturdayG').value = saturdayColor.g;
  document.getElementById('saturdayB').value = saturdayColor.b;
  document.getElementById('saturdayA').value = saturdayColor.a;

  // 日曜祝日色
  document.getElementById('sundayHolidayR').value = sundayHolidayColor.r;
  document.getElementById('sundayHolidayG').value = sundayHolidayColor.g;
  document.getElementById('sundayHolidayB').value = sundayHolidayColor.b;
  document.getElementById('sundayHolidayA').value = sundayHolidayColor.a;

  // プレビューを更新
  updateColorPreviews();
}

// 色のプレビューを更新
function updateColorPreviews() {
  const saturdayPreview = document.getElementById('saturdayPreview');
  const sundayHolidayPreview = document.getElementById('sundayHolidayPreview');

  saturdayPreview.style.backgroundColor = `rgba(${saturdayColor.r}, ${saturdayColor.g}, ${saturdayColor.b}, ${saturdayColor.a})`;
  sundayHolidayPreview.style.backgroundColor = `rgba(${sundayHolidayColor.r}, ${sundayHolidayColor.g}, ${sundayHolidayColor.b}, ${sundayHolidayColor.a})`;
}

// 設定を保存
function saveSettings() {
  // 拡張機能のコンテキストが有効かチェック
  if (!chrome.runtime?.id) {
    showStatus('拡張機能のコンテキストが無効です', 'error');
    return;
  }

  chrome.storage.sync.set({
    columnSettings: currentSettings,
    remarksWidth: currentRemarksWidth,
    enableRowColors: enableRowColors,
    saturdayColor: saturdayColor,
    sundayHolidayColor: sundayHolidayColor,
    quickFilterDept: quickFilterDept
  }, () => {
    // エラーチェック
    if (chrome.runtime.lastError) {
      showStatus('設定の保存に失敗しました', 'error');
      console.error('設定の保存エラー:', chrome.runtime.lastError);
      return;
    }

    showStatus('設定を保存しました', 'success');

    // 保存済み設定を更新（キャンセル用）
    savedSettings = JSON.parse(JSON.stringify(currentSettings));
    savedRemarksWidth = currentRemarksWidth;
    savedEnableRowColors = enableRowColors;
    savedSaturdayColor = JSON.parse(JSON.stringify(saturdayColor));
    savedSundayHolidayColor = JSON.parse(JSON.stringify(sundayHolidayColor));
    savedQuickFilterDept = quickFilterDept;

    // インジケーターを非表示
    hideUnsavedIndicator();

    // アクティブなタブにメッセージを送信してリロードを促す（エラーは無視）
    if (chrome.runtime?.id && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.log('タブクエリエラー:', chrome.runtime.lastError);
          return;
        }

        if (tabs[0] && tabs[0].url && tabs[0].url.includes('rakurakukintai.jp')) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'settingsUpdated' }, () => {
            // エラーを無視（content scriptがない場合）
            if (chrome.runtime.lastError) {
              console.log('Content scriptが見つかりませんが、設定は保存されました');
            }
          });
        }
      });
    }
  });
}

// キャンセル（保存済み設定に戻す）
function cancelSettings() {
  // 保存済み設定に戻す
  currentSettings = JSON.parse(JSON.stringify(savedSettings));
  currentRemarksWidth = savedRemarksWidth;
  enableRowColors = savedEnableRowColors;
  saturdayColor = JSON.parse(JSON.stringify(savedSaturdayColor));
  sundayHolidayColor = JSON.parse(JSON.stringify(savedSundayHolidayColor));
  quickFilterDept = savedQuickFilterDept;
  document.getElementById('quickFilterDept').value = quickFilterDept;

  // UIを更新
  renderColumnList(currentSettings);

  // スライダーも更新
  const slider = document.getElementById('remarksWidth');
  const valueDisplay = document.getElementById('remarksWidthValue');
  if (slider && valueDisplay) {
    slider.value = currentRemarksWidth;
    valueDisplay.textContent = `${currentRemarksWidth}px`;
  }

  // 色設定のUIも更新
  updateColorUI();

  // インジケーターを非表示
  hideUnsavedIndicator();

  showStatus('変更をキャンセルしました', 'success');
}

// リセット
function resetSettings() {
  if (confirm('設定をデフォルトに戻しますか？')) {
    // デフォルト設定を作成（重要な列のみ表示）
    currentSettings = {};
    availableColumns.forEach(columnName => {
      currentSettings[columnName] = IMPORTANT_COLUMNS.includes(columnName);
    });
    currentRemarksWidth = 400;
    enableRowColors = false;
    saturdayColor = { r: 224, g: 240, b: 255, a: 1 };
    sundayHolidayColor = { r: 255, g: 237, b: 237, a: 1 };
    quickFilterDept = DEFAULT_QUICK_FILTER_DEPT;
    document.getElementById('quickFilterDept').value = quickFilterDept;

    renderColumnList(currentSettings);

    // スライダーも更新
    const slider = document.getElementById('remarksWidth');
    const valueDisplay = document.getElementById('remarksWidthValue');
    if (slider && valueDisplay) {
      slider.value = 400;
      valueDisplay.textContent = '400px';
    }

    // 色設定のUIも更新
    updateColorUI();

    saveSettings();
  }
}

// ステータス表示
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;

  setTimeout(() => {
    status.className = 'status';
    status.textContent = '';
  }, 3000);
}

// プリセット適用
function applyPreset(presetName) {
  currentSettings = {};

  if (presetName === 'minimal') {
    // 最小限: 特定の列のみ表示
    availableColumns.forEach(columnName => {
      currentSettings[columnName] = PRESET_COLUMNS.minimal.includes(columnName);
    });
  } else if (presetName === 'basic') {
    // 基本: 重要な列のみ表示
    availableColumns.forEach(columnName => {
      currentSettings[columnName] = IMPORTANT_COLUMNS.includes(columnName);
    });
  } else if (presetName === 'all') {
    // すべて表示
    availableColumns.forEach(columnName => {
      currentSettings[columnName] = true;
    });
  }

  renderColumnList(currentSettings);
  showUnsavedIndicator();
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('cancelBtn').addEventListener('click', cancelSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);

  // プリセットボタン
  document.getElementById('presetMinimal').addEventListener('click', () => {
    applyPreset('minimal');
  });

  document.getElementById('presetBasic').addEventListener('click', () => {
    applyPreset('basic');
  });

  document.getElementById('presetAll').addEventListener('click', () => {
    applyPreset('all');
  });

  // 備考列幅のスライダー
  const remarksWidthSlider = document.getElementById('remarksWidth');
  const remarksWidthValue = document.getElementById('remarksWidthValue');

  remarksWidthSlider.addEventListener('input', (e) => {
    currentRemarksWidth = parseInt(e.target.value);
    remarksWidthValue.textContent = `${currentRemarksWidth}px`;
    showUnsavedIndicator();
  });

  // 部門クイック絞り込みの部門コード
  document.getElementById('quickFilterDept').addEventListener('input', (e) => {
    quickFilterDept = e.target.value.trim();
    showUnsavedIndicator();
  });

  // 色付け機能の有効/無効
  const enableRowColorsCheckbox = document.getElementById('enableRowColors');
  const colorSettings = document.getElementById('colorSettings');

  enableRowColorsCheckbox.addEventListener('change', (e) => {
    enableRowColors = e.target.checked;
    if (enableRowColors) {
      colorSettings.classList.add('enabled');
    } else {
      colorSettings.classList.remove('enabled');
    }
    showUnsavedIndicator();
  });

  // 土曜日色の入力
  ['saturdayR', 'saturdayG', 'saturdayB', 'saturdayA'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      saturdayColor.r = parseInt(document.getElementById('saturdayR').value) || 0;
      saturdayColor.g = parseInt(document.getElementById('saturdayG').value) || 0;
      saturdayColor.b = parseInt(document.getElementById('saturdayB').value) || 0;
      saturdayColor.a = parseFloat(document.getElementById('saturdayA').value) || 0;
      updateColorPreviews();
      showUnsavedIndicator();
    });
  });

  // 日曜祝日色の入力
  ['sundayHolidayR', 'sundayHolidayG', 'sundayHolidayB', 'sundayHolidayA'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      sundayHolidayColor.r = parseInt(document.getElementById('sundayHolidayR').value) || 0;
      sundayHolidayColor.g = parseInt(document.getElementById('sundayHolidayG').value) || 0;
      sundayHolidayColor.b = parseInt(document.getElementById('sundayHolidayB').value) || 0;
      sundayHolidayColor.a = parseFloat(document.getElementById('sundayHolidayA').value) || 0;
      updateColorPreviews();
      showUnsavedIndicator();
    });
  });
});
