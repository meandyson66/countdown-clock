const SETTINGS = {
  omissionMax: 80,
  recentSkip: 2,
  zodiacWindow: 30,
  zodiacTop: 4,
  zodiacCap: 2,
  momentumWindow: 10,
  recommendMin: 6,
  recommendMax: 8,
  budget: 70,
  payoutOdds: 47,
  backtestWindow: 30,
  longWindow: 200,
  riskStreak: 5,
  zodiacWeight: 2,
  colorWeight: 1.5,
  parityWeight: 1.5,
};
SETTINGS.recommendCount = SETTINGS.recommendMax;

const KINDS = ["new", "old", "hk"];
const VALID_VIEWS = new Set(["all", ...KINDS]);
const SOURCES = {
  new: { code: "macaujc2", name: "新澳门 21:32", clock: "21:32", payoutOdds: SETTINGS.payoutOdds },
  old: { code: "macaujc", name: "老澳门 22:32", clock: "22:32", payoutOdds: SETTINGS.payoutOdds },
  hk: {
    code: "hkjc",
    name: "香港 21:30",
    clock: "21:30",
    payoutOdds: 47.5,
    drawDays: [0, 2, 4, 6],
    scheduleNote: "开奖日：周二、周四、周六、日 21:30（香港时间）",
    // 备用接入：HK_API.historyUrl(year, page) 或改为其他 code
  },
};
/** @type {{ historyUrl?: (year: number, page: number) => string }} */
const HK_API = {};
const ZODIACS = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
const TRAD = { "雞": "鸡", "龍": "龙", "馬": "马", "豬": "猪" };
const RED = new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
const BLUE = new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);
const ROW_KEY = "macau-ledger-v1";
const STAKE_KEY = "macau-stake-v1";
const CACHE_KEY = "macau-cache-v1";

let view = "all";
let isCalculating = false;
let isRendering = false;
let payloads = [];
let rows = [];
let pollTimer = 0;
const pendingHttp = {};
let httpSeq = 0;

function mod(value, base) {
  return ((value % base) + base) % base;
}
function pad2(number) {
  return String(number).padStart(2, "0");
}
function colorName(number) {
  if (RED.has(number)) return "红";
  if (BLUE.has(number)) return "蓝";
  return "绿";
}
function parityName(number) {
  return number % 2 ? "单" : "双";
}
function tone(name) {
  return { "红": "red", "蓝": "blue", "绿": "green" }[name] || "";
}
function canonZodiac(text) {
  const value = String(text || "").trim();
  return TRAD[value] || value;
}
function yearIndex(draw) {
  for (let i = 0; i < draw.nums.length; i += 1) {
    const zodiac = draw.zodiacs[i];
    const at = ZODIACS.indexOf(zodiac);
    if (at >= 0) return mod(at + draw.nums[i] - 1, 12);
  }
  return 0;
}
function zodiacOf(index, number) {
  return ZODIACS[mod(index - (number - 1), 12)];
}
function moneyClass(text) {
  const value = Number(text);
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "up" : "down";
}
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
function nowIso() {
  const date = new Date(Date.now() + 8 * 3600000);
  return date.toISOString().replace("Z", "+08:00").slice(0, 19) + "+08:00";
}
function loadRows() {
  try { return JSON.parse(localStorage.getItem(ROW_KEY) || "[]"); }
  catch (error) { return []; }
}
function saveRows(next) {
  rows = next;
  localStorage.setItem(ROW_KEY, JSON.stringify(next));
}
function readStake() {
  const amount = Number(localStorage.getItem(STAKE_KEY));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}
function saveStake(amount) {
  localStorage.setItem(STAKE_KEY, String(Math.round(amount * 100) / 100));
}

function paint() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function copyList(list) {
  const arr = [];
  const length = list.length;
  for (let i = 0; i < length; i += 1) arr.push(list[i]);
  return arr;
}

function safeSort(list, cmp) {
  const arr = copyList(list);
  const total = arr.length;
  if (total < 2) return arr;
  const aux = [];
  for (let i = 0; i < total; i += 1) aux.push(arr[i]);
  for (let width = 1; width < total; width += width) {
    for (let start = 0; start < total; start += width * 2) {
      const mid = start + width < total ? start + width : total;
      const end = start + width * 2 < total ? start + width * 2 : total;
      let left = start;
      let right = mid;
      for (let cursor = start; cursor < end; cursor += 1) {
        if (left < mid && (right >= end || cmp(arr[left], arr[right]) <= 0)) {
          aux[cursor] = arr[left];
          left += 1;
        } else {
          aux[cursor] = arr[right];
          right += 1;
        }
      }
    }
    for (let i = 0; i < total; i += 1) arr[i] = aux[i];
  }
  return arr;
}

function maxValue(obj) {
  let peak = 0;
  for (const key in obj) {
    if (obj[key] > peak) peak = obj[key];
  }
  return peak;
}

function httpGet(url) {
  return paint().then(async () => {
    if (window.AndroidBridge && AndroidBridge.beginFetch && AndroidBridge.readChunk) {
      let head = "";
      try {
        head = AndroidBridge.beginFetch(url) || "";
      } catch (error) {
        throw new Error("原生请求异常：" + (error && error.message ? error.message : error));
      }
      if (!head.startsWith("OK")) {
        const lines = String(head || "ERR\n0\n没有返回").split("\n");
        const status = lines[1] || "0";
        const detail = lines.slice(2).join("\n") || "未知错误";
        throw new Error("HTTP " + status + " " + detail + "\n" + url);
      }
      let text = "";
      try {
        for (;;) {
          const part = AndroidBridge.readChunk();
          if (!part) break;
          text += part;
        }
      } catch (error) {
        throw new Error("读取响应失败：" + (error && error.message ? error.message : error) + "\n" + url);
      }
      if (!text) throw new Error("接口返回空内容\n" + url);
      return text;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText + "\n" + url);
      const text = await res.text();
      if (!text) throw new Error("接口返回空内容\n" + url);
      return text;
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("请求超时（10 秒）\n" + url);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

function normalize(raw) {
  if (!raw || !raw.openCode || !raw.zodiac || !raw.openTime) return null;
  const nums = String(raw.openCode).split(",").map((part) => Number(part)).filter((number) => number >= 1 && number <= 49);
  const zodiacs = String(raw.zodiac).split(",").map(canonZodiac);
  if (nums.length < 7 || zodiacs.length < nums.length) return null;
  const opened = String(raw.openTime);
  const date = opened.slice(0, 10);
  if (date.length !== 10 || date[4] !== "-" || date[7] !== "-") return null;
  const useNums = nums.slice(0, zodiacs.length);
  const useZodiacs = zodiacs.slice(0, useNums.length);
  const expect = String(raw.expect || "");
  return {
    expect,
    expectNum: /^\d+$/.test(expect) ? Number(expect) : 0,
    date,
    nums: useNums,
    zodiacs: useZodiacs,
    special: useNums[useNums.length - 1],
    specialZodiac: useZodiacs[useZodiacs.length - 1],
  };
}

async function loadDraws(kind) {
  if (kind === "hk" && typeof HK_API.historyUrl === "function") {
    return loadHongKongDrawsCustom();
  }
  const meta = SOURCES[kind];
  if (!meta || !meta.code) throw new Error("未知彩种：" + kind);
  const year = new Date().getFullYear();
  const merged = new Map();
  const errors = [];
  for (let target = year - 1; target <= year; target += 1) {
    const url = `https://history.macaumarksix.com/history/${meta.code}/y/${target}`;
    setSync("1.7 正在读取" + meta.name + " " + target);
    try {
      const text = await httpGet(url);
      let body = null;
      try {
        body = JSON.parse(text);
      } catch (error) {
        throw new Error("开奖数据解析失败 " + (error && error.message ? error.message : "") + "\n" + url);
      }
      const data = body && body.data;
      if (!Array.isArray(data)) throw new Error("开奖数据格式不对\n" + url);
      data.forEach((raw) => {
        const draw = normalize(raw);
        if (draw && draw.expect) merged.set(draw.expect, draw);
      });
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
    }
  }
  const historyList = [];
  merged.forEach(function (draw) { historyList.push(draw); });
  const history = safeSort(historyList, (a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    const later = b.expectNum || 0;
    const earlier = a.expectNum || 0;
    if (later > earlier) return 1;
    if (later < earlier) return -1;
    return 0;
  });
  if (!history.length) throw new Error(errors.join("\n") || "没有拿到开奖数据");
  return history;
}

async function loadHongKongDrawsCustom() {
  const year = new Date().getFullYear();
  const merged = new Map();
  const errors = [];
  for (let target = year - 1; target <= year; target += 1) {
    for (let page = 1; page <= 20; page += 1) {
      const url = HK_API.historyUrl(target, page);
      setSync("1.7 正在读取香港 21:30 " + target + " 第" + page + "页");
      try {
        const text = await httpGet(url);
        const body = JSON.parse(text);
        const data = body.data || body.results || body;
        if (!Array.isArray(data) || !data.length) break;
        data.forEach((raw) => {
          const draw = normalizeHongKong(raw);
          if (draw && draw.expect) merged.set(draw.expect, draw);
        });
        if (data.length < 50) break;
      } catch (error) {
        errors.push(error && error.message ? error.message : String(error));
        break;
      }
    }
  }
  const historyList = [];
  merged.forEach(function (draw) { historyList.push(draw); });
  const history = safeSort(historyList, (a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return (b.expectNum || 0) - (a.expectNum || 0);
  });
  if (!history.length) throw new Error(errors.join("\n") || "没有拿到香港开奖数据");
  return history;
}

function normalizeHongKong(raw) {
  if (raw && raw.openCode) return normalize(raw);
  if (raw && raw.special_number != null) {
    const nums = [
      raw.num1, raw.num2, raw.num3, raw.num4, raw.num5, raw.num6, raw.special_number,
    ].map(Number).filter((n) => n >= 1 && n <= 49);
    if (nums.length < 7) return null;
    const date = String(raw.draw_date || "").slice(0, 10);
    const expect = String(raw.draw_number || raw.expect || "").replace(/\//g, "");
    const expectNum = /^\d+$/.test(expect) ? Number(expect) : Number(String(expect).replace(/\D/g, "")) || 0;
    const index = 0;
    const zodiacs = nums.map((n) => zodiacOf(index, n));
    return {
      expect,
      expectNum,
      date,
      nums,
      zodiacs,
      special: nums[6],
      specialZodiac: zodiacs[6],
    };
  }
  return null;
}

function nextDrawAt(kind, now) {
  const meta = SOURCES[kind];
  if (!meta) return now;
  if (meta.drawDays && meta.drawDays.length) {
    for (let i = 0; i < 21; i += 1) {
      const day = new Date(now);
      day.setDate(day.getDate() + i);
      if (!meta.drawDays.includes(day.getDay())) continue;
      const parts = meta.clock.split(":");
      day.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      if (day > now) return day;
    }
  }
  const parts = meta.clock.split(":");
  const target = new Date(now);
  target.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

function omissionMap(history) {
  const seen = {};
  history.forEach((draw, index) => {
    if (seen[draw.special] === undefined) seen[draw.special] = index;
  });
  const map = {};
  for (let number = 1; number <= 49; number += 1) map[number] = seen[number] === undefined ? history.length : seen[number];
  return map;
}
function gapOf(omission, number, historyLength) {
  const gap = omission[number];
  if (gap >= historyLength && historyLength <= SETTINGS.omissionMax) return SETTINGS.omissionMax + 1;
  return gap;
}
function topZodiacs(history, windowSize, top) {
  const counts = {};
  history.slice(0, windowSize).forEach((draw) => {
    counts[draw.specialZodiac] = (counts[draw.specialZodiac] || 0) + 1;
  });
  return safeSort(Object.entries(counts), (a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  }).slice(0, top);
}
function scorePool(pool, history, ranked, zodiacTop, index, gaps) {
  const rankOf = {};
  ranked.forEach(([name], pos) => { rankOf[name] = pos + 1; });
  const rankedCount = Object.fromEntries(ranked);
  const windowDraws = history.slice(0, SETTINGS.momentumWindow);
  const colorCounts = { "红": 0, "蓝": 0, "绿": 0 };
  const parityCounts = { "单": 0, "双": 0 };
  windowDraws.forEach((draw) => {
    colorCounts[colorName(draw.special)] += 1;
    parityCounts[parityName(draw.special)] += 1;
  });
  const colorPeak = maxValue(colorCounts);
  const parityPeak = maxValue(parityCounts);
  const picks = pool.map((number) => {
    const zodiac = zodiacOf(index, number);
    const color = colorName(number);
    const parity = parityName(number);
    const rank = rankOf[zodiac] || zodiacTop;
    const colorGap = colorPeak - colorCounts[color];
    const parityGap = parityPeak - parityCounts[parity];
    const score = (zodiacTop + 1 - rank) * SETTINGS.zodiacWeight + colorGap * SETTINGS.colorWeight + parityGap * SETTINGS.parityWeight;
    return {
      number: pad2(number),
      zodiac,
      color,
      parity,
      omission: gaps[number],
      score: Math.round(score * 100) / 100,
    };
  });
  return safeSort(picks, (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.omission !== b.omission) return a.omission - b.omission;
    if (a.number < b.number) return -1;
    if (a.number > b.number) return 1;
    return 0;
  });
}
function balance(picks, ranked) {
  const cap = Math.max(1, SETTINGS.zodiacCap);
  const byZodiac = {};
  picks.forEach((pick) => {
    if (!byZodiac[pick.zodiac]) byZodiac[pick.zodiac] = [];
    byZodiac[pick.zodiac].push(pick);
  });
  const selected = [];
  const counts = {};
  const used = new Set();
  const missing = [];
  for (const [name] of ranked.slice(0, SETTINGS.zodiacTop)) {
    if (selected.length >= SETTINGS.recommendCount) break;
    const bucket = byZodiac[name] || [];
    if (!bucket.length) {
      missing.push(name);
      continue;
    }
    selected.push(bucket[0]);
    used.add(bucket[0].number);
    counts[name] = (counts[name] || 0) + 1;
  }
  picks.forEach((pick) => {
    if (selected.length >= SETTINGS.recommendCount) return;
    if (used.has(pick.number) || (counts[pick.zodiac] || 0) >= cap) return;
    selected.push(pick);
    used.add(pick.number);
    counts[pick.zodiac] = (counts[pick.zodiac] || 0) + 1;
  });
  const ordered = safeSort(selected, (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.omission !== b.omission) return a.omission - b.omission;
    if (a.number < b.number) return -1;
    if (a.number > b.number) return 1;
    return 0;
  });
  selected.length = 0;
  ordered.forEach((item) => selected.push(item));
  let note = `每个生肖最多 ${cap} 个`;
  if (missing.length) note += "，" + missing.join("、") + "在过滤后没有号码";
  return { selected, note };
}
function selectPicks(history) {
  if (!history.length) {
    return { picks: [], funnel: { zodiacs: [], coldDropped: 0, omissionMax: SETTINGS.omissionMax, note: "没有历史记录" } };
  }
  const omission = omissionMap(history);
  const recent = new Set(history.slice(0, SETTINGS.recentSkip).map((draw) => draw.special));
  const gaps = {};
  let coldDropped = 0;
  for (let number = 1; number <= 49; number += 1) {
    gaps[number] = gapOf(omission, number, history.length);
    if (gaps[number] > SETTINGS.omissionMax) coldDropped += 1;
  }
  const afterExtreme = [];
  for (let number = 1; number <= 49; number += 1) {
    if (gaps[number] <= SETTINGS.omissionMax && !recent.has(number)) afterExtreme.push(number);
  }
  const index = yearIndex(history[0]);
  let zodiacTop = SETTINGS.zodiacTop;
  let note = "";
  let ranked = [];
  let pool = [];
  let selected = [];
  let balanceNote = "";
  while (zodiacTop <= 12) {
    ranked = topZodiacs(history, SETTINGS.zodiacWindow, zodiacTop);
    const allowed = new Set(ranked.map(([name]) => name));
    pool = afterExtreme.filter((number) => allowed.has(zodiacOf(index, number)));
    const scored = scorePool(pool, history, ranked, zodiacTop, index, gaps);
    const balanced = balance(scored, ranked);
    selected = balanced.selected;
    balanceNote = balanced.note;
    if (selected.length >= SETTINGS.recommendMin || zodiacTop === 12) break;
    zodiacTop += 1;
    note = `按每个生肖最多 ${SETTINGS.zodiacCap} 个，前 ${SETTINGS.zodiacTop} 个生肖凑不满 ${SETTINGS.recommendMin} 个，已放宽到前 ${zodiacTop} 个生肖`;
  }
  if (zodiacTop !== SETTINGS.zodiacTop && !note) note = `已放宽到前 ${zodiacTop} 个生肖`;
  return {
    picks: selected,
    funnel: {
      zodiacs: ranked.map(([name]) => name),
      coldDropped,
      omissionMax: SETTINGS.omissionMax,
      note: [note, balanceNote].filter(Boolean).join("；"),
    },
  };
}
function backtest(history, limit) {
  let hits = 0;
  let evaluated = 0;
  let streak = 0;
  let streakOpen = true;
  for (let index = 0; index < limit; index += 1) {
    const past = history.slice(index + 1);
    if (past.length < Math.max(SETTINGS.zodiacWindow, SETTINGS.momentumWindow)) break;
    const chosen = new Set(selectPicks(past).picks.map((pick) => Number(pick.number)));
    const hit = chosen.has(history[index].special);
    evaluated += 1;
    if (hit) streakOpen = false;
    else if (streakOpen) streak += 1;
    if (hit) hits += 1;
  }
  return { hits, evaluated, streak };
}

function officialDraw(row, history) {
  const found = history.find((draw) => draw.expect === row["期号"]);
  if (found) return found;
  const index = history.findIndex((draw) => draw.expect === row["依据期号"]);
  if (index > 0) return history[index - 1];
  return null;
}
function recomputeTotals(next) {
  KINDS.forEach((kind) => {
    let total = 0;
    safeSort(next.filter((row) => row["类型"] === kind && (row["是否命中"] === "命中" || row["是否命中"] === "未中")), (a, b) => Number(a["开奖期号"] || a["期号"] || 0) - Number(b["开奖期号"] || b["期号"] || 0))
      .forEach((row) => {
        total = Math.round((total + Number(row["本期盈亏"] || 0)) * 100) / 100;
        row["累计盈亏"] = total.toFixed(2);
      });
    next.forEach((row) => {
      if (row["类型"] === kind && row["是否命中"] === "待开奖") row["累计盈亏"] = "";
    });
  });
}
function reconcile(kind, history, next) {
  next.forEach((row) => {
    if (row["类型"] !== kind || row["是否命中"] !== "待开奖") return;
    const draw = officialDraw(row, history);
    if (!draw) return;
    const numbers = new Set(String(row["推荐号码"] || "").split(/\s+/));
    const special = pad2(draw.special);
    const hit = numbers.has(special);
    const stake = Number(row["单注"] || 0);
    const spent = Number(row["投入"] || 0);
    const profit = hit ? stake * Number(row["赔率"] || 0) - spent : -spent;
    row["开奖期号"] = draw.expect;
    row["开奖特码"] = special;
    row["是否命中"] = hit ? "命中" : "未中";
    row["本期盈亏"] = (Math.round(profit * 100) / 100).toFixed(2);
  });
  recomputeTotals(next);
}
function pendingFor(kind, issue, next) {
  return next.find((row) => row["类型"] === kind && row["期号"] === issue && row["是否命中"] === "待开奖") || null;
}
function lockedPicks(numbers, history) {
  const omission = omissionMap(history);
  const index = history.length ? yearIndex(history[0]) : 0;
  return numbers.map((raw) => {
    const number = Number(raw);
    return {
      number: pad2(number),
      zodiac: zodiacOf(index, number),
      color: colorName(number),
      parity: parityName(number),
      omission: omission[number] === undefined ? history.length : omission[number],
      score: 0,
    };
  });
}
function recommend(history, kind, next, replace) {
  const latest = history[0];
  const issue = latest.expectNum ? String(latest.expectNum + 1) : "";
  const lockedRow = replace ? null : pendingFor(kind, issue, next);
  let { picks, funnel } = selectPicks(history);
  let locked = false;
  if (lockedRow) {
    const numbers = String(lockedRow["推荐号码"] || "").split(/\s+/).filter(Boolean);
    if (numbers.length) {
      picks = lockedPicks(numbers, history);
      locked = true;
      funnel.note = "本期推荐已锁定。重新计算只更新回测，不改号码。";
    }
  }
  const long = backtest(history, SETTINGS.longWindow);
  const short = backtest(history, SETTINGS.backtestWindow);
  let stake;
  let spent;
  if (locked) {
    stake = Number(lockedRow["单注"] || 0);
    spent = Number(lockedRow["投入"] || 0);
  } else {
    const manual = readStake();
    stake = manual && picks.length ? manual : Math.round((SETTINGS.budget / Math.max(picks.length, 1)) * 100) / 100;
    spent = picks.length ? Math.round(stake * picks.length * 100) / 100 : 0;
  }
  const payoutOdds = SOURCES[kind].payoutOdds ?? SETTINGS.payoutOdds;
  const net = picks.length ? Math.round((stake * payoutOdds - spent) * 100) / 100 : 0;
  const result = {
    type: kind,
    name: SOURCES[kind].name,
    issue,
    basedOn: latest.expect,
    numbers: picks,
    stake,
    spent,
    payoutOdds,
    netProfitIfHit: net,
    backtestWindow: short.evaluated,
    backtestHits: short.hits,
    longBacktestWindow: long.evaluated,
    longBacktestHits: long.hits,
    missStreak: long.streak,
    riskWarning: long.streak >= SETTINGS.riskStreak ? `【风控提示：已连错${long.streak}期，建议本期暂停观望】` : "",
    funnel,
    updatedAt: nowIso(),
    locked,
  };
  if (!locked) remember(result, next, replace);
  return result;
}
function remember(result, next, replace) {
  if (!result.issue) return;
  const numbers = result.numbers.map((item) => item.number).join(" ");
  const existing = next.find((row) => row["类型"] === result.type && row["期号"] === result.issue);
  if (existing) {
    if (!replace || existing["是否命中"] !== "待开奖") return;
    existing["推荐号码"] = numbers;
    existing["生成时间"] = result.updatedAt;
    existing["单注"] = result.stake.toFixed(2);
    existing["投入"] = result.spent.toFixed(2);
    existing["赔率"] = String(result.payoutOdds);
    existing["依据期号"] = result.basedOn;
    return;
  }
  next.push({
    "类型": result.type,
    "彩种": result.name,
    "期号": result.issue,
    "推荐号码": numbers,
    "生成时间": result.updatedAt,
    "单注": result.stake.toFixed(2),
    "投入": result.spent.toFixed(2),
    "赔率": String(result.payoutOdds),
    "依据期号": result.basedOn,
    "开奖期号": "",
    "开奖特码": "",
    "是否命中": "待开奖",
    "本期盈亏": "",
    "累计盈亏": "",
  });
}
function updatePendingStake(amount) {
  const next = loadRows();
  next.forEach((row) => {
    if (row["是否命中"] !== "待开奖") return;
    const count = String(row["推荐号码"] || "").split(/\s+/).filter(Boolean).length;
    row["单注"] = amount.toFixed(2);
    row["投入"] = (Math.round(amount * count * 100) / 100).toFixed(2);
  });
  saveRows(next);
  payloads.forEach((item) => {
    if (!item.locked) return;
    item.stake = amount;
    item.spent = Math.round(amount * item.numbers.length * 100) / 100;
    item.netProfitIfHit = Math.round((amount * item.payoutOdds - item.spent) * 100) / 100;
  });
}

function pct(hits, windowSize) {
  if (!windowSize) return "—";
  return (hits / windowSize * 100).toFixed(1) + "%";
}
function ballsHtml(payload) {
  return payload.numbers.map((item, index) => (
    `<span class="ball ${tone(item.color)}" style="animation-delay:${((index + 1) * 0.06).toFixed(2)}s">`
    + `<b class="num"><span>${escapeHtml(item.number)}</span></b>`
    + `<small>${escapeHtml(item.zodiac)} · ${escapeHtml(item.color)}</small></span>`
  )).join("");
}
function minisHtml(numbers) {
  return String(numbers || "").split(/\s+/).filter(Boolean).map((raw) => {
    const number = Number(raw);
    return `<i class="mini ${tone(colorName(number))}">${pad2(number)}</i>`;
  }).join("");
}
function stageHtml(payload) {
  const funnel = payload.funnel || {};
  const zodiacs = (funnel.zodiacs || []).join(" ") || "—";
  const badge = payload.locked
  ? `<span class="badge live"><i></i>本期已锁定</span>`
  : (payload.scheduleNote ? `<span class="badge idle">待开奖</span>` : `<span class="badge idle">本期推荐</span>`);
  const schedule = payload.scheduleNote ? `<p class="fine">${escapeHtml(payload.scheduleNote)}</p>` : "";
  const streakClass = Number(payload.missStreak || 0) >= 5 ? "down" : "";
  const cold = funnel.coldDropped == null ? "" : `<p class="fine">遗漏超过 ${funnel.omissionMax} 期的冷号已剔除 ${funnel.coldDropped} 个</p>`;
  const warning = payload.riskWarning ? `<p class="banner">${escapeHtml(payload.riskWarning)}</p>` : "";
  return `<section class="stage">
    <header class="calendar">
      <div class="cal-top"><p class="kicker">${escapeHtml(payload.name)}</p>${badge}</div>
      <div class="cal-face">
        <div><span class="cal-label">下期</span><h2 class="num">${escapeHtml(payload.issue)}</h2></div>
        <span class="count" data-draw="${SOURCES[payload.type].clock}" data-source-kind="${escapeHtml(payload.type)}"><span class="cal-label">距开奖</span><b class="tick num">--:--:--</b></span>
      </div>
    </header>
    <div class="balls">${ballsHtml(payload)}</div>
    <div class="kpis">
      <article><span>近30期胜率</span><strong class="num">${pct(payload.backtestHits, payload.backtestWindow)}</strong><em class="num">${payload.backtestHits}/${payload.backtestWindow}</em></article>
      <article><span>近200期胜率</span><strong class="num">${pct(payload.longBacktestHits, payload.longBacktestWindow)}</strong><em class="num">${payload.longBacktestHits}/${payload.longBacktestWindow}</em></article>
      <article><span>当前连错</span><strong class="num ${streakClass}">${escapeHtml(payload.missStreak)}</strong><em>期</em></article>
      <article><span>当旺生肖</span><strong class="zodiac">${escapeHtml(zodiacs)}</strong><em>前四名</em></article>
    </div>
    ${cold}${warning}${schedule}
    <p class="fine">更新于 ${escapeHtml(payload.updatedAt)}</p>
  </section>`;
}
function ledgerKinds() {
  if (view === "all") return KINDS;
  return [view];
}
function ledgerRows() {
  if (view === "all") return rows;
  return rows.filter((row) => row["类型"] === view);
}
function viewFromHash() {
  const key = (location.hash || "#all").replace(/^#/, "");
  return VALID_VIEWS.has(key) ? key : "all";
}
function syncHash(next) {
  const target = `#${next}`;
  if (location.hash !== target) history.replaceState(null, "", target);
}
function summaryHtml() {
  return ledgerKinds().map((kind) => {
    const group = rows.filter((row) => row["类型"] === kind);
    if (!group.length) return "";
    const settled = group.filter((row) => row["是否命中"] === "命中" || row["是否命中"] === "未中");
    const hits = settled.filter((row) => row["是否命中"] === "命中").length;
    const pending = group.filter((row) => row["是否命中"] === "待开奖").length;
    const ordered = safeSort(settled, (a, b) => Number(a["开奖期号"] || a["期号"] || 0) - Number(b["开奖期号"] || b["期号"] || 0));
    const total = ordered.length ? ordered[ordered.length - 1]["累计盈亏"] : "0.00";
    return `<span class="capsule"><em>${escapeHtml(group[0]["彩种"])}</em><b class="num ${moneyClass(total)}">${escapeHtml(total)}</b><small>已开奖 ${settled.length} · 命中 ${hits} · 待开奖 ${pending}</small></span>`;
  }).join("");
}
function ledgerHtml() {
  if (!rows.length) return `<section class="panel"><h2>实盘对账</h2><p class="fine">还没有记录。打开应用就会写入本期推荐，开奖后自动对账。</p></section>`;
  const filtered = ledgerRows();
  const summary = summaryHtml();
  if (!filtered.length) {
    return `<section class="panel"><div class="ledger-head"><h2>实盘对账</h2>${summary ? `<div class="capsules">${summary}</div>` : ""}</div><p class="fine">当前视图下还没有对账记录。</p></section>`;
  }
  const shown = filtered.slice().reverse().slice(0, 60);
  const body = shown.map((row) => {
    const state = row["是否命中"] || "";
    const toneName = { "命中": "hit", "未中": "miss", "待开奖": "pending" }[state] || "";
    return `<div class="row">
      <span class="name">${escapeHtml(row["彩种"])}</span>
      <span class="num issue">${escapeHtml(row["期号"])}</span>
      <span class="num nums">${escapeHtml(row["推荐号码"])}</span>
      <span class="num special">${escapeHtml(row["开奖特码"] || "—")}</span>
      <span class="state"><i class="tag ${toneName}">${escapeHtml(state)}</i></span>
      <span class="pnl">
        <span class="num period ${moneyClass(row["本期盈亏"])}"><i class="ph">本期</i>${escapeHtml(row["本期盈亏"] || "—")}</span>
        <span class="num total ${moneyClass(row["累计盈亏"])}"><i class="ph">累计</i>${escapeHtml(row["累计盈亏"] || "—")}</span>
      </span>
      <span class="minis">${minisHtml(row["推荐号码"])}</span>
    </div>`;
  }).join("");
  return `<section class="panel"><div class="ledger-head"><h2>实盘对账</h2><div class="capsules">${summaryHtml()}</div></div>
    <div class="sheet"><div class="head"><span>彩种</span><span>期号</span><span>推荐号码</span><span>特码</span><span>结果</span><span>本期盈亏</span><span>累计盈亏</span></div>${body}</div></section>`;
}
function shownPayloads() {
  if (view === "all") return payloads;
  return payloads.filter((item) => item.type === view);
}
function consoleHtml() {
  const stake = readStake();
  const value = stake ? stake.toFixed(2) : "";
  const tip = stake ? "投入 = 单注 × 号码个数，命中纯利 = 单注 × 赔率 − 投入。当前已按填写的单注计算。" : "投入 = 单注 × 号码个数，命中纯利 = 单注 × 赔率 − 投入。未保存前按总预算平分。";
  const tabs = [["all", "三期一起"], ["new", "新澳门"], ["old", "老澳门"], ["hk", "香港"]].map(([key, label]) => (
    `<a class="${key === view ? "on" : ""}" href="#${key}" data-view="${key}">${label}</a>`
  )).join("");
  const list = shownPayloads();
  const uniform = list.length < 2 || list.every((item) => item.numbers.length === list[0].numbers.length && item.payoutOdds === list[0].payoutOdds);
  const sources = uniform ? list.slice(0, 1) : list;
  const previews = sources.map((item) => {
    const title = uniform ? "" : `<span class="who">${escapeHtml(item.name)}</span>`;
    return `<div class="preview-item" data-count="${item.numbers.length}" data-odds="${item.payoutOdds}">${title}<div><span>投入总额</span><strong class="num spent">—</strong></div><div><span>预计纯利</span><strong class="num profit">—</strong></div></div>`;
  }).join("") || `<div class="preview-item" data-count="0" data-odds="0"><div><span>投入总额</span><strong class="num spent">—</strong></div></div>`;
  return `<section class="panel console">
    <div class="toolbar">
      <nav class="tabs tabs-4">${tabs}</nav>
      <div class="actions">
        <button type="button" class="ghost" id="refresh">重新计算</button>
        <button type="button" class="ghost" id="reset">重置本期</button>
      </div>
    </div>
    <form class="fund" id="stake-form">
      <label class="field" for="stake"><span>单注</span><input id="stake" class="num" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escapeHtml(value)}" required><button type="submit">保存</button></label>
      <button type="button" class="info" aria-label="金额说明">i<span class="tip">${escapeHtml(tip)}</span></button>
      <div class="previews">${previews}</div>
    </form>
    <p class="fine" id="sync">正在连接开奖数据…</p>
  </section>`;
}
function paintStake() {
  const input = document.querySelector("#stake");
  if (!input) return;
  const stake = Number(input.value);
  document.querySelectorAll(".preview-item").forEach((item) => {
    const count = Number(item.dataset.count);
    const odds = Number(item.dataset.odds);
    const spent = item.querySelector(".spent");
    const profit = item.querySelector(".profit");
    if (!spent) return;
    if (!Number.isFinite(stake) || stake <= 0 || !count) {
      spent.textContent = "—";
      if (profit) profit.textContent = "—";
      return;
    }
    const total = stake * count;
    const net = stake * odds - total;
    spent.textContent = total.toFixed(2);
    if (profit) profit.textContent = (net > 0 ? "+" : "") + net.toFixed(2);
  });
}
function tick() {
  const now = new Date();
  document.querySelectorAll("[data-draw]").forEach((el) => {
    const kind = el.dataset.sourceKind || "new";
    const target = nextDrawAt(kind, now);
    const out = el.querySelector(".tick");
    if (!out) return;
    const diff = target - now;
    if (diff <= 0) { out.textContent = "已开奖"; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    out.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  });
}
function signature() {
  return JSON.stringify(payloads.map((item) => [item.issue, item.numbers.map((pick) => pick.number), item.locked, item.missStreak, item.backtestHits, item.longBacktestHits]))
    + rows.map((row) => row["是否命中"] + row["开奖特码"] + row["推荐号码"]).join("|");
}
let painted = "";
function render(force) {
  if (isRendering) return;
  isRendering = true;
  try {
    const next = signature();
    if (!force && next === painted) {
      const sync = document.querySelector("#sync");
      if (sync) sync.textContent = "实时更新 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false });
      return;
    }
    painted = next;
    const shown = shownPayloads();
    const primary = shown[0] ? stageHtml(shown[0]) : `<p class="fine">还没有算出推荐。</p>`;
    const extra = shown.slice(1).map((item) => `<section class="panel stage-panel">${stageHtml(item)}</section>`).join("");
    document.querySelector("#app").innerHTML = `<div class="hero">${consoleHtml()}<section class="panel stage-panel">${primary}</section></div>${extra}${ledgerHtml()}`;
    bind();
    paintStake();
    tick();
  } finally {
    isRendering = false;
  }
}
function bind() {
  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const next = link.dataset.view;
      if (!VALID_VIEWS.has(next)) return;
      view = next;
      syncHash(next);
      painted = "";
      render(true);
    });
  });
  const refresh = document.querySelector("#refresh");
  const reset = document.querySelector("#reset");
  const form = document.querySelector("#stake-form");
  const info = document.querySelector(".info");
  const stake = document.querySelector("#stake");
  if (refresh) refresh.addEventListener("click", () => runRefresh(false));
  if (reset) reset.addEventListener("click", () => {
    if (window.confirm("只替换尚未开奖的本期号码。已经开奖的对账记录会保留。")) runRefresh(true);
  });
  if (info) info.addEventListener("click", () => info.classList.toggle("open"));
  if (stake) stake.addEventListener("input", paintStake);
  if (form) form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = Number(stake.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    saveStake(amount);
    updatePendingStake(amount);
    painted = "";
    render(true);
  });
}
function setSync(text) {
  const sync = document.querySelector("#sync");
  if (sync) sync.textContent = text;
  const status = document.querySelector("#status");
  if (status) status.textContent = text;
}
function nearDraw() {
  const now = new Date();
  return KINDS.some((kind) => {
    const target = nextDrawAt(kind, now);
    const diff = now - target;
    return diff > -2 * 60000 && diff < 25 * 60000;
  });
}
async function runRefresh(replace) {
  if (isCalculating) return;
  isCalculating = true;
  errorLatched = false;
  setSync(replace ? "1.7 正在重置本期…" : "1.7 正在读取最新开奖…");
  try {
    const histories = {};
    for (let i = 0; i < KINDS.length; i += 1) {
      const kind = KINDS[i];
      histories[kind] = await loadDraws(kind);
    }
    setSync("开奖已取到，正在计算…");
    await paint();
    const next = loadRows();
    const nextPayloads = [];
    for (let i = 0; i < KINDS.length; i += 1) {
      const kind = KINDS[i];
      reconcile(kind, histories[kind], next);
      const payload = recommend(histories[kind], kind, next, replace);
      if (SOURCES[kind].scheduleNote) payload.scheduleNote = SOURCES[kind].scheduleNote;
      nextPayloads.push(payload);
    }
    saveRows(next);
    payloads = nextPayloads;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ payloads: nextPayloads, rows: next }));
    render(false);
    setSync("实时更新 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false }));
  } catch (error) {
    const message = error && error.stack ? error.stack : (error && error.message ? error.message : "网络异常");
    setSync("读取失败");
    showFailure(message);
  } finally {
    isCalculating = false;
  }
}
function arm() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => { runRefresh(false).finally(arm); }, nearDraw() ? 15000 : 30000);
}
window.refreshNow = () => runRefresh(false);

let errorLatched = false;
window.onerror = (message, source, line, col, error) => {
  if (errorLatched) return true;
  const detail = error && error.stack ? error.stack : (message || "脚本异常");
  showFailure(detail);
  return true;
};
function showFailure(message) {
  if (errorLatched) return;
  errorLatched = true;
  const text = String(message || "未知错误").replace(/\s+/g, " ").slice(0, 300);
  const app = document.querySelector("#app");
  if (!app) return;
  app.innerHTML = `<section class="panel"><h2>读取失败</h2><p class="banner" id="status">${escapeHtml(text)}</p><button type="button" class="ghost" id="retry">点击重试</button></section>`;
  const retry = document.querySelector("#retry");
  if (retry) retry.addEventListener("click", () => {
    errorLatched = false;
    runRefresh(false);
  });
  setTimeout(() => {
    try { alert(text); } catch (ignore) { /* 弹窗失败时页面上仍保留错误 */ }
  }, 0);
}

function boot() {
  view = viewFromHash();
  addEventListener("hashchange", () => {
    const next = viewFromHash();
    if (next === view) return;
    view = next;
    painted = "";
    render(true);
  });
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.payloads) {
      payloads = cached.payloads;
      rows = cached.rows || [];
      render(true);
    } else {
      document.querySelector("#app").innerHTML = `<section class="panel"><h2>正在计算</h2><p class="fine" id="status">1.7 正在读取最新开奖…</p></section>`;
    }
  } catch (error) {
    document.querySelector("#app").innerHTML = `<section class="panel"><h2>正在计算</h2><p class="fine" id="status">1.7 正在读取最新开奖…</p></section>`;
  }
  runRefresh(false).finally(arm);
  setInterval(tick, 1000);
}
boot();
