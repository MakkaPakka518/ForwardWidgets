WidgetMetadata = {
    id: "ultimate_media_hub_lite",
    title: "全球影视 & 分流聚合",
    author: "MakkaPakka",
    description: "集大成之作：Trakt全球榜 + 豆瓣高分榜 + 平台分流片库。",
    version: "1.1.5",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",
    
    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取所有海报和元数据。",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "Trakt 榜单专用，不填则使用公共 ID。",
            value: ""
        }
    ],
    modules: [
        // ===========================================
        // 模块 1: 趋势榜单 (移除失效的国漫选项)
        // ===========================================
        {
            title: "🔥 全球热榜聚合",
            functionName: "loadTrendHub",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "trakt_trending",
                    enumOptions: [
                        // --- Trakt 国际 ---
                        { title: "🌍 Trakt - 实时热播 (Trending)", value: "trakt_trending" },
                        { title: "🌍 Trakt - 最受欢迎 (Popular)", value: "trakt_popular" },
                        { title: "🌍 Trakt - 最受期待 (Anticipated)", value: "trakt_anticipated" },
                        // --- 豆瓣 国内 ---
                        { title: "🇨🇳 豆瓣 - 热门国产剧", value: "db_tv_cn" },
                        { title: "🇨🇳 豆瓣 - 热门综艺", value: "db_variety" },
                        { title: "🇨🇳 豆瓣 - 热门电影", value: "db_movie" },
                        { title: "🇺🇸 豆瓣 - 热门美剧", value: "db_tv_us" },
                        // --- 二次元 ---
                        { title: "📺 B站 - 番剧热播 (日漫)", value: "bili_bgm" },
                        { title: "📺 B站 - 国创热播 (国漫)", value: "bili_cn" },
                        { title: "🌸 Bangumi - 每日放送", value: "bgm_daily" },
                        // ❌ 已删除：豆瓣国漫/日漫 (因数据不稳定)
                    ]
                },
                // Trakt 辅助参数
                {
                    name: "traktType",
                    title: "Trakt 类型",
                    type: "enumeration",
                    value: "shows",
                    belongTo: {
                        paramName: "source",
                        value: ["trakt_trending", "trakt_popular", "trakt_anticipated"]
                    },
                    enumOptions: [
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                }
            ]
        },
        // ===========================================
        // 模块 2: 平台分流 (优化电影逻辑)
        // ===========================================
        {
            title: "📺 平台分流片库",
            functionName: "loadPlatformMatrix",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "platformId",
                    title: "播出平台",
                    type: "enumeration",
                    value: "2007",
                    enumOptions: [
                        { title: "腾讯视频 (Tencent)", value: "2007" },
                        { title: "爱奇艺 (iQIYI)", value: "1330" },
                        { title: "优酷 (Youku)", value: "1419" },
                        { title: "芒果TV (Mango)", value: "1631" },
                        { title: "Bilibili (B站)", value: "1605" },
                        { title: "Netflix (网飞)", value: "213" },
                        { title: "Disney+", value: "2739" },
                        { title: "HBO", value: "49" },
                        { title: "Apple TV+", value: "2552" }
                    ]
                },
                {
                    name: "category",
                    title: "内容分类",
                    type: "enumeration",
                    value: "tv_drama",
                    enumOptions: [
                        { title: "📺 电视剧 (排除综艺)", value: "tv_drama" },
                        { title: "🎤 综艺 (Reality/Talk)", value: "tv_variety" },
                        { title: "🐲 动漫 (Animation)", value: "tv_anime" },
                        // 电影选项逻辑修改：在代码层过滤，这里保留选项但加标注
                        { title: "🎬 电影 (仅限国外平台)", value: "movie" } 
                    ]
                },
                {
                    name: "sort",
                    title: "排序",
                    type: "enumeration",
                    value: "popularity.desc",
                    enumOptions: [
                        { title: "🔥 热度最高", value: "popularity.desc" },
                        { title: "📅 最新首播", value: "first_air_date.desc" },
                        { title: "⭐ 评分最高", value: "vote_average.desc" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 核心逻辑 1: 趋势榜单聚合
// =========================================================================
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTrendHub(params = {}) {
    const { apiKey, source, traktType = "shows" } = params;
    const traktClientId = params.traktClientId || DEFAULT_TRAKT_ID;
    if (!apiKey) return [{ id: "err", type: "text", title: "请填写 TMDB API Key" }];

    // --- A. Trakt ---
    if (source.startsWith("trakt_")) {
        const listType = source.replace("trakt_", ""); 
        const traktData = await fetchTraktData(traktType, listType, traktClientId);
        
        if (!traktData || traktData.length === 0) return await fetchTmdbFallback(traktType, apiKey);

        const promises = traktData.slice(0, 15).map(async (item, index) => {
            let subject = item.show || item.movie || item;
            let stats = listType === "trending" ? `🔥 ${item.watchers || 0} 人在看` : (listType === "anticipated" ? `❤️ ${item.list_count || 0} 人想看` : `No. ${index + 1}`);
            if (!subject || !subject.ids || !subject.ids.tmdb) return null;
            return await fetchTmdbDetail(subject.ids.tmdb, traktType === "shows" ? "tv" : "movie", apiKey, stats, subject.title);
        });
        return (await Promise.all(promises)).filter(Boolean);
    }

    // --- B. Douban ---
    if (source.startsWith("db_")) {
        let tag = "热门";
        let type = "tv";
        if (source === "db_tv_cn") { tag = "国产剧"; type = "tv"; }
        else if (source === "db_variety") { tag = "综艺"; type = "tv"; }
        else if (source === "db_movie") { tag = "热门"; type = "movie"; }
        else if (source === "db_tv_us") { tag = "美剧"; type = "tv"; }
        return await fetchDoubanAndMap(tag, type, apiKey);
    }

    // --- C. Bilibili / Bangumi ---
    if (source.startsWith("bili_")) {
        const type = source === "bili_cn" ? 4 : 1; 
        return await fetchBilibiliRank(type, apiKey);
    }
    if (source === "bgm_daily") return await fetchBangumiDaily(apiKey);
}

// =========================================================================
// 核心逻辑 2: 平台分流矩阵 (修复电影无数据问题)
// =========================================================================
async function loadPlatformMatrix(params = {}) {
    const { apiKey, platformId, category = "tv_drama", sort = "popularity.desc" } = params;
    if (!apiKey) return [{ id: "err", type: "text", title: "请填写 API Key" }];

    // 关键修正：如果选了国内平台 + 电影，直接返回提示，不再请求空数据
    const foreignPlatforms = ["213", "2739", "49", "2552"]; // Netflix, Disney+, HBO, AppleTV
    if (category === "movie" && !foreignPlatforms.includes(platformId)) {
        return [{ 
            id: "empty_cn_movie", 
            type: "text", 
            title: "暂不支持国内平台电影", 
            description: "TMDB 对国内平台电影源支持不佳，请切换为剧集或国外平台" 
        }];
    }

    // --- 1. TV 模式 ---
    if (category.startsWith("tv_")) {
        let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&sort_by=${sort}&page=1&include_adult=false&include_null_first_air_dates=false&with_networks=${platformId}`;
        
        if (category === "tv_anime") url += `&with_genres=16`;
        else if (category === "tv_variety") url += `&with_genres=10764|10767`;
        else if (category === "tv_drama") url += `&without_genres=16,10764,10767`;
        
        return await fetchTmdbDiscover(url, "tv");
    } 
    
    // --- 2. Movie 模式 (仅限国外平台) ---
    else if (category === "movie") {
        const usMap = { "213":"8", "2739":"337", "49":"1899|15", "2552":"350" };
        const pid = usMap[platformId];
        
        let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=zh-CN&sort_by=${sort}&page=1&include_adult=false&watch_region=US&with_watch_providers=${pid}`;
        return await fetchTmdbDiscover(url, "movie");
    }
}

// =========================================================================
// Helpers (保持原样，优化空值处理)
// =========================================================================
async function fetchTmdbDiscover(url, mediaType) {
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        if (!data.results || data.results.length === 0) return [{ id: "empty", type: "text", title: "暂无数据" }];
        return data.results.map(item => ({
            id: String(item.id), tmdbId: parseInt(item.id), type: "tmdb", mediaType: mediaType,
            title: item.name || item.title, subTitle: `⭐ ${item.vote_average?.toFixed(1) || '0.0'}`,
            description: item.overview, posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            year: (item.first_air_date || item.release_date || "").substring(0, 4), rating: item.vote_average?.toFixed(1)
        }));
    } catch (e) { return [{ id: "err", type: "text", title: "加载失败" }]; }
}

async function fetchTraktData(type, list, id) {
    try {
        const res = await Widget.http.get(`https://api.trakt.tv/${type}/${list}?limit=15`, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": id }
        });
        return res.data || [];
    } catch (e) { return []; }
}

async function fetchDoubanAndMap(tag, type, apiKey) {
    try {
        const res = await Widget.http.get(`https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=20&page_start=0`, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" }
        });
        const list = (res.data || {}).subjects || [];
        if (list.length === 0) return [{ id: "empty", type: "text", title: "豆瓣暂无数据" }];
        
        const promises = list.map(async (item, i) => {
            let finalItem = { id: `db_${item.id}`, type: "tmdb", mediaType: type, title: `${i+1}. ${item.title}`, subTitle: `豆瓣 ${item.rate}`, posterPath: item.cover };
            const tmdb = await searchTmdb(item.title, type, apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "豆瓣连接失败" }]; }
}

async function fetchBilibiliRank(type, apiKey) {
    try {
        const res = await Widget.http.get(`https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`);
        const list = (res.data?.result?.list || res.data?.data?.list || []).slice(0, 15);
        if (list.length === 0) return [{ id: "empty", type: "text", title: "B站无数据" }];
        
        const promises = list.map(async (item, i) => {
            let finalItem = { id: `bili_${i}`, type: "tmdb", mediaType: "tv", title: `${i+1}. ${item.title}`, subTitle: item.new_ep?.index_show, posterPath: item.cover };
            const tmdb = await searchTmdb(item.title, "tv", apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "B站连接失败" }]; }
}

async function fetchBangumiDaily(apiKey) {
    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayId = (new Date().getDay() || 7);
        const items = data.find(d => d.weekday.id === dayId)?.items || [];
        
        const promises = items.map(async item => {
            const name = item.name_cn || item.name;
            let finalItem = { id: `bgm_${item.id}`, type: "tmdb", mediaType: "tv", title: name, subTitle: item.name, posterPath: item.images?.large };
            const tmdb = await searchTmdb(name, "tv", apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return []; }
}

async function searchTmdb(query, type, key) {
    const q = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    try {
        const r = await Widget.http.get(`https://api.themoviedb.org/3/search/${type}?api_key=${key}&query=${encodeURIComponent(q)}&language=zh-CN`);
        return (r.data?.results || [])[0];
    } catch (e) { return null; }
}

function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    target.posterPath = source.poster_path ? `https://image.tmdb.org/t/p/w500${source.poster_path}` : target.posterPath;
    target.backdropPath = source.backdrop_path ? `https://image.tmdb.org/t/p/w780${source.backdrop_path}` : "";
    target.year = (source.first_air_date || source.release_date || "").substring(0, 4);
    target.description = source.overview;
    target.rating = source.vote_average?.toFixed(1);
}

async function fetchTmdbDetail(id, type, key, stats, title) {
    try {
        const r = await Widget.http.get(`https://api.themoviedb.org/3/${type}/${id}?api_key=${key}&language=zh-CN`);
        const d = r.data;
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || title, subTitle: stats, description: d.overview,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            rating: d.vote_average?.toFixed(1), year: (d.first_air_date || d.release_date || "").substring(0, 4)
        };
    } catch (e) { return null; }
}

async function fetchTmdbFallback(traktType, apiKey) {
    const type = traktType === "shows" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/trending/${type}/day?api_key=${apiKey}&language=zh-CN`;
    try {
        const r = await Widget.http.get(url);
        return (r.data?.results || []).slice(0, 15).map(d => ({
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title, subTitle: "TMDB Trending",
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : ""
        }));
    } catch(e) { return []; }
}
