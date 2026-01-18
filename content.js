// 楽楽勤怠カスタマイザー - Content Script

console.log('楽楽勤怠カスタマイザー: 読み込み開始');

// デバッグ: ページのDOM構造を確認
function debugDOMStructure() {
  console.log('=== DOM構造のデバッグ ===');
  console.log('fixedTable:', document.querySelector('#fixedTable'));
  console.log('moveTable:', document.querySelector('#moveTable'));
  console.log('attendance:', document.querySelector('#attendance'));
  console.log('attendance_content_area:', document.querySelector('#attendance_content_area'));

  // テーブル要素をすべて探す
  const tables = document.querySelectorAll('table');
  console.log('ページ内のtable要素数:', tables.length);
  tables.forEach((table, index) => {
    console.log(`table[${index}]:`, table.id || '(id無し)', table.className);
  });

  // 主要な要素のクラス名をチェック
  const wrappers = document.querySelectorAll('[class*="table"]');
  console.log('table関連の要素数:', wrappers.length);
  console.log('======================');
}

// デフォルトで表示する重要な列
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

// 列のインデックスマップを構築
let columnIndexMap = {};

function buildColumnIndexMap() {
  const moveTable = document.querySelector('#moveTable');
  if (!moveTable) {
    console.log('テーブルが見つかりません');
    return;
  }

  const headers = moveTable.querySelectorAll('thead th');
  const availableColumns = [];

  headers.forEach((th, index) => {
    const div = th.querySelector('div');
    if (div) {
      let columnName = div.textContent.trim().replace(/\s+/g, '').replace(/…/g, '').replace(/<!---->/g, '');

      // title属性がある場合はそちらを優先
      const title = div.getAttribute('title');
      if (title) {
        columnName = title;
      }

      if (columnName && columnName !== '') {
        columnIndexMap[columnName] = index;
        availableColumns.push(columnName);
        console.log(`列マップ: ${columnName} -> ${index}`);
      }
    }
  });

  // 取得した列名リストをStorageに保存
  if (chrome.runtime?.id && availableColumns.length > 0) {
    chrome.storage.sync.set({ availableColumns: availableColumns }, () => {
      if (chrome.runtime.lastError) {
        console.error('列名リストの保存エラー:', chrome.runtime.lastError);
      } else {
        console.log(`${availableColumns.length}個の列名を保存しました`);
      }
    });
  }
}

// 列の表示/非表示を適用
function applyColumnVisibility(settings) {
  const moveTable = document.querySelector('#moveTable');
  if (!moveTable) return;

  console.log('列の表示/非表示を適用中...', settings);

  Object.entries(settings).forEach(([columnName, visible]) => {
    const colIndex = columnIndexMap[columnName];
    if (colIndex === undefined) {
      console.log(`列が見つかりません: ${columnName}`);
      return;
    }

    // ヘッダーとすべてのボディセルに対して適用
    const selector = `#moveTable th:nth-child(${colIndex + 1}), #moveTable td:nth-child(${colIndex + 1})`;
    const cells = document.querySelectorAll(selector);

    cells.forEach(cell => {
      if (visible) {
        cell.style.display = '';
      } else {
        cell.style.display = 'none';
      }
    });
  });
}

// 備考列の幅を適用
function applyRemarksWidth(width) {
  const moveTable = document.querySelector('#moveTable');
  if (moveTable) {
    moveTable.style.setProperty('--rrk-remarks-width', `${width}px`);
    console.log(`備考列の幅を${width}pxに設定しました`);

    // 編集モード時の備考列の幅も修正
    fixRemarksInputWidth(width);
  }
}

// 編集モード時の備考列の入力フィールドの幅を修正
function fixRemarksInputWidth(width) {
  const moveTable = document.querySelector('#moveTable');
  if (!moveTable) return;

  // 備考列のtd要素を取得（複数のクラス名パターンに対応）
  const remarksCells = moveTable.querySelectorAll('td.column_remarks, td.remark, td.edit_mode.remark');

  remarksCells.forEach(cell => {
    // td要素自体の幅を設定
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
    cell.style.maxWidth = `${width}px`;

    // table_display_areaのインラインスタイルを削除・上書き
    const displayAreas = cell.querySelectorAll('.table_display_area');
    displayAreas.forEach(displayArea => {
      displayArea.removeAttribute('style');
      displayArea.style.width = 'auto';
      displayArea.style.minWidth = `${width - 30}px`;
      displayArea.style.maxWidth = `${width - 10}px`;
      displayArea.style.boxSizing = 'border-box';
    });

    // table_edit_areaのインラインスタイルを削除・上書き
    const editAreas = cell.querySelectorAll('.table_edit_area');
    editAreas.forEach(editArea => {
      editArea.removeAttribute('style');
      editArea.style.width = 'auto';
      editArea.style.minWidth = `${width - 30}px`;
      editArea.style.maxWidth = `${width - 10}px`;
      editArea.style.boxSizing = 'border-box';
    });

    // inputフィールドのスタイルを設定
    const inputs = cell.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
      input.style.width = '100%';
      input.style.minWidth = `${width - 40}px`;
      input.style.maxWidth = '100%';
      input.style.boxSizing = 'border-box';
    });
  });

  if (remarksCells.length > 0) {
    console.log(`${remarksCells.length}個の備考セルの幅を修正しました`);
  }
}

// CSS変数で色を設定
function applyColorVariables(saturdayColor, sundayHolidayColor) {
  const root = document.documentElement;
  if (saturdayColor) {
    root.style.setProperty('--rrk-saturday-color', `rgba(${saturdayColor.r}, ${saturdayColor.g}, ${saturdayColor.b}, ${saturdayColor.a})`);
  }
  if (sundayHolidayColor) {
    root.style.setProperty('--rrk-sunday-holiday-color', `rgba(${sundayHolidayColor.r}, ${sundayHolidayColor.g}, ${sundayHolidayColor.b}, ${sundayHolidayColor.a})`);
  }
}

// 行に曜日別・選択状態別の色を適用
function applyRowColors(enableRowColors) {
  const fixedTable = document.querySelector('#fixedTable');
  const moveTable = document.querySelector('#moveTable');

  if (!fixedTable || !moveTable) {
    console.log('テーブルが見つかりません（色付け処理）');
    return;
  }

  const fixedRows = fixedTable.querySelectorAll('tbody tr');
  const moveRows = moveTable.querySelectorAll('tbody tr');

  // 色付けが無効の場合は全てのクラスを削除して終了（デフォルトの交互色に戻る）
  if (!enableRowColors) {
    fixedRows.forEach((fixedRow, index) => {
      const moveRow = moveRows[index];
      if (fixedRow) {
        fixedRow.classList.remove('rrk-saturday', 'rrk-sunday-holiday', 'rrk-weekday');
      }
      if (moveRow) {
        moveRow.classList.remove('rrk-saturday', 'rrk-sunday-holiday', 'rrk-weekday');
      }
    });
    console.log('色付け機能が無効のため、クラスを削除しました');
    return;
  }

  // 「日」列は fixedTable にあるので、そこから取得
  let dayColumnIndex = -1;
  const fixedHeaders = fixedTable.querySelectorAll('thead th');
  fixedHeaders.forEach((th, index) => {
    const div = th.querySelector('div');
    if (div && div.textContent.trim() === '日') {
      dayColumnIndex = index;
      console.log(`「日」列を fixedTable で発見: インデックス ${index}`);
    }
  });

  // 「カレンダー」列は moveTable にある
  const calendarColumnIndex = columnIndexMap['カレンダー'];

  if (dayColumnIndex === -1) {
    console.log('「日」列が見つかりません');
    return;
  }

  fixedRows.forEach((fixedRow, index) => {
    const moveRow = moveRows[index];
    if (!moveRow) return;

    // まず既存のクラスを削除
    fixedRow.classList.remove('rrk-saturday', 'rrk-sunday', 'rrk-holiday', 'rrk-sunday-holiday', 'rrk-weekday', 'rrk-selected');
    moveRow.classList.remove('rrk-saturday', 'rrk-sunday', 'rrk-holiday', 'rrk-sunday-holiday', 'rrk-weekday', 'rrk-selected');

    let isSaturday = false;
    let isSunday = false;
    let isHoliday = false;

    // 「日」列から曜日を取得（fixedTable側）
    const dayCell = fixedRow.querySelector(`td:nth-child(${dayColumnIndex + 1})`);
    if (dayCell) {
      const dayText = dayCell.textContent.trim();

      // 曜日を判定（例: "1(木)" → "(木)"を抽出）
      const dayMatch = dayText.match(/\((土|日)\)/);
      if (dayMatch) {
        const dayOfWeek = dayMatch[1];

        if (dayOfWeek === '土') {
          isSaturday = true;
        } else if (dayOfWeek === '日') {
          isSunday = true;
        }
      }
    }

    // 「カレンダー」列から祝日を判定
    if (calendarColumnIndex !== undefined) {
      const calendarCell = moveRow.querySelector(`td:nth-child(${calendarColumnIndex + 1})`);
      if (calendarCell) {
        const calendarText = calendarCell.textContent.trim();

        // 「法定外」なら祝日
        if (calendarText.includes('法定外')) {
          isHoliday = true;
        }
      }
    }

    // クラスを付与（土曜日は祝日でも土曜日色を優先）
    if (isSaturday) {
      fixedRow.classList.add('rrk-saturday');
      moveRow.classList.add('rrk-saturday');
      console.log(`行${index + 1}: 土曜日${isHoliday ? '（祝日）' : ''}`);
    } else if (isSunday || isHoliday) {
      // 日曜日または祝日は同じ色（日曜祝日色）
      fixedRow.classList.add('rrk-sunday-holiday');
      moveRow.classList.add('rrk-sunday-holiday');
      console.log(`行${index + 1}: ${isSunday && isHoliday ? '日曜日（祝日）' : isSunday ? '日曜日' : '祝日'}`);
    } else {
      // 平日の場合は平日クラスを追加（背景を白にして交互色を無効化）
      fixedRow.classList.add('rrk-weekday');
      moveRow.classList.add('rrk-weekday');
    }

    // チェックボックスの状態を確認して選択行のクラスを追加
    const checkbox = fixedRow.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox.checked) {
      fixedRow.classList.add('rrk-selected');
      moveRow.classList.add('rrk-selected');
    }
  });

  console.log('行の色付けを適用しました');
}

// チェックボックスの変更を監視して選択行のクラスを更新
function updateSelectedRowClasses() {
  const fixedTable = document.querySelector('#fixedTable');
  const moveTable = document.querySelector('#moveTable');

  if (!fixedTable || !moveTable) return;

  const fixedRows = fixedTable.querySelectorAll('tbody tr');
  const moveRows = moveTable.querySelectorAll('tbody tr');

  fixedRows.forEach((fixedRow, index) => {
    const moveRow = moveRows[index];
    if (!moveRow) return;

    const checkbox = fixedRow.querySelector('input[type="checkbox"]');
    if (checkbox) {
      if (checkbox.checked) {
        fixedRow.classList.add('rrk-selected');
        moveRow.classList.add('rrk-selected');
      } else {
        fixedRow.classList.remove('rrk-selected');
        moveRow.classList.remove('rrk-selected');
      }
    }
  });
}

// 設定を読み込んで列の表示を更新
function loadAndApplySettings(manageFlagExternally = false) {
  // 拡張機能のコンテキストが有効かチェック
  if (!chrome.runtime?.id) {
    console.log('拡張機能のコンテキストが無効です。ページをリロードしてください。');
    return;
  }

  chrome.storage.sync.get([
    'columnSettings',
    'remarksWidth',
    'availableColumns',
    'enableRowColors',
    'saturdayColor',
    'sundayHolidayColor'
  ], (result) => {
    // エラーチェック
    if (chrome.runtime.lastError) {
      console.error('設定の読み込みエラー:', chrome.runtime.lastError);
      return;
    }

    // フラグが外部で管理されていない場合のみ、ここで設定
    if (!manageFlagExternally) {
      isApplyingSettings = true;
    }

    let settings = result.columnSettings;

    // 初回アクセス時（設定が存在しない場合）はデフォルト設定を作成
    if (!settings) {
      const availableColumns = result.availableColumns || Object.keys(columnIndexMap);
      settings = {};
      availableColumns.forEach(columnName => {
        // 重要な列のみ表示、その他は非表示
        settings[columnName] = IMPORTANT_COLUMNS.includes(columnName);
      });

      // デフォルト設定を保存
      chrome.storage.sync.set({ columnSettings: settings }, () => {
        if (chrome.runtime.lastError) {
          console.error('デフォルト設定の保存エラー:', chrome.runtime.lastError);
        } else {
          console.log('デフォルト設定を作成しました');
        }
      });
    }

    const remarksWidth = result.remarksWidth || 400;
    const enableRowColors = result.enableRowColors || false;
    const saturdayColor = result.saturdayColor || { r: 224, g: 240, b: 255, a: 1 };
    const sundayHolidayColor = result.sundayHolidayColor || { r: 255, g: 237, b: 237, a: 1 };

    applyColumnVisibility(settings);
    applyRemarksWidth(remarksWidth);
    applyColorVariables(saturdayColor, sundayHolidayColor);
    applyRowColors(enableRowColors);

    // フラグが外部で管理されていない場合のみ、ここでOFF
    if (!manageFlagExternally) {
      setTimeout(() => {
        isApplyingSettings = false;
      }, 100);
    }
  });
}

// 編集モード中かどうかを判定
function isInEditMode() {
  // 「保存する」「キャンセルする」ボタンが存在するか確認
  const saveButton = Array.from(document.querySelectorAll('.footer_center span')).find(span =>
    span.textContent.trim() === '保存する'
  );
  return !!saveButton;
}

// 行のチェックボックスを取得
function getCheckboxForRow(row, fixedTable) {
  const allRows = Array.from(fixedTable.querySelectorAll('tbody tr'));
  const rowIndex = allRows.indexOf(row);

  if (rowIndex === -1) {
    // moveTableの行の場合、インデックスを計算
    const tbody = row.closest('tbody');
    const localIndex = Array.from(tbody.children).indexOf(row);
    return fixedTable.querySelector(`tbody tr:nth-child(${localIndex + 1}) input[type="checkbox"]`);
  }

  return row.querySelector('input[type="checkbox"]');
}

// クリック処理（シングルクリックとダブルクリックを区別）
function setupClickHandlers() {
  const fixedTable = document.querySelector('#fixedTable');
  const moveTable = document.querySelector('#moveTable');

  if (!fixedTable || !moveTable) {
    console.log('テーブルが見つかりません');
    return;
  }

  let clickTimer = null;
  let clickedRow = null;

  // 固定テーブル（日付列）とスクロールテーブルの両方にイベントを設定
  [fixedTable, moveTable].forEach(table => {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // 既にイベントハンドラが設定されているかチェック
    if (tbody.dataset.rrk_handlersSet === 'true') {
      console.log('イベントハンドラは既に設定されています');
      return;
    }
    tbody.dataset.rrk_handlersSet = 'true';

    // シングルクリック処理
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;

      // チェックボックス領域のクリックは無視（元の動作を維持）
      if (e.target.type === 'checkbox' ||
          e.target.classList.contains('checkbox_icon') ||
          e.target.closest('.checkbox_content') ||
          e.target.closest('.column_checkbox')) {
        return;
      }

      clickedRow = row;

      // ダブルクリック待ち
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        return; // ダブルクリックとして処理
      }

      clickTimer = setTimeout(() => {
        // シングルクリック処理
        const checkbox = getCheckboxForRow(row, fixedTable);
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('チェックボックスをトグルしました');
          // 選択行のクラスを更新
          updateSelectedRowClasses();
        }
        clickTimer = null;
      }, 100); // 100ms待ってダブルクリックでなければシングルクリック処理
    });

    // ダブルクリック処理
    tbody.addEventListener('dblclick', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;

      // タイマーをクリア
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }

      // 編集モード中は何もしない
      if (isInEditMode()) {
        console.log('編集モード中のため、ダブルクリックは無効です');
        return;
      }

      console.log('行がダブルクリックされました');

      const checkbox = getCheckboxForRow(row, fixedTable);
      if (!checkbox) return;

      // チェックボックスをチェック
      if (!checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        // 選択行のクラスを更新
        updateSelectedRowClasses();
      }

      // 編集ボタンをクリック
      setTimeout(() => {
        const editButton = Array.from(document.querySelectorAll('.footer_center span')).find(span =>
          span.textContent.trim() === '編集をする'
        );

        if (editButton && !editButton.classList.contains('button_disabled')) {
          console.log('編集ボタンをクリック');
          editButton.click();
        } else {
          console.log('編集ボタンが見つからないか無効です');
        }
      }, 100);
    });
  });

  // 同期ホバー機能: 片方のテーブルにマウスを乗せたら両方の同じ行に色をつける
  const fixedRows = fixedTable.querySelectorAll('tbody tr');
  const moveRows = moveTable.querySelectorAll('tbody tr');

  fixedRows.forEach((fixedRow, index) => {
    const moveRow = moveRows[index];
    if (!moveRow) return;

    // 既にホバーハンドラが設定されているかチェック
    if (fixedRow.dataset.rrk_hoverSet === 'true') {
      return;
    }
    fixedRow.dataset.rrk_hoverSet = 'true';
    moveRow.dataset.rrk_hoverSet = 'true';

    // fixedTable側のホバー
    fixedRow.addEventListener('mouseenter', () => {
      fixedRow.classList.add('rrk-hover');
      moveRow.classList.add('rrk-hover');
    });
    fixedRow.addEventListener('mouseleave', () => {
      fixedRow.classList.remove('rrk-hover');
      moveRow.classList.remove('rrk-hover');
    });

    // moveTable側のホバー
    moveRow.addEventListener('mouseenter', () => {
      fixedRow.classList.add('rrk-hover');
      moveRow.classList.add('rrk-hover');
    });
    moveRow.addEventListener('mouseleave', () => {
      fixedRow.classList.remove('rrk-hover');
      moveRow.classList.remove('rrk-hover');
    });
  });

  // チェックボックスの変更を監視
  const checkboxes = fixedTable.querySelectorAll('tbody input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateSelectedRowClasses();
    });
  });

  console.log('シングル/ダブルクリック機能を設定しました');
}

// テーブルが読み込まれるまで待機
function waitForTables(callback, maxAttempts = 20) {
  let attempts = 0;

  const checkTables = () => {
    attempts++;
    console.log(`テーブルチェック試行 ${attempts}/${maxAttempts}`);

    const moveTable = document.querySelector('#moveTable');
    const fixedTable = document.querySelector('#fixedTable');

    if (moveTable && fixedTable) {
      console.log('✓ テーブルが見つかりました');
      callback();
    } else {
      console.log('✗ テーブルがまだ見つかりません');
      debugDOMStructure();

      if (attempts < maxAttempts) {
        setTimeout(checkTables, 500);
      } else {
        console.error('テーブルが見つかりませんでした。ページ構造を確認してください。');
      }
    }
  };

  checkTables();
}

// 初期化
function initialize() {
  console.log('初期化開始');
  debugDOMStructure();

  waitForTables(() => {
    console.log('テーブルの初期化を開始');

    // 列マップを構築
    buildColumnIndexMap();

    // 設定を読み込んで適用
    loadAndApplySettings();

    // シングル/ダブルクリックハンドラを設定
    setupClickHandlers();

    // DOM監視を開始
    startObserver();

    console.log('初期化完了');
  });
}

// ページ読み込み完了後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initialize, 1000); // 1秒待ってから初期化
  });
} else {
  setTimeout(initialize, 1000); // 1秒待ってから初期化
}

// 設定変更を監視
chrome.storage.onChanged.addListener((changes, namespace) => {
  // 拡張機能のコンテキストが有効かチェック
  if (!chrome.runtime?.id) {
    return;
  }

  if (namespace === 'sync') {
    // 設定適用中フラグをON（MutationObserver無限ループ防止）
    isApplyingSettings = true;

    let shouldReapplyColors = false;

    if (changes.columnSettings) {
      console.log('列設定が変更されました');
      applyColumnVisibility(changes.columnSettings.newValue);
      shouldReapplyColors = true;
    }
    if (changes.remarksWidth) {
      console.log('備考列幅が変更されました');
      applyRemarksWidth(changes.remarksWidth.newValue);
    }
    if (changes.enableRowColors) {
      console.log('色付け機能が変更されました');
      shouldReapplyColors = true;
    }
    if (changes.saturdayColor || changes.sundayHolidayColor) {
      console.log('色設定が変更されました');
      const saturdayColor = changes.saturdayColor ? changes.saturdayColor.newValue : null;
      const sundayHolidayColor = changes.sundayHolidayColor ? changes.sundayHolidayColor.newValue : null;

      // 変更された色のみ更新（変更されていない場合は現在の設定を使用）
      chrome.storage.sync.get(['saturdayColor', 'sundayHolidayColor'], (result) => {
        applyColorVariables(
          saturdayColor || result.saturdayColor,
          sundayHolidayColor || result.sundayHolidayColor
        );
      });
      shouldReapplyColors = true;
    }

    if (shouldReapplyColors) {
      // enableRowColorsの最新値を取得して色付けを再適用
      chrome.storage.sync.get(['enableRowColors'], (result) => {
        applyRowColors(result.enableRowColors || false);
      });
    }

    // 設定適用完了後、少し遅延してからフラグをOFF
    setTimeout(() => {
      isApplyingSettings = false;
    }, 100);
  }
});

// デバウンス処理用のタイマー
let reapplyTimer = null;

// 設定適用中フラグ（無限ループ防止）
let isApplyingSettings = false;

// MutationObserverでDOM変更を監視（編集モード時と保存後の対応）
const observer = new MutationObserver((mutations) => {
  // 設定適用中は無限ループ防止のため処理をスキップ
  if (isApplyingSettings) {
    return;
  }

  // テーブルが再描画された場合に設定を再適用
  let shouldReapply = false;
  let shouldRebuildMap = false;
  let shouldFixRemarksInput = false;

  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      // moveTableまたはfixedTableに関連する変更を検知
      const target = mutation.target;
      if (target.id === 'moveTable' ||
          target.id === 'fixedTable' ||
          target.closest('#moveTable') ||
          target.closest('#fixedTable') ||
          target.id === 'attendance_content_area' ||
          target.closest('.list_wrapper')) {
        shouldReapply = true;

        // テーブル全体が置き換えられた場合（保存後など）
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.id === 'moveTable' || node.querySelector('#moveTable')) {
                shouldRebuildMap = true;
                console.log('テーブルが完全に再構築されました');
              }

              // 備考列の入力フィールドが追加されたかチェック
              if (node.querySelector && (
                  node.querySelector('td.column_remarks input') ||
                  node.querySelector('td.remark input') ||
                  (node.matches && node.matches('td.column_remarks, td.remark'))
                )) {
                shouldFixRemarksInput = true;
                console.log('備考列の入力フィールドが検出されました');
              }
            }
          });
        }
      }
    } else if (mutation.type === 'attributes') {
      // style属性の変更を検知（備考列の場合）
      const target = mutation.target;
      if (target.classList && (
          target.classList.contains('column_remarks') ||
          target.classList.contains('remark') ||
          target.classList.contains('table_display_area') ||
          target.classList.contains('table_edit_area')
        ) && target.closest('#moveTable')) {
        shouldFixRemarksInput = true;
        console.log('備考列のstyle属性が変更されました');
      }
    }
  });

  if (shouldReapply || shouldFixRemarksInput) {
    // デバウンス処理: 連続した変更をまとめて1回だけ処理
    if (reapplyTimer) {
      clearTimeout(reapplyTimer);
    }

    reapplyTimer = setTimeout(() => {
      console.log('テーブルが更新されました。設定を再適用します。');

      // 設定適用中フラグをON（MutationObserver無限ループ防止）
      isApplyingSettings = true;

      if (shouldRebuildMap) {
        // テーブルが再構築された場合、列マップとイベントハンドラも再構築
        buildColumnIndexMap();
        setupClickHandlers();
        console.log('イベントハンドラを再設定しました');
      }
      loadAndApplySettings(true); // フラグは外部で管理
      reapplyTimer = null;

      // 設定適用完了後、少し遅延してからフラグをOFF
      setTimeout(() => {
        isApplyingSettings = false;
      }, 100);
    }, 300);
  }
});

// オブザーバーを開始（テーブル読み込み後）
function startObserver() {
  // メインコンテンツエリアを監視
  const contentWrapper = document.querySelector('#attendance_content_area');
  if (contentWrapper) {
    observer.observe(contentWrapper, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    console.log('DOM監視を開始しました');
  } else {
    console.log('監視対象が見つかりません');
  }

  // wrapperレベルでも監視（スピナー表示などに対応）
  const wrapper = document.querySelector('#wrapper');
  if (wrapper) {
    let wrapperTimer = null;

    const wrapperObserver = new MutationObserver((mutations) => {
      // デバウンス処理
      if (wrapperTimer) {
        clearTimeout(wrapperTimer);
      }

      wrapperTimer = setTimeout(() => {
        // テーブルが存在するか確認
        const moveTable = document.querySelector('#moveTable');
        if (moveTable) {
          console.log('ページ全体の変更を検知。設定を再適用します。');

          // 設定適用中フラグをON（MutationObserver無限ループ防止）
          isApplyingSettings = true;

          buildColumnIndexMap();
          setupClickHandlers();
          loadAndApplySettings(true); // フラグは外部で管理
          console.log('イベントハンドラを再設定しました');

          // 設定適用完了後、少し遅延してからフラグをOFF
          setTimeout(() => {
            isApplyingSettings = false;
          }, 100);
        }
        wrapperTimer = null;
      }, 500);
    });

    wrapperObserver.observe(wrapper, {
      childList: true,
      subtree: true
    });
    console.log('ページ全体の監視も開始しました');
  }
}
