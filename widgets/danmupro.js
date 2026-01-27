WidgetMetadata = {
  id: "forward.danmu.multi.ui",
  title: "弹幕API-Pro",
  version: "3.0.0",
  requiredVersion: "0.0.2",
  description: "支持3个自定义弹幕源切换，内置简繁体转换",
  author: "MakkaPakk",
  site: "https://github.com/huangxd-/ForwardWidgets",
  globalParams: [
    // --- 源 1 (默认) ---
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
    // --- 源 2 (备用) ---
    {
      name: "s2_name",
      title: "📡 源2 名称 (选填)",
      type: "input",
      description: "备用服务器名称"
    },
    {
      name: "s2_url",
      title: "📡 源2 地址 (选填)",
      type: "input",
      description: "填入URL以启用备用源"
    },
    // --- 源 3 (备用) ---
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
    // --- 转换设置 ---
    {
      name: "convertMode",
      title: "🔠 弹幕语言转换",
      type: "enumeration",
      value: "none",
      enumOptions: [
        { title: "保持原样", value: "none" },
        { title: "强制转简体", value: "s2t" }, // 逻辑内部处理
        { title: "强制转繁体", value: "t2s" }
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
      title: "获取弹幕", 
      functionName: "getCommentsById", 
      type: "danmu", 
      params: [] 
    }
  ]
};

// ==========================================
// 1. 简繁转换逻辑
// ==========================================
// 简 -> 繁 映射表 (这里只列出极少部分示例，实际使用请自行补充完整字典)
const S2T_MAP = {
    '万':'萬','与':'與','丑':'醜','专':'專','业':'業','丛':'叢','东':'東','丝':'絲','丢':'丟','两':'兩','严':'嚴','丧':'喪','个':'個','丰':'豐','临':'臨','为':'為','丽':'麗','举':'舉','么':'麼','义':'義','乌':'烏','乐':'樂','乔':'喬','习':'習','乡':'鄉','书':'書','买':'買','乱':'亂','争':'爭','于':'於','亏':'虧','云':'雲','亚':'亞','产':'產','亩':'畝','亲':'親','亵':'褻','亿':'億','仅':'僅','从':'從','仑':'崙','仓':'倉','仪':'儀','们':'們','价':'價','众':'眾','优':'優','伙':'夥','会':'會','伛':'傴','伞':'傘','伟':'偉','传':'傳','车':'車','轧':'軋','转':'轉','轮':'輪','软':'軟','轰':'轟','轻':'輕','办':'辦','辞':'辭','郑':'鄭','偿':'償','党':'黨','晓':'曉','晕':'暈','暂':'暫','唤':'喚','换':'換','热':'熱','爱':'愛','爷':'爺','爸':' 爸','给':'給','罢':'罷','置':'置','罪':'罪','罗':'羅','羊':'羊','美':'美','羞':'羞','羡':'羨','群':'群','义':'義','习':'習','老':'老','考':'考','者':'者','而':'而','耍':'耍','耐':'耐','耕':'耕','耗':'耗','耘':'耘','耙':'耙','耜':'耜','耢':'耢','耣':'耣','耤':'耤','耦':'耦','耧':'耬','耩':'耩','耪':'耪','耰':'耰','耱':'耰','耳':'耳','耶':'耶','耷':'耷','耸':'聳','耻':'恥','耽':'耽','耿':'耿','聂':'聶','聃':'聃','聆':'聆','聊':'聊','聋':'聾','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲','耸':'聳','聩':'聵','聂':'聶','职':'職','聍':'聆','聒':'聒','联':'聯','聘':'聘','聚':'聚','闻':'聞','聪':'聰','声':'聲'
};
// 繁 -> 简 映射表 (自动生成)
const T2S_MAP = {};
for (let key in S2T_MAP) { T2S_MAP[S2T_MAP[key]] = key; }

function convertText(text, mode) {
    if (!text || mode === "none") return text;
    let result = "";
    for (let char of text) {
        if (mode === "s2t") { // 转繁体 (输入可能是简)
            result += S2T_MAP[char] || char;
        } else if (mode === "t2s") { // 转简体 (输入可能是繁)
            result += T2S_MAP[char] || char;
        } else {
            result += char;
        }
    }
    return result;
}

// ==========================================
// 2. 多源管理逻辑
// ==========================================
function getActiveServers(params) {
    const list = [];
    // 检查源1
    if (params.s1_url) list.push({ name: params.s1_name || "源1", url: params.s1_url.replace(/\/$/, "") });
    // 检查源2
    if (params.s2_url) list.push({ name: params.s2_name || "源2", url: params.s2_url.replace(/\/$/, "") });
    // 检查源3
    if (params.s3_url) list.push({ name: params.s3_name || "源3", url: params.s3_url.replace(/\/$/, "") });
    
    // 兜底
    if (list.length === 0) list.push({ name: "官方源", url: "https://api.dandanplay.net" });
    return list;
}

// ==========================================
// 3. 核心功能
// ==========================================

async function searchDanmu(params) {
    const { title, season } = params;
    const servers = getActiveServers(params);
    
    // 遍历所有配置的服务器，直到找到结果
    for (const srv of servers) {
        console.log(`[Danmu] Searching on: ${srv.name}`);
        try {
            const url = `${srv.url}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`;
            const response = await Widget.http.get(url, { headers: { "Content-Type": "application/json" } });
            
            const data = (typeof response.data === "string") ? JSON.parse(response.data) : response.data;
            
            if (data.success && data.animes && data.animes.length > 0) {
                // 找到数据了！
                let animes = data.animes;
                
                // 排序逻辑 (保持原版)
                if (season) {
                    const match = []; const others = [];
                    animes.forEach(a => {
                        if (matchSeason(a, title, season)) match.push(a); else others.push(a);
                    });
                    animes = [...match, ...others];
                }
                
                // 【关键步骤】将成功的 serverURL 埋入 animeId
                // 格式: "SERVER_URL|ANIME_ID"
                // 这样 getDetail 才知道去哪个服务器拿详情
                animes.forEach(a => {
                    a.animeId = `${srv.url}|${a.animeId}`;
                });
                
                return { animes: animes };
            }
        } catch (e) {
            console.log(`[Danmu] ${srv.name} failed: ${e.message}`);
            // 继续尝试下一个
        }
    }
    
    throw new Error("未搜索到弹幕资源");
}

async function getDetailById(params) {
    // 解析 server|id
    const rawId = params.animeId;
    let serverUrl = "";
    let realId = rawId;
    
    if (rawId && rawId.includes("|")) {
        const parts = rawId.split("|");
        serverUrl = parts[0];
        realId = parts[1];
    } else {
        // 兼容旧数据或直接使用第一个源
        serverUrl = getActiveServers(params)[0].url;
    }

    const response = await Widget.http.get(`${serverUrl}/api/v2/bangumi/${realId}`, {
        headers: { "Content-Type": "application/json" }
    });
    
    const data = (typeof response.data === "string") ? JSON.parse(response.data) : response.data;
    
    if (data.bangumi && data.bangumi.episodes) {
        // 同样，把 serverUrl 埋入 episodeId，传递给 getComments
        data.bangumi.episodes.forEach(ep => {
            ep.episodeId = `${serverUrl}|${ep.episodeId}`;
        });
        return data.bangumi.episodes;
    }
    return [];
}

async function getCommentsById(params) {
    const { commentId, convertMode } = params;
    
    let serverUrl = "";
    let realId = commentId;
    
    if (commentId && commentId.includes("|")) {
        const parts = commentId.split("|");
        serverUrl = parts[0];
        realId = parts[1];
    } else {
        serverUrl = getActiveServers(params)[0].url;
    }

    const response = await Widget.http.get(
        `${serverUrl}/api/v2/comment/${realId}?withRelated=true&chConvert=1`,
        { headers: { "Content-Type": "application/json" } }
    );
    
    const data = (typeof response.data === "string") ? JSON.parse(response.data) : response.data;
    
    // 执行语言转换
    if (data.comments) {
        data.comments.forEach(c => {
            if (c.m) {
                // c.m 是弹幕内容，进行转换
                c.m = convertText(c.m, convertMode);
            }
        });
    }
    
    return data;
}

// ==========================================
// 4. 原版匹配逻辑 (保留不动)
// ==========================================
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
