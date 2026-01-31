WidgetMetadata = {
    id: "western_trends_hub",
    title: "欧美风向标|口碑与热度",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "聚合烂番茄(口碑)与流媒体平台(热度)，一站式掌握欧美影视动态。",
    version: "1.0.2",
    requiredVersion: "0.0.1",
    site: "https://www.rottentomatoes.com",

    modules: [
        {
            title: "欧美风向标",
            functionName: "loadWesternTrends",
            type: "video", // 统一为 video 类型
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "rt_movies_home",
                    enumOptions: [
                        { title: "🍅 烂番茄 - 流媒体热映", value: "rt_movies_home" },
                        { title: "🍅 烂番茄 - 院线 热映", value: "rt_movies_theater" },
                        { title: "🍅 烂番茄 - 热门 剧集", value: "rt_tv_popular" },
                        { title: "🍅 烂番茄 - 最新 剧集", value: "rt_tv_new" },
                        { title: "🍅 烂番茄 - 最佳流媒体", value: "rt_movies_best" },
                        { title: "🔥 Netflix Top10", value: "fp_netflix" },
                        { title: "🔥 HBO Top10", value: "fp_hbo" },
                        { title: "🔥 Disney+ Top10", value: "fp_disney" },
                        { title: "🔥 Apple TV+ Top10", value: "fp_apple" },
                        { title: "🔥 Amazon Top10", value: "fp_amazon" }
                    ]
                },
                {
                    name: "region",
                    title: "地区 (仅热度榜)",
                    type: "enumeration",
                    value: "united-states",
                    belongTo: { 
                        paramName: "source", 
                        value: ["fp_netflix", "fp_hbo", "fp_disney", "fp_apple", "fp_amazon"] 
                    },
                    enumOptions: [
                        { title: "美国", value: "united-states" },
                        { title: "英国", value: "united-kingdom" },
                        { title: "韩国", value: "south-korea" },
                        { title: "日本", value: "japan" },
                        { title: "台灣", value: "taiwan" },
                        { title: "香港", value: "hong-kong" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "类型 (仅热度榜)",
                    type: "enumeration",
                    value: "tv",
                    belongTo: { 
                        paramName: "source", 
                        value: ["fp_netflix", "fp_hbo", "fp_disney", "fp_apple", "fp_amazon"] 
                    },
                    enumOptions: [
                        { title: "剧集", value: "tv" },
                        { title: "电影", value: "movie" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用配置
// =========================================================================

const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10765: "科幻奇幻"
};

const RT_URLS = {
    "rt_movies_theater": "https://www.rottentomatoes.com/browse/movies_in_theaters/sort:popular?minTomato=75",
    "rt_movies_home": "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75",
    "rt_movies_best": "https://www.rottentomatoes.com/browse/movies_at_home/sort:critic_highest?minTomato=90",
    "rt_tv_popular": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular?minTomato=75",
    "rt_tv_new": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:newest?minTomato=75"
};

// =========================================================================
// 1. 入口分流
// =========================================================================

async function loadWesternTrends(params = {}) {
    const { source, page = 1 } = params;
    if (source.startsWith("rt_")) return await loadRottenTomatoes(source, page);
    if (source.startsWith("fp_")) {
        const platform = source.replace("fp_", ""); 
        return await loadFlixPatrol(platform, params.region, params.mediaType);
    }
}

// =========================================================================
// 2. 烂番茄逻辑
// =========================================================================

async function loadRottenTomatoes(listType, page) {
    const pageSize = 15;
    const allItems = await fetchRottenTomatoesList(listType);
    if (allItems.length === 0) return [];
    
    const start = (page - 1) * pageSize;
    const pageItems = allItems.slice(start, start + pageSize);
    const promises = pageItems.map((item, i) => searchTmdb(item, start + i + 1));
    return (await Promise.all(promises)).filter(Boolean);
}

async function fetchRottenTomatoesList(type) {
    const url = RT_URLS[type] || RT_URLS["rt_movies_home"];
    try {
        const res = await Widget.http.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const $ = Widget.html.load(res.data || "");
        const items = [];
        $('[data-qa="discovery-media-list-item"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('[data-qa="discovery-media-list-item-title"]').text().trim();
            if (!title) return;
            const scoreEl = $el.find('score-pairs');
            items.push({
                title: title,
                tomatoScore: scoreEl.attr('critics-score') || "",
                popcornScore: scoreEl.attr('audiencescore') || "",
                mediaType: type.includes("tv") ? "tv" : "movie"
            });
        });
        return items;
    } catch (e) { return []; }
}

async function searchTmdb(rtItem, rank) {
    const cleanTitle = rtItem.title.replace(/\s\(\d{4}\)$/, "");
    try {
        const res = await Widget.tmdb.get(`/search/${rtItem.mediaType}`, {
            params: { query: cleanTitle, language: "zh-CN" }
        });
        const match = (res.results || [])[0];
        if (!match) return null;

        let scores = [];
        if (rtItem.tomatoScore) scores.push(`🍅 ${rtItem.tomatoScore}%`);
        if (rtItem.popcornScore) scores.push(`🍿 ${rtItem.popcornScore}%`);
        
        return buildItem(match, rtItem.mediaType, {
            rank: rank,
            customSub: scores.join("  ") || "烂番茄认证",
            descPrefix: `原名: ${rtItem.title}`
        });
    } catch (e) { return null; }
}

// =========================================================================
// 3. FlixPatrol 逻辑
// =========================================================================

async function loadFlixPatrol(platform, region = "united-states", mediaType = "tv") {
    const titles = await fetchFlixPatrolData(platform, region, mediaType);
    if (titles.length === 0) return await fetchTmdbFallback(platform, region, mediaType);
    const promises = titles.slice(0, 10).map((title, i) => searchTmdbFP(title, mediaType, i + 1));
    return (await Promise.all(promises)).filter(Boolean);
}

async function fetchFlixPatrolData(platform, region, mediaType) {
    const url = `https://flixpatrol.com/top10/${platform}/${region}/`;
    try {
        const res = await Widget.http.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const $ = Widget.html.load(res.data || "");
        const titles = [];
        const sectionKeyword = mediaType === "movie" ? "Movies" : "TV";
        
        $('div.card').each((i, el) => {
            if ($(el).find('h2').text().includes(sectionKeyword)) {
                $(el).find('table tbody tr').each((idx, tr) => {
                    if (idx < 10) {
                        let t = $(tr).find('a.hover\\:underline').text().trim();
                        if (t) titles.push(t.replace(/\s\(\d{4}\)$/, '').trim());
                    }
                });
                return false;
            }
        });
        return titles;
    } catch (e) { return []; }
}

async function searchTmdbFP(title, mediaType, rank) {
    try {
        const res = await Widget.tmdb.get(`/search/${mediaType}`, {
            params: { query: title, language: "zh-CN" }
        });
        const match = (res.results || [])[0];
        if (!match) return null;
        return buildItem(match, mediaType, {
            rank: rank,
            customSub: `热度排行 #${rank}`,
            descPrefix: `榜单来源: FlixPatrol`
        });
    } catch (e) { return null; }
}

async function fetchTmdbFallback(platform, region, mediaType) {
    const map = { "netflix":"8", "disney":"337", "hbo":"1899", "apple-tv":"350", "amazon-prime":"119" };
    const regMap = { "united-states":"US", "united-kingdom":"GB", "south-korea":"KR", "japan":"JP", "taiwan":"TW", "hong-kong":"HK" };
    try {
        const res = await Widget.tmdb.get(`/discover/${mediaType}`, {
            params: {
                watch_region: regMap[region] || "US",
                with_watch_providers: map[platform] || "8",
                sort_by: "popularity.desc",
                language: "zh-CN"
            }
        });
        return (res.results || []).slice(0, 10).map((item, i) => buildItem(item, mediaType, { rank: i+1 }));
    } catch (e) { return []; }
}

// =========================================================================
// 4. 通用 Item 构建器 (统一 UI)
// =========================================================================

function buildItem(item, mediaType, { rank, customSub, descPrefix } = {}) {
    const dateStr = item.first_air_date || item.release_date || "";
    
    // 1. 类型文字 (不含年份)
    const genreNames = (item.genre_ids || [])
        .map(id => GENRE_MAP[id])
        .filter(Boolean)
        .slice(0, 2)
        .join(" / ");
    
    const titlePrefix = rank ? `${rank}. ` : "";

    return {
        id: String(item.id),
        tmdbId: item.id,
        type: "tmdb",
        mediaType: mediaType,
        
        title: `${titlePrefix}${item.name || item.title}`,
        
        // --- 核心修正：genreTitle 只留类型 ---
        genreTitle: genreNames || (mediaType === "movie" ? "电影" : "剧集"),
        
        // --- 核心修正：description 存入日期，适配竖版副标题 ---
        description: dateStr || customSub || "暂无信息",
        
        // 传递给内核的数据
        releaseDate: dateStr,
        subTitle: customSub, // 这个字段在部分 FW 版本中会显示在右上角或标签处
        
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        rating: item.vote_average
    };
}
