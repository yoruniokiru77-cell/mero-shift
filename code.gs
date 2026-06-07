// ============================================================
// シフト管理システム GAS - Supabase版
// 役割：LINE Webhook受信のみ
// ============================================================

const SUPABASE_URL  = 'https://ikzctvohinssktfgspny.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlremN0dm9oaW5zc2t0ZmdzcG55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTEyODMsImV4cCI6MjA5NDI2NzI4M30.xcrT6Rt2_AUpUnBHC4xkEFefUsIfYdKqsCsyqXpa8yI';
const LINE_CHANNEL_ACCESS_TOKEN = 'CWGuXJHFd9cnHcBOn+AU5H6X+Gi0Zm1QbdO55D4iVcmx2npJPNM+cMkBA7uxTf0ILtsC85+BhpGMPiCqksuXy63j1f6ZncKcChLx0o7MdK0YNybpHQUp8WHf869BxU1bvofhuxtAAkFc8LbItG0p4gdB04t89/1O/w1cDnyilFU=';
const FRONTEND_URL  = 'https://sage-souffle-5a2376.netlify.app';

// ── Supabase REST API ────────────────────────
function sbGet(table, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + '?' + (query || 'select=*');
  const res = UrlFetchApp.fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function sbPost(table, body) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'post',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return res.getResponseCode();
}

// IDを指定して特定カラムを更新（PATCH）
function sbPatch(table, id, body) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
    method: 'patch',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return res.getResponseCode();
}

function sbDelete(table, query) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    method: 'delete',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    },
    muteHttpExceptions: true
  });
  return res.getResponseCode();
}

// ── LINE メッセージ送信 ──────────────────────
function replyLine(replyToken, text) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }]
      }),
      muteHttpExceptions: true
    });
  } catch(e) { Logger.log('replyLine error: ' + e); }
}

function pushLine(userId, text) {
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text }]
      }),
      muteHttpExceptions: true
    });
    Logger.log('pushLine status:' + res.getResponseCode() + ' body:' + res.getContentText().slice(0,200));
    return res.getResponseCode();
  } catch(e) { Logger.log('pushLine error: ' + e); return 0; }
}

// ── トークン生成 ─────────────────────────────
function generateToken(userId, name) {
  const token   = Utilities.getUuid().replace(/-/g,'');
  const expires = Date.now() + 72 * 60 * 60 * 1000; // 72時間

  // 古いトークンを削除
  sbDelete('tokens', 'user_id=eq.' + encodeURIComponent(userId));

  // 新しいトークンを保存
  sbPost('tokens', { token, user_id: userId, name, expires_at: expires });

  return token;
}

// ── LINE Webhookメッセージ処理 ───────────────
function handleMessage(userId, text, replyToken) {
  const reply = (msg) => replyToken ? replyLine(replyToken, msg) : pushLine(userId, msg);

  // ── ログインコマンド ──
  if (text === 'ログイン' || text === 'login') {
    const rows = sbGet('casts', 'user_id=eq.' + encodeURIComponent(userId) + '&select=name,real_name');
    if (!rows || !rows.length || !rows[0].name) {
      reply('まだLINEが紐づいていません。\n本名（フルネーム）をメッセージで送ってください。');
      return;
    }
    const name  = rows[0].name;  // 源氏名（内部ID）
    const token = generateToken(userId, name);
    reply('こちらのURLからログインしてください（72時間有効）:\n' + FRONTEND_URL + '?token=' + token);
    return;
  }

  // ── すでにLINE登録済みの場合 ──
  const existing = sbGet('casts', 'user_id=eq.' + encodeURIComponent(userId) + '&select=name,real_name');
  if (existing && existing.length) {
    reply('すでに登録済みです。\n「ログイン」と送るとシフト画面に入れます。');
    return;
  }

  // ── 本名で検索してLINE紐づけ ──
  const matched = sbGet('casts', 'real_name=eq.' + encodeURIComponent(text) + '&select=id,name,real_name,user_id');

  if (matched && matched.length) {
    // 既存レコードに一致
    if (matched[0].user_id) {
      reply('このキャストはすでに別のLINEアカウントに紐づいています。\n管理者にご連絡ください。');
      return;
    }
    sbPatch('casts', matched[0].id, { user_id: userId, line_name: text });
    reply(matched[0].real_name + ' さん、LINE登録が完了しました！\n「ログイン」と送るとシフト申請画面に入れます。');
  } else {
    // 一致なし → 本名で新規登録（源氏名は本名と同じで仮登録）
    sbPost('casts', { name: text, real_name: text, user_id: userId, line_name: text });
    reply(text + ' さん、新規登録が完了しました！\n「ログイン」と送るとシフト申請画面に入れます。\n※源氏名は管理者が後で設定します。');
  }
}

function handleFollow(userId) {
  pushLine(userId, 'ご登録ありがとうございます！\n本名（フルネーム）をメッセージで送ってください。\n\n例：山田 花子');
}

// ── doPost (LINE Webhook) ────────────────────
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const events = body.events || [];
    events.forEach(ev => {
      const userId = ev.source && ev.source.userId;
      if (!userId) return;
      if (ev.type === 'follow') {
        handleFollow(userId);
      } else if (ev.type === 'message' && ev.message.type === 'text') {
        handleMessage(userId, ev.message.text.trim(), ev.replyToken);
      }
    });
  } catch(e) { Logger.log('doPost error: ' + e); }
  return ContentService.createTextOutput('OK');
}

// ============================================================
// 明細書き込み
// 対象スプレッドシート: 1HpZp_WhedKVJdKej_EBiTJyrmtEgQWJgrk_wbymyYOc
// ============================================================
function writePayslip(params) {
  const PAYSLIP_SS_ID = '1HpZp_WhedKVJdKej_EBiTJyrmtEgQWJgrk_wbymyYOc';
  try {
    const ss = SpreadsheetApp.openById(PAYSLIP_SS_ID);
    const sheets   = ss.getSheets();
    let targetSheet = null;
    const realName  = String(params.realName || '').trim();

    // 完全一致を優先、なければ部分一致
    for (const s of sheets) {
      if (s.getName() === realName) { targetSheet = s; break; }
    }
    if (!targetSheet) {
      for (const s of sheets) {
        if (s.getName().includes(realName) || realName.includes(s.getName())) {
          targetSheet = s; break;
        }
      }
    }
    if (!targetSheet) {
      return { ok: false, error: '「' + realName + '」のシートが見つかりません。シート名を確認してください。' };
    }

    // 月情報をパース（例: "2026-04" → 令和8年4月）
    const monthStr  = String(params.month || '');
    const year      = parseInt(monthStr.slice(0, 4)) || new Date().getFullYear();
    const monthNum  = parseInt(monthStr.slice(5, 7)) || new Date().getMonth() + 1;
    const reiwaYear = year - 2018;
    const lastDay   = new Date(year, monthNum, 0).getDate();
    const periodText = '令和' + reiwaYear + '年' + monthNum + '月1日〜' + monthNum + '月' + lastDay + '日';

    const pts1       = Number(params.pts1)       || 0;
    const pts2       = Number(params.pts2)       || 0;
    const payTotal   = Number(params.payTotal)   || 0;
    const dailyTotal = Number(params.dailyTotal) || 0;

    // 書き込み
    const ptsTotal  = pts1 + pts2;                    // 合計ポイント
    const netPay    = payTotal - dailyTotal;           // C8 - C11 = 実支給額

    targetSheet.getRange('A2').setValue(periodText);  // 期間
    targetSheet.getRange('H28').setValue(ptsTotal);   // 前半+後半ポイント合計
    targetSheet.getRange('C8').setValue(payTotal);    // 給料合計（バック計算後）
    targetSheet.getRange('C11').setValue(dailyTotal); // 日当合計
    targetSheet.getRange('C5').setValue(netPay);      // C8 - C11 の実支給額

    return { ok: true, sheetName: targetSheet.getName(), period: periodText };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}


// ── doGet: フロントからのLINE通知リクエストを受け取る ──
function doGet(e) {
  const params = e.parameter;

  // 明細書き込みリクエスト
  if (params.action === 'writePayslip') {
    try {
      const p = JSON.parse(params.params || '{}');
      const res = writePayslip(p);
      const output = ContentService.createTextOutput(JSON.stringify({success: res.ok, data: res}));
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    } catch(err) {
      const output = ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()}));
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }
  }

  // LINE通知リクエスト
  if (params.action === 'notifyLine') {
    try {
      const p = JSON.parse(params.params || '{}');
      if (p.userId && p.message) pushLine(p.userId, p.message);
    } catch(err) { Logger.log('notifyLine error: ' + err); }
    const output = ContentService.createTextOutput(JSON.stringify({success:true}));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }

  const output = ContentService.createTextOutput(JSON.stringify({success:true, message:'GAS running'}));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── シフト確定通知（フロントから呼び出し用）──
// フロントがシフト承認時にこのエンドポイントを叩いてLINE通知を送る
function doPost_notify(params) {
  // フロントからPOSTで呼ばれる通知用（LINE push）
  const userId   = params.userId;
  const message  = params.message;
  if (userId && message) pushLine(userId, message);
  return { ok: true };
}
