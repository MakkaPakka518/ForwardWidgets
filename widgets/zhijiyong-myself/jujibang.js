WidgetMetadata = {
    id: "trakt_global_native_v2",
    title: "Trakt 全球影视榜单 (Pro)",
    author: "Makkapakka",
    description: "v2.1: 修复国产榜混入外语片问题；新增【按更新时间】和【按上映时间】排序。",
    version: "2.1.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        { 
            name: "traktClientId", 
            title: "Trakt Client ID (选填)", 
            type: "input", 
            description: "不填则使用内置高速Key。", 
            value: "" 
        }
    ],

    modules: [
        {
            title: "🌍 全球热榜",
            functionName: "loadGlobalRankings",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "type",
                    title: "类型",
                    type: "enumeration",
                    defaultValue: "shows",
                    enumOptions: [
                        { title: "📺 剧集", value: "shows" },
                        { title: "🎬 电影", value: "movies" },
                        // 日历模式下混合显示较乱，建议分开，但保留选项
                        { title: "♾️ 混合 (剧+影)", value: "all" }
                    ]
                },
                {
                    name: "sort",
                    title: "排序依据",
                    type: "enumeration",
                    defaultValue: "trending",
                    enumOptions: [
                        { title: "🔥 正在热播 (Trending)", value: "trending" },
                        { title: "❤️ 最受欢迎 (Popular)", value: "popular" },
                        { title: "📅 按更新时间 (日历)", value: "update_date" },
                        { title: "🆕 按上映时间 (新片)", value: "release_date" },
                        { title: "👁️ 观看最多 (Played)", value: "played" },
                        { title: "🌟 最受期待 (Anticipated)", value: "anticipated" }
                    ]
                },
                {
                    name: "region",
                    title: "地区/语言筛选",
                    type: "enumeration",
                    defaultValue: "global",
                    enumOptions: [
                        { title: "🌍 全球 (不限)", value: "global" },
                        { title: "🇨🇳 中国大陆 (国产剧)", value: "cn" },
                        { title: "🇺🇸 美国", value: "us" },
                        { title: "🇰🇷 韩国", value: "kr" },
                        { title: "🇯🇵 日本", value: "jp" },
                        { title: "🇭🇰 香港", value: "hk" },
                        { title: "🇬🇧 英国", value: "gb" }
                    ]
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        }
    ]
};

// ==========================================
// 0. 常量与配置
// ==========================================

const DEFAULT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const API_BASE = "https://api.trakt.tv";

// ==========================================
// 1. 主逻辑
// ==========================================

async function loadGlobalRankings(params = {}) {
    const clientId = params.traktClientId || DEFAULT_CLIENT_ID;
    const type = params.type || "shows";
    const sort = params.sort || "trending";
    const region = params.region || "global";
    const page = parseInt(params.page) || 1;

    let rawItems = [];

    // --- 策略分流 ---
    // 策略 A: 日历模式 (按更新时间/上映时间)
    if (sort === "update_date" || sort === "release_date") {
        if (type === "all") {
            const [movies, shows] = await Promise.all([
                fetchTraktCalendar(clientId, "movies", sort, region, page),
                fetchTraktCalendar(clientId, "shows", sort, region, page)
            ]);
            // 简单合并
            rawItems = [...shows, ...movies].sort((a,b) => new Date(b.date) - new Date(a.date));
        } else {
            rawItems = await fetchTraktCalendar(clientId, type, sort, region, page);
        }
    } 
    // 策略 B: 常规榜单 (热播/流行)
    else {
        if (type === "all") {
            const [movies, shows] = await Promise.all([
                fetchTraktData(clientId, "movies", sort, region, page),
                fetchTraktData(clientId, "shows", sort, region, page)
            ]);
            // 交叉合并
            rawItems = [];
            const maxLen = Math.max(movies.length, shows.length);
            for (let i = 0; i < maxLen; i++) {
                if (movies[i]) rawItems.push(movies[i]);
                if (shows[i]) rawItems.push(shows[i]);
            }
        } else {
            rawItems = await fetchTraktData(clientId, type, sort, region, page);
        }
    }

    if (!rawItems || rawItems.length === 0) {
        return page === 1 ? [{ id: "empty", type: "text", title: "该分类下暂无数据" }] : [];
    }

    // --- 统一 TMDB 补全 (中文) ---
    const promises = rawItems.map(async (item) => {
        // 提取主体
        let subject = item.movie || item.show || item;
        // 兼容 Popular/日历 不同的结构
        if (!subject.ids && item.ids) subject = item;

        if (!subject?.ids?.tmdb) return null;

        // 确定类型
        let mediaType = "movie";
        // 日历数据带 episode 字段，或者 _type 标记
        if (item.episode || item.show || type === "shows" || item._type === "show") {
            mediaType = "tv";
        }

        // 构造副标题 (根据不同模式显示不同信息)
        let subInfo = "";
        
        if (sort === "update_date" && item.episode) {
            // 模式1: 显示 S01E02 • 2023-10-20
            const ep = item.episode;
            subInfo = `📺 S${ep.season}E${ep.episode} • ${formatDate(item.first_aired)}`;
        } else if (sort === "release_date") {
            // 模式2: 显示上映日期
            subInfo = `🆕 ${formatDate(item.first_aired || subject.released)}`;
        } else {
            // 模式3: 显示热度
            if (item.watchers) subInfo = `🔥 ${item.watchers} 人在看`;
            else if (item.watcher_count) subInfo = `👁️ ${item.watcher_count} 观看`;
            else subInfo = mediaType === "tv" ? "热门剧集" : "热门电影";
        }

        return await fetchTmdbDetail(subject.ids.tmdb, mediaType, subInfo, subject.title);
    });

    return (await Promise.all(promises)).filter(Boolean);
}

// ==========================================
// 2. 常规榜单 API (Trending/Popular)
// ==========================================

async function fetchTraktData(clientId, mediaType, sort, region, page) {
    let url = `${API_BASE}/${mediaType}/${sort}?limit=20&page=${page}`;
    
    // 地区 + 语言过滤逻辑
    // Trakt 的 countries=cn 只是指"在中国流行"，不一定是"国产"
    // 所以如果是 cn/hk/tw，我们强制加上 languages=zh
    
    let params = [];
    if (region && region !== "global") {
        params.push(`countries=${region}`);
        if (["cn", "hk", "tw"].includes(region)) {
            params.push(`languages=zh`);
        }
    }
    
    if (params.length > 0) {
        url += "&" + params.join("&");
    }

    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        const data = res.data || JSON.parse(res.body || "[]");
        return Array.isArray(data) ? data.map(d => ({ ...d, _type: mediaType === "shows" ? "show" : "movie" })) : [];
    } catch (e) { return []; }
}

// ==========================================
// 3. 日历 API (Update/Release)
// ==========================================

async function fetchTraktCalendar(clientId, mediaType, sort, region, page) {
    // 逻辑映射：
    // update_date -> /calendars/all/shows (最新播出)
    // release_date -> /calendars/all/shows/new (新剧首播) 或 /calendars/all/movies (电影上映)
    
    let endpoint = "";
    // 计算日期范围：为了模拟"最新"，我们取最近7天到未来7天，或者只看最近
    // Trakt 日历 endpoint: /start_date/days
    // 这里为了分页简单，我们使用 start_date = 今天 (Trakt 默认)
    // 注意：Trakt Calendar 分页逻辑不同，这里我们简化，仅获取近期数据
    
    // 修正：用户想要"最新更新"，通常指"昨天/今天/明天"
    // 我们取 date=今天, days=14 (两周)
    const startDate = new Date().toISOString().split('T')[0];
    
    if (sort === "update_date") {
        if (mediaType === "movies") endpoint = "/calendars/all/movies"; // 电影没有"更新"，只有上映
        else endpoint = "/calendars/all/shows"; // 所有剧集更新
    } else { // release_date
        if (mediaType === "movies") endpoint = "/calendars/all/movies";
        else endpoint = "/calendars/all/shows/new"; // 仅新剧首播
    }

    let url = `${API_BASE}${endpoint}/${startDate}/14?extended=full`; // 获取两周数据

    // 同样应用地区+语言过滤
    let params = [];
    if (region && region !== "global") {
        params.push(`countries=${region}`);
        if (["cn", "hk", "tw"].includes(region)) {
            params.push(`languages=zh`);
        }
    }
    if (params.length > 0) url += "&" + params.join("&");

    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        let data = res.data || JSON.parse(res.body || "[]");
        
        // 日历接口不直接支持 page 参数，我们需要自己在本地做切片模拟分页
        // 假设一页20个
        if (!Array.isArray(data)) return [];
        
        // 扁平化数据 (Trakt 日历按日期分组: { "2023-10-01": [...] })
        // 或者直接是数组 (取决于 endpoint，trakt 现在通常返回平铺数组)
        // 假设是平铺数组，直接切片
        // 重新排序：update_date 通常想看最新的，但 API 返回的是未来的
        // 我们这里不做复杂排序，按 Trakt 默认时间顺序
        
        const start = (page - 1) * 20;
        const paged = data.slice(start, start + 20);
        
        return paged.map(d => ({ ...d, _type: mediaType === "shows" ? "show" : "movie", date: d.first_aired }));
    } catch (e) { return []; }
}

// ==========================================
// 4. TMDB 中文补全 (核心体验)
// ==========================================

async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        const typeLabel = type === "tv" ? "剧集" : "电影";
        
        return {
            id: `trakt_${type}_${d.id}`, 
            tmdbId: d.id, 
            type: "tmdb", 
            mediaType: type,
            title: d.name || d.title || originalTitle, // 优先中文
            subTitle: `[${typeLabel}] ${subInfo}`, 
            genreTitle: year, 
            description: d.overview,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : ""
        };
    } catch (e) {
        return {
            id: `err_${id}`,
            title: originalTitle,
            subTitle: subInfo + " (暂无详情)",
            type: "text"
        };
    }
}

function formatDate(str) {
    if (!str) return "";
    return str.split("T")[0];
}
