WidgetMetadata = {
    id: "ultimate_media_hub_lite",
    title: "全球影视 & 分流聚合",
    author: "MakkaPakka",
    description: "集大成之作：Trakt全球榜 + 豆瓣高分榜 + 平台分流片库。",
    version: "1.1.6",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",
    
    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取海报、评分和类型标签。",
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
        {
            title: "🔥 全球热榜聚合",
            functionName: "loadTrendHub",
            type: "list", // 修正为 list 类型以支持 genreTitle
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "trakt_trending",
                    enumOptions: [
                        { title: "🌍 Trakt - 实时热播", value: "trakt_trending" },
                        { title: "🌍 Trakt - 最受欢迎", value: "trakt_popular" },
                        { title: "🌍 Trakt - 最受期待", value: "trakt_anticipated" },
                        { title: "🇨🇳 豆瓣 - 热门国产剧", value: "db_tv_cn" },
                        { title: "🇨🇳 豆瓣 - 热门综艺", value: "db_variety" },
                        { title: "🇨🇳 豆瓣 - 热门电影", value: "db_movie" },
                        { title: "🇺🇸 豆瓣 - 热门美剧", value: "db_tv_us" },
                        { title: "📺 B站 - 番剧热播", value: "bili_bgm" },
                        { title: "📺 B站 - 国创热播", value: "bili_cn" },
                        { title: "🌸 Bangumi - 每日放送", value: "bgm_daily" }
                    ]
                },
                {
                    name: "traktType",
                    title: "Trakt 类型",
                    type: "enumeration",
                    value: "shows",
                    belongTo: { paramName: "source", value: ["trakt_trending", "trakt_popular", "trakt_anticipated"] },
                    enumOptions: [ { title: "剧集", value: "shows" }, { title: "电影", value: "movies" } ]
                }
            ]
        },
        {
            title: "📺 平台分流片库",
            functionName: "loadPlatformMatrix",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "platformId",
                    title: "播出平台",
                    type: "enumeration",
                    value: "2007",
                    enumOptions: [
                        { title: "腾讯视频", value: "2007" },
                        { title: "爱奇艺", value: "1330" },
                        { title: "优酷", value: "1419" },
                        { title: "芒果TV", value: "1631" },
                        { title: "Bilibili", value: "1605" },
                        { title: "Netflix", value: "213" },
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
                        { title: "📺 电视剧", value: "tv_drama" },
                        { title: "🎤 综艺", value: "tv_variety" },
                        { title: "🐲 动漫", value: "tv_anime" },
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
// 0. 通用工具与字典
// =========================================================================
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

// TMDB 电影+剧集 全量类型映射
const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

// 辅助函数：将 ID 数组转为字符串 "剧情 / 科幻"
function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 3).join(" / ");
}

// 辅助函数：生成标准的 Forward Item
function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type,
        
        // UI 核心
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), // 关键：年份 • 类型
        subTitle: subTitle, // 关键：评分 或 热度数据
        
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        
        rating: rating,
        year: year
    };
}

// =========================================================================
// 1. 业务逻辑
// =========================================================================

async function loadTrendHub(params = {}) {
    const { apiKey, source, traktType = "shows" } = params;
    const traktClientId = params.traktClientId || DEFAULT_TRAKT_ID;
    if (!apiKey) return [{ id: "err", type: "text", title: "请填写 TMDB API Key" }];

    // --- Trakt ---
    if (source.startsWith("trakt_")) {
        const listType = source.replace("trakt_", ""); 
        const traktData = await fetchTraktData(traktType, listType, traktClientId);
        
        if (!traktData || traktData.length === 0) return await fetchTmdbFallback(traktType, apiKey);

        const promises = traktData.slice(0, 15).map(async (item, index) => {
            let subject = item.show || item.movie || item;
            // Trakt 独有的统计数据放在 subTitle
            let stats = listType === "trending" ? `🔥 ${item.watchers || 0} 人在看` : (listType === "anticipated" ? `❤️ ${item.list_count || 0} 人想看` : `No. ${index + 1}`);
            
            if (!subject || !subject.ids || !subject.ids.tmdb) return null;
            return await fetchTmdbDetail(subject.ids.tmdb, traktType === "shows" ? "tv" : "movie", apiKey, stats, subject.title);
        });
        return (await Promise.all(promises)).filter(Boolean);
    }

    // --- Douban ---
    if (source.startsWith("db_")) {
        let tag = "热门", type = "tv";
        if (source === "db_tv_cn") { tag = "国产剧"; type = "tv"; }
        else if (source === "db_variety") { tag = "综艺"; type = "tv"; }
        else if (source === "db_movie") { tag = "热门"; type = "movie"; }
        else if (source === "db_tv_us") { tag = "美剧"; type = "tv"; }
        return await fetchDoubanAndMap(tag, type, apiKey);
    }

    // --- Bilibili / Bangumi ---
    if (source.startsWith("bili_")) {
        const type = source === "bili_cn" ? 4 : 1; 
        return await fetchBilibiliRank(type, apiKey);
    }
    if (source === "bgm_daily") return await fetchBangumiDaily(apiKey);
}

async function loadPlatformMatrix(params = {}) {
    const { apiKey, platformId, category = "tv_drama", sort = "popularity.desc" } = params;
    if (!apiKey) return [{ id: "err", type: "text", title: "请填写 API Key" }];

    const foreignPlatforms = ["213", "2739", "49", "2552"];
    if (category === "movie" && !foreignPlatforms.includes(platformId)) {
        return [{ id: "empty", type: "text", title: "暂不支持国内平台电影", description: "请切换为剧集或国外平台" }];
    }

    if (category.startsWith("tv_")) {
        let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&sort_by=${sort}&page=1&include_adult=false&include_null_first_air_dates=false&with_networks=${platformId}`;
        if (category === "tv_anime") url += `&with_genres=16`;
        else if (category === "tv_variety") url += `&with_genres=10764|10767`;
        else if (category === "tv_drama") url += `&without_genres=16,10764,10767`;
        return await fetchTmdbDiscover(url, "tv");
    } else if (category === "movie") {
        const usMap = { "213":"8", "2739":"337", "49":"1899|15", "2552":"350" };
        const pid = usMap[platformId];
        let url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=zh-CN&sort_by=${sort}&page=1&include_adult=false&watch_region=US&with_watch_providers=${pid}`;
        return await fetchTmdbDiscover(url, "movie");
    }
}

// =========================================================================
// 2. 增强型数据获取 (Helpers)
// =========================================================================

// A. Discover 接口 (用于平台分流)
async function fetchTmdbDiscover(url, mediaType) {
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        if (!data.results || data.results.length === 0) return [{ id: "empty", type: "text", title: "暂无数据" }];
        
        return data.results.map(item => {
            const year = (item.first_air_date || item.release_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            
            return buildItem({
                id: item.id,
                tmdbId: item.id,
                type: mediaType,
                title: item.name || item.title,
                year: year,
                poster: item.poster_path,
                backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1) || "0.0",
                genreText: genreText,
                subTitle: `⭐ ${item.vote_average?.toFixed(1)}`, // 平台模式下显示评分
                desc: item.overview
            });
        });
    } catch (e) { return [{ id: "err", type: "text", title: "加载失败" }]; }
}

// B. Detail 接口 (用于 Trakt)
async function fetchTmdbDetail(id, type, key, stats, title) {
    try {
        const r = await Widget.http.get(`https://api.themoviedb.org/3/${type}/${id}?api_key=${key}&language=zh-CN`);
        const d = r.data;
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        
        // 详情接口返回的 genres 是对象数组，需特殊处理
        const genreText = (d.genres || []).map(g => g.name).slice(0, 3).join(" / ");

        return buildItem({
            id: d.id,
            tmdbId: d.id,
            type: type,
            title: d.name || d.title || title,
            year: year,
            poster: d.poster_path,
            backdrop: d.backdrop_path,
            rating: d.vote_average?.toFixed(1),
            genreText: genreText,
            subTitle: stats, // Trakt 模式下显示 "xxx人在线"
            desc: d.overview
        });
    } catch (e) { return null; }
}

// C. 搜索接口 (用于 豆瓣/B站/Bangumi 映射)
async function searchTmdb(query, type, key) {
    const q = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    try {
        const r = await Widget.http.get(`https://api.themoviedb.org/3/search/${type}?api_key=${key}&query=${encodeURIComponent(q)}&language=zh-CN`);
        return (r.data?.results || [])[0];
    } catch (e) { return null; }
}

// D. 合并函数 (将搜索到的 TMDB 信息注入到 item 中)
function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    target.posterPath = source.poster_path ? `https://image.tmdb.org/t/p/w500${source.poster_path}` : target.posterPath;
    target.backdropPath = source.backdrop_path ? `https://image.tmdb.org/t/p/w780${source.backdrop_path}` : "";
    
    // 注入增强信息
    const year = (source.first_air_date || source.release_date || "").substring(0, 4);
    const genreText = getGenreText(source.genre_ids);
    
    target.genreTitle = [year, genreText].filter(Boolean).join(" • "); // 核心：注入 genreTitle
    target.description = source.overview;
    target.rating = source.vote_average?.toFixed(1);
    
    // 如果原 subTitle 是空的，或者只是简单的评分，可以覆盖
    if (!target.subTitle || target.subTitle.includes("豆瓣")) {
        // 保留原豆瓣评分，或增加 TMDB 评分？
        // 这里保持原样比较好，因为豆瓣评分是核心价值
    }
}

// =========================================================================
// 第三方源获取逻辑 (保持原样)
// =========================================================================
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
        if (list.length === 0) return [{ id: "empty", type: "text", title: "暂无数据" }];
        
        const promises = list.map(async (item, i) => {
            // 初始对象
            let finalItem = { 
                id: `db_${item.id}`, type: "tmdb", mediaType: type, 
                title: `${i+1}. ${item.title}`, 
                subTitle: `豆瓣 ${item.rate}`, // 初始 subTitle
                posterPath: item.cover 
            };
            const tmdb = await searchTmdb(item.title, type, apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb); // 合并 TMDB 信息，包括 genreTitle
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
            let finalItem = { 
                id: `bili_${i}`, type: "tmdb", mediaType: "tv", 
                title: `${i+1}. ${item.title}`, 
                subTitle: item.new_ep?.index_show || "热播中", 
                posterPath: item.cover 
            };
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
            let finalItem = { 
                id: `bgm_${item.id}`, type: "tmdb", mediaType: "tv", 
                title: name, 
                subTitle: item.name, 
                posterPath: item.images?.large 
            };
            const tmdb = await searchTmdb(name, "tv", apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return []; }
}

async function fetchTmdbFallback(traktType, apiKey) {
    const type = traktType === "shows" ? "tv" : "movie";
    const url = `https://api.themoviedb.org/3/trending/${type}/day?api_key=${apiKey}&language=zh-CN`;
    try {
        const r = await Widget.http.get(url);
        return (r.data?.results || []).slice(0, 15).map(item => {
            const year = (item.first_air_date || item.release_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            return buildItem({
                id: item.id, tmdbId: item.id, type: type,
                title: item.name || item.title,
                year: year,
                genreText: genreText,
                poster: item.poster_path,
                subTitle: "TMDB Trending",
                rating: item.vote_average?.toFixed(1)
            });
        });
    } catch(e) { return []; }
}
