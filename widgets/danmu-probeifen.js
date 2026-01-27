WidgetMetadata = {
  id: "forward.danmu.advanced.pro",
  title: "高级弹幕 (多源+分段+转码)",
  version: "4.0.0",
  requiredVersion: "0.0.2",
  description: "支持3源切换，简繁转换，采用分段加载技术优化长视频弹幕性能",
  author: "Gemini Remix",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    // --- 源 1 ---
    {
      name: "s1_name",
      title: "📺 源1 名称",
      type: "input",
      value: "官方源"
    },
    {
      name: "s1_url",
      title: "📺 源1 地址",
      type: "input",
      value: "https://api.dandanplay.net",
      description: "必填，作为主服务器"
    },
    // --- 源 2 ---
    {
      name: "s2_name",
      title: "📡 源2 名称 (选填)",
      type: "input",
    },
    {
      name: "s2_url",
      title: "📡 源2 地址 (选填)",
      type: "input",
    },
    // --- 源 3 ---
    {
      name: "s3_name",
      title: "📡 源3 名称 (选填)",
      type: "input",
    },
    {
      name: "s3_url",
      title: "📡 源3 地址 (选填)",
      type: "input",
    },
    // --- 功能配置 ---
    {
      name: "convertMode",
      title: "🔠 弹幕语言转换",
      type: "enumeration",
      value: "none",
      enumOptions: [
        { title: "保持原样", value: "none" },
        { title: "强制转简体", value: "t2s" },
        { title: "强制转繁体", value: "s2t" }
      ]
    }
  ],
  modules: [
    { 
      id: "searchDanmu", 
      title: "搜索弹幕", 
      functionName: "searchDanmu", 
      type: "danmu", 
      params: [] 
    },
    { 
      id: "getDetail", 
      title: "获取详情", 
      functionName: "getDetailById", 
      type: "danmu", 
      params: [] 
    },
    { 
      id: "getComments", 
      title: "获取弹幕(索引)", 
      functionName: "getCommentsById", 
      type: "danmu", 
      params: [] 
    },
    // 新增：分段加载模块，Forward 会在播放时自动调用
    {
      id: "getDanmuWithSegmentTime",
      title: "分段加载",
      functionName: "getDanmuWithSegmentTime",
      type: "danmu",
      params: []
    }
  ]
};

// ==========================================
// 1. 简繁转换工具
// ==========================================
const S2T_MAP = {'万':'萬','与':'與','丑':'醜','专':'專','业':'業','丛':'叢','东':'東','丝':'絲','丢':'丟','两':'兩','严':'嚴','丧':'喪','个':'個','丰':'豐','临':'臨','为':'為','丽':'麗','举':'舉','么':'麼','义':'義','乌':'烏','乐':'樂','乔':'喬','习':'習','乡':'鄉','书':'書','买':'買','乱':'亂','争':'爭','于':'於','亏':'虧','云':'雲','亚':'亞','产':'產','亩':'畝','亲':'親','亵':'褻','亿':'億','仅':'僅','从':'從','仑':'崙','仓':'倉','仪':'儀','们':'們','价':'價','众':'眾','优':'優','伙':'夥','会':'會','伛':'傴','伞':'傘','伟':'偉','传':'傳','车':'車','轧':'軋','转':'轉','轮':'輪','软':'軟','轰':'轟','轻':'輕','办':'辦','辞':'辭','郑':'鄭','偿':'償','党':'黨','晓':'曉','晕':'暈','暂':'暫','唤':'喚','换':'換','热':'熱','爱':'愛','爷':'爺','爸':' 爸','给':'給','罢':'罷','置':'置','罪':'罪','罗':'羅','羊':'羊','美':'美','羞':'羞','羡':'羨','群':'群','义':'義','习':'習','老':'老','考':'考','者':'者','而':'而','耍':'耍','耐':'耐','耕':'耕','耗':'耗','耘':'耘','耙':'耙','耜':'耜','耢':'耢','耣':'耣','耤':'耤','耦':'耦','耧':'耬','耩':'耩','耪':'耪','耰':'耰','耱':'耰','耳':'耳','耶':'耶','耷':'耷','耸':'聳','耻':'恥','耽':'耽','耿':'耿','聂':'聶','聃':'聃','聆':'聆','聊':'聊','聋':'聾','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲'};
const T2S_MAP = {};
for (let key in S2T_MAP) { T2S_MAP[S2T_MAP[key]] = key; }

function convertText(text, mode) {
    if (!text || mode === "none") return text;
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (mode === "s2t") result += S2T_MAP[char] || char;
        else if (mode === "t2s") result += T2S_MAP[char] || char;
        else result += char;
    }
    return result;
}

// ==========================================
// 2. 多源管理 & 请求工具
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

function cleanUrl(url) { return url.trim().replace(/\/$/, ""); }

// 解析 ID 里的服务器信息 (格式: URL|ID)
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

// ==========================================
// 3. 核心功能实现
// ==========================================

async function searchDanmu(params) {
    const { title, season } = params;
    const servers = getActiveServers(params);
    
    for (const srv of servers) {
        console.log(`[Danmu] Searching ${title} on ${srv.name}`);
        try {
            const url = `${srv.url}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`;
            const response = await Widget.http.get(url, { headers: API_HEADERS });
            let data = response.data;
            if (typeof data === 'string') data = JSON.parse(data);
            
            if (data.success && data.animes && data.animes.length > 0) {
                let animes = data.animes;
                // 季数匹配排序
                if (season) {
                    const match = []; const others = [];
                    animes.forEach(a => {
                        if (matchSeason(a, title, season)) match.push(a); else others.push(a);
                    });
                    animes = [...match, ...others];
                }
                // 注入服务器地址，方便后续流程复用
                animes.forEach(a => a.animeId = `${srv.url}|${a.animeId}`);
                return { animes: animes };
            }
        } catch (e) {
            console.log(`[Danmu] ${srv.name} Error: ${e.message}`);
        }
    }
    throw new Error("未搜索到弹幕资源");
}

async function getDetailById(params) {
    const { serverUrl, realId } = parseId(params.animeId, params);
    try {
        const response = await Widget.http.get(`${serverUrl}/api/v2/bangumi/${realId}`, { headers: API_HEADERS });
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        if (data.bangumi && data.bangumi.episodes) {
            data.bangumi.episodes.forEach(ep => {
                // 传递服务器地址给 getComments
                ep.episodeId = `${serverUrl}|${ep.episodeId}`;
            });
            return data.bangumi.episodes;
        }
    } catch(e) {}
    return [];
}

/**
 * 获取弹幕入口
 * 优化点：支持分段加载协议
 */
async function getCommentsById(params) {
    const { commentId, tmdbId, season, episode } = params;
    const { serverUrl, realId } = parseId(commentId, params);
    
    if (!realId) return null;

    try {
        // 请求API，带上 chConvert=0 (不做服务端转换，由本地处理)
        const url = `${serverUrl}/api/v2/comment/${realId}?withRelated=true&chConvert=0`;
        const response = await Widget.http.get(url, { headers: API_HEADERS });
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);

        // === 核心优化：处理分段 (Segmentation) ===
        // 某些高级弹幕源（如您提供的源码中的 vod/qq 等）会返回 segmentList
        if (data.comments && data.comments.segmentList) {
            console.log("检测到分段弹幕，缓存列表...");
            
            // 构造缓存 Key
            const storeKey = season && episode ? `${tmdbId}.${season}.${episode}` : `${tmdbId}`;
            const commentIdKey = `${storeKey}.cid`;
            
            // 将分段列表存入 Forward 的临时存储
            await Widget.storage.set(storeKey, JSON.stringify(data.comments.segmentList));
            await Widget.storage.set(commentIdKey, commentId); // 记录当前使用的CID
            
            // 返回分段列表给 Forward，触发 getDanmuWithSegmentTime
            return data.comments.segmentList;
        }

        // === 普通模式：直接返回弹幕数组 ===
        if (data.comments) {
            // 进行简繁转换
            return processComments(data.comments, params.convertMode);
        }
        
        return { count: 0, comments: [] };

    } catch (e) {
        console.error("Get Comments Error: " + e.message);
        return { count: 0, comments: [] };
    }
}

/**
 * 分段加载回调
 * 当 getComments 返回 segmentList 时，Forward 会调用此函数加载具体时间段
 */
async function getDanmuWithSegmentTime(params) {
    const { segmentTime, tmdbId, season, episode, convertMode } = params;
    
    // 1. 读取缓存的分段列表
    const storeKey = season && episode ? `${tmdbId}.${season}.${episode}` : `${tmdbId}`;
    let segmentList = await Widget.storage.get(storeKey);
    
    if (typeof segmentList === 'string') segmentList = JSON.parse(segmentList);

    if (segmentList && Array.isArray(segmentList)) {
        // 2. 查找匹配当前时间段的 segment
        const time = Number(segmentTime);
        const segment = segmentList.find(item => {
            const start = Number(item.segment_start);
            const end = Number(item.segment_end);
            return time >= start && time < end;
        });

        if (segment) {
            console.log(`[Segment] Loading: ${segment.url}`);
            try {
                // 3. 请求该分段的 URL
                const response = await Widget.http.get(segment.url, { 
                    headers: API_HEADERS,
                    base64Data: true // 某些源可能是二进制/base64
                });
                
                // 4. 解析数据 (需根据具体源格式解析，这里假设是标准JSON或Dandan格式)
                let data = response.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch(e) {}
                }
                
                // 处理腾讯/优酷等特殊源的层级
                let comments = [];
                if (data.barrage_list) comments = data.barrage_list; // 腾讯/优酷常见格式
                else if (Array.isArray(data)) comments = data;
                else if (data.comments) comments = data.comments;
                
                // 简繁转换 + 格式标准化
                return processComments(comments, convertMode);
                
            } catch (e) {
                console.error("Segment Load Error: " + e.message);
            }
        }
    }
    
    return [];
}

// ==========================================
// 4. 数据处理 & 辅助函数
// ==========================================

function processComments(comments, convertMode) {
    if (!Array.isArray(comments)) return [];
    
    return comments.map(c => {
        // 兼容不同格式
        let content = c.m || c.content;
        let time = c.p ? c.p.split(',')[0] : (c.time || c.timepoint);
        
        // 简繁转换
        if (content) {
            content = convertText(content, convertMode);
        }
        
        // 如果是原始格式，直接返回修改后的
        if (c.m) {
            c.m = content;
            return c;
        }
        
        // 如果是其他格式，构造标准格式返回
        return {
            m: content,
            p: `${time},1,25,16777215,0,0,0,0` // 构造标准 p 值
        };
    });
}

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
