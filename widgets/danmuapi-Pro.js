WidgetMetadata = {
  id: "forward.danmu.pro.online_dict",
  title: "多源弹幕",
  version: "1.0.7",
  requiredVersion: "0.0.2",
  description: "支持添加多条api并自命名&繁简互转",
  author: "MakkaPakka",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    // --- 源 1 (主源) ---
    { name: "s1_name", title: "📺 源1 名称", type: "input", value: "官方源" },
    { name: "s1_url", title: "📺 源1 地址", type: "input", value: "https://api.dandanplay.net", description: "必填" },
    // --- 源 2 (备用) ---
    { name: "s2_name", title: "📡 源2 名称", type: "input", value: "备用源" },
    { name: "s2_url", title: "📡 源2 地址", type: "input", description: "选填" },
    // --- 源 3 (备用) ---
    { name: "s3_name", title: "📡 源3 名称", type: "input" },
    { name: "s3_url", title: "📡 源3 地址", type: "input" },
    // --- 功能配置 ---
    {
      name: "convertMode",
      title: "🔠 弹幕语言转换",
      type: "enumeration",
      value: "none",
      enumOptions: [
        { title: "保持原样", value: "none" },
        { title: "全部转简体 (繁->简)", value: "t2s" },
        { title: "全部转繁体 (简->繁)", value: "s2t" }
      ]
    }
  ],
  modules: [
    { id: "searchDanmu", title: "搜索弹幕", functionName: "searchDanmu", type: "danmu", params: [] },
    { id: "getDetail", title: "获取详情", functionName: "getDetailById", type: "danmu", params: [] },
    { id: "getComments", title: "获取弹幕", functionName: "getCommentsById", type: "danmu", params: [] },
    { id: "getDanmuWithSegmentTime", title: "分段加载", functionName: "getDanmuWithSegmentTime", type: "danmu", params: [] }
  ]
};

// ==========================================
// 1. 在线字典管理系统
// ==========================================
// 使用 OpenCC 的字典数据，托管在 GitHub/jsDelivr
const DICT_URL_S2T = "https://cdn.jsdelivr.net/npm/opencc-data@1.0.3/data/STCharacters.txt";
const DICT_URL_T2S = "https://cdn.jsdelivr.net/npm/opencc-data@1.0.3/data/TSCharacters.txt";

// 内存级缓存（避免每次转换都读取 Storage）
let MEM_S2T_MAP = null;
let MEM_T2S_MAP = null;

// 初始化字典
async function initDict(mode) {
    if (mode === "none") return;
    
    // 如果内存里有了，直接用
    if (mode === "s2t" && MEM_S2T_MAP) return;
    if (mode === "t2s" && MEM_T2S_MAP) return;

    const storageKey = mode === "s2t" ? "dict_s2t_v1" : "dict_t2s_v1";
    
    // 1. 尝试从本地 Storage 读取
    let localData = await Widget.storage.get(storageKey);
    
    if (!localData) {
        // 2. 本地没有，去网络下载
        console.log(`[Dict] Downloading ${mode} dictionary...`);
        const url = mode === "s2t" ? DICT_URL_S2T : DICT_URL_T2S;
        
        try {
            const res = await Widget.http.get(url);
            let textData = res.data || res; // 应该是纯文本格式： "万\t萬\n与\t與..."
            
            if (textData && textData.length > 100) {
                // 解析文本为 Map 对象
                const mapObj = parseDictText(textData);
                // 存入 Storage (序列化)
                await Widget.storage.set(storageKey, JSON.stringify(mapObj));
                // 存入内存
                if (mode === "s2t") MEM_S2T_MAP = mapObj;
                else MEM_T2S_MAP = mapObj;
                console.log(`[Dict] ${mode} dictionary downloaded and cached.`);
            }
        } catch (e) {
            console.error(`[Dict] Download failed: ${e.message}`);
        }
    } else {
        // 3. 本地有，反序列化到内存
        try {
            const mapObj = JSON.parse(localData);
            if (mode === "s2t") MEM_S2T_MAP = mapObj;
            else MEM_T2S_MAP = mapObj;
            console.log(`[Dict] ${mode} dictionary loaded from local storage.`);
        } catch (e) {
            console.error("Dict parse error, clearing cache.");
            await Widget.storage.remove(storageKey);
        }
    }
}

// 解析 OpenCC 格式文本 (空格分隔)
function parseDictText(text) {
    const map = {};
    const lines = text.split('\n');
    for (let line of lines) {
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
            // parts[0] 是原字, parts[1] 是目标字 (可能有多个，取第一个)
            map[parts[0]] = parts[1];
        }
    }
    return map;
}

// 转换函数
function convertTextWithDict(text, mode) {
    if (!text || mode === "none") return text;
    
    const dict = (mode === "s2t") ? MEM_S2T_MAP : MEM_T2S_MAP;
    if (!dict) return text; // 字典未加载，返回原文本
    
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const mapped = dict[char];
        result += mapped ? mapped : char;
    }
    return result;
}

// ==========================================
// 2. 基础配置
// ==========================================
const API_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "ForwardWidgets/1.0.0",
    "Accept": "application/json"
};

function getActiveServers(params) {
    const list = [];
    if (params.s1_url) list.push({ name: params.s1_name || "源1", url: cleanUrl(params.s1_url) });
    if (params.s2_url) list.push({ name: params.s2_name || "源2", url: cleanUrl(params.s2_url) });
    if (params.s3_url) list.push({ name: params.s3_name || "源3", url: cleanUrl(params.s3_url) });
    if (list.length === 0) list.push({ name: "官方源", url: "https://api.dandanplay.net" });
    return list;
}

function cleanUrl(url) { return url ? url.trim().replace(/\/$/, "") : ""; }

function parseId(rawId, params) {
    let serverUrl = getActiveServers(params)[0].url;
    let realId = rawId;
    if (rawId && typeof rawId === 'string' && rawId.includes("|")) {
        const parts = rawId.split("|");
        realId = parts.pop();
        serverUrl = parts.join("|"); 
    }
    return { serverUrl, realId };
}

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch (e) { return {}; }
}

// ==========================================
// 3. 核心功能
// ==========================================

async function searchDanmu(params) {
    const { title, season } = params;
    const servers = getActiveServers(params);
    
    for (const srv of servers) {
        console.log(`[Danmu] Searching ${title} on ${srv.name}`);
        try {
            const url = `${srv.url}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`;
            const response = await Widget.http.get(url, { headers: API_HEADERS });
            const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;
            
            if (data && data.success && data.animes && data.animes.length > 0) {
                let animes = data.animes;
                if (season) {
                    const match = []; const others = [];
                    animes.forEach(a => {
                        if (matchSeason(a, title, season)) match.push(a); else others.push(a);
                    });
                    animes = [...match, ...others];
                }
                animes.forEach(a => a.animeId = `${srv.url}|${a.animeId}`);
                return { animes: animes };
            }
        } catch (e) {}
    }
    throw new Error("未搜索到弹幕资源");
}

async function getDetailById(params) {
    const { serverUrl, realId } = parseId(params.animeId, params);
    try {
        const response = await Widget.http.get(`${serverUrl}/api/v2/bangumi/${realId}`, { headers: API_HEADERS });
        const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;
        if (data && data.bangumi && data.bangumi.episodes) {
            data.bangumi.episodes.forEach(ep => {
                ep.episodeId = `${serverUrl}|${ep.episodeId}`;
            });
            return data.bangumi.episodes;
        }
    } catch(e) {}
    return [];
}

async function getCommentsById(params) {
    const { commentId, tmdbId, season, episode, convertMode } = params;
    const { serverUrl, realId } = parseId(commentId, params);
    
    if (!realId) return null;

    // 关键步骤：在获取弹幕前，先异步初始化字典
    // 虽然 await 会阻塞一点点时间，但只有第一次会慢，后面都走缓存
    await initDict(convertMode);

    try {
        const url = `${serverUrl}/api/v2/comment/${realId}?withRelated=true&chConvert=0`;
        const response = await Widget.http.get(url, { headers: API_HEADERS });
        const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;

        if (data.comments && data.comments.segmentList) {
            const storeKey = season && episode ? `${tmdbId}.${season}.${episode}` : `${tmdbId}`;
            await Widget.storage.set(storeKey, JSON.stringify(data.comments.segmentList));
            return data.comments.segmentList;
        }

        if (data.comments) {
            return processComments(data.comments, convertMode);
        }
        
        return { count: 0, comments: [] };
    } catch (e) {
        return { count: 0, comments: [] };
    }
}

async function getDanmuWithSegmentTime(params) {
    const { segmentTime, tmdbId, season, episode, convertMode } = params;
    
    // 同样，分段加载时也要确保字典已就绪
    await initDict(convertMode);

    const storeKey = season && episode ? `${tmdbId}.${season}.${episode}` : `${tmdbId}`;
    let segmentList = await Widget.storage.get(storeKey);
    
    if (typeof segmentList === 'string') segmentList = safeJsonParse(segmentList);

    if (segmentList && Array.isArray(segmentList)) {
        const time = Number(segmentTime);
        const segment = segmentList.find(item => time >= Number(item.segment_start) && time < Number(item.segment_end));
        
        if (segment) {
            try {
                const response = await Widget.http.get(segment.url, { headers: API_HEADERS, base64Data: true });
                let data = response.data;
                if (typeof data === 'string') data = safeJsonParse(data);
                
                let comments = [];
                if (data.barrage_list) comments = data.barrage_list;
                else if (Array.isArray(data)) comments = data;
                else if (data.comments) comments = data.comments;
                
                return processComments(comments, convertMode);
            } catch (e) {}
        }
    }
    return [];
}

function processComments(comments, convertMode) {
    if (!Array.isArray(comments)) return [];
    
    return comments.map(c => {
        let content = c.m || c.content;
        let time = c.p ? c.p.split(',')[0] : (c.time || c.timepoint);
        
        // 使用在线字典进行转换
        if (content) {
            content = convertTextWithDict(content, convertMode);
        }
        
        if (c.m) {
            c.m = content;
            return c;
        }
        return { m: content, p: `${time},1,25,16777215,0,0,0,0` };
    });
}

// 辅助匹配函数 (保留原版)
function matchSeason(anime, queryTitle, season) {
  if (anime.animeTitle.includes(queryTitle)) {
    const title = anime.animeTitle.split("(")[0].trim();
    if (title.startsWith(queryTitle)) {
      const afterTitle = title.substring(queryTitle.length).trim();
      if (afterTitle === '' && season.toString() === "1") return true;
      const seasonIndex = afterTitle.match(/\d+/);
      if (seasonIndex && seasonIndex[0].toString() === season.toString()) return true;
      const chineseNumber = afterTitle.match(/[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+/);
      if (chineseNumber && convertChineseNumber(chineseNumber[0]).toString() === season.toString()) return true;
    }
  }
  return false;
}

function convertChineseNumber(chineseNumber) {
  if (/^\d+$/.test(chineseNumber)) return Number(chineseNumber);
  const digits = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'壹':1,'貳':2,'參':3,'肆':4,'伍':5,'陸':6,'柒':7,'捌':8,'玖':9};
  const units = {'十':10,'百':100,'千':1000,'拾':10,'佰':100,'仟':1000};
  let result = 0; let current = 0; let lastUnit = 1;
  for (let i = 0; i < chineseNumber.length; i++) {
    const char = chineseNumber[i];
    if (digits[char] !== undefined) current = digits[char];
    else if (units[char] !== undefined) {
      const unit = units[char];
      if (current === 0) current = 1;
      if (unit >= lastUnit) result = current * unit;
      else result += current * unit;
      lastUnit = unit; current = 0;
    }
  }
  if (current > 0) result += current;
  return result;
}
