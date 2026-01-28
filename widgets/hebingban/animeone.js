WidgetMetadata = {
    id: "anime_omni_fix",
    title: "二次元全境聚合 (修复版)",
    author: "MakkaPakka",
    description: "修复 B 站数据获取问题，支持免 Key 和无限加载。",
    version: "2.1.0",
    requiredVersion: "0.0.1",
    site: "https://www.bilibili.com",

    modules: [
        {
            title: "动漫热榜",
            functionName: "loadAnimeHub",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "bili_hot",
                    enumOptions: [
                        { title: "📺 B站 - 番剧热播 (日漫)", value: "bili_hot" },
                        { title: "📺 B站 - 国创热播 (国漫)", value: "bili_cn" },
                        { title: "🌍 MAL - 历史 Top 100", value: "mal_top" },
                        { title: "🌍 MAL - 当前热播", value: "mal_airing" },
                        { title: "🌍 MAL - 人气最高", value: "mal_bypopularity" },
                        { title: "🌸 Bangumi - 每日放送", value: "bgm_calendar" }
                    ]
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

async function loadAnimeHub(params = {}) {
    const { source, page = 1 } = params;

    // === 1. Bilibili (修复逻辑) ===
    if (source.startsWith("bili_")) {
        const type = source === "bili_cn" ? 4 : 1; // 1=番剧, 4=国创
        return await fetchBilibiliRankSafe(type, page);
    }

    // === 2. MyAnimeList (Jikan API) ===
    if (source.startsWith("mal_")) {
        const type = source.replace("mal_", "");
        return await fetchMalData(type, page);
    }

    // === 3. Bangumi ===
    if (source.startsWith("bgm_")) {
        if (page > 1) return [];
        return await fetchBangumiCalendar();
    }
}

// ==========================================
// 逻辑 A: Bilibili (Rank API + 本地分页)
// ==========================================

async function fetchBilibiliRankSafe(type, page) {
    // 接口：PGC Web Rank List (一次返回 Top 50-100)
    // day=3 (三日排行), season_type=1/4
    const url = `https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`;
    
    try {
        const res = await Widget.http.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.bilibili.com/"
            }
        });

        // 兼容不同的数据结构 (data.result 或 data.data)
        const data = res.data || {};
        const fullList = data.result?.list || data.data?.list || [];

        if (fullList.length === 0) return [];

        // --- 本地分页逻辑 ---
        const pageSize = 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        
        // 如果请求的页码超出了范围，直接返回空
        if (start >= fullList.length) return [];

        const slicedList = fullList.slice(start, end);

        // 并发匹配 TMDB
        const promises = slicedList.map(async (item, index) => {
            const rank = start + index + 1;
            
            let finalItem = {
                id: `bili_${item.season_id}`,
                type: "tmdb",
                mediaType: "tv",
                title: `${rank}. ${item.title}`,
                subTitle: item.new_ep?.index_show || `播放: ${item.stat?.view || 0}`,
                posterPath: item.cover,
                description: item.desc || ""
            };

            // 尝试 TMDB 匹配 (免Key)
            const tmdbItem = await searchTmdbInternal(item.title);
            if (tmdbItem) {
                mergeTmdb(finalItem, tmdbItem);
                finalItem.title = `${rank}. ${tmdbItem.name || tmdbItem.title}`;
            }
            return finalItem;
        });

        return await Promise.all(promises);

    } catch (e) {
        return [{ id: "err", type: "text", title: "B站加载失败", subTitle: e.message }];
    }
}

// ==========================================
// 逻辑 B: MAL (Jikan)
// ==========================================

async function fetchMalData(filterType, page) {
    let url = `https://api.jikan.moe/v4/top/anime?page=${page}`;
    if (filterType !== "top") url += `&filter=${filterType}`;
    
    try {
        const res = await Widget.http.get(url);
        const list = (res.data || {}).data || [];
        if (list.length === 0) return [];

        const promises = list.map(async (item, index) => {
            const rank = (page - 1) * 25 + index + 1;
            const titleEn = item.title_english || item.title;
            
            let finalItem = {
                id: `mal_${item.mal_id}`,
                type: "tmdb",
                mediaType: "tv",
                title: `${rank}. ${titleEn}`,
                subTitle: `⭐ ${item.score} | ${item.year || ""}`,
                posterPath: item.images?.jpg?.large_image_url,
                description: item.synopsis
            };

            const tmdbItem = await searchTmdbBestMatch(titleEn, item.title_japanese);
            if (tmdbItem) {
                mergeTmdb(finalItem, tmdbItem);
                finalItem.title = `${rank}. ${tmdbItem.name || tmdbItem.title}`;
            }
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return []; }
}

// ==========================================
// 逻辑 C: Bangumi
// ==========================================

async function fetchBangumiCalendar() {
    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayIndex = new Date().getDay();
        const bgmDayId = dayIndex === 0 ? 7 : dayIndex;
        const todayData = data.find(d => d.weekday.id === bgmDayId);

        if (!todayData || !todayData.items) return [];

        const promises = todayData.items.map(async item => {
            const name = item.name_cn || item.name;
            let finalItem = {
                id: `bgm_${item.id}`, type: "tmdb", mediaType: "tv",
                title: name, subTitle: item.name, posterPath: item.images?.large
            };
            const tmdbItem = await searchTmdbBestMatch(name, item.name);
            if (tmdbItem) mergeTmdb(finalItem, tmdbItem);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return []; }
}

// ==========================================
// 工具: 免 Key TMDB
// ==========================================

async function searchTmdbInternal(query) {
    if (!query) return null;
    const cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    try {
        const res = await Widget.tmdb.get("/search/tv", {
            params: { query: cleanQuery, language: "zh-CN", page: 1 }
        });
        return (res.results || [])[0];
    } catch (e) { return null; }
}

async function searchTmdbBestMatch(query1, query2) {
    let res = await searchTmdbInternal(query1);
    if (!res && query2) res = await searchTmdbInternal(query2);
    return res;
}

function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    if (source.poster_path) target.posterPath = `https://image.tmdb.org/t/p/w500${source.poster_path}`;
    if (source.backdrop_path) target.backdropPath = `https://image.tmdb.org/t/p/w780${source.backdrop_path}`;
    target.rating = source.vote_average ? source.vote_average.toFixed(1) : target.rating;
    target.year = (source.first_air_date || "").substring(0, 4);
    if (source.overview) target.description = source.overview;
}
